import { createElement, ReactNode } from "react";
import { EditorModel, type EditorStateBase } from "../base/EditorModel";
import type { EditorDescriptor } from "../../../shared/persistence";
import { TComponentState } from "../../core/state/state";
import { MemoryIcon } from "../../theme/icons";
import { MEMORY_ICON_COLOR } from "../../theme/palette-colors";
import {
    McpConnectionManager,
    McpConnectionStatus,
} from "../mcp-inspector/McpConnectionManager";
import { api } from "../../../ipc/renderer/api";
import ipcRendererEvents from "../../../ipc/renderer/renderer-events";
import { ui } from "../../api/ui";
import { fs } from "../../api/fs";
import { settings } from "../../api/settings";
import { fpJoin, fpBasename } from "../../core/utils/file-path";
import { showProgress } from "../../uikit";
import { mnemeStatusModel } from "../../api/mneme-status";
import {
    WikiStatus,
    WikiRootConfig,
    WikiReindexProgress,
    StaleIndexEntry,
    parseToolResult,
    isModelReady,
    isStatusBusy,
} from "./mnemeTypes";

export type MnemeConfigTab = "roots" | "index" | "model";

export interface MnemeConfigEditorState extends EditorStateBase {
    type: "mnemeConfigPage";
    tab: MnemeConfigTab;
    /** Live MCP connection state to the Mneme sidecar. */
    connectionStatus: McpConnectionStatus;
    errorMessage: string;
    /** Whether the sidecar is reported running by the main process. */
    running: boolean;
    url: string;
    /** Last `wiki_status` snapshot (null until first refresh). */
    status: WikiStatus | null;
    /** Per-root reindex progress, keyed by root name (and `__all__` for a
     *  whole-index reindex). Presence indicates an active reindex. */
    reindexProgress: Record<string, WikiReindexProgress>;
    /** Per-root include/ignore config (lazily loaded when Filters expand). */
    rootConfigs: Record<string, WikiRootConfig>;
    /** Per-root on-disk index inventory for the Index tab. */
    staleIndexes: Record<string, StaleIndexEntry[]>;
    /** Generic busy flag for a blocking refresh. */
    refreshing: boolean;
}

export const getDefaultMnemeConfigEditorState = (): MnemeConfigEditorState => ({
    id: crypto.randomUUID(),
    title: "Mneme",
    modified: false,
    type: "mnemeConfigPage",
    editor: "mneme-config",
    tab: "roots",
    connectionStatus: "disconnected",
    errorMessage: "",
    running: false,
    url: "",
    status: null,
    reindexProgress: {},
    rootConfigs: {},
    staleIndexes: {},
    refreshing: false,
});

const REINDEX_ALL_KEY = "__all__";

export class MnemeConfigEditorModel extends EditorModel<MnemeConfigEditorState> {
    readonly editorId = "mneme-config";
    noLanguage = true;
    skipSave = true;

    readonly connection = new McpConnectionManager();
    private _statusSub: { unsubscribe: () => void } | null = null;
    private _aborts: Record<string, AbortController> = {};

    /** Background-job status poll (US-669): while any root is indexing or the
     *  model is downloading, re-`wiki_status` on a timer so the editor shows
     *  live progress without holding the originating MCP call open. */
    private _pollTimer: ReturnType<typeof setInterval> | null = null;
    /** Keep polling until at least this time (ms epoch) even if status looks
     *  idle — covers the gap after add-root where the background pass is still
     *  walking the tree (phase `idle`) before it flips to `scanning`. */
    private _pollUntil = 0;
    private static readonly POLL_MS = 1500;
    private static readonly POLL_GRACE_MS = 30000;

    constructor(state: TComponentState<MnemeConfigEditorState>) {
        super(state);
        this.connection.onStatusChange = (status, error) => {
            this.state.update((s) => {
                s.connectionStatus = status;
                s.errorMessage = error || "";
            });
            if (status === "connected") {
                this.refreshStatus();
            } else if (status === "disconnected" || status === "error") {
                this.stopPolling();
                this.state.update((s) => {
                    s.status = null;
                    s.reindexProgress = {};
                    s.rootConfigs = {};
                    s.staleIndexes = {};
                });
            }
        };
        // Auto-connect on open (config monitor; safe to fire-and-forget).
        void this.initConnection();
        this._statusSub = ipcRendererEvents.eMnemeStatusChanged.subscribe((s) => {
            this.applySidecarStatus(!!s.running, s.url || "");
        });
    }

    setTab = (tab: MnemeConfigTab): void => {
        this.state.update((s) => { s.tab = tab; });
        if (tab === "index") void this.loadIndexInventory();
    };

    private async initConnection(): Promise<void> {
        try {
            const s = await api.getMnemeStatus();
            this.applySidecarStatus(!!s.running, s.url || "");
        } catch (err) {
            this.state.update((st) => {
                st.errorMessage = (err as Error)?.message || String(err);
            });
        }
    }

    private applySidecarStatus(running: boolean, url: string): void {
        this.state.update((s) => {
            s.running = running;
            s.url = url;
        });
        if (running && url) {
            const current = this.connection.getClient();
            if (!current) {
                void this.connection.connect({
                    name: "Mneme",
                    transport: "http",
                    url,
                });
            }
        } else {
            void this.connection.dispose();
            this.state.update((s) => {
                s.connectionStatus = "disconnected";
                s.status = null;
            });
        }
    }

    /** Reconnect after a manual stop/start or transient drop. */
    reconnect = async (): Promise<void> => {
        const s = await api.getMnemeStatus();
        this.applySidecarStatus(!!s.running, s.url || "");
    };

    /** Restart the Mneme sidecar process (recovers from a wedged MCP session or
     *  a crash) and reconnect. */
    restartMneme = async (): Promise<void> => {
        try {
            const port = settings.get("mneme.port") as number | undefined;
            const status = await showProgress(api.restartMneme(port), "Restarting Mneme…");
            this.applySidecarStatus(!!status.running, status.url || "");
            mnemeStatusModel.refresh();
            if (status.running) {
                ui.notify("Mneme restarted", "success");
            } else {
                ui.notify(`Mneme failed to restart: ${status.error ?? "unknown error"}`, "error");
            }
        } catch (err) {
            ui.notify(`Restart failed: ${(err as Error)?.message || err}`, "error");
        }
    };

    /** Fetch `wiki_status`. `silent` (used by the background poll) skips the
     *  `refreshing` flag so the timer-driven refresh doesn't flicker the UI. */
    refreshStatus = async (silent = false): Promise<void> => {
        const client = this.connection.getClient();
        if (!client) return;
        if (!silent) this.state.update((s) => { s.refreshing = true; });
        try {
            const result = await client.callTool({ name: "wiki_status", arguments: {} });
            const status = parseToolResult<WikiStatus>(result);
            this.state.update((s) => { s.status = status; });
            this.syncPolling();
        } catch (err) {
            if (!silent) ui.notify(`Mneme status failed: ${(err as Error)?.message || err}`, "error");
        } finally {
            if (!silent) this.state.update((s) => { s.refreshing = false; });
        }
    };

    /** Force the poll loop to run for a grace window after kicking off a
     *  background job (add-root / model download), before its progress shows. */
    private kickPolling(): void {
        this._pollUntil = Date.now() + MnemeConfigEditorModel.POLL_GRACE_MS;
        this.startPolling();
    }

    /** Start/stop the poll loop based on whether a background job is active (or
     *  a recent kick's grace window is still open). Called after every status
     *  refresh so the loop self-terminates when everything goes idle. */
    private syncPolling(): void {
        const connected = this.state.get().connectionStatus === "connected";
        const busy = isStatusBusy(this.state.get().status) || Date.now() < this._pollUntil;
        if (connected && busy) {
            this.startPolling();
        } else {
            this.stopPolling();
        }
    }

    private startPolling(): void {
        if (this._pollTimer) return;
        this._pollTimer = setInterval(() => { void this.pollTick(); }, MnemeConfigEditorModel.POLL_MS);
    }

    private stopPolling(): void {
        if (this._pollTimer) {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
    }

    private async pollTick(): Promise<void> {
        if (this.state.get().connectionStatus !== "connected" || !this.connection.getClient()) {
            this.stopPolling();
            return;
        }
        await this.refreshStatus(true); // sets status, then syncPolling() decides continue/stop
    }

    addRoot = async (): Promise<void> => {
        const picked = await fs.showFolderDialog({ title: "Add wiki root folder" });
        const folder = picked?.[0];
        if (!folder) return;

        // Mneme derives the root name from the folder's last segment, which
        // collides for same-named folders (…/personal/wiki vs …/work/wiki) and
        // is then rejected as a duplicate. Prompt for a unique name.
        const { showInputDialog } = await import("../../ui/dialogs/InputDialog");
        const res = await showInputDialog({
            title: "Add root",
            message: "Root name — must be unique; no spaces, '/', or '\\':",
            value: fpBasename(folder),
            selectAll: true,
            buttons: ["Add", "Cancel"],
            defaultButton: "Add",
        });
        if (!res || res.button !== "Add") return;
        const name = res.value.trim();
        if (!name) return;
        if (/[\s/\\]/.test(name)) {
            ui.notify("Root name must not contain spaces, '/', or '\\'.", "error");
            return;
        }

        const client = this.connection.getClient();
        if (!client) return;
        try {
            // Returns immediately — Mneme indexes the new root in the background
            // (US-669). Poll wiki_status so the per-root progress bar fills in.
            await client.callTool({ name: "wiki_add_root", arguments: { folder, name } });
            await this.refreshStatus();
            mnemeStatusModel.refresh();
            this.kickPolling();
            ui.notify("Root added — indexing in background", "success");
        } catch (err) {
            ui.notify(`Add root failed: ${(err as Error)?.message || err}`, "error");
        }
    };

    removeRoot = async (root: string): Promise<void> => {
        const choice = await this.confirm(
            "Remove root",
            `Remove root "${root}"? The on-disk .mneme index folder is left in place.`,
            "Remove",
        );
        if (!choice) return;
        const client = this.connection.getClient();
        if (!client) return;
        try {
            await client.callTool({ name: "wiki_remove_root", arguments: { root } });
            await this.refreshStatus();
            ui.notify(`Root "${root}" removed`, "success");
        } catch (err) {
            ui.notify(`Remove root failed: ${(err as Error)?.message || err}`, "error");
        }
    };

    /** Reindex a root (`root` = its name) or the whole index (`root` omitted). */
    reindex = async (root?: string): Promise<void> => {
        const client = this.connection.getClient();
        if (!client) return;
        const key = root ?? REINDEX_ALL_KEY;
        if (this._aborts[key]) return; // already running
        const abort = new AbortController();
        this._aborts[key] = abort;
        this.setProgress(key, { phase: "scanning", processed: 0, total: 0 });
        try {
            await client.callTool(
                { name: "wiki_reindex", arguments: root ? { path: root } : {} },
                undefined,
                {
                    signal: abort.signal,
                    onprogress: (p: { progress?: number; total?: number; message?: string }) => {
                        const { rootName, phase } = parseProgressMessage(p.message);
                        const target = rootName ?? key;
                        this.setProgress(target, {
                            phase: phase || "embedding",
                            processed: p.progress ?? 0,
                            total: p.total ?? 0,
                        });
                    },
                },
            );
            await this.refreshStatus();
            mnemeStatusModel.refresh();
            ui.notify(root ? `Reindexed "${root}"` : "Reindex complete", "success");
        } catch (err) {
            const aborted = abort.signal.aborted;
            if (aborted) {
                ui.notify("Reindex cancelled", "info");
                await this.refreshStatus();
            } else {
                ui.notify(`Reindex failed: ${(err as Error)?.message || err}`, "error");
            }
        } finally {
            delete this._aborts[key];
            this.clearProgress(key);
            // Clear any per-root progress rows raised by a reindex-all run.
            if (key === REINDEX_ALL_KEY) {
                this.state.update((s) => { s.reindexProgress = {}; });
            }
        }
    };

    cancelReindex = (root?: string): void => {
        const key = root ?? REINDEX_ALL_KEY;
        this._aborts[key]?.abort();
    };

    private setProgress(key: string, p: WikiReindexProgress): void {
        this.state.update((s) => { s.reindexProgress = { ...s.reindexProgress, [key]: p }; });
    }
    private clearProgress(key: string): void {
        this.state.update((s) => {
            const next = { ...s.reindexProgress };
            delete next[key];
            s.reindexProgress = next;
        });
    }

    // ── Per-root filters (wiki_root_config — US-668) ──────────────────────

    getRootConfig = async (root: string): Promise<void> => {
        const client = this.connection.getClient();
        if (!client) return;
        try {
            const result = await client.callTool({ name: "wiki_root_config", arguments: { root } });
            const cfg = parseToolResult<WikiRootConfig>(result);
            if (cfg) {
                this.state.update((s) => { s.rootConfigs = { ...s.rootConfigs, [root]: cfg }; });
            }
        } catch (err) {
            ui.notify(`Read filters failed: ${(err as Error)?.message || err}`, "error");
        }
    };

    setRootConfig = async (root: string, include: string[], ignore: string[]): Promise<void> => {
        const client = this.connection.getClient();
        if (!client) return;
        try {
            const result = await showProgress(
                client.callTool({
                    name: "wiki_root_config",
                    arguments: { root, include, ignore },
                }),
                "Applying filters — reindexing…",
            );
            const cfg = parseToolResult<WikiRootConfig>(result);
            if (cfg) {
                this.state.update((s) => { s.rootConfigs = { ...s.rootConfigs, [root]: cfg }; });
            }
            await this.refreshStatus();
            ui.notify("Filters applied", "success");
        } catch (err) {
            ui.notify(`Apply filters failed: ${(err as Error)?.message || err}`, "error");
        }
    };

    // ── Model ─────────────────────────────────────────────────────────────

    updateModel = async (): Promise<void> => {
        const client = this.connection.getClient();
        if (!client) return;
        try {
            // Returns immediately — Mneme downloads in the background (US-669).
            // Poll wiki_status so the Model panel's download bar fills in.
            await client.callTool({ name: "wiki_model_update", arguments: {} });
            await this.refreshStatus();
            mnemeStatusModel.refresh();
            this.kickPolling();
            const dl = this.state.get().status?.model?.download?.phase;
            if (dl === "downloading" || dl === "verifying") {
                ui.notify("Model download started", "info");
            } else if (this.modelReady) {
                ui.notify("Model is up to date", "success");
            }
        } catch (err) {
            ui.notify(`Model update failed: ${(err as Error)?.message || err}`, "error");
        }
    };

    // ── Index inventory (app.fs walk + wiki_index_delete) ─────────────────

    loadIndexInventory = async (): Promise<void> => {
        const status = this.state.get().status;
        if (!status) return;
        const result: Record<string, StaleIndexEntry[]> = {};
        for (const root of status.roots) {
            result[root.name] = await this.walkRootIndexes(root.folder, root.indexPath);
        }
        this.state.update((s) => { s.staleIndexes = result; });
    };

    private async walkRootIndexes(folder: string, activePath: string): Promise<StaleIndexEntry[]> {
        const out: StaleIndexEntry[] = [];
        const mnemeDir = fpJoin(folder, ".mneme");
        try {
            const modelDirs = await fs.listDirWithTypes(mnemeDir);
            for (const md of modelDirs) {
                if (!md.isDirectory) continue;
                const modelId = md.name; // "{model}-{precision}"
                const modelDirPath = fpJoin(mnemeDir, modelId);
                const files = await fs.listDir(modelDirPath);
                for (const file of files) {
                    const match = /^index-v(\d+)\.db$/.exec(file);
                    if (!match) continue;
                    const schemaVer = parseInt(match[1], 10);
                    const dbPath = fpJoin(modelDirPath, file);
                    const stat = await fs.stat(dbPath);
                    out.push({
                        modelId,
                        schemaVer,
                        bytes: stat.size,
                        path: dbPath,
                        active: normalizePath(dbPath) === normalizePath(activePath),
                    });
                }
            }
        } catch {
            // .mneme may not exist yet — no inventory.
        }
        // Active first, then descending schema version.
        out.sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0) || b.schemaVer - a.schemaVer);
        return out;
    }

    deleteIndex = async (root: string, modelId: string, schemaVer: number): Promise<void> => {
        const choice = await this.confirm(
            "Delete index",
            `Delete the "${modelId} / v${schemaVer}" index DB for root "${root}"? This cannot be undone.`,
            "Delete",
        );
        if (!choice) return;
        const client = this.connection.getClient();
        if (!client) return;
        try {
            await client.callTool({
                name: "wiki_index_delete",
                arguments: { root, modelId, schemaVer },
            });
            await this.loadIndexInventory();
            ui.notify("Index deleted", "success");
        } catch (err) {
            ui.notify(`Delete index failed: ${(err as Error)?.message || err}`, "error");
        }
    };

    // ── Helpers ───────────────────────────────────────────────────────────

    private async confirm(title: string, message: string, confirmLabel: string): Promise<boolean> {
        const { showConfirmationDialog } = await import("../../ui/dialogs/ConfirmationDialog");
        const choice = await showConfirmationDialog({
            title,
            message,
            buttons: [confirmLabel, "Cancel"],
        });
        return choice === confirmLabel;
    }

    get modelReady(): boolean {
        return isModelReady(this.state.get().status);
    }

    /** Persist only stable fields — runtime/connection state is re-derived on
     *  open, so reset it to avoid restoring a phantom snapshot or in-flight
     *  reindex progress. */
    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        return {
            editorId: this.editorId,
            id: s.id,
            state: {
                ...s,
                connectionStatus: "disconnected",
                errorMessage: "",
                running: false,
                status: null,
                reindexProgress: {},
                rootConfigs: {},
                staleIndexes: {},
                refreshing: false,
            } as unknown as Record<string, unknown>,
        };
    }

    // Warm green page-tab icon (a fixed icon accent, like the browser-profile
    // colors). The sidebar entry keeps the theme `currentColor`.
    getIcon = (): ReactNode => createElement(MemoryIcon, { color: MEMORY_ICON_COLOR });

    async dispose(): Promise<void> {
        this.stopPolling();
        this._statusSub?.unsubscribe();
        this._statusSub = null;
        for (const a of Object.values(this._aborts)) a.abort();
        await this.connection.dispose();
        await super.dispose();
    }
}

/** Parse `"{root}: {phase}"` reindex progress messages. */
function parseProgressMessage(message?: string): { rootName?: string; phase?: string } {
    if (!message) return {};
    const idx = message.indexOf(":");
    if (idx < 0) return { phase: message.trim() };
    return {
        rootName: message.slice(0, idx).trim(),
        phase: message.slice(idx + 1).trim(),
    };
}

function normalizePath(p: string): string {
    return p.replace(/[\\/]+/g, "/").toLowerCase();
}

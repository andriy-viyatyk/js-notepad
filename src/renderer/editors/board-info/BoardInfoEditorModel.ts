import { createElement, type ReactNode } from "react";

import type { TComponentState } from "../../core/state/state";
import { EditorModel, type EditorStateBase, type RestoreData } from "../base/EditorModel";
import { CONTENT_HOST_TRAIT, type IContentHostTrait } from "../base/editor-traits";
import type { IContentHost } from "../base/IContentHost";
import { editorRegistry } from "../base/editorRegistry";
import type { EditorDescriptor, HostDescriptor } from "../../../shared/persistence";
import { TextFileModel, isTextFileModel } from "../text/TextEditorModel";
import { boardEditorId, customEditorRegistry } from "../board/custom-editor-registry";
import { BOARD_INFO_EDITOR_ID } from "./board-info-id";
import { publishedBoards } from "../../api/published-boards";
import { boardInstallRegistry } from "../../api/board-install-registry";
import { downloadBoard } from "../../api/board-install";
import { boardTrust } from "../../api/board-trust";
import { fs } from "../../api/fs";
import { ui } from "../../api/ui";
import { fpBasename, fpJoin } from "../../core/utils/file-path";
import { api } from "../../../ipc/renderer/api";
import rendererEvents from "../../../ipc/renderer/renderer-events";
import { EventEndpoint } from "../../../ipc/api-types";
import type { PublishedBoardInfo } from "../../../ipc/api-param-types";
import { BoardColorIcon } from "../../theme/icons";

/** Transient per-board download UI (not persisted). Downloaded/registered state is read from
 *  `boardInstallRegistry` + `boardTrust`, which are authoritative; this only tracks the in-flight
 *  download and the last error. */
export interface InstallProgress {
    phase: "downloading" | "error";
    received?: number;
    total?: number;
    error?: string;
}

export interface BoardInfoEditorState extends EditorStateBase {
    type: "boardInfoPage";
    editor: "board-info";
    title: string;
    /** Explicit openers (hub / update toast / Properties — US-867). Absent for a "+"-opened
     *  install, which derives its matches from the adopted host's file name. */
    catalogId?: string;
    boardRoot?: string;
    /** Catalog match tiles (install mode), derived from the host file name + catalog. */
    matches: PublishedBoardInfo[];
    /** Install-path parent dir (default `<userData>/data/boards`); user-changeable. */
    installDir?: string;
    /** Transient download UI, keyed by catalog id. */
    installUi: Record<string, InstallProgress>;
}

export const getDefaultBoardInfoEditorState = (): BoardInfoEditorState => ({
    id: crypto.randomUUID(),
    title: "Install editor",
    modified: false,
    type: "boardInfoPage",
    editor: "board-info",
    matches: [],
    installUi: {},
});

/**
 * Board Info editor — install mode (EPIC-045 / US-864).
 *
 * A registered full-page editor that advertises uninstalled published-catalog boards matching the
 * open file and walks the user through **Download → Register board**. Downloading trusts nothing
 * (verified code lands on disk inert); only **Register board** shows the trust dialog, after which
 * the page switches to the newly installed board.
 *
 * It is a **host-capable holder**: it adopts/yields the shared content host (`CONTENT_HOST_TRAIT`)
 * WITHOUT rendering it — exactly like `BoardContentEditorModel` — so `Text ↔ + ↔ installed board`
 * switches transfer the same host with no reload and no data loss. Opened standalone (hub/toast —
 * US-867) it simply has no host. The host machinery below mirrors `BoardContentEditorModel`
 * (minus the board/iframe); `switchFrom` additionally TOLERATES a host-less source.
 *
 * (Properties mode for an installed board is US-867.)
 */
export class BoardInfoEditorModel extends EditorModel<BoardInfoEditorState> {
    readonly editorId = BOARD_INFO_EDITOR_ID;

    noLanguage = true;
    skipSave = false; // delegates dirty/save to the held host (if any)
    showBackgroundOrnament = true;

    getIcon = (): ReactNode => createElement(BoardColorIcon);

    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _pendingHost: HostDescriptor | undefined = undefined;
    private _catalogSub: { unsubscribe: () => void } | null = null;
    /** installId of the in-flight download per catalog id (for Cancel). */
    private readonly _activeDownloads = new Map<string, string>();
    /** installIds the user cancelled — so the rejected download isn't shown as an error. */
    private readonly _cancelled = new Set<string>();

    constructor(state: TComponentState<BoardInfoEditorState>) {
        super(state);
        const trait: IContentHostTrait = {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) throw new Error("Host already extracted from BoardInfoEditorModel");
                this._hostStateUnsub?.();
                this._hostStateUnsub = null;
                this._host = null;
                return host as unknown as IContentHost;
            },
        };
        this.traits.add(CONTENT_HOST_TRAIT, trait);
    }

    // ── Host accessors / holder (mirrors BoardContentEditorModel) ────────

    override get contentHost(): IContentHost | null {
        return (this._host as unknown as IContentHost) ?? null;
    }

    /** Adopt a host: wire host state → `descriptorChanged`, copy title/id, forward page. */
    private adoptHost(host: TextFileModel): void {
        this._host = host;
        this._hostStateUnsub?.();
        this._hostStateUnsub = host.state.subscribe(() => this.descriptorChanged.send(undefined));
        const { filePath, title, id } = host.state.get();
        this.state.update((s) => {
            if (title) s.title = title;
            else if (filePath) s.title = fpBasename(filePath);
            if (id) s.id = id;
        });
        if (this.page) host.setPage(this.page);
    }

    override setPage(page: Parameters<EditorModel["setPage"]>[0]): void {
        super.setPage(page);
        this._host?.setPage(page);
    }

    /** Tolerant transfer: adopt the old editor's host if it has one; otherwise (host-less
     *  standalone open) keep no host. */
    override switchFrom(oldEditor: EditorModel): void {
        const trait = oldEditor.traits.get(CONTENT_HOST_TRAIT);
        if (!trait) return; // host-less source — nothing to transfer
        const host = trait.extractContentHost() as unknown as TextFileModel;
        if (!isTextFileModel(host)) {
            throw new Error("BoardInfoEditorModel.switchFrom: extracted host is not a TextFileModel");
        }
        // Preserve cache-file id across the swap (<id>-host.txt etc.).
        this.state.update((s) => { s.id = oldEditor.id; });
        this.adoptHost(host);
    }

    // ── Switch-widget support ────────────────────────────────────────────

    private currentFileName(): string {
        const hs = this._host?.state.get();
        return hs?.filePath ?? hs?.title ?? this.title;
    }

    /** The file's natural built-in editor (to switch back) plus this editor, so the switch keeps
     *  rendering `Text | +` while Board Info is active (mirrors BoardContentEditorModel). */
    override findCompatibleEditors(): string[] {
        const builtin = editorRegistry.resolveId(this.currentFileName()) ?? "monaco";
        return [builtin, BOARD_INFO_EDITOR_ID];
    }

    // ── Lifecycle ────────────────────────────────────────────────────────

    override async restore(): Promise<void> {
        await super.restore();
        // Rebuild the adopted host across a restart (Concern 2A — lossless: the file returns).
        try {
            if (!this._host && this._pendingHost) {
                this._host = await TextFileModel.fromDescriptor(this._pendingHost);
                if (!this._host.state.get().restored) await this._host.restore();
                this.adoptHost(this._host);
            }
        } catch (err) {
            ui.notify((err as Error).message || "Failed to restore the file.", "error");
        }
        this._pendingHost = undefined;

        await this.ensureInstallDir();
        await this.reconcile();
        // Refresh tiles if the catalog changes while the screen is open.
        this._catalogSub?.unsubscribe();
        this._catalogSub = rendererEvents[EventEndpoint.ePublishedBoardsUpdated].subscribe(
            () => void this.reconcile(),
        );
    }

    private async ensureInstallDir(): Promise<void> {
        if (this.state.get().installDir) return;
        const userData = await api.getCommonFolder("userData");
        const dir = fpJoin(userData, "data", "boards");
        this.state.update((s) => { if (!s.installDir) s.installDir = dir; });
    }

    /** Reconcile the install registry against disk, then recompute tiles. `load()` prunes any
     *  entry whose folder no longer holds a board manifest (deleted externally), so a tile that
     *  was "Downloaded — not registered" reverts to installable once its folder is gone. Called
     *  on open, on catalog change, and on window refocus (the view) — there is no filesystem
     *  watcher, so an externally-deleted board is detected at the next of those moments. */
    async reconcile(): Promise<void> {
        await boardInstallRegistry.load();
        this.recomputeMatches();
    }

    /** Recompute the catalog match tiles from the current file name. */
    recomputeMatches(): void {
        const matches = publishedBoards.catalogBoardsForFile(this.currentFileName());
        this.state.update((s) => { s.matches = matches; });
    }

    // ── Install actions ──────────────────────────────────────────────────

    async changeInstallDir(): Promise<void> {
        const picked = await fs.showFolderDialog({
            title: "Install location",
            defaultPath: this.state.get().installDir,
        });
        if (picked?.[0]) this.state.update((s) => { s.installDir = picked[0]; });
    }

    async download(entry: PublishedBoardInfo): Promise<void> {
        await this.ensureInstallDir();
        const dir = this.state.get().installDir;
        if (!dir) return;

        // A leftover folder at the target (e.g. a previous download whose folder wasn't fully
        // removed, or a manually-created one) blocks the install — `downloadBoard` only swaps in
        // place when the folder is a REGISTRY-tracked install of this same board. Offer to delete
        // an untracked one first.
        const targetRoot = fpJoin(dir, entry.id);
        if (await fs.exists(targetRoot)) {
            const tracked = boardInstallRegistry.getByRoot(targetRoot);
            if (!tracked || tracked.id !== entry.id) {
                const { showConfirmationDialog } = await import(
                    "../../ui/dialogs/ConfirmationDialog"
                );
                const choice = await showConfirmationDialog({
                    title: "Folder already exists",
                    message:
                        `The folder "${targetRoot}" already exists and will be deleted before ` +
                        `installing. Continue?`,
                    buttons: ["Delete & continue", "Cancel"],
                });
                if (choice !== "Delete & continue") return;
                try {
                    await fs.removeDir(targetRoot, true);
                } catch (err) {
                    this.setInstallUi(entry.id, {
                        phase: "error",
                        error: (err as Error).message || "Failed to delete the existing folder.",
                    });
                    return;
                }
            }
        }

        const installId = crypto.randomUUID();
        this._activeDownloads.set(entry.id, installId);
        this.setInstallUi(entry.id, { phase: "downloading", received: 0, total: entry.archive.size });

        const sub = rendererEvents[EventEndpoint.eBoardInstallProgress].subscribe((p) => {
            if (p.installId !== installId) return;
            this.setInstallUi(entry.id, {
                phase: "downloading",
                received: p.receivedBytes,
                total: p.totalBytes,
            });
        });

        try {
            await downloadBoard(entry, dir, installId);
            this.clearInstallUi(entry.id); // registry now reflects "downloaded" — view reacts
        } catch (err) {
            if (this._cancelled.has(installId)) {
                this.clearInstallUi(entry.id); // user cancel — not an error
            } else {
                this.setInstallUi(entry.id, {
                    phase: "error",
                    error: (err as Error).message || "Download failed.",
                });
            }
        } finally {
            sub.unsubscribe();
            this._activeDownloads.delete(entry.id);
            this._cancelled.delete(installId);
        }
    }

    cancelDownload(entry: PublishedBoardInfo): void {
        const installId = this._activeDownloads.get(entry.id);
        if (!installId) return;
        this._cancelled.add(installId);
        void api.cancelBoardDownload(installId);
    }

    /** Register (trust) a downloaded board — the ONLY privilege-granting step. Shows the trust
     *  dialog; on accept, trusts, refreshes the custom-editor registry (MUST await before the
     *  switch, else the board is misclassified as "simple" and dispose-rebuilt), then switches
     *  the page to the installed board. */
    async register(entry: PublishedBoardInfo): Promise<void> {
        const root = boardInstallRegistry.getById(entry.id)?.root;
        if (!root) return;
        const { showTrustBoardDialog } = await import("../../ui/dialogs/TrustBoardDialog");
        const ok = await showTrustBoardDialog(root);
        if (!ok) return;
        await boardTrust.trust(root);
        await customEditorRegistry.refresh();
        if (this._host) {
            // File page ("+"): lossless host transfer into the board editor.
            await this.page?.switchMainEditor(boardEditorId(root));
        } else {
            // Standalone open (hub/toast) — navigating to the board is US-867.
            this.recomputeMatches();
        }
    }

    /** Delete a downloaded-but-unregistered board (nothing was ever trusted). Removes the board
     *  FOLDER recursively (`removeDir`, not `delete` — the root is a directory), then the registry
     *  entry. If the folder deletion fails, the registry entry is kept so the tile stays truthful
     *  ("Downloaded — not registered") instead of orphaning a folder that would later block a
     *  re-download with "Target folder already exists". */
    async deleteDownload(entry: PublishedBoardInfo): Promise<void> {
        const root = boardInstallRegistry.getById(entry.id)?.root;
        if (root && (await fs.exists(root))) {
            try {
                await fs.removeDir(root, true);
            } catch (err) {
                ui.notify(
                    (err as Error).message || "Failed to delete the board folder.",
                    "error",
                );
                return;
            }
        }
        await boardInstallRegistry.remove(entry.id);
        this.clearInstallUi(entry.id);
    }

    // ── Auto-switch when no matches remain (Concern 2A) ──────────────────

    /** After a restart, the catalog may no longer advertise any board for this file (the board
     *  got installed elsewhere / was unpublished). With a real file host held, switch the page
     *  back to the file's natural built-in editor so nothing is stranded on an empty screen.
     *  Triggered from the view (safe — the editor is mounted + attached by then). */
    shouldAutoSwitch(): boolean {
        return this.state.get().matches.length === 0 && !!this._host?.state.get().filePath;
    }

    async autoSwitchToNatural(): Promise<void> {
        const fp = this._host?.state.get().filePath;
        if (!fp) return;
        const id = editorRegistry.resolveId(fp) ?? "monaco";
        await this.page?.switchMainEditor(id);
    }

    // ── Save / dirty (delegate to host) ──────────────────────────────────

    override get modified(): boolean {
        return this._host?.modified ?? false;
    }

    override async saveState(): Promise<void> {
        await this._host?.saveState();
    }

    override async confirmRelease(closing?: boolean): Promise<boolean> {
        return this._host ? this._host.confirmRelease(closing) : true;
    }

    // ── Persistence ──────────────────────────────────────────────────────

    override getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        return {
            editorId: this.editorId,
            id: s.id,
            // Persist only the durable fields — `matches` is recomputed and `installUi` is
            // transient (a persisted "downloading" would restore as a stuck bar).
            state: {
                title: s.title,
                catalogId: s.catalogId,
                boardRoot: s.boardRoot,
                installDir: s.installDir,
            } as Record<string, unknown>,
            // Persist the held host so a "+"-opened install returns its file across a restart.
            host: this._host?.getDescriptor(),
        };
    }

    override applyRestoreData(data: RestoreData<BoardInfoEditorState>): void {
        // The host-restore branch passes the full descriptor; durable fields live under `.state`.
        const st = (data as unknown as EditorDescriptor).state as
            | Partial<BoardInfoEditorState>
            | undefined;
        if (st) {
            this.state.update((s) => {
                if (st.title !== undefined) s.title = st.title;
                if (st.catalogId !== undefined) s.catalogId = st.catalogId;
                if (st.boardRoot !== undefined) s.boardRoot = st.boardRoot;
                if (st.installDir !== undefined) s.installDir = st.installDir;
            });
        }
        if (data.host) this._pendingHost = data.host;
    }

    // ── Dispose ──────────────────────────────────────────────────────────

    override async dispose(): Promise<void> {
        this._catalogSub?.unsubscribe();
        this._catalogSub = null;
        this._hostStateUnsub?.();
        this._hostStateUnsub = null;
        if (this._host) {
            await this._host.dispose();
            this._host = null;
        }
        await super.dispose();
    }

    // ── Private helpers ──────────────────────────────────────────────────

    private setInstallUi(id: string, ui: InstallProgress): void {
        this.state.update((s) => { s.installUi = { ...s.installUi, [id]: ui }; });
    }

    private clearInstallUi(id: string): void {
        this.state.update((s) => {
            const next = { ...s.installUi };
            delete next[id];
            s.installUi = next;
        });
    }
}

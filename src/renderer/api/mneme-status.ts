import { TGlobalState } from "../core/state/state";
import { api } from "../../ipc/renderer/api";
import ipcRendererEvents from "../../ipc/renderer/renderer-events";
import { settings } from "./settings";
import { mnemeConnection } from "./mneme-connection";
import { WikiStatus, isModelReady, parseToolResult } from "../editors/mneme-config/mnemeTypes";

/**
 * Shared, always-available Mneme health model.
 *
 * The header indicator must reflect model health even when the config editor is
 * not open, so health can't live in the editor's state. This singleton owns a
 * lightweight `status` probe over loopback MCP and exposes a reactive
 * `{ enabled, running, modelReady }` for the header indicator and the editor.
 *
 *  - `enabled`    — `mneme.enabled` setting (drives indicator *visibility*).
 *  - `running`    — sidecar process up (from the main process).
 *  - `modelReady` — a working embedding model is provisioned (green vs yellow).
 *
 * The probe runs over the **shared** `mnemeConnection` client rather than its own
 * MCP session — a second session to the same loopback sidecar (plus the config
 * editor's) starved the renderer's HTTP connection pool and made `status`
 * hang to the 60 s timeout (US-673).
 */
export interface MnemeStatusState {
    enabled: boolean;
    running: boolean;
    url: string;
    modelReady: boolean;
}

const POLL_MS = 30_000;

class MnemeStatusModel {
    readonly state = new TGlobalState<MnemeStatusState>({
        enabled: false,
        running: false,
        url: "",
        modelReady: false,
    });

    private pollTimer: ReturnType<typeof setInterval> | null = null;
    private probing = false;
    private initialized = false;
    /** One-shot per enabled session: once the sidecar is up and connected and a
     *  probe confirms no embedding model is provisioned, route the user to the
     *  config editor (where they can download it). Re-armed when Mneme is disabled. */
    private autoOpenedConfig = false;
    private autoOpenTimer: ReturnType<typeof setTimeout> | null = null;
    private autoOpenGeneration = 0;

    /** Wire settings + sidecar events. Call once at app startup. */
    init(): void {
        if (this.initialized) return;
        this.initialized = true;

        this.state.update((s) => { s.enabled = !!settings.get("mneme.enabled"); });

        // The singleton health model owns these listeners for the renderer lifetime;
        // no config view/model should tear down the shared status indicator.
        settings.onChanged.subscribe(({ key }: { key: string }) => {
            if (key !== "mneme.enabled") return;
            const enabled = !!settings.get("mneme.enabled");
            this.state.update((s) => { s.enabled = enabled; });
            // Re-arm the auto-open so a fresh enable can route to the config editor again.
            if (!enabled) this.autoOpenedConfig = false;
            this.sync();
        });

        ipcRendererEvents.eMnemeStatusChanged.subscribe((s) => {
            this.applySidecar(!!s.running, s.url || "");
        });

        // Probe as soon as the shared connection is up so the indicator turns
        // green promptly instead of waiting for the next 30 s tick.
        mnemeConnection.onStatusChange((status) => {
            if (status === "connected") void this.probe();
        });

        void api.getMnemeStatus().then((s) => {
            this.applySidecar(!!s.running, s.url || "");
        });
    }

    /** Re-probe model health now (called by the editor after model-affecting
     *  actions so the indicator updates without waiting for the poll). */
    refresh = (): void => { void this.probe(); };

    /** Open the Mneme config editor (focuses an existing one — `addPage` dedupes
     *  by the fixed config page id). Fire-and-forget; lazy import avoids a startup
     *  import cycle. */
    private openConfigEditor(): void {
        void import("./pages").then(({ pagesModel }) => pagesModel.showMnemeConfigPage());
    }

    private applySidecar(running: boolean, url: string): void {
        this.state.update((s) => {
            s.running = running;
            s.url = url;
            if (!running) s.modelReady = false;
        });
        this.sync();
    }

    private sync(): void {
        const { enabled, running } = this.state.get();
        if (enabled && running) {
            if (!this.pollTimer) {
                this.pollTimer = setInterval(() => void this.probe(), POLL_MS);
            }
            void this.probe();
        } else {
            this.autoOpenGeneration++;
            if (this.autoOpenTimer) {
                clearTimeout(this.autoOpenTimer);
                this.autoOpenTimer = null;
            }
            if (this.pollTimer) {
                clearInterval(this.pollTimer);
                this.pollTimer = null;
            }
            this.state.update((s) => { s.modelReady = false; });
        }
    }

    private async probe(): Promise<void> {
        const { enabled, running } = this.state.get();
        if (!enabled || !running || this.probing) return;
        // Reuse the shared content connection — the prober no longer opens its own
        // MCP session (US-673). `mnemeConnection` owns the connection lifecycle; if
        // it isn't connected yet, the model is simply not ready for this tick and the
        // onStatusChange hook re-probes once it connects.
        const client = mnemeConnection.getClient();
        if (!client) {
            this.state.update((s) => { s.modelReady = false; });
            return;
        }
        this.probing = true;
        try {
            const result = await client.callTool({ name: "status", arguments: {} }, undefined, { timeout: 10_000 });
            const status = parseToolResult<WikiStatus>(result);
            const ready = isModelReady(status);
            this.state.update((s) => { s.modelReady = ready; });
            // Mneme without an embedding model is useless, so route the user to the
            // config editor where they can download it. A non-null `status` means this
            // is a definitive read (not a transient probe failure). Once per session
            // (re-armed on disable) → pops once per Persephone start while unprovisioned.
            // `addPage` dedupes by the fixed config page id, so this focuses an existing
            // config page rather than duplicating it.
            if (status && !ready && !this.autoOpenedConfig) {
                this.autoOpenedConfig = true;
                const generation = ++this.autoOpenGeneration;
                // Wait 500 ms for the definitive health result and related state changes to settle
                // before opening the configuration page.
                this.autoOpenTimer = setTimeout(() => {
                    this.autoOpenTimer = null;
                    const current = this.state.get();
                    if (generation !== this.autoOpenGeneration
                        || !current.enabled || !current.running || current.modelReady) return;
                    this.openConfigEditor();
                }, 500);
            }
        } catch {
            // Probe failed (or timed out) — treat the model as not ready; the shared
            // connection's auto-reconnect handles recovery.
            this.state.update((s) => { s.modelReady = false; });
        } finally {
            this.probing = false;
        }
    }
}

export const mnemeStatusModel = new MnemeStatusModel();

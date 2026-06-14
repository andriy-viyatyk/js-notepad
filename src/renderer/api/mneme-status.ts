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
 * lightweight `wiki_status` probe over loopback MCP and exposes a reactive
 * `{ enabled, running, modelReady }` for the header indicator and the editor.
 *
 *  - `enabled`    — `mneme.enabled` setting (drives indicator *visibility*).
 *  - `running`    — sidecar process up (from the main process).
 *  - `modelReady` — a working embedding model is provisioned (green vs yellow).
 *
 * The probe runs over the **shared** `mnemeConnection` client rather than its own
 * MCP session — a second session to the same loopback sidecar (plus the config
 * editor's) starved the renderer's HTTP connection pool and made `wiki_status`
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

    /** Wire settings + sidecar events. Call once at app startup. */
    init(): void {
        if (this.initialized) return;
        this.initialized = true;

        this.state.update((s) => { s.enabled = !!settings.get("mneme.enabled"); });

        settings.onChanged.subscribe(({ key }: { key: string }) => {
            if (key !== "mneme.enabled") return;
            this.state.update((s) => { s.enabled = !!settings.get("mneme.enabled"); });
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
            const result = await client.callTool({ name: "wiki_status", arguments: {} }, undefined, { timeout: 10_000 });
            const status = parseToolResult<WikiStatus>(result);
            const ready = isModelReady(status);
            this.state.update((s) => { s.modelReady = ready; });
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

import { TGlobalState } from "../core/state/state";
import { api } from "../../ipc/renderer/api";
import ipcRendererEvents from "../../ipc/renderer/renderer-events";
import { settings } from "./settings";
import { McpConnectionManager } from "../editors/mcp-inspector/McpConnectionManager";
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

    private connection: McpConnectionManager | null = null;
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
            void this.dropConnection();
            this.state.update((s) => { s.modelReady = false; });
        }
    }

    private async dropConnection(): Promise<void> {
        if (!this.connection) return;
        const c = this.connection;
        this.connection = null;
        await c.dispose();
    }

    private async probe(): Promise<void> {
        const { enabled, running, url } = this.state.get();
        if (!enabled || !running || !url || this.probing) return;
        this.probing = true;
        try {
            if (!this.connection) this.connection = new McpConnectionManager();
            let client = this.connection.getClient();
            if (!client) {
                await this.connection.connect({ name: "Mneme (status)", transport: "http", url });
                client = this.connection.getClient();
            }
            if (!client) {
                this.state.update((s) => { s.modelReady = false; });
                return;
            }
            const result = await client.callTool({ name: "wiki_status", arguments: {} });
            const status = parseToolResult<WikiStatus>(result);
            const ready = isModelReady(status);
            this.state.update((s) => { s.modelReady = ready; });
        } catch {
            // Probe failed — treat the model as not ready and drop the client so
            // the next probe reconnects cleanly.
            this.state.update((s) => { s.modelReady = false; });
            await this.dropConnection();
        } finally {
            this.probing = false;
        }
    }
}

export const mnemeStatusModel = new MnemeStatusModel();

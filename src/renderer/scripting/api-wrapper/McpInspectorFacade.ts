import type { McpInspectorEditorModel } from "../../editors/mcp-inspector/McpInspectorEditorModel";
import type { McpTransportType } from "../../editors/mcp-inspector/McpConnectionManager";
import type { McpRequestEntry } from "../../editors/log-view/logTypes";

/**
 * Safe facade around McpInspectorEditorModel for script access.
 * Implements the IMcpInspectorEditor interface from api/types/mcp-inspector-editor.d.ts.
 *
 * - Direct model wrap (no ViewModel acquisition, no ref-counting)
 * - Exposes connection management and troubleshooting methods
 */
export class McpInspectorFacade {
    constructor(private readonly model: McpInspectorEditorModel) {}

    // -- Connection status (read-only) --

    get connectionStatus(): string {
        return this.model.state.get().connectionStatus;
    }

    get serverName(): string {
        return this.model.state.get().serverName;
    }

    get serverTitle(): string {
        return this.model.state.get().serverTitle;
    }

    get serverVersion(): string {
        return this.model.state.get().serverVersion;
    }

    get serverDescription(): string {
        return this.model.state.get().serverDescription;
    }

    get serverWebsiteUrl(): string {
        return this.model.state.get().serverWebsiteUrl;
    }

    get instructions(): string {
        return this.model.state.get().instructions;
    }

    get errorMessage(): string {
        return this.model.state.get().errorMessage;
    }

    // -- Connection parameters (read/write) --

    get transportType(): string {
        return this.model.state.get().transportType;
    }
    set transportType(value: string) {
        this.model.state.update((s) => { s.transportType = value as McpTransportType; });
    }

    get url(): string {
        return this.model.state.get().url;
    }
    set url(value: string) {
        this.model.state.update((s) => { s.url = value; });
    }

    get command(): string {
        return this.model.state.get().command;
    }
    set command(value: string) {
        this.model.state.update((s) => { s.command = value; });
    }

    get args(): string {
        return this.model.state.get().args;
    }
    set args(value: string) {
        this.model.state.update((s) => { s.args = value; });
    }

    get connectionName(): string {
        return this.model.state.get().connectionName;
    }
    set connectionName(value: string) {
        this.model.state.update((s) => { s.connectionName = value; });
    }

    // -- Connection actions --

    connect(): Promise<void> {
        return this.model.connect();
    }

    disconnect(): Promise<void> {
        return this.model.disconnect();
    }

    // -- History --

    get historyCount(): number {
        return this.model.historyCount;
    }

    get history(): ReadonlyArray<McpRequestEntry> {
        return this.model.history;
    }

    clearHistory(): void {
        this.model.clearHistory();
    }

    showHistory(): Promise<void> {
        return this.model.showHistory();
    }
}

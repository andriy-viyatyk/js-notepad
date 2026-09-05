import type { McpInspectorEditorModel } from "../../editors/mcp-inspector/McpInspectorEditorModel";
import type { McpTransportType } from "../../editors/mcp-inspector/McpConnectionManager";
import type { McpRequestEntry } from "../../editors/log-view/logTypes";
import type { IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";

const MCP_INSPECTOR_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The concrete current editor id." },
    { name: "name", kind: "property", summary: "The editor's registry display name." },
    { name: "connectionStatus", kind: "property", summary: "Connection state: \"disconnected\", \"connecting\", \"connected\", \"error\"." },
    { name: "serverName", kind: "property", summary: "Connected server name (empty when disconnected)." },
    { name: "serverTitle", kind: "property", summary: "Display-friendly server title (empty if not provided)." },
    { name: "serverVersion", kind: "property", summary: "Connected server version (empty when disconnected)." },
    { name: "serverDescription", kind: "property", summary: "Short server description (empty if not provided)." },
    { name: "serverWebsiteUrl", kind: "property", summary: "Server website URL (empty if not provided)." },
    { name: "instructions", kind: "property", summary: "Server instructions received during initialization (empty when disconnected)." },
    { name: "errorMessage", kind: "property", summary: "Last error message (empty when no error)." },
    { name: "transportType", kind: "property", writable: true, summary: "Transport type: \"http\" or \"stdio\"." },
    { name: "url", kind: "property", writable: true, summary: "Server URL (for HTTP transport)." },
    { name: "command", kind: "property", writable: true, summary: "Command to spawn (for stdio transport)." },
    { name: "args", kind: "property", writable: true, summary: "Space-separated arguments (for stdio transport)." },
    { name: "connectionName", kind: "property", writable: true, summary: "Display name for the connection." },
    { name: "connect", kind: "method", signature: "connect(): Promise<void>", summary: "Connect using current parameters." },
    { name: "disconnect", kind: "method", signature: "disconnect(): Promise<void>", summary: "Disconnect from the current server.", caution: "ends the active server connection" },
    { name: "historyCount", kind: "property", summary: "Number of recorded request entries." },
    { name: "history", kind: "property", summary: "Array of recorded MCP request/response entries. Each entry has: direction, method, params, result, error, durationMs, timestamp." },
    { name: "clearHistory", kind: "method", signature: "clearHistory(): void", summary: "Clear all recorded history.", caution: "deletes recorded troubleshooting history" },
    { name: "showHistory", kind: "method", signature: "showHistory(): Promise<void>", summary: "Open history in a new Log View page." },
];

const MCP_INSPECTOR_HELP = `Access via pages[i].editor after narrowing editor.id to "mcp-view".
MCP Inspector connection management and troubleshooting history facade.`;

/**
 * Safe facade around McpInspectorEditorModel for script access.
 * Implements the IMcpInspectorEditor interface from api/types/mcp-inspector-editor.d.ts.
 *
 * - Direct model wrap (no ViewModel acquisition, no ref-counting)
 * - Exposes connection management and troubleshooting methods
 */
export class McpInspectorFacade implements IAiVisible {
    constructor(private readonly model: McpInspectorEditorModel, readonly id: string, readonly name: string) {}

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "McpInspector",
            summary: "MCP Inspector connection and troubleshooting facade.",
            members: MCP_INSPECTOR_MEMBERS,
            help: MCP_INSPECTOR_HELP,
            summarize: () => ({
                kind: "McpInspector", id: this.id, name: this.name,
                connectionStatus: this.connectionStatus,
                serverName: this.serverName,
                historyCount: this.historyCount,
            }),
        };
    }

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

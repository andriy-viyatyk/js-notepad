/**
 * IMcpInspectorEditor — script interface for MCP Inspector pages.
 *
 * Obtained via `page.editor`. Only available for MCP Inspector pages.
 * Provides connection management and troubleshooting access.
 *
 * @example
 * const inspector = page.editor;
 * inspector.url = "http://127.0.0.1:7865/mcp";
 * await inspector.connect();
 * console.log(inspector.connectionStatus); // "connected"
 * console.log(inspector.serverName);       // "persephone"
 */
export interface IMcpInspectorEditor {
    readonly id: "mcp-view";
    readonly name: string;
    // -- Connection status (read-only) --

    /** Connection state: "disconnected", "connecting", "connected", "error". */
    readonly connectionStatus: string;

    /** Connected server name (empty when disconnected). */
    readonly serverName: string;

    /** Display-friendly server title (empty if not provided). */
    readonly serverTitle: string;

    /** Connected server version (empty when disconnected). */
    readonly serverVersion: string;

    /** Short server description (empty if not provided). */
    readonly serverDescription: string;

    /** Server website URL (empty if not provided). */
    readonly serverWebsiteUrl: string;

    /** Server instructions received during initialization (empty when disconnected). */
    readonly instructions: string;

    /** Last error message (empty when no error). */
    readonly errorMessage: string;

    // -- Connection parameters (read/write) --

    /** Transport type: "http" or "stdio". */
    transportType: string;

    /** Server URL (for HTTP transport). */
    url: string;

    /** Command to spawn (for stdio transport). */
    command: string;

    /** Space-separated arguments (for stdio transport). */
    args: string;

    /** Display name for the connection. */
    connectionName: string;

    // -- Connection actions --

    /** Connect using current parameters. */
    connect(): Promise<void>;

    /** Disconnect from the current server. */
    disconnect(): Promise<void>;

    // -- History (troubleshooting) --

    /** Number of recorded request entries. */
    readonly historyCount: number;

    /**
     * Array of recorded MCP request/response entries.
     * Each entry has: direction, method, params, result, error, durationMs, timestamp.
     */
    readonly history: ReadonlyArray<{
        direction: "outgoing" | "incoming";
        method: string;
        params: any;
        result: any;
        error: string | null;
        durationMs: number;
        timestamp: number;
    }>;

    /** Clear all recorded history. */
    clearHistory(): void;

    /** Open history in a new Log View page. */
    showHistory(): Promise<void>;
}

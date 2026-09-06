/**
 * IMcpInspectorEditor — script interface for MCP Inspector pages.
 *
 * Obtained via `page.editor`. Only available for MCP Inspector pages.
 * Provides connection management, troubleshooting, and read-only panel state.
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

    /** Current HTTP endpoint/address. Do not supply embedded credentials through the agent API. */
    url: string;

    /** Current stdio command; it may contain credential-bearing flags. */
    readonly command: string;

    /** Current stdio arguments; they may contain credential-bearing flags. */
    readonly args: string;

    /** Display name for the connection. */
    connectionName: string;

    // -- Connection actions --

    /** Connect using current parameters; this contacts a server or starts the configured stdio process. */
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

    // -- Connected panel state (read-only snapshots) --

    /** The active connected panel, or undefined while disconnected. */
    readonly activePanel: McpPanelId | undefined;

    /** Panels available from the connected server, in selector order. */
    readonly availablePanels: readonly McpPanelId[] | undefined;

    /** Copied tool metadata, or undefined while disconnected. */
    readonly tools: readonly IMcpToolSnapshot[] | undefined;

    /** The copied selected tool, or undefined when no tool is selected. */
    readonly selectedTool: IMcpToolSnapshot | undefined;

    /** The copied selected-tool result, or undefined before a result exists. */
    readonly toolResult: IMcpToolResultSnapshot | undefined;

    /** Whether the selected tool is being called, or undefined while disconnected. */
    readonly toolCallLoading: boolean | undefined;

    /** Copied resources, or undefined while disconnected. */
    readonly resources: readonly IMcpResourceSnapshot[] | undefined;

    /** Copied resource templates, or undefined while disconnected. */
    readonly resourceTemplates: readonly IMcpResourceTemplateSnapshot[] | undefined;

    /** The copied selected resource, or undefined when no resource is selected. */
    readonly selectedResource: IMcpResourceSnapshot | undefined;

    /** The copied selected resource template, or undefined when none is selected. */
    readonly selectedResourceTemplate: IMcpResourceTemplateSnapshot | undefined;

    /** Copied selected-resource content, or undefined before a successful read. */
    readonly resourceContent: IMcpResourceContentSnapshot | undefined;

    /** Copied selected-template content, or undefined before a successful read. */
    readonly templateResourceContent: IMcpResourceContentSnapshot | undefined;

    /** Whether the selected resource is being read, or undefined while disconnected. */
    readonly resourceReadLoading: boolean | undefined;

    /** Whether the selected template is being read, or undefined while disconnected. */
    readonly templateReadLoading: boolean | undefined;

    /** The selected-resource read error, or undefined when there is none. */
    readonly resourceReadError: string | undefined;

    /** The selected-template read error, or undefined when there is none. */
    readonly templateReadError: string | undefined;

    /** Copied prompt metadata, or undefined while disconnected. */
    readonly prompts: readonly IMcpPromptSnapshot[] | undefined;

    /** The copied selected prompt, or undefined when no prompt is selected. */
    readonly selectedPrompt: IMcpPromptSnapshot | undefined;

    /** Copied prompt messages, or undefined before a successful get. */
    readonly promptMessages: readonly IMcpPromptMessageSnapshot[] | undefined;

    /** Whether the selected prompt is loading, or undefined while disconnected. */
    readonly promptLoading: boolean | undefined;

    /** The selected-prompt error, or undefined when there is none. */
    readonly promptError: string | undefined;
}

export type McpPanelId = "info" | "tools" | "resources" | "prompts" | "history";

export interface IMcpToolInputSchemaSnapshot {
    readonly type: "object";
    readonly properties?: Readonly<Record<string, unknown>>;
    readonly required?: readonly string[];
}

export interface IMcpToolAnnotationsSnapshot {
    readonly title?: string;
    readonly readOnlyHint?: boolean;
    readonly destructiveHint?: boolean;
}

export interface IMcpToolSnapshot {
    readonly name: string;
    readonly description: string;
    readonly inputSchema: IMcpToolInputSchemaSnapshot;
    readonly annotations?: IMcpToolAnnotationsSnapshot;
}

export type IMcpToolResultContentSnapshot =
    | { readonly type: "text"; readonly text: string }
    | { readonly type: "image"; readonly data: string; readonly mimeType?: string }
    | { readonly type: "resource"; readonly resource: IMcpResourceContentSnapshot }
    | { readonly type: "resource_link"; readonly uri: string; readonly name: string };

export interface IMcpToolResultSnapshot {
    readonly content: readonly IMcpToolResultContentSnapshot[];
    readonly isError?: boolean;
    readonly durationMs: number;
}

export interface IMcpResourceSnapshot {
    readonly uri: string;
    readonly name: string;
    readonly description: string;
    readonly mimeType: string;
}

export interface IMcpResourceTemplateSnapshot {
    readonly uriTemplate: string;
    readonly name: string;
    readonly description: string;
    readonly mimeType: string;
}

export interface IMcpResourceContentSnapshot {
    readonly uri: string;
    readonly mimeType?: string;
    readonly text?: string;
    readonly blob?: string;
}

export interface IMcpPromptArgSnapshot {
    readonly name: string;
    readonly description: string;
    readonly required: boolean;
}

export interface IMcpPromptSnapshot {
    readonly name: string;
    readonly description: string;
    readonly arguments: readonly IMcpPromptArgSnapshot[];
}

export type IMcpPromptMessageContentSnapshot =
    | { readonly type: "text"; readonly text: string }
    | { readonly type: "image"; readonly data: string; readonly mimeType?: string }
    | { readonly type: "resource"; readonly resource: IMcpResourceContentSnapshot }
    | { readonly type: "resource_link"; readonly uri: string; readonly name: string };

export interface IMcpPromptMessageSnapshot {
    readonly role: "user" | "assistant";
    readonly content: readonly IMcpPromptMessageContentSnapshot[];
}

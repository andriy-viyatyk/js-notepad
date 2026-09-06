// Shared types for the MCP server definition (main process).

/** The zod namespace, obtained from the lazily-loaded SDK bundle. */
export type Zod = typeof import("zod").z;
/** A tool's parameter schema — the plain `{ name: zodType }` object the SDK accepts. */
export type ZodRawShape = import("zod").ZodRawShape;

/** Renderer→main IPC response shape. `result` / `error` are JSON-RPC-style payloads
 *  whose shape is method-specific, so they ride as `unknown`. */
export interface McpResponse { result?: unknown; error?: { code?: number; message: string } }

/** Arguments a tool callback receives. The generic registrar cannot infer the concrete
 *  shape from the schema the way the SDK's own overload does, so custom handlers cast. */
export type ToolArgs = Record<string, unknown>;

export type McpContentBlock =
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string };

export interface IMcpToolResult {
    content: McpContentBlock[];
    isError?: boolean;
}

/**
 * A tool as data. The execute_tool definition is a pass-through to the renderer; the registrar
 * strips `windowIndex` from the args, forwards the rest as params under `method`
 * (defaulting to the tool's own name), and maps the response with `toResult`
 * (defaulting to `toToolResult`). Only tools that do real work in the main process
 * supply a `handler`.
 */
export interface IMcpToolDef {
    name: string;
    description: string;
    /** Omit for a no-parameter tool. */
    schema?: ZodRawShape;
    /** Renderer method for the pass-through shape. Defaults to `name`. */
    method?: string;
    /** Response→result mapper for the pass-through shape. Defaults to `toToolResult`. */
    toResult?: (response: McpResponse) => IMcpToolResult;
    /** Renderer timeout in ms; 0 waits forever. A function is evaluated per call. */
    timeoutMs?: number | ((args: ToolArgs) => number | undefined);
    /** Fully custom implementation — replaces the pass-through entirely. */
    handler?: (args: ToolArgs) => Promise<IMcpToolResult>;
}

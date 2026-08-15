import { sendToRenderer } from "./renderer-bridge";
import { McpServerInstance } from "./sdk";
import { toToolResult } from "./tool-results";
import { IMcpToolDef, IMcpToolResult, ToolArgs } from "./types";

/**
 * The generic pass-through: strip `windowIndex` (it selects the target window, it is not
 * a tool parameter), forward everything else to the renderer under the tool's method,
 * and map the response. This is the whole implementation of ~30 of the tools.
 */
function passThrough(def: IMcpToolDef): (args: ToolArgs) => Promise<IMcpToolResult> {
    return async (args: ToolArgs) => {
        const { windowIndex, ...params } = args as { windowIndex?: number };
        const timeoutMs = typeof def.timeoutMs === "function" ? def.timeoutMs(args) : def.timeoutMs;
        const response = await sendToRenderer(def.method ?? def.name, params, windowIndex, timeoutMs);
        return (def.toResult ?? toToolResult)(response);
    };
}

/** Register a group of data-defined tools on a server instance. */
export function registerTools(server: McpServerInstance, defs: IMcpToolDef[]): void {
    for (const def of defs) {
        const run = def.handler ?? passThrough(def);
        // The SDK infers the callback's argument type from the schema shape; a
        // data-defined tool only knows `ToolArgs`, hence the cast at the boundary.
        // A tool registered without a schema is called with (extra) only — no args.
        if (def.schema) {
            server.tool(def.name, def.description, def.schema, ((args: ToolArgs) => run(args)) as never);
        } else {
            server.tool(def.name, def.description, (() => run({})) as never);
        }
    }
}

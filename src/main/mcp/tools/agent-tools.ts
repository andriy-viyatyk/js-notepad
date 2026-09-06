import { IMcpToolDef } from "../types";
import { IToolContext } from "./params";

// Agent Tools registry — execute reusable parameterized tools discovered through call paths.

export function agentTools(ctx: IToolContext): IMcpToolDef[] {
    const { z, windowIndex } = ctx;
    return [
        {
            name: "execute_tool",
            description: "Run a registered Agent Tool by id discovered with `tools.search`. Pass `args` as a JSON object matching the tool's inputSchema; Persephone delivers it on the tool's stdin. Returns a structured result: on success { ok:true, result | resultText, logs, durationMs, ... }; on failure { ok:false, error, stderr, exitCode, toolsetRoot, ... }. If a tool fails, fix the tool at its returned `toolsetRoot`, then use `tools.toolsets.refresh` before retrying.",
            schema: {
                toolId: z.string().describe("Tool id '<toolset>/<tool>' (from tools.search)."),
                args: z.record(z.string(), z.unknown()).optional().describe("Tool arguments as a JSON object (matches the tool's inputSchema). Omit for a no-parameter tool."),
                windowIndex,
            },
            // timeout 0 = infinite: the real limit is the manifest timeoutMs, enforced
            // renderer-side by the executor's own timeout + tree-kill.
            timeoutMs: 0,
        },
    ];
}

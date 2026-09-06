import { handleCall } from "./call-command";
import { handleBoardCall } from "./board-call-command";
import { handleExecuteTool } from "./tool-commands";
import type { McpCommandHandler, McpParams, McpResponse } from "./types";

type McpCommandMethod = "execute_tool" | "call" | "board_call";

export const commandRegistry: Record<McpCommandMethod, McpCommandHandler> = {
    call: handleCall,
    board_call: handleBoardCall,
    execute_tool: handleExecuteTool,
};

export async function dispatchMcpCommand(method: string, params: McpParams): Promise<McpResponse> {
    const handler = commandRegistry[method as McpCommandMethod];
    if (handler) return handler(params);

    return { error: { code: -32601, message: `Method not found: ${method}` } };
}

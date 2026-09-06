import { handleCall } from "./call-command";
import { handleBoardCall } from "./board-call-command";
import type { McpCommandHandler, McpParams, McpResponse } from "./types";

// `call` is the whole advertised manifest (US-1353); `board_call` is the internal Board bridge.
type McpCommandMethod = "call" | "board_call";

export const commandRegistry: Record<McpCommandMethod, McpCommandHandler> = {
    call: handleCall,
    board_call: handleBoardCall,
};

export async function dispatchMcpCommand(method: string, params: McpParams): Promise<McpResponse> {
    const handler = commandRegistry[method as McpCommandMethod];
    if (handler) return handler(params);

    return { error: { code: -32601, message: `Method not found: ${method}` } };
}

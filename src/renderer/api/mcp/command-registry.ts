import { handleBoardRefresh, handleCreateBoard, handleOpenBoard } from "./board-commands";
import { handleCall } from "./call-command";
import { handleAppInfo, handleCreatePage, handleExecuteScript, handleGetActivePage, handleGetPageContent, handleGetPages, handleOpenUrl, handleSetPageContent } from "./page-commands";
import { handleCreateToolset, handleExecuteTool, handleRefreshToolset, handleSearchTools } from "./tool-commands";
import { handleUiPush } from "./ui-push";
import { handleBoardCall } from "./board-call-command";
import type { McpCommandHandler, McpParams, McpResponse } from "./types";

type McpCommandMethod =
    | "execute_script"
    | "get_pages"
    | "get_page_content"
    | "get_active_page"
    | "create_page"
    | "set_page_content"
    | "get_app_info"
    | "open_url"
    | "create_board"
    | "open_board"
    | "board_refresh"
    | "search_tools"
    | "execute_tool"
    | "refresh_toolset"
    | "create_toolset"
    | "ui_push"
    | "call"
    | "board_call";

export const commandRegistry: Record<McpCommandMethod, McpCommandHandler> = {
    call: handleCall,
    board_call: handleBoardCall,
    execute_script: handleExecuteScript,
    get_pages: handleGetPages,
    get_page_content: handleGetPageContent,
    get_active_page: handleGetActivePage,
    create_page: handleCreatePage,
    set_page_content: handleSetPageContent,
    get_app_info: handleAppInfo,
    open_url: handleOpenUrl,
    create_board: handleCreateBoard,
    open_board: handleOpenBoard,
    board_refresh: handleBoardRefresh,
    search_tools: handleSearchTools,
    execute_tool: handleExecuteTool,
    refresh_toolset: handleRefreshToolset,
    create_toolset: handleCreateToolset,
    ui_push: handleUiPush,
};

export async function dispatchMcpCommand(method: string, params: McpParams): Promise<McpResponse> {
    const handler = commandRegistry[method as McpCommandMethod];
    if (handler) return handler(params);

    if (method.startsWith("browser_")) {
        const { handleBrowserCommand } = await import("../../automation/commands");
        return handleBrowserCommand(method, params);
    }
    return { error: { code: -32601, message: `Method not found: ${method}` } };
}

import { IMcpToolDef } from "../types";
import { IToolContext } from "./params";

// Board lifecycle — scaffold, open, reload.

export function boardTools(ctx: IToolContext): IMcpToolDef[] {
    const { z, windowIndex } = ctx;
    return [
        {
            name: "create_board",
            description: "Create a Persephone Board — a sandboxed mini web-app (HTML page + backend scripts) you build for the user: a dashboard, tool, viewer, or custom editor. Scaffolds from a template, guarantees its board-manifest.json, auto-trusts it, and returns { boardRoot } (the new board's absolute root path). Then call open_board to show it, and edit its files to develop it. IMPORTANT: read read_guide(\"boards\") first.",
            schema: {
                name: z.string().describe("Board folder name — created inside `dir`; also the default display name."),
                dir: z.string().describe("Absolute path of the container folder the board is created in (created if it doesn't exist)."),
                demo: z.boolean().optional().describe("Scaffold from the bundled Demo board template (a rich, self-documenting example) instead of the blank template."),
                windowIndex,
            },
        },
        {
            name: "open_board",
            description: "Open an existing Persephone Board by its root folder path (the folder containing board-manifest.json). Opens a new tab (or reuses the board's tab) and makes it active. A board created via create_board is auto-trusted and opens immediately; a board Persephone did not create prompts the user for trust before rendering. Returns { opened, pageId, title } — pass that pageId to browser_* tools / board_refresh to target this board explicitly. IMPORTANT: read read_guide(\"boards\") first.",
            schema: {
                path: z.string().describe("Absolute path of the board's root folder (the folder containing board-manifest.json)."),
                windowIndex,
            },
        },
        {
            name: "board_refresh",
            description: "Reload a Persephone Board after you edit its files (HTML/JS/CSS). Boards do NOT auto-reload on file changes, so call this to apply your edits. Waits until the reloaded board's main frame has finished loading, so an immediately-following browser_snapshot sees the NEW content. Targets the board by its page id; omit pageId to reload the active board. Returns { refreshed: true, pageId, frameReady }; frameReady: false means the frame never signalled load within the timeout (likely broken board HTML — check the board's ui.log). Use list_pages / get_active_page to find a board's pageId.",
            schema: {
                pageId: z.string().optional().describe("Page id of the board to reload (from list_pages / get_active_page). Omit to reload the active board."),
                windowIndex,
            },
        },
    ];
}

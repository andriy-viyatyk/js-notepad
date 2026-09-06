import { app } from "../app";
import { pagesModel } from "../pages";
import type { BoardEditorModel } from "../../editors/board/BoardEditorModel";
import { isBoardEditorId } from "../../editors/board/custom-editor-registry";
import { errMessage } from "../../../shared/utils";
import type { McpParams, McpResponse } from "./types";

function asString(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
    return typeof value === "boolean" ? value : undefined;
}

export async function handleCreateBoard(params: McpParams): Promise<McpResponse> {
    const name = asString(params?.name);
    const dir = asString(params?.dir);
    if (!name) return { error: { code: -32602, message: "Missing or invalid 'name' parameter" } };
    if (!dir) return { error: { code: -32602, message: "Missing or invalid 'dir' parameter" } };
    try {
        const boardRoot = asBoolean(params?.demo)
            ? await app.boards.createDemoBoard(name, dir)
            : await app.boards.createBoard(name, dir);
        return { result: { boardRoot } };
    } catch (err) {
        return { error: { code: -32603, message: errMessage(err) } };
    }
}

export async function handleOpenBoard(params: McpParams): Promise<McpResponse> {
    const path = asString(params?.path);
    if (!path) return { error: { code: -32602, message: "Missing or invalid 'path' parameter" } };
    try {
        await app.boards.openBoard(path);
        const normalize = (value?: string) => value?.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
        const boardPage = pagesModel.state.get().pages.find((page) => {
            if (!isBoardEditorId(page.mainEditorInstance?.editorId)) return false;
            const state = page.mainEditor?.state.get() as { boardRoot?: string } | undefined;
            return normalize(state?.boardRoot) === normalize(path);
        });
        return { result: { opened: path, pageId: boardPage?.id, title: boardPage?.title } };
    } catch (err) {
        return { error: { code: -32603, message: errMessage(err) } };
    }
}

export async function handleBoardRefresh(params: McpParams): Promise<McpResponse> {
    const pageId = asString(params?.pageId);
    const page = pageId ? pagesModel.findPage(pageId) : pagesModel.activePage;
    if (!page) return { error: { code: -32602, message: pageId ? `Page not found: ${pageId}` : "No active page." } };

    const editor = page.mainEditorInstance;
    if (!editor || !isBoardEditorId(editor.editorId)) {
        return { error: { code: -32602, message: `Page ${page.id} is not a board page.` } };
    }
    const board = editor as BoardEditorModel;
    // One ordering, one waiter, shared with pages[i].editor.reload() — see US-1325.
    const frameReady = await board.reloadAndWait();
    return { result: { refreshed: true, pageId: page.id, frameReady } };
}

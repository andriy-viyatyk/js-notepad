import { scriptRunner } from "../../scripting/ScriptRunner";
import { editorRegistry } from "../../editors/base/editorRegistry";
import { isBoardEditorId } from "../../editors/board/custom-editor-registry";
import { fpJoin } from "../../core/utils/file-path";
import { app } from "../app";
import { pagesModel } from "../pages";
import { settings } from "../settings";
import type { EditorView } from "../types/common";
import { api } from "../../../ipc/renderer/api";
import type { McpActivePage, McpAppInfo, McpPageInfo, McpParams, McpResponse } from "./types";

const BOARDS_ASSETS_BASE_URL =
    "https://raw.githubusercontent.com/andriy-viyatyk/persephone/main/boards-assets/";
const MAX_INLINE_IMAGE_BASE64 = 5 * 1024 * 1024;
const OVERSIZE_IMAGE_HINT =
    "This image is too large to inline. Use execute_script with " +
    '`(await page.asImage()).savePngToFile(path)` to write it to disk, then read the file.';

type PageContentPayload =
    | { content: string }
    | { image: { data: string; mimeType: string } }
    | { hint: string };

function asString(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}
function asBoolean(value: unknown): boolean | undefined {
    return typeof value === "boolean" ? value : undefined;
}

/** Builds the common MCP list-page payload, including privacy-safe browser metadata. */
function toPageSummary(page: NonNullable<ReturnType<typeof pagesModel.findPage>>): McpPageInfo {
    const editor = page.mainEditorInstance;
    const editorState = page.mainEditor?.state.get() as { language?: string; filePath?: string } | undefined;
    const textHost = pagesModel.getTextFileHost(page.id);
    const result: McpPageInfo = {
        id: page.id,
        title: page.title,
        editor: editor?.editorId,
        language: textHost?.state.get().language ?? editorState?.language,
        filePath: textHost?.state.get().filePath ?? editorState?.filePath,
        modified: page.modified,
        pinned: page.pinned,
        active: page === pagesModel.activePage,
    };

    if (editor?.editorId === "browser-view") {
        const state = page.mainEditor?.state.get() as
            | { profileName?: string; isIncognito?: boolean; isTor?: boolean; url?: string }
            | undefined;
        const isIncognito = !!state?.isIncognito;
        const isTor = !!state?.isTor;
        result.profileName = state?.profileName ?? "";
        result.isIncognito = isIncognito;
        result.isTor = isTor;
        if (!isIncognito && !isTor) result.url = state?.url;
    }

    if (isBoardEditorId(editor?.editorId)) {
        const state = page.mainEditor?.state.get() as { boardRoot?: string; selectedBoard?: string } | undefined;
        result.boardRoot = state?.boardRoot;
        result.selectedBoard = state?.selectedBoard;
    }
    return result;
}

function hintForEditor(editorId: string | undefined): string {
    if (isBoardEditorId(editorId)) {
        return 'This is a board page. Use the browser_* tools targeted at it (see read_guide("boards")), or read the board\'s files from disk.';
    }
    switch (editorId) {
        case "browser-view":
            return "This is a browser page. Use the browser_* tools — browser_snapshot for the DOM, browser_take_screenshot for pixels.";
        case "video-view":
            return "This page has no extractable text or image content. Its source file path is available via list_pages → filePath.";
        default:
            return `This is a "${editorId ?? "unknown"}" page with no text content. Use execute_script with the page facades (see read_guide("scripting")).`;
    }
}

async function resolvePageContent(
    page: NonNullable<ReturnType<typeof pagesModel.findPage>>,
): Promise<PageContentPayload> {
    const textHost = pagesModel.getTextFileHost(page.id);
    if (textHost) return { content: textHost.state.get().content };

    const editor = page.mainEditorInstance as unknown as { exportPng?: () => Promise<Blob> } | null;
    if (typeof editor?.exportPng === "function") {
        try {
            const blob = await editor.exportPng();
            const data = Buffer.from(await blob.arrayBuffer()).toString("base64");
            if (data.length > MAX_INLINE_IMAGE_BASE64) return { hint: OVERSIZE_IMAGE_HINT };
            return { image: { data, mimeType: "image/png" } };
        } catch {
            // Export failed (for example, no image loaded yet); use the editor hint.
        }
    }
    return { hint: hintForEditor(page.mainEditorInstance?.editorId) };
}

export async function handleExecuteScript(params: McpParams): Promise<McpResponse> {
    const script = asString(params?.script);
    if (!script) return { error: { code: -32602, message: "Missing or invalid 'script' parameter" } };

    const pageId = asString(params?.pageId);
    const language = asString(params?.language);
    const page = pageId ? pagesModel.findPage(pageId) : pagesModel.activePage;
    // scriptRunner expects a legacy EditorModel; unwrap adapter or pass undefined.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const editor = page?.mainEditor as any;
    const result = await scriptRunner.runWithCapture(script, editor ?? undefined, language);
    return { result: { text: result.text, language: result.language, isError: result.isError, consoleLogs: result.consoleLogs } };
}

export function handleGetPages(): McpResponse {
    return { result: pagesModel.state.get().pages.map(toPageSummary) };
}

export async function handleGetPageContent(params: McpParams): Promise<McpResponse> {
    const pageId = asString(params?.pageId);
    if (!pageId) return { error: { code: -32602, message: "Missing 'pageId' parameter" } };
    const page = pagesModel.findPage(pageId);
    if (!page) return { error: { code: -32602, message: `Page not found: ${pageId}` } };
    return { result: { id: page.id, title: page.title, ...await resolvePageContent(page) } };
}

export async function handleGetActivePage(): Promise<McpResponse> {
    const page = pagesModel.activePage;
    if (!page) return { result: null };

    const summary = toPageSummary(page);
    const { pinned: _pinned, active: _active, boardRoot: _boardRoot, selectedBoard: _selectedBoard, ...result } = summary;
    const activePage: McpActivePage = { ...result, ...await resolvePageContent(page) };
    return { result: activePage };
}

export function handleCreatePage(params: McpParams): McpResponse {
    const content = asString(params?.content) ?? "";
    const language = asString(params?.language) ?? "plaintext";
    const editorId = asString(params?.editor) ?? "monaco";
    const title = asString(params?.title) ?? "Untitled";
    const definition = editorRegistry.getById(editorId);
    if (!definition) {
        const editors = editorRegistry.getAll().map((editor) => editor.id);
        return { error: { code: -32602, message: `Unknown editor '${editorId}'. Valid editors: ${editors.join(", ")}` } };
    }
    if (!definition.hasContentHost) {
        const hint = definition.mcpHint ?? "Read resource 'persephone://guides/pages' for details on editor types.";
        return {
            error: {
                code: -32602,
                message: `Editor '${editorId}' is a standalone editor and cannot be created with create_page. `
                    + `Standalone editors require specialized models. ${hint}`,
            },
        };
    }
    const page = pagesModel.addEditorPage(editorId as EditorView, language, title, content || undefined);
    const summary = toPageSummary(page);
    return { result: { id: summary.id, title: summary.title, editor: summary.editor, language: summary.language } };
}

export function handleSetPageContent(params: McpParams): McpResponse {
    const pageId = asString(params?.pageId);
    if (!pageId) return { error: { code: -32602, message: "Missing 'pageId' parameter" } };
    const content = asString(params?.content);
    if (content == null) return { error: { code: -32602, message: "Missing or invalid 'content' parameter" } };
    const page = pagesModel.findPage(pageId);
    if (!page) return { error: { code: -32602, message: `Page not found: ${pageId}` } };
    const textHost = pagesModel.getTextFileHost(page.id);
    if (!textHost) {
        return { error: { code: -32602, message: "Page is not a text-based page. Use execute_script with page facades (asGrid, asNotebook, etc.) for structured editors." } };
    }
    textHost.changeContent(content);
    return { result: { id: page.id, title: page.title, contentLength: content.length } };
}

export async function handleAppInfo(): Promise<McpResponse> {
    const pages = pagesModel.state.get().pages;
    const resourcesDir = await api.getAppRootPath();
    const result: McpAppInfo = {
        version: app.version,
        pageCount: pages.length,
        activePageId: pagesModel.activePage?.id ?? null,
        browserProfiles: settings.get("browser-profiles").map((profile) => profile.name),
        defaultBrowserProfile: settings.get("browser-default-profile"),
        resourcesDir,
        demoBoardDir: fpJoin(resourcesDir, "assets", "demo-board"),
        boardsAssetsBaseUrl: BOARDS_ASSETS_BASE_URL,
        boardsManifestUrl: BOARDS_ASSETS_BASE_URL + "manifest.json",
    };
    return { result };
}

export async function handleOpenUrl(params: McpParams): Promise<McpResponse> {
    const url = asString(params?.url);
    if (!url) return { error: { code: -32602, message: "Missing or invalid 'url' parameter" } };
    const pageId = await pagesModel.openUrlInBrowserTab(url, {
        profileName: asString(params?.profileName),
        incognito: asBoolean(params?.incognito),
    });
    const page = pageId ? pagesModel.findPage(pageId) : undefined;
    return { result: { opened: url, pageId, title: page?.title } };
}

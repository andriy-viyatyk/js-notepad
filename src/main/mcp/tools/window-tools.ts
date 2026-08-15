import { openWindows } from "../../open-windows";
import { windowStates } from "../../window-states";
import { IMcpToolDef, IMcpToolResult } from "../types";
import { IToolContext } from "./params";

// Multi-window tools. These are the only tools answered entirely in the main process —
// window state lives here, so nothing is forwarded to a renderer.

export function windowTools(ctx: IToolContext): IMcpToolDef[] {
    const { z } = ctx;
    return [
        {
            name: "list_windows",
            description: "List all windows (open and closed) with their status and pages. Closed windows have persisted pages and can be reopened with open_window. Returns array of { windowIndex, status, pageCount, activePageId, pages: [{ id, title, type, editor, language, filePath, modified, pinned }] }. Browser pages also include { profileName, isIncognito, isTor }.",
            handler: async (): Promise<IMcpToolResult> => {
                const result = openWindows.windows.map(w => {
                    const wState = windowStates.getState(w.index);
                    return {
                        windowIndex: w.index,
                        status: w.window ? "open" : "closed",
                        pageCount: wState?.pages?.length ?? 0,
                        activePageId: wState?.activePageId,
                        pages: (wState?.pages || []).map(p => {
                            // PageDescriptor: read main editor's state from editors[mainEditorId].
                            const main = p.editors.find(e => e.id === p.mainEditorId);
                            const state = (main?.state ?? {}) as { title?: string; type?: string; editor?: string; language?: string; filePath?: string; profileName?: string; isIncognito?: boolean; isTor?: boolean };
                            return {
                                id: p.id,
                                title: state.title ?? "Empty",
                                type: state.type,
                                editor: state.editor,
                                language: state.language,
                                filePath: state.filePath,
                                modified: p.modified,
                                pinned: p.pinned,
                                // Browser pages: surface profile identity (persisted fields)
                                ...(state.editor === "browser-view" ? { profileName: state.profileName ?? "", isIncognito: !!state.isIncognito, isTor: !!state.isTor } : {}),
                            };
                        }),
                    };
                });
                return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
            },
        },
        {
            name: "open_window",
            description: "Open (or reopen) a window by index. If the window is closed, it will be recreated with its persisted pages. If already open, it will be focused. Returns { windowIndex, status }.",
            schema: {
                windowIndex: z.number().int().describe("The window index to open (from list_windows)."),
            },
            handler: async (args): Promise<IMcpToolResult> => {
                const { windowIndex } = args as { windowIndex: number };
                const windowData = openWindows.windows.find(w => w.index === windowIndex);
                if (!windowData) {
                    return {
                        content: [{ type: "text", text: `Error: Window ${windowIndex} does not exist` }],
                        isError: true,
                    };
                }

                if (windowData.window) {
                    windowData.window.focus();
                    return { content: [{ type: "text", text: JSON.stringify({ windowIndex, status: "open", message: "Window is already open and focused" }) }] };
                }

                try {
                    openWindows.createWindow(windowIndex);
                    if (windowData.whenReady) {
                        await windowData.whenReady;
                    }
                    return { content: [{ type: "text", text: JSON.stringify({ windowIndex, status: "open", message: "Window reopened successfully" }) }] };
                } catch (err) {
                    return {
                        content: [{ type: "text", text: `Error: Failed to open window ${windowIndex}: ${err}` }],
                        isError: true,
                    };
                }
            },
        },
    ];
}

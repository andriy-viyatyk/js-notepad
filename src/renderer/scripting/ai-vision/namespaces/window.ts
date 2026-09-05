import type { IWindow } from "../../../api/types/window";
import type { IAiMember, IAiVisionDescriptor } from "../../../../shared/ai-vision/types";

const WINDOW_MEMBERS: readonly IAiMember[] = [
    { name: "minimize", kind: "method", signature: "minimize()", summary: "Minimize this window.", caution: "changes the visible application window" },
    { name: "maximize", kind: "method", signature: "maximize()", summary: "Maximize this window.", caution: "changes the visible application window" },
    { name: "restore", kind: "method", signature: "restore()", summary: "Restore this window from maximized or minimized state.", caution: "changes the visible application window" },
    { name: "close", kind: "method", signature: "close()", summary: "Close this window.", caution: "may close the application or prompt about unsaved work" },
    { name: "toggleWindow", kind: "method", signature: "toggleWindow()", summary: "Toggle maximized/restored state.", caution: "changes the visible application window" },
    { name: "isMaximized", kind: "property", summary: "Whether the window is maximized; readonly." },
    { name: "menuBarOpen", kind: "property", summary: "Whether the sidebar/menu bar is open; readonly." },
    { name: "menuBar", kind: "property", summary: "The live Menu Bar model with folders, selection, open/close actions, and curated controls.", node: true },
    { name: "toggleMenuBar", kind: "method", signature: "toggleMenuBar()", summary: "Toggle the sidebar.", caution: "changes the visible UI" },
    { name: "openMenuBar", kind: "method", signature: "openMenuBar(panelId?: string)", summary: "Legacy sidebar opener; unknown strings still open it without changing selection.", caution: "changes the visible UI" },
    { name: "zoom", kind: "method", signature: "zoom(delta: number)", summary: "Change the window zoom level.", caution: "changes the visible UI" },
    { name: "resetZoom", kind: "method", signature: "resetZoom()", summary: "Reset zoom to 100%.", caution: "changes the visible UI" },
    { name: "zoomLevel", kind: "property", summary: "Current zoom step; readonly." },
    { name: "openNew", kind: "method", signature: "openNew(filePath?: string)", summary: "Open a new application window, optionally with a file.", caution: "creates a visible window" },
    { name: "windowIndex", kind: "property", summary: "Zero-based index among application windows; readonly." },
];

export function describeWindow(instance: unknown): IAiVisionDescriptor {
    const window = instance as IWindow;
    return {
        kind: "Window",
        summary: "Control this window's state, sidebar, zoom, and multi-window actions.",
        members: WINDOW_MEMBERS,
        help: "Use window actions only when changing the application window or visible sidebar is intended.",
        summarize: () => ({
            kind: "Window",
            windowIndex: window.windowIndex,
            isMaximized: window.isMaximized,
            menuBarOpen: window.menuBarOpen,
            zoomLevel: window.zoomLevel,
        }),
    };
}

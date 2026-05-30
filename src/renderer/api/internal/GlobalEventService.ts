import { showAppPopupMenu } from "../../ui/dialogs/poppers/showPopupMenu";
import { parseObject } from "../../core/utils/parse-utils";
import { api } from "../../../ipc/renderer/api";
import { ui } from "../ui";
import { scriptRunner } from "../../scripting/ScriptRunner";
import { fs } from "../fs";
import { appWindow } from "../window";
import { RendererEvent } from "../../../ipc/api-types";
import { pagesModel } from "../pages";
import { windowClosing } from "../../core/state/events";
import type { ILink } from "../types/io.tree";
import { fpBasename, fpJoin } from "../../core/utils/file-path";

/**
 * Expand a list of dropped file/folder paths into ILink items.
 * Files become links with empty category. Folders are recursively enumerated —
 * each file inside gets a category matching the relative directory path.
 */
async function expandDroppedPaths(paths: string[]): Promise<ILink[]> {
    const links: ILink[] = [];

    for (const droppedPath of paths) {
        const stat = await fs.stat(droppedPath);
        if (stat.isDirectory) {
            const folderName = fpBasename(droppedPath);
            await collectFolderFiles(droppedPath, folderName, links);
        } else {
            links.push({
                title: fpBasename(droppedPath) || droppedPath,
                href: droppedPath,
                category: "",
                tags: [] as string[],
                isDirectory: false,
            });
        }
    }
    return links;
}

/** Recursively collect files from a folder, building category from relative path. */
async function collectFolderFiles(
    dirPath: string,
    category: string,
    links: ILink[],
): Promise<void> {
    const entries = await fs.listDirWithTypes(dirPath);
    for (const entry of entries) {
        const fullPath = fpJoin(dirPath, entry.name);
        if (entry.isDirectory) {
            await collectFolderFiles(fullPath, category + "/" + entry.name, links);
        } else {
            links.push({
                title: entry.name,
                href: fullPath,
                category,
                tags: [] as string[],
                isDirectory: false,
            });
        }
    }
}

/**
 * Global event service for document/window listeners.
 * Handles: contextmenu, drag-drop, unhandled promise rejections.
 */
export class GlobalEventService {
    async init(): Promise<void> {
        document.addEventListener("contextmenu", this.handleContextMenu);
        document.addEventListener("dragover", this.handleDragOver);
        document.addEventListener("drop", this.captureDrop, true);
        document.addEventListener("drop", this.handleDrop);
        document.addEventListener("wheel", this.handleWheel, { passive: false });
        window.addEventListener("unhandledrejection", this.handleUnhandledRejection);
        window.addEventListener("beforeunload", this.handleBeforeUnload);
    }

    private handleContextMenu = async (e: PointerEvent) => {
        e.preventDefault();
        if (e.contextMenuPromise) {
            await e.contextMenuPromise;
        }
        const event = e.contextMenuEvent;
        showAppPopupMenu(e.clientX, e.clientY, event?.items || []);
    };

    private handleDragOver = (e: DragEvent) => {
        const types = e.dataTransfer?.types || [];
        if (types.includes("application/persephone-tab")) {
            e.dataTransfer.dropEffect = "move";
        }
        e.preventDefault();
        e.stopPropagation();
    };

    private handleDrop = (e: DragEvent) => {
        const dataStr = e.dataTransfer?.getData("application/persephone-tab");
        const data = parseObject(dataStr) as { sourceWindowIndex?: number } | undefined;
        if (
            data &&
            data.sourceWindowIndex !== undefined &&
            data.sourceWindowIndex !== appWindow.windowIndex
        ) {
            api.addDragEvent({ targetWindowIndex: appWindow.windowIndex });
        }
    };

    private captureDrop = (e: DragEvent) => {
        const filePaths: string[] = [];

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            for (let i = 0; i < e.dataTransfer.files.length; i++) {
                try {
                    const path = window.electron.getPathForFile(e.dataTransfer.files[i]);
                    if (path && fs.fileExistsSync(path)) {
                        filePaths.push(path);
                    }
                } catch (error) {
                    console.error("Error getting file path:", error);
                }
            }
        }

        if (filePaths.length === 0) {
            const textData = e.dataTransfer.getData("text/plain");
            const path = textData?.split("\n")[0]?.trim();
            if (path && fs.fileExistsSync(path)) {
                filePaths.push(path);
            }
        }

        if (filePaths.length === 0) return;

        e.preventDefault();
        e.stopPropagation();

        this.openDroppedPaths(filePaths);
    };

    private openDroppedPaths = async (filePaths: string[]) => {
        try {
            if (filePaths.length === 1) {
                const stat = await fs.stat(filePaths[0]);
                if (!stat.isDirectory) {
                    window.electron.ipcRenderer.sendMessage(RendererEvent.fileDropped, filePaths[0]);
                    return;
                }
            }
            const links = await expandDroppedPaths(filePaths);
            if (links.length > 0) {
                pagesModel.openLinks(links);
            }
        } catch (err: unknown) {
            ui.notify(`Failed to open dropped files: ${err instanceof Error ? err.message : String(err)}`, "error");
        }
    };

    private handleWheel = (e: WheelEvent) => {
        if (e.ctrlKey) {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.5 : -0.5;
            api.zoom(delta);
        }
    };

    private handleUnhandledRejection = (e: PromiseRejectionEvent) => {
        // Suppress Monaco Editor's internal Delayer "Canceled" rejections
        // (fired during editor disposal — harmless, but noisy in console)
        const reason = e.reason;
        if (reason && (reason.message === "Canceled" || reason === "Canceled")) {
            e.preventDefault();
            return;
        }
        if (scriptRunner.handlePromiseException) {
            ui.notify(`Unhandled promise rejection: ${e.reason}`, "error");
        }
    };

    private handleBeforeUnload = () => {
        windowClosing.send(undefined as any);
    };
}

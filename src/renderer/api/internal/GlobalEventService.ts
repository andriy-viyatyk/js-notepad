import { showAppPopupMenu } from "../../ui/dialogs/poppers/showPopupMenu";
import { parseObject } from "../../core/utils/parse-utils";
import { api } from "../../../ipc/renderer/api";
import { ui } from "../ui";
import { scriptRunner } from "../../scripting/ScriptRunner";
import { fs } from "../fs";
import { appWindow } from "../window";
import { RendererEvent } from "../../../ipc/api-types";
import { pagesModel } from "../pages";
import {
    getClipboardImageFile,
    getClipboardRichHtml,
    openPastedHtml,
    openPastedImage,
    shouldStandDownFromPaste,
} from "./clipboard-image";
import { windowClosing } from "../../core/state/events";
import type { ILink } from "../types/io.tree";
import { fpBasename, fpJoin } from "../../core/utils/file-path";
import { isFileDrag, setEventTraitDragData } from "../../core/traits/dnd";
import { makeOsFileDescriptor } from "../../core/traits/fileLinkTraits";
import { guard } from "../../core/utils/guard";

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
        // App.initEvents() owns these process-wide document/window listeners for the
        // renderer lifetime; they are not resources of any individual view or model.
        document.addEventListener("contextmenu", this.handleContextMenu);
        document.addEventListener("dragover", this.handleDragOver);
        // Capture: tag OS file drops with an IFileLink descriptor (no consume) so
        // trait-aware targets (e.g. the Mneme tree) can import them.
        document.addEventListener("drop", this.captureDrop, true);
        document.addEventListener("drop", this.handleDrop);
        // Bubble (runs last): open dropped files as tabs unless a target handled the drop.
        document.addEventListener("drop", this.handleFileDropFallback);
        document.addEventListener("wheel", this.handleWheel, { passive: false });
        // Capture: a pasted bitmap wins over any focused editor (see handlePastedImage).
        document.addEventListener("paste", this.handlePastedImage, true);
        // Bubble (runs last): open pasted rich HTML in a viewer unless a component
        // handled the paste itself.
        document.addEventListener("paste", this.handlePastedHtmlFallback);
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

    /**
     * Capture phase: tag the native event with an IFileLink trait descriptor so
     * trait-aware drop targets (e.g. the Mneme tree) can import the dropped files.
     * Does NOT consume the event — open-as-tab is the bubble-phase fallback below,
     * which only fires if no descendant handled (and stopped) the drop.
     */
    private captureDrop = (e: DragEvent) => {
        if (!isFileDrag(e.dataTransfer)) return;
        const entries = Array.from(e.dataTransfer.files)
            .map((f) => ({ name: f.name, path: window.electron.getPathForFile(f) }))
            .filter((f) => !!f.path);
        if (entries.length) setEventTraitDragData(e, makeOsFileDescriptor(entries));
    };

    /**
     * Bubble phase (runs last): open OS-dropped files/folders as tabs — the original
     * drop-to-open behavior, relocated from capture so trait-aware targets (which
     * call stopPropagation when they handle the drop) get first chance.
     */
    private handleFileDropFallback = (e: DragEvent) => {
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
        await guard("Failed to open dropped files", async () => {
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
        });
    };

    private handleWheel = (e: WheelEvent) => {
        if (e.ctrlKey) {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.5 : -0.5;
            api.zoom(delta);
        }
    };

    /**
     * Open a pasted bitmap in the Image viewer. Registered in the **capture**
     * phase on `document` so it runs before any focused editor — notably Monaco,
     * which otherwise consumes (and `preventDefault`s) the paste at its hidden
     * textarea before a bubble-phase listener could ever see it.
     *
     * We `stopPropagation()` so the focused editor never receives the paste; a
     * bitmap has no text representation for it to insert anyway. Everything else
     * falls through to the bubble-phase fallback below.
     */
    private handlePastedImage = (e: ClipboardEvent) => {
        const file = getClipboardImageFile(e);
        if (!file) return;
        e.preventDefault();
        e.stopPropagation();
        openPastedImage(file);
    };

    /**
     * Open pasted rich HTML in the HTML viewer — a Teams conversation, an Office
     * picture that arrived as HTML with no bitmap, a table from Excel, a web-page
     * selection.
     *
     * Registered on the **bubble** phase (runs last) so that any component which
     * handles the paste itself wins by default, exactly as `handleFileDropFallback`
     * does for drops. `shouldStandDownFromPaste` covers the components that handle
     * a paste without stopping propagation — editable targets and grids.
     */
    private handlePastedHtmlFallback = (e: ClipboardEvent) => {
        if (shouldStandDownFromPaste(e)) return;
        const html = getClipboardRichHtml(e);
        if (!html) return;
        e.preventDefault();
        openPastedHtml(html);
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
        windowClosing.send();
    };
}

import { useCallback, useMemo } from "react";
import { TComponentState } from "../../core/state/state";
import { DrawEditor, defaultDrawEditorState } from "./DrawEditor";
import { DrawBody } from "./DrawBody";
import { TextChrome } from "../base/TextChrome";
import { IconButton } from "../../uikit/IconButton";
import { WithMenu } from "../../uikit/Menu";
import type { MenuItem } from "../../uikit/Menu";
import { SunIcon, MoonIcon, CopyIcon, DownloadIcon, NewWindowIcon, SnipIcon } from "../../theme/icons";
import { exportAsSvgText, exportAsPngBlob, getImageDimensions, IMAGE_OFFSET_X, IMAGE_OFFSET_Y } from "./drawExport";
import { convertToExcalidrawElements, MIME_TYPES } from "@excalidraw/excalidraw";
import type { DataURL } from "@excalidraw/excalidraw/dist/types/excalidraw/types";
import type { FileId } from "@excalidraw/excalidraw/dist/types/excalidraw/element/types";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/dist/types/excalidraw/data/transform";
import { ui } from "../../api/ui";
import { fs } from "../../api/fs";
import { api } from "../../../ipc/renderer/api";
import { pagesModel } from "../../api/pages";
import { fpBasename } from "../../core/utils/file-path";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

interface DrawToolbarBitsProps {
    model: DrawEditor;
}

function DrawToolbarBits({ model: editor }: DrawToolbarBitsProps) {
    const { darkMode } = editor.state.use((s) => ({ darkMode: s.darkMode }));

    const getDefaultName = useCallback((ext: string): string => {
        const filePath = editor.host?.state.get().filePath;
        if (filePath) {
            const base = fpBasename(filePath).replace(/\.excalidraw$/i, "");
            return `${base}.${ext}`;
        }
        return `drawing.${ext}`;
    }, [editor]);

    const hasElements = useCallback((): boolean => {
        const a = editor.excalidrawApi;
        if (!a) return false;
        if (a.getSceneElements().length === 0) {
            ui.notify("Nothing to export — the drawing is empty", "warning");
            return false;
        }
        return true;
    }, [editor]);

    const handleCopyToClipboard = useCallback(async () => {
        const a = editor.excalidrawApi;
        if (!a || !hasElements()) return;
        const blob = await exportAsPngBlob(a);
        await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
        ]);
        await new Promise((resolve) => setTimeout(resolve, 300));
    }, [editor, hasElements]);

    const handleScreenSnip = useCallback(async () => {
        const a = editor.excalidrawApi;
        if (!a) return;
        const dataUrl = await api.startScreenSnip();
        if (!dataUrl) return;
        const dims = await getImageDimensions(dataUrl);
        const fileId = crypto.randomUUID();
        a.addFiles([{
            id: fileId as FileId,
            dataURL: dataUrl as DataURL,
            mimeType: MIME_TYPES.png,
            created: Date.now(),
        }]);
        const maxDim = 1200;
        const longer = Math.max(dims.width, dims.height);
        const scale = longer > maxDim ? maxDim / longer : 1;
        const w = Math.round(dims.width * scale);
        const h = Math.round(dims.height * scale);
        const newElements = convertToExcalidrawElements([{
            type: "image",
            x: IMAGE_OFFSET_X,
            y: IMAGE_OFFSET_Y,
            width: w,
            height: h,
            fileId: fileId as FileId,
            status: "saved",
        } satisfies ExcalidrawElementSkeleton]);
        const existing = a.getSceneElements();
        a.updateScene({ elements: [...existing, ...newElements] });
    }, [editor]);

    const saveMenuItems = useMemo((): MenuItem[] => [
        {
            label: "Save as SVG",
            onClick: async () => {
                const a = editor.excalidrawApi;
                if (!a || !hasElements()) return;
                try {
                    const svgText = await exportAsSvgText(a);
                    const savePath = await fs.showSaveDialog({
                        title: "Save as SVG",
                        defaultPath: getDefaultName("svg"),
                        filters: [{ name: "SVG", extensions: ["svg"] }],
                    });
                    if (savePath) await fs.write(savePath, svgText);
                } catch (e) {
                    ui.notify(`Export failed: ${(e as Error).message}`, "error");
                }
            },
        },
        {
            label: "Save as PNG",
            onClick: async () => {
                const a = editor.excalidrawApi;
                if (!a || !hasElements()) return;
                try {
                    const blob = await exportAsPngBlob(a);
                    const buffer = Buffer.from(await blob.arrayBuffer());
                    const savePath = await fs.showSaveDialog({
                        title: "Save as PNG",
                        defaultPath: getDefaultName("png"),
                        filters: [{ name: "PNG", extensions: ["png"] }],
                    });
                    if (savePath) await fs.saveBinaryFile(savePath, buffer);
                } catch (e) {
                    ui.notify(`Export failed: ${(e as Error).message}`, "error");
                }
            },
        },
    ], [editor, getDefaultName, hasElements]);

    const openMenuItems = useMemo((): MenuItem[] => [
        {
            label: "Open as SVG",
            onClick: async () => {
                const a = editor.excalidrawApi;
                if (!a || !hasElements()) return;
                try {
                    const svgText = await exportAsSvgText(a);
                    pagesModel.addEditorPage("svg-view", "xml", getDefaultName("svg"), svgText);
                } catch (e) {
                    ui.notify(`Export failed: ${(e as Error).message}`, "error");
                }
            },
        },
        {
            label: "Open as Image",
            onClick: async () => {
                const a = editor.excalidrawApi;
                if (!a || !hasElements()) return;
                try {
                    const blob = await exportAsPngBlob(a);
                    const blobUrl = URL.createObjectURL(blob);
                    pagesModel.openImageInNewTab(blobUrl);
                } catch (e) {
                    ui.notify(`Export failed: ${(e as Error).message}`, "error");
                }
            },
        },
    ], [editor, getDefaultName, hasElements]);

    return (
        <>
            <IconButton
                name="draw-theme"
                size="sm"
                title={darkMode ? "Switch to Light Theme" : "Switch to Dark Theme"}
                icon={darkMode ? <SunIcon /> : <MoonIcon />}
                onClick={editor.toggleDarkMode}
            />
            <IconButton
                name="draw-copy-image"
                size="sm"
                title="Copy Image to Clipboard"
                icon={<CopyIcon />}
                onClick={handleCopyToClipboard}
            />
            <WithMenu items={saveMenuItems}>
                {(setOpen) => (
                    <IconButton
                        name="draw-save"
                        size="sm"
                        title="Save as file"
                        icon={<DownloadIcon />}
                        onClick={(e) => setOpen(e.currentTarget)}
                    />
                )}
            </WithMenu>
            <WithMenu items={openMenuItems}>
                {(setOpen) => (
                    <IconButton
                        name="draw-open-new-tab"
                        size="sm"
                        title="Open in new tab"
                        icon={<NewWindowIcon />}
                        onClick={(e) => setOpen(e.currentTarget)}
                    />
                )}
            </WithMenu>
            <IconButton
                name="draw-snip"
                size="sm"
                title="Screen Snip"
                icon={<SnipIcon />}
                onClick={handleScreenSnip}
            />
        </>
    );
}

function DrawEditorView({ model }: { model: EditorModel }) {
    const draw = model as DrawEditor;
    return (
        <TextChrome
            model={model}
            rightToolbarContributions={<DrawToolbarBits model={draw} />}
        >
            <DrawBody model={draw} />
        </TextChrome>
    );
}

export const drawModule: EditorModule = {
    createEditor: () =>
        new DrawEditor(new TComponentState({ ...defaultDrawEditorState })),
    Component: DrawEditorView,
};

export { DrawEditor, defaultDrawEditorState };
export type { DrawEditorState, DrawQueueEvent } from "./DrawEditor";

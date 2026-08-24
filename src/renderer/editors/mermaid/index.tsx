import { useRef } from "react";
import { TComponentState } from "../../core/state/state";
import { MermaidEditor, defaultMermaidEditorState } from "./MermaidEditor";
import { MermaidBodyView } from "./MermaidBodyView";
import { TextChrome } from "../base/TextChrome";
import { IconButton } from "../../uikit";
import { mountVanilla } from "../../uikit/shared/mount";
import { CopyIcon, SunIcon, MoonIcon, SaveIcon } from "../../theme/icons";
import { DrawIcon, DrawOrangeIcon } from "../../theme/language-icons";
import { pagesModel } from "../../api/pages";
import {
    buildExcalidrawJsonWithImage,
    buildExcalidrawJsonFromMermaid,
    getImageDimensions,
} from "../draw/drawExport";
import { savePngViaDialog } from "../shared/image-export";
import { ui } from "../../api/ui";
import type { ImageViewportModel } from "../../uikit/ImageViewport";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

interface MermaidToolbarBitsProps {
    model: MermaidEditor;
    imageModel: React.MutableRefObject<ImageViewportModel | null>;
}

function MermaidToolbarBits({ model, imageModel }: MermaidToolbarBitsProps) {
    const { svgUrl, lightMode } = model.state.use((s) => ({
        svgUrl: s.svgUrl,
        lightMode: s.lightMode,
    }));

    const onOpenDraw = async () => {
        if (!svgUrl) return;
        // svgUrl is data:image/svg+xml,<percent-encoded> — decode to raw SVG,
        // re-encode as base64 for Draw editor.
        const svgText = decodeURIComponent(svgUrl.replace("data:image/svg+xml,", ""));
        const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svgText, "utf-8").toString("base64")}`;
        const dims = await getImageDimensions(dataUrl);
        const json = buildExcalidrawJsonWithImage(dataUrl, "image/svg+xml", dims.width, dims.height);
        const host = model.host;
        const title = (host?.state.get().title ?? "Mermaid").replace(/\.\w+$/, "") + ".excalidraw";
        pagesModel.addEditorPage("draw-view", "json", title, json);
    };

    const onConvertToExcalidraw = async () => {
        const source = model.host?.state.get().content?.trim();
        if (!source) return;
        const title =
            (model.host?.state.get().title ?? "Mermaid").replace(/\.\w+$/, "") + ".excalidraw";
        try {
            const { json, imageOnly } = await buildExcalidrawJsonFromMermaid(source);
            pagesModel.addEditorPage("draw-view", "json", title, json);
            if (imageOnly) {
                ui.notify(
                    "This diagram type can't be converted to editable shapes — opened as an image.",
                    "info",
                );
            }
        } catch {
            // Invalid Mermaid / parse failure → fall back to the rendered-SVG embed.
            ui.notify(
                "Couldn't convert to editable shapes — opening as an image instead.",
                "info",
            );
            await onOpenDraw();
        }
    };

    return (
        <>
            <IconButton
                name="mermaid-theme"
                size="sm"
                title={lightMode ? "Switch to Dark Theme" : "Switch to Light Theme"}
                onClick={model.toggleLightMode}
                icon={lightMode ? <MoonIcon /> : <SunIcon />}
            />
            <IconButton
                name="mermaid-open-draw"
                size="sm"
                title="Open in Drawing Editor"
                disabled={!svgUrl}
                onClick={onOpenDraw}
                icon={<DrawIcon />}
            />
            <IconButton
                name="mermaid-convert-excalidraw"
                size="sm"
                title="Convert to Excalidraw (editable shapes)"
                disabled={!svgUrl}
                onClick={onConvertToExcalidraw}
                icon={<DrawOrangeIcon />}
            />
            <IconButton
                name="mermaid-save"
                size="sm"
                title="Save as PNG"
                onClick={() => savePngViaDialog(model)}
                disabled={!svgUrl}
                icon={<SaveIcon />}
            />
            <IconButton
                name="mermaid-copy"
                size="sm"
                title="Copy Image to Clipboard (Ctrl+C)"
                onClick={() => imageModel.current?.copyToClipboard()}
                disabled={!svgUrl}
                icon={<CopyIcon />}
            />
        </>
    );
}

function MermaidEditorView({ model }: { model: EditorModel }) {
    const mermaid = model as MermaidEditor;
    // MR2 — keep the image viewport model in the view so the toolbar can invoke
    // its copy command without exposing a React component ref.
    const imageModel = useRef<ImageViewportModel | null>(null);
    return (
        <TextChrome
            model={model}
            rightToolbarContributions={<MermaidToolbarBits model={mermaid} imageModel={imageModel} />}
        >
            {mountVanilla(MermaidBodyView, {
                model: mermaid,
                imageModelSetter: (r) => {
                    imageModel.current = r;
                }
            })}
        </TextChrome>
    );
}

export const mermaidModule: EditorModule = {
    createEditor: () =>
        new MermaidEditor(new TComponentState({ ...defaultMermaidEditorState })),
    Component: MermaidEditorView,
    BodyView: MermaidBodyView,
};

export { MermaidEditor, defaultMermaidEditorState };
export type { MermaidEditorState, MermaidQueueEvent } from "./MermaidEditor";

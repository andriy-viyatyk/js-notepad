import { useRef } from "react";
import { TComponentState } from "../../core/state/state";
import { SvgEditor, defaultSvgEditorState } from "./SvgEditor";
import { SvgBody } from "./SvgBody";
import { TextChrome } from "../base/TextChrome";
import { IconButton } from "../../uikit";
import { CopyIcon, SaveIcon } from "../../theme/icons";
import { DrawIcon } from "../../theme/language-icons";
import { pagesModel } from "../../api/pages";
import { buildExcalidrawJsonWithImage, getImageDimensions } from "../draw/drawExport";
import { savePngViaDialog } from "../shared/image-export";
import type { ImageViewportRef } from "../../uikit/ImageViewport";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

interface SvgToolbarBitsProps {
    model: SvgEditor;
    imageRef: React.MutableRefObject<ImageViewportRef | null>;
}

function SvgToolbarBits({ model, imageRef }: SvgToolbarBitsProps) {
    const onOpenDraw = async () => {
        const host = model.host;
        if (!host) return;
        const svgContent = host.state.get().content;
        if (!svgContent.trim()) return;
        const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svgContent, "utf-8").toString("base64")}`;
        const dims = await getImageDimensions(dataUrl);
        const json = buildExcalidrawJsonWithImage(dataUrl, "image/svg+xml", dims.width, dims.height);
        const title = host.state.get().title.replace(/\.svg$/i, "") + ".excalidraw";
        pagesModel.addEditorPage("draw-view", "json", title, json);
    };

    return (
        <>
            <IconButton
                name="svg-open-draw"
                size="sm"
                title="Open in Drawing Editor"
                onClick={onOpenDraw}
                icon={<DrawIcon />}
            />
            <IconButton
                name="svg-save"
                size="sm"
                title="Save as PNG"
                onClick={() => savePngViaDialog(model)}
                icon={<SaveIcon />}
            />
            <IconButton
                name="svg-copy"
                size="sm"
                title="Copy Image to Clipboard (Ctrl+C)"
                onClick={() => imageRef.current?.copyToClipboard()}
                icon={<CopyIcon />}
            />
        </>
    );
}

function SvgEditorView({ model }: { model: EditorModel }) {
    const svg = model as SvgEditor;
    // SV2 — view-local imageRef bridges the BaseImageView imperative handle
    // to the toolbar's copy button. Held by the view (NOT the editor) because
    // it's a purely view-side imperative concern with no model/facade consumer.
    const imageRef = useRef<ImageViewportRef | null>(null);
    return (
        <TextChrome
            model={model}
            rightToolbarContributions={<SvgToolbarBits model={svg} imageRef={imageRef} />}
        >
            <SvgBody
                model={svg}
                imageRefSetter={(r) => {
                    imageRef.current = r;
                }}
            />
        </TextChrome>
    );
}

function SvgEmbeddedBody({ model }: { model: EditorModel }) {
    return <SvgBody model={model as SvgEditor} imageRefSetter={() => {}} />;
}

export const svgModule: EditorModule = {
    createEditor: () =>
        new SvgEditor(new TComponentState({ ...defaultSvgEditorState })),
    Component: SvgEditorView,
    Body: SvgEmbeddedBody,
};

export { SvgEditor, defaultSvgEditorState };
export type { SvgEditorState, SvgQueueEvent } from "./SvgEditor";

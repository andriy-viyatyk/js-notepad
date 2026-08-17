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
import type { ImageViewportModel } from "../../uikit/ImageViewport";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

interface SvgToolbarBitsProps {
    model: SvgEditor;
    imageModel: React.MutableRefObject<ImageViewportModel | null>;
}

function SvgToolbarBits({ model, imageModel }: SvgToolbarBitsProps) {
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
                onClick={() => imageModel.current?.copyToClipboard()}
                icon={<CopyIcon />}
            />
        </>
    );
}

function SvgEditorView({ model }: { model: EditorModel }) {
    const svg = model as SvgEditor;
    // SV2 — keep the image viewport model in the view so the toolbar can invoke
    // its copy command without exposing a React component ref.
    const imageModel = useRef<ImageViewportModel | null>(null);
    return (
        <TextChrome
            model={model}
            rightToolbarContributions={<SvgToolbarBits model={svg} imageModel={imageModel} />}
        >
            <SvgBody
                model={svg}
                imageModelSetter={(r) => {
                    imageModel.current = r;
                }}
            />
        </TextChrome>
    );
}

function SvgEmbeddedBody({ model, editorConfig }: { model: EditorModel; editorConfig?: import("../base/EditorConfig").EditorConfig }) {
    return <SvgBody model={model as SvgEditor} editorConfig={editorConfig} imageModelSetter={() => {}} />;
}

export const svgModule: EditorModule = {
    createEditor: () =>
        new SvgEditor(new TComponentState({ ...defaultSvgEditorState })),
    Component: SvgEditorView,
    Body: SvgEmbeddedBody,
};

export { SvgEditor, defaultSvgEditorState };
export type { SvgEditorState, SvgQueueEvent } from "./SvgEditor";

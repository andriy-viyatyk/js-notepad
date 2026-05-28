import { useRef } from "react";
import { TComponentState } from "../../core/state/state";
import { MermaidEditor, defaultMermaidEditorState } from "./MermaidEditor";
import { MermaidBody } from "./MermaidBody";
import { TextChrome } from "../base/v4/TextChrome";
import { IconButton } from "../../uikit";
import { CopyIcon, SunIcon, MoonIcon } from "../../theme/icons";
import { DrawIcon } from "../../theme/language-icons";
import { pagesModel } from "../../api/pages";
import { buildExcalidrawJsonWithImage, getImageDimensions } from "../draw/drawExport";
import type { BaseImageViewRef } from "../shared/BaseImageView";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel } from "../base/v4/EditorModel";

/**
 * EPIC-028 / US-562 — native Mermaid preview editor module. Registered with
 * the v4 `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor`
 * when the page's `mainEditorInstance` is a v4-native MermaidEditor instance.
 *
 * Three toolbar bits (mirrors today's MermaidView.tsx portal content):
 *   - theme toggle (sun/moon icon) — calls model.toggleLightMode
 *   - open-draw — converts svgUrl to base64 → opens in Draw editor
 *   - copy-image — delegates to BaseImageViewRef.copyToClipboard()
 *
 * Open-draw and copy buttons are gated on svgUrl presence (disabled during
 * load / on error).
 */

interface MermaidToolbarBitsProps {
    model: MermaidEditor;
    imageRef: React.MutableRefObject<BaseImageViewRef | null>;
}

function MermaidToolbarBits({ model, imageRef }: MermaidToolbarBitsProps) {
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
                name="mermaid-copy"
                size="sm"
                title="Copy Image to Clipboard (Ctrl+C)"
                onClick={() => imageRef.current?.copyToClipboard()}
                disabled={!svgUrl}
                icon={<CopyIcon />}
            />
        </>
    );
}

function MermaidEditorView({ model }: { model: EditorModel }) {
    const mermaid = model as MermaidEditor;
    // MR2 — view-local imageRef bridges the BaseImageView imperative handle
    // to the toolbar's copy button (mirrors SV2 from Svg). Held by the view
    // (NOT the editor) because it's a purely view-side imperative concern.
    const imageRef = useRef<BaseImageViewRef | null>(null);
    return (
        <TextChrome
            model={model}
            rightToolbarContributions={<MermaidToolbarBits model={mermaid} imageRef={imageRef} />}
        >
            <MermaidBody
                model={mermaid}
                imageRefSetter={(r) => {
                    imageRef.current = r;
                }}
            />
        </TextChrome>
    );
}

// US-579 — chrome-free Body for notebook per-note embedding. The theme/
// open-draw/copy toolbar buttons are page-chrome only, so the embedded Body
// passes a no-op imageRefSetter (no toolbar bridge needed).
function MermaidEmbeddedBody({ model }: { model: EditorModel }) {
    return <MermaidBody model={model as MermaidEditor} imageRefSetter={() => {}} />;
}

export const mermaidModule: EditorModule = {
    createEditor: () =>
        new MermaidEditor(new TComponentState({ ...defaultMermaidEditorState })),
    Component: MermaidEditorView,
    Body: MermaidEmbeddedBody,
};

export { MermaidEditor, defaultMermaidEditorState };
export type { MermaidEditorState, MermaidQueueEvent } from "./MermaidEditor";

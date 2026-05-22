import { useCallback, useRef } from "react";
import { TComponentState } from "../../core/state/state";
import { GraphEditor, defaultGraphEditorState } from "./GraphEditor";
import { GraphBody } from "./GraphBody";
import { TextChrome } from "../base/v4/TextChrome";
import { IconButton } from "../../uikit";
import { CopyIcon } from "../../theme/icons";
import { DrawIcon } from "../../theme/language-icons";
import { pagesModel } from "../../api/pages";
import { buildExcalidrawJsonWithImage } from "../draw/drawExport";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel as V4EditorModel } from "../base/v4/EditorModel";
import color from "../../theme/color";

/**
 * EPIC-028 / US-564 — native Graph editor module. Registered with the v4
 * `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor` when
 * the page's `mainEditorV4` is a v4-native GraphEditor instance.
 *
 * Right-toolbar bits (relocates legacy GraphView's portal toolbar buttons):
 *   - open-in-draw — converts canvas to dataURL → opens in Draw editor
 *   - copy-image — canvas.toBlob → clipboard
 *
 * Footer bits (relocates legacy GraphView's portal footer):
 *   - statusHint (italic, warning color) when hovering an alt+click target
 *   - recordsCount ("N nodes" or "N of M nodes")
 */

interface GraphToolbarBitsProps {
    model: GraphEditor;
    canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
}

function GraphToolbarBits({ model: editor, canvasRef }: GraphToolbarBitsProps) {
    const onOpenDraw = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dataUrl = canvas.toDataURL("image/png");
        const json = buildExcalidrawJsonWithImage(dataUrl, "image/png", canvas.width, canvas.height);
        const host = editor.host;
        const title = (host?.state.get().title ?? "Graph").replace(/\.fg\.json$/i, "") + ".excalidraw";
        pagesModel.addEditorPage("draw-view", "json", title, json);
    };

    const onCopyImage = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.toBlob((blob) => {
            if (blob) {
                navigator.clipboard.write([
                    new ClipboardItem({ "image/png": blob }),
                ]);
            }
        }, "image/png");
    };

    return (
        <>
            <IconButton
                name="graph-open-in-draw"
                size="sm"
                icon={<DrawIcon />}
                title="Open in Drawing Editor"
                onClick={onOpenDraw}
            />
            <IconButton
                name="graph-copy-image"
                size="sm"
                icon={<CopyIcon />}
                title="Copy Image to Clipboard"
                onClick={onCopyImage}
            />
        </>
    );
}

function GraphFooterBits({ model: editor }: { model: GraphEditor }) {
    const { statusHint } = editor.state.use((s) => ({ statusHint: s.statusHint }));
    // recordsCount is a getter that reads from dataModel + renderer (not from
    // state slice). Subscribe to state so the count refreshes on every mutation
    // (selection, parse, expand/collapse) — the state.use above already does
    // this implicitly via React's render cycle.
    return (
        <>
            {statusHint && (
                <span style={{ fontStyle: "italic", color: color.warning.text, marginRight: 12 }}>
                    {statusHint}
                </span>
            )}
            <span>{editor.recordsCount}</span>
        </>
    );
}

function GraphEditorView({ model }: { model: V4EditorModel }) {
    const graph = model as GraphEditor;
    // GR2 — view-local canvasRef bridges the canvas element to the toolbar's
    // open-draw / copy-image buttons (mirrors SV2 from Svg / MR2 from Mermaid).
    // Held by the view (NOT the editor) because it's a purely view-side
    // imperative concern.
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    // STABLE callback identity. Without useCallback, a fresh arrow on every
    // render of GraphEditorView would propagate as a new prop to GraphBody,
    // making the body's canvas-ref useCallback recompute → React calls the
    // OLD ref with null and the NEW ref with the canvas. That double-call
    // (`setCanvas(null)` → `setCanvas(canvas)`) reinitializes the D3 force
    // simulation on every parent re-render, producing a visibly different
    // layout on tab-switch-back. The useRef object itself is stable across
    // renders, so this callback never needs to recompute.
    const setCanvas = useCallback((c: HTMLCanvasElement | null) => {
        canvasRef.current = c;
    }, []);
    return (
        <TextChrome
            model={model}
            rightToolbarContributions={<GraphToolbarBits model={graph} canvasRef={canvasRef} />}
            footerContributions={<GraphFooterBits model={graph} />}
        >
            <GraphBody model={graph} canvasRefSetter={setCanvas} />
        </TextChrome>
    );
}

export const graphModule: EditorModule = {
    createEditor: () =>
        new GraphEditor(new TComponentState({ ...defaultGraphEditorState })),
    Component: GraphEditorView,
};

export { GraphEditor, defaultGraphEditorState };
export type { GraphEditorState, GraphQueueEvent, TooltipInfo } from "./GraphEditor";

import { createElement } from "react";
import { EditorErrorBoundary } from "../../ui/app/EditorErrorBoundary";
import { TComponentState } from "../../core/state/state";
import { GraphEditor, defaultGraphEditorState } from "./GraphEditor";
import { GraphBody } from "./GraphBody";
import { TextChromeView } from "../base/TextChromeView";
import { IconButtonView, type IconButtonViewProps } from "../../uikit/IconButton/IconButtonView";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { createIconComponentElement } from "../../theme/icons";
import { DrawIcon } from "../../theme/language-icons";
import { pagesModel } from "../../api/pages";
import { buildExcalidrawJsonWithImage } from "../draw/drawExport";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";
import color from "../../theme/color";

function createContentsRoot(): HTMLSpanElement {
    const root = document.createElement("span");
    root.style.display = "contents";
    return root;
}

function requireGraphModel(model: EditorModel): GraphEditor {
    if (!(model instanceof GraphEditor)) throw new Error("Graph view received an invalid model.");
    return model;
}

interface GraphToolbarProps {
    model: GraphEditor;
    getCanvas: () => HTMLCanvasElement | null;
}

class GraphToolbarView extends VanillaView<GraphToolbarProps> {
    private model: GraphEditor;
    private readonly getCanvas: () => HTMLCanvasElement | null;
    private readonly drawIcon = createIconComponentElement(DrawIcon);
    private openDrawButton: IconButtonView | undefined;
    private copyImageButton: IconButtonView | undefined;

    public constructor(props: GraphToolbarProps) {
        super(props, createContentsRoot());
        this.model = props.model;
        this.getCanvas = props.getCanvas;
    }

    protected onMount(): void {
        this.openDrawButton = this.child(new IconButtonView(this.openDrawButtonProps()));
        this.copyImageButton = this.child(new IconButtonView(this.copyImageButtonProps()));
        this.root.append(this.openDrawButton.root, this.copyImageButton.root);
        this.openDrawButton.mount();
        this.copyImageButton.mount();
    }

    protected onUpdate(props: GraphToolbarProps): void {
        this.model = props.model;
        this.openDrawButton?.update(this.openDrawButtonProps());
        this.copyImageButton?.update(this.copyImageButtonProps());
    }

    protected onDispose(): void {
        this.openDrawButton = undefined;
        this.copyImageButton = undefined;
    }

    private openDrawButtonProps(): IconButtonViewProps {
        return {
            name: "graph-open-in-draw",
            size: "sm",
            icon: this.drawIcon,
            title: "Open in Drawing Editor",
            onClick: this.openInDraw,
        };
    }

    private copyImageButtonProps(): IconButtonViewProps {
        return {
            name: "graph-copy-image",
            size: "sm",
            icon: "copy",
            title: "Copy Image to Clipboard",
            onClick: this.copyImage,
        };
    }

    private readonly openInDraw = (): void => {
        const canvas = this.getCanvas();
        if (!canvas) return;
        const dataUrl = canvas.toDataURL("image/png");
        const json = buildExcalidrawJsonWithImage(dataUrl, "image/png", canvas.width, canvas.height);
        const host = this.model.host;
        const title = (host?.state.get().title ?? "Graph").replace(/\.fg\.json$/i, "") + ".excalidraw";
        pagesModel.addEditorPage("draw-view", "json", title, json);
    };

    private readonly copyImage = (): void => {
        const canvas = this.getCanvas();
        if (!canvas) return;
        canvas.toBlob((blob) => {
            if (blob) {
                navigator.clipboard.write([
                    new ClipboardItem({ "image/png": blob }),
                ]);
            }
        }, "image/png");
    };
}

class GraphFooterView extends VanillaView<{ model: GraphEditor }> {
    private model: GraphEditor;
    private readonly warning = document.createElement("span");
    private readonly count = document.createElement("span");

    public constructor(props: { model: GraphEditor }) {
        super(props, createContentsRoot());
        this.model = props.model;
        this.warning.style.fontStyle = "italic";
        this.warning.style.color = color.warning.text;
        this.warning.style.marginRight = "12px";
    }

    protected onMount(): void {
        this.root.append(this.warning, this.count);
        this.bind(this.model.state, (state) => state.statusHint, this.updateWarning);
        this.bind(this.model.recordsCountState, (value) => value, this.updateCount);
    }

    protected onUpdate(props: { model: GraphEditor }): void {
        if (props.model !== this.model) {
            this.model = props.model;
            this.updateWarning(this.model.state.get().statusHint);
            this.updateCount(this.model.recordsCountState.get());
        }
    }

    private readonly updateWarning = (statusHint: string): void => {
        this.warning.textContent = statusHint;
        this.warning.hidden = statusHint.length === 0;
    };

    private readonly updateCount = (recordsCount: string): void => {
        this.count.textContent = recordsCount;
    };
}

function graphBodyElement(model: GraphEditor, canvasRefSetter: (canvas: HTMLCanvasElement | null) => void) {
    return createElement(
        EditorErrorBoundary,
        null,
        createElement(GraphBody, { model, canvasRefSetter }),
    );
}

export class GraphEditorView extends VanillaView<{ model: EditorModel }> {
    private model: GraphEditor | undefined;
    private toolbar: GraphToolbarView | undefined;
    private footer: GraphFooterView | undefined;
    private chrome: TextChromeView | undefined;
    private canvas: HTMLCanvasElement | null = null;

    public constructor(props: { model: EditorModel }) {
        super(props, createContentsRoot());
    }

    protected onMount(): void {
        const model = requireGraphModel(this.props.model);
        const toolbar = this.child(new GraphToolbarView({
            model,
            getCanvas: this.getCanvas,
        }));
        const footer = this.child(new GraphFooterView({ model }));
        const chrome = this.child(new TextChromeView({
            model: this.props.model,
            rightToolbarContributions: toolbar.root,
            footerContributions: footer.root,
            children: graphBodyElement(model, this.setCanvas),
        }));

        this.model = model;
        this.toolbar = toolbar;
        this.footer = footer;
        this.chrome = chrome;
        this.root.append(toolbar.root, footer.root, chrome.root);
        toolbar.mount();
        footer.mount();
        chrome.mount();
    }

    protected onUpdate(props: { model: EditorModel }): void {
        const model = requireGraphModel(props.model);
        this.model = model;
        this.toolbar?.update({ model, getCanvas: this.getCanvas });
        this.footer?.update({ model });
        this.chrome?.update({
            model: props.model,
            rightToolbarContributions: this.toolbar?.root,
            footerContributions: this.footer?.root,
            children: graphBodyElement(model, this.setCanvas),
        });
    }

    protected onDispose(): void {
        this.canvas = null;
        this.model = undefined;
        this.toolbar = undefined;
        this.footer = undefined;
        this.chrome = undefined;
    }

    private readonly getCanvas = (): HTMLCanvasElement | null => this.canvas;

    private readonly setCanvas = (canvas: HTMLCanvasElement | null): void => {
        this.canvas = canvas;
    };
}

export const graphModule: EditorModule = {
    createEditor: () =>
        new GraphEditor(new TComponentState({ ...defaultGraphEditorState })),
    View: GraphEditorView,
};

export { GraphEditor, defaultGraphEditorState };
export type { GraphEditorState, GraphQueueEvent, TooltipInfo } from "./GraphEditor";

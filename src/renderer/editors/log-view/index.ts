import { TComponentState } from "../../core/state/state";
import { LogViewEditor, defaultLogViewEditorState } from "./LogViewEditor";
import { LogBodyView } from "./LogBodyView";
import { TextChromeView } from "../base/TextChromeView";
import { IconButtonView, type IconButtonViewProps } from "../../uikit/IconButton/IconButtonView";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { showConfirmationDialog } from "../../ui/dialogs/ConfirmationDialog";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function createContentsRoot(): HTMLSpanElement {
    const root = document.createElement("span");
    root.style.display = "contents";
    return root;
}

function createTimestampIconElement(active: boolean): SVGElement {
    const element = document.createElementNS(SVG_NAMESPACE, "svg");
    element.setAttribute("width", "16");
    element.setAttribute("height", "16");
    element.setAttribute("viewBox", "0 0 16 16");
    element.setAttribute("fill", "none");

    const opacity = active ? "1" : "0.5";
    const circle = document.createElementNS(SVG_NAMESPACE, "circle");
    circle.setAttribute("cx", "8");
    circle.setAttribute("cy", "8");
    circle.setAttribute("r", "6.5");
    circle.setAttribute("stroke", "currentColor");
    circle.setAttribute("stroke-width", "1");
    circle.setAttribute("opacity", opacity);

    const hands = document.createElementNS(SVG_NAMESPACE, "polyline");
    hands.setAttribute("points", "8,4 8,8 11,10");
    hands.setAttribute("stroke", "currentColor");
    hands.setAttribute("stroke-width", "1");
    hands.setAttribute("stroke-linecap", "round");
    hands.setAttribute("stroke-linejoin", "round");
    hands.setAttribute("opacity", opacity);

    element.append(circle, hands);
    return element;
}

function createClearIconElement(): SVGElement {
    const element = document.createElementNS(SVG_NAMESPACE, "svg");
    element.setAttribute("width", "16");
    element.setAttribute("height", "16");
    element.setAttribute("viewBox", "0 0 16 16");
    element.setAttribute("fill", "none");

    const path = document.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute("d", "M2 5h8M2 8h5M2 11h3M10.5 5.5l4 4M14.5 5.5l-4 4");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.1");
    path.setAttribute("stroke-linecap", "round");
    element.append(path);
    return element;
}

function requireLogModel(model: EditorModel): LogViewEditor {
    if (!(model instanceof LogViewEditor)) throw new Error("Log view received an invalid model.");
    return model;
}

class LogToolbarBitsView extends VanillaView<{ model: LogViewEditor }> {
    private model: LogViewEditor;
    private clearButton: IconButtonView | undefined;
    private timestampButton: IconButtonView | undefined;
    private stateSubscription: (() => void) | undefined;

    public constructor(props: { model: LogViewEditor }) {
        super(props, createContentsRoot());
        this.model = props.model;
    }

    protected onMount(): void {
        this.clearButton = this.child(new IconButtonView(this.clearButtonProps()));
        this.timestampButton = this.child(new IconButtonView(this.timestampButtonProps()));
        this.root.append(this.clearButton.root, this.timestampButton.root);
        this.clearButton.mount();
        this.timestampButton.mount();
        this.bindState();
        this.own(() => {
            this.stateSubscription?.();
            this.stateSubscription = undefined;
        });
    }

    protected onUpdate(props: { model: LogViewEditor }): void {
        if (props.model !== this.model) {
            this.model = props.model;
            this.bindState();
        }
        this.sync(this.model.state.get().showTimestamps);
    }

    protected onDispose(): void {
        this.clearButton = undefined;
        this.timestampButton = undefined;
    }

    private bindState(): void {
        this.stateSubscription?.();
        this.stateSubscription = this.model.state.subscribe<boolean>(
            (showTimestamps) => this.sync(showTimestamps),
            (state) => state.showTimestamps,
        );
    }

    private sync(showTimestamps: boolean): void {
        this.timestampButton?.update(this.timestampButtonProps(showTimestamps));
    }

    private clearButtonProps(): IconButtonViewProps {
        return {
            name: "log-clear",
            size: "sm",
            icon: createClearIconElement(),
            title: "Clear log",
            onClick: async () => {
                const result = await showConfirmationDialog({ message: "Clear all log entries?" });
                if (result === "Yes") this.model.clear();
            },
        };
    }

    private timestampButtonProps(showTimestamps = this.model.state.get().showTimestamps): IconButtonViewProps {
        return {
            name: "log-toggle-timestamps",
            size: "sm",
            icon: createTimestampIconElement(showTimestamps),
            title: showTimestamps ? "Hide timestamps" : "Show timestamps",
            onClick: this.model.toggleTimestamps,
        };
    }
}

export class LogViewEditorView extends VanillaView<{ model: EditorModel }> {
    private readonly body: LogBodyView;
    private readonly toolbar: LogToolbarBitsView;
    private readonly chrome: TextChromeView;
    private model: LogViewEditor;

    public constructor(props: { model: EditorModel }) {
        const model = requireLogModel(props.model);
        const body = new LogBodyView({ model });
        const toolbar = new LogToolbarBitsView({ model });
        const chrome = new TextChromeView({
            model: props.model,
            children: body.root,
            toolbarContributions: toolbar.root,
        });
        super(props, chrome.root);
        this.model = model;
        this.body = this.child(body);
        this.toolbar = this.child(toolbar);
        this.chrome = this.child(chrome);
    }

    protected onMount(): void {
        this.body.mount();
        this.toolbar.mount();
        this.chrome.mount();
    }

    protected onUpdate(props: { model: EditorModel }): void {
        this.model = requireLogModel(props.model);
        this.body.update({ model: this.model });
        this.toolbar.update({ model: this.model });
        this.chrome.update({
            model: props.model,
            children: this.body.root,
            toolbarContributions: this.toolbar.root,
        });
    }
}

export const logViewModule: EditorModule = {
    createEditor: () =>
        new LogViewEditor(new TComponentState({ ...defaultLogViewEditorState })),
    View: LogViewEditorView,
};

export { LogViewEditor, defaultLogViewEditorState };
export type { LogViewEditorState, LogQueueEvent } from "./LogViewEditor";

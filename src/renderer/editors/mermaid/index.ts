import { TComponentState } from "../../core/state/state";
import { MermaidEditor, defaultMermaidEditorState, type MermaidEditorState } from "./MermaidEditor";
import { MermaidBodyView } from "./MermaidBodyView";
import { TextChromeView } from "../base/TextChromeView";
import { IconButtonView, type IconButtonViewProps } from "../../uikit/IconButton/IconButtonView";
import { DrawIcon, DrawOrangeIcon } from "../../theme/language-icons";
import { createIconComponentElement } from "../../theme/icons";
import { savePngViaDialog } from "../shared/image-export";
import { ui } from "../../api/ui";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";
import { errMessage } from "../../../shared/utils";

function createContentsRoot(): HTMLSpanElement {
    const root = document.createElement("span");
    root.style.display = "contents";
    return root;
}

function requireMermaidModel(model: EditorModel): MermaidEditor {
    if (!(model instanceof MermaidEditor)) throw new Error("Mermaid view received an invalid model.");
    return model;
}

interface MermaidToolbarProps {
    model: MermaidEditor;
    copyImage: () => void;
}

interface MermaidToolbarProjection {
    svgUrl: string;
    lightMode: boolean;
}

function selectMermaidToolbar(state: MermaidEditorState): MermaidToolbarProjection {
    return {
        svgUrl: state.svgUrl,
        lightMode: state.lightMode,
    };
}

class MermaidToolbarBitsView extends VanillaView<MermaidToolbarProps> {
    private model: MermaidEditor;
    private copyImage: () => void;
    private themeButton: IconButtonView | undefined;
    private openDrawButton: IconButtonView | undefined;
    private convertButton: IconButtonView | undefined;
    private saveButton: IconButtonView | undefined;
    private copyButton: IconButtonView | undefined;
    private drawIcon: SVGElement | undefined;
    private drawOrangeIcon: SVGElement | undefined;
    private stateSubscription: (() => void) | undefined;

    public constructor(props: MermaidToolbarProps) {
        super(props, createContentsRoot());
        this.model = props.model;
        this.copyImage = props.copyImage;
    }

    protected onMount(): void {
        this.drawIcon = createIconComponentElement(DrawIcon);
        this.drawOrangeIcon = createIconComponentElement(DrawOrangeIcon);
        this.themeButton = this.child(new IconButtonView(this.themeButtonProps(false)));
        this.openDrawButton = this.child(new IconButtonView(this.openDrawButtonProps("")));
        this.convertButton = this.child(new IconButtonView(this.convertButtonProps("")));
        this.saveButton = this.child(new IconButtonView(this.saveButtonProps("")));
        this.copyButton = this.child(new IconButtonView(this.copyButtonProps("")));
        this.root.append(
            this.themeButton.root,
            this.openDrawButton.root,
            this.convertButton.root,
            this.saveButton.root,
            this.copyButton.root,
        );
        this.themeButton.mount();
        this.openDrawButton.mount();
        this.convertButton.mount();
        this.saveButton.mount();
        this.copyButton.mount();
        this.bindState();
        this.sync(selectMermaidToolbar(this.model.state.get()));
        this.own(() => {
            this.stateSubscription?.();
            this.stateSubscription = undefined;
        });
    }

    protected onUpdate(props: MermaidToolbarProps): void {
        this.copyImage = props.copyImage;
        if (props.model !== this.model) {
            this.model = props.model;
            this.bindState();
        }
        this.sync(selectMermaidToolbar(this.model.state.get()));
    }

    protected onDispose(): void {
        this.themeButton = undefined;
        this.openDrawButton = undefined;
        this.convertButton = undefined;
        this.saveButton = undefined;
        this.copyButton = undefined;
        this.drawIcon = undefined;
        this.drawOrangeIcon = undefined;
    }

    private bindState(): void {
        this.stateSubscription?.();
        this.stateSubscription = this.ownSubscription(this.model.state.subscribe(
            (projection: MermaidToolbarProjection) => this.sync(projection),
            selectMermaidToolbar,
        ));
    }

    private sync(projection: MermaidToolbarProjection): void {
        this.themeButton?.update(this.themeButtonProps(projection.lightMode));
        this.openDrawButton?.update(this.openDrawButtonProps(projection.svgUrl));
        this.convertButton?.update(this.convertButtonProps(projection.svgUrl));
        this.saveButton?.update(this.saveButtonProps(projection.svgUrl));
        this.copyButton?.update(this.copyButtonProps(projection.svgUrl));
    }

    private themeButtonProps(lightMode: boolean): IconButtonViewProps {
        return {
            name: "mermaid-theme",
            size: "sm",
            title: lightMode ? "Switch to Dark Theme" : "Switch to Light Theme",
            onClick: this.model.toggleLightMode,
            icon: lightMode ? "moon" : "sun",
        };
    }

    private openDrawButtonProps(svgUrl: string): IconButtonViewProps {
        return {
            name: "mermaid-open-draw",
            size: "sm",
            title: "Open in Drawing Editor",
            disabled: !svgUrl,
            onClick: this.onOpenDraw,
            icon: this.drawIcon ?? createIconComponentElement(DrawIcon),
        };
    }

    private convertButtonProps(svgUrl: string): IconButtonViewProps {
        return {
            name: "mermaid-convert-excalidraw",
            size: "sm",
            title: "Convert to Excalidraw (editable shapes)",
            disabled: !svgUrl,
            onClick: this.onConvertToExcalidraw,
            icon: this.drawOrangeIcon ?? createIconComponentElement(DrawOrangeIcon),
        };
    }

    private saveButtonProps(svgUrl: string): IconButtonViewProps {
        return {
            name: "mermaid-save",
            size: "sm",
            title: "Save as PNG",
            onClick: () => { void savePngViaDialog(this.model); },
            disabled: !svgUrl,
            icon: "save",
        };
    }

    private copyButtonProps(svgUrl: string): IconButtonViewProps {
        return {
            name: "mermaid-copy",
            size: "sm",
            title: "Copy Image to Clipboard (Ctrl+C)",
            onClick: this.copyImage,
            disabled: !svgUrl,
            icon: "copy",
        };
    }

    private readonly onOpenDraw = (): void => {
        void this.model.openInDrawingEditor().catch((error: unknown) => {
            ui.notify(`Failed to open Mermaid in Drawing Editor: ${errMessage(error)}`, "error");
        });
    };

    private readonly onConvertToExcalidraw = (): void => {
        void this.model.convertToExcalidraw().catch((error: unknown) => {
            ui.notify(`Failed to convert Mermaid diagram: ${errMessage(error)}`, "error");
        });
    };
}

export class MermaidEditorView extends VanillaView<{ model: EditorModel }> {
    private model: MermaidEditor | undefined;
    private body: MermaidBodyView | undefined;
    private toolbar: MermaidToolbarBitsView | undefined;
    private chrome: TextChromeView | undefined;

    public constructor(props: { model: EditorModel }) {
        super(props, createContentsRoot());
    }

    protected onMount(): void {
        const model = requireMermaidModel(this.props.model);
        this.model = model;
        const body = this.child(new MermaidBodyView({
            model,
        }));
        const toolbar = this.child(new MermaidToolbarBitsView({
            model,
            copyImage: body.copyImage,
        }));
        const chrome = this.child(new TextChromeView({
            model: this.props.model,
            children: body.root,
            rightToolbarContributions: toolbar.root,
        }));
        this.body = body;
        this.toolbar = toolbar;
        this.chrome = chrome;
        this.root.append(body.root, toolbar.root, chrome.root);
        body.mount();
        toolbar.mount();
        chrome.mount();
    }

    protected onUpdate(props: { model: EditorModel }): void {
        const model = requireMermaidModel(props.model);
        this.model = model;
        const body = this.body;
        const toolbar = this.toolbar;
        const chrome = this.chrome;
        if (!body || !toolbar || !chrome) return;
        body.update({ model });
        toolbar.update({ model, copyImage: body.copyImage });
        chrome.update({
            model: props.model,
            children: body.root,
            rightToolbarContributions: toolbar.root,
        });
    }

    protected onDispose(): void {
        this.model = undefined;
        this.body = undefined;
        this.toolbar = undefined;
        this.chrome = undefined;
    }

}

export const mermaidModule: EditorModule = {
    createEditor: () =>
        new MermaidEditor(new TComponentState({ ...defaultMermaidEditorState })),
    View: MermaidEditorView,
    BodyView: MermaidBodyView,
};

export { MermaidEditor, defaultMermaidEditorState };
export type { MermaidEditorState, MermaidQueueEvent } from "./MermaidEditor";

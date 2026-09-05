import { TComponentState } from "../../core/state/state";
import { SvgEditor, defaultSvgEditorState } from "./SvgEditor";
import { SvgBodyView } from "./SvgBodyView";
import { TextChromeView } from "../base/TextChromeView";
import { IconButtonView, type IconButtonViewProps } from "../../uikit/IconButton/IconButtonView";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { DrawIcon } from "../../theme/language-icons";
import { createIconComponentElement } from "../../theme/icons";
import { savePngViaDialog } from "../shared/image-export";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";
import { ui } from "../../api/ui";
import { errMessage } from "../../../shared/utils";

function createContentsRoot(): HTMLSpanElement {
    const root = document.createElement("span");
    root.style.display = "contents";
    return root;
}

function requireSvgModel(model: EditorModel): SvgEditor {
    if (!(model instanceof SvgEditor)) throw new Error("SVG view received an invalid model.");
    return model;
}

interface SvgToolbarBitsViewProps {
    model: SvgEditor;
    copyImage: () => void;
}

class SvgToolbarBitsView extends VanillaView<SvgToolbarBitsViewProps> {
    private model: SvgEditor;
    private copyImage: () => void;
    private openDrawButton: IconButtonView | undefined;
    private saveButton: IconButtonView | undefined;
    private copyButton: IconButtonView | undefined;
    private drawIcon!: SVGElement;

    public constructor(props: SvgToolbarBitsViewProps) {
        super(props, createContentsRoot());
        this.model = props.model;
        this.copyImage = props.copyImage;
    }

    protected onMount(): void {
        this.drawIcon = createIconComponentElement(DrawIcon);
        this.openDrawButton = this.child(new IconButtonView(this.openDrawButtonProps()));
        this.saveButton = this.child(new IconButtonView(this.saveButtonProps()));
        this.copyButton = this.child(new IconButtonView(this.copyButtonProps()));
        this.root.append(this.openDrawButton.root, this.saveButton.root, this.copyButton.root);
        this.openDrawButton.mount();
        this.saveButton.mount();
        this.copyButton.mount();
    }

    protected onUpdate(props: SvgToolbarBitsViewProps): void {
        this.model = props.model;
        this.copyImage = props.copyImage;
        this.openDrawButton?.update(this.openDrawButtonProps());
        this.saveButton?.update(this.saveButtonProps());
        this.copyButton?.update(this.copyButtonProps());
    }

    protected onDispose(): void {
        this.openDrawButton = undefined;
        this.saveButton = undefined;
        this.copyButton = undefined;
    }

    private readonly onOpenDraw = async (): Promise<void> => {
        try {
            await this.model.openInDrawingEditor();
        } catch (error) {
            ui.notify(`Failed to open SVG in Drawing Editor: ${errMessage(error)}`, "error");
        }
    };

    private openDrawButtonProps(): IconButtonViewProps {
        return {
            name: "svg-open-draw",
            size: "sm",
            title: "Open in Drawing Editor",
            onClick: () => { void this.onOpenDraw(); },
            icon: this.drawIcon,
        };
    }

    private saveButtonProps(): IconButtonViewProps {
        return {
            name: "svg-save",
            size: "sm",
            title: "Save as PNG",
            onClick: () => { void savePngViaDialog(this.model); },
            icon: "save",
        };
    }

    private copyButtonProps(): IconButtonViewProps {
        return {
            name: "svg-copy",
            size: "sm",
            title: "Copy Image to Clipboard (Ctrl+C)",
            onClick: this.copyImage,
            icon: "copy",
        };
    }
}

export class SvgEditorView extends VanillaView<{ model: EditorModel }> {
    private readonly body: SvgBodyView;
    private readonly toolbar: SvgToolbarBitsView;
    private readonly chrome: TextChromeView;
    private model: SvgEditor;

    public constructor(props: { model: EditorModel }) {
        const model = requireSvgModel(props.model);
        const body = new SvgBodyView({ model });
        const toolbar = new SvgToolbarBitsView({
            model,
            copyImage: body.copyImage,
        });
        const chrome = new TextChromeView({
            model: props.model,
            children: body.root,
            rightToolbarContributions: toolbar.root,
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
        this.model = requireSvgModel(props.model);
        this.body.update({ model: this.model });
        this.toolbar.update({ model: this.model, copyImage: this.body.copyImage });
        this.chrome.update({
            model: props.model,
            children: this.body.root,
            rightToolbarContributions: this.toolbar.root,
        });
    }
}

export const svgModule: EditorModule = {
    createEditor: () =>
        new SvgEditor(new TComponentState({ ...defaultSvgEditorState })),
    View: SvgEditorView,
    BodyView: SvgBodyView,
};

export { SvgEditor, defaultSvgEditorState };
export type { SvgEditorState, SvgQueueEvent } from "./SvgEditor";

import { TComponentState } from "../../core/state/state";
import { SvgEditor, defaultSvgEditorState } from "./SvgEditor";
import { SvgBodyView } from "./SvgBodyView";
import { TextChromeView } from "../base/TextChromeView";
import { IconButtonView, type IconButtonViewProps } from "../../uikit/IconButton/IconButtonView";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { DrawIcon } from "../../theme/language-icons";
import { createIconComponentElement } from "../../theme/icons";
import { pagesModel } from "../../api/pages";
import { buildExcalidrawJsonWithImage, getImageDimensions } from "../draw/drawExport";
import { savePngViaDialog } from "../shared/image-export";
import type { ImageViewportModel } from "../../uikit/ImageViewport";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function createContentsRoot(): HTMLSpanElement {
    const root = document.createElement("span");
    root.style.display = "contents";
    return root;
}

function requireSvgModel(model: EditorModel): SvgEditor {
    if (!(model instanceof SvgEditor)) throw new Error("SVG view received an invalid model.");
    return model;
}

class SvgToolbarBitsView extends VanillaView<{ model: SvgEditor }> {
    private model: SvgEditor;
    private imageModel: ImageViewportModel | null = null;
    private openDrawButton: IconButtonView | undefined;
    private saveButton: IconButtonView | undefined;
    private copyButton: IconButtonView | undefined;
    private drawIcon!: SVGElement;

    public constructor(props: { model: SvgEditor }) {
        super(props, createContentsRoot());
        this.model = props.model;
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

    protected onUpdate(props: { model: SvgEditor }): void {
        this.model = props.model;
        this.openDrawButton?.update(this.openDrawButtonProps());
        this.saveButton?.update(this.saveButtonProps());
        this.copyButton?.update(this.copyButtonProps());
    }

    protected onDispose(): void {
        this.imageModel = null;
        this.openDrawButton = undefined;
        this.saveButton = undefined;
        this.copyButton = undefined;
    }

    public readonly setImageModel = (model: ImageViewportModel | null): void => {
        this.imageModel = model;
    };

    private readonly onOpenDraw = async (): Promise<void> => {
        const host = this.model.host;
        if (!host) return;
        const svgContent = host.state.get().content;
        if (!svgContent.trim()) return;
        const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svgContent, "utf-8").toString("base64")}`;
        const dims = await getImageDimensions(dataUrl);
        const json = buildExcalidrawJsonWithImage(dataUrl, "image/svg+xml", dims.width, dims.height);
        const title = host.state.get().title.replace(/\.svg$/i, "") + ".excalidraw";
        pagesModel.addEditorPage("draw-view", "json", title, json);
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
            onClick: () => this.imageModel?.copyToClipboard(),
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
        const toolbar = new SvgToolbarBitsView({ model });
        const body = new SvgBodyView({ model, imageModelSetter: toolbar.setImageModel });
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
        this.body.update({ model: this.model, imageModelSetter: this.toolbar.setImageModel });
        this.toolbar.update({ model: this.model });
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

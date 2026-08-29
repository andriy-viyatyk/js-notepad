import { PageToolbarView } from "../base/PageToolbarView";
import type { EditorModel } from "../base/EditorModel";
import { ImageViewportView } from "../../uikit/ImageViewport/ImageViewportView";
import type { ImageViewportProps } from "../../uikit/ImageViewport/ImageViewport";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { fpBasename } from "../../core/utils/file-path";
import { ImageEditor, type ImageEditorState } from "./ImageEditor";
import { ImageToolbarView } from "./ImageToolbarView";

interface ImageViewProps {
    model: ImageEditor;
}

function createContentsRoot(): HTMLSpanElement {
    const root = document.createElement("span");
    root.style.display = "contents";
    return root;
}

function requireImageModel(model: EditorModel): ImageEditor {
    if (!(model instanceof ImageEditor)) throw new Error("Image view received an invalid model.");
    return model;
}

export class ImageEditorView extends VanillaView<{ model: EditorModel }> {
    private model: ImageEditor;
    private toolbar!: ImageToolbarView;
    private pageToolbar!: PageToolbarView;
    private viewport!: ImageViewportView;
    private readonly getImageModel = () => this.viewport.model;

    public constructor(props: { model: EditorModel }) {
        super(props, createContentsRoot());
        this.model = requireImageModel(props.model);
    }

    protected onMount(): void {
        this.viewport = this.child(new ImageViewportView(this.viewportProps()));
        this.toolbar = this.child(new ImageToolbarView({
            model: this.model,
            getImageModel: this.getImageModel,
        }));
        this.pageToolbar = this.child(new PageToolbarView({
            name: "image-toolbar",
            model: this.model,
            borderBottom: true,
            rightContributions: this.toolbar.root,
        }));
        this.root.append(this.pageToolbar.root, this.viewport.root);
        this.pageToolbar.mount();
        this.toolbar.mount();
        this.viewport.mount();
        this.bind(
            this.model.state,
            (state) => ({ filePath: state.filePath, url: state.url }),
            ({ filePath, url }) => {
                this.viewport.update(this.viewportProps(filePath, url));
            },
        );
    }

    protected onUpdate(props: { model: EditorModel }): void {
        const model = requireImageModel(props.model);
        if (model !== this.model) {
            throw new Error("Image view received a different model instance.");
        }
        this.pageToolbar.update({
            name: "image-toolbar",
            model: this.model,
            borderBottom: true,
            rightContributions: this.toolbar.root,
        });
        this.toolbar.update({
            model: this.model,
            getImageModel: this.getImageModel,
        });
        this.viewport.update(this.viewportProps());
    }

    private viewportProps(
        filePath: string | undefined = this.model.state.get().filePath,
        url: string | undefined = this.model.state.get().url,
    ): ImageViewportProps {
        return {
            src: url || "",
            alt: filePath ? fpBasename(filePath) : "Image",
        };
    }
}

export { ImageEditor, ImageEditorView as ImageView };
export type { ImageViewProps, ImageEditorState };

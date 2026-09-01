import { ButtonView } from "../../uikit/Button/ButtonView";
import { DialogContentView } from "../../uikit/Dialog/DialogContentView";
import { DialogView } from "../../uikit/Dialog/DialogView";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { InputView } from "../../uikit/Input/InputView";
import { PathInputView } from "../../uikit/PathInput/PathInputView";
import {
    applyPanelAttributes,
    createPanelElement,
    resolvePanelAttributes,
} from "../../uikit/Panel/panel-style";
import { SelectView } from "../../uikit/Select/SelectView";
import { TagsInputView } from "../../uikit/TagsInput/TagsInputView";
import { TextareaView } from "../../uikit/Textarea/TextareaView";
import { createTextElement } from "../../uikit/Text/text-style";
import { KeyedList } from "../../uikit/shared/keyed-list";
import { SubtreeSwap } from "../../uikit/shared/subtree-swap";
import { VanillaView, type IOwnedView } from "../../uikit/shared/vanilla-view";
import type { TorProxyInfo } from "./tor-src";
import { resolveTorSrc } from "./tor-src";
import type { EditLinkDialogModel } from "./EditLinkDialog";
import type { DialogViewProps } from "../../ui/dialogs/dialog-view-registry";
import "../../uikit/Button/Button.css";
import "../../uikit/Dialog/Dialog.css";
import "../../uikit/Input/Input.css";
import "../../uikit/PathInput/PathInput.css";
import "../../uikit/Select/Select.css";
import "../../uikit/TagsInput/TagsInput.css";
import "../../uikit/Textarea/Textarea.css";

const LABEL_WIDTH = 80;

interface TargetOption {
    value: string;
    label: string;
}

/** Editor targets that handle the openRawLink flow for URL links. */
const targetEditorOptions: TargetOption[] = [
    { value: "", label: "(auto-detect)" },
    { value: "monaco", label: "Text Editor" },
    { value: "browser", label: "Browser" },
    { value: "image-view", label: "Image Viewer" },
    { value: "md-view", label: "Markdown Preview" },
    { value: "html-view", label: "HTML Preview" },
    { value: "svg-view", label: "SVG Preview" },
    { value: "grid-json", label: "JSON Grid" },
    { value: "grid-csv", label: "CSV Grid" },
];

type EditLinkDialogState = ReturnType<EditLinkDialogModel["state"]["get"]>;

interface PreviewProps {
    readonly src: string;
}

interface DiscoveredImagesProps {
    readonly images: string[];
    readonly selectedUrl: string;
    readonly imageProxy: TorProxyInfo | null;
    readonly onSelect: (url: string) => void;
}

interface ImageRecord {
    readonly url: string;
    readonly index: number;
}

interface TileResources {
    readonly release: () => void;
    record: ImageRecord;
}

function createFormRow(label: string, content: Node): HTMLDivElement {
    return createPanelElement(
        { direction: "row", align: "center", gap: "md" },
        [
            createPanelElement(
                { width: LABEL_WIDTH, direction: "row", justify: "end" },
                [createTextElement(label, { size: "sm", color: "light" })],
            ),
            createPanelElement({ flex: true, minWidth: 0, direction: "column" }, [content]),
        ],
    );
}

function applyIndentedRow(root: HTMLElement, children: Node[]): void {
    applyPanelAttributes(root, resolvePanelAttributes({ direction: "row", gap: "md" }));
    root.append(
        createPanelElement({ width: LABEL_WIDTH }),
        createPanelElement(
            { flex: true, minWidth: 0, direction: "column", gap: "xs" },
            children,
        ),
    );
}

class PreviewView extends VanillaView<PreviewProps> {
    public constructor(props: PreviewProps) {
        super(props, document.createElement("div"));
    }

    protected onMount(): void {
        const previewPanel = createPanelElement({
            flex: true,
            border: true,
            rounded: "md",
            padding: "xs",
            background: "dark",
            align: "center",
            justify: "center",
            maxHeight: 200,
            overflow: "hidden",
        });
        const image = document.createElement("img");
        image.src = this.props.src;
        image.alt = "Preview";
        image.style.maxWidth = "100%";
        image.style.maxHeight = "192px";
        image.style.objectFit = "contain";
        previewPanel.append(image);
        applyIndentedRow(this.root, [previewPanel]);
    }
}

class DiscoveredImagesView extends VanillaView<DiscoveredImagesProps> {
    private readonly tileResources = new Map<HTMLDivElement, TileResources>();
    private imageList: KeyedList<ImageRecord, string, HTMLDivElement> | undefined;

    public constructor(props: DiscoveredImagesProps) {
        super(props, document.createElement("div"));
    }

    protected onMount(): void {
        const label = createTextElement("Discovered Images", { size: "xs", color: "light" });
        const imagePanel = createPanelElement({ direction: "row", wrap: true, gap: "sm" });
        applyIndentedRow(this.root, [label, imagePanel]);

        this.imageList = new KeyedList(imagePanel, {
            keyOf: (record) => `${record.url}#${record.index}`,
            create: (record) => this.createTile(record),
            update: (element, record, index) => this.updateTile(element, {
                ...record,
                index,
            }),
            remove: (element) => this.removeTile(element),
        });
        this.imageList.update(this.imageRecords(this.props.images));
        this.own(() => this.imageList?.dispose());
    }

    protected onUpdate(props: DiscoveredImagesProps): void {
        this.imageList?.update(this.imageRecords(props.images));
    }

    private imageRecords(images: string[]): ImageRecord[] {
        return images.map((url, index) => ({ url, index }));
    }

    private createTile(record: ImageRecord): HTMLDivElement {
        const tile = createPanelElement({
            border: true,
            rounded: "sm",
            overflow: "hidden",
            width: 60,
            height: 60,
            clickable: true,
        });
        const listener: EventListener = () => {
            const resources = this.tileResources.get(tile);
            if (resources) this.props.onSelect(resources.record.url);
        };
        this.tileResources.set(tile, { release: this.listen(tile, "click", listener), record });
        return tile;
    }

    private updateTile(tile: HTMLDivElement, record: ImageRecord): void {
        const resources = this.tileResources.get(tile);
        if (!resources) return;
        resources.record = record;
        const isSelected = record.url === this.props.selectedUrl;
        applyPanelAttributes(tile, resolvePanelAttributes({
            border: true,
            borderColor: isSelected ? "active" : "subtle",
            rounded: "sm",
            overflow: "hidden",
            width: 60,
            height: 60,
            clickable: true,
        }));
        tile.replaceChildren();

        // US-896 — null suppresses the thumbnail on a Tor page whose circuit isn't up. The tile
        // stays clickable: the URL is still a valid choice even when it can't be previewed.
        const thumbSrc = resolveTorSrc(record.url, this.props.imageProxy);
        if (!thumbSrc) return;

        const image = document.createElement("img");
        image.src = thumbSrc;
        image.alt = `Image ${record.index + 1}`;
        image.width = 60;
        image.height = 60;
        image.style.objectFit = "cover";
        image.style.display = "block";
        image.style.cursor = "pointer";
        tile.append(image);
    }

    private removeTile(tile: HTMLDivElement): void {
        const resources = this.tileResources.get(tile);
        if (!resources) return;
        resources.release();
        this.tileResources.delete(tile);
    }
}

export class EditLinkDialogView extends VanillaView<DialogViewProps> {
    private readonly model: EditLinkDialogModel;
    private titleView: TextareaView | undefined;
    private hrefView: InputView | undefined;
    private categoryView: PathInputView | undefined;
    private targetView: SelectView<TargetOption> | undefined;
    private tagsView: TagsInputView | undefined;
    private imageView: InputView | undefined;
    private clearImageButton: IconButtonView | undefined;
    private previewSwap: SubtreeSwap<string> | undefined;
    private discoveredImagesSwap: SubtreeSwap<"images"> | undefined;
    private discoveredImagesView: DiscoveredImagesView | undefined;

    public constructor(props: DialogViewProps) {
        super(props, document.createElement("div"));
        this.root.style.display = "contents";
        this.model = props.model as EditLinkDialogModel;
    }

    protected onMount(): void {
        const state = this.model.state.get();
        const titleView = this.mountChild(new TextareaView({
            name: "edit-link-title",
            singleLine: true,
            value: state.linkTitle,
            onChange: this.model.setTitle,
            placeholder: "Link title...",
            autoFocus: true,
            size: "sm",
        }));
        const hrefView = this.mountChild(new InputView({
            name: "edit-link-href",
            value: state.href,
            onChange: this.model.setHref,
            placeholder: "https://...",
        }));
        const categoryView = this.mountChild(new PathInputView({
            name: "edit-link-category",
            value: state.category,
            onChange: this.model.setCategory,
            onBlur: this.model.setCategoryFromBlur,
            paths: state.categories,
            separator: "/",
            placeholder: "Category path...",
        }));
        const targetView = this.mountChild(new SelectView<TargetOption>({
            name: "edit-link-target",
            items: targetEditorOptions,
            value: this.selectedTarget(state.target),
            onChange: (option) => this.model.setTarget(option.value),
        }));
        const tagsView = this.mountChild(new TagsInputView({
            name: "edit-link-tags",
            value: state.tags,
            onChange: this.model.setTags,
            items: state.availableTags,
            separator: ":",
            maxDepth: 1,
            placeholder: "Type + Enter to add",
        }));
        const clearImageButton = state.imgSrc ? this.createClearImageButton() : undefined;
        const imageView = this.mountChild(new InputView({
            name: "edit-link-img-src",
            value: state.imgSrc,
            onChange: this.model.setImgSrc,
            placeholder: "https://... (optional)",
            endSlot: clearImageButton?.root,
        }));

        this.titleView = titleView;
        this.hrefView = hrefView;
        this.categoryView = categoryView;
        this.targetView = targetView;
        this.tagsView = tagsView;
        this.imageView = imageView;
        this.clearImageButton = clearImageButton;

        const bodyPanel = createPanelElement(
            { direction: "column", gap: "sm", paddingX: "xl", paddingY: "md" },
            [
                createFormRow("Title", titleView.root),
                createFormRow("URL", hrefView.root),
                createFormRow("Category", categoryView.root),
                createFormRow("Target", targetView.root),
                createFormRow("Tags", tagsView.root),
                createFormRow("Image URL", imageView.root),
            ],
        );

        this.previewSwap = new SubtreeSwap(bodyPanel);
        this.discoveredImagesSwap = new SubtreeSwap(bodyPanel);
        this.own(() => this.previewSwap.dispose());
        this.own(() => this.discoveredImagesSwap.dispose());

        const cancelButton = this.mountChild(new ButtonView({
            name: "edit-link-cancel",
            onClick: () => { void this.model.close(undefined); },
            children: "Cancel",
        }));
        const saveButton = this.mountChild(new ButtonView({
            name: "edit-link-save",
            variant: "primary",
            onClick: this.model.save,
            children: "Save",
        }));
        const footer = createPanelElement(
            { direction: "row", justify: "end", gap: "sm", padding: "md" },
            [cancelButton.root, saveButton.root],
        );
        const contentChildren = document.createDocumentFragment();
        contentChildren.append(bodyPanel, footer);
        const contentView = this.child(new DialogContentView({
            title: state.dialogTitle,
            icon: "rename",
            onClose: () => { void this.model.close(undefined); },
            minWidth: 500,
            maxWidth: 700,
            children: contentChildren,
        }));
        const dialogView = this.child(new DialogView({
            name: "edit-link-dialog",
            onKeyDown: (event) => this.model.handleKeyDown(event),
            onEscape: () => { void this.model.close(undefined); },
            autoFocus: false,
            children: contentView.root,
        }));
        this.root.append(dialogView.root);
        contentView.mount();
        dialogView.mount();

        this.bind(this.model.state, (value) => value, (nextState) => this.syncState(nextState));
    }

    private mountChild<T extends IOwnedView & { mount(): HTMLElement }>(view: T): T {
        const owned = this.child(view);
        owned.mount();
        return owned;
    }

    private createClearImageButton(): IconButtonView {
        return this.mountChild(new IconButtonView({
            name: "edit-link-img-clear",
            size: "sm",
            icon: "close",
            title: "Clear Image URL",
            onClick: () => this.model.setImgSrc(""),
        }));
    }

    private selectedTarget(value: string): TargetOption {
        return targetEditorOptions.find((option) => option.value === value)
            ?? targetEditorOptions[0];
    }

    private syncState(state: EditLinkDialogState): void {
        this.titleView.update({
            name: "edit-link-title",
            singleLine: true,
            value: state.linkTitle,
            onChange: this.model.setTitle,
            placeholder: "Link title...",
            autoFocus: true,
            size: "sm",
        });
        this.hrefView.update({
            name: "edit-link-href",
            value: state.href,
            onChange: this.model.setHref,
            placeholder: "https://...",
        });
        this.categoryView.update({
            name: "edit-link-category",
            value: state.category,
            onChange: this.model.setCategory,
            onBlur: this.model.setCategoryFromBlur,
            paths: state.categories,
            separator: "/",
            placeholder: "Category path...",
        });
        this.targetView.update({
            name: "edit-link-target",
            items: targetEditorOptions,
            value: this.selectedTarget(state.target),
            onChange: (option) => this.model.setTarget(option.value),
        });
        this.tagsView.update({
            name: "edit-link-tags",
            value: state.tags,
            onChange: this.model.setTags,
            items: state.availableTags,
            separator: ":",
            maxDepth: 1,
            placeholder: "Type + Enter to add",
        });

        const hadClearButton = this.clearImageButton;
        if (!state.imgSrc && hadClearButton) {
            this.imageView.update(this.imageProps(state, undefined));
            this.clearImageButton = undefined;
            this.releaseChild(hadClearButton);
        } else if (state.imgSrc && !hadClearButton) {
            this.clearImageButton = this.createClearImageButton();
        }
        if (state.imgSrc || !hadClearButton) {
            this.imageView.update(this.imageProps(state, this.clearImageButton?.root));
        }

        const previewSrc = resolveTorSrc(state.imgSrc, state.imageProxy);
        this.syncPreview(previewSrc);
        this.syncDiscoveredImages(state);
    }

    private imageProps(
        state: EditLinkDialogState,
        endSlot: Node | undefined,
    ): Parameters<InputView["update"]>[0] {
        return {
            name: "edit-link-img-src",
            value: state.imgSrc,
            onChange: this.model.setImgSrc,
            placeholder: "https://... (optional)",
            endSlot,
        };
    }

    private syncPreview(src: string | null): void {
        if (!src) {
            this.previewSwap.clear();
            return;
        }

        let created: PreviewView | undefined;
        this.previewSwap.set(src, (previewSrc) => {
            created = new PreviewView({ src: previewSrc });
            return created;
        });
        created?.mount();
    }

    private syncDiscoveredImages(state: EditLinkDialogState): void {
        if (state.discoveredImages.length === 0) {
            this.discoveredImagesView = undefined;
            this.discoveredImagesSwap.clear();
            return;
        }

        const props: DiscoveredImagesProps = {
            images: state.discoveredImages,
            selectedUrl: state.imgSrc,
            imageProxy: state.imageProxy,
            onSelect: this.model.selectDiscoveredImage,
        };
        if (this.discoveredImagesView) {
            this.discoveredImagesView.update(props);
            return;
        }

        let created: DiscoveredImagesView | undefined;
        this.discoveredImagesSwap.set("images", () => {
            created = new DiscoveredImagesView(props);
            return created;
        });
        if (created) {
            this.discoveredImagesView = created;
            created.mount();
        }
    }
}

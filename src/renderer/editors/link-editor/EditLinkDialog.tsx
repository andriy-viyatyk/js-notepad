import {
    Dialog,
    DialogContent,
    Panel,
    Text,
    Button,
    IconButton,
    Input,
    Textarea,
    Select,
    PathInput,
    TagsInput,
} from "../../uikit";
import { TDialogModel } from "../../core/state/model";
import { DefaultView, ViewPropsRO, Views } from "../../core/state/view";
import { TComponentState } from "../../core/state/state";
import { showDialog } from "../../ui/dialogs/Dialogs";
import { CloseIcon, RenameIcon } from "../../theme/icons";
import { LinkItem } from "./linkTypes";

// =============================================================================
// Types
// =============================================================================

interface EditLinkDialogState {
    dialogTitle: string;
    linkTitle: string;
    href: string;
    category: string;
    tags: string[];
    imgSrc: string;
    target: string;
    categories: string[];
    availableTags: string[];
    discoveredImages: string[];
}

export type EditLinkResult = Omit<LinkItem, "id"> | undefined;

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
    { value: "pdf-view", label: "PDF Viewer" },
    { value: "md-view", label: "Markdown Preview" },
    { value: "html-view", label: "HTML Preview" },
    { value: "svg-view", label: "SVG Preview" },
    { value: "grid-json", label: "JSON Grid" },
    { value: "grid-csv", label: "CSV Grid" },
];

// =============================================================================
// Model
// =============================================================================

const editLinkDialogId = Symbol("editLinkDialog");

class EditLinkDialogModel extends TDialogModel<EditLinkDialogState, EditLinkResult> {
    handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.defaultPrevented) return;
        if (e.key === "Escape") {
            e.preventDefault();
            this.close(undefined);
        }
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            this.save();
        }
    };

    setTitle = (value: string) => {
        this.state.update((s) => { s.linkTitle = value; });
    };

    setHref = (value: string) => {
        this.state.update((s) => { s.href = value; });
    };

    setCategory = (value: string) => {
        this.state.update((s) => { s.category = value; });
    };

    setCategoryFromBlur = (finalValue?: string) => {
        if (finalValue !== undefined) {
            this.state.update((s) => { s.category = finalValue; });
        }
    };

    setImgSrc = (value: string) => {
        this.state.update((s) => { s.imgSrc = value; });
    };

    setTarget = (option: TargetOption) => {
        this.state.update((s) => { s.target = option.value; });
    };

    setTags = (tags: string[]) => {
        this.state.update((s) => { s.tags = tags; });
    };

    selectDiscoveredImage = (url: string) => {
        this.state.update((s) => { s.imgSrc = url; });
    };

    save = () => {
        const state = this.state.get();
        this.close({
            title: state.linkTitle.trim(),
            href: state.href.trim(),
            category: state.category.trim(),
            tags: state.tags,
            isDirectory: false,
            imgSrc: state.imgSrc.trim() || undefined,
            target: state.target || undefined,
        });
    };
}

// =============================================================================
// View
// =============================================================================

const LABEL_WIDTH = 80;

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <Panel direction="row" align="center" gap="md">
            <Panel width={LABEL_WIDTH} direction="row" justify="end">
                <Text size="sm" color="light">{label}</Text>
            </Panel>
            <Panel flex minWidth={0} direction="column">{children}</Panel>
        </Panel>
    );
}

function IndentedRow({ children }: { children: React.ReactNode }) {
    return (
        <Panel direction="row" gap="md">
            <Panel width={LABEL_WIDTH} />
            <Panel flex minWidth={0} direction="column" gap="xs">
                {children}
            </Panel>
        </Panel>
    );
}

function EditLinkDialog({ model }: ViewPropsRO<EditLinkDialogModel>) {
    const state = model.state.use();
    const selectedTarget = targetEditorOptions.find((o) => o.value === state.target) ?? targetEditorOptions[0];

    return (
        <Dialog name="edit-link-dialog" onKeyDown={model.handleKeyDown} autoFocus={false}>
            <DialogContent
                title={state.dialogTitle}
                icon={<RenameIcon />}
                onClose={() => model.close(undefined)}
                minWidth={500}
                maxWidth={700}
            >
                <Panel direction="column" gap="sm" paddingX="xl" paddingY="md">
                    <FormRow label="Title">
                        <Textarea
                            name="edit-link-title"
                            singleLine
                            value={state.linkTitle}
                            onChange={model.setTitle}
                            placeholder="Link title..."
                            autoFocus
                            size="sm"
                        />
                    </FormRow>

                    <FormRow label="URL">
                        <Input
                            name="edit-link-href"
                            value={state.href}
                            onChange={model.setHref}
                            placeholder="https://..."
                        />
                    </FormRow>

                    <FormRow label="Category">
                        <PathInput
                            name="edit-link-category"
                            value={state.category}
                            onChange={model.setCategory}
                            onBlur={model.setCategoryFromBlur}
                            paths={state.categories}
                            separator="/"
                            placeholder="Category path..."
                        />
                    </FormRow>

                    <FormRow label="Target">
                        <Select
                            name="edit-link-target"
                            items={targetEditorOptions}
                            value={selectedTarget}
                            onChange={model.setTarget}
                        />
                    </FormRow>

                    <FormRow label="Tags">
                        <TagsInput
                            name="edit-link-tags"
                            value={state.tags}
                            onChange={model.setTags}
                            items={state.availableTags}
                            separator=":"
                            maxDepth={1}
                            placeholder="Type + Enter to add"
                        />
                    </FormRow>

                    <FormRow label="Image URL">
                        <Input
                            name="edit-link-img-src"
                            value={state.imgSrc}
                            onChange={model.setImgSrc}
                            placeholder="https://... (optional)"
                            endSlot={state.imgSrc ? (
                                <IconButton
                                    name="edit-link-img-clear"
                                    size="sm"
                                    icon={<CloseIcon />}
                                    title="Clear Image URL"
                                    onClick={() => model.setImgSrc("")}
                                />
                            ) : null}
                        />
                    </FormRow>

                    {state.imgSrc && (
                        <IndentedRow>
                            <Panel
                                flex
                                border
                                rounded="md"
                                padding="xs"
                                background="dark"
                                align="center"
                                justify="center"
                                maxHeight={200}
                                overflow="hidden"
                            >
                                <img
                                    src={state.imgSrc}
                                    alt="Preview"
                                    style={{ maxWidth: "100%", maxHeight: 192, objectFit: "contain" }}
                                />
                            </Panel>
                        </IndentedRow>
                    )}

                    {state.discoveredImages.length > 0 && (
                        <IndentedRow>
                            <Text size="xs" color="light">Discovered Images</Text>
                            <Panel direction="row" wrap gap="sm">
                                {state.discoveredImages.map((url, i) => {
                                    const isSelected = url === state.imgSrc;
                                    return (
                                        <Panel
                                            key={i}
                                            border
                                            borderColor={isSelected ? "active" : "subtle"}
                                            rounded="sm"
                                            overflow="hidden"
                                            onClick={() => model.selectDiscoveredImage(url)}
                                        >
                                            <img
                                                src={url}
                                                alt={`Image ${i + 1}`}
                                                width={60}
                                                height={60}
                                                style={{ objectFit: "cover", display: "block", cursor: "pointer" }}
                                            />
                                        </Panel>
                                    );
                                })}
                            </Panel>
                        </IndentedRow>
                    )}
                </Panel>

                <Panel direction="row" justify="end" gap="sm" padding="md">
                    <Button name="edit-link-cancel" onClick={() => model.close(undefined)}>Cancel</Button>
                    <Button name="edit-link-save" variant="primary" onClick={model.save}>Save</Button>
                </Panel>
            </DialogContent>
        </Dialog>
    );
}

Views.registerView(editLinkDialogId, EditLinkDialog as DefaultView);

// =============================================================================
// Public API
// =============================================================================

export interface ShowEditLinkDialogOptions {
    /** Dialog title (default: "Edit Link" or "Add Link") */
    title?: string;
    /** Existing link data (for editing) or defaults (for creating) */
    link?: Partial<LinkItem>;
    /** Available categories for autocomplete */
    categories?: string[];
    /** Available tags for autocomplete */
    tags?: string[];
    /** Discovered images from browser (for future integration) */
    discoveredImages?: string[];
}

export function showEditLinkDialog(options: ShowEditLinkDialogOptions = {}): Promise<EditLinkResult> {
    const { link = {}, categories = [], tags = [], discoveredImages = [] } = options;

    const modelState: EditLinkDialogState = {
        dialogTitle: options.title || (link.id ? "Edit Link" : "Add Link"),
        linkTitle: link.title ?? "",
        href: link.href ?? "",
        category: link.category ?? "",
        tags: link.tags ? [...link.tags] : [],
        imgSrc: link.imgSrc ?? "",
        target: link.target ?? "",
        categories,
        availableTags: tags,
        discoveredImages,
    };

    const model = new EditLinkDialogModel(new TComponentState(modelState));
    return showDialog({
        viewId: editLinkDialogId,
        model,
    }) as Promise<EditLinkResult>;
}

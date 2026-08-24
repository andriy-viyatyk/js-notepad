import color from "../../theme/color";
import { CircleIcon, CloseIcon, DeleteIcon, PlusIcon, WindowMaximizeIcon } from "../../theme/icons";
import { TraitTypeId, setTraitDragData } from "../../core/traits";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { InputView } from "../../uikit/Input/InputView";
import { PathInputView } from "../../uikit/PathInput/PathInputView";
import { TextareaView } from "../../uikit/Textarea/TextareaView";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { highlightInto } from "../../uikit/shared/highlight";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { NoteItem } from "./notebookTypes";
import { NoteItemViewModel, type NoteItemViewProps } from "./NoteItemViewModel";
import { NoteItemActiveEditorView } from "./note-editor/NoteItemActiveEditorView";
import { NoteItemToolbarView } from "./note-editor/NoteItemToolbarView";

const NOTE_EDITOR_MAX_HEIGHT = 400;

function iconElement(icon: { createElement?: (props?: Record<string, unknown>) => SVGElement }, width = 16, height = 16): SVGElement {
    const element = icon.createElement?.({ width, height });
    if (!element) throw new Error("Note icon does not have a DOM builder.");
    return element;
}

export class NoteItemView extends VanillaView<NoteItemViewProps> {
    private readonly model: NoteItemViewModel;
    private readonly deactivationArea = document.createElement("div");
    private readonly indicator = document.createElement("div");
    private readonly indicatorLine = document.createElement("div");
    private readonly firstToolbar = document.createElement("div");
    private readonly categoryHost = document.createElement("span");
    private readonly tagsContainer = document.createElement("div");
    private readonly dateText = createTextElement("", { size: "xs", color: "light" });
    private readonly secondToolbar = createPanelElement({
        direction: "row", align: "center", gap: "sm", paddingX: "sm", paddingBottom: "xs",
    });
    private readonly contentArea = document.createElement("div");
    private readonly contentDimmer = document.createElement("div");
    private readonly commentHost = document.createElement("div");
    private readonly titleInput: InputView;
    private readonly toolbar: NoteItemToolbarView;
    private readonly activeEditor: NoteItemActiveEditorView;
    private readonly expandButton: IconButtonView;
    private readonly deleteButton: IconButtonView;
    private stateUnsubscribe: (() => void) | undefined;
    private categoryInput: PathInputView | undefined;
    private newTagInput: PathInputView | undefined;
    private editingTagInput: PathInputView | undefined;
    private commentInput: TextareaView | undefined;
    private focused = false;
    private hovered = false;
    private dragging = false;

    public constructor(props: NoteItemViewProps) {
        const root = document.createElement("div");
        super(props, root);
        this.model = new NoteItemViewModel(props);
        this.titleInput = this.child(new InputView({
            variant: "ghost",
            size: "sm",
            placeholder: "note title...",
            value: props.note.title,
            onChange: this.model.handleTitleChange,
        }));
        this.toolbar = this.child(new NoteItemToolbarView({
            model: this.model.editModel,
            extrasVisible: true,
        }));
        this.activeEditor = this.child(new NoteItemActiveEditorView({
            model: this.model.editModel,
            editorConfig: {
                maxEditorHeight: NOTE_EDITOR_MAX_HEIGHT,
                hideMinimap: true,
                disableAutoFocus: true,
                highlightText: props.searchText,
                compact: true,
            },
            viewStates: props.viewStates,
        }));
        this.expandButton = this.child(new IconButtonView({
            name: "note-expand",
            size: "sm",
            icon: iconElement(WindowMaximizeIcon),
            title: "Expand",
            onClick: () => this.props.onExpand?.(this.props.note.id),
        }));
        this.deleteButton = this.child(new IconButtonView({
            name: "note-delete",
            size: "sm",
            icon: iconElement(DeleteIcon),
            title: "Delete",
            onClick: () => this.props.onDelete?.(this.props.note.id),
        }));
        this.configureRoot();
    }

    protected onMount(): void {
        this.buildStaticDom();
        this.model.mount(this.root as HTMLDivElement);
        this.toolbar.mount();
        this.titleInput.mount();
        this.toolbar.titleHost.append(this.titleInput.root);
        this.activeEditor.mount();
        this.expandButton.mount();
        this.deleteButton.mount();
        this.stateUnsubscribe = this.model.state.subscribe(() => this.sync());
        this.own(() => this.stateUnsubscribe?.());
        this.sync();
    }

    protected onUpdate(props: NoteItemViewProps): void {
        const noteChanged = this.model.props.note.id !== props.note.id;
        if (noteChanged) this.activeEditor.repoint(props.note);
        this.model.setProps(props);
        this.titleInput.update({
            variant: "ghost", size: "sm", placeholder: "note title...",
            value: props.note.title, onChange: this.model.handleTitleChange,
        });
        this.toolbar.update({ model: this.model.editModel, extrasVisible: this.focused || this.hovered });
        this.activeEditor.update({
            model: this.model.editModel,
            editorConfig: {
                maxEditorHeight: NOTE_EDITOR_MAX_HEIGHT,
                hideMinimap: true,
                disableAutoFocus: true,
                highlightText: props.searchText,
                compact: true,
            },
            viewStates: props.viewStates,
        });
        this.sync();
    }

    protected onDispose(): void {
        this.model.dispose();
    }

    private buildStaticDom(): void {
        this.deactivationArea.dataset.part = "deactivation-area";
        this.deactivationArea.style.position = "absolute";
        this.deactivationArea.style.top = "0";
        this.deactivationArea.style.right = "0";
        this.deactivationArea.style.bottom = "0";
        this.deactivationArea.style.width = "48px";
        this.deactivationArea.style.cursor = "default";
        this.listen(this.deactivationArea, "click", this.model.handleDeactivate);
        this.listen(this.deactivationArea, "mouseenter", () => this.setHovered(false));

        this.indicator.dataset.part = "drag-indicator";
        this.indicator.draggable = true;
        this.indicator.style.position = "absolute";
        this.indicator.style.left = "4px";
        this.indicator.style.top = "12px";
        this.indicator.style.bottom = "8px";
        this.indicator.style.width = "16px";
        this.indicator.style.cursor = "grab";
        this.indicator.style.transition = "color 0.5s ease";
        this.indicator.append(iconElement(CircleIcon), this.indicatorLine);
        this.indicatorLine.style.position = "absolute";
        this.indicatorLine.style.left = "50%";
        this.indicatorLine.style.top = "16px";
        this.indicatorLine.style.bottom = "0";
        this.indicatorLine.style.width = "1px";
        this.indicatorLine.style.transition = "background-color 0.5s ease";
        this.listen(this.indicator, "dragstart", this.handleDragStart);
        this.listen(this.indicator, "dragend", () => { this.dragging = false; this.sync(); });

        this.firstToolbar.dataset.part = "note-meta-toolbar";
        this.firstToolbar.style.display = "flex";
        this.firstToolbar.style.alignItems = "center";
        this.firstToolbar.style.gap = "8px";
        this.firstToolbar.style.padding = "0 4px";
        this.firstToolbar.style.fontSize = "12px";
        this.firstToolbar.style.color = color.text.light;
        this.firstToolbar.style.transition = "opacity 0.15s ease";
        this.categoryHost.title = "Category";
        this.categoryHost.style.padding = "2px 6px";
        this.categoryHost.style.backgroundColor = color.background.light;
        this.categoryHost.style.borderRadius = "3px";
        this.categoryHost.style.cursor = "pointer";
        this.listen(this.categoryHost, "click", this.model.handleCategoryClick);
        this.tagsContainer.style.display = "flex";
        this.tagsContainer.style.flexDirection = "row-reverse";
        this.tagsContainer.style.alignItems = "center";
        this.tagsContainer.style.gap = "4px";
        this.tagsContainer.style.minWidth = "0";
        this.tagsContainer.style.overflow = "hidden";
        this.tagsContainer.style.flexShrink = "1";
        const spacer = document.createElement("div");
        spacer.style.flex = "1";
        this.firstToolbar.append(this.categoryHost, this.tagsContainer, spacer, this.dateText);
        this.firstToolbar.append(this.expandButton.root, this.deleteButton.root);

        this.contentArea.style.position = "relative";
        this.contentArea.style.borderRadius = "2px";
        this.contentArea.style.margin = "0 4px";
        this.contentArea.style.transition = "border-color 0.5s ease";
        this.contentDimmer.style.position = "absolute";
        this.contentDimmer.style.top = "0";
        this.contentDimmer.style.left = "0";
        this.contentDimmer.style.right = "0";
        this.contentDimmer.style.bottom = "0";
        this.contentDimmer.style.backgroundColor = color.background.default;
        this.contentDimmer.style.pointerEvents = "none";
        this.contentDimmer.style.zIndex = "1";
        this.contentDimmer.style.transition = "opacity 0.5s ease";
        this.contentArea.append(this.contentDimmer, this.activeEditor.root);

        this.commentHost.style.padding = "0 4px";
        this.commentHost.style.fontSize = "12px";
        this.commentHost.style.flexShrink = "0";
        this.root.append(
            this.deactivationArea,
            this.indicator,
            this.firstToolbar,
            this.secondToolbar,
            this.contentArea,
            this.commentHost,
        );
        this.secondToolbar.append(this.toolbar.root);
    }

    private sync(): void {
        const state = this.model.state.get();
        const note = this.model.props.note;
        const searching = Boolean(this.model.props.searchText);
        const showToolbar = this.hovered || this.focused || searching;
        const showExtras = this.hovered || this.focused;
        this.root.style.opacity = this.dragging ? "0.5" : "1";
        this.firstToolbar.style.opacity = showToolbar ? "1" : "0";
        // The border is always 1px so the box never changes size: this cell's height is
        // *measured* by the flex grid, so a border appearing on hover would re-measure the row
        // and invalidate geometry below it (E4-12). Hidden state uses the note's own background
        // rather than `transparent`, which keeps the reserved space without a hardcoded color.
        const borderColor = showToolbar ? color.background.light : color.background.default;
        this.contentArea.style.border = `1px solid ${borderColor}`;
        this.contentDimmer.style.opacity = this.focused ? "0" : "0.5";
        this.indicator.style.color = this.focused ? color.misc.blue : color.text.light;
        this.indicatorLine.style.backgroundColor = this.focused ? color.misc.blue : color.background.light;
        this.dateText.textContent = this.model.formatDate(note.updatedDate);
        this.toolbar.update({ model: this.model.editModel, extrasVisible: showExtras });
        this.syncCategory(state.editingCategory, state.categoryValue);
        this.syncTags(state);
        this.syncComment(note);
    }

    private syncCategory(editing: boolean, value: string): void {
        if (editing) {
            if (!this.categoryInput) {
                this.categoryInput = this.child(new PathInputView({
                    size: "sm", value, onChange: this.model.handleCategoryChange,
                    onBlur: this.model.handleCategoryBlur, paths: this.model.props.categories,
                    placeholder: "category...", autoFocus: true,
                }));
                this.categoryInput.mount();
            } else {
                this.categoryInput.update(this.categoryProps(value));
            }
            this.categoryHost.replaceChildren(this.categoryInput.root);
            return;
        }
        if (this.categoryInput) {
            this.releaseChild(this.categoryInput);
            this.categoryInput = undefined;
        }
        highlightInto(this.categoryHost, this.model.props.note.category || "No category", this.model.props.searchText);
    }

    private syncTags(state: ReturnType<NoteItemViewModel["state"]["get"]>): void {
        this.newTagInput && !state.addingTag && this.releaseChild(this.newTagInput);
        if (!state.addingTag) this.newTagInput = undefined;
        if (state.addingTag && !this.newTagInput) {
            this.newTagInput = this.child(new PathInputView({
                size: "sm", value: state.newTagValue, onChange: this.model.handleNewTagChange,
                onBlur: this.model.handleNewTagBlur, paths: this.model.props.tags,
                separator: ":", maxDepth: 1, placeholder: "tag...", autoFocus: true,
            }));
            this.newTagInput.mount();
        }

        const activeIndex = state.editingTagIndex;
        if (this.editingTagInput && activeIndex === null) {
            this.releaseChild(this.editingTagInput);
            this.editingTagInput = undefined;
        }
        if (activeIndex !== null && !this.editingTagInput) {
            this.editingTagInput = this.child(new PathInputView({
                size: "sm", value: state.editingTagValue, onChange: this.model.handleTagEditChange,
                onBlur: this.model.handleTagEditBlur, paths: this.model.props.tags,
                separator: ":", maxDepth: 1, placeholder: "tag...", autoFocus: true,
            }));
            this.editingTagInput.mount();
        }

        this.tagsContainer.replaceChildren();
        if (this.newTagInput) this.tagsContainer.append(this.newTagInput.root);
        else this.tagsContainer.append(this.createTagAddButton());
        for (let index = this.model.props.note.tags.length - 1; index >= 0; index--) {
            if (activeIndex === index && this.editingTagInput) {
                this.tagsContainer.append(this.editingTagInput.root);
            } else {
                this.tagsContainer.append(this.createTagElement(this.model.props.note.tags[index], index));
            }
        }
    }

    private syncComment(note: NoteItem): void {
        if (note.comment !== undefined) {
            const props = {
                variant: "ghost" as const, size: "sm" as const, value: note.comment,
                onChange: this.model.handleCommentChange, onBlur: this.model.handleCommentBlur,
                placeholder: "Add a comment...", maxHeight: 160,
            };
            if (!this.commentInput) {
                this.commentInput = this.child(new TextareaView(props));
                this.commentInput.mount();
            } else this.commentInput.update(props);
            this.commentHost.replaceChildren(this.commentInput.root);
            return;
        }
        if (this.commentInput) {
            this.releaseChild(this.commentInput);
            this.commentInput = undefined;
        }
        const add = document.createElement("span");
        add.textContent = "+ Add comment";
        add.style.opacity = this.hovered ? "0.5" : "0";
        add.style.fontSize = "11px";
        add.style.cursor = "pointer";
        add.style.color = color.text.light;
        add.style.transition = "opacity 0.5s ease";
        add.addEventListener("click", () => this.props.onAddComment?.(this.props.note.id));
        this.commentHost.replaceChildren(add);
    }

    private createTagAddButton(): HTMLSpanElement {
        const element = document.createElement("span");
        element.title = "Add tag";
        element.style.display = "inline-flex";
        element.style.alignItems = "center";
        element.style.justifyContent = "center";
        element.style.padding = "2px 4px";
        element.style.borderRadius = "2px";
        element.style.cursor = "pointer";
        element.style.color = color.text.light;
        element.style.backgroundColor = color.background.dark;
        element.append(iconElement(PlusIcon, 12, 12));
        element.addEventListener("click", this.model.handleAddTagClick);
        return element;
    }

    private createTagElement(tag: string, index: number): HTMLSpanElement {
        const element = document.createElement("span");
        element.style.display = "inline-flex";
        element.style.alignItems = "center";
        element.style.gap = "2px";
        element.style.padding = "2px 6px";
        element.style.backgroundColor = color.background.dark;
        element.style.borderRadius = "3px";
        element.style.cursor = "pointer";
        element.style.whiteSpace = "nowrap";
        element.style.flexShrink = "0";
        const label = document.createElement("span");
        highlightInto(label, tag, this.model.props.searchText);
        const close = document.createElement("span");
        close.style.display = "inline-flex";
        close.style.alignItems = "center";
        close.style.cursor = "pointer";
        close.style.marginLeft = "2px";
        close.style.marginRight = "-3px";
        close.append(iconElement(CloseIcon, 12, 12));
        close.addEventListener("click", (event) => this.model.handleTagDelete(event, index));
        element.append(label, close);
        element.addEventListener("click", () => this.model.handleTagClick(index));
        return element;
    }

    private categoryProps(value: string) {
        return {
            size: "sm" as const, value, onChange: this.model.handleCategoryChange,
            onBlur: this.model.handleCategoryBlur, paths: this.model.props.categories,
            placeholder: "category...", autoFocus: true,
        };
    }

    private readonly handleDragStart = (event: DragEvent): void => {
        event.stopPropagation();
        if (event.dataTransfer) {
            setTraitDragData(event.dataTransfer, TraitTypeId.Note, { noteId: this.props.note.id });
        }
        this.dragging = true;
        this.sync();
    };

    private setHovered(value: boolean): void {
        this.hovered = value;
        this.sync();
    }

    private configureRoot(): void {
        this.root.dataset.type = "note-item";
        this.root.tabIndex = 0;
        this.root.style.width = "100%";
        this.root.style.height = "fit-content";
        this.root.style.boxSizing = "border-box";
        this.root.style.display = "flex";
        this.root.style.flexDirection = "column";
        this.root.style.backgroundColor = color.background.default;
        this.root.style.padding = "8px 48px 8px 24px";
        this.root.style.position = "relative";
        this.root.style.outline = "none";
        // `focusin`/`focusout`, not `focus`/`blur`: a note is "active" whenever focus is anywhere in
        // its subtree, and clicking the body lands focus on a descendant — Monaco's textarea, the
        // grid, an input. The non-bubbling `focus` only fires when the root itself receives it,
        // which is why activation used to work by clicking the drag indicator (a plain child, so
        // focus fell through to the root) and nowhere else. React's onFocus/onBlur, which this was
        // converted from, are delegated through the bubbling pair — hence the containment check
        // below, which is only meaningful for `focusout`.
        this.listen(this.root, "focusin", () => {
            if (this.focused) return;
            this.focused = true;
            this.sync();
        });
        this.listen(this.root, "focusout", (event) => {
            if (this.root.contains(event.relatedTarget as Node | null)) return;
            this.focused = false;
            this.sync();
        });
        this.listen(this.root, "mouseenter", () => this.setHovered(true));
        this.listen(this.root, "mouseleave", () => this.setHovered(false));
    }
}

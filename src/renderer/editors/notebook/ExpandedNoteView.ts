import color from "../../theme/color";
import { CircleIcon, CloseIcon, PlusIcon, WindowRestoreIcon } from "../../theme/icons";
import { TComponentState } from "../../core/state/state";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { InputView } from "../../uikit/Input/InputView";
import { PathInputView } from "../../uikit/PathInput/PathInputView";
import { TextareaView } from "../../uikit/Textarea/TextareaView";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { highlightInto } from "../../uikit/shared/highlight";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { formatDate } from "../../core/utils/utils";
import { NoteItem, NotebookSource } from "./notebookTypes";
import { NoteItemEditModel } from "./note-editor/NoteItemEditModel";
import { NoteItemActiveEditorView } from "./note-editor/NoteItemActiveEditorView";
import { NoteItemToolbarView } from "./note-editor/NoteItemToolbarView";

export interface ExpandedNoteViewProps {
    note: NoteItem;
    notebookModel: NotebookSource;
    categories: string[];
    tags: string[];
    onCollapse: () => void;
    searchText?: string;
    viewStates?: Map<string, import("monaco-editor").editor.ICodeEditorViewState>;
}

interface ExpandedState {
    editingCategory: boolean;
    categoryValue: string;
    addingTag: boolean;
    newTagValue: string;
    editingTagIndex: number | null;
    editingTagValue: string;
}

const defaultState: ExpandedState = {
    editingCategory: false,
    categoryValue: "",
    addingTag: false,
    newTagValue: "",
    editingTagIndex: null,
    editingTagValue: "",
};

function iconElement(icon: { createElement?: (props?: Record<string, unknown>) => SVGElement }, width = 16, height = 16): SVGElement {
    const element = icon.createElement?.({ width, height });
    if (!element) throw new Error("Note icon does not have a DOM builder.");
    return element;
}

export class ExpandedNoteView extends VanillaView<ExpandedNoteViewProps> {
    private readonly state = new TComponentState<ExpandedState>({ ...defaultState });
    private readonly editModel: NoteItemEditModel;
    private readonly toolbar: NoteItemToolbarView;
    private readonly titleInput: InputView;
    private readonly activeEditor: NoteItemActiveEditorView;
    private readonly categoryHost = document.createElement("span");
    private readonly tagsHost = document.createElement("div");
    private readonly commentHost = document.createElement("div");
    private readonly collapseButton: IconButtonView;
    private stateUnsubscribe: (() => void) | undefined;
    private categoryInput: PathInputView | undefined;
    private newTagInput: PathInputView | undefined;
    private editingTagInput: PathInputView | undefined;
    private commentInput: TextareaView | undefined;

    public constructor(props: ExpandedNoteViewProps) {
        super(props, document.createElement("div"));
        this.root.dataset.type = "expanded-note";
        this.editModel = new NoteItemEditModel(props.notebookModel, props.note);
        this.own(() => this.editModel.dispose());
        this.toolbar = this.child(new NoteItemToolbarView({ model: this.editModel, extrasVisible: true }));
        this.titleInput = this.child(new InputView({
            variant: "ghost", size: "sm", placeholder: "note title...", value: props.note.title,
            onChange: (value) => props.notebookModel.updateNoteTitle(props.note.id, value),
        }));
        this.activeEditor = this.child(new NoteItemActiveEditorView({
            model: this.editModel,
            editorConfig: { hideMinimap: false, disableAutoFocus: false, fillContainer: true, highlightText: props.searchText },
            viewStates: props.viewStates,
        }));
        this.collapseButton = this.child(new IconButtonView({
            name: "notebook-expanded-collapse",
            size: "sm",
            icon: iconElement(WindowRestoreIcon),
            title: "Collapse (Esc)",
            onClick: props.onCollapse,
        }));
        this.root.style.display = "flex";
        this.root.style.flexDirection = "column";
        this.root.style.flex = "1 1 auto";
        this.root.style.overflow = "hidden";
        this.root.style.paddingLeft = "24px";
        this.root.style.position = "relative";
    }

    protected onMount(): void {
        const indicator = document.createElement("div");
        indicator.style.position = "absolute";
        indicator.style.left = "4px";
        indicator.style.top = "8px";
        indicator.style.bottom = "8px";
        indicator.style.width = "16px";
        indicator.style.color = color.misc.blue;
        const line = document.createElement("div");
        line.style.position = "absolute";
        line.style.left = "50%";
        line.style.top = "16px";
        line.style.bottom = "0";
        line.style.width = "1px";
        line.style.backgroundColor = color.misc.blue;
        indicator.append(iconElement(CircleIcon), line);

        const topToolbar = createPanelElement({
            name: "notebook-expanded-toolbar", direction: "row", align: "center", gap: "md",
            paddingX: "md", paddingY: "sm", borderBottom: true, shrink: false,
        });
        const topContent = createPanelElement({ direction: "row", align: "center", gap: "md", flex: 1, overflow: "hidden" });
        this.categoryHost.style.padding = "2px 6px";
        this.categoryHost.style.backgroundColor = color.background.light;
        this.categoryHost.style.borderRadius = "3px";
        this.categoryHost.style.cursor = "pointer";
        this.categoryHost.style.flexShrink = "0";
        this.categoryHost.title = "Category";
        this.categoryHost.addEventListener("click", this.startCategoryEdit);
        this.tagsHost.style.display = "flex";
        this.tagsHost.style.alignItems = "center";
        this.tagsHost.style.gap = "4px";
        this.tagsHost.style.minWidth = "0";
        this.tagsHost.style.overflow = "hidden";
        this.tagsHost.style.flexShrink = "1";
        const spacer = document.createElement("div");
        spacer.style.flex = "1";
        const date = createTextElement(formatDate(this.props.note.updatedDate), { size: "xs", color: "light" });
        date.style.flexShrink = "0";
        topContent.append(this.categoryHost, this.tagsHost, spacer, date);
        topToolbar.append(topContent, this.collapseButton.root);

        const editorToolbar = createPanelElement({
            name: "notebook-expanded-editor-toolbar", direction: "row", align: "center", gap: "sm",
            paddingX: "md", paddingY: "sm", borderBottom: true, shrink: false,
        });
        editorToolbar.append(this.toolbar.root);
        const content = createPanelElement({
            name: "notebook-expanded-content", direction: "column", flex: 1, height: 0,
            overflow: "hidden", position: "relative",
        }, [this.activeEditor.root]);
        const commentPanel = createPanelElement({
            name: "notebook-expanded-comment", direction: "column", paddingX: "md", paddingY: "sm",
            borderTop: true, shrink: false,
        }, [this.commentHost]);

        this.root.append(indicator, topToolbar, editorToolbar, content, commentPanel);
        this.toolbar.mount();
        this.titleInput.mount();
        this.toolbar.titleHost.append(this.titleInput.root);
        this.activeEditor.mount();
        this.collapseButton.mount();
        this.stateUnsubscribe = this.state.subscribe(() => this.sync());
        this.own(() => this.stateUnsubscribe?.());
        this.listen(this.root, "keydown", this.handleKeyDown);
        this.sync();
    }

    protected onUpdate(props: ExpandedNoteViewProps): void {
        this.editModel.syncFromNote(props.note);
        this.titleInput.update({
            variant: "ghost", size: "sm", placeholder: "note title...", value: props.note.title,
            onChange: (value) => props.notebookModel.updateNoteTitle(props.note.id, value),
        });
        this.toolbar.update({ model: this.editModel, extrasVisible: true });
        this.activeEditor.update({
            model: this.editModel,
            editorConfig: { hideMinimap: false, disableAutoFocus: false, fillContainer: true, highlightText: props.searchText },
            viewStates: props.viewStates,
        });
        this.collapseButton.update({
            name: "notebook-expanded-collapse", size: "sm", icon: iconElement(WindowRestoreIcon),
            title: "Collapse (Esc)", onClick: props.onCollapse,
        });
        this.sync();
    }

    /** Save the note's Monaco view state before an owner disposes this overlay. */
    public captureViewStateNow(): void {
        this.activeEditor.captureViewStateNow();
    }

    protected onDispose(): void {
        this.editModel.dispose();
    }

    private sync(): void {
        const state = this.state.get();
        if (!state.editingCategory) highlightInto(this.categoryHost, this.props.note.category || "No category", this.props.searchText);
        this.syncCategory(state);
        this.syncTags(state);
        this.syncComment();
    }

    private syncCategory(state: ExpandedState): void {
        if (state.editingCategory) {
            if (!this.categoryInput) {
                this.categoryInput = this.child(new PathInputView({
                    size: "sm", value: state.categoryValue, onChange: (value) => this.setState({ categoryValue: value }),
                    onBlur: this.finishCategoryEdit, paths: this.props.categories, placeholder: "category...", autoFocus: true,
                }));
                this.categoryInput.mount();
            } else this.categoryInput.update({
                size: "sm", value: state.categoryValue, onChange: (value) => this.setState({ categoryValue: value }),
                onBlur: this.finishCategoryEdit, paths: this.props.categories, placeholder: "category...", autoFocus: true,
            });
            this.categoryHost.replaceChildren(this.categoryInput.root);
        } else if (this.categoryInput) {
            this.releaseChild(this.categoryInput);
            this.categoryInput = undefined;
        }
    }

    private syncTags(state: ExpandedState): void {
        if (this.newTagInput && !state.addingTag) {
            this.releaseChild(this.newTagInput);
            this.newTagInput = undefined;
        }
        if (state.addingTag && !this.newTagInput) {
            this.newTagInput = this.child(new PathInputView({
                size: "sm", value: state.newTagValue, onChange: (value) => this.setState({ newTagValue: value }),
                onBlur: this.finishNewTagEdit, paths: this.props.tags, separator: ":", maxDepth: 1,
                placeholder: "tag...", autoFocus: true,
            }));
            this.newTagInput.mount();
        }
        if (this.editingTagInput && state.editingTagIndex === null) {
            this.releaseChild(this.editingTagInput);
            this.editingTagInput = undefined;
        }
        if (state.editingTagIndex !== null && !this.editingTagInput) {
            this.editingTagInput = this.child(new PathInputView({
                size: "sm", value: state.editingTagValue, onChange: (value) => this.setState({ editingTagValue: value }),
                onBlur: this.finishTagEdit, paths: this.props.tags, separator: ":", maxDepth: 1,
                placeholder: "tag...", autoFocus: true,
            }));
            this.editingTagInput.mount();
        }
        this.tagsHost.replaceChildren();
        for (let index = 0; index < this.props.note.tags.length; index++) {
            if (state.editingTagIndex === index && this.editingTagInput) this.tagsHost.append(this.editingTagInput.root);
            else this.tagsHost.append(this.createTag(this.props.note.tags[index], index));
        }
        if (this.newTagInput) this.tagsHost.append(this.newTagInput.root);
        else this.tagsHost.append(this.createAddTag());
    }

    private syncComment(): void {
        const note = this.props.note;
        if (note.comment !== undefined) {
            const props = {
                variant: "ghost" as const, size: "sm" as const, value: note.comment,
                onChange: (value: string) => this.props.notebookModel.updateNoteComment(note.id, value),
                onBlur: () => { if (!note.comment?.trim()) this.props.notebookModel.removeComment(note.id); },
                placeholder: "Add a comment...", maxHeight: 160,
            };
            if (!this.commentInput) {
                this.commentInput = this.child(new TextareaView(props));
                this.commentInput.mount();
            } else this.commentInput.update(props);
            this.commentHost.replaceChildren(this.commentInput.root);
        } else {
            if (this.commentInput) {
                this.releaseChild(this.commentInput);
                this.commentInput = undefined;
            }
            const add = document.createElement("span");
            add.textContent = "+ Add comment";
            add.style.fontSize = "11px";
            add.style.cursor = "pointer";
            add.style.color = color.text.light;
            add.addEventListener("click", () => this.props.notebookModel.addComment(note.id));
            this.commentHost.replaceChildren(add);
        }
    }

    private createTag(tag: string, index: number): HTMLSpanElement {
        const element = document.createElement("span");
        element.style.display = "inline-flex";
        element.style.alignItems = "center";
        element.style.gap = "2px";
        element.style.padding = "2px 6px";
        element.style.backgroundColor = color.background.dark;
        element.style.borderRadius = "3px";
        element.style.cursor = "pointer";
        element.style.whiteSpace = "nowrap";
        const label = document.createElement("span");
        highlightInto(label, tag, this.props.searchText);
        const remove = document.createElement("span");
        remove.style.cursor = "pointer";
        remove.style.display = "inline-flex";
        remove.style.marginLeft = "2px";
        remove.style.marginRight = "-3px";
        remove.append(iconElement(CloseIcon, 12, 12));
        remove.addEventListener("click", (event) => {
            event.stopPropagation();
            this.props.notebookModel.removeNoteTag(this.props.note.id, index);
        });
        element.append(label, remove);
        element.addEventListener("click", () => this.startTagEdit(index));
        return element;
    }

    private createAddTag(): HTMLSpanElement {
        const element = document.createElement("span");
        element.style.padding = "2px 6px";
        element.style.cursor = "pointer";
        element.style.color = color.text.light;
        element.style.backgroundColor = color.background.dark;
        element.append(iconElement(PlusIcon, 12, 12));
        element.addEventListener("click", () => this.setState({ addingTag: true, newTagValue: "" }));
        return element;
    }

    private readonly startCategoryEdit = (): void => {
        this.setState({ editingCategory: true, categoryValue: this.props.note.category });
    };

    private readonly finishCategoryEdit = (value?: string): void => {
        this.setState({ editingCategory: false });
        if (value !== undefined && value !== this.props.note.category) {
            this.props.notebookModel.updateNoteCategory(this.props.note.id, value);
        }
    };

    private startTagEdit(index: number): void {
        this.setState({ editingTagIndex: index, editingTagValue: this.props.note.tags[index] });
    }

    private readonly finishTagEdit = (value?: string): void => {
        const index = this.state.get().editingTagIndex;
        this.setState({ editingTagIndex: null });
        if (value !== undefined && index !== null && value !== this.props.note.tags[index]) {
            if (value) this.props.notebookModel.updateNoteTag(this.props.note.id, index, value);
            else this.props.notebookModel.removeNoteTag(this.props.note.id, index);
        }
    };

    private readonly finishNewTagEdit = (value?: string): void => {
        this.setState({ addingTag: false });
        if (value) this.props.notebookModel.addNoteTag(this.props.note.id, value);
    };

    private setState(values: Partial<ExpandedState>): void {
        this.state.update((state) => Object.assign(state, values));
    }

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        const state = this.state.get();
        if (event.key === "Escape" && !state.editingCategory && !state.addingTag && state.editingTagIndex === null) {
            this.props.onCollapse();
        }
    };
}

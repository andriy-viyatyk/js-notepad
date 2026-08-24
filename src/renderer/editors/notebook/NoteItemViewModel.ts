import { TComponentState } from "../../core/state/state";
import { formatDate } from "../../core/utils/utils";
import { NoteItem, NotebookSource } from "./notebookTypes";
import { NoteItemEditModel } from "./note-editor/NoteItemEditModel";

export interface NoteItemViewProps {
    note: NoteItem;
    notebookModel: NotebookSource;
    categories: string[];
    tags: string[];
    onDelete?: (id: string) => void;
    onExpand?: (id: string) => void;
    onAddComment?: (id: string) => void;
    onCommentChange?: (id: string, comment: string) => void;
    searchText?: string;
    onTitleChange?: (id: string, title: string) => void;
    onCategoryChange?: (id: string, category: string) => void;
    onTagAdd?: (id: string, tag: string) => void;
    onTagRemove?: (id: string, tagIndex: number) => void;
    onTagUpdate?: (id: string, tagIndex: number, newTag: string) => void;
    viewStates?: Map<string, import("monaco-editor").editor.ICodeEditorViewState>;
}

export const defaultNoteItemViewState = {
    editingCategory: false,
    categoryValue: "",
    addingTag: false,
    newTagValue: "",
    editingTagIndex: null as number | null,
    editingTagValue: "",
};

export type NoteItemViewState = typeof defaultNoteItemViewState;

/** Owns the transient editing state for one retained note row. */
export class NoteItemViewModel {
    readonly state = new TComponentState<NoteItemViewState>({ ...defaultNoteItemViewState });
    readonly editModel: NoteItemEditModel;
    props: NoteItemViewProps;
    noteItemRef: HTMLDivElement | null = null;
    searchText: string | undefined;

    private wheelHandler: ((event: WheelEvent) => void) | null = null;

    public constructor(props: NoteItemViewProps) {
        this.props = props;
        this.searchText = props.searchText;
        this.editModel = new NoteItemEditModel(props.notebookModel, props.note);
    }

    setProps(props: NoteItemViewProps): void {
        const noteChanged = this.props.note.id !== props.note.id;
        this.props = props;
        this.searchText = props.searchText;
        if (noteChanged) {
            this.state.update((state) => Object.assign(state, defaultNoteItemViewState));
            this.editModel.repoint(props.note);
        } else {
            this.editModel.syncFromNote(props.note);
            if (!this.state.get().editingCategory) {
                this.state.update((state) => { state.categoryValue = props.note.category; });
            }
        }
    }

    mount(element: HTMLDivElement): void {
        this.noteItemRef = element;
        this.setupWheelHandler();
        if (!this.state.get().editingCategory) {
            this.state.update((state) => { state.categoryValue = this.props.note.category; });
        }
    }

    dispose(): void {
        this.teardownWheelHandler();
        this.editModel.dispose();
        this.noteItemRef = null;
    }

    formatDate = formatDate;

    handleTitleChange = (value: string): void => {
        this.props.onTitleChange?.(this.props.note.id, value);
    };

    handleCommentChange = (value: string): void => {
        this.props.onCommentChange?.(this.props.note.id, value);
    };

    handleCommentBlur = (): void => {
        if (this.props.note.comment !== undefined && this.props.note.comment.trim() === "") {
            this.props.notebookModel.removeComment(this.props.note.id);
        }
    };

    handleCategoryClick = (): void => {
        this.state.update((state) => {
            state.categoryValue = this.props.note.category;
            state.editingCategory = true;
        });
    };

    handleCategoryChange = (value: string): void => {
        this.state.update((state) => { state.categoryValue = value; });
    };

    handleCategoryBlur = (finalValue?: string): void => {
        this.state.update((state) => { state.editingCategory = false; });
        if (finalValue !== undefined && finalValue !== this.props.note.category) {
            this.props.onCategoryChange?.(this.props.note.id, finalValue);
        }
        this.noteItemRef?.focus();
    };

    handleTagClick = (index: number): void => {
        this.state.update((state) => {
            state.editingTagValue = this.props.note.tags[index];
            state.editingTagIndex = index;
        });
    };

    handleTagEditChange = (value: string): void => {
        this.state.update((state) => { state.editingTagValue = value; });
    };

    handleTagEditBlur = (finalValue?: string): void => {
        const { editingTagIndex } = this.state.get();
        this.state.update((state) => { state.editingTagIndex = null; });
        if (finalValue !== undefined && editingTagIndex !== null) {
            const oldValue = this.props.note.tags[editingTagIndex];
            if (finalValue !== oldValue) {
                if (finalValue === "") this.props.onTagRemove?.(this.props.note.id, editingTagIndex);
                else this.props.onTagUpdate?.(this.props.note.id, editingTagIndex, finalValue);
            }
        }
        this.noteItemRef?.focus();
    };

    handleTagDelete = (event: MouseEvent, index: number): void => {
        event.stopPropagation();
        this.props.onTagRemove?.(this.props.note.id, index);
    };

    handleAddTagClick = (): void => {
        this.state.update((state) => {
            state.newTagValue = "";
            state.addingTag = true;
        });
    };

    handleNewTagChange = (value: string): void => {
        this.state.update((state) => { state.newTagValue = value; });
    };

    handleNewTagBlur = (finalValue?: string): void => {
        this.state.update((state) => { state.addingTag = false; });
        if (finalValue !== undefined && finalValue) {
            this.props.onTagAdd?.(this.props.note.id, finalValue);
        }
        this.noteItemRef?.focus();
    };

    handleDeactivate = (): void => {
        const scrollContainer = this.noteItemRef?.closest("#avg-container") as HTMLElement | null;
        if (scrollContainer) {
            scrollContainer.focus();
            return;
        }
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    };

    private setupWheelHandler(): void {
        const element = this.noteItemRef;
        if (!element) return;
        this.wheelHandler = (event) => {
            if (element.contains(document.activeElement)) return;
            event.preventDefault();
            event.stopPropagation();
            const scrollContainer = element.closest("#avg-container") as HTMLElement | null;
            if (scrollContainer) {
                scrollContainer.scrollTop += event.deltaY;
                scrollContainer.scrollLeft += event.deltaX;
            }
        };
        element.addEventListener("wheel", this.wheelHandler, { capture: true, passive: false });
    }

    private teardownWheelHandler(): void {
        if (!this.wheelHandler || !this.noteItemRef) return;
        this.noteItemRef.removeEventListener("wheel", this.wheelHandler, { capture: true });
        this.wheelHandler = null;
    }
}

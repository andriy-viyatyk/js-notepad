import React from "react";
import { TComponentModel } from "../../core/state/model";
import { formatDate } from "../../core/utils/utils";
import { NoteItem } from "./notebookTypes";
import { NotebookEditorModel } from "./NotebookEditorModel";
import { NoteItemEditModel } from "./note-editor/NoteItemEditModel";

// =============================================================================
// Types
// =============================================================================

export interface NoteItemViewProps {
    note: NoteItem;
    notebookModel: NotebookEditorModel;
    /** Available categories for autocomplete */
    categories: string[];
    /** Available tags for autocomplete */
    tags: string[];
    onDelete?: (id: string) => void;
    onExpand?: (id: string) => void;
    onAddComment?: (id: string) => void;
    onCommentChange?: (id: string, comment: string) => void;
    onTitleChange?: (id: string, title: string) => void;
    onCategoryChange?: (id: string, category: string) => void;
    onTagAdd?: (id: string, tag: string) => void;
    onTagRemove?: (id: string, tagIndex: number) => void;
    onTagUpdate?: (id: string, tagIndex: number, newTag: string) => void;
    /** Ref for RenderFlexGrid height detection */
    cellRef?: React.RefObject<HTMLDivElement>;
}

// =============================================================================
// State
// =============================================================================

export const defaultNoteItemViewState = {
    editingCategory: false,
    categoryValue: "",
    addingTag: false,
    newTagValue: "",
    editingTagIndex: null as number | null,
    editingTagValue: "",
};

export type NoteItemViewState = typeof defaultNoteItemViewState;

// =============================================================================
// Model
// =============================================================================

export class NoteItemViewModel extends TComponentModel<NoteItemViewState, NoteItemViewProps> {
    // Refs
    noteItemRef: HTMLDivElement | null = null;

    // Search text from React context (set by view before render)
    searchText: string | undefined = undefined;

    // Sub-model for embedded editor (lazy-created on first access)
    private _editModel: NoteItemEditModel | null = null;

    get editModel(): NoteItemEditModel {
        if (!this._editModel) {
            this._editModel = new NoteItemEditModel(this.props.notebookModel, this.props.note);
        }
        return this._editModel;
    }

    // =========================================================================
    // Lifecycle
    // =========================================================================

    init = () => {
        this.setupWheelHandler();
    };

    dispose = () => {
        this._editModel?.dispose();
        this.teardownWheelHandler();
    };

    // =========================================================================
    // Refs
    // =========================================================================

    setRefs = (element: HTMLDivElement | null) => {
        this.noteItemRef = element;
        const { cellRef } = this.props;
        if (cellRef) {
            (cellRef as React.MutableRefObject<HTMLDivElement | null>).current = element;
        }
    };

    // =========================================================================
    // Sync methods (called from useEffect in view)
    // =========================================================================

    syncEditModel = () => {
        this._editModel?.syncFromNote(this.props.note);
    };

    syncCategoryValue = () => {
        if (!this.state.get().editingCategory) {
            this.state.update((s) => {
                s.categoryValue = this.props.note.category;
            });
        }
    };

    // =========================================================================
    // Utility
    // =========================================================================

    formatDate = formatDate;

    hasSearchMatch = (text: string) => {
        if (!this.searchText || !text) return false;
        const textLower = text.toLowerCase();
        return this.searchText.toLowerCase().split(" ").some(s => s && textLower.includes(s));
    };

    // =========================================================================
    // Title & Comment handlers
    // =========================================================================

    handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this.props.onTitleChange?.(this.props.note.id, e.target.value);
    };

    handleCommentChange = (value: string) => {
        this.props.onCommentChange?.(this.props.note.id, value);
    };

    handleCommentBlur = () => {
        // If comment is empty, remove it so "+ Add comment" button reappears
        if (this.props.note.comment !== undefined && this.props.note.comment.trim() === "") {
            this.props.notebookModel.removeComment(this.props.note.id);
        }
    };

    // =========================================================================
    // Category handlers
    // =========================================================================

    handleCategoryClick = () => {
        this.state.update((s) => {
            s.categoryValue = this.props.note.category;
            s.editingCategory = true;
        });
    };

    handleCategoryChange = (value: string) => {
        this.state.update((s) => {
            s.categoryValue = value;
        });
    };

    handleCategoryBlur = (finalValue?: string) => {
        this.state.update((s) => {
            s.editingCategory = false;
        });
        // undefined means cancelled (Escape) - don't save changes
        if (finalValue !== undefined && finalValue !== this.props.note.category) {
            this.props.onCategoryChange?.(this.props.note.id, finalValue);
        }
        this.noteItemRef?.focus();
    };

    // =========================================================================
    // Tag handlers
    // =========================================================================

    handleTagClick = (index: number) => {
        this.state.update((s) => {
            s.editingTagValue = this.props.note.tags[index];
            s.editingTagIndex = index;
        });
    };

    handleTagEditChange = (value: string) => {
        this.state.update((s) => {
            s.editingTagValue = value;
        });
    };

    handleTagEditBlur = (finalValue?: string) => {
        const { editingTagIndex } = this.state.get();
        this.state.update((s) => {
            s.editingTagIndex = null;
        });
        // undefined means cancelled (Escape) - don't save changes
        if (finalValue !== undefined && editingTagIndex !== null && finalValue !== this.props.note.tags[editingTagIndex]) {
            if (finalValue === "") {
                this.props.onTagRemove?.(this.props.note.id, editingTagIndex);
            } else {
                this.props.onTagUpdate?.(this.props.note.id, editingTagIndex, finalValue);
            }
        }
        this.noteItemRef?.focus();
    };

    handleTagDelete = (e: React.MouseEvent, index: number) => {
        e.stopPropagation();
        this.props.onTagRemove?.(this.props.note.id, index);
    };

    handleAddTagClick = () => {
        this.state.update((s) => {
            s.newTagValue = "";
            s.addingTag = true;
        });
    };

    handleNewTagChange = (value: string) => {
        this.state.update((s) => {
            s.newTagValue = value;
        });
    };

    handleNewTagBlur = (finalValue?: string) => {
        this.state.update((s) => {
            s.addingTag = false;
        });
        // undefined means cancelled (Escape), only add when value is explicitly provided
        if (finalValue !== undefined && finalValue) {
            this.props.onTagAdd?.(this.props.note.id, finalValue);
        }
        this.noteItemRef?.focus();
    };

    // =========================================================================
    // Deactivation
    // =========================================================================

    handleDeactivate = () => {
        // Focus the scroll container instead of just blurring
        // This ensures keyboard shortcuts (like Ctrl+S) continue to work
        const element = this.noteItemRef;
        if (element) {
            const scrollContainer = element.closest("#avg-container") as HTMLElement;
            if (scrollContainer) {
                scrollContainer.focus();
                return;
            }
        }
        // Fallback: blur active element
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
    };

    // =========================================================================
    // Wheel event handling
    // =========================================================================

    private wheelHandler: ((e: WheelEvent) => void) | null = null;

    private setupWheelHandler() {
        const element = this.noteItemRef;
        if (!element) return;

        this.wheelHandler = (e: WheelEvent) => {
            // Check if this note item or any child has focus
            const hasFocus = element.contains(document.activeElement);

            if (!hasFocus) {
                // Prevent default scroll behavior on nested scrollable elements (e.g., Markdown view)
                e.preventDefault();
                // Stop the event from reaching nested editors (Monaco, Grid)
                e.stopPropagation();

                // Find the notebook's scroll container and scroll it
                const scrollContainer = element.closest("#avg-container");
                if (scrollContainer) {
                    scrollContainer.scrollTop += e.deltaY;
                    scrollContainer.scrollLeft += e.deltaX;
                }
            }
        };

        // Use capture phase to intercept BEFORE event reaches nested editors
        // Note: passive: false is required to allow preventDefault()
        element.addEventListener("wheel", this.wheelHandler, { capture: true, passive: false });
    }

    private teardownWheelHandler() {
        if (this.wheelHandler && this.noteItemRef) {
            this.noteItemRef.removeEventListener("wheel", this.wheelHandler, { capture: true });
            this.wheelHandler = null;
        }
    }
}

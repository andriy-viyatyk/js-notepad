import { TextFileModel } from "../text/TextPageModel";

// =============================================================================
// Note Content
// =============================================================================

/** Note item content (mimics subset of TextPageModel state) */
export interface NoteContent {
    language: string;
    content: string;
    editor?: string;
}

// =============================================================================
// Note Item
// =============================================================================

/** Single note item */
export interface NoteItem {
    id: string;
    title: string;
    category: string;
    tags: string[];
    content: NoteContent;
    /** Optional comment field - undefined shows "Add comment" button, string shows TextAreaField */
    comment?: string;
    createdDate: string;
    updatedDate: string;
}

// =============================================================================
// Per-item UI State
// =============================================================================

/** Per-item UI state stored in the file */
export interface NoteItemState {
    /** Content height for virtualization (prevents scroll jumping on remount) */
    contentHeight?: number;
    /** Allow arbitrary string keys for editor-specific state (e.g., "grid-page") */
    [key: string]: unknown;
}

// =============================================================================
// Notebook Data (root structure)
// =============================================================================

/** Root data structure for .note.json file */
export interface NotebookData {
    notes: NoteItem[];
    state: Record<string, NoteItemState>;
}

// =============================================================================
// Component Props
// =============================================================================

export interface NotebookEditorProps {
    model: TextFileModel;
}

// =============================================================================
// Drag-and-Drop Types
// =============================================================================

/** Drag type for dragging a note item (e.g., onto a category) */
export const NOTE_DRAG = "NOTE_DRAG";

/** Drag type for dragging a category tree node (reorder/reparent) */
export const CATEGORY_DRAG = "CATEGORY_DRAG";

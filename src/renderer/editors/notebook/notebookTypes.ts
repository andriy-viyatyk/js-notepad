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
    comment: string;
    createdDate: string;
    updatedDate: string;
}

// =============================================================================
// Per-item UI State
// =============================================================================

/** Per-item UI state stored in the file */
export interface NoteItemState {
    editor?: string;
    gridColumns?: unknown[];
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

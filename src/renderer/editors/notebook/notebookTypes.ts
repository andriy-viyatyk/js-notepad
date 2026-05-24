import { TextFileModel } from "../text/TextEditorModel";
import type { NotebookViewModel } from "./NotebookViewModel";
import type { NotebookEditor } from "./NotebookEditor";

// =============================================================================
// Dual-source typing (EPIC-028 / US-557 NB-IMPL3)
// =============================================================================

/**
 * Dual-source typing for NoteItemView + NoteItemEditModel during US-557
 * outer-only migration. Both NotebookViewModel (legacy) and NotebookEditor
 * (v4) expose identical setter/getter signatures consumed by NoteItemView /
 * NoteItemViewModel / NoteItemEditModel. The structural union lets all three
 * compile against either source without explicit interface plumbing.
 */
export type NotebookSource = NotebookViewModel | NotebookEditor;

// =============================================================================
// Note Content
// =============================================================================

/** Note item content (mimics subset of TextEditorModel state) */
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


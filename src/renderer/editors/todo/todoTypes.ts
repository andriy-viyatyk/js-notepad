import { TextFileModel } from "../text/TextEditorModel";

// =============================================================================
// Todo Item
// =============================================================================

/** Single todo item */
export interface TodoItem {
    id: string;
    list: string;
    title: string;
    done: boolean;
    createdDate: string;
    doneDate: string | null;
    /** Optional comment - null means no comment, string shows textarea */
    comment: string | null;
    /** Tag name reference, null = no tag */
    tag: string | null;
}

// =============================================================================
// Todo Tag
// =============================================================================

/** Tag definition with name and optional color */
export interface TodoTag {
    name: string;
    /** Hex color from predefined palette, empty string = no color */
    color: string;
}

// =============================================================================
// Todo Data (root structure)
// =============================================================================

/** Per-item UI state persisted to JSON (e.g., content height for virtualized grid) */
export interface TodoItemState {
    contentHeight?: number;
}

/** Root data structure for .todo.json file */
export interface TodoData {
    lists: string[];
    tags: TodoTag[];
    items: TodoItem[];
    /** Per-item UI state, keyed by item id */
    state: { [itemId: string]: TodoItemState };
}

// =============================================================================
// List Counts
// =============================================================================

/** Count info for a single list */
export interface ListCount {
    undone: number;
    total: number;
}

// =============================================================================
// Component Props
// =============================================================================

export interface TodoEditorProps {
    model: TextFileModel;
}

// =============================================================================
// Dual-source typing (TD13 — US-556)
// =============================================================================

// Type-only imports keep this file free of runtime cycles between
// TodoViewModel and TodoEditor.
import type { TodoViewModel } from "./TodoViewModel";
import type { TodoEditor } from "./TodoEditor";

/**
 * Dual-source typing for shared components. Both the legacy `TodoViewModel`
 * (consumed by the legacy `loadModule.Editor` path for future notebook embed)
 * and the v4 `TodoEditor` (consumed by the v4 native module for page-level
 * pages) expose identical setter/getter signatures — components don't care
 * which they receive.
 */
export type TodoSource = TodoViewModel | TodoEditor;


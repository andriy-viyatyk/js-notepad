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
// Source typing (post-US-559 — legacy TodoViewModel retired)
// =============================================================================

import type { TodoEditor } from "./TodoEditor";

/**
 * Source type for shared Todo components. Post-strangler this is just the
 * v4 `TodoEditor`; the alias is preserved so consumer call sites don't churn.
 */
export type TodoSource = TodoEditor;


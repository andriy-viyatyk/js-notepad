import React from "react";
import { mountVanilla } from "../shared/mount";
import { CategoryListView } from "./CategoryListView";

// --- Types ---

export interface CategoryListProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className" | "onChange"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances in DOM inspector output. Never used for styling. */
    name?: string;
    /** All values shown by the list. */
    items: string[];
    /** Currently selected value ("" selects the root pseudo-item). Controlled. */
    value: string;
    /** Called when the user picks a row. */
    onChange: (value: string) => void;
    /**
     * Per-row count display. Receives the full value, parent-with-separator, or "" for the
     * root pseudo-item. Returning `undefined` suppresses the count for that row.
     */
    getCount?: (value: string) => number | undefined;
    /**
     * Separator that triggers drill-in for parent rows. Pass `"\0"` to disable drill-in
     * entirely (the list then behaves like a flat list). Default: ":".
     */
    separator?: string;
    /** Label for the root pseudo-item. Default: `"All"`. */
    rootLabel?: string;
}

export function CategoryList(props: CategoryListProps): React.ReactElement {
    return mountVanilla(CategoryListView, props);
}

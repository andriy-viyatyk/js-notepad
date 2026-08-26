import type React from "react";
import type { Traited } from "../../core/traits/traits";
import type { SlotText } from "../shared/slots";
import type { IListBoxItem } from "../ListBox";

// =============================================================================
// Types
// =============================================================================

export interface MultiListBoxProps<T = IListBoxItem>
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className" | "onChange"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Items to display. Plain `T[]` when `T = IListBoxItem`, or `Traited<unknown[]>` to drive a
     *  custom source shape (Rule 3). */
    items: T[] | Traited<unknown[]>;
    /** Currently-selected source items. Empty array when nothing is selected. */
    value: T[];
    /** Called whenever the selection changes -- caller replaces its `value` with the array. */
    onChange: (value: T[]) => void;
    /** Disabled state -- rows do not respond to clicks and the search input is read-only. */
    disabled?: boolean;
    /** Read-only state -- rows do not respond to clicks. The search box stays enabled. */
    readOnly?: boolean;
    /** Show the built-in search input above the list. Default: true. */
    showSearch?: boolean;
    /** Search filter mode. Default: "contains". `"off"` disables filtering entirely. */
    filterMode?: "contains" | "startsWith" | "off";
    /** Placeholder shown inside the built-in search input. Default: "Search...". */
    searchPlaceholder?: string;
    /** Show a tri-state "Select all" row at the top of the list. Default: false. */
    selectAll?: boolean;
    /** Label rendered next to the select-all checkbox. Default: "Select all". */
    selectAllLabel?: string;
    /** Pixel height of each list row. Forwarded to the inner ListBox. Default: 24. */
    rowHeight?: number;
    /**
     * Maximum number of visible list rows before the inner list scrolls. Default: 10.
     * Only consulted when no `height` is set.
     */
    maxVisibleItems?: number;
    /** Renders inside the list area when no rows match the filter. Default: "no rows". */
    emptyMessage?: SlotText;
    /** Fixed width — number becomes px; a string passes through. Default: fills parent (100%). */
    width?: number | string;
    /**
     * Fixed height — number becomes px; a string passes through. When unset, the inner list grows up
     * to `maxVisibleItems x rowHeight` plus the search row and select-all row chrome.
     */
    height?: number | string;
}

import React from "react";
import { mountVanilla } from "../shared/mount";
import type { IconRef, SlotText } from "../shared/slots";
import { ListItemView } from "./ListItemView";

// --- Types ---

export interface ListItemProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className"> {
    ref?: React.Ref<HTMLDivElement>;
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Stable id used for `aria-activedescendant` wiring. */
    id?: string;
    /** Leading icon. */
    icon?: IconRef;
    /** Label content. Link editor folder rows retain a styled rich label; string labels are highlighted. */
    label: React.ReactNode;
    /** Highlight matches in string labels. */
    searchText?: string;
    /** True when this item is the current `value` of its ListBox. */
    selected?: boolean;
    /** True when this item is the current `activeIndex` of its ListBox. */
    active?: boolean;
    /** True when this item should not respond to clicks. */
    disabled?: boolean;
    /**
     * Tooltip body shown after the standard hover delay. When `null`, `undefined`, `false`,
     * or empty string, no tooltip is rendered.
     */
    tooltip?: SlotText;
    /**
     * Override the Tooltip's `delayShow` (ms) for this row. Only meaningful when `tooltip`
     * is set. Leave undefined to use the global Tooltip default.
     */
    tooltipDelayShow?: number;
    /** Trailing slot — defaults to a check icon when `selected`. */
    trailing?: React.ReactNode;
    /**
     * Visual style.
     *   • `"select"` (default) — strong selection-style highlight on hover/active.
     *     Matches Select dropdowns and menus where selection feedback should be loud.
     *   • `"browse"` — soft hover background (no text-color change). Matches the
     *     legacy folder tree feel; use for sidebar / browse-style lists where hover
     *     is purely a navigation cue.
     */
    variant?: "select" | "browse";
    /**
     * How the selected state is rendered.
     *   • `"check"` (default) — trailing check icon (when no custom `trailing` is set).
     *   • `"accent"` — filled selection background + trailing chevron-right icon.
     *     Use for sidebar/browse lists where selection is persistent navigation
     *     state and the selected row's details are shown to the right.
     *   • `"focus"` — focus-aware selection (Explorer look): gray when the list is
     *     blurred, blue + outline when the list is focused. Pair with `variant="browse"`.
     *     No default trailing icon.
     */
    selectionStyle?: "check" | "accent" | "focus";
    /**
     * Controls whether the default trailing selection icon (check / chevron-right per
     * `selectionStyle`) renders when `selected` is true. Set to `false` to keep the
     * background fill of `selectionStyle="accent"` while suppressing the chevron — use
     * this when the row is pure selection feedback rather than navigation into a detail
     * pane. Ignored when a custom `trailing` is provided. Default: `true`.
     */
    showSelectionIcon?: boolean;
    /**
     * Renders a leading checkbox glyph reflecting `selected`, and suppresses the default trailing
     * selection icon — the leading box already carries that information. A caller-supplied
     * `trailing` still wins.
     *
     * Presentational only: it does not change how the row reports clicks. The owner of a
     * multi-select set drives it through `ListBox`'s `isSelected` predicate (`MultiListBox` is that
     * caller). Default: `false`.
     */
    checkbox?: boolean;
    /**
     * True while a drag is hovering this row and it is the active drop target. Paints the
     * drop feedback, which deliberately outranks the selection and hover states — a row can
     * be selected *and* be the drop target, and the drop is the transient thing the user
     * needs to see. Mirrors `TreeItem`'s `dropActive`.
     */
    dropActive?: boolean;
}

// --- Component ---

export function ListItem(props: ListItemProps): React.ReactElement {
    return mountVanilla(ListItemView, props);
}

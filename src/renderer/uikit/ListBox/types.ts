import type { NativeCSSProperties, NativeHTMLAttributes } from "../shared/dom-props";
import {
    TraitKey,
    Traited,
    TraitType,
} from "../../core/traits/traits";
import type { MenuItem } from "../Menu";
import type { IconRef, SlotText } from "../shared/slots";
import type { SlotContent } from "../shared/fill-slot";

// =============================================================================
// Item shape
// =============================================================================

export interface IListBoxItem {
    /** Stable identifier — what `value` / `onChange` refer to. */
    value: string | number;
    /** Display label. Strings are eligible for `searchText` highlighting. */
    label: string;
    /** Leading icon. */
    icon?: IconRef;
    /** Direct DOM icon supplied by a vanilla parent; takes precedence over `icon`. */
    iconElement?: Node;
    /** Application-owned class hook for an ordinary native row. */
    rowClass?: string;
    /** Right-aligned trailing content (e.g. a status badge). Overrides the
     *  default selection check/chevron for this row when set. */
    trailing?: SlotContent;
    /** Direct DOM trailing content supplied by a vanilla parent. */
    trailingElement?: Node;
    /** Native drag handlers for an ordinary row. */
    drag?: ListItemDragProps;
    /** Disables this item without affecting siblings. */
    disabled?: boolean;
    /**
     * When true, the row renders as a non-interactive section header. Hover, click, active
     * highlight, selection styling, and keyboard navigation all skip the row. Visually it
     * appears as a centered, dim label without an icon or selection check.
     */
    section?: boolean;
}

export interface ListItemDragProps {
    draggable?: boolean;
    onDragStart?: (event: DragEvent) => void;
    onDragEnd?: (event: DragEvent) => void;
    onDragEnter?: (event: DragEvent) => void;
    onDragOver?: (event: DragEvent) => void;
    onDragLeave?: (event: DragEvent) => void;
    onDrop?: (event: DragEvent) => void;
}

export const LIST_ITEM_KEY = new TraitKey<TraitType<IListBoxItem>>("listbox-item");

// =============================================================================
// Render context (for custom renderItem)
// =============================================================================

export interface ListItemRenderContext<T> {
    /** Resolved item shape (post-trait). */
    item: IListBoxItem;
    /** Original source item (pre-trait). Equal to `item` when `T = IListBoxItem`. */
    source: T;
    index: number;
    selected: boolean;
    active: boolean;
    /** Stable DOM id — must be set on the rendered row when callers want `aria-activedescendant`. */
    id: string;
}

// =============================================================================
// Imperative ref
// =============================================================================

// =============================================================================
// Props
// =============================================================================

export interface ListBoxProps<T = IListBoxItem>
    extends Omit<
        NativeHTMLAttributes<HTMLDivElement>,
        "style" | "className" | "onChange" | "onContextMenu"
    > {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    items: T[] | Traited<unknown[]>;
    /**
     * Currently-selected item. `null` when nothing is selected. May reference an
     * item not present in `items` — the checkmark simply will not render then.
     *   • Plain `T` — used when `T = IListBoxItem`. Reads `.label` / `.value` / `.icon` directly.
     *   • `Traited<T>` — used with custom `T`. Reads accessor from `value.traits.get(LIST_ITEM_KEY)`.
     *
     * Ignored when `isSelected` is provided.
     */
    value?: T | Traited<T> | null;
    /** Fires when the user selects an item. Emits the source `T` (matches the shape passed via `items`). */
    onChange?: (item: T) => void;
    /**
     * Fires on a double-click on a row. Emits the source `T` and its resolved index, matching
     * `getContextMenu`'s shape. Section and disabled rows never emit.
     *
     * A double-click also produces the two `onChange` calls for its clicks; this fires in addition
     * to them rather than replacing them, so a handler here should be additive (open, reveal) and
     * not assume it is the only reaction to the gesture.
     */
    onItemDoubleClick?: (item: T, index: number) => void;
    /**
     * Predicate that overrides the default `value`-based selection check. When supplied,
     * `value` is ignored — each row's selected flag comes from `isSelected(source, index)`.
     * Used when selection state is derived externally.
     *
     * It does not change how the list reports interaction: `ListBox` emits one `onChange(source)`
     * per click and never mutates a set. A multi-select caller keeps its own array, returns
     * membership from here, and pairs it with `checkbox` for the visual — `MultiListBox` is that
     * caller.
     *
     * **The predicate's identity is a repaint input** (see `ListBoxModel.repaintSignature`). A
     * A direct caller whose selection changed must hand over a *new* function, or the rows will not
     * redraw. `MultiListBox` is the intentional exception: it uses a stable bound method and sends
     * its changing selection set through the targeted ListBox signal.
     */
    isSelected?: (item: T, index: number) => boolean;
    /** Index of the currently-highlighted (active) row. Controlled. */
    activeIndex?: number | null;
    /** Fires when the active row changes — mouse hover or internal keyboard nav. */
    onActiveChange?: (index: number) => void;
    /** Plain-string label highlight passed to the default `<ListItem>`. */
    searchText?: string;
    /**
     * Per-row tooltip. Returning `null`, `undefined`, `false`, or an empty string suppresses
     * the tooltip on that row. Forwarded to the default `<ListItem>` via the `tooltip` prop.
     * When a custom `renderItem` is supplied, the caller is responsible for wiring the
     * tooltip themselves — `getTooltip` is not invoked by `ListBox` in that path.
     */
    getTooltip?: (item: T, index: number) => SlotText;
    /**
     * Per-row context menu items. Returning `undefined` or an empty array suppresses the
     * menu for that row. Items are dispatched via `ContextMenuEvent.fromNativeEvent(e,
     * "generic")` — they bubble to the global handler which renders the actual menu.
     */
    getContextMenu?: (item: T, index: number) => MenuItem[] | undefined;
    /**
     * Container-level context menu handler — invoked when the user right-clicks on the
     * empty area of the list (no row hit, OR the row's `getContextMenu` returned nothing).
     * Use this to add list-background actions ("New file", "Refresh", etc.).
     */
    onContextMenu?: (event: MouseEvent) => void;
    /** Custom row renderer. Receives a context with the resolved item + flags. */
    renderItem?: (ctx: ListItemRenderContext<T>) => SlotContent;
    /** When true, the ListBox handles ArrowUp/ArrowDown/Home/End/Enter on its root. Default: false. */
    keyboardNav?: boolean;
    /** Spinner state — replaces item rendering with a loading row. */
    loading?: boolean;
    /** Renders when `items` is empty and not `loading`. */
    emptyMessage?: SlotContent;
    /** Pixel height of each row. Default: 24. */
    rowHeight?: number;
    /** When set, the list grows to fit content up to this max height. */
    growToHeight?: NativeCSSProperties["height"];
    /** Top/bottom whitespace padding inside the scroll container. */
    whiteSpaceY?: number;
    /**
     * Visual style for the default `<ListItem>` row renderer.
     *   • `"select"` (default) — strong selection-style hover/active feedback.
     *     Matches Select dropdowns and menus.
     *   • `"browse"` — soft hover background. Use for sidebar / browse-style
     *     lists where hover is a navigation cue, not a selection prompt.
     *
     * Ignored when a custom `renderItem` is supplied — caller is responsible for
     * setting the variant on its own `<ListItem>`.
     */
    variant?: "select" | "browse";
    /**
     * How the selected state is rendered by the default `<ListItem>`.
     *   • `"check"` (default) — trailing check icon.
     *   • `"accent"` — filled selection background + trailing chevron-right
     *     icon. Use for sidebar/browse lists where selection is persistent
     *     navigation state and the selected row's details are shown to the right.
     *   • `"focus"` — focus-aware selection (Explorer look): gray when the list is
     *     blurred, blue + outline when focused. Pair with `variant="browse"`. No
     *     default trailing icon.
     *
     * Ignored when a custom `renderItem` is supplied.
     */
    selectionStyle?: "check" | "accent" | "focus";
    /**
     * Renders every default row with a leading checkbox reflecting its selected state, and
     * suppresses the default trailing selection icon. Presentational only — pair it with
     * `isSelected` (which owns the actual multi-select set) and read that prop's note on identity.
     *
     * Ignored when a custom `renderItem` is supplied. Default: `false`.
     */
    checkbox?: boolean;
}

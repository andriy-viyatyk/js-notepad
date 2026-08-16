import React from "react";
import {
    TraitKey,
    Traited,
    TraitType,
} from "../../core/traits/traits";
import type { TraitDragPayload } from "../../core/traits/dnd";
import type { TraitTypeId } from "../../core/traits/TraitRegistry";
import type { RowAlign } from "../RenderGrid";
import type { MenuItem } from "../Menu";
import type { IconRef, SlotText } from "../shared/slots";

// =============================================================================
// Item shape
// =============================================================================

export interface ITreeItem {
    /** Stable identifier — what `value` / `onChange` refer to. Unique within the whole tree. */
    value: string | number;
    /** Display label. Tree providers and category trees may supply rich labels. */
    label: React.ReactNode;
    /** Leading icon (rendered between the chevron and the label). */
    icon?: IconRef;
    /** Disables this item — no click, no selection styling, but children still render. */
    disabled?: boolean;
    /**
     * When true, the row renders as a non-interactive section header. Hover, click, active
     * highlight, selection styling, and keyboard navigation all skip the row. Section rows
     * MAY have children — they then act as ungrabbable group containers.
     */
    section?: boolean;
    /**
     * Children. When omitted or empty, the row has no chevron. When set, the chevron toggles
     * expansion. The model walks this field by default; pass `getChildren` to navigate a
     * differently-named field on a custom `T`.
     */
    items?: ITreeItem[];
}

export const TREE_ITEM_KEY = new TraitKey<TraitType<ITreeItem>>("tree-item");

// =============================================================================
// Render context (for custom renderItem)
// =============================================================================

export interface TreeItemRenderContext<T> {
    /** Resolved item shape (post-trait). */
    item: ITreeItem;
    /** Original source item (pre-trait). Equal to `item` when `T = ITreeItem`. */
    source: T;
    /** Depth — 0 for root rows, +1 per level. */
    level: number;
    /** True when this row is currently expanded. */
    expanded: boolean;
    /** True when the row has children (chevron should render). */
    hasChildren: boolean;
    /** Index inside the FLAT visible-rows array (what RenderGrid uses). */
    rowIndex: number;
    /** True when the row is the current selection (per `value` or `isSelected`). */
    selected: boolean;
    /** True when the row is the current `activeIndex`. */
    active: boolean;
    /** Stable DOM id — must be set on the rendered row when callers want `aria-activedescendant`. */
    id: string;
    /** True when the row is the source of an active drag. Default false. */
    dragging?: boolean;
    /** True when the row is the current drop target under the drag cursor. Default false. */
    dropActive?: boolean;
    /** True when `loadChildren` is currently in flight for this row. Default false. */
    loading?: boolean;
    /** Imperative API: toggle this row's expansion. */
    toggleExpanded: () => void;
}

// =============================================================================
// Imperative ref
// =============================================================================

export interface TreeRef {
    /**
     * Scroll to make a row visible by its source `value`. The row must already be in the
     * visible (currently-expanded) set — use `revealItem` to expand ancestors first.
     */
    scrollToItem: (value: string | number, align?: RowAlign) => void;
    /**
     * Expand every ancestor of `value` (awaiting `loadChildren` for any unresolved
     * ancestor when supplied), then scroll the row into view. Returns when the row is
     * visible (or the value is unreachable).
     *
     * Sync callers may ignore the returned promise. The implementation collapses to a
     * fully-sync path when no `loadChildren` / `getAncestorValues` is supplied, so V1
     * call sites are unaffected.
     *
     * Reaches not-yet-loaded values only when `getAncestorValues` is provided. Without
     * it, behaves like V1 for already-loaded values and no-ops for unknown values.
     */
    revealItem: (value: string | number, align?: RowAlign) => Promise<void>;
    /** Expand a single node. No-op when already expanded or not found. */
    expandItem: (value: string | number) => void;
    /** Toggle a single node by value. */
    toggleItem: (value: string | number) => void;
    /** Expand every node. */
    expandAll: () => void;
    /** Collapse every node. */
    collapseAll: () => void;
    /**
     * Snapshot of the current expansion state, keyed by the source `value`. Use to persist
     * across mounts. Pair with `defaultExpandedValues` to restore.
     */
    getExpandedMap: () => Record<string | number, boolean>;
    /** Focus the tree's root element (the keyboard-nav tab stop). */
    focus: () => void;
}

// =============================================================================
// Props
// =============================================================================

export interface TreeProps<T = ITreeItem>
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className" | "onChange"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Root items. When `T = ITreeItem`, children are read from `item.items`. */
    items: T[] | Traited<unknown[]>;
    /**
     * Override how the model walks to children. Defaults to `(it) => it.items` after the
     * per-row trait is applied. Provide this when `T` carries children under a different
     * field name (e.g. `node.children`).
     *
     * Receives the SOURCE item (pre-trait), not the resolved `ITreeItem`, so consumers can
     * type the accessor against their own shape.
     */
    getChildren?: (source: T) => T[] | undefined;

    /**
     * Currently-selected item. `null` when nothing is selected. May reference an item not
     * present in the tree — the selection styling simply doesn't render.
     *   • Plain `T` — used when `T = ITreeItem`. Reads `.value` directly.
     *   • `Traited<T>` — used with custom `T`. Reads accessor from `value.traits.get(TREE_ITEM_KEY)`.
     *
     * Ignored when `isSelected` is provided.
     */
    value?: T | Traited<T> | null;
    /** Fires when the user selects (clicks or hits Enter on) a row. Emits the source `T`. */
    onChange?: (item: T) => void;
    /**
     * Fires when the user double-clicks a row. Section and disabled rows do not fire — same
     * gate as `onChange`. Emits the source `T` and the row's depth `level`.
     */
    onItemDoubleClick?: (source: T, level: number) => void;
    /**
     * Predicate that overrides `value`-based identity. When supplied, `value` is ignored.
     * Mirrors `ListBox.isSelected`.
     *
     * In `multiSelect` mode this is also the Tree's READ path for the current selection: it is
     * called once per visible row at the start of a selection gesture to derive the set that
     * gesture starts from. Keep it cheap (a `Set` lookup); the Tree stores no selection of its own.
     */
    isSelected?: (item: T, level: number) => boolean;

    /**
     * Enables multi-selection gestures: Ctrl+click toggles a row, Shift+click extends a range from
     * the anchor over the flat visible order, a plain click resets the selection to the clicked row.
     * With `keyboardNav`, also enables Ctrl+A (select every interactive row) and Shift+ArrowUp/Down
     * (extend from the anchor). Ctrl+Shift+click extends the range (it is not a disjoint-range add).
     *
     * The Tree does NOT store the selection — it computes the resulting set and emits it through
     * `onSelectionChange`. Paint the result via `isSelected` (or `value`). Default: false.
     */
    multiSelect?: boolean;
    /**
     * Fires with the FULL resulting selection whenever a selection gesture runs in `multiSelect`
     * mode (any row click, Ctrl+A, Shift+Arrow, or a right-click that moves the selection). Emits
     * the source items and their `value`s in flat visible order.
     *
     * A plain click fires this AND `onChange` (the navigation signal); a Ctrl/Shift click fires only
     * this — building a set must not navigate once per row.
     */
    onSelectionChange?: (sources: T[], values: (string | number)[]) => void;

    /** Index of the highlighted row (across the flat visible list). Controlled. */
    activeIndex?: number | null;
    /**
     * Fires when the active row changes — mouse hover, internal keyboard nav, or mouse
     * leaving the tree (in which case `null` is emitted to clear the highlight).
     */
    onActiveChange?: (index: number | null) => void;

    /** Plain-string label highlight passed to the default `<TreeItem>`. */
    searchText?: string;
    /**
     * Per-row tooltip. Returning `null`, `undefined`, `false`, or empty string suppresses the
     * tooltip on that row. Forwarded to the default `<TreeItem>` via the `tooltip` prop.
     * When a custom `renderItem` is supplied, the caller is responsible for wiring the
     * tooltip themselves — `getTooltip` is not invoked by `Tree` in that path.
     */
    getTooltip?: (item: T, level: number) => SlotText;
    /**
     * Per-row context menu items. Returning `undefined` or an empty array suppresses the menu
     * on that row. Items dispatch via `ContextMenuEvent.fromNativeEvent(e, "generic")` — they
     * bubble to the global handler which renders the actual menu.
     */
    getContextMenu?: (item: T, level: number) => MenuItem[] | undefined;
    /**
     * Container-level context menu — invoked when the user right-clicks on the empty area of
     * the tree (no row hit, OR the row's `getContextMenu` returned nothing).
     */
    onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;

    /** Custom row renderer. Receives a context with the resolved item + flags. */
    renderItem?: (ctx: TreeItemRenderContext<T>) => React.ReactNode;

    /**
     * Initial expansion state when the component mounts. Keys are source `value`s; values are
     * booleans. Items not present in the map use `defaultExpandAll`. After mount the model
     * owns the state; consult this hint on every render until the user explicitly toggles a
     * given node, then `state.expanded[value]` wins for that node.
     */
    defaultExpandedValues?: Record<string | number, boolean>;
    /** When true, every node is expanded on first build. Default: false. */
    defaultExpandAll?: boolean;
    /** Fires whenever a node's expansion changes. Use to persist across remounts. */
    onExpandChange?: (value: string | number, expanded: boolean) => void;

    /** Pixel height of each row. Default: 22. */
    rowHeight?: number;
    /** When set, the tree grows to fit content up to this max height. */
    growToHeight?: React.CSSProperties["height"];
    /** Top/bottom whitespace padding inside the scroll container. */
    whiteSpaceY?: number;

    /** Indentation step in pixels per `level`. Default: 16. */
    indentSize?: number;

    /** Replaces row rendering with a centered spinner. */
    loading?: boolean;
    /** Renders when the tree resolves to zero rows and not `loading`. */
    emptyMessage?: SlotText;
    /** When true, the Tree handles ArrowUp/Down/Left/Right/Home/End/Enter on its root. Default: false. */
    keyboardNav?: boolean;
    /**
     * Enables the focus-aware selection styling (Explorer look: gray when the tree is blurred,
     * blue + outline when focused) and makes the tree root focusable, WITHOUT enabling
     * arrow-key navigation. `keyboardNav` implies this. Default: false.
     */
    focusSelection?: boolean;
    /**
     * Per-row collapse guard, consulted when a toggle would collapse an expanded row
     * (chevron click, ArrowLeft, `toggleItem`). Return false to keep the row open —
     * e.g. a permanent chevron-less root that could otherwise be collapsed via the
     * keyboard with no way to re-open it. Expansion is never blocked. Default: allowed.
     */
    canCollapse?: (source: T, level: number) => boolean;
    /**
     * When true, collapsing a row also collapses every descendant, so re-expanding it shows
     * a fully-closed subtree. Default: false (a subtree keeps its inner expansion).
     *
     * Beyond being a UX preference, this is the correct mode for lazy trees whose consumer
     * discards children of collapsed rows: a descendant left flagged expanded but with its
     * children dropped renders an open chevron over nothing, and the user has to toggle it
     * twice to reload.
     *
     * `onExpandChange` fires once — for the toggled row only. Consumers that persist
     * expansion should read `getExpandedMap()` (already updated when the callback runs)
     * rather than accumulate the per-node callbacks.
     */
    collapseDescendants?: boolean;

    // ── Lazy children loading ────────────────────────────────────────

    /**
     * Predicate: "does this row have children, even if `getChildren` would currently return
     * undefined / empty?". When true, the chevron renders, and expanding the row triggers
     * `loadChildren` (when supplied) instead of treating the row as a leaf.
     *
     * Receives the SOURCE item (pre-trait) so consumers can type the predicate against
     * their own shape. When omitted, chevron visibility is decided solely by the children
     * walk.
     */
    getHasChildren?: (item: T) => boolean;

    /**
     * Async children loader. Called when the user expands a row whose source children are
     * currently unresolved (`getChildren(source)` returns undefined / empty array AND
     * `getHasChildren?.(source)` returned true).
     *
     * Contract:
     *   • Resolve after the consumer has updated their source tree to include the children.
     *     The model bumps `state.revision` after the await, forcing the rows memo to re-walk.
     *     Either pass a fresh `items` reference OR mutate the existing tree in place — both
     *     work, because revision is in the rows-memo deps.
     *   • Reject to signal load failure. The model collapses the row, clears the loading
     *     flag, and invokes `onLoadError`. The model does NOT cache failures — re-expand
     *     re-invokes `loadChildren`. Consumers that want to suppress retry must cache or
     *     resolve with an empty children array.
     */
    loadChildren?: (source: T) => Promise<void>;

    /**
     * Called when `loadChildren` rejects. Default behavior (always applied): the row
     * collapses, `state.loading[value]` clears. This callback only adds consumer-side
     * reaction (e.g. show a notification). Receives the source `value` (not T) so
     * consumers can correlate against their own data without holding a row reference.
     */
    onLoadError?: (value: string | number, error: unknown) => void;

    /**
     * Optional async resolver for `revealItem` to walk to a value that is NOT yet present
     * in the loaded source tree. Returns the chain of ancestor values from root to the
     * row's parent (NOT including the target itself), in root → parent order.
     *
     * When `loadChildren` is set:
     *   • If `value` is already loaded — `revealItem` walks the loaded tree, ignores this prop.
     *   • If `value` is NOT loaded AND this prop is set — `revealItem` calls it, then
     *     sequentially expands each returned ancestor (awaiting `loadChildren` per node),
     *     then walks the loaded tree to find `value` and scroll.
     *   • If `value` is NOT loaded AND this prop is unset — `revealItem` no-ops silently
     *     (same as V1 not-found behavior). Consumers that need cross-window deep reveal
     *     are expected to supply this.
     */
    getAncestorValues?: (value: string | number) => Promise<(string | number)[]>;

    // ── Drag-and-drop ────────────────────────────────────────────────

    /**
     * Trait type id registered in `traitRegistry`. Required for drag to be enabled.
     * Together with `getDragData`, makes rows draggable. Section and disabled rows are
     * never draggable, regardless of this prop.
     */
    traitTypeId?: TraitTypeId;
    /**
     * Per-row drag-data resolver. Returning `null` aborts the drag (e.g. when the source
     * row is the tree's root and shouldn't be moved). The returned value is JSON-
     * serialized into `dataTransfer` — keep it serializable.
     */
    getDragData?: (source: T, level: number) => unknown | null;
    /**
     * When true, rows accept trait drops. Section and disabled rows are never drop
     * targets, regardless of this prop. Container-level drop (no row hit) is out of
     * scope for V1 of DnD.
     */
    acceptsDrop?: boolean;
    /**
     * When true, rows also accept native OS file drags (in addition to trait drags).
     * The file drop is read via the event-expando descriptor (set by the global
     * capture handler) and flows through the same `canTraitDrop`/`onTraitDrop` props
     * as a trait drag — the Tree never reads `dataTransfer.files` itself. Opt-in so
     * trees that can't import files don't light up on a file drag.
     */
    acceptsFileDrop?: boolean;
    /**
     * Per-row drop predicate. Invoked on `dragenter` and again on `drop`. When omitted,
     * defaults to `true`. Use to reject self-drop and ancestor-into-descendant moves.
     */
    canTraitDrop?: (target: T, payload: TraitDragPayload, level: number) => boolean;
    /**
     * Drop handler. Invoked after `canTraitDrop` returns truthy. Consumer is responsible
     * for mutating the source data and firing whatever side effects the drop entails.
     */
    onTraitDrop?: (target: T, payload: TraitDragPayload, level: number) => void;
    /**
     * Auto-expand a collapsed-with-children row that the cursor hovers over during a drag
     * after this many milliseconds. Set to 0 to disable. Default: 500.
     */
    expandOnDragHoverDelay?: number;
    /**
     * First-chance `dragstart` hook, called before the trait-drag payload is built.
     * Return `true` to signal the handler took over the gesture (e.g. it started a
     * native OS drag via `webContents.startDrag` and already called
     * `e.preventDefault()`) — the Tree then skips its own trait-drag setup for this
     * drag. Return `false` (or omit the prop) to let the normal trait drag proceed.
     *
     * Keeps UIKit free of Electron/IPC: the app supplies the native-drag behavior.
     * A row is only draggable when this hook OR (`traitTypeId` + `getDragData`) is set.
     */
    onDragStartOverride?: (source: T, level: number, e: React.DragEvent) => boolean;
}

// =============================================================================
// Internal flat-row shape (exported for custom renderItem callers and tests)
// =============================================================================

export interface TreeRow<T = ITreeItem> {
    /** Resolved item shape. */
    item: ITreeItem;
    /** Source item. */
    source: T;
    /** Depth, root rows = 0. */
    level: number;
    /** True when the user has expanded this row. */
    expanded: boolean;
    /** True when the row has real walked children (drives whether we descend). */
    hasChildren: boolean;
    /**
     * True when `getHasChildren?.(source)` returned truthy AND the walk yielded no
     * children — indicates the row is a lazy folder waiting to load. Independent of
     * `hasChildren` so that chevron visibility (`hasChildren || lazyChildren`) and
     * descend logic (`hasChildren`) stay separable.
     */
    lazyChildren: boolean;
    /** Source `value` — same as `item.value`, hoisted for fast lookups. */
    value: string | number;
}

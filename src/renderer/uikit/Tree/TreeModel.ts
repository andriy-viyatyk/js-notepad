import React from "react";
import { TComponentModel } from "../../core/state/model";
import { isTraited, Traited, TraitType } from "../../core/traits/traits";
import { toPublicEvent } from "../shared/react-compat";
import { VirtualGridModel } from "../VirtualGrid";
import type { RowAlign } from "../VirtualGrid";
import { ContextMenuEvent } from "../../core/events/context-menu";
import {
    ITreeItem,
    TREE_ITEM_KEY,
    TreeProps,
    TreeRow,
} from "./types";
import { TreeDndModel } from "./TreeDndModel";
import { TreeKeyboardHandler } from "./TreeKeyboardHandler";

// =============================================================================
// State
// =============================================================================

export interface TreeState {
    /**
     * Per-source-value expansion state. The model writes here when the user toggles a row
     * (or the imperative API runs); on subsequent renders `rows` consults this map first,
     * falling back to `defaultExpandedValues` and `defaultExpandAll` for keys not yet present.
     */
    expanded: Record<string | number, boolean>;
    /**
     * Per-source-value loading flag. Set true when `loadChildren` begins, cleared on
     * resolve OR reject. Affects the chevron (replaced by spinner) and `data-loading`
     * on the row; does NOT alter the rows-memo output (a loading row is still in `rows`,
     * just with a spinner where its chevron normally is).
     */
    loading: Record<string | number, boolean>;
    /**
     * Bumped after every successful `loadChildren` resolution to force `rows` memo to
     * re-walk even when the consumer mutated the source tree in place (i.e., `props.items`
     * reference is stable). Co-opted by from the V1 declaration.
     */
    revision: number;
    /** Source `value` of the row currently being dragged. Null when no drag in progress. */
    draggingValue: string | number | null;
    /** Source `value` of the row currently under the drag cursor. Null when none. */
    dragOverValue: string | number | null;
}

export const defaultTreeState: TreeState = {
    expanded: {},
    loading: {},
    revision: 0,
    draggingValue: null,
    dragOverValue: null,
};

// =============================================================================
// Helpers
// =============================================================================

function runAccessor<R>(source: unknown, accessor: TraitType<R>): R {
    return Object.fromEntries(
        (Object.keys(accessor) as (keyof TraitType<R>)[]).map((k) => [k, accessor[k](source)]),
    ) as R;
}

// =============================================================================
// Model
// =============================================================================

export class TreeModel<T = ITreeItem> extends TComponentModel<
    TreeState,
    TreeProps<T>
> {
    // --- refs ---

    /**
     * The engine, used only for scrolling. Repaints are requested by `mutate()` and by the host
     * view's props-change gate, never from a state-write site directly.
     */
    gridRef: VirtualGridModel | null = null;
    setGridRef = (ref: VirtualGridModel | null) => {
        this.gridRef = ref;
    };

    /**
     * Registered by the host view. Called after every state write, and the only thing that carries
     * a state change into the DOM — see `mutate`.
     */
    onStateApplied: (() => void) | null = null;

    /**
     * The only place in `uikit/Tree/` that writes state.
     *
     * A vanilla driver pumps props through the view's `update()`, so a state write reaches nothing
     * on its own: there is no re-render to re-evaluate anything, and this model registers no
     * effects (`createComponentModelDriver.mount()` throws if it does). Every write therefore
     * carries its own consequence, and this is where it is carried.
     *
     * Do not call `this.state.update` anywhere else in this folder — `grep "state.update"
     * uikit/Tree/` must return exactly one hit, which is what makes the convention checkable.
     */
    private mutate(updater: (state: TreeState) => void): void {
        this.state.update(updater);
        this.onStateApplied?.();
    }

    /** `TreeDndModel`'s narrow entry to the funnel, so it never touches `tree.state` directly. */
    mutateState = (updater: (state: TreeState) => void): void => {
        this.mutate(updater);
    };

    // Composed interaction models retain transient gesture state outside TreeState.
    readonly keyboard = new TreeKeyboardHandler(this);

    readonly dnd = new TreeDndModel(this);

    // --- ids ---
    private _elementId = "";
    /** Fed by the view from `nextElementId("tree")` — replaces React's `useId` (EPIC-056 C3-5). */
    setElementId = (elementId: string) => {
        this._elementId = elementId;
    };
    get rootId(): string {
        return this.props.id ?? this._elementId;
    }
    itemId = (rowIndex: number): string => {
        const row = this.rows.value[rowIndex];
        return row ? `${this.rootId}-item-${row.value}` : "";
    };

    // --- core derivations ---

    /**
     * Resolve a raw source (from items array OR `value` prop) to its ITreeItem shape via the
     * supplied trait accessor (or, when none, by treating the source as already shaped).
     */
    private resolveOne(
        source: T,
        accessor: TraitType<ITreeItem> | undefined,
    ): { item: ITreeItem; children: T[] | undefined } {
        const item = accessor
            ? runAccessor<ITreeItem>(source, accessor)
            : (source as unknown as ITreeItem);
        const children =
            this.props.getChildren?.(source) ?? (item.items as unknown as T[] | undefined);
        return { item, children };
    }

    /**
     * Resolve a single Traited<T> | T value (from the `value` prop). Selects the trait
     * accessor when the value is wrapped, falls back to the items-prop accessor when
     * passed plain.
     */
    private resolveSelectionValue(v: T | Traited<T>): ITreeItem {
        if (isTraited<T>(v)) {
            const acc = v.traits.get(TREE_ITEM_KEY);
            return acc
                ? runAccessor<ITreeItem>(v.target, acc)
                : (v.target as unknown as ITreeItem);
        }
        const itemsAccessor = this.itemsAccessor;
        return itemsAccessor
            ? runAccessor<ITreeItem>(v, itemsAccessor)
            : (v as unknown as ITreeItem);
    }

    /** Trait accessor for the items prop, or undefined when items is a plain array. */
    private get itemsAccessor(): TraitType<ITreeItem> | undefined {
        const items = this.props.items;
        if (!isTraited<unknown[]>(items)) return undefined;
        return items.traits.get(TREE_ITEM_KEY);
    }

    /**
     * Memoized flat list of visible rows. Each render-relevant input (items prop, expansion
     * map, default-expand hints) appears in the deps factory. RenderGrid iterates over
     * rows.length.
     */
    rows = this.memo<TreeRow<T>[]>(
        () => {
            const items = this.props.items;
            const accessor = this.itemsAccessor;
            const sources = (isTraited<unknown[]>(items) ? items.target : items) as T[];
            const expanded = this.state.get().expanded;
            const expandAll = !!this.props.defaultExpandAll;

            const rows: TreeRow<T>[] = [];
            const walk = (src: T, level: number) => {
                const { item, children } = this.resolveOne(src, accessor);
                const hasChildren = !!children && children.length > 0;
                // Lazy chevron eligibility: predicate says "yes children" but the walk
                // yielded none. When real children are already loaded, this stays false
                // so the chevron is driven solely by `hasChildren`.
                const lazyChildren =
                    !hasChildren && !!this.props.getHasChildren?.(src);
                // Expansion default per node:
                //  - explicit user toggle wins (state.expanded[value])
                //  - otherwise defaultExpandedValues hint wins
                //  - otherwise defaultExpandAll
                const fromState = expanded[item.value];
                const fromHint = this.props.defaultExpandedValues?.[item.value];
                const isExpanded =
                    fromState !== undefined
                        ? fromState
                        : fromHint !== undefined
                            ? fromHint
                            : expandAll;
                rows.push({
                    item,
                    source: src,
                    level,
                    expanded: isExpanded,
                    hasChildren,
                    lazyChildren,
                    value: item.value,
                });
                if (hasChildren && isExpanded && children) {
                    for (const child of children) walk(child, level + 1);
                }
            };
            for (const src of sources) walk(src, 0);
            return rows;
        },
        () => [
            this.props.items,
            this.props.getChildren,
            this.props.getHasChildren,
            this.props.defaultExpandAll,
            this.props.defaultExpandedValues,
            this.state.get().expanded,
            this.state.get().revision,
        ],
    );

    /** Lookup of source `value` to row index (for imperative expand/scroll/toggle). */
    indexByValue = this.memo<Map<string | number, number>>(
        () => {
            const map = new Map<string | number, number>();
            this.rows.value.forEach((r, i) => map.set(r.value, i));
            return map;
        },
        () => [this.rows.value],
    );

    /** Resolved selected `value` from `value` prop (only used when `isSelected` is absent). */
    selectedKey = this.memo<string | number | null>(
        () => {
            const v = this.props.value;
            if (v == null) return null;
            return this.resolveSelectionValue(v).value;
        },
        () => [this.props.value, this.props.items],
    );

    // --- selection / interaction predicates ---

    isSelectedAt = (rowIndex: number): boolean => {
        const r = this.rows.value[rowIndex];
        if (!r || r.item.section) return false;
        if (this.props.isSelected) return this.props.isSelected(r.source, r.level);
        const key = this.selectedKey.value;
        return key != null && r.value === key;
    };

    isInteractive = (rowIndex: number): boolean => {
        const r = this.rows.value[rowIndex];
        return !!r && !r.item.section && !r.item.disabled;
    };

    /** Row index of the current selection, or -1. Keyboard fallback origin when no row
     *  is active (e.g. the mouse just left the tree). */
    selectedRowIndex = (): number => {
        const rows = this.rows.value;
        for (let i = 0; i < rows.length; i++) {
            if (this.isSelectedAt(i)) return i;
        }
        return -1;
    };

    findNextInteractive = (start: number, dir: 1 | -1): number => {
        const rows = this.rows.value;
        let i = start;
        while (i >= 0 && i < rows.length) {
            if (this.isInteractive(i)) return i;
            i += dir;
        }
        return -1;
    };

    // --- multi-selection ---

    /**
     * Indices of the rows currently selected, read through the consumer's selection (predicate or
     * `value` prop). O(visible rows), called once per gesture -- never per render.
     */
    private currentSelectionIndices = (): number[] => {
        const out: number[] = [];
        for (let i = 0; i < this.rows.value.length; i++) {
            if (this.isSelectedAt(i)) out.push(i);
        }
        return out;
    };

    /** De-dupe, drop non-interactive rows, sort into visible order, emit. */
    emitSelection = (indices: number[]) => {
        const handler = this.props.onSelectionChange;
        if (!handler) return;
        const unique = [...new Set(indices)]
            .filter((i) => this.isInteractive(i))
            .sort((a, b) => a - b);
        const rows = this.rows.value;
        handler(
            unique.map((i) => rows[i].source),
            unique.map((i) => rows[i].value),
        );
    };

    /** Inclusive index range between two rows, in either direction. */
    rangeIndices = (from: number, to: number): number[] => {
        const [lo, hi] = from <= to ? [from, to] : [to, from];
        const out: number[] = [];
        for (let i = lo; i <= hi; i++) out.push(i);
        return out;
    };

    findParentIndex = (rowIndex: number): number => {
        const rows = this.rows.value;
        const cur = rows[rowIndex];
        if (!cur || cur.level === 0) return -1;
        for (let i = rowIndex - 1; i >= 0; i--) {
            if (rows[i].level < cur.level) return i;
        }
        return -1;
    };

    // --- handlers ---

    /**
     * Row click. In single-select mode (the default) this is unchanged: fire `onChange`.
     *
     * In `multiSelect` mode the modifier decides. Shift is tested BEFORE Ctrl deliberately -- that
     * ordering is what makes Ctrl+Shift+click a range extend rather than needing a third rule; a
     * disjoint-range add is not a gesture we support.
     */
    onItemClick = (rowIndex: number, e?: MouseEvent) => {
        const r = this.rows.value[rowIndex];
        if (!r || r.item.disabled || r.item.section) return;

        if (!this.props.multiSelect) {
            this.props.onChange?.(r.source);
            return;
        }

        if (e?.shiftKey) {
            this.emitSelection(this.rangeIndices(this.keyboard.anchorIndex() ?? rowIndex, rowIndex));
            return; // anchor unchanged -- successive Shift+clicks pivot on the same row
        }
        if (e?.ctrlKey) {
            const current = this.currentSelectionIndices();
            const next = current.includes(rowIndex)
                ? current.filter((i) => i !== rowIndex)
                : [...current, rowIndex];
            this.keyboard.setAnchor(r.value);
            this.emitSelection(next);
            return;
        }
        this.keyboard.setAnchor(r.value);
        this.emitSelection([rowIndex]);
        this.props.onChange?.(r.source);
    };

    onItemDoubleClick = (rowIndex: number) => {
        const r = this.rows.value[rowIndex];
        if (!r || r.item.disabled || r.item.section) return;
        this.props.onItemDoubleClick?.(r.source, r.level);
    };

    onChevronClick = (e: MouseEvent, rowIndex: number) => {
        e.stopPropagation();
        this.toggleAt(rowIndex);
    };

    onItemMouseEnter = (rowIndex: number) => {
        if (!this.isInteractive(rowIndex)) return;
        if (rowIndex !== this.props.activeIndex) this.props.onActiveChange?.(rowIndex);
    };

    /** Clear the active highlight when the mouse leaves the tree container. */
    onRootMouseLeave = () => {
        if (this.props.activeIndex != null) this.props.onActiveChange?.(null);
    };

    onItemContextMenu = (e: MouseEvent, rowIndex: number) => {
        const r = this.rows.value[rowIndex];
        if (!r || r.item.section) return;

        // Right-click moves the selection to this row ONLY when the row is outside the current
        // selection. Right-clicking one of N selected rows must keep all N, so the menu it opens
        // can act on the whole set (Windows Explorer / VS Code behavior). No `onChange` -- a
        // right-click never navigates.
        if (this.props.multiSelect && this.isInteractive(rowIndex) && !this.isSelectedAt(rowIndex)) {
            this.keyboard.setAnchor(r.value);
            this.emitSelection([rowIndex]);
        }

        const items = this.props.getContextMenu?.(r.source, r.level);
        if (!items || items.length === 0) return;
        const ctxEvent = ContextMenuEvent.fromNativeEvent(e, "generic");
        ctxEvent.items.push(...items);
    };

    /**
     * Container-level context-menu handler. Skipped when a row already populated
     * `ContextMenuEvent.items` -- the row's menu wins.
     */
    onRootContextMenu = (e: MouseEvent) => {
        if (e.contextMenuEvent?.items.length) return;
        // The public prop keeps its React signature — Epic F owns API cleanup — so bridge here.
        this.props.onContextMenu?.(
            toPublicEvent(e) as unknown as React.MouseEvent<HTMLDivElement>,
        );
    };

    onKeyDown = this.keyboard.onKeyDown;

    // --- drag-and-drop compatibility delegates ---

    get isDndEnabled(): boolean {
        return this.dnd.isEnabled;
    }

    canDragRow = this.dnd.canDragRow;
    canDropRow = this.dnd.canDropRow;
    isDraggingAt = this.dnd.isDraggingAt;
    isDropTargetAt = this.dnd.isDropTargetAt;
    onDragStart = this.dnd.onDragStart;
    onDragEnd = this.dnd.onDragEnd;
    onDragEnter = this.dnd.onDragEnter;
    onDragOver = this.dnd.onDragOver;
    onDragLeave = this.dnd.onDragLeave;
    onDrop = this.dnd.onDrop;

    // --- lazy children loading ---

    /**
     * True when the row at `idx` has unresolved children that should be fetched on expand.
     * The condition is: row is a lazy folder (predicate true, no walked children) AND
     * `loadChildren` is set.
     */
    private needsLazyLoad = (rowIndex: number): boolean => {
        if (!this.props.loadChildren) return false;
        const r = this.rows.value[rowIndex];
        if (!r) return false;
        return r.lazyChildren;
    };

    isLoadingAt = (rowIndex: number): boolean => {
        const r = this.rows.value[rowIndex];
        return !!r && !!this.state.get().loading[r.value];
    };

    /**
     * Run `loadChildren` for a row. Sets expanded=true + loading=true atomically before
     * the await; on resolve clears loading + bumps revision (forces rows-memo re-walk);
     * on reject clears loading + sets expanded=false + invokes `onLoadError`.
     *
     * Re-checks `isLive` at every awaited boundary so an unmount mid-load is safe.
     */
    private runLoadAndExpand = async (r: TreeRow<T>): Promise<void> => {
        const loader = this.props.loadChildren;
        if (!loader) return;
        const v = r.value;

        this.mutate((s) => {
            s.expanded[v] = true;
            s.loading[v] = true;
        });
        this.props.onExpandChange?.(v, true);

        try {
            await loader(r.source);
        } catch (err) {
            if (!this.isLive) return;
            // `onLoadError` is raised BEFORE the state write, because the write it used to follow
            // was deferred: with the microtask gone, keeping the statement order would flip the
            // observable order of `onLoadError` and `onExpandChange(v, false)`.
            this.props.onLoadError?.(v, err);
            this.mutate((s) => {
                s.loading[v] = false;
                s.expanded[v] = false;
            });
            this.props.onExpandChange?.(v, false);
            return;
        }
        if (!this.isLive) return;
        this.mutate((s) => {
            s.loading[v] = false;
            s.revision += 1;
        });
    };

    // --- imperative API ---

    toggleAt = (rowIndex: number) => {
        const r = this.rows.value[rowIndex];
        if (!r) return;
        if (!r.hasChildren && !r.lazyChildren) return;

        // Collapse guard -- e.g. a permanent chevron-less root that keyboard ArrowLeft
        // could otherwise collapse with no way to re-open it. Expansion never blocks.
        if (r.expanded && this.props.canCollapse && !this.props.canCollapse(r.source, r.level)) {
            return;
        }

        // Already loading? Ignore re-toggles during an inflight load -- the user must wait
        // for resolution before collapsing. Avoids a race where collapse-then-resolve
        // would flip a row open that the user explicitly closed.
        if (this.state.get().loading[r.value]) return;

        if (r.lazyChildren && !r.expanded && this.needsLazyLoad(rowIndex)) {
            // Lazy expand path -- runLoadAndExpand sets expanded=true + loading=true atomically.
            void this.runLoadAndExpand(r);
            return;
        }

        const next = !r.expanded;
        // Collapsing with `collapseDescendants`: close the whole subtree in the same state
        // write, so re-expanding this row reveals a fully-closed subtree -- and, for lazy
        // trees, so no descendant is left flagged expanded after its children are dropped.
        const descendants =
            !next && this.props.collapseDescendants
                ? this.collectDescendantValues(r.source)
                : null;
        // Written inline. The deferral this replaced existed only because model effects with deps
        // ran inside `setPropsInternal` during React's render phase; a vanilla-driven model
        // registers no effects, and every caller of this method is a DOM event, a timer or an
        // explicit imperative call. The write still precedes `onExpandChange`, so a consumer that
        // reads `getExpandedMap()` from that callback still sees the new map.
        this.mutate((s) => {
            s.expanded[r.value] = next;
            if (descendants) {
                for (const v of descendants) s.expanded[v] = false;
            }
        });
        this.props.onExpandChange?.(r.value, next);
    };

    /**
     * Every descendant `value` under `source`, excluding `source` itself. Walks the SOURCE
     * tree, so it reaches collapsed-but-loaded descendants; a lazy descendant with no loaded
     * children contributes only itself. Leaves are included -- writing `false` for a leaf is
     * harmless and clears any stale flag it picked up while it still had children.
     */
    private collectDescendantValues = (source: T): (string | number)[] => {
        const accessor = this.itemsAccessor;
        const values: (string | number)[] = [];
        const walk = (src: T) => {
            const { item, children } = this.resolveOne(src, accessor);
            values.push(item.value);
            if (children) for (const child of children) walk(child);
        };
        const { children } = this.resolveOne(source, accessor);
        if (children) for (const child of children) walk(child);
        return values;
    };

    expandItem = (value: string | number) => {
        const idx = this.indexByValue.value.get(value);
        if (idx == null) return;
        const r = this.rows.value[idx];
        if (!r || r.expanded) return;
        this.toggleAt(idx);
    };

    toggleItem = (value: string | number) => {
        const idx = this.indexByValue.value.get(value);
        if (idx != null) this.toggleAt(idx);
    };

    /**
     * Expand every node that currently has loaded children. Lazy/unloaded nodes are NOT
     * traversed -- `loadChildren` is fired-and-awaited only via user expansion or via
     * `revealItem`. Consumers that want to fully unfold a lazy tree must walk and
     * `revealItem` each leaf themselves.
     */
    expandAll = () => {
        // Walk the SOURCE tree (not the visible-rows view) so collapsed subtrees are also
        // marked expanded. Otherwise expandAll would only expand currently-visible nodes,
        // requiring multiple invocations to fully open the tree.
        const items = this.props.items;
        const accessor = this.itemsAccessor;
        const sources = (isTraited<unknown[]>(items) ? items.target : items) as T[];
        const map: Record<string | number, boolean> = {};
        const walk = (src: T) => {
            const { item, children } = this.resolveOne(src, accessor);
            if (children && children.length > 0) {
                map[item.value] = true;
                for (const child of children) walk(child);
            }
        };
        for (const src of sources) walk(src);

        this.mutate((s) => {
            Object.assign(s.expanded, map);
        });
    };

    collapseAll = () => {
        // Set expanded[value] = false for every node that has children, INCLUDING those
        // currently collapsed (so subsequent defaultExpandAll / hints don't re-expand them).
        const items = this.props.items;
        const accessor = this.itemsAccessor;
        const sources = (isTraited<unknown[]>(items) ? items.target : items) as T[];
        const map: Record<string | number, boolean> = {};
        const walk = (src: T) => {
            const { item, children } = this.resolveOne(src, accessor);
            if (children && children.length > 0) {
                map[item.value] = false;
                for (const child of children) walk(child);
            }
        };
        for (const src of sources) walk(src);

        this.mutate((s) => {
            Object.assign(s.expanded, map);
        });
    };

    getExpandedMap = (): Record<string | number, boolean> => {
        return { ...this.state.get().expanded };
    };

    scrollToItem = (value: string | number, align?: RowAlign) => {
        const idx = this.indexByValue.value.get(value);
        if (idx != null) this.gridRef?.scrollToRow(idx, align);
    };

    /** Focus the tree root (the keyboard-nav tab stop). The root already carries
     *  `id={rootId}`, so no extra ref plumbing is needed. */
    focusRoot = () => {
        document.getElementById(this.rootId)?.focus();
    };

    /**
     * Walk the SOURCE tree to find the chain of ancestors of `target`. Returns the chain
     * in root-to-parent order (excluding the target itself), or null when the target
     * value is not present in the tree.
     */
    private findAncestorChain = (
        target: string | number,
    ): (string | number)[] | null => {
        const items = this.props.items;
        const accessor = this.itemsAccessor;
        const sources = (isTraited<unknown[]>(items) ? items.target : items) as T[];
        const path: (string | number)[] = [];

        const walk = (src: T): boolean => {
            const { item, children } = this.resolveOne(src, accessor);
            if (item.value === target) return true;
            if (children) {
                for (const child of children) {
                    if (walk(child)) {
                        path.unshift(item.value);
                        return true;
                    }
                }
            }
            return false;
        };

        for (const src of sources) {
            if (walk(src)) return path;
        }
        return null;
    };

    /**
     * Expand every ancestor of `value` (awaiting `loadChildren` for any unresolved
     * ancestor), then scroll the row into view. Returns when the row is visible (or
     * unreachable). Sync callers may ignore the returned promise -- this is a drop-in
     * for the V1 sync revealItem.
     *
     * Reaches not-yet-loaded values only when `getAncestorValues` is supplied. Without
     * it, no-ops on unknown values (V1-compatible).
     */
    revealItem = async (value: string | number, align?: RowAlign): Promise<void> => {
        // Fast path 1 -- already-visible value with all ancestors expanded: just scroll.
        const expandedNow = this.state.get().expanded;
        const chainNow = this.findAncestorChain(value);
        if (chainNow != null && chainNow.every((a) => expandedNow[a])) {
            const idx = this.indexByValue.value.get(value);
            if (idx != null) this.gridRef?.scrollToRow(idx, align ?? "nearest");
            return;
        }

        // Fast path 2 -- value loaded but some ancestors collapsed: sync expand all + scroll.
        if (chainNow != null) {
            await this.expandAncestorsThenScroll(chainNow, value, align);
            return;
        }

        // Slow path -- value not yet loaded. Defer to consumer-supplied resolver.
        const resolver = this.props.getAncestorValues;
        if (!resolver) return; // legacy not-found semantics: silent no-op.

        let ancestors: (string | number)[];
        try {
            ancestors = await resolver(value);
        } catch {
            return;
        }
        if (!this.isLive) return;

        // Sequentially expand each ancestor -- for any that is unloaded, runLoadAndExpand
        // resolves only after children land. Then walk the next.
        for (const a of ancestors) {
            const idx = this.indexByValue.value.get(a);
            if (idx == null) return; // chain is broken -- bail.
            const row = this.rows.value[idx];
            if (!row) return;
            if (row.expanded) continue;

            if (this.needsLazyLoad(idx)) {
                await this.runLoadAndExpand(row);
            } else if (row.hasChildren) {
                // No wait after the toggle: the state write is synchronous and `memo()` is lazy, so
                // `indexByValue.value` on the next iteration already reflects the new rows. The
                // `setTimeout(0)` this replaces existed only to outlive `toggleAt`'s microtask.
                this.toggleAt(idx);
            }
            if (!this.isLive) return;
        }

        // Final ancestor pass + scroll, now that every ancestor is loaded + expanded.
        const finalChain = this.findAncestorChain(value);
        if (finalChain == null) return;
        await this.expandAncestorsThenScroll(finalChain, value, align);
    };

    /**
     * Internal: ensure all ancestors in `chain` are expanded, then scroll to `value`.
     * Used by both fast paths in revealItem; collapses to one queued state update for
     * the "all already loaded" case, mirroring V1.
     */
    private expandAncestorsThenScroll = async (
        chain: (string | number)[],
        value: string | number,
        align?: RowAlign,
    ): Promise<void> => {
        let expandedRows = false;
        if (chain.length > 0) {
            const expanded = this.state.get().expanded;
            if (chain.some((a) => !expanded[a])) {
                this.mutate((s) => {
                    for (const a of chain) s.expanded[a] = true;
                });
                expandedRows = true;
            }
        }
        if (!this.isLive) return;
        const idx = this.indexByValue.value.get(value);
        if (idx == null) return;
        if (expandedRows) {
            // The row set just grew, so the scrollable extent is stale until the paint that
            // `mutate` scheduled writes it. `scrollTop` clamps to the current extent, so scrolling
            // now would land short with nothing re-issuing the request — the one deferral on this
            // path that was NOT a React workaround. See `scrollToRowAfterPaint`.
            this.gridRef?.scrollToRowAfterPaint(idx, align ?? "nearest");
            return;
        }
        void this.gridRef?.scrollToRow(idx, align ?? "nearest");
    };

    // --- change detection ---

    /**
     * Everything a rendered cell reads, for the host view's `DepsGate` (EPIC-056 C3-6).
     *
     * Fixed length — `depsChanged` reads a length change as "changed". **No reactive state**: a
     * state change does not pump props in a vanilla driver, so a state slot would be dead code.
     * `draggingValue`, `dragOverValue` and `loading` reach the DOM through `mutate()` instead.
     *
     * Memo outputs are compared, not their upstream props: `rows` is not derivable from props at
     * all (its identity is the only signal carrying expand/collapse), and `selectedKey` normalises
     * to a primitive.
     *
     * Three departures from the effect this replaces, all because the React path repainted
     * unconditionally on every parent render and so could not expose a gap: `rowHeight` is dropped
     * (the engine compares it in `inputChanged()`), `getContextMenu` is dropped (read at event
     * time, changes no cell DOM), and `id` plus the four DnD-gating props are **added** — they are
     * read on the cell path, for `itemId()` and for the wrapper's `draggable` attribute.
     */
    repaintSignature(): readonly unknown[] {
        return [
            this.rows.value,
            this.selectedKey.value,
            this.props.activeIndex,
            this.props.searchText,
            this.props.renderItem,
            this.props.indentSize,
            this.props.isSelected,
            this.props.getTooltip,
            this.props.id,
            this.props.traitTypeId,
            this.props.getDragData,
            this.props.acceptsDrop,
            this.props.onDragStartOverride,
        ];
    }

    // --- lifecycle ---

    /**
     * No `effect()` calls: `createComponentModelDriver` refuses to mount a model that registers
     * any, and both of the two this model used to have have been re-homed. The repaint effect
     * became `repaintSignature()` plus the host view's gate for props, and `mutate()` for state;
     * the scroll-on-`activeIndex` effect became the host view's `syncActiveScroll`, with the
     * unmeasured case now handled by the engine's own pending-scroll register rather than a
     * `setTimeout(0)` that could not test the actual condition.
     */
    init() {
        this.props.onModel?.(this);
    }

    dispose() {
        this.props.onModel?.(null);
        this.dnd.dispose();
    }
}

import React from "react";
import { TComponentModel } from "../../core/state/model";
import { isTraited, Traited, TraitType } from "../../core/traits/traits";
import {
    setTraitDragData,
    hasTraitDragData,
    isFileDrag,
    getTraitDragDataFromEvent,
} from "../../core/traits/dnd";
import { RenderGridModel } from "../RenderGrid";
import type { RowAlign } from "../RenderGrid";
import { ContextMenuEvent } from "../../api/events/events";
import {
    ITreeItem,
    TREE_ITEM_KEY,
    TreeProps,
    TreeRow,
} from "./types";

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
    gridRef: RenderGridModel | null = null;
    setGridRef = (ref: RenderGridModel | null) => {
        this.gridRef = ref;
    };

    // --- drag-and-drop transient state (not in TreeState) ---

    /**
     * Per-row dragenter/dragleave counter, keyed by source `value`. Native
     * `dragenter`/`dragleave` fire for child elements too, so a depth counter is
     * required to avoid the highlight flickering as the cursor moves between the row
     * and its inner spans. Keying by `value` (not row index) survives row index
     * changes during a drag — for example when expand-on-hover fires mid-drag.
     */
    private dragEnterCounts = new Map<string | number, number>();

    /** Active expand-on-hover timer id (window.setTimeout). */
    private dragHoverExpandTimer: number | null = null;

    // --- ids ---
    private _reactId = "";
    setReactId = (reactId: string) => {
        this._reactId = reactId;
    };
    get rootId(): string {
        return this.props.id ?? `tree-${this._reactId}`;
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

    /** Lookup of source `value` → row index (for imperative expand/scroll/toggle). */
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
    private selectedRowIndex = (): number => {
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

    onItemClick = (rowIndex: number) => {
        const r = this.rows.value[rowIndex];
        if (!r || r.item.disabled || r.item.section) return;
        this.props.onChange?.(r.source);
    };

    onItemDoubleClick = (rowIndex: number) => {
        const r = this.rows.value[rowIndex];
        if (!r || r.item.disabled || r.item.section) return;
        this.props.onItemDoubleClick?.(r.source, r.level);
    };

    onChevronClick = (e: React.MouseEvent, rowIndex: number) => {
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

    onItemContextMenu = (e: React.MouseEvent<HTMLDivElement>, rowIndex: number) => {
        const r = this.rows.value[rowIndex];
        if (!r || r.item.section) return;
        const items = this.props.getContextMenu?.(r.source, r.level);
        if (!items || items.length === 0) return;
        const ctxEvent = ContextMenuEvent.fromNativeEvent(e, "generic");
        ctxEvent.items.push(...items);
    };

    /**
     * Container-level context-menu handler. Skipped when a row already populated
     * `ContextMenuEvent.items` — the row's menu wins.
     */
    onRootContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.nativeEvent.contextMenuEvent?.items.length) return;
        this.props.onContextMenu?.(e);
    };

    onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (!this.props.keyboardNav) return;
        const rows = this.rows.value;
        const n = rows.length;
        if (n === 0) return;
        const cur = this.props.activeIndex ?? this.selectedRowIndex();
        const apply = (target: number) => {
            if (target < 0) return;
            this.props.onActiveChange?.(target);
            this.gridRef?.scrollToRow(target);
        };
        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                apply(this.findNextInteractive(Math.min(n - 1, cur + 1), 1));
                break;
            case "ArrowUp":
                e.preventDefault();
                apply(this.findNextInteractive(Math.max(0, cur - 1), -1));
                break;
            case "Home":
                e.preventDefault();
                apply(this.findNextInteractive(0, 1));
                break;
            case "End":
                e.preventDefault();
                apply(this.findNextInteractive(n - 1, -1));
                break;
            case "PageDown": {
                e.preventDefault();
                const page = Math.max(1, this.gridRef?.visibleRowCount ?? 1);
                const start = (cur < 0 ? 0 : cur) + page;
                const target = this.findNextInteractive(Math.min(n - 1, start), 1);
                apply(target >= 0 ? target : this.findNextInteractive(n - 1, -1));
                break;
            }
            case "PageUp": {
                e.preventDefault();
                const page = Math.max(1, this.gridRef?.visibleRowCount ?? 1);
                const start = (cur < 0 ? 0 : cur) - page;
                const target = this.findNextInteractive(Math.max(0, start), -1);
                apply(target >= 0 ? target : this.findNextInteractive(0, 1));
                break;
            }
            case "ArrowRight": {
                e.preventDefault();
                if (cur < 0) break;
                const r = rows[cur];
                if (!r) break;
                const expandable = r.hasChildren || r.lazyChildren;
                if (expandable && !r.expanded) {
                    this.toggleAt(cur);
                } else if (r.hasChildren && r.expanded) {
                    apply(this.findNextInteractive(cur + 1, 1));
                }
                break;
            }
            case "ArrowLeft": {
                e.preventDefault();
                if (cur < 0) break;
                const r = rows[cur];
                if (!r) break;
                const expandable = r.hasChildren || r.lazyChildren;
                if (expandable && r.expanded) {
                    this.toggleAt(cur);
                } else {
                    apply(this.findParentIndex(cur));
                }
                break;
            }
            case "Enter":
                if (cur >= 0) {
                    e.preventDefault();
                    this.onItemClick(cur);
                }
                break;
        }
    };

    // --- drag-and-drop ---

    /** Whether DnD is enabled at all (drag source AND/OR drop target). */
    get isDndEnabled(): boolean {
        return (
            (!!this.props.traitTypeId && !!this.props.getDragData) ||
            !!this.props.acceptsDrop
        );
    }

    /** Whether row at idx is allowed to start a drag. Enabled by a trait-drag config
     *  (`traitTypeId` + `getDragData`) OR an `onDragStartOverride` (native OS drag). */
    canDragRow = (rowIndex: number): boolean => {
        const hasTraitDrag = !!this.props.traitTypeId && !!this.props.getDragData;
        if (!hasTraitDrag && !this.props.onDragStartOverride) return false;
        const r = this.rows.value[rowIndex];
        return !!r && !r.item.section && !r.item.disabled;
    };

    /** Whether row at idx is allowed to receive drops. */
    canDropRow = (rowIndex: number): boolean => {
        if (!this.props.acceptsDrop) return false;
        const r = this.rows.value[rowIndex];
        return !!r && !r.item.section && !r.item.disabled;
    };

    isDraggingAt = (rowIndex: number): boolean => {
        const r = this.rows.value[rowIndex];
        const v = this.state.get().draggingValue;
        return !!r && v != null && r.value === v;
    };

    isDropTargetAt = (rowIndex: number): boolean => {
        const r = this.rows.value[rowIndex];
        const v = this.state.get().dragOverValue;
        return !!r && v != null && r.value === v;
    };

    onDragStart = (e: React.DragEvent<HTMLDivElement>, rowIndex: number) => {
        const r = this.rows.value[rowIndex];
        if (!r || r.item.section || r.item.disabled) {
            e.preventDefault();
            return;
        }
        // First chance: the app may take over the gesture with a native OS drag.
        if (this.props.onDragStartOverride?.(r.source, r.level, e)) {
            e.stopPropagation();
            return;
        }
        const { traitTypeId, getDragData } = this.props;
        if (!traitTypeId || !getDragData) {
            e.preventDefault();
            return;
        }
        const data = getDragData(r.source, r.level);
        if (data == null) {
            e.preventDefault();
            return;
        }
        e.stopPropagation();
        setTraitDragData(e.dataTransfer, traitTypeId, data);
        queueMicrotask(() => {
            if (!this.isLive) return;
            this.state.update((s) => {
                s.draggingValue = r.value;
            });
        });
    };

    onDragEnd = () => {
        this.dragEnterCounts.clear();
        this.cancelHoverExpandTimer();
        queueMicrotask(() => {
            if (!this.isLive) return;
            this.state.update((s) => {
                s.draggingValue = null;
                s.dragOverValue = null;
            });
        });
    };

    /** Accept a drag if it carries trait data, OR it's an OS file drag and this Tree
     *  opted into file drops (`acceptsFileDrop`). Keeps the Tree from reading `files`. */
    private acceptsDrag(dataTransfer: DataTransfer): boolean {
        return hasTraitDragData(dataTransfer)
            || (!!this.props.acceptsFileDrop && isFileDrag(dataTransfer));
    }

    onDragEnter = (e: React.DragEvent<HTMLDivElement>, rowIndex: number) => {
        if (!this.canDropRow(rowIndex)) return;
        if (!this.acceptsDrag(e.dataTransfer)) return;
        const r = this.rows.value[rowIndex];
        if (!r) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = isFileDrag(e.dataTransfer) ? "copy" : "move";

        const cur = this.dragEnterCounts.get(r.value) ?? 0;
        this.dragEnterCounts.set(r.value, cur + 1);
        if (cur === 0) {
            queueMicrotask(() => {
                if (!this.isLive) return;
                this.state.update((s) => {
                    s.dragOverValue = r.value;
                });
            });
            this.scheduleHoverExpand(r);
        }
    };

    onDragOver = (e: React.DragEvent<HTMLDivElement>, rowIndex: number) => {
        if (!this.canDropRow(rowIndex)) return;
        if (!this.acceptsDrag(e.dataTransfer)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = isFileDrag(e.dataTransfer) ? "copy" : "move";
    };

    onDragLeave = (_e: React.DragEvent<HTMLDivElement>, rowIndex: number) => {
        const r = this.rows.value[rowIndex];
        if (!r) return;
        const cur = this.dragEnterCounts.get(r.value) ?? 0;
        const next = cur - 1;
        if (next <= 0) {
            this.dragEnterCounts.delete(r.value);
            this.cancelHoverExpandTimer();
            queueMicrotask(() => {
                if (!this.isLive) return;
                this.state.update((s) => {
                    if (s.dragOverValue === r.value) s.dragOverValue = null;
                });
            });
        } else {
            this.dragEnterCounts.set(r.value, next);
        }
    };

    onDrop = (e: React.DragEvent<HTMLDivElement>, rowIndex: number) => {
        if (!this.canDropRow(rowIndex)) return;
        e.preventDefault();
        e.stopPropagation();
        this.dragEnterCounts.clear();
        this.cancelHoverExpandTimer();

        const payload = getTraitDragDataFromEvent(e);
        queueMicrotask(() => {
            if (!this.isLive) return;
            this.state.update((s) => {
                s.dragOverValue = null;
                s.draggingValue = null;
            });
        });
        if (!payload) return;

        const r = this.rows.value[rowIndex];
        if (!r) return;
        const allowed = this.props.canTraitDrop?.(r.source, payload, r.level) ?? true;
        if (allowed) this.props.onTraitDrop?.(r.source, payload, r.level);
    };

    private scheduleHoverExpand(r: TreeRow<T>) {
        this.cancelHoverExpandTimer();
        const delay = this.props.expandOnDragHoverDelay ?? 500;
        if (delay <= 0) return;
        if (!r.hasChildren || r.expanded) return;
        this.dragHoverExpandTimer = window.setTimeout(() => {
            this.dragHoverExpandTimer = null;
            if (!this.isLive) return;
            // Re-check the row is still hovered and still collapsed before expanding —
            // the user may have moved to a sibling between schedule and fire.
            if (this.state.get().dragOverValue !== r.value) return;
            const idx = this.indexByValue.value.get(r.value);
            if (idx == null) return;
            const cur = this.rows.value[idx];
            if (!cur || cur.expanded) return;
            this.toggleAt(idx);
        }, delay);
    }

    private cancelHoverExpandTimer() {
        if (this.dragHoverExpandTimer != null) {
            window.clearTimeout(this.dragHoverExpandTimer);
            this.dragHoverExpandTimer = null;
        }
    }

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

        queueMicrotask(() => {
            if (!this.isLive) return;
            this.state.update((s) => {
                s.expanded[v] = true;
                s.loading[v] = true;
            });
            this.props.onExpandChange?.(v, true);
            this.gridRef?.update({ all: true });
        });

        try {
            await loader(r.source);
        } catch (err) {
            if (!this.isLive) return;
            queueMicrotask(() => {
                if (!this.isLive) return;
                this.state.update((s) => {
                    s.loading[v] = false;
                    s.expanded[v] = false;
                });
                this.props.onExpandChange?.(v, false);
                this.gridRef?.update({ all: true });
            });
            this.props.onLoadError?.(v, err);
            return;
        }
        if (!this.isLive) return;
        queueMicrotask(() => {
            if (!this.isLive) return;
            this.state.update((s) => {
                s.loading[v] = false;
                s.revision += 1;
            });
            this.gridRef?.update({ all: true });
        });
    };

    // --- imperative API ---

    toggleAt = (rowIndex: number) => {
        const r = this.rows.value[rowIndex];
        if (!r) return;
        if (!r.hasChildren && !r.lazyChildren) return;

        // Collapse guard — e.g. a permanent chevron-less root that keyboard ArrowLeft
        // could otherwise collapse with no way to re-open it. Expansion never blocks.
        if (r.expanded && this.props.canCollapse && !this.props.canCollapse(r.source, r.level)) {
            return;
        }

        // Already loading? Ignore re-toggles during an inflight load — the user must wait
        // for resolution before collapsing. Avoids a race where collapse-then-resolve
        // would flip a row open that the user explicitly closed.
        if (this.state.get().loading[r.value]) return;

        if (r.lazyChildren && !r.expanded && this.needsLazyLoad(rowIndex)) {
            // Lazy expand path — runLoadAndExpand sets expanded=true + loading=true atomically.
            void this.runLoadAndExpand(r);
            return;
        }

        const next = !r.expanded;
        // Defer the state write past the current render — model effects with deps run inside
        // setPropsInternal during the render phase, and synchronous state.update from here
        // would trigger React's "Cannot update a component while rendering a different
        // component" warning when this method is invoked from a render-time path. Re-check
        // liveness inside the microtask in case the user unmounted before it ran.
        queueMicrotask(() => {
            if (!this.isLive) return;
            this.state.update((s) => {
                s.expanded[r.value] = next;
            });
            this.props.onExpandChange?.(r.value, next);
            this.gridRef?.update({ all: true });
        });
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
     * traversed — `loadChildren` is fired-and-awaited only via user expansion or via
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

        queueMicrotask(() => {
            if (!this.isLive) return;
            this.state.update((s) => {
                Object.assign(s.expanded, map);
            });
            this.gridRef?.update({ all: true });
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

        queueMicrotask(() => {
            if (!this.isLive) return;
            this.state.update((s) => {
                Object.assign(s.expanded, map);
            });
            this.gridRef?.update({ all: true });
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
     * unreachable). Sync callers may ignore the returned promise — this is a drop-in
     * for the V1 sync revealItem.
     *
     * Reaches not-yet-loaded values only when `getAncestorValues` is supplied. Without
     * it, no-ops on unknown values (V1-compatible).
     */
    revealItem = async (value: string | number, align?: RowAlign): Promise<void> => {
        // Fast path 1 — already-visible value with all ancestors expanded: just scroll.
        const expandedNow = this.state.get().expanded;
        const chainNow = this.findAncestorChain(value);
        if (chainNow != null && chainNow.every((a) => expandedNow[a])) {
            const idx = this.indexByValue.value.get(value);
            if (idx != null) this.gridRef?.scrollToRow(idx, align ?? "nearest");
            return;
        }

        // Fast path 2 — value loaded but some ancestors collapsed: sync expand all + scroll.
        if (chainNow != null) {
            await this.expandAncestorsThenScroll(chainNow, value, align);
            return;
        }

        // Slow path — value not yet loaded. Defer to consumer-supplied resolver.
        const resolver = this.props.getAncestorValues;
        if (!resolver) return; // legacy not-found semantics: silent no-op.

        let ancestors: (string | number)[];
        try {
            ancestors = await resolver(value);
        } catch {
            return;
        }
        if (!this.isLive) return;

        // Sequentially expand each ancestor — for any that is unloaded, runLoadAndExpand
        // resolves only after children land. Then walk the next.
        for (const a of ancestors) {
            const idx = this.indexByValue.value.get(a);
            if (idx == null) return; // chain is broken — bail.
            const row = this.rows.value[idx];
            if (!row) return;
            if (row.expanded) continue;

            if (this.needsLazyLoad(idx)) {
                await this.runLoadAndExpand(row);
            } else if (row.hasChildren) {
                this.toggleAt(idx);
                await new Promise<void>((resolve) => setTimeout(resolve, 0));
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
        if (chain.length > 0) {
            const expanded = this.state.get().expanded;
            const needsExpand = chain.some((a) => !expanded[a]);
            if (needsExpand) {
                await new Promise<void>((resolve) => {
                    queueMicrotask(() => {
                        if (!this.isLive) {
                            resolve();
                            return;
                        }
                        this.state.update((s) => {
                            for (const a of chain) s.expanded[a] = true;
                        });
                        this.gridRef?.update({ all: true });
                        setTimeout(resolve, 0);
                    });
                });
            }
        }
        if (!this.isLive) return;
        const idx = this.indexByValue.value.get(value);
        if (idx != null) this.gridRef?.scrollToRow(idx, align ?? "nearest");
    };

    // --- lifecycle ---

    init() {
        // Force RenderGrid to re-render cells whenever any of the display inputs change.
        this.effect(
            () => {
                this.gridRef?.update({ all: true });
            },
            () => [
                this.rows.value,
                this.selectedKey.value,
                this.props.activeIndex,
                this.props.searchText,
                this.props.renderItem,
                this.props.rowHeight,
                this.props.indentSize,
                this.props.isSelected,
                this.props.getTooltip,
                this.props.getContextMenu,
                this.state.get().draggingValue,
                this.state.get().dragOverValue,
                this.state.get().loading,
            ],
        );

        // Keep the active row visible whenever activeIndex changes externally — covers
        // drivers (parent components, keyboard handler, etc.) that update activeIndex.
        //
        // Timing: on a fresh mount, this effect runs inside the init() useEffect — at that
        // point the RenderGrid's ResizeObserver has NOT yet fired its first callback, so
        // gridRef.size is { undefined, undefined } and `calcScrollOffsetY` would compute
        // with visibleHeight = 0. Defer to setTimeout(0) when not measured. Once measured,
        // subsequent scrolls run immediately so keyboard nav stays responsive. Same pattern
        // as ListBoxModel.
        this.effect(
            () => {
                const ai = this.props.activeIndex;
                if (ai == null || ai < 0) return;
                const grid = this.gridRef;
                if (!grid) return;
                const measured = !!(grid.size.width && grid.size.height);
                if (measured) {
                    grid.scrollToRow(ai);
                } else {
                    setTimeout(() => {
                        if (!this.isLive) return;
                        this.gridRef?.scrollToRow(ai);
                    }, 0);
                }
            },
            () => [this.props.activeIndex],
        );
    }

    dispose() {
        this.cancelHoverExpandTimer();
        this.dragEnterCounts.clear();
    }
}

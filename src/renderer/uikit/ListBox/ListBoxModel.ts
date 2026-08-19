import React from "react";
import { TComponentModel } from "../../core/state/model";
import { isTraited, resolveTraited, Traited, TraitType } from "../../core/traits/traits";
import { RenderGridModel } from "../RenderGrid";
import type { RowAlign } from "../RenderGrid";
import { ContextMenuEvent } from "../../core/events/context-menu";
import {
    IListBoxItem,
    LIST_ITEM_KEY,
    ListBoxProps,
} from "./types";

// =============================================================================
// State
// =============================================================================

export interface ListBoxState {
    revision: number;
}

export const defaultListBoxState: ListBoxState = { revision: 0 };

// =============================================================================
// Helpers
// =============================================================================

function runAccessor<R>(source: unknown, accessor: TraitType<R>): R {
    return Object.fromEntries(
        (Object.keys(accessor) as (keyof TraitType<R>)[]).map((k) => [k, accessor[k](source)]),
    ) as R;
}

// =============================================================================
// ViewModel
// =============================================================================

export class ListBoxModel<T = IListBoxItem> extends TComponentModel<
    ListBoxState,
    ListBoxProps<T>
> {
    // --- refs ---
    gridRef: RenderGridModel | null = null;
    setGridRef = (ref: RenderGridModel | null) => {
        this.gridRef = ref;
    };

    // --- ids ---
    private _reactId = "";
    setReactId = (reactId: string) => {
        this._reactId = reactId;
    };
    get rootId(): string {
        return this.props.id ?? `lb-${this._reactId}`;
    }
    itemId = (idx: number): string => {
        const { resolved } = this.resolved.value;
        return `${this.rootId}-item-${resolved[idx]?.value}`;
    };

    // --- memoized derivations ---

    /** Resolved IListBoxItem[] + parallel sources array of source `T`. */
    resolved = this.memo<{ resolved: IListBoxItem[]; sources: T[] }>(
        () => {
            const items = this.props.items;
            if (isTraited<unknown[]>(items)) {
                const r = resolveTraited<IListBoxItem>(items, LIST_ITEM_KEY);
                return { resolved: r, sources: items.target as T[] };
            }
            const arr = items as T[];
            return { resolved: arr as unknown as IListBoxItem[], sources: arr };
        },
        () => [this.props.items],
    );

    /** Selected key from `value` prop (only used when `isSelected` is not provided). */
    selectedKey = this.memo<string | number | null>(
        () => {
            const v = this.props.value;
            if (v == null) return null;
            return this.resolveSingleValue(v).value;
        },
        () => [this.props.value],
    );

    private resolveSingleValue(v: T | Traited<T>): IListBoxItem {
        if (isTraited<T>(v)) {
            const acc = v.traits.get(LIST_ITEM_KEY);
            if (acc) return runAccessor<IListBoxItem>(v.target, acc);
            return v.target as unknown as IListBoxItem;
        }
        return v as unknown as IListBoxItem;
    }

    // --- selection / interaction predicates ---

    isSelectedAt = (idx: number): boolean => {
        const { resolved, sources } = this.resolved.value;
        const item = resolved[idx];
        if (!item || item.section) return false;
        if (this.props.isSelected) return this.props.isSelected(sources[idx], idx);
        const key = this.selectedKey.value;
        if (key == null) return false;
        return item.value === key;
    };

    /**
     * Walk forward (`dir=1`) or backward (`dir=-1`) from `start` until a non-section,
     * non-disabled item is found. Returns -1 when no candidate exists in that direction.
     */
    findNextSelectable = (start: number, dir: 1 | -1): number => {
        const { resolved } = this.resolved.value;
        let i = start;
        while (i >= 0 && i < resolved.length) {
            const it = resolved[i];
            if (it && !it.section && !it.disabled) return i;
            i += dir;
        }
        return -1;
    };

    // --- handlers ---

    onItemClick = (idx: number) => {
        const { resolved, sources } = this.resolved.value;
        const item = resolved[idx];
        if (!item || item.disabled || item.section) return;
        this.props.onChange?.(sources[idx]);
    };

    onItemMouseEnter = (idx: number) => {
        const { resolved } = this.resolved.value;
        const item = resolved[idx];
        if (!item || item.disabled || item.section) return;
        if (idx !== this.props.activeIndex) this.props.onActiveChange?.(idx);
    };

    onItemContextMenu = (e: React.MouseEvent<HTMLDivElement>, idx: number) => {
        const { resolved, sources } = this.resolved.value;
        const item = resolved[idx];
        if (!item || item.section) return;
        const items = this.props.getContextMenu?.(sources[idx], idx);
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
        const { resolved } = this.resolved.value;
        const n = resolved.length;
        if (n === 0) return;
        const cur = this.props.activeIndex ?? -1;
        const apply = (target: number) => {
            if (target < 0) return;
            this.props.onActiveChange?.(target);
            this.gridRef?.scrollToRow(target);
        };
        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                apply(this.findNextSelectable(Math.min(n - 1, cur + 1), 1));
                break;
            case "ArrowUp":
                e.preventDefault();
                apply(this.findNextSelectable(Math.max(0, cur - 1), -1));
                break;
            case "Home":
                e.preventDefault();
                apply(this.findNextSelectable(0, 1));
                break;
            case "End":
                e.preventDefault();
                apply(this.findNextSelectable(n - 1, -1));
                break;
            case "PageDown": {
                e.preventDefault();
                const page = Math.max(1, this.gridRef?.visibleRowCount ?? 1);
                const start = (cur < 0 ? 0 : cur) + page;
                const target = this.findNextSelectable(Math.min(n - 1, start), 1);
                apply(target >= 0 ? target : this.findNextSelectable(n - 1, -1));
                break;
            }
            case "PageUp": {
                e.preventDefault();
                const page = Math.max(1, this.gridRef?.visibleRowCount ?? 1);
                const start = (cur < 0 ? 0 : cur) - page;
                const target = this.findNextSelectable(Math.max(0, start), -1);
                apply(target >= 0 ? target : this.findNextSelectable(0, 1));
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

    // --- imperative ref API ---

    scrollToIndex = (i: number, align?: RowAlign) => {
        this.gridRef?.scrollToRow(i, align);
    };

    // --- lifecycle ---

    init() {
        this.props.onModel?.(this);

        // Force RenderGrid to re-render cells whenever any of the display inputs change.
        // RenderGrid does not re-render its cells when its renderCell identity changes
        // unless told.
        this.effect(
            () => {
                this.gridRef?.update({ all: true });
            },
            () => [
                this.resolved.value.resolved,
                this.selectedKey.value,
                this.props.activeIndex,
                this.props.searchText,
                this.props.renderItem,
                this.props.rowHeight,
                this.props.isSelected,
                this.props.getTooltip,
                this.props.getContextMenu,
            ],
        );

        // Keep the active row visible whenever activeIndex changes — covers external
        // drivers (Select keyboard handler, etc.) that update activeIndex without
        // going through the keyboardNav path.
        //
        // Timing: on a fresh mount (e.g. Select popover just opened), this effect
        // runs inside the init() useEffect — at that point the RenderGrid's
        // ResizeObserver has NOT yet fired its first callback, so `gridRef.size`
        // is still { undefined, undefined } and `calcScrollOffsetY` would compute
        // with visibleHeight = 0 and produce a junk offset (the browser then clamps
        // it, leaving the row near the top of the viewport instead of in view).
        // When the grid hasn't measured yet, defer to setTimeout(0) so layout +
        // ResizeObserver run first — same workaround the legacy ComboSelect /
        // PopupMenu use. Once measured, subsequent scrolls run immediately so
        // keyboard nav stays responsive.
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

    onUnmount = () => {
        this.props.onModel?.(null);
    };
}

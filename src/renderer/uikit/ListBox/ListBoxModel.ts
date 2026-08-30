import { TComponentModel } from "../../core/state/model";
import { isTraited, resolveTraited, Traited, TraitType } from "../../core/traits/traits";
import { VirtualGridModel } from "../VirtualGrid";
import type { RowAlign } from "../VirtualGrid";
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
    /**
     * Unused. Kept only so the model has a state object to own.
     *
     * Do **not** wire it into `repaintSignature()`. A state change does not pump props in a vanilla
     * driver, so a state slot in the signature is dead code, and a revision counter is not an input
     * a cell reads (uikit/CLAUDE.md, Rule 9). If a repaint is missing, the honest fix is a slot for
     * the input that actually moved.
     */
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
    private liveItems: ListBoxProps<T>["items"] | undefined = undefined;
    private liveValue: ListBoxProps<T>["value"] = undefined;
    private liveIsSelected: ListBoxProps<T>["isSelected"] = undefined;
    private liveSelectionSignal: unknown;
    private liveActiveIndex: ListBoxProps<T>["activeIndex"] = undefined;
    private liveSearchText: ListBoxProps<T>["searchText"] = undefined;
    private liveLoading: ListBoxProps<T>["loading"] = undefined;

    setProps = (props: ListBoxProps<T>): void => {
        const itemsChanged = this.liveItems !== props.items;
        const valueChanged = this.liveValue !== props.value;
        this.liveItems = props.items;
        this.liveValue = props.value;
        this.liveIsSelected = props.isSelected;
        this.liveActiveIndex = props.activeIndex;
        this.liveSearchText = props.searchText;
        this.liveLoading = props.loading;
        if (itemsChanged) this.resolved = this.resolveItems(props.items);
        if (valueChanged) this.selectedKey = this.resolveSelectedKey(props.value);
    };

    setItems = (items: ListBoxProps<T>["items"]): void => {
        if (this.liveItems === items) return;
        this.liveItems = items;
        this.resolved = this.resolveItems(items);
    };

    setSelection = (
        isSelected: ListBoxProps<T>["isSelected"],
        selectionSignal?: unknown,
    ): void => {
        this.liveIsSelected = isSelected;
        this.liveSelectionSignal = selectionSignal;
    };

    setActiveIndex = (activeIndex: ListBoxProps<T>["activeIndex"]): void => {
        this.liveActiveIndex = activeIndex;
    };

    setSearchText = (searchText: ListBoxProps<T>["searchText"]): void => {
        this.liveSearchText = searchText;
    };

    setValue = (value: ListBoxProps<T>["value"]): void => {
        if (this.liveValue === value) return;
        this.liveValue = value;
        this.selectedKey = this.resolveSelectedKey(value);
    };

    setLoading = (loading: ListBoxProps<T>["loading"]): void => {
        this.liveLoading = loading;
    };

    get loading(): ListBoxProps<T>["loading"] {
        return this.liveLoading;
    }

    get activeIndex(): ListBoxProps<T>["activeIndex"] {
        return this.liveActiveIndex;
    }

    get searchText(): ListBoxProps<T>["searchText"] {
        return this.liveSearchText;
    }

    // --- refs ---
    gridRef: VirtualGridModel | null = null;
    setGridRef = (ref: VirtualGridModel | null) => {
        this.gridRef = ref;
    };

    // --- ids ---
    private _elementId = "";
    /** Fed by the view from `nextElementId("lb")` — replaces the former generated-ID source (EPIC-056 C3-5). */
    setElementId = (elementId: string) => {
        this._elementId = elementId;
    };
    get rootId(): string {
        return this.props.id ?? this._elementId;
    }
    itemId = (idx: number): string => {
        const { resolved } = this.resolved;
        return `${this.rootId}-item-${resolved[idx]?.value}`;
    };

    // --- derived fields ---

    /** Resolved IListBoxItem[] + parallel sources array of source `T`. */
    resolved: { resolved: IListBoxItem[]; sources: T[] } = { resolved: [], sources: [] };

    /** Selected key from `value` prop (only used when `isSelected` is not provided). */
    selectedKey: string | number | null = null;

    private resolveItems(items: ListBoxProps<T>["items"]): { resolved: IListBoxItem[]; sources: T[] } {
        if (isTraited<unknown[]>(items)) {
            const resolved = resolveTraited<IListBoxItem>(items, LIST_ITEM_KEY);
            return { resolved, sources: items.target as T[] };
        }
        const sources = items as T[];
        return { resolved: sources as unknown as IListBoxItem[], sources };
    }

    private resolveSelectedKey(value: ListBoxProps<T>["value"]): string | number | null {
        return value == null ? null : this.resolveSingleValue(value).value;
    }

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
        const { resolved, sources } = this.resolved;
        const item = resolved[idx];
        if (!item || item.section) return false;
        if (this.liveIsSelected) return this.liveIsSelected(sources[idx], idx);
        const key = this.selectedKey;
        if (key == null) return false;
        return item.value === key;
    };

    /**
     * Walk forward (`dir=1`) or backward (`dir=-1`) from `start` until a non-section,
     * non-disabled item is found. Returns -1 when no candidate exists in that direction.
     */
    findNextSelectable = (start: number, dir: 1 | -1): number => {
        const { resolved } = this.resolved;
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
        const { resolved, sources } = this.resolved;
        const item = resolved[idx];
        if (!item || item.disabled || item.section) return;
        this.props.onChange?.(sources[idx]);
    };

    onItemMouseEnter = (idx: number) => {
        const { resolved } = this.resolved;
        const item = resolved[idx];
        if (!item || item.disabled || item.section) return;
        if (idx !== this.liveActiveIndex) this.props.onActiveChange?.(idx);
    };

    onItemContextMenu = (e: MouseEvent, idx: number) => {
        const { resolved, sources } = this.resolved;
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
    onRootContextMenu = (e: MouseEvent) => {
        if (e.contextMenuEvent?.items.length) return;
        this.props.onContextMenu?.(e);
    };

    onKeyDown = (e: KeyboardEvent) => {
        if (!this.props.keyboardNav) return;
        const { resolved } = this.resolved;
        const n = resolved.length;
        if (n === 0) return;
        const cur = this.liveActiveIndex ?? -1;
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

    // --- repaint signature ---

    /**
     * Everything a rendered cell reads that the virtualization engine cannot detect for itself.
     *
     * The host view compares this array on every prop pump (see `uikit/shared/deps-gate.ts`) and
     * repaints only when a slot moved. This keeps the grid's full repaint at the explicit view
     * boundary where its DOM is available.
     *
     * Three rules the list encodes, in case a future input is added:
     *
     * - **Fixed length.** A conditionally-pushed slot makes the comparison always report a change.
     * - **`liveItems`, not the resolved array.** The resolved field is a pass-through projection of
     *   `props.items`, so its output identity changes exactly when `props.items` does — the two are
     *   the live input identity is the correct signature slot.
     *   `selectedKey` is the opposite case: its output is a normalised primitive key, so comparing
     *   the *output* is strictly better than comparing `props.value` (a new object resolving to the
     *   same key collapses to no-change).
     * - **Only inputs that change cell DOM.** `rowHeight` is deliberately absent because
     *   `VirtualGridModel.inputChanged()` already compares it and repaints on its own;
     *   `getContextMenu` is absent because it is read live inside the context-menu handler and
     *   affects nothing rendered — keeping it would repaint the whole window on every update for
     *   callers that pass an inline arrow. `variant` and `selectionStyle` are present even though
     *   the earlier repaint path omitted them: the old `renderCell` was a fresh closure per render,
     *   which made the engine repaint unconditionally and hid their absence. `checkbox` is present
     *   for the same reason as those two — it adds and removes a child of every row.
     *
     * One consequence worth stating, because it is invisible from here: a caller-owned selection
     * reaches this signature **only** through `props.isSelected`'s identity. `MultiListBox` passes a
     * membership predicate and never passes `value`, so if that predicate were a stable bound method
     * no slot would move when the user checked a row, and the box would not redraw until an
     * unrelated input changed. MultiListBox therefore carries its changing `selectedKeys` Set as a
     * separate signature signal while keeping `isSelected` stable.
     */
    repaintSignature(): readonly unknown[] {
        return [
            this.liveItems,
            this.selectedKey,
            this.liveSelectionSignal,
            this.liveActiveIndex,
            this.liveSearchText,
            this.props.renderItem,
            this.liveIsSelected,
            this.props.getTooltip,
            this.props.variant,
            this.props.selectionStyle,
            this.props.checkbox,
        ];
    }

    // --- lifecycle ---

    /**
     * The two former prop reactions became the host view's responsibility: the display-input
     * repaint is `repaintSignature()` plus the view's gate, and the scroll-into-view on
     * `activeIndex` is one unconditional `scrollToRow` from the view's update path — the engine now
     * queues that request itself when it has no usable size yet, which is what the old
     * `setTimeout(0)` was approximating. See EPIC-056 C3-6 rows 1 and 2.
     */
}

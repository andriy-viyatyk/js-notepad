import React from "react";
import { TComponentModel } from "../../core/state/model";
import { isTraited, resolveTraited, Traited, TraitType } from "../../core/traits/traits";
import { IListBoxItem, LIST_ITEM_KEY } from "../ListBox";
import type { InputProps } from "../Input";
import type { SlotText } from "../shared/slots";

// =============================================================================
// Public types
// =============================================================================

type ItemsLike<T> = T[] | Traited<T[]>;

export type ItemsSource<T> =
    | ItemsLike<T>
    | Promise<ItemsLike<T>>
    | (() => ItemsLike<T> | Promise<ItemsLike<T>>);

export interface SelectItemsResult<T> {
    /** Trait-resolved IListBoxItem array. `[]` while loading or before first open of an async source. */
    items: IListBoxItem[];
    /** Parallel array of source `T` values — same length / index as `items`. */
    sources: T[];
    /** True while a Promise is in flight. */
    loading: boolean;
    /** Last load error (if any). Cleared on next load attempt. */
    error: unknown;
}

export interface SelectProps<T = IListBoxItem>
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className" | "onChange"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /**
     * Item source — accepts:
     *   • `T[]` / `Traited<T[]>` — sync, ready immediately.
     *   • `Promise<...>` — eager async; Select awaits on mount.
     *   • `() => T[] | Promise<...>` — lazy; called once on first open.
     * Result is cached after first resolution. Changing the `items` reference invalidates the cache.
     */
    items: ItemsSource<T>;
    /**
     * Currently-selected item. `null` when nothing is selected.
     * Independent of `items` — Select renders the trigger label without waiting on items to load.
     *   • Plain `T` — used when `T = IListBoxItem` (item carries `.label` directly).
     *   • `Traited<T>` — used with custom `T`; Select reads the trait accessor from `value.traits`.
     */
    value?: T | Traited<T> | null;
    /** Fires when the user picks an item from the list. Emits the source `T`. */
    onChange?: (item: T) => void;
    /** Optional callback invoked when an async items loader rejects. */
    onItemsLoadError?: (error: unknown) => void;
    /** Placeholder shown when no item is selected. */
    placeholder?: string;
    /** Disabled state — input cannot be focused, popover cannot open. */
    disabled?: boolean;
    /** Read-only state — popover does not open, input is not editable, no chevron interaction. */
    readOnly?: boolean;
    /** Control size. Default: "md". */
    size?: "sm" | "md";
    /** Filter mode for typeahead. Default: "contains". */
    filterMode?: "contains" | "startsWith" | "off";
    /** Custom filter — overrides `filterMode` when set. */
    filter?: (item: IListBoxItem, query: string) => boolean;
    /** Renders inside the popover when filtered list is empty. Default: "no results". */
    emptyMessage?: SlotText;
    /**
     * Fires when the user presses Escape while the popover is open. Select also
     * closes the popover (without firing `onChange`) — the callback exists for
     * cancel-style flows where the caller needs to react to the cancel beyond
     * the implicit close (e.g. inline cell edit needs to also abandon the
     * pending text and exit edit mode).
     */
    onEscape?: () => void;
    /** Maximum number of visible rows in the popover before scrolling. Default: 10. */
    maxVisibleItems?: number;
    /** Pixel height of each row. Forwarded to the inner ListBox. Default: 24. */
    rowHeight?: number;
    /**
     * When true, the dropdown gains a resize handle at the bottom-right corner.
     * Forwarded to the inner Popover. Useful when long item labels exceed the
     * input width and `matchAnchorWidth` truncates the list.
     */
    resizable?: boolean;
    /** Fixed width — number → px, string passes through. Default: fills parent (100%). Forwarded to inner Input. */
    width?: number | string;
    /** Minimum width — number → px, string passes through. Forwarded to inner Input. */
    minWidth?: number | string;
    /** Maximum width — number → px, string passes through. Forwarded to inner Input. */
    maxWidth?: number | string;
    "aria-label"?: string;
    "aria-labelledby"?: string;
}

// =============================================================================
// Helpers
// =============================================================================

function runAccessor<R>(source: unknown, accessor: TraitType<R>): R {
    return Object.fromEntries(
        (Object.keys(accessor) as (keyof TraitType<R>)[]).map((k) => [k, accessor[k](source)]),
    ) as R;
}

function defaultMatch(item: IListBoxItem, q: string, mode: "contains" | "startsWith" | "off"): boolean {
    if (mode === "off" || q === "") return true;
    const label = typeof item.label === "string" ? item.label.toLowerCase() : "";
    const query = q.toLowerCase();
    return mode === "startsWith" ? label.startsWith(query) : label.includes(query);
}

interface ResolvedItems {
    items: IListBoxItem[];
    sources: unknown[];
}

function toResolvedItems(input: ItemsLike<unknown>): ResolvedItems {
    if (isTraited<unknown[]>(input)) {
        return {
            items: resolveTraited<IListBoxItem>(input, LIST_ITEM_KEY),
            sources: input.target as unknown[],
        };
    }
    const arr = input as unknown[];
    return {
        items: arr as unknown as IListBoxItem[],
        sources: arr,
    };
}

function isThenable(v: unknown): v is Promise<unknown> {
    return v != null && typeof (v as { then?: unknown }).then === "function";
}

// =============================================================================
// State
// =============================================================================

export interface SelectState {
    open: boolean;
    searchText: string;
    activeIndex: number | null;
    popoverResized: boolean;
    // Inlined from the former useSelectItems hook:
    loadedItems: IListBoxItem[];
    loadedSources: unknown[];
    itemsLoading: boolean;
    itemsLoaded: boolean;
    itemsError: unknown;
}

export const defaultSelectState: SelectState = {
    open: false,
    searchText: "",
    activeIndex: null,
    popoverResized: false,
    loadedItems: [],
    loadedSources: [],
    itemsLoading: false,
    itemsLoaded: false,
    itemsError: null,
};

// =============================================================================
// Model
// =============================================================================

const defaultRowHeight = 24;
const defaultMaxVisibleItems = 10;

export class SelectModel<T = IListBoxItem> extends TComponentModel<SelectState, SelectProps<T>> {
    // --- refs (DOM) ---
    inputRef: HTMLInputElement | null = null;
    rootRef: HTMLDivElement | null = null;

    setInputRef = (el: HTMLInputElement | null) => {
        this.inputRef = el;
    };
    setRootRef = (el: HTMLDivElement | null) => {
        this.rootRef = el;
    };

    // --- ids ---
    private _reactId = "";
    setReactId = (reactId: string) => {
        this._reactId = reactId;
    };
    get selectId(): string {
        return `select-${this._reactId}`;
    }
    get listboxId(): string {
        return `${this.selectId}-listbox`;
    }

    // --- in-flight load token (not state — invalidates async work without re-rendering) ---
    private _loadId = 0;

    /**
     * One-shot flag set by `commitSelection` so the focus call we issue right after
     * closing doesn't bounce back through `onInputFocus` → `tryOpen` → re-open.
     * In the original `useCallback`-based code, `tryOpen` saw a stale `open=true`
     * via closure and short-circuited; the model's `state.get()` reads live state,
     * so we need an explicit guard.
     */
    private _suppressFocusOpen = false;

    // --- derived ---

    /** Resolve a single value to IListBoxItem. Plain T is cast (assumes T = IListBoxItem);
     *  Traited<T> uses the accessor it carries. */
    private resolveSingleValue(v: T | Traited<T>): IListBoxItem {
        if (isTraited<T>(v)) {
            const acc = v.traits.get(LIST_ITEM_KEY);
            if (acc) return runAccessor<IListBoxItem>(v.target, acc);
            return v.target as unknown as IListBoxItem;
        }
        return v as unknown as IListBoxItem;
    }

    selectedResolved = this.memo<IListBoxItem | null>(
        () => {
            const v = this.props.value;
            return v != null ? this.resolveSingleValue(v) : null;
        },
        () => [this.props.value],
    );

    /** Filter loaded items by the active search text. Build parallel filteredItems +
     *  filteredSources arrays so onListChange can map IListBoxItem → source T. */
    filtered = this.memo<{ filteredItems: IListBoxItem[]; filteredSources: T[] }>(
        () => {
            const { loadedItems, loadedSources, open, searchText } = this.state.get();
            const filterMode = this.props.filterMode ?? "contains";
            const customFilter = this.props.filter;
            const matchFn =
                customFilter ?? ((it: IListBoxItem) => defaultMatch(it, searchText, filterMode));
            const items: IListBoxItem[] = [];
            const sources: T[] = [];
            const skipFilter = !open || filterMode === "off";
            for (let i = 0; i < loadedItems.length; i++) {
                const it = loadedItems[i];
                if (skipFilter || matchFn(it, searchText)) {
                    items.push(it);
                    sources.push(loadedSources[i] as T);
                }
            }
            return { filteredItems: items, filteredSources: sources };
        },
        () => {
            const s = this.state.get();
            return [
                s.loadedItems,
                s.loadedSources,
                s.open,
                s.searchText,
                this.props.filterMode,
                this.props.filter,
            ];
        },
    );

    /** Trigger label when closed; live query when open. */
    displayText = this.memo<string>(
        () => {
            const { open, searchText } = this.state.get();
            if (open) return searchText;
            const sel = this.selectedResolved.value;
            if (sel == null) return "";
            return typeof sel.label === "string" ? sel.label : "";
        },
        () => [this.state.get().open, this.state.get().searchText, this.selectedResolved.value],
    );

    // --- handlers ---

    private tryOpen = () => {
        if (this.props.disabled || this.props.readOnly) return;
        if (!this.state.get().open) {
            this.state.update((s) => {
                s.open = true;
            });
        }
    };

    onInputChange: InputProps["onChange"] = (val: string) => {
        if (this.props.disabled || this.props.readOnly) return;
        this.state.update((s) => {
            if (!s.open) s.open = true;
            s.searchText = val;
        });
    };

    onInputFocus = () => {
        if (this._suppressFocusOpen) {
            this._suppressFocusOpen = false;
            return;
        }
        this.tryOpen();
    };

    onInputClick = () => {
        this.tryOpen();
    };

    onChevronMouseDown = (e: React.MouseEvent) => {
        // Prevent the input from losing focus when the chevron is pressed.
        e.preventDefault();
    };

    onChevronClick = () => {
        if (this.props.disabled || this.props.readOnly) return;
        this.state.update((s) => {
            s.open = !s.open;
        });
        // Keep focus on the input regardless of open/close direction.
        this.inputRef?.focus();
    };

    onPopoverClose = () => {
        this.state.update((s) => {
            s.open = false;
        });
    };

    onPopoverResize = () => {
        this.state.update((s) => {
            s.popoverResized = true;
        });
    };

    onActiveIndexChange = (i: number) => {
        this.state.update((s) => {
            s.activeIndex = i;
        });
    };

    private commitSelection = (idx: number) => {
        const { filteredSources } = this.filtered.value;
        const source = filteredSources[idx];
        if (source === undefined) return;
        this.props.onChange?.(source);
        this._suppressFocusOpen = true;
        this.state.update((s) => {
            s.open = false;
            s.searchText = "";
        });
        this.inputRef?.focus();
        // Clear the suppression flag after the focus event has had a chance to fire
        // (microtask runs after current sync work, including any synchronous focus event).
        queueMicrotask(() => {
            this._suppressFocusOpen = false;
        });
    };

    onListChange = (item: IListBoxItem) => {
        const { filteredItems } = this.filtered.value;
        const idx = filteredItems.indexOf(item);
        if (idx < 0) return;
        this.commitSelection(idx);
    };

    onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const { disabled, readOnly } = this.props;
        if (disabled) return;
        const { open, activeIndex } = this.state.get();
        const { filteredItems } = this.filtered.value;
        switch (e.key) {
            case "ArrowDown":
            case "PageDown": {
                if (readOnly) return;
                e.preventDefault();
                if (!open) {
                    this.state.update((s) => {
                        s.open = true;
                    });
                    return;
                }
                const step = e.key === "PageDown" ? 9 : 1;
                const cur = activeIndex ?? -1;
                const next = Math.min(filteredItems.length - 1, cur + step);
                if (next >= 0) {
                    this.state.update((s) => {
                        s.activeIndex = next;
                    });
                }
                break;
            }
            case "ArrowUp":
            case "PageUp": {
                if (readOnly) return;
                e.preventDefault();
                if (!open) {
                    this.state.update((s) => {
                        s.open = true;
                    });
                    return;
                }
                const step = e.key === "PageUp" ? 9 : 1;
                const cur = activeIndex ?? 0;
                const next = Math.max(0, cur - step);
                this.state.update((s) => {
                    s.activeIndex = next;
                });
                break;
            }
            case "Home":
                if (open && filteredItems.length > 0) {
                    e.preventDefault();
                    this.state.update((s) => {
                        s.activeIndex = 0;
                    });
                }
                break;
            case "End":
                if (open && filteredItems.length > 0) {
                    e.preventDefault();
                    this.state.update((s) => {
                        s.activeIndex = filteredItems.length - 1;
                    });
                }
                break;
            case "Enter":
                if (open && activeIndex != null && activeIndex >= 0 && activeIndex < filteredItems.length) {
                    e.preventDefault();
                    this.commitSelection(activeIndex);
                } else if (!open && !readOnly) {
                    e.preventDefault();
                    this.state.update((s) => {
                        s.open = true;
                    });
                }
                break;
            case "Escape":
                if (open) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.state.update((s) => {
                        s.open = false;
                    });
                    this.props.onEscape?.();
                }
                break;
        }
    };

    // --- items loading (formerly useSelectItems) ---

    private startLoad() {
        const source = this.props.items;
        // Sync forms — set immediately, no async at all.
        if (Array.isArray(source) || isTraited<unknown[]>(source)) {
            const r = toResolvedItems(source as ItemsLike<unknown>);
            this.state.update((s) => {
                s.loadedItems = r.items;
                s.loadedSources = r.sources;
                s.itemsLoaded = true;
                s.itemsLoading = false;
                s.itemsError = null;
            });
            return;
        }
        // Async forms — start a Promise and tag it with a load id so a stale resolution
        // can detect it has been superseded.
        this._loadId += 1;
        const myLoadId = this._loadId;
        this.state.update((s) => {
            s.itemsLoading = true;
            s.itemsError = null;
        });
        const invoked: ItemsLike<unknown> | Promise<ItemsLike<unknown>> =
            typeof source === "function"
                ? (source as () => ItemsLike<unknown> | Promise<ItemsLike<unknown>>)()
                : (source as Promise<ItemsLike<unknown>>);

        if (isThenable(invoked)) {
            (invoked as Promise<ItemsLike<unknown>>)
                .then((res) => {
                    if (!this.isLive || myLoadId !== this._loadId) return;
                    const r = toResolvedItems(res);
                    this.state.update((s) => {
                        s.loadedItems = r.items;
                        s.loadedSources = r.sources;
                        s.itemsLoaded = true;
                        s.itemsLoading = false;
                    });
                })
                .catch((e) => {
                    if (!this.isLive || myLoadId !== this._loadId) return;
                    this.state.update((s) => {
                        s.itemsError = e;
                        s.itemsLoading = false;
                    });
                    this.props.onItemsLoadError?.(e);
                });
        } else {
            const r = toResolvedItems(invoked as ItemsLike<unknown>);
            this.state.update((s) => {
                s.loadedItems = r.items;
                s.loadedSources = r.sources;
                s.itemsLoaded = true;
                s.itemsLoading = false;
            });
        }
    }

    // --- forwarded API for the View — convenience getters used in JSX ---
    get rowHeight(): number {
        return this.props.rowHeight ?? defaultRowHeight;
    }
    get maxVisibleItems(): number {
        return this.props.maxVisibleItems ?? defaultMaxVisibleItems;
    }

    // --- lifecycle ---

    init() {
        // Reset items cache when source ref changes (mirrors the original
        // `useEffect(() => { setLoaded(false); ... }, [source])` semantics).
        this.effect(
            () => {
                this._loadId += 1; // invalidate any in-flight Promise from the prior source
                this.state.update((s) => {
                    s.loadedItems = [];
                    s.loadedSources = [];
                    s.itemsLoaded = false;
                    s.itemsError = null;
                });
            },
            () => [this.props.items],
        );

        // Load items: sync sources resolve immediately; async sources defer until
        // the first open=true. Result is cached via state.itemsLoaded.
        this.effect(
            () => {
                const source = this.props.items;
                const isSync = Array.isArray(source) || isTraited<unknown[]>(source);
                if (isSync) {
                    if (!this.state.get().itemsLoaded) this.startLoad();
                    return;
                }
                if (this.state.get().itemsLoaded) return;
                if (!this.state.get().open) return;
                this.startLoad();
            },
            () => [this.props.items, this.state.get().open, this.state.get().itemsLoaded],
        );

        // Reset search/active/manual-resize flag when popover closes. Deferred
        // past the current render via queueMicrotask — calling state.update
        // synchronously inside an effect that runs during setPropsInternal's
        // render-phase _evaluateEffects triggers React's "Cannot update a
        // component while rendering a different component" warning. Re-check
        // `open` inside the microtask in case it flipped back to true.
        this.effect(
            () => {
                if (this.state.get().open) return;
                queueMicrotask(() => {
                    if (!this.isLive) return;
                    if (this.state.get().open) return;
                    this.state.update((s) => {
                        s.searchText = "";
                        s.activeIndex = null;
                        s.popoverResized = false;
                    });
                });
            },
            () => [this.state.get().open],
        );

        // When the popover opens with a selected value, initialize activeIndex to
        // that item's row so the ListBox highlights it AND scrolls to it (the
        // ListBoxModel has its own scroll-on-activeIndex effect). For async sources
        // this re-attempts after itemsLoaded flips to true. Once activeIndex is set
        // (here or by keyboard / hover), the early-return guard makes this a no-op.
        this.effect(
            () => {
                const s = this.state.get();
                if (!s.open) return;
                if (s.activeIndex != null) return;
                if (!s.itemsLoaded) return;
                if (s.loadedItems.length === 0) return;
                const sel = this.selectedResolved.value;
                if (!sel) return;
                const idx = s.loadedItems.findIndex((it) => it.value === sel.value);
                if (idx < 0) return;
                // Defer the state update past this render — model effects with
                // deps run inside `setPropsInternal` during the render phase, and
                // calling state.update synchronously here triggers React's
                // "Cannot update a component while rendering a different
                // component" warning (same fiber updating itself mid-render).
                // Re-check the guards inside the microtask in case the user
                // dismissed the popover before it ran.
                queueMicrotask(() => {
                    if (!this.isLive) return;
                    const cur = this.state.get();
                    if (!cur.open || cur.activeIndex != null) return;
                    this.state.update((st) => {
                        st.activeIndex = idx;
                    });
                });
            },
            () => [this.state.get().open, this.state.get().itemsLoaded],
        );
    }

    dispose() {
        // Invalidate any in-flight Promise so its resolution is dropped.
        this._loadId += 1;
    }
}

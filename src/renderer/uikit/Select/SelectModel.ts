import type { NativeHTMLAttributes } from "../shared/dom-props";
import { TComponentModel } from "../../core/state/model";
import { isTraited, resolveTraited, Traited, TraitType } from "../../core/traits/traits";
import { IListBoxItem, LIST_ITEM_KEY } from "../ListBox/types";
import type { InputProps } from "../Input/InputView";
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
    extends Omit<NativeHTMLAttributes<HTMLDivElement>, "style" | "className" | "onChange"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /**
     * Item source — accepts:
     *   • `T[]` / `Traited<T[]>` — sync, ready immediately.
     *   • `Promise<...>` — async; awaited on the first open, not on mount.
     *   • `() => T[] | Promise<...>` — lazy; invoked on the first open.
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
    /** Fixed width — number → px, string passes through. Default: fills parent (100%). Written to
     *  the Select root's inline style; the inner Input then fills it. */
    width?: number | string;
    /** Minimum width — number → px, string passes through. Written to the Select root. */
    minWidth?: number | string;
    /** Maximum width — number → px, string passes through. Written to the Select root. */
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

/** Sync forms resolve immediately; every other form is deferred to the first open. */
function isSyncSource(source: unknown): boolean {
    return Array.isArray(source) || isTraited<unknown[]>(source);
}

/**
 * Sentinel for "no `items` reference has been applied yet", so the first prop pump counts as a
 * change. `undefined` cannot serve: it is a legal (if useless) `items` value, and the first prop
 * pump always runs once.
 */
const NO_SOURCE = Symbol("select-no-items-source");

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
    /**
     * Last load error. Written and cleared, but **rendered nowhere** — the only consumer of a
     * rejection is `props.onItemsLoadError`, invoked at the rejection site. It is therefore
     * deliberately absent from `SelectView`'s `bind` selector.
     *
     * Adding an error arm to the dropdown requires adding the slot at the same time. An arm rendered
     * from an unsubscribed field is the masked defect of doc/de-react.md §6.1 in its purest form: it
     * would appear only after some unrelated state moved, and read as a rendering glitch.
     */
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
    /**
     * Replaces React's `useId` (EPIC-056 C3-5). The value is opaque and generated either way; the
     * *relationship* it encodes is the contract — `data-id` on the root is interpolated into the
     * popover's `outsideClickIgnoreSelector`, and `listboxId` is the `Input`'s `aria-controls` and
     * the list's `id`, which `aria-activedescendant` is derived from.
     */
    private _elementId = "";
    setElementId = (elementId: string) => {
        this._elementId = elementId;
    };
    get selectId(): string {
        return this._elementId;
    }
    get listboxId(): string {
        return `${this.selectId}-listbox`;
    }

    // --- in-flight load token (not state — invalidates async work without re-rendering) ---
    private _loadId = 0;

    /**
     * The `items` reference the load cache currently reflects. Owned by the loader rather than
     * derived from a previous-props snapshot, which cannot tell "never pumped" from "pumped
     * undefined". See `setProps`.
     */
    private appliedItemsSource: unknown = NO_SOURCE;

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

    /**
     * Trigger label when closed; live query when open.
     *
     * **Invariant: while `open`, this returns `searchText` verbatim.** It is the `Input`'s `value`,
     * and `InputView.applyProps` writes `field.value` only when the pushed string differs from the
     * DOM. Because the echo happens synchronously inside the `input` event dispatch, an unmodified
     * query means no write at all — no caret move, no collapsed selection. The moment anything
     * normalises the query here (`trim()`, case folding, a length cap) that guard starts failing and
     * the caret jumps to the end whenever the user edits mid-string. If a transform ever becomes
     * necessary, the selection has to be preserved in `InputView`, not worked around here.
     */
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

    // --- open/close transitions ---

    /*
     * `open` has nine writers, and three of the four effects this model used to register were
     * consequences of it moving. They are now inline, and the two funnels below are the only places
     * that write it: `grep "s.open = "` inside this folder must return exactly these two hits.
     *
     * The mutators take an immer *draft* and never call `state.update` themselves, so a caller that
     * must produce ONE write can compose them. That matters: two writes push the child tree twice,
     * and the first push would tear the popover down while `activeIndex` and `popoverResized` were
     * still stale — the exact split the deleted `queueMicrotask` created, and the reason its guards
     * had to be re-checked inside it.
     */

    private openInto(s: SelectState, seedIndex: number): void {
        s.open = true;
        if (s.activeIndex == null && seedIndex >= 0) s.activeIndex = seedIndex;
    }

    /** Formerly the effect at `:556`. A close is the only thing that resets the query. */
    private closeInto(s: SelectState): void {
        s.open = false;
        s.searchText = "";
        s.activeIndex = null;
        s.popoverResized = false;
    }

    private openPopover = () => {
        if (this.props.disabled || this.props.readOnly) return;
        // Also the focus-bounce guard: `open` is assigned to `currentState` before listeners run,
        // so a nested `onInputFocus` -> `openPopover` from a synchronous focus event writes nothing
        // and, critically, does not re-run the load or the seed.
        if (this.state.get().open) return;
        const current = this.state.get();
        const seedIndex = this.seedIndex(current.loadedItems, current.searchText);
        this.state.update((s) => this.openInto(s, seedIndex));
        this.startLoadIfNeeded();
    };

    private closePopover = () => {
        // Makes a double close a no-op rather than a second full dispatch — Escape racing the
        // popover's own document keydown handler, or an outside click racing a chevron click.
        if (!this.state.get().open) return;
        this.state.update((s) => this.closeInto(s));
    };

    /**
     * Index of the selected item in the list the `ListBox` will actually receive, or -1.
     *
     * The effect this replaces searched `loadedItems`, but `activeIndex` is in **filtered** index
     * space everywhere else (`commitSelection` reads `filteredSources[idx]`; the keyboard arms bound
     * on `filteredItems.length`). The two spaces coincide only while the query is empty, and they
     * diverge on a reachable path: with a value selected and the popover closed, typing one
     * character opens and filters in the same write, so the old seed indexed the unfiltered array
     * and highlighted the wrong row. Walking the filtered order makes the result a valid index by
     * construction.
     *
     * Both the item array and the search text are **parameters**, not reads of `this.state`: the
     * load path calls this with the items it is about to commit, which are not in state yet, and the
     * keystroke path calls it with the query it is about to commit. Reading either from state gives
     * the pre-write value — silently -1 on the load path, where the whole point is to seed the
     * highlight for rows that have just arrived.
     */
    private seedIndex(items: IListBoxItem[], searchText: string): number {
        if (items.length === 0) return -1;
        const sel = this.selectedResolved.value;
        if (!sel) return -1;
        const filterMode = this.props.filterMode ?? "contains";
        const customFilter = this.props.filter;
        const matchFn =
            customFilter ?? ((it: IListBoxItem) => defaultMatch(it, searchText, filterMode));
        // `open` is true at every call site, so `filtered`'s `!open` arm cannot apply here.
        const skipFilter = filterMode === "off";
        let visible = 0;
        for (const it of items) {
            if (!skipFilter && !matchFn(it, searchText)) continue;
            if (it.value === sel.value) return visible;
            visible++;
        }
        return -1;
    }

    // --- handlers ---

    onInputChange: InputProps["onChange"] = (val: string) => {
        if (this.props.disabled || this.props.readOnly) return;
        const wasOpen = this.state.get().open;
        // The seed belongs to the open *transition* only. While already open, `activeIndex` keeps
        // whatever keyboard nav or hover put there — which is what the effect's deps did too.
        const seedIndex = wasOpen ? -1 : this.seedIndex(this.state.get().loadedItems, val);
        this.state.update((s) => {
            if (!s.open) this.openInto(s, seedIndex);
            s.searchText = val;
        });
        if (!wasOpen) this.startLoadIfNeeded();
    };

    onInputFocus = () => {
        if (this._suppressFocusOpen) {
            this._suppressFocusOpen = false;
            return;
        }
        this.openPopover();
    };

    onInputClick = () => {
        this.openPopover();
    };

    onChevronMouseDown = (e: MouseEvent) => {
        // Prevent the input from losing focus when the chevron is pressed.
        e.preventDefault();
    };

    onChevronClick = () => {
        if (this.props.disabled || this.props.readOnly) return;
        if (this.state.get().open) this.closePopover();
        else this.openPopover();
        // Keep focus on the input regardless of open/close direction.
        this.inputRef?.focus();
    };

    onPopoverClose = () => {
        this.closePopover();
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
        // Set before the write, and now load-bearing for a second reason: the popover subtree is
        // detached *inside* `closePopover`'s synchronous dispatch, where React detached it after the
        // handler returned. If focus was inside the popover it is on `<body>` by the time `focus()`
        // runs, so `focus()` becomes a real focus change and `onInputFocus` fires synchronously.
        this._suppressFocusOpen = true;
        // `closeInto` is a superset of the write this used to make (`open = false`,
        // `searchText = ""`), so the merge with the ex-effect's reset is exact.
        this.closePopover();
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

    onInputKeyDown = (e: KeyboardEvent) => {
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
                    this.openPopover();
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
                    this.openPopover();
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
                    this.openPopover();
                }
                break;
            case "Escape":
                if (open) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.closePopover();
                    this.props.onEscape?.();
                }
                break;
        }
    };

    // --- items loading (formerly useSelectItems) ---

    private startLoad() {
        const source = this.props.items;
        // Sync forms — set immediately, no async at all.
        if (isSyncSource(source)) {
            const r = toResolvedItems(source as ItemsLike<unknown>);
            this.commitLoaded(r);
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
                    this.commitLoaded(toResolvedItems(res));
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
            this.commitLoaded(toResolvedItems(invoked as ItemsLike<unknown>));
        }
    }

    /**
     * The only place `itemsLoaded` becomes true, and therefore the second of the two triggers the
     * `activeIndex` seed used to get from its effect's `[open, itemsLoaded]` deps. It is how an
     * async source gets its highlight once the rows arrive.
     *
     * The seed is deliberately in the **same** `state.update` as the row set. One write means
     * `ListBoxView` sees a moved `repaintSignature()` and a moved `activeIndex` in one push, so it
     * chooses `scrollToRowAfterPaint` — the correct entry point when the row set just changed
     * (uikit/CLAUDE.md Rule 9). Split into two writes, the second push reports no content change and
     * picks `scrollToRow`, which silently scrolls short once the grid is already measured.
     *
     * The guards are read from the draft: a promise settles at an arbitrary later time, so the
     * popover may have closed, reopened, or the highlight may already have been moved.
     */
    private commitLoaded(r: ResolvedItems): void {
        const seedIndex = this.state.get().open
            ? this.seedIndex(r.items, this.state.get().searchText)
            : -1;
        this.state.update((s) => {
            s.loadedItems = r.items;
            s.loadedSources = r.sources;
            s.itemsLoaded = true;
            s.itemsLoading = false;
            s.itemsError = null;
            if (s.open && s.activeIndex == null && seedIndex >= 0) s.activeIndex = seedIndex;
        });
    }

    // --- forwarded API for the View — convenience getters used in JSX ---
    get rowHeight(): number {
        return this.props.rowHeight ?? defaultRowHeight;
    }
    get maxVisibleItems(): number {
        return this.props.maxVisibleItems ?? defaultMaxVisibleItems;
    }

    // --- lifecycle ---

    /*
     * This model's prop-driven lifecycle is owned by `createComponentModelDriver`
     * (EPIC-056 C3-6 rows 5-8). Where the four former reactions went:
     *
     * - `:520` items-source reset -> `setProps` below, behind an identity guard.
     * - `:535` load trigger -> `resetItemsCache` for sync sources, `startLoadIfNeeded` from the open
     *   transition for async ones.
     * - `:556` close reset -> `closeInto`, inline in the write that closes.
     * - `:577` `activeIndex` seed -> `openInto` on the open transition, and `commitLoaded` when the
     *   rows arrive.
     *
     * Two of those carried a `queueMicrotask`, and both are gone: the transitions now write their
     * state at the mutation sites that own them. The one surviving `queueMicrotask` in this file
     * clears `_suppressFocusOpen` after the synchronous focus event.
     */

    /**
     * Runs on every prop pump — including the first, which happens inside
     * `createComponentModelDriver(...)`, i.e. inside the view's constructor. That is safe by
     * construction rather than by discipline: `open` is state and defaults to false, so the async arm
     * cannot fire before mount and no promise is ever started from a constructor. The sync arm writes
     * state that has no subscribers yet, and the view's `bind` applies immediately at `onMount`, so
     * the first render already has its items.
     */
    setProps = (): void => {
        if (Object.is(this.props.items, this.appliedItemsSource)) return;
        this.appliedItemsSource = this.props.items;
        this.resetItemsCache();
    };

    /**
     * Invalidate the cache for a new `items` reference, and load immediately if the new source can.
     *
     * `_loadId` is bumped **before** any state write, so a listener running inside the dispatch
     * cannot observe a stale token and an in-flight promise from the previous source is already
     * superseded when it settles.
     *
     * For a sync source this is **one** write where the effect pair produced two: `commitLoaded`
     * already writes all five fields, so a separate clear is redundant. That matters —
     * `editors/settings/sections/SettingsSections.tsx` rebuilds its `items` array on every render,
     * so this path runs on every pump of that section. It cannot loop: a state write does not pump
     * props in a vanilla driver, so reset -> load -> bind -> sync never re-enters `setProps`.
     */
    private resetItemsCache(): void {
        this._loadId += 1;
        if (isSyncSource(this.props.items)) {
            this.startLoad();
            return;
        }
        this.state.update((s) => {
            s.loadedItems = [];
            s.loadedSources = [];
            s.itemsLoaded = false;
            s.itemsError = null;
        });
        if (this.state.get().open) this.startLoad();
    }

    /**
     * The async arm's trigger, called from the two open transitions. Sync sources never reach it:
     * `resetItemsCache` has already loaded them, and only an `items` change can un-load them.
     *
     * Deliberately **not** guarded on `itemsLoading`. Today's effect re-invoked the loader on every
     * open while `itemsLoaded` was false, and `_loadId` invalidation dropped the superseded result;
     * guarding here would silently change that to once-per-source. Defensible for a loader doing
     * HTTP, but it is a semantic change and belongs in its own task.
     */
    private startLoadIfNeeded(): void {
        if (this.state.get().itemsLoaded) return;
        if (isSyncSource(this.props.items)) return;
        this.startLoad();
    }

    dispose() {
        // Invalidate any in-flight Promise so its resolution is dropped.
        this._loadId += 1;
    }
}

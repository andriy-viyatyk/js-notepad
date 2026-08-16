import React from "react";
import { TComponentModel } from "../../core/state/model";
import { IListBoxItem } from "../ListBox";
import type { SlotText } from "../shared/slots";

// =============================================================================
// Public types
// =============================================================================

export interface AutocompleteProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className" | "onChange" | "onSubmit"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;

    /** Current text value. The component is fully controlled. */
    value: string;
    /** Fires on every keystroke and on suggestion commit. */
    onChange: (value: string) => void;

    /** Suggestion source. Accepts a flat string list (sugar) or `IListBoxItem[]` for
     *  richer rendering (icons, custom labels). */
    items: string[] | IListBoxItem[];

    /** Filter mode for typeahead against `items`. Default: "contains".
     *  When suggestions are pre-filtered upstream (e.g. Browser URL bar's
     *  search-history filter), set to "off". */
    filterMode?: "contains" | "startsWith" | "off";
    /** Custom filter — overrides `filterMode` when set. */
    filter?: (item: IListBoxItem, query: string) => boolean;

    /** Open the dropdown automatically when the input receives focus. Default: false.
     *  KeyValueEditor: false (open on first keystroke). Browser URL bar: true. */
    openOnFocus?: boolean;
    /** Fires when the user presses Enter with no highlighted suggestion. Use for
     *  "submit"-style flows (Browser URL bar → navigate). Receives the current value. */
    onSubmit?: (value: string) => void;
    /** Fires when the user presses Escape. Receives the value at the moment Escape was
     *  pressed (useful for "revert to original" patterns like the Browser URL bar). */
    onEscape?: (value: string) => void;

    /** Optional header row above the suggestions list. Used by the Browser URL bar for
     *  "Search History" / "Navigation History" labels. */
    header?: React.ReactNode;
    /** Optional action rendered at the trailing edge of the header row. Used by the
     *  Browser URL bar for a "Clear" button. */
    headerAction?: React.ReactNode;
    /** Empty-state node when there are zero matching suggestions. When omitted, the
     *  popover closes instead of rendering an empty list. */
    emptyMessage?: SlotText;

    // Inner Input passthroughs
    placeholder?: string;
    disabled?: boolean;
    readOnly?: boolean;
    size?: "sm" | "md";
    autoFocus?: boolean;
    startSlot?: React.ReactNode;
    endSlot?: React.ReactNode;
    width?: number | string;
    minWidth?: number | string;
    maxWidth?: number | string;

    /** Maximum visible rows in the dropdown before it scrolls. Default: 10. */
    maxVisibleItems?: number;
    /** Pixel height of each row. Forwarded to the inner ListBox. Default: 24. */
    rowHeight?: number;

    "aria-label"?: string;
    "aria-labelledby"?: string;
}

// =============================================================================
// State
// =============================================================================

export interface AutocompleteState {
    open: boolean;
    activeIndex: number | null;
}

export const defaultAutocompleteState: AutocompleteState = {
    open: false,
    activeIndex: null,
};

// =============================================================================
// Helpers
// =============================================================================

function defaultMatch(item: IListBoxItem, q: string, mode: "contains" | "startsWith" | "off"): boolean {
    if (mode === "off" || q === "") return true;
    const label = typeof item.label === "string" ? item.label.toLowerCase() : "";
    const query = q.toLowerCase();
    return mode === "startsWith" ? label.startsWith(query) : label.includes(query);
}

function isStringArray(items: unknown[]): items is string[] {
    return items.length === 0 || typeof items[0] === "string";
}

/** Normalize a string[] | IListBoxItem[] source into a parallel
 *  `IListBoxItem[]` (renderable) + `string[]` (commit-strings). The commit
 *  string is what gets passed to `onChange` when the row is picked. */
function toResolvedItems(input: string[] | IListBoxItem[]): {
    items: IListBoxItem[];
    commits: string[];
} {
    if (isStringArray(input)) {
        const items: IListBoxItem[] = input.map((s) => ({ value: s, label: s }));
        return { items, commits: input };
    }
    const commits: string[] = input.map((it) =>
        typeof it.label === "string" ? it.label : String(it.value),
    );
    return { items: input, commits };
}

// =============================================================================
// Model
// =============================================================================

const defaultRowHeight = 24;
const defaultMaxVisibleItems = 10;

export class AutocompleteModel extends TComponentModel<AutocompleteState, AutocompleteProps> {
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
    get autocompleteId(): string {
        return `autocomplete-${this._reactId}`;
    }
    get listboxId(): string {
        return `${this.autocompleteId}-listbox`;
    }

    // --- derived ---

    /** Resolve the `items` prop once per ref change into renderable + commit-string arrays. */
    private resolved = this.memo(
        () => toResolvedItems(this.props.items),
        () => [this.props.items],
    );

    /** Filter resolved items by the current value. Returns parallel filteredItems +
     *  filteredCommits arrays so onListChange can map IListBoxItem → commit string. */
    filtered = this.memo<{ filteredItems: IListBoxItem[]; filteredCommits: string[] }>(
        () => {
            const { items, commits } = this.resolved.value;
            const filterMode = this.props.filterMode ?? "contains";
            const customFilter = this.props.filter;
            const query = this.props.value ?? "";
            const matchFn =
                customFilter ?? ((it: IListBoxItem) => defaultMatch(it, query, filterMode));
            const filteredItems: IListBoxItem[] = [];
            const filteredCommits: string[] = [];
            for (let i = 0; i < items.length; i++) {
                if (matchFn(items[i], query)) {
                    filteredItems.push(items[i]);
                    filteredCommits.push(commits[i]);
                }
            }
            return { filteredItems, filteredCommits };
        },
        () => [
            this.resolved.value,
            this.props.value,
            this.props.filterMode,
            this.props.filter,
        ],
    );

    // --- forwarded API for the View ---
    get rowHeight(): number {
        return this.props.rowHeight ?? defaultRowHeight;
    }
    get maxVisibleItems(): number {
        return this.props.maxVisibleItems ?? defaultMaxVisibleItems;
    }

    // --- handlers ---

    private tryOpen = () => {
        if (this.props.disabled || this.props.readOnly) return;
        if (!this.state.get().open) {
            this.state.update((s) => {
                s.open = true;
            });
        }
    };

    onInputChange = (val: string) => {
        if (this.props.disabled || this.props.readOnly) return;
        // Open on first keystroke that changes value. activeIndex resets so the
        // first ArrowDown highlights row 0 of the new filtered set.
        this.state.update((s) => {
            s.open = true;
            s.activeIndex = null;
        });
        this.props.onChange?.(val);
    };

    onInputFocus = () => {
        if (this.props.openOnFocus) this.tryOpen();
    };

    onInputClick = () => {
        if (this.props.openOnFocus) this.tryOpen();
    };

    onPopoverClose = () => {
        this.state.update((s) => {
            s.open = false;
        });
    };

    onActiveIndexChange = (i: number) => {
        this.state.update((s) => {
            s.activeIndex = i;
        });
    };

    private commitFromIndex = (idx: number) => {
        const { filteredCommits } = this.filtered.value;
        const next = filteredCommits[idx];
        if (next === undefined) return;
        this.state.update((s) => {
            s.open = false;
            s.activeIndex = null;
        });
        this.props.onChange?.(next);
        // Keep focus on the input — many flows (KV editor) expect Tab to move to
        // the next field after commit. queueMicrotask defers past the popover close.
        queueMicrotask(() => {
            this.inputRef?.focus();
        });
    };

    onListChange = (item: IListBoxItem) => {
        const { filteredItems } = this.filtered.value;
        const idx = filteredItems.indexOf(item);
        if (idx < 0) return;
        this.commitFromIndex(idx);
    };

    onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const { disabled, readOnly, onSubmit, onEscape, value } = this.props;
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
                        s.activeIndex = 0;
                    });
                    return;
                }
                if (filteredItems.length === 0) return;
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
                        s.activeIndex = Math.max(0, filteredItems.length - 1);
                    });
                    return;
                }
                if (filteredItems.length === 0) return;
                const step = e.key === "PageUp" ? 9 : 1;
                const cur = activeIndex ?? filteredItems.length;
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
                if (open && activeIndex != null
                    && activeIndex >= 0 && activeIndex < filteredItems.length) {
                    e.preventDefault();
                    this.commitFromIndex(activeIndex);
                } else if (onSubmit) {
                    e.preventDefault();
                    this.state.update((s) => {
                        s.open = false;
                        s.activeIndex = null;
                    });
                    onSubmit(value);
                }
                break;
            case "Escape":
                if (open) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.state.update((s) => {
                        s.open = false;
                        s.activeIndex = null;
                    });
                }
                onEscape?.(value);
                break;
        }
    };

    // --- lifecycle ---

    init() {
        // Reset activeIndex when popover closes — so re-opening always starts unhighlighted.
        this.effect(
            () => {
                if (this.state.get().open) return;
                queueMicrotask(() => {
                    if (!this.isLive) return;
                    if (this.state.get().open) return;
                    this.state.update((s) => {
                        s.activeIndex = null;
                    });
                });
            },
            () => [this.state.get().open],
        );
    }
}

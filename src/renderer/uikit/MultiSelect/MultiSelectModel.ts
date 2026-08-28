import React from "react";
import { TComponentModel } from "../../core/state/model";
import { Traited } from "../../core/traits/traits";
import type { IListBoxItem } from "../ListBox/types";
import type { SlotText } from "../shared/slots";

// =============================================================================
// Public types
// =============================================================================

export interface MultiSelectProps<T = IListBoxItem>
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className" | "onChange"> {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    /** Items to display in the dropdown. Plain `T[]` when `T = IListBoxItem`, or
     *  `Traited<unknown[]>` to drive a custom source shape (Rule 3). */
    items: T[] | Traited<unknown[]>;
    /** Currently-selected source items. Empty array when nothing is selected. */
    value: T[];
    /** Called whenever the selection changes — caller replaces its `value` with the array. */
    onChange: (value: T[]) => void;
    /** Placeholder shown in the trigger when `value` is empty and no `formatSelection` is set. */
    placeholder?: string;
    /** Disabled state — trigger is not focusable and the popover cannot open. */
    disabled?: boolean;
    /** Read-only state — popover may still open but rows cannot be toggled. */
    readOnly?: boolean;
    /** Control size for the trigger Input. Default: "md". */
    size?: "sm" | "md";

    // ── Forwarded to the inner MultiListBox ────────────────────────────────────

    /** Search filter mode for the in-dropdown search. Default: "contains". */
    filterMode?: "contains" | "startsWith" | "off";
    /** Pixel height of each list row. Default: 24. */
    rowHeight?: number;
    /** Maximum visible list rows before the dropdown scrolls. Default: 10. */
    maxVisibleItems?: number;
    /** Show a tri-state "Select all" row at the top of the dropdown. Default: false. */
    selectAll?: boolean;
    /** Label rendered next to the select-all checkbox. Default: "Select all". */
    selectAllLabel?: string;
    /** Empty-state body shown when no rows match the dropdown filter. Default: "no rows". */
    emptyMessage?: SlotText;

    // ── Dropdown chrome ────────────────────────────────────────────────────────

    /**
     * When true, the dropdown gains a resize handle at the bottom-right corner.
     * Forwarded to the inner Popover.
     */
    resizable?: boolean;
    /** Match the popover width to the trigger width. Default: true. */
    matchAnchorWidth?: boolean;

    // ── Trigger appearance ────────────────────────────────────────────────────

    /**
     * Formats the trigger label from the current `value` array. Default behaviour:
     *   • empty → returns "" (placeholder shows instead)
     *   • non-empty → "(n) selected"
     */
    formatSelection?: (value: T[]) => string;

    // ── Width ─────────────────────────────────────────────────────────────────

    width?: number | string;
    minWidth?: number | string;
    maxWidth?: number | string;

    "aria-label"?: string;
    "aria-labelledby"?: string;
}

// =============================================================================
// State
// =============================================================================

export interface MultiSelectState {
    open: boolean;
    popoverResized: boolean;
}

export const defaultMultiSelectState: MultiSelectState = {
    open: false,
    popoverResized: false,
};

// =============================================================================
// Model
// =============================================================================

export class MultiSelectModel<T = IListBoxItem> extends TComponentModel<
    MultiSelectState,
    MultiSelectProps<T>
> {
    // --- refs ---
    inputRef: HTMLInputElement | null = null;
    rootRef: HTMLDivElement | null = null;

    setInputRef = (el: HTMLInputElement | null) => {
        this.inputRef = el;
    };
    setRootRef = (el: HTMLDivElement | null) => {
        this.rootRef = el;
    };

    // --- ids ---
    private _elementId = "";
    /** Fed by the view from `nextElementId("multiselect")` — replaces React's `useId` (C3-5). */
    setElementId = (elementId: string) => {
        this._elementId = elementId;
    };
    get multiSelectId(): string {
        return this._elementId;
    }
    get popoverId(): string {
        return `${this.multiSelectId}-popover`;
    }

    // --- derived ---

    /** Formatted text shown in the trigger Input. */
    displayText = this.memo<string>(
        () => {
            const value = this.props.value;
            const fmt = this.props.formatSelection;
            if (fmt) return fmt(value);
            if (!value || value.length === 0) return "";
            return `(${value.length}) selected`;
        },
        () => [this.props.value, this.props.formatSelection],
    );

    // --- state transitions ---

    /*
     * Draft mutators, not setters: they mutate an immer draft and never call `state.update`
     * themselves, so every path that opens or closes produces exactly **one** write. That is not
     * tidiness — `ListBoxView` picks its scroll entry point from a single `onUpdate` carrying both a
     * moved row set and a moved highlight, and two writes make the second one report no content
     * change (uikit/CLAUDE.md, "Scrolling after a change that resizes the content").
     *
     * `closeInto` also carries what `MultiSelectModel.init`'s effect used to do on a
     * `queueMicrotask` (EPIC-056 C3-6 #9): the resize override is a *consequence of closing*, so it
     * belongs at the site that closes.
     */

    private openInto(s: MultiSelectState): void {
        s.open = true;
    }

    private closeInto(s: MultiSelectState): void {
        s.open = false;
        s.popoverResized = false;
    }

    // --- handlers ---

    private tryOpen = () => {
        if (this.props.disabled) return;
        if (this.state.get().open) return;
        this.state.update((s) => this.openInto(s));
    };

    onInputClick = () => {
        this.tryOpen();
    };

    onInputFocus = () => {
        // Don't auto-open on focus — only on explicit click / keyboard.
    };

    onChevronMouseDown = (e: MouseEvent) => {
        // Prevent the input from losing focus when the chevron is pressed.
        e.preventDefault();
    };

    onChevronClick = () => {
        if (this.props.disabled) return;
        // `open` is read before the write, never negated inside the producer: immer runs the
        // producer against the previous state, and "reset `popoverResized` on the close leg only"
        // is not expressible as `s.open = !s.open`.
        const open = this.state.get().open;
        this.state.update((s) => (open ? this.closeInto(s) : this.openInto(s)));
        this.inputRef?.focus();
    };

    onPopoverClose = () => {
        this.state.update((s) => this.closeInto(s));
    };

    onPopoverResize = () => {
        this.state.update((s) => {
            s.popoverResized = true;
        });
    };

    onInputKeyDown = (e: KeyboardEvent) => {
        if (this.props.disabled) return;
        const open = this.state.get().open;
        switch (e.key) {
            case "ArrowDown":
            case "Enter":
            case " ":
                if (!open) {
                    e.preventDefault();
                    this.state.update((s) => this.openInto(s));
                }
                break;
            case "Escape":
                if (open) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.state.update((s) => this.closeInto(s));
                }
                break;
        }
    };
}

/**
 * Hover a clipped cell, read its full value.
 *
 * The React grid this replaces wrapped every string cell in `<TruncatedText>`, which gave each one
 * an ellipsis and a tooltip; av-grid gives the ellipsis (2.2.3) and no tooltip, because a
 * framework-free published grid cannot own Persephone's tooltip component, its delay, its theme,
 * or its coordination with the app's overlay and drag registries. So the tooltip is restored here,
 * once, in the seam every consumer mounts through (EPIC-057 / US-1024).
 *
 * ## One attachment, many targets
 *
 * `attachTooltip` binds its listeners to a trigger element and positions against it. Cells cannot
 * be that element: they are **pooled and recycled**, so `mouseenter` is not dependable on them
 * (av-grid's own hover tracking says so in `GridInteractions`, and uses `pointermove` for exactly
 * this reason), and an attachment would outlive its occupant — the element that showed row 5 shows
 * row 25 after a scroll, with the same identity.
 *
 * So the trigger is the **grid root**, permanently, and the hovered cell is supplied as a floating
 * UI *virtual anchor*. Events and identity come from the root; geometry comes from the cell. That
 * also gets the registries right for free: `overlayRegistry` suppression and `tooltipRegistry`'s
 * innermost-wins are both containment tests, and the root is the correct subject for both.
 *
 * ## Which cells, and what text
 *
 * Two gates, and neither is a list of exceptions:
 *
 *  1. **The element.** A candidate cell has an `.avg-cell-text` child — av-grid's own text wrapper,
 *     present for a plain and a search-matched cell and absent for a boolean, an open editor and
 *     anything a column's `render` hook produced. Clipping is then measured on that wrapper, which
 *     is a block container: the same `scrollWidth > clientWidth` measured on the *cell* is
 *     undetectable for a centred or right-aligned cell, because overflow in a `nowrap` flex line
 *     moves to the start side and is not part of the scrollable overflow region — and av-grid
 *     right-aligns every number by default, so that predicate would have silently never fired for
 *     a numeric column.
 *  2. **The text.** `columnDisplayValue`, normalised the way av-grid's own `displayText` does.
 *     Empty means no tooltip, which is how a graphical `render` column opts out: `formatValue` is
 *     already the library's plain-text projection — the rule it filters and copies by — so a column
 *     drawing an SVG or a row of buttons declares `formatValue: () => ""` for those reasons before
 *     this feature existed.
 *
 * Deliberately not `textContent`: it is nearly right for the two text shapes, and wrong the moment
 * a `render` column composes anything (the git tree's commit-subject cell would yield its ref-badge
 * names glued to the subject). A `render` column that *wants* hover-to-read emits
 * `<span class="avg-cell-text">` and gets the ellipsis with it.
 *
 * ## What suppresses it
 *
 * The two registries cover HTML5 drags and app popovers. Four things they cannot see:
 *
 *  • **A range-selection drag and a column-resize drag** are pointer-driven, not HTML5 drags. Both
 *    are covered by refusing to arm while any button is down and by closing on `pointerdown`.
 *    av-grid does expose `focus.isDragging`, which looks like the right gate and is not: before
 *    2.2.3 it latched on, and reading a version-dependent flag to decide a hover is worse than
 *    reading the button state that is already on the event.
 *  • **An open cell editor** — `grid.isEditing()`, plus the hovered cell's own `.avg-editing`.
 *  • **av-grid's own popovers** (filter, cell dropdown) are the library's DOM on `document.body`,
 *    so `overlayRegistry` has never heard of them — and the tooltip's `z-index` beats theirs, so
 *    without this it paints *over* an open filter popover. One observer registers them.
 */

import { attachTooltip, type TooltipAttachment } from "../Tooltip/attach-tooltip";
import { overlayRegistry } from "../shared/overlayRegistry";
import { columnDisplayValue, formatDisplayValue } from "av-grid";
import type { Column, DataGridInstance } from "./types";

/** Longer than this and a tooltip stops being a peek. See `truncate`. */
const MAX_TEXT = 2000;

/** Sub-pixel text advance and DPR snapping move the measurement by fractions of a pixel. */
const CLIP_TOLERANCE = 1;

const CELL_SELECTOR = '[data-type="data-cell"]';
const TEXT_SELECTOR = ".avg-cell-text";

/** What the pointer is currently over, or nothing. Identified by row and column, never by element. */
interface Target {
    /** The pooled element. Only ever used after re-checking that it still holds `row`. */
    el: HTMLElement;
    row: number;
    columnKey: string;
    text: string;
}

/**
 * The value a cell shows, as text.
 *
 * `columnDisplayValue` alone is not it: the cell's own `displayText` adds three rules on top —
 * nullish becomes empty, a `Date` goes through `formatDisplayValue`, everything else is
 * `String()`-ed. Without them a date column's tooltip reads
 * `Tue Aug 19 2025 14:03:11 GMT+0200 (…)` beside a cell reading `19/08/2025, 14:03`, and a tooltip
 * that disagrees with the cell it points at is worse than none.
 */
function displayText<R>(column: Column<R>, row: R): string {
    const value = columnDisplayValue(column, row);
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (value instanceof Date) return formatDisplayValue(value);
    return String(value);
}

/**
 * A grid cell can hold a whole file. The tooltip shows the beginning and says what it dropped.
 *
 * The cap lives here rather than in `attachTooltip`, which is generic and has callers that
 * legitimately pass long rich content, and rather than in av-grid, which has no opinion about how
 * much text a person wants to hover-read. "A cell may contain 50 KB of JSON" is knowledge that
 * belongs to the grid's host.
 */
function truncate(text: string): string {
    if (text.length <= MAX_TEXT) return text;
    const dropped = text.length - MAX_TEXT;
    return `${text.slice(0, MAX_TEXT)}… +${dropped.toLocaleString()} more characters`;
}

/**
 * The tooltip's content, as an element carrying its own `data-type`.
 *
 * Not a bare string: the tooltip's floating root is portalled into the overlay layer, so it is not
 * a descendant of the grid and no selector scoped from `[data-type="data-grid"]` can reach it —
 * and `data-name` is an addressing handle, never a styling hook. A root-level `data-type` on the
 * content itself is the documented answer for a portalled branch, and it is what lets
 * `DataGrid.css` bound the width of a cell value that may be thousands of characters long.
 */
function contentElement(text: string): HTMLElement {
    const el = document.createElement("div");
    el.dataset.type = "grid-cell-tooltip";
    el.textContent = text;
    return el;
}

/**
 * Register av-grid's popovers with the app's overlay registry, so a cell tooltip does not paint
 * over an open filter popover or cell dropdown.
 *
 * Installed once for the module and never torn down. It is one observer watching one childList for
 * a class match, and being blunt is correct: another grid's popover should suppress this grid's
 * tooltip too. The alternative is an upstream open/close hook on av-grid's `Popover`, which is the
 * better design and a bigger change than this feature needs — recorded in the task's concerns
 * rather than done quietly here.
 */
let popoverObserver: MutationObserver | undefined;

function ensureAvgPopoverObserver(): void {
    if (popoverObserver || typeof document === "undefined") return;

    const visit = (nodes: NodeList, add: boolean): void => {
        nodes.forEach((node) => {
            if (!(node instanceof HTMLElement)) return;
            if (!node.classList.contains("avg-popover")) return;
            if (add) overlayRegistry.register(node);
            else overlayRegistry.unregister(node);
        });
    };

    popoverObserver = new MutationObserver((records) => {
        for (const record of records) {
            visit(record.addedNodes, true);
            visit(record.removedNodes, false);
        }
    });
    popoverObserver.observe(document.body, { childList: true });
}

export class CellTooltip {
    private readonly tooltip: TooltipAttachment;
    private target: Target | undefined;
    private disposed = false;

    constructor(
        private readonly root: HTMLElement,
        private readonly getGrid: () => DataGridInstance | undefined,
        private readonly name?: string,
    ) {
        ensureAvgPopoverObserver();
        this.tooltip = attachTooltip(root, { content: null, name });

        // `pointermove`, not `mousemove`. av-grid calls `preventDefault()` on a cell's pointerdown
        // to stop the browser starting a text selection, and per the Pointer Events spec that
        // suppresses the compatibility mouse events for the rest of that pointer's stream — so a
        // `mousemove`-driven tooltip would freeze on whatever cell a drag began from.
        root.addEventListener("pointermove", this.onPointerMove);
        root.addEventListener("pointerleave", this.onPointerLeave);
        // Capture, so it still runs when something downstream stops propagation — the column
        // resize grip does exactly that.
        root.addEventListener("pointerdown", this.onPointerDown, true);
        root.addEventListener("scroll", this.onScroll, true);
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.root.removeEventListener("pointermove", this.onPointerMove);
        this.root.removeEventListener("pointerleave", this.onPointerLeave);
        this.root.removeEventListener("pointerdown", this.onPointerDown, true);
        this.root.removeEventListener("scroll", this.onScroll, true);
        // The floating root lives in the overlay layer, not inside the grid — so unmounting the
        // grid without this leaves a visible orphan tooltip with a live `autoUpdate` observing a
        // detached element.
        this.tooltip.dispose();
        this.target = undefined;
    }

    private readonly onPointerMove = (e: PointerEvent): void => {
        if (this.disposed) return;
        // Any button down means a drag: a range selection, a column resize, or something that
        // began outside the grid. Fails safe — a button released off-window reads as 0 on the next
        // move inside, so there is no state to get stuck.
        if (e.buttons !== 0) return;
        this.apply(this.resolve(e.target));
    };

    private readonly onPointerLeave = (): void => {
        this.clear();
    };

    private readonly onPointerDown = (): void => {
        this.clear();
    };

    /**
     * A scroll closes it rather than re-resolving it.
     *
     * The pointer has not moved, so the user has not asked about the cell that is now under it —
     * and the next `pointermove` re-arms with the right content. Re-resolving instead would mean
     * duplicating av-grid's own post-paint `elementFromPoint` hit test in the host, to answer a
     * question nobody asked.
     */
    private readonly onScroll = (): void => {
        if (this.target) this.clear();
    };

    /**
     * Close now, and forget what was in it.
     *
     * The distinction from `apply(undefined)` is not cosmetic. Leaving the grid, pressing a button
     * and scrolling all *end* the hover, whereas crossing a cell that happens to fit is still the
     * same gesture — so the first three drop the content and the last keeps it (see `apply`).
     * Dropping it matters because `attachTooltip` also opens on `focusin`, and the grid root takes
     * focus on every click: content left behind would let a later keyboard return to the grid
     * re-show a value the pointer has nothing to do with, anchored to a cell that may since have
     * been recycled onto another row.
     */
    private clear(): void {
        this.target = undefined;
        this.tooltip.update({ content: null, name: this.name });
    }

    /** The cell under the pointer, if it is one this tooltip should speak for. */
    private resolve(eventTarget: EventTarget | null): Target | undefined {
        if (!(eventTarget instanceof Element)) return undefined;

        const el = eventTarget.closest<HTMLElement>(CELL_SELECTOR);
        if (!el || !this.root.contains(el)) return undefined;
        // A cell holding the open editor shows the whole value in an input already, and a tooltip
        // over it would cover what the user is typing.
        if (el.classList.contains("avg-editing")) return undefined;

        const inner = el.querySelector<HTMLElement>(TEXT_SELECTOR);
        if (!inner) return undefined;
        if (inner.scrollWidth <= inner.clientWidth + CLIP_TOLERANCE) return undefined;

        const grid = this.getGrid();
        if (!grid || grid.isDestroyed()) return undefined;
        // An editor open anywhere: the tooltip's placement is one row away from it either way.
        if (grid.isEditing()) return undefined;

        const row = Number(el.dataset.row);
        const columnKey = el.dataset.columnKey;
        if (!Number.isInteger(row) || columnKey === undefined) return undefined;

        // `data-row` indexes the rows the grid is *showing* — after filtering and sorting — which
        // is what `getVisibleRows()` returns; `getRows()` is the wrong array as soon as either is
        // on. The column comes from the key, never from `data-col`: that indexes the **visible**
        // columns while `getColumns()` includes hidden ones, so indexing would read the neighbour
        // of every column after a hidden one.
        const rowData = grid.getVisibleRows()[row];
        const column = grid.getColumns().find((c) => String(c.key) === columnKey);
        if (rowData === undefined || !column) return undefined;

        const text = displayText(column, rowData);
        if (!text) return undefined;

        return { el, row, columnKey, text };
    }

    /**
     * Move, open, or close — keyed on the row and column, never on the element.
     *
     * The element is pooled and outlives its occupant, so comparing identity would call a scroll
     * that swapped a cell's row "no change" and leave the tooltip showing another row's text while
     * pointing at this one. That is the failure this whole design is shaped around.
     */
    private apply(next: Target | undefined): void {
        const current = this.target;
        if (!next) {
            if (current) {
                this.target = undefined;
                // `hide()` rather than `clear()`: emptying the content closes the tooltip
                // *immediately*, which would make crossing one short cell between two long ones a
                // visible flicker instead of one tooltip that moves. The pointer is still inside
                // the grid here, so the gesture is not over — the cases where it is over call
                // `clear()` instead.
                this.tooltip.hide();
            }
            return;
        }

        if (current && current.row === next.row && current.columnKey === next.columnKey) return;

        this.target = next;
        this.tooltip.update({
            content: contentElement(truncate(next.text)),
            anchor: this.anchorFor(next),
            name: this.name,
        });
        // Open it, or move an open one without re-paying the delay. Someone reading down a column
        // of clipped paths has already declared intent; charging 800 ms per row would mean that at
        // any real reading pace they see nothing at all.
        this.tooltip.show();
    }

    /**
     * A virtual anchor over the cell's box, valid only while the cell still holds that row.
     *
     * `autoUpdate` re-measures on scroll, and by then the element may have been recycled onto a
     * different row — so the closure re-checks `data-row` and falls back to the grid root's box
     * rather than confidently pointing at the wrong cell.
     */
    private anchorFor(target: Target): { getBoundingClientRect: () => DOMRect; contextElement: HTMLElement } {
        const { el, row } = target;
        return {
            getBoundingClientRect: () =>
                el.dataset.row === String(row)
                    ? el.getBoundingClientRect()
                    : this.root.getBoundingClientRect(),
            // Stable on purpose: this is what `autoUpdate` watches for overflow ancestors, so
            // holding it at the root means the watched set never changes as the pointer moves.
            contextElement: this.root,
        };
    }
}

/**
 * Scroll handling, sizing, and dirty-set merging — the stateful half of the engine.
 *
 * Absorbed from av-grid's `render/RenderGridModel.ts`, which was itself ported from
 * `uikit/RenderGrid/RenderGridModel.ts` with the React lifecycle removed. What changed on the
 * way in here is the notification mechanism:
 *
 * | React engine (`uikit/RenderGrid/`) | Here |
 * |---|---|
 * | `extends TComponentModel` | **no base class, no reactive store** |
 * | `mapProps` / `setProps` on every React render | `setOptions(partial)`, called explicitly |
 * | `isFirstUse` + `setTimeout(checkSize, 200)` | a `ResizeObserver` attached in `attach()` |
 * | `isLive` | `disposed` |
 * | `rerender()` bumps state so React repaints | `requestRepaint()` calls one `onRepaintNeeded` |
 * | `React.UIEvent` | `Event` |
 *
 * **Why there is no store here** (EPIC-056 decision C3-2). This model's state is consulted by a
 * paint loop that already knows exactly what changed — the `RerenderInfo` dirty set — so a
 * subscription mechanism buys nothing, and `TOneState` would add immer `produce` on every update
 * plus synchronous listener dispatch from inside a scroll handler. There is exactly one
 * subscriber, known statically (the view), and it only ever needs to be told "repaint next
 * frame". That is a callback, not a subject. This is the only component in `uikit/` exempt from
 * the state primitives; see `uikit/CLAUDE.md`. If a *host* ever needs to observe the engine, the
 * answer is another registered callback in the options — as `onResize` and `onInnerSizeChange`
 * already are — not a store.
 *
 * The callback may only ever **schedule** a paint, never paint synchronously: `requestRepaint` is
 * called from a `ResizeObserver` callback, and painting from there is a documented layout-thrash
 * and "ResizeObserver loop" source.
 *
 * Everything the reference kept out of this file — block styles, class names, extra elements —
 * stays out: those are the view's business, not the model's.
 *
 * **The one line that must not change** is in `inputChanged()`: the scroll offset is deliberately
 * excluded from the comparison. Including it would report a change on every scroll frame, which
 * would call `updateRenderInfo({ all: true })` and rebuild every visible cell. See the comment
 * there.
 */

import { AsyncRef } from "../shared/async-ref";
import {
    calcRenderInfo,
    calcScrollOffset,
    calcScrollOffsetX,
    calcScrollOffsetY,
    renderInfoInitialState,
} from "./renderInfo";
import type {
    AdjustRenderRangeFunc,
    ElementLength,
    RenderCellFunc,
    RenderInnerSize,
    RenderInputPrepared,
    RenderPoint,
    RenderSizeOptional,
    RecycleFunc,
    RerenderInfo,
    RowAlign,
    SetReuseKeyFunc,
} from "./types";

export const defaultRowHeight = 24;
export const defaultColumnWidth = 120;
const defaultOverscanColumns = 0;

/** The inputs whose change forces a full recompute. Compared field by field, minus offset. */
export interface VirtualGridModelInput {
    rowCount: number;
    columnCount: number;
    rowHeight: ElementLength;
    columnWidth: ElementLength;
    renderCell: RenderCellFunc;
    setReuseKey?: SetReuseKeyFunc;
    stickyTop: number;
    stickyLeft: number;
    stickyRight: number;
    stickyBottom: number;
    overscanColumn: number;
    overscanRow: number;
    fitToWidth: boolean;
    size?: RenderSizeOptional;
    offset: RenderPoint;
    scrollBarWidth: number;
    scrollBarHeight: number;
}

export interface VirtualGridOptions {
    /** Debug label, emitted as `data-name` on the root element. Never used for styling. */
    name?: string;
    /** A count, or a function returning one — so a changing row count needs no re-set. */
    rowCount: number | (() => number);
    columnCount: number | (() => number);
    rowHeight?: ElementLength;
    columnWidth: ElementLength;
    renderCell: RenderCellFunc;
    /** Supplied by the DOM shell so `renderCell` can reuse a scrolled-out element. */
    recycle?: RecycleFunc;
    /** Records the consumer's compatibility key for cells admitted to the pool. */
    setReuseKey?: SetReuseKeyFunc;
    stickyTop?: number;
    stickyLeft?: number;
    stickyRight?: number;
    stickyBottom?: number;
    overscanColumn?: number;
    overscanRow?: number;
    fitToWidth?: boolean;
    whiteSpaceX?: number;
    whiteSpaceY?: number;
    onInnerSizeChange?: (size: RenderInnerSize) => void;
    onAdjustRenderRange?: AdjustRenderRangeFunc;
    onResize?: (size: RenderSizeOptional) => void;
}

/** Default for the repaint callback, so a model built without a view needs no null checks. */
const noop = (): void => {};

export interface VirtualGridElements {
    /** The outer element, measured for the viewport size. */
    grid: HTMLElement;
    /** The scrolling element, measured for scrollbar thickness and listened to for scroll. */
    container: HTMLElement;
}

export class VirtualGridModel {
    readonly gridRef = new AsyncRef<HTMLElement | undefined>(undefined);
    readonly containerRef = new AsyncRef<HTMLElement | undefined>(undefined);
    readonly renderInfo = new AsyncRef<RenderInputPrepared>(renderInfoInitialState);

    offset: RenderPoint = { x: 0, y: 0 };
    size: RenderSizeOptional = { width: undefined, height: undefined };

    private options: VirtualGridOptions;
    private oldInput?: VirtualGridModelInput;
    private pendingRerender?: RerenderInfo;
    private updateScheduled = false;
    private resizeObserver?: ResizeObserver;
    private _disposed = false;
    /** A `scrollToRow` that arrived before the grid had a usable size. See `scrollToRow`. */
    private pendingScrollRow?: { row: number; align: RowAlign };

    /**
     * @param onRepaintNeeded called when the view should repaint from `renderInfo.current`.
     *        It must only schedule a paint — see the note at the top of this file.
     */
    constructor(
        options: VirtualGridOptions,
        private onRepaintNeeded: () => void = noop,
    ) {
        this.options = options;
        // Establish the input baseline so the first setOptions does not report a false change.
        this.inputChanged();
    }

    get disposed(): boolean {
        return this._disposed;
    }

    // -----------------------------------------------------------------------
    // Options
    // -----------------------------------------------------------------------

    getOptions(): Readonly<VirtualGridOptions> {
        return this.options;
    }

    /**
     * Replace some or all of the options.
     *
     * The reference did this from `setProps` on every React render; here it is an explicit
     * call, which is the same work without the surrounding framework.
     *
     * Note the reference passed `inRender: true` at this point to avoid a setState during
     * React's render phase — React was about to repaint regardless. Nothing repaints on its
     * own here, so the notification must actually be sent.
     */
    setOptions = (options: Partial<VirtualGridOptions>): void => {
        if (this._disposed) return;
        this.options = { ...this.options, ...options };

        if (this.inputChanged()) {
            this.updateRenderInfo({ all: true });
        }
    };

    // -----------------------------------------------------------------------
    // Resolved option accessors
    // -----------------------------------------------------------------------

    get rowCount(): number {
        return typeof this.options.rowCount === "function"
            ? this.options.rowCount()
            : this.options.rowCount;
    }

    get columnCount(): number {
        return typeof this.options.columnCount === "function"
            ? this.options.columnCount()
            : this.options.columnCount;
    }

    /** Thickness of the horizontal scrollbar, measured from the container. */
    get scrollBarWidth(): number {
        const c = this.containerRef.current;
        return c ? c.offsetWidth - c.clientWidth : 0;
    }

    get scrollBarHeight(): number {
        const c = this.containerRef.current;
        return c ? c.offsetHeight - c.clientHeight : 0;
    }

    /**
     * Does the grid have a size worth computing geometry from, *and* a container that can be
     * scrolled right now?
     *
     * A zero measurement is what a detached, `display: none`, or not-yet-laid-out grid reports, and
     * every scroll-offset computation is nonsense in that state. The container is checked
     * separately because the two are not the same condition: the root can already report its size
     * while the scroll container still has no layout box, and a `scrollTop` written in that window
     * fires a scroll event that `onScroll`'s own hidden-guard then discards — leaving the DOM
     * scrolled and the model's offset at zero.
     */
    get measured(): boolean {
        if (!this.size.width || !this.size.height) return false;
        const container = this.containerRef.current;
        return !!container && !!(container.offsetHeight || container.offsetWidth);
    }

    get visibleRowCount(): number {
        const visible = this.renderInfo.current.visible;
        return visible ? visible.bottom - visible.top + 1 : 0;
    }

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    /**
     * Bind the model to its elements and start observing size.
     *
     * Replaces the reference's `setTimeout(() => this.checkSize(), 200)` on first mount — a
     * poll that both delayed the first paint and missed every later resize.
     */
    attach = ({ grid, container }: VirtualGridElements): void => {
        if (this._disposed) return;

        this.gridRef.ref(grid);
        this.containerRef.ref(container);

        if (typeof ResizeObserver !== "undefined") {
            this.resizeObserver = new ResizeObserver(() => this.checkSize());
            this.resizeObserver.observe(grid);
        }

        this.checkSize();
    };

    dispose(): void {
        this._disposed = true;
        this.resizeObserver?.disconnect();
        this.resizeObserver = undefined;
        // A grid that is never shown and then disposed never runs its queued scroll. That is
        // correct; the field is cleared so a retained model reference cannot resurrect it.
        this.pendingScrollRow = undefined;
        // Releases the model -> view -> DOM retention for hosts that keep a model reference
        // past teardown. The disposed flag already blocks the call; this drops the reference.
        this.onRepaintNeeded = noop;
    }

    /** Ask the view to repaint from `renderInfo.current` on its next frame. */
    requestRepaint = (): void => {
        if (this._disposed) return;
        // Invoked last, so a throwing view cannot leave model state half-updated.
        this.onRepaintNeeded();
    };

    checkSize = (): void => {
        if (!this._disposed) this.onFrameResize();
    };

    onFrameResize = (): void => {
        const grid = this.gridRef.current;
        const newSize: RenderSizeOptional = {
            width: grid != null ? grid.offsetWidth : undefined,
            height: grid != null ? grid.offsetHeight : undefined,
        };

        if (
            this.size.width !== newSize.width ||
            this.size.height !== newSize.height ||
            this.scrollBarWidth !== this.oldInput?.scrollBarWidth
        ) {
            this.size = newSize;
            // A size change invalidates the geometry, so recompute rather than only
            // repainting — the reference relied on React re-running setProps to do this.
            if (this.inputChanged()) {
                this.updateRenderInfo({ all: true });
            } else {
                this.requestRepaint();
            }
            if (this.options.onResize) {
                const cb = this.options.onResize;
                Promise.resolve().then(() => cb(newSize));
            }
        }
    };

    /**
     * Run a `scrollToRow` that had to wait for the grid to become measurable.
     *
     * Called by the view at the end of a paint, and deliberately **not** from `onFrameResize`.
     * The resize callback knows the grid *root* has a size, which is not the same as the scroll
     * container having a layout box: writing `scrollTop` there does stick, but the scroll event it
     * fires is delivered while the container still measures 0x0, so `onScroll`'s hidden-guard
     * discards it and the model's offset stays behind the DOM — a container scrolled 95,000px with
     * row 0 still painted at the top. By the end of a paint the container is live (the paint has
     * already read its scrollbar thickness), so the event lands on the normal path.
     *
     * Consumed exactly once: flushing on every paint would drag the user back to the active row.
     */
    flushPendingScroll(): void {
        if (this._disposed || !this.pendingScrollRow || !this.measured) return;

        const pending = this.pendingScrollRow;
        this.pendingScrollRow = undefined;
        void this.scrollToRow(pending.row, pending.align);
    }

    // -----------------------------------------------------------------------
    // Change detection
    // -----------------------------------------------------------------------

    inputChanged(): boolean {
        const newInput: VirtualGridModelInput = {
            rowCount: this.rowCount,
            columnCount: this.columnCount,
            rowHeight: this.options.rowHeight ?? defaultRowHeight,
            columnWidth: this.options.columnWidth,
            renderCell: this.options.renderCell,
            setReuseKey: this.options.setReuseKey,
            stickyTop: this.options.stickyTop ?? 0,
            stickyLeft: this.options.stickyLeft ?? 0,
            stickyRight: this.options.stickyRight ?? 0,
            stickyBottom: this.options.stickyBottom ?? 0,
            overscanColumn: this.options.overscanColumn ?? defaultOverscanColumns,
            overscanRow: this.options.overscanRow ?? 0,
            fitToWidth: this.options.fitToWidth ?? false,
            size: this.size,
            offset: this.offset,
            scrollBarWidth: this.scrollBarWidth,
            scrollBarHeight: this.scrollBarHeight,
        };
        const oldInput: Partial<VirtualGridModelInput> = this.oldInput || {};
        this.oldInput = newInput;

        // The scroll offset is carried on `newInput` but is deliberately NOT compared.
        //
        // Scroll is handled by onScroll -> updateRenderInfo(undefined, direction), which
        // renders only the newly-exposed cells. Comparing the offset here would report a
        // change on every scroll frame, forcing updateRenderInfo({ all: true }) and
        // rebuilding every visible cell 60 times a second.
        //
        // This is the single most important line in the port. Do not "fix" it by adding the
        // offset for symmetry.
        return (
            newInput.rowCount !== oldInput.rowCount ||
            newInput.columnCount !== oldInput.columnCount ||
            newInput.rowHeight !== oldInput.rowHeight ||
            newInput.columnWidth !== oldInput.columnWidth ||
            newInput.renderCell !== oldInput.renderCell ||
            newInput.setReuseKey !== oldInput.setReuseKey ||
            newInput.stickyTop !== oldInput.stickyTop ||
            newInput.stickyLeft !== oldInput.stickyLeft ||
            newInput.stickyRight !== oldInput.stickyRight ||
            newInput.stickyBottom !== oldInput.stickyBottom ||
            newInput.overscanColumn !== oldInput.overscanColumn ||
            newInput.overscanRow !== oldInput.overscanRow ||
            newInput.fitToWidth !== oldInput.fitToWidth ||
            !newInput.size ||
            !oldInput.size ||
            newInput.size.width !== oldInput.size.width ||
            newInput.size.height !== oldInput.size.height ||
            newInput.scrollBarWidth !== oldInput.scrollBarWidth ||
            newInput.scrollBarHeight !== oldInput.scrollBarHeight
        );
    }

    // -----------------------------------------------------------------------
    // Dirty-set merging
    // -----------------------------------------------------------------------

    /**
     * Union of two dirty sets. `all` wins over anything; the coordinate lists concatenate.
     *
     * No deduplication: `prepareRerender` builds lookup maps from these, so a repeated entry
     * costs one extra map assignment and nothing else. Deduplicating here would cost more
     * than it saves on the hot path.
     */
    mergeRerenders = (
        one?: RerenderInfo,
        two?: RerenderInfo,
    ): RerenderInfo | undefined => {
        if (!one && !two) {
            return undefined;
        }

        const {
            all = false,
            cells = [],
            rows = [],
            columns = [],
            fromRow,
        } = one || {};
        const {
            all: oldAll = false,
            cells: oldCells = [],
            rows: oldRows = [],
            columns: oldColumns = [],
            fromRow: oldFromRow,
        } = two || {};

        return {
            all: all || oldAll,
            cells: [...cells, ...oldCells],
            rows: [...rows, ...oldRows],
            columns: [...columns, ...oldColumns],
            fromRow:
                fromRow === undefined
                    ? oldFromRow
                    : oldFromRow === undefined
                      ? fromRow
                      : Math.min(fromRow, oldFromRow),
        };
    };

    /**
     * Queue a repaint of the named cells.
     *
     * Calls coalesce onto a microtask, so a burst of model changes in one tick produces one
     * recompute carrying the union of everything marked. `force` bypasses the queue and
     * recomputes synchronously.
     */
    update = (rerender?: RerenderInfo): void => {
        if (this._disposed) return;

        this.pendingRerender = this.mergeRerenders(rerender, this.pendingRerender);

        if (rerender && rerender.force) {
            this.updateRenderInfo();
        } else if (!this.updateScheduled) {
            this.updateScheduled = true;
            Promise.resolve().then(() => {
                this.updateScheduled = false;
                if (!this._disposed && this.pendingRerender) {
                    this.updateRenderInfo();
                }
            });
        }
    };

    // -----------------------------------------------------------------------
    // Recompute
    // -----------------------------------------------------------------------

    updateRenderInfo = (
        rerender?: RerenderInfo,
        direction?: RenderPoint,
        inRender?: boolean,
    ): void => {
        if (this._disposed) return;

        const {
            rowHeight = defaultRowHeight,
            columnWidth,
            renderCell,
            stickyTop,
            stickyLeft,
            stickyRight,
            stickyBottom,
            overscanColumn = defaultOverscanColumns,
            overscanRow,
            fitToWidth = false,
            onAdjustRenderRange,
        } = this.options;

        const mergedRerender = this.mergeRerenders(rerender, this.pendingRerender);

        // Guard against the initial-state trap: the initial
        // render info has an all-zero visibleOffset, so a *directional* call at offset (0,0)
        // would match it and return having rendered nothing, leaving the grid blank. Scrolling
        // back to the very top before anything has rendered would otherwise do exactly that.
        const safeDirection =
            this.renderInfo.current === renderInfoInitialState ? undefined : direction;

        const newInfo = calcRenderInfo(
            this.renderInfo.current,
            {
                rowCount: this.rowCount,
                columnCount: this.columnCount,
                rowHeight,
                columnWidth,
                renderCell,
                recycle: this.options.recycle,
                setReuseKey: this.options.setReuseKey,
                stickyTop: stickyTop ?? 0,
                stickyLeft: stickyLeft ?? 0,
                stickyRight: stickyRight ?? 0,
                stickyBottom: stickyBottom ?? 0,
                overscanColumn,
                overscanRow: overscanRow ?? 0,
                fitToWidth,
                size: {
                    width: this.size.width || 0,
                    height: this.size.height || 0,
                },
                offset: this.offset,
                scrollBarWidth: this.scrollBarWidth,
                scrollBarHeight: this.scrollBarHeight,
                rerender: mergedRerender,
                direction: safeDirection,
                onAdjustRenderRange,
            },
            this.options.whiteSpaceY,
            this.options.whiteSpaceX,
        );

        // The content extent may have shrunk below the current offset. Keep the user at the
        // nearest valid position instead of snapping to the top, then repaint that position.
        const maxOffsetY = Math.max(
            0,
            newInfo.innerSize.height - (this.size.height ?? 0) + this.scrollBarHeight,
        );
        if (this.offset.y > maxOffsetY) {
            this.offset.y = maxOffsetY;
            this.updateRenderInfo(rerender, direction, inRender);
            // The recursive recompute can run from a ResizeObserver path. Use the one permitted
            // scheduler so the DOM is painted from the clamped render info asynchronously.
            this.requestRepaint();
            return;
        }

        this.pendingRerender = undefined;

        // `calcRenderInfo` returns the identical object when there is nothing to do.
        if (newInfo !== this.renderInfo.current) {
            const oldInfo = this.renderInfo.current;
            this.renderInfo.ref(newInfo);
            void this.renderInfoChanged(inRender, oldInfo, newInfo);
        }
    };

    async renderInfoChanged(
        inRender: boolean | undefined,
        oldInfo: RenderInputPrepared,
        newInfo: RenderInputPrepared,
    ): Promise<void> {
        if (!inRender) this.requestRepaint();

        const container = await this.containerRef.async;

        // Painting may have introduced or removed a scrollbar, which changes the usable
        // viewport — repaint once more so the geometry settles.
        //
        // This runs on a microtask, i.e. *before* the paint it just requested, so on first open the
        // two thicknesses are still equal and this does nothing. The authoritative settle is
        // `VirtualGridView.settleScrollBar`, which compares after the paint and recomputes rather
        // than merely repainting — a repaint cannot fix per-cell widths. Kept because it still
        // catches a thickness change that happened between the recompute and this microtask.
        if (
            !this._disposed &&
            container &&
            (this.renderInfo.current.input.scrollBarWidth !== this.scrollBarWidth ||
                this.renderInfo.current.input.scrollBarHeight !== this.scrollBarHeight)
        ) {
            this.requestRepaint();
        }

        this.notifyChanges(oldInfo, newInfo);
    }

    notifyChanges(oldInfo: RenderInputPrepared, newInfo: RenderInputPrepared): void {
        if (
            this.options.onInnerSizeChange &&
            (oldInfo.innerSize.height !== newInfo.innerSize.height ||
                oldInfo.innerSize.width !== newInfo.innerSize.width)
        ) {
            this.options.onInnerSizeChange(newInfo.innerSize);
        }
    }

    // -----------------------------------------------------------------------
    // Scrolling
    // -----------------------------------------------------------------------

    onScroll = (e?: Event): void => {
        const container = this.containerRef.current;
        if (!container) return;
        if (e && e.currentTarget !== container) return;

        // Ignore scroll events fired while hidden — `display: none` resets scrollTop to 0,
        // and acting on that would lose the user's position.
        if (!container.offsetHeight && !container.offsetWidth) return;

        const { scrollLeft: x, scrollTop: y } = container;
        const direction = {
            x: x - this.offset.x,
            y: y - this.offset.y,
        };
        this.offset = { x, y };
        this.updateRenderInfo(undefined, direction);
    };

    async scrollTo(row: number, col: number): Promise<void> {
        const container = await this.containerRef.async;
        const info = await this.renderInfo.async;

        const newOffset = calcScrollOffset(row, col, info, this.offset);
        if (container) {
            container.scrollLeft = newOffset.x;
            container.scrollTop = newOffset.y;
        }
    }

    /**
     * Scroll `row` into view, or remember the request until the grid has a usable size.
     *
     * Awaiting `containerRef`/`renderInfo` is not enough on its own: `renderInfo.async` resolves on
     * the *first* computation, which for a grid built inside a popover that lays out later is the
     * one taken with a height of 0. `calcScrollOffsetY` then works from `visibleHeight = 0`, the
     * browser clamps the result, and nothing re-issues the scroll when the ResizeObserver finally
     * delivers the real size — the target row ends up pinned near the top with the selection off
     * screen. So an unmeasured request is queued and flushed from `onFrameResize`.
     *
     * The slot holds one request and is overwritten rather than appended, so a burst of requests
     * while unmeasured collapses to the newest and a stale row is discarded by construction.
     */
    async scrollToRow(row: number, rowAlign: RowAlign = "nearest"): Promise<void> {
        if (this._disposed) return;
        if (!this.measured) {
            this.pendingScrollRow = { row, align: rowAlign };
            return;
        }
        this.pendingScrollRow = undefined;

        const container = await this.containerRef.async;
        const info = await this.renderInfo.async;
        // Both awaits can resolve after teardown; writing scrollTop on a detached container is
        // harmless but pointless, and this is the guard the hosts' own `isLive` checks used to be.
        if (this._disposed) return;

        const newOffset = calcScrollOffsetY(row, info, this.offset, rowAlign);
        if (container) {
            container.scrollTop = newOffset.y;
        }
    }

    /**
     * Queue a scroll for the end of the next paint.
     *
     * Use this — not `scrollToRow` — when the caller has just changed the row set. `scrollTop` is
     * clamped to the scrollable extent, and the extent is `area.style.height`, which `applyLayout`
     * writes **inside** the next paint. Scrolling before that frame silently clamps to the old
     * extent: the list renders correctly and is simply scrolled to the wrong place, with nothing
     * re-issuing the request. A `setTimeout(0)` is not enough — it lands after the microtask that
     * recomputes `renderInfo` but before the animation frame that applies it.
     *
     * The caller must have scheduled a paint; `update()` always does. Shares the one-slot,
     * last-wins pending-scroll register with `scrollToRow`'s unmeasured fallback, and is drained by
     * the same `flushPendingScroll()` at the end of `paint()`.
     */
    scrollToRowAfterPaint(row: number, rowAlign: RowAlign = "nearest"): void {
        if (this._disposed) return;
        this.pendingScrollRow = { row, align: rowAlign };
    }

    async scrollToCol(col: number): Promise<void> {
        const container = await this.containerRef.async;
        const info = await this.renderInfo.async;

        const newOffset = calcScrollOffsetX(col, info, this.offset);
        if (container) {
            container.scrollLeft = newOffset.x;
        }
    }

    async scrollBy({ x = 0, y = 0 }: { x?: number; y?: number }): Promise<void> {
        const container = await this.containerRef.async;
        const info = await this.renderInfo.async;

        const maxOffsetX =
            info.innerSize.width - info.input.size.width + info.input.scrollBarWidth;
        const maxOffsetY =
            info.innerSize.height - info.input.size.height + info.input.scrollBarHeight;

        if (x !== 0 && container) {
            container.scrollLeft = Math.min(maxOffsetX, container.scrollLeft + x);
        }
        if (y !== 0 && container) {
            container.scrollTop = Math.min(maxOffsetY, container.scrollTop + y);
        }
    }
}

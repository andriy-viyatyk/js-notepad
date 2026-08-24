/**
 * The DOM shell — a rewrite of `uikit/RenderGrid/RenderGrid.tsx`, not a transliteration of it.
 *
 * Builds the scroll container, the inner sizer, and the nine render regions, then keeps their
 * children in sync with whatever `VirtualGridModel` most recently computed.
 *
 * Three things make the paint cheap:
 *
 * 1. **Cells are absolutely positioned, so DOM order is irrelevant.** Syncing a region is
 *    therefore pure set arithmetic — remove what left, append what arrived — with no reordering,
 *    no `insertBefore`, and no keyed reconciliation. A one-row scroll touches a handful of nodes
 *    regardless of how many are on screen.
 *
 * 2. **Evicted elements go to a `CellPool`** and are handed back to the next cell that needs one,
 *    so scrolling settles into allocating nothing at all. See `CellPool` for the reuse contract a
 *    cell renderer must honour — in particular, a recycled element keeps its listeners, so hosts
 *    delegate from the container rather than binding per row.
 *
 * 3. **One paint per frame, on `requestAnimationFrame`.** Scroll events and model changes both
 *    coalesce into it. The model has usually already decided there is nothing to do —
 *    `calcRenderInfo` returns the identical object — in which case the paint returns early.
 *
 * Styling here is deliberately limited to *structure*: sizes and offsets that follow from the
 * geometry. Appearance belongs to `VirtualGrid.css` or to the host's own stylesheet.
 */

import { VanillaView } from "../shared/vanilla-view";
import { CellPool, type CellPoolStats } from "./CellPool";
import { whiteSpace } from "./renderInfo";
import { VirtualGridModel, type VirtualGridOptions } from "./VirtualGridModel";
import type { RenderedCell, RenderInputPrepared } from "./types";
import "./VirtualGrid.css";

export interface VirtualGridProps extends VirtualGridOptions {
    /** Extra class on the root element, for host styling. */
    className?: string;
    /**
     * Explicit CSS height for the root element.
     *
     * The grid measures its own root to decide what is visible, so that height has to be
     * *definite* — a root whose height depends on its content has none, and the grid renders
     * nothing at all. Pass `"100%"` when the host has a height of its own.
     */
    height?: string;
    /** Cap the root's height and let it grow to its content below that, instead of filling. */
    growToHeight?: string;
    growToWidth?: string;
    /**
     * Receives the live view on mount and `null` on dispose — the way a React host or a story
     * reaches the imperative surface (`view.model.update(...)`, `view.stats`).
     *
     * A vanilla host does not need it: it owns the view through `this.child(...)` and reads
     * `view.model` directly. Changes to this prop after mount are ignored.
     */
    onView?: (view: VirtualGridView | null) => void;
    /**
     * Called after a rendered cell leaves the DOM and immediately before it enters the pool.
     * This is a general pool-entry notification; consumers may use it for their own retained
     * element bookkeeping.
     */
    onCellReleased?: (element: HTMLElement) => void;
}

const px = (n: number) => `${n}px`;

/** Write a style only when it actually differs — a redundant write can force layout. */
function setStyle(el: HTMLElement, prop: string, value: string): void {
    if (el.style.getPropertyValue(prop) !== value) {
        el.style.setProperty(prop, value);
    }
}

function div(part: string): HTMLDivElement {
    const el = document.createElement("div");
    el.dataset.part = part;
    return el;
}

/** The nine regions, in the order they are appended and synced. */
type RegionKey =
    | "cells"
    | "stickyTop"
    | "stickyBottom"
    | "stickyLeft"
    | "stickyRight"
    | "stickyTopLeft"
    | "stickyTopRight"
    | "stickyBottomLeft"
    | "stickyBottomRight";

/** Regions laid out as inline-flex, so `toggleRegion` restores the right display value. */
const INLINE_FLEX_REGIONS: ReadonlySet<RegionKey> = new Set<RegionKey>([
    "stickyLeft",
    "stickyRight",
    "stickyTopLeft",
    "stickyTopRight",
    "stickyBottomLeft",
    "stickyBottomRight",
]);

export interface VirtualGridStats {
    paints: number;
    cellsAppended: number;
    cellsRemoved: number;
    /** Wall time of the most recent paint, in milliseconds. */
    lastPaintMs: number;
    /** Cumulative paint time, so a measurement can average over a run. */
    totalPaintMs: number;
    pool: Readonly<CellPoolStats>;
}

export class VirtualGridView extends VanillaView<VirtualGridProps> {
    readonly model: VirtualGridModel;
    readonly pool = new CellPool();

    private container: HTMLDivElement | undefined;
    private area: HTMLDivElement | undefined;
    private regions: Record<RegionKey, HTMLDivElement> | undefined;

    /**
     * Cells currently attached to each region. Only ever holds cells this view appended, so the
     * sync can never remove a region's structural children — which is what makes `addOverlay`
     * safe against the paint.
     */
    private attached: Record<RegionKey, Set<HTMLElement>> | undefined;

    private rafId?: number;
    private paintScheduled = false;
    private inert = false;

    private lastInfo?: RenderInputPrepared;
    private lastScrollBarWidth = -1;
    private lastScrollBarHeight = -1;
    /** Consecutive scrollbar-settle recomputes requested — see `settleScrollBar`. */
    private scrollBarSettleAttempts = 0;

    private _stats = {
        paints: 0,
        cellsAppended: 0,
        cellsRemoved: 0,
        lastPaintMs: 0,
        totalPaintMs: 0,
    };

    /** The props the model was constructed from, so onMount can tell whether they moved on. */
    private modelProps: VirtualGridProps;

    public constructor(props: VirtualGridProps) {
        super(props, document.createElement("div"));
        this.root.dataset.type = "virtual-grid";
        this.modelProps = props;

        // The model is constructed here rather than in onMount because `attach()` is what binds
        // it to the DOM: a host may hold `view.model` and queue a `scrollToRow` before mount,
        // which `AsyncRef` is there to make work.
        // `recycle` is the view's half of the pooling contract: the geometry forwards it to every
        // `renderCell` call, and without it every cell scrolling into view costs a
        // `createElement` — the pool fills from the paint and is never drawn from. `pool.acquire`
        // is a bound field, so its identity is stable across updates.
        this.model = new VirtualGridModel(
            { ...props, recycle: this.pool.acquire },
            this.schedulePaint,
        );

        // Registration order is load-bearing: disposal runs these FIFO, so the scheduler is made
        // inert *before* the model is torn down and any repaint it requests on the way out lands
        // on a no-op.
        this.own(() => {
            this.inert = true;
            if (this.rafId !== undefined) {
                cancelAnimationFrame(this.rafId);
                this.rafId = undefined;
            }
        });
        this.own(() => this.model.dispose());
    }

    get stats(): VirtualGridStats {
        return { ...this._stats, pool: this.pool.stats };
    }

    /**
     * Attach an element that is not a cell — an add-row button, an empty-state message. Replaces
     * the React engine's `extraElement` / `extraElementTop` props.
     *
     * Safe against the paint because `syncRegion` only ever removes elements it appended itself:
     * `attached` holds exactly the pooled cells, so anything put here is invisible to the
     * reconciliation and is never recycled out from under its listeners.
     *
     * `"content"` sits in the scrolling area, below the last row and inside the trailing
     * whitespace; `"header"` sits in the sticky top band, which scrolls horizontally with the
     * columns but stays put vertically.
     *
     * Call it from `onMount()` onward — the regions do not exist before the view is mounted.
     */
    addOverlay(el: HTMLElement, region: "content" | "header" = "content"): void {
        const regions = this.regions;
        if (!regions) {
            throw new Error("VirtualGridView.addOverlay() must be called from mount() or later.");
        }
        regions[region === "header" ? "stickyTop" : "cells"].append(el);
    }

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    protected onMount(): void {
        this.buildDom();
        this.applyRootProps(this.props);
        this.applyStaticStyles();

        // update() before mount stores props without calling onUpdate, so the model can be holding
        // the options it was constructed with while the view is about to render newer ones.
        if (this.props !== this.modelProps) {
            this.model.setOptions({ ...this.props, recycle: this.pool.acquire });
        }

        this.listen(this.container, "scroll", this.model.onScroll, { passive: true });

        // The owner attached `root` before calling mount(), so `offsetWidth` is real here. This
        // measures, and requests a repaint through schedulePaint.
        this.model.attach({ grid: this.root, container: this.container });

        // Paint synchronously so the grid is on screen when mount() returns rather than a frame
        // later. paint() cancels the frame attach() just queued, so it is not spent on a no-op.
        this.paint();

        this.props.onView?.(this);
    }

    protected onUpdate(props: VirtualGridProps): void {
        // `className`, `height` and the growTo* values are consumed by the root/container styles,
        // which the donor only rebuilt at construction. With a full-props update they can change.
        this.applyRootProps(props);
        setStyle(this.root, "height", props.height ?? (props.growToHeight ? "unset" : "100px"));
        setStyle(this.root, "max-height", props.growToHeight ?? "unset");
        setStyle(this.container, "max-height", props.growToHeight ?? "unset");
        setStyle(this.container, "max-width", props.growToWidth ?? "unset");
        setStyle(this.container, "overflow-x", props.fitToWidth ? "hidden" : "auto");

        // A full replacement is not itself a change signal: setOptions merges and inputChanged()
        // then compares field by field. `renderCell` is compared by reference, though, so a host
        // that recreates it on every update rebuilds every visible cell — keep it stable and
        // signal data changes with model.update() instead.
        this.modelProps = props;
        this.model.setOptions({ ...props, recycle: this.pool.acquire });
    }

    protected onDispose(): void {
        // The scheduler was already made inert and the pending frame cancelled by the first
        // registered cleanup; this phase only releases retained DOM.
        this.pool.clear();
        for (const key of Object.keys(this.attached) as RegionKey[]) {
            this.attached[key].clear();
        }
        this.lastInfo = undefined;

        this.props.onView?.(null);
    }

    private buildDom(): void {
        this.container = div("scroll");
        // Focusable so keyboard navigation has somewhere to land, but not in the tab order.
        this.container.tabIndex = -1;
        // The global hover-reveal scrollbar treatment (theme/GlobalStyles.tsx).
        this.container.classList.add("scroll-container");

        this.area = div("area");

        this.regions = {
            cells: this.area,
            stickyTop: div("sticky-top"),
            stickyBottom: div("sticky-bottom"),
            stickyLeft: div("sticky-left"),
            stickyRight: div("sticky-right"),
            stickyTopLeft: div("sticky-top-left"),
            stickyTopRight: div("sticky-top-right"),
            stickyBottomLeft: div("sticky-bottom-left"),
            stickyBottomRight: div("sticky-bottom-right"),
        };

        this.attached = {
            cells: new Set(),
            stickyTop: new Set(),
            stickyBottom: new Set(),
            stickyLeft: new Set(),
            stickyRight: new Set(),
            stickyTopLeft: new Set(),
            stickyTopRight: new Set(),
            stickyBottomLeft: new Set(),
            stickyBottomRight: new Set(),
        };

        // Corners nest inside their band, matching the React engine's stacking.
        this.regions.stickyTop.append(
            this.regions.stickyTopLeft,
            this.regions.stickyTopRight,
        );
        this.regions.stickyBottom.append(
            this.regions.stickyBottomLeft,
            this.regions.stickyBottomRight,
        );
        this.area.append(
            this.regions.stickyTop,
            this.regions.stickyBottom,
            this.regions.stickyLeft,
            this.regions.stickyRight,
        );
        this.container.append(this.area);
        this.root.append(this.container);
    }

    private applyRootProps(props: VirtualGridProps): void {
        if (props.name) {
            this.root.dataset.name = props.name;
        } else {
            delete this.root.dataset.name;
        }
        this.root.className = props.className ?? "";
    }

    // -----------------------------------------------------------------------
    // Paint scheduling
    // -----------------------------------------------------------------------

    /**
     * The model's repaint signal. Bound as a field because it is handed to the model as a bare
     * function, and it may only ever *schedule* — never paint synchronously, since the model
     * calls it from a `ResizeObserver` callback.
     */
    private schedulePaint = (): void => {
        if (this.inert || this.paintScheduled) return;
        this.paintScheduled = true;
        this.rafId = requestAnimationFrame(() => {
            this.rafId = undefined;
            this.paintScheduled = false;
            this.paint();
        });
    };

    // -----------------------------------------------------------------------
    // Paint
    // -----------------------------------------------------------------------

    private paint(): void {
        if (this.inert) return;
        if (!this.container || !this.area || !this.regions || !this.attached) return;

        // A synchronous paint satisfies any frame already queued.
        if (this.rafId !== undefined) {
            cancelAnimationFrame(this.rafId);
            this.rafId = undefined;
            this.paintScheduled = false;
        }

        const info = this.model.renderInfo.current;
        const scrollBarWidth = this.model.scrollBarWidth;
        const scrollBarHeight = this.model.scrollBarHeight;

        // The model hands back the identical object when nothing changed. Scrollbar thickness is
        // checked too, because it can appear after a paint without the geometry itself moving.
        if (
            info === this.lastInfo &&
            scrollBarWidth === this.lastScrollBarWidth &&
            scrollBarHeight === this.lastScrollBarHeight
        ) {
            // Nothing to draw, but the container may have just become scrollable — and a queued
            // scroll must not wait for a geometry change that may never come.
            this.model.flushPendingScroll();
            return;
        }

        this.lastInfo = info;
        this.lastScrollBarWidth = scrollBarWidth;
        this.lastScrollBarHeight = scrollBarHeight;
        this._stats.paints++;

        const startedAt = performance.now();

        this.applyLayout(info, scrollBarWidth, scrollBarHeight);

        this.syncRegion("cells", info.cells);
        this.syncRegion("stickyTop", info.stickyTop);
        this.syncRegion("stickyBottom", info.stickyBottom);
        this.syncRegion("stickyLeft", info.stickyLeft);
        this.syncRegion("stickyRight", info.stickyRight);
        this.syncRegion("stickyTopLeft", info.stickyTopLeft);
        this.syncRegion("stickyTopRight", info.stickyTopRight);
        this.syncRegion("stickyBottomLeft", info.stickyBottomLeft);
        this.syncRegion("stickyBottomRight", info.stickyBottomRight);

        // Hiding the container resets its scrollTop to 0 while the model keeps the real offset;
        // put it back once the content is there to scroll. Only then — a container whose position
        // merely differs from the model's is a container the user has just scrolled, whose event
        // has not been delivered yet, and writing our offset back there undoes the scroll. See
        // VirtualGridModel.restoreScroll.
        if (this.model.scrollNeedsRestore) {
            this.model.restoreScroll();
        }

        // A `scrollToRow` issued before the grid could be measured runs here, where the container
        // is known to be live — see VirtualGridModel.flushPendingScroll.
        this.model.flushPendingScroll();

        this.settleScrollBar(info);

        this._stats.lastPaintMs = performance.now() - startedAt;
        this._stats.totalPaintMs += this._stats.lastPaintMs;
    }

    /**
     * Recompute once when this paint changed whether the container has a scrollbar.
     *
     * The geometry has to be computed *before* the paint, but the scrollbar only exists *after* it:
     * the first paint is what makes the area taller than the container. So the first computation
     * necessarily runs with `scrollBarWidth: 0`, lays every cell out at the container's full width,
     * and leaves the last few pixels of each row — the trailing slot — underneath the scrollbar that
     * then appears. The visible symptom is a selected row whose check icon is clipped on the right,
     * which "fixes itself" the moment any unrelated prop change forces a recompute.
     *
     * This cannot be a repaint: `applyLayout` would pick up the new thickness, but the per-cell
     * widths live in `info.cells`, which was computed with the old one. It has to be a recompute,
     * and it has to happen here rather than in `VirtualGridModel.renderInfoChanged` — that runs on a
     * microtask, i.e. before the paint that creates the scrollbar, so it compares two values that
     * are still equal and does nothing.
     *
     * `update()` coalesces onto a microtask, so the settle costs one extra recompute and one extra
     * paint on first open and nothing thereafter. The attempt counter is a backstop against a
     * pathological layout that oscillates between needing and not needing a scrollbar; fixed-height
     * rows cannot, but a future variable-height host could.
     */
    private settleScrollBar(info: RenderInputPrepared): void {
        const settled =
            info.input.scrollBarWidth === this.model.scrollBarWidth &&
            info.input.scrollBarHeight === this.model.scrollBarHeight;

        if (settled) {
            this.scrollBarSettleAttempts = 0;
            return;
        }
        if (this.scrollBarSettleAttempts >= 2) return;

        this.scrollBarSettleAttempts++;
        this.model.update({ all: true });
    }

    /** Zero the counters, so a measurement can cover one phase in isolation. */
    resetStats(): void {
        this._stats = {
            paints: 0,
            cellsAppended: 0,
            cellsRemoved: 0,
            lastPaintMs: 0,
            totalPaintMs: 0,
        };
        this.pool.resetStats();
    }

    /**
     * Reconcile one region's children against the cells the geometry produced.
     *
     * Set arithmetic, not diffing: absolute positioning means order carries no meaning, so an
     * element that stays on screen is never touched even if its neighbours change.
     */
    private syncRegion(key: RegionKey, cells: Array<RenderedCell>): void {
        const parent = this.regions[key];
        const prev = this.attached[key];

        const next = new Set<HTMLElement>();
        for (const cell of cells) {
            if (cell) next.add(cell);
        }

        for (const el of prev) {
            if (!next.has(el)) {
                parent.removeChild(el);
                this.props.onCellReleased?.(el);
                this.pool.release(el);
                this._stats.cellsRemoved++;
            }
        }

        for (const el of next) {
            if (!prev.has(el)) {
                parent.append(el);
                this._stats.cellsAppended++;
            }
        }

        this.attached[key] = next;
    }

    // -----------------------------------------------------------------------
    // Styling
    // -----------------------------------------------------------------------

    /** Structure that never changes. Appearance is `VirtualGrid.css`'s business, not this file's. */
    private applyStaticStyles(): void {
        const { growToHeight, growToWidth } = this.props;

        setStyle(this.root, "flex", "1 1 auto");
        setStyle(this.root, "position", "relative");
        setStyle(this.root, "overflow", "hidden");
        setStyle(
            this.root,
            "height",
            this.props.height ?? (growToHeight ? "unset" : "100px"),
        );
        setStyle(this.root, "max-height", growToHeight ?? "unset");

        setStyle(this.container, "overflow-y", "auto");
        setStyle(this.container, "overflow-x", this.props.fitToWidth ? "hidden" : "auto");
        setStyle(this.container, "outline", "none");
        // Scroll anchoring off, on both the scroller and the content it scrolls.
        //
        // Chromium picks a node near the top of the viewport and keeps *it* still when content
        // above it changes size — which in a virtualized list is every frame, because the rows
        // above the viewport are the ones being recycled away. The browser then "corrects" the
        // scroll position back, silently undoing part of the user's scroll: a list that moves
        // every other frame and shows a blank band in between. Found in a filter popover with
        // 100,000 options; the fix belongs here, where every grid gets it.
        setStyle(this.container, "overflow-anchor", "none");
        setStyle(this.area, "overflow-anchor", "none");
        setStyle(this.container, "max-height", growToHeight ?? "unset");
        setStyle(this.container, "max-width", growToWidth ?? "unset");

        setStyle(this.area, "position", "relative");

        for (const key of ["stickyTop", "stickyBottom"] as const) {
            setStyle(this.regions[key], "position", "sticky");
            setStyle(this.regions[key], "z-index", "2");
        }
        for (const key of ["stickyLeft", "stickyRight"] as const) {
            setStyle(this.regions[key], "position", "sticky");
            setStyle(this.regions[key], "display", "inline-flex");
            setStyle(this.regions[key], "z-index", "1");
        }
        for (const key of [
            "stickyTopLeft",
            "stickyTopRight",
            "stickyBottomLeft",
            "stickyBottomRight",
        ] as const) {
            setStyle(this.regions[key], "position", "sticky");
            setStyle(this.regions[key], "display", "inline-flex");
            setStyle(this.regions[key], "z-index", "3");
        }
    }

    /** Sizes and offsets that follow from the current geometry. */
    private applyLayout(
        info: RenderInputPrepared,
        scrollBarWidth: number,
        scrollBarHeight: number,
    ): void {
        const { innerSize } = info;
        const opts = this.model.getOptions();
        const width = this.model.size.width ?? 0;
        const height = this.model.size.height ?? 0;

        const { growToHeight, growToWidth } = this.props;
        setStyle(this.container, "width", growToWidth ? "unset" : px(width));
        setStyle(this.container, "height", growToHeight ? "unset" : px(height));

        setStyle(this.area, "width", px(innerSize.width));
        setStyle(this.area, "height", px(innerSize.height));

        // The right-hand bands sit at the viewport's right edge, inside the scrollbar.
        const rightLeft = px(width - innerSize.stickyRightWidth - scrollBarWidth);

        this.toggleRegion("stickyTop", Boolean(opts.stickyTop));
        if (opts.stickyTop) {
            const el = this.regions.stickyTop;
            setStyle(el, "top", "0px");
            setStyle(el, "width", px(innerSize.width));
            setStyle(el, "height", px(innerSize.stickyTopHeight));
        }

        this.toggleRegion("stickyTopLeft", Boolean(opts.stickyTop && opts.stickyLeft));
        if (opts.stickyTop && opts.stickyLeft) {
            const el = this.regions.stickyTopLeft;
            setStyle(el, "left", "0px");
            setStyle(el, "width", px(innerSize.stickyLeftWidth));
            setStyle(el, "height", px(innerSize.stickyTopHeight));
        }

        this.toggleRegion("stickyTopRight", Boolean(opts.stickyTop && opts.stickyRight));
        if (opts.stickyTop && opts.stickyRight) {
            const el = this.regions.stickyTopRight;
            setStyle(el, "left", rightLeft);
            setStyle(el, "width", px(innerSize.stickyRightWidth));
            setStyle(el, "height", px(innerSize.stickyTopHeight));
        }

        this.toggleRegion("stickyBottom", Boolean(opts.stickyBottom));
        if (opts.stickyBottom) {
            const el = this.regions.stickyBottom;
            setStyle(
                el,
                "top",
                px(height - innerSize.stickyBottomHeight - scrollBarHeight),
            );
            setStyle(el, "width", px(innerSize.width));
            setStyle(el, "height", px(innerSize.stickyBottomHeight));
        }

        this.toggleRegion(
            "stickyBottomLeft",
            Boolean(opts.stickyBottom && opts.stickyLeft),
        );
        if (opts.stickyBottom && opts.stickyLeft) {
            const el = this.regions.stickyBottomLeft;
            setStyle(el, "left", "0px");
            setStyle(el, "width", px(innerSize.stickyLeftWidth));
            setStyle(el, "height", px(innerSize.stickyBottomHeight));
        }

        this.toggleRegion(
            "stickyBottomRight",
            Boolean(opts.stickyBottom && opts.stickyRight),
        );
        if (opts.stickyBottom && opts.stickyRight) {
            const el = this.regions.stickyBottomRight;
            setStyle(el, "left", rightLeft);
            setStyle(el, "width", px(innerSize.stickyRightWidth));
            setStyle(el, "height", px(innerSize.stickyBottomHeight));
        }

        this.toggleRegion("stickyLeft", Boolean(opts.stickyLeft));
        if (opts.stickyLeft) {
            const el = this.regions.stickyLeft;
            setStyle(el, "left", "0px");
            setStyle(el, "width", px(innerSize.stickyLeftWidth));
            // Falls back to the trailing whitespace when there is no bottom band. The right-hand
            // band does not do this; the asymmetry is the React engine's.
            setStyle(
                el,
                "height",
                px(
                    innerSize.height -
                        (innerSize.stickyTopHeight +
                            (innerSize.stickyBottomHeight || whiteSpace)),
                ),
            );
            setStyle(el, "transform", `translate(0, -${innerSize.stickyBottomHeight}px)`);
        }

        this.toggleRegion("stickyRight", Boolean(opts.stickyRight));
        if (opts.stickyRight) {
            const el = this.regions.stickyRight;
            setStyle(el, "left", rightLeft);
            setStyle(el, "width", px(innerSize.stickyRightWidth));
            setStyle(
                el,
                "height",
                px(
                    innerSize.height -
                        (innerSize.stickyTopHeight + innerSize.stickyBottomHeight),
                ),
            );
            setStyle(el, "transform", `translate(0, -${innerSize.stickyBottomHeight}px)`);
        }
    }

    private toggleRegion(key: RegionKey, visible: boolean): void {
        setStyle(
            this.regions[key],
            "display",
            visible ? (INLINE_FLEX_REGIONS.has(key) ? "inline-flex" : "block") : "none",
        );
    }
}

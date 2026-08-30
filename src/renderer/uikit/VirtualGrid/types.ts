/**
 * Types for the VirtualGrid DOM contract.
 *
 * A cell renderer returns an HTMLElement and receives the exact positioned CellStyle produced by
 * the geometry layer. The shell owns element references, while the model and render arithmetic
 * communicate through these plain data structures.
 */

/** What a cell renderer produces. `undefined` means "render nothing in this slot". */
export type RenderedCell = HTMLElement | undefined;

export type RenderInfoObject = { [key: number]: boolean };
export type RenderCellKey = `${number}_${number}`;
export type RenderInfoCellObject = { [key in RenderCellKey]?: boolean };
export type RenderRange = { rows: number[]; columns: number[] };

export type RenderCell = { row: number; col: number };
export type RenderPoint = { x: number; y: number };
export type RenderSize = { width: number; height: number };
export type RenderSizeOptional = {
    width: number | undefined;
    height: number | undefined;
};
export type Percent = `${number}%`;
export type ElementLength = number | ((v: number) => number | Percent);
export type RenderCellMap = { [key in RenderCellKey]?: RenderedCell };
export type RowAlign = "top" | "center" | "bottom" | "nearest";

export type RenderRect = {
    top: number;
    right: number;
    bottom: number;
    left: number;
};

/** A uniform length for every element, or a per-element array of lengths. */
export type RenderLength = number | Array<number>;

export type AdjustRenderRangeFunc = (r: RenderRect) => void;

/** Absolute positioning for one cell, in pixels. Produced by `renderInfo.ts`. */
export interface CellStyle {
    display: "inline-flex";
    position: "absolute";
    left: number;
    top: number;
    width: number;
    height: number;
}

/** `RerenderInfo` expanded into lookup maps, so the paint loop can test membership in O(1). */
export interface RerenderInfoPrepared {
    all: boolean;
    rows: RenderInfoObject;
    columns: RenderInfoObject;
    cells: RenderInfoCellObject;
}

/**
 * The dirty set — the single most important type in the library.
 *
 * A change reports *only the cells whose rendered output actually changed*. Growing a range
 * selection by one cell must produce `{ cells: [thatCell, theCellThatLostIt] }`, never
 * `{ rows: [...] }` and never `{ all: true }`. Every performance claim this project makes
 * rests on that discipline being kept everywhere a `RerenderInfo` is constructed.
 */
export interface RerenderInfo {
    all?: boolean;
    rows?: Array<number>;
    /** Every row at or after this row moved because a row above it changed height. */
    fromRow?: number;
    columns?: Array<number>;
    cells?: Array<RenderCell>;
    /** Repaint even where the engine believes nothing changed. Escape hatch; use sparingly. */
    force?: boolean;
}

/**
 * The model surface shared by the imperative and DOM grid engines. `fromRow` is a geometry
 * invalidation, not a content invalidation.
 */
export interface GridModelCapability {
    update(rerender?: RerenderInfo): void;
    scrollToRow(row: number, rowAlign?: RowAlign): Promise<void>;
}

export interface RenderedRange {
    visible: RenderRect;
    rendered: RenderRect;
    visibleOffset?: RenderRect;
}

export interface RenderInnerSize {
    width: number;
    height: number;
    stickyTopHeight: number;
    stickyRightWidth: number;
    stickyBottomHeight: number;
    stickyLeftWidth: number;
}

export interface RenderInput {
    size: RenderSize;
    rowCount: number;
    columnCount: number;
    stickyTop: number;
    stickyRight: number;
    stickyBottom: number;
    stickyLeft: number;
    scrollBarWidth: number;
    scrollBarHeight: number;
    fitToWidth: boolean;
}

/**
 * The computed window: which rows and columns are visible, where each one sits, and the
 * rendered cells for every region. The nine cell arrays are the centre plus the four sticky
 * bands plus the four corners.
 */
export interface RenderInputPrepared {
    visible: RenderRect;
    rendered: RenderRect;
    visibleOffset?: RenderRect;
    innerSize: RenderInnerSize;
    columnLength: RenderLength;
    rowLength: RenderLength;
    columnStarts: RenderLength;
    rowStarts: RenderLength;

    input: RenderInput;

    cells: Array<RenderedCell>;
    stickyTop: Array<RenderedCell>;
    stickyLeft: Array<RenderedCell>;
    stickyRight: Array<RenderedCell>;
    stickyBottom: Array<RenderedCell>;
    stickyTopLeft: Array<RenderedCell>;
    stickyTopRight: Array<RenderedCell>;
    stickyBottomRight: Array<RenderedCell>;
    stickyBottomLeft: Array<RenderedCell>;
    map: RenderCellMap;
    renderRange: RenderRange;
}

/**
 * Hands back an element that scrolled out of the window on an earlier frame, or `undefined`
 * when no compatible element is available. The element may remain attached to the grid while
 * hidden, so consumers must not infer admission from DOM membership.
 *
 * The element arrives in **whatever state its previous occupant left it** — same children,
 * classes, attributes and listeners. That is deliberate: reusing the inner structure is most
 * of the saving. A cell renderer that recycles must therefore overwrite everything it sets.
 */
/** Opaque consumer-owned identity used to keep incompatible cell contents apart. */
export type CellReuseKey = unknown;

export type RecycleFunc = (reuseKey?: CellReuseKey) => HTMLElement | undefined;
export type SetReuseKeyFunc = (element: HTMLElement, reuseKey?: CellReuseKey) => void;

export interface RenderCellParams {
    col: number;
    row: number;
    style: CellStyle;
    key: RenderCellKey;
    renderInfo: RenderInputPrepared;
    /** Present when a cell pool is attached. See `RecycleFunc`. */
    recycle?: RecycleFunc;
    /** Records the consumer's compatibility key for a newly admitted or created cell. */
    setReuseKey?: SetReuseKeyFunc;
    /**
     * The element already rendered at this coordinate, when there is one — i.e. the cell is
     * being re-rendered because it went dirty, not because it just scrolled into view.
     *
     * **Prefer this over `recycle()`.** Updating it in place means the shell sees the same
     * element before and after, so the paint does no DOM insertion or removal at all, and
     * anything living on the element survives — focus, an open editor, a running transition.
     * Swapping in a pooled element instead would destroy all three.
     *
     * The usual shape is:
     * `const el = p.previous ?? p.recycle?.() ?? document.createElement("div");`
     */
    previous?: HTMLElement;
}

export type RenderCellFunc = (p: RenderCellParams) => RenderedCell;

export interface RenderData {
    renderCell: RenderCellFunc;
    recycle?: RecycleFunc;
    setReuseKey?: SetReuseKeyFunc;
    old: RenderInputPrepared;
    newInfo: RenderInputPrepared;
    rerender: RerenderInfoPrepared | null;
    rowLength: RenderLength;
    columnLength: RenderLength;
    rowStarts: RenderLength;
    columnStarts: RenderLength;
}

export interface CalcRenderInfoInput {
    offset: RenderPoint;
    size: RenderSize;
    rowCount: number;
    columnCount: number;
    rowHeight: ElementLength;
    columnWidth: ElementLength;
    renderCell: RenderCellFunc;
    /** Forwarded verbatim to every `renderCell` call. The geometry never calls it itself. */
    recycle?: RecycleFunc;
    /** Forwarded verbatim to every `renderCell` call. The geometry never calls it itself. */
    setReuseKey?: SetReuseKeyFunc;
    stickyTop: number;
    stickyLeft: number;
    stickyRight: number;
    stickyBottom: number;
    overscanColumn: number;
    overscanRow: number;
    scrollBarWidth: number;
    scrollBarHeight: number;
    direction?: RenderPoint;
    fitToWidth: boolean;
    onAdjustRenderRange?: AdjustRenderRangeFunc;
    rerender?: RerenderInfo;
}

/**
 * Visible-window geometry — the virtualization engine's arithmetic.
 *
 * Ported from `uikit/RenderGrid/renderInfo.ts` nearly as-is. Pure computation: given a scroll
 * offset, a viewport size, and per-axis lengths, it works out which rows and columns are on
 * screen, where each cell sits, and which of them actually need re-rendering. There is no DOM
 * access anywhere in this file — cells are produced by the injected `renderCell` callback,
 * whose return type is the only thing that changed in the port (`ReactNode` → `HTMLElement`).
 *
 * Two mechanisms here carry the performance story, and both are easy to break by accident:
 *
 * 1. **`calcRenderInfo` returns `old` unchanged when nothing needs repainting.** There are
 *    two such early exits — the `visibleOffset` band check, and the containment check after
 *    `prepareRerender`. They are what make a scroll frame that stays within already-rendered
 *    territory cost nothing at all.
 *
 * 2. **`_renderCell` reuses the previously rendered cell** unless the dirty set names it.
 *    Growing a range selection by one cell re-runs `renderCell` for that cell and its former
 *    neighbour; every other cell in the window is carried over by reference.
 *
 * Dropped in the port: `RenderInfoProto` and its `calcExpandWidth` / `calcExpandHeight`
 * methods, which were attached to every render-info object via `Object.setPrototypeOf` and
 * never called anywhere in the app. Removing them also removes a prototype mutation on a
 * hot object.
 */

import { prepareRerender } from "./rerender-check";
import type {
    AdjustRenderRangeFunc,
    CalcRenderInfoInput,
    ElementLength,
    Percent,
    RenderCellKey,
    RenderData,
    RenderedRange,
    RenderInnerSize,
    RenderInputPrepared,
    RenderLength,
    RenderPoint,
    RenderRect,
    RenderSize,
    RerenderInfoPrepared,
    RowAlign,
} from "./types";

export const renderInfoInitialState: RenderInputPrepared = {
    visible: { top: 0, right: 0, bottom: 0, left: 0 },
    rendered: { top: 0, right: 0, bottom: 0, left: 0 },
    visibleOffset: { top: 0, right: 0, bottom: 0, left: 0 },
    innerSize: {
        width: 0,
        height: 0,
        stickyTopHeight: 0,
        stickyRightWidth: 0,
        stickyBottomHeight: 0,
        stickyLeftWidth: 0,
    },
    columnLength: [],
    rowLength: [],
    columnStarts: [],
    rowStarts: [],
    input: {
        size: { width: 0, height: 0 },
        rowCount: 0,
        columnCount: 0,
        stickyTop: 0,
        stickyRight: 0,
        stickyBottom: 0,
        stickyLeft: 0,
        scrollBarWidth: 0,
        scrollBarHeight: 0,
        fitToWidth: false,
    },

    cells: [],
    stickyTop: [],
    stickyLeft: [],
    stickyRight: [],
    stickyBottom: [],
    stickyTopLeft: [],
    stickyTopRight: [],
    stickyBottomRight: [],
    stickyBottomLeft: [],
    map: {},
    renderRange: {
        rows: [],
        columns: [],
    },
};

/** Slack past the last row/column, so the final element can scroll clear of the edge. */
export const whiteSpace = 20;

function fromPercent(val: Percent) {
    return Number(val.substring(0, val.length - 1));
}

/**
 * Resolve percentage lengths against the available space. Fixed (numeric) lengths are taken
 * out first; what remains is divided across the percentage entries, with the last one
 * absorbing the rounding remainder so the total lands exactly on `length`.
 */
function doFitToLength(arr: Array<number | Percent>, length: number) {
    const fixedWidth = arr.reduce<number>((acc: number, item) => {
        return acc + (typeof item === "number" ? item : 0);
    }, 0);
    const totalPercent = arr.reduce<number>((acc: number, item) => {
        return acc + (typeof item === "string" ? fromPercent(item) : 0);
    }, 0);
    const lastPercentIndex = arr.reduce((acc, item, idx) => {
        return typeof item === "string" ? idx : acc;
    }, -1);
    let divideWidth = Math.max(0, length - fixedWidth);
    const widthPerPercent = totalPercent > 0 ? divideWidth / totalPercent : 0;

    return arr.map((item, idx) => {
        if (typeof item === "string") {
            if (idx === lastPercentIndex) {
                return divideWidth;
            }
            const width = Math.trunc(fromPercent(item) * widthPerPercent);
            divideWidth = Math.max(0, divideWidth - width);
            return width;
        }
        return item;
    });
}

/**
 * Build the per-element length array — or return the single number unchanged, which is the
 * fast path: a uniform row height means every offset is a multiplication rather than an
 * array lookup, and no 100,000-entry array is allocated.
 */
export function buildLengthArray(
    elementCount: number,
    elementLength: ElementLength,
    fitToLength = false,
    length = 0,
): RenderLength {
    if (typeof elementLength === "number") {
        return elementLength;
    }
    const res = Array.from({ length: elementCount }, (_v, i) => elementLength(i));

    if (
        Array.isArray(res) &&
        (fitToLength || res.some((i) => typeof i === "string"))
    ) {
        return doFitToLength(res, length);
    }

    return res as Array<number>;
}

/**
 * Does any element ask for a percentage length?
 *
 * A percentage means "fill the space available", so its presence puts `buildLengthArray` on the
 * fit path whether or not `fitToWidth` asked for it — and a fitted set of columns already lands
 * exactly on the viewport width, so it must not carry the trailing slack `calcInnerSize` adds.
 * Without this a single `width: "35%"` column produced a horizontal scrollbar exactly
 * `whiteSpace` wide, on a grid whose columns fit perfectly.
 *
 * One extra pass over the *columns* — tens of them, and never the rows, which cannot be
 * percentages of anything.
 */
export function hasPercentLength(
    elementCount: number,
    elementLength: ElementLength,
): boolean {
    if (typeof elementLength === "number") return false;
    for (let i = 0; i < elementCount; i++) {
        if (typeof elementLength(i) === "string") return true;
    }
    return false;
}

/** Running start offset for each element. A uniform length needs no array at all. */
export function buildStarts(length: RenderLength): RenderLength {
    if (typeof length === "number") {
        return length;
    }

    const starts = [...length];
    starts.forEach((_, i) => {
        starts[i] = i === 0 ? 0 : starts[i - 1] + length[i - 1];
    });

    return starts;
}

function calcLength(length: RenderLength, from: number, count = 1) {
    if (typeof length === "number") {
        return count * length;
    }

    let res = 0;
    for (let i = from; i < from + count; i++) {
        res += length[i];
    }
    return res;
}

function getLength(length: RenderLength, elementIndex: number) {
    return typeof length === "number" ? length : length[elementIndex];
}

function getStarts(starts: RenderLength, elementIndex: number) {
    if (typeof starts === "number") {
        return elementIndex * starts;
    }
    return starts[elementIndex];
}

/** Index of the element occupying position `x`. O(1) for uniform lengths. */
function elementAt(length: RenderLength, x: number, lastByDefault = true) {
    if (typeof length === "number") {
        return Math.trunc(x / length);
    }

    let res = lastByDefault ? length.length - 1 : -1;
    let sum = 0;
    for (let i = 0; i < length.length; i++) {
        sum += length[i];
        if (sum > x) {
            res = i;
            break;
        }
    }
    return res;
}

export const calcInnerSize = (
    rowCount: number,
    columnCount: number,
    stickyTop: number,
    stickyRight: number,
    stickyBottom: number,
    stickyLeft: number,
    columnLength: RenderLength,
    rowLength: RenderLength,
    /**
     * The columns were fitted to the viewport — `fitToWidth`, or a percentage width, which
     * fits on its own. Either way they already total the usable width, so the trailing slack
     * would be pure overflow. See `hasPercentLength`.
     */
    columnsFitted: boolean,
    whiteSpaceY?: number,
    whiteSpaceX?: number,
): RenderInnerSize => ({
    width:
        calcLength(columnLength, 0, columnCount) +
        (stickyRight || columnsFitted ? 0 : (whiteSpaceX ?? whiteSpace)),
    height:
        calcLength(rowLength, 0, rowCount) +
        (stickyBottom ? 0 : (whiteSpaceY ?? whiteSpace)),
    stickyTopHeight: calcLength(rowLength, 0, stickyTop),
    stickyRightWidth: calcLength(
        columnLength,
        columnCount - stickyRight,
        stickyRight,
    ),
    stickyBottomHeight: calcLength(rowLength, rowCount - stickyBottom, stickyBottom),
    stickyLeftWidth: calcLength(columnLength, 0, stickyLeft),
});

/**
 * Which cells are visible, and which are rendered.
 *
 * `rendered` extends `visible` by the overscan, but **only in the direction of travel** —
 * scrolling down pre-renders rows below, not above. Overscanning both ways would double the
 * work for no benefit.
 */
export function calcCellRange(
    innerSize: RenderInnerSize,
    rowCount: number,
    columnCount: number,
    width: number,
    height: number,
    offset: RenderPoint,
    overscanColumn: number,
    overscanRow: number,
    direction: RenderPoint,
    columnLength: RenderLength,
    rowLength: RenderLength,
    scrollBarWidth: number,
    scrollBarHeight: number,
    onAdjustRenderRange?: AdjustRenderRangeFunc,
): RenderedRange {
    let left = elementAt(columnLength, offset.x + innerSize.stickyLeftWidth);
    // The sticky-right band may be transparent, so columns underneath it are still rendered:
    // the right edge is not reduced by stickyRightWidth.
    let right = elementAt(columnLength, offset.x + width - scrollBarWidth);
    left = Math.max(0, left);
    right = Math.min(right, columnCount - 1);

    let top = elementAt(rowLength, offset.y + innerSize.stickyTopHeight);
    let bottom = elementAt(
        rowLength,
        offset.y + height - innerSize.stickyBottomHeight - scrollBarHeight,
    );
    top = Math.max(0, top);
    bottom = Math.min(bottom, rowCount - 1);

    const rendered = {
        top: direction.y < 0 ? Math.max(0, top - overscanRow) : top,
        right:
            direction.x > 0
                ? Math.min(columnCount - 1, right + overscanColumn)
                : right,
        bottom:
            direction.y > 0 ? Math.min(rowCount - 1, bottom + overscanRow) : bottom,
        left: direction.x < 0 ? Math.max(0, left - overscanColumn) : left,
    };

    if (onAdjustRenderRange) {
        onAdjustRenderRange(rendered);
    }

    return {
        visible: { top, right, bottom, left },
        rendered,
    };
}

/**
 * The band of scroll offsets over which the current render stays valid.
 *
 * `calcRenderInfo` compares the incoming offset against this and bails out immediately when
 * it falls inside — which is the common case while scrolling, and the reason a scroll frame
 * is usually free.
 */
export const calcOffsetRange = (
    cellsRange: RenderRect,
    rowLength: RenderLength,
    columnLength: RenderLength,
    rowStarts: RenderLength,
    columnStarts: RenderLength,
    size: RenderSize,
    innerSize: RenderInnerSize,
    scrollBarWidth: number,
    scrollBarHeight: number,
): RenderRect => ({
    left: getStarts(columnStarts, cellsRange.left) - innerSize.stickyLeftWidth,
    right:
        calcLength(columnLength, 0, cellsRange.right + 1) -
        (size.width - innerSize.stickyRightWidth - scrollBarWidth),
    top: getStarts(rowStarts, cellsRange.top) - innerSize.stickyTopHeight,
    bottom:
        calcLength(rowLength, 0, cellsRange.bottom + 1) -
        (size.height - innerSize.stickyBottomHeight - scrollBarHeight),
});

/**
 * Produce one cell — or, far more often, hand back the one produced last time.
 *
 * `renderCell` runs only when there is no previous cell for this coordinate, or when the
 * dirty set names the cell, its row, or its column. This single condition is what keeps a
 * range-selection drag proportional to the cells whose selection state changed rather than
 * to the size of the viewport.
 */
const _renderCell = (
    renderData: RenderData,
    row: number,
    col: number,
    startRow = 0,
    startCol = 0,
) => {
    const {
        renderCell,
        recycle,
        setReuseKey,
        old,
        newInfo,
        rerender,
        rowLength,
        columnLength,
        rowStarts,
        columnStarts,
    } = renderData;

    const key: RenderCellKey = `${row}_${col}`;
    const previous = old.map[key];
    let cell = previous;
    if (
        !cell ||
        (rerender &&
            (rerender.all ||
                rerender.cells[key] ||
                rerender.columns[col] ||
                rerender.rows[row]))
    ) {
        cell = renderCell?.({
            col,
            row,
            style: {
                display: "inline-flex",
                position: "absolute",
                // Sticky bands are positioned relative to the band's own origin, hence the
                // startCol/startRow offset; the centre region uses absolute starts.
                left: startCol
                    ? calcLength(columnLength, startCol, col - startCol)
                    : getStarts(columnStarts, col),
                width: getLength(columnLength, col),
                top: startRow
                    ? calcLength(rowLength, startRow, row - startRow)
                    : getStarts(rowStarts, row),
                height: getLength(rowLength, row),
            },
            key,
            renderInfo: newInfo,
            recycle,
            setReuseKey,
            // Only meaningful on the dirty path — when there was no previous cell this is
            // undefined and the renderer falls through to recycle()/createElement.
            previous,
        });
    }
    newInfo.map[key] = cell;
    if (newInfo.renderRange.rows.indexOf(row) < 0) {
        newInfo.renderRange.rows.push(row);
    }
    if (newInfo.renderRange.columns.indexOf(col) < 0) {
        newInfo.renderRange.columns.push(col);
    }
    return cell;
};

/**
 * The engine's entry point: turn a scroll offset and a viewport size into a fully described
 * render window, reusing everything that can be reused.
 *
 * Returns `old` — the identical object — when the frame requires no work at all. Callers
 * detect that by identity and skip the paint entirely.
 */
export function calcRenderInfo(
    old: RenderInputPrepared,
    input: CalcRenderInfoInput,
    whiteSpaceY?: number,
    whiteSpaceX?: number,
): RenderInputPrepared {
    const {
        offset,
        size,
        rowCount,
        columnCount,
        rowHeight,
        columnWidth,
        renderCell,
        stickyTop = 0,
        stickyLeft = 0,
        stickyRight = 0,
        stickyBottom = 0,
        overscanColumn,
        overscanRow,
        scrollBarWidth,
        scrollBarHeight,
        direction = { x: 0, y: 0 },
        fitToWidth,
        onAdjustRenderRange,
    } = input;

    const { rerender } = input;

    // Fast path: a pure scroll that lands inside the band the current render already covers.
    // Nothing is recomputed and nothing is allocated.
    if (!rerender && (direction.x || direction.y) && old.visibleOffset) {
        if (
            offset.x >= old.visibleOffset.left &&
            offset.x <= old.visibleOffset.right &&
            offset.y >= old.visibleOffset.top &&
            offset.y <= old.visibleOffset.bottom
        ) {
            return old;
        }
    }

    // A percentage width fits on its own, so the columns can already fill the viewport with
    // `fitToWidth` off. Everything downstream that means "the columns total the usable width"
    // has to read this rather than the option.
    const columnsFitted =
        fitToWidth || hasPercentLength(columnCount, columnWidth);

    const columnLength = buildLengthArray(
        columnCount,
        columnWidth,
        fitToWidth,
        size.width - scrollBarWidth,
    );

    const rowLength = buildLengthArray(rowCount, rowHeight);

    const newInnerSize = calcInnerSize(
        rowCount,
        columnCount,
        stickyTop,
        stickyRight,
        stickyBottom,
        stickyLeft,
        columnLength,
        rowLength,
        columnsFitted,
        whiteSpaceY,
        whiteSpaceX,
    );

    const newRange: RenderedRange = calcCellRange(
        newInnerSize,
        rowCount,
        columnCount,
        size.width,
        size.height,
        offset,
        overscanColumn,
        overscanRow,
        direction,
        columnLength,
        rowLength,
        scrollBarWidth,
        scrollBarHeight,
        onAdjustRenderRange,
    );

    let rerenderPrepared: RerenderInfoPrepared | null;

    if (old.rendered.top || old.rendered.bottom) {
        rerenderPrepared = prepareRerender(
            rerender,
            old,
            input,
            columnLength,
            rowLength,
            columnsFitted,
        );
        // Second fast path: the new visible range is contained by what is already rendered
        // and the geometry is unchanged, so the existing render still covers the viewport.
        if (
            !rerender &&
            newRange.visible.left >= old.visible.left &&
            newRange.visible.right <= old.visible.right &&
            newRange.visible.top >= old.visible.top &&
            newRange.visible.bottom <= old.visible.bottom &&
            newInnerSize.width === old.innerSize.width &&
            newInnerSize.height === old.innerSize.height &&
            newInnerSize.stickyTopHeight === old.innerSize.stickyTopHeight &&
            newInnerSize.stickyRightWidth === old.innerSize.stickyRightWidth &&
            newInnerSize.stickyBottomHeight === old.innerSize.stickyBottomHeight &&
            newInnerSize.stickyLeftWidth === old.innerSize.stickyLeftWidth
        ) {
            return old;
        }
    } else {
        // Nothing rendered yet — the first paint is a full one.
        rerenderPrepared = { all: true, cells: {}, columns: {}, rows: {} };
    }

    const columnStarts = buildStarts(columnLength);
    const rowStarts = buildStarts(rowLength);

    newRange.visibleOffset = calcOffsetRange(
        newRange.visible,
        rowLength,
        columnLength,
        rowStarts,
        columnStarts,
        size,
        newInnerSize,
        scrollBarWidth,
        scrollBarHeight,
    );

    const newInfo: RenderInputPrepared = {
        ...newRange,
        innerSize: newInnerSize,
        columnLength,
        rowLength,
        columnStarts,
        rowStarts,
        input: {
            size,
            rowCount,
            columnCount,
            stickyTop,
            stickyRight,
            stickyBottom,
            stickyLeft,
            scrollBarWidth,
            scrollBarHeight,
            fitToWidth,
        },

        cells: [],
        stickyTop: [],
        stickyLeft: [],
        stickyRight: [],
        stickyBottom: [],
        stickyTopLeft: [],
        stickyTopRight: [],
        stickyBottomRight: [],
        stickyBottomLeft: [],
        map: {},
        renderRange: {
            rows: [],
            columns: [],
        },
    };

    const rd: RenderData = {
        renderCell,
        recycle: input.recycle,
        setReuseKey: input.setReuseKey,
        old,
        newInfo,
        rerender: rerenderPrepared,
        rowLength,
        columnLength,
        rowStarts,
        columnStarts,
    };

    // The scrolling centre region: everything in the rendered window that is not claimed by
    // one of the four sticky bands.
    for (let r = newInfo.rendered.top; r <= newInfo.rendered.bottom; r++) {
        for (let c = newInfo.rendered.left; c <= newInfo.rendered.right; c++) {
            if (
                !(
                    r < stickyTop ||
                    c < stickyLeft ||
                    r >= rowCount - stickyBottom ||
                    c >= columnCount - stickyRight
                )
            ) {
                newInfo.cells.push(_renderCell(rd, r, c));
            }
        }
    }

    // Sticky top band, plus its two corners.
    for (let r = 0; r < stickyTop; r++) {
        for (let c = 0; c < stickyLeft; c++) {
            newInfo.stickyTopLeft.push(_renderCell(rd, r, c));
        }
        for (
            let c = Math.max(stickyLeft, newInfo.rendered.left);
            c <= Math.min(newInfo.rendered.right, columnCount - stickyRight - 1);
            c++
        ) {
            newInfo.stickyTop.push(_renderCell(rd, r, c));
        }
        for (let c = columnCount - stickyRight; c < columnCount; c++) {
            newInfo.stickyTopRight.push(
                _renderCell(rd, r, c, 0, columnCount - stickyRight),
            );
        }
    }

    // Sticky bottom band, plus its two corners.
    for (let r = rowCount - stickyBottom; r < rowCount; r++) {
        for (let c = 0; c < stickyLeft; c++) {
            newInfo.stickyBottomLeft.push(
                _renderCell(rd, r, c, rowCount - stickyBottom, 0),
            );
        }
        for (
            let c = Math.max(stickyLeft, newInfo.rendered.left);
            c <= Math.min(newInfo.rendered.right, columnCount - stickyRight - 1);
            c++
        ) {
            newInfo.stickyBottom.push(
                _renderCell(rd, r, c, rowCount - stickyBottom, 0),
            );
        }
        for (let c = columnCount - stickyRight; c < columnCount; c++) {
            newInfo.stickyBottomRight.push(
                _renderCell(
                    rd,
                    r,
                    c,
                    rowCount - stickyBottom,
                    columnCount - stickyRight,
                ),
            );
        }
    }

    // Sticky left and right bands, between the top and bottom bands.
    for (
        let r = Math.max(stickyTop, newInfo.rendered.top);
        r <= Math.min(newInfo.rendered.bottom, rowCount - stickyBottom - 1);
        r++
    ) {
        for (let c = 0; c < stickyLeft; c++) {
            newInfo.stickyLeft.push(_renderCell(rd, r, c, stickyTop, 0));
        }
        for (let c = columnCount - stickyRight; c < columnCount; c++) {
            newInfo.stickyRight.push(
                _renderCell(rd, r, c, stickyTop, columnCount - stickyRight),
            );
        }
    }

    return newInfo;
}

/** Horizontal offset that brings column `col` into view, moving as little as possible. */
export function calcScrollOffsetX(
    col: number,
    renderInfo: RenderInputPrepared,
    currOffset: RenderPoint,
): RenderPoint {
    const cell = {
        left: getStarts(renderInfo.columnStarts, col),
        right: calcLength(renderInfo.columnLength, 0, col + 1),
    };

    const size = renderInfo.input.size;
    const res = { ...currOffset };

    const visibleWidth =
        size.width -
        renderInfo.innerSize.stickyRightWidth -
        renderInfo.input.scrollBarWidth;
    if (res.x + visibleWidth < cell.right) {
        res.x = cell.right - visibleWidth;
    } else if (res.x > cell.left - renderInfo.innerSize.stickyLeftWidth) {
        res.x = cell.left - renderInfo.innerSize.stickyLeftWidth;
    }

    return res;
}

/** Vertical offset that brings row `row` into view, honouring the requested alignment. */
export function calcScrollOffsetY(
    row: number,
    renderInfo: RenderInputPrepared,
    currOffset: RenderPoint,
    rowAlign: RowAlign = "nearest",
): RenderPoint {
    const cell = {
        top: getStarts(renderInfo.rowStarts, row),
        bottom: calcLength(renderInfo.rowLength, 0, row + 1),
    };

    const size = renderInfo.input.size;
    const res = { ...currOffset };

    // The last row scrolls to the very bottom regardless of alignment, so the trailing
    // whitespace does not leave it stranded mid-viewport.
    const isLastRow = row >= renderInfo.input.rowCount - 1;
    if (isLastRow) {
        res.y =
            renderInfo.innerSize.height -
            renderInfo.input.size.height +
            renderInfo.input.scrollBarHeight;
        return res;
    }

    const visibleHeight =
        size.height -
        renderInfo.innerSize.stickyBottomHeight -
        renderInfo.input.scrollBarHeight;

    if (rowAlign === "nearest") {
        if (res.y + visibleHeight < cell.bottom) {
            res.y = cell.bottom - visibleHeight;
        } else if (res.y > cell.top - renderInfo.innerSize.stickyTopHeight) {
            res.y = cell.top - renderInfo.innerSize.stickyTopHeight;
        }
    } else if (rowAlign === "top") {
        res.y = cell.top - renderInfo.innerSize.stickyTopHeight;
    } else if (rowAlign === "bottom") {
        res.y = cell.bottom - visibleHeight;
    } else if (rowAlign === "center") {
        res.y =
            cell.top -
            renderInfo.innerSize.stickyTopHeight +
            (cell.bottom - cell.top - visibleHeight) / 2;
        if (res.y + visibleHeight < cell.bottom) {
            res.y = cell.bottom - visibleHeight;
        } else if (res.y > cell.top) {
            res.y = cell.top - renderInfo.innerSize.stickyTopHeight;
        }
    }

    return res;
}

export function calcScrollOffset(
    row: number,
    col: number,
    renderInfo: RenderInputPrepared,
    currOffset: RenderPoint,
): RenderPoint {
    return calcScrollOffsetY(
        row,
        renderInfo,
        calcScrollOffsetX(col, renderInfo, currOffset),
    );
}

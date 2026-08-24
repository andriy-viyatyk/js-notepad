/**
 * Dirty-set computation — which rows, columns and cells must be repainted.
 *
 * Ported from `uikit/RenderGrid/rerender-check.ts` as-is. Pure computation over plain objects; no
 * DOM, no framework, nothing to substitute. The only changes are the type import path and
 * comments.
 *
 * The output feeds `renderInfo.ts`, which repaints exactly what is marked here and reuses
 * the previously-rendered element for everything else. Two properties of this file are load
 * bearing:
 *
 * - **Caller-supplied dirty entries are filtered to what is actually on screen.** A caller
 *   may mark row 80,000 dirty while the viewport is at row 12; that entry is dropped rather
 *   than carried, so the marking cost never scales with the dataset.
 * - **`null` means "nothing changed".** Returning an empty-but-present dirty set instead
 *   would make the caller repaint the window, which is the failure mode this whole design
 *   exists to avoid.
 */

import type {
    RenderInfoCellObject,
    RenderInfoObject,
    RenderInput,
    RenderInputPrepared,
    RenderLength,
    RerenderInfo,
    RerenderInfoPrepared,
} from "./types";

/**
 * Ascending inclusive range. Deliberately *not* a shared `range` helper: a shared one usually
 * normalizes reversed bounds, whereas every caller here relies on `to < from` yielding an
 * empty array (it is how a zero-width sticky band marks nothing).
 */
const range = (from: number, to: number): number[] =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i);

const markStickyLeftDirty = (
    rerender: RerenderInfoPrepared,
    input: RenderInput,
) =>
    range(0, input.stickyLeft - 1).forEach((i) => {
        rerender.columns[i] = true;
    });

const markStickyRightDirty = (
    rerender: RerenderInfoPrepared,
    input: RenderInput,
) =>
    range(input.columnCount - input.stickyRight, input.columnCount - 1).forEach(
        (i) => {
            rerender.columns[i] = true;
        },
    );

const markStickyTopDirty = (
    rerender: RerenderInfoPrepared,
    input: RenderInput,
) =>
    range(0, input.stickyTop - 1).forEach((i) => {
        rerender.rows[i] = true;
    });

const markStickyBottomDirty = (
    rerender: RerenderInfoPrepared,
    input: RenderInput,
) =>
    range(1, input.stickyBottom).forEach((i) => {
        rerender.rows[input.rowCount - i] = true;
    });

const markStickyTopDiffDirty = (
    rerender: RerenderInfoPrepared,
    old: RenderInputPrepared,
    input: RenderInput,
) =>
    range(
        Math.min(old.input.stickyTop, input.stickyTop) + 1,
        Math.max(old.input.stickyTop, input.stickyTop),
    ).forEach((i) => {
        rerender.rows[i - 1] = true;
    });

const markStickyBottomDiffDirty = (
    rerender: RerenderInfoPrepared,
    old: RenderInputPrepared,
    input: RenderInput,
) =>
    range(1, Math.max(old.input.stickyBottom, input.stickyBottom)).forEach((i) => {
        rerender.rows[input.rowCount - i] = true;
    });

const markStickyLeftDiffDirty = (
    rerender: RerenderInfoPrepared,
    old: RenderInputPrepared,
    input: RenderInput,
) =>
    range(
        Math.min(old.input.stickyLeft, input.stickyLeft) + 1,
        Math.max(old.input.stickyLeft, input.stickyLeft),
    ).forEach((i) => {
        rerender.columns[i - 1] = true;
    });

const markStickyRightDiffDirty = (
    rerender: RerenderInfoPrepared,
    old: RenderInputPrepared,
    input: RenderInput,
) =>
    range(1, Math.max(old.input.stickyRight, input.stickyRight)).forEach((i) => {
        rerender.columns[input.columnCount - i] = true;
    });

function markVisibleColumnDirty(
    rerender: RerenderInfoPrepared,
    old: RenderInputPrepared,
    input: RenderInput,
) {
    range(old.rendered.left, old.rendered.right).forEach((i) => {
        rerender.columns[i] = true;
    });
    markStickyLeftDirty(rerender, input);
    markStickyRightDirty(rerender, input);
}

function markVisibleRowDirty(
    rerender: RerenderInfoPrepared,
    old: RenderInputPrepared,
    input: RenderInput,
) {
    for (let i = old.rendered.top; i <= old.rendered.bottom; i++) {
        rerender.rows[i] = true;
    }
    markStickyTopDirty(rerender, input);
    markStickyBottomDirty(rerender, input);
}

/**
 * A column width changed. Everything from the first changed column rightwards shifts, so
 * repaint from there to the right edge of the rendered window — but nothing outside it.
 */
function markDirtyWidth(
    rerender: RerenderInfoPrepared,
    old: RenderInputPrepared,
    columnLength: Array<number>,
) {
    if (typeof old.columnLength === "number") {
        throw new Error(
            "markDirtyWidth requires old.columnLength to be an array, not a number",
        );
    }

    let res = false;

    const dirtyIndex = old.columnLength.findIndex(
        (oldLength, idx) => oldLength !== columnLength[idx],
    );
    if (dirtyIndex < 0) {
        return false;
    }

    if (dirtyIndex <= old.rendered.right) {
        range(Math.max(dirtyIndex, old.rendered.left), old.rendered.right).forEach(
            (i) => {
                rerender.columns[i] = true;
            },
        );
        res = true;
    }
    if (dirtyIndex < old.input.stickyLeft) {
        markStickyLeftDirty(rerender, old.input);
        res = true;
    }
    if (
        old.input.stickyRight &&
        dirtyIndex <= old.input.columnCount - old.input.stickyRight
    ) {
        markStickyRightDirty(rerender, old.input);
        res = true;
    }

    return res;
}

/** The row-height counterpart of `markDirtyWidth`. */
function markDirtyHeight(
    rerender: RerenderInfoPrepared,
    old: RenderInputPrepared,
    rowLength: Array<number>,
) {
    if (typeof old.rowLength === "number") {
        throw new Error(
            "markDirtyHeight requires old.rowLength to be an array, not a number",
        );
    }

    let res = false;

    const dirtyIndex = old.rowLength.findIndex(
        (oldLength, idx) => oldLength !== rowLength[idx],
    );
    if (dirtyIndex < 0) {
        return false;
    }

    if (dirtyIndex < old.rendered.bottom) {
        range(Math.max(dirtyIndex, old.rendered.top), old.rendered.bottom).forEach(
            (i) => {
                rerender.rows[i] = true;
            },
        );
        res = true;
    }
    if (dirtyIndex < old.input.stickyTop) {
        markStickyTopDirty(rerender, old.input);
        res = true;
    }
    if (
        old.input.stickyBottom &&
        dirtyIndex <= old.input.rowCount - old.input.stickyBottom
    ) {
        markStickyBottomDirty(rerender, old.input);
        res = true;
    }

    return res;
}

/**
 * Expand a caller's `RerenderInfo` into O(1)-lookup maps, and add anything the geometry
 * change implies on top of it (sticky bands resized, row/column counts changed, a column
 * width edited).
 *
 * Returns `null` when nothing needs repainting at all — the signal that lets a scroll frame
 * reuse every element it already has.
 */
export function prepareRerender(
    rerender: RerenderInfo | undefined,
    old: RenderInputPrepared,
    input: RenderInput,
    columnLength: RenderLength,
    rowLength: RenderLength,
    /**
     * The columns were fitted to the viewport — by `fitToWidth`, or by a percentage width,
     * which fits on its own. Defaults to the option, for callers that have only that.
     */
    columnsFitted = input.fitToWidth,
): RerenderInfoPrepared | null {
    let res: RerenderInfoPrepared;
    let empty: boolean;

    if (!rerender) {
        res = {
            all: false,
            rows: {},
            columns: {},
            cells: {},
        };
        empty = true;
    } else {
        // Drop anything outside the rendered window or the sticky bands. Marking a row that
        // is 80,000 rows below the viewport must cost nothing.
        const rowInRange = (r: number) =>
            (r >= old.rendered.top && r <= old.rendered.bottom) ||
            r < old.input.stickyTop ||
            r >= old.input.rowCount - old.input.stickyBottom;

        const colInRange = (c: number) =>
            (c >= old.rendered.left && c <= old.rendered.right) ||
            c < old.input.stickyLeft ||
            c >= old.input.columnCount - old.input.stickyRight;

        const rows = (rerender.rows || []).filter(rowInRange);
        if (rerender.fromRow !== undefined) {
            rows.push(
                ...range(
                    Math.max(rerender.fromRow, old.rendered.top),
                    old.rendered.bottom,
                ).filter(rowInRange),
            );
        }
        const columns = (rerender.columns || []).filter(colInRange);
        const cells = (rerender.cells || []).filter(
            ({ row, col }) => rowInRange(row) && colInRange(col),
        );

        empty = !(rows.length || columns.length || cells.length);
        res = {
            all: rerender.all ?? false,
            rows: rows.reduce<RenderInfoObject>((acc, r) => {
                acc[r] = true;
                return acc;
            }, {}),
            columns: columns.reduce<RenderInfoObject>((acc, c) => {
                acc[c] = true;
                return acc;
            }, {}),
            cells: cells.reduce<RenderInfoCellObject>((acc, { row, col }) => {
                acc[`${row}_${col}`] = true;
                return acc;
            }, {}),
        };
    }

    // When the columns are fitted, every width is derived from the viewport width, so a resize
    // — or a scrollbar appearing, which changes the usable width — invalidates all of them.
    if (
        columnsFitted &&
        (old.input.scrollBarWidth !== input.scrollBarWidth ||
            old.input.size.width !== input.size.width)
    ) {
        res.all = true;
    }

    if (res.all) {
        return res;
    }

    if (old.input.stickyTop !== input.stickyTop) {
        markStickyTopDiffDirty(res, old, input);
        markStickyLeftDirty(res, input);
        markStickyRightDirty(res, input);
        empty = false;
    }

    if (old.input.stickyBottom !== input.stickyBottom) {
        markStickyBottomDiffDirty(res, old, input);
        empty = false;
    }

    if (old.input.stickyLeft !== input.stickyLeft) {
        markStickyLeftDiffDirty(res, old, input);
        empty = false;
    }

    if (old.input.stickyRight !== input.stickyRight) {
        markStickyRightDiffDirty(res, old, input);
        empty = false;
    }

    // The sticky bottom band is addressed from the end, so its cells move when the row count
    // changes. Mark it under both the old and the new count.
    if (old.input.rowCount !== input.rowCount) {
        markStickyBottomDirty(res, old.input);
        markStickyBottomDirty(res, input);
        empty = false;
    }

    if (old.input.columnCount !== input.columnCount) {
        markStickyRightDirty(res, old.input);
        markStickyRightDirty(res, input);
        empty = false;
    }

    // A switch between "one uniform length" and "a length per element" invalidates the axis.
    if (
        (typeof old.columnLength === "number") !==
        (typeof columnLength === "number")
    ) {
        markVisibleColumnDirty(res, old, input);
        empty = false;
    } else if (typeof columnLength === "number") {
        if (old.columnLength !== columnLength) {
            markVisibleColumnDirty(res, old, input);
            empty = false;
        }
    } else if (markDirtyWidth(res, old, columnLength)) {
        empty = false;
    }

    if ((typeof old.rowLength === "number") !== (typeof rowLength === "number")) {
        markVisibleRowDirty(res, old, input);
        empty = false;
    } else if (typeof rowLength === "number") {
        if (old.rowLength !== rowLength) {
            markVisibleRowDirty(res, old, input);
            empty = false;
        }
    } else if (markDirtyHeight(res, old, rowLength)) {
        empty = false;
    }

    if (empty) {
        return null;
    }

    return res;
}

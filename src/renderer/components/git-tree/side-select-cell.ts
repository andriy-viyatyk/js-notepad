/**
 * The L/R side-select cell for the Git Diff "Revisions" panel (EPIC-031 / US-618; ported to
 * av-grid in EPIC-057 / US-1021).
 *
 * Two small toggles per row — **L** (the diff's `from`) and **R** (its `to`) — in a fixed,
 * sticky-left status column. The Unstaged row passes `showLeft: false` (the diff `from` is never
 * the working tree), so only R renders, with a same-width placeholder keeping the R glyph
 * column-aligned with the commit rows.
 *
 * ## Why spans with no listeners, and not the React `<button>`s this replaced
 *
 * av-grid's cells are pooled and recycled, and its string path is the only one with an equality
 * guard: the element path does `textContent = ""` then `appendChild` **unconditionally** on any
 * repaint that touches the cell. A real element with listeners would therefore be detached
 * whenever anything dirtied its row — move the pointer one row and a focused toggle is gone, with
 * keyboard focus thrown to `<body>`.
 *
 * So this follows the library's own pattern for its own checkbox cell: emit markup carrying a
 * resolvable attribute, and let the host resolve the click by delegation. av-grid states the rule
 * in `view/DataCell.ts` — *"`data-type` is what `GridInteractions` resolves the click by; the
 * element carries no listener of its own, because it is pooled"* — and in `view/GridInteractions.ts`,
 * where per-cell listeners in a pooled grid are called *"not merely slower … unsound: an element
 * that was a header cell on one frame is a data cell on the next"*.
 *
 * Spans rather than `<button>`s for a second reason: `GridInteractions.focusRoot` deliberately
 * declines to take focus when a press lands inside `input, textarea, select, button, a,
 * [contenteditable]`, so a real button would steal focus from the grid root and kill arrow-key
 * navigation until the user clicked a cell. The React version had that wart.
 *
 * The markup carries **no hover or focus state**, so the `innerHTML !== rendered` guard keeps
 * hitting and a hover repaint of this column costs one string comparison per cell.
 */
import type { CellRenderer } from "../../uikit/DataGrid";
import type { GitTreeSideSelect } from "./GitTree";
import type { GitCommitRow } from "./swimlane-layout";

/** The side-select column's key. Not a row field — the column is `isStatusColumn` with a `render`. */
export const SIDE_SELECT_KEY = "--side-select--";

const RIGHT_TOGGLE_TITLE = "Compare on the right (to)";
const LEFT_TOGGLE_TITLE = "Compare on the left (from)";

/**
 * Build the L/R renderer, reading the live `sideSelect` through a ref.
 *
 * The ref is what lets a `from`/`to` change repaint the glyphs without rebuilding the columns
 * (which would reset the user's dragged widths). The owning component forces the repaint with
 * `grid.refresh()` when `selectionKey` changes.
 */
export function makeSideSelectCell(
    ref: { current: GitTreeSideSelect | undefined },
): CellRenderer<GitCommitRow> {
    return (cell) => {
        const row = cell.row;
        const sel = ref.current;
        if (!row || !sel) return "";

        // `data-active` is present or absent, never `="false"` — matching the React version's
        // `data-active={leftActive || undefined}`, and keeping the attribute order stable.
        const left = sel.showLeft(row)
            ? `<span class="git-side-toggle" data-side="left" role="button" ` +
              `title="${LEFT_TOGGLE_TITLE}"${sel.isLeftActive(row) ? ` data-active="true"` : ""}>L</span>`
            : `<span class="git-side-spacer"></span>`;
        const right =
            `<span class="git-side-toggle" data-side="right" role="button" ` +
            `title="${RIGHT_TOGGLE_TITLE}"${sel.isRightActive(row) ? ` data-active="true"` : ""}>R</span>`;

        return `<span class="git-side-select">${left}${right}</span>`;
    };
}

/**
 * Resolve a click inside the L/R cell. Returns whether a toggle handled it.
 *
 * Called from `onCellClick` once the column key matches. Note the soft-failure property: if the
 * span were ever replaced between the press and the click, the browser retargets to the surviving
 * `.avg-data-cell`, so the caller's row-click suppression still holds and only the L-vs-R decision
 * is lost — this can never fire the wrong side.
 */
export function handleSideSelectClick(
    target: EventTarget | null,
    row: GitCommitRow,
    sideSelect: GitTreeSideSelect | undefined,
): boolean {
    if (!sideSelect || !(target instanceof Element)) return false;
    const toggle = target.closest("[data-side]");
    if (!toggle) return false;

    if (toggle.getAttribute("data-side") === "left") sideSelect.onPickLeft(row);
    else sideSelect.onPickRight(row);
    return true;
}

/**
 * SVG commit-graph cell for the Git Tree component (EPIC-030 / US-611; ported to av-grid in
 * EPIC-057 / US-1021).
 *
 * A dumb painter of one row's swimlane slice (computed by `swimlane-layout.ts`). Under av-grid a
 * `render` hook supplies cell *content* inside the library's own pooled `.avg-data-cell`, so
 * everything the earlier renderer had to paint for itself — the absolute box, the forwarded
 * `className`, the background, the borders, `overflow: hidden` — belongs to the cell now, and the
 * hover and selection tints land on this cell exactly as they land on a text cell.
 *
 * The SVG is drawn at a constant width (independent of the cell box) and clipped by the cell:
 * shrinking the column slides the clip edge, never rescales the graph (EPIC-030 Concern 9). The
 * two declarations that make that true live in `GitTree.css`.
 */
import type { CellRenderer } from "../../uikit/DataGrid";
import type { GitCommitRow } from "./swimlane-layout";

export const GIT_TREE_ROW_HEIGHT = 24;
export const LANE_WIDTH = 12;
export const LANE_PAD = 6;
const NODE_R = 4;

const MID = GIT_TREE_ROW_HEIGHT / 2;
const TOP = 0;
const BOTTOM = GIT_TREE_ROW_HEIGHT;

const laneX = (col: number) => col * LANE_WIDTH + LANE_WIDTH / 2;

/** Graph-column pixel width for a given max lane count. */
export function graphWidth(maxColumns: number): number {
    return Math.max(1, maxColumns) * LANE_WIDTH + LANE_PAD;
}

/** Smooth connector between two points; a straight line when the column is unchanged. */
function edgePath(x1: number, y1: number, x2: number, y2: number): string {
    if (x1 === x2) return `M ${x1} ${y1} L ${x2} ${y2}`;
    const ym = (y1 + y2) / 2;
    return `M ${x1} ${y1} C ${x1} ${ym}, ${x2} ${ym}, ${x2} ${y2}`;
}

/**
 * Build the swimlane renderer for a fixed `maxColumns` (the constant graph width across all rows).
 *
 * ## The markup's formatting is a performance contract, not a style choice
 *
 * av-grid re-renders a cell only when the dirty set names it, its row or its column
 * (`render/renderInfo.ts`) — so a hover move dirties two rows and a selection change dirties the
 * affected cells. This column's content is a pure function of its row, so on those repaints the
 * string is *identical*, and av-grid's string path skips the write:
 * `if (el.innerHTML !== rendered) el.innerHTML = rendered`.
 *
 * That comparison reads `innerHTML` back, which **re-serializes** the parsed subtree, so it matches
 * only when what we wrote is what the serializer emits. Which means: explicit closing tags (never
 * `/>` — the serializer writes `></path>`), double-quoted values, `viewBox` cased exactly so (the
 * parser adjusts `viewbox` and the serializer emits the adjusted name), dashed property names
 * (`stroke-width`, not the camel-case property name), a stable attribute order, and no character that gets
 * escaped on the way out. Break any of those and the graph column re-parses on every hover move for
 * nothing.
 *
 * A string rather than an element for the same reason: av-grid's element path has **no** equality
 * guard at all — it does `textContent = ""` then `appendChild` unconditionally — and `CellContext`
 * does not hand the renderer its cell, so a renderer cannot memoize on its own.
 *
 * (av-grid 2.2.2 makes the skip exact, comparing against the last string assigned rather than a
 * re-serialization. The rules above stop being load-bearing then, but stay correct.)
 */
export function makeBranchTreeCell(maxColumns: number): CellRenderer<GitCommitRow> {
    const width = graphWidth(maxColumns);
    // Depends only on `maxColumns`, so it is built once per column rather than once per cell.
    const open =
        `<svg width="${width}" height="${GIT_TREE_ROW_HEIGHT}" ` +
        `viewBox="0 0 ${width} ${GIT_TREE_ROW_HEIGHT}">`;

    return (cell) => {
        const row = cell.row;
        if (!row) return "";
        const { node, edges } = row;

        let out = open;
        for (const edge of edges) {
            const x1 = edge.fromColumn === -1 ? laneX(node.column) : laneX(edge.fromColumn);
            const y1 = edge.fromColumn === -1 ? MID : TOP;
            const x2 = edge.toColumn === -1 ? laneX(node.column) : laneX(edge.toColumn);
            const y2 = edge.toColumn === -1 ? MID : BOTTOM;
            out +=
                `<path d="${edgePath(x1, y1, x2, y2)}" fill="none" ` +
                `stroke="${edge.color}" stroke-width="1.5"></path>`;
        }
        // `fill` is a plain presentation attribute because the lane colours are literal palette hex
        // from `swimlane-layout.ts`. The ring's `stroke` is not here at all: it has to be
        // `var(--avg-cell-bg)`, and `var()` is invalid in a presentation attribute — so it comes
        // from the `.git-graph-node` rule in `GitTree.css`.
        out +=
            `<circle class="git-graph-node" cx="${laneX(node.column)}" cy="${MID}" ` +
            `r="${NODE_R}" fill="${node.color}" stroke-width="1"></circle>`;
        return `${out}</svg>`;
    };
}

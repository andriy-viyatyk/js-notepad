/**
 * SVG commit-graph cell for the Git Tree component (EPIC-030 / US-611).
 *
 * A dumb painter of one row's swimlane slice (computed by swimlane-layout.ts).
 * A custom AVGrid `cellRenderer` fully replaces `DataCell`, so this applies its
 * own `props.style` (absolute box from RenderGrid), clips with overflow:hidden,
 * and forwards `props.className` (carries row-selected / row-hovered, whose
 * overlays live on the AVGrid root). The SVG is drawn at a constant width
 * (independent of the cell box) and clipped — shrinking the column slides the
 * clip edge, never rescales the graph (EPIC-030 Concern 9).
 */
import React from "react";
import styled from "@emotion/styled";
import { clsx } from "clsx";

import type { TCellRenderer, TCellRendererProps } from "../../uikit/AVGrid";
import color from "../../theme/color";
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

const CellRoot = styled.div(
    {
        overflow: "hidden",
        backgroundColor: color.grid.dataCellBackground,
        borderBottom: `solid 1px ${color.grid.borderColor}`,
        borderRight: `solid 1px ${color.grid.borderColor}`,
    },
    { label: "BranchTreeCell" },
);

/** Smooth connector between two points; a straight line when the column is unchanged. */
function edgePath(x1: number, y1: number, x2: number, y2: number): string {
    if (x1 === x2) return `M ${x1} ${y1} L ${x2} ${y2}`;
    const ym = (y1 + y2) / 2;
    return `M ${x1} ${y1} C ${x1} ${ym}, ${x2} ${ym}, ${x2} ${y2}`;
}

/**
 * Build the cell renderer bound to a fixed `maxColumns` (the constant graph
 * width across all rows). The returned component reads its row's layout slice
 * from `model.data.rows[row]`.
 */
export function makeBranchTreeCell(maxColumns: number): TCellRenderer {
    const width = graphWidth(maxColumns);

    function BranchTreeCell(props: Readonly<TCellRendererProps>) {
        const { row, model, style, className } = props;
        const treeRow = model.data.rows[row] as GitCommitRow | undefined;
        if (!treeRow) return <CellRoot style={style} className={clsx("git-graph-cell", className)} />;

        const { node, edges } = treeRow;

        return (
            <CellRoot style={style} className={clsx("git-graph-cell", className)}>
                <svg
                    width={width}
                    height={GIT_TREE_ROW_HEIGHT}
                    viewBox={`0 0 ${width} ${GIT_TREE_ROW_HEIGHT}`}
                    // The cell box is `display: inline-flex` (RenderGrid), so the
                    // SVG is a flex item. Without flexShrink:0 it shrinks to fit a
                    // narrowed column and the viewBox rescales the graph. Pinning
                    // it makes the SVG overflow at constant size; CellRoot's
                    // overflow:hidden then clips it (EPIC-030 Concern 9).
                    style={{ display: "block", flexShrink: 0 }}
                >
                    {edges.map((e, i) => {
                        const x1 = e.fromColumn === -1 ? laneX(node.column) : laneX(e.fromColumn);
                        const y1 = e.fromColumn === -1 ? MID : TOP;
                        const x2 = e.toColumn === -1 ? laneX(node.column) : laneX(e.toColumn);
                        const y2 = e.toColumn === -1 ? MID : BOTTOM;
                        return (
                            <path
                                key={i}
                                d={edgePath(x1, y1, x2, y2)}
                                fill="none"
                                stroke={e.color}
                                strokeWidth={1.5}
                            />
                        );
                    })}
                    <circle
                        cx={laneX(node.column)}
                        cy={MID}
                        r={NODE_R}
                        fill={node.color}
                        stroke={color.grid.dataCellBackground}
                        strokeWidth={1}
                    />
                </svg>
            </CellRoot>
        );
    }

    return BranchTreeCell;
}

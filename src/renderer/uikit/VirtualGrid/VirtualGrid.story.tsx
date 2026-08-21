import React, { useEffect, useMemo, useRef, useState } from "react";
import { Panel } from "../Panel/Panel";
import { Text } from "../Text/Text";
import { mountVanilla } from "../shared/mount";
import { Story } from "../../editors/storybook/storyTypes";
import { VirtualGridView, type VirtualGridProps, type VirtualGridStats } from "./VirtualGridView";
import type { ElementLength, Percent, RenderCellFunc } from "./types";

/**
 * The engine's first story. It has to drive what a story otherwise hides — a row count large
 * enough to actually virtualize, all four sticky bands with their corners, `fitToWidth`,
 * percentage widths, variable row heights, and a scroll that settles (the point of the cell pool
 * is that a settled scroll allocates nothing, which `showStats` makes visible).
 */

interface DemoProps {
    rowCount?: number;
    columnCount?: number;
    rowHeight?: number;
    variableRowHeight?: boolean;
    fitToWidth?: boolean;
    percentWidth?: boolean;
    stickyTop?: number;
    stickyBottom?: number;
    stickyLeft?: number;
    stickyRight?: number;
    overscanRow?: number;
    showStats?: boolean;
}

/**
 * A cell renderer that honours the pooling contract: a recycled element arrives with its previous
 * occupant's children, classes, attributes and listeners, so everything this sets is overwritten
 * every time. `previous` is preferred over `recycle()` because updating in place means the paint
 * does no DOM insertion at all.
 */
const renderCell: RenderCellFunc = (p) => {
    const el = p.previous ?? p.recycle?.() ?? document.createElement("div");

    el.dataset.part = "cell";
    el.dataset.row = String(p.row);
    el.dataset.col = String(p.col);
    el.textContent = `R${p.row}·C${p.col}`;

    const s = el.style;
    s.display = p.style.display;
    s.position = p.style.position;
    s.left = `${p.style.left}px`;
    s.top = `${p.style.top}px`;
    s.width = `${p.style.width}px`;
    s.height = `${p.style.height}px`;
    s.alignItems = "center";
    s.padding = "0 6px";
    s.boxSizing = "border-box";
    s.overflow = "hidden";
    s.whiteSpace = "nowrap";
    s.fontSize = "12px";
    s.borderRight = "1px solid var(--color-border-light, rgba(128,128,128,0.25))";
    s.borderBottom = "1px solid var(--color-border-light, rgba(128,128,128,0.25))";
    // Sticky bands read as headers; the corners inherit whichever band they sit in.
    const sticky = p.row < 1 || p.col < 1;
    s.fontWeight = sticky ? "600" : "400";
    s.background = sticky
        ? "var(--color-background-panel, rgba(128,128,128,0.12))"
        : "transparent";

    return el;
};

function VirtualGridDemo({
    rowCount = 10000,
    columnCount = 6,
    rowHeight = 24,
    variableRowHeight = false,
    fitToWidth = false,
    percentWidth = false,
    stickyTop = 1,
    stickyBottom = 0,
    stickyLeft = 1,
    stickyRight = 0,
    overscanRow = 2,
    showStats = true,
}: DemoProps) {
    const viewRef = useRef<VirtualGridView | null>(null);
    const [stats, setStats] = useState<VirtualGridStats | null>(null);

    // A fresh props object replaces the whole option set, and `renderCell` is compared by
    // reference — hence the module-level renderer and the memo. Recreating either would rebuild
    // every visible cell on each render, which is exactly the host contract the engine documents.
    // `fitToWidth` drops the trailing whitespace allowance and hides the horizontal scrollbar; it
    // does not resize numeric column widths, because only percentage lengths absorb spare space.
    // `percentWidth` is what makes the columns actually total the viewport — which is the shape
    // every list host uses (`columnWidth: () => "100%"`).
    const gridProps = useMemo<VirtualGridProps>(() => {
        const height: ElementLength = variableRowHeight
            ? (row: number) => (row % 3 === 0 ? rowHeight * 2 : rowHeight)
            : rowHeight;
        const width: ElementLength = percentWidth
            ? ((() => `${Math.floor(100 / Math.max(1, columnCount))}%` as Percent) as ElementLength)
            : 120;

        return {
            name: "virtual-grid-story",
            rowCount,
            columnCount,
            rowHeight: height,
            columnWidth: width,
            renderCell,
            overscanRow,
            stickyTop,
            stickyBottom,
            stickyLeft,
            stickyRight,
            fitToWidth,
            height: "100%",
            onView: (view) => {
                viewRef.current = view;
            },
        };
    }, [
        rowCount,
        columnCount,
        rowHeight,
        variableRowHeight,
        percentWidth,
        overscanRow,
        stickyTop,
        stickyBottom,
        stickyLeft,
        stickyRight,
        fitToWidth,
    ]);

    useEffect(() => {
        if (!showStats) {
            setStats(null);
            return;
        }
        const id = setInterval(() => {
            setStats(viewRef.current?.stats ?? null);
        }, 500);
        return () => clearInterval(id);
    }, [showStats]);

    return (
        <Panel direction="column" width={660} height={360} gap="sm">
            {showStats && (
                <Text size="sm" color="light">
                    {stats
                        ? `paints ${stats.paints} · appended ${stats.cellsAppended} · removed ${stats.cellsRemoved} · pool hits ${stats.pool.hits} / misses ${stats.pool.misses} · last paint ${stats.lastPaintMs.toFixed(2)}ms`
                        : "measuring…"}
                </Text>
            )}
            <Panel direction="column" flex>
                {mountVanilla(VirtualGridView, gridProps)}
            </Panel>
        </Panel>
    );
}

export const virtualGridStory: Story = {
    id: "virtual-grid",
    name: "VirtualGrid",
    section: "Lists",
    component: VirtualGridDemo as React.ComponentType<Record<string, unknown>>,
    props: [
        { name: "rowCount", type: "number", default: 10000, min: 0, step: 100 },
        { name: "columnCount", type: "number", default: 6, min: 1, max: 40 },
        { name: "rowHeight", type: "number", default: 24, min: 12, max: 80 },
        { name: "variableRowHeight", type: "boolean", default: false },
        { name: "fitToWidth", type: "boolean", default: false },
        { name: "percentWidth", type: "boolean", default: false },
        { name: "stickyTop", type: "number", default: 1, min: 0, max: 3 },
        { name: "stickyBottom", type: "number", default: 0, min: 0, max: 3 },
        { name: "stickyLeft", type: "number", default: 1, min: 0, max: 3 },
        { name: "stickyRight", type: "number", default: 0, min: 0, max: 3 },
        { name: "overscanRow", type: "number", default: 2, min: 0, max: 20 },
        { name: "showStats", type: "boolean", default: true },
    ],
};

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Panel } from "../Panel/Panel";
import { Text } from "../Text/Text";
import { mountVanilla } from "../shared/mount";
import { Story } from "../../editors/storybook/storyTypes";
import {
    VirtualGridView,
    type VirtualGridProps,
    type VirtualGridStats,
} from "./VirtualGridView";
import {
    VirtualFlexGridView,
    type VirtualFlexGridProps,
    type VirtualFlexCellFunc,
} from "./VirtualFlexGridView";
import type { ElementLength, Percent, RenderCellFunc } from "./types";
import type { VirtualGridModel } from "./VirtualGridModel";

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

interface VirtualFlexGridDemoProps {
    rowCount?: number;
    growthDelay?: number;
}

function VirtualFlexGridDemo({
    rowCount = 180,
    growthDelay = 900,
}: VirtualFlexGridDemoProps) {
    const modelRef = useRef<VirtualGridModel | null>(null);
    const grownRows = useRef(new Set<number>());
    const [status, setStatus] = useState("mounting measured rows…");
    const [roundTripDone, setRoundTripDone] = useState(false);

    // This closure is stable for the lifetime of the view. The mutable set is the story's data
    // signal; the model.update call below is the explicit repaint/measurement trigger.
    const renderFlexCell = useMemo<VirtualFlexCellFunc>(() => (p) => {
        const element = p.previous ?? p.recycle?.() ?? document.createElement("div");
        const grown = grownRows.current.has(p.row);
        const lineCount = grown ? 7 : 1 + (p.row % 5);
        const line = `row ${p.row} · recycled content remains correctly addressed`;

        element.dataset.part = "flex-story-cell";
        element.dataset.row = String(p.row);
        element.textContent = Array.from({ length: lineCount }, () => line).join("\n");
        element.style.minHeight = `${lineCount * 18 + 8}px`;
        element.style.padding = "4px 8px";
        element.style.boxSizing = "border-box";
        element.style.alignItems = "flex-start";
        element.style.whiteSpace = "pre-wrap";
        element.style.overflow = "hidden";
        element.style.borderBottom = "1px solid var(--color-border-light)";
        return element;
    }, []);

    const gridProps = useMemo<VirtualFlexGridProps>(() => ({
        name: "virtual-flex-grid-story",
        rowCount,
        columnCount: 1,
        rowHeight: 24,
        columnWidth: (() => "100%" as Percent) as ElementLength,
        renderCell: renderFlexCell,
        minRowHeight: 24,
        maxRowHeight: 180,
        getInitialRowHeight: () => 24,
        preferMinHeightForNewRows: true,
        overscanRow: 1,
        fitToWidth: true,
        height: "100%",
        onModel: (model) => {
            modelRef.current = model;
        },
    }), [renderFlexCell, rowCount]);

    useEffect(() => {
        const growthTimer = window.setTimeout(() => {
            grownRows.current.add(2);
            modelRef.current?.update({ rows: [2] });
        }, growthDelay);
        const scrollDownTimer = window.setTimeout(() => {
            void modelRef.current?.scrollToRow(Math.max(0, rowCount - 1), "bottom");
        }, growthDelay + 450);
        const scrollTopTimer = window.setTimeout(() => {
            void modelRef.current?.scrollToRow(0, "top");
            setRoundTripDone(true);
        }, growthDelay + 1050);
        const statusTimer = window.setInterval(() => {
            const cell = document.querySelector<HTMLElement>(
                '[data-type="virtual-flex-grid"] [data-row="2"]',
            );
            const height = cell?.style.height;
            const top = cell?.style.top;
            setStatus(
                cell
                    ? `row 2 geometry: ${height} tall at ${top}; DOM height ${cell.clientHeight}px`
                    : "row 2 is outside the recycled render window",
            );
        }, 250);
        return () => {
            window.clearTimeout(growthTimer);
            window.clearTimeout(scrollDownTimer);
            window.clearTimeout(scrollTopTimer);
            window.clearInterval(statusTimer);
        };
    }, [growthDelay, rowCount]);

    return (
        <Panel direction="column" width={660} height={360} gap="sm">
            <Text size="sm" color="light">
                {status} · {roundTripDone ? "scroll round trip complete" : "pooling and growth pending"}
            </Text>
            <Panel direction="column" flex>
                {mountVanilla(VirtualFlexGridView, gridProps)}
            </Panel>
        </Panel>
    );
}

export const virtualFlexGridStory: Story = {
    id: "virtual-flex-grid",
    name: "VirtualFlexGrid",
    section: "Lists",
    component: VirtualFlexGridDemo as React.ComponentType<Record<string, unknown>>,
    props: [
        { name: "rowCount", type: "number", default: 180, min: 40, step: 20 },
        { name: "growthDelay", type: "number", default: 900, min: 250, step: 250 },
    ],
};

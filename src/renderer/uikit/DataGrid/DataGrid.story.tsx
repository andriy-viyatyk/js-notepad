import React, { useMemo, useRef, useState } from "react";

import { Panel } from "../Panel/Panel";
import { Text } from "../Text/Text";
import { Button } from "../Button/Button";
import { Popover } from "../Popover/Popover";
import { cycleTheme } from "../../theme/themes";
import { Story } from "../../editors/storybook/storyTypes";
// A story is a harness and is exempt from the Rule 6 lint. That exemption is what makes this an
// *integration* story rather than a grid-features story: it can reach the app-side context-menu
// adapter, which is the piece US-1020…US-1022 all depend on and which nothing in uikit/ may import.
// eslint-disable-next-line import/no-restricted-paths
import { showGridContextMenu } from "../../ui/dialogs/poppers/grid-context-menu";
import { DataGrid } from "./DataGrid";
import type { Column, DataGridInstance, DataGridProps } from "./types";

/**
 * The adoption story for av-grid (EPIC-057 / US-1019).
 *
 * av-grid ships its own feature examples and a 100k-row benchmark, so this deliberately does not
 * duplicate them. Each panel covers one failure this epic can otherwise only discover late, in a
 * consumer task, after the migration is already committed:
 *
 *  • **theming** — four separate elements each define the whole `--avg-*` block on themselves,
 *    because a popover mounts on `document.body` and inherits nothing from the grid. Each is its
 *    own chance for an unthemed surface, and the font is the one token with no `--color-*` source.
 *  • **popover** — the combination `editors/grid/components/ColumnsOptions.tsx` needs (US-1020),
 *    where a grid lives inside a portalled popover whose height comes from its content.
 *  • **element renderer** — the C4-6 trap. The engine writes `top`/`left` and nothing writes
 *    `position`, so a flow-laid-out cell looks right at row 1 and leaves an empty band below.
 *    **Scroll before judging.** US-1021's `BranchTreeCell` depends on this.
 *  • **context menu** — the app menu through the step-5 adapter, proving the `avg-` ids reach
 *    Persephone icons and that neither av-grid's own menu nor the browser's appears.
 */

type PanelId = "theming" | "in-popover" | "element-renderer" | "context-menu";

interface DemoRow {
    id: string;
    name: string;
    kind: string;
    size: number;
    ratio: number;
}

const KINDS = ["source", "asset", "config", "test", "doc"];

function makeRows(count: number): DemoRow[] {
    return Array.from({ length: count }, (_, i) => ({
        id: `r${i}`,
        name: `Grace Hopper ${i}`,
        kind: KINDS[i % KINDS.length],
        size: (i * 977) % 100000,
        ratio: ((i * 37) % 100) / 100,
    }));
}

const COLUMNS: Column<DemoRow>[] = [
    { key: "name", name: "Name", width: 200 },
    { key: "kind", name: "Kind", width: 110 },
    { key: "size", name: "Size", width: 100, dataType: "number", align: "right" },
    { key: "ratio", name: "Ratio", width: 90, dataType: "number", align: "right" },
];

/**
 * A cell renderer returning an element.
 *
 * **It must NOT be positioned.** av-grid's `render` supplies the *content* of the library's own
 * pooled `.avg-data-cell`, and that cell is what the engine writes `top` and `left` on — the
 * returned node is its child and lays out in flow inside it. Positioning it would take it out of
 * flow into the positioned paint step, *after* `.avg-data-cell::before`, so this cell would paint
 * over the hover and selection tints while every other cell in its row painted under them.
 *
 * (This comment previously said the opposite, on the strength of EPIC-057 C4-6. That requirement
 * is real for the *React* grid being replaced, where a `cellRenderer` *was* the cell and received
 * the absolute box. Corrected in US-1021 F8.)
 */
function renderRatioBar(value: unknown): HTMLElement {
    const el = document.createElement("div");
    el.dataset.part = "ratio-bar";
    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.gap = "6px";
    el.style.padding = "0 6px";
    el.style.boxSizing = "border-box";

    const bar = document.createElement("div");
    const ratio = typeof value === "number" ? value : 0;
    bar.style.height = "8px";
    bar.style.width = `${Math.round(ratio * 60)}px`;
    bar.style.background = "var(--color-bg-selection, #3b82f6)";
    bar.style.flex = "0 0 auto";

    const label = document.createElement("span");
    label.textContent = ratio.toFixed(2);

    el.append(bar, label);
    return el;
}

interface DemoProps {
    panel?: PanelId;
    rowCount?: number;
    searchString?: string;
    highlightString?: string;
    filterBar?: boolean;
    rowNoun?: string;
}

function DataGridDemo({
    panel = "theming",
    rowCount = 2000,
    searchString = "",
    highlightString = "",
    filterBar = true,
    rowNoun = "file",
}: DemoProps) {
    const rows = useMemo(() => makeRows(rowCount), [rowCount]);
    const gridRef = useRef<DataGridInstance<DemoRow> | null>(null);
    const [viewport, setViewport] = useState("");
    const [popoverOpen, setPopoverOpen] = useState(false);
    const anchorRef = useRef<HTMLButtonElement>(null);

    // Every acceptance criterion in the task asserts a non-zero viewport, in every panel, because
    // a blank grid is always a host-height problem and never a data problem.
    const readViewport = () => {
        const state = gridRef.current?.getState();
        setViewport(
            state
                ? `viewport ${Math.round(state.viewport.width)}×${Math.round(state.viewport.height)} · ${state.rowCount} rows`
                : "no grid",
        );
    };

    const common: DataGridProps<DemoRow> = {
        name: `data-grid-story-${panel}`,
        rows,
        columns: COLUMNS,
        getRowKey: (row) => row.id,
        rowNoun,
        searchString: searchString || undefined,
        highlightString: highlightString || undefined,
        onGrid: (grid) => {
            gridRef.current = grid;
        },
    };

    if (panel === "theming") {
        return (
            <Panel direction="column" width={720} height={420} gap="sm">
                <Panel direction="row" gap="sm" align="center">
                    <Button onClick={() => cycleTheme(1)}>Next theme</Button>
                    <Button onClick={readViewport}>Read viewport</Button>
                    <Text size="sm" color="light">{viewport}</Text>
                </Panel>
                <Text size="sm" color="light">
                    Open a column filter popover, then a cell dropdown, then switch theme with all
                    of them open. Each of the grid root, the popover, the list and the filter bar
                    declares the whole --avg-* block on itself. Font must be Consolas, not a system
                    sans.
                </Text>
                <Panel direction="column" flex>
                    <DataGrid {...common} filterBar={filterBar} editable />
                </Panel>
            </Panel>
        );
    }

    if (panel === "in-popover") {
        return (
            <Panel direction="column" gap="md" padding="lg" align="start">
                <Panel direction="row" gap="sm" align="center">
                    <Button ref={anchorRef} onClick={() => setPopoverOpen((v) => !v)}>
                        {popoverOpen ? "Close popover" : "Open grid in popover"}
                    </Button>
                    <Button onClick={readViewport}>Read viewport</Button>
                    <Text size="sm" color="light">{viewport}</Text>
                </Panel>
                <Text size="sm" color="light">
                    The shape ColumnsOptions needs. A popover sizes to its content, so the grid host
                    must be given an explicit height — and the grid&apos;s own filter popover mounts
                    on document.body, above this one.
                </Text>
                <Popover
                    open={popoverOpen}
                    elementRef={anchorRef.current}
                    placement="bottom-start"
                    offset={[0, 4]}
                    scroll={false}
                    onClose={() => setPopoverOpen(false)}
                >
                    <Panel direction="column" width={420} height={260}>
                        <DataGrid {...common} rows={rows.slice(0, 200)} filterBar={filterBar} />
                    </Panel>
                </Popover>
            </Panel>
        );
    }

    if (panel === "element-renderer") {
        const columns: Column<DemoRow>[] = COLUMNS.map((c) =>
            c.key === "ratio" ? { ...c, width: 160, render: (cell) => renderRatioBar(cell.value) } : c,
        );
        return (
            <Panel direction="column" width={720} height={420} gap="sm">
                <Panel direction="row" gap="sm" align="center">
                    <Button
                        onClick={() => void gridRef.current?.scrollToRow(Math.floor(rowCount / 2))}
                    >
                        Scroll to the middle
                    </Button>
                    <Text size="sm" color="light">
                        Judge the Ratio column here, not at row 1 — a missing `position: absolute`
                        is invisible on the first row.
                    </Text>
                </Panel>
                <Panel direction="column" flex>
                    <DataGrid {...common} columns={columns} />
                </Panel>
            </Panel>
        );
    }

    return (
        <Panel direction="column" width={720} height={420} gap="sm">
            <Text size="sm" color="light">
                Right-click a cell: Persephone&apos;s own menu, with Persephone icons on the
                library&apos;s items. Neither av-grid&apos;s .avg-menu nor the browser menu should
                appear. The row items read &quot;{rowNoun}&quot;, and &quot;Reveal&quot; is a host
                item passed through getContextMenuItems with its own icon left alone.
            </Text>
            <Panel direction="column" flex>
                <DataGrid
                    {...common}
                    editable
                    canAddRows
                    canDeleteRows
                    newRow={(index) => ({
                        id: `new${index}`,
                        name: "",
                        kind: "source",
                        size: 0,
                        ratio: 0,
                    })}
                    getContextMenuItems={(e) => [
                        {
                            label: `Reveal ${e.rowKey ?? "nothing"}`,
                            onClick: () => undefined,
                        },
                    ]}
                    onGridContextMenu={showGridContextMenu}
                />
            </Panel>
        </Panel>
    );
}

export const dataGridStory: Story = {
    id: "data-grid",
    name: "DataGrid",
    section: "Lists",
    component: DataGridDemo as React.ComponentType<Record<string, unknown>>,
    props: [
        {
            name: "panel",
            type: "enum",
            options: ["theming", "in-popover", "element-renderer", "context-menu"],
            default: "theming",
        },
        { name: "rowCount", type: "number", default: 2000, min: 0, step: 100 },
        { name: "searchString", type: "string", default: "" },
        { name: "highlightString", type: "string", default: "" },
        { name: "filterBar", type: "boolean", default: true },
        { name: "rowNoun", type: "string", default: "file" },
    ],
};

import { createPanelElement } from "../Panel/panel-style";
import { createTextElement } from "../Text/text-style";
import { VanillaView } from "../shared/vanilla-view";
import { VirtualGridView, type VirtualGridProps, type VirtualGridStats } from "./VirtualGridView";
import { VirtualFlexGridView, type VirtualFlexGridProps, type VirtualFlexCellFunc } from "./VirtualFlexGridView";
import type { ElementLength, Percent, RenderCellFunc } from "./types";
import color from "../../theme/color";
import type { Story } from "../../editors/storybook/storyTypes";

const renderCell: RenderCellFunc = (params) => {
    const element = params.previous ?? params.recycle?.() ?? document.createElement("div");
    element.dataset.part = "cell";
    element.dataset.row = String(params.row);
    element.dataset.col = String(params.col);
    element.textContent = `R${params.row}·C${params.col}`;
    const style = element.style;
    style.display = params.style.display;
    style.position = params.style.position;
    style.left = `${params.style.left}px`;
    style.top = `${params.style.top}px`;
    style.width = `${params.style.width}px`;
    style.height = `${params.style.height}px`;
    style.alignItems = "center";
    style.padding = "0 6px";
    style.boxSizing = "border-box";
    style.overflow = "hidden";
    style.whiteSpace = "nowrap";
    style.fontSize = "12px";
    style.borderRight = `1px solid ${color.border.light}`;
    style.borderBottom = `1px solid ${color.border.light}`;
    const sticky = params.row < 1 || params.col < 1;
    style.fontWeight = sticky ? "600" : "400";
    style.background = sticky ? color.background.light : "";
    return element;
};

interface GridDemoProps {
    rowCount?: number; columnCount?: number; rowHeight?: number; variableRowHeight?: boolean;
    fitToWidth?: boolean; percentWidth?: boolean; stickyTop?: number; stickyBottom?: number;
    stickyLeft?: number; stickyRight?: number; overscanRow?: number; showStats?: boolean;
}

class VirtualGridDemoView extends VanillaView<GridDemoProps> {
    private view: VirtualGridView | undefined;
    private statsElement: HTMLElement | undefined;
    private statsTimer: number | undefined;
    private stats: VirtualGridStats | null = null;

    public constructor(props: GridDemoProps) {
        super(props, createPanelElement({ direction: "column", width: 660, height: 360, gap: "sm" }));
    }

    protected onMount(): void {
        const grid = this.child(new VirtualGridView(this.gridProps(this.props)));
        this.view = grid;
        this.statsElement = createTextElement("", { size: "sm", color: "light" });
        const gridHost = createPanelElement({ direction: "column", flex: true }, [grid.root]);
        this.root.append(gridHost);
        grid.mount();
        this.syncStatsVisibility();
        this.startStatsTimer();
    }

    protected onUpdate(props: GridDemoProps): void {
        this.view?.update(this.gridProps(props));
        this.syncStatsVisibility();
        if (props.showStats ?? true) this.startStatsTimer();
        else this.stopStatsTimer();
        this.updateStatsText();
    }

    private gridProps(props: GridDemoProps): VirtualGridProps {
        const rowHeight: ElementLength = props.variableRowHeight ? (row: number) => row % 3 === 0 ? (props.rowHeight ?? 24) * 2 : (props.rowHeight ?? 24) : (props.rowHeight ?? 24);
        const columnWidth: ElementLength = props.percentWidth ? (() => `${Math.floor(100 / Math.max(1, props.columnCount ?? 6))}%` as Percent) as ElementLength : 120;
        return {
            name: "virtual-grid-story", rowCount: props.rowCount ?? 10000, columnCount: props.columnCount ?? 6,
            rowHeight, columnWidth, renderCell, overscanRow: props.overscanRow ?? 2,
            stickyTop: props.stickyTop ?? 1, stickyBottom: props.stickyBottom ?? 0,
            stickyLeft: props.stickyLeft ?? 1, stickyRight: props.stickyRight ?? 0,
            fitToWidth: props.fitToWidth, height: "100%", onView: (view) => { this.view = view; },
        };
    }

    private syncStatsVisibility(): void {
        if (!this.statsElement) return;
        if ((this.props.showStats ?? true) && !this.statsElement.isConnected) this.root.insertBefore(this.statsElement, this.root.firstChild);
        else if (!(this.props.showStats ?? true) && this.statsElement.isConnected) this.statsElement.remove();
    }

    private startStatsTimer(): void {
        if (this.statsTimer !== undefined) return;
        this.statsTimer = window.setInterval(() => {
            this.stats = this.view?.stats ?? null;
            this.updateStatsText();
        }, 500);
    }

    private stopStatsTimer(): void {
        if (this.statsTimer === undefined) return;
        window.clearInterval(this.statsTimer);
        this.statsTimer = undefined;
    }

    private updateStatsText(): void {
        if (!this.statsElement) return;
        this.statsElement.textContent = this.stats
            ? `paints ${this.stats.paints} · appended ${this.stats.cellsAppended} · removed ${this.stats.cellsRemoved} · pool hits ${this.stats.pool.hits} / misses ${this.stats.pool.misses} · last paint ${this.stats.lastPaintMs.toFixed(2)}ms`
            : "measuring…";
    }

    protected onDispose(): void {
        this.stopStatsTimer();
        this.view = undefined;
        this.statsElement = undefined;
    }
}

export const virtualGridStory: Story<GridDemoProps> = {
    id: "virtual-grid", name: "VirtualGrid", section: "Lists", view: VirtualGridDemoView,
    props: [
        { name: "rowCount", type: "number", default: 10000, min: 0, step: 100 }, { name: "columnCount", type: "number", default: 6, min: 1, max: 40 },
        { name: "rowHeight", type: "number", default: 24, min: 12, max: 80 }, { name: "variableRowHeight", type: "boolean", default: false },
        { name: "fitToWidth", type: "boolean", default: false }, { name: "percentWidth", type: "boolean", default: false },
        { name: "stickyTop", type: "number", default: 1, min: 0, max: 3 }, { name: "stickyBottom", type: "number", default: 0, min: 0, max: 3 },
        { name: "stickyLeft", type: "number", default: 1, min: 0, max: 3 }, { name: "stickyRight", type: "number", default: 0, min: 0, max: 3 },
        { name: "overscanRow", type: "number", default: 2, min: 0, max: 20 }, { name: "showStats", type: "boolean", default: true },
    ],
};

interface FlexDemoProps { rowCount?: number; growthDelay?: number; }

class VirtualFlexGridDemoView extends VanillaView<FlexDemoProps> {
    private readonly grownRows = new Set<number>();
    private readonly renderFlexCell: VirtualFlexCellFunc = (params) => {
        const element = params.previous ?? params.recycle?.() ?? document.createElement("div");
        const lineCount = this.grownRows.has(params.row) ? 7 : 1 + (params.row % 5);
        const line = `row ${params.row} · recycled content remains correctly addressed`;
        element.dataset.part = "flex-story-cell";
        element.dataset.row = String(params.row);
        element.textContent = Array.from({ length: lineCount }, () => line).join("\n");
        element.style.minHeight = `${lineCount * 18 + 8}px`;
        element.style.padding = "4px 8px";
        element.style.boxSizing = "border-box";
        element.style.alignItems = "flex-start";
        element.style.whiteSpace = "pre-wrap";
        element.style.overflow = "hidden";
        element.style.borderBottom = `1px solid ${color.border.light}`;
        return element;
    };
    private view: VirtualFlexGridView | undefined;
    private statusElement: HTMLElement | undefined;
    private roundTripDone = false;
    private previousRowCount = 180;
    private previousGrowthDelay = 900;
    private timers: number[] = [];
    private statusTimer: number | undefined;

    public constructor(props: FlexDemoProps) {
        super(props, createPanelElement({ direction: "column", width: 660, height: 360, gap: "sm" }));
    }

    protected onMount(): void {
        this.statusElement = createTextElement("", { size: "sm", color: "light" });
        const grid = this.child(new VirtualFlexGridView(this.gridProps(this.props)));
        this.view = grid;
        this.root.append(this.statusElement, createPanelElement({ direction: "column", flex: true }, [grid.root]));
        grid.mount();
        this.restartTimers(this.props);
        this.statusElement.textContent = "mounting measured rows…";
        this.previousRowCount = this.props.rowCount ?? 180;
        this.previousGrowthDelay = this.props.growthDelay ?? 900;
    }

    protected onUpdate(props: FlexDemoProps): void {
        this.view?.update(this.gridProps(props));
        if ((props.growthDelay ?? 900) !== this.previousGrowthDelay || (props.rowCount ?? 180) !== this.previousRowCount) this.restartTimers(props);
        this.updateStatus();
        this.previousRowCount = props.rowCount ?? 180;
        this.previousGrowthDelay = props.growthDelay ?? 900;
    }

    private gridProps(props: FlexDemoProps): VirtualFlexGridProps {
        return {
            name: "virtual-flex-grid-story", rowCount: props.rowCount ?? 180, columnCount: 1, rowHeight: 24,
            columnWidth: (() => "100%" as Percent) as ElementLength, renderCell: this.renderFlexCell,
            minRowHeight: 24, maxRowHeight: 180, getInitialRowHeight: () => 24, preferMinHeightForNewRows: true,
            overscanRow: 1, fitToWidth: true, height: "100%",
        };
    }

    private restartTimers(props: FlexDemoProps): void {
        this.clearTimers();
        const delay = props.growthDelay ?? 900;
        const rowCount = props.rowCount ?? 180;
        this.timers.push(window.setTimeout(() => { this.grownRows.add(2); this.view?.gridModel?.update({ rows: [2] }); }, delay));
        this.timers.push(window.setTimeout(() => { void this.view?.gridModel?.scrollToRow(Math.max(0, rowCount - 1), "bottom"); }, delay + 450));
        this.timers.push(window.setTimeout(() => { void this.view?.gridModel?.scrollToRow(0, "top"); this.roundTripDone = true; this.updateStatus(); }, delay + 1050));
        this.statusTimer = window.setInterval(() => {
            const cell = this.view?.root.querySelector<HTMLElement>('[data-row="2"]');
            this.updateStatus(cell);
        }, 250);
    }

    private clearTimers(): void {
        this.timers.forEach((timer) => window.clearTimeout(timer));
        this.timers = [];
        if (this.statusTimer !== undefined) window.clearInterval(this.statusTimer);
        this.statusTimer = undefined;
    }

    private updateStatus(cell?: HTMLElement): void {
        if (!this.statusElement) return;
        const geometry = cell ? `row 2 geometry: ${cell.style.height} tall at ${cell.style.top}; DOM height ${cell.clientHeight}px` : "row 2 is outside the recycled render window";
        this.statusElement.textContent = `${geometry} · ${this.roundTripDone ? "scroll round trip complete" : "pooling and growth pending"}`;
    }

    protected onDispose(): void {
        this.clearTimers();
        this.view = undefined;
        this.statusElement = undefined;
    }
}

export const virtualFlexGridStory: Story<FlexDemoProps> = {
    id: "virtual-flex-grid", name: "VirtualFlexGrid", section: "Lists", view: VirtualFlexGridDemoView,
    props: [
        { name: "rowCount", type: "number", default: 180, min: 40, step: 20 },
        { name: "growthDelay", type: "number", default: 900, min: 250, step: 250 },
    ],
};

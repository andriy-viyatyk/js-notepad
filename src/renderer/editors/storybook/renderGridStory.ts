import color from "../../theme/color";
import { RenderGrid } from "../../uikit/DataGrid";
import { applyCellStyle } from "../../uikit/shared/cell-style";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type {
    ElementLength,
    Percent,
    RenderCellFunc,
    RenderGridShellOptions,
    RenderGridStats,
} from "../../uikit/DataGrid";
import type { Story } from "./storyTypes";

const renderCell: RenderCellFunc = (params) => {
    const element = params.previous ?? params.recycle?.() ?? document.createElement("div");
    element.dataset.part = "cell";
    applyCellStyle(element, params.style, params.row, params.col, params.renderInfo.input.columnCount);
    element.textContent = `R${params.row}·C${params.col}`;
    const style = element.style;
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

class RenderGridDemoView extends VanillaView<GridDemoProps> {
    private view: RenderGrid | undefined;
    private statsElement: HTMLElement | undefined;
    private statsTimer: number | undefined;
    private stats: RenderGridStats | null = null;

    public constructor(props: GridDemoProps) {
        super(props, createPanelElement({ direction: "column", width: 660, height: 360, gap: "sm" }));
    }

    protected onMount(): void {
        this.statsElement = createTextElement("", { size: "sm", color: "light" });
        const gridHost = createPanelElement({ direction: "column", flex: true });
        this.root.append(gridHost);
        this.syncStatsVisibility();

        this.own(() => {
            this.view?.destroy();
            this.view = undefined;
        });
        try {
            this.view = new RenderGrid(gridHost, this.gridProps(this.props));
        } catch (error) {
            gridHost.replaceChildren();
            throw error;
        }
        this.startStatsTimer();
    }

    protected onUpdate(props: GridDemoProps): void {
        this.view?.setOptions(this.gridProps(props));
        this.syncStatsVisibility();
        if (props.showStats ?? true) this.startStatsTimer();
        else this.stopStatsTimer();
        this.updateStatsText();
    }

    private gridProps(props: GridDemoProps): RenderGridShellOptions {
        const rowHeight: ElementLength = props.variableRowHeight
            ? (row: number) => row % 3 === 0
                ? (props.rowHeight ?? 24) * 2
                : (props.rowHeight ?? 24)
            : (props.rowHeight ?? 24);
        const columnWidth: ElementLength = props.percentWidth
            ? (() => `${Math.floor(100 / Math.max(1, props.columnCount ?? 6))}%` as Percent) as ElementLength
            : 120;
        return {
            name: "render-grid-story",
            rowCount: props.rowCount ?? 10000,
            columnCount: props.columnCount ?? 6,
            rowHeight,
            columnWidth,
            renderCell,
            overscanRow: props.overscanRow ?? 2,
            stickyTop: props.stickyTop ?? 1,
            stickyBottom: props.stickyBottom ?? 0,
            stickyLeft: props.stickyLeft ?? 1,
            stickyRight: props.stickyRight ?? 0,
            fitToWidth: props.fitToWidth,
            height: "100%",
            keepCellsAttached: true,
        };
    }

    private syncStatsVisibility(): void {
        if (!this.statsElement) return;
        if ((this.props.showStats ?? true) && !this.statsElement.isConnected) {
            this.root.insertBefore(this.statsElement, this.root.firstChild);
        } else if (!(this.props.showStats ?? true) && this.statsElement.isConnected) {
            this.statsElement.remove();
        }
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

/**
 * The id stays `virtual-grid` while the name is `RenderGrid`, and the mismatch is deliberate: the
 * id is a persisted key. A stored storybook selection or a deep link written before EPIC-079
 * retired the `uikit/VirtualGrid` fork still points at it, and renaming would silently break those
 * for no user-visible gain. The name is what anyone actually reads.
 */
export const renderGridStory: Story<GridDemoProps> = {
    id: "virtual-grid", name: "RenderGrid", section: "Lists", view: RenderGridDemoView,
    props: [
        { name: "rowCount", type: "number", default: 10000, min: 0, step: 100 }, { name: "columnCount", type: "number", default: 6, min: 1, max: 40 },
        { name: "rowHeight", type: "number", default: 24, min: 12, max: 80 }, { name: "variableRowHeight", type: "boolean", default: false },
        { name: "fitToWidth", type: "boolean", default: false }, { name: "percentWidth", type: "boolean", default: false },
        { name: "stickyTop", type: "number", default: 1, min: 0, max: 3 }, { name: "stickyBottom", type: "number", default: 0, min: 0, max: 3 },
        { name: "stickyLeft", type: "number", default: 1, min: 0, max: 3 }, { name: "stickyRight", type: "number", default: 0, min: 0, max: 3 },
        { name: "overscanRow", type: "number", default: 2, min: 0, max: 20 }, { name: "showStats", type: "boolean", default: true },
    ],
};

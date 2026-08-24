import { VanillaView } from "../shared/vanilla-view";
import { applyCellStyle } from "./cell-style";
import {
    VirtualGridView,
    type VirtualGridProps,
} from "./VirtualGridView";
import { VirtualFlexGridModel } from "./VirtualFlexGridModel";
import type { VirtualGridModel } from "./VirtualGridModel";
import type { RenderCellParams } from "./types";

export type VirtualFlexCellParams = RenderCellParams;
export type VirtualFlexCellFunc = (p: VirtualFlexCellParams) => HTMLElement | undefined;

export interface VirtualFlexGridProps
    extends Omit<VirtualGridProps, "renderCell" | "onView"> {
    onModel?: (model: VirtualGridModel | null) => void;
    minRowHeight?: number;
    maxRowHeight?: number;
    renderCell: VirtualFlexCellFunc;
    getInitialRowHeight?: (row: number) => number | undefined;
    preferMinHeightForNewRows?: boolean;
}

export class VirtualFlexGridView extends VanillaView<VirtualFlexGridProps> {
    private readonly measurement: VirtualFlexGridModel;
    private grid: VirtualGridView | undefined;
    private observer: ResizeObserver | undefined;
    private rowByElement = new WeakMap<HTMLElement, number>();
    private inert = false;

    /** Keep this renderer's identity stable: VirtualGridModel uses it as an input gate. */
    private readonly renderCell: VirtualFlexCellFunc = (p) => {
        const cell = this.props.renderCell(p);
        if (!cell) return undefined;
        applyCellStyle(cell, p.style);

        // The row is rewritten for both `previous` and pooled cells. The measurement layer has
        // no dependency on a consumer's retained cell-record shape.
        this.rowByElement.set(cell, p.row);
        this.observer?.observe(cell);
        this.measurement.setRowHeight(p.row, cell.clientHeight);
        return cell;
    };

    private readonly onResize = (entries: ResizeObserverEntry[]): void => {
        if (this.inert) return;
        for (const entry of entries) {
            const target = entry.target;
            if (!(target instanceof HTMLElement)) continue;
            const row = this.rowByElement.get(target);
            if (row === undefined) continue;
            this.measurement.setRowHeight(row, target.clientHeight);
        }
    };

    private readonly onCellReleased = (element: HTMLElement): void => {
        this.observer?.unobserve(element);
        this.rowByElement.delete(element);
        this.props.onCellReleased?.(element);
    };

    private readonly onGridView = (view: VirtualGridView | null): void => {
        this.measurement.setGridModel(view?.model ?? null);
        this.props.onModel?.(view?.model ?? null);
    };

    public constructor(props: VirtualFlexGridProps) {
        super(props, document.createElement("div"));
        this.root.dataset.type = "virtual-flex-grid";
        this.root.style.display = "flex";
        this.root.style.flexDirection = "column";
        this.root.style.flex = "1 1 auto";
        this.root.style.minWidth = "0";
        this.root.style.minHeight = "0";
        this.applyName(props.name);

        this.measurement = new VirtualFlexGridModel(props);

        // VanillaView disposes these FIFO. The inner grid is deliberately not a child: it must be
        // disposed only after observers and delayed measurement callbacks are inert.
        this.own(() => { this.inert = true; });
        this.own(() => this.measurement.dispose());
        this.own(() => {
            this.observer?.disconnect();
            this.observer = undefined;
            this.rowByElement = new WeakMap<HTMLElement, number>();
        });
        this.own(() => {
            this.grid?.dispose();
            this.grid = undefined;
        });
    }

    protected onMount(): void {
        this.observer = new ResizeObserver(this.onResize);

        const grid = new VirtualGridView(this.gridOptions(this.props));
        this.grid = grid;
        this.measurement.setGridModel(grid.model);
        this.root.append(grid.root);
        grid.mount();
    }

    protected onUpdate(props: VirtualFlexGridProps): void {
        this.measurement.setProps(props);
        this.applyName(props.name);
        this.grid?.update(this.gridOptions(props));
    }

    private gridOptions(props: VirtualFlexGridProps): VirtualGridProps {
        const {
            renderCell: _renderCell,
            onModel: _onModel,
            minRowHeight: _minRowHeight,
            maxRowHeight: _maxRowHeight,
            getInitialRowHeight: _getInitialRowHeight,
            preferMinHeightForNewRows: _preferMinHeightForNewRows,
            ...gridProps
        } = props;

        return {
            ...gridProps,
            rowHeight: this.measurement.rowHeight,
            renderCell: this.renderCell,
            onView: this.onGridView,
            onCellReleased: this.onCellReleased,
        };
    }

    private applyName(name: string | undefined): void {
        if (name === undefined) this.root.removeAttribute("data-name");
        else this.root.setAttribute("data-name", name);
    }
}

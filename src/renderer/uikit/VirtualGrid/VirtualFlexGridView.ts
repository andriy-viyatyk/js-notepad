import { VanillaView } from "../shared/vanilla-view";
import { applyCellStyle } from "./cell-style";
import {
    VirtualGridView,
    type VirtualGridProps,
} from "./VirtualGridView";
import { VirtualFlexGridModel } from "./VirtualFlexGridModel";
import type { GridModelCapability, RenderCellParams } from "./types";

export type VirtualFlexCellParams = RenderCellParams & {
    measure: (element: HTMLElement) => void;
};
export type VirtualFlexCellFunc = (p: VirtualFlexCellParams) => HTMLElement | undefined;

export interface VirtualFlexGridProps
    extends Omit<VirtualGridProps, "renderCell" | "onView"> {
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
    private nominatedByCell = new WeakMap<HTMLElement, HTMLElement>();
    private inert = false;

    /** Keep this renderer's identity stable: VirtualGridModel uses it as an input gate. */
    private readonly renderCell: VirtualFlexCellFunc = (p) => {
        let nominated: HTMLElement | undefined;
        const cell = this.props.renderCell({
            ...p,
            measure: (element) => {
                nominated = element;
            },
        });
        if (!cell) return undefined;
        applyCellStyle(cell, p.style, p.row, p.col, p.renderInfo.input.columnCount);

        const previous = this.nominatedByCell.get(cell);
        const target = nominated ?? cell;
        if (previous && previous !== target) {
            this.observer?.unobserve(previous);
            this.rowByElement.delete(previous);
        }

        // The row is rewritten for both `previous` and pooled cells. The measurement layer has
        // no dependency on a consumer's retained cell-record shape. Consumers nominate their
        // content root; fixed-height consumers retain the cell as the fallback target.
        this.nominatedByCell.set(cell, target);
        this.rowByElement.set(target, p.row);
        this.observer?.observe(target);
        this.measurement.setRowHeight(p.row, target.clientHeight);
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
        const target = this.nominatedByCell.get(element) ?? element;
        this.observer?.unobserve(target);
        this.rowByElement.delete(target);
        this.nominatedByCell.delete(element);
        this.props.onCellReleased?.(element);
    };

    private readonly onCellAttached = (element: HTMLElement): void => {
        const target = this.nominatedByCell.get(element);
        if (!target) return;
        const row = this.rowByElement.get(target);
        if (row === undefined) return;
        this.measurement.setRowHeight(row, target.clientHeight);
        requestAnimationFrame(() => {
            if (this.inert) return;
            if (this.nominatedByCell.get(element) !== target) return;
            if (this.rowByElement.get(target) !== row) return;
            this.measurement.setRowHeight(row, target.clientHeight);
        });
    };

    /** The scrolling element of the grid this flex host owns — see `VirtualGridView`. */
    get scrollElement(): HTMLElement | undefined {
        return this.grid?.scrollElement;
    }

    /** The stable inner grid capability, available after this wrapper has mounted. */
    get gridModel(): GridModelCapability | null {
        return this.grid?.model ?? null;
    }

    private readonly onGridView = (view: VirtualGridView | null): void => {
        this.measurement.setGridModel(view?.model ?? null);
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
            this.nominatedByCell = new WeakMap<HTMLElement, HTMLElement>();
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
            minRowHeight: _minRowHeight,
            maxRowHeight: _maxRowHeight,
            getInitialRowHeight: _getInitialRowHeight,
            preferMinHeightForNewRows: _preferMinHeightForNewRows,
            ...gridProps
        } = props;

        return {
            ...gridProps,
            // The inner grid measures its root, so a flex wrapper must give it a definite
            // viewport height. Preserve an explicit height and the grow-to-content mode.
            height: props.height ?? (props.growToHeight ? undefined : "100%"),
            rowHeight: this.measurement.rowHeight,
            renderCell: this.renderCell,
            onView: this.onGridView,
            onCellAttached: this.onCellAttached,
            onCellReleased: this.onCellReleased,
        };
    }

    private applyName(name: string | undefined): void {
        if (name === undefined) this.root.removeAttribute("data-name");
        else this.root.setAttribute("data-name", name);
    }
}

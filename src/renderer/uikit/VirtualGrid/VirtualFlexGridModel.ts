import { debounce } from "../../core/utils/debounce";
import { memorize } from "../../core/utils/memorize";
import { defaultRowHeight } from "./VirtualGridModel";
import type { GridModelCapability, ElementLength } from "./types";

const ROW_HEIGHT_DEBOUNCE_MS = 50;

export interface VirtualFlexGridHeightOptions {
    rowHeight?: ElementLength;
    minRowHeight?: number;
    maxRowHeight?: number;
    getInitialRowHeight?: (row: number) => number | undefined;
    preferMinHeightForNewRows?: boolean;
}

/** Owns measured-row policy while VirtualGridModel remains the geometry owner. */
export class VirtualFlexGridModel {
    /** Committed row heights, used by the stable row-height function. */
    readonly rowHeights: number[] = [];
    /** Latest measured values, held apart from committed geometry during the debounce. */
    private readonly pendingHeights: number[] = [];

    private props: VirtualFlexGridHeightOptions;
    private gridModel: GridModelCapability | null = null;
    private lastRowHeight = 0;
    private live = true;
    private disposed = false;

    /** The function identity must stay stable so VirtualGridModel's input gate can work. */
    readonly rowHeight = (row: number): number => {
        if (this.rowHeights[row] !== undefined) {
            return this.rowHeights[row];
        }

        const initialHeight = this.props.getInitialRowHeight?.(row);
        if (initialHeight !== undefined) {
            return this.clampHeight(initialHeight);
        }

        if (this.props.preferMinHeightForNewRows) {
            return this.props.minRowHeight || this.defaultFlexRowHeight;
        }
        return this.lastRowHeight || this.defaultFlexRowHeight;
    };

    private readonly getRowUpdater = memorize((row: number) =>
        // `debounce` waits while canRun is false, so the callback itself also checks `live`.
        // Disposal permits one final no-op callback rather than leaving a timer retrying forever.
        debounce(
            () => {
                if (this.live) this.commitRowHeight(row);
            },
            ROW_HEIGHT_DEBOUNCE_MS,
            () => this.live || this.disposed,
        )
    );

    constructor(props: VirtualFlexGridHeightOptions) {
        this.props = props;
    }

    setProps(props: VirtualFlexGridHeightOptions): void {
        if (this.disposed) return;
        this.props = props;
    }

    setGridModel(model: GridModelCapability | null): void {
        if (this.disposed) return;
        this.gridModel = model;
    }

    setRowHeight(row: number, height: number): void {
        if (!this.live || height === 0) return;

        const applyHeight = this.clampHeight(height);
        if (this.pendingHeights[row] === applyHeight) return;

        this.pendingHeights[row] = applyHeight;
        this.getRowUpdater(row)();
    }

    dispose(): void {
        if (this.disposed) return;
        this.live = false;
        this.disposed = true;
        this.gridModel = null;
    }

    private get defaultFlexRowHeight(): number {
        if (this.props.rowHeight && typeof this.props.rowHeight === "number") {
            return this.props.rowHeight;
        }
        return defaultRowHeight;
    }

    private commitRowHeight(row: number): void {
        const height = this.pendingHeights[row];
        if (height === undefined || this.rowHeights[row] === height) return;

        this.lastRowHeight = height;
        this.rowHeights[row] = height;
        this.gridModel?.update({ fromRow: row });
    }

    private clampHeight(height: number): number {
        let clamped = this.props.maxRowHeight
            ? Math.min(height, this.props.maxRowHeight)
            : height;
        clamped = Math.max(clamped, this.props.minRowHeight || 24);
        return clamped;
    }
}

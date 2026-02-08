import { forwardRef, ReactNode, useCallback, useEffect, useRef } from "react";
import { TComponentModel, useComponentModel } from "../../../core/state/model";
import RenderGridModel, {
    defaultRowHeight,
    RenderGridProps,
} from "./RenderGridModel";
import { RenderCellParams } from "./types";
import RenderGrid from "./RenderGrid";
import { debounce } from "../../../../shared/utils";
import { memorize } from "../../../core/utils/memorize";

export interface RenderFlexCellParams extends RenderCellParams {
    maxRowHeight?: number;
    setRowHeight?: (row: number, height: number) => void;
    ref?: React.RefObject<HTMLDivElement>;
}

export type RenderFlexCellFunc = (p: Omit<RenderFlexCellParams, "key">) => ReactNode;

function FlexCell({
    p,
}: {
    p: RenderFlexCellParams & {
        renderCell: RenderFlexCellFunc;
    };
}) {
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const updateHeight = () => {
            if (ref.current) {
                const innerHeight = ref.current.clientHeight;
                p.setRowHeight(p.row, innerHeight);
            }
        };

        const observer = new ResizeObserver(updateHeight);

        if (ref.current) {
            observer.observe(ref.current);
            updateHeight();
        }

        return () => {
            observer.disconnect();
        };
    }, [p.row, p.setRowHeight]);

    const {key, ...restP} = p;
    const newP = { ...restP, ref };

    return (
        <div
            style={p.style}
            key={p.key}
            className={`flex-cell flex-cell-row-${p.row}`}
        >
            {p.renderCell(newP)}
        </div>
    );
}

export interface RenderFlexGridProps
    extends Omit<RenderGridProps, "renderCell"> {
    minRowHeight?: number;
    maxRowHeight?: number;
    renderCell: RenderFlexCellFunc;
    /** Optional function to provide initial row heights before measurement */
    getInitialRowHeight?: (row: number) => number | undefined;
}

const defaultRenderFlexGridState = {
    rowHeight: undefined as ((row: number) => number) | undefined,
};

type RenderFlexGridState = typeof defaultRenderFlexGridState;

// Debounce delay for row height updates (ms)
const ROW_HEIGHT_DEBOUNCE_MS = 50;

class RenderFlexGridModel extends TComponentModel<
    RenderFlexGridState,
    RenderFlexGridProps
> {
    /** Committed row heights (only updated after debounce settles) */
    rowHeights: number[] = [];
    /** Pending row heights (updated immediately, committed after debounce) */
    private pendingHeights: number[] = [];
    gridModel: RenderGridModel | null = null;
    private lastRowHeight = 0;

    /** Per-row debounced update function */
    private getRowUpdater = memorize((row: number) =>
        debounce(() => this.commitRowHeight(row), ROW_HEIGHT_DEBOUNCE_MS)
    );

    setGridModel = (model: RenderGridModel) => {
        this.gridModel = model;
    };

    // Called by TComponentModel on every render
    setProps = () => {
        // Initialize rowHeight function on first render to include getInitialRowHeight
        if (this.state.get().rowHeight === undefined) {
            this.updateRowHeight();
        }
    };

    get defaultFlexRowHeight() {
        if (this.props.rowHeight && typeof this.props.rowHeight === "number") {
            return this.props.rowHeight;
        }
        return defaultRowHeight;
    }

    setRowHeight = (row: number, height: number) => {
        if (height === 0) {
            return;
        }
        let applyHeight = this.props.maxRowHeight
            ? Math.min(height, this.props.maxRowHeight)
            : height;
        applyHeight = Math.max(
            applyHeight,
            this.props.minRowHeight || 24
        );

        // Skip if no change needed
        if (this.pendingHeights[row] === applyHeight) {
            return;
        }

        // Store in pending, not committed (prevents intermediate values from causing jumps)
        this.pendingHeights[row] = applyHeight;
        // Schedule debounced commit
        this.getRowUpdater(row)();
    };

    /** Commit pending height to the actual rowHeights array */
    private commitRowHeight = (row: number) => {
        const height = this.pendingHeights[row];
        if (height === undefined || this.rowHeights[row] === height) {
            return;
        }
        this.lastRowHeight = height;
        this.rowHeights[row] = height;
        this.updateRowHeight(row);
    };

    private readonly updateRowHeight = (updatedRow?: number) => {
        this.state.update((s) => {
            s.rowHeight = (row: number) => {
                // Priority: committed height > initial height > lastRowHeight > default
                if (this.rowHeights[row] !== undefined) {
                    return this.rowHeights[row];
                }
                const initialHeight = this.props.getInitialRowHeight?.(row);
                if (initialHeight !== undefined) {
                    return initialHeight;
                }
                return this.lastRowHeight || this.defaultFlexRowHeight;
            };
        });
        if (updatedRow !== undefined) {
            this.gridModel?.update({ rows: [updatedRow] });
        }
    };
}

export const RenderFlexGrid = forwardRef<RenderGridModel, RenderFlexGridProps>(
    function RenderFlexGrid(props, ref) {
        const model = useComponentModel(
            props,
            RenderFlexGridModel,
            defaultRenderFlexGridState
        );
        const state = model.state.use();
        const { renderCell, maxRowHeight, ...restProps } = props;


        const renderFlexCell = useCallback(
            (p: RenderCellParams) => {
                const flexP = {
                    ...p,
                    maxRowHeight,
                    setRowHeight: model.setRowHeight,
                };
                return (
                    <FlexCell key={p.key} p={{ ...flexP, renderCell }} />
                );
            },
            [maxRowHeight, model.setRowHeight, renderCell]
        );

        return (
            <RenderGrid
                ref={(instance) => {
                    model.setGridModel(instance);
                    if (typeof ref === "function") {
                        ref(instance);
                    } else if (ref) {
                        (ref as React.RefObject<any>).current = instance;
                    }
                }}
                {...restProps}
                rowHeight={state.rowHeight}
                renderCell={renderFlexCell}
            />
        );
    }
);

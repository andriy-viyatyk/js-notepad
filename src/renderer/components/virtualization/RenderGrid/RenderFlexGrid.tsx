import { forwardRef, ReactNode, useCallback, useEffect, useRef } from "react";
import { TComponentModel, useComponentModel } from "../../../core/state/model";
import RenderGridModel, {
    defaultRowHeight,
    RenderGridProps,
} from "./RenderGridModel";
import { RenderCellParams } from "./types";
import RenderGrid from "./RenderGrid";

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
                console.log("Measured cell height:", innerHeight);
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
}

const defaultRenderFlexGridState = {
    rowHeight: undefined as ((row: number) => number) | undefined,
};

type RenderFlexGridState = typeof defaultRenderFlexGridState;

class RenderFlexGridModel extends TComponentModel<
    RenderFlexGridState,
    RenderFlexGridProps
> {
    rowHeights: number[] = [];
    gridModel: RenderGridModel | null = null;
    private lastRowHeight = 0;

    setGridModel = (model: RenderGridModel) => {
        this.gridModel = model;
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
        if (this.rowHeights[row] === applyHeight) {
            return;
        }
        this.lastRowHeight = applyHeight;
        this.rowHeights[row] = applyHeight;
        this.updateRowHeight(row);
    };

    private readonly updateRowHeight = (updatedRow?: number) => {
        setTimeout(() => {
            this.state.update((s) => {
                s.rowHeight = (row: number) =>
                    this.rowHeights[row] ?? (this.lastRowHeight || this.defaultFlexRowHeight);
            });
            if (updatedRow !== undefined) {
                this.gridModel?.update({ rows: [updatedRow] });
            }
        }, 0);
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

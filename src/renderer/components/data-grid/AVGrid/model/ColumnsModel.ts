import { useEffect } from "react";
import { range } from "../../../../core/utils/utils";
import { Column } from "../avGridTypes";
import { AVGridModel } from "./AVGridModel";

export const defaultColumnWidth = 140;

export class ColumnsModel<R> {
    readonly model: AVGridModel<R>;

    constructor(model: AVGridModel<R>) {
        this.model = model;
        this.model.events.onColumnResize.subscribe(this.onColumnResize);
        this.model.events.onColumnsReorder.subscribe(this.onColumnsReorder);
    }

    get columnCount() {
        return this.model.data.columns.length;
    }

    get firstEditable() {
        const index = this.model.data.columns.findIndex(
            (c) => !c.readonly && !c.isStatusColumn,
        );
        return index === -1
            ? undefined
            : {
                  col: this.model.data.columns[index],
                  index,
              };
    }

    getColumnWidth = (idx: number) =>
        this.model.data.columns[idx]?.width ?? defaultColumnWidth;

    useModel = () => {
        const propsColumns = this.model.props.columns;

        useEffect(() => {
            this.updateColumnsData(propsColumns);
        }, [propsColumns]);
    };

    updateColumns = (updateFunc: (columns: Column<R>[]) => Column<R>[]) => {
        this.model.props.setColumns?.(updateFunc);
    };

    private onColumnResize = (data?: { columnKey: string; width: number }) => {
        if (!data) return;
        const { columnKey, width } = data;
        if (width < 20) return;
        this.model.props.setColumns?.((columns) =>
            columns.map((c) =>
                c.key === columnKey ? { ...c, width } : c,
            ),
        );
    };

    private onColumnsReorder = (data?: {
        sourceKey: string;
        targetKey: string;
    }) => {
        if (!data) return;
        const { sourceKey, targetKey } = data;
        this.model.props.setColumns?.((columns) => {
            const sourceColumnIndex = columns.findIndex(
                (c) => c.key === sourceKey,
            );
            const targetColumnIndex = columns.findIndex(
                (c) => c.key === targetKey,
            );
            const reorderedColumns = [...columns];
            reorderedColumns.splice(
                targetColumnIndex,
                0,
                reorderedColumns.splice(sourceColumnIndex, 1)[0],
            );

            this.model.update?.({
                columns: range(sourceColumnIndex, targetColumnIndex),
            });

            return reorderedColumns;
        });
    };

    private updateColumnsData = (propsColumns?: Column<R>[]) => {
        const columns = propsColumns;
        if (!columns) return;

        let lastIsStatusIndex = -1;
        columns.forEach((c, idx) => {
            if (c.isStatusColumn) lastIsStatusIndex = idx;
        });

        this.model.data.lastIsStatusIndex = lastIsStatusIndex;
        this.model.data.columns = columns.filter((c) => !c.hidden);
        this.model.data.change();
        this.model.rerender();
    };
}

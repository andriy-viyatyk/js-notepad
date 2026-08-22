import { useMemo } from "react";

import { DefaultView, ViewPropsRO, Views } from "../../../core/state/view";
import {
    DataGrid,
    type CellEditEvent,
    type Column,
    type DataGridInstance,
    type DataType,
} from "../../../uikit/DataGrid";
import { Popover } from "../../../uikit/Popover";
import { TComponentState } from "../../../core/state/state";
import { TPopperModel } from "../../../ui/dialogs/poppers/types";
import { parseBoolean, parseNumber, parseString } from "../../../core/utils/parse-utils";
import { showPopper, visiblePoppers } from "../../../ui/dialogs/poppers/Poppers";
import { Panel } from "../../../uikit/Panel";
import { Button } from "../../../uikit/Button";
import { Spacer } from "../../../uikit/Spacer";
import { Text } from "../../../uikit/Text";

const minWidth = 240;
const minHeight = 160;
const maxWidth = 440;
const maxHeight = 300;

/**
 * The popover's own columns — and none of them is a status column any more.
 *
 * All three carried `isStatusColumn: true` under the React grid, where it only affected the
 * *header*: no resize, no drag-reorder. av-grid reads it as "not a data column" and therefore
 * **refuses to edit it** (`EditingModel`), which would have made this popover — whose entire job
 * is editing these three fields — read-only. The header intent that still matters is expressed
 * directly with `resizable`.
 *
 * What is lost is that the user can now drag these three headers around. It is cosmetic: this
 * grid's column layout is not persisted, so a reorder lasts until the popover closes.
 */
const getColumns = (isCsv: boolean): Column[] => [
    {
        key: "visible",
        dataType: "boolean",
        name: "👁",
        width: 40,
        resizable: false,
    },
    {
        key: "newDataType",
        name: "Type",
        options: ["string", "number", "boolean"],
        width: 100,
        resizable: true,
        hidden: isCsv,
    },
    {
        key: "newKey",
        name: "Key*",
        resizable: true,
        width: 240,
    },
];

interface EditColumnRow {
    idx: string;
    oldHidden?: boolean;
    visible: boolean;
    oldKey?: string;
    newKey?: string;
    oldName?: string;
    newName?: string;
    oldDataType?: DataType;
    newDataType?: DataType;
}

const getRowKey = (row: EditColumnRow) => row.idx;

/**
 * `rows` is **not** here (US-1020 / D1). This popover's grid owns its own row array the same way
 * the editor's does — immer would deep-freeze anything put into this state, and av-grid writes
 * `row[key] = value` itself when a cell is edited. The rows live on the model as a plain field
 * and are read back through `getRows()`.
 */
const defaultColumnsOptionsState = {
    deleted: [] as EditColumnRow[],
    changed: false,
    error: "",
};

type ColumnsOptionsState = typeof defaultColumnsOptionsState;

class ColumnsOptionsModel extends TPopperModel<ColumnsOptionsState, undefined> {
    el = undefined as Element | undefined;
    /** The editor's grid, whose columns this popover edits. */
    gridModel = undefined as DataGridInstance<any> | undefined;
    /** This popover's own grid, which owns the `EditColumnRow` array. */
    grid = undefined as DataGridInstance<EditColumnRow> | undefined;
    /** The rows, before this popover's grid exists to own them. */
    rows = [] as EditColumnRow[];
    isCsv = false;
    onUpdateRows = undefined as
        | ((updateFunc: (rows: any[]) => any[]) => void)
        | undefined;
    width = undefined as number | undefined;
    height = undefined as number | undefined;
    rowIndex = 0;

    prepareEditColumns = () => {
        const columns = this.gridModel?.getColumns() ?? [];
        this.rows = columns.map((col) => ({
            idx: (this.rowIndex++).toString(),
            oldHidden: col.hidden,
            visible: !col.hidden,
            oldKey: col.key.toString(),
            newKey: col.key.toString(),
            oldName: col.name,
            newName: col.name,
            oldDataType: col.dataType,
            newDataType: col.dataType,
        }));
    };

    calcInitialSize = () => {
        const width = this.gridModel?.element.offsetWidth;
        const height = this.gridModel?.element.offsetHeight;
        if (width && height) {
            this.width = Math.min(Math.max(width, minWidth), maxWidth);
            this.height = Math.min(Math.max(height, minHeight), maxHeight);
        }
    };

    setGrid = (grid: DataGridInstance<EditColumnRow> | null) => {
        this.grid = grid ?? undefined;
    };

    /** The edit rows, wherever they currently live. */
    private liveRows = (): EditColumnRow[] => {
        return (this.grid?.getRows() as EditColumnRow[] | undefined) ?? this.rows;
    };

    /** The rows the view hands back on every render — the grid's own array, never a stale seed. */
    rowsForGrid = (): readonly EditColumnRow[] => this.liveRows();

    private markChanged = () => {
        if (this.state.get().changed) return;
        this.state.update((s) => {
            s.changed = true;
        });
    };

    /**
     * A key was typed — carry it into the caption unless the caption was set by hand.
     *
     * av-grid has already written `row[columnKey]` by the time this runs, so the "previous" key
     * is not available to compare against. `oldName` is, and it is the better test anyway: the
     * caption tracks the key while it still matches the key it was derived from.
     */
    onEdit = (edit: CellEditEvent<EditColumnRow>) => {
        const row = edit.row;
        if (edit.columnKey === "newKey" && (!row.newName || row.newName === row.oldName)) {
            row.newName = edit.value;
        }
        this.markChanged();
    };

    onAddRows = () => {
        this.markChanged();
    };

    newRow = (): EditColumnRow => ({
        idx: (this.rowIndex++).toString(),
        visible: true,
        newDataType: "string" as DataType,
    });

    onDeleteRows = (e: { rows: readonly EditColumnRow[] }) => {
        const removed = [...e.rows];
        this.state.update((s) => {
            s.deleted = [...s.deleted, ...removed];
            s.changed = true;
        });
    };

    private updateRows = (rows: any[]) => {
        const columns = this.liveRows();
        const { deleted } = this.state.get();
        const deletedKeys = deleted
            .map((r) => r.oldKey)
            .filter((key) => !columns.find((c) => c.newKey === key));
        const changedKeys = columns.filter(
            (c) => c.oldKey && c.oldKey !== c.newKey
        );
        const changedTypes = columns.filter(
            (c) => c.oldKey && c.oldDataType !== c.newDataType
        );

        if (!deletedKeys.length && !changedKeys.length && !changedTypes.length) {
            return rows;
        }

        return rows.map((row) => {
            const newRow = { ...row };
            for (const delKey of deletedKeys) {
                delete newRow[delKey];
            }
            for (const change of changedKeys) {
                newRow[change.newKey] = newRow[change.oldKey];
                delete newRow[change.oldKey];
            }
            for (const change of changedTypes) {
                switch (change.newDataType) {
                    case "number":
                        newRow[change.newKey] = parseNumber(
                            newRow[change.newKey]
                        );
                        break;
                    case "boolean":
                        newRow[change.newKey] = parseBoolean(
                            newRow[change.newKey]
                        );
                        break;
                    default:
                        newRow[change.newKey] = parseString(
                            newRow[change.newKey]
                        );
                        break;
                }
            }
            return newRow;
        });
    };

    private updateColumns = (columns: Column[]): Column[] => {
        const rows = this.liveRows();

        return rows
            .filter((r) => r.newKey)
            .map((row) => {
                const existing = columns.find((c) => c.key === row.oldKey);
                return {
                    ...existing,
                    key: row.newKey,
                    name: row.newName || row.newKey,
                    dataType: row.newDataType,
                    hidden: !row.visible,
                    ...(existing
                        ? {}
                        : {
                              resizible: true,
                              filterType: "options",
                          }),
                };
            });
    };

    private validate = () => {
        const keys = new Set<string>();
        const rows = this.liveRows();
        for (const row of rows) {
            if (row.newKey) {
                if (keys.has(row.newKey)) {
                    this.state.update((s) => {
                        s.error = "Duplicate key";
                    });
                    return false;
                }
                keys.add(row.newKey);
            } else {
                this.state.update((s) => {
                    s.error = "Key is required";
                });
                return false;
            }
        }
        return true;
    };

    applyChanges = () => {
        if (!this.validate()) {
            return;
        }
        // Rows first, then columns — the order matters now, where it did not under the React
        // grid. `setColumns` validates the new keys against the rows the grid currently holds,
        // and exempts only keys it already has, so applying a **rename** before the row data
        // carries the new key throws `Unknown column`. Rewriting the rows first means every new
        // key is in the data by the time the columns arrive.
        this.onUpdateRows?.(this.updateRows);
        const grid = this.gridModel;
        if (grid) grid.setColumns(this.updateColumns(grid.getColumns()));
        this.close(undefined);
    };
}

const defaultOffset = [0, 2] as [number, number];
const showColumnsOptionsId = Symbol("ShowColumnsOptions");

export function ColumnsOptions({ model }: ViewPropsRO<ColumnsOptionsModel>) {
    const state = model.state.use();

    const columns = useMemo(() => getColumns(model.isCsv), [model.isCsv]);

    return (
        <Popover
            key="avgrid-columns-options"
            elementRef={model.el}
            offset={defaultOffset}
            open
            onClose={() => {
                if (visiblePoppers().length === 1 && !state.changed) {
                    model.close(undefined);
                }
            }}
            placement="bottom-start"
            resizable
        >
            <Panel
                name="columns-options"
                direction="column"
                flex={1}
                position="relative"
                minWidth={model.width ?? minWidth}
                minHeight={model.height ?? minHeight}
            >
                <Panel
                    direction="row"
                    background="dark"
                    paddingX="sm"
                    paddingY="xs"
                    borderBottom
                >
                    <Text size="sm" color="light">Edit Columns</Text>
                </Panel>
                <DataGrid
                    name="columns-options-grid"
                    columns={columns}
                    rows={model.rowsForGrid()}
                    getRowKey={getRowKey}
                    rowNoun="column"
                    disableSorting
                    editable
                    canAddRows
                    canDeleteRows
                    newRow={model.newRow}
                    onGrid={model.setGrid}
                    onEdit={model.onEdit}
                    onAddRows={model.onAddRows}
                    onDeleteRows={model.onDeleteRows}
                />
                {state.changed && (
                    <Panel
                        direction="row"
                        align="center"
                        justify="end"
                        gap="lg"
                        paddingX="lg"
                        paddingY="xs"
                    >
                        {Boolean(state.error) && (
                            <Text color="error">{state.error}</Text>
                        )}
                        <Spacer />
                        <Button name="columns-options-cancel" onClick={() => model.close(undefined)}>
                            Cancel
                        </Button>
                        <Button name="columns-options-apply" variant="primary" onClick={() => model.applyChanges()}>
                            Apply
                        </Button>
                    </Panel>
                )}
            </Panel>
        </Popover>
    );
}

Views.registerView(showColumnsOptionsId, ColumnsOptions as DefaultView);

export const showColumnsOptions = async (
    el: Element,
    gridModel: DataGridInstance<any>,
    isCsv: boolean,
    onUpdateRows: (updateFunc: (rows: any[]) => any[]) => void
) => {
    const model = new ColumnsOptionsModel(
        new TComponentState(defaultColumnsOptionsState)
    );
    model.el = el;
    model.gridModel = gridModel;
    model.isCsv = isCsv;
    model.onUpdateRows = onUpdateRows;
    model.prepareEditColumns();
    model.calcInitialSize();
    await showPopper<void>({
        viewId: showColumnsOptionsId,
        model,
    });
};

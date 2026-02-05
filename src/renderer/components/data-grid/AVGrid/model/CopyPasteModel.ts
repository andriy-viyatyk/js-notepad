import { csvToRecords } from "../../../../core/utils/csv-utils";
import { toClipboard } from "../../../../core/utils/utils";
import { Column } from "../avGridTypes";
import { columnDisplayValue, rowsToCsvText } from "../avGridUtils";
import { recordsToClipboardFormatted } from "../utils";
import { AVGridModel } from "./AVGridModel";

export type CopyMode = 'copy' | 'copyWithHeaders' | 'copyAsJson' | 'copyAsHtmlTable';

export class CopyPasteModel<R> {
    readonly model: AVGridModel<R>;

    constructor(model: AVGridModel<R>) {
        this.model = model;
        this.model.events.content.onKeyDown.subscribe(this.onContentAreaKeyDown);
    }

    copySelection = (mode: CopyMode = 'copy') => {
        const { focus } = this.model.props;
        if (!focus) return;

        const selection = this.model.models.focus.getGridSelection();
        if (!selection) return;

        if (mode === 'copyAsJson') {
            this.copyAsJson(selection.rows, selection.columns);
            return;
        }

        if (mode === 'copyAsHtmlTable') {
            recordsToClipboardFormatted(selection.rows, selection.columns);
            return;
        }

        let text = '';
        if (selection.rows.length === 1 && selection.columns.length === 1) {
            text = columnDisplayValue(selection.columns[0], selection.rows[0]);
        } else {
            text =
                rowsToCsvText(selection.rows, selection.columns, mode === "copyWithHeaders", true) ??
                '';
        }
        toClipboard(text);
    }

    private copyAsJson = (rows: R[], columns: Column<R>[]) => {
        const jsonArray: any[] = [];
        for (const row of rows) {
            const jsonObj: any = {};
            for (const col of columns) {
                const key = typeof col.key === 'string' ? col.key : String(col.key);
                jsonObj[key] = columnDisplayValue(col, row);
            }
            jsonArray.push(jsonObj);
        }
        toClipboard(JSON.stringify(jsonArray, null, 4));
    }

    canPasteFromClipboard = async () => {
        const { focus } = this.model.props;
        if (!focus) return false;

        const selection = this.model.models.focus.getGridSelection();
        if (selection && selection.rows.length && selection.columns.length) {
            const text = await navigator.clipboard.readText(); // cause second context menu "Paste" in Firefox
            if (text) {
                return true;
            }
        }
        return false;
    }

    pasteFromClipboard = async () => {
        const { focus } = this.model.props;
        if (!focus) return;

        const selection = this.model.models.focus.getGridSelection();
        if (selection && selection.rows.length && selection.columns.length) {
            const text = await navigator.clipboard.readText();
            if (text) {
                let records = csvToRecords(text);
                if (!records.length && text?.length) {
                    records = [[text]];
                }
                if (records.length && records[0].length) {
                    let pasteColumns = selection.columns;
                    let pasteRows = selection.rows;
    
                    if (pasteColumns.length === 1 && pasteRows.length === 1) {
                        ({ pasteColumns, pasteRows } = this.expandPasteRange(records.length, records[0].length));
                    }

                    const sourceRowCount = records.length;
                    const sourceColCount = records[0].length;
                    let sourceRow = 0;
                    let sourceCol = 0;
                    for (const row of pasteRows) {
                        sourceCol = 0;
                        for (const col of pasteColumns) {
                            if (sourceRow < sourceRowCount && sourceCol < sourceColCount) {
                                this.model.models.editing.editCell(col, row, records[sourceRow][sourceCol]);
                                sourceCol++;
                                if (sourceCol === sourceColCount) {
                                    sourceCol = 0;
                                }
                            }
                        }
                        sourceRow++;
                        if (sourceRow === sourceRowCount) {
                            sourceRow = 0;
                        }
                    }
                    this.model.dataChanged();
                }
            }
        }
    }

    private expandPasteRange = (rowCount: number, colCount: number) => {
        let pasteColumns: Column<R>[] = [];
        let pasteRows: R[] = [];

        const { focus, setFocus, getRowKey, onAddRows, onAddColumns } = this.model.props;
        if (!focus) return { pasteColumns, pasteRows };
        const { rows, columns } = this.model.data;

        const startRowIndex = rows.findIndex(r => getRowKey(r) === focus.rowKey);
        const startColIndex = columns.findIndex(c => c.key === focus.columnKey);
        if (startRowIndex < 0 || startColIndex < 0) return { pasteColumns, pasteRows };

        let endRowIndex = startRowIndex + rowCount - 1;
        let newRows: R[] = [];
        if (endRowIndex >= rows.length && onAddRows) {
            newRows = this.model.actions.addRows(endRowIndex - rows.length + 1) ?? [];
            endRowIndex = rows.length - 1 + newRows.length;
        }

        let endColIndex = startColIndex + colCount - 1;
        let newColumns: Column<R>[] = [];
        if (endColIndex >= columns.length && onAddColumns) {
            newColumns = this.model.actions.addNewColumns(endColIndex - columns.length + 1) ?? [];
            endColIndex = columns.length - 1 + newColumns.length;
        }

        pasteColumns = columns.slice(startColIndex, endColIndex + 1).concat(newColumns);
        pasteRows = rows.slice(startRowIndex, endRowIndex + 1).concat(newRows);

        if (pasteColumns.length && pasteRows.length && setFocus) {
            Promise.resolve().then(() => {
                this.model.models.focus.selectRange(
                    startRowIndex + pasteRows.length - 1,
                    endColIndex,
                    startRowIndex,
                    startColIndex
                )
            });
        }

        return { pasteColumns, pasteRows };
    }

    private onContentAreaKeyDown = (e?: React.KeyboardEvent<HTMLDivElement>) => {
        if (!e) return;
        const { focus } = this.model.props;
        if (e.ctrlKey && focus) {
            switch (e.code) {
                case 'KeyC': {
                    this.copySelection(e.shiftKey ? 'copyWithHeaders' : 'copy');
                    break;
                }
                case 'KeyV': {
                    e.preventDefault();
                    e.stopPropagation();
                    this.pasteFromClipboard();
                    break;
                }
                default:
                    break;
            }
        }
    }
}
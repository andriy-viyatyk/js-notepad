import { SetStateAction } from "react";
import { debounce } from "../../../shared/utils";
import { TComponentModel } from "../../common/classes/model";
import { parseObject } from "../../common/parseUtils";
import { CellFocus, Column, TFilter, TFilterType } from "../../controls/AVGrid/avGridTypes";
import { AVGridModel } from "../../controls/AVGrid/model/AVGridModel";
import { filesModel } from "../../model/files-model";
import { TextFileModel } from "../../pages/text-file-page/TextFilePage.model";
import { resolveState } from "../../common/utils";
import { createIdColumn, getGridDataWithColumns, getRowKey, idColumnKey, removeIdColumn } from "./grid-page-utils";
import { csvToRecords } from "../../common/csvUtils";
import { defaultCompare, filterRows, rowsToCsvText } from "../../controls/AVGrid/avGridUtils";
import { TOnGetFilterOptions } from "../../controls/AVGrid/filters/useFilters";

export interface GridPageProps {
    model: TextFileModel;
}

export const defaultGridPageState = {
    columns: [] as Column[],
    rows: [] as any[],
    focus: undefined as CellFocus | undefined,
    search: "",
    filters: [] as TFilter[],
    csvDelimeter: ",",
    csvWithColumns: false,
};

type GridPageState = typeof defaultGridPageState;

export class GridPageModel extends TComponentModel<
    GridPageState,
    GridPageProps
> {
    private name = "grid-page";
    gridRef: AVGridModel<any> | undefined = undefined;
    maxRowId = 0;
    private loaded = false;
    private changedContent = "";
    private stateChangeSubscription: (() => void) | undefined = undefined;

    saveState = async () => {
        const state = this.state.get();
        const columns = this.gridRef?.data.columns || state.columns;
        const stateToSave = {
            columns: columns.map((c) => ({
                key: c.key,
                name: c.name,
                width: c.width,
                dataType: c.dataType,
            })),
            focus: {
                rowIndex: state.focus?.selection?.rowEnd,
                colIndex: state.focus?.selection?.colEnd,
            },
            search: state.search,
            filters: state.filters,
            sortColumn: this.gridRef?.state.get().sortColumn,
            csvDelimeter: state.csvDelimeter,
            csvWithColumns: state.csvWithColumns,
        };
        await filesModel.saveCacheFile(
            this.props.model.id,
            JSON.stringify(stateToSave),
            this.name
        );
    };

    saveStateDebounced = debounce(this.saveState, 300);

    restoreState = async () => {
        const data = await filesModel.getCacheFile(
            this.props.model.id,
            this.name
        );
        const savedState = parseObject(data) || {};
        if (Array.isArray(savedState.columns)) {
            this.state.update((s) => {
                s.columns = savedState.columns.map((c: any) => ({
                    key: c.key,
                    name: c.name,
                    width: c.width,
                    dataType: c.dataType,
                    filterType: "options" as TFilterType,
                    resizible: true,
                }));
            });
        }
        if (
            savedState.focus &&
            typeof savedState.focus.rowIndex === "number" &&
            typeof savedState.focus.colIndex === "number" &&
            this.gridRef
        ) {
            setTimeout(() => {
                this.gridRef.models.focus.focusCell(savedState.focus.rowIndex, savedState.focus.colIndex, true);
            }, 0);
        }
        if (typeof savedState.search === "string") {
            this.state.update((s) => {
                s.search = savedState.search;
            });
        }
        if (Array.isArray(savedState.filters)) {
            this.state.update((s) => {
                s.filters = savedState.filters;
            });
        }
        if (savedState.sortColumn && this.gridRef) {
            this.gridRef.state.update((s) => {
                s.sortColumn = savedState.sortColumn;
            });
        }
        if (typeof savedState.csvDelimeter === "string") {
            this.state.update((s) => {
                s.csvDelimeter = savedState.csvDelimeter;
            });
        }
        if (typeof savedState.csvWithColumns === "boolean") {
            this.state.update((s) => {
                s.csvWithColumns = savedState.csvWithColumns;
            });
        }
    };

    init = () => {
        this.stateChangeSubscription = this.state.subscribe(() => {
            this.saveStateDebounced();
        });
        this.restoreState();
    };

    dispose = () => {
        this.stateChangeSubscription?.();
    };

    setGridRef = (ref: AVGridModel<any> | null) => {
        this.gridRef = ref ?? undefined;
    };

    setFocus = (focus?: SetStateAction<CellFocus | undefined>) => {
        this.state.update((s) => {
            s.focus = focus ? resolveState(focus, () => s.focus) : undefined;
        });
    };

    setSearch = (search: string) => {
        this.state.update((s) => {
            s.search = search;
        });
    };

    clearSearch = () => {
        this.state.update((s) => {
            s.search = "";
        });
    };

    setFilters = (value: SetStateAction<TFilter[]>) => {
        this.state.update((s) => {
            s.filters = resolveState(value, () => this.state.get().filters);
        });
    };

    updateContent = (content: string) => {
        if (!this.loaded && this.gridRef?.data.columns.length) {
            this.loaded = true;
        }

        if (!this.loaded && content) {
            this.loadGridData(content);
            this.loaded = true;
        }

        if (this.changedContent !== content) {
            this.updateGridDataFromContent(content);
            this.changedContent = content;
        }
    };

    reaload = () => {
        const content = this.props.model.state.get().content || "";
        this.loadGridData(content);
    }

    private loadGridData = (content: string) => {
        let rows = [];
        let columns: Column[] = [];
        if (content) {
            const parsed = this.parseContent(content);
            if (parsed) {
                const data = getGridDataWithColumns(parsed);
                rows = data.rows;
                columns = data.columns;
                this.maxRowId = data.rows.length;
            }
        }
        this.state.update((s) => {
            s.rows = rows;
            s.columns = columns;
        });
        Promise.resolve().then(() => {
            this.gridRef?.models.focus.validateFocus();
        });
    };

    private updateGridDataFromContent = (content: string) => {
        let rows = this.parseContent(content ?? "[]");
        if (rows && Array.isArray(rows)) {
            rows = createIdColumn(rows);
            if (this.gridRef) {
                this.gridRef.models.focus.focusFromIndex = true;
            }
            this.state.update((s) => {
                s.rows = rows;
            });
        }
    };

    private parseContent = (content: string) => {
        if (this.props.model.state.get().editor === "grid-csv") {
            const { csvDelimeter, csvWithColumns } = this.state.get();
            let rows = csvToRecords(content, csvWithColumns, csvDelimeter);
            if (Array.isArray(rows) && !csvWithColumns) {
                // map array of arrays to array of objects
                rows = rows.map(r => ({...r}));
            }
            return rows;
        }
        return parseObject(content);
    }

    editRow = (columnKey: string, rowKey: string, value: any) => {
        this.state.update((s) => {
            const row = s.rows.find((r) => getRowKey(r) === rowKey);
            if (row) {
                (row as any)[columnKey] = value;
            }
        });
    };

    onAddRows = (count: number, insertIndex?: number) => {
        const newRows = Array.from({ length: count }, () => ({
            [idColumnKey]: (this.maxRowId++).toString(),
        }));
        this.state.update((s) => {
            if (insertIndex !== undefined) {
                s.rows.splice(insertIndex, 0, ...newRows);
            } else {
                s.rows.push(...newRows);
            }
        });
        return newRows;
    };

    onDeleteRows = (rowKeys: string[]) => {
        this.state.update((s) => {
            s.rows = s.rows.filter((r) => !rowKeys.includes(getRowKey(r)));
        });
    };

    private getJsonContent = () => {
        const { rows } = this.state.get();
        return JSON.stringify(removeIdColumn(rows), null, 4);
    };

    private getCsvContent = () => {
        const { rows, csvDelimeter, csvWithColumns } = this.state.get();
        const columns = /*this.gridRef?.data.columns ||*/ this.state.get().columns;
        return rowsToCsvText(rows, columns, csvWithColumns, csvDelimeter);
    }

    private getContentToSave = () => {
        const editor = this.props.model.state.get().editor;
        switch (editor) {
            case "grid-csv":
                return this.getCsvContent();
            case "grid-json":
            default:
                return this.getJsonContent();
        }
    }

    onDataChanged = () => {
        const content = this.getContentToSave();
        this.changedContent = content;
        this.props.model.changeContent(content);
    };

    pageKeyDown = (e: React.KeyboardEvent) => {
        switch (e.code) {
            case "KeyS":
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.props.model.saveFile();
                }
                break;
        }
    };

    onGetOptions: TOnGetFilterOptions = (
        columns: Column[],
        filters: TFilter[],
        columnKey: string,
        search?: string
    ) => {
        const uniqueValues = new Set<any>();
        filterRows(
            this.state.get().rows,
            columns,
            search,
            filters?.filter((f) => f.columnKey !== columnKey)
        ).forEach((i) => uniqueValues.add(i[columnKey]));
        const options = Array.from(uniqueValues);
        options.sort(defaultCompare());
        return options.map((i) => ({
            value: i,
            label:
                i === undefined
                    ? "(undefined)"
                    : i === null
                      ? "(null)"
                      : i?.toString(),
            italic: i === undefined || i === null,
        }));
    };

    onUpdateRows = (updateFunc: (rows: any[]) => any[]) => {
        const rows = this.state.get().rows;
        const updatedRows = updateFunc(rows);
        if (updatedRows !== rows) {
            this.state.update((s) => {
                s.rows = updatedRows;
            });
            this.onDataChanged();
        }
    };

    get recordsCount() {
        const rows = this.state.get().rows.length;
        const visibleRows = this.gridRef?.data.rows.length ?? rows;
        return visibleRows === rows
            ? `${rows} rows`
            : `${visibleRows} of ${rows} rows`;
    }

    setDelimiter = (delimiter: string) => {
        this.state.update((s) => {
            s.csvDelimeter = delimiter;
        });
    };

    toggleWithColumns = () => {
        this.state.update((s) => {
            s.csvWithColumns = !s.csvWithColumns;
        });
    };
}
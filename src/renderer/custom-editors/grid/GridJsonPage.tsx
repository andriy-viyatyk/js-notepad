import styled from "@emotion/styled";
import { TextFileModel } from "../../pages/text-file-page/TextFilePage.model";
import { CellFocus, Column, TFilter } from "../../controls/AVGrid/avGridTypes";
import { TComponentModel, useComponentModel } from "../../common/classes/model";
import { parseObject } from "../../common/parseUtils";
import {
    createIdColumn,
    getGridDataWithColumns,
    getRowKey,
    idColumnKey,
    removeIdColumn,
} from "./grid-page-utils";
import { AVGridModel } from "../../controls/AVGrid/model/AVGridModel";
import { SetStateAction, useCallback, useEffect, useState } from "react";
import AVGrid from "../../controls/AVGrid/AVGrid";
import { resolveState } from "../../common/utils";
import {
    FiltersProvider,
    TOnGetFilterOptions,
} from "../../controls/AVGrid/filters/useFilters";
import { defaultCompare, filterRows } from "../../controls/AVGrid/avGridUtils";
import { FilterBar } from "../../controls/AVGrid/filters/FilterBar";

const GridJsonPageRoot = styled.div({
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "column",
    height: 200,
    position: "relative",
});

interface GridJsonPageProps {
    model: TextFileModel;
}

const defaultGridJsonPageState = {
    columns: [] as Column[],
    rows: [] as any[],
    focus: undefined as CellFocus | undefined,
    search: "",
    filters: [] as TFilter[],
};

type GridJsonPageState = typeof defaultGridJsonPageState;

class GridJsonPageModel extends TComponentModel<
    GridJsonPageState,
    GridJsonPageProps
> {
    gridRef: AVGridModel<any> | undefined = undefined;
    maxRowId = 0;
    private loaded = false;
    private changedContent = "";

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
        if (!this.loaded && content) {
            this.loadGridData(content);
            this.loaded = true;
        }

        if (this.changedContent !== content) {
            this.updateGridDataFromContent(content);
            this.changedContent = content;
        }
    };

    private loadGridData = (content: string) => {
        let rows = [];
        let columns: Column[] = [];
        if (content) {
            const parsed = parseObject(content);
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
    };

    private updateGridDataFromContent = (content: string) => {
        let rows = parseObject(content ?? "[]");
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

    onDataChanged = () => {
        const content = this.getJsonContent();
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
}

export function GridJsonPage(props: GridJsonPageProps) {
    const { model } = props;
    const pageModel = useComponentModel(
        props,
        GridJsonPageModel,
        defaultGridJsonPageState
    );
    const state = model.state.use();
    const pageState = pageModel.state.use();
    const [, /* unused */ setRefresh] = useState(0);

    useEffect(() => {
        pageModel.updateContent(state.content || "");
    }, [state.content]);

    const onVisibleRowsChanged = useCallback(() => {
        Promise.resolve().then(() => {
            setRefresh(new Date().getTime());
        });
    }, []);

    return (
        <GridJsonPageRoot tabIndex={0} onKeyDown={pageModel.pageKeyDown}>
            <FiltersProvider
                filters={pageState.filters}
                setFilters={pageModel.setFilters}
                onGetOptions={pageModel.onGetOptions}
            >
                <FilterBar className="filter-bar" gridModel={pageModel.gridRef} />
                <AVGrid
                    ref={pageModel.setGridRef}
                    columns={pageState.columns}
                    rows={pageState.rows}
                    getRowKey={getRowKey}
                    focus={pageState.focus}
                    setFocus={pageModel.setFocus}
                    searchString={pageState.search}
                    filters={pageState.filters}
                    onVisibleRowsChanged={onVisibleRowsChanged}
                    editRow={pageModel.editRow}
                    onAddRows={pageModel.onAddRows}
                    onDeleteRows={pageModel.onDeleteRows}
                    onDataChanged={pageModel.onDataChanged}
                />
            </FiltersProvider>
        </GridJsonPageRoot>
    );
}

const moduleExport = {
    Editor: GridJsonPage,
};

export default moduleExport;

import { useCallback, useMemo, useRef, useEffect } from "react";
import { GridOutputEntry } from "../logTypes";
import type { LogViewEditor } from "../LogViewEditor";
import { DialogHeader } from "./DialogHeader";
import { getGridDataWithColumns, getRowKey } from "../../grid/utils/grid-utils";
import type { GridColumn } from "../../grid/utils/grid-utils";
import { DataGrid, type Column } from "../../../uikit/DataGrid";
import { IconButton, Panel } from "../../../uikit";
import { OpenLinkIcon } from "../../../theme/icons";
import { pagesModel } from "../../../api/pages";
import { DIALOG_CONTENT_MAX_HEIGHT } from "../logConstants";

function normalizeColumns(columns?: (string | GridColumn)[]): GridColumn[] | undefined {
    if (!columns || columns.length === 0) return undefined;
    return columns.map((column) => typeof column === "string" ? { key: column } : column);
}

interface SavedColumn { key: string | number; width?: number; }

function mergeColumnsWithSaved(detected: Column[], saved?: SavedColumn[]): Column[] {
    if (!saved?.length) return detected;
    const savedMap = new Map(saved.map((column) => [String(column.key), column]));
    const result: Column[] = saved.flatMap((savedColumn) => {
        const detectedColumn = detected.find((column) => String(column.key) === String(savedColumn.key));
        return detectedColumn ? [{ ...detectedColumn, width: savedColumn.width ?? detectedColumn.width }] : [];
    });
    return result.concat(detected.filter((column) => !savedMap.has(String(column.key))));
}

interface GridOutputViewProps { entry: GridOutputEntry; model: LogViewEditor; }

export function GridOutputView({ entry, model: vm }: GridOutputViewProps) {
    const baseGridData = useMemo(
        () => getGridDataWithColumns(entry.data, normalizeColumns(entry.columns)),
        [entry.data, entry.columns],
    );
    const initialColumns = useRef<Column[] | undefined>(undefined);
    if (!initialColumns.current) {
        const saved = vm.getItemState(entry.id).columns as SavedColumn[] | undefined;
        initialColumns.current = mergeColumnsWithSaved(baseGridData.columns, saved);
    }
    const persistTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const pendingColumns = useRef<Column[] | undefined>(undefined);
    const flushColumns = useCallback(() => {
        if (!pendingColumns.current) return;
        vm.setItemState(entry.id, {
            columns: pendingColumns.current.map((column) => ({ key: column.key, width: column.width })),
        });
        pendingColumns.current = undefined;
    }, [entry.id, vm]);
    const persistColumns = useCallback((columns: Column[]) => {
        pendingColumns.current = columns;
        if (persistTimer.current !== undefined) clearTimeout(persistTimer.current);
        persistTimer.current = setTimeout(() => {
            persistTimer.current = undefined;
            flushColumns();
        }, 150);
    }, [flushColumns]);
    useEffect(() => () => {
        if (persistTimer.current !== undefined) {
            clearTimeout(persistTimer.current);
            persistTimer.current = undefined;
        }
        flushColumns();
    }, [flushColumns]);

    const handleOpenInGrid = useCallback(() => {
        const title = typeof entry.title === "string" ? entry.title : "Grid Data";
        pagesModel.addEditorPage("grid-json", "json", title, JSON.stringify(entry.data, null, 2));
    }, [entry.data, entry.title]);

    return (
        <Panel name="log-grid-output" direction="column" position="relative" border rounded="md" overflow="hidden" width="fit-content" maxWidth="100%" revealChildrenOnHover>
            <DialogHeader title={entry.title} />
            <DataGrid
                columns={initialColumns.current}
                rows={baseGridData.rows}
                getRowKey={getRowKey}
                onColumnsChange={persistColumns}
                growToHeight={`${DIALOG_CONTENT_MAX_HEIGHT}px`}
                growToWidth="100%"
                disableFiltering
            />
            <Panel name="log-grid-hover-actions" position="absolute" top={4} right={4} zIndex={1}>
                <IconButton name="log-grid-open-in-editor" hideUntilParentHover size="sm" icon={<OpenLinkIcon />} title="Open in Grid editor" onClick={handleOpenInGrid} />
            </Panel>
        </Panel>
    );
}

import { useCallback, useEffect, useRef } from "react";
import { DataGrid, type DataGridInstance } from "../../uikit/DataGrid";
import { Panel } from "../../uikit/Panel";
import { isFocusInSidebar } from "../../core/utils/focus-utils";
import { showGridContextMenu } from "../../ui/dialogs/poppers/grid-context-menu";
import type { EditorConfig } from "../base/EditorConfig";
import { EditorError } from "../base/EditorError";
import { getRowKey } from "./utils/grid-utils";
import type { GridEditor } from "./GridEditor";
import type { TextFileModel } from "../text/TextEditorModel";

interface GridBodyProps {
    model: GridEditor;
    onModel?: (model: DataGridInstance<any> | null) => void;
    editorConfig?: EditorConfig;
}

export const GridBody = function GridBody({ model, onModel, editorConfig = {} }: GridBodyProps) {
    const gridRef = useRef<DataGridInstance<any> | null>(null);
    const host = model.contentHost as TextFileModel | null;

    // Three holders want the instance: this file (the queue drain and the mount focus), the
    // model (which applies the restored sort and focus), and `index.tsx` (whose toolbar opens
    // the columns popover against it).
    const onGrid = useCallback(
        (grid: DataGridInstance<any> | null) => {
            gridRef.current = grid;
            model.setGrid(grid);
            onModel?.(grid);
        },
        [model, onModel],
    );

    // Only what the grid is *given*. Rows are av-grid's (US-1020 / D1), and focus, filters and
    // sort now travel outward through callbacks — subscribing to them here would push the
    // grid's own state back at it on every keystroke.
    const state = model.state.use((s) => ({
        columns: s.columns,
        search: s.search,
        error: s.error,
    }));

    // Drain fire-and-forget events.
    model.typedQueue.use((ev) => {
        const grid = gridRef.current;
        if (!grid) return;
        switch (ev.type) {
            case "focus":
                grid.focus();
                break;
            case "focusCell":
                grid.focusCell(ev.row, ev.col, true);
                break;
        }
    });

    // Auto-focus on mount (unless disabled by editor config, or the user is
    // working in a sidebar panel — sidebar-driven navigation must not steal
    // focus, US-808).
    useEffect(() => {
        if (!editorConfig.disableAutoFocus && !isFocusInSidebar()) {
            gridRef.current?.focus();
        }
    }, [editorConfig.disableAutoFocus]);

    // GR3's page-focus scroll restore is gone, deliberately (US-1020 / F3). av-grid detects the
    // case itself: hiding a container zeroes its scrollTop while the model keeps the real offset,
    // so `RenderGridModel` raises a `scrollLost` flag when it measures 0×0 with a non-zero
    // offset and the next paint puts the position back. That flag is the *only* thing licensing
    // the write — a container merely ahead of the model is one the user has just scrolled, whose
    // event has not been delivered yet, and writing our offset there undoes the scroll. Which is
    // exactly what a hand-rolled restore-on-focus does half the time.

    if (!host) return null;
    if (state.error) return <EditorError>{state.error}</EditorError>;

    return (
        <Panel
            name="grid-editor-root"
            direction="column"
            flex={1}
            position="relative"
            height={editorConfig.maxEditorHeight !== undefined ? "fit-content" : 200}
        >
            <DataGrid
                name={`grid-editor-${model.editorId}`}
                columns={state.columns}
                rows={model.rowsForGrid()}
                getRowKey={getRowKey}
                rowNoun="row"
                searchString={state.search || undefined}
                highlightString={editorConfig.highlightText}
                filters={model.state.get().filters}
                filterBar
                editable
                canAddRows
                canDeleteRows
                canAddColumns
                canDeleteColumns
                newRow={model.newRow}
                newColumn={model.newColumn}
                onGrid={onGrid}
                onEdit={model.onEdit}
                onAddRows={model.onAddRows}
                onDeleteRows={model.onDeleteRows}
                onDeleteColumns={model.onDeleteColumns}
                onColumnsChange={model.onColumnsChange}
                onFocusChange={model.onFocusChange}
                onFiltersChange={model.onFiltersChange}
                onSortChange={model.onSortChange}
                onVisibleRowsChange={model.onVisibleRowsChange}
                onGetOptions={model.onGetOptions}
                onGridContextMenu={showGridContextMenu}
                growToHeight={
                    editorConfig.maxEditorHeight !== undefined
                        ? `${editorConfig.maxEditorHeight}px`
                        : undefined
                }
            />
        </Panel>
    );
};

/** Visible-row label for the footer record-count. */
export function getVisibleRowsLabel(model: GridEditor): string {
    const { rowCount, displayedRowCount } = model.state.get();
    const visible = displayedRowCount ?? rowCount;
    return visible === rowCount ? `${rowCount} rows` : `${visible} of ${rowCount} rows`;
}

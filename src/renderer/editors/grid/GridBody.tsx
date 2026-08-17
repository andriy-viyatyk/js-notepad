import { useCallback, useEffect, useRef } from "react";
import {
    AVGrid,
    FiltersModel,
    FilterBar,
    type AVGridModel,
    type TSortColumn,
} from "../../uikit";
import { Panel } from "../../uikit/Panel";
import { pagesModel } from "../../api/pages";
import { isFocusInSidebar } from "../../core/utils/focus-utils";
import type { EditorConfig } from "../base/EditorConfig";
import { EditorError } from "../base/EditorError";
import { getRowKey } from "./utils/grid-utils";
import type { GridEditor } from "./GridEditor";
import type { TextFileModel } from "../text/TextEditorModel";
import { useComponentModel } from "../../core/state/model";

interface GridBodyProps {
    model: GridEditor;
    onModel?: (model: AVGridModel<any> | null) => void;
    editorConfig?: EditorConfig;
}

export const GridBody = function GridBody({ model, onModel, editorConfig = {} }: GridBodyProps) {
    const gridRef = useRef<AVGridModel<any> | null>(null);
    const host = model.contentHost as TextFileModel | null;

    const state = model.state.use((s) => ({
        columns: s.columns,
        rows: s.rows,
        focus: s.focus,
        search: s.search,
        filters: s.filters,
        displayedRowCount: s.displayedRowCount,
        error: s.error,
    }));

    const filtersModel = useComponentModel(
        {
            filters: state.filters,
            setFilters: model.setFilters,
            onGetOptions: model.onGetOptions,
        },
        FiltersModel,
        {},
    );

    // Drain fire-and-forget events.
    model.typedQueue.use((ev) => {
        const g = gridRef.current;
        if (!g) return;
        switch (ev.type) {
            case "focus":
                g.focusGrid();
                break;
            case "focusCell":
                g.models.focus.focusCell(ev.row, ev.col, true);
                break;
        }
    });

    // Auto-focus on mount (unless disabled by editor config, or the user is
    // working in a sidebar panel — sidebar-driven navigation must not steal
    // focus, US-808).
    useEffect(() => {
        if (!editorConfig.disableAutoFocus && !isFocusInSidebar()) {
            gridRef.current?.focusGrid();
        }
    }, [editorConfig.disableAutoFocus]);

    // GR3 — page-focus → scroll restore.
    useEffect(() => {
        const sub = pagesModel.onFocus.subscribe((page) => {
            if (page === model.page || pagesModel.activePage === model.page) {
                Promise.resolve().then(() => {
                    gridRef.current?.renderModel?.restoreScroll();
                });
            }
        });
        return () => sub.unsubscribe();
    }, [model]);

    const handleVisibleRowsChanged = useCallback(() => {
        const grid = gridRef.current;
        if (grid) model.setDisplayedRowCount(grid.data.rows.length);
    }, [model]);

    // GR5 — two-way sortColumn sync via setGridRef callback.
    const setGridRef = useCallback(
        (ref: AVGridModel<any> | null) => {
            gridRef.current = ref;
            onModel?.(ref);
            if (!ref) return;
            model.setDisplayedRowCount(ref.data.rows.length);
            // 1. Editor → gridRef: write saved sortColumn on mount.
            const saved = model.state.get().sortColumn;
            if (saved) {
                ref.state.update((s) => {
                    s.sortColumn = saved;
                });
            }
            // 2. gridRef → editor: forward sortColumn changes to editor state.
            ref.state.subscribe<TSortColumn | undefined>(
                (sortColumn) => {
                    if (model.state.get().sortColumn !== sortColumn) {
                        model.state.update((s) => {
                            s.sortColumn = sortColumn;
                        });
                    }
                },
                (s) => s.sortColumn,
            );
        },
        [model, onModel],
    );

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
            <>
                <FilterBar gridModel={gridRef.current} filtersModel={filtersModel} />
                <AVGrid
                    onModel={setGridRef}
                    columns={state.columns}
                    rows={state.rows}
                    getRowKey={getRowKey}
                    focus={state.focus}
                    setFocus={model.setFocus}
                    searchString={state.search}
                    highlightString={editorConfig.highlightText}
                    filters={state.filters}
                    filtersModel={filtersModel}
                    onVisibleRowsChanged={handleVisibleRowsChanged}
                    editRow={model.editRow}
                    onAddRows={model.onAddRows}
                    setColumns={model.setColumns}
                    onAddColumns={model.onAddColumns}
                    onDeleteRows={model.onDeleteRows}
                    onDeleteColumns={model.onDeleteColumns}
                    onDataChanged={model.onDataChanged}
                    growToHeight={editorConfig.maxEditorHeight}
                />
            </>
        </Panel>
    );
};

/** Visible-row label for the footer record-count. */
export function getVisibleRowsLabel(model: GridEditor): string {
    const rows = model.state.get().rows.length;
    const visible = model.state.get().displayedRowCount ?? rows;
    return visible === rows ? `${rows} rows` : `${visible} of ${rows} rows`;
}

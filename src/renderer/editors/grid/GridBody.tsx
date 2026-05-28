import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import {
    AVGrid,
    FiltersProvider,
    FilterBar,
    type AVGridModel,
    type TSortColumn,
} from "../../uikit";
import { Panel } from "../../uikit/Panel";
import { pagesModel } from "../../api/pages";
import { useEditorConfig } from "../base";
import { EditorError } from "../base/EditorError";
import { getRowKey } from "./utils/grid-utils";
import type { GridEditor } from "./GridEditor";
import type { TextFileModel } from "../text/TextEditorModel";

interface GridBodyProps {
    model: GridEditor;
    /** Callback fired after `onVisibleRowsChanged` so the parent can
     *  re-render the footer's record count. */
    onVisibleRowsChanged?: () => void;
}

export const GridBody = forwardRef<AVGridModel<any>, GridBodyProps>(function GridBody(
    { model, onVisibleRowsChanged },
    forwardedRef,
) {
    const gridRef = useRef<AVGridModel<any> | null>(null);
    const editorConfig = useEditorConfig();
    const host = model.contentHost as TextFileModel | null;

    const state = model.state.use((s) => ({
        columns: s.columns,
        rows: s.rows,
        focus: s.focus,
        search: s.search,
        filters: s.filters,
        error: s.error,
    }));

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

    // Auto-focus on mount (unless disabled by editor config).
    useEffect(() => {
        if (!editorConfig.disableAutoFocus) {
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

    // Internal trigger to refresh footer's record-count read from gridRef.
    const [, setTick] = useState(0);
    const handleVisibleRowsChanged = useCallback(() => {
        Promise.resolve().then(() => {
            setTick((t) => t + 1);
            onVisibleRowsChanged?.();
        });
    }, [onVisibleRowsChanged]);

    // GR5 — two-way sortColumn sync via setGridRef callback.
    const setGridRef = useCallback(
        (ref: AVGridModel<any> | null) => {
            gridRef.current = ref;
            if (typeof forwardedRef === "function") forwardedRef(ref);
            else if (forwardedRef) forwardedRef.current = ref;
            if (!ref) return;
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
        [model, forwardedRef],
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
            <FiltersProvider
                filters={state.filters}
                setFilters={model.setFilters}
                onGetOptions={model.onGetOptions}
            >
                <FilterBar gridModel={gridRef.current} />
                <AVGrid
                    ref={setGridRef}
                    columns={state.columns}
                    rows={state.rows}
                    getRowKey={getRowKey}
                    focus={state.focus}
                    setFocus={model.setFocus}
                    searchString={state.search}
                    highlightString={editorConfig.highlightText}
                    filters={state.filters}
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
            </FiltersProvider>
        </Panel>
    );
});

/** Visible-row label for the footer record-count. Falls back to total row
 *  count when no gridRef is mounted yet. */
export function getVisibleRowsLabel(
    model: GridEditor,
    gridRef: AVGridModel<any> | null,
): string {
    const rows = model.state.get().rows.length;
    const visible = gridRef?.data.rows.length ?? rows;
    return visible === rows ? `${rows} rows` : `${visible} of ${rows} rows`;
}

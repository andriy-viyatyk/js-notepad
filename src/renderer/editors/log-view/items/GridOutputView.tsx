import { useMemo, useCallback, SetStateAction } from "react";
import { GridOutputEntry } from "../logTypes";
import type { LogViewEditor } from "../LogViewEditor";
import { DialogHeader } from "./DialogHeader";
import { getGridDataWithColumns, getRowKey } from "../../grid/utils/grid-utils";
import type { GridColumn } from "../../grid/utils/grid-utils";
import { AVGrid, IconButton, Panel, type Column, type CellFocus } from "../../../uikit";
import { OpenLinkIcon } from "../../../theme/icons";
import { pagesModel } from "../../../api/pages";
import { DIALOG_CONTENT_MAX_HEIGHT } from "../logConstants";
import { resolveState } from "../../../core/utils/utils";

// =============================================================================
// Helpers
// =============================================================================

function normalizeColumns(columns?: (string | GridColumn)[]): GridColumn[] | undefined {
    if (!columns || columns.length === 0) return undefined;
    return columns.map(c => typeof c === "string" ? { key: c } : c);
}

/** Minimal persisted shape — only key + width survive across reloads. */
interface SavedColumn {
    key: string | number;
    width?: number;
}

/** Merge saved column state (widths, order) with detected columns. */
function mergeColumnsWithSaved(detected: Column[], saved?: SavedColumn[]): Column[] {
    if (!saved || saved.length === 0) return detected;

    const savedMap = new Map<string, SavedColumn>();
    for (const sc of saved) {
        if (sc && sc.key) savedMap.set(String(sc.key), sc);
    }

    const result: Column[] = [];
    for (const sc of saved) {
        const det = detected.find(c => c.key === sc.key);
        if (det) {
            result.push({ ...det, width: sc.width ?? det.width });
        }
    }
    for (const det of detected) {
        if (!savedMap.has(String(det.key))) {
            result.push(det);
        }
    }
    return result;
}

// =============================================================================
// Component
// =============================================================================

interface GridOutputViewProps {
    entry: GridOutputEntry;
    model: LogViewEditor;
}

export function GridOutputView({ entry, model: vm }: GridOutputViewProps) {
    const itemState = vm.state.use(s => s.itemsState[entry.id] ?? {});

    const baseGridData = useMemo(
        () => getGridDataWithColumns(entry.data, normalizeColumns(entry.columns)),
        [entry.data, entry.columns],
    );

    const savedColumns = itemState.columns as SavedColumn[] | undefined;
    const columns = useMemo(
        () => mergeColumnsWithSaved(baseGridData.columns, savedColumns),
        [baseGridData.columns, savedColumns],
    );

    const focus = itemState.focus as CellFocus | undefined;

    const setColumns = useCallback(
        (value: SetStateAction<Column[]>) => {
            const newColumns = resolveState(value, () => columns);
            const toSave = newColumns.map(c => ({ key: c.key, width: c.width }));
            vm.setItemState(entry.id, { columns: toSave });
        },
        [vm, entry.id, columns],
    );

    const setFocus = useCallback(
        (value: SetStateAction<CellFocus | undefined>) => {
            const newFocus = resolveState(value, () => focus);
            vm.setItemState(entry.id, { focus: newFocus });
        },
        [vm, entry.id, focus],
    );

    const handleOpenInGrid = useCallback(() => {
        const title = typeof entry.title === "string" ? entry.title : "Grid Data";
        pagesModel.addEditorPage("grid-json", "json", title, JSON.stringify(entry.data, null, 2));
    }, [entry.data, entry.title]);

    return (
        <Panel
            name="log-grid-output"
            direction="column"
            position="relative"
            border
            rounded="md"
            overflow="hidden"
            width="fit-content"
            maxWidth="100%"
            revealChildrenOnHover
        >
            <DialogHeader title={entry.title} />
            <AVGrid
                columns={columns}
                setColumns={setColumns}
                rows={baseGridData.rows}
                getRowKey={getRowKey}
                focus={focus}
                setFocus={setFocus}
                growToHeight={DIALOG_CONTENT_MAX_HEIGHT}
                growToWidth="100%"
                readonly
                disableFiltering
            />
            <Panel
                name="log-grid-hover-actions"
                position="absolute"
                top={4}
                right={4}
                zIndex={1}
            >
                <IconButton
                    name="log-grid-open-in-editor"
                    hideUntilParentHover
                    size="sm"
                    icon={<OpenLinkIcon />}
                    title="Open in Grid editor"
                    onClick={handleOpenInGrid}
                />
            </Panel>
        </Panel>
    );
}

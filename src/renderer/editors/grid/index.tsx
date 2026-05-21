import { useCallback, useRef, useState } from "react";
import { TComponentState } from "../../core/state/state";
import { TextChrome } from "../base/v4/TextChrome";
import { Input } from "../../uikit/Input";
import { IconButton } from "../../uikit/IconButton";
import { Button } from "../../uikit/Button";
import { CloseIcon, ColumnsIcon } from "../../theme/icons";
import { showColumnsOptions } from "./components/ColumnsOptions";
import { showCsvOptions } from "./components/CsvOptions";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel as V4EditorModel } from "../base/v4/EditorModel";
import { GridEditor, defaultGridEditorState } from "./GridEditor";
import { GridBody, getVisibleRowsLabel } from "./GridBody";
import type { AVGridModel } from "../../uikit";
import type { GridEditorId } from "./util";

/**
 * EPIC-028 / US-552 — three v4 module factories. Each constructs a
 * GridEditor with a different constructor-bound editor id; the format
 * derives from the id. The Component slot is shared across all three.
 */

function GridEditorView({ model }: { model: V4EditorModel }) {
    const editor = model as GridEditor;
    // Shared mutable holder for the AVGridModel ref — GridBody forwards it
    // here so GridToolbarBits / GridFooterBits can read it for the columns
    // popover and the visible-row count label.
    const gridRefHolder = useRef<AVGridModel<any> | null>(null);
    const [, setTick] = useState(0);
    const bumpFooter = useCallback(() => {
        setTick((t) => t + 1);
    }, []);
    return (
        <TextChrome
            model={model}
            toolbarContributions={
                <GridToolbarBits editor={editor} gridRefHolder={gridRefHolder} />
            }
            rightToolbarContributions={<GridSearchInput editor={editor} />}
            footerContributions={
                <GridFooterBits editor={editor} gridRefHolder={gridRefHolder} />
            }
        >
            <GridBody
                model={editor}
                ref={gridRefHolder}
                onVisibleRowsChanged={bumpFooter}
            />
        </TextChrome>
    );
}

function GridToolbarBits({
    editor,
    gridRefHolder,
}: {
    editor: GridEditor;
    gridRefHolder: React.MutableRefObject<AVGridModel<any> | null>;
}) {
    return (
        <>
            <IconButton
                name="grid-columns"
                size="sm"
                title="Edit Columns"
                icon={<ColumnsIcon />}
                onClick={(e) => {
                    const grid = gridRefHolder.current;
                    if (grid) {
                        showColumnsOptions(
                            e.currentTarget,
                            grid,
                            editor.format === "csv",
                            editor.onUpdateRows,
                        );
                    }
                }}
            />
            {editor.format === "csv" && (
                <Button
                    name="grid-csv-options"
                    size="sm"
                    variant="ghost"
                    title="Csv Options"
                    onClick={(e) => showCsvOptions(e.currentTarget, editor)}
                >
                    ⚒-csv
                </Button>
            )}
        </>
    );
}

function GridSearchInput({ editor }: { editor: GridEditor }) {
    const search = editor.state.use((s) => s.search);
    return (
        <Input
            name="grid-search"
            size="sm"
            width={200}
            value={search}
            onChange={editor.setSearch}
            placeholder="Search..."
            endSlot={
                search ? (
                    <IconButton
                        name="grid-search-clear"
                        size="sm"
                        title="Clear Search"
                        icon={<CloseIcon />}
                        onClick={editor.clearSearch}
                    />
                ) : undefined
            }
        />
    );
}

function GridFooterBits({
    editor,
    gridRefHolder,
}: {
    editor: GridEditor;
    gridRefHolder: React.MutableRefObject<AVGridModel<any> | null>;
}) {
    // Re-render when totals or filter set change.
    editor.state.use((s) => ({ r: s.rows.length, f: s.filters.length }));
    return (
        <span className="records-count">
            {getVisibleRowsLabel(editor, gridRefHolder.current)}
        </span>
    );
}

function makeModule(id: GridEditorId): EditorModule {
    return {
        createEditor: () =>
            new GridEditor(new TComponentState({ ...defaultGridEditorState }), id),
        Component: GridEditorView,
    };
}

export const gridJsonModule: EditorModule = makeModule("grid-json");
export const gridCsvModule: EditorModule = makeModule("grid-csv");
export const gridJsonlModule: EditorModule = makeModule("grid-jsonl");

export { GridEditor, defaultGridEditorState } from "./GridEditor";
export type { GridEditorState, GridQueueEvent } from "./GridEditor";
export type { GridFormat, GridEditorId } from "./util";

// Re-exports kept for outside callers (utils + popovers).
export type { GridData, GridColumn } from "./utils/grid-utils";
export {
    idColumnKey,
    getRowKey,
    createIdColumn,
    removeIdColumn,
    getGridDataWithColumns,
    nextColumnKeys,
} from "./utils/grid-utils";
export { ColumnsOptions, showColumnsOptions } from "./components/ColumnsOptions";
export { CsvOptions, showCsvOptions } from "./components/CsvOptions";

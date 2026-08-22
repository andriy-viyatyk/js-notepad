/**
 * The only door to av-grid.
 *
 * Deliberately **not** re-exported from `uikit/index.ts` (EPIC-057 / US-1019):
 *
 *  • `AVGrid` is the library's own exported class, so a Persephone component of that name would be
 *    permanently ambiguous. `DataGrid` is the unambiguous replacement.
 *  • The type names collide where the barrel would put them. `uikit/index.ts` already re-exports
 *    `Column` and `CellFocus` from the former React grid, and av-grid exports both names too. The old
 *    general barrel put those names in the same namespace. The repo has
 *    run this experiment: forcing `VirtualGrid` into the barrel beside `RenderGrid` produced the
 *    `VirtualCellFunc` / `VirtualCellParams` aliases, where the survivor got the worse name
 *    because the corpse held the good one.
 *  • Direct imports are the project standard anyway, and it is what every `RenderGrid` consumer
 *    already does.
 *
 * Import from `"../../uikit/DataGrid"`, not from `"../../uikit"`.
 */

export { DataGrid } from "./DataGrid";
export { DataGridView } from "./DataGridView";

export type {
    AddColumnsEvent,
    AddRowsEvent,
    Alignment,
    CellContext,
    CellEdit,
    CellEditEvent,
    CellEditor,
    CellEditorFactory,
    CellFocus,
    CellRenderer,
    ClassValue,
    Column,
    DataGridInstance,
    DataGridProps,
    DataGridStateSnapshot,
    DataType,
    DeleteColumnsEvent,
    DeleteRowsEvent,
    DisplayFormat,
    EditorContext,
    Filter,
    FilterType,
    GetFilterOptions,
    GridContextMenuEvent,
    GridSelection,
    HeaderContext,
    HeaderRenderer,
    InvalidEditEvent,
    MenuItem,
    OptionsFilterValue,
    Percent,
    RowAlign,
    RowContext,
    SelectedCount,
    SortColumn,
    SortDirection,
} from "./types";

/**
 * Library helpers a consumer needs and must not reimplement.
 *
 * `highlightText` marks search hits the same way the grid's own cells do — `editors/grid` needs it
 * for its custom renderers. `detectColumnWidth` / `detectColumnWidths` replace
 * the former React grid's `column-width.ts`, and `defaultRowHeight` / `defaultColumnWidth` are the two
 * numbers a consumer computes layout against (both `24` and `100`, matching the React engine).
 */
export {
    defaultColumnWidth,
    defaultRowHeight,
    detectColumnWidth,
    detectColumnWidths,
    highlightText,
} from "av-grid";
export type { ColumnWidthOptions } from "av-grid";

/**
 * Grid data utilities, re-exported rather than duplicated: `editors/grid` and the git tree between
 * them already hand-roll versions of most of these.
 */
export {
    columnDisplayValue,
    csvToRecords,
    defaultCompare,
    defaultValidate,
    filterRows,
    formatDisplayValue,
    recordsToCsv,
    rowsToCsvText,
    searchWords,
} from "av-grid";

/** Cell editors, for a column that needs the grid's own input rather than a bespoke one. */
export { createCellInput, createCellSelect, createDefaultEditor } from "av-grid";

/** The row-select column, for a grid that offers checkbox selection. */
export { SELECT_COLUMN_KEY, createSelectColumn } from "av-grid";

/** Thrown by the library on an invalid option or a call after `destroy()`. */
export { AVGridError as DataGridError } from "av-grid";

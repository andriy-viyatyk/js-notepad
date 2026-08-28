/**
 * The direct-import surface for av-grid-backed data-grid features.
 *
 * Keep this surface separate from the general UIKit barrel:
 *
 *  • `AVGrid` is the library's own exported class, so a Persephone component of that name would be
 *    permanently ambiguous. `DataGrid` is the unambiguous replacement.
 *  • The type names collide where the barrel would put them. `uikit/index.ts` already re-exports
 *    `Column` and `CellFocus` from another UIKit surface, and av-grid exports both names too. A shared
 *    general barrel put those names in the same namespace. The repo has
 *    namespace that combines both libraries would produce the
 *    `VirtualCellFunc` / `VirtualCellParams` aliases, where the survivor got the worse name
 *    because the corpse held the good one.
 *  • Direct imports are the project standard for this integration surface and keep each
 *    dependency explicit at its call site.
 *
 * Import from `"../../uikit/DataGrid"`, not from `"../../uikit"`.
 */

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
 * shared width calculations, and `defaultRowHeight` / `defaultColumnWidth` are the layout defaults
 * consumers compute against.
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

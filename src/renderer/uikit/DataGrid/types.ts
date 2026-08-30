/**
 * The Persephone-facing type surface of av-grid.
 *
 * Everything a consumer needs is re-exported here so that no file outside this folder ever names
 * the package — the enforceable form of [EPIC-057 C4-1](../../../../doc/epics/EPIC-057.md), checked
 * by the `no-restricted-imports` block in `eslint.config.mjs`. A later decision to vendor the
 * library's source changes this folder's imports and nothing else.
 *
 * Names are av-grid's own, deliberately. This is a *mounting* shim, not a reconciliation layer
 * (C4-2), so a consumer reading av-grid's documentation finds the same option names in its props.
 */
import type { AVGrid, AVGridOptions } from "av-grid";

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
    DataType,
    DeleteColumnsEvent,
    DeleteRowsEvent,
    DisplayFormat,
    EditorContext,
    Filter,
    FilterType,
    GetFilterOptions,
    GridContextMenuEvent,
    HeaderContext,
    HeaderRenderer,
    InvalidEditEvent,
    MenuItem,
    OptionsFilterValue,
    RowContext,
    SortColumn,
    SortDirection,
} from "av-grid";

export type { Percent, RowAlign } from "av-grid";
export type { AVGridStateSnapshot as DataGridStateSnapshot } from "av-grid";
export type { GridSelection, SelectedCount } from "av-grid";

/**
 * The live grid instance, as handed to `DataGridProps.onGrid`.
 *
 * This is the imperative half of the inversion: focus, editing, scrolling, clipboard and
 * selection are *methods*, not props. `focus` in particular has no option at all — it is set with
 * `focusCell()` and read back through `onFocusChange` — which is the part each consumer absorbs in
 * the model that already owns its persisted view state.
 */
export type DataGridInstance<R = any> = AVGrid<R>;

/**
 * Props for `DataGrid` / `DataGridView`.
 *
 * av-grid's options verbatim, minus the two this folder owns:
 *
 *  • `injectStyles` — always `false`. The library's self-injected sheet is unlayered, and
 *    unlayered CSS outranks every rule in `@layer base, uikit, app, editor`, so the stylesheet
 *    comes in through `DataGrid.css` instead.
 *  • `persistFilters` — filters live in `IEditorState`, not `localStorage` (C4-3).
 *
 * Two tiers, and the distinction is load-bearing — see `DataGridView`. Callback props are bound
 * once at `create()`; value props are shallow-diffed and pushed through `setOptions`.
 */
export interface DataGridProps<R = any>
    extends Omit<AVGridOptions<R>, "injectStyles" | "persistFilters"> {
    /**
     * Receives the live grid on mount and `null` on dispose.
     *
     * The only supported host path reaches the imperative surface. Changes to this prop after mount
     * are ignored, like every other callback prop.
     */
    onGrid?: (grid: DataGridInstance<R> | null) => void;
}

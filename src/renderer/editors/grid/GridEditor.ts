import { TComponentState } from "../../core/state/state";
import { type EditorStateBase, type RestoreData } from "../base/EditorModel";
import { TextHostEditorModel } from "../base/TextHostEditorModel";
import { ComponentQueue } from "../../core/state/ComponentQueue";
import { TextFileModel } from "../text/TextEditorModel";
import {
    type CellEditEvent,
    type CellFocus,
    type Column,
    type DataGridInstance,
    type DataType,
    type DeleteColumnsEvent,
    type DeleteRowsEvent,
    type Filter,
    type GetFilterOptions,
    type SortColumn,
    defaultCompare,
    filterRows,
    rowsToCsvText,
} from "../../uikit/DataGrid";
import { parseObject } from "../../core/utils/parse-utils";
import { csvToRecords } from "../../core/utils/csv-utils";
import {
    getGridDataWithColumns,
    getRowKey,
    nextColumnKeys,
    registerRow,
    registerRows,
} from "./utils/grid-utils";
import { formatFromEditorId, type GridFormat, type GridEditorId } from "./util";
import { errMessage } from "../../../shared/utils";

export type GridQueueEvent =
    | { type: "focus" }
    | { type: "focusCell"; row: number; col: number };

export type GridQueueRequest = never;

/**
 * What is remembered about one column, and the whole of it.
 *
 * Deliberately **not** av-grid's `Column` (US-1020 / D2). The old grid persisted its own
 * `Column` objects, which made a third-party type the on-disk contract in two places — the
 * descriptor in `openFiles.txt` and the `editorSettings:<id>` slot inside a `.pnb` notebook —
 * so a field rename upstream became a migration over users' disks. It also invited a
 * function-valued hook onto a `JSON.stringify` path, which would fail asymmetrically: surviving
 * a Grid↔Monaco switch, vanishing after a restart.
 *
 * These five fields are all the editor has ever actually written. Everything else on a column
 * is either derived from the data (width detection, data type) or a default.
 *
 * Legacy note: descriptors written before US-1020 carry the old grid's misspelled
 * `resizible`, plus `filterType: "options"` which is now av-grid's default. Both are read and
 * dropped by `toColumnSetting`.
 */
export interface GridColumnSetting {
    key: string;
    name?: string;
    width?: number | `${number}%`;
    hidden?: boolean;
    dataType?: DataType;
}

/**
 * HS1 — Grid's editor-keyed view-state slot shape. Lives on
 * `host.editorSettings[this.editorId]` so it survives Grid↔Monaco switches
 * (host outlives the editor) AND app restarts (host descriptor rides
 * `openFiles.txt`). Seeded into editor state by `adoptHost`; mirrored back
 * by a `state.subscribe` mirror set up in the same call.
 */
interface GridViewSettings {
    columns: GridColumnSetting[];
    filters: Filter[];
    search: string;
    sortColumn: SortColumn | undefined;
    csvDelimiter: string;
    csvWithColumns: boolean;
    focus: CellFocus | undefined;
}

/** Project a live column down to what is worth remembering. */
function toColumnSetting(column: Column): GridColumnSetting {
    const setting: GridColumnSetting = { key: String(column.key) };
    if (column.name !== undefined) setting.name = column.name;
    if (column.width !== undefined) setting.width = column.width;
    if (column.hidden !== undefined) setting.hidden = column.hidden;
    if (column.dataType !== undefined) setting.dataType = column.dataType;
    return setting;
}

/**
 * Merge remembered column settings onto freshly detected columns.
 *
 * Two jobs. It restores the user's column order, widths, hidden flags and types — and it
 * **drops settings whose key is no longer in the data**, which is not housekeeping but a
 * correctness requirement: av-grid rejects a column set with a key nothing carries, so feeding
 * a stale remembered set into `create()` would fail the grid outright while the previous grid
 * rendered an empty column. Persisted settings describe the file as it was, and files change
 * between sessions.
 */
function buildColumns(detected: Column[], settings: GridColumnSetting[]): Column[] {
    if (!settings.length) return detected;
    const byKey = new Map(detected.map((c) => [String(c.key), c]));
    const merged = settings.flatMap((s) => {
        const detectedColumn = byKey.get(s.key);
        return detectedColumn ? [{ ...detectedColumn, ...s } as Column] : [];
    });
    // A remembered set that has gone entirely stale is not a reason to show no columns.
    return merged.length ? merged : detected;
}

export interface GridEditorState extends EditorStateBase {
    // Structural — persisted via getRestoreData.
    columns: Column[];
    focus: CellFocus | undefined;
    search: string;
    filters: Filter[];
    sortColumn: SortColumn | undefined;
    csvDelimiter: string;
    csvWithColumns: boolean;

    // View-derived — present on state for reactive reads; stripped from
    // getRestoreData (GR8 / MO5 pattern).
    //
    // US-1020 / D1: `rows` is **not** here. av-grid owns the live row array — it writes
    // `row[key] = value` itself on an edit — and immer's autoFreeze would deep-freeze any array
    // put into this state, so a row in reactive state is a row av-grid cannot write to. The
    // count is kept because the footer needs it reactively; the rows themselves live on
    // `_rows` / the grid.
    rowCount: number;
    displayedRowCount: number | undefined;
    error: string | undefined;
}

export const defaultGridEditorState: GridEditorState = {
    id: "",
    title: "",
    modified: false,
    secondaryView: undefined,
    columns: [],
    focus: undefined,
    search: "",
    filters: [],
    sortColumn: undefined,
    csvDelimiter: ",",
    csvWithColumns: false,
    rowCount: 0,
    displayedRowCount: undefined,
    error: undefined,
};

export class GridEditor extends TextHostEditorModel<GridEditorState, void, GridQueueEvent> {
    readonly editorId: GridEditorId;
    protected readonly displayName = "Grid";
    readonly format: GridFormat;

    /** HS1 — descriptors carried Grid view-config directly on
     *  `EditorDescriptor.state` (per GR4's original resolution). One-shot
     *  legacy promotion: applyRestoreData stashes the legacy fields here;
     *  adoptHost promotes them into `host.editorSettings[this.editorId]`
     *  if the host slot is still empty. After the first save 
     *  the descriptor no longer carries the legacy fields and the host slot
     *  becomes the single source of truth. */
    private _pendingLegacySettings: GridViewSettings | null = null;

    /** Re-entry guard — set to the content we just serialized so the
     *  host-content subscription's reparse handler skips its own echo. */
    private _changedContent = "";
    private _maxRowId = 0;

    /**
     * The rows, before a grid exists to own them (US-1020 / D1).
     *
     * Parsing happens in `onHostAttached`, which runs before the view mounts, so there has to be
     * somewhere to put them that is not reactive state. After `setGrid` this is only the seed
     * that was handed over; `liveRows()` is what everything reads.
     */
    private _rows: any[] = [];

    /** The live grid, between `setGrid(grid)` and `setGrid(null)`. */
    private _grid: DataGridInstance | undefined;

    /** One serialize per tick, however many cells the edit touched. */
    private _serializeQueued = false;

    /**
     * What is remembered about the columns — the persisted form, kept in step with the live set.
     *
     * Held here rather than in state because it is not what the grid is given: the live columns
     * are rebuilt from it against the current data on every parse.
     */
    private _columnSettings: GridColumnSetting[] = [];

    /** Narrowed queue typed for Grid's event union. */
    readonly typedQueue: ComponentQueue<GridQueueEvent, GridQueueRequest>;

    constructor(state: TComponentState<GridEditorState>, editorId: GridEditorId) {
        super(state);
        this.editorId = editorId;
        this.format = formatFromEditorId(editorId);
        this.typedQueue = this.queue as unknown as ComponentQueue<
            GridQueueEvent,
            GridQueueRequest
        >;
    }

    // ── The grid handle (US-1020 / D1) ──────────────────────────────────

    /**
     * Take or release the grid instance. Called by `GridBody` through `onGrid`.
     *
     * On attach the remembered sort and focus are applied here rather than passed as options,
     * because both are *initial* options in av-grid and this is the one moment they are known to
     * be the restored values rather than something the user has since changed.
     */
    setGrid = (grid: DataGridInstance | null): void => {
        this._grid = grid ?? undefined;
        if (!grid) return;

        const { sortColumn, focus } = this.state.get();
        if (sortColumn) grid.setSort(sortColumn);
        if (focus) grid.setFocus(focus);
        this.setRowCount(grid.getRows().length);
    };

    /** The rows, wherever they currently live. */
    private liveRows(): any[] {
        return (this._grid?.getRows() as any[] | undefined) ?? this._rows;
    }

    /** The rows, for a caller outside this model that must not mutate them. */
    getRows(): any[] {
        return [...this.liveRows()];
    }

    /**
     * The rows as the view passes them back to the grid on every render.
     *
     * Read through to the grid rather than copied, and not the `_rows` seed: av-grid **replaces**
     * its row array when rows are added (`const source = [...options.rows]`), so a cached seed
     * goes stale and handing it back would silently drop the row the user just added. Reading the
     * grid's own array means the identity the shim diffs is always the one av-grid already has,
     * so the push is either skipped or a no-op — never a rollback.
     */
    rowsForGrid(): readonly any[] {
        return this.liveRows();
    }

    private setRowCount(count: number): void {
        if (this.state.get().rowCount === count) return;
        this.state.update((s) => { s.rowCount = count; });
    }

    focus(): void {
        this.typedQueue.send({ type: "focus" });
    }

    /** Restore-time / script-API entry to position the cell cursor. */
    focusCell(row: number, col: number): void {
        this.typedQueue.send({ type: "focusCell", row, col });
    }

    setDisplayedRowCount = (count: number) => {
        if (this.state.get().displayedRowCount === count) return;
        this.state.update((s) => { s.displayedRowCount = count; });
    };

    // ── Persistence ─────────────────────────────────────────────────────

    applyRestoreData(data: RestoreData<GridEditorState>): void {
        super.applyRestoreData(data);
        // NOTE: columns / filters / sortColumn / search / focus /
        // csvDelimiter / csvWithColumns no longer applied here — they
        // arrive from host.getEditorState in adoptHost. Legacy descriptors
        // that still carry them are picked up below for one-shot
        // promotion into the host slot.
        const hasLegacy =
            data.columns !== undefined ||
            data.filters !== undefined ||
            data.search !== undefined ||
            data.sortColumn !== undefined ||
            data.csvDelimiter !== undefined ||
            data.csvWithColumns !== undefined ||
            data.focus !== undefined;
        if (hasLegacy) {
            this._pendingLegacySettings = {
                columns: (data.columns ?? []).map(toColumnSetting),
                filters: data.filters ?? [],
                search: data.search ?? "",
                sortColumn: data.sortColumn,
                csvDelimiter: data.csvDelimiter ?? ",",
                csvWithColumns: data.csvWithColumns ?? false,
                focus: data.focus,
            };
        }
    }

    // ── Host adoption ───────────────────────────────────────────────────

    adoptHost(host: TextFileModel): void {
        super.adoptHost(host);

        // Re-parse rows when host content mutates (script API write,
        // encryption decrypt, content pipe refresh).
        this.registerHostSubscription(
            host.state.subscribe(
                (content) => {
                    if (content !== this._changedContent) {
                        this.reparseRows(content as string);
                    }
                },
                (s) => s.content,
            ),
        );

        // G17 — re-run the encryption gate when lock/unlock toggles. The
        // gate lives inside reparseRows; re-firing it on the current content
        // refreshes state.error to (un)set the "Content is encrypted…"
        // message.
        this.registerHostSubscription(
            host.state.subscribe(
                () => {
                    const content = this._host?.state.get().content ?? "";
                    this.reparseRows(content);
                },
                (s) => s.encrypted,
            ),
        );

        // CSV-only — reload rows when user changes delimiter / header toggle.
        if (this.format === "csv") {
            this.registerHostSubscription(
                this.state.subscribe(
                    () => {
                        const content = this._host?.state.get().content ?? "";
                        // Delimiter / header changes redefine the columns, so force
                        // re-derivation instead of preserving the stale ones.
                        this.reparseRows(content, true);
                    },
                    (state) => ({
                        csvDelimiter: state.csvDelimiter,
                        csvWithColumns: state.csvWithColumns,
                    }),
                ),
            );
        }

        if (
            this._pendingLegacySettings &&
            host.getEditorState<GridViewSettings>(this.editorId) === undefined
        ) {
            host.setEditorState<GridViewSettings>(
                this.editorId,
                this._pendingLegacySettings,
            );
        }
        this._pendingLegacySettings = null;

        // HS1 — seed editor state from the host slot (sync, no flicker).
        // Field-by-field with `=== undefined` guards so future shape evolution
        // safely falls back to defaults on missing fields. Mirror editor state
        // changes back to the host slot. Full-state subscription is fine —
        // each fire writes one small object into `host.state.editorSettings`;
        // downstream `descriptorChanged` debounces at 500ms per P3, so
        // disk-write rate is unchanged.
        this.mirrorHostSettings<GridViewSettings>(
            (saved) => {
                // Columns do not go into state here. They are settings, not columns: the live
                // set is built at parse time by merging them onto what the data actually has
                // (`buildColumns`), because a remembered key the file no longer carries would
                // fail av-grid's column validation outright. `toColumnSetting` also narrows a
                // legacy descriptor, dropping the old grid's `resizible` and `filterType`.
                if (saved.columns !== undefined) {
                    this._columnSettings = saved.columns.map(toColumnSetting);
                }
                this.state.update((s) => {
                    if (saved.filters !== undefined) s.filters = saved.filters;
                    if (saved.search !== undefined) s.search = saved.search;
                    if (saved.sortColumn !== undefined) s.sortColumn = saved.sortColumn;
                    if (saved.csvDelimiter !== undefined) s.csvDelimiter = saved.csvDelimiter;
                    if (saved.csvWithColumns !== undefined) {
                        s.csvWithColumns = saved.csvWithColumns;
                    }
                    if (saved.focus !== undefined) s.focus = saved.focus;
                });
            },
            (s) => ({
                columns: this._columnSettings,
                filters: s.filters,
                search: s.search,
                sortColumn: s.sortColumn,
                csvDelimiter: s.csvDelimiter,
                csvWithColumns: s.csvWithColumns,
                focus: s.focus,
            }),
        );
    }

    /** Initial load on the switch-in and session-restore paths. CSV variants
     *  re-detect the delimiter from current content if no user-chosen value
     *  was persisted (anything other than the default ",") — GR7. */
    protected onHostAttached(host: TextFileModel): void {
        if (this.format === "csv") {
            const s = this.state.get();
            if (!s.csvDelimiter || s.csvDelimiter === ",") {
                const content = host.state.get().content ?? "";
                const detected = GridEditor.detectCsvDelimiter(content);
                if (detected !== s.csvDelimiter) {
                    this.state.update((x) => {
                        x.csvDelimiter = detected;
                    });
                }
            }
        }
        // Trigger an initial row parse against current host content.
        const content = host.state.get().content ?? "";
        this.reparseRows(content);
    }

    // ── Row parsing ─────────────────────────────────────────────────────

    /** Initial / explicit reparse. Handles encryption gate (G17), empty-page
     *  bootstrap (initEmptyPage), and parse-error display via state.error.
     *
     *  HS1 — preserves existing column customization (order, width, type,
     *  filter, hidden state) when `state.columns` is already populated.
     *  Cross-switch saved columns flow in via `adoptHost`'s seed-from-slot;
     *  this method must NOT clobber them. Columns auto-derive only on first
     *  bootstrap (empty editor state) or when explicitly reset.
     *
     *  `resetColumns` forces re-derivation even when columns already exist —
     *  used by the CSV delimiter / header toggle, where the column identity
     *  itself changes (numeric ordinals ↔ header names) so preserving the old
     *  columns would leave the grid keyed on names that no longer exist. */
    reparseRows(content: string, resetColumns = false): void {
        // G17 — encrypted content gate. Surface a clear message via the
        // same channel <EditorError> renders for parse failures.
        if (this._host?.state.get().encrypted) {
            this.setRows([], this.state.get().columns);
            this.state.update((s) => {
                s.error = "Content is encrypted. Unlock the file to view as grid.";
            });
            return;
        }
        if (!content) {
            this.initEmptyPage();
            return;
        }
        const parsed = this.parseContent(content);
        // A single JSON object renders as a one-row grid (wrap into array).
        // Primitives and null fall through to the empty branch.
        let rowsInput: unknown[] | null = null;
        if (Array.isArray(parsed)) {
            rowsInput = parsed;
        } else if (parsed && typeof parsed === "object") {
            rowsInput = [parsed];
        }
        if (rowsInput) {
            const data = getGridDataWithColumns(rowsInput);
            this._maxRowId = data.rows.length;
            const columns = resetColumns
                ? data.columns
                : buildColumns(data.columns, this._columnSettings);
            this.setRows(data.rows, columns);
        } else {
            this.setRows([], this.state.get().columns);
        }
    }

    /**
     * Hand a fresh row set to the grid, or hold it for the grid to come.
     *
     * `setRows` rather than a `rows` prop push: it keeps the scroll position and reuses every
     * cell already on screen, and it is the only path that works once av-grid owns the array
     * (D1). The columns go through state, because that is what the view passes at `create()`.
     */
    private setRows(rows: any[], columns: Column[]): void {
        this._rows = rows;
        const columnsChanged = columns !== this.state.get().columns;

        // Rows reach av-grid directly; columns reach it through state, which `TOneState.update`
        // dispatches SYNCHRONOUSLY into `GridBodyView.applyProjection` -> `DataGridView.setOptions`.
        // So the two travel on different channels, and the push order is load-bearing: publishing
        // columns first made av-grid validate the NEW columns against the rows it still held, and
        // it rejects a column no row has ("Unknown column \"ID\". Available columns: 0, 1, 2..."
        // when the CSV header toggle renames every column, or the mirror of it when the delimiter
        // changes the column count). Handing over the rows first means the synchronous dispatch
        // finds a grid whose rows already match the columns being published.
        // `setRows` itself validates only that it received an array, so it is safe this early.
        this._grid?.setRows(rows);

        this.state.update((s) => {
            s.rowCount = rows.length;
            if (columnsChanged) s.columns = columns;
        });
        if (columnsChanged) this._columnSettings = columns.map(toColumnSetting);
    }

    private initEmptyPage(): void {
        // A single blank row with a single column `a`, so an empty file is somewhere to start
        // typing rather than a grid with nothing in it. The column must carry a `render` or the
        // key would match nothing in `{}` — av-grid rejects a column no row has — so the blank
        // page declares its one column as the data's, and the row supplies the key instead.
        const rows: any[] = [{ a: undefined }];
        registerRows(rows);
        const columns: Column[] = [
            {
                key: "a",
                name: "a",
                dataType: "string",
                width: 100,
                resizable: true,
            },
        ];
        this._maxRowId = rows.length;
        this.setRows(rows, columns);
        this.state.update((s) => {
            s.error = undefined;
        });
        // Queue post-mount focus to cell 0,0.
        this.focusCell(0, 0);
    }

    private parseContent(content: string): any {
        let err: any = undefined;
        let res: any = undefined;
        switch (this.format) {
            case "csv": {
                const { csvDelimiter, csvWithColumns } = this.state.get();
                let rows: string[][] | Record<string, string>[] = csvToRecords(
                    content,
                    csvWithColumns,
                    csvDelimiter,
                    (e) => (err = e),
                );
                if (Array.isArray(rows) && !csvWithColumns) {
                    // Spread `string[]` → `{ "0": "a", "1": "b", ... }` so the grid
                    // can index cells by column name (its numeric ordinal).
                    rows = (rows as string[][]).map((r) => ({ ...r })) as unknown as Record<string, string>[];
                }
                res = rows;
                break;
            }
            case "jsonl":
                res = parseJsonl(content, (e) => (err = e));
                break;
            case "json":
            default:
                res = parseObject(content, (e) => (err = e));
                break;
        }
        this.state.update((s) => {
            s.error = err ? err.message + "\n" + err.stack : undefined;
        });
        return res;
    }

    // ── av-grid callbacks (US-1020 / D1) ─────────────────────────

    /**
     * Every one of these returns `void`, never `false`.
     *
     * av-grid reads `false` as "veto this operation", which is the door back to the controlled
     * model D1 rules out: the grid would stop writing and this model would have to re-apply every
     * mutation itself, against rows immer has frozen. Here the grid performs the change and the
     * model's only job is to notice, so the file gets written.
     */

    onEdit = (_edit: CellEditEvent): void => {
        this.scheduleSerialize();
    };

    // `onAddRows` and `onDeleteRows` both fire *before* the change — that is what makes a `false`
    // return able to refuse it — so neither can read the new row count. `scheduleSerialize`'s
    // microtask runs after, and syncs the count there.
    onAddRows = (): void => {
        this.scheduleSerialize();
    };

    onDeleteRows = (_e: DeleteRowsEvent): void => {
        this.scheduleSerialize();
    };

    /**
     * Columns changed — added, deleted, resized or reordered, whatever caused it.
     *
     * One callback for all of them because av-grid fires this after any change to the column
     * set, so there is nothing for a per-cause handler to do that this cannot. The remembered
     * settings are re-derived here, which is what makes a resize or a reorder survive a restart.
     */
    onColumnsChange = (columns: Column[]): void => {
        this._columnSettings = columns.map(toColumnSetting);
        this.state.update((s) => {
            s.columns = columns;
        });
    };

    /**
     * Columns are about to be deleted — drop the data under them first.
     *
     * The property has to go from every row or it would come back on the next parse, and the
     * rows are av-grid's now, so this writes through them in place rather than rebuilding the
     * array. `onColumnsChange` follows and records the narrowed set.
     */
    onDeleteColumns = (e: DeleteColumnsEvent): void => {
        this.stripColumnData(e.columnKeys);
    };

    /** Drop the deleted columns' data from every row, in place — the rows are av-grid's. */
    private stripColumnData(columnKeys: readonly string[]): void {
        for (const row of this.liveRows()) {
            if (!row || typeof row !== "object") continue;
            for (const key of columnKeys) delete row[key];
        }
        this.scheduleSerialize();
    }

    onFocusChange = (focus: CellFocus | undefined): void => {
        this.state.update((s) => {
            s.focus = focus;
        });
    };

    onFiltersChange = (filters: Filter[]): void => {
        this.state.update((s) => {
            s.filters = filters;
        });
    };

    onSortChange = (sort: SortColumn | undefined): void => {
        this.state.update((s) => {
            s.sortColumn = sort;
        });
    };

    onVisibleRowsChange = (rows: readonly any[]): void => {
        this.setDisplayedRowCount(rows.length);
    };

    /** What a blank row contains, and the one place a minted row gets its identity. */
    newRow = (): any => {
        const row: any = {};
        registerRow(row, (this._maxRowId++).toString());
        return row;
    };

    /** What a blank column looks like — the next unused spreadsheet-style letter. */
    newColumn = (): Column => {
        const [key] = nextColumnKeys(this.state.get().columns, 1);
        return {
            key,
            name: key,
            dataType: "string",
            width: 100,
            resizable: true,
        };
    };

    // ── Search ───────────────────────────────────────────────

    setSearch = (search: string): void => {
        this.state.update((s) => {
            s.search = search;
        });
    };

    clearSearch = (): void => {
        this.state.update((s) => {
            s.search = "";
        });
    };

    // ── Script API support ────────────────────────────────────

    /**
     * Write one cell, addressed by row key.
     *
     * Deliberately not `grid.setCellValue(rowIndex, colIndex, ...)`: that takes indices into the
     * *displayed* rows, which diverge from source order the moment the grid is sorted or
     * filtered, so a script would silently edit a different row than it named.
     */
    editRow = (columnKey: string, rowKey: string, value: any): void => {
        const row = this.liveRows().find((r) => getRowKey(r) === rowKey);
        if (!row) return;
        row[columnKey] = value;
        this._grid?.refresh();
        this.scheduleSerialize();
    };

    addRows = (count = 1, insertIndex?: number): any[] => {
        const rows = Array.from({ length: count }, () => this.newRow());
        if (this._grid) {
            const added = this._grid.addRows(rows, insertIndex);
            this.setRowCount(this.liveRows().length);
            this.scheduleSerialize();
            return added;
        }
        if (insertIndex !== undefined) this._rows.splice(insertIndex, 0, ...rows);
        else this._rows.push(...rows);
        this.setRowCount(this._rows.length);
        this.scheduleSerialize();
        return rows;
    };

    deleteRows = (rowKeys: string[]): void => {
        if (this._grid) {
            this._grid.deleteRows(rowKeys);
        } else {
            this._rows = this._rows.filter((r) => !rowKeys.includes(getRowKey(r)));
        }
        this.setRowCount(this.liveRows().length);
        this.scheduleSerialize();
    };

    addColumns = (count = 1, insertBeforeKey?: string): Column[] => {
        const current = this.state.get().columns;
        const newColumns: Column[] = nextColumnKeys(current, count).map((key) => ({
            key,
            name: key,
            dataType: "string",
            width: 100,
            resizable: true,
        }));
        let index = current.length;
        if (insertBeforeKey) {
            const found = current.findIndex((c) => c.key === insertBeforeKey);
            if (found >= 0) index = found;
        }
        if (this._grid) {
            // `onColumnsChange` records the new set; nothing to write here.
            return this._grid.addColumns(newColumns, index);
        }
        const columns = [...current];
        columns.splice(index, 0, ...newColumns);
        this.onColumnsChange(columns);
        return newColumns;
    };

    deleteColumns = (columnKeys: string[]): void => {
        this.stripColumnData(columnKeys);
        if (this._grid) {
            this._grid.deleteColumns(columnKeys);
            return;
        }
        this.onColumnsChange(
            this.state.get().columns.filter((c) => !columnKeys.includes(String(c.key))),
        );
    };

    /**
     * Rewrite every row through a mapper, for `ColumnsOptions` applying a key or type change.
     *
     * Replaces the array rather than writing through it, because that is what the caller's
     * mapper produces — so the identities have to be carried over, or every row would get a
     * fresh key and the focus would land nowhere.
     */
    onUpdateRows = (updateFunc: (rows: any[]) => any[]): void => {
        const rows = this.liveRows();
        const updated = updateFunc(rows);
        if (updated === rows) return;
        updated.forEach((row, i) => {
            const previous = rows[i];
            if (previous && row !== previous) registerRow(row, getRowKey(previous));
        });
        this.setRows(updated, this.state.get().columns);
        this.scheduleSerialize();
    };

    // ── CSV options ─────────────────────────────────────────────────────

    setDelimiter = (delimiter: string): void => {
        this.state.update((s) => {
            s.csvDelimiter = delimiter;
        });
    };

    toggleWithColumns = (): void => {
        this.state.update((s) => {
            s.csvWithColumns = !s.csvWithColumns;
        });
    };

    // ── Filter options (handed to av-grid's filter popover) ─────────

    onGetOptions: GetFilterOptions = (columns, filters, columnKey, search) => {
        const uniqueValues = new Set<any>();
        filterRows(
            this.liveRows(),
            columns,
            search,
            filters?.filter((f) => f.columnKey !== columnKey),
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

    // ── Serialization ───────────────────────────────────────────────────

    private getContentToSave(): string {
        switch (this.format) {
            case "csv":
                return this.getCsvContent();
            case "jsonl":
                return this.getJsonlContent();
            case "json":
            default:
                return this.getJsonContent();
        }
    }

    private getJsonContent(): string {
        return JSON.stringify(this.liveRows(), null, 4);
    }

    private getCsvContent(): string {
        const { csvDelimiter, csvWithColumns, columns } = this.state.get();
        return rowsToCsvText(this.liveRows(), columns, csvWithColumns, csvDelimiter);
    }

    private getJsonlContent(): string {
        return this.liveRows()
            .map((row) => JSON.stringify(row))
            .join("\n");
    }

    /**
     * Write the rows back to the text host, once per tick.
     *
     * Deferred rather than synchronous, for two reasons. av-grid's own documentation disagrees
     * with itself about whether `onEdit` fires before or after the value is written — `editable`
     * says after, `onEdit` says before — and a microtask is correct either way, where a
     * synchronous read could serialize the row as it was and write a one-edit-stale file with
     * nothing to show that anything went wrong. And it coalesces: a range delete or a 100-cell
     * paste fires `onEdit` per cell, which becomes one `changeContent` instead of a hundred —
     * one dirty transition, one undo step.
     */
    private scheduleSerialize(): void {
        if (this._serializeQueued) return;
        this._serializeQueued = true;
        void Promise.resolve().then(() => {
            this._serializeQueued = false;
            this.setRowCount(this.liveRows().length);
            this.onDataChanged();
        });
    }

    onDataChanged = (): void => {
        const content = this.getContentToSave();
        this._changedContent = content;
        this._host?.changeContent(content, true);
    };

    // ── Static helpers ──────────────────────────────────────────────────

    /** Heuristic CSV delimiter detection from the first 5 lines. Shared by
     *  `restore()` (session-restore path), `switchFrom()` (switch-in path),
     *  and the open-file flow (`PagesLifecycleModel.attachEditorToPage`). */
    static detectCsvDelimiter(content: string): string {
        const firstLine = content.split("\n").slice(0, 5).join("") || "";
        const delimiters = [",", ";", "\t", "|"];
        let maxCount = 0;
        let detected = ",";
        for (const delim of delimiters) {
            const count = (firstLine.match(new RegExp("\\" + delim, "g")) || []).length;
            if (count > maxCount) {
                maxCount = count;
                detected = delim;
            }
        }
        return detected;
    }
}

// ── Helpers (file-local) ────────────────────────────────────────────────

function parseJsonl(content: string, onError: (e: Error) => void): any[] {
    const lines = content.split("\n");
    const result: any[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        try {
            const parsed = JSON.parse(line);
            result.push(
                typeof parsed === "object" && parsed !== null
                    ? parsed
                    : { value: parsed },
            );
        } catch (e) {
            onError(new Error(`Line ${i + 1}: ${errMessage(e)}`));
            return result;
        }
    }
    return result;
}

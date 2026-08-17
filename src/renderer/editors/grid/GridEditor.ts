import { SetStateAction } from "react";
import { TComponentState } from "../../core/state/state";
import { type EditorStateBase, type RestoreData } from "../base/EditorModel";
import { TextHostEditorModel } from "../base/TextHostEditorModel";
import { ComponentQueue } from "../../core/state/ComponentQueue";
import { TextFileModel } from "../text/TextEditorModel";
import {
    type CellFocus,
    type Column,
    type TFilter,
    type TSortColumn,
    type TOnGetFilterOptions,
    defaultCompare,
    filterRows,
    rowsToCsvText,
} from "../../uikit";
import { parseObject } from "../../core/utils/parse-utils";
import { csvToRecords } from "../../core/utils/csv-utils";
import { resolveState } from "../../core/utils/utils";
import {
    createIdColumn,
    getGridDataWithColumns,
    getRowKey,
    idColumnKey,
    nextColumnKeys,
    removeIdColumn,
} from "./utils/grid-utils";
import { formatFromEditorId, type GridFormat, type GridEditorId } from "./util";
import { errMessage } from "../../../shared/utils";

export type GridQueueEvent =
    | { type: "focus" }
    | { type: "focusCell"; row: number; col: number };

export type GridQueueRequest = never;

/**
 * HS1 — Grid's editor-keyed view-state slot shape. Lives on
 * `host.editorSettings[this.editorId]` so it survives Grid↔Monaco switches
 * (host outlives the editor) AND app restarts (host descriptor rides
 * `openFiles.txt`). Seeded into editor state by `adoptHost`; mirrored back
 * by a `state.subscribe` mirror set up in the same call.
 */
interface GridViewSettings {
    columns: Column[];
    filters: TFilter[];
    search: string;
    sortColumn: TSortColumn | undefined;
    csvDelimiter: string;
    csvWithColumns: boolean;
    focus: CellFocus | undefined;
}

export interface GridEditorState extends EditorStateBase {
    // Structural — persisted via getRestoreData.
    columns: Column[];
    focus: CellFocus | undefined;
    search: string;
    filters: TFilter[];
    sortColumn: TSortColumn | undefined;
    csvDelimiter: string;
    csvWithColumns: boolean;

    // View-derived — present on state for reactive reads; stripped from
    // getRestoreData (GR8 / MO5 pattern).
    rows: any[];
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
    rows: [],
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
                columns: data.columns ?? [],
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
            let lastDelimiter = this.state.get().csvDelimiter;
            let lastWithColumns = this.state.get().csvWithColumns;
            this.registerHostSubscription(
                this.state.subscribe(() => {
                    const { csvDelimiter, csvWithColumns } = this.state.get();
                    if (csvDelimiter !== lastDelimiter || csvWithColumns !== lastWithColumns) {
                        lastDelimiter = csvDelimiter;
                        lastWithColumns = csvWithColumns;
                        const content = this._host?.state.get().content ?? "";
                        // Delimiter / header changes redefine the columns, so force
                        // re-derivation instead of preserving the stale ones.
                        this.reparseRows(content, true);
                    }
                }),
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
                this.state.update((s) => {
                    if (saved.columns !== undefined) s.columns = saved.columns;
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
                columns: s.columns,
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
            this.state.update((s) => {
                s.rows = [];
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
            const hasSavedColumns = !resetColumns && this.state.get().columns.length > 0;
            const data = getGridDataWithColumns(rowsInput);
            this._maxRowId = data.rows.length;
            this.state.update((s) => {
                s.rows = data.rows;
                if (!hasSavedColumns) {
                    s.columns = data.columns;
                }
            });
        } else {
            this.state.update((s) => {
                s.rows = [];
            });
        }
    }

    private initEmptyPage(): void {
        const rows = createIdColumn([{}]);
        const columns: Column[] = [
            {
                key: "a",
                name: "a",
                dataType: "string",
                width: 100,
                resizible: true,
                filterType: "options",
            },
        ];
        this._maxRowId = rows.length;
        this.state.update((s) => {
            s.rows = rows;
            s.columns = columns;
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

    // ── Data mutation API (replaces today's GridViewModel methods) ──────

    setFocus = (focus?: SetStateAction<CellFocus | undefined>): void => {
        this.state.update((s) => {
            s.focus = focus ? resolveState(focus, () => s.focus) : undefined;
        });
    };

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

    setFilters = (value: SetStateAction<TFilter[]>): void => {
        this.state.update((s) => {
            s.filters = resolveState(value, () => this.state.get().filters);
        });
    };

    editRow = (columnKey: string, rowKey: string, value: any): void => {
        this.state.update((s) => {
            const row = s.rows.find((r) => getRowKey(r) === rowKey);
            if (row) (row as any)[columnKey] = value;
        });
    };

    onAddRows = (count: number, insertIndex?: number): any[] => {
        const newRows = Array.from({ length: count }, () => ({
            [idColumnKey]: (this._maxRowId++).toString(),
        }));
        this.state.update((s) => {
            if (insertIndex !== undefined) s.rows.splice(insertIndex, 0, ...newRows);
            else s.rows.push(...newRows);
        });
        return newRows;
    };

    onDeleteRows = (rowKeys: string[]): void => {
        this.state.update((s) => {
            s.rows = s.rows.filter((r) => !rowKeys.includes(getRowKey(r)));
        });
    };

    setColumns = (columns: SetStateAction<Column[]>): void => {
        const newColumns = resolveState(columns, () => this.state.get().columns);
        this.state.update((s) => {
            s.columns = newColumns;
        });
    };

    onAddColumns = (count: number, insertBeforeKey?: string): Column[] => {
        const currentColumns = this.state.get().columns;
        const newColumns: Column[] = nextColumnKeys(currentColumns, count).map((key) => ({
            key,
            name: key,
            dataType: "string",
            width: 100,
            resizible: true,
            filterType: "options",
        }));
        let index = currentColumns.length;
        if (insertBeforeKey) {
            const foundIndex = currentColumns.findIndex((c) => c.key === insertBeforeKey);
            if (foundIndex >= 0) index = foundIndex;
        }
        this.state.update((s) => {
            s.columns.splice(index, 0, ...newColumns);
        });
        return newColumns;
    };

    onDeleteColumns = (columnKeys: (keyof any | string)[]): void => {
        this.onUpdateRows((rows) =>
            rows.map((row) => {
                const newRow = { ...row };
                for (const key of columnKeys) delete newRow[key];
                return newRow;
            }),
        );
        this.state.update((s) => {
            s.columns = s.columns.filter((c) => !columnKeys.includes(c.key));
        });
    };

    onUpdateRows = (updateFunc: (rows: any[]) => any[]): void => {
        const rows = this.state.get().rows;
        const updatedRows = updateFunc(rows);
        if (updatedRows !== rows) {
            this.state.update((s) => {
                s.rows = updatedRows;
            });
            this.onDataChanged();
        }
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

    // ── Filter options (consumed by the GridBody-owned FiltersModel) ────

    onGetOptions: TOnGetFilterOptions = (columns, filters, columnKey, search) => {
        const uniqueValues = new Set<any>();
        filterRows(
            this.state.get().rows,
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
        return JSON.stringify(removeIdColumn(this.state.get().rows), null, 4);
    }

    private getCsvContent(): string {
        const { rows, csvDelimiter, csvWithColumns, columns } = this.state.get();
        return rowsToCsvText(rows, columns, csvWithColumns, csvDelimiter);
    }

    private getJsonlContent(): string {
        return removeIdColumn(this.state.get().rows)
            .map((row) => JSON.stringify(row))
            .join("\n");
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

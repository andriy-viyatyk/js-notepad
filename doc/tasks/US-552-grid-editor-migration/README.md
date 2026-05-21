# US-552 — Grid editor migration (EPIC-028 Phase C, walkthrough 21)

**Epic:** [EPIC-028: Unified Editor Architecture](../../epics/EPIC-028.md)
**Walkthrough:** [walkthroughs/21-grid.md](../../epics/EPIC-028-editor-architecture/walkthroughs/21-grid.md)
**Phase:** C — Per-editor migrations, risk-first (second migration — first non-Monaco exercise of the Tier-5 template)
**Status:** Ready to implement

## Goal

Replace the legacy "Grid view of `TextFileModel` via `ContentViewModel`" with a native v4 `GridEditor` (subclass of `v4/EditorModel`). One class registers under three ids (`grid-json` / `grid-csv` / `grid-jsonl`) with a constructor-bound `format` discriminator; the legacy `TextFileModel` becomes the editor's `IContentHost`. The new editor renders through `<TextChrome><GridBody/></TextChrome>` with inline `toolbarContributions` (search box, columns button, csv-options button) and inline `footerContributions` (records count) — the portal-ref pattern retires for Grid.

US-552 is the second migration in Phase C (Monaco shipped in US-551); it is the first non-Monaco exercise of the Tier-5 template. Cross-camp swaps in/out of Grid (Monaco ↔ Grid; Grid ↔ Markdown / Mermaid / SVG / HTML / Notebook / Todo / Link / Log / Rest / Graph / Draw) keep working because US-551 already wired bidirectional `CONTENT_HOST_TRAIT` extraction on `LegacyEditorAdapter`. Grid → Grid format swaps (e.g., user switches `grid-json` → `grid-csv`) go through the same `page.switchMainEditor → createEditor → switchFrom → restore` flow as cross-camp swaps; the format discriminator is class-baked on the freshly-constructed editor.

User-visible outcome: opening a `.csv` / `.json` / `.jsonl` / `.grid.json` file renders the Grid identically to today — same AVGrid, same FilterBar, same toolbar widgets, same CSV options popover, same column-editor popover. The script API `page.asGrid()` becomes async on the **switch** (already async today) but sync on every method (GridEditor has `GridQueueRequest = never` — no view-context queries).

## Background

### Today's shape (`src/renderer/editors/grid/`) — post-US-551

Six files implement the Grid editor today:

| File | Role |
|------|------|
| `GridViewModel.ts` | `GridViewModel extends ContentViewModel<GridViewState>` — wraps an `AVGridModel<any>` via `gridRef`. `onInit` does initial load + CSV delimiter detection (variant-aware via `host.state.get().editor`) + restoreState (async). Persists to `<host.id>-grid-page.json` via `host.stateStorage.setState`. |
| `GridEditor.tsx` | The view — `GridEditor({ model })` reads `model.state.get().editor` to discriminate variant, calls `useContentViewModel<GridViewModel>(model, editorId)`, renders `<AVGrid>` inside `<FiltersProvider>` + `<FilterBar>`. Portal-renders toolbar contributions into `model.editorToolbarRefFirst/Last` and footer record-count into `model.editorFooterRefLast`. |
| `index.ts` | Re-exports `GridEditor` (the component), `GridPage` (backward-compat alias), `GridViewModel`, `createGridViewModel`, `defaultGridViewState`, plus shared helpers (`idColumnKey`, `getRowKey`, etc.). |
| `utils/grid-utils.ts` | Pure helpers — `createIdColumn`, `removeIdColumn`, `getGridDataWithColumns`, `nextColumnKeys`, `idColumnKey`. View-/model-agnostic. **Unchanged.** |
| `components/ColumnsOptions.tsx` | Imperative `showColumnsOptions(anchor, gridRef, isCsv, onUpdateRows)` popover. **Unchanged.** |
| `components/CsvOptions.tsx` | Imperative `showCsvOptions(anchor, gridViewModel)` popover. Reads `csvDelimiter` / `csvWithColumns` slice from the VM and calls `setDelimiter` / `toggleWithColumns`. **One signature touch:** swap `GridViewModel` for `GridEditor`. |

### Strangler-fig state after US-551 (what's already in place for US-552)

- `v4/EditorModel`, `v4/LegacyEditorAdapter`, `v4/CONTENT_HOST_TRAIT`, `v4/editorRegistry`, `v4/TextChrome`, `v4/PageToolbar`, `v4/EditorStateStorage`, `ComponentQueue` — all in production from US-547 to US-549.
- `MonacoEditor` (the v4-native model) lives at `src/renderer/editors/monaco/MonacoEditor.ts`. Its `switchFrom` accepts any old editor with `CONTENT_HOST_TRAIT` — including the bare-adapter wrapping a Grid host.
- `LegacyEditorAdapter` registers `CONTENT_HOST_TRAIT` whenever the wrapped legacy editor is a `TextFileModel`. Its `switchFrom` extracts the host from any v4-native editor (e.g., a `GridEditor` after US-552) — meaning Grid → Monaco swaps already work the moment GridEditor's `extractContentHost()` is wired.
- `v4EditorRegistry.register({ id: "grid-json"/"grid-csv"/"grid-jsonl", … })` from `register-editors.ts:738-801` currently uses the **bare-adapter loadModule factory** — constructs a placeholder `TextFileModel` wrapped in `LegacyEditorAdapter` with the target editor id. US-552 replaces those three entries with native v4 module factories.
- `wrapLegacyForPage(legacy)` in `PagesLifecycleModel.ts:52-64` branches on `targetEditorId === "monaco"`. US-552 extends this branch to also recognize `grid-json` / `grid-csv` / `grid-jsonl` targets.
- `PagesPersistenceModel.restorePage` in `PagesPersistenceModel.ts:81-142` already has a Monaco-native branch (`editorId === "monaco" && d.host`). US-552 adds a parallel Grid branch.
- `RenderEditor` at `src/renderer/ui/app/RenderEditor.tsx` already branches on `instanceof LegacyEditorAdapter` and routes v4-native models through `getV4EditorModule(editorId).Component`. No change to this file.
- `PageWrapper.asGrid(force)` in `src/renderer/scripting/api-wrapper/PageWrapper.ts:173-182` calls `model.acquireViewModel(targetId) as GridViewModel`. US-552 retires the `acquireViewModel` path and wraps the v4-native `GridEditor` directly.
- `getTextFileHost(pageId)` (M11 from US-551) already reads `main.contentHost` for v4-native editors — Grid pages restored through the new path produce the same TextFileModel host that MCP / compare-mode / grouped-text helpers expect.
- `TextChrome.ToolbarPortalSlots` and `FooterContributionSlot` check `host.state.editor !== "monaco"` to decide whether to render the portal-target divs. With Grid migrated, **a v4-native GridEditor's host still has `state.editor === "grid-json"/...`** — the portal slots would render empty (no consumer to `createPortal` into them). This needs a guard: skip portal-slot rendering when `model` is not a `LegacyEditorAdapter`. See G8 below.

### Walkthrough 21 design — already resolved

Walkthrough 21 ([`21-grid.md`](../../epics/EPIC-028-editor-architecture/walkthroughs/21-grid.md)) closed with **zero mockup changes** and ten concerns resolved (GR1–GR10). Key outcomes carried into this task:

- **GR1** — One `GridEditor` class with constructor-bound `editorId: "grid-json" | "grid-csv" | "grid-jsonl"` and `format: "json" | "csv" | "jsonl"`. Three registry factories construct three instances of the same class.
- **GR2** — Variant readouts use `this.format`, not `this.editorId`. Tiny `formatFromEditorId` helper lives in `editors/grid/util.ts` (new pure file alongside `utils/grid-utils.ts`).
- **GR3** — Today's `GridViewModel.onInit` body splits across three call sites: model-side `restore()` (CSV delimiter bootstrap + reparse rows), model-side `adoptHost` (subscribe `_hostContentUnsub` for re-parse on host content change; subscribe `_csvOptionsUnsub` for `csvDelimiter` / `csvWithColumns` slice changes); view-side `GridBody` useEffect (page-focus scroll-restore; mount-time focus). `saveStateDebounced` retires — every editor-state mutation forwards through `descriptorChanged.send()` (P3 debounces at the window-persistence layer).
- **GR4** — Grid state rides `EditorDescriptor.state`; per-editor `<id>-grid-page.json` cache file is **eliminated**. View-derived `rows` / `error` strip via `getRestoreData()` (MO5 pattern).
- **GR5** — `sortColumn` two-way sync via `setGridRef` callback (view-mount → write saved sortColumn to gridRef; gridRef.subscribe → forward changes to editor.state). Same callback also re-fires saved `focus` via `gridRef.models.focus.focusCell` on mount.
- **GR6** — Per-editor-state isolation across `switchFrom`. The fresh GridEditor instance starts with `defaultGridEditorState` (empty search, no filters, no focus); restart-side persistence restores those fields via `applyRestoreData`. No special "clear across switchFrom" code.
- **GR7** — CSV delimiter detection lives inside `GridEditor.restore()` after host content loads. Gated on `this.format === "csv" && (!savedCsvDelimiter || savedCsvDelimiter === ",")` to preserve user-chosen delimiters.
- **GR8** — `state.error: string | undefined` for reactive view read; stripped from `getRestoreData` (MO5 pattern).
- **GR9** — gridRef survival across switch-in/switch-out covered by GR5's setGridRef pattern — no extra code.
- **GR10** — `GridQueueEvent = { type: "focus" } | { type: "focusCell"; row; col }`. `GridQueueRequest = never` — Grid's script API has no async query path (all reads sync via `editor.state.get()`).

### v4 foundation already in place (no work in US-552)

- `IContentHost` interface — `id`, `state`, `changeContent`, `changeLanguage`, `setStorage`, `dispose`, `getDescriptor`, optional `handleKeyDown`.
- `TextFileModel.getDescriptor()` / `TextFileModel.fromDescriptor(desc)` / `TextFileModel.setStorage(storage)` — added by US-551.
- `EditorStateBase` widens with `id`, `title`, `modified`, optional `secondaryEditor` — adequate for `GridEditorState`.
- `persistence-v4.ts` — `HostDescriptor { kind: "textFile"; state; pipe? }`, `EditorDescriptor { editorId; id; state; host? }`, etc.
- `ComponentQueue` — `send` / `subscribe` / `use` for events; `execute` / `register` / `useRequest` for request/reply. Grid uses events only.

## Implementation plan

### Step 1 — Create `GridEditor`, `GridBody`, and the new module index (the new files)

The existing `editors/grid/` folder keeps its current files (`GridViewModel.ts` and `GridEditor.tsx` delete at the end of this task per Step 9). New files coexist alongside the legacy ones during implementation.

`src/renderer/editors/grid/GridEditor.ts` — **new file**:

```typescript
import { SetStateAction } from "react";
import { TComponentState } from "../../core/state/state";
import {
    EditorModel as V4EditorModel,
    type EditorStateBase,
    type RestoreData,
} from "../base/v4/EditorModel";
import { CONTENT_HOST_TRAIT, type IContentHostTrait } from "../base/v4/editor-traits";
import type { IContentHost } from "../base/v4/IContentHost";
import { ComponentQueue } from "../../core/state/ComponentQueue";
import type { EditorDescriptor, HostDescriptor } from "../../../shared/persistence-v4";
import type { IContentPipe } from "../../api/types/io.pipe";
import type { PageModel } from "../../api/pages/PageModel";
import { TextFileModel } from "../text/TextEditorModel";
import { editorRegistry as v4Registry } from "../base/v4/editorRegistry";
import { fpBasename } from "../../core/utils/file-path";
import { ui } from "../../api/ui";
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

/**
 * EPIC-028 / US-552 — native v4 Grid editor. One class, three registrations
 * (grid-json / grid-csv / grid-jsonl) discriminated by a constructor-bound
 * `format` field. Wraps the legacy `TextFileModel` as its `IContentHost`.
 *
 * Design rationale: doc/epics/EPIC-028-editor-architecture/walkthroughs/21-grid.md.
 */

export type GridQueueEvent =
    | { type: "focus" }
    | { type: "focusCell"; row: number; col: number };

export type GridQueueRequest = never;

export interface GridEditorState extends EditorStateBase {
    // Structural — persisted via getRestoreData.
    columns: Column[];
    focus: CellFocus | undefined;
    search: string;
    filters: TFilter[];
    sortColumn: TSortColumn | undefined;
    csvDelimiter: string;     // grid-csv only; ignored elsewhere
    csvWithColumns: boolean;  // grid-csv only; ignored elsewhere

    // View-derived — present on state for reactive reads; stripped from
    // getRestoreData (MO5 / GR8 pattern).
    rows: any[];
    error: string | undefined;
}

export const defaultGridEditorState: GridEditorState = {
    id: "",
    title: "",
    modified: false,
    secondaryEditor: undefined,
    columns: [],
    focus: undefined,
    search: "",
    filters: [],
    sortColumn: undefined,
    csvDelimiter: ",",
    csvWithColumns: false,
    rows: [],
    error: undefined,
};

function isLegacyTextFileHost(host: unknown): host is TextFileModel {
    return (host as { type?: string } | null)?.type === "textFile";
}

export class GridEditor extends V4EditorModel<GridEditorState, void, GridQueueEvent> {
    readonly editorId: GridEditorId;
    readonly format: GridFormat;

    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _hostContentUnsub: (() => void) | null = null;
    private _csvOptionsUnsub: (() => void) | null = null;
    private _pendingHost: HostDescriptor | undefined = undefined;

    /** Re-entry guard — set to the content we just serialized, so the
     *  `_hostContentUnsub` re-parse handler skips its own echo. */
    private _changedContent = "";
    private _maxRowId = 0;

    /** Narrowed queue typed for Grid's event union. */
    readonly typedQueue: ComponentQueue<GridQueueEvent, GridQueueRequest>;

    constructor(state: TComponentState<GridEditorState>, editorId: GridEditorId) {
        super(state);
        this.editorId = editorId;
        this.format = formatFromEditorId(editorId);
        this.typedQueue = this.queue as unknown as ComponentQueue<GridQueueEvent, GridQueueRequest>;

        const trait: IContentHostTrait = {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) throw new Error("Host already extracted from GridEditor");
                this._hostStateUnsub?.();
                this._hostContentUnsub?.();
                this._csvOptionsUnsub?.();
                this._hostStateUnsub = null;
                this._hostContentUnsub = null;
                this._csvOptionsUnsub = null;
                this._host = null;
                return host as unknown as IContentHost;
            },
        };
        this.traits.add(CONTENT_HOST_TRAIT, trait);
    }

    // ── Host accessors ──────────────────────────────────────────────────

    get contentHost(): IContentHost | null {
        return (this._host as unknown as IContentHost) ?? null;
    }

    findCompatibleEditors(): string[] {
        if (!this._host) return [];
        return v4Registry.findEditorsAccepting(this._host as unknown as IContentHost);
    }

    getNavigatorTarget(): { pipe?: IContentPipe | null; filePath?: string | null } | null {
        if (!this._host) return null;
        const { filePath } = this._host.state.get();
        const pipe = this._host.pipe;
        if (!pipe && !filePath) return {};
        return { pipe, filePath };
    }

    focus(): void {
        this.typedQueue.send({ type: "focus" });
    }

    /** Restore-time and script-API entry to position the cell cursor. */
    focusCell(row: number, col: number): void {
        this.typedQueue.send({ type: "focusCell", row, col });
    }

    // ── Persistence ─────────────────────────────────────────────────────

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        return {
            editorId: this.editorId,
            id: s.id,
            state: {
                title: s.title,
                modified: s.modified,
                secondaryEditor: s.secondaryEditor,
                columns: s.columns,
                focus: s.focus,
                search: s.search,
                filters: s.filters,
                sortColumn: s.sortColumn,
                csvDelimiter: s.csvDelimiter,
                csvWithColumns: s.csvWithColumns,
                // rows + error stripped — view-derived (GR8 / MO5).
            } as Record<string, unknown>,
            host: this._host?.getDescriptor(),
        };
    }

    applyRestoreData(data: RestoreData<GridEditorState>): void {
        this.state.update((cur) => {
            if (data.title !== undefined) cur.title = data.title;
            if (data.modified !== undefined) cur.modified = data.modified;
            if (data.secondaryEditor !== undefined) cur.secondaryEditor = data.secondaryEditor;
            if (data.columns !== undefined) cur.columns = data.columns;
            if (data.focus !== undefined) cur.focus = data.focus;
            if (data.search !== undefined) cur.search = data.search;
            if (data.filters !== undefined) cur.filters = data.filters;
            if (data.sortColumn !== undefined) cur.sortColumn = data.sortColumn;
            if (data.csvDelimiter !== undefined) cur.csvDelimiter = data.csvDelimiter;
            if (data.csvWithColumns !== undefined) cur.csvWithColumns = data.csvWithColumns;
        });
        if (data.host) this._pendingHost = data.host;
    }

    // ── Three-phase lifecycle ──────────────────────────────────────────

    switchFrom(oldEditor: V4EditorModel): void {
        const trait = oldEditor.traits.get(CONTENT_HOST_TRAIT);
        if (!trait) {
            throw new Error(
                `GridEditor.switchFrom: ${oldEditor.editorId} has no CONTENT_HOST_TRAIT`,
            );
        }
        const host = trait.extractContentHost() as unknown as TextFileModel;
        if (!isLegacyTextFileHost(host)) {
            throw new Error("GridEditor.switchFrom: extracted host is not a TextFileModel");
        }
        // Preserve cache-file id across the swap (C9).
        this.state.update((s) => { s.id = oldEditor.id; });
        // Tag the legacy host with the target editor id so ScriptPanel /
        // encoding / IO submodels keep their existing assumptions. The
        // legacy `state.editor` field stays the source of truth for the
        // legacy host's own internals during the strangler period.
        host.state.update((s) => { s.editor = this.editorId; });
        this.adoptHost(host);
    }

    async restore(): Promise<void> {
        try {
            if (!this._host) {
                if (this._pendingHost) {
                    this._host = await TextFileModel.fromDescriptor(this._pendingHost);
                } else {
                    const { newTextFileModel } = await import("../text/TextEditorModel");
                    this._host = newTextFileModel("");
                }
            }
            if (!this._host.state.get().restored) {
                await this._host.restore();
            }
            this.adoptHost(this._host);

            // GR7 — variant-aware CSV delimiter detection. Runs once on
            // restore. Skipped when a user-chosen delimiter was persisted
            // (anything other than the default ",").
            if (this.format === "csv") {
                const s = this.state.get();
                if (!s.csvDelimiter || s.csvDelimiter === ",") {
                    const content = this._host.state.get().content ?? "";
                    const detected = detectCsvDelimiter(content);
                    if (detected !== s.csvDelimiter) {
                        this.state.update((x) => { x.csvDelimiter = detected; });
                    }
                }
            }

            // Initial row parse from host content (or empty-page bootstrap).
            const content = this._host.state.get().content ?? "";
            this.reparseRows(content);
        } catch (err) {
            ui.notify((err as Error).message || "Failed to restore Grid editor.", "error");
            const { newTextFileModel } = await import("../text/TextEditorModel");
            this._host = newTextFileModel("");
            this.adoptHost(this._host);
        }
        this._pendingHost = undefined;
    }

    /** Adopt a host without going through `switchFrom`. Used by
     *  `wrapLegacyForPage` in PagesLifecycleModel when constructing a fresh
     *  GridEditor over a freshly-restored legacy TextFileModel. */
    adoptHost(host: TextFileModel): void {
        this._host = host;
        this._hostStateUnsub?.();
        this._hostContentUnsub?.();
        this._csvOptionsUnsub?.();

        // descriptorChanged forwarder — host metadata changes ride the
        // page-level persistence debounce.
        this._hostStateUnsub = host.state.subscribe(() =>
            this.descriptorChanged.send(undefined),
        );

        // Re-parse rows when host content mutates (script API write,
        // encryption decrypt, content pipe refresh).
        this._hostContentUnsub = host.state.subscribe(
            (content) => {
                if (content !== this._changedContent) {
                    this.reparseRowsFromHost(content as string);
                }
            },
            (s) => s.content,
        );

        // CSV-only — reload rows when user changes delimiter / header toggle.
        if (this.format === "csv") {
            let lastDelimiter = this.state.get().csvDelimiter;
            let lastWithColumns = this.state.get().csvWithColumns;
            this._csvOptionsUnsub = this.state.subscribe(() => {
                const { csvDelimiter, csvWithColumns } = this.state.get();
                if (csvDelimiter !== lastDelimiter || csvWithColumns !== lastWithColumns) {
                    lastDelimiter = csvDelimiter;
                    lastWithColumns = csvWithColumns;
                    const content = this._host?.state.get().content ?? "";
                    this.reparseRows(content);
                }
            });
        }

        const { filePath, title } = host.state.get();
        this.state.update((s) => {
            s.title = title || (filePath ? fpBasename(filePath) : s.title || "untitled");
            if (host.state.get().id) s.id = host.state.get().id;
        });
        host.state.update((s) => {
            if (s.editor !== this.editorId) s.editor = this.editorId;
        });
        if (this.page) host.setPage(this.page);
    }

    setPage(page: PageModel | null): void {
        super.setPage(page);
        this._host?.setPage(page);
    }

    // ── Row parsing ─────────────────────────────────────────────────────

    /** Initial / explicit reparse. Handles empty-page bootstrap (initEmptyPage). */
    private reparseRows(content: string): void {
        if (!content) {
            this.initEmptyPage();
            return;
        }
        const parsed = this.parseContent(content);
        if (parsed && Array.isArray(parsed)) {
            const data = getGridDataWithColumns(parsed);
            this._maxRowId = data.rows.length;
            this.state.update((s) => {
                s.rows = data.rows;
                s.columns = data.columns;
            });
        } else {
            this.state.update((s) => { s.rows = []; });
        }
    }

    /** Host content changed externally — re-derive rows but keep columns. */
    private reparseRowsFromHost(content: string): void {
        let rows = this.parseContent(content ?? "[]");
        if (rows && Array.isArray(rows)) {
            rows = createIdColumn(rows);
            this.state.update((s) => { s.rows = rows; });
        }
    }

    private initEmptyPage(): void {
        const rows = createIdColumn([{}]);
        const columns: Column[] = [{
            key: "a", name: "a", dataType: "string",
            width: 100, resizible: true, filterType: "options",
        }];
        this._maxRowId = rows.length;
        this.state.update((s) => {
            s.rows = rows;
            s.columns = columns;
        });
        // GridBody mount will focus cell 0,0 via its setGridRef callback.
        this.focusCell(0, 0);
    }

    private parseContent(content: string): any {
        let err: any = undefined;
        let res: any = undefined;
        switch (this.format) {
            case "csv": {
                const { csvDelimiter, csvWithColumns } = this.state.get();
                let rows = csvToRecords(content, csvWithColumns, csvDelimiter, (e) => (err = e));
                if (Array.isArray(rows) && !csvWithColumns) {
                    rows = rows.map((r) => ({ ...r }));
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
        this.state.update((s) => { s.search = search; });
    };

    clearSearch = (): void => {
        this.state.update((s) => { s.search = ""; });
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
        this.state.update((s) => { s.columns = newColumns; });
    };

    onAddColumns = (count: number, insertBeforeKey?: string): Column[] => {
        const currentColumns = this.state.get().columns;
        const newColumns: Column[] = nextColumnKeys(currentColumns, count).map((key) => ({
            key, name: key, dataType: "string",
            width: 100, resizible: true, filterType: "options",
        }));
        let index = currentColumns.length;
        if (insertBeforeKey) {
            const foundIndex = currentColumns.findIndex((c) => c.key === insertBeforeKey);
            if (foundIndex >= 0) index = foundIndex;
        }
        this.state.update((s) => { s.columns.splice(index, 0, ...newColumns); });
        return newColumns;
    };

    onDeleteColumns = (columnKeys: (keyof any | string)[]): void => {
        this.onUpdateRows((rows) => rows.map((row) => {
            const newRow = { ...row };
            for (const key of columnKeys) delete newRow[key];
            return newRow;
        }));
        this.state.update((s) => {
            s.columns = s.columns.filter((c) => !columnKeys.includes(c.key));
        });
    };

    onUpdateRows = (updateFunc: (rows: any[]) => any[]): void => {
        const rows = this.state.get().rows;
        const updatedRows = updateFunc(rows);
        if (updatedRows !== rows) {
            this.state.update((s) => { s.rows = updatedRows; });
            this.onDataChanged();
        }
    };

    // ── CSV options ─────────────────────────────────────────────────────

    setDelimiter = (delimiter: string): void => {
        this.state.update((s) => { s.csvDelimiter = delimiter; });
    };

    toggleWithColumns = (): void => {
        this.state.update((s) => { s.csvWithColumns = !s.csvWithColumns; });
    };

    // ── Filter options (consumed by FiltersProvider) ────────────────────

    onGetOptions: TOnGetFilterOptions = (columns, filters, columnKey, search) => {
        const uniqueValues = new Set<any>();
        filterRows(
            this.state.get().rows, columns, search,
            filters?.filter((f) => f.columnKey !== columnKey),
        ).forEach((i) => uniqueValues.add(i[columnKey]));
        const options = Array.from(uniqueValues);
        options.sort(defaultCompare());
        return options.map((i) => ({
            value: i,
            label: i === undefined ? "(undefined)" : i === null ? "(null)" : i?.toString(),
            italic: i === undefined || i === null,
        }));
    };

    // ── Serialization ───────────────────────────────────────────────────

    private getContentToSave(): string {
        switch (this.format) {
            case "csv": return this.getCsvContent();
            case "jsonl": return this.getJsonlContent();
            case "json":
            default: return this.getJsonContent();
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

    // ── Records count (consumed by GridFooter) ──────────────────────────

    get recordsCount(): string {
        // Without access to gridRef, we report total rows here. View-side
        // GridFooter consumes visible-row count from gridRef directly per
        // GR3 (view-local detail).
        const rows = this.state.get().rows.length;
        return `${rows} rows`;
    }

    // ── Reaction hooks — delegate to host ───────────────────────────────

    async confirmRelease(closing?: boolean): Promise<boolean> {
        return this._host ? this._host.confirmRelease(closing) : true;
    }

    async saveState(): Promise<void> {
        // GR4 — no per-editor cache file. Host content saves via
        // host.io.saveState; editor state rides EditorDescriptor.state.
        await this._host?.io.saveState();
    }

    async dispose(): Promise<void> {
        this._hostStateUnsub?.();
        this._hostContentUnsub?.();
        this._csvOptionsUnsub?.();
        this._hostStateUnsub = null;
        this._hostContentUnsub = null;
        this._csvOptionsUnsub = null;
        if (this._host) {
            await this._host.dispose();
            this._host = null;
        }
        await super.dispose();
    }
}

// ── Helpers (file-local) ────────────────────────────────────────────────

function detectCsvDelimiter(content: string): string {
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
            onError(new Error(`Line ${i + 1}: ${(e as Error).message}`));
            return result;
        }
    }
    return result;
}
```

`src/renderer/editors/grid/util.ts` — **new file** (tiny pure module — `formatFromEditorId` plus the literal-type aliases):

```typescript
export type GridFormat = "json" | "csv" | "jsonl";
export type GridEditorId = "grid-json" | "grid-csv" | "grid-jsonl";

export function formatFromEditorId(id: GridEditorId): GridFormat {
    switch (id) {
        case "grid-csv": return "csv";
        case "grid-jsonl": return "jsonl";
        case "grid-json":
        default: return "json";
    }
}
```

`src/renderer/editors/grid/GridBody.tsx` — **new file** (replaces the body of today's `GridEditor.tsx`):

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { AVGrid, FiltersProvider, FilterBar, type AVGridModel } from "../../uikit";
import { Panel } from "../../uikit/Panel";
import { pagesModel } from "../../api/pages";
import { useEditorConfig } from "../base";
import { EditorError } from "../base/EditorError";
import { getRowKey } from "./utils/grid-utils";
import type { GridEditor } from "./GridEditor";
import type { TextFileModel } from "../text/TextEditorModel";

/**
 * EPIC-028 / US-552 — Grid view body. Drains the editor's `ComponentQueue`
 * for focus / focusCell events, owns the AVGrid ref + two-way sortColumn
 * sync (GR5), and renders the AVGrid inside FiltersProvider + FilterBar.
 */
interface GridBodyProps { model: GridEditor }

export function GridBody({ model }: GridBodyProps) {
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
            if (
                page === model.page ||
                pagesModel.activePage === model.page
            ) {
                Promise.resolve().then(() => {
                    gridRef.current?.renderModel?.restoreScroll();
                });
            }
        });
        return () => sub.unsubscribe();
    }, [model]);

    // Force re-render on visible-row changes for the footer's record count.
    const [, setTick] = useState(0);
    const onVisibleRowsChanged = useCallback(() => {
        Promise.resolve().then(() => setTick((t) => t + 1));
    }, []);

    // GR5 — two-way sortColumn sync via setGridRef callback.
    const setGridRef = useCallback((ref: AVGridModel<any> | null) => {
        gridRef.current = ref;
        if (!ref) return;
        // 1. Editor → gridRef: write saved sortColumn on mount.
        const saved = model.state.get().sortColumn;
        if (saved) {
            ref.state.update((s) => { s.sortColumn = saved; });
        }
        // 2. gridRef → editor: forward sortColumn changes to editor state.
        const sub = ref.state.subscribe(
            (sortColumn) => {
                if (model.state.get().sortColumn !== sortColumn) {
                    model.state.update((s) => { s.sortColumn = sortColumn; });
                }
            },
            (s) => s.sortColumn,
        );
        // No teardown here — when the ref unmounts the AVGridModel is GC'd
        // and the subscription dies with it.
        void sub;
    }, [model]);

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
                    onVisibleRowsChanged={onVisibleRowsChanged}
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
}

// Helper exported for GridFooter consumers that want visible-row count.
export function getVisibleRowsLabel(model: GridEditor, gridRef: AVGridModel<any> | null): string {
    const rows = model.state.get().rows.length;
    const visible = gridRef?.data.rows.length ?? rows;
    return visible === rows ? `${rows} rows` : `${visible} of ${rows} rows`;
}
```

`src/renderer/editors/grid/index.tsx` — **rewrites** today's `index.ts`. Composes the chrome + body + toolbar/footer contributions and exports a v4 `EditorModule`:

```tsx
import { useRef } from "react";
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
    const gridRefForToolbar = useRef<AVGridModel<any> | null>(null);
    // GridBody owns the actual gridRef (for AVGrid + sortColumn sync).
    // ColumnsOptions popover needs the same ref — we pass a callback
    // that captures it through GridBody's setGridRef wrapper. To avoid
    // exposing the body's internal ref, GridToolbarBits resolves it from
    // the DOM via the AVGrid's ref-forwarding mechanism — see Step 1
    // closure. For simplicity, ColumnsOptions resolves through the
    // editor's queue: `editor.focusCell` works; for column updates we
    // route via `editor.onUpdateRows`.
    return (
        <TextChrome
            model={model}
            toolbarContributions={
                <GridToolbarBits editor={editor} gridRefHolder={gridRefForToolbar} />
            }
            footerContributions={
                <GridFooterBits editor={editor} gridRefHolder={gridRefForToolbar} />
            }
        >
            <GridBody model={editor} ref={gridRefForToolbar} />
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
    const { search } = editor.state.use((s) => ({ search: s.search }));
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
            <Input
                name="grid-search"
                size="sm"
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
        </>
    );
}

function GridFooterBits({
    editor,
    gridRefHolder,
}: {
    editor: GridEditor;
    gridRefHolder: React.MutableRefObject<AVGridModel<any> | null>;
}) {
    // Re-render when rows or filters change.
    editor.state.use((s) => ({ r: s.rows.length, f: s.filters.length }));
    return (
        <span className="records-count">
            {getVisibleRowsLabel(editor, gridRefHolder.current)}
        </span>
    );
}

function makeModule(id: GridEditorId): EditorModule {
    return {
        createEditor: () => new GridEditor(
            new TComponentState({ ...defaultGridEditorState }),
            id,
        ),
        Component: GridEditorView,
    };
}

export const gridJsonModule: EditorModule = makeModule("grid-json");
export const gridCsvModule: EditorModule = makeModule("grid-csv");
export const gridJsonlModule: EditorModule = makeModule("grid-jsonl");

export { GridEditor, defaultGridEditorState };
export type { GridEditorState, GridQueueEvent } from "./GridEditor";
export type { GridFormat, GridEditorId } from "./util";

// Re-exports for callers of the old grid module.
export {
    GridData,
    GridColumn,
    idColumnKey,
    getRowKey,
    createIdColumn,
    removeIdColumn,
    getGridDataWithColumns,
    nextColumnKeys,
} from "./utils/grid-utils";
export { ColumnsOptions, showColumnsOptions } from "./components/ColumnsOptions";
export { CsvOptions, showCsvOptions } from "./components/CsvOptions";
```

**`GridBody`'s ref forwarding** — the `ref={gridRefForToolbar}` prop on `<GridBody>` requires `GridBody` to accept a forwarded ref. Add `React.forwardRef` in `GridBody.tsx`; the body assigns both its internal ref and the forwarded ref inside `setGridRef`:

```tsx
export const GridBody = React.forwardRef<AVGridModel<any>, GridBodyProps>(
    function GridBody({ model }, forwardedRef) {
        // … inside setGridRef:
        const setGridRef = useCallback((ref: AVGridModel<any> | null) => {
            gridRef.current = ref;
            if (typeof forwardedRef === "function") forwardedRef(ref);
            else if (forwardedRef) forwardedRef.current = ref;
            // … rest of GR5 sync logic unchanged.
        }, [model, forwardedRef]);
        // …
    },
);
```

### Step 2 — Replace bare-adapter v4 registrations with native module factories

Edit `src/renderer/editors/register-editors.ts`. Three entries swap factory implementations:

After the legacy-mirror loop (`for (const legacyDef of editorRegistry.getAll()) { ... }`) and after the existing Monaco-native registration (line 812+), add three native Grid registrations that **override** the bare-adapter entries written by the mirror loop:

```typescript
// US-552 — replace the legacy bare-adapter mirrors for grid-json / grid-csv /
// grid-jsonl with native v4 modules. `v4EditorRegistry.register` overwrites
// by id, so these supersede the bare-adapter stubs.
v4EditorRegistry.register({
    id: "grid-json",
    name: "Grid (JSON)",
    hasContentHost: true,
    accepts: (input) => {
        // Mirror today's legacy registry priorities. acceptFile / switchOption
        // already filter on extensions (.json / .grid.json) and language
        // ("json"). Re-derive via the legacy def lookup to avoid duplicating
        // rules.
        const legacy = editorRegistry.getById("grid-json");
        if (!legacy) return -1;
        if (input.fileName) {
            const p = legacy.acceptFile?.(input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        if (input.language) {
            const p = legacy.switchOption?.(input.language, input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        return -1;
    },
    loadModule: async () => {
        const { gridJsonModule } = await import("./grid");
        return gridJsonModule;
    },
});

v4EditorRegistry.register({
    id: "grid-csv",
    name: "Grid (CSV)",
    hasContentHost: true,
    accepts: (input) => {
        const legacy = editorRegistry.getById("grid-csv");
        if (!legacy) return -1;
        if (input.fileName) {
            const p = legacy.acceptFile?.(input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        if (input.language) {
            const p = legacy.switchOption?.(input.language, input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        return -1;
    },
    loadModule: async () => {
        const { gridCsvModule } = await import("./grid");
        return gridCsvModule;
    },
});

v4EditorRegistry.register({
    id: "grid-jsonl",
    name: "Grid (JSONL)",
    hasContentHost: true,
    accepts: (input) => {
        const legacy = editorRegistry.getById("grid-jsonl");
        if (!legacy) return -1;
        if (input.fileName) {
            const p = legacy.acceptFile?.(input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        if (input.language) {
            const p = legacy.switchOption?.(input.language, input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        return -1;
    },
    loadModule: async () => {
        const { gridJsonlModule } = await import("./grid");
        return gridJsonlModule;
    },
});
```

Also remove `grid-json` / `grid-csv` / `grid-jsonl` from the `TEXT_CONTENT_VIEW_BRIDGE_IDS` set (line 741). Those three ids no longer take the bare-adapter loadModule branch; the native v4 module owns them now.

### Step 3 — Extend `wrapLegacyForPage` for Grid targets

Edit `src/renderer/api/pages/PagesLifecycleModel.ts:52-64`. Today only `monaco` gets the v4-native wrap; extend the branch to also recognize the three Grid ids:

```typescript
export function wrapLegacyForPage(legacy: LegacyEditorModel): V4EditorModel {
    const targetEditorId = deriveEditorId(legacy.state.get());
    const isTextFile = (legacy as unknown as { type?: string }).type === "textFile";

    if (isTextFile && targetEditorId === "monaco") {
        const id = legacy.state.get().id || crypto.randomUUID();
        const monaco = new MonacoEditor(
            new TComponentState({ ...defaultMonacoEditorState, id }),
        );
        monaco.adoptHost(legacy as TextFileModel);
        return monaco;
    }

    if (
        isTextFile &&
        (targetEditorId === "grid-json" ||
            targetEditorId === "grid-csv" ||
            targetEditorId === "grid-jsonl")
    ) {
        const id = legacy.state.get().id || crypto.randomUUID();
        const grid = new GridEditor(
            new TComponentState({ ...defaultGridEditorState, id }),
            targetEditorId as GridEditorId,
        );
        grid.adoptHost(legacy as TextFileModel);
        // Open-file flow — `adoptHost` doesn't run the CSV bootstrap or
        // initial reparse (those live in `restore()`). For the open-file
        // path, the caller has already invoked legacy.restore() before
        // wrapForPage; we trigger an initial reparse against current
        // host content here so the page renders rows immediately.
        const content = (legacy as TextFileModel).state.get().content ?? "";
        // CSV — detect delimiter if not user-chosen (mirror restore() logic).
        if (targetEditorId === "grid-csv") {
            const s = grid.state.get();
            if (!s.csvDelimiter || s.csvDelimiter === ",") {
                // Reach into the editor's private detect logic via a tiny
                // public helper added to GridEditor for this purpose, OR
                // inline the same detector here. Choose the helper: add
                // `static detectCsvDelimiter(content)` to GridEditor.
                const detected = GridEditor.detectCsvDelimiter(content);
                if (detected !== s.csvDelimiter) {
                    grid.state.update((x) => { x.csvDelimiter = detected; });
                }
            }
        }
        // Force the initial row parse — adoptHost only subscribes the
        // re-parse trigger, doesn't fire it for already-loaded content.
        (grid as unknown as { reparseRows: (c: string) => void }).reparseRows(content);
        return grid;
    }

    return new LegacyEditorAdapter(legacy, targetEditorId);
}
```

Add imports at the top of the file:

```typescript
import { GridEditor, defaultGridEditorState, type GridEditorId } from "../../editors/grid";
```

**Note on `GridEditor.detectCsvDelimiter`** — promote the file-local `detectCsvDelimiter` function into a `static` method on `GridEditor` so the open-file flow can call it without re-importing the helper. Update Step 1's `restore()` body to call `GridEditor.detectCsvDelimiter` as well, keeping a single source of truth.

**Alternative considered, rejected:** call `await grid.restore()` from inside `wrapLegacyForPage` to run the same bootstrap as the session-restore path. Rejected because `wrapLegacyForPage` is sync today and `addPage` callers don't await it. Forcing `restore()` to run synchronously requires re-architecting the open-file flow. Inline bootstrap (above) keeps `wrapLegacyForPage` sync and matches the existing Monaco path (`monaco.adoptHost(legacy)` runs sync; Monaco needs no bootstrap because content is the same shape Monaco renders directly).

### Step 4 — Persistence restore branch for Grid editorIds

Edit `src/renderer/api/pages/PagesPersistenceModel.ts:81-142`. Extend the Monaco-native branch to also handle Grid:

```typescript
restorePage = async (desc: PageDescriptor): Promise<PageModel | null> => {
    const page = new PageModel(desc.id);
    page.pinned = desc.pinned;

    const editors = await Promise.all(
        desc.editors.map(async (d) => {
            try {
                // v4-native restore for editors with a HostDescriptor.
                const isV4Native =
                    d.host !== undefined &&
                    (d.editorId === "monaco" ||
                        d.editorId === "grid-json" ||
                        d.editorId === "grid-csv" ||
                        d.editorId === "grid-jsonl");
                if (isV4Native) {
                    const { editorRegistry: v4Registry } = await import(
                        "../../editors/base/v4"
                    );
                    const editor = await v4Registry.createEditor(d.editorId, d.id);
                    editor.applyRestoreData(
                        d as unknown as Parameters<typeof editor.applyRestoreData>[0],
                    );
                    await editor.restore();
                    return editor;
                }
                // Legacy-shaped descriptor (no host field, or non-v4-native id).
                const legacyState = {
                    ...(d.state as Partial<IEditorState>),
                    id: d.id,
                };
                const legacy = await this.model.lifecycle.newEditorModelFromState(legacyState);
                legacy.applyRestoreData(legacyState);
                await legacy.restore();
                return new LegacyEditorAdapter(legacy, d.editorId);
            } catch (err) { /* ... unchanged ... */ }
        }),
    );
    // ... rest of restorePage unchanged ...
};
```

Update the JSDoc on `restorePage` to mention Grid as well:

> EPIC-028 / US-551 + US-552: descriptors with a `host` field and an editorId of `monaco` / `grid-json` / `grid-csv` / `grid-jsonl` restore through the native v4 path …

### Step 5 — TextChrome portal-slot guard for v4-native editors

Edit `src/renderer/editors/base/v4/TextChrome.tsx`. Today's `ToolbarPortalSlots` (line 248-269) and `FooterContributionSlot` (line 271-307) render portal-target divs when `host.state.editor !== "monaco"`. After US-552 the v4-native `GridEditor` keeps `host.state.editor === "grid-json"/..."grid-jsonl"`, but the editor uses **inline composition** (`toolbarContributions` + `footerContributions`) instead of portals. The portal slots would render empty divs into the DOM.

Add a `model`-side check: skip portal slots when `model` is **not** a `LegacyEditorAdapter` (i.e., it's a v4-native editor that wires its toolbar/footer through inline composition).

```typescript
// Import at the top of TextChrome.tsx:
import { LegacyEditorAdapter } from "./LegacyEditorAdapter";

// ...
function ToolbarPortalSlots({ model, host }: { model: EditorModel; host: TextFileModel | null }) {
    // v4-native editors compose toolbar contributions inline; skip the
    // portal slots so the DOM doesn't carry empty placeholder divs.
    if (!(model instanceof LegacyEditorAdapter)) return null;

    const editor = useSyncExternalStore<string | undefined>(
        host ? (cb) => host.state.subscribe(cb) : () => () => undefined,
        host ? () => host.state.get().editor : () => undefined,
    );
    if (!host) return null;
    if (!editor || editor === "monaco") return null;
    return (
        <>
            <div ref={(node) => host.setEditorToolbarRefFirst(node)} style={portalSlotStyle} />
            <div ref={(node) => host.setEditorToolbarRefLast(node)} style={portalSlotStyle} />
        </>
    );
}
```

And `FooterContributionSlot` — add the same guard on the alternative-editor portal-target div (keep `contributions` rendering for v4-native editors):

```typescript
function FooterContributionSlot({ host, model, contributions }) {
    // Always render the editor's own contributions inline.
    // Portal-target div renders only for legacy adapters with non-monaco editor.
    const isLegacy = model instanceof LegacyEditorAdapter;
    const editor = useSyncExternalStore<string | undefined>(
        (cb) => host.state.subscribe(cb),
        () => host.state.get().editor,
    );
    const alternative = isLegacy && editor && editor !== "monaco";
    if (!alternative && !contributions) return null;
    return (
        <>
            {contributions}
            {alternative && (
                <>
                    <Divider orientation="vertical" />
                    <div
                        ref={(node) => host.setFooterRefLast(node)}
                        className="footer-portal-target"
                        style={portalSlotStyle}
                    />
                </>
            )}
        </>
    );
}
```

### Step 6 — Rewrite `GridEditorFacade` over the v4 `GridEditor`

Edit `src/renderer/scripting/api-wrapper/GridEditorFacade.ts`. Drop the `GridViewModel` dependency entirely. The facade methods stay sync (no async queue requests in Grid).

```typescript
import type { GridEditor } from "../../editors/grid/GridEditor";

/**
 * EPIC-028 / US-552 — Safe facade around `GridEditor` for script access.
 * Implements the IGridEditor interface from api/types/grid-editor.d.ts.
 *
 * All methods sync (Grid has no async queue queries — GridQueueRequest = never).
 */
export class GridEditorFacade {
    constructor(private readonly editor: GridEditor) {}

    get rows(): any[] {
        return this.editor.state.get().rows;
    }

    get columns(): Array<{ readonly key: string; readonly name: string }> {
        return this.editor.state.get().columns.map((c) => ({
            key: String(c.key),
            name: c.name,
        }));
    }

    get rowCount(): number {
        return this.editor.state.get().rows.length;
    }

    editCell(columnKey: string, rowKey: string, value: any): void {
        this.editor.editRow(columnKey, rowKey, value);
    }

    addRows(count = 1, insertIndex?: number): any[] {
        return this.editor.onAddRows(count, insertIndex);
    }

    deleteRows(rowKeys: string[]): void {
        this.editor.onDeleteRows(rowKeys);
    }

    addColumns(count = 1, insertBeforeKey?: string): Array<{ readonly key: string; readonly name: string }> {
        const cols = this.editor.onAddColumns(count, insertBeforeKey);
        return cols.map((c) => ({ key: String(c.key), name: c.name }));
    }

    deleteColumns(columnKeys: string[]): void {
        this.editor.onDeleteColumns(columnKeys);
    }

    setSearch(text: string): void {
        this.editor.setSearch(text);
    }

    clearSearch(): void {
        this.editor.clearSearch();
    }
}
```

### Step 7 — Update `PageWrapper.asGrid` to wrap the v4 GridEditor

Edit `src/renderer/scripting/api-wrapper/PageWrapper.ts:173-196`:

```typescript
async asGrid(force = false): Promise<GridEditorFacade> {
    const targetId = this.resolveGridEditorId();
    await this.ensureEditor(targetId, "Grid", "asGrid", force);
    // EPIC-028 / US-552 — Grid is v4-native. After ensureEditor, the page's
    // mainEditorV4 IS a GridEditor; the facade wraps it directly. No
    // acquireViewModel round-trip.
    const v4 = this.v4;
    const { GridEditor } = await import("../../editors/grid/GridEditor");
    if (!(v4 instanceof GridEditor)) {
        throw new Error("asGrid(): page is not a GridEditor after switch");
    }
    return new GridEditorFacade(v4);
}
```

Update `resolveGridEditorId()` to read the host's language via `v4.contentHost` directly (it already does, line 190 — keep as-is).

Remove the `releaseList.push(() => model.releaseViewModel(targetId))` line — no view-model acquire/release cycle for Grid.

### Step 8 — Update `showCsvOptions` to accept `GridEditor`

Edit `src/renderer/editors/grid/components/CsvOptions.tsx`. Today the popover binds to a `GridViewModel`; after US-552 it binds to a `GridEditor`. Method names are the same (`setDelimiter`, `toggleWithColumns`); state shape is the same (`csvDelimiter`, `csvWithColumns`). One-line type swap:

```typescript
import type { GridEditor } from "../GridEditor";

class CsvOptionsModel extends TPopperModel<null, void> {
    el = undefined as Element | undefined;
    gridModel: GridEditor | undefined = undefined;  // was: GridViewModel
}

// ... rest of file: replace `GridViewModel` with `GridEditor` in the
// param annotations. State reads (`gridViewState`) and method calls
// (`setDelimiter` / `toggleWithColumns`) work unchanged because the
// editor exposes the same surface.

export const showCsvOptions = async (el: Element, gridModel: GridEditor) => {
    // ... unchanged body.
};
```

### Step 9 — Delete `GridViewModel.ts` and the legacy `GridEditor.tsx` view

Delete:
- `src/renderer/editors/grid/GridViewModel.ts` — replaced by `GridEditor.ts`.
- `src/renderer/editors/grid/GridEditor.tsx` — replaced by `GridBody.tsx` + `GridEditorView` in `index.tsx`.

Update the legacy registry (`src/renderer/editors/registry.ts` — the **legacy** one, not v4) to **not** advertise a content-view module for `grid-json` / `grid-csv` / `grid-jsonl` anymore. The legacy registry's `createViewModel` / `loadViewModelFactory` paths for Grid won't fire because no caller reaches them now: `PageWrapper.asGrid` calls the v4 path directly, and `RenderEditor` routes v4-native models to their own Component.

**Files NOT changed in US-552 (deferred):**
- `src/renderer/editors/text/TextEditor.tsx` (legacy TextViewModel + view) — still reachable via legacy adapter content-views (Markdown, Mermaid, SVG, HTML, Notebook, Todo, Link, Log, Rest, Graph, Draw) and the encryption fallback. Retires through US-554 (Preview group) and US-558 / US-559.
- `src/renderer/editors/text/TextEditorView.tsx`, `ActiveEditor.tsx`, `ScriptPanel.tsx` — used by remaining legacy content-views.
- `src/renderer/editors/base/ContentViewModel.ts`, `ContentViewModelHost.ts`, `useContentViewModel.ts` — still consumed by 10+ legacy content-views. Retire piecewise as each migrates.

### Step 10 — Smoke-test gating and `<id>-grid-page.json` orphan cleanup

GR4 eliminates the `<id>-grid-page.json` cache file. After US-552 ships, old installs may still have these files on disk:

- **Pre-US-552 sessions restoring via `restoreV3`** — `wrapLegacyForPage` now constructs a `GridEditor` for `state.editor === "grid-*"`. The new GridEditor never writes `<id>-grid-page.json`; on the next dispose the page calls `fs.deleteCacheFiles(editor.id)` (existing behavior), which wipes ALL cache files under the id including the orphan `-grid-page.json`. No special migration sweep needed.
- **Within-session switch (Monaco → Grid via the switch widget)** — the new GridEditor inherits the host's existing cache-file id (`switchFrom` copies it via `s.id = oldEditor.id`). It writes content cache to `<id>-host.txt` (unchanged), no `<id>-grid-page.json`. On final dispose the cache-files folder cleans up.

No code changes required for orphan cleanup — `fs.deleteCacheFiles(id)` is called by `PageModel.setMainEditor`'s editorToDispose cleanup at `src/renderer/api/pages/PageModel.ts:399-400`. Verified covers this case.

## Files Changed

| File | Change | Why |
|------|--------|-----|
| `src/renderer/editors/grid/GridEditor.ts` | **new** | Native v4 GridEditor + state + queue unions + serializers. |
| `src/renderer/editors/grid/GridBody.tsx` | **new** | Grid view body — AVGrid + FilterBar + queue drain + setGridRef sortColumn sync. forwardRef for parent toolbar/footer access. |
| `src/renderer/editors/grid/util.ts` | **new** | `GridFormat` / `GridEditorId` types + `formatFromEditorId` helper. |
| `src/renderer/editors/grid/index.tsx` | rewrite (was `index.ts`) | Three `EditorModule` exports (one per id) sharing one Component (`GridEditorView`). `GridToolbarBits` + `GridFooterBits` for inline contributions. |
| `src/renderer/editors/grid/components/CsvOptions.tsx` | modify | `GridViewModel` → `GridEditor` in type annotations and the `showCsvOptions(el, editor)` signature. State + method names unchanged. |
| `src/renderer/editors/grid/GridViewModel.ts` | **delete** | Replaced by `GridEditor.ts`. |
| `src/renderer/editors/grid/GridEditor.tsx` | **delete** | Replaced by `GridBody.tsx` + `GridEditorView` in `index.tsx`. |
| `src/renderer/editors/register-editors.ts` | modify | Remove grid ids from `TEXT_CONTENT_VIEW_BRIDGE_IDS`. Register native v4 modules for `grid-json` / `grid-csv` / `grid-jsonl` (overrides the bare-adapter mirrors). |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | modify | Extend `wrapLegacyForPage` with Grid branch; promote `detectCsvDelimiter` to a `static GridEditor` method for reuse from open-file path. |
| `src/renderer/api/pages/PagesPersistenceModel.ts` | modify | Extend `restorePage`'s v4-native branch to recognize `grid-json` / `grid-csv` / `grid-jsonl` editorIds. |
| `src/renderer/editors/base/v4/TextChrome.tsx` | modify | `ToolbarPortalSlots` + `FooterContributionSlot`: bail early when `model instanceof LegacyEditorAdapter === false` (v4-native editors compose contributions inline). |
| `src/renderer/scripting/api-wrapper/GridEditorFacade.ts` | rewrite | Wrap `GridEditor` directly. All methods sync (no queue queries). |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | modify | `asGrid()`: return `new GridEditorFacade(v4 as GridEditor)`; drop `acquireViewModel` round-trip. |

### Files NOT changed in US-552

- `src/renderer/editors/grid/utils/grid-utils.ts` — pure helpers, unchanged.
- `src/renderer/editors/grid/components/ColumnsOptions.tsx` — `showColumnsOptions(el, gridRef, isCsv, onUpdateRows)` signature unchanged; takes the AVGridModel ref + a callback, both of which `GridToolbarBits` provides from the v4 GridEditor's ref + `onUpdateRows` method.
- `src/renderer/editors/text/*` (legacy text editor surface) — still needed by remaining legacy content-views. Retire through US-554 / US-558 / US-559.
- `src/renderer/editors/base/ContentViewModel.ts` and the legacy ContentViewModelHost / useContentViewModel — still consumed by 10+ legacy content-views. Retire piecewise.
- `src/renderer/editors/registry.ts` (the legacy registry) — Grid's legacy entries can stay until US-559; they're unreachable from new code but harmless.
- `src/renderer/ui/app/RenderEditor.tsx` — v4-native branch already routes `GridEditor` through `getV4EditorModule(editor.editorId).Component`. No change.
- `src/renderer/api/pages/PageModel.ts` — `mainEditorV4` getter, `switchMainEditor`, `unwrapAdapter` work transparently with v4-native GridEditor (no MonacoEditor instance check needed; `contentHost` getter handles it).
- `src/renderer/api/pages/PagesQueryModel.ts` — `getTextFileHost` already augmented in US-551 (M11) to read `main.contentHost` for v4-native editors; Grid hosts surface naturally.

## Concerns

### G1 — New folder placement — **RESOLVED: in-place**

Walkthrough 21 envisioned new files inside `editors/grid/`, alongside the unchanged `utils/grid-utils.ts` + `components/ColumnsOptions.tsx` + `components/CsvOptions.tsx`. No rename needed; the folder already has the right name. New v4 files (`GridEditor.ts`, `GridBody.tsx`, `util.ts`) coexist; the legacy `GridViewModel.ts` and `GridEditor.tsx` delete in Step 9.

### G2 — Variant handling — **RESOLVED: one class with constructor-bound editorId + format (GR1)**

Confirmed by walkthrough 21 / GR1. Three v4 registry factories construct three instances of `GridEditor`, each with a different `editorId`. The `format` field derives from the id once at construction time. Variant-aware code reads `this.format`, never `this.editorId` (GR2 — decouples parsing logic from registry id naming).

### G3 — ScriptPanel + chrome integration — **RESOLVED: inherited via `<TextChrome>` (host-aware)**

`<TextChrome>` already renders the ScriptPanel from the host (`textHost?.script && <ScriptPanel model={textHost} />`). The host is still a `TextFileModel`; the script panel binds to host state, not editor state. Grid pages get the script panel exactly as today.

`isScriptLanguage(host.state.language)` triggers the Run buttons in `<TextChrome>` for grid pages whose host language is `.js` / `.ts` / etc. (Rare for Grid, but possible — e.g., a `.csv` file with `language === "csv"` won't trigger Run; a script-language host opened in Grid via switch widget would.) `RunButtons` reads `model.runScript` — GridEditor doesn't define `runScript`, so it falls through to `host.runScript()` (legacy path). Verified correct.

### G4 — `<id>-grid-page.json` cache file elimination — **RESOLVED: GR4 + dispose-time cleanup**

GR4: Grid state rides `EditorDescriptor.state` (`columns` / `focus` / `search` / `filters` / `sortColumn` / `csvDelimiter` / `csvWithColumns`). No `setState(id, "grid-page", …)` calls. M9's payload budget (~50KB per page worst case) covers it with room to spare — columns are small, filters are small, focus/search/sort are tiny.

Orphan cleanup: post-upgrade, old `<id>-grid-page.json` files on disk are wiped by `fs.deleteCacheFiles(id)` when the page is closed (existing behavior at `PageModel.ts:399-400`). No migration code needed.

### G5 — sortColumn round-trip — **RESOLVED: two-way sync via `setGridRef` (GR5)**

Confirmed by walkthrough 21 / GR5. View-side `setGridRef` callback (1) writes saved `sortColumn` from editor.state to `gridRef.state` on mount, (2) subscribes to `gridRef.state.sortColumn` slice and forwards changes back to editor.state. Editor side never reads gridRef.

### G6 — CSV delimiter detection — **RESOLVED: inside `GridEditor.restore()` (GR7) + open-file inline bootstrap**

Two paths run detection:
1. **Session restore** — `restore()` runs after `applyRestoreData` has stashed the persisted `csvDelimiter`. If saved value is missing or is the default `,`, detect from host content. Otherwise keep user-chosen value.
2. **Open file** — `wrapLegacyForPage` (Step 3) inlines the same detect logic before the initial reparse, because `restore()` does not run on the open-file path (the wrap helper is sync; legacy.restore() already ran).

The detect function lives as a `static` method on `GridEditor` so both paths share one implementation.

### G7 — Host `state.editor` mutation — **RESOLVED: keep in sync with editor's id**

`GridEditor.adoptHost(host)` sets `host.state.editor = this.editorId` (one of `"grid-json"` / `"grid-csv"` / `"grid-jsonl"`). This mirrors `MonacoEditor.adoptHost` which sets `host.state.editor = "monaco"`. Reasons:
- The legacy `ScriptPanel`, `actions.handleKeyDown`, IO submodel, and `requireGroupedText` query path all read `host.state.editor` to discriminate behavior (script-panel scripts, encoding chrome rendering, grouped-page material).
- The `TextChrome.ToolbarPortalSlots` and `FooterContributionSlot` use `host.state.editor` to decide what to render — but Step 5 layers a model-type guard on top (only render portal slots when `model instanceof LegacyEditorAdapter`), so the host's editor field can stay accurate without driving phantom portals.
- `deriveEditorId(host.state)` (in `LegacyEditorAdapter`) reads `state.editor` to determine the adapter's editorId. When a Grid host is extracted and re-wrapped in a `LegacyEditorAdapter` (switch-out to another legacy editor type), the adapter sees `state.editor` and picks the correct editorId. No special migration code needed.

### G8 — TextChrome portal-slot phantom rendering — **RESOLVED: model-type guard (Step 5)**

Without the guard, a v4-native GridEditor page would render two empty `<div>` portal slots inside `<PageToolbar>` (and an empty footer-portal div + separator). Nothing breaks visually because the slots are empty, but they bloat the DOM and the leading divider would render incorrectly.

Step 5's `model instanceof LegacyEditorAdapter` check kills the slots for v4-native editors. The legacy bridge path (other content-views still using `LegacyEditorAdapter`) keeps the portal slots until each migrates.

### G9 — GridEditorFacade rewrite — **RESOLVED: wrap GridEditor directly**

Today's facade calls `model.acquireViewModel("grid-json") as GridViewModel`. With Grid v4-native:
- The `acquireViewModel(targetId)` path is unreachable for Grid pages because `model` in `PageWrapper` is the v4 main editor; v4-native editors don't have `acquireViewModel`.
- The new facade holds the `GridEditor` directly. All methods sync — no queue execute path, no view-mount race.

Drops the `releaseList.push(() => model.releaseViewModel(targetId))` ref-counted dispose. The facade no longer needs lifetime management because the GridEditor lives as long as the page does (same as MonacoEditor in US-551).

### G10 — Persistence parallel branch — **RESOLVED: extend Monaco-native branch (Step 4)**

The Monaco-native branch (US-551) is `editorId === "monaco" && d.host !== undefined`. Step 4 extends to a set: `(monaco | grid-json | grid-csv | grid-jsonl) && d.host`. Same code path, four ids.

Pre-US-552 sessions with `editorId === "grid-*"` and no host field restore as legacy adapter (existing path). Next save writes the v4-native shape. Second launch restores natively — same dual-shape transition Monaco went through.

### G11 — Open-file flow extension — **RESOLVED: wrapLegacyForPage branch (Step 3)**

Adding the Grid branch in `wrapLegacyForPage` ensures every entry point that calls `wrap(legacy)` (the alias for `wrapLegacyForPage`) gets the v4-native GridEditor when the target editor resolves to `grid-*`. Verified entry points:

- `addEmptyPage()` — wraps with `wrap(emptyFile)`. Empty file has no `state.editor`, so `deriveEditorId` returns `"monaco"`. Empty pages stay Monaco. ✅
- `addEditorPage("grid-json", ...)` — sets `state.editor = "grid-json"`, restores, wraps. wrapLegacyForPage picks `GridEditor`. ✅
- `addEditorPage("grid-csv", ...)` — same path. ✅
- `openFile(path)` → `createEditorFromFile` → `newEditorModel(filePath)` → legacy registry resolves the file → returns a legacy TextFileModel with `state.editor` set by the legacy editor's `acceptFile`. For `.csv` / `.jsonl` / `.grid.json` files, `state.editor === "grid-csv"`/etc. wrapLegacyForPage picks GridEditor. ✅
- `requireWellKnownPage` — sets `state.editor = def.editor`. Wraps via `wrap()`. ✅
- `openLinks` — sets `state.editor = "link-view"`. Wraps via `wrap()` → adapter (Link migrates in US-555). ✅
- `requireGroupedText` — calls `addEmptyPage()` → Monaco-wrapped. The grouped page's editor stays Monaco unless the script-API caller switches it via `asGrid(true)`. ✅
- `duplicatePage` → `restorePage(desc)` — descriptor's editorId drives the restore branch. Step 4 handles. ✅
- `movePageIn` → `restorePage(desc)` — same. ✅
- `navigatePageTo` — sets `state.editor = previewEditor` based on file extension. wrapLegacyForPage picks v4 GridEditor for grid-* previewers. ✅

### G12 — `getTextFileHost` for v4-native Grid — **RESOLVED: M11 already covers it**

US-551 / M11 augmented `getTextFileHost(pageId)` to check `main.contentHost?.type === "textFile"` for v4-native editors. The GridEditor's contentHost is the legacy TextFileModel, exposed via the `get contentHost()` accessor. Existing M11 logic works unchanged. MCP `get_page_content` / `set_page_content`, compare-mode helpers, grouped-text helpers all return the right host.

### G13 — Compare mode — **RESOLVED: stays text-host-driven**

Compare mode reads the host's text content (the TextFileModel's `state.content`), not the editor's rendered shape. Switching one half of a compare pair from Monaco to Grid (or grouping two Grid pages together) keeps compare-mode functional because both halves still resolve to TextFileModel via `getTextFileHost`. CK1/CK7 from walkthrough 06 are already in production after US-548.

One note: today's compare flow rejects pairings whose hosts aren't TextFileModel. With Grid pages, the host IS TextFileModel — no change needed.

### G14 — Orphan `<id>-grid-page.json` cleanup — **RESOLVED: covered by existing `fs.deleteCacheFiles`**

`PageModel.setMainEditor`'s editor disposal path at `PageModel.ts:399-400` calls `fs.deleteCacheFiles(editor.id)` when the editor's id is not transferred to a successor. The existing cleanup is wildcard — deletes every cache file matching the id prefix. Orphan `<id>-grid-page.json` files wipe on next page close. No special handling.

### G15 — Run-script behavior on Grid pages — **RESOLVED: host.runScript path (no Monaco-style queue selection)**

Grid pages with a script-language host (e.g., user opened a `.js` file then switched to Grid via the switch widget — uncommon but legal) need F5 to run scripts. `<TextChrome>`'s F5 handler:
1. Checks `model.runScript` — GridEditor doesn't define it.
2. Falls through to `host.handleKeyDown(e)` — legacy path, calls `actions.handleKeyDown` → `host.runScript()` (no selection — selection lives in Monaco's view, which isn't mounted).
3. Result: full-content script run. Matches today's behavior on Grid pages (no selection-aware run because no Monaco editor is mounted).

If we want selection-aware run on Grid (script editor open at the bottom, selection inside it), `host.runRelatedScript()` handles it — ScriptPanel-open path stays sync. Verified no change needed.

### G16 — `addEditorPage("grid-*", ...)` callers — **RESOLVED: wrapLegacyForPage Grid branch covers them**

`addEditorPage` constructs a legacy TextFileModel with `state.editor = editorRegistry.validateForLanguage(editor, language)`. For `editor === "grid-json"`, `validateForLanguage` returns `"grid-json"` (the legacy registry's own validation). `wrapLegacyForPage` reads `deriveEditorId(legacy.state.get())` which returns `"grid-json"`. Step 3's Grid branch fires; GridEditor wraps. ✅

Same for `grid-csv` / `grid-jsonl`.

Script API consumers (`page.editor = "grid-json"`) route through `page.switchMainEditor("grid-json")` → `editorRegistry.createEditor("grid-json")` → v4 native module → `new GridEditor(state, "grid-json")` → `switchFrom(oldEditor)` extracts host → `restore()` runs CSV bootstrap. ✅

### G17 — Encrypted Grid pages — **RESOLVED: reuse the `state.error` channel with an encryption-aware message**

Today's `<ActiveEditor>` (legacy) forces `<TextEditor>` (Monaco) when `host.state.encrypted === true`, regardless of `state.editor`. After US-552 the v4 `GridEditor` mounts unconditionally — there is no per-encryption dispatcher. Rather than re-introduce a chrome-level special case, surface the locked state through the same `state.error` channel the grid already uses for parse failures.

**Implementation:**

1. `GridEditor.adoptHost(host)` adds a third host-state subscription — `_hostEncryptionUnsub` — watching `host.state.encrypted`. On change, call `reparseRows(currentContent)` so the encryption gate runs through the existing entry point.
2. Update `GridEditor.reparseRows(content)` to check encryption **before** attempting to parse:
   ```typescript
   private reparseRows(content: string): void {
       if (this._host?.state.get().encrypted) {
           this.state.update((s) => {
               s.rows = [];
               s.error = "Content is encrypted. Unlock the file to view as grid.";
           });
           return;
       }
       if (!content) { this.initEmptyPage(); return; }
       // … existing parse path …
   }
   ```
3. The same guard goes into `reparseRowsFromHost(content)` (the host-content-change handler) so the error state stays in sync whenever encryption toggles or content updates.
4. `GridBody` already routes `state.error` through `<EditorError>` — no view change needed. The lock/unlock prompt UI continues to render via the host's submodel chain inside `<TextChrome>`, exactly as today.
5. `dispose()` unsubscribes `_hostEncryptionUnsub` alongside the other host subscriptions.

Why this option: matches today's *behavior intent* (don't show garbage when locked) without the legacy `<ActiveEditor>` dispatcher. One mutation, one message, same code path as a parse failure. Reading from `state.error` keeps `getRestoreData` clean — the field is already stripped from persistence (GR8).

## Acceptance criteria

Functional (manual smoke-test list):

1. **Open `.csv`** — file opens in Grid (CSV), columns detected, delimiter auto-picked. Editing cells round-trips to disk on save. ✅
2. **Open `.json`** (array of objects) — file opens in Grid (JSON). Editing round-trips. ✅
3. **Open `.jsonl`** — file opens in Grid (JSONL). Editing round-trips. ✅
4. **Open `.grid.json`** — opens as Grid (JSON). Editing round-trips. ✅
5. **CSV options popover** — open `.csv`, click the `⚒-csv` button. Change delimiter to `;` → grid re-parses with `;` delimiter. Toggle "First row is header" → header row applied. Close popover; reopen; values persist. Save the file; reopen the app; values persisted across restart. ✅
6. **Columns popover** — open Grid page, click the columns button. Edit a column name → grid updates. Add column → new column appears. Delete column → column vanishes; rows updated. ✅
7. **Search + filter** — type in the search box → grid filters live. Click filter dropdown on a column header → filter options populate; pick one → only matching rows visible. Clear search via the × button. ✅
8. **Sort columns** — click a column header → sorts asc. Click again → sorts desc. Click again → unsorted. Restart the app — sort state restored. ✅
9. **Switch Grid → Monaco** — click Monaco in the switch widget. Monaco renders the underlying JSON / CSV / JSONL text. Edits to the text reflect back when switching to Grid. ✅
10. **Switch Monaco → Grid** — open a Monaco page on a `.csv` file, click Grid (CSV) in the switch widget. Grid renders the parsed rows. Delimiter detection runs. ✅
11. **Switch Grid (JSON) → Grid (CSV)** — switch widget shows all three Grid variants when content is ambiguous; selecting CSV re-parses content as CSV. Edits round-trip to CSV format. ✅
12. **Switch Grid → Markdown** (preview group) — works (legacy adapter target — switchFrom extracts host into adapter). ✅
13. **Switch Notebook → Grid** — works (cross-camp from legacy adapter to v4-native Grid). ✅
14. **App restart (Grid sessions)** — open several Grid pages with sort/filter/search/focus set. Quit, restart. All pages restore with their state. ✅
15. **App restart (pre-US-552 session)** — first launch after US-552 with an existing `openFiles.txt` containing Grid pages in pre-US-552 v4 shape (`editorId: "grid-csv"`, no `host` field). Pages restore via the legacy-adapter branch. On first save, persistence writes v4-native shape. Second launch restores natively. ✅
16. **App restart (pre-EPIC-028 v3 session)** — Grid pages restore via `restoreV3` → wrapLegacyForPage promotes to v4-native GridEditor on first launch. ✅
17. **Script API — page.asGrid()** — works on an active Grid page: read `rows`, `columns`, `rowCount`; call `addRows(2)`, `deleteRows(["..."])`, `editCell(col, row, val)`, `setSearch("x")`. All sync, all reflect in the UI. ✅
18. **Script API — page.asGrid(true) force switch** — call on a Monaco page with JSON content → switches to Grid (JSON) and returns the facade. ✅
19. **Script API — page.editor = "grid-csv"** — write on a Monaco page with CSV content → switches to Grid (CSV). Reading `page.editor` returns `"grid-csv"`. ✅
20. **MCP `get_page_content` / `set_page_content` on Grid pages** — works (M11 augmentation). ✅
21. **MCP `get_pages` on Grid pages** — returns `editorId: "grid-csv"` (or other) and the host's language/filePath. ✅
22. **Compare mode** — group two CSV pages, enter compare mode. Diff renders against the underlying CSV text. Exit compare. ✅
23. **Encryption** — open an encrypted file that resolves to Grid. Decrypt → grid renders. Lock the file → grid replaces its body with a clear "Content is encrypted. Unlock the file to view as grid." message (delivered through the existing `state.error` channel — same `<EditorError>` component used for parse errors). On unlock, message clears, rows populate. No fallback to legacy `<TextEditor>`. ✅
24. **Multi-window page move** — drag a Grid tab to a new window. New window opens with Grid page intact. ✅
25. **Page navigation** — click a link from a Markdown page that points to a CSV file → opens Grid in the same tab. Old page (Markdown adapter) disposed cleanly; new GridEditor mounts. ✅
26. **NavPanel button** — visible on Grid pages with a file path. Clicking opens the navigator panel. ✅
27. **Records count footer** — accurate (total rows + visible-rows-when-filtered). ✅
28. **Auto-focus on mount** — Grid steals focus when the page becomes active (unless `editorConfig.disableAutoFocus`). ✅
29. **Restored focus** — saved cell focus position re-applies on restart (via `focusCell` queue event). ✅

Code health:

30. `npm run lint` — zero new errors on touched files.
31. TypeScript baseline — match US-551 baseline (18 errors). Zero new errors.

## Status

**Ready to implement.** All 17 concerns resolved against walkthrough 21's design.

Final concern outcomes:

| # | Resolution |
|---|------------|
| G1 | in-place — new files alongside existing in `editors/grid/` |
| G2 | one `GridEditor` class, three registry factories, constructor-bound `editorId` + `format` (GR1) |
| G3 | ScriptPanel + chrome inherit through `<TextChrome>`'s existing host-aware rendering |
| G4 | per-editor `<id>-grid-page.json` cache file eliminated; state rides EditorDescriptor (GR4) |
| G5 | sortColumn two-way sync via `setGridRef` callback in `GridBody` (GR5) |
| G6 | CSV delimiter detection in `restore()` + open-file inline bootstrap (GR7); single static helper |
| G7 | `host.state.editor` stays in sync with `editor.editorId` so legacy submodels keep their assumptions |
| G8 | `TextChrome.ToolbarPortalSlots`/`FooterContributionSlot` bail for non-`LegacyEditorAdapter` models |
| G9 | `GridEditorFacade` wraps `GridEditor` directly; sync methods; no acquire/release path |
| G10 | persistence v4-native branch widens from `monaco` to `monaco | grid-json | grid-csv | grid-jsonl` |
| G11 | `wrapLegacyForPage` extended with Grid branch covering every open-file / addEditorPage / restore caller |
| G12 | `getTextFileHost` already covers v4-native via M11 augmentation from US-551 |
| G13 | compare mode unchanged — host stays TextFileModel |
| G14 | orphan `<id>-grid-page.json` cleanup covered by existing `fs.deleteCacheFiles(id)` dispose |
| G15 | F5 falls through to `host.runScript()` (no Monaco queue selection needed for Grid) |
| G16 | `addEditorPage("grid-*", …)` and other entry points covered by wrapLegacyForPage Grid branch |
| G17 | encrypted Grid: subscribe `_hostEncryptionUnsub`; `reparseRows` writes "Content is encrypted…" to `state.error`; `<EditorError>` displays it |

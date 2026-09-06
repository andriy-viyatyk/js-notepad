import type { GridEditor } from "../../editors/grid/GridEditor";
import type {
    IGridCellSelection,
    IGridFilter,
    IGridSort,
} from "../../api/types/grid-editor";
import type { IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";
import { ui } from "../../api/ui";
import { createElements } from "../ai-vision/elements";
import { activatePageAndWaitForLayout, pageScopeSelector } from "../ai-vision/page-elements";

const GRID_ELEMENTS = [
    { name: "grid-search", purpose: "Enter search text for the grid rows." },
    { name: "grid-search-clear", purpose: "Clear the active grid search." },
    { name: "grid-columns", purpose: "Open the Edit Columns surface." },
    { name: "grid-csv-options", purpose: "Open CSV Options for a CSV grid." },
    { name: "columns-options-apply", purpose: "Apply validated column edits." },
    { name: "columns-options-cancel", purpose: "Discard column edits and close the surface." },
    { name: "csv-options-header", purpose: "Toggle whether the first CSV row is a header." },
    { name: "csv-options-delimiter", purpose: "Choose the CSV delimiter." },
    { name: "csv-options-other", purpose: "Enter a custom CSV delimiter." },
] as const;

const GRID_EDITOR_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The concrete current editor id." },
    { name: "name", kind: "property", summary: "The editor's registry display name." },
    { name: "rows", kind: "property", summary: "All rows as plain objects." },
    { name: "columns", kind: "property", summary: "Column definitions (key and display name)." },
    { name: "rowCount", kind: "property", summary: "Number of rows." },
    { name: "searchText", kind: "property", summary: "Current search text, or undefined without an attached page." },
    { name: "sort", kind: "property", summary: "The current single-column sort, or undefined when unsorted or detached." },
    { name: "filters", kind: "property", summary: "Current normalized filters, or undefined without an attached page." },
    { name: "selection", kind: "property", summary: "The current cell-range selection, or undefined when absent or detached." },
    { name: "hiddenColumns", kind: "property", summary: "Keys of hidden columns, or undefined without an attached page." },
    { name: "visibleRowCount", kind: "property", summary: "Rows currently shown after search and filters, or undefined when detached." },
    { name: "csvDelimiter", kind: "property", summary: "The CSV delimiter, or undefined for non-CSV or detached grids." },
    { name: "csvWithColumns", kind: "property", summary: "Whether CSV uses its first row as headers, or undefined for non-CSV or detached grids." },
    { name: "editCell", kind: "method", signature: "editCell(columnKey: string, rowKey: string, value: unknown): void", summary: "Edit a single cell value.", caution: "changes grid data" },
    { name: "addRows", kind: "method", signature: "addRows(count = 1, insertIndex?: number): unknown[]", summary: "Add new empty rows. Returns the new rows.", caution: "changes grid data" },
    { name: "deleteRows", kind: "method", signature: "deleteRows(rowKeys: string[]): void", summary: "Delete rows by their keys.", caution: "deletes grid data" },
    { name: "addColumns", kind: "method", signature: "addColumns(count = 1, insertBeforeKey?: string): Array<{ readonly key: string; readonly name: string }>", summary: "Add new columns. Returns the new column definitions.", caution: "changes grid data" },
    { name: "deleteColumns", kind: "method", signature: "deleteColumns(columnKeys: string[]): void", summary: "Delete columns by their keys.", caution: "deletes grid data" },
    { name: "setSearch", kind: "method", signature: "setSearch(text: string): void", summary: "Set search filter text." },
    { name: "clearSearch", kind: "method", signature: "clearSearch(): void", summary: "Clear search filter." },
    { name: "setCsvDelimiter", kind: "method", signature: "setCsvDelimiter(delimiter: string): void", summary: "Set the CSV delimiter.", caution: "changes CSV output" },
    { name: "setCsvWithColumns", kind: "method", signature: "setCsvWithColumns(enabled: boolean): void", summary: "Set whether CSV uses its first row as headers.", caution: "changes CSV output" },
];

const GRID_EDITOR_HELP = `Access via pages[i].editor after narrowing editor.id to "grid-json", "grid-csv", or "grid-jsonl"; all three IDs share this GridEditor surface.
Use rows/columns and the read-only state properties for safe reads. The curated elements are grid-search (enter search text), grid-search-clear (clear search), grid-columns (open Edit Columns), grid-csv-options (open CSV Options), columns-options-apply (apply column edits), columns-options-cancel (discard column edits), csv-options-header (toggle the CSV header row), csv-options-delimiter (choose a delimiter), and csv-options-other (enter a custom delimiter).
The CSV controls are declared for every grid but report visible: false for JSON and JSONL; the search-clear control appears only with active search text, and popup controls are visible only while their owning popup is open. Popup elements are page-scoped even though the popups are portaled outside the page.
Selection reports a cell range, not row-checkbox selection. Detached grids report undefined for host-backed optional state; attached zero-row grids report their real search, filters, and visible row count, including "", [], and 0. Array and object getter results are copies. Sort exposes one column only; sort/filter writes, focus actions, clipboard actions, and column-schema edits are not part of this facade.
Use editCell/addRows/addColumns and the delete operations for grid-data changes. setCsvDelimiter and setCsvWithColumns change CSV output and are cautioned writes; CSV-only actions are unavailable for JSON and JSONL.`;

function copyValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(copyValue);
    if (value && typeof value === "object") {
        const copy: Record<string, unknown> = {};
        for (const [key, nestedValue] of Object.entries(value)) {
            copy[key] = copyValue(nestedValue);
        }
        return copy;
    }
    return value;
}

export class GridEditorFacade implements IAiVisible {
    constructor(private readonly editor: GridEditor, readonly id: string, readonly name: string) {}

    get aiVision(): IAiVisionDescriptor {
        const pageId = this.editor.page?.id;
        const elements = createElements(GRID_ELEMENTS, ui.highlightElement.bind(ui), {
            scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
            beforeHighlight: pageId ? () => activatePageAndWaitForLayout(pageId) : undefined,
        });
        return {
            kind: "GridEditor",
            summary: "Grid data manipulation facade.",
            members: [...GRID_EDITOR_MEMBERS, ...elements.members],
            help: GRID_EDITOR_HELP,
            elements: GRID_ELEMENTS,
            provide: elements.provide,
            summarize: () => ({
                kind: "GridEditor", id: this.id, name: this.name,
                rowCount: this.rowCount,
                columns: this.columns.map(({ key, name }) => ({ key, name })),
            }),
        };
    }

    /**
     * A **copy** of the rows.
     *
     * av-grid owns the live array (US-1020 / D1), so handing it out directly would give a script
     * something it could mutate without the grid repainting or the file being written — which
     * looks like it worked. Before the migration this returned an immer-frozen array, where the
     * same mutation silently did nothing. A copy is honest in both directions: use `editCell` to
     * change a value.
     */
    get rows(): unknown[] {
        return this.editor.getRows();
    }

    get columns(): Array<{ readonly key: string; readonly name: string }> {
        return this.editor.state.get().columns.map((c) => ({
            key: String(c.key),
            name: c.name ?? String(c.key),
        }));
    }

    get rowCount(): number {
        return this.editor.state.get().rowCount;
    }

    get searchText(): string | undefined {
        return this.editor.page ? this.editor.state.get().search : undefined;
    }

    get sort(): IGridSort | undefined {
        if (!this.editor.page) return undefined;
        const sort = this.editor.state.get().sortColumn;
        return sort ? { key: String(sort.key), direction: sort.direction } : undefined;
    }

    get filters(): IGridFilter[] | undefined {
        if (!this.editor.page) return undefined;
        return this.editor.state.get().filters.map((filter) => ({
            columnKey: String(filter.columnKey),
            value: copyValue(filter.value),
            columnName: filter.columnName,
            type: filter.type,
            displayFormat: filter.displayFormat,
        }));
    }

    get selection(): IGridCellSelection | undefined {
        if (!this.editor.page) return undefined;
        const selection = this.editor.state.get().focus?.selection;
        if (!selection) return undefined;
        return {
            rowKeyStart: selection.rowKeyStart,
            rowKeyEnd: selection.rowKeyEnd,
            columnKeyStart: String(selection.colKeyStart),
            columnKeyEnd: String(selection.colKeyEnd),
            rowStart: selection.rowStart,
            rowEnd: selection.rowEnd,
            columnStart: selection.colStart,
            columnEnd: selection.colEnd,
        };
    }

    get hiddenColumns(): string[] | undefined {
        if (!this.editor.page) return undefined;
        return this.editor.state.get().columns
            .filter((column) => column.hidden)
            .map((column) => String(column.key));
    }

    get visibleRowCount(): number | undefined {
        if (!this.editor.page) return undefined;
        const state = this.editor.state.get();
        return state.displayedRowCount ?? state.rowCount;
    }

    get csvDelimiter(): string | undefined {
        return this.editor.page && this.editor.format === "csv"
            ? this.editor.state.get().csvDelimiter
            : undefined;
    }

    get csvWithColumns(): boolean | undefined {
        return this.editor.page && this.editor.format === "csv"
            ? this.editor.state.get().csvWithColumns
            : undefined;
    }

    editCell(columnKey: string, rowKey: string, value: unknown): void {
        this.editor.editRow(columnKey, rowKey, value);
    }

    addRows(count = 1, insertIndex?: number): unknown[] {
        return this.editor.addRows(count, insertIndex);
    }

    deleteRows(rowKeys: string[]): void {
        this.editor.deleteRows(rowKeys);
    }

    addColumns(
        count = 1,
        insertBeforeKey?: string,
    ): Array<{ readonly key: string; readonly name: string }> {
        const cols = this.editor.addColumns(count, insertBeforeKey);
        return cols.map((c) => ({ key: String(c.key), name: c.name ?? String(c.key) }));
    }

    deleteColumns(columnKeys: string[]): void {
        this.editor.deleteColumns(columnKeys);
    }

    setSearch(text: string): void {
        this.editor.setSearch(text);
    }

    clearSearch(): void {
        this.editor.clearSearch();
    }

    setCsvDelimiter(delimiter: string): void {
        this.requireCsv();
        this.editor.setDelimiter(delimiter);
    }

    setCsvWithColumns(enabled: boolean): void {
        this.requireCsv();
        if (this.editor.state.get().csvWithColumns !== enabled) {
            this.editor.toggleWithColumns();
        }
    }

    private requireCsv(): void {
        if (this.id !== "grid-csv") {
            throw new Error("CSV option action unavailable for non-CSV grid editor.");
        }
    }
}

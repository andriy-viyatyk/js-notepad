import type { GridEditor } from "../../editors/grid/GridEditor";
import type { IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";

const GRID_EDITOR_MEMBERS: readonly IAiMember[] = [
    { name: "rows", kind: "property", summary: "All rows as plain objects." },
    { name: "columns", kind: "property", summary: "Column definitions (key and display name)." },
    { name: "rowCount", kind: "property", summary: "Number of rows." },
    { name: "editCell", kind: "method", signature: "editCell(columnKey: string, rowKey: string, value: unknown): void", summary: "Edit a single cell value." },
    { name: "addRows", kind: "method", signature: "addRows(count = 1, insertIndex?: number): unknown[]", summary: "Add new empty rows. Returns the new rows." },
    { name: "deleteRows", kind: "method", signature: "deleteRows(rowKeys: string[]): void", summary: "Delete rows by their keys.", caution: "deletes grid data" },
    { name: "addColumns", kind: "method", signature: "addColumns(count = 1, insertBeforeKey?: string): Array<{ readonly key: string; readonly name: string }>", summary: "Add new columns. Returns the new column definitions." },
    { name: "deleteColumns", kind: "method", signature: "deleteColumns(columnKeys: string[]): void", summary: "Delete columns by their keys.", caution: "deletes grid data" },
    { name: "setSearch", kind: "method", signature: "setSearch(text: string): void", summary: "Set search filter text." },
    { name: "clearSearch", kind: "method", signature: "clearSearch(): void", summary: "Clear search filter." },
];

const GRID_EDITOR_HELP = `Obtain via pages[i].asGrid() on a grid page (\`grid-json\`/\`grid-csv\`/\`grid-jsonl\`); pass true — \`asGrid(true)\` — to switch a compatible page to this editor first.
Grid data manipulation for JSON, CSV, and JSONL pages. Use rows/columns for reads and editCell/addRows/addColumns for changes; delete operations are destructive.`;

export class GridEditorFacade implements IAiVisible {
    constructor(private readonly editor: GridEditor) {}

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "GridEditor",
            summary: "Grid data manipulation facade.",
            members: GRID_EDITOR_MEMBERS,
            help: GRID_EDITOR_HELP,
            summarize: () => ({
                kind: "GridEditor",
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
}

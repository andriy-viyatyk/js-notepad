import type { GridEditor } from "../../editors/grid/GridEditor";

export class GridEditorFacade {
    constructor(private readonly editor: GridEditor) {}

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

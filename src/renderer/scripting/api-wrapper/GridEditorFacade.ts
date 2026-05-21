import type { GridEditor } from "../../editors/grid/GridEditor";

/**
 * EPIC-028 / US-552 — Safe facade around `GridEditor` for script access.
 * Implements the IGridEditor interface from api/types/grid-editor.d.ts.
 *
 * - `columns` is a minimal projection (key + name only).
 * - Mutation methods trigger content save automatically via `onDataChanged`.
 * - All methods sync (`GridQueueRequest = never` — no async view queries).
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

    addColumns(
        count = 1,
        insertBeforeKey?: string,
    ): Array<{ readonly key: string; readonly name: string }> {
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

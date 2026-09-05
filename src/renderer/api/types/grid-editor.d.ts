/**
 * IGridEditor — grid data manipulation interface.
 *
 * Obtained via `page.editor`. Only available for text pages
 * with JSON or CSV content.
 *
 * @example
 * const grid = page.editor;
 * grid.addRows(5);
 * grid.editCell("name", "0", "Alice");
 */
export interface IGridEditor {
    readonly id: "grid-json" | "grid-csv" | "grid-jsonl";
    readonly name: string;
    /** All rows as plain objects. */
    readonly rows: any[];

    /** Column definitions (key and display name). */
    readonly columns: IColumnInfo[];

    /** Number of rows. */
    readonly rowCount: number;

    /** Edit a single cell value. */
    editCell(columnKey: string, rowKey: string, value: any): void;

    /** Add new empty rows. Returns the new rows. */
    addRows(count?: number, insertIndex?: number): any[];

    /** Delete rows by their keys. */
    deleteRows(rowKeys: string[]): void;

    /** Add new columns. Returns the new column definitions. */
    addColumns(count?: number, insertBeforeKey?: string): IColumnInfo[];

    /** Delete columns by their keys. */
    deleteColumns(columnKeys: string[]): void;

    /** Set search filter text. */
    setSearch(text: string): void;

    /** Clear search filter. */
    clearSearch(): void;
}

/** Column information. */
export interface IColumnInfo {
    /** Column key (used in row objects). */
    readonly key: string;

    /** Column display name. */
    readonly name: string;
}

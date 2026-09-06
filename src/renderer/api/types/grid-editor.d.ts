/**
 * IGridEditor — grid data manipulation interface.
 *
 * Obtained via `page.editor`. Only available for text pages
 * with JSON, CSV, or JSONL content.
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
    readonly rows: unknown[];

    /** Column definitions (key and display name). */
    readonly columns: IColumnInfo[];

    /** Number of rows. */
    readonly rowCount: number;

    /** Current search text, or undefined when no page is attached. */
    readonly searchText: string | undefined;

    /** The current single-column sort, or undefined when unsorted or detached. */
    readonly sort: IGridSort | undefined;

    /** Current normalized filters, or undefined when no page is attached. */
    readonly filters: IGridFilter[] | undefined;

    /** The current cell-range selection, or undefined when absent or detached. */
    readonly selection: IGridCellSelection | undefined;

    /** Keys of hidden columns, or undefined when no page is attached. */
    readonly hiddenColumns: string[] | undefined;

    /** Rows currently shown after search and filters, or undefined when no page is attached. */
    readonly visibleRowCount: number | undefined;

    /** The CSV delimiter, or undefined for non-CSV or detached grids. */
    readonly csvDelimiter: string | undefined;

    /** Whether CSV uses its first row as headers, or undefined for non-CSV or detached grids. */
    readonly csvWithColumns: boolean | undefined;

    /** Edit a single cell value. */
    editCell(columnKey: string, rowKey: string, value: unknown): void;

    /** Add new empty rows. Returns the new rows. */
    addRows(count?: number, insertIndex?: number): unknown[];

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

    /** Set the CSV delimiter. Throws for JSON and JSONL editors. */
    setCsvDelimiter(delimiter: string): void;

    /** Set whether CSV uses its first row as headers. Throws for JSON and JSONL editors. */
    setCsvWithColumns(enabled: boolean): void;
}

export interface IGridSort {
    readonly key: string;
    readonly direction: "asc" | "desc";
}

export interface IGridFilter {
    readonly columnKey: string;
    readonly value?: unknown;
    readonly columnName?: string;
    readonly type?: string;
    readonly displayFormat?: string;
}

export interface IGridCellSelection {
    readonly rowKeyStart: string;
    readonly rowKeyEnd: string;
    readonly columnKeyStart: string;
    readonly columnKeyEnd: string;
    readonly rowStart: number;
    readonly rowEnd: number;
    readonly columnStart: number;
    readonly columnEnd: number;
}

/** Column information. */
export interface IColumnInfo {
    /** Column key (used in row objects). */
    readonly key: string;

    /** Column display name. */
    readonly name: string;
}

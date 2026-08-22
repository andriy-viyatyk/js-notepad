import { detectColumnWidth, type Column } from "../../../uikit/DataGrid";

export interface GridData {
    columns: Column[];
    rows: any[];
}

export interface GridColumn {
    key: string;
    title?: string;
    width?: number;
    dataType?: "string" | "number" | "boolean";
}

const newColumnTypes = () => ({
    stringCount: 0,
    numberCount: 0,
    booleanCount: 0,
})

function detectColumns(data: any[]): Column[] {
    const columnsMap = new Map<string, Column>();
    const columnTypes = new Map<string, ReturnType<typeof newColumnTypes>>();

    // Sample ~1000 rows: first 200, last 200, 600 spread across the middle
    const lastCheck = data.length - 200;
    const middleStep = Math.abs(Math.trunc((data.length - 400) / 600));
    const sampledRows: any[] = [];

    data.forEach((row, idx) => {
        if (idx < 200 || idx >= lastCheck || middleStep === 0 || idx % middleStep === 0) {
            sampledRows.push(row);
            // Discover columns and count types
            Object.keys(row).forEach((key) => {
                if (!columnsMap.has(key)) {
                    columnsMap.set(key, {
                        name: key,
                        key,
                        width: 100,
                        resizable: true,
                    });
                    columnTypes.set(key, newColumnTypes());
                }
                const value = row[key];
                if (value !== null && value !== undefined) {
                    const colTypes = columnTypes.get(key);
                    if (typeof value === 'string') {
                        colTypes.stringCount++;
                    } else if (typeof value === 'number') {
                        colTypes.numberCount++;
                    } else if (typeof value === 'boolean') {
                        colTypes.booleanCount++;
                    } else {
                        colTypes.stringCount++;
                    }
                }
            });
        }
    });

    const columns = [...columnsMap.values()];
    columns.forEach(col => {
        // Detect width from sampled rows
        col.width = detectColumnWidth(sampledRows, col.key as string, col.name);

        // Determine data type by majority vote
        const colTypes = columnTypes.get(col.key as string);
        if (colTypes.stringCount >= colTypes.numberCount) {
            col.dataType = colTypes.stringCount >= colTypes.booleanCount ? 'string' : 'boolean';
        } else {
            col.dataType = colTypes.numberCount >= colTypes.booleanCount ? 'number' : 'boolean';
        }
    })

    return columns;
}

/**
 * Row identity, held beside the rows rather than inside them.
 *
 * This replaced a `#intrnl-id` property spread into every row and stripped again on every save
 * (US-1020 / D3). That scheme mutated the user's own data, which cost a save path in every
 * serializer and carried a real bug: JSON that already contained the key got a visible column
 * whose values were overwritten with row indices and then deleted on save.
 *
 * **Why not av-grid's inference.** It probes only the first non-null row for an id-shaped
 * property and, finding one, uses `String(row[that])` for every row. Grid rows here are
 * arbitrary user JSON, which very often has an `id`: duplicates would collapse two rows into
 * one identity — so focus, editing, selection and delete address the wrong row — rows missing
 * it would all become `"undefined"`, and because the cell is editable a user typing into it
 * would change a row's identity mid-interaction.
 *
 * **Why the key is the row index.** A `focus.rowKey` of `"12"` persisted before a restart has
 * to resolve to row 12 afterwards, against row objects rebuilt from text by a fresh parse.
 * Seeding by index is what makes that work; av-grid's own WeakMap fallback does not survive a
 * `setRows` that rebuilds the objects.
 */
const rowKeys = new WeakMap<object, string>();

/** Keys minted for rows that reached `getRowKey` unregistered. Never collides with an index. */
let nextRowKey = 0;

/** Give each row its index as an identity. The parse-time counterpart of the old id column. */
export function registerRows(rows: readonly any[], startIndex = 0): void {
    rows.forEach((row, i) => {
        if (row && typeof row === "object") rowKeys.set(row, String(startIndex + i));
    });
}

/** Register one row under an explicit key — for a blank row minted by `newRow`. */
export function registerRow(row: any, key: string): void {
    if (row && typeof row === "object") rowKeys.set(row, key);
}

export function getRowKey(row: any): string {
    if (!row || typeof row !== "object") return "";
    let key = rowKeys.get(row);
    if (key === undefined) {
        // A row nothing registered still needs to be unique: sharing a key would make the grid
        // treat two rows as one. The old scheme returned `""` for all of them.
        key = `r${nextRowKey++}`;
        rowKeys.set(row, key);
    }
    return key;
}

function getGridData(
    jsonData: any,
): GridData {
    let columns: Column[] = [];
    let rows: any[] = [];

    if (jsonData) {
        if (Array.isArray(jsonData)) {
            columns = detectColumns(jsonData);
            rows = jsonData;
        } else if (jsonData instanceof Object) {
            columns = detectColumns([jsonData]);
            rows = [jsonData];
        }
    }

    // Identity is assigned rather than injected, so the ordering that used to matter here —
    // detect the columns *before* adding the id property, or it became a visible column — is
    // gone with it.
    registerRows(rows);

    return { columns, rows };
}

export function getGridDataWithColumns(
    jsonData: any,
    columns?: GridColumn[],
): GridData {
    const gridData = getGridData(jsonData);

    let data = gridData;
    if (columns && columns.length) {
        const newColumns = columns.map((column) => {
            const existing = data.columns.find((c) => c.key === column.key);
            const c: Column = {
                ...(existing ?? {}),
                key: column.key,
                name: column.title ?? column.key,
                width: column.width ?? existing?.width ?? 100,
                dataType: column.dataType ?? existing?.dataType,
                resizable: true,
            };
            return c;
        });
        data = {
            ...data,
            columns: newColumns,
        };
    }
    return data;
}

function* columnNamesGenerator(): Generator<string, string, unknown> {
    const letters = "abcdefghijklmnopqrstuvwxyz";
    let index = 0;
    while (true) {
        let name = "";
        let i = index;
        do {
            name = letters[i % 26] + name;
            i = Math.floor(i / 26) - 1;
        } while (i >= 0);
        yield name;
        index++;
    }
}

export function nextColumnKeys(currentColumns: Column[], count: number): string[] {
    const namesSet = new Set<string>(
        currentColumns.map((col) => String(col.key))
    );
    const names: string[] = [];
    const generator = columnNamesGenerator();

    while (names.length < count) {
        const name = generator.next().value;
        if (!namesSet.has(name)) {
            names.push(name);
        }
    }
    return names;
}

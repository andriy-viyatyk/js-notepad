import { detectColumnWidth, type Column } from "../../../uikit";

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
                        resizible: true,
                        filterType: "options",
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

export const idColumnKey = "#intrnl-id";

export function getRowKey(row: any) {
    return row?.[idColumnKey] ?? "";
}

export function createIdColumn(data: any[]) {
    return data.map((row, index) => ({
        ...row,
        [idColumnKey]: index.toString(),
    }))
}

export function removeIdColumn(rows?: readonly any[]): any[] | undefined {
    if (!rows) return undefined;
    return rows.map((row) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [idColumnKey]: _, ...rest } = row;
        return rest;
    });
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

    rows = createIdColumn(rows);

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
                resizible: true,
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

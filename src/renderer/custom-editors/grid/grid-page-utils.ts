import { Column } from "../../components/data-grid/AVGrid/avGridTypes";

export interface GridData {
    columns: Column[];
    rows: any[];
}

export interface GridColumn {
    key: string;
    title?: string;
    width?: number;
    dataType?: "string" | "number" | "boolean";
    hidden?: boolean;
}

const charWidth = 8; // Approximate width of a character in pixels
const maxColumnWidth = 300; // Maximum column width in pixels

const newColumnTypes = () => ({
    stringCount: 0,
    numberCount: 0,
    booleanCount: 0,
})

function detectColumns(data: any[]): Column[] {
    const columnsMap = new Map<string, Column>();
    const columnTypes = new Map<string, ReturnType<typeof newColumnTypes>>();

    const checkRowColumns = (row: any) => {
        Object.keys(row).forEach((key) => {
            let column = columnsMap.get(key);
            if (!column) {
                column = {
                    name: key,
                    key,
                    width: 100,
                    resizible: true,
                    filterType: "options",
                };
                columnsMap.set(key, column);
                columnTypes.set(key, newColumnTypes())
            }
            const colTypes = columnTypes.get(key)!;
            const value = row[key];
            if (value !== null && value !== undefined) {
                const valueStr = String(value);
                const width = Math.min(
                    Math.max(
                        Number(column.width),
                        valueStr.length * charWidth + 20
                    ), // 20px for padding
                    maxColumnWidth
                );
                column.width = width;
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

    // check ~1000 rows to detect columns:
    // first 200, last 200 and 600 in the middle:
    const lastCheck = data.length - 200;
    const middleStep = Math.abs(Math.trunc((data.length - 400) / 600));
    data.forEach((row, idx) => {
        if (idx < 200 || idx >= lastCheck || middleStep === 0 || idx % middleStep === 0) {
            checkRowColumns(row);
        }
    });

    const columns = [...columnsMap.values()];
    columns.forEach(col => {
        const colTypes = columnTypes.get(col.key as string)!;
        if (colTypes.stringCount >= colTypes.numberCount) {
            if (colTypes.stringCount >= colTypes.booleanCount) {
                col.dataType = 'string';
            } else {
                col.dataType = 'boolean';
            }
        } else if (colTypes.numberCount >= colTypes.booleanCount) {
            col.dataType = 'number';
        } else {
            col.dataType = 'boolean';
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
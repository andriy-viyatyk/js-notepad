import { getValue } from "../../common/obj-path";
import { Column } from "./avGridTypes";

const charWidth = 8;
const maxColumnWidth = 300;

const newColumnTypes = () => ({
    stringCount: 0,
    numberCount: 0,
    booleanCount: 0,
});

type ColumnTypes = ReturnType<typeof newColumnTypes>;

export function detectColumns(colName: string[], rows: any[]): Column<any>[] {
    const columnsMap = new Map<string, Column<any>>();
    const columnTypes = new Map<string, ColumnTypes>();

    colName.forEach((name) => {
        columnsMap.set(name, {
            name,
            key: name,
            width: 100,
        });
        columnTypes.set(name, newColumnTypes());
    });

    const checkRowColumns = (row: any) => {
        colName.forEach((name) => {
            const column = columnsMap.get(name);
            const colTypes = columnTypes.get(name);
            const value = getValue(row, name);
            if (value !== null && value !== undefined) {
                const valueStr = String(value);
                const width = Math.min(
                    Math.max(
                        Number(column.width),
                        valueStr.length * charWidth + 30
                    ), // 30px for padding
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
    const lastCheck = rows.length - 200;
    const middleStep = Math.abs(Math.trunc((rows.length - 400) / 600));
    rows.forEach((row, idx) => {
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
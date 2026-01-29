import ReactDOMServer from "react-dom/server";
import { getValue } from "../../common/obj-path";
import { Column } from "./avGridTypes";
import { recordsToCsv } from "../../common/csvUtils";

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

const tableColor = {
    border: "silver",
    text: "black",
    headerBackground: "lightgray",
	background: "white",
}

const styles = {
	cell: {
		border: 'none',
		borderBottom: `solid 1px ${tableColor.border}`,
		textAlign: "left",
		padding: "2px 4px",
	} as React.CSSProperties,
	dataRow: {
		color: tableColor.text,
	},
	headerRow: {
		backgroundColor: tableColor.headerBackground,
		color: tableColor.text,
	},
	table: {
		fontFamily: "Open Sans sans-serif",
		fontSize: 12,
		border: `solid 1px ${tableColor.border}`,
		borderCollapse: "collapse",
		backgroundColor: tableColor.background,
	} as React.CSSProperties,
};

const renderHeader = (columns: Column[]) => {
	return (
		<tr style={styles.headerRow}>
			{columns.map(c => (
				<th style={{ ...styles.cell, fontWeight: 600 }} key={c.key.toString()}>
					{c.name}
				</th>
			))}
		</tr>
	);
};

const renderRows = (rows: readonly any[], columns: Column[]) => {
	return rows.map((row, idx) => (
		<tr style={styles.dataRow} key={idx}>
			{columns.map(c => (
				<th style={{ ...styles.cell, fontWeight: 400 }} key={c.key.toString()}>
					{row[c.key]?.toString()}
				</th>
			))}
		</tr>
	));
};

export function recordsToTableHTML(rows: readonly any[], columns: Column[]) {
	return ReactDOMServer.renderToString(
		<table style={styles.table}>
			<thead>{renderHeader(columns)}</thead>
			<tbody>{renderRows(rows, columns)}</tbody>
		</table>,
	);
}

export async function recordsToClipboardFormatted(rows: readonly any[], columns: Column[]) {
	const formatted = recordsToTableHTML(rows, columns);
	const text = recordsToCsv(rows, columns.map(c => c.key.toString()), { delimiter: "\t" });

	if (Object.prototype.hasOwnProperty.call(Clipboard.prototype, "write")) {
		await navigator.clipboard.write([
			new ClipboardItem({
				"text/html": new Blob([formatted], { type: "text/html" }),
				"text/plain": new Blob([text], { type: "text/plain" }),
			}),
		]);
	} else {
		await navigator.clipboard.writeText(text);
	}
}
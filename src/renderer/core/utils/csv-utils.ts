import { stringify } from "csv-stringify/browser/esm/sync";
import { parse } from "csv-parse/browser/esm/sync";

export function recordsToCsv(records: readonly any[], columns: Array<string | undefined>, options = {}): string {
    return stringify([...records],
        {
            header: true,
            columns: columns.map(col => col === undefined ? "undefined" : col),
            cast: {
                boolean: (value: any) => ({value: value ? 'true': 'false', quote: false})
            },
            ...options,
        }
    );
}

export function csvToRecords(csv: string, withColumns = false, delimiter = '\t', onError?: (err: any) => void): Array<any> {
    try{
        if (!csv?.trim()) {
            return [];
        }
        return parse(csv, {
            columns: withColumns,
            skip_empty_lines: true,
            relax_column_count: true,
            relax_quotes: true,
            delimiter,
          })
    } catch (e){
        console.error(e);
        onError?.(e);
        return [];
    }
}

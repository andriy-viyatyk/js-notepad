import { stringify } from "csv-stringify/browser/esm/sync";
import { parse } from "csv-parse/browser/esm/sync";

export function recordsToCsv(records: readonly unknown[], columns: Array<string | undefined>, options = {}): string {
    return stringify([...records],
        {
            header: true,
            columns: columns.map(col => col === undefined ? "undefined" : col),
            cast: {
                boolean: (value: boolean) => ({value: value ? 'true': 'false', quote: false})
            },
            ...options,
        }
    );
}

// csv-parse returns string[][] when `columns: false` (default) and
// Record<string, string>[] when `columns: true`. Overloads keep callers typed
// without an `any` return.
export function csvToRecords(csv: string, withColumns: true, delimiter?: string, onError?: (err: unknown) => void): Record<string, string>[];
export function csvToRecords(csv: string, withColumns?: false, delimiter?: string, onError?: (err: unknown) => void): string[][];
export function csvToRecords(csv: string, withColumns?: boolean, delimiter?: string, onError?: (err: unknown) => void): string[][] | Record<string, string>[];
export function csvToRecords(csv: string, withColumns = false, delimiter = '\t', onError?: (err: unknown) => void): string[][] | Record<string, string>[] {
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

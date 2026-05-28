export type GridFormat = "json" | "csv" | "jsonl";
export type GridEditorId = "grid-json" | "grid-csv" | "grid-jsonl";

export function formatFromEditorId(id: GridEditorId): GridFormat {
    switch (id) {
        case "grid-csv":
            return "csv";
        case "grid-jsonl":
            return "jsonl";
        case "grid-json":
        default:
            return "json";
    }
}

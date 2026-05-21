/**
 * EPIC-028 / US-552 — Grid format discriminator helpers.
 *
 * The three Grid registry ids (`grid-json` / `grid-csv` / `grid-jsonl`) share
 * one `GridEditor` class; `format` is the semantic word used by parsing /
 * serialization sites. Decoupling the registry id from the format word lets
 * the registry id naming change without touching parser code.
 */

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

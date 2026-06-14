// Shared types + helpers for the Mneme config/monitoring editor.
//
// These mirror the JSON contracts returned by Mneme's control-plane MCP tools
// (`mneme/src/mcp/results.rs`). Field names match the serialized JSON exactly
// (camelCase where Rust applies `#[serde(rename)]`, otherwise as-is).

/** Per-root entry of `wiki_status`. Note: `model` here is the model *name*
 *  (a plain string), not the model object — that lives at the top level. */
export interface WikiRootStatus {
    name: string;
    folder: string;
    docCount: number;
    model: string;
    precision: string;
    schemaVer: number;
    indexPath: string;
    indexBytes: number;
    reindex?: WikiReindexProgress;
}

export interface WikiReindexProgress {
    phase: "idle" | "scanning" | "embedding" | "done" | "cancelled" | "error" | string;
    processed: number;
    total: number;
}

export interface WikiModelFile {
    filename: string;
    present: boolean;
    verified: boolean;
    bytes: number;
}

export interface WikiModelStatus {
    name: string;
    precision: string;
    version: number;
    dir: string;
    complete: boolean;
    files: WikiModelFile[];
}

/** Result of `wiki_status` — the primary monitoring source. */
export interface WikiStatus {
    roots: WikiRootStatus[];
    model?: WikiModelStatus;
}

/** Result of `wiki_root_config` (US-668). */
export interface WikiRootConfig {
    name: string;
    folder: string;
    include: string[];
    ignore: string[];
}

/** Per-root stats from `wiki_reindex`. */
export interface WikiReindexRootStat {
    name: string;
    scanned: number;
    indexed: number;
    refreshed: number;
    skipped: number;
    vectorized: number;
    deleted: number;
    errors: number;
}

export interface WikiReindexResult {
    roots: WikiReindexRootStat[];
}

/** A discovered on-disk index DB under `{folder}/.mneme/`. */
export interface StaleIndexEntry {
    /** `{model}-{precision}` — the `modelId` arg for `wiki_index_delete`. */
    modelId: string;
    /** schema version `N` from `index-v{N}.db`. */
    schemaVer: number;
    bytes: number;
    path: string;
    /** True when this is the root's currently-active index DB. */
    active: boolean;
}

/** `modelReady` is the green/yellow signal: a working embedding model exists
 *  iff `wiki_status.model` is present and fully provisioned (`complete`). */
export function isModelReady(status: WikiStatus | null): boolean {
    return !!status?.model && status.model.complete === true;
}

/** Extract a typed payload from an MCP tool result. Mneme tools that return
 *  structured data populate `structuredContent`; fall back to parsing the text
 *  block for tools that only emit text. Returns null when neither yields JSON.
 *  Typed as `unknown` because the SDK's `callTool` return is a union of the
 *  structured-content result and the legacy `{ toolResult }` shape. */
export function parseToolResult<T>(result: unknown): T | null {
    const r = result as { structuredContent?: unknown; content?: Array<{ type?: string; text?: string }> };
    const structured = r.structuredContent;
    if (structured && typeof structured === "object") {
        return structured as T;
    }
    const text = r.content?.find((c) => c.type === "text")?.text;
    if (!text) return null;
    try {
        return JSON.parse(text) as T;
    } catch {
        return null;
    }
}

/** Human-readable byte size (e.g. "4.2 MB"). */
export function formatBytes(bytes: number): string {
    if (!bytes || bytes < 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    const fixed = unit === 0 ? "0" : value.toFixed(1);
    return `${fixed} ${units[unit]}`;
}

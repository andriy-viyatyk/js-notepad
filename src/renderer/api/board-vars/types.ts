// =============================================================================
// Board environment-variables schema + load-result types (EPIC-046 / US-887).
//
// The `.env.json` file maps a per-board NAMESPACE ("author/name" or a board root
// path) to PROFILES ("default", "dev", "qa", …), each a flat key→value map of
// string values (connection strings, API keys, passwords). The file may be plain
// JSON or password-encrypted with the app's existing mechanism (ENC-v001: prefix).
// =============================================================================

/** One profile's flat key→value map. Values are strings (connection strings, keys, passwords). */
export type BoardVarsProfile = Record<string, string>;

/** A namespace's profiles. The `default` profile is used when `env` is omitted. */
export type BoardVarsNamespace = Record<string, BoardVarsProfile>;

/** The whole `.env.json`: namespace ("author/name" or a board root path) → profiles. */
export type BoardVarsFile = Record<string, BoardVarsNamespace>;

/** Profile used when a caller omits `env`. */
export const DEFAULT_PROFILE = "default";

/** Outcome of loading the store. */
export type BoardVarsLoadStatus = "ok" | "not-configured" | "locked" | "error";

export interface BoardVarsLoadResult {
    status: BoardVarsLoadStatus;
    /** Present when `status === "error"` (read / JSON.parse failure) — for logging, not the user. */
    message?: string;
}

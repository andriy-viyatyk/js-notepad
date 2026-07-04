/**
 * Per-toolset run log (EPIC-038 / US-802). Each tool run is appended to
 * `<toolsetRoot>/tools-execution.log` — the detailed I/O (args, stdout logs, stderr) goes to
 * this file rather than memory, so it stays out of the UI's reactive state and can be opened in
 * Persephone for debugging.
 *
 * The log **self-resets after 1 day**. `fs.stat` exposes no file creation time (`birthtime`),
 * and `mtime` refreshes on every append — so age-since-creation is tracked via a
 * `##LOG_CREATED##<epoch-ms>` header line written into the log itself (portable; survives a
 * toolset being copied between machines). The header is read from disk at most once per toolset
 * per session (cached), so a growing log is not re-read on every run.
 *
 * Logging is best-effort: a filesystem error is swallowed and never fails a tool run.
 */
import { fs } from "../fs";
import { fpJoin, fpNormalizeForCompare } from "../../core/utils/file-path";

/** File name of the per-toolset execution log, at the toolset folder root. */
export const TOOLS_EXECUTION_LOG_FILE = "tools-execution.log";
const LOG_FILE = TOOLS_EXECUTION_LOG_FILE;
const HEADER_PREFIX = "##LOG_CREATED##";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 1 day
const MAX_FIELD = 8_192; // cap args / logs / stderr per entry

export interface ToolLogEntry {
    toolId: string;
    startedAt: number;
    durationMs: number;
    ok: boolean;
    exitCode: number | null;
    timedOut: boolean;
    args: unknown;
    logs: string;
    stderr: string;
    error?: string;
}

/** Cache of each log's creation epoch (normalized root → ms), so the header is read from disk at
 *  most once per toolset per session. */
const createdAtCache = new Map<string, number>();

function logPath(toolsetRoot: string): string {
    return fpJoin(toolsetRoot, LOG_FILE);
}

function cap(s: string): string {
    return s.length > MAX_FIELD
        ? `${s.slice(0, MAX_FIELD)}\n…[truncated ${s.length - MAX_FIELD} chars]`
        : s;
}

/** Parse the `##LOG_CREATED##<ms>` header from the first line; null if absent/unparseable. */
function parseHeader(content: string): number | null {
    const firstLine = content.split("\n", 1)[0] ?? "";
    if (!firstLine.startsWith(HEADER_PREFIX)) return null;
    const ms = Number(firstLine.slice(HEADER_PREFIX.length).trim());
    return Number.isFinite(ms) ? ms : null;
}

/** Ensure the log exists and is fresh (<1 day). Rotates (delete + fresh header) when stale,
 *  missing, or header-less. Updates the creation-epoch cache. */
async function ensureFreshLog(toolsetRoot: string, now: number): Promise<void> {
    const key = fpNormalizeForCompare(toolsetRoot);
    const p = logPath(toolsetRoot);

    let createdAt = createdAtCache.get(key) ?? null;

    if (createdAt === null && (await fs.exists(p))) {
        // Cache miss — read the header once (a whole-file read is acceptable at this cadence).
        try {
            createdAt = parseHeader(await fs.read(p));
        } catch {
            createdAt = null;
        }
    }

    const stale = createdAt === null || now - createdAt > MAX_AGE_MS;
    if (stale) {
        try {
            if (await fs.exists(p)) await fs.delete(p);
        } catch {
            // ignore — the write below recreates it
        }
        await fs.write(p, `${HEADER_PREFIX}${now}\n`);
        createdAtCache.set(key, now);
    } else {
        createdAtCache.set(key, createdAt);
    }
}

function formatEntry(entry: ToolLogEntry): string {
    const ts = new Date(entry.startedAt).toISOString();
    const status = entry.ok
        ? "OK"
        : entry.timedOut
            ? "TIMEOUT"
            : `FAIL (exit ${entry.exitCode ?? "null"})`;

    let argsText: string;
    try {
        argsText = JSON.stringify(entry.args ?? {});
    } catch {
        argsText = String(entry.args);
    }

    const lines = [
        "",
        `======== ${ts}  ${entry.toolId}  ${status}  ${entry.durationMs}ms ========`,
        `args: ${cap(argsText)}`,
    ];
    if (entry.error) lines.push(`error: ${entry.error}`);
    if (entry.logs.trim()) lines.push("--- stdout ---", cap(entry.logs));
    if (entry.stderr.trim()) lines.push("--- stderr ---", cap(entry.stderr));
    lines.push("");
    return lines.join("\n");
}

/** Append one run to `<toolsetRoot>/tools-execution.log`, rotating when the log's creation header
 *  is older than 1 day. Never throws. */
export async function appendToolLog(toolsetRoot: string, entry: ToolLogEntry): Promise<void> {
    try {
        const now = Date.now();
        await ensureFreshLog(toolsetRoot, now);
        await fs.append(logPath(toolsetRoot), formatEntry(entry));
    } catch {
        // best-effort — logging must not fail a tool run
    }
}

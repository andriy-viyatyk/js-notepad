/**
 * Tool execution engine (EPIC-038 / US-802). Runs a registered tool: resolve `toolId` in
 * `registeredTools`, load the toolset's `.env`, spawn its `command` via `app.proc.execute` with
 * cwd = the toolset folder, feed the JSON `args` on stdin, enforce a timeout with tree-kill, and
 * reduce the child's output to a structured {@link ToolRunResult} via the marker/fallback
 * contract (EPIC C2). After every run it records call stats (`tool-stats.ts`) and appends the
 * run to the per-toolset log (`tool-log.ts`).
 *
 * The handle is consumed in STREAMING mode (not `getJson`): `getJson(pattern)` throws on a
 * missing marker (we need a plain-text fallback), bundles stderr only inside a thrown error, and
 * gives no exit code on success. Streaming yields stdout + stderr + exit + spawn-error together,
 * which the self-repair reply (exit code + stderr + toolset path) needs.
 *
 * Not exposed on `app`/scripts — this is the trust-gated surface reached only via the MCP
 * meta-tools (US-803) and the management UI (US-805). (Scripts already have raw `app.proc`.)
 */
import { proc } from "../proc";
import { registeredTools, RegisteredTool } from "./registered-tools";
import { loadDotEnv } from "./dotenv";
import { toolStats } from "./tool-stats";
import { appendToolLog, ToolLogEntry } from "./tool-log";
import { concatChunks, errMessage } from "../../../shared/utils";

/** The stdout result marker (EPIC C2). A tool prints `##PERSEPHONE_RESULT##<json>` on its own
 *  line; the LAST occurrence wins, so third-party library noise on stdout is harmless. */
export const TOOL_RESULT_MARKER = "##PERSEPHONE_RESULT##";

/** Default per-tool timeout when the manifest omits `timeoutMs` (EPIC C6). */
export const DEFAULT_TOOL_TIMEOUT_MS = 120_000;

export interface ToolRunResult {
    toolId: string;
    toolsetRoot: string;
    /** true iff the process exited 0 AND a result was obtained (marker-JSON or plain-text). */
    ok: boolean;
    /** Parsed JSON from the last marker line (present only when a valid marker was found). */
    result?: unknown;
    /** Plain-text result = whole trimmed stdout (present only when NO marker was found). */
    resultText?: string;
    /** stdout with the marker line(s) removed — returned to the agent as log context. */
    logs: string;
    /** Captured stderr (diagnostics; not necessarily a failure). */
    stderr: string;
    exitCode: number | null;
    signal: string | null;
    /** true when the run was killed by the timeout. */
    timedOut: boolean;
    durationMs: number;
    /** Non-blocking best-effort arg-validation notes (EPIC C12); the tool ran regardless. */
    argWarnings?: string[];
    /** Human-readable failure summary when !ok. */
    error?: string;
}

/**
 * Best-effort structural check of `args` against a tool's `inputSchema` (EPIC C12 — no ajv).
 * NON-BLOCKING: returns human-readable warnings only; the caller runs the tool regardless (the
 * tool script validates its own inputs anyway). A missing/loose schema yields no warnings.
 */
export function validateArgs(inputSchema: object | undefined, args: unknown): string[] {
    const warnings: string[] = [];
    if (!inputSchema || typeof inputSchema !== "object") return warnings;
    const schema = inputSchema as Record<string, unknown>;

    const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
    const props = schema.properties as Record<string, { type?: string }> | undefined;

    const argsObj =
        args && typeof args === "object" && !Array.isArray(args)
            ? (args as Record<string, unknown>)
            : undefined;

    if (required.length && !argsObj) {
        warnings.push(
            `Expected an object of arguments with required keys: ${required.join(", ")}.`,
        );
        return warnings;
    }

    for (const key of required) {
        if (argsObj && !(key in argsObj)) {
            warnings.push(`Missing required argument "${key}".`);
        }
    }

    if (props && argsObj) {
        for (const [key, spec] of Object.entries(props)) {
            if (!(key in argsObj) || !spec || typeof spec !== "object") continue;
            const expected = spec.type;
            if (typeof expected !== "string") continue;
            const val = argsObj[key];
            if (val === undefined || val === null) continue;
            const actual = Array.isArray(val) ? "array" : typeof val;
            const ok =
                ((expected === "integer" || expected === "number") && actual === "number") ||
                (expected === "string" && actual === "string") ||
                (expected === "boolean" && actual === "boolean") ||
                (expected === "object" && actual === "object") ||
                (expected === "array" && actual === "array");
            if (!ok) {
                warnings.push(`Argument "${key}" should be ${expected} but got ${actual}.`);
            }
        }
    }

    return warnings;
}

interface ParsedOutput {
    result?: unknown;
    resultText?: string;
    logs: string;
    parseError?: string;
}

/** Extract the result from stdout per the C2 contract: last `##PERSEPHONE_RESULT##<json>` line
 *  wins; the marker line(s) are stripped from `logs`; no marker → whole trimmed stdout is a
 *  plain-text result. */
function parseToolOutput(stdout: string): ParsedOutput {
    const lines = stdout.split("\n");
    const markerLines = lines.filter((l) => l.includes(TOOL_RESULT_MARKER));

    if (markerLines.length === 0) {
        return { resultText: stdout.trim(), logs: "" };
    }

    const logs = lines
        .filter((l) => !l.includes(TOOL_RESULT_MARKER))
        .join("\n")
        .trim();

    const lastMarker = markerLines[markerLines.length - 1];
    const idx = lastMarker.lastIndexOf(TOOL_RESULT_MARKER);
    const payload = lastMarker.slice(idx + TOOL_RESULT_MARKER.length).trim();

    try {
        return { result: JSON.parse(payload), logs };
    } catch (e) {
        // Marker present but payload not valid JSON — keep the full stdout for debugging.
        return { logs: stdout, parseError: errMessage(e) };
    }
}

/** Run an already-resolved tool. Used by {@link executeToolById} and the US-805 test-run. */
export async function executeTool(tool: RegisteredTool, args?: unknown): Promise<ToolRunResult> {
    const startedAt = Date.now();
    const argWarnings = validateArgs(tool.tool.inputSchema, args);
    const env = await loadDotEnv(tool.toolsetRoot);
    const timeoutMs = tool.tool.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;

    const result = await new Promise<ToolRunResult>((resolve) => {
        const stdoutChunks: Uint8Array[] = [];
        const stderrChunks: Uint8Array[] = [];
        let timedOut = false;
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const handle = proc.execute(tool.tool.command, {
            cwd: tool.toolsetRoot,
            env,
            shell: tool.tool.shell,
            name: tool.id,
        });

        const decode = (chunks: Uint8Array[]): string =>
            new TextDecoder().decode(concatChunks(chunks));

        const finalize = (
            exitCode: number | null,
            signal: string | null,
            spawnError?: string,
        ): void => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);

            const stdout = decode(stdoutChunks);
            const stderr = decode(stderrChunks);
            const base: ToolRunResult = {
                toolId: tool.id,
                toolsetRoot: tool.toolsetRoot,
                ok: false,
                logs: "",
                stderr,
                exitCode,
                signal,
                timedOut,
                durationMs: Date.now() - startedAt,
                argWarnings: argWarnings.length ? argWarnings : undefined,
            };

            if (spawnError) {
                resolve({ ...base, logs: stdout, error: `Failed to start tool: ${spawnError}` });
                return;
            }
            if (timedOut) {
                resolve({
                    ...base,
                    logs: stdout,
                    error: `Tool timed out after ${timeoutMs} ms and was terminated.`,
                });
                return;
            }

            const parsed = parseToolOutput(stdout);

            if (exitCode !== null && exitCode !== 0) {
                const tail = stderr.trim() ? ` stderr: ${stderr.trim().slice(-500)}` : "";
                resolve({
                    ...base,
                    logs: parsed.logs,
                    error: `Tool exited with code ${exitCode}.${tail}`,
                });
                return;
            }

            if (parsed.parseError) {
                resolve({
                    ...base,
                    logs: parsed.logs,
                    error: `Result marker present but its payload was not valid JSON: ${parsed.parseError}`,
                });
                return;
            }

            resolve({
                ...base,
                ok: true,
                result: parsed.result,
                resultText: parsed.resultText,
                logs: parsed.logs,
            });
        };

        // The proc execution handle owns these stream callbacks for this run; a view/model
        // disposer must not release a still-running tool operation.
        handle.on("stdout", (c) => stdoutChunks.push(c));
        handle.on("stderr", (c) => stderrChunks.push(c));
        handle.on("exit", (info) => finalize(info.code, info.signal));
        handle.on("error", (err) => finalize(null, null, err.message));

        timer = setTimeout(() => {
            timedOut = true;
            handle.kill();
        }, timeoutMs);

        // Feed args as JSON on stdin (immune to Windows argv quoting; read in any language).
        try {
            handle.write(JSON.stringify(args ?? {}));
            handle.endStdin();
        } catch {
            // stdin may already be closed if the process failed instantly — the error/exit
            // path settles the result.
        }
    });

    // Side effects — best-effort, must not change the returned result.
    toolStats.record(tool.id, result.ok, result.durationMs);
    const logEntry: ToolLogEntry = {
        toolId: result.toolId,
        startedAt,
        durationMs: result.durationMs,
        ok: result.ok,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        args: args ?? {},
        logs: result.logs,
        stderr: result.stderr,
        error: result.error,
    };
    await appendToolLog(tool.toolsetRoot, logEntry);

    return result;
}

/** Resolve `toolId` in `registeredTools`, then run. `ensureInitialized()` first so a cold call
 *  still resolves. Tool not found (unregistered / shadowed) → `ok:false`, no process spawned. */
export async function executeToolById(toolId: string, args?: unknown): Promise<ToolRunResult> {
    await registeredTools.ensureInitialized();
    const tool = registeredTools.tools.find((t) => t.id === toolId);
    if (!tool) {
        return {
            toolId,
            toolsetRoot: "",
            ok: false,
            logs: "",
            stderr: "",
            exitCode: null,
            signal: null,
            timedOut: false,
            durationMs: 0,
            error:
                `Tool "${toolId}" is not registered. Register its toolset first ` +
                `(tools.createToolset, or the Agent Tools management UI).`,
        };
    }
    return executeTool(tool, args);
}

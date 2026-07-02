/**
 * IPC channels + wire types for the streaming command runner (`app.proc.execute`).
 *
 * Pattern B (ad-hoc string channels, like the async-worker system in
 * `worker-channels.ts`) — NOT the typed `Endpoint` request/response layer.
 * Renderer/preload → main starts a spawn and sends stdin / kill keyed by
 * `jobId`; main → caller streams stdout / stderr / exit / error back, also
 * keyed by `jobId`.
 *
 * This module is intentionally dependency-free (no imports from `src/main`
 * or `src/renderer`) so a sandboxed board preload (US-724) can import it and
 * talk to the main service over raw `ipcRenderer`.
 */
export enum RunnerChannel {
    // caller → main
    start = "runner:start", // { jobId, command, opts } — spawn
    stdin = "runner:stdin", // { jobId, data } — write to child stdin
    endStdin = "runner:end-stdin", // { jobId } — close child stdin
    kill = "runner:kill", // { jobId, signal? } — terminate the child
    // main → caller
    stdout = "runner:stdout", // { jobId, chunk } — binary stdout chunk
    stderr = "runner:stderr", // { jobId, chunk } — binary stderr chunk
    exit = "runner:exit", // { jobId, code, signal } — child closed
    error = "runner:error", // { jobId, message } — spawn-level failure (ENOENT, …)
}

/** Spawn options carried on a {@link RunnerStartMsg}. */
export interface RunnerSpawnOptions {
    /** Working directory for the spawned process. */
    cwd?: string;
    /** Extra environment variables, merged OVER the inherited `process.env`. */
    env?: Record<string, string>;
    /**
     * Shell to run the command line through. Default `true` (the OS default
     * shell — `cmd.exe` on Windows). A string picks a specific shell (e.g.
     * `"bash"`, `"pwsh"`); `false` runs the executable directly (no shell).
     */
    shell?: boolean | string;
    /** Optional caller-chosen job name, stored on the live job. Lets a board
     *  re-associate its surviving jobs by name after a reload (`getJobs()`,
     *  US-799) instead of persisting jobIds. */
    name?: string;
}

export interface RunnerStartMsg {
    jobId: string;
    command: string;
    opts?: RunnerSpawnOptions;
}
export interface RunnerStdinMsg {
    jobId: string;
    data: string | Uint8Array;
}
export interface RunnerJobMsg {
    jobId: string;
}
export interface RunnerKillMsg {
    jobId: string;
    signal?: string;
}
export interface RunnerChunkMsg {
    jobId: string;
    /** Binary stdout/stderr chunk — crosses IPC via structured clone. */
    chunk: Uint8Array;
}
export interface RunnerExitMsg {
    jobId: string;
    /** Exit code, or `null` when the child was terminated by a signal. */
    code: number | null;
    /** Terminating signal name, or `null` on a normal exit. */
    signal: string | null;
}
export interface RunnerErrorMsg {
    jobId: string;
    message: string;
}

// ===========================================================================
// Handle contract — the public `execute()` API shape, shared by BOTH client
// implementations so they cannot drift (EPIC-034 US-724 / C-E):
//   • the renderer client `src/renderer/api/proc.ts` (over `window.electron`)
//   • the board bridge shim `src/board-shim.ts` (over its per-board MessagePort)
// The script-facing Monaco surface `src/renderer/api/types/proc.d.ts` MIRRORS
// these interfaces (it must stay self-contained for the editor-types flat-copy
// in `vite.renderer.config.ts`). Keep the two in sync.
// ===========================================================================

/** Options for `execute()`. */
export interface IExecuteOptions {
    /** Working directory for the spawned process. */
    cwd?: string;
    /** Extra environment variables, merged OVER the inherited environment. */
    env?: Record<string, string>;
    /**
     * Shell to run the command line through. Default `true` (the OS default
     * shell). A string picks a specific shell (`"bash"`, `"pwsh"`); `false`
     * runs the executable directly without a shell.
     */
    shell?: boolean | string;
    /**
     * Optional job name (e.g. `"backend"`). For boards: a busy board's surviving
     * jobs are listed by `persephone.getJobs()` after a reload, and `name` is the
     * intended re-association key — no jobId persistence needed (US-799).
     */
    name?: string;
}

/** Information about how a process ended. */
export interface IExitInfo {
    /** Exit code, or `null` when terminated by a signal. */
    code: number | null;
    /** Terminating signal name, or `null` on a normal exit. */
    signal: string | null;
}

/** Spawn-level failure (the executable could not be started / run). */
export interface IExecuteError {
    message: string;
}

/**
 * A handle to a running process. Consume it **either** one-shot (`getText` /
 * `getJson` / `getBytes`, which buffer stdout to completion) **or** streaming
 * (`on("stdout" | "stderr")`) — mixing the two on one handle throws.
 *
 * `error`, `stderr`, and a non-zero `exit` code are three distinct signals.
 */
export interface IExecuteHandle {
    /** The unique id of this job. */
    readonly jobId: string;
    /** Stream stdout/stderr as binary chunks (switches the handle to streaming
     *  mode — the one-shot getters then throw). Returns an unsubscribe fn. */
    on(event: "stdout" | "stderr", cb: (chunk: Uint8Array) => void): () => void;
    /** Fires once when the process exits. */
    on(event: "exit", cb: (info: IExitInfo) => void): () => void;
    /** Fires once on a spawn-level failure (the process never started). */
    on(event: "error", cb: (err: IExecuteError) => void): () => void;
    /** Buffer stdout to completion and decode as UTF-8 text. */
    getText(): Promise<string>;
    /** Buffer stdout to completion and `JSON.parse` it (rejects on non-zero
     *  exit / parse failure, with `exitCode` + captured `stderr` on the error).
     *  Pass `pattern` to first extract the JSON from noisy stdout: the **last**
     *  match is used (capture group 1 if present, else the whole match), so a
     *  script that prints other output can wrap its result in a marker
     *  (e.g. `getJson(/@@RESULT@@(.*)/)`). Rejects if `pattern` finds no match. */
    getJson<T = unknown>(pattern?: RegExp): Promise<T>;
    /** Buffer stdout to completion and return the raw bytes. */
    getBytes(): Promise<Uint8Array>;
    /** Write to the process's stdin. */
    write(data: string | Uint8Array): void;
    /** Close the process's stdin. */
    endStdin(): void;
    /** Terminate the process (default SIGTERM). */
    kill(signal?: string): void;
}

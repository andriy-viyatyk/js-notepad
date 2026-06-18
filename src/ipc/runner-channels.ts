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

/**
 * Process execution namespace (`app.proc`).
 *
 * Spawn external programs and stream their output. `execute()` returns a
 * long-lived **handle** that is either consumed one-shot (buffer to
 * completion) or streamed — never both on the same handle.
 *
 * @example
 * // One-shot: run a script and parse its JSON stdout.
 * const data = await app.proc.execute("python scripts/load.py").getJson();
 *
 * @example
 * // Streaming: render output as it arrives.
 * const h = app.proc.execute("npm run build");
 * const dec = new TextDecoder();
 * h.on("stdout", (chunk) => console.log(dec.decode(chunk)));
 * h.on("exit", ({ code }) => console.log("done", code));
 */
export interface IProc {
    /**
     * Spawn a command line and return a handle to the running process.
     * The command runs through a shell by default (npm-`scripts` style — so
     * `&&`, pipes and inline args work). The child is spawned in the main
     * process and streamed back over IPC.
     *
     * @param command - Full command line (e.g. `"python scripts/load.py --since 2024"`).
     * @param options - Optional `cwd` / `env` / `shell`.
     */
    execute(command: string, options?: IExecuteOptions): IExecuteHandle;
}

/** Options for {@link IProc.execute}. */
export interface IExecuteOptions {
    /** Working directory for the spawned process. Defaults to the app's working directory. */
    cwd?: string;
    /** Extra environment variables, merged OVER the inherited environment. */
    env?: Record<string, string>;
    /**
     * Shell to run the command line through. Default `true` (the OS default
     * shell). A string picks a specific shell (`"bash"`, `"pwsh"`); `false`
     * runs the executable directly without a shell.
     */
    shell?: boolean | string;
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
 * `error`, `stderr`, and a non-zero `exit` code are three distinct signals:
 * `error` is a spawn-level failure (the program never ran), `stderr` is the
 * program's own diagnostic stream (not necessarily a failure), and a non-zero
 * `exit.code` means the program ran and reported failure.
 */
export interface IExecuteHandle {
    /** The unique id of this job. */
    readonly jobId: string;

    /**
     * Stream stdout/stderr as binary chunks. Attaching a `"stdout"`/`"stderr"`
     * listener switches the handle to streaming mode (the one-shot getters
     * then throw). Returns an unsubscribe function.
     */
    on(event: "stdout" | "stderr", cb: (chunk: Uint8Array) => void): () => void;
    /** Fires once when the process exits. */
    on(event: "exit", cb: (info: IExitInfo) => void): () => void;
    /** Fires once on a spawn-level failure (the process never started). */
    on(event: "error", cb: (err: IExecuteError) => void): () => void;

    /**
     * Buffer stdout to completion and decode as UTF-8 text.
     * Rejects only on a spawn-level `error`. Unavailable once a stdout/stderr
     * listener is attached.
     */
    getText(): Promise<string>;
    /**
     * Buffer stdout to completion and `JSON.parse` it. Rejects on a spawn-level
     * `error`, on a non-zero exit code, or on a parse failure — the rejection
     * error carries `exitCode` and the captured `stderr`.
     */
    getJson<T = unknown>(): Promise<T>;
    /** Buffer stdout to completion and return the raw bytes. */
    getBytes(): Promise<Uint8Array>;

    /** Write to the process's stdin. */
    write(data: string | Uint8Array): void;
    /** Close the process's stdin. */
    endStdin(): void;
    /** Terminate the process (default SIGTERM). */
    kill(signal?: string): void;
}

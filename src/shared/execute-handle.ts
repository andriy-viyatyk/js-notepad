/**
 * The `execute()` handle state machine — one implementation for both clients of
 * the runner protocol in `src/ipc/runner-channels.ts`:
 *
 *   • `src/renderer/api/proc.ts`  — transport = `window.electron.ipcRenderer`
 *   • `src/board-shim.ts`         — transport = the board's `MessagePort`
 *
 * Those two used to hold line-for-line copies of everything below, which the
 * runner-channels header warned must not drift. Only the transport genuinely
 * differs, so it is the only thing passed in: how to send a caller→runner
 * message, and how to receive this job's runner→caller messages.
 *
 * Kept dependency-free (only `ipc/runner-channels` + `shared/utils`, both
 * dependency-free themselves) because `board-shim.ts` bundles it into a
 * standalone browser IIFE with no Node or Electron available.
 */
import { RunnerChannel } from "../ipc/runner-channels";
import type {
    IExecuteError,
    IExecuteHandle,
    IExitInfo,
    RunnerChunkMsg,
    RunnerErrorMsg,
    RunnerExitMsg,
    RunnerInboundChannel,
    RunnerInboundMsg,
    RunnerOutboundChannel,
    RunnerOutboundMsg,
    RunnerStartMsg,
} from "../ipc/runner-channels";
import { concatChunks, errMessage } from "./utils";

/** Error thrown by `getJson()` on non-zero exit / missing pattern / parse failure. */
export class RunnerError extends Error {
    constructor(
        message: string,
        public readonly exitCode: number | null,
        public readonly stderr: string,
    ) {
        super(message);
        this.name = "RunnerError";
    }
}

/** Return the LAST match of `pattern` in `text` (used by `getJson(pattern)` to
 *  pull a marked result out of noisy stdout), or null if none. Iterates with a
 *  forced-global clone so the caller's regex (and its lastIndex) is untouched. */
function lastMatch(text: string, pattern: RegExp): RegExpExecArray | null {
    const re = new RegExp(
        pattern.source,
        pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g",
    );
    let match: RegExpExecArray | null = null;
    for (let m = re.exec(text); m !== null; m = re.exec(text)) {
        match = m;
        if (m.index === re.lastIndex) re.lastIndex++; // avoid an infinite loop on a zero-width match
    }
    return match;
}

/** How a handle reaches its runner. The caller owns the `jobId` (its prefix tells
 *  main-side logs a renderer job from a board job apart) and the wire format. */
export interface ExecuteTransport {
    /** Unique id for this job; carried on every message in both directions. */
    jobId: string;
    /** Prefix for `console.error` when a caller's own callback throws — the name
     *  of the API the board/script author called (`"proc.execute"`). */
    label: string;
    /** Send a caller→runner message (`start` / `stdin` / `endStdin` / `kill`). */
    send(channel: RunnerOutboundChannel, msg: RunnerOutboundMsg): void;
    /**
     * Subscribe to this job's runner→caller messages (`stdout` / `stderr` /
     * `exit` / `error`); `deliver` must only be called for THIS `jobId`. Returns
     * the unsubscribe fn, called once when the job finishes.
     */
    subscribe(deliver: (channel: RunnerInboundChannel, msg: RunnerInboundMsg) => void): () => void;
}

type Mode = "idle" | "buffered" | "streaming";

/**
 * Build a handle for a job and start it. Subscribes BEFORE sending `start`, so
 * output produced immediately by the child is never missed.
 */
export function createExecuteHandle(
    transport: ExecuteTransport,
    start: Omit<RunnerStartMsg, "jobId">,
): IExecuteHandle {
    const { jobId, label } = transport;

    let mode: Mode = "idle";
    let finished = false;
    let exitInfo: IExitInfo | null = null;
    let errorMessage: string | null = null;

    // Buffered (idle/buffered mode) — accumulate until consumed or streamed.
    const stdoutChunks: Uint8Array[] = [];
    const stderrChunks: Uint8Array[] = [];

    // Streaming listeners.
    const stdoutCbs: Array<(chunk: Uint8Array) => void> = [];
    const stderrCbs: Array<(chunk: Uint8Array) => void> = [];
    const exitCbs: Array<(info: IExitInfo) => void> = [];
    const errorCbs: Array<(err: IExecuteError) => void> = [];

    const doneResolvers: Array<() => void> = [];

    const stderrText = () => new TextDecoder().decode(concatChunks(stderrChunks));

    const notify = <T>(cbs: Array<(arg: T) => void>, kind: string, arg: T): void => {
        for (const cb of cbs) {
            try {
                cb(arg);
            } catch (e) {
                console.error(`${label} ${kind} callback error:`, e);
            }
        }
    };

    /** Assigned by the `transport.subscribe` call below, before any message can arrive. */
    let unsubscribe: () => void = () => {};

    const finish = (): void => {
        finished = true;
        for (const r of doneResolvers) r();
        doneResolvers.length = 0;
        unsubscribe();
    };

    const waitDone = (): Promise<void> =>
        finished
            ? Promise.resolve()
            : new Promise<void>((resolve) => doneResolvers.push(resolve));

    const ensureBufferable = (): void => {
        if (mode === "streaming") {
            throw new Error(
                "ExecuteHandle is in streaming mode; getText/getJson/getBytes are unavailable once a stdout/stderr listener is attached",
            );
        }
        mode = "buffered";
    };

    unsubscribe = transport.subscribe((channel, msg) => {
        if (channel === RunnerChannel.stdout || channel === RunnerChannel.stderr) {
            const isStdout = channel === RunnerChannel.stdout;
            const chunk = (msg as RunnerChunkMsg).chunk;
            if (mode === "streaming") {
                notify(isStdout ? stdoutCbs : stderrCbs, "stream", chunk);
            } else {
                (isStdout ? stdoutChunks : stderrChunks).push(chunk);
            }
        } else if (channel === RunnerChannel.exit) {
            if (finished) return;
            const m = msg as RunnerExitMsg;
            exitInfo = { code: m.code, signal: m.signal };
            finish();
            notify(exitCbs, "exit", exitInfo);
        } else if (channel === RunnerChannel.error) {
            if (finished) return;
            errorMessage = (msg as RunnerErrorMsg).message;
            finish();
            notify(errorCbs, "error", { message: errorMessage });
        }
    });

    transport.send(RunnerChannel.start, { jobId, ...start });

    const handle: IExecuteHandle = {
        jobId,

        // -- Streaming / lifecycle events -------------------------------------

        on(event: "stdout" | "stderr" | "exit" | "error", cb: (arg: never) => void): () => void {
            if (event === "stdout" || event === "stderr") {
                if (mode === "buffered") {
                    throw new Error(
                        "ExecuteHandle is in buffered mode; cannot attach a stdout/stderr listener after getText/getJson/getBytes",
                    );
                }
                mode = "streaming";
                const cbs = event === "stdout" ? stdoutCbs : stderrCbs;
                const streamCb = cb as unknown as (chunk: Uint8Array) => void;
                cbs.push(streamCb);
                // Replay any chunks that arrived before this listener attached, then go live.
                const buffered = event === "stdout" ? stdoutChunks : stderrChunks;
                for (const chunk of buffered) streamCb(chunk);
                buffered.length = 0;
                return () => {
                    const i = cbs.indexOf(streamCb);
                    if (i >= 0) cbs.splice(i, 1);
                };
            }

            if (event === "exit") {
                const exitCb = cb as unknown as (info: IExitInfo) => void;
                if (finished) {
                    if (exitInfo) exitCb(exitInfo);
                    return () => {};
                }
                exitCbs.push(exitCb);
                return () => {
                    const i = exitCbs.indexOf(exitCb);
                    if (i >= 0) exitCbs.splice(i, 1);
                };
            }

            // event === "error"
            const errorCb = cb as unknown as (err: IExecuteError) => void;
            if (finished) {
                if (errorMessage !== null) errorCb({ message: errorMessage });
                return () => {};
            }
            errorCbs.push(errorCb);
            return () => {
                const i = errorCbs.indexOf(errorCb);
                if (i >= 0) errorCbs.splice(i, 1);
            };
        },

        // -- One-shot consumers ------------------------------------------------

        async getBytes(): Promise<Uint8Array> {
            ensureBufferable();
            await waitDone();
            if (errorMessage !== null) throw new Error(errorMessage);
            return concatChunks(stdoutChunks);
        },

        async getText(): Promise<string> {
            const bytes = await handle.getBytes();
            return new TextDecoder().decode(bytes);
        },

        async getJson<T = unknown>(pattern?: RegExp): Promise<T> {
            ensureBufferable();
            await waitDone();
            const code = exitInfo?.code ?? null;
            if (errorMessage !== null) {
                throw new RunnerError(errorMessage, code, stderrText());
            }
            if (code !== null && code !== 0) {
                throw new RunnerError(`Command exited with code ${code}`, code, stderrText());
            }
            let text = new TextDecoder().decode(concatChunks(stdoutChunks));
            if (pattern) {
                const match = lastMatch(text, pattern);
                if (!match) {
                    throw new RunnerError(
                        `Result pattern ${pattern} not found in output`,
                        code,
                        stderrText(),
                    );
                }
                text = match[1] ?? match[0];
            }
            try {
                return JSON.parse(text) as T;
            } catch (e) {
                throw new RunnerError(
                    `Failed to parse JSON output: ${errMessage(e)}`,
                    code,
                    stderrText(),
                );
            }
        },

        // -- Input / lifecycle -------------------------------------------------

        write(data: string | Uint8Array): void {
            if (finished) return;
            transport.send(RunnerChannel.stdin, { jobId, data });
        },

        endStdin(): void {
            if (finished) return;
            transport.send(RunnerChannel.endStdin, { jobId });
        },

        kill(signal?: string): void {
            if (finished) return;
            transport.send(RunnerChannel.kill, { jobId, signal });
        },
    };

    return handle;
}

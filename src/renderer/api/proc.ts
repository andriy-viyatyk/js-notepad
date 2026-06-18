/**
 * Renderer client for the main-process streaming command runner.
 *
 * `proc.execute(command, opts)` returns an {@link IExecuteHandle} — the
 * renderer side of the protocol in `src/ipc/runner-channels.ts`. Mirrors
 * `WorkerRunner.ts`: per-job `ipcRenderer.on` subscriptions filtered by
 * `jobId`, with the start / stdin / kill messages sent back on the same
 * channels. The runner channels are ad-hoc strings (not in the typed
 * `Endpoint` enum), hence the `as unknown as never` casts — same as the
 * worker system.
 */
import {
    RunnerChannel,
    RunnerChunkMsg,
    RunnerErrorMsg,
    RunnerExitMsg,
} from "../../ipc/runner-channels";
import type {
    IExecuteError,
    IExecuteHandle,
    IExecuteOptions,
    IExitInfo,
    IProc,
} from "./types/proc";

const { ipcRenderer } = window.electron;

let idCounter = 0;

type Mode = "idle" | "buffered" | "streaming";
type StreamName = "stdout" | "stderr";

/** Error thrown by `getJson()` on non-zero exit / parse failure. */
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

function concat(chunks: Uint8Array[]): Uint8Array {
    let total = 0;
    for (const c of chunks) total += c.length;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
        out.set(c, offset);
        offset += c.length;
    }
    return out;
}

class ExecuteHandle implements IExecuteHandle {
    readonly jobId: string;

    private mode: Mode = "idle";
    private finished = false;
    private exitInfo: IExitInfo | null = null;
    private errorMessage: string | null = null;

    // Buffered (idle/buffered mode) — accumulate until consumed or streamed.
    private stdoutChunks: Uint8Array[] = [];
    private stderrChunks: Uint8Array[] = [];

    // Streaming listeners.
    private stdoutCbs: Array<(chunk: Uint8Array) => void> = [];
    private stderrCbs: Array<(chunk: Uint8Array) => void> = [];
    private exitCbs: Array<(info: IExitInfo) => void> = [];
    private errorCbs: Array<(err: IExecuteError) => void> = [];

    private doneResolvers: Array<() => void> = [];
    private offs: Array<() => void> = [];

    constructor(command: string, options?: IExecuteOptions) {
        this.jobId = `p_${++idCounter}_${Date.now()}`;
        this.registerListeners();
        ipcRenderer.sendMessage(RunnerChannel.start as unknown as never, {
            jobId: this.jobId,
            command,
            opts: options,
        });
    }

    private registerListeners(): void {
        const onChunk = (stream: StreamName) => (msg: RunnerChunkMsg) => {
            if (msg.jobId !== this.jobId) return;
            if (this.mode === "streaming") {
                const cbs = stream === "stdout" ? this.stdoutCbs : this.stderrCbs;
                for (const cb of cbs) {
                    try {
                        cb(msg.chunk);
                    } catch (e) {
                        console.error("proc.execute stream callback error:", e);
                    }
                }
            } else {
                (stream === "stdout" ? this.stdoutChunks : this.stderrChunks).push(msg.chunk);
            }
        };

        this.offs.push(
            ipcRenderer.on(RunnerChannel.stdout as unknown as never, onChunk("stdout")),
        );
        this.offs.push(
            ipcRenderer.on(RunnerChannel.stderr as unknown as never, onChunk("stderr")),
        );
        this.offs.push(
            ipcRenderer.on(RunnerChannel.exit as unknown as never, (msg: RunnerExitMsg) => {
                if (msg.jobId !== this.jobId) return;
                this.onExit({ code: msg.code, signal: msg.signal });
            }),
        );
        this.offs.push(
            ipcRenderer.on(RunnerChannel.error as unknown as never, (msg: RunnerErrorMsg) => {
                if (msg.jobId !== this.jobId) return;
                this.onError(msg.message);
            }),
        );
    }

    private onExit(info: IExitInfo): void {
        if (this.finished) return;
        this.exitInfo = info;
        this.finish();
        for (const cb of this.exitCbs) {
            try {
                cb(info);
            } catch (e) {
                console.error("proc.execute exit callback error:", e);
            }
        }
    }

    private onError(message: string): void {
        if (this.finished) return;
        this.errorMessage = message;
        this.finish();
        for (const cb of this.errorCbs) {
            try {
                cb({ message });
            } catch (e) {
                console.error("proc.execute error callback error:", e);
            }
        }
    }

    private finish(): void {
        this.finished = true;
        for (const r of this.doneResolvers) r();
        this.doneResolvers = [];
        for (const off of this.offs) off();
        this.offs = [];
    }

    private waitDone(): Promise<void> {
        if (this.finished) return Promise.resolve();
        return new Promise((resolve) => this.doneResolvers.push(resolve));
    }

    private ensureBufferable(): void {
        if (this.mode === "streaming") {
            throw new Error(
                "ExecuteHandle is in streaming mode; getText/getJson/getBytes are unavailable once a stdout/stderr listener is attached",
            );
        }
        this.mode = "buffered";
    }

    private stderrText(): string {
        return new TextDecoder().decode(concat(this.stderrChunks));
    }

    // -- Streaming / lifecycle events -------------------------------------

    on(event: "stdout" | "stderr", cb: (chunk: Uint8Array) => void): () => void;
    on(event: "exit", cb: (info: IExitInfo) => void): () => void;
    on(event: "error", cb: (err: IExecuteError) => void): () => void;
    on(event: "stdout" | "stderr" | "exit" | "error", cb: (arg: never) => void): () => void {
        if (event === "stdout" || event === "stderr") {
            if (this.mode === "buffered") {
                throw new Error(
                    "ExecuteHandle is in buffered mode; cannot attach a stdout/stderr listener after getText/getJson/getBytes",
                );
            }
            this.mode = "streaming";
            const cbs = event === "stdout" ? this.stdoutCbs : this.stderrCbs;
            const streamCb = cb as unknown as (chunk: Uint8Array) => void;
            cbs.push(streamCb);
            // Replay any chunks that arrived before this listener attached, then go live.
            const buffered = event === "stdout" ? this.stdoutChunks : this.stderrChunks;
            for (const chunk of buffered) streamCb(chunk);
            if (event === "stdout") this.stdoutChunks = [];
            else this.stderrChunks = [];
            return () => {
                const i = cbs.indexOf(streamCb);
                if (i >= 0) cbs.splice(i, 1);
            };
        }

        if (event === "exit") {
            const exitCb = cb as unknown as (info: IExitInfo) => void;
            if (this.finished) {
                if (this.exitInfo) exitCb(this.exitInfo);
                return () => {};
            }
            this.exitCbs.push(exitCb);
            return () => {
                const i = this.exitCbs.indexOf(exitCb);
                if (i >= 0) this.exitCbs.splice(i, 1);
            };
        }

        // event === "error"
        const errorCb = cb as unknown as (err: IExecuteError) => void;
        if (this.finished) {
            if (this.errorMessage) errorCb({ message: this.errorMessage });
            return () => {};
        }
        this.errorCbs.push(errorCb);
        return () => {
            const i = this.errorCbs.indexOf(errorCb);
            if (i >= 0) this.errorCbs.splice(i, 1);
        };
    }

    // -- One-shot consumers ------------------------------------------------

    async getBytes(): Promise<Uint8Array> {
        this.ensureBufferable();
        await this.waitDone();
        if (this.errorMessage !== null) throw new Error(this.errorMessage);
        return concat(this.stdoutChunks);
    }

    async getText(): Promise<string> {
        const bytes = await this.getBytes();
        return new TextDecoder().decode(bytes);
    }

    async getJson<T = unknown>(): Promise<T> {
        this.ensureBufferable();
        await this.waitDone();
        const code = this.exitInfo?.code ?? null;
        if (this.errorMessage !== null) {
            throw new RunnerError(this.errorMessage, code, this.stderrText());
        }
        if (code !== null && code !== 0) {
            throw new RunnerError(
                `Command exited with code ${code}`,
                code,
                this.stderrText(),
            );
        }
        const text = new TextDecoder().decode(concat(this.stdoutChunks));
        try {
            return JSON.parse(text) as T;
        } catch (e) {
            throw new RunnerError(
                `Failed to parse JSON output: ${e instanceof Error ? e.message : String(e)}`,
                code,
                this.stderrText(),
            );
        }
    }

    // -- Input / lifecycle -------------------------------------------------

    write(data: string | Uint8Array): void {
        if (this.finished) return;
        ipcRenderer.sendMessage(RunnerChannel.stdin as unknown as never, {
            jobId: this.jobId,
            data,
        });
    }

    endStdin(): void {
        if (this.finished) return;
        ipcRenderer.sendMessage(RunnerChannel.endStdin as unknown as never, {
            jobId: this.jobId,
        });
    }

    kill(signal?: string): void {
        if (this.finished) return;
        ipcRenderer.sendMessage(RunnerChannel.kill as unknown as never, {
            jobId: this.jobId,
            signal,
        });
    }
}

export const proc: IProc = {
    execute(command: string, options?: IExecuteOptions): IExecuteHandle {
        return new ExecuteHandle(command, options);
    },
};

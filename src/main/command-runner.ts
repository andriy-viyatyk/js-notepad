/**
 * Main-process streaming command runner — the engine behind
 * `app.proc.execute()` (and, via US-724, the Web Board `persephone.execute()`).
 *
 * Spawns a child process from a command-line string and streams its
 * stdout / stderr / exit / error back to the originating WebContents over IPC,
 * keyed by `jobId`. The caller can write to stdin and kill the child by the
 * same `jobId`. Modeled on the async-worker host (`worker-host.ts`): a
 * `Map<jobId, …>` registry + `event.sender.send(channel, { jobId, … })`.
 *
 * Boards are sandboxed (no Node), so the spawn must live here in main; every
 * front-end (renderer `app` API, board preload, optional MCP tool) reaches
 * this single owner over IPC, which keeps the process registry — and the
 * tree-kill added in US-720 — centralized.
 */
import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { ipcMain, IpcMainEvent, WebContents } from "electron";
import {
    RunnerChannel,
    RunnerJobMsg,
    RunnerKillMsg,
    RunnerStartMsg,
    RunnerStdinMsg,
} from "../ipc/runner-channels";

/** Coalesce stdout/stderr bursts into one IPC message per ~tick to cut message count. */
const COALESCE_MS = 16;

interface Job {
    proc: ChildProcessWithoutNullStreams;
    sender: WebContents;
    stdoutBuf: Buffer[];
    stderrBuf: Buffer[];
    flushTimer: ReturnType<typeof setTimeout> | null;
}

/** Live jobs keyed by jobId (mirrors worker-host's `activeWorkers`). */
const activeJobs = new Map<string, Job>();

/** Send to a WebContents that may have been destroyed (window/webview closed). */
function safeSend(sender: WebContents, channel: RunnerChannel, payload: unknown): void {
    try {
        if (!sender.isDestroyed()) sender.send(channel, payload);
    } catch {
        // sender gone — ignore
    }
}

function flush(jobId: string): void {
    const job = activeJobs.get(jobId);
    if (!job) return;
    if (job.flushTimer) {
        clearTimeout(job.flushTimer);
        job.flushTimer = null;
    }
    if (job.stdoutBuf.length) {
        const chunk = Buffer.concat(job.stdoutBuf);
        job.stdoutBuf = [];
        safeSend(job.sender, RunnerChannel.stdout, { jobId, chunk });
    }
    if (job.stderrBuf.length) {
        const chunk = Buffer.concat(job.stderrBuf);
        job.stderrBuf = [];
        safeSend(job.sender, RunnerChannel.stderr, { jobId, chunk });
    }
}

function scheduleFlush(jobId: string): void {
    const job = activeJobs.get(jobId);
    if (!job || job.flushTimer) return;
    job.flushTimer = setTimeout(() => flush(jobId), COALESCE_MS);
}

function cleanup(jobId: string): void {
    const job = activeJobs.get(jobId);
    if (job?.flushTimer) clearTimeout(job.flushTimer);
    activeJobs.delete(jobId);
}

function startJob(event: IpcMainEvent, msg: RunnerStartMsg): void {
    const { jobId, command, opts } = msg;

    let proc: ChildProcessWithoutNullStreams;
    try {
        proc = spawn(command, {
            shell: opts?.shell ?? true,
            cwd: opts?.cwd,
            env: { ...process.env, ...(opts?.env ?? {}) },
            windowsHide: true,
        });
    } catch (err) {
        // Synchronous spawn failure (e.g. bad cwd).
        safeSend(event.sender, RunnerChannel.error, {
            jobId,
            message: err instanceof Error ? err.message : String(err),
        });
        return;
    }

    const job: Job = {
        proc,
        sender: event.sender,
        stdoutBuf: [],
        stderrBuf: [],
        flushTimer: null,
    };
    activeJobs.set(jobId, job);

    proc.stdout.on("data", (data: Buffer) => {
        job.stdoutBuf.push(data);
        scheduleFlush(jobId);
    });
    proc.stderr.on("data", (data: Buffer) => {
        job.stderrBuf.push(data);
        scheduleFlush(jobId);
    });
    // Writing to stdin after the child exits emits EPIPE — swallow it.
    proc.stdin.on("error", () => {});

    proc.on("error", (err: Error) => {
        // Async spawn failure (e.g. ENOENT).
        safeSend(event.sender, RunnerChannel.error, { jobId, message: err.message });
        cleanup(jobId);
    });

    proc.on("close", (code, signal) => {
        flush(jobId); // emit any buffered output before the exit event
        safeSend(event.sender, RunnerChannel.exit, { jobId, code, signal });
        cleanup(jobId);
    });
}

/**
 * Register the runner IPC handlers. Call once during app startup
 * (alongside `initWorkerHost()` in `main-setup.ts`).
 */
export function initCommandRunner(): void {
    ipcMain.on(RunnerChannel.start, (event: IpcMainEvent, msg: RunnerStartMsg) => {
        startJob(event, msg);
    });

    ipcMain.on(RunnerChannel.stdin, (_event, msg: RunnerStdinMsg) => {
        const job = activeJobs.get(msg.jobId);
        if (!job) return;
        try {
            job.proc.stdin.write(msg.data);
        } catch {
            // child stdin already closed — ignore
        }
    });

    ipcMain.on(RunnerChannel.endStdin, (_event, msg: RunnerJobMsg) => {
        const job = activeJobs.get(msg.jobId);
        if (!job) return;
        try {
            job.proc.stdin.end();
        } catch {
            // already closed — ignore
        }
    });

    ipcMain.on(RunnerChannel.kill, (_event, msg: RunnerKillMsg) => {
        // Direct-child kill only. US-720 replaces this body with a Windows
        // Job-Object / `taskkill /T` whole-tree kill over the same registry.
        const job = activeJobs.get(msg.jobId);
        if (!job) return;
        try {
            job.proc.kill((msg.signal as NodeJS.Signals) || undefined);
        } catch {
            // already dead — ignore
        }
    });
}

/** Kill every in-flight child. Wired into `app.on("will-quit", …)`. */
export function killAllCommands(): void {
    for (const job of activeJobs.values()) {
        if (job.flushTimer) clearTimeout(job.flushTimer);
        try {
            job.proc.kill();
        } catch {
            // already dead — ignore
        }
    }
    activeJobs.clear();
}

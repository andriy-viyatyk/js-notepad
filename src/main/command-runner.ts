/**
 * Main-process streaming command runner — the engine behind
 * `app.proc.execute()` (and, via US-724, the Board `persephone.execute()`).
 *
 * Spawns a child process from a command-line string and streams its
 * stdout / stderr / exit / error back to the caller, keyed by `jobId`. The
 * caller can write to stdin and kill the child by the same `jobId`. Modeled on
 * the async-worker host (`worker-host.ts`): a `Map<jobId, …>` registry.
 *
 * The transport is abstracted behind a {@link JobSink} (EPIC-037 / US-771) so
 * one spawn/stream/tree-kill engine serves two callers:
 *  • the renderer `app` API + scripts, over IPC (`event.sender.send`) — a
 *    `WebContents`-backed sink wired in `initCommandRunner`;
 *  • a Board, over its per-board `MessagePort` — a port-backed sink supplied by
 *    `board-bridge.ts` (the board iframe has no `WebContents` of its own).
 *
 * Boards are sandboxed (no Node), so the spawn must live here in main; every
 * front-end reaches this single owner, which keeps the process registry — and
 * the tree-kill added in US-720 — centralized.
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
import { errMessage } from "../shared/utils";

/** Coalesce stdout/stderr bursts into one message per ~tick to cut message count. */
const COALESCE_MS = 16;

/**
 * A destination for a job's stream messages — abstracts the transport (IPC
 * `WebContents` vs. a board `MessagePort`). `id` groups jobs by owner for reaping
 * (a `WebContents` id stringified, or a board id).
 */
export interface JobSink {
    readonly id: string;
    send(channel: RunnerChannel, payload: unknown): void;
}

interface Job {
    proc: ChildProcessWithoutNullStreams;
    sink: JobSink;
    /** The spawned command line — surfaced by `getJobsBySinkIds` (US-799). */
    command: string;
    /** Optional caller-chosen job name (`opts.name`) — the re-association key
     *  for a board's surviving jobs (US-799). */
    name?: string;
    stdoutBuf: Buffer[];
    stderrBuf: Buffer[];
    flushTimer: ReturnType<typeof setTimeout> | null;
}

/** Live jobs keyed by jobId (mirrors worker-host's `activeWorkers`). */
const activeJobs = new Map<string, Job>();

/** jobIds grouped by their owning sink id — for reaping on close/crash/dispose. */
const jobsBySink = new Map<string, Set<string>>();

/** Per-WebContents reap wiring (so we attach lifecycle listeners exactly once).
 *  Only the IPC sink uses this; the board sink is reaped explicitly by the bridge. */
const senderReapers = new Map<number, { wc: WebContents; reap: () => void }>();

/** Build a sink that streams to a `WebContents` over IPC (tolerates a destroyed
 *  sender — window/webview closed). */
function webContentsSink(sender: WebContents): JobSink {
    return {
        id: String(sender.id),
        send(channel, payload) {
            try {
                if (!sender.isDestroyed()) sender.send(channel, payload);
            } catch {
                // sender gone — ignore
            }
        },
    };
}

/**
 * Kill a child process and its entire descendant tree.
 *
 * Windows: `taskkill /PID <pid> /T /F` — /T walks the child tree, /F forces.
 *   Closes the US-719 gap: with `shell: true` the tracked child is cmd.exe
 *   and the real workload is a grandchild; a plain proc.kill() only ends
 *   cmd.exe and orphans the grandchild (which holds the stdio pipes open, so
 *   `close` never fires). taskkill /T kills the whole tree → pipes close →
 *   our existing proc.on("close") fires and the job settles.
 * POSIX: process.kill(-pid, signal) signals the child's process group (the
 *   child is the group leader via detached:true at spawn).
 */
function treeKill(proc: ChildProcessWithoutNullStreams, signal?: string): void {
    const pid = proc.pid;
    if (pid == null) {
        try { proc.kill(); } catch { /* already dead */ }
        return;
    }
    if (process.platform === "win32") {
        try {
            // Fire-and-forget; taskkill is short-lived and self-cleaning.
            spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
        } catch {
            try { proc.kill(); } catch { /* already dead */ }
        }
    } else {
        try {
            process.kill(-pid, (signal as NodeJS.Signals) || "SIGTERM");
        } catch {
            try { proc.kill((signal as NodeJS.Signals) || undefined); } catch { /* already dead */ }
        }
    }
}

function indexJob(jobId: string, sinkId: string): void {
    let set = jobsBySink.get(sinkId);
    if (!set) {
        set = new Set();
        jobsBySink.set(sinkId, set);
    }
    set.add(jobId);
}

/**
 * Reap every job owned by a sink whose owner is gone (window/webview destroyed or
 * crashed, or a board disposed). Public so the board bridge can reap a board's jobs
 * by its board id on dispose.
 */
export function reapJobsBySinkId(sinkId: string): void {
    const set = jobsBySink.get(sinkId);
    if (set) {
        for (const jobId of [...set]) {
            const job = activeJobs.get(jobId);
            if (job) treeKill(job.proc);
            cleanup(jobId); // owner is gone — nobody will receive `exit`
        }
        jobsBySink.delete(sinkId);
    }
}

/** Reap a WebContents sink and detach its lifecycle listeners. */
function reapSender(senderId: number): void {
    const entry = senderReapers.get(senderId);
    if (entry) {
        try { entry.wc.removeListener("render-process-gone", entry.reap); } catch { /* gone */ }
        // 'destroyed' was once() — already removed if it fired.
        senderReapers.delete(senderId);
    }
    reapJobsBySinkId(String(senderId));
}

/** Attach destroyed / crash reaping to a WebContents sink exactly once. */
function wireSenderReaping(sender: WebContents): void {
    if (senderReapers.has(sender.id)) return;
    const reap = () => reapSender(sender.id);
    senderReapers.set(sender.id, { wc: sender, reap });
    sender.once("destroyed", reap);
    sender.on("render-process-gone", reap);
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
        job.sink.send(RunnerChannel.stdout, { jobId, chunk });
    }
    if (job.stderrBuf.length) {
        const chunk = Buffer.concat(job.stderrBuf);
        job.stderrBuf = [];
        job.sink.send(RunnerChannel.stderr, { jobId, chunk });
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
    if (job) {
        const set = jobsBySink.get(job.sink.id);
        if (set) {
            set.delete(jobId);
            if (!set.size) jobsBySink.delete(job.sink.id);
        }
    }
    activeJobs.delete(jobId);
}

/**
 * Spawn a child and stream it to `sink`. The transport-agnostic core shared by the
 * IPC and board-port callers. `RunnerStartMsg.opts.cwd` defaults are the caller's
 * responsibility (the board bridge fills the board folder).
 */
export function startJobTo(sink: JobSink, msg: RunnerStartMsg): void {
    const { jobId, command, opts } = msg;

    let proc: ChildProcessWithoutNullStreams;
    try {
        proc = spawn(command, msg.args ?? [], {
            shell: opts?.shell ?? true,
            cwd: opts?.cwd,
            env: { ...process.env, ...(opts?.env ?? {}) },
            windowsHide: true,
            // POSIX: become a process-group leader so the whole group can be
            // signalled via process.kill(-pid) in treeKill(). Windows uses
            // taskkill /T instead, and detached there would spawn a console —
            // so it is Windows-excluded. We never unref(): the job stays tracked.
            detached: process.platform !== "win32",
        });
    } catch (err) {
        // Synchronous spawn failure (e.g. bad cwd).
        sink.send(RunnerChannel.error, {
            jobId,
            message: errMessage(err),
        });
        return;
    }

    const job: Job = {
        proc,
        sink,
        command,
        name: opts?.name,
        stdoutBuf: [],
        stderrBuf: [],
        flushTimer: null,
    };
    activeJobs.set(jobId, job);
    indexJob(jobId, sink.id);

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
        sink.send(RunnerChannel.error, { jobId, message: err.message });
        cleanup(jobId);
    });

    proc.on("close", (code, signal) => {
        flush(jobId); // emit any buffered output before the exit event
        sink.send(RunnerChannel.exit, { jobId, code, signal });
        cleanup(jobId);
    });
}

/** Write to a job's stdin (no-op if the job/child is gone). */
export function writeJobStdin(jobId: string, data: string | Uint8Array): void {
    const job = activeJobs.get(jobId);
    if (!job) return;
    try {
        job.proc.stdin.write(data);
    } catch {
        // child stdin already closed — ignore
    }
}

/** Close a job's stdin. */
export function endJobStdin(jobId: string): void {
    const job = activeJobs.get(jobId);
    if (!job) return;
    try {
        job.proc.stdin.end();
    } catch {
        // already closed — ignore
    }
}

/** A live job's identity, as returned by {@link getJobsBySinkIds} (US-799). */
export interface JobInfo {
    jobId: string;
    command: string;
    name?: string;
}

/** List the live jobs owned by any of `sinkIds` (a board owner's current + kept
 *  sinks). Read-only — used by the board bridge's `getJobs` RPC (US-799). */
export function getJobsBySinkIds(sinkIds: Iterable<string>): JobInfo[] {
    const result: JobInfo[] = [];
    for (const sinkId of sinkIds) {
        const set = jobsBySink.get(sinkId);
        if (!set) continue;
        for (const jobId of set) {
            const job = activeJobs.get(jobId);
            if (job) result.push({ jobId, command: job.command, name: job.name });
        }
    }
    return result;
}

/** Tree-kill a job's child. The normal close→exit→cleanup path then runs. */
export function killJob(jobId: string, signal?: string): void {
    const job = activeJobs.get(jobId);
    if (!job) return;
    treeKill(job.proc, signal);
    // Do not cleanup here — taskkill/group-kill closes the child's stdio,
    // so proc.on("close") fires and runs the normal exit + cleanup path.
}

/**
 * Register the runner IPC handlers for the renderer `app`/script clients. Call
 * once during app startup (alongside `initWorkerHost()` in `main-setup.ts`).
 * Boards do NOT use these channels — they route runner messages over their port
 * via `startJobTo`/`writeJobStdin`/… (see `board-bridge.ts`).
 */
export function initCommandRunner(): void {
    ipcMain.on(RunnerChannel.start, (event: IpcMainEvent, msg: RunnerStartMsg) => {
        wireSenderReaping(event.sender);
        startJobTo(webContentsSink(event.sender), msg);
    });

    ipcMain.on(RunnerChannel.stdin, (_event, msg: RunnerStdinMsg) => {
        writeJobStdin(msg.jobId, msg.data);
    });

    ipcMain.on(RunnerChannel.endStdin, (_event, msg: RunnerJobMsg) => {
        endJobStdin(msg.jobId);
    });

    ipcMain.on(RunnerChannel.kill, (_event, msg: RunnerKillMsg) => {
        killJob(msg.jobId, msg.signal);
    });
}

/** Kill every in-flight child. Wired into `app.on("will-quit", …)`. */
export function killAllCommands(): void {
    for (const job of activeJobs.values()) {
        if (job.flushTimer) clearTimeout(job.flushTimer);
        treeKill(job.proc);
    }
    activeJobs.clear();
    jobsBySink.clear();
    senderReapers.clear();
}

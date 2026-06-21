/**
 * Main-process streaming command runner — the engine behind
 * `app.proc.execute()` (and, via US-724, the Board `persephone.execute()`).
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

/** jobIds grouped by their owning WebContents id — for reaping on close/crash. */
const jobsBySender = new Map<number, Set<string>>();

/** Per-sender reap wiring (so we attach lifecycle listeners exactly once). */
const senderReapers = new Map<number, { wc: WebContents; reap: () => void }>();

/** Send to a WebContents that may have been destroyed (window/webview closed). */
function safeSend(sender: WebContents, channel: RunnerChannel, payload: unknown): void {
    try {
        if (!sender.isDestroyed()) sender.send(channel, payload);
    } catch {
        // sender gone — ignore
    }
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

function indexJob(jobId: string, sender: WebContents): void {
    let set = jobsBySender.get(sender.id);
    if (!set) {
        set = new Set();
        jobsBySender.set(sender.id, set);
    }
    set.add(jobId);
}

/** Reap every job owned by a WebContents whose window/webview is gone or crashed. */
function reapSender(senderId: number): void {
    const entry = senderReapers.get(senderId);
    if (entry) {
        try { entry.wc.removeListener("render-process-gone", entry.reap); } catch { /* gone */ }
        // 'destroyed' was once() — already removed if it fired.
        senderReapers.delete(senderId);
    }
    const set = jobsBySender.get(senderId);
    if (!set) return;
    for (const jobId of [...set]) {
        const job = activeJobs.get(jobId);
        if (job) treeKill(job.proc);
        cleanup(jobId); // sender is gone — nobody will receive `exit`
    }
    jobsBySender.delete(senderId);
}

/** Attach destroyed / crash reaping to a sender exactly once. */
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
    if (job) {
        const set = jobsBySender.get(job.sender.id);
        if (set) {
            set.delete(jobId);
            if (!set.size) jobsBySender.delete(job.sender.id);
        }
    }
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
            // POSIX: become a process-group leader so the whole group can be
            // signalled via process.kill(-pid) in treeKill(). Windows uses
            // taskkill /T instead, and detached there would spawn a console —
            // so it is Windows-excluded. We never unref(): the job stays tracked.
            detached: process.platform !== "win32",
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
    indexJob(jobId, event.sender);
    wireSenderReaping(event.sender);

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
        const job = activeJobs.get(msg.jobId);
        if (!job) return;
        treeKill(job.proc, msg.signal);
        // Do not cleanup here — taskkill/group-kill closes the child's stdio,
        // so proc.on("close") fires and runs the normal exit + cleanup path.
    });
}

/** Kill every in-flight child. Wired into `app.on("will-quit", …)`. */
export function killAllCommands(): void {
    for (const job of activeJobs.values()) {
        if (job.flushTimer) clearTimeout(job.flushTimer);
        treeKill(job.proc);
    }
    activeJobs.clear();
    jobsBySender.clear();
    senderReapers.clear();
}

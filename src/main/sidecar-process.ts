/**
 * Main process sidecar lifecycle.
 *
 * Shared machinery for a "spawn a helper exe, wait for a readiness line on
 * stdout, keep it until stopped" child process (tor.exe, mneme.exe). Owns the
 * parts that are easy to get subtly wrong and were previously written twice:
 * in-flight start dedupe, the readiness timeout, the stale-child guard on
 * `close`, unexpected-death notification, and stop-and-wait before a restart.
 *
 * The service wrapping an instance keeps everything domain-specific: what to
 * spawn and with which args, how to log, and what a status broadcast looks like.
 */
import {
    ChildProcessWithoutNullStreams,
    spawn,
    SpawnOptionsWithoutStdio,
} from "child_process";
import path from "path";
import { errMessage } from "../shared/utils";

export interface SidecarStartResult {
    success: boolean;
    error?: string;
}

export interface SidecarProcessOptions {
    /** Human-readable process name used in log lines and error text ("Tor", "Mneme"). */
    name: string;
    /** Readiness sentinel, tested against each trimmed non-empty stdout line. */
    isReady: (line: string) => boolean;
    /** How long to wait for the readiness line before giving up. */
    readinessTimeoutMs: number;
    /**
     * Error/log text for a readiness timeout. Defaults to
     * "<name> did not become ready within N s".
     */
    timeoutMessage?: string;
    /** Cap on waiting for a killed process to be reaped in `stopAndWait`. Default 5 s. */
    exitTimeoutMs?: number;
    /** Receives every stdout/stderr line and every lifecycle message. */
    log: (line: string) => void;
    /** Called when the readiness line arrives, just before `start` resolves. */
    onReady?: () => void;
    /**
     * Called when the live process dies *after* a successful start — i.e. not a
     * stop/restart we initiated, and not a start failure (those report through
     * the `start` result). The service should surface this to the user; without
     * it, status indicators keep showing a process that is gone.
     */
    onUnexpectedExit?: (code: number | null) => void;
}

const DEFAULT_EXIT_TIMEOUT_MS = 5_000;

export class SidecarProcess {
    private proc: ChildProcessWithoutNullStreams | null = null;
    private runningFlag = false;
    private pendingStart: Promise<SidecarStartResult> | null = null;

    constructor(private readonly options: SidecarProcessOptions) {}

    /** True from the readiness line until the process stops or dies. */
    get isRunning(): boolean {
        return this.runningFlag;
    }

    /**
     * The in-flight start or restart, if any. Exposed so a service can *join*
     * an ongoing attempt instead of layering its own work on top of it —
     * e.g. a second "reconnect" click while the first restart is still waiting
     * for the old process to exit.
     */
    get pending(): Promise<SidecarStartResult> | null {
        return this.pendingStart;
    }

    /**
     * Start the sidecar. Resolves `{ success: true }` immediately when already
     * running, joins an in-flight start/restart when one is pending, and never
     * rejects — failures come back as `{ success: false, error }`.
     */
    start(
        exe: string,
        args: string[],
        spawnOptions?: SpawnOptionsWithoutStdio,
    ): Promise<SidecarStartResult> {
        if (this.runningFlag) return Promise.resolve({ success: true });
        if (this.pendingStart) return this.pendingStart;
        return this.track(this.spawnAndAwaitReady(exe, args, spawnOptions));
    }

    /**
     * Stop the current process (waiting for it to be reaped) and start a fresh
     * one. The pending promise is registered synchronously, before the first
     * await — that is what lets two concurrent restart callers share one
     * attempt instead of both passing a `pending` check and spawning two
     * daemons against the same on-disk state.
     */
    restart(
        exe: string,
        args: string[],
        spawnOptions?: SpawnOptionsWithoutStdio,
    ): Promise<SidecarStartResult> {
        if (this.pendingStart) return this.pendingStart;
        return this.track(
            (async () => {
                await this.stopAndWait();
                return this.spawnAndAwaitReady(exe, args, spawnOptions);
            })(),
        );
    }

    /**
     * Kill the process without waiting for it to exit.
     * Returns whether it was running (past readiness) — the caller's cue to
     * broadcast a "stopped" status only when there was something to stop.
     */
    stop(): boolean {
        if (this.proc) {
            this.options.log(`Stopping ${this.options.name} process...`);
            try {
                this.proc.kill();
            } catch {
                // Process may already be dead.
            }
            // Nulled synchronously so this process's later `close` event fails
            // the stale-child guard and cannot fire onUnexpectedExit.
            this.proc = null;
        }
        const wasRunning = this.runningFlag;
        this.runningFlag = false;
        return wasRunning;
    }

    /**
     * Kill the process and wait for the OS to reap it, capped at
     * `exitTimeoutMs`. Needed before a respawn whenever the sidecar holds
     * exclusive on-disk state (Tor's DataDirectory lock file): spawning the
     * replacement while the old process still holds it fails. On timeout we
     * proceed anyway and let the spawn failure surface as a normal error
     * rather than deadlocking the restart. Returns the same flag as `stop`.
     */
    stopAndWait(): Promise<boolean> {
        const proc = this.proc;
        if (!proc) return Promise.resolve(this.stop());

        const exited = new Promise<void>((resolve) => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                resolve();
            };
            const timer = setTimeout(() => {
                this.options.log(
                    `${this.options.name} did not exit in time; continuing anyway.`,
                );
                finish();
            }, this.options.exitTimeoutMs ?? DEFAULT_EXIT_TIMEOUT_MS);
            proc.once("close", finish);
            proc.once("exit", finish);
        });

        const wasRunning = this.stop();
        return exited.then(() => wasRunning);
    }

    /** Register `p` as the pending attempt and clear it once settled. */
    private track(p: Promise<SidecarStartResult>): Promise<SidecarStartResult> {
        const tracked = p.finally(() => {
            if (this.pendingStart === tracked) this.pendingStart = null;
        });
        this.pendingStart = tracked;
        return tracked;
    }

    private spawnAndAwaitReady(
        exe: string,
        args: string[],
        spawnOptions?: SpawnOptionsWithoutStdio,
    ): Promise<SidecarStartResult> {
        return new Promise((resolve) => {
            const { name, log } = this.options;
            log(`Starting ${name}: ${exe}${args.length ? " " + args.join(" ") : ""}`);

            let proc: ChildProcessWithoutNullStreams;
            try {
                proc = spawn(exe, args, spawnOptions);
            } catch (err) {
                const msg = `Failed to spawn ${path.basename(exe)}: ${errMessage(err)}`;
                log(msg);
                resolve({ success: false, error: msg });
                return;
            }

            this.proc = proc;
            let settled = false;
            let ready = false;

            const finish = (result: SidecarStartResult): void => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(result);
            };

            const timer = setTimeout(() => {
                if (settled) return;
                const msg =
                    this.options.timeoutMessage ??
                    `${name} did not become ready within ${Math.round(this.options.readinessTimeoutMs / 1000)} s`;
                log(msg);
                this.stop();
                finish({ success: false, error: msg });
            }, this.options.readinessTimeoutMs);

            proc.stdout.on("data", (data: Buffer) => {
                for (const rawLine of data.toString().split(/\r?\n/)) {
                    const line = rawLine.trim();
                    if (!line) continue;
                    log(line);
                    if (!settled && !ready && this.options.isReady(line)) {
                        ready = true;
                        this.runningFlag = true;
                        log(`${name} is ready.`);
                        this.options.onReady?.();
                        finish({ success: true });
                    }
                }
            });

            proc.stderr.on("data", (data: Buffer) => {
                const text = data.toString().trim();
                if (text) log(text);
            });

            proc.on("error", (err) => {
                const msg = `${name} process error: ${err.message}`;
                log(msg);
                if (this.proc === proc) this.runningFlag = false;
                finish({ success: false, error: msg });
            });

            proc.on("close", (code) => {
                log(`${name} process exited with code ${code}`);
                // Only clear shared state if this child is still the live one.
                // `restart` kills the old process and spawns a replacement; the
                // old child's close event arrives after the new one is already
                // assigned, so an unguarded reset here would null out a healthy
                // process and leave `isRunning` false while the sidecar is
                // actually up. `stop` and `restart` both null out `this.proc`
                // synchronously, so their own close events land here with
                // `wasCurrent` false — which is what makes a current, ready
                // child's close an *unexpected* death.
                const wasCurrent = this.proc === proc;
                if (wasCurrent) {
                    this.runningFlag = false;
                    this.proc = null;
                }
                if (!settled) {
                    finish({
                        success: false,
                        error: `${name} exited with code ${code}`,
                    });
                    return;
                }
                if (wasCurrent && ready) {
                    this.options.onUnexpectedExit?.(code);
                }
            });
        });
    }
}

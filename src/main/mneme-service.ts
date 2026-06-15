/**
 * Main process Mneme service.
 *
 * Manages the `mneme.exe` knowledge-base sidecar (one child process), Tor-style:
 * spawn → wait for the stdout readiness line (`listening on <bind>:<port>`) →
 * graceful shutdown. Persephone assigns the port via `--port` and passes a stable
 * `--config` path so roots added at runtime (via MCP `add_root`) persist
 * across restarts. There is no auto-restart — an unexpected exit broadcasts an
 * error so the renderer can toast it.
 */
import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import path from "path";
import fs from "fs";
import { app } from "electron";
import { openWindows } from "./open-windows";
import { EventEndpoint, MnemeStatus } from "../ipc/api-types";

const DEFAULT_PORT = 7700;
const READINESS_TIMEOUT_MS = 20_000;

let child: ChildProcessWithoutNullStreams | null = null;
let running = false;
let currentPort = DEFAULT_PORT;
let startPromise: Promise<MnemeStatus> | null = null;

function getMnemeExePath(): string {
    if (app.isPackaged) {
        return path.join(path.dirname(process.execPath), "mneme.exe");
    }
    return path.join(__dirname, "../../mneme/target/release/mneme.exe");
}

/**
 * Stable config path under the Persephone data dir, aligned with the model cache
 * (`<userData>/data/mneme/models`). mneme persists runtime root changes here.
 */
function getMnemeConfigPath(): string {
    return path.join(app.getPath("userData"), "data", "mneme", "mneme.toml");
}

function log(line: string): void {
    console.log(`[Mneme] ${line}`);
}

export function getMnemeUrl(): string {
    return `http://localhost:${currentPort}/mcp`;
}

export function isMnemeRunning(): boolean {
    return running;
}

export function getMnemeStatus(): MnemeStatus {
    return { running, url: getMnemeUrl() };
}

function broadcastMnemeStatus(error?: string): void {
    openWindows.send(EventEndpoint.eMnemeStatusChanged, {
        running,
        url: getMnemeUrl(),
        ...(error ? { error } : {}),
    });
}

export function startMneme(port?: number): Promise<MnemeStatus> {
    if (running) return Promise.resolve(getMnemeStatus());
    if (startPromise) return startPromise;

    currentPort = port ?? DEFAULT_PORT;
    const exe = getMnemeExePath();
    const configPath = getMnemeConfigPath();

    // Ensure the config dir exists so mneme can persist roots there.
    try {
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
    } catch {
        // Non-fatal — mneme also creates it on first save.
    }

    startPromise = new Promise<MnemeStatus>((resolve) => {
        log(`Starting Mneme: ${exe} serve --port ${currentPort} --config ${configPath}`);

        let proc: ChildProcessWithoutNullStreams;
        try {
            proc = spawn(
                exe,
                ["serve", "--port", String(currentPort), "--config", configPath],
                { windowsHide: true },
            );
        } catch (err) {
            const msg = `Failed to spawn mneme.exe: ${err.message}`;
            log(msg);
            startPromise = null;
            resolve({ running: false, url: getMnemeUrl(), error: msg });
            return;
        }

        child = proc;

        let settled = false;
        const timer = setTimeout(() => {
            log("Mneme readiness timed out (20 s)");
            stopMneme();
            finish({ running: false, url: getMnemeUrl(), error: "Mneme did not become ready within 20 s" });
        }, READINESS_TIMEOUT_MS);

        const finish = (status: MnemeStatus): void => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            startPromise = null;
            resolve(status);
        };

        proc.stdout.on("data", (data: Buffer) => {
            for (const line of data.toString().split(/\r?\n/)) {
                const text = line.trim();
                if (!text) continue;
                log(text);
                if (!settled && text.startsWith("listening on")) {
                    running = true;
                    broadcastMnemeStatus();
                    finish(getMnemeStatus());
                }
            }
        });

        proc.stderr.on("data", (data: Buffer) => {
            const text = data.toString().trim();
            if (text) log(text);
        });

        proc.on("error", (err) => {
            const msg = `Mneme process error: ${err.message}`;
            log(msg);
            finish({ running: false, url: getMnemeUrl(), error: msg });
        });

        proc.on("close", (code) => {
            log(`Mneme process exited with code ${code}`);
            // Ignore the close of a process we've already replaced (e.g. during a
            // restart) — only the current child drives module state.
            if (child !== proc && settled) return;
            const wasRunning = running;
            running = false;
            child = null;
            if (!settled) {
                // Exited before readiness — a start failure.
                finish({ running: false, url: getMnemeUrl(), error: `Mneme exited with code ${code}` });
            } else if (wasRunning) {
                // Unexpected crash after a successful start — toast via broadcast.
                broadcastMnemeStatus(`Mneme stopped unexpectedly (exit code ${code})`);
            }
        });
    });

    return startPromise;
}

export function stopMneme(): void {
    if (child) {
        log("Stopping Mneme process...");
        try {
            child.kill();
        } catch {
            // Process may already be dead.
        }
        child = null;
    }
    const wasRunning = running;
    running = false;
    if (wasRunning) broadcastMnemeStatus();
}

/** Stop the running process and resolve once it has actually exited (so a
 *  subsequent start spawns cleanly). Safety-capped at 5 s. */
function stopMnemeAndWait(): Promise<void> {
    const proc = child;
    if (!proc) {
        stopMneme();
        return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
            if (done) return;
            done = true;
            resolve();
        };
        proc.once("close", finish);
        stopMneme();
        setTimeout(finish, 5_000);
    });
}

/** Restart the sidecar: stop the current process (waiting for it to exit), then
 *  start a fresh one. Used to recover from a wedged MCP session or a crash. */
export async function restartMneme(port?: number): Promise<MnemeStatus> {
    const targetPort = port ?? currentPort;
    log("Restarting Mneme...");
    await stopMnemeAndWait();
    return startMneme(targetPort);
}

export function shutdownMneme(): void {
    stopMneme();
}

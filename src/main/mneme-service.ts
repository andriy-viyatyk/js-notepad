/**
 * Main process Mneme service.
 *
 * Manages the `mneme.exe` knowledge-base sidecar (one child process) via the
 * shared `SidecarProcess` lifecycle: spawn → wait for the stdout readiness line
 * (`listening on <bind>:<port>`) → graceful shutdown. Persephone assigns the
 * port via `--port` and passes a stable `--config` path so roots added at
 * runtime (via MCP `add_root`) persist across restarts. There is no
 * auto-restart — an unexpected exit broadcasts an error so the renderer can
 * toast it.
 */
import path from "path";
import fs from "fs";
import { app } from "electron";
import { openWindows } from "./open-windows";
import { EventEndpoint, MnemeStatus } from "../ipc/api-types";
import { SidecarProcess, SidecarStartResult } from "./sidecar-process";

const DEFAULT_PORT = 7700;
const READINESS_TIMEOUT_MS = 20_000;

let currentPort = DEFAULT_PORT;

const sidecar = new SidecarProcess({
    name: "Mneme",
    isReady: (line) => line.startsWith("listening on"),
    readinessTimeoutMs: READINESS_TIMEOUT_MS,
    log,
    onReady: () => broadcastMnemeStatus(),
    onUnexpectedExit: (code) =>
        broadcastMnemeStatus(`Mneme stopped unexpectedly (exit code ${code})`),
});

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
    // Use 127.0.0.1, not "localhost" — mneme binds IPv4 loopback only. On Windows
    // Chromium resolves "localhost" to ::1 (IPv6) first and, finding nothing there,
    // hangs the renderer's fetch-based MCP transport until timeout instead of failing
    // over to IPv4. Addressing the bound IPv4 directly avoids the stall entirely.
    return `http://127.0.0.1:${currentPort}/mcp`;
}

export function isMnemeRunning(): boolean {
    return sidecar.isRunning;
}

export function getMnemeStatus(): MnemeStatus {
    return { running: sidecar.isRunning, url: getMnemeUrl() };
}

function broadcastMnemeStatus(error?: string): void {
    openWindows.send(EventEndpoint.eMnemeStatusChanged, {
        running: sidecar.isRunning,
        url: getMnemeUrl(),
        ...(error ? { error } : {}),
    });
}

function toStatus(result: SidecarStartResult): MnemeStatus {
    return result.success
        ? getMnemeStatus()
        : { running: false, url: getMnemeUrl(), error: result.error };
}

export function startMneme(port?: number): Promise<MnemeStatus> {
    if (sidecar.isRunning) return Promise.resolve(getMnemeStatus());

    // Join an in-flight start before touching `currentPort` — the pending
    // attempt is bound to the port it spawned with, and mutating the module
    // state under it would make `getMnemeUrl` lie about where it listens.
    const pending = sidecar.pending;
    if (pending) return pending.then(toStatus);

    currentPort = port ?? DEFAULT_PORT;
    const configPath = getMnemeConfigPath();

    // Ensure the config dir exists so mneme can persist roots there.
    try {
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
    } catch {
        // Non-fatal — mneme also creates it on first save.
    }

    return sidecar
        .start(
            getMnemeExePath(),
            ["serve", "--port", String(currentPort), "--config", configPath],
            { windowsHide: true },
        )
        .then(toStatus);
}

export function stopMneme(): void {
    if (sidecar.stop()) broadcastMnemeStatus();
}

/** Stop the running process and resolve once it has actually exited (so a
 *  subsequent start spawns cleanly). Safety-capped inside the sidecar. */
async function stopMnemeAndWait(): Promise<void> {
    if (await sidecar.stopAndWait()) broadcastMnemeStatus();
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

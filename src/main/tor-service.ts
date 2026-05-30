/**
 * Main process Tor service.
 *
 * Manages a single tor.exe child process shared across all Tor browser
 * partitions. Starts lazily when the first Tor page opens, stops when the
 * last Tor page closes. Each Tor page gets its own ephemeral Electron
 * session with a SOCKS5h proxy pointing to the local Tor daemon.
 */
import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import path from "path";
import fs from "fs";
import { app, BrowserWindow, ipcMain, session } from "electron";
import { TorChannel } from "../ipc/tor-ipc";

const TOR_BOOTSTRAP_TIMEOUT_MS = 90_000;

class TorService {
    private torProcess: ChildProcessWithoutNullStreams | null = null;
    private activePartitions = new Set<string>();
    private startPromise: Promise<{ success: boolean; error?: string }> | null = null;
    private socksPort = 9050;
    private running = false;

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    async startForPartition(
        torExePath: string,
        socksPort: number,
        partition: string,
    ): Promise<{ success: boolean; error?: string }> {
        this.activePartitions.add(partition);
        this.socksPort = socksPort;

        // Tor already running — just configure the new partition
        if (this.running) {
            await this.setProxyForPartition(partition);
            return { success: true };
        }

        // Tor is currently starting — wait for it, then configure partition
        if (this.startPromise) {
            const result = await this.startPromise;
            if (result.success) {
                await this.setProxyForPartition(partition);
            } else {
                this.activePartitions.delete(partition);
            }
            return result;
        }

        // Start Tor
        this.startPromise = this.startTorProcess(torExePath, socksPort);
        const result = await this.startPromise;
        this.startPromise = null;

        if (result.success) {
            await this.setProxyForPartition(partition);
        } else {
            this.activePartitions.delete(partition);
        }
        return result;
    }

    async stopForPartition(partition: string): Promise<void> {
        await this.clearProxyForPartition(partition);
        this.activePartitions.delete(partition);

        if (this.activePartitions.size === 0) {
            this.stopTorProcess();
        }
    }

    shutdown(): void {
        this.stopTorProcess();
        this.activePartitions.clear();
    }

    // -------------------------------------------------------------------------
    // Tor process lifecycle
    // -------------------------------------------------------------------------

    private startTorProcess(
        torExePath: string,
        socksPort: number,
    ): Promise<{ success: boolean; error?: string }> {
        return new Promise((resolve) => {
            const torrcPath = this.ensureTorrc(socksPort);
            this.broadcastLog(`Starting Tor: ${torExePath}`);
            this.broadcastLog(`Using torrc: ${torrcPath}`);

            let child: ChildProcessWithoutNullStreams;
            try {
                child = spawn(torExePath, ["-f", torrcPath]);
            } catch (err) {
                const msg = `Failed to spawn tor.exe: ${err.message}`;
                this.broadcastLog(msg);
                resolve({ success: false, error: msg });
                return;
            }

            this.torProcess = child;
            let resolved = false;

            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    const msg = "Tor bootstrap timed out (90 s)";
                    this.broadcastLog(msg);
                    this.stopTorProcess();
                    resolve({ success: false, error: msg });
                }
            }, TOR_BOOTSTRAP_TIMEOUT_MS);

            child.stdout.on("data", (data: Buffer) => {
                const text = data.toString().trim();
                if (text) this.broadcastLog(text);

                if (!resolved && text.includes("Bootstrapped 100%")) {
                    resolved = true;
                    clearTimeout(timeout);
                    this.running = true;
                    this.broadcastLog("Tor is ready.");
                    resolve({ success: true });
                }
            });

            child.stderr.on("data", (data: Buffer) => {
                const text = data.toString().trim();
                if (text) this.broadcastLog(text);
            });

            child.on("error", (err) => {
                const msg = `Tor process error: ${err.message}`;
                this.broadcastLog(msg);
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    resolve({ success: false, error: msg });
                }
            });

            child.on("close", (code) => {
                this.broadcastLog(`Tor process exited with code ${code}`);
                this.running = false;
                this.torProcess = null;
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    resolve({ success: false, error: `Tor exited with code ${code}` });
                }
            });
        });
    }

    private stopTorProcess(): void {
        if (this.torProcess) {
            this.broadcastLog("Stopping Tor process...");
            try {
                this.torProcess.kill();
            } catch {
                // Process may already be dead
            }
            this.torProcess = null;
            this.running = false;
        }
    }

    // -------------------------------------------------------------------------
    // torrc generation
    // -------------------------------------------------------------------------

    private ensureTorrc(socksPort: number): string {
        const torDir = path.join(app.getPath("userData"), "tor");
        const torrcPath = path.join(torDir, "torrc");
        const dataDir = path.join(torDir, "data");

        if (!fs.existsSync(torDir)) {
            fs.mkdirSync(torDir, { recursive: true });
        }
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // Only generate if not exists — user may have customized it
        if (!fs.existsSync(torrcPath)) {
            const content = [
                `SocksPort ${socksPort}`,
                `DataDirectory ${dataDir.replace(/\\/g, "/")}`,
            ].join("\n");
            fs.writeFileSync(torrcPath, content, "utf-8");
        }

        return torrcPath;
    }

    // -------------------------------------------------------------------------
    // Session proxy management
    // -------------------------------------------------------------------------

    private async setProxyForPartition(partition: string): Promise<void> {
        const ses = session.fromPartition(partition);
        await ses.setProxy({
            proxyRules: `socks5://127.0.0.1:${this.socksPort}`,
            proxyBypassRules: "",
        });
        await ses.closeAllConnections();
    }

    private async clearProxyForPartition(partition: string): Promise<void> {
        try {
            const ses = session.fromPartition(partition);
            await ses.setProxy({ proxyRules: "" });
            await ses.closeAllConnections();
        } catch {
            // Partition session may already be destroyed
        }
    }

    // -------------------------------------------------------------------------
    // Log broadcasting
    // -------------------------------------------------------------------------

    private broadcastLog(line: string): void {
        console.log(`[Tor] ${line}`);
        for (const win of BrowserWindow.getAllWindows()) {
            try {
                if (!win.isDestroyed()) {
                    win.webContents.send(TorChannel.log, line);
                }
            } catch {
                // Window may be closing
            }
        }
    }
}

// ── Singleton & IPC Registration ────────────────────────────────────────────

const torService = new TorService();

export function initTorHandlers(): void {
    ipcMain.handle(
        TorChannel.start,
        async (
            _event,
            torExePath: string,
            socksPort: number,
            partition: string,
        ) => {
            return torService.startForPartition(torExePath, socksPort, partition);
        },
    );

    ipcMain.handle(TorChannel.stop, async (_event, partition: string) => {
        return torService.stopForPartition(partition);
    });
}

export { torService };

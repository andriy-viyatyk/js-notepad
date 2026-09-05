/**
 * Main process Tor service.
 *
 * Manages a single tor.exe child process shared across all Tor browser
 * partitions. Starts lazily when the first Tor page opens, stops when the
 * last Tor page closes. Each Tor page gets its own ephemeral Electron
 * session with a SOCKS5h proxy pointing to the local Tor daemon.
 */
import path from "path";
import fs from "fs";
import { app, BrowserWindow, ipcMain, session } from "electron";
import { TorChannel, TorIpInfo, TorStatus } from "../ipc/tor-ipc";
import { SidecarProcess } from "./sidecar-process";
import { errMessage } from "../shared/utils";

const TOR_BOOTSTRAP_TIMEOUT_MS = 90_000;

/** Cap on the exit-IP lookup. Tor is slow, but a hung request must not hang the dialog. */
const LOOKUP_TIMEOUT_MS = 20_000;

/**
 * Tighter cap per geo provider. They are tried in sequence, so sharing the
 * 20 s budget would let two slow providers alone leave the dialog spinning for
 * 40 s. Location is optional — failing fast is better than blocking on it.
 */
const GEO_TIMEOUT_MS = 8_000;

/** How long to wait for a killed tor.exe to be reaped before spawning its replacement. */
const PROCESS_EXIT_TIMEOUT_MS = 5_000;

/**
 * Run by the Tor Project itself: never blocks Tor exits, and reports whether the
 * request really arrived over Tor — a stronger signal than the IP alone.
 */
const TOR_CHECK_URL = "https://check.torproject.org/api/ip";

/** Geo providers, tried in order. Both are keyless and HTTPS-only. */
const GEO_URLS = [
    "https://ipinfo.io/json",
    "https://freeipapi.com/api/json",
];

class TorService {
    private activePartitions = new Set<string>();
    /**
     * Shared by every partition, and written by both `armPartition` and
     * `startForPartition`. That is sound only because `tor.socks-port` is a single
     * global setting feeding a single shared daemon — a caller awaiting a start can
     * read a value another caller wrote in the meantime, but it is the same value.
     * Per-partition ports would need a `Map<partition, port>` instead.
     */
    private socksPort = 9050;
    /** Retained so `restart()` can respawn without the renderer re-supplying it. */
    private torExePath = "";

    private sidecar = new SidecarProcess({
        name: "Tor",
        isReady: (line) => line.includes("Bootstrapped 100%"),
        readinessTimeoutMs: TOR_BOOTSTRAP_TIMEOUT_MS,
        timeoutMessage: "Tor bootstrap timed out (90 s)",
        exitTimeoutMs: PROCESS_EXIT_TIMEOUT_MS,
        log: (line) => this.broadcastLog(line),
        // Died after bootstrapping. Without this broadcast the page keeps a
        // green dot while Tor is gone — requests fail closed, but the user has
        // no way to know short of opening the info dialog.
        onUnexpectedExit: (code) =>
            this.broadcastStatus("error", `Tor exited with code ${code}`),
    });

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Point `partition` at the SOCKS port before the daemon exists, so the
     * partition fails closed from the moment it is created.
     *
     * Chromium treats a proxy-less session as DIRECT, so without this every Tor
     * page leaks whatever loads while the daemon is still bootstrapping — and
     * everything, forever, if the bootstrap fails. Arming makes that window
     * surface as ERR_SOCKS_CONNECTION_FAILED instead.
     *
     * Deliberately does **not** touch `activePartitions`: that set (via
     * `isActiveTorPartition`) answers "is this a live, bootstrapped Tor session?"
     * for `tor-src://` and `checkIp`, and an armed partition is not one yet.
     */
    async armPartition(socksPort: number, partition: string): Promise<void> {
        this.socksPort = socksPort;
        await this.setProxyForPartition(partition);
    }

    async startForPartition(
        torExePath: string,
        socksPort: number,
        partition: string,
    ): Promise<{ success: boolean; error?: string }> {
        this.activePartitions.add(partition);
        this.socksPort = socksPort;
        this.torExePath = torExePath;

        // Tor already running — just configure the new partition
        if (this.sidecar.isRunning) {
            await this.setProxyForPartition(partition);
            return { success: true };
        }

        // Starts Tor, or joins an in-flight start/restart if one is pending —
        // either way the outcome is applied to this caller's partition.
        const result = await this.sidecar.start(torExePath, [
            "-f",
            this.ensureTorrc(socksPort),
        ]);
        return this.settleStart(result, partition);
    }

    /**
     * Apply the outcome of a start attempt to `partition`.
     *
     * The proxy is (re-)applied on **both** outcomes. On success that is what
     * puts traffic on Tor; on failure it is what keeps the partition failing
     * closed — the invariant must hold even for a caller that never armed, such
     * as a reconnect after `stopForPartition` cleared the proxy.
     */
    private async settleStart(
        result: { success: boolean; error?: string },
        partition: string,
    ): Promise<{ success: boolean; error?: string }> {
        if (!result.success) {
            this.activePartitions.delete(partition);
            // The attempt already failed; a session that has gone away too must
            // not turn that into a rejected invoke. Logged rather than swallowed
            // silently, because a partition we could not proxy is a leak risk.
            try {
                await this.setProxyForPartition(partition);
            } catch (err) {
                this.broadcastLog(
                    `Could not apply the fail-closed proxy to ${partition}: ${errMessage(err)}`,
                );
            }
            return result;
        }

        await this.setProxyForPartition(partition);
        return result;
    }

    async stopForPartition(partition: string): Promise<void> {
        await this.clearProxyForPartition(partition);
        this.activePartitions.delete(partition);

        if (this.activePartitions.size === 0) {
            this.sidecar.stop();
        }
    }

    shutdown(): void {
        this.sidecar.stop();
        this.activePartitions.clear();
    }

    /**
     * True only while `partition` belongs to a live, bootstrapped Tor page.
     * Gates the `tor-src://` handler (US-896) so the scheme is inert whenever no
     * Tor page is running — do not relax this to a plain `activePartitions` check.
     */
    isActiveTorPartition(partition: string): boolean {
        return this.sidecar.isRunning && this.activePartitions.has(partition);
    }

    getStatus(): {
        running: boolean;
        pending: boolean;
        activePartitionCount: number;
        activePartitions: string[];
        socksPort: number;
        torExeConfigured: boolean;
    } {
        return {
            running: this.sidecar.isRunning,
            pending: this.sidecar.pending !== null,
            activePartitionCount: this.activePartitions.size,
            activePartitions: [...this.activePartitions],
            socksPort: this.socksPort,
            torExeConfigured: !!this.torExePath,
        };
    }

    /**
     * Restart tor.exe so fresh circuits — and normally a new exit node — are
     * used, then re-apply the proxy to every active partition (US-897).
     *
     * The daemon is shared, so this affects all open Tor pages, not just
     * `partition`. Status is broadcast so their indicators stay honest.
     */
    async restart(partition: string): Promise<{ success: boolean; error?: string }> {
        if (!this.isActiveTorPartition(partition)) {
            return { success: false, error: "No live Tor session for this page." };
        }
        if (!this.torExePath) {
            return { success: false, error: "Tor executable path is not configured." };
        }

        // A start or another restart is already in flight — join it rather than
        // spawning a second daemon onto the same DataDirectory. The sidecar
        // registers its pending promise synchronously, so two concurrent
        // callers cannot both get past this check while the first is awaiting
        // the old process's exit. A joiner may resolve before the initiating
        // call has re-applied proxies and broadcast the final status — that is
        // safe: the initiator still does both, and the joiner's result value
        // is identical.
        const pending = this.sidecar.pending;
        if (pending) {
            return pending;
        }

        return this.runRestart();
    }

    private async runRestart(): Promise<{ success: boolean; error?: string }> {
        this.broadcastStatus("connecting");
        this.broadcastLog("Reconnecting: restarting Tor...");

        // Tor holds a `lock` file inside DataDirectory; spawning a replacement
        // while the old process still holds it fails with "Could not lock data
        // directory", so the sidecar's restart waits for the exit first.
        let result: { success: boolean; error?: string };
        try {
            result = await this.sidecar.restart(this.torExePath, [
                "-f",
                this.ensureTorrc(this.socksPort),
            ]);
        } catch (err) {
            result = { success: false, error: errMessage(err) };
        }

        if (result.success) {
            // Re-apply to every partition, not just the caller — they all lost
            // their proxy with the old process. setProxyForPartition also closes
            // existing connections, which is what forces sockets off retired
            // circuits instead of letting keep-alives outlive the restart.
            await Promise.all(
                [...this.activePartitions].map((p) => this.setProxyForPartition(p)),
            );
            this.broadcastLog("Tor reconnected.");
        }

        this.broadcastStatus(result.success ? "connected" : "error", result.error);
        return result;
    }

    /**
     * Look up what the outside world sees for this Tor session: the exit IP,
     * whether traffic really is exiting through Tor, and an approximate location.
     *
     * Runs in main because the SOCKS proxy is bound to the page's session
     * partition — a renderer-side fetch would go out unproxied and hand the
     * checker the user's real IP, defeating the purpose.
     *
     * Never rejects: failures are reported in the returned `error`.
     */
    async checkIp(partition: string): Promise<TorIpInfo> {
        if (!this.isActiveTorPartition(partition)) {
            return { ip: "", isTor: null, error: "No live Tor session for this page." };
        }

        const ses = session.fromPartition(partition);
        const info: TorIpInfo = { ip: "", isTor: null };

        try {
            const res = await ses.fetch(TOR_CHECK_URL, {
                cache: "no-store",
                signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json() as { IP?: string; IsTor?: boolean };
            info.ip = typeof data.IP === "string" ? data.IP : "";
            info.isTor = typeof data.IsTor === "boolean" ? data.IsTor : null;
        } catch (err) {
            info.error = `Could not reach check.torproject.org: ${errMessage(err)}`;
        }

        // Geo is a bonus — a dead or rate-limiting provider must still leave the
        // IP visible, so failures here never touch `info.error`.
        for (const url of GEO_URLS) {
            try {
                const res = await ses.fetch(url, {
                    cache: "no-store",
                    signal: AbortSignal.timeout(GEO_TIMEOUT_MS),
                });
                if (!res.ok) continue;
                const data = await res.json() as Record<string, unknown>;
                const geo = normalizeGeo(data);
                if (!geo) continue;
                Object.assign(info, geo);
                info.geoSource = new URL(url).hostname;
                if (!info.ip && geo.ip) info.ip = geo.ip;
                break;
            } catch {
                // Try the next provider.
            }
        }

        if (!info.ip && !info.error) {
            info.error = "Could not determine the exit IP address.";
        }
        return info;
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

    /**
     * Push a status change to every window (US-897). Only `restart()` uses this;
     * the initial start still reports through its invoke result.
     */
    private broadcastStatus(status: TorStatus, error?: string): void {
        for (const win of BrowserWindow.getAllWindows()) {
            try {
                if (!win.isDestroyed()) {
                    win.webContents.send(TorChannel.status, { status, error });
                }
            } catch {
                // Window may be closing
            }
        }
    }

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

// ── Geo response normalization ──────────────────────────────────────────────

/** Read `key` from an untrusted JSON object, but only when it is a non-empty string. */
function str(data: Record<string, unknown>, key: string): string | undefined {
    const value = data[key];
    return typeof value === "string" && value ? value : undefined;
}

/**
 * Fold one geo provider's response into `TorIpInfo` fields. Handles the two
 * shapes we call: ipinfo.io (`ip`/`city`/`region`/`country`/`org`, country as a
 * 2-letter code) and freeipapi.com (`ipAddress`/`cityName`/`regionName`/
 * `countryName`, country as a full name).
 *
 * Returns null when the payload carries no location at all, so the caller falls
 * through to the next provider instead of stopping on an empty answer.
 */
function normalizeGeo(data: Record<string, unknown>): Partial<TorIpInfo> | null {
    const geo: Partial<TorIpInfo> = {
        ip: str(data, "ip") ?? str(data, "ipAddress"),
        city: str(data, "city") ?? str(data, "cityName"),
        region: str(data, "region") ?? str(data, "regionName"),
        country: str(data, "country") ?? str(data, "countryName"),
        org: str(data, "org"),
    };
    if (!geo.city && !geo.region && !geo.country) return null;
    return geo;
}

// ── Singleton & IPC Registration ────────────────────────────────────────────

const torService = new TorService();

export function initTorHandlers(): void {
    ipcMain.handle(
        TorChannel.arm,
        async (_event, socksPort: number, partition: string) => {
            return torService.armPartition(socksPort, partition);
        },
    );

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

    ipcMain.handle(TorChannel.checkIp, async (_event, partition: string) => {
        return torService.checkIp(partition);
    });

    ipcMain.handle(TorChannel.restart, async (_event, partition: string) => {
        return torService.restart(partition);
    });
}

export { torService };

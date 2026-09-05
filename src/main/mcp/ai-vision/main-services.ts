import { app } from "electron";
import { getMcpClientCount, getMcpSessionSnapshots, getMcpUrl, isMcpHttpServerRunning } from "../../mcp-http-server";
import { getBoardDownloadSnapshot, cancelBoardDownload } from "../../board-download-service";
import { getBoardRegistrationSnapshot } from "../../board-protocol-service";
import { downloadService } from "../../download-service";
import { getNetworkLogMetadata, getNetworkLogSnapshot, clearNetworkLog } from "../../network-logger";
import { getRuntimeVersions, getAppVersion } from "../../version-service";
import { torService } from "../../tor-service";
import { getAppRootPath, getAssetPath } from "../../utils";
import { IAiChild, IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";
import { MAIN_SCRIPT_DISABLED_MESSAGE, isMainScriptsEnabled } from "./main-script-gate";
import { executeMainScript, MAIN_SCRIPT_TIMEOUT_MS } from "./main-script";
import type { WindowsNode } from "./main-root";

const CAUTION_TOR_RESTART = "restarts the shared Tor daemon and disrupts every active Tor browser partition; bootstrap can take up to 90 seconds.";
const CAUTION_BOARD_CANCEL = "aborts the board archive download and removes its partial ZIP.";
const CAUTION_NETWORK_CLEAR = "irreversibly clears the selected in-memory network log.";
const CAUTION_SCRIPT = "main-process code has a larger blast radius; it can freeze or terminate the whole app.";
const CAUTION_SCRIPT_TIMEOUT = "a synchronous infinite loop blocks the main event loop and cannot be interrupted by the timeout; it freezes every window until the code returns or the process is killed.";

const MAIN_MEMBERS: readonly IAiMember[] = [
    { name: "windows", kind: "property", node: true, summary: "The same live window collection exposed at the root windows path." },
    { name: "mcp", kind: "property", node: true, summary: "MCP HTTP server state and bounded session metadata." },
    { name: "tor", kind: "property", node: true, summary: "Shared Tor daemon status and partition-scoped restart." },
    { name: "boards", kind: "property", node: true, summary: "Board protocol registrations and archive downloads." },
    { name: "downloads", kind: "property", node: true, summary: "Read-only download manager snapshots; use renderer downloads.* to change them." },
    { name: "networkLog", kind: "property", node: true, summary: "Bounded browser network metadata by registration key." },
    { name: "runtime", kind: "property", node: true, summary: "Bounded application, runtime, path, uptime, and memory diagnostics." },
    { name: "script", kind: "property", node: true, summary: "Settings-gated main-process script execution." },
];

const MCP_MEMBERS: readonly IAiMember[] = [
    { name: "running", kind: "property", summary: "Whether the MCP HTTP server is running." },
    { name: "url", kind: "property", summary: "The loopback MCP endpoint URL." },
    { name: "clientCount", kind: "property", summary: "Number of active MCP sessions." },
    { name: "sessions", kind: "property", summary: "Bounded session metadata in map order: ordinal, eight-character idPrefix, lastActivity, and idleMs." },
];

const TOR_MEMBERS: readonly IAiMember[] = [
    { name: "status", kind: "property", summary: "Running, pending, active partition, port, and executable-configuration status." },
    { name: "restart", kind: "method", signature: "restart(partition)", summary: "Restart the shared Tor daemon for an active partition.", caution: CAUTION_TOR_RESTART },
];

const BOARD_MEMBERS: readonly IAiMember[] = [
    { name: "protocol", kind: "property", summary: "Bounded live board protocol registrations." },
    { name: "downloads", kind: "property", node: true, summary: "In-flight board archive downloads and their install ids." },
];

const BOARD_DOWNLOAD_MEMBERS: readonly IAiMember[] = [
    { name: "activeCount", kind: "property", summary: "Number of in-flight board archive downloads." },
    { name: "installIds", kind: "property", summary: "Opaque install ids for in-flight board archive downloads." },
    { name: "cancel", kind: "method", signature: "cancel(installId)", summary: "Abort one in-flight board archive download.", caution: CAUTION_BOARD_CANCEL },
];

const DOWNLOAD_MEMBERS: readonly IAiMember[] = [
    { name: "getDownloads", kind: "method", signature: "getDownloads()", summary: "Return bounded download entries; use renderer downloads.* to cancel, open, reveal, or clear them." },
];

const NETWORK_MEMBERS: readonly IAiMember[] = [
    { name: "keys", kind: "property", summary: "Registered browser log keys with aggregate entry counts." },
    { name: "get", kind: "method", signature: "get(key, limit = 20)", summary: "Return recent bounded request metadata without headers or bodies.", caution: "URLs may contain query data from the visited site." },
    { name: "clear", kind: "method", signature: "clear(key)", summary: "Clear one in-memory page network log.", caution: CAUTION_NETWORK_CLEAR },
];

const RUNTIME_MEMBERS: readonly IAiMember[] = [
    { name: "appVersion", kind: "property", summary: "Persephone application version." },
    { name: "electron", kind: "property", summary: "Electron runtime version." },
    { name: "chrome", kind: "property", summary: "Chrome runtime version." },
    { name: "node", kind: "property", summary: "Node.js runtime version." },
    { name: "isPackaged", kind: "property", summary: "Whether this is a packaged application build." },
    { name: "appPath", kind: "property", summary: "Electron application root path." },
    { name: "resourcesDir", kind: "property", summary: "Main-owned application resources root path." },
    { name: "demoBoardDir", kind: "property", summary: "Bundled Demo board template directory; use it when creating a Demo board." },
    { name: "paths", kind: "property", summary: "Selected Electron application paths." },
    { name: "uptimeSeconds", kind: "property", summary: "Main-process uptime in seconds." },
    { name: "memoryUsage", kind: "property", summary: "Main-process memory usage scalars." },
];

const SCRIPT_MEMBERS: readonly IAiMember[] = [
    { name: "execute", kind: "method", signature: "execute(code)", summary: "Evaluate code in the main process and return a shaped result plus captured console logs.", caution: `${CAUTION_SCRIPT} ${CAUTION_SCRIPT_TIMEOUT}` },
];

const SCRIPT_HELP = `
main.script.execute(code) evaluates JavaScript in the main process. It is enabled by the
"Allow main-process scripts" checkbox in Settings → MCP Server and is on by default only in
development builds. The supplied scope names are electron, openWindows, torService,
downloadService, boardDownloadService, publishedBoardsService, boardProtocol, and networkLogger.
Expressions and await are supported; the result is shaped and returned with isError and
consoleLogs entries. The evaluation timeout is ${MAIN_SCRIPT_TIMEOUT_MS / 1000} seconds. A timeout
cannot cancel a JavaScript promise, so async work may still be running and side effects performed
before an exception or timeout remain performed. A synchronous while (true) loop blocks the main
event loop, defeats the timer, and freezes every window until the code returns or the process is killed.
`;

export class MainMcpNode implements IAiVisible {
    get running() { return isMcpHttpServerRunning(); }
    get url() { return getMcpUrl(); }
    get clientCount() { return getMcpClientCount(); }
    get sessions() { return getMcpSessionSnapshots(); }

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "MainMcp",
            summary: "MCP HTTP server state and bounded session metadata.",
            members: MCP_MEMBERS,
            summarize: () => ({ kind: "MainMcp", running: this.running, url: this.url, clientCount: this.clientCount }),
        };
    }
}

export class MainTorNode implements IAiVisible {
    get status() { return torService.getStatus(); }

    restart(partition: string) {
        if (!this.status.activePartitions.includes(partition)) {
            return Promise.resolve({ success: false, error: `No active Tor partition named "${partition}".` });
        }
        return torService.restart(partition);
    }

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "MainTor",
            summary: "Shared Tor daemon status and partition-scoped restart.",
            members: TOR_MEMBERS,
            help: "Read status first and pass one of its opaque activePartitions values to restart(partition).",
            summarize: () => ({ kind: "MainTor", ...this.status }),
        };
    }
}

export class MainBoardDownloadsNode implements IAiVisible {
    get activeCount() { return getBoardDownloadSnapshot().activeCount; }
    get installIds() { return getBoardDownloadSnapshot().installIds; }

    cancel(installId: string): { success: boolean; error?: string } {
        if (!this.installIds.includes(installId)) return { success: false, error: `No active board download named "${installId}".` };
        cancelBoardDownload(installId);
        return { success: true };
    }

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "MainBoardDownloads",
            summary: "In-flight board archive downloads.",
            members: BOARD_DOWNLOAD_MEMBERS,
            summarize: () => ({ kind: "MainBoardDownloads", ...getBoardDownloadSnapshot() }),
        };
    }
}

export class MainBoardsNode implements IAiVisible {
    readonly downloads = new MainBoardDownloadsNode();
    get protocol() { return getBoardRegistrationSnapshot(); }

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "MainBoards",
            summary: "Board protocol registrations and archive downloads.",
            members: BOARD_MEMBERS,
            summarize: () => ({ kind: "MainBoards", protocol: this.protocol, downloads: getBoardDownloadSnapshot() }),
        };
    }
}

export class MainDownloadsNode implements IAiVisible {
    getDownloads() { return downloadService.getDownloads(); }

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "MainDownloads",
            summary: "Read-only download manager snapshots.",
            members: DOWNLOAD_MEMBERS,
            help: "Use renderer downloads.cancelDownload(), openDownload(), showInFolder(), and clearCompleted() to change downloads.",
            summarize: () => ({ kind: "MainDownloads", downloads: this.getDownloads() }),
        };
    }
}

export class MainNetworkLogNode implements IAiVisible {
    get keys() { return getNetworkLogSnapshot().keys; }
    get(key: string, limit = 20) { return getNetworkLogMetadata(key, limit); }
    clear(key: string) { clearNetworkLog(key); return { ok: true }; }

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "MainNetworkLog",
            summary: "Bounded browser network metadata by registration key.",
            members: NETWORK_MEMBERS,
            summarize: () => ({ kind: "MainNetworkLog", keys: this.keys }),
        };
    }
}

export class MainRuntimeNode implements IAiVisible {
    get snapshot() {
        const versions = getRuntimeVersions();
        return {
            appVersion: getAppVersion(),
            ...versions,
            isPackaged: app.isPackaged,
            appPath: app.getAppPath(),
            resourcesDir: getAppRootPath(),
            demoBoardDir: getAssetPath("demo-board"),
            paths: {
                userData: app.getPath("userData"),
                appData: app.getPath("appData"),
                exe: app.getPath("exe"),
                temp: app.getPath("temp"),
                documents: app.getPath("documents"),
                downloads: app.getPath("downloads"),
            },
            uptimeSeconds: process.uptime(),
            memoryUsage: process.memoryUsage(),
        };
    }

    get appVersion() { return this.snapshot.appVersion; }
    get electron() { return this.snapshot.electron; }
    get chrome() { return this.snapshot.chrome; }
    get node() { return this.snapshot.node; }
    get isPackaged() { return this.snapshot.isPackaged; }
    get appPath() { return this.snapshot.appPath; }
    get resourcesDir() { return this.snapshot.resourcesDir; }
    get demoBoardDir() { return this.snapshot.demoBoardDir; }
    get paths() { return this.snapshot.paths; }
    get uptimeSeconds() { return this.snapshot.uptimeSeconds; }
    get memoryUsage() { return this.snapshot.memoryUsage; }

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "MainRuntime",
            summary: "Bounded application, runtime, path, uptime, and memory diagnostics.",
            members: RUNTIME_MEMBERS,
            summarize: () => ({ kind: "MainRuntime", ...this.snapshot }),
        };
    }
}

export class MainScriptNode implements IAiVisible {
    execute(code: string) { return executeMainScript(String(code ?? "")); }

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "MainScript",
            summary: "Settings-gated main-process script execution.",
            members: SCRIPT_MEMBERS,
            help: SCRIPT_HELP,
            restricted: () => isMainScriptsEnabled() ? undefined : MAIN_SCRIPT_DISABLED_MESSAGE,
            summarize: () => isMainScriptsEnabled()
                ? { kind: "MainScript", enabled: true }
                : { kind: "MainScript", enabled: false, note: MAIN_SCRIPT_DISABLED_MESSAGE },
        };
    }
}

export class MainNode implements IAiVisible {
    readonly mcp = new MainMcpNode();
    readonly tor = new MainTorNode();
    readonly boards = new MainBoardsNode();
    readonly downloads = new MainDownloadsNode();
    readonly networkLog = new MainNetworkLogNode();
    readonly runtime = new MainRuntimeNode();
    readonly script = new MainScriptNode();

    constructor(readonly windows: WindowsNode) {}

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "Main",
            summary: "Main-process diagnostics and gated scripting.",
            members: MAIN_MEMBERS,
            help: "Main is process-wide. It exposes windows, mcp, tor, boards, downloads, networkLog, runtime, and the settings-gated script branch.",
            children: (): readonly IAiChild[] => MAIN_MEMBERS.map(member => ({ segment: `.${member.name}`, kind: member.name === "windows" ? "Windows" : `Main${member.name[0].toUpperCase()}${member.name.slice(1)}`, summary: member.summary })),
            summarize: () => ({ kind: "Main", services: MAIN_MEMBERS.map(member => member.name) }),
        };
    }
}

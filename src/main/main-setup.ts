/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { app, components, net, protocol, session } from "electron";
import path from "node:path";
import { appPartition, fileAccessPersistPartition } from "./constants";
import { controller } from "../ipc/main/controller";
import { getAssetPath, isValidFilePath } from "./utils";
import { pathToFileURL } from "node:url";
import { openWindows } from "./open-windows";
import { setupTray } from "./tray-setup";
import { versionService } from "./version-service";
import { initSearchHandlers } from "./search-service";
import { initBrowserHandlers } from "./browser-service";
import { initTorHandlers, torService } from "./tor-service";
import { initWorkerHost } from "./worker-host";
import { initCommandRunner, killAllCommands } from "./command-runner";
import { disposeAllBoardPorts } from "./board-bridge";
import { startPipeServer, stopPipeServer } from "./pipe-server";
import { stopMcpHttpServer } from "./mcp-http-server";
import { shutdownMneme } from "./mneme-service";
import { stopVideoStreamServer } from "./video-stream-server";
import { downloadService } from "./download-service";
import { reconstructWindowsEnv } from "./windows-env";

export function setupMainProcess() {
    // US-800: recover standard Windows folder/system env vars before any child
    // process is spawned, in case the app was launched from a degraded shell.
    reconstructWindowsEnv();

    protocol.registerSchemesAsPrivileged([
        {
            scheme: "app-asset",
            privileges: {
                standard: true,
                secure: true,
                supportFetchAPI: true,
                bypassCSP: true,
                // Fetched cross-origin from the renderer (editor-type .d.ts,
                // libarchive.wasm). Electron 43 / Chromium requires explicit
                // corsEnabled for custom-scheme cross-origin fetch — without it
                // the dev origin (http://localhost:5273) is blocked by CORS.
                corsEnabled: true,
            },
        },
        {
            scheme: "safe-file",
            privileges: {
                standard: true,
                secure: true,
                supportFetchAPI: true,
                bypassCSP: true,
            },
        },
        {
            // Board frontend delivery (EPIC-034 / US-723). NOT bypassCSP — board
            // pages are governed by the CSP the board:// handler sets (forbids remote).
            scheme: "board",
            privileges: {
                standard: true,
                secure: true,
                supportFetchAPI: true,
            },
        },
    ]);

    controller.init();
    initSearchHandlers();
    initBrowserHandlers();
    initTorHandlers();
    initWorkerHost();
    initCommandRunner();
    downloadService.init();

    function registerAssetProtocol(partition: string) {
        const customSession = session.fromPartition(partition);

        customSession.protocol.handle("app-asset", (request) => {
            const parsedUrl = new URL(request.url);

            let relativePath = path.join(parsedUrl.host, parsedUrl.pathname);

            if (
                relativePath.startsWith(path.sep) ||
                relativePath.startsWith("/")
            ) {
                relativePath = relativePath.substring(1);
            }

            const file = path.join(getAssetPath(), relativePath);
            const fileUrl = pathToFileURL(file).toString();

            return net.fetch(fileUrl, { bypassCustomProtocolHandlers: true });
        });

        customSession.protocol.handle("safe-file", async (request) => {
            let filePath = decodeURIComponent(
                request.url.replace("safe-file://", ""),
            );

            if (process.platform === "win32") {
                // Check if it's a Windows path without drive letter separator
                const match = filePath.match(/^([a-zA-Z])\/(.+)$/);
                if (match) {
                    filePath = `${match[1]}:\\${match[2].replace(/\//g, "\\")}`;
                }
            }

            if (!isValidFilePath(filePath)) {
                return new Response("Invalid file path", { status: 403 });
            }

            const url = pathToFileURL(filePath).toString();
            const response = await net.fetch(url, {
                bypassCustomProtocolHandlers: true,
            });

            const headers = new Headers(response.headers);
            if (filePath.toLowerCase().endsWith(".pdf")) {
                headers.set("Content-Type", "application/pdf");
            }

            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: headers,
            });
        });
    }

    app.on("ready", async () => {
        // Ensure Widevine CDM is available (Castlabs Electron downloads it automatically)
        try {
            await components.whenReady();
            console.log("Widevine CDM ready:", components.status());
        } catch (err) {
            console.warn("Widevine CDM initialization failed:", err);
        }

        registerAssetProtocol(appPartition);
        registerAssetProtocol(fileAccessPersistPartition);
        // Single host-routed board:// handler on the main window's session (EPIC-037 /
        // US-770) — boards load board://<host> iframes in this session, routed by host.
        const { initBoardProtocol } = await import("./board-protocol-service");
        initBoardProtocol(appPartition);
        openWindows.restoreState();
        setupTray();
        startPipeServer();

        // Check for updates after a short delay to not slow down startup
        setTimeout(() => {
            versionService.checkForUpdates();
            // Refresh the published-boards catalog on the same 24h-gated cadence (US-862).
            import("./published-boards-service").then(({ publishedBoardsService }) =>
                publishedBoardsService.getPublishedBoards(),
            );
        }, 5000);
    });

    app.on("will-quit", () => {
        torService.shutdown();
        killAllCommands();
        disposeAllBoardPorts();
        stopPipeServer();
        stopMcpHttpServer();
        stopVideoStreamServer();
        shutdownMneme();
    });

    app.on("window-all-closed", () => {
        if (process.platform !== "darwin") {
            app.quit();
        }
    });

    app.on("second-instance", (event, commandLine, workingDirectory) => {
        const arg = commandLine[2];
        openWindows.bringToFront();

        if (!arg) return;

        // URL from browser registration (http:// or https://)
        if (arg.startsWith("http://") || arg.startsWith("https://")) {
            openWindows.handleOpenUrl(arg);
            return;
        }

        if (arg.toLowerCase().trim() === "diff") {
            const firstPath = commandLine[3];
            const secondPath = commandLine[4];
            const resolvedFirstPath = path.isAbsolute(firstPath)
                ? firstPath
                : path.resolve(workingDirectory, firstPath);

            const resolvedSecondPath = path.isAbsolute(secondPath)
                ? secondPath
                : path.resolve(workingDirectory, secondPath);

            if (
                isValidFilePath(resolvedFirstPath) &&
                isValidFilePath(resolvedSecondPath)
            ) {
                openWindows.handleOpenDiff(
                    resolvedFirstPath,
                    resolvedSecondPath,
                );
            }
        } else if (!path.isAbsolute(arg)) {
            const resolvedPath = path.resolve(workingDirectory, arg);
            if (isValidFilePath(resolvedPath)) {
                openWindows.handleOpenFile(resolvedPath);
            }
        } else if (isValidFilePath(arg)) {
            openWindows.handleOpenFile(arg);
        }
    });
}

/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { app, net, protocol, session } from "electron";
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

export function setupMainProcess() {
    protocol.registerSchemesAsPrivileged([
        {
            scheme: "app-asset",
            privileges: {
                standard: true,
                secure: true,
                supportFetchAPI: true,
                bypassCSP: true,
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
    ]);

    controller.init();
    initSearchHandlers();
    initBrowserHandlers();

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

    app.on("ready", () => {
        registerAssetProtocol(appPartition);
        registerAssetProtocol(fileAccessPersistPartition);
        openWindows.restoreState();
        setupTray();

        // Check for updates after a short delay to not slow down startup
        setTimeout(() => {
            versionService.checkForUpdates();
        }, 5000);
    });

    app.on("window-all-closed", () => {
        if (process.platform !== "darwin") {
            app.quit();
        }
    });

    app.on("second-instance", (event, commandLine, workingDirectory) => {
        const filePath = commandLine[2];
        openWindows.makeVisible();

        if (filePath?.toLowerCase().trim() === "diff") {
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
        } else if (filePath && !path.isAbsolute(filePath)) {
            const resolvedPath = path.resolve(workingDirectory, filePath);
            if (isValidFilePath(resolvedPath)) {
                openWindows.handleOpenFile(resolvedPath);
            }
        } else if (filePath && isValidFilePath(filePath)) {
            openWindows.handleOpenFile(filePath);
        }
    });
}

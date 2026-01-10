/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { app, net, protocol, session } from "electron";
import path from "node:path";
import { appPartition, fileAccessPersistPartition } from "./constants";
import { controller } from "../ipc/main/controller";
import { getAssetPath, isValidFilePath } from "./utils";
import { pathToFileURL } from "node:url";
import { openWindows } from "./open-windows";
import { setupTray } from "./tray-setup";

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

    function registerAssetProtocol(partition: string) {
        const customSession = session.fromPartition(partition);

        customSession.protocol.handle("app-asset", (request) => {
            const urlWithoutHash = request.url.split("#")[0];
            let relativePath = urlWithoutHash.replace("app-asset://", "");
            // The regex removes a trailing '/' only if it exists.
            relativePath = relativePath.replace(/\/$/, "");

            const file = path.join(getAssetPath(), relativePath);
            const url = pathToFileURL(file).toString();
            return net.fetch(url, { bypassCustomProtocolHandlers: true });
        });

        customSession.protocol.handle("safe-file", async (request) => {
            let filePath = decodeURIComponent(
                request.url.replace("safe-file://", "")
            );

            // Handle Windows paths: safe-file://d/path -> D:\path
            if (process.platform === "win32") {
                // Check if it's a Windows path without drive letter separator
                const match = filePath.match(/^([a-zA-Z])\/(.+)$/);
                if (match) {
                    filePath = `${match[1]}:\\${match[2].replace(/\//g, "\\")}`;
                }
            }

            // Optional: Add security validation
            if (!isValidFilePath(filePath)) {
                return new Response("Invalid file path", { status: 403 });
            }

            const url = pathToFileURL(filePath).toString();
            const response = await net.fetch(url, {
                bypassCustomProtocolHandlers: true,
            });

            // Ensure PDF mime type is set
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
    });

    app.on("window-all-closed", () => {
        if (process.platform !== "darwin") {
            app.quit();
        }
    });

    app.on("second-instance", (event, commandLine, workingDirectory) => {
        const filePath = commandLine[2];
        openWindows.makeVisible();
        if (filePath && isValidFilePath(filePath)) {
            openWindows.handleOpenFile(filePath);
        }
    });
}

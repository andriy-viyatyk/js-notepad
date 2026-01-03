/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { app, net, protocol, session } from "electron";
import path from "node:path";
import { appPartition } from "./main/constants";
import { controller } from "./ipc/main/controller";
import { getAssetPath, isValidFilePath } from "./main/utils";
import { pathToFileURL } from "node:url";
import { openWindows } from "./main/open-windows";
import { setupTray } from "./main/tray-setup";

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
    }

    app.on("ready", () => {
        registerAssetProtocol(appPartition);
        openWindows.restoreState();
        setupTray();
    });

    app.on("window-all-closed", () => {
        if (process.platform !== "darwin") {
            app.quit();
        }
    });

    app.on('second-instance', (event, commandLine, workingDirectory) => {
        const filePath = commandLine[2];
        openWindows.makeVisible();
        if (filePath && isValidFilePath(filePath)) {
            openWindows.handleOpenFile(filePath);
        }
    });
}

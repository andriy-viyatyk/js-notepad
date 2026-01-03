/* eslint-disable @typescript-eslint/no-var-requires */
import {
    contextBridge,
    ipcRenderer,
    IpcRendererEvent,
    webUtils,
} from "electron";
import { Endpoint, EventEndpoint, PreloadEvent } from "./ipc/api-types";
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

console.log("Preload started");

const electronHandler = {
    ipcRenderer: {
        sendMessage(channel: Endpoint | EventEndpoint, ...args: unknown[]) {
            ipcRenderer.send(channel, ...args);
        },
        on(
            channel: Endpoint | `${Endpoint}_${number}` | EventEndpoint,
            func: (...args: unknown[]) => void
        ) {
            const subscription = (
                _event: IpcRendererEvent,
                ...args: unknown[]
            ) => func(...args);
            ipcRenderer.on(channel, subscription);

            return () => {
                ipcRenderer.removeListener(channel, subscription);
            };
        },
        once(
            channel: Endpoint | `${Endpoint}_${number}`,
            func: (...args: unknown[]) => void
        ) {
            ipcRenderer.once(channel, (_event, ...args) => func(...args));
        },
    },
};

const nodeUtils = {
    uuid: () => {
        return crypto.randomUUID();
    },

    path: {
        join: path.join,
        resolve: path.resolve,
        extname: path.extname,
        dirname: path.dirname,
        basename: path.basename,
    },

    fs: {
        listFiles: (dirPath: string, pattern?: string | RegExp) => {
            const files = fs.readdirSync(dirPath);

            if (!pattern) {
                return files;
            }

            // If it's a string, treat it as extension (backward compatibility)
            if (typeof pattern === "string") {
                return files.filter(
                    (file: string) =>
                        path.extname(file).toLowerCase() ===
                        pattern.toLowerCase()
                );
            }

            // If it's a RegExp, use it to test the filename
            return files.filter((file: string) => pattern.test(file));
        },
        loadStringFile: (filePath: string): string =>
            fs.readFileSync(filePath, "utf-8"),
        saveStringFile: (filePath: string, content: string): void => {
            fs.writeFileSync(filePath, content, "utf-8");
        },
        fileExists: (filePath: string): boolean => {
            try {
                fs.accessSync(filePath, fs.constants.F_OK);
                return true;
            } catch (err) {
                return false;
            }
        },
        deleteFile: (filePath: string): boolean => {
            if (!nodeUtils.fs.fileExists(filePath)) {
                // File does not exist, resolve without error
                return true;
            }

            try {
                fs.unlinkSync(filePath);
                return true;
            } catch (err) {
                return false;
            }
        },
        preparePath: (dirPath: string): boolean => {
            if (!nodeUtils.fs.fileExists(dirPath)) {
                try {
                    fs.mkdirSync(dirPath, { recursive: true });
                } catch (err) {
                    return false;
                }
            }
            return true;
        },
    },
};

window.addEventListener("DOMContentLoaded", () => {
    document.addEventListener(
        "drop",
        (e) => {
            if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) {
                return;
            }

            e.preventDefault();
            e.stopPropagation();

            const file = e.dataTransfer.files[0];

            try {
                const filePath = webUtils.getPathForFile(file);
                ipcRenderer.send(PreloadEvent.fileDropped, filePath);
            } catch (error) {
                console.error("Error getting file path:", error);
            }
        },
        true
    );

    document.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
});

contextBridge.exposeInMainWorld("electron", electronHandler);
contextBridge.exposeInMainWorld("utils", nodeUtils);

console.log("Preload loaded");

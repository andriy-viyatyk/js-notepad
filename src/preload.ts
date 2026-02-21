import {
    ipcRenderer,
    IpcRendererEvent,
    webUtils,
} from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Endpoint, EventEndpoint } from "./ipc/api-types";

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
    getPathForFile: (file: File): string => {
        return webUtils.getPathForFile(file);
    }
};

window.electron = electronHandler;

// Expose webview preload path for browser tabs.
// __dirname points to the build output directory where both preload files live.
(window as any).webviewPreloadUrl = pathToFileURL(
    path.join(__dirname, "preload-webview.js"),
).toString();

window.MonacoEnvironment = {
  getWorkerUrl: function (_moduleId, label) {
    if (label === 'json') {
      return './json.worker.bundle.js';
    }
    if (label === 'html') {
      return './html.worker.bundle.js';
    }
    if (label === 'typescript' || label === 'javascript') {
      return './ts.worker.bundle.js';
    }
    return './editor.worker.bundle.js';
  }
};

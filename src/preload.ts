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
        // Ports-aware listener (EPIC-037 / US-771). The `on`/`once` wrappers above
        // drop the IpcRendererEvent, so a transferred MessagePort (which arrives on
        // `event.ports`) is unreachable through them. `onPort` surfaces the ports
        // explicitly — used to receive a per-board bridge port from main.
        onPort(
            channel: EventEndpoint,
            func: (payload: unknown, ports: readonly MessagePort[]) => void
        ) {
            const subscription = (event: IpcRendererEvent, payload: unknown) =>
                func(payload, event.ports);
            ipcRenderer.on(channel, subscription);
            return () => {
                ipcRenderer.removeListener(channel, subscription);
            };
        },
    },
    getPathForFile: (file: File): string => {
        return webUtils.getPathForFile(file);
    }
};

window.electron = electronHandler;

// Expose webview preload path for browser tabs.
// __dirname points to the build output directory where the preload files live.
(window as Window & { webviewPreloadUrl?: string }).webviewPreloadUrl = pathToFileURL(
    path.join(__dirname, "preload-webview.js"),
).toString();

// Boards no longer use a webview preload (EPIC-037 / US-771) — the persephone
// bridge is a shim injected into board HTML by the board:// handler, talking to
// main over a per-board MessagePort. No boardPreloadUrl is needed.

window.MonacoEnvironment = {
  // Worker bundles are emitted into monacoeditorwork/ by
  // vite-plugin-monaco-editor-esm (its default publicPath), served from the
  // same path by the dev middleware and packaged there in prod.
  getWorkerUrl: function (_moduleId, label) {
    if (label === 'json') {
      return './monacoeditorwork/json.worker.bundle.js';
    }
    if (label === 'html') {
      return './monacoeditorwork/html.worker.bundle.js';
    }
    if (label === 'typescript' || label === 'javascript') {
      return './monacoeditorwork/ts.worker.bundle.js';
    }
    return './monacoeditorwork/editor.worker.bundle.js';
  }
};

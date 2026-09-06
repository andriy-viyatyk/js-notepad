/**
 * CDP session wrapper for a browser webview.
 * Sends Chrome DevTools Protocol commands via IPC to the main process,
 * which forwards them through Electron's webContents.debugger API.
 */
import { BrowserChannel } from "../../ipc/browser-ipc";

const { ipcRenderer } = require("electron");

export class CdpSession {
    constructor(private readonly regKey: string) {}

    /** Exact registration key used by the main-process CDP router. */
    get registrationKey(): string {
        return this.regKey;
    }

    async attach(): Promise<boolean> {
        return ipcRenderer.invoke(BrowserChannel.cdpAttach, this.regKey);
    }

    async detach(): Promise<void> {
        return ipcRenderer.invoke(BrowserChannel.cdpDetach, this.regKey);
    }

    /** Send a raw CDP command. Auto-attaches if not yet attached. */
    async send(method: string, params?: object, sessionId?: string): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
        return ipcRenderer.invoke(BrowserChannel.cdpSend, this.regKey, method, params, sessionId);
    }

    /**
     * Evaluate a JavaScript expression in the page and return the result.
     * Supports async expressions (awaited automatically).
     */
    async evaluate(expression: string): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
        const result = await this.send("Runtime.evaluate", {
            expression,
            returnByValue: true,
            awaitPromise: true,
        });
        if (result.exceptionDetails) {
            const msg = result.exceptionDetails.exception?.description
                || result.exceptionDetails.text
                || "Evaluation failed";
            throw new Error(msg);
        }
        return result.result?.value;
    }
}

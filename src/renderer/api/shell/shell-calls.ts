import { api } from "../../../ipc/renderer/api";

const { shell: electronShell } = require("electron");

export function openExternal(url: string): Promise<void> {
    return electronShell.openExternal(url);
}

export function startScreenSnip(hideWindows: boolean): Promise<string | null> {
    return api.startScreenSnip(hideWindows);
}

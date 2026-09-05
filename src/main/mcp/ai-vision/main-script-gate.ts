import { app } from "electron";

export const MAIN_SCRIPT_DISABLED_MESSAGE =
    "Main-process scripts are disabled — enable “Allow main-process scripts” in Settings → MCP Server.";

let mainScriptsEnabled = !app.isPackaged;

export function isMainScriptsEnabled(): boolean {
    return mainScriptsEnabled;
}

export function setMainScriptsEnabled(enabled: boolean): void {
    mainScriptsEnabled = enabled;
}

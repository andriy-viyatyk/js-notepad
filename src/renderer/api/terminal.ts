import { api } from "../../ipc/renderer/api";
import { settings } from "./settings";
import { ui } from "./ui";
import { errMessage } from "../../shared/utils";

/** Open a terminal window rooted at `dirPath`, using the configured
 *  `terminal.command`. On first use (empty setting) the terminal is
 *  auto-detected (pwsh -> powershell -> cmd) and saved so the user can change
 *  it in Settings afterwards. */
export async function openTerminalAt(dirPath: string): Promise<void> {
    try {
        let command = settings.get<string>("terminal.command");
        if (!command) {
            command = await api.detectTerminal();
            if (command) settings.set("terminal.command", command);
        }
        await api.openTerminal(dirPath, command || "powershell");
    } catch (err) {
        ui.notify(errMessage(err, "Failed to open terminal."), "warning");
    }
}

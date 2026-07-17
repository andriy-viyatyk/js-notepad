import { spawn, execFileSync } from "child_process";
import fs from "node:fs";

/** Whether an executable resolves on PATH (Windows `where`). */
function commandExists(name: string): boolean {
    try {
        execFileSync("where", [name], { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
}

/** Pick the best available terminal: pwsh (PowerShell 7) -> powershell (5.1) -> cmd. */
export function detectTerminal(): string {
    if (commandExists("pwsh")) return "pwsh";
    if (commandExists("powershell")) return "powershell";
    return "cmd";
}

/** Bare command name (lowercased, ".exe" stripped) for arg mapping. */
function commandKind(command: string): string {
    const base = command.replace(/\\/g, "/").split("/").pop() ?? command;
    return base.toLowerCase().replace(/\.exe$/, "");
}

/** Open a new terminal window with `dirPath` as its working directory.
 *  win32-only; a no-op on other platforms. `command` is a command name or path
 *  (pwsh / powershell / cmd / wt, or a full path). */
export function openTerminalAt(dirPath: string, command: string): void {
    if (process.platform !== "win32") return;

    if (!dirPath || !fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
        throw new Error(`Not a folder: ${dirPath}`);
    }

    const kind = commandKind(command);
    // Windows Terminal takes the directory via -d. The console shells keep their
    // window open with -NoExit / /K (cwd sets the starting directory).
    const shellArgs =
        kind === "wt"
            ? ["-d", dirPath]
            : kind === "cmd"
                ? ["/K"]
                : kind === "pwsh" || kind === "powershell"
                    ? ["-NoExit"]
                    : [];

    // Launch through `cmd /c start` so the shell gets its own visible window.
    // Spawning a console app (powershell/cmd) directly with detached:true sets
    // the DETACHED_PROCESS flag, which gives it NO console — it would run
    // invisibly. `start` creates a fresh console window and fully decouples the
    // shell from the app. The "" is start's required (empty) window-title token;
    // /D sets the working directory.
    const proc = spawn(
        "cmd.exe",
        ["/c", "start", "", "/D", dirPath, command, ...shellArgs],
        {
            cwd: dirPath,
            detached: true,
            stdio: "ignore",
            windowsHide: true,
        },
    );
    proc.unref();
}

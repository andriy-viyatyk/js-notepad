/**
 * US-800 — Windows environment backfill.
 *
 * On Windows a process's environment block is a copy handed to it by its parent
 * at `CreateProcess` time; nothing the app does afterwards can recover variables
 * that were never passed in. When Persephone is launched from a shell that is
 * itself running with a degraded environment (e.g. `explorer.exe` restarted
 * outside a normal logon), the main process — and therefore every child spawned
 * by `execute()`, mneme, tor, vlc and snip — inherits a stripped ~14-variable
 * set that is missing the standard Windows folder/system vars (`APPDATA`,
 * `LOCALAPPDATA`, `ProgramData`, `ProgramFiles*`, …). Tools like NuGet then fail
 * because they cannot compute their config-folder paths.
 *
 * This module reconstructs the missing folder/system variables from
 * environment-independent sources — Electron's `app.getPath()` (which uses
 * `SHGetKnownFolderPath` and is correct even when the env vars are absent) and
 * the always-present `SystemDrive`/`SystemRoot` — mutating `process.env` once at
 * startup so all downstream spawners get parity with a healthy launch.
 *
 * It is strictly backfill-only: a variable that is already present is never
 * overwritten, so under `npm start` or a normal packaged launch this is a no-op.
 */
import { app } from "electron";
import path from "node:path";
import os from "node:os";

/**
 * Backfill standard Windows folder/system environment variables that are missing
 * from `process.env`. No-op on non-Windows platforms and for any variable that is
 * already set.
 */
export function reconstructWindowsEnv(): void {
    if (process.platform !== "win32") return;

    const setIfMissing = (key: string, value: string | undefined): void => {
        if (!process.env[key] && value) process.env[key] = value;
    };

    // Electron's getPath uses SHGetKnownFolderPath — authoritative even when the
    // corresponding env var is missing. Guard anyway: never let a lookup failure
    // abort startup.
    const getPath = (name: "home" | "appData" | "temp"): string | undefined => {
        try {
            return app.getPath(name);
        } catch {
            return undefined;
        }
    };

    const systemDrive =
        process.env.SystemDrive || process.env.SystemRoot?.slice(0, 2) || "C:";
    const userProfile = process.env.USERPROFILE || getPath("home");
    const appData = process.env.APPDATA || getPath("appData");
    // appData is `…\AppData\Roaming`, so its sibling `Local` is LOCALAPPDATA.
    const localAppData =
        process.env.LOCALAPPDATA ||
        (appData ? path.join(path.dirname(appData), "Local") : undefined);
    const temp = process.env.TEMP || process.env.TMP || getPath("temp");
    const programData = `${systemDrive}\\ProgramData`;
    const programFiles = `${systemDrive}\\Program Files`;
    const programFilesX86 = `${systemDrive}\\Program Files (x86)`;

    setIfMissing("SystemDrive", systemDrive);
    setIfMissing("USERPROFILE", userProfile);
    setIfMissing("APPDATA", appData);
    setIfMissing("LOCALAPPDATA", localAppData);
    setIfMissing("ProgramData", programData);
    setIfMissing("ALLUSERSPROFILE", programData);
    setIfMissing("ProgramFiles", programFiles);
    setIfMissing("ProgramW6432", programFiles);
    setIfMissing("ProgramFiles(x86)", programFilesX86);
    setIfMissing("CommonProgramFiles", `${programFiles}\\Common Files`);
    setIfMissing("CommonProgramW6432", `${programFiles}\\Common Files`);
    setIfMissing("CommonProgramFiles(x86)", `${programFilesX86}\\Common Files`);
    setIfMissing("TEMP", temp);
    setIfMissing("TMP", temp);
    setIfMissing("HOMEDRIVE", userProfile?.slice(0, 2));
    setIfMissing("HOMEPATH", userProfile?.slice(2));
    setIfMissing("USERNAME", os.userInfo().username);
}

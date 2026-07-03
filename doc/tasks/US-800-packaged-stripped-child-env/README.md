# US-800: Packaged build spawns child processes with a stripped environment

## Problem

When Persephone runs from the **packaged/release build**, child processes launched via
`persephone.execute()` receive a **heavily stripped environment** — only ~14 variables,
missing most standard Windows folder/system vars such as `APPDATA`, `LOCALAPPDATA`,
`ProgramData`, `ALLUSERSPROFILE`, `ProgramFiles`, and `ProgramFiles(x86)`.

Under the **dev build (`npm start`)** the same child processes inherit the **full** user
environment (~100 vars), so the problem does not reproduce there. Same code, same commit —
the only difference is the environment handed to `execute()` children in the packaged app.

## Impact

Any board or script that shells out to an environment-sensitive tool (dotnet, npm, git,
python, etc.) can break or misbehave from the release build while working fine under
`npm start`.

Concrete case that surfaced this: a board runs `dotnet restore` for a multi-project .NET
solution. With `APPDATA` and `ProgramFiles(x86)` undefined, NuGet cannot compute its config
folder paths (`%APPDATA%\NuGet\NuGet.Config` and machine-wide `%ProgramFiles(x86)%\NuGet\Config`)
and fails during restore with, for every project:

```
NuGet.targets(780,5): error : Value cannot be null. (Parameter 'path1')
```

Stack (confirms the null comes from a missing folder env var):

```
System.ArgumentNullException: Value cannot be null. (Parameter 'path1')
   at System.IO.Path.Combine(String path1, String path2)
   at NuGet.Common.NuGetEnvironment.CalculateFolderPath(NuGetFolderPath folder)
   at NuGet.Configuration.XPlatMachineWideSetting..ctor()
   at NuGet.Build.Tasks.RestoreSettingsUtils.ReadSettings(...)
```

## How it was detected

A diagnostic in the board's launcher script dumped `process.env` as received by the child.
From the **release build**:

```
env key count = 14
raw APPDATA        = (undefined)
raw LOCALAPPDATA   = (undefined)
raw USERPROFILE    = C:\Users\<user>            (present)
raw ComSpec        = C:\WINDOWS\system32\cmd.exe (present)
raw SystemRoot     = C:\WINDOWS                  (present)
```

The same dump under `npm start` shows the full ~100-variable environment. Backfilling the
missing vars in the child before spawning `dotnet` made the failure disappear, confirming the
root cause is the stripped environment (not the tool, not the board, not the .NET SDK).

## Environment

- OS: Windows 11.
- Launch method for the release build: taskbar-pinned shortcut targeting
  `C:\Program Files\Persephone\persephone\persephone.exe` (installed app).
- Reproduced from board `PatientCRM` (external repo) running `dotnet restore`; a temporary
  per-board workaround (reconstructing the standard Windows env before spawn) is in place there,
  so this task is about the **Persephone-side root cause**, not that board.

## Investigation results (2026-07-03)

Traced the whole spawn path and empirically tested each suspect. **Suspect #2 confirmed:**
the packaged main process is itself launched with a minimal environment, and everything
downstream faithfully inherits that gap. Suspect #1 (`execute()`) and the launcher are ruled out.

**Ruled out:**
- **`execute()` / `command-runner.ts`** — spawns with
  `env: { ...process.env, ...(opts?.env ?? {}) }` (`src/main/command-runner.ts:213`). It faithfully
  forwards the main process's own env; it strips nothing.
- **Rust launcher + `DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP`** — built a minimal repro
  mirroring `spawn_electron` (`launcher/src/main.rs:107`) exactly. The child inherited the **full**
  75+ vars including `APPDATA`/`LOCALAPPDATA`. Rust's `Command` inherits the parent env by default;
  those creation flags do **not** strip it.
- **Persephone main code** — never deletes or rebuilds `process.env` anywhere (grep confirmed).

**Confirmed mechanism:**
- The main process's **own `process.env` is already truncated to ~14 vars at launch**; execute(),
  mneme, tor, vlc and snip all inherit that truncated set faithfully.
- The launcher is **not** in the reproducing chain. The install shortcuts do target
  `persephone-launcher.exe` (`build/installer.nsh:200`, `:208`, `:218`, `:227`, `:282-298`), but the
  reporter's taskbar pin was created by right-clicking the *running* app and choosing "Pin to
  taskbar" — Windows records a `.lnk` to **`persephone.exe`** (the running exe), not the launcher.
  So the reproducing chain is `explorer.exe → persephone.exe` directly. A `.lnk` clicked from the
  taskbar is launched by `explorer.exe` and inherits *explorer's* environment.
- The truncation therefore originates in **`explorer.exe` itself running with a reduced
  environment** at the time of the failure. The surviving set (`SystemRoot`, `ComSpec`, `PATH`,
  `USERPROFILE`) minus the profile/known-folder vars
  (`APPDATA`/`LOCALAPPDATA`/`ProgramData`/`ProgramFiles*`) is the classic signature of a shell that
  was restarted outside a normal logon (e.g. Explorer crashed and was relaunched, or restarted by a
  utility/update) and never inherited the full logon environment. A log-off/log-on refreshes it,
  but that is not something the app can rely on — hence the in-app backfill. `npm start` is
  unaffected because Electron is launched directly from the terminal, which carries the full
  environment (the dev chain never passes through explorer's block).

**Live verification (2026-07-03, after a reboot at 00:35):** read the PEB environment blocks of the
running processes directly (`NtQueryInformationProcess` + `ReadProcessMemory`):
- Taskbar pin target confirmed: `persephone.lnk → C:\Program Files\Persephone\persephone\persephone.exe`.
- `explorer.exe` (started at boot, not restarted): **61 vars, all key vars present** — healthy.
- `persephone.exe` launched from the pin: **61 vars, all present**, parent PID = that same explorer.

Conclusion: the ~14-var state was a **transient degraded-shell condition, cleared by the reboot**.
It is not deterministically reproducible on demand; it will recur whenever the shell degrades
again. The fix is therefore defensive recovery (backfill), not prevention.
- Consequence for the fix: a **launcher-side** reconstruction would not help this repro at all
  (the launcher is bypassed). The fix must live in the main process, which covers persephone.exe no
  matter how it is launched (launcher, pinned exe, file association, or `npm start`).

**Why the fix belongs in Persephone main, not the launcher:** we can't control how Windows
activates the pin, but we can guarantee parity by reconstructing the standard Windows env once at
main startup — mutating `process.env` so *all* main-process spawners benefit. Electron's
`app.getPath('appData'|'home'|'temp')` uses `SHGetKnownFolderPath` and is correct **even when the
env vars are missing**, giving an authoritative, env-independent source to backfill from.

## Implementation plan

**Chosen scope: targeted backfill** (backfill only the standard Windows folder/system vars that are
absent; never overwrite a var that is already present — so a full env is a no-op). This fixes the
NuGet failure and every var the report lists as missing. Full registry-based parity (reading
`HKLM ...\Session Manager\Environment` + `HKCU\Environment`) was considered and deferred — not
needed for the acceptance criteria.

1. **New file `src/main/windows-env.ts`** — export `reconstructWindowsEnv(): void`.
   - No-op unless `process.platform === "win32"`.
   - Uses `node:path`, `node:os`, and Electron `app` (all already used in `src/main/`).
   - Helper `setIfMissing(key, value)` — assigns only when `!process.env[key]` and `value` is truthy.
   - Derive base values from env-independent sources:
     - `systemDrive = process.env.SystemDrive || process.env.SystemRoot?.slice(0, 2) || "C:"`
     - `userProfile = process.env.USERPROFILE || app.getPath("home")`
     - `appData = process.env.APPDATA || app.getPath("appData")` (SHGetKnownFolderPath → Roaming)
     - `localAppData = process.env.LOCALAPPDATA || path.join(path.dirname(appData), "Local")`
       (appData is `…\AppData\Roaming`, so dirname is `…\AppData`)
     - `programData = ${systemDrive}\\ProgramData`
     - `programFiles = ${systemDrive}\\Program Files`; `programFilesX86 = ${systemDrive}\\Program Files (x86)`
   - `setIfMissing` for: `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `ProgramData`, `ALLUSERSPROFILE`
     (= programData), `ProgramFiles`, `ProgramW6432` (= programFiles), `ProgramFiles(x86)`,
     `CommonProgramFiles` (= `${programFiles}\\Common Files`), `CommonProgramW6432`
     (= `${programFiles}\\Common Files`), `CommonProgramFiles(x86)`
     (= `${programFilesX86}\\Common Files`), `SystemDrive`, `HOMEDRIVE` (= userProfile.slice(0,2)),
     `HOMEPATH` (= userProfile.slice(2)), `TEMP`/`TMP` (= `app.getPath("temp")`),
     `USERNAME` (= `os.userInfo().username`).
2. **Call it in `src/main/main-setup.ts`** — invoke `reconstructWindowsEnv()` at the top of the
   setup function, **before** `initCommandRunner()` (`main-setup.ts:60`) and before the mneme/tor/vlc
   services can spawn. `app` is already imported (`main-setup.ts:2`); `app.getPath` is available this
   early (pre-`ready`) for `home`/`appData`/`temp`.
3. **No changes to** `command-runner.ts` (its `{ ...process.env }` merge now picks up the backfilled
   vars automatically), the launcher, `installer.nsh`, or any renderer code.

## Acceptance criteria

- Child processes started via `persephone.execute()` from the **packaged build** receive the
  standard Windows folder/system vars even when the app itself was launched with a stripped
  environment.
- **Verification (the original failure no longer reproduces naturally — the degraded-shell state
  was cleared by a reboot):** simulate the degraded launch by starting the packaged
  `persephone.exe` from PowerShell with a deliberately minimal environment
  (`ProcessStartInfo` with `EnvironmentVariables` cleared down to the observed ~14-var set:
  `SystemRoot`, `SystemDrive`, `ComSpec`, `PATH`, `USERPROFILE`, `USERNAME`, `windir`, …), then run
  a board/script that dumps `process.env` in an `execute()` child — `APPDATA`, `LOCALAPPDATA`,
  `ProgramData`, `ALLUSERSPROFILE`, `ProgramFiles`, `ProgramFiles(x86)`, `TEMP`/`TMP` must all be
  present and correct.
- No regression under `npm start` or a normal packaged launch (backfill is a strict no-op when the
  vars are already present).

## Files changed

| File | Change |
|------|--------|
| `src/main/windows-env.ts` | **New.** `reconstructWindowsEnv()` — win32-only, backfill-only reconstruction of standard Windows folder/system env vars from env-independent sources (`app.getPath`, `SystemDrive`). |
| `src/main/main-setup.ts` | Call `reconstructWindowsEnv()` at the start of setup, before `initCommandRunner()` and the spawn-capable services. |

**No changes needed:** `src/main/command-runner.ts` (inherits backfilled vars via its existing
`{ ...process.env }` merge), `launcher/src/main.rs`, `build/installer.nsh`, any renderer code.

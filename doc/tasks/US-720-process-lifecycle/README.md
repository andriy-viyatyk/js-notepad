# US-720: Process lifecycle — whole-tree kill + per-owner reaping

**Epic:** [EPIC-034 — Web Board](../../epics/EPIC-034.md)
**Status:** Active (investigated — ready for implementation)
**Created:** 2026-06-18

## Goal

Upgrade the command runner so that killing a job kills the **whole process tree** (not just the direct child), and so that **all of an owner's jobs are reaped** when its window/webview is destroyed or its renderer crashes. This closes the one gap proven during US-719 testing: with `shell: true` (the default) the tracked child is `cmd.exe` and the real workload is a **grandchild** — a plain `child.kill()` terminates the shell but **orphans the grandchild**, which keeps the stdio pipes open so `close`/`exit` never fires.

This is **foundation #2** of EPIC-034. It is what makes the per-board lifecycle safe (epic C8: *"switching boards destroys the previous one — which is also what reaps its child processes"*): when a board webview closes/reloads/crashes, none of its spawned scripts survive.

**This task is entirely main-side.** The IPC channels (`src/ipc/runner-channels.ts`), the renderer client (`src/renderer/api/proc.ts`), and the handle contract are **unchanged** — `handle.kill()` already sends `RunnerChannel.kill { jobId, signal? }`; US-720 only changes what that handler *does* in main, plus adds automatic reaping wired to WebContents lifecycle events. **Only `src/main/command-runner.ts` changes.**

## Background

Investigation 2026-06-18.

### What US-719 shipped (the starting point)

`src/main/command-runner.ts` already has the exact registry US-720 was designed to extend:

- `const activeJobs = new Map<string, Job>()` — keyed by `jobId`; each `Job` already carries its `sender: WebContents` (command-runner.ts:29-38).
- The kill handler is the documented swap point (command-runner.ts:162-172):
  ```ts
  ipcMain.on(RunnerChannel.kill, (_event, msg: RunnerKillMsg) => {
      // Direct-child kill only. US-720 replaces this body with a Windows
      // Job-Object / `taskkill /T` whole-tree kill over the same registry.
      const job = activeJobs.get(msg.jobId);
      if (!job) return;
      try { job.proc.kill((msg.signal as NodeJS.Signals) || undefined); } catch {}
  });
  ```
- `killAllCommands()` already iterates `activeJobs` and `.kill()`s each (wired into `app.on("will-quit")` in `main-setup.ts:131`).
- `cleanup(jobId)` already clears the flush timer and deletes from `activeJobs` (command-runner.ts:74-78); the `proc.on("close")` handler is the single normal-completion path that sends `exit` then `cleanup`s (command-runner.ts:126-130).

The US-719 doc explicitly drew the boundary (US-719/README.md:19, :159): *"US-720 replaces the kill body with a Windows Job Object (taskkill /T fallback) tree-kill and adds per-board-instance reaping … Keep the `activeJobs` registry the single source of truth so US-720 only swaps the kill implementation."*

### The US-719 test that motivates this task

`app.proc.execute('node -e "setInterval(()=>{},1000)"')` (`shell: true` default) + `h.kill()` → **timed out**: `cmd.exe` died but the `node` grandchild survived holding the pipes, so `close` never fired. The control test `execute("node …", { shell: false })` (direct child) + kill → `{ code: null, signal: "SIGTERM" }` ✅. Tree-kill makes the `shell: true` case behave correctly.

### Tree-kill mechanisms (what's available)

- **No tree-kill dependency exists** — `package.json` has no `tree-kill`/`ps-tree`/`fkill`; there is no `taskkill` usage anywhere in `src/` yet (only the placeholder comment). So the mechanism is built from platform primitives, not a new dependency.
- **Windows — `taskkill /PID <pid> /T /F`:** built into Windows. `/T` terminates the process **and its entire child tree**; `/F` forces. Spawned via `child_process.spawn` (fire-and-forget, short-lived). Dependency-free; no native addon. **This is the recommended v1 mechanism.** It directly fixes the `shell:true` grandchild case (killing `cmd.exe`'s tree kills the `node` workload).
- **Windows — Job Object (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`):** the more robust option named in the epic — assigning each child to a Job at spawn so closing the job handle atomically kills the tree even across re-parenting. **Node has no native Job-Object API**, so it requires a native addon (N-API / ffi) rebuilt against Electron's ABI — a heavy new build dependency for a codebase that currently ships zero native addons. **Recommended: defer Job Object to a hardening follow-up; ship `taskkill /T` for v1.** See Concern C1 (this is the one decision to confirm before implementing).
- **POSIX — process-group kill:** spawn the child with `detached: true` so it becomes a process-group **leader**, then `process.kill(-pid, signal)` signals the whole group. Persephone is Windows-first (NSIS installer, `windowsHide`, `safe-file` drive-letter handling), so POSIX is the secondary path; included for correctness. **Never `unref()`** — the job must stay tracked (contrast `vlc-launcher.ts`, which `detached:true` + `unref()`s on purpose to *outlive* the app — the opposite intent).

### Owner = WebContents = board instance

Epic C8 + the `board://` design fix one board instance to one webview/`WebContents` (each board gets its own `board-<uuid>` partition + webview). So **the `sender` WebContents already stored on each `Job` *is* the per-board-instance identity** — no separate owner id is needed. Reaping triggers:

- **`destroyed`** — window closed, or a board webview unmounted (board closed, or *reloaded* — config-change remount destroys+recreates the webview, so a remount surfaces here).
- **`render-process-gone`** — the renderer/webview crashed.

This also benefits the **renderer `app.proc` consumer**: on window close or renderer crash, that window's script-spawned children are reaped too (no orphans). In-page navigation is **not** a reap trigger (boards remount rather than navigate in place; the app-shell renderer must not lose its script children on a same-origin navigation) — see Concern C2.

### worker-host has no reaping precedent

`worker-host.ts` does **not** reap on `sender` destroyed — worker_threads are in-process and cannot orphan OS processes, so they self-terminate on completion. US-720 therefore **introduces** WebContents-lifecycle reaping; there is no existing pattern to copy. The pieces it uses (`WebContents`, `spawn`, `ChildProcessWithoutNullStreams`) are **already imported** in `command-runner.ts` — no new imports.

## Implementation plan

All edits are in **`src/main/command-runner.ts`**. No other file changes (init + `killAllCommands` are already wired in `main-setup.ts`; channels + renderer client are unchanged).

### 1. Spawn the child as a POSIX process-group leader

In `startJob`, add `detached` to the `spawn` options (Windows-excluded):

**Before** (command-runner.ts:85-90):
```ts
proc = spawn(command, {
    shell: opts?.shell ?? true,
    cwd: opts?.cwd,
    env: { ...process.env, ...(opts?.env ?? {}) },
    windowsHide: true,
});
```
**After:**
```ts
proc = spawn(command, {
    shell: opts?.shell ?? true,
    cwd: opts?.cwd,
    env: { ...process.env, ...(opts?.env ?? {}) },
    windowsHide: true,
    // POSIX: become a process-group leader so the whole group can be
    // signalled via process.kill(-pid) in treeKill(). Windows uses
    // taskkill /T instead, and detached there would spawn a console — so
    // it is Windows-excluded. We never unref(): the job stays tracked.
    detached: process.platform !== "win32",
});
```

### 2. Add the `treeKill` helper

Add next to `safeSend`/`flush` (top of the module, after the `activeJobs` declaration):

```ts
/**
 * Kill a child process and its entire descendant tree.
 *
 * Windows: `taskkill /PID <pid> /T /F` — /T walks the child tree, /F forces.
 *   Closes the US-719 gap: with `shell: true` the tracked child is cmd.exe
 *   and the real workload is a grandchild; a plain proc.kill() only ends
 *   cmd.exe and orphans the grandchild (which holds the stdio pipes open, so
 *   `close` never fires). taskkill /T kills the whole tree → pipes close →
 *   our existing proc.on("close") fires and the job settles.
 * POSIX: process.kill(-pid, signal) signals the child's process group (the
 *   child is the group leader via detached:true at spawn).
 */
function treeKill(proc: ChildProcessWithoutNullStreams, signal?: string): void {
    const pid = proc.pid;
    if (pid == null) {
        try { proc.kill(); } catch { /* already dead */ }
        return;
    }
    if (process.platform === "win32") {
        try {
            // Fire-and-forget; taskkill is short-lived and self-cleaning.
            spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
        } catch {
            try { proc.kill(); } catch { /* already dead */ }
        }
    } else {
        try {
            process.kill(-pid, (signal as NodeJS.Signals) || "SIGTERM");
        } catch {
            try { proc.kill((signal as NodeJS.Signals) || undefined); } catch { /* already dead */ }
        }
    }
}
```

### 3. Add the per-owner reverse index + reaping

Add alongside `activeJobs`:
```ts
/** jobIds grouped by their owning WebContents id — for reaping on close/crash. */
const jobsBySender = new Map<number, Set<string>>();
/** Per-sender reap wiring (so we attach lifecycle listeners exactly once). */
const senderReapers = new Map<number, { wc: WebContents; reap: () => void }>();
```

Helpers:
```ts
function indexJob(jobId: string, sender: WebContents): void {
    let set = jobsBySender.get(sender.id);
    if (!set) {
        set = new Set();
        jobsBySender.set(sender.id, set);
    }
    set.add(jobId);
}

/** Reap every job owned by a WebContents whose window/webview is gone or crashed. */
function reapSender(senderId: number): void {
    const entry = senderReapers.get(senderId);
    if (entry) {
        try { entry.wc.removeListener("render-process-gone", entry.reap); } catch { /* gone */ }
        // 'destroyed' was once() — already removed if it fired.
        senderReapers.delete(senderId);
    }
    const set = jobsBySender.get(senderId);
    if (!set) return;
    for (const jobId of [...set]) {
        const job = activeJobs.get(jobId);
        if (job) treeKill(job.proc);
        cleanup(jobId); // sender is gone — nobody will receive `exit`
    }
    jobsBySender.delete(senderId);
}

/** Attach destroyed / crash reaping to a sender exactly once. */
function wireSenderReaping(sender: WebContents): void {
    if (senderReapers.has(sender.id)) return;
    const reap = () => reapSender(sender.id);
    senderReapers.set(sender.id, { wc: sender, reap });
    sender.once("destroyed", reap);
    sender.on("render-process-gone", reap);
}
```

### 4. Wire the index at job start

In `startJob`, right after `activeJobs.set(jobId, job);` (command-runner.ts:107):
```ts
activeJobs.set(jobId, job);
indexJob(jobId, event.sender);
wireSenderReaping(event.sender);
```

### 5. Keep the reverse index consistent in `cleanup`

**Before** (command-runner.ts:74-78):
```ts
function cleanup(jobId: string): void {
    const job = activeJobs.get(jobId);
    if (job?.flushTimer) clearTimeout(job.flushTimer);
    activeJobs.delete(jobId);
}
```
**After:**
```ts
function cleanup(jobId: string): void {
    const job = activeJobs.get(jobId);
    if (job?.flushTimer) clearTimeout(job.flushTimer);
    if (job) {
        const set = jobsBySender.get(job.sender.id);
        if (set) {
            set.delete(jobId);
            if (!set.size) jobsBySender.delete(job.sender.id);
        }
    }
    activeJobs.delete(jobId);
}
```
*(The `senderReapers` wiring is intentionally left until the sender is destroyed/crashes — one map entry + two cheap listeners per WebContents that ran ≥1 job; freed in `reapSender`.)*

### 6. Tree-kill in the `kill` IPC handler

**Before** (command-runner.ts:162-172):
```ts
ipcMain.on(RunnerChannel.kill, (_event, msg: RunnerKillMsg) => {
    // Direct-child kill only. US-720 replaces this body with a Windows
    // Job-Object / `taskkill /T` whole-tree kill over the same registry.
    const job = activeJobs.get(msg.jobId);
    if (!job) return;
    try { job.proc.kill((msg.signal as NodeJS.Signals) || undefined); } catch {}
});
```
**After:**
```ts
ipcMain.on(RunnerChannel.kill, (_event, msg: RunnerKillMsg) => {
    const job = activeJobs.get(msg.jobId);
    if (!job) return;
    treeKill(job.proc, msg.signal);
    // Do not cleanup here — taskkill/group-kill closes the child's stdio,
    // so proc.on("close") fires and runs the normal exit + cleanup path.
});
```

### 7. Tree-kill in `killAllCommands`

**Before** (command-runner.ts:176-186):
```ts
export function killAllCommands(): void {
    for (const job of activeJobs.values()) {
        if (job.flushTimer) clearTimeout(job.flushTimer);
        try { job.proc.kill(); } catch {}
    }
    activeJobs.clear();
}
```
**After:**
```ts
export function killAllCommands(): void {
    for (const job of activeJobs.values()) {
        if (job.flushTimer) clearTimeout(job.flushTimer);
        treeKill(job.proc);
    }
    activeJobs.clear();
    jobsBySender.clear();
    senderReapers.clear();
}
```

## Concerns / open questions

- **C1 — `taskkill /T` vs Windows Job Object (RESOLVED — `taskkill /T` for v1, user 2026-06-18).** Ship `taskkill /PID <pid> /T /F` on Windows: it is a **built-in command** (no native code, no new binary, no dependency) and `/T` kills the whole child tree, directly fixing the proven `shell:true` grandchild case (`cmd.exe → node.exe`: a plain `cmd.exe`-only kill orphans `node.exe`, which keeps the pipes open so `close`/`exit` never fires). For typical board scripts (`cmd → python/node/sh → CLI tool`) the parent-child chain is intact at kill time, so `taskkill /T` is reliable.
  - **Deferred hardening — Rust Job-Object spawn-wrapper (NOT a kill-by-pid tool).** `taskkill /T` rebuilds the tree from recorded parent pids, so it can miss a descendant if an intermediate process already exited or a child deliberately broke away. The bulletproof fix is a Windows **Job Object** with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` — but that only works if the process is placed in the job **at spawn time** (children then inherit it), so it cannot be done "by pid after the fact." The clean shape (if ever needed) is a small **Rust spawn-wrapper** crate (sibling to `mneme`/`launcher`/`snip-tool`, built in CI, shipped beside `persephone.exe`): `command-runner` spawns `runner-helper.exe <command>` instead of the command directly; the helper creates a `KILL_ON_JOB_CLOSE` job, assigns itself, then spawns the real command with **inherited** stdio (stdout/stderr/stdin flow straight to persephone's pipes — no relay code); `command-runner` tracks only the helper's pid and kills the whole tree by `helper.kill()` (the OS closes the helper's last job handle → the job terminates every member atomically). This is *simpler* at the kill site than `taskkill` and strictly more robust, with **no Node native addon**. **Rejected for v1** as unnecessary infra (new crate + CI + dev/packaged binary-path resolution + a spawn-path change for all `app.proc` jobs); revisit only if a board script is observed escaping `taskkill /T`. A bare **kill-by-pid Rust utility** is explicitly **not** worth building — it would merely reimplement `taskkill`. A **Node native Job-Object addon** (N-API/ffi rebuilt against Electron's ABI) is also rejected — heaviest option, would be the codebase's first native addon.
- **C2 — Reap triggers (RESOLVED — `destroyed` + `render-process-gone` only).** Not on in-page navigation: boards **remount** (the webview is destroyed + recreated on config change, → `destroyed`) rather than navigating in place, and the app-shell renderer (the `app.proc` consumer) must not lose its script children on a same-origin navigation. If US-724 ever does an in-place `location.reload()` of a board, it can reap explicitly via `handle.kill()` from the page's `beforeunload`; no new channel is added here.
- **C3 — Observable exit shape changes on Windows (RESOLVED — document only, not a problem).** A POSIX direct-child kill reports `{ code: null, signal: "SIGTERM" }` (the US-719 control test). A Windows `taskkill /F` is **not** a POSIX signal, so the tree-killed child typically reports `{ code: 1, signal: null }` (or similar non-null code). **No consumer breaks:** `proc.on("close")` still fires (no hang), so `exit` is always delivered and the handle settles either way; a caller that wants to know a job was killed already knows (*it* called `kill()`); and `getJson()` correctly rejects a non-zero exit (a killed command produced no valid output). The only follow-through is a **test-expectation change** — acceptance asserts **"`exit` fires and the whole tree is gone"**, not a specific signal string. The exit shape is *not* a reliable cross-platform "was-killed" flag; if one is ever needed (none in EPIC-034), the cheap fix is a caller-side `killed` boolean set inside the handle's `kill()` (no IPC) — **not built for v1**.
- **C4 — `close` must still fire after tree-kill (RESOLVED — by design).** `treeKill` closes the child's stdio (taskkill ends the tree incl. the tracked `cmd.exe`; group-kill signals the leader), so the existing `proc.on("close")` fires → `exit` + `cleanup` run as normal. The `kill` handler therefore does **not** call `cleanup` itself (avoids double cleanup). `reapSender` is the exception: the sender is already gone (its `exit` can't be delivered), so it `cleanup`s eagerly to free the registry immediately.
- **C5 — Quit-time `taskkill` is best-effort (NOTE).** `killAllCommands()` runs in `app.on("will-quit")` and spawns `taskkill` fire-and-forget; the main process may exit before `taskkill` completes. That is acceptable — `taskkill /F` runs independently of our process and tears the trees down regardless. No `event.preventDefault()`/await is added (matches the existing quit-cleanup style).
- **C6 — PID reuse race (NOTE — negligible).** A job's pid is used by `treeKill` only while the job is live in `activeJobs`; once `close` fires, `cleanup` removes it and a later `kill` for that `jobId` no-ops. The window between `close` and a racing `kill` is sub-millisecond and the `activeJobs.get` guard covers it.
- **C7 — Listener hygiene (RESOLVED).** `wireSenderReaping` attaches at most once per WebContents id (`senderReapers` guard); `destroyed` is `once()` and `render-process-gone` is explicitly removed in `reapSender`, so no listener accumulates across a sender's job churn.

## Acceptance criteria

Testable from a Persephone script (`execute_script`) and by inspection:

- **Tree-kill (the headline):** `const h = app.proc.execute('node -e "setInterval(()=>{},1000)"')` (default `shell: true`) → `h.on("exit", …)` then `h.kill()` → **`exit` fires** and the `node` grandchild is gone (verify no orphaned `node` process remains). This is the US-719 case that previously timed out.
- **Direct-child kill still works:** `execute("node -e \"setInterval(()=>{},1000)\"", { shell: false })` + `kill()` → `exit` fires; child gone.
- **Reap on window/webview close:** spawning a long-running child from a window, then closing that window, kills the child's tree (no orphan) — verified via `render-process-gone`/`destroyed` reaping (testable once US-724 webviews exist; for now, closing a second app window reaps its `app.proc` children).
- **Normal completion unaffected:** a fast child (`node -e "console.log(1)"`) still resolves `getText()` → `"1\n"`; `exit { code: 0 }`; no tree-kill invoked.
- **Quit cleanup:** in-flight children (incl. `shell:true` grandchildren) are torn down on app quit.
- **Registry consistency:** after kills and normal exits, `activeJobs` and `jobsBySender` are empty (no leaks); `senderReapers` entries are removed when their sender is destroyed/crashes.
- **No cross-task regression:** the IPC channels, `proc.ts` renderer client, and `app.proc` handle contract are unchanged; `npm run lint` clean; existing worker/tor/git spawn paths unaffected.

## Files changed (summary)

| File | Change |
|------|--------|
| `src/main/command-runner.ts` | spawn `detached` on POSIX; add `treeKill` (Windows `taskkill /T /F`, POSIX process-group kill); add `jobsBySender` + `senderReapers` reverse index with `indexJob`/`wireSenderReaping`/`reapSender`; index on start; keep index consistent in `cleanup`; swap the `kill` handler and `killAllCommands` to `treeKill` |

### Files needing NO changes

- `src/ipc/runner-channels.ts` — kill message (`{ jobId, signal? }`) and all channels are unchanged.
- `src/renderer/api/proc.ts` — `handle.kill()` already sends `RunnerChannel.kill`; reaping is automatic main-side. No renderer change.
- `src/renderer/api/types/proc.d.ts` / `app.d.ts` / `assets/editor-types/` — the handle contract is unchanged; no type or generated-artifact change.
- `src/main/main-setup.ts` — `initCommandRunner()` and `killAllCommands()` (in `will-quit`) are already wired by US-719.
- `worker-host.ts` / `tor-service.ts` / `vlc-launcher.ts` — referenced as background only; not modified (`vlc-launcher` deliberately does the opposite — `detached` + `unref()` to outlive the app).

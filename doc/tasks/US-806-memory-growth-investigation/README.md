# US-806: Memory growth investigation (browser/webview listener leak + attribution)

**Status:** Planned (investigation)
**Created:** 2026-07-04
**Epic:** none (standalone)

## Goal

Diagnose and fix the memory growth reported in a real session: the Persephone process climbs to
**~3 GB** of RAM after extended use, but restarts to **~400 MB** with the *same set of pages
restored*. So the growth is **usage-driven accumulation**, not a function of how many tabs are
open. This task first **attributes** the memory to a specific process/subsystem, then fixes the
dominant consumer — starting from one already-confirmed leak.

> Investigation only for now. Do NOT change code until Phase 1 has attributed the memory (so we
> fix the thing that actually holds the gigabytes, not just the visible warning).

## Background

### Observed symptoms
- Windows Task Manager: "persephone" at ~3 GB after a session; ~400 MB on a fresh restart with
  the same restored pages.
- Terminal (`npm start`) logs during the session included:
  - Repeated `Error occurred in handler for 'GUEST_VIEW_MANAGER_CALL': Error: ERR_ABORTED (-3)
    loading 'https://wvdme.com/link2?…'` / `https://v2006.com/link2?…` — blocked `<webview>`
    ad-redirect navigations (benign in isolation; a *symptom* of an ad-heavy browsing session).
  - `electron: Failed to load URL: https://muzofond.fm/search/… ERR_NAME_NOT_RESOLVED` — the
    user was using the built-in browser on a music-search site.
  - **`(node:…) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11
    destroyed listeners added to [WebContents]. MaxListeners is 10.`** — the key signal.

### Confirmed finding #1 — untracked webview listeners accumulate per navigation

**This is verified by code reading; it directly explains the `MaxListenersExceededWarning`.**

Mechanism (two files):

1. **Re-registration trigger** — `src/renderer/editors/browser/BrowserView.tsx:154-182`.
   The webview registers itself with the main process from inside its **`dom-ready`** handler
   (`onDomReady` → `ipcRenderer.send(BrowserChannel.register, request)`, line 173). `dom-ready`
   fires on **every** document load — each navigation, each ad redirect, each full page load —
   not once per tab. `unregister` is only sent on the effect's cleanup (tab unmount,
   `BrowserView.tsx:242-245`), never between navigations. So a single long-lived tab re-sends
   `register` many times.

2. **The leak** — `src/main/browser-service.ts`, `registerWebview` (line 164).
   Most listeners are attached through the local `on()` helper (line 178), which pushes each
   `{ event, handler }` into a `listeners[]` array so `unregisterWebview` (line 418) can
   `removeListener` them. **Two listeners bypass that helper and are therefore never removed:**
   - `wc.on("did-create-window", …)` — line 386 (a **persistent** listener).
   - `wc.once("destroyed", …)` — line 391 (a `once` listener).

   `registerWebview` calls `unregisterWebview(key)` at line 169 before re-attaching, which
   removes the *tracked* listeners (so `did-navigate`, `context-menu`, `before-input-event`, …
   do **not** stack) — but it does not touch the two untracked ones. Result: on every
   `dom-ready`, another `wc.once("destroyed")` and another `wc.on("did-create-window")` stack on
   the **same live** webContents.

   - The stacked `destroyed` once-listeners are what trip `MaxListenersExceededWarning`
     ("11 destroyed listeners" = ~11 navigations on one webview before the warning).
   - The stacked `did-create-window` listeners are worse: they persist, each closure retains
     `sender`/`tabId`/`internalTabId`, and each fires on **every** popup — re-invoking
     `guardPopupWindow` (line 104) N times per popup, which itself attaches more per-popup
     listeners. On popup-spamming ad sites this compounds.

   `wc.setWindowOpenHandler(…)` (line 341) is re-run too but is a **setter** (replaces, doesn't
   stack) — not part of this leak.

   **Note:** `unregisterWebview` at final unmount also leaves these two behind, but the
   webContents is being destroyed at that point, so the damage is *during* a tab's life, not at
   teardown.

**Honest scope caveat:** these closures are individually small. They fully explain the *warning*
and a steady leak, but likely are **not** the entire 3 GB by themselves. Do not assume fixing
this alone reclaims all the memory — hence Phase 1 (attribution) comes first.

### Ruled out / bounded during triage (read-only, 2026-07-04)
- **`src/main/network-logger.ts`** — per-page log is a **circular buffer capped at 200 entries**
  (`MAX_LOG_ENTRIES`, line 12), bodies skipped over 100 KB, session hooks idempotent via a
  `WeakSet`, and `clearNetworkLog(key)` runs on unregister (`browser-service.ts:434`). Not a
  primary suspect (still worth confirming `pageLogs`/`pagePending` keys don't accumulate across
  heavy key churn).
- **`src/main/command-runner.ts`** — its `wireSenderReaping` (line 154) *is* guarded
  (`senderReapers.has` / one listener per sender). Not the source of the WebContents warning.
- **`src/main/board-bridge.ts:363`** — a single `hostWebContents.once("destroyed", …)` per host;
  not obviously stacking (confirm during Phase 1 if boards were in use).

### Second suspect — the webview's own Chromium renderer process
Persephone is multi-process; Windows Task Manager sums main + every renderer + GPU under
"persephone". The session drove a `<webview>` on an ad/autoplay-heavy music site, which runs in
its **own renderer process** and can bloat to gigabytes from ad iframes, autoplay media, and
redirect churn — largely independent of our code. This is a **separate** contributor from the
listener leak and must be attributed, not assumed.

## Investigation plan

### Phase 1 — Attribute the memory (do this FIRST, no fixes)
1. **Per-process breakdown (main).** Sample `app.getAppMetrics()` periodically (e.g. every 30 s
   to the terminal / a log file): each entry has `pid`, `type` (`Browser`/`Tab`/`GPU`/`Utility`),
   and `memory.workingSetSize`. Identify which process grows — main vs. a specific webview
   renderer vs. the app renderer. This single measurement decides the rest of the task.
2. **WebContents / window census.** Log `webContents.getAllWebContents().length` and
   `BrowserWindow.getAllWindows().length` over the session — detects leaked popup windows or
   undestroyed guest webContents (would point at the popup-guard path).
3. **Listener census.** For the browser webview's `wc`, log `wc.listenerCount("did-create-window")`
   and `wc.listenerCount("destroyed")` after several navigations — should directly confirm
   finding #1 and quantify the stacking.
4. **Renderer heap snapshot.** Take a DevTools heap snapshot of the app renderer after heavy use
   vs. fresh; compare retained sizes. Look specifically for renderer-side accumulation:
   - Monaco `ITextModel`s not disposed when a tab/editor closes.
   - `EventChannel` subscriptions never unsubscribed (LIFO channels in
     `src/renderer/api/events/`).
   - `FileWatcher` / `DirectoryWatcher` instances not disposed
     (`src/renderer/core/utils/file-watcher.ts`).
   - CDP debugger sessions left attached (`src/main/cdp-service.ts` /
     `src/renderer/automation/`), if browser automation was used.
   - Editor models (`EditorModel` subclasses) retained after page close.

### Phase 2 — Fix by finding (after attribution)
- **Finding #1 (browser-service listener leak)** — candidate fixes (pick during implementation):
  - Route the two stray listeners (`did-create-window`, `destroyed`) through the tracked `on()`
    helper so `unregisterWebview` removes them; **and/or**
  - Make `registerWebview` idempotent: if the `key` is already registered to the **same**
    `webContentsId`, skip re-attaching (only the tracked per-navigation state needs refreshing),
    or short-circuit re-registration entirely on `dom-ready` when the webContents id is unchanged;
    **and/or**
  - Move registration off `dom-ready` (which re-fires) to a once-per-webview signal, keeping only
    the genuinely per-navigation updates on `dom-ready`.
- **Dominant consumer from Phase 1** — fix whatever the attribution pins (e.g. dispose Monaco
  models / watchers / CDP sessions on teardown; ensure popup windows are closed; consider a
  webview "discard/reload on idle" or memory cap for ad-heavy pages if the bloat is Chromium-side).

## Concerns / open questions
- **Is the 3 GB mostly the webview renderer or our own leaks?** Unknown until Phase 1 — do not
  pre-commit to a fix. The listener leak is confirmed but may be a minor fraction.
- **Reproduction.** The report is from ad-heavy browsing; a deterministic repro (a page that
  navigates in a loop, or a synthetic `dom-ready` storm) will make before/after measurement
  credible. Capturing the exact site is not needed (and its ad domains are hostile) — a benign
  looping-navigation page suffices to reproduce finding #1.
- **`MaxListeners` bump vs. real fix.** Raising `setMaxListeners` would silence the warning
  without fixing the leak — explicitly out of scope; the listeners must actually be removed.

## Acceptance criteria
1. A written attribution (from Phase 1 measurements) naming the process(es) and subsystem(s)
   responsible for the growth, with before/after numbers.
2. `wc.listenerCount("destroyed")` / `wc.listenerCount("did-create-window")` stay **bounded**
   across many navigations on one webview (no linear growth); the `MaxListenersExceededWarning`
   no longer appears in normal browsing.
3. The dominant consumer identified in Phase 1 is fixed or has a documented mitigation.
4. A repeatable measurement shows meaningfully lower steady-state memory after a comparable
   session (target: no unbounded climb; a session no longer trends toward multi-GB).
5. `npm run lint` clean; changes follow coding-style (no stray listeners left untracked).

## Files implicated (for the eventual fix — no changes yet)
| File | Role in the investigation |
|------|---------------------------|
| `src/main/browser-service.ts` | **Confirmed leak** — untracked `did-create-window` (line 386) + `destroyed` (line 391) listeners re-attached on every `registerWebview`; `unregisterWebview` (line 418) removes only tracked `listeners[]`. |
| `src/renderer/editors/browser/BrowserView.tsx` | **Re-registration trigger** — `register` sent from the re-firing `dom-ready` handler (line 173); `unregister` only on unmount (line 244). |
| `src/main/network-logger.ts` | Bounded (200-entry ring); confirm no key accumulation. |
| `src/main/cdp-service.ts`, `src/renderer/automation/*` | Check for CDP debugger sessions left attached (if automation was used). |
| `src/renderer/core/utils/file-watcher.ts` | Check `FileWatcher`/`DirectoryWatcher` disposal. |
| `src/renderer/editors/**` (`EditorModel` subclasses), Monaco models | Check disposal on tab/editor close (renderer heap snapshot). |
| `src/renderer/api/events/*` (`EventChannel`) | Check for un-disposed LIFO subscriptions. |

## Notes

### 2026-07-04
- Task created from a user report (~3 GB session vs. ~400 MB fresh restart with same pages).
  User directive: **investigate later, do not fix now** — this doc captures the diagnosis so it
  survives context.
- **Finding #1 confirmed by code reading** (browser-service untracked listeners + `dom-ready`
  re-registration) — directly explains the `MaxListenersExceededWarning: 11 destroyed listeners
  added to [WebContents]`.
- Deliberately **not** yet attributed: whether the bulk of the 3 GB is the ad-heavy webview's own
  Chromium renderer vs. our accumulation. Phase 1 (`app.getAppMetrics()` + WebContents census +
  heap snapshot) decides this before any fix.
- Triage ruled network-logger (bounded ring buffer) and command-runner (guarded reaping) out as
  primary suspects.
</content>

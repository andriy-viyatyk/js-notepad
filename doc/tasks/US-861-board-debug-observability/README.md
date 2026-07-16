# US-861: Board debugging observability (console → ui.log, deterministic board_refresh)

**Epic:** [EPIC-044 — Board Secondary Views](../../epics/EPIC-044.md) · **Fixes:** US-859 problems #8, #10 · **Status:** implemented + live-verified (2026-07-16)

> Live verification (dev build, scratch content-host board): a board calling `console.error("us861-console-error-marker", {n: 1})` / `console.warn(...)` produced `[error] console.error: us861-console-error-marker {"n":1}` and `[warn] console.warn: …` lines in its `ui.log`; `board_refresh` returned `{ refreshed: true, frameReady: true }` and the board's `ui.log` showed the frame had fully reloaded (fresh `board loaded` line) before the tool returned.

## Goal

Give a board-authoring agent visibility into a board frame's runtime errors/warnings (routed to the board's `ui.log`), and make the `board_refresh` MCP tool resolve only after the reloaded frame is actually re-rendered and automation-ready — eliminating the refresh→snapshot staleness race.

## Background

- **Console blindness (US-859 #8).** `src/board-shim.ts` already posts uncaught `window` errors, unhandled rejections, and CSP violations to the host frame as `board:error` (`postHostError`), which `BoardWebview.tsx` appends to the board's `ui.log`. But `console.error`/`console.warn` calls (the way board code and libraries actually report problems) go nowhere the agent can see.
- **Refresh race (US-859 #10).** `refreshBoard` in `src/renderer/api/mcp-handler.ts` calls `BoardEditorModel.reloadBoard()` (bumps `reloadToken` → React remounts the iframe) and returns **synchronously**. A `browser_snapshot` issued right after can hit the *old* frame (still mounted until React re-renders) or a not-yet-loaded new frame. The renderer-observable "new frame ready" signal already exists: `BoardWebview.handleLoad` fires on the new iframe's `load` and calls `model.markFrameLoaded(tabId)` after the CDP registration IPC resolves — exactly the "attachable now" state automation needs.

## Implementation plan

### 1. Console capture — shim + channel + host

- [ ] `src/ipc/board-bridge-channels.ts` — add `"board:log"` to the `BoardToHostMsg.__persephone` union and an optional `level?: string` field (used by `board:log`; documents `"warn" | "error"`).
- [ ] `src/board-shim.ts` — next to the existing mode B/E detectors, wrap `console.error` and `console.warn` to also post `board:log`:
  ```ts
  // Mode F: console.error/warn — board code and libraries report problems via the
  // console the agent can't see. Mirror them to ui.log (original console untouched).
  function formatConsoleArg(a: unknown): string {
      if (typeof a === "string") return a;
      if (a instanceof Error) return a.stack || a.message;
      try { return JSON.stringify(a); } catch { return String(a); }
  }
  function wrapConsole(level: "warn" | "error"): void {
      const original = console[level].bind(console);
      console[level] = (...args: unknown[]) => {
          original(...args);
          try {
              const message = args.map(formatConsoleArg).join(" ").slice(0, 4000);
              window.parent.postMessage(
                  { __persephone: "board:log", level, message: `console.${level}: ${message}` },
                  hostPostTarget,
              );
          } catch { /* parent gone */ }
      };
  }
  wrapConsole("warn");
  wrapConsole("error");
  ```
  Note: the shim's own internal `console.error` calls (e.g. the `onContentChange` callback-error catch) ride the wrapper too — desirable.
- [ ] `src/renderer/editors/board/BoardWebview.tsx` — in `onMessage`, handle the new kind: `board:log` with a `message` → `appendLog(d.level === "warn" ? "warn" : "error", d.message)`. LOG-ONLY, like `board:error` (no toast).
- [ ] `console.log`/`info` are deliberately **not** captured (ui.log noise); full console capture via CDP `Runtime.consoleAPICalled` is a possible later layer (noted in US-859).

### 2. Deterministic `board_refresh`

- [ ] `src/renderer/editors/board/BoardEditorModel.ts` — add a next-load waiter next to `markFrameLoaded`:
  ```ts
  /** Resolvers waiting for the NEXT markFrameLoaded of a tab (board_refresh determinism). */
  private frameLoadWaiters: Array<{ tab: string; resolve: (ok: boolean) => void }> = [];

  markFrameLoaded(tab: string): void {
      this.loadedTabs.add(tab);
      this.frameLoadWaiters = this.frameLoadWaiters.filter((w) => {
          if (w.tab !== tab) return true;
          w.resolve(true);
          return false;
      });
  }

  /** Resolve true when the NEXT frame-load of `tab` completes (i.e. the remounted
   *  frame is rendered + CDP-registered), or false on timeout. Call AFTER reloadBoard(). */
  waitForFrameLoad(tab: string = BOARD_CDP_TAB, timeoutMs = 5000): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
          const waiter = { tab, resolve };
          this.frameLoadWaiters.push(waiter);
          setTimeout(() => {
              const i = this.frameLoadWaiters.indexOf(waiter);
              if (i >= 0) { this.frameLoadWaiters.splice(i, 1); resolve(false); }
          }, timeoutMs);
      });
  }
  ```
  Also resolve all pending waiters with `false` in `dispose()` (before `loadedTabs.clear()`).
- [ ] `src/renderer/api/mcp-handler.ts` — `refreshBoard` becomes async: register the waiter **before** `reloadBoard()` (no gap), await it, and report readiness:
  ```ts
  // before
  (editor as BoardEditorModel).reloadBoard();
  return { result: { refreshed: true, pageId: page.id } };
  // after
  const board = editor as BoardEditorModel;
  const ready = board.waitForFrameLoad();      // resolves on the remounted main frame's load
  board.reloadBoard();
  const frameReady = await ready;
  return { result: { refreshed: true, pageId: page.id, frameReady } };
  ```
  `frameReady: false` (timeout) still reports `refreshed: true` — the reload was issued; the flag tells the agent the load signal never arrived (e.g. a broken board HTML) so it knows to check `ui.log` instead of snapshotting garbage.
- [ ] Update the `board_refresh` tool description in `src/main/mcp-http-server.ts`: the tool now waits for the reloaded board's main frame to finish loading; mention the `frameReady` flag.

## Concerns

- Only the **main** frame is awaited. Secondary-view frames also remount on `reloadToken` and *usually* finish around the same time; a snapshot of a secondary frame immediately after refresh could in principle still race. Accepted for now (the automation `ensureReady`/`switchTab` path already waits per-tab); can be extended to "await all currently-loaded tabs" if it bites.
- The `console.warn`/`error` wrapper changes the functions' identity on `window.console`; board code that itself monkey-patches the console composes fine (we bind the value at wrap time). No known conflict.

## Acceptance criteria

- A board that calls `console.error("boom", {a: 1})` produces a `[error] console.error: boom {"a":1}` line in its `ui.log` (visible via the in-board Show-log / reading `ui.log`); `console.warn` lands as `[warn]`. Both frames (main + secondary) report.
- `board_refresh` returns only after the reloaded main frame has loaded and re-registered for CDP; an immediately-following `browser_snapshot` shows the **new** frame content (no stale snapshot).
- `board_refresh` on a board whose HTML fails to load returns within ~5s with `frameReady: false`.

## Files changed

| File | Change |
|------|--------|
| `src/ipc/board-bridge-channels.ts` | `"board:log"` kind + `level` field on `BoardToHostMsg` |
| `src/board-shim.ts` | `console.error`/`warn` wrapper posting `board:log` |
| `src/renderer/editors/board/BoardWebview.tsx` | Handle `board:log` → `appendLog(level, message)` |
| `src/renderer/editors/board/BoardEditorModel.ts` | `waitForFrameLoad()` + waiter resolution in `markFrameLoaded`/`dispose` |
| `src/renderer/api/mcp-handler.ts` | `refreshBoard` awaits the remounted frame; `frameReady` in the result |
| `src/main/mcp-http-server.ts` | `board_refresh` tool description update |

**No changes needed:** `src/main/board-bridge.ts` (the port channel is untouched — `board:log` rides the window.postMessage host-frame channel like `board:error`), `cdp-service.ts`, `BoardTargetModel.ts`.

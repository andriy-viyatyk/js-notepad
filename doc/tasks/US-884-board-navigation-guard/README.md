# US-884: Prevent board iframe navigation (frame-level guard + route external links)

## Goal

Stop a board's `<iframe>` from ever navigating away from its own `board://<host>` origin (which produces a blank/white screen), and instead route the intended link through Persephone's normal `openRawLink` flow so the click still does something useful. This is a core safety net that protects **every** board, not a per-board patch.

## Background

### The bug

A board (e.g. `word-viewer`) that renders HTML containing real `<a href="http://…">` anchors will, on click, navigate the **board iframe itself** to that URL. `board://` cannot load `http`, so the frame ends up blank — the reported white screen. The same happens for any same-frame navigation (`window.location =`, form submit, meta-refresh) that targets something outside the board's own origin.

### Why the existing guard doesn't catch it

Persephone already has a navigation guard, but it only covers the **top/main frame**:

- `src/main/open-window.ts:131` — `this.window.webContents.on("will-navigate", …)`. `will-navigate` fires **only for the main frame**. It blocks stray navigations and routes unknown URLs to the renderer via `EventEndpoint.eOpenUrl` (`open-window.ts:184-185`).
- `src/main/open-window.ts:126` — `setWindowOpenHandler(…)` already denies `target="_blank"` / `window.open` popups and routes them to `eOpenUrl`. So `_blank` links from a board likely **already** work; the gap is same-frame navigation.

The board is an **out-of-process subframe (OOPIF)** on a `board://<host>` origin. Subframe navigations do **not** fire `will-navigate` — they fire `will-frame-navigate` (Electron ≥ 22; we run Electron 43). Nothing currently listens to it, so the board frame is free to navigate itself blank.

### The routing target already exists

`eOpenUrl` is the right channel to reuse:

- Main sends `EventEndpoint.eOpenUrl` (`open-window.ts:185`, via `this.send(...)`).
- Renderer handles it in `RendererEventsService.handleOpenUrl` (`src/renderer/api/internal/RendererEventsService.ts:93-96`), which calls `app.events.openRawLink.sendAsync(createLinkData(url))`.

So forwarding a blocked board-frame URL through `eOpenUrl` is exactly the `openRawLink` pipeline — no new IPC or plumbing needed.

### Legitimate in-board navigation must stay allowed

Boards may navigate between their own pages (`board://<host>/page2.html`). `BoardWebview.handleLoad` (`src/renderer/editors/board/BoardWebview.tsx:178`) already re-runs the port handshake / CDP registration on every frame `load`, so same-origin board navigation is a supported, working path. The guard must **only** block navigations that *leave* the frame's current `board://<host>` origin.

## Implementation plan

All changes are in **`src/main/open-window.ts`**, in the `OpenWindow` constructor, right after the existing `will-navigate` listener (around line 186).

### Step 1 — Add a `will-frame-navigate` listener

```ts
this.window.webContents.on("will-frame-navigate", (details) => {
    // `details` is the modern single-object form: has `url`, `frame`, `isMainFrame`,
    // `isSameDocument`, `preventDefault()`. The main frame is already covered by the
    // `will-navigate` handler above — skip it here.
    if (details.isMainFrame) return;

    const currentUrl = details.frame?.url ?? "";
    // Only guard frames that currently live on a board:// origin. Other subframes
    // (e.g. the built-in browser's <webview>, dev iframes) keep their own behavior.
    if (!currentUrl.startsWith("board://")) return;

    // Same-origin in-board navigation (board://<host>/other.html) is legitimate — allow it.
    let currentOrigin = "";
    let targetOrigin = "";
    try {
        currentOrigin = new URL(currentUrl).origin;   // "board://<host>"
        targetOrigin = new URL(details.url).origin;
    } catch {
        // unparseable target → treat as external, block below
    }
    if (targetOrigin && targetOrigin === currentOrigin) return;

    // Leaving the board origin → would blank the frame. Block it.
    details.preventDefault();

    // Route http/https/file/mailto (etc.) through the normal openRawLink pipeline so the
    // click still opens the link in a Persephone page / browser / external handler.
    // Mirror the main-frame guard: forward everything we blocked to eOpenUrl.
    this.send(EventEndpoint.eOpenUrl, details.url);
});
```

Notes / details to resolve during implementation:
- **Event signature:** confirm Electron 43's `will-frame-navigate` callback shape. Modern Electron passes a single `details` object (a `WebContentsWillFrameNavigateEventParams` extending `Event`) exposing `url`, `frame`, `isMainFrame`, `isSameDocument`, and `preventDefault()`. If the installed typings differ, adapt the destructuring accordingly.
- **Initial load is safe:** on the iframe's first navigation to `board://<host>/index.html`, `details.frame.url` is still `about:blank` (not `board://`), so the guard's `startsWith("board://")` check skips it. Verify.
- **`isSameDocument`:** in-page hash/`history.pushState` navigations arrive with `isSameDocument: true` and same origin; the same-origin check already allows them, but consider early-returning on `details.isSameDocument` for clarity.
- **`EventEndpoint` is already imported** at `open-window.ts:5` — no new import needed.

### Step 2 — Decide the "what to route" policy

Simplest and consistent with the main-frame handler: forward **every** blocked (non-same-board-origin) URL to `eOpenUrl` and let the existing `openRawLink` → parser pipeline decide (it already handles http/https/file/mailto/unknown gracefully). Only revisit if a scheme proves problematic in testing.

### Step 3 — Manual verification with `word-viewer`

Use the existing `D:\projects\persephone-boards\boards\word-viewer` board with a document that contains an `http` link. Confirm: click no longer blanks the board, and the link opens through the normal flow.

## Implementation note (revised during testing)

Testing revealed the main-process `will-frame-navigate` guard is **not sufficient on its own** for the reported case. A board renders its content directly in its top `board://<host>` document (e.g. word-viewer renders the .docx into `#doc`), so a hyperlink click navigates the board frame itself. The **host renderer's `frame-src` CSP** cancels that navigation *in the renderer process* (`ERR_BLOCKED_BY_CSP`) before it ever becomes a browser-process navigation — so `will-frame-navigate` never fires, and the frame is left blank.

The reliable fix is therefore at the **DOM level, inside the board shim** (`src/board-shim.ts`), which runs in every board frame and can intercept the anchor activation *before* any navigation starts:

- **Primary fix — `src/board-shim.ts`:** a bubble-phase `click` (+ middle-click `auxclick`) listener that finds the activated `<a href>`, and if the resolved `href` is not `board://…` (and not `javascript:`), calls `e.preventDefault()` + `fire("openRawLink", [href])`. Relative/`#fragment` links resolve to `board://` and are left to navigate in-frame. A board can opt out by calling `preventDefault()` itself first (the handler honors `defaultPrevented`).
- **Backstop — `src/main/open-window.ts`:** the `will-frame-navigate` guard is kept as defense-in-depth for any navigation that *does* reach the browser process (e.g. programmatic navigation that CSP would permit). No double-open risk: the shim's `preventDefault()` stops click-driven navigation before this event can fire.

## Concerns / Open questions

1. **Scope of the `board://` check.** The guard keys off `details.frame.url.startsWith("board://")`, so it affects **only** board frames — the built-in browser `<webview>` (different webContents) and any other subframe are untouched. Confirm no other in-app subframe legitimately relies on same-frame cross-origin navigation. (Boards are the only `board://` frames.)
2. **`_blank` links already handled?** `setWindowOpenHandler` should already catch `target="_blank"` from board frames and route to `eOpenUrl`. Verify during testing; if it doesn't fire for OOPIFs, note it as a follow-up (out of scope here).
3. **Board-author override (out of scope, document only).** Boards that want finer control (choose target editor, force external) can still intercept clicks themselves and call `persephone.openRawLink(href, { editor })`. The core guard is the safety net; it does not prevent a board from handling links first. Consider a one-line mention in the board authoring guide (`/assets/board-template/CLAUDE.md`) during `/document`.
4. **Multi-window.** `OpenWindow` is per-window and each instance attaches its own listener, so this works for every window automatically. No global registry needed.
5. **Secondary board frames.** Secondary-view board frames share the same `board://<host>` origin and are also OOPIFs of the same window webContents, so they're covered by the same listener. Verify a secondary frame with a link behaves identically.

## Acceptance criteria

- [ ] Clicking an `http`/`https` link inside a board frame no longer blanks the board; the frame stays intact.
- [ ] The clicked link opens through the normal `openRawLink` flow (Persephone page / browser / external per app behavior).
- [ ] Same-origin in-board navigation (`board://<host>/other.html`) still works (port re-handshake fires, board reloads its own page).
- [ ] The built-in browser `<webview>` and all other in-app navigation are unaffected.
- [ ] Verified against the `word-viewer` board with a document containing a real http link.

## Files

| Purpose | File |
|---|---|
| Add the `will-frame-navigate` guard (main change) | `src/main/open-window.ts` (after ~line 186) |
| Reference: existing main-frame guard + `eOpenUrl` send | `src/main/open-window.ts:131-186` |
| Reference: renderer `eOpenUrl` → `openRawLink` handler | `src/renderer/api/internal/RendererEventsService.ts:93-96` |
| Reference: board frame load / re-handshake | `src/renderer/editors/board/BoardWebview.tsx:178` |

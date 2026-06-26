# EPIC-037: Migrate Board `<webview>` → `<iframe>`

## Status

**Status:** Completed
**Created:** 2026-06-26
**Updated:** 2026-06-26
**Completed:** 2026-06-26

## Overview

Boards are hosted today in an Electron **`<webview>` tag** (`BoardWebview.tsx`). The
`<webview>` tag is legacy, heavyweight, and slow to attach: every open spins up a fresh
out-of-process sandboxed renderer on a brand-new `board-<uuid>` session partition, gated
behind an async `registerBoardProtocol` round-trip before navigation even starts — so every
open is a guaranteed cold start with visible latency.

This epic migrates the board host to a plain **`<iframe>`** rendered in the host renderer's
DOM, loading the board's own files cross-origin over the `board://` scheme. The move is
justified by the board threat model: **a board is trusted, local, extension-like code the
user explicitly authorized** (the trust dialog; a board can already run arbitrary processes
via `execute()`). It is *not* untrusted remote web content, so it does not require the OS
process-isolation that `<webview>`/`WebContentsView` provide. A cross-origin `board://<host>`
iframe with `nodeIntegrationInSubFrames: false` + CSP is isolated from the Node-privileged
host by the **Same-Origin Policy**, which is adequate for trusted code — and, because the
iframe lives **in the DOM**, all host overlays (the page-tab context menu, dropdowns,
dialogs, the command palette, tooltips) compose over it naturally. This is the same model
VS Code uses for its editor webviews.

Bundled into this epic (shippable first, independently) is a fix for a long-standing
**multi-render "blink" on board open**: the board's file watchers bump a remount token on
spurious filesystem events, remounting the host 1–3× on a single open. The auto-reload is
redundant once a board is built and merely *used*; we remove it, keep the manual **Reload**
toolbar action, and add a **`board_refresh`** MCP tool so an agent can reload a board after
editing its files.

## Goals

- Replace the board `<webview>` tag with an in-DOM `<iframe>`, eliminating the tag's
  per-open cold-start overhead and the native-layer z-order problems of `WebContentsView`.
- Keep boards isolated to a degree appropriate for trusted code: cross-origin
  `board://<host>` + `nodeIntegrationInSubFrames: false` + the `board://` CSP + per-board
  origin (so one board can't read another's storage or reach the host window).
- Re-home the privileged `persephone` bridge from a webview preload to a **`postMessage`
  RPC** between the board frame and the host (which performs privileged work).
- Preserve board automation (`browser_*` tools + `BoardTargetModel`) by targeting the
  board **frame** rather than a separate `webContents`.
- Remove the redundant auto-reload (the blink), keep manual Reload, add `board_refresh`.
- Measurably reduce board open latency; gate the migration on a before/after measurement.

## Options considered

| Option | Open speed | Overlay z-order | Isolation | Cost | Verdict |
|--------|-----------|-----------------|-----------|------|---------|
| **A. Optimize current `<webview>`** (keep-alive, pre-warm, deterministic partition) | better | ✅ in DOM, fine | strong (process) | lowest — no rewrite | **Fallback** if B proves too heavy |
| **B. Migrate to `<iframe>`** | likely best (lightweight, in DOM) | ✅ in DOM, fine | adequate for trusted code (SOP + CSP) | one-time: bridge → postMessage, CDP → frame | **Chosen** |
| **C. Migrate to `WebContentsView`** | better | ❌ native layer — breaks overlays | strong (process) | ongoing z-order tax on every overlay | **Rejected** — only option that regresses overlays |

The deciding factors: boards are trusted (so `<iframe>` isolation suffices), `<iframe>` keeps
DOM compositing (no z-order regression — the reason `WebContentsView` was rejected), and the
`<webview>` tag is discouraged by Electron long-term. `<iframe>`'s costs are mostly one-time
(rewrite the bridge + automation) versus `WebContentsView`'s ongoing overlay-hiding tax.

## Background — current architecture (the surface to migrate)

### The `<webview>` host (renderer)
- `BoardWebview.tsx` — renders `<webview src="board:///index.html" partition preload
  webpreferences="contextIsolation=yes,sandbox=yes">` (`:131-145`); fresh ephemeral partition
  per mount (`:28`); `ready` gate after `registerBoardProtocol` (`:32-48`). DOM couplings:
  `getWebContentsId()` for CDP (`:80`), `dom-ready` (`:82`), `did-fail-load` → `ui.log`
  (`:64`), `focus` → synthetic `mousedown` to dismiss host overlays (`:99-104`), host→guest
  theme push `webviewRef.send(themeChanged, palette)` (`:116`).
- `BoardEditorView.tsx:51-62` — keys the host by `` `${selectedBoard}__${reloadToken}` `` (`:56`).
- `BoardEditorModel.ts` — `currentWebview` (`:94`), `reloadBoard()` → `reloadToken++` (`:215`);
  the two watchers in `watchSelectedBoard()` (`:230-257`).
- `BoardTargetModel.ts` — automation: `cdp()`, `focusWebview()`, `insertText()`, `reload()`
  on `model.currentWebview`.

### Main-process pieces (mostly reusable)
- `board-protocol-service.ts` — per-partition `ses.protocol.handle("board", …)`, `BOARD_CSP`,
  parse-time `--p-*` theme injection. Keyed by session today; moves to host-session +
  host-routed (see C8). Theme injection at serve time carries over.
- `board-bridge.ts` + `board-bridge-channels.ts` — the `ipcMain` bridge
  (`getContext`/`openRawLink`/`notify`/dialogs/`readFile`/`writeFile`). **This is what becomes
  a postMessage protocol** (C1).
- `cdp-service.ts` — `registerBoardWebContents` keyed by `${editorId}/${BOARD_CDP_TAB}`; CDP
  on a `WebContents`. **Reworks to frame targeting** (C3).
- `main-setup.ts:44-52` — `board` scheme declared privileged (`standard` + `secure` +
  `supportFetchAPI`); `standard` is the prerequisite for host-based origins (C5/C6).
- `preload.ts:43-52` — exposes `boardPreloadUrl`. The preload model goes away with iframe (C1).

### The blink (auto-reload) — US-769
`watchSelectedBoard()` attaches an `index.html` `FileWatcher` → `reloadToken++` (`:241-243`,
remove) and a board-folder `DirectoryWatcher` that does **two jobs**: keep `logHasErrors` +
the board icon current (`:247-248`, **keep**) and auto-reload on `.js`/`.css` edits
(`:252-254` via `isBoardReloadSource` `:23-27`, **remove**). Spurious Windows `fs.watch`
events at attach (first open / board switch) bump `reloadToken` → extra remounts → the blink.

## Architecture — target design (`<iframe>`)

1. **Host element.** `BoardWebview.tsx` becomes a thin component rendering
   `<iframe src="board://<host>/index.html">` in the board slot — a normal flex child, no
   bounds tracking, composes with DOM overlays. `<webview>`-only attributes (`partition`,
   `preload`, `webpreferences`) are gone.
2. **Origin & isolation.** Each board loads a **distinct cross-origin** `board://<host>`
   (host = hash of the board root — see C5/C6), in the **host renderer's shared session**.
   `nodeIntegrationInSubFrames` stays off; SOP blocks `window.parent` access; the served
   `BOARD_CSP` forbids remote.
3. **Protocol.** `board://` registers **once** on the host session and routes by **host →
   board root** (replacing the per-partition handler); parse-time `--p-*` injection unchanged.
4. **Bridge.** `persephone.*` is delivered by a **`postMessage` RPC**: the board posts to the
   host; the host (Node-privileged) performs `execute`/`readFile`/`writeFile`/dialogs/links
   and posts results back, streaming `execute()` stdout/stderr/exit as messages. A small
   in-board shim re-creates the `window.persephone` surface over `postMessage`.
5. **Theme.** Parse-time injection themes first paint; live theme switches are pushed
   host→board via `postMessage` (replacing `webview.send()`).
6. **Automation.** CDP targets the board **frame** (frameId / execution context, or the OOPIF
   target if out-of-process); `BoardTargetModel` reload/focus/insertText act on the frame.
7. **Reload.** Soft reload = `iframe.contentWindow.location.reload()` (or re-set `src`); the
   public entry points (`reloadBoard()`, `board_refresh`) stay, implementation changes.

## Linked Tasks (in implementation order)

Ordered by dependency, not by id. **Renderer-only** tasks hot-reload; tasks touching
**main-process** code (marked ⟳) require a full `npm start` restart to test.

| # | Task | Title | Depends on | Status |
|---|------|-------|-----------|--------|
| 0 | US-776 | **Spike/POC** — `<iframe>` pre-script injection & bridge handshake; see [task](../tasks/US-776-iframe-bridge-poc/README.md) | — | ✅ **done — proven end-to-end** (gate passed) |
| 1 | US-769 | [Remove board auto-reload (blink fix); keep manual Reload; add `board_refresh` MCP tool](../tasks/US-769-remove-board-auto-reload/README.md) | — (independent) | Planned — **ships first** |
| 2 | US-770 ⟳ | [`<iframe>` host (no `sandbox` attr — C5) + cross-origin `board://<host>` loading on the shared session; host-routed `board://` handler (C8); host-page CSP fix (`child-src … board:` — C7, **not** `frame-src`)](../tasks/US-770-iframe-host-and-handler/README.md) | US-776 | Planned |
| 3 | US-775 | **Go/no-go gate** — measure iframe open latency vs. the current `<webview>` (and vs. Option A). If iframe isn't meaningfully faster, **stop here** and fall back to optimizing the `<webview>` | US-770 | ✅ **GO** — iframe opens instantly (like a native editor); `<webview>` was ~500 ms best case, up to ~2 s. Migration proceeds (4–7 unblocked) |
| 4 | US-771 ⟳ | [**`MessagePort` RPC bridge** — `MessageChannelMain` board↔**main** (execute streaming, files, links, notify, dialogs, getContext, theme push); the `window.persephone` shim is **auto-injected by the `board://` handler** (no preload); renderer brokers the **one-time** handshake with C2 origin hygiene (`targetOrigin:'board://<host>'` on transfer + shim `event.origin`/`event.source` checks); **retire `preload-board.ts`**](../tasks/US-771-messageport-bridge/README.md) | US-770 (+ GO from US-775) | Planned — **biggest task** |
| 5 | US-772 ⟳ | [Storage & theme **parity verification** — per-board-host origin storage isolation (C6); reload-keeps-storage model (C12); theme acceptance: (a) no white flash on open, (b) mid-session retint over the C1 port (C9). *Transport built in US-771; this task verifies parity + decides persist-vs-ephemeral*](../tasks/US-772-storage-theme-parity/README.md) | US-771 | Planned |
| 6 | US-773 ⟳ | [Automation parity — CDP on the board **frame**; `BoardTargetModel` reload/focus/insertText; focus→host-overlay dismissal over the cross-origin boundary (C10). **Agent contract frozen** — only `BoardTargetModel` internals + `cdp-service` registration change; `IBrowserTarget`, `getTarget()`, the `browser_*` schemas (pageId-only), `commands.ts`/`snapshot.ts`/`input.ts` stay identical](../tasks/US-773-automation-frame-parity/README.md) | US-770 (may overlap US-771/772) | Planned |
| 7 | US-774 ⟳ | Lifecycle — load-failure / CSP-violation reporting → `ui.log` (**C11: A** `did-fail-load` on host webContents filtered to the board frame + **B** shim `securitypolicyviolation`→postMessage + **D** handshake watchdog + **E** shim `window.onerror`); board switch/close/dispose; multi-window | US-771 (mode D needs the bridge) | Planned |

### Order rationale
- **US-769 first, fully independent** — fixes the open-time blink + adds `board_refresh`
  without touching the host technology; can ship before anything else (and before the
  go/no-go is even decided).
- **US-775 is the gate, not the finale.** C14 resolved that we measure *before* committing
  the bridge/automation rewrites. Once US-770 renders a real `board://<host>` iframe (themed
  by parse-time injection), we measure frame-attach/first-paint — the exact `<webview>`
  cold-start we're eliminating. The bridge handshake is cheap and POC-proven, so it need not
  exist to measure the win. If iframe isn't faster, US-771–774 never start (fall back to
  Option A). US-775 can measure against a minimal board (or to `did-frame-finish-load`); it
  does **not** need a functional bridge.
- **US-771 is the largest task** and the point of no return — it retires `preload-board.ts`,
  moves the bridge into main, and rebuilds the whole `persephone` surface over the port.
- **Theme ownership is split cleanly:** parse-time `--p-*` first paint → US-770 (the handler);
  the host→board theme-push message over the port → US-771 (transport); the parity
  acceptance (no-flash + retint) → US-772 (verification).
- **US-773 (automation) depends only on the frame existing (US-770)**, not on the bridge, so
  it may run in parallel with US-771/772 if capacity allows.

### US-769 detail (the quick win)
Full implementation plan (verified line numbers, before→after snippets, MCP wiring, doc
edits, acceptance criteria) lives in the task doc:
[US-769 — Remove board auto-reload](../tasks/US-769-remove-board-auto-reload/README.md).
In brief: remove the `index.html` `FileWatcher` + the `DirectoryWatcher`'s `.js`/`.css`
reload branch (`isBoardReloadSource`) — these bump `reloadToken` on spurious `fs.watch`
events at attach, causing the open-time blink; **keep** the `DirectoryWatcher`'s log-indicator
+ icon refresh, `reloadBoard()`, `reloadToken`, the keyed remount, and the toolbar Reload
button. Add a **`board_refresh`** MCP tool (optional `pageId`, defaults to active board →
`reloadBoard()`). Update the three consumer board docs (`mcp-res-boards.md`,
`board-template/CLAUDE.md`, `demo-board/index.html`) — auto-reload removed; use the toolbar
Reload button / `board_refresh`.

## Concerns / Open questions — `<iframe>`-specific (to review one by one)

| # | Concern | Notes |
|---|---------|-------|
| C1 | **Bridge transport → `MessagePort` to main** *(resolved — transport chosen)* | An `<iframe>` can't run an Electron `preload`/`contextBridge`, so the `persephone` surface (`execute`, `readFile`, `writeFile`, `openRawLink`, `notify`, dialogs, `getContext`, `theme`/`onThemeChange`) needs a new transport. Relaying every `execute()` stdout/stderr chunk through `window.parent.postMessage` makes the host renderer a per-chunk relay — clunky for streams. **Decision:** Electron **`MessageChannelMain`** — main mints a port pair **per board**, sends one end to the host renderer (`hostWebContents.postMessage(ch, {boardId}, [port1])` → `ipcRenderer.on(ch, e => e.ports[0])`), which **transfers it onward into the board frame** (`iframe.contentWindow.postMessage(init, 'board://<host>', [port])`). The host brokers only the **one-time handshake**; thereafter the board ↔ a dedicated **main-process** handler talk **directly** over the duplex `MessagePort` (stdin board→main; stdout/stderr/exit main→board), host out of the data path. A thin comlink-style RPC over the port rebuilds `window.persephone` (async methods + event callbacks) so authors see the same API; the shim `<script>` is **auto-injected** by the `board://` handler into served HTML (same mechanism as the theme `<style>`), so boards get the bridge for free. Main minting the port per board also resolves "which board?" without `event.sender.session` (helps C2). **Rejected:** a WebSocket/local HTTP bridge — reintroduces a reachable port, the very thing `board://` avoids. **Verified (US-776, Castlabs Electron 39):** transferring a `MessagePortMain`-derived port onward into a *cross-origin* iframe works (see "Proven live" below). Re-handshake on board reload is owned by C12 (soft reload). **Bootstrap option:** main can `WebFrameMain.executeJavaScript` directly in the board frame (the "View Actual DOM" path, C3) to inject the bridge shim + kick off the handshake, reducing reliance on the host main frame as broker — but the steady-state streaming transport stays the `MessagePort` (`executeJavaScript` is one-shot main→frame, no streaming, no board-initiated calls). **Channel lifecycle (decided):** **renderer-driven** — the board iframe is a React component with exact mount/unmount signals, and only the parent (React) frame can `window.postMessage(..., [port])` a port into the cross-origin child, so the renderer requests the port pair from main on mount, transfers it into the iframe on `load`, and on unmount cleanup tells main to dispose (`port2.close()` + unregister). Main detecting the frame via `frame-created` can't deliver the port itself (cross-origin), so it isn't the trigger. **Backstop:** `webContents.on('render-process-gone'|'destroyed')` disposes orphaned board ports if the window dies. **Proven live (US-776) — END-TO-END:** a `MessageChannelMain` port minted in **main** → delivered to the renderer → transferred into a real `board://pocleg` cross-origin iframe, with bidirectional **streaming** over the port (`pong, tick-1..3, done`). The full main↔renderer↔frame path is validated; nothing about the transport remains unproven. |
| C2 | **Handshake origin validation** *(resolved — technical moment, folds into US-771)* | Originally framed for a `window.parent.postMessage` relay where the host would check `event.origin` on *every* privileged call. The C1 `MessageChannelMain` decision **removes that surface**: a `MessagePort` is a capability, not an address — main mints one port pair **per board**, the renderer transfers exactly one end into exactly one board frame, and thereafter board ↔ main talk directly over the duplex port. Steady-state messages need **no** per-message origin checks (port messages carry no spoofable origin; only the frame holding the port can speak; main routes that port's jobs to the one board root it minted it for — it never trusts a board id claimed *inside* a message). `window.postMessage` survives at **exactly one point — the one-time port handshake** — with standard, unambiguous rules: (a) renderer→iframe uses explicit `targetOrigin: 'board://<host>'` (never `*`) so the port can't leak to a frame that navigated away; (b) the in-board shim accepts the port only if `event.origin === <host-renderer origin>` **and** `event.source === window.parent`. No design decision is open here — it's standard handshake hygiene. **Implement as a note on US-771** (the POC already used an explicit-origin transfer + shim acceptance; only the origin tightening remains). |
| C3 | **Automation on a frame, not a `webContents`** *(feasibility confirmed; agent-transparency is a hard invariant)* | **Transparency invariant (required):** the agent must see **no difference** between automating a board and a browser page — it passes only `pageId` (never any frame/iframe/webContents parameter), and the entire `<iframe>`-vs-`webContents` difference stays **below the `IBrowserTarget` seam** (`automation/types.ts`). Frozen byte-for-byte: the `browser_*` MCP tool schemas, `getTarget()` (`commands.ts:65-141`, already treats a board and a browser page identically → both return `editor.target`), all of `commands.ts`/`snapshot.ts`/`input.ts`, and the `IBrowserTarget` interface. **Only the four method *implementations* in `BoardTargetModel` change** (`cdp`/`focusWebview`/`insertText`/`reload`) plus the `cdp-service` registration — same signatures, new internals. **Feasibility:** main already reaches iframe content the way "View Actual DOM" does — `mainWindow.webContents.mainFrame.framesInSubtree` → find the `board://<host>` frame → `WebFrameMain.executeJavaScript(...)` (`src/main/browser-service.ts:478-498`); bypasses SOP, no debugger, works cross-origin. **Plan:** `framesInSubtree` + `executeJavaScript` for DOM reads/snapshots/synthetic events; **CDP targeting that frame** (attached on-demand, as the browser already does) for *trusted* key/mouse input. Rework `cdp-service` + `BoardTargetModel.cdp()` registration from "board webContents (`${editorId}/${BOARD_CDP_TAB}`)" to "the board frame of the host webContents." Main tracks the board's `WebFrameMain` via `webContents.on('frame-created'|'did-frame-navigate')` (`webFrameMain.fromId(procId, routingId)`) so it always holds a valid handle and **re-resolves it on reload** (navigation invalidates the old handle). |
| C4 | **Process model / crash containment** *(accepted — no action)* | If the cross-origin board frame is **in-process**, a board hang (infinite loop), OOM, or native/GPU crash could freeze/kill the whole host window; if **out-of-process** (site isolation / OOPIF) it's contained like today's `<webview>`. **Decision:** do nothing. Such crashes are rare, the board is the user's own trusted code, and the author owns both the bug and the fix (Reload recovers a soft hang). We will **not** force site isolation or add a heartbeat/watchdog. Whatever process model `board://<host>` defaults to on the Castlabs fork is accepted as-is. (The C1 `render-process-gone` backstop still disposes orphaned ports if the renderer does die — that stays, but it's port hygiene, not a crash-containment feature.) |
| C5 | **Origin / SOP / `sandbox` attribute** *(confirmed by POC → US-770 owns the decision)* | **POC (US-776) confirmed:** `board://pocleg` loaded with a **stable cross-origin** origin (`origin:"board://pocleg"`, not `null`), `nodeIntegrationInSubFrames` off (`requireType:"undefined"`), and `window.parent` blocked (`parentBlocked:true`). **Decision (US-770 must implement):** load `board://<host>` **without** the bare `sandbox` attribute — the bare attribute yields an *opaque* origin (`origin:"null"`) with **no stable storage**, breaking C6. Isolation comes from the cross-origin `board://` scheme + `nodeIntegrationInSubFrames:false` + the served CSP, **not** from the `sandbox` attribute. (If a future need requires `sandbox`, it must include `allow-same-origin` to keep a real origin — but the default is no `sandbox` attribute at all.) US-770 ships the iframe without `sandbox`. |
| C6 | **Storage isolation via per-board origin** *(confirmed by POC → US-772)* | **POC (US-776) confirmed `storageOk:true`** on the stable `board://<host>` origin. With one shared host session, `localStorage`/IndexedDB/cookies isolate by **origin**, so a distinct `board://<host>` per board gives per-board storage isolation without a partition. Host = stable hash of the normalized board root (hostnames are charset/length-limited — don't embed raw paths; the `board-manifest.json` id is an alternative). **US-772** decides persist-vs-ephemeral (cache is already `no-store`; consider `clearStorageData({ origin })` on close — interacts with C12's soft-reload-keeps-storage default) and documents disk persistence (`writeFile`/`execute`) as the primary board storage pattern. Depends on C5's no-`sandbox` decision for the stable origin. |
| C7 | **Host-page CSP must allow framing `board://`** *(confirmed real + fix known)* | The host renderer's CSP must permit framing `board:`. **Confirmed (US-776):** the host `index.html` `<meta>` CSP had `child-src 'self' blob:` (no `frame-src`), so a `board://` iframe returned **`ERR_BLOCKED_BY_CSP`** until `board:` was added → `child-src 'self' blob: board:;`. **US-770 must ship this one-line CSP change** to `index.html`. |
| C8 | **`board://` handler on the shared session, host-routed** *(feasibility confirmed by POC → US-770)* | **POC (US-776) confirmed** a renderer-loaded iframe navigates the custom `standard` `board://` scheme served from the host session, with served head-injection applied (the POC injected its shim + ran). **US-770 implements:** move from per-partition `ses.protocol.handle` to a **single** handler on the host's default session that resolves `host → board root` (a `Map<host, root>` registry; register on board open, drop on close), carrying over the parse-time `--p-*` injection + CSP headers. Remaining work is the registry/host-routing, not feasibility. |
| C9 | **Theme parity / first-paint** *(scoped → US-772)* | Parse-time `:root{--p-*}` injection (in the `board://` handler) carries over and themes the first paint. The preload's JS mirror (`applyVars` at `document-start`) goes away, so live theme switches must arrive over the bridge host→board (the C1 `MessagePort`). **US-772 acceptance criteria:** (a) no white flash on board open (first paint themed by parse-time injection), and (b) a mid-session theme switch retints a running board. Live-switch transport is the C1 port (theme is part of the `persephone` surface), not the C10 overlay channel. |
| C10 | **Focus & host-overlay dismissal across the boundary** *(resolved — approach chosen, → US-773)* | Today `BoardWebview.tsx:99-103` dispatches a synthetic `mousedown` on webview `focus`; that drives the outside-click teardown (the `document` mousedown listeners in `MenuModel`/`PopoverModel` — *not* `overlayRegistry`, which is tooltip-suppression only). A cross-origin iframe's inner clicks don't bubble to the host (SOP). **Transport — distinct from C1:** this is a host-**renderer** concern (the overlays live in the host React tree), so it uses **`window.parent.postMessage` board→host-frame directly**, NOT the C1 `MessagePort` (which goes board↔main); a child frame may always post to its parent even cross-origin. **Design:** the injected shim adds a **capture-phase** `pointerdown` listener (better than `focus` — also catches clicks into an already-focused board) that posts `{__persephone:"board:interact"}` to the injected `HOST_ORIGIN`; the host listens for `message`, validates `event.source === iframe.contentWindow` **and** `event.origin === board://<host>` (C2 hygiene), then re-fires the **same** `document.body.dispatchEvent(new MouseEvent("mousedown",{bubbles:true}))`. Teardown path unchanged — only the trigger source swaps from webview `focus` to a validated cross-frame message. `HOST_ORIGIN` injected into the shim by the `board://` handler (same mechanism as `--p-*`). |
| C11 | **Load-failure / CSP-violation reporting → `ui.log`** *(resolved — approach chosen, → US-774)* | The `<webview>`'s `did-fail-load` (`BoardWebview.tsx:56-67`) appends to the board's `ui.log` + `ui.notify` toast (filtering `ERR_ABORTED -3`). The iframe loses that *element* event, but main + shim alternatives give **better** coverage. Failure modes: (1) main doc fails (404/stale-host/`ERR_BLOCKED_BY_CSP`/handler throw), (2) sub-resource 404, (3) CSP violation, (4) author JS throws (blank board — webview never reported this), (5) handshake never completes (paints but bridge dead). **Chosen — A+B+D, plus E:** **A** `hostWebContents.on('did-fail-load')` filtered to the board frame (Electron fires this for sub-frames too — `isMainFrame=false`, `frameProcessId`/`frameRoutingId`; C3 already tracks the board `WebFrameMain`, so filter by frame/`validatedURL`; keep the `ERR_ABORTED -3` filter) → the near-1:1 replacement for mode 1 incl. `ERR_BLOCKED_BY_CSP`; **B** `securitypolicyviolation` listener in the injected shim → `window.parent.postMessage` (the C10 channel) → host, for modes 2/3 (`blockedURI`/`violatedDirective`); **D** handshake watchdog reusing C1 (expect the shim "connected" message within a timeout) for mode 5; **E** (bonus, cheap) `window.onerror`/`unhandledrejection` in the shim → host for mode 4 (improvement over the webview). **Skipped — C** (`<iframe>` `onload` + load-timeout): cross-origin `onerror` is useless and A already fires on navigation timeout; add only if testing shows a hang A misses. All routes funnel into the **existing** report path (append `ui.log` + `ui.notify`), so author/agent UX is unchanged, just better-fed. |
| C12 | **Reload model** *(resolved — soft-only to start)* | **Decision: ship soft reload only.** `reloadBoard()` / `board_refresh` re-point their internals to `iframe.contentWindow.location.reload()` (or re-set `src`) — no partition teardown, board's `board://<host>` origin storage **kept**. The bridge re-handshakes on reload (the renderer re-transfers a fresh port on the new `load`, per C1's "re-handshake the port on board reload"). No hard/clear-storage reload for now — boards persist their real data on disk via `writeFile`/`execute` (C6), so clearing origin storage is rarely needed. Revisit a hard-reload variant only if a concrete need appears (e.g. a board wedged by corrupt `localStorage`); it'd be `session.clearStorageData({ origin: 'board://<host>' })` before reload, added as a separate action so soft reload stays the default. Public entry points (`reloadBoard()`, `board_refresh`, toolbar Reload — all from US-769) are unchanged. |
| C13 | **Scope: the Browser editor stays on `<webview>`** | `BrowserView.tsx` shares the `<webview>` + CDP infra, but the trusted-code argument **does not** extend to it — it loads untrusted remote web content and genuinely needs OS process isolation. This epic is **boards-only**; the Browser editor keeps `<webview>`. Ensure shared helpers (CDP service, board scheme) can diverge cleanly. |
| C14 | **Performance verification & go/no-go** *(measurement gate → US-775)* | The whole motivation is faster open. **US-775** must measure iframe open latency vs. the current `<webview>` (and vs. Option A, just optimizing the webview). If iframe isn't meaningfully faster, prefer Option A (keep-alive + pre-warm on the existing `<webview>`) and shelve the rewrite. Measure before committing the bridge/automation rewrites (US-771/773). |

## Notes

### 2026-06-26
- Epic created to migrate boards off the `<webview>` tag for faster open, plus removing the
  open-time blink caused by board auto-reload (US-769).
- Initially targeted `WebContentsView`; **re-targeted to `<iframe>`** after recognizing (a)
  `WebContentsView` is a native layer that breaks DOM-overlay z-order (the page-tab context
  menu would render behind the board) — the only option that regresses overlays — and (b)
  boards are **trusted, extension-like local code**, so `<iframe>` isolation (cross-origin
  `board://<host>` + `nodeIntegrationInSubFrames: false` + CSP, SOP-isolated from the
  Node-privileged host) is adequate, matching VS Code's editor-webview model. See "Options
  considered."
- Earlier assessment that `<iframe>` was unsafe was over-conservative — it conflated the
  untrusted-remote-content threat model (which the Browser editor has, C13) with boards
  (trusted, can already `execute()` arbitrary code).
- Root-caused the blink (US-769): `BoardEditorView.tsx:56` keys the host by `reloadToken`;
  the `index.html` watcher + the folder watcher's `isBoardReloadSource` branch each bump it on
  spurious Windows `fs.watch` events at attach (first open after restart / board switch).
- The cost moves from `WebContentsView`'s ongoing overlay-hiding tax to `<iframe>`'s one-time
  bridge (postMessage) + automation (frame-based CDP) rewrites; gated on the US-775 perf win.
- Concerns C1–C14 are open and to be reviewed one by one before implementation.
- **POC (US-776) run live via `execute_script` (no code change, release build):** injection-ordering
  (shim + `--p-*` present before the first author script) and a `MessagePort` round-trip **+
  streaming** into a cross-origin/opaque iframe both **PASS**. Finding: the bare `sandbox` attribute
  gives an opaque origin (no stable storage) — real boards load `board://<host>` without it. Remaining
  legs (main↔renderer `MessageChannelMain`; real `board://<host>` load) touch **main-process** code,
  so they need a Persephone restart (`npm start`) — main does not hot-reload.
- **POC (US-776) main-leg run live in dev — the iframe architecture is proven END-TO-END.** A
  `MessageChannelMain` port minted in main → delivered to renderer → transferred into a real
  `board://pocleg` cross-origin iframe gave: stable `origin:"board://pocleg"` (not null),
  `storageOk:true`, `requireType:"undefined"` (no Node), `parentBlocked:true` (SOP), and a port
  round-trip **+ streaming** (`pong, tick-1..3, done`). Confirms C1 (main-leg), C5 (origin/SOP/no-Node),
  C6 (stable-origin storage). **C7 confirmed + fixed:** host `index.html` CSP needed `board:` in
  `child-src` (was `ERR_BLOCKED_BY_CSP`). Throwaway POC (`poc-board-leg.ts` + `main-setup.ts` lines +
  the `index.html` CSP edit) to be reverted; US-770 re-applies the CSP change properly.
- **C2 reviewed → downgraded to a technical moment (folds into US-771).** The C1
  `MessageChannelMain` choice removes the per-message origin-validation surface C2 was written
  for (the port is a per-board capability, not a spoofable address). Only the one-time port
  handshake needs origin hygiene — explicit `targetOrigin: 'board://<host>'` on transfer, and
  the shim accepting the port only when `event.origin`/`event.source` match the host. No open
  design question; implement as a note on US-771.
- **C3 reviewed → feasibility confirmed + agent-transparency made a hard invariant.** The agent
  passes only `pageId` and sees no board-vs-browser difference; that contract is already in place
  (`getTarget()` returns an `IBrowserTarget` for both). The entire iframe/webContents difference
  stays **below the `IBrowserTarget` seam** — only `BoardTargetModel`'s four method bodies + the
  `cdp-service` registration change (same signatures). MCP tool schemas, `getTarget()`,
  `commands.ts`, `snapshot.ts`, `input.ts`, and `IBrowserTarget` are frozen. Recorded on US-773.
- **C4 reviewed → accepted, no action.** A board hang/OOM/native crash *could* freeze the host
  window if the frame is in-process, but such crashes are rare and the board is the user's own
  trusted code (author owns the bug + fix; Reload recovers a soft hang). Decision: do **not**
  force site isolation or add a watchdog; accept whatever process model `board://<host>` defaults
  to. The C1 `render-process-gone` port-disposal backstop stays (port hygiene, not containment).
- **C10 reviewed → approach chosen (→ US-773).** Replace the webview `focus`→synthetic-mousedown
  overlay-dismissal with a **direct `window.parent.postMessage`** board→host-frame ping (capture-phase
  `pointerdown` in the shim → host validates source/origin → re-fires the same `document.body`
  mousedown, reusing the existing `MenuModel`/`PopoverModel` teardown). Note: this uses the direct
  board→host-frame postMessage, **not** the C1 `MessagePort` (which is board↔main) — overlay
  dismissal is a host-renderer concern.
- **C11 reviewed → approach chosen (→ US-774).** Iframe loses the webview `did-fail-load` element
  event but gains better coverage: **A** `hostWebContents.on('did-fail-load')` filtered to the board
  frame (Electron fires it for sub-frames too; reuses C3 frame tracking) is the near-1:1 replacement
  incl. `ERR_BLOCKED_BY_CSP`; **B** shim `securitypolicyviolation`→postMessage for CSP/sub-resource;
  **D** handshake watchdog (C1) for "bridge dead"; **E** shim `window.onerror` for author errors
  (improvement over today). Skip the iframe `onload`+timeout (C) unless a hang slips past A. All
  funnel into the existing `ui.log` + `ui.notify` path.
- **C12 reviewed → soft reload only to start.** `reloadBoard()`/`board_refresh` become
  `iframe.contentWindow.location.reload()` (no teardown, origin storage kept; bridge re-handshakes
  per C1). No hard/clear-storage reload now — boards persist real data on disk (C6). Add a
  `clearStorageData({ origin })` hard-reload variant later only if a concrete need appears, keeping
  soft as the default. Public entry points unchanged from US-769.
- **Concerns review complete — all C1–C14 dispositioned.** Resolved/confirmed: C1, C3, C5, C6,
  C7, C9, C10, C11, C12. Technical-moment / scoped into tasks: C2 (US-771), C8 (US-770), C13, C14
  (US-775). Accepted no-action: C4. The epic is design-complete; the US-776 POC de-risked the hard
  parts end-to-end. Ready for implementation (US-769 ships first, independently).
- **Independent doc audit (fresh-context agent) — gaps fixed.** Code citations all verified accurate
  (incl. `BoardEditorModel.ts:176-177` = index-watcher disposal in `dispose()`). Fixes applied:
  tagged C5/C6/C8/C9/C14 with explicit dispositions + owning tasks (were untagged though the summary
  claimed them dispositioned); corrected the US-770 row + dashboard from `frame-src` → `child-src …
  board:` (the exact directive C7 warns against); marked C1 transport **proven end-to-end** (the cell
  still said "only the main-leg remains" — stale); refreshed the dashboard US-776 status to
  "proven end-to-end incl. main-leg"; assigned C5's no-`sandbox` decision to US-770 and C9's
  white-flash/retint verification to US-772 as acceptance criteria. No contradictions found between
  the two messaging mechanisms (C1 `MessagePort`↔main vs. C10 `window.parent.postMessage`→renderer),
  the lifecycle diagram, or the POC README.
- **US-775 go/no-go gate → GO (decided on the US-770 iframe).** With US-770 in place, board
  open latency was compared qualitatively against the prior `<webview>`: the `<webview>` showed a
  board in ~500 ms in the **best** case and **up to ~2 s** otherwise (guaranteed cold start — fresh
  out-of-process renderer + ephemeral partition + async `registerBoardProtocol` round-trip before
  navigation). The `<iframe>` opens **instantly — indistinguishable from any built-in Persephone
  editor**. The improvement is dramatic and user-observed, so no microbenchmark/A-B harness was
  built (the gate exists to catch a *non*-improvement; this is the opposite). **Decision: GO** —
  Option A (optimize the `<webview>`) is shelved; US-771–774 are unblocked. US-775 closed with no
  production-code scope (a measurement/decision gate only).
- **Task split re-planned into implementation order (post-concerns-review).** The 7-task
  decomposition was kept (each task is cohesive); three fixes applied: (1) **US-775 moved from
  last → after US-770** as an explicit go/no-go *gate* before the bridge/automation rewrites,
  per C14 ("measure before committing US-771/773"); the old linear numbering buried the gate
  after the work it's meant to gate. (2) **US-771 retitled** from "postMessage bridge" to
  "**`MessagePort` RPC bridge**" to match the C1 `MessageChannelMain`-to-main decision —
  `preload-board.ts` retires, the shim is injected by the `board://` handler, the bridge moves
  into main; C2 origin hygiene folded in. (3) **Theme ownership disambiguated** across
  US-770 (parse-time first paint) / US-771 (port transport) / US-772 (parity acceptance) so no
  two tasks both "implement theme." Final order: US-769 (independent, ships first) → US-770 →
  US-775 (gate) → US-771 → US-772 → US-773 → US-774.

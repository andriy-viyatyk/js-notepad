# US-858: Automate board secondary views via `browser_*` (frames-as-tabs)

**Epic:** [EPIC-044 — Board Secondary Views](../../epics/EPIC-044.md)

## Goal

Let the `browser_*` MCP automation tools reach a board's **secondary (sidebar) views**, not just its main frame — by mapping each board frame (main + each declared secondary view) onto the `IBrowserTarget` **tab** abstraction, so an agent lists them with `browser_tabs {action:"list"}`, selects one with `browser_tabs {action:"select"}`, and then drives it with `browser_snapshot` / `browser_click` / `browser_type` / `browser_take_screenshot`.

## Background

### The D7 single-frame gate (why it's blocked today)

Every board frame — the main view and each secondary sidebar view — is a `board://<host>` `<iframe>` inside the **host window's** webContents, and they all share one `model.id`. The current automation path is single-frame by construction:

- `getTarget` (`commands.ts:128`) resolves a board page to **one** `editor.target` (a single `BoardTargetModel`).
- `BoardTargetModel.cdp()` (`BoardTargetModel.ts:36`) always returns `CdpSession(`${model.id}/${BOARD_CDP_TAB}`)` — one fixed session; it **ignores** the `tabId` argument the interface already offers.
- Only the **main** frame registers for CDP. In `BoardWebview.tsx`, `setIframe` / `registerBoardFrame` / `unregisterBoardFrame` are gated behind `isMain` (lines 178, 217, 266). The comment there states *why*: both frames share `model.id`, so a secondary `registerBoardFrame(model.id, …)` would **clobber** the single registration.
- `BoardTargetModel.tabs` returns exactly one synthetic tab; `switchTab` / `addTab` / `closeTab` throw.

### The seams that already make this cheap

The frame-*resolution* machinery already exists — only per-frame *addressing* is missing:

1. **Each frame already has a unique `?v=<boardId>` nonce.** `boardId` is minted per `BoardWebview` mount (`BoardWebview.tsx:67`) and written into the iframe `src` as `?v=<boardId>` (line 369). `cdp-service.resolveBoardSession` already picks a frame **by that nonce** (`cdp-service.ts:89-93`), and the screenshot clip already selects the frame by nonce (`cdp-service.ts:128-130`).
2. **The CDP registration map is keyed `${model.id}/${tab}`.** `boardRegistrations` (`cdp-service.ts:48`) uses this exact shape — the same shape as `${target.id}/${activeTab.id}` elsewhere (`commands.ts:472`). So the "tab" concept maps 1:1 onto per-frame registrations. Today the controller hard-codes the suffix to `BOARD_CDP_TAB` (`controller.ts:456`).
3. **`IBrowserTarget` already models multiple tabs.** `cdp(tabId?)`, `tabs`, `activeTab`, `switchTab` (`types.ts:17-37`) are all defined, and the `browser_tabs` tool already drives list/select/switch (`commands.ts:327-366`). Nearly every command reads the active tab implicitly via `target.cdp()` (no explicit tabId), so once `switchTab` sets the active frame, the rest of the toolset follows.

### Key existing pieces this builds on

| Piece | Location |
|-------|----------|
| Board automation adapter | `src/renderer/editors/board/BoardTargetModel.ts` |
| Board frame host (registers/tracks the frame; `isMain` gate) | `src/renderer/editors/board/BoardWebview.tsx` |
| Secondary-view host (mounts a second `board://` iframe, `isMain=false`) | `src/renderer/editors/board/BoardSecondaryView.tsx` |
| Model (iframe tracking, `secondaryViewDefs`, panel derivation) | `src/renderer/editors/board/BoardEditorModel.ts` |
| CDP service (main; `boardRegistrations`, frame resolution by nonce) | `src/main/cdp-service.ts` |
| `registerBoardFrame`/`unregisterBoardFrame` IPC | `src/ipc/api-types.ts`, `src/ipc/main/controller.ts`, `src/ipc/renderer/api.ts` |
| `BOARD_CDP_TAB = "main"` | `src/ipc/api-types.ts:106` |
| Panel-id helpers (`boardSecondaryPanelId`, `parseBoardSecondaryPanelId`) | `src/renderer/editors/board/board-secondary.ts` |
| Composite panel key (`panelKey`) | `src/renderer/ui/secondary-views/panel-key.ts` |
| Open/activate a sidebar panel | `PageModel.setActivePanel` / `setSecondaryViewsState` (`src/renderer/api/pages/PageModel.ts:587,618`) |
| Tab abstraction + `browser_tabs` handler | `src/renderer/automation/types.ts`, `src/renderer/automation/commands.ts` |

### Tab-id scheme

- **Main frame:** `BOARD_CDP_TAB` (`"main"`) — unchanged, so existing single-frame automation keys on the same registration and nothing regresses.
- **Secondary view `<viewId>`:** `boardSecondaryPanelId(viewId)` = `board-secondary:<viewId>` — reused verbatim as the CDP-key suffix, so the registration key is `${model.id}/board-secondary:<viewId>`.

## Implementation plan

### Step 1 — Thread the tab/role through the `registerBoardFrame` IPC

Today the frame key's `/main` suffix is minted in main (`controller.ts:456`). Add an optional `tab` param (default `BOARD_CDP_TAB`) so the renderer can register a secondary frame under its own key. The main frame keeps passing nothing → key stays `${model.id}/main` (no behavior change).

**`src/ipc/api-types.ts`** — extend the endpoint signatures:
```ts
// before
[Endpoint.registerBoardFrame]: (boardId: string, boardHost: string, frameNonce?: string) => Promise<void>;
[Endpoint.unregisterBoardFrame]: (boardId: string) => Promise<void>;
// after
[Endpoint.registerBoardFrame]: (boardId: string, boardHost: string, frameNonce?: string, tab?: string) => Promise<void>;
[Endpoint.unregisterBoardFrame]: (boardId: string, tab?: string) => Promise<void>;
```

**`src/ipc/renderer/api.ts`** — forward the new arg:
```ts
registerBoardFrame = async (boardId: string, boardHost: string, frameNonce?: string, tab?: string) =>
    executeOnce<void>(Endpoint.registerBoardFrame, boardId, boardHost, frameNonce, tab);
unregisterBoardFrame = async (boardId: string, tab?: string) =>
    executeOnce<void>(Endpoint.unregisterBoardFrame, boardId, tab);
```

**`src/ipc/main/controller.ts`** — build the key from the tab (default `BOARD_CDP_TAB`):
```ts
registerBoardFrame = async (event, boardId, boardHost, frameNonce?, tab = BOARD_CDP_TAB) => {
    const { registerBoardFrame } = await import("../../main/cdp-service");
    registerBoardFrame(`${boardId}/${tab}`, event.sender, boardHost, frameNonce);
};
unregisterBoardFrame = async (_event, boardId, tab = BOARD_CDP_TAB) => {
    const { unregisterBoardFrame } = await import("../../main/cdp-service");
    unregisterBoardFrame(`${boardId}/${tab}`);
};
```
No change needed in `cdp-service.ts` itself — its `register/unregisterBoardFrame(key, …)` already take a fully-formed key.

### Step 2 — Track frames per tab in `BoardEditorModel`

Replace the single `currentIframe` field with a per-tab map, keeping `currentIframe` as a getter (the active frame) so existing callers keep working.

**`src/renderer/editors/board/BoardEditorModel.ts`:**
```ts
/** Mounted board frames keyed by tab id (`"main"` + `board-secondary:<viewId>`). Set on
 *  the frame's mount effect — the ELEMENT (for focus), which exists before onLoad. */
readonly frames = new Map<string, HTMLIFrameElement>();

/** Tab ids whose frame has finished loading AND registered for CDP in main (BoardWebview's
 *  handleLoad, after `registerBoardFrame` resolves). This — not `frames` — is the
 *  "attachable now" signal automation waits on: a mounted-but-not-yet-registered frame
 *  would make `cdp-service` throw. */
readonly loadedTabs = new Set<string>();

/** Active automation tab id — which frame `browser_*` drives (BoardTargetModel.switchTab). */
activeTabId = BOARD_CDP_TAB;

setIframe(el: HTMLIFrameElement, tab: string = BOARD_CDP_TAB): void {
    this.frames.set(tab, el);
}
clearIframe(el: HTMLIFrameElement, tab: string = BOARD_CDP_TAB): void {
    if (this.frames.get(tab) === el) {
        this.frames.delete(tab);
        this.loadedTabs.delete(tab);
        // If the active tab's frame just went away, fall back to main so a stray command
        // doesn't target a dead frame (a fresh switch/ensureReady re-mounts on demand).
        if (this.activeTabId === tab) this.activeTabId = BOARD_CDP_TAB;
    }
}
getFrame(tab: string = this.activeTabId): HTMLIFrameElement | undefined {
    return this.frames.get(tab);
}
/** Marked ready by BoardWebview once main has the CDP registration for this frame. */
markFrameLoaded(tab: string): void {
    this.loadedTabs.add(tab);
}
/** Back-compat: the active tab's live frame (was a plain field). */
get currentIframe(): HTMLIFrameElement | undefined {
    return this.frames.get(this.activeTabId);
}
```
- Import `BOARD_CDP_TAB` from `../../../ipc/api-types`.
- `dispose()` (line 403-412): replace `this.currentIframe = null;` with `this.frames.clear(); this.loadedTabs.clear();`. Keep `void api.unregisterBoardFrame(this.id);` (unregisters the main frame; secondary frames unregister on their own unmount, and their host wc registration is dropped when the window tears down).

### Step 3 — Register/track BOTH frames in `BoardWebview`

Generalize the `isMain` gate so the CDP registration + iframe tracking cover secondary frames too, keyed per role. Keep the *other* single-owner behaviors (ui.log reset, autofocus, `board:interact` mousedown re-dispatch) main-only.

**`src/renderer/editors/board/BoardWebview.tsx`:**
- Derive the frame's tab id from its role: `const tabId = isMain ? BOARD_CDP_TAB : boardSecondaryPanelId(view);` (import both). `view` already carries the secondary view id for a secondary frame (`BoardSecondaryView` passes `view={def.id}`).
- `handleLoad` (line 169): register for EVERY frame under its own key, and mark the tab
  ready **only after the registration IPC resolves** (so `waitForFrame`/`ensureReady` release
  the agent exactly when `cdp-service` can attach — not a tick before) —
  ```ts
  // before
  if (isMain) void api.registerBoardFrame(model.id, host, boardId);
  // after
  void api.registerBoardFrame(model.id, host, boardId, tabId).then(() => model.markFrameLoaded(tabId));
  ```
  (`boardId` is this frame's own `?v=` nonce, so each registration resolves to the correct
  frame. A soft reload re-fires `handleLoad`, re-registering + re-marking ready; `clearIframe`
  on the intervening unmount clears the stale ready flag first.)
- Frame tracking effect (line 217): track every frame under its tab id —
  ```ts
  // before
  if (el && isMain) model.setIframe(el);
  // after
  if (el) model.setIframe(el, tabId);
  ```
  and in cleanup (line 265-266):
  ```ts
  // before
  if (el && isMain) model.clearIframe(el);
  if (isMain) void api.unregisterBoardFrame(model.id);
  // after
  if (el) model.clearIframe(el, tabId);
  void api.unregisterBoardFrame(model.id, tabId);
  ```
- **Leave main-only:** the ui.log reset (line 96-98), `focusFrame()` autofocus (lines 204, 286-292), and the `board:interact` → `document` mousedown handler (line 231-232) stay gated by `isMain`. A secondary frame must not reset the log or steal focus from the main view.

### Step 4 — Frames-as-tabs in `BoardTargetModel`

Make the target enumerate frames, honor the active tab, and route per-frame. `addTab`/`closeTab` still throw (a board's frame set is fixed by its manifest, not agent-created).

**`src/renderer/editors/board/BoardTargetModel.ts`:**
```ts
import { boardSecondaryPanelId, parseBoardSecondaryPanelId } from "./board-secondary";
import { panelKey } from "../../ui/secondary-views/panel-key";

cdp(tabId?: string): CdpSession {
    return new CdpSession(`${this.model.id}/${tabId ?? this.model.activeTabId}`);
}

focusWebview(tabId?: string): void {
    this.model.getFrame(tabId ?? this.model.activeTabId)?.focus();
}

async insertText(text: string, tabId?: string): Promise<void> {
    await this.cdp(tabId).evaluate(`document.execCommand('insertText', false, ${JSON.stringify(text)})`);
}

get tabs(): ReadonlyArray<ITargetTab> {
    const s = this.model.state.get();
    const defs = s.secondaryViewDefs ?? [];
    const mainTab: ITargetTab = {
        id: BOARD_CDP_TAB,
        url: "board:///index.html",
        title: s.selectedBoard ?? "Board",
        loading: false,
        active: this.model.activeTabId === BOARD_CDP_TAB,
    };
    const secondaryTabs = defs.map<ITargetTab>((d) => {
        const id = boardSecondaryPanelId(d.id);
        return {
            id,
            url: `board:///${d.html ?? "index.html"}?view=${encodeURIComponent(d.id)}`,
            title: d.title ?? d.id,
            // `loading:true` signals "declared but its frame isn't attachable yet" — the
            // sidebar panel is closed, or open but its frame hasn't registered for CDP.
            // switchTab / ensureReady open it and wait on demand.
            loading: !this.model.loadedTabs.has(id),
            active: this.model.activeTabId === id,
        };
    });
    return [mainTab, ...secondaryTabs];
}

get activeTab(): ITargetTab | undefined {
    return this.tabs.find((t) => t.active) ?? this.tabs[0];
}

// Async: selects the tab, auto-expands its panel, and WAITS until its frame is
// CDP-attachable — so the caller (browser_tabs "select", or ensureReady before any
// command) never hands the agent an unmounted frame. `IBrowserTarget.switchTab` is widened
// to `void | Promise<void>` (Step 5); the `browser_tabs` "select" handler awaits it.
async switchTab(tabId: string): Promise<void> {
    if (tabId === BOARD_CDP_TAB) {
        this.model.activeTabId = BOARD_CDP_TAB;
        return;
    }
    const viewId = parseBoardSecondaryPanelId(tabId);
    const known = this.model.state.get().secondaryViewDefs?.some((d) => d.id === viewId);
    if (!viewId || !known) throw new Error(`Unknown board view '${tabId}'.`);
    this.model.activeTabId = tabId;
    await this.mountAndWait(tabId);
}

/**
 * Readiness gate the dispatcher awaits before EVERY board command (Step 5). If the active
 * tab is a secondary view whose frame isn't attachable yet — panel closed, or open but
 * still loading — expand + wait here so the command that follows always succeeds. A no-op
 * for the main tab and for an already-ready secondary (resolves immediately).
 */
async ensureReady(): Promise<void> {
    const tabId = this.model.activeTabId;
    if (tabId === BOARD_CDP_TAB || this.model.loadedTabs.has(tabId)) return;
    await this.mountAndWait(tabId);
}

/** Open + activate the secondary panel (so BoardWebview mounts its frame) and resolve once
 *  the frame has registered for CDP (`loadedTabs`), bounded. Mirrors how getTarget calls
 *  showPage to make a page automatable — a visible-but-expected UI side effect. */
private async mountAndWait(tabId: string): Promise<void> {
    const page = this.model.page;
    page?.setSecondaryViewsState({ open: true });
    page?.setActivePanel(panelKey(this.model.id, tabId));
    await this.waitForLoaded(tabId, 5000);
}

/** Resolve once the tab's frame has finished loading + registered for CDP (`loadedTabs`),
 *  or after `timeoutMs`. Never rejects: on the rare timeout the following CDP command still
 *  runs and boardSend's resolve-and-retry surfaces any genuine failure with a real message. */
private waitForLoaded(tabId: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
        const start = performance.now();
        const tick = () => {
            if (this.model.loadedTabs.has(tabId) || performance.now() - start > timeoutMs) resolve();
            else setTimeout(tick, 50);
        };
        tick();
    });
}
```
- Import `BOARD_CDP_TAB` (already imported at line 3).
- `reload()` stays `model.reloadBoard()` (remounts every frame). Consider resetting `activeTabId = BOARD_CDP_TAB` inside `reloadBoard()` so a reload returns automation focus to the main view predictably (optional; note in Concerns).

### Step 5 — Async `switchTab` + a per-command readiness gate (no "not mounted" error ever reaches the agent)

**`src/renderer/automation/types.ts`** — widen `switchTab` (the board's now awaits the frame; browser's stays a synchronous `void`, which satisfies the union) and add an OPTIONAL readiness hook (only the board implements it; the browser target omits it):
```ts
// before
switchTab(tabId: string): void;
// after
switchTab(tabId: string): void | Promise<void>;

/** Optional: ensure the ACTIVE tab is attachable before a command runs (e.g. a board
 *  expands + waits for a secondary-view frame). Omit when tabs are always ready. */
ensureReady?(): Promise<void>;
```

**`src/renderer/automation/commands.ts`** — two changes, both making the agent's call succeed instead of erroring on an unmounted frame:
1. In the `browser_tabs` "select" case (`browserGetTabs`, ~line 360), `await` the switch so select returns only once the frame is ready (`await` on the browser target's `void` is a harmless no-op):
   ```ts
   // before
   target.switchTab(tab.id);
   return { result: target.tabs };
   // after
   await target.switchTab(tab.id);
   return { result: target.tabs };
   ```
2. In `handleBrowserCommand` (~line 495), after `getTarget` resolves and before dispatch, run the readiness gate so **any** command (not only select) auto-expands + waits when the active tab is a not-yet-ready secondary view:
   ```ts
   // before
   const target = await getTarget(params);
   if (isErrorResponse(target)) return target;
   // after
   const target = await getTarget(params);
   if (isErrorResponse(target)) return target;
   await target.ensureReady?.();
   ```

### Step 6 — Agent-facing board docs (so a board-author agent can discover the flow)

These two docs are how an agent learns to inspect a board; both must teach the secondary-view
flow (and both had a now-stale "`browser_tabs` doesn't apply / a board is one fixed page" line to
correct):
- **`assets/mcp-res-boards.md`** (served by `read_guide("boards")`) — in the "Test it" section,
  add an **"Inspecting secondary views"** subsection: `browser_tabs list` → `select` by index →
  subsequent `browser_*` drive that frame; auto-open + wait means no "frame not mounted" error;
  `index: 0` = main; screenshots clip to the panel; frames share `persephone.state.*`. Fix the
  closing line: navigation tools still don't apply, but `browser_tabs` now *selects frames*. Add
  a short pointer from the "Secondary views & shared state" API section.
- **`assets/board-template/CLAUDE.md`** (copied into every new board) — expand the "Testing &
  automation" bullet to the same list→select→snapshot flow (must stand alone: ids, auto-open,
  no-error guarantee, shared state), and correct its "Navigation/tab tools don't apply" line.

(Full architecture doc updates — `doc/architecture/browser-editor.md`, the D7 note in EPIC-044,
and the Demo board's own "Debugging" tab — are deferred to the epic-close `/document` pass.)

## Concerns / open questions

1. **The agent must NEVER see an "iframe not mounted" error — RESOLVED: Persephone auto-expands the panel and waits for the frame to be CDP-attachable, then the command succeeds.** This is the guiding requirement. Two mechanisms guarantee it:
   - **Readiness keyed on *load + registration*, not DOM mount.** `loadedTabs` is set only after the frame's `onLoad` fires `registerBoardFrame` **and that IPC resolves** (main now holds the CDP entry). `switchTab`/`ensureReady` wait on `loadedTabs`, so they release the agent exactly when `cdp-service` can attach — closing the mount-vs-register gap that would otherwise throw.
   - **A per-command readiness gate.** `handleBrowserCommand` awaits `target.ensureReady?.()` before *every* board command. Selecting a secondary tab auto-expands+waits (`switchTab`); and even a command issued without a fresh select — active tab still a secondary whose panel the user closed meanwhile — re-expands + waits via `ensureReady`. There is no code path that dispatches a CDP command at an unmounted secondary frame.
   - The main-side resolve-and-retry (`boardSend`) stays only as a last-ditch backstop for the rare wait-timeout; in the normal case it's never exercised.

2. **`activeTabId` lifetime across mount/unmount — RESOLVED.** If the active secondary panel is closed, `clearIframe` resets `activeTabId` to `BOARD_CDP_TAB` (Step 2) AND clears its `loadedTabs` flag, so the next command either targets the main frame or (if re-selected) re-expands via `ensureReady` — never a dead frame.

3. **Reload resets frames.** `reloadBoard()` bumps `reloadToken`, remounting all frames (new nonces). Each frame's `handleLoad` re-registers and re-marks `loadedTabs`; the intervening unmount's `clearIframe` clears the stale ready flag first, so `ensureReady` correctly waits for the fresh load. `activeTabId` (a plain id, not a nonce) survives the reload. Optionally reset it to main on reload (Step 4 note).

4. **Screenshot of a sidebar frame.** `Page.captureScreenshot` clips to the frame's on-screen rect via `getBoundingClientRect` on the host document (`cdp-service.ts:131`). Secondary frames live in the sidebar of the same host webContents, so the selector + clip work — but the panel must be visible (open) and not zero-sized. Covered by the `ensureReady`/`switchTab` auto-open.

5. **No new tools / no signature churn.** This deliberately reuses `browser_tabs` and the implicit-active-tab flow rather than adding a `frame` param to every tool (rejected Option C) or minting synthetic `pageId`s (rejected Option B). The only interface additions are widening `switchTab`'s return type and one OPTIONAL `ensureReady?()` hook. If product later wants each view addressable as its own `pageId`, that's a separate follow-up.

6. **`addTab`/`closeTab` remain unsupported.** A board's frames are fixed by its manifest (`secondaryViewDefs`); the agent can't create/destroy them. Keep throwing `TAB_MSG` there. `browser_close` (which calls `closeTab()`) will therefore still error on a board — unchanged from today.

7. **Wait-timeout bound.** `waitForLoaded` uses a 5 s bound (a first mount includes port handshake + first paint). On the rare timeout it resolves anyway and lets `boardSend` surface a genuine failure with a real message rather than hanging the agent. Tune during the MCP test.

## Acceptance criteria

- `browser_tabs {action:"list", pageId:<board>}` returns the main tab **plus one tab per declared secondary view** (id `board-secondary:<viewId>`, title from the decl).
- `browser_tabs {action:"select", index:N}` selects a secondary view: its sidebar panel **auto-opens if closed**, the call returns only once the frame is CDP-attachable, and subsequent `browser_snapshot` returns **that frame's** accessibility tree (not the main view's).
- **No "frame not mounted" error ever reaches the agent:** with a secondary view active but its panel closed, issuing `browser_snapshot`/`click`/`type` directly (without a fresh select) auto-expands the panel, waits, and returns a successful result — never an error or a stale/empty snapshot.
- After selecting a secondary tab, `browser_click` / `browser_type` operate on that frame, and `browser_take_screenshot` returns an image clipped to the sidebar panel.
- Selecting `index:0` (or the main tab id) returns automation to the main frame; main-view automation is byte-for-byte unchanged when no secondary views are declared (single-frame boards regress in no way).
- `browser_tabs {action:"select"}` on an unknown view id returns a clear JSON-RPC error.
- ui.log is still reset only by the main frame; secondary frames only append their own `board:error`s (no regression).
- `npx tsc --noEmit` and `npx eslint` clean on all changed files.
- Live MCP verification against the demo board (which declares `shared-state` + `detail` secondary views): list shows 3 tabs; selecting each secondary view and snapshotting shows the panel's own DOM; shared-state edits made through one frame are visible in a snapshot of another; and a snapshot issued while the panel starts closed still succeeds (auto-expand).

## Files changed

| File | Change |
|------|--------|
| `src/ipc/api-types.ts` | Add optional `tab?` param to `registerBoardFrame`/`unregisterBoardFrame` endpoint signatures |
| `src/ipc/renderer/api.ts` | Forward the `tab` arg on both calls |
| `src/ipc/main/controller.ts` | Build the CDP key from `tab` (default `BOARD_CDP_TAB`) for both register/unregister |
| `src/renderer/editors/board/BoardEditorModel.ts` | `frames` map + `loadedTabs` set + `activeTabId`; `setIframe`/`clearIframe`/`getFrame`/`markFrameLoaded` take a tab id; `clearIframe` resets `activeTabId`→main + clears the ready flag; `currentIframe` becomes a getter; `dispose` clears both collections |
| `src/renderer/editors/board/BoardWebview.tsx` | Register/track every frame under its per-role tab key (relax the `isMain` gate for CDP registration + iframe tracking only); mark the tab ready after `registerBoardFrame` resolves |
| `src/renderer/editors/board/BoardTargetModel.ts` | Enumerate frames as tabs; honor `activeTabId` in `cdp`/`focusWebview`/`insertText`; async `switchTab` + `ensureReady` + `mountAndWait`/`waitForLoaded` — auto-expand the panel and wait for CDP-attachability |
| `src/renderer/automation/types.ts` | Widen `switchTab` return to `void \| Promise<void>`; add optional `ensureReady?(): Promise<void>` |
| `src/renderer/automation/commands.ts` | `await target.switchTab(...)` in the `browser_tabs` "select" case; `await target.ensureReady?.()` in `handleBrowserCommand` before dispatch |
| `assets/mcp-res-boards.md` | New "Inspecting secondary views" subsection under "Test it" (list→select→drive; auto-open/no-error; screenshot clip; shared state) + API-section pointer; corrected the stale "`browser_tabs` doesn't apply" line |
| `assets/board-template/CLAUDE.md` | Expanded the "Testing & automation" secondary-views bullet to the full list→select→snapshot flow; corrected the stale "Navigation/tab tools don't apply" line |

### Files NOT changed (verified sufficient as-is)

- `src/main/cdp-service.ts` — `boardRegistrations` already keys on the full `${id}/${tab}` string and resolves frames by `?v=` nonce; screenshot already clips by nonce. No change needed once distinct keys are registered.
- `src/renderer/editors/board/BoardSecondaryView.tsx` — already mounts the secondary frame with `isMain=false` and passes `view={def.id}`; no change.
- `src/renderer/editors/board/board-secondary.ts`, `src/renderer/ui/secondary-views/panel-key.ts` — reused as-is.

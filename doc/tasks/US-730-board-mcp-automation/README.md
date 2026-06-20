# US-730: Web Boards as `browser_*` MCP automation targets

**Epic:** [EPIC-034 — Web Board](../../epics/EPIC-034.md)
**Status:** Investigated — doc ready (awaiting "let's implement")

## Goal

Let the existing Playwright-compatible `browser_*` MCP tools drive a **Web Board's webview** — so an agent can `browser_snapshot` / `browser_click` / `browser_type` a board to test and debug it end-to-end against the real theme and real `execute()` data. This is the **"Live in-app board testing via MCP"** future-direction (EPIC-034 C9 + Future directions), promoted into the epic because the automation engine is already target-agnostic; only the Browser-editor coupling and a board-side webContents registration are missing.

**Decision (user):** reuse the existing `browser_*` tools (no new `board_*` tools). `getTarget()` learns to resolve a board page; navigation/tab tools return a clean "not supported on board pages" error; the page-interaction tools (snapshot/click/hover/type/press_key/evaluate/wait_for/take_screenshot/select_option) work unchanged.

### Scope (v1): discover + drive only

The discovery flow is **user-opens → Claude discovers → Claude drives**:

1. The **user** opens the `.persephone` project, trusts it, and selects a board → the webview mounts and registers its `webContents` (only a rendered board is automatable; the trust gate, C4, also gates rendering).
2. Claude calls `list_pages`, sees the `board-view` page (with `selectedBoard` / `persephonePath`), and reads its `pageId`.
3. Claude drives it with `browser_snapshot { pageId }` / `browser_click` / `browser_type` / … (or omits `pageId` when the board is the active page — `getTarget()` resolves the active automatable page).

**Out of scope for v1 (decided, user):** Claude **opening a board itself**. There is no `open_board` MCP tool and `open_url` is not extended. The intended future affordance is a **`board://<board folder path>` open-URI** that resolves to "open this project + select this board" — deferred to a future task (see EPIC-034 Future directions). Until then, opening is a manual user step.

## Background

### The automation engine is already generic

The whole automation stack operates on a generic `webContents` resolved by an **opaque string key** — none of it knows about the Browser editor:

- `src/renderer/automation/snapshot.ts` — pure CDP (`Accessibility.getFullAXTree`, `Target.*`).
- `src/renderer/automation/ref.ts` — pure CDP (`DOM.resolveNode` + `Runtime.callFunctionOn`).
- `src/renderer/automation/input.ts` — injected JS via `cdp.evaluate` + Electron `webview.insertText()` for contentEditable.
- `src/renderer/automation/CdpSession.ts` — `constructor(private readonly regKey: string)`; forwards `regKey` opaquely over `BrowserChannel.cdpAttach/cdpSend/cdpDetach`.
- `src/main/cdp-service.ts` — `initCdpHandlers(getWebContents: (key) => WebContents | undefined)`; each handler resolves the key to a `WebContents` and calls `wc.debugger.*`.

CDP works through the board's lockdown: `sandbox`/`contextIsolation`/CSP do **not** block debugger-level `Accessibility.getFullAXTree` or `Runtime.evaluate` (CDP injection bypasses page CSP). So all page-interaction commands work on a board once its webContents is registered.

### The only Browser coupling — `getTarget()`

`src/renderer/automation/commands.ts:47-105` is the **single** place that couples to the Browser editor: it does `instanceof BrowserEditor` and returns `browserEditor.target` (a `BrowserTargetModel implements IBrowserTarget`). Everything downstream uses only `IBrowserTarget` (`src/renderer/automation/types.ts:13-38`).

### `IBrowserTarget` — what a board must provide

```ts
interface IBrowserTarget {
    readonly id: string;
    cdp(tabId?: string): CdpSession;
    focusWebview(tabId?: string): void;
    insertText(text: string, tabId?: string): Promise<void>;
    navigate(url: string): void; back(): void; forward(): void; reload(): void;
    readonly tabs: ReadonlyArray<ITargetTab>;
    readonly activeTab: ITargetTab | undefined;
    addTab(url?: string): string; closeTab(tabId?: string): void; switchTab(tabId: string): void;
}
```

`BrowserTargetModel` (`src/renderer/editors/browser/BrowserTargetModel.ts`) is the reference:
- `cdp(tabId?)` → `new CdpSession(`${this.model.id}/${targetTab}`)` (regKey = `editorId/tabId`).
- `focusWebview()` / `insertText()` → `this.model.webview.webviewRefs.get(targetTab)` → the real `<webview>` element → `.focus()` / `.insertText()`.

A board has **no tabs and no navigation** (single fixed `board:///index.html`), so a `BoardTargetModel` implements the real subset (`cdp`/`focusWebview`/`insertText`/`reload`/a single synthetic tab) and throws a friendly error for `navigate`/`back`/`forward`/`addTab`/`closeTab`/`switchTab`.

### Why a SEPARATE main-side registry (not the browser one)

The browser's `registerWebview` (`src/main/browser-service.ts:164-338`) attaches **browser-only** listeners that would misfire on a board: `will-navigate` (blocks `file:`/`app-asset:`/`safe-file:`), `will-prevent-unload` (beforeunload guard), `before-input-event` (F5/F12/Esc/Ctrl+F hotkeys), `setWindowOpenHandler` (popup guard). A board needs **only** the `key → WebContents` mapping for CDP — no listeners.

`initCdpHandlers` takes one resolver, but it's a pure function, so a board map composes cleanly **inside `cdp-service.ts`** (try board map first, fall back to the browser resolver) with **zero change to `browser-service.ts`**.

### Board registration path mirrors `registerBoardProtocol`

`BoardWebview.tsx` already registers/unregisters the `board://` protocol via the `api.*` → main controller IPC path (`api.registerBoardProtocol` / `api.unregisterBoardProtocol`, defined across `src/ipc/api-types.ts`, `src/ipc/renderer/api.ts`, `src/ipc/main/controller.ts`). The webContents registration is host-renderer → main (exactly like the browser's `dom-ready` register), so it goes through the **same `api.*` path** — not the sandboxed `board-bridge` (that bridge is for the board's own page).

## Implementation plan

### Step 1 — Shared CDP tab constant

`src/ipc/api-types.ts` — add a dependency-free constant reused by both the renderer target and the main controller so the regKey can't drift:

```ts
/** Synthetic CDP tab id for a board (boards have no tabs). regKey = `${editorId}/${BOARD_CDP_TAB}`. */
export const BOARD_CDP_TAB = "main";
```

Add to the API interface in the same file (next to `registerBoardProtocol`):

```ts
registerBoardWebContents(boardId: string, webContentsId: number): Promise<void>;
unregisterBoardWebContents(boardId: string): Promise<void>;
```

### Step 2 — Board CDP registry in `cdp-service.ts`

`src/main/cdp-service.ts`:

- Add a module map and exported register/unregister:

```ts
const boardRegistrations = new Map<string, WebContents>();

export function registerBoardWebContents(key: string, wc: WebContents): void {
    boardRegistrations.set(key, wc);
}
export function unregisterBoardWebContents(key: string): void {
    boardRegistrations.delete(key);
}
```

- Compose into resolution. Replace the direct `getWebContents(key)` lookups in the three handlers with a single helper that checks the board map first:

```ts
function resolve(key: string): WebContents | undefined {
    const board = boardRegistrations.get(key);
    if (board) return board.isDestroyed() ? undefined : board;
    return getWebContents(key);
}
```

`getWebContents` stays the injected browser resolver from `initCdpHandlers` (browser-service untouched). Use `resolve(key)` in the attach/detach/send handlers.

### Step 3 — Main controller IPC handlers

`src/ipc/main/controller.ts` — mirror the `registerBoardProtocol` handlers; build the regKey here and resolve the webContents:

```ts
import { BOARD_CDP_TAB } from "../api-types";
import { registerBoardWebContents, unregisterBoardWebContents } from "../../main/cdp-service";
import { webContents } from "electron";

// registerBoardWebContents(boardId, webContentsId):
const wc = webContents.fromId(webContentsId);
if (wc) registerBoardWebContents(`${boardId}/${BOARD_CDP_TAB}`, wc);

// unregisterBoardWebContents(boardId):
unregisterBoardWebContents(`${boardId}/${BOARD_CDP_TAB}`);
```

`src/ipc/renderer/api.ts` — implement the two methods (invoke), mirroring `registerBoardProtocol`/`unregisterBoardProtocol`.

### Step 4 — `BoardTargetModel`

New file `src/renderer/editors/board/BoardTargetModel.ts`:

```ts
import type { IBrowserTarget, ITargetTab } from "../../automation/types";
import { CdpSession } from "../../automation/CdpSession";
import { BOARD_CDP_TAB } from "../../../ipc/api-types";
import type { BoardEditorModel } from "./BoardEditorModel";

const NAV_MSG =
    "Navigation is not supported on board pages — a board is a single fixed document. " +
    "Use the board's own scripts (persephone.execute) to change its content.";
const TAB_MSG = "Tabs are not supported on board pages.";

export class BoardTargetModel implements IBrowserTarget {
    constructor(private readonly model: BoardEditorModel) {}

    get id(): string { return this.model.id; }

    cdp(): CdpSession { return new CdpSession(`${this.model.id}/${BOARD_CDP_TAB}`); }

    focusWebview(): void { this.model.currentWebview?.focus(); }

    async insertText(text: string): Promise<void> {
        const wv = this.model.currentWebview;
        if (wv) { wv.focus(); await wv.insertText(text); }
    }

    navigate(): void { throw new Error(NAV_MSG); }
    back(): void { throw new Error(NAV_MSG); }
    forward(): void { throw new Error(NAV_MSG); }
    reload(): void { this.model.currentWebview?.reload(); }

    get tabs(): ReadonlyArray<ITargetTab> {
        return [{
            id: BOARD_CDP_TAB,
            url: "board:///index.html",
            title: this.model.state.get().selectedBoard ?? "Board",
            loading: false,
            active: true,
        }];
    }
    get activeTab(): ITargetTab | undefined { return this.tabs[0]; }
    addTab(): string { throw new Error(TAB_MSG); }
    closeTab(): void { throw new Error(TAB_MSG); }
    switchTab(): void { throw new Error(TAB_MSG); }
}
```

### Step 5 — `BoardEditorModel` holds the webview ref + target

`src/renderer/editors/board/BoardEditorModel.ts`:

- Add a transient (non-state) field + setter/clearer:

```ts
// Transient: the live <webview> element for the currently-mounted board (automation
// focus/insertText/reload). Not persisted. Set on dom-ready, cleared on unmount.
currentWebview: Electron.WebviewTag | null = null;

setWebview(wv: Electron.WebviewTag): void { this.currentWebview = wv; }
clearWebview(wv: Electron.WebviewTag): void {
    if (this.currentWebview === wv) this.currentWebview = null; // guard against remount races
}
```

- In the constructor, add `this.target = new BoardTargetModel(this);` and declare `readonly target: BoardTargetModel;` (mirror `BrowserEditor`'s `this.target = new BrowserTargetModel(this)`). The model↔target circular import is fine (target constructed after the class is defined, as in the browser editor).

### Step 6 — `BoardWebview` registers on dom-ready

`src/renderer/editors/board/BoardEditorView.tsx` — pass the model so the webview has `model.id` and can hand its element back:

```tsx
<BoardWebview
    key={`${s.selectedBoard}__${s.reloadToken}`}
    model={model}
    boardRoot={fpJoin(s.persephonePath, "boards", s.selectedBoard)}
/>
```

`src/renderer/editors/board/BoardWebview.tsx`:

- Change the signature to `{ model, boardRoot }: { model: BoardEditorModel; boardRoot: string }` (import the type).
- Add a `dom-ready` effect (gated on `ready`, like the `did-fail-load` effect) that registers the webContents, stores the element on the model, and unregisters/clears on cleanup:

```tsx
useEffect(() => {
    if (!ready) return;
    const wv = webviewRef.current;
    if (!wv) return;
    const onReady = () => {
        model.setWebview(wv);
        void api.registerBoardWebContents(model.id, wv.getWebContentsId());
    };
    wv.addEventListener("dom-ready", onReady);
    return () => {
        wv.removeEventListener("dom-ready", onReady);
        model.clearWebview(wv);
        void api.unregisterBoardWebContents(model.id);
    };
}, [ready, model]);
```

(`api` is already imported in `BoardWebview.tsx`.) On board switch/reload the component re-keys → unmount (unregister + clear) then mount (re-register with the new webContentsId under the same `model.id/main` key).

### Step 7 — Generalize `getTarget()`

`src/renderer/automation/commands.ts` — import `BoardEditorModel`, then make `getTarget()` resolve a board page and return its `.target`. Keep the browser incognito/Tor guards browser-only.

Shape (before → after for the resolution + final return):

```ts
// after resolving `targetPage` (by pageId / profileName / active-or-first), branch on type:
const editor = targetPage?.mainEditorInstance;

if (editor instanceof BoardEditorModel) {
    if (targetPage !== activePage) pagesModel.showPage(targetPage.id); // input needs display != none
    return editor.target;
}
if (!(editor instanceof BrowserEditor)) {
    return { error: { code: -32602, message: "No automatable page open. Open a browser page or a board." } };
}
// ...existing browser incognito/Tor checks + showPage + return editor.target
```

Resolution changes:
- **pageId branch:** accept a board page (`editor instanceof BoardEditorModel`) as well as a browser page; otherwise the existing "is not a browser page" error becomes "is not an automatable page (browser or board)".
- **profileName branch:** unchanged (browser-only — boards have no profiles).
- **neither branch:** prefer `activePage` if it's a browser **or** board; else first browser page; else first board page.

Define a small `isAutomatable(p)` = `p.mainEditorInstance instanceof BrowserEditor || p.mainEditorInstance instanceof BoardEditorModel` to keep the branch readable.

### Step 8 — Surface boards in `list_pages`

`src/renderer/api/mcp-handler.ts`:

- Extend `McpPageInfo` (around line 25-41):

```ts
/** Board pages only (editor === "board-view") */
persephonePath?: string;
selectedBoard?: string;
```

- In `getPages()` add a parallel block after the `browser-view` one (~line 166):

```ts
if (editor?.editorId === "board-view") {
    const bs = p.mainEditor?.state.get() as
        | { persephonePath?: string; selectedBoard?: string }
        | undefined;
    result.persephonePath = bs?.persephonePath;
    result.selectedBoard = bs?.selectedBoard;
}
```

This is the **discoverability** piece: an agent calls `list_pages`, sees an `editor: "board-view"` page with its board name/path, and targets it via `browser_snapshot { pageId }`.

### Step 9 — Board authoring guide note

`assets/board-template/CLAUDE.md` — add a short "Testing & automation" section: an agent can drive this board with the `browser_*` MCP tools (`browser_snapshot` to read the page, `browser_click`/`browser_type`/`browser_press_key` to interact) by passing the board page's `pageId` (from `list_pages`). Navigation/tab tools don't apply (a board is one fixed page).

## Concerns / open questions

- **C-A — Error propagation for nav/tab commands. Verify during impl.** `BoardTargetModel.navigate/back/forward/addTab/closeTab/switchTab` throw. Confirm `handleBrowserCommand` (`commands.ts:441-469`) wraps command execution in try/catch and turns a thrown `Error` into an `McpResponse` `{ error }`. If it does not, wrap those calls so a board returns a clean JSON-RPC error instead of an unhandled rejection. (Most `browser_*` handlers already `await` target methods inside the dispatcher; check the top-level catch.)
- **C-B — webContents lifecycle / remount. Resolved by design.** Board switch/reload re-keys the component → unmount unregisters + clears, mount re-registers the new `webContentsId` under the same `${model.id}/main` key. Two open board pages have distinct `model.id` → distinct keys, no collision. Board-map entries are dropped on unmount; `resolve()` also guards `isDestroyed()`.
- **C-C — `focusWebview`/`insertText` need the element.** `currentWebview` is set on the same `dom-ready` that registers the webContents, so by the time a board is automatable both are available. If `currentWebview` is somehow null, `insertText` no-ops (snapshot/click via CDP still work).
- **C-D — Security.** No new exposure: boards are already trusted local code behind the per-project trust gate (C4), and board automation is the same local MCP surface as browser automation. Boards have no incognito/Tor modes, so those privacy guards simply don't apply.
- **C-E — Single synthetic tab.** Page-interaction commands call `target.cdp()` with no `tabId`; `BoardTargetModel.cdp()` ignores `tabId` and always targets the board's one webContents. `tabs`/`activeTab` return a single synthetic entry so `browser_tabs` returns something coherent rather than erroring.

## Acceptance criteria

1. Open a `.persephone` project, trust it, select a board. `list_pages` returns that page with `editor: "board-view"` and its `selectedBoard` / `persephonePath`.
2. `browser_snapshot { pageId: <board pageId> }` returns the board's accessibility tree (refs resolvable).
3. `browser_click` / `browser_type` / `browser_press_key` / `browser_evaluate` against board refs interact with the board.
4. `browser_navigate` (and tab tools) against a board return a clean error: "Navigation is not supported on board pages…".
5. Switching boards or closing the page unregisters the webContents (no stale entry); reopening re-registers and automation works again.
6. Browser-page automation is unchanged (regression check: `browser-service.ts` untouched; browser `getTarget` paths intact).
7. `tsc` and `eslint` clean.

## Files changed

| File | Change |
|------|--------|
| `src/ipc/api-types.ts` | Add `BOARD_CDP_TAB` const + `registerBoardWebContents` / `unregisterBoardWebContents` to the API interface |
| `src/ipc/renderer/api.ts` | Implement the two new IPC methods (mirror `registerBoardProtocol`) |
| `src/ipc/main/controller.ts` | Handlers: build `${boardId}/main` key, resolve `webContents.fromId`, call cdp-service register/unregister |
| `src/main/cdp-service.ts` | Add `boardRegistrations` map + exported register/unregister + `resolve()` board-first fallback in the 3 handlers |
| `src/renderer/editors/board/BoardTargetModel.ts` | **New** — `IBrowserTarget` impl for a board (cdp/focus/insertText/reload real; nav/tabs throw) |
| `src/renderer/editors/board/BoardEditorModel.ts` | Add `currentWebview` + `setWebview`/`clearWebview`; construct `this.target = new BoardTargetModel(this)` |
| `src/renderer/editors/board/BoardWebview.tsx` | Accept `model` prop; `dom-ready` effect → register webContents + `setWebview`; cleanup → unregister + `clearWebview` |
| `src/renderer/editors/board/BoardEditorView.tsx` | Pass `model={model}` to `<BoardWebview>` |
| `src/renderer/automation/commands.ts` | Generalize `getTarget()` to resolve board pages and return `board.target` (browser guards stay browser-only) |
| `src/renderer/api/mcp-handler.ts` | `McpPageInfo` board fields + `board-view` block in `getPages()` |
| `assets/board-template/CLAUDE.md` | Short "Testing & automation" note (browser_* tools target a board by pageId) |

## Files that need NO change

- `src/renderer/automation/snapshot.ts`, `ref.ts`, `input.ts` — generic CDP/element logic; work on any registered webContents unchanged.
- `src/renderer/automation/CdpSession.ts` — regKey is opaque; board keys flow through untouched.
- `src/renderer/automation/types.ts` — `IBrowserTarget` already covers the board's needs (board throws on the irrelevant methods).
- `src/main/browser-service.ts` — the board map is composed inside `cdp-service.ts`; the browser resolver and `registerWebview` listeners are untouched.
- `src/renderer/editors/browser/*` — Browser editor and `BrowserTargetModel` unchanged.
- `src/ipc/board-bridge-channels.ts` / `src/main/board-bridge.ts` — registration uses the `api.*`/controller path (host-renderer → main), not the sandboxed board bridge.

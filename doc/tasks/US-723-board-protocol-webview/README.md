# US-723: `board://` protocol + locked-down webview + bridge injection + CSP

**Epic:** [EPIC-034 — Web Board](../../epics/EPIC-034.md) · Foundation #5
**Status:** Investigated — plan ready (not started)
**Depends on:** US-722 (Board editor + `.persephone` routing — done). Independent of US-719/US-720 (the command runner); this task ships **no `execute()`** — only the secure delivery + sandbox layer the bridge (US-724) will plug into.

## Goal

Replace the US-722 "this board will render here" placeholder with the real, secure board host: an in-process **`board://`** custom protocol that streams a board's own files (no HTTP server / port), a **locked-down `<webview>`** (`nodeIntegration:false` / `contextIsolation:true` / `sandbox:true`) that loads `board:///index.html` from that origin, a strict **CSP** that allows only the board origin and forbids remote, and the **`contextBridge` preload plumbing** that injects a `persephone` object into the board page. The actual bridge API (`execute()`, `openRawLink`, `notify`, dialogs) is **US-724** — this task ships only a minimal sentinel to prove injection.

## Scope boundary — US-723 vs US-724 (read first)

| Built here (US-723) | Built next (US-724) |
|---|---|
| `board://` scheme (global privileged + per-partition `protocol.handle` + MIME + CSP; no path guard — C1) | — |
| Locked-down `<webview>` replacing the placeholder; per-board `board-<uuid>` partition; mount/teardown | — |
| New `preload-board.ts` + build wiring; `contextBridge.exposeInMainWorld("persephone", …)` with a **minimal sentinel** (`version`, `boardName`) | The real `persephone` API: `execute()` handle (over US-719 IPC), `openRawLink`, `notify`, file/folder dialogs |
| Main-side **partition → boardRoot registry** (needed by the protocol handler) | Reuses the registry to resolve `execute()` `cwd` from the sender's session |

The registry and preload built here are deliberately the seams US-724 extends. Keep the preload surface minimal; do not pull `execute()` forward.

## Background

### Epic design (authoritative)
EPIC-034 §"Frontend delivery (`board://` scheme)" and Concern **C2** fix the approach: a **two-part registration** — the scheme is declared **privileged once at startup** (so relative URLs / `fetch` / CSP behave like http), but **`protocol.handle` is registered per board, on that board's own ephemeral session partition**, with the handler closed over that board's root folder — so a request needs **no board id in the URL** and a board can read only its own folder. The board webview is locked down via **explicit `<webview>` attributes** (a `<webview>` does **not** inherit the embedder's prefs), and `contextBridge` requires `contextIsolation:true`, so the board preload is **new code**, distinct from `preload-webview.ts` (which uses `ipcRenderer.sendToHost`). C4: `execute()` is full RCE, gated solely by the per-project trust gate (US-721, already wired in the Board editor) + board-origin-only injection + CSP-forbids-remote.

### Existing custom-scheme pattern — the template (`src/main/main-setup.ts`)
- **Global privileged registration** (`main-setup.ts:23-42`), called at startup **before `app.ready`**:
  ```ts
  protocol.registerSchemesAsPrivileged([
      { scheme: "app-asset", privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } },
      { scheme: "safe-file", privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } },
  ]);
  ```
- **Per-session handler** via `registerAssetProtocol(partition)` (`main-setup.ts:52-106`), called for `appPartition` (`'nopersist'`) and `'persist:file-access'` (`:117-118`):
  ```ts
  const customSession = session.fromPartition(partition);
  customSession.protocol.handle("safe-file", async (request) => { … net.fetch(pathToFileURL(filePath), { bypassCustomProtocolHandlers: true }) … });
  ```
- **⚠️ Traversal-guard caveat (correction to the epic).** The `safe-file` handler's guard is `isValidFilePath` (`src/main/utils.ts:48-81`), which only checks **exists + `statSync().isFile()`** — it does **NOT** verify the path stays inside an allowed root, and it does **NOT** canonicalize. The Windows drive-letter normalization lives inline in the handler (`main-setup.ts`), not in the guard. So US-723 **cannot "reuse" a boundary guard — it must implement one** (see Step 2 / Concern C1).
- **MIME precedent:** `getContentTypeFromPath` in `src/main/video-stream-server.ts:592-603` (video-only `switch` on `path.extname`) — the shape to copy, with a board-appropriate extension table.

### Webview + preload + partition pattern (browser editor)
- **`<webview>` attributes** (`src/renderer/editors/browser/BrowserView.tsx:252-266`): sets `src`, `partition`, `preload={WEBVIEW_PRELOAD_URL}`, `allowpopups` — and **no lockdown flags** (the contrast baseline). `WEBVIEW_PRELOAD_URL = (window as any).webviewPreloadUrl` (`:48`).
- **Ephemeral partition minting** (`BrowserEditorModel.ts:296-311` + `BrowserEditor.ts:79-88`): UUID via `crypto.randomUUID()`, captured once per instance → `browser-incognito-<uuid>`. Mirror for `board-<uuid>`.
- **Preload build wiring:** `forge.config.ts:28-31` declares the preload entry:
  ```ts
  { entry: "src/preload-webview.ts", config: "vite.preload-webview.config.ts", target: "preload" },
  ```
  and `src/preload.ts:43-47` exposes the runtime path:
  ```ts
  (window as …).webviewPreloadUrl = pathToFileURL(path.join(__dirname, "preload-webview.js")).toString();
  ```
- **`preload-webview.ts`** uses `ipcRenderer.sendToHost` (no `contextBridge`, no `contextIsolation`). The board preload is **new** and uses `contextBridge.exposeInMainWorld`.
- **Main window prefs** (`src/main/open-window.ts:49-59`): `webSecurity:false`, `contextIsolation:false`, `nodeIntegration:true`, `webviewTag:true`. Per C2 the board `<webview>`'s own origin/CSP are **independent of the embedder** — `webSecurity:false` does not leak in. **No CSP / `onHeadersReceived` exists anywhere today** (greps clean) — CSP is genuinely new.

### Board editor current state (US-722)
- **State** (`src/renderer/editors/board/BoardEditorModel.ts:11-28`): `persephonePath` (the `.persephone` folder, the trust key), `boards: string[]`, `selectedBoard?: string`, `title`.
- **Board folder path:** `fpJoin(persephonePath, "boards", <name>)` (see `refreshBoards`/`createBoard`/`deleteBoard`, `:122-167`).
- **Placeholder to replace:** `BoardEditorView.tsx:114-122` (the `s.selectedBoard ? (<Panel>…BoardIcon…"board webview…arrives in a later task"</Panel>) : …` block).
- **Trust gate:** `BoardEditorView.tsx:31-51` — `const trusted = projectTrust.useIsTrusted(s.persephonePath)`; untrusted → `<UntrustedProjectView/>`. The webview lives **inside the trusted branch** only.
- **Lifecycle:** `selectBoard(name)` (`:145-148`) only flips `selectedBoard` in state. No `dispose()` override. **Webview lifecycle is therefore view-driven** (React effect keyed on `selectedBoard`) — no model change needed.
- **Registration:** `register-editors.ts:443-452` (`id:"board-view"`, `hasContentHost:false`).

### IPC wiring pattern (mirror `capturePageRegion` / `gitRemoteUrl`)
Add an endpoint end-to-end across three files:
- `src/ipc/api-types.ts` — add to the `Endpoint` enum (`:86`) **and** the `Api` type map (`:189`).
- `src/ipc/main/controller.ts` — add a handler method (`:365` style) + `bindEndpoint(Endpoint.x, controllerInstance.x)` (`:466`).
- `src/ipc/renderer/api.ts` — add a wrapper using `executeOnce<T>(Endpoint.x, …)` (`:342`).

## Implementation plan

### Step 1 — Register the `board` scheme as privileged (`src/main/main-setup.ts`)
In the `registerSchemesAsPrivileged([...])` array (`:23-42`) add a third entry. **Omit `bypassCSP`** (we want the board page governed by CSP; board:// resources are same-origin `'self'` so they pass anyway):
```ts
{ scheme: "board", privileges: { standard: true, secure: true, supportFetchAPI: true } },
```
(`standard` → relative-URL/origin resolution; `secure` → secure context; `supportFetchAPI` → page `fetch('./data.json')`.)

### Step 2 — Board protocol service (new `src/main/board-protocol-service.ts`)
A small module owning the per-partition handlers, the registry, and the guard/MIME/CSP.

- **Registry:** `const boardRoots = new Map<string, string>();` (partition → absolute board root). Export `getBoardRoot(partition: string): string | undefined` — the seam US-724 uses to resolve `execute()` cwd from the sender's session.
- **`registerBoardProtocol(partition, boardRoot)`:**
  ```ts
  boardRoots.set(partition, path.resolve(boardRoot));
  const ses = session.fromPartition(partition);
  ses.protocol.handle("board", (request) => serveBoardFile(partition, request));
  ```
- **`unregisterBoardProtocol(partition)`:** `ses.protocol.unhandle("board")`; `boardRoots.delete(partition)`; `void ses.clearStorageData()` (ephemeral hygiene; tolerate errors).
- **`serveBoardFile(partition, request)`:**
  1. `const root = boardRoots.get(partition); if (!root) return new Response("No board", { status: 404 });`
  2. `const { pathname } = new URL(request.url);` → `let rel = decodeURIComponent(pathname).replace(/^\/+/, "");` (authority-less `board:///index.html` → `pathname="/index.html"` → `rel="index.html"`).
  3. **Resolve root-relative — no containment guard** (decided, C1): `const resolved = path.resolve(root, rel);`. A board is trusted native code (it can read anything via `execute()`), so the webview is deliberately **not** path-restricted — a `..` that escapes the board folder is allowed; that is the board author's responsibility. (Note: for a `standard:` scheme the URL parser already collapses plain `../` to the origin root, so this only ever mattered for percent-encoded `..` — left unguarded by design.)
  4. Read via `net.fetch(pathToFileURL(resolved).toString(), { bypassCustomProtocolHandlers: true })`; wrap in a new `Response` so we can set headers (mirror `safe-file`). On a thrown read/ENOENT → `new Response("Not found", { status: 404 })`.
  5. **Headers:** `Content-Type` = `boardMimeType(resolved)` (new table below); `Cache-Control: no-store` (always — boards are local; makes edit→reload instant per the epic's "no-cache in dev"); and **only for `text/html`**, `Content-Security-Policy: <BOARD_CSP>`.
- **`boardMimeType(file)`** — `switch (path.extname(file).toLowerCase())` over: `.html/.htm`→`text/html`, `.js/.mjs`→`text/javascript`, `.css`→`text/css`, `.json`→`application/json`, `.svg`→`image/svg+xml`, `.png`→`image/png`, `.jpg/.jpeg`→`image/jpeg`, `.gif`→`image/gif`, `.webp`→`image/webp`, `.ico`→`image/x-icon`, `.woff`→`font/woff`, `.woff2`→`font/woff2`, `.ttf`→`font/ttf`, `.otf`→`font/otf`, `.wasm`→`application/wasm`, `.map`→`application/json`, `.txt`→`text/plain`; default `application/octet-stream`.
- **`BOARD_CSP`** (decided — inline scripts allowed, see C2):
  ```
  default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' blob:;
  ```
  (`'self'` = the board origin; no `http:`/`https:` → remote is forbidden. `'unsafe-inline'` on `script-src` lets a single-file `index.html` keep its inline `<script>`.)

### Step 3 — IPC endpoints (`api-types.ts` / `controller.ts` / `ipc/renderer/api.ts`)
- `Endpoint.registerBoardProtocol` / `Endpoint.unregisterBoardProtocol`; `Api` map:
  ```ts
  [Endpoint.registerBoardProtocol]: (partition: string, boardRoot: string) => Promise<void>;
  [Endpoint.unregisterBoardProtocol]: (partition: string) => Promise<void>;
  ```
- `controller.ts`: two handlers delegating to `board-protocol-service`, plus `bindEndpoint(...)` for each.
- `ipc/renderer/api.ts`: `registerBoardProtocol = (partition, boardRoot) => executeOnce<void>(Endpoint.registerBoardProtocol, partition, boardRoot);` and the unregister wrapper.

### Step 4 — Board preload (new `src/preload-board.ts`)
Minimal `contextBridge` plumbing (US-724 fills the body):
```ts
import { contextBridge } from "electron";
// Sandboxed + contextIsolated preload (set via <webview> attributes in Step 6).
// US-724 adds execute()/openRawLink()/notify()/dialogs here, talking to main via ipcRenderer.
contextBridge.exposeInMainWorld("persephone", {
    version: process.env.npm_package_version ?? "0", // sentinel only; finalize source in impl
    // boardName/theme/etc. arrive in later tasks
});
```
Note: the board page has **no `require`/`process`** — only this bridged object. The preload needs no board id (main resolves board context from the sender's session via the Step 2 registry).

### Step 5 — Build wiring
- `forge.config.ts` — add `{ entry: "src/preload-board.ts", config: "vite.preload-board.config.ts", target: "preload" }`.
- New `vite.preload-board.config.ts` — `export default defineConfig({});` (mirror `vite.preload-webview.config.ts`).
- `src/preload.ts` — expose the runtime path next to `webviewPreloadUrl`:
  ```ts
  (window as …).boardPreloadUrl = pathToFileURL(path.join(__dirname, "preload-board.js")).toString();
  ```

### Step 6 — Locked-down board webview (new `src/renderer/editors/board/BoardWebview.tsx`)
```tsx
const BOARD_PRELOAD_URL = (window as any).boardPreloadUrl as string;

export function BoardWebview({ boardRoot, boardName }: { boardRoot: string; boardName: string }) {
    const partition = useRef(`board-${crypto.randomUUID()}`).current;
    const [ready, setReady] = useState(false);
    useEffect(() => {
        let live = true;
        void api.registerBoardProtocol(partition, boardRoot).then(() => { if (live) setReady(true); });
        return () => { live = false; void api.unregisterBoardProtocol(partition); };
    }, [partition, boardRoot]);
    if (!ready) return <Panel flex={1} />;            // or a small loading state
    return (
        <webview
            src="board:///index.html"
            partition={partition}
            preload={BOARD_PRELOAD_URL}
            // lockdown: contextIsolation + sandbox ON; nodeintegration + allowpopups OFF (omitted)
            webpreferences="contextIsolation=yes,sandbox=yes"
            style={{ flex: 1, border: "none", width: "100%", height: "100%" }}
        />
    );
}
```
Registration must complete **before** the webview navigates (hence `ready`). Listen for `did-fail-load` to surface a basic error (toast) — full `ui.log` is US-726.

### Step 7 — Swap the placeholder (`src/renderer/editors/board/BoardEditorView.tsx`)
Replace the `:114-122` placeholder body with the webview, **keyed by board name** so a switch fully remounts (new partition + fresh registration; old instance's cleanup unregisters + clears its session):
```tsx
{s.selectedBoard ? (
    <BoardWebview
        key={s.selectedBoard}
        boardRoot={fpJoin(s.persephonePath, "boards", s.selectedBoard)}
        boardName={s.selectedBoard}
    />
) : s.boards.length === 0 ? ( … ) : ( … tiles … )}
```
Keep the toolbar (back button / "New board") and the trust gate exactly as-is.

### Step 8 — Manual test board (not committed)
The bundled template is US-726, so for testing create a throwaway board by hand: `<project>/.persephone/boards/Test/index.html` (board root) plus e.g. `./app.js` + `./style.css` in the same folder or a subfolder. The page prints `window.persephone.version` and attempts `fetch("https://example.com")` to confirm CSP blocks remote. Document these steps in the task; do not ship a fixture as product code.

## Files changed (summary)

| File | Change |
|---|---|
| `src/main/main-setup.ts` | +`board` privileged scheme |
| `src/main/board-protocol-service.ts` | **new** — registry + per-partition handler + MIME + CSP (no traversal guard — C1) |
| `src/ipc/api-types.ts` | +2 `Endpoint`s + `Api` map entries |
| `src/ipc/main/controller.ts` | +2 handlers + `bindEndpoint` |
| `src/ipc/renderer/api.ts` | +2 wrappers |
| `src/preload-board.ts` | **new** — `contextBridge` sentinel |
| `vite.preload-board.config.ts` | **new** — preload build config |
| `forge.config.ts` | +preload entry |
| `src/preload.ts` | expose `window.boardPreloadUrl` |
| `src/renderer/editors/board/BoardWebview.tsx` | **new** — locked-down webview + register/teardown |
| `src/renderer/editors/board/BoardEditorView.tsx` | placeholder (`:114-122`) → `<BoardWebview>` |

## Files needing NO change (don't dig here)
- `BoardEditorModel.ts` — state already carries `selectedBoard`/`persephonePath`; `selectBoard` already flips state; webview lifecycle is view-driven (React `key`). No model change.
- `register-editors.ts`, `parsers.ts`, `FileTreeProvider.ts`, `persephone-folder-link.ts` — routing finished in US-722.
- `project-trust.*` — trust gate already enforced in the view; webview is only in the trusted branch.

## Concerns / open questions

- **C1 — No traversal guard (by design). ✅ decided (user, 2026-06-19).** The webview is deliberately unrestricted: a board is a **local application** the user/agent authored, not untrusted web content, and once the project is trusted it can already do anything via `execute()` (full RCE, epic C4) — a `board://` path guard would protect nothing. **Action:** the handler just does `path.resolve(boardRoot, rel)` and serves it; a `..` escape is permitted. The per-partition handler (closed over the board root) is kept for its **functional** value — clean no-id-in-URL addressing + the partition→root registry US-724 reuses for `cwd` — not as a security boundary. (The epic's "reuse the validated `safe-file` guard" wording is doubly moot: that guard never did boundary checks, and we now want none. Worth correcting in the epic.)
- **C2 — CSP strictness for inline scripts/styles. ✅ decided (user, 2026-06-19): allow inline scripts.** `script-src 'self' 'unsafe-inline'` + `style-src 'self' 'unsafe-inline'` — a single-file `index.html` keeps its inline `<script>` (author convenience; the Tabulator PoC works as-is). **Remote is still forbidden** (`default-src 'none'`, no `http:`/`https:`) — the load-bearing control (no remote code) is intact; trust gate + board-origin-only injection remain the primary guardrails (C4). CSP is delivered via the **response header** in the protocol handler (tamper-proof, applies before parse), not a `<meta>` tag.
- **C3 — Serve scope + entry point. ✅ decided (user, 2026-06-19): `index.html` at the board root; structure otherwise free-form.** The webview loads **`board:///index.html`** (one fixed entry point — no root-then-`frontend/` fallback). The handler roots at the whole board folder; the author organizes subfolders (`scripts/`, `vendor/`, assets, …) however they like and references them by relative paths from `index.html`. The only requirement is that `index.html` exists in the board root (a missing one → the webview shows a `board://` 404; a basic load-error toast is fine, full `ui.log` is US-726). **Deviates from the epic's `frontend/index.html` layout** — the epic folder diagram, the "loads `board:///frontend/index.html`" line, and the US-726 template must be updated to put `index.html` at the board root.
- **C4 — Preload sentinel surface. ✅ proposed.** US-723 exposes only `persephone.version` (+ maybe `boardName`) to prove injection; everything functional is US-724. Confirm we don't want even `boardName` yet (it'd require passing context to the preload, which we otherwise avoid — main resolves context from the session). **Recommendation: ship `version` only; add the rest in US-724.**
- **C5 — Registration/navigation ordering. ✅ handled.** The `board://` handler must exist on the partition before the webview loads it; handled by the `ready` gate (await `registerBoardProtocol` → then render `<webview src>`). Teardown on unmount unregisters + clears the ephemeral session. Per-board process reaping (US-720) and `ui.log` (US-726) will hook the **same unmount path** later.
- **C6 — `<webview>` lockdown attribute syntax. 🔶 verify at implementation.** Plan uses `webpreferences="contextIsolation=yes,sandbox=yes"` and omits `nodeintegration`/`allowpopups`. `<webview>` defaults already disable Node and enable contextIsolation, but C2 wants them explicit. Confirm during impl that `sandbox=yes` + a `contextBridge` preload coexist (they do in Electron — `ipcRenderer`/`contextBridge` are available in sandboxed preloads, which US-724 needs) and that we do **not** set `disablewebsecurity`.
- **C7 — Build/runtime preload path. ✅ mirrors precedent.** New preload follows `preload-webview` exactly (forge entry + vite config + `window.boardPreloadUrl`). Low risk; the only "gotcha" is remembering all three wiring points.
- **C8 — Testing without `execute()`. ✅ planned.** US-723 is verifiable end-to-end with a hand-made test board (Step 8): files render over `board://`, relative refs resolve, `window.persephone.version` is present, and a remote `fetch`/`<script src=https://…>` is blocked by CSP. No dependency on US-719/US-724/US-726.

## Acceptance criteria
- [ ] `board` registered as a privileged scheme at startup; app builds (`npm run lint`, `tsc --noEmit` clean) and starts.
- [ ] Selecting a board in a **trusted** project renders a `<webview>` showing the board-root `index.html`; relative refs (`./app.js`, `./style.css`, `./vendor/…`, subfolders) load over `board://`.
- [ ] The webview runs with `nodeIntegration:false` + `contextIsolation:true` + `sandbox:true`; `window.persephone` exists (sentinel) and `window.require`/`window.process` do **not**.
- [ ] CSP blocks remote: a `<script src="https://…">` or `fetch("https://…")` from the board page is refused (console CSP violation); board-origin scripts/styles load.
- [ ] No path restriction (by design, C1): the handler resolves paths relative to the board root and serves them — no traversal 403. (Remote loads remain blocked by CSP — the only network boundary.)
- [ ] Switching boards destroys the previous webview and unregisters its partition handler (no leak; new board loads its own files); switching back re-creates cleanly.
- [ ] An **untrusted** project still shows `UntrustedProjectView` — no webview, no `board://` registration.
- [ ] Per-board partition is ephemeral `board-<uuid>` (no `persist:`); closing the board / panel tears it down.

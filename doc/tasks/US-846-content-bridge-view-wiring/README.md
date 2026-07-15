# US-846: Content bridge (`persephone.host.*`) + view wiring + auto-save

**Epic:** [EPIC-043 — Content-Host Boards](../../epics/EPIC-043.md) (task 4 of 5)
**Status:** Implemented — awaiting user test (epic deferred-review)
**Depends on:** US-844 (`BoardContentEditorModel`), US-845 (construction/switch/persistence — both committed)
**Blocks:** US-847 (DrawIO proving ground)

## Goal

Make the content-host board **visible**. US-844/845 built and wired the model, the switch, and
persistence — but a content-host board mounts **blank** because there is no channel that lets the
board *read* Persephone's content. This task delivers that channel end-to-end:

- the shim's **`persephone.host.*`** surface (`getContent` / `setContent` / `onContentChange` /
  `getLanguage` / `save`);
- a **net-new renderer→iframe push** of the host's content + language, echo-guarded, plus a new
  **inbound shim handler** for it;
- **`BoardWebview` / `BoardEditorView` content-host wiring** — detect a content-host board, push
  host content into it, route the board's `setContent` / `save` posts back to the host, and show a
  host-restore-failure empty state;
- an **automatic document-level Ctrl+S** injected by the shim so saving works with zero board code
  (CH3).

After this task, a `.drawio` file opened by a trusted `editorKind: "content-host"` board **renders
its content**, a `setContent` round-trips to the host (dirty + auto-save cache), Ctrl+S saves through
the pipe, and switching to Monaco and back transfers the live content (US-845) with the board
re-rendering from it. US-847 then converts the real DrawIO board to consume this API.

## Background

### What already exists (verified 2026-07-15)

- **`BoardContentEditorModel`** (`src/renderer/editors/board/BoardContentEditorModel.ts`, committed
  US-844) composes `_host: TextFileModel | null`, overrides `get contentHost()` → `_host`, and
  delegates `saveState` → `this._host?.io.saveState()`, `confirmRelease` → host. It has **no** content
  bridge methods yet — US-846 adds `hostChangeContent` / `hostSave` and the restore-error flag.
- **The host content surface** (`src/renderer/editors/base/IContentHost.ts`): `IContentHostState`
  carries `content: string` + `language?: string`. Mutate with `changeContent(content, byUser?)`
  (`TextEditorModel.ts:249` — sets content, marks `modified`, schedules the autosave cache). React with
  `host.state.subscribe(cb, s => s.content)`. Save through the pipe: `host.saveFile()`
  (`TextEditorModel.ts:398` → `io.saveFile`) — clears `modified`, writes via the pipe (encryption /
  cache handled below the host line).
- **The echo-guard precedent** (`src/renderer/editors/grid/GridEditor.ts`): a view that both reads and
  writes the host guards against its own write echoing back. Field `_changedContent` (`:122`); on
  write-back `this._changedContent = content; this._host?.changeContent(content, true)` (`:726`); on
  the host-content subscription `if (content !== this._changedContent) reparse(...)` (`:343-350`).
  **US-846's push subscription mirrors this exactly** — the "already-set" value is the board's last
  `setContent`.
- **The board↔host-renderer channel** (`window.parent.postMessage` ⇄ `iframe.contentWindow.postMessage`
  + the one-time port handshake). The board→host direction already carries `board:interact` /
  `board:error` / `board:busy` (`board-shim.ts:204,223,527`, handled in `BoardWebview.onMessage`
  `:144-162`). The host→board direction is used **only** in `BoardWebview.transferPort` today
  (`:91-102`, the `BoardPortInitMsg` handshake). US-846 adds a **repeated** host→board post
  (`host:content`) and a **new** board→host message (`board:setContent`, `board:save`). This is
  net-new plumbing, **not** a mirror of an existing repeated channel (MEDIUM-4).
- **The shim's inbound listener** (`board-shim.ts:178`) handles **only** `__persephoneInit`
  (early-returns otherwise). US-846 adds a second `window` message listener for `host:content` (its own
  `event.source === window.parent` gate + the strict-origin gate).
- **`persephone.host` is absent** from the shim surface (`board-shim.ts:482`) — reserved for this epic.
- **The settle-once + await-any-time pattern**: `getFilePath()` / `getBoardBusy()`
  (`board-shim.ts:544` / `:536`) resolve to a value delivered asynchronously, awaitable before **or**
  after arrival. `getContent()` / `getLanguage()` reuse this shape (a snapshot pushed after the frame
  loads), so ordering vs. the push is not load-bearing — the board may await at any time.

### Files that need NO changes (do not edit)

- `src/renderer/api/pages/*` — construction / switch / persistence are all US-845 (committed). US-846
  is bridge + view only.
- `src/renderer/editors/board/BoardEditorModel.ts` — **one** additive change: an optional
  `contentHostError?: string` on `BoardEditorState` (inert for plain boards). No behavior change to the
  base class.
- `src/renderer/editors/board/BoardToolbar.tsx`, `custom-editor-registry.ts`, `board-manifest.ts` —
  untouched.
- `src/main/board-bridge.ts` / `board-protocol-service.ts` — the content host is **renderer-side**;
  the content bridge rides the board↔host-renderer channel, **not** the main `MessagePort`. Main never
  sees content. No main-process change.

## Design decisions (resolved)

- **Channel:** the content bridge rides the **board↔host-renderer** `postMessage` channel, never the
  main port (main has no host access). (Epic design note #4.)
- **Content type:** UTF-8 string only (CH2). `getContent`/`setContent` carry a plain string; language
  rides alongside.
- **Echo-guard location:** in the **view** (`BoardWebview`), a per-mount `useRef`. The view owns both
  the push subscription and the inbound `setContent` route, so it is the natural single owner of the
  "last board content" value. A remount (reload) resets it; the board re-reads via `getContent()`, so
  no cross-mount stash is needed. The model exposes only the thin `hostChangeContent` / `hostSave`
  pass-throughs (the view does not reach into `contentHost.io`).
- **`persephone.host` gating:** the handshake carries `contentHost: boolean` (true only for a
  content-host board). On a **plain** board `getContent()`/`getLanguage()` **reject** with a clear
  message and `onContentChange` is a no-op — so a mis-authored plain board fails fast instead of
  hanging forever on an unfulfilled `getContent()`. `setContent`/`save` post regardless (harmless if
  the host ignores them).
- **Auto-save (CH3):** the shim registers a `window`-level (bubble-phase) Ctrl/Cmd+S handler that
  posts `board:save` **unless** a board handler already called `preventDefault()` (the opt-out). The
  board author writes no save code. `persephone.host.save()` stays as an optional programmatic API.
- **Ctrl+S ordering:** the listener is on `window` in the **bubble** phase, so a board handler on
  `document`/an element fires first and can opt out via `preventDefault()` (the `defaultPrevented`
  gate). The shim is injected into `<head>` before any author script, so it is always registered.
- **`.drawio` → Monaco language mapping (LOW-6): out of scope for US-846** — a US-847 board-side /
  Monaco concern. US-846 pushes whatever `host.state.language` is.

## Implementation plan

### Step 1 — wire types (`src/ipc/board-bridge-channels.ts`)

**1a.** Extend the board→host union `BoardToHostMsg` (`:175`) with the two new posts and a `content`
payload:

```ts
// before
export interface BoardToHostMsg {
    __persephone: "board:interact" | "board:error" | "board:busy";
    /** `board:error` detail. */
    message?: string;
    /** `board:busy` value. */
    busy?: boolean;
}
// after
export interface BoardToHostMsg {
    __persephone:
        | "board:interact"
        | "board:error"
        | "board:busy"
        | "board:setContent" // content-host board wrote content (EPIC-043)
        | "board:save";      // content-host board / Ctrl+S requested a save (EPIC-043)
    /** `board:error` detail. */
    message?: string;
    /** `board:busy` value. */
    busy?: boolean;
    /** `board:setContent` payload — the new UTF-8 content. */
    content?: string;
}
```

**1b.** Add the host→board content push type (a distinct message; the renderer posts it into the
frame, the shim consumes it):

```ts
/** Host content pushed renderer → board over `iframe.contentWindow.postMessage` (EPIC-043).
 *  Repeated: an initial snapshot after the frame loads, then on every host content/language
 *  change. Echo-guarded renderer-side (a push equal to the board's last `setContent` is skipped),
 *  so the board's `onContentChange` never re-fires for the board's own write. */
export interface BoardHostContentMsg {
    __persephone: "host:content";
    content: string;
    language?: string;
}
```

**1c.** Add `contentHost` to the handshake init (`BoardPortInitMsg`, `:162`):

```ts
export interface BoardPortInitMsg {
    __persephoneInit: true;
    busy?: boolean;
    filePath?: string;
    /** True when this board is a content-host editor (EPIC-043): Persephone owns the content
     *  host and pushes `host:content`. Gates `persephone.host.getContent/getLanguage` in the shim
     *  (a plain board rejects instead of hanging). */
    contentHost?: boolean;
}
```

### Step 2 — shim `persephone.host` + inbound push handler + Ctrl+S (`src/board-shim.ts`)

**2a.** Import the new type (type-only, with the existing block `:31`):

```ts
import type {
    BoardBootContext,
    // …existing…
    BoardHostContentMsg,
} from "./ipc/board-bridge-channels";
```

**2b.** Add host-content state + settle, near the `filePath` block (`:82-96`). Mirrors the
settle-once + await-any-time pattern, and also fans out to `onContentChange` callbacks on **every**
push:

```ts
// ── Host content (EPIC-043) ──────────────────────────────────────────────────
// Content-host boards read Persephone-owned content pushed as `host:content`. A snapshot lands
// after the frame loads, then on every change. `getContent()` awaits the first snapshot (settle-
// once + await-any-time, like getFilePath); `onContentChange` fires on each subsequent push.
// `hostEnabled` is set from the handshake — false on a plain board, where getContent rejects.

let hostEnabled = false;
let hostContentSettled = false;
let hostContent = "";
let hostLanguage: string | undefined;
const hostContentResolvers: Array<(c: string) => void> = [];
const hostChangeCbs: Array<(content: string, language?: string) => void> = [];

function settleHostContent(content: string, language: string | undefined): void {
    hostContent = content;
    hostLanguage = language;
    if (!hostContentSettled) {
        hostContentSettled = true;
        for (const r of hostContentResolvers) r(content);
        hostContentResolvers.length = 0;
    }
    for (const cb of hostChangeCbs) {
        try {
            cb(content, language);
        } catch (e) {
            console.error("persephone.host.onContentChange callback error:", e);
        }
    }
}
```

**2c.** In the handshake listener (`:178-192`), read the new flag alongside `busy`/`filePath`:

```ts
    const data = event.data as
        { __persephoneInit?: boolean; busy?: boolean; filePath?: string; contentHost?: boolean }
        | undefined;
    // …existing guards + busy/filePath settles…
    if (data.contentHost) hostEnabled = true;
```

**2d.** Add a **second** `window` message listener for the content push (do not fold it into the
handshake listener, whose early-return drops non-`__persephoneInit` messages). Place it right after
the handshake listener:

```ts
// Host content push (EPIC-043) — renderer → board over window.postMessage. Same trust gate as the
// handshake: source must be the host parent frame; origin enforced only for a strict http(s) host.
window.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as BoardHostContentMsg | undefined;
    if (!data || data.__persephone !== "host:content") return;
    if (event.source !== window.parent) return;
    if (hostOriginStrict && event.origin !== boot.hostOrigin) return;
    settleHostContent(data.content, data.language);
});
```

**2e.** Add the automatic Ctrl+S fallback (CH3), near the other `window` listeners:

```ts
// Automatic save (EPIC-043 / CH3) — a content-host board saves through Persephone's pipe on
// Ctrl/Cmd+S with zero board code. `window` bubble phase, so a board handler on document/an element
// runs FIRST and can opt out via preventDefault(). Harmless on a plain board (main ignores it).
window.addEventListener("keydown", (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        if (e.defaultPrevented) return; // the board claimed it — stand down
        e.preventDefault();
        try {
            window.parent.postMessage({ __persephone: "board:save" }, hostPostTarget);
        } catch {
            // parent gone — nothing to save
        }
    }
});
```

**2f.** Add the `host` namespace to the `persephone` surface (`:482`, alongside `getFilePath`):

```ts
    /** Content-host bridge (EPIC-043). Meaningful only when this board is a content-host editor
     *  (manifest `editorKind: "content-host"`); on a plain board `getContent`/`getLanguage` reject. */
    host: {
        /** Current content — resolves to the first pushed snapshot (await any time). */
        getContent(): Promise<string> {
            if (!hostEnabled) {
                return Promise.reject(
                    new Error("persephone.host is available only for content-host boards"),
                );
            }
            if (hostContentSettled) return Promise.resolve(hostContent);
            return new Promise<string>((resolve) => hostContentResolvers.push(resolve));
        },
        /** Set content + mark the file modified (schedules the autosave cache). */
        setContent(content: string): void {
            try {
                window.parent.postMessage(
                    { __persephone: "board:setContent", content },
                    hostPostTarget,
                );
            } catch {
                // parent gone
            }
        },
        /** Fire on each external content change (reload, other-view edit, host transfer). Returns an
         *  unsubscribe. The board's OWN setContent does NOT re-fire this (renderer-side echo-guard). */
        onContentChange(cb: (content: string, language?: string) => void): () => void {
            if (!hostEnabled) return () => {};
            hostChangeCbs.push(cb);
            return () => {
                const i = hostChangeCbs.indexOf(cb);
                if (i >= 0) hostChangeCbs.splice(i, 1);
            };
        },
        /** Monaco language id of the current content (e.g. "xml", "json"), or undefined. */
        getLanguage(): Promise<string | undefined> {
            if (!hostEnabled) {
                return Promise.reject(
                    new Error("persephone.host is available only for content-host boards"),
                );
            }
            if (hostContentSettled) return Promise.resolve(hostLanguage);
            return new Promise<string | undefined>((resolve) =>
                hostContentResolvers.push(() => resolve(hostLanguage)),
            );
        },
        /** Save through Persephone's pipe (encryption / cache / dirty-clear). Optional — Ctrl+S
         *  already saves automatically (CH3). */
        save(): void {
            try {
                window.parent.postMessage({ __persephone: "board:save" }, hostPostTarget);
            } catch {
                // parent gone
            }
        },
    },
```

> Note the `getLanguage` await-branch pushes a resolver that reads `hostLanguage` at settle time (the
> resolver array is keyed to content but language is settled in the same call), so a pre-settle
> `getLanguage()` still resolves correctly.

### Step 3 — model bridge methods + restore-error flag (`BoardContentEditorModel.ts`)

**3a.** Add the two thin pass-throughs (the view calls these; the echo-guard lives in the view):

```ts
    // ── Content bridge (US-846) — the view (`BoardWebview`) owns the echo-guard ──

    /** Apply content the board wrote (`persephone.host.setContent`). `byUser` true → marks the file
     *  modified + schedules the autosave cache, exactly like a Monaco/Grid user edit. */
    hostChangeContent(content: string): void {
        this._host?.changeContent(content, true);
    }

    /** Save through the pipe (Ctrl+S fallback or `persephone.host.save()`). */
    hostSave(): void {
        void this._host?.saveFile();
    }
```

**3b.** In `restore()`'s catch (currently `ui.notify(...)`), also set the reactive error flag, and
clear it on success:

```ts
    override async restore(): Promise<void> {
        await super.restore();
        try {
            // …existing host build / restore / adopt…
            this.adoptHost(this._host);
            this.state.update((s) => { s.contentHostError = undefined; });
        } catch (err) {
            const message = (err as Error).message || "Failed to restore board content.";
            ui.notify(message, "error");
            this.state.update((s) => { s.contentHostError = message; });
        }
        this._pendingHost = undefined;
    }
```

`saveFile` is a public method on `TextFileModel` (`TextEditorModel.ts:398`). No new import.

### Step 4 — `BoardEditorState.contentHostError` (`BoardEditorModel.ts`)

Add the optional field to the interface (`:47`, after `secondaryView`) — inert for plain boards, only
ever set by `BoardContentEditorModel.restore()`:

```ts
    /** Sidebar panel contributions. */
    secondaryView?: string[];
    /** Content-host boards only (EPIC-043): set when the content HOST fails to restore (file
     *  missing / unreadable), so the view shows a distinct empty state rather than a blank board. */
    contentHostError?: string;
```

No change to `getDefaultBoardEditorState` (undefined by omission).

### Step 5 — `BoardWebview` content-host wiring

**File:** `src/renderer/editors/board/BoardWebview.tsx`

**5a.** Type-only import of the subclass (for the two inbound methods) and the push type:

```ts
import type { BoardContentEditorModel } from "./BoardContentEditorModel";
import type { BoardHostContentMsg } from "../../../ipc/board-bridge-channels";
```

**5b.** Add the echo-guard ref (near `pendingPortRef`, `:48`):

```ts
    // Echo-guard: the board's own setContent value, so the host→board push of that same value
    // (the host emits it back) is skipped and the board's onContentChange doesn't re-fire (mirrors
    // GridEditor._changedContent). Per-mount — a reload re-reads via getContent().
    const lastBoardContentRef = useRef<string | undefined>(undefined);
```

**5c.** Carry the content-host flag in the handshake (`transferPort`, `:95`):

```ts
        const init: BoardPortInitMsg = {
            __persephoneInit: true,
            busy: !!model.state.get().busy,
            filePath: model.currentFilePath(),
            contentHost: !!model.contentHost,
        };
```

**5d.** Push the initial content snapshot on frame load (in `handleLoad`, `:127`), after the port
request — the shim's `host:content` listener is live by `load`:

```ts
    const handleLoad = useCallback(() => {
        if (!host) return;
        void api.requestBoardPort(boardId, host, model.id);
        void api.registerBoardFrame(model.id, host, boardId);
        // EPIC-043: seed the content-host board with the current host content. Subsequent changes
        // ride the host.state subscription (5e). The shim awaits this (getContent settle-once), so
        // a not-yet-restored host just means the subscription delivers the first snapshot instead.
        const chost = model.contentHost;
        const win = iframeRef.current?.contentWindow;
        if (chost && win) {
            const { content, language } = chost.state.get();
            lastBoardContentRef.current = undefined;
            const msg: BoardHostContentMsg = { __persephone: "host:content", content, language };
            win.postMessage(msg, `board://${host}`);
        }
    }, [host, boardId, model]);
```

**5e.** Subscribe to host content and push on change (a new effect, gated on `model.contentHost`).
Depends on `host` so it re-runs per board-host resolution:

```ts
    // EPIC-043: push host content/language into a content-host board on every change (external
    // reload, other-view edit, host transfer), echo-guarded against the board's own setContent.
    useEffect(() => {
        const chost = model.contentHost;
        if (!host || !chost) return;
        const unsub = chost.state.subscribe(
            (content) => {
                const c = content as string;
                if (c === lastBoardContentRef.current) return; // board's own write — don't echo
                const win = iframeRef.current?.contentWindow;
                if (!win) return;
                const msg: BoardHostContentMsg = {
                    __persephone: "host:content",
                    content: c,
                    language: chost.state.get().language,
                };
                win.postMessage(msg, `board://${host}`);
            },
            (s) => s.content,
        );
        return () => unsub();
    }, [host, model]);
```

**5f.** Route the two inbound posts in `onMessage` (`:144-162`), after the `board:busy` branch:

```ts
            } else if (d.__persephone === "board:setContent") {
                // Content-host board wrote content (EPIC-043). Stash for the echo-guard BEFORE
                // applying, so the host.state push of this same value (5e) is skipped.
                const content = typeof d.content === "string" ? d.content : "";
                lastBoardContentRef.current = content;
                (model as BoardContentEditorModel).hostChangeContent?.(content);
            } else if (d.__persephone === "board:save") {
                (model as BoardContentEditorModel).hostSave?.();
            }
```

Extend the local `d` cast to include `content` (`:145`):

```ts
            const d = e.data as
                { __persephone?: string; message?: string; busy?: boolean; content?: string }
                | undefined;
```

> `hostChangeContent` / `hostSave` are called via optional-chaining and only after `board:setContent`
> / `board:save`, which the shim posts **only** for a content-host board — so a plain
> `BoardEditorModel` (which lacks the methods) is never asked to run them. The `model.contentHost`
> gate on the push side (5d/5e) keeps the outbound direction plain-board-safe too.

### Step 6 — host-restore-failure empty state (`BoardEditorView.tsx`)

Render a distinct message when a content-host board's host failed to restore (file gone), instead of
a blank trusted board. Read `contentHostError` in the existing `state.use` selector and branch after
the trust gate, before the webview:

```tsx
    const s = model.state.use((st) => ({
        boardRoot: st.boardRoot,
        selectedBoard: st.selectedBoard,
        reloadToken: st.reloadToken,
        contentHostError: st.contentHostError,
    }));
    // …existing selectedRoot / trust gates…

    // EPIC-043: the board is trusted and resolved, but its content HOST failed to restore
    // (e.g. the edited file was deleted). Show why, rather than a blank board.
    if (s.contentHostError) {
        return (
            <Panel
                name="board-content-error"
                direction="column"
                flex={1}
                width="100%"
                alignItems="center"
                justifyContent="center"
                style={{ color: color.text.secondary, padding: 24, textAlign: "center" }}
            >
                {s.contentHostError}
            </Panel>
        );
    }
```

Add `import color from "../../theme/color";` if not already present. (The existing file imports
`Panel` already.)

### Step 7 — verify

- `npx tsc --noEmit -p tsconfig.json` clean.
- `npx eslint` clean on the six touched files.
- Rebuild the shim (`board-shim.ts` is bundled as an IIFE by `scripts/dev.mjs` / `build-prod.mjs`) —
  `npm start` re-bundles it; confirm no runtime error in a board.
- Smoke test deferred to US-847 (needs a content-host board to consume the API). Interim manual check
  possible with a throwaway board declaring `editorKind: "content-host"` that calls
  `persephone.host.getContent()` and renders the string.

## Concerns

- **C1 — initial-push vs. subscription ordering.** `handleLoad` (5d) reads the current host snapshot
  once the frame loaded (shim listener live); the `host.state` subscription (5e) covers every later
  change. If the host isn't restored at `load`, the snapshot is empty/stale but the subscription
  delivers the real content the moment `restore()` completes, and `getContent()` awaits it
  (settle-once). No lost content, no double-delivery beyond a harmless identical re-push.
- **C2 — echo-guard is per-mount and only covers the immediate echo.** The ref guards exactly one
  value: the board's last `setContent`. When the host emits that value back (synchronously inside
  `changeContent`), the subscription sees `content === ref` and skips. A subsequent *different*
  host change (external edit) pushes normally. On reload the ref resets and the board re-reads via
  `getContent()`. This matches `GridEditor`'s single-value `_changedContent`.
- **C3 — Ctrl+S bubble-phase opt-out.** The shim listens on `window` (bubble), so a board handler on
  `document`/an element runs first; calling `preventDefault()` sets `defaultPrevented`, and the shim
  stands down. The shim is injected before author scripts, so it is always registered. Chosen over
  capture phase precisely so the board wins by default-prevention.
- **C4 — plain-board safety.** `persephone.host.getContent/getLanguage` reject on a plain board
  (`hostEnabled` false from the handshake), `onContentChange` is a no-op, and the renderer never posts
  `host:content` nor calls `hostChangeContent`/`hostSave` (gated on `model.contentHost`). A plain board
  is completely unaffected; the only always-on addition is the Ctrl+S listener, which posts
  `board:save` that a plain-board model ignores (no `hostSave`).
- **C5 — `TextFileModel.state.subscribe(cb, selector)` signature.** Verified against `GridEditor.ts:343`
  — `subscribe(callback, selector)` where `callback` receives the selected value. The push effect uses
  the same two-arg form with `s => s.content`.
- **C6 — no main-process involvement.** The content bridge is entirely renderer↔iframe. Main mints the
  port and relays theme, but content never crosses to main. This keeps encryption/cache logic
  renderer-side (below the host line) and out of the board's reach — the epic's security posture.
- **C7 — `saveFile()` with no path.** For a freshly-created (never-saved) content-host file, `saveFile`
  would prompt Save As via the host's normal flow — the same behavior as Monaco. Not special-cased.
- **C8 — board authoring guide is deferred.** Documenting `persephone.host.*` in
  `assets/board-template/CLAUDE.md` / `mcp-res-boards.md` / the demo board happens at **epic
  close-out** (`/document`), per the deferred-review model — not in this task.

## Acceptance criteria

1. A trusted `editorKind: "content-host"` board opened on a file receives the file's content via
   `persephone.host.getContent()` and re-renders on `persephone.host.onContentChange()`.
2. `persephone.host.setContent(x)` marks the file modified (tab dot), schedules the autosave cache, and
   does **not** re-fire the board's own `onContentChange`.
3. Ctrl+S in the board saves through the pipe (dirty cleared) with no board save code; a board handler
   that calls `preventDefault()` on Ctrl+S suppresses the fallback.
4. Switching content-host board ⇄ Monaco (US-845) transfers the live content: edits made in Monaco show
   in the board after switching back, and vice-versa.
5. On a **plain** board, `persephone.host.getContent()` rejects; the board is otherwise unaffected.
6. A content-host board whose file was deleted shows the `contentHostError` empty state, not a blank
   board.
7. `npx tsc --noEmit` and `npx eslint` are clean on the six touched files.

## Files changed

| File | Change |
|------|--------|
| `src/ipc/board-bridge-channels.ts` | Extend `BoardToHostMsg` (`board:setContent`/`board:save` + `content`); add `BoardHostContentMsg` (host→board push); add `contentHost` to `BoardPortInitMsg`. |
| `src/board-shim.ts` | Host-content state + `settleHostContent`; read `contentHost` at handshake; second `window` listener for `host:content`; automatic Ctrl+S fallback; `persephone.host` namespace (`getContent`/`setContent`/`onContentChange`/`getLanguage`/`save`). |
| `src/renderer/editors/board/BoardContentEditorModel.ts` | Add `hostChangeContent` / `hostSave`; set/clear `contentHostError` in `restore()`. |
| `src/renderer/editors/board/BoardEditorModel.ts` | Add optional `contentHostError?: string` to `BoardEditorState` (inert for plain boards). |
| `src/renderer/editors/board/BoardWebview.tsx` | Content-host wiring: echo-guard ref, `contentHost` in handshake, initial push on load, `host.state`→push subscription, route `board:setContent`/`board:save` → `hostChangeContent`/`hostSave`. |
| `src/renderer/editors/board/BoardEditorView.tsx` | Render the `contentHostError` empty state after the trust gate. |

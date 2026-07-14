# US-838: filePath into the board

**Epic:** [EPIC-042 — Boards as Custom Editors](../../epics/EPIC-042.md) · **task 3 of the build order**
**Depends on:** [US-837](../US-837-custom-editor-registry/README.md) (registry + virtual-id helpers — done). Consumes nothing new from it yet; the crux task ([US-839](../../epics/EPIC-042.md)) depends on **this** task's plumbing.
**Status:** 📝 Planned — carved 2026-07-14, awaiting "let's implement"

## Goal

Give a board the **file path** it is meant to edit, and expose it to board code as an **async
`persephone.getFilePath()`**. This is the data-plumbing half of the "board as file editor" story: a
`filePath` rides the `persephone-board://` open as `ILinkData` metadata, lands on the board
editor's state, is carried to the board at the port handshake (exactly like the `busy` flag), and
is served by `persephone.getFilePath()` in the board shim. The board reads/writes that file with
the **existing** top-level `persephone.readFile()` / `persephone.writeFile()`.

**A single async method, no property (CE1-b, user 2026-07-14).** Only `getFilePath()` is exposed —
a `Promise<string | undefined>` that resolves when the handshake lands (mirroring `getBoardBusy()`),
so a board author can rely on it **regardless of timing** and is never handed a racy, maybe-`undefined`
property. There is **no** `persephone.filePath` property.

**No `host` namespace this epic (CE5).** Reads/writes reuse the existing RPC.
`persephone.host.getContent()/setContent()` is the future content-host variant.

This task is verifiable on its own: open a board via `persephone-board://` with a `filePath` in
the link metadata and confirm the board sees it. It does **not** route file-opens to boards or add
the switch — that is US-839 (the crux), which populates `filePath` on the switch path and reads it
back on switch-away.

## Background — the delivery path (all verified 2026-07-14)

The **`busy` flag (US-799)** is the exact template: a per-open value known only to the renderer,
carried to the board at the one-time port handshake. `filePath` follows the same wiring.

| Stage | File | Current (`busy`) |
|-------|------|------------------|
| Link metadata off `ILinkData` | `src/renderer/api/types/io.link-data.d.ts` | `explorerRoot?` rides the openRawLink call, persisted (not ephemeral); read back from `state.sourceLink`. |
| Set onto editor state | `PagesLifecycleModel.ts:553-554, 820-822` | `s.sourceLink = options.sourceLink` — set generically **after** the factory builds the model. |
| Board editor state | `editors/board/BoardEditorModel.ts` `BoardEditorState` | has `busy?`; `explorerRoot` is **not** a state field — read from `state.sourceLink?.explorerRoot`. |
| Handshake wire type | `src/ipc/board-bridge-channels.ts:162` `BoardPortInitMsg` | `{ __persephoneInit: true; busy?: boolean }`. |
| Handshake send | `editors/board/BoardWebview.tsx:95` `transferPort` | `const init = { __persephoneInit: true, busy: !!model.state.get().busy }; win.postMessage(init, ..., [port])`. |
| Shim receive + expose | `src/board-shim.ts` (init handler `:162-172`; `busyState` `:73`; `persephone` object `~:462`; `setBoardBusy`/`getBoardBusy` `:504-518`) | init sets `busyState`; `getBoardBusy()` awaits it via a resolver queue. |

Key facts this design rests on:
- **`filePath` is free on `ILinkData`** — no existing field (grep confirmed).
- The **factory** (`editors/board/index.tsx` `newEditorModel(filePath?)`) receives only the encoded
  `persephone-board://` **link string** (its `filePath` param IS the link), decodes the board root,
  and calls `initFromBoardRoot(boardRoot)`. It does **not** receive the `ILinkData`, so per-open
  metadata (like `explorerRoot`, and now our file path) reaches the model via `state.sourceLink`,
  set separately by `PagesLifecycleModel`.
- The **`persephone-board://` URL must stay a pure board identifier** — its JSDoc says a `filePath`
  "rides as `ILinkData` metadata … never baked into this URL", and `matchesNavigationTarget` decodes
  the URL for the per-board singleton match, so putting a file path in the URL would break identity.
  Hence the file path travels on `ILinkData`, not in the link.

### Two entry points for the board's file path (why both `state.filePath` and `sourceLink`)

1. **openRawLink path (this task):** `createLinkData(encodePersephoneBoardLink(root), { filePath })`
   → `state.sourceLink.filePath` (set by `PagesLifecycleModel`, persisted). No factory change.
2. **Switch path (US-839):** the crux builds the model via `buildEditorById("board-editor:<root>",
   filePath)` with **no** `ILinkData` / `sourceLink`, so it must pass the file path directly →
   `initFromBoardRoot(boardRoot, filePath)` → `state.filePath`.

So the model needs **one authoritative accessor** that merges both:
`currentFilePath() = state.filePath ?? state.sourceLink?.filePath`. This task adds the accessor and
the `state.filePath` field (the switch path that fills it is US-839).

## Implementation plan

### Step 1 — `ILinkData.filePath`

**File:** `src/renderer/api/types/io.link-data.d.ts` (add after `explorerRoot`, mirror its doc)

```ts
    /** The file a custom-editor board edits (EPIC-042). Rides the `persephone-board://`
     *  openRawLink as metadata (the URL stays a pure board id); lands on the board editor's
     *  `state.sourceLink` and is served to the board via `persephone.getFilePath()`. Persisted (NOT
     *  ephemeral) so a restored custom-editor board re-opens the same file; never copied into a
     *  stored Link `ILink` (`linkDataToLink` builds an explicit object and ignores it). */
    filePath?: string;
```

Do **not** add `filePath` to `EPHEMERAL_FIELDS` in `src/shared/link-data.ts` (it must persist).
Confirm `linkDataToLink` (same file) does not spread it — it builds an explicit object, so no leak.

### Step 2 — `BoardEditorState.filePath` + `currentFilePath()` + `initFromBoardRoot` signature

**File:** `src/renderer/editors/board/BoardEditorModel.ts`

- Add to `BoardEditorState` (near `busy`):
  ```ts
  /** The file this board edits as a custom editor (EPIC-042). Set on the SWITCH path
   *  (US-839) via initFromBoardRoot; on the openRawLink path the file rides
   *  `state.sourceLink.filePath` instead. Read both via `currentFilePath()`. */
  filePath?: string;
  ```
- Add the authoritative accessor:
  ```ts
  /** The file path this board edits, from either entry point (switch → state.filePath;
   *  openRawLink → sourceLink.filePath). Undefined for a plain, non-custom-editor board. */
  currentFilePath(): string | undefined {
      const s = this.state.get();
      return s.filePath ?? s.sourceLink?.filePath;
  }
  ```
- Widen `initFromBoardRoot` to accept an optional file path (default keeps today's behavior):
  ```ts
  initFromBoardRoot(boardRoot: string, filePath?: string): void {
      const name = fpBasename(boardRoot);
      this.state.update((s) => {
          s.boardRoot = boardRoot;
          s.title = name;
          if (filePath) s.filePath = filePath;
      });
      void boardTrust.load();
      this.selectBoard(name);
      void this.refreshBoards();
  }
  ```
  The factory (`index.tsx`) keeps calling `initFromBoardRoot(boardLink.boardRoot)` — on the
  openRawLink path the file path arrives via `sourceLink`, so no factory change is needed. US-839
  is the caller that passes the second argument.

### Step 3 — Handshake wire type + send

**File:** `src/ipc/board-bridge-channels.ts` — extend `BoardPortInitMsg`:
```ts
export interface BoardPortInitMsg {
    __persephoneInit: true;
    busy?: boolean;
    /** The file a custom-editor board edits (EPIC-042) — carried at handshake so the board can
     *  served via `persephone.getFilePath()`. Undefined for a plain board. */
    filePath?: string;
}
```

**File:** `src/renderer/editors/board/BoardWebview.tsx` `transferPort` (~line 95):
```ts
const init: BoardPortInitMsg = {
    __persephoneInit: true,
    busy: !!model.state.get().busy,
    filePath: model.currentFilePath(),
};
```

### Step 4 — Shim: receive + expose `persephone.getFilePath()`

**File:** `src/board-shim.ts`

Mirror the `busy` settle/resolver pattern exactly (`busyState` `:73`, `settleBusy` `:76`,
`getBoardBusy` `:516`). `busy` uses `boolean | null` where `null` = "not yet known"; `filePath`'s
value can legitimately be `undefined` (a plainly-opened board), so use a separate **settled** flag
instead of a null sentinel.

- Add module state next to `busyState` (`:73`):
  ```ts
  // filePath (EPIC-042): the file a custom-editor board edits, carried at the handshake.
  // `getFilePath()` awaits the handshake; a plain board settles to `undefined`. A separate
  // `settled` flag (not a null sentinel) because `undefined` is itself a valid settled value.
  let filePathSettled = false;
  let filePathValue: string | undefined;
  const filePathResolvers: Array<(p: string | undefined) => void> = [];

  function settleFilePath(value: string | undefined): void {
      filePathSettled = true;
      filePathValue = value;
      for (const r of filePathResolvers) r(value);
      filePathResolvers.length = 0;
  }
  ```
- In the `__persephoneInit` handler (`:162-172`), widen the cast and settle (every handshake settles
  it — a plain board carries `filePath: undefined`, so `getFilePath()` still resolves, to `undefined`):
  ```ts
  const data = event.data as
      { __persephoneInit?: boolean; busy?: boolean; filePath?: string } | undefined;
  ...
  if (!filePathSettled) settleFilePath(data.filePath);
  ```
- On the `persephone` object (~`:462`), expose the async method (next to `getBoardBusy`):
  ```ts
  /** The absolute path of the file this board edits as a custom editor (EPIC-042), or
   *  `undefined` for a board opened plainly. Resolves when the host handshake lands, so it is
   *  safe to await at any time. Read/write the file with `persephone.readFile`/`writeFile`. */
  getFilePath(): Promise<string | undefined> {
      if (filePathSettled) return Promise.resolve(filePathValue);
      return new Promise((resolve) => filePathResolvers.push(resolve));
  }
  ```
  **No `filePath` property is added** (CE1-b) — reads/writes stay the existing top-level
  `persephone.readFile()` / `persephone.writeFile()`.

### Step 5 — Document `persephone.getFilePath()` in the board authoring guides (prose — no `.d.ts`)

There is no board `.d.ts`; the surface is prose. Add `persephone.getFilePath()` to:
- `assets/board-template/CLAUDE.md` — the bridge surface reference (near `readFile`/`writeFile`):
  "when this board is opened as a custom editor for a file, `await persephone.getFilePath()` returns
  that file's absolute path (read/write it with `persephone.readFile()`/`writeFile()`); it resolves
  to `undefined` for a board opened plainly. Safe to await at any time — it waits for the host
  handshake."
- `assets/mcp-res-boards.md` — one line in the bridge/agent surface section.
Ticket-free (consumer-facing), per `/document` rules. (The Demo board need not demonstrate it this
task; the DrawIO board US-840 is the real consumer.)

### Step 6 — No changes needed (so the implementer doesn't chase them)

- `persephone-board-link.ts` — the URL stays a pure board id; **do not** encode `filePath` (breaks
  `matchesNavigationTarget`). No change.
- `board-bridge.ts` (main) — the init message is minted in the **renderer** (`BoardWebview`), not
  main; main only relays the transferred port. No change.
- `switchFrom` / `switchMainEditor` / `buildEditorById` — the switch-path population of `filePath`
  and reading it back from the old host is **US-839** (see Reassignment note). Not here.
- `register-editors.ts` / registry / resolution — untouched (US-839).

## Concerns / open questions

1. **`persephone.getFilePath()` readiness. ✅ decided (user, 2026-07-14): option (b), async method,
   no property.** `filePath` arrives at the **port handshake** (`transferPort` runs after the iframe
   loads), so any synchronous property would be racy at script-top. Instead the shim exposes a single
   **`getFilePath(): Promise<string | undefined>`** that resolves when the handshake lands (mirroring
   `getBoardBusy`), and **no `persephone.filePath` property**. A board author uses `await
   persephone.getFilePath()` and can rely on it regardless of timing — never a maybe-`undefined`
   property to reason about. A plainly-opened board's handshake settles it to `undefined`.
2. **`filePath` must persist — for app-restart restore AND cross-window page moves. ✅ confirmed
   (user, 2026-07-14).** The same save/restore page mechanism backs both restarting Persephone and
   **dragging a page to another Persephone window**, so a custom-editor board's file path must ride
   the persisted state or the moved/restored board would lose its file. Both delivery paths already
   persist, so no extra work is needed — just verify:
   - **Switch path:** `state.filePath` is part of `BoardEditorState` (persisted as a whole) and is
     merged back in `newEditorModelFromState` (`index.tsx` — `{...getDefaultBoardEditorState(),
     ...state}`); `restore()` doesn't touch it.
   - **openRawLink path:** `filePath` rides `state.sourceLink`, which is persisted state; it is
     **not** in `EPHEMERAL_FIELDS` (Step 1), so `cleanForStorage` keeps it.
   - After restore/move the board is created straight from persisted state (not via
     `initFromBoardRoot`), so `currentFilePath()` reads the restored `state.filePath ??
     state.sourceLink?.filePath`, and `transferPort` hands it to the re-created board at its
     handshake. `getFilePath()` therefore resolves to the same path in the new window.
   - A restored board whose file no longer exists is the board's own concern (its `readFile` errors);
     the board model stays valid (its `boardRoot` resolves). No page-model change.
3. **Generic field name on `ILinkData`. ✅ accepted (user, 2026-07-14).** `filePath` is broad, but the
   pipeline uses `href`/`url` for the pipe's own source; `filePath` here is specifically "the file a
   custom-editor board edits". The epic/CE5 named it `filePath`; it is only read by the board editor.
   Documented so it isn't confused with `href`/`url`.
4. **No unit tests. ✅ confirmed (user, 2026-07-14).** Persephone has no unit-test harness — verify via
   `npm run lint` + typecheck, and a manual check: `app.events.openRawLink.sendAsync(createLinkData(encodePersephoneBoardLink(root),
   { filePath: "C:/tmp/x.txt" }))` on a trusted board, then confirm `await persephone.getFilePath()`
   resolves to that path (e.g. a one-line probe board, or a `browser_evaluate` in the board frame).

## Acceptance criteria

- `ILinkData` has `filePath?: string`; it is **not** in `EPHEMERAL_FIELDS`; `linkDataToLink` does not
  copy it.
- `BoardEditorState.filePath?: string` exists; `BoardEditorModel.currentFilePath()` returns
  `state.filePath ?? state.sourceLink?.filePath`; `initFromBoardRoot(boardRoot, filePath?)` sets
  `state.filePath` when a file path is passed and is backward-compatible when omitted.
- `BoardPortInitMsg.filePath?` exists; `BoardWebview.transferPort` sends `model.currentFilePath()`.
- `board-shim.ts` settles the handshake `filePath` and exposes `persephone.getFilePath():
  Promise<string | undefined>` (mirrors `getBoardBusy`); **no `persephone.filePath` property**.
- Opening a trusted board via `persephone-board://` with `{ filePath }` metadata makes the board's
  `await persephone.getFilePath()` resolve to that path; a plainly-opened board resolves to
  `undefined`; awaiting before the handshake still resolves once it lands.
- `filePath` **persists**: a custom-editor board reloaded after an app restart — or moved to another
  Persephone window (same save/restore mechanism) — still resolves the same `getFilePath()` (both
  `state.filePath` and `state.sourceLink.filePath` survive; `filePath` is not ephemeral).
- Board authoring guide + `mcp-res-boards.md` document `persephone.getFilePath()` (ticket-free).
- `npm run lint` + typecheck clean. Nothing routes file-opens to boards yet (that is US-839).

## Files changed (summary)

| File | Change |
|------|--------|
| `src/renderer/api/types/io.link-data.d.ts` | Add `filePath?: string` (persisted metadata). |
| `src/renderer/editors/board/BoardEditorModel.ts` | Add `BoardEditorState.filePath`; `currentFilePath()`; `initFromBoardRoot(boardRoot, filePath?)`. |
| `src/ipc/board-bridge-channels.ts` | Add `filePath?` to `BoardPortInitMsg`. |
| `src/renderer/editors/board/BoardWebview.tsx` | Send `filePath: model.currentFilePath()` in the handshake. |
| `src/board-shim.ts` | Settle handshake `filePath` (settled-flag + resolver queue, mirroring `busy`); expose async `persephone.getFilePath()`. No property. |
| `assets/board-template/CLAUDE.md`, `assets/mcp-res-boards.md` | Document `persephone.getFilePath()` (prose). |

_No test files — Persephone has no unit-test harness (verify via lint + typecheck + a manual probe)._

## Reassignment note

The epic's original filePath-task row also listed *"switchFrom extracts filePath from the old host."*
That belongs to the **switch machinery** and is moved to **US-839 (the crux)**, where the
`switchMainEditor` board branch and `buildEditorById("board-editor:<root>", filePath)` live — the
only places that populate `filePath` on a switch and read it back on switch-away. US-838 delivers the
file path to the board *given that the model has one*; US-839 wires the paths that give the model one.

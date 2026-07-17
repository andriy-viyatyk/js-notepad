# US-868: Agent API — register / unregister / rename boards

Part of **[EPIC-045: Published Boards Catalog](../../epics/EPIC-045.md)**.

## Goal

Give scripts/agents three board-lifecycle calls on `app.boards` — `registerBoard`,
`unregisterBoard`, `renameBoard` — so an agent can trust, forget, and rename a board on the
user's behalf while keeping the security invariant intact: **the API requests, the user's trust
dialog grants**. This closes two gaps: an agent cannot trust a board today (`boardTrust` is
deliberately off the script surface), and "rename my board" currently forces the user to
re-trust the new path by hand.

Also the reset lever for EPIC-045 manual testing: `unregisterBoard` (untrust + unpin) plus an
`app.fs` folder delete via `execute_script` resets installed/registered state between runs —
full folder-deleting `uninstallBoard` still arrives with US-869.

## Background

### Security model (unchanged, must hold)

A board is web content and `persephone.execute()` is arbitrary RCE, so nothing renders/runs
until the user trusts it. Trust is **never** read from any in-board file — it is always a user
action (the trust dialog) or a provenance write for a board Persephone created itself. This is
why `board-trust.ts` is intentionally **not** on `app` / any script `.d.ts`. The precedent for
"agent requests, user clicks" is the MCP-initiated toolset registration dialog and
`showTrustBoardDialog`.

### Existing pieces this task composes (all present)

| Piece | File | Relevant surface |
|-------|------|------------------|
| Board trust registry | `src/renderer/api/board-trust.ts` | `boardTrust.load()`, `isTrusted(root)` (ancestor-aware), `trust(root)` (idempotent, `load()`s internally, outer-wins), `untrust(root)` (exact-key removal, `load()`s internally) |
| Trust dialog | `src/renderer/ui/dialogs/TrustBoardDialog.tsx` | `showTrustBoardDialog(path): Promise<boolean>` |
| Busy-boards registry | `src/renderer/editors/board/busy-boards.ts` | `isBoardRootBusy(root): boolean` |
| Pins | `src/renderer/ui/sidebar/pinned-items.ts` | `PinnedRef` (`{ kind: "board"; root }`), `isPinned(ref)`, `addPin(ref)`, `removePin(ref)` |
| Install registry (US-863) | `src/renderer/api/board-install-registry.ts` | `boardInstallRegistry.load()`, `getByRoot(root)`, `record(entry)` (replace-by-id) |
| Board folder check | `src/renderer/editors/board/board-manifest.ts` | `isBoardFolder(root): Promise<boolean>` |
| Board link | `src/renderer/content/persephone-board-link.ts` | `encodePersephoneBoardLink(root)` |
| Path utils | `src/renderer/core/utils/file-path.ts` | `fpDirname`, `fpBasename`, `fpJoin`, `fpNormalizeForCompare` |
| FS | `src/renderer/api/fs.ts` | `fs.rename(oldPath, newPath)` (directory rename via `renameSync`), `fs.exists(path)` |
| Open-page navigation | `src/renderer/api/app.ts` + `src/shared/link-data.ts` | `app.events.openRawLink.sendAsync(createLinkData(href, { pageId }))` — the `BoardToolbar` boards-switcher precedent (same-tab main-editor swap) |
| Pages | `src/renderer/api/pages/PagesModel.ts` / `PageModel.ts` | `app.pages.pages: PageModel[]`, `page.mainEditorInstance: EditorModel \| null`, `page.id` |

### Key behaviors to rely on

- `boardTrust.trust()` / `untrust()` each call `load()` internally (re-read before write), so
  callers don't have to. But `isTrusted()` reads current in-memory state — call
  `boardTrust.load()` first when you need an accurate pre-check.
- Trust is **ancestor-aware** and keeps no nested pairs: if a board is trusted via an ancestor
  folder, `untrust(exactOldRoot)` is a harmless no-op and `trust(newRoot)` under the same
  ancestor is also a no-op — the board stays trusted at the new path either way. So the
  transfer `untrust(old); trust(new)` is correct in both the exact-registered and
  inherited-trust cases.
- `boardInstallRegistry.load()` **prunes** entries whose root no longer holds a manifest.
  Because rename removes the old folder, capture the install entry **before** the rename and
  `record()` the new root **after** — otherwise `load()` prunes it.
- `boardInstallRegistry.record()` replaces the entry by `id`, so recording `{ ...entry, root:
  newRoot }` moves it.

### `app.boards` today

`src/renderer/api/boards.ts` exposes `createBoard` / `createDemoBoard` / `openBoard`, using
dynamic `import()` for editor-adjacent modules so the core `api` bundle stays decoupled. This
task follows that pattern — `board-trust`, `busy-boards`, `pinned-items`,
`board-install-registry`, `TrustBoardDialog`, `persephone-board-link` are all reached via
dynamic import inside the three methods.

## Implementation plan

### 1. `BoardEditorModel` — expose the board root (open-page navigation for rename)

`renameBoard` must re-point any open page running the old root. There is no public accessor for
the board root today (`boardRoot` lives in `state`, and `matchesNavigationTarget` only answers a
link query for `target === "board-view"`).

- **File:** `src/renderer/editors/board/BoardEditorModel.ts`
- Add a public getter near `currentFilePath()` (~line 282):
  ```typescript
  /** Absolute root of the board this editor runs (undefined for a plain, path-less board). */
  get boardRoot(): string | undefined {
      return this.state.get().boardRoot;
  }
  ```
  `BoardContentEditorModel extends BoardEditorModel`, so it inherits this — content-host board
  pages are covered too.

### 2. `boards.ts` — implement the three methods

- **File:** `src/renderer/api/boards.ts`
- Add imports as needed **inside** the async methods via dynamic `import()` (keep the module
  top-level import list as-is: `app`, `fs`, `IBoards`).

**`registerBoard(boardRoot): Promise<boolean>`**
```typescript
registerBoard: async (boardRoot: string): Promise<boolean> => {
    const { isBoardFolder } = await import("../editors/board/board-manifest");
    if (!(await isBoardFolder(boardRoot))) {
        throw new Error(`Not a board: "${boardRoot}" is missing or has no board-manifest.json.`);
    }
    const { boardTrust } = await import("./board-trust");
    await boardTrust.load();
    if (boardTrust.isTrusted(boardRoot)) return true; // already trusted (incl. via ancestor)
    const { showTrustBoardDialog } = await import("../ui/dialogs/TrustBoardDialog");
    const ok = await showTrustBoardDialog(boardRoot);
    if (!ok) return false;
    await boardTrust.trust(boardRoot);
    return true;
},
```
The script can never trust without the user's dialog click. Returns whether the board ended up
trusted.

**`unregisterBoard(boardRoot): Promise<void>`** — mirrors the sidebar "Remove"; no dialog
(untrusting only reduces privilege):
```typescript
unregisterBoard: async (boardRoot: string): Promise<void> => {
    const { boardTrust } = await import("./board-trust");
    await boardTrust.untrust(boardRoot);
    const { removePin } = await import("../ui/sidebar/pinned-items");
    removePin({ kind: "board", root: boardRoot });
},
```

**`renameBoard(boardRoot, newName): Promise<string>`** — refuses busy; renames folder; transfers
trust old→new with **no dialog** (same already-trusted content at a new path — no privilege
gain); updates pins + install-registry root; re-points open pages. Returns the new root.
```typescript
renameBoard: async (boardRoot: string, newName: string): Promise<string> => {
    const { isBoardFolder } = await import("../editors/board/board-manifest");
    if (!(await isBoardFolder(boardRoot))) {
        throw new Error(`Not a board: "${boardRoot}" is missing or has no board-manifest.json.`);
    }
    const { isBoardRootBusy } = await import("../editors/board/busy-boards");
    if (isBoardRootBusy(boardRoot)) {
        throw new Error("Cannot rename a board while it is running (busy). Stop it first.");
    }
    const { fpDirname, fpJoin, fpNormalizeForCompare } = await import("../core/utils/file-path");
    const newRoot = fpJoin(fpDirname(boardRoot), newName);
    if (fpNormalizeForCompare(newRoot) === fpNormalizeForCompare(boardRoot)) return boardRoot; // no-op
    if (await fs.exists(newRoot)) {
        throw new Error(`Cannot rename: "${newRoot}" already exists.`);
    }

    // Capture trust / pin / install state BEFORE the rename (registry load() prunes dead roots).
    const { boardTrust } = await import("./board-trust");
    await boardTrust.load();
    const wasTrusted = boardTrust.isTrusted(boardRoot);
    const { isPinned } = await import("../ui/sidebar/pinned-items");
    const wasPinned = isPinned({ kind: "board", root: boardRoot });
    const { boardInstallRegistry } = await import("./board-install-registry");
    await boardInstallRegistry.load();
    const installEntry = boardInstallRegistry.getByRoot(boardRoot);

    // Rename the folder on disk.
    await fs.rename(boardRoot, newRoot);

    // Transfer trust (no dialog — same content, new path). untrust(old) is a no-op for
    // inherited trust; trust(new) is a no-op if still covered by an ancestor.
    if (wasTrusted) {
        await boardTrust.untrust(boardRoot);
        await boardTrust.trust(newRoot);
    }
    // Pins.
    if (wasPinned) {
        const { addPin, removePin } = await import("../ui/sidebar/pinned-items");
        removePin({ kind: "board", root: boardRoot });
        addPin({ kind: "board", root: newRoot });
    }
    // Install-registry root (catalog-installed boards).
    if (installEntry) {
        await boardInstallRegistry.record({ ...installEntry, root: newRoot });
    }

    // Re-point any open page running the old root to the new root (same tab).
    const { BoardEditorModel } = await import("../editors/board/BoardEditorModel");
    const { encodePersephoneBoardLink } = await import("../content/persephone-board-link");
    const { createLinkData } = await import("../../shared/link-data");
    const oldKey = fpNormalizeForCompare(boardRoot);
    for (const page of app.pages.pages) {
        const editor = page.mainEditorInstance;
        if (editor instanceof BoardEditorModel
            && editor.boardRoot
            && fpNormalizeForCompare(editor.boardRoot) === oldKey) {
            await app.events.openRawLink.sendAsync(
                createLinkData(encodePersephoneBoardLink(newRoot), {
                    pageId: page.id,
                    sourceId: "app-api",
                    explorerRoot: fpDirname(newRoot),
                }),
            );
        }
    }

    return newRoot;
},
```

Notes:
- Relative import depths from `src/renderer/api/boards.ts`: `../editors/...`, `../ui/...`,
  `../core/...`, `../content/...`, `./board-trust`, `./board-install-registry`, and
  `../../shared/link-data` (shared is two levels up). Verify each against the existing imports in
  the file.
- Use `app.events.openRawLink.sendAsync(createLinkData(...))` (not the thin `app.openRawLink`
  wrapper) because navigation needs `pageId` + `explorerRoot`, which the wrapper does not pass
  through — exactly the `BoardToolbar`/`TrustedBoardsList` pattern.

### 3. `IBoards` type — declare the three methods

- **File:** `src/renderer/api/types/boards.d.ts`
- Add to the `IBoards` interface, with JSDoc making the consent contract explicit:
  - `registerBoard(boardRoot: string): Promise<boolean>` — "Shows the user a **trust dialog**;
    returns `true` if the board is (or becomes) trusted, `false` if the user declines. A no-op
    `true` when already trusted. A script can never trust a board without this dialog."
  - `unregisterBoard(boardRoot: string): Promise<void>` — "Untrusts the board and removes its
    pin. No dialog (reducing privilege). The board stops rendering/running."
  - `renameBoard(boardRoot: string, newName: string): Promise<string>` — "Renames the board's
    folder to `newName` in the same parent, transferring trust, pin, and catalog-install
    registration to the new path with **no dialog** (same trusted content, new path), and
    re-points any open page. Returns the new root. Throws if the board is busy, is not a board,
    or the target name already exists."

### 4. Agent-facing guide

- **File:** `assets/mcp-res-boards.md`
- Extend the "Create & open a board" script-API note (~lines 41-44) with the lifecycle calls.
  State that `registerBoard` shows the user a trust dialog (and may return `false`), and that
  `renameBoard` keeps trust/pins with zero user clicks. Keep it ticket-free.

## Files changed

| File | Change |
|------|--------|
| `src/renderer/editors/board/BoardEditorModel.ts` | Add public `get boardRoot()` getter |
| `src/renderer/api/boards.ts` | Implement `registerBoard` / `unregisterBoard` / `renameBoard` (dynamic imports) |
| `src/renderer/api/types/boards.d.ts` | Declare the three methods on `IBoards` with consent-contract JSDoc |
| `assets/mcp-res-boards.md` | Document the lifecycle calls in the agent-facing guide |

**No changes needed:** `board-trust.ts`, `busy-boards.ts`, `pinned-items.ts`,
`board-install-registry.ts`, `board-manifest.ts`, `persephone-board-link.ts`, `fs.ts`,
`TrustBoardDialog.tsx` — all consumed as-is. No new MCP tool — agents reach these via
`execute_script`.

## Concerns / open questions

1. **Inherited trust + rename — RESOLVED.** If a board is trusted only via an ancestor folder,
   `untrust(oldExactRoot)` is a no-op and `trust(newRoot)` (still under the same ancestor) is
   also a no-op — the board remains trusted at the new path. The `untrust(old); trust(new)`
   sequence is therefore correct in every case; no special-casing.
2. **Content-host board editing a file, renamed while open — ACCEPTED.** A content-host board's
   editor id is `board-editor:<root>`; renaming the root changes that id. The open-page
   re-navigation above re-points `board-view` main pages; a content-host board that is currently
   the editor **for a file** re-navigates to the board link (losing the file association for that
   view until reopened). This is an edge case — catalog-installed content-host boards live in
   `<userData>/data/boards` and are rarely renamed while actively editing a file — and the busy
   guard already blocks the running case. Not worth extra machinery in this task.
3. **`newName` validation — MINIMAL.** We reject an existing target path and a no-op same-name
   rename. We do not sanitize illegal filename characters — `fs.rename` surfaces the OS error,
   which is a clear enough failure for an agent call. No extra validation layer.
4. **No dialog for `unregisterBoard` / `renameBoard` — INTENTIONAL.** Untrusting reduces
   privilege; renaming moves already-trusted content to a new path (no privilege gain). Only
   `registerBoard` (which grants trust) shows a dialog. This matches the Design's stated model.

## Acceptance criteria

- An agent calling `app.boards.registerBoard(root)` via `execute_script` sees the user shown
  exactly one trust dialog and nothing else; accepting trusts the board (it starts rendering and
  appears in Custom Boards & Editors), declining returns `false` and leaves it untrusted.
  Calling it on an already-trusted board returns `true` with no dialog.
- `app.boards.unregisterBoard(root)` untrusts the board and removes its pin with no dialog; the
  board stops running and disappears from the trusted lists. (Combined with an `app.fs` folder
  delete, this resets installed/registered state for EPIC-045 manual testing.)
- `app.boards.renameBoard(root, "New Name")` renames the folder, and the board stays trusted,
  pinned, and (if catalog-installed) update-checkable at the new path — with zero user
  interaction; an open board page follows to the new root. It throws if the board is busy, the
  target name already exists, or the path is not a board.
- Type-check / lint clean; the three methods appear in `IBoards` IntelliSense with the
  consent-contract docs; `assets/mcp-res-boards.md` documents them ticket-free.

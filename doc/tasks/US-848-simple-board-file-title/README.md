# US-848: Show the file name (not the board name) in the tab for a simple custom-editor board

**Epic:** [EPIC-043 — Content-Host Boards](../../epics/EPIC-043.md)
**Status:** Implemented — awaiting user test (epic deferred-review)

## Goal

When a **simple** (EPIC-042) board acts as a custom editor for a file, the page tab shows the file name, not the board folder name. Today opening a `.drawio` file with the DrawIO-viewer board shows **"drawio-viewer"** in the tab; it should show **the file's basename** (e.g. `diagram.drawio`), while keeping the board's own icon.

## Background

A board acting as a custom editor is a `BoardEditorModel` with a virtual `board-editor:<root>` id. The tab title comes straight from editor state:

- `EditorModel.title` → `this.state.get().title` (`src/renderer/editors/base/EditorModel.ts:207`).
- `BoardEditorModel.initFromBoardRoot(boardRoot, filePath?)` sets `s.title = fpBasename(boardRoot)` — the **board folder name** — regardless of whether a file is being edited (`src/renderer/editors/board/BoardEditorModel.ts:200-210`).

Both entry points reach `initFromBoardRoot` **with** the `filePath` argument set:

1. **Direct file open / openRawLink** — `newEditorModel(filePath)` → `resolveEditorIdForFile` returns `board-editor:<root>` → `buildEditorById(id, filePath)` → `initFromBoardRoot(root, filePath)` (`PagesLifecycleModel.ts:268-272`, `:292-313`).
2. **Editor switch** (SwitchWidget → `switchMainEditor`) → also builds the board via `buildEditorById(boardEditorId, filePath)` → `initFromBoardRoot(root, filePath)`.

So a single change in `initFromBoardRoot` covers both live-open paths. Nothing else rewrites the title afterwards:

- `createEditorFromFile` only overrides `s.title` when a `title` argument is passed; the main file-open call site (`PagesLifecycleModel.ts:596`) passes none.
- `selectBoard` / `refreshBoards` / `reloadBoard` don't touch `title`.
- `restore()` doesn't touch `title` — it restores whatever was persisted, so once the fix lands new opens persist the file-name title and restore it correctly.

The icon is independent: `getIcon()` returns the board's own glyph (`BoardGlyph`) — unaffected by the title change.

**Relationship to the content-host path:** `BoardContentEditorModel` (US-844/845) already lands the file name in the tab via `adoptHost` (the host's title is the file basename). This task brings the **simple** board to the same behavior, so the DrawIO viewer reads correctly *before* its content-host conversion (US-847) and stays consistent after.

## Implementation plan

**File:** `src/renderer/editors/board/BoardEditorModel.ts` — `initFromBoardRoot` (~line 200).

Set the title to the file's basename when a `filePath` is present (custom-editor mode); otherwise keep the board name (plain board page):

```ts
initFromBoardRoot(boardRoot: string, filePath?: string): void {
    const name = fpBasename(boardRoot);
    this.state.update((s) => {
        s.boardRoot = boardRoot;
        // Custom-editor mode → show the file name in the tab (the board's own
        // name is not useful when it's editing a file); plain board → board name.
        s.title = filePath ? fpBasename(filePath) : name;
        if (filePath) s.filePath = filePath;
    });
    void boardTrust.load();
    this.selectBoard(name);
    void this.refreshBoards();
}
```

`fpBasename` is already imported. No other file changes.

## Concerns / Open questions

- **C1 — filePath only via `sourceLink`?** In the current code both entry points pass `filePath` to `initFromBoardRoot`, so the title is set at construction. If some future path opens a custom-editor board with the file only on `state.sourceLink.filePath` (set *after* construction), the title would fall back to the board name. If we want to be defensive, `title` could instead be derived reactively from `currentFilePath()`. **Recommendation:** keep the simple `initFromBoardRoot` fix — it matches every current call path; revisit only if a sourceLink-only path appears.
- **C2 — scope.** This is functionally an EPIC-042 (simple custom-editor board) polish, tracked here under EPIC-043 per request. It stands alone and doesn't depend on US-846/847.
- **C3 — `selectBoard(name)` still uses the board folder name** — correct; that argument drives board resolution/icon, not the tab title.

## Acceptance criteria

1. Opening a `.drawio` file with the DrawIO-viewer board shows the **file basename** in the page tab, not "drawio-viewer".
2. The tab still shows the **board's icon** (unchanged).
3. Opening the board **as a plain board page** (Boards panel / `openBoard`) still shows the **board name** in the tab.
4. Restart-restore of a file-editing simple board shows the file name (persisted correctly).
5. `npx tsc --noEmit` and `npx eslint` clean on the touched file.

## Files changed

| File | Change |
|------|--------|
| `src/renderer/editors/board/BoardEditorModel.ts` | `initFromBoardRoot` sets tab title to the file basename in custom-editor mode |

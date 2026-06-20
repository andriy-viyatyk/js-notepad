# US-744: Per-board custom icon

**Epic:** [EPIC-034 — Web Board](../../epics/EPIC-034.md) · **Status:** Implemented & user-verified (epic-deferred review)

## Goal

Let a board declare its own icon by dropping an image file in the board folder
(`icon.svg` / `icon.png` / `icon.ico`). That icon is shown in **three places**:

1. the **Persephone tab** when that board is the main editor,
2. the **board tile** on the Boards main-editor list, and
3. the **board row** in the Boards sidebar panel.

Where a board has no icon file, fall back to the existing **`BoardIcon`** glyph — and on
the sidebar specifically, this *replaces* today's generic 📁 folder emoji.

## Background

A board is a folder under `<project>/.persephone/boards/<Name>/`. The Board editor
(`BoardEditorModel`) enumerates those folders into `state.boards: string[]` (just names —
there is **no per-board metadata file** today; `refreshBoards()` only lists directories,
`src/renderer/editors/board/BoardEditorModel.ts:184`).

### The three icon surfaces today

| Surface | File | Current icon |
|---------|------|--------------|
| Sidebar board row | `BoardListSecondaryView.tsx:36` builds `FileListItem[]` with `isFolder: true`; `FileList.tsx:97` resolves `isFolder → <FolderIcon/>` (the 📁 emoji, `components/icons/FileIcon.tsx:21`) | 📁 folder emoji |
| Main-editor tile | `BoardEditorView.tsx:191` | `<BoardIcon width={16} height={16}/>` |
| Tab (board editor) | `BoardEditorModel.getIcon()` → `<BoardIcon/>` with `noLanguage = true` (`BoardEditorModel.ts:78,111`); `EditorIcon.tsx:37` renders `getIcon()` for `noLanguage` editors | `<BoardIcon/>` (dashboard glyph) |

`BoardIcon` is an SVG component from `src/renderer/theme/icons` (`currentColor`, theme-aware).

### Rendering an on-disk image as an icon — established precedent

`TreeProviderItemIcon.tsx:84` renders cached favicons with a plain
`<img src={absoluteLocalPath} style={{width:16,height:16}} />`, and `favicon-cache.ts` is the
template for resolving them: a **module-level memory cache** (`hostname → path`), a sync getter
(`getFaviconPathSync`), an async disk probe (`getFaviconPath`, tries extensions in order), and a
`useFavicons()` hook that returns a version counter so consumers re-render when a path resolves.
We mirror this pattern exactly for boards. (Raw absolute paths work in this renderer's `<img>` —
favicons prove it.)

> **Do not use `board://`.** That scheme is registered only on each board's *own ephemeral
> session partition* (`board-protocol-service.ts:144`); the main renderer can't fetch `board://`
> URLs. The renderer-side `<img>` must point at the file directly (absolute path), exactly like
> the favicon path.

### Why not store icons in editor state

`BoardEditorState` is **persisted** (session restore, `openFiles0.json`). Storing per-board icon
data URIs there would bloat the session file and scales with board count — the kind of per-item
state that must stay out of the host slot (see the HS1 sizing rule). Resolve icons through a
**module cache** instead (favicon pattern); the persisted state keeps only the board *names* it
already has.

## Design decisions

1. **Convention.** In the board folder root, look for `icon.svg`, then `icon.png`, then
   `icon.ico` — first found wins. (SVG first = crispest at every size; see open question Q1 if
   you'd rather match the order the user listed.)
2. **Rendering.** A shared `<BoardGlyph boardRoot size>` component: renders
   `<img src={iconPath} style={{ width, height, objectFit: "contain" }}>` when the cache has a
   path for that board root, else falls back to `<BoardIcon width={size} height={size}/>`. One
   component drives all three surfaces, so the fallback is uniform.
3. **Cache.** New `board-icon-cache.ts` mirroring `favicon-cache.ts`:
   `getBoardIconPathSync(boardRoot)`, async `resolveBoardIcon(boardRoot)` (probes the three
   filenames via `fs.fileExistsSync` / `fs.exists`), `invalidateBoardIcon(boardRoot)`, and a
   `useBoardIcons(boardRoots[])` hook returning a version bump. No persisted state.
4. **Tab reactivity.** The tab subscribes to a *fixed* slice of editor state
   (`PageTab.tsx:439` — `title`, `language`, `favicon`, …) — it does **not** observe
   `selectedBoard`, so `getIcon()` is not re-invoked when the open board changes. Add a generic
   optional `iconKey?: string` to the editor state base, include it in the `PageTab` selector,
   and have `BoardEditorModel` set `iconKey = selectedBoard ?? ""` in `selectBoard()`. `getIcon()`
   then returns `<BoardGlyph boardRoot={<selected board root>}/>` (or `<BoardIcon/>` on the list
   view). This is reusable by any future `noLanguage` editor whose icon depends on internal state,
   and leaves `title` semantics untouched (see Q2 for the alternative).

## Implementation plan

**1. Icon cache** — `src/renderer/editors/board/board-icon-cache.ts` (new).
   - `const cache = new Map<string, string>()` (boardRoot → absolute icon path; `""` = known miss).
   - `ICON_FILES = ["icon.svg", "icon.png", "icon.ico"]`.
   - `getBoardIconPathSync(boardRoot): string | null` — memory only.
   - `async resolveBoardIcon(boardRoot): Promise<string | null>` — for each `ICON_FILES` entry,
     `fpJoin(boardRoot, name)` + `fs.exists`; first hit cached + returned; else cache `""`.
   - `invalidateBoardIcon(boardRoot)` — `cache.delete(boardRoot)`.
   - `useBoardIcons(boardRoots: string[]): number` — effect resolves any uncached roots and bumps
     a version on success (mirror `useFavicons`).

**2. Shared component** — `src/renderer/editors/board/BoardGlyph.tsx` (new).
   - Props: `boardRoot?: string`, `size?: number` (default 16).
   - Uses `useBoardIcons([boardRoot])` for reactivity; reads `getBoardIconPathSync(boardRoot)`.
   - Renders `<img>` when a path exists, else `<BoardIcon width={size} height={size}/>`.

**3. Sidebar list** — `FileList` icon override + `BoardListSecondaryView`.
   - `FileList.tsx`: add `icon?: ReactNode` to `FileListItem`; in the icon trait
     (`FileList.tsx:97`) use `item.icon ?? (item.isFolder ? <FolderIcon/> : <FileIcon .../>)`.
   - `BoardListSecondaryView.tsx:36`: build each item with
     `icon: <BoardGlyph boardRoot={fpJoin(persephonePath, "boards", name)} />` (drop `isFolder`,
     or keep it — the explicit `icon` wins). This removes the 📁 fallback for boards.

**4. Main-editor tiles** — `BoardEditorView.tsx:191`: replace `<BoardIcon width={16} height={16}/>`
   with `<BoardGlyph boardRoot={fpJoin(s.persephonePath, "boards", name)} size={16} />`.

**5. Tab icon + reactivity** —
   - `EditorModel`/`EditorStateBase` (`editors/base/EditorModel.ts`): add optional
     `iconKey?: string` to the persisted state base (or a transient field — see Q3).
   - `PageTab.tsx:439`: add `iconKey: s.iconKey ?? ""` to the `useOptionalState` selector (and its
     default).
   - `BoardEditorModel.selectBoard()`: set `s.iconKey = name ?? ""`.
   - `BoardEditorModel.getIcon()`: when `selectedBoard` is set, return
     `<BoardGlyph boardRoot={fpJoin(persephonePath, "boards", selectedBoard)} />`; else
     `<BoardIcon/>`.

**6. Invalidate on change** — when the selected board's `DirectoryWatcher` fires
   (`BoardEditorModel.watchSelectedBoard`, already watching the folder for `ui.log`), also
   `invalidateBoardIcon(boardRoot)`; and in `refreshBoards()` invalidate the (re-enumerated)
   roots so a freshly added icon shows without an app restart. (Mid-session edits to a
   *non-selected* board's icon may need a refresh — acceptable, see Q4.)

**7. Sample icon for the demo** — add `assets/demo-board/icon.svg` (a simple, recognizable mark
   sized for 16px; can be derived from the `BoardIcon` glyph or a distinct demo motif). The
   scaffolder copies the whole `assets/demo-board/` folder verbatim (`board-scaffold.ts:24`), so a
   board created via "Create Demo board" gets `icon.svg` automatically and shows it everywhere —
   the end-to-end proof an agent sees.

**8. Document the convention** — add a one-line note to `assets/board-template/CLAUDE.md` (the
   authoring guide copied into every blank board), e.g.: *"Board icon (optional): put
   `icon.svg`, `icon.png`, or `icon.ico` in the board folder to set the board's icon (shown in
   the tab, the boards list, and the sidebar). First match wins; SVG preferred. Without one, a
   default glyph is used."* Keep it ticket-free (consumer-facing doc).

## Concerns / open questions

- **Q1 — lookup order — RESOLVED.** `svg → png → ico` (svg scales best). `ICON_FILES` in the
  plan is in this order.
- **Q2 — tab label — RESOLVED.** Keep the tab/panel **title** as the project name; swap only the
  *icon* per open board (via `iconKey`). Do **not** repoint `title` to the board name — the
  sidebar panel header (`BoardListSecondaryView` shows `title`) must keep showing the project.
- **Q3 — `iconKey` persisted vs transient.** Persisting it is harmless (re-derived on restore via
  `selectBoard`), but transient is cleaner. Either works; transient preferred.
- **Q4 — change detection — RESOLVED.** Adding/replacing an icon for the *currently open* board
  refreshes via its existing folder watcher; for boards only shown in the list, the icon appears
  after the next `refreshBoards()` (create/delete/open). **No full `boards/` tree watch** — the
  refresh points above are sufficient.
- **Q5 — project-level icon (out of scope).** The board-*list* view (no board selected) and the
  `.persephone` project node keep the `BoardIcon` glyph. A project-level `icon.*` is a separate
  idea; flag only.
- **Q6 — sample icon + doc — RESOLVED (in scope).** Ship a sample `assets/demo-board/icon.svg`
  so an agent building from the demo sees a working example; and add a one-line note to
  `assets/board-template/CLAUDE.md` documenting the convention (see plan steps 7–8). The blank
  `board-template/` stays icon-free (it relies on the `BoardIcon` fallback) — only the demo
  carries a sample.

## Acceptance criteria

- [x] Dropping `icon.svg` / `icon.png` / `icon.ico` in a board folder shows that image in the
      sidebar row, the main-editor tile, and the tab when the board is the main editor.
- [x] A board with no icon file shows the **`BoardIcon`** glyph in all three surfaces (the
      sidebar no longer shows the 📁 folder emoji for boards).
- [x] Icon resolution goes through a module cache — nothing icon-related is added to the
      persisted `BoardEditorState` (no session-file bloat).
- [x] Switching the open board updates the tab icon (reactivity verified via `iconKey`).
- [x] `tsc` + `eslint` clean; fallback glyph still re-tints with the theme.

Verified against 9 demo boards seeded with real library logos in mixed formats (SVG / PNG at
several sizes / ICO), one board left icon-free (fallback glyph), and one with both `icon.svg` +
`icon.png` (svg wins). User-confirmed in the running app.

## Files (planned)

| Path | Change |
|------|--------|
| `src/renderer/editors/board/board-icon-cache.ts` | new — module cache + async resolver + `useBoardIcons` hook |
| `src/renderer/editors/board/BoardGlyph.tsx` | new — `<img>`-or-`BoardIcon` shared component |
| `src/renderer/components/file-list/FileList.tsx` | `FileListItem.icon?` override honored by the icon trait |
| `src/renderer/editors/board/BoardListSecondaryView.tsx` | pass `icon: <BoardGlyph/>` per board row |
| `src/renderer/editors/board/BoardEditorView.tsx` | tile uses `<BoardGlyph/>`; board-list scroll layout fixed (see "Scroll fix" below) so the toolbar stays pinned and the list scrolls internally |
| `src/renderer/editors/board/BoardEditorModel.ts` | `getIcon` per selected board; set `iconKey` in `selectBoard`; invalidate cache on watch/refresh |
| `src/renderer/editors/base/EditorModel.ts` | optional `iconKey` on the editor state base |
| `src/renderer/ui/tabs/PageTab.tsx` | observe `iconKey` in the tab selector |
| `assets/demo-board/icon.svg` | new — sample icon; copied verbatim by the demo scaffolder (working example) |
| `assets/board-template/CLAUDE.md` | one-line note documenting the optional icon convention |

## Scroll fix (bundled, in-scope)

The Boards main-editor list previously scrolled the whole page, taking the "+ New board" toolbar
out of view. Fix: the list area is a bounded scroller under a pinned toolbar.

**Implementation note / Rule-7 exception:** `board-root` and `board-list-scroll` are authored as
plain `<div style={{…}}>` rather than `<Panel>`. In this app's runtime the `Panel` `overflow`
prop did **not** reach the DOM for these cached editor nodes (the editor's "survive navigation"
DOM is kept mounted and React would not re-commit the inline style), so the toolbar kept
scrolling. A plain element commits the style directly, and the element-type change forces React
to discard the frozen cached nodes and mount fresh. This is a deliberate, commented exception to
the "no inline `style` in app code" rule, scoped to these two layout containers; everything else
in the view stays `Panel`. Final styles: `board-root` `display:flex; flex-direction:column;
width:100%; height:100%; overflow:hidden`; `board-list-scroll` `display:flex;
flex-direction:column; flex:1 1 auto; min-height:0; overflow-y:auto` (+ `scroll-container` class
for the themed scrollbar). The inner `board-list` (`minHeight:100%` + `justify:center`) keeps a
short list centered and lets a long list scroll from the top. Live-verified: root clips
(`scrollHeight == clientHeight`), scroller scrolls (`overflowY: auto`).

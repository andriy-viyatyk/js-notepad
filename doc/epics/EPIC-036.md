# EPIC-036: Boards — Explorer-integrated switcher & in-board chrome

## Status

**Status:** ✅ Completed (2026-06-23) — all tasks (US-759, US-760, US-761, US-762, US-763, US-764 & US-766) implemented + epic-level review/document/userdoc done; moved to [`completed.md`](completed.md)
**Created:** 2026-06-22
**Follows:** [EPIC-034 — Web Board](EPIC-034.md) (board foundation, webview, `persephone.execute`) and [EPIC-035 — Boards Anywhere](EPIC-035.md) (manifest identity, per-board trust registry, `persephone-board://`, MCP/app lifecycle, sidebar boards tab)

> Design is **finalized** — all concerns C1–C8 resolved (2026-06-22). Nothing is implemented and no per-task docs are carved yet. Each task gets a full Goal → Background → Implementation Plan → Concerns → Acceptance doc **before** its implementation begins.

## The big idea

EPIC-034 hosted a board in a sandboxed webview; EPIC-035 made a board **portable** (any manifest-bearing folder), **trusted per board**, and **openable by link/MCP**. But the day-to-day way a user finds and switches between boards is still the **project Board editor** — opened by clicking a `.persephone` folder, with a board-list main view and a per-project side panel.

That model breaks down for someone working across many projects (e.g. a single client folder holding many project subfolders): per-project boards mean multiple `.persephone` folders, each opening its own Boards panel, with constant switching to find a board. There is no single, root-scoped place to see *all* boards and jump between them.

This epic **reorients Boards around the Explorer root** instead of around `.persephone`:

- The **board switcher becomes an Explorer-sibling sidebar panel** (exactly like Search is a sibling of the Explorer tree) — one panel, scoped to the current Explorer root, listing every trusted board under it as a fully-expanded tree.
- The **`.persephone` special-folder concept is removed entirely** — a board is any manifest-bearing folder (EPIC-035 already made that true); the only thing `.persephone` still did was open the project Board editor, which this epic replaces.
- An **open board gets real Persephone chrome** — a toolbar with Reload, Show-log, the full board path, and a click-to-switch boards popover — instead of rendering edge-to-edge with no app affordances.

The result: boards are organized by **where they live under your Explorer root**, switchable from one panel and from the board's own toolbar, with no `.persephone` ceremony.

## Goals

- **One root-scoped switcher.** A single "Boards" panel, a sibling of the Explorer tree (open via a `BoardIcon` on the Explorer header — mirrors the Search affordance), listing all trusted boards under the current Explorer root.
- **Tree, fully expanded.** Render boards as a tree of their containing subfolders down to each board folder; the board folder shows as a board item (its glyph + name); expanded by default.
- **No main Boards view.** Remove the project Board editor's main view (board list + create/delete). Board *management* (create) moves to the panel header; an *open* board takes the main view by itself.
- **Kill `.persephone` special-casing.** Remove `persephone-folder://`, the project mode of `BoardEditorModel`, the Explorer "Create .persephone project" / "Trust all boards" affordances, and the file-tree `.persephone` → board-view routing. Boards can be created in any folder.
- **In-board chrome.** Give the single-board view a Persephone toolbar: Reload + Show-log (today only on the side-panel header), the full board path, and — when an Explorer is on the same page — a path-click popover with the same boards tree for fast switching.
- **Better create flow.** A new "Create board" dialog with a folder picker (defaulting to the Explorer root), a name field, and a live computed target-location label, replacing today's name-only prompt (which assumed the fixed `.persephone/boards/` location).

## Tasks (build order)

Foundations first. Each gets a full doc before implementation; nothing below is carved yet.

| Task | Title | Depends on |
|------|-------|-----------|
| US-759 | **`BoardsTree` component — the single reusable boards view.** A shared, presentational tree of trusted boards, used **everywhere boards are listed**: the Explorer-sibling panel (US-761), the in-board toolbar popover (US-763), and the global Tools & Editors Boards tab (US-764). Two modes: **single-root** (given a `baseRoot` + board roots under it → renders the folder path down to each board relative to that root) and **multi-root** (given board roots with no common base → renders a forest grouped by containing folder, for the machine-wide global tab). Intermediate path segments are folder nodes; each **board folder** renders as a **board item** (`BoardGlyph` + name). **Compact folders** (VSCode-style): a folder whose only child is another folder is merged into a single joined-path node (`personal\boards`), recursively, stopping before a board leaf. **Fully expanded by default**, no lazy loading (the input is a known finite set of board paths, not a filesystem walk). Click → callback with the board root; optional trailing-action + context-menu slots so the global tab can keep its pin / Remove affordances. Pure component — no model coupling. | — |
| US-760 | **"Create board" dialog.** A new dialog with: a **folder input** + a "Browse…" button (`fs.showFolderDialog`); a **board-name input**; and a live **computed location label** ("Will be created at: `<folder>/<name>`"). When an Explorer root is available it initializes the folder input **and** the Browse dialog's `defaultPath` to that root; when none is available, both start uninitialized (empty input, no `defaultPath`). **Both inputs are required** — the "Create" button is disabled while either the folder or the name is empty; also warns on an existing target folder. Returns `{ folder, name }`. Two entry points (Create board / Create Demo board) select the template. | — |
| US-761 | **Boards as an Explorer-sibling panel.** Add a `boards` panel to `ExplorerEditor` (mirror the `search` panel exactly): a `BoardIcon` on the Explorer header calls `openBoards()`, which appends the panel id to `secondaryView` and expands it. **Also remove the redundant Explorer "Refresh" header button** — the Explorer already watches its root, so manual refresh is unnecessary (frees header space for the `BoardIcon`). The panel reads the trusted-boards registry (`boardTrust.useTrustedPaths()`) **filtered to roots under `ExplorerEditor.rootPath`** and renders them via `BoardsTree` (US-759, single-root mode). The **"+ New board" SplitButton moves to this panel's header** (Create board / Create Demo board → US-760 dialog → scaffold + open). Empty state (no boards under root): a message + **Create board** / **Create Demo board** buttons (the affordance that lives in today's empty main view). Clicking a board opens it via `persephone-board://` (single-board mode). | US-759, US-760 |
| US-762 | **Single-board-only `BoardEditorModel`; remove `.persephone` project mode.** Strip project mode: `initFromPersephone`, `boardsDir`, the board-list main view in `BoardEditorView`, `BoardListSecondaryView` + its registration, `createBoard`/`createDemoBoard`/`deleteBoard` on the model, project-mode `matchesNavigationTarget`/`beforeNavigateAway`/`onMainEditorChanged`/`setPage` panel-seeding. Remove the `persephone-folder://` scheme + its parser + `decodePersephoneFolderLink`, the `ExplorerSecondaryView` "Create .persephone project" / "Trust all boards in this project" context items, and `FileTreeProvider`'s `.persephone` → `board-view` routing. **Session restore ignores legacy project-mode state** (a persisted `BoardEditorState` with a `boardsDir`/no `boardRoot` is dropped, not restored). `BoardEditorModel` becomes **single-board only** (`boardRoot` always set). | US-761 |
| US-763 | **In-board toolbar (Reload, Show-log, path + boards popover).** Add a Persephone toolbar above `BoardWebview` in the single-board view: **Reload** (`reloadBoard`) and **Show log** (open `ui.log`, with the existing error dot) — moved from the now-removed side-panel header; the **full board path** as a label; clicking the path — **only when an `ExplorerEditor` is among `page.panelEditors`** — opens a popover hosting `BoardsTree` (US-759, single-root mode) scoped to that Explorer's root, so switching boards never leaves the board view. | US-759, US-762 |
| US-764 | **Retrofit the Tools & Editors Boards tab onto `BoardsTree`.** Replace `TrustedBoardsList`'s bespoke folder-grouped `ListBox` with `BoardsTree` (US-759, multi-root mode) so the global Tools & Editors *Boards* tab uses the same tree component as the Explorer panel and toolbar popover. Preserve its existing affordances via the component's trailing-action / context-menu slots: **pin / unpin** (`pinned-items.ts`) and **Remove ≡ untrust** (`boardTrust.untrust`). Open via `persephone-board://` as today. | US-759, US-766 |
| US-766 | **Trust registry — forbid nested boards (inherited trust, outer wins).** Make `boardTrust.isTrusted`/`useIsTrusted` **ancestor-aware** (a board is trusted if it or any ancestor folder is registered) and make `trust()` enforce "outer wins" (skip when an ancestor is already trusted; evict any already-trusted descendants). The registry then never holds an ancestor/descendant pair, so a board nested inside a trusted board is covered by inheritance — it opens with no prompt, is never stored, and never appears in `BoardsTree`. Foundation for the clean tree (US-759 / US-761 / US-764). | — |

## Idea-by-idea design notes

### 1. The board switcher = an Explorer-sibling panel (mirror Search)

Search is **not** a separate editor: `ExplorerEditor` declares `secondaryView = ["explorer", "search"]` and `SearchSecondaryView` is a second panel **backed by the same `ExplorerEditor` model** — it reads `model.rootPath`/`model.searchState`. `openSearch()`/`closeSearch()` add/remove the `"search"` id and call `page.expandPanel(...)`.

Boards mirrors this exactly:
- Register a new `boards` secondary-view (id `"boards"`, `BoardIcon`, label "Boards"), loading a new `BoardsSecondaryView` component **backed by `ExplorerEditor`**.
- Add `ExplorerEditor.openBoards()` / `closeBoards()` (set `secondaryView` to include/exclude `"boards"`, then `expandPanel`).
- Add a `BoardIcon` action button on the Explorer header (in `ExplorerSecondaryView`'s `actions`) → `model.openBoards()`.

Because the panel is backed by `ExplorerEditor`, it gets `rootPath` for free — the natural scope key for "boards under this root."

**Two hand-offs the panel author must get right (review-flagged):**
- **Opening a board must navigate the *current* page**, not spawn a new tab. Fire `openRawLink(encodePersephoneBoardLink(root), { pageId, sourceId: "explorer" })` with `pageId = model.page?.id` — exactly as the existing Explorer "Open Board" row button does. Without `pageId`, the open handler creates a new page instead of swapping the page's main editor. This is *the* mechanism by which a board picked in the panel becomes the page's main view.
- **Board creation routes through `createBoardFromTemplate` (or `app.boards`), not the model.** US-762 deletes `BoardEditorModel.createBoard`/`createDemoBoard`, and the panel is backed by `ExplorerEditor` anyway. So the "+ New board" flow calls the standalone `createBoardFromTemplate(name, folder, template)` (it scaffolds, guarantees the manifest, and **auto-trusts** — so the new board immediately appears in the registry-filtered panel), then opens the returned board root via the `persephone-board://` path above.

### 2. Boards are listed from the trust registry, filtered to the Explorer root

EPIC-035 established **trusted ≡ registered**: `board-trust.ts` (`trustedBoards.txt`) is the known-boards registry. The panel reads `boardTrust.useTrustedPaths()` and keeps those whose root is under `ExplorerEditor.rootPath` (normalized prefix match via `fpNormalizeForCompare`). No filesystem scan is needed for the list.

The existing global **TrustedBoardsList** sidebar tab (US-751, in Tools & Editors) lists *all* trusted boards grouped by folder, cross-root. Rather than keeping two different list implementations, it is **retrofitted onto the same `BoardsTree` component** (US-764) in multi-root mode — one tree-like boards view everywhere (C3).

### 3. The tree shape — one reusable component (US-759)

`BoardsTree` builds an in-memory tree from a finite set of board roots; it is **not** `FileTreeProvider` (that enumerates the whole filesystem lazily) but a lightweight presentational tree so the same component renders in a sidebar panel, a popover, *and* the global tab. Intermediate path segments become folder nodes; the **board folder itself** renders as a board item (`BoardGlyph` + folder name), not a plain folder. Fully expanded, no lazy children.

Two modes share one renderer:
- **Single-root** (`baseRoot` + boards under it) — the Explorer panel (US-761) and the toolbar popover (US-763). Paths are relativized to `baseRoot`, which is the tree's top.
- **Multi-root** (boards with no common base) — the global Tools & Editors tab (US-764). Boards are grouped under their containing folders as a forest. **Note:** today `TrustedBoardsList` groups *flat* by immediate parent (`fpDirname`); the retrofit (US-764) changes that to the same nested + compacted tree as the other consumers. That is an intentional visual change, not a pure swap — call it out when carving US-764.

**Compact folders (VSCode-style).** A folder node with **exactly one child that is itself a folder** is merged with that child into a single node, labelled with the joined path (`personal\boards`), applied recursively. The chain stops at the last folder before a **board leaf** — a board never merges into its folder. So a single-board chain like `personal/boards/<Board A>` renders as a `personal\boards` node containing the `<Board A>` item, while a branching folder (`examples` → `simple boards`, `other boards`) stays expanded and each leaf folder (`simple boards` → `<Board B>`) keeps its own node:

```
projects
  personal\boards            ← "personal" had only the single subfolder "boards" → collapsed
    <Board A>
  examples                   ← branches (two subfolders) → not collapsed
    simple boards
      <Board B>
    other boards
      <Board C>
```

Trailing-action and context-menu slots let consumers attach per-board affordances (the global tab's pin / Remove ≡ untrust) without the component knowing about them.

### 4. Removing `.persephone` (US-762)

`.persephone` currently does exactly one thing this epic keeps: it's the click target that opens the project Board editor (`FileTreeProvider` tags a `.persephone` folder with `target: "board-view"` + `persephone-folder://`). With the switcher moving to the Explorer panel, that entire path is dead:
- `persephone-folder://` scheme + parser + `decodePersephoneFolderLink` → removed.
- `BoardEditorModel` project mode (`boardsDir`, board list, sibling enumeration, `BoardListSecondaryView`) → removed; the model keeps only single-board mode.
- `ExplorerSecondaryView` "Create .persephone project" + "Trust all boards in this project" context items → removed.
- `FileTreeProvider` `.persephone` recognition/icon/routing → removed (a `.persephone` folder becomes an ordinary folder).

The Explorer **per-row "Open Board" button** on a `board-manifest.json` row (US-749) **stays** — it remains the way to open/trust a board discovered on disk that isn't in the registry yet.

**Full cleanup surface (review-verified — a per-task doc must cover all of these, not just the headline removals):**
- `register-editors.ts` — remove the `secondaryViewRegistry.register({ id: "board-list", … })` entry (id string `"board-list"`).
- `BoardEditorModel.ts` — also delete the now-orphaned project-mode helpers: `boardProjectTitle()`, the `boardsDir`/`boards` defaults in `getDefaultBoardEditorState()`, and `createBoard`/`createDemoBoard`/`deleteBoard`. With project branches gone, the `beforeNavigateAway` and `setPage` overrides become pure `super` pass-throughs → **delete the overrides entirely** (don't just strip the project branch); same for `onMainEditorChanged`.
- `index.tsx` (`newEditorModelFromState`) — this is the restore-drop site for C6: a persisted `BoardEditorState` with `boardsDir` set and **no** `boardRoot` is legacy project mode → return null / skip rather than `restore()`. (`restore()` today only early-returns when *both* are empty.)
- `ExplorerSecondaryView.tsx` — the `handleCreateProject` / `handleTrustAllBoards` `useCallback`s become dead with their context items; remove them and the now-unused `encodePersephoneFolderLink` import. **Keep** `encodePersephoneBoardLink` — `renderBoardButton` (the "Open Board" row button) still uses it.
- `mcp-handler.ts` — the page-info snapshot declares `boardsDir?: string` and reads `bs?.boardsDir` from the board's main-editor state; drop both (the field no longer exists).
- `app.d.ts` (source `.d.ts`, **not** the `assets/` build mirror) — the `openRawLink` doc comment lists `persephone-folder://` as a valid scheme; remove that mention.
- `.gitignore` — has a `.persephone/` entry. Decide explicitly: keep (harmless, but now silently ignores any user folder literally named `.persephone`) or drop. Default: leave it, note the decision.

**Docs migration is deferred to epic close-out** (not US-762): `docs/boards.md`, `assets/mcp-res-boards.md`, and `docs/api/app.md` all describe project mode / `.persephone/boards/` / `persephone-folder://` and are updated by `/document` + `/userdoc` when the epic closes (consistent with the epic deferred-review model).

### 5. In-board toolbar + path popover (US-763)

Today a selected board renders edge-to-edge (`BoardEditorView` returns just the `BoardWebview`), and Reload/Show-log live only on the side-panel header — which US-762 removes. So the toolbar both **re-homes** those actions and adds the path + switcher:
- The single-board view becomes a column: a `shrink={false}` toolbar row + the `BoardWebview` filling the rest.
- Toolbar: `BoardGlyph` + board name, full path label (click → popover), spacer, Reload, error dot + Show-log.
- The path popover renders `BoardsTree` scoped to the Explorer root. **The Explorer root is captured once at open and carried as link metadata, not looked up live** (US-763 design, user 2026-06-23): a new optional `ILinkData.explorerRoot` is set by the opener (Boards panel / in-board switcher / Explorer manifest row), flows into the board's persisted `state.sourceLink`, and the toolbar reads `sourceLink.explorerRoot` — exactly how every no-host editor carries its opening link. This **supersedes** the earlier "find the Explorer via `this.page?.panelEditors.find(e => e.editorId === "explorer")`" approach: the popover gate is now "opened *with* an `explorerRoot`?" rather than "is an Explorer on the page?". A board opened standalone (MCP / a bare `persephone-board://`) has no `explorerRoot` and shows a plain non-interactive path label. The `persephone-board://` URL stays a pure board identifier (the metadata never bakes into it, so a board link saved in a Link editor stays clean).

## Open questions / concerns — all resolved (user, 2026-06-22)

- **C1 — Panel backing model. ✅ resolved: back the Boards panel on `ExplorerEditor`, like Search.** A second `secondaryView` id (`"boards"`) on `ExplorerEditor`, not a new model — it inherits the Explorer root as its scope.
- **C2 — Board discovery source. ✅ resolved: trusted registry only, filtered to root.** The panel lists `boardTrust.useTrustedPaths()` filtered to roots under `ExplorerEditor.rootPath`. An on-disk board not yet in the registry does not appear until opened + trusted via the Explorer manifest-row "Open Board" button (kept). No disk scan for the list.
- **C3 — Fate of the global TrustedBoardsList tab. ✅ resolved: unify on one component.** Don't keep two implementations — make the boards tree a **single reusable component** (US-759) and apply it **everywhere**, including the global Tools & Editors *Boards* tab, which is retrofitted onto it (US-764, multi-root mode). The global tab keeps its pin / Remove affordances via the component's slots.
- **C4 — Does an open board survive navigation? ✅ resolved: no — keep as is.** Single-board mode stays a plain main editor; navigating the page away closes the board. Re-open from the Explorer panel or the toolbar popover.
- **C5 — Migration of this repo's existing `.persephone/boards` test boards. ✅ resolved: no action needed.** They are already trusted, so they appear in the new tree view with no issue. The `.persephone` folders become inert ordinary folders.
- **C6 — Persisted project-mode board editors. ✅ resolved: ignore legacy state on restore.** A session-restored `BoardEditorState` in project mode (has `boardsDir`, no `boardRoot`) is dropped, not restored (US-762).
- **C7 — Explorer header buttons. ✅ resolved: remove the redundant "Refresh" button.** The Explorer already watches its root, so manual refresh is unnecessary; removing it frees header space, and the `BoardIcon` takes its place beside Search (US-761).
- **C8 — "New board" target when no folder is open. ✅ resolved: don't initialize, and require both inputs.** When no Explorer root is available, the folder input starts empty and the Browse dialog gets no `defaultPath`. Both the folder and the name are **required** — the "Create" button is disabled until both are filled (US-760).

### 6. No nested boards — inherited trust (US-766)

A board is just a manifest-bearing folder, and the trust registry is a flat list of absolute
paths — nothing today stops a user from trusting both `D:\work\tools` and a board nested inside it
at `D:\work\tools\reports`. For the boards tree (US-759) that is both an awkward shape (a board
folder containing another board) and a `value`-uniqueness hazard for the UIKit `Tree` (the same
path acting as a board leaf *and* an intermediate folder).

Decision (2026-06-23): **nested boards are not supported.** The trust registry never holds an
ancestor/descendant pair, and trust is **hierarchical**:

- `isTrusted`/`useIsTrusted` are **ancestor-aware** — a board is trusted if it *or any ancestor
  folder* is registered. So a board inside a trusted board is **trusted-by-inheritance**: it opens
  with no prompt (no dead-end), is never separately stored, and never shows in `BoardsTree`.
- `trust()` enforces **outer wins** — trusting a board whose ancestor is already trusted is a
  no-op; trusting a board that contains already-trusted descendants adds the outer board and
  **evicts** those descendants.
- `untrust()` stays exact — removing a board removes only that entry; boards it covered by
  inheritance simply stop being trusted.

This is also a coherent security model: trust means "code under this folder may run with my
privileges," and a nested board is already inside that trusted subtree. Because the registry can
no longer hold a nested pair, `BoardsTree` never sees an ancestor/descendant collision — the
`dir:`/`board:` value prefixes (US-759) become defensive hygiene rather than load-bearing.

## Relationship to EPIC-034 / EPIC-035

- EPIC-034 built the webview host, `board://` protocol, `persephone.execute`, and the original project Board editor.
- EPIC-035 made boards portable (manifest identity), per-board trusted (`board-trust.ts`), openable by `persephone-board://` + MCP, and surfaced them in the Tools & Editors sidebar.
- **EPIC-036 retires the `.persephone`-centric project editor** that EPIC-034 introduced, replacing it with a root-scoped Explorer-sibling switcher and an in-board toolbar — building directly on EPIC-035's registry (`board-trust`), single-board mode, and `persephone-board://` link.

## Notes

### 2026-06-22 — epic opened in Planning
- Structured the user's redesign into five build-ordered tasks (US-759…US-763): a shared boards tree, a new create dialog, the Explorer-sibling switcher panel, removal of `.persephone` project mode, and the in-board toolbar.
- Key architectural decision drafted (C1): back the Boards panel on `ExplorerEditor` as a second `secondaryView` id, mirroring Search — so it inherits the Explorer root as its scope.
- Eight concerns (C1–C8) flagged for user review before any task is carved or implemented.

### 2026-06-22 — concerns resolved (user)
- **C1** ✅ back the Boards panel on `ExplorerEditor` (a second `secondaryView` id), like Search.
- **C2** ✅ list trusted/registered boards only, filtered to the Explorer root (no disk scan).
- **C3** ✅ **unify on one reusable boards-tree component** used everywhere; the global Tools & Editors *Boards* tab is retrofitted onto it → **added US-764**, and US-759's scope widened to a single-root + multi-root component with action slots.
- **C4** ✅ an open board does **not** survive navigation — stays a plain main editor.
- **C5** ✅ no migration needed — existing local boards are already trusted and will show in the tree.
- **C6** ✅ ignore legacy project-mode `BoardEditorState` on restore (US-762).
- **C7** ✅ remove the redundant Explorer "Refresh" header button; `BoardIcon` takes its place (US-761).
- **C8** ✅ Create dialog: don't initialize folder/Browse when no root is available; **both inputs required** (Create disabled until both filled) (US-760).
- Epic design finalized; ready to carve per-task docs starting with US-759.

### 2026-06-23 — nested-board policy (user) + US-759 / US-766 docs carved
- **US-759 doc carved** (`tasks/US-759-boards-tree/`): `BoardsTree` builds on the UIKit `Tree`
  primitive (which already provides `defaultExpandAll`, custom `renderItem`, a per-row `trailing`
  slot, and `getContextMenu`); a pure `boards-tree-build.ts` does the relativize → trie →
  VSCode-style single-child compaction → sort. Recommended home: `src/renderer/editors/board/`.
- **Nested-board policy decided:** nested boards are **not supported**; trust is hierarchical
  (**inherited trust**, outer wins) — see design note §6. This surfaced a blocker: the render gate
  uses exact-match `useIsTrusted`, so a pure no-op `trust()` for a nested board would loop the
  Trust button forever. Resolved by making `isTrusted`/`useIsTrusted` ancestor-aware.
- **US-766 added** (`tasks/US-766-trust-no-nested-boards/`): the `board-trust.ts` change carrying
  that policy — foundation for US-759/761/764.

### 2026-06-23 — US-762 doc carved
- **US-762 doc carved** (`tasks/US-762-single-board-only/`): the full project-mode removal, with
  exact touch points for all 11 files in §4 verified against source. Key design points resolved:
  `boards` state array removed (`refreshBoards` becomes a single-board validity check); the **C6
  legacy-state drop** is implemented by `restore()` **throwing** when `boardRoot` is absent — the
  `board-view` restore runs through `PagesPersistenceModel`'s generic `NO_HOST_EDITOR_IDS` branch
  whose `catch` returns `null`, dropping the editor; `index.tsx newEditorModelFromState` guards the
  legacy-module path independently. `.gitignore` `.persephone/` kept. Docs deferred to epic close-out.
- **US-762 implemented** (2026-06-23): project mode fully stripped across 11 files;
  `BoardListSecondaryView.tsx` + `persephone-folder-link.ts` deleted; `boardRootOf` removed
  (Option C — board folder is `boardRoot` directly); `.persephone` is now an ordinary folder.
  `tsc --noEmit` + `eslint` clean.

### 2026-06-23 — US-763 doc carved
- **US-763 doc carved** (`tasks/US-763-in-board-toolbar/`): re-homes the Reload / Show-log
  actions (deleted with the US-762 side-panel header) onto a new `BoardToolbar` above
  `BoardWebview`, plus the full board path → boards-switcher popover. Two-file change
  (new `BoardToolbar.tsx` + a wrap in `BoardEditorView.tsx`); **no model changes** —
  `reloadBoard`/`getSelectedBoardLogPath`/`logHasErrors` already exist. Open/filter pattern
  copied from `BoardsSecondaryView`; popover structure mirrors `RevisionPicker` (bounded-height
  `flex={1} height={0}` filler for the virtualized `BoardsTree`).
- **Design refined (user):** the switcher's Explorer root is now carried as **`ILinkData.explorerRoot`
  metadata** captured at open and read back from the board's persisted `state.sourceLink` — *not* a
  live `page.panelEditors` lookup. Rejected link-string encoding (a board link may be stored in a
  Link editor and must stay clean). This **supersedes §5's panelEditors gate** (note amended above);
  the popover now gates on "opened with an `explorerRoot`?". Adds an optional `explorerRoot` field to
  `ILinkData` (persisted, not ephemeral; ignored by `linkDataToLink`) — the only change outside the
  board's two files, plus the opener passing it.
- **Concerns:** C-763.1 (toolbar only on the trusted/rendered branch), C-763.2 (metadata-via-
  sourceLink), and C-763.3 (no active-board highlight — `BoardsTree` stays pure) **all resolved by
  user**; C-763.4 (standalone board → plain label) documented; C-763.5 (`Panel` ref/onClick vs. ghost
  `Button` anchor) verified — `Panel` forwards `ref`/`onClick`, `Text` has `truncate`/`hoverUnderline`,
  so the clickable path is a `Panel` anchor wrapping a `Text` (no ghost `Button` needed).
- **US-763 implemented** (2026-06-23): new `BoardToolbar.tsx` (glyph + name + path→switcher popover,
  Reload, error dot + Show-log) mounted above `BoardWebview` in the trusted branch of
  `BoardEditorView.tsx`; `ILinkData.explorerRoot` added (persisted, non-ephemeral); openers
  (`BoardsSecondaryView`, `ExplorerSecondaryView` manifest row) pass it. No model/lifecycle changes.
  `tsc --noEmit` + `eslint` clean.

### 2026-06-23 — US-764 doc carved
- **US-764 doc carved** (`tasks/US-764-tools-editors-boards-tree/`): the last EPIC-036 task — a
  **one-file** retrofit of `TrustedBoardsList.tsx` onto `BoardsTree` in **multi-root** mode
  (`ToolsEditorsPanel.tsx` untouched; it still renders `<TrustedBoardsList>`). `BoardsTree` already
  exposes every slot needed — `renderTrailing` (pin), `getBoardContextMenu` ("Remove"),
  `emptyMessage`, multi-root via omitting `baseRoot` — so the change is "delete the bespoke
  grouping/chrome, render `BoardsTree`."
- **Concerns:** C-764.1 (intentional flat→nested-tree visual change — proceed), C-764.3 (open in a
  **new page** with `explorerRoot = fpDirname(root)` — the board's **parent folder** — so its
  sibling boards are switchable from the in-board toolbar; user-requested 2026-06-23), C-764.4
  ("Remove" stays untrust-only, no folder delete — preserved), C-764.5 (no height wrapper needed —
  fills the tab body like the old `ListBox`) all resolved/non-blocking. **C-764.2 resolved (user, 2026-06-23):
  Option B** — `TreeItem`'s `trailing` slot renders unconditionally, so the old hover-revealed pin
  can't be reproduced from the consumer alone. Fix: `TreeItem` gains an opt-in
  `trailingVisibility?: "always" | "hover"` (default `"always"`, so FileTree/Mneme/Git trees that
  pass `trailing` are untouched) with hover-reveal + `focus-within` opacity rules; `BoardsTree`
  threads a `trailingVisible?(root)` predicate so pinned boards stay sticky and unpinned reveal on
  hover — preserving today's pin UX and making it reusable for any future tree row action.
- **US-764 implemented** (2026-06-23): `TrustedBoardsList.tsx` rewritten onto `BoardsTree`
  (multi-root) — bespoke folder-grouped `ListBox` chrome deleted; pin via `renderTrailing` +
  `trailingVisible` (pinned-sticky / hover-reveal), Remove via `getBoardContextMenu` (untrust-only),
  empty via `emptyMessage`; opens in a new page with `explorerRoot = fpDirname(root)` so siblings
  are switchable. `TreeItem` gained `trailingVisibility` (default `"always"` — existing trees
  unaffected); `BoardsTree` gained `trailingVisible`. `ToolsEditorsPanel.tsx` untouched.
  `tsc --noEmit` + `eslint` clean. **All EPIC-036 tasks now implemented; ready for epic-level review.**

### 2026-06-22 — consistency review (fresh agent, no context)
A separate reviewer verified every concrete code claim against the source. The architecture held up (Search-mirror pattern, `board-trust` registry, `persephone-board://` flow, `IPageHost.panelEditors`, `fs.showFolderDialog` all confirmed accurate). Findings folded in:
- **US-762 cleanup breadth widened** — the headline removals missed several touch points: the `"board-list"` registry entry, `boardProjectTitle()` + project-mode state defaults, the deletable `beforeNavigateAway`/`setPage`/`onMainEditorChanged` overrides, the C6 restore-drop site (`index.tsx newEditorModelFromState`), `ExplorerSecondaryView` dead handlers + the `encodePersephoneFolderLink` import, `mcp-handler.ts` `boardsDir`, the `app.d.ts` doc-comment scheme, and a `.gitignore` `.persephone/` decision. All now enumerated in §4.
- **US-761 hand-offs made explicit** — opening a board must pass `{ pageId }` (else it spawns a new tab instead of becoming the page main editor); board creation routes through `createBoardFromTemplate`/`app.boards` (the model methods are deleted by US-762).
- **US-764 grouping change flagged** — today's tab groups flat-by-parent; the retrofit changes it to the nested compacted tree (intentional, not a pure swap).
- **Docs migration** (`docs/boards.md`, `assets/mcp-res-boards.md`, `docs/api/app.md`) explicitly deferred to epic close-out `/document` + `/userdoc`.

### 2026-06-23 — epic completed (review + docs close-out)
- **Follow-on polish (post-US-764):** `BoardsTree` gained a hover-row highlight (wired `activeIndex`/`onActiveChange` to the UIKit `Tree`, matching the file tree), and `BoardToolbar` gained a **File Explorer** button (`page.toggleNavigator(null, boardRoot)` → opens the sidebar Explorer rooted at the board's parent folder; toggles an existing one).
- **`/review`** — epic-level review of all 7 tasks + the two polish changes came back **clean (no concerns)**; two non-blocking suggestions noted established precedent (unvoided `sendAsync` matches sibling panels; `boards-tree-build`'s local `process.platform` check is intentional/documented).
- **`/document`** — `overview.md` (Board Subsystem: Explorer-root default, Discovery & switching, inherited trust), `folder-structure.md` (added BoardToolbar/BoardsTree/boards-tree-build/BoardsSecondaryView; removed BoardListSecondaryView), root `CLAUDE.md` Key Files, and `assets/demo-board/index.html` updated; `mcp-res-boards.md` / `board-template/CLAUDE.md` verified current.
- **`/userdoc`** — `docs/boards.md` (rewritten workflow + in-board toolbar + inherited trust), `docs/editors.md` (Board editor), `docs/api/app.md` (`persephone-folder://` removed from `openRawLink`), `docs/whats-new.md` (4.0.7: switcher, toolbar, inherited trust + Breaking Changes for `.persephone` / `persephone-folder://`).
- All tasks marked `[x]`; epic block moved to `completed.md`; removed from the dashboard.

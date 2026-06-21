# US-746: Boards Anywhere

**Epic:** [EPIC-035 — Boards Anywhere](../../epics/EPIC-035.md)
**Depends on:** US-745 (board-manifest.json — board identity file) ✅ done
**Status:** Investigated — doc ready for review

## Goal

Decouple a Web Board from the `<project>/.persephone/boards/` location. After US-745 a board is *"any folder that carries a `board-manifest.json`"*, so `BoardEditorModel` must stop hardcoding `fpJoin(persephonePath, "boards", …)` and instead work against an arbitrary **board container directory**, plus gain the ability to open pointed at a **single board-root path** anywhere on disk. `.persephone/boards/` stays the default location for *creating* project boards — portability is purely additive. This is a refactor + capability task: it unblocks US-748 (open-by-link) and US-750 (MCP `openBoard(path)`); its own user-visible surface is mostly regression-safety.

## Background

Today every path in the board subsystem is reconstructed as `fpJoin(persephonePath, "boards", <name>)`. The model stores the `.persephone` **project** path (`persephonePath`) and a list of board **folder names**; the absolute board root is never stored — it's recomputed on the fly at ~9 sites. The editor is a *per-project* navigation singleton, opened only by clicking a `.persephone` folder (which encodes a `persephone-folder://` link).

### Key facts from investigation

**`src/renderer/editors/board/BoardEditorModel.ts`** — the anchor of all the coupling.

- **State (`BoardEditorState`, lines 18–41):** `persephonePath: string` (the `.persephone` folder; doubles as the US-721 trust key), `title`, `boards: string[]` (folder **names** under `<persephonePath>/boards`), `selectedBoard?: string` (a folder **name**, not a path), `reloadToken`, `logHasErrors`, `secondaryView?`.
- **`boardProjectTitle(persephonePath)` (lines 44–48):** pops the `.persephone` segment to derive the project display name.
- **`getDefaultBoardEditorState()` (lines 50–62):** `persephonePath: ""`, `boards: []`, `selectedBoard: undefined`, `reloadToken: 0`.
- **`refreshBoards()` (lines 197–223):** computes `boardsDir = fpJoin(persephonePath, "boards")`, lists subdirs, keeps only those where `isBoardFolder()` (manifest present — US-745), sorts by name, invalidates each board's icon, and clears `selectedBoard` if it's gone.
- **`initFromPersephone(persephonePath)` (lines 168–175):** the fresh-open entry point — sets `persephonePath` + `title` (via `boardProjectTitle`), then `refreshBoards()`.
- **`restore()` (lines 179–185):** session-restore entry — re-loads trust, `refreshBoards()`, re-attaches `watchSelectedBoard(state.selectedBoard)`.
- **`matchesNavigationTarget()` (lines 154–159):** singleton guard — decodes the incoming link and compares its `persephonePath` (normalized) to `this.state.get().persephonePath`.
- **`selectBoard(name)` (lines 226–234):** sets `selectedBoard` + `iconKey`, then `watchSelectedBoard(name)`. Boards are identified **by name only**.
- **`createFromTemplate(name, template)` (lines 306–328, private):** `dir = fpJoin(persephonePath, "boards", name)`; collision check; `scaffoldBoard(dir, template)` (fallback `fs.mkdir(dir)` on copy failure); `ensureBoardManifest(dir)`; `refreshBoards()`; `selectBoard(name)`.
- **`createBoard(name)` / `createDemoBoard(name)` (lines 295–302):** thin wrappers over `createFromTemplate`.
- **`deleteBoard(name)` (line 332):** `fpJoin(persephonePath, "boards", name)`.
- **`getIcon()` (line 120), `getSelectedBoardLogPath()` (line 247), `watchSelectedBoard()` (line 263):** all reconstruct `fpJoin(persephonePath, "boards", <name>)`.

**The `fpJoin(persephonePath, "boards", …)` blast radius** (every site that must change):

| File | Line | Site |
|------|------|------|
| `BoardEditorModel.ts` | 120 | `getIcon()` |
| `BoardEditorModel.ts` | 198 | `refreshBoards()` — the container |
| `BoardEditorModel.ts` | 247 | `getSelectedBoardLogPath()` |
| `BoardEditorModel.ts` | 263 | `watchSelectedBoard()` |
| `BoardEditorModel.ts` | 307 | `createFromTemplate()` |
| `BoardEditorModel.ts` | 332 | `deleteBoard()` |
| `BoardEditorView.tsx` | 101 | `<BoardWebview boardRoot=…>` |
| `BoardEditorView.tsx` | 210 | `<BoardGlyph boardRoot=…>` (tile list) |
| `BoardListSecondaryView.tsx` | 45 | `<BoardGlyph boardRoot=…>` (side panel) |

**`.persephone`-specific assumptions** beyond the `"boards"` literal: the field name `persephonePath`; `boardProjectTitle()` popping `.persephone`; `matchesNavigationTarget()` keying on `persephonePath`; `mcp-handler.ts` (lines 43, 178) exposing `persephonePath` in the board-page MCP response; `persephone-folder-link.ts` payload `{ persephonePath }`; `FileTreeProvider.ts` / `ExplorerSecondaryView.tsx` detecting `.persephone` by name and encoding the link.

**`index.tsx` factory** — `newEditorModel(filePath?)` (lines 38–45): `filePath` is the `persephone-folder://` link string; it's `decodePersephoneFolderLink`'d and fed to `initFromPersephone`. `newEditorModelFromState(state)` (lines 53–64): spreads persisted `BoardEditorState` into defaults, then `model.restore()`. Routing: the parser sets `data.target = "board-view"`, the pipeline resolves the `board-view` module, and `data.url` (the link) arrives as `filePath`.

**`persephone-folder://` parser** (`src/renderer/content/parsers.ts`, lines 119–126): on a matching `openRawLink`, sets `data.url = data.href`, `data.target ??= "board-view"`, fires `openLink`. **Parser-only — no Layer-2 resolver** (this is the model US-748 mirrors).

**`board-scaffold.ts`** — `scaffoldBoard(destDir, template = "board-template")`: copies `<appRoot>/assets/<template>/` into `destDir` + the shared `board-base.css`. Already takes a **bare destination dir** with no `.persephone`/`"boards"` knowledge — **no change needed**.

**`BoardWebview.tsx`** — props `{ model, boardRoot }`; `boardRoot` feeds `api.registerBoardProtocol(partition, boardRoot, …)` and the `ui.log` append. **No change** — it already takes a plain board root.

**`well-known-pages.ts`** — the board view is **not** a well-known page (it's a per-instance navigation singleton). No change.

**Path utils** (`src/renderer/core/utils/file-path.ts`): `fpBasename`, `fpDirname`, `fpJoin`, `fpNormalizeForCompare` all exist — everything the generalization needs.

## Recommended design

Generalize the model's anchor from the `.persephone` **project path** to a **board container directory**, and add a **single-board mode** for opening one board by its own path. The two unify cleanly: every path stays `fpJoin(boardsDir, name)`; the only difference is whether `refreshBoards()` enumerates siblings or pins the one board.

### State change

Replace `persephonePath` with two **mutually-exclusive** anchors — a **container** (project/list mode) and a **board root** (single-board mode). There is no flag: `boardRoot` being set *is* the discriminator. An individual board carries no container and no awareness of siblings.

```ts
export interface BoardEditorState extends EditorStateBase {
    type: "boardPage";
    editor: "board-view";
    /** Project/grouping mode ONLY: absolute path of the directory that CONTAINS
     *  board folders — `<project>/.persephone/boards`. Empty in single-board mode. */
    boardsDir: string;
    /** Single-board mode ONLY: the board's OWN absolute root path. Undefined in
     *  project mode. When set, the editor renders exactly this board, never
     *  enumerates siblings, and has no knowledge of any other board.
     *  `boardRoot` set ⟺ single-board mode (the discriminator). */
    boardRoot?: string;
    title: string;
    boards: string[];
    selectedBoard?: string;
    reloadToken: number;
    logHasErrors: boolean;
    secondaryView?: string[];
}
```

`getDefaultBoardEditorState()`: `boardsDir: ""`, `boardRoot: undefined`.

A single mode-aware helper resolves the absolute root of any board, so exactly one method knows the difference:

```ts
/** Absolute root of a board by its list name, mode-aware. In single-board mode
 *  the name is the board's own basename and the root is `boardRoot`. */
boardRootOf(name: string): string {
    const s = this.state.get();
    return s.boardRoot ?? fpJoin(s.boardsDir, name);
}

/** Root of the board currently rendered, or undefined when the list view shows
 *  no selection. */
private currentBoardRoot(): string | undefined {
    const sel = this.state.get().selectedBoard;
    return sel ? this.boardRootOf(sel) : undefined;
}
```

### Two open entry points on the model

```ts
/** Project / grouping mode — opened from a `.persephone` folder click. */
initFromPersephone(persephonePath: string): void {
    const boardsDir = fpJoin(persephonePath, "boards");
    this.state.update((s) => {
        s.boardsDir = boardsDir;
        s.boardRoot = undefined;
        s.title = boardProjectTitle(persephonePath);
    });
    void this.refreshBoards();
}

/** Single-board mode — opened by board-root path (wired by US-748 / US-750).
 *  The board is standalone: no container, no sibling enumeration. */
initFromBoardRoot(boardRoot: string): void {
    const name = fpBasename(boardRoot);
    this.state.update((s) => {
        s.boardsDir = "";
        s.boardRoot = boardRoot;
        s.selectedBoard = name;
        s.title = name;
    });
    void this.refreshBoards();
}
```

`initFromBoardRoot` is the new capability US-746 delivers. It has **no caller in this task** — US-748's `persephone-board://` parser/factory and US-750's MCP tool call it. US-746 ships and tests it as a model method. (`fpDirname` is not needed — single-board mode stores the root directly, never a parent container.)

### `refreshBoards()` — branch on mode

```ts
async refreshBoards(): Promise<void> {
    const { boardsDir, boardRoot } = this.state.get();
    let boards: string[] = [];
    try {
        if (boardRoot) {
            // Single-board mode: the board knows only itself, never its siblings.
            if (await isBoardFolder(boardRoot)) boards = [fpBasename(boardRoot)];
        } else if (await fs.exists(boardsDir)) {
            const entries = await fs.listDirWithTypes(boardsDir);
            const dirs = entries.filter((e) => e.isDirectory).map((e) => e.name);
            const isBoard = await Promise.all(dirs.map((n) => isBoardFolder(fpJoin(boardsDir, n))));
            boards = dirs.filter((_, i) => isBoard[i]).sort((a, b) => a.localeCompare(b));
        }
    } catch {
        boards = [];
    }
    for (const name of boards) invalidateBoardIcon(this.boardRootOf(name));
    this.state.update((s) => {
        s.boards = boards;
        if (s.selectedBoard && !boards.includes(s.selectedBoard)) s.selectedBoard = undefined;
    });
}
```

### Board creation — an editor-independent API function

Board creation is lifted out of the editor into a standalone **API-level function** with a **required** `dir` (the container folder that will hold the new board). The list editor becomes just one caller — it passes its own `boardsDir`. This is what guarantees that **creating a board elsewhere never touches the `.persephone` list editor** (no refresh, no notify, no stale selection): the editor only refreshes when *it* is the caller and the board lands in its own container.

**1. The API function** (editor-independent; recommended home: `board-scaffold.ts`). Creates the folder, scaffolds, writes the manifest, returns the board root. Touches no editor state. `dir` is required:

```ts
/** Create a board named `name` inside container `dir`, from `template`. The
 *  canonical board-creation API: the project list editor calls it with its own
 *  boards folder; US-750 exposes it on the `app` object model + MCP for any
 *  user-chosen `dir`. Returns the created board's absolute root. */
export async function createBoardFromTemplate(name: string, dir: string, template: string): Promise<string> {
    const boardRoot = fpJoin(dir, name);
    if (await fs.exists(boardRoot)) throw new Error(`A board named "${name}" already exists in "${dir}".`);
    try {
        await scaffoldBoard(boardRoot, template);
    } catch (err) {
        await fs.mkdir(boardRoot);
        ui.notify(`Board created, but the template could not be copied: ${err instanceof Error ? err.message : String(err)}`, "warning");
    }
    await ensureBoardManifest(boardRoot);
    return boardRoot;
}
```

**2. The list editor is just a caller** — its "add board" buttons pass the editor's own `boardsDir` (project mode), then refresh/select its own list:

```ts
async createBoard(name: string): Promise<void> {
    await createBoardFromTemplate(name, this.state.get().boardsDir, "board-template");
    await this.refreshBoards();   // THIS editor's own container only
    this.selectBoard(name);
}
async createDemoBoard(name: string): Promise<void> {
    await createBoardFromTemplate(name, this.state.get().boardsDir, "demo-board");
    await this.refreshBoards();
    this.selectBoard(name);
}
```

(The former private `createFromTemplate` method is removed — its logic moves into `createBoardFromTemplate`.)

**US-750** (agent/app-API flow) calls `createBoardFromTemplate(name, userDir, template)` directly, then opens the result standalone via `initFromBoardRoot(returnedRoot)`. The `.persephone` list editor is never involved or notified — the only shared code is the pure API function, which carries no editor state. This removes the re-anchoring/refresh coupling entirely (former C746-5).

**US-746 / US-750 boundary:** US-746 delivers `createBoardFromTemplate` as a reusable function and rewires the list editor to consume it. **Binding it onto the `app` object-model surface + the MCP tool is US-750** (that's US-750's whole scope) — US-746 just makes the function exist and be editor-independent.

**No open editor required.** Because `createBoardFromTemplate` carries no editor state, an agent can call it over MCP (US-750) **at any time, with no board list editor open** — it just writes files to disk and returns a root. The companion `openBoard(path)` (US-750) then opens a *new* single-board editor via `initFromBoardRoot(path)`, which also needs no pre-existing editor. The `.persephone` list editor is purely a UI affordance, never a precondition for create/open.

### Singleton matching

`matchesNavigationTarget()` keys on the project path today. Generalize so a board opened by path doesn't false-match a project editor sharing the parent dir:
- project-mode incoming link → compare `boardsDir`;
- single-board incoming link (US-748) → compare the full `boardRoot`.

US-746 keeps the existing `persephone-folder://` comparison working (compare `fpJoin(decoded.persephonePath, "boards")` to `boardsDir`). The `persephone-board://` branch is added in US-748.

### Single-board mode has no sidebar (lifecycle)

A board opened by `persephone-board://` (US-748) / `openBoard` (US-750) shows **alone on the page — no sidebar panels**. The current editor is **Pattern B**: `setPage()` registers a `"board-list"` side panel and a set of overrides make it survive navigation *as* that panel (the project board-switcher). All of that is a `.persephone`-project concern; single-board mode must behave like a **plain page editor** instead. Gate each Pattern-B behavior on `!boardRoot` (project mode):

- **`setPage(page)`** — register the `"board-list"` panel **only in project mode**:
  ```ts
  setPage(page: IPageHost | null): void {
      super.setPage(page);
      if (page && !this.state.get().boardRoot && !this.secondaryView?.length) {
          this.secondaryView = ["board-list"];   // project mode only
      }
  }
  ```
- **`beforeNavigateAway()`** — the no-op (survive-unconditionally) is the panel-survival hook; in single-board mode there is no panel, so fall through to the base behaviour (plain editor) when `boardRoot` is set.
- **`onMainEditorChanged()`** — the "demote to panel + drop selection" logic is project-mode only; skip it when `boardRoot` is set (a single board has nothing to demote to).
- **`requestClose()`** — project mode detaches the secondary view; single-board mode closes like a normal editor.

Net: when `boardRoot` is set, the editor contributes no `secondaryView`, doesn't survive navigation as a panel, and renders only the webview (`selectedBoard` is pre-set by `initFromBoardRoot`, so `BoardEditorView` already shows the board, not the tile list).

### Mechanical replacements

Replace every `fpJoin(persephonePath, "boards", <name>)` / `fpJoin(persephonePath, "boards")` from the blast-radius table with the mode-aware accessor or `boardsDir`:
- Per-board paths (`getIcon` 120, `getSelectedBoardLogPath` 247, `watchSelectedBoard` 263, `deleteBoard` 332) → `this.boardRootOf(name)` / `this.currentBoardRoot()`.
- The container scan (`refreshBoards` 198) → `boardsDir` (project branch only).
- Views: `BoardEditorView.tsx` line 101 (selected webview) → `model.boardRootOf(s.selectedBoard)`; line 210 (tile list, project mode) → `model.boardRootOf(name)`; `BoardListSecondaryView.tsx` line 45 → `model.boardRootOf(name)`. Both views subscribe `boardsDir`/`boardRoot` instead of `persephonePath`.

## Implementation plan

1. **`BoardEditorModel.ts` — state:** rename `persephonePath` → `boardsDir`, add `boardRoot?: string` (the single-board discriminator); update doc comments (drop the "trust key" note — trust moves per-board in US-747); update `getDefaultBoardEditorState()` (`boardsDir: ""`, `boardRoot: undefined`).
2. **`BoardEditorModel.ts` — add the `boardRootOf(name)` + `currentBoardRoot()` helpers** per the snippet (the single source of mode-aware path resolution). Import `fpBasename`.
3. **`BoardEditorModel.ts` — `boardProjectTitle`:** keep as-is (still used by `initFromPersephone`).
4. **`BoardEditorModel.ts` — `initFromPersephone`:** set `boardsDir = fpJoin(persephonePath, "boards")`, `boardRoot = undefined`. (Keeps the existing `projectTrust.load()` call — per-board trust is US-747.)
5. **`BoardEditorModel.ts` — add `initFromBoardRoot(boardRoot)`** (single-board mode) per the snippet. No trust load (US-747 adds per-board trust).
6. **`BoardEditorModel.ts` — `refreshBoards()`:** branch on `boardRoot` per the snippet; icon-invalidation uses `this.boardRootOf(name)`.
7. **`BoardEditorModel.ts` — Pattern-B lifecycle gating** (the no-sidebar requirement): gate `setPage` panel registration, `beforeNavigateAway`, `onMainEditorChanged`, and `requestClose` on `!boardRoot` per *Single-board mode has no sidebar*.
8. **`board-scaffold.ts` — add `createBoardFromTemplate(name, dir, template)`** (editor-independent API function, **required** `dir`) per the snippet. **`BoardEditorModel.ts` — remove the private `createFromTemplate`;** rewrite `createBoard` / `createDemoBoard` to call `createBoardFromTemplate(name, this.state.get().boardsDir, …)` then `refreshBoards` + `selectBoard`. (Creating elsewhere is US-750 via `createBoardFromTemplate` + `initFromBoardRoot` — it never touches the list editor. Binding the function onto `app`/MCP is US-750.)
9. **`BoardEditorModel.ts` — replace** the remaining per-board path sites (`getIcon` 120, `getSelectedBoardLogPath` 247, `watchSelectedBoard` 263, `deleteBoard` 332) with `this.boardRootOf(name)` / `this.currentBoardRoot()`.
10. **`BoardEditorModel.ts` — `matchesNavigationTarget`:** project-mode compares the decoded `persephone-folder://` path's `fpJoin(persephonePath, "boards")` to `boardsDir`; leave a clear seam (return false for single-board state) for the `persephone-board://` comparison US-748 adds.
11. **`BoardEditorModel.ts` — `restore()`:** logic unchanged — it reads `boardsDir`/`boardRoot` from the spread state and calls `refreshBoards()` + `watchSelectedBoard` (both now mode-aware). Guard becomes "return early if neither `boardsDir` nor `boardRoot` is set."
12. **`BoardEditorView.tsx`:** subscribe `boardsDir`/`boardRoot`; line 101 → `model.boardRootOf(s.selectedBoard)`, line 210 → `model.boardRootOf(name)`.
13. **`BoardListSecondaryView.tsx`:** subscribe `boardsDir`/`boardRoot`; line 45 → `model.boardRootOf(name)`.
14. **`mcp-handler.ts` (lines 43, 178):** board-page response field. Recommended: expose `boardsDir` + `boardRoot` (and keep `selectedBoard`). (No backward-compat constraint — boards unreleased.)
15. **Verify** `tsc --noEmit` + ESLint on touched files. Confirm the 11 local `.persephone` boards still list and open (regression).
16. **No change:** `BoardWebview.tsx`, `well-known-pages.ts`, `persephone-folder-link.ts` (stays `{ persephonePath }` — the new `persephone-board://` payload is US-748), `index.tsx` factory (the `persephone-board://` decode is US-748).

## Concerns / open questions

- **C746-1 — Field rename `persephonePath` → `boardsDir`. ✅ decided (user, 2026-06-21): rename; no backward-compat.** Done as designed above — `persephonePath` is replaced by `boardsDir` across state, MCP board-page response (`mcp-handler.ts`), state restore, and `matchesNavigationTarget`. US-747 then keys trust off the board root, not `boardsDir`.
- **C746-2 — Sibling enumeration semantics. ✅ decided (user, 2026-06-21): an individual board is ALWAYS single.** A board opened by its own path is standalone — it stores `boardRoot` (no container), enumerates nothing, and has no knowledge of any other board. Grouping is exclusively the `.persephone` list editor's concern (it has its own list view). **Additional decision (user, 2026-06-21):** a board opened via `persephone-board://` shows **with no sidebar panels** — just the single board on the page. Implemented by gating all Pattern-B behaviour (the `"board-list"` panel registration + navigation-survival overrides) on project mode (`!boardRoot`); see *Single-board mode has no sidebar (lifecycle)* above.
- **C746-3 — Title in single-board mode. ✅ decided (user, 2026-06-21): the board folder name** (`fpBasename(boardRoot)`). Project mode keeps the project name.
- **C746-4 — US-746 ↔ US-748 boundary. ✅ decided (user, 2026-06-21): acceptable for a foundation task.** US-746 delivers the model capability (`initFromBoardRoot`, generalized state, mode-aware `refreshBoards`, no-sidebar lifecycle). It does **not** add the `persephone-board://` scheme, parser, or factory wiring — those are US-748. So `initFromBoardRoot` has **no production caller** when US-746 lands; acceptance leans on regression + a direct/manual invocation of the new method.
- **C746-5 — board creation as an editor-independent API function. ✅ decided (user, 2026-06-21).** The original re-anchoring worry is dissolved by design: board creation is **lifted out of the editor** into a standalone API function `createBoardFromTemplate(name, dir, template)` with a **required** `dir`. The `.persephone` list editor is just one caller (passing its own `boardsDir` from the "add board" buttons) and only ever refreshes its own container; creating a board elsewhere never touches it. An agent can call the function over MCP (US-750) **at any time with no board editor open**. Binding it onto `app`/MCP is US-750; US-746 delivers the function + the list-editor rewrite. See *Board creation — an editor-independent API function*.

## Acceptance criteria

- `BoardEditorState` uses `boardsDir` + `boardRoot?`; no remaining `fpJoin(persephonePath, "boards", …)` anywhere in the board subsystem.
- Existing `.persephone` projects open exactly as before: the 11 local boards list (with the side panel), select, render, live-reload, log-indicator, create, and delete all work (full regression).
- `initFromBoardRoot(boardRoot)` puts the model in single-board mode: `boards === [basename]` (when the manifest is present), `selectedBoard` set, title = board name, the webview serves that exact root, and **no `secondaryView` is contributed** (the board shows alone on the page, no sidebar) — verified by a direct invocation (no `.persephone` involved).
- `createBoard(name)` / `createDemoBoard(name)` still create into the editor's own container and refresh/select the list — unchanged behavior. The new `createBoardFromTemplate(name, dir, template)` API function creates a board (with `board-manifest.json`) under any `dir` and touches no editor state — verified by a direct call against a temp dir outside `.persephone`, **with no board editor open**.
- `tsc --noEmit` exit 0; ESLint clean on touched files.

## Files changed (planned)

| File | Change |
|------|--------|
| `src/renderer/editors/board/BoardEditorModel.ts` | State (`boardsDir` + `boardRoot?`), `boardRootOf`/`currentBoardRoot` helpers, `initFromPersephone`, new `initFromBoardRoot`, mode-aware `refreshBoards`, Pattern-B lifecycle gating (no-sidebar single mode), remove private `createFromTemplate` + rewrite `createBoard`/`createDemoBoard` to call the API function, `matchesNavigationTarget`, all per-board path replacements |
| `src/renderer/editors/board/board-scaffold.ts` | Add editor-independent `createBoardFromTemplate(name, dir, template)` (required `dir`; returns board root) |
| `src/renderer/editors/board/BoardEditorView.tsx` | Subscribe `boardsDir`/`boardRoot`; both roots via `model.boardRootOf(...)` |
| `src/renderer/editors/board/BoardListSecondaryView.tsx` | Subscribe `boardsDir`/`boardRoot`; `BoardGlyph` root via `model.boardRootOf(name)` |
| `src/renderer/api/mcp-handler.ts` | Board-page response field (`persephonePath` → `boardsDir` / derived) |
| **No change** | `BoardWebview.tsx`, `well-known-pages.ts`, `persephone-folder-link.ts`, `index.tsx` factory |

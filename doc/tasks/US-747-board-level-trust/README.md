# US-747: Trust at Board Level

**Epic:** [EPIC-035 — Boards Anywhere](../../epics/EPIC-035.md)
**Depends on:** US-745 (board-manifest.json) ✅ done · US-746 (boards anywhere — `boardRoot` identity) ✅ done
**Status:** Investigated — doc ready for review

## Goal

Move the Web Board trust gate from the **`.persephone` project** to the **individual board**. After US-746 a board has its own absolute root (`boardRootOf(name)` / `boardRoot`), so trust can be keyed per board instead of per project. A new path-keyed **trusted-boards registry** (`board-trust.ts` + `trustedBoards.txt`) replaces the project registry; the render/execute gate fires when a *board is opened*, not when a project is; boards Persephone creates are **auto-trusted at creation** (C5); and the old per-project gate becomes a **"Trust all boards in this project"** bulk convenience (C4). Trust is **never** sourced from the manifest or any in-board file (C2, hard constraint).

## Background

### Current (per-project) trust — what exists today

**`src/renderer/api/project-trust.ts`** — the whole trust subsystem. A `ProjectTrust` singleton wrapping a reactive `TGlobalState<{ paths: string[] }>`:
- `load()` — `fs.prepareDataFile("trustedProjects.txt", "")` → `fs.getDataFile` → split lines into `paths`.
- `isTrusted(path)` / `useIsTrusted(path)` (reactive hook) — membership via `fpNormalizeForCompare` (case/separator-insensitive, Windows-safe).
- `trust(path)` — re-`load()` (avoid clobbering a concurrent write), append if absent, `fs.saveDataFile`.
- Stored at `<userData>/persephone/data/trustedProjects.txt`, one absolute path per line, original case. Intentionally **not** on the `app` object model or any script `.d.ts` (a script must never self-trust).

**Consumers of `projectTrust` (the full blast radius — grep `projectTrust`):**

| File | Use |
|------|-----|
| `src/renderer/editors/board/BoardEditorView.tsx` | The gate: `projectPath = fpDirname(s.boardsDir)`; `trusted = projectTrust.useIsTrusted(projectPath)`; `if (!s.boardRoot && !trusted) return <UntrustedProjectView …>` (lines 8, 13, 38–52). Single-board mode (`boardRoot` set) currently renders **ungated** — the gap this task closes. |
| `src/renderer/editors/board/BoardEditorModel.ts` | `projectTrust.load()` in `initFromPersephone` (line 205) and `restore()` (line 228). Import line 9. (`initFromBoardRoot` does **no** trust load today — line 212.) |
| `src/renderer/editors/explorer/ExplorerSecondaryView.tsx` | `handleCreateProject` auto-trusts a freshly-created `.persephone` project: `projectTrust.trust(persephonePath)` (lines 11, 78). |

**UI surfaces:**
- `src/renderer/ui/dialogs/TrustProjectDialog.tsx` — `showTrustProjectDialog(projectPath): Promise<boolean>`; RCE-wording confirm dialog ("Trust this project? … run programs on your computer …"). **Only caller is `BoardEditorView`.**
- `src/renderer/editors/board/UntrustedProjectView.tsx` — the in-editor placeholder ("Boards are not supported in untrusted projects" + "Trust project" button). **Only used by `BoardEditorView`.**

So **everything that touches `projectTrust` is board-related** — there is no non-board consumer to preserve.

### What US-746 already established (the seam this task uses)

- `boardRootOf(name)` resolves a board's absolute root mode-aware (project: `<boardsDir>/<name>`; single: `boardRoot`).
- Single-board mode (`boardRoot` set) renders the webview alone, no sidebar — and currently **with no trust gate** (a foreign board opened by a future `persephone-board://` link would run ungated). US-747 must gate it.
- `createBoardFromTemplate(name, dir, template)` in `board-scaffold.ts` is the **single, editor-independent** create path used by the list editor today and US-750's MCP tool tomorrow — the one place to hook auto-trust (C5).
- `BoardEditorView` renders `<BoardWebview boardRoot={model.boardRootOf(s.selectedBoard)}>` in the `if (s.selectedBoard)` branch (lines 100–110) — the exact point where a board's web content + `execute()` come alive, i.e. where the gate belongs.

### `fs` data-file helpers (confirmed present)

`src/renderer/api/fs.ts`: `prepareDataFile(name, default)` (516), `getDataFile(name)` (516), `saveDataFile(name, content)` (519) — exactly what `board-trust.ts` clones.

### Manifest (C2 boundary)

`board-manifest.ts` `BoardManifest` carries **only** descriptive metadata (name/description/author/repository) — no trust field, by design. Trust is read/written **only** from the app-side registry, never the manifest. US-747 must not add a trust field anywhere in-board.

## Recommended design

Per-board trust with the gate at the point a board is **rendered**, not at the project. One new registry module, a renamed dialog + placeholder with board wording, auto-trust folded into the existing create API, and the project gate demoted to an Explorer bulk action.

### 1. New module `src/renderer/api/board-trust.ts` (retire `project-trust.ts`)

A near-verbatim clone of `project-trust.ts`, re-keyed to board roots, plus an `untrust()` (the registry owner ships it; US-751's "Remove board" calls it):

```ts
/**
 * Per-board trust gate (EPIC-035). A Web Board's UI is web content and
 * `persephone.execute()` is arbitrary RCE, so a board does not render or run
 * until the user has trusted it. Trust is per board (its absolute root folder),
 * persisted across sessions in a line-delimited list of absolute paths at
 * `<userData>/persephone/data/trustedBoards.txt`.
 *
 * Trust is NEVER read from the board's manifest or any in-board file — a portable
 * board must not be able to self-trust (EPIC-035 C2). It is always a user action
 * (the trust dialog / the "Trust all boards in this project" bulk action) or a
 * provenance write Persephone makes for a board it created itself (auto-trust on
 * create, C5). Intentionally NOT exposed on the `app` object model or any script
 * `.d.ts` — a script must never silently self-trust.
 */
import { TGlobalState } from "../core/state/state";
import { fpNormalizeForCompare } from "../core/utils/file-path";
import { fs } from "./fs";

const trustedBoardsFileName = "trustedBoards.txt";

interface BoardTrustState { paths: string[]; } // absolute board-root paths, original case

class BoardTrust {
    private readonly state = new TGlobalState<BoardTrustState>({ paths: [] });

    async load(): Promise<void> {
        await fs.prepareDataFile(trustedBoardsFileName, "");
        const data = await fs.getDataFile(trustedBoardsFileName);
        const paths = (data ?? "").split("\n").map((p) => p.trim()).filter((p) => p);
        this.state.update((s) => { s.paths = paths; });
    }

    isTrusted(boardRoot: string): boolean {
        const key = fpNormalizeForCompare(boardRoot);
        return this.state.get().paths.some((p) => fpNormalizeForCompare(p) === key);
    }

    useIsTrusted(boardRoot: string): boolean {
        const key = fpNormalizeForCompare(boardRoot);
        return this.state.use((s) => s.paths.some((p) => fpNormalizeForCompare(p) === key));
    }

    /** Append a board to the trusted list (idempotent). Caller confirms first
     *  (dialog) OR it is a provenance write for a Persephone-created board (C5). */
    async trust(boardRoot: string): Promise<void> {
        await this.load(); // re-read so we don't clobber a concurrent write
        if (this.isTrusted(boardRoot)) return;
        const paths = [...this.state.get().paths, boardRoot];
        this.state.update((s) => { s.paths = paths; });
        await fs.saveDataFile(trustedBoardsFileName, paths.join("\n"));
    }

    /** Remove a board from the trusted list (idempotent). Used by US-751's
     *  "Remove board ≡ untrust" sidebar action. */
    async untrust(boardRoot: string): Promise<void> {
        await this.load();
        const key = fpNormalizeForCompare(boardRoot);
        const paths = this.state.get().paths.filter((p) => fpNormalizeForCompare(p) !== key);
        this.state.update((s) => { s.paths = paths; });
        await fs.saveDataFile(trustedBoardsFileName, paths.join("\n"));
    }
}

export const boardTrust = new BoardTrust();
```

**Retire `project-trust.ts`** — delete the file (no consumer remains after this task). The orphaned `trustedProjects.txt` on disk is harmless and left as-is (boards are unreleased; the only existing projects are this repo's test boards — no migration needed). See C747-1.

### 2. The gate moves from "wraps the editor" to "wraps the opened board"

The project board **list** (folder names + create/delete) runs no board code, so it renders ungated. The gate fires only when a board's webview is about to mount — which is also exactly where single-board mode (`persephone-board://`, US-748) needs it.

**`BoardEditorView.tsx`** — replace the project-trust gate (lines 38–52) and the selected-board branch (100–110):

```tsx
// (top of component, with the other state)
const selectedRoot = s.selectedBoard ? model.boardRootOf(s.selectedBoard) : undefined;
// Hook must run unconditionally — pass "" when nothing is selected (never trusted).
const boardTrusted = boardTrust.useIsTrusted(selectedRoot ?? "");

// …handleCreate / handleCreateDemo / handleDelete unchanged…

if (s.selectedBoard) {
    if (!boardTrusted && selectedRoot) {
        return (
            <UntrustedBoardView
                path={selectedRoot}
                onTrust={async () => {
                    if (await showTrustBoardDialog(selectedRoot)) {
                        await boardTrust.trust(selectedRoot);
                    }
                }}
            />
        );
    }
    return (
        <Panel name="board-webview-wrap" direction="column" flex={1} width="100%">
            <BoardWebview key={`${s.selectedBoard}__${s.reloadToken}`} model={model} boardRoot={selectedRoot} />
        </Panel>
    );
}
// …project-mode list view (toolbar + tiles) renders unconditionally (no gate)…
```

Remove the old `projectPath`/`projectTrust`/`UntrustedProjectView` block and the now-unused `fpDirname` import. The list view below is untouched.

Net behavior:
- **Project mode, board you created in Persephone** → auto-trusted at creation (§4) → opens with no prompt.
- **Project mode, foreign/legacy board** (e.g. the 11 pre-US-747 local boards, or a board copied in) → list shows it; clicking it shows the per-board trust prompt; trust once → opens.
- **Single-board mode** (`boardRoot` set, `selectedBoard` pre-set by `initFromBoardRoot`) → always hits the per-board gate → a foreign board opened by link/MCP is gated. ✅ closes the US-746 gap.

### 3. `BoardEditorModel.ts` — load board trust on every open path

- Import: `projectTrust` → `boardTrust`.
- `initFromPersephone` (line 205): `void boardTrust.load();`
- `initFromBoardRoot` (line 212): **add** `void boardTrust.load();` (it loads no trust today — single-board mode now needs it for the gate).
- `restore()` (line 228): `void boardTrust.load();`

No other model changes — `boardRootOf` (US-746) already gives the gate its key.

### 4. Auto-trust on create (C5) — one hook in the create API

Fold the registry write into `createBoardFromTemplate` (`board-scaffold.ts`), so **every** Persephone-created board — the list editor's "New board"/"Create Demo board" *and* US-750's MCP tool — is trusted at creation, in one place, by provenance (not a manifest field — C2-safe):

```ts
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
    await boardTrust.trust(boardRoot);   // C5: Persephone-created ⇒ auto-trusted
    return boardRoot;
}
```

(Add `import { boardTrust } from "../../api/board-trust";` to `board-scaffold.ts`.) The list editor's `createBoard`/`createDemoBoard` need no change — they already route through this function.

### 5. Dialog + placeholder → board wording

- **Rename** `TrustProjectDialog.tsx` → `TrustBoardDialog.tsx`; export `showTrustBoardDialog(boardRoot): Promise<boolean>`; prop `boardPath`; title "Trust this board?"; body "Trusting this board lets it run programs on your computer with your full user privileges — including reading and changing your files and using any signed-in command-line tools (cloud CLIs, git, etc.)." / "Only trust boards you created or fully understand." / `{boardPath}`; primary button "Trust Board".
- **Rename** `UntrustedProjectView.tsx` → `UntrustedBoardView.tsx`; heading "This board is not trusted"; body board-scoped; button "Trust board". Same `{ path, onTrust }` props.

Update the imports in `BoardEditorView.tsx` (`showTrustProjectDialog`→`showTrustBoardDialog`, `UntrustedProjectView`→`UntrustedBoardView`).

### 6. Project gate → "Trust all boards in this project" bulk action (C4)

**`ExplorerSecondaryView.tsx`:**

(a) **Drop the create-time auto-trust.** In `handleCreateProject`, remove the `await projectTrust.trust(persephonePath)` line (and the `projectTrust` import). A freshly-created empty `.persephone` has **no boards** to trust; boards added later via "New board" are auto-trusted at creation (§4).

(b) **Add the bulk action** to the context menu, shown when the clicked node **is** a `.persephone` folder (`fpBasename(item.href) === ".persephone"`):

```tsx
const handleTrustAllBoards = useCallback(async (persephonePath: string) => {
    const boardsDir = fpJoin(persephonePath, "boards");
    let names: string[] = [];
    try {
        if (await fs.exists(boardsDir)) {
            const entries = await fs.listDirWithTypes(boardsDir);
            const dirs = entries.filter((e) => e.isDirectory).map((e) => e.name);
            const isBoard = await Promise.all(dirs.map((n) => isBoardFolder(fpJoin(boardsDir, n))));
            names = dirs.filter((_, i) => isBoard[i]);
        }
    } catch { /* leave names empty */ }
    if (!names.length) { ui.notify("No boards found in this project.", "info"); return; }
    if (!(await showConfirmationDialog({
        title: "Trust all boards in this project?",
        message: `Trust all ${names.length} board(s) in "${fpBasename(fpDirname(persephonePath))}"? Each will be able to run programs on your computer with your full user privileges. Only do this for a project you created or fully understand.`,
        buttons: ["Trust All", "Cancel"],
    }))) return;
    for (const n of names) await boardTrust.trust(fpJoin(boardsDir, n));
}, []);
```

Add the menu item next to "Create .persephone project", gated on `.persephone`:

```tsx
if (fpBasename(item.href).toLowerCase() === ".persephone") {
    event.items.push({
        label: "Trust all boards in this project",
        icon: <BoardIcon width={14} height={14} />,
        onClick: () => void handleTrustAllBoards(item.href),
    });
}
```

Per C4 this confers **nothing** on boards added later — it trusts only the boards present *now*; a board copied in afterward is untrusted and prompts on open.

(New imports in `ExplorerSecondaryView.tsx`: `boardTrust`, `isBoardFolder` from `../board/board-manifest`, `showConfirmationDialog`. `showConfirmationDialog` matches the buttons-array form already used in `BoardEditorView`.)

## Implementation plan

1. **Create `src/renderer/api/board-trust.ts`** — the `boardTrust` singleton with `load`/`isTrusted`/`useIsTrusted`/`trust`/`untrust` per §1.
2. **Delete `src/renderer/api/project-trust.ts`** (no consumer remains — verify with a final `projectTrust` grep returning only docs).
3. **`board-scaffold.ts`** — import `boardTrust`; add `await boardTrust.trust(boardRoot);` after `ensureBoardManifest` in `createBoardFromTemplate` (§4).
4. **`BoardEditorModel.ts`** — swap `projectTrust` → `boardTrust`; `initFromPersephone` + `restore()` call `boardTrust.load()`; **add** `void boardTrust.load();` to `initFromBoardRoot` (§3).
5. **Rename `TrustProjectDialog.tsx` → `TrustBoardDialog.tsx`** — `showTrustBoardDialog(boardRoot)`, board wording (§5).
6. **Rename `UntrustedProjectView.tsx` → `UntrustedBoardView.tsx`** — board wording (§5).
7. **`BoardEditorView.tsx`** — replace the project gate with the per-board gate at the `selectedBoard` branch (§2); update imports (`showTrustBoardDialog`, `UntrustedBoardView`, `boardTrust`); drop `projectTrust`, `UntrustedProjectView`, `showTrustProjectDialog`, and the now-unused `fpDirname`.
8. **`ExplorerSecondaryView.tsx`** — drop the create-time `projectTrust.trust` + import (§6a); add `handleTrustAllBoards` + the `.persephone`-gated menu item + imports (§6b).
9. **Verify** `tsc --noEmit` exit 0 + ESLint clean on touched files. Regression: open a `.persephone` project → board list shows ungated; opening a **pre-US-747** board prompts the per-board trust dialog; trusting opens it; **creating** a new board (blank + demo) opens with **no** prompt (auto-trusted); delete works; "Trust all boards in this project" trusts every current board (no prompt on subsequent opens). Restart → trusted boards stay trusted (registry persisted).
10. **No change:** `BoardWebview.tsx`, `board-manifest.ts`, `BoardListSecondaryView.tsx` (it lists names; rendering/execution gating is in the main view), `well-known-pages.ts`, `persephone-folder-link.ts`, `index.tsx`, `mcp-handler.ts`.

## Concerns / open questions

- **C747-1 — Retire `project-trust.ts`, or keep it? ✅ decided (user, 2026-06-21): retire it.** Delete the module (leave `trustedProjects.txt` orphaned on disk — harmless, unreleased) and replace with `board-trust.ts` (`trustedBoards.txt`). Every `projectTrust` consumer is board code that this task rewrites, so nothing else breaks. No thin re-export shim.
- **C747-2 — The project board *list* renders ungated. ✅ decided (user, 2026-06-21): accepted.** In the per-board model the board switcher / tile list (folder names, create, delete) shows *without* any trust; the RCE gate fires only when a board is **opened** (webview + `execute`). This differs from today, where an untrusted project shows nothing but the trust prompt. It is safe — enumerating/creating/deleting folders runs no board code, and delete stays user-initiated + confirmed (same authority as deleting via Explorer). The per-board file watchers attached on selection observe the filesystem only; they execute no board code.
- **C747-3 — Auto-trust lives in `createBoardFromTemplate` (C5). ✅ decided (user, 2026-06-21): single-hook placement.** One `await boardTrust.trust(boardRoot)` inside `createBoardFromTemplate` covers the list editor and US-750's MCP create. Provenance-based, not a manifest field (C2-safe). No per-caller trust.
- **C747-4 — "Trust all boards in this project" placement + dropping create-time project auto-trust. ✅ decided (user, 2026-06-21).** (a) The bulk action is an Explorer context-menu item on a **`.persephone` folder node** (sibling of "Create .persephone project"); it trusts only the boards present now (C4 — no standing grant). (b) Creating an empty `.persephone` no longer auto-trusts anything (nothing to trust yet). (c) The bulk action shows a confirm dialog. **Trust by provenance, restated by the user:** creating a new empty `.persephone` trusts nothing; boards created *in it* through Persephone (by user **or** agent) are auto-trusted at creation (C747-3); a board folder copied in via Windows Explorer is **untrusted** and shows the trust dialog on open.
- **C747-5 — Rename the dialog + placeholder to board wording. ✅ decided (user, 2026-06-21): rename for consistency.** `TrustProjectDialog`→`TrustBoardDialog`, `UntrustedProjectView`→`UntrustedBoardView` (only `BoardEditorView` consumes them). The bulk action reuses the generic `showConfirmationDialog` rather than a bespoke project dialog.
- **C747-6 — Ship `untrust()` now (used by US-751). ✅ decided (user, 2026-06-21): include now.** `untrust()` belongs with the registry module created here, so it ships in `board-trust.ts` now (trivial, no caller yet in this task); US-751's "Remove board ≡ untrust" calls it.
- **C747-7 — The 11 existing local test boards aren't in the registry. ✅ acknowledged (user, 2026-06-21): no backfill — user will re-trust them.** They predate US-747, so they prompt the per-board trust dialog on first open (or can be trusted in one shot via the new bulk action). No migration/backfill — boards are unreleased and these are this repo's own test boards.

## Acceptance criteria

- A new `boardTrust` registry (`src/renderer/api/board-trust.ts`, `trustedBoards.txt` in `<userData>/persephone/data/`) is the **only** trust source; `project-trust.ts` is gone; no `projectTrust` reference remains in code (docs aside). No trust field exists in the manifest or any in-board file (C2).
- Opening a **trusted** board renders its webview; opening an **untrusted** board (project or single-board mode) shows the per-board "Trust board" placeholder + dialog, and trusting it renders the board. The project board *list* renders without a trust gate.
- A board created via `createBoard` / `createDemoBoard` (and, later, US-750's MCP tool — same `createBoardFromTemplate` path) is **auto-trusted at creation** — it opens with no prompt (C5).
- "Trust all boards in this project" on a `.persephone` Explorer node trusts every manifest-bearing board currently under `<project>/.persephone/boards` (after a confirm), and confers nothing on boards added later (C4). Creating a new empty `.persephone` no longer auto-trusts.
- Trust persists across restart; `tsc --noEmit` exit 0; ESLint clean on touched files.

## Files changed (planned)

| File | Change |
|------|--------|
| `src/renderer/api/board-trust.ts` | **New** — `boardTrust` registry (`load`/`isTrusted`/`useIsTrusted`/`trust`/`untrust`, `trustedBoards.txt`) |
| `src/renderer/api/project-trust.ts` | **Deleted** — replaced by `board-trust.ts` (no remaining consumer) |
| `src/renderer/editors/board/board-scaffold.ts` | `createBoardFromTemplate` auto-trusts the new board (C5) |
| `src/renderer/editors/board/BoardEditorModel.ts` | `projectTrust`→`boardTrust`; load trust in `initFromPersephone` / `initFromBoardRoot` / `restore` |
| `src/renderer/ui/dialogs/TrustProjectDialog.tsx` → `TrustBoardDialog.tsx` | Rename + board wording; `showTrustBoardDialog(boardRoot)` |
| `src/renderer/editors/board/UntrustedProjectView.tsx` → `UntrustedBoardView.tsx` | Rename + board wording |
| `src/renderer/editors/board/BoardEditorView.tsx` | Per-board gate at the `selectedBoard` branch; updated imports; drop `fpDirname`/`projectTrust` |
| `src/renderer/editors/explorer/ExplorerSecondaryView.tsx` | Drop create-time project auto-trust; add "Trust all boards in this project" bulk action on the `.persephone` node |
| **No change** | `BoardWebview.tsx`, `board-manifest.ts`, `BoardListSecondaryView.tsx`, `well-known-pages.ts`, `persephone-folder-link.ts`, `index.tsx`, `mcp-handler.ts` |

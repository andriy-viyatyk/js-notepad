# US-869: Agent API — catalog operations (searchPublished / downloadPublished / installPublished / getPublishedVersions / uninstallBoard / checkPublishedUpdates)

**Epic:** [EPIC-045 — Published Boards Catalog](../../epics/EPIC-045.md)
**Depends on:** US-862 (catalog service + renderer model), US-863 (install engine + registry),
US-864 (Board Info editor, install mode), US-865 (update detection + swap), US-867 (properties
mode + versions). All landed. This is the second-to-last epic task; only US-870 (hub page)
remains after it.

## Goal

Expose the full published-boards lifecycle to agents via `app.boards` (reached through
`execute_script`) so an agent can drive "find me a drawio viewer and install it" end-to-end with
**at most one user click per privilege-granting step** — keeping the epic's security invariant
(*the API requests, the user's dialog click grants*). Document the flow — including a
board-review checklist — in the agent-facing guide.

## Background

### What already exists (reuse, don't rebuild)

| Capability | Where | Notes |
|---|---|---|
| Cached catalog + compat check | `src/renderer/api/published-boards.ts` | `load()`, `refresh()`, `getCatalog()`, `useCatalog()`, `catalogBoardsForFile()`, `getVersions(id)`, `isCompatible(minAppVersion)` |
| Install registry | `src/renderer/api/board-install-registry.ts` | `load()`, `record()`, `remove(id)`, `getById(id)`, `getByRoot(root)`, `listInstalled()` |
| Headless download+verify+extract+record | `src/renderer/api/board-install.ts` → `downloadBoard(entry, targetParentDir, installId?)` | Trusts nothing; installs into `<dir>/<id>`; returns root. Records `entry.version`. |
| Version swap (update/rollback) | `board-install.ts` → `installVersion(id, archive, version, opts?)` | In-place temp-extract + folder swap; updates the registry to the installed version |
| Preconditioned swap + toasts | `src/renderer/api/board-updates.ts` → `runBoardVersionInstall({root,id,name,archive,version})`, `ensureBoardIdle(root)`, `getBoardUpdate(root)`, `useBoardUpdates()` | `runBoardVersionInstall` = ensure-idle (close-pages dialog) → progress → swap → toast; returns `boolean` |
| Trust / untrust / pin | `src/renderer/api/board-trust.ts` (`isTrusted`, `trust`, `untrust`, `load`), `src/renderer/ui/sidebar/pinned-items.ts` (`removePin`) | `boardTrust` is **not** on `app` — only reached via the register flow |
| Board Info editor (install + properties) | `src/renderer/editors/board-info/BoardInfoEditorModel.ts` | Host-capable holder; `register()` shows the trust dialog then trusts; standalone `register()` flips to properties mode. `download()`, `installBoardVersion()`, `uninstall()`, `unregister()` |
| Board Info opener (existing page) | `src/renderer/editors/board-info/open-board-info.ts` → `openBoardInfo(page, {catalogId?, boardRoot?})` | Replaces a page's main editor, host-preserving |
| Register trust dialog | `src/renderer/ui/dialogs/TrustBoardDialog.tsx` → `showTrustBoardDialog(root)` | Used by `registerBoard` (US-868) and the Board Info Register button |
| Delete-confirm wording (canonical) | `BoardInfoEditorModel.uninstall()` + `BoardsSecondaryView.tsx:184` | `"Delete board"` / `Delete board "<name>"? This permanently removes its folder and all its files.` |
| Existing agent lifecycle API | `src/renderer/api/boards.ts` (`registerBoard`/`unregisterBoard`/`renameBoard`, US-868) | New methods slot in beside these |
| New-page host | `app.pages.addPage(editor)` → returns the new `PageModel` | `installPublished` opens a standalone Board Info page this way |
| Types | `src/ipc/api-param-types.ts` (`PublishedBoardInfo`, `PublishedBoardArchive`, `PublishedBoardVersion`, `PublishedBoardVersions`) | `.d.ts` files may import from `../../ipc/api-param-types` (precedent: `downloads.d.ts`) |

### What is missing (this task)

- `app.boards.searchPublished`, `getPublishedVersions`, `downloadPublished`, `installPublished`,
  `uninstallBoard`, `checkPublishedUpdates` — none exist on `boards.ts` / `IBoards`.
- A **sync "list all updates"** (only per-root `getBoardUpdate` + the reactive `useBoardUpdates`
  hook exist — a hook can't be called from a script call).
- A **shared uninstall helper** — `BoardInfoEditorModel.uninstall()` inlines confirm + idle +
  delete + untrust + unpin + registry-remove; the agent path needs the same without a page.
- A **completion signal** on the Board Info editor so `installPublished` can resolve when the
  user finishes (or abandons) the interactive Download → Register flow.
- Agent-guide section documenting discover → download → **review** → register → update/rollback →
  uninstall, with the consent expectations.

## Implementation plan

### Step 1 — Script-facing result types (`src/renderer/api/types/boards.d.ts`)

Add self-contained result interfaces (friendlier for script-author IntelliSense than re-exporting
ipc types; import the source ipc types for the archive/version shapes, per the `downloads.d.ts`
precedent):

```ts
import type { PublishedBoardVersion } from "../../../ipc/api-param-types";
```

- `PublishedBoardResult` — one catalog board annotated with install state:
  ```ts
  interface PublishedBoardResult {
      id: string;
      name: string;
      description?: string;
      version: string;              // latest catalog version
      fileMasks?: string[];
      editorName?: string;
      editorKind?: "simple" | "content-host";
      standalone?: boolean;
      minAppVersion?: string;
      size: number;                 // archive.size, bytes
      compatible: boolean;          // minAppVersion vs running app
      installed: boolean;           // has an install-registry entry
      installedRoot?: string;
      installedVersion?: string;
      updateAvailable: boolean;     // compatible newer catalog version than installed
  }
  ```
- `PublishedVersionResult` — one entry of the version history, annotated:
  ```ts
  interface PublishedVersionResult {
      version: string;
      date?: string;
      notes?: string;
      minAppVersion?: string;
      compatible: boolean;          // minAppVersion vs running app
      installed: boolean;           // this exact version is the installed one
  }
  ```
- `BoardUpdateInfo` — one available update:
  ```ts
  interface BoardUpdateInfo {
      id: string;
      root: string;
      installedVersion: string;
      latestVersion: string;
  }
  ```

Add the six methods to `IBoards` (full JSDoc, stating dialogs + cancel returns):

```ts
searchPublished(query?: string): Promise<PublishedBoardResult[]>;
getPublishedVersions(id: string): Promise<PublishedVersionResult[]>;
downloadPublished(id: string, opts?: { dir?: string; version?: string }): Promise<string>;
installPublished(id: string, opts?: { dir?: string; version?: string }): Promise<string | undefined>;
uninstallBoard(id: string): Promise<boolean>;
checkPublishedUpdates(force?: boolean): Promise<BoardUpdateInfo[]>;
```

Keep the file's existing `PublishedBoardVersion` import unused-safe (only import what's referenced).

### Step 2 — Sync "list all updates" (`src/renderer/api/board-updates.ts`)

Add a non-reactive counterpart to `useBoardUpdates` (the hook can't run in a script call):

```ts
/** All available updates (sync, non-reactive) — the script-call counterpart of
 *  `useBoardUpdates`. Requires the catalog + registry already loaded (callers await load()). */
export function listBoardUpdates(): BoardUpdate[] {
    return boardInstallRegistry
        .listInstalled()
        .map((e) => getBoardUpdate(e.root))
        .filter((u): u is BoardUpdate => !!u);
}
```

`getBoardUpdate` already encapsulates the catalog-lookup + compat + `compareVersions(inst, cat)`
rule — reuse it verbatim so the two surfaces can't drift.

### Step 3 — Shared uninstall helper (`src/renderer/api/board-install.ts`)

Extract the confirm + idle + delete + untrust + unpin + registry-remove core so both the Board
Info model and `app.boards.uninstallBoard` share one implementation:

```ts
/** Uninstall a catalog-installed board: confirm → ensure idle → delete folder → untrust →
 *  unpin → registry remove. Returns whether it was removed (false = cancelled/failed/busy).
 *  Does NOT touch any page — callers that host the board handle page unload themselves. */
export async function uninstallCatalogBoard(args: {
    root: string;
    name: string;
    catalogId?: string;
}): Promise<boolean> {
    const { showConfirmationDialog } = await import("../ui/dialogs/ConfirmationDialog");
    const choice = await showConfirmationDialog({
        title: "Delete board",
        message: `Delete board "${args.name}"? This permanently removes its folder and all its files.`,
        buttons: ["Delete", "Cancel"],
    });
    if (choice !== "Delete") return false;

    const { ensureBoardIdle } = await import("./board-updates");
    if (!(await ensureBoardIdle(args.root))) return false;

    try {
        await fs.removeDir(args.root, true);
    } catch (err) {
        const { ui } = await import("./ui");
        ui.notify((err as Error).message || "Failed to delete the board folder.", "error");
        return false;
    }
    await boardTrust.untrust(args.root);
    const { removePin } = await import("../ui/sidebar/pinned-items");
    removePin({ kind: "board", root: args.root });
    if (args.catalogId) await boardInstallRegistry.remove(args.catalogId);
    return true;
}
```

Add the imports it needs to `board-install.ts` (`boardTrust` from `./board-trust`). Note
`board-install.ts` already imports `fs` and `boardInstallRegistry`.

Refactor `BoardInfoEditorModel.uninstall()` to delegate:

```ts
async uninstall(): Promise<void> {
    const props = this.state.get().props;
    if (!props) return;
    const { uninstallCatalogBoard } = await import("../../api/board-install");
    const removed = await uninstallCatalogBoard({
        root: props.root, name: props.name, catalogId: props.catalogId,
    });
    if (removed) await this.pageModel?.setMainEditor(null);
}
```

(The model's `unregister()` — local-board untrust-only path — is unchanged.)

### Step 4 — Completion signal on the Board Info editor (`BoardInfoEditorModel.ts`)

`installPublished`'s interactive path must resolve when the user completes registration. Add a
`Subscription` fired from `register()` on success (both branches — file-host switch and
standalone properties flip), carrying the installed root:

- Import: `import { Subscription } from "../../core/state/events";`
- Field: `readonly installed = new Subscription<string>();`
- In `register()`, immediately after `await boardTrust.trust(root);` (before the branch), add:
  `this.installed.send(root);`

This is additive and does not change existing behavior.

### Step 5 — The six `app.boards` methods (`src/renderer/api/boards.ts`)

Add to the `boards` object, following the existing dynamic-import style. Shared preamble helper
(module-private) to load catalog + registry and resolve a catalog entry:

```ts
async function ensureCatalog(): Promise<void> {
    const { publishedBoards } = await import("./published-boards");
    const { boardInstallRegistry } = await import("./board-install-registry");
    await publishedBoards.load();
    await boardInstallRegistry.load();
}
```

**`searchPublished(query?)`** — read-only, no dialog:
1. `await ensureCatalog()`.
2. Get `publishedBoards.getCatalog()` + `boardInstallRegistry.listInstalled()`.
3. Filter by `query` (case-insensitive substring over `name`, `description`, and each `fileMask`);
   empty/undefined query returns all.
4. Map each to `PublishedBoardResult`: `installed`/`installedRoot`/`installedVersion` from the
   registry (by id); `compatible = publishedBoards.isCompatible(b.minAppVersion)`;
   `updateAvailable` via `getBoardUpdate(entry.root)` on the installed root (null → false);
   `size = b.archive.size`.

**`getPublishedVersions(id)`** — read-only, no dialog:
1. `await ensureCatalog()`.
2. `const vm = await publishedBoards.getVersions(id);` (returns `PublishedBoardVersions | null`).
3. If null → return `[]`.
4. Map each `v` to `PublishedVersionResult`: `compatible = publishedBoards.isCompatible(v.minAppVersion)`;
   `installed = boardInstallRegistry.getById(id)?.version === v.version`.

**`downloadPublished(id, opts?)`** — headless, **no dialog** (nothing trusted). Returns the root:
1. `await ensureCatalog()`.
2. Resolve the catalog entry (`getCatalog().find(b => b.id === id)`); throw if absent
   (`Board not in catalog: "${id}"`).
3. Target parent dir: `opts?.dir ?? fpJoin(await api.getCommonFolder("userData"), "data", "boards")`.
4. Resolve the **archive + version** to download:
   - No `opts.version` → use the catalog entry as-is (latest).
   - With `opts.version` → `getVersions(id)`, find the matching entry; throw if not found; build a
     synthetic `PublishedBoardInfo`: `{ ...entry, version: v.version, minAppVersion: v.minAppVersion, archive: v.archive }`.
5. **Compat gate:** if `!publishedBoards.isCompatible(<resolved>.minAppVersion)` → throw
   `This board version requires Persephone ≥ ${minAppVersion}.` (matches the UI/`installPublished`
   contract).
6. `return downloadBoard(<resolvedEntry>, targetParentDir);`

**`installPublished(id, opts?)`** — interactive combo. Returns installed root, or `undefined` if
the user abandons:
1. `await ensureCatalog()`. Resolve catalog entry; throw if absent.
2. **Already installed + `opts.version` (swap path — auto-runs, no page):**
   - `const reg = boardInstallRegistry.getById(id);`
   - If `reg` and `opts?.version`:
     - `getVersions(id)`, find the version; if not found → throw.
     - Compat gate → if incompatible, `ui.notify(... "warning")` and return `undefined` (mirrors
       `installBoardVersion`).
     - `const ok = await runBoardVersionInstall({ root: reg.root, id, name: <entry.name>, archive: v.archive, version: v.version });`
     - return `ok ? reg.root : undefined`.
3. **Otherwise (fresh install, interactive page):**
   - Build the model prefilled: `new BoardInfoEditorModel(new TComponentState({ ...getDefaultBoardInfoEditorState(), catalogId: id, installDir: opts?.dir }))`.
   - `await model.restore();`
   - `const page = app.pages.addPage(model as unknown as EditorModel);`
   - Return a Promise resolving on completion:
     - `model.installed.subscribe(root => resolve(root))` (user finished Register).
     - `app.pages.state.subscribe(...)` → when `app.pages.pages.find(p => p.id === page.id)` is
       gone (page closed) → `resolve(undefined)`.
     - Guard against double-resolve; unsubscribe both on settle.
   - **Note:** for a fresh install, `opts.version` is **not** honored by the page flow (install
     mode installs the catalog-latest) — see Concern 1. `opts.version` matters for the
     already-installed swap path only.

**`uninstallBoard(id)`** — dialog required (deletes files). Returns whether removed:
1. `await ensureCatalog()`.
2. `const reg = boardInstallRegistry.getById(id);` if none → throw `Board not installed: "${id}"`.
3. Resolve a display name: `readBoardManifest(reg.root)`'s `name` (fallback `fpBasename(reg.root)`).
4. `return uninstallCatalogBoard({ root: reg.root, name, catalogId: id });`
5. On success, if any open page runs that root, unload it to an empty page (mirror the model):
   iterate `app.pages.pages`, for a `BoardEditorModel` main editor whose `boardRoot` matches → the
   page's `close()` already happened inside `ensureBoardIdle` (it closes open board pages), so no
   extra unload is needed here — the folder is gone. **Do not** add page handling; `ensureBoardIdle`
   covers it.

**`checkPublishedUpdates(force?)`** — no dialog:
1. `const { publishedBoards } = await import(...)`; `force ? await publishedBoards.refresh() : await publishedBoards.load();`
2. `await boardInstallRegistry.load();`
3. `const { listBoardUpdates } = await import("./board-updates");`
4. `return listBoardUpdates().map(u => ({ id: u.id, root: u.root, installedVersion: u.installedVersion, latestVersion: u.latestVersion }));`

Imports to add at the top of `boards.ts` (or keep the dynamic-import style used there —
`boards.ts` currently imports only `app`, `fs`, and the `IBoards` type, and does everything else
via `import()`; **follow that pattern** — dynamic-import `publishedBoards`, `boardInstallRegistry`,
`board-install`, `board-updates`, `TComponentState`, `BoardInfoEditorModel`,
`getDefaultBoardInfoEditorState`, `EditorModel` type, `readBoardManifest`, `fpJoin`/`fpBasename`,
`api`, `ui` as needed inside each method).

### Step 6 — Agent guide (`assets/mcp-res-boards.md`)

Add a **"Published boards — discover, install, update"** section after the "Trust, forget &
rename a board" section. Cover:

- The catalog is a curated GitHub repo; boards install into `<userData>/data/boards/<id>` by
  default. Nothing is trusted by downloading — only `registerBoard` (a user trust-dialog click)
  activates a board.
- **The six calls** with one-line signatures and what shows a dialog:
  - `searchPublished(query?)` → annotated catalog list (read-only).
  - `getPublishedVersions(id)` → version history (read-only).
  - `downloadPublished(id, { dir?, version? })` → downloads for review, **no dialog** — the
    "can I trust this?" entry point.
  - `installPublished(id, { dir?, version? })` → opens the Board Info page for the user to walk
    Download → Register (fresh install), or auto-runs the swap for a version change on an
    already-installed board; resolves the root or `undefined` on abandon/veto.
  - `uninstallBoard(id)` → delete confirmation, then removes folder + trust + pin + registry.
  - `checkPublishedUpdates(force?)` → available updates.
- **Board-review checklist** (the epic's requirement): when the user asks *"can I trust this
  board?"*, `downloadPublished(id)`, then read **every** script/HTML/JS file in the returned
  folder and check for: data exfiltration (unexpected network hosts — note the board CSP blocks
  remote network at runtime, but backend `scripts/` run as full OS processes and are **not**
  sandboxed), credential / filesystem access beyond the board's stated purpose, destructive
  `persephone.execute` usage, and obfuscated/minified logic that hides intent. Report findings,
  then let the user decide at `registerBoard(root)`'s trust dialog.
- Note: **no new MCP tools** — all six are reached through `execute_script`.

Keep the guide ticket-free (consumer-facing doc rule).

## Concerns / open questions

1. **`installPublished` fresh-install + `opts.version` (RECOMMEND: scope version to the swap
   path).** Install mode's UI downloads the catalog-latest; honoring an arbitrary `version` on a
   *fresh* install would require reworking the install-mode tiles/model to target a specific
   version's archive — out of scope for an additive task. Recommendation: `opts.version` is
   honored only for the **already-installed** swap path (rollback/forward, which auto-runs);
   a fresh `installPublished` opens the page and installs the latest, and the doc states this.
   `downloadPublished` *does* honor `version` (headless, no UI). Agents wanting a specific fresh
   version can `downloadPublished(id, {version})` → `registerBoard(root)`.
2. **`installPublished` completion detection (RECOMMEND: `installed` Subscription + page-close
   watch).** Resolving the interactive flow needs a signal. Adding a `Subscription<string>` fired
   from `register()` is additive and precise; page-close (page removed from `app.pages.pages`)
   resolves `undefined`. Alternative (rejected): polling the trust/registry — the registries
   expose no public `subscribe`, only React hooks.
3. **Shared uninstall helper (RECOMMEND: extract `uninstallCatalogBoard`).** Avoids duplicating
   the confirm/idle/delete/untrust/unpin/registry logic across the model and the agent API and
   keeps the wording in one place. Touches US-867 model code (delegation only, behavior
   preserved).
4. **Result-type shape (RECOMMEND: annotated, self-contained interfaces).** `searchPublished` /
   `getPublishedVersions` return install-state + compatibility annotations rather than raw ipc
   shapes, so an agent gets `installed` / `updateAvailable` / `compatible` without recomputing
   `compareVersions` against `app.version`. Defined in `boards.d.ts`.
5. **`uninstallBoard` when not installed (RECOMMEND: throw).** Consistent with `downloadPublished`
   throwing on an unknown id. Returns `Promise<boolean>` otherwise (true = removed, false =
   user cancelled / busy / failed).
6. **`checkPublishedUpdates` default cadence.** With `force` omitted it calls `load()` (24h-gated
   fetch, cache otherwise) — same as opening any catalog surface. `force: true` bypasses the gate.
   This matches the epic ("trigger a catalog refresh").

## Acceptance criteria

- `app.boards.searchPublished("drawio")` (via `execute_script`) returns the DrawIO Viewer entry
  annotated with `installed` / `installedVersion` / `updateAvailable` / `compatible`; an empty
  query returns the whole catalog; a non-matching query returns `[]`.
- `app.boards.getPublishedVersions("drawio-viewer")` returns the version history newest-first,
  each entry flagged `compatible` and `installed`.
- `app.boards.downloadPublished("drawio-viewer")` downloads + verifies + extracts into
  `<userData>/data/boards/drawio-viewer` and resolves the root with **no dialog**; the board is
  present on disk but untrusted (not in the switch); `downloadPublished(id, { version })` fetches
  that specific version; an incompatible version throws with a "requires Persephone ≥ X" message.
- `app.boards.installPublished("drawio-viewer")` opens a Board Info page; completing Download →
  Register (one trust-dialog click) resolves the installed root; closing the page without
  registering resolves `undefined`. `installPublished("drawio-viewer", { version })` on an
  already-installed board auto-runs the swap (subject to the open-pages/busy precondition) and
  resolves the root, or `undefined` if the user vetoes the close-pages dialog.
- `app.boards.uninstallBoard("drawio-viewer")` shows the delete confirmation, then removes the
  folder + trust + pin + registry entry and resolves `true`; cancelling resolves `false`; an
  uninstalled id throws.
- `app.boards.checkPublishedUpdates(true)` force-refreshes the catalog and returns the list of
  `{ id, root, installedVersion, latestVersion }` for compatible newer versions.
- `assets/mcp-res-boards.md` documents all six calls, the consent expectations, and the
  board-review checklist; it stays ticket-free.
- `tsc` + `eslint` clean.

## Files changed

| File | Change |
|---|---|
| `src/renderer/api/types/boards.d.ts` | Add `PublishedBoardResult`, `PublishedVersionResult`, `BoardUpdateInfo`; add the six `IBoards` methods with JSDoc |
| `src/renderer/api/boards.ts` | Implement the six methods + `ensureCatalog` helper |
| `src/renderer/api/board-updates.ts` | Add `listBoardUpdates()` (sync, non-reactive) |
| `src/renderer/api/board-install.ts` | Add `uninstallCatalogBoard(args)` shared helper (+ `boardTrust` import) |
| `src/renderer/editors/board-info/BoardInfoEditorModel.ts` | Add `installed` Subscription (fired in `register()`); delegate `uninstall()` to `uninstallCatalogBoard` |
| `assets/mcp-res-boards.md` | "Published boards — discover, install, update" section + board-review checklist |
| `doc/active-work.md` | Move US-869 to Active (link this doc) |
| `doc/epics/EPIC-045.md` | Link US-869 to this doc in the task table; Notes entry on completion |

## Files that need NO change

- `src/main/published-boards-service.ts` — catalog + versions fetch already exposed
  (`getPublishedBoards`, `getBoardVersions`); no new main-side work.
- `src/ipc/*` — no new IPC endpoint (all six calls reuse existing renderer APIs).
- `src/renderer/editors/base/PageToolbar.tsx` — the "+" switch entry is unrelated.
- `src/renderer/ui/sidebar/TrustedBoardsList.tsx`, `BoardsSecondaryView.tsx` — sidebar surfaces
  unchanged (hub page is US-870).
- `src/renderer/editors/board-info/open-board-info.ts` — `installPublished` opens a fresh page via
  `addPage`, not via the existing-page helper.

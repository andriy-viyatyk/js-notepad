# US-867: Board Info editor — properties mode + version history & rollback

**Epic:** [EPIC-045: Published Boards Catalog](../../epics/EPIC-045.md)
**Status:** Active (implementing)

## Goal

Give the existing Board Info editor a **properties mode** for an installed board (board/install
info + a fetched-on-demand **Versions** list with per-version install/rollback, plus Uninstall and
Open board), add a **Properties** button to the board toolbar that opens it (and silently indicates
when an update is available), and add the `getBoardVersions` catalog endpoint that backs the
versions list. This is where the per-board update surfacing lives — replacing the per-navigation
activation toast (see Concern 1).

## Background

Most of the machinery already exists from earlier epic tasks. This task fills the remaining gaps.

### What already exists (do NOT rebuild)

| Piece | Location | Notes |
|-------|----------|-------|
| Board Info editor — **install mode** | `src/renderer/editors/board-info/BoardInfoEditorModel.ts` + `BoardInfoEditorView.tsx` | Host-capable holder (`CONTENT_HOST_TRAIT`); adopts/yields host without rendering it; `switchFrom` tolerates a host-less source. Registered id `"board-info"` (`board-info-id.ts`, `register-editors.ts:482`), `hasContentHost: true`, `accepts: () => -1`. |
| Catalog service (main) | `src/main/published-boards-service.ts` | `getPublishedBoards(force?)`; `manifestUrl()` builds the raw URL with the `PERSEPHONE_BOARDS_BRANCH` dev override. |
| Catalog model (renderer) | `src/renderer/api/published-boards.ts` | `getCatalog()`, `useCatalog()`, `isCompatible(minAppVersion?)`, `catalogBoardsForFile()`. |
| Install registry | `src/renderer/api/board-install-registry.ts` | `getById`/`getByRoot`/`record`/`remove`/`useInstalled`; entry carries `version`, `lastNotifiedVersion?`. |
| Install / swap engine | `src/renderer/api/board-install.ts` | `downloadBoard(entry, dir, installId)`; `updateBoard(entry, { preSwap? })` (temp-extract + folder swap). |
| Update detection + swap orchestration | `src/renderer/api/board-updates.ts` | `getBoardUpdate(root)`, `useBoardUpdates()`, `isBoardIdle`, `ensureBoardIdle`, `runBoardUpdate(update)` (idle precondition + close-pages dialog + `showProgress`). |
| Activation toast | `src/renderer/editors/board/BoardEditorModel.ts:170` `maybeNotifyUpdate()` | Fires once per board+version on main-frame load; click → `runBoardUpdate`. **Retargeted/removed here — Concern 1.** |
| Sidebar "Update" badge + context menu | `src/renderer/ui/sidebar/TrustedBoardsList.tsx` | Uses `useBoardUpdates` + `runBoardUpdate`. Unchanged by this task. |
| Board toolbar | `src/renderer/editors/board/BoardToolbar.tsx` | Explorer / path+switcher / Reload / Log / `SwitchWidget`. **No Properties button yet — added here.** |
| `BoardManifest` fields | `src/renderer/editors/board/board-manifest.ts:36` | `description?`, `author?`, `repository?`, `version?`, `minAppVersion?`, `standalone?`, `fileMasks?`, `editorName?`, `editorKind?`. Readers: `readBoardManifest(root)`, `getBoardEditorAssociation(manifest)`, `isBoardStandalone(manifest)`, `isBoardFolder(root)`. |
| Page navigation | `src/renderer/api/pages/PageModel.ts` | `switchMainEditor(id)` (host-transfer vs dispose-rebuild; board-boundary aware); `setMainEditor(editor)` (disposes the released old editor unless id-transferred/keep-alive). |
| Back-nav to a board | `BoardToolbar.tsx:52` precedent | `app.events.openRawLink.sendAsync(createLinkData(encodePersephoneBoardLink(root), { pageId, explorerRoot }))`. |
| Delete-board confirm wording | `src/renderer/editors/explorer/BoardsSecondaryView.tsx:180` | `"Delete board \"X\"? This permanently removes its folder and all its files."` — reuse for Uninstall. |

### What is missing (this task)

1. `getBoardVersions(id)` main endpoint + renderer wiring + `PublishedBoardVersions` types.
2. Properties mode in the Board Info editor (model state + view), driven by an explicit `boardRoot`.
3. `installVersion(...)` generalization of `updateBoard` + a `runBoardVersionInstall(...)` orchestrator (arbitrary version, same idle precondition/swap safety as update).
4. An `openBoardInfo(page, { catalogId?, boardRoot? })` navigation helper (host-preserving where possible).
5. A **Properties** button on `BoardToolbar` with a silent "update available" indicator.
6. Toast decision (Concern 1): remove the per-navigation activation toast (recommended) — the silent indicators become the sole non-nagging surface.

## Implementation plan

### Step 1 — `getBoardVersions` endpoint (main + IPC + types)

**1a. Types** — `src/ipc/api-param-types.ts` (after `PublishedBoardsResult`, ~line 114):

```ts
/** One published version of a board (from boards/<id>/versions-manifest.json, EPIC-045). */
export interface PublishedBoardVersion {
    version: string;
    date?: string;
    notes?: string;
    minAppVersion?: string;
    archive: PublishedBoardArchive;
}

/** A board's full version history (newest first). Fetched on demand (Board Info properties). */
export interface PublishedBoardVersions {
    schemaVersion: number;
    id: string;
    versions: PublishedBoardVersion[];
}
```

**1b. Service** — `src/main/published-boards-service.ts`:
- Refactor `manifestUrl()` to share a base:

```ts
function boardsRepoRawBase(): string {
    const branch = process.env.PERSEPHONE_BOARDS_BRANCH?.trim() || "main";
    return `https://raw.githubusercontent.com/andriy-viyatyk/persephone-boards/${branch}`;
}
function manifestUrl(): string { return `${boardsRepoRawBase()}/boards-manifest.json`; }
function versionsUrl(id: string): string {
    return `${boardsRepoRawBase()}/boards/${encodeURIComponent(id)}/versions-manifest.json`;
}
```
- Add `validateVersion`/`validateVersions` (mirror `validateBoard`/`validateCatalog`; `schemaVersion === 1`, drop malformed version entries; each version needs `version` string + valid `archive`).
- Add `getBoardVersions(id)` — **no cache gate** (small file, on demand):

```ts
export async function getBoardVersions(id: string): Promise<PublishedBoardVersions | null> {
    try {
        const response = await net.fetch(versionsUrl(id), { headers: { "User-Agent": "persephone" } });
        if (!response.ok) return null;
        return validateVersions(await response.json());
    } catch {
        return null;
    }
}
```
- Export it on `publishedBoardsService`.

**1c. IPC (4-file recipe)** mirroring `getPublishedBoards`:
- `src/ipc/api-types.ts`: `Endpoint.getBoardVersions = "getBoardVersions"`; import `PublishedBoardVersions`; `[Endpoint.getBoardVersions]: (id: string) => Promise<PublishedBoardVersions | null>` in the `Api` type.
- `src/ipc/renderer/api.ts`: `getBoardVersions = async (id: string) => executeOnce<PublishedBoardVersions | null>(Endpoint.getBoardVersions, id);` (import the type).
- `src/ipc/main/controller.ts`: handler `getBoardVersions = async (_e, id: string) => publishedBoardsService.getBoardVersions(id);` + `bindEndpoint(Endpoint.getBoardVersions, controllerInstance.getBoardVersions);`.

**1d. Renderer accessor** — `src/renderer/api/published-boards.ts`: thin passthrough
`async getVersions(id: string): Promise<PublishedBoardVersions | null> { return api.getBoardVersions(id); }`
(no caching — the properties view fetches on open). Import the type.

### Step 2 — Generalize the swap engine (`board-install.ts` + `board-updates.ts`)

**2a. `src/renderer/api/board-install.ts`** — add `installVersion`, make `updateBoard` delegate:

```ts
/** Install a SPECIFIC published version's archive into the board's existing root via the same
 *  temp-extract + folder-swap as an update (US-867 rollback/forward). Runs under existing trust.
 *  `opts.preSwap` re-checks idleness right before the swap. */
export async function installVersion(
    id: string,
    archive: PublishedBoardArchive,
    version: string,
    opts?: { preSwap?: () => Promise<boolean> },
): Promise<string> {
    // (body = current updateBoard body, but using the passed `archive`/`version`
    //  instead of entry.archive/entry.version; existing = getById(id).)
}

export async function updateBoard(
    entry: PublishedBoardInfo,
    opts?: { preSwap?: () => Promise<boolean> },
): Promise<string> {
    return installVersion(entry.id, entry.archive, entry.version, opts);
}
```
Import `PublishedBoardArchive`. Keep the existing `downloadBoard` update-branch (`return updateBoard(entry)`) as-is.

**2b. `src/renderer/api/board-updates.ts`** — extract the orchestration so both update-latest and version-install share the idle precondition + progress + toasts:

```ts
/** Preconditioned, user-consented install of a specific version into `root`. Ensures idle
 *  (close-pages dialog if needed) → swap via `installVersion`, re-checking idleness before the
 *  swap. Never throws — surfaces via toasts. Returns whether the swap happened. */
export async function runBoardVersionInstall(args: {
    root: string; id: string; name: string; archive: PublishedBoardArchive; version: string;
}): Promise<boolean> {
    if (!(await ensureBoardIdle(args.root))) return false;
    try {
        await ui.showProgress(
            installVersion(args.id, args.archive, args.version, { preSwap: async () => isBoardIdle(args.root) }),
            `Installing ${args.name} v${args.version}…`,
        );
        void ui.notify(`Installed ${args.name} v${args.version}.`, "success");
        return true;
    } catch (err) {
        void ui.notify(`Install failed: ${(err as Error).message}`, "error");
        return false;
    }
}

export async function runBoardUpdate(update: BoardUpdate): Promise<boolean> {
    return runBoardVersionInstall({
        root: update.root, id: update.id, name: update.entry.name,
        archive: update.entry.archive, version: update.latestVersion,
    });
}
```
Import `installVersion` + `PublishedBoardArchive`. `ensureBoardIdle`/`isBoardIdle` stay as-is.

### Step 3 — `openBoardInfo` navigation helper

New file `src/renderer/editors/board-info/open-board-info.ts` (kept out of `index.tsx` to avoid pulling the view into every importer):

```ts
import { TComponentState } from "../../core/state/state";
import { CONTENT_HOST_TRAIT } from "../base/editor-traits";
import type { PageModel } from "../../api/pages/PageModel";
import { BoardInfoEditorModel, getDefaultBoardInfoEditorState } from "./BoardInfoEditorModel";

/** Navigate a page's main editor to the Board Info editor with explicit params. Preserves a
 *  transferable content host (content-host board / file page); otherwise confirms release of the
 *  outgoing editor first. Used by the toolbar Properties button, the hub, and the update toast. */
export async function openBoardInfo(
    page: PageModel,
    opts: { catalogId?: string; boardRoot?: string },
): Promise<void> {
    const old = page.mainEditorInstance;
    const hostTrait = old?.traits.get(CONTENT_HOST_TRAIT);
    if (old && !hostTrait && !(await old.confirmRelease())) return; // simple/board-view veto
    const model = new BoardInfoEditorModel(
        new TComponentState({ ...getDefaultBoardInfoEditorState(), ...opts }),
    );
    if (old && hostTrait) model.switchFrom(old); // lossless host transfer (tolerant)
    await model.restore();
    await page.setMainEditor(model as unknown as Parameters<PageModel["setMainEditor"]>[0]);
}
```

Notes:
- `switchFrom` already extracts the old host so `setMainEditor`'s dispose of the old editor won't
  dispose the transferred host.
- For a content-host board page (drawio), `hostTrait` is present → host transferred, `boardRoot`
  set → properties mode with the file preserved for **Open board**.
- For a simple/`board-view` page (no host), `confirmRelease` runs, then a host-less Board Info.

### Step 4 — Properties mode in the Board Info editor

**4a. State** — `BoardInfoEditorModel.ts` `BoardInfoEditorState`: add transient (non-persisted)
fields for the properties view:

```ts
/** Properties-mode data (only when state.boardRoot is set). Loaded in restore(). */
manifest?: BoardManifestSummary;      // name/description/author/repository/version/association
installedVersion?: string;            // from the install registry (may differ from manifest)
trusted?: boolean;
versions?: PublishedBoardVersion[];   // fetched on demand
versionsState?: "idle" | "loading" | "error";
```
Where `BoardManifestSummary` is a small local shape derived from `readBoardManifest` +
`getBoardEditorAssociation` (avoid persisting the whole manifest). `getRestoreData` continues to
persist only `title`/`catalogId`/`boardRoot`/`installDir` — properties data is recomputed on
`restore()`.

**4b. Mode decision:** `boardRoot` set → **properties mode**; else **install mode** (existing).
Add `get mode(): "install" | "properties"`.

**4c. `restore()`:** after the existing install-mode reconcile, if `boardRoot` is set:
- `await boardInstallRegistry.load()`; read `getByRoot(boardRoot)` for `installedVersion`.
- `readBoardManifest(boardRoot)` → summary (name falls back to `fpBasename(root)`); `getBoardEditorAssociation` for masks/editorName/editorKind.
- `trusted = boardTrust.isTrusted(boardRoot)`.
- Fire `void this.loadVersions()` (below) — non-blocking.
- A `boardRoot` that is no longer a board folder (`!isBoardFolder`) → render a "no longer installed" empty state (mirror the install-mode stale handling).

**4d. `loadVersions()`:** only when the board is a catalog install (registry entry with an `id`).
Set `versionsState = "loading"`; `const v = await publishedBoards.getVersions(id)`; on null →
`"error"`; else store `versions` + `"idle"`. A non-catalog (locally authored) board simply shows
no Versions section.

**4e. Actions on the model:**
- `installBoardVersion(v: PublishedBoardVersion)` → guard `publishedBoards.isCompatible(v.minAppVersion)`; import `runBoardVersionInstall`; call with `{ root, id, name, archive: v.archive, version: v.version }`. On success re-`restore()` (refresh installedVersion + versions highlight). **No extra confirmation** — the click is the intent (Concern 3, epic).
- **Removal action — differs by board type** (`isCatalogInstall` = the board has a registry entry
  with an `id`):
  - **Catalog install → `uninstall()`** (destructive, reinstallable). Reuse the Explorer delete
    wording via `showConfirmationDialog` (`"Delete board \"X\"? This permanently removes its folder
    and all its files."`); on confirm: `ensureBoardIdle` (busy/open guard), then
    `fs.removeDir(root, true)` → `boardTrust.untrust(root)` → `removePin({ kind: "board", root })`
    (from `../../ui/sidebar/pinned-items`) → `boardInstallRegistry.remove(id)`.
  - **Local (non-catalog) board → `unregister()`** (non-destructive — the folder is the user's
    only copy and cannot be reinstalled). Confirm with lighter wording
    (`"Remove board \"X\" from trusted boards? Its folder is left untouched on disk."`); on confirm:
    `ensureBoardIdle`, then `boardTrust.untrust(root)` → `removePin({ kind: "board", root })`. **No
    `fs.removeDir`, no registry touch.** The board can be re-registered later by re-trusting the
    folder.
  - Both paths then **unload the board from this page** — `await this.page?.setMainEditor(null)` —
    leaving an empty page (null main editor). Do **NOT** `close()` the page: it may be pinned (pinned
    pages must not close — unpin-first is the contract) and may host an Explorer/secondary panel over
    the project folder that should survive. `setMainEditor(null)` disposes the Board Info editor (the
    outgoing main) and leaves the page and its panels intact.
- `openBoard()` → back-nav per the Design's mechanics:
  - If a content host is held (`this._host`): `await this.page?.switchMainEditor(boardEditorId(root))` (host transfers back losslessly).
  - Else: `app.events.openRawLink.sendAsync(createLinkData(encodePersephoneBoardLink(root), { pageId: this.page?.id ?? "" }))`.

**4f. Wire the standalone register auto-open (finish US-864 TODO):** in `register(entry)`, the
`else` branch (standalone open) currently just `recomputeMatches()`. Now switch that page into
properties mode for the freshly registered board:
`this.state.update((s) => { s.boardRoot = root; }); await this.restore();`.

### Step 5 — Properties-mode view (`BoardInfoEditorView.tsx`)

Branch on `model.mode`. Keep the existing install-mode JSX untouched under `mode === "install"`.
Add a properties block (pure UIKit — no Emotion; editors are app code):

- Header: board name (bold, `size="lg"`), installed version, trust chip (`trusted ? "Trusted" : "Not trusted"`).
- Info rows (`Text` label + value): description, author, repository (link via `openRawLink` if a URL), root path, editor association (masks + editorName + kind), source = catalog id when a catalog install.
- **Versions** section:
  - `versionsState === "loading"` → a `ProgressBar`/spinner + "Loading versions…".
  - `"error"` → "Couldn't load version history." + Retry (`void model.loadVersions()`).
  - `"idle"` with versions → a list, newest first. Per row: version, date, notes.
    - Current installed version → `"Current"` marker, no button.
    - Newer-than-installed **and compatible** → highlighted + **Update** button.
    - Older than installed → **Install** button (rollback).
    - Incompatible (`!isCompatible(v.minAppVersion)`) → disabled + `"Requires Persephone ≥ {v.minAppVersion}"` hint.
    - Button onClick → `void model.installBoardVersion(v)`.
  - No versions / not a catalog board → hide the section (or a subtle "Not from the catalog" note).
- Footer actions: **Open board** (`void model.openBoard()`), and a removal button whose label +
  handler depend on the board type — **Uninstall** (`variant="danger"`, `void model.uninstall()`)
  for a catalog install, **Unregister** (`variant="danger"`, `void model.unregister()`) for a local
  board. The Unregister button's tooltip clarifies "removes from trusted boards; folder kept".
- "No longer installed" empty state when `boardRoot` set but not a board folder.

### Step 6 — Board toolbar Properties button + update indicator

`src/renderer/editors/board/BoardToolbar.tsx`:
- Import `useBoardUpdates` (`../../api/board-updates`), `fpNormalizeForCompare`, `openBoardInfo`
  (`../board-info/open-board-info`), and a suitable icon (e.g. `InfoIcon`/`PropertiesIcon` from
  `../../theme/icons` — pick the existing closest; check the icon set).
- `const updates = useBoardUpdates();` and `const hasUpdate = !!boardRoot && updates.has(fpNormalizeForCompare(boardRoot));`
- Add an `IconButton` (next to Reload/Log) titled `hasUpdate ? "Board properties — update available" : "Board properties"`; `onClick={() => { if (model.page) void openBoardInfo(model.page, { boardRoot }); }}`.
- Update indicator: a small dot/badge over the button when `hasUpdate` (reuse the sidebar's `RunningDot` pattern or a `Badge`/dot; keep it subtle). Load the catalog + registry on mount (`void publishedBoards.load(); void boardInstallRegistry.load();`) so the indicator shows without opening the sidebar first (mirror `TrustedBoardsList`).

### Step 7 — Toast decision (Concern 1)

**Recommended:** remove `maybeNotifyUpdate()`'s toast from `BoardEditorModel.markFrameLoaded`.
Delete the `if (tab === BOARD_CDP_TAB) void this.maybeNotifyUpdate();` line and the
`maybeNotifyUpdate` method (and `setLastNotified` usage if now unused — verify no other caller;
keep the field/method if referenced elsewhere). The silent Properties-button indicator + the
sidebar badge become the sole, non-nagging surfaces.

**Fallback (if the user wants to keep a toast):** retarget the click from `runBoardUpdate(update)`
to `openBoardInfo(this.page, { boardRoot: root })` (properties mode), so the toast informs rather
than mutates. Keep the once-per-board+version `lastNotifiedVersion` gate either way if retained.

## Concerns / Open questions

1. **Per-navigation activation toast — needs the user's call.** The user's steer (EPIC-045 Notes,
   2026-07-17): prefer a silent indicator on the Properties button; the toast can annoy a user who
   intentionally stays on an older version. **Recommendation: remove the toast** (Step 7) and rely
   on the Properties-button dot + sidebar badge. Fallback retarget documented if kept. *Decide at
   review.*
2. **Uninstall — unload the page, never close it (RESOLVED).** Uninstall runs from the board's own
   page (Properties replaced the board view there), so the board is "not open in a board view" at
   that moment — but a *second* page could still run it, and processes could be busy. `uninstall()`
   runs `ensureBoardIdle(root)` (busy hard-stop + close-other-pages dialog) before deleting. After
   deletion it **unloads** the board from the page via `setMainEditor(null)` — leaving an empty page
   — rather than closing it. Closing is wrong because the page may be **pinned** (pinned pages must
   not close; the user unpins first by design) and may host an **Explorer/secondary panel** over the
   project folder that must survive. An empty page is a fine end state.
3. **No confirmation on version install/rollback** — resolved by the epic (Concern 3): the click is
   the intent; the busy/open guard is the only safety. No local-edit detection.
4. **`installVersion` signature** — epic Design wrote `installVersion(root, archive, version)`; this
   plan uses `installVersion(id, archive, version)` because the registry is keyed by id and the
   existing `updateBoard` already resolves the root via `getById(entry.id)`. Equivalent; id-based
   avoids a redundant root→entry lookup. *Flagging the deviation from the Design's literal wording.*
5. **Local vs catalog removal (RESOLVED).** Locally-authored (non-catalog) trusted boards also get a
   Properties button; the Versions section is hidden (no registry `id` → `loadVersions` no-ops). The
   removal action differs: a **catalog install** offers **Uninstall** (deletes the folder — safe
   because it is reinstallable from the catalog); a **local board** offers **Unregister** (untrust +
   unpin only, **folder kept**), because the folder is the user's only copy and deleting it would be
   an unrecoverable data loss. Never `fs.removeDir` a local board.
6. **Repository/URL rendering** — only render `repository` as a clickable link when it parses as an
   `http(s)` URL; otherwise plain text. Avoid `openRawLink` on arbitrary strings.

## Acceptance criteria

- The board toolbar shows a **Properties** button on every board (simple, content-host, catalog or
  locally authored). Clicking it navigates the current page to the Board Info screen in properties
  mode; for a content-host board the file content is preserved, and **Open board** returns to the
  board view with no data loss.
- For a catalog-installed board, properties mode lists all published versions (newest first, fetched
  on demand): the current version is marked, a newer compatible version is highlighted as an update,
  older versions are installable (rollback), and an incompatible version is disabled with a
  "Requires Persephone ≥ X" hint.
- Installing any listed version runs the safe swap (busy/open-pages precondition + close-pages
  dialog; temp-extract + folder swap; trust/pins untouched); the install registry then reflects the
  actually-installed version, and the versions list re-highlights accordingly.
- **Catalog installs** show an **Uninstall** button: delete confirmation → deletes the folder,
  untrusts, unpins, removes the registry entry. **Local (non-catalog) boards** show an **Unregister**
  button instead: untrust + unpin only, **folder left on disk** (no data loss). Both then **unload
  the board from the page (empty page)** — the page is not closed, so a pinned page stays pinned and
  any Explorer/secondary panel survives.
- When a board has a pending compatible update, the Properties button shows a silent indicator
  (dot/badge); no per-navigation toast fires (Concern 1, pending the review decision).
- `app.version`-incompatible versions are never offered as an installable update and are disabled
  with the hint; an older compatible version stays installable.
- Locally-authored trusted boards open a Properties screen with manifest info and no Versions
  section; Open board / Uninstall behave correctly.
- `getBoardVersions(id)` fetches `boards/<id>/versions-manifest.json` from the active branch
  (honoring `PERSEPHONE_BOARDS_BRANCH`), validates it, and returns null silently on network/parse
  failure (the view shows a Retry).

## Files changed

| File | Change |
|------|--------|
| `src/ipc/api-param-types.ts` | Add `PublishedBoardVersion`, `PublishedBoardVersions`. |
| `src/ipc/api-types.ts` | `Endpoint.getBoardVersions` + `Api` entry; import the type. |
| `src/ipc/renderer/api.ts` | `getBoardVersions(id)` passthrough. |
| `src/ipc/main/controller.ts` | Handler + `bindEndpoint`. |
| `src/main/published-boards-service.ts` | `boardsRepoRawBase()`/`versionsUrl()` refactor; `validateVersion(s)`; `getBoardVersions(id)`; export. |
| `src/renderer/api/published-boards.ts` | `getVersions(id)` accessor. |
| `src/renderer/api/board-install.ts` | Add `installVersion(id, archive, version, opts?)`; `updateBoard` delegates. |
| `src/renderer/api/board-updates.ts` | Add `runBoardVersionInstall(...)`; `runBoardUpdate` delegates. |
| `src/renderer/editors/board-info/open-board-info.ts` | **New** — `openBoardInfo(page, opts)` helper. |
| `src/renderer/editors/board-info/BoardInfoEditorModel.ts` | Properties-mode state, `mode` getter, `restore()` branch, `loadVersions`, `installBoardVersion`, `uninstall`, `openBoard`; finish standalone `register` auto-open. |
| `src/renderer/editors/board-info/BoardInfoEditorView.tsx` | Properties-mode view branch. |
| `src/renderer/editors/board/BoardToolbar.tsx` | Properties button + update indicator; mount-load catalog+registry. |
| `src/renderer/editors/board/BoardEditorModel.ts` | Toast decision (Step 7 — remove or retarget per Concern 1). |
| `doc/active-work.md`, `doc/epics/EPIC-045.md` | Move US-867 to Active / link the task doc. |

## Files that need NO change

- `src/renderer/api/board-install-registry.ts` — `getById`/`getByRoot`/`remove` already suffice
  (Uninstall uses `remove`; version install re-`record`s via `installVersion`'s existing logic).
- `src/renderer/ui/sidebar/TrustedBoardsList.tsx` — already shows the sidebar update badge; the
  shared `useBoardUpdates`/`runBoardUpdate` contract is unchanged (still exported).
- `src/renderer/editors/board/custom-editor-registry.ts` — `boardEditorId(root)` reused as-is.
- `src/renderer/editors/board/board-manifest.ts` — all needed readers already exist.
- `src/renderer/editors/register-editors.ts` — `board-info` is already registered.
- `src/renderer/editors/board-info/board-info-id.ts`, `index.tsx` — no change (openers set state
  via `openBoardInfo` / `switchMainEditor`).

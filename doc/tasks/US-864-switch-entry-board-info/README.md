# US-864 — "+" editor-switch entry + Board Info editor (install mode)

**Epic:** [EPIC-045 — Published Boards Catalog](../../epics/EPIC-045.md)
**Status:** Active (implemented but unreviewed until epic close)

## Goal

Surface an uninstalled catalog board to the user at the moment it is relevant — when they
open a file whose mask a published board matches — by adding a **"+"** segment to the editor
switch, and back it with a new registered **Board Info** editor whose *install mode* walks the
user through a two-step **Download → Register board** flow with byte progress. Downloading
trusts nothing (verified code lands on disk inert); only **Register board** shows the trust
dialog, after which the page switches to the newly installed board.

## Background

### The editor switch (`SwitchWidget`) — where "+" is injected

`src/renderer/editors/base/PageToolbar.tsx` → `SwitchWidget` is the single merge point for the
editor switch. It already:

- reads `options = model.findCompatibleEditors()` (built-ins that accept the file),
- appends **trusted** file-associated boards via
  `customEditorRegistry.useBoardsForFile(fileName)` (reactive), applying a **non-local filter**
  (`!isPlainLocalPath(filePath)` → keep only `editorKind === "content-host"` boards),
- resolves the file name from `hostState?.filePath ?? model.filePath ?? hostState?.title ??
  editorState.title` (so untitled/renamed pages still resolve),
- hides itself unless `merged.length >= 2 && merged.includes(model.editorId)`,
- labels each segment (`boardNameById` for boards, else `editorRegistry.getById(id)?.name`),
- and navigates on change via `model.page?.switchMainEditor?.(v)`.

US-864 adds a **third** contributor here: compatible + uninstalled catalog matches, collapsed
into one `"+"` segment whose value is the Board Info editor id — so selecting it is an ordinary
`switchMainEditor` navigation (Concern 1 in the epic: no pseudo-segment `onChange`
interception).

### Catalog + install data sources (US-862 / US-863) — all present and warmed

- `src/renderer/api/published-boards.ts` — `publishedBoards` singleton.
  `useCatalog()` / `useCatalogBoardsForFile(fileName)` (reactive; already filters to
  **compatible** boards via `isCompatible(minAppVersion)` and mask-matches the basename),
  `getCatalog()` (sync). **Warmed at startup** (`app.ts:178`, `publishedBoards.load()`).
- `src/renderer/api/board-install-registry.ts` — `boardInstallRegistry`.
  `useInstalled()` (reactive), `getById(id)`, `getByRoot(root)`, `record(entry)`, `remove(id)`.
  One entry per catalog id. **Warmed at startup** (`app.ts:182`).
- `src/renderer/api/board-install.ts` — `downloadBoard(entry, targetParentDir)` (download →
  sha256-verify → extract → validate → registry-record; **trusts nothing**; returns the install
  root) and `updateBoard(entry)` (temp-extract + swap; US-865 wires its UI). The download's
  `installId` is currently minted **internally**, so a caller cannot correlate
  `eBoardInstallProgress` events → **US-864 adds an optional `installId` param** (below).
- Progress event `eBoardInstallProgress { installId, receivedBytes, totalBytes }` — main→renderer
  broadcast, subscribable via `rendererEvents[EventEndpoint.eBoardInstallProgress].subscribe(...)`
  (`src/ipc/renderer/renderer-events.ts:135`). Download endpoint:
  `api.downloadBoardArchive({ installId, url, sha256, size })`; cancel:
  `api.cancelBoardDownload(installId)`.
- `PublishedBoardInfo` (`src/ipc/api-param-types.ts:84`): `{ id, version, name, description?,
  fileMasks?, editorName?, editorKind?, standalone?, minAppVersion?, archive { url, size,
  sha256 } }`.

### The host-capable holder pattern (from `BoardContentEditorModel`)

`src/renderer/editors/board/BoardContentEditorModel.ts` is the exact template for a model that
**adopts/yields the shared content host without rendering it**:

- constructor adds `CONTENT_HOST_TRAIT` with `extractContentHost()` (nulls `_host`, unsubscribes),
- `override get contentHost()` returns the held `_host`,
- `switchFrom(oldEditor)` extracts the old editor's host (`CONTENT_HOST_TRAIT`) and `adoptHost`s it,
- `adoptHost(host)` wires `host.state → descriptorChanged`, copies `title`/`id`, forwards `page`,
- `modified` / `saveState` / `confirmRelease` delegate to `_host`,
- `dispose()` disposes `_host` iff it was not extracted.

Board Info reuses this machinery but **extends `EditorModel` directly** (no iframe, no board),
and its `switchFrom` **tolerates a host-less source** (standalone open from hub/toast, US-867 —
no `CONTENT_HOST_TRAIT` on the old editor → just no host). `findCompatibleEditors()` returns
`[builtinId, "board-info"]` (mirroring `BoardContentEditorModel`) so the switch keeps rendering
`Text | +` while Board Info is active.

### `switchMainEditor` navigation mechanics (`src/renderer/api/pages/PageModel.ts:451`)

Confirmed behavior for every switch US-864 relies on (no changes needed to `switchMainEditor`):

| From → To | `boardInvolved`? | Path taken | Result |
|-----------|------------------|-----------|--------|
| Text (Monaco) → `board-info` | no | default branch (line 539) — `createEditor("board-info")` → `switchFrom(monaco)` extracts+adopts host → `restore` | lossless host transfer, no confirm |
| `board-info` → Text | no | default branch — `createEditor(builtin)` → `switchFrom(board-info)` extracts held host | lossless host transfer |
| `board-info` → installed **content-host** board (`board-editor:<root>`) | yes | host-transfer branch (line 486) — `oldHostCapable = !!board-info.contentHost` (true), `newHostCapable` = content-host (true) → `BoardContentEditorModel.switchFrom(board-info)` extracts host | lossless, no reload |
| `board-info` → installed **simple** board | yes | simple-board branch (line 511) — needs `filePath` from `board-info.contentHost?.filePath` (present) → `confirmRelease()` (delegates to host) → dispose-and-rebuild over the file | file re-read from disk (fine for a just-downloaded viewer) |

Two facts this table depends on:

1. **`board-info` must register `hasContentHost: true`.** In the `board → board-info` direction
   (US-867 Properties button), `switchMainEditor` reads `editorRegistry.getById("board-info")
   ?.hasContentHost` to decide host-transfer vs. dispose-rebuild. Registering it host-capable
   keeps that switch lossless (and is harmless for US-864's flows, which check the live
   instance's `contentHost`).
2. **Await `customEditorRegistry.refresh()` before the post-register `switchMainEditor`.**
   `boardTrust.trust(root)` triggers an async registry refresh; switching before it lands would
   have `newBoardKind` default to `"simple"` and dispose-and-rebuild a content-host board
   (data-loss risk). The epic calls this out explicitly.

### Registered-editor scaffolding (template: `toolset/`)

`src/renderer/editors/toolset/` shows the full shape of a registered full-page editor with its
own state: `ToolsetEditorModel` (`editorId`, `noLanguage`, `skipSave`, `showBackgroundOrnament`,
`getIcon`, `restore()`, custom state via `EditorStateBase`), `index.tsx`
(`toolsetModule: EditorModule` with `createEditor` + `Component`, plus a legacy
`EditorModule` default export for `buildEditorById`/restore), and registration in
`register-editors.ts` (`accepts: () => -1`, dynamic `loadModule`). Board Info follows this
exactly, plus the host-holder additions.

### UIKit pieces available

`ProgressBar` (`uikit/ProgressBar/ProgressBar.tsx` — `value`/`max`/`completed`/`variant`),
`Button`, `Input`, `Panel`, `Text`, `IconButton`. `fs.showFolderDialog({ title, defaultPath })
→ string[] | null`; `api.getCommonFolder("userData")`; `showTrustBoardDialog(root) →
Promise<boolean>` (`src/renderer/ui/dialogs/TrustBoardDialog.tsx`); `boardEditorId(root)` /
`customEditorRegistry.refresh()` (`custom-editor-registry.ts`); `boardTrust.trust(root)`
(`board-trust.ts`); `ui.notify(msg, level)` (`api/ui.ts`).

## Implementation plan

### 1. Shared editor-id constant — `src/renderer/editors/board-info/board-info-id.ts` (NEW)

A dependency-free module so `PageToolbar` and `register-editors` can reference the id without
importing the editor (avoids a cycle):

```typescript
/** Registry id of the Board Info editor (EPIC-045). Kept in its own tiny module so the
 *  switch widget can reference it without importing the editor implementation. */
export const BOARD_INFO_EDITOR_ID = "board-info";
```

### 2. Extend `downloadBoard` with an optional `installId` — `src/renderer/api/board-install.ts`

So the Board Info editor can mint an id, subscribe to `eBoardInstallProgress` filtered by it,
then drive the download. Minimal, backward-compatible change:

```typescript
export async function downloadBoard(
    entry: PublishedBoardInfo,
    targetParentDir: string,
    installId: string = newInstallId(),   // ← caller may supply its own for progress correlation
): Promise<string> {
    const root = fpJoin(targetParentDir, entry.id);
    if (await fs.exists(root)) { /* …unchanged… */ }
    // (remove the internal `const installId = newInstallId();` line — now a parameter)
    const tempZip = await api.downloadBoardArchive({
        installId, url: entry.archive.url, sha256: entry.archive.sha256, size: entry.archive.size,
    });
    /* …unchanged… */
}
```

(The same-root → `updateBoard(entry)` early-return is unreachable for US-864's install flow, which
targets a fresh `<dir>/<id>` — no change to `updateBoard`.)

### 3. Sync catalog-match helper — `src/renderer/api/published-boards.ts`

Add a **sync** counterpart to `useCatalogBoardsForFile` so the editor model (not a React
component) can compute its match tiles in `restore()`:

```typescript
/** Compatible catalog boards whose masks match the given file name (sync, non-reactive). */
catalogBoardsForFile(fileName: string): PublishedBoardInfo[] {
    const base = fpBasename(fileName);
    return (this.state.get().catalog?.boards ?? []).filter((b) => {
        if (!this.isCompatible(b.minAppVersion)) return false;
        return normalizeFileMasks(b.fileMasks).some((m) => matchesFileMask(base, m));
    });
}
```

### 4. `SwitchWidget` — inject the "+" segment (`src/renderer/editors/base/PageToolbar.tsx`)

Add reactive catalog + install subscriptions and the collapsed "+" segment. All hooks stay at
the top (React rules). New imports: `publishedBoards`, `boardInstallRegistry`,
`fpNormalizeForCompare`, `BOARD_INFO_EDITOR_ID`.

Inside `SwitchWidget`, after `boardMatches` is computed and before `merged` is finalized:

```typescript
// Catalog matches for this file (reactive): compatible + mask-match, minus the non-local
// content-host gate, minus catalog boards ALREADY offered by a trusted board segment.
const catalogAll = publishedBoards.useCatalogBoardsForFile(fileName ?? "");
const installed = boardInstallRegistry.useInstalled();
const trustedRoots = new Set(boardMatches.map((m) => fpNormalizeForCompare(m.boardRoot)));
const catalogMatches = catalogAll.filter((c) => {
    if (!local && c.editorKind !== "content-host") return false;   // same non-local gate
    const inst = installed.find((e) => e.id === c.id);
    // Offered already iff this catalog id is installed AND its root is a trusted match segment.
    // (Downloaded-but-UNregistered → inst exists but root not trusted → still advertised.)
    if (inst && trustedRoots.has(fpNormalizeForCompare(inst.root))) return false;
    return true;
});

const merged = [...options];
for (const b of boardMatches) if (!merged.includes(b.editorId)) merged.push(b.editorId);
const showPlus = catalogMatches.length > 0;
if (showPlus && !merged.includes(BOARD_INFO_EDITOR_ID)) merged.push(BOARD_INFO_EDITOR_ID);

if (merged.length < 2 || !merged.includes(model.editorId)) return null;
```

Labeling — the `board-info` segment always shows `"+"`:

```typescript
const items: ISegment[] = merged.map((id) => {
    if (id === BOARD_INFO_EDITOR_ID) {
        return { value: id, label: "+" };   // tooltip via a wrapping title if ISegment gains one
    }
    return { value: id, label: boardNameById.get(id) ?? editorRegistry.getById(id)?.name ?? id };
});
```

**Visibility note (design decision):** because the resolved design makes "+" a *real* editor id
(`board-info`), it participates in `merged` normally — appending it makes `merged.length >= 2`
for a `Text`-only file, so the existing guard already yields `Text | +`. The epic's earlier
"pseudo-segment excluded from guard math / relaxed guard" wording described the abandoned
modal-dialog draft; no guard relaxation is needed here. When `board-info` is active,
`model.findCompatibleEditors()` returns it (step 5), so `merged.includes(model.editorId)` holds.

`ISegment` has no `title`/tooltip field today; the "Install an editor for this file type…"
tooltip is **deferred** unless a `title` prop is added to `SegmentedControl` — see Concerns.

### 5. Board Info editor model — `src/renderer/editors/board-info/BoardInfoEditorModel.ts` (NEW)

`extends EditorModel<BoardInfoEditorState>`. State:

```typescript
export interface BoardInfoEditorState extends EditorStateBase {
    type: "boardInfoPage";
    editor: "board-info";
    title: string;
    /** Explicit openers (hub/toast/Properties, US-867). Absent for a "+"-opened install. */
    catalogId?: string;
    boardRoot?: string;
    /** Catalog match tiles (install mode), derived from the host file name + catalog. */
    matches: PublishedBoardInfo[];
    /** Install path parent dir (default `<userData>/data/boards`); user-changeable. */
    installDir?: string;
    /** Per-board install UI keyed by catalog id. */
    installUi: Record<string, {
        phase: "idle" | "downloading" | "downloaded" | "error";
        received?: number;
        total?: number;
        error?: string;
        root?: string;   // set once downloaded (the local install root)
    }>;
}
```

Model responsibilities (host machinery mirrors `BoardContentEditorModel`, minus the board):

- `readonly editorId = BOARD_INFO_EDITOR_ID;` · `noLanguage = true;`
  `showBackgroundOrnament = true;` · `skipSave = false;` · `getIcon` (a boards/puzzle glyph).
- **Host holder:** `_host`, `_hostStateUnsub`, `_pendingHost`; `CONTENT_HOST_TRAIT` with
  `extractContentHost()`; `override get contentHost()`; `adoptHost(host)`; `setPage` forwards to
  host; `override get modified()` → `_host?.modified ?? false`; `saveState()` →
  `_host?.io.saveState()`; `confirmRelease(closing)` → `_host?.confirmRelease(closing) ?? true`;
  `dispose()` disposes `_host` if held.
- **`switchFrom(oldEditor)` — tolerant:** if `oldEditor.traits.get(CONTENT_HOST_TRAIT)` →
  extract + `adoptHost`; else (host-less standalone open) do nothing. Copy `id` from the old
  editor for cache-file continuity when a host is transferred.
- **`findCompatibleEditors()`:** `const fileName = this.currentFileName();
  const builtin = editorRegistry.resolveId(fileName) ?? "monaco"; return [builtin,
  BOARD_INFO_EDITOR_ID];` where `currentFileName()` = `_host?.state.get().filePath ??
  _host?.state.get().title ?? this.title`.
- **`restore()`:** `await super.restore()`; ensure host if `_pendingHost` present (see Concern
  2); then `recomputeMatches()`. Also subscribe once to `ePublishedBoardsUpdated` (via
  `publishedBoards` — or re-run `recomputeMatches` when its state changes) so tiles refresh if
  the catalog updates while the screen is open.
- **`recomputeMatches()`:** `installDir ??= fpJoin(await api.getCommonFolder("userData"),
  "data", "boards")` (compute once, store); `matches = publishedBoards.catalogBoardsForFile(
  this.currentFileName())`; seed `installUi[id]` from install-registry/trust state
  (installed+trusted → not shown as installable, or shown as "Installed"; downloaded-not-trusted
  → phase `"downloaded"` with its root). Update state.
- **`download(entry)`:** mint `installId = crypto.randomUUID()`; set `installUi[entry.id] =
  { phase: "downloading", received: 0, total: entry.archive.size }`; subscribe to
  `eBoardInstallProgress` filtered by `installId` → update `received`/`total`; call
  `downloadBoard(entry, this.state.get().installDir!, installId)`; on success set phase
  `"downloaded"` + `root`; on throw set phase `"error"` + message; always unsubscribe.
- **`register(entry)`:** `const root = installUi[entry.id]?.root; if (!root) return;
  const ok = await showTrustBoardDialog(root); if (!ok) return;
  await boardTrust.trust(root); await customEditorRegistry.refresh();` then, if a file host is
  held, `await this.page?.switchMainEditor(boardEditorId(root));` (from "+"). (Standalone/hub
  navigation to the board is US-867.)
- **`deleteDownload(entry)`:** `const root = installUi[entry.id]?.root; if (root) { await
  fs.delete(root); await boardInstallRegistry.remove(entry.id); } recomputeMatches();`.
- **`changeInstallDir()`:** `const picked = await fs.showFolderDialog({ title: "Install
  location", defaultPath: this.state.get().installDir }); if (picked?.[0]) update state`.
- **Persistence:** `getRestoreData()` → base + `state: { catalogId?, boardRoot? }` (and,
  per Concern 2, optionally `data.host = this._host?.getDescriptor()`); `applyRestoreData` stashes
  `catalogId`/`boardRoot` (+ `_pendingHost = data.host`).

`getDefaultBoardInfoEditorState()` mirrors `getDefaultToolsetEditorState` (`id`, `title:
"Install editor"`, `modified: false`, `type`, `editor`, `matches: []`, `installUi: {}`).

### 6. Board Info editor view — `src/renderer/editors/board-info/BoardInfoEditorView.tsx` (NEW)

Pure render over `model.state.use(...)`. Layout (install mode):

- `<PageToolbar model={model} name="Install editor" />` (keeps the switch showing `Text | +`).
- An install-path row: `Input` (read-only-ish) bound to `installDir` + a **Browse…** `Button`
  → `model.changeInstallDir()`. Shown once above the tiles.
- One card per `matches` entry (single match → render the card directly, no tile chrome):
  - name, version, `description`, download size (human-readable from `archive.size`), file masks.
  - **idle:** **Download** `Button` → `model.download(entry)`.
  - **downloading:** `ProgressBar value={received} max={total}` + cancel (optional; calls
    `api.cancelBoardDownload` — deferred if not trivial).
  - **error:** inline error text + **Retry** `Button`.
  - **downloaded:** "Downloaded — not registered" with the local folder path, a hint line
    ("You can ask your AI agent to review this board's files before trusting it."), a **Register
    board** `Button` → `model.register(entry)`, and a **Delete download** `Button` →
    `model.deleteDownload(entry)`.
- No content-host rendering — the held host is invisible (this is a screen, not the file editor).

Rule 7: this editor is under `editors/`, not `ui/` chrome — compose UIKit primitives only; no
Emotion / `style=` on UIKit components. Use `Panel` for layout.

### 7. Module + registration

- `src/renderer/editors/board-info/index.tsx` (NEW) — mirror `toolset/index.tsx`:
  `boardInfoModule: EditorModule` (`createEditor` + `Component`) and a legacy `EditorModule`
  default export (`newEmptyEditorModel`/`newEditorModelFromState` gated on `type ===
  "boardInfoPage"`, calling `restore()`).
- `src/renderer/editors/register-editors.ts` (MODIFY) — add:

```typescript
editorRegistry.register({
    id: "board-info",
    name: "Board Info",
    hasContentHost: true,       // host-capable holder (lossless Text ↔ + ↔ board switches)
    accepts: () => -1,          // never a default open target — reached only via "+" / navigation
    loadModule: async () => {
        const { boardInfoModule } = await import("./board-info");
        return boardInfoModule;
    },
});
```

### 8. Persistence discriminator (restore)

`getRestoreData` pins `editorId: "board-info"`. Session restore rebuilds via the legacy module's
`newEditorModelFromState` (like toolset/board). See Concern 2 for host-descriptor handling.

## Files changed

| File | Change |
|------|--------|
| `src/renderer/editors/board-info/board-info-id.ts` | **NEW** — `BOARD_INFO_EDITOR_ID` constant |
| `src/renderer/editors/board-info/BoardInfoEditorModel.ts` | **NEW** — host-holder model + install-mode logic |
| `src/renderer/editors/board-info/BoardInfoEditorView.tsx` | **NEW** — install-mode UI (tiles, path, progress, register) |
| `src/renderer/editors/board-info/index.tsx` | **NEW** — `boardInfoModule` + legacy `EditorModule` default export |
| `src/renderer/editors/register-editors.ts` | **MODIFY** — register `board-info` (`hasContentHost: true`, `accepts: () => -1`) |
| `src/renderer/editors/base/PageToolbar.tsx` | **MODIFY** — `SwitchWidget`: catalog-match computation + "+" segment + label |
| `src/renderer/api/board-install.ts` | **MODIFY** — `downloadBoard(entry, dir, installId?)` optional param |
| `src/renderer/api/published-boards.ts` | **MODIFY** — add sync `catalogBoardsForFile(fileName)` |
| `src/shared/types.ts` | **MODIFY** — add `"boardInfoPage"` to `EditorType` |
| `src/renderer/api/types/common.d.ts` (+ `assets/editor-types/common.d.ts` mirror) | **MODIFY** — add `"board-info"` to `EditorView` |

### Files that need NO changes (verified)

- `src/renderer/api/pages/PageModel.ts` — `switchMainEditor` already handles all four Board Info
  directions (see Background table); no change.
- `src/renderer/api/board-install-registry.ts`, `board-trust.ts`, `custom-editor-registry.ts`,
  `TrustBoardDialog.tsx` — consumed as-is.
- `src/renderer/api/app.ts` — `publishedBoards.load()` + `boardInstallRegistry.load()` already
  warmed at startup.
- `src/ipc/*` — download/cancel endpoints + progress event already wired (US-863).

## Concerns / Open questions

**All resolved (2026-07-17):** (1) tooltip deferred → tracked as **US-871**; (2) **(A)** persist
the host descriptor (lossless restart) + auto-switch to the natural built-in when no matches
remain; (3) locally-authored same-id trusted board not suppressing "+" accepted as-is; (4) Cancel
button **included**.

1. **"+" tooltip.** `ISegment` has no `title`/tooltip field, so the epic's "Install an editor for
   this file type…" tooltip can't be attached without extending `SegmentedControl`.
   **Proposed (recommended):** ship US-864 with the bare `"+"` label and **defer** the tooltip
   (add a `title?` to `ISegment` in a small follow-up, or in US-870 when the hub reuses the
   control). Low value, non-blocking. — *Needs a yes/no.*

2. **Restart persistence of a "+"-opened install screen (host round-trip).** A Board Info page
   opened from "+" holds the file's content host but has no `catalogId`/`boardRoot` in state. The
   epic says a host round-trip across restart is "not required" (reopening in install mode is
   acceptable). Two options:
   - **(A) Persist the host descriptor** (`data.host = _host?.getDescriptor()`, like
     `BoardContentEditorModel`) and rebuild it in `restore()`; if `recomputeMatches()` then finds
     **no** matches (board got installed elsewhere / catalog changed), auto-switch the page to the
     file's natural built-in editor. **Lossless — the user's file returns.** *(Recommended.)*
   - **(B) Persist nothing** (catalogId/boardRoot only); a "+"-opened page restores empty →
     the tab loses its file association. Simpler, but drops the open file on restart.

   **Proposed:** **(A)** — it's a few extra lines reusing the `BoardContentEditorModel` host-descriptor
   pattern and avoids surprising data loss. — *Needs a decision (A or B).*

3. **Multi-match subtraction correspondence.** "Already offered by a trusted board with the same
   id" is resolved via the install registry (`installed.find(e => e.id === c.id)` → root ∈
   trusted match roots). A board **trusted but not catalog-installed** (locally authored, same
   masks) does **not** carry an install-registry id, so it won't suppress a catalog "+" of the
   same id — the user could see both its segment and "+". This is an acceptable edge (distinct
   provenance); documented, not handled. — *Confirm acceptable.*

6. **Delete-download left the folder (directory vs file) — RESOLVED (2026-07-17).** `fs.delete()`
   only unlinks a *file*, so deleting the board *directory* threw; the swallowed error left the
   folder on disk while the registry entry was removed, and a re-download then hit "Target folder
   already exists" with no matching registry entry. Fixes: `deleteDownload` now uses
   `fs.removeDir(root, true)` (recursive) and keeps the registry entry if removal fails;
   `download` detects a leftover/untracked target folder and shows a **Delete & continue / Cancel**
   confirmation before removing it and proceeding; and `board-install.ts`'s invalid-manifest
   cleanup was switched from `fs.delete` to `fs.removeDir(root, true)` (same latent bug).

5. **Stale download tile after external folder deletion — RESOLVED (2026-07-17).** The
   "Downloaded — not registered" tile is derived from `boardInstallRegistry` (id → root, untrusted).
   That registry self-heals only in `boardInstallRegistry.load()` (prunes entries whose folder no
   longer holds a manifest), which fires at startup + on record/remove — so deleting a downloaded
   board's folder *externally* (Explorer/agent, not the tile's own **Delete download**) left the
   tile stale. Fix: `BoardInfoEditorModel.reconcile()` (= `load()` + recompute) runs on open, on
   catalog change, and on **window refocus** (the view). There is no filesystem watcher, so an
   externally-deleted board is detected at the next of those moments; once reconciled it reverts to
   the installable (Download) state — a missing board is "not installed" per the US-863 design, not
   a distinct "missing" message.

4. **Cancel button.** `api.cancelBoardDownload(installId)` exists. Wiring a Cancel into the
   downloading state is straightforward but optional for US-864. **Proposed:** include it (small,
   and the epic acceptance mentions "a mid-download cancel leaves nothing installed"). — *Confirm
   include.*

## Acceptance criteria

- With no drawio board installed, opening a `.drawio` file shows `Text | +` in the switch.
- Clicking **+** switches the page to the Board Info screen (no reload, no confirm) showing
  DrawIO Viewer v1.0.0 info and an install path defaulting to `<userData>/data/boards`;
  switching back to **Text** before installing loses no content.
- **Download** shows byte progress and trusts nothing — the downloaded board has no editor
  association and does not appear in the switch as a real editor; a sha256 mismatch / network
  failure shows a clear inline error and leaves nothing installed; (if wired) a mid-download
  cancel leaves nothing installed.
- After download the screen shows "Downloaded — not registered" with the folder path and the
  review hint; **Register board** shows the trust dialog, and only on accept does the page switch
  to the DrawIO editor with the switch now reading `Text | DrawIO`.
- When several catalog boards match the file mask, the screen lists them all as tiles, each
  installable independently; **+** remains in the switch as long as any matching catalog board is
  not yet offered by a trusted board — including when another matching board is already installed.
- The installed board behaves identically to a locally-created trusted board (content-host
  round-trip, Ctrl+S, Remove).
- A non-local file (https/archive) only ever advertises **content-host** catalog boards via "+".
- `npx tsc --noEmit` and `npx eslint` are clean for all touched/new files.

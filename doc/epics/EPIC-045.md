# EPIC-045: Published Boards Catalog — download & install boards from GitHub

## Status

**Status:** Planned
**Created:** 2026-07-16

## Overview

Let Persephone users discover and install boards (custom editors/viewers) published by the project.
A public GitHub repository (`https://github.com/andriy-viyatyk/persephone-boards`) is the catalog
source: its `main` branch carries a `boards-manifest.json` describing every published board, and each
board version is a ZIP asset on a per-board GitHub Release. Persephone periodically fetches the
catalog (same cadence pattern as the app-version check), advertises matching boards in the editor
switch (a "+" entry when an uninstalled board matches the open file's mask), and installs a board by
downloading one ZIP with byte progress, verifying its sha256, extracting it locally, and trusting +
registering it — after which the normal custom-editor machinery takes over.

## Goals

- A user opening a `.drawio` file with no drawio board installed sees "Text" and "+" in the editor
  switch; clicking "+" shows the published DrawIO Viewer's info and installs it in a few clicks.
- Installed boards keep working exactly like locally-authored boards (trust registry, custom-editor
  registry, sidebar panels) — no parallel machinery.
- Installed boards get update notifications when the catalog advertises a newer version.
- Publishing a board from `C:\projects\persephone-boards` is one script run.

## Design

### Source repository & catalog format

- Repo: `andriy-viyatyk/persephone-boards`. `main` = published, `develop` = working branch.
- Catalog file at repo root, fetched raw (no GitHub API, no rate-limit concerns):
  `https://raw.githubusercontent.com/andriy-viyatyk/persephone-boards/main/boards-manifest.json`
- Each published board version is a GitHub **Release** tagged `<board-id>-v<version>`
  (e.g. `drawio-viewer-v1.0.0`) with a single ZIP asset. Release-asset downloads are plain
  unauthenticated HTTPS (`https://github.com/<owner>/<repo>/releases/download/<tag>/<file>.zip`),
  not API-rate-limited, up to 2 GB per asset.

Catalog schema (`boards-manifest.json`):

```json
{
  "schemaVersion": 1,
  "boards": [
    {
      "id": "drawio-viewer",
      "version": "1.0.0",
      "name": "DrawIO Viewer",
      "description": "Read-only viewer for diagrams.net / draw.io (.drawio) diagrams.",
      "fileMasks": ["*.drawio"],
      "editorName": "DrawIO",
      "editorKind": "content-host",
      "standalone": false,
      "archive": {
        "url": "https://github.com/andriy-viyatyk/persephone-boards/releases/download/drawio-viewer-v1.0.0/drawio-viewer.zip",
        "size": 1234567,
        "sha256": "<hex>"
      }
    }
  ]
}
```

Boards live under a `boards/` subfolder in the repo (keeps the repo root small: `boards/`,
`scripts/`, `boards-manifest.json`, `README.md`). `id` = the board's folder name under `boards/`
and the default install folder name.
`fileMasks`/`editorName`/`editorKind` are duplicated from the board's own `board-manifest.json`
so the client can advertise the board **without** downloading it (the "+" switch entry and the
catalog list need them). The publish script copies them from the board manifest — they can never
drift by hand.

The board's own `board-manifest.json` gains an optional `version?: string` field (semver string,
metadata) — the installed-version side of the update comparison.

### Board usage type — `standalone` flag + derived groups

Not every board makes sense to pin or open empty (drawio-viewer without a file is useless; the
todo board can start empty and save a new file). Rather than a `boardType` enum that would
duplicate/contradict `fileMasks`, the manifest gains **one bit** and the groups are derived:

- `standalone?: boolean` in `board-manifest.json`. Defaults: `true` when the board has no
  `fileMasks` (tools/dashboards are inherently standalone — existing boards stay pinnable),
  `false` when it has `fileMasks` (a file-bound board must opt in).
- Derived groups for UI grouping: **File viewer** (masks, not standalone — e.g. drawio-viewer),
  **File editor** (masks + `standalone: true` — e.g. todo), **Tool / App** (no masks).
- Rules: **pin** actions (sidebar, hub, `pinned-items`) and the "+" new-page dropdown offer only
  standalone boards; the editor switch / "+" catalog entry remain driven by masks. Direct open
  of a non-standalone board (Boards tree, development) stays allowed — it shows its empty state.
- The catalog entry duplicates `standalone` (publish script copies it, like the other
  association fields) so the hub's Search tab can group boards before install.

### Publish workflow (persephone-boards repo)

One script — `scripts/publish-board.mjs <board-id>` (Node, uses the `gh` CLI):

1. Reads `boards/<board-id>/board-manifest.json`, requires a `version` bumped vs the catalog entry.
2. Zips the board folder **contents** (entries rooted at top level, no wrapper folder), excluding
   dev junk (`ui.log`, `.git`, `node_modules`).
3. `gh release create <board-id>-v<version> <board-id>.zip` (per-board tags keep releases
   independent; old versions stay downloadable for rollback).
4. Computes the asset's `size` + `sha256` and rewrites that board's entry in `boards-manifest.json`
   (id/version/name/description/fileMasks/editorName/editorKind/archive).
5. Prepends the same version entry (`{ version, date, notes?, archive }`) to
   `boards/<board-id>/versions-manifest.json` — the per-board version history (see
   "Version history & rollback"). Excluded from the release ZIP (catalog metadata, not board
   content).
6. Commits the manifest changes. Push/merge `main` is what makes it live — a release without a
   manifest entry is invisible; the app never enumerates releases via the GitHub API.

### Client architecture (persephone app)

Follows the version-check + download-progress patterns already in the codebase:

- **Catalog service (main):** `src/main/published-boards-service.ts` — mirror of
  `version-service.ts`. `net.fetch` the raw manifest; 24h gate via `electronStore` timestamp
  (`STORE_KEYS` pattern); `force` bypass; cache the last-good catalog in `electronStore` so the
  UI works offline; broadcast `EventEndpoint.ePublishedBoardsUpdated` via `openWindows.send` on
  change. Kicked from `main-setup.ts` `app.on("ready")` alongside `checkForUpdates` (one
  `setTimeout`, ~5s).
- **Download + verify (main):** same service — `net.fetch` the ZIP, read `response.body` stream
  chunk-by-chunk, feed each chunk to `createHash("sha256")` (node:crypto) **and** a write stream to
  a temp file; broadcast throttled (500ms, like `download-service.ts`) progress events
  `{ installId, receivedBytes, totalBytes }`; reject on digest mismatch (delete temp file).
- **Install (renderer):** new `src/renderer/api/board-install.ts` — orchestrates: call the download
  endpoint → extract the verified temp ZIP via `archiveService` (`listEntries` + `readFile` loop +
  `app.fs` writes; there is no extract-to-dir today, we add the loop here) with **zip-slip
  protection** (reject entries resolving outside the target dir) → validate `readBoardManifest`
  succeeds → `boardTrust.trust(root)` → record in an install registry → done (the reactive
  `customEditorRegistry` picks the trusted board up automatically; the switch re-renders).
- **Install registry:** `installedBoards.json` in the data folder (`fs.saveDataFile` pattern, like
  `trustedBoards.txt`): `[{ id, root, version, installedAt }]`. Maps catalog ids to installed
  roots for update checks and prevents re-advertising an installed board in the "+" entry.
- **Default install folder:** `<userData>/data/boards/<id>`
  (`fpJoin(await api.getCommonFolder("userData"), "data", "boards")`), user-changeable in the
  install dialog. Note: a board there appears in the global **Custom Boards & Editors** sidebar
  tab (unfiltered trust registry) but not the Explorer-scoped Boards panel — expected.

### Install UX — the "+" switch entry

`SwitchWidget` (`src/renderer/editors/base/PageToolbar.tsx`) already merges built-in candidates
with trusted-board matches. Additions:

- Compute catalog matches for the current file name (masks from the cached catalog), minus boards
  already installed (install registry) or already offered by a trusted board with the same id.
  Apply the same non-local filter as trusted boards (non-local file → `content-host` only).
- If any remain, append a **pseudo segment** `"+"` (tooltip "Install an editor for this file
  type…"). Pseudo segments are excluded from the `merged`/current-id guard math, and the
  visibility rule relaxes to: show the switch when `merged.length >= 2` **or** a pseudo entry
  exists (so a plain "Text"-only file still shows `Text | +`).
- `onChange` intercepts the pseudo value **before** `onSwitch` (it must never reach
  `switchMainEditor`) and opens the install dialog.
- **Install dialog** (`src/renderer/ui/dialogs/InstallBoardDialog.tsx`): board name, version,
  description, download size; install-path input (Browse…, default `<userData>/data/boards`);
  the trust/RCE warning (same wording as `TrustBoardDialog` — installing = trusting); an
  **Install** button that turns into a byte-progress bar (driven by the progress events, rendered
  in dialog state — Mneme-style, not the indeterminate overlay); error text on failure (hash
  mismatch, network, extract). On success the dialog closes and the page auto-switches to the new
  editor via `page.switchMainEditor(boardEditorId(root))`.

### Updates

- On each catalog refresh, compare catalog versions to the install registry (semver compare —
  reuse `compareVersions` from `version-service.ts`). Toast once per board+version
  (`ui.notify(..., "info")`, click → opens the Board properties dialog; `lastNotified` map in
  `electronStore`, same idea as the app-update toast).
- Update action re-runs the install flow into the **existing** root: download + verify → extract
  to a sibling temp folder → swap (rename old away, rename new in, delete old) so a failed
  download never destroys a working board. Trust and pins are untouched (same root).
- Surfacing: the **Custom Boards & Editors** sidebar tab (`TrustedBoardsList.tsx`) gains an
  "Update available" badge + context-menu "Update" for registry-installed boards, and an
  **Available** section listing not-yet-installed catalog boards with an Install action (same
  dialog) — the browse-the-catalog entry point that doesn't require opening a matching file.

### Version history & rollback

The main catalog stays small — it carries only the **latest** version of each board. Full history
lives in a per-board `boards/<id>/versions-manifest.json` in the repo, fetched raw **on demand**
(when the properties dialog opens), never during the periodic check:

```json
{
  "schemaVersion": 1,
  "id": "drawio-viewer",
  "versions": [
    { "version": "1.0.1", "date": "2026-07-20", "notes": "Fix …", "archive": { "url": "…", "size": 1, "sha256": "…" } },
    { "version": "1.0.0", "date": "2026-07-16", "archive": { "url": "…", "size": 1, "sha256": "…" } }
  ]
}
```

Newest first; written only by the publish script. Because release assets are never deleted,
installing any listed version is the **same flow as an update** — download + verify + temp-extract
+ swap — just pointed at an older asset. The install registry records whichever version is actually
installed, so "update available" naturally reappears after a rollback (expected — the user chose
the older version knowingly, and the once-per-version toast gate prevents repeat nagging).

### Board properties dialog

`BoardToolbar` (`src/renderer/editors/board/BoardToolbar.tsx`) gains a **Properties** button
opening `showBoardPropertiesDialog(root)`:

- Always (any board, including locally-authored): name, description, author, root path, editor
  association (masks/name/kind), trust state.
- For catalog-installed boards (install-registry match): installed version, source repository,
  and a **Versions** list fetched on demand from `versions-manifest.json` — each entry with an
  **Install** action; the current version is marked, newer-than-installed is highlighted as the
  update.
- Installing any version routes through the same swap flow (busy-board guard, local-edits
  warning).
- The "update available" toast click opens this dialog.

### Agent API — register / unregister / rename boards

Today an agent cannot register or rename a board for the user: `boardTrust` is deliberately not
exposed to scripts (a script must never self-trust), so "rename this board" requires the user to
manually re-trust the new path. The fix keeps the security invariant — **the API requests, the
user's dialog click grants** (same model as the MCP-initiated toolset registration dialog):

- `app.boards.registerBoard(boardRoot): Promise<boolean>` — validates `isBoardFolder`; no-op
  `true` if already trusted; otherwise shows `showTrustBoardDialog(boardRoot)` and, on accept,
  `boardTrust.trust(boardRoot)`. Returns whether the board ended up trusted. The script can
  *never* trust without the user clicking the dialog.
- `app.boards.unregisterBoard(boardRoot): Promise<void>` — `boardTrust.untrust` + pin removal
  (mirrors the sidebar "Remove"). No dialog: untrusting only reduces privilege.
- `app.boards.renameBoard(boardRoot, newName): Promise<string>` — refuses if the board is busy;
  renames the folder; transfers trust old→new **without a dialog** (same already-trusted content
  at a new path — no privilege gain); updates pins (`board:<root>`) and, for catalog-installed
  boards, the install-registry root. Returns the new root. Solves "agent, rename my board" as a
  single action with zero user clicks.

The user-consent flow means one click total for the user ("Trust board?") instead of
find-the-board / open-it / figure-out-registration.

### Agent API — catalog operations

The same request-vs-grant model extends to the catalog, so an agent can drive the whole
lifecycle ("find me a drawio viewer and install it") with at most one user click per
privilege-granting step:

- `app.boards.searchPublished(query?)` — the cached catalog (name/description/mask match),
  each entry annotated with installed state (root, installed version, update available).
  Read-only, no dialog.
- `app.boards.getPublishedVersions(id)` — the board's `versions-manifest.json`. Read-only,
  no dialog.
- `app.boards.installPublished(id, opts?: { dir?, version? })` — opens the **Install dialog**
  prefilled (board info, path, optional specific version); the user's Install click is the
  consent (install = trust, as everywhere). Resolves the installed root, or `undefined` on
  cancel. Version change (update or rollback) is the same call with `version` on an
  already-installed board — the dialog then runs the swap flow with the local-edits warning.
- `app.boards.uninstallBoard(rootOrId)` — shows the existing delete confirmation
  ("permanently removes its folder"), then folder delete + untrust + unpin + install-registry
  removal. Dialog required because it deletes files, not because of privilege.
- `app.boards.checkPublishedUpdates(force?)` — trigger a catalog refresh; returns boards with
  updates available. No dialog.

### Tools & Editors hub page ("Search boards")

A full-page counterpart to the AppBar **Tools & Editors** panel — the browse-the-catalog home
that doesn't require opening a matching file. The AppBar panel stays exactly as it is and gains
an **"Open in new tab"** header button (reuse the standardized `SideBarPanelHeader` show-main
zone-button if the panel uses it; otherwise a small header icon button) opening a singleton hub
page (well-known-page pattern).

Hub layout: content tabs **Built-in** / **Registered boards** / **Search boards** / **Tools**,
plus a **Pinned** rail on the right (same pin model as the panel):

- **Built-in** — the creatable-items registry (`tools-editors-registry.ts`), with pin/open
  actions (page-sized version of the panel's Editors tab).
- **Registered boards** — the trusted-boards registry (multi-root `BoardsTree`, as
  `TrustedBoardsList`), plus installed-version / update badges from the install registry.
- **Search boards** — the published catalog: search box (name/description/mask), board cards
  (name, description, version, masks, size, installed state), actions **Install…** /
  **Update…** / **Properties** routing to the same dialogs as everywhere else.
- **Tools** — registered toolsets (`ToolsTree`, as `TrustedToolsList`).

## Linked Tasks

| Task | Title | Status |
|------|-------|--------|
| US-862 | Catalog service (main): manifest fetch, cache, periodic check, IPC | Planned |
| US-863 | Install engine: download + sha256 verify + extract + trust + install registry | Planned |
| US-864 | "+" editor-switch entry + Install Board dialog with progress | Planned |
| US-865 | Updates (version compare, toast, safe re-install) + catalog in the sidebar | Planned |
| US-866 | persephone-boards repo: initial commit + boards-manifest.json + publish script | Planned |
| US-867 | Board properties dialog + version history & rollback | Planned |
| US-868 | Agent API: app.boards.registerBoard / unregisterBoard / renameBoard | Planned |
| US-869 | Agent API: catalog — searchPublished / installPublished / versions / uninstall | Planned |
| US-870 | Tools & Editors hub page (Built-in / Registered boards / Search boards / Tools + Pinned) | Planned |

## Task details

### US-862 — Catalog service (main)

- `src/ipc/api-param-types.ts`: add `PublishedBoardInfo`, `PublishedBoardsCatalog`,
  `PublishedBoardsResult` types (catalog schema above).
- `src/main/published-boards-service.ts` (new): `getPublishedBoards(force?)` — electronStore-gated
  `net.fetch` of the raw manifest URL; parse/validate (`schemaVersion`, drop malformed entries);
  cache last-good catalog + fetch timestamp in `electronStore`; broadcast
  `ePublishedBoardsUpdated` when content changed.
- IPC (4-file recipe): `Endpoint.getPublishedBoards` in `src/ipc/api-types.ts` (+ `Api` type),
  renderer call in `src/ipc/renderer/api.ts`, handler + `bindEndpoint` in
  `src/ipc/main/controller.ts`. Event: `EventEndpoint.ePublishedBoardsUpdated` in `api-types.ts`
  (+ `EventApi`), field in `src/ipc/renderer/renderer-events.ts`.
- `src/main/main-setup.ts`: kick the periodic check in the existing startup `setTimeout`.
- `src/renderer/api/published-boards.ts` (new): renderer-side reactive model (`TGlobalState`)
  holding the catalog; subscribes to the event; `refresh(force)`; hooks
  `useCatalog()` / `useCatalogBoardsForFile(fileName)` (mask match via `matchesFileMask`).
- `src/renderer/editors/board/board-manifest.ts`: add `version?: string` and
  `standalone?: boolean` to `BoardManifest`, plus a resolver
  `isBoardStandalone(manifest): boolean` implementing the defaults (no masks → true,
  masks → false unless opted in) and a derived-group helper for UI grouping.

### US-863 — Install engine

- Main (`published-boards-service.ts` or `src/main/board-download-service.ts`):
  `downloadBoardArchive({ url, sha256, size })` → streams to a temp file under the OS temp dir,
  incremental sha256, throttled `eBoardInstallProgress { installId, receivedBytes, totalBytes }`
  events, digest check, returns the temp path. Cancel endpoint. IPC via the 4-file recipe.
- Renderer `src/renderer/api/board-install.ts` (new):
  `installBoard(catalogEntry, targetParentDir): Promise<string /* root */>` —
  download → extract (archive-service loop, zip-slip guard, create dirs, write files via `app.fs`)
  into `<targetParentDir>/<id>` (error if the folder exists and is not an update) → validate
  `readBoardManifest` non-null → `boardTrust.trust(root)` → append to install registry → return
  root. Also `updateBoard(entry)` (temp-extract + folder swap, US-865 wires the UI).
- Install registry module `src/renderer/api/board-install-registry.ts` (new, mirrors
  `board-trust.ts` structure): `installedBoards.json` via `fs.saveDataFile`/`getDataFile`;
  reactive list; `record(entry)`, `remove(id)`, `getByRoot`, `useInstalled()`.
- Un-install stays the existing sidebar "Remove"/"Delete Board" actions; "Delete Board" on a
  registry-installed board also removes its registry entry.

### US-864 — "+" switch entry + Install dialog

- `src/renderer/editors/base/PageToolbar.tsx` `SwitchWidget`: catalog-match computation, pseudo
  segment, relaxed visibility guard, `onChange` interception (see Design). `ISegment` supports
  `icon`/`label` — use a plain `+` label.
- `src/renderer/ui/dialogs/InstallBoardDialog.tsx` (new):
  `showInstallBoardDialog(entry: PublishedBoardInfo, opts?: { targetRoot?: string })` — info,
  path input + Browse (`fs.showFolderDialog`), RCE warning block (wording aligned with
  `TrustBoardDialog.tsx`), Install → progress bar (subscribe `eBoardInstallProgress`) → success
  (resolve installed root) / inline error + retry.
- Auto-switch after install when invoked from the switch: caller does
  `page.switchMainEditor(boardEditorId(root))`.

### US-865 — Updates + sidebar catalog

- `src/renderer/api/published-boards.ts`: derive `updatesAvailable` (catalog × install registry,
  `compareVersions`); toast once per board+version on catalog refresh (electronStore-persisted
  `lastNotified` map lives main-side next to the catalog cache, or in the registry file —
  decide at implementation).
- `src/renderer/ui/sidebar/TrustedBoardsList.tsx`: "Update available" badge on installed boards;
  context-menu **Update** → `updateBoard` (temp-extract + swap); an **Available** section
  (catalog minus installed) with per-board **Install…** opening the same dialog.
- `src/renderer/api/board-install.ts`: `updateBoard(entry)` implementation (swap semantics,
  busy-board guard — refuse to swap a board that is currently busy/running).

### US-866 — persephone-boards repo publishing

Work in `C:\projects\persephone-boards` (separate repo):

- Restructure the local folder first: create `boards/` and move each board into it
  (`boards/drawio-viewer/`, …) so the repo root stays small.
- Initial commit: `boards/drawio-viewer/` (with `version: "1.0.0"` added to its
  `board-manifest.json`; `lib/LICENSE` + `lib/VERSION.txt` already present — attribution
  requirement satisfied), `boards-manifest.json`, `scripts/publish-board.mjs`, `README.md`
  (what the repo is, how to publish), `.gitignore` (`ui.log`, `node_modules`, `*.zip`).
- `scripts/publish-board.mjs`: zip (exclusions, incl. `versions-manifest.json`) →
  `gh release create` → sha256/size → `boards-manifest.json` entry rewrite → prepend entry to
  `boards/<id>/versions-manifest.json` → commit. Node-only + `gh` CLI; no npm dependencies if
  feasible (use `zip` via jszip or spawn `tar`/PowerShell `Compress-Archive`).
- Publish drawio-viewer v1.0.0 end-to-end as the acceptance test of the whole epic.
- Decide what else from the folder is published (`todo/` board? `_test/`, `_lib_stash` are not).
  If `todo/` is published, its `board-manifest.json` declares `standalone: true` (file editor
  that can start empty); drawio-viewer relies on the default (`false` — file viewer).

### US-867 — Board properties dialog + version history & rollback

- `src/main/published-boards-service.ts`: `getBoardVersions(id)` — on-demand raw fetch of
  `boards/<id>/versions-manifest.json` (no cache gate; it's a small file), validate, return.
  IPC endpoint via the 4-file recipe (`Endpoint.getBoardVersions`).
- `src/renderer/ui/dialogs/BoardPropertiesDialog.tsx` (new): `showBoardPropertiesDialog(root)` —
  see Design. Versions section with loading/error states; **Install** per entry → confirm
  (local-edits warning) → same download/verify/swap flow as update.
- `src/renderer/api/board-install.ts`: generalize `updateBoard` into
  `installVersion(root, archive, version)` (US-865's update = install the catalog-latest);
  install registry updated with the actually-installed version.
- `src/renderer/editors/board/BoardToolbar.tsx`: **Properties** button.
- US-865's update-toast click target is this dialog.

### US-868 — Agent API: register / unregister / rename boards

- `src/renderer/api/boards.ts`: implement `registerBoard` / `unregisterBoard` / `renameBoard`
  (see Design). `renameBoard`: busy-board guard (`busy-boards.ts`), `app.fs` folder rename,
  `boardTrust.untrust(old)` + `boardTrust.trust(new)` (direct registry transfer, no dialog),
  pin update via `pinned-items.ts`, install-registry root update (if US-863 registry entry
  exists), and if the board is open in a page — handle or document the stale-root page state
  (simplest: navigate the open page to the new root).
- `src/renderer/api/types/boards.d.ts` (`IBoards`): add the three methods with docs stating
  registerBoard shows a consent dialog and may return `false`.
- `assets/mcp-res-boards.md`: document the new lifecycle calls in the agent-facing guide
  (register/rename flows; "the user sees a trust dialog" expectation).
- No new MCP tool needed — agents reach it via `execute_script`.

### US-869 — Agent API: catalog operations

Depends on US-862 (catalog), US-863 (install engine), US-864 (install dialog), US-867
(versions). Implemented last.

- `src/renderer/api/boards.ts`: `searchPublished`, `getPublishedVersions`,
  `installPublished` (opens `showInstallBoardDialog` prefilled; `version` opt routes to the
  swap flow), `uninstallBoard` (existing delete-confirm wording from
  `BoardsSecondaryView`'s "Delete Board"), `checkPublishedUpdates` (delegates to the
  catalog service with `force`).
- `src/renderer/api/types/boards.d.ts` (`IBoards`): the five methods, with docs stating which
  calls show a user dialog and what cancel returns.
- `assets/mcp-res-boards.md`: agent-facing "published boards" section — discover → install →
  update/rollback → uninstall flows and the one-click-consent expectations.
- No new MCP tools — `execute_script` reaches everything.

### US-870 — Tools & Editors hub page

Depends on US-862 (catalog), US-864 (install dialog), US-865 (update actions), US-867
(properties dialog). Investigate `ToolsEditorsPanel.tsx` first — the hub should share its data
sources, not duplicate them.

- New editor `src/renderer/editors/tools-hub/` (model + view; registered in
  `register-editors.ts`; singleton page via the well-known-pages pattern,
  `src/renderer/api/pages/well-known-pages.ts`).
- View: content tab strip (Built-in / Registered boards / Search boards / Tools) + right
  Pinned rail — content per Design, reusing `tools-editors-registry.ts`, `BoardsTree`,
  `ToolsTree`, `pinned-items.ts`, and the published-boards renderer model (US-862).
- `standalone` gating: pin actions (here, `TrustedBoardsList.tsx` renderTrailing, and the "+"
  new-page dropdown fed by `tools-editors-registry.ts`) offered only for standalone boards;
  board lists grouped by the derived type (File viewer / File editor / Tool).
- "Search boards" tab: filter box over the cached catalog; per-board card with Install /
  Update / Properties actions (existing dialogs); a "Refresh catalog" action calling the
  force check.
- `src/renderer/ui/sidebar/ToolsEditorsPanel.tsx`: "Open in new tab" header button →
  open/activate the hub page (persist active tab between panel and page is NOT required).

## Concerns / Open questions

1. **Install UX form — dialog vs. full-page editor.** The original idea describes "+" opening an
   editor-like screen. This design uses a **modal install dialog** instead: far less machinery (a
   pseudo editor id would have to be special-cased through `switchMainEditor`, restore/persist,
   `findCompatibleEditors`, etc.), and the post-install auto-switch gives the same "screen changes
   to the new editor" outcome. **Needs user confirmation.**
2. **Install = trust.** The install dialog carries the RCE warning and Install implies
   `boardTrust.trust()` (one consent, like `createBoard`'s provenance-based auto-trust). The
   alternative — a second Trust dialog after install — is strictly more clicks for the same
   consent. Recommended: install = trust.
3. **Updates replace code the user may have edited locally.** The swap overwrites local
   modifications to an installed board. Mitigation options: warn always, or detect modification
   (store the release sha256 per file at install — heavier). Recommendation: plain warning in the
   update confirm ("local changes to this board will be lost").
4. **Memory during extraction:** `archive-service` reads the whole ZIP into memory (renderer).
   Fine for boards in the single-to-tens-of-MB range (drawio-viewer ZIP ≈ 1–2 MB). A future
   very large board (pdf.js) may want a main-side streaming extract — out of scope here, the
   archive path in the manifest doesn't change.
5. **Catalog trust model.** The catalog is single-source (the project's own repo) and the sha256
   pins each release asset. If third-party authors are ever admitted, signing/review policy needs
   its own epic.
6. **`todo/` board publication** — user decision at US-866 time.
7. **Possible overlap:** US-865's "Available" section in the sidebar Custom Boards & Editors tab
   vs. US-870's hub "Search boards" tab both list not-yet-installed catalog boards. Option: drop
   the sidebar Available section (keep the sidebar to installed/trusted boards + update badges)
   and make the hub the only catalog-browsing surface. Decide at implementation.

## Acceptance criteria

- With no drawio board installed, opening a `.drawio` file shows `Text | +` in the switch; "+"
  opens the install dialog showing DrawIO Viewer v1.0.0 info and a path defaulting to
  `<userData>/data/boards`; Install shows byte progress, then the page switches to the DrawIO
  editor and the switch shows `Text | DrawIO`.
- The installed board appears in the Custom Boards & Editors tab and behaves identically to a
  locally-created trusted board (content-host round-trip, Ctrl+S, Remove).
- A tampered/corrupt download (sha256 mismatch) fails with a clear error and leaves nothing
  installed; a mid-download cancel leaves nothing installed.
- Re-publishing drawio-viewer as v1.0.1 produces an update toast within one catalog cycle (or on
  force refresh); Update swaps the folder without losing trust/pins; a busy board refuses to swap.
- The board toolbar's Properties button shows board info for any board; for a catalog-installed
  board it lists all published versions, and installing an older one rolls the board back (same
  safety as update) with the registry reflecting the installed version.
- An agent (via `execute_script`) can register a board with `app.boards.registerBoard` — the user
  sees exactly one trust dialog and nothing else; declining returns `false` and leaves the board
  untrusted. `app.boards.renameBoard` renames a trusted board with zero user interaction, and the
  board stays trusted, pinned, and (if catalog-installed) update-checkable at the new path.
- An agent can run the full catalog lifecycle: `searchPublished("drawio")` finds the viewer,
  `installPublished(id)` installs it after the user's single Install click,
  `installPublished(id, { version })` rolls it back/forward, and `uninstallBoard(id)` removes it
  after the delete confirmation — with no other user interaction at any step.
- The AppBar Tools & Editors panel's "Open in new tab" button opens the hub page; its "Search
  boards" tab lists/filters the catalog and can install a board without any matching file being
  open; the other tabs mirror the panel's content plus the Pinned rail.
- Catalog fetch failures are silent (cached catalog keeps working; no error toasts on offline
  startup).
- `boards-manifest.json` in the repo is generated only by the publish script and matches the
  released assets (id/version/sha256/size).

## Notes

### 2026-07-16
- Design settled with the user in conversation: GitHub repo as catalog + per-board release ZIP
  assets (chosen over whole-repo ZIP download — repo will grow large — and over per-file raw
  downloads — file-heavy boards like a future pdf.js viewer make per-file chatty).
- drawio LICENSE/VERSION attribution already present in `drawio-viewer/lib/` — publishing it is
  license-clean (Apache-2.0).

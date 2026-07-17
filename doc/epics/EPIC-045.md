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
switch (a "+" entry when an uninstalled board matches the open file's mask), and installs a board in
two consented steps — **Download** (one ZIP with byte progress, sha256-verified, extracted locally;
trusts nothing) and **Register** (the standard trust dialog) — after which the normal custom-editor
machinery takes over.

## Goals

- A user opening a `.drawio` file with no drawio board installed sees "Text" and "+" in the editor
  switch; clicking "+" shows the published DrawIO Viewer's info and installs it in a few clicks.
- Installed boards keep working exactly like locally-authored boards (trust registry, custom-editor
  registry, sidebar panels) — no parallel machinery.
- Installed boards get update notifications when the catalog advertises a newer version.
- Publishing a board from `C:\projects\persephone-boards` is a version bump + merge to `main` —
  the GitHub Action does everything else.

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
      "minAppVersion": "4.0.14",
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

### App-version compatibility — `minAppVersion`

A board version may depend on bridge capabilities (`persephone.*` methods) that older Persephone
builds don't have. `board-manifest.json` gains `minAppVersion?: string` (semver; absent = no
requirement), copied by the publish automation into the catalog entry **and into each
`versions-manifest.json` entry** — the requirement is per version, so an older app can still
install the newest *compatible* version of a board.

Client rules (compare via the shared `compareVersions` — see US-862's `src/shared/version-utils.ts`
extraction — against the app version, `app.version` in the renderer):

- The "+" switch entry and agent `searchPublished` results include only compatible boards
  (agent results may annotate incompatible ones as `requiresAppVersion` rather than hide).
- "Update available" (badge + activation toast) means *a compatible newer version exists*;
  a newer-but-incompatible latest is not an update.
- The Board Info screen's Versions list shows incompatible versions disabled with a
  "Requires Persephone ≥ X" hint (the hub Search tab may do the same for incompatible boards —
  disabled-with-hint tells the user an app update unlocks them; implementation choice vs.
  hiding).
- `installPublished` refuses an incompatible version with a clear error (agents get the same
  contract as the UI).

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

### Publish workflow (persephone-boards repo) — GitHub Action on push to `main`

The board's own `board-manifest.json` `version` is the **single source of truth**; both catalog
manifests are machine-written, never hand-edited. Author flow: edit the board → bump `version`
(+ optional release notes) → merge to `main`. A GitHub Action
(`.github/workflows/publish-boards.yml`, `on: push: branches: [main]`,
`permissions: contents: write`) then:

1. For each board under `boards/`, checks whether the git tag `<board-id>-v<version>` exists —
   a manifest version without a tag is the "needs release" signal (robust: the Action owns the
   catalog files, so it never trusts them for readiness).
2. Zips the board folder **contents** (entries rooted at top level, no wrapper folder),
   excluding dev junk (`ui.log`, `.git`, `node_modules`) and `versions-manifest.json`
   (catalog metadata, not board content).
3. `gh release create <board-id>-v<version> <board-id>.zip` (per-board tags keep releases
   independent; old versions stay downloadable for rollback). Computes the asset's `size` +
   `sha256`.
4. Rewrites that board's entry in `boards-manifest.json`
   (id/version/name/description/fileMasks/editorName/editorKind/standalone/minAppVersion/archive)
   and prepends `{ version, date, notes?, minAppVersion?, archive }` to
   `boards/<board-id>/versions-manifest.json` (see "Version history & rollback").
5. Commits + pushes the manifest updates back to `main`. No retrigger loop: commits made with
   the default `GITHUB_TOKEN` do not trigger workflows. No client inconsistency either — the
   catalog only ever points at already-created releases.

The logic lives in `scripts/publish-board.mjs` (Node + `gh` CLI), runnable both by the workflow
and locally as a manual fallback.

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
- **Download (renderer orchestration):** new `src/renderer/api/board-install.ts` — call the
  download endpoint → extract the verified temp ZIP via `archiveService` (`listEntries` +
  `readFile` loop + `app.fs` writes; there is no extract-to-dir today, we add the loop here)
  with **zip-slip protection** (reject entries resolving outside the target dir) → validate
  `readBoardManifest` succeeds → record in an install registry. **Downloading does NOT trust** —
  the board sits on disk inert (unexecuted code is harmless), reviewable by the user or their
  agent.
- **Register (separate consent step):** the standard trust flow — `showTrustBoardDialog(root)` →
  on accept `boardTrust.trust(root)` (exactly US-868's `registerBoard`). Only then does the
  reactive `customEditorRegistry` pick the board up and the switch re-render. The existing
  invariant — nothing is ever trusted without the user's dialog click — holds with no
  exceptions.
- **Install registry:** `installedBoards.json` in the data folder (`fs.saveDataFile` pattern, like
  `trustedBoards.txt`): `[{ id, root, version, installedAt }]`. Maps catalog ids to installed
  roots for update checks and prevents re-advertising an installed board in the "+" entry.
- **Default install folder:** `<userData>/data/boards/<id>`
  (`fpJoin(await api.getCommonFolder("userData"), "data", "boards")`), user-changeable on the
  Board Info screen. Note: a board there appears in the global **Custom Boards & Editors**
  sidebar tab (unfiltered trust registry) but not the Explorer-scoped Boards panel — expected.

### Install UX — the "+" switch entry

`SwitchWidget` (`src/renderer/editors/base/PageToolbar.tsx`) already merges built-in candidates
with trusted-board matches. Additions:

- Compute catalog matches for the current file name (masks from the cached catalog), minus
  boards already offered by a **trusted** board with the same id. The subtraction is **per
  board id**: if one matching board is installed (it shows as its own switch segment), "+"
  still appears for the remaining matches. A downloaded-but-unregistered board also still
  matches — its "+" leads to the Board Info screen in the Register state. Apply the same
  non-local filter as trusted boards (non-local file → `content-host` only).
- If any remain, append a **pseudo segment** `"+"` (tooltip "Install an editor for this file
  type…"). Pseudo segments are excluded from the `merged`/current-id guard math, and the
  visibility rule relaxes to: show the switch when `merged.length >= 2` **or** a pseudo entry
  exists (so a plain "Text"-only file still shows `Text | +`).
- The "+" segment's value maps to the **Board Info editor** (next section) — a real registered,
  host-capable editor — so selecting it is an ordinary `switchMainEditor` navigation: no modal,
  no pseudo-segment interception of `onChange`, and the file's content host transfers
  losslessly. Only the visibility-guard relaxation above is switch-widget-specific.

### Updates

- On each catalog refresh, compare catalog versions to the install registry (semver compare —
  the shared `compareVersions`, `src/shared/version-utils.ts`) and derive `updatesAvailable`
  **silently** — it drives badges (sidebar, hub, Board Info screen) only, never a toast by
  itself.
- The toast is deferred until the user actually uses the board: when a board page is opened or
  activated and its root has a pending update, `ui.notify(..., "info")` once per board+version
  (click → opens the Board Info page; `lastNotified` map in `electronStore`, same idea
  as the app-update toast). Boards the user isn't opening never toast.
- Update action re-runs the install flow into the **existing** root: download + verify → extract
  to a sibling temp folder → swap (rename old away, rename new in, delete old) so a failed
  download never destroys a working board. Trust and pins are untouched (same root).
- **Open-pages precondition, checked before the download starts** (and re-checked before the
  swap): the board must not be busy (`setBoardBusy` processes) and must have no open pages
  (any page whose editor **runs** that root — `board-view` / `board-editor:<root>` main views
  and `board-secondary:*` panels; NOT the Board Info page the action is initiated from). If it
  does, a dialog asks the user to close the board's pages first, with a **Close pages &
  continue** shortcut that closes them via the normal page-close flow (unsaved content-host
  state gets its usual say) and proceeds; a veto aborts the update.
- Surfacing: the **Custom Boards & Editors** sidebar tab (`TrustedBoardsList.tsx`) gains an
  "Update available" badge + context-menu "Update" for registry-installed boards — nothing
  else; the sidebar stays installed/registered-only. Catalog browsing lives exclusively in the
  hub page's **Search boards** tab (US-870).

### Version history & rollback

The main catalog stays small — it carries only the **latest** version of each board. Full history
lives in a per-board `boards/<id>/versions-manifest.json` in the repo, fetched raw **on demand**
(when the Board Info screen's properties mode opens), never during the periodic check:

```json
{
  "schemaVersion": 1,
  "id": "drawio-viewer",
  "versions": [
    { "version": "1.0.1", "date": "2026-07-20", "notes": "Fix …", "minAppVersion": "4.0.14", "archive": { "url": "…", "size": 1, "sha256": "…" } },
    { "version": "1.0.0", "date": "2026-07-16", "archive": { "url": "…", "size": 1, "sha256": "…" } }
  ]
}
```

Newest first; written only by the publish script. Because release assets are never deleted,
installing any listed version is the **same flow as an update** — download + verify + temp-extract
+ swap — just pointed at an older asset. The install registry records whichever version is actually
installed, so "update available" naturally reappears after a rollback (expected — the user chose
the older version knowingly, and the once-per-version toast gate prevents repeat nagging).

### Board Info editor — one screen for install & properties

A registered full-page editor (`src/renderer/editors/board-info/`) serving both an uninstalled
catalog board (**install mode**) and an installed board (**properties mode**). Reached from: the
"+" switch entry, the board-toolbar **Properties** button (`BoardToolbar.tsx` — navigates the
current page to this editor), the hub's Search/Registered tabs, the update-toast click, and
agent `installPublished`.

- **Host-capable holder:** like `BoardContentEditorModel`, it adopts/yields the shared content
  host (`CONTENT_HOST_TRAIT`) without rendering it, so `Text ↔ + ↔ installed board` switches
  transfer the same host with no reload, no confirm, no data loss. Opened standalone (hub,
  toast) it simply has no host.
- **Multi-match:** opened from a file whose mask matches **several** catalog boards, install
  mode lists them all as tiles (name, version, description, size), each expanding into its own
  Download → Register flow below; a single match renders directly. Mixed states are fine —
  one tile may be "Downloaded — not registered" while another is not yet downloaded.
- **Install mode** (not installed) — a two-step flow:
  1. **Download**: name, version, description, download size, file masks; install-path input
     (Browse…, default `<userData>/data/boards`); **Download** button → byte-progress bar
     (progress events rendered from editor state, Mneme-style); inline errors (hash mismatch,
     network, extract). No consent needed — nothing is trusted or executed yet.
  2. **Register**: once downloaded, the screen shows "Downloaded — not registered" with the
     local folder path and a hint that the user can ask their AI agent to review the board's
     files before trusting; the button becomes **Register board** → the standard
     `showTrustBoardDialog` → on accept, trust + activate. Only after registration does the
     page auto-switch to the new editor via `page.switchMainEditor(boardEditorId(root))`
     (file-page flow). A downloaded-but-unregistered board can be deleted from this screen
     (removes the folder + registry entry; nothing was ever trusted).
- **Properties mode** (installed): name, description, author, root path, editor association,
  trust state, installed version, source repository; **Versions** list fetched on demand from
  `versions-manifest.json` — current version marked, newer highlighted as the update,
  per-version **Install** = update/rollback via the swap flow (open-pages/busy precondition
  per Design — close-pages dialog if violated; no other confirmation — the click is the
  intent), incompatible versions disabled with the "Requires Persephone ≥ X" hint;
  **Uninstall** (delete confirmation); an **Open board** button switching the page (back) to
  the board editor.
- **Navigation mechanics** (`switchMainEditor` alone cannot cover all cases — its simple-board
  branch requires a `filePath` and its board-kind lookup only knows mask-bearing trusted
  boards):
  - File page whose host both sides can hold (`Text ↔ + ↔ content-host board`): plain
    `switchMainEditor` with lossless host transfer. Board Info's `switchFrom` must tolerate a
    host-less source (no `CONTENT_HOST_TRAIT` on the old editor → just no host).
  - Standalone/simple-board pages (Properties from a `board-view` page, **Open board** on a
    board with no file, hub/toast openers): a small `openBoardInfo(page, { catalogId?,
    boardRoot? })` helper in the board-info module replaces the page's main editor directly
    (create editor with explicit state → `setMainEditor`, after `confirmRelease`), and **Open
    board** navigates back via `app.openRawLink(encodePersephoneBoardLink(root), { pageId })` —
    the `BoardToolbar` boards-switcher precedent — when no host transfer applies.
- **Parameter passing:** the "+" switch entry carries no parameters (`switchMainEditor` passes
  only an editor id) — install mode reached that way derives its matches from the adopted
  host's file name. Explicit `catalogId`/`boardRoot` state is set only by the direct openers
  (hub, toast, `installPublished`, Properties). A stored `catalogId` that is no longer in the
  catalog (restored page, unpublished board) renders a "no longer published" empty state.
- The screen flips between modes reactively — after a successful install it either auto-switches
  away (file-page flow) or becomes the properties view (hub/standalone flow).

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
- `app.boards.downloadPublished(id, opts?: { dir?, version? })` — download + verify + extract
  + registry record, **no dialog** (nothing is trusted; the code sits inert on disk). Resolves
  the local root. This is the agent's "can I trust this board?" entry point: download, read the
  files, report to the user — then `registerBoard(root)` shows the trust dialog.
- `app.boards.installPublished(id, opts?: { dir?, version? })` — the interactive combo: opens
  the **Board Info page** prefilled (install mode; path/version pre-set from opts); the user
  walks the Download → Register steps there, and the trust-dialog click is the consent.
  Resolves the installed root, or `undefined` if the user closes/navigates away without
  registering. Version change (update or rollback) is the same call with `version` on an
  already-installed board — the swap **auto-runs** (no button click: the board is already
  trusted, the agent call is the intent) once the open-pages/busy precondition passes; if the
  user vetoes the close-pages dialog, the call resolves `undefined`.
- `app.boards.uninstallBoard(id)` — shows the existing delete confirmation
  ("permanently removes its folder"), then folder delete + untrust + unpin + install-registry
  removal. Dialog required because it deletes files, not because of privilege.
- `app.boards.checkPublishedUpdates(force?)` — trigger a catalog refresh; returns boards with
  updates available. No dialog.

### Tools & Editors hub page ("Search boards")

A full-page counterpart to the AppBar **Tools & Editors** panel — the browse-the-catalog home
that doesn't require opening a matching file. The AppBar panel stays exactly as it is and gains
an **"Open in new tab"** header button (a plain header icon button — the panel does not use
`SideBarPanelHeader`) opening a singleton hub page (well-known-page pattern).

Hub layout: content tabs **Built-in** / **Registered boards** / **Search boards** / **Tools**,
plus a **Pinned** rail on the right (same pin model as the panel):

- **Built-in** — the creatable-items registry (`tools-editors-registry.ts`), with pin/open
  actions (page-sized version of the panel's Editors tab).
- **Registered boards** — the trusted-boards registry (multi-root `BoardsTree`, as
  `TrustedBoardsList`), plus installed-version / update badges from the install registry.
- **Search boards** — the published catalog: search box (name/description/mask), board cards
  (name, description, version, masks, size, installed state), actions **Install…** /
  **Update…** / **Properties** opening the Board Info page — the same single surface as
  everywhere else.
- **Tools** — registered toolsets (`ToolsTree`, as `TrustedToolsList`).

## Linked Tasks

Implementation order (revised 2026-07-16, see Notes): US-862 → US-863 → **US-866** → **US-868**
→ US-864 → US-865 → US-867 → US-869 → US-870. The table is listed in that order.

| Task | Title | Status |
|------|-------|--------|
| [US-862](../tasks/US-862-catalog-service/README.md) | Catalog service (main): manifest fetch, cache, periodic check, IPC | Active |
| [US-863](../tasks/US-863-install-engine/README.md) | Install engine: download + sha256 verify + extract + install registry | Active |
| US-866 | persephone-boards repo: initial commit + publish script + GitHub Action | Planned |
| [US-868](../tasks/US-868-agent-board-lifecycle/README.md) | Agent API: app.boards.registerBoard / unregisterBoard / renameBoard | Planned |
| [US-864](../tasks/US-864-switch-entry-board-info/README.md) | "+" editor-switch entry + Board Info editor (install mode, progress) | Planned |
| US-865 | Updates: version compare, activation toast, safe re-install, sidebar badges | Planned |
| US-867 | Board Info editor: properties mode + version history & rollback | Planned |
| US-869 | Agent API: catalog — searchPublished / installPublished / versions / uninstall | Planned |
| US-870 | Tools & Editors hub page (Built-in / Registered boards / Search boards / Tools + Pinned) | Planned |
| US-871 | SegmentedControl tooltip support + "+" switch-entry tooltip (deferred follow-up) | Planned |
| US-872 | About "Check for Updates" also force-refreshes the boards catalog | Active |

## Task details

### US-862 — Catalog service (main)

- `src/ipc/api-param-types.ts`: add `PublishedBoardInfo`, `PublishedBoardsCatalog`,
  `PublishedBoardsResult` types (catalog schema above).
- `src/main/published-boards-service.ts` (new): `getPublishedBoards(force?)` — electronStore-gated
  `net.fetch` of the raw manifest URL; parse/validate (`schemaVersion`, drop malformed entries);
  cache last-good catalog + fetch timestamp in `electronStore`; broadcast
  `ePublishedBoardsUpdated` when content changed. **Dev-only catalog-source override**: the
  `PERSEPHONE_BOARDS_BRANCH` env var switches the fetch base from `main` to another branch
  (e.g. `develop`) — no settings-UI surface; lets the whole flow be tested before anything is
  published to `main`.
- IPC (4-file recipe): `Endpoint.getPublishedBoards` in `src/ipc/api-types.ts` (+ `Api` type),
  renderer call in `src/ipc/renderer/api.ts`, handler + `bindEndpoint` in
  `src/ipc/main/controller.ts`. Event: `EventEndpoint.ePublishedBoardsUpdated` in `api-types.ts`
  (+ `EventApi`), field in `src/ipc/renderer/renderer-events.ts`.
- `src/main/main-setup.ts`: kick the periodic check in the existing startup `setTimeout`.
- **Extract `parseVersion`/`compareVersions` from `src/main/version-service.ts` to a new
  `src/shared/version-utils.ts`** (version-service imports it from there). The originals live in
  a main-process module whose top-level imports (`electron`, `e-store`, `open-windows`) must not
  leak into the renderer bundle; the renderer catalog model needs the same compare.
- `src/renderer/api/published-boards.ts` (new): renderer-side reactive model (`TGlobalState`)
  holding the catalog; subscribes to the event; `refresh(force)`; hooks
  `useCatalog()` / `useCatalogBoardsForFile(fileName)` (mask match via `matchesFileMask`, after
  running catalog masks through `normalizeFileMasks` — `matchesFileMask` assumes normalized
  lowercase masks).
- `src/renderer/editors/board/board-manifest.ts`: add `version?: string`,
  `standalone?: boolean`, and `minAppVersion?: string` to `BoardManifest`, plus a resolver
  `isBoardStandalone(manifest): boolean` implementing the defaults (no masks → true,
  masks → false unless opted in) and a derived-group helper for UI grouping.
- Compatibility helper in `src/renderer/api/published-boards.ts`:
  `isCompatible(minAppVersion?): boolean` (shared `compareVersions` vs `app.version` — the
  renderer app-version surface); applied in `useCatalogBoardsForFile` and everywhere the
  catalog is surfaced (see Design → "App-version compatibility").

### US-863 — Install engine

- Main (`published-boards-service.ts` or `src/main/board-download-service.ts`):
  `downloadBoardArchive({ url, sha256, size })` → streams to a temp file under the OS temp dir,
  incremental sha256, throttled `eBoardInstallProgress { installId, receivedBytes, totalBytes }`
  events, digest check, returns the temp path. Cancel endpoint. IPC via the 4-file recipe.
  Orphaned temp files from a crashed/interrupted download are harmless — overwritten or cleaned
  on the next download; no startup sweep needed.
- Renderer `src/renderer/api/board-install.ts` (new):
  `downloadBoard(catalogEntry, targetParentDir): Promise<string /* root */>` —
  download → extract → validate `readBoardManifest` non-null → append to install registry →
  return root, into `<targetParentDir>/<id>` (error if the folder exists and is not an update).
  Extraction: add a **single-pass `archiveService.extractTo(archivePath, targetDir)`** helper
  (zip-slip guard — reject entries resolving outside the target; create dirs; write files) —
  per-entry `readFile` is NOT suitable here because it re-reads and re-scans the whole archive
  on every call. **No trust** — registration is a separate step (US-868's `registerBoard` /
  the Board Info screen's Register button). Also `updateBoard(entry)` (temp-extract + folder
  swap, US-865 wires the UI; runs under the board's existing trust).
- Install registry module `src/renderer/api/board-install-registry.ts` (new, mirrors
  `board-trust.ts` structure): `installedBoards.json` via `fs.saveDataFile`/`getDataFile`;
  reactive list; `record(entry)`, `remove(id)`, `getByRoot`, `useInstalled()`.
  **One entry per catalog id** — re-downloading to a different dir replaces the entry (moves
  it). **Stale-entry reconciliation:** an entry whose root has no readable
  `board-manifest.json` (folder deleted manually) is treated as not installed — the Board Info
  screen shows install mode and the stale entry is pruned on detection (the
  `BoardNotFoundView` precedent for stale trusted paths).
- Un-install stays the existing sidebar "Remove"/"Delete Board" actions; "Delete Board" on a
  registry-installed board also removes its registry entry. Known, accepted gap until US-867:
  a default-location install (`<userData>/data/boards`) is outside any Explorer root, so it has
  Remove (untrust) but no folder-deleting UI — Board Info's **Uninstall** (US-867) closes this;
  don't add an interim delete action.

### US-864 — "+" switch entry + Board Info editor (install mode)

- `src/renderer/editors/base/PageToolbar.tsx` `SwitchWidget`: catalog-match computation
  (compatible + uninstalled + mask match; non-local → content-host only), append the `+`
  segment mapping to the Board Info editor, relaxed visibility guard (`Text | +` must show).
- New editor `src/renderer/editors/board-info/` (model + view; registered in
  `register-editors.ts`, dynamic import; state carries `catalogId`/`boardRoot`).
  **Host-capable holder** — adopts/yields `CONTENT_HOST_TRAIT` like `BoardContentEditorModel`
  but never renders the content, so switch round-trips are lossless; `findCompatibleEditors`
  returns the built-ins + itself so the switch widget renders correctly while it's active.
- Install-mode UI per Design — two steps: **Download** (info, path input + Browse via
  `fs.showFolderDialog`, progress from `eBoardInstallProgress` in editor state, inline error +
  retry; no consent), then **Register board** ("Downloaded — not registered" state with folder
  path + ask-your-agent-to-review hint; button → `showTrustBoardDialog` → `boardTrust.trust`;
  delete-download action for the unregistered state).
- After registration from a file page: **await `customEditorRegistry.refresh()` first** (trust →
  registry refresh is async; switching before it completes misclassifies the board as "simple"
  and triggers dispose-and-rebuild instead of host transfer), then
  `page.switchMainEditor(boardEditorId(root))`.
- Page persistence/restore: restore by `catalogId`/`boardRoot` (no host round-trip required
  across restart — reopening in install mode is acceptable).

### US-865 — Updates + sidebar catalog

- `src/renderer/api/published-boards.ts`: derive `updatesAvailable` (catalog × install registry,
  `compareVersions`; an update counts only if compatible per `minAppVersion`) — silent,
  badge-driving only.
- Update toast on board activation: hook board-page open/activation (`BoardEditorModel` — its
  open or activate path already knows the root); if the root has a pending update, toast once
  per board+version. The `lastNotifiedVersion` lives **per entry in `installedBoards.json`**
  (renderer-side, same place as the trigger — no IPC round-trip; a main-side electronStore map
  was rejected for exactly that reason).
- `src/renderer/ui/sidebar/TrustedBoardsList.tsx`: "Update available" badge on installed boards;
  context-menu **Update** → `updateBoard` (temp-extract + swap). No catalog content in the
  sidebar — it stays installed/registered-only.
- `src/renderer/api/board-install.ts`: `updateBoard(entry)` implementation (swap semantics;
  open-pages/busy precondition checked before download and re-checked before swap — scan
  `pagesModel` for editors targeting the root plus `busy-boards.ts`; close-pages dialog with
  "Close pages & continue" per Design).

### US-866 — persephone-boards repo publishing

Work in `C:\projects\persephone-boards` (separate repo):

- `git init` + add the GitHub remote first — `C:\projects\persephone-boards` is not a git repo
  yet. Then restructure: create `boards/` and move each board into it (`boards/drawio-viewer/`,
  …) so the repo root stays small.
- Initial commit: `boards/drawio-viewer/` (with `version: "1.0.0"` added to its
  `board-manifest.json`; `lib/LICENSE` + `lib/VERSION.txt` already present — attribution
  requirement satisfied), `boards-manifest.json`, `scripts/publish-board.mjs`, `README.md`
  (what the repo is, how to publish), `.gitignore` (`ui.log`, `node_modules`, `*.zip`).
- `scripts/publish-board.mjs`: detect boards whose manifest `version` has no `<id>-v<version>`
  tag → zip (exclusions, incl. `versions-manifest.json`) → `gh release create` → sha256/size →
  `boards-manifest.json` entry rewrite → prepend entry to `boards/<id>/versions-manifest.json`
  → commit. Node-only + `gh` CLI; no npm dependencies if feasible (spawn `tar` / PowerShell
  `Compress-Archive` / `zip`). Dual-mode: run by CI or locally as fallback.
- `.github/workflows/publish-boards.yml`: `on: push: branches: [main]`,
  `permissions: contents: write`; checkout → run the script → the script pushes the manifest
  commit (default `GITHUB_TOKEN` commits don't retrigger workflows).
- Work lands on the **`develop` branch first**; `main` stays empty until the client side is
  ready, then the merge to `main` runs the Action and publishes drawio-viewer v1.0.0
  end-to-end as the acceptance test of the whole epic.
- Scope: **drawio-viewer only** (`_test/` and any other dev folders are never published). The `todo/`
  board is deferred past this epic — it needs polish plus removal of the built-in todo editor
  first; when it ships, its `board-manifest.json` declares `standalone: true` (file editor
  that can start empty), while drawio-viewer relies on the default (`false` — file viewer).

### US-871 — SegmentedControl tooltip + "+" switch-entry tooltip

Deferred follow-up split out of US-864 (Concern 1). `ISegment` has no `title`/tooltip field, so
the "+" switch entry ships with a bare `"+"` label in US-864.

- `src/renderer/uikit/SegmentedControl/SegmentedControl.tsx`: add an optional `title?: string`
  to `ISegment`, forwarded to each segment's underlying `Button`/element (native `title` or a
  UIKit `Tooltip` wrapper — follow the control's existing primitive).
- `src/renderer/editors/base/PageToolbar.tsx` `SwitchWidget`: set `title: "Install an editor for
  this file type…"` on the `board-info` `"+"` segment.
- Low value, non-blocking; may instead be folded into US-870 when the hub reuses the control.

### US-872 — About "Check for Updates" also force-refreshes the boards catalog

Small follow-up. The About page's "Check for Updates" button checked only the app version
(GitHub releases). The published-boards catalog is a separate service with its own 24h gate, so
a newly published board version wouldn't surface from that button.

- `src/renderer/editors/about/AboutView.tsx` `handleCheckForUpdates`: also call
  `publishedBoards.refresh()` (force fetch, bypassing the 24h gate) alongside
  `shell.version.checkForUpdates(true)`. `Promise.all` so the "Checking…" state covers both;
  the boards refresh is best-effort (`.catch(() => {})`) so a catalog fetch failure never
  breaks the app-version result, and its outcome surfaces reactively through the
  `publishedBoards` model.
- Same view: show an **"Available boards"** count under the Electron/Node.js/Chromium versions
  list — `publishedBoards.useCatalog().length` (reactive, so it updates live on refresh);
  `publishedBoards.load()` in the mount effect so the cached count shows on open.

### US-867 — Board Info editor: properties mode + version history & rollback

- `src/main/published-boards-service.ts`: `getBoardVersions(id)` — on-demand raw fetch of
  `boards/<id>/versions-manifest.json` (no cache gate; it's a small file), validate, return.
  IPC endpoint via the 4-file recipe (`Endpoint.getBoardVersions`).
- Properties mode of the Board Info editor (see Design): board/install info; Versions section
  with loading/error states, per-version **Install** → same download/verify/swap flow as update
  (no confirmation dialog — swap overwrites any local edits by design), incompatible versions
  disabled with hint; **Uninstall** (delete confirmation → folder delete + untrust + unpin +
  registry removal); **Open board** button → back to the board editor per the Design's
  navigation mechanics (`switchMainEditor` host transfer when a host is held, otherwise
  `app.openRawLink(encodePersephoneBoardLink(root), { pageId })`).
- `src/renderer/api/board-install.ts`: generalize `updateBoard` into
  `installVersion(root, archive, version)` (US-865's update = install the catalog-latest);
  install registry updated with the actually-installed version.
- `src/renderer/editors/board/BoardToolbar.tsx`: **Properties** button → navigate the current
  page to the Board Info editor (content host preserved for content-host boards).
- US-865's update-toast click target is this page.

### US-868 — Agent API: register / unregister / rename boards

- `src/renderer/api/boards.ts`: implement `registerBoard` / `unregisterBoard` / `renameBoard`
  (see Design). `renameBoard`: busy-board guard (`busy-boards.ts`), `app.fs` folder rename,
  `boardTrust.untrust(old)` + `boardTrust.trust(new)` (direct registry transfer, no dialog),
  pin update via `pinned-items.ts`, install-registry root update (if US-863 registry entry
  exists), and if the board is open in a page — navigate that page to the new root
  (`app.openRawLink(encodePersephoneBoardLink(newRoot), { pageId })`).
- `src/renderer/api/types/boards.d.ts` (`IBoards`): add the three methods with docs stating
  registerBoard shows a consent dialog and may return `false`.
- `assets/mcp-res-boards.md`: document the new lifecycle calls in the agent-facing guide
  (register/rename flows; "the user sees a trust dialog" expectation).
- No new MCP tool needed — agents reach it via `execute_script`.

### US-869 — Agent API: catalog operations

Depends on US-862 (catalog), US-863 (install engine), US-864 (Board Info editor), US-867
(versions). Implemented last.

- `src/renderer/api/boards.ts`: `searchPublished`, `getPublishedVersions`,
  `downloadPublished` (headless download, no dialog), `installPublished` (opens the Board Info
  page prefilled; `version` opt routes to the swap flow), `uninstallBoard` (existing
  delete-confirm wording from `BoardsSecondaryView`'s "Delete Board"), `checkPublishedUpdates`
  (delegates to the catalog service with `force`).
- `src/renderer/api/types/boards.d.ts` (`IBoards`): the six methods, with docs stating which
  calls show a user dialog and what cancel returns.
- `assets/mcp-res-boards.md`: agent-facing "published boards" section — discover → download →
  review → register → update/rollback → uninstall flows and the consent expectations. Includes
  **board-review instructions**: when the user asks "can I trust this board?", download it
  (`downloadPublished`), read every script/HTML file in the folder, and check for malicious or
  vulnerable patterns — data exfiltration (unexpected network targets), credential/file-system
  access beyond the board's purpose, destructive `persephone.execute` usage, obfuscated code —
  then report findings and let the user decide before `registerBoard`.
- No new MCP tools — `execute_script` reaches everything.

### US-870 — Tools & Editors hub page

Depends on US-862 (catalog), US-864 (Board Info editor install mode), US-865 (update actions),
US-867 (properties mode). Investigate `ToolsEditorsPanel.tsx` first — the hub should share its
data sources, not duplicate them. (Note: `ToolsEditorsPanel` does not use `SideBarPanelHeader` —
the "Open in new tab" button will be a plain header icon button.)

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
  Update / Properties actions (opening the Board Info page); a "Refresh catalog" action
  calling the force check.
- `src/renderer/ui/sidebar/ToolsEditorsPanel.tsx`: "Open in new tab" header button →
  open/activate the hub page (persist active tab between panel and page is NOT required).

## Concerns / Open questions

1. **Install UX form — RESOLVED (2026-07-16):** a single full-page **Board Info editor** serves
   both install (uninstalled catalog board) and properties (installed board), replacing the
   earlier modal-dialog draft. Registering it as a real, host-capable editor removes the
   pseudo-segment machinery the dialog design was avoiding: "+" becomes an ordinary
   `switchMainEditor` navigation with lossless host transfer. See "Board Info editor" in Design.
2. **Install = trust — RESOLVED (2026-07-16): NO.** Install is split into **Download** (no
   consent — verified code lands on disk inert and reviewable) and **Register board** (the
   standard trust dialog; reuses US-868's `registerBoard`). This preserves the "nothing is
   trusted without the dialog" invariant with zero exceptions and enables the
   download-→-agent-review-→-register flow. The agent-facing boards guide gains instructions
   for reviewing a downloaded board before registration (see US-869).
3. **Updates replace code the user may have edited locally — RESOLVED (2026-07-16): no
   warning.** Updating/rolling back a board obviously replaces its files; users who hand-edit
   an installed catalog board own that risk. No local-edits detection or confirmation dialog —
   the version-Install click itself is the intent (the busy-board guard remains, as a technical
   safety, not a courtesy).
4. **Memory during extraction — RESOLVED (2026-07-16): accepted as-is.** `archive-service`
   reads the whole ZIP into memory (renderer); boards won't reach gigabyte scale (the app's own
   baseline is ~0.5 GB, and the OS page file backstops the rest). No streaming extract — the
   in-memory loop is the design.
5. **Catalog trust model — RESOLVED (2026-07-16): single-source, owner-verified.** The
   `persephone-boards` repo is the only catalog source, permanently. External contributions
   arrive only as pull requests, reviewed by the owner before merge — and since only a merge to
   `main` triggers the publish Action, contributors cannot release anything directly. The
   sha256 in the manifest pins every asset end-to-end.
6. **`todo/` board publication — RESOLVED (2026-07-16): deferred past this epic.** The epic
   develops and tests the whole flow on drawio-viewer only, on the `develop` branch first.
   The todo board follows later as separate work (polish + retiring the built-in todo editor).
7. **Possible overlap — RESOLVED (2026-07-16): sidebar stays as-is.** No "Available"/search
   content in the sidebar — it shows installed/registered boards only (plus update badges).
   The hub page's **Search boards** tab (US-870) is the sole catalog-browsing surface.

## Acceptance criteria

- With no drawio board installed, opening a `.drawio` file shows `Text | +` in the switch; "+"
  switches the page to the Board Info screen showing DrawIO Viewer v1.0.0 info and a path
  defaulting to `<userData>/data/boards`; switching back to Text before installing loses no
  content; **Download** shows byte progress and trusts nothing (the downloaded board is inert —
  no editor association, not in the switch); **Register board** shows the trust dialog, and only
  after accepting does the page switch to the DrawIO editor with the switch showing
  `Text | DrawIO`.
- When several catalog boards match the file's mask, the "+" screen lists them all as tiles,
  each installable independently; "+" remains in the switch as long as any matching catalog
  board is not yet offered by a trusted board — including when another matching board is
  already installed.
- The installed board appears in the Custom Boards & Editors tab and behaves identically to a
  locally-created trusted board (content-host round-trip, Ctrl+S, Remove).
- A tampered/corrupt download (sha256 mismatch) fails with a clear error and leaves nothing
  installed; a mid-download cancel leaves nothing installed.
- Re-publishing drawio-viewer as v1.0.1 shows the update badge within one catalog cycle (or on
  force refresh), and the toast appears only the next time the board is opened/activated — never
  for boards the user doesn't open; Update swaps the folder without losing trust/pins; if the
  board is busy or open in any page, a dialog asks to close those pages (with a close-and-
  continue shortcut) before the download even starts.
- The board toolbar's Properties button navigates the page to the Board Info screen for any
  board, and its **Open board** button returns to the board view; for a catalog-installed board
  the screen lists all published versions, and installing an older one rolls the board back
  (same safety as update) with the registry reflecting the installed version.
- A board version whose `minAppVersion` exceeds the running app never appears in the "+" entry,
  never counts as an available update, is disabled with a "Requires Persephone ≥ X" hint in the
  versions list, and is refused by `installPublished` — while an older compatible version of the
  same board remains installable.
- An agent (via `execute_script`) can register a board with `app.boards.registerBoard` — the user
  sees exactly one trust dialog and nothing else; declining returns `false` and leaves the board
  untrusted. `app.boards.renameBoard` renames a trusted board with zero user interaction, and the
  board stays trusted, pinned, and (if catalog-installed) update-checkable at the new path.
- An agent can run the full catalog lifecycle: `searchPublished("drawio")` finds the viewer,
  `downloadPublished(id)` fetches it with no dialog for review ("can I trust this board?"),
  `registerBoard(root)` activates it after the user's single trust-dialog click,
  `installPublished(id, { version })` rolls it back/forward, and `uninstallBoard(id)` removes it
  after the delete confirmation — with no other user interaction at any step.
- The AppBar Tools & Editors panel's "Open in new tab" button opens the hub page; its "Search
  boards" tab lists/filters the catalog and can install a board without any matching file being
  open; the other tabs mirror the panel's content plus the Pinned rail.
- Catalog fetch failures are silent (cached catalog keeps working; no error toasts on offline
  startup).
- Bumping a board's `version` and merging to `main` is the entire publish flow: the GitHub
  Action creates the tagged release and updates both catalog manifests with no manual steps;
  `boards-manifest.json` and `versions-manifest.json` are written only by the publish
  automation and match the released assets (id/version/sha256/size).

## Notes

### 2026-07-16 — US-866 done: persephone-boards live + first real publish
- `andriy-viyatyk/persephone-boards` (public) set up: `main` (published) / `develop` (working) /
  `todo` (the todo board, kept separate for later polishing). Boards live under `boards/`;
  `scripts/publish-board.mjs` + `.github/workflows/publish-boards.yml` on `main`.
- Merging `develop` → `main` ran the Action end-to-end (the epic's acceptance test): it created
  the `drawio-viewer-v1.0.0` GitHub Release with `drawio-viewer.zip` (837,949 bytes), wrote the
  `boards-manifest.json` entry + `versions-manifest.json`, and committed them back to `main`.
  The published asset's sha256 was verified against the catalog
  (`c3d8adf8…934c`). drawio-viewer is now installable from the live catalog — a real board for
  testing US-863's install engine and the downstream UI/agent tasks.
- Publish-script hardening applied during the task: push `HEAD:<branch>` explicitly (a bare
  `git push` is unreliable under `actions/checkout`; a push failure after `gh release create`
  would strand the catalog since the tag then blocks re-runs).

### 2026-07-16 — implementation-order revision
- After US-862 + US-863 landed, the build order was changed to front-load **US-866** and
  **US-868** so the rest of the epic can be tested end-to-end sooner:
  - **US-866 next** publishes a real drawio-viewer ZIP (to the `develop` branch, reached via the
    `PERSEPHONE_BOARDS_BRANCH` override from US-862) — giving every downstream UI/agent task a live
    catalog entry to install against instead of a hand-mocked one.
  - **US-868 after it** exposes `unregisterBoard` (untrust + unpin), so installed/registered state
    can be reset between manual test runs (untrust + an `app.fs` folder delete via
    `execute_script`) — full folder-deleting `uninstallBoard` still arrives with US-869.
  - Remaining tasks keep their original relative order: US-864 → US-865 → US-867 → US-869 → US-870.

### 2026-07-16
- Design settled with the user in conversation: GitHub repo as catalog + per-board release ZIP
  assets (chosen over whole-repo ZIP download — repo will grow large — and over per-file raw
  downloads — file-heavy boards like a future pdf.js viewer make per-file chatty).
- drawio LICENSE/VERSION attribution already present in `drawio-viewer/lib/` — publishing it is
  license-clean (Apache-2.0).
- Independent fresh-context design review (2026-07-16), verdict "ready-with-minor-fixes"; all
  findings folded in: Board Info navigation mechanics (`switchMainEditor` can't cover
  standalone/simple cases → `openBoardInfo` helper + `openRawLink` back-navigation), await
  `customEditorRegistry.refresh()` before the post-register auto-switch (async-refresh race),
  shared `src/shared/version-utils.ts` (main-only imports must not leak into the renderer),
  single-pass `archiveService.extractTo` (per-entry `readFile` re-scans the archive),
  install-registry one-entry-per-id + stale-entry reconciliation, `installPublished({version})`
  auto-runs the swap, `lastNotifiedVersion` stored per entry in `installedBoards.json`,
  `PERSEPHONE_BOARDS_BRANCH` env override, rename navigates the open page to the new root, and
  a stale-terminology sweep (dialog → Board Info editor).

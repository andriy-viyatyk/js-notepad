# US-805: Agent Tools management UI (panel-based)

**Epic:** [EPIC-038: Agent Tools Registry](../../epics/EPIC-038.md)
**Status:** Implemented (pending manual test — renderer-only, no app restart; a renderer reload picks it up). `tsc` + `eslint` clean.
**Depends on:** US-801 (registry/manifest), US-802 (execution + log), US-804 (`RegisterToolsetDialog`)

> **Scope change from the epic.** The epic's original US-805 was a *standalone "Agent Tools"
> editor* holding a list of every toolset. Per the user's revised design, there is **no separate
> list editor**: registered toolsets are surfaced on the **same two panels that already show
> boards**, and clicking one opens a lightweight **per-toolset editor**. See T-C1.

## Goal

Make the Agent Tools registry (US-801–US-804) manageable from the UI without an agent:

1. Surface **registered toolsets** on the two existing boards panels (the Explorer-sibling
   panel and the global "Tools & Editors" sidebar panel), shown the same way boards are.
2. Add a lightweight **per-toolset editor** — opened by clicking a toolset in a panel — that
   shows the manifest's info + its tool list and has a button to open the toolset's execution
   log in a separate tab.
3. Give `tools-manifest.json` in the Explorer file tree an **open-icon** (mirroring
   `board-manifest.json`'s "Open Board" icon) that registers the toolset (trust dialog if not
   yet trusted) and opens the toolset editor.

## Background — verified existing code

### The two boards panels this task mirrors
- **Explorer-sibling "Boards" panel** — `src/renderer/editors/explorer/BoardsSecondaryView.tsx`.
  Registered as secondary view `"boards"` in `register-editors.ts:32`. Backed by `ExplorerEditor`
  (inherits the Explorer `rootPath` as scope + `page.id` for navigation). Filters the global
  trusted-boards registry to boards **under the Explorer root** and renders them via the shared
  `BoardsTree` (single-root mode, `baseRoot={rootPath}`). The **"+ New board" `SplitButton`** and
  the close button live in the **panel header** (`SideBarPanelHeader` `actions`), gated on
  `expanded`. Clicking a board opens it in the current page (`pageId`); context menu offers "Open
  in New Tab" + "Delete Board".
- **Global "Tools & Editors" panel** — `src/renderer/ui/sidebar/ToolsEditorsPanel.tsx`. Has a
  `SegmentedControl` (`TabsBar`) with **two** segments today: `"editors"` → the creatable-items
  `ListBox`, `"boards"` → `TrustedBoardsList`. A unified **Pinned** region (`PinnedRef` =
  editor | board) sits above the tabs.
- **`TrustedBoardsList`** — `src/renderer/ui/sidebar/TrustedBoardsList.tsx`. Machine-wide trusted
  boards via `BoardsTree` in **multi-root mode** (no `baseRoot`). Pin / Remove ride the tree's
  `renderTrailing` / `getBoardContextMenu` slots. "Remove" = `boardTrust.untrust(root)` (never
  deletes the folder).

### Shared boards tree (the model for a shared tools tree)
- `src/renderer/editors/board/BoardsTree.tsx` — pure presentational `Tree`; consumers wire trust,
  link encoding, and pins through slots. Props: `boards: string[]`, optional `baseRoot`,
  `onOpenBoard`, `renderTrailing`, `trailingVisible`, `getBoardContextMenu`, `emptyMessage`.
- `src/renderer/editors/board/boards-tree-build.ts` — `buildBoardsTree(paths, baseRoot?)`; pure,
  VSCode-style single-child folder compaction; leaf label = **folder basename**. `BoardTreeNode`
  is structurally an `ITreeItem`.

### The registered-tools model (already built — US-801, consumed as-is)
- `src/renderer/api/tools/registered-tools.ts` — singleton `registeredTools`. `ensureInitialized()`
  (idempotent; loads `toolsTrust` then enumerates). Reactive: `useToolsets()` →
  `RegisteredToolset[]` (`{ root, manifest, name, valid, errors, shadowed }`), `useTools()` →
  flat `RegisteredTool[]` (`{ id, toolsetName, toolsetRoot, tool }`). Re-enumerates on a
  `toolsTrust` change and on explicit `refresh()`. **`name`** is `manifest.name` when valid, else
  the folder basename.
- `src/renderer/api/tools/tools-trust.ts` — `toolsTrust` (exact-path match). `trust`/`untrust`/
  `isTrusted`/`listPaths`/`subscribePaths`/`useTrustedPaths?`/`load`. **Not** on `app`/scripts.
  (Verify the reactive-paths hook name during implementation; if none, use `registeredTools.useToolsets()`
  which already re-renders on trust changes.)
- `src/renderer/api/tools/tools-manifest.ts` — `TOOLS_MANIFEST_FILE = "tools-manifest.json"`,
  `readToolsManifest`, `isToolsetFolder`, `ToolsManifest`/`ToolDef` types.
- `src/renderer/api/tools/tool-log.ts` — the per-toolset log is `<toolsetRoot>/tools-execution.log`
  (`LOG_FILE = "tools-execution.log"`). Written by US-802 only after a run.

### The per-path editor pattern (the model for the toolset editor)
The board editor is opened by its **root path** through a link scheme, not by filename-accepts:
- `src/renderer/content/persephone-board-link.ts` — `encode/decodePersephoneBoardLink(root)`
  (base64-of-JSON `{ boardRoot }`), prefix `persephone-board://`.
- `src/renderer/content/parsers.ts:118` — a parser matches the prefix and sets
  `data.target ??= "board-view"`.
- `src/renderer/editors/register-editors.ts:441` — editor `"board-view"` (`hasContentHost: false`,
  `accepts: () => -1`, `loadModule → boardModule`). **Target string === editor id.**
- `src/renderer/editors/board/index.tsx` — `boardModule` (`createEditor`) + a legacy default
  `EditorModule` whose `newEditorModel(filePath)` decodes the link → `initFromBoardRoot`, and
  `newEditorModelFromState` restores from the persisted `boardRoot`.

Using a link scheme (not a filename-`accepts` editor) is deliberate: a **normal click** on
`tools-manifest.json` in Explorer must still open the JSON in Monaco; **only** the open-icon /
panel opens the toolset editor. See T-C2.

### The Explorer file-tree open-icon (the model for the tools open-icon)
- `src/renderer/editors/explorer/ExplorerSecondaryView.tsx:86` — `renderTrailingAction(item)`.
  For a file whose basename === `BOARD_MANIFEST_FILE` it renders an always-visible `IconButton`
  (`BoardIcon`, title "Open Board") that `stopPropagation`s and fires
  `openRawLink(encodePersephoneBoardLink(fpDirname(item.href)), { pageId, sourceId, explorerRoot })`.
  Git-tree / mneme-root folders have their own branches below.

### The registration dialog (already built — US-804, reused)
- `src/renderer/ui/dialogs/RegisterToolsetDialog.tsx` — `showRegisterToolsetDialog({ toolsetName,
  toolsetRoot, tools: {name, description}[] }): Promise<boolean>`. Built for the MCP `create_toolset`
  path; reused here for the user-initiated Explorer open-icon on a not-yet-trusted manifest (T-C3).

### Icons
- `src/renderer/theme/icons.tsx` — no wrench/tools glyph exists. `BoardIcon`/`BoardColorIcon`
  (colored panel-header variant) are the precedent. Add a `ToolsIcon` (+ optional colored
  `ToolsColorIcon`) — a wrench/hammer or the MCP-style glyph. `RunIcon`, `LogIcon`, `FolderOpenIcon`
  already exist for buttons.

## Implementation plan

### Step 1 — `ToolsIcon` (+ colored variant) — `src/renderer/theme/icons.tsx`
Add a `ToolsIcon = createIcon(24)(…)` (wrench/hammer path) and a `ToolsColorIcon` for the panel
header (mirroring `BoardColorIcon`). Used as the toolset leaf icon, the secondary-view header icon
(Tools mode), and the toolset editor's tab icon.

### Step 2 — Shared tools tree — `src/renderer/editors/tools/`
Near-copies of the boards tree, kept **separate** so boards code stays untouched (see T-C4).

- **`tools-tree-build.ts`** — `buildToolsTree(toolsets: { root: string; name: string }[], baseRoot?): ToolTreeNode[]`.
  Same segment-split + single-child folder compaction as `buildBoardsTree`, but:
  - leaf `kind: "toolset"`, `root`, and **`label` = the toolset's `name`** (manifest name;
    fallback basename supplied by the caller), not the folder basename (T-C4);
  - node id prefixes `"dir:"` / `"toolset:"`.
- **`ToolsTree.tsx`** — presentational `Tree`, mirrors `BoardsTree`. Props: `name?`,
  `toolsets: { root: string; name: string }[]`, `baseRoot?`, `onOpenToolset(root)`,
  `renderTrailing?(root)`, `getContextMenu?(root)`, `emptyMessage?`. Folder icon `FolderIcon`;
  toolset leaf icon `ToolsIcon`.

### Step 3 — Per-toolset editor — link scheme + editor
1. **`src/renderer/content/persephone-toolset-link.ts`** — mirror `persephone-board-link.ts`:
   `PERSEPHONE_TOOLSET_PREFIX = "persephone-toolset://"`, `encode/decodePersephoneToolsetLink(root)`
   (base64-of-JSON `{ toolsetRoot }`). Also export a helper
   `openToolset(root: string, opts?: { pageId?: string; sourceId?: string })` that sends
   `openRawLink(createLinkData(encode…, opts))` — used by all three open sites.
2. **`src/renderer/content/parsers.ts`** — add a parser after the `persephone-board://` one
   (~:125): match `PERSEPHONE_TOOLSET_PREFIX` → `data.url = data.href; data.target ??= "toolset-view";`
   then `openLink`. Import the prefix at top.
3. **`src/renderer/editors/toolset/ToolsetEditorModel.ts`** — `hasContentHost: false` editor model
   (mirror `BoardEditorModel`'s shape, minus iframe/busy machinery). State
   `{ toolsetRoot: string; manifest: ToolsManifest | null; registered: boolean }`.
   - `initFromToolsetRoot(root)` — set `toolsetRoot`, set the tab title (manifest name or basename),
     call `void this.reload()`.
   - `reload()` — `readToolsManifest(root)` + `toolsTrust.isTrusted(root)` → `state.update`.
     Subscribe to `registeredTools` / `toolsTrust` changes so the view refreshes after a
     register/refresh (unsubscribe in `dispose`).
   - `restore()` — re-validate the persisted `toolsetRoot` (folder may be gone → show a
     "not found" state or a plain message; keep it minimal, mirror board `restore()`).
4. **`src/renderer/editors/toolset/ToolsetEditorView.tsx`** — read-only view:
   - Header: `ToolsIcon` + toolset **name**, the folder path (muted), a **registered/not-registered**
     chip, and a **Refresh** `IconButton` (`registeredTools.refresh()` + `model.reload()`).
   - Toolset `description` + `author` when present.
   - **Tools list** — one card/row per `manifest.tools[]`: `name`, `description`, `command` (mono),
     `requirements`, required **env names** (never values), `timeoutMs`. If the manifest is
     invalid, show `validateToolsManifest` errors instead of a tools list.
   - Buttons: **"Open Folder"** (`app.pages.openFile`/reveal the folder — match how boards reveal
     a folder), **"Open Log"** → open `<toolsetRoot>/tools-execution.log` in a separate tab via
     `app.pages.openFile`; if the file doesn't exist yet, `ui.notify("No execution log yet — run a
     tool first.", "info")` (T-C7).
   - **No test-run in this task** (T-C8).
5. **`src/renderer/editors/toolset/index.tsx`** — mirror `board/index.tsx`: `toolsetModule`
   (`createEditor` + `Component`) and a legacy default `EditorModule` with
   `newEditorModel(filePath)` → `decodePersephoneToolsetLink` → `initFromToolsetRoot`, and
   `newEditorModelFromState` → restore from persisted `toolsetRoot` (drop state with no
   `toolsetRoot`). `newEmptyEditorModel` returns `null` (a toolset editor is never created empty),
   so **no new `EditorType`** is needed (T-C10 — verify against restore).
6. **`src/renderer/editors/register-editors.ts`** — register editor `"toolset-view"`
   (`name: "Agent Tool"`, `hasContentHost: false`, `accepts: () => -1`,
   `loadModule → (await import("./toolset")).toolsetModule`).

### Step 4 — Explorer open-icon for `tools-manifest.json` — `ExplorerSecondaryView.tsx`
In `renderTrailingAction`, extend the file branch (the `!item.isDirectory` block at :87). After the
`BOARD_MANIFEST_FILE` check, add a `TOOLS_MANIFEST_FILE` check that renders an `IconButton`
(`ToolsIcon`, title "Open Toolset") whose `onClick` (after `stopPropagation`):
```ts
const toolsetRoot = fpDirname(item.href);
await toolsTrust.load();
if (!toolsTrust.isTrusted(toolsetRoot)) {
    const manifest = await readToolsManifest(toolsetRoot);
    const ok = await showRegisterToolsetDialog({
        toolsetName: manifest?.name ?? fpBasename(toolsetRoot),
        toolsetRoot,
        tools: (manifest?.tools ?? []).map((t) => ({ name: t.name, description: t.description })),
    });
    if (!ok) return;                       // Deny → do nothing
    await toolsTrust.trust(toolsetRoot);
    await registeredTools.refresh();
}
openToolset(toolsetRoot, { pageId, sourceId: "explorer" });
```
New imports: `TOOLS_MANIFEST_FILE`, `readToolsManifest` (tools-manifest), `toolsTrust`,
`registeredTools`, `showRegisterToolsetDialog`, `openToolset`, `ToolsIcon`, `fpBasename`.

### Step 5 — Explorer-sibling panel: Boards/Tools switch — `BoardsSecondaryView.tsx`
Restructure to a dual-mode panel (keep the secondary-view id `"boards"`):
- Local `const [tab, setTab] = useState<"boards" | "tools">("boards")` (T-C9 — not persisted v1).
- **Move the "+ New board" `SplitButton` out of the header** into an inner **`TabsBar`** row at the
  top of the body (mirror `ToolsEditorsPanel`'s `TabsBar`): left = `SegmentedControl`
  (`items: [{value:"boards",label:"Boards"},{value:"tools",label:"Tools"}]`, `size="sm"`),
  right = the `SplitButton` **rendered only when `tab === "boards"`**. The header keeps only the
  close button (and its title/icon — see below).
- **Header title/icon stay fixed** — keep the panel's existing `"Boards"` title + `BoardIcon`
  (user decision); the Boards/Tools switch lives entirely in the body's `TabsBar`. The header keeps
  only the close button.
- Body:
  - `tab === "boards"` → existing boards content (empty-state + `BoardsTree`), unchanged.
  - `tab === "tools"` → `registeredTools.useToolsets()` filtered to **under `rootPath`** (same
    `fpNormalizeForCompare` subtree filter as `boards`), mapped to `{ root, name }`, rendered via
    `ToolsTree` (`baseRoot={rootPath}`, `onOpenToolset={(r) => openToolset(r, { pageId, sourceId:"explorer" })}`).
    Empty state: "No registered tools under this folder." Context menu "Remove from tools" →
    `toolsTrust.untrust(root)`.
- `useEffect(() => { void registeredTools.ensureInitialized(); }, [])`.

### Step 6 — Global panel: three segments — `ToolsEditorsPanel.tsx`
- Widen the tab state: `useState<"editors" | "boards" | "tools">("editors")`.
- Relabel + add the third segment:
  ```
  items={[
    { value: "editors", label: "Built-in Editors" },
    { value: "boards",  label: "Boards" },
    { value: "tools",   label: "Tools" },
  ]}
  ```
- `TabBody`: `editors` → existing `ListBox`; `boards` → `TrustedBoardsList`; `tools` → new
  **`TrustedToolsList`** (Step 6a).
- (T-C6: three segments may be tight in a narrow sidebar — verify width; shorten "Built-in Editors"
  → "Editors" if it clips.)

#### Step 6a — `src/renderer/ui/sidebar/TrustedToolsList.tsx` (new)
Mirror `TrustedBoardsList`: `useEffect(ensureInitialized)`, `const toolsets = registeredTools.useToolsets()`
mapped to `{ root, name }` (**multi-root**, no `baseRoot`), rendered via `ToolsTree`.
`onOpenToolset` → `openToolset(root)` (new page — no `pageId`) + `onClose?.()`. Context menu
"Remove" → `toolsTrust.untrust(root)` + `ui.notify`. Empty: "No registered tools yet." (No pinning
in this task — T-C5.)

### Step 7 — Docs touch-up — `assets/mcp-res-tools.md`
The guide says "the **Agent Tools** management UI". Reword to match reality: registered toolsets are
managed from the **Boards/Tools panels** (Explorer sidebar + global "Tools & Editors") and a
per-toolset view; `tools-manifest.json` has an "Open Toolset" icon in the Explorer file tree. (User
docs `/userdoc` run at epic close.)

## Concerns / open questions

| # | Concern | Disposition |
|---|---------|-------------|
| T-C1 | **No standalone list editor** (diverges from epic §Architecture-5 + the US-805 row) | **Accepted (user's design).** Management lives on the two boards panels + a per-toolset editor. Update the epic wording (row + Architecture-5) as part of this task's doc pass. |
| T-C2 | **Toolset editor opened by path (link scheme), not filename-`accepts`** | A normal click on `tools-manifest.json` must still open the JSON in Monaco; only the open-icon/panel opens the toolset editor. Mirror `persephone-board://`, not an `accepts` editor. |
| T-C3 | **Explorer open-icon registration gate** | Reuse `showRegisterToolsetDialog` (US-804) when the manifest's folder isn't trusted; open directly when it is. **Divergence** from epic C3 ("UI-initiated needs no dialog") — justified: the open-icon can be clicked on any *browsed/foreign* manifest, so the trust dialog is the right gate here (explicit user request). Panel clicks (already-registered) never show the dialog. |
| T-C4 | **Tools tree is a near-copy of the boards tree** | Kept separate (`tools-tree-build.ts` + `ToolsTree.tsx`) so boards code stays untouched. The one behavioral difference: leaf label = manifest **name** (fallback basename), so `ToolsTree` takes `{ root, name }[]`, not `string[]`. |
| T-C5 | **Tools not pinnable** | Out of scope. `PinnedRef` (editor \| board) is left unextended; the Pinned region only holds editors + boards. Note as a possible future enhancement. |
| T-C6 | **Three-segment control width** | "Built-in Editors" is long; three `size="sm"` segments may clip in a narrow sidebar. Verify at implementation; shorten to "Editors" if needed. *(Resolved: the Explorer panel header stays fixed as "Boards" + `BoardIcon` — the switch lives in the body, so no dynamic header.)* |
| T-C7 | **Open-log when no log exists** | The log is written only after a run (US-802). If `tools-execution.log` is absent, `ui.notify` "No execution log yet" instead of opening an empty/failing tab. |
| T-C8 | **No test-run** | The epic mentioned a per-tool test-run affordance; the user scoped this task to *display + open-log only*. Defer test-run (revisit after the epic if wanted). |
| T-C9 | **Switch persistence** | Both panels use local `useState` (not persisted) v1, matching `ToolsEditorsPanel`. Optional later: persist the Explorer panel's Boards/Tools choice on `ExplorerEditor` state (like `gitPanelTab`). |
| T-C10 | **Toolset editor session restore** | Persist `toolsetRoot` in the editor state and restore via the legacy module's `newEditorModelFromState` (mirror board). Verify no new `EditorType` is required (board needed one only for `newEmptyEditorModel`, which the toolset editor never uses). |

## Acceptance criteria

- Global "Tools & Editors" panel shows three segments — **Built-in Editors / Boards / Tools** — and
  the Tools segment lists every registered toolset (machine-wide) in a boards-style tree.
- Explorer-sibling panel has a **Boards / Tools** switch (Boards default); "+ New board" moved into
  the inner switch row and shown only in Boards mode; Tools mode lists toolsets under the Explorer
  root.
- Clicking a toolset in either panel opens the **per-toolset editor** showing manifest info + the
  tool list, with working **Open Folder** and **Open Log** buttons.
- `tools-manifest.json` in the Explorer file tree shows an **Open Toolset** icon: on an untrusted
  folder it shows the registration dialog (Allow → trust + open; Deny → nothing); on a trusted
  folder it opens the editor directly.
- A normal click on `tools-manifest.json` still opens the JSON in Monaco (open-icon behavior is
  additive).
- `tsc` + `eslint` clean.

## Files changed (summary)

| File | Change |
|------|--------|
| `src/renderer/theme/icons.tsx` | **Add** `ToolsIcon` (+ `ToolsColorIcon`) |
| `src/renderer/editors/tools/tools-tree-build.ts` | **New** — `buildToolsTree` (leaf label = manifest name) |
| `src/renderer/editors/tools/ToolsTree.tsx` | **New** — presentational tools tree (mirror `BoardsTree`) |
| `src/renderer/content/persephone-toolset-link.ts` | **New** — `persephone-toolset://` encode/decode + `openToolset` helper |
| `src/renderer/content/parsers.ts` | Add `persephone-toolset://` parser → `target: "toolset-view"` |
| `src/renderer/editors/toolset/ToolsetEditorModel.ts` | **New** — per-path model (manifest + registered) |
| `src/renderer/editors/toolset/ToolsetEditorView.tsx` | **New** — read-only view + Open Folder/Log |
| `src/renderer/editors/toolset/index.tsx` | **New** — `toolsetModule` + legacy module (decode/restore) |
| `src/renderer/editors/register-editors.ts` | Register editor `"toolset-view"` |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | `buildEditorById` switch: add `case "toolset-view"` (pipe-less target editors are built by an explicit switch; missing case fell through to an empty Monaco) |
| `src/renderer/api/pages/PagesPersistenceModel.ts` | Add `"toolset-view"` to `NO_HOST_EDITOR_IDS` (session restore of a toolset tab) |
| `src/renderer/editors/explorer/ExplorerSecondaryView.tsx` | Open-icon for `tools-manifest.json` (register-gated) |
| `src/renderer/editors/explorer/BoardsSecondaryView.tsx` | Boards/Tools switch; move "+ New board"; Tools mode |
| `src/renderer/ui/sidebar/ToolsEditorsPanel.tsx` | Three segments (Built-in Editors/Boards/Tools) |
| `src/renderer/ui/sidebar/TrustedToolsList.tsx` | **New** — machine-wide tools list (multi-root) |
| `assets/mcp-res-tools.md` | Reword "management UI" to the panel/editor reality |
| `doc/epics/EPIC-038.md` | Update US-805 row + Architecture-5 to the panel-based design; add Notes entry |
| `doc/active-work.md` | Update the US-805 entry (link + revised title) |

## Files needing NO change (don't re-investigate)

- `src/renderer/api/tools/*` (US-801/802) — `registered-tools.ts`, `tools-trust.ts`,
  `tools-manifest.ts`, `tool-executor.ts`, `tool-log.ts`, `tool-stats.ts`. Consumed as-is.
- `src/renderer/ui/dialogs/RegisterToolsetDialog.tsx` (US-804) — reused unchanged.
- `src/renderer/editors/board/*` — the boards panels/tree are the *template*; tools get parallel
  files, boards code is untouched.
- `src/main/mcp-http-server.ts`, `src/renderer/api/mcp-handler.ts` — no MCP surface change (this is
  a pure-UI task over models built in US-801/802).
</content>
</invoke>

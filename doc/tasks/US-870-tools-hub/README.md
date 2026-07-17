# US-870: Tools & Editors hub page

**Epic:** [EPIC-045: Published Boards Catalog](../../epics/EPIC-045.md)
**Status:** Active
**Created:** 2026-07-17

## Goal

Add a full-page **Tools & Editors** hub — a singleton page counterpart to the AppBar
"Tools & Editors" slide-out panel — with four content tabs (**Built-in** / **Registered
boards** / **Search boards** / **Tools**) plus a **Pinned** rail. The **Search boards** tab
is the sole catalog-browsing surface: it lists/filters the published catalog and installs a
board with no matching file open. The AppBar panel gains an **"Open in new tab"** button that
opens the hub.

## Background

The AppBar panel and the hub must **share data sources and UI**, not duplicate them
(EPIC-045 note; the "reuse not duplicate" discipline). Everything the hub needs already
exists — the task is a new full-page editor that recomposes existing pieces plus one genuinely
new tab (Search boards).

### What already exists (reuse verbatim)

| Piece | File | Notes |
|-------|------|-------|
| AppBar slide-out panel | `src/renderer/ui/sidebar/ToolsEditorsPanel.tsx` | 3 tabs (editors / boards / tools) + top Pinned region. Hosted from `MenuBar.tsx` `renderRightList()` → `case toolsEditorsId`. **No header today.** |
| Creatable-items registry | `src/renderer/ui/sidebar/tools-editors-registry.ts` | `getCreatableItems(browserProfiles)` + `DEFAULT_PINNED_EDITORS`. |
| Unified pin model | `src/renderer/ui/sidebar/pinned-items.ts` | `usePinnedRefs()`, `addPin`/`removePin`/`movePin`/`isPinned`, `PinnedRef` (`editor` \| `board`). |
| Registered boards list | `src/renderer/ui/sidebar/TrustedBoardsList.tsx` | Self-contained; multi-root `BoardsTree` + pin/Update/Remove slots. Takes `onClose?`. |
| Registered tools list | `src/renderer/ui/sidebar/TrustedToolsList.tsx` | Self-contained; multi-root `ToolsTree`. Takes `onClose?`. |
| Shared boards tree | `src/renderer/editors/board/BoardsTree.tsx` | Presentational; `renderTrailing`/`trailingVisible`/`getBoardContextMenu` slots. |
| Shared tools tree | `src/renderer/editors/tools/ToolsTree.tsx` | Presentational. |
| Catalog model | `src/renderer/api/published-boards.ts` | `publishedBoards.load()`/`refresh()`/`useCatalog()`/`isCompatible()`. |
| Install registry | `src/renderer/api/board-install-registry.ts` | `boardInstallRegistry.load()`/`getById()`. |
| Update detection | `src/renderer/api/board-updates.ts` | `useBoardUpdates()`, `getBoardUpdate(root)`. |
| Board usage group / standalone | `src/renderer/editors/board/board-manifest.ts` | `isBoardStandalone(manifest)`, `boardUsageGroup(manifest)` → `"file-viewer" \| "file-editor" \| "tool"`; `BoardUsageGroup` type. |
| Board Info editor | `src/renderer/editors/board-info/` | Install mode (`catalogId`) + properties mode (`boardRoot`). `open-board-info.ts` has `openBoardInfo(page, opts)` — **replaces a page's** main editor. |
| Board glyph | `src/renderer/editors/board/BoardGlyph.tsx` | Reactive board icon. |
| Board icon cache pattern | `src/renderer/editors/board/board-icon-cache.ts` | Module-level cache + `useXxx()` hook + `notify()`; the pattern the new usage cache mirrors. |
| Singleton full-page editor precedent | `src/renderer/editors/about/` (`AboutEditor.ts`, `index.tsx`) | `EditorModel` subclass, `noLanguage`/`skipSave`, fixed `ABOUT_PAGE_ID`; `showAboutPage`/`showStorybookPage` create `new PageModel(FIXED_ID)` + `addPage` (which **dedupes by id** — focuses the existing page). |
| "+" new-page dropdown | `src/renderer/ui/tabs/PageTabs.tsx` (`addPageMenuItems`, ~L140) | Builds menu items from `pinnedRefs` — editors + boards. |

### What is missing (new)

1. **The hub editor** (`tools-hub/`) — a singleton full-page `hasContentHost: false` editor.
2. **A `showToolsHubPage`** lifecycle method + `app.pages` exposure.
3. **The "Open in new tab" button** on the AppBar panel.
4. **The Search boards tab** — filter box + catalog cards + Install/Update/Properties/Refresh.
5. **Standalone gating** of pin actions — the Registered-boards pin button appears only for
   standalone boards. Needs a reactive per-root standalone lookup (manifest read) → a new
   `board-usage-cache.ts` mirroring `board-icon-cache.ts`.
6. **Two shared components extracted** from `ToolsEditorsPanel.tsx` so the panel and the hub
   render the same pinned rail and built-in list: `PinnedRail` and `BuiltinEditorsList`.
7. **`openBoardInfoPage(opts)`** — open the Board Info editor in a **new page** (the Search
   tab's actions), distinct from the existing page-replacing `openBoardInfo(page, opts)`.

### Key facts confirmed during investigation

- **`addPage` dedupes by page id** (`PagesLifecycleModel.ts:422`): passing `new
  PageModel(FIXED_ID)` focuses an existing same-id page and returns it. This is the singleton
  mechanism — **not** `registerWellKnownPage`, which builds a *text* model (log pages only).
  The hub follows the About/Storybook custom-editor-singleton pattern.
- The panel's Pinned region is **horizontal at the top** (full width, `borderBottom`,
  `maxHeight: 50%`); the hub wants it as a **vertical right rail** (fixed width, `borderLeft`,
  full height). Same rows, different container → `PinnedRail` takes a `layout` prop.
- `TrustedBoardsList`/`TrustedToolsList` already accept `onClose?` and open in a new page (no
  `pageId`) — drop straight into the hub with `onClose` omitted.
- Catalog entries (`PublishedBoardInfo`) already carry `fileMasks` + `standalone`, so the
  Search tab can derive `boardUsageGroup` **without** a manifest read (pass a manifest-shaped
  subset). Only the **Registered-boards** pin gating needs the on-disk manifest (hence the
  cache).

## Implementation plan

### Step 1 — Reactive standalone/usage cache

**New file `src/renderer/editors/board/board-usage-cache.ts`** — mirror `board-icon-cache.ts`
exactly (module `Map` cache + `pending` map + `listeners`/`notify()`):

- `resolveBoardUsage(boardRoot): Promise<BoardUsageGroup | null>` — `readBoardManifest(root)`
  then `boardUsageGroup(manifest)`; cache the group string. Concurrent calls share one read.
- `getBoardUsageSync(boardRoot): BoardUsageGroup | undefined` — memory-only.
- `useBoardStandalone(boardRoot): boolean | undefined` — subscribes to `notify`, kicks
  `resolveBoardUsage` if unprobed; returns `isBoardStandalone` equivalent (`group !== "file-viewer"`
  → standalone; `undefined` while unprobed). Note: `boardUsageGroup` already encodes standalone
  (`file-viewer` = non-standalone; `file-editor`/`tool` = standalone), so derive from the group.
- `invalidateBoardUsage(boardRoot)` — drop + re-probe (parity with the icon cache; used if a
  manifest edit changes standalone).

### Step 2 — Extract shared components from `ToolsEditorsPanel.tsx`

Pure refactor (no behavior change to the panel), so the hub can reuse them.

**New file `src/renderer/ui/sidebar/PinnedRail.tsx`** — move from `ToolsEditorsPanel.tsx`:
`draggingPinnedIndex`, `usePinnedDrag`, `PinnedEditorRow`, `PinnedBoardRow`, and the shared
`RowStyled` styled component (export `RowStyled` for `BuiltinEditorsList`). Component:

```tsx
export function PinnedRail({ layout, onClose }: {
    layout: "horizontal" | "vertical";
    onClose?: () => void;
}) {
    const browserProfiles = settings.use("browser-profiles");
    const pinnedRefs = usePinnedRefs();
    const editorById = useMemo(/* getCreatableItems(browserProfiles) → Map */);
    const activateBoard = useCallback((root) => {
        void app.events.openRawLink.sendAsync(createLinkData(encodePersephoneBoardLink(root)));
        onClose?.();
    }, [onClose]);
    if (pinnedRefs.length === 0) return null;           // rail hidden when empty
    return (
        <PinnedRegion data-layout={layout}>            // borderBottom+maxHeight:50% (horizontal) | borderLeft+width:240 (vertical)
            <SectionHeader>Pinned</SectionHeader>
            <PinnedScroll>{/* map pinnedRefs → PinnedBoardRow / PinnedEditorRow (unchanged) */}</PinnedScroll>
        </PinnedRegion>
    );
}
```

`PinnedRegion` gains a `data-layout` style branch (chrome exception, UIKit Rule 7) — horizontal
keeps today's `borderBottom`/`maxHeight:50%`; vertical uses `borderLeft`, fixed `width: 240`,
full height.

**New file `src/renderer/ui/sidebar/BuiltinEditorsList.tsx`** — move `rowTraits`,
`SectionMarker`/`RowSource`/`isSection`, `UnpinnedRow`, and the editors-tab `ListBox`:

```tsx
export function BuiltinEditorsList({ onClose }: { onClose?: () => void }) {
    const browserProfiles = settings.use("browser-profiles");
    const pinnedRefs = usePinnedRefs();
    // ...unpinnedItems (allItems minus pinned editor ids, sorted), tUnpinned, handlers...
    return <ListBox<RowSource> name="tools-builtin-list" items={tUnpinned} rowHeight={28}
        whiteSpaceY={8} onChange={handleChangeUnpinned} renderItem={renderUnpinned} />;
}
```

Imports `RowStyled` from `./PinnedRail`.

**Edit `src/renderer/ui/sidebar/ToolsEditorsPanel.tsx`** — becomes a thin composition:
- Add a small header row at the top of `PanelRoot` (before `PinnedRail`): a right-aligned
  `IconButton` (icon `NewWindowIcon` from `theme/icons`, `title="Open in new tab"`) →
  `pagesModel.showToolsHubPage({ tab: panelTabToHubTab(tab) })` then `onClose?.()`. Plain icon
  button (the panel does not use `SideBarPanelHeader`).
- Replace the inline pinned region with `<PinnedRail layout="horizontal" onClose={onClose} />`.
- Replace the editors-tab body with `<BuiltinEditorsList onClose={onClose} />`.
- Keep the `SegmentedControl` (editors / boards / tools) + `TrustedBoardsList`/`TrustedToolsList`.
- Delete the now-moved code (rows, traits, drag helpers, `RowStyled`).

### Step 3 — The hub editor

**New file `src/renderer/editors/tools-hub/ToolsHubEditor.ts`** (mirror `AboutEditor.ts`):

```ts
export const TOOLS_HUB_PAGE_ID = "tools-hub-page";
export type HubTab = "builtin" | "boards" | "search" | "tools";

export interface ToolsHubEditorState extends EditorStateBase {
    type: "toolsHubPage";
    tab: HubTab;
}

export const getDefaultToolsHubEditorState = (): ToolsHubEditorState => ({
    id: TOOLS_HUB_PAGE_ID,
    title: "Tools & Editors",
    modified: false,
    type: "toolsHubPage",
    editor: "tools-hub-view",
    tab: "builtin",
});

export class ToolsHubEditor extends EditorModel<ToolsHubEditorState> {
    readonly editorId = "tools-hub-view";
    noLanguage = true;
    skipSave = true;
    setTab(tab: HubTab) { this.state.update((s) => { s.tab = tab; }); }
}
```

`tab` lives in editor state → persists across restart (acceptable; the epic says
panel↔page tab sync is *not* required).

**New file `src/renderer/editors/tools-hub/index.tsx`** (mirror `about/index.tsx`):
`toolsHubModule: EditorModule` with `createEditor` + a `Component` wrapper rendering
`<ToolsHubView model={model as ToolsHubEditor} />`; re-export `TOOLS_HUB_PAGE_ID`,
`ToolsHubEditor`, `getDefaultToolsHubEditorState`, `HubTab`.

**New file `src/renderer/editors/tools-hub/ToolsHubView.tsx`** — layout:

```
┌───────────────────────────────────────────────┬───────────────┐
│  [ Built-in | Registered boards | Search | Tools ]   ← tab strip│   Pinned rail
│                                                 │  (PinnedRail  │
│   <tab body>                                    │   layout=     │
│                                                 │   "vertical") │
└───────────────────────────────────────────────┴───────────────┘
```

- Root: `Panel direction="row"`; left column (flex 1) = `SegmentedControl` (4 items) + body;
  right = `<PinnedRail layout="vertical" />` (no `onClose`).
- Tab value/onChange bound to `model.state.use().tab` / `model.setTab`.
- Body switch: `builtin` → `<BuiltinEditorsList />`; `boards` → `<TrustedBoardsList />`;
  `search` → `<SearchBoardsTab />`; `tools` → `<TrustedToolsList />`.
- `BuiltinEditorsList`/`TrustedBoardsList`/`TrustedToolsList` are rendered **without** `onClose`
  (hub stays open after an action).

### Step 4 — Search boards tab (the one new UI)

**New file `src/renderer/editors/tools-hub/SearchBoardsTab.tsx`**:

- Mount effect: `void publishedBoards.load(); void boardInstallRegistry.load();`.
- Reactive data: `publishedBoards.useCatalog()`, `boardInstallRegistry.useInstalled()` (or
  `useBoardUpdates()` for badges).
- Header row: a `Input` filter box (`placeholder="Search boards…"`, filters by
  name/description/masks, case-insensitive) + a **Refresh catalog** `IconButton`/`Button` →
  `void publishedBoards.refresh()`.
- Group the filtered catalog by `boardUsageGroup({ fileMasks: b.fileMasks, standalone: b.standalone })`
  into **File viewer** / **File editor** / **Tool / App** sections (only non-empty sections;
  section header reuses the `SectionHeader` style).
- **Board card** per entry (name, description, `v{version}`, mask chips via `Tag`, human size):
  - Installed-state badge: not installed → nothing; installed & no update → `Tag "Installed
    v{installedVersion}"`; update available → `Tag "Update" title="Update to v{latest}"`.
  - Incompatible (`!compatible`) → the card is dimmed and its install action disabled with a
    `Requires Persephone ≥ {minAppVersion}` hint (`Text color="light"`); compatibility comes
    from `publishedBoards.isCompatible(b.minAppVersion)`.
  - Actions:
    - not installed & compatible → **Install…** → `openBoardInfoPage({ catalogId: b.id })`.
    - installed → **Properties** → `openBoardInfoPage({ boardRoot: installedRoot })`;
      plus **Update…** (only if update available) → also `openBoardInfoPage({ boardRoot })`
      (properties mode surfaces the version list; no silent swap from the hub).
- All actions open the Board Info page — the single install/properties surface everywhere.

Human size: reuse an existing byte formatter if one exists in `core/utils`; otherwise a local
`formatBytes` (search first — do not add a duplicate).

### Step 5 — `openBoardInfoPage` helper

**Edit `src/renderer/editors/board-info/open-board-info.ts`** — add a sibling to the existing
page-replacing `openBoardInfo`:

```ts
/** Open the Board Info editor in a NEW page (hub actions). Unlike openBoardInfo(page, …),
 *  this does not touch any existing page — it creates a fresh Board Info page and focuses it. */
export async function openBoardInfoPage(
    opts: { catalogId?: string; boardRoot?: string },
): Promise<void> {
    const { app } = await import("../../api/app");
    const model = new BoardInfoEditorModel(
        new TComponentState({ ...getDefaultBoardInfoEditorState(), ...opts }),
    );
    await model.restore();
    app.pages.addPage(model as unknown as EditorModel);
}
```

(Mirrors `installPublished`'s fresh-install page creation, minus the completion promise. Do not
refactor `installPublished` in this task — leave US-869 code untouched.)

### Step 6 — Register + lifecycle wiring

**Edit `src/renderer/editors/register-editors.ts`** — add (near `about-view`):

```ts
editorRegistry.register({
    id: "tools-hub-view",
    name: "Tools & Editors",
    hasContentHost: false,
    accepts: () => -1,          // reached only via showToolsHubPage
    loadModule: async () => (await import("./tools-hub")).toolsHubModule,
});
```

**Edit `src/renderer/api/pages/PagesLifecycleModel.ts`** — add (mirror `showStorybookPage`):

```ts
showToolsHubPage = async (opts?: { tab?: HubTab }): Promise<void> => {
    const { TOOLS_HUB_PAGE_ID } = await import("../../editors/tools-hub");
    const model = await editorRegistry.createEditor("tools-hub-view");
    const page = new PageModel(TOOLS_HUB_PAGE_ID);
    const result = this.addPage(wrap(model), page);   // dedupes → existing page if open
    if (opts?.tab) {
        const editor = result.mainEditorInstance as unknown as { setTab?: (t: HubTab) => void };
        editor.setTab?.(opts.tab);                     // applies to the new OR existing page
    }
};
```

**Edit `src/renderer/api/pages/PagesModel.ts`** — expose
`showToolsHubPage = (opts?) => this.lifecycle.showToolsHubPage(opts);` (near `showStorybookPage`,
L266).

### Step 7 — Standalone gating of pin actions

**Edit `src/renderer/ui/sidebar/TrustedBoardsList.tsx`** — the pin button (`pin(root)`) should
render only for standalone boards. Wrap the pin control in a tiny per-row component that calls
`useBoardStandalone(root)` (Step 1) and returns `null` while `undefined` or when non-standalone:

```tsx
function BoardPinAction({ root, pinned, onToggle }: {...}) {
    const standalone = useBoardStandalone(root);
    if (!standalone) return null;                      // hide for file-viewer boards / until known
    return <IconButton size="sm" icon={pinned ? <PinFilledIcon/> : <PinIcon/>} .../>;
}
```

Update `renderTrailing`/`trailingVisible`/`getBoardContextMenu` so a non-standalone board with
an update still shows its **Update** tag/menu but no pin. This change is shared by the panel and
the hub (both render `TrustedBoardsList`). The `Pin/Unpin` context-menu entry (if any is added)
follows the same gate.

**"+" new-page dropdown** (`PageTabs.tsx`) and the **Pinned rail** need no change: pins are now
created only for standalone boards, so they naturally contain only standalone boards. A
pre-existing pin of a non-standalone board still opens correctly (its empty state) — accepted
low-risk legacy edge (see Concern 3).

## Concerns / Open questions

1. **Hub is a singleton — RESOLVED.** The hub is a utility page like **Settings / About /
   Storybook / Mneme config** — all singletons today (one tab; re-opening focuses it rather
   than spawning duplicates). It follows their exact precedent: fixed `PageModel` id +
   `addPage` (which dedupes by id). `well-known-pages.ts` is **unrelated** (it builds a *text*
   model for the MCP log views only) and is **not** touched by this task — the EPIC's loose
   phrase "well-known-pages pattern" just meant "singleton page."

2. **Shared-component extraction scope — RESOLVED (recommend).** Extracting `PinnedRail` +
   `BuiltinEditorsList` from `ToolsEditorsPanel.tsx` is a pure refactor with no behavior change,
   and is the only way to avoid duplicating the pinned-drag logic. Recommend doing it. (Both
   files live in `ui/sidebar/` beside the registry/pins they consume.)

3. **Registered-boards grouping — RESOLVED (recommend: Search tab only).** The epic mentions
   "board lists grouped by derived type." Grouping is applied in the **Search boards** tab,
   where `fileMasks`/`standalone` come from the catalog entry (no disk read). The **Registered
   boards** tab reuses the existing folder-compacted `BoardsTree` (`TrustedBoardsList`)
   unchanged — grouping the on-disk trusted tree by usage would need per-root manifest reads and
   restructure the shared tree, out of scope. Flagging in case the user wants grouped registered
   boards too.

4. **Standalone pin-gating precision — RESOLVED.** Gating happens at the pin **control** (hidden
   for non-standalone boards) via the new `board-usage-cache`. A legacy pin of a non-standalone
   board is left working (opens its empty state) rather than force-removed — no destructive
   migration. The pin button simply won't reappear for such boards.

5. **Hub tab persistence — RESOLVED.** `tab` is stored in editor state (persists across
   restart). Panel→hub "Open in new tab" maps the panel's current tab (editors→builtin,
   boards→boards, tools→tools; there is no panel "search") and applies it even when focusing an
   already-open hub page. Panel↔page live sync is explicitly not required (epic).

6. **Byte/size formatting — OPEN (verify at implementation).** Search for an existing
   human-size formatter in `core/utils` before adding a local `formatBytes`. Do not duplicate.

## Acceptance criteria

- The AppBar "Tools & Editors" panel shows an "Open in new tab" button that opens (or focuses)
  the singleton hub page; opening it twice does not create a second page.
- The hub shows four content tabs (Built-in / Registered boards / Search boards / Tools) and a
  Pinned rail; Built-in/Registered/Tools mirror the panel's content exactly (same registry,
  same trees, same pin model), because they render the extracted shared components.
- Pinning/unpinning from either the panel or the hub updates both (shared `pinned-items`), and
  the "+" new-page dropdown reflects the same pinned set.
- The Search boards tab lists the cached catalog grouped by usage (File viewer / File editor /
  Tool), filters by name/description/mask as you type, shows installed/update/incompatible
  badges, and its **Refresh catalog** action force-refreshes; **Install…** / **Properties** /
  **Update…** each open the Board Info page (install or properties mode) — installing a board
  with no matching file open works end-to-end.
- An incompatible board version is dimmed with a "Requires Persephone ≥ X" hint and cannot be
  installed from the card.
- The Registered-boards pin button appears only for standalone boards (tools/dashboards and
  file-editors); a file-viewer board (e.g. drawio-viewer) shows no pin button but still shows
  its Update tag/menu when an update exists.
- The panel refactor is behavior-preserving: the panel looks and works exactly as before the
  extraction (pinned drag-reorder, editors list, boards/tools tabs).
- `tsc` + `eslint` clean.

## Files changed

### New

| File | Purpose |
|------|---------|
| `src/renderer/editors/board/board-usage-cache.ts` | Reactive per-root usage-group/standalone cache (mirrors `board-icon-cache.ts`). |
| `src/renderer/ui/sidebar/PinnedRail.tsx` | Extracted pinned rail + rows + drag; exports shared `RowStyled`. Used by panel (horizontal) + hub (vertical). |
| `src/renderer/ui/sidebar/BuiltinEditorsList.tsx` | Extracted built-in creatable-items list. |
| `src/renderer/editors/tools-hub/ToolsHubEditor.ts` | Hub editor model (singleton, `tab` state). |
| `src/renderer/editors/tools-hub/index.tsx` | Hub `EditorModule` + exports. |
| `src/renderer/editors/tools-hub/ToolsHubView.tsx` | Hub layout (tab strip + right Pinned rail). |
| `src/renderer/editors/tools-hub/SearchBoardsTab.tsx` | Catalog browse tab (filter + grouped cards + actions). |

### Modified

| File | Change |
|------|--------|
| `src/renderer/ui/sidebar/ToolsEditorsPanel.tsx` | Thin composition: header "Open in new tab" button + `PinnedRail` + `BuiltinEditorsList`; delete moved code. |
| `src/renderer/ui/sidebar/TrustedBoardsList.tsx` | Gate pin control to standalone boards via `useBoardStandalone`. |
| `src/renderer/editors/board-info/open-board-info.ts` | Add `openBoardInfoPage(opts)` (new-page opener). |
| `src/renderer/editors/register-editors.ts` | Register `tools-hub-view`. |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | Add `showToolsHubPage(opts?)`. |
| `src/renderer/api/pages/PagesModel.ts` | Expose `showToolsHubPage`. |

### No changes needed (verified)

- `src/renderer/api/published-boards.ts`, `board-install-registry.ts`, `board-updates.ts` —
  already expose everything the Search tab needs (`useCatalog`, `refresh`, `isCompatible`,
  `useInstalled`, `useBoardUpdates`, `getBoardUpdate`).
- `src/renderer/editors/board/BoardsTree.tsx`, `tools/ToolsTree.tsx` — reused as-is via the
  Trusted lists.
- `src/renderer/editors/board/board-manifest.ts` — `isBoardStandalone`/`boardUsageGroup`
  already exist.
- `src/renderer/editors/board-info/BoardInfoEditorModel.ts` — install + properties modes already
  handle `catalogId`/`boardRoot` state.
- `src/renderer/api/pages/well-known-pages.ts` — not used (see Concern 1).
- `src/renderer/ui/tabs/PageTabs.tsx` — pin-driven dropdown needs no change (Step 7).

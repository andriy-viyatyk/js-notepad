# US-1066 — Convert LinksTiles to VirtualGridView

Epic: [EPIC-062 — De-React Epic E4](../../epics/EPIC-062.md)

Status: investigation and implementation plan only; implementation is not in scope for this
documenting phase.

## Goal

Convert the link-editor tile surface from the React RenderGrid contract to a native
VirtualGridView, including its private tile cell subtree, while preserving the public LinksTiles
face and existing link-editor callbacks. Remove stale source prose that names the React grid so
US-1067 can delete uikit/RenderGrid/ without leaving misleading documentation.

The tile cell is fixed-height: TILE_DIMENSIONS supplies a cellHeight for every view mode at
src/renderer/editors/link-editor/LinksTiles.tsx:18-29, and the React grid passes that value as
rowHeight at LinksTiles.tsx:404-416. The native target is therefore VirtualGridView, not
VirtualFlexGridView, whose purpose is content-measured row heights.

## Background

### Audit of the E4-8 amendment

The audit was repeated against the current tree before planning:

- The only remaining app-level consumer import of uikit/RenderGrid/ is LinksTiles.tsx:2-3.
  uikit/index.ts still contains the deliberate US-1067 barrel re-export at lines 125-144.
  LogBody.tsx no longer imports it after US-1065; its remaining match is in converted-host
  prose, not an import. LinksTiles.tsx is the only current consumer that still imports
  RenderGrid/RenderGridModel.
- The claimed eight RenderGridModel repointings are absent from the current source. The list and
  tree-provider boundary code already imports the native capability or unrelated VirtualGrid
  types: LinksList.tsx:1-6,39-40, LinkItemList.tsx:1-3,25-31, CategoryViewModel.ts:1-8,
  and TreeProviderViewModel.ts:1-6.
- The named prose sites are present at file-diff/RevisionPicker.tsx:98-100,
  git-tree/GitTreeEditorView.tsx:153-156, tree-provider/TreeProviderViewModel.ts:348-354,
  uikit/Tree/TreeModel.ts:173-176, uikit/Tree/types.ts:53-57,
  uikit/shared/async-ref.ts:17-18, and uikit/DataGrid/index.ts:8-17.
- The audit found additional source prose not listed in the amendment: migration-era
  uikit/CLAUDE.md:32-37,402-414 and port-history comments in
  uikit/VirtualGrid/VirtualGridView.ts:1-5, VirtualGridModel.ts:4-15,
  VirtualGrid/types.ts:2-8, VirtualGrid/rerender-check.ts:2-6, and
  VirtualGrid/renderInfo.ts:2-8. They are not consumers, but they would still make the epic's
  final grep -rn RenderGrid src/ property fail or describe a deleted implementation.

Therefore the audit confirms the amendment's substantive conclusion — there are no remaining
model repointings and the real conversion is LinksTiles — but it contradicts the amendment's
claim that its seven-file list is the complete prose inventory. This plan includes the additional
stale prose matches so the closing property is honest.

The amendment's separate #avg-container check also holds: the only remaining lookup is the
React engine's own marker at src/renderer/uikit/RenderGrid/RenderGrid.tsx:101-105; the tile
source has no closest(...) lookup at LinksTiles.tsx:64-117. The native grid exposes its actual
scroller as scrollElement at src/renderer/uikit/VirtualGrid/VirtualGridView.ts:204-214, so the
converted tile view must not search for an internal id.

### Current React surface and cell subtree

LinksTiles.tsx imports the React grid and React-only cell types at lines 1-3, imports React
Panel/IconButton at line 4, and owns the grid ref, measured size, favicon version, effects,
column calculation, and render closure at LinksTiles.tsx:316-402. The grid is returned directly
at LinksTiles.tsx:404-417; the function component contributes no layout element of its own.

The private LinksTileCell is a complete React cell subtree at LinksTiles.tsx:37-273. It
contributes an outer draggable/clickable div at lines 106-125, a column Panel at lines 127-137,
a fixed image region and title region at lines 138-193, an optional icon at lines 194-213,
hover action buttons at lines 214-251, and selection/drop overlays at lines 252-270. It uses
React state and hooks for dragging, failed-image state, archive-image resolution, Tor rewriting,
and favicon-driven reconciliation at LinksTiles.tsx:64-104,327-401.

The conversion must not put this subtree behind a React root. E4-3 requires a DOM-owned cell, so
the native view will construct the tile, image, fallback SVG, title, overlays, and native
IconButtonView children directly. The only current React-valued tile slot is
getAdditionalIcon?: (link: ILink) => React.ReactNode at LinksTiles.tsx:289-296; its sole live
caller returns a React PinFilledIcon at LinkItemTiles.tsx:129-131. The list pilot already
established the DOM-capable registry-name form, IconName, at LinksList.tsx:26-27 and
LinkItemList.tsx:141-143. US-1066 will apply the same conversion to the tile prop and its one
caller, using createIconElement at uikit/shared/slots.ts:46-63.

The React event surface is retained at the boundary: selection, context-menu, and drag callbacks
are typed with React event types in LinksTiles.tsx:45-61,289-311, while native listeners will
adapt events through toPublicEvent at uikit/shared/react-compat.ts:20-58. No onFocus or onBlur
handler exists in the tile source; the original cell handlers are only drag, click,
double-click, and context-menu at LinksTiles.tsx:85-117. The conversion therefore has no React
focus handler to translate to focusin/focusout. IconButtonView's existing tooltip focus behavior
remains its own native implementation at uikit/IconButton/IconButtonView.tsx:36-52 and
uikit/Tooltip/attach-tooltip.ts:224-225.

### Fixed-height engine mapping

The old component derives colCount from measured width and fixed cellWidth at
LinksTiles.tsx:341-354, then passes rowCount, columnCount, fixed rowHeight, fixed columnWidth,
renderCell, and onResize to React RenderGrid at lines 404-416. The native model accepts number or
thunk row/column counts, fixed element lengths, a DOM-returning renderer, and resize callbacks
at uikit/VirtualGrid/VirtualGridModel.ts:87-112. Its onFrameResize already recomputes geometry
and invokes onResize at VirtualGridModel.ts:277-305.

The view will keep a stable bound renderer and a width field/column-count thunk. On resize it will
update the width-derived column count and explicitly dirty the grid's geometry; on link/view-mode
changes it will preserve the existing scroll-to-top and full-row update behavior from
LinksTiles.tsx:331-354. VirtualGridModel.inputChanged() compares renderer identity at
VirtualGridModel.ts:333-385, and the view documents that changing a renderer closure would
rebuild visible cells at VirtualGridView.ts:270-289; the native renderer must therefore be a
stable field, with current props read from this.props and a cell record.

### Cell reuse, owned views, and teardown

VirtualGrid passes previous for the same coordinate and recycle() for a pooled element; the
contract explicitly says the pooled element retains children, attributes, and listeners and must
be overwritten by the renderer at uikit/VirtualGrid/types.ts:139-183. The pilot's LinksListView
uses the required stable renderer and previous/recycle shape at LinksListView.ts:89-121, and
rewrites every record field and geometry on admission at LinksListView.ts:281-347.
ListBoxView documents the same renderer-identity and reuse policy at
uikit/ListBox/ListBoxView.ts:30-56,297-343.

The tile record will retain the cell, tile root, panel and content hosts, image source/failure
state, current link/index, selection/drop/drag state, action-button views, and every callback.
A total write is required for both previous and recycle() because previous is keyed by coordinate
rather than link identity, as specified at uikit/VirtualGrid/types.ts:156-183. Action buttons
will be native IconButtonViews with registry names and retained in a set until view teardown;
they must not be disposed merely because a pooled cell leaves the viewport.

VanillaView.dispose() disposes registered children/resources before onDispose, attempts all
cleanups, and rethrows the first error at uikit/shared/vanilla-view.ts:58-102. The view must make
listeners inert before disposing the grid, then dispose retained action-button views, and ensure
onGridModel(null) cannot strand the caller's gridModelRef. The caller assigns the ref from
onGridModel and clears it in effect cleanup at LinkItemTiles.tsx:25-39; no caller bookkeeping
depends on an onDispose child access. The grid itself reports onView(null) during final cleanup at
VirtualGridView.ts:292-304.

### E4-15 checklist audit

1. Flex minimum: the tile's own column Panel is a flex item with flex={1} but has no minHeight
   in the React source at LinksTiles.tsx:127-137. The native panel must set minHeight: 0 from
   construction. Shared chrome is outside this task and will not be changed.
2. No-DOM components: LinksTiles returns the grid directly at LinksTiles.tsx:404-417, so the new
   VanillaView root is a newly required layout owner and must use display: contents. The private
   cell and its Panel/action components do contribute real layout boxes at
   LinksTiles.tsx:106-137,214-250; no other fragment/direct-child wrapper needs a
   display: contents substitution. The React-valued additionalIcon is an actual SVG child in
   the old tree at LinksTiles.tsx:194-212 and will become a registry-name SVG, not a React root.
3. Focus delegation: no tile onFocus/onBlur sites were found; the only original event handlers
   are listed at LinksTiles.tsx:85-117. Existing tooltip focusin/focusout remains at
   attach-tooltip.ts:224-225.
4. Stale selectors: no tile closest(...) lookup exists at LinksTiles.tsx:64-117. The deleted
   grid's #avg-container marker is confined to RenderGrid.tsx:101-105; the native view will use
   VirtualGridView.scrollElement at VirtualGridView.ts:204-214 if it ever needs the scroller.
5. Disposal order: the current React component has no teardown callback that reaches into a child;
   its two effects only update the grid and dirty cells at LinksTiles.tsx:331-354. The native
   plan registers inerting, favicon/image async cancellation, grid disposal, and retained
   action-button cleanup in an order that leaves caller bookkeeping clear even if a deep cleanup
   throws. VanillaView's full-snapshot/rethrow behavior is at vanilla-view.ts:58-102.
6. Frame-bearing content: tile cells contain normal img elements for the primary image and
   favicon plus fallback SVG at LinksTiles.tsx:148-166; there is no iframe, Monaco host, or other
   embedded frame in this subtree. The native grid's special keep-attached policy for frame-bearing
   cells is documented at VirtualGridView.ts:595-610, but no tile-specific frame hook is needed.

### Async image and favicon ownership

The archive-image hook is React-only: usePipeImageSrc uses useState/useEffect at
link-editor/pipe-image-src.ts:24-26,116-144, while its cache and async resolver are already
framework-free at pipe-image-src.ts:43-95. The native view must use exported synchronous and async
helpers from that module, repainting only current rows whose archive source resolves. It must
preserve the documented ordering — pipe/archive resolution before Tor rewriting — from
LinksTiles.tsx:75-83 and pipe-image-src.ts:108-114.

Favicon rendering reads the synchronous cache at LinksTiles.tsx:161-166, while the React hook
exists only to cause reconciliation at LinksTiles.tsx:327,395-401. The native owner should map
hostnames to current row indices, call getFaviconPath, subscribe with onFaviconReady, and dirty
only affected rows. The subscription API and unsubscribe behavior are at
favicon-cache.ts:139-160, and both asynchronous arms of the React hook are visible at
favicon-cache.ts:168-200.

## Implementation Plan

### 1. Replace the React implementation with a thin adapter

Modify src/renderer/editors/link-editor/LinksTiles.tsx:

- Keep LinksTilesProps and callback names, including React event types at the public boundary;
  change getAdditionalIcon to return IconName | undefined and onGridModel to use
  GridModelCapability | null, matching the list pilot at LinksList.tsx:26-27,39-40.
- Remove the React grid, cell JSX, hooks, React icon components, and grid-size state. Keep only
  type imports, the public props, and the adapter.
- Return mountVanilla(LinksTilesView, props), following LinksList.tsx:1-6,53-55.

Before:

    export function LinksTiles(props: LinksTilesProps) {
        // refs, hooks, counts, and a React renderCell closure...
        return <RenderGrid rowCount={counts.rowCount} columnCount={counts.colCount}
            rowHeight={dims.cellHeight} columnWidth={dims.cellWidth}
            renderCell={renderCell} onResize={setGridSize} />;
    }

After:

    export function LinksTiles(props: LinksTilesProps): React.ReactElement {
        return mountVanilla(LinksTilesView, props);
    }

### 2. Add the native tile host and fixed-height grid

Create src/renderer/editors/link-editor/LinksTilesView.ts:

- Extend VanillaView<LinksTilesProps> with a public constructor. Use a display: contents root
  because the React function returned the grid root directly and the adapter host already avoids
  becoming a layout item at uikit/shared/mount.tsx:86-90.
- Construct one VirtualGridView with rowCount, a width-derived columnCount thunk, fixed
  rowHeight, fixed columnWidth, fitToWidth, the stable bound renderCell, and onResize. Attach and
  mount the grid once in onMount; update options and dirty rows/geometry in onUpdate, never by
  re-appending the same root. VirtualGridView warns that redundant append can move a node and
  reset a scroller at VirtualGridView.ts:577-588.
- Forward view.model through onGridModel using GridModelCapability. The capability has only
  update and scrollToRow at uikit/VirtualGrid/types.ts:102-106, which are the methods used by
  LinkItemTiles.tsx:25-39.
- Preserve the old dimension calculation from LinksTiles.tsx:24-29,341-354, including the
  zero-link case and scrollToRow(0)/full-update behavior when links or view mode change.

Before:

    <RenderGrid rowCount={counts.rowCount} columnCount={counts.colCount}
        rowHeight={dims.cellHeight} columnWidth={dims.cellWidth}
        renderCell={renderCell} onResize={setGridSize} />

After:

    this.grid = new VirtualGridView({
        rowCount: this.rowCount,
        columnCount: this.columnCount,
        rowHeight: this.dimensions.cellHeight,
        columnWidth: this.dimensions.cellWidth,
        renderCell: this.renderCell,
        fitToWidth: true,
        onResize: this.onGridResize,
        onView: this.onGridView,
    });

### 3. Convert the tile cell to total-write native DOM

Implement a CellRecord/WeakMap<HTMLElement, CellRecord> in LinksTilesView.ts, following
LinksListView.ts:41-70,89-121,281-347:

- Select p.previous ?? p.recycle?.() ?? document.createElement("div"), retaining the grid-owned
  cell and its inner tile root across admissions.
- Apply applyCellStyle and the old cell padding/box sizing from LinksTiles.tsx:363-370.
- Build the inner tile root with width: 100%, height: 100%, display: flex, and the old title
  cursor/opacity behavior from LinksTiles.tsx:106-125.
- Build the link-tile panel through createPanelElement, preserving column flex, overflow,
  rounded border, hover reveal, and selected border; add minHeight: 0 at construction.
- Replace React Panel/IconButton/icon JSX with createPanelElement, IconButtonView, and
  createIconElement("rename" | "delete" | "globe" | "pin-filled"). Load existing Panel.css and
  IconButton.css directly where the native view owns those primitives, as IconButtonView does at
  uikit/IconButton/IconButtonView.tsx:9-12.
- Keep dedicated hosts for image, title, additional icon, actions, and selection/drop overlay.
  On every admission write current text, image/fallback, selected/drop state, action-button
  presence, callbacks, drag state, and all geometry. Clear optional hosts when their new value is
  absent; never let a prior occupant's icon, opacity, button, or overlay leak.
- Use native listeners installed once per pooled tile and resolve the current CellRecord from the
  WeakMap, as the list pilot does at LinksListView.ts:398-447.
- Adapt row click, double-click, context-menu, drag-enter/over/leave/drop, and drag-start/drag-end
  to the public callbacks. Preserve the OS-drag override before setTraitDragData, ctrlKey delete,
  stop-propagation on action buttons, and double-click-to-edit fallback from
  LinksTiles.tsx:85-117,222-247.

### 4. Make image and favicon changes explicit repaint owners

Modify src/renderer/editors/link-editor/pipe-image-src.ts without changing its cache policy:

- Export the existing synchronous cache lookup and async resolver, or equivalent narrowly named
  framework-free helpers, for the native view.
- Keep usePipeImageSrc only if another React caller still needs it, after checking rg callers.
  Do not add a React root or hook call to a tile cell.
- On archive resolution, dirty the rows currently mapped to that source and ignore completion after
  the view is inert or its link projection has changed. Preserve cache eviction and blob URL
  revocation at pipe-image-src.ts:98-105.

In LinksTilesView.ts:

- Maintain hostname → row indices and favicon unsubscribe callbacks. Rebuild them when links
  changes, and guard stale async completions with a generation/inert flag.
- Call getFaviconPath for disk resolution and onFaviconReady for pending fetches; update only
  those rows, following LinksListView.ts:174-210.
- Render the synchronous favicon path with a DOM img and fallback with the registry's globe SVG.
  Recompute the image source before applying Tor rewriting, and retain failedSrc behavior so a
  failed source is hidden only while that exact current source remains failed.

### 5. Adapt the one React-valued tile caller

Modify src/renderer/editors/link-editor/LinkItemTiles.tsx:3,129-131 only for the neutral icon
descriptor: remove the React PinFilledIcon import and return "pin-filled"/undefined from
getAdditionalIcon. Its grid model ref already uses GridModelCapability at lines 1-3 and 25-39,
so no RenderGridModel repointing is needed.

### 6. Rewrite the stale prose inventory

Rewrite each current comment to name the mechanism that exists now and preserve reasoning that is
still true:

| File and current lines | Planned wording/mechanism |
|---|---|
| file-diff/RevisionPicker.tsx:98-100 | The filler uses a fixed-height column-flex ancestor and a VirtualGrid root with flex: 1 1 auto plus its 100px fallback; cite VirtualGridView.ts:619-631. |
| git-tree/GitTreeEditorView.tsx:153-156 | Same current VirtualGrid flex/fallback explanation; keep the reason for direction="column". |
| tree-provider/TreeProviderViewModel.ts:348-354 | Explain that atomic publication avoids a transient root-only tree and unnecessary native virtual-grid geometry/clamp pass; current model clamps an over-large offset at VirtualGridModel.ts:527-540. |
| uikit/Tree/TreeModel.ts:173-176 | Say the memoized flat list is consumed by VirtualGrid and rows are indexed by rows.length; current tree host constructs VirtualGridView at TreeView.ts:173-177,316-355. |
| uikit/Tree/types.ts:53-57 | Say rowIndex is the index in the flat visible-row array consumed by VirtualGrid. |
| uikit/shared/async-ref.ts:17-18 | State that AsyncRef is used by the live VirtualGridModel for pre-mount imperative calls; the model owns containerRef at VirtualGridModel.ts:124-139. |
| uikit/DataGrid/index.ts:8-17 | Explain direct imports and the type-name collision they avoid without referring to the former barrel export. |
| uikit/CLAUDE.md:32-37,402-414 | Replace migration-era React-engine claims with current VirtualGrid multi-region/host-surface guidance. |
| uikit/VirtualGrid/VirtualGridView.ts:1-5 | Describe the DOM shell and nine regions directly. |
| uikit/VirtualGrid/VirtualGridModel.ts:4-15 | Describe plain-field lifecycle, ResizeObserver, and repaint callback directly; remove obsolete comparison prose. |
| uikit/VirtualGrid/types.ts:2-8 | Describe the DOM cell contract directly. |
| uikit/VirtualGrid/rerender-check.ts:2-6 | Describe dirty-set computation and its pure nature directly. |
| uikit/VirtualGrid/renderInfo.ts:2-8 | Describe visible-window arithmetic and the injected HTMLElement renderer directly. |

This prose sweep is deliberately limited to source files under src/. Living developer documents
are deferred to US-1067 and the epic-close document pass: doc/architecture/overview.md,
doc/architecture/folder-structure.md, doc/architecture/key-files.md,
doc/architecture/styling-inventory.md, and doc/de-react.md describe the current tree and must be
updated only after uikit/RenderGrid/ actually stops existing. Historical records are deliberately
excluded: doc/epics/EPIC-015.md through doc/epics/EPIC-061.md, doc/epics/completed.md,
doc/tasks/completed.md, and every prior doc/tasks/US-*/README.md must continue to describe what
was true when each record was written.

Do not delete uikit/RenderGrid/ or change src/renderer/uikit/index.ts; those are US-1067 and must
remain independently testable. Do not change TextChrome or shared editor chrome; the only flex
minimum in this task is the tile's own panel.

### 7. Verify without tests or implementation shortcuts

After implementation, verify:

- rg confirms no app-level import of uikit/RenderGrid/ remains outside the folder and no stale
  RenderGrid prose remains in src except any explicitly permitted US-1067-owned files. It does not
  rewrite historical task/epic records or the living developer-doc paths listed above; those are
  handed to US-1067 and the epic-close document pass.
- Typecheck, lint, and build cover compilation and bundling; no unit tests or test harnesses are
  added, per CLAUDE.md.
- Manual cold-load checks cover all four modes, responsive columns, scroll recycling,
  selection/drop/action clearing, drag policy, context-menu forwarding, archive images,
  favicon arrival, Tor suppression/routing, failed-image reset, and teardown.
- DOM inspection confirms display: contents where required, tile-panel min-height: 0, native
  data-type/data-name attributes, no React roots in cells, and no #avg-container lookup.
- No pooled tile contains a frame-bearing subtree, and action views are disposed only at teardown.

## Concerns / Open Questions

There are no unresolved design questions:

1. VirtualGridView is selected because all modes provide fixed cell heights at
   LinksTiles.tsx:18-29,404-416.
2. The React-valued additional-icon slot cannot survive inside a virtualized DOM cell under E4-3;
   the established registry-name pattern is already used at LinksList.tsx:26-27 and
   LinkItemList.tsx:141-143.
3. The archive-image hook has a framework-free cache/resolver at pipe-image-src.ts:43-95;
   exposing that mechanism is narrower than retaining a React root in each cell.
 4. The seven amendment-listed source prose sites and the six additional VirtualGrid/UIKit source
    prose inventories above are all in scope. Living developer docs are deferred to US-1067 and
    epic close, while historical epic/task records remain immutable. The RenderGrid folder and
    uikit/index.ts remain out of scope for US-1066.

## Acceptance Criteria

- LinksTiles.tsx is a thin mountVanilla face with no RenderGrid, RenderGridModel, React cell
  renderer, or per-cell React hooks; LinksTilesView.ts owns the native grid and cell DOM.
- Fixed-height dimensions and responsive column behavior match LinksTiles.tsx:18-29,341-354,
 404-416, using VirtualGridView rather than VirtualFlexGridView.
- The native root adds no layout box, the grid root is attached exactly once, and updates do not
  reparent the scroll container (mount.tsx:86-90; VirtualGridView.ts:577-588).
- Cells use previous/recycle, a stable renderer, total record writes, and retained native action
  views; selected/drop/drag/icon/action state is cleared or rewritten for every occupant
  (VirtualGrid/types.ts:139-183; LinksListView.ts:281-347).
- The tile's own panel has minHeight: 0; shared chrome is unchanged.
- No React root exists at any depth inside a virtualized tile. The additional icon uses IconName
  and the DOM icon builder; action icons use native IconButtonView string/DOM paths.
- Native events preserve public behavior, including drag override, raw drops, context menus,
  action propagation, Ctrl-delete, and double-click fallback (LinksTiles.tsx:85-117,222-247).
  There is no lost focus delegation because the React tile had no onFocus/onBlur handlers.
- Archive images and favicons use explicit row-scoped repaint owners, retain pipe-before-Tor
  ordering, and cannot update a disposed or repointed view
  (pipe-image-src.ts:68-95,108-144; favicon-cache.ts:139-200).
- Favicon behavior is exercised specifically for tiles, not inferred from the US-1062 list result:
  under npm start, after a fresh renderer start with cold memory cache and the same warm-disk-cache
  fixture C:\data\js-notepad-notes\temp\test.link.json used by the epic
  (doc/epics/EPIC-062.md:873-881), open the fixture in tile mode, capture the already-rendered
  tile rows and their favicon image sources, then wait for the asynchronous hostname resolution.
  A late hostname result must replace the fallback on every currently rendered row for that
  hostname and leave unrelated rendered rows untouched. Scroll through the 300-row generated
  fixture and back to the top, checking each tile's hostname-to-image mapping at rest, bottom, and
  return: no tile may lose its favicon, inherit another row's favicon, or contain a duplicate
  favicon image. The check must include a hostname shared by multiple visible tiles so the
  row-scoped onFaviconReady repaint path is exercised (LinksListView.ts:180-210;
  favicon-cache.ts:139-160).
- Teardown makes the view inert, disposes the grid and retained action views safely, and sends
  onGridModel(null) without stranded caller bookkeeping (vanilla-view.ts:58-102;
  VirtualGridView.ts:292-304; LinkItemTiles.tsx:25-39).
- Every listed stale prose reference is rewritten to describe the current mechanism, including
  the additional VirtualGrid/UIKit matches found by the audit.
- uikit/RenderGrid/ and src/renderer/uikit/index.ts are unchanged; no tests or harnesses are
  created.

## Files Changed summary

| File | Planned change |
|---|---|
| src/renderer/editors/link-editor/LinksTiles.tsx | Keep public props, change capability/icon types, and replace the React grid/cell implementation with the thin native adapter. |
| src/renderer/editors/link-editor/LinksTilesView.ts | New native host: fixed-height VirtualGridView, responsive columns, pooled cell record, native DOM/events, favicon ownership, and teardown. |
| src/renderer/editors/link-editor/LinkItemTiles.tsx | Change the pin additional-icon producer from a React SVG node to the "pin-filled" registry name; no grid-model repointing. |
| src/renderer/editors/link-editor/pipe-image-src.ts | Expose the existing framework-free archive-image cache/resolver needed by the native view while preserving the hook only where needed. |
| src/renderer/editors/file-diff/RevisionPicker.tsx | Rewrite the stale grid-root sizing comment for VirtualGrid. |
| src/renderer/editors/git-tree/GitTreeEditorView.tsx | Rewrite the stale grid-root sizing comment for VirtualGrid. |
| src/renderer/components/tree-provider/TreeProviderViewModel.ts | Rewrite transient-tree/scroll prose for current native virtual-grid clamp behavior. |
| src/renderer/uikit/Tree/TreeModel.ts; src/renderer/uikit/Tree/types.ts; src/renderer/uikit/shared/async-ref.ts | Rewrite stale current-mechanism comments. |
| src/renderer/uikit/DataGrid/index.ts; src/renderer/uikit/CLAUDE.md | Remove deleted-engine prose while retaining direct-import and current primitive guidance. |
| src/renderer/uikit/VirtualGrid/VirtualGridView.ts; src/renderer/uikit/VirtualGrid/VirtualGridModel.ts; src/renderer/uikit/VirtualGrid/types.ts; src/renderer/uikit/VirtualGrid/rerender-check.ts; src/renderer/uikit/VirtualGrid/renderInfo.ts | Remove deleted-source attribution while retaining the native engine rationale. |
| doc/active-work.md | Convert the existing US-1066 line under EPIC-062 into one link; do not duplicate it. |
| uikit/RenderGrid/ and src/renderer/uikit/index.ts | No changes; reserved for US-1067. |
| src/renderer/editors/base/TextChrome.tsx | No change; shared chrome is outside the tile-local E4-15 fix. |
| src/renderer/editors/link-editor/LinkItemList.tsx; src/renderer/editors/link-editor/panels/LinkHostnamesNavigationPanel.tsx; src/renderer/editors/link-editor/panels/LinkTagsSecondaryView.tsx | No RenderGridModel repointing; their current capability contracts were verified already. |
| src/renderer/components/tree-provider/CategoryViewModel.ts; src/renderer/components/tree-provider/CategoryViewImpl.ts; src/renderer/components/tree-provider/TreeProviderViewImpl.ts | No RenderGridModel repointing; their current native/tree contracts were verified already. |
| Tests or test harnesses | No changes; prohibited by project instructions. |

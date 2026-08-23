# US-1038: `CategoryView` vanilla conversion

**Status:** Planned
**Epic:** [EPIC-058 - De-React Epic D: Shell and shared components](../../epics/EPIC-058.md)
**Depends on:** [US-1029 - Tree primitive seams](../US-1029-tree-provider/README.md), [US-1026 - components/icons vanilla DOM views](../US-1026-components-icons-vanilla-views/README.md), and the existing vanilla `Input`, `IconButton`, and `VirtualGrid` views
**Parallel with:** [US-1037 - `TreeProviderView`](../US-1037-tree-provider-view/README.md)

## Goal

Convert only `components/tree-provider/CategoryView` to a vanilla view behind its existing public
face and single production caller. Preserve the editor-owned React `renderItems` island and its
`RenderGridModel` callback; this task converts the category shell, controls, state arms, footer,
and focus/drop behavior without converting `LinksList` or `LinksTiles`.

## Background and verified inventory

`CategoryView.tsx` is 360 lines and is mounted only by `editors/category/CategoryEditor.tsx`. It
currently owns a styled root, a search/view-mode toolbar portal, loading/error/empty arms, a
tile-mode focus scope, a fixed 29px footer, and an editor callback that returns React
`LinksList`/`LinksTiles` content. `CategoryViewModel.ts` remains the owner of filtering, selection,
watching, drag/drop, CRUD, and the existing `RenderGridModel` callback type.

The category conversion is deliberately not a RenderGrid conversion. CategoryViewModel's
`RenderGridModel` type import remains because the editor-owned LinkList/LinkTiles bridge still
needs it; the thin CategoryView face stops importing RenderGrid directly. The Epic D RenderGrid
count is therefore 12→10, not 12→9.

The current view's Emotion selectors and DOM contracts include the content/focus wrapper, the
`data-drop-active` outline, the caller-owned `toolbarPortalRef`, and the fixed footer. Loading and
error currently replace the rendered root and omit the toolbar portal; that arm-specific behavior
must be made explicit rather than accidentally lost in a stable vanilla root.

## Implementation plan

### 1. Measure and freeze the category boundary

- Capture the settled React Rule 4 measurement for one category interaction before editing, with
  exact observer roots/options and raw records recorded in EPIC-058. This is the irreversible
  baseline for the category unit.
- Preserve `CategoryView` exports, `CategoryViewModel` callbacks, `CategoryEditor` props, and the
  editor-owned `renderItems` callback. Do not convert `LinksList`, `LinksTiles`, or their models.
- Before writing CSS, grep the category and editor-owned styles for `>`, `:empty`, `:nth-child`,
  `+`, and `~`, and check the new bridge hosts against every direct-child/empty assumption.

### 2. Build the native shell and app-layer styles

- Keep `CategoryView.tsx` as a thin `mountVanilla` face and create a pure-DOM native view with a
  public constructor and constructor-registered model-driver cleanup.
- Build one stable root with the current flex/column/full-size/overflow behavior and
  `data-drop-active` outline. Replace the old Panel usage with a plain `panel-root` element plus
  the same data attributes and static site layout values in a new `@layer app` stylesheet; no
  `PanelView` exists, so do not invent one here.
- Keep loading/error/empty content as explicit child arms. Verify the intentional DOM difference
  from React's current root replacement and ensure no caller depends on the old direct-child shape.
- Keep the root and content/focus scope display/layout contracts so the category remains the same
  containing block and the tile scope remains a real focusable ancestor.

### 3. Preserve the editor-owned React island

- Mount one React bridge for the whole `renderItems` result under the category content/focus scope;
  never create one React root per item or per icon. A string/empty arm must not leave an unnecessary
  visible placeholder.
- Keep the bridge's `onGridModel` callback unchanged. It is a compatibility callback for the
  editor-owned list/tile renderer, not permission to create a second generic grid here.
- Re-render the bridge only when its category projection changes. Preserve callback identity and
  the existing React lifecycle while rows are filtered, selected, dragged, or switched between
  list and tile mode.
- Keep `getLabel`/editor content React-facing where the editor owns it; direct icon and menu Node
  conversions belong to the later category implementation boundary, not to a hidden second root.

### 4. Recreate toolbar controls and popup behavior

- Append `InputView` and optional clear/view-mode `IconButtonView` roots to the caller-owned
  `toolbarPortalRef`, removing only the nodes this view owns. Never call `replaceChildren()` on the
  toolbar and tolerate target changes or a target disappearing.
- Keep the search close button as the Input's end slot, present only for non-empty search text, and
  use stable node identity so InputView does not detach/reappend it on every update.
- Preserve search Escape, blur-hide, clear, `setTimeout(..., 0)` focus behavior, selected href,
  and view-mode popup positioning. For view-mode menu entries use direct icon Nodes from
  `createIconElement`, never a bare icon-name string; `fillSlot` treats a string as text.
- Attach/dispose portal nodes with the view lifecycle and verify loading/error arms remove their
  controls exactly as the current React path does.

### 5. Project category state with separate repaint gates

- Bind the filtered item projection, selected href, `selectedHrefs` array, and drop target to the
  bridge/grid arm. Do not compare the freshly-created `selectedIds` Set; compare the source array
  so unrelated state writes do not repaint the whole child.
- Keep two distinct gates from the React view: (1) filtered items, selected href, selected hrefs,
  and drop target trigger `update({ all: true })`; (2) view-mode changes first scroll to row zero
  and then update all. Do not collapse them into a progress-style combined selector.
- Preserve `traited([state.displayTree], tpvNodeTraits)` identity gating so every state write does
  not re-wrap the tree. Keep active selection and tile focus in view-local fields.
- Reconcile the bridge/content synchronously, then queue one guarded measurement pass after DOM
  attachment if the footer or drop geometry needs it. Avoid React render-phase timing workarounds.

### 6. Preserve interactions, footer, and disposal

- Preserve item click/double-click/context-menu, row/whitespace drag targets, native OS drag-out,
  selection/drop state, and the fixed 29px footer with count/selection label.
- Keep the tile `data-focus-selection` scope and `tabIndex=0`; it must be a real focusable ancestor
  even though its child renderer is a React island.
- Set the view inert before disposing the bridge, portal controls, subscriptions, and model driver.
  No late watch, async, or bridge callback may write to detached DOM.
- Verify a category page in list and tile mode, search/clear, selection, drop-active, loading/error/
  empty, multiline messages, toolbar portal changes, and editor-owned React content.

## Concerns / open questions

### 1. The editor island is intentional and bounded

`renderItems` returns React content and the only caller owns `LinksList`/`LinksTiles`. Keep one
compatibility root for that subtree until the editor tasks convert it. Do not create per-row roots
and do not claim that this task removes CategoryViewModel's `RenderGridModel` type importer.

### 2. Portal ownership must stay one-way

The toolbar target belongs to the editor. Append only the view's controls, remove only those exact
nodes, and survive target replacement or unmount. This is the native equivalent of the existing
portal and must not delete breadcrumbs or other toolbar contributions.

### 3. Loading/error arms currently remove the toolbar

React returns a bare root for loading/error, so the portal controls disappear in those arms. The
vanilla view must choose that behavior deliberately and test the transitions; a stable root alone
does not preserve it automatically.

### 4. CSS wrapper depth and Panel replacement

Panel has no vanilla view. Reuse `panel-root` and the same data attributes so existing Panel.css
contracts apply where appropriate, but move site-specific flex/shrink/padding/gap/height values to
the category app stylesheet. Check all direct-child/empty selectors after adding bridge elements.

### 5. Repaint gates must not use a new Set as their baseline

`selectedIds` is rebuilt from `selectedHrefs`; comparing the Set identity would force a repaint on
unrelated renders. Keep the source array as the dependency and preserve the two separate effects.

### 6. Category labels and editor content can still be React

The common label path is a string, but `LinkCategoryPanel`'s `getTreeItemLabel` returns styled
spans/highlight nodes in some cases. Preserve that boundary where it is actually consumed; do not
turn React content into `[object Object]` while trying to make the shell framework-neutral.

## Acceptance criteria

- [ ] The sole `CategoryView` production mount runs through a vanilla view with unchanged public
      props, exports, and model callbacks.
- [ ] The category shell, loading/error/empty arms, drop outline, list/tile focus scope, footer,
      and 29px height remain correct in both themes.
- [ ] The editor-owned `renderItems` bridge is one React root for the subtree, retains its
      `RenderGridModel` callback, and does not create per-row/icon roots.
- [ ] Toolbar controls remain in the caller-owned portal without clearing unrelated nodes; search,
      clear, Escape, blur-hide, focus timing, and view-mode popup behavior remain correct.
- [ ] The two repaint gates use the correct filtered/selection/drop and view-mode dependencies,
      comparing `selectedHrefs` rather than Set identity.
- [ ] List/tile selection, item actions, drag/drop, native drag-out, loading/error/empty arms, and
      async disposal behavior remain correct.
- [ ] View-mode menu icons use direct Nodes, not bare icon-name strings.
- [ ] The category Rule 4 measurement is recorded in EPIC-058, or marked pending with the live-MCP
      reason; no fabricated baseline is accepted.
- [ ] `npm run typecheck`, `npm run lint`, `npm run build-prod`, and `git diff --check` pass.

## Files expected to change

| File | Change |
|---|---|
| `src/renderer/components/tree-provider/CategoryView.tsx` | Thin public mount face |
| `src/renderer/components/tree-provider/CategoryViewImpl.ts` | New native category shell, portal, footer, and bridge; distinct basename avoids the `.ts`/`.tsx` barrel collision |
| `src/renderer/components/tree-provider/CategoryView.css` | App-layer category shell/content/footer styles |
| `src/renderer/components/tree-provider/CategoryViewModel.ts` | No runtime conversion; retain the editor-owned `RenderGridModel` type callback |
| `src/renderer/uikit/shared/fill-slot.ts` | Reuse existing bridge only if needed; do not add a second slot helper |
| `doc/architecture/key-files.md` | Add the native category view owner if it becomes index-worthy |
| `doc/active-work.md` | Task tracking |
| `doc/epics/EPIC-058.md` | Rule 4 measurement and task status |

`CategoryEditor.tsx`, `LinksList`, `LinksTiles`, their models, and all editor callers remain outside
this task. `CategoryViewModel.ts` remains a RenderGrid type importer by design.

## Related work

- [EPIC-058 - De-React Epic D](../../epics/EPIC-058.md)
- [US-1029 - Tree primitive seams](../US-1029-tree-provider/README.md)
- [US-1037 - `TreeProviderView`](../US-1037-tree-provider-view/README.md)
- [US-1028 - File search and VirtualGrid collection](../US-1028-file-search/README.md)
- [US-1010 - Toolbar, splitter, breadcrumb, and collapsible stack](../US-1010-chrome-vanilla-conversions/README.md)

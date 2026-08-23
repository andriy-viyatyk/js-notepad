# US-1038: `CategoryView` vanilla conversion

**Status:** Implemented — typecheck, lint, production build, and diff checks pass; live category smoke testing remains for epic close.
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

- Do not add a per-category Rule 4 baseline/after gate here. EPIC-058 C2-9 owns one measured
  context-menu interaction for the whole epic; its React baseline belongs to US-1005 and its
  after-number to US-1006. Before the epic closes, take the after-number on the current tree and
  recover the pre-US-1005 baseline from commit `cdc12530` in a throwaway worktree if necessary.
  This task must not substitute a category measurement for that epic prerequisite.
- Preserve `CategoryView` exports, `CategoryViewModel` callbacks, `CategoryEditor` props, and the
  editor-owned `renderItems` callback. Do not convert `LinksList`, `LinksTiles`, or their models.
- Before writing CSS, grep the category and editor-owned styles for `>`, `:empty`, `:nth-child`,
  `+`, and `~`, and check the new bridge hosts against every direct-child/empty assumption.

### 2. Build the native shell and app-layer styles

- Keep `CategoryView.tsx` as a thin `mountVanilla` face and create a pure-DOM native view with a
  public constructor and constructor-registered model-driver cleanup. `CategoryViewModel` has no
  registered effects, so it satisfies the driver's zero-effect precondition.
- Build one stable root with the current flex/column/full-size/overflow behavior and
  `data-drop-active` outline. Replace the old Panel usage with a plain `panel-root` element plus
  the same data attributes and static site layout values in a new `@layer app` stylesheet; no
  `PanelView` exists, so do not invent one here.
- Keep loading/error/empty content as explicit child arms. Verify the intentional DOM difference
  from React's current root replacement and ensure no caller depends on the old direct-child shape.
- Keep the root and content/focus scope display/layout contracts so the category remains the same
  containing block, the tile scope remains a real focusable ancestor, and the stable root keeps
  `tabIndex={-1}` so Ctrl+A/Delete/Escape can bubble from the focused item grid to the model.

### 3. Preserve the editor-owned React island

- Mount one React bridge for the whole `renderItems` result under the category content/focus scope;
  never create one React root per item or per icon. `renderItems` may be called only for the real
  arm: it constructs React elements without side effects, so loading/error/empty arms do not need
  to build or retain them.
- Keep the bridge's `onGridModel` callback unchanged. It is a compatibility callback for the
  editor-owned list/tile renderer, not permission to create a second generic grid here.
- Re-render the bridge only when its category projection changes. Preserve callback identity and
  the existing React lifecycle while rows are filtered, selected, dragged, or switched between
  list and tile mode. Because the React root is concurrent, set a `pendingRepaint` flag when the
  projection changes and flush it from both `onGridModel` (when the child model exists) and the
  path after the bridge render is queued; do not use `flushSync`. This prevents a same-tick grid
  repaint from targeting the previous React commit or being dropped on the first render.
- Keep `getLabel`/editor content React-facing where the editor owns it; direct icon and menu Node
  conversions belong to the later category implementation boundary, not to a hidden second root.

### 4. Recreate toolbar controls and popup behavior

- Append `InputView` and optional clear/view-mode `IconButtonView` roots to the caller-owned
  `toolbarPortalRef`, removing only the nodes this view owns. The target is normally `null` on the
  first render: on every update compute the desired target as `(real arm && props.toolbarPortalRef)
  || null`, detach this view's nodes from the old target when it changes, and append them to the new
  target. Never call `replaceChildren()` on the toolbar and tolerate a target disappearing.
- Keep the search close button as the Input's end slot, present only for non-empty search text, and
  use stable node identity so InputView does not detach/reappend it on every update.
- Preserve the category search's actual behavior: Escape prevents default and clears the search,
  and the clear button clears the search and blurs the input. There is no blur-hide or timed Ctrl+F
  focus behavior in this component. Reach the private input through its callback `ref` and the
  `bindRef` seam when the clear button needs to blur it. The input has no `size` prop, so keep its
  default `md` size. For view-mode menu entries use direct icon Nodes from `createIconElement`,
  never a bare icon-name string; `fillSlot` treats a string as text.
- Attach/dispose portal nodes with the view lifecycle and verify loading/error arms remove their
  controls exactly as the current React path does.

### 5. Project category state with separate repaint gates

- Bind the filtered item projection, selected href, `selectedHrefs` array, and drop target to the
  bridge/grid arm. Do not compare the freshly-created `selectedIds` Set; compare the source array
  so unrelated state writes do not repaint the whole child.
- Keep two distinct gates from the React view: (1) filtered items, selected href, selected hrefs,
  and drop target trigger `update({ all: true })`; (2) view-mode changes first scroll to row zero
  and then update all. Do not collapse them into a progress-style combined selector.
- Keep active selection and tile focus in view-local fields. CategoryView has no provider-tree
  `displayTree`/`tpvNodeTraits` projection; do not copy that TreeProviderView concern here.
- Reconcile the bridge/content synchronously, then queue one guarded measurement pass after DOM
  attachment if the footer or drop geometry needs it. Avoid React render-phase timing workarounds.

### 6. Preserve interactions, footer, and disposal

- Preserve item click/double-click/context-menu, row/whitespace drag targets, native OS drag-out,
  selection/drop state, and the fixed 29px footer with count/selection label.
- Adapt the model's React-typed keyboard and background-context-menu callbacks with
  `toPublicEvent`; do not pass native events directly across that boundary.
- Use the existing `SpacerView` for the footer's flexible spacer rather than hand-rolling a second
  spacer contract.
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

The toolbar target belongs to the editor and is `null` during the first render. The idempotent
update rule must append only the view's controls once the callback-ref target arrives, remove only
those exact nodes when it changes or disappears, and survive unmount. This is the native equivalent
of the existing portal and must not delete breadcrumbs or other toolbar contributions.

### 3. Loading/error arms currently remove the toolbar

React returns a bare root for loading/error, so the portal controls disappear in those arms. The
desired-target calculation in step 4 must therefore use the real-arm predicate on every update;
that one rule detaches the controls during loading/error and reattaches them when the real arm
returns. No second portal mechanism is needed.

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

### 7. The model-driver precondition and native event boundary

`CategoryViewModel` registers no component effects, so it satisfies the zero-effect precondition of
`createComponentModelDriver`. Its `onKeyDown` and `onBackgroundContextMenu` callbacks retain React
event types at the model boundary; the vanilla view must pass them through `toPublicEvent`, while
the stable root's `tabIndex={-1}` preserves the bubbling path from the focused grid.

## Acceptance criteria

- [x] The sole `CategoryView` production mount runs through a vanilla view with unchanged public
      props, exports, and model callbacks.
- [ ] The category shell, loading/error/empty arms, drop outline, list/tile focus scope, footer,
      and 29px height remain correct in both themes.
- [x] The editor-owned `renderItems` bridge is one React root for the subtree, retains its
      `RenderGridModel` callback, does not create per-row/icon roots, and flushes a pending grid
      repaint after the concurrent bridge commit.
- [x] Toolbar controls remain in the caller-owned portal without clearing unrelated nodes; the
      late callback-ref target, target replacement/disappearance, search clear/Escape, input blur,
      and view-mode popup behavior remain correct.
- [x] The two repaint gates use the correct filtered/selection/drop and view-mode dependencies,
      comparing `selectedHrefs` rather than Set identity.
- [ ] List/tile selection, item actions, drag/drop, native drag-out, loading/error/empty arms, and
      async disposal behavior remain correct.
- [x] View-mode menu icons use direct Nodes, not bare icon-name strings.
- [x] The stable category root retains `tabIndex={-1}`; the tile focus scope retains `tabIndex=0`,
      and callback refs allow the clear button to blur the InputView field.
- [x] `npm run typecheck`, `npm run lint`, `npm run build-prod`, and `git diff --check` pass.

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
| `doc/epics/EPIC-058.md` | Task status; the epic-owned Rule 4 measurement remains outside this task |

`CategoryEditor.tsx`, `LinksList`, `LinksTiles`, their models, and all editor callers remain outside
this task. `CategoryViewModel.ts` remains a RenderGrid type importer by design.

## Related work

- [EPIC-058 - De-React Epic D](../../epics/EPIC-058.md)
- [US-1029 - Tree primitive seams](../US-1029-tree-provider/README.md)
- [US-1037 - `TreeProviderView`](../US-1037-tree-provider-view/README.md)
- [US-1028 - File search and VirtualGrid collection](../US-1028-file-search/README.md)
- [US-1010 - Toolbar, splitter, breadcrumb, and collapsible stack](../US-1010-chrome-vanilla-conversions/README.md)

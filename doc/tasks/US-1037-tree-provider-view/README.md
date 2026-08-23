# US-1037: `TreeProviderView` vanilla conversion

**Status:** Planned
**Epic:** [EPIC-058 - De-React Epic D: Shell and shared components](../../epics/EPIC-058.md)
**Depends on:** [US-1029 - Tree primitive seams](../US-1029-tree-provider/README.md), [US-1026 - components/icons vanilla DOM views](../US-1026-components-icons-vanilla-views/README.md), and [US-1028 - file-search and VirtualGrid collection](../US-1028-file-search/README.md)
**Parallel with:** [US-1038 - `CategoryView`](../US-1038-category-view/README.md)

## Goal

Convert only `components/tree-provider/TreeProviderView` to a vanilla view behind its existing
public React face and seven production mounts. `CategoryView`, its model, and all callers remain
unchanged. The provider tree must retain its loading/search/selection/drag/context-menu behavior
while using the additive Tree seams from US-1029.

## Background and verified inventory

`TreeProviderView.tsx` is the rendered half of a 1,156-line model contract. It is mounted by seven
callers: archive editor and secondary view, explorer secondary view, Mneme secondary view,
`LinkCategoryPanel`, `ScriptLibraryPanel`, and `MenuBar`. The model has no registered effects, so a
`createComponentModelDriver` is sufficient; its asynchronous provider/watch work still needs an
inert/disposal guard.

The current view combines a `Tree` custom `renderItem`, a search `Input`, a provider-specific icon
resolver, a root keyboard/context-menu handler, drag/drop callbacks, and error/empty `Panel` arms.
US-1029 supplies the missing `iconElement`, `hideChevron`, trailing, and per-row context-menu
projection. `createTreeProviderItemIconElement` is the direct DOM resolver. The React
`tpvNodeTraits.icon` accessor must be removed from the final projection so it cannot create a React
icon per pooled row.

There is no provider-tree favicon subscription today. `TreeProviderItemIcon` reads the synchronous
favicon cache during a parent render, while the provider tree does not use `useFavicons`. This task
preserves that pre-existing refresh gap; it does not add `onFaviconReady` or a disk-warm-up helper.
File/system/board icon invalidation through `subscribeFileIconElements` is preserved because the
existing direct icon helper already has that channel.

## Implementation plan

### 1. Measure and freeze the provider boundary

- Capture the settled React Rule 4 measurement for one provider interaction before editing, with
  the exact observer roots/options and raw records recorded in EPIC-058. The measurement cannot be
  recovered after conversion.
- Re-scan the seven mounts and preserve all public props, model callbacks, exports, and caller
  imports. Do not touch `CategoryView` or `CategoryEditor` here.
- Inspect the existing Emotion blocks and each caller for `>`, `:empty`, `:nth-child`, `+`, and
  `~` selectors before introducing the stable root/arm structure.

### 2. Build the native provider view and model driver

- Keep `TreeProviderView.tsx` as a thin `mountVanilla` face with the current public name and prop
  types. The native view module has a public constructor, constructs the model driver in that
  constructor, and registers driver disposal there.
- Build the stable root with `data-type="tree-provider-view"`, the current flex/column/full-size
  layout, hidden overflow, and root keyboard/context-menu behavior. Preserve residual prop order
  and use `toPublicEvent` where model APIs still expect React-shaped events.
- Pump only the model's required props into `createComponentModelDriver`; do not reconstruct the
  model on every host update. `onUpdate` should only project current state/props into existing
  children.
- Repoint `TreeProviderViewModel.ts`'s `RowAlign` type import from `uikit/RenderGrid` to
  `uikit/VirtualGrid`; this is the D8 collection for the provider model.

### 3. Project the Tree and provider rows

- Create and dispose one `TreeView` for the live real arm, passing the existing display tree,
  child/loading/selection/expansion, active index, lazy loading, drag/drop, and callbacks.
- Use `createTreeProviderItemIconElement` through `iconElement`, not the React icon prop. Remove
  `tpvNodeTraits.icon` so the old React resolver cannot remain live. Keep `TreeProviderItemIcon.tsx`
  only if the full repository caller scan finds a non-provider consumer.
- Convert `item-menus.tsx` and `plural-actions.tsx` icon values from React nodes to actual DOM Nodes
  from `createIconElement(...)`. Never pass bare icon-name strings: `fillSlot` treats a string as
  text, and `MenuItem.icon` is typed too broadly to catch that mistake.
- Pass `hideChevron={ctx.level === 0}`, `tooltip={node.data.href}`, the live `renderTrailing`
  result, and the per-row provider context-menu callback. Preserve the row handler's ordering:
  selection first, then `ContextMenuEvent.fromNativeEvent(e, "tree-provider-item")`, target
  stamping, and the asynchronous promise. The root background handler must continue to observe the
  stamped native event while bubbling.
- Preserve `getLabel`: strings stay native text/highlight content; the one `LinkCategoryPanel`
  path that returns styled/highlight React nodes uses the documented label compatibility bridge.
  Do not create a React root per icon or per ordinary string row.

### 4. Recreate search and state arms

- Build the search row with `InputView` and `IconButtonView`, keeping `data-type="tpv-search"`,
  `data-name`, top border, padding, size, placeholder, Escape, blur-hide, clear, and focus return
  behavior. Keep the close button as a stable `endSlot` node that is present only when search text
  is non-empty; do not append a sibling into the input's slot host.
- Preserve the Ctrl+F `setTimeout(..., 0)` focus timing and root Escape behavior.
- Preserve the `searchKey` dispose-and-replace boundary. When the deep/shallow search boundary or
  clear changes the key, dispose the old Tree before creating the new one and preserve the model
  notification sequence.
- Reproduce error and empty arms with native panel-compatible elements and their existing data
  attributes, padding, text, and color tokens. Confirm the new stable root does not break any
  caller-owned direct-child or empty selectors.

### 5. Dispose and verify asynchronous work

- Set the view inert before disposing the Tree, search views, icon subscription, and model driver.
  No provider/watch/icon callback may write to a detached root or call `onModel` after disposal.
- Run typecheck, lint, build-prod, and diff hygiene. Verify no production view hooks, Emotion wrapper,
  or per-row React root remains in the native implementation.
- Smoke test one file provider, archive, Mneme, script-library, MenuBar, and category-link mount:
  loading/error/empty, lazy expansion, deep/shallow/clear search, keyboard selection/actions,
  context menus including async provider menus, drag/drop, clipboard actions, and disposal during
  watch refresh.
- Check provider icon branches (git, Mneme, board, folder, file, system fallback). Record the
  existing favicon refresh gap rather than claiming new `onFaviconReady` behavior.

## Concerns / open questions

### 1. Row context menus are not `getContextMenu`

The provider row callback must be bound per row. Delegating it from the Tree root changes bubbling
order and breaks the folder/background guard, which depends on the row handler stamping the same
native event. Preserve the exact event source string and async promise fields.

### 2. `renderTrailing` remains a React compatibility arm

Explorer supplies `renderTrailingAction`; removing the arm would remove a live action affordance.
Keep the smallest documented React slot and verify that ordinary rows without trailing content do
not gain a placeholder flex item.

### 3. `getLabel` is conditionally React

The common path returns a string, but `LinkCategoryPanel`'s label helper returns styled spans or
highlight node arrays. The native path must not stringify those values. Use one row slot bridge for
that conditional path and validate pooled-row identity/disposal.

### 4. Stable root versus current error/empty replacement

The React implementation returns a `Panel` replacement for error/empty rather than keeping the
provider root around. The vanilla adapter has a stable root, so the message becomes a child arm and
the DOM depth changes. Verify all seven callers for direct-child/`:empty` assumptions before
choosing the exact arm shape; do not silently hide a stale Tree behind CSS.

### 5. Favicon behavior is intentionally not improved

The provider tree does not subscribe to favicon readiness today. Adding `onFaviconReady` here would
be a behavior improvement, and alone would miss disk-cache warm-up anyway. Keep the existing gap
and schedule a separate cache-channel task if live favicon refresh becomes a requirement.

### 6. D8 must remain honest

The provider view collects its model's `RowAlign` import, but CategoryViewModel remains a
`RenderGridModel` type consumer for the editor-owned LinksList/LinksTiles bridge. Epic D therefore
ends at 12→10 RenderGrid app-layer importers, not 12→9.

## Acceptance criteria

- [ ] Seven existing `TreeProviderView` mounts compile and run without caller changes.
- [ ] The native provider tree retains the model driver, provider/watch lifecycle, lazy loading,
      search-key remounting, selection, keyboard actions, drag/drop, clipboard, and async context
      menu behavior.
- [ ] Rows use direct DOM provider icons and the additive Tree seams; no React root is created per
      icon or ordinary string row.
- [ ] Level-zero chevrons, trailing actions, href tooltips, and per-row context-menu ordering are
      preserved.
- [ ] Search controls use the existing native Input/IconButton contracts, stable end-slot identity,
      exact focus timing, and current data attributes.
- [ ] Error/empty arms, root selectors, disposal guards, and the documented favicon gap are
      verified explicitly.
- [ ] `TreeProviderItemIcon.tsx` is removed only if its full caller scan proves it is dead.
- [ ] Rule 4's provider measurement is recorded in EPIC-058, or marked pending with the live-MCP
      reason; no fabricated baseline is accepted.
- [ ] `npm run typecheck`, `npm run lint`, `npm run build-prod`, and `git diff --check` pass.

## Files expected to change

| File | Change |
|---|---|
| `src/renderer/components/tree-provider/TreeProviderView.tsx` | Thin public mount face; remove dead icon trait accessor when safe |
| `src/renderer/components/tree-provider/TreeProviderView.ts` | New native provider view and lifecycle |
| `src/renderer/components/tree-provider/TreeProviderView.css` | App-layer provider shell/search/arm styles |
| `src/renderer/components/tree-provider/TreeProviderViewModel.ts` | Repoint `RowAlign` type import to `VirtualGrid` |
| `src/renderer/components/icons/TreeProviderItemIcon.tsx` | Remove only after the repository-wide last-caller scan |
| `src/renderer/components/tree-provider/item-menus.tsx` | Use direct icon Nodes in provider action menu items |
| `src/renderer/components/tree-provider/plural-actions.tsx` | Use direct icon Nodes in provider action menu items |
| `doc/architecture/key-files.md` | Add the native provider view owner if it becomes index-worthy |
| `doc/active-work.md` | Task tracking |
| `doc/epics/EPIC-058.md` | Rule 4 measurement and task status |

`CategoryView*`, `CategoryViewModel`, `CategoryEditor`, all seven callers, favicon-cache files, and
the editor-owned `RenderGridModel` bridge remain outside this task.

## Related work

- [EPIC-058 - De-React Epic D](../../epics/EPIC-058.md)
- [US-1029 - Tree primitive seams](../US-1029-tree-provider/README.md)
- [US-1026 - Components/icons vanilla DOM views](../US-1026-components-icons-vanilla-views/README.md)
- [US-1028 - File search and VirtualGrid collection](../US-1028-file-search/README.md)
- [US-1038 - `CategoryView`](../US-1038-category-view/README.md)

# US-1074: Convert the `mneme-tree` secondary view to vanilla `VanillaView`

Parent epic: [EPIC-063: De-React Epic E5 — delete the React secondary-view contract](../../epics/EPIC-063.md)

**Depends on:** US-1073 must land first with the shared
`src/renderer/ui/secondary-views/SideBarPanelHeaderView.ts` `badge?: Node` capability. This task
consumes that capability; it does not modify the shared helper.

## Goal

Move the `mneme-tree` secondary-view registration to the vanilla arm and replace its React
provider with a direct-DOM `VanillaView<SecondaryViewProps>`. Preserve the Wiki tree, root-name
badge, native navigation, state persistence, header actions, and Mneme editor icon without a
React body root or React portal.

## Background

The registration is the exact `mneme-tree` entry in
`src/renderer/editors/register-editors.ts:96-101`. It currently has no `arm`, so the registry
treats it as a React provider:

```ts
// Before
secondaryViewRegistry.register({
    id: "mneme-tree",
    label: "Wiki",
    // No icon override → falls back to the editor's MemoryIcon (EPIC-032 / US-663).
    loadComponent: () => import("./mneme-root/MnemeTreeSecondaryView"),
});
```

The after-state is the existing discriminator consumed by
`src/renderer/ui/secondary-views/SecondaryViewsView.ts`:

```ts
// After
secondaryViewRegistry.register({
    id: "mneme-tree",
    label: "Wiki",
    arm: "vanilla",
    // No icon override; the native arm receives the editor's iconElement.
    loadComponent: () => import("./mneme-root/MnemeTreeSecondaryView"),
});
```

`SecondaryViewProps` already supplies the native `iconElement?: Node` and `expanded?: boolean`
fields. `SecondaryViewsView.toPanelDescriptor()` gives vanilla providers a
`LazySecondaryViewView` root, passes `record.iconElement`, and updates `expanded` from the active
panel. It also sets `alwaysRenderContent: true`, so the body remains mounted when the panel is
collapsed. `publishHeader()` supplies `headerRef` after the panel exists; the value is `null` for
at least one pass and may later be a different element.

The authoritative implementation shape is
`src/renderer/editors/explorer/SearchSecondaryView.ts`: a public default-exported
`VanillaView<SecondaryViewProps>`, a native panel root, explicitly owned child views, and
`createSideBarPanelHeader()` updated with `props.headerRef` and `props.iconElement`. The native
header handle in `src/renderer/ui/secondary-views/SideBarPanelHeaderView.ts` tracks its current
header and re-parents its nodes, so the Mneme view must call `header.update()` on every provider
update and never cache or manually re-parent `headerRef`.

The current React projection in
`src/renderer/editors/mneme-root/MnemeTreeSecondaryView.tsx:18-114` was verified as follows:

- It reads `rootName`, `rootFolder`, `resolving`, `error`, and `selectedHref` from
  `MnemeRootEditorModel.state`.
- It captures `mnemeModel.treeState` once with `useMemo`; `onStateChange` writes back through
  `mnemeModel.setTreeState`.
- It uses `useOptionalState(mnemeModel.page?.state, () => mnemeModel.isMain, false)` for the
  show-main active indicator. That helper internally uses `useState` and `useEffect` to subscribe;
  the vanilla conversion absorbs that residue with `VanillaView.bind()` on page state where it is
  available.
- It creates a close `IconButton`, a conditional root-name `Tag`, and a React
  `SideBarPanelHeader` with the close action and the always-present show-main action. The current
  React code does **not** read `expanded` and therefore leaves both actions present while the
  panel is collapsed.
- It renders the React `TreeProviderView` shim when `mnemeModel.treeProvider` exists. That export
  is `mountVanilla(TreeProviderViewImpl, props)`, so the native parent must import and use
  `src/renderer/components/tree-provider/TreeProviderViewImpl.ts` directly.
- For a file click it stores `item.href`, obtains `provider.getNavigationUrl(item)`, and sends
  `createLinkData(url, { pageId: mnemeModel.page?.id, sourceId: mnemeModel.id })` through
  `app.events.openRawLink`. Directory clicks are left to the tree's expansion behavior.
- The fallback is a `Panel padding="md"` containing `Text size="sm"` with semantic `error` or
  `light` color and the exact messages `error`, `"Connecting…"`, or `"No content"`.

The native capabilities were checked against the current source:

| Existing React import | Native capability to use | Finding |
|---|---|---|
| `TreeProviderView` | `TreeProviderViewImpl` | Native `VanillaView`; use it directly, not the `mountVanilla` shim. |
| `IconButton` | `IconButtonView` | Public native view; construct and mount it in `onMount()`. |
| `Tag` | `TagView` from `uikit/Tag/TagView` | Public native view exists; use it for the root-name badge. The barrel exports only the React shim, so import `TagView` directly. |
| `Panel` | `createPanelElement` from `uikit/Panel/panel-style` | There is no `PanelView`, but the native factory and `Panel.css` are the supported path. |
| `Text` | `createTextElement` from `uikit/Text/text-style` | There is no `TextView`, but the native factory and semantic text attributes are the supported path. |

No new UIKit primitive is required. The view must import the borrowed `Panel.css` and `Text.css`
styles explicitly because it constructs those DOM representations directly; `IconButtonView` and
`TagView` own their converted styles. The `SideBarPanelHeaderView` helper already owns its
`SideBarPanelHeader.css` import.

`MnemeRootEditorModel.ts:149-151` currently verifies the US-1069 DOM icon path:

```ts
getIcon = (): ReactNode => createElement(MemoryIcon, { color: MEMORY_ICON_COLOR });
getIconElement = (): SVGElement | undefined => MemoryIcon.createElement?.({ color: MEMORY_ICON_COLOR });
```

`SecondaryViewsView.resolveIcons()` calls `getIconElement` for the no-override fallback, so this
panel's native header receives the DOM `MemoryIcon` with `MEMORY_ICON_COLOR`. Do not replace that
with a guessed name or a hardcoded color. The color token remains owned by
`theme/palette-colors.ts` and the icon's DOM builder remains the source of the colored glyph.

Icon coverage was verified against `src/renderer/theme/icon-registry.ts` and
`src/renderer/uikit/shared/slots.ts`:

| Glyph/use in this panel | Native source | Registry/DOM result |
|---|---|---|
| Close action | `IconButtonView({ icon: "close" })` | `"close"` is registered and `createIconElement()` has a DOM builder. |
| Show-main chevron | Existing `SideBarPanelHeaderView` `createIconElement("chevron-right")` | `"chevron-right"` is registered and has a DOM builder. |
| Mneme editor fallback | `MnemeRootEditorModel.getIconElement()` with `MemoryIcon.createElement({ color: MEMORY_ICON_COLOR })` | `"memory"` is registered, and the model's prop-aware DOM builder is used; this is not a bare-name call because `MemoryIcon` needs `color`. |
| Tree-provider search close | Existing `TreeProviderViewImpl` `IconButtonView({ icon: "close" })` | Reuses the already-verified `"close"` DOM path. |

The tree's file, folder, and Mneme item glyphs come from
`createTreeProviderItemIconElement()`/the existing file-icon subscription in
`TreeProviderViewImpl`, not from new registry names in this provider. The Mneme view does not pass
`getLabel`, `renderTrailing`, or another React-valued Tree slot, so the parallel US-1071 widening
of Tree label/trailing slots is neither needed nor repeated here. No `as unknown as` cast is
planned.

## Implementation Plan

### 1. Move only the `mneme-tree` registration to the vanilla arm

Modify `src/renderer/editors/register-editors.ts` by adding `arm: "vanilla"` to the exact
`mneme-tree` definition. Keep its ID, label, comment, and dynamic import specifier unchanged.
Do not add an icon override: the host already supplies the native Memory icon through
`iconElement`.

### 2. Replace the React provider in `MnemeTreeSecondaryView.tsx`

Keep the existing module path used by the dynamic import and replace the function export with a
public default-exported `VanillaView<SecondaryViewProps>`. The constructor must create only the
stable root, using the existing native panel factory:

```ts
// After: constructor shape
public constructor(props: SecondaryViewProps) {
    super(props, createPanelElement({
        name: "mneme-tree-secondary-view",
        direction: "column",
        flex: true,
        minHeight: 0,
        overflow: "hidden",
    }));
}
```

Do not create child DOM, install listeners, or start state subscriptions in the constructor.
In `onMount()` create the `IconButtonView`, create the `SideBarPanelHeader` handle, append and
mount the first body branch, and register bindings. Capture `mnemeModel.treeState` once for the
initial provider props, matching the React `useMemo(..., [])` behavior; later `onStateChange`
writes continue to update the model's persisted tree state without resetting the mounted tree.

Use a bound model-state projection containing `rootName`, `rootFolder`, `resolving`, `error`, and
`selectedHref`. Its single consequence must:

1. create/update/dispose the native `TagView` badge as `rootName` appears or changes;
2. create the direct `TreeProviderViewImpl` when `mnemeModel.treeProvider` becomes available,
   update its `provider`, `rootLabel`, and `selectedHref` thereafter, or show the native fallback
   panel when no provider exists; and
3. refresh the header title/icon/badge/actions.

Use `this.child()`/`releaseChild()` or equivalent explicit ownership for the dynamic Tag and tree
views. A provider branch must be appended to the mounted column root before its `mount()` call.
The native tree props must preserve the React projection:

```ts
// After: direct native tree projection
{
    provider: mnemeModel.treeProvider,
    rootLabel: state.rootName,
    selectedHref: state.selectedHref,
    onItemClick: this.handleItemClick,
    onItemDoubleClick: this.handleItemClick,
    initialState: this.initialTreeState,
    onStateChange: (next) => mnemeModel.setTreeState(next),
}
```

`handleItemClick` must use native `ITreeProviderItem` data, ignore directories, store the selected
href, obtain the current provider's navigation URL, and send the same `createLinkData` payload
through `app.events.openRawLink`. The double-click callback remains the same handler. Do not
retain `React.MouseEvent`, `useCallback`, `useMemo`, `useOptionalState`, or the React
`TreeProviderView`/`SideBarPanelHeader` imports.

For the no-provider branch, use `createPanelElement({ direction: "row", padding: "md" })` and
`createTextElement(message, { size: "sm", color: error ? "error" : "light" })`; preserve the
three current message choices exactly. Use semantic text colors only; add no color literal.

### 3. Preserve the header, badge, and live action state through native DOM

Use the existing `TagView` with the React values translated directly:

```ts
new TagView({
    name: "mneme-root-name",
    variant: "outlined",
    size: "sm",
    truncate: true,
    label: rootName,
    title: rootFolder,
});
```

When `rootName` is empty, remove and dispose the tag and pass no badge. When it changes, update
the existing Tag view instead of rebuilding it. After US-1073 lands, pass the mounted Tag view's
root as `badge` when `rootName` is non-empty and pass nothing when it is empty. The provider owns
the Tag's creation, updates, and disposal; `SideBarPanelHeaderView` only parents the supplied node
inside its existing title group. If the landed `badge?: Node` capability cannot express this
appear/change/disappear cycle, stop and report it for one shared-helper fix; do not add a local
badge path here.

The header update must be equivalent to:

```tsx
// Before: React portal projection
<SideBarPanelHeader
    headerRef={headerRef}
    icon={icon}
    badge={rootName ? <Tag ... /> : undefined}
    title="Wiki"
    actions={actions}
    showMainTitle="Open Mneme search"
    showMainActive={isMainEditor}
    onShowMain={showMain}
/>

// After: native handle projection
this.header.update({
    headerRef: props.headerRef,
    icon: props.iconElement,
    badge: this.rootTag?.root,
    title: "Wiki",
    actions: props.expanded === false ? undefined : this.closeButton.root,
    showMainTitle: "Open Mneme search",
    showMainActive: mnemeModel.isMain,
    onShowMain: props.expanded === false ? undefined : this.showMain,
});
```

The `expanded === false` gate is intentional: the current React provider ignores `expanded`, but
the secondary-view contract says mounted collapsed panels must drop header actions. Label this as
an intentional UX/contract correction in implementation notes and verify that both actions return
when the panel is expanded. Keep the current behavior that the show-main control remains active
when Mneme is already the main editor; its callback remains a no-op in that case. The close
callback must stop propagation and call `void mnemeModel.requestClose()`.

Bind `mnemeModel.page?.state` to `mnemeModel.isMain` when the page state exists, following the
already-landed native link-secondary-view pattern. Also call the header update from every
`onUpdate()` so `headerRef`, `iconElement`, `expanded`, and model identity changes are not left
stale. Always pass the latest `headerRef` to the handle; never append directly to it.

### 4. Verify lifecycle, styles, slots, and boundaries

The implementation must satisfy the UIKit VanillaView rules in
`src/renderer/uikit/CLAUDE.md` Rule 9: child construction/mounting belongs after the root is
attached, native event types replace React synthetic events, bindings are registered from
`onMount()`, and every owned child/header/button is disposed without leaving detached listeners
or header nodes.

Import `Panel.css` and `Text.css` from the converted provider because it directly creates those
UIKit DOM forms. Use the existing `IconButtonView`, `TagView`, `createPanelElement`, and
`createTextElement`; do not add `PanelView`, `TextView`, or a local replacement. Use
`TreeProviderViewImpl` directly and do not add a `mountReact` compatibility island.

Confirm the icon table above against `icon-registry.ts`/`slots.ts` after the conversion. Unknown
names are not acceptable: the current helper warns in development and creates an empty SVG.
Confirm the Mneme fallback still comes from `getIconElement()` and retains
`MEMORY_ICON_COLOR`.

Run the applicable typecheck, lint, production build, and `git diff --check`. Smoke-check opening a
Mneme root, resolving/error/connecting states, root-name badge updates, folder expansion, file
selection/navigation, persisted expansion, close, show-main promotion, collapse/expand action
gating, a late header target, a changed header target, and disposal. Confirm the converted panel's
body and header contain no React slot/root created by this provider.

## Concerns

1. **Collapsed action behavior is an intentional change.** The current React code always renders
   the close and show-main actions because it does not read `expanded`. The native implementation
   must gate both actions on `expanded !== false` while keeping the body mounted. This is required
   by the existing `SecondaryViewProps` contract and must be called out as a behavior correction,
   not described as a mechanically identical translation.

2. **US-1073 owns the shared badge capability.** This provider depends on its landed
   `badge?: Node` field and passes the mounted `TagView.root` when `rootName` is non-empty, or no
   badge when it is empty. The Mneme provider owns the Tag lifecycle; the shared header only
   parents the node. If the shared capability cannot handle an appear/change/disappear cycle,
   stop and request the one shared-helper fix rather than adding a local path.

3. **`headerRef` is late and mutable.** The first update can receive `null`, and
   `publishHeader()` can later provide a different element. `SideBarPanelHeaderView` already
   handles this with `currentHeader`; every provider `onUpdate()` must forward the received value.

4. **The provider is a plain model field.** `treeProvider` is assigned before the state update
   that publishes `rootName`, so the model-state binding can reconcile from the current field when
   `rootName` changes. The native child must update its provider props when the field is available,
   dispose/detach the branch when it is absent, and not capture a stale provider in the click
   callback.

5. **Hook and slot residue must not be recreated.** `useMemo`, `useCallback`, and the
   `useOptionalState` subscription are absorbed into a one-time initial-state field, native
   methods, and `bind()`. The provider uses only the TreeProvider's existing default label/icon
   projection, so US-1071's `React.ReactNode` slot widening is not part of this task. Do not add an
   `as unknown as` workaround.

6. **Icon fallback is prop-aware.** The Memory glyph is not a bare `"memory"` call because its
   current implementation requires `MEMORY_ICON_COLOR`. Consume `props.iconElement`, which the
   already-landed model/host path builds with `MemoryIcon.createElement({ color })`; use the
   registry only for the close and helper chevron names.

7. **US-1073 is a hard sequencing prerequisite.** Do not begin implementation until its shared
   `badge?: Node` header extension has landed and can parent a node that appears, updates, and
   disappears. No second badge implementation is permitted in this task.

## Acceptance Criteria

- [ ] Only the `mneme-tree` secondary registration gains `arm: "vanilla"`; its dynamic import,
      ID, label, and no-override Memory icon behavior remain unchanged, and no dashboard entry is
      added.
- [ ] `MnemeTreeSecondaryView.tsx` default-exports a public `VanillaView<SecondaryViewProps>`;
      it contains no React render/hooks/portal code, creates only its stable root in the
      constructor, and creates/mounts native children from `onMount()`.
- [ ] The provider uses `TreeProviderViewImpl` directly, preserves `rootLabel`, selected href,
      initial expansion state, `onStateChange`, live provider refresh, file navigation payloads,
      directory behavior, fallback messages, and disposal without introducing a provider-owned
      React root.
- [ ] The root-name badge is rendered by the existing `TagView` with the verified outlined,
      small, truncating props and root-folder title; it updates/removes with model state.
- [ ] US-1073's landed `SideBarPanelHeaderView.ts` `badge?: Node` capability parents the mounted
      `TagView.root` before the Wiki title; the Mneme provider does not modify that helper or add a
      local badge path.
- [ ] Every header update forwards `props.headerRef` and `props.iconElement`; the close action
      uses the registry-backed `"close"` icon, the show-main helper uses the registry-backed
      `"chevron-right"` icon, and the Memory fallback uses the model's colored DOM builder.
- [ ] Close and show-main actions are absent when `expanded === false` and restored on expansion
      without remounting the tree. The current show-main active state and promotion callback remain
      correct.
- [ ] `Panel`/`Text` are expressed through `createPanelElement`/`createTextElement` with their
      native styles loaded explicitly; no new local UIKit primitive, hardcoded color, Tree slot
      widening, or unsafe cast is introduced.
- [ ] The implementation passes the applicable typecheck, lint, production build, and
      `git diff --check`, and the Mneme smoke cases cover resolution/error, navigation, persistence,
      header timing/re-parenting, collapse/expand, and cleanup.

## Files Changed

| File | Planned change |
|---|---|
| `src/renderer/editors/register-editors.ts` | Add `arm: "vanilla"` to the exact `mneme-tree` registration. |
| `src/renderer/editors/mneme-root/MnemeTreeSecondaryView.tsx` | Replace the React function/hooks/portal with a native `VanillaView`, `TreeProviderViewImpl`, `TagView`, `IconButtonView`, native fallback DOM, bindings, and lifecycle cleanup. |

The following verified files need **NO changes**: `src/renderer/editors/mneme-root/MnemeRootEditorModel.ts`
(its `getIconElement` and `MEMORY_ICON_COLOR` path already exist); `src/renderer/editors/explorer/SearchSecondaryView.ts`
(read-only precedent); `src/renderer/components/tree-provider/TreeProviderView.tsx` (React shim);
`src/renderer/components/tree-provider/TreeProviderViewImpl.ts` and
`src/renderer/components/tree-provider/TreeProviderViewModel.ts` (existing native provider contract);
`src/renderer/ui/secondary-views/SecondaryViewsView.ts`,
`src/renderer/ui/secondary-views/secondary-view-registry.ts`, and
`src/renderer/ui/secondary-views/SideBarPanelHeader.tsx` (host/props/React face already support
the required fields); `src/renderer/ui/secondary-views/SideBarPanelHeaderView.ts` (US-1073-owned
shared native badge capability); `src/renderer/uikit/IconButton/IconButtonView.tsx`,
`src/renderer/uikit/Tag/TagView.tsx`, `src/renderer/uikit/Panel/panel-style.ts`, and
`src/renderer/uikit/Text/text-style.ts` (existing native capabilities);
`src/renderer/theme/icon-registry.ts`, `src/renderer/uikit/shared/slots.ts`, and
`src/renderer/theme/palette-colors.ts` (verified icon/color sources); and all files covered by
US-1071's Tree slot widening (`src/renderer/uikit/Tree/types.ts` and the already-existing
`renderTrailing` declaration in `src/renderer/components/tree-provider/TreeProviderViewModel.ts`).
`doc/active-work.md` is intentionally unchanged because EPIC-063 already lists US-1074.

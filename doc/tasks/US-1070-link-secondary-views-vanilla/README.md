# US-1070: Link secondary views to vanilla `VanillaView`

Parent epic: [EPIC-063: De-React Epic E5 — delete the React secondary-view contract](../../epics/EPIC-063.md)

## Goal

Convert the `link-category`, `link-tags`, and `link-hostnames` secondary-view registrations to
the vanilla arm. Each provider must be a default-exported `VanillaView<SecondaryViewProps>` and
must render its existing native-capable body without a React portal or React body root.

## Background

The three registrations are in `src/renderer/editors/register-editors.ts`. They currently have no
`arm` field, so the registry treats them as React definitions:

```ts
secondaryViewRegistry.register({
    id: "link-category",
    label: "Categories",
    loadComponent: () => import("./link-editor/panels/LinkCategorySecondaryView"),
});
```

The after-state is the existing registry discriminator used by
`src/renderer/ui/secondary-views/SecondaryViewsView.ts`:

```ts
secondaryViewRegistry.register({
    id: "link-category",
    label: "Categories",
    arm: "vanilla",
    loadComponent: () => import("./link-editor/panels/LinkCategorySecondaryView"),
});
```

Apply the same `arm: "vanilla"` addition to `link-tags` and `link-hostnames`. The three
registrations have no icon override. US-1069 owns the editor-icon fallback in
`SecondaryViewsView.resolveIcon`; assume that change is present and do not duplicate or plan it
here.

The authoritative consumer is
`src/renderer/editors/explorer/SearchSecondaryView.ts`. It is a default-exported
`VanillaView<SecondaryViewProps>` that creates a native panel, owns native child views, creates a
`SideBarPanelHeaderView` handle, mounts children in `onMount()`, and forwards new props in
`onUpdate()`. The link providers must follow that lifecycle shape, with one additional requirement:
`expanded` changes must update header actions while the panel body remains mounted because the host
sets `alwaysRenderContent: true`.

`SecondaryViewProps` is defined in
`src/renderer/ui/secondary-views/secondary-view-registry.ts`. Its `headerRef` is
`HTMLDivElement | null`; `SecondaryViewsView.publishHeader()` publishes it after the stack creates
the panel header, so the first provider update can receive `null`, and the target can later change.
`src/renderer/ui/secondary-views/SideBarPanelHeaderView.ts` already keeps `currentHeader`, detaches
from the old target, and reattaches to the new one. Providers must pass every `headerRef` received to
the handle and must not cache or re-parent the header themselves.

The current React projections were verified as follows:

- `LinkCategorySecondaryView.tsx` type-checks `model` as `LinkEditor`, subscribes to
  `editor.page?.state` for `isMain`, subscribes to `editor.host.state` for `modified`, renders a
  conditional Save `IconButton`, renders the show-main header action, and mounts
  `LinkCategoryPanel`.
- `LinkCategoryPanel.tsx` derives the selected tree href from `selectedLinkId` and
  `selectedCategory`, opens files with `openLinkFromPanel(item, "link-category")`, promotes a
  category click with `page.promoteSecondaryToMain`, and adds “Edit Link” to the context menu.
  Its `TreeProviderView` is already a `mountVanilla` shim over
  `TreeProviderViewImpl.ts`, so the native panel should use `TreeProviderViewImpl` directly.
- `LinkTagsSecondaryView.tsx` owns the tags category list and bottom links list. Its
  `LinkTagsNavigationPanel` uses `useState` for the bottom height, two `useEffect` hooks for the
  initial `ResizeObserver` sizing and selected-row scrolling, `useRef` for the root/grid, and
  external-store reads for the selected tag, links, selected link, and all tags.
- `LinkTagsPanel.tsx` is a `CategoryList` projection over `tags`, `selectedTag`,
  `setSelectedTag`, and `getTagCount`. `CategoryList` is a `mountVanilla` shim over
  `src/renderer/uikit/CategoryList/CategoryListView.ts`.
- `LinkHostnamesSecondaryView.tsx` has the same header/body wrapper shape as Tags.
  `LinkHostnamesNavigationPanel.tsx` mirrors the Tags navigation panel, using hostname-filtered
  items, `setSelectedHostname`, and `openLinkFromPanel(item, "link-hostname")`.
- `LinkHostnamesPanel.tsx` is a separate 39-line React `CategoryList` projection imported only by
  `LinkHostnamesNavigationPanel.tsx`. The stated 587-line task scope excludes that file. The native
  hostname navigation implementation should express its identical projection directly with
  `CategoryListView`, remove the import, and leave `LinkHostnamesPanel.tsx` unchanged unless the
  compiler/import graph proves another consumer.

The native body dependencies are already available:

- `src/renderer/components/tree-provider/TreeProviderViewImpl.ts` is the native tree provider and
  owns a native `TreeView`, search input/close button, provider state binding, context-menu path,
  and icon refresh lifecycle.
- `src/renderer/uikit/CategoryList/CategoryListView.ts` is the native controlled category list. It
  uses `KeyedList`, reads `items`/`value`/`getCount`, and calls `onChange` for row selection.
- `src/renderer/editors/link-editor/LinksListView.ts` is the native virtualized links list. The
  React `src/renderer/editors/link-editor/LinksList.tsx` file only calls
  `mountVanilla(LinksListView, props)`, so a native parent must import `LinksListView` and
  `LinksListProps` directly. Keep `LinksListView.ts` unchanged; its existing tooltip attachment
  and link-row DOM behavior are outside this conversion.
- `createPanelElement`/`applyPanelAttributes` in `src/renderer/uikit/Panel/panel-style.ts` express
  the existing Panel layout without JSX. `SplitterView` and `IconButtonView` are already native
  views and must be owned, mounted, updated, and disposed explicitly.

The current React files contain hook residue that this conversion absorbs rather than lifting into
a separate task. `LinkTagsSecondaryView.tsx` and `LinkHostnamesNavigationPanel.tsx` contain
`useState`/`useEffect`; `LinkCategorySecondaryView.tsx` uses `useCallback` and external-store
subscriptions; the two category-list panels use `useSyncExternalStore`. Replace those with
`VanillaView.bind()`/native child updates and explicit lifecycle resources.

The category panel's `getTreeItemLabel` callback contains three distinct behaviors, and the
conversion must treat them separately:

- Search highlighting is already native. `TreeProviderViewImpl.treeProps()` forwards
  `searchText: state.searchText`, and `Tree/types.ts` documents that the default `TreeItem` uses
  this plain string for label highlighting. Do not replace it with the dead `highlight()` JSX path.
- The per-category `item.size` count is currently broken because `getLabel` is not consumed, but it
  is recoverable through the existing `renderTrailing` forward in `treeProps()`. Restore it as a
  right-aligned trailing value using `theme/color` and no inline color/style literals.
- The rich `LinkTooltipContent` tooltip is also currently broken: the native tree hardcodes the
  row tooltip to `item.href` and does not forward a tooltip callback. Add an optional forwarded
  `getTooltip` prop to `TreeProviderViewImpl` and pass the rich tooltip through the same interim
  React-valued slot used by `LinksListView.ts`'s `attachTooltip` precedent.

The count and rich tooltip are restorations of behavior currently broken in the native tree, not
new features. They are in scope because this conversion removes the last source-level trace of
the original intent. The native category implementation must preserve native search highlighting,
restore the count through `renderTrailing`, and restore the rich tooltip through `getTooltip`.

## Implementation Plan

### 1. Convert the three registrations

Modify `src/renderer/editors/register-editors.ts` only for these definitions:

```ts
// Before
secondaryViewRegistry.register({
    id: "link-tags",
    label: "Tags",
    loadComponent: () => import("./link-editor/panels/LinkTagsSecondaryView"),
});

// After
secondaryViewRegistry.register({
    id: "link-tags",
    label: "Tags",
    arm: "vanilla",
    loadComponent: () => import("./link-editor/panels/LinkTagsSecondaryView"),
});
```

Add the same field to `link-category` and `link-hostnames`. Keep the labels, IDs, dynamic import
specifiers, and the registry contract unchanged. Do not edit US-1069's icon resolution or add an
`icon` override to any of the three definitions.

### 2. Convert `LinkCategorySecondaryView` and its body

Convert `src/renderer/editors/link-editor/panels/LinkCategorySecondaryView.tsx` into a public,
default-exported `VanillaView<SecondaryViewProps>` using the Search provider's shape. The native
view must own a panel root, a `LinkCategoryPanel` native child, a Save `IconButtonView`, and a
header handle. Construct only the stable root in the constructor; create/append/mount child DOM in
`onMount()` per `src/renderer/uikit/CLAUDE.md` Rule 9.

Replace the React portal/header projection:

```tsx
// Before
<SideBarPanelHeader
    headerRef={headerRef}
    icon={icon}
    title="Collections"
    actions={actions}
    showMainTitle="Show links"
    showMainActive={isMainEditor}
    onShowMain={handleShowMain}
/>
<LinkCategoryPanel vm={editor} />
```

With the native projection:

```ts
// After
this.header.update({
    headerRef: props.headerRef,
    icon: props.iconElement,
    title: "Collections",
    actions: props.expanded === false ? undefined : modified ? this.saveButton.root : undefined,
    showMainTitle: "Show links",
    showMainActive: isMainEditor,
    onShowMain: props.expanded === false ? undefined : this.showMain,
});
```

The exact action condition must preserve Save visibility whenever `host.state.get().modified` is
true while dropping header actions for a collapsed panel as required by the secondary-view
contract; on re-expansion, restore the action without remounting the body. Bind the modified and
main-editor values so a save-state or promotion change updates the header. The Save button must use
`IconButtonView` with `icon: "save"`, `size: "sm"`, title `"Save"`, and the existing stop-propagation
and `editor.host?.saveFile()` behavior. The show-main button must preserve the existing
`!editor.isMain` promotion behavior.

Pass the host-provided editor icon through `props.iconElement`, the post-US-1069 DOM icon arm.
The current `SearchSecondaryView.ts` on disk uses this exact field and passes it directly to
`SideBarPanelHeaderView`; do not read the React-arm `props.icon` field in a vanilla provider.

### 3. Convert `LinkCategoryPanel` to a native child view

Convert `src/renderer/editors/link-editor/panels/LinkCategoryPanel.tsx` to a native view (retaining
the module import path/export needed by the converted provider). Create the exact outer panel with
`createPanelElement({ name: "link-category-panel", direction: "column", flex: 1, height: 0,
overflow: "hidden" })`. On mount, create a `TreeProviderViewImpl` with:

- `provider: editor.treeProvider` and `showLinks: true`;
- `selectedHref` derived from `selectedLinkId` first, then `selectedCategory`;
- `onItemClick` preserving directory selection/promotion and leaf
  `openLinkFromPanel(item, "link-category")`;
- `onContextMenu` preserving the “Edit Link” insertion for non-directory items;
- `rootLabel: "All"`.

Append and mount the provider after the parent root is attached. Bind the LinkEditor state so
selection changes update the provider's `selectedHref`; do not recreate it for ordinary state
updates. Dispose and detach the provider on parent disposal.

Restore the two currently broken projections through the native seams already present in the tree
provider:

```ts
// Native category-provider props
getTooltip: (item) => item.isDirectory
    ? item.href
    : React.createElement(LinkTooltipContent, {
        link: item,
        showCopyJson: true,
        imageProxy: editor.imageProxy,
    }),
renderTrailing: (item) => item.isDirectory && item.size !== undefined
    ? React.createElement(Text, { color: color.text.light }, String(item.size))
    : null,
```

`getTooltip` is an interim React-valued slot, deliberately following
`LinksListView.ts`'s existing `attachTooltip`/`React.createElement(LinkTooltipContent, ...)`
precedent; it must not become a new React body root. `renderTrailing` uses the existing right-edge
Tree trailing slot and a theme color, so the former hand-rolled flex-row wrapper and inline styles
are not carried over. Leave the dead `getLabel`/`highlight()` path out because native
`searchText` already supplies highlighting; these count/tooltip restorations are explicitly part
of this conversion rather than silently discarded.

Add `getTooltip?: (item: ITreeProviderItem) => SlotText` to
`src/renderer/components/tree-provider/TreeProviderViewModel.ts` alongside `renderTrailing`, and
in `TreeProviderViewImpl.treeProps()` forward it as `getTooltip: (node) =>
this.props.getTooltip?.(node.data) ?? node.data.href`. Keep the existing href fallback for all
other tree-provider callers.

### 4. Convert the Tags navigation surface

Convert both `LinkTagsSecondaryView.tsx` and `LinkTagsPanel.tsx` to native views. The secondary
provider must create a native header (`title: "Tags"`) and a native navigation child, then mount
the child in `onMount()` and update it in `onUpdate()` with the latest `model`, `headerRef`, icon,
and `expanded` values. The body stays mounted when collapsed; there are no Tags header actions to
attach, but the header still must receive every late/changing `headerRef` and `expanded` update.

In the navigation view, reproduce the existing layout with `createPanelElement`:

```tsx
// Before
<Panel name="link-tags-navigation" ...>
    <Panel name="link-tags-navigation-top" ...>
        <LinkTagsPanel vm={editor} />
    </Panel>
    {tagItems.length > 0 && <Splitter ... />}
    {tagItems.length > 0 && <Panel name="link-tags-navigation-bottom" ...><LinksList ... /></Panel>}
</Panel>
```

The native view must own `LinkTagsPanelView`/`CategoryListView`, `SplitterView`, and
`LinksListView`. It must:

- bind `selectedTag`, `data.links`, `selectedLinkId`, and `tags` from `editor.state`;
- derive `tagItems` from `editor.treeProvider?.getTagItems(selectedTag)` when a tag is selected,
  filtering directories, or from all non-directory links otherwise;
- pass `items`, `value`, `onChange: editor.setSelectedTag`, and `getCount: editor.getTagCount`
  to the category-list child;
- cap a dragged/resized bottom height at 80% of the root client height, with the existing 40px
  minimum and 150px default;
- preserve the 200ms `ResizeObserver`-based first-height initialization and disconnect/clear its
  timer on disposal;
- pass `selectedId`, `onSelect`, `onDoubleClick`, `allTags`, `onToggleTag`, and `onGridModel` to
  `LinksListView` exactly as the current callbacks do; and
- after selected-link or item-list updates, find `(item.id ?? item.href) === selectedLinkId` and
  call the retained grid capability's `scrollToRow(row, "nearest")`.

The tag click handler must continue toggling the item tag through `editor.updateLink`; the link
handler must continue calling `editor.openLinkFromPanel(item, "link-tag")`. Use native `Event`/
`MouseEvent` handling in the view and do not recreate React synthetic events for these callbacks.

### 5. Convert the Hostnames navigation surface

Convert `src/renderer/editors/link-editor/panels/LinkHostnamesSecondaryView.tsx` and
`LinkHostnamesNavigationPanel.tsx` to the same native structure as Tags. The header title is
`"Hostnames"`; the native body must:

- use `CategoryListView` directly for the existing `LinkHostnamesPanel` projection, with
  `items: state.hostnames`, `value: state.selectedHostname`, `onChange: editor.setSelectedHostname`,
  `getCount: editor.getHostnameCount`, `separator: "\0"`, and `rootLabel: "All"`;
- derive selected hostname items with `editor.treeProvider?.getHostnameItems(selectedHostname)`
  and filter directories, otherwise use all non-directory links;
- preserve the same 40px/80%/150px height, delayed `ResizeObserver`, splitter, and selected-row
  scrolling behavior as Tags; and
- keep `updateLink` tag toggling and `openLinkFromPanel(item, "link-hostname")` unchanged.

Remove only the converted navigation view's import of `LinkHostnamesPanel.tsx`; leave that
unlisted React helper unchanged unless an additional source consumer appears during verification.
This absorbs its 39-line `CategoryList` projection without retaining a React root in the native
hostname panel.

### 6. Complete the shared native header behavior

Update `src/renderer/ui/secondary-views/SideBarPanelHeaderView.ts` so the existing
`SideBarPanelHeaderDom` also supports the category provider's show-main action. Add native props for
the equivalent of `onShowMain`, `showMainTitle`, and `showMainActive`; create a semantic
`button[data-type="sidebar-show-main"]` with the existing `data-active` contract and a direct
`createIconElement("chevron-right")`; attach a tooltip with `attachTooltip`; and stop propagation
before calling the action. Keep the button as a stable node, update its active/title/callback
state in `update()`, remove it when no action is supplied, and dispose its tooltip/listeners.

The file must import `./SideBarPanelHeader.css` because a direct vanilla consumer cannot rely on
the React `SideBarPanelHeader.tsx` stylesheet import. Preserve the existing title/action group
DOM shape and current `currentHeader` re-parenting. Do not change the React
`SideBarPanelHeader.tsx` portal face or its full prop surface.

### 7. Verify icon coverage and lifecycle boundaries

Before implementation is considered complete, verify each named glyph against
`src/renderer/theme/icon-registry.ts` and `src/renderer/uikit/shared/slots.ts`:

| Glyph/use | Native source | Registry result |
|---|---|---|
| Save action | `IconButtonView({ icon: "save" })` | `"save"` is present and has a DOM builder |
| Show-main action | `createIconElement("chevron-right")` | `"chevron-right"` is present and has a DOM builder |
| Category-list drill-in/back | `CategoryListView` uses `"chevron-right"`/`"chevron-left"` | both names are present and have DOM builders |
| Tree search close | existing `TreeProviderViewImpl` | `"close"` is present and has a DOM builder |
| Editor fallback | `SecondaryViewProps.iconElement` after US-1069 | host-provided DOM result; do not replace with an invented registry name |

The link-row file/favicons and tree-provider item icons come from their existing DOM factories, not
from new names in these providers. A missing registry name must not be accepted: `createIconElement`
warns and creates an empty SVG for unknown names.

## Concerns

1. `LinkHostnamesPanel.tsx` is a verified direct dependency but is omitted from EPIC-063's exact
   587-line scope. The plan resolves this from source by absorbing its identical 39-line `CategoryList`
   projection into the in-scope native navigation view and leaving the old helper untouched. If an
   additional consumer is discovered, stop and expand the task before deleting or changing it.

2. The React category label callback mixes three behaviors with different native status. Search
   highlighting is already preserved by `treeProps().searchText`; the count and rich tooltip are
   currently broken because `getLabel` is not consumed, but both are restorations in this task:
   `renderTrailing` restores the count and a new forwarded `getTooltip` restores `LinkTooltipContent`.
   Do not reintroduce the dead JSX `highlight()`/flex wrapper path.

3. `LinksListView` still builds `LinkTooltipContent` as a React tooltip payload. Directly using
   `LinksListView` removes the wrapper's body root and preserves the EPIC-062 conversion, but a
   tooltip interaction can still use its existing React-valued overlay path. Do not alter that
   shared view in US-1070.

4. `headerRef` can be `null` during the first provider pass and can change later. Header tests must
   cover null → element, element replacement, collapse/expand, and disposal. The provider must
   call `header.update()` from `onUpdate()` even when only `headerRef` or `expanded` changed.

5. Collapsed panels remain mounted. Do not dispose/recreate category lists, tree providers, grid
   views, or resize observers merely because `expanded === false`; only header action nodes are
   suppressed while collapsed.

## Acceptance Criteria

- [ ] `link-category`, `link-tags`, and `link-hostnames` in
      `src/renderer/editors/register-editors.ts` have `arm: "vanilla"`, retain their labels and
      dynamic imports, and have no new icon override.
- [ ] Each registration loads a default `VanillaView<SecondaryViewProps>`; no provider renders
      `SideBarPanelHeader`/`createPortal` or returns a JSX body. The category tooltip uses only the
      existing React-valued tooltip slot described above.
- [ ] All six scoped provider/panel modules preserve their existing titles, body layout, state
      bindings, selection callbacks, context-menu behavior, link-opening source IDs, tag toggling,
      height constraints, splitter behavior, and selected-row scrolling.
- [ ] Native parents instantiate `TreeProviderViewImpl`, `CategoryListView`, `LinksListView`,
      `SplitterView`, and `IconButtonView` directly where applicable; `LinksList.tsx` is not used as
      a nested React dependency.
- [ ] Category search highlighting remains supplied by `TreeProviderViewImpl.treeProps().searchText`;
      the native category tree restores the currently broken directory count through
      `renderTrailing` and the currently broken rich link tooltip through the forwarded `getTooltip`
      callback, using `theme/color` and the existing `LinksListView.ts` React-tooltip precedent.
- [ ] `headerRef` is routed through `SideBarPanelHeaderView`; null and later target changes are
      handled by its existing re-parenting state, with no provider-owned cached header element.
- [ ] The category Save and show-main header actions disappear while collapsed and return when
      expanded; Save remains controlled by `editor.host.state.get().modified`, and the body remains
      mounted while collapsed.
- [ ] The native show-main button preserves `data-type="sidebar-show-main"`, active state,
      `chevron-right`, tooltip, stop-propagation, and promotion behavior.
- [ ] `save`, `chevron-right`, `chevron-left`, and `close` are verified in the icon registry before
      use; no unknown icon name is introduced. The editor fallback remains supplied by US-1069.
- [ ] No React hooks remain in the converted provider/navigation implementations, and the
   `LinkHostnamesPanel.tsx` exclusion is verified against the full source import graph, and its
   39-line projection is absorbed by the native navigation view.
- [ ] The task does not modify `SecondaryViewsView.resolveIcon`, the React secondary-view contract,
      or the dashboard entry. It does extend the existing tree-provider forwarding seam in
      `TreeProviderViewModel.ts`/`TreeProviderViewImpl.ts` for the in-scope category count/tooltip
      restorations; `LinksListView.ts` remains unchanged.
- [ ] Type checking/linting and `git diff --check` pass after implementation; manually verify
      late-header publication, collapsed/expanded action changes, category selection/context menu,
      tag/hostname filtering, resize behavior, selected-link scrolling, and link opening.

## Files that need NO changes

- `src/renderer/ui/secondary-views/secondary-view-registry.ts` — `SecondaryViewProps` and the
  already-present React/vanilla discriminated registry contract are sufficient.
- `src/renderer/ui/secondary-views/SecondaryViewsView.ts` — US-1069 owns editor-icon fallback
  resolution; this task only consumes its post-change DOM result.
- `src/renderer/ui/secondary-views/SideBarPanelHeader.tsx` — retain the React portal face for the
  other secondary providers.
- `src/renderer/editors/link-editor/LinkHostnamesPanel.tsx` — its 39-line projection is absorbed
  directly by the in-scope native hostname navigation view; current source has no other importer.
- `src/renderer/editors/link-editor/LinksList.tsx` and `LinksListView.ts` — retain the React
  compatibility shim and the EPIC-062 native implementation; native parents use the view class.
- `src/renderer/components/tree-provider/TreeProviderView.tsx` — retain the compatibility shim;
  the native implementation is extended separately for the category panel's forwarding seams.
- `src/renderer/uikit/CategoryList/CategoryList.tsx` and `CategoryListView.ts` — retain the React
  shim and native implementation; converted parents use `CategoryListView` directly.
- `src/renderer/uikit/Panel/panel-style.ts`, `src/renderer/uikit/Splitter/SplitterView.ts`, and
  `src/renderer/uikit/IconButton/IconButtonView.tsx` — use the existing native primitives without
  modifying shared infrastructure.
- `src/renderer/components/icons/icon-elements.ts` and `src/renderer/theme/icon-registry.ts` —
  consume their existing DOM icon factories and registry entries; US-1069 remains separate.
- `doc/active-work.md` — US-1070 is already listed by the epic and the user explicitly excluded a
  dashboard edit.

## Files Changed summary

| File | Planned change |
|---|---|
| `src/renderer/editors/register-editors.ts` | Add `arm: "vanilla"` to the three link-editor secondary-view registrations. |
| `src/renderer/editors/link-editor/panels/LinkCategorySecondaryView.tsx` | Replace the React provider with a default `VanillaView`, native header, Save/show-main actions, and native category child. |
| `src/renderer/editors/link-editor/panels/LinkCategoryPanel.tsx` | Replace the React body with a native `TreeProviderViewImpl` composition and state bindings. |
| `src/renderer/editors/link-editor/panels/LinkTagsSecondaryView.tsx` | Replace the React provider/navigation hooks with a native retained navigation view and header updates. |
| `src/renderer/editors/link-editor/panels/LinkTagsPanel.tsx` | Replace the React `CategoryList` projection with its native child-view equivalent. |
| `src/renderer/editors/link-editor/panels/LinkHostnamesSecondaryView.tsx` | Replace the React provider with a native header/body composition. |
| `src/renderer/editors/link-editor/panels/LinkHostnamesNavigationPanel.tsx` | Replace hooks, JSX layout, `Splitter`, and `LinksList` wrapper usage with native views; absorb the hostname category-list projection. |
| `src/renderer/components/tree-provider/TreeProviderViewModel.ts` | Add the optional `getTooltip` callback to the existing tree-provider view-prop contract. |
| `src/renderer/components/tree-provider/TreeProviderViewImpl.ts` | Forward the optional rich tooltip callback while retaining the href fallback and existing native search/trailing seams. |
| `src/renderer/ui/secondary-views/SideBarPanelHeaderView.ts` | Add native show-main action support, tooltip lifecycle, and direct stylesheet import while preserving late-header re-parenting. |

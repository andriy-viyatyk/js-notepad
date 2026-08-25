# US-1072: Convert the thin secondary views to `VanillaView`

Parent epic: [EPIC-063: De-React Epic E5 — delete the React secondary-view contract](../../epics/EPIC-063.md)

## Goal

Move the `archive-tree`, `rest-panel`, and `board-secondary:*` secondary-view providers onto the
existing vanilla arm, preserving their current sidebar behavior while removing the provider-level
React components, hooks, portals, and JSX projections. The board prefix family is the primary risk:
each declared board view must remain independently keyed, update from manifest changes, and dispose
its old iframe/view without reload thrash or leaks.

## Background

EPIC-063 measures these three React provider wrappers at 65, 58, and 68 lines respectively (191
lines total). That estimate omits the `RequestTree` implementation shared by the Rest wrapper:
`RequestTree` starts at `src/renderer/editors/rest-client/RestClientShared.tsx:344` and ends at
line 607, an inclusive 264-line span. The actual US-1072 source scope is therefore 455 lines before
conversion (191 wrapper lines plus 264 request-tree lines); the epic table counted only the thin
wrappers. The native secondary-view host and loader already exist from E1: `SecondaryViewsView` resolves a registration,
creates a `LazySecondaryViewView` for the vanilla arm, and passes a `SecondaryViewProps` object with
`model`, the bare `panelId`, `headerRef`, `iconElement`, and `expanded`. The three registrations in
`src/renderer/editors/register-editors.ts` still omit `arm: "vanilla"`:

```ts
secondaryViewRegistry.register({
    id: "archive-tree",
    label: "Archive",
    loadComponent: () => import("./archive/ArchiveSecondaryView"),
});

secondaryViewRegistry.register({
    id: "rest-panel",
    label: "Rest",
    loadComponent: () => import("./rest-client/panels/RestPanelSecondaryView"),
});

secondaryViewRegistry.registerPrefix(BOARD_SECONDARY_PREFIX, {
    id: BOARD_SECONDARY_PREFIX,
    label: "Board View",
    loadComponent: () => import("./board/BoardSecondaryView"),
});
```

The after-state is the same registration shape with an explicit vanilla arm. The third change must
remain on `registerPrefix`; it is not an exact `register` for one panel id:

```ts
secondaryViewRegistry.register({
    id: "archive-tree",
    label: "Archive",
    arm: "vanilla",
    loadComponent: () => import("./archive/ArchiveSecondaryView"),
});

secondaryViewRegistry.register({
    id: "rest-panel",
    label: "Rest",
    arm: "vanilla",
    loadComponent: () => import("./rest-client/panels/RestPanelSecondaryView"),
});

secondaryViewRegistry.registerPrefix(BOARD_SECONDARY_PREFIX, {
    id: BOARD_SECONDARY_PREFIX,
    label: "Board View",
    arm: "vanilla",
    loadComponent: () => import("./board/BoardSecondaryView"),
});
```

The implementation follows `src/renderer/editors/explorer/SearchSecondaryView.ts`, which is the
existing vanilla provider pattern: a default-exported `VanillaView<SecondaryViewProps>` with a
public constructor, a stable root, explicit child-view ownership, `onMount()` mounting, `onUpdate()`
prop forwarding, and `onDispose()` cleanup. Its header is made with
`createSideBarPanelHeader()` from `src/renderer/ui/secondary-views/SideBarPanelHeaderView.ts`,
using `props.headerRef` and `props.iconElement`; it does not render the React
`SideBarPanelHeader` portal.

The `src/renderer/uikit/CLAUDE.md` lifecycle rule is important for these conversions: a constructor
may create only the stable root and view-owned state. It must not create child DOM, listeners,
subscriptions, layout measurements, or timers. Child views, the header handle, bindings, and any
animation frame must be created or installed from `onMount()` and registered for disposal.

### Existing provider behavior to preserve

`ArchiveSecondaryView.tsx` currently:

- casts the registry model to `ArchiveEditor` and reads `treeProvider`, `selectionState`, and
  `revealVersion`;
- reveals `selectedHref` through the `TreeProviderViewModel` after a reveal-version bump;
- updates archive selection and opens the provider navigation URL through
  `app.events.openRawLink.sendAsync(createLinkData(...))` on both click and double-click;
- shows a close `IconButton` only when the archive is not the page's main editor, and removes the
  archive model from the page on click; and
- renders `TreeProviderView`, whose actual body is already native
  `TreeProviderViewImpl` behind its React `mountVanilla` face.

The current action expression is based only on whether the archive is the page main editor; it does
not inspect `expanded`. This task intentionally changes that behavior: the vanilla provider must
omit the close action when `expanded === false`, because `SecondaryViewsView` keeps collapsed panels
mounted with `alwaysRenderContent: true` and the registry contract defines `expanded` so providers
can drop actions that only make sense while the body is visible. This is a deliberate UX correction,
not an incidental JSX-to-DOM translation; the implementation and acceptance review must call it out
as such.

`RestPanelSecondaryView.tsx` has a type-guarded `RestClientEditor` branch and an inner hook body.
The body derives the root item (`"__root__"` plus `buildGroupedTree(state.requests)`) and traited
items, then renders the React `RequestTree` from `RestClientShared.tsx` under a `Panel`. The
secondary view itself has `useMemo`; the shared file also contains the React `SplitDetailPanel`
with `useState` and `useLayoutEffect`. The latter is still used by `RestClientBody.tsx` and must
remain React-facing with its current `SplitDetailPanel({ vm, request, state })` signature. Source
verification found that `RequestTree` is exported at `RestClientShared.tsx:344` but its only
importer in `src/` is `panels/RestPanelSecondaryView.tsx:54`; therefore replacing that export
crosses no remaining React caller boundary and Rule 1 does not block the conversion. `SplitDetailPanel`
remains React because `RestClientBody.tsx` still owns it, and its React-facing signature must not
change.

`BoardSecondaryView.tsx` currently:

- parses `panelId` with `parseBoardSecondaryPanelId()`;
- finds the matching `SecondaryViewDecl` in `BoardEditorModel.state.secondaryViewDefs`;
- derives `selectedRoot` from `selectedBoard` and `boardRoot`;
- gates execution with `boardTrust.useIsTrusted()`;
- renders its own title from `def.title` (or the view id / `"View"` fallback); and
- renders `BoardWebview` with `isMain={false}`, `entry`, `view={def.id}`, and a key containing
  the view id and `reloadToken`, or a native-looking placeholder message when unavailable or
  untrusted.

The registration label `"Board View"` is therefore never displayed and must stay unused. The
vanilla header must use the declaration title exactly as the current provider does.

### Header, icons, and late host inputs

`SecondaryViewsView.publishHeader()` is called after a panel record is created and may first pass
`null`; it also passes a different `HTMLDivElement` when the stack reparents the header. The existing
`SideBarPanelHeaderView` handle tracks `currentHeader`, detaches its title/icon/actions, and
re-attaches them to the latest `headerRef`. Every provider must call its `update()` from
`onUpdate()` with the current `props.headerRef`; none may cache the first element or write directly
to the host.

The `expanded` prop is also live. `alwaysRenderContent` means a collapsed provider receives
`expanded: false` while remaining mounted. Archive's close action must be removed while collapsed;
the Rest and Board providers have no conditional header actions, but must still forward/update the
prop as part of their live input set rather than treating it as mount-only.

US-1069 is a separate in-flight change to `SecondaryViewsView.resolveIcons`; assume its native
fallback is present before this task. These three registrations have no `icon` override, so the
providers must consume `props.iconElement`, not the React-valued `props.icon`.

Verified glyph sources are:

| Surface | Current source | Vanilla requirement | Registry / DOM verification |
|---|---|---|---|
| Archive close action | `<CloseIcon />` in `ArchiveSecondaryView.tsx` | `IconButtonView({ icon: "close" })` | `"close"` is present in `theme/icon-registry.ts` and `CloseIcon` has a DOM builder. |
| Rest root add action | `<PlusIcon />` in `RestClientShared.tsx`'s `RequestTree` root renderer | Native `IconButtonView({ icon: "plus" })` in the native root-row projection | `"plus"` is present in `theme/icon-registry.ts` and `PlusIcon` has a DOM builder. |
| Archive header fallback | `ArchiveEditor.getIcon()` returns `ArchiveIcon` | Consume the US-1069 `iconElement` result | `"archive"` is registered; the native fallback must not recreate the React `EditorIcon`. |
| Rest header fallback | `.rest.json` resolves to `RestClientIcon` through `LanguageIcon` | Consume the US-1069 `iconElement` result | `RestClientIcon` is a file-pattern component, not an `IconName`; use its direct DOM builder through the file-icon path, not an invented registry name. |
| Board header fallback | `BoardEditorModel.getIcon()` returns `BoardGlyph` for a selected board, otherwise `BoardIcon` | Consume the US-1069 native result | `board-glyph-element.ts` creates an `<img>` for a cached board icon or calls `BoardIcon.createElement({ width, height })`; `BoardIcon` is also registered as `"board"`. |

`uikit/shared/slots.ts` warns in development and returns an empty SVG for an unknown name. The
implementation must not pass `"rest"`, `"rest-client"`, or any other unverified name to
`createIconElement()`.

### Prefix-family lifecycle, verified from source

`BoardEditorModel.deriveSecondaryPanels()` maps every declaration to
`boardSecondaryPanelId(d.id)`, and `setSecondaryViews()` updates `secondaryViewDefs` before
recomputing that list. `BoardWebview.tsx` calls `setSecondaryViews()` for the
`board:setSecondaryViews` message. `SecondaryViewsView.getRenderedPanels()` then creates one
rendered record per `(model, panelId)` and assigns:

```ts
key: panelKey(model.id, panelId),
```

`panelKey()` is `${editorId}::${panelId}`. Therefore two declarations such as
`board-secondary:lists` and `board-secondary:charts` do not share a record, host, or loaded panel
view, even though `secondaryViewRegistry.get()` resolves both ids to the same prefix definition
and constructor.

`LazySecondaryViewView.onUpdate()` compares its instance-local `currentPanelId`. When the id is
unchanged, it forwards props to the already-mounted `panelView`; it does not cancel or restart the
load. When the id changes, it increments the load generation, retires the old view, clears its host,
and starts the new definition. In normal `SecondaryViewsView` operation, an id change also changes
the composite `panelKey`, so the old record is disposed and a new record is created. The identity
case is consequently safe for several declared views: each prefix consumer has its own
`LazySecondaryViewView`, and the same ctor is not repeatedly reloaded inside one instance.

For a manifest change, removed keys go through `SecondaryViewsView.reconcile()`'s record retirement
and `disposeLazyView()`, which disposes the provider and removes its root. Retained keys update the
same record and provider; their state binding re-derives `secondaryViewDefs` and the declaration
title/entry. New keys get new records. The acceptance tests must exercise all three cases: several
simultaneous ids, replacing/removing one id, and changing a declaration while retaining its id.

### Files verified as no-change boundaries

These files were read and do not need changes for this task:

- `src/renderer/ui/secondary-views/SecondaryViewsView.ts` — the vanilla arm, `panelKey` records,
  `headerRef` publishing, and `alwaysRenderContent` behavior already exist.
- `src/renderer/ui/secondary-views/LazySecondaryViewView.ts` — its generation and identity logic
  already handles the prefix-family lifecycle described above.
- `src/renderer/ui/secondary-views/SideBarPanelHeaderView.ts` — the DOM header handle already
  reparents late/changing headers and accepts a native `Node` icon.
- `src/renderer/ui/secondary-views/secondary-view-registry.ts` — the vanilla definition and
  `registerPrefix()` support already exist.
- `src/renderer/components/tree-provider/TreeProviderViewImpl.ts` and its CSS imports — the
  archive tree body is already a native view.
- `src/renderer/editors/board/board-secondary.ts` — prefix construction/parsing is complete.
- `src/renderer/editors/board/BoardWebview.tsx` — remains the React board iframe boundary; it is
  read by the provider but is not converted here.
- `src/renderer/editors/board/BoardGlyph.tsx` and `src/renderer/editors/board/board-glyph-element.ts`
  — the React and DOM board glyph paths already agree and need no edits.
- `src/renderer/theme/icon-registry.ts` and `src/renderer/uikit/shared/slots.ts` — registry
  coverage and unknown-name behavior are inputs to this task, not changes to make here.
- `src/renderer/editors/rest-client/RestClientBody.tsx` — remains the React owner of the detail
  panel and its existing `SplitDetailPanel` call.

## Implementation Plan

### 1. Convert the three registrations without changing their ids or import splitting

Modify `src/renderer/editors/register-editors.ts` only at the three secondary registrations. Add
`arm: "vanilla"` to `archive-tree`, `rest-panel`, and the `registerPrefix(BOARD_SECONDARY_PREFIX,
...)` definition. Keep the literal dynamic import paths and keep the prefix registration as a
prefix. Do not add a new exact registration for any `board-secondary:<viewId>`.

### 2. Convert `ArchiveSecondaryView` to a public vanilla view

Rename `src/renderer/editors/archive/ArchiveSecondaryView.tsx` to
`src/renderer/editors/archive/ArchiveSecondaryView.ts` and make its default export a public
`VanillaView<SecondaryViewProps>` constructor.

Use a stable `createPanelElement({ name: "archive-secondary-view", direction: "column", flex: true,
minHeight: 0, overflow: "hidden" })` root. The constructor must not instantiate
`TreeProviderViewImpl`, `IconButtonView`, the header handle, or any callback resource that creates
DOM. In `onMount()`:

- narrow `props.model` to `ArchiveEditor` and require/use its current `treeProvider`;
- create and claim a `TreeProviderViewImpl` with the existing provider, selected href, click and
  double-click behavior, and `onModel` callback that stores the `TreeProviderViewModel` for reveal;
- create an `IconButtonView` with `icon: "close"`, `name: "archive-secondary-close"`, size `sm`,
  title `"Close"`, and a native click handler that stops propagation and calls
  `archiveModel.page?.removeSecondaryView(archiveModel)`;
- create the header through `createSideBarPanelHeader()` with title `"Archive"`, the current
  `props.headerRef`, `props.iconElement`, and the close button root only when the panel is not the
  page main editor and `props.expanded !== false`; and
- mount the button/tree children exactly once after they are attached and install state bindings.

Bind `selectionState` to update the tree's `selectedHref` input. Bind `revealVersion` to schedule
`treeProviderModel.revealItem(selectedHref)` on the next animation frame when the version is
positive and a selection exists. Track and cancel the pending frame during disposal. Forward
current props to the existing tree view and update the header on every `onUpdate()`, including
`headerRef`, `iconElement`, and `expanded`; changing `expanded` must add/remove the close action
without remounting the tree. Dispose the tree, button, and header in an order that leaves no model
callback or detached header node behind.

The behavior mapping is:

```tsx
// Before: React hooks + React portal + already-vanilla body face.
<SideBarPanelHeader headerRef={headerRef} icon={icon} title="Archive" actions={actions} />
<TreeProviderView
    onModel={(value) => { treeProviderModel.current = value; }}
    provider={provider}
    selectedHref={selectedHref ?? undefined}
    onItemClick={handleItemClick}
    onItemDoubleClick={handleItemClick}
/>
```

```ts
// After: native header and direct TreeProviderViewImpl child.
this.header.update({
    headerRef: props.headerRef,
    icon: props.iconElement,
    title: "Archive",
    actions: this.shouldShowClose(props) ? this.closeButton.root : undefined,
});
this.tree.update({
    provider: archiveModel.treeProvider,
    selectedHref: archiveModel.selectionState.get().selectedHref ?? undefined,
    onItemClick: this.handleItemClick,
    onItemDoubleClick: this.handleItemClick,
    onModel: this.onTreeModel,
});
```

The exact child update must use the `TreeProviderViewImpl` props, not the React
`TreeProviderView` wrapper, so this conversion does not create a React root for the archive tree.

### 3. Add a native request-tree projection while preserving the React rest-client body

Create `src/renderer/editors/rest-client/panels/RestRequestTreeView.ts` as a public `VanillaView`
over the existing `RequestTreeItem` data. Reuse the verified neutral exports from
`src/renderer/editors/rest-client/RestClientShared.tsx`: `RequestTreeItem`, `buildGroupedTree`,
`requestTreeItemTraits`, and `getRequestTreeChildren`. Remove the React-only `RequestTree` export
and implementation from that file; its only `src/` importer is the secondary view being converted.
Do not change the exported `SplitDetailPanel` signature or the React `RestClientBody` call site.

The native tree must preserve the current `RequestTree` behavior:

- root item `"__root__"` with the uppercase `Requests` label and a `plus` `IconButtonView` that
  stops propagation and calls `vm.addRequest()`;
- collection labels with bold non-empty names and italic/light `(empty)`;
- request rows with a method badge colored from `METHOD_COLORS`, a truncated/italic request name,
  and `(empty)` for unnamed requests;
- selection through `vm.selectRequest(item.id)`;
- collection context actions Add Request, Open in New Editor, and Delete Collection;
- request context actions Duplicate, Open in New Editor, and Delete;
- `TraitTypeId.RestRequest` drag data, RestRequest moves, LINK drops, and the same collection
  selection rules; and
- default expansion and focus-aware selection.

Use the existing native `TreeView` default row projection with a local trait accessor whose
`label` values are direct DOM nodes (cast only at the existing React-typed `ITreeItem.label`
boundary). Build those nodes with `createPanelElement`, `createTextElement`, and a single owned
`IconButtonView` for the root add action; `TreeItemView.setLabel()` already accepts a DOM node
through the non-React `fillSlot()` path. Supply `getContextMenu` for the native menu descriptors
and the existing `onItemContextMenu` bridge only to preserve the current single-select right-click
selection. This keeps method/name rows and the root action native without changing the UIKit Tree
contract or introducing a React root.

Source verification found that `RequestTree` is exported at `RestClientShared.tsx:344` but its only
importer in `src/` is this secondary view. Therefore removing the React-only `RequestTree` export
and implementation crosses no remaining React caller boundary; Rule 2 still protects the
React-facing `SplitDetailPanel` contract. Its `useState`/`useLayoutEffect` state for the detail
splitter stays in React. The secondary view's `useMemo` and request-tree JSX/hooks are the residue
absorbed by this conversion.

### 4. Convert `RestPanelSecondaryView` to a vanilla host

Rename `src/renderer/editors/rest-client/panels/RestPanelSecondaryView.tsx` to
`src/renderer/editors/rest-client/panels/RestPanelSecondaryView.ts`. Its public constructor should
create only a stable column root. In `onMount()`, create the native request-tree child and a
`createPanelElement({ name: "rest-panel-pane", direction: "column", flex: true, overflow: "auto",
minHeight: 0, minWidth: 0 })` body, append/mount them, and create the native header with title
`"Rest"`, `props.headerRef`, and `props.iconElement`.

Bind the `RestClientEditor.state` slice used by the current hook body (`data.requests` and
`selectedRequestId`). Rebuild the grouped root/trait projection only when the request array changes;
update the existing tree for selection changes. `onUpdate()` must forward the current editor,
header ref, native icon, and expanded value without reconstructing the editor-owned state or body.
Dispose the request tree and header cleanly. There are no Rest header actions, so `expanded` does
not hide any action, but it remains a live input and must not be ignored by a view that later gains
an action.

The boundary is deliberately:

```tsx
// Retained React body contract in RestClientShared.tsx.
export function SplitDetailPanel({ vm, request, state }: {
    vm: RestClientSource;
    request: RestRequest;
    state: RestClientViewState;
}) { /* unchanged React implementation */ }
```

```ts
// New secondary-panel contract.
export default class RestPanelSecondaryView extends VanillaView<SecondaryViewProps> {
    // native root + RestRequestTreeView; no useMemo, SideBarPanelHeader, or JSX
}
```

### 5. Convert `BoardSecondaryView` while retaining `BoardWebview` as the explicit child boundary

Rename `src/renderer/editors/board/BoardSecondaryView.tsx` to
`src/renderer/editors/board/BoardSecondaryView.ts` and make its default export a public
`VanillaView<SecondaryViewProps>`.

Use `createPanelElement()` for the native column root, a native header handle, and native
placeholder content (`createPanelElement` + `createTextElement`) for the three current messages:
`Board not available`, `Trust the board to view this panel`, and `View not found`. Subscribe to the
board model state and `boardTrust.subscribePaths()` instead of calling the React-only
`state.use()`/`useIsTrusted()` hooks. The state projection must include `boardRoot`, `selectedBoard`,
`reloadToken`, and `secondaryViewDefs`.

`BoardWebview.tsx` remains unchanged and is mounted only when `selectedRoot`, the matching
declaration, and trust are all present. It is a deliberate nested React compatibility island:
create one `mountReactHandle()` in the provider's owned content host and render the same
`BoardWebview` props (`model`, `boardRoot`, `entry`, `view`, `isMain: false`). Do not rely on a key
at the root of a long-lived React root to remount the iframe. Track the explicit frame identity
`${viewId}__${reloadToken}` in the native provider; when it changes, dispose the existing
`mountReactHandle()` and create a fresh handle before rendering the new `BoardWebview`. For
ordinary prop changes with the same identity, call the existing handle's `render()` without
recreating it. This makes edited-file reloads an explicit native lifecycle operation, independent
of React's root-level key reconciliation. Dispose the handle before removing the host when the
panel is retired or its state becomes unavailable. Do not convert `BoardWebview` in this task; its
main-editor caller is a separate React boundary.

The title must be updated from the declaration on every state change, not from the registration
label:

```tsx
// Before: declaration-owned title, React iframe key.
const title = def?.title ?? viewId ?? "View";
<SideBarPanelHeader name="board-secondary" headerRef={headerRef} icon={icon} title={title} />
<BoardWebview key={`${viewId}__${s.reloadToken}`} ... view={def.id} isMain={false} />
```

```ts
// After: same declaration title, native shell, and explicit React-island remount identity.
this.header.update({
    headerRef: props.headerRef,
    icon: props.iconElement,
    title: declaration?.title ?? viewId ?? "View",
});
this.boardReact?.render(React.createElement(BoardWebview, {
    model: this.boardModel,
    boardRoot: selectedRoot,
    entry: declaration?.html ?? "index.html",
    view: declaration?.id,
    isMain: false,
}));
```

When `panelId` changes on an individual provider instance, derive the new view id and explicitly
retire/recreate the handle for the new frame identity; the normal host path should also
retire/recreate at the composite `panelKey(model.id, panelId)`. When `secondaryViewDefs` changes,
update the existing declaration title/entry and trust/placeholder state. Never share a
`BoardWebview` or its React root between two panel records.

### 6. Verify lifecycle, visuals, and the prefix-family cases

Before implementation, capture the source-level checks and after implementation run the matching
verification:

- Typecheck the renamed `.ts` providers and the registration import return types. Confirm each
  default export is constructible as `VanillaView<SecondaryViewProps>`.
- Open an archive with a provider, select/double-click entries, navigate from the archive, reveal
  the selected entry, collapse/expand the panel, and confirm the close action disappears only while
  collapsed or when the archive is the page main editor. Confirm no `react-slot` exists for the
  archive provider body.
- Open a Rest client with empty, grouped, and unnamed requests. Exercise selection, add, duplicate,
  delete, collection moves, LINK drops, context menus, default expansion, and focus selection.
  Confirm `RestClientBody` still renders its React detail editor and its `SplitDetailPanel` state is
  untouched, while the sidebar tree does not recreate a React root per update.
- Open one board declaring at least three secondary views. Confirm the three records have distinct
  composite keys and each iframe receives its own `view` role. Update the manifest at runtime by
  retaining one id, removing one, and adding/replacing one; verify retained views update, removed
  views dispose their iframe/React root, and added views load once.
- For a retained board id, change title/html and `reloadToken`; verify the declaration title updates,
  the provider disposes and recreates its `mountReactHandle()` only when the explicit frame identity
  changes, and a same-id reconcile does not call `LazySecondaryViewView.startLoad()` again. For
  several ids, verify the shared constructor identity does not cause cross-panel reloads.
- Change `headerRef` from `null` to a real header and then to a different header. Confirm the native
  title/icon/action nodes follow the handle and the old header has no detached action node.
- Confirm header icons are the US-1069 `iconElement` nodes. Inspect the DOM for `close`/`plus`, the
  archive/rest fallbacks, and the board custom glyph; no unknown registry warning or empty unknown
  SVG is acceptable.
- Run the repository's applicable typecheck/lint/build checks and `git diff --check` after the
  implementation. No dashboard edit belongs to this task; EPIC-063 already lists US-1072.

## Concerns

### 1. Prefix family versus one constructor — resolved

The prefix registration maps many ids to one constructor, but not to one live instance. The verified
identity is `panelKey(model.id, panelId)`, which produces a distinct `PanelRecord` and
`LazySecondaryViewView` for every declared id. `LazySecondaryViewView.onUpdate()` reloads only when
that instance's `panelId` changes. Several ids therefore do not thrash one another. A manifest
removal retires the exact old record; a retained id receives a state update; a new id gets a new
record. The implementation must preserve this keying and dispose the nested `BoardWebview` before
the old record/root disappears.

### 2. BoardWebview is still React

`BoardWebview` remains a React child because its iframe lifecycle belongs to the board editor
boundary; the main board view mounts the same editor-owned component. E5-3's zero-sidebar-root
target measures roots created by this secondary-view contract (the panel body and header/icon
roots), not this nested board-editor island. The board-secondary panel is therefore expected to
retain one documented React root after this epic, named in the close-out measurement rather than
counted as a failure or follow-up target.

### 3. RequestTree has a React-valued custom renderer

The current `RequestTree` uses JSX for the root add row, method/name rows, and context-menu event
closures. Mounting it unchanged would leave a React root in the converted Rest panel and would not
absorb its hook/JSX residue. Source verification found that its only `src/` importer is
`RestPanelSecondaryView.tsx`, so the native projection can replace the export in
`RestClientShared.tsx` without crossing the still-React `RestClientBody.tsx` boundary. The existing
`TreeView`/`TreeItemView` and direct DOM slots remain the planned projection; `SplitDetailPanel`
remains unchanged under Rule 2.

### 4. Shared RestClientShared.tsx state is intentionally not converted

`RestClientShared.tsx` is shared by the sidebar and `RestClientBody.tsx`, but its `SplitDetailPanel`
uses React `useState` and `useLayoutEffect` for response-pane sizing. Those hooks are not residue of
the thin secondary wrapper and stay in React. The React-only `RequestTree` export may be removed
because source verification found no remaining importer beyond the converted secondary view. Do not
change the React-facing `SplitDetailPanel` signature or introduce a vanilla prop shape that forces
the body caller to adapt.

### 5. Native icon fallback depends on US-1069

The current source shows why this dependency matters: `BoardEditorModel.getIcon()` can return a
React `BoardGlyph`, and `RestClientIcon` is a file-pattern component rather than a registry name.
The DOM path exists (`createBoardGlyphElement()` and `createFileTypeIconElement()`), but the
no-override resolver must be the US-1069 implementation before these registrations move arms. The
providers should consume `iconElement` and must not guess names or inspect React element internals.

### 6. Late headers and expanded actions

At least one update arrives with `headerRef: null`, and a collapsed panel remains mounted. Every
provider needs an `onUpdate()` path for both values. Archive is the only provider here with a header
action; its current React condition omits `expanded`. This task intentionally changes that behavior:
the native close action is gated by `expanded !== false` and updated live because the registry
contract defines `expanded` so providers can drop actions that only make sense while the body is
visible. That is an intentional UX/contract correction, not incidental JSX-to-DOM translation.

## Acceptance Criteria

- [ ] `archive-tree`, `rest-panel`, and the `registerPrefix(BOARD_SECONDARY_PREFIX, ...)`
      registration declare `arm: "vanilla"`; the board family is not changed to an exact
      registration and all dynamic imports remain literal.
- [ ] `ArchiveSecondaryView.ts`, `RestPanelSecondaryView.ts`, and `BoardSecondaryView.ts` each
      default-export a public `VanillaView<SecondaryViewProps>` with constructor-only stable-root
      setup and `onMount()` child creation.
- [ ] Archive preserves selection, navigation, double-click, reveal, provider behavior, and main-
      editor close semantics; its close action is intentionally live-gated by `expanded` as the
      registry contract requires, and uses the verified registry name `"close"`.
- [ ] Rest preserves the request tree's grouping, labels, selection, context menus, add/duplicate/
      delete/move/drop behavior, default expansion, focus selection, and `"plus"` add icon without
      a JSX request-tree root. `RestClientBody.tsx` and `SplitDetailPanel`'s React-facing signature,
      state, and effects remain unchanged.
- [ ] Board preserves declaration-owned titles, trust gating, placeholder messages, iframe
      `entry`/`view`/`isMain` props, and reload-token behavior. `BoardWebview.tsx` is retained as the
      explicit nested React boundary and is disposed whenever its native provider retires it.
- [ ] Several `board-secondary:<viewId>` declarations render as separate `panelKey(model.id,
      panelId)` records. Same-id updates do not restart the lazy load; manifest add/remove/replace
      updates the correct record, disposes removed roots/iframes, and does not leak old declarations.
- [ ] All three providers route `headerRef` and `iconElement` through
      `createSideBarPanelHeader().update()` on every update, including a late null header and a
      changed header element. No provider caches the initial header node or uses React
      `createPortal`.
- [ ] Icon verification is recorded in code/tests or review: `close` and `plus` resolve in the
      registry; archive/rest fallbacks use US-1069 DOM elements; board fallback uses the existing
      `createBoardGlyphElement`/`BoardIcon.createElement` path; no unknown icon name is introduced.
- [ ] No files listed as no-change boundaries are modified, no dashboard entry is added, and no
      React conversion crosses into `BoardEditorView.tsx` or the Rest detail body.
- [ ] Applicable typecheck, lint, build, and `git diff --check` pass, and the archive/Rest/board
      smoke cases above show no provider-level React slot leak or stale disposed-view callback.

## Files Changed

| File | Planned change |
|---|---|
| `src/renderer/editors/register-editors.ts` | Add `arm: "vanilla"` to the two exact registrations and the existing `registerPrefix(BOARD_SECONDARY_PREFIX, ...)` registration. |
| `src/renderer/editors/archive/ArchiveSecondaryView.tsx` → `src/renderer/editors/archive/ArchiveSecondaryView.ts` | Replace the React function/hooks/portal with a native provider, `TreeProviderViewImpl`, native close action, header handle, state bindings, and reveal/disposal lifecycle. |
| `src/renderer/editors/rest-client/panels/RestPanelSecondaryView.tsx` → `src/renderer/editors/rest-client/panels/RestPanelSecondaryView.ts` | Replace the React wrapper and `useMemo` body with a native panel host and live state/header updates. |
| `src/renderer/editors/rest-client/RestClientShared.tsx` | Remove the React-only `RequestTree` projection; retain the neutral tree exports and unchanged React `SplitDetailPanel` contract. |
| `src/renderer/editors/rest-client/panels/RestRequestTreeView.ts` | New native request-tree projection for the sidebar, including direct DOM row labels, root add action, selection, context menus, and trait drag/drop behavior. |
| `src/renderer/editors/board/BoardSecondaryView.tsx` → `src/renderer/editors/board/BoardSecondaryView.ts` | Replace the React shell/hooks/portal with a native header, state/trust subscriptions, placeholders, and an explicitly owned `BoardWebview` React island. |

The following are intentionally not changed: `src/renderer/editors/rest-client/RestClientBody.tsx`,
`src/renderer/editors/board/BoardWebview.tsx`,
`src/renderer/editors/board/BoardGlyph.tsx`, `src/renderer/editors/board/board-glyph-element.ts`,
`src/renderer/ui/secondary-views/SecondaryViewsView.ts`,
`src/renderer/ui/secondary-views/LazySecondaryViewView.ts`,
`src/renderer/ui/secondary-views/SideBarPanelHeaderView.ts`, and
`src/renderer/ui/secondary-views/secondary-view-registry.ts`.

# US-1047: Secondary-view vanilla arm + convert one editor-owned panel

Parent epic: [EPIC-059: De-React Epic E1 - Editor foundations](../../epics/EPIC-059.md)

## Goal

Add an additive vanilla arm to the secondary-view registry and make the secondary-view host pass a
vanilla panel root through the existing DOM slot path. Prove the arm with the Explorer Search panel,
which has a real header/action surface and an already-vanilla `FileSearchView`, without creating a
React root for the panel body.

## Background

The secondary-view registry currently has one arm:

```ts
// src/renderer/ui/secondary-views/secondary-view-registry.ts:36
loadComponent: () => Promise<{ default: React.ComponentType<SecondaryViewProps> }>;
```

There are 13 exact registrations plus one `board-secondary:*` prefix registration in
`src/renderer/editors/register-editors.ts:12-107`. The registry is consumed by the native
`SecondaryViewsView`, but its descriptor currently puts a React element into the panel slot:

```ts
// src/renderer/ui/secondary-views/SecondaryViewsView.ts:183-200
children: React.createElement(LazySecondaryView, {
    model: record.model as never,
    panelId: record.panelId,
    headerRef: record.headerElement,
    icon: record.icon,
    expanded: panel.key === activeKey,
}),
```

`SecondaryViewsView` is already a `VanillaView`. The native stack is
`src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStackView.tsx`; its
`updateContent()` method at lines 191-207 calls `fillSlot(record.content, panel.children)`. The
public descriptor type in `CollapsiblePanelStack.tsx:6-16` currently says `children: ReactNode`,
although `fillSlot()` already accepts `string | Node | React.ReactNode` and appends a `Node` in its
non-React arm.

The root accounting is therefore verified rather than assumed:

- `src/renderer/uikit/shared/mount.tsx:1-3,124-153` imports `createRoot` only for
  `mountReactHandle()`. `mountVanilla()` creates a React adapter element; it does not call
  `createRoot`.
- `src/renderer/uikit/shared/fill-slot.ts:5,39-47` treats a DOM `Node` as non-React content.
  The non-React path at lines 105-125 calls `host.replaceChildren()` and `host.append(slot)`. The
  React path calls `mountReactHandle()` and therefore creates one root per active React slot host.
- Consequently, a vanilla secondary panel can make `children` a DOM `Node` and cost zero React
  roots. Existing React panels continue to supply a React element and retain their one
  `fillSlot()` root. This is the same slot direction recorded by EPIC-059 E1-8 and the registry
  normalization shape used by US-1042.

The `headerRef` contract remains useful in both arms. React `SideBarPanelHeader` currently treats
it as a `createPortal()` target (`src/renderer/ui/secondary-views/SideBarPanelHeader.tsx:35-97`).
The vanilla arm will treat the same `HTMLDivElement | null` as the destination to which it appends
stable DOM header nodes. That is simpler than a portal, not a new problem.

The committed conversions provide the implementation vocabulary for the panel and its loader:

- `src/renderer/editors/toolset/ToolsetEditorView.ts` uses a public `VanillaView` constructor,
  `createPanelElement`, semantic text/buttons, model-first binding, `KeyedList`, and
  `SubtreeSwap`; it also proves that registry icon names can stay out of React.
- `src/renderer/editors/mermaid/MermaidBodyView.ts` keeps stable error/overlay nodes, mounts
  owned child views explicitly, updates a mounted child in place, and swaps only the changing
  content branch.
- `src/renderer/editors/shared/FindBarView.ts` keeps stable `InputView` and `IconButtonView`
  children and updates their callbacks/values without reconstructing the DOM root.
- `src/renderer/editors/image/ImageToolbarView.ts` keeps direct `IconButtonView` children and
  owns an imperative menu handle, disposing it explicitly when the toolbar retires.

`doc/tasks/US-1042-vanilla-editor-seam/README.md` uses the same additive-arm rule: normalize or
select the arm at a registry boundary, keep React compatibility for existing consumers, mount a
vanilla constructor directly in a native host, and make ownership/disposal explicit. US-1047
applies that shape to the second registry and to a DOM slot rather than an editor root.

The stack owns the header lifecycle. `CollapsiblePanelStackView.updateHeader()` invokes the panel
header callback with the stable native header at line 182 and with `null` on removal at line 213.
The existing `SecondaryViewsView.publishHeader()` records those transitions and asks the stack to
reconcile again. The vanilla lazy panel must therefore update when `headerRef` changes and remove
its own header nodes when it is disposed.

### Why the branch is at `toPanelDescriptor`

The loader is asynchronous, so the panel constructor cannot synchronously inspect the imported
default export to decide whether it is a React component or a `VanillaView` constructor. Add an
explicit `arm: "react" | "vanilla"` discriminator to the registry definition. Existing definitions
default to the React arm; the pilot registration declares `arm: "vanilla"`. This lets
`SecondaryViewsView.toPanelDescriptor()` choose the slot shape synchronously while a
`LazySecondaryViewView` sibling performs the async import and handles loading/failure.

This is preferable to branching inside the existing React `LazySecondaryView`: rendering a
vanilla constructor through a React component would retain the React-compatible path at the exact
point this task is meant to remove. The branch belongs where `children` is selected; async loading,
stale-result cancellation, construction, mount, and error cleanup belong in the vanilla lazy
view. The existing `LazySecondaryView` remains the React path for the other 13 panels and for
unexpected React-arm calls.

### Candidate panel investigation

All five measured candidates were checked for their first-level body dependencies and their header
path:

| Candidate | Verified dependency shape | Result |
|---|---|---|
| `link-editor/panels/LinkHostnamesSecondaryView` (16 lines) | Renders `LinkHostnamesNavigationPanel`, whose file uses React hooks, `Panel`, `Splitter`, `LinkHostnamesPanel`, `LinksList`, `RenderGridModel`, and multiple React-only state/effect paths. | Too thin to prove the seam and would require converting a substantial nested panel. |
| `notebook/panels/NotebookTagsSecondaryView` (34 lines) | Renders `TagsListView`, whose file uses `useState`, `useEffect`, `useMemo`, React render-item JSX, `ListBox`, and inline style objects. | Still React-only below the wrapper; not a clean pilot. |
| `explorer/SearchSecondaryView` (57 lines) | Its `FileSearch` face is only a `mountVanilla(FileSearchView, props)` adapter. `FileSearchView.ts` is a `VanillaView` with `FileSearchModel`, `InputView`, `IconButtonView`, `VirtualGridView`, and static `FileSearch.css`. | Chosen. It has meaningful state/action plumbing, an explicit registry icon (`"search"`), a dynamic header title, and no React body dependency. |
| `rest-client/panels/RestPanelSecondaryView` (58 lines) | Its `RequestTree` comes from `RestClientShared.tsx`, which uses React hooks and JSX renderers for `Tree`, `TreeItem`, `Panel`, `Text`, and the add button. | Would pull a React-only request-tree conversion into this task. |
| `archive/ArchiveSecondaryView` (65 lines) | Its `TreeProviderView` face is already `mountVanilla(TreeProviderViewImpl, props)`. The implementation constructor requires `provider`, selection/click callbacks, optional tree settings, and an `onModel` callback; this is workable. However, the wrapper also needs the editor-icon fallback and reveal lifecycle, making it a larger pilot than Search. | Valid future pilot, but not selected. |

The 16-line Link Hostnames wrapper is specifically not selected: it has the required header call,
but its body would prove only the registry branch while immediately dragging in a React-only
navigation surface. Search proves the same branch with a real native child already available.

### Header recommendation

Do not render `SideBarPanelHeader` from the vanilla panel. It is a React component whose only
output is a portal and using it would require a React root, defeating the zero-root measurement.
Add a React-free DOM factory next to it, in
`src/renderer/ui/secondary-views/SideBarPanelHeaderView.ts`, and let the Search panel use that
factory. The factory should maintain stable icon/title/action nodes, move them between the current
`headerRef` and no target, and expose `update()`/`dispose()` so repeated host updates do not create
fresh nodes.

The factory should use `createIconElement()` for registry-name icons, `createPanelElement()` for
the title and action groups, and `createTextElement()` for the truncating title. The pilot's
`"search"` registry override is a DOM-safe icon name, so it needs no React icon slot. The factory
can accept an already-DOM `Node` for future vanilla callers; a React-valued fallback icon remains
outside this pilot's arm and must not be sent through `fillSlot()` by the pilot.

The load-bearing header behavior is in
`src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.css:48-63`:
`data-type="panel"`, `data-type="text"`, and `data-type="tag"` descendants have
`pointer-events: none`, while button and icon-button descendants restore
`pointer-events: auto`. The factory must retain UIKit `data-type` attributes and the Search close
button must stop propagation, as the current React handler does, so title/icon clicks toggle the
panel but the close action does not. No inline color or hardcoded color is needed; the existing
header CSS continues to supply theme variables and the semantic Text/Panel attributes.

## Implementation Plan

### 1. Widen the registry with an explicit, additive arm

Modify `src/renderer/ui/secondary-views/secondary-view-registry.ts`.

Before:

```ts
interface SecondaryViewDefinition {
    id: string;
    label: string;
    icon?: IconRef;
    loadComponent: () => Promise<{ default: React.ComponentType<SecondaryViewProps> }>;
}
```

After:

```ts
type ReactSecondaryViewDefinition = {
    id: string;
    label: string;
    icon?: IconRef;
    arm?: "react";
    loadComponent: () => Promise<{
        default: React.ComponentType<SecondaryViewProps>;
    }>;
};

type VanillaSecondaryViewDefinition = {
    id: string;
    label: string;
    icon?: IconRef;
    arm: "vanilla";
    loadComponent: () => Promise<{
        default: VanillaViewCtor<SecondaryViewProps>;
    }>;
};

type SecondaryViewDefinition =
    | ReactSecondaryViewDefinition
    | VanillaSecondaryViewDefinition;
```

Import `VanillaViewCtor` directly from `src/renderer/uikit/shared/mount.tsx`. Keep `SecondaryViewProps`
unchanged for the React-compatible arm, including `headerRef: HTMLDivElement | null`. The
discriminator is necessary because the import result is not available synchronously; do not rely
on a runtime guess based on whether a function has a prototype.

Keep every existing registration on the default React arm. The Search registration will be the only
one that adds `arm: "vanilla"` in this task. Preserve the existing exact/prefix resolution and
labels/icons.

### 2. Widen only the slot-bearing panel descriptor

Modify `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.tsx`.

Before:

```ts
children: ReactNode;
```

After:

```ts
children: ReactNode | Node;
```

Do not widen `ReactNode`, `SlotContent`, or `CollapsiblePanelStackProps.children`. The public stack
face still receives declarative React children; only `CollapsiblePanelProps.children` crosses the
native `fillSlot()` path in `CollapsiblePanelStackView.updateContent()` and therefore needs the DOM
arm. This follows the existing `IconRef | Node` and `DialogContentProps.children` precedent.

`src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStackView.tsx` needs no type or behavior
change: its existing line 207 already passes `panel.children` to `fillSlot()`, whose non-React arm
appends a `Node`.

### 3. Add the vanilla asynchronous loader sibling

Create `src/renderer/ui/secondary-views/LazySecondaryViewView.ts`.

The new class should be a `VanillaView` over the same props currently accepted by
`LazySecondaryView` (`model`, `panelId`, `headerRef`, `icon`, and `expanded`). Its root must be a
stable semantic panel host created once in the constructor; do not create a new root on each
update or use an inline `display` style. On mount it should:

1. Resolve the registry definition and verify `arm === "vanilla"`.
2. Start `def.loadComponent()` asynchronously. While pending, retain the current React lazy
   behavior of an empty body (the existing component returns `null` while `Component` is absent).
3. On a live successful result, construct the returned `VanillaViewCtor` with the current
   `SecondaryViewProps`, append its stable `root` to the host, and call `mount()`.
4. On failure, show the equivalent of the current lazy error without inline styles:

   ```ts
   createPanelElement(
       { name: "secondary-view-error", padding: "md" },
       [createTextElement(message, { color: "light", preWrap: true })],
   );
   ```

   Format caught `unknown` with `errMessage(error, fallback)` and use `guard()` for cleanup-only
   catches. Never use the current React path's `style={{ padding: 8, color: ... }}` in this file.
5. Cancel stale imports when the view is disposed or its panel identity changes. Dispose a
   successfully mounted panel view before removing its root. If construction or `mount()` throws,
   dispose a partial view through `guard()`, remove its root, and retain the original error message.

`onUpdate()` must first use the already-assigned `this.props` contract correctly: compare/store any
previous panel constructor or identity in explicit fields, because `VanillaView.update()` assigns
`this.props = props` before invoking `onUpdate(props)`. Forward changed `headerRef`, model, icon,
and expanded values to the mounted panel view. The Search pilot's view may reuse its existing
native child when the model identity is unchanged; any replacement must be manual because
`this.child(view)` has no release API and is only correct for a child whose lifetime exactly matches
its parent.

### 4. Select the DOM arm in the native secondary host

Modify `src/renderer/ui/secondary-views/SecondaryViewsView.ts`.

Extend `PanelRecord` with an optional `LazySecondaryViewView` and import the new class. In
`reconcile()`, when a record is retired, dispose its lazy vanilla view and remove its root before
deleting the record. Apply the same explicit cleanup in `clearRecords()`/host disposal. Do not use
`this.child()` for these record views: panel records are created and retired repeatedly, while
`VanillaView` has no child-release API.

Change `toPanelDescriptor()` from the single React slot:

```ts
children: React.createElement(LazySecondaryView, {
    model: record.model as never,
    panelId: record.panelId,
    headerRef: record.headerElement,
    icon: record.icon,
    expanded: panel.key === activeKey,
}),
```

To an arm branch:

```ts
const definition = secondaryViewRegistry.get(record.panelId);
const descriptor: CollapsiblePanelProps = {
    id: panel.key,
    name: panel.panelId,
    headerRef: record.headerRef,
    alwaysRenderContent: true,
    children: null,
};
if (definition?.arm === "vanilla") {
    const lazyView = record.lazyView ?? this.createLazyView(record);
    lazyView.update(this.lazyViewProps(record, panel.key === activeKey));
    return { ...descriptor, children: lazyView.root };
}

return {
    ...descriptor,
    children: React.createElement(LazySecondaryView, {
        model: record.model as never,
        panelId: record.panelId,
        headerRef: record.headerElement,
        icon: record.icon,
        expanded: panel.key === activeKey,
    }),
};
```

The actual implementation may build the common descriptor before the branch, but it must preserve
`id`, `name`, `headerRef`, `alwaysRenderContent`, and the current expanded value. Mount a newly
created `LazySecondaryViewView` before handing its root to the stack. The React branch must remain
the existing `LazySecondaryView` element, so the other 13 panels retain their current React-root
and error behavior.

### 5. Keep the React lazy path type-safe and React-only

Modify `src/renderer/ui/secondary-views/LazySecondaryView.tsx` only to account for the new
discriminator.

Before:

```ts
void def.loadComponent().then((mod) => {
    if (!cancelled) this.setComponent(mod.default);
});
```

After, reject an accidental vanilla-arm call before assigning a constructor to the React state:

```ts
if (def.arm === "vanilla") {
    queueMicrotask(() => {
        if (this.isLive) this.setError(`Vanilla secondary view used by React host: "${this.props.panelId}"`);
    });
    return;
}
void def.loadComponent().then((mod) => {
    if (!cancelled) this.setComponent(mod.default);
});
```

Retain the existing `errMessage()` failure path and cancellation cleanup. The normal React arm is
unchanged; this guard is only a defensive type/runtime boundary.

### 6. Add a React-free DOM header factory

Create `src/renderer/ui/secondary-views/SideBarPanelHeaderView.ts`.

Expose a small handle in the same style as the existing DOM factories:

```ts
export interface SideBarPanelHeaderDomProps {
    headerRef: HTMLDivElement | null;
    icon?: IconName | Node;
    title: string;
    titleAttribute?: string;
    actions?: Node;
}

export interface SideBarPanelHeaderHandle {
    update(props: SideBarPanelHeaderDomProps): void;
    dispose(): void;
}

export function createSideBarPanelHeader(
    props: SideBarPanelHeaderDomProps,
): SideBarPanelHeaderHandle;
```

Use direct imports from `Panel/panel-style`, `Text/text-style`, `shared/slots`, and
`theme/icon-registry` (for `IconName`), plus the existing
header CSS contract. Keep the title group and action group as `data-type="panel"` elements, the
title as `data-type="text"` with `color: "inherit"`, `size: "md"`, and truncation, and registry
icons as direct SVG nodes. Move stable nodes when `headerRef` changes; do not rebuild them on every
panel update. The action node is caller-owned and must not be disposed by this handle.

This factory is intentionally React-free. `SideBarPanelHeader.tsx` remains the compatibility face
for all existing React panels and is not rewritten in this task. The factory does not use Emotion,
inline styles, hardcoded colors, or a React portal. The pilot only needs title/icon/actions; the
existing React-only `badge`, arbitrary React title, and `show-main` variations remain on the React
face until a future vanilla consumer requires a dedicated DOM equivalent.

### 7. Convert the Search panel and make it the consumer

Rename `src/renderer/editors/explorer/SearchSecondaryView.tsx` to
`src/renderer/editors/explorer/SearchSecondaryView.ts`, replacing the function component with a
`VanillaView<SecondaryViewProps>` default export.

Before:

```tsx
export default function SearchSecondaryView({ model: rawModel, headerRef, icon }: SecondaryViewProps) {
    const model = rawModel as ExplorerEditor;
    // React callback, SideBarPanelHeader portal, and FileSearch mountVanilla face.
    return (
        <>
            <SideBarPanelHeader headerRef={headerRef} icon={icon} title={...} actions={...} />
            <FileSearch ... />
        </>
    );
}
```

After, the class should:

- Build a stable panel root with `createPanelElement`, a stable `FileSearchView`, an
  `IconButtonView` using the registry name `"close"`, and the new header handle. Use direct imports;
  do not import the React `FileSearch` or `SideBarPanelHeader` faces at runtime. Narrow the
  registry-supplied `icon` to its DOM-safe string arm before passing it to the header factory.
- Pass `folder: model.rootPath`, `state: model.searchState`, `onStateChange: model.setSearchState`,
  and the existing `onResultClick` behavior to `FileSearchView`. The result handler must still call
  `model.setSelectedHref()` and `app.events.openRawLink.sendAsync(createLinkData(...))`, preserving
  `pageId`, `revealLine`, and `highlightText` behavior.
- On mount, mount the close button and `FileSearchView`, then bind/update the dynamic header title
  (`Search [${fpBasename(searchFolder)}]`) and its full-path title attribute. On update, refresh the
  header and replace the manually-owned FileSearch view only when its model/root identity requires
  it; do not create a fresh body node for an ordinary header update.
- Dispose the manually-owned FileSearch view and remove its root, dispose the close button, and
  dispose the header handle. Do not register a repeatedly replaceable child with `this.child()`.

The resulting module has no JSX and no runtime React import. Its `FileSearchView` dependency is the
existing vanilla implementation (`FileSearch.tsx` remains only as a React compatibility face for
other callers). The `search` registration already supplies a DOM-safe icon name, so this pilot does
not introduce a React icon slot.

### 8. Register exactly one vanilla panel

Modify only the Search registration in `src/renderer/editors/register-editors.ts:24-31`.

Before:

```ts
secondaryViewRegistry.register({
    id: "search",
    label: "Search",
    icon: "search",
    loadComponent: () => import("./explorer/SearchSecondaryView"),
});
```

After:

```ts
secondaryViewRegistry.register({
    id: "search",
    label: "Search",
    icon: "search",
    arm: "vanilla",
    loadComponent: () => import("./explorer/SearchSecondaryView"),
});
```

The dynamic import remains literal and extensionless, so code splitting is retained. All other
secondary-view registrations remain unchanged and continue using the React arm.

### Files that need NO changes

- `src/renderer/uikit/shared/mount.tsx` and `src/renderer/uikit/shared/fill-slot.ts`: the verified
  React-root and DOM-node behavior is already correct.
- `src/renderer/uikit/shared/vanilla-view.ts`: its update-before-hook assignment and deliberate
  non-detaching `dispose()` behavior are relied upon, not changed.
- `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStackView.tsx` and
  `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.css`: the stack already routes
  content through `fillSlot()` and its header CSS already preserves click-through/toggle behavior.
- `src/renderer/ui/secondary-views/SideBarPanelHeader.tsx` and
  `src/renderer/ui/secondary-views/SideBarPanelHeader.css`: the React compatibility face and its
  themed styles remain for all React panels.
- `src/renderer/components/file-search/FileSearchView.ts`, `FileSearchModel.ts`, and
  `FileSearch.css`: the pilot consumes this existing vanilla implementation unchanged.
- `src/renderer/components/tree-provider/TreeProviderView.tsx` and
  `TreeProviderViewImpl.ts`: Archive was investigated as a valid future consumer, but is not part
  of this task.
- The other 13 editor-owned panel files and their registration entries: they remain on the React
  arm and must keep working untouched.
- `src/renderer/uikit/IconButton/IconButton.tsx` and `src/renderer/uikit/Dialog/DialogContent.tsx`:
  their existing `IconRef | Node` slot precedent requires no change here.
- `src/renderer/editors/toolset/ToolsetEditorView.ts`, `MermaidBodyView.ts`,
  `FindBarView.ts`, `ImageToolbarView.ts`, and the US-1042 task document: these are reference
  conversions only.
- `doc/active-work.md` and `doc/epics/EPIC-059.md`: explicitly excluded by this task request.
- No unit-test files: this project task adds no unit tests.

## Concerns

- The synchronous `arm` discriminator is not optional infrastructure: without it,
  `toPanelDescriptor()` cannot select a DOM `Node` before the dynamic import resolves. The loader
  still must guard stale promises and display a failure state.
- A `VanillaView.dispose()` call does not detach its root. The record-retirement path must dispose
  and remove the lazy root and the Search child root explicitly, in the right order relative to
  the stack's `fillSlot()` cleanup.
- `this.child(view)` is correct only when the child lifetime equals the parent lifetime. A panel
  record is repeatedly created and retired, and a Search body may be replaced when its model/root
  identity changes, so those views need explicit manual ownership.
- Search's `FileSearchView.onUpdate()` is deliberately a no-op because its internal
  `FileSearchModel` owns search state. The converted wrapper must preserve that behavior and only
  replace the body when the lifetime input (the Explorer/root identity) changes; ordinary header
  updates must reuse the stable body.
- The pilot uses the explicit `"search"` icon registration. Panels that rely on
  `EditorIcon` fallback currently receive a React-valued `IconRef`; a later vanilla pilot must
  not silently discard that fallback: the header factory reports it in development with the panel
  id and cause. Named follow-up for the next conversion: choose one of three paths — give the
  panel a registry `icon`, make `resolveIcon` return a DOM `Node` for the vanilla arm, or add a
  DOM builder for `EditorIcon`. This task does not build a vanilla `EditorIcon` path.
- The new DOM header factory deliberately covers the pilot's string title, registry/DOM icon, and
  action-button shape. React-only badges, arbitrary React title nodes, and the show-main tooltip
  remain on `SideBarPanelHeader` until a consumer justifies their DOM equivalents.
- `onShowMain` is deliberately unimplemented in the DOM factory. Future conversions of
  `git-tree/GitPanelSecondaryView`, `mneme-root/MnemeTreeSecondaryView`, and
  `link-editor/panels/LinkCategorySecondaryView` must preserve the exact
  `data-type="sidebar-show-main"` value (the `CollapsiblePanelStack.css` `pointer-events: auto`
  allowlist), the `data-active` attribute, `stopPropagation` on click, and replace React's
  `<Tooltip>` with `attachTooltip` as used by `IconButtonView`.
- Error text must use `errMessage`/`guard` for caught `unknown`, and the failure panel must use
  semantic UIKit attributes rather than the existing React inline style. No new CSS or color token
  is required.
- Dynamic imports must retain literal paths, and the Search `.tsx` to `.ts` rename must leave the
  extensionless registration import resolving to the new module.

## Acceptance Criteria

- `secondary-view-registry.ts` has a discriminated React/vanilla loader arm. Existing definitions
  compile and remain React by default; Search alone declares `arm: "vanilla"`.
- `CollapsiblePanelProps.children` accepts `ReactNode | Node`; no shared `ReactNode` or unrelated
  slot alias is widened.
- `SecondaryViewsView.toPanelDescriptor()` supplies the existing React element for React arms and
  a stable `LazySecondaryViewView.root` `Node` for the vanilla arm.
- `LazySecondaryViewView` handles loading, stale/cancelled imports, construction/mount failure,
  semantic error rendering, update, and disposal without creating a React root or using inline
  styles.
- React panels still use `LazySecondaryView`, and their existing one-root `fillSlot()` path and
  behavior remain unchanged.
- Retired panel records dispose their lazy/body views manually and remove their roots; no stale
  view, header node, listener, or async result survives panel removal.
- The vanilla header appends into the same `headerRef` element that React panels portal into, moves
  stable nodes when the ref changes, and removes them on disposal.
- Header title/icon/action nodes retain UIKit `data-type` semantics. Title/icon clicks still reach
  the stack toggle handler; the Search close icon remains clickable and does not toggle the panel.
- Search is a vanilla `VanillaView` module, uses `FileSearchView` directly, preserves search result
  navigation/state persistence and close behavior, and does not import the React `FileSearch` or
  `SideBarPanelHeader` faces at runtime.
- No hardcoded colors, inline styles, Emotion, unsafe caught-error stringification, path/fs
  `require()`, or barrel imports are introduced.
- No unit tests are added. Before implementation handoff, run `npm run typecheck`, `npm run lint`,
  `npm run build-prod`, and manual checks for panel load, failure, header toggle, close action,
  update, collapse/expand, removal, and reopening Search.
- This planning task changes only the requested task document; it does not implement source code,
  edit the dashboard/epic documents, or create a commit.

## Files Changed

| File | Planned change |
|---|---|
| `doc/tasks/US-1047-secondary-view-vanilla-arm/README.md` | Investigation and implementation plan for US-1047. |
| `src/renderer/ui/secondary-views/secondary-view-registry.ts` | Add the discriminated React/vanilla loader arm and `VanillaViewCtor` type. |
| `src/renderer/ui/secondary-views/LazySecondaryViewView.ts` | New async vanilla loader with direct panel mounting, cancellation, errors, and lifecycle cleanup. |
| `src/renderer/ui/secondary-views/SecondaryViewsView.ts` | Select the vanilla DOM slot in `toPanelDescriptor()` and manually retire record views. |
| `src/renderer/ui/secondary-views/LazySecondaryView.tsx` | Keep the React lazy path type-safe by rejecting an accidental vanilla-arm call. |
| `src/renderer/ui/secondary-views/SideBarPanelHeaderView.ts` | New React-free DOM header factory for the vanilla panel. |
| `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.tsx` | Widen only `CollapsiblePanelProps.children` to `ReactNode | Node`. |
| `src/renderer/editors/explorer/SearchSecondaryView.ts` | New JSX-free vanilla Search panel; replaces the `.tsx` file. |
| `src/renderer/editors/explorer/SearchSecondaryView.tsx` | Removed by the `.tsx` -> `.ts` conversion. |
| `src/renderer/editors/register-editors.ts` | Mark only the Search registration as `arm: "vanilla"`. |

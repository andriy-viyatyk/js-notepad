# US-1033: `ui/secondary-views/` host and the registry contract

**Status:** Planned

**Epic:** [EPIC-058: De-React Epic D — shell and shared components](../../epics/EPIC-058.md)

**Scope:** Investigation and implementation plan only. The dashboard and epic task table are
intentionally not changed by this task-document pass.

## Goal

Convert the `src/renderer/ui/secondary-views/` host from a React render loop to a
`VanillaView`, while keeping `SecondaryViews` renderable from the still-React `ui/app/` and
browser callers. Preserve the published `SecondaryViewProps.headerRef` portal contract for all
existing editor views and retain the asynchronous React arm for every current registry entry
without changing the outward registry shape.

Remove the unit's last Emotion importer and convert the host's `<Panel>` call site. Keep the two
header-owned `<Panel>`s in `SideBarPanelHeader` as a working React component with the same props
and portal behavior; D10's "`<Panel>` tags outside `editors/` → 0" line is intentionally not
reached by this task.

## Background

### Verified current surface and ownership

The unit contains six files and 510 lines at investigation time:

| File | Current role | Verified evidence | Planned treatment |
|---|---|---|---|
| `src/renderer/ui/secondary-views/SecondaryViews.tsx` | Controlled React host; derives rendered `(model, panelId)` pairs, creates the Panel/stack/Splitter tree, and owns the header-ref rerender bridge | `:14-31`, `:35-61`, `:72-130` | Keep the public React face; delegate to a new native host through `mountVanilla` |
| `src/renderer/ui/secondary-views/SideBarPanelHeader.tsx` | React editor-facing header portal | `:1-4`, `:49-77`, `:94-154` | Keep the exact React-facing props, `createPortal` arm, and both owned `<Panel>`s; remove only Emotion |
| `src/renderer/ui/secondary-views/LazySecondaryView.tsx` | React async loader and React compatibility arm | `:1-7`, `:25-62` | Preserve the loading, cancellation, error, and component-prop behavior; the native host will mount it through `fillSlot` for the React arm |
| `src/renderer/ui/secondary-views/SecondaryViewsModel.ts` | React-free layout-state holder | `:7-11`, `:19-49` | No change |
| `src/renderer/ui/secondary-views/panel-key.ts` | React-free composite-key helpers | `:18-41` | No change |
| `src/renderer/ui/secondary-views/secondary-view-registry.ts` | Published React registry and `SecondaryViewProps` contract | `:5-36`, `:39-69` | No shape change; retain the existing React lookup |

The two current React-facing owners are verified at `src/renderer/ui/app/Pages.tsx:61-77` and
`src/renderer/editors/browser/BrowserSecondaryViews.tsx:13-23`. Both subscribe outside the host
and pass the same three values: `views`, `state`, and `setState`.

`Pages.tsx` creates/reads the page navigation model at `:67-70`, subscribes to
`page.state.version` so panel attach/detach re-derives `page.panelEditors`, and passes
`page.setSecondaryViewsState` at `:72-75`. The browser owner does the equivalent with
`BrowserPanelHost.state.version` at `BrowserSecondaryViews.tsx:14-21`; `BrowserPanelHost.attach`
subscribes to the editor's `secondaryView` slice and increments that version at
`BrowserPanelHost.ts:60-69`. The native host must therefore remain controlled and must not add a
second subscription to either owner or to an editor model.

### State shape and current panel resolution

`SecondaryViewsModel` stores exactly:

```ts
export interface ISecondaryViewsState {
    open: boolean;
    width: number;
    activePanel: string;
}
```

This is `SecondaryViewsModel.ts:7-11`. Its defaults are `open: true`, `width: 240`, and the bare
seed `activePanel: "explorer"` at `:13-36`. `setStateQuiet` merges only those three fields at
`:39-47`; side effects and persistence remain in the owner, not in this model (`:19-26`).

The current host's exact resolution algorithm is `SecondaryViews.tsx:42-70`:

1. `state.open === false` returns `null` at `:42`, so the complete panel surface and all loaded
   secondary-view React subtrees unmount when the sidebar is closed.
2. `views` is traversed in array order. For each `EditorModel`, the host reads
   `(model.state.get() as { secondaryView?: string[] }).secondaryView` at `:50-52`.
3. Empty/missing slices contribute no panels. Each panel ID is retained only when
   `secondaryViewRegistry.has(panelId)` is true (`:53-55`), which means exact registry lookup
   first and then prefix lookup (`secondary-view-registry.ts:55-65`). Unknown IDs never create a
   panel.
4. Each retained pair becomes `{ model, panelId, key: panelKey(model.id, panelId), refKey:
   \`${model.id}-${panelId}\` }` at `:55-60`. `panelKey` is the persisted/rendered identity
   `${editorId}::${panelId}` (`panel-key.ts:18-23`); `refKey` is a separate header-ref map key.
5. A bare `state.activePanel` is resolved only for rendering: if it is not composite, the first
   rendered pair with the same bare `panelId` supplies `activeKey` (`:63-70`). The owner state is
   not rewritten by this lookup. After a user toggle, the owner receives the composite key through
   `setState({ activePanel: id })` at `:83-87`.

The current output order is therefore owner-supplied `views` order, then each model's
`secondaryView` array order, after registry filtering. `CollapsiblePanelStackView` hands that
order to `KeyedList` (`CollapsiblePanelStackView.tsx:44-55`, `:46-50`); `KeyedList.update` removes
absent keys, creates missing keys, reconciles the managed DOM order without reinserting a node
already at the cursor, then calls updates (`keyed-list.ts:27-109`). The native host must use the
same composite key and order and must not key by bare `panelId`, because two models may contribute
the same panel type.

### Mount, collapse/expand, and disposal behavior

The current JSX surface is `SecondaryViews.tsx:72-130`:

```tsx
return (
    <>
        <Panel name="secondary-views-container" direction="column" width={state.width}
            shrink={false} overflow="hidden" height="100%" background="default">
            <CollapsiblePanelStack activePanel={activeKey}
                setActivePanel={(id) => setState({ activePanel: id })} height="100%">
                {rendered.map(({ model, panelId, key, refKey }) => (
                    <CollapsiblePanel key={refKey} id={key} name={panelId}
                        headerRef={(el) => setHeaderRef(refKey, el)} alwaysRenderContent>
                        <LazySecondaryView model={model as never} panelId={panelId}
                            headerRef={headerRefs.current[refKey] ?? null}
                            icon={panelIcon} expanded={key === activeKey} />
                    </CollapsiblePanel>
                ))}
            </CollapsiblePanelStack>
        </Panel>
        <Splitter name="secondary-views-splitter" orientation="vertical" value={state.width}
            onChange={(w) => setState({ width: w })} side="before" min={120} border="after"
            background="default" hoverBackground="light" />
    </>
);
```

The exact current mount/dispose sequence is supplied by the already-native UIKit faces:

- `CollapsiblePanelStack.tsx:36-45` extracts the `CollapsiblePanel` descriptors and calls
  `mountVanilla(CollapsiblePanelStackView, ...)`; `Splitter.tsx:20-21` does the same for
  `SplitterView`. `mount.tsx:26-38` appends each native root before calling `mount`, and
  `:54-75` disposes the view on React unmount.
- `CollapsiblePanelStackView.createPanel` creates a panel root and its header, appends the header
  at `:102-119`, then `updatePanel` applies state/header/content at `:122-131`.
- `updateContent` renders content when `alwaysRenderContent || isOpen` at `:191-208`. Because this
  host always sets `alwaysRenderContent`, every recognized panel gets a content host and its
  `LazySecondaryView` remains mounted while collapsed; collapse only changes the content host's
  `display` to `none` at `:201-207`.
- Header toggling is controlled by the owner callback. Clicking the current panel returns to the
  previous still-present panel, otherwise the first other panel, at
  `CollapsiblePanelStackView.tsx:222-235`. Clicking a different panel sends its composite ID to
  `setActivePanel`.
- A removed panel calls its header callback with `null`, disposes button/content slot cleanups,
  removes the content and root, and deletes its record at `:210-220`. Stack disposal runs this for
  every record through `KeyedList.dispose` (`keyed-list.ts:123-161`). The React slot cleanup is
  intentionally deferred by `fill-slot.ts:69-71` after the host/container is detached.
- Closing the sidebar currently returns `null` from `SecondaryViews` (`:42`), so React unmounts the
  stack, splitter, every `LazySecondaryView`, and every portal. The native public face must retain
  this behavior by keeping the `if (!state.open) return null` guard before `mountVanilla`, rather
  than leaving a hidden, subscribed native surface alive.
- Width is controlled by `state.width`; the splitter emits `setState({ width: w })` at
  `SecondaryViews.tsx:119-128`. `PageModel` clamps width to a minimum of 120 at
  `PageModel.ts:495-507`; the browser host does the same at `BrowserPanelHost.ts:140-158`.

### `headerRef` lifecycle — highest-risk contract

`SecondaryViewProps.headerRef` is explicitly documented as the panel-header portal target at
`secondary-view-registry.ts:12-13`; it is not an optional implementation detail. The current timing
is:

1. During the first `SecondaryViews` render, `headerRefs.current[refKey]` is absent, so the
   `LazySecondaryView` receives `headerRef: null` (`SecondaryViews.tsx:32-40`, `:104-113`).
2. The stack's native `createPanel` creates the header element, but the element is not published
   until `updateHeader` has installed the owned header nodes and then invokes the supplied callback
   with the element at `CollapsiblePanelStackView.tsx:134-183` (the callback call is `:182`).
3. `setHeaderRef` records only a new non-null element and increments a private React state version
   at `SecondaryViews.tsx:35-40`. That state update is the rerender that changes the lazy child
   from the initial `null` target to the actual header element. It is not an editor-model update.
4. `SideBarPanelHeader` returns `null` while its target is null at `SideBarPanelHeader.tsx:94-106`;
   once non-null, it calls `createPortal` into precisely that element at `:106-154`.
5. Collapsing a panel does not null the target: `alwaysRenderContent` keeps the panel and header
   alive, while only the content host is hidden (`CollapsiblePanelStackView.tsx:191-208`).
6. Removing a panel or unmounting the stack calls the callback with `null`
   (`CollapsiblePanelStackView.tsx:210-220`). Closing the whole sidebar therefore removes the
   React portal subtree as part of the `SecondaryViews` null/unmount path.

The current `setHeaderRef` intentionally ignores the null callback when updating its map
(`SecondaryViews.tsx:35-40`); the removed panel is no longer rendered, and a recreated panel gets a
new element. The native host may maintain its own current target, but must expose `null` before the
header is published, update the loaded child when the element is published, and clear/dispose the
target on panel removal. Creating a header and passing it to a loaded editor before this callback
sequence would change the contract and is a release blocker for this task.

The current editor callers also reveal the portal content that must remain compatible. A repository
scan found 14 direct `SideBarPanelHeader` import/call-site files, not the 10 stated in the original
epic note; the four additional current callers are Mneme, Notebook (two panels), and Rest Client.
A bare `grep -rln SideBarPanelHeader src/renderer/editors` returns 16 filenames because
`src/renderer/editors/git-tree/GitChangesView.tsx:46` and
`src/renderer/editors/git-tree/GitRefsView.tsx:23` mention the header only in comments; they are
not additional callers:

| File | Verified call-site evidence | Props used |
|---|---:|---|
| `src/renderer/editors/archive/ArchiveSecondaryView.tsx` | `:8`, `:55` | `headerRef`, `icon`, string `title`, `actions` |
| `src/renderer/editors/board/BoardSecondaryView.tsx` | `:3-4`, `:44` | `name`, `headerRef`, `icon`, node/string `title` |
| `src/renderer/editors/explorer/ExplorerSecondaryView.tsx` | `:21-22`, `:293` | `headerRef`, `icon`, string `title`, `actions` |
| `src/renderer/editors/explorer/SearchSecondaryView.tsx` | `:6`, `:31-47` | `headerRef`, `icon`, React-node `title`, `actions` |
| `src/renderer/editors/explorer/BoardsSecondaryView.tsx` | `:18-19`, `:268` | `headerRef`, `icon`, string `title`, `actions` |
| `src/renderer/editors/file-diff/GitDiffRevisionsSecondaryView.tsx` | `:3-4`, `:108-118` | `headerRef`, `icon`, string `title`, `actions` |
| `src/renderer/editors/git-tree/GitPanelSecondaryView.tsx` | `:3-4`, `:106-118` | `headerRef`, `icon`, `badge`, string `title`, `actions` |
| `src/renderer/editors/link-editor/panels/LinkCategorySecondaryView.tsx` | `:2-3`, `:69-77` | `headerRef`, `icon`, string `title`, `actions`, `showMainTitle`, `showMainActive`, `onShowMain` |
| `src/renderer/editors/link-editor/panels/LinkHostnamesSecondaryView.tsx` | `:1-2`, `:12` | `headerRef`, `icon`, string `title` |
| `src/renderer/editors/link-editor/panels/LinkTagsSecondaryView.tsx` | `:2-3`, `:173` | `headerRef`, `icon`, string `title` |
| `src/renderer/editors/mneme-root/MnemeTreeSecondaryView.tsx` | `:8-9`, `:74-85` | `headerRef`, `icon`, `badge`, string `title`, `actions` |
| `src/renderer/editors/notebook/panels/NotebookCategoriesSecondaryView.tsx` | `:2-3`, `:56` | `headerRef`, `icon`, string `title` |
| `src/renderer/editors/notebook/panels/NotebookTagsSecondaryView.tsx` | `:2-3`, `:25` | `headerRef`, `icon`, string `title` |
| `src/renderer/editors/rest-client/panels/RestPanelSecondaryView.tsx` | `:2-3`, `:45` | `headerRef`, `icon`, string `title` |

The full public prop surface is `SideBarPanelHeader.tsx:49-77`: optional `name`, required
`headerRef: HTMLDivElement | null`, optional `icon: IconRef`, optional React `badge`, required
`title: SlotText`, optional React `actions`, optional `onShowMain`, optional `showMainTitle`, and
optional `showMainActive`. The implementation renders the icon as a direct header child, a
shrinkable title group, non-shrinking actions, and the optional show-main zone
(`:107-151`). No editor caller may be changed in this task.

### Lazy loading and registry behavior

`secondary-view-registry.ts:24-36` defines each registration as an ID/label/icon plus
`loadComponent: () => Promise<{ default: React.ComponentType<SecondaryViewProps> }>`. The current
registrations in `src/renderer/editors/register-editors.ts:12-107` are all React dynamic imports:
13 exact registrations plus one prefix registration are present (archive, explorer, search, boards,
three link panels, two notebook panels, rest, git, file history, Mneme, and the `board-secondary:`
prefix family).
The React registry resolves exact IDs before prefixes at `:55-62`; it has no unregister operation.

`LazySecondaryView` captures the exact async behavior at `LazySecondaryView.tsx:25-51`:

- its state is `{ Component: ComponentType<SecondaryViewProps> | null, error: string | null }`;
- it resolves the registry by `panelId` when the component model initializes or the ID changes;
- an unknown ID queues an error update guarded by `isLive`;
- a dynamic import sets `Component` only when not cancelled, and an import failure sets
  `errMessage(err, \`Failed to load "${panelId}".\`);` only when not cancelled;
- the cleanup marks the request cancelled at `:43-50`;
- loading renders `null`, errors render a padded light-text `div` at `:60-61`, and a loaded module
  receives the unchanged `model`, `panelId`, `headerRef`, `icon`, and `expanded` props at `:62`.

The host must express this as one stable React slot per retained panel containing the existing
`LazySecondaryView`. The async request must be cancelled/ignored when its panel slot is removed or
its panel ID changes, and React updates must reuse the existing `fillSlot` React root. The current
registry remains the sole lookup for this task; the future design is recorded in the Epic E concern
below.

### Native infrastructure and the US-1032 precedent

The intended host composition is already supported by the repository:

- `VanillaView` provides stable roots, explicit `mount/update/dispose`, `child`, `own`, `listen`,
  and state `bind` at `src/renderer/uikit/shared/vanilla-view.ts:29-39`, `:49-80`, and
  `:128-194`. Disposal does not detach the root (`:82-89`); the adapter or structural owner does.
- `mountVanilla` exports the React-to-native boundary at `mount.tsx:93-107`; it requires a
  module-scope constructor and `VanillaHost` appends the native root before mounting it
  (`:15-18`, `:26-38`). `mountReact`/`mountReactHandle` remain available for explicit React islands
  (`:109-152`).
- `fillSlot` accepts `string | Node | React.ReactNode` at `fill-slot.ts:4-5` and owns the transition
  and cleanup. Callers must not run the previous cleanup before calling it again (`:74-82`); the
  native host must follow this rule so React-to-React updates reuse the root.
- `createPanelElement`/`applyPanelAttributes` in `uikit/Panel/panel-style.ts:303-349` preserve the
  existing Panel data attributes, class, and resolved inline layout. `createTextElement` /
  `applyTextAttributes` in `uikit/Text/text-style.ts:79-108` do the same for native text.
- `createIconElement` is the DOM arm for an `IconName` at `uikit/shared/slots.ts:46-63`. The icon
  builder exists only when the icon body is string-backed (`theme/icons.tsx:137-155`); native code
  must use this arm for icon names and route React-valued icon content through `fillSlot`.
- `CollapsiblePanelStackView` and `SplitterView` are already native implementations behind their
  React faces (`CollapsiblePanelStackView.tsx:31-64`, `Splitter/Splitter.tsx:20-21`). Reuse those
  classes and their CSS/interaction behavior; do not create a second accordion or splitter.

US-1032 is a useful precedent, but it argues against shipping an empty native registry here. Its
`dialog-view-registry.ts:10-20` was justified because 13 native dialog views registered into it in
the same task; `DialogsView.ts:49-103` then selected native views first with a retained React
fallback, while `core/state/view.tsx` stayed byte-identical. Every current secondary-view
`loadComponent` still returns React and this task converts no editor panel, so this task keeps
`secondary-view-registry.ts` and its React arm unchanged. The future native design is recorded as
an Epic E concern below, where the first real consumer can
implement them without changing the outward React registry contract.

### Styling, Emotion, Panel, and portal inventory

The unit has exactly one Emotion importer: `SideBarPanelHeader.tsx:3`, used by the
`ShowMainZone` declaration at `:23-47`. D6 therefore requires that import and styled component to
leave the unit. `src/renderer/uikit/Panel/Panel.tsx:1-2` is now a 152-line React face over
`resolvePanelAttributes`; it imports no Emotion. Add a unit-local static stylesheet only for the
show-main button, using theme CSS variables/data hooks rather than hardcoded colors.

The unit has three `<Panel>` call sites: the outer host at `SecondaryViews.tsx:74-82`, and the
title/actions containers at `SideBarPanelHeader.tsx:109-137`. The native host converts the outer
host Panel with `createPanelElement`. The two header Panels stay: they intentionally emit
`data-type="panel"`, which `CollapsiblePanelStack.css:50-54` makes pointer-transparent so clicks
on the title group and empty action-region fall through to the stack header; the nested buttons
are restored to pointer-active by `:56-61`. Replacing them with plain divs would break
click-to-toggle. D10's "`<Panel>` tags outside `editors/` → 0" line is therefore not a close
condition for this task:
the genuinely converted `SecondaryViews.tsx` call site goes, the two calls owned by the deliberate
React `SideBarPanelHeader` survivor stay, and Epic E collects them when that header is converted.

If a later task needs to remove those two tags, the sanctioned zero-drift technique is to spread
`resolvePanelAttributes(...)`'s `className`, `data-*` values, and `inlineStyle` onto a plain div;
do not hand-write a CSS approximation here.

There are exactly three `createPortal` hits in the secondary-view scope: the published portal in
`SideBarPanelHeader.tsx:106-154` and its registry documentation at
`secondary-view-registry.ts:12`; the registry documentation is not an implementation target.
There are two editor-side portals outside this contract:

- `src/renderer/editors/notebook/NotebookBody.tsx:118` reads `editor.host?.editorOverlayRef`, and
  `:170-180` portals the expanded note into that editor-owned overlay target.
- `src/renderer/editors/graph/GraphTooltip.tsx:238-272` portals the graph tooltip into the global
  overlay returned by `uikit/shared/overlayLayer.ts` (`:7`, `:271`).

Neither target is a secondary-view header and neither editor file is in scope. The native host must
not attempt to absorb or redirect either portal.

## Implementation Plan

### 1. Move the controlled host into a native view and preserve its React face

- Add `src/renderer/ui/secondary-views/SecondaryViewsView.ts` with a public constructor and
  `VanillaView<SecondaryViewsProps>` lifecycle. Export/share the existing prop shape:
  `views: EditorModel[]`, `state: ISecondaryViewsState`, and
  `setState: (patch: Partial<ISecondaryViewsState>) => void`.
- Keep `SecondaryViews.tsx` at the existing import path and preserve the existing React-facing
  signature. Its first operation remains `if (!state.open) return null`; its open path becomes
  `return mountVanilla(SecondaryViewsView, props);`.

Before:

```tsx
export function SecondaryViews({ views, state, setState }: SecondaryViewsProps) {
    // derive rendered panels, use headerRefs/useState, and return Panel + stack + Splitter JSX
}
```

After:

```tsx
export function SecondaryViews(props: SecondaryViewsProps): React.ReactElement | null {
    if (!props.state.open) return null;
    return mountVanilla(SecondaryViewsView, props);
}
```

- Make the native root `display: contents` so the adapter/root does not become an extra layout
  item. Create the outer panel with `createPanelElement` using the exact current attributes:
  `name: "secondary-views-container"`, `direction: "column"`, `width`, `shrink: false`,
  `overflow: "hidden"`, `height: "100%"`, and `background: "default"`.
- Reuse `CollapsiblePanelStackView` and `SplitterView` as owned native children. Keep the same
  stack props (`activePanel`, `height: "100%"`) and splitter props (`name`, vertical orientation,
  controlled width, before side, min 120, after border, default/light backgrounds). Forward stack
  changes to `setState({ activePanel: id })` and splitter changes to `setState({ width })`.
- Reconcile panels from one props snapshot using the verified model order, state slice cast,
  registry filtering, `panelKey`, and bare-to-composite active-panel resolution. Keep a stable
  per-composite-key record for the header target, React content arm, and disposal.
- On every `onUpdate`, reconcile strictly by composite key and never recreate a retained panel
  record. `mountVanilla` mounts once by constructor (`mount.tsx:75`) but calls `view.update(props)`
  for every new props identity (`:76-84`); `Pages.tsx:61-75` produces those updates for page/state
  changes and every splitter-drag width event round-trips through `PageModel.setSecondaryViewsState`.
  A width drag must update the existing panel records in place, never destroy/rebuild them, so
  editor scroll, tree expansion, and search text survive the drag.
- Set every panel descriptor's `alwaysRenderContent` to `true`, preserve `id: panelKey(...)` and
  `name: panelId`, and always pass a truthy stable `headerRef` callback for every panel. Otherwise
  `showChevron = !panel.headerRef && !panel.buttons`
  (`CollapsiblePanelStackView.tsx:145`) would add a stack-owned chevron that does not exist for
  today's panels. Leave the stack responsible for header click behavior, collapse CSS,
  external header-node ordering, and content hiding. Do not duplicate `CollapsiblePanelStackView`
  or `KeyedList` logic.
- On panel removal, let the stack own the React-slot cleanup, clear the stored header target, and
  remove the record. On host disposal, dispose the stack and splitter before the adapter removes
  the root.

### 2. Preserve the React arm and lazy panel content

- In `SecondaryViewsView.ts`, pass a `React.createElement(LazySecondaryView, ...)` as every stack
  panel's `children`; the existing `CollapsiblePanelStackView.updateContent` then attaches the
  content host and `fillSlot` mounts the React loader exactly where the current stack does.
- Pass `model as never` only at the same compatibility boundary currently used by
  `SecondaryViews.tsx:107-113`; keep the actual `model`, bare `panelId`, resolved `icon`, and
  `expanded: key === activeKey` values unchanged.
- Preserve `LazySecondaryView.tsx`'s exact async behavior and public component path: loading is
  empty, unknown IDs use the queued `isLive`-guarded error, imports are cancellation-guarded, and
  the loaded component receives all five forwarded values.
- The header callback stores the published element on its per-composite-key record and sets a dirty
  flag; the host drains dirty records at the end of its reconcile pass and re-issues descriptors.
  The drain skips a record already removed or disposed. This concrete end-of-pass drain avoids
  both re-entrant `stack.update()` and the frame-late/record-gone race of a microtask.

### 3. Keep `headerRef` timing and the editor portal arm intact

- Each per-record target must start as `null` before the header exists; the stable stack callback
  publishes the same `HTMLDivElement` after `updateHeader` has created/ordered its owned nodes, and
  receives `null` on removal/disposal. Do not make the native host eagerly pass the header element
  to a React editor before this callback.
- `CollapsiblePanelStackView.updateHeader` compares `oldRef !== panel.headerRef`
  (`:134-136`) and publishes with `record.headerRef?.(record.header)` only at `:182`. The current
  React host passes a fresh closure at `SecondaryViews.tsx:104` on every render, so every update
  runs old callback `null` (`:137`) and new callback `header` (`:182`); no render loop results only
  because `setHeaderRef` (`SecondaryViews.tsx:35-40`) ignores null and an unchanged element. The
  native host must use one stable callback per record instead: publication then occurs exactly once,
  synchronously inside `panelList.update()`, before `updateContent` (`:191-208`) mounts children.
  The dirty-record end-of-pass drain above is therefore required.
- Keep the loaded React component inside a retained React root. Its `SideBarPanelHeader` must still
  see `headerRef === null` until the host's header-publication update, then re-render with the same
  target element so `createPortal` continues to append into the stack header.
- Preserve the stack's external-node ordering: its owned chevron/icon/title/button nodes are
  inserted before portal nodes (`CollapsiblePanelStackView.tsx:142-183`), while portal nodes stay
  direct header children. Do not wrap the React header portal in a new layout element.
- Add a focused smoke check for: first panel load, first header portal appearance, collapsed panel
  remaining mounted, active-panel switch, panel removal, sidebar close/reopen, and a panel ID whose
  lazy import fails. Inspect both the callback sequence and the resulting direct children of
  `[data-part="header"]`.

### 4. Remove Emotion and convert the shared header React face without touching editors

- Add `src/renderer/ui/secondary-views/SideBarPanelHeader.css` in the appropriate static layer.
  Move only the `ShowMainZone` styles from `SideBarPanelHeader.tsx:23-47` into scoped selectors
  using the existing `data-type="sidebar-show-main"` hook. Preserve dimensions, border, theme
  colors, hover behavior, active blue, and direct-child SVG sizing.
- In `SideBarPanelHeader.tsx`, remove `@emotion/styled` and keep the React `createPortal` arm and
  both `<Panel>` wrappers at `:105-154`/`:109-137`. The Panels are required by
  `CollapsiblePanelStack.css:50-54` for title/action click fall-through to the header; do not
  replace them with plain divs. Keep the leading icon a direct child and keep the tooltip-wrapped
  show-main button's stop-propagation and callback behavior.
- Preserve every prop and usage documented above, including React-node `badge`, node/string
  `title`, React-node `actions`, and the optional show-main zone. Do not modify any of the 14
  editor caller files.

### 5. Verify contracts and migration boundaries

- Confirm `secondary-view-registry.ts`, `SecondaryViewsModel.ts`, `panel-key.ts`, `Pages.tsx`,
  `BrowserSecondaryViews.tsx`, all 14 editor `SideBarPanelHeader` callers, the Notebook overlay
  portal, and Graph tooltip portal are unchanged.
- Confirm no `@emotion` import remains in `src/renderer/ui/secondary-views/`, the outer host Panel
  is replaced by `createPanelElement`, the two header-owned `<Panel>`s remain deliberate React
  compatibility markup, and the only remaining `createPortal` implementation is the deliberate
  React header compatibility arm.
- Run `npm run typecheck`, `npm run lint`, `npm run build-prod`, and `git diff --check`. Repeat the
  Epic D Rule 4 interaction measurement for a sidebar open/close and panel switch using the same
  settled observation roots as the baseline; record the result or a concrete pending reason in the
  epic record when implementation is requested.

## Concerns

### 1. Header publication timing is a release blocker

The published contract is the element-and-timing pair, not merely an element with the right type.
The current first render supplies `null`, the stack callback publishes the attached header after
its owned nodes are ordered, and the React rerender then updates the portal target. A native host
that creates the header eagerly and passes it into the lazy editor on its first render can alter
portal mounting, direct-child order, and editor effects. The implementation must test the callback
and portal sequence explicitly before claiming compatibility.

### 2. The verified editor caller count differs from the epic note

The current checkout has 14 direct editor call sites, while the EPIC-058 concern says 10. The four
additional current files are `MnemeTreeSecondaryView.tsx`, `NotebookCategoriesSecondaryView.tsx`,
`NotebookTagsSecondaryView.tsx`, and `RestPanelSecondaryView.tsx`. A bare filename grep reports 16
because `GitChangesView.tsx:46` and `GitRefsView.tsx:23` are comment-only mentions. This document
treats all 14 actual callers as published consumers and forbids edits to all 14. The discrepancy
must not be resolved by changing the registry or by removing callers.

### 3. Epic E native-first design ledger — implement with the first real consumer

Do not implement any of this in US-1033. The design to carry into Epic E is a unit-local native
constructor registry with exact-before-prefix lookup, selected before the unchanged
`secondaryViewRegistry` React arm. The first Epic E editor-panel conversion registers a real
native view in that map and keeps the published React registry as the fallback; this task has no
consumer for an empty map. The first Epic E panel must also design its header helper against its
actual `badge`/`title`/`actions` needs rather than introducing an untested generic helper now.

That first conversion must implement the native content path at the same time. A future
`nativeContent: Node` arm in `CollapsiblePanelStack.tsx` and `CollapsiblePanelStackView.tsx` must
append a live native root once and drive the native view through its own `update()`. The evidence
is `fill-slot.ts:125-140`: the non-React path unconditionally calls `replaceChildren()` and
`append()` even for the identical Node. Because `updateContent` calls `fillSlot(record.content,
panel.children)` on every panel update (`CollapsiblePanelStackView.tsx:191-208`), routing a live
native root through `panel.children` would detach and reattach it on every active-panel or
splitter-drag update.

The same Epic E conversion must own native-view disposal. `removePanel` only invokes the stored
header/button/content callbacks and removes nodes (`CollapsiblePanelStackView.tsx:210-220`); it
never calls a native view's `dispose()`. The host must therefore dispose each native view exactly
once before forgetting its record. The first Epic E editor-panel conversion implements the
native-first lookup, append-once `nativeContent`, and host-owned disposal together against a real
consumer. D4's one-editor-at-a-time outcome is preserved by writing this design down here rather
than shipping an unused seam in US-1033.

### 4. `alwaysRenderContent` makes hidden panels live

Collapsed panels retain lazy components, editor subscriptions, portal content, and model state.
The native host must not dispose a collapsed slot merely because its content is `display: none`.
Only panel removal or whole-sidebar unmount disposes it. This is also why active-panel updates must
call `update` on retained slots rather than recreate them.

### 5. React slot cleanup ordering is load-bearing

`fillSlot` owns transitions and defers nested React-root disposal after detaching its container.
Calling a saved cleanup before a subsequent React render would defeat root reuse and reset editor
subtree state; calling it synchronously while the stack is reconciling can clear replacement DOM.
The stack's existing React content path should be used directly, and native code must follow the
documented no-pre-cleanup discipline.

### 6. Static CSS must preserve direct-child and theme behavior

The stack CSS sizes direct-child SVGs and treats panel/text/button descendants specially
(`CollapsiblePanelStack.css:19-62`). Replacing Emotion with a wrapper or nested icon host can
silently change sizing, pointer-events, title truncation, or header hover behavior. The replacement
must preserve direct icon placement, `data-type` hooks, `panel-root`/text attributes where used,
and theme CSS variables.

### 7. The unrelated editor portals remain outside the unit

Notebook's `editorOverlayRef` portal and Graph's global overlay portal are valid editor-owned
targets, but neither is the secondary-view registry contract. They must remain untouched and must
not be folded into the new native host or its registry.

## Acceptance Criteria

- [ ] `SecondaryViews` keeps its existing three-prop React-facing signature, returns `null` when
      `state.open` is false, and otherwise mounts `SecondaryViewsView` through the module-scope
      `mountVanilla` boundary.
- [ ] The native host reproduces the verified panel resolution, composite keys, model/panel order,
      bare active-panel seed resolution, controlled width, min-120 splitter, active-panel callback,
      collapse behavior, and disposal behavior.
- [ ] `SecondaryViewsView.onUpdate` reconciles strictly by composite key and never recreates a
      retained record, including during every width update produced by a splitter drag; retained
      editor subtrees keep their scroll, expansion, and search state.
- [ ] `alwaysRenderContent` remains true: collapsed panels hide content but retain the loaded
      secondary-view subtree and its portal until panel removal or sidebar unmount.
- [ ] `headerRef` is `null` before header publication, is the exact stack header element after
      publication, remains stable across collapse/ordinary updates, and becomes `null` on removal;
      every panel supplies a truthy stable callback, and existing portal headers render as direct
      header children with no editor-file changes.
- [ ] Every recognized panel passes `React.createElement(LazySecondaryView, ...)` through the
      existing stack `children`/`fillSlot` path. The current React arm preserves
      `LazySecondaryView`'s cancellation, loading, unknown-ID, error, dynamic-import, and
      forwarded-prop behavior; React-to-React updates reuse the existing `fillSlot` root and never
      pre-run its prior cleanup.
- [ ] `SideBarPanelHeader` remains importable/renderable by all 14 current editor callers with the
      full prop surface (`name`, `headerRef`, `icon`, `badge`, `title`, `actions`, `onShowMain`,
      `showMainTitle`, `showMainActive`) and unchanged portal semantics.
- [ ] `src/renderer/ui/secondary-views/` has no Emotion import; the outer host Panel is replaced
      by `createPanelElement`, while the two header-owned `<Panel>`s remain deliberate React
      compatibility markup. Static CSS preserves the show-main zone, title/action layout, colors,
      hover/active behavior, and direct-child icon sizing. The task does not claim D10's
      "`<Panel>` tags outside `editors/` → 0" condition; Epic E collects the two retained tags.
- [ ] Notebook's `editorOverlayRef` portal and Graph's `getOverlayLayer()` portal remain
      unchanged and outside the secondary-view host contract.
- [ ] `npm run typecheck`, `npm run lint`, `npm run build-prod`, and `git diff --check` pass; the
      Rule 4 sidebar measurement is recorded or explicitly marked pending with its reason.

## Files that need NO changes

The following files were verified as callers, published boundaries, or reusable infrastructure and
must remain unchanged in this task:

- `src/renderer/ui/secondary-views/SecondaryViewsModel.ts` — already React-free; state shape and
  owner-side effects remain unchanged.
- `src/renderer/ui/secondary-views/panel-key.ts` — already React-free; composite identity contract
  remains unchanged.
- `src/renderer/ui/secondary-views/secondary-view-registry.ts` — published React registry,
  `SecondaryViewProps`, `headerRef`, exact/prefix lookup, and `loadComponent` shape remain intact.
- `src/renderer/ui/app/Pages.tsx` and `src/renderer/editors/browser/BrowserSecondaryViews.tsx` —
  current React owners keep the same `SecondaryViews` import and props.
- All 14 direct editor callers listed in the header table:
  `archive/ArchiveSecondaryView.tsx`, `board/BoardSecondaryView.tsx`,
  `explorer/ExplorerSecondaryView.tsx`, `explorer/SearchSecondaryView.tsx`,
  `explorer/BoardsSecondaryView.tsx`, `file-diff/GitDiffRevisionsSecondaryView.tsx`,
  `git-tree/GitPanelSecondaryView.tsx`, `link-editor/panels/LinkCategorySecondaryView.tsx`,
  `link-editor/panels/LinkHostnamesSecondaryView.tsx`,
  `link-editor/panels/LinkTagsSecondaryView.tsx`, `mneme-root/MnemeTreeSecondaryView.tsx`,
  `notebook/panels/NotebookCategoriesSecondaryView.tsx`,
  `notebook/panels/NotebookTagsSecondaryView.tsx`, and
  `rest-client/panels/RestPanelSecondaryView.tsx`.
- `src/renderer/editors/notebook/NotebookBody.tsx` and
  `src/renderer/editors/graph/GraphTooltip.tsx` — unrelated editor portal targets.
- `src/renderer/uikit/shared/vanilla-view.ts`, `src/renderer/uikit/shared/mount.tsx`,
  `src/renderer/uikit/shared/fill-slot.ts`, `src/renderer/uikit/shared/keyed-list.ts`,
  `src/renderer/uikit/Panel/panel-style.ts`, `src/renderer/uikit/Text/text-style.ts`,
  `src/renderer/uikit/shared/slots.ts`, and `src/renderer/theme/icons.tsx` — consume the existing
  native infrastructure; do not modify it for this unit.
- `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.tsx`,
  `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStackView.tsx`, and
  `src/renderer/uikit/Splitter/SplitterView.ts` — reuse the existing stack and splitter
  implementations exactly; no shared UIKit primitive is modified by this task.
- `src/renderer/core/state/view.tsx` — no shared React registry or React render arm is changed by
  this task.
- `src/renderer/editors/register-editors.ts` — no native editor registration is added here.
- `doc/active-work.md` and `doc/epics/EPIC-058.md` — dashboard/epic linking is reserved by the
  user for this investigation pass.

## Files Changed summary

| File | Planned change |
|---|---|
| `doc/tasks/US-1033-secondary-views-vanilla/README.md` | This verified investigation and implementation plan |
| `src/renderer/ui/secondary-views/SecondaryViews.tsx` | Preserve the React face, keep the closed/null guard, delegate open state to `SecondaryViewsView` |
| `src/renderer/ui/secondary-views/SecondaryViewsView.ts` | New native controlled host, React panel reconciliation, stack/splitter composition, header publication, and disposal |
| `src/renderer/ui/secondary-views/SideBarPanelHeader.tsx` | Preserve the React portal face, props, and both `<Panel>` wrappers; remove only Emotion |
| `src/renderer/ui/secondary-views/SideBarPanelHeader.css` | Static show-main button and header title/actions styles replacing the Emotion declaration |

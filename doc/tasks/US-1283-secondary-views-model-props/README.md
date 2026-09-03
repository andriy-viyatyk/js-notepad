# US-1283: Replace `SecondaryViewsView`'s `{ state, setState }` props with the model and named commands

**Status:** Implemented — awaiting human verification
**Epic:** none (De-React package 8 residue — see [backlog.md](../backlog.md))
**Created:** 2026-09-03

## Goal

Stop snapshotting `ISecondaryViewsState` into a fresh props object on every notification. Pass the
`SecondaryViewsModel` and let the child `bind()` the two fields it reads, so a splitter drag no
longer re-runs the sidebar's whole panel reconciliation.

The implementation is complete. `SecondaryViewsView` now binds the live model fields, the two
owners pass stable named commands, and the bridges gate updates by ordered model identity. Runtime
verification of drag, persistence, detach, and breadcrumb behavior remains pending.

## Background

`ui/secondary-views/SecondaryViewsView.ts:23-31` is React's "lifting state up" transcribed
literally, patch-object setter included:

```ts
export interface SecondaryViewsProps {
    views: EditorModel[];
    /** Controlled layout state, held by the owner. */
    state: ISecondaryViewsState;
    /** Owner-provided state update carrying layout side effects. */
    setState: (patch: Partial<ISecondaryViewsState>) => void;
}
```

### What the child actually reads — two fields, not three

Verified 2026-09-03. `ISecondaryViewsState` has `open`, `width`, `activePanel`. The child reads:

| Field | Read at | Used for |
|---|---|---|
| `width` | `:68`, `:93`, `:263` | outer panel width + splitter value |
| `activePanel` | `:153` | resolving the active key |
| `open` | **never** | — |

And it writes through `setState` at exactly two sites: `:274` (`activePanel`) and `:278` (`width`).

### The `setState` shape is not the defect — the snapshot is

Both owners' setters carry real side effects, so they must survive:

- `api/pages/PageModel.ts:531-549` — the mandatory-open clamp (`patch.open === false` is ignored
  while `sidebarMandatory`), the `Math.max(120, width)` floor, and on an `activePanel` change:
  assigning `_activePanel`, resolving the owning editor, calling `onPanelExpanded(panelId)`, and
  sending the `panelExpanded` event.
- `editors/browser/BrowserPanelHost.ts:142-160` — forces `open = true` unconditionally, the same
  width floor plus an `onWidthChange` mirror, and the same `activePanel` side effects.

`SecondaryViewsModel.setStateQuiet` (`SecondaryViewsModel.ts:40-46`) exists as the side-effect-free
path used by `PageModel` restore and seeding. That whole arrangement is sound. **The defect is only
the `state:` snapshot prop and the per-notification pump that feeds it.**

### The two feeding bridges, and what each one needs

**`ui/app/PageContentView.ts:99-115`** subscribes to `nav.state` and, on every notification:

```ts
const state = nav.state.get();
if (!state.open) { this.clearSecondary(); return; }
const props = { views: page.panelEditors, state, setState: page.setSecondaryViewsState };
if (!this.secondaryView) { /* create + mount */ } else this.secondaryView.update(props);
```

This parent **must keep its subscription** — it reads `state.open` to decide whether the sidebar
view exists at all (`clearSecondary()` disposes it). That is the one legitimate consumer of `open`.
What goes away is the `state` snapshot and the unconditional `update(props)`: today a splitter drag
fires `setState` → nav notify → `sync()` → fresh props → `SecondaryViewsView.onUpdate` → the full
panel reconciliation at `:132`. After the change the parent only reacts to an `open` transition or a
change in `panelEditors`.

**`editors/browser/BrowserSecondaryViews.ts:42-54`** holds *two* subscriptions that both call
`sync()`: one on `nav.state`, one on `host.state` selected by `state.version`. Two findings:

1. `state.open` is irrelevant on this path — `BrowserPanelHost.setSecondaryViewsState:147` forces
   `s.open = true` unconditionally, and the drawer's own visibility is a separate
   `BookmarksDrawerProps.open` fed from `BrowserView.ts:495`. So this bridge never gates on `open`.
2. `BrowserPanelHost.ts:130-132` mirrors **every** nav-model change into `state.version++`. The only
   subscriber to `version` in the whole renderer is `BrowserSecondaryViews.ts:51` — verified by grep.
   So that mirror exists solely to pump this bridge and **can be deleted** as part of this task. The
   other two `version++` sites (`:67`, `:70`) fire on editor changes and must stay.

### `panelEditors` returns a fresh array

`PageModel.panelEditors` (`:211`) filters and sorts; `BrowserPanelHost.panelEditors` (`:80-82`)
builds `[this._editor]` or `[]`. Both allocate a new array per call, so **`views` is never identity
stable** — any gate on it must compare length plus element identity, not the array reference. This
is the same fresh-array hazard family tracked by US-1258 for the dialog selectors.

## Implementation plan

### 1. New props shape

`src/renderer/ui/secondary-views/SecondaryViewsView.ts`

```ts
export interface SecondaryViewsProps {
    /** Panel-contributing editors supplied by the owner. */
    views: EditorModel[];
    /** Reactive layout state. The view binds `width` and `activePanel` itself. */
    nav: SecondaryViewsModel;
    /** Activate a panel, running the owner's side effects (panelExpanded, onPanelExpanded). */
    onActivatePanel: (panelId: string) => void;
    /** Commit a splitter drag, running the owner's clamp and mirror. */
    onResizeWidth: (width: number) => void;
}
```

- [x] `:274` / `:278` — `this.props.setState({ activePanel: id })` becomes
      `this.props.onActivatePanel(id)`; `this.props.setState({ width })` becomes
      `this.props.onResizeWidth(width)`.
- [x] `onMount` — bind the two fields instead of reading a snapshot:

```ts
this.bind(this.props.nav.state, (s) => s.width, (width) => this.applyWidth(width));
this.bind(this.props.nav.state, (s) => s.activePanel, () => this.syncPanels());
```

- [x] Extract `applyWidth(width)` from the current `:68` / `:93` / `:263` reads (outer panel
      attributes + `splitterProps().value`). It must be callable outside `onUpdate`.
- [x] `onUpdate(props)` keeps only what genuinely comes from the parent: a changed `views` list, and
      re-binding if `props.nav` is a different model instance (it can be — `PageContentView:100-104`
      already handles `this.navModel !== nav`). Release and re-establish both binds in that case.
- [x] `:153` `resolveActiveKey` reads `this.props.nav.state.get().activePanel` instead of
      `this.props.state.activePanel`.

### 2. `PageContentView` — gate on what the parent actually owns

`src/renderer/ui/app/PageContentView.ts:99-115`

- [x] Keep the `nav.state` subscription (it owns mount/unmount on `open`).
- [x] Build props without `state`:
      `{ views: page.panelEditors, nav, onActivatePanel: ..., onResizeWidth: ... }`.
      Both commands route to `page.setSecondaryViewsState` — `(panelId) => page.setSecondaryViewsState({ activePanel: panelId })`
      and `(width) => page.setSecondaryViewsState({ width })` — so the clamp and the events are
      unchanged. Hold them as stable bound fields, not fresh closures per sync.
- [x] Skip the `update()` when nothing the parent owns changed:

```ts
// `panelEditors` allocates a fresh array every call — compare element-wise.
const viewsChanged = !sameItems(this.lastViews, views);
if (!this.secondaryView) { /* create + mount */ }
else if (viewsChanged) this.secondaryView.update(props);
this.lastViews = views;
```

      Use the shared `sameItems(a, b)` helper from `core/utils/utils.ts` (length + per-index
      identity), which is also used by `SecondaryViewsView` and the browser bridge.

### 3. `BrowserSecondaryViews` — drop the nav pump

`src/renderer/editors/browser/BrowserSecondaryViews.ts`

- [x] Delete `navSubscription` and its half of `subscribe()` / `unsubscribe()`. The child now binds
      `nav.state` itself, and this bridge never reads `open`.
- [x] Keep `hostSubscription` (`state.version`), which is what tells the bridge that
      `host.panelEditors` changed, and apply the same element-wise `views` gate as step 2.
- [x] `childProps()` returns the new shape; `this.nav` is passed through rather than snapshotted.

`src/renderer/editors/browser/BrowserPanelHost.ts`

- [x] Delete the nav mirror at `:130-132`:

```ts
// before
this.subscriptions.add(this.secondaryViewsModel.state.subscribe(() => {
    this.state.update((s) => { s.version++; });
}));
// after — deleted; BrowserSecondaryViews was its only subscriber
```

      Leave the `s.hasSidebar = true` update on the following line in place.

### 4. Documentation

- [x] `doc/architecture/secondary-views.md` — describe the model-passing contract and the two
      commands; remove any description of the controlled `{ state, setState }` pair.
- [x] `doc/standards/model-view-pattern.md` — it currently cites `PageContentView` as the
      props-pump exemplar. Confirm the citation still matches after this change and update the
      snippet if it does not.
- [x] `doc/tasks/backlog.md` — drop the §1.3 bullet from package 8 (this task completes it, minus
      `ExpandedNoteView`, which is being dropped as a naming preference).

## Files that need NO changes

- `src/renderer/ui/secondary-views/SecondaryViewsModel.ts` — already a reactive `TComponentState`;
  `setStateQuiet` keeps its restore/seed role.
- `src/renderer/api/pages/PageModel.ts:531-549` and
  `src/renderer/editors/browser/BrowserPanelHost.ts:142-160` — the setters keep their signatures and
  all their side effects. Only `BrowserPanelHost:130-132` is touched.
- `src/renderer/uikit/CollapsiblePanelStack/**` — US-1282's territory; the stack's own
  `activePanel` / `setActivePanel` props are a separate, correct pair and stay as they are.
- `src/renderer/editors/browser/BookmarksDrawer.ts`, `BrowserView.ts` — the drawer's `open` and
  `width` come from `BrowserEditorState.bookmarksWidth`, not the nav model.

## Concerns

1. **Is a `nav` model instance ever swapped under a mounted child?** Yes —
   `PageContentView:100-104` re-subscribes when `this.navModel !== nav`, and
   `BrowserSecondaryViews.onUpdate:30-35` rebuilds `this.nav` on a host change. `onUpdate` must
   therefore release and re-establish both binds when `props.nav` differs. Getting this wrong leaves
   the sidebar bound to a dead model — the most likely defect in this task.
2. **Does anything outside the child depend on the child being updated on every nav change?** The
   `views` gate in steps 2 and 3 is the risk surface. `panelEditors` is a fresh array, so an
   identity gate would skip *every* update and a missing gate keeps the current behaviour. The
   element-wise compare is the only correct middle.
3. **Width during a drag.** `SplitterView` reports through `onChange` → `onResizeWidth` → owner
   clamp → model update → the child's `width` bind. Confirm the drag still tracks smoothly: the
   round trip is one more hop than before but no longer re-reconciles the panel list.
4. **Verification needs the user.** The behaviours at risk — a smooth splitter drag, the sidebar
   closing on the last-panel detach, `panelExpanded` still driving the LinkBody breadcrumb sync in
   the browser's bookmarks drawer — are interactive. Record them for a joint pass rather than
   claiming them from a green build.

## Acceptance criteria

- [x] `SecondaryViewsProps` has no `state` or `setState` member; `grep -rn "setSecondaryViewsState" src/`
      shows only owner-side callers and the two new command closures.
- [x] `BrowserPanelHost` has two `version++` sites, not three, and no subscription to its own nav model.
- [x] `npm run typecheck`, `npm run lint`, `npm run build-prod` all pass.
- [ ] Dragging the sidebar splitter no longer triggers a panel reconciliation — confirm by
      instrumenting `SecondaryViewsView.onUpdate` during a drag and observing zero calls.
- [ ] Interactive pass (user): splitter drag is smooth and the width persists across a restart;
      clicking a collapsed panel header expands it and fires the expected side effects; closing the
      last panel closes the sidebar; the browser bookmarks drawer's panels still switch, and the
      LinkBody breadcrumb still follows the active panel.

## Files changed

| File | Change |
|---|---|
| `ui/secondary-views/SecondaryViewsView.ts` | New props shape; bind `width` + `activePanel`; extract `applyWidth`; two named commands |
| `ui/app/PageContentView.ts` | Drop the state snapshot; stable command fields; element-wise `views` gate |
| `editors/browser/BrowserSecondaryViews.ts` | Delete the nav subscription; new child props; same `views` gate |
| `editors/browser/BrowserPanelHost.ts` | Delete the nav-to-`version` mirror (`:130-132`) |
| `core/utils/utils.ts` | Shared `sameItems` helper for element-wise identity gates |
| `doc/architecture/secondary-views.md` | Document the model-passing contract |
| `doc/standards/model-view-pattern.md` | Re-check the `PageContentView` citation |
| `doc/tasks/backlog.md` | Remove the §1.3 bullet from package 8 |

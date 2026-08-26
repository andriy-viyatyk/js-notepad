# US-1123: Composite and stateful demo wrappers

**Status:** Implemented; Notification interaction remains blocked by a pre-existing component defect  
**Priority:** High  
**Epic:** [EPIC-069 — De-React E11: the Storybook contract](../../epics/EPIC-069.md)  
**Created:** 2026-08-26

## Goal

Move the five composite/stateful Storybook demos to the typed vanilla `view` arm, renaming their
story files from `.story.tsx` to `.story.ts`, while preserving each story's controls, defaults,
sample data, layout context, stateful interactions, and child lifecycle.

## Background

US-1119 added the exactly-one-arm `Story<P>` contract and `mountVanilla`; US-1120 and US-1122
established that a story-local React wrapper is part of the demo and must become a story-local
`VanillaView`, not be replaced by the bare component view. The UIKit lifecycle contract requires
constructors to create only a stable root; child DOM and child views are created and mounted in
`onMount()`.

The five wrappers and their real child views are:

| Story | Demo state/context | Child view |
|---|---|---|
| `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.story.tsx` | Active panel, width, three panel records, content panels, and a refresh-button slot | `CollapsiblePanelStackView`; native `IconButtonView` for the Hostnames buttons slot |
| `src/renderer/uikit/CategoryList/CategoryList.story.tsx` | Separate tag/hostname selections, sample arrays, count maps, two list layouts, and selected-value labels | Two `CategoryListView` instances |
| `src/renderer/uikit/PathInput/PathInput.story.tsx` | Controlled input value, last committed value, and `PATH_SETS` selection | `PathInputView` |
| `src/renderer/components/git-tree/GitTree.story.tsx` | Synthetic DAG, owned `GitTreeModel`, selected commit, compact width, and optional from/to side selection | `GitTreeView` |
| `src/renderer/uikit/Notification/Notification.story.tsx` | Replay version, click log, conditional body/close handlers, and the notification layer | `NotificationView`, rebuilt on Replay animation |

The demo views will use `createPanelElement`/`applyPanelAttributes` for former `Panel` containers
and `createTextElement` or equivalent DOM text nodes for former `Text` content. They will never
hand-write the DOM of a real component. A child view is claimed with `this.child(...)`, mounted
exactly once, and updated in place; a child being structurally replaced is released with
`releaseChild(...)` before its containing subtree is rebuilt.

The story metadata must remain exact. The generic changes from bare `Story` to the story-local
demo props, because controls such as `initialActive`, `pathSet`, `showCounts`, `sideSelect`, and
`bodyClickable` belong to the demo wrapper rather than to the child component.

Before and after declaration shape:

```ts
// Before
export const pathInputStory: Story = {
    component: PathInputDemo as React.ComponentType<Record<string, unknown>>,
    props: [/* existing definitions */],
};

// After
class PathInputDemoView extends VanillaView<PathInputDemoViewProps> { /* demo state + child */ }

export const pathInputStory: Story<PathInputDemoViewProps> = {
    view: PathInputDemoView,
    props: [/* the same definitions and values */],
};
```

## Implementation Plan

### 1. Convert `CollapsiblePanelStack`

Rename `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.story.tsx` to
`CollapsiblePanelStack.story.ts`. Define a local public-constructor `CollapsiblePanelStackDemoView`
with fields for the active panel, the mounted stack child, and the native Hostnames refresh-button
child. In `onMount()` create the outer row Panel, the mounted `CollapsiblePanelStackView`, and the
three panel descriptors. Build each sample content panel with the same padding/gap/text values as
the React wrapper. Create and mount an `IconButtonView({ size: "sm", title: "Refresh", icon:
"refresh", onClick: () => alert("refresh") })` for the Hostnames `buttons` slot.

When the stack calls the demo's active-panel handler, update the plain active field and call
`stackView.update(...)`; update the `Active: <strong>...</strong>` label in the adjacent text
context. On story prop updates, update the stack's width and panel descriptors without rebuilding
the stable demo root. Dispose both the stack and refresh-button children on view disposal, with the
stack released before its slot node is disposed.

### 2. Convert `CategoryList`

Rename `src/renderer/uikit/CategoryList/CategoryList.story.tsx` to `.story.ts`. Define a local
`CategoryListDemoView` with `tagValue` and `hostValue` fields, preserving `SAMPLE_TAGS`,
`SAMPLE_HOSTNAMES`, `tagCounts`, and `hostCounts` exactly. Build the outer column layout and both
inner row layouts in `onMount()` with `createPanelElement`; mount one `CategoryListView` in each
bounded bordered panel and create selected-value text labels with their `<code>` children.

The two `onChange` handlers update their corresponding plain field, update the matching child with
the current `separator`, `rootLabel`, `showCounts`-dependent `getCount`, and items, then update only
the matching selected-value label. `onUpdate()` forwards changed story props to both child views and
refreshes their derived count callbacks; it does not rebuild the list layout because those controls
change list content/behavior, not the surrounding structure. Preserve the focus-selection and
overflow attributes supplied by the original Panel and CategoryList components.

### 3. Convert `PathInput`

Rename `src/renderer/uikit/PathInput/PathInput.story.tsx` to `.story.ts`. Define a local
`PathInputDemoView` with `value` and `lastCommit` fields initialized as the React wrapper's two
`useState` calls. Create a 360px column Panel, one `PathInputView`, and the two value/commit text
rows in `onMount()`; mount the child after attaching its root.

The child props must retain `PATH_SETS[pathSet] ?? PATH_SETS.deep`, `maxDepth || undefined`, the
same `aria-label`, and every input option. `onChange` updates the value field, forwards the new
controlled value to the existing `PathInputView`, and updates the displayed value. `onBlur` keeps
the exact `undefined`/`JSON.stringify` display. Later story prop updates forward to the existing
child without resetting either demo-local field, matching React's hook lifetime.

### 4. Convert `GitTree`

Rename `src/renderer/components/git-tree/GitTree.story.tsx` to `.story.ts`. Define a local public
`GitTreeDemoView` whose constructor creates the stable outer Panel root and the synthetic
`GitTreeModel`, seeds `DEMO_COMMITS`, and registers model disposal. Child DOM is still deferred to
`onMount()`.

Build the nested `flex={1}, height={0}` Panel and mount a `GitTreeView` child there. Keep plain
fields for selected hash, from hash, and to hash. Derive the `GitTreeSideSelect` object from those
fields and `sideSelect`, preserving its `selectionKey`, active-row predicates, and L/R callbacks.
Selection and side-toggle handlers must push a new `GitTreeProps` object to the existing child;
compact changes update the existing `GitTreeView` and the outer width (`460` versus `760`) in place.
The story-owned `GitTreeModel` and `GitTreeView` must both be disposed, so no grid/model callbacks
or state subscriptions survive the story view.

### 5. Convert `Notification`

Rename `src/renderer/uikit/Notification/Notification.story.tsx` to `.story.ts`. Define a local
`NotificationDemoView` with the replay version and newest-first, six-entry click-log fields. Build
the same control row, relative notification host (`minHeight={80}`), and click-log region in
`onMount()`. The Replay animation Button increments the version and explicitly releases the current
`NotificationView` before creating/mounting its replacement, preserving React's `key={version}`
remount semantics and the slide-in animation. `bodyClickable` supplies the exact body log entry;
`showCloseButton` supplies the exact close-X log entry. Updating either prop must update or rebuild
only the notification child as needed, and all attached children/layers must be disposed when the
demo view leaves.

The pre-conversion Notification baseline is intentionally treated as the current interaction
contract. Do not add a notification or otherwise make the initial state more visible merely to
produce a non-empty baseline. Hand verification must exercise the Replay animation control and
then the notification body/close controls, checking the displayed message, severity, animation
remount, and newest-first click log.

### 6. Touch the story registry

Modify `src/renderer/editors/storybook/storyRegistry.ts` after the five renames so the existing
extensionless imports resolve the `.story.ts` modules and Vite drops stale `.tsx` specifiers.
Preserve the current import order, registry order, and every unrelated entry. No registry type or
Storybook infrastructure change is needed.

### 7. Verify source preservation and gates

- Compare each converted source's `id`, `name`, `section`, complete `props` array, and all default
  values against the original source; every PropDef value remains verbatim.
- Check every wrapper field, sample array/map, derived callback, layout attribute, handler, and
  static text. Confirm all real component instances are child views, mounted once, updated in place,
  and explicitly disposed when replaced or when the demo is disposed.
- Confirm Notification's initial behavior is not changed and record the exact manual interaction
  path in the final task summary.
- Confirm only the five renamed story files, the registry, and this task document changed. Do not
  edit `storyTypes.ts`, `story-props.ts`, `LivePreview.tsx`, any component/view implementation,
  `Panel`, `Text`, the dashboard, or the epic.
- Run `npm run typecheck`, `npm run lint`, and `npm run build-prod`; do not add tests or a harness.

## Concerns

1. **Story-local props versus component props — resolved.** Each `Story<P>` generic is the demo
   view's props, preserving wrapper-only controls and allowing `PropDef<P>` to validate the actual
   Storybook surface.
2. **Child DOM lifecycle — resolved.** Constructors create only stable roots and view-owned model
   state. Panel/text elements, child views, listeners, and slots are built from `onMount()`.
3. **State push and structural replacement — resolved.** Demo-local `useState` values become plain
   fields. Handlers update those fields and push props to existing children. Notification's keyed
   child and any changed structural subtree are released before replacement; disposal also releases
   the floating layer and model/grid resources.
4. **CollapsiblePanelStack button slot — resolved in the implementation by using a mounted native
   `IconButtonView` node.** The stack remains the real child view, and the button node is explicitly
   owned by the demo so it cannot outlive the story.
5. **Notification baseline — preserved, but interaction is blocked.** The empty pre-conversion
   baseline is not used as a reason to add mount-time notification content. The intended interaction
   path is Replay animation remounting the notification, followed by the body or close X logging
   `body clicked → onClose('clicked')` or `close X clicked → onClose()`. The existing
   `NotificationView` constructor dereferences `iconHost` before `onMount()` initializes it, so the
   child cannot currently mount. Fixing that component is outside this task's exact five-story
   scope; the gap is reported rather than silently treated as verified.
6. **Known benign DOM differences.** The `display: contents` adapter relocation, Panel boolean
   attribute spelling, and removal of React slot/root markers are expected per EPIC-069 §E11-10.

## Acceptance Criteria

- [x] All five story files are renamed from `.story.tsx` to `.story.ts` and use a typed vanilla
      `view` arm with the demo wrapper's prop type.
- [x] Every former wrapper's state, sample data, layout context, controls, handlers, and static
      content is preserved; real components are delegated to mounted child views.
- [x] Child DOM is created in `onMount()`, state changes update existing children, and replaced
      children plus story-owned models/layers are disposed explicitly.
- [x] `CollapsiblePanelStack` retains its native refresh-button slot and `GitTree` retains its model
      and side-select derivation.
- [ ] `Notification`'s Replay/key remount and click-log behavior is hand-verified; the existing
      `NotificationView` constructor defect blocks this without an out-of-scope component change.
- [x] `id`, `name`, `section`, every PropDef value, and every `defaultProps` value are unchanged.
- [x] `storyRegistry.ts` is touched for the renamed import graph; no other Storybook infrastructure
      or unrelated story is changed.
- [x] `npm run typecheck`, `npm run lint`, and `npm run build-prod` pass.
- [x] No unit tests, harness, commit, dashboard/epic edit, Panel/Text edit, or React face deletion
      is introduced.

## Verification Results

- Source-level comparison: all five stories retain identical metadata, PropDef entries, and
  default values; each now declares a typed vanilla `view` and no `component` arm.
- Lifecycle/source check: demo children are built in `onMount()`, state is forwarded through plain
  fields, and replaced Notification/owned GitTree resources are disposed explicitly.
- Notification interaction check: blocked by the pre-existing `NotificationView` constructor
  `iconHost` dereference; no component file was changed.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run build-prod` — passed.

## Files Changed Summary

| File | Change |
|---|---|
| `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.story.ts` | Local vanilla composite demo with three sample panels and native refresh slot. |
| `src/renderer/uikit/CategoryList/CategoryList.story.ts` | Local vanilla demo with two stateful category lists and count derivations. |
| `src/renderer/uikit/PathInput/PathInput.story.ts` | Local vanilla controlled path-input demo and value/blur context. |
| `src/renderer/components/git-tree/GitTree.story.ts` | Local vanilla GitTree demo with owned synthetic model and side selection. |
| `src/renderer/uikit/Notification/Notification.story.ts` | Local vanilla notification interaction demo with explicit replay replacement/disposal. |
| `src/renderer/editors/storybook/storyRegistry.ts` | Touch renamed story import resolution. |
| `src/renderer/uikit/*/*.story.tsx` for the five listed stories | Removed by rename. |
| `src/renderer/editors/storybook/storyTypes.ts`, `story-props.ts`, `LivePreview.tsx`, component/view implementations, `Panel`, `Text`, `doc/active-work.md`, `doc/epics/EPIC-069.md` | No changes. |

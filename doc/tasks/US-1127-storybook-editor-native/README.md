# US-1127: Storybook editor native views

**Status:** Implemented; pending live verification
**Priority:** High
**Epic:** [EPIC-069 — De-React E11: the Storybook contract](../../epics/EPIC-069.md)
**Created:** 2026-08-26

## Goal

Convert the six non-story files in `src/renderer/editors/storybook/` from React components to
native `VanillaView` classes. Register the editor through `EditorModule.View`, while preserving
the two React story compatibility islands (`Panel` and `Text`), Storybook prop preparation, the
virtualized browser, centered preview geometry, and disposal on story changes.

## Background

EPIC-069 §E11-7 task 9 owns this editor conversion after all registered stories except `Panel` and
`Text` moved to the vanilla arm. The current editor still has a React root in
`src/renderer/editors/storybook/index.tsx` and React function components for the editor shell,
property controls, component browser, and live preview. `storyTypes.ts` already expresses the
one-of `component`/`view` contract, and `story-props.ts` exports the single `prepareStoryProps`
path established by EPIC-069 §E11-10.

The editor is not opened with `app.pages.addEditorPage("storybook-view")`: that API rejects a
standalone editor requiring a specialized model, and the scripting facade has no
`showStorybookPage`. Live verification must open the Storybook tool registered by
`src/renderer/ui/sidebar/tools-editors-registry.ts:170-175`, which calls
`PagesLifecycleModel.showStorybookPage()` at `src/renderer/api/pages/PagesLifecycleModel.ts:792`.

The native view contract requires constructors to create only a stable root. Child DOM, child
views, listeners, and subscriptions are created in `onMount()`. The existing UIKit views are the
composition seam: `ToolbarView`, `SplitterView`, `SegmentedControlView`, `SpacerView`,
`ListBoxView`, `InputView`, `CheckboxView`, `ButtonView`, and `LabelView`. Panel and Text have no
native view class, so their existing DOM attribute helpers (`createPanelElement` and
`createTextElement`) are used directly.

## Implementation Plan

### 1. Convert the editor module and shell

Rename `StorybookEditorView.tsx` to `StorybookEditorView.ts` and make it a public-constructor
`StorybookEditorView extends VanillaView<{ model: EditorModel }>`.

- Create only the Storybook root panel in the constructor.
- In `onMount()`, create and attach the toolbar, body panel, component browser, two splitters,
  live preview, and property editor before mounting the child views. This keeps attached roots
  available to views that measure themselves.
- Preserve toolbar labels, names, background choices, splitter values/minima, panel widths, and
  `height={0}`/`overflow="hidden"` flex geometry.
- Subscribe to the long-lived `StorybookEditorModel.state` with `bind()` for background and both
  splitter values. Each callback applies the current value immediately and updates the existing
  child view; no selection-specific binding is introduced.

Rename `index.tsx` to `index.ts`, remove the React wrapper and `Component` property, and register
`StorybookEditorView` as `View`. Touch `src/renderer/editors/register-editors.ts` after the rename
to invalidate Vite's stale dynamic-import resolution. The editor module remains dynamically
loaded and continues to construct the existing `TComponentState`-backed model.

Before → after module shape:

```tsx
// Before
Component: StorybookEditorComponent,
```

```ts
// After
View: StorybookEditorView,
```

### 2. Convert the component browser and property editor

Rename `ComponentBrowser.tsx` to `ComponentBrowser.ts` and implement a native view that owns one
`ListBoxView<IListBoxItem>`.

- Build section and story rows from `storiesBySection()` once when mounting.
- Keep the existing `variant="browse"`, `selectionStyle="focus"`, and exact `rowHeight={26}`.
- Recompute the selected item from the stable item list whenever `selectedStoryId` changes, and
  update the browser panel width whenever `leftPanelWidth` changes.
- Send row selection to `model.selectStory(String(item.value))`.

Rename `PropertyEditor.tsx` to `PropertyEditor.ts`. Implement native property-row views that
create their child `LabelView`, `InputView`, `CheckboxView`, and `ButtonView` instances in
`onMount()`. Preserve all five `PropDef` kinds, string/number conversion, empty enum rendering,
`ICON_PRESETS` as the icon source, preset ids as the values written to
`model.setPropValue`, managed-prop filtering, and the reset button. Rebuild rows only when the
selected story changes; ordinary prop updates call `update()` on the existing controls.

Before → after control path:

```tsx
// Before
onChange={(v) => model.setPropValue(def.name, v)}
```

```ts
// After
onChange: (value) => this.model.setPropValue(def.name, value)
```

### 3. Convert LivePreview with explicit native lifecycle ownership

Rename `LivePreview.tsx` to `LivePreview.ts` and implement `LivePreviewView` as a native view
whose root preserves the current centered panel exactly: `align="center"`, `justify="center"`,
`overflow="auto"`, `padding="xl"`, and the selected background.

- Call `prepareStoryProps(story, propValues, previewBackground)` for every render/update. Do not
  duplicate icon, managed-prop, empty-enum, or generated-children preparation.
- Preserve the missing-story message and the visible exactly-one-arm configuration message.
- Preserve `warnUnexpectedProps`, including allowed `defaultProps` callback keys and the warning
  while continuing to render.
- For `component` stories, create a persistent display-contents host and mount one React root with
  `mountReactHandle`. Render the existing `EditorErrorBoundary` keyed by `story.id` around the
  component. Re-render this handle for prop/background changes; the key changes only on story
  changes, so the React boundary still resets a failed story.
- For `view` stories, dispose and detach the outgoing view before constructing the incoming view.
  Claim the new view through the parent ownership contract, attach its real root, then call
  `mount()`. On same-story updates call `view.update(props)` without remounting.
- Catch synchronous vanilla construction, mount, update, and disposal failures. Show a visible
  error `Text` made with `createTextElement(..., { color: "error" })`, using `errMessage(e,
  fallback)` for the message. The caller owns these synchronous native lifecycle calls, so this
  is equivalent to the prior React boundary for the vanilla arm; the React arm retains the real
  `EditorErrorBoundary` because descendant React render failures are boundary-owned.
- Ensure failed or replaced views are disposed and detached, including their floating layers,
  timers, observers, and listeners. A story switch must never leave the outgoing view mounted.

Before → after preview ownership:

```tsx
// Before
<EditorErrorBoundary key={story.id}>
    <Component {...storyProps} />
</EditorErrorBoundary>
```

```ts
// After
const handle = mountReactHandle(host, React.createElement(
    EditorErrorBoundary,
    { key: story.id },
    React.createElement(story.component, storyProps),
));
// Native arm: this.child(view), root.append(view.root), view.mount()/update(), and disposal.
```

The preview root is a real panel and each native story root is attached directly beneath it. No
`display: contents` wrapper is used for a measuring story root; the only display-contents host is
the React compatibility host, which has no component measurement responsibility.

### 4. Rename icon preset data and reduce the story contract import

Rename `iconPresets.tsx` to `iconPresets.ts`; it contains no JSX and no React import, so its data
and `createIconElement` resolution are unchanged. Change `storyTypes.ts` to use only the type
imports needed by the surviving React story arm (`ComponentType` and `ReactNode`), retaining the
vanilla arm and `Node`-typed `previewChildren`.

No story file changes are part of US-1127. In particular, `Panel.story.tsx` and `Text.story.tsx`
remain React stories, and no UIKit React face is deleted.

### 5. Verify

- Source-audit constructors, `onMount()` child creation, model subscriptions, live callers of all
  derived values, exact preview geometry, arm selection, prop preparation, warnings, keyed React
  boundary, native disposal ordering, and the browser's virtualization settings.
- Open Storybook through the sidebar Storybook tool in the running app. Do not attempt
  `app.pages.addEditorPage("storybook-view")`; it is intentionally refused and there is no
  scripting `showStorybookPage` facade.
- Manually sweep the browser, all property control types, switching between a vanilla story and
  `Panel`/`Text`, background changes, and a story with floating layers. Confirm the outgoing native
  root and its resources are gone before the incoming root is mounted, and confirm the eight
  measuring stories retain a real root.
- Run `npm run typecheck`, `npm run lint`, and `npm run build-prod`. Do not add unit tests,
  harnesses, dashboard edits, epic edits, or a commit.

## Concerns

1. **Vanilla error handling — resolved.** Use a synchronous catch in `LivePreviewView` because it
   directly owns `new view`, `mount()`, `update()`, and disposal. The catch renders a visible error
   state and formats the unknown value with `errMessage`. The React arm remains behind the keyed
   `EditorErrorBoundary`, which is still required for descendant React render failures.
2. **Disposal ordering — resolved.** The outgoing React handle is disposed, or the outgoing native
   child is released (which disposes and removes its root), before any replacement is constructed
   or attached. The parent owns native story views through `child()` and does not rely on DOM
   containment for cleanup.
3. **Measurement — resolved.** The preview panel keeps its centered geometry exactly. Native story
   roots are appended directly and remain measurable; only the React compatibility host uses
   `display: contents`.
4. **State subscriptions — resolved.** The model state outlives the view, so fixed `bind()` calls
   are appropriate for the shell and child views. No bind is created per selected story. The
   native preview replaces its owned story view explicitly and applies the current props
   immediately during each state notification.
5. **Prop surface — resolved.** Existing `*View` props accept the values required here, including
   string/number children and native list rows. No `uikit/` prop widening is needed.
6. **Vite rename invalidation — resolved.** `register-editors.ts` is touched because it dynamically
   imports the renamed `index` module through `./storybook`. `storyRegistry.ts` is intentionally
   unchanged: it imports story files, none of which is renamed by US-1127.

## Acceptance Criteria

- [x] `editors/storybook/` contains no `.tsx` files; the two React survivor stories remain untouched.
- [x] `storybookModule` exposes `View`, not `Component`, and still creates the existing model.
- [x] All native editor constructors create only stable roots; child DOM is built in `onMount()`.
- [x] `StorybookEditorView` preserves the shell layout, toolbar controls, splitters, and widths.
- [x] `ComponentBrowserView` retains `storiesBySection()`, section rows, focus selection, browse
      variant, and `rowHeight={26}`.
- [x] `PropertyEditorView` preserves string, number, boolean, enum, and icon editing through
      `model.setPropValue`, with `ICON_PRESETS` supplying ids and reset behavior intact.
- [x] `LivePreviewView` uses `prepareStoryProps` as its only preparation path and warns on
      unexpected keys without suppressing the preview.
- [x] Missing/both-arm stories show a visible configuration message; neither arm is silently
      preferred.
- [x] The React arm uses a keyed `EditorErrorBoundary` and `mountReactHandle`; `Panel` and `Text`
      continue to render through that compatibility island.
- [x] The vanilla arm constructs, mounts, updates, disposes, and detaches synchronously under
      caller-owned error handling, without remounting on ordinary prop edits.
- [x] Story changes dispose/detach outgoing native views before mounting incoming views, including
      floating-layer cleanup; measuring roots remain real boxes.
- [x] `iconPresets.ts` has no JSX/React import, and `storyTypes.ts` has only type-level React
      imports needed by the surviving component arm.
- [x] No `uikit/` prop is widened; no story, UIKit React face, `story-props.ts`, dashboard, or epic
      file is changed.
- [ ] Live Storybook sidebar verification remains to be run by the user in the running app.
- [x] `npm run typecheck`, `npm run lint`, and `npm run build-prod` pass.

## Verification Results

- Source audit passed: all six editor files are native `.ts` views/data, the shell composes
  existing UIKit views, the browser keeps its virtualized `rowHeight: 26` contract, and the
  property panel keeps all five control types and preset ids.
- Source audit passed: `LivePreviewView` calls `prepareStoryProps` directly, warns and continues
  for unexpected keys, keys the React boundary by `story.id`, preserves centered geometry, and
  disposes/detaches native views before replacement. No `DocumentFragment` is introduced as a
  slot value and no `uikit/` prop is widened.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run build-prod` — passed. The build emitted the repository's existing chunk-size and
  ineffective-dynamic-import warnings; it completed successfully.
- Live verification was not run in this session. The page must be opened through the sidebar
  Storybook tool (`tools-editors-registry.ts:170-175` → `PagesLifecycleModel:792`); direct
  `app.pages.addEditorPage("storybook-view")` remains refused and no scripting facade exists.

## Files Changed Summary

| File | Change |
|---|---|
| `doc/tasks/US-1127-storybook-editor-native/README.md` | Task plan, resolved concerns, app reachability, and verification record. |
| `src/renderer/editors/storybook/StorybookEditorView.ts` | New native editor shell replacing the `.tsx` view. |
| `src/renderer/editors/storybook/PropertyEditor.ts` | Native property panel and control-row views replacing React JSX. |
| `src/renderer/editors/storybook/LivePreview.ts` | Native preview lifecycle, React compatibility island, and vanilla error handling. |
| `src/renderer/editors/storybook/ComponentBrowser.ts` | Native virtualized story browser preserving row settings. |
| `src/renderer/editors/storybook/index.ts` | Register `View` instead of `Component`. |
| `src/renderer/editors/storybook/iconPresets.ts` | Extension-only rename; data and resolution unchanged. |
| `src/renderer/editors/storybook/storyTypes.ts` | Type-only React imports reduced to the surviving component arm. |
| `src/renderer/editors/register-editors.ts` | Touch dynamic importer after the editor index rename. |
| `src/renderer/editors/storybook/StorybookEditorView.tsx` | Removed by rename. |
| `src/renderer/editors/storybook/PropertyEditor.tsx` | Removed by rename. |
| `src/renderer/editors/storybook/LivePreview.tsx` | Removed by rename. |
| `src/renderer/editors/storybook/ComponentBrowser.tsx` | Removed by rename. |
| `src/renderer/editors/storybook/index.tsx` | Removed by rename. |
| `src/renderer/editors/storybook/iconPresets.tsx` | Removed by rename. |

Files intentionally not changed: `src/renderer/editors/storybook/storyRegistry.ts`,
`src/renderer/editors/storybook/story-props.ts`, `src/renderer/editors/storybook/StorybookEditorModel.ts`,
all story files, `src/renderer/ui/app/EditorErrorBoundary.tsx`, all UIKit React faces,
`doc/active-work.md`, `doc/epics/EPIC-069.md`, tests, and verification harnesses. No `uikit/` prop
is widened.

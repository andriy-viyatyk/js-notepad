# US-1166 — Convert the `env-vars` editor body to a native VanillaView

## Goal

Convert the `env-vars` editor body from its React implementation to a framework-free native view,
while preserving namespace/profile/variable editing, validation, encryption handling, persistence,
focus behavior, and the existing editor registration. Remove the React body boundary from the
native `TextChromeView` composition, and delete the now-dead `EnvVarsBody.tsx` conversion target
without retiring or editing any UIKit `*.tsx` face.

This is the first implementation task in [EPIC-073](../../epics/EPIC-073.md), whose E15-1 closing
property requires every converted editor to retain its behavior as well as lose its React output
([EPIC-073.md:14-35](../../epics/EPIC-073.md#e15-1--the-closing-property)). The epic explicitly
assigns `env-vars` to US-1166 as the 404-line, 36-marker pattern-setting conversion
([EPIC-073.md:146-159](../../epics/EPIC-073.md#e15-5--the-cut)).

## Background

### Scope and verified current shape

The body is currently split across four files. The conversion target is the React body, which is
replaced and deleted after the native view is wired:

| File | Verified role | Decision |
|---|---|---|
| `src/renderer/editors/env-vars/EnvVarsBody.tsx` | 404-line React body with the complete namespace/profile/grid UI; its export is at `:367-404`, and `index.ts:5` is its only importer | Delete after the native replacement is wired; it is the dead non-story `.tsx` that would otherwise violate E15-1 |
| `src/renderer/editors/env-vars/index.ts` | Existing `EnvVarsEditorView extends VanillaView`; both constructor and `onUpdate` pass a boundary-wrapped React body to `TextChromeView` (`:16-47`) | Modify to own and mount the native body |
| `src/renderer/editors/env-vars/EnvVarsEditor.ts` | Editor model, state, JSON parsing/serialization, CRUD, encryption and host lifecycle (`:19-281`) | No change expected |
| `src/renderer/editors/env-vars/open-env-vars.ts` | Board-vars open helper; sends `env-vars-view` as the target (`:17-34`) | No change expected |

The body’s model state projection is explicit at `EnvVarsBody.tsx:367-375`: `data`, `status`,
`errorMessage`, `selectedNamespace`, and `selectedProfile`. Its three visible top-level states are
locked (`:378`), invalid (`:379`), and normal (`:381-401`). The model already owns all persistent
behavior: JSON parsing and status transitions (`EnvVarsEditor.ts:93-138`), debounced serialization
(`EnvVarsEditor.ts:142-152`), namespace/profile selection (`:156-177`), profile data replacement
(`:182-191`), and CRUD confirmation/state changes (`:195-258`). The native view must call those
existing methods rather than move model logic into the DOM.

### Existing native seams to use

`TextChromeViewProps.children` is a `SlotContent` and accepts a native `Node`
(`src/renderer/editors/base/TextChromeView.ts:18-24`). Its `onMount` and `onUpdate` pass that slot
through `fillSlot` (`:409-433`), so the native body root should be supplied directly; no React
element or `mountReactHandle` path is needed.

The native body must follow `VanillaView` ownership and lifecycle rules. `mount()` builds children
and is terminal on a failed mount (`src/renderer/uikit/shared/vanilla-view.ts:54-79`);
`dispose()` disposes owned children/resources but deliberately does not detach the root
(`:96-140`); `child()` claims lifetime ownership (`:171-177`); `releaseChild()` is the explicit
retirement operation (`:179-200`); `bind()` applies immediately, subscribes through the state
selector, and registers its unsubscribe through `own()` (`:202-231`). Therefore all state bindings
and DOM listeners belong in `onMount()` exactly once, never in a repeatedly-called sync method.

The existing React body uses `useComponentModel` and `useEffect` only for local view state and grid
autofocus (`EnvVarsBody.tsx:24-28`, `:71-77`, `:186-238`, `:241-261`, `:304-322`). The native
conversion should replace those hooks with view-owned fields and explicit lifecycle cleanup; it
must not add a React runtime dependency.

### Epic concerns carried into this task

- C12 requires type-only props imports from surviving UIKit `*.tsx` faces to remain valid; those
  faces are not deleted or edited in this task. The separate `EnvVarsBody.tsx` conversion target is
  deleted after `index.ts` stops importing it ([EPIC-073.md:183-188](../../epics/EPIC-073.md#e15-6--concerns)).
- C13 excludes the repository-wide `React.*` type surface from this conversion
  ([EPIC-073.md:189-193](../../epics/EPIC-073.md#e15-6--concerns)). Do not touch
  `uikit/shared/slots.ts`, `fill-slot.ts`, or any neighboring `React.CSSProperties`/React type.
- C1 requires explicit teardown; `bind()` and `listen()` have no early-release API and must be
  registered once from `onMount()` or the constructor ([EPIC-073.md:177-182]).
- C1a requires ignoring a shared registry/map entry that is not owned by this view rather than
  disposing it ([EPIC-073.md:177-182]). This conversion has no shared keyed registry: a grid
  instance received through this view’s own `DataGridView.onGrid` callback is the only live handle,
  and the callback must clear only that handle on `null`.
- C9a requires a presence proof as well as a React-absence proof. E15 explicitly does not remove
  React from the renderer; it measures roots per editor ([EPIC-073.md:220-239]).
- C14 is not this task’s change: `PopoverView`/`DialogView` retain separate native and residual
  React paths and are reserved for US-1172. Do not sweep either path into the env-vars conversion
  ([EPIC-073.md:194-199](../../epics/EPIC-073.md#e15-6--concerns)).
- C15 makes `EditorErrorBoundary.tsx` a deliberate survivor for Storybook. Removing the env-vars
  import is required, but deleting or modifying the shared boundary is out of scope
  ([EPIC-073.md:200-204](../../epics/EPIC-073.md#e15-6--concerns)).
- C16 says measured epic figures are already verified and that source reading, not a new regex, is
  the tie-breaker. This plan uses the supplied 404/36 figures and the actual source lines; no
  measurement script is added ([EPIC-073.md:205-209](../../epics/EPIC-073.md#e15-6--concerns)).
- C17 makes browser/board interactive coverage relevant before US-1172, but neither surface is
  modified here. The env-vars presence check uses the existing Settings/board-vars open routes and
  should not expand into browser or board conversion work
  ([EPIC-073.md:210-214](../../epics/EPIC-073.md#e15-6--concerns)).

### Error path

The current index imports `createElement` and `EditorErrorBoundary`, then wraps `EnvVarsBody` in
that boundary in both paths (`src/renderer/editors/env-vars/index.ts:1-5`, `:21-28`, `:37-46`).
The native replacement is the already-built owner-level failure surface, not a new React wrapper:
`AsyncEditorView` catches native view update/constructor/mount failures
(`src/renderer/ui/app/AsyncEditorView.ts:99-135`) and creates, owns, mounts, and displays
`NativeEditorErrorView` (`:148-164`). That view renders the title, `errMessage` output, and an
optional safe stack (`src/renderer/ui/app/NativeEditorErrorView.ts:9-60`). The converted env-vars
code must therefore import neither `EditorErrorBoundary` nor `EditorError`; the index supplies the
native body node and the existing native failure path remains the error surface.

## Implementation Plan

### 1. Add the native body view, then remove the dead React body

Create `src/renderer/editors/env-vars/EnvVarsBodyView.ts`. The new file should be a native editor
view with a public constructor and a stable root carrying a body-specific `data-type`; its layout
must be built with `createPanelElement` and its text with `createTextElement`. The current JSX layout
and props are the source of truth while the native view is being built:

- locked state: centered column, light explanatory text, and a primary `ButtonView` named
  `env-vars-unlock`, whose handler calls `model.host?.showEncryptionDialog(...)`
  (`EnvVarsBody.tsx:30-47`);
- invalid state: centered warning text, optional light error message, and the existing text-editor
  instruction (`:50-60`);
- normal state: row layout with the sorted namespace list and either the selected profile pane or
  the empty-namespace message (`:381-401`).

Import view classes directly from their modules, following the established native settings and
form pattern (`src/renderer/editors/settings/sections/SettingsSections.ts:221-259`,
`src/renderer/editors/mcp-inspector/ToolArgForm.ts:59-121`). Import props interfaces with
`import type` from the existing `*.tsx` faces where a view type is needed; this is the intentional
C12 compatibility pattern, not a reason to touch those faces. Import the direct DataGrid surface
(`src/renderer/uikit/DataGrid/index.ts:17-21`) and `DataGridView`/its types. Because this app view
constructs `ButtonView` and `SegmentedControlView` directly, import their styles explicitly as
required by the UIKit authoring rule (`src/renderer/uikit/CLAUDE.md:917-920`):
`../../uikit/Button/Button.css` and `../../uikit/SegmentedControl/SegmentedControl.css`.
The other direct view modules already import their own styles: `InputView` does so at
`src/renderer/uikit/Input/InputView.ts:10-14`, `IconButtonView` at
`src/renderer/uikit/IconButton/IconButtonView.ts:9-12`, `DataGridView` at
`src/renderer/uikit/DataGrid/DataGridView.ts:36-39`, and `SelectableRowView` at
`src/renderer/uikit/SelectableRow/SelectableRowView.ts:4-6`; `panel-style` and `text-style` import
their styles at `src/renderer/uikit/Panel/panel-style.ts:1-3` and
`src/renderer/uikit/Text/text-style.ts:1`.

Once the native body is wired into both `index.ts` paths and the native checks pass, delete
`src/renderer/editors/env-vars/EnvVarsBody.tsx`. The only verified importer is
`src/renderer/editors/env-vars/index.ts:5`; the UIKit face files named in C12 remain untouched.
This deletion is part of US-1166 because E15-1 requires zero non-story `.tsx` files under the five
editor directories, and US-1171 retires UIKit faces rather than this editor body
([EPIC-073.md:14-35](../../epics/EPIC-073.md#e15-1--the-closing-property)).

The rendered-face replacement matrix is fixed; use these existing twins and do not invent a new
primitive or alter a face:

| Current face and verified use | Native replacement | Native contract to preserve |
|---|---|---|
| `Panel` (15 uses across the body; examples `EnvVarsBody.tsx:32`, `:80-117`, `:324-363`, `:385-401`) | `createPanelElement` from `src/renderer/uikit/Panel/panel-style.ts` | Pass the same direction/flex/padding/gap/size props; it creates and appends a styled panel element (`panel-style.ts:349-357`). |
| `Text` (8 uses; examples `EnvVarsBody.tsx:33`, `:53-56`, `:91`, `:288`, `:360`) | `createTextElement` from `src/renderer/uikit/Text/text-style.ts` | Pass text and the same color/size/truncate props; it applies native text attributes and `textContent` (`text-style.ts:100-107`). |
| `Input` (2 uses: `EnvVarsBody.tsx:107-116`, `:333-343`) | `InputView` | Use controlled `value`, string `onChange`, native `KeyboardEvent` `onKeyDown`, and `onBlur`; `InputView` owns its field listeners and prop updates (`InputView.ts:24-68`). |
| `IconButton` (2 uses: `EnvVarsBody.tsx:93-102`, `:345-352`) | `IconButtonView` | Preserve `name`, `size`, `icon`, `title`, click propagation behavior, and callback; the view applies props and owns the click listener (`IconButtonView.ts:16-54`). |
| `Button` (1 use: `EnvVarsBody.tsx:34-45`) | `ButtonView` | Preserve primary variant, unlock icon, name, label, and callback; children are native slot content (`ButtonView.ts:33-67`). |
| `SegmentedControl` (1 use: `EnvVarsBody.tsx:327-332`) | `SegmentedControlView` | Pass `{ value, label }` items, selected `value`, and `onChange`; its native view resolves segments and updates keyed buttons (`SegmentedControlView.ts:10-45`, `:67-83`). |
| `DataGrid` (1 use: `EnvVarsBody.tsx:266-284`) | `DataGridView` | Keep the av-grid props/callbacks unchanged in meaning; the view owns the imperative instance (`DataGridView.ts:87-135`). |
| `SelectableRow` (1 use: `EnvVarsBody.tsx:83-104`) | `SelectableRowView` | Preserve selected state, `data-name`, click propagation, and native child content; the view applies those attributes and owns its slot (`SelectableRowView.ts:8-31`, `:39-54`). |

The native file may import `ButtonProps`, `IconButtonProps`, `InputProps`, and the other props types
with `import type` when constructing typed prop objects. Those imports intentionally continue to
point at the `*.tsx` faces; they must not trigger edits to the faces or to the shared React type
surface (C12/C13).

### 2. Preserve every local component’s behavior with an explicit native construct

| Current React construct | Chosen native construct | Why |
|---|---|---|
| `EnvVarsBody({ model, editorConfig })` function (`EnvVarsBody.tsx:367-404`) | `EnvVarsBodyView extends VanillaView` | It owns the one model binding, conditional top-level branch, child views, and branch teardown; a class is required for `child()`/`releaseChild()` ownership. |
| `LockedState` function (`:30-47`) | `LockedStateView extends VanillaView` | It owns a `ButtonView`; the unlock callback and exact labels remain in the view, while the parent owns the branch. |
| `ErrorState` function (`:50-60`) | `ErrorStateView extends VanillaView` | It has a stable DOM root and must update the optional message without rebuilding the surrounding body branch. |
| `NamespaceListModel` plus `NamespaceList` function (`:26-28`, `:62-119`) | `NamespaceListView extends VanillaView` with a plain `newName` field and a keyed native row list | The model contains only one transient input value; a plain field plus controlled `InputView` avoids a React state model. A `KeyedList` keeps namespace rows stable so selection/focus is not discarded on every body projection. Each row owner must dispose its `SelectableRowView` and `IconButtonView` explicitly. |
| `VarRow` type alias (`:132`) | Same local type alias in `EnvVarsBodyView.ts` | It is data, not a React component; preserve `_rowKey`, `name`, and `value` exactly for av-grid identity and serialization. |
| `VariablesGridModel` plus `VariablesGrid` function (`:171-239`, `:241-293`) | `VariablesGridView extends VanillaView` with plain fields for `rowCounter`, `appliedData`, `seedRows`, `grid`, `applyQueued`, and `warning` | This is a native stateful grid owner, not a presentational function: it owns the imperative grid, the buffered rows, the validation microtask, the warning DOM, and autofocus. Removing `TComponentModel`, `useComponentModel`, `useEffect`, and `state.use` avoids a React runtime dependency while retaining the existing buffer contract. |
| `ProfilePaneModel` plus `ProfilePane` function (`:304-365`) | `ProfilePaneView extends VanillaView` with a plain `newProfile` field | The only local state is the controlled add-profile input. The class owns the segmented control, input, delete button, and conditional grid/empty pane, so child disposal and branch replacement are explicit. |
| `EditorErrorBoundary` wrapping `EnvVarsBody` in `index.ts` (`:21-28`, `:37-46`) | Direct native body node; native failures use `NativeEditorErrorView` through `AsyncEditorView` | Once this subtree is native there is no React descendant to boundary-wrap. The already-implemented native owner path supplies the same crash title/message/stack contract; do not recreate a body-local React boundary. |

Use `KeyedList` only for a container owned by the native view and dispose each removed row view in
its `remove` callback; `KeyedList` itself detaches managed nodes and invokes callbacks
(`src/renderer/uikit/shared/keyed-list.ts:18-25`, `:43-109`, `:123-161`). Do not call
`replaceChildren` on that managed list container. `replaceChildren` is allowed only on a separate
region owned outright by the parent, consistent with the UIKit rule
(`src/renderer/uikit/CLAUDE.md:516-519`).

### 3. Map the body state subscription to `bind()` and register teardown once

Define a stable selector equivalent to the current `state.use` projection:

```ts
type EnvVarsBodyProjection = Pick<EnvVarsEditorState,
    "data" | "status" | "errorMessage" | "selectedNamespace" | "selectedProfile">;

function selectBodyProjection(state: EnvVarsEditorState): EnvVarsBodyProjection {
    return {
        data: state.data,
        status: state.status,
        errorMessage: state.errorMessage,
        selectedNamespace: state.selectedNamespace,
        selectedProfile: state.selectedProfile,
    };
}
```

In `EnvVarsBodyView.onMount()`, build the branch region, then call exactly once:

```ts
this.bind(this.model.state, selectBodyProjection, this.syncBody);
```

`bind()` immediately applies the initial projection and registers the state unsubscribe through the
view’s `own()` list (`src/renderer/uikit/shared/vanilla-view.ts:211-231`). `syncBody` must update
the active branch in place when its kind is unchanged, and use `releaseChild()` before creating a
different branch. The branch creation order is create → `this.child(view)` → append → `view.mount()`;
`child()` does not mount automatically (`vanilla-view.ts:171-177`), and disposal must not leave a
disposed branch registered. The parent editor view must never rebuild this body from `onUpdate()`:
`RenderEditorView` replaces the whole `AsyncEditorView` when the model id changes
(`src/renderer/editors/base/RenderEditorView.ts:27-36`), while `AsyncEditorView` reuses a view only
for the same constructor and `cacheKey` (`src/renderer/editors/base/AsyncEditorView.ts:104-114`)
and env-vars’ cache key is the editor type id (`RenderEditorView.ts:41-47`). If the impossible
case of a different model instance reaches the live view, throw from `index.ts:onUpdate()` rather
than silently rebuilding; `AsyncEditorView` catches view-update throws and shows its native error
surface (`AsyncEditorView.ts:109-115`).

The subscription/teardown map is:

| Existing behavior | Native binding/action | Teardown registration |
|---|---|---|
| `model.state.use` reads `data`, `status`, `errorMessage`, `selectedNamespace`, `selectedProfile` (`EnvVarsBody.tsx:367-375`) | One compound `bind()` on `EnvVarsBodyView` calls `syncBody`; state changes flow to the branch and child `update()` calls | `bind()` registers its unsubscribe through `VanillaView.own()` during `onMount()` (`vanilla-view.ts:228-230`) |
| `NamespaceListModel.state.use` reads `newName` (`EnvVarsBody.tsx:71-77`) | `NamespaceListView` stores the transient string and calls `InputView.update({ value })` from its native `onChange` handler | `InputView` is a child; its own listeners/slot cleanup are registered by `InputView.onMount()` (`InputView.ts:49-74`). |
| `ProfilePaneModel.state.use` reads `newProfile` (`EnvVarsBody.tsx:316-322`) | `ProfilePaneView` stores the transient string and updates its controlled `InputView` directly | Same child ownership and `InputView` cleanup; no repeated subscription. |
| `VariablesGridModel.state.use` reads `warning` (`EnvVarsBody.tsx:242-243`) | `VariablesGridView` updates a warning `Text`/panel directly when validation runs; hidden state is represented with the existing `hidden` counter-rule, not a new style | The grid view owns the warning DOM; its `DataGridView` child is disposed by `child()`. |
| `VariablesGridModel.effect` seeds rows when namespace/profile/data changes (`EnvVarsBody.tsx:220-238`) | `VariablesGridView` uses `createDepsGate()` over the same `[namespace, profile, data]` values, seeds sorted rows only when that gate changes, and retains `appliedData` for the existing write-back suppression; use a stable empty-record fallback so a missing profile does not manufacture a new `{}` on every sync | Register one `own()` cleanup that marks the view inactive and prevents a queued microtask from writing after disposal. Do not register this work from `onUpdate()` repeatedly. |
| `useEffect([])` focuses the grid on mount when allowed (`EnvVarsBody.tsx:245-253`) | Call `focus()` after the mounted `DataGridView` has delivered its grid, guarded by `!editorConfig.disableAutoFocus && !isFocusInSidebar()` | No timer/subscription is needed; the child grid is disposed with the parent. |

The grid’s data behavior must remain equivalent in meaning: sort object keys into `VarRow`s
(`EnvVarsBody.tsx:220-229`), use `validateRows`’s empty/duplicate-name warning (`:139-163`),
trim names in `rowsToRecord` (`:165-169`), and call
`model.setProfileData(namespace, profile, record)` only for a valid buffer (`:200-213`). Keep
the existing `DataGridView` props and callback split (`:263-284`): the two fixed columns, row key,
editable/add/delete flags, disabled filtering/sorting, 28px row height, and fit-to-width behavior.
`DataGridView` is the intended imperative owner: it creates/destroys the av-grid instance and calls
`onGrid` on mount/dispose (`src/renderer/uikit/DataGrid/DataGridView.ts:87-135`), while callback
props are kept as native trampolines (`:137-164`).

Do not carry `VariablesGridModel` into the native driver as a `TComponentModel`. Its `init()` calls
`effect()` exactly once (`EnvVarsBody.tsx:220-238`), and `createComponentModelDriver(...).mount()`
throws `"<Name> registered effects and cannot be driven by a vanilla lifecycle"` for any such
model (`src/renderer/core/state/model.ts:302-308`). The sanctioned choices are to subscribe to
state in `init()`—the pattern explicitly used by `FileDiffBodyModel` because its resolution is
subscription-driven (`src/renderer/editors/file-diff/FileDiffBodyModel.ts:71-100`)—or to use
`createDepsGate()` as the replacement for a render-driven effect
(`src/renderer/uikit/shared/deps-gate.ts:1-44`). This plan chooses plain fields plus the latter.

The React effect’s dependency trigger and its guard are separate concerns. Native `onUpdate()` has
no dependency array, so the implementation must call the deps gate with exactly `namespace`,
`profile`, and `data`, then retain `appliedData` only for the existing suppression of the state
round-trip caused by grid write-back. Define one stable empty profile record rather than using
`?? {}` at each body sync; otherwise a profile with no data creates a fresh identity and can reseed
the grid on every sync, discarding an in-progress new row. Prime the gate at the end of mount as
required by the UIKit guide (`src/renderer/uikit/CLAUDE.md:550-580`).

### 4. Replace the index composition in both paths

`src/renderer/editors/env-vars/index.ts` must stop importing `createElement`,
`EditorErrorBoundary`, and `EnvVarsBody`, and must import `EnvVarsBodyView`. Follow the shipped
native-editor shape: construct the body and chrome in `onMount()`, own both with `child()`, append
`body.root` and `chrome.root` to the outer root before mounting either, pass `body.root` as the
chrome `children` Node, then mount the body first and chrome last. This is deliberate option (a),
matching `editors/grid` and `editors/notebook` (`src/renderer/editors/grid/index.ts:226-247`,
`src/renderer/editors/notebook/index.ts:236-262`). `DataGridView.onMount()` constructs av-grid and
invokes `onGrid` (`src/renderer/uikit/DataGrid/DataGridView.ts:107-135`), so attaching the body
root before body mount gives `fitToWidth` its final DOM position; this ordering has production
evidence for av-grid inside `TextChromeView`.
The exact before → after shape is:

```ts
// Before: index.ts:1-5, 21-28 and 37-46
import { createElement } from "react";
import { EditorErrorBoundary } from "../../ui/app/EditorErrorBoundary";
import { EnvVarsBody } from "./EnvVarsBody";

children: createElement(
    EditorErrorBoundary,
    null,
    createElement(EnvVarsBody, { model }),
),
```

```ts
// After: native body is a directly-owned Node in the existing TextChrome slot
import { EnvVarsBodyView } from "./EnvVarsBodyView";

private model!: EnvVarsEditor;
private body!: EnvVarsBodyView;
private chrome!: TextChromeView;

// constructor
super(props, createContentsRoot());

// onMount
const model = requireEnvVarsModel(this.props.model);
this.model = model;
const body = this.child(new EnvVarsBodyView({ model }));
const chrome = this.child(new TextChromeView({
    model: this.props.model,
    children: body.root,
}));
this.body = body;
this.chrome = chrome;
// Attach before mount; body-first/chrome-last is the shipped grid ordering and
// keeps av-grid fitToWidth measurement in the final DOM position.
this.root.append(body.root, chrome.root);
body.mount();
chrome.mount();

// onUpdate
const model = requireEnvVarsModel(props.model);
if (model !== this.model) {
    throw new Error("Env Vars view received a different model instance.");
}
this.body.update({ model });
this.chrome.update({ model: props.model, children: this.body.root });
```

There is no `bodyMounted` flag and no model-swap rebuild path: `onMount()` is the only construction
and mounting path, and `onUpdate()` only updates the already-owned children. Add the same small
`createContentsRoot()` helper used by the shipped native editors (`src/renderer/editors/grid/index.ts:18-22`)
when the outer `display: contents` root is needed. Preserve the existing module factory and exports
at `index.ts:50-57`; only the view composition/imports change.

When a native constructor/mount/update failure reaches the application owner, the already-existing
`AsyncEditorView` path reports it through `NativeEditorErrorView` (`AsyncEditorView.ts:99-135`,
`:148-164`). Do not add a second error view ownership path in `index.ts`, and do not import either
React error component in the converted code.

### 5. Verify manually and with the project’s existing checks

There are no unit tests or test harnesses for this project. After implementation, run the existing
repository checks only: `npm run typecheck`, `npm run lint`, and `npm run build-prod`; do not create
a test file or harness. Inspect the env-vars page DOM for native `data-type` roots and confirm that
the visible env-vars editor adds no `[data-react-root]`; do not use an application-wide zero-root
claim because Storybook and other intentional React paths survive E15
([EPIC-073.md:220-239]).

## Concerns / Open questions

### Resolved decisions

1. **Only the UIKit React faces remain untouched.** `EnvVarsBody.tsx` is deleted after the native
   body is wired because it is the conversion target and its only importer is `index.ts:5`; the
   surviving `Button.tsx`, `Input.tsx`, and other UIKit faces remain available for type-only C12
   imports and are not deleted, renamed, or edited. This satisfies E15-1 without starting
   US-1171’s UIKit face retirement (`EPIC-073.md:14-35`, `:183-188`).
2. **The React type surface remains untouched.** Type-only imports such as
   `type ButtonProps`/`type InputProps` from the surviving face files are allowed and expected;
   there is no replacement of `React.*` types and no edit to `slots.ts` or `fill-slot.ts`, as
   required by C13 (`EPIC-073.md:189-193`).
3. **No new CSS or color token is planned.** Existing UIKit static CSS supplies the styles, and
   layout stays in existing Panel props. If implementation discovers a missing visual token, stop
   and record it rather than adding a literal color; the coding standard requires theme colors and
   the UIKit guide requires static, scoped CSS (`src/renderer/uikit/CLAUDE.md:124-170`,
   `:344-365`).
4. **No shared keyed resource is disposed.** The view owns its `DataGridView`, row views, and
   branch views directly. A `null` grid callback clears the view’s own handle; it must not dispose
   any unrelated object received from a registry or map. This is the C1a ownership rule
   (`EPIC-073.md:177-182`).
5. **The existing native error owner is sufficient for this conversion.** Native constructor,
   mount, and update failures are already routed to `NativeEditorErrorView` by
   `AsyncEditorView`; adding `EditorErrorBoundary` or `EditorError` would violate the cut and
   recreate the removed React path (`AsyncEditorView.ts:99-164`, `NativeEditorErrorView.ts:9-60`).
6. **Body construction follows the shipped body-first order.** Append the body root to the outer
   root before mounting, mount body first, and mount `TextChromeView` last. This matches the
   production grid/notebook shape and ensures av-grid’s `fitToWidth` setup observes its attached,
   final-position root (`src/renderer/editors/grid/index.ts:226-247`,
   `src/renderer/editors/notebook/index.ts:236-262`,
   `src/renderer/uikit/DataGrid/DataGridView.ts:107-135`).
7. **The native update path never recreates the body.** `RenderEditorView.onUpdate()` rebuilds the
   whole async editor for a changed model id, and the async cache key is the editor type id
   (`src/renderer/editors/base/RenderEditorView.ts:27-47`); therefore a different model instance
   in this live view is an invariant failure. Throw from `EnvVarsEditorView.onUpdate()` so the
   existing `AsyncEditorView` catch displays `NativeEditorErrorView`
   (`src/renderer/editors/base/AsyncEditorView.ts:109-115`).
8. **The shared slot cleanup is intentionally not tidied.** `TextChromeView.updateSlots()`
   overwrites `childrenCleanup` without calling the previous cleanup
   (`src/renderer/editors/base/TextChromeView.ts:420-421`, with only the latest cleanup invoked at
   `:437`); `fillSlot`’s generation guard makes the stale closure a no-op
   (`src/renderer/uikit/shared/fill-slot.ts:83-86`, `:146-153`). Do not change this shared code or invoke a
   cleanup this view did not create—the latter is C1a in miniature.
9. **Every editor-view update re-appends the body root by design.** The verified chain is
   `TextChromeView.onUpdate()` → unconditional `updateSlots()`/`fillSlot()`
   (`src/renderer/editors/base/TextChromeView.ts:298-306`, `:420-421`) → Node-arm
   `replaceChildren(); append(slot)` with no identity short-circuit
   (`src/renderer/uikit/shared/fill-slot.ts:126-140`) → `VanillaView.update()` always calling
   `onUpdate()` when mounted (`src/renderer/uikit/shared/vanilla-view.ts:84-93`).
   `PageContentView` subscribes to page-model and page state without selectors
   (`src/renderer/editors/base/PageContentView.ts:34-35`, `:54`), so page-state changes can reach
    the chain. This is normalization to existing grid/notebook/markdown/monaco native behavior;
    the same body-first/chrome-last mount and update shape is present in markdown and monaco
    (`src/renderer/editors/markdown/index.ts:159-190`,
    `src/renderer/editors/monaco/index.ts:18-40`). It is not a new env-vars defect; page state
    does not change per keystroke because text lives on the content host. A possible future shared
    improvement is a Node-identity short-circuit in
   `fillSlot`; it is not this task and no follow-up task is created.

### Unverified until implementation

- The source-level lifecycle and data-flow plan is verified, but the post-change visual/manual
  behavior is not yet verified because this thread explicitly forbids implementation. In
  particular, the grid’s autofocus, av-grid editing, browser focus retention for keyed namespace
  rows, encryption unlock transition, and malformed-JSON branch still require the acceptance pass.
- The requested wording says “`.env` files,” but the verified matcher accepts `*.env.json`, not a
  bare `.env` file (`src/renderer/editors/base/editor-matchers.ts:154-159`). Whether that wording is
  shorthand for the configured board-vars `.env.json` file is not independently verified; the
  acceptance procedure below uses the extension the code actually matches.
- No test harness exists or should be introduced. Manual checking and the repository’s existing
  `npm run typecheck`, `npm run lint`, and `npm run build-prod` checks are the only planned
  verification mechanisms, consistent with the task constraint.

## Acceptance Criteria

### Native cut and lifecycle

- [ ] `src/renderer/editors/env-vars/EnvVarsBodyView.ts` exists, is the native body used by the
  editor, has public `VanillaView` constructors for all class views, and contains no React runtime
  import, JSX, `useEffect`, `useComponentModel`, `EditorErrorBoundary`, or `EditorError`.
- [ ] `src/renderer/editors/env-vars/EnvVarsBody.tsx` is deleted after the native body is wired;
  `find src/renderer/editors/env-vars -name "*.tsx"` returns nothing. The UIKit `*.tsx` faces remain
  untouched; this criterion applies to the editor directory’s dead conversion target and enforces
  E15-1’s zero non-story editor-body `.tsx` closing property (`EPIC-073.md:14-35`).
- [ ] `src/renderer/editors/env-vars/index.ts` has no `createElement` or React error-boundary import;
  both its constructor and `onUpdate` paths supply the native body root as the `TextChromeView`
  `children` Node; `onMount()` appends before mounting, mounts body first and chrome last, and
  `onUpdate()` only updates the existing children, throwing on a different model instance
  (`index.ts:19-47` before the change; `TextChromeView.ts:18-24`, `:409-433`).
- [ ] The body has one `bind()` subscription installed from `onMount()` and no repeated
  `bind()`/`listen()` registration from a state-sync or render method. Every child branch, keyed row,
  `DataGridView`, input, button, and scheduled microtask has an explicit owner/cleanup path. A
  disposed body cannot let a queued grid-apply microtask update DOM or model.
- [ ] `VariablesGridView` uses `createDepsGate()` over namespace, profile, and data, primes it at
  mount, and keeps `appliedData` for write-back suppression; it does not drive the existing
  effect-registering `VariablesGridModel` through the vanilla component driver.
- [ ] No `*.tsx` face is modified, no `React.*` type surface is changed, and no changes are made to
  `src/renderer/uikit/shared/slots.ts` or `fill-slot.ts`.
- [ ] The visible env-vars page-editor adds no `[data-react-root]` under its own page-editor DOM
  after opening. Scope the query to the visible page (for example, select the page-editor element
  with a non-empty `getClientRects()` result, then query its descendants); inactive pages remain in
  the DOM and must not be included. This is an editor-local check only, not an application-wide
  zero-root claim, because the epic deliberately retains Storybook’s React arm and other
  type/runtime boundaries (`EPIC-073.md:220-239`).

### Presence: human-visible env-vars behavior

Open a real test `.env.json` file through the application as follows: configure or create the board
environment-variable storage in Settings → Board Environment Variables, then click its **Open
Environment Variables** button. The verified settings code wires that button to
`app.openRawLink(filePath, { editor: "env-vars-view" })`
(`src/renderer/editors/settings/sections/SettingsSections.ts:223-258`). Alternatively, an app
script may call `await app.boardVars.show()`; the admin API ensures storage is ready and opens the
configured file with the same editor target (`src/renderer/api/board-vars/admin-api.ts:61-72`).
The selected path must end in `.env.json`, because the editor matcher accepts that pattern and JSON
language (`src/renderer/editors/base/editor-matchers.ts:154-159`); the dynamic editor registration
is `env-vars-view` (`src/renderer/editors/register-editors.ts:160-163`).

After opening, a human must be able to see and exercise all of the following, with no React root
needed for the body:

- the sorted namespace list on the left, with selectable rows, per-row delete buttons, and an
  **+ Add namespace** input; selecting a namespace updates the profile area
  (`EnvVarsBody.tsx:79-118`, `:381-396`);
- profile tabs, **+ Add profile**, and conditional delete-profile control; selecting a profile shows
  the Name/Value grid (`EnvVarsBody.tsx:324-362`);
- adding, editing, and deleting grid rows; valid edits update the selected profile and eventually
  serialize to the host, while empty or duplicate names show the existing “Not saved” warning and
  do not apply invalid data (`EnvVarsBody.tsx:122-169`, `:200-213`, `:263-292`; `EnvVarsEditor.ts:142-152`);
- the empty states: “No namespaces yet — add one on the left” and “Add or select a profile to edit
  variables” when those conditions occur (`EnvVarsBody.tsx:356-401`);
- an encrypted file presents the unlock action and, after successful unlock, returns to the normal
  editor (`EnvVarsBody.tsx:30-47`; `EnvVarsEditor.ts:93-100`); malformed JSON presents the warning,
  parse message, and text-editor instruction (`EnvVarsBody.tsx:50-60`; `EnvVarsEditor.ts:114-137`).

The human pass must also switch away from and back to the editor, change namespace/profile
selection, and close the page after an edit to confirm the existing host-backed modified/save path
still works (`EnvVarsEditor.ts:263-281`). A proof that React disappeared without this presence
pass is insufficient under C9a. In a newly created, empty profile, add a row, rename the tab, and
confirm the row survives; this exercises the stable-empty-data/deps-gate path. Focus a grid cell,
then trigger a page-state change by renaming the tab (or by editing and saving to flip the dirty
flag), and confirm the only effect is a lost focus ring: no row is lost, scroll is not reset, and
the body is not blank. This explicitly verifies the documented native slot re-append consequence.

### Checks and scope guard

- [ ] After implementation, `npm run typecheck`, `npm run lint`, and `npm run build-prod` all pass.
- [ ] No unit tests, test harnesses, fixtures, commits, or dashboard duplication are added.
- [ ] `doc/active-work.md` remains unchanged: US-1166 is already listed under EPIC-073 as unchecked
  at line 16, so no duplicate entry is permitted.

## Files Changed Summary

| File | Planned status | Scope |
|---|---|---|
| `doc/tasks/US-1166-env-vars-native/README.md` | Add | This investigation and implementation plan. |
| `src/renderer/editors/env-vars/EnvVarsBodyView.ts` | Add | Native body and native versions of the local interactive constructs; owns binding, child views, grid buffer, and teardown. |
| `src/renderer/editors/env-vars/index.ts` | Modify | Replace the boundary-wrapped React body in both constructor/update paths with the owned native body Node. |
| `src/renderer/editors/env-vars/EnvVarsBody.tsx` | Delete | The 404-line conversion target is dead once `index.ts` uses `EnvVarsBodyView`; deleting it is required by E15-1. This does not delete or modify any UIKit face owned by US-1171. |
| `src/renderer/editors/env-vars/EnvVarsEditor.ts` | No change | Existing model/state/host persistence and CRUD API is sufficient (`:19-281`). |
| `src/renderer/editors/env-vars/open-env-vars.ts` | No change | Existing configured-file open target is correct (`:17-34`). |
| `src/renderer/ui/app/NativeEditorErrorView.ts` | No change | EPIC-072 native error surface already exists and is consumed by `AsyncEditorView` (`:9-60`). |
| `src/renderer/uikit/**` faces, `shared/slots.ts`, `shared/fill-slot.ts` | No change | Use existing native twins and leave every `*.tsx` face/type surface intact. |
| `doc/active-work.md` | No change | US-1166 is already present under EPIC-073 as `[ ]` (`:11-23`). |
| Tests/harnesses and commits | None | Explicitly forbidden by project/task instructions. |

---

## Verification record (2026-08-27)

**Gates:** `npm run typecheck`, `npm run lint`, `npm run build-prod` — all pass.

**Scope:** 3 files — added `EnvVarsBodyView.ts` (763 lines), modified `index.ts` (50 lines changed),
deleted `EnvVarsBody.tsx` (404 lines). Nothing else touched; no UIKit face, no `React.*` type
surface, no `slots.ts`/`fill-slot.ts`, no `TextChromeView`.

**Measured:** JSX markers **403 → 367** (exactly env-vars' 36), `editors/` **385 → 349**, non-story
`.tsx` 48 → 47. `find src/renderer/editors/env-vars -name "*.tsx"` returns nothing.
`grep -n "react\|React\|useEffect\|useComponentModel\|EditorError" EnvVarsBodyView.ts` → no matches.

**Review points confirmed in the implementation:** `createDepsGate()` primed and tested over
`[namespace, profile, data]` (`:308`, `:355`, `:383`); the `live` flag set in `onMount` with an
`own()` cleanup and checked inside the grid-apply microtask (`:331-333`, `:440`); the stable
`EMPTY_PROFILE_DATA` record (`:50`, `:657`); the throw on an unexpected model instance
(`index.ts:40`). `index.ts` follows the shipped `editors/grid` shape — build in `onMount`, append
both roots, **body first, chrome last**.

**Live pass, after a cold dev-server restart** (a `.tsx`→`.ts` change behind a dynamic import cannot
be cleared by HMR — E11). All DOM queries scoped to the **visible** page editor; 2 page editors were
in the DOM and 1 visible, so the EPIC-072 "first match vs visible match" trap was live and avoided.

| Check | Result |
|---|---|
| React roots inside the visible env-vars editor | **0** |
| React roots app-wide | **1** (`GlobalStyles`, expected) |
| Editor size (the `fitToWidth`/0×0 hazard) | 1507×997 |
| Namespace list renders both fixture namespaces | 2 rows |
| Add-namespace / add-profile inputs, profile tabs | present |
| Grid renders real values | `API_URL https://dev.example.test`, `TIMEOUT 3000` |
| **Selecting namespace 2 re-seeds the grid** (the `createDepsGate` path) | grid switched to `REPORT_DIR C:/tmp/reports` |
| **Switch away to another page and back** (the slot re-append consequence) | body restored, 2 rows, selection preserved, 0 roots |
| **Malformed JSON branch** | shows "This file isn't valid Environment Variables JSON.", the parse message (`Expected ',' or '}' … position 35`), the "+ switcher" instruction, no grid, 0 roots |

**Not verified — stated as unverified rather than replaced with a different measurement (C9a):**

- **Grid cell editing, adding and deleting rows**, and therefore the `validateRows` empty/duplicate
  warning and the `setProfileData` write-back. av-grid editing needs real keyboard interaction that
  the available instrument cannot drive.
- **The F5 check specifically**: add a row to a brand-new empty profile, then trigger a page-state
  change, and confirm the row survives. This is the case the stable `EMPTY_PROFILE_DATA` record
  exists for, and it is the one most worth a human minute.
- **Mount-time autofocus.** Measured only *after* a tab-switch cycle, where focus was inside the
  editor but not inside the grid — not a clean first-mount test, so it proves nothing either way.
- **The encrypted/locked branch** — needs an encrypted `.env.json`.
- **Save/persistence round-trip** to the host after an edit.

Fixtures used live in the session scratchpad (`e15-test.env.json`, `e15-broken.env.json`,
`e15-other.json`); three scratch pages were left open in the running app.

# US-1106: Native views for the React-body editors

## Goal

Convert `env-vars`, `rest-client`, `monaco`, and `file-diff` from
`EditorModule.Component` to `EditorModule.View`, while leaving their React bodies
intact. Each native index must compose `TextChromeView` and mount the existing
React content through the established slot contract, preserving the public
exports, toolbar placement, `data-name` output, error containment, and Monaco's
selection-state channel.

This is the eighth task in [EPIC-067](../../epics/EPIC-067.md), after the native
`TextChromeView` work. Converting `EnvVarsBody.tsx`, `RestClientBody.tsx`,
`MonacoBody.tsx`, `FileDiffBody.tsx`, or `RevisionPicker.tsx` is explicitly out
of scope under EPIC-067 §E9-7.

## Background

### Verified current shape

The four registration files are exactly the sizes recorded by the epic:

| Editor | Current file | Lines | Current registration | React content owned by the index |
|---|---|---:|---|---|
| Env Vars (`env-vars-view`) | `src/renderer/editors/env-vars/index.tsx` | 24 | `Component: EnvVarsEditorView` | `EnvVarsBody` in the `TextChrome` children slot |
| Rest Client (`rest-client`) | `src/renderer/editors/rest-client/index.tsx` | 24 | `Component: RestClientEditorView` | `RestClientBody` in the `TextChrome` children slot |
| Monaco (`monaco`) | `src/renderer/editors/monaco/index.tsx` | 27 | `Component: MonacoEditorView` | `MonacoBody` in the `TextChrome` children slot |
| File Diff (`file-diff`) | `src/renderer/editors/file-diff/index.tsx` | 43 | `Component: FileDiffEditorView` | `FileDiffBody` in the children slot and `RevisionPicker` through `FileDiffToolbarBits` in the toolbar slot |

All four indexes currently import `TComponentState`, the concrete editor and
default state, the React body, `TextChrome`, and the generic `EditorModule` /
`EditorModel` types. Only `file-diff/index.tsx` has an editor-specific toolbar
helper. The other three indexes have no toolbar-contribution helper and no
render-time state read of their own.

The native index is an owner/composer, not a rewritten body. It should own one
`TextChromeView`, attach its root, and mount it. The body element remains a React
element supplied to `TextChromeView`.

### The exact existing React-mount mechanism

The codebase already has the required seam; no new native-to-React path is
needed:

1. `src/renderer/editors/base/TextChromeView.ts:18-24` declares
   `TextChromeViewProps.children`, `toolbarContributions`, and
   `rightToolbarContributions` as `SlotContent` (which is imported from
   `src/renderer/uikit/shared/fill-slot.ts`).
2. `TextChromeView.onMount()` passes the children slot to
   `fillSlot(childrenHost, this.props.children)` at
   `src/renderer/editors/base/TextChromeView.ts:409-417`. The toolbar and right
   contribution slots use the same mechanism.
3. `src/renderer/uikit/shared/fill-slot.ts:5` defines
   `SlotContent = string | Node | React.ReactNode`. Its `needsReactRoot()` arm
   at `:39-50` recognizes a React element, wraps it in a Fragment, and
   `fillSlot()` mounts it through `mountReactHandle` at `:83-122`. The React
   container receives `data-part="react-slot"` and `data-react-root` through
   `mountReactHandle`.
4. `src/renderer/uikit/shared/mount.tsx:115-119` exposes `mountReact`, and
   `:131-158` exposes the retained-root `mountReactHandle`. Both require a
   caller-owned `HTMLElement`. `TextChromeView` already owns the slot hosts,
   their ordering, replacement, and cleanup, so calling `mountReact` directly
   from an index would duplicate that ownership and bypass the existing slot
   update path.

Therefore the implementation should hand a boundary-wrapped React element to
`TextChromeView.children`. For `file-diff`, the boundary-wrapped
`FileDiffToolbarBits` element must be handed to
`TextChromeView.toolbarContributions` as well. Calling `fillSlot` directly from
the index is also wrong: the native chrome owns those slot hosts and the
`fillSlot` contract says callers must not pre-clean or write around them.

The relevant before/after shape is:

```tsx
// Before: the outer React root owns TextChrome, the body, and file-diff's picker.
function MonacoEditorView({ model }: { model: EditorModel }) {
    return (
        <TextChrome model={model}>
            <MonacoBody model={model as MonacoEditor} />
        </TextChrome>
    );
}

export const monacoModule: EditorModule = {
    createEditor: () => new MonacoEditor(/* default state */),
    Component: MonacoEditorView,
};

// After: the native owner supplies the existing React element to TextChromeView.
export class MonacoEditorView extends VanillaView<{ model: EditorModel }> {
    // Own TextChromeView; its children slot owns the boundary-wrapped MonacoBody.
}

export const monacoModule: EditorModule = {
    createEditor: () => new MonacoEditor(/* default state */),
    View: MonacoEditorView,
};
```

Use `React.createElement` (or the named `createElement` import) because the file
becomes `index.ts`, not JSX. The body element should be equivalent to:

```ts
createElement(
    EditorErrorBoundary,
    null,
    createElement(MonacoBody, { model: editor }),
)
```

For `file-diff`, pass the same kind of boundary around both
`FileDiffBody` and `FileDiffToolbarBits`; the latter owns the two unchanged
`RevisionPicker` instances.

### Error-boundary finding: the boundary does not follow `View`

`src/renderer/ui/app/AsyncEditorView.ts:98-147` has two materially different
arms:

- The `module.View` arm constructs, appends, and calls `view.mount()` inside a
  `try`/`catch` at `:102-135`, reporting failures with `showVanillaError()`.
- The fallback React arm creates `EditorErrorBoundary` at `:140-144` and passes
  that element to `mountReactHandle()` at `:145-146`.

Once an editor moves to `View`, the outer boundary is gone. The `try`/`catch`
does cover native construction and the synchronous `VanillaView.mount()` call,
but it cannot contain a descendant React render that occurs after
`mountReactHandle(...).render(...)` returns. Without a new boundary, these four
editors silently lose the protection provided by the current `Component` arm.

`src/renderer/ui/app/EditorErrorBoundary.tsx:7-27` verifies the actual scope of
that protection: `getDerivedStateFromError()` stores the error, and
`componentDidCatch()` logs it; the fallback is rendered at `:18-27`. This is a
React render/lifecycle/descendant-constructor boundary. It does not catch errors
from event handlers, asynchronous callbacks, or native `TextChromeView`
construction. The native outer path continues to handle the latter through
`AsyncEditorView`'s `try`/`catch`.

The plan therefore places `EditorErrorBoundary` inside every React slot owned by
these native indexes:

| Editor | React element(s) that require the boundary |
|---|---|
| Env Vars | `EnvVarsBody` passed as `TextChromeView.children` |
| Rest Client | `RestClientBody` passed as `TextChromeView.children` |
| Monaco | `MonacoBody` passed as `TextChromeView.children` |
| File Diff | `FileDiffBody` passed as `children`, and `FileDiffToolbarBits` passed as `toolbarContributions`; the latter contains `RevisionPicker` |

This preserves the current containment for both the file-diff body and its
toolbar picker without converting either React subtree.

### Root arithmetic

The baseline in EPIC-067 §E9-2 measured each target at two roots: the
`Component` root and the nested text-chrome footer slot root. During the
native-chrome transition, the unchanged React caller can temporarily measure
four or five roots because each React-fed chrome seam is now visible.

After this task, the outer editor `Component` root is removed, but a React body
root remains. This is a relocation, not a disappearance. Measure one target
editor at a time with:

```js
document.querySelectorAll('[data-name="page-editor"] [data-react-root]').length
document.querySelectorAll('[data-name="page-editor"] [data-part="react-slot"][data-react-root]').length
```

The body-root floor is exactly one for every target:

| Editor | Remaining body root | Why it remains |
|---|---:|---|
| Env Vars | 1 | `EnvVarsBody` is the React element in `TextChromeView.children` |
| Rest Client | 1 | `RestClientBody` is the React element in `TextChromeView.children` |
| Monaco | 1 | `MonacoBody` is the React element in `TextChromeView.children` |
| File Diff | 1 body root plus 1 toolbar root | `FileDiffBody` is in `children`; `FileDiffToolbarBits`, which renders `RevisionPicker`, is separately in `toolbarContributions` |

The broad epic statement that “only the body has a root” is accurate for the
first three editors but not for `file-diff` as the source is currently wired.
`TextChromeView` has separate `children` and toolbar slots, and `fillSlot`
creates one React root per React-shaped slot. `RevisionPicker` is rendered by
`src/renderer/editors/file-diff/index.tsx:20-22`, not by
`FileDiffBody.tsx`; preserving its current toolbar position while obeying §E9-7
therefore necessarily leaves a second React root for file-diff. Achieving a
total of one for file-diff would require moving the picker into the body,
converting it, or introducing a cross-slot React portal/root; all three diverge
from the verified contract and the epic's non-goal. The acceptance measurement
must record `1, 1, 1, 2` total roots for env-vars, rest-client, monaco, and
file-diff respectively, while never claiming that any of them reaches zero.

Count `data-react-root`, not `data-part="react-slot"` alone. The remaining
roots belong to React subtrees that a later body-conversion effort owns.

### Index contents, exports, and consumers

#### `env-vars`

`src/renderer/editors/env-vars/index.tsx:7-14` has only the body composition;
there is no toolbar helper and no conditional index-owned value. The body keeps
these named outputs from `EnvVarsBody.tsx`:

- `env-vars-unlock` only for the locked state (`EnvVarsBody.tsx:30-47`).
- `env-vars-namespace-row` for each namespace, plus
  `env-vars-delete-namespace` for each row and `env-vars-add-namespace` in the
  normal state (`:79-118`).
- `env-vars-profile-tabs` and `env-vars-add-profile` when a namespace is
  selected; `env-vars-delete-profile` only when a profile is selected
  (`:324-353`).
- `env-vars-grid` only when a selected profile is available
  (`:356-362`, `:263-291`).
- The error state has no named element; it renders the existing explanatory
  text (`:50-60`, `:378-379`).

The public exports at `index.tsx:23-24` are
`EnvVarsEditor`, `defaultEnvVarsEditorState`, and `EnvVarsEditorState`. No
repository consumer imports these through the index; the module itself is
loaded dynamically by `src/renderer/editors/register-editors.ts:162` and the
editor class is also imported directly by existing board-vars/open flows.
The re-exports nevertheless remain public and must not be dropped.

#### `rest-client`

`src/renderer/editors/rest-client/index.tsx:10-14` has no toolbar helper and no
index-owned reactive read. `RestClientBody.tsx:10-28` subscribes to the editor
state (`data`, `error`, `selectedRequestId`, execution, response, response time,
and header validity), and `selectedRequest` at
`RestClientEditor.ts:301-304` derives from the subscribed `data` and
`selectedRequestId`. The body emits `rest-client-root` for the normal body and
`rest-empty` when there is no selected request (`RestClientBody.tsx:32-57`).
The normal branch retains the nested names from the unchanged
`RestClientShared.tsx`, `RequestBuilder.tsx`, `ResponseViewer.tsx`, and related
React components; the empty message changes only by whether
`state.data.requests.length` is zero (`:50-53`). An error renders `EditorError`
instead of the named normal root (`:28`).

The public exports at `index.tsx:23-24` are `RestClientEditor`,
`defaultRestClientEditorState`, `RestClientEditorState`, and
`RestClientQueueEvent`. The module is dynamically loaded by
`register-editors.ts:160`; `open-in-rest-client` and the content resolver use
their own direct module paths, not these index re-exports. Preserve all four.

#### `monaco`

`src/renderer/editors/monaco/index.tsx:8-12` has no toolbar helper or
index-owned reactive read. `MonacoBody.tsx:23-35` subscribes to the content
host's content, language, and encryption fields. It returns `null` when there
is no content host (`:140`); otherwise its sole named root is
`monaco-body` (`:142-157`). The Monaco host and queue behavior remain inside
the unchanged body.

The public exports at `index.tsx:25-27` are `MonacoEditor`,
`defaultMonacoEditorState`, `MonacoEditorState`, `MonacoQueueEvent`, and
`MonacoQueueRequest`. The module is dynamically loaded by
`register-editors.ts:147`. Existing direct consumers include
`src/renderer/api/pages/PagesLifecycleModel.ts` and the scripting API wrappers;
the index's re-exports must still be retained for public-module callers.

The selection channel is load-bearing:

- `MonacoEditorState.hasSelection` is declared and initialized at
  `src/renderer/editors/monaco/MonacoEditor.ts:17-30`.
- `MonacoBody.tsx:176-190` installs `setupSelectionListener()`, listens to
  `onDidChangeCursorSelection`, reads `ed.getSelection()`, and updates exactly
  `model.state.hasSelection`.
- `MonacoEditor.hasTextSelection()` reads that field at
  `MonacoEditor.ts:66-68`; the native `TextChromeView` now binds the same
  narrow state projection for the Run All button at
  `TextChromeView.ts:126-131`.

The index conversion must not edit the body, add a second listener, replace the
state field, or mount a second Monaco host. Wrapping `MonacoBody` in
`EditorErrorBoundary` preserves the listener unchanged, so the
`hasSelection` → `text-run-all-script` channel survives.

#### `file-diff`

`src/renderer/editors/file-diff/index.tsx:11-24` contains the only toolbar
helper. `FileDiffToolbarBits` subscribes narrowly to `model.state` for `from`,
`to`, and `hasStaged`, then renders the labels `From` and `→` plus two
`RevisionPicker` elements. `model.fileTree`, `model.setFrom`, and `model.setTo`
are stable model/callback inputs, not unchanneled render-time state.

The picker is rendered from the index, not from `FileDiffBody.tsx`:

```text
FileDiffEditorView
└─ TextChrome.toolbarContributions
   └─ FileDiffToolbarBits
      ├─ RevisionPicker(side="from")
      └─ RevisionPicker(side="to")
```

`RevisionPicker.tsx:35-116` remains React. It emits
`file-diff-picker-from` and `file-diff-picker-to` buttons on every toolbar
render (`:79-89`), and each matching `file-diff-picker-*-popover` only while
that picker is open (`:90-115`). Its `GitTree` data and lazy loading remain
unchanged. It is therefore in scope for the native index's React slot and
error-boundary ownership, but not in scope for conversion.

The unchanged `FileDiffBody.tsx` emits `file-diff-empty` when there is no
resolved repository/file (`:46-69`) and `file-diff-body` when the diff host is
shown (`:71-88`). It owns the Monaco diff host and its existing body-model
subscriptions. The picker is not part of that body root.

The public exports at `index.tsx:42-43` are `FileDiffEditor`,
`defaultFileDiffEditorState`, `FileDiffEditorState`, and `RevSel`. The module is
dynamically loaded by `register-editors.ts:191-200`. Direct consumers of the
underlying types include `GitDiffRevisionsSecondaryView.ts`,
`FileDiffBodyModel.ts`, and `RevisionPicker.tsx`; retain the index re-exports
regardless.

### Reactive audit and masked-defect check

The §6.1 audit was performed against the actual render paths, not inferred from
the file sizes:

| Editor | Render-time value | Existing channel | Result |
|---|---|---|---|
| Env Vars | `data`, `status`, error, selected namespace/profile; component-local draft/warning state | `EnvVarsBody` and its nested models use `state.use`; autofocus is an intentional mount-only effect | No unchanneled index/body read found |
| Rest Client | body state and derived `selectedRequest`; nested request/response state | `RestClientBody` subscribes to the source fields; nested components use their own state hooks and queue subscription | No unchanneled read found |
| Monaco | host content/language/encryption; queue events; Monaco selection | host `state.use`, queue channels, and `setupSelectionListener` | No unchanneled read; `hasSelection` is explicitly written and later bound |
| File Diff | `from`, `to`, `hasStaged`; picker open/selection state; body host/git/language/path | `FileDiffToolbarBits` uses the three-field selector; `RevisionPicker` uses React state/memos; `FileDiffBody` uses body/host state hooks | No unchanneled index/body read found |

In particular, `FileDiffEditor.fileTree` is a stable editor-owned model and the
picker's `ensureLoaded()` call is action-time, not a render-time reactive read.
The existing four masked-defect examples (`hasTextSelection`, `ProviderIcon`,
`NavPanelButton`, and ScriptPanel's library index) do not acquire a fifth
instance here. Do not replace the narrow subscriptions with whole-state
repaints.

## Implementation Plan

- [ ] Rename `src/renderer/editors/env-vars/index.tsx` to
  `src/renderer/editors/env-vars/index.ts` and replace `Component` with a
  public `View` class. Keep the `TComponentState` factory, all three public
  exports, and the exact `EnvVarsBody` element as the children slot.
- [ ] Rename `src/renderer/editors/rest-client/index.tsx` to
  `src/renderer/editors/rest-client/index.ts` and apply the same native owner
  shape. Keep the four public exports and the unchanged `RestClientBody`
  element; do not move request/response panels into the index.
- [ ] Rename `src/renderer/editors/monaco/index.tsx` to
  `src/renderer/editors/monaco/index.ts` and apply the same native owner shape.
  Preserve all five public exports and mount only the existing
  `EditorErrorBoundary(MonacoBody)` element in `TextChromeView.children`.
- [ ] Rename `src/renderer/editors/file-diff/index.tsx` to
  `src/renderer/editors/file-diff/index.ts`. Keep `FileDiffToolbarBits` as a
  React helper, pass its boundary-wrapped element to
  `TextChromeView.toolbarContributions`, and pass the boundary-wrapped
  `FileDiffBody` element to `children`. This preserves toolbar placement,
  keeps `RevisionPicker.tsx` React, and makes its separate root explicit.
- [ ] In each native owner, construct `TextChromeView` with the concrete editor
  model and the appropriate React elements, register it with `child()`, append
  its root before calling `mount()`, and use a display-contents owner root if
  needed. Do not add a layout wrapper or a second body implementation.
- [ ] Import the React element factory and `EditorErrorBoundary` only as needed
  for the remaining React islands. Remove JSX, the `TextChrome` face, and the
  `Component` registration from all four indexes; the native files may still
  contain React element construction because their bodies remain React.
- [ ] Keep all existing body and picker `name` values and conditional branches
  unchanged. Verify the two file-diff picker buttons and their open popovers in
  the toolbar, rather than accidentally treating `RevisionPicker` as body
  content.
- [ ] Preserve every public re-export listed above. Re-run the repository-wide
  consumer search after the rename; the dynamic module loaders in
  `src/renderer/editors/register-editors.ts` must remain unchanged.
- [ ] Verify that no implementation touches `MonacoBody.tsx` lines 176-190,
  `MonacoEditorState.hasSelection`, or `TextChromeView`'s existing selection
  binding. The Run All button must still appear/disappear from the same state
  channel.
- [ ] Run `npm run typecheck`, `npm run lint`, and `npm run build-prod`. After
  the `.tsx` → `.ts` rename, cold-reload if Vite retains a stale dynamic import
  specifier. Add no unit tests or test harnesses.
- [ ] With one target open at a time, run the root queries from the Root
  arithmetic section and record the honest result: one body root for each,
  with a second toolbar contribution root for file-diff. Also verify the
  corresponding `data-part="react-slot"[data-react-root]` count and the named
  conditional outputs.

## Concerns

1. **React error containment is the highest-risk behavior.** The `View` arm's
   `try`/`catch` does not replace `EditorErrorBoundary`. Every React slot this
   task creates must receive a boundary-wrapped element; otherwise a descendant
   render failure escapes the protection while all static checks still pass.
   File Diff needs two boundary instances because its body and toolbar are
   separate React-shaped slots.

2. **File Diff has an unavoidable second React slot root under the verified
   contract.** `RevisionPicker` is rendered by the index's toolbar helper, and
   `TextChromeView` fills toolbar and body slots independently. The body-root
   result is one, but the total `data-react-root` result is two for file-diff.
   Do not “fix” this measurement by moving the picker into the body,
   converting it, or adding a portal path; those would violate the source
   contract or §E9-7. Report this exception plainly.

3. **The `hasSelection` channel must not be recreated.** `MonacoBody` owns the
   only Monaco selection listener and writes `MonacoEditor.state.hasSelection`.
   The native chrome consumes that field. A body rewrite, second listener, or
   direct `hasTextSelection()` repaint would risk reintroducing the masked Run
   All defect.

4. **Slot ownership belongs to `TextChromeView`.** Pass React elements as
   `SlotContent`; do not call `mountReact`, call `fillSlot` directly, pre-clean
   a slot, or write around a slot host. `fillSlot` owns React-root reuse and
   deferred release.

5. **The remaining React body is intentional.** These four index files become
   native owners, but their body behavior, hooks, Monaco hosts, request panels,
   diff model, picker, and body data names remain in their existing files. The
   task removes the outer Component root and the shared React chrome contract;
   it does not convert body implementations.

There are no unresolved implementation choices after the source audit. The
mount path, boundary placement, public exports, data-name conditions, Monaco
channel, and file-diff root exception are resolved above.

## Acceptance Criteria

- [ ] `env-vars`, `rest-client`, `monaco`, and `file-diff` each rename
  `index.tsx` to `index.ts` and register `View`, not `Component`.
- [ ] Each native index owns and mounts `TextChromeView`; no index renders the
  `TextChrome` React face or rewrites its body.
- [ ] React body elements are handed to `TextChromeView.children` as
  `SlotContent` and are wrapped in `EditorErrorBoundary`.
- [ ] File Diff passes a separately boundary-wrapped `FileDiffToolbarBits`
  element through `toolbarContributions`; `RevisionPicker` remains React,
  remains in the toolbar, and retains both picker button names and conditional
  popover names.
- [ ] The error behavior is explicit: `AsyncEditorView` catches native
  construction/mount failures, while `EditorErrorBoundary` catches descendant
  React render/lifecycle failures. No claim is made that it catches event or
  asynchronous callback errors.
- [ ] All public re-exports remain available: Env Vars (3), Rest Client (4),
  Monaco (5), and File Diff (4), with the dynamic registration imports
  unchanged.
- [ ] All body and picker `data-name` values and conditional cases listed in
  this document remain unchanged. No public name is added to a native owner
  wrapper.
- [ ] No new §6.1 masked defect is introduced or left uninvestigated; every
  render-time reactive value has the existing subscription described in the
  audit table.
- [ ] `MonacoBody.tsx:176-190` and `MonacoEditorState.hasSelection` remain
  unchanged in behavior, and the Run All button continues to bind to that
  state field.
- [ ] Root measurement uses
  `document.querySelectorAll('[data-name="page-editor"] [data-react-root]')`:
  the body-root floor is 1 for all four; total expected roots are 1 for
  env-vars, 1 for rest-client, 1 for monaco, and 2 for file-diff because of
  its separate React toolbar contribution. None is reported as zero.
- [ ] `npm run typecheck`, `npm run lint`, and `npm run build-prod` pass. No
  tests or harnesses are added, no implementation body is converted, and no
  commit is created.

### Files that need NO changes

- `src/renderer/editors/env-vars/EnvVarsBody.tsx`
- `src/renderer/editors/env-vars/EnvVarsEditor.ts`
- `src/renderer/editors/rest-client/RestClientBody.tsx`
- `src/renderer/editors/rest-client/RestClientEditor.ts`
- `src/renderer/editors/rest-client/RestClientShared.tsx`
- `src/renderer/editors/rest-client/RequestBuilder.tsx`
- `src/renderer/editors/rest-client/ResponseViewer.tsx`
- `src/renderer/editors/rest-client/KeyValueEditor.tsx`
- `src/renderer/editors/monaco/MonacoBody.tsx`
- `src/renderer/editors/monaco/MonacoEditor.ts`
- `src/renderer/editors/file-diff/FileDiffBody.tsx`
- `src/renderer/editors/file-diff/FileDiffBodyModel.ts`
- `src/renderer/editors/file-diff/FileDiffEditor.ts`
- `src/renderer/editors/file-diff/RevisionPicker.tsx`
- `src/renderer/editors/file-diff/GitDiffRevisionsSecondaryView.ts`
- `src/renderer/editors/base/TextChromeView.ts`
- `src/renderer/editors/base/TextChrome.tsx`
- `src/renderer/editors/base/editorRegistry.ts`
- `src/renderer/ui/app/AsyncEditorView.ts`
- `src/renderer/ui/app/EditorErrorBoundary.tsx`
- `src/renderer/ui/app/RenderEditorView.ts`
- `src/renderer/editors/register-editors.ts`
- `src/renderer/uikit/shared/mount.tsx`
- `src/renderer/uikit/shared/fill-slot.ts`
- `src/renderer/uikit/shared/vanilla-view.ts`
- `doc/epics/EPIC-067.md`
- `doc/active-work.md`

### Files Changed

| File | Change |
|---|---|
| `src/renderer/editors/env-vars/index.tsx` → `src/renderer/editors/env-vars/index.ts` | Native `View` owner; boundary-wrapped `EnvVarsBody`; public exports preserved |
| `src/renderer/editors/rest-client/index.tsx` → `src/renderer/editors/rest-client/index.ts` | Native `View` owner; boundary-wrapped `RestClientBody`; public exports preserved |
| `src/renderer/editors/monaco/index.tsx` → `src/renderer/editors/monaco/index.ts` | Native `View` owner; boundary-wrapped `MonacoBody`; `hasSelection` listener/state untouched; public exports preserved |
| `src/renderer/editors/file-diff/index.tsx` → `src/renderer/editors/file-diff/index.ts` | Native `View` owner; boundary-wrapped body and toolbar React islands; `RevisionPicker` placement and exports preserved |
| `doc/tasks/US-1106-react-body-editors-native/README.md` | Verified investigation, resolved mounting/error/root findings, implementation plan, concerns, and acceptance criteria |

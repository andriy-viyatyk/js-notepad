# US-1195 — Extract `DisposableStore`; give models disposal parity

Epic: [EPIC-075 — Post-De-React Epic A: core contracts](../../epics/EPIC-075.md)

## Goal

Extract the cleanup registry from `VanillaView` into
`src/renderer/core/utils/DisposableStore.ts`, then give `TModel` and `EditorModel` the same
owned-cleanup contract without changing existing view disposal behavior or existing model teardown
hooks. `own()` ships with zero model registrations in this task; converting existing manual teardown
to `own()` is US-1197's job. Remove the unused `TModel` post-construction timer and invoke the one
real `postCreate` consumer explicitly.

## Background

### Existing `VanillaView` contract

`src/renderer/uikit/shared/vanilla-view.ts` currently owns two private arrays:

- `disposers` at `:48` stores cleanup functions registered by `own()` (`:144-148`),
  `listen()` (`:181-197`), and `bind()` (`:249-269`).
- `children` at `:49` stores views claimed by `child()` (`:199-205`).

`dispose()` at `:106-142` is load-bearing. It sets `disposed` before cleanup, snapshots both
arrays at `:113-114`, clears both arrays at `:115-116`, disposes children depth-first at `:131-134`,
runs every disposer while retaining the first thrown value at `:118-129`, and runs `onDispose()` at
`:135-137` only when the view was mounted. The first error is rethrown at `:139-140` after all
cleanup has been attempted. The root is deliberately not detached (`:103-104`).

`ownReleasable()` at `:162-174` is also part of the contract: its returned handle is idempotent,
splices its own entry out of `disposers` at `:168-169`, and remains safe when `dispose()` has
already snapshot-and-cleared the list (`:150-156`). `assertActive()` at `:280-284` makes
`own()` and `child()` reject disposed views. `listen()` uses the same guard at `:187-196`, and
`bind()` rejects pre-mount use at `:254-257` before it calls `assertActive()`.

The extracted store must therefore provide both normal registration and a release handle, plus a
way for `VanillaView` to mark the disposer store closed and snapshot it before child cleanup. Name
that one operation `closeAndTake()`: a child's disposal can call a release handle belonging to its
parent, so the parent's disposer list must already be closed and cleared before any child runs
(`vanilla-view.ts:150-156`). A simple `disposers.dispose()` call after children would snapshot too
late and change the documented ordering; the view needs this close-and-take/run seam so the snapshot
and clear still happen before either cleanup category runs.

### Model lifecycle and the override hazard

`src/renderer/core/state/model.ts` currently gives `TModel` only `state` and the optional
`postCreate` property at `:32-35`; its constructor creates the state at `:36-50` and schedules
`this.postCreate?.()` with `setTimeout(..., 0)` at `:51`. There is no disposer registry.

`TComponentModel` at `:87-208` currently declares an optional `dispose?(): void` hook at `:96`.
`onUnmountInternal()` calls that hook at `:205`, then calls `onUnmount?.()` at `:206`. Several
component models override `dispose` without calling a base implementation, so replacing this hook
with a normal base method would silently skip their existing teardown. Once `TModel` has a required
`dispose(): void`, the optional declaration cannot remain as a TypeScript override; change it to a
concrete `dispose(): void` implementation that delegates to `super.dispose()`. Existing subclasses
still override the same method unchanged, and `onUnmountInternal()` must still drain the inherited
store independently after the hook so those overrides cannot skip it. This does not rename the hook
or change the forbidden `effect`, `_evaluateEffects`, `hasRegisteredEffects`, `mapProps`,
`onUnmount`, `isFirstUse`, or `oldProps` regions owned by US-1193/US-1194.

`src/renderer/editors/base/EditorModel.ts` extends `TDialogModel` at `:38-42`. Its base
`dispose()` at `:371-373` currently disposes only `queue`; `TextHostEditorModel.dispose()` at
`src/renderer/editors/base/TextHostEditorModel.ts:338-345` already calls `super.dispose()` at
`:344`. The concrete editor overrides also already call their base chain. Adding the model store to
`EditorModel.dispose()` is therefore the narrow integration point for editor-owned resources.

### Verified disposal census

The renderer-wide source census found **42 concrete classes in the `TModel` family that define
`dispose()`**. The breakdown and evidence are:

| Family | Count | Definitions |
|---|---:|---|
| Direct `TModel` subclasses | 6 | `src/renderer/api/tools/registered-tools.ts:169`; `src/renderer/api/library-service.ts:71`; `src/renderer/editors/board/custom-editor-registry.ts:155`; `src/renderer/editors/browser/browser-search-history.ts:109`; `src/renderer/editors/text/ScriptPanel.ts:90`; `src/renderer/editors/notebook/note-editor/NoteItemEditModel.ts:405` |
| `TDialogModel` subclass | 1 | `src/renderer/editors/text/TextEditorModel.ts:410` (`TextFileModel`) |
| `TComponentModel` hook overrides | 13 | `src/renderer/components/tree-provider/TreeProviderViewModel.ts:257`; `src/renderer/components/tree-provider/CategoryViewModel.ts:221`; `src/renderer/editors/file-diff/FileDiffBodyModel.ts:122`; `src/renderer/editors/settings/sections/BrowserProfilesSectionModel.ts:148`; `src/renderer/editors/settings/sections/McpSectionModel.ts:139`; `src/renderer/editors/settings/sections/SettingsSections.ts:157` (`GitIntegrationModel`); `src/renderer/uikit/Tree/TreeModel.ts:819`; `src/renderer/uikit/Select/SelectModel.ts:717`; `src/renderer/uikit/Menu/MenuModel.ts:280`; `src/renderer/uikit/PathInput/PathInputModel.ts:290`; `src/renderer/uikit/Minimap/MinimapModel.ts:203`; `src/renderer/uikit/ImageViewport/ImageViewport.ts:260`; `src/renderer/editors/markdown/CodeBlock.ts:142` (`MermaidModel`) |
| Concrete `EditorModel` descendants | 22 | `src/renderer/editors/archive/ArchiveEditor.ts:165`; `src/renderer/editors/board/BoardContentEditorModel.ts:230`; `src/renderer/editors/board/BoardEditorModel.ts:566`; `src/renderer/editors/board-info/BoardInfoEditorModel.ts:647`; `src/renderer/editors/browser/BrowserEditor.ts:92`; `src/renderer/editors/draw/DrawEditor.ts:215`; `src/renderer/editors/env-vars/EnvVarsEditor.ts:277`; `src/renderer/editors/explorer/ExplorerEditorModel.ts:273`; `src/renderer/editors/file-diff/FileDiffEditor.ts:236`; `src/renderer/editors/git-tree/GitTreeEditorModel.ts:513`; `src/renderer/editors/graph/GraphEditor.ts:223`; `src/renderer/editors/html/HtmlEditor.ts:140`; `src/renderer/editors/image/ImageEditor.ts:184`; `src/renderer/editors/link-editor/LinkEditor.ts:1114`; `src/renderer/editors/log-view/LogViewEditor.ts:471`; `src/renderer/editors/mcp-inspector/McpInspectorEditorModel.ts:839`; `src/renderer/editors/mermaid/MermaidEditor.ts:194`; `src/renderer/editors/mneme-config/MnemeConfigEditorModel.ts:556`; `src/renderer/editors/mneme-root/MnemeRootEditorModel.ts:391`; `src/renderer/editors/notebook/NotebookEditor.ts:814`; `src/renderer/editors/rest-client/RestClientEditor.ts:784`; `src/renderer/editors/video/VideoEditor.ts:359` |

There are also two shared base implementations, `EditorModel.dispose()` at
`src/renderer/editors/base/EditorModel.ts:371` and `TextHostEditorModel.dispose()` at
`src/renderer/editors/base/TextHostEditorModel.ts:338`; they are not included in the 42 concrete
count. The worktree also contains the concurrent US-1192 settings conversion: it added the
`GitIntegrationModel.dispose()` definition at `src/renderer/editors/settings/sections/SettingsSections.ts:157`.
That is included in the current count above and is not a US-1195 file change. All **22/22 concrete
editor overrides call `super.dispose()`**, with the calls evidenced at
`src/renderer/editors/archive/ArchiveEditor.ts:167`, `board/BoardContentEditorModel.ts:237`,
`board/BoardEditorModel.ts:585`, `board-info/BoardInfoEditorModel.ts:656`,
`browser/BrowserEditor.ts:100`, `draw/DrawEditor.ts:217`, `env-vars/EnvVarsEditor.ts:280`,
`explorer/ExplorerEditorModel.ts:276`, `file-diff/FileDiffEditor.ts:238`,
`git-tree/GitTreeEditorModel.ts:518`, `graph/GraphEditor.ts:227`, `html/HtmlEditor.ts:142`,
`image/ImageEditor.ts:195`, `link-editor/LinkEditor.ts:1121`, `log-view/LogViewEditor.ts:480`,
`mcp-inspector/McpInspectorEditorModel.ts:844`, `mermaid/MermaidEditor.ts:196`,
`mneme-config/MnemeConfigEditorModel.ts:564`, `mneme-root/MnemeRootEditorModel.ts:397`,
`notebook/NotebookEditor.ts:817`, `rest-client/RestClientEditor.ts:788`, and
`video/VideoEditor.ts:364`. `TextHostEditorModel` also calls `super.dispose()` at `:344`.

The other **20/42 concrete overrides do not call `super.dispose()`**: the 6 direct `TModel`
subclasses, `TextFileModel`, and the 13 `TComponentModel` hook overrides listed above. A naive
base-method replacement would therefore skip the new store in 20 classes. The resolved design is:

1. Keep the existing `TComponentModel.dispose()` hook and its current call position. Make the base
   declaration concrete and delegate to `super.dispose()` to satisfy the new required `TModel`
   method. Make `onUnmountInternal()` drain the inherited store independently after the hook (with
   cleanup/error handling that cannot suppress store draining), so all 13 existing overrides
   continue to run without requiring a `super` call.
2. Add the base-store call to the 6 direct `TModel` overrides and `TextFileModel` as the final
   existing-teardown step. This is additive: their current cleanup remains in its current order,
   and the store is drained only after it. No existing model is converted from its current manual
   teardown to `own()` in this task.
3. Add the store call to `EditorModel.dispose()` after its existing `queue.dispose()` call. The 22
   concrete editor overrides and `TextHostEditorModel` already reach that call through `super`.

This makes the required distinction explicit: **20 overrides lack a super/store call today; 7 need
an explicit base/store call because they own the public `TModel`/`TDialogModel` disposal path, while
13 are safely covered by the shared `TComponentModel.onUnmountInternal()` path.**

Plain model-like classes such as `FileSearchModel` (`src/renderer/components/file-search/FileSearchModel.ts:99,374`),
`VirtualGridModel` (`src/renderer/uikit/VirtualGrid/VirtualGridModel.ts:122,256`), and
`VirtualFlexGridModel` (`src/renderer/uikit/VirtualGrid/VirtualFlexGridModel.ts:17,82`) do not
extend `TModel`/`EditorModel` and are not part of the disposal-parity count or this task.

For completeness, a literal renderer-wide census of the other model-like/plain classes with
`dispose()` adds **15 excluded classes** (so 56 model-like classes have a disposal method in total):
`src/renderer/api/pages/PageModel.ts:55,716`; `src/renderer/components/file-search/FileSearchModel.ts:99,374`;
`src/renderer/components/git-tree/GitTreeModel.ts:58,220`; `src/renderer/components/git-tree/GitChangesModel.ts:40,157`;
`src/renderer/components/git-tree/GitBranchesModel.ts:50,198`; `src/renderer/editors/browser/BrowserBookmarksUIModel.ts:33,49`;
`src/renderer/editors/browser/BrowserTabsModel.ts:18,224`; `src/renderer/editors/browser/BrowserTorModel.ts:10,92`;
`src/renderer/editors/graph/GraphTooltipModel.ts:20,85`; `src/renderer/editors/notebook/NoteItemViewModel.ts:41,79`;
`src/renderer/editors/text/TextFileIOModel.ts:17,369`; `src/renderer/ui/secondary-views/SecondaryViewsModel.ts:28,49`;
`src/renderer/uikit/Tree/TreeDndModel.ts:7,129`; `src/renderer/uikit/VirtualGrid/VirtualGridModel.ts:122,256`;
and `src/renderer/uikit/VirtualGrid/VirtualFlexGridModel.ts:17,82`. They are plain classes or
composition helpers, not instances of the `TModel`/`EditorModel` contract being introduced here.

### Verified `postCreate` census

Renderer-wide `rg` found exactly these definitions:

- `src/renderer/core/state/model.ts:34` — the optional `TModel.postCreate` contract.
- `src/renderer/ui/dialogs/TorInfoDialog.ts:23-25` — the only concrete assignment, which starts
  `load()`.

The only current invocation is `src/renderer/core/state/model.ts:51`, the constructor's
`setTimeout(() => this.postCreate?.(), 0)`. No other `postCreate` definitions or call sites exist
under `src/renderer`. The replacement call belongs in
`src/renderer/ui/dialogs/TorInfoDialog.ts` immediately after `showDialog(...)` is invoked (the
`showDialog` function synchronously installs the model into `dialogsState` at
`src/renderer/ui/dialogs/DialogsView.ts:134-142`). The call deliberately removes the timer's
next-turn deferral; `load()` still yields at its IPC await and the view remains registered before
the request begins.

## Implementation Plan

### 1. Add the shared disposable store

Create `src/renderer/core/utils/DisposableStore.ts` with a small renderer-independent
`DisposableStore`:

- Use the project-wide cleanup shape `() => void`.
- `add(cleanup)` must append an idempotent release wrapper and return that wrapper. Calling the
  returned handle removes itself from the live list before running the cleanup, exactly matching
  `VanillaView.ownReleasable()`'s splice behavior.
- `dispose()` must be idempotent, mark the store closed before work, snapshot and clear the list
  before invoking any cleanup, attempt every cleanup, and rethrow the first thrown value after the
  complete snapshot has run.
- Expose `closeAndTake()` for `VanillaView`, so the owner can close and snapshot the store before
  running a different cleanup phase. Document that a child's disposal can call a release handle
  belonging to the parent, which is why the parent's list must already be closed and cleared before
  any child runs; this seam preserves child-before-disposer ordering and is not an invitation to
  run disposers early.
- Reject registration after the store is closed. `TModel.own()` and `VanillaView.own()` must retain
  their existing disposed-object error behavior through their existing active checks.

Do not add a barrel export unless an implementation needs one; direct imports keep the core utility
layer dependency direction explicit.

### 2. Move `VanillaView`'s disposer mechanics without changing behavior

Modify `src/renderer/uikit/shared/vanilla-view.ts` only in the disposer field, `dispose()`,
`own()`, and `ownReleasable()` regions:

Before:

```ts
private readonly disposers: Cleanup[] = [];
private readonly children: IOwnedView[] = [];

// dispose():
const children = this.children.slice();
const disposers = this.disposers.slice();
this.children.length = 0;
this.disposers.length = 0;
children.forEach((child) => runCleanup(() => child.dispose()));
disposers.forEach(runCleanup);
```

After (shape; retain the existing `runCleanup` first-error accumulator):

```ts
private readonly disposers = new DisposableStore();
private readonly children: IOwnedView[] = [];

// dispose(): snapshot/close the store before any child cleanup, then run the
// returned cleanup snapshot after children and before onDispose().
const children = this.children.slice();
this.children.length = 0;
const disposers = this.disposers.closeAndTake();
children.forEach((child) => runCleanup(() => child.dispose()));
disposers.forEach(runCleanup);
```

`own()` continues to return `void` and still calls `assertActive()` before registration. The private
`ownReleasable()` continues to call `assertActive()` and returns the store's release handle. Keep
`children` independent of the store so child disposal remains depth-first and child errors remain
ordered ahead of disposer errors. Keep `onDispose()` last and mounted-only, keep root detachment out
of `dispose()`, and leave `listen()`, `child()`, `releaseChild()`, `bind()`, and `assertActive()`
behavior unchanged apart from their disposer storage target.

### 3. Give `TModel` owned cleanup and remove the timer

Modify `src/renderer/core/state/model.ts` in only these regions: the imports, the `TModel` class
(`:32-53`), and the existing disposal call site inside `TComponentModel.onUnmountInternal()`
(`:197-208`). Do not edit the effect runtime, `memo()`/`IMemo`, props-pump fields, `onUnmount`,
`isFirstUse`, or `oldProps` regions.

Before:

```ts
export class TModel<T> implements IModel<T> {
    state: IState<T>;
    postCreate?: () => void;

    constructor(...) {
        // state construction...
        setTimeout(() => this.postCreate?.(), 0);
    }
}
```

After (shape):

```ts
export class TModel<T> implements IModel<T> {
    state: IState<T>;
    postCreate?: () => void;
    private readonly disposables = new DisposableStore();

    protected own(dispose: () => void): void {
        this.disposables.add(dispose);
    }

    dispose(): void {
        this.disposables.dispose();
    }

    constructor(...) {
        // state construction only; no implicit postCreate timer
    }
}
```

`own()` must reject registration after disposal through the store's closed-state check. Preserve the
`postCreate` property for the explicit Tor dialog call; only remove the constructor timer. In
`TComponentModel`, replace the optional declaration with a concrete base method so it remains a
valid override of `TModel.dispose()` while preserving the same overridable hook. In
`onUnmountInternal()`, preserve the existing `this.dispose()` hook and `onUnmount?.()` ordering, but
add the inherited store drain independently so a subclass hook that omits `super` cannot strand
owned resources. Use `try`/`finally` only: the store must drain even when the hook throws, while the
hook's error remains unhandled and `onUnmount?.()` remains skipped on that throw exactly as today.
Do not add a catch, aggregate errors, or reorder `onUnmount`.

Before:

```ts
dispose?(): void;

// onUnmountInternal()
this.dispose?.();
this.onUnmount?.();
```

After (shape):

```ts
dispose(): void {
    super.dispose();
}

// onUnmountInternal(): invoke the hook, then independently drain the
// inherited store so an overriding hook need not call super.
try {
    this.dispose();
} finally {
    super.dispose();
}
this.onUnmount?.();
```

Add the base/store teardown as the final statement in these seven existing overrides, preserving
all existing teardown code and order. Put the following short comment immediately before each call
so the additive call is not mistaken for dead code:

```ts
// Drain the model's DisposableStore after existing teardown.
```

- `src/renderer/api/tools/registered-tools.ts:169-172`
- `src/renderer/api/library-service.ts:71-75`
- `src/renderer/editors/board/custom-editor-registry.ts:155-158`
- `src/renderer/editors/browser/browser-search-history.ts:109-111`
- `src/renderer/editors/text/ScriptPanel.ts:90-94`
- `src/renderer/editors/notebook/note-editor/NoteItemEditModel.ts:405-407`
- `src/renderer/editors/text/TextEditorModel.ts:410-415`

For synchronous overrides, append `super.dispose()` inside the existing body after the existing
cleanup, preserving class-field arrow form where it exists. For the async `TextFileModel.dispose()`,
put the same comment before `await super.dispose()` after its existing cache deletion. Do not replace
any of these manual teardowns with `own()` in US-1195: `own()` has zero registrations in this task,
and converting existing manual teardown is US-1197's job; these calls only keep future registrations
from being skipped by an override.

### 4. Integrate `EditorModel` while preserving the editor chain

Modify `src/renderer/editors/base/EditorModel.ts:364-373`:

Before:

```ts
async dispose(): Promise<void> {
    this.queue.dispose();
}
```

After:

```ts
async dispose(): Promise<void> {
    this.queue.dispose();
    super.dispose();
}
```

Keep `queue.dispose()` first so current queue behavior is unchanged. Do not alter the existing
`TextHostEditorModel.dispose()` chain at `src/renderer/editors/base/TextHostEditorModel.ts:338-345`
or any concrete editor override that already calls `super.dispose()`; their call positions are not
to be normalized by this task.

### 5. Replace the implicit `postCreate` use

Modify `src/renderer/ui/dialogs/TorInfoDialog.ts:94-107`:

Before:

```ts
return showDialog({
    viewId: torInfoDialogId,
    model,
}) as Promise<void>;
```

After:

```ts
const result = showDialog({
    viewId: torInfoDialogId,
    model,
});
model.postCreate?.();
return result as Promise<void>;
```

The call must be after `showDialog(...)` has synchronously registered the model, and there must be
no remaining `setTimeout(...postCreate...)` call. Do not add a second call in the view; the view's
existing `model.disposeView` registration at `src/renderer/ui/dialogs/TorInfoDialogView.ts:164`
remains the teardown boundary for the in-flight load guard.

## Concerns

### Resolved: snapshot timing and error ordering

A store that simply runs its own `dispose()` after children would snapshot after child cleanup and
could change the behavior explicitly documented in `VanillaView`. The plan requires the named
`closeAndTake()` seam before child cleanup because a child can call a release handle belonging to
the parent; the parent's list must therefore already be closed and cleared before any child runs.
The plan then keeps the view's existing first-error accumulator around both child and disposer
phases. The store itself independently attempts all of its cleanup snapshot and rethrows its first
error when used by a model.

### Resolved: `TComponentModel.dispose` is an existing hook, not the new base implementation

The 13 `TComponentModel` overrides do not call `super`, and their current invocation is part of the
component driver lifecycle. Renaming the hook or making it the only store path would break existing
teardown. The hook remains intact as an overridable concrete method; `onUnmountInternal()` drains
the inherited store separately.
The seven direct `TModel`/`TDialogModel` overrides receive an additive final `super.dispose()` call.

The shared lifecycle must use exactly this `try`/`finally` shape:

```ts
try {
    this.dispose();
} finally {
    super.dispose();
}
this.onUnmount?.();
```

There is no catch or error aggregation: the store drains even when the hook throws, the hook's error
still propagates, and `onUnmount?.()` is still skipped on a throw exactly as today.

### Verified: class-field `dispose` overrides remain class fields

The eight renderer classes whose existing overrides use a class-field arrow are:
`src/renderer/editors/browser/browser-search-history.ts:109`,
`src/renderer/editors/text/ScriptPanel.ts:90`,
`src/renderer/editors/notebook/note-editor/NoteItemEditModel.ts:405`,
`src/renderer/components/tree-provider/CategoryViewModel.ts:221`,
`src/renderer/components/tree-provider/TreeProviderViewModel.ts:257`,
`src/renderer/uikit/Minimap/MinimapModel.ts:203`,
`src/renderer/uikit/PathInput/PathInputModel.ts:290`, and
`src/renderer/editors/markdown/CodeBlock.ts:142`. With this repository's `target: ESNext` in
`tsconfig.json:3` (so class fields use define semantics), the exact derived-field-overriding-
base-method shape was compiled, including `super.dispose()` inside the field arrow, and is accepted.
No class-field `dispose` is rewritten into a prototype method; the three direct-model additions keep
their field form, and the other five remain unchanged.

### Verified: editor super-call presence does not guarantee position

All 22 concrete editor overrides already call `super.dispose()`, but the census verified presence,
not a uniform position: `src/renderer/editors/browser/BrowserEditor.ts:100` calls it before its
cache cleanup at `src/renderer/editors/browser/BrowserEditor.ts:102-107`, while
`src/renderer/editors/board/BoardEditorModel.ts:585` calls it after its local teardown at
`src/renderer/editors/board/BoardEditorModel.ts:582-584`. Existing positions must remain unchanged. That ordering is
harmless in US-1195 only because `own()` has zero registrations; once US-1197 converts manual
teardown to `own()`, the store may drain before or after local teardown depending on the existing
override, so that later conversion must choose deliberately.

### Resolved: asynchronous editor disposal

`TModel.dispose()` is synchronous because the store owns synchronous cleanup functions. `EditorModel`
keeps its existing `Promise<void>` API and calls the synchronous base method after `queue.dispose()`;
existing async subclasses continue to `await super.dispose()`. No disposer may be an async function in
this task; asynchronous resource teardown remains in the existing model-specific methods.

### Resolved: model.ts collision surface with US-1193/US-1194

The `model.ts` change is limited to imports, `TModel`'s class/constructor, and the one existing
`TComponentModel.onUnmountInternal()` disposal seam. The effect runtime, `memo()`/`IMemo`, props
pump, `onUnmount`, `isFirstUse`, and `oldProps` are explicitly out of scope and must remain untouched
when this task is implemented alongside US-1192/US-1193/US-1194.

### Verified exclusions

No unit tests or test harnesses are to be added. `FileSearchModel`, `VirtualGridModel`,
`VirtualFlexGridModel`, browser helper models, Git component models, and other plain classes with
`dispose()` are not `TModel`/`EditorModel` subclasses and do not gain this API in this task.
`memo()`/`IMemo` remain untouched per EPIC-075 A-3. `doc/active-work.md` is explicitly outside this
task because the user will maintain the dashboard.

## Acceptance Criteria

- `src/renderer/core/utils/DisposableStore.ts` exists, is renderer-independent, uses `() => void`
  cleanup functions, supports idempotent registration release, exposes the named `closeAndTake()`
  snapshot seam, snapshots and clears before running, attempts every cleanup, and rethrows the first
  error.
- `VanillaView` uses the store while preserving all observable contracts: child disposal is
  depth-first and before disposers; children/disposers are snapshotted and cleared before cleanup;
  all cleanups run; the first error is rethrown; mounted `onDispose()` is last; unmounted
  `onDispose()` is skipped; `ownReleasable` splices an idempotent handle; registration after dispose
  throws; `bind()` still rejects pre-mount use.
- `TModel` exposes protected `own(() => void)` and public idempotent `dispose()`, and
  `EditorModel.dispose()` drains the model store after its existing queue cleanup.
- Existing `TComponentModel.dispose()` hooks still execute, including hooks that do not call
  `super`; their owned store is nevertheless drained by the shared lifecycle path.
- The 6 direct `TModel` overrides and `TextFileModel` retain their current teardown and add the
  commented final base/store teardown; the 22 concrete editor overrides continue to reach the store
  through their existing, position-preserved `super.dispose()` chain. No model has a new `own()`
  registration in this task; manual-teardown conversion belongs to US-1197.
- The `TModel` constructor no longer schedules `postCreate`; `postCreate` has exactly one explicit
  call in `src/renderer/ui/dialogs/TorInfoDialog.ts`, after `showDialog()` registration.
- No changes touch the US-1193/US-1194 regions listed above, `memo()`/`IMemo`, or
  `doc/active-work.md`.
- `npm run lint` and the project's normal type/build verification pass after implementation, and
  manual lifecycle inspection confirms the view ordering and Tor dialog load/close behavior. No unit
  test or test harness is added.

## Files Changed

| File | Planned change |
|---|---|
| `src/renderer/core/utils/DisposableStore.ts` | New shared cleanup store with release handles, snapshot/clear, error isolation, and first-error rethrow. |
| `src/renderer/uikit/shared/vanilla-view.ts` | Store-backed disposers; preserve child snapshot/order, release semantics, guards, and hook timing. |
| `src/renderer/core/state/model.ts` | Add `TModel.own()`/`dispose()`, remove the constructor timer, and drain inherited store beside the existing component hook. |
| `src/renderer/editors/base/EditorModel.ts` | Drain the inherited store after the existing `ComponentQueue` cleanup. |
| `src/renderer/api/tools/registered-tools.ts` | Add final `super.dispose()` to preserve future owned cleanup. |
| `src/renderer/api/library-service.ts` | Add final `super.dispose()` to preserve future owned cleanup. |
| `src/renderer/editors/board/custom-editor-registry.ts` | Add final `super.dispose()` to preserve future owned cleanup. |
| `src/renderer/editors/browser/browser-search-history.ts` | Add final `super.dispose()` to preserve future owned cleanup. |
| `src/renderer/editors/text/ScriptPanel.ts` | Add final `super.dispose()` to preserve future owned cleanup. |
| `src/renderer/editors/notebook/note-editor/NoteItemEditModel.ts` | Add final `super.dispose()` to preserve future owned cleanup. |
| `src/renderer/editors/text/TextEditorModel.ts` | Add final awaited base/store teardown after existing host cleanup. |
| `src/renderer/ui/dialogs/TorInfoDialog.ts` | Explicitly invoke the sole concrete `postCreate` consumer after dialog registration. |

Files that need **NO** changes:

- `src/renderer/core/utils/index.ts` — direct imports are sufficient; no barrel change is needed.
- `src/renderer/editors/base/TextHostEditorModel.ts` — its existing `super.dispose()` call already
  reaches the updated `EditorModel`.
- All 22 concrete editor files listed in the disposal census — each already calls `super.dispose()`;
  their existing teardown order stays unchanged.
- `src/renderer/ui/dialogs/TorInfoDialogView.ts` — its existing `model.disposeView` ownership guard
  remains correct.
- `src/renderer/ui/dialogs/DialogsView.ts` — its synchronous state registration is only evidence
  for the explicit-call placement.
- `src/renderer/editors/settings/sections/BrowserProfilesSectionModel.ts`,
  `src/renderer/editors/settings/sections/McpSectionModel.ts`, and
  `src/renderer/editors/settings/sections/SettingsSections.ts` — concurrently edited by US-1192;
  their component-model hooks are covered by the shared lifecycle path and must not be changed here.
- Plain model-like classes excluded in the census: `src/renderer/api/pages/PageModel.ts`,
  `src/renderer/components/file-search/FileSearchModel.ts`,
  `src/renderer/components/git-tree/GitTreeModel.ts`,
  `src/renderer/components/git-tree/GitChangesModel.ts`,
  `src/renderer/components/git-tree/GitBranchesModel.ts`,
  `src/renderer/editors/browser/BrowserBookmarksUIModel.ts`,
  `src/renderer/editors/browser/BrowserTabsModel.ts`,
  `src/renderer/editors/browser/BrowserTorModel.ts`,
  `src/renderer/editors/graph/GraphTooltipModel.ts`,
  `src/renderer/editors/notebook/NoteItemViewModel.ts`,
  `src/renderer/editors/text/TextFileIOModel.ts`,
  `src/renderer/ui/secondary-views/SecondaryViewsModel.ts`,
  `src/renderer/uikit/Tree/TreeDndModel.ts`,
  `src/renderer/uikit/VirtualGrid/VirtualGridModel.ts`, and
  `src/renderer/uikit/VirtualGrid/VirtualFlexGridModel.ts`.
- `doc/active-work.md` — explicitly maintained by the user.
- `doc/epics/EPIC-075.md` — already contains the US-1195 task entry and scope.
- `.claude/rules/task-docs.md` and `CLAUDE.md` — instructions only; neither is modified.
- No test files or test harnesses — prohibited by the epic scope.

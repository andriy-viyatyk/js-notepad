# US-1160 — Establish the native editor failure path

## Goal

Establish, from the current source, what a user sees when the native editor path
fails, including the behavior after US-1158 removes the registry's React
`Component` arm. Record the smallest safe follow-up: provide a native error
surface for any failure that currently leaves the page in a loading state or
otherwise hides the diagnostic.

This is an investigation and task document only. It deletes neither
`EditorError.tsx` nor `EditorErrorBoundary.tsx`, changes no source behavior, and
does not add a test harness or fixture.

This task is item 7 of [EPIC-072](../../epics/EPIC-072.md), and is gated on
US-1158 removing the registry's `Component` arm.

The missing rejection handler in `AsyncEditorView.load()` is a pre-existing
failure-reporting defect, not De-React work: it is reachable today whenever an
editor's registered dynamic `import()` rejects. US-1160 discovers and fixes it
because the native-only path makes the consequence universal, but the defect
must remain separately identifiable if this task is split from E14.

## Background

### Corrected C7 scope

The consumer scan was repeated against `src/renderer/`:

| File | Verified consumers | Result |
|---|---|---|
| `src/renderer/editors/base/EditorError.tsx` | `draw/DrawBody.tsx:14,125`, `graph/GraphBody.tsx:4,511`, `rest-client/RestClientBody.tsx:2,28` | All three are E15 editor bodies. `grid/GridEditor.ts:438` is only a comment. |
| `src/renderer/ui/app/EditorErrorBoundary.tsx` | `draw/index.ts`, `env-vars/index.ts`, `file-diff/index.ts`, `graph/index.ts`, `rest-client/index.ts`; `storybook/LivePreview.ts:2,178`; `ui/app/AsyncEditorView.ts:12,141` | The five editor consumers are E15; Storybook and the current React arm remain separate consumers. |

Neither `board` nor `browser` imports either file. Their removal is therefore
not part of US-1160 or E14; it would require the E15 consumers to be converted
first.

### Runtime shape before and after US-1158

Today `src/renderer/editors/base/editorRegistry.ts:302-320` still accepts both
module arms. `loadModule()` awaits the registered dynamic loader at `:307`,
then creates a `mountVanilla` React adapter at `:309-315` when a module has a
`View` but no `Component`. `src/renderer/ui/app/RenderEditorView.ts:50-59`
turns the registry result into `{ Editor, View }`.

`src/renderer/ui/app/AsyncEditorView.ts:139-146` puts only the no-`View` arm
inside `EditorErrorBoundary`. The native arm is the `module.View` branch at
`:102-136`; after US-1158, that is the only editor arm and the React boundary
branch disappears. The native error behavior below therefore describes:

- **Today:** native `View` modules already use the native branch, while React
  `Component` modules still use the boundary branch.
- **After US-1158:** every editor module reaches the native branch; the
  module-load gap becomes application-wide for editor pages.

There are two timings inside the native branch. If `moduleCache` has the module,
`load()` calls `renderEditor()` synchronously from `onMount()` at
`AsyncEditorView.ts:84-88`; constructor/mount errors are caught before the
outer mount returns. On a cold editor load, the registered dynamic import
resolves later and the success callback at `:90-95` calls `renderEditor()` in a
microtask; the native constructor/mount try/catch still handles errors there.
Only rejection of that async operation skips the callback and exposes the
loading-state gap described below.

The current React reference surface is explicit in
`src/renderer/ui/app/EditorErrorBoundary.tsx`: `getDerivedStateFromError()`
stores the error at `:10-12`, `componentDidCatch()` logs
`console.error("Editor crashed:", error, info.componentStack)` at `:14-16`,
and `render()` displays the title, message, and optional stack at `:18-25`.
The native replacement should preserve that diagnostic contract, with no React
component stack available on the native path.

## Traced failure path

### Page construction and mounting chain

The normal page path is synchronous through the outer view hierarchy:

1. `src/renderer/ui/app/PagesView.ts:11-18` constructs an
   `AppPageManagerView`, mounts it, and binds page state to
   `manager.update(...)`.
2. `src/renderer/components/page-manager/AppPageManagerView.ts:144-158`
   creates/attaches each `PageSlot`, then calls `slot.renderNative(this.root,
   pageView)` for pages that have become active.
3. `src/renderer/components/page-manager/PageSlot.ts:63-68` attaches the
   placeholder, constructs the supplied `PageContentView`, stores it as the
   native view, appends its root, and calls `view.mount()`.
4. `src/renderer/ui/app/PageContentView.ts:33-37` subscribes and calls
   `sync()`. `syncContent()` at `:117-150` constructs a `RenderEditorView`,
   appends its root, and mounts it.
5. `src/renderer/ui/app/RenderEditorView.ts:15-25` constructs an
   `AsyncEditorView`, claims it as a child, appends it, and mounts it.
6. `src/renderer/ui/app/AsyncEditorView.ts:45-50` appends the loading panel,
   mounts the spinner, and starts `load()`.

The outer classes do not add an error boundary. `PageSlot.renderNative()` is
the rollback owner for an exception escaping construction or mounting of its
supplied page view. `AppPageManagerView.reconcile()` calls it at `:153-158`
without a local catch, so an exception escaping `renderNative()` escapes
`reconcile()` and `onMount()`/`onUpdate()` (`:33-39`). Its only catches are the
cleanup aggregators in `onDispose()` (`:41-67`) and the end-of-reconcile
cleanup-error aggregator (`:101-112,202-204`); neither turns a render failure
into UI or logs it.

`VanillaView.mount()` is also a rollback boundary, but not a display boundary:
at `src/renderer/uikit/shared/vanilla-view.ts:60-77` it marks the view mounted,
calls `onMount()`, disposes a failed half-built view, and rethrows the original
error. `dispose()` at `:104-140` attempts child/resource cleanup, rethrows the
first cleanup error, and never detaches the root itself. `update()` at `:85-94`
also does not catch `onUpdate()`.

`RenderEditorView` is a transparent synchronous link in this chain. Its
constructor only constructs/claims `AsyncEditorView`
(`src/renderer/ui/app/RenderEditorView.ts:15-20`), and its `onMount()` only
appends and mounts that child (`:22-25`), so it does not catch either operation.
Its `onUpdate()` only guards disposal of the old child with
`guard("Failed to dispose editor", ...)` at `:27-37`; it does not turn
mount/update failures into an error surface. The `getEditorModule()` factory at
`:50-59` also does not catch: its validation failure at `:53` and
`editorRegistry.getModule()` rejection at `:54` reject the returned async
function.

The missing catch in `AppPageManagerView.reconcile()` is a separate, reachable
outer-lifecycle defect. A `PageContentView` construction or mount failure can
reach `AppPageManagerView.ts:157` because that call is not locally caught; the
exception then escapes `reconcile()` and the enclosing `VanillaView.mount()` or
`update()`. It can leave an attached empty slot or abort the page surface, as
traced below. It is outside US-1160 because it is not the native editor module
load/constructor/mount owner, and this task must not change
`AppPageManagerView.ts`; retain it as separate follow-up work if it needs a
user-facing outer-page error surface.

`PageSlot.renderNative()` records `attachedHere` before `attach()`
(`src/renderer/components/page-manager/PageSlot.ts:57-64`), clears
`nativeView`, disposes any constructed view, removes its root, removes the
placeholder only when it attached it itself, and rethrows at `:69-79`. In the
normal `AppPageManagerView` path, `attach()` has already run at
`AppPageManagerView.ts:144-151`, so `attachedHere` is false: an outer
construction failure leaves that slot element attached but empty before the
exception escapes. `PageSlot.dispose()` (`PageSlot.ts:83-114`) is a later
normal teardown path: it marks the slot disposed, removes the placeholder
immediately, then disposes the native view. It reports no error itself; a
native disposal error rethrows to the caller after the element has been
detached.

### Native module constructor throw

This is the constructor of `module.View`, not the already-constructed
`PageContentView` wrapper:

```text
AsyncEditorView.renderEditor(:117-120)
  new module.View({ model })
    -> throws
  catch(:125-135)
    showVanillaError(:162-175)
```

`AsyncEditorView.renderEditor()` catches the constructor exception at
`src/renderer/ui/app/AsyncEditorView.ts:119-135`. Because construction failed,
`view` is undefined, so there is no native view to dispose. It calls
`showVanillaError()`; that removes the loading panel, ensures `editorHost` is
attached, and replaces the host contents with a warning-colored text panel
containing `errMessage(error)` (`:162-175`). `errMessage()` is the shared
unknown-error formatter at `src/shared/utils.ts:9-20`.

The exception does not reach `PageSlot.renderNative()`, because
`AsyncEditorView.renderEditor()` consumes it. `VanillaView.mount()` therefore
returns normally for `AsyncEditorView`, and the page slot retains its
`PageContentView`.

### Native `onMount()` throw

The native view's `mount()` call is inside the same `renderEditor()` try block:

```text
AsyncEditorView.renderEditor(:120-124)
  view = new module.View(...)
  editorHost.append(view.root)
  view.mount()
    -> VanillaView.mount(:60-77)
       native onMount() throws
       dispose half-built view, rethrow original
  catch(:125-135)
    clear AsyncEditorView references
    guard cleanup and remove view.root
    showVanillaError(:162-175)
```

`VanillaView.mount()` catches the subclass `onMount()` exception, disposes the
half-built native view, and rethrows it (`src/renderer/uikit/shared/vanilla-view.ts:63-77`).
`AsyncEditorView` catches that rethrow at `:125-135`, clears
`vanillaView`/`vanillaViewCtor` when they still point at this instance
(`:127-130`), invokes `guard("Failed to clean up vanilla editor", ...)` at
`:131`, removes the root at `:132`, and renders the warning message. The second
dispose is harmless because `VanillaView.dispose()` is idempotent.

Again, the error does not reach `PageSlot` or `AppPageManagerView`. The slot
retains the page wrapper and shows the error panel in the editor area.

The base rollback is intentionally limited to resources registered before the
throw. `VanillaView.mount()` sets `mounted = false` before calling `dispose()`
(`vanilla-view.ts:66-73`), and `dispose()` therefore skips `onDispose()` for a
half-built view (`:131-135`). It still disposes registered children and FIFO
cleanups. `AsyncEditorView` additionally removes the failed native root at
`AsyncEditorView.ts:132`; this is why its page-level DOM outcome is recoverable
even though the base class does not run the failed view's final hook.

### Async module-load rejection after the page has mounted

This path is materially different:

```text
AsyncEditorView.onMount(:49)
  load(:82-96)
    props.getEditorModule()
      RenderEditorView.getEditorModule(:50-58)
        editorRegistry.getModule(:54)
          editorRegistry.loadModule(:302-307)
            registered dynamic import (register-editors.ts:147-180)
              rejects
    .then(success callback only)  // AsyncEditorView.ts:90
```

`load()` has no `.catch()` and does not wrap the promise in `guard()`:
`src/renderer/ui/app/AsyncEditorView.ts:82-96`. `getEditorModule()` is an
`async` function (`RenderEditorView.ts:50-59`), so a missing registry entry at
`:53`, a rejected `editorRegistry.getModule()` at `:54`, or a rejected
registered `import()` becomes a rejected promise. The success callback at
`AsyncEditorView.ts:90-95` is never entered, so `renderEditor()` and
`showVanillaError()` are never called.

The result is that the already-mounted `AsyncEditorView` keeps the loading
panel created at `:47`, including its spinner. There is no explicit
`console.error`, toast, or `guard()` for this rejection. A renderer runtime may
surface the unhandled rejection in DevTools, but the application has no
controlled diagnostic or user-facing message. No global
`unhandledrejection`/`uncaughtException` handler was found in `src/` or
`scripts/`.

The same limitation applies to arbitrary promises started by a native editor's
own `onMount()`: `VanillaView.mount()` observes only the synchronous return of
`onMount()` and cannot catch a later rejection. For example,
`src/renderer/editors/about/AboutView.ts:74-101` starts
`shell.version.runtimeVersions().then(...)` and `publishedBoards.load()` without
a catch. Those are editor-owned async operations, not `getEditorModule()`;
their rejection does not enter `AsyncEditorView` and leaves whatever DOM the
editor already built, with only the renderer's normal unhandled-rejection
reporting. The common native error view can cover the module-load promise
centrally, but it cannot infer or own every editor-specific async task; such a
task must handle its own failure if it needs task-specific UI.

## Ownership and screen state

| Failure | Catch/rethrow/log owner | Screen afterward | Tab/window behavior |
|---|---|---|---|
| `module.View` constructor throws | `AsyncEditorView.renderEditor()` catches at `:119-135`; no rethrow or explicit log. `showVanillaError()` uses `errMessage()` at `:162-175`. | Current editor area contains a warning message. No stale native editor remains: no instance was constructed. | `PageSlot.nativeView` remains the page wrapper. The tab remains in `pagesModel`; it stays selectable and closable, and switching pages remains possible. The app window remains usable. |
| Native `module.View.onMount()` throws | `VanillaView.mount()` rolls back and rethrows at `vanilla-view.ts:63-77`; `AsyncEditorView` catches at `AsyncEditorView.ts:125-135`, guarded-cleanups, removes the failed root, and shows the message. | Current editor area contains the warning message. The failed native root is removed; there is no stale previous editor because `renderEditor()` disposes an existing resource before constructing a replacement at `:117`. | Same recoverable page/tab state as the constructor case. |
| `getEditorModule()` / dynamic `import()` rejects after mount | No catch in `AsyncEditorView.load()` (`:90-95`); no `guard()`, toast, or application log. The rejection is left to the renderer's unhandled-promise reporting. | The loading panel and spinner remain. This is not an empty slot and not a blank window, but it is an indefinitely loading editor with no user-facing failure message. On a cache-key transition, `onUpdate()` has already disposed/removed the previous editor at `:57-59`; the initial-load case has no previous editor. | The page wrapper and tab remain present and selectable/closable; switching away remains possible. The app shell remains usable, but returning to the tab leaves the spinner because no failure state is stored. |

The table describes the actual editor-module failures that `AsyncEditorView`
owns. A failure in the *outer* page view itself has a worse path: `PageSlot`
rolls back and rethrows at `PageSlot.ts:69-79`, while
`AppPageManagerView.reconcile()` has no catch around the call at `:157` (its
`:202-204` rethrow is only for cleanup errors accumulated during reconciliation).
Because `PageSlot.attach()` runs first at `AppPageManagerView.ts:150`, the
usual failed page slot remains attached but empty until the manager's enclosing
mount/update path handles the escape. On initial manager mount,
`VanillaView.mount()` marks the manager disposed and rethrows, but deliberately
skips `AppPageManagerView.onDispose()` because the manager is half-mounted
(`vanilla-view.ts:66-75,131-135`). The outer `PagesView`/`MainPageView` mount
chain then receives the exception without a user-facing error surface. This
can leave a partially constructed or blank page area and is the only traced
route that can make the window's page surface effectively blank. It is not the
route taken by a native editor `module.View` constructor or `onMount()` failure
today.

## Recommendation

Add a native error view and make `AsyncEditorView` the owner of it. The owner is
the only layer that owns both asynchronous module loading and the native
constructor/mount transition, and it already centralizes the current
`showVanillaError()` behavior. The implementation should:

Decision: the native path will match the React boundary's diagnostic contract —
title “Editor crashed”, `errMessage(error)`, and the full stack when present —
and will report the original failure once with
`console.error("Editor crashed:", error)`. Message-only is not sufficient:
after US-1158 it would discard the primary diagnostic developers have for an
editor crash, and the project has no test suite to compensate. The user-facing
failure is recoverable in the current tab, so it should not become a toast;
`guard()` remains for cleanup-only failures. The rejection handler consumes the
promise after logging and rendering, so it is no longer an uncontrolled
unhandled rejection.

## Implementation plan

1. [x] Add a dependency-free `VanillaView` under `src/renderer/ui/app/` with a
   public constructor, a stable root carrying `data-type`, and raw DOM nodes
   for the exact information shown by `EditorErrorBoundary`: title “Editor
   crashed”, the `errMessage(error)`, and a stack when the caught value has a
   non-empty string `stack`. It must have no React face, async work, state
   subscriptions, timers, or child views, so the error surface cannot fail
   while reporting a failure. Reuse
   `src/renderer/ui/app/EditorErrorBoundary.css` and its existing
   `.editor-error-root`, `.error-title`, `.error-message`, and `.error-stack`
   selectors rather than creating a second stylesheet; the CSS intentionally
   outlives the React boundary that currently imports it. Do not hand-stringify
   the caught value.
2. [x] Replace `showVanillaError()`'s ad hoc panel with that native view, disposing
   and removing any prior error view before replacing it. Keep all cleanup
   guarded with the existing `guard()` convention where cleanup is intentionally
   swallowed.
3. [x] Add a rejection handler as the second argument to the `then()` in
   `AsyncEditorView.load()` (rather than a broad trailing `catch()`), so it
   handles only `getEditorModule()`/dynamic-import rejection. It must first
   execute the exact same captured-generation guard as the success callback:
   `if (!this.live || this.generation !== generation) return;`. This guard is
   non-negotiable: a slow rejection from an old editor must never overwrite a
   newer editor that has already loaded successfully. Only after the guard may
   it report the error and render the native error view. Do not cache a failed
   module.
4. [x] Keep the native constructor and `onMount()` catches in `renderEditor()`;
   route their diagnostics through the same native error view so all three
   failure cases show the same title/message/stack contract.

This is a change in `AsyncEditorView`, not `PageSlot` or
`AppPageManagerView`: `PageSlot` is correctly responsible for rollback when its
page view cannot be constructed or mounted, while `AsyncEditorView` owns the
editor module promise and is still alive when that promise rejects. Do not
delete or convert `EditorError.tsx`/`EditorErrorBoundary.tsx` in this task, and
do not reintroduce a React boundary after US-1158.

### Before → after implementation shape

Current async loader (`src/renderer/ui/app/AsyncEditorView.ts:90-95`):

```ts
void props.getEditorModule().then((module) => {
    if (!this.live || this.generation !== generation) return;
    if (props.cacheKey) moduleCache.set(props.cacheKey, module);
    this.module = module;
    this.renderEditor(module, this.props.model);
});
```

Planned shape (exact syntax may follow the repository's formatter):

```ts
void props.getEditorModule().then(
    (module) => {
        if (!this.live || this.generation !== generation) return;
        if (props.cacheKey) moduleCache.set(props.cacheKey, module);
        this.module = module;
        this.renderEditor(module, this.props.model);
    },
    (error: unknown) => {
        if (!this.live || this.generation !== generation) return;
        console.error("Editor crashed:", error);
        this.showVanillaError(error);
    },
);
```

The planned error view should preserve the current owner call site while
expanding the diagnostic from message-only to title/message/stack:

```ts
// Current: AsyncEditorView.showVanillaError(:162-175)
this.editorHost.replaceChildren(createPanelElement(/* ... */, [
    createTextElement(errMessage(error), { color: "warning", preWrap: true }),
]));

// Planned: AsyncEditorView reports the failure and delegates the complete display
// to a native view (including clear/dispose of a previous error view).
console.error("Editor crashed:", error);
this.clearErrorView();
this.errorView = this.child(new NativeEditorErrorView({ error }));
this.editorHost.replaceChildren(this.errorView.root);
this.errorView.mount();
```

The implementation must account for the existing `VanillaView` ownership rule:
retire an old error view before claiming a replacement, and remove its root
when retired. The new view must follow the authoring rules in
`src/renderer/uikit/CLAUDE.md` Rule 9: constructor-created resources are owned
immediately, `onMount()` only builds/mounts its own DOM, `dispose()` is
idempotent, and no child is claimed more than once. Since this view is
deliberately dependency-free, its DOM may be built directly with
`document.createElement`, `textContent`, and explicit `data-*`/`data-part`
attributes; runtime error data must never be interpolated into `innerHTML`.

## Concerns

### C1 — The async rejection must be generation-safe

`AsyncEditorView.onUpdate()` increments `generation` and replaces the loading
surface when `cacheKey` changes (`AsyncEditorView.ts:52-64`), while disposal
increments it through the owned cleanup at `:45-46`. The rejection handler must
use the same captured generation and `live` checks as the success callback —
literally `if (!this.live || this.generation !== generation) return;` before
logging or touching DOM. A late rejection from an editor the user already
switched away from must not replace the current editor's DOM or show a stale
error. This is a correctness requirement, not an optional cleanup guard.

### C2 — Existing native catches are not redundant

The load rejection handler covers only the promise returned by
`getEditorModule()`. Constructor, `onMount()`, and same-constructor `update()`
failures remain synchronous exceptions inside `renderEditor()` (`:98-147`),
with update failures caught separately at `:108-114`. All of them should use
the same error view, but none should be moved to `PageSlot`, whose rollback
would discard a page that can still recover in place.

### C3 — Stack extraction must preserve the project error convention

`errMessage(error)` is mandatory for the visible message because catches are
`unknown` and IPC values can be plain objects. The native view may render a
stack only when a safely inspected `stack` field is a non-empty string; it must
not use `instanceof Error`, unsafe `.message` access, or custom stringification.

### C4 — Native view must be less failure-prone than the failed editor

The error view must not import React faces, start async work, subscribe to
state, create timers, or depend on an editor model. Its own constructor and
mount should do only stable DOM creation. A failure while building the error
surface would otherwise turn a recoverable editor error into the outer
`PageSlot`/`AppPageManagerView` failure path.

### C5 — Verification is manual and temporary

This project has no unit-test harness for this behavior. Verification must use
a temporary local edit to an existing native editor and revert that edit after
the observation; no fixture or test harness is to be committed.

### C6 — The page-manager catch gap is separate scope

`AppPageManagerView.reconcile()`'s uncaught `slot.renderNative()` call at
`src/renderer/components/page-manager/AppPageManagerView.ts:153-158` is
reachable when the supplied outer `PageContentView` cannot be constructed or
mounted. `VanillaView.update()` also lets an `onUpdate()` exception escape at
`vanilla-view.ts:85-94`. Those failures are not the `getEditorModule()` promise
owned by `AsyncEditorView`; they belong to a separate page-shell failure-path
task. US-1160 records the behavior and leaves `AppPageManagerView.ts` and
`PageSlot.ts` unchanged.

## Acceptance criteria

- [ ] The implementation is landed after US-1158 and does not delete or modify
  `src/renderer/editors/base/EditorError.tsx` or
  `src/renderer/ui/app/EditorErrorBoundary.tsx` for the purpose of this task.
- [ ] A native editor whose constructor throws displays “Editor crashed”, the
  error message, and its stack (when present) inside its existing page slot.
- [ ] A native editor whose `onMount()` throws displays the same native error
  view; the failed native root is disposed/removed and no previous editor root
  remains mounted.
- [ ] A rejected `getEditorModule()`/dynamic `import()` displays the same view
  instead of leaving the spinner indefinitely; stale late rejections are
  ignored after a page/editor switch or disposal.
- [ ] For all three cases, the page remains selectable and closable, switching
  to another tab works, and the application shell remains usable.
- [ ] The error view uses `errMessage()` for the message, does not use a React
  boundary, and has no faces, async work, subscriptions, timers, or editor-model
  dependencies.
- [ ] `EditorErrorBoundary.css` is reused and remains present as the shared
  stylesheet for the native error DOM even after the React boundary eventually
  loses its last editor consumer.
- [ ] Each handled native failure is written once to the console with
  `console.error("Editor crashed:", error)`; stale failures are silent after
  the live/generation guard rejects them.
- [ ] Manual verification observes the user-facing DOM and DevTools console;
  no unit test or harness is added, and no temporary throw remains afterward.

### Verification procedure

After US-1158, start a cold development server. Temporarily edit one existing
native module (a small view such as `src/renderer/editors/about/AboutView.ts`)
one case at a time, then revert the edit and cold-restart between cases:

1. Add `throw new Error("US-1160 constructor probe")` at the beginning of the
   native view constructor after its `super(...)` call. Open the corresponding
   editor and observe the existing tab's page slot: it must show the title,
   message, and stack; the tab remains selectable/closable; switching to a
   second tab works; no second/stale editor root is present.
2. Restore the constructor and add `throw new Error("US-1160 mount probe")` at
   the beginning of that view's `onMount()`. Observe the same error view and
   verify that the temporary native root and its listeners/children are gone.
3. Restore the view and temporarily make the registered loader used by that
   editor return `Promise.reject(new Error("US-1160 import probe"))` (or throw
   from the loader before its dynamic import), without changing the registry's
   production contract. Open the editor from a cold start and observe that the
   spinner is replaced by the same native error view. Confirm the rejection is
   represented in the application UI, confirm exactly one deliberate
   `Editor crashed` console entry and no unhandled-rejection duplicate, switch
   away and back, and close the tab. Repeat with a deliberately delayed stale
   rejection after switching to another editor and confirm it cannot replace
   the newer editor's DOM.

The current-source investigation predicts the pre-fix observations as:
message-only for cases 1–2, spinner forever for case 3, no application toast,
no explicit application console log for cases 1–2, and renderer-level
unhandled-rejection reporting may appear for case 3. The post-fix observations
above are the acceptance target. The page-manager outer failure gap is also
pre-existing and remains out of scope. Revert every probe before finishing; do
not add a committed throwing editor.

## Files changed

| File | Planned change |
|---|---|
| `src/renderer/ui/app/AsyncEditorView.ts` | Catch module-load rejection and use one native error-view path for async and synchronous native failures. |
| `src/renderer/ui/app/NativeEditorErrorView.ts` | New dependency-free `VanillaView` rendering title, message, and optional stack. |
| `src/renderer/ui/app/EditorErrorBoundary.css` | **Reuse unchanged** for both native error DOM and the remaining React boundary; it outlives `EditorErrorBoundary.tsx` if E15 later removes that component. |
| `src/renderer/uikit/shared/vanilla-view.ts` | **No change.** Existing rollback and ownership semantics are the required contract. |
| `src/renderer/components/page-manager/PageSlot.ts` | **No change.** Existing construction rollback is correct for outer page-view failures. |
| `src/renderer/components/page-manager/AppPageManagerView.ts` | **No change.** It is not the owner of the asynchronous editor module promise. |
| `src/renderer/ui/app/RenderEditorView.ts` | **No change.** It supplies the loader and model; it does not own the editor host's failure UI. |
| `src/renderer/editors/base/EditorError.tsx` | **No change.** E15 consumers remain. |
| `src/renderer/ui/app/EditorErrorBoundary.tsx` | **No change.** E15 React consumers and Storybook remain. |
| `doc/active-work.md` | **No change.** The dashboard entry already exists. |


---

## Live verification (2026-08-27)

Each case was produced by a temporary one-line throw, observed, then reverted. No probe code remains
in the tree, and both touched files are byte-identical to `HEAD`.

| Case | Probe | What the user sees |
|---|---|---|
| Native `View` **constructor** throws | `throw` after `super(props, root)` in `about/AboutView.ts` | `.editor-error-root` visible: title **"Editor crashed"**, message `US-1160 constructor probe`, **4-line stack**. No spinner. Page created, tabs rendered, app usable. |
| Native `View.onMount()` throws | `throw` as the first line of `about/AboutView.ts` `onMount()` | Same, with message `US-1160 mount probe` and a **5-line stack**. |
| Module `load()` **rejects** | About loader replaced with `Promise.reject(...)` in `register-editors.ts` | **Nothing at all** — see below. |

App-wide React roots stayed at **1** (`GlobalStyles`) in every case: the new error view is native, so a
crash no longer reintroduces React.

## The third case does not reach the code this task fixed — and that reframes the fix

The plan asserted the missing `.catch()` was "reachable today by any editor whose dynamic `import()`
fails". The probe shows the failure surfaces **earlier than `AsyncEditorView`**:

```
showAboutPage → PagesLifecycleModel.showEditorPage:574
              → editorRegistry.createEditor:155
              → editorRegistry.loadModule:210   ← rejects here
```

`createEditor` needs the module to build the editor *model*, so it loads first and throws first. The
page is therefore never created, and `AsyncEditorView.load()` — which loads the module for the *view* —
is never called. By the time a view loads, the module is already in the registry's cache.

Measured after the failed open: **no page created** (count unchanged), **no error view, no spinner, no
notification**, app fully usable, exception propagated to the caller.

So:

- **The `.catch()` added here is defence-in-depth, not a live-bug fix.** It closes the view-load path,
  which is reachable only if the view is the first loader (or the load is transient). Keeping it is
  right — an unhandled rejection there would still hang a spinner — but this record should not claim it
  fixed a user-visible bug, and the dashboard entry has been corrected to match.
- **The reachable failure is a silent no-op at page creation.** Clicking a broken editor's entry does
  nothing: no page, no message, nothing logged to the user. That is arguably better than a permanent
  spinner (nothing is stuck) but it is still unreported, and it belongs to `showEditorPage` /
  `createEditor`, not to `AsyncEditorView`. **Not fixed here** — recorded as a follow-up so it is not
  lost, since it is outside this task's traced layer.

**The lesson is the same one this epic keeps producing in new clothes: the layer that owns a failure is
not always the layer that looks like it should.** The document traced five layers carefully and
correctly, and still located the fix one layer below where the failure actually occurs — because the
trace started from the throw sites it was asked about rather than from what a user does. A probe found
in one run what five files of reading did not.

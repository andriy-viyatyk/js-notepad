# US-1198 — `core/utils/scheduling.ts`: named, disposable deferrals

## Goal

Introduce a small, named scheduling utility in `src/renderer/core/utils/scheduling.ts` and use its
paint-aligned focus helper in the five dialog views that currently schedule focus with an owned-by-
hand zero-delay timer. The task preserves each dialog's current target, null-safety, and
`selectAll` behavior, while leaving every other zero-delay deferral for R8's individually verified
audit.

The five timers already clear themselves on disposal, so this conversion is deduplication and a
named, disposable primitive—not a leak fix.

This task is part of EPIC-075 A-4 (R10.3). It does not update `doc/active-work.md`; the dashboard is
being handled separately.

## Background

US-1195 has landed. `src/renderer/core/utils/DisposableStore.ts` exists, `VanillaView.own()` stores
cleanup functions, and `TModel.own()` is available for model callers. A scheduling helper must
return an idempotent cleanup function so a view or model can register it directly with `own()`.
`VanillaView.dispose()` snapshots its disposer list before running it, so cancelling a pending
frame is safe during disposal.

The implementation belongs in `core/utils/`, which is the renderer foundation layer. Dialogs should
use a direct import of `../../core/utils/scheduling`; no existing state, view-base, or disposal
contract needs to change.

### Verified finding 1: the five dialog timers

The epic's line numbers were re-measured against the current tree on 2026-08-29. All five are
called at the end of `onMount()`, all use an explicit `0` delay, and all eventually target an
`HTMLInputElement`. They are not genuinely identical in behavior:

| File and current site | Delay | Focus/selection behavior | Null-check | Timer cleared on disposal today? |
|---|---:|---|---|---|
| `src/renderer/ui/dialogs/CreateBoardDialogView.ts:185` | `0` | Captures `hasFolder`; focuses `nameElement` when a folder is already present, otherwise `folderElement` | Optional-chain focus | Yes, in `onDispose()` at `:179` |
| `src/renderer/ui/dialogs/InputDialogView.ts:148` | `0` | Focuses `inputElement`, or calls `select()` instead when live state has `selectAll` | Checks both `viewDisposed` and `inputElement` | Yes, in `onDispose()` at `:143` |
| `src/renderer/ui/dialogs/LibrarySetupDialogView.ts:168` | `0` | Focuses `folderElement` | Optional-chain focus | Yes, through the constructor's `this.own()` cleanup at `:125-129` |
| `src/renderer/ui/dialogs/PasswordDialogView.ts:173` | `0` | Focuses `passwordElement` | Optional-chain focus | Yes, in `onDispose()` at `:168` |
| `src/renderer/ui/dialogs/CreateBoardVarsStorageDialogView.ts:149` | `0` | Focuses `pathElement` | Optional-chain focus | Yes, in `onDispose()` at `:144` |

The current code was quoted directly from each file:

`src/renderer/ui/dialogs/CreateBoardDialogView.ts:177-190`:

```ts
protected onDispose(): void {
    this.viewDisposed = true;
    if (this.focusTimer !== undefined) clearTimeout(this.focusTimer);
    this.focusTimer = undefined;
}

private scheduleFocus(): void {
    const hasFolder = !!this.model.state.get().folder.trim();
    this.focusTimer = setTimeout(() => {
        this.focusTimer = undefined;
        if (this.viewDisposed) return;
        (hasFolder ? this.nameElement : this.folderElement)?.focus();
    }, 0);
}
```

`src/renderer/ui/dialogs/InputDialogView.ts:141-154`:

```ts
protected onDispose(): void {
    this.viewDisposed = true;
    if (this.focusTimer !== undefined) clearTimeout(this.focusTimer);
    this.focusTimer = undefined;
}

private scheduleFocus(): void {
    this.focusTimer = setTimeout(() => {
        this.focusTimer = undefined;
        if (this.viewDisposed || !this.inputElement) return;
        if (this.model.state.get().selectAll) this.inputElement.select();
        else this.inputElement.focus();
    }, 0);
}
```

`src/renderer/ui/dialogs/LibrarySetupDialogView.ts:125-129,167-173`:

```ts
this.own(() => {
    this.viewDisposed = true;
    if (this.focusTimer !== undefined) clearTimeout(this.focusTimer);
    this.focusTimer = undefined;
});

private scheduleFocus(): void {
    this.focusTimer = setTimeout(() => {
        this.focusTimer = undefined;
        if (this.viewDisposed) return;
        this.folderElement?.focus();
    }, 0);
}
```

`src/renderer/ui/dialogs/PasswordDialogView.ts:166-178`:

```ts
protected onDispose(): void {
    this.viewDisposed = true;
    if (this.focusTimer !== undefined) clearTimeout(this.focusTimer);
    this.focusTimer = undefined;
}

private scheduleFocus(): void {
    this.focusTimer = setTimeout(() => {
        this.focusTimer = undefined;
        if (this.viewDisposed) return;
        this.passwordElement?.focus();
    }, 0);
}
```

`src/renderer/ui/dialogs/CreateBoardVarsStorageDialogView.ts:142-154`:

```ts
protected onDispose(): void {
    this.viewDisposed = true;
    if (this.focusTimer !== undefined) clearTimeout(this.focusTimer);
    this.focusTimer = undefined;
}

private scheduleFocus(): void {
    this.focusTimer = setTimeout(() => {
        this.focusTimer = undefined;
        if (this.viewDisposed) return;
        this.pathElement?.focus();
    }, 0);
}
```

Therefore the conversions must be separate at the call site even though they share the same
focus-after-mount purpose. In particular, `InputDialogView` must not become an unconditional
`.focus()` call, and `CreateBoardDialogView` must retain its initial-folder decision.

### Verified finding 2: `FileSearchView.ts:146` reference

`src/renderer/components/file-search/FileSearchView.ts:146-155` already has the desired lifecycle
shape:

```ts
this.focusFrame = requestAnimationFrame(() => {
    this.focusFrame = undefined;
    if (this.live) this.queryField?.focus();
});
this.own(() => {
    if (this.focusFrame !== undefined) {
        cancelAnimationFrame(this.focusFrame);
        this.focusFrame = undefined;
    }
});
```

It is correct because it waits for the next paint frame rather than guessing with a timer, stores
the frame handle, checks that the view is still live before focusing, and registers cancellation
with the view's ownership store. The five dialogs currently use a macrotask timer and manually
repeat disposal logic; `focusAfterPaint` will centralize the frame/cancellation mechanism. This
reference file is evidence only and must not be modified by US-1198.

### Verified finding: the five dialogs can be created in a non-visible window

The answer is yes, so the paint helper needs a timer fallback. The multi-window path is present in
the current source:

- `src/main/mcp/register-tools.ts:7-15` strips the optional `windowIndex` and forwards the command.
- `src/main/mcp/renderer-bridge.ts:28-68` selects that indexed open window and sends
  `MCP_EXECUTE` directly to its `webContents`; it does not focus the window before sending.
- `src/renderer/api/mcp-handler.ts:12-28` dispatches the request inside that selected renderer.
- `src/renderer/api/ui.ts:25-50` implements the script-facing `ui.confirm()`, `ui.input()`,
  `ui.password()`, and `ui.textDialog()` by calling the local dialog functions. `DialogsView` is
  mounted per renderer and `showDialog()` updates that renderer's local `dialogsState`
  (`src/renderer/ui/dialogs/DialogsView.ts:13-37,110-128`).
- `src/renderer/scripting/ScriptContext.ts:99-114` installs the UI facade for scripts in that
  renderer.

Therefore an MCP/script request can create a dialog in an already-open, background, occluded, or
minimized window selected by `windowIndex`; this is not limited to a user click in the focused
window. `requestAnimationFrame` is not guaranteed to be served there, while a timer is. `afterPaint`
must race the next rAF against a `setTimeout(..., 100)` fallback, with one active guard so the
callback runs once. The nominal 100 ms fallback preserves rAF-first behavior in a painting window
while giving a non-painting window an eventual path to focus (subject to normal background timer
throttling). Its doc comment must explicitly say that this
fallback is required for background-capable callers and that the helper is not a substitute for an
ordering decision at the R8 sites.

### Verified finding 3: complete zero-delay `setTimeout` census

An AST call-expression census over `*.ts` and `*.tsx` under `src/renderer` (comments excluded,
including both `setTimeout` and `window.setTimeout`) found **28 actual sites** with an explicit `0`
delay or no second delay argument. The five dialog sites are the only conversions among these 28
census sites; the other **23 sites remain for R8**. The epic's “~11” figure describes a narrower group of
unexplained editor ordering hacks, not the complete renderer census.

| Site | What the deferral appears to order | Disposition |
|---|---|---|
| `src/renderer/api/pages/PageModel.ts:379` (`onEditorPanelsChanged`) | Detach a non-panel editor before disposing it on the next macrotask | Left for R8 |
| `src/renderer/api/pages/PageModel.ts:441` (`setMainEditor`) | Finish the main-editor swap before disposing the old editor and deleting its cache files | Left for R8 |
| `src/renderer/api/pages/PagesModel.ts:159` (`checkEmptyPage`) | Let page-removal state settle before adding an empty page when no pages remain | Left for R8 |
| `src/renderer/components/file-list/FileList.ts:56` (`showSearch`) | Make the search input visible before focusing it | Left for R8 |
| `src/renderer/components/tree-provider/TreeProviderViewImpl.ts:407` (`onRootKeyDown`) | Render the tree search field after Ctrl+F before focusing it | Left for R8 |
| `src/renderer/components/tree-provider/TreeProviderViewModel.ts:312` (`collapseAll`) | Let collapse complete before re-expanding the provider root and pruning selection | Left for R8 |
| `src/renderer/components/tree-provider/TreeProviderViewModel.ts:736` (`revealItem`) | Wait after loading ancestor children before revealing the item; the nearby comment still says React re-render | Left for R8 |
| `src/renderer/core/state/events.ts:28` (`Subscription.fire`) | Rethrow a listener exception asynchronously instead of during event dispatch | Left for R8 |
| `src/renderer/editors/archive/ArchiveEditor.ts:136` (`onEditorChanged`) | Compose/show the archive secondary panel before expanding it | Left for R8 |
| `src/renderer/editors/archive/ArchiveEditor.ts:147` (`onPanelExpanded`) | Trigger archive-entry reveal after the archive panel expansion callback | Left for R8 |
| `src/renderer/editors/browser/BrowserUrlBarModel.ts:32` (`focusUrlInput`) | Focus the URL input before selecting its text | Left for R8 |
| `src/renderer/editors/browser/BrowserUrlBarModel.ts:218` (`handleUrlFocus`) | Let the URL-focus state update/open suggestions before selecting the input text | Left for R8 |
| `src/renderer/editors/explorer/ExplorerEditorModel.ts:126` (`openSearch`) | Compose the search secondary view before expanding the search panel | Left for R8 |
| `src/renderer/editors/explorer/ExplorerEditorModel.ts:132` (`closeSearch`) | Compose the explorer view before expanding the explorer panel | Left for R8 |
| `src/renderer/editors/explorer/ExplorerEditorModel.ts:144` (`openBoards`) | Compose the boards secondary view before expanding the boards panel | Left for R8 |
| `src/renderer/editors/explorer/ExplorerEditorModel.ts:150` (`closeBoards`) | Compose the explorer view before expanding the explorer panel | Left for R8 |
| `src/renderer/editors/explorer/ExplorerEditorModel.ts:216` (`onPanelExpanded`) | Trigger file reveal after the explorer panel expansion callback | Left for R8 |
| `src/renderer/editors/graph/ForceGraphRenderer.ts:437` (resize/update path) | Re-apply graph position forces after writing the new center/size | Left for R8 |
| `src/renderer/editors/graph/GraphEditor.ts:629` (popup-menu flow) | Clear `isPopupOpen` after the awaited popup closes | Left for R8 |
| `src/renderer/editors/shared/MonacoDiffEditorHostView.ts:177` (`scheduleModelDisposal`) | Dispose detached Monaco models after the diff editor has released them | Left for R8 |
| `src/renderer/editors/shared/MonacoEditorHostView.ts:190` (`scheduleModelDisposal`) | Dispose detached Monaco models after the editor has released them | Left for R8 |
| `src/renderer/scripting/ScriptContext.ts:113` (`yieldFn`) | Make `await ui()` yield to the renderer event loop | Left for R8 |
| `src/renderer/ui/dialogs/CreateBoardDialogView.ts:185` (`scheduleFocus`) | Focus the post-mount board name or folder input | **Converted by this task** |
| `src/renderer/ui/dialogs/CreateBoardVarsStorageDialogView.ts:149` (`scheduleFocus`) | Focus the post-mount environment-file path input | **Converted by this task** |
| `src/renderer/ui/dialogs/InputDialogView.ts:148` (`scheduleFocus`) | Focus or select all in the post-mount input field | **Converted by this task** |
| `src/renderer/ui/dialogs/LibrarySetupDialogView.ts:168` (`scheduleFocus`) | Focus the post-mount library-folder input | **Converted by this task** |
| `src/renderer/ui/dialogs/PasswordDialogView.ts:173` (`scheduleFocus`) | Focus the post-mount password input | **Converted by this task** |
| `src/renderer/uikit/Textarea/TextareaView.ts:210` (`scheduleAutoFocus`) | Focus the textarea root after auto-focus props have been applied; the delay argument is omitted | Left for R8 |

No census site outside the five dialogs is to be renamed to a scheduling helper in US-1198. In
particular, `src/renderer/core/state/events.ts` is also being rewritten by US-1196 and remains
untouched here.

### Helper scope and contracts

The source audit found no existing `Delayer`, `Throttler`, or `RunOnceScheduler` symbol. The scope
decision is therefore explicit:

- Add `Delayer<T>` and convert `src/renderer/editors/graph/GraphLegendPanelView.ts:67-75`,
  `GraphLegendModel.scheduleDescription()`, now. It is a contained, verified per-key 300 ms
  debounce and gives the helper a live call site.
- Drop `RunOnceScheduler`. Its only candidate is `src/renderer/api/pages/PagesModel.ts:158-164`,
  `PagesModel.checkEmptyPage()`, whose page-lifecycle ordering belongs to R8. Shipping a helper
  with only that unconverted caller would still be speculative API.
- Do not add `Throttler`: the renderer has no current throttling caller and no named, verified
  queued caller. A later task can add it when a concrete renderer contract requires it.

The module therefore contains only `Delayer`, `afterPaint`, and `focusAfterPaint`; every shipped
helper has a live call site. This is intentionally asymmetric with `Throttler`: `Delayer` is used
now, while neither `Throttler` nor `RunOnceScheduler` has a caller in scope.

The following contracts are the implementation specification. Every helper returns or owns a
cleanup that can be passed to `own()`; disposal is idempotent.

#### `Delayer<T>`

Proposed shape:

```ts
export class Delayer<T> {
    constructor(private readonly defaultDelay: number);
    trigger(task: () => PromiseLike<T> | T, delay?: number): Promise<T>;
    cancel(): void;
    dispose(): void;
}
```

`trigger()` starts one debounce cycle. Calls while that cycle's timer is pending replace the task
and restart the delay; the task runs once, using the latest callback. Calls in the same pending
cycle return the same completion promise. Consequently, a superseded caller's promise does not
reject and does not hang: it resolves with the value produced by the later callback (or rejects
with that callback's error). This is the useful contract for a caller such as a debounced save or
description update: callers waiting for “the current settled update” observe the update that
actually ran, rather than receiving a cancellation error for an intermediate keystroke.

Once the callback has started it cannot be cancelled by this utility; a new trigger creates a new
debounce cycle. `cancel()` cancels only the pending timer, rejects that cycle's shared promise with
`Error("Delayer cancelled.")`, and leaves the Delayer reusable. `dispose()` permanently cancels
pending work, rejects its pending completion promise with `Error("Delayer disposed.")`, and prevents
future triggers. An in-flight task cannot be stopped, but its eventual result must not replace the
disposal rejection. A caller that owns a Delayer and does not need the result must explicitly handle
the cancellation rejection.

#### `afterPaint`

Proposed shape:

```ts
export function afterPaint(run: () => void): () => void;
```

Each call queues `run` on one `requestAnimationFrame` and one 100 ms timeout fallback, invoking it at
most once whichever primitive wins. In a painting window rAF normally wins; the fallback covers a
hidden, occluded, minimized, or otherwise non-painting window. Repeated calls create independent
callbacks; this primitive does not coalesce them. The returned cleanup is idempotent, cancels both
handles, and marks the callback inactive so a callback already captured by the browser cannot do
work after cancellation. There is no promise to settle. Disposal through `own()` therefore prevents
both the frame and fallback callback from doing work.

#### `focusAfterPaint`

Proposed shape:

```ts
export function focusAfterPaint(
    element: HTMLElement | null | undefined,
    options?: { select?: boolean | (() => boolean) },
): () => void;
```

It is the named dialog-facing wrapper around `afterPaint`. On the next animation frame, or on the
100 ms fallback when no frame is served, it does nothing for a missing element; otherwise it calls `select()` for an input/textarea when
`options.select` is `true` or its predicate returns `true`, and calls `focus()` otherwise. The
predicate is evaluated on the frame so `InputDialogView` retains its current read of live
`selectAll` state. If selection is requested for an element without `select()`, it falls back to
`focus()`. Repeated calls are independent and each returns its own idempotent cancellation function.
Disposal through `own(focusAfterPaint(...))` cancels the pending frame and fallback and prevents a
late focus/selection; a callback already in progress cannot be interrupted.

### Before → after conversion shape

`GraphLegendModel.scheduleDescription()` will replace its per-key timer map with a map of
`Delayer<void>` instances, preserving independent debounce windows for each `${tab}:${key}` key:

```ts
// Before: GraphLegendModel.scheduleDescription()
const existing = this.debounceTimers.get(timerKey);
if (existing) clearTimeout(existing);
this.debounceTimers.set(timerKey, setTimeout(() => {
    if (this.isLive) this.props.editor.setLegendDescription(tab, key, value);
    this.debounceTimers.delete(timerKey);
}, 300));

// After: one Delayer per existing timerKey
let delayer = this.descriptionDelayers.get(timerKey);
if (!delayer) {
    delayer = new Delayer<void>(300);
    this.descriptionDelayers.set(timerKey, delayer);
}
void delayer.trigger(() => {
    if (this.isLive) this.props.editor.setLegendDescription(tab, key, value);
}).catch(() => { /* disposal/cancellation is intentional */ });
```

The model's `dispose()` will dispose every per-key `Delayer` and clear the map. The latest value for
each key still wins after 300 ms, different keys remain independent, and disposal prevents a late
editor update. The caller does not await the promise, so it explicitly handles the Delayer's
disposal rejection.

The five views will stop owning `focusTimer` fields and their duplicated timer cleanup. Each
`onMount()` registers the helper's returned cleanup. The exact callback intent remains distinct:

`src/renderer/ui/dialogs/CreateBoardDialogView.ts`:

```ts
// Before
this.scheduleFocus();

// After
const hasFolder = !!this.model.state.get().folder.trim();
this.own(focusAfterPaint(hasFolder ? this.nameElement : this.folderElement));
```

The implementation should remove `scheduleFocus()`, `focusTimer`, and the view-local timer guard;
the model's existing `disposeView` ownership and behavior remain unchanged. The `hasFolder` read
stays at mount time, matching the current capture.

`src/renderer/ui/dialogs/InputDialogView.ts`:

```ts
// Before
this.scheduleFocus();

// After
this.own(focusAfterPaint(this.inputElement, {
    select: () => this.model.state.get().selectAll,
}));
```

The frame callback must preserve the current `select()` versus `focus()` branch. Do not replace it
with an unconditional focus or capture `selectAll` earlier than the current callback does.

`src/renderer/ui/dialogs/LibrarySetupDialogView.ts`:

```ts
// Before
this.scheduleFocus();

// After
this.own(focusAfterPaint(this.folderElement));
```

Remove the timer-specific `this.own()` block and `scheduleFocus()`; retain the model's
`this.own(model.disposeView)` registration.

`src/renderer/ui/dialogs/PasswordDialogView.ts`:

```ts
// Before
this.scheduleFocus();

// After
this.own(focusAfterPaint(this.passwordElement));
```

`src/renderer/ui/dialogs/CreateBoardVarsStorageDialogView.ts`:

```ts
// Before
this.scheduleFocus();

// After
this.own(focusAfterPaint(this.pathElement));
```

For both of these views, remove only the timer field, `scheduleFocus()`, and timer cleanup from
`onDispose()`; leave all model and dialog disposal behavior intact.

The new import in each converted view is the direct module import:

```ts
import { focusAfterPaint } from "../../core/utils/scheduling";
```

No `src/renderer/core/utils/index.ts` barrel change is planned; direct imports match the repository's
existing utility import style and avoid making unused helpers part of a broad barrel surface.

### Human verification in the running app

After a full renderer reload, open each dialog and check focus immediately after it appears:

1. In the Explorer's Boards panel, choose **Create board**. With the Explorer root prefilled, the
   **Board name** input should have focus; when no folder is prefilled, the **Board location** input
   should have focus.
2. Open a normal input prompt, for example **Save Script to Library** from the text editor's Script
   panel. The **Script name** input should have focus; because this caller sets `selectAll: true`,
   its existing value should also be selected. A prompt with `selectAll: false` should only focus
   the input.
3. Open **Link Script Library** from the Script Library sidebar setup button (or the Script Library
   settings section). The **library folder** input should have focus.
4. Trigger an encrypt/decrypt password prompt through the relevant file operation. The **password**
   input, not the confirmation input, should have focus when the dialog appears.
5. Open the board environment-variable storage setup from its Settings **Create** action, or invoke
   a board-variable operation with no configured store. The **environment variables file path**
   input should have focus.

6. In a Graph editor, open the legend and rapidly edit one level or shape description several times.
   After the 300 ms quiet period, only the final text should be written to the graph; rapidly edit
   descriptions for two different legend keys as well to confirm their debounce windows remain
   independent. Dispose/close the graph while an edit is pending and confirm no late update occurs.

For each dialog, close it immediately once to exercise the disposal path while the frame is still
pending; no later focus should jump back into a closed dialog. This is manual UI verification only;
the project has no unit-test harness for this task and no test files are to be added.

## Implementation Plan

1. Add `src/renderer/core/utils/scheduling.ts` with `Delayer<T>`, `afterPaint`, and
   `focusAfterPaint` exactly as contracted above. Use a requestAnimationFrame/100 ms timeout race
   for paint helpers, cancel both handles through idempotent cleanup state, and use an explicit
   disposal error for a pending `Delayer` promise. Do not add `Throttler` or `RunOnceScheduler`.
2. Convert `GraphLegendModel.scheduleDescription()` in
   `src/renderer/editors/graph/GraphLegendPanelView.ts` to one `Delayer<void>` per existing
   `tab:key` debounce key, preserving the 300 ms delay, per-key independence, latest-value wins,
   live-model guard, and disposal behavior.
3. Convert `CreateBoardDialogView.onMount()` and remove its `focusTimer`, `scheduleFocus()`, and
   timer-specific `onDispose()` code. Preserve the captured `hasFolder` branch and model's
   `disposeView` cleanup.
4. Convert `InputDialogView.onMount()` and remove its timer field/method/cleanup. Preserve the live
   `selectAll` branch through the `focusAfterPaint` option predicate.
5. Convert `LibrarySetupDialogView.onMount()` and remove only its timer-specific ownership block,
   field, and `scheduleFocus()` method. Preserve `LibrarySetupDialogModel.disposeView` ownership.
6. Convert `PasswordDialogView.onMount()` and `CreateBoardVarsStorageDialogView.onMount()` in the
   same focused manner, retaining their respective input targets and all unrelated disposal.
7. Run the repository's type/lint/build checks appropriate to the implementation, then perform the
   five-dialog and Graph Legend manual verification. Re-run the zero-delay census to prove that
   exactly the five listed focus sites changed and the 23 R8 sites remain. Do not add unit tests or
   edit the dashboard.

### Files this task touches and US-1196 collision boundary

Implementation changes are limited to:

- `src/renderer/core/utils/scheduling.ts` (new helper module)
- `src/renderer/editors/graph/GraphLegendPanelView.ts`
- `src/renderer/ui/dialogs/CreateBoardDialogView.ts`
- `src/renderer/ui/dialogs/InputDialogView.ts`
- `src/renderer/ui/dialogs/LibrarySetupDialogView.ts`
- `src/renderer/ui/dialogs/PasswordDialogView.ts`
- `src/renderer/ui/dialogs/CreateBoardVarsStorageDialogView.ts`

US-1196 is concurrently rewriting `src/renderer/core/state/events.ts`,
`src/renderer/api/events/EventChannel.ts`, `src/renderer/core/state/ComponentQueue.ts`, and
`src/ipc/renderer/renderer-events.ts`. US-1198 does not touch any of those files. The zero-delay
site in `src/renderer/core/state/events.ts` is deliberately left for R8/US-1196 coordination.

## Concerns

- **The five timers are not identical.** Four only focus an optional input; `InputDialogView`
  sometimes selects instead, and `CreateBoardDialogView` chooses between two inputs from a
  mount-time snapshot. The implementation must keep those two branches separate.
- **Frame timing is intentional.** `focusAfterPaint` changes the scheduling primitive from a
  zero-delay macrotask to the next animation frame, as demonstrated by `FileSearchView`, with a
  100 ms timer fallback because the five dialogs can be created in a background-capable window. It
  must not be reused for the unexplained R8 ordering sites.
- **Delayer cancellation is observable.** Superseded calls share the later result rather than
  rejecting or remaining pending. Disposal rejects with cancellation so an awaited caller cannot
  hang, and callers that intentionally ignore the promise must catch that cancellation.
- **No speculative `Throttler`.** No renderer call site or queued caller was found, so it is
  explicitly omitted. If R8 identifies one, add it in that task with its concrete contract.
- **No speculative `RunOnceScheduler`.** `PagesModel.checkEmptyPage()` is the verified queued
  caller, but its conversion could change page-lifecycle ordering; R8 must add the helper together
  with its ordering decision if that remains the right abstraction.
- **No behavior changes outside the timer mechanism.** Do not alter dialog models, dialog result
  types, button behavior, state subscriptions, or input values.
- **No changes to protected foundations.** `TOneState`, `TModel`, `TComponentModel`,
  `VanillaView`, `DisposableStore`, and `memo()` are already paid for by adjacent work and are not
  implementation targets here.

## Acceptance Criteria

- [ ] `src/renderer/core/utils/scheduling.ts` exists and exports the contracted `Delayer<T>`,
  `afterPaint`, and `focusAfterPaint`; `Throttler` and `RunOnceScheduler` are absent.
- [ ] `afterPaint` and `focusAfterPaint` race rAF with the documented 100 ms fallback, return
  idempotent cleanup functions, and prevent pending callbacks from running after disposal through
  `own()`.
- [ ] `Delayer` replaces pending work with the latest callback, gives all calls in one pending
  cycle the later result, and rejects pending work explicitly on disposal.
- [ ] `GraphLegendModel.scheduleDescription()` uses one `Delayer<void>` per `tab:key`, retains its
  300 ms per-key debounce and live-model guard, and disposes all delayed work.
- [ ] The five dialog views no longer contain their copied `focusTimer`/zero-delay focus timer;
  each registers its focus cleanup with `own()`.
- [ ] `CreateBoardDialogView` still focuses name versus folder according to the initial folder,
  `InputDialogView` still selects all only when live `selectAll` is true, and the other three still
  focus their same optional input elements.
- [ ] `FileSearchView.ts` remains unchanged and continues to be the rAF-plus-`own()` reference.
- [ ] All 23 non-dialog zero-or-omitted-delay `setTimeout` sites listed above remain unchanged and
  are explicitly deferred to R8; the baseline census reports 28 sites, of which 23 remain after
  the five dialog conversions. The named helper's deliberate fallback is not an R8 conversion.
- [ ] No changes are made to US-1196 files, `TOneState`, `TModel`, `TComponentModel`,
  `VanillaView`, `DisposableStore`, or `memo()`.
- [ ] No unit tests, test harnesses, or `doc/active-work.md` changes are added.
- [ ] Type checking, linting, and the relevant production build pass, followed by the five-dialog
  manual focus/disposal verification described above.

## Files Changed

| File | Planned change |
|---|---|
| `doc/tasks/US-1198-scheduling/README.md` | This verified implementation plan |
| `src/renderer/core/utils/scheduling.ts` | New disposable scheduling helpers: `Delayer`, `afterPaint`, `focusAfterPaint` |
| `src/renderer/editors/graph/GraphLegendPanelView.ts` | Replace the per-key 300 ms timer map in `GraphLegendModel.scheduleDescription()` with live `Delayer<void>` instances |
| `src/renderer/ui/dialogs/CreateBoardDialogView.ts` | Replace the mount focus timer with `focusAfterPaint`, preserving target selection |
| `src/renderer/ui/dialogs/InputDialogView.ts` | Replace the mount focus timer with `focusAfterPaint`, preserving `selectAll` |
| `src/renderer/ui/dialogs/LibrarySetupDialogView.ts` | Replace the mount focus timer with `focusAfterPaint` |
| `src/renderer/ui/dialogs/PasswordDialogView.ts` | Replace the mount focus timer with `focusAfterPaint` |
| `src/renderer/ui/dialogs/CreateBoardVarsStorageDialogView.ts` | Replace the mount focus timer with `focusAfterPaint` |

## Files that need NO changes

- `src/renderer/components/file-search/FileSearchView.ts` — reference implementation; do not
  convert it again.
- `src/renderer/core/state/state.ts` — `TOneState`; outside this task.
- `src/renderer/core/state/model.ts` — `TModel`, `TComponentModel`, and `memo()`; outside this
  task.
- `src/renderer/uikit/shared/vanilla-view.ts` — existing `own()` lifecycle; consume it, do not
  change it.
- `src/renderer/core/utils/DisposableStore.ts` — existing cleanup store; consume it indirectly,
  do not change it.
- `src/renderer/core/state/events.ts` — US-1196 collision and R8 census site.
- `src/renderer/api/events/EventChannel.ts` — US-1196 collision.
- `src/renderer/core/state/ComponentQueue.ts` — US-1196 collision.
- `src/ipc/renderer/renderer-events.ts` — US-1196 collision.
- `src/renderer/api/pages/PageModel.ts`, `src/renderer/api/pages/PagesModel.ts` — R8 sites;
  `PagesModel.checkEmptyPage()` is the reason `RunOnceScheduler` is deferred with its caller.
- `src/renderer/components/file-list/FileList.ts` and
  `src/renderer/components/tree-provider/TreeProviderViewImpl.ts` — R8 sites.
- `src/renderer/components/tree-provider/TreeProviderViewModel.ts` — both R8 sites.
- `src/renderer/editors/archive/ArchiveEditor.ts` — both R8 sites.
- `src/renderer/editors/browser/BrowserUrlBarModel.ts` — both R8 sites.
- `src/renderer/editors/explorer/ExplorerEditorModel.ts` — all five R8 sites.
- `src/renderer/editors/graph/ForceGraphRenderer.ts` and
  `src/renderer/editors/graph/GraphEditor.ts` — R8 sites.
- `src/renderer/editors/shared/MonacoEditorHostView.ts` and
  `src/renderer/editors/shared/MonacoDiffEditorHostView.ts` — R8 disposal-order sites.
- `src/renderer/scripting/ScriptContext.ts` — R8 event-loop-yield site.
- `src/renderer/uikit/Textarea/TextareaView.ts` — R8 omitted-delay auto-focus site.
- Existing barrels and utility re-exports, including `src/renderer/core/utils/index.ts` and
  `src/renderer/core/utils/debounce.ts` — no barrel expansion is required.
- Test files and harnesses — none exist for this task and none should be added.
- `doc/active-work.md` — dashboard update is explicitly out of scope for this task document.

# US-1221 — The timing residue

## Goal

Remove accidental zero-delay ordering work, explain or preserve intentional deferrals,
replace React-era force-update residue where the current model/view contract permits it, and
close timer/animation handles that can fire after their owner is disposed. The task is an
investigation and implementation plan only; no source implementation is included here.

The governing rule is: **every deliberate deferral names what it waits for, or becomes a direct
call.** A completed implementation must leave no deliberate deferral with an unexplained wait.

## Background

EPIC-077 §C-2 correction 5 reduces the historical `setTimeout(..., 0)` scope to the current
renderer census and exempts three correct idioms. EPIC-077 §C-4 assigns the remaining timing
residue here, including the two `revealVersion` counters, the TreeProvider reveal await, and
timers that outlive disposal. The epic's numbers are a starting point only: this checkout has
unrelated sibling-task changes, so every site below is re-derived from the current tree.

`src/renderer/core/utils/scheduling.ts` was inspected first. It provides `Delayer`, whose
pending timeout is cancelled by `cancel()` and `dispose()`, plus `afterPaint()` and
`focusAfterPaint()`, which pair a `requestAnimationFrame` with a 100 ms fallback and return a
cancellation function. New focus-after-paint behavior should use `focusAfterPaint` under the
owner's disposer; new general scheduling should extend these helpers only when the existing
semantics fit.

## Verification log

The required guidance was read in full before investigation:

```text
Get-Content -Raw CLAUDE.md
Get-Content -Raw .claude/rules/task-docs.md
Get-Content doc/epics/EPIC-077.md (correction 3 and correction 5 in §C-2, §C-4 US-1221)
```

The checkout was confirmed to contain unrelated in-progress sibling work with:

```text
git status --short
```

No source files are to be modified by this task-document phase. The exact census commands and
their current results are recorded as each part is verified below.

## Part 1 — zero-delay `setTimeout`

### Census

The first source census used:

```text
rg -n -U 'setTimeout\s*\([\s\S]{0,240}?,\s*0\s*\)' src/renderer
rg -n -U 'setTimeout\s*\([\s\S]{0,240}?,\s*0\s*\)' src/renderer/editors
```

It returned **23 renderer-wide call sites** and **13 call sites under `src/renderer/editors`** in
the current checkout. The epic's 16/11 figures are reproduced by the same-line-only sweep below.
That pattern misses multiline callbacks such as `setTimeout(() => { ... }, 0)`; those current
matches are real zero-delay calls and raise the correct census to 23/13. The exact current sites
are listed below, including the three exemptions. EPIC-077's Notes should carry forward 23/13 and
require the `-U` form for the next sweep.

The same-line-only comparison command was also run:

```text
rg -n 'setTimeout\s*\([^\r\n]*,\s*0\s*\)' src/renderer
rg -n 'setTimeout\s*\([^\r\n]*,\s*0\s*\)' src/renderer/editors
```

That returned **16 renderer-wide lines** and **11 editor lines**, demonstrating why the
single-line epic count is not a sufficient current census. (The robust call-site count above is
the count used for this task.)

The robust count was independently tallied with this exact source-file command (the two output
lines were `23` and `13`):

```text
$files = Get-ChildItem src/renderer -Recurse -File -Include *.ts,*.tsx
$text = ($files | ForEach-Object { Get-Content -Raw $_.FullName }) -join "`n"
[regex]::Matches($text, 'setTimeout\s*\([\s\S]{0,5000}?,\s*0\s*\)').Count
$editorFiles = Get-ChildItem src/renderer/editors -Recurse -File -Include *.ts,*.tsx
$editorText = ($editorFiles | ForEach-Object { Get-Content -Raw $_.FullName }) -join "`n"
[regex]::Matches($editorText, 'setTimeout\s*\([\s\S]{0,5000}?,\s*0\s*\)').Count
```

### Verified exemptions — no changes

These three current sites were opened and their roles verified:

| Source site | Verified role | Planned action |
|---|---|---|
| `src/renderer/core/state/events.ts:28` | Catches a listener error and schedules an async throw so the error reaches the host without interrupting the dispatch loop. | No change. |
| `src/renderer/scripting/ScriptContext.ts:113` | Implements the script-facing `yield` function as a deliberate event-loop yield. | No change. |
| `src/renderer/editors/graph/GraphEditor.ts:629` | Defers resetting `isPopupOpen` to preserve click ordering. | No change. |

These are explicit exclusions from implementation and acceptance review. Their comments/nearby
code must continue to name the reason, especially the event-loop yield and click-ordering guard.

### Current actionable sites and verified dispositions

The following sites are the verified non-exempt zero-delay population. Each must become either a
direct call or a deferral with a comment naming what it waits for. The implementation plan below
records the current evidence and verified disposition for each callback.

| Source site | Current callback | Verified disposition |
|---|---|---|
| `src/renderer/components/file-list/FileList.ts:55` | Focuses the search input. | Use cancellable `focusAfterPaint`; the input is inserted synchronously, but MenuBar's 10 ms reveal transition means visibility is not proven at this call. |
| `src/renderer/components/tree-provider/TreeProviderViewModel.ts:311-315` | Expands the root and prunes selection after `collapseAll()`. | Direct call; TreeModel row derivation and state publication are synchronous. |
| `src/renderer/components/tree-provider/TreeProviderViewModel.ts:735` | Awaits before `treeModel.revealItem`. | Direct call after the provider load; see Part 3 for the actual paint-aware scroll mechanism. |
| `src/renderer/components/tree-provider/TreeProviderViewImpl.ts:409` | Focuses the search field after showing it. | Direct call; this handler runs from a mounted tree-root key event, and the root/search CSS is displayed before the synchronous insertion returns. |
| `src/renderer/editors/archive/ArchiveEditor.ts:136` | Requests archive panel expansion. | Direct call; `PageModel.expandPanel()` updates the controlled state synchronously. |
| `src/renderer/editors/archive/ArchiveEditor.ts:147` | Bumps `revealVersion`. | Retain the counter as a view-consumed reveal command; update it directly, with the Part 2 comment. |
| `src/renderer/editors/browser/BrowserUrlBarModel.ts:32` | Focuses then selects the URL input. | Use cancellable `focusAfterPaint`; startup/Ctrl+L callers prove the ref is mounted, not that its editor subtree is visible at the call. |
| `src/renderer/editors/browser/BrowserUrlBarModel.ts:218` | Selects the URL input from its focus handler. | The native `onFocus` path proves the input is connected and visible when the handler begins; use the sanctioned cancellable after-paint selection path rather than the raw timer. |
| `src/renderer/editors/explorer/ExplorerEditorModel.ts:126,132,144,150` | Requests expansion of search/explorer/boards panels. | Direct calls; `PageModel.expandPanel()` updates the controlled state synchronously. |
| `src/renderer/editors/explorer/ExplorerEditorModel.ts:216` | Bumps `revealVersion`. | Retain the counter as a view-consumed reveal command; update it directly, with the Part 2 comment. |
| `src/renderer/editors/graph/ForceGraphRenderer.ts:438` | Calls `updatePositionForces()`. | Direct call; dimensions are assigned first and the update is guarded for null/zero size. |
| `src/renderer/editors/shared/MonacoEditorHostView.ts:200-203` | Disposes Monaco models. | Retain the deferral with a comment naming the `setModel(null)`/editor teardown boundary. |
| `src/renderer/editors/shared/MonacoDiffEditorHostView.ts:177-180` | Disposes Monaco models. | Retain the deferral with the same named teardown boundary. |
| `src/renderer/uikit/Textarea/TextareaView.ts:238-242` | Focuses the textarea and clears its handle. | Retain the paint wait through cancellable `focusAfterPaint`; comment that the parent inserts the child before the next paint. |
| `src/renderer/api/pages/PageModel.ts:381-384,443-449` | Disposes editors; the second path may delete cache files. | Retain the detach-before-dispose deferral with a named page/editor cleanup boundary and owner invalidation. |
| `src/renderer/api/pages/PagesModel.ts:165-169` | Creates an empty page if no pages remain. | Retain the deferral with a comment naming page-removal dispatch and observer settlement. |

### Resolved classifications and visibility proof

The current VanillaView/state implementation makes the following event-loop waits unnecessary;
focus calls are separately held to the stronger connection-and-visibility test:

- `FileListModel.showSearch()` at `src/renderer/components/file-list/FileList.ts:52-55`: the
  `searchVisible` state listener runs synchronously, and `FileListView.applyState()` inserts the
  already-mounted input at `src/renderer/components/file-list/FileListView.ts:101-105`. That proves
  connection, but not visibility during MenuBar's reveal: `src/renderer/ui/sidebar/MenuBarView.ts:245-250`
  adds the open class after a 10 ms timer and `src/renderer/ui/sidebar/MenuBar.css:23-28` transforms
  the content until then. Replace the raw timer with owner-cancelled `focusAfterPaint`.
- `TreeProviderViewModel.collapseAll()` at `:308-315`: `TreeModel.collapseAll()` derives rows and
  invokes the host refresh synchronously; `expandItem(rootPath)` and
  `pruneSelectionToVisible()` can run directly against the resulting rows. Replace the timer with
  a direct call.
- `TreeProviderViewImpl.onRootKeyDown()` at `:404-411`: the listener is installed on the mounted
  tree root at `src/renderer/components/tree-provider/TreeProviderViewImpl.ts:89-92`; the root's
  user key event is therefore already in the connected visible tree. `showSearch()` synchronously
  reaches `updateSearch()`/`ensureSearch()` at
  `src/renderer/components/tree-provider/TreeProviderViewImpl.ts:260-267`, which appends the search
  panel at `src/renderer/components/tree-provider/TreeProviderViewImpl.ts:245-248`;
  `src/renderer/components/tree-provider/TreeProviderView.css:2-7,11-13` gives the
  root a displayed flex layout and the search panel no hidden state. The stronger visibility fact
  is proven here, so focus directly after `showSearch()` returns.
- `ArchiveEditor.onMainEditorChanged()` at `:127-139`: `PageModel.expandPanel()` updates the
  controlled sidebar state synchronously. The panel's own binding is safe if it is already
  mounted, and a newly loaded panel reads the current reveal version during `bind()`; make the
  expansion call direct.
- `ExplorerEditor`'s four panel-opening sites at `:126`, `:132`, `:144`, and `:150`: the same
  `PageModel.expandPanel()` contract applies; make each direct.
- `BrowserUrlBarModel.focusUrlInput()` at `:29-34`: `src/renderer/editors/browser/BrowserView.ts:310`
  mounts the input and assigns the ref, but its callers include the startup timer at
  `src/renderer/editors/browser/BrowserView.ts:444` and the webview shortcut at
  `src/renderer/editors/browser/BrowserWebviewModel.ts:76-80`; neither proves that the editor
  subtree is visible.
  Use owner-cancelled `focusAfterPaint` for focus plus selection.
- `BrowserUrlBarModel.handleUrlFocus()` at `:217-224`:
  `src/renderer/editors/browser/BrowserView.ts:285` wires this as the input's native focus handler
  and `src/renderer/editors/browser/BrowserView.ts:310` mounts that input, proving the element is
  connected and visible when the handler begins. Keep selection after paint anyway so the selection
  follows the visible focus state, using the cancellable scheduling helper rather than the raw
  timer.
- `ForceGraphRenderer.handleResize()` at `:418-439`: dimensions are assigned before the callback,
  and `updatePositionForces()` is null/zero-size guarded. Calling it directly preserves the
  resize result and avoids an untracked callback.

The following zero-delay calls remain deliberately asynchronous, with the named dependency that
must be expressed in the implementation:

- `MonacoEditorHostView.scheduleModelDisposal()` and
  `MonacoDiffEditorHostView.scheduleModelDisposal()` wait for the Monaco editor's
  `setModel(null)`/editor teardown to finish before disposing the detached text models. Keep the
  deferral with that comment and make its disposal ownership explicit; the callback does not touch
  a view.
- `TextareaView.scheduleAutoFocus()` waits until the mounted textarea has reached the next paint,
  because the child can be mounted before its parent inserts the root. Replace the raw zero-delay
  timer with `focusAfterPaint(this.root)` (or the equivalent cancellable `afterPaint` call), and
  retain owner cancellation. The helper's actual wait is paint, not a generic event-loop yield.
- `PageModel.onEditorPanelsChanged()` and `PageModel.setMainEditor()` wait until detach-driven
  page/editor subscribers finish before disposing an editor; the latter also waits before deleting
  its cache files. Retain the ordering but comment that exact detach/cleanup boundary and track the
  pending callbacks so `PageModel.dispose()` cannot leave them running against an already-drained
  page.
- `PagesModel.checkEmptyPage()` waits until the page-removal state dispatch and its observers have
  settled before deciding whether to create the replacement empty page. Retain it with that
  comment; it is a process-level model and the callback rechecks live page state.

Before → after shapes for the direct-call group:

```ts
// Before
await this.loadChildrenForPaths(allPaths);
await new Promise((resolve) => setTimeout(resolve, 0));
await this.treeModel?.revealItem(href);

// After
await this.loadChildrenForPaths(allPaths);
await this.treeModel?.revealItem(href);
```

## Part 2 — `revealVersion` counters

The paths in the epic were verified with:

```text
rg -n 'revealVersion|reveal' src/renderer/editors/archive/ArchiveEditor.ts src/renderer/editors/explorer/ExplorerEditorModel.ts
```

Both paths exist. The counter mechanisms and their consumers were traced before deciding whether a
direct view/model call can replace them. The verified result and before/after plan are recorded
here before implementation.

### Verified counter behavior and decision

`ArchiveEditor.revealVersion` is consumed only by
`src/renderer/editors/archive/ArchiveSecondaryView.ts:61-65,151-164`. Its selected-state binding
updates the tree props; its reveal-version binding schedules one cancellable animation frame, and
that frame calls `TreeProviderViewModel.revealItem(selectedHref)`. The counter therefore causes a
reveal command in the view; it does not force an Archive editor render. A repeated reveal with the
same href is a valid command, so the selected href alone cannot replace the token. The model has no
tree-view reference, so a direct call on the model is not available without coupling the editor
model to its view. Keep the counter, rename/document it as a monotonic reveal request if naming is
addressed, and add a comment saying that it signals the view to schedule reveal after the panel is
available. Remove only the zero-delay wrapper at `ArchiveEditor.onPanelExpanded()` and call the
counter update directly.

`ExplorerEditor.revealVersion` has the same contract in
`src/renderer/editors/explorer/ExplorerSecondaryView.ts:88-93,392-403`: the counter's selected
version is observed by the secondary view, which schedules a cancellable animation frame and then
calls the tree-provider model's `revealItem`. `ExplorerEditorModel` cannot call that view-owned
model directly. Keep the counter with the same explanatory comment and make the update in
`onPanelExpanded()` direct.

Before → after shape:

```ts
// Before
if (href) {
    setTimeout(() => this.revealVersion.update((s) => { s.version++; }), 0);
}

// After
if (href) {
    // The monotonic token is a reveal command consumed by the secondary view.
    this.revealVersion.update((s) => { s.version++; });
}
```

## Part 3 — TreeProvider reveal await

The current source at `src/renderer/components/tree-provider/TreeProviderViewModel.ts:735` says
`// Wait for React to re-render` and awaits `new Promise((r) => setTimeout(r, 0))`. The project
guidance states that this renderer path is VanillaView-based and has no React dependency. The
await was traced through the current tree. `loadChildrenForPaths()` at `:448-478` awaits provider
lists and then calls `this.state.update()` at `:470-476`. `TOneState.stateChanged()` dispatches
listeners synchronously; `TreeProviderViewImpl`'s state binding calls `treeView.update(...)`, and
`TreeView`'s driver calls `TreeModel.setProps()`, which derives `rows` synchronously before
returning. No child mount or React render remains to await. The actual layout dependency is later:
when expansion changes the row set, `TreeModel.expandAncestorsThenScroll()` uses
`scrollToRowAfterPaint()` at `src/renderer/uikit/Tree/TreeModel.ts:737-748`, and the existing
VirtualGrid paint path flushes that request after layout. Thus the TreeProvider await is waiting
for nothing; its old comment is false and the load-bearing layout wait already lives in UIKit.

Remove the await and the false comment, leaving `treeModel.revealItem(href)` as a direct awaited
call. Do not replace it with another timer or a generic scheduling helper. The existing
`TreeModel.scrollToRowAfterPaint()` is the real mechanism for the only required paint wait.

Before → after:

```ts
// Before: false framework explanation and an untracked event-loop timer.
await this.loadChildrenForPaths(allPaths);
// Wait for React to re-render Tree with the new children data
await new Promise((r) => setTimeout(r, 0));
await this.treeModel?.revealItem(href);

// After: state/model reconciliation is synchronous; Tree owns the later paint-aware scroll.
await this.loadChildrenForPaths(allPaths);
await this.treeModel?.revealItem(href);
```

### Named manual exercise

After the await is removed, open a large tree with the viewport near its top, start with the
ancestor chain collapsed, and reveal a file deep enough in a collapsed subtree that the target row
is well below the current viewport. Confirm both that the ancestors expand and that the target row
is scrolled into view, not merely selected. Repeat from the collapsed starting state after a fresh
tree load; a shallow reveal is not sufficient because it can pass without exercising the
load/state/layout handoff.

## Part 4 — timer/animation handles and disposal

The broad callback census used:

```text
rg -n 'setTimeout\s*\(|setInterval\s*\(|requestAnimationFrame\s*\(' src/renderer
```

It returned **132 matching lines** (including multiline continuation lines, comments, stories,
and non-zero delays), so this is a candidate inventory rather than the finding count. Each real
renderer owner must be checked for `clearTimeout`, `clearInterval`, `cancelAnimationFrame`, or a
returned disposer registered with `this.own(...)`. Findings are ranked by whether a callback can
reach detached state after disposal.

The exact command result was **132 matching lines**:

```text
rg -n 'setTimeout\s*\(|setInterval\s*\(|requestAnimationFrame\s*\(' src/renderer
```

The larger number includes multiline source lines and all story/demo and automation code. The
following is the verified untracked/disposal inventory; sites already cancelled by an owner are
listed in the no-change section instead of being repeated as defects.

### Highest-risk late callbacks

| Source site | What fires after disposal | Can it reach disposed state? | Rank and plan |
|---|---|---|---|
| `src/renderer/editors/video/VideoEditor.ts:313-325` | A navigation-completion animation frame iterates `page.panelEditors` and calls `selectByHref`. | **Yes.** The editor has already entered `dispose()` but the frame has no liveness guard or cancellation; it can call a detached link panel/model. | Highest. Store the frame/generation on `VideoEditor`, cancel/invalidate it in `dispose()`, and guard the callback before walking panel editors. |
| `src/renderer/editors/browser/BrowserTabsModel.ts:24-26,45-57,224-229` | The delayed bookmark preload starts, and after its async initialization writes `bookmarks` and `model.state.bookmarksReady`. | **Yes.** `dispose()` closes the current bookmark resource but does not cancel the timer or invalidate an in-flight `preloadBookmarks()`, so a closed BrowserEditorModel can be updated and a new bookmark resource can be installed. | Highest. Track a preload timer plus a disposal generation; cancel and invalidate on dispose and re-check after `await bm.init()`. |
| `src/renderer/editors/browser/BrowserTorModel.ts:63-73,119-128,97-103` | The 500 ms overlay-hide callbacks write `model.state.torOverlayVisible = false`. | **Yes.** `dispose()` removes listeners and stops Tor but neither tracks nor invalidates these callbacks; an already queued status/init completion can mutate the disposed BrowserEditorModel. | Highest. Track/cancel the timer(s), invalidate on dispose, and guard the callback. |
| `src/renderer/components/tree-provider/TreeProviderViewModel.ts:308-315` | The zero-delay callback calls `treeModel.expandItem()` and `pruneSelectionToVisible()`. | **Yes, in the current ordering.** The callback has no `isLive` check and can retain/call a TreeModel after the host has begun disposal. | Highest for the current Part 1 path. Remove the timer and call both operations directly while the live TreeModel is still owned. |

### Untracked but harmless or deliberately non-view-owned callbacks

| Source site | What fires after disposal | Can it reach a disposed view/model? | Rank and plan |
|---|---|---|---|
| `src/renderer/editors/shared/MonacoEditorHostView.ts:200-203` and `MonacoDiffEditorHostView.ts:177-180` | Disposes the detached Monaco text models collected by the host. | No view access; the host has already detached/disposed the editor. The deferral is the Monaco teardown boundary. | Low. Retain, add the exact “after `setModel(null)`/editor teardown” comment, and leave the resource cleanup intact. |
| `src/renderer/editors/graph/GraphEditor.ts:629` | Resets `isPopupOpen`. | It can write the disposed editor's plain flag, but it cannot reach a view or external model. This is one of the three mandatory Part 1 exemptions. | No change. Do not cancel or rewrite it in this task. |
| `src/renderer/editors/board/BoardEditorModel.ts:183-196` | Resolves a `frameLoadWaiters` entry false when its timeout expires. | After `dispose()` the waiter list is emptied; the timer finds no entry and does not touch a view/model. | Low/no change. The timeout is the documented five-second frame-readiness wait; disposal already resolves and removes every waiter, so adding a handle would be lifecycle bookkeeping without a late-state path. |
| `src/renderer/editors/board/BoardTargetModel.ts:157-173` | A polling tick checks `loadedTabs` until the board frame is ready or 5 seconds elapse. | After board disposal it only reads the cleared `loadedTabs` and resolves the automation wait; it does not touch the frame DOM. | Low/no change. This is an explicitly bounded automation readiness wait, and the owner has no late view/model write here; leave it documented rather than adding a second lifecycle seam. |
| `src/renderer/uikit/VirtualGrid/VirtualFlexGridView.ts:80-91` | A post-attach animation frame re-measures a nominated cell. | No: disposal sets `inert` before disposing the measurement model, and the callback returns at `:87`; however, the frame handle itself is not cancelled. | Low. Store pending measurement frame handles and cancel them during the existing inert-first disposer, or use an equivalent shared paint disposer without one disposer per cell. |
| `src/renderer/api/pages/PageModel.ts:381-384,443-449` | Deferred editor disposal, and in the second path cache deletion after disposal. | It intentionally reaches the detached editor cleanup; if the page is disposed first, the same editor can be encountered again by `PageModel.dispose()`. It does not call a detached view directly, but the untracked callback crosses a page-lifecycle boundary. | High/medium. Preserve the detach-before-dispose ordering, but store/cancel or generation-guard pending cleanup and make page disposal drain the same cleanup path. The second callback must retain the cache-delete condition. |
| `src/renderer/api/pages/PagesModel.ts:164-170` | Checks the current page list and may add the replacement empty page. | No disposed page is captured; it re-reads the singleton state. | Low/comment-only. Retain the deferral because it waits for removal observers to settle, and state that reason. |
| `src/renderer/api/mneme-status.ts:124-146` | Opens the Mneme config page 500 ms after a definitive not-ready probe. | No owner view is captured, but it can open a stale config page after the singleton status has changed. | Medium behavior race. Add cancellation/generation or re-check the current enabled/running/not-ready state before opening. |
| `src/renderer/api/app.ts:272-310` | Runs delayed process-startup MCP/Mneme/autoload bootstrap work (1500 ms, not a zero-delay call). | No view/model owner is disposed; it is renderer-process startup work. | No task-specific disposal change; retain the existing process-lifetime behavior and clarify that it waits 1500 ms after initialization to keep first paint unblocked. |
| `src/renderer/core/utils/performance-janitor.ts:23-28` | Periodically clears old performance marks/measures. | No view/model owner; the interval is process-lifetime and its function returns no disposer. | No view change. If lifecycle shutdown is later introduced, make `startPerformanceJanitor()` return a cancellation handle. |
| `src/renderer/scripting/ScriptRunner.ts:119-121` | Decrements the process-wide pending-promise exception count after one second. | No view/model access and no owner disposal path. | No view change; comment the process-wide delayed bookkeeping if touched. |
| `src/renderer/uikit/Progress/progressModel.ts:123-125` | Removes a notification from global progress state after its requested timeout. | No caller view/model is captured; the notification host may already be gone, but global state remains valid. | No owner-disposal change; document it as global-state expiry. |
| `src/renderer/editors/draw/index.ts:196`, `src/renderer/editors/rest-client/ResponseViewerView.ts:384`, and `src/renderer/editors/rest-client/RequestBuilderView.ts:249` | Resolves a post-clipboard delay promise and resumes a completed command. | No continuation after the await mutates the view/model in these methods. | Low/comment-only. Preserve the user-facing delay only if its UX purpose is stated; it is not a detached-state defect. |
| `src/renderer/scripting/api-wrapper/BrowserEditorFacade.ts:239-268` and `src/renderer/automation/commands.ts:199-456` | Polling/wait promises run inside the browser target/CDP-evaluated page. | They are automation waits, not renderer-owned view/model callbacks; their target promise settles or times out independently. | No renderer disposal change; keep their API wait semantics. |

The highest-risk group is the implementation order. The low-risk entries still receive an explicit
decision so “not a defect” does not become an unexamined timer.

## Implementation Plan

Implement in this order, with real late-state defects before timing tidiness and comments last:

1. **Close late state access first.** In
   `src/renderer/editors/video/VideoEditor.ts`, add an owned navigation-frame handle or
   generation to `navigateToTrack()` and cancel/invalidate it from `dispose()`. Guard the frame
   before reading `page.panelEditors` and before calling `selectByHref`. In
   `src/renderer/editors/browser/BrowserTabsModel.ts`, add timer/generation ownership for the
   300 ms bookmark preload and re-check liveness after `BrowserBookmarks.init()` before assigning
   `bookmarks`, configuring it, or updating `model.state`. In
   `src/renderer/editors/browser/BrowserTorModel.ts`, own both 500 ms overlay timers (or use one
   generation-guarded timer path), cancel/invalidate on `dispose()`, and guard every delayed state
   write. In `src/renderer/api/pages/PageModel.ts`, give both deferred cleanup paths a page-owned
   pending handle/generation and make `dispose()` drain or invalidate them while preserving
   detach-before-dispose and conditional cache deletion.

2. **Remove zero-delay ordering hacks that have synchronous replacements.** Update the methods
   named in Part 1 to direct calls: `TreeProviderViewModel.collapseAll`,
   `TreeProviderViewImpl.onRootKeyDown`, `ArchiveEditor.onMainEditorChanged`, all four Explorer
   panel-open methods at lines `126/132/144/150`, and `ForceGraphRenderer.handleResize`. For
   `FileListModel.showSearch` and both `BrowserUrlBarModel` selection paths, use the existing
   cancellable `focusAfterPaint` path because visibility is not fully proven at the direct-call
   moment. Register its cancellation with the owning view; no raw zero-delay timer should remain.

3. **Preserve only proven waits.** Keep the Monaco model-disposal deferral with a comment naming
   the `setModel(null)`/editor teardown boundary. In `TextareaView.scheduleAutoFocus`, replace the
   raw zero-delay timer with the existing `focusAfterPaint`/`afterPaint` cancellation contract,
   because the verified dependency is the next paint after a parent inserts the child. In
   `PagesModel.checkEmptyPage`, keep the callback and state explicitly that it waits for page
   removal observers. All retained callbacks must satisfy the governing rule in their source
   comments: **every deliberate deferral names what it waits for, or becomes a direct call.**

4. **Keep the counters, but document their actual contract.** In
   `ArchiveEditor.ts` and `ExplorerEditorModel.ts`, retain `revealVersion` as a monotonic command
   token consumed by the secondary view; it is not a forced render. Make the two
   `onPanelExpanded` updates direct and comment that the view binding schedules the cancellable
   animation-frame reveal. Do not replace the token with a same-value href comparison: repeated
   reveal requests are meaningful and the model does not own the view's TreeProvider model.

5. **Replace the false TreeProvider framework explanation.** In
   `TreeProviderViewModel.revealItem`, delete the event-loop await and the React comment. The
   awaited provider loads publish state synchronously, `TreeProviderViewImpl` pumps the new tree
   props synchronously, and `TreeModel.scrollToRowAfterPaint` is the existing layout-aware
   mechanism. The final direct `await this.treeModel?.revealItem(href)` must remain guarded by the
   model/view lifecycle already used by the Tree model.

6. **Finish low-risk disposal inventory.** Track and cancel pending
   `VirtualFlexGridView` measurement frames as a set, and give the Mneme status delayed config-open
   a current-state check. Leave the Board frame-load timeout and BoardTarget readiness polling as
   bounded, automation-owned waits: disposal resolves/clears the waiters and clears `loadedTabs`,
   while neither callback writes a view/model. Leave process-lifetime timers, automation waits,
   global progress expiry, and post-clipboard promise delays unchanged unless their comments are
   needed; record their no-disposed-owner rationale. Do not touch the GraphEditor exemption.

7. **Comment-only pass and verification.** Add true wait comments at every retained deliberate
   deferral, verify all three exemptions and the full current census again, and check that every
   newly introduced handle is cancelled by its owner. No unit tests or test harnesses are part of
   this project task.

## Concerns

- The epic's 16/11 figures do not count multiline calls; the current robust census is 23/13.
  The implementation agent must use the exact current site table and not silently revert to the
  stale single-line count.
- A zero-delay callback may be load-bearing even when its old explanation is false. In particular,
  the TreeProvider await must be tested against the actual Tree model/state handoff before deletion.
- `afterPaint` has a 100 ms background-window fallback and returns cancellation, so it is suitable
  only for callbacks whose verified dependency is a paint; it is not a generic ordering fix.
- Disposal safety must distinguish a callback that is harmless after disposal from one that can
  mutate detached DOM, a disposed model, page state, or external resources.

## Acceptance Criteria

- [ ] Every current zero-delay call is classified as a direct call or a retained deferral with a
      comment naming exactly what it waits for.
- [ ] The FileList and Browser URL focus paths use an owner-cancelled after-paint helper where
      visibility is not proven; the TreeProvider focus path retains its source-backed visibility
      proof before becoming direct.
- [ ] The three verified exemptions remain unchanged in behavior and are listed as no-change
      files/sites.
- [ ] Both `revealVersion` counters have a source-backed decision; any retained counter has a
      comment explaining why direct invocation is insufficient.
- [ ] The TreeProvider reveal path names the real synchronization dependency, or replaces the
      await with that mechanism; it does not rely on the false React explanation.
- [ ] The named deep-collapsed-subtree manual exercise confirms reveal scrolls the off-screen row
      into view, rather than only selecting it.
- [ ] Every renderer timer, interval, and animation frame has a disposal finding, with high-risk
      late callbacks fixed first and harmless/comment-only cases explicitly documented.
- [ ] The exact census commands and resulting counts remain in this document.
- [ ] The document includes the no-change file list and no dashboard entry is added.

## Files needing NO changes

These files were audited and their timer/animation ownership is already safe or intentionally
process/automation-owned. They are not implementation targets for US-1221:

- `src/renderer/core/state/events.ts` — mandatory async-rethrow exemption.
- `src/renderer/scripting/ScriptContext.ts` — mandatory script-facing event-loop yield exemption.
- `src/renderer/editors/graph/GraphEditor.ts` — mandatory click-ordering exemption.
- `src/renderer/components/file-search/FileSearchView.ts`.
- `src/renderer/components/git-tree/GitTreeView.ts`.
- `src/renderer/editors/archive/ArchiveSecondaryView.ts`.
- `src/renderer/editors/explorer/ExplorerSecondaryView.ts`.
- `src/renderer/editors/browser/BookmarksDrawer.ts`.
- `src/renderer/editors/browser/BrowserTabsPanel.ts`.
- `src/renderer/editors/browser/BrowserView.ts`.
- `src/renderer/editors/draw/DrawBodyView.ts`.
- `src/renderer/editors/git-tree/GitChangesView.ts`.
- `src/renderer/editors/graph/GraphTooltipModel.ts` and `GraphTooltipView.ts`.
- `src/renderer/editors/markdown/CodeBlock.ts`, `MarkdownImage.ts`, and `MarkdownBodyView.ts`.
- `src/renderer/editors/mermaid/MermaidEditor.ts`.
- `src/renderer/editors/mcp-inspector/McpConnectionManager.ts`.
- `src/renderer/editors/mneme-config/MnemeConfigEditorModel.ts`.
- `src/renderer/editors/rest-client/RestClientShared.ts` for its existing cancellable frame path.
- `src/renderer/editors/settings/sections/BrowserProfilesSectionModel.ts` and
  `McpSectionModel.ts`.
- `src/renderer/editors/text/TextEditorModel.ts`.
- `src/renderer/editors/base/TextChromeView.ts`.
- `src/renderer/uikit/Notification/AlertItemView.ts`.
- `src/renderer/uikit/ImageViewport/ImageViewportView.ts`.
- `src/renderer/uikit/Menu/MenuModel.ts`.
- `src/renderer/uikit/PathInput/PathInputModel.ts`.
- `src/renderer/uikit/TruncatedText/TruncatedTextView.ts`.
- `src/renderer/uikit/VirtualGrid/VirtualGridView.ts`.
- `src/renderer/editors/board/BoardEditorModel.ts` and
  `src/renderer/editors/board/BoardTargetModel.ts` for their bounded automation waits that do not
  reach disposed view/model state.
- `src/renderer/ui/sidebar/OpenTabsListView.ts` and `MenuBarView.ts`.
- `src/renderer/core/utils/scheduling.ts` — its existing helpers already return cancellation;
  extend only if the verified implementation needs a shared primitive.

## Files Changed

| File | Planned change |
|---|---|
| `src/renderer/components/file-list/FileList.ts` | Route search focus through the owning view's cancellable `focusAfterPaint` path. |
| `src/renderer/components/file-list/FileListView.ts` | Own/cancel the after-paint search focus disposer. |
| `src/renderer/components/tree-provider/TreeProviderViewModel.ts` | Replace collapse/reveal timers with direct calls and remove the false React await. |
| `src/renderer/components/tree-provider/TreeProviderViewImpl.ts` | Replace search-field focus timer with a direct call. |
| `src/renderer/editors/archive/ArchiveEditor.ts` | Replace panel expansion timer and reveal-token timer with direct calls; document the token contract. |
| `src/renderer/editors/browser/BrowserUrlBarModel.ts` | Route URL focus/selection through a cancellable after-paint path where visibility is not proven. |
| `src/renderer/editors/browser/BrowserView.ts` | Own/cancel the URL focus/selection scheduling used by the toolbar. |
| `src/renderer/editors/browser/BrowserTabsModel.ts` | Own/cancel delayed bookmark preload and guard completion after disposal. |
| `src/renderer/editors/browser/BrowserTorModel.ts` | Own/cancel overlay timers and guard delayed state writes. |
| `src/renderer/editors/explorer/ExplorerEditorModel.ts` | Replace panel expansion timers and reveal-token timer with direct calls; document the token contract. |
| `src/renderer/editors/graph/ForceGraphRenderer.ts` | Replace resize force-update timer with a direct call. |
| `src/renderer/editors/shared/MonacoEditorHostView.ts` | Retain model-disposal deferral with its verified teardown-boundary comment. |
| `src/renderer/editors/shared/MonacoDiffEditorHostView.ts` | Retain model-disposal deferral with its verified teardown-boundary comment. |
| `src/renderer/editors/video/VideoEditor.ts` | Own/cancel navigation-selection frame and guard after disposal. |
| `src/renderer/uikit/Textarea/TextareaView.ts` | Replace zero-delay autofocus with cancellable `focusAfterPaint`. |
| `src/renderer/uikit/VirtualGrid/VirtualFlexGridView.ts` | Track and cancel post-attach measurement frames on disposal. |
| `src/renderer/api/pages/PageModel.ts` | Own/generation-guard deferred editor/cache cleanup across page disposal. |
| `src/renderer/api/pages/PagesModel.ts` | Retain empty-page deferral with its page-removal-observer comment. |
| `src/renderer/api/mneme-status.ts` | Re-check current status before delayed config opening. |
| `src/renderer/core/utils/scheduling.ts` | Reuse existing paint/focus helpers; extend only if the verified implementation requires it. |

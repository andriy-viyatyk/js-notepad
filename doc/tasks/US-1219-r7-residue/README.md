# US-1219 — R7 residue: `FileList`, `ImageViewport`, `VirtualFlexGridModel`, and two re-examinations

## Goal

Resolve the remaining R7 shape work in the current tree without pretending that this strand closes
the epic's proportionality property. Strand 2 closes none of EPIC-077's four statements; the
`ImageViewport` work is the exception in scope because its DOM ownership also advances statement 4.

This document is a plan only. Do not add a dashboard entry: EPIC-077 already lists US-1219.

## Background

The investigation was performed against the current working tree on 2026-08-30. The worktree has
unrelated in-progress changes from sibling tasks; the source files named below were inspected but
not modified during this investigation. The epic's plan-page citations were treated as leads, then
rechecked against the files themselves.

### Verification commands recorded

These are the `rg`/tree commands used to establish the current paths, consumers, and claims:

```text
rg --files src/renderer | rg '(FileList|ImageViewport|VirtualFlexGrid|MultiListBoxModel|PopoverModel)'
rg -n --glob '*.ts' --glob '*.tsx' 'FileListModel|new FileList|ImageViewportModel|VirtualFlexGridModel|MultiListBoxModel|PopoverModel|setViewFocusHandlers|clearViewFocusHandlers' src/renderer
rg -n -C 12 'fileListModel|FileListModel' src/renderer/ui/sidebar/MenuBarView.ts src/renderer --glob '*.ts' --glob '*.tsx'
rg -n --glob '*.ts' --glob '*.tsx' 'file-list/FileList|ImageViewport/ImageViewport|ImageViewportModel' src
rg -n -i 'not react|react' src/renderer/uikit/ImageViewport/ImageViewport.ts src/renderer/uikit/ImageViewport src/renderer/uikit/ImageViewport/ImageViewportView.ts
rg -n -C 8 'init\(|cancelResize|resizeCleanup|startResize|addEventListener|removeEventListener' src/renderer/uikit/Popover/PopoverModel.ts src/renderer/uikit/Popover/PopoverView.ts
rg -n -C 3 'memo\(|IMemo|memorize|setProps|derive|resolveItems|filtered|toggleSelectAll' src/renderer/uikit/MultiListBox/MultiListBoxModel.ts
rg -n -C 3 'new VirtualFlexGridModel|VirtualFlexGridModel|rowHeights|setRowHeight|setGridModel|setProps|commitRowHeight' src/renderer/uikit src/renderer/editors --glob '*.ts' --glob '*.tsx'
```

The exact current line count for `src/renderer/uikit/MultiListBox/MultiListBoxModel.ts` was also
checked with `(Get-Content ...).Count`; it is 190 lines in this checkout.

## Implementation Plan

### Part 1 — `FileList`: preserve the external model consumer, remove the inversion

#### Verified findings

`src/renderer/components/file-list/FileList.ts:37-76` contains `FileListModel`. Its state setters
are at `:41-58`, but `showSearch()` at `:53-56` calls a view callback through
`focusSearchInput`, `hideSearchAndFocus()` at `:63-66` calls another view callback, and
`setViewFocusHandlers()` / `clearViewFocusHandlers()` are at `:68-76`. The view supplies those
callbacks from `src/renderer/components/file-list/FileListView.ts:52-70`, including
`searchInput.focus()` and `root.focus()`. This is the recorded inversion: the model is handed DOM
actions by the view and later invokes them.

The model cannot be merged wholesale into `FileListView`. `src/renderer/ui/sidebar/MenuBarView.ts`
imports `FileListModel` at `:16`, stores a model at `:144`, captures `RecentFileListView.model`
at `:490`, and invokes `fileListModel.showSearch()` at `:592` for Ctrl+F. The only current
consumer outside the file-list view path is this MenuBar route, but it is enough to make the
epic's proposed merge unavailable as written.

Current shape:

```ts
// FileList.ts
showSearch = () => {
    this.setSearchVisible(true);
    setTimeout(() => this.focusSearchInput?.(), 0);
};

setViewFocusHandlers = (focusSearchInput: () => void, focusRoot: () => void) => {
    this.focusSearchInput = focusSearchInput;
    this.focusRoot = focusRoot;
};
```

#### Planned change

1. Keep `FileListModel` as the state/command model in
   `src/renderer/components/file-list/FileList.ts`; do not merge it into the view. Remove its
   stored focus callbacks and the `setViewFocusHandlers()` / `clearViewFocusHandlers()` API.
   Make `showSearch()` state-only and leave `hideSearch()` state-only. Focus is a view command,
   not model state.
2. In `src/renderer/components/file-list/FileListView.ts`, add the public view command used by
   the parent (`showSearch()`), and keep `hideSearchAndFocus()` in the view. The view command must
   preserve the current zero-delay focus of the search input, with a live/disposal guard. Rewire
   the clear button, root Escape, and search-input Escape to this view command. Remove the driver
   cleanup and mount-time calls for the deleted focus-handler pair.
3. In `src/renderer/ui/sidebar/RecentFileListView.ts`, expose a small `showSearch()` delegating to
   its owned `FileListView`. In `src/renderer/ui/sidebar/MenuBarView.ts`, retain the
   `RecentFileListView` capability rather than its model, remove the `FileListModel` import and
   field, and call the view command from Ctrl+F. This eliminates the external model consumer
   while keeping the existing parent-to-view action.

The task boundary with `US-1221 — The timing residue` is explicit:

- **US-1219 owns the ownership move.** The focus call migrates from
  `src/renderer/components/file-list/FileList.ts` to the view; the
  `setViewFocusHandlers()` / `clearViewFocusHandlers()` pair is deleted; and
  `RecentFileListView` / `MenuBarView` are rewired to the view command. Carry the existing
  zero-delay deferral across this move unchanged. Do not change it to a direct call or
  `focusAfterPaint` here.
- **US-1221 owns the timing.** Its current Part 1 table cites `FileList.ts:55`; after US-1219
  lands, that site will instead be the moved focus call in
  `src/renderer/components/file-list/FileListView.ts`'s `showSearch()` command. US-1221 must
  update its census/table and decide whether that moved call becomes direct `focus()` or uses
  `focusAfterPaint`.
- **US-1219 lands first.** US-1221's current model-file site will not exist after this task, so
  its timing change must target the new view location.

Target shape:

```ts
// FileListView.ts
public showSearch(): void {
    this.model.showSearch();
    setTimeout(() => {
        if (this.live) this.input.inputElement.focus();
    }, 0);
}
```

The exact live/disposal mechanism may use the view's existing lifecycle ownership, but it must not
reintroduce a callback registration from the view into the model. The observable behavior to keep
is: Ctrl+F opens search and focuses it; clear/Escape hides search and focuses the file-list root.

### Part 2 — `ImageViewport`: relocate the model and make measurement view-owned

#### Verified findings

`src/renderer/uikit/ImageViewport/ImageViewport.ts:34-260` contains `ImageViewportModel` in the
component-name file. It stores `containerRef` and `imageRef` at `:35-36`; reads
`getBoundingClientRect()` and image natural dimensions in `isContainerVisible()` and
`calculateFitScale()` at `:60-82`; and owns mouse/wheel/keyboard/load/resize handlers from
`:95-247`. Its `init()` at `:250-255` installs the window resize and container wheel listeners,
and `dispose()` at `:257-260` removes them. Thus it violates statement 4 beyond file placement:
the model owns DOM references, listener lifecycle, and mouse handlers because it performs DOM
measurement.

`src/renderer/uikit/ImageViewport/ImageViewportView.ts:47-59` currently sets the model's DOM refs
and wires the model handlers into native events. Its `scheduleSourceCheck()` at `:89-99` also
calls the model's image-load handler. The model's `copyToClipboard()` at `:190-197` retains the
image ref for clipboard work. The view and the toolbar expose the model through
`ImageViewportView.model` (`:31-33`), while `ImageToolbarView.ts:9-13`, `mermaid/index.ts:16,34`,
and `svg/index.ts:12,29` use the model type only to reach `copyToClipboard()`.

The epic's “not React” comment citation is not present in this checkout: the case-insensitive
search above returns no match, and current `ImageViewport.ts:148` is `handleWheel`. Record the
comment citation as stale, but retain the verified model-placement and DOM-ownership findings.

This task makes only a location/ownership change: move the model out of the component-name file,
and move DOM measurement and mouse/event ownership into the view. The timing and frequency of
every measurement must remain identical. No measurement cadence is authorized to change as a
consequence of the move; the existing event, image-load, window-resize, 50-ms source-check, and
visibility-microtask call points must each remain one-for-one. First move the code and verify it;
then perform the ownership refactor and verify it again.

#### Planned change

1. **File move and export gate.** Create
   `src/renderer/uikit/ImageViewport/ImageViewportModel.ts` containing the model state, constants,
   model props, and model-owned state/geometry operations. Move `ImageViewportProps` into
   `ImageViewportView.ts` with the view contract, then remove the now-unneeded
   `ImageViewport.ts` component-name file rather than leaving a new types-only file behind. Update
   `ImageViewport/index.ts` to export the props from `ImageViewportView.ts` and the model type from
   `ImageViewportModel.ts`.
2. Update these direct import consumers to the new owners: `ImageViewportView.ts`,
   `editors/image/ImageView.ts`, `editors/image/ImageToolbarView.ts`,
   `editors/mermaid/MermaidBodyView.ts`, `editors/mermaid/index.ts`,
   `editors/svg/SvgBodyView.ts`, and `editors/svg/index.ts`. Keep the public
   `src/renderer/uikit/index.ts` export routed through `./ImageViewport` so its external path does
   not change.
3. Run the three automated checks at this gate (`npm run typecheck`, `npm run lint`,
   `npm run build-prod`) before changing when or where any interaction is handled. The moved code
   must behave identically at this point.
4. **DOM ownership refactor.** Keep `ImageViewportModel` free of element/window references,
   listeners, and DOM event objects. Move the following to `ImageViewportView`: container/image
   references; native event handlers and listener registration/cleanup; visibility and layout
   reads; image natural-size reads; `preventDefault()`; and clipboard access. Pass plain measured
   values into model operations (container dimensions/position and image dimensions) so the model
   still owns zoom, pan, fit-scale, and state transitions without querying the DOM. Replace
   model `init()`/`dispose()` listener work with view-owned lifecycle cleanup, retaining the
   existing passive-false wheel listener.
5. Replace the toolbar's model-based clipboard escape hatch with a view-owned copy command. Use a
   callback such as `copyImage` in `ImageToolbarView`; wire it from `ImageView`, `MermaidBodyView`,
   and `SvgBodyView` to `ImageViewportView.copyToClipboard()`. Rename the current
   `imageModel`/`getImageModel` plumbing where necessary so no consumer depends on a model method
   that owns an image element.
6. Run the same automated checks again. Do not optimize scheduling or measurement frequency in
   this part: preserve the 50-ms source check, the visibility microtask, the existing window-resize
   measurement cadence, wheel zoom, drag pan, double-click reset, keyboard shortcuts, and copy
   behavior exactly. No measurement call point is expected to change; if moving one necessarily
   changes cadence, stop and name that specific call point before implementation continues. This is
   a DOM-boundary move, not a second behavioral change.

Before → after boundary:

```ts
// Before: ImageViewportView delegates a DOM-backed handler to the model.
model.setContainerRef(this.root as HTMLDivElement);
this.listen(this.root, "mousedown", model.handleMouseDown);
this.listen(this.root, "keydown", model.handleKeyDown);

// After: the view reads the event/DOM and calls a value-oriented model operation.
this.listen(this.root, "mousedown", this.onMouseDown);
this.listen(this.root, "keydown", this.onKeyDown);
// onMouseDown/onKeyDown measure the view-owned root and pass plain values to the model.
```

### Part 3 — `VirtualFlexGridModel`: verify the actual R7 complaint before touching it

#### Verified findings and verdict

`src/renderer/uikit/VirtualGrid/VirtualFlexGridModel.ts:17-111` is not a types-only file and is not
a thin delegate in the current tree. It owns committed and pending row-height arrays (`:19-21`),
a stable `rowHeight` function (`:29-44`), per-row 50-ms debouncing (`:46-56`), height clamping
(`:105-110`), and the commit that reports the changed row to the actual grid model (`:96-103`).
It has no DOM references, event listeners, or rendering code. The only source consumer is
`VirtualFlexGridView.ts`: the view owns the `ResizeObserver`, element-to-row maps, DOM measurements,
and passes measured values into the model at `:57`, `:68`, and `:85`; it also owns model disposal
at `:122-123`.

Verdict: **there is no R7 work here. Keep `VirtualFlexGridModel.ts` and
`VirtualFlexGridView.ts` unchanged.** Collapsing the collaborator into the view would mix the
measured-row policy with the DOM observer and discard a meaningful boundary; inventing a
types-only-file change would not describe the current source.

Before → after: no code change is authorized for this part. The relevant current boundary remains
`VirtualFlexGridView` measuring elements and calling `VirtualFlexGridModel.setRowHeight(row,
height)`, while the model commits row geometry through `GridModelCapability.update({ fromRow })`.

### Part 4 — re-examine the two stale collapse candidates

#### `MultiListBoxModel.ts` — verdict: keep it

The plan-page description is dead. `src/renderer/uikit/MultiListBox/MultiListBoxModel.ts` has no
`memo()` calls (the recorded search returns no matches), and the file is 190 lines here. Its
current logic is not a trivial shell: `setProps()` at `:78-99` performs identity-gated
derive-on-write for resolved items, selected keys, filtered sources/items, list-box items, and
visible selection counts; `deriveFiltered()` and `deriveListBoxItems()` at `:101-120` preserve
trait metadata and source-to-row alignment; and `setSearchText()` at `:135-140` updates all
search-dependent derived fields before publishing state. `toggle()` and `toggleSelectAll()` at
`:164-188` own controlled selection operations, while the stable `isSelected` predicate at
`:146-162` is a deliberate downstream repaint contract.

The view remains a DOM shell for search, select-all, and the inner `ListBox` in
`MultiListBoxView.ts`; the model is carrying reusable collection derivation and domain operations,
not six memo shims and four two-line setters. Verdict: **no collapse or merge of
`MultiListBoxModel.ts` in US-1219.**

Before → after: no code change is authorized. Keep the current derive-on-write shape:

```ts
// Current and retained.
if (itemsChanged || filterChanged) {
    this.filtered = this.deriveFiltered(this.state.get().searchText);
    this.listBoxItems = this.deriveListBoxItems();
}
```

#### `PopoverModel.ts:251` — verdict: dead citation, no work

The cited line is not an empty `init()`. In the current file, `:251` is the declaration of
`resizePointerId`; `init()` is at `:262-264` and owns `this.own(() => this.cancelResize())`. The
resize path at `:194-249` measures the popover, tracks pointer capture, installs temporary pointer
listeners, and cancels them safely; `PopoverView.ts:132-145` also explicitly cancels resize during
view disposal. The old “vestigial empty effect slot” citation is therefore confirmed dead.

Verdict: **do not plan work against `PopoverModel.ts` or `PopoverView.ts` in US-1219.** In
particular, do not remove `init()` or collapse the model based on the stale citation.

## Concerns

- **FileList ownership and focus timing:** the MenuBar currently reaches the model only because the
  view does not expose the command it needs. Route that command through `RecentFileListView` and
  `FileListView` before deleting the callback fields, then manually verify Ctrl+F, clear, Escape,
  and disposal. Do not turn `showSearch()` into a model command that silently loses focus.
- **ImageViewport sequencing:** file relocation and DOM-boundary ownership are separate gates. The
  first gate is an import/export move; the second changes who reads the DOM but must preserve every
  existing event, timer, cleanup order, scheduling point, and measurement frequency. No behavior
  optimization is included, and no cadence change is currently expected.
- **ImageViewport public API:** toolbar callers currently ask for a model to copy the image. The
  view-owned copy callback must be updated in image, Mermaid, and SVG paths together; otherwise a
  green typecheck could leave one toolbar action disconnected.
- **Part 3 and the re-examinations:** no source change is justified by the current evidence. A
  future collapse would require a new, specific complaint; it must not be manufactured to fill the
  R7 bullet.

All decisions are resolved for implementation: FileList stays split with view-owned focus,
ImageViewport gets a two-gate move and DOM separation with behavior preserved, and the other three
review targets stay unchanged.

## Acceptance Criteria

### Automated

Run all three after implementation, and record the results:

- `npm run typecheck`
- `npm run lint`
- `npm run build-prod`

These are the only automated signals for this strand. Do not add unit tests or test harnesses.

### Manual exercise list

1. **FileList:** open the Recent Files sidebar, invoke Ctrl+F from the MenuBar, confirm the search
   input opens and receives focus, then verify typing/filtering, clear, Escape-to-root-focus,
   switching away and back, and disposal leave no broken focus path.
2. **ImageViewport:** exercise the image/SVG/Mermaid viewport in its story/editor: load and reload
   an image, wheel-zoom at a point, drag and release, double-click reset, `+`/`-`/`0`/Ctrl+C,
   resize while visible and hidden, then dispose it. Confirm pan, zoom, and window-resize behavior
   is indistinguishable before and after both moves, including the timing and frequency of the
   measurement call points.
3. **VirtualFlexGridModel:** exercise the VirtualFlexGrid story's variable-height rows, delayed
   growth, recycling/scrolling, and teardown. Confirm measured rows settle and no source change
   was made to the model/view collaborator boundary.
4. **Re-examinations:** in the MultiListBox story, filter and use mixed/select-all selection while
   changing the controlled value; in the Popover story, open, resize, cancel, close, and reopen.
   Confirm both current lifecycles work and neither stale collapse candidate was changed.

### Structural checks

- `FileListModel` has no DOM callback fields or `setViewFocusHandlers`/`clearViewFocusHandlers`,
  and Ctrl+F reaches the view command through `MenuBarView`/`RecentFileListView`.
- `ImageViewportModel.ts` contains state and value-oriented operations only; no model file in the
  ImageViewport component owns an element reference, native listener, window listener, or DOM
  event handler. `ImageViewportView` owns measurement, event wiring, clipboard access, and cleanup.
  This task changes only location/ownership: pan, zoom, and window-resize behavior must be
  indistinguishable before and after, with identical measurement timing and frequency. No
  measurement cadence may change as a consequence of the move.
- `VirtualFlexGridModel.ts`, `VirtualFlexGridView.ts`, `MultiListBoxModel.ts`, and
  `PopoverModel.ts` remain unchanged by this task.
- `ImageViewport.ts` is gone, and all direct imports use the new view/model owners while the public
  UIKit barrel continues to export the component contract.

## Files Changed Summary

| File | Planned status | Purpose |
|---|---|---|
| `src/renderer/components/file-list/FileList.ts` | Modify | Keep state commands; remove view-focus callback inversion. |
| `src/renderer/components/file-list/FileListView.ts` | Modify | Own focus commands, event wiring, and deferred input focus. |
| `src/renderer/ui/sidebar/RecentFileListView.ts` | Modify | Expose the view-owned search command to its parent. |
| `src/renderer/ui/sidebar/MenuBarView.ts` | Modify | Route Ctrl+F through `RecentFileListView`, not its model. |
| `src/renderer/uikit/ImageViewport/ImageViewportModel.ts` | Add | New model owner for state and value-oriented zoom/pan operations. |
| `src/renderer/uikit/ImageViewport/ImageViewport.ts` | Delete | Remove the component-name file that currently contains the model. |
| `src/renderer/uikit/ImageViewport/ImageViewportView.ts` | Modify | Own props, DOM refs, measurements, events, clipboard, and lifecycle. |
| `src/renderer/uikit/ImageViewport/index.ts` | Modify | Re-export props/model from their new owners. |
| `src/renderer/editors/image/ImageView.ts` | Modify | Update props import and view-owned copy callback. |
| `src/renderer/editors/image/ImageToolbarView.ts` | Modify | Replace model clipboard access with a view command. |
| `src/renderer/editors/mermaid/MermaidBodyView.ts` | Modify | Expose/wire the viewport view copy command. |
| `src/renderer/editors/mermaid/index.ts` | Modify | Update model type/import and toolbar copy callback. |
| `src/renderer/editors/svg/SvgBodyView.ts` | Modify | Expose/wire the viewport view copy command. |
| `src/renderer/editors/svg/index.ts` | Modify | Update model type/import and toolbar copy callback. |

### Files explicitly needing NO changes

`src/renderer/uikit/VirtualGrid/VirtualFlexGridModel.ts`,
`src/renderer/uikit/VirtualGrid/VirtualFlexGridView.ts`,
`src/renderer/uikit/MultiListBox/MultiListBoxModel.ts`,
`src/renderer/uikit/MultiListBox/MultiListBoxView.ts`,
`src/renderer/uikit/Popover/PopoverModel.ts`,
`src/renderer/uikit/Popover/PopoverView.ts`,
`src/renderer/uikit/ImageViewport/image-raster.ts`,
`src/renderer/uikit/ImageViewport/ImageViewport.css`,
`src/renderer/uikit/ImageViewport/ImageViewport.story.ts`, and
`src/renderer/uikit/index.ts` (its public re-export path remains through `./ImageViewport`).

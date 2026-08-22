# US-1028 — `components/file-search/` vanilla view and VirtualGrid collection

**Status:** Implemented
**Priority:** High
**Epic:** [EPIC-058 — De-React Epic D: Shell and shared components](../../epics/EPIC-058.md)
**Created:** 2026-08-23
**Depends on:** [US-1026 — `components/icons/` vanilla DOM views](../US-1026-components-icons-vanilla-views/README.md), [US-1027 — file list and file grid](../US-1027-file-list-grid/README.md), and the vanilla [`VirtualGrid`](../../../src/renderer/uikit/VirtualGrid/) engine described in the [model-view pattern](../../standards/model-view-pattern.md)
**Blocks:** US-1029's remaining collection work can reuse the same direct-DOM icon/cache and `VirtualGrid` patterns

## Goal

Convert `src/renderer/components/file-search/` to a framework-free `FileSearchView` while
preserving the existing `FileSearch` React-facing props and the search model's IPC, persistence,
debounce, filtering, expansion, and result-click behavior.

This is the first Epic D consumer to leave the legacy React `RenderGrid` engine. Its result cells
must be real pooled `HTMLElement`s rendered through the C3 `VirtualGridView`; no React root or
React cell renderer remains in the file-search unit.

## Background

### Current measured surface

The unit is three tracked files and 783 lines:

| File | Lines | Responsibility | Target |
|---|---:|---|---|
| `FileSearch.tsx` | 407 | React hooks, Emotion root, UIKit composition, React `RenderGrid` cells | Thin `mountVanilla(FileSearchView, props)` face plus unchanged public types |
| `FileSearchModel.ts` | 374 | Search state, IPC listeners, debounce, saved-state emission, result accumulation | Remains the app-coupled model; add only lifecycle protection required by the native owner |
| `index.ts` | 2 | Public barrel | Continue exporting `FileSearch` and `FileSearchProps` / `FileSearchState` |

`FileSearch` has one runtime caller, `editors/explorer/SearchSecondaryView.tsx`; the explorer
editor also consumes `FileSearchState` for persistence. Neither caller should change in this
task. The component is app-coupled by design: `FileSearchModel` imports settings, Electron IPC,
the shared search channel, and file-path helpers, so it remains under `components/` rather than
moving into `uikit/`.

### Existing behavior to preserve

- The model is constructed once for the lifetime of the component from `folder`, the optional
  saved state, and `onStateChange`. The current React face does not reconstruct it when its props
  are re-rendered; the vanilla face should preserve that lifetime contract unless a separate model
  API is deliberately added.
- Query, include-pattern, and exclude-pattern changes update state and schedule the same 500 ms
  debounced search. Enter runs it immediately. Empty query cancels the active search and clears
  rows. Escape clears a non-empty query and otherwise blurs the search field.
- IPC results append a file row followed by one row per distinct matching line. The rows remain in
  a plain model field; `resultsVersion` is the reactive signal that tells the view to rebuild its
  filtered projection. Collapsing a file removes only its following line rows from the projection.
- The filter button shows or hides the two pattern fields. The status line reports searching
  progress, no results, match/file counts, and the truncated-result cap.
- File rows show the path as a native `title`, a 12 px expand/collapse chevron, a 16 px direct-DOM
  file icon, the basename, and the match count. Clicking the chevron toggles expansion without
  opening the file; clicking elsewhere in the row opens the file. Line rows show the number and a
  trimmed, context-limited line with the existing `.highlighted-text` span around the match.

### The two virtualization engines

`FileSearch.tsx` currently imports `RenderGrid` and `RenderGridModel` and returns React nodes from
`renderCell`. The target is `uikit/VirtualGrid/VirtualGridView`:

```text
FileSearchView
  └─ results host
       └─ VirtualGridView[data-type="virtual-grid"]
            └─ pooled cell HTMLElement[data-part="area"] children
```

`VirtualGridView` owns the measured window, scroll/resize lifecycle, requestAnimationFrame paint,
and cell pool. Its `renderCell` contract returns `HTMLElement | undefined`, and the caller must
overwrite every property it owns because a recycled cell retains its children, attributes,
classes, and listeners. `VirtualGridView.model.update({ all: true })` is the explicit repaint path
when row content changes without a geometry change.

### Styling and boundaries

The current `FileSearchRoot` is one Emotion block with private `fs-*` selectors. There are no
`>`, `:empty`, `:nth-child`, `+`, or `~` selectors in that block, and no other renderer source
targets the `fs-*` names. Extract it to a co-located `FileSearch.css` under `@layer app`, rooted at
`[data-type="file-search"]`. The root's `display: flex`, full size, and hidden overflow remain
the layout contract; row geometry remains owned by `VirtualGridView`'s inline pixel styles.

`InputView`, `IconButtonView`, `VirtualGridView`, and the direct icon factories already carry their
own runtime contracts. `FileSearchView` must import its own stylesheet; the child views' imports
must remain reachable through the direct view imports, not only through their React faces.

## Implementation plan

### 1. Preserve the public face and remove the React render loop

- Keep `FileSearchProps`, `FileSearchState`, their existing field names, callback signatures, and
  barrel exports. Do not widen the public API with an `onModel` callback or a React-shaped cell
  renderer.
- Reduce `FileSearch.tsx` to the public type declarations and a React-compatible shim that returns
  `mountVanilla(FileSearchView, props)`. Remove its hooks, Emotion styles, React icon imports,
  `RenderGrid` imports, row components, and JSX cell renderer.
- Keep `FileSearchModel.ts` as the owner of IPC and search semantics. If the model is changed for
  disposal safety, make it a narrow lifecycle guard: a pending 500 ms debounce must not send a new
  IPC request after the view has been disposed. Do not move IPC or settings access into the view.

### 2. Build `FileSearchView` with explicit ownership and native UIKit children

Create `src/renderer/components/file-search/FileSearchView.ts` as a public-constructor
`VanillaView<FileSearchProps>`:

- Construct the stable `[data-type="file-search"]` root and the `FileSearchModel` in the
  constructor. Register `model.dispose()` immediately with `own()` because the model is created
  there and must also be released if the view is disposed before mount.
- Construct the three detached `InputView`s (query, include pattern, exclude pattern) and one
  `IconButtonView` for the filter toggle, register them with `child()`, and mount them from
  `onMount()` after their hosts are attached. The input refs and native event callbacks must
  preserve the existing direct-value `onChange` API and the `Enter` / `Escape` behavior. Hidden
  filter inputs must not occupy layout space when the filter panel is closed.
- Create the input area, query row, status host, results host, and empty-results host with
  `document.createElement`. The empty message is text content, never interpolated HTML.
- Focus the query input on the first animation frame after mount, matching the current
  `requestAnimationFrame` behavior. Register cancellation for that frame so disposal cannot focus
  a detached field.
- Bind the chrome fields together (query, includePattern, excludePattern, showFilters,
  isSearching, filesSearched, totalMatches, totalFiles, and truncated), but bind
  `resultsVersion` separately. Progress events update the status without repainting every pooled
  cell. Both bindings call one `applyArm()` for the grid/empty decision; only the version binding
  rebuilds the filtered projection and calls `grid.model.update({ all: true })`.
- Focus the query field through its callback ref from the scheduled animation frame. `autoFocus`
  is not equivalent: `InputView` applies it synchronously while the view is mounting.

### 3. Replace `RenderGrid` with a conditional `VirtualGridView`

- Remove the `RenderGrid` / `RenderGridModel` dependency from this unit and import
  `VirtualGridView` directly from `uikit/VirtualGrid`.
- Follow `ListBoxView` and `TreeView`: use a `display: contents` grid host with explicit
  `enterRealArm()` / `leaveRealArm()` ownership. Claim each new `VirtualGridView` for that arm,
  attach its root before `mount()`, and dispose/remove it on leave so a new search starts at the
  top. Do not also register the conditional grid with `child()`.
- Give the grid one stable `renderCell` function and pass `rowCount: () => this.filtered.length`, `columnCount: 1`,
  `rowHeight: 22`, `columnWidth: () => "100%"`, `fitToWidth: true`. Keep the existing result order
  and fixed row height.
- On every `resultsVersion` projection, update the active grid's row count and then call its
  model's `update({ all: true })`. The full repaint is required even when collapsing a file leaves
  the same row count (for example, a file with no line rows), because the visible chevron and cell
  contents still changed. When the result count reaches zero, clear the swap and show the exact
  `No results found` message only when the query is non-empty and the search is no longer running.
- Subscribe once to `subscribeFileIconElements`. When a system icon, trusted-board association,
  or board icon becomes available, request `{ all: true }` on the active grid so pooled visible
  cells rebuild their direct icon elements; a future search resolves the current cache even if no
  grid is active.

### 4. Implement a recycling-safe native cell renderer

Port the three React row helpers into the stable `renderCell` callback in `FileSearchView`:

- Choose `p.previous ?? p.recycle?.() ?? document.createElement("div")`, then overwrite its
  inline geometry from `p.style`, class list, title, and event behavior on every call. Remove any
  row-specific attributes or classes left by the previous occupant.
- For a file row, use `fs-row fs-file-row`, set the title to `row.filePath`, keep the chevron inside
  its existing `fs-file-icon` span, then append the direct `createFileIconElement({ path, width:
  16, height: 16 })` result, the basename, and the match count. The chevron click must stop
  propagation before calling `model.toggleFileExpanded`; the row click calls the latest
  `onResultClick(filePath)`.
- For a line row, use `fs-row fs-line-row`, append the line number and build the same trimmed,
  60-character-context text projection with text nodes plus a nested
  `span.highlighted-text`. The row click calls the latest `onResultClick(filePath, lineNumber)`.
- Replacing the cell's own children is allowed because the cell is wholly owned by the renderer;
  it is not a `KeyedList` or structural-helper container. Do not append a wrapper merely to mimic
  React's `display: contents` row helper—the cell itself is already the positioned row element.
- Never close over a render-time `onResultClick` or row object in a listener that survives pooling.
  Use a `WeakMap<HTMLElement, CellRecord>`: install the cell and chevron listeners once, rewrite
  the record on every render, and resolve the callback through the current `FileSearchView.props`.
- Keep the FileSearch-specific `substring(startOffset + 1)` arithmetic and emit text nodes plus
  one `.highlighted-text` span. Do not replace it with `highlightInto`, whose tokenisation rules
  are different.

### 5. Extract the Emotion block to static CSS

Create `src/renderer/components/file-search/FileSearch.css`, import it from `FileSearchView.ts`,
and translate the existing `FileSearchRoot` rules without changing selector shape or metrics:

- Root the rules at `[data-type="file-search"]` and keep the input-area/query-row, status,
  results, row, file-row, line-row, and empty-state selectors under that root.
- Use the existing `--space-*`, `--font-*`, and `--color-*` variables for the current padding,
  gaps, sizes, text/icon colors, and hover background. Keep the 22 px row height and the current
  `overflow`, `flex`, `ellipsis`, `white-space`, and `user-select` behavior.
- Leave the global `.highlighted-text` ownership in `theme/GlobalStyles.tsx`; FileSearch only
  emits that established class. Do not copy the global rule into the new component stylesheet.
- Preserve the cross-component `[data-type="input"] { flex: 1 1 auto; }` rule under the app-layer
  root. The `uikit` layer is intentionally below `app`.
- Confirm the `@layer app` stylesheet is imported exactly once and that no unlayered source rule
  targets `[data-type="file-search"]` or any `fs-*` class. The layer change is safe only after
  that check; the global highlight rule is intentional and remains unlayered.

### 6. Verify the unit and record the Epic D measurement

- Run `npm run typecheck`, `npm run lint`, `npm run build-prod`, and `git diff --check`.
- Confirm the file-search unit has no `RenderGrid`, `RenderGridModel`, Emotion, or React hook
  imports, while `FileSearch`, its public types, and `SearchSecondaryView` still compile without
  caller changes.
- Smoke-test the real Explorer search route in both themes: initial focus, query debounce and
  Enter, progress/status/no-results states, include/exclude fields, Escape clear/blur, file
  expansion and collapse, line/file navigation, persisted state, and active-search cancellation.
- Populate enough results to scroll through multiple virtualized windows. Verify pooled cells do
  not retain a previous row's title, icon, chevron state, match count, line text, click target, or
  highlight; verify system/board icon cache updates repaint existing visible file rows.
- Before changing renderer source, take the React FileSearch baseline on a settled populated
  search using the same query/expand action and observer options. Reset immediately before the
  action and record raw observer records plus options. Then take the vanilla after-number and put
  both in `EPIC-058.md` Notes. The baseline is currently pending because the Persephone MCP was
  unavailable during this implementation; do not invent either number or mark this criterion
  complete until the live measurement is taken.

## Concerns / Open questions

1. **Pooled cells are a correctness boundary, not just a performance detail.** `VirtualGrid` keeps
   children, attributes, classes, and listeners on a released cell. A renderer that only changes
   the row text will leak a previous file's `title`, file-row class, icon, or click semantics into
   a line row. The plan requires a full overwrite and an `all` repaint on `resultsVersion`; review
   the file/line transition and a scroll reuse transition explicitly.

2. **A changed row projection does not always change rowCount.** Collapsing a file with no line
   children leaves the virtual row count unchanged, so only `VirtualGridView.model.update({ all:
   true })` guarantees that its chevron and cell children are rebuilt. Omitting this call creates
   a masked defect: a collapse appears to work only after scrolling or another geometry change.

3. **The native grid must not retain the old search position across a cleared search.** Keeping one
   hidden `VirtualGridView` alive would preserve its offset while the current React `RenderGrid`
   is unmounted when results disappear. The `display: contents` grid arm deliberately disposes the
   old grid and creates a fresh one, preserving the current reset-to-top behavior and keeping
   hidden-grid resize/scroll work out of the idle search panel.

4. **Direct DOM file icons have asynchronous resolution.** `createFileIconElement` may initially
   return the default icon while system icons or trusted-board associations resolve. The view must
   subscribe through `subscribeFileIconElements` and repaint all visible cells, not cache an icon
   per file forever. The subscription must be disposed before the model/grid teardown.

5. **The model's debounce helper has no cancellation method.** A pending debounce can fire after a
   view is disposed. Preserve the model API but set a disposed guard before removing IPC listeners
   and short-circuit both `sendSearch` and `cancelSearch`; the latter is important because the
   cancel channel has no search id and a late empty-query callback could cancel another live view's
   search. Do not turn the shared debounce helper into a task-specific API in this conversion.

6. **The public callbacks are intentionally React-shaped at the outer boundary.** `InputView`
   delivers a direct string for `onChange`, while its residual keyboard callback reaches the
   existing public-event facade and must continue to expose `event.key` and `preventDefault()`.
   `FileSearchView` may use type-only React event types at the compatibility seam, but must not
   create a React root for inputs, rows, icons, or the grid.

7. **The static stylesheet is an app-layer conversion of an unlayered Emotion block.** There are
   no current external `fs-*` selectors or structural selectors that depend on Emotion's insertion
   order, but verify that fact before landing. The global `.highlighted-text` rule is intentionally
   outside this stylesheet and must continue to paint the match in both themes.

8. **The component's construction props are lifetime inputs today.** `FileSearchModel` captures
   `folder`, the initial saved state, and `onStateChange` at construction, and the current React
   component does not provide a model-prop update path. The conversion should not silently invent
   one; if future callers need to change the search root while mounted, add an explicit model API
   in a separate task rather than reconstructing the model from every adapter update.

## Acceptance criteria

- [ ] `FileSearch` preserves its exported props/types and `SearchSecondaryView` requires no caller
  change; the component mounts through `FileSearchView`.
- [ ] `FileSearchView` owns model disposal, UIKit child views, the focus frame, icon subscription,
  grid branch, and state binding with no post-disposal IPC or DOM writes.
- [ ] `FileSearchModel` remains the owner of IPC, settings, debounce, result accumulation,
  filtering, persistence callbacks, and search actions; its visible behavior is unchanged.
- [ ] No `RenderGrid`, `RenderGridModel`, `styled`, `useEffect`, `useMemo`, `useCallback`, `useRef`,
  or React cell/row component remains under `components/file-search/`.
- [ ] Search results render through `VirtualGridView` and its `HTMLElement` cell contract; pooled
  reuse leaves no stale row-specific DOM, listener, icon, title, or highlight state.
- [ ] Progress-only state updates repaint the status/chrome without repainting the whole grid; a
  `resultsVersion` update repaints the projection even when rowCount is unchanged.
- [ ] The filter toggle passes registered icon names (`filter-arrow-up` / `filter-arrow-down`),
  hidden filter inputs use `display: none`, and the status host is hidden when empty.
- [ ] Query, Enter, Escape, filters, progress, no-results, truncation, file expansion, navigation,
  saved state, cancellation, and async file-icon refresh all behave as before.
- [ ] `FileSearch.css` is co-located, imported by the direct view, uses `@layer app`, and matches
  the existing themed layout/typography/colour behavior in both light and dark themes.
- [ ] `npm run typecheck`, `npm run lint`, `npm run build-prod`, and `git diff --check` pass.
- [ ] The React-before and vanilla-after Epic D Rule 4 measurements are recorded in `EPIC-058.md`
  Notes with the same interaction, observer options, and raw record counts.

## Related work

- [EPIC-058 — De-React Epic D](../../epics/EPIC-058.md)
- [US-1026 — `components/icons/` vanilla DOM views](../US-1026-components-icons-vanilla-views/README.md)
- [US-1027 — file list and file grid](../US-1027-file-list-grid/README.md)
- [US-996 — vanilla UIKit contracts](../US-996-vanilla-uikit-contracts/README.md)
- [US-997 — icon registry DOM builders](../US-997-dom-icon-path/README.md)
- [US-989 — React/vanilla mount adapter](../US-989-boundary-adapters/README.md)
- [Virtualized DOM views](../../standards/model-view-pattern.md)

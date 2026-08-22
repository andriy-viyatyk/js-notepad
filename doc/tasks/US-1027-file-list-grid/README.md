# US-1027: `FileList` and `FileGrid` — vanilla views and direct DOM icons

**Status:** Implemented
**Epic:** [EPIC-058 — De-React Epic D: Shell and shared components](../../epics/EPIC-058.md)
**Depends on:** [US-1026 — `components/icons/` vanilla DOM views](../US-1026-components-icons-vanilla-views/README.md)
**Related sequencing:** US-1028's later `RenderGrid` collection is independent of this task; no caller migration is required here.

## Goal

Convert `components/file-list/` and `components/file-grid/` from React implementations to vanilla
views behind their existing React-facing exports. Preserve the public props, selection/search/context
menu behavior, and the two Git-tree callers while making default file icons real DOM elements rather
than React or serialized HTML subtrees.

This is the first Epic D leaf that composes already-vanilla UIKit views from an app-coupled parent:
`FileListView` owns `ListBoxView`, `InputView`, and `IconButtonView`; `FileGridView` owns
`DataGridView`. The existing `fileIconMarkup()` string boundary is retired because the required
`av-grid@2.2.4` release widens `CellRenderer`'s element arm to `Element`.

## Background and verified inventory

The Epic D surface was measured at the opening commit. On the current tree the tracked component
files are:

| Area | Current files | Current lines | Production JSX sites |
|---|---:|---:|---:|
| `components/file-list/` | `FileList.tsx`, `index.ts` | 242 | 2 (`RecentFileList`, `CommitDiffPanel`)
| `components/file-grid/` | `FileGrid.tsx`, `FileGrid.css`, `index.ts` | 132 | 2 instances in `GitChangesView`

The source files are smaller than the epic's original line estimate because the current checkout
has already received the UIKit conversions; the implementation must use the current source, not
copy the original React shape verbatim.

### `FileList` today

`FileList.tsx` contains three responsibilities in one file:

1. `FileListModel` owns `searchText`, `searchVisible`, and `activeIndex`, plus the imperative
   `showSearch()`, `hideSearch()`, and `hideSearchAndFocus()` methods used by `MenuBar`.
2. A styled wrapper provides flex-column layout, overflow clipping, focus outline removal, and the
   compact font size.
3. The React face derives filtered/traited rows, renders the optional search panel with `Input` and
   a clear `IconButton`, and delegates the actual list behavior to the already-vanilla `ListBoxView`
   through the `ListBox` shim.

The current DOM is conceptually:

```text
div.<Emotion FileListWrapper> [tabindex="0"] [data-compact?]
  div[data-type="panel"] [data-name="file-list-search"]  (only while searchVisible)
    div[data-type="input"]
      input
  div[data-type="list-box"] [data-name="file-list"]
    div[data-part="grid"]
      ...virtualized ListItem rows...
```

`searchable` is declared but is not read by the current component; it must remain an inert
compatibility prop rather than acquiring new behavior during this conversion. `MenuBar` obtains the
model through `onModel` and calls `showSearch()`, so the model callback and the focus handoff are
load-bearing even though ordinary callers do not render a search button themselves.

Production caller inventory:

- `ui/sidebar/RecentFileList.tsx` supplies recent-file items, an open callback, and `onModel`.
- `editors/git-tree/CommitDiffPanel.tsx` supplies a controlled `selectedPath`, a React
  `getTrailing` (`GitStatusBadge`), and a row context menu.

No production caller supplies an explicit `FileListItem.icon`; the explicit `IconRef` arm is still
part of the public contract and must remain supported for future callers.

### `FileGrid` today

`FileGrid.tsx` has a styled flex-column root and a single `DataGrid` child. Its three columns are:

- an icon column whose folder branch returns folder HTML and whose file branch calls
  `fileIconMarkup(path, 16)`;
- a title column whose header is updated when `label` changes;
- a status column whose `getTrailing` callback returns the existing Git status markup string.

The grid subscribes separately to system-icon state, custom-editor registry state, and board-icon
state, prepares uncached file extensions, and calls the live grid's `refresh()` when an icon becomes
available. `fileIconMarkup.ts` is its only production caller. The helper already uses US-1025's
DOM builders internally, but it serializes every result to HTML and therefore cannot be the final
boundary for a vanilla component.

The installed `av-grid@2.2.3` declaration is `CellRenderer<R> = (cell) => string | HTMLElement |
null | undefined`, while US-1026's `createFileIconElement()` and `createFileTypeIconElement()`
correctly return `Element`: the resolver can produce SVG, IMG, and board-glyph elements. FileGrid
therefore depends on a published `av-grid@2.2.4` (or newer) release that widens the element arm to
`Element`. This is an upstream package prerequisite, not a cast, wrapper, or local DataGrid type
lie. The current av-grid renderer path was audited: it clears the cell and uses
`appendChild(rendered)` for element results, with no HTMLElement-only access in the render, recycle,
measurement, or `.avg-cell-text` paths. After the release, update `package.json` and
`package-lock.json` together.

Production caller inventory:

- `editors/git-tree/GitChangesView.tsx` mounts one grid for Unstaged and one for Staged changes.
- Both grids use string `gitStatusMarkup()` trailing cells, range selection, click/double-click
  actions, and context-menu items. `FileGridView` must keep those callbacks live through
  `DataGridView`'s callback trampolines.

### Existing vanilla seams

- `ListBoxView` owns virtualization, row pooling, keyboard navigation, active-row scrolling,
  selection, tooltips, and context-menu event conversion.
- `ListItemView` owns the row icon/trailing slots through `fillSlot`; its runtime already accepts a
  `Node` in a slot even though the public `IconRef` type currently describes React-facing values.
- `InputView` owns the controlled `value` property, native input event, focus/ref behavior, and
  start/end slots. It imports `Input.css` itself.
- `IconButtonView` owns the close icon, tooltip, and button behavior. It imports `IconButton.css`
  itself.
- `DataGridView` owns one live `av-grid` instance, forwards value options, and keeps callback
  trampolines stable while reading the latest props.
- `createFileIconElement()` and `createFolderIconElement()` from US-1026 return the actual SVG,
  image, board glyph, or folder span. `subscribeFileIconElements()` combines system-icon,
  custom-editor, and board-icon notifications into one native subscription.

## Implementation plan

### 1. Establish the DOM and styling boundary before removing Emotion

- Add `components/file-list/FileList.css` in `@layer app`.
- Move the current wrapper rules to a stable `[data-type="file-list"]` root:
  `flex: 1 1 auto`, `display: flex`, `flex-direction: column`, `overflow: hidden`, and
  `outline: none`. Preserve compact mode as `font-size: var(--font-sm, 12px)`.
- Give the FileList root `data-type="file-list"` and preserve `tabindex="0"` and the
  `data-compact="true"` marker. There are no existing selectors or automation consumers of the
  old Emotion class, so this is a safe addressable root rather than a compatibility rename.
- Keep `FileGrid.css` in `@layer app`, add the former Emotion root rules to
  `[data-type="file-grid"]` (`flex`, `display`, `flex-direction`, `overflow`), and retain its
  icon-cell overflow and Git status badge rules.
- Remove the obsolete `.file-grid-folder` rule once the folder icon is created by
  `createFolderIconElement()`, whose inline size matches the existing rule.
- Import each stylesheet from the direct view that builds the corresponding DOM. Do not rely on a
  React face elsewhere in the bundle to make a stylesheet available.

### 2. Add the small direct-icon ListBox slot needed by `FileListView`

The default file icon is a DOM `Element`, not a React `ReactNode`. Do not cast it to `IconRef` and do
not create a React root for every virtualized file row.

- Add an optional `iconElement?: Node` field to the ListBox row/`ListItemView` prop path, documented
  as the direct-DOM arm used by vanilla parents. Keep `icon?: IconRef` unchanged for React callers.
- Carry the field through `IListBoxItem`, `ListBoxView.itemProps()`, and `ListItemProps`.
- Make `ListItemView` prefer `iconElement` when it is present, passing that node through the existing
  `fillSlot` node arm; otherwise retain the current `icon` behavior exactly, including icon names,
  React-valued icons, unknown names, and default selection/trailing icons.
- Keep the icon host `display: contents` and the node identity gate. A pooled row must not rebuild or
  detach an unchanged icon merely because its active/selection state changed.

This is additive UIKit plumbing, not a new public rendering mechanism: React callers continue to use
`icon`, while the app-coupled FileList can provide a concrete node without an unsafe type assertion.

### 3. Convert `FileList` to a thin React face plus `FileListView`

- Refactor `FileList.tsx` so it keeps the existing exported `FileList`, `FileListModel`, and
  `FileListItem` API but mounts a module-level `FileListView` with `mountVanilla`. Do not re-export a
  new public props type from `components/file-list/index.ts` merely to support the internal view.
- Move the view implementation to a pure-DOM `FileListView` module. Its constructor must be public,
  construct the model driver immediately, and register driver cleanup from the constructor. The
  constructor must not build child DOM, install listeners, or measure.
- In `onMount`, create and own one `ListBoxView<FileListRow>`, one `InputView`, and one
  `IconButtonView` for the clear button. Append/mount the ListBox before `driver.mount()` so the
  model's `onModel(this)` callback sees a usable list. Keep the search and input views detached when
  `searchVisible` is false; never create/dispose a new child on every show/hide transition.
- Build the search region as a native, view-owned panel with the same visible padding and the same
  `data-name="file-list-search"` address. Do not mount the React `Panel` component inside the
  vanilla view: it has no vanilla face, and this region uses only flex/padding. Give the local
  region a stable `data-part="search"` and scope its padding in `FileList.css`.
- Pass the `IconButtonView` root as the `endSlot` prop value only while `searchText` is non-empty,
  and pass `undefined` otherwise. Never append or remove the button directly under InputView's slot
  host: `fillSlot` owns that host and may replace its contents. Keep the same button node identity
  across updates so InputView's applied-slot identity gate retains it; Select's stable chevron
  node is the precedent for this exact shape. The button must remain
  `name="file-list-search-clear"`, `title="Clear Search"`, `size="sm"`, `icon="close"`, and call
  `hideSearchAndFocus()`.
- Reproduce the current filtering exactly: split a non-empty search string on spaces, discard empty
  pieces, lowercase, and require every piece to occur in `item.title`. Pass the original search text
  to ListBox so `ListItemView` continues to highlight matches.
- Keep a stable source-row cache keyed by the caller's `items` and `getTrailing` identities, and a
  filtered-row cache keyed by the derived search text. This matches the existing `useMemo` boundaries:
  changing `activeIndex` must not rebuild every row, while an icon-cache notification must rebuild
  the default icon nodes and refresh visible rows.
- For each default row, use `createFolderIconElement()` for folders and
  `createFileIconElement({ path: item.filePath, width: 16, height: 16 })` for files. If
  `item.icon` is explicitly supplied, leave `iconElement` empty and pass the explicit `icon` arm.
- Preserve the `FileListModel` state contract with one compound state binding for
  `{ searchText, searchVisible, activeIndex }`. The binding must update the input value, attach or
  detach the search region, rebuild the filtered rows, and update the ListBox in one ordered pass.
  `showSearch()`'s zero-delay focus must run after the input has been attached; clearing focus
  handlers before model disposal prevents a delayed callback from touching a disposed view.
- Keep the two Escape paths exactly: Escape on the root while search is visible, and Escape in the
  search input, both prevent default/propagation, hide the search, clear text, and focus the root.
  Use native `KeyboardEvent` listeners; `InputView` and the shared event facade already preserve the
  React-facing callback shape for residual input handlers.
- Preserve `onModel(model)` / `onModel(null)` and the current focus-handler registration. If the
  callback identity changes, verify the existing React effect's cleanup/re-registration semantics or
  explicitly retain the current production assumption that the only caller supplies a stable bound
  callback; do not silently call a new callback twice.
- Pass the row context-menu and `onContextMenu` props through `ListBoxView`; it already gives row
  menus precedence and converts the native event to `ContextMenuEvent`/the React public facade.
  `getTrailing` remains a React compatibility slot for the editor-owned `GitStatusBadge`; default
  file/folder content must not use that bridge.

### 4. Convert `FileGrid` to a thin React face plus `FileGridView`

This step starts only after `av-grid@2.2.4` (or newer) is published with
`CellRenderer` returning `string | Element | null | undefined`, and the dependency and lockfile
are updated. Do not cast `Element` to `HTMLElement` and do not wrap SVG or IMG results merely to
satisfy the old declaration.

- Refactor `FileGrid.tsx` to preserve its exported interfaces and mount a direct `FileGridView`.
  Remove `styled`, React hooks, `fileIconMarkup`, `useSystemFileIcons`, `useBoardIcon`, and direct
  custom-editor state subscription from the face.
- Create a pure-DOM `FileGridView` with a public constructor and a stable `DataGridView<FileGridItem>`
  child. Set the same root markers (`data-type="file-grid"`, optional `data-name`, and
  `data-compact="true"`) and append the DataGrid root before mounting it.
- Build the three columns once with callbacks that read the view's current props. The title column
  keeps its existing `label ?? ""` header and is explicitly updated through `grid.setColumns()` when
  `label` changes, matching the current effect rather than rebuilding columns on every prop update.
- Return real `Element` nodes from the icon renderer:
  `createFolderIconElement()` for folders and `createFileIconElement({ path, width: 16, height:
  16 })` for files. Keep `rowCompare` by extension and `formatValue: () => ""` unchanged.
- Keep the status renderer's `getTrailing` string/HTMLElement contract and live callback behavior.
  Keep `onClick`, `onDoubleClick`, `onSelectionChange`, `getContextMenuItems`, and
  `showGridContextMenu` wired through `DataGridView`'s stable callback tier. Selection reads from the
  live grid instance exactly as it does today.
- On mount and whenever `items` changes, call `prepareFileIcon()` for every non-folder path. Register
  one `subscribeFileIconElements()` listener for the view and call the live grid's `refresh()` when a
  system icon, custom-editor mapping, or board icon changes. Dispose that subscription before the
  DataGrid child can receive further refreshes.
- Let `DataGridView` own the av-grid instance and its disposal. Do not create a second grid, React
  root, or custom virtualization layer in FileGridView.
- Delete `components/icons/file-icon-markup.ts`; after this conversion it has no production caller.
  Re-scan the renderer before removing it and leave the historical task/epic records as historical
  references rather than adding a replacement string helper.

### 5. Keep the React-facing exports and app callers unchanged

- `components/file-list/index.ts` continues exporting `FileList`, `FileListModel`, and
  `FileListItem`.
- `components/file-grid/index.ts` continues exporting `FileGrid`, `FileGridItem`, and `FileGridProps`.
- Do not modify `RecentFileList`, `CommitDiffPanel`, or `GitChangesView`; their callback and data
  shapes are the compatibility test for this task.
- Do not convert `Panel`, `ListBox`, or `DataGrid` again. Consume their existing vanilla views and
  only add the narrowly-scoped direct icon field needed by FileList.

### 6. Verify behavior and the dependency boundary

Static checks:

- `npm run typecheck`
- `npm run lint`
- `npm run build-prod`
- `git diff --check`
- `rg -n "@emotion/(styled|react)|useEffect|useMemo|useRef|fileIconMarkup|file-icon-markup" src/renderer/components/file-list src/renderer/components/file-grid` returns no runtime implementation hits (type-only React imports in the public prop faces are acceptable where required).
- `rg -n "fileIconMarkup|file-icon-markup" src/renderer` returns no production source hits after the helper is removed.
- Confirm the only grid icon renderers return `Element`/`Node`, never serialized SVG/IMG markup.

Runtime smoke pass in the running application:

- Recent Files: open the recent-file sidebar, invoke the global search command, type multiple search
  terms, verify highlighting/filtering, clear via the close button, press Escape from both the input
  and root, and confirm focus returns to the list.
- FileList selection/context behavior: click a row, activate a selected-path row in Commit Diff, hover
  for its tooltip, open its context menu, and verify the Git status trailing React slot remains
  visible.
- Git Changes: verify both Unstaged and Staged grids render; click, double-click, range-select, and
  open a context menu. Confirm the left icon column contains actual SVG/IMG/folder elements and the
  status badge remains visible.
- Icon reactivity: exercise a system-icon fallback that resolves asynchronously, a custom-editor
  mapping change, and a board icon becoming available. The affected visible cells must refresh once
  without replacing the grid instance or resetting selection/scroll.
- Compact and label changes: verify FileList compact font and FileGrid compact font, title header
  changes, empty lists, and a list/grid update while scrolled.
- Inspect the DOM to confirm each view owns one stable root and no per-file React root is created for
  default icons. React-valued caller slots are the only compatibility arms left in this surface.

## Concerns / decisions

### 1. Direct DOM icon type versus an unsafe cast

`createFileIconElement()` returns `Element`, while `IconRef` intentionally
describes React-facing icon names and React nodes. The runtime `fillSlot` already supports `Node`, but
casting a DOM element to `IconRef` would make the type lie at every future call site. The plan adds
`iconElement?: Node` as a separate row slot and leaves `icon?: IconRef` unchanged. This is the smallest
safe seam and keeps the distinction visible in the types.

### 2. `FileList` still accepts React-valued extension slots

`getTrailing` is a `ReactNode` callback and `FileListItem.icon` can be a React value. Removing those
arms would break `CommitDiffPanel` and the public contract. They remain routed through `ListItemView`'s
existing `fillSlot` bridge, which may create a nested React root for caller-owned content from an
unconverted editor. The default file/folder icon path is independent and stays framework-free; later
editor conversions can retire the remaining slot arms without reopening this task.

### 3. The search panel used to be a React `Panel`

There is no `PanelView`, and Epic D explicitly keeps the legacy Panel component alive for editor
callers. The FileList search region uses only `data-type`, `data-name`, flex display, and `padding="sm"`,
so the plan gives it a small native `data-part="search"` region with local CSS. This avoids mounting a
React Panel solely for four pixels of padding. The visible layout and input/list order are preserved;
the internal panel class is not an app-facing contract.

### 4. FileList has no pre-existing root `data-type`

Unlike FileGrid, the old FileList wrapper had only an Emotion class. The conversion adds
`data-type="file-list"` to give the new stylesheet a stable owner and make the component inspectable.
No renderer CSS, automation, or documentation currently targets the old wrapper, so this is an
intentional additive contract rather than a selector migration.

### 5. Icon invalidation must refresh a pooled grid without resetting it

The old FileGrid re-rendered from three React subscriptions. The native equivalent is one
`subscribeFileIconElements()` callback at the FileGrid view level. It must call `refresh()` on the
existing av-grid, not replace `DataGridView`, rows, columns, or selection. This is especially
important for board/system icon changes: the first render can legitimately show the default glyph,
and the later notification must update only the cell contents.

### 6. `fileIconMarkup.ts` becomes dead code by design

US-1025 deliberately retained its string-returning helper for the old FileGrid boundary, and US-1026
explicitly left that boundary for this task. Once av-grid receives `Element` cells, keeping the
helper would preserve a stale serialization path and a misleading cache owner. The task deletes it
only after a repository-wide caller scan proves FileGrid was its last production use.

### 7. Model callback identity and the unused `searchable` prop

The current React effect re-runs when `onModel` identity changes, while production `RecentFileList`
passes a stable bound callback and `searchable` is never read. The implementation must not invent a
search toggle or silently call a newly supplied model callback twice. Preserve the existing
mount/null-unmount contract, verify the two production call paths, and keep `searchable` as an inert
compatibility field unless a later task gives it behavior.

### 8. Rule 4 measurement scope is pinned by Epic D

EPIC-058 requires one Rule 4 interaction-cost measurement for each converted unit. Record both: one
search/filter/ArrowDown interaction on a populated FileList and one single-cell selection on a
populated FileGrid, with raw MutationObserver records and observer options recorded after the
story/app surface settles. The probe choice remains the implementation contribution; there is no
single-number or exemption alternative for this task.

## Acceptance criteria

- [ ] `FileList` and `FileGrid` exports retain their current public props and index exports; no caller
      changes are required.
- [ ] `FileList` uses a vanilla view with one owned `ListBoxView`, `InputView`, and clear
      `IconButtonView`; no React implementation or Emotion styled wrapper remains in the component.
- [ ] FileList filtering, match highlighting, active-index updates, external `showSearch()`, Escape
      handling, focus restoration, tooltips, selected-path accent state, context menus, and the
      `onModel` mount/null-unmount contract all work as before.
- [ ] Default FileList rows use direct folder/file DOM elements through `iconElement`; no default
      file icon creates a React root. Explicit React-valued icon/trailing compatibility arms remain
      supported.
- [ ] `FileGrid` uses a vanilla view with one owned `DataGridView`; its icon cells return actual
      `Element` values through `av-grid@2.2.4` or newer, preserve sorting/selection/click/double-click/context-menu behavior, and
      keep Git status trailing markup.
- [ ] System, custom-editor, and board icon notifications refresh the existing grid without losing
      rows, selection, scroll, or the grid instance. A listing with at least three different file
      types shows three different icons.
- [ ] `file-icon-markup.ts` has no remaining source callers and is removed; no renderer source imports
      `react-dom/server` or the deleted helper because of this task.
- [ ] The FileList and FileGrid roots have their app-layer styles, compact modes, overflow behavior,
      and root markers; the FileList search region does not require a nested React `Panel`.
- [ ] No component caller under `src/renderer/editors/` or `src/renderer/ui/` changes as part of the
      conversion.
- [ ] `npm run typecheck`, `npm run lint`, `npm run build-prod`, and `git diff --check` pass.
- [ ] Both Epic D Rule 4 measurements are recorded: FileList search/filter/ArrowDown and FileGrid
      single-cell selection, each with its exact interaction, observer roots, options, reset point,
      and raw record count(s).

## Files expected to change

| File | Change |
|---|---|
| `src/renderer/components/file-list/FileList.tsx` | Keep public types/model; replace JSX implementation with the `mountVanilla` face and model lifecycle hooks as needed |
| `src/renderer/components/file-list/FileListView.ts` | New native FileList composition, filtering, search, focus, and ListBox bridge |
| `src/renderer/components/file-list/FileList.css` | New `@layer app` root/search styles |
| `src/renderer/components/file-list/index.ts` | Preserve exports; update only if the view/type split requires an internal export adjustment |
| `src/renderer/components/file-grid/FileGrid.tsx` | Keep public interfaces; replace hooks/Emotion with the `mountVanilla` face |
| `src/renderer/components/file-grid/FileGridView.ts` | New native DataGrid composition and direct icon-cell renderers |
| `src/renderer/components/file-grid/FileGrid.css` | Move root styles, retain status/icon-cell rules, remove folder markup styling |
| `src/renderer/components/file-grid/index.ts` | Preserve existing exports |
| `src/renderer/components/icons/file-icon-markup.ts` | Delete after the repository-wide caller scan |
| `src/renderer/uikit/ListBox/types.ts` | Add the separate direct-DOM icon slot to the row type |
| `src/renderer/uikit/ListBox/ListBoxView.ts` | Forward the direct-DOM icon slot to row views |
| `src/renderer/uikit/ListBox/ListItem.tsx` | Keep the public React type aligned with the additive icon slot if required by the shared row props |
| `src/renderer/uikit/ListBox/ListItemView.ts` | Prefer the direct node slot while preserving the existing React icon arm |
| `package.json` | Consume `av-grid@2.2.4` or newer after the upstream `CellRenderer` widening is published |
| `package-lock.json` | Lock the released `av-grid` version together with `package.json` |
| `doc/active-work.md` | Link US-1027 under EPIC-058 |
| `doc/epics/EPIC-058.md` | Link US-1027 to this document; update its status only when implementation is explicitly marked complete |

Explicitly not changed: `RecentFileList.tsx`, `CommitDiffPanel.tsx`, `GitChangesView.tsx`,
`DataGridView.ts`, `InputView.tsx`, `IconButtonView.tsx`, US-1026's `icon-elements.ts`, the icon
registries/caches, and the legacy `Panel` implementation.

## Related work

- [EPIC-058 — De-React Epic D](../../epics/EPIC-058.md)
- [US-1025 — Icon DOM builders](../US-1025-icon-dom-builders/README.md)
- [US-1026 — Components/icons vanilla views](../US-1026-components-icons-vanilla-views/README.md)
- [US-1013 — Virtual grid engine](../US-1013-virtual-grid-engine/README.md)
- [US-1022 — Remaining grid consumers](../US-1022-remaining-grid-consumers/README.md)

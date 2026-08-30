# US-1208 — The `listen()`-on-update sweep, and Breadcrumb

## Goal

Remove renderer-wide `VanillaView.listen()` registrations whose targets are removed or replaced
while their owning view remains alive, and convert `BreadcrumbView` to an incremental keyed
segment reconciliation with stable event handling. The task is investigation and implementation
planning only; no source implementation, tests, test harnesses, or dashboard entry are part of
this document.

## Background

This task is tracked by [EPIC-077](../../epics/EPIC-077.md), §C-4 (US-1208). Its Breadcrumb
conversion follows the dynamic-child convention established in [EPIC-076](../../epics/EPIC-076.md).

### Defect contract

`VanillaView.listen()` adds the browser listener and then registers a cleanup closure with
`own()` (`src/renderer/uikit/shared/vanilla-view.ts:176-197`). `own()` adds to the view's
`DisposableStore` (`:145-149`), and that store is drained only during `dispose()` (`:99-124`).
The relevant defect test is therefore not merely whether a call is reachable from an update: a
site is an offender when that path attaches to an element that is later removed or replaced while
the owning view remains alive, outside an explicitly bounded retained branch or pool. The disposer
closure retains that target until disposal. A listener installed once on an element that lives as
long as the view is harmless, regardless of which method installs it. Explicit
`removeEventListener()` calls in a keyed-list removal callback stop event delivery but do not remove
the already-registered disposer; they do not make an otherwise unbounded removed-target pattern
safe. Temporary release and reuse of a deliberately bounded pooled wrapper is not target disposal
under this test.

The sanctioned release path is already present: `ownReleasable()` removes a cleanup before
disposal, but it is private (`src/renderer/uikit/shared/vanilla-view.ts:159-174`). The plan changes
`listen()` to return that release handle while preserving all existing callers, which currently
ignore the `void` return (`:181-197`). Shape (c) uses that handle for keyed or genuinely transient
elements; shapes (a) and (b) are used where stable DOM makes release unnecessary.

### Investigation method and exact search commands

The site list was derived from the current tree on 2026-08-30. The primary renderer-wide census
was:

```powershell
rg -n --glob '*.ts' 'this\.listen\s*\(' src/renderer
rg --files src/renderer | rg '\.(tsx|jsx)$'
```

The complete file list and compact call-site inventory were checked with:

```powershell
rg -l --glob '*.ts' 'this\.listen\s*\(' src/renderer | Sort-Object
$files = rg -l --glob '*.ts' 'this\.listen\s*\(' src/renderer | Sort-Object; foreach ($file in $files) { $hits = Select-String -Path $file -Pattern 'this\.listen\s*\('; foreach ($hit in $hits) { "{0}:{1}: {2}" -f $file,$hit.LineNumber,$hit.Line.Trim() } }
$hits = @(rg -n --glob '*.ts' 'this\.listen\s*\(' src/renderer); $matchCount = 0; foreach ($hit in $hits) { $matchCount += ([regex]::Matches($hit, 'this\.listen\s*\(')).Count }; "matching-lines=$($hits.Length)"; "call-expressions=$matchCount"; $files = @(rg -l --glob '*.ts' 'this\.listen\s*\(' src/renderer); "files=$($files.Length)"
```

Repeatable-path tracing used these targeted searches, followed by reading each surrounding method
and its caller:

```powershell
rg -n -C 3 'createRow\(|createItem\(|createPanel\(|createTab\(|setChevron\(|updateContent\(' src/renderer/uikit/CategoryList/CategoryListView.ts src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStackView.ts src/renderer/uikit/Menu/MenuView.ts src/renderer/uikit/PathInput/PathInputView.ts src/renderer/uikit/RadioGroup/RadioGroupView.ts src/renderer/uikit/Tree/TreeItemView.ts src/renderer/uikit/Tag/TagView.ts
rg -n -C 3 'installCellListeners\(|renderCell|this\.grid\.model\.update|refresh\(' src/renderer/uikit/ListBox/ListBoxView.ts src/renderer/uikit/Tree/TreeView.ts
rg -n -C 3 'createCell\(|installCellListeners\(|createActionButton\(|renderCell' src/renderer/editors/link-editor/LinksListView.ts src/renderer/editors/link-editor/LinksTilesView.ts
rg -n -C 3 'renderFavicon|applyState|protected onUpdate|this\.listen' src/renderer/editors/browser/BrowserTabsPanel.ts src/renderer/editors/markdown/CodeBlock.ts
```

The census found 259 `this.listen(...)` call expressions on 251 matching lines in 81 renderer
TypeScript files. The 18 expressions in the offender table pass the target-removal test and are
the real offenders. The count is by individual call expression
(not by file or helper); related expressions with the same call chain are grouped in one table
row. Remaining census sites were either verified to be in `onMount()`/helpers reached only from
`onMount()`, or were recorded as the bounded menu and pooled-wrapper negative findings below.

### Epic B convention used for the Breadcrumb plan

EPIC-076 §B-4 says `KeyedList` and `SubtreeSwap` are the sanctioned dynamic-child patterns
(`doc/epics/EPIC-076.md:178-180`). The recent converted `SegmentedControlView` is the concrete
reference: it creates its `KeyedList` in `onMount()`, creates owned `ButtonView` children, and
updates those children rather than rebuilding them (`src/renderer/uikit/SegmentedControl/SegmentedControlView.ts:39-65`).
Its `buttonProps()` reads the live `this.props` when building the child props, including the
current callback (`:86-102`). `BreadcrumbView` should use the same stable-list principle, adapted
to its direct-span DOM and delegated click handling.

### Offender inventory

The recommended fix shapes are:

- **(a)** install a fixed number of listeners in `onMount()` on a stable parent and delegate to
  current descendants. Use this only when every delegated event can be preserved cleanly; for
  `mouseenter`/`mouseleave`, delegation must use bubbling `mouseover`/`mouseout` with a
  related-target boundary check.
- **(b)** keep the target element stable, install its listener once in `onMount()`, and have the
  handler read `this.props` or current instance fields at event time.
- **(c)** return a release handle from `listen()`, retain it with the keyed/transient element's
  record, and call it before that element is removed or replaced. This is the right shape when
  the element genuinely comes and goes with data and delegation would change behavior.

| Offender call sites | Verified repeatable call chain | Listener count per repeated factory/update path | Recommended shape and reason |
|---|---|---:|---|
| `src/renderer/uikit/Breadcrumb/BreadcrumbView.ts:61,74` | `BreadcrumbView.onUpdate()` (`:26-28`) → `applyProps()` (`:34`) → rebuild loop over root/segments (`:56-78`). `CategoryEditorView.ensureBreadcrumb()` updates the retained child on repeated surface syncs (`src/renderer/editors/category/CategoryEditor.ts:208-223`). | 1 root listener when the value is nonempty, plus one segment listener for every non-leaf segment: `1 + max(segmentCount - 1, 0)`. | **(a).** Reconcile a keyed direct-span part list and install one root click delegate in `onMount()`. The delegate derives the clicked root/segment and current path from `this.props`; this removes both per-rebuild registrations while preserving `clipStart`'s direct children. |
| `src/renderer/uikit/CategoryList/CategoryListView.ts:205,206` | `onUpdate()` (`:69-78`) → `rows.update()` → keyed-list `create` callback (`:41-48`) → `createRow()` (`:195-207`). A later item change removes a keyed row through `removeRow()` (`:244-249`), which calls native `removeEventListener()` but cannot remove the `listen()` disposer. `onExpandClick()` also updates the keyed list (`:257-272`). | 2 per created row that is later removed (row click and expand click). | **(c).** Store both `listen()` release handles in `RowParts` and invoke them in `removeRow()` before deleting the row metadata; the keyed row genuinely comes and goes, so delegation is unnecessary. |
| `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStackView.ts:130` | `onUpdate()` (`:58-65`) → `panelList.update()` (`:47-55`) → keyed-list `createPanel()` (`:119-136`) when a panel key is added. A later panel change removes the keyed root through `removePanel()` (`:227-236`), taking its header with it while the view remains alive. | 1 per created panel header that is later removed. | **(c).** Store the header listener handle in `PanelRecord` and release it in `removePanel()`; the header is a keyed item's transient element. |
| `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStackView.ts:182` | `onUpdate()` → `panelList.update()` → `updatePanel()` → `updateHeader()` (`:139-149,151-200`). `buttonsHost` is removed when buttons disappear (`:186-190`) and can be created again on a later update. | 1 per buttons-host creation/recreation. | **(c).** Store and release the buttons-host handle when `buttonsHost` is removed; this stop-propagation listener belongs to a genuinely transient host. |
| `src/renderer/uikit/PathInput/PathInputView.ts:78-80` | `PathInputView.onMount()` binds state to `syncChildren()` (`:178-183`), and `onUpdate()` calls it (`:185-189`) → popover content update → `PathSuggestionContentView.onUpdate()` (`:60-63`) → `suggestionList.update()` → `createRow()` (`:65-81`). `removeRow()` removes churned suggestions (`:94-101`) and only calls native removal. | 3 per created suggestion row that is later removed (mousedown, click, mouseenter). | **(c).** Store three release handles in the row metadata and invoke them in `removeRow()`; suggestion rows genuinely churn per keystroke and hover normalization is avoidable. |
| `src/renderer/uikit/RadioGroup/RadioGroupView.ts:90,91` | `onUpdate()` (`:40-43`) → `updateItems()` (`:49-52`) → keyed-list update → `createItem()` (`:78-93`). A removed radio runs `removeItem()` (`:141-149`), which calls native removal but leaves the `listen()` disposers in the view store. | 2 per created radio item that is later removed. | **(c).** Store click/keydown release handles in `RadioItemState` and invoke them from `removeItem()`; keyed radio elements genuinely come and go. |
| `src/renderer/uikit/Tag/TagView.ts:176` | `onUpdate()` (`:67-71`) → `updateContent()` (`:142-187`). Toggling `onRemove` off removes the button and sets `removeButton` undefined (`:182-186`); a later on-removable update creates and listens again (`:171-180`). | 1 on each transition that recreates the remove button. | **(b).** Create the remove button once during `onMount()`, keep it stable, and update its visibility/affordance while `onRemoveClick` reads live `this.props`. The existing CSS-driven `data-removable`/`data-remove-affordance` states remain the presentation contract. |
| `src/renderer/uikit/Tree/TreeItemView.ts:270` | `TreeView.renderCell()` updates/reuses a `TreeItemView` (`src/renderer/uikit/Tree/TreeView.ts:354-460`) → `TreeItemView.onUpdate()` (`:110-113`) → `applyProps()` → `setChevron()` (`:115-143,225-276`). `clearChevron()` replaces the chevron host children (`:288-295`), and a recycled row can later re-enter chevron mode. | 1 per reused row re-entering chevron mode after a prior clear. | **(c).** Retain the release handle alongside `chevronButton` and invoke it in `clearChevron()` before replacing the button; this is a transient control on a recycled keyed/pooled row, not a parent-delegation case. |
| `src/renderer/uikit/Tree/Tree.story.ts:279` | Story `onUpdate()` updates its retained `TreeView` (`:143-146`) → `TreeView.renderCell()` invokes the `renderItem` callback (`src/renderer/uikit/Tree/TreeView.ts:405-414`) → `renderCustomRow()` (`:260-283`) → `this.listen()`. The tree's model refresh path reaches the same callback. | 1 per custom row render that creates a row. | **(a).** Install one listener on the stable story/tree host during story `onMount()` and delegate to the custom row; resolve the row's current action from its stable DOM marker/context rather than registering against each render result. |
| `src/renderer/editors/browser/BrowserTabsPanel.ts:57` | `TabItemView.onUpdate()` (`:44`) and every drag state handler that calls `sync()` (`:59-64`) → `sync()` (`:46-55`) → `renderFavicon()` (`:57`). A truthy favicon rebuilds the image on every sync. | 1 per sync with a truthy favicon URL. | **(c), changed from planned (b).** Create a fresh image when the URL changes, release its `listen()` handle before removal, and register the replacement image's error listener. A stable image cannot identify a late error from a previous URL, so construction restores detached-element semantics. |
| `src/renderer/editors/link-editor/LinksListView.ts:386` | `onUpdate()` → dirty grid update (`:159-170`) → `renderCell()` (`:105-118`) → `admitCell()` → `syncActionButton()` (`:356-393`) on every render. When an action is disabled, the existing button is disposed and cleared (`:362-369`); a later re-enable passes the `:372` guard, creates a new button, and registers the listener at `:386`. | 1 per re-enabled edit/delete action button on a pooled cell whose action alternates off and on. | **(c).** Retain the `listen()` release handle next to the button in `CellParts` and invoke it before the disable branch disposes and clears the button; this preserves the existing ownership behavior. |
| `src/renderer/editors/markdown/CodeBlock.ts:215,224` | `MermaidBlockView.onMount()` binds the model state (`:161-165`) → model render state writes (`:123-140`) → `applyState()` (`:176-240`) when the diagram arm is entered. `onUpdate()` can start another model render (`:167-169`), and state can cycle diagram → loading/error → diagram. | 2 each time `applyState()` enters a new diagram arm (open and copy buttons). | **(b).** Create the two logical controls once, install their listeners once, and move them in or out of the diagram presentation as state changes; handlers read current `this.props`, `this.image`, and driver state. |

### Negative findings: bounded menu and pooled-cell listeners

`src/renderer/uikit/Menu/MenuView.ts:165-167` was considered but is not an offender. The
listeners belong to `MenuContentView`, whose keyed list is created in `:71-95`; when the menu
closes, `PopoverView`'s `SubtreeSwap` disposes the floating branch (`src/renderer/uikit/Popover/PopoverView.ts:425-458`), including that content view. Its row churn is bounded by the menu-content lifetime.

The four pooled-cell views' base cell listeners are also deliberately exempt. Those listeners are
installed once per wrapper, not per render: `ListBoxView` obtains `p.previous`/`p.recycle()` and calls
`installCellListeners()` only in its fresh-wrapper branch (`src/renderer/uikit/ListBox/ListBoxView.ts:362-368`), and its own comment says this is “once per wrapper, never per render” (`:446-448`). The same branch exists in `TreeView` (`src/renderer/uikit/Tree/TreeView.ts:355-368`), whose comment explains that pooled wrappers retain listeners and that drag gates must stay inside the handlers (`:480-487`).

`LinksListView` and `LinksTilesView` call their base `installCellListeners()` from `createCell()`
only (`src/renderer/editors/link-editor/LinksListView.ts:275` and
`src/renderer/editors/link-editor/LinksTilesView.ts:357`), not from `renderCell()`/`admitCell()`.
In `LinksTilesView`, the action button is retained in `record[key]` when disabled
(`src/renderer/editors/link-editor/LinksTilesView.ts:487-496`), and its primary-image error
listener is installed once per cell record (`:351`), so both remain exempt. `LinksListView` is
different: its `syncActionButton()` teardown disposes and clears the button (`:356-393`), so its
re-enable path at `:372-386` is the reinstated shape (c) offender recorded above. The `CellPool`
contract is bounded (`src/renderer/uikit/ListBox/ListBoxView.ts:71-73`), and recycled wrappers
intentionally keep their views and base listeners. Delegating these paths would introduce
unnecessary changes to pooling and drag-and-drop, where `dragenter`/`dragover`/`dragleave` gates
are deliberately evaluated inside the retained wrapper handlers.

### Count by fix shape

Counting individual call expressions that pass the target-removal test: **18 offender sites: 3
shape (a), 3 shape (b), 12 shape (c)** after the BrowserTabsPanel implementation adjustment. The 33 pooled-cell expressions and the 3 menu-row
expressions are negative findings, not offenders. Shape (c) uses the sanctioned release handle
described below; no private-API workaround is needed.

## Implementation Plan

### Breadcrumb implementation plan

1. In `src/renderer/uikit/Breadcrumb/BreadcrumbView.ts`, preserve the existing root attributes,
   `splitWithSeparators()` behavior, `separatorContent`, `trailingParentSeparator`, `clipStart`,
   and direct-span DOM contract from `src/renderer/uikit/Breadcrumb/Breadcrumb.css`. Replace the
   `nodes` rebuild in `applyProps()` with a `KeyedList` initialized in `onMount()` and updated from
   `onMount()`/`onUpdate()`.
2. Represent the root, separators, and path segments as keyed direct-span parts so the list can
   preserve stable nodes while still allowing `clipStart` to reverse the managed order. Use stable
   keys for the root and each segment position (and matching separator positions); update text,
   `data-current`, `data-part`, and the segment metadata in the list's `update` callback. Do not
   use a `DocumentFragment` as a keyed element: `KeyedList` retains the returned node, and a
   fragment would be emptied when inserted.
3. Install one root click listener in `onMount()`. The handler must resolve the clicked direct span,
   read the current `this.props`, call `onChange("")` for a non-current root, and derive a selected
   non-leaf path from the current segment index, separator, and
   `trailingParentSeparator`. No segment listener may remain in `applyProps()`.
4. Dispose the keyed list from the view's existing ownership cleanup. Keep the current rest-prop
   construction/update boundary unchanged unless the implementation proves a narrowly targeted
   rest-prop change is required.

Before:

```ts
const rootSegment = this.createSegment(rootLabel, "root", rootIsCurrent);
if (!rootIsCurrent) this.listen(rootSegment, "click", this.onRootClick);
// ... one new segment and one new listener for every non-leaf segment ...
this.root.replaceChildren(...(clipStart ? nodes.reverse() : nodes));
```

After (shape):

```ts
// onMount(): create KeyedList and install one stable root delegate.
this.listen(this.root, "click", this.onSegmentClick);

// applyProps(): build keyed direct-span part data and reconcile it.
this.parts.update(clipStart ? parts.slice().reverse() : parts);
```

The exact part type and key names must be kept local to `BreadcrumbView`; no public props/type
change is indicated by the verified source.

### Sweep implementation plan

1. In `src/renderer/uikit/shared/vanilla-view.ts:181-197`, change `listen()` from returning `void`
   to returning the cleanup-handle type already returned by `ownReleasable()`, and return
   `this.ownReleasable(() => target.removeEventListener(...))`. Preserve the guarded listener and
   all existing callers; ignored return values remain source-compatible.
2. Implement shape (c) in `src/renderer/uikit/CategoryList/CategoryListView.ts`,
   `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStackView.ts`,
   `src/renderer/uikit/PathInput/PathInputView.ts`, `src/renderer/uikit/RadioGroup/RadioGroupView.ts`,
   `src/renderer/uikit/Tree/TreeItemView.ts`, and
   `src/renderer/editors/link-editor/LinksListView.ts`. Store each handle in the existing row/record/state
   object and invoke it before `removeRow()`, `removeItem()`, `removePanel()`, `buttonsHost` removal,
   or `clearChevron()` replaces the target. Keep the existing native removal as the browser-side
   operation performed by the handle.
3. Implement shape (b) in `src/renderer/uikit/Tag/TagView.ts` and
   `src/renderer/editors/markdown/CodeBlock.ts`: create the logical remove button and Mermaid
   open/copy controls once; install listeners once from `onMount()`; and update or reattach stable
   targets while handlers read current props/state.
4. Implement shape (c) in `src/renderer/editors/browser/BrowserTabsPanel.ts`: create a fresh
   favicon image when its URL changes, release the old image's `listen()` handle before removal,
   and register the new image's error listener. This avoids the stale-error race that makes shape
   (b) unsafe for favicon loads.
5. Keep shape (a) limited to `BreadcrumbView.ts` and `Tree.story.ts`. Breadcrumb uses the keyed
   direct-span plan above. The story's one bubbling custom-row click can delegate from its stable
   tree host and resolve the current row by its existing ID/context marker.
6. Leave `MenuView.ts` and the pooled base-cell listener paths unchanged. In
   `LinksListView.ts`, change only the separate `syncActionButton()` release path; leave its
   `createCell()` base listeners pooled once per wrapper. Verify the negative findings remain true:
   menu content disposal releases its rows, while pooled wrappers install once and continue to
   recycle with their current-record drag gates.

Before:

```ts
private createRow(data: RowData): HTMLDivElement {
    const row = document.createElement("div");
    this.listen(row, "click", this.onRowClick);
    return row;
}
```

After (shape):

```ts
// Shared API change.
protected listen(...): () => void {
    // ...guard the listener and add it to the target...
    return this.ownReleasable(() => target.removeEventListener(type, guardedListener, options));
}

// Keyed item removal.
const release = this.listen(row, "click", this.onRowClick);
// removeRow(row): release(); row.remove();
```

## Concerns

- **Sanctioned listener release:** `ownReleasable()` is private, but changing
  `VanillaView.listen()` to return its handle is explicitly part of this task
  (`src/renderer/uikit/shared/vanilla-view.ts:159-197`). Existing callers ignore the return value,
  so the API change is source-compatible. Each shape (c) owner must release exactly once before
  removing its target, and the handle must remain safe during view disposal.
- **Transient keyed elements:** `CategoryListView`, `RadioGroupView`, `PathInputView`, and
  `CollapsiblePanelStackView` already perform native listener removal in keyed-item removal paths,
  but that does not remove the parent disposer. The implementation must store the new handles in
  the corresponding record/state and release them before those paths delete metadata or DOM.
- **Recycled TreeItem controls:** `TreeItemView.clearChevron()` replaces the chevron host children,
  while pooled `TreeItemView` instances are updated for different rows. Release the old chevron
  handle before replacement; do not capture a prior row's callback.
- **Stable controls:** Tag's remove button and Mermaid's two toolbar controls can remain stable
  while their presentation changes. The browser favicon deliberately uses a fresh image per URL,
  because an image error has no reliable per-load token and URL comparison cannot close the race.
- **Negative findings:** `MenuView` content is disposed with the Popover branch on close. The four
  pooled-cell views install listeners once per wrapper and deliberately retain them through recycle;
  their comments and pool bound are recorded above. Do not turn either design into delegation or
  release-on-recycle.
- **Breadcrumb ordering:** `KeyedList` manages one node per record. The implementation must keep
  separators as direct spans and pass the reversed ordered record array when `clipStart` is true;
  nesting segments or replacing the root with `replaceChildren()` would violate the current CSS
  and the task's proportional-update goal.
- **Breadcrumb scope:** `uikit/Breadcrumb/` contains plain spans; preserve its direct-span CSS
  contract and judge the change by disposer growth and detached-target retention.
- **Line references:** The listed lines are the verified pre-implementation baseline. They will
  move after code changes; implementation should update the task notes only if the final call graph
  differs from this contract.

## Acceptance criteria

- [ ] The renderer-wide command recorded above is rerun after implementation and every listener
      attached to a target later removed or replaced while its view remains alive has either a
      stable target/delegate or a released `listen()` handle. Stable once-per-view and pooled
      once-per-wrapper listeners remain exempt.
- [ ] `VanillaView.listen()` returns the `ownReleasable()` handle, and all 18 pre-change offender
      expressions are accounted for: 3 shape (a), 4 shape (b), and 11 shape (c).
- [ ] `BreadcrumbView` uses `KeyedList` for keyed direct-span parts, retains stable nodes for
      retained keys, preserves separator/root/segment text and current-state behavior, preserves
      `clipStart`, and has a fixed listener count after mount.
- [ ] Breadcrumb updates call the current `onChange`, derive the correct non-leaf path and
      trailing separator, preserve `clipStart`, and do not grow the disposer store with rebuilt
      segment targets.
- [ ] Keyed-item/transient removal releases CategoryList, RadioGroup, PathInput, panel/header,
      TreeItem chevron, and LinksList action-button handles; stable Tag, favicon, and Mermaid
      controls do not re-register.
- [ ] Menu closure still disposes its content branch, and the base cell listeners and drag gates in
      ListBox, TreeView, LinksListView, and LinksTilesView retain their once-per-wrapper behavior;
      only the separate LinksList action-button teardown gains release handling.
- [ ] No tests or test harnesses are added, and no dashboard entry is added.

## Files Changed Summary

| File | Planned change |
|---|---|
| `doc/tasks/US-1208-listen-on-update-sweep/README.md` | This verified investigation and implementation plan. |
| `src/renderer/uikit/shared/vanilla-view.ts` | Return a releasable cleanup handle from `listen()` via `ownReleasable()`. |
| `src/renderer/uikit/Breadcrumb/BreadcrumbView.ts` | Keyed direct-span reconciliation and one stable delegated click listener. |
| `src/renderer/uikit/CategoryList/CategoryListView.ts` | Release row click/expand handles in keyed-row removal. |
| `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStackView.ts` | Release panel-header and transient button-host handles. |
| `src/renderer/uikit/PathInput/PathInputView.ts` | Release suggestion-row handles in keyed-row removal. |
| `src/renderer/uikit/RadioGroup/RadioGroupView.ts` | Release click/keydown handles in keyed-item removal. |
| `src/renderer/uikit/Tag/TagView.ts` | Stable remove button and one listener. |
| `src/renderer/uikit/Tree/TreeItemView.ts` | Release chevron handle before mode replacement. |
| `src/renderer/uikit/Tree/Tree.story.ts` | Stable custom-row delegation in the story view. |
| `src/renderer/editors/browser/BrowserTabsPanel.ts` | Stable favicon target/listener in `TabItemView`. |
| `src/renderer/editors/link-editor/LinksListView.ts` | Release action-button listener handles when pooled-cell actions are torn down. |
| `src/renderer/editors/markdown/CodeBlock.ts` | Stable Mermaid open/copy controls and listeners. |

### Files explicitly requiring no changes

These files require no source change: census listener sites were verified to be in `onMount()` or
in a helper reached only from `onMount()`, or were recorded above as deliberately bounded menu or
pooled-wrapper designs. Adjacent reference/consumer files were also checked to document the
unchanged boundary. They are intentionally excluded from the sweep so the implementer does not
re-investigate them:

| File | Verified reason for no change |
|---|---|
| `src/renderer/uikit/shared/keyed-list.ts` | Reconciliation primitive is used by the planned fixes; no listener registration here. |
| `src/renderer/uikit/Autocomplete/AutocompleteView.ts` | Listener is installed in outer `onMount()` on the stable input. |
| `src/renderer/uikit/Button/ButtonView.ts` | Listener is installed in `onMount()`. |
| `src/renderer/uikit/Checkbox/CheckboxView.ts` | Listener is installed in `onMount()`. |
| `src/renderer/uikit/Dialog/DialogView.ts` | Listeners are installed in `onMount()`. |
| `src/renderer/uikit/IconButton/IconButtonView.ts` | Listener is installed in `onMount()`. |
| `src/renderer/uikit/ImageViewport/ImageViewportView.ts` | All listeners are installed in `onMount()`. |
| `src/renderer/uikit/Input/InputView.ts` | Listeners are installed in `onMount()`. |
| `src/renderer/uikit/ListBox/ListItemView.ts` | Child row listeners are installed in each child view's one-time `onMount()`. |
| `src/renderer/uikit/ListBox/ListBoxView.ts` | Three cell listeners are installed once per pooled wrapper; see the negative finding and comments at `:446-448`. |
| `src/renderer/uikit/Minimap/MinimapView.ts` | Listeners are installed in `onMount()`. |
| `src/renderer/uikit/MultiListBox/MultiListBoxView.ts` | Listener is installed in `onMount()`. |
| `src/renderer/uikit/MultiSelect/MultiSelectView.ts` | Listeners are installed in `onMount()`. |
| `src/renderer/uikit/Menu/MenuView.ts` | Menu-content listeners are released when Popover closes and disposes its floating branch; see the negative finding above. |
| `src/renderer/uikit/Notification/NotificationView.ts` | Root listener is installed in `onMount()`; close control owns its own mount listener. |
| `src/renderer/uikit/Popover/PopoverView.ts` | Floating-root and dismissal listeners are installed in `onMount()`. |
| `src/renderer/uikit/Select/SelectView.ts` | Listeners are installed in `onMount()`. |
| `src/renderer/uikit/Slider/SliderView.ts` | Listener is installed in `onMount()`. |
| `src/renderer/uikit/Splitter/SplitterView.ts` | Listeners are installed in `onMount()`. |
| `src/renderer/uikit/Toolbar/ToolbarView.ts` | Listeners are installed in `onMount()`. |
| `src/renderer/uikit/TruncatedText/TruncatedTextView.ts` | Listener is installed in `onMount()`. |
| `src/renderer/uikit/VirtualGrid/VirtualGridView.ts` | Listener is installed in `onMount()` on the stable scroll container. |
| `src/renderer/uikit/Tree/TreeView.ts` | Ten cell listeners are installed once per pooled wrapper; see the negative finding and comments at `:480-487`. |
| `src/renderer/components/file-list/FileListView.ts` | Listener is installed in `onMount()`. |
| `src/renderer/components/tree-provider/CategoryViewImpl.ts` | Root listeners are installed by `installRootListeners()` from `onMount()` only. |
| `src/renderer/components/tree-provider/TreeProviderViewImpl.ts` | Root listeners are installed in `onMount()` only. |
| `src/renderer/editors/base/TextChromeView.ts` | Listener is installed in `onMount()`. |
| `src/renderer/editors/board/BoardToolbar.ts` | Listener is installed in `onMount()`. |
| `src/renderer/editors/board/BoardWebview.ts` | Listener is installed in `onMount()`. |
| `src/renderer/editors/board-info/BoardInfoEditorView.ts` | Window listener is installed in `onMount()`. |
| `src/renderer/editors/board-info/BoardScreenshotView.ts` | Image listener is installed in `onMount()`. |
| `src/renderer/editors/browser/BookmarksDrawer.ts` | Both listeners are installed in `onMount()`. |
| `src/renderer/editors/browser/BrowserView.ts` | Listeners are installed in `onMount()`. |
| `src/renderer/editors/draw/DrawBodyView.ts` | Listeners are installed in `onMount()`. |
| `src/renderer/editors/env-vars/EnvVarsBodyView.ts` | Namespace-row listener is installed in the child row's `onMount()`. |
| `src/renderer/editors/graph/GraphBodyView.ts` | Search-row and main graph listeners are installed in their respective `onMount()` methods. |
| `src/renderer/editors/graph/GraphDetailPanelView.ts` | Detail/info listeners are installed in `onMount()` only. |
| `src/renderer/editors/graph/GraphLegendPanelView.ts` | Legend row/tab listeners are installed in child/parent `onMount()` methods. |
| `src/renderer/editors/graph/GraphTooltipView.ts` | Listeners are installed in `onMount()`. |
| `src/renderer/editors/link-editor/LinkBody.ts` | Center-panel listeners are installed in `onMount()`. |
| `src/renderer/editors/link-editor/LinksTilesView.ts` | Cell/action/image listeners are installed from `createCell()` once per pooled cell; see the negative finding above. |
| `src/renderer/editors/link-editor/PinnedLinksPanelView.ts` | Pinned-item listeners are installed in each retained child view's `onMount()`. |
| `src/renderer/editors/log-view/items/McpRequestView.ts` | Listener is installed in `onMount()`. |
| `src/renderer/editors/log-view/LogBodyView.ts` | `listenForScroll()` is called only from `onMount()` (`:102-110`), despite the repeatable-looking helper name. |
| `src/renderer/editors/markdown/MarkdownBlockView.ts` | Listener is installed in `onMount()`. |
| `src/renderer/editors/markdown/MarkdownBodyView.ts` | Listeners are installed in `onMount()`. |
| `src/renderer/editors/markdown/MarkdownImage.ts` | Both toolbar listeners are installed in `onMount()` of a non-updating image view. |
| `src/renderer/editors/mcp-inspector/McpInspectorView.ts` | Saved-row and inspector-root listeners are installed in `onMount()`. |
| `src/renderer/editors/mcp-inspector/PromptsPanel.ts` | Prompt-row listener is installed in the child row's `onMount()`. |
| `src/renderer/editors/mcp-inspector/ResourceContentView.ts` | Listener is installed in `onMount()`. |
| `src/renderer/editors/mcp-inspector/ResourcesPanel.ts` | Resource-row listener is installed in the child row's `onMount()`. |
| `src/renderer/editors/mcp-inspector/ToolsPanel.ts` | Detail/header listeners are installed in `onMount()`. |
| `src/renderer/editors/mneme-config/RootsPanel.ts` | Root-row listeners are installed in the child row's `onMount()`. |
| `src/renderer/editors/notebook/ExpandedNoteView.ts` | Root listener is installed in `onMount()`; state sync does not register it. |
| `src/renderer/editors/notebook/NoteItemView.ts` | All listeners are installed by static DOM setup from `onMount()`. |
| `src/renderer/editors/rest-client/RequestBuilderView.ts` | Header listeners are installed in `onMount()`. |
| `src/renderer/editors/rest-client/RestClientShared.ts` | Header listeners are installed in `onMount()`. |
| `src/renderer/editors/settings/sections/BrowserProfilesSection.ts` | All listeners are in retained child `onMount()` methods. |
| `src/renderer/editors/settings/sections/SettingsSections.ts` | Listener is installed in `onMount()`. |
| `src/renderer/editors/settings/sections/ThemeSection.ts` | Theme option listeners are created by `createGrid()` reached only from `onMount()`. |
| `src/renderer/editors/text/ScriptPanelView.ts` | Listener is installed in `onMount()`. |
| `src/renderer/editors/video/AudioControls.ts` | Listeners are installed in `onMount()`. |
| `src/renderer/editors/video/AudioPlayer.ts` | Listeners are installed in `onMount()`. |
| `src/renderer/editors/video/AudioVisualizer.ts` | Listeners are installed in `onMount()`. |
| `src/renderer/editors/video/VPlayer.ts` | Listeners are installed in `onMount()`. |
| `src/renderer/ui/app/MainPageView.ts` | Listeners are installed in `onMount()`/one-time button setup. |
| `src/renderer/ui/dialogs/PasswordDialogView.ts` | Input listeners are installed in `onMount()` only. |
| `src/renderer/ui/sidebar/FolderItemView.ts` | Listener is installed in `onMount()`. |
| `src/renderer/ui/sidebar/MenuBarView.ts` | Root/content listeners are installed in `onMount()`. |
| `src/renderer/ui/tabs/PageTabsView.ts` | Wheel listener is installed in `onMount()`. |
| `src/renderer/ui/tabs/PageTabView.ts` | Tab listeners are installed in `onMount()`; updates only change existing child state. |
| `src/renderer/uikit/SegmentedControl/SegmentedControlView.ts` | Reference pattern: child `ButtonView` owns its one-time listener; no direct census site. |
| `src/renderer/editors/category/CategoryEditor.ts` | Consumer only updates retained `BreadcrumbView`; it has no `this.listen()` site. |
| `src/renderer/uikit/Breadcrumb/Breadcrumb.ts` | Props-only declaration; no listener site or public API change is indicated. |
| `src/renderer/uikit/Breadcrumb/Breadcrumb.css` | Existing direct-span and clip-start CSS contract remains valid. |

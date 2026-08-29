# US-1203 — The uikit drill: collapse the seven-layer props relay

## Goal

Collapse the live-data props relay through the shared UIKit list/dropdown path. A child that owns a
stable identity should be configured once; changing live data should reach the owner through a
targeted setter or the child’s own model binding. Preserve the native content-view seam, pooled-row
semantics, scrolling behaviour, and all application-facing callbacks.

This is a planning document only. No implementation, tests, test harnesses, or commit belong to this
task-document phase.

## Background

The house convention is that `update(props)` carries construction-time configuration, not a render
pass for pushing live data through every descendant ([`model-view-pattern.md:349-361`](../../standards/model-view-pattern.md#the-props-pump-convention)).
`VanillaView.update()` stores props and calls `onUpdate()` after mount without an equality gate
([`vanilla-view.ts:84-97`](../../../src/renderer/uikit/shared/vanilla-view.ts#L84-L97)); it must remain
unchanged. Selectors must return direct references, primitives, or plain objects containing those
values, never a newly allocated array ([`state.ts:28-40`](../../../src/renderer/core/state/state.ts#L28-L40),
[`model-view-pattern.md:384-420`](../../standards/model-view-pattern.md#selector-authoring)).

The current source was read before planning. Two important corrections to the epic headline are
recorded here:

- The seven named levels are not seven identical `update()` relays. `PopoverFloatingView` creates,
  claims, and mounts the content view once per open branch; its `onUpdate()` updates only the
  floating shell ([`PopoverView.ts:65-113`](../../../src/renderer/uikit/Popover/PopoverView.ts#L65-L113)).
- `ListItemView` is intentionally re-pointed as a virtualized cell is reused. Its props contain the
  current row’s label, selection, active state, slots, tooltip, and drag data, so that update is a
  row update rather than a redundant parent configuration relay ([`ListBoxView.ts:292-352`](../../../src/renderer/uikit/ListBox/ListBoxView.ts#L292-L352),
  [`ListItemView.ts:102-179`](../../../src/renderer/uikit/ListBox/ListItemView.ts#L102-L179)).

The implementation should therefore collapse only the forwarding/configuration edges. It must not
turn a pooled row into a permanently configured row or make the floating branch own content that is
currently owned by the caller’s `contentView` factory.

## Verified relay chain

The table uses “minted” to mean a new object literal or a newly computed child-props projection. The
trigger column distinguishes parent prop pumps, state bindings, branch creation, and virtualization
paints.

| Hop | Current props object and minting site | Trigger | Finding | Planned boundary |
|---|---|---|---|---|
| `MultiSelectView → PopoverView` | `MultiSelectView.popoverProps()` creates `PopoverViewProps`, including open state, anchor, placement, resize options, stable model callbacks, and the content factory ([`MultiSelectView.ts:220-243`](../../../src/renderer/uikit/MultiSelect/MultiSelectView.ts#L220-L243)). | Initial mount; every `MultiSelectView.onUpdate()`; every `open` / `popoverResized` state notification through `syncChildren()` ([`MultiSelectView.ts:92-126`](../../../src/renderer/uikit/MultiSelect/MultiSelectView.ts#L92-L126), [`:153-175`](../../../src/renderer/uikit/MultiSelect/MultiSelectView.ts#L153-L175)). | Adds dropdown chrome and structural open/close state; not forwarding-only. | Keep a stable popover child. Give the popover explicit targeted operations for branch/open state and changed positioning/size configuration; do not pass the list props through this edge. |
| `PopoverView → PopoverFloatingView` | `PopoverView.syncBranch()` passes the current `PopoverViewProps` to the branch constructor and, while open, calls `activeBranch.update(props)` ([`PopoverView.ts:344-377`](../../../src/renderer/uikit/Popover/PopoverView.ts#L344-L377)). | Open-branch creation, then every `PopoverView.onUpdate()` while the anchor exists ([`PopoverView.ts:336-355`](../../../src/renderer/uikit/Popover/PopoverView.ts#L336-L355)). | Adds floating DOM, positioning, outside-click/Escape listeners, resize handle, shell attributes, and model middleware ([`PopoverView.ts:65-97`](../../../src/renderer/uikit/Popover/PopoverView.ts#L65-L97), [`:144-227`](../../../src/renderer/uikit/Popover/PopoverView.ts#L144-L227)). It is not a pure relay. | Retain a branch reference and split shell configuration from live content. A changed placement/anchor/size option may still update the shell through a named targeted method. |
| `PopoverFloatingView → contentView` | No update object is forwarded. On mount, the floating view calls the factory, claims the returned view, and mounts it ([`PopoverView.ts:87-96`](../../../src/renderer/uikit/Popover/PopoverView.ts#L87-L96)); `onUpdate()` stops at shell work ([`PopoverView.ts:99-113`](../../../src/renderer/uikit/Popover/PopoverView.ts#L99-L113)). | Once for each open branch; branch disposal on close. | The epic’s apparent third relay is absent in the current tree. The content view remains caller-owned through the shared ownership marker. | No new forwarding channel. Keep the factory seam, bare caller reference, and exactly-once claim/mount contract. |
| `MultiSelectView content factory → MultiListBoxView` | `MultiSelectView.listProps()` creates the inner-list props, including outer `items`/`value`/callback plus model-derived resize behaviour ([`MultiSelectView.ts:235-265`](../../../src/renderer/uikit/MultiSelect/MultiSelectView.ts#L235-L265)). | Open branch creation; while open, every `syncChildren()` call invokes `listView.update(this.listProps())` ([`MultiSelectView.ts:153-175`](../../../src/renderer/uikit/MultiSelect/MultiSelectView.ts#L153-L175)). | Adds the MultiSelect-specific list id, selection contract, filtering options, select-all options, and resize-dependent height; not forwarding-only. | Create the `MultiListBoxView` once per open branch and retain the bare reference. Push only explicit live fields through a targeted MultiListBox API; keep branch recreation on close/open. |
| `MultiListBoxView → ListBoxView` | `MultiListBoxView.listProps()` creates a `ListBoxProps<T>` object containing filtered items, a memoized selection predicate, active/search state, checkbox mode, row sizing, and handlers ([`MultiListBoxView.ts:252-277`](../../../src/renderer/uikit/MultiListBox/MultiListBoxView.ts#L252-L277)). | Initial mount; every MultiListBox parent update; every `searchText` / `activeIndex` state notification. `syncChildren()` calls `list.update(this.listProps())` ([`MultiListBoxView.ts:130-142`](../../../src/renderer/uikit/MultiListBox/MultiListBoxView.ts#L130-L142), [`:170-198`](../../../src/renderer/uikit/MultiListBox/MultiListBoxView.ts#L170-L198)). | Adds filtering, select-all presentation, checkbox row mode, and the caller-owned selection predicate. The predicate identity is deliberately the signal that carries selection changes ([`MultiListBoxModel.ts:123-139`](../../../src/renderer/uikit/MultiListBox/MultiListBoxModel.ts#L123-L139)). | Configure the ListBox child once with stable handlers and static row options. Add targeted setters for the fields that genuinely move (`items`, selection predicate, `activeIndex`, `searchText`, and the affected sizing/empty-state fields), with one consequence per state/prop path. Do not replace the predicate with a stable bound method before US-1205 removes the memo contract. |
| `ListBoxView → VirtualGridView` | `ListBoxView.gridProps()` creates grid options with a model-backed row-count thunk, stable `renderCell`, row geometry, and growth/whitespace configuration ([`ListBoxView.ts:268-285`](../../../src/renderer/uikit/ListBox/ListBoxView.ts#L268-L285)). | A real-arm entry constructs the grid; every real-arm ListBox update calls `grid.update(this.gridProps(props))` ([`ListBoxView.ts:171-185`](../../../src/renderer/uikit/ListBox/ListBoxView.ts#L171-L185), [`:230-238`](../../../src/renderer/uikit/ListBox/ListBoxView.ts#L230-L238)). | Adds virtualization and layout configuration. `VirtualGridModel.setOptions()` already compares actual engine inputs and recomputes only when they move ([`VirtualGridModel.ts:160-181`](../../../src/renderer/uikit/VirtualGrid/VirtualGridModel.ts#L160-L181), [`:331-383`](../../../src/renderer/uikit/VirtualGrid/VirtualGridModel.ts#L331-L383)). | Retain the grid reference and configure the stable engine options at creation. Route row-data invalidation through `grid.model.update({ all: true })`; route only changed layout options through the existing model option seam or a narrowly named view setter. Do not rebuild `gridProps()` on each upstream state write. |
| `VirtualGrid renderCell → ListItemView` | `ListBoxView.itemProps()` creates row-specific `ListItemProps` for each cell render ([`ListBoxView.ts:311-378`](../../../src/renderer/uikit/ListBox/ListBoxView.ts#L311-L378)). | A cell is admitted, recycled, or explicitly dirtied by the grid; `renderCell` creates a row view or calls `record.view.update(...)` ([`ListBoxView.ts:292-352`](../../../src/renderer/uikit/ListBox/ListBoxView.ts#L292-L352)). | Adds row identity, source-derived slots, active/selected state, tooltip, variant, and checkbox presentation. This update is required because pooled wrappers change row meaning. `ListItemView` itself applies DOM and residual props ([`ListItemView.ts:108-179`](../../../src/renderer/uikit/ListBox/ListItemView.ts#L108-L179)). | Do not collapse the row update. Keep one retained row view per admitted pooled wrapper, stable listeners, and `fillSlot` ownership. Any callback identity change here must be justified by row repointing, not by an upstream relay. |

### Autocomplete’s pure form

`AutocompleteContentView` adopts the floating host and creates its ListBox once in `onMount()`
([`AutocompleteView.ts:35-79`](../../../src/renderer/uikit/Autocomplete/AutocompleteView.ts#L35-L79)). Its
`sync()` then performs the exact nested relay named by the epic: `this.list.update(props.list)`
([`AutocompleteView.ts:81-104`](../../../src/renderer/uikit/Autocomplete/AutocompleteView.ts#L81-L104)).
`AutocompleteView.contentProps()` mints the wrapper object and `listProps()` mints the ListBox
projection from filtered items, active index, stable model handlers, and sizing ([`AutocompleteView.ts:246-340`](../../../src/renderer/uikit/Autocomplete/AutocompleteView.ts#L246-L340)).

The conversion must retain the header/action slot updates but make the list a retained child with a
targeted live-data path. The filtered array is a model result, not a selector; do not “fix” this by
allocating a mapped array inside a state selector. `AutocompleteView` also has the same Select-style
Popover/ListBox structure, so Select is included in the compound-component slice even though the
epic’s headline names MultiSelect.

## `createDepsGate` consumers in the affected scope

The current uikit scope has two actual `createDepsGate()` fields, not fourteen: `ListBoxView` and
`TreeView`. The additional renderer-wide consumers are editor-local measurement, selection, async,
or reset gates and are not affected components. No gate is proven dead by this source inspection.

| Consumer | Current role and evidence | Decision | Reason |
|---|---|---|---|
| `src/renderer/uikit/ListBox/ListBoxView.ts:67` — `repaintGate` | Compares the fixed `ListBoxModel.repaintSignature()` after the driver pump and requests one full grid repaint when rendered inputs move ([`ListBoxView.ts:143-153`](../../../src/renderer/uikit/ListBox/ListBoxView.ts#L143-L153), [`ListBoxModel.ts:224-272`](../../../src/renderer/uikit/ListBox/ListBoxModel.ts#L224-L272)). Direct application callers still update ListBox data and row rendering still depends on items, selection, active index, search text, renderer, tooltip, variant, selection style, and checkbox. | **Keep** | Collapsing upstream relays reduces how often this gate is reached; it does not remove the genuine comparison for direct ListBox consumers. Removing it would turn every targeted push into an unconditional full repaint. |
| `src/renderer/uikit/Tree/TreeView.ts:70` — `repaintGate` | Prop updates compare the tree’s rendered inputs ([`TreeView.ts:160-170`](../../../src/renderer/uikit/Tree/TreeView.ts#L160-L170)); internal expansion, lazy-load, and drag writes use the model’s `onStateApplied` render-pass funnel, which primes the gate after repaint ([`TreeView.ts:172-204`](../../../src/renderer/uikit/Tree/TreeView.ts#L172-L204)). | **Keep** | Tree is a shared virtualized component with genuine model-side recomputation and root `aria-activedescendant` consequences. Its gate is not a forwarded-identity absorber. |
| `src/renderer/editors/rest-client/RequestBuilderView.ts:79,281` — `bodyMeasureGate`, `valueGate` | `bodyMeasureGate` gates measured body layout ([`RequestBuilderView.ts:162-200`](../../../src/renderer/editors/rest-client/RequestBuilderView.ts#L162-L200)); `valueGate` detects external raw-body value changes and calls the Monaco host’s targeted `setValue` path ([`RequestBuilderView.ts:277-292`](../../../src/renderer/editors/rest-client/RequestBuilderView.ts#L277-L292)). | **Keep** | The first is layout measurement. The second is the required targeted value update and must not be deleted when the RawBody relay is converted. |

Removal set: **none**. `createDepsGate` itself remains, as required by the epic. The gate population
shrinks operationally because forwarding-only pushes stop reaching the retained children; no current
gate may be deleted merely because its input is now less frequently changed.

## Deferral decisions from US-1202

| Deferred path | Decision | Verified reason and boundary |
|---|---|---|
| `TextChromeView` → `PageToolbarView` / `EditorToolbarView` | **US-1203, compound/editor slice** | `TextChromeView.onUpdate()` still pushes a fresh page-toolbar object and footer object ([`TextChromeView.ts:298-320`](../../../src/renderer/editors/base/TextChromeView.ts#L298-L320)); it constructs the page toolbar once ([`TextChromeView.ts:344-383`](../../../src/renderer/editors/base/TextChromeView.ts#L344-L383)). `PageToolbarView` constructs `EditorToolbarView` once but still updates it and pushes `{ model }` to `NavPanelButtonView` and `SwitchWidgetView` ([`PageToolbarView.ts:381-416`](../../../src/renderer/editors/base/PageToolbarView.ts#L381-L416), [`:426-437`](../../../src/renderer/editors/base/PageToolbarView.ts#L426-L437)). US-1202 explicitly deferred this shared toolbar/uikit boundary until the uikit contract settles. Include it in the compound slice, preserving slot updates and leaving any ref channel for US-1204. |
| `RequestBuilderView` → `KeyValueEditorView` for headers | **US-1203, editor slice** | The child is constructed once but receives `items` plus three fresh callback closures in `HeadersTableView.onUpdate()` ([`RequestBuilderView.ts:253-259`](../../../src/renderer/editors/rest-client/RequestBuilderView.ts#L253-L259)). Convert after the settled child contract: stable handler fields plus a targeted items update. |
| `RequestBuilderView` → `KeyValueEditorView` for form-urlencoded | **US-1203, editor slice** | The same shape exists in `FormUrlEncodedView`: construction at `:305`, then fresh `items` and callbacks at `:307` ([`RequestBuilderView.ts:303-308`](../../../src/renderer/editors/rest-client/RequestBuilderView.ts#L303-L308)). It is a sibling of the header path, not a ref-channel issue. |
| `RawBodyView` → `MonacoEditorHostView` | **US-1203, separate targeted-value sub-slice** | `RawBodyView.onUpdate()` currently sends language/options/change configuration ([`RequestBuilderView.ts:310-316`](../../../src/renderer/editors/rest-client/RequestBuilderView.ts#L310-L316)); `BodyContentView` separately detects body value changes and calls `setValue` ([`RequestBuilderView.ts:277-292`](../../../src/renderer/editors/rest-client/RequestBuilderView.ts#L277-L292)). Preserve that distinction: language/configuration may use a targeted host operation, and body text must use `setValue`; do not model this as a model fan-out. Leave Monaco’s existing timer audit for R8/Epic C ([`MonacoEditorHostView.ts:184-193`](../../../src/renderer/editors/shared/MonacoEditorHostView.ts#L184-L193)). |
| `GridBodyView.onModel` | **US-1204** | The channel is passed at construction and again in `GridEditorView.onUpdate()` ([`src/renderer/editors/grid/index.ts:218-243`](../../../src/renderer/editors/grid/index.ts#L218-L243), [`:249-267`](../../../src/renderer/editors/grid/index.ts#L249-L267)). It is explicitly ref/onModel machinery. Confirmed out of US-1203; do not touch it. |

No item from this table is assigned to Epic C: the first three are props-pump/targeted-setter work;
the Grid `onModel` path is the ref-channel task. Full rebuilds, immer collections, and timers remain
outside this task as directed by EPIC-076 B-3.

## Implementation Plan

### Recommended scope split

This is too large and too shared to land safely as one undifferentiated change. Split the
implementation into two concrete slices, reviewed and manually verified separately:

1. **US-1203A — UIKit engine and list leaves:** establish the retained-child/targeted-setter
   contract at `ListBoxView` ↔ `VirtualGridView`, preserve `ListItemView`’s pooled-row update,
   retain both legitimate gates, then convert `MultiListBoxView` and the direct ListBox paths. This
   gives a stable lower-level contract before dropdown branches depend on it.
2. **US-1203B — Compound dropdowns and deferred editor edges:** convert `PopoverView`’s shell
   configuration boundary, then `SelectView`, `MultiSelectView`, and `AutocompleteView`; finally
   take over TextChrome, both KeyValue paths, and the RawBody targeted value/language path. Keep the
   `GridBodyView.onModel` edge in US-1204. 

Do not deliver only the first slice under the completed US-1203 acceptance criteria: the dashboard
task remains open until both slices are implemented and manually checked. If separate task IDs are
created, keep this document as the parent plan and link both child tasks from the epic block.

### Detailed steps

1. Add the smallest explicit targeted API required by the lower-level contract. Keep stable
   construction-time callbacks as fields. Add `VirtualGridView.setLayout({ rowHeight,
   growToHeight, growToWidth, height, fitToWidth, whiteSpaceY })`; it applies only changed layout
   fields and delegates engine geometry to `VirtualGridModel.setOptions()`. Use
   `VirtualGridModel.update({ all: true })` for row-data invalidation; do not pass a new full
   grid-options object through `VirtualGridView.update()` on every list state write
   ([`VirtualGridModel.ts:160-181`](../../../src/renderer/uikit/VirtualGrid/VirtualGridModel.ts#L160-L181)).
2. In `ListBoxView`, construct the grid once per real arm, retain its reference, and separate stable
   engine inputs from changing layout inputs. Preserve the three-arm transitions and disposal order
   ([`ListBoxView.ts:159-249`](../../../src/renderer/uikit/ListBox/ListBoxView.ts#L159-L249)). Keep
   `repaintGate` because direct consumers still change its signature.
3. In `MultiListBoxView`, retain the ListBox child and route `items`, caller-owned selection,
   `searchText`, `activeIndex`, empty state, and sizing through named targeted operations. Keep one
   `syncChildren()` consequence for both the state bind and the prop update; the select-all header
   depends on both filtered state and outer `value` ([`MultiListBoxView.ts:170-277`](../../../src/renderer/uikit/MultiListBox/MultiListBoxView.ts#L170-L277)).
4. Apply the same lower-level contract to Select’s open content and its ListBox. Select has the
   same Popover/ListBox relay and explicitly has no own gate because its live inputs arrive through
   state and the child gate absorbs duplicate pushes ([`SelectView.ts:20-50`](../../../src/renderer/uikit/Select/SelectView.ts#L20-L50), [`:173-286`](../../../src/renderer/uikit/Select/SelectView.ts#L173-L286)).
5. Convert MultiSelect and Autocomplete without changing the content ownership seam. MultiSelect’s
   list branch is created by the factory and must be appended to the host ([`MultiSelectView.ts:235-242`](../../../src/renderer/uikit/MultiSelect/MultiSelectView.ts#L235-L242)); Autocomplete’s content view adopts the host and must not append itself ([`AutocompleteView.ts:293-310`](../../../src/renderer/uikit/Autocomplete/AutocompleteView.ts#L293-L310)).
6. Convert Popover shell updates only where a targeted operation can preserve positioning,
   resize, outside-click, ref, and callback behaviour. The floating branch must continue to claim
   and mount the returned content exactly once and must not begin forwarding content props.
7. Take over the editor edges listed in the deferral table only after the lower-level contract is
   stable. Hoist KeyValue callbacks into fields, retain live items through a targeted setter, and
   preserve RawBody’s separate `setValue` and language paths. Do not touch `ElementRef`, `bindRef`,
   `onModel`, or `*CallerRef` machinery; those belong to US-1204.
8. Do not change `memo()` in this task. `MultiListBoxModel.isSelected`, Select projections, and
   Autocomplete/ListBox projections remain as-is for US-1205 ([`MultiListBoxModel.ts:123-139`](../../../src/renderer/uikit/MultiListBox/MultiListBoxModel.ts#L123-L139)).

### Before → after shape

Current nested relay in MultiListBox:

```ts
// Before: every state or parent-prop consequence mints a ListBoxProps object.
private syncChildren(): void {
    // ... header and input synchronization ...
    this.input.update(this.inputProps());
    this.list.update(this.listProps());
}
```

Planned shape (these are the concrete targeted methods to add in US-1203A; they are not current
APIs):

```ts
// After: the child is configured once; only fields that genuinely moved are targeted.
private syncChildren(): void {
    // ... header and input synchronization ...
    this.list.setItems(this.model.listBoxItems.value);
    this.list.setSelection(this.model.isSelected.value);
    this.list.setActiveIndex(this.model.state.get().activeIndex);
    this.list.setSearchText(this.model.state.get().searchText);
    this.list.setLayout(this.layoutProps());
}
```

`ListBoxView` will expose these five targeted operations—`setItems`, `setSelection`,
`setActiveIndex`, `setSearchText`, and `setLayout`—and will keep `onChange` and `onActiveChange`
as construction-time fields. The operations may share one internal consequence pass, but may not
recreate a full child props object or hide multiple consequences behind an equality gate. Retain
the predicate identity signal until the memo task.

## Concerns

- **Shared-component blast radius.** These are UIKit primitives, not editor-local views. A bug in
  ListBox or VirtualGrid can affect a sidebar, a browser popup, a dialog, an editor panel, and the
  storybook surface at once. A bug in Popover can affect every portalled menu and dropdown.
- **Ownership is intentionally asymmetric.** `PopoverFloatingView` owns the content view after
  `child()` claims it; the caller keeps only a bare reference for targeted pushes. A second claim or
  a caller-side dispose would violate the shared marker/lifecycle contract
  ([`uikit/CLAUDE.md` structural-helper rules](../../../src/renderer/uikit/CLAUDE.md)).
- **Pooled rows are not static configuration.** A cell wrapper retains listeners and may be
  re-pointed to another row. Do not remove `ListItemView.update()` or cache row-specific DOM nodes;
  retain the current `CellRecord`/slot cleanup rules ([`ListBoxView.ts:297-414`](../../../src/renderer/uikit/ListBox/ListBoxView.ts#L297-L414)).
- **Scrolling is a coupled consequence.** When content and active index move in one push, use
  `scrollToRowAfterPaint`; when only the active row moves, use `scrollToRow`
  ([`ListBoxView.ts:420-437`](../../../src/renderer/uikit/ListBox/ListBoxView.ts#L420-L437)). Do
  not split a content/highlight consequence into two state writes or add `queueMicrotask` or
  `setTimeout(0)` to mask it. `TOneState` dispatch is copy-on-write and synchronous
  ([`state.ts:52-95`](../../../src/renderer/core/state/state.ts#L52-L95)).
- **No fresh selector arrays.** Model memo dependency arrays are not state selectors; nevertheless,
  any new `bind()` selector must return a direct reference, primitive, or plain object of those
  values. Do not use `.map()` inside a selector.
- **No new invariant throws.** The seven existing US-1202 model-identity throws remain, but this
  task must record lifecycle/model invariants in this document rather than add throw guards.
- **No ref or memo conversion.** `ElementRef`, `bindRef`, `onModel`, `*CallerRef`, and `memo()` are
  explicitly owned by US-1204/US-1205. A relay that cannot collapse without one of those channels
  must be recorded as a dependency and left intact.

## Per-component risk and real application surfaces

| Converted/shared component | Surfaces that exercise it | Risk note |
|---|---|---|
| `MultiSelectView` | Currently the UIKit Storybook `multiSelectStory` only ([`MultiSelect.story.ts:1-100`](../../../src/renderer/uikit/MultiSelect/MultiSelect.story.ts#L1-L100)); no application import was found. | Its low current app population does not make the contract low-risk: it composes Input, Popover, MultiListBox, ListBox, VirtualGrid, and pooled rows in one path. |
| `MultiListBoxView` | UIKit Storybook `multiListBoxStory` ([`MultiListBox.story.ts:1-80`](../../../src/renderer/uikit/MultiListBox/MultiListBox.story.ts#L1-L80)) and MultiSelect’s dropdown. | Search, select-all, selection predicate identity, and active-row scrolling all meet here; a missed field appears as a stale row or stale tri-state header. |
| `SelectView` | Text Script panel ([`ScriptPanelView.ts:203`](../../../src/renderer/editors/text/ScriptPanelView.ts#L203)), settings sections ([`SettingsSections.ts:54-68`](../../../src/renderer/editors/settings/sections/SettingsSections.ts#L54-L68)), graph expansion settings ([`GraphExpansionSettingsView.ts:86`](../../../src/renderer/editors/graph/GraphExpansionSettingsView.ts#L86)), link dialog, log selection dialog, MCP inspector controls, Mneme mode selection, and UIKit Storybook. | A regression can affect dialogs, settings persistence, editor toolbars, and disabled/read-only behaviour, not merely a dropdown story. |
| `AutocompleteView` | REST-client key editor ([`KeyValueEditorView.ts:1-2,155-170`](../../../src/renderer/editors/rest-client/KeyValueEditorView.ts#L1-L2)), plus UIKit Storybook. | Filtered rows, active index, header slots, and the input ref are separate live/configuration channels; a missing list update produces a silent stale suggestion menu. |
| `PopoverView` | Select/MultiSelect/Autocomplete/PathInput; Menu; board toolbar; grid CSV/column options; browser downloads and tab previews; file-diff revision picker; URL suggestions; REST and other editor popups; UIKit/DataGrid/Popover stories. Examples: [`MenuView.ts:306-336`](../../../src/renderer/uikit/Menu/MenuView.ts#L306-L336), [`PathInputView.ts:251-291`](../../../src/renderer/uikit/PathInput/PathInputView.ts#L251-L291), [`UrlSuggestionsDropdown.ts:28-43`](../../../src/renderer/editors/browser/UrlSuggestionsDropdown.ts#L28-L43). | Positioning, portal ownership, outside-click dismissal, resize, and direct-child layout are cross-cutting. A shell regression is app-wide and often invisible until a popup is resized or opened near an edge. |
| `ListBoxView` | Open tabs, sidebar folder/built-in-editor lists, file lists, browser URL suggestions, MCP tools, storybook, and all Select/MultiListBox/Autocomplete dropdowns. Examples: [`OpenTabsListView.ts:51`](../../../src/renderer/ui/sidebar/OpenTabsListView.ts#L51), [`MenuBarView.ts:156`](../../../src/renderer/ui/sidebar/MenuBarView.ts#L156), [`FileListView.ts:35`](../../../src/renderer/components/file-list/FileListView.ts#L35), [`UrlSuggestionsDropdown.ts:28`](../../../src/renderer/editors/browser/UrlSuggestionsDropdown.ts#L28). | It is the highest fan-out leaf: changes touch loading/empty arms, keyboard navigation, selection styling, context menus, virtualization, and scroll timing. |
| `VirtualGridView` | ListBox and Tree internally; standalone file search, link lists/tiles, log body, notebook body, DataGrid/VirtualFlexGrid, and the VirtualGrid story. Examples: [`FileSearchView.ts:239`](../../../src/renderer/components/file-search/FileSearchView.ts#L239), [`LinksListView.ts:124`](../../../src/renderer/editors/link-editor/LinksListView.ts#L124), [`LogBodyView.ts:5`](../../../src/renderer/editors/log-view/LogBodyView.ts#L5), [`VirtualFlexGridView.ts:136-146`](../../../src/renderer/uikit/VirtualGrid/VirtualFlexGridView.ts#L136-L146). | Geometry and paint scheduling are shared by lists, grids, and embedded editor surfaces. Never put DOM work in the model or alter the bounded no-state paint-loop exemption. |
| `ListItemView` | ListBox’s default rows, link-editor list/pinned rows, sidebar folder rows, and the ListBox story ([`LinksListView.ts:224`](../../../src/renderer/editors/link-editor/LinksListView.ts#L224), [`PinnedLinksPanelView.ts:56`](../../../src/renderer/editors/link-editor/PinnedLinksPanelView.ts#L56), [`FolderItemView.ts:150`](../../../src/renderer/ui/sidebar/FolderItemView.ts#L150)). | Direct consumers use it outside ListBox, so any slot, selection, tooltip, or residual-prop change has a wider surface than the seven-hop dropdown. Its row update is retained, not removed. |
| `TreeView` (gate sibling in the affected UIKit contract) | Explorer category tree, trusted boards/tools trees, notebook categories, REST request tree, Git refs, and Tree story. Examples: [`TreeProviderViewImpl.ts:170`](../../../src/renderer/components/tree-provider/TreeProviderViewImpl.ts#L170), [`NotebookCategoriesSecondaryView.ts:79`](../../../src/renderer/editors/notebook/panels/NotebookCategoriesSecondaryView.ts#L79), [`RestRequestTreeView.ts:79`](../../../src/renderer/editors/rest-client/panels/RestRequestTreeView.ts#L79), [`GitRefsView.ts:75`](../../../src/renderer/editors/git-tree/GitRefsView.ts#L75). | Tree is not part of the seven-hop MultiSelect chain, but its shared gate and VirtualGrid contract must not be weakened while the ListBox/VirtualGrid boundary changes. |

## Manual verification checklist

Run these against real consumers after each implementation slice; storybook-only checks are
insufficient.

- [ ] Open and close a Select from the text Script panel; type to filter, move with arrows, press
  Enter/Escape, and verify the input ref, active row, popup placement, and selected value.
- [ ] Exercise Select in settings, graph expansion settings, link dialog, log selection, MCP
  inspector, and Mneme mode selection, including disabled/read-only and empty/loading states.
- [ ] Open the REST-client key Autocomplete; type a key prefix, move the active suggestion, choose
  one, replace the request/row, and verify headers/form-urlencoded rows still update without stale
  callback closures.
- [ ] In the browser URL suggestions surface, type/filter, hover and keyboard-navigate rows, select
  a URL, resize/scroll the popup where applicable, and verify dismissal by outside click and Escape.
- [ ] In the sidebar, open/close/reorder/pin tabs and exercise the folder and built-in-editor lists;
  verify ListBox selection, tooltips, context menus, and active-row scrolling.
- [ ] Exercise file lists, MCP tools, and storybook ListBox states: loading, empty, custom rows,
  checkbox/selection styles, disabled rows, and a dataset large enough to recycle pooled cells.
- [ ] Exercise MultiListBox and MultiSelect stories: search, select one, select all, deselect all,
  filtered select-all/mixed state, read-only rows, resize the dropdown, close/reopen, and verify
  `aria-controls` points to the live list id.
- [ ] Exercise Tree consumers: Explorer categories, trusted boards/tools, notebook categories, REST
  request tree, and Git refs. Expand/collapse, lazy-load, drag/drop, keyboard navigation,
  multi-select, high active-index collapse, and verify `aria-activedescendant` is removed or rewritten.
- [ ] Exercise standalone VirtualGrid consumers: file search, link lists/tiles, log/notebook bodies,
  DataGrid/VirtualFlexGrid, and the VirtualGrid story. Scroll, resize, sticky regions, overlays,
  recycling, and embedded editor/frame content must remain stable.
- [ ] Exercise Popover consumers outside dropdowns: Menu, board toolbar, grid option popups,
  browser preview/download popups, revision picker, PathInput, and DataGrid story. Verify edge
  flipping, anchor width, resize handle, direct-child layout, outside-click ignore selectors, and
  Escape dismissal.
- [ ] Exercise direct ListItem consumers in link-editor lists, pinned links, sidebar folder rows,
  and the story. Verify icons, native slots, search highlighting, selection/drop styling, tooltips,
  drag events, and row reuse.
- [ ] Typecheck, lint, and production-build the application. Do not add unit tests or a harness for
  this task. Record any unwalked manual item here before task close.

## Acceptance Criteria

- [ ] The verified relay map above is implemented in the two recommended slices, with no claim that
  the absent PopoverFloating-to-content update edge exists.
- [ ] Forwarding-only/configuration edges retain child identity and use targeted live-data updates;
  content factories, branch ownership, and pooled-row ownership remain unchanged.
- [ ] `ListItemView.update()` remains for row repointing; no fresh DOM or slot ownership scheme is
  introduced for recycled cells.
- [ ] `ListBoxView.repaintGate` and `TreeView.repaintGate` remain unless a later source proof shows
  a specific one dead; `createDepsGate` itself is not deleted. Any actual removal must be named here
  with its dead input path and verification.
- [ ] Select, MultiSelect, MultiListBox, Autocomplete, Popover, ListBox, and VirtualGrid consumers
  preserve live filtering, selection, active scrolling, positioning, resize, slots, callbacks, and
  accessibility attributes.
- [ ] TextChrome, both KeyValue paths, and RawBody’s targeted value/language path are handled in the
  US-1203B boundary; GridBody’s `onModel` remains for US-1204.
- [ ] No changes are made to `VanillaView.update()`, `memo()`, `ElementRef`/`bindRef`/`onModel`/
  `*CallerRef`, R4/R5/R8 sites, or selector allocation rules. No deferral, invariant throw, test,
  test harness, or commit is added.
- [ ] Manual verification covers real application consumers, not only isolated component stories.

### Files that need no changes in this task

| File / area | Reason |
|---|---|
| `src/renderer/uikit/shared/vanilla-view.ts` | The equality-gate proposal is explicitly rejected; the update contract stays visible. |
| `src/renderer/core/state/state.ts` | Copy-on-write dispatch and comparison semantics are evidence, not a change target. |
| `src/renderer/uikit/shared/deps-gate.ts` | The factory must survive; no dead gate was found in the affected scope. |
| `src/renderer/uikit/Tree/TreeView.ts` and `Tree/TreeModel.ts` | Tree’s gate/state render-pass contract is genuine and outside the seven-hop relay. |
| `src/renderer/uikit/ListBox/ListItemView.ts` | Its row update is required for pooled-cell repointing; preserve it. |
| `src/renderer/uikit/VirtualGrid/VirtualGridModel.ts` | Reuse the existing plain-field option/update APIs; do not add a state primitive or DOM work to the model. |
| `src/renderer/editors/grid/index.ts` | `GridBodyView.onModel` is owned by US-1204. |
| `src/renderer/editors/shared/MonacoEditorHostView.ts` | Raw-body conversion uses existing `setValue`/language operations; its timer is R8/Epic C. |
| `src/renderer/editors/draw/**` | No affected UIKit relay or listed deferred path. |
| `src/renderer/core/state/ComponentQueue.ts` | Queue drains are unrelated to this UIKit props relay. |

## Files Changed summary

| File | Planned change |
|---|---|
| `src/renderer/uikit/ListBox/ListBoxView.ts` | Retain the grid and split stable engine configuration, targeted layout updates, and gated row-data repaint. |
| `src/renderer/uikit/VirtualGrid/VirtualGridView.ts` | Add the narrow `setLayout()` operation used by `ListBoxView`; it applies layout styles and changed engine geometry without moving DOM work into the model. |
| `src/renderer/uikit/MultiListBox/MultiListBoxView.ts` | Configure the ListBox once and target live filtered/selection/active/search/sizing fields. |
| `src/renderer/uikit/Select/SelectView.ts` | Apply the retained ListBox/content contract to the single-select dropdown. |
| `src/renderer/uikit/MultiSelect/MultiSelectView.ts` | Apply the retained MultiListBox/content contract while preserving resize and branch ownership. |
| `src/renderer/uikit/Autocomplete/AutocompleteView.ts` | Remove the pure nested list props relay while preserving header/action slots and adopted popover host. |
| `src/renderer/uikit/Popover/PopoverView.ts` | Split shell configuration from content ownership and retain floating branch identity. |
| `src/renderer/editors/base/TextChromeView.ts` | US-1203B: remove only the settled shared-toolbar live model relay; retain structural slots. |
| `src/renderer/editors/base/PageToolbarView.ts` | US-1203B: settle the PageToolbar/EditorToolbar child configuration boundary; leave ref channels to US-1204. |
| `src/renderer/editors/rest-client/RequestBuilderView.ts` | US-1203B: stabilize KeyValue callbacks/items and preserve RawBody targeted value/language updates. |
| `doc/active-work.md` | Link the open US-1203 dashboard entry to this document. |
| `doc/tasks/US-1203-uikit-drill/README.md` | Verified investigation, scope split, implementation contract, risks, and manual checklist. |

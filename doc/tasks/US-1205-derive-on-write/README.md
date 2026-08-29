# US-1205 — Derive-on-write: retire the 20 `memo()` sites, then delete `memo`/`IMemo`

## Goal

Replace every UIKit model `memo()` computation with an explicitly maintained plain field. Each
setter that changes an input must derive its dependent fields synchronously, before the state
dispatch reaches a view, so consumers no longer read lazy `.value` wrappers. After every consumer
is converted, delete `IMemo` and `memo()` from `TComponentModel`; retain `depsChanged`, `DepsGate`,
and both live repaint gates.

This is a planning document. No implementation, tests, test harnesses, or commit belongs in this
phase.

## Background

EPIC-075 deliberately left `memo()` in place because these computations were coupled to the props
pump: a memo exists because a parent re-pushes props, and converting it before the pump stops
moving would require writing the invalidation twice ([`EPIC-075.md:70-82`](../../epics/EPIC-075.md#what-this-epic-deliberately-leaves-behind)).
The pump work is now in place for this lane, including the retained-child setters from US-1203A/B
and the ref cleanup from US-1204. EPIC-076 therefore makes US-1205 the eighth implemented task and
requires it to follow those changes for the affected models ([`EPIC-076.md:249-267`](../../epics/EPIC-076.md#us-1205--derive-on-write)).

R10.4 is the governing convention: a setter that changes an input derives dependent fields
synchronously before dispatch; laziness is allowed only where it is genuinely needed, using a
small explicitly invalidated `cached(fn)` ([`model-view-pattern.md:349-469`](../../standards/model-view-pattern.md#the-props-pump-convention),
[`de-react-refactoring.md:211-226`](../../de-react-refactoring.md#r10-vanilla-world-patterns-worth-adopting)).
The props-pump section also prohibits reading `this.state` or a lazy memo from inside an Immer
producer: compute from explicit next values, then assign the result before listeners run
([`uikit/CLAUDE.md:494-509`](../../../src/renderer/uikit/CLAUDE.md#the-props-pump-convention)).

`TOneState.update()` is synchronous: it produces the next state and then calls listeners
([`state.ts:52-68`](../../../src/renderer/core/state/state.ts#L52-L68)). The implementation must
therefore preserve the following ordering:

```text
input setter → compute all affected derived fields in dependency order
             → one state write, if state is involved
             → state/view listeners observe the new plain fields
```

The base driver assigns `this.props` before invoking the model's `setProps`
([`model.ts:125-128`](../../../src/renderer/core/state/model.ts#L125-L128)); new prop-derived
setters must use that already-current prop object and identity guards where needed. The initial
prop pump happens in the driver constructor ([`model.ts:187-200`](../../../src/renderer/core/state/model.ts#L187-L200)),
so every new `setProps` must also establish valid derived fields before the first mount.

### Re-measured census

Measured against the current working tree on 2026-08-29 with the requested instrument:

```text
grep -rn "this\.memo" src/renderer
```

It returns **20** implementation hits, all in eight UIKit models. The current distribution is:

| Model | Current hits | Source lines |
|---|---:|---|
| `MultiListBoxModel` | 6 | [`MultiListBoxModel.ts:63-139`](../../../src/renderer/uikit/MultiListBox/MultiListBoxModel.ts#L63-L139) |
| `SelectModel` | 3 | [`SelectModel.ts:256-318`](../../../src/renderer/uikit/Select/SelectModel.ts#L256-L318) |
| `TreeModel` | 3 | [`TreeModel.ts:175-249`](../../../src/renderer/uikit/Tree/TreeModel.ts#L175-L249) |
| `AutocompleteModel` | 2 | [`AutocompleteModel.ts:161-192`](../../../src/renderer/uikit/Autocomplete/AutocompleteModel.ts#L161-L192) |
| `ListBoxModel` | 2 | [`ListBoxModel.ts:123-144`](../../../src/renderer/uikit/ListBox/ListBoxModel.ts#L123-L144) |
| `MenuModel` | 2 | [`MenuModel.ts:125-160`](../../../src/renderer/uikit/Menu/MenuModel.ts#L125-L160) |
| `MultiSelectModel` | 1 | [`MultiSelectModel.ts:125-134`](../../../src/renderer/uikit/MultiSelect/MultiSelectModel.ts#L125-L134) |
| `PopoverModel` | 1 | [`PopoverModel.ts:114-128`](../../../src/renderer/uikit/Popover/PopoverModel.ts#L114-L128) |
| **Total** | **20** | **8 model files** |

The only `this.memo` census hits are the rows above. The base declaration is separate: `IMemo` is
at [`model.ts:17-22`](../../../src/renderer/core/state/model.ts#L17-L22), and `memo()` is at
[`model.ts:102-123`](../../../src/renderer/core/state/model.ts#L102-L123). There is no `cached(fn)`
helper in the source tree; the only current `cached` matches are local cache variables and
unrelated caches, not a reusable helper ([`EPIC-076.md:255-263`](../../epics/EPIC-076.md#us-1205--derive-on-write)).

Two source facts affect the plan:

1. `ListBoxView` and `TreeView` still have genuine `DepsGate` consumers
   ([`ListBoxView.ts:201-204`](../../../src/renderer/uikit/ListBox/ListBoxView.ts#L201-L204),
   [`TreeView.ts:191-204`](../../../src/renderer/uikit/Tree/TreeView.ts#L191-L204)). The gate
   population is not removed by this task, and `depsChanged` remains shared by
   [`deps-gate.ts:1-36`](../../../src/renderer/uikit/shared/deps-gate.ts#L1-L36).
2. The current `ListBoxModel` explicitly relies on the memoized predicate identity to carry
   caller-owned selection through its signature ([`ListBoxModel.ts:305-323`](../../../src/renderer/uikit/ListBox/ListBoxModel.ts#L305-L323)).
   A stable method alone would stop row repainting. The conversion must carry the changing
   `selectedKeys` Set as an explicit selection signal to `ListBoxModel`; a synthetic revision
   counter is not acceptable because it is only a proxy for the existing derived output.

## Per-memo inventory and dependency order

“Recompute setter” means the setter must leave the field current before its notification/consumer
can observe the write. A prop setter is called after the base model has assigned `this.props`; a
state setter must calculate from explicit next values or draft values without reading stale
`this.state.get()` inside the producer. “Order” is local to the model and starts at 1.

| # | Site | Computes | Inputs | Setters / write paths that must recompute it | Order |
|---:|---|---|---|---|---:|
| 1 | `MultiListBoxModel.ts:63-66` | `resolvedItems`: trait-resolved rows, source array, and `extractValue` | `props.items` | New identity-guarded `setProps`; it is the root of the MultiListBox chain | 1 |
| 2 | `MultiListBoxModel.ts:68-71` | `selectedKeys`: selected source values converted to a key `Set` | `props.value`, `resolvedItems` | `setProps`, after row resolution | 2 |
| 3 | `MultiListBoxModel.ts:73-89` | `filtered`: matching source rows and display rows | `resolvedItems`, `state.searchText`, `props.filterMode` | `setProps` when items/filter mode changes; `setSearchText` | 3 |
| 4 | `MultiListBoxModel.ts:91-99` | `listBoxItems`: filtered sources, retaining traits when the input is traited | `props.items`, `filtered.sources` | `setProps`; `setSearchText` after `filtered` | 4 |
| 5 | `MultiListBoxModel.ts:101-104` | `visibleSelectedCount` | `filtered.items`, `selectedKeys` | `setProps`; `setSearchText` after filtering | 5 |
| 6 | `MultiListBoxModel.ts:132-139` | Current selected-row predicate | `selectedKeys`, `resolvedItems.extractValue` | `setProps` must update the backing fields but must not replace this function identity | 6 / stable |
| 7 | `SelectModel.ts:256-262` | `selectedResolved`: selected source converted to an `IListBoxItem` | `props.value` | `setProps` when value changes; before `displayText` and `seedIndex` can read it | 1 |
| 8 | `SelectModel.ts:266-296` | `filtered`: loaded rows and parallel source rows matching the active query | `loadedItems`, `loadedSources`, `state.open`, `state.searchText`, `props.filterMode`, `props.filter` | `setProps` for filter inputs; open/search setters; `resetItemsCache`/`commitLoaded` for loaded arrays | 2 |
| 9 | `SelectModel.ts:309-318` | `displayText`: query while open, selected label while closed | `state.open`, `state.searchText`, `selectedResolved` | `setProps` for value; every open/search/close write, after rows 7–8 as relevant | 3 |
| 10 | `TreeModel.ts:175-229` | Flat visible `rows` projection | `props.items`, `getChildren`, `getHasChildren`, default expansion props, `state.expanded`, `state.revision` | New `setProps` for row inputs; expansion/reveal/load-success writes, not drag-only writes | 1 |
| 11 | `TreeModel.ts:232-239` | `indexByValue` lookup for visible rows | `rows` | Immediately after every rows derivation | 2 |
| 12 | `TreeModel.ts:242-249` | `selectedKey` normalized from the selection value | `props.value`, `props.items` / item trait accessor | New `setProps` when value or items changes | 3 (independent of 1–2) |
| 13 | `AutocompleteModel.ts:161-164` | `resolved`: normalized suggestions and commit strings | `props.items` | New identity-guarded `setProps` when items changes | 1 |
| 14 | `AutocompleteModel.ts:168-192` | `filtered`: suggestions and matching commit strings | `resolved`, `props.value`, `filterMode`, `filter` | `setProps` when any listed prop changes; state writes do not affect it | 2 |
| 15 | `ListBoxModel.ts:123-134` | `resolved`: native row records plus parallel source rows | `liveItems` | Existing `setProps` and `setItems`, with identity checks before deriving | 1 |
| 16 | `ListBoxModel.ts:137-144` | `selectedKey`: normalized selected key | `liveValue` | Existing `setProps` and `setValue`, with identity checks | 2 |
| 17 | `MenuModel.ts:125-128` | `hasAnyIcon` | `props.items` | Existing `setProps` when items identity changes | 1 |
| 18 | `MenuModel.ts:132-160` | `prepared`: filtered menu rows with transferred group markers | `props.items`, `state.search` | Existing `setProps` for items/open reset; `onSearchChange` when search changes | 2 |
| 19 | `MultiSelectModel.ts:125-134` | `displayText`: formatted selection or `(n) selected` | `props.value`, `props.formatSelection` | New `setProps` when either input changes | 1 |
| 20 | `PopoverModel.ts:114-128` | `placeRef`: anchor element, or a virtual point reference | `props.elementRef`, `props.x`, `props.y` | New `setProps` on those prop changes, including `PopoverView.setAnchor()` / shell updates | 1 |

### The `MultiListBoxModel` chain, explicitly unwound

The existing six-layer lazy chain is [`MultiListBoxModel.ts:63-139`](../../../src/renderer/uikit/MultiListBox/MultiListBoxModel.ts#L63-L139):

```text
props.items
  └─(1) resolvedItems = resolveItems(items)
       ├─(2) selectedKeys = new Set(value.map(resolvedItems.extractValue))
       └─(3) filtered = filter(resolvedItems, searchText, filterMode)
             └─(4) listBoxItems = filtered.sources, wrapped with original traits when needed
                  └─(5) visibleSelectedCount = count(filtered.items ∩ selectedKeys)

(2) + (1) ──(6) isSelected = one stable bound method reading current fields
```

The implementation must derive rows 1–5 in exactly that order. `allVisibleSelected` and
`someVisibleSelected` may remain synchronous accessors over rows 3 and 5
([`MultiListBoxModel.ts:106-113`](../../../src/renderer/uikit/MultiListBox/MultiListBoxModel.ts#L106-L113));
they must not reintroduce a lazy wrapper or repeat the collection walk.

The predicate change needs a corresponding leaf signal. `MultiListBoxView.syncChildren()` currently
passes `this.model.isSelected.value` and then finishes with `list.setActiveIndex()`
([`MultiListBoxView.ts:223-264`](../../../src/renderer/uikit/MultiListBox/MultiListBoxView.ts#L223-L264)).
The plan is to pass the stable `this.model.isSelected` method plus the changing `selectedKeys` Set
to a narrowly extended `ListBoxView.setSelection()`/`ListBoxModel` live field. The Set identity is
already the real output of the selection derivation; including it in `ListBoxModel.repaintSignature()`
lets the existing gate repaint when selection moves without treating a newly allocated closure as
the signal. Preserve the final active-index operation so a row-set change and highlight change still
choose the correct scroll path.

Before and after shape for the model (illustrative plan snippets, not implementation in this phase):

```ts
// Before: lazy dependency array and a new closure when selectedKeys changes.
isSelected = this.memo<(source: T) => boolean>(
    () => {
        const keys = this.selectedKeys.value;
        const { extractValue } = this.resolvedItems.value;
        return (source) => keys.has(extractValue(source));
    },
    () => [this.selectedKeys.value, this.resolvedItems.value],
);

// After: plain fields are derived by setters; the bound method identity is stable.
isSelected = this.isSelectedForSource.bind(this);

private isSelectedForSource(source: T): boolean {
    return this.selectedKeys.has(this.resolvedItems.extractValue(source));
}
```

The view/model selection signal is deliberately separate from the method identity:

```ts
// Before
list.setSelection(this.model.isSelected.value);

// After: method identity stays stable; selectedKeys carries the real changed output.
list.setSelection(this.model.isSelected, this.model.selectedKeys);
```

## Implementation plan

1. **Convert `MultiListBoxModel` first.** Add a prop setter with input identity tracking; derive
   `resolvedItems`, `selectedKeys`, `filtered`, `listBoxItems`, and `visibleSelectedCount` in the
   documented order. Keep `setActiveIndex` state-only. Make `isSelected` a stable bound field that
   reads current plain fields. Do not read a lazy value or stale state from inside an Immer
   producer. Preserve `toggle()` and `toggleSelectAll()` as callback-producing operations; the
   parent prop pump remains the source of the new `value`.
2. **Carry selection changes through the existing ListBox gate.** Extend the targeted selection
   operation with an optional real selection signal and store it in `ListBoxModel`; include that
   signal in the existing repaint signature. Update the MultiListBox initial and sync paths to pass
   the stable predicate and `selectedKeys`. Keep direct ListBox callers working when no separate
   signal is supplied. Do not use a revision counter, remove `repaintGate`, or alter pooled row
   re-pointing.
3. **Convert `ListBoxModel`.** Replace `resolved` and `selectedKey` with plain fields. Make
   `setProps`, `setItems`, and `setValue` identity-aware and derive in order. Update
   `ListBoxView`'s arm logic, cell renderer, signature, and targeted APIs to read plain fields; do
   not change `setActiveIndex`'s final `repaintRows()` plus scroll decision
   ([`ListBoxView.ts:120-153`](../../../src/renderer/uikit/ListBox/ListBoxView.ts#L120-L153)).
4. **Convert `SelectModel`.** Establish `selectedResolved` before any `seedIndex` or display
   computation. Derive `filtered` from explicit loaded arrays/query/open values before the one
   state write that publishes them; derive `displayText` after its inputs. Preserve
   `commitLoaded()`'s atomic loaded-items/active-index write
   ([`SelectModel.ts:604-630`](../../../src/renderer/uikit/Select/SelectModel.ts#L604-L630)),
   `resetItemsCache()`'s sync/async behavior, and the existing loader token. Update `SelectView`
   to read plain fields while keeping filtered rows and active index in one final ListBox
   consequence ([`SelectView.ts:202-224`](../../../src/renderer/uikit/Select/SelectView.ts#L202-L224)).
5. **Convert `AutocompleteModel` and `MultiSelectModel`.** Add prop setters that derive only when
   their controlled inputs move. Update `AutocompleteView`'s content sync
   ([`AutocompleteView.ts:300-318`](../../../src/renderer/uikit/Autocomplete/AutocompleteView.ts#L300-L318))
   and `MultiSelectView`'s trigger sync ([`MultiSelectView.ts:182-220`](../../../src/renderer/uikit/MultiSelect/MultiSelectView.ts#L182-L220))
   to use plain fields. Do not alter adopted popover-host ownership or the remaining input access
   contract from US-1204.
6. **Convert `TreeModel` in dependency order.** Add a prop setter for rows and selected-key
   inputs. Replace the lazy rows/index/selection chain with pure derivation helpers accepting
   explicit next values. Expansion/revision writes from `runLoadAndExpand`, `toggleAt`,
   `expandAll`, `collapseAll`, and `expandAncestorsThenScroll` must derive `rows`, then
   `indexByValue`, before the synchronous `mutate()` consequence. Drag-only writes from
   `TreeDndModel` change `dragOverValue`/`draggingValue` and must not walk the full tree. Preserve
   the single Tree state-write funnel, `onStateApplied`, `aria-activedescendant`, lazy loading,
   and after-paint scrolling ([`TreeModel.ts:89-105`](../../../src/renderer/uikit/Tree/TreeModel.ts#L89-L105),
   [`TreeView.ts:281-304`](../../../src/renderer/uikit/Tree/TreeView.ts#L281-L304)).
7. **Convert `MenuModel`, then `PopoverModel`.** For Menu, derive `hasAnyIcon` and `prepared`
   from the explicit next props/search values before state listeners run; only search changes need
   the full prepared projection. Preserve the reset/open state machine and submenu timer
   ([`MenuModel.ts:88-117`](../../../src/renderer/uikit/Menu/MenuModel.ts#L88-L117)). For Popover,
   derive `placeRef` in `setProps` before `PopoverView` compares it and restarts positioning
   ([`PopoverView.ts:352-399`](../../../src/renderer/uikit/Popover/PopoverView.ts#L352-L399)).
8. **Remove the API.** After all model and view reads have moved from `.value`, delete `IMemo` and
   `TComponentModel.memo()` from [`model.ts:17-22,102-123`](../../../src/renderer/core/state/model.ts#L17-L123).
   Keep `depsChanged` untouched because `deps-gate.ts` deliberately imports it. Sweep comments and
   docs in the affected source files that still describe these values as memoized, but do not
   broaden the sweep into R4/R5/R8 or unrelated cache terminology.
9. **Run the source and behavior checks listed below.** Typecheck, lint, and production build are
   implementation verification only; no test file or test harness is to be added.

## Cost assessment and `cached(fn)` decision

The expensive operations were measured by reading their actual loops, not inferred from the word
“memo”:

| Derivation | Cost shape | Relevant setter frequency / consumer | Decision |
|---|---|---|---|
| MultiListBox `filtered`, `visibleSelectedCount` | O(items), with filtering plus a selected-count pass | Search writes call `syncChildren()` immediately; selection changes also need the new list signal ([`MultiListBoxModel.ts:73-104`](../../../src/renderer/uikit/MultiListBox/MultiListBoxModel.ts#L73-L104), [`MultiListBoxView.ts:173-184`](../../../src/renderer/uikit/MultiListBox/MultiListBoxView.ts#L173-L184)) | Eager on search/selection input; no duplicate work on active-index-only writes |
| Select `filtered` | O(loaded items) | `syncList()` reads filtered rows immediately after state/prop changes ([`SelectView.ts:202-224`](../../../src/renderer/uikit/Select/SelectView.ts#L202-L224)) | Eager on query/filter/load/open inputs |
| Autocomplete `filtered` | O(suggestions) | Content sync reads it immediately; controlled value changes are the intended input ([`AutocompleteView.ts:300-318`](../../../src/renderer/uikit/Autocomplete/AutocompleteView.ts#L300-L318)) | Eager; no state setter depends on it |
| Tree `rows` + `indexByValue` | O(all source nodes) plus O(visible rows) | Full projection is costly, but expansion/item changes immediately need row count/index; drag-only state writes do not affect either field ([`TreeModel.ts:175-239`](../../../src/renderer/uikit/Tree/TreeModel.ts#L175-L239), [`TreeDndModel.ts:100-120`](../../../src/renderer/uikit/Tree/TreeDndModel.ts#L100-L120)) | Eager only on actual row inputs/expansion/revision; explicitly skip drag-only writes |
| Menu `prepared` | O(menu items) | Search binding immediately reconciles `KeyedList`; hover/submenu writes do not change it ([`MenuView.ts:91-127`](../../../src/renderer/uikit/Menu/MenuView.ts#L91-L127)) | Eager on items/search, not hover-only writes |
| ListBox `resolved` | O(items) for trait resolution | `setItems()` is called by retained children, so identity guards are required; arm and grid row count read it ([`ListBoxView.ts:120-123,211-214`](../../../src/renderer/uikit/ListBox/ListBoxView.ts#L120-L123)) | Eager only when `liveItems` identity moves |
| Popover `placeRef` | O(1), with a virtual reference allocation for x/y | Positioning consumes it immediately on shell update ([`PopoverView.ts:107-117`](../../../src/renderer/uikit/Popover/PopoverView.ts#L107-L117)) | Eager |

Eager derive-on-write covers all 20 sites without a genuine laziness requirement. No `cached(fn)`
helper will be added. In particular, Tree's full walk is a real cost, but its current lazy memo is
only avoiding work when no consumer asks for rows; all meaningful row-input setters need the rows
immediately, while drag-only writes can skip it by dependency classification. Adding a helper with
no remaining caller would violate the governing US-1198 rule and would hide invalidation rather than
make it visible ([`EPIC-076.md:255-263`](../../epics/EPIC-076.md#us-1205--derive-on-write)).

## Consumer and risk table

| Model / boundary | Verified consumers | Main risk to verify |
|---|---|---|
| `MultiListBoxModel` / `MultiListBoxView` | MultiSelect dropdown factory and the MultiListBox story ([`MultiSelectView.ts:250-267`](../../../src/renderer/uikit/MultiSelect/MultiSelectView.ts#L250-L267), [`MultiListBox.story.ts:1-80`](../../../src/renderer/uikit/MultiListBox/MultiListBox.story.ts#L1-L80)) | Search filtering, mixed/select-all state, trait wrapping, stable predicate plus explicit selection signal, active-row scroll |
| `MultiSelectModel` / `MultiSelectView` | MultiSelect story and its retained MultiListBox branch ([`MultiSelect.story.ts:39-93`](../../../src/renderer/uikit/MultiSelect/MultiSelect.story.ts#L39-L93), [`MultiSelectView.ts:182-201`](../../../src/renderer/uikit/MultiSelect/MultiSelectView.ts#L182-L201)) | Formatted trigger text, resize/open/close state, selection write-back |
| `ListBoxModel` / `ListBoxView` | Open tabs, built-in editors, file list, browser URL suggestions, MCP tools, and Select/MultiListBox/Autocomplete dropdowns ([`OpenTabsListView.ts:51-56`](../../../src/renderer/ui/sidebar/OpenTabsListView.ts#L51-L56), [`BuiltinEditorsListView.ts:42-106`](../../../src/renderer/ui/sidebar/BuiltinEditorsListView.ts#L42-L106), [`FileListView.ts:29-38`](../../../src/renderer/components/file-list/FileListView.ts#L29-L38), [`UrlSuggestionsDropdown.ts:26-43`](../../../src/renderer/editors/browser/UrlSuggestionsDropdown.ts#L26-L43), [`ToolsPanel.ts:41-41`](../../../src/renderer/editors/mcp-inspector/ToolsPanel.ts#L41-L41)) | A stale plain field affects virtualized rows, empty/loading arms, selection, tooltips, active scrolling, and direct consumers; keep the gate and row repoints |
| `SelectModel` / `SelectView` | Script panel, settings, graph settings, link dialog, log selection, MCP inspector, Mneme mode selection, and story ([`ScriptPanelView.ts:203-205`](../../../src/renderer/editors/text/ScriptPanelView.ts#L203-L205), [`SettingsSections.ts:45-68`](../../../src/renderer/editors/settings/sections/SettingsSections.ts#L45-L68), [`GraphExpansionSettingsView.ts:62-86`](../../../src/renderer/editors/graph/GraphExpansionSettingsView.ts#L62-L86), [`MnemeRootEditorView.ts:260-303`](../../../src/renderer/editors/mneme-root/MnemeRootEditorView.ts#L260-L303)) | Wrong filtered index or display text, async-load stale rows, lost selected label, or split row/highlight scroll consequence |
| `AutocompleteModel` / `AutocompleteView` | REST-client key editor and Autocomplete story ([`KeyValueEditorView.ts:138-177`](../../../src/renderer/editors/rest-client/KeyValueEditorView.ts#L138-L177), [`Autocomplete.story.ts:48-72`](../../../src/renderer/uikit/Autocomplete/Autocomplete.story.ts#L48-L72)) | A stale filtered list commits the wrong key or leaves the empty branch open/closed incorrectly |
| `TreeModel` / `TreeView` | Explorer/provider tree, boards/tools, notebook categories, REST request tree, Git refs, and story ([`TreeProviderViewImpl.ts:167-171`](../../../src/renderer/components/tree-provider/TreeProviderViewImpl.ts#L167-L171), [`BoardsTreeView.ts:81-81`](../../../src/renderer/editors/board/BoardsTreeView.ts#L81-L81), [`NotebookCategoriesSecondaryView.ts:79-79`](../../../src/renderer/editors/notebook/panels/NotebookCategoriesSecondaryView.ts#L79-L79), [`RestRequestTreeView.ts:79-79`](../../../src/renderer/editors/rest-client/panels/RestRequestTreeView.ts#L79-L79), [`GitRefsView.ts:75-75`](../../../src/renderer/editors/git-tree/GitRefsView.ts#L75-L75)) | One-dispatch-stale rows/index causes broken expand/reveal/keyboard behavior; stale selection id, lazy loading, DnD state, or wrong `aria-activedescendant` is silent |
| `MenuModel` / `MenuView` | App popup menus and nested UIKit menu/story paths ([`showPopupMenu.ts:161-187`](../../../src/renderer/ui/dialogs/poppers/showPopupMenu.ts#L161-L187), [`MenuView.ts:261-285`](../../../src/renderer/uikit/Menu/MenuView.ts#L261-L285)) | Search/group transfer, icon-column changes, submenu identity, hover scrolling, and reopen reset |
| `PopoverModel` / `PopoverView` | Select/MultiSelect/Autocomplete/PathInput, Menu, board toolbar, grid option popups, browser previews/downloads, revision picker, and stories ([`PathInputView.ts:164-176`](../../../src/renderer/uikit/PathInput/PathInputView.ts#L164-L176), [`BoardToolbar.ts:218-224`](../../../src/renderer/editors/board/BoardToolbar.ts#L218-L224), [`CsvOptions.ts:174-186`](../../../src/renderer/editors/grid/components/CsvOptions.ts#L174-L186), [`BrowserDownloadsPopup.ts:270-280`](../../../src/renderer/editors/browser/BrowserDownloadsPopup.ts#L270-L280), [`RevisionPickerView.ts:67-75`](../../../src/renderer/editors/file-diff/RevisionPickerView.ts#L67-L75)) | A stale/moved anchor breaks positioning, edge flipping, anchor width, portal branch creation, or outside-click behavior |

### Invariants and forbidden changes

- `MultiListBox.isSelected` remains one stable method identity; `selectedKeys` is the explicit
  changed selection output used by the existing ListBox gate. No fresh-array selector or synthetic
  revision counter is introduced.
- A derived field is current before its state listener or targeted child setter runs. No state or
  memo is read from an Immer producer to calculate a new value; draft guards and explicit next
  values are used instead.
- A row-set change and active-index change remain one logical consequence. Preserve
  `scrollToRowAfterPaint` for content-plus-highlight changes and `scrollToRow` for highlight-only
  changes ([`ListBoxView.ts:420-437`](../../../src/renderer/uikit/ListBox/ListBoxView.ts#L420-L437)).
- `ListBoxView.repaintGate`, `TreeView.repaintGate`, `createDepsGate`, and `depsChanged` remain.
- `ListItemView.update()` remains a virtualized row re-point; no pooled row is made permanent
  configuration ([`ListBoxView.ts:351-370`](../../../src/renderer/uikit/ListBox/ListBoxView.ts#L351-L370)).
- `VanillaView.update()` gets no equality gate; no `queueMicrotask` or `setTimeout(0)` is added;
  `applyRestProps` timing is left to US-1206; no R4/R5/R8 work is pulled in.
- No new `throw` guard is added. The seven US-1202 identity guards remain the existing total for
  that class of invariant; lifecycle assumptions are documented here instead.
- Models do not touch the DOM, `NativeHTMLAttributes` is not narrowed, and no unit test or test
  harness is added.

## Manual verification checklist

Walk real surfaces after implementation; isolated stories supplement but do not replace these
checks. Record any unwalked item before task close.

- [ ] MultiSelect/MultiListBox: open and close; search a large list; select one row; select all;
  deselect all; filter to a mixed visible selection; verify every checkbox and the header's
  `true`/`mixed`/`false` state; resize and reopen the dropdown; verify active-row scrolling.
- [ ] Select in the text Script panel: open, type mid-string, filter, arrow/Page/Home/End, select,
  Escape, and verify the trigger label, input caret behavior, selected row, and popup placement.
- [ ] Select in Settings, graph expansion settings, link dialog, log selection, MCP inspector, and
  Mneme mode selection: exercise disabled/read-only, empty, synchronous, and asynchronous loading
  paths where the surface exposes them.
- [ ] REST-client Autocomplete: type a key prefix, keyboard-navigate, commit a suggestion, edit a
  request row, and confirm the committed key and subsequent row updates are current.
- [ ] ListBox direct consumers: open/close/reorder/pin tabs; exercise built-in-editor, file,
  browser URL-suggestion, and MCP-tool lists; verify selection, tooltips, context menus, loading,
  empty states, keyboard movement, and a dataset large enough to recycle pooled rows.
- [ ] Tree: expand/collapse Explorer/provider, boards/tools, notebook categories, REST request, and
  Git refs trees; test lazy-load, reveal, expand-all/collapse-all, keyboard navigation, DnD,
  multi-select, and a high active index collapsing out of range. Verify `aria-activedescendant` is
  removed or rewritten and expansion is not one dispatch stale.
- [ ] Menu: open a long menu, search, activate a leaf, hover/open/close a submenu, reopen the menu,
  and verify group separators, icon columns, hover scrolling, Escape, and outside-click dismissal.
- [ ] Popover consumers: exercise PathInput, board toolbar, CSV/column options, browser preview and
  downloads, revision picker, and DataGrid/Popover stories. Check anchors near viewport edges,
  anchor-width matching, resize, direct-child layout, ignored outside clicks, and Escape.
- [ ] Run `npm run typecheck`, `npm run lint`, and `npm run build-prod`; re-run
  `grep -rn "this\.memo" src/renderer` and confirm zero hits, `memo`/`IMemo` are absent from
  `TComponentModel`, and `depsChanged` plus both repaint gates remain.

## Concerns

- The current `MultiListBox` predicate changes identity when its selected-key set changes, and
  `ListBoxModel.repaintSignature` currently uses that identity. Replacing it with a stable method
  without carrying `selectedKeys` as a signal would stop selection repainting; the planned API
  extension is therefore part of the conversion, not an optional cleanup
  ([`ListBoxModel.ts:305-323`](../../../src/renderer/uikit/ListBox/ListBoxModel.ts#L305-L323),
  [`MultiListBoxView.ts:223-264`](../../../src/renderer/uikit/MultiListBox/MultiListBoxView.ts#L223-L264)).
- `TreeModel.rows` is a full source-tree walk. Derive it eagerly for row-affecting writes, but
  classify drag-only writes separately so DnD does not pay that cost
  ([`TreeModel.ts:175-229`](../../../src/renderer/uikit/Tree/TreeModel.ts#L175-L229),
  [`TreeDndModel.ts:100-120`](../../../src/renderer/uikit/Tree/TreeDndModel.ts#L100-L120)).
- Async Select loading and Tree expansion must preserve one logical state write and derive from
  explicit next values; otherwise a view can observe a one-dispatch-stale projection
  ([`SelectModel.ts:604-630`](../../../src/renderer/uikit/Select/SelectModel.ts#L604-L630),
  [`TreeModel.ts:467-535`](../../../src/renderer/uikit/Tree/TreeModel.ts#L467-L535)).
- No unresolved laziness case was found. The task adds no `cached(fn)` helper because the only
  genuinely large derivation (Tree rows) has identifiable unrelated writes that can skip it, while
  the other projections are immediately consumed by their setters or repaint paths.

## Acceptance Criteria

- [ ] The current 20-site census is implemented and the final source census returns zero
  `this.memo` hits in `src/renderer`.
- [ ] All 20 outputs are plain fields/accessors with the setter and dependency order recorded in
  the inventory; no view or model reads `.value` from a former memo.
- [ ] `MultiListBoxModel` is unwound in dependency order and its selection predicate is a stable
  bound method with `selectedKeys` as the real ListBox repaint signal.
- [ ] Every relevant prop/state setter derives before dispatch, with no state/memo read from an
  Immer producer and no split logical state writes.
- [ ] `TreeModel` avoids full-tree derivation for drag-only writes while keeping rows/index current
  for expansion, revision, and prop/item changes; lazy load, DnD, reveal, and scroll behavior stay
  intact.
- [ ] No `cached(fn)` helper is added; the task record names the decision and verifies that every
  expensive derivation is either immediately consumed or skipped on unrelated setters.
- [ ] `IMemo` and `memo()` are deleted from `TComponentModel`; `depsChanged`, `createDepsGate`, both
  `DepsGate` consumers, and virtualized row re-points remain.
- [ ] No new throw guards, tests, test harnesses, `VanillaView.update()` equality gate, deferrals,
  `applyRestProps` timing change, `NativeHTMLAttributes` narrowing, or R4/R5/R8 fix is included.
- [ ] The manual checklist is walked against real surfaces and all unverified paths are recorded.
- [ ] The EPIC-076 dashboard entry links this task and remains unchecked because this is an epic
  task ([`active-work.md:35`](../../active-work.md#active)).

## Files that need no changes in this task

| File / area | Reason |
|---|---|
| `src/renderer/uikit/shared/deps-gate.ts` | `depsChanged` is deliberately retained and both gates still guard genuine repaint work. |
| `src/renderer/uikit/VirtualGrid/VirtualGridModel.ts` | The bounded plain-field paint engine is unrelated; do not generalize its exemption or alter geometry. |
| `src/renderer/uikit/shared/vanilla-view.ts` | The rejected `update()` equality gate and lifecycle contract are unchanged. |
| `src/renderer/core/state/state.ts` | Synchronous Immer/copy-on-write behavior is the ordering evidence, not a change target. |
| `src/renderer/uikit/shared/fill-slot.ts`, `keyed-list.ts`, `subtree-swap.ts` | Slot ownership and structural reconciliation are unrelated to memo retirement. |
| `src/renderer/uikit/shared/dom-props.ts` | `applyRestProps` and `NativeHTMLAttributes` belong to US-1206 / Epic C. |
| `src/renderer/uikit/Tree/TreeDndModel.ts` | Its drag-only state writes stay as the narrow `mutateState` consumer; no full-tree derivation is needed there. |
| `src/renderer/editors/draw/**` | No affected UIKit memo or listed consumer. |

## Files Changed summary

| File / area | Planned change |
|---|---|
| `src/renderer/uikit/MultiListBox/MultiListBoxModel.ts` | Replace six lazy memos with ordered plain derivation and a stable selection method. |
| `src/renderer/uikit/MultiListBox/MultiListBoxView.ts` | Read plain fields and pass the real selection-set signal to ListBox. |
| `src/renderer/uikit/ListBox/ListBoxModel.ts` / `ListBoxView.ts` | Replace two memos, carry the optional selection signal, and preserve the existing repaint gate/row repoint. |
| `src/renderer/uikit/Select/SelectModel.ts` / `SelectView.ts` | Replace three memos and update dropdown consumers to plain fields while preserving atomic loading/highlight writes. |
| `src/renderer/uikit/Autocomplete/AutocompleteModel.ts` / `AutocompleteView.ts` | Replace two memos and update the retained content sync. |
| `src/renderer/uikit/MultiSelect/MultiSelectModel.ts` / `MultiSelectView.ts` | Replace `displayText` and update the trigger consumer. |
| `src/renderer/uikit/Tree/TreeModel.ts` / `TreeView.ts` / `TreeKeyboardHandler.ts` | Replace rows/index/selected-key memos, update plain-field consumers, and preserve the Tree state funnel and gate. |
| `src/renderer/uikit/Menu/MenuModel.ts` / `MenuView.ts` | Replace icon/prepared memos and update keyed menu consumers. |
| `src/renderer/uikit/Popover/PopoverModel.ts` / `PopoverView.ts` | Replace `placeRef` and keep positioning comparisons on the eager field. |
| `src/renderer/core/state/model.ts` | Delete `IMemo` and `TComponentModel.memo()`; retain `depsChanged`. |
| `doc/active-work.md` | Link unchecked US-1205 under EPIC-076. |
| `doc/tasks/US-1205-derive-on-write/README.md` | Record verified census, dependency inventory, cost/cached decision, risks, and manual checks. |

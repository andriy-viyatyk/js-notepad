# US-1203B — Compound dropdowns and the deferred editor edges

## Goal

Complete the second implementation slice of EPIC-076’s US-1203 drill: retain compound dropdown
branches while targeting their live list and shell inputs, then remove the deferred editor-side
configuration relays. Preserve caller-owned popover content, structural slots, pooled-row updates,
Monaco value/language behavior, and all application-facing callbacks.

This document is a planning boundary. It records verified source findings and implementation work;
no implementation, tests, test harnesses, or commit belongs to this phase.

## Background

US-1203A has landed the lower-level contract. `ListBoxView` now retains its virtual grid and exposes
targeted `setItems`, `setSelection`, `setActiveIndex`, `setSearchText`, `setEmptyMessage`, and
`setLayout` operations ([`ListBoxView.ts:120-153`](../../../src/renderer/uikit/ListBox/ListBoxView.ts#L120-L153)).
Its normal update still handles direct consumers, and its `repaintGate` still guards the genuine
row repaint path ([`ListBoxView.ts:184-198`](../../../src/renderer/uikit/ListBox/ListBoxView.ts#L184-L198)).
This slice consumes that contract; it does not remove the gate, change `VanillaView.update()`, or
change `memo()`.

The general pump contract is also already fixed: `VanillaView.update()` stores props and invokes
`onUpdate()` after mount without an equality gate ([`vanilla-view.ts:84-97`](../../../src/renderer/uikit/shared/vanilla-view.ts#L84-L97)).
State selectors must not allocate arrays because `compareSelection` compares arrays by identity
([`state.ts:28-40`](../../../src/renderer/core/state/state.ts#L28-L40)); synchronous state dispatch is
copy-on-write and iterates the current listener snapshot ([`state.ts:52-95`](../../../src/renderer/core/state/state.ts#L52-L95)).

The central Popover correction is load-bearing. `PopoverView` creates or updates a floating shell,
while `PopoverFloatingView` creates, claims, and mounts the factory result exactly once per open
branch ([`PopoverView.ts:65-113`](../../../src/renderer/uikit/Popover/PopoverView.ts#L65-L113)). The
floating view does not forward updates to that content. The content factory must attach a detached
child’s root itself, as Select and MultiSelect do ([`SelectView.ts:256-264`](../../../src/renderer/uikit/Select/SelectView.ts#L256-L264),
[`MultiSelectView.ts:235-242`](../../../src/renderer/uikit/MultiSelect/MultiSelectView.ts#L235-L242));
Autocomplete instead adopts the host as its root and therefore does not append it
([`AutocompleteView.ts:293-310`](../../../src/renderer/uikit/Autocomplete/AutocompleteView.ts#L293-L310)).

## Verified findings and relay map

“Minted” below means a new object literal or child-props projection is constructed. “Forwarding
only” means the hop adds no shell, lifecycle, ownership, structural, or model behavior of its own.
Every row was checked against the current source.

| Edge | What is minted, by whom | Trigger | Forwarding-only? Verified finding and target boundary |
|---|---|---|---|
| `PopoverView → PopoverFloatingView` | `PopoverView.syncBranch()` passes the full `PopoverViewProps` to the branch constructor and calls `activeBranch.update(props)` on an existing branch ([`PopoverView.ts:344-377`](../../../src/renderer/uikit/Popover/PopoverView.ts#L344-L377)). `modelProps()` separately creates the model projection without `ref` or `contentView` ([`PopoverView.ts:379-381`](../../../src/renderer/uikit/Popover/PopoverView.ts#L379-L381)). | Initial open-branch creation; every mounted `PopoverView.onUpdate()` while the anchor exists; close clears the branch ([`PopoverView.ts:336-355`](../../../src/renderer/uikit/Popover/PopoverView.ts#L336-L355)). | **No.** The floating view adds fixed overlay DOM, positioning and middleware, outside-click/Escape listeners, shell attributes, resize handling, refs, and model state ([`PopoverView.ts:65-97`](../../../src/renderer/uikit/Popover/PopoverView.ts#L65-L97), [`:144-227`](../../../src/renderer/uikit/Popover/PopoverView.ts#L144-L227), [`:290-301`](../../../src/renderer/uikit/Popover/PopoverView.ts#L290-L301)). Split shell configuration from content ownership and retain the branch reference. |
| `PopoverFloatingView → contentView` | No update object is minted or forwarded. The factory is called in `onMount()`, its result is claimed with `child()`, then mounted ([`PopoverView.ts:87-96`](../../../src/renderer/uikit/Popover/PopoverView.ts#L87-L96)); `onUpdate()` performs shell work only ([`PopoverView.ts:99-113`](../../../src/renderer/uikit/Popover/PopoverView.ts#L99-L113)). | Once per open branch; branch disposal on close. | **No hop exists.** Do not invent a forwarding channel or move ownership out of the caller’s factory. Keep a bare caller reference for targeted pushes; the floating branch owns and disposes the returned view. |
| `SelectView → PopoverView` | `popoverProps()` creates a shell projection containing open, callbacks, anchor, placement, offset, width matching, resize, and the outside-click selector ([`SelectView.ts:243-265`](../../../src/renderer/uikit/Select/SelectView.ts#L243-L265)). | `SelectView.onUpdate()` and one compound state binding both call `syncChildren()`; that method updates the Popover ([`SelectView.ts:122-142`](../../../src/renderer/uikit/Select/SelectView.ts#L122-L142), [`:173-195`](../../../src/renderer/uikit/Select/SelectView.ts#L173-L195)). | **No.** It is a shell/configuration edge. Use Popover shell setters; do not pass list content through it. |
| `SelectView content factory → ListBoxView` | `listProps()` creates a ListBox projection containing filtered items, selected value, active/search state, loading, empty text, and layout ([`SelectView.ts:268-286`](../../../src/renderer/uikit/Select/SelectView.ts#L268-L286)). | Open-branch factory creation; while open, every `syncChildren()` calls `listView.update(listProps())` ([`SelectView.ts:187-194`](../../../src/renderer/uikit/Select/SelectView.ts#L187-L194)). | **Not forwarding-only.** The list is caller-created and branch-owned, but the projection is a live-data relay. Retain the factory seam and target the ListBox’s value, items, loading, active/search, empty, and layout fields. |
| `MultiSelectView → PopoverView` | `popoverProps()` creates shell configuration including open, anchor, placement, match-width, resize, and dismissal ([`MultiSelectView.ts:220-243`](../../../src/renderer/uikit/MultiSelect/MultiSelectView.ts#L220-L243)). | `onUpdate()` and the state binding call `syncChildren()`, which updates the Popover ([`MultiSelectView.ts:114-127`](../../../src/renderer/uikit/MultiSelect/MultiSelectView.ts#L114-L127), [`:153-175`](../../../src/renderer/uikit/MultiSelect/MultiSelectView.ts#L153-L175)). | **No.** Preserve shell behavior and separate it from the list branch. |
| `MultiSelectView content factory → MultiListBoxView` | `listProps()` creates the MultiListBox projection with caller-owned items/value/callback, filtering, select-all, empty text, and resize-dependent sizing ([`MultiSelectView.ts:246-265`](../../../src/renderer/uikit/MultiSelect/MultiSelectView.ts#L246-L265)). | Factory creation on open; every open `syncChildren()` calls `listView.update(listProps())` ([`MultiSelectView.ts:167-174`](../../../src/renderer/uikit/MultiSelect/MultiSelectView.ts#L167-L174)). | **Not forwarding-only.** Keep the factory’s `host.append(list.root)`, retain the branch-owned child reference, and add targeted MultiListBox live/configuration operations. |
| `AutocompleteView → PopoverView` | `popoverProps()` creates shell configuration and a factory for the adopted content view ([`AutocompleteView.ts:293-311`](../../../src/renderer/uikit/Autocomplete/AutocompleteView.ts#L293-L311)). | `onUpdate()` and the `{ open, activeIndex }` state binding call `syncChildren()`, which updates the Popover ([`AutocompleteView.ts:193-223`](../../../src/renderer/uikit/Autocomplete/AutocompleteView.ts#L193-L223), [`:245-264`](../../../src/renderer/uikit/Autocomplete/AutocompleteView.ts#L245-L264)). | **No.** Shell configuration and the adopted content branch are separate concerns. |
| `AutocompleteContentView → ListBoxView` | `contentProps()` mints a wrapper for header, action, and `list`; `listProps()` projects filtered items, active index, handlers, empty text, and layout ([`AutocompleteView.ts:314-340`](../../../src/renderer/uikit/Autocomplete/AutocompleteView.ts#L314-L340)). | Content is created once and mounted on open; every content update runs `sync()`, which updates header slots and the ListBox ([`AutocompleteView.ts:55-104`](../../../src/renderer/uikit/Autocomplete/AutocompleteView.ts#L55-L104)). | **Not forwarding-only.** Retain the adopted host and structural header/action slots; target list fields and slot changes independently. Do not write `dataset.type`, `className`, or `replaceChildren` on the adopted Popover root because the floating shell owns those writes ([`AutocompleteView.ts:42-48`](../../../src/renderer/uikit/Autocomplete/AutocompleteView.ts#L42-L48)). |
| `TextChromeView → PageToolbarView` | `TextChromeView.onUpdate()` creates a fresh PageToolbar props object containing the stable model and structural toolbar slots ([`TextChromeView.ts:298-320`](../../../src/renderer/editors/base/TextChromeView.ts#L298-L320)). | TextChrome prop update with the same model/content host; a model or host change rebuilds the branch ([`TextChromeView.ts:298-307`](../../../src/renderer/editors/base/TextChromeView.ts#L298-L307)). | **Mixed, and the live model relay is unnecessary on the stable branch.** Keep `children`, toolbar-contribution, and right-contribution slot updates through `fillSlot` ([`TextChromeView.ts:420-434`](../../../src/renderer/editors/base/TextChromeView.ts#L420-L434)); replace the toolbar props pump with a targeted slot operation. Branch rebuild remains the model/host boundary. |
| `PageToolbarView → EditorToolbarView` | `toolbarProps()` creates the panel configuration; `onMount()` and `onUpdate()` pass it with the stable content host ([`PageToolbarView.ts:381-400`](../../../src/renderer/editors/base/PageToolbarView.ts#L381-L400), [`:426-433`](../../../src/renderer/editors/base/PageToolbarView.ts#L426-L433), [`:464-470`](../../../src/renderer/editors/base/PageToolbarView.ts#L464-L470)). | Initial mount and every PageToolbar prop update. | **Configuration plus structure, not forwarding-only.** Add targeted toolbar configuration/content operations and retain PageToolbar’s own slots. |
| `PageToolbarView → NavPanelButtonView` and `SwitchWidgetView` | Each `onUpdate()` currently receives a fresh `{ model: props.model }` object ([`PageToolbarView.ts:426-437`](../../../src/renderer/editors/base/PageToolbarView.ts#L426-L437)). | Every PageToolbar prop update. | **Forwarding-only for this edge.** Both children establish their subscriptions and initial DOM in `onMount()` ([`PageToolbarView.ts:94-105`](../../../src/renderer/editors/base/PageToolbarView.ts#L94-L105), [`:228-242`](../../../src/renderer/editors/base/PageToolbarView.ts#L228-L242)). Stop pushing model props after construction; preserve the lifecycle/model identity invariant in this document rather than adding a throw. |
| `HeadersTableView → KeyValueEditorView` | The constructor and `onUpdate()` each create three callback closures plus an items projection ([`RequestBuilderView.ts:253-259`](../../../src/renderer/editors/rest-client/RequestBuilderView.ts#L253-L259)). | Headers branch creation and every headers branch update from `RequestBuilderView.syncHeaders()` ([`RequestBuilderView.ts:221-229`](../../../src/renderer/editors/rest-client/RequestBuilderView.ts#L221-L229)). | **The child is retained, but the update is churn.** Hoist stable handler fields that read current `this.props`; add `KeyValueEditorView.setItems()` so only the collection moves. |
| `FormUrlEncodedView → KeyValueEditorView` | The same items plus three fresh callback closures are created at construction and update ([`RequestBuilderView.ts:303-308`](../../../src/renderer/editors/rest-client/RequestBuilderView.ts#L303-L308)). | Form-urlencoded branch creation and each body-content update ([`RequestBuilderView.ts:287-291`](../../../src/renderer/editors/rest-client/RequestBuilderView.ts#L287-L291)). | **The same retained-child/configuration edge.** Apply the same stable handler and targeted-items contract as headers. |
| `RawBodyView → MonacoEditorHostView` | Construction supplies initial body, language, options, mount callback, and change callback; `onUpdate()` currently sends language/options/change through `host.update()` ([`RequestBuilderView.ts:310-316`](../../../src/renderer/editors/rest-client/RequestBuilderView.ts#L310-L316)). | Raw branch creation and body-content updates; external body text is separately detected by `BodyContentView.valueGate` and sent through `setValue()` ([`RequestBuilderView.ts:277-292`](../../../src/renderer/editors/rest-client/RequestBuilderView.ts#L277-L292)). | **Not a model fan-out.** Add/use a targeted language operation for the host and retain the existing targeted value path. Do not merge language/configuration with body-value synchronization. Preserve the host’s existing `setValue()` semantics ([`MonacoEditorHostView.ts:100-115`](../../../src/renderer/editors/shared/MonacoEditorHostView.ts#L100-L115)) and leave its timer audit for R8/Epic C ([`MonacoEditorHostView.ts:189-193`](../../../src/renderer/editors/shared/MonacoEditorHostView.ts#L189-L193)). |

## Implementation Plan

### Compound dropdowns

1. Extend the retained-child API where the 1203A setters do not cover Select’s live `value` and
   `loading` fields. Add `ListBoxView.setValue()` and `ListBoxView.setLoading()` (and the matching
   plain live fields in `ListBoxModel`), preserving `setItems`, `setSelection`, active/search,
   empty, layout, the existing `repaintGate`, and pooled row repointing. `setItems()` must continue
   to enter/leave real, empty, and loading arms through the existing methods
   ([`ListBoxView.ts:205-243`](../../../src/renderer/uikit/ListBox/ListBoxView.ts#L205-L243)); it must not
   turn a virtualized row update into permanent configuration.
2. In `PopoverView`, expose shell-only targeted operations: `setOpen()`, `setAnchor()`,
   `setPlacement()`, `setOffset()`, and `setSizing({ maxHeight, matchAnchorWidth, resizable, scroll })`.
   Keep dismissal callbacks and the `contentView` factory as construction-time configuration. Route
   these operations through the existing model/branch lifecycle so positioning, middleware,
   outside-click/Escape, resize, ref, and shell attributes continue to follow the same branch.
   `PopoverFloatingView` must retain its `contentView` reference and never call `update()` on it.
3. Convert `SelectView` to retain the Popover child and push shell fields through the targeted
   Popover API. On an open branch, retain the factory-created ListBox and push only
   `setItems`, `setValue`, `setLoading`, `setActiveIndex`, `setSearchText`, `setEmptyMessage`, and
   `setLayout`. Keep stable `onActiveChange`/`onChange` fields and the factory’s explicit append.
   The filtered items and active index must reach one consequence so a changed row set chooses
   `scrollToRowAfterPaint` where required ([`ListBoxView.ts:184-198`](../../../src/renderer/uikit/ListBox/ListBoxView.ts#L184-L198)).
4. Add targeted live/configuration methods to `MultiListBoxView` for its caller-owned `items` and
   `value`, disabled/read-only/filter/search settings, select-all presentation, empty text, and
   layout. Use those methods from `MultiSelectView`; retain the factory-created, branch-owned
   MultiListBox and its explicit host append. Keep the MultiListBox’s single `syncChildren()`
   consequence because its header derives from filtered state and outer selection
   ([`MultiListBoxView.ts:170-211`](../../../src/renderer/uikit/MultiListBox/MultiListBoxView.ts#L170-L211)).
5. In `AutocompleteContentView`, add targeted header-slot and ListBox live-field methods. Keep the
   adopted Popover host, direct-child header/list structure, and `fillSlot` ownership. In
   `AutocompleteView`, target Popover shell fields and then target filtered items, active index,
   empty text, and layout; never start forwarding content props through Popover.
6. Do not alter `ElementRef`, `bindRef`, `*CallerRef`, or `memo()` while making these conversions.
   Select, MultiSelect, and Autocomplete currently contain forwarded-ref channels and identity
   synchronization ([`SelectView.ts:293-318`](../../../src/renderer/uikit/Select/SelectView.ts#L293-L318),
   [`MultiSelectView.ts:272-294`](../../../src/renderer/uikit/MultiSelect/MultiSelectView.ts#L272-L294),
   [`AutocompleteView.ts:347-360`](../../../src/renderer/uikit/Autocomplete/AutocompleteView.ts#L347-L360));
   leave those channels for US-1204.

### Deferred editor edges

7. Add `PageToolbarView.setSlots(children, rightContributions)` and targeted panel configuration /
   content operations on `EditorToolbarView` as needed for `name`, border flags, and its stable
   content host. `TextChromeView` should call the slot operation on its retained PageToolbar rather
   than minting and pushing the full page-toolbar object on ordinary updates. Keep branch rebuilds
   for a changed model or content host, and keep all three structural slot hosts and their
   `fillSlot` updates ([`TextChromeView.ts:351-417`](../../../src/renderer/editors/base/TextChromeView.ts#L351-L417)).
8. Remove the PageToolbar update calls to `NavPanelButtonView` and `SwitchWidgetView`. Their
   construction-time model is stable for the view lifetime; their own subscriptions are installed
   in `onMount()` and must remain the source of live updates. Do not add an invariant throw for a
   model mismatch. Keep `updateSpacer()` as the structural `noSpacer` operation
   ([`PageToolbarView.ts:448-461`](../../../src/renderer/editors/base/PageToolbarView.ts#L448-L461)).
9. Add `KeyValueEditorView.setItems(items)` and make its row projection read the current items
   length without requiring a new callback-bearing props object. In both `HeadersTableView` and
   `FormUrlEncodedView`, hoist update/delete/toggle handlers to stable fields that read current
   `this.props`, configure the child once, and call `setItems()` when the request collection moves.
   Preserve `KeyedList` row identity and row updates ([`KeyValueEditorView.ts:226-257`](../../../src/renderer/editors/rest-client/KeyValueEditorView.ts#L226-L257)).
10. Add a targeted `MonacoEditorHostView.setLanguage()` operation (or the equivalent narrow host
    method) and use it from `RawBodyView.onUpdate()` while keeping construction-time options and
    callbacks stable. Keep `BodyContentView.valueGate` and `MonacoEditorHostView.setValue()` as the
    separate external-body-text path. The existing `RequestBuilderView` model synchronization,
    body measurement gate, and language-branch selection remain intact
    ([`RequestBuilderView.ts:148-182`](../../../src/renderer/editors/rest-client/RequestBuilderView.ts#L148-L182),
    [`:234-242`](../../../src/renderer/editors/rest-client/RequestBuilderView.ts#L234-L242)).

### Invariants and forbidden changes

- `PopoverFloatingView` claims and mounts one factory result per open branch; the caller factory
  attaches a detached child root when required, and the caller does not claim or dispose that child.
  This is verified by [`PopoverView.ts:87-96`](../../../src/renderer/uikit/Popover/PopoverView.ts#L87-L96)
  and the Select/MultiSelect/Autocomplete factories cited above. Record this invariant; do not add
  a new throw guard.
- A retained PageToolbar’s NavPanel and SwitchWidget model identity does not change during its
  lifetime; a model/host change rebuilds TextChrome’s branch. Record this lifecycle invariant; do
  not add a new throw guard.
- Do not add an equality gate to `VanillaView.update()`, allocate arrays in selectors, defer with
  `queueMicrotask` or `setTimeout(0)`, remove either surviving `DepsGate`, change virtualized row
  repointing, touch R4/R5/R8 sites, or change `memo()`.

## Consumer and risk table

| Converted boundary | Verified real consumers | Risk |
|---|---|---|
| `PopoverView` shell | Select/MultiSelect/Autocomplete and PathInput ([`PathInputView.ts:172-176`](../../../src/renderer/uikit/PathInput/PathInputView.ts#L172-L176)); Menu ([`MenuView.ts:316-336`](../../../src/renderer/uikit/Menu/MenuView.ts#L316-L336)); board toolbar ([`BoardToolbar.ts:218-224`](../../../src/renderer/editors/board/BoardToolbar.ts#L218-L224)); CSV/column options ([`CsvOptions.ts:174-186`](../../../src/renderer/editors/grid/components/CsvOptions.ts#L174-L186), [`ColumnsOptions.ts:439-451`](../../../src/renderer/editors/grid/components/ColumnsOptions.ts#L439-L451)); browser URL suggestions/downloads/tab preview ([`UrlSuggestionsDropdown.ts:41-43`](../../../src/renderer/editors/browser/UrlSuggestionsDropdown.ts#L41-L43), [`BrowserDownloadsPopup.ts:270-280`](../../../src/renderer/editors/browser/BrowserDownloadsPopup.ts#L270-L280), [`BrowserTabsPanel.ts:89-96`](../../../src/renderer/editors/browser/BrowserTabsPanel.ts#L89-L96)); revision picker ([`RevisionPickerView.ts:67-75`](../../../src/renderer/editors/file-diff/RevisionPickerView.ts#L67-L75)); DataGrid story ([`DataGrid.story.ts:98-136`](../../../src/renderer/uikit/DataGrid/DataGrid.story.ts#L98-L136)). | Positioning, direct-child layout, portal ownership, dismissal, resize, and anchor-width behavior are cross-cutting; a shell defect can affect unrelated menus and editor popups. |
| `SelectView` | Text Script panel ([`ScriptPanelView.ts:39-46`](../../../src/renderer/editors/text/ScriptPanelView.ts#L39-L46), [`:203-205`](../../../src/renderer/editors/text/ScriptPanelView.ts#L203-L205)); settings (two Select consumers, [`SettingsSections.ts:45-68`](../../../src/renderer/editors/settings/sections/SettingsSections.ts#L45-L68), [`:478-493`](../../../src/renderer/editors/settings/sections/SettingsSections.ts#L478-L493)); graph expansion settings ([`GraphExpansionSettingsView.ts:62-86`](../../../src/renderer/editors/graph/GraphExpansionSettingsView.ts#L62-L86)); link dialog ([`EditLinkDialogView.ts:224-264`](../../../src/renderer/editors/link-editor/EditLinkDialogView.ts#L224-L264)); log selection dialog ([`SelectDialogView.ts:19-44`](../../../src/renderer/editors/log-view/items/SelectDialogView.ts#L19-L44)); MCP inspector ([`McpInspectorView.ts:53-80`](../../../src/renderer/editors/mcp-inspector/McpInspectorView.ts#L53-L80), [`ToolArgForm.ts:211-242`](../../../src/renderer/editors/mcp-inspector/ToolArgForm.ts#L211-L242)); Mneme mode selection ([`MnemeRootEditorView.ts:260-303`](../../../src/renderer/editors/mneme-root/MnemeRootEditorView.ts#L260-L303)); Select story ([`Select.story.ts:32-88`](../../../src/renderer/uikit/Select/Select.story.ts#L32-L88)). | Shared filtering, loading/empty arms, active scrolling, selection, disabled/read-only state, refs, and accessibility make a stale update appear far from the modified component. |
| `MultiSelectView` / `MultiListBoxView` | Current source search found the application-facing MultiSelect consumer is the UIKit story ([`MultiSelect.story.ts:39-93`](../../../src/renderer/uikit/MultiSelect/MultiSelect.story.ts#L39-L93)); its dropdown composes the MultiListBox branch ([`MultiSelectView.ts:235-242`](../../../src/renderer/uikit/MultiSelect/MultiSelectView.ts#L235-L242)). | Low application population is not low technical risk: filtering, select-all/mixed state, selection predicate identity, resize, branch ownership, and active-row scrolling meet in one path. |
| `AutocompleteView` | REST-client KeyValue rows construct the Autocomplete key editor ([`KeyValueEditorView.ts:138-177`](../../../src/renderer/editors/rest-client/KeyValueEditorView.ts#L138-L177)); the Autocomplete story exercises the standalone surface ([`Autocomplete.story.ts:48-72`](../../../src/renderer/uikit/Autocomplete/Autocomplete.story.ts#L48-L72)). | A stale filtered list or callback closure silently leaves the REST request editor showing or applying the wrong key. |
| `TextChromeView` | Every text-hosted editor in the current tree: HTML ([`editors/html/index.ts:169-177`](../../../src/renderer/editors/html/index.ts#L169-L177)), Grid ([`editors/grid/index.ts:211-232`](../../../src/renderer/editors/grid/index.ts#L211-L232)), file-diff ([`editors/file-diff/index.ts:19-30`](../../../src/renderer/editors/file-diff/index.ts#L19-L30)), environment variables ([`editors/env-vars/index.ts:17-27`](../../../src/renderer/editors/env-vars/index.ts#L17-L27)), graph/draw/mermaid/notebook/log/Monaco/Markdown/REST/SVG ([`editors/graph/index.ts:148-163`](../../../src/renderer/editors/graph/index.ts#L148-L163), [`editors/draw/index.ts:340-350`](../../../src/renderer/editors/draw/index.ts#L340-L350), [`editors/mermaid/index.ts:224-241`](../../../src/renderer/editors/mermaid/index.ts#L224-L241), [`editors/notebook/index.ts:219-233`](../../../src/renderer/editors/notebook/index.ts#L219-L233), [`editors/log-view/index.ts:144-151`](../../../src/renderer/editors/log-view/index.ts#L144-L151), [`editors/monaco/index.ts:16-21`](../../../src/renderer/editors/monaco/index.ts#L16-L21), [`editors/markdown/index.ts:156-164`](../../../src/renderer/editors/markdown/index.ts#L156-L164), [`editors/rest-client/index.ts:14-30`](../../../src/renderer/editors/rest-client/index.ts#L14-L30), [`editors/svg/index.ts:115-122`](../../../src/renderer/editors/svg/index.ts#L115-L122)). | This is shared chrome for all those editors. A lost slot, overlay, script panel, footer, compare, or run-button update surfaces outside the editor used for manual testing. |
| `PageToolbarView` / `EditorToolbarView` | Direct page-toolbar consumers are Git tree, Category, Video, Board Info, Image, and Archive ([`GitTreeEditorView.ts:82-161`](../../../src/renderer/editors/git-tree/GitTreeEditorView.ts#L82-L161), [`CategoryEditor.ts:78-107`](../../../src/renderer/editors/category/CategoryEditor.ts#L78-L107), [`VideoView.ts:36-69`](../../../src/renderer/editors/video/VideoView.ts#L36-L69), [`BoardInfoEditorView.ts:79-95`](../../../src/renderer/editors/board-info/BoardInfoEditorView.ts#L79-L95), [`ImageView.ts:28-38`](../../../src/renderer/editors/image/ImageView.ts#L28-L38), [`ArchiveEditorView.ts:25-65`](../../../src/renderer/editors/archive/ArchiveEditorView.ts#L25-L65)); TextChrome also constructs it ([`TextChromeView.ts:362-368`](../../../src/renderer/editors/base/TextChromeView.ts#L362-L368)). | Navigation-panel visibility, editor switching, border/layout, contributions, spacer behavior, and toolbar callbacks are shared across non-text and text editors. |
| `RequestBuilderView` deferred edges | RestClientShared mounts one RequestBuilder for the REST request editor ([`RestClientShared.ts:158-174`](../../../src/renderer/editors/rest-client/RestClientShared.ts#L158-L174)); it contains headers, form-urlencoded, raw-body, language, and body-value paths ([`RequestBuilderView.ts:221-250`](../../../src/renderer/editors/rest-client/RequestBuilderView.ts#L221-L250)). | The two KeyValue branches can apply edits to the wrong request row if closures stale; RawBody can diverge in text or language if its targeted paths are conflated. |

## Manual verification checklist

Walk these against real consumers after implementation; story-only checks do not cover the shared
editor blast radius.

- [ ] Select: text Script panel—type/filter, arrow navigation, Enter/Escape, selected value, input
  ref, placement, loading/empty, and disabled/read-only behavior.
- [ ] Select: settings, graph expansion, link dialog, log selection, MCP inspector, and Mneme mode;
  verify persistence, disabled states, accessibility attributes, and close/reopen behavior.
- [ ] MultiSelect/MultiListBox story: search, select one/all, deselect all, filtered mixed state,
  read-only rows, resize, close/reopen, active scrolling, and `aria-controls` targeting the live list.
- [ ] REST Autocomplete: headers and form-urlencoded rows; type a key prefix, navigate/select a
  suggestion, replace the request/row, and verify callback targets and items never go stale.
- [ ] REST RawBody: switch raw/non-raw, change language, edit body, update body externally, switch
  requests, and verify Monaco text, language, options, and change callback remain distinct.
- [ ] Popover consumers outside dropdowns: Menu, PathInput, board toolbar, CSV/column options,
  browser downloads/tab preview/URL suggestions, revision picker, and DataGrid story; verify edge
  flipping, anchor width, resize handle, direct-child layout, outside-click ignore, and Escape.
- [ ] TextChrome consumers: open HTML, Grid, file-diff, environment variables, graph, draw, mermaid,
  notebook, log, Monaco, Markdown, REST, and SVG editors; verify toolbar contributions, right-side
  controls, compare/run/resource actions where applicable, script panel, footer, and overlay.
- [ ] PageToolbar consumers: Git tree, Category, Video, Board Info, Image, and Archive; verify
  navigation-panel button, editor switcher, contributions, borders, spacer transitions, and callbacks.
- [ ] Exercise a large/virtualized dropdown dataset and scroll after both filtering and active-index
  movement; verify no pooled row is permanently configured and the target row is visible.
- [ ] Confirm Tree and standalone VirtualGrid consumers remain unchanged, including Tree’s active
  descendant after collapse; these are regression checks for the retained gates, not conversion scope.
- [ ] Typecheck, lint, and production-build. Do not add unit tests or a test harness; record any
  unwalked item here before task close.

## US-1204 dependencies left in place

- The forwarded `ElementRef`/`bindRef`/`*CallerRef` machinery in Popover, Select, MultiSelect, and
  Autocomplete remains because this task does not retire ref channels
  ([`PopoverView.ts:25-29`](../../../src/renderer/uikit/Popover/PopoverView.ts#L25-L29), [`:175-179`](../../../src/renderer/uikit/Popover/PopoverView.ts#L175-L179),
  and the dropdown references in the implementation plan). US-1203B must not collapse a relay by
  deleting or redesigning that channel.
- `GridBodyView.onModel` remains untouched. It is supplied at construction and again from the Grid
  editor update path ([`grid/index.ts:218-267`](../../../src/renderer/editors/grid/index.ts#L218-L267));
  it is explicitly US-1204 ref/onModel machinery.

## Concerns

- **Ownership is asymmetric.** The floating branch owns the factory result after claiming it; the
  dropdown retains only a bare reference for targeted pushes. A second `child()` claim or caller-side
  dispose violates the shared ownership marker and lifecycle contract.
- **The adopted Autocomplete root is shell-owned.** Its content view must keep header and list as
  direct children and must not overwrite the Popover root’s `data-type`, class, or children.
- **Selection and row-set changes are coupled.** A single consequence must carry filtered items and
  active index so the grid selects `scrollToRowAfterPaint` when content changed; no timer or microtask
  is an acceptable synchronization mechanism.
- **No new invariant throws.** Existing guards remain as source behavior, but the lifecycle/model
  invariants above are recorded here rather than asserted with new `throw` statements.
- **No gate removal.** `ListBoxView.repaintGate` remains for direct consumers, and Tree’s sibling
  gate remains outside this slice; no dead gate was verified.

## Acceptance Criteria

- [ ] Popover shell configuration is targeted while the floating branch retains and owns exactly one
  caller-created content view per open branch; no nonexistent content update hop is introduced.
- [ ] Select, MultiSelect, and Autocomplete retain their branch/content identities and preserve
  filtering, selection, active scrolling, loading/empty behavior, resize, placement, slots, refs,
  dismissal, and accessibility attributes.
- [ ] `ListBoxView` keeps both legitimate arm transitions and pooled-row repointing; no row update is
  converted into permanent configuration and no `DepsGate` is removed.
- [ ] TextChrome keeps all structural slot updates while removing only the stable shared-toolbar
  live-model relay; model/host branch rebuild behavior is preserved.
- [ ] PageToolbar stops updating NavPanelButton and SwitchWidget model props after construction;
  EditorToolbar configuration and PageToolbar structural slots remain correct.
- [ ] Both KeyValue paths use stable callbacks and targeted items updates; KeyedList row identity and
  current row indices remain correct.
- [ ] RawBody keeps separate targeted body-value and language operations; Monaco options/callbacks
  and the R8 timer audit are not folded into this task.
- [ ] The US-1204 ref channels and GridBody `onModel` edge remain unchanged and are recorded above.
- [ ] No equality gate, selector array allocation, deferral, new invariant throw, `memo()` change,
  R4/R5/R8 change, unit test, test harness, or commit is added.
- [ ] Manual verification covers the real application consumers listed above, not only stories.

## Files that need NO changes in this task

| File / area | Reason |
|---|---|
| `src/renderer/uikit/shared/vanilla-view.ts` | The no-equality-gate update contract is evidence and remains unchanged. |
| `src/renderer/core/state/state.ts` | Comparator and synchronous copy-on-write dispatch are constraints, not targets. |
| `src/renderer/uikit/shared/deps-gate.ts` | The factory and both surviving gates remain required. |
| `src/renderer/uikit/Tree/TreeView.ts`, `Tree/TreeModel.ts` | Tree’s genuine state-driven render-pass gate is outside this slice. |
| `src/renderer/editors/grid/index.ts` | `GridBodyView.onModel` belongs to US-1204. |
| `src/renderer/editors/draw/**` | No deferred editor edge in this task; its TextChrome consumer is a manual regression surface only. |
| `src/renderer/core/state/ComponentQueue.ts` | Queue draining is unrelated to these props boundaries. |

## Files Changed summary

| File | Planned change |
|---|---|
| `src/renderer/uikit/Popover/PopoverView.ts` | Add shell-only targeted configuration while retaining branch/content ownership. |
| `src/renderer/uikit/ListBox/ListBoxView.ts` and `ListBoxModel.ts` | Add the missing Select live-value/loading setters; retain the 1203A gate and arm/row contracts. |
| `src/renderer/uikit/Select/SelectView.ts` | Replace open-content and shell props pumps with targeted operations. |
| `src/renderer/uikit/MultiSelect/MultiSelectView.ts` and `MultiListBox/MultiListBoxView.ts` | Retain the branch and target MultiListBox live/configuration fields. |
| `src/renderer/uikit/Autocomplete/AutocompleteView.ts` | Retain adopted content and target list plus structural header updates. |
| `src/renderer/editors/base/TextChromeView.ts` | Remove only the shared-toolbar live model relay; retain structural slots and branch rebuilds. |
| `src/renderer/editors/base/PageToolbarView.ts` and `EditorToolbarView.ts` | Settle toolbar configuration/slot boundary and remove Nav/Switch model prop relays. |
| `src/renderer/editors/rest-client/RequestBuilderView.ts` and `KeyValueEditorView.ts` | Stabilize KeyValue callbacks/items and preserve separate RawBody value/language paths. |
| `src/renderer/editors/shared/MonacoEditorHostView.ts` | Add the narrow language operation; retain existing value synchronization and timer boundary. |
| `doc/active-work.md` | Add the open linked US-1203B entry under EPIC-076. |
| `doc/tasks/US-1203B-dropdowns-and-editor-edges/README.md` | This verified implementation plan, risks, consumers, checklist, and boundaries. |

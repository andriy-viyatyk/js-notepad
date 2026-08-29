# US-1204 — Retire the ref channels: `ElementRef`, `bindRef`, `onModel`

## Goal

Retire the redundant synchronous `ElementRef`/`bindRef` and model-publication channels while
preserving the few channels whose value is created or replaced after the owning view is
constructed. The result is deliberately partial: direct child views expose the handles their
parents already own, while deferred grid and portalled-root lifecycles retain narrowly named
notifications.

This is a planning document. It records source-verified scope only; implementation, tests, test
harnesses, and commits do not belong to this phase.

## Background

EPIC-076 B-1 statement 3 requires the `ElementRef`, `bindRef`, and
`syncCallerRef`/`appliedCallerRef` machinery to disappear, with no component taking a `ref?:` prop,
while preserving input-element access for Autocomplete, MultiSelect, PathInput, and Select
([`EPIC-076.md:24-43`](../../epics/EPIC-076.md#b-1--the-closing-property)). The epic's original
claim that every model channel is redundant is not correct. `GridBodyView` publishes a DataGrid
instance only after its `DataGridView` mounts and can publish a later `liveGrid` or `null`
([`GridBodyView.ts:124-138`](../../../src/renderer/editors/grid/GridBodyView.ts#L124-L138),
[`GridBodyView.ts:308-339`](../../../src/renderer/editors/grid/GridBodyView.ts#L308-L339)). A
parent can own `GridBodyView.root`, but there is no DataGrid instance to hold at the body
constructor boundary.

The native model-view convention is the governing boundary: props are construction-time
configuration; live data uses a child-owned binding or a targeted setter, and `update()` has no
equality gate ([`model-view-pattern.md:349-362`](../standards/model-view-pattern.md#the-props-pump-convention),
[`vanilla-view.ts:84-97`](../../../src/renderer/uikit/shared/vanilla-view.ts#L84-L97)). A direct
child reference is valid when the child exposes a stable getter after construction or mount. A
callback remains justified when the child is created later, is replaced, or is disposed to null.

### Re-measured baseline

All measurements below were run against the current source tree on 2026-08-29. `rg` was used for
the text populations, followed by a semantic per-site review; matches in comments, substrings,
and unrelated automation APIs are not counted as implementation sites.

| Instrument | Result | Interpretation |
|---|---:|---|
| `rg -l --glob '*.ts' --glob '*.tsx' "\\bElementRef\\b" src/renderer` | **26 files** | The stated 27 is one too high. The set includes the shared definition, 19 UIKit contracts, and their separate view implementation files. |
| `rg -n "ref\\?:" src` | **34 matches** | Not a prop count: `selectedHref?:`, `href?:`, and other identifiers contain the substring. |
| `rg -n -P "(?<![A-Za-z0-9_])ref\\?:" src` | **25 matches** | 20 semantic declarations/usages: 19 `ElementRef`-backed UIKit contracts and the unrelated automation string prop, plus four duplicate `MenuView` intersection type references. |
| Semantic UIKit `ref` contracts | **19 contracts** | The actual ref surface to retire or narrow; the automation `ref?: string` at [`automation/input.ts:295`](../../../src/renderer/automation/input.ts#L295) is a separate CDP addressing API and stays. |
| `rg -n --glob '*.ts' --glob '*.tsx' "bindRef\\(" src/renderer/uikit` | **17 calls** | All are in the 17 view locations listed below; 16 are redundant direct-root/input bindings and one is the deferred Popover floating-root binding. |
| `rg -n --glob '*.ts' --glob '*.tsx' "syncCallerRef|appliedCallerRef" src/renderer/uikit` | **4 views** | Exactly Autocomplete, MultiSelect, PathInput, and Select, as stated. |
| `rg -n --glob '*.ts' --glob '*.tsx' "onModel\\?\\.\\(" src/renderer` | **17 text matches** | One is the TreeProvider disposal comment at [`TreeProviderViewModel.ts:278`](../../../src/renderer/components/tree-provider/TreeProviderViewModel.ts#L278), not an invocation. There are **16 executable invocations**, classified below. |
| `rg -n --glob '*.ts' --glob '*.tsx' "onModel\\?:" src/renderer` | **9 declarations** | The stated declaration count is correct. |

The `onModel` mention count of 112 is therefore not an implementation baseline. The useful
population is the per-emission table, not all type references, comments, and pass-through props.

## `onModel` classification

The table has 17 rows because it records all 17 raw optional-call matches. Row 17 is explicitly
marked as a measurement artifact so it cannot be mistaken for a code site. “Synchronous” means
the published model exists by the time the child is constructed or mounted and the owning parent
can retain the child view/getter. “Deferred” means the published value is created, replaced, or
cleared later.

| # | Source site | Classification | Verdict | Verified reason and planned boundary |
|---:|---|---|---|---|
| 1 | `components/tree-provider/TreeProviderViewModel.ts:153` — `init()` publishes `this` | Synchronous | **Remove** | `TreeProviderViewImpl` constructs the driver in its constructor and already exposes `model` at [`TreeProviderViewImpl.ts:75-88`](../../../src/renderer/components/tree-provider/TreeProviderViewImpl.ts#L75-L88). Consumers can retain the `TreeProviderViewImpl` and read its model directly. |
| 2 | `components/tree-provider/TreeProviderViewModel.ts:280` — `dispose()` publishes `null` | Synchronous | **Remove** | The host owns the child and clears its own view/model fields during child replacement/disposal. Removing this notification does not remove child-first disposal; that ordering is retained as described below. |
| 3 | `components/file-list/FileListView.ts:70` — mount publishes `driver.model` | Synchronous | **Remove** | The model driver is constructed before the child is mounted at [`FileListView.ts:29-36`](../../../src/renderer/components/file-list/FileListView.ts#L29-L36). Add a public `FileListView.model` getter and let `RecentFileListView`/its owner read it. |
| 4 | `components/file-list/FileListView.ts:71` — owned cleanup publishes `null` | Synchronous | **Remove** | `RecentFileListView` owns this `FileListView`; it can clear its own direct reference during disposal. No later model replacement exists in this view. |
| 5 | `editors/grid/GridBodyView.ts:128` — DataGrid loss publishes `null` | Deferred | **Keep existing channel** | `DataGridView.onDispose()` calls its `onGrid(null)` at [`DataGridView.ts:211-220`](../../../src/renderer/uikit/DataGrid/DataGridView.ts#L211-L220), and GridBody also loses the handle when the content host disappears. The parent cannot read a model that does not exist at GridBody construction. |
| 6 | `editors/grid/GridBodyView.ts:315` — first `DataGridInstance` publication | Deferred | **Keep existing channel** | `AVGrid.create()` runs in `DataGridView.onMount()` at [`DataGridView.ts:112-143`](../../../src/renderer/uikit/DataGrid/DataGridView.ts#L112-L143), after GridBody construction. The publication also performs the GridEditor handoff through `setGrid`. |
| 7 | `editors/grid/GridBodyView.ts:338` — republish current `liveGrid` | Deferred | **Keep existing channel** | GridBody tracks the callback identity and republishes the already-live instance when the host callback changes at [`GridBodyView.ts:336-339`](../../../src/renderer/editors/grid/GridBodyView.ts#L336-L339). This replacement/null behavior is real and is not a redundant constructor ref. |
| 8 | `uikit/VirtualGrid/VirtualFlexGridView.ts:102` — inner `VirtualGridView.model` or `null` | Deferred | **Replace with narrow getter** | The inner view is constructed only in `onMount()` at [`VirtualFlexGridView.ts:132-139`](../../../src/renderer/uikit/VirtualGrid/VirtualFlexGridView.ts#L132-L139), but it is a stable child thereafter. Expose a `gridModel`/capability getter on `VirtualFlexGridView`; Notebook and Log can query their owned wrapper when acting, and clear their own fields when leaving/disposal branches. |
| 9 | `ui/sidebar/RecentFileListView.ts:30` — forward from FileList construction props | Synchronous | **Remove** | This is a pass-through from a child whose model is synchronously available. Replace the constructor `holder` callback path with the child view getter. |
| 10 | `ui/sidebar/RecentFileListView.ts:57` — forward from FileList update props | Synchronous | **Remove** | The FileList model is not replaced by `RecentFileListView.onUpdate()`; only its items and callbacks change at [`RecentFileListView.ts:42-58`](../../../src/renderer/ui/sidebar/RecentFileListView.ts#L42-L58). No update-time model publication is needed. |
| 11 | `uikit/Tree/TreeModel.ts:810` — `init()` publishes `this` | Synchronous | **Remove** | `TreeView` constructs its driver and exposes `model` before `driver.mount()` at [`TreeView.ts:87-121`](../../../src/renderer/uikit/Tree/TreeView.ts#L87-L121). Direct consumers can retain the child view. |
| 12 | `uikit/Tree/TreeModel.ts:814` — `dispose()` publishes `null` | Synchronous | **Remove** | The owner already disposes/releases the Tree view; the model pointer is not replaced while that view lives. Preserve child cleanup before driver cleanup. |
| 13 | `uikit/ImageViewport/ImageViewport.ts:257` — `init()` publishes `this` | Synchronous | **Remove** | `ImageViewportView` constructs the driver in its constructor at [`ImageViewportView.ts:18-29`](../../../src/renderer/uikit/ImageViewport/ImageViewportView.ts#L18-L29). Its mount hook assigns DOM refs before `driver.mount()` at [`ImageViewportView.ts:37-50`](../../../src/renderer/uikit/ImageViewport/ImageViewportView.ts#L37-L50); expose the driver model through the view. |
| 14 | `uikit/ImageViewport/ImageViewport.ts:263` — `dispose()` publishes `null` | Synchronous | **Remove** | Image, SVG, and Mermaid parents own the viewport branch. They can read the viewport model after mounting and clear their own toolbar/editor handle when disposing or swapping the branch. |
| 15 | `uikit/ListBox/ListBoxModel.ts:336` — `init()` publishes `this` | Synchronous | **Remove** | `ListBoxView.model` is already public at [`ListBoxView.ts:108-118`](../../../src/renderer/uikit/ListBox/ListBoxView.ts#L108-L118), and the model driver is created before mount. Stories and URL suggestions can read the owned view directly. |
| 16 | `uikit/ListBox/ListBoxModel.ts:340` — `dispose()` publishes `null` | Synchronous | **Remove** | The ListBox owner disposes the child and can stop using its getter; no model replacement occurs inside a ListBox lifetime. |
| 17 | `components/tree-provider/TreeProviderViewModel.ts:278` — comment containing `onModel?.(null)` | Not a site | **No code change** | This is the extra raw-regex match. It documents the ordering hazard and must be rewritten when the channel is removed, but it is not an invocation to classify as synchronous or deferred. |

### Deferred decisions outside the raw `onModel` call syntax

The TreeProvider-to-Tree callback at [`TreeProviderViewImpl.ts:323`](../../../src/renderer/components/tree-provider/TreeProviderViewImpl.ts#L323)
is a model handoff even though the call site is named `onModel:` rather than
`props.onModel?.(...)`. It is synchronous after `TreeView.mount()`: `enterTreeArm()` owns the
new view, mounts it, and can call `this.model.setTreeModel(view.model)` directly at
[`TreeProviderViewImpl.ts:156-171`](../../../src/renderer/components/tree-provider/TreeProviderViewImpl.ts#L156-L171).
The same direct assignment replaces `onModel(null)` in `leaveTreeArm()` at
[`TreeProviderViewImpl.ts:174-181`](../../../src/renderer/components/tree-provider/TreeProviderViewImpl.ts#L174-L181).

The `ImageViewport` `imageModelSetter` props in Image, SVG, and Mermaid are also callback
pass-throughs rather than additional `onModel` invocations. They will be removed with the
viewport channel: Image reads its owned viewport model, SVG's toolbar reads its owned body/view,
and Mermaid's toolbar queries the active viewport exposed by its body. Branch removal explicitly
clears the outer handle at the same lifecycle point; no microtask or timer is introduced.

## `ElementRef`, `ref?:`, and `bindRef` classification

The generic ref contract is not uniformly redundant. Root refs expose an element that the owning
parent already has as `child.root`; input refs expose a child-owned input that can be returned by a
getter; Popover's ref exposes a portalled root that does not exist until an open branch is
created. The plan removes the generic `ElementRef` type and `bindRef` helper, removes all UIKit
`ref?:` props, and replaces the one deferred Popover case with a semantic callback named for the
event it reports.

### Semantic `ref?:` contracts

| Contract | Source | Classification | Verdict and reason |
|---|---|---|---|
| `ButtonProps.ref` | [`ButtonView.ts:4-11`](../../../src/renderer/uikit/Button/ButtonView.ts#L4-L11) | Synchronous root | **Remove.** `ButtonView.root` is the exact button passed to `bindRef` at [`ButtonView.ts:178-182`](../../../src/renderer/uikit/Button/ButtonView.ts#L178-L182). |
| `IconButtonProps.ref` | [`IconButtonView.ts:8-14`](../../../src/renderer/uikit/IconButton/IconButtonView.ts#L8-L14) | Synchronous root | **Remove.** The bound node is the public child root at [`IconButtonView.ts:141-145`](../../../src/renderer/uikit/IconButton/IconButtonView.ts#L141-L145). |
| `InputProps.ref` | [`InputView.ts:7-18`](../../../src/renderer/uikit/Input/InputView.ts#L7-L18) | Synchronous child input | **Remove generic ref; add `InputView.inputElement` getter.** The field is created in the constructor at [`InputView.ts:58-78`](../../../src/renderer/uikit/Input/InputView.ts#L58-L78), and callers can retain the Input view. |
| `DateInputProps.ref` | [`DateInput.ts:1-9`](../../../src/renderer/uikit/DateInput/DateInput.ts#L1-L9) | Type-only wrapper | **Remove.** This file declares no view or binder; its ref member only extends the redundant Input contract. |
| `DialogProps.ref` | [`Dialog.ts:8-17`](../../../src/renderer/uikit/Dialog/Dialog.ts#L8-L17) | Synchronous root | **Remove.** The bound node is the Dialog view root at [`DialogView.ts:129-133`](../../../src/renderer/uikit/Dialog/DialogView.ts#L129-L133). |
| `DialogContentProps.ref` | [`DialogContent.ts:7-10`](../../../src/renderer/uikit/Dialog/DialogContent.ts#L7-L10) | Synchronous root | **Remove.** The bound node is the child view root at [`DialogContentView.ts:284-288`](../../../src/renderer/uikit/Dialog/DialogContentView.ts#L284-L288). |
| `NotificationProps.ref` | [`Notification.ts:7-10`](../../../src/renderer/uikit/Notification/Notification.ts#L7-L10) | Synchronous root | **Remove.** `NotificationView` binds its own root at [`NotificationView.ts:161-165`](../../../src/renderer/uikit/Notification/NotificationView.ts#L161-L165). |
| `AlertItemViewProps.ref` | [`AlertItemView.ts:6-11`](../../../src/renderer/uikit/Notification/AlertItemView.ts#L6-L11) | Synchronous root | **Remove.** The parent already owns the AlertItem view root; the binder at [`AlertItemView.ts:76-80`](../../../src/renderer/uikit/Notification/AlertItemView.ts#L76-L80) adds no reachability. |
| `ListItemProps.ref` | [`ListItem.ts:7-11`](../../../src/renderer/uikit/ListBox/ListItem.ts#L7-L11) | Synchronous per-cell root | **Remove.** ListBox creates and retains each row view; no application caller supplies this prop, and the row root is available to the cell owner at [`ListItemView.ts:301-305`](../../../src/renderer/uikit/ListBox/ListItemView.ts#L301-L305). Virtualized re-points remain untouched. |
| `ListBox SectionItemProps.ref` | [`ListBox/SectionItem.ts:5-8`](../../../src/renderer/uikit/ListBox/SectionItem.ts#L5-L8) | Synchronous root | **Remove.** The binder only publishes the section view root at [`ListBox/SectionItemView.ts:48-52`](../../../src/renderer/uikit/ListBox/SectionItemView.ts#L48-L52). |
| `TreeItemProps.ref` | [`TreeItem.ts:7-10`](../../../src/renderer/uikit/Tree/TreeItem.ts#L7-L10) | Synchronous per-cell root | **Remove.** Tree owns the row view; the binder at [`TreeItemView.ts:373-377`](../../../src/renderer/uikit/Tree/TreeItemView.ts#L373-L377) is not consumed by an external caller. |
| `Tree SectionItemProps.ref` | [`Tree/SectionItem.ts:6-9`](../../../src/renderer/uikit/Tree/SectionItem.ts#L6-L9) | Synchronous root | **Remove.** The section view root is already owned and retained by Tree; its binder is at [`Tree/SectionItemView.ts:92-96`](../../../src/renderer/uikit/Tree/SectionItemView.ts#L92-L96). |
| `SelectableRowProps.ref` | [`SelectableRowView.ts:7-11`](../../../src/renderer/uikit/SelectableRow/SelectableRowView.ts#L7-L11) | Synchronous root | **Remove.** The view root is public to its owner; the binder at [`SelectableRowView.ts:67-71`](../../../src/renderer/uikit/SelectableRow/SelectableRowView.ts#L67-L71) is redundant. |
| `MenuView` ref intersection | [`MenuView.ts:304-336`](../../../src/renderer/uikit/Menu/MenuView.ts#L304-L336) | Deferred Popover root | **Remove `ref?:`; replace with `onFloatingRoot?: (root: HTMLDivElement | null) => void`.** Menu forwards this only to Popover; it is not a Menu root ref. |
| `PopoverViewProps.ref` | [`PopoverView.ts:22-29`](../../../src/renderer/uikit/Popover/PopoverView.ts#L22-L29) | Deferred portalled root | **Narrow, do not delete the behavior.** `PopoverFloatingView` is created only when open at [`PopoverView.ts:336-377`](../../../src/renderer/uikit/Popover/PopoverView.ts#L336-L377); `AppPopupMenuView` needs its root to register with `overlayRegistry` at [`showPopupMenu.ts:161-187`](../../../src/renderer/ui/dialogs/poppers/showPopupMenu.ts#L161-L187). |
| `SelectView.ref` | [`SelectView.ts:13-18`](../../../src/renderer/uikit/Select/SelectView.ts#L13-L18) | Deferred child input | **Remove generic ref and caller-ref state; expose the owned input element.** The current internal handoff is at [`SelectView.ts:238`](../../../src/renderer/uikit/Select/SelectView.ts#L238), and the four-view machinery is at [`SelectView.ts:340-355`](../../../src/renderer/uikit/Select/SelectView.ts#L340-L355). |
| `MultiSelectView.ref` | [`MultiSelectView.ts:14-19`](../../../src/renderer/uikit/MultiSelect/MultiSelectView.ts#L14-L19) | Deferred child input | **Remove generic ref and caller-ref state; expose the owned input element.** Its input is a retained child at [`MultiSelectView.ts:214`](../../../src/renderer/uikit/MultiSelect/MultiSelectView.ts#L214), with current forwarding at [`MultiSelectView.ts:315-327`](../../../src/renderer/uikit/MultiSelect/MultiSelectView.ts#L315-L327). |
| `AutocompleteView.ref` | [`AutocompleteView.ts:20-25`](../../../src/renderer/uikit/Autocomplete/AutocompleteView.ts#L20-L25) | Deferred child input | **Remove generic ref and caller-ref state; expose the owned input element.** The input is created as a child at [`AutocompleteView.ts:331`](../../../src/renderer/uikit/Autocomplete/AutocompleteView.ts#L331), and current forwarding is [`AutocompleteView.ts:413-422`](../../../src/renderer/uikit/Autocomplete/AutocompleteView.ts#L413-L422). |
| `PathInputView.ref` | [`PathInputView.ts:20-25`](../../../src/renderer/uikit/PathInput/PathInputView.ts#L20-L25) | Deferred child input | **Remove generic ref and caller-ref state; expose the owned input element.** The internal Input handoff is [`PathInputView.ts:232`](../../../src/renderer/uikit/PathInput/PathInputView.ts#L232), and caller-ref synchronization is [`PathInputView.ts:205-219`](../../../src/renderer/uikit/PathInput/PathInputView.ts#L205-L219). |
| `NativeSVGProps.ref` | [`theme/icons.ts:6-16`](../../../src/renderer/theme/icons.ts#L6-L16) | Dead contract | **Remove.** `createSvgElement()` explicitly discards `ref` at [`icons.ts:83-99`](../../../src/renderer/theme/icons.ts#L83-L99); no SVG binder exists. |

The automation `ref?: string` at [`automation/input.ts:295`](../../../src/renderer/automation/input.ts#L295)
is not a DOM callback ref and remains unchanged. Likewise, `containerRef`/`imageRef` in
`ImageViewportModel` are model-owned DOM dependencies assigned directly by its view at
[`ImageViewportView.ts:43-46`](../../../src/renderer/uikit/ImageViewport/ImageViewportView.ts#L43-L46);
they are not `ElementRef` channels and are outside the generic ref API removal.

### Every `bindRef` call

| Source call | Element | Classification | Verdict |
|---|---|---|---|
| `ButtonView.ts:182` | `this.root` | Synchronous root | Remove with `ButtonProps.ref`. |
| `IconButtonView.ts:145` | `this.root` | Synchronous root | Remove with `IconButtonProps.ref`. |
| `InputView.ts:221` | `this.field` | Child input created in constructor | Remove; use `InputView.inputElement`. |
| `DialogView.ts:133` | `this.root` | Synchronous root | Remove with Dialog ref. |
| `DialogContentView.ts:288` | `this.root` | Synchronous root | Remove with DialogContent ref. |
| `ListItemView.ts:305` | `this.root` | Virtualized row root | Remove; retain row re-point behavior and ownership. |
| `ListBox/SectionItemView.ts:52` | `this.root` | Synchronous root | Remove. |
| `PopoverView.ts:194` | floating `this.root` | Deferred portalled root | Replace with the explicit `onFloatingRoot` callback; invoke root after branch mount and `null` before/at branch disposal. |
| `SelectableRowView.ts:71` | `this.root` | Synchronous root | Remove. |
| `NotificationView.ts:165` | `this.root` | Synchronous root | Remove. |
| `AlertItemView.ts:80` | `this.root` | Synchronous root | Remove. |
| `PathInputView.ts:219` | child input | Deferred child subtree, but owned | Remove generic caller ref; expose getter and retain direct internal input ownership. |
| `MultiSelectView.ts:327` | child input | Deferred child subtree, but owned | Remove generic caller ref; expose getter. |
| `SelectView.ts:355` | child input | Deferred child subtree, but owned | Remove generic caller ref; expose getter. |
| `Tree/SectionItemView.ts:96` | `this.root` | Synchronous root | Remove. |
| `Tree/TreeItemView.ts:377` | `this.root` | Virtualized row root | Remove; do not collapse or alter row re-pointing. |
| `AutocompleteView.ts:422` | child input | Deferred child subtree, but owned | Remove generic caller ref; expose getter. |

## Implementation Plan

1. **Delete the generic UIKit ref contract.** Remove `ElementRef` and `bindRef` from
   `src/renderer/uikit/shared/dom-props.ts`, then remove the 19 UIKit `ref?:` contracts and all
   associated cleanup/state fields and methods in the 17 binder locations above. Leave
   `NativeHTMLAttributes`, `applyRestProps`, `RestPropsState`, and `clearRestListeners` intact;
   type narrowing and rest-prop timing remain Epic C/US-1206 work. Remove the dead SVG `ref` type
   member while leaving the native SVG attribute builder otherwise unchanged.

2. **Expose direct child handles.** Add narrow getters where the current callback was the only
   route: `InputView.inputElement`, `FileListView.model`, `ImageViewportView.model`, and
   `VirtualFlexGridView.gridModel` (or an equivalently named `GridModelCapability` getter).
   The getter must return the actual owned object, not a new wrapper. Keep the view root as the
   direct root handle. For the four controls, replace `syncCallerRef`/`appliedCallerRef` and
   `callerRefCleanup` with the public input getter; the controls still expose their input to
   hosts through the view object.

   Before:

   ```ts
   this.input = this.child(new InputView({ ref: this.setInputElement, ...props }));
   this.input.mount();
   ```

   After:

   ```ts
   this.input = this.child(new InputView(props));
   this.input.mount();
   this.inputElement = this.input.inputElement;
   ```

   The exact assignment may instead be a getter over the retained Input view; it must not create
   a callback ref or defer through a timer.

3. **Convert synchronous model consumers.** Remove `onModel` from the ListBox, Tree,
   ImageViewport, FileList, and TreeProvider model/view prop types and from their init/dispose
   emissions. Update all verified consumers: TreeProvider's internal Tree handoff,
   `MenuBarView`, `RecentFileListView`, `ArchiveSecondaryView`, `ArchiveEditorView`,
   `ExplorerSecondaryView`, `ScriptLibraryPanelView`, `UrlSuggestionsDropdown`, the Tree and
   VirtualGrid stories, and Image/SVG/Mermaid editor paths. Read the owned child getter after
   mount and clear owner bookkeeping explicitly when the child/branch is released.

4. **Keep GridBody's deferred channel.** Do not pretend that `GridBodyView.root` replaces the
   DataGrid instance. Retain the `onModel` prop and the three existing publication states at
   `GridBodyView.ts:128,315,338`; keep callback-identity replacement and null release. Update
   surrounding comments and the consumer table to state that this is the intentional deferred
   exception. Do not add a second notification or a timer.

5. **Replace VirtualFlex's broad publication with its owned capability getter.** Remove
   `VirtualFlexGridProps.onModel` and the `onGridView` publication to callers, retaining the
   internal `measurement.setGridModel()` handoff. Have Notebook and Log use their retained
   `VirtualFlexGridView` getter at the action sites that currently read `gridModel`; clear or
   query null when the wrapper leaves its content branch. Preserve the engine's existing delayed
   measurement behavior and all `requestAnimationFrame` scheduling.

6. **Narrow the Popover floating-root channel.** Replace the `ref?: ElementRef` intersection in
   `MenuView`/`PopoverView` with a semantic `onFloatingRoot?: (root: HTMLDivElement | null) => void`.
   Call it when `PopoverFloatingView` has its portalled root and call it with `null` before the
   root is released. Keep `AppPopupMenuView.setMenuRef()` and its overlay-registry unregister /
   register behavior. Do not generalize the callback into another `ElementRef` alias, and do not
   change Popover's content-view ownership or portal branch lifecycle.

7. **Preserve the tree-provider disposal order.** `TreeProviderViewImpl` must continue to own the
   Tree/search children and the driver, with child disposal occurring before the driver's model
   disposal as required by `VanillaView.dispose()` ownership semantics
   ([`vanilla-view.ts:170-227`](../../../src/renderer/uikit/shared/vanilla-view.ts#L170-L227)).
   `leaveTreeArm()` must clear `TreeProviderViewModel.treeModel` after disposing/removing the Tree
   child, and `TreeProviderViewImpl` must dispose child views before `driver.dispose()` as its
   current registration/order does at [`TreeProviderViewImpl.ts:75-82`](../../../src/renderer/components/tree-provider/TreeProviderViewImpl.ts#L75-L82).
   Removing `props.onModel?.(null)` removes only the old host notification expression; it must not
   move model disposal ahead of child disposal. Record this invariant in comments/task docs rather
   than adding a new `throw` guard.

8. **Verify ref call-site migration.** Replace the concrete input callback uses in FileList,
   FileSearch, Category, TreeProvider, Browser, Graph, Menu, and the four compound controls with
   retained child getters/direct assignments. The source locations to audit include
   [`FileListView.ts:36-42,100-112`](../../../src/renderer/components/file-list/FileListView.ts#L36-L42),
   [`FileSearchView.ts:80-93,181-193`](../../../src/renderer/components/file-search/FileSearchView.ts#L80-L93),
   [`CategoryViewImpl.ts:119-126,400-411`](../../../src/renderer/components/tree-provider/CategoryViewImpl.ts#L119-L126),
   [`BrowserView.ts:285-320`](../../../src/renderer/editors/browser/BrowserView.ts#L285-L320),
   [`GraphBodyView.ts:537`](../../../src/renderer/editors/graph/GraphBodyView.ts#L537), and
   [`MenuView.ts:144`](../../../src/renderer/uikit/Menu/MenuView.ts#L144). Do not alter the
   unrelated automation `ref` address or model-owned `containerRef`/`imageRef` fields.

### Invariants and forbidden changes

- `GridBodyView.onModel` remains because the DataGrid appears after child mount and can be
  replaced/released; its callback identity handling remains intact.
- `Popover`'s floating root is the only retained generic-ref behavior, and it is renamed to an
  explicit root-lifecycle callback because the root is portalled and deferred.
- A view owner may read a child's public model/input getter after the child is mounted; no parent
  reaches through a disposed child. Models are cleared by the owner at branch/disposal boundaries.
- `headerRef` remains a semantic deferred header-host channel; it is not converted to
  `ElementRef`, and no holder is added for it.
- Do not add an equality gate to `VanillaView.update()`, allocate fresh-array selectors, add
  `queueMicrotask`/`setTimeout(0)` deferrals, remove a `DepsGate`, collapse virtualized row
  re-points, add invariant `throw` guards, touch `memo()`, or fix R4/R5/R8 sites.
- Do not change `applyRestProps` call timing or narrow `NativeHTMLAttributes`; those are US-1206
  and Epic C boundaries.
- Do not add unit tests or a test harness, and do not commit.

## Tree-provider ordering and `headerRef` findings

### Tree-provider ordering

The old ordering requirement is real even after the callback is removed. `TreeProviderViewModel`
currently unsubscribes its provider watch and then publishes null at
[`TreeProviderViewModel.ts:274-280`](../../../src/renderer/components/tree-provider/TreeProviderViewModel.ts#L274-L280),
while `TreeProviderViewImpl` registers the driver after its child ownership and relies on
`VanillaView` disposing owned children first at [`TreeProviderViewImpl.ts:75-82`](../../../src/renderer/components/tree-provider/TreeProviderViewImpl.ts#L75-L82).
The replacement is explicit owner bookkeeping: dispose/remove the Tree and search children first,
clear `treeModel`, then dispose the model driver. Nothing may call a model method through a child
after that child is disposed. The task does not introduce a new assertion for this invariant.

### `headerRef` / `holder` claim

The epic's claim is not verified. `headerRef` is a real deferred channel: the panel stack creates
each header in `createPanel()` at [`CollapsiblePanelStackView.ts:105-123`](../../../src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStackView.ts#L105-L123),
then reports the newly created header after inserting owned nodes at
[`CollapsiblePanelStackView.ts:130-183`](../../../src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStackView.ts#L130-L183).
`SecondaryViewsView` needs that element later to attach the sidebar title/actions through
`SideBarPanelHeaderDom.update()` at [`SideBarPanelHeaderView.ts:112-128`](../../../src/renderer/ui/secondary-views/SideBarPanelHeaderView.ts#L112-L128).
The channel should stay named `headerRef` (or be renamed only to an equally explicit header
registration callback); it is not a redundant constructor ref.

The two `const holder = {}` patterns are unrelated to `headerRef`:

- `RecentFileListView` uses a holder because its constructor must create callback props before
  `super(props, fileList.root)` and cannot use `this` before `super()` at
  [`RecentFileListView.ts:21-35`](../../../src/renderer/ui/sidebar/RecentFileListView.ts#L21-L35).
- `MenuBarView` uses a holder for the initially constructed folder ListBox's callbacks before
  `super(props)` at [`MenuBarView.ts:151-173`](../../../src/renderer/ui/sidebar/MenuBarView.ts#L151-L173).

Neither holder exists to satisfy `headerRef` ordering. `SecondaryViewsView.createRecord()` instead
uses a closure over the record being initialized at [`SecondaryViewsView.ts:170-181`](../../../src/renderer/ui/secondary-views/SecondaryViewsView.ts#L170-L181),
which is valid after the object literal completes.

## Consumer and risk table

| Boundary / retained behavior | Verified consumers | Main risk |
|---|---|---|
| Direct root refs removed | Button, IconButton, Dialog, DialogContent, Notification, AlertItem, SelectableRow, ListItem, and Tree section/item view definitions listed above | A hidden external caller could have used the legacy callback even though the current source has no such caller. Search all `ref:` constructors before implementation; the intended replacement is the owned view root. |
| Direct input getters | FileList, FileSearch, Category, TreeProvider, Browser URL bar, Graph search, Menu search, Select, MultiSelect, Autocomplete, and PathInput; representative construction sites are [`BrowserView.ts:285-320`](../../../src/renderer/editors/browser/BrowserView.ts#L285-L320), [`CategoryViewImpl.ts:119-126`](../../../src/renderer/components/tree-provider/CategoryViewImpl.ts#L119-L126), and [`TreeProviderViewImpl.ts:231-242`](../../../src/renderer/components/tree-provider/TreeProviderViewImpl.ts#L231-L242) | A getter must return the actual input element after mount and must be cleared/ignored after disposal. Stale search/model handles would fail silently in focus, keyboard, and selection behavior. |
| Four caller-ref controls | Autocomplete, MultiSelect, PathInput, Select; their internal input refs are the four `syncCallerRef`/`appliedCallerRef` systems | Removing the public callback must not make hosts lose input access. Verify focus, typing, filtering, keyboard navigation, and host-side imperative operations. |
| Synchronous model getters | TreeProvider consumers in MenuBar, Explorer, Archive, Script Library; FileList in Recent Files; ListBox in URL suggestions and stories; Tree/ListBox stories; Image in Image/SVG/Mermaid | Model fields must be read only after the owned child is mounted; cleanup must clear owner state before child disposal. |
| Deferred `GridBodyView.onModel` kept | `GridEditorView` stores the DataGrid for `GridToolbarView.getGridModel()` at [`grid/index.ts:207-223,275-283`](../../../src/renderer/editors/grid/index.ts#L207-L223) and passes it to column actions | Removing this callback would lose the asynchronously materialized/released DataGrid and break grid focus, column options, and editor handoff. |
| VirtualFlex capability getter | Notebook and Log store/use `GridModelCapability` at [`NotebookBodyView.ts:106-107,174,232-307`](../../../src/renderer/editors/notebook/NotebookBodyView.ts#L106-L107) and [`LogBodyView.ts:47,95,136-194`](../../../src/renderer/editors/log-view/LogBodyView.ts#L47-L194) | The getter must follow wrapper branch lifetime without changing pending scroll, measurement, or paint scheduling. |
| Deferred Popover floating root | App popup menu registers the floated root with `overlayRegistry` at [`showPopupMenu.ts:161-187`](../../../src/renderer/ui/dialogs/poppers/showPopupMenu.ts#L161-L187) | The root is portalled, created only when open, and must unregister before removal; a direct `PopoverView.root` is only the display-contents host and is not a substitute. |
| `headerRef` retained | `SecondaryViewsView` → `CollapsiblePanelStackView` → all secondary editors through `SecondaryViewProps.headerRef` at [`secondary-view-registry.ts:8-18`](../../../src/renderer/ui/secondary-views/secondary-view-registry.ts#L8-L18) | Header creation is deferred and panel records can be removed/recreated. Preserve null-on-removal and header-node attachment order. |
| Automation `ref` retained | CDP input addressing in [`automation/input.ts:193-214,295`](../../../src/renderer/automation/input.ts#L193-L214) | This is string-based automation addressing, not a DOM callback ref; deleting it would break an unrelated API. |

## Acceptance Criteria

- [ ] `ElementRef` has zero source hits in `src/renderer`, `bindRef(` has zero source hits, and
  `syncCallerRef`/`appliedCallerRef`/`callerRefCleanup` have zero source hits.
- [ ] No UIKit component prop contract contains `ref?:`; the unrelated automation
  `ref?: string` remains documented and unchanged.
- [ ] All 16 executable `onModel` invocations are accounted for: synchronous sites are removed,
  `GridBodyView`'s three deferred states remain, and VirtualFlex uses its owned capability getter.
  The former comment is updated rather than counted as a site.
- [ ] ListBox, Tree, FileList, TreeProvider, and ImageViewport direct consumers retain access to
  the same model instances through owned child getters; model behavior and disposal are unchanged.
- [ ] Autocomplete, MultiSelect, PathInput, and Select still expose their actual input elements
  to their hosts through direct view access, with no generic callback/object ref contract.
- [ ] Popover's portalled root still registers/unregisters with `overlayRegistry`, using a narrow
  semantic callback rather than `ElementRef`/`bindRef`.
- [ ] Tree-provider children are disposed before model-driver disposal, and the former
  `onModel(null)`-last constraint is preserved as explicit owner ordering.
- [ ] `headerRef` remains functional for secondary-view headers; no holder is attributed to it.
- [ ] Virtualized row re-points, the two relevant `DepsGate`s, existing model bindings, Popover
  content ownership, and `applyRestProps` timing are unchanged.
- [ ] No equality gate, fresh-array selector, timer/microtask deferral, new invariant throw,
  `memo()` change, R4/R5/R8 fix, unit test, test harness, or commit is introduced.
- [ ] Manual real-surface verification below is walked and any unavailable item is recorded before
  task close.

## Manual verification checklist

- [ ] File search, Category search, Tree Provider search, Browser URL search, Graph search, and
  Menu search: focus, type, clear, Escape, blur, and refocus after updates.
- [ ] Select: Script panel, settings, graph expansion, link dialog, log selection, MCP inspector,
  and Mneme mode: input access, filtering, active-row keyboard navigation, open/close, and
  disabled/read-only states.
- [ ] MultiSelect and Autocomplete: search/filter, selection, suggestion activation, REST key/value
  editing, branch close/reopen, and host access to the input element.
- [ ] Popover consumers: app popup menu overlay suppression/unregistration, PathInput, Select,
  MultiSelect, Autocomplete, browser URL suggestions, grid column/CSV popovers, and other real
  editor popovers; verify outside click, Escape, placement, resize, and portal cleanup.
- [ ] Tree Provider and Tree consumers: Explorer, Archive, Script Library, MenuBar, and Tree story;
  verify expand/collapse, reveal, search replacement, refresh, and disposal/reopen.
- [ ] Grid: open a grid editor, wait for materialization, use columns/options/focus actions, hide
  and re-show the content host, update the parent callback path, and confirm the live instance is
  released without a stale command target.
- [ ] Notebook and Log: scroll, append/update rows, resize measured content, focus/scroll commands,
  leave and re-enter the grid branch, and verify no pending paint or scroll is lost.
- [ ] Image, SVG, and Mermaid: load/replace/clear content, zoom/fit, copy, toolbar actions, and
  branch disposal; verify the active viewport model is current and cleared when absent.
- [ ] Secondary-view stack: open, collapse, switch, remove, and recreate panels; verify header title,
  icon, actions, and show-main controls remain attached to the current header.
- [ ] Run typecheck, lint, production build, and the existing real-surface smoke checks. Do not add
  unit tests or a test harness.

## Files that need NO changes in this task

| File / area | Reason |
|---|---|
| `src/renderer/uikit/shared/vanilla-view.ts` | Its no-equality-gate update and child-first disposal contracts are constraints, not targets. |
| `src/renderer/core/state/state.ts` | Selector comparison and synchronous dispatch are unrelated to ref-channel removal. |
| `src/renderer/uikit/shared/deps-gate.ts` | Existing gates remain required; this task removes none. |
| `src/renderer/uikit/VirtualGrid/VirtualGridModel.ts` | The engine's async geometry and pending-scroll behavior are not ref channels. |
| `src/renderer/uikit/DataGrid/DataGridView.ts` | Its `onGrid` lifecycle callback is the lower-level deferred source that justifies keeping GridBody's `onModel`. |
| `src/renderer/automation/input.ts` and `src/renderer/automation/ref.ts` | String CDP refs are an unrelated automation addressing API. |
| `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStackView.ts` | `headerRef` is a legitimate deferred header channel; preserve it. |
| `src/renderer/ui/secondary-views/SecondaryViewsView.ts` | Header record ownership and closure are valid; no holder fix is needed. |
| `src/renderer/uikit/Autocomplete/AutocompleteModel.ts`, `MultiSelectModel.ts`, `SelectModel.ts`, `PathInputModel.ts` | Their model state/logic is not the generic ref channel; only their view input handoffs are in scope. |
| `src/renderer/theme/icons.ts` beyond `NativeSVGProps.ref` removal | Preserve SVG construction, style, title, and attribute behavior. |
| `src/renderer/uikit/shared/dom-props.ts` beyond `ElementRef`/`bindRef` | `NativeHTMLAttributes`, `applyRestProps`, and rest-listener bookkeeping belong to US-1206/Epic C. |

## Files Changed summary

| File / area | Planned change |
|---|---|
| `src/renderer/uikit/shared/dom-props.ts` | Remove only `ElementRef` and `bindRef`; leave native attributes and rest-props machinery intact. |
| UIKit ref-bearing contracts and views: `Button`, `IconButton`, `Input`, `DateInput`, `Dialog`, `DialogContent`, `Notification`, `ListBox`, `Tree`, `SelectableRow`, `Menu`, `Popover`, `Select`, `MultiSelect`, `Autocomplete`, `PathInput` | Remove generic ref props/binders; add direct getters where needed; narrow Popover to `onFloatingRoot`. |
| `src/renderer/theme/icons.ts` | Remove the dead `NativeSVGProps.ref` member and its destructuring-only discard. |
| `src/renderer/components/file-list/FileList.ts`, `FileListView.ts` | Remove FileList model publication and expose the owned model/input directly. |
| `src/renderer/components/tree-provider/TreeProviderViewModel.ts`, `TreeProviderViewImpl.ts` | Remove synchronous model publication and direct Tree handoff; preserve child-first disposal ordering. |
| `src/renderer/ui/sidebar/RecentFileListView.ts`, `MenuBarView.ts`, `ScriptLibraryPanelView.ts` | Replace model callback consumers with owned view getters and explicit owner cleanup. |
| `src/renderer/editors/archive/ArchiveSecondaryView.ts`, `ArchiveEditorView.ts`, `explorer/ExplorerSecondaryView.ts` | Replace TreeProvider model callback consumers with direct child model access. |
| `src/renderer/uikit/VirtualGrid/VirtualFlexGridView.ts`, `src/renderer/editors/notebook/NotebookBodyView.ts`, `src/renderer/editors/log-view/LogBodyView.ts` | Replace VirtualFlex publication with an owned capability getter; preserve measurement/scroll lifecycle. |
| `src/renderer/uikit/ImageViewport/ImageViewport.ts`, `ImageViewportView.ts`, `src/renderer/editors/image/ImageView.ts`, `editors/svg/*`, `editors/mermaid/*` | Remove synchronous ImageViewport model publication and use owned viewport access across branch lifetimes. |
| `src/renderer/editors/browser/UrlSuggestionsDropdown.ts`, `src/renderer/uikit/Tree/Tree.story.ts`, `uikit/VirtualGrid/VirtualGrid.story.ts` | Replace direct model callback consumers with owned view getters. |
| `src/renderer/ui/dialogs/poppers/showPopupMenu.ts` | Adapt the one portalled-root consumer to the semantic Popover callback. |
| `src/renderer/components/file-search/FileSearchView.ts`, `components/tree-provider/CategoryViewImpl.ts`, `editors/browser/BrowserView.ts`, `editors/graph/GraphBodyView.ts` | Replace input callback refs with retained InputView getters/direct assignments. |
| `doc/active-work.md` | Link the open US-1204 entry to this task document and leave it `[ ]` under EPIC-076. |
| `doc/tasks/US-1204-ref-channels/README.md` | This source-verified scope, classification, plan, risks, and manual checklist. |

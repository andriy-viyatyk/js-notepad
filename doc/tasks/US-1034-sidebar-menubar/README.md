# US-1034: ui/sidebar and MenuBar

Status: Planned

Epic: EPIC-058: De-React Epic D — Shell and shared components

Scope: Investigation and implementation plan only. The dashboard and epic task table are
intentionally not changed by this task-document pass.

## Goal

Convert src/renderer/ui/sidebar/ to native views behind unchanged React-facing faces wherever
React callers remain, remove all four Emotion importers from the unit, and preserve selection,
focus, keyboard, context-menu, splitter, and drag/drop behavior.

This remains one task document with two separately committed, reviewable slices: shared Tools &
Editors surfaces first, then the MenuBar shell and its folder/content panels. Each commit must
leave the tree building and the app working. Slice A must not depend on anything in Slice B. The
13-file/2,110-line unit is too broad to review safely as one change, and MenuBar.tsx is a separate
high-risk interaction boundary from the externally reused Tools & Editors surfaces. The shared
ListBox decision below is resolved here because it spans both slices.

## Background

### Epic constraints and sibling pattern

EPIC-058 D6 requires zero Emotion importers in this unit. D9 keeps src/renderer/ui/app/ React until
US-1036, so MainPage.tsx:277-280 must continue to render MenuBar with open and onClose. D10 says
the native equivalent must use the existing Panel attribute machinery; it does not authorize
replacing a Panel with an unmarked flex div. Epic concern 1 identifies MenuBar.tsx as a
masked-defect risk because missed pointer, drag, focus, or keyboard wiring can appear to repair
itself on the next interaction.

US-1033 is the direct precedent: a thin React face calls mountVanilla with a module-scope view
constructor, while native code owns DOM, state subscriptions, stable child records, and explicit
disposal. mount.tsx:75-84 mounts once for a stable constructor and calls view.update(props) for new
props identities. VanillaView.update assigns this.props before onUpdate at
uikit/shared/vanilla-view.ts:71-80. The implementation must therefore reconcile retained child
views on every update instead of rebuilding them on each React render or splitter event.

The reusable infrastructure is already present and must not be modified:

- VanillaView supplies child, own, bind, listen, and lifecycle disposal.
- mountVanilla is the React-to-native boundary required by the still-React MainPage.
- fillSlot owns native/React/text transitions. Callers must not run a prior cleanup before the next
  call (fill-slot.ts:74-82). Its non-React path always replaceChildren and append, so passing the
  same live Node again detaches and reattaches it (fill-slot.ts:125-140).
- KeyedList reconciles stable keys and runs removal callbacks before detachment.
- createPanelElement/applyPanelAttributes, createTextElement/applyTextAttributes, and
  createIconElement are the existing native styling and icon seams. A React-valued IconRef must
  remain a React element or pass through fillSlot; only an IconName can use createIconElement.

### Dependency graph and external callers

The dependency graph inside the unit is:

~~~text
MenuBar
├─ FolderItem
├─ OpenTabsList
├─ RecentFileList
├─ ToolsEditorsPanel
│  ├─ PinnedRail ── tools-editors-registry, pinned-items
│  ├─ BuiltinEditorsList ── PinnedRail, tools-editors-registry, pinned-items
│  ├─ TrustedBoardsList ── pinned-items
│  └─ TrustedToolsList
└─ ScriptLibraryPanel
~~~

The unit leaves are FolderItem, OpenTabsList, RecentFileList, ScriptLibraryPanel, and
TrustedToolsList. PinnedRail is shared by BuiltinEditorsList and ToolsEditorsPanel and is also used
outside the unit. tools-editors-registry.ts is data/action code rather than a view;
pinned-items.ts owns persisted pin encoding and the React convenience hook.

Verified callers outside ui/sidebar:

| Unit export | External caller and contract | Treatment |
|---|---|---|
| MenuBar | ui/app/MainPage.tsx:24,277-280 | Keep open?: boolean and onClose?: () => void; face delegates to MenuBarView. |
| PinnedRail | editors/tools-hub/ToolsHubView.tsx:2,47, with layout="vertical" and no close callback | Keep exact props and React face. |
| BuiltinEditorsList | editors/tools-hub/ToolsHubView.tsx:3,37 | Keep no-required-props React face. |
| TrustedBoardsList | editors/tools-hub/ToolsHubView.tsx:4,39 | Keep onClose?. |
| TrustedToolsList | editors/tools-hub/ToolsHubView.tsx:5,43 | Keep onClose?. |
| tools-editors-registry | ui/tabs/PageTabs.tsx:15,140-163 and sidebar lists | Preserve CreatableItem, IDs, labels, categories, actions, and icon values. |
| pinned-items | ui/tabs/PageTabs.tsx:16,138-164; api/board-install.ts; api/boards.ts; editors/explorer/BoardsSecondaryView.tsx; editors/board-info/BoardInfoEditorModel.ts | Preserve stored strings, board: encoding, and exported pin operations. |

No external caller was found for FolderItem, OpenTabsList, RecentFileList, ScriptLibraryPanel, or
ToolsEditorsPanel. Their internal implementation can move to native views, while existing barrel
exports may remain as thin compatibility faces where that costs nothing. ui/sidebar/index.ts has no
external import found in src/.

### Shared ListBox renderItem decision

The current ListBox custom-row hatch cannot produce a native row. ListBox/types.ts:123 types
renderItem as React.ReactNode, and ListBoxView.ts:345-357 wraps every custom result in a keyed
React Fragment before passing it to fillSlot. Thus both current consumers create a React root per
visible custom row:

- MenuBar.tsx:536-548 uses renderItem for FolderItem while also relying on ListBox selectionStyle
  focus, rowHeight 22, isSelected, onChange, getContextMenu, and onContextMenu. The current props
  leave keyboardNav at its default false, but the list still owns focus-selection behavior,
  context-menu dispatch, row virtualization, and the root event surface.
- BuiltinEditorsList.tsx:87-99 uses renderItem for UnpinnedRow. ListBox still owns the traited
  item projection, rowHeight 28, whiteSpaceY 8, onChange, and section handling; the current
  unpinned input has no section markers, but renderItem explicitly returns null for a section.

The decision for both lists is option (a): make the narrow, additive US-1016-style UIKit extension.
Do not choose a MenuBar-owned list host (option b), because it would reimplement ListBox's
selection, focus-selection styling, context-menu dispatch, keyboard/root event behavior, and
virtualization for FolderItem; the same duplication would be needed for BuiltinEditorsList.
Do not defer either list (option c): that would leave an unrecorded React row island in a task whose
purpose is to eliminate these consumers.

This follows the settled programme position in
uikit/MultiListBox/MultiListBoxView.ts:23-31: “No row renderer.” MultiListBox uses ordinary
ListItems and adds the needed checkbox capability to ListItem rather than widening ListBox's
renderItem hatch. US-1034 applies the same rule: add only the native fields these two immediate
consumers need, and eliminate both renderItem consumers.

The authorized UIKit change is minimal and source-compatible:

- Add an optional rowClass?: string class hook, native trailingElement?: Node, and native row drag
  props to the item/ListItem path. ListBox must pass those fields through its ordinary itemProps
  path.
- ListItemView must retain data-type="list-item", apply the requested rowClass, place
  trailingElement without a React root, and install/update the drag listeners with native
  DataTransfer access and disposal.
- Keep the shared ListItem.css unchanged; FolderItem.css and PinnedRail.css style the app-owned
  class hooks while retaining their app-specific appearance and hooks. Overriding data-type
  detaches a row from every rule in ListItem.css.

Folder rows will therefore be ordinary ListItems with rowClass="folder-item", the retained
data-type="list-item", iconElement, trailingElement for the selected arrow, and the existing
MenuFolder drag handlers. Built-in rows will be ordinary ListItems with rowClass="tools-editor-row",
the retained data-type="list-item", iconElement or a React-valued icon slot as required,
trailingElement for the pin button, and section=true for any future marker.
ListBox remains the owner of selection, context menus, focus behavior, and virtualization. No React
row island survives for either list; the only named React compatibility arms in Slice A remain the
editor-owned BoardsTree and ToolsTree.

### MenuBar.tsx — exhaustive interaction inventory

MenuBar.tsx is 583 lines. Its state and behavior are split between MenuBarModel and the React face:

| Evidence | Behavior that must survive |
|---|---|
| :115-128 | Initial state is leftItemId open-tabs, contentWidth 600, isAnimating false; model stores content element, FileListModel, TreeProviderViewModel, per-folder expansion state, and per-folder FileTreeProvider instances. |
| :130-145 | Ref/model setters are used by child views; getProvider caches by folder ID and replaces a provider when its source path changes; allFolders is static folders plus menuFolders.state.folders. |
| :148-160 | Open effect builds the current tree, schedules isAnimating=true after 10ms, focuses content, clears the timer on dependency change, and sets animation false when closed. |
| :162-173 | A removed dynamic folder invalidating the selected ID queues a microtask, checks isLive, and selects the first static folder. The deferred write must not happen during state/render evaluation. |
| :175-189 | Content click stops bubbling to the backdrop. Content keydown closes on Escape; Ctrl+F, except in Open Tabs, prevents the browser action and calls both tree and file-list search models. |
| :191-209 | Open File closes then opens the dialog; New Window closes then calls api.openNewWindow; Settings and About navigate and close with their current ordering. |
| :211-251 | Folder selection writes leftItemId; folder labels/icons/tooltips map static IDs, paths, settings, ScriptLibraryIcon, FolderIcon, and EmptyIcon. |
| :253-264 | Script-library folder change opens the folder dialog and persists the first result; unlink clears script-library.path. |
| :266-343 | Context menus: Open Tabs has none; Recent Files clears recent; Script Library offers change/open/unlink; dynamic folders offer open in tab, remove, Explorer, and a dynamically imported terminal action. Every item carries its existing icon and callback. |
| :345-363 | Add Folder opens a folder dialog, derives the display name with fpBasename, adds it to menuFolders; open-in-tab resolves the script-library path specially, adds a navigation page, and closes. |
| :365-376 | Background context menu uses ContextMenuEvent.fromNativeEvent only when a native context-menu event is not already attached, then adds Add Folder. |
| :378-383 | Splitter writes contentWidth on every controlled change. |
| :385-425 | React subscribes to model state, menu-folder state, and app.window.state; a post-commit effect consumes menuBarPanelId and selects the matching folder; folder items are traited with LIST_ITEM_KEY; FolderItem receives selected/icon/label/tooltip, open-in-tab callbacks, and static-folder drag/drop gates. |
| :428-469 | Right content switches between Open Tabs, Recent Files, Tools & Editors, Script Library, or a cached TreeProviderView; file clicks open raw links and close. Script library and dynamic trees retain expansion state and child model callbacks. |
| :471-583 | Backdrop click closes; content is focusable with tabIndex 0, stops click propagation, handles keydown, has controlled inline width, contains four Panels, and owns a vertical Splitter. Root classes menu-bar-backdrop, open, and doDisplay drive visibility and the 50ms slide-in. |

There is no useRef in the MenuBar function and no submenu or popup owned by this file. Its popup
interaction is the existing ContextMenuEvent route; the file has no createPortal,
react-dom/server, or @floating-ui/react usage. The only direct pointer-like handler is the
backdrop/content click pair; drag handlers live in FolderItem and PinnedRail, while splitter
pointer handling is already owned by SplitterView.

### Drag-and-drop contract

The architecture contract in doc/architecture/trait-system.md:136-179,301-365,461-475 is native
HTML5 DnD. setTraitDragData writes JSON { typeId, data } under MIME
application/persephone-trait and sets effectAllowed="move"; hasTraitDragData checks only
dataTransfer.types during enter/over; getTraitDragData reads the payload at drop.

The unit has two participants:

1. FolderItem.tsx:122-180,197-230 is a MenuFolder source and target. It sets { id: folder.id },
   stops source propagation, tracks isDragging, uses a nested-child dragEnterCount, accepts only
   trait data when canDrop, sets dropEffect="move", resets the counter on drop, and calls
   menuFolders.move(sourceId, targetId) only for a different MenuFolder. Its selected arrow click
   stops propagation before calling the open-in-tab callback.
2. PinnedRail.tsx:23-138,142-200 is a PinnedEditor live-reorder source/target. The module-level
   draggingPinnedIndex is updated on every dragover; movePin(drag, hover) persists the new order
   immediately, and dragend resets the sentinel and visual flags. It intentionally uses the simple
   no-counter pattern documented for rows without nested drop targets.

Native views must install equivalent DragEvent listeners through VanillaView.listen, preserve
draggable="true" (an enumerated HTML attribute, not a bare boolean attribute), write the same
data-dragging/data-drag-over presence attributes, and dispose listeners with the view. Do not
invent a second DnD MIME or registry. MenuFolder and PinnedEditor are discriminator-only
TraitTypeId values; no TraitSet lookup is required.

### Emotion inventory and static CSS feasibility

The four verified Emotion importers are all statically expressible in an @layer app stylesheet;
none interpolates a runtime prop value. Runtime layout state such as MenuBar width remains an
inline style owned by the native view, not CSS.

| File and declaration | Current behavior | Static replacement |
|---|---|---|
| MenuBar.tsx:55-83, MenuBarRoot | Absolute full-screen transparent backdrop, hidden by default, doDisplay display, open/content transform, dark content surface, border/radii, max-width, overflow and transition | MenuBar.css, scoped to menu-bar-backdrop/menu-bar-content in @layer app with theme variables. |
| PinnedRail.tsx:28-59, RowStyled | Row layout, hover, drag opacity/border, icon/label/button slots | PinnedRail.css scoped to .tools-editor-row/.tools-board-row; keep direct icon and hover selectors. |
| PinnedRail.tsx:61-91, PinnedRegion/SectionHeader/PinnedScroll | Horizontal/vertical region behavior is selected by data-layout; scroll and header are fixed | PinnedRail.css with static data-layout selectors. |
| FolderItem.tsx:12-95, Root | Selection/focus fragments, drag states, direct SVG sizing, label truncation, selected arrow and hover affordance | FolderItem.css in @layer app; preserve the .folder-item class hook and exact data-focus-selection selectors. |
| ToolsEditorsPanel.tsx:26-51, four styled roots | Fixed flex column, header, tabs, and body layout | ToolsEditorsPanel.css keyed to data-type="tools-editors-panel" and named parts/classes. |

The stylesheet convention is established by ui/secondary-views/SideBarPanelHeader.css:1-31 and
converted components stylesheets. No hardcoded color may be introduced; imported color values must
map to existing theme custom properties.

### Panel and attribute-keyed CSS inventory

There are eight Panel call sites in the unit:

| Site | Current attributes | Required preservation |
|---|---|---|
| MenuBar.tsx:490-497 | menubar-categories, column, flex 1 1 40%, minWidth 0, padding xs, borderRight | Use createPanelElement/applyPanelAttributes; retain panel-root, data-type="panel", data-name, data-direction="column", data-border-right, and equivalent inline values. |
| MenuBar.tsx:498-534 | menubar-toolbar, row, gap, bottom padding | Preserve panel-root, data-name, data-direction="row", and resolved inline gap/padding. |
| MenuBar.tsx:549-559 | menubar-add-folder, centered, top padding | Preserve panel-root, data-name, default row direction, and inline justify/padding. |
| MenuBar.tsx:561-569 | menubar-content, column, flex 1 1 60%, minWidth 0, right padding | Preserve panel-root, data-name, data-direction="column", and inline flex/min-width/padding. |
| ScriptLibraryPanel.tsx:36-40 | Outer setup arm, column, height 100%, data-type="script-library-panel" | Panel.tsx:124-147 spreads data-type after generated Panel attributes, so this custom value overrides data-type="panel"; native code must reapply it after applying Panel attributes while retaining panel-root and direction. |
| ScriptLibraryPanel.tsx:42-62 | Setup pane, column, centered, gap, padding, flex | Preserve panel-root, direction, and all resolved inline layout values. |
| ScriptLibraryPanel.tsx:68-82 | Populated outer arm, column, height 100%, custom data-type="script-library-panel" | Same override rule as the setup arm; do not silently change it to data-type="panel". |
| TrustedBoardsList.tsx:105-113 | board-trailing, row, centered, gap | Preserve panel-root, data-name, row direction, and inline alignment/gap. This remains in the React compatibility arm if editor-owned BoardsTree remains React. |

Panel.css keys layout to panel-root and data-direction, data-bg, border, and other data attributes
(uikit/Panel/Panel.css:1-80). panel-root and scroll-container are not decorative: other UIKit CSS
uses them for flex sizing and scroll behavior. The unit must retain data-part hosts emitted by
existing native children. The special click-through rule at
uikit/CollapsiblePanelStack/CollapsiblePanelStack.css:51-62 is not reached by these MenuBar Panels,
but it is the reason not to generalize plain-div replacements for future sidebar header work.
Panel.tsx:146 applies style after the caller rest spread at :145, so a caller can override
className through rest but cannot override the resolved Panel style. Native equivalents must
preserve both facts: keep the class/data hooks from Panel resolution and keep resolved inline style
last.

### Registry, portal, and forbidden-usage findings

tools-editors-registry.ts is not React-free: line 1 imports React and lines 43-201 create React
elements for icons, including runtime-colored browser/profile and memory icons. It is not a
published editor-implementer registry like secondary-view-registry.ts; no file under
src/renderer/editors/ imports it. Its data/actions are consumed by sidebar lists and
ui/tabs/PageTabs.tsx, so preserve IDs, ordering, action callbacks, categories, and the
React-valued icon contract. Native consumers must route those icons through fillSlot unless an
IconName/DOM builder is available.

pinned-items.ts is also not React-free: line 1 imports useMemo and lines 272-276 export
usePinnedRefs. Its non-hook functions form a persisted settings contract used by APIs and editor
code. Keep the pinned-editors key, board: prefix, default IDs, and operation semantics unchanged.
The hook is a React convenience, not an editor registry contract; native views should bind settings
state directly, while existing React faces may continue using the hook.

There are no createPortal, react-dom/server, or @floating-ui/react usages under ui/sidebar/.
Context menus remain ContextMenuEvent-based. Editor-owned BoardsTree and ToolsTree are React
components (editors/board/BoardsTree.tsx:38-99 and editors/tools/ToolsTree.tsx:35-89) and must be
mounted as explicit React compatibility slots if the shared native surface reaches them; neither
editor file is in scope.

## Implementation Plan

### Slice A — shared Tools & Editors surfaces

This slice is the first review boundary and must be independently smoke-testable from
ToolsHubView.

1. Add native view classes for PinnedRail, BuiltinEditorsList, TrustedBoardsList, and
   TrustedToolsList, with thin React faces at their existing exports. Remove Emotion from
   PinnedRail.tsx; add PinnedRail.css, BuiltinEditorsListView.ts, and native row/slot code. Keep
   RowStyled DOM hooks: tools-editor-row/tools-board-row classes, data-dragging, data-drag-over, item-icon, item-label, and
   pin-button-wrapper.
2. In the native pinned view, bind settings for browser profiles and pin state, resolve
   getCreatableItems, preserve stale-pin filtering, and use stable decoded refs as keys. Use
   createIconElement only for known IconNames; pass React-valued registry icons and BoardGlyph
   through stable slot hosts. Preserve item.create, board-link opening, close callbacks, unpin
   behavior, and movePin persistence.
3. Reproduce PinnedRail.tsx:95-137 with native DragEvents and VanillaView.listen. Update the
   module-level drag index exactly as onDragOver does, set the trait MIME using setTraitDragData,
   accept only hasTraitDragData, and clean up drag flags on dragend/drop/disposal.
4. Preserve BuiltinEditorsList's traited item projection, section markers, unpinned filtering, pin
   action stop-propagation, row height 28, and empty/section behavior using the ordinary
   ListBox/ListItem path from the shared decision above. Pass native rowClass="tools-editor-row",
   iconElement or fillSlot-compatible icon, and trailingElement for the pin button; do not use
   renderItem.
5. Keep TrustedBoardsList and TrustedToolsList's current loads, reactive projections,
   open/remove/pin actions, context-menu contents, update badge, and empty text. Since BoardsTree
   and ToolsTree remain React editor components, mount those exact trees in a fillSlot React
   compatibility arm owned by the native wrapper; reuse the same React root on updates and never
   pre-run saved cleanup. Dispose the slot only when the list is removed.
6. Add ToolsEditorsPanelView.ts and ToolsEditorsPanel.css. Replace local React tab state with
   native state, reuse IconButtonView and SegmentedControlView, mount PinnedRailView and
   BuiltinEditorsListView directly, and use retained React compatibility arms for the two editor
   tree lists. Preserve tab-to-hub mapping, open-in-new-tab action, close callback,
   data-type="tools-editors-panel", and all three tab labels.

Before:

~~~tsx
const [tab, setTab] = useState<PanelTab>("editors");
return <PanelRoot data-type="tools-editors-panel">...</PanelRoot>;
~~~

After:

~~~tsx
export function ToolsEditorsPanel(props: ToolsEditorsPanelProps): React.ReactElement {
    return mountVanilla(ToolsEditorsPanelView, props);
}
~~~

### Slice B — MenuBar shell and folder/content panels

   7. Add FolderItemView.ts as the single native behavior/descriptor adapter used by MenuBarView to
   create ordinary ListBox item records. It owns the folder-specific rowClass="folder-item",
   retained data-type="list-item", selected-arrow trailing element, tooltip value, and MenuFolder
   drag callbacks; the row itself is still the ordinary ListItem created by ListBoxView. Preserve selected/active/drag attributes, exact
   focus-selection selectors, tooltip attachment, selected-arrow stop-propagation, and the current
   nested-child drag-enter counter. Do not use a React custom row renderer or add a MenuBar-owned
   replacement for ListBox virtualization and selection.
8. Reproduce FolderItem.tsx:126-180 with native listeners and existing trait helpers. On drop,
   parse with getTraitDragData, require TraitTypeId.MenuFolder, reject self-drops, and call only
   menuFolders.move. Keep draggable as the string value "true" when enabled.
9. Add native views or thin faces for OpenTabsList, RecentFileList, and ScriptLibraryPanel.
   Preserve model callbacks and async guards. Reuse ListBoxView, FileListView, and
   TreeProviderView directly rather than reimplementing list, file-search, or tree engines. Keep
   recent-file loading, open/close actions, all context-menu entries, script-library setup dialog
   import, provider identity keyed by library path, expansion-state callbacks, and the custom
   Script Library Panel data-type override.
10. Add MenuBarView.ts and MenuBar.css. Move MenuBarModel responsibilities into the native
    lifecycle without changing semantics: bind menuFolders.state, app.window.state, and relevant
    child models; preserve the open effect's 10ms animation timer/focus and deferred invalid-folder
    correction; cache providers and expansion state by folder ID.
11. Build the root with exact current DOM hooks: menu-bar-backdrop, data-name="menu-bar",
    menu-bar-content, data-name="menu-bar-content", focusability, controlled width, and four
    Panel-equivalent children. Use createPanelElement/applyPanelAttributes for Panel layout and
    explicitly restore custom data-type overrides. Reuse SplitterView with the same controlled
    value, vertical orientation, side, border, colors, and callback.
12. Keep the public MenuBar face at the current import path and preserve its controlled behavior:

Before:

~~~tsx
export function MenuBar(props: MenuBarProps) {
    const model = useComponentModel(props, MenuBarModel, defaultMenuBarState);
    // React subscriptions and JSX composition...
}
~~~

After:

~~~tsx
export function MenuBar(props: MenuBarProps): React.ReactElement {
    return mountVanilla(MenuBarView, props);
}
~~~

13. In MenuBarView, preserve backdrop close versus content stop-propagation, Escape/Ctrl+F
    handling, menuBarPanelId consumption, folder context-menu construction, dynamic terminal
    import, file click close behavior, and right-panel switching. Context-menu icons remain
    React-valued MenuItem content where the existing Menu path requires them; route them through
    its existing slot behavior rather than inventing a popup or portal.
14. Preserve existing order and identity of retained children. On updates caused by menu-folder
    changes, app-window state, child model callbacks, or splitter drags, update existing native
    children in place. Do not recreate TreeProviderView, FileListView, provider instances, or React
    compatibility slots merely because a new props object reached mountVanilla.

### CSS, contracts, and verification

15. Add only @layer app stylesheets for the four former Emotion declarations. Translate imported
    colors to theme custom properties, preserve selector order and specificity, and verify
    data-focus-selection, the .folder-item class with data-type="list-item", data-layout, drag attributes, panel-root,
    data-part, data-name, and scroll-container in the resulting DOM.

Before:

~~~tsx
const Root = styled.div({
    "&[data-selected]": { backgroundColor: color.background.light },
});
~~~

After:

~~~css
@layer app {
    .folder-item[data-selected] {
        background: var(--color-bg-light);
    }
}
~~~

16. Do not change MainPage.tsx, ToolsHubView.tsx, PageTabs, API pin consumers, or editor tree
    consumers. The only UIKit change is the authorized additive ListBox/ListItem support described
    in the shared decision; do not add any other UIKit infrastructure or widen renderItem. Existing
    editor-owned BoardsTree/ToolsTree React slots are the only compatibility arms required by this
    unit.
17. Run npm run typecheck, npm run lint, npm run build-prod, and git diff --check. Split verification
    into scriptable checks and human-only checks. Scripts may verify native DOM shape, data-type and
    data-part/data-name attributes, CSS classes, computed styles, programmatic click state changes,
    context-menu payload construction, provider/list identity, and post-update retention. A human
    at the machine must verify first-open focus, the 10ms slide/focus timing, Escape and Ctrl+F
    routing to both tree and file-list search, real drag/drop and reorder, and SplitterView pointer
    capture; synthetic pointer/keyboard events cannot establish those behaviors reliably. Smoke
    both slices through the running app for static/dynamic folder actions, script-library setup and
    populated states, open/recent tabs, Tools & Editors tabs, stale pins, trusted-board/tool
    loading, update badge, and hub entry points. Record the EPIC-058 Rule 4 measurement or its
    concrete pending reason.

## Concerns

### 1. Two separately committed slices are a task constraint

The unit contains 2,110 lines, four external ToolsHub faces, and a 583-line MenuBar with a
different interaction profile. Slice A is exactly the externally consumed Tools & Editors surface,
is independently smoke-testable from ToolsHub, and must not depend on Slice B. Slice B consumes
Slice A's native panel and focuses review on MenuBar's folder, focus, keyboard, context-menu, and
splitter behavior. Commit each slice separately; each commit must build the tree and leave the app
working. This is one US-1034 document and does not create a second task ID.

### 2. The supplied React-free helper assumption is false

The source evidence is tools-editors-registry.ts:1,43-201 and pinned-items.ts:1,272-276. This plan
treats both as compatibility/data contracts, not as permission to rewrite IDs or persisted settings.
Native views consume React-valued icons through fillSlot; existing React callers keep their hook and
icon shapes. A later helper cleanup may split the hook or introduce DOM-backed icon descriptors, but
it is not needed to remove Emotion or convert the view render loops here.

### 3. Editor-owned Trees are deliberate React compatibility arms

BoardsTree and ToolsTree still render React TreeItem rows and are owned by editor folders. Changing
them here would violate the unit boundary and create unreviewed Epic E work. The native sidebar
wrapper must mount them as stable React slots, reuse roots on ordinary state updates, and dispose
them only when their tab/list is removed. A future Epic E conversion can replace those slots with
native tree views without changing sidebar public props.

### 4. PinnedRail's module-level drag index is a pre-existing shared-state hazard

PinnedRail.tsx:23-24 stores draggingPinnedIndex at module scope. ToolsHubView.tsx:47 can mount a
vertical PinnedRail while ToolsEditorsPanel mounts a horizontal one, so two instances can be live
at once and share that sentinel. The conversion must preserve this behavior exactly and must not
silently change it to per-instance state. A per-instance drag-index fix is a separate decision and
task; this task records the hazard only.

### 4a. Mutable per-row records must not be read after a synchronous store write

**Found in Slice A implementation, live.** `PinnedRailView.onDragOver` originally did:

```ts
movePin(draggingPinnedIndex, record.rowData.index);
draggingPinnedIndex = record.rowData.index;   // <-- already stale
```

`movePin` (`pinned-items.ts:63-68`) writes settings, which notifies synchronously, which re-runs
`refresh()` and `updateRow`, which replaces `record.rowData`. So the second read returns the hovered
item's **post-move** index rather than the position the dragged item was moved to. Dragging the last
pin over the first made the first two rows swap 3-4 times per second, forever.

The React original was immune for a reason that does not survive conversion: `index` was a value
captured in a per-render handler closure, so it could be read either side of the move. A vanilla
view's per-row record is **mutable and shared with the sync path**.

The rule for the rest of this epic: in any handler that calls a store mutation, capture every value
you need from a record **before** the mutation. Grep pattern to check — a `record.`/`rowData.` read
appearing after a `move*`/`add*`/`remove*`/`set*` call in the same function body.

Slice B's `FolderItem` drop has the same shape (`menuFolders.move(sourceId, targetId)`) but is immune
by construction, because it passes **ids** rather than indices. Do not let that make the rule feel
optional — index-based reorder is the case that breaks, and nothing about typecheck, lint or
build-prod detects it.

### 5. Folder row shape and the shared ListBox decision are release blockers

FolderItem CSS contains selectors specifically targeting the .folder-item class, including the
focus-selection fragments at FolderItem.tsx:42-51. The existing ListBox custom renderer supplies
that row shape, but it necessarily creates a React root per row. The resolved option is the narrow
UIKit extension: ordinary ListItem rows retain data-type="list-item" and can emit an app rowClass,
native trailing content, and native drag props while ListBox keeps selection, context menus, focus
behavior, and virtualization. Overriding data-type detaches a row from every rule in ListItem.css.
Falling back to the .folder-item class, plain divs, or a React custom renderer would either lose
the CSS contract or leave the defect class unaddressed.

### 6. React-valued icons and live Nodes need identity discipline

The registry and current JSX callers provide React icon nodes, while native icon builders only
accept IconName. Keep React-valued icons in fillSlot hosts. Do not call a saved cleanup before the
next fill, and do not repeatedly pass the same live Node through the non-React branch without
checking whether it will detach/reinsert it. This applies to registry icons, BoardGlyph, selected
folder arrows, menu icons, and editor-tree trailing actions.

### 7. Controlled update and disposal hazards

mountVanilla updates on every props identity, including width changes. Retained lists and provider
views must update in place so search text, tree expansion, active rows, and pinned drag state do
not reset. VanillaView.dispose does not remove its root; each structural owner must dispose children
before removing DOM, and each React slot must detach before deferred root disposal as specified by
fill-slot.ts.

### 8. Static CSS layer and Panel attributes are load-bearing

New CSS belongs in @layer app; using an unlayered or @layer uikit replacement would change
specificity/order behavior. Every native Panel equivalent must preserve panel-root, generated data
attributes, inline style resolution, and Script Library's custom data-type. The task must not claim
D10's global Panel-zero condition.

### 9. Ctrl+F and animation timing require human verification

MenuBar.tsx:148-160 combines a 10ms timer with focus, and :175-189 routes Escape and Ctrl+F to
two child search models. These cannot be established confidently with synthetic events. The same
limitation is already documented for SplitterView real pointer capture at SplitterView.ts:93 and
:103. Keep scriptable DOM/state checks separate from the human machine smoke pass; a pending
record must say which human checks were unavailable rather than treating synthetic dispatch as
equivalent.

## Acceptance Criteria

- [ ] This single US-1034 document describes two separately committed slices; Slice A has no
      dependency on Slice B, each commit leaves the tree building and the app working, and Slice A
      is independently smoke-testable from ToolsHub.
- [ ] MenuBar remains renderable from MainPage.tsx with unchanged open and onClose signature and
      delegates through a module-scope mountVanilla(MenuBarView, props) face.
- [ ] MenuBarView preserves initial selection/width, open animation timer, focus, deferred
      invalid-folder correction, menuBarPanelId consumption, provider/expansion caches,
      backdrop/content propagation, Escape/Ctrl+F behavior, panel switching, context menus,
      dynamic terminal import, file opening, and splitter updates.
- [ ] All retained native child views update in place across new props identities and splitter
      changes; no retained tree/file/list/provider/React slot is recreated solely because the host
      updated.
- [ ] MenuBar's folder list and BuiltinEditorsList both use ordinary ListBox/ListItem rows, not
      renderItem. The narrow additive UIKit support for app rowClass hooks, trailingElement, and
      native drag props is source-compatible; ordinary rows retain data-type="list-item" and no
      React row roots are created.
- [ ] FolderItem and PinnedRail participate in the existing native trait DnD contract with the
      same type IDs, payloads, effectAllowed/dropEffect, drag counters or sentinel index, visual
      attributes, reorder/move operations, and disposal behavior.
- [ ] The four former Emotion importers contain no @emotion import. Replacements are in @layer app,
      use theme variables, and preserve hover, focus, selected, drag, layout, orientation, and
      direct-SVG sizing behavior.
- [ ] All eight Panel sites preserve panel-root, data-name, direction/border attributes, inline
      layout values, data-part/scroll-container contracts, and both Script Library custom
      data-type="script-library-panel" overrides.
- [ ] Existing ToolsHub public faces and tools-editors-registry/pinned-items contracts are
      unchanged; pin persistence still uses pinned-editors and board:<absoluteRoot> values.
- [ ] BoardsTree and ToolsTree remain unchanged editor-owned React compatibility arms, with stable
      slot reuse and explicit disposal; no editor caller changes, and the only UIKit changes are
      the authorized additive ListBox/ListItem support described above.
- [ ] No createPortal, react-dom/server, or @floating-ui/react usage is introduced under
      ui/sidebar/.
- [ ] Running-app smoke coverage includes all MenuBar and Tools & Editors paths listed in the plan,
      including first-open focus, close/reopen, drag reorder, context menus, empty and populated
      async states, and retained state after splitter movement.
- [ ] npm run typecheck, npm run lint, npm run build-prod, and git diff --check pass; the Rule 4
      measurement is recorded or explicitly marked pending with its concrete reason.

## Files that need NO changes

The following files were verified as callers, published boundaries, or reusable infrastructure and
must remain unchanged in this task:

- doc/active-work.md and doc/epics/EPIC-058.md — dashboard and epic-table edits are reserved by
  the user.
- src/renderer/ui/app/MainPage.tsx — existing MenuBar import and props remain valid.
- src/renderer/editors/tools-hub/ToolsHubView.tsx — existing shared-surface React faces remain
  valid.
- src/renderer/ui/tabs/PageTabs.tsx, src/renderer/api/board-install.ts,
  src/renderer/api/boards.ts, src/renderer/editors/explorer/BoardsSecondaryView.tsx, and
  src/renderer/editors/board-info/BoardInfoEditorModel.ts — existing registry/pin consumers keep
  their public imports and behavior.
- src/renderer/editors/board/BoardsTree.tsx and src/renderer/editors/tools/ToolsTree.tsx —
  editor-owned React trees remain compatibility arms; no editor conversion is pulled into this
  task.
- src/renderer/uikit/shared/vanilla-view.ts, src/renderer/uikit/shared/mount.tsx,
  src/renderer/uikit/shared/fill-slot.ts, src/renderer/uikit/shared/keyed-list.ts,
  src/renderer/uikit/shared/slots.ts, src/renderer/uikit/Panel/panel-style.ts,
  src/renderer/uikit/Text/text-style.ts, and src/renderer/theme/icons.tsx — consume existing
  infrastructure; do not modify it.
- src/renderer/uikit/Splitter/, src/renderer/uikit/Menu/, and src/renderer/uikit/Tree/ — use
  existing native views and CSS; no changes are authorized.

## Files Changed summary

| File | Planned change |
|---|---|
| doc/tasks/US-1034-sidebar-menubar/README.md | This verified investigation and implementation plan. |
| src/renderer/ui/sidebar/MenuBar.tsx | Thin React-facing mountVanilla(MenuBarView, props) face; preserve open/onClose. |
| src/renderer/ui/sidebar/MenuBarView.ts | Native MenuBar host, state bindings, folder/content reconciliation, context menus, focus/keyboard handling, Panel/Splitter composition, and disposal. |
| src/renderer/ui/sidebar/MenuBar.css | @layer app replacement for MenuBarRoot. |
| src/renderer/ui/sidebar/FolderItem.tsx | Preserve export/props face or reduce it to the native compatibility shim. |
| src/renderer/ui/sidebar/FolderItemView.ts | Native folder row, tooltip, selected-arrow, MenuFolder DnD, and exact DOM attributes. |
| src/renderer/ui/sidebar/FolderItem.css | @layer app replacement for Root. |
| src/renderer/ui/sidebar/OpenTabsList.tsx / OpenTabsListView.ts | Thin face plus native list/model host preserving window/page loading and selection. |
| src/renderer/ui/sidebar/RecentFileList.tsx / RecentFileListView.ts | Thin face plus native recent-file projection and context-menu host. |
| src/renderer/ui/sidebar/ScriptLibraryPanel.tsx / ScriptLibraryPanelView.ts | Native setup/populated arms, provider/expansion callbacks, and Panel data-type preservation. |
| src/renderer/ui/sidebar/PinnedRail.tsx / PinnedRailView.ts | Thin external React face plus native pinned rows, pin actions, activation, and DnD. |
| src/renderer/ui/sidebar/PinnedRail.css | @layer app replacement for RowStyled, PinnedRegion, SectionHeader, and PinnedScroll. |
| src/renderer/ui/sidebar/BuiltinEditorsList.tsx / BuiltinEditorsListView.ts | Thin external React face plus native unpinned-item list and pin actions. |
| src/renderer/ui/sidebar/TrustedBoardsList.tsx / TrustedBoardsListView.ts | Native wrapper with stable React BoardsTree compatibility slot and unchanged trust/update/pin behavior. |
| src/renderer/ui/sidebar/TrustedToolsList.tsx / TrustedToolsListView.ts | Native wrapper with stable React ToolsTree compatibility slot and unchanged trust/remove behavior. |
| src/renderer/ui/sidebar/ToolsEditorsPanel.tsx / ToolsEditorsPanelView.ts | Native tabbed composition over shared views and retained editor-tree slots. |
| src/renderer/ui/sidebar/ToolsEditorsPanel.css | @layer app replacement for the four Emotion layout declarations. |
| src/renderer/uikit/ListBox/types.ts | Add source-compatible native rowClass, trailingElement, and row-drag item fields. |
| src/renderer/uikit/ListBox/ListItem.tsx | Expose the additive native rowClass/trailing/drag fields through the ListItem face/type. |
| src/renderer/uikit/ListBox/ListItemView.ts | Retain data-type="list-item", apply rowClass, and handle trailing/drag fields without a React row root. |
| src/renderer/uikit/ListBox/ListBoxView.ts | Pass the new item fields through the ordinary ListItem path; no renderItem widening. |

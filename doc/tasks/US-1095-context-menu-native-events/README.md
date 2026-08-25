# US-1095 — Context-menu and minimap callbacks use native events

## Goal

Retype the remaining UIKit root context-menu, minimap click, and minimap mouse-enter props to
native DOM event types. Remove the four listed toPublicEvent calls and their casts, and change
every caller in the affected prop chains in the same compilable change.

The task is implemented. It adds no tests, commit, or dashboard change.

## Background

EPIC-066 E8-11 ([epic document](../../epics/EPIC-066.md)) settles the seam rule: every mountVanilla(View, props) face receives native DOM
events, including when the face is rendered from JSX. Retype the shared prop to the native event,
delete the wrap and cast, and fix each caller's parameter type. Do not add a union, normalising
accessor, boundary adapter, or a cast asserting a native event is a React event.

The correction under EPIC-066 E8-8 is the governing task boundary: retyping a prop and fixing its
callers is one atomic change because green tsc --noEmit is a completion condition. The original
folder split is not sufficient for these chains.

### Measured scope

The current source has four direct toPublicEvent call sites in the supplied UIKit scope:

| File | Line | Current cast | Callback fed |
|---|---:|---|---|
| src/renderer/uikit/ListBox/ListBoxModel.ts | 168 | as unknown as React.MouseEvent<HTMLDivElement> | ListBoxProps.onContextMenu from onRootContextMenu |
| src/renderer/uikit/Tree/TreeModel.ts | 419 | as unknown as React.MouseEvent<HTMLDivElement> | TreeProps.onContextMenu from onRootContextMenu |
| src/renderer/uikit/Minimap/MinimapView.ts | 55 | as React.MouseEvent<HTMLDivElement> | MinimapProps.onClick |
| src/renderer/uikit/Minimap/MinimapView.ts | 63 | as React.MouseEvent<HTMLDivElement> | MinimapProps.onMouseEnter |

The source does not contain eight direct toPublicEvent call sites under src/renderer/uikit/;
it contains the four listed above. The remaining whole-renderer count is 18 direct sites after
US-1093/US-1094 when the helper definition and its compatibility-layer invocation are excluded.
This document scopes exactly the four supplied UIKit calls and separately records the Tree DnD
cast below.

### onContextMenu declaration and re-export census

#### ListBox root prop

| File and line | Role | Finding |
|---|---|---|
| src/renderer/uikit/ListBox/types.ts:78-79,137 | Canonical declaration | ListBoxProps extends React.HTMLAttributes<HTMLDivElement> and declares onContextMenu as a React mouse handler. Add the inherited name to Omit before redeclaring it as a native MouseEvent callback. |
| src/renderer/uikit/ListBox/ListBox.tsx:19-28 | Face and re-export | ListBox passes props unchanged to ListBoxView and re-exports ListBoxProps from types. |
| src/renderer/uikit/ListBox/index.ts:2-7 | Re-export | Re-exports ListBoxProps from ListBox. |
| src/renderer/uikit/index.ts:96-97 | Re-export | Re-exports ListBoxProps from ListBox. |
| src/renderer/components/file-list/FileList.tsx:17-22 | Separate public declaration in the chain | FileListProps.onContextMenu is independently declared as a React mouse handler; it is forwarded to the inner ListBoxView and must become a native MouseEvent handler. |
| src/renderer/components/file-list/FileListView.ts:13-15,121-139 | Forwarder | FileListListProps aliases ListBoxProps<FileListRow> and listProps supplies onContextMenu: props.onContextMenu at line 135. It reads no event itself. |

MultiListBoxProps, SelectProps, and AutocompleteProps inherit or use HTML/list props but do not
forward a caller's onContextMenu into an inner ListBoxProps object: their list-property builders
explicitly omit it. They are not part of this chain.

#### Tree root prop

| File and line | Role | Finding |
|---|---|---|
| src/renderer/uikit/Tree/types.ts:83-84,192-195 | Canonical declaration | TreeProps extends React.HTMLAttributes<HTMLDivElement> and declares onContextMenu as a React mouse handler. Add the inherited name to Omit and redeclare it natively. |
| src/renderer/uikit/Tree/Tree.tsx:3-23 | Face and re-export | Tree passes props unchanged to TreeView and re-exports the public types. |
| src/renderer/uikit/Tree/index.ts:2-8 | Re-export | Re-exports TreeProps from Tree. |
| src/renderer/uikit/index.ts:106-112 | Re-export | Re-exports TreeProps from Tree. |

The other TreeProps construction sites were checked. components/tree-provider/
TreeProviderViewImpl.ts:280-329 supplies onItemContextMenu at line 318, not the root
onContextMenu prop. editors/rest-client/panels/RestRequestTreeView.ts:96-117 also supplies
onItemContextMenu at line 106 and no root handler. The Git, notebook, board, and tools TreeView
constructions likewise have no onContextMenu assignment. The only live root Tree caller is the
UIKit story at Tree/Tree.story.tsx:332-340,448.

TreeProps.onItemContextMenu at Tree/types.ts:180-184 is a different prop chain. It eventually
rides the TreeItem/rest-listener compatibility path and is not retyped by this task; changing it
would violate the applyRestProps boundary below.

#### Minimap props

| File and line | Role | Finding |
|---|---|---|
| src/renderer/uikit/Minimap/Minimap.tsx:6-8 | Canonical declaration | MinimapProps inherits React onClick and onMouseEnter; add both names to Omit and redeclare them as native MouseEvent callbacks. |
| src/renderer/uikit/Minimap/Minimap.tsx:16-18 | Face | Passes props unchanged to MinimapView; this remains the React-facing mountVanilla pass-through. |
| src/renderer/uikit/Minimap/index.ts:2 | Re-export | Re-exports MinimapProps. |
| src/renderer/uikit/index.ts:12 | Re-export | Re-exports MinimapProps. |

editors/markdown/MarkdownBodyView.ts:457-464 constructs MinimapProps with only name and
scrollContainer; it supplies neither callback. The minimap story also supplies no callback. No
caller parameter edit is required.

### Caller census and event-member verification

The onContextMenu root prop has four affected caller/forwarder files. The two story callbacks
and the sidebar callback are live handler assignments; FileListView is the production forwarder.
The public FileListProps declaration is an additional declaration change, not a fifth handler
implementation.

| File and line | Prop path | Current handler/forwarder | Exact members read |
|---|---|---|---|
| src/renderer/uikit/ListBox/ListBox.story.tsx:129-137,160 | ListBoxProps.onContextMenu | onContextMenu is passed to ListBox | ContextMenuEvent.fromNativeEvent(e, generic); ctx.items.push(...). No React-only member. |
| src/renderer/ui/sidebar/MenuBarView.ts:158-172,274-290 | ListBoxProps.onContextMenu | Two ListBoxView prop objects pass an arrow to onLeftPanelContextMenu | onLeftPanelContextMenu at :440-444 reads event.nativeEvent.contextMenuEvent, calls ContextMenuEvent.fromNativeEvent(event, sidebar-background), and calls contextEvent.items.push(...). nativeEvent is React-only and must become event.contextMenuEvent after retyping the parameter. |
| src/renderer/uikit/Tree/Tree.story.tsx:332-340,448 | TreeProps.onContextMenu | onContextMenu is passed to Tree | ContextMenuEvent.fromNativeEvent(e, generic); ctx.items.push(...). No React-only member. |
| src/renderer/components/file-list/FileListView.ts:121-139 | FileListProps to ListBoxProps | onContextMenu: props.onContextMenu | No event read; direct forwarding. |

No affected handler reads persist, isPropagationStopped, or isDefaultPrevented. The only React-only
read in this prop chain is MenuBarView.onLeftPanelContextMenu's nativeEvent.

The similarly named handlers in components/tree-provider, editors/explorer,
editors/link-editor, editors/rest-client, and editors/category are not hidden callers of
TreeProps.onContextMenu. They use the separate TreeProps.onItemContextMenu,
TreeProviderViewProps.onContextMenu, CategoryItemsRendererProps.onContextMenu, or link-list
props. For example, TreeProviderViewImpl.treeProps() has onItemContextMenu at :318, while
TreeProviderViewModel.onContextMenu at :75-78 is a ContextMenuEvent callback invoked at
:835-838. Their current nativeEvent reads remain explicit work for their own prop chains; they are
not silently absorbed into this task.

### ContextMenuEvent interaction

ListBoxModel.ts:162-169 and TreeModel.ts:415-421 already receive a native MouseEvent, read the
native contextMenuEvent expando, and then call the public root handler. Retyping those public props
removes the wrap, but it does not make ContextMenuEvent.fromNativeEvent single-armed now.

core/events/context-menu.ts:42,58-66 still accepts MouseEvent or an object with nativeEvent and
selects the native event at line 62. Other live callers still pass React events, including
src/renderer/components/tree-provider/CategoryViewModel.ts:604-650,673-684,
src/renderer/components/tree-provider/TreeProviderViewModel.ts:807-854,
src/renderer/editors/browser/BrowserUrlBarModel.ts:202,
src/renderer/editors/browser/BrowserTabsPanel.tsx:263,
src/renderer/editors/link-editor/LinkItemList.tsx:76,
src/renderer/editors/link-editor/LinkItemTiles.tsx:64,
src/renderer/editors/link-editor/PinnedLinksPanel.tsx:179,
src/renderer/editors/markdown/MarkdownBlockView.ts:263, and
src/renderer/ui/tabs/PageTabView.ts:485. The two UIKit story handlers and MenuBarView handler
become native in this task. The accessor therefore remains dual-armed until the later close work
(US-1098).
This task must not modify context-menu.ts.

### Tree DnD cast classification

TreeDndModel.ts:42-56 casts a native DragEvent to React.DragEvent for the distinct
TreeProps.onDragStartOverride prop declared at Tree/types.ts:354-363. Its consumer,
TreeProviderViewImpl.ts:365-378, reads only native preventDefault() and passes the event to
api.startOsFileDrag. This cast is not in the onContextMenu prop chain and is excluded from
US-1095. It belongs with the atomic onDragStartOverride/Tree DnD prop change and its callers.

### React-compat and rest-prop boundary

The owned callbacks are removed before residual rest props are applied:

- ListBoxView.ts:452-472 removes onContextMenu before its applyRestProps call at :232.
- TreeView.ts:596-623 removes onContextMenu before its applyRestProps call at :282.
- MinimapView.ts:99-108 removes onClick and onMouseEnter before applyRestProps at :73 and :93.
- FileListView forwards the callback into ListBox; it does not pass it through applyRestProps.

No retyped callback reaches applyRestProps. Leave uikit/shared/react-compat.ts unchanged, including
applyRestProps, clearRestListeners, and bindRef. Those are E8-7 non-goals. toPublicEvent is
removed only in US-1098, not here.

### Epic F check

doc/de-react.md is still marked Proposed — not scheduled. Its Epic F section says the future
removal epic will delete React and strip the React wrapper from every converted UIKit component;
open decision 3 calls that scaffolding cleanup after the remaining editor callers are converted.
That is a pending roadmap slot, but it does not own this seam: EPIC-066 E8-11 explicitly settles
native event props during the migration, and the current mountVanilla faces already deliver native
events.

The two comments claiming the onContextMenu prop is frozen by C3-5 are historical scope notes,
not a prohibition. Both must be deleted or rewritten:

- src/renderer/uikit/ListBox/ListBoxModel.ts:164-166 cites C3-5 and says the prop is frozen.
- src/renderer/uikit/Tree/TreeModel.ts:418 says Epic F owns API cleanup.

Leaving either comment beside a native, unfrozen prop would contradict the contract.

## Implementation Plan and Result

### 1. Retype the ListBox root-context prop and its atomic callers

- In uikit/ListBox/types.ts, add onContextMenu to the inherited Omit list and declare
  onContextMenu?: (event: MouseEvent) => void.
- In uikit/ListBox/ListBoxModel.ts, remove the React and toPublicEvent imports. Pass e directly
  to this.props.onContextMenu?.(e). Delete the C3-5/frozen-prop comment and replace it with a
  short native-event explanation or no comment.
- In components/file-list/FileList.tsx, change the public declaration to
  onContextMenu?: (event: MouseEvent) => void; keep React for React.ReactElement.
- In components/file-list/FileListView.ts, preserve the direct onContextMenu forwarding.
- In ui/sidebar/MenuBarView.ts, retype onLeftPanelContextMenu as (event: MouseEvent), replace
  event.nativeEvent.contextMenuEvent with event.contextMenuEvent, and preserve item ordering.
- In uikit/ListBox/ListBox.story.tsx, change the explicit handler parameter to native MouseEvent.

Before → after:

    Before:
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className" | "onChange">
    onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
    this.props.onContextMenu?.(
        toPublicEvent(e) as unknown as React.MouseEvent<HTMLDivElement>,
    );

    After:
    extends Omit<
        React.HTMLAttributes<HTMLDivElement>,
        "style" | "className" | "onChange" | "onContextMenu"
    >
    onContextMenu?: (event: MouseEvent) => void;
    this.props.onContextMenu?.(e);

### 2. Retype the Tree root-context prop and its atomic caller

- In uikit/Tree/types.ts, add onContextMenu to the inherited Omit list and declare
  onContextMenu?: (event: MouseEvent) => void.
- In uikit/Tree/TreeModel.ts, remove the React and toPublicEvent imports, pass the native e directly,
  and delete/rewrite the comment at line 418 that assigns API cleanup to Epic F.
- In uikit/Tree/Tree.story.tsx, change the explicit handler parameter to native MouseEvent; its
  reads remain native.
- Do not change onItemContextMenu; it is not the root prop and its callback currently uses the
  rest-listener compatibility seam.

Before → after:

    Before:
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className" | "onChange">
    onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
    this.props.onContextMenu?.(
        toPublicEvent(e) as unknown as React.MouseEvent<HTMLDivElement>,
    );

    After:
    extends Omit<
        React.HTMLAttributes<HTMLDivElement>,
        "style" | "className" | "onChange" | "onContextMenu"
    >
    onContextMenu?: (event: MouseEvent) => void;
    this.props.onContextMenu?.(e);

### 3. Retype both Minimap callback props atomically

- In uikit/Minimap/Minimap.tsx, add onClick and onMouseEnter to the inherited Omit list and
  redeclare both as native MouseEvent callbacks.
- In uikit/Minimap/MinimapView.ts, remove the React type and toPublicEvent imports. Pass the native
  event directly to each handler and preserve fallback model behavior.
- No callback caller needs a parameter edit: MarkdownBodyView.ts:457-464 and the minimap story
  pass no event handler.

Before → after:

    Before:
    extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className">
    handler(toPublicEvent(event) as React.MouseEvent<HTMLDivElement>);

    After:
    extends Omit<
        React.HTMLAttributes<HTMLDivElement>,
        "style" | "className" | "onClick" | "onMouseEnter"
    > {
        onClick?: (event: MouseEvent) => void;
        onMouseEnter?: (event: MouseEvent) => void;
    }
    handler(event);

### 4. Keep compatibility and extension boundaries explicit

- Do not modify uikit/shared/react-compat.ts.
- Do not change ContextMenuEvent.fromNativeEvent in core/events/context-menu.ts; its dual arm
  remains until US-1098.
- Do not change TreeDndModel.ts, TreeProps.onDragStartOverride, or the DnD accessor in this task.
- No retyped callback may be included in the object passed to applyRestProps.
- The ListBox.tsx, Tree.tsx, and Minimap.tsx pass-through faces remain .tsx: they are
  React-facing API shims even though they contain no JSX, matching the US-1094 precedent.
  ListBoxModel.ts, TreeModel.ts, and MinimapView.ts are already .ts; no new rename is required.

### 5. Verify the implementation

- Run npm run typecheck (tsc --noEmit) and require it green before completion.
- Run npm run lint and require a clean result before completion.
- Do not add unit tests, test harnesses, or test infrastructure.
- Do not commit and do not modify doc/active-work.md.

## Concerns

1. The task boundary is the prop chain, not the folder. US-1095 must absorb
   components/file-list/FileList.tsx, FileListView.ts, and ui/sidebar/MenuBarView.ts because their
   ListBox root callback contracts compile with the ListBox retype. MenuBarView is work the
   original breakdown placed under US-1097; it moves here. The file-list chain was omitted from the
   original table and is recorded here as an explicit scope addition. No components/tree-provider
   or link-editor implementation moves merely because it contains a similarly named callback.

2. The adjacent TreeProvider/category chains have React-only reads.
   TreeProviderViewModel.ts:841,844 and CategoryViewModel.ts:648,673 read e.nativeEvent, but their
   props are not TreeProps.onContextMenu; they are the event-bearing TreeProviderViewProps/category
   row contracts. They remain in the task boundaries that own those contracts and need their own
   native-event decisions. This task's only React-only member is the MenuBarView read documented
   above.

3. C3-5 is historical, not binding. doc/epics/EPIC-056.md:197 says Epic C3 changed no React call site and
   explicitly assigns API cleanup to Epic F. EPIC-066 is the later epic that changes these event
   call sites. Both frozen-prop comments must be removed or rewritten.

4. The dual context-menu accessor cannot collapse yet. The two affected UIKit models already use
   native events, but other context-menu handlers still call the accessor with React events.
   Collapsing it now would break those independent chains and move US-1098 work into this task.

5. No new .ts rename is hidden in this scope. The changed view/model files are already .ts. The
   three no-JSX public pass-through faces remain .tsx by the established US-1094 rule; a
   pass-through face is not the no-JSX view-shim rename required by that precedent.

## Acceptance Criteria

- [x] ListBoxProps.onContextMenu and TreeProps.onContextMenu omit inherited React names and
      redeclare native MouseEvent callbacks.
- [x] MinimapProps.onClick and onMouseEnter omit inherited React names and redeclare native
      MouseEvent callbacks.
- [x] The four supplied toPublicEvent call sites and all associated casts are removed.
- [x] ListBoxModel.ts, TreeModel.ts, and MinimapView.ts pass native events directly and no
      implementation uses a union, normalising accessor, boundary adapter, or native-to-React
      assertion.
- [x] FileListProps and MenuBarView.onLeftPanelContextMenu are updated atomically with the
      ListBox prop. The MenuBar handler reads event.contextMenuEvent, not event.nativeEvent.
- [x] The ListBox and Tree story handlers use native MouseEvent; their existing ContextMenuEvent
      item construction is unchanged.
- [x] No handler in the affected root-context/minimap chains reads nativeEvent, persist,
      isPropagationStopped, or isDefaultPrevented after the change.
- [x] ContextMenuEvent.fromNativeEvent remains dual-armed and core/events/context-menu.ts is
      unchanged.
- [x] TreeDndModel.ts and onDragStartOverride remain unchanged; the DnD cast is a separate chain.
- [x] No retyped callback reaches applyRestProps; react-compat.ts remains unchanged.
- [x] There are no new file renames: relevant implementation files are already .ts, and the
      ListBox.tsx, Tree.tsx, and Minimap.tsx pass-through faces remain pass-through faces.
- [x] npm run typecheck is green and npm run lint is clean. No tests or harnesses are added, no
      commit is created, and doc/active-work.md is unchanged.

## Proposed task boundaries and moved work

| Group | Atomic prop chain | Files | Boundary decision |
|---|---|---|---|
| A | ListBoxProps.onContextMenu | uikit/ListBox/types.ts, ListBoxModel.ts, ListBox.story.tsx, components/file-list/FileList.tsx, FileListView.ts, ui/sidebar/MenuBarView.ts | US-1095; includes the production forwarder and both sidebar ListBox instances. |
| B | TreeProps.onContextMenu | uikit/Tree/types.ts, TreeModel.ts, Tree.story.tsx | US-1095; no production root-handler caller exists beyond the story. |
| C | MinimapProps.onClick and onMouseEnter | uikit/Minimap/Minimap.tsx, MinimapView.ts | US-1095; no live caller supplies either callback. |
| D | TreeProvider/category row context contracts | src/renderer/components/tree-provider/CategoryViewImpl.ts, CategoryViewModel.ts, TreeProviderViewImpl.ts, TreeProviderViewModel.ts | US-1096; not pulled into US-1095 because these are onItemContextMenu/TreeProviderViewProps contracts, not the root props above. |
| E | Link-list and sidebar FolderItem event contracts | src/renderer/editors/link-editor/LinksList.tsx, LinksListView.ts, LinksTiles.tsx, LinksTilesView.ts, src/renderer/ui/sidebar/FolderItemView.ts | US-1097; only MenuBarView.ts moves out because it is Group A. |
| F | TreeProps.onDragStartOverride and remaining close/accessor work | src/renderer/uikit/Tree/TreeDndModel.ts, src/renderer/core/traits/dnd.ts, their callers, and the named US-1098 close files | Later atomic DnD/close work; the cast at src/renderer/uikit/Tree/TreeDndModel.ts:55 is not part of US-1095. |

The original folder split is overridden deliberately: US-1095 absorbs the file-list chain and the
ui/sidebar/MenuBarView.ts portion of US-1097, while it does not absorb the tree-provider,
Explorer, rest-client, category, or link-editor chains that only share a callback name. Each group
has a complete prop declaration-to-caller boundary and can be typechecked as an independent change.

## Files Changed Summary

| File | Status | Change |
|---|---|---|
| src/renderer/uikit/ListBox/types.ts | Modify | Omit inherited onContextMenu; redeclare native callback. |
| src/renderer/uikit/ListBox/ListBoxModel.ts | Modify | Delete wrap/cast/import and pass native event; rewrite frozen-prop comment. |
| src/renderer/uikit/ListBox/ListBox.story.tsx | Modify | Retype story handler parameter as native MouseEvent. |
| src/renderer/components/file-list/FileList.tsx | Modify | Retype the public forwarded callback as native MouseEvent. |
| src/renderer/components/file-list/FileListView.ts | No change | Preserve direct ListBox callback forwarding. |
| src/renderer/ui/sidebar/MenuBarView.ts | Modify | Retype root handler and replace event.nativeEvent.contextMenuEvent with native expando access. |
| src/renderer/uikit/Tree/types.ts | Modify | Omit inherited onContextMenu; redeclare native callback. |
| src/renderer/uikit/Tree/TreeModel.ts | Modify | Delete wrap/cast/import and pass native event; rewrite frozen-prop comment. |
| src/renderer/uikit/Tree/Tree.story.tsx | Modify | Retype story handler parameter as native MouseEvent. |
| src/renderer/uikit/Minimap/Minimap.tsx | Modify | Omit inherited onClick/onMouseEnter; redeclare native callbacks. |
| src/renderer/uikit/Minimap/MinimapView.ts | Modify | Delete both wraps/casts/import and pass native events. |
| src/renderer/uikit/ListBox/ListBox.tsx | No change | React-facing mountVanilla pass-through and type re-export. |
| src/renderer/uikit/ListBox/index.ts | No change | Existing type re-export remains valid. |
| src/renderer/uikit/Tree/Tree.tsx | No change | React-facing mountVanilla pass-through and type re-export. |
| src/renderer/uikit/Tree/index.ts | No change | Existing type re-export remains valid. |
| src/renderer/uikit/Minimap/index.ts | No change | Existing type re-export remains valid. |
| src/renderer/uikit/index.ts | No change | Existing public type re-exports remain valid. |
| src/renderer/core/events/context-menu.ts | No change | Dual-armed accessor remains until US-1098. |
| src/renderer/uikit/Tree/TreeDndModel.ts | No change | Separate onDragStartOverride cast chain. |
| src/renderer/uikit/shared/react-compat.ts | No change | E8-7 non-goal; rest helpers remain unchanged. |
| doc/active-work.md | No change | Explicit user constraint. |

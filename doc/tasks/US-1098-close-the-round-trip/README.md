# US-1098 — Close the synthetic-event round trip

## Goal

Finish EPIC-066's event seam cleanup. Make `toPublicEvent` and `PublicEventHandler` module-private,
retype the remaining Input/Button/IconButton/Popover event contracts as native DOM callbacks, remove
the eight rest/React unwrapping reads, and collapse the two remaining React/native accessor arms.

This document and implementation must not add tests or harnesses, create a commit, or modify
`doc/active-work.md`.

## Background

EPIC-066 E8-11 settles the seam: every converted `mountVanilla(View, props)` face receives the native
DOM event. React event types on those props describe a value that the view does not receive, so the
correct change is the native prop type plus native callers. No union, normalising accessor, boundary
adapter, or native-to-React cast is allowed.

E8-13 corrects the original closing property. `toPublicEvent` and `PublicEventHandler` cannot be
deleted because `react-compat.ts:117`, inside the deliberately preserved `applyRestProps`, still
uses both. They therefore become module-private. `applyRestProps`, `clearRestListeners`, and
`bindRef` remain unchanged in behavior and implementation. Preserving that bridge does not require
preserving every event prop that happens to flow through it: a retyped callback is removed from a
component's residual rest object and is installed as a native callback, while the bridge itself stays.

The supplied pre-task census is 10 `.nativeEvent` reads: two dual arms and eight Input/Button-like
rest/React paths. The eight are:

| Site | Contract to make native | Native members used after the change |
|---|---|---|
| `uikit/Menu/MenuView.ts:150` | `InputProps.onKeyDown` | `key`, modifier keys, default prevention through `MenuModel.onKeyDown` |
| `uikit/Menu/MenuView.ts:348` | `PopoverProps.onKeyDown` | same keyboard members through `MenuModel.onKeyDown` |
| `ui/tabs/PageTabView.ts:415-416` (two reads) | `IconButtonProps.onClick` | `ctrlKey`, native click propagation/default APIs |
| `editors/shared/FindBarView.ts:139` | `InputProps.onKeyDown` | `key`, `shiftKey`, `preventDefault`, `stopPropagation` |
| `uikit/PathInput/PathInputView.tsx:242` | `InputProps.onKeyDown` | path-input keyboard members and default prevention |
| `uikit/Popover/PopoverView.tsx:228` | nested resize-handle pointer path | pointer coordinates/buttons/capture members in `PopoverModel.onHandlePointerDown` |
| `uikit/SegmentedControl/SegmentedControlView.tsx:81` | `ButtonProps.onKeyDown` | `key` and native focus/navigation behavior |

The table has seven source locations because `PageTabView` contains two reads; together they
account for the supplied eight reads. The Popover resize handle is implemented with a native
listener because it is a nested React-rendered element rather than a public rest prop. It must not
receive a React handler that is then cast or unwrapped.

The two final `as unknown as React` matches are intentionally outside this task: the native
`DragEvent` to `React.DragEvent` assertion in `uikit/Tree/TreeDndModel.ts` belongs to the separate
`TreeProps.onDragStartOverride` graph, while `editors/graph/GraphLegendPanel.tsx` converts a DOM
element to a React node and is unrelated to events.

## Implementation Plan

### 1. Narrow the compatibility-module exports only

In `src/renderer/uikit/shared/react-compat.ts`, remove only the `export` keyword from
`PublicEventHandler` and `toPublicEvent`. Do not change their bodies, the `applyRestProps` call at
line 117, `clearRestListeners`, `bindRef`, or any behavior.

Before:

```ts
export type PublicEventHandler = (event: React.SyntheticEvent<HTMLElement>) => void;
export function toPublicEvent(event: Event): React.SyntheticEvent<HTMLElement> {
```

After:

```ts
type PublicEventHandler = (event: React.SyntheticEvent<HTMLElement>) => void;
function toPublicEvent(event: Event): React.SyntheticEvent<HTMLElement> {
```

### 2. Retype residual Input/Button/IconButton/Popover callbacks

Update the inherited `Omit` lists and callback declarations in:

- `src/renderer/uikit/Input/Input.tsx`: omit and redeclare `onKeyDown` as
  `(event: KeyboardEvent) => void`.
- `src/renderer/uikit/Button/Button.tsx`: omit and redeclare `onKeyDown` as
  `(event: KeyboardEvent) => void`.
- `src/renderer/uikit/IconButton/IconButton.tsx`: omit and redeclare `onClick` as
  `(event: MouseEvent) => void`.
- `src/renderer/uikit/Popover/PopoverModel.ts`: omit and redeclare `onKeyDown` as
  `(event: KeyboardEvent) => void`.

In `InputView.applyProps`, `ButtonView.applyProps`, `IconButtonView.applyProps`, and
`PopoverFloatingView.applyProps`, destructure the retyped callback before `...rest`, so it never
reaches `applyRestProps`. Install each callback through the owning native element/root listener and
read `this.props` at dispatch time so updates replace the callback without reinstalling residual
listeners. The existing `applyRestProps` implementation is not changed.

Before → after shape:

```ts
// Before
extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "size">
// the view leaves onKeyDown in `...rest`

// After
extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "onChange" | "size" | "onKeyDown"
> {
    onKeyDown?: (event: KeyboardEvent) => void;
}
// the view destructures onKeyDown and the native field listener invokes it
```

Apply the same shape to the button/icon-button/popover contracts with their respective native
event types. Preserve all existing callback ordering, bubbling, default prevention, ref behavior,
and residual attribute handling.

### 3. Update every caller in the connected prop graphs

Change handler parameter types only where the retyped callback reaches the caller, and verify every
member read is present on the native event. The census includes the named close sites plus these
connected callers discovered from the inherited contracts:

- Input callers in `components/file-list/FileListView.ts`,
  `components/file-search/FileSearchView.ts`, `components/tree-provider/CategoryViewImpl.ts`,
  `components/tree-provider/TreeProviderViewImpl.ts`, `editors/graph/GraphBody.tsx`,
  `editors/graph/GraphExpansionSettings.tsx`, `editors/graph/GraphDetailPanel.tsx`,
  `editors/link-editor/LinkTooltip.tsx`, `editors/mcp-inspector/McpInspectorView.tsx`,
  `editors/settings/sections/McpSectionModel.ts`,
  `editors/settings/sections/BrowserProfilesSectionModel.ts`, and the existing
  `editors/shared/FindBarView.ts` / `uikit/PathInput/PathInputView.tsx` paths.
- Button callers in `uikit/SegmentedControl/SegmentedControlView.tsx` and any additional direct
  `Button`/`ButtonView` callback assignments exposed by typecheck; no React event annotation may
  remain on a native callback.
- IconButton callers, including `ui/tabs/PageTabView.ts`, all direct `new IconButtonView(...)`
  assignments, and JSX `<IconButton>` handlers whose annotations describe React events. Change
  only event parameter types and preserve each handler's existing member reads.
- The Popover keyboard callback in `uikit/Menu/MenuView.ts`; other Popover construction sites were
  checked and do not provide `onKeyDown`.

For `PageTabView`, the ctrl-click branch must remain:

```ts
if (!wasActive && event.ctrlKey) {
    this.handleClick(event);
    return;
}
```

It is verified against `IconButtonView`'s native root listener and the `MouseEvent` callback type,
then by the final typecheck/build source audit: `ctrlKey` is read from the actual native event and
the branch still calls `handleClick` before returning. No lossy `as MouseEvent` cast is permitted.

### 4. Remove the eight unwraps without changing the bridge

Pass native events directly at the Menu, FindBar, PathInput, SegmentedControl, and PageTab paths.
For the Popover resize handle, remove the JSX `onPointerDown` React callback and use the existing
native `onNativeResizePointerDown` behavior from a listener owned by `PopoverFloatingView`, scoped
to the resize-handle target. Preserve `preventDefault`, propagation stopping, pointer capture,
top/bottom deltas, and `onResize` behavior.

No callback being retyped may be left in a rest object. Do not modify `applyRestProps`,
`clearRestListeners`, or `bindRef`.

### 5. Collapse the DnD accessor, and retain the live context-menu arm

Before editing each accessor, verify that its caller graph has no React-typed event:

- `src/renderer/core/traits/dnd.ts:getTraitDragDataFromEvent` has native callers in
  `components/tree-provider/CategoryViewModel.ts` and `uikit/Tree/TreeDndModel.ts`; the latter's
  unrelated `onDragStartOverride` cast remains. Change the accessor parameter to `DragEvent` and
  read the event directly.
- `src/renderer/core/events/context-menu.ts:ContextMenuEvent.fromNativeEvent` still has live
  React-typed callers in `editors/browser/BrowserTabsPanel.tsx:handleContextMenu`,
  `editors/link-editor/LinkItemList.tsx:handleContextMenu`,
  `editors/link-editor/LinkItemTiles.tsx:handleContextMenu`, and
  `editors/link-editor/PinnedLinksPanel.tsx:handleContextMenu`. Leave its dual arm unchanged;
  those callers are genuine React event paths and are outside this close.

If source census finds a live React-typed caller, leave that arm in place and report it rather than
forcing the collapse. No new union or normalising accessor is allowed. Final result: the DnD arm
collapsed; the context-menu arm remained.

### 6. Rename only files made JSX-free and React-free by this task

After the code changes, inspect each changed `.tsx` file. Rename to `.ts` only if this task itself
removed its last JSX and last React import. Do not rename a file that was already JSX-free before
US-1098; that rejected scope expansion is recorded by US-1096. Update only importers whose module
specifier requires the extensionless rename, and follow the cold-start note in `CLAUDE.md` if a
dynamic import is affected.

### 7. Verify and record the close ledger

Re-measure the whole renderer after implementation. The final task document must report:

| Measure | Final result to verify |
|---|---:|
| `toPublicEvent(...)` callers outside `react-compat.ts` | 0 |
| Internal `toPublicEvent` compatibility call | 1, at `applyRestProps` |
| External wrap-site casts | 0 |
| Lossy `.nativeEvent as KeyboardEvent` / `as MouseEvent` casts | 0 |
| `as unknown as React` matches, non-story | 2, both unrelated and classified above |
| `.nativeEvent` reads outside `react-compat.ts` | 1, the retained context-menu arm |
| dual-armed accessors | 1, `ContextMenuEvent.fromNativeEvent`; DnD is 0 |
| already-vanilla `.ts` files importing React | **58** |

### Final E8-2 measurement

The source census after implementation found 0 external `toPublicEvent(...)` calls and one internal
call at `react-compat.ts:117`; the two textual matches in that file are the definition and that
call. No wrap-site casts or lossy native-event casts remain. The only `.nativeEvent` read is
`core/events/context-menu.ts:62`, retained because the four live React callers above still use the
dual-armed `ContextMenuEvent.fromNativeEvent`. `core/traits/dnd.ts` is native-only and its dual arm
is gone. The two remaining `as unknown as React` matches are unchanged: `uikit/Tree/TreeDndModel.ts:54`
(`DragEvent` to the separate React `onDragStartOverride` contract) and
`editors/graph/GraphLegendPanel.tsx:22` (DOM element to React node, not an event).

The E8-2 table must distinguish the surviving internal bridge call from external contract call
sites, and must state that the two `as unknown as React` matches remain deliberately unrelated.

Run `npm run typecheck`, `npm run lint`, and `npm run build-prod`; all three are completion
conditions, not follow-ups. Do not run or add unit tests or test harnesses.

## Concerns

1. **The rest-props boundary is preserved, not every prop crossing it.** Removing a named event
   callback from `...rest` changes which prop travels over the bridge, but `applyRestProps`,
   `clearRestListeners`, `bindRef`, and their behavior remain untouched. Changing that bridge would
   cross E8-7 and is out of scope.
2. **Popover has two event mechanisms.** Its `contentView` branch already installs a native resize
   listener; its ordinary children branch uses one temporary React root. The resize handler is now
   native in both branches through the floating root listener, with no React-to-native cast or union.
3. **PageTab ctrl-click is a feature gate.** The source proof is the connected type path
   `IconButtonView` native root listener → native `MouseEvent` callback → `PageTabView.onLanguageClick`
   reading `ctrlKey` before `handleClick`. No interaction harness was run (the task forbids tests
   and harnesses); the final report must state this source/type verification explicitly.
4. **The context-menu dual arm remains deliberately.** Its four live React callers are genuine
   React event paths; collapsing it would cross this task's caller boundary. `TreeDndModel.ts`
   remains partly React-typed for another prop graph, and its cast is one of the two final
   `as unknown as React` matches.
5. **No JSX-free rename by opportunistic cleanup.** Only a last React/JSX removal caused by this
   task can trigger a `.tsx` → `.ts` rename; pre-existing JSX-free `.tsx` files remain unchanged.

## Acceptance Criteria

- [x] `toPublicEvent` and `PublicEventHandler` are module-private; `applyRestProps`,
      `clearRestListeners`, `bindRef`, and the rest bridge behavior are preserved.
- [x] Input, Button, IconButton, and Popover retyped callbacks are omitted, redeclared natively,
      destructured before residual props, and delivered by native listeners.
- [x] All connected callers compile with native event parameters and retain their existing behavior;
      no native event is asserted to be a React event, and no union/adapter/accessor is introduced.
- [x] The eight supplied `.nativeEvent` reads are gone; the Popover resize handle remains functional
      through native pointer events.
- [x] The DnD dual arm collapses after the no-React-caller census; the context-menu dual arm remains
      explicitly because its four live React callers are recorded above.
- [x] `PageTabView` ctrl-click still reads native `MouseEvent.ctrlKey` and calls `handleClick` on
      the gated path; the final report explains the verification.
- [x] The final E8-2 measurements are recorded in this document, including the final vanilla `.ts`
      files importing React count and classification of the two remaining React assertions.
- [x] Only task-caused JSX/React-free files are renamed; no pre-existing JSX-free `.tsx` is renamed.
- [x] `npm run typecheck`, `npm run lint`, and `npm run build-prod` are green. This task adds no
      tests, harnesses, or commit, and makes no change to `doc/active-work.md`.

## Files Changed Summary

| File | Status | Change |
|---|---|---|
| `doc/tasks/US-1098-close-the-round-trip/README.md` | Modify | Task plan, caller census, acceptance criteria, and final E8-2 ledger. |
| `src/renderer/uikit/shared/react-compat.ts` | Modify | Remove only two export keywords; preserve all behavior. |
| `src/renderer/uikit/Input/Input.tsx` | Modify | Native `onKeyDown` contract. |
| `src/renderer/uikit/Input/InputView.tsx` | Modify | Destructure and dispatch native keydown callback. |
| `src/renderer/uikit/Button/Button.tsx` | Modify | Native `onKeyDown` contract. |
| `src/renderer/uikit/Button/ButtonView.tsx` | Modify | Destructure and dispatch native keydown callback. |
| `src/renderer/uikit/IconButton/IconButton.tsx` | Modify | Native `onClick` contract. |
| `src/renderer/uikit/IconButton/IconButtonView.tsx` | Modify | Destructure and dispatch native click callback. |
| `src/renderer/uikit/Popover/PopoverModel.ts` | Modify | Native `onKeyDown` contract. |
| `src/renderer/uikit/Popover/PopoverView.tsx` | Modify | Destructure native keyboard callback and remove React resize unwrap. |
| `src/renderer/uikit/Menu/MenuView.ts` | Modify | Pass native keyboard events to Input/Popover models. |
| `src/renderer/ui/tabs/PageTabView.ts` | Modify | Native IconButton click and ctrl-click path. |
| `src/renderer/editors/shared/FindBarView.ts` | Modify | Native Input keyboard callback. |
| `src/renderer/uikit/PathInput/PathInputView.tsx` | Modify | Pass native Input keyboard event. |
| `src/renderer/uikit/SegmentedControl/SegmentedControlView.tsx` | Modify | Pass native Button keyboard event. |
| `src/renderer/components/file-list/FileListView.ts` | Modify | Native Input keyboard handlers; remove now-unused React import. |
| `src/renderer/components/file-search/FileSearchView.ts` | Modify | Native Input keyboard handlers; remove now-unused React import. |
| `src/renderer/components/tree-provider/CategoryViewImpl.ts` | Modify | Native Input keyboard and IconButton click handlers. |
| `src/renderer/components/tree-provider/TreeProviderViewImpl.ts` | Modify | Native Input keyboard handlers. |
| `src/renderer/editors/archive/ArchiveSecondaryView.ts` | Modify | Native IconButton close handler. |
| `src/renderer/editors/browser/BrowserTabsPanel.tsx` | Modify | Native IconButton close/mute callback graph; retain React context-menu graph. |
| `src/renderer/editors/browser/BrowserUrlBarModel.ts` | Modify | Native Input keydown and context-menu callback path. |
| `src/renderer/editors/browser/BrowserView.tsx` | Modify | Native Input keydown and native anchor guards for IconButton menus. |
| `src/renderer/editors/draw/index.tsx` | Modify | Native IconButton anchor guards. |
| `src/renderer/editors/graph/GraphBody.tsx` | Modify | Native Input keyboard handler. |
| `src/renderer/editors/graph/GraphDetailPanel.tsx` | Modify | Native Input keyboard handler and callback contract. |
| `src/renderer/editors/graph/GraphExpansionSettings.tsx` | Modify | Native Input keyboard handler. |
| `src/renderer/editors/grid/index.tsx` | Modify | Native IconButton anchor guard. |
| `src/renderer/editors/html/index.tsx` | Modify | Native IconButton anchor guard. |
| `src/renderer/editors/image/ImageToolbarView.ts` | Modify | Native IconButton click handler and anchor narrowing. |
| `src/renderer/editors/link-editor/LinkTooltip.tsx` | Modify | Native Input keyboard handler. |
| `src/renderer/editors/mcp-inspector/McpInspectorView.tsx` | Modify | Native Input keyboard and IconButton delete handlers. |
| `src/renderer/editors/notebook/note-editor/NoteItemToolbarView.ts` | Modify | Native IconButton click handler; remove now-unused React import. |
| `src/renderer/editors/rest-client/RestClientShared.tsx` | Modify | Native IconButton anchor guard. |
| `src/renderer/editors/settings/sections/BrowserProfilesSectionModel.ts` | Modify | Native Input keyboard handler. |
| `src/renderer/editors/settings/sections/McpSectionModel.ts` | Modify | Native Input keyboard handler. |
| `src/renderer/core/events/context-menu.ts` | No change | Live React callers require its dual arm to remain. |
| `src/renderer/core/traits/dnd.ts` | Modify | Collapse to native `DragEvent` after caller census. |
| `src/renderer/uikit/Tree/TreeDndModel.ts` | No change | Unrelated `onDragStartOverride` React assertion remains. |
| `src/renderer/editors/graph/GraphLegendPanel.tsx` | No change | Unrelated React-node assertion remains. |
| `doc/active-work.md` | No change | Explicit task constraint. |

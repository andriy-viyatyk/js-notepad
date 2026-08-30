# US-1222 — The four React-residue decisions

**Epic:** [EPIC-078](../../epics/EPIC-078.md) — Post-De-React close-out  
**Status:** Investigation complete; recommendations recorded  
**Scope:** `vanilla-view.ts`, `fill-slot.ts`, `performance-janitor.ts`, and
`grid-context-menu.ts` only. No implementation is part of this document.

## Goal

Resolve the four open decisions in EPIC-078 US-1222 from the current source tree. Each decision
below records whether the old React-era mechanism is still load-bearing, the evidence for that
answer, and the smallest eventual source/comment change.

## Background

EPIC-078 §D-2 is authoritative over the older `doc/de-react-refactoring.md` plan. In particular,
the four items are not a mechanical deletion sweep: `fillSlot` is used throughout native UIKit,
the performance janitor may still protect the sanctioned Excalidraw island, and the context-menu
file survived the task that was expected to remove it.

### Decision 1 — `VanillaView` root ownership

`VanillaView.dispose()` currently marks the view disposed, snapshots and clears owned children and
resource disposers, disposes children first, then runs `onDispose()` (`src/renderer/uikit/shared/vanilla-view.ts:99-142`).
It deliberately does not remove `root`; the two comments at `:104-105` and `:131-132` say a
future adapter owns that ordering. `releaseChild()` is the present structural helper: it disposes
the registered child, removes `child.root` in a `finally`, and unregisters the child even when
disposal throws (`src/renderer/uikit/shared/vanilla-view.ts:206-227`).

No general adapter exists, but the ownership split has real structural owners. `SubtreeSwap` claims an
`IOwnedView`, inserts its root before the old branch, then disposes and removes the old root in
its own `finally` (`src/renderer/uikit/shared/subtree-swap.ts:15-45,71-88`). Other structural
owners follow the same split: `AsyncEditorView.disposeActiveResource()` calls `dispose()` and
then removes the root (`src/renderer/ui/app/AsyncEditorView.ts:138-146`),
`PageContentView.clearContent()` does likewise (`src/renderer/ui/app/PageContentView.ts:167-180`),
and `LazySecondaryViewView.retirePanel()` does it for an asynchronously selected panel
(`src/renderer/ui/secondary-views/LazySecondaryViewView.ts:105-117`). These paths are not
`releaseChild()` callers, but they establish that DOM attachment is intentionally owned by the
container rather than by the lifecycle object.

The complete `releaseChild()` caller census found 146 `this.releaseChild(...)` calls in 67 files.
The callers use it as a retire operation: conditional children are replaced, pooled/editor rows
are removed, and teardown collections are drained. None transfers root ownership to a second
runtime. The census is listed below so a future implementation can re-check every call site.

| File | Call lines |
|---|---:|
| `src/renderer/editors/about/AboutView.ts` | 233 |
| `src/renderer/editors/base/PageToolbarView.ts` | 186, 361, 454 |
| `src/renderer/editors/base/TextChromeView.ts` | 86, 179, 186, 190, 227, 446, 450, 454, 458, 462, 466 |
| `src/renderer/editors/board/BoardSecondaryView.ts` | 162 |
| `src/renderer/editors/board/BoardToolbar.ts` | 163, 167, 198, 203 |
| `src/renderer/editors/board-info/BoardInfoEditorView.ts` | 528 |
| `src/renderer/editors/browser/BrowserDownloadsPopup.ts` | 143, 255 |
| `src/renderer/editors/browser/BrowserTabsPanel.ts` | 45, 51, 54, 81, 82, 99 |
| `src/renderer/editors/browser/BrowserView.ts` | 340, 349, 350 |
| `src/renderer/editors/browser/TorStatusOverlay.ts` | 32, 35, 36, 38, 39 |
| `src/renderer/editors/browser/UrlSuggestionsDropdown.ts` | 30, 33 |
| `src/renderer/editors/category/CategoryEditor.ts` | 239, 245, 414 |
| `src/renderer/editors/env-vars/EnvVarsBodyView.ts` | 556, 581, 687, 745 |
| `src/renderer/editors/explorer/BoardsSecondaryView.ts` | 346, 372, 379 |
| `src/renderer/editors/explorer/ExplorerSecondaryView.ts` | 201 |
| `src/renderer/editors/git-tree/CommitDiffPanel.ts` | 263, 303, 307, 311 |
| `src/renderer/editors/git-tree/GitTreeEditorView.ts` | 335, 417, 450, 455, 459 |
| `src/renderer/editors/grid/index.ts` | 71, 162 |
| `src/renderer/editors/link-editor/EditLinkDialogView.ts` | 418 |
| `src/renderer/editors/link-editor/index.ts` | 236 |
| `src/renderer/editors/link-editor/LinkBody.ts` | 235, 243, 247, 254, 255 |
| `src/renderer/editors/link-editor/panels/LinkCategoryPanel.ts` | 72 |
| `src/renderer/editors/link-editor/panels/LinkHostnamesNavigationPanel.ts` | 158, 162 |
| `src/renderer/editors/link-editor/panels/LinkTagsSecondaryView.ts` | 151, 155 |
| `src/renderer/editors/link-editor/PinnedLinksPanelView.ts` | 290 |
| `src/renderer/editors/log-view/items/ButtonsPanel.ts` | 55 |
| `src/renderer/editors/log-view/items/CheckboxesDialogView.ts` | 51 |
| `src/renderer/editors/log-view/LogEntryContent.ts` | 186 |
| `src/renderer/editors/markdown/index.ts` | 127 |
| `src/renderer/editors/markdown/MarkdownBodyView.ts` | 413, 449 |
| `src/renderer/editors/mcp-inspector/McpInspectorView.ts` | 264 |
| `src/renderer/editors/mcp-inspector/ResourceContentView.ts` | 153, 156 |
| `src/renderer/editors/mcp-inspector/ResourcesPanel.ts` | 228 |
| `src/renderer/editors/mcp-inspector/ToolResultView.ts` | 160 |
| `src/renderer/editors/mcp-inspector/ToolsPanel.ts` | 143 |
| `src/renderer/editors/mneme-config/MnemeConfigView.ts` | 80, 86, 114 |
| `src/renderer/editors/mneme-config/ModelPanel.ts` | 103, 105, 109, 111 |
| `src/renderer/editors/mneme-config/RootsPanel.ts` | 209, 233, 315 |
| `src/renderer/editors/mneme-root/MnemeRootEditorView.ts` | 129, 194, 234, 345, 355, 377 |
| `src/renderer/editors/mneme-root/MnemeTreeSecondaryView.ts` | 137, 194 |
| `src/renderer/editors/monaco/MonacoBodyView.ts` | 190 |
| `src/renderer/editors/notebook/ExpandedNoteView.ts` | 217, 227, 239, 284 |
| `src/renderer/editors/notebook/index.ts` | 154 |
| `src/renderer/editors/notebook/NotebookBodyView.ts` | 282 |
| `src/renderer/editors/notebook/note-editor/NoteItemActiveEditorView.ts` | 179 |
| `src/renderer/editors/notebook/note-editor/NoteItemToolbarView.ts` | 242 |
| `src/renderer/editors/notebook/NoteItemView.ts` | 262, 272, 285, 333 |
| `src/renderer/editors/notebook/panels/NotebookCategoriesSecondaryView.ts` | 88 |
| `src/renderer/editors/notebook/panels/NotebookTagsSecondaryView.ts` | 86 |
| `src/renderer/editors/settings/sections/BrowserProfilesSection.ts` | 50, 123, 306 |
| `src/renderer/editors/settings/sections/SettingsSections.ts` | 283, 347, 441 |
| `src/renderer/editors/storybook/LivePreview.ts` | 176 |
| `src/renderer/editors/storybook/PropertyEditor.ts` | 192, 195 |
| `src/renderer/editors/text/ScriptPanelView.ts` | 360 |
| `src/renderer/editors/tools-hub/SearchBoardsTab.ts` | 195, 357 |
| `src/renderer/editors/tools-hub/ToolsHubView.ts` | 105 |
| `src/renderer/ui/app/AsyncEditorView.ts` | 163 |
| `src/renderer/ui/app/PageContentView.ts` | 122 |
| `src/renderer/ui/app/RenderEditorView.ts` | 30 |
| `src/renderer/ui/sidebar/TrustedBoardsListView.ts` | 171, 178, 226, 227 |
| `src/renderer/uikit/Button/Button.story.ts` | 42 |
| `src/renderer/uikit/Divider/Divider.story.ts` | 52 |
| `src/renderer/uikit/IconButton/IconButton.story.ts` | 42 |
| `src/renderer/uikit/Input/Input.story.ts` | 107 |
| `src/renderer/uikit/Notification/Notification.story.ts` | 78 |
| `src/renderer/uikit/Splitter/Splitter.story.ts` | 56 |
| `src/renderer/uikit/TagsInput/TagsInputView.ts` | 101 |

**Recommendation:** Keep the split. Replace the hypothetical-adapter wording with the actual
contract: a `VanillaView` owns behavior and child lifetime, while its container/structural helper
owns DOM attachment. Keep `releaseChild()` as the one parent-owned retire helper. The alternative
would make direct `dispose()` calls silently detach roots that their callers currently remove as a
separate structural operation.

Current → recommended comment shape:

```ts
// Current: The view releases behavior but deliberately does not detach root.
// Its adapter or structural helper owns that DOM ordering operation.

// Recommended: Disposal releases behavior and owned resources. The container that attached
// `root` owns DOM ordering and removes it after disposal; `releaseChild()` is that operation for
// registered children.
```

### Decision 2 — `fillSlot()` active-slot generation

`fillSlot()` is already a native-only API: `NativeSlotContent` contains primitives, `Node`, and
recursive arrays (`src/renderer/uikit/shared/fill-slot.ts:1-11`), and `appendNativeSlot()` uses
`appendChild`, text nodes, and `DocumentFragment` without creating a root (`:40-60`). The
React-era wording at `:40` is stale, but the guard is not React-specific.

The current state machine does four things:

1. `host.replaceChildren()` makes every call the transition owner (`:68-81`).
2. A per-host `WeakMap` records the current node/text/empty state (`:13-30,72-83`), including an
   empty replacement that must invalidate the previous non-empty cleanup.
3. A cleanup only clears the host when its active record is still current (`:85-92`). Thus an old
   cleanup cannot erase newer content after `fillSlot(host, next)`; the same applies across any
   number of replacements and across non-empty → empty transitions.
4. Cleanup remains idempotent: the first current cleanup deletes the map entry, and later calls no-op
   (`:85-92`). The `active === record` comparison is the effective identity guard; the numeric
   `active.generation === generation` comparison is a redundant second check, not an independent
   React requirement.

This can still be hit by native-only callers. `ListBoxView.renderCell()` overwrites a wrapper's
slot on custom-cell repaint (`src/renderer/uikit/ListBox/ListBoxView.ts:400-410`), and
`TreeView.renderCell()` has the same native recycled-wrapper path (`src/renderer/uikit/Tree/TreeView.ts:407-410`).
Other native views repeatedly refill stable hosts on updates, for example `ToolbarView` (`src/renderer/uikit/Toolbar/ToolbarView.ts:43-56`),
`ButtonView` (`src/renderer/uikit/Button/ButtonView.ts:145-177`), and the tab icon hosts
(`src/renderer/ui/tabs/PageTabView.ts:369-402`). The source census found fill-slot use across
the native UI; no current caller supplies a React element or needs a React root.

**Recommendation:** Retain the stale-cleanup guard and its behavior. It protects native callers
from an out-of-order/superseded cleanup, not from React. A later small refactor may collapse the
three empty/node/text interfaces and the redundant numeric generation to one opaque active record,
but deleting the active-record guard is not justified. If that simplification is chosen, prove the
same replacement, empty-transition, cross-host, and idempotence behavior before changing the
implementation.

Current → recommended comment shape:

```ts
// Current:
/** Append the native subset of SlotContent without creating a React root. */

// Recommended:
/** Append SlotContent's native values; the active-record cleanup prevents stale handles from
 * clearing a newer fill on the same host. */
```

### Decision 3 — performance janitor

The janitor is active, not dead: `src/renderer.ts` imports and starts it at lines 4-8. It checks
the measure buffer every 60 seconds and clears measures/marks above 10,000
(`src/renderer/core/utils/performance-janitor.ts:18-27`).

The installed dependency is `react`/`react-dom` 19.2.7 (`package.json:77-78`). Its development
client still checks for `performance.measure` and defines the `Components ⚛` track
(`node_modules/react-dom/cjs/react-dom-client.development.js:25524-25547`); component renders with
changed props still call `performance.measure` with the `Changed Props` detail
(`node_modules/react-dom/cjs/react-dom-client.development.js:4148-4162`). The sanctioned draw
island still creates that React root (`src/renderer/editors/draw/react-island.ts:13-23`), and
`ExcalidrawIsland` still owns React state and passes the Excalidraw component tree
(`src/renderer/editors/draw/ExcalidrawIsland.tsx:54-77`). There are no application-owned
`performance.measure()` writers to replace this mechanism.

**Recommendation:** Keep the janitor. The source and installed React development build verify that
the producer mechanism and the only live application React island both remain. Update the janitor
comment to name the Excalidraw island as the sanctioned producer and state that production remains
a no-op; do not delete a working memory guard merely because native code no longer creates roots.

Current → recommended comment shape:

```ts
// Current: React 19 development builds emit component-track measures ...

// Recommended: React 19's development client still emits component-track measures while the
// live Excalidraw React island renders; production builds do not. This global janitor caps that
// buffer and remains a no-op when the development producer is absent.
```

### Decision 4 — `grid-context-menu.ts` after US-1023

The current file is not an obsolete AVGrid shim. It adapts current `av-grid` item icon strings to
Persephone icon nodes (`src/renderer/ui/dialogs/poppers/grid-context-menu.ts:13-25,41-76`) and
hands the result to the application popup menu (`:93-112`). Its `stopPropagation()` is load-bearing:
`GlobalEventService` installs a document-level context-menu listener and always calls the generic
popup path after awaiting any promise (`src/renderer/api/internal/GlobalEventService.ts:77-102`),
while `showAppPopupMenu()` closes an existing app menu before showing a new one
(`src/renderer/ui/dialogs/poppers/showPopupMenu.ts:212-241`). Allowing the event to bubble would
replace the grid menu with the generic menu.

The current production callers are:

| Caller | Evidence |
|---|---|
| File grid | `src/renderer/components/file-grid/FileGridView.ts:1-3,89-104` |
| Git tree | `src/renderer/components/git-tree/GitTreeView.ts:13,201-206,258-274,390-403` |
| JSON/CSV grid editor | `src/renderer/editors/grid/GridBodyView.ts:3,80-105` |
| UIKit integration story | `src/renderer/uikit/DataGrid/DataGrid.story.ts:10,125-136` |

US-1023's task document no longer exists in the working tree because the post-completion cleanup
commit `72a73ac2` retired the old roadmap task folders. Its implementation commit is still
inspectable in history: US-1023 deleted `src/renderer/uikit/AVGrid/` and the old
`ContextMenuModel.tsx`, but deliberately modified rather than deleted the app-side context-menu
file (`5e8e62e1`, file diff). EPIC-057 records the namespace deletion and the context-menu handoff
as complete (`doc/epics/completed.md:1109-1130`; `doc/epics/EPIC-057.md:374-381`). The file
survived because it had become the app-layer host adapter for the replacement `av-grid`, not
because the old React grid was still present.

**Recommendation:** Keep `grid-context-menu.ts` and its icon/event behavior. Remove only the
false exemption text at `:4-7`, replacing it with the current `DataGrid`/`av-grid` host-adapter
reason. Do not delete this file or its callers.

Current → recommended comment shape:

```ts
// Current: the exemption lasts until US-1023 deletes this file with the React grid.

// Recommended: This app-side adapter is the deliberate boundary for current DataGrid/av-grid
// context menus: UIKit supplies the event/items, while the app shell supplies its popup and icons.
```

## Implementation plan

This document records decisions only; no source implementation is authorized in this
investigation. If the recommendations are accepted, the later implementation should:

1. Update only the lifecycle comments in `src/renderer/uikit/shared/vanilla-view.ts` to name the
   existing container/structural-helper ownership contract. Preserve `dispose()` and
   `releaseChild()` semantics, including `finally` cleanup and child-before-resource ordering.
2. Remove the stale React wording in `src/renderer/uikit/shared/fill-slot.ts` while retaining the
   current-record guard. Do not change the native content union or transition semantics in this
   decision task.
3. Update the explanation in `src/renderer/core/utils/performance-janitor.ts` to identify the
   live Excalidraw island. Leave `src/renderer.ts` startup and janitor thresholds unchanged.
4. Replace the stale US-1023 exemption in
   `src/renderer/ui/dialogs/poppers/grid-context-menu.ts` with the current app-layer boundary
   explanation. Preserve `adaptIcons()`, `stopPropagation()`, and all four caller relationships.
5. Do not add tests or a test harness. Verification is source-level for these decisions, plus the
   existing manual grid/draw smoke paths when the eventual comment-only cleanup is implemented.

## Concerns

- `dispose()` detaching its root would be a broad lifecycle contract change, not a comment cleanup.
  The direct-dispose-then-remove paths listed above are the reason to keep the split.
- The numeric generation check is redundant with active-record identity today, but the identity
  guard itself is load-bearing. Treat a future data-structure simplification as a behavior-preserving
  change, not as React residue removal.
- The installed React development client proves the measure producer remains in the shipped
  dependency and the draw island still mounts it. A future runtime check can quantify entries by
  opening a drawing in a development renderer and reading
  `performance.getEntriesByType("measure")`; it is not a unit-test proposal.
- `grid-context-menu.ts` is in `ui/` precisely because `uikit/DataGrid` must not import the app
  shell. Removing it would either remove current grid menus or recreate the forbidden boundary in
  UIKit.

## Acceptance criteria

- [ ] The four recommendations above are accepted or replaced with an evidence-backed alternative.
- [ ] `VanillaView` comments describe actual structural owners; no source code changes root
  detachment semantics.
- [ ] `fillSlot` retains stale-cleanup protection for replacement, empty, cross-host, and repeated
  cleanup cases; its native-only contract is documented without React terminology.
- [ ] The performance janitor remains started from `src/renderer.ts` and its comment identifies
  the Excalidraw React island as the reason it remains.
- [ ] `grid-context-menu.ts` remains present, all current callers remain wired, and its comment no
  longer claims US-1023 will delete it.
- [ ] No tests or test harnesses are added.

## Files Changed summary

| File | Status for this investigation | Eventual scope |
|---|---|---|
| `doc/tasks/US-1222-react-residue-decisions/README.md` | Added | Decision record |
| `src/renderer/uikit/shared/vanilla-view.ts` | Not changed | Comment wording only, if accepted |
| `src/renderer/uikit/shared/fill-slot.ts` | Not changed | Comment wording only, guard retained |
| `src/renderer/core/utils/performance-janitor.ts` | Not changed | Comment wording only, janitor retained |
| `src/renderer/ui/dialogs/poppers/grid-context-menu.ts` | Not changed | Remove stale exemption wording; retain adapter |
| `src/renderer.ts` | Not changed | No change |
| `src/renderer/uikit/shared/subtree-swap.ts` | Not changed | No change |
| `src/renderer/ui/app/AsyncEditorView.ts` | Not changed | No change |
| `src/renderer/ui/app/PageContentView.ts` | Not changed | No change |
| `src/renderer/ui/secondary-views/LazySecondaryViewView.ts` | Not changed | No change |
| `src/renderer/components/file-grid/FileGridView.ts` | Not changed | No change |
| `src/renderer/components/git-tree/GitTreeView.ts` | Not changed | No change |
| `src/renderer/editors/grid/GridBodyView.ts` | Not changed | No change |

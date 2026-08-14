# EPIC-049: Explorer file-tree multiselect

## Status

**Status:** Completed
**Created:** 2026-08-14
**Completed:** 2026-08-14

## Overview

The Explorer panel's file tree is single-selection. Every action it offers — Copy Path, Cut/Copy to
the OS clipboard, Delete, Rename, drag into Windows Explorer, drag into a Links editor, drag into
another Persephone window's Explorer — operates on exactly one row. Windows Explorer and VS Code both
let the user build a set of files with Ctrl+click / Shift+click and then act on the whole set, and
every action the tree already has is naturally set-shaped: the clipboard IPC takes `string[]`,
`startOsFileDrag` takes `string[]`, `copyPathsInto` takes `string[]`, and the drag payload is already
`{ items: ILink[] }`. The single-item restriction lives almost entirely in two places: the UIKit
`Tree` primitive ("Single-select only — multi-select is out of scope for V1", `uikit/Tree/types.ts`)
and `TreeProviderViewModel.selectedValue: string | null`.

This epic adds a real multi-selection to the UIKit `Tree`, teaches the shared
`TreeProviderView`/`TreeProviderViewModel` plumbing to act on a set, and enables it — behind an
opt-in prop — for the Explorer panel only.

## Feasibility summary

Four findings shape the plan.

**1. The plumbing below the tree is already plural.**

| Operation | Existing signature | Plural today? |
|---|---|---|
| OS clipboard write | `api.clipboardWriteFilePaths(paths: string[], cut)` | yes (`os-clipboard.ts` passes `[path]`) |
| OS clipboard read/paste | `copyPathsInto(clip.paths, targetDir, …)` | yes |
| Native drag-out | `api.startOsFileDrag(paths: string[])` → `webContents.startDrag({ files })` | yes (`os-drag-service.ts` already branches on `files.length > 1`) |
| Trait drag payload | `LinkDragData { items: ILink[]; sourceId? }` | yes |
| Copy/move on disk | `copyPathsInto(paths, targetDir, { move, onProgress })` | yes |
| Provider import | `provider.importFiles(items, targetCategory)` / `importLinks(items, …)` | yes |
| Provider move | `provider.rename(oldPath, newPath)` (one item) / `moveToCategory(hrefs[], …)` | mixed |

So most of the work is *not* in the I/O layer. The exception is the file-provider move branch in
`TreeProviderViewModel.moveItems`, which is explicitly `remaining.length === 1`; it should route
through `copyPathsInto(paths, targetDir, { move: true })` — the same helper `dropOsFilesInto` already
uses, with its progress overlay and per-item error collection.

**2. The selection visuals need nothing new.**

The focus-aware selection look (`uikit/shared/selection-style.ts`) is pure CSS keyed off
`[data-selected]` per row, with the blue focused override scoped by `:focus-within` on the container.
N selected rows paint correctly with zero changes. Only the *active* (`[data-active]`) row is
inherently singular, which matches Explorer: many selected, one focused.

**3. `Tree` must own the range computation, but not the selection state.**

Range selection (`Shift+click`) is defined over the *flat visible row order*, which only `TreeModel`
knows (`rows` memo). But UIKit Rule 2 forbids a primitive owning its primary value. Resolution: the
Tree computes the resulting selection and emits it via a new `onSelectionChange`; the consumer stores
it and paints through the existing `isSelected` predicate. The Tree keeps only a transient anchor row
(allowed — it is not the primary value). `Tree` currently drops the click event
(`onClick={() => model.onItemClick(idx)}` in `Tree.tsx`), so the event must be threaded through to
read `ctrlKey` / `shiftKey`.

**4. Every other `TreeProviderView` consumer must be unaffected.**

`TreeProviderView` is shared by the Explorer, the Mneme tree, the Archive tree, the Links category
panel, the Script-library panel and the Boards panel. Multiselect is therefore an opt-in prop
(`multiSelect`), off by default, and the model's plural selection collapses to today's behavior when
the set holds one item. Consumers that don't opt in keep the single-select code path exactly.

## Goals

- Ctrl+click toggles a row, Shift+click extends a range from the anchor, plain click resets to one —
  Windows Explorer / VS Code semantics, including `Ctrl+A` and `Shift+Arrow` keyboard extension.
- Every existing Explorer action works on the whole selection: Copy Path, Cut, Copy, Delete, drag
  out to Windows Explorer, drag into a Links editor, drag into another window's Explorer, internal
  move by drop.
- Actions that are inherently singular (Rename, Make Root, Search in Folder, New File/Folder,
  Open Terminal here, the trailing "open dedicated editor" buttons) stay singular and are hidden or
  disabled when the selection holds more than one row.
- One confirmation for a batch, not N dialogs; batch progress and per-item error collection reuse the
  existing `ui.createProgress` + `copyPathsInto` pattern.
- Selection survives a refresh (FS watcher tick) and a restart, collapses to a single row when the
  main editor navigates to a file, and is always fully visible — collapsing a folder deselects its
  contents.
- No behavior change for the Mneme, Archive, Links, Script-library and Boards trees.

## Linked Tasks

| Task | Title | Status |
|------|-------|--------|
| US-937 | UIKit `Tree` multi-selection API — modifier clicks, range, `Ctrl+A`, `Shift+Arrow` | Completed |
| US-938 | `TreeProviderView` plural selection + context-menu / keyboard actions | Completed |
| US-939 | Multi-item drag-out and drop (OS drag, cross-window, internal move) | Completed |
| US-940 | Explorer wiring, persistence, docs and QA | Completed |

Strict order: US-937 is the primitive the other three build on. US-938 and US-939 both depend on
US-937's `onSelectionChange` and on each other only through `TreeProviderViewModel`'s new
`selectedValues` field, so US-938 lands first (it introduces the field) and US-939 consumes it.
US-940 turns the feature on and is the only task that touches `ExplorerSecondaryView` /
`ExplorerEditorModel`.

## Decisions

**D1 — Ctrl/Shift only; no checkbox column.** Matches VS Code and Windows Explorer, and keeps the
narrow sidebar free of extra chrome. (User decision, 2026-08-14.)

**D2 — Explorer only, shared plumbing.** The `Tree` and `TreeProviderView` changes are general, but
`multiSelect` is passed only by `ExplorerSecondaryView`. Other trees can opt in later with a one-line
change. (User decision, 2026-08-14.)

**D3 — The consumer owns the selection; `Tree` owns the range math.** `Tree` gains `multiSelect` +
`onSelectionChange`, derives the current set by running its existing `isSelectedAt` over the visible
rows, and holds only a transient anchor. Keeps UIKit Rule 2 intact and avoids two sources of truth.

**D4 — `onChange` remains the navigation signal.** A plain click fires `onChange` (navigate) *and*
`onSelectionChange`. A Ctrl/Shift click fires `onSelectionChange` only — building a set must not open
N tabs.

**D5 — Folders and files may be mixed in one selection.** Filtering is per-action: the OS clipboard
and drag-out take both; a move takes both; Rename/Make Root require exactly one.

**D6 — The file-provider move branch is rewritten onto `copyPathsInto`.** `moveItems`'s
`remaining.length === 1` restriction is replaced by the same batch helper `dropOsFilesInto` uses, so
a multi-item internal move gets collision confirmation, a progress overlay and error collection for
free. This is a behavior improvement for the single-item case too (progress on a large folder move).

**D7 — Selection is stored as hrefs, compared case-insensitively.** Matches the existing
`isSelected` comparison in `TreeProviderView` and the path handling throughout the file provider.

**D8 — A batch confirm states a count, not a name list.** `Do you want to delete N items?` — no
name enumeration, no `(+N more)` tail. The single-item confirm keeps its existing wording
(`Are you sure you want to delete "X"?`). (User decision, 2026-08-14.)

**D9 — Nested selection is pruned before every operation, not just on-disk ones.** When a folder and
anything under it are both selected, only the folder enters the operation — the descendant is already
affected by it. This applies uniformly to delete, move, OS-clipboard cut/copy, `Copy Paths`, and both
drag payloads (native and trait). One shared helper does it, so no call site can forget.
(User decision, 2026-08-14.)

Consequence: the *count* a user sees in a menu label or a confirm is the pruned count. Selecting a
folder plus two files inside it and pressing Delete asks "Do you want to delete 1 item?" — correct,
because one directory removal is what happens. The raw selection stays highlighted in the tree; only
the operation input is pruned.

**D10 — Only visible rows can be selected: collapsing a folder deselects everything under it.**
The user always sees the whole selection; there is no hidden selection inside a collapsed folder.
(User decision, 2026-08-14.)

This also matches how the data already behaves. `TreeProviderViewModel.buildTree` re-lists children
**only** for currently-expanded paths, so a collapsed folder's subtree is dropped from `state.tree` —
which is exactly why the view opts into `Tree`'s `collapseDescendants`. A selection surviving a
collapse would reference nodes absent from the tree data, and `selectedNodes` (which resolves through
`findNode`) would silently drop them at action time. D10 makes that defined behavior instead of an
invisible inconsistency.

Scope of the rule: deselection is triggered by an explicit collapse gesture (chevron, `ArrowLeft`,
`collapseAll`), **not** by a `buildTree` refresh. A refresh preserves effective expansion, and pruning
there would race the Explorer's reveal path — `adoptSelection` can set the selection to a navigated
file moments before `revealItem` expands its ancestors.

## Notes

Not in scope: a checkbox selection mode, multi-select for the other tree consumers, drag *reordering*
inside the tree, and multi-file Rename (a rename-pattern dialog is a separate idea for the backlog).

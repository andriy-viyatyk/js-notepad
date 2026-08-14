# EPIC-050: Folder-content view — multiselect and drag-and-drop

## Status

**Status:** Completed
**Created:** 2026-08-14
**Completed:** 2026-08-14

## Overview

Selecting a folder in the Explorer panel opens a **folder-content page** in the main area — the
`CategoryEditor` / `CategoryView` pair, showing that folder's children as a list or as tiles. It is
the Explorer's "list pane", and today it is the poor relation of the tree beside it: exactly one row
can be selected, every action works on that one row, and **nothing can be dragged into or out of
it**. Dropping files from Windows Explorer onto it doesn't file them into the open folder at all —
the window-level fallback in `GlobalEventService` opens them as tabs instead.

[EPIC-049](completed.md) brought the Explorer *tree* up to Windows-Explorer parity: Ctrl/Shift
multi-selection, plural Copy/Cut/Delete, multi-item drag-out to Explorer and Teams, cross-window
drops, batch internal moves. This epic does the same for the content view, so both halves of the
Explorer behave alike, and it reuses EPIC-049's plumbing rather than growing a second copy of it.

The same view also renders zip-archive folders, Mneme folders, Link-collection categories and the
Boards panel's folders. Those providers keep today's behavior exactly; the new capabilities turn on
only where they are meaningful (the local file provider), gated in one helper.

## Feasibility summary

Five findings shape the plan.

**1. The action layer is already plural and already written — but it is keyed on tree nodes.**

Every set-shaped operation this epic needs exists in `TreeProviderViewModel` after EPIC-049:

| Member | Line | Role |
|---|---|---|
| `operationItems` | 212 | D9 nested-selection pruning |
| `getMultiMenuItems` | 847 | `Copy Paths (N)`, `Cut (N)`, `Copy (N)`, `Delete (N)` |
| `deleteItemsAction` | 1134 | one confirm + progress + collected per-item errors |
| `moveItems` / `moveFilesInto` | 1204 / 1269 | batch internal move via `copyPathsInto` |
| `importFiles` | 1350 | byte import into a provider |
| `dropOsFilesInto` | 1387 | OS-file drop with Move/Copy choice + overwrite confirm |

The four drop actions take a `TreeProviderNode` target, but only ever read two things from it: a
**target directory path** (for `provider.list` and `copyPathsInto`) and a **display title** (for the
confirm text). So they are target-shaped, not tree-shaped, and can be lifted into a shared module
with the tree keeping a thin node→target adapter. `operationItems` has no external callers, so it
can move freely.

**2. Range math is easier here than in the tree, and needs no new primitive.**

`Tree` had to own Shift+click ranges because only `TreeModel` knew the flat visible row order
(US-937, decision D3). In the content view the visible order **is** `CategoryViewState.filteredItems`,
which the model already holds. So `CategoryViewModel` computes ranges itself and `LinksList` /
`LinksTiles` stay dumb: render from a selected-set, forward the click event. No anchor state, no
`onSelectionChange` protocol, no UIKit Rule 2 tension.

**3. `LinksList` / `LinksTiles` are shared with the Links editor, so every change must be additive.**

Both are also used by `LinkItemList`, `LinkItemTiles`, `LinkTagsSecondaryView` and
`LinkHostnamesNavigationPanel`. They take `selectedId?: string` today and neither forwards the click
event (`onClick={() => onSelect?.(link)}`). New props (`selectedIds`, drag/drop callbacks) default
off; `selectedId` stays.

**4. Drag needs building from nothing, but the pieces are all in place.**

`CategoryView` never passes `dragSourceId`, so its rows are not draggable at all. What it needs
already exists elsewhere: `api.startOsFileDrag(paths: string[])` for the native drag-out (the only
payload both Windows Explorer and Teams accept), `setTraitDragData` for in-process drags,
`getTraitDragDataFromEvent` + `resolveTraits` for reading a drop, and `GlobalEventService.captureDrop`
which already tags every OS file drop with an `IFileLink` trait descriptor before it reaches any
component. `LinksList`'s rows are `ListItem`s, which extend `React.HTMLAttributes<HTMLDivElement>` —
so `draggable`, `onDragStart`, `onDragOver`, `onDrop` pass straight through with no UIKit change.
The one gap is the **drop highlight**: `TreeItem` has `dropActive` → `data-drop-active`
(`TreeItem.tsx:117`), `ListItem` has no equivalent.

**5. The drop-to-open fallback must be suppressed deliberately.**

`GlobalEventService` registers `captureDrop` on capture and `handleFileDropFallback` on bubble
(`GlobalEventService.ts:128`/`141`); the latter opens dropped paths as tabs and is what happens
today. A content-view drop handler must call `stopPropagation()` — and must do so for whitespace
drops too, not just row drops, or dropping into the open folder will *also* open every file as a
tab.

## Goals

- Ctrl+click toggles, Shift+click extends a range, plain click resets to one, `Ctrl+A` selects all,
  `Delete` deletes the set, `Escape` collapses it — matching the tree and Windows Explorer.
- `Copy Paths (N)` / `Copy Hrefs (N)`, `Cut (N)`, `Copy (N)`, `Delete (N)` act on the whole
  selection, with labels and confirm wording identical to the tree's.
- Dropping files from Windows Explorer **into the view's whitespace** files them into the open
  folder; **onto a folder row or tile** files them into that folder. Move/Copy choice, overwrite
  confirm, progress, collected errors — the same experience as dropping on the tree.
- Trait drags from elsewhere in Persephone (the Explorer tree, another window's content view, a
  Links collection) drop into the view under the same rules; a same-provider drop is a move, a
  foreign one is an import.
- Dragging a selection **out** of the view hands N paths to the OS, so it can be dropped into
  Windows Explorer, Teams, or another Persephone window.
- Dragging onto a folder **inside** the view moves the selection into it.
- Actions that are inherently singular (Rename, Open, New File/Folder, Open Terminal here, Paste)
  stay singular and are absent from the plural menu.
- No behavior change for the archive, Mneme, Link-collection and Boards folder pages, and none for
  the Links editor's own list and tile views.

## Decisions

**D1 — Gate on the provider through a UI-layer helper, not a new `ITreeProvider` member.**
Add `supportsMultiSelect(provider)` beside the existing `supportsOsClipboard(provider)`, returning
`provider.type === "file"`. `io.tree.d.ts` is a script-facing type file bundled for IntelliSense; a
UI capability doesn't belong in it, five providers would have to declare it, and a boolean couldn't
express "the archive provider wants `Copy Paths (N)` without the file-clipboard items". Widening
later is a one-line change in the helper. (User decision, 2026-08-14.)

**D2 — The multi-selection lives in `CategoryViewModel`; `NavigationState.selectedHref` stays
singular.** It keeps meaning "the primary item", so the Explorer tree, `ExplorerEditorModel`'s
restore data, `ArchiveSecondaryView` and `VideoEditor`'s Explorer sync are all untouched. Selecting
five files in the content view therefore leaves one row highlighted in the tree — the same asymmetry
Windows Explorer has between its two panes.

**D3 — The content view's selection is transient.** Not persisted across restart, cleared when the
category or provider changes. The tree persists its `selectedHrefs` (US-940) because the tree *is*
the navigation state; a folder page is re-listed from scratch every time it opens.

**D4 — Same gestures as the tree, Shift tested before Ctrl.** Plain click selects one **and**
navigates; Ctrl+click toggles without navigating; Shift+click ranges from the transient anchor
without navigating. Copied from `TreeModel.onItemClick` (`TreeModel.ts:343`) so the two views can't
diverge.

**D5 — Right-click keeps a selection it lands inside, resets it when it lands outside.** Verbatim
from `TreeModel.onItemContextMenu` (`TreeModel.ts:399`).

**D6 — A plural menu replaces the single-row menu, and skips Layer 2.** With ≥2 pruned items the
menu is exactly `buildMultiItemMenuItems`' output — no Rename, no Paste, no Open. The
`app.events.linkContextMenu` channel is **not** invoked, because its handlers are written against a
single `event.target`. This is what `ExplorerSecondaryView` already does at Layer 3
(`if (selection.length > 1) return;`).

**D7 — Nested selections are pruned once, at each action's entry point, and every count the user
sees is the pruned count.** EPIC-049 D9 carries over unchanged: a folder plus two files inside it
deletes as `1 item`.

**D8 — Only *visible* items participate in an action.** The tree's D10 (collapsing deselects)
becomes: every plural action reads `selectedHrefs ∩ filteredItems`, so rows hidden by the search
filter are never acted on. The selection itself is not pruned on each keystroke — clearing the
search brings the rows back highlighted.

**D12 — Per-row action buttons stay singular and always confirm.** The trailing hover edit / delete
buttons on a row act on that row, never on the selection, and `Ctrl` does not skip the delete confirm
in this view. `CategoryView` already drops the `skipConfirm` argument (`CategoryView.tsx:246`), so
this is mostly a matter of not regressing it — and of not letting a `Ctrl`+click on those buttons
double as a selection toggle. (User decision, 2026-08-14.)

**D9 — Whitespace is a first-class drop target, and it means the open category.** Not "the provider
root" — the page always shows one folder, and that folder is the target. Dropping onto a *file* row
targets its parent, which is the same folder; that keeps the tree's "drop on a file → drop in its
folder" rule without a special case.

**D10 — Drag-out is a native OS drag for file providers, not an HTML5 trait drag.** Exactly the
tree's choice (`TreeProviderView.tsx:216`): `webContents.startDrag` is the only payload Windows
Explorer and Teams both accept, and a native drag dropped back inside a Persephone window re-enters
as an ordinary OS file drop, so one gesture serves both external and internal targets. Windows shows
no count badge for a multi-file drag and Electron exposes no way to compose one — accepted.

**D11 — Shared code moves to one module before either feature is built.** `US-941` extracts
EPIC-049's plural and drop actions into `plural-actions.tsx` / target-shaped drop helpers and rewires
the tree onto them with zero behavior change, so the content view consumes them rather than copying
them. Two implementations of the same confirm wording and the same D9 rule would drift.

## Linked Tasks

| Task | Title | Status |
|------|-------|--------|
| US-941 | Extract EPIC-049's plural + drop actions into shared, target-shaped helpers | Done |
| US-942 | `CategoryView` multi-selection — gestures, plural menus, keyboard | Done |
| US-943 | Drop **into** the folder page — OS files, whitespace and folder rows | Done |
| US-944 | Drag **out** of the folder page + internal move onto a folder row | Done |
| US-945 | Live-refresh the folder page from the provider's `watch` | Done |

US-945 was not planned. It came out of testing US-943: a drop made *in* the folder page refreshed the
tree beside it, but a move made *in the tree* left the folder page showing a stale listing. The tree
had had live refresh all along through an opt-in `provider.watch`, and the folder page simply never
subscribed.

Strict order. US-941 is a pure refactor and must land first — US-942 and US-943 both consume its
helpers. US-942 before US-943/944 because both drag tasks need `selectionItems()` and the pruning
entry point it introduces. US-944 last: it is the only task that can be dropped without leaving the
feature half-built, since drag-out is additive to a view that by then already selects and receives
drops.

Per the epic deferred-review model, `/review`, `/document` and `/userdoc` run once at epic close,
not per task.

## Notes

Not in scope: multi-select or drag for the archive / Mneme / Link-collection / Boards folder pages
(a one-line widening of D1's helper when someone wants it); drag *reordering* within the view;
multi-file Rename; persisting the content-view selection; a checkbox selection mode (EPIC-049 D1
rejected it for the tree, same reasoning here); and any change to `NavigationState`.

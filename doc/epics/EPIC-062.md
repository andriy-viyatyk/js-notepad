# EPIC-062 — De-React Epic E4: delete the React `RenderGrid` contract

**Status:** Active
**Created:** 2026-08-24
**Roadmap:** [de-react.md](../de-react.md) §7 "Epic E"
**Predecessors:** [EPIC-059](EPIC-059.md) (E1 — seams), [EPIC-060](EPIC-060.md) (E2 — editor bodies),
[EPIC-061](EPIC-061.md) (E3 — the Monaco wrapper)

---

## The closing property

`uikit/RenderGrid/` **is deleted from the tree**. Concretely, all seven files
(`RenderGrid.tsx`, `RenderFlexGrid.tsx`, `RenderGridModel.ts`, `renderInfo.ts`,
`rerender-check.ts`, `types.ts`, `index.ts` — 2,315 lines) are gone, `uikit/index.ts` no longer
re-exports them, and `grep -rn "RenderGrid" src/` returns nothing.

That is compiler-checkable and it **collects two removal-ledger entries** — `uikit/RenderGrid/` and
`uikit/RenderGrid/RenderFlexGrid.tsx` — which have been open since C3.

---

## E4-1 — The epic is again scoped by the contract it deletes

[EPIC-060 E2-1](EPIC-060.md) established that a conversion epic should be defined by the shared
contract it can delete, and fall back to line count only where no contract exists. EPIC-061's
closing note said E4 onward would be line-count epics, because both *editor-wide* contracts were
gone.

**That is wrong, and this is the correction.** A shared contract does exist — it simply is not owned
by `editors/`. `uikit/RenderGrid/`'s cell contract returns a `ReactNode`:

```ts
export type RenderCellFunc = (p: Omit<RenderCellParams, "key">) => ReactNode;
```

Every consumer of that type must hand React back, so every consumer is pinned to React by the
primitive it renders through. It is exactly the same shape as `EditorModule.Body` and the Monaco
wrapper: one type whose deletion is the epic's definition of done. Line count remains the fallback
for E5 onward.

The roadmap's Epic E section and the removal ledger are updated to say so.

**Measured surface at epic open (2026-08-24):**

| | Files | Lines |
|---|---:|---:|
| React render sites (`<RenderGrid>` / `<RenderFlexGrid>`) | **4** | — |
| `RenderGridModel`-only importers outside `uikit/` | **8** | — |
| Cell subtrees dragged in by those 4 render sites | — | **~4,437** |
| `uikit/RenderGrid/` itself (deleted at close) | 7 | **2,315** |
| New `uikit/` primitive written (E4-2) | 1 | ~250 |

The four render sites are `link-editor/LinksList.tsx:292`, `link-editor/LinksTiles.tsx:405`,
`log-view/LogBody.tsx:128`, and `notebook/NotebookBody.tsx:156`. Everything else that names
`RenderGrid` imports `RenderGridModel` or a type, which is a repointing rather than a conversion —
the same 4-render / 9-repoint split EPIC-059 measured, now down to 4 and 8.

---

## E4-2 — `RenderFlexGrid` is a wrapper, not an engine — the ledger overstated it

The removal ledger has carried this entry since C3:

> `uikit/RenderGrid/RenderFlexGrid.tsx` — Variable-height virtualization with no av-grid
> counterpart

**Read against the source, that is overstated in a way that materially shrinks this epic.**
`RenderFlexGrid.tsx` implements no virtualization at all. It is 241 lines that render
`<RenderGrid>` with one prop replaced: it maintains a `rowHeights: number[]` from a per-row
`ResizeObserver`, debounces commits at 50 ms, clamps to `min`/`max`, and passes
`rowHeight={state.rowHeight}` — a `(row: number) => number` — down to the real engine.

And the vanilla engine **already accepts that shape**. `uikit/VirtualGrid/types.ts:191` declares
`rowHeight: ElementLength`, where `ElementLength = number | ((v: number) => number | Percent)`.

So what is missing is not variable-height virtualization; it is the **measurement wrapper**. The
work is to write `VirtualFlexGridView` — the same debounced-`ResizeObserver` bookkeeping over
`VirtualGridView` instead of `RenderGrid` — which is a genuine new `uikit/` primitive but a
bounded one, and it is demanded by two real conversions rather than added in advance
(EPIC-053 B14).

This is the fourth time this programme has found an inherited estimate wrong by reading the source
instead of the note, and the second time the error was in the *nature* of the work rather than its
size (E3's "trivial lifecycle swap" was actually a control inversion). The generalisation is
recorded in Rule 4 below.

---

## E4-3 — A virtualized cell may not host a React root

This is the decision that sets the epic's real size, and it is [E1-8](EPIC-059.md)'s argument
applied to rows instead of chrome.

The two-way boundary (§5) means a vanilla view *can* host React through `mountReact`, and that is
how `components/tree-provider/CategoryViewImpl.ts` renders the React `LinksList` today. In a
virtualized surface it is the wrong tool. A cell subtree hosted in a React root would mean roughly
one root per visible row — about twenty for a log view — **created and destroyed continuously as
the user scrolls**, against one root for the whole editor today. E1-8 rejected converting the
`editors/base` chrome early on exactly this metric ("up to six React roots per open editor against
one today"); a churning per-row root is the same trade at higher frequency.

**Therefore: converting a grid consumer converts its entire cell subtree.** That is why this epic
reaches into three editors rather than four files:

| Consumer | Cell subtree | Lines |
|---|---|---:|
| `LinksList.tsx` | `LinksListRow` (private, same file) | 307 |
| `LinksTiles.tsx` | tile renderer (private, same file) | 418 |
| `NotebookBody.tsx` | `NoteItemView`, `ExpandedNoteView`, `note-editor/*` | 1,414 |
| `LogBody.tsx` | `LogEntryWrapper` → `LogEntryContent` → 15 `items/*` views | 1,661 |

The log-view and notebook entries are effectively "convert this editor", which is the honest way to
describe them. They are also the two that carry the epic's real risk, and they are sequenced
accordingly (E4-8).

---

## E4-4 — Rule 1 governs boundaries with independent consumers, not private helpers

Rule 1 ("never convert a component and its parent in the same change") would, read literally,
require `LinksListRow` to convert in a separate task from `LinksList`. That would be ceremony: the
row is a private function in the same file with no other importer, so there is no boundary for
either side to stay fixed *at*.

**Verified, not assumed** — consumers of each cell-subtree root:

| Component | Consumers |
|---|---|
| `LinksListRow` | `LinksList.tsx` only (same file) |
| `LogEntryWrapper` | `LogBody.tsx` only |
| `NoteItemView` | `NotebookBody.tsx` only |
| `ExpandedNoteView` | `NotebookBody.tsx` only |

So each cell subtree converts in one task with its host. Rule 1 continues to hold where it means
something — at `LinksList` and `LinksTiles`, which do have independent consumers (E4-5).

---

## E4-5 — Rule 2 is kept here; this is not a fourth exception

The programme has three documented Rule 2 exceptions (C3-1, C4-2, E1-3). This epic adds none.

`LinksList` and `LinksTiles` have **six and four consumers** respectively, and they are on both
sides of the boundary: `components/tree-provider/CategoryViewImpl.ts` is already a `VanillaView`,
while `editors/category/CategoryEditor.tsx` is React. Their React-facing signatures therefore stay
exactly as they are, and each keeps a thin `mountVanilla` face — the `MonacoEditorHost.tsx` shape
from E3.

There is an incidental win in `CategoryViewImpl.ts`: it renders React `LinksList`/`LinksTiles` from
a vanilla view, so once those are vanilla, a `mountReact` root disappears rather than being
preserved. That is counted in Rule 4 below.

---

## E4-6 — Rule 4: the notebook Monaco churn, inherited from E3

[EPIC-061 E3-6](EPIC-061.md) measured real Monaco churn in the notebook — a `MiniTextEditor` is
constructed and destroyed each time a note row scrolls out of view and back — attributed it to a
React `key`, and **withdrew the target** when the cause turned out to be
`RenderGrid/renderInfo.ts:314` keying virtualized cells by row index rather than item identity. It
handed the measurement forward to "whichever epic takes the `RenderFlexGrid` ledger entry."

**That is this epic**, so this epic owes the number. The baseline is recorded in EPIC-061; the
target is **0 Monaco editor constructions per scroll round trip** in the notebook, measured on
`C:\data\js-notepad-notes\temp\test.note.json`.

Two things make it reachable here where it was not reachable in E3:

- The cause is now in scope. E3 could not fix an engine it was not converting.
- `uikit/VirtualGrid/CellPool.ts` exists and is the mechanism: cells are **recycled**, not
  destroyed. A row scrolling out returns its element to the pool and the next admission takes it
  back, so the Monaco host inside it never has to be constructed twice.

E4-7 is what makes that safe, and it is also the thing most likely to go wrong.

**The standing check E3 recorded applies to this number too:** a before/after measurement is not
evidence about a cause until the cause has been located in source. The cause is located
(`renderInfo.ts:314`), which is the only reason this target is being restated rather than dropped.

**Secondary numbers, both structural:** `RenderGrid` importers 12 → 0; React roots inside
`CategoryViewImpl.ts` 1 → 0.

---

## E4-7 — The cell-reuse contract for owned child views

`CellPool.ts`'s own documentation states the hazard plainly:

> `release()` does **not** reset the element. It arrives at its next occupant with the same
> children, classes, attributes and event listeners it had before. […] a cell renderer that
> recycles is responsible for overwriting everything it sets.

For a cell whose content is text and classes, that is a straightforward win. For a cell that owns a
`VanillaView` — a Monaco host, a mermaid render, an image — it is the whole design question, and it
has two failure modes pointing in opposite directions:

- **Dispose on eviction and construct on admission.** Correct, and it reproduces exactly the churn
  E4-6 exists to remove.
- **Reuse blindly.** Fast, and the recycled cell shows the *previous* row's note until something
  else forces an update — which is §6.1's masked-defect class, in its most literal form.

**The plumbing already exists** — verified at epic open, and it changes E4-7 from a design problem
into a policy one. `VirtualGrid/types.ts:148-169` gives the cell renderer two distinct handles:

- `previous?: HTMLElement` — "the element already rendered at this coordinate […] the cell is being
  re-rendered because it went dirty, not because it just scrolled into view." Preferred, because
  "anything living on the element survives — focus, an open editor, a running transition."
- `recycle?: RecycleFunc` — an element from the pool, arriving "in **whatever state its previous
  occupant left it**".

The distinction is the whole contract, and the trap is that **`previous` is keyed by coordinate, not
by item identity** — `key` is still `` `${row}_${col}` ``. So `previous` means "the same cell
position", which after a scroll is a *different note* in the same slot. A renderer that treats
`previous` as "same content, nothing to do" produces §6.1's masked defect exactly.

**The decision: a recycled cell re-points its owned views rather than recreating them, and the
re-point is an explicit, total write — for `previous` and `recycle()` alike.** A cell renderer that recycles must set every field it owns
on every admission, including the ones that happen to be unchanged, because "unchanged" is relative
to a previous occupant it cannot see. The imperative host APIs E3 built are already the right shape
for this: `MonacoEditorHostView.setValue()` compares against the live model and returns early, so a
total write is cheap when it is redundant and correct when it is not.

Practically this means the cell renderer needs a per-element record of what it built — VSCode's
`renderTemplate` / `renderElement` split (§3.4), which is the same "build once, keep named
references, update in place" shape the whole programme uses. `WeakMap<HTMLElement, CellParts>` is
the natural home for it.

**E3's design decision is what makes E4-6 reachable, and this is worth recording as a payoff.**
EPIC-061 E3-3 chose *uncontrolled* Monaco hosts with imperative `setValue()` / `update(props)` over
the wrapper's controlled props, and rejected Codex's controlled-prop reconciliation twice. A
recycled cell needs exactly that API: it must re-point a live editor at different content without
recreating it, which a controlled `value` prop cannot express and an imperative total write can —
`setValue` already compares against the live model and returns early, so the redundant case is free.
The chain is therefore complete without new primitives: `previous`/`recycle()` yields the element,
the `WeakMap` yields its owned views, and E3's host API re-points them.

---

## E4-8 — Task order

Sequenced so the two risky conversions happen while the epic can still absorb a redesign, and so
the pilot does not depend on the new primitive:

1. **US-1062 — `LinksList` → `VirtualGridView`.** The pilot. Fixed row height, so it needs no new
   primitive; the row is private and in-file; it establishes the `RenderGrid` → `VirtualGrid`
   conversion pattern and the E4-7 cell-parts record on the simplest possible cell.
2. **US-1063 — `VirtualFlexGridView`.** The measured-height wrapper (E4-2), with a story, written
   against the pilot's cell-parts pattern.
3. **US-1064 — `NotebookBody` and its cell subtree.** The hardest consumer and the one carrying
   Rule 4. Deliberately second-of-the-flex-pair, not last: if the E4-7 contract is wrong, this is
   where it shows, and there must be epic left to fix it in.
4. **US-1065 — `LogBody` and its cell subtree.** 1,661 lines but mechanical once US-1064 has
   validated the primitive; 15 leaf item views that convert independently.
5. **US-1066 — `LinksTiles` plus the eight `RenderGridModel` repointings.** The remaining
   link-editor consumers (`LinkItemList`, `LinkItemTiles`, the two panels) and the two
   `tree-provider` files.
6. **US-1067 — Delete `uikit/RenderGrid/`.** The closing property, plus both ledger entries and
   the `uikit/index.ts` exports. Its own task, per E3's precedent (US-1061) — a removal that lands
   with a conversion hides which of the two broke something.

---

## Concerns

1. **`LinksList`'s `faviconVersion` is a predicted §6.1 masked defect.** `LinksList.tsx:224` holds
   `const faviconVersion = useFavicons(links)` and lists it in `renderCell`'s dependency array with
   an eslint-disable explaining it "bumps on favicon load to force re-render of cells (no direct
   read in body)". It is a version counter whose only purpose is to trigger reconciliation.
   Converted code has no incidental re-render, so **favicons will silently never appear** unless the
   conversion gives that signal an owner — a subscription that repaints the affected rows. §6.1's
   prescription applies directly: give the work an owner rather than restoring a blanket repaint.
   This is the single most likely defect in US-1062 and it should be verified live, not reasoned
   about.

   **Verified at epic open, and the owner already exists.** `components/icons/favicon-cache.ts:144`
   exports `onFaviconReady(hostname, callback)` — a framework-free, one-shot subscription
   (`notifyListeners` deletes the list after firing). `useFavicons` at `:168` is nothing but a React
   shim that converts those callbacks into a version counter. So the vanilla view subscribes
   directly and repaints only the rows whose hostname resolved, which is **strictly better than the
   React path**, where any one favicon re-rendered every visible cell. Note the hook has *two* arms
   and both need an owner: the `onFaviconReady` subscription, and the `getFaviconPath(...).then()`
   disk-check resolution at `:185`, which bumps the version with no listener involved.

2. **`NotebookBody.tsx:2` imports `createPortal`.** One of the portal hosts Epic P routed through a
   shared helper (P5). The vanilla equivalent is an `appendChild` to the layer element; check
   whether the shared helper's non-React arm already covers this call site before writing a new
   one.

3. **`uikit/shared/highlight.ts`'s React form becomes partially collectable.** Its ledger entry
   names five editor consumers: `GraphBody`, `LinksList`, `LinkCategoryPanel`, `ExpandedNoteView`
   and `NoteItemView`. **Three of those five are inside this epic** (LinksList, ExpandedNoteView,
   NoteItemView). The entry cannot be collected here — `GraphBody` is E5-or-later — but the epic
   must update it with the remaining count rather than leave it reading as five.

4. **`Panel` drains further but does not close.** All four grid consumers wrap their grid in
   `<Panel>`; the vanilla path is `Panel/panel-style.ts`'s `createPanelElement`, already used at 84
   sites. Record the new count at close; do not attempt the entry.

5. **The debounce is load-bearing and easy to lose.** `RenderFlexGrid` commits row heights on a
   50 ms per-row debounce specifically so intermediate `ResizeObserver` values do not cause visible
   jumps, and it keeps *pending* and *committed* heights in separate arrays to that end. It also
   has a `preferMinHeightForNewRows` flag whose comment names the log view as the reason. A
   from-scratch rewrite of `VirtualFlexGridView` that treats these as incidental will reintroduce
   the jumps they were added to fix. Port the bookkeeping deliberately.

6. **The repaint channel is verified present and is a recompute.** `VirtualGridModel.update(rerender?:
   RerenderInfo)` at `:434` accepts `{ rows: [n] }`, coalesces bursts onto a microtask, and calls
   `updateRenderInfo()` — a geometry recompute, not a bare repaint, which is what a row-height change
   requires (§6.1: "a repaint cannot change what `calcRenderInfo` already decided"). The model's own
   comments at `:300` and `:550` already carry that lesson. This does **not** make
   `RenderFlexGrid`'s 50 ms debounce redundant: the microtask coalescer batches within a tick, while
   the debounce suppresses intermediate `ResizeObserver` values across ticks. Both are needed, for
   different reasons.

7. **`RenderGridModel` is React-coupled at the import line** (`import React, { CSSProperties,
   HTMLAttributes }`), so the eight repointings in US-1066 are not pure type substitutions — check
   each against `VirtualGridModel`'s actual surface rather than assuming parity, which is the C4
   lesson (the two models "meaning different things by the same method name" was E3's recurring
   defect shape three times over).

8. **Two `renderInfo.ts` / `rerender-check.ts` pairs exist** — one in `RenderGrid/` (704 + 348) and
   one in `VirtualGrid/` (796 + 380). They are the React and vanilla forks of the same geometry.
   US-1067 deletes the React fork; confirm no consumer has come to depend on a behavioural
   divergence between them before doing so.

---

## Testing owed

*(Empty at open. Every live verification, and every item deliberately **not** verified live, is
recorded here as tasks close — per the discipline established in EPIC-060 and EPIC-061.)*

---

## Notes

**Per-task commit authorization for this epic only.** The user's "proceed with next epic" is taken
as authorization to commit per task within EPIC-062, as it was for EPIC-060 and EPIC-061. As in
both of those, it **does not generalise past this epic.**

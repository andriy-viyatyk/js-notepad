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

### The baseline, measured on the live React build

*Taken 2026-08-24, before US-1064, on the dev build at commit `7d6787d6`, fixture
`C:\data\js-notepad-notes\temp\test.note.json`.*

Procedure — the one available given that MCP `execute_script` cannot reach imported modules and so
cannot patch `monaco.editor.create` (see the verification notes): stamp every `.monaco-editor`
element in the document with a `data-probe` attribute, then scroll the notebook's
`.scroll-container` from 0 to 4800 in 400px steps and back to 0, re-stamping after each step with a
300ms settle. **An unstamped editor is a construction**, because a recycled or preserved editor
keeps the attribute it was stamped with.

Geometry: scrollHeight 6089, viewport 962, three variable-height cells live at a time (147 / 486 /
482 px — the flex case, not a fixed grid).

| Result | Value |
|---|---|
| Constructions over one round trip | **8** |
| Live editors at any moment | 1–3 |
| Constructions attributable to the initial paint | 1 |
| **Churn — constructions after the first** | **7** |

Two passes are worth naming individually, because they are the defect rather than a proxy for it:

- **`scrollTop 0 → 400` constructed a new editor** while the live count stayed at 1. A 400px scroll
  — less than half a viewport, the same note still on screen — rebuilt it.
- **The return to 0 constructed a new editor** (`back0:live1:new1`). The row-0 note was built at the
  start of the sweep and built again on arriving back at the same coordinate. That is
  `renderInfo.ts:314` keying by row index, caught in the act.

So the target is now stated against a measured number rather than an inherited claim: **0 after the
initial paint**, i.e. `8 → 1`. A post-conversion sweep that reports any `new` count on a pass other
than the first fails Rule 4, and the return-to-0 pass is the sharpest single check — it is the one
that cannot be explained by a note simply being reached for the first time.

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

**And the pattern is not new either — it is shipped, and this epic adopts it rather than inventing
it.** `uikit/ListBox/ListBoxView.ts` has implemented exactly this policy since C3:
`:30-45` documents the record (*"Do not 'helpfully' clear elements in `CellPool.release()`: this
view depends on the opposite"*), `:74-75` holds the `WeakMap<HTMLElement, CellRecord>` plus a `Set`
retaining every view so the pool cannot hide one from disposal, and `:297-343` is the renderer —
`record.index = p.row` rewritten unconditionally, `view.update(props)` as a total write on every
admission, and recreation **only** when the cell's *kind* changes. `:410-423` adds `activeRecord`
and `releaseCell`.

That is the E4-7 policy in full, already in the tree. US-1062's job is therefore to adopt it and
document where `LinksList` must differ (the tooltip attachment and the drag listeners are the likely
two), not to establish it — which is worth more to US-1064/1065 than a fresh pattern would be. It is
also VSCode's `renderTemplate` / `renderElement` split (§3.4), the same shape the whole programme
uses.

**A trap the precedent also documents** (`ListBoxView.ts:52-56`), and the one most likely to be lost
in translation: **`renderCell` must be a bound field, not a closure.** `VirtualGridModel.inputChanged()`
compares it by identity, so a per-update closure makes the engine repaint every visible cell on every
update — which is what the React version did and what the repaint gate exists to stop (§6.1's first
instance, US-1014). Every converted consumer in this epic currently holds its renderer in a
`useCallback` with a long dependency list, so the literal translation is the defect. The consequence
is the point, not a limitation: because the identity never changes, a favicon or selection change
reaches the DOM **only** through an explicit `model.update({ rows })`.

**E3's design decision is what makes E4-6 reachable, and this is worth recording as a payoff.**
EPIC-061 E3-3 chose *uncontrolled* Monaco hosts with imperative `setValue()` / `update(props)` over
the wrapper's controlled props, and rejected Codex's controlled-prop reconciliation twice. A
recycled cell needs exactly that API: it must re-point a live editor at different content without
recreating it, which a controlled `value` prop cannot express and an imperative total write can —
`setValue` already compares against the live model and returns early, so the redundant case is free.
The chain is therefore complete without new primitives: `previous`/`recycle()` yields the element,
the `WeakMap` yields its owned views, and E3's host API re-points them.

---

## E4-9 — `onGridModel` is typed against a capability, not a model class

*Taken during US-1062 plan review, 2026-08-24.*

`LinksList` hands its grid model out to callers through `onGridModel?: (m: RenderGridModel | null)
=> void`, and there are **nine** declarations of that type across the boundary — `CategoryViewModel`,
`CategoryViewImpl`, `CategoryEditor`, `LinkItemList`, `LinkItemTiles`, the two link-editor panels,
`LinkEditor.gridModel`/`setGridModel`, and `LinkBody`. The vanilla view can only honestly hand out a
`VirtualGridModel`, and the two forks are not interchangeable classes.

The investigation proposed either repointing every declaration to `VirtualGridModel` or taking a
Rule 2 exception. **Both are wrong, and a cast is prohibited outright.** Every one of those consumers
uses exactly two members — `update(rerender?)` and `scrollToRow(row, align)` — and the signatures are
identical on both forks (`VirtualGridModel.ts:650` and `RenderGridModel.ts:505` are both
`async scrollToRow(row: number, rowAlign: RowAlign = "nearest")`).

**The decision: `onGridModel` is typed against a narrow capability interface naming those two
members, exported from `uikit/VirtualGrid/`.** Both models satisfy it structurally. That buys three
things a class-typed repoint does not:

- **Rule 2 stays intact.** The programme's documented exception count stays at three (C3-1, C4-2,
  E1-3); this epic adds none.
- **The boundary files repoint once**, to a stable name, instead of churning again in US-1066 when
  the remaining link-editor consumers convert.
- It names **precisely the subset that must stay parallel** across the two forks, which is the honest
  form of the fork-parity hazard rather than a nominal class incompatibility. Three of EPIC-061's
  defects were two implementations "meaning different things by the same method name"; an interface
  is where that is stated rather than hoped for.

---

## E4-10 — `getAdditionalIcon` is Epic P residue, not an exception

*Taken during US-1062 plan review, 2026-08-24.*

`LinksList.tsx:189` declares `getAdditionalIcon?: (link: ILink) => React.ReactNode`, and E4-3
forbids the cell from hosting a React root. The investigation read this as a conflict needing either
a Rule 2 exception or a documented partial failure of E4-3.

It is neither. The roadmap settles this class of prop in Epic P item 1, verbatim: *"Rule 2 ('preserve
the React-facing signature') cannot save these, **because the signature *is* React.** Each becomes
either a data descriptor (icon name + props) or a neutral slot callback."* This is one of the 109
files Epic P was chartered to convert and never reached — scheduled programme work, not an exception.

**The decision: change it to a DOM-capable descriptor and update the caller.** It is nearly free —
the only live caller is `LinkItemList.tsx:141-143`, returning
`pinnedLinkIds.has(link.id) ? <PinFilledIcon width={16} height={16} /> : null`, which is an icon name
plus a size. Reuse the established descriptor shape (`theme/icon-registry`, `renderIcon`'s `IconRef`,
`components/icons/icon-elements.ts`'s DOM builders) rather than inventing one. A temporary React slot
for one residual producer, and a new "DOM conversion contract" for React nodes, are both worse than
converting a single call site.

---

## E4-11 — A flex cell measures a nominated content element, not the positioned cell

*Taken 2026-08-24, before the US-1064 plan review, by reading US-1063's shipped primitive against
the React original.*

`VirtualFlexGridView` as delivered in US-1063 measures the element `renderCell` returns:

```ts
applyCellStyle(cell, p.style);                                    // sets s.height = `${style.height}px`
this.rowByElement.set(cell, p.row);
this.observer?.observe(cell);
this.measurement.setRowHeight(p.row, cell.clientHeight);          // reads back what was just written
```

**That measurement is a tautology.** `applyCellStyle` (`cell-style.ts:11`) writes an explicit
`height` onto the positioned cell, and that height comes from `CellStyle`, which the engine computes
from `rowHeight` — which `gridOptions()` wires to `measurement.rowHeight`. So the view reports the
model's own guess back to the model. `setRowHeight` then returns early on `pendingHeights[row] ===
applyHeight`, and the `ResizeObserver` is no better: the outer cell's size changes only when the
engine changes it. Committed heights would never converge on content height — every row would keep
whatever `getInitialRowHeight` / `lastRowHeight` / `minRowHeight` produced first.

The React original does not have this bug, and the reason is visible in its API: `RenderFlexCellParams`
carries a **`ref`** (`RenderFlexGrid.tsx:15`), the cell subtree attaches it to its own root, and the
observer watches *that* element (`:45-47`), with a re-attach effect for when "React reuses component
but renders different content" (`:59-68`). In the notebook that element is `NoteItemView.tsx:147-155`
— a `div` with `height: "fit-content"`, i.e. content-driven by construction. The outer positioned
cell was never the thing being measured.

**The decision: `VirtualFlexCellParams` gains a `measure(element)` callback, and the flex view
observes and reads the nominated element.** It is the direct vanilla translation of the React `ref`,
and it is preferred over the two alternatives:

- **Measuring `cell.firstElementChild`** — positional, silently wrong for any consumer that wraps
  its content, and undiscoverable at the call site.
- **Dropping the explicit height so the cell is content-sized** — this breaks `maxRowHeight`. The
  notebook passes `maxRowHeight: 800` (`NotebookBody.tsx:164`) and relies on the styled cell to clip
  an over-tall note; an auto-height cell would render its full height and overlap its neighbour,
  since the engine still positions by committed geometry.

Consequences the implementation must honour, all of them E4-7's total-write rule applied to
measurement:

- `measure()` is called on **every** admission, `previous` and pooled alike — the nominated element
  changes when a recycled cell's subtree is rebuilt for a different note kind.
- The view keys `rowByElement` on the **nominated** element, and needs cell → nominated so
  `onCellReleased` unobserves the right node.
- A consumer that never calls `measure()` falls back to the cell itself, which preserves US-1063's
  current behaviour for a fixed-height consumer rather than breaking it.

**This is why E4-8 put US-1063 and US-1064 adjacent.** The epic said the primitive "has never been
exercised live"; its first consumer is where that had to surface, and the fix lands in US-1064 rather
than as a retro-fix to a task already called done.

---

## E4-8 — Task order

Sequenced so the two risky conversions happen while the epic can still absorb a redesign, and so
the pilot does not depend on the new primitive:

1. **US-1062 — `LinksList` → `VirtualGridView`.** The pilot. Fixed row height, so it needs no new
   primitive; the row is private and in-file; it establishes the `RenderGrid` → `VirtualGrid`
   conversion pattern and the E4-7 cell-parts record on the simplest possible cell.
2. **US-1063 — `VirtualFlexGridView`.** The measured-height wrapper (E4-2), with a story, written
   against the pilot's cell-parts pattern.
3. **US-1068 — Remove the React roots from `PathInputView`.** Added during the US-1064 plan review.
   `PathInputView.tsx:222` still mounts a React bridge, and the notebook's category and tag editors
   put it inside a virtualized cell, so E4-3 forbids using it as it stands. It is a separate task
   because it fails the E4-4 test that governs the rest of this epic: unlike `NoteItemView`, which
   is private to `NotebookBody`, `PathInput` has four independent consumers outside the notebook
   (`EditLinkDialog.tsx`, `TagsInput.tsx`, `TagsInputView.ts`, `storyRegistry.ts`), so Rule 1
   applies for real. Keeping it out of US-1064 also keeps the risks separable: if autocomplete
   regresses, it must regress in a task whose only claim is "PathInput has no React root", not
   entangled with the Monaco recycling proof. Small and mechanical — `AutocompleteView`,
   `SelectView` and `MultiSelectView` already pass a native `contentView` to `PopoverView`.
4. **US-1064 — `NotebookBody` and its cell subtree.** The hardest consumer and the one carrying
   Rule 4. Deliberately second-of-the-flex-pair, not last: if the E4-7 contract is wrong, this is
   where it shows, and there must be epic left to fix it in. It also carries E4-11's correction to
   US-1063's primitive, because it is that primitive's first consumer.
5. **US-1065 — `LogBody` and its cell subtree.** 1,661 lines but mechanical once US-1064 has
   validated the primitive; 15 leaf item views that convert independently.
6. **US-1066 — `LinksTiles` plus the eight `RenderGridModel` repointings.** The remaining
   link-editor consumers (`LinkItemList`, `LinkItemTiles`, the two panels) and the two
   `tree-provider` files.
7. **US-1067 — Delete `uikit/RenderGrid/`.** The closing property, plus both ledger entries and
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

*(Every live verification, and every item deliberately **not** verified live, is recorded here as
tasks close — per the discipline established in EPIC-060 and EPIC-061.)*

### US-1062 — verified live, 2026-08-24

Run under `npm start` after the user closed the production instance. Fixtures:
`C:\data\js-notepad-notes\temp\test.link.json` (17 real links, `www.youtube.com`), plus two
generated ones — 300 rows for scrolling and 60 rows with two pinned ids.

| Check | Result |
|---|---|
| **Favicons appear untouched** (Concern 1) | **Pass.** Cold memory cache on a fresh start against a warm disk cache (`www.youtube.com.png`); 6 `<img>` resolved to `cache-miscavicons\www.youtube.com.png` with no interaction with the list. The masked defect does not occur. |
| Geometry | Editor 1284×1024, links scope 1028×960, scroll content 7220px in a 960px viewport — virtualization live. |
| **Cell identity through a scroll round trip** (E4-7) | **Pass.** Every rendered cell's inline `top` mapped to its own row: 41 ok / 0 mismatch at rest, 40/0 at the bottom, 41/0 on return. |
| **Selection survives recycling** | **Pass**, and this is the strongest single result. Selecting row 5 gave exactly one `aria-selected="true"`; scrolled to the bottom **zero** rows claimed selection — no recycled cell inherited it — and on return exactly `ROW-0005` again. The re-point writes `aria-selected` back to `false`, which is the total-write policy behaving. |
| Parent → child update path | **Pass.** Selection is owned by the React `LinkItemList` parent, so this also exercises React parent → `mountVanilla` face → `view.update` → row repaint. |
| **Pin icon** (E4-10) | **Pass, and precisely.** With `pinnedLinks: ["id-0003","id-0009"]`, rows 0003 and 0009 rendered 4 SVGs and every other row exactly 3. Scrolled out: zero pins anywhere, zero leaks. Back at top: exactly those two again. The absence case matters as much as the presence one — it proves an absent icon is cleared on re-point. |
| Context menu | **Partial.** The callback chain is verified: a synthetic `contextmenu` on `[data-name="link-row"]` reached `onContextMenu`, survived `ContextMenuEvent.fromNativeEvent`, and ran `model.selectLink` (selection moved to `ROW-0007`). The popup itself did **not** paint. Synthetic events are a known-unreliable driver here — the same reason synthetic `KeyboardEvent`s do not drive Monaco — and the `ContextMenuEvent` flow downstream of the callback is unchanged by this task. Not evidence of a defect; the popup remains unverified. |

**Not verified live, and named as such:** drag and drop (`onItemDragEnter/Over/Leave/Drop`) — the
four remaining `LinksList` consumers other than `LinkItemList` (`CategoryViewImpl`,
`CategoryEditor`, and the two link-editor panels) compile against the new `GridModelCapability`
boundary but were not exercised; and the context-menu popup above.

### US-1063 — not verified live

The story exists but was not opened. `VirtualFlexGridView` has no consumer until US-1064, so the
height policy is unexercised. Its story cannot cover `preferMinHeightForNewRows` under a live log
stream, nor Monaco-bearing notebook rows — both owed to US-1065 and US-1064 respectively.

---

## Notes

**Per-task commit authorization for this epic only.** The user's "proceed with next epic" is taken
as authorization to commit per task within EPIC-062, as it was for EPIC-060 and EPIC-061. As in
both of those, it **does not generalise past this epic.**

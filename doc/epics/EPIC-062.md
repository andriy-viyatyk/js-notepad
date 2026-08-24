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

**The fixture's composition makes the total count evidence on its own.** `test.note.json` holds 13
notes, of which **7 are `monaco`** kind (order: `monaco`, `html-view`, `mermaid-view`, `monaco`,
`grid-json`, `monaco`, `md-view`, `monaco`, `monaco`, `monaco`, `md-view`, `grid-json`, `monaco`).
Three consecutive `monaco` notes at rows 7–9 are what produce the observed `live3` peak.

Two consequences:

- **8 constructions against 7 text notes proves a rebuild arithmetically**, before any argument
  about which pass caused it. At least one note was constructed twice no matter how the sweep is
  attributed.
- **A correct implementation constructs at most one host per simultaneously live cell**, since a
  cell re-points its host rather than rebuilding it, and the per-pass rule is zero on any pass that
  revisits an already-visited row.

  *Amended after US-1064 shipped:* an earlier version of this line put the ceiling at ≤3, derived
  from the three cells live at once in the baseline. That number did not survive the epic. E4-13
  retains evicted cells in the pool **attached but hidden**, so their editors stay connected and
  "simultaneously live" no longer means "in the viewport" — it means "admitted at least once". The
  honest ceiling is therefore the number of distinct `monaco` notes visited (7 here), and the
  falsifiable half of the target was always the per-pass rule, not the total.

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

## E4-12 — A committed row height is a geometry invalidation, and the engine needed a word for it

*Taken 2026-08-24, from live verification of US-1064 on the dev build.*

The second defect in US-1063's primitive found by giving it a real consumer, and the same class as
E4-11: faithful to the React original, wrong against the vanilla engine.

`VirtualFlexGridModel.commitRowHeight()` reported a newly measured height as
`gridModel.update({ rows: [row] })`, copied from `RenderFlexGrid.tsx`'s
`update({ rows: [updatedRow] })`. Measured live on `test.note.json`, that produced a grid whose
first three cells were consistent (`top 0/h 147`, `top 147/h 486`, `top 633/h 482`) and whose
remaining four were stale — 733, 444, 593, 696 where the third cell's own height demands 1115 —
so cells overlapped and two disagreed with their own content by hundreds of pixels. The measured
heights were correct and matched the pre-conversion React baseline exactly; only the reflow was
missing.

**Why it worked in React and not here, which is the part worth keeping.** React re-rendered the
whole grid component on any model update and recomputed every visible cell's position from
`rowHeight` as a side effect, so a single-row dirty set still produced a full reflow — the dirty set
was an optimisation hint layered over an unconditional recompute. The vanilla engine honours the
dirty set literally: it restyles the rows named and leaves the rest untouched. **A port that
preserves a call verbatim can still change its meaning, because the meaning lived in the framework
rather than in the call.** That is the third time in this programme a defect took this shape
(EPIC-061 recorded two), and it is the standing argument for verifying a converted view live rather
than by diff.

**The decision: `RerenderInfo` gains `fromRow?: number`**, meaning *every row at or after this one
has moved, because a row above them changed height*, and `commitRowHeight` reports that instead.

`update({ all: true })` was rejected. The dirty-set doctrine in `types.ts:64-71` is explicit that
every performance claim in the library rests on reporting only what changed, and rows *above* the
changed row genuinely did not move. This path also runs for every row measurement during first
paint, making it a hot path rather than an escape-hatch one. `fromRow` costs O(visible) rather than
O(rowCount) because `rerender-check.ts` already filters the expanded set through `rowInRange` — the
filter exists so that a change 80,000 rows below the viewport costs nothing, and this is exactly
the case it was built for.

It also names the invalidation's real shape. A height change is not "this row's content changed";
it is "the layout below this row moved", which the dirty set previously had no vocabulary for. That
distinction is reusable: US-1065's flex consumer needs it too.

---

## E4-13 — A virtualized cell that can host a frame must not be detached, and the DOM's scroll position is not authoritative

*Taken 2026-08-24, from live verification of US-1064 after a user bug report.*

The user could drag the notebook's scrollbar only as far as the second note — an HTML preview — and
"at the moment when it hides, the scroll indicator jumps to 0 and the first two items are not
rendered." That report is what cracked a defect nine rounds of my own probing had failed to locate,
because it named the *trigger* rather than the symptom.

A `MutationObserver` on the cell container, stepping `scrollTop` in 100px increments:

```
REMOVE row=0 iframes=0 st=200    <- a plain cell: no effect
REMOVE row=1 iframes=1 st=0      <- the jump, exactly here
want700 -> got0
```

**Detaching a cell whose subtree contains an `<iframe>` resets the scroll container's `scrollTop` to
zero.** `editors/html/HtmlBodyView.ts` adopts a sandboxed `srcdoc` iframe *as its root*, so evicting
that cell detaches a subframe, and Blink resets the ancestor scroller synchronously.

**Why this was so hard to find, which is the part worth keeping.** The reset is performed by the
browser, not by us, so it goes through no JS setter: I shadowed `scrollTop` on the container with an
accessor that recorded a stack trace on every write, and it caught six writes, *all of them mine*.
That evidence read as "nothing in our code moves the scroll", which is true and was also useless —
it ruled out every hypothesis I had while leaving the actual cause untouched. Three further probes
(computed `overflow-anchor`, which was already `none`; `document.activeElement`, which never moved;
per-frame sampling of `scrollHeight` and the area's inline height, all constant) each removed a
candidate without finding the culprit. **A negative result on "who wrote this value" does not
establish that the value was not written** — it establishes that it was not written *by script*.

Two decisions follow.

**Evicted cells are retained in the pool attached and hidden, not detached.** `CellPool.release()`
now hides the element and clears its coordinate markers instead of removing it, and only pool
overflow (the cap is 2000) detaches. This preserves the iframe's document across eviction, and it
also fixes a quieter defect in the same place: re-inserting an iframe reloads it, so before this
change the HTML note reloaded its `srcdoc` every time it scrolled back into view.

**At the end of a paint, the container's scroll position must equal the model's offset; if it does
not, the DOM was clobbered and the model wins.** Retention alone was not sufficient — a cell
admitted for a note of a *different kind* still disposes the old arm, and `HtmlBodyView`'s root
being the iframe means that path detaches a frame too. That destruction is legitimate (the note is
gone), so the answer is to compensate deterministically rather than to prevent it. The invariant is
sound in both directions, which is what distinguishes it from the ad-hoc restore it replaced: a
genuine user scroll reaches `onScroll` first, so model and DOM already agree by paint time and
nothing is written; a browser-internal reset changes the DOM without touching the model, so a
mismatch at paint end is unambiguous evidence of a clobber; and the offset re-asserted is the one
the paint just computed its window from, so the cells on screen already match it.

**The generalisation for US-1065 and every later virtualized consumer:** a cell subtree is not
inert DOM. Once cells can contain arbitrary editors, eviction can destroy an iframe, a webview, a
media element or a Monaco instance, and the engine cannot assume that removing an element is free
or side-effect-free. `RenderGrid` never had to care, because no consumer put a frame in a cell.

---

## E4-14 — Re-parenting a scroller, or any ancestor of one, resets its scroll position

*Taken 2026-08-24, from live investigation of two user bug reports against US-1064.*

The notebook's scroll position jumped to the top mid-drag, showing an empty viewport. It took a long
sequence of eliminations to find, and the eliminations are the valuable part, because every one of
them is a technique that will be reached for again:

| Ruled out | How |
|---|---|
| Application `scrollTop` writes | Shadowed `scrollTop` on the container with an accessor recording a stack per write. Six writes, all from the probe |
| `scrollIntoView` / `scrollTo` / `scrollBy` / `focus` | Trapped all four on the prototypes. **Zero** calls at the failing step |
| Scroll anchoring | `getComputedStyle` on container and area: `overflow-anchor: none` on both |
| A shrinking extent, or a clamp | `scrollHeight`, `clientHeight` and `offsetHeight` sampled per frame: constant at 5399 / 969 / 969 while `scrollTop` went 3323 → 0 |
| Focus moving | `document.activeElement` was `BODY` before and after |
| The `AVGridError` exception | Fixing it changed nothing; the failures stayed bit-identical |
| The HTML note's iframe | Provably the same element, still connected, never reloaded |
| The grid arm | A control fixture with both grid notes converted to text failed **more** (8 resets vs 2) |

What found it was a `MutationObserver` on the scroll container's **ancestors**, watching `childList`:
at the failing step an ancestor of the scroller was removed and re-added, three times.

**The cause: `NotebookBodyView.enterGrid()` called `notesList.replaceChildren(this.grid.root)` on
every projection apply.** `replaceChildren` with the node that is already there still detaches and
re-inserts it, which re-parents an ancestor of the grid's scroll container — and Blink rebuilds a
re-parented scroller's layout object, discarding its scroll offset. Every note-state update reached
that line, so any update landing mid-scroll threw the list back to the top.

**Two generalisations for the rest of the programme.**

**Idempotent attach is not an optimisation, it is a correctness requirement.** `append`,
`replaceChildren` and `insertBefore` with a node already in the right place are *not* no-ops — they
are a detach plus an insert, and that is observable as lost scroll position, a reloaded iframe, and
a rebuilt layout object. This epic hit the same shape twice in different files: here, and in
`VirtualGridView.syncRegion`, where `parent.append(el)` moved every re-admitted pooled cell once
E4-13 started keeping released cells in the document. Both now check before writing. Any converted
view that attaches a child on an update path needs the same check — React's reconciler made this
class of mistake impossible to express, and direct DOM makes it the default.

**A negative result about *who wrote a value* does not establish that the value was not written.**
The `scrollTop` accessor trap reporting "six writes, all mine" was true, and it sent me chasing
browser quirks for several rounds. The write was real; it simply was not a write to that property.
Instrument the *mutation* next time, not only the property.

---

## E4-15 — What React did implicitly has no compile-time equivalent, and `tsc` will not find it

Six bugs in the notebook conversion survived a clean typecheck, a clean build, and a scroll and
geometry battery that found nothing. Every one was live-only, and five share a single cause: React
supplied a behaviour that direct DOM does not, and nothing in the type system marks its absence.
They are recorded together because they are a **checklist for US-1065 and US-1066**, not a
retrospective.

| # | Lost behaviour | Symptom | Fix |
|---|---|---|---|
| 1 | An id owned by the component being deleted | `closest("#avg-container")` returned null, so the handler cancelled every wheel event and scrolled nothing — wheel dead except inside the iframe | Host supplies the scroller via `VirtualGridView.scrollElement`; a cell never names the scroller's markup |
| 2 | `onFocus`/`onBlur` are delegated through the **bubbling** `focusin`/`focusout` | A note activated only by clicking the drag indicator (a plain child, so focus fell through to the root) and never by clicking its body, where focus lands on a descendant | Use the bubbling pair |
| 3 | A focus transition the platform declines to announce | Clicking a sandboxed iframe makes it the host's `activeElement` but dispatches no focus event, so an HTML note never activated | Announce it from the existing `html:interact` message; `focus()` alone is a no-op when it is already the activeElement |
| 4 | A React component contributing **no DOM** | A `VanillaView` must own a root, and the unstyled block wrapper broke the overlay's flex chain: Monaco and markdown at zero height, the grid at its 200px default, the iframe at its intrinsic 300x150 | `display: contents` on the wrapper |
| 5 | Nothing — a disposal-order hazard direct DOM newly *creates* | `dispose` takes children before the owner's `onDispose`, so a state capture on the way out reached a disposed Monaco host and threw | Readiness probe, plus capture from the owner while still mounted |
| 6 | Nothing — flex default | `min-height: auto` on the notebook panels overflowed the chrome by 7px | `minHeight: 0` |

Four properties are worth carrying forward.

**The type system cannot see any of this.** Items 1–4 are behaviour that existed in JSX and has no
declaration site in a `VanillaView`. A green build says nothing about them. This is the concrete
argument for exercising every interaction path per conversion, and it is why the structural
acceptance criteria for US-1064 were all satisfied while the editor was substantially broken.

**Item 5 generalises past this epic.** It is not a lost React behaviour but a new hazard: any
converted view that captures state during teardown is reaching for a child that is already gone.
Grep converted views for work inside `onDispose` that touches a child.

**A teardown must not be able to strand the state that says whether anything is torn down.**
`dispose` finishes its cleanups and *rethrows*, so one deep failure skipped the caller's
`root.remove()` and its bookkeeping, leaving an overlay that could not be collapsed. Clear the
bookkeeping first, then contain the teardown. This turned one throw into a wedged editor.

**Before converting, read the React original for what it did without saying so** — `onFocus` /
`onBlur`, components that render no DOM, and any wrapper sitting inside a flex chain. Checking
after conversion costs a user bug report per instance; six of them, here.

### Measurement traps met while verifying this

Both cost a round and both produced a confident false negative:

  * **A transitioned property read through `getComputedStyle` returns the interpolated value**, so
    an inline change just made still reports the old one. The note indicator and dimmer are both
    transitioned; read `element.style` for the authoritative value.
  * **`focus()` behaves differently when the host window is unfocused**, which is the state during
    an automated probe. A probe showed `focus()` emitting an event on an already-focused iframe;
    under real use it is specified to emit nothing. The scenario that matters was never exercised.

And one capability, contradicting what was recorded earlier in this epic: **synthetic mouse events
do reach Monaco**, even though synthetic keystrokes do not. Clicking a `.view-line` moves the
cursor, and `.cursors-layer .cursor`'s inline `top`/`left` is readable. That is enough to verify
view-state save/restore, which was previously listed as unverifiable.

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

### Amendment — US-1066 is smaller than this list claims, measured 2026-08-24

Audited before delegating US-1065, because US-1067's deletion depends on the count being right.
**Only two import-level consumers of `uikit/RenderGrid/` remain in the tree:**

| File | Task |
|---|---|
| `src/renderer/editors/log-view/LogBody.tsx` | US-1065 |
| `src/renderer/editors/link-editor/LinksTiles.tsx` | US-1066 |

Plus `uikit/index.ts:135,144` (the barrel re-exports) and the `RenderGrid/` folder's own files, which
are US-1067's business.

The "eight `RenderGridModel` repointings" this item attributes to US-1066 **have already happened**:

  * `LinkItemList.tsx` dropped its `uikit/RenderGrid` import in `fb1fb64d` (US-1062).
  * The two `tree-provider` files dropped theirs in US-1037, in an earlier epic entirely.
  * `LinkItemTiles` is `LinksTiles.tsx`, already counted above.

Every other file matching `RenderGrid` now matches only in **prose** — a comment or a doc note:
`file-diff/RevisionPicker.tsx:99`, `git-tree/GitTreeEditorView.tsx:154`,
`tree-provider/TreeProviderViewModel.ts:351`, `uikit/Tree/TreeModel.ts:175`,
`uikit/Tree/types.ts:56`, `uikit/shared/async-ref.ts:18`, `uikit/DataGrid/index.ts:11,14`.
None of them compile against it.

**Correction, 2026-08-25.** That list is **not** the complete prose inventory, as US-1066's own
audit found when told to re-verify rather than trust this amendment. It omitted `uikit/VirtualGrid/`'s
own comparison comments (`VirtualGridModel.ts`, `VirtualGridView.ts`, `renderInfo.ts`,
`rerender-check.ts`, `types.ts`), `src/renderer/uikit/CLAUDE.md`, and the living architecture docs
(`doc/architecture/overview.md`, `folder-structure.md`, `key-files.md`, `styling-inventory.md`, and
`doc/de-react.md`). The *substantive* claim above is unaffected — the import-level consumer count
and the settled repointings both hold — but the prose sweep is larger than stated, and it is split:

  * **`src/` prose** — US-1066.
  * **Living `doc/` prose** — US-1067, because those documents should describe `RenderGrid` until it
    actually stops existing, plus `/document` at epic close.
  * **Historical records** — `doc/epics/EPIC-015`…`EPIC-061`, `completed.md`, and prior
    `doc/tasks/US-*/README.md`: **never rewritten.** A `RenderGrid` mention in a closed task
    document is accurate history. This programme's method depends on those staying true to their
    own moment.

Recorded because the delegation was explicitly told to re-audit rather than trust the summary, and
that instruction is what caught it.

So **US-1066 reduces to `LinksTiles.tsx` plus that comment sweep**, and the epic is one real
conversion shorter than E4-8 states. Recorded rather than silently rescoped, because the original
count is what justified US-1066 being its own task; it still is one, but a much smaller one.

**Also settled by the same audit:** `#avg-container` — the id that produced the dead wheel handler
in US-1064 (E4-15, item 1) — has exactly **one** remaining occurrence in the tree, inside
`RenderGrid.tsx:102` itself. No other consumer performs that lookup, so US-1067's deletion cannot
strand another one. This closes the concern raised when the notebook bug was found.

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

### US-1064 — verified live, 2026-08-24

Dev build, fixture `test.note.json`, every check from a **cold** page load (the convergence window
is where this task's defects lived, so a warm run proves nothing).

| Check | Result |
|---|---|
| `scrollTop` stepped 100px across the whole range (41 steps) | **Pass** — zero jumps, zero landings at 0 |
| Crossing the HTML note at 700 (the user's reported failure) | **Pass** |
| 13-stop sweep: geometry gaps between consecutive rows | **Pass** — 0 |
| 13-stop sweep: viewport fully covered at every stop | **Pass** — 0 shortfalls |
| 13-stop sweep: position honoured at every stop | **Pass** — 0 failures |
| Duplicate `data-row` among admitted cells | **Pass** — 0 |
| Cells visible without a `data-row` (stranded) | **Pass** — 0 |
| All rows reachable | **Pass** — 13 of 13 |
| `scrollTop = scrollHeight` in one step | **Pass** — lands 4122 of max 4122, 3 cells covering |
| Three 1px scrolls 600ms apart | **Pass** — window updates on the **first** |
| Return to 0 | **Pass** — exactly rows 0, 1, 2 |
| Uncaught application errors | **Pass** — 0 |

**Rule 4 (E4-6), measured by the banked procedure:**

| | Baseline (React) | US-1064 |
|---|---|---|
| Total Monaco constructions over a sweep | 8 | **6** |
| Constructions on the return-to-top pass | **1** | **0** |
| Mid-sweep passes reporting new constructions | many | 3, all first visits |

The return pass is the number that matters and it is now zero — the check E4-6 called "the sharpest
single check, because it cannot be explained by a note being reached for the first time." Every
construction in the run is a distinct `monaco` note being reached for the first time; six for seven
such notes means at least one host was re-pointed rather than rebuilt, and the long runs of zero
while scrolling rows 5-12 are the re-point contract working. See the amended ceiling note under
E4-6: the ≤3 figure predicted before E4-13 no longer applies, because retained pooled cells keep
their editors connected.

### US-1064 — re-verified after the two user bug reports, 2026-08-24

Both reports were real defects and both are fixed; a third defect (the `AVGridError`) was found
while investigating them, and one more was introduced and removed during the work.

| Fix | Cause |
|---|---|
| Embedded bodies threw four different missing-method errors | `NoteItemActiveEditorView` pushed `NoteItemEditModel` to arms constructed with the `EditorModel` from `createEditor()` |
| The HTML note "blinked" and its iframe was destroyed | A pooled cell was admitted for a different note kind, disposing `HtmlBodyView` whose root *is* the iframe. Cells are now reused only within a kind (E4-13) |
| `AVGridError: Unknown column …` on both grid notes | `setOptions` applies columns before rows and validates the new columns against the rows still loaded. Rows are now pushed first (plus a baseline invalidation and an atomic snapshot) |
| The scroll jumped to the top mid-drag | E4-14: `replaceChildren` re-parenting the grid root on every projection apply |
| *Introduced and removed:* the scrollbar drag stalled | An end-of-paint "assert the model's offset" invariant wrote `scrollTop` during a drag, which cancels a native thumb drag. Replaced by fixing the actual clobber |

Final sweep, cold load, 82 steps in both directions on `test.note.json`: **zero position failures,
zero geometry gaps, zero duplicate `data-row`, zero stranded cells, zero viewport shortfalls, all 13
rows, zero uncaught errors.** The control fixture that previously failed worst (both grid notes
converted to text, 8 resets) is also clean. The HTML note's iframe survives a full sweep as the same
connected element.

Rule 4 re-measured on the same build: 7 of the 8 constructions are the seven distinct `monaco` notes
built once each, **zero on the return-to-top pass**, and one residual extra construction mid-sweep.
The falsifiable half of E4-6 therefore holds; the residual 1 is recorded rather than claimed as 0.

A per-cell error boundary was added at the user's request: a throw inside a note's subtree now
renders an inline message in that cell instead of aborting the paint for every cell, and
`GridBodyView` contains throws from its own state subscription (a synchronous `TOneState` dispatch
would otherwise skip every later subscriber). It is insurance, not a fix — verified not to fire on a
clean sweep.

**Not verified live:** editing a note while scrolling it out and back (the E4-7 total-write path is
exercised structurally by the duplicate/stranded-cell checks, but not by a real edit); the expanded
overlay; kind switching through the toolbar; drag and drop. `ExpandedNoteView` and
`NoteItemToolbarView` have no live coverage at all.

**Known unrelated:** the fixture's grid note raises `AVGridError: Unknown column "a"` from
`av-grid.js` — its data columns are `gawe, aweg, er, agawe, drtj, o` and a persisted column `"a"`
does not exist. Pre-existing fixture data, not touched by this task.

### US-1064 — six user-reported interaction bugs, all fixed and verified, 2026-08-24

The scroll and geometry work was finished and correct; the *interaction* surface was substantially
broken and none of it showed up in a typecheck or a build. Causes and the general lesson are in
E4-15. Verified live after each fix, on `C:\data\js-notepad-notes	emp	est.note.json`:

| Fix | Evidence |
|---|---|
| Mouse wheel over a note | 35 wheel steps 0 → 5210 (full extent) and 28 back to 0, zero stalls, each event dispatched on the deepest embedded Monaco/grid of the edge cell; a focused note keeps its own wheel (not cancelled, scroller unmoved) |
| Activation on focus | Four notes: focusing a descendant, including Monaco's textarea, turns the indicator blue and clears the dimmer 0.5 → 0; focus moving within a note stays active; focus leaving deactivates |
| Activation from the HTML preview | User-confirmed. The iframe was already the host's `activeElement` while the note showed inactive — the platform had announced nothing |
| Body sizing in the expanded overlay | All three broken kinds: iframe 815×932 (was 300×150), grids 815×932 / 815×925 (was 200px), Monaco bodies matching their panel exactly; the `display: contents` wrapper measures 0×0 |
| Collapsing a Monaco note | Expand → collapse → re-expand repeats cleanly, overlay removed each time, no errors, body stays 789px |
| Monaco view state across the round trip | Cursor placed at line 3 (42px/22px) returns at 42px/22px — the capture working, not merely not throwing |

User confirmation after the last fix: "Now everything looks fine, no more issues."

**Now covered that was previously listed as unverified:** the expanded overlay (`ExpandedNoteView`),
Escape/button collapse, per-note Monaco view-state save and restore, and editing position surviving
a teardown round trip.

**Still not verified live:** category and tag autocomplete, title and comment editing, toolbar
language and kind switching (`NoteItemToolbarView` still has no live coverage), search highlighting,
script actions, and drag and drop. Typing into Monaco remains undrivable; synthetic *mouse* events
do reach it (E4-15).

### US-1068 — build-verified only

Typecheck, lint and production build pass. Its live exercise is the notebook's category and tag
editors, which US-1064's verification did not drive. Unverified live.

### Earlier


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

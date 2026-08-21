# EPIC-056: De-React Epic C3 — Virtualization engine, data views and dropdowns

## Status

**Status:** Active — US-1013 and US-1014 implemented, awaiting user testing
**Created:** 2026-08-21

## Overview

The third of four epics that make up the [de-React roadmap](../de-react.md)'s Epic C ("UIKit
conversion"). C1 shipped as [EPIC-054](completed.md) — the twenty foundation components, the
React-compatibility layer, the layered-CSS contract, the DOM icon path. C2 shipped as
[EPIC-055](EPIC-055.md) — the floating layer (`Popover`, `Menu`, `Dialog`), the chrome and the
composites, and the first four vanilla-driven models.

C3 is the **virtualization engine and everything built on it**: the absorption of av-grid's
`render/` folder, then `ListBox`, `MultiListBox` and `Tree` on top of it, then the three dropdown
composites `Select`, `MultiSelect` and `Autocomplete` that C2-1 moved down here.

Three things make C3 different in kind from C1 and C2:

- **It is the only epic in the programme that adopts code rather than converting it.** Every
  previous conversion rewrote a React file into a vanilla view with the same behaviour. Here the
  vanilla implementation already exists, in another repository, as a rewrite rather than a
  transliteration — and it is not API-compatible with what Persephone has. EPIC-053 B15 fixed the
  scope of the adoption; this epic has to fix the shape of the seam.
- **It is the first epic that cannot preserve a public type.** `RenderCellFunc` is
  `(p) => ReactNode` and `RenderCellParams.style` is `CSSProperties`
  (`RenderGrid/types.ts:104,109`). The vanilla engine's cell renderer returns an `HTMLElement`.
  Twelve app-layer files depend on the React signature, so roadmap Rule 2 ("a swap must not break
  call sites") cannot be honoured by a swap — only by coexistence. See C3-1.
- **It is the first epic whose models memoize more than they store.** Sixteen `this.memo()` sites
  across six models, and two of the ten `effect()` calls take a **memo** as a dependency — the one
  shape EPIC-053 B13 left explicitly undecided and C2 recorded as "does not recur here". It recurs
  here, twice, and both instances sit on the hot repaint path. See C3-6.

## What the investigation at epic open established

The roadmap's Epic C section describes C3 in one paragraph written at the C-split, amended once when
C2 opened. Measuring it against the tree changed the scope again. Each row states the prior
assumption and what measurement showed.

| Prior assumption | What measurement showed |
|---|---|
| C3 is "~7,600 lines" (roadmap, re-measured at C2 open) | **7,578 production lines.** The estimate holds — the first line figure in this programme that did not move. Largest: `RenderGrid` **2,323**, `Tree` **2,170**, `ListBox` 914 |
| "av-grid's `render/` is standalone — today's `uikit/RenderGrid/` imports nothing from `uikit/`" | **True of the folder, false of the seam.** `RenderGrid`/`RenderGridModel` have **19 importer files outside their own folder**, and **12 of them are app-layer** (`components/` 4, `editors/` 8). The engine is standalone; its consumer set is not |
| C4 is "the only part of Epic C that reaches outside `uikit/`" | **Wrong if the engine is swapped in place.** Those 12 app-layer files hold `RenderGridModel` references and pass `renderCell` functions returning `ReactNode`. Either C3 rewires them — reaching outside `uikit/` on the hottest path in the app — or the React engine survives C3 and drains through Epics D and E, exactly as `Panel` does. C3-1 |
| B15: "`core/observable`, `core/events`, `core/csv`, `highlight.ts` — **dropped**; Persephone owns `TOneState`…" | **Correct as a decision, understated as a cost.** av-grid's `render/RenderGridModel.ts` is written against `Model`/`Observable` (`render/RenderGridModel.ts:25`), which has *no selectors* and batches notification on a microtask; `TOneState` dispatches synchronously and runs immer `produce` on every update. The engine's own state is consulted by a paint loop, never diffed — so it wants no reactive store at all. C3-2 |
| B15: `RenderFlexGrid.tsx` — "**undecided**: keep and port by hand, or migrate its three consumers" | **Two JSX call sites**, `editors/log-view/LogBody.tsx` and `editors/notebook/NotebookBody.tsx:156`, both in `editors/`, i.e. Epic E territory. Its §3.5 Rule 6 leak is **already closed** — it imports `core/utils/debounce` and `core/utils/memorize`, not `shared/utils`. C3-3 |
| §3.5: four `uikit/` → app-layer leaks left for Epic C to close | **One left, and it is C4's.** Only `uikit/AVGrid/model/ContextMenuModel.tsx:3` remains — the documented C4 exemption. `ListBoxModel` and `TreeModel` now read `core/events/context-menu`; `Menu/types` and `RenderFlexGrid` are clean. **C3 inherits no leak work** |
| C2-1: `Select`, `MultiSelect`, `Autocomplete` move here because all three render `ListBox` | **Confirmed, and the trio is cheaper than its line count suggests.** `MultiSelect` has **zero** production call sites (its story is the only consumer), `Autocomplete` has one (`editors/rest-client/KeyValueEditor.tsx`), and all three are composition over an already-vanilla `Popover` and `Input` plus a `ListBox` this epic converts first |
| Story coverage is 38 of 44, six missing | **42 of 44 today.** C1 and C2 closed four of the six, two of them as vanilla-only `.story.ts` files (`Checkbox`, `Label`). Missing: **`RenderGrid`** (C3 owes it) and `AVGrid` (C4) |
| C2 emptied `@floating-ui/react` out of `uikit/` | **Holds.** C3 has **zero** floating-ui imports — it inherits a vanilla `Popover` and `Menu` and adds no new floating surface |

## The surface, measured

All figures measured 2026-08-21 against the tree at `upcoming-v4.0.23`, stories excluded from
production counts unless stated. See the measurement note below.

| Item | Measure |
|---|---|
| C3 components | **7** — `RenderGrid`, `ListBox`, `MultiListBox`, `Tree`, `Select`, `MultiSelect`, `Autocomplete` |
| C3 lines | **7,578** production (excluding `index.ts` and stories). `RenderGrid` 2,323 · `Tree` 2,170 · `ListBox` 914 · `Select` 784 · `Autocomplete` 532 · `MultiListBox` 470 · `MultiSelect` 385 |
| Largest single files | `TreeModel.ts` **815** · `renderInfo.ts` **704** · `SelectModel.ts` **612** · `RenderGridModel.ts` **547** · `AutocompleteModel.ts` 370 · `Tree/types.ts` 369 |
| Code adopted from av-grid | **2,642 lines** in six files — `renderInfo.ts` 796, `RenderGridModel.ts` 607, `RenderGrid.ts` 558, `rerender-check.ts` 380, `types.ts` 208, `CellPool.ts` 93 — plus `core/AsyncRef.ts` (B15) |
| `TComponentModel` models in C3 | **7** — `RenderGridModel`, `ListBoxModel`, `MultiListBoxModel`, `TreeModel`, `SelectModel`, `MultiSelectModel`, `AutocompleteModel`. Plus two framework-free helper classes, `TreeDndModel` and `TreeKeyboardHandler` |
| `effect()` call sites in C3 | **10** in five models — `Select` **4**, `ListBox` 2, `Tree` 2, `MultiSelect` 1, `Autocomplete` 1. `RenderGridModel` and `MultiListBoxModel` register **none** |
| `this.memo()` call sites in C3 | **16** across six models — `MultiListBox` 5, `Tree` 3, `Select` 3, `ListBox` 2, `Autocomplete` 2, `MultiSelect` 1. Memos are a cache, not a lifecycle hook, and stay (roadmap §3.2) |
| Effects whose deps include a memo | **2** — `ListBoxModel.ts:224` (`this.resolved.value.resolved`, `this.selectedKey.value`) and `TreeModel.ts:761` (`this.rows.value`). **B13's undecided fourth row**, on the repaint path |
| Local `useState` in C3 | **0 production.** All six occurrences are in `*.story.tsx` |
| React hooks in C3 production `.tsx` | `useComponentModel` 16 · `useId` **5 sites** · `useCallback` 8 · `useEffect` 6 · `useRef` 4 · `useLayoutEffect` 2 |
| Emotion importers in C3 | **11 files** across 7 components, **plus `uikit/shared/selection-style.ts`** — the last Emotion file in `uikit/shared/` |
| `renderIcon` call sites in C3 | **10** — `ListItem` 3, `MultiListBox` 3, `TreeItem` 2, `Select` 1, `MultiSelect` 1 |
| `ReactNode` / `ReactElement` references | **31** across 11 files. `RenderGrid/types.ts` alone has **12**, because the cell contract is a `ReactNode` |
| `@floating-ui/*` importers in C3 | **0** |
| `Panel` consumers inside `uikit/` | **1** — `Autocomplete/Autocomplete.tsx:139`. C3 closes it, and `Panel` then has no `uikit/` consumer at all |
| External JSX call sites (production, excl. stories) | `ListBox` **8** app-layer + 3 `uikit/` · `Select` **8** app-layer + 1 `uikit/` (`AVGrid/CellSelect`) · `Tree` **6** · `RenderGrid` **3** app-layer + 2 `uikit/` · `RenderFlexGrid` **2** · `Autocomplete` **1** · `MultiListBox` **0** app-layer (2 `uikit/`) · `MultiSelect` **0** |
| `RenderGrid` / `RenderGridModel` importer files outside their folder | **19** — 12 app-layer (`components/file-search`, `components/tree-provider` ×3, `editors/link-editor` ×6, `editors/log-view`, `editors/notebook`), 7 inside `uikit/` (`AVGrid` ×4, `ListBox` ×2, `Tree` ×2, plus the barrel) |
| Emotion importers in `uikit/` | **21** at open → **9** at close, all nine in `AVGrid/` (C4) |
| Emotion importers, renderer-wide | **43** production — `uikit` 21, `components` 11, `ui` 10, `theme` 1, `core` 1, `editors` **0** |
| Story coverage | **6 of 7**. Missing: `RenderGrid`. Renderer-wide: 42 of 44 `uikit/` components |
| Rule 6 violations | **1**, and it is C4's (`uikit/AVGrid/model/ContextMenuModel.tsx:3`) |

**The numbers that shape the epic.** Two thousand six hundred lines arrive from another repository
and 7,578 lines leave — this is the only epic where the ratio of adopted to converted code matters,
and it is why the seam decisions (C3-1 through C3-4) have to be settled before any task is written.
Ten effects across five models is more than C2 had, but four of them are the same "reset on close"
shape C2 already solved twice, and two more are literally annotated in the source as workarounds for
React's render-phase effect evaluation — they get **deleted**, not shed. And zero production
`useState` against 16 memos says the same thing C2's numbers said: the logic is already in the
models, and the work is styling plus lifecycle.

> **Measurement note.** Counts are identifier-based, taken over `.tsx` with each component's own
> folder and all `*.story.tsx` excluded and subtracted explicitly — `uikit/index.ts` is a barrel and
> a path-based scan undercounts every component behind it (EPIC-055's Notes record where that error
> first bit). Two traps specific to this epic: `<ListBox` also matches longer identifiers such as
> `<ListBoxItem`, so tags were matched with a trailing non-identifier assertion; and
> `RenderGridModel` is imported **as a type** by seven files that render no grid at all, so
> "importer files" and "JSX call sites" are counted separately above and are not interchangeable.

## Decisions

All ten are settled. C3-1 was decided directly by the user on 2026-08-21; C3-2, C3-3 and C3-10 were
delegated to the epic's recommendation the same day, so each stands as written below with its
alternatives and its residual risk recorded rather than discarded. A delegated decision is still a
decision — reverse it by amending this section, not by diverging from it in a task.

**C3-1 — The vanilla engine lands beside the React `RenderGrid`, which stays React-only and drains
through Epics D and E.** *(User decision, 2026-08-21: two engines during the migration are
acceptable, on the condition that the duplication is scheduled for removal in the programme's final
cleanup phase rather than left to drain by accident. The removal ledger added to roadmap §7 Epic F
is that condition being met — see "The cleanup obligation" below.)*

The React engine's public cell contract is `RenderCellFunc = (p: RenderCellParams) => ReactNode`
with `style: CSSProperties` (`RenderGrid/types.ts:104,109`). av-grid's is
`RenderedCell = HTMLElement | undefined` with a six-field `CellStyle` (`av-grid/src/render/types.ts`).
Twelve app-layer files consume the React contract, and B15 already records that `RenderGridModel`'s
API differs on top of that (`setOptions(partial)` vs `mapProps`/`setProps`, `attach()` vs
`isFirstUse`, `disposed` vs `isLive`). There is no swap that keeps those call sites working.

Three ways out, and why this one:

- **Coexistence (recommended).** The absorbed engine is a new vanilla component; `ListBox`,
  `MultiListBox` and `Tree` are converted onto it inside this epic. `uikit/RenderGrid/` keeps its
  exact current exports and its 12 app-layer consumers, and dies when the last of them converts in
  Epic D or E. This is precisely the shape C1 chose for `Panel` (EPIC-054: `Panel` stays React-only
  and drains away as Epics D and E convert its call sites) and it keeps Rule 2 intact without a
  bridge. Cost: two virtualization engines in the tree for the length of Epics D and E, and the
  discipline not to let a new consumer pick the dying one.
- **Convert the 12 consumers in C3.** Honest about the end state, but it makes C3 reach into
  `components/` and `editors/` on the hottest path in the application, roughly doubles the epic, and
  takes work the roadmap deliberately assigned to D and E. Rejected on scope.
- **A `ReactNode` cell bridge.** Host each cell's `ReactNode` in a React root created by the vanilla
  shell. It preserves one engine and every call site — and puts a React root inside every visible
  cell of the fastest component in the app, which is the exact cost the programme exists to remove.
  Rejected outright, on the same grounds B15 rejected importing av-grid's own view classes.

**The cleanup obligation.** A temporary duplicate is only acceptable if something is guaranteed to
delete it. Two mechanisms, and C3 owes both:

- **The draining mechanism.** `uikit/RenderGrid/` has no remaining consumer once its 12 app-layer
  importers convert in Epics D and E and `uikit/AVGrid/` is replaced in C4. At that point the folder
  is dead code, and deleting it is a one-commit job with no design left in it.
- **The backstop.** Draining is not a guarantee — a component with no consumers still compiles, and
  `Panel` has been in the same position since C1. Roadmap §7's Epic F therefore now carries an
  explicit **removal ledger** naming every React-only survivor the migration created, `RenderGrid`
  and `RenderFlexGrid` among them, with the rule that Epic F cannot close while any entry is still
  in the tree. C3's close adds its two entries to that ledger; nothing else in this epic depends on
  when they are collected.

**C3-2 — The absorbed engine carries no reactive store.** *(Decided 2026-08-21; the user delegated
this to the epic's recommendation.)*

B15 says `core/observable` is dropped because Persephone owns `TOneState`. The measurement says the
engine does not want either. Its state is consulted by a paint loop that already knows exactly what
changed — the `RerenderInfo` dirty set — so a subscription mechanism buys nothing, and `TOneState`
would add two costs on a per-frame path: immer `produce` on every update, and **synchronous**
listener dispatch (`TOneState.set` iterates listeners inline) from inside a scroll handler.
av-grid's own header records the same conclusion from the other direction: "no selectors… the render
layer's dirty set does that job far more precisely".

So: the engine keeps plain fields plus explicit `rerender` reporting, paints on
`requestAnimationFrame`, and exposes an imperative API (`update(info)`, `scrollToRow`, `size`) —
which is what `ListBoxModel` and `TreeModel` already call it through today
(`gridRef?.update({ all: true })`, `grid.scrollToRow(ai)`). `TOneState` and `TComponentModel` stay
where the *hosts* live. Any deviation from this must be justified per call site, not adopted
wholesale.

**The obligation that comes with accepting it.** This makes the engine the first component in
`uikit/` whose internals a reader cannot navigate by knowing `TOneState` — so US-1013 writes the
exemption into `uikit/CLAUDE.md` as a bounded, named rule ("the virtualization engine keeps plain
fields and paints on `requestAnimationFrame`; it is the only component exempt from the state
primitives, because its consumer is a paint loop with a dirty set") rather than leaving it as
something the code merely does. An unexplained exemption reads as an oversight and gets
"corrected" by the next person to touch it.

**C3-3 — `RenderFlexGrid` stays React-only and drains through Epic E.** *(Decided 2026-08-21;
delegated to the epic's recommendation. Resolves B15's one explicitly undecided row.)*

It has no av-grid counterpart, 241 lines, and two consumers — `editors/log-view/LogBody.tsx` and
`editors/notebook/NotebookBody.tsx` — both of which Epic E converts anyway. Its design is a per-row
`ResizeObserver` inside a React `FlexCell` component that reports measured heights back to the grid;
a hand-port would be a third virtualization path maintained for two callers. Keeping it where it is
costs nothing extra, because it lives in the React `RenderGrid` folder that C3-1 already keeps alive
for the same reason. If Epic E finds it wants a vanilla variable-height grid, that is Epic E's task
with Epic E's two call sites in front of it.

**C3-4 — Naming and placement of the two engines.** C3-1 leaves two engines in the tree, so the
folder and export names have to make the live one obvious and the dying one unattractive.
`uikit/RenderGrid/` keeps its name, its barrel and its exports unchanged — renaming it would break
the 12 call sites C3-1 exists to protect. The vanilla engine therefore needs a name of its own; the
task that lands it picks one and states it, and `uikit/CLAUDE.md` gains one line saying which of the
two a new consumer must use. Placement follows the C2 precedent for adopted-not-converted code: one
component folder, one `@layer uikit` stylesheet, and no re-export from `uikit/RenderGrid/`.

**C3-5 — Nothing in this epic changes a React call site.** Roadmap Rule 2, restated for C3's 24
production call sites (`ListBox` 8, `Select` 8, `Tree` 6, `Autocomplete` 1, `RenderGrid` 3 — plus
the `uikit/`-internal ones). Every component keeps its props, its `data-*` output, its DOM shape and
its class names: `data-type="list-box"` with the `data-loading` / `data-empty` /
`data-focus-selection` arms, `data-selection-style` on rows, `role="listbox"` and
`aria-activedescendant`. API cleanup is Epic F's (roadmap open decision #3).

One nuance: `aria-activedescendant` currently points at ids derived from React's `useId`
(`ListBox.tsx:56`, `Tree.tsx:70`, `Select.tsx:31`, `MultiSelect.tsx:32`, `Autocomplete.tsx:29`).
The *value* is opaque and generated, so it is not a contract — but the *relationship* is, and it is
the only thing making these lists keyboard-accessible. C3 replaces the five `useId` calls with one
shared counter in `uikit/shared/`, and each task asserts the aria pairing still resolves.

**C3-6 — Ten effects, and only six of them are shed.** The other four are deleted, because they
exist only to work around React.

| # | Site | Deps | Shape | Disposition |
|---|---|---|---|---|
| 1 | `ListBoxModel.ts:224` | 2 memos + 7 props | `gridRef.update({ all: true })` | **B13's memo-deps row, answered in US-1014.** `model.repaintSignature()` + a `DepsGate` in the host view's `onUpdate`. See the memo rule below |
| 2 | `ListBoxModel.ts:255` | `[props.activeIndex]` | scroll-into-view, with a `setTimeout(0)` fallback when the grid is unmeasured | **Amended by US-1014.** Host-view `onUpdate` guard, paired with row 1's trigger; the `setTimeout(0)` is deleted and the engine grows a one-slot pending scroll flushed from its **paint** path. `attach()`'s measured pass alone does not cover a root that has no layout at mount |
| 3 | `TreeModel.ts:761` | 1 memo + 7 props + 3 state | `gridRef.update({ all: true })` | as #1, plus state-driven arms (`draggingValue`, `dragOverValue`, `loading`) that become consequences of the methods that set them |
| 4 | `TreeModel.ts:791` | `[props.activeIndex]` | as #2 | as #2 — and it inherits the engine-side pending scroll for free, so `Tree` deletes its own deferral without adding anything |
| 5 | `SelectModel.ts:520` | `[props.items]` | invalidate in-flight load, reset loaded state | `setProps` comparing `oldProps.items` |
| 6 | `SelectModel.ts:535` | props + 2 state | start the load when sync, or on open when async | explicit call from the open path and the prop pump; **the one with real ordering risk** |
| 7 | `SelectModel.ts:556` | `[state.open]` | close reset, wrapped in `queueMicrotask` | **deleted** — close consequence, run inline where `open` is set |
| 8 | `SelectModel.ts:577` | 2 state | seed `activeIndex` from the selection, wrapped in `queueMicrotask` | **deleted** — its own comment says the microtask exists because "model effects with deps run inside `setPropsInternal` during the render phase" |
| 9 | `MultiSelectModel.ts:210` | `[state.open]` | close reset (`popoverResized`), `queueMicrotask` | **deleted** — as #7 |
| 10 | `AutocompleteModel.ts:356` | `[state.open]` | close reset (`activeIndex`), `queueMicrotask` | **deleted** — as #7 |

Four `queueMicrotask` deferrals (#7–#10) are documented React workarounds: effects evaluate during
`setPropsInternal`, i.e. mid-render, so a synchronous `state.update` there trips React's "cannot
update a component while rendering" warning. A vanilla driver pumps props outside any render phase,
so the reason evaporates. **Deleting a deferral changes timing**, though, and `TOneState` dispatches
synchronously — so each deletion must name what now runs inline and confirm it cannot re-enter its
own listener. That is the same guard C2's `AlertsBar` measurement pass needed, in reverse.

**The memo-deps answer (B13's fourth row), settled in US-1014 and binding on US-1015 through
US-1018.** Compare a memo's **output** when the memo genuinely derives something; compare the
**upstream prop** when the memo is a 1:1 pass-through of it. `ListBoxModel.resolved` depends on
`props.items` alone, so its output identity carries no information the prop does not — use the prop
and skip evaluating the memo inside change detection. `selectedKey`'s output is a normalised
primitive, so comparing the output is strictly better than comparing `props.value`. `TreeModel.rows`
is not derivable from props at all — its identity is the only signal carrying expand/collapse — so
compare the output. Two further rules came out of the same task: the signature must be **fixed
length** (`depsChanged` reads a length change as "changed"), and **reactive state must not appear in
it**, because a state change does not pump props in a vanilla driver and the slot would be dead code.
That last one is US-1015's specific trap: three of `TreeModel.ts:761`'s deps are state slices.

**One correction US-1014 also had to make**, which every later task inherits: with `renderCell` a
stable bound field, the engine no longer repaints unconditionally on every parent render, so the
signature must list every input a cell actually reads — not the historical dep list. `variant` and
`selectionStyle` were absent from the React effect and had to be added; conversely `rowHeight` is
dropped (the engine compares it itself) and `getContextMenu` is dropped (it changes no cell DOM).

Effects #1 and #3 are the ones with no precedent. B13 left "deps on a `memo()`" undecided and C2
recorded that it never came up; here it is the mechanism by which a filtered list repaints. The task
that converts `ListBox` decides it, once, and `Tree` follows.

**C3-7 — Three shared pieces convert with the first consumer, not per-component.**

- **`uikit/shared/highlight.ts` gains a DOM form.** It returns `React.ReactNode` today and has four
  consumers — `ListItem`, `MultiListBox`, `TreeItem` (all C3) and `AVGrid/DataCell` (C4). B15
  already decided av-grid's own `highlight.ts` is dropped in favour of this one, so the DOM form
  lands here and C4 inherits it. The React form stays until `AVGrid` goes.
- **`uikit/shared/selection-style.ts` becomes CSS and is deleted.** It is the last Emotion file in
  `uikit/shared/`, and all three of its consumers (`ListItem`, `Tree`, `TreeItem`) are in this epic.
  US-996 deliberately deferred a *generic* shared selection stylesheet, and C2 then had
  `CategoryList` move its own rules into its own CSS. C3 finishes the job the same way, with the
  shared rules living in whichever stylesheet owns the row.
- **One id generator replaces five `useId` calls** (C3-5), in `uikit/shared/`, following
  `tooltipRegistry.nextId()`'s existing shape.

**C3-8 — Emotion to CSS continues C1's and C2's contract, with one case neither had.** One
`ComponentName.css` per component in `@layer uikit`, selectors on the same `data-*` attributes,
colours as `var(--*)` with fallbacks, computed values written to `element.style` and **cleared as
well as set**. C2's 2026-08-21 selector-depth guard applies unchanged: before translating a rule,
scan for `>`, `:empty`, `:nth-child`, `+` and `~` and state what each matches at the new host depth.

The new case is **virtualized rows**. The engine positions every cell absolutely and writes
`left/top/width/height` itself, so a row's stylesheet must not assume document order, must not use
sibling or `:nth-child` selectors, and must not set any of the properties the engine owns. This is
stricter than anything C1 or C2 had to respect, and it applies to `ListItem`, `SectionItem` (both
copies), `TreeItem` and `MultiListBox`'s rows.

**C3-9 — The measured number (roadmap Rule 4): one keystroke in a `Select` search over a large
list.** `Select` is the honest subject: 8 app-layer call sites, it filters through a memo, and one
keystroke repaints the whole visible window of a virtualized list — the exact workload the roadmap's
thesis is about. DOM writes are counted with EPIC-053's `MutationObserver` method over **both**
`[data-type="live-preview"]` and `#persephone-overlay-layer`, because the dropdown portals into the
overlay layer (C1-8's trap, which C2 hit for real).

Per C2's closure precedent the historical all-React baseline is **not** required: the number is
taken on the vanilla implementation, once, and recorded in this epic's Notes. If a baseline is
wanted, the only recoverable point is a worktree at this epic's opening commit, and taking it is
cheap **before** the engine lands and impossible after.

Four secondary counts close alongside it:

| Count | Open | Target at close |
|---|---:|---:|
| `@emotion` importers in `uikit/` | 21 | **9** (all `AVGrid/`, C4) |
| Emotion files in `uikit/shared/` | 1 | **0** |
| `Panel` consumers inside `uikit/` | 1 | **0** |
| `uikit/` components without a story | 2 | **2** — `RenderGrid` (React, ledger) and `AVGrid` (C4). Corrected in US-1013: with coexistence the story lands on the vanilla engine, so the dying React one is still storyless. Both are removal-ledger entries |

**C3-10 — C3 runs as one epic, with the dropdown trio's tail as the designated slip items.**
*(Decided 2026-08-21; delegated to the epic's recommendation. Answers EPIC-055 Concern 6.)*

At 7,578 lines C3 is the largest epic in the programme so far — 1.8× C2. Splitting it at the obvious
line (engine + data views, then dropdowns) would produce a 5,877-line epic and a 1,701-line one, and
the second would be blocked on the first for its entire length. That is not two schedulable epics; it
is one epic with a checkpoint. The better instrument is the one C2 used: name the slip items up
front. `MultiSelect` (**zero** production call sites) and `Autocomplete` (one) are the natural
choices — nothing in C4 needs them, whereas C4 needs `Select` (`AVGrid/CellSelect.tsx`) and
`MultiListBox` (`AVGrid/filters/OptionsFilterContent.tsx`).

## Goals

- Absorb av-grid's `render/` engine into `uikit/` on Persephone's terms — no second reactive
  primitive, no React root per cell — and give it the story `RenderGrid` has never had.
- Convert `ListBox`, `MultiListBox` and `Tree` onto it behind unchanged React-facing signatures, so
  C4 and Epics D and E inherit vanilla data views.
- Convert the three dropdown composites C2-1 moved here, which exercises `Popover`'s and `Menu`'s
  first real consumers and finishes `Panel`'s eviction from `uikit/`.
- Shed six effects and delete four, including the two memo-deps sites B13 left undecided — and
  record the memo-deps answer for Epics D and E.
- Retire the last Emotion file in `uikit/shared/`, leaving `AVGrid/` as the only Emotion in the
  library.
- Leave the React `RenderGrid` and `RenderFlexGrid` cleanly parked for Epics D and E, with one
  documented sentence about which engine a new consumer uses.
- Produce Rule 4's measured number for a keystroke-filtered virtualized dropdown.

## Linked Tasks

Planned decomposition — **task documents are not written yet**. Per
[CLAUDE.md](../../CLAUDE.md)'s task-creation workflow each is investigated and written immediately
before its implementation, and this table's rows become links as that happens.

| Task | Title | Status |
|------|-------|--------|
| [US-1013](../tasks/US-1013-virtual-grid-engine/README.md) | The vanilla virtualization engine — `VirtualGrid`, plus the story `RenderGrid` never had | Implemented |
| [US-1014](../tasks/US-1014-listbox-vanilla/README.md) | `ListBox`, `ListItem`, `SectionItem` — the first data view on the vanilla engine | Implemented |
| US-1015 | `Tree` — rows, DnD, keyboard, and the largest model in `uikit/` | Planned |
| US-1016 | `MultiListBox` — checkbox rows and the select-all header | Planned |
| US-1017 | `Select` — four effects, async item loading, and the Rule 4 number | Planned |
| US-1018 | `MultiSelect` and `Autocomplete` — the last two dropdowns and `Panel`'s eviction | Planned |

Six tasks rather than C2's eight, because the engine cannot usefully be split (its six files are one
paint loop) and the two zero-to-one-call-site dropdowns are cheaper together than apart. US-1013 and
US-1015 are each larger than any single C2 task; if either grows a second natural seam during
investigation, splitting it there is expected, not a scope change.

### Ordering

**US-1013 first, and it blocks everything.** Nothing else in the epic can be written against an
engine whose seam is not yet decided. It also carries C3-2's "no reactive store" call and C3-4's
naming call, both of which every later task depends on.

**US-1013 → US-1014 → {US-1016, US-1017}.** `MultiListBox` and `Select` both render `ListBox`
(`MultiListBox.tsx`, `Select.tsx:153`), so they follow it. `Select` additionally consumes
`ListBoxModel`'s scroll-on-`activeIndex` behaviour (`SelectModel.ts:573-574`) — the coupling C2-1
named as the reason the trio moved here at all — so it must land after `ListBox`, not beside it.

**US-1016 → US-1018 (partly).** `MultiSelect` renders `MultiListBox`; `Autocomplete` renders
`ListBox` and is otherwise independent, so US-1018 can start on its `Autocomplete` half as soon as
US-1014 is done.

**US-1015 is independent of the dropdown chain.** `Tree` needs only the engine. It is the epic's
largest conversion and can run in parallel with US-1014 once US-1013 lands — at the cost that both
would be deciding the memo-deps question (C3-6 #1/#3) at the same time, so prefer letting US-1014
settle it first.

**The slip items are `MultiSelect` and `Autocomplete`** (C3-10). Neither is needed by C4.

### Verification

Every conversion task verifies the same way, and each task's acceptance criteria state it
explicitly:

- `npm run typecheck`, `npm run lint`, `git diff --check`;
- open the component's story in the Storybook editor and exercise every prop control;
- **capture `browser_snapshot` before and after and diff the `data-*` output** — the `data-name`
  contract ([ui-element-contract.md](../architecture/ui-element-contract.md)) is what makes the two
  trees comparable, and C3-5 promises they are identical.

Four exceptions, because the story is not the real exposure:

- **The engine has no story to convert against.** US-1013 writes the first `RenderGrid` story, and
  it must drive the properties a story otherwise hides: a row count large enough to virtualize,
  sticky regions, `fitToWidth`, variable row heights, and a scroll that settles (the point of
  `CellPool` is that a settled scroll allocates nothing).
- **`Tree` needs an app-level pass** over its six consumers — `components/tree-provider`,
  `editors/board`, `editors/git-tree`, `editors/notebook`, `editors/rest-client`, `editors/tools` —
  focused on drag-and-drop, expand/collapse of large trees, and the context menu. Its story
  exercises none of the DnD traits.
- **`Select` needs an app-level pass** over its eight consumers, because its async-loading arm
  (C3-6 #6) only fires for non-array `items`, which the story does not use.
- **`MultiSelect` has no production call site at all**, so its story *is* its only exposure. Say so
  in the task rather than discovering it at review — the same weakness C2 recorded for
  `Notification` and `Progress`.

Two additional measurements belong to US-1013 alone, because they are the epic's premise rather than
its correctness: the settled-scroll allocation count (`CellPool` hit rate) and the engine-side half
of the Rule 4 number. Neither is a pass/fail gate; both are recorded in the Notes.

### Task notes

**US-1013 — the engine.** Absorb the six `render/` files plus `core/AsyncRef.ts` (B15). Decide and
record: the name (C3-4), the state shape (C3-2), and the exact public surface `ListBox`, `Tree` and
`MultiListBox` will call — at minimum `update(RerenderInfo)`, `scrollToRow(row, align)`, `size`, and
an `attach()`/dispose pair, because those are what the current hosts use. `uikit/RenderGrid/` is
**not touched**: no export changes, and no deprecation edit that would churn 12 files' imports — one
line in `uikit/CLAUDE.md` instead. `renderInfo.ts` and `rerender-check.ts` are near-identical on
both sides already, so review effort should go to `RenderGridModel` and the DOM shell, where the two
implementations genuinely diverge.

**US-1014 — `ListBox`.** The epic's pattern-setting conversion: three files, two effects, two memos
in the deps of one of them (C3-6 #1). Keep `data-type="list-box"`, the `data-loading` / `data-empty`
arms with their `EmptyRoot` fallbacks, `role="listbox"`, `aria-activedescendant` and
`data-selection-style` on rows. `ListItem` is where C3-7's `highlight` DOM form and C3-8's
absolute-positioning constraint both land first, and where `selection-style.ts`'s `rowSelectionBase`
and `rowFocusSelectionOverride` become CSS. Note `ListBox` has **two** row components (`ListItem`,
`SectionItem`) and `Tree` has its own separate `SectionItem` — three files, not one shared one.

**US-1015 — `Tree`.** The largest single conversion in the programme: 2,170 lines, `TreeModel.ts`
alone 815. Three things carry over unchanged because they are already framework-free —
`TreeDndModel`, `TreeKeyboardHandler`, and the `core/traits` DnD plumbing (no React import anywhere
in `core/traits/`). What does not carry over is `TreeModel.ts:761`'s repaint effect, whose deps mix a
memo, seven props and three state slices; splitting it into the three separate consequences (rows
changed / selection changed / drag state changed) is the point of the task, and is also the first
chance in the programme to replace an `{ all: true }` repaint with a real dirty set. **Do not take
that chance in this task** — behaviour first, precision as a follow-up with a measurement attached.

**US-1016 — `MultiListBox`.** Five memos, zero effects, and the only C3 model that needs no shedding
at all. Its select-all header is tri-state (`allVisibleSelected` / `someVisibleSelected` / neither)
driven through three `renderIcon` calls, so it is mostly a DOM-icon conversion over a `ListBox` that
already converted.

**It also carries an obligation from US-1014:** `MultiListBox` currently builds every row through
`ListBox`'s `renderItem`, which now means one retained React root per visible row. US-1016 must build
its checkbox rows directly instead, so that every remaining consumer of the `renderItem` escape hatch
is app-layer and already scheduled for Epics D/E — the seam then drains the same way `RenderGrid`
does. Until it lands, do not read a `MultiListBox` measurement as the `ListBox` number.

**US-1017 — `Select`.** Four effects, two of them deleted outright (C3-6 #7, #8) and one with real
ordering risk (#6: the load starts either from the prop pump for sync sources or from the open
transition for async ones, and `_loadId` invalidation must still race correctly). Composes an
already-vanilla `Popover` and `Input`. **Takes the Rule 4 number** (C3-9) and records it in the
Notes.

**US-1018 — `MultiSelect` and `Autocomplete`.** One effect each, both the deletable close-reset
shape. `Autocomplete` is the last `Panel` consumer in `uikit/` (`Autocomplete.tsx:139`) — its inline
`Panel` row becomes plain elements in its own stylesheet, and the `Panel`-consumers-in-`uikit` count
reaches zero. `AutocompleteModel` holds four of the epic's 31 `ReactNode` references, so check
whether its slot props can narrow now that its only view is vanilla.

## Concerns / Open questions

1. **C3-1 is settled, and its residual risk is discoverability, not lifetime.** The user accepted
   coexistence on 2026-08-21, conditional on the duplication being scheduled for removal — which
   roadmap §7's new removal ledger now guarantees. What the ledger does *not* address is the window
   itself: from C3's close until Epic E's, `uikit/` contains two virtualization engines with similar
   names, one correct for new code and one not — and the wrong one is the one still exported from
   `uikit/index.ts` under the obvious name. C3-4's line in `uikit/CLAUDE.md` is the whole mitigation,
   so it is not optional garnish on US-1013; it is the only thing standing between a temporary
   duplicate and a thirteenth consumer.

2. **C3-2 puts a component in `uikit/` that uses none of Persephone's state primitives.** Accepted,
   and the exemption is written into `uikit/CLAUDE.md` by US-1013 rather than left implicit. The
   residual risk is drift in the other direction: the moment a host wants to *observe* the engine
   rather than command it, the pressure will be to bolt a `TOneState` onto it. If that comes up, the
   answer is a callback the host registers, not a store — and it belongs in this section as an
   amendment, not in the task that felt the pressure.

3. **C3-3 and C3-10 are settled and deliberately cheap to reverse.** `RenderFlexGrid`'s disposition
   changes one row of US-1013's scope, and the slip-item choice changes nothing until the epic runs
   long. Recorded so nobody re-litigates them mid-epic.

4. **The memo-deps question (C3-6 #1, #3) has no precedent and sits on the repaint path.** B13 left
   it undecided; C2 recorded that it did not arise. If the answer chosen in US-1014 is wrong, the
   symptom is not a crash — it is a list that repaints too often (invisible, and it silently spends
   the performance the epic exists to gain) or too rarely (a stale row after a selection change).
   Both are exactly the kind of thing a story with 20 items will not show. US-1014 should state how
   it verified the repaint *frequency*, not just the repaint.

5. **Deleting four `queueMicrotask` deferrals changes timing inside a synchronous dispatcher.**
   `TOneState.set` calls listeners inline, so a close-reset that used to land one microtask later now
   lands inside whatever set `open` — potentially inside a `Popover` close path that is itself
   iterating listeners. Each deletion names what runs inline and why it cannot re-enter. This is C2's
   Concern 3 in a new place, and C2's `AlertsBar` fix is the pattern if a guard is needed.

6. **`Select`'s async loading arm is the only genuinely stateful I/O path in Epic C.** `_loadId`
   invalidation, `itemsLoaded`, `itemsError`, and a load that may be triggered by either a prop
   change or an open transition. It has no story coverage (the story passes arrays) and eight
   production call sites. If any single thing in this epic warrants a written-out list of the
   interleavings before the code is touched, it is this one.

7. **C4 depends on two C3 outputs.** `AVGrid/CellSelect.tsx` renders `Select`,
   `AVGrid/filters/OptionsFilterContent.tsx` renders `MultiListBox`. Both are inside C3's non-slip
   set, so the ordering holds — but a decision to defer `Select` for any reason would push C4 out
   with it. Worth re-checking at C3's close rather than assuming.

8. **The epic has no answer for `AVGrid`'s nine Emotion files, and should not acquire one.** After C3
   the entire remaining Emotion surface in `uikit/` is `AVGrid/`, which C4 deletes wholesale by
   replacing the component. Converting any of it in C3 would be work thrown away. If a C3 task finds
   itself editing an `AVGrid/` file, that is a signal the seam decision (C3-1) is being violated.

## Notes

### 2026-08-21

- Epic opened as C3 of the roadmap's four-way Epic C split, immediately after
  [EPIC-055](EPIC-055.md) (C2) closed. The next free epic number is **EPIC-057**; the next free task
  number is **US-1013**.
- **The scope was re-measured rather than inherited**, as EPIC-055 Concern 6 required. The line
  estimate held (7,578 vs "~7,600") — the first estimate in this programme that did not move — but
  the consumer surface did not: `RenderGrid` has 12 app-layer importer files, which is what turns
  B15's "absorption" into C3-1's coexistence question.
- **C3-1 was decided at open** *(user decision)*: two virtualization engines during the migration are
  acceptable, and temporary migration solutions generally are — **provided the programme's final
  cleanup phase actually collects them**. Epic F previously promised only to strip React *wrappers*
  off converted components, which would not have caught a whole React-only component like `Panel` or
  `RenderGrid`. Roadmap §7 Epic F therefore gained a **removal ledger**: every duplicate the
  migration creates is written down in the epic that creates it, with what makes it collectable, and
  Epic F cannot close while an entry is still in the tree. C3 contributes two entries
  (`uikit/RenderGrid/`, `RenderFlexGrid.tsx`) and a third if C3-7 lands (`highlight`'s React form).
- **C3-2, C3-3 and C3-10 were delegated to the epic's recommendation** *(user decision, 2026-08-21:
  "I agree with whatever you would recommend")*. They stand as written, with their alternatives and
  residual risks kept in the document rather than dropped — a delegated decision has no discussion
  behind it, so the reasoning has to survive in the text or it is lost. Consequences worth
  restating: the engine gets a **named exemption** in `uikit/CLAUDE.md` (C3-2), `RenderFlexGrid` and
  the React `RenderGrid` are ledger entries rather than epic work (C3-3), and `MultiSelect` and
  `Autocomplete` are the two components to drop if C3 runs long (C3-10).
- **Nothing in the epic is now blocked.** US-1013's task document is the next artefact.
- **B13's memo-deps row arrives here.** C2's document recorded that none of its seven effects hit
  it; two of C3's ten do, both on the repaint path (C3-6 #1, #3). US-1014 settles it and `Tree`
  follows.
- **Four of the ten effects are deleted, not shed.** `SelectModel.ts:577`'s comment states the
  reason in the source: effects with deps evaluate inside `setPropsInternal`, during React's render
  phase. The vanilla driver pumps props outside any render, so three sibling close-reset deferrals
  lose their reason too.
- **§3.5's leak list is down to one**, and it is C4's documented exemption. `ListBoxModel` and
  `TreeModel` now import `core/events/context-menu`; `RenderFlexGrid` imports `core/utils/*`, not
  `shared/utils`. C3 inherits no Rule 6 work.
- **Story coverage was mis-stated in the roadmap** and is corrected here: 42 of 44, not 38, with
  `Checkbox` and `Label` carrying vanilla-only `.story.ts` files written during C1. `RenderGrid`
  (C3) and `AVGrid` (C4) are the only two left.

### 2026-08-21 — US-1013 (the engine) implemented

- **The engine landed as `VirtualGrid`** (`uikit/VirtualGrid/`, `VirtualGridView` +
  `VirtualGridModel`, `data-type="virtual-grid"`), settling C3-4. The name shares no token with
  `RenderGrid`, so `grep RenderGrid` returns exactly the dying engine for the two epics they
  coexist — which is the property C3-4 was actually about.
- **C3-2 held in implementation.** `VirtualGridModel` has no base class, no `TOneState`, no
  `effect()`: one `onRepaintNeeded` callback that the view implements as "schedule a paint on the
  next frame". The exemption is written into `uikit/CLAUDE.md` as a named rule, as C3-2 required.
  An independent review recommended porting the model onto `TComponentState` +
  `createComponentModelDriver` so `VanillaView.bind()` could be used; that was **rejected**,
  because it reintroduces the store the decision removed and the view needs a signal, not a
  subscribable state.
- **The engine is a `VanillaView`, not the donor's `new Engine(host, options)`.** `shared/mount.tsx`
  types the React boundary as `new ctor(props)`, so the donor shape could not be hosted by
  `mountVanilla` at all. Three donor behaviours were dropped as contract violations: appending
  itself to its host, removing its own root in `destroy()`, and installing listeners in the
  constructor.
- **Four of the six adopted files came across verbatim** (`types.ts`, `rerender-check.ts`,
  `renderInfo.ts`, `CellPool.ts`) — the normalized diff against Persephone's copies was comments
  plus four wanted fixes, exactly as the epic's "review effort should go to `RenderGridModel` and
  the DOM shell" predicted.
- **`AsyncRef` moved to `uikit/shared/async-ref.ts`.** It was already byte-equivalent on both sides
  with one importer, so sharing removed a duplicate rather than creating one. That single import
  line is the only edit inside `uikit/RenderGrid/`.
- **The premise is measured.** A probe mounted the engine over 50,000 rows in a 400×300 viewport:
  52 cells on screen, 112 `createElement` calls during warm-up, and then across 20 scroll frames
  **1,000 cells admitted, 1,000 pool hits, 0 misses, 0 allocations**. A settled scroll allocates
  nothing, as claimed. Paint time 0.1–0.5 ms per frame.
- **The probe found a real defect the story would have hidden**: the view did not pass `recycle`
  to the model, so the pool filled from every paint and was never drawn from — pooling was dead
  while every visible symptom looked correct. Worth recording because it is the shape of bug this
  epic will keep producing: the fast path failing silently while the output is right.
- **Story arms verified individually**: `percentWidth` makes the area exactly the client width
  (the `hasPercentLength` fix — no 20px phantom scrollbar), `variableRowHeight` produces mixed row
  heights, `fitToWidth` drops the trailing slack and hides the horizontal scrollbar, and all four
  sticky bands plus corners populate. Scrolling back to the very top renders rows, i.e. the
  `safeDirection` trap is closed.
- **The React `RenderGrid` keeps two known bugs** deliberately, because it is scheduled for
  deletion: `restoreScroll` on any container/model mismatch (which fights the user's scroll), and
  `id="avg-root"` on every instance (duplicate ids). `VirtualGrid` has neither — it restores only
  after the grid was actually hidden, and uses no `id` at all.

### 2026-08-21 — US-1014 (`ListBox`) implemented

- **C3-6 #1 is settled** and the answer is recorded in the C3-6 section above as the memo-deps rule
  every later task follows. Mechanism: `model.repaintSignature()` (fixed length) plus a `DepsGate`
  in the host view's `onUpdate`, built on `depsChanged` — now exported from `core/state/model.ts`
  so there is one comparator rather than an imitation of one.
- **C3-6 #2 is settled differently from what the table said**, and the table has been amended rather
  than left to contradict the code. The trigger is the host view's `onUpdate`, not `setProps`; and
  `attach()`'s measured pass is not sufficient on its own, so the engine gained a one-slot pending
  scroll. The first implementation flushed it from `onFrameResize` and *looked* correct — the
  container really did end up scrolled 95,724px — while the list still painted row 0 at the top,
  because the scroll event was delivered while the container measured 0x0 and `onScroll`'s
  hidden-guard discarded it. The flush moved to the view's `paint()`, and `measured` now tests the
  container as well as the root. Second epic in a row where the engine's real defect was invisible
  in every symptom except the one that mattered.
- **A live bug was closed by accident, and it explains a long-standing cost.** `ListBox.tsx` built
  `renderCell` as a fresh closure on every render, and `RenderGridModel.inputChanged()` compares
  `renderCell` by identity — so *every* parent re-render repainted every visible cell, and the
  effect at `ListBoxModel.ts:224` was belt-and-braces over an unconditional repaint. That is why
  `variant` and `selectionStyle` worked despite being absent from its deps. With a stable
  `renderCell` the gate is real: a re-render with identical values now writes **0** DOM mutations.
- **`applyRestProps` had a latent bug** that `ListItem` is the first component to expose: it wrote
  `draggable=""` for `draggable={true}`, and `draggable` is an *enumerated* attribute whose invalid
  value default is `auto` — a `div` that is not draggable. The link editor's two `ListItem` call
  sites both pass it. Fixed for `draggable`, `spellcheck` and `contenteditable`.
- **React-valued slots are permitted in a virtualized row**, with four guard rails now written into
  `uikit/CLAUDE.md`. This is not a reopening of C3-1's rejected cell bridge: the engine's contract is
  still `HTMLElement`, roots are per pooled element rather than per row, and the DOM-representable
  path creates none at all — measured, an `IconName` icon produces zero `[data-part="react-slot"]`
  elements. The finding that forced the design: React *elements* are the norm for
  `IListBoxItem.icon` in production (`FileList`, `OpenTabsList`, `MenuBar`, `BuiltinEditorsList`),
  so "the default row stays pure DOM" was false as stated.
- **C3-4's naming rule held with no friction.** `uikit/RenderGrid/` is untouched by this task;
  `ListBox` simply stopped importing it.
- **C3-7 partially done.** `highlight.ts` gained its DOM form (`highlightInto`). `selection-style.ts`
  is *not* deleted — `ListItem`'s share was copied into `ListItem.css` and the module keeps its three
  Emotion consumers (`Tree`, `TreeItem`, `ui/sidebar/FolderItem`). It dies in US-1015.
- **C3-5's `useId` replacement landed** as `uikit/shared/element-id.ts`; one of five sites converted.
- **`uikit/` Emotion importers: 21 → 19.** `ListItem.tsx` and `SectionItem.tsx` are clean;
  `uikit/shared/selection-style.ts` still counts.
- **Story coverage unchanged at 42 of 44.** The `ListBox` story gained a `rowCount` control, because
  60 rows never exercise the cell pool.
- **Two defects escaped implementation and were caught by the user in the app**, both in `ListItem`'s
  slot handling, both from one screenshot of an oversized check icon in a `Select` dropdown. First:
  Emotion's `& > svg` was read as an *icon* rule and translated as such, when it actually matched
  every svg the row placed at its top level — including the default trailing check/chevron, which
  then had no size and rendered at its intrinsic 24x24. Second, found while verifying the first: a
  string `icon` that is not a registered icon name fell through to `fillSlot`'s string arm and was
  written into the row as **literal text**, where `renderIcon` had returned `null`.
  The lesson for US-1015 through US-1018, which all translate slot CSS: **a selector is not
  documentation of its author's intent.** Enumerate what a rule actually matches in the *old* DOM
  before writing its replacement, and check every slot that puts a node at the same depth — not just
  the one the rule appears to be named after.
- **A third defect, in the engine, found while the user tested `Select` in Storybook.** On first open
  the selected row's check icon was shifted right and clipped; hovering any row fixed it. Cause: the
  geometry must be computed *before* a paint, but the scrollbar only exists *after* it — the first
  paint is what makes the area taller than the container — so the first computation ran with
  `scrollBarWidth: 0` and laid every cell out at the container's full width (measured: 400px cells in
  a 390px client area, check 6px past the visible edge). `renderInfoChanged`'s existing settle guard
  could not catch it: it runs on a microtask, before the paint it just requested, and it asks for a
  *repaint*, which cannot change per-cell widths. Fixed with `VirtualGridView.settleScrollBar`, a
  post-paint comparison that requests one `update({ all: true })`, attempt-bounded. **This is a
  US-1013 engine bug that US-1014's testing exposed**, and it would have hit `Tree` and `Select`
  equally — the accidental recompute-on-every-render that the React `RenderGrid` got for free was
  masking it, which is the same mechanism that hid the `variant`/`selectionStyle` dep gap.

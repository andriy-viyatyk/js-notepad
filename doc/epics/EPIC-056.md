# EPIC-056: De-React Epic C3 — Virtualization engine, data views and dropdowns

## Status

**Status:** Active — all six tasks implemented, awaiting user testing
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
| 3 | `TreeModel.ts:761` | 1 memo + 7 props + 3 state | `gridRef.update({ all: true })` | **Done in US-1015, and it needed more than #1.** `repaintSignature()` + the host gate covers the props; the three state slices go through a single `mutate()` funnel on the model that calls one host callback. The consequence is **re-running the render pass**, not repainting cells — `aria-activedescendant` is derived from `rows` twice over, so a collapse must remove or rewrite it |
| 4 | `TreeModel.ts:791` | `[props.activeIndex]` | as #2 | **Done in US-1015.** It inherited the engine-side pending scroll as predicted, but the *reveal* path did not: see the US-1015 notes on `scrollToRowAfterPaint` |
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
- **`uikit/shared/selection-style.ts` becomes CSS and is deleted.** ~~all three of its consumers
  (`ListItem`, `Tree`, `TreeItem`) are in this epic~~ — **the premise was wrong and the row is
  amended.** There was a **fourth** consumer this decision did not count: `ui/sidebar/FolderItem.tsx`,
  which is app-layer and belongs to Epic D. US-1014 converted `ListItem`; US-1015 converted `Tree`
  and `TreeItem` and then **deleted the module by relocating** its two surviving fragments verbatim
  into `FolderItem`'s own Emotion block, rather than converting an app-layer component from a
  `uikit` task or leaving an Emotion file in `uikit/shared/` for two more epics. The emitted CSS is
  byte-identical — the same `CSSObject` literals at the same position in the same styled block — and
  the third export, `focusSelectionOverride`, was dead by then and went with it. US-996's deferral of
  a *generic* shared stylesheet stands: the end state is four independent per-component copies.
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
| `@emotion` importers in `uikit/` | 21 | **10** — 9 `AVGrid/` (C4) + `RenderGrid/RenderGrid.tsx`, the React-only survivor C3-1 keeps alive on Epic F's ledger. Corrected in US-1017; **measured 10 at US-1018's close**. `Tree/Tree.story.tsx` also imports Emotion and is outside the production count by the measurement note |
| Emotion files in `uikit/shared/` | 1 | **0** |
| `Panel` consumers inside `uikit/` | 1 | **0** production, reached in US-1018. Note what this does *not* mean: **30 `uikit/` stories import `Panel` as their layout host**, so the component cannot be deleted when its production consumers reach zero. Epic F's ledger entry owns that, not C3 |
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
| [US-1015](../tasks/US-1015-tree-vanilla/README.md) | `Tree` — rows, DnD, keyboard, and the largest model in `uikit/` | Implemented |
| [US-1016](../tasks/US-1016-multilistbox-vanilla/README.md) | `MultiListBox` — checkbox rows and the select-all header | Implemented |
| [US-1017](../tasks/US-1017-select-vanilla/README.md) | `Select` — four effects, async item loading, and the Rule 4 number | Implemented |
| [US-1018](../tasks/US-1018-multiselect-autocomplete-vanilla/README.md) | `MultiSelect` and `Autocomplete` — the last two dropdowns and `Panel`'s eviction | Implemented |

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

### 2026-08-22 — US-1017 (`Select`) implemented, and the Rule 4 number

**All four effects are gone, and `Select` is the first model in the epic to lose its `init()`
entirely.** Where each went: the items-source reset (`:520`) to `setProps` behind an identity guard on
a model-owned `appliedItemsSource` sentinel; the load trigger (`:535`) to `resetItemsCache` for sync
sources and `startLoadIfNeeded` from the open transition for async ones; the close reset (`:556`) into
`closeInto`, a draft mutator applied inside the write that closes; and the `activeIndex` seed (`:577`)
into `openInto` on the open transition plus `commitLoaded` when rows arrive. `state.update` call sites
went 23 → 13, and `grep "s.open = "` inside the folder now returns exactly the two draft mutators.

**Two `queueMicrotask` deferrals deleted, one kept — and the kept one gained a second reason to
exist.** The deleted pair were documented React render-phase workarounds and the reason evaporates
under a vanilla driver. The survivor clears `_suppressFocusOpen` after `commitSelection`, and it is no
longer only about a focus bounce: the popover subtree is now detached *inside* `closePopover`'s
synchronous dispatch, where React detached it after the handler returned. If focus was inside the
popover it is on `<body>` by the time `inputRef.focus()` runs, so that call becomes a real focus
change and fires `onInputFocus` synchronously. Verified: committing a row leaves the control closed.

**Draft mutators rather than setters, because two writes break the scroll.** `openInto`/`closeInto`
mutate an immer draft and never call `state.update`, so `commitSelection` and `onInputChange` each
produce exactly one write. That is not tidiness: `ListBoxView` picks `scrollToRowAfterPaint` only when
one `onUpdate` carries both a moved `repaintSignature()` and a moved `activeIndex`. Split them and the
second push reports no content change, picks `scrollToRow`, and scrolls short the moment the grid is
already measured. The rule is now in `uikit/CLAUDE.md` beside the two scroll entry points.

**A live bug fixed, not preserved: `activeIndex` was seeded in the wrong index space.** The old effect
computed `loadedItems.findIndex(...)`, but `activeIndex` is in **filtered** index space everywhere else
(`commitSelection` reads `filteredSources[idx]`; the keyboard arms bound on `filteredItems.length`).
They coincide only while the query is empty, and they diverge on a reachable path: with a value
selected and the popover closed, typing one character opens and filters in the same write, so the seed
indexed the unfiltered array and highlighted the wrong row. `seedIndex` now walks the filtered order
directly, so its result is a valid index by construction. Verified: value `Option 1`, closed, type
`1` → `Option 1` is active (the old computation would have made `Option 10` active).

**And a bug I introduced and the runtime probe caught.** The first `seedIndex` read `loadedItems` from
state — which is empty at exactly the moment `commitLoaded` needs it, so the async arm silently seeded
nothing. Both the item array and the search text are now parameters. This is general enough that it is
written into `uikit/CLAUDE.md` as its own rule: never read state or a `memo()` from inside a
`state.update` producer; immer runs the producer against the previous state, so anything read there is
one step stale and the failure is silent.

**Zero React roots, open *and* closed.** The dropdown uses `PopoverView`'s `contentView` seam, so the
floating root's direct child is `div[data-type="list-box"]` and the open dropdown measures **0**
`[data-part="react-slot"]` with 1,000 items. The closed control also measures 0, which is new: the
React implementation passed `icon={renderIcon("chevron-down")}`, so every `Select` on screen carried a
retained React root inside its chevron at rest. Passing the `IconName` string takes
`IconButtonView.updateIcon`'s `createIconElement` branch instead.

**No wrapper view for the seam.** One design agent held that a wrapper was mandatory, because the
returned view's root must *be* the host (as `MenuContentView`'s is) and letting `ListBoxView` adopt the
host would collide with `PopoverFloatingView.applyProps` writing `root.dataset.type = "popover"` on
every update. The collision is real but applies only to *adopting* the host; the factory appends a
child instead, which the code permits. The two properties of the seam that are not visible in its
prop type — it never appends what the factory returns, and it forwards no updates — are now documented
in `uikit/CLAUDE.md`.

**Three shared leaf files changed, each required by the chevron rather than by polish.**
`InputProps.startSlot`/`endSlot` widen from `React.ReactNode` to `SlotContent` so a composed view's
root can be a slot; `InputView` gained an `appliedSlots` identity gate, without which `fillSlot`'s
node path would detach and re-append the chevron button on every keystroke; and
`IconButtonView.updateIcon` gained a gate on the applied icon *name*, without which
`createIconElement` would rebuild the `svg` per keystroke. Both churns would have been *introduced* by
the conversion — React reconciled instead — which is what put them in scope. `IconButton.css` also
moved from the shim into the view, matching what US-1016 did for `Input.css` and for the same reason:
`IconButtonView` imports `IconButton` type-only, so nothing in its module graph pulled the stylesheet.
`Notification` and `SplitButton` keep their now-redundant `../IconButton/IconButton.css` imports, as
`DateInput` kept its `Input.css` one — the line is local evidence that those views compose the DOM
directly, and a sweep over all borrowed-CSS imports is its own task.

**A fidelity bug in the shared compat layer, found by the first `browser_snapshot`-style diff.**
`applyRestProps` dropped `aria-expanded={false}` entirely and wrote `aria-expanded=""` for `true`;
React renders booleans on `aria-*` as `"true"` / `"false"`, and `aria-expanded="false"` is
semantically different from no attribute at all. The `ENUMERATED_ATTRIBUTES` mechanism already existed
for exactly this class, so `isEnumeratedAttribute` now also matches any `aria-` prefix. This was
**already live in the converted `PathInput`** (`PathInputView.tsx:83` passes
`aria-expanded={showSuggestions}`), and US-1018 would have hit it twice more — `Autocomplete` and
`MultiSelect` both pass `aria-expanded={open}`.

**One compound `bind`, not a funnel — and the 23 write sites do not vote the other way.** Six of the
nine state fields are literally child props, which is Rule 9's `bind()` case; the other three render
nothing. The write count looked like the loudest possible argument for `Tree`'s `mutate()` funnel, at
three times `Tree`'s, but it carries no correctness weight here: the funnel's value in `Tree` is that
delivery is a call the mutation site makes, so `grep == 1` audits it, whereas `bind` delivers through
`TOneState.subscribe` and **a write cannot bypass it by construction**. What the count did argue for is
a *state-transition* choke point, which is what `openPopover`/`closePopover` are. The two kinds of
funnel are different things and `Select` wanted one of each.

**Rule 4 (C3-9) — one keystroke in a `Select` search over a large list.** Measured 2026-08-22 on the
vanilla implementation. Two `MutationObserver`s with identical options
`{ subtree: true, childList: true, attributes: true, characterData: true }`, one on the anchor pane and
one on `#persephone-overlay-layer`, attached with the dropdown already open over **1,000** items and
11 rows rendered, counters read from the callback record counts over ten animation frames after a
single `input` event. Raw counts: **19** in the anchor pane and **198** in the overlay layer, for a
total of **217** records.

*Deviation from the stated procedure, and why.* The anchor pane is an offscreen React root, not
`[data-type="live-preview"]`: the Storybook page could not be driven from the script host, because a
`/@id/`-prefixed dynamic import yields a second module instance and `pagesModel.pages.length === 1` on
it — a duplicate module graph, not a live one. The property the observer pair exists for (C1-8's trap:
the popover portals out of the anchor pane, so the pane alone undercounts) is preserved exactly, and
the overlay-layer figure — where the dropdown, its rows and its position writes all live — is measured
identically to EPIC-055's. For comparison, C2's closure number was 6 / 119 / **125** for one click
opening a context menu.

*One observation the measurement produced, worth its own follow-up.* Most of the 19 anchor-pane records
are `applyRestProps` rewriting every residual attribute unconditionally on every update — it calls
`setAttribute` with the same value rather than comparing first. That is pre-existing, shared by every
converted component, and is the cheapest remaining win on the keystroke path.

**Verified at runtime, through real consumers rather than only offscreen.** `CellSelect` mounted with
a real React root and an **async** `options` function — the only production route to the async arm:
the ref fired **once** and is the inner `<input>` (the stable-callback half of the ref split holding
across re-renders), autofocus opened the dropdown, the loader was invoked once, the rows arrived, and
`aria-activedescendant` landed on the current value's row; commit emitted `onChange("pending")` and
closed, reopening served the cache without a second invocation, and Escape fired `onCancel` once.
`SettingsSections.LinkBehaviorSection` — the call site that rebuilds its `items` array on every render
— survived five forced re-renders (five reset-and-reload pairs) with the trigger correct and the seed
still landing on the selected row. Also checked: the loading arm and its spinner; a 300 ms promise
source with a selected `Option 40` landing highlighted **and scrolled into view** (rows 31–43 visible);
keyboard open seeding the selection and ArrowDown advancing it; `disabled` and `readOnly` both refusing
to open, with `readOnly` leaving the input enabled; and unmounting while open removing the floating
branch from the overlay layer.

**Corrections to this document, found during the task.**

- The US-1017 task note and Concern 6 both said the async arm "has no story coverage (the story passes
  arrays)". Not true: `Select.story.tsx` has an `itemsMode` control with `array` / `lazy-fn` /
  `lazy-promise`. The async arm is the arm the story covers *better* than production does — because no
  production call site passes a Promise or function at all. All ten app-layer sites pass plain arrays;
  the only reachable production route is `AVGrid`'s `Column.options` as a function
  (`avGridTypes.ts:110`), which `CellSelect` bridges, and no production column supplies one. It is live
  API with no live caller, which is why the interleavings were reasoned out in the task document rather
  than smoke-tested.
- C3-9's secondary-count table says `@emotion` importers in `uikit/` reach **9 at close, all
  `AVGrid/`**. Measured at US-1017's open: 13 — nine `AVGrid/` plus `Select.tsx`, `MultiSelect.tsx`,
  `Autocomplete.tsx` and `RenderGrid/RenderGrid.tsx`. US-1017 takes it to **12**, and US-1018 will
  reach **10**, not 9, because `RenderGrid.tsx` is Emotion and C3-1 deliberately keeps it alive as a
  React-only survivor on Epic F's removal ledger. The target should read 10 (9 `AVGrid/` +
  `RenderGrid`).

**Follow-ups recorded, not done here.** IME composition suppression in `InputView` (a close landing
mid-composition pushes the selected label over a live composition session — pre-existing, identical
under React, and a shared-file fix that benefits `MultiListBox`'s search box too); gating
`applyRestProps`' `setAttribute` calls on the current value; hoisting `SettingsSections`' two `items`
array literals to module constants (app layer, so out of C3's scope per C3-5); deleting the dead
`itemsError` field and the unconsumed `SelectItemsResult` export (Epic F owns API cleanup); a sweep
over borrowed-CSS imports; and making an async source load once per source rather than once per open,
which is a semantic change and needs its own decision.

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

### 2026-08-22 — US-1015 (`Tree`) implemented

The largest conversion in the programme. Four design questions went to independent agents with no
conversation context; each answer was then checked against the code before being adopted, and two
were overridden in part. The task document records all four in full.

- **The state-driven repaint (C3-6 #3) is a funnel, not a subscription.** Every state write in
  `TreeModel` goes through one private `mutate()` that writes state and calls one host-registered
  callback. `grep "state.update" src/renderer/uikit/Tree/` returns exactly one hit, which is what
  makes the convention checkable; `TreeDndModel` gets a narrow `mutateState` entry rather than
  touching `tree.state`. The seven scattered `gridRef.update({ all: true })` calls are gone, and
  `TreeDndModel` — the one site that had **no** repaint of its own and relied entirely on the deleted
  effect — is fixed by construction.
- **The consequence of a state write is to re-run the render pass, not to repaint cells.** This was
  the correction to the agent's plain "explicit consequence" answer, and it is the finding worth
  carrying into US-1016 through US-1018: `aria-activedescendant` is derived from `rows` **twice** —
  the bounds check *and* the id — so a `collapseAll()` with a high `activeIndex` must remove the
  attribute and an in-range collapse must rewrite it. Verified at runtime: 28 rows → 4 removes it;
  expanding a folder with `activeIndex = 2` rewrites `…-item-f2` to `…-item-f0c1`.
- **The repaint signature is 13 fixed slots and is not the historical dep list.** `rowHeight` and
  `getContextMenu` are dropped (the engine compares the first; the second is read at event time and
  changes no cell DOM), and five inputs the effect never listed are **added** — `props.id`, which
  feeds `itemId()`, and the four DnD-gating props that decide the wrapper's `draggable` attribute.
  This is the second application of US-1014's correction, and it keeps finding real gaps: the React
  path repainted unconditionally on every parent render, so no gap could ever show.
  **`ListBox` has the same `props.id` gap.** It is pathological only — a component changing its own
  DOM id mid-life — so it was left alone rather than widening this diff.
- **Nine of ten deferrals deleted; the tenth was not a React workaround.**
  `expandAncestorsThenScroll`'s `setTimeout(resolve, 0)` was waiting for the **scroll extent**, not
  for data — and the extent moved when the engine did: `applyLayout` writes `area.style.height`
  inside `paint()`, on `requestAnimationFrame`, so a macrotask now lands too early and `scrollTop`
  clamps silently. Measured: expanding the last folder of a 40×20 tree and scrolling immediately
  lands the offset at **600px** where the target needs **1020px**; nothing re-issues it. The fix is
  three engine lines — `VirtualGridModel.scrollToRowAfterPaint()`, exposing the one-slot pending
  register that `flushPendingScroll()` already drains *after* `applyLayout`. Measured after: 1040px,
  target row inside the viewport. **This is the third bug in this epic caused by guessing when the
  paint had happened** (see the two US-1013 entries above); the engine now has an entry point so the
  fourth does not have to be guessed either.
- **`ListBox` carried the same latent bug and was fixed in the same shape.** `ListBoxView.onUpdate`
  requested a repaint and then scrolled in the same turn, so a list that grew *and* moved
  `activeIndex` past the old extent clamped. Mount was already safe (the grid is unmeasured, so the
  pending slot caught it); a live update was not. It now threads the gate result into
  `syncActiveScroll` and uses the after-paint form only when the content changed, so keyboard
  navigation keeps its immediate scroll.
- **`selection-style.ts` is deleted** — see the amended C3-7 row. `uikit/shared/` is now
  Emotion-free.
- **The translated container rule keeps a `[data-type="tree"]` anchor.** Without it the rule stops
  being scoped to a Tree and starts painting any `TreeItem` under any `[data-focus-selection]`
  container, including one rendered through a `ListBox`'s `renderItem` — which `MenuBar` does with
  `FolderItem`. `TreeItem.css` conversely must **not** copy `ListItem`'s `:not([data-drop-active])`
  carve-out: Tree's override wins on specificity (0,5,0 vs 0,2,0), not source order, so adding it
  would change behaviour rather than preserve it.

#### Defect found in user testing: the chevron rules never matched

The expand/collapse chevrons rendered as 40x34 grey rounded UA buttons with 24px icons, and leaf
rows lost their alignment because the chevron stub collapsed to zero width. Cause: the chevron and
the stub live inside the `[data-part="chevron"]` host, and **`display: contents` removes the host's
box but not its place in the DOM tree** — so `[data-type="tree-item"] > .tree-chevron` could never
match. Fixed by naming both levels, as the icon slot already did. Measured after the fix: 14x14
button, transparent background, no border, 12x12 svg, 14x14 stub.

**This is the third selector-mismatch defect in this epic, and they share one root cause**: a
translated Emotion selector is written against React's DOM, but the vanilla view inserts hosts React
did not have. US-1014's oversized trailing check came from `& > svg` having silently covered *two*
slots; the same task's slot-icon rules then needed both levels named; and this one crosses a
`display: contents` host. **US-1016 through US-1018 must check every child combinator in translated
CSS against the converted DOM, not against the Emotion source.** The tell is cheap to get: a
computed-style read on the element the rule was written for. An unmatched rule on a `<button>` is
loud (UA appearance), but an unmatched rule on a `<div>` or `<span>` is nearly invisible.

#### Two pre-existing defects deliberately preserved, and why they are follow-ups

Both were measured in the running renderer, not inferred, and both look like conversion mistakes to
anyone reading the new CSS — which is why `tree-indents.css` documents them at the point of the
declaration.

1. **The level guides paint nothing.** `Indent`'s `height: 100%` resolves against the row's
   indefinite height (the row is an auto-height child of the engine's positioned cell wrapper, and
   `align-items: center` does not stretch it), so the used height is **0px** and the `border-left`
   draws no line. The documented `border-left-color: transparent` override for a selected row in a
   focused tree is therefore also a no-op. Adding `height: 100%` to the row makes the guide 22px —
   i.e. switches hierarchy lines **on** in all six Tree consumers. That is a design change with its
   own before/after screenshots, not part of a conversion.
2. **Non-first indents are 17px, not 16.** No `box-sizing` on the indent and no global border-box
   reset in the renderer, so the leading gutter for level *N* is `16 + 17 × (N − 1)`. Fixing it
   shifts every nested label one pixel per level.

#### Rule 4 measurement note for `Tree`

**Four of six `<Tree>` call sites pass `renderItem`** (`TreeProviderView`, `BoardsTree`,
`RestClientShared`, `ToolsTree`), so most Tree rows in the app remain one retained React root per
visible row, with a `mountVanilla` `TreeItem` inside it. Those four files are Epic D/E territory and
drain the same way `RenderGrid` does. **Do not take the `Tree` number through `TreeProviderView`** —
measure `GitRefsView` or `NotebookCategoriesSecondaryView`, the two consumers on the default row
path. Same caveat US-1014 recorded for `MultiListBox`.

### 2026-08-22 — US-1016 (`MultiListBox`) implemented

**The `renderItem` obligation from US-1014 is discharged.** `MultiListBox` no longer passes a row
renderer at all: `ListItem` gained a `checkbox?: boolean` prop, `ListBox` forwards it, and the rows
are ordinary `[data-type="list-item"][data-checkbox]` elements. No **component** in `uikit/` consumes
`renderItem` any more — the only remaining uses inside the folder are the `ListBox` and `Tree`
stories, which exist to demonstrate the public prop. Every production consumer is app-layer and
scheduled for Epics D/E, so the seam now drains the same way `RenderGrid` does.

Measured after the conversion: a `MultiSelect` dropdown with 40 items renders **11 checkbox rows and
zero React roots** (`[data-part="react-slot"]` count inside the list is 0). Before, every visible row
carried one retained root.

**Correction to a number used while planning.** Removing the custom renderer removes **one** React
root per visible row, not two. The `highlight()` nodes that draw the label rendered *inside* the same
root as the row, so they were never a second one.

**Extending `ListItemView` beat adding a second row implementation.** The alternatives were a
vanilla row-view hook on `ListBoxView` (a second row class to keep in sync with six state attributes,
three slots, three variants x three selection styles and a drop state — the exact drift
`ListItemView`'s doc comment exists to prevent) and driving `VirtualGridView` from
`MultiListBoxView` (the three arms, the engine create/dispose, the pool's kind branching,
`aria-activedescendant` and the two scroll entry points, re-implemented to change one glyph). The
row's own CSS made the choice cheap: `ItemRow` and `[data-type="list-item"]` already matched token
for token on the base, the disabled arm, the active background, icon sizing and the label.

**US-1014's rejection of `renderItemDom` does not transfer.** That was new public API with no
consumer; `checkbox` has a consumer on day one and *retires* a renderer contract instead of adding a
second one.

**The `browse` hover arm is gated with `:not([data-checkbox])`.** `variant="browse"` was the right
variant, but it also paints `:hover` and `MultiListBox`'s row had no hover rule at all. For the mouse
the two are indistinguishable — the list sets `activeIndex` on mouseenter, so a hovered row already
paints through `[data-active]`, and a disabled row's `pointer-events: none` matches neither. They
diverge in one state: keyboard navigation moving the active row away from the pointer, or rows
scrolling under a stationary pointer (no mouseenter fires), would light **two** rows where one lit
before. Faithfulness first; turning hover on for checkbox rows is a visible change and belongs in its
own task. Verified through the selector rather than a synthetic pointer (`:hover` cannot be
dispatched): the carve-out rule is present in the shipped stylesheets, a checkbox row does not match
the hover arm, a plain browse row does, and the checkbox row still matches the active arm.

**A caller-owned selection reaches the repaint gate only through `isSelected`'s identity.** This is
the epic's third instance of the masked-defect class, and the most easily missed. `MultiListBox`
never passes `value` to `ListBox`, so when the user checks a row **no slot of `repaintSignature()`
moves**: `items` comes from a memo that selection does not touch, `activeIndex` and `searchText` are
unchanged, `renderItem` is gone, `selectedKey` is null, and `isSelected` *was* a stable bound method.
The gate would report no change and the box would keep its old glyph until an unrelated input moved —
self-healing on the next mouse move, which is what makes it hard to catch. React hid it because the
inline `renderItem` arrow was a fresh closure on every render, forcing an unconditional repaint.

`MultiListBoxModel.isSelected` is therefore a `memo` keyed on
`[selectedKeys.value, resolvedItems.value]`. The cost is bounded: `props.isSelected` is read in
exactly two places — live inside `isSelectedAt`, which is not memoized on it, and the signature slot
— so a moved identity buys one repaint and nothing else. Rejected: a `revision`/`renderKey` prop
(whose failure mode is a forgotten bump with no compiler or runtime signal) and a public
`ListBoxView.repaint()` (which moves the repaint decision outside the one place that owns it and
becomes the escape hatch used instead of adding a missing slot). The rule is now written on the
`isSelected` prop itself, not only in the model, and `ListBoxState.revision` — dead since US-1014 —
carries a comment saying not to wire it.

`props.checkbox` is the tenth signature slot: it adds and removes a child of every row.

**Two state mechanisms now exist, and the choice between them is not stylistic.** `Tree` routes every
state write through `mutate()`/`onStateApplied`; `MultiListBox` uses one compound `bind()` on
`{ searchText, activeIndex }` feeding a single `syncChildren()`. The discriminator is what the state
*feeds*: Tree's is internal (expansion, lazy-load flags, drag state) with ~8 write sites across three
files and a consequence — root attributes included — that no child can express; `MultiListBox` has two
setters in one file and both fields are literally child props, which is the case Rule 9 sends to
`bind()`. `bind` additionally filters through `compareSelection`, so a no-op write costs nothing,
where `mutate()` runs the full consequence regardless.

Three rules came with that choice and are recorded in `uikit/CLAUDE.md`: both paths call the *same*
`syncChildren()` (the tri-state header derives from `searchText` **and** `props.value`, so narrowing
the filter must be able to flip it with no prop change — a bind that refreshed only the input and the
list would have reproduced the very defect this task removes); no per-field guards in the parent, because
a guard maintained on one of two paths either re-pushes forever or skips a needed push, and the
children's own gates absorb the duplicate; and `applyRestProps` stays off the state path.

Verified at runtime: selecting one row → header `mixed`; a **state-only** write filtering down to just
that row → `true`; clearing the filter → `mixed`; narrowing to 11 rows with none selected → `false`;
`toggleSelectAll` with a filter active adds exactly the 11 visible and removes exactly those 11 again,
leaving the off-filter selection untouched.

**The select-all row is inline DOM, not a view class.** Every `*View` in `uikit/` has a matching
public `.tsx` face — `VirtualGrid/VirtualGridView.ts` is the single documented exemption — and a
faceless view class for a single, never-recycled instance would have been the second exception without
earning it. It follows `ListBoxView`'s message host: view-owned element, `data-part`, attached and
detached on a prop. Its tri-state value is computed once into `"true" | "mixed" | "false"` (the React
version derived it three times, each walking the filtered list) and its glyph is swapped only when
that value changes.

**Two small things found on the way.** `InputView` did not import its own stylesheet — `Input.tsx`
did — so the first vanilla parent to compose the class directly would have got an unstyled input; the
import now lives with the DOM that needs it, matching `ListItemView`. And `ListItemView.setCheck`
gates on the applied value rather than rebuilding the `svg` like `CheckboxView.updateIcon` does,
because a pooled cell is re-pointed at a new row far more often than a row's checked state changes;
verified that an untouched row keeps the *same* `svg` element object across a full repaint.

**DOM contract:** `data-type="multi-list-item"` is retired (it had no references anywhere in the
repo). Rows are addressed as `[data-type="multilistbox"] [data-type="list-item"][data-checkbox]`;
`data-type="multilistbox-select-all"` is unchanged and gained `data-part="select-all"`.

**Both consumers verified end-to-end** through their real React parents, not just offscreen: the
`MultiSelect` dropdown (open → 11 checkbox rows, click → glyph flips, trigger reads "(1) selected",
header `mixed`, no trailing icon) and the AVGrid options filter (open on a `grid-json` page → four
distinct options with 16px boxes, select-all indeterminate, click → checked, zero React slots in
rows).

### 2026-08-22 — US-1018 (`MultiSelect` + `Autocomplete`) implemented; `Panel` is out of `uikit/`

**The last two effects in the epic are gone, so C3's ledger of ten is closed.** Both were the
`queueMicrotask`-wrapped close reset (C3-6 #9 and #10) and both went into a `closeInto` **draft
mutator**, the shape US-1017 established: a private method that mutates an immer draft and never
calls `state.update`, so every close path stays one write and `ListBoxView` keeps choosing its scroll
entry point correctly. `grep "this.effect(" MultiSelect/ Autocomplete/` returns nothing, and so does
`grep "queueMicrotask("` — the epic's four deletions are all four deleted.

**`MultiSelect`'s chevron toggle had to become an explicit branch.** `onChevronClick` was
`s.open = !s.open`, and "reset `popoverResized` on the close leg only" is not expressible in that.
`open` is now read *before* the write and the branch picks a mutator. This is the same class as
US-1017's `seedIndex` correction: a producer cannot consult the state it is producing. Verified at
runtime through all three close paths — Escape, chevron and outside click — each of which reopens
with the resize override cleared (listbox back to 240px / 11 rows from the resized 396px / 17).

**`Autocomplete` needed a third shape for `PopoverView`'s `contentView` seam, and `uikit/CLAUDE.md`
now carries it.** The seam returns exactly one `IOwnedView` and this dropdown has two children — an
optional header row and the `ListBox`. `AutocompleteContentView` therefore **adopts the popover host
as its root**, as `MenuContentView` does, so both children stay direct children of `.popover-shell`.
A wrapper element was rejected twice over: a real one becomes the popover's sole flex item and moves
the overflow and shrink semantics down a level, and a `display: contents` one preserves layout but
stops the two being direct children at all. The consequence worth writing down is that **the two
factory shapes now look different on purpose** — `SelectView`'s must `host.append(list.root)` because
a `ListBoxView` builds its own detached root, and `AutocompleteView`'s must not append anything at
all. The price of adoption is three writes the content view may never make on its root
(`dataset.type`, any `className` assignment, `replaceChildren`), because `PopoverFloatingView`
reasserts all three on every update and would win *silently* — an attribute reverting one update
later, not an exception. The class comment names them.

**`Panel` has no production consumer inside `uikit/`, and its last one measured five declarations.**
What `<Panel direction="row" align="center" paddingY="sm" paddingX="md">` actually emitted was
`.panel-root` + `data-type="panel"` + `data-direction="row"` + four inline paddings and one inline
`align-items` — and of that, `data-direction="row"` matches **no rule in `Panel.css`** and the class
contributes only `display: flex` and `box-sizing: border-box`. So the whole computed box is
`display:flex; box-sizing:border-box; align-items:center; padding:4px 8px`, relocated verbatim into
`Autocomplete.css` and **measured back out of `getComputedStyle` at runtime** rather than assumed.
The `<Spacer />` became a bare `<span data-type="spacer">` with `Spacer.css` imported as a borrowed
stylesheet: `SpacerView`'s entire job is translating `name`/`size` into attributes and this call site
passes neither, so a `child()` claim and a disposal slot would have bought nothing. Measured
`flex: 1 1 auto` on it and the action element flush against its right edge.

*Dropping `panel-root` is not a C3-5 violation, and the argument is empirical rather than asserted.*
`panel-root` is selected only by `Panel.css`, which documents it as a private marker because
`className` is not in `PanelProps`; `ui-element-contract.md` states that `className` is not an
addressing mechanism; `data-direction` is selected only by `Panel.css` and by `Toolbar.css` in its
own class scope; and the one cross-component selector that reaches a `[data-type="panel"]`
descendant (`CollapsiblePanelStack.css`) cannot reach a node portalled into the overlay layer.
Preserving the class would have resurrected a private hook whose only stylesheet is on the removal
ledger.

**A styling rule the epic did not have: an element inside a portalled branch needs a *root-level*
`data-type` hook.** `[data-type="autocomplete"] [data-part="header"]` matches nothing, because the
header row lives in `#persephone-overlay-layer` and is not a descendant of the component root. The
alternatives are worse — `[data-type="popover"] > [data-part="header"]` claims every other
component's popover header, and `data-name` is reserved for addressing. So the row carries
`data-type="autocomplete-header"`, following `[data-type="popover-resize-handle"]`, and
`uikit/CLAUDE.md`'s styling section now says so. This is the same trap as C3-9's mutation counters,
one layer up: a selector, not an observer, silently failing to reach the overlay layer.

**One intentional DOM delta, argued rather than smuggled: `MultiSelect`'s `aria-controls` used to
point at nothing.** The trigger has always advertised `aria-controls="multiselect-N-popover"` and no
element in the component ever carried that id — not the popover, not the `MultiListBox`. This is a
*different bug class* from US-1017's `aria-expanded` fidelity fix: that one was the vanilla layer
failing to reproduce React's output, so the migration rule required fixing it, whereas this one is a
defect in the React original, and a faithful port reproduces it. The decisive argument for fixing it
anyway is internal to the epic: **C3-5 obliges every task to assert the aria pairing still resolves**,
and for `MultiSelect` that assertion is unsatisfiable by a verbatim port. The delta is one attribute
(`id` on the `[data-type="multilistbox"]` root, present only while open), on a component whose only
consumer is a story, with nothing in the tree selecting on it. Verified: `aria-controls` now resolves
to the `multilistbox` element. Not fixed, and not a bug: both dropdowns' `aria-controls` dangle while
*closed*, because the target lives in the conditional branch. `Select` does the same. That is
standard combobox practice.

**`data-state` and "the popover exists" are different facts in `Autocomplete`, and stayed that way.**
The popover opens on a derived condition (`open && (matches || emptyMessage != null)`), which is now
a `popoverOpen` getter on the model. Verified: typing a non-matching query with no `emptyMessage`
leaves the root reading `data-state="open"` with **no floating branch at all**; supplying an
`emptyMessage` keeps the branch with zero rows. A conversion that collapsed the two would have looked
correct in every other test.

**`commitFromIndex`'s `queueMicrotask` deleted; focus is inline.** Its comment claimed it deferred
"past the popover close", and that is not a thing: closing is not a focus operation (the floating
branch's disposal never touches `document.activeElement`), and the trigger `Input` is a *sibling* of
the `Popover`, not inside the closing branch. Under React the update flushed inside the root listener
anyway, so React also ran `focus()` with the branch gone — the deferral changed *when*, never
*whether*. Measured: a row click leaves the popover already removed, `onChange` already fired and
focus already on the `<input>`, all before the handler's task ends.

*What was deliberately not fixed.* With `openOnFocus` set, a real mouse commit blurs the input (rows
are plain `div`s and nothing `preventDefault`s their `mousedown`), so the inline `focus()` fires a
real focus event and re-opens the dropdown. That is pre-existing — the microtask delayed it, it never
prevented it — `openOnFocus` has no production caller, and `Select`'s `_suppressFocusOpen` exists only
because *its* `onInputFocus` opens unconditionally. Adding the flag would be a behaviour change inside
a mechanical conversion, so it is a follow-up. It is also not reachable synthetically: a dispatched
`click` does not move focus the way a real mousedown does, which is why the probe could not exercise
it either way.

**`MultiSelect`'s `disabled`/`readOnly` asymmetry preserved and asserted, not reconciled.** Its
trigger `Input` is `readOnly` unconditionally and takes no `onChange` — there is no in-trigger search,
unlike `Select` — and `tryOpen` checks `disabled` only, so a read-only `MultiSelect` still opens with
an enabled chevron. Measured all three states rather than trusting the diff, because "make it look
like `Select`" is the tempting wrong move here.

**Verified at runtime, including the real consumer.** Both components driven through offscreen React
roots (the `mountReactHandle` seam, with React taken from Vite's pre-bundled dep so the probe shares
the app's instance): closed and open structure, `react-slot` counts of **0** on both closed controls
and 0 inside the `MultiSelect` dropdown, additive multi-selection, the resize/close-reset cycle
through three paths, `disabled`/`readOnly`, filtering, the derived-open divergence, the header row's
computed style and ordering, header toggled on and off *while open* (row removed and re-inserted above
a list element whose identity never changed), a keystroke rebuilding neither the header row nor the
list nor adding a React root, the full keyboard set with `aria-activedescendant` resolving at every
step, `onSubmit`, `onEscape`, mouse commit, `openOnFocus`, and disposal-while-open leaving
`#persephone-overlay-layer` empty for both. Then the production consumer: a `.rest.json` page's
`KeyValueEditor`, where `kv-row-key` suggests header names, `aria-controls` resolves, and a mouse
commit lands the value with focus retained. The probe page was closed and the user's four pages left
untouched.

**One correction to this document, found by measurement.** C3-9's table said `Panel` consumers inside
`uikit/` reach **0**. That is true of production and false of the folder: **30 `uikit/` stories import
`Panel` as their layout host**, so reaching zero production consumers does not make the component
deletable. The row now says so. Epic F's removal ledger owns the story sweep; C3 does not.

**Follow-ups recorded, not done here.** The `openOnFocus` re-open above; IME composition suppression
in `InputView` (still open from US-1017); gating `applyRestProps`' `setAttribute` on the current value,
which US-1017's Rule 4 measurement named as the cheapest remaining win on the keystroke path; the
borrowed-CSS import sweep; and `Panel`'s 30 story call sites.

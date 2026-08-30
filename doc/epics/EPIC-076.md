# EPIC-076 — Post-De-React Epic B: the props pump

**Status:** Completed 2026-08-30
**Created:** 2026-08-29
**Plan:** the De-React refactoring plan (`doc/de-react-refactoring.md`, deleted at programme close) → **R2**, the pump-entangled half of **R6**, **R10.4–R10.6**
**Predecessor:** [EPIC-075](EPIC-075.md) — Epic A, core contracts (completed 2026-08-29)

Epic A fixed the base classes. This epic fixes the thing the base classes were defending against.

`VanillaView.update(props)` has no equality gate, and the renderer treats it as a render call:
**405** `.update({…})` sites re-push freshly allocated props objects down the view tree on every
dispatch, exactly like a JSX render body. Everything downstream exists to *undo* that — the deps
gates, the 20 `memo()` chains, the 72 `last*`/`applied*` guard fields, `applyRestProps`
re-installing every listener on every pump, and DataGrid's trampoline table, which documents the
pump as a known hazard in its own file header.

The vanilla-native alternative is already in the codebase and already works: `PageContentView`
receives `{ pageId }` and subscribes to `pagesModel` itself; the mcp-inspector panels have empty
`onUpdate(_props) {}` hooks and are entirely subscription-driven. The pump above them carries
nothing. This epic makes that the rule rather than the exception.

---

## B-1 — The closing property

**`update(props)` carries construction-time configuration. A child that renders live data
subscribes to the exact slice it renders.**

Four statements, each paired with a **presence** check — the C9a discipline inherited from
EPIC-072 and re-proved by EPIC-075, where five of the epic's own stated facts turned out to be
inferred from code shape rather than observed. Every statement below is phrased as a removal and
every one of them is satisfiable by deleting a feature instead of converting it, so the presence
column is not decoration.

| # | Removal — "it no longer does X" | Presence — "it still does Y" |
|---|---|---|
| 1 | No view binds a whole-state selector to **global** state. `pagesModel.state` has zero `(s) => s` bindings; `PagesView`, `PageContentView`, `PageTabsView`, and `MainPageView` each subscribe to named slices. | Opening, closing, reordering, grouping, compare-mode, and pinning tabs all still work, including the left/right split and the grouped-page pairing. Editing a document still does **not** reconcile the tab strip. |
| 2 | Zero `onClick:` / `onChange:` arrow closures allocated inside a props builder or an `onUpdate` body in the converted areas. Callback props are bound methods created once. | Every converted control still fires: sidebar tab activation, list-item selection, toolbar buttons, and the rest-client key/value editor. Handler *behaviour* still tracks current state (the DataGrid trampoline rationale applies to every hoisted handler). |
| 3 | `this.memo` returns **zero** hits in `src/renderer`; `memo` and `IMemo` are gone from `TComponentModel`. `ElementRef`, `bindRef`, and the `syncCallerRef`/`appliedCallerRef` machinery are gone; no component takes a `ref?:` prop. | The eight uikit models that memoized still produce identical results: `MultiListBox` filtering and its selection predicate, `Select` and `Tree` projections, `Menu`, `Popover`, `Autocomplete`, `ListBox`. Autocomplete, MultiSelect, PathInput, and Select still expose their input element to their hosts. |
| 4 | `applyRestProps` runs **once per element, at construction** — not from any update path. | Every uikit component still applies its residual attributes, `aria-*`, and native listeners; the enumerated-attribute handling (`spellCheck`, `contentEditable`) still writes the correct value. |

**What must not be claimed.** This epic does **not** shrink `dom-props.ts`'s type surface — the 21
`Omit<NativeHTMLAttributes<…>, "style" | "className">` incantations and the re-declared camelCase
handler types survive it. See B-3. It also does not touch R4's full-rebuild sites, R5's immer
collections, or R8's timer audit; a converted view that still rebuilds its DOM wholesale is out of
scope here and stays for Epic C.

---

## B-2 — Measured baseline (2026-08-29, branch `upcoming-v4.0.23`)

Re-measured against the tree. The plan's figures date from its own 2026-08-29 sweep and several
have already moved; the instrument is given for each so the number can be re-run rather than
trusted.

| Figure | Instrument | Plan said | Measured now |
|---|---|---|---|
| `.update({` — renderer-wide | `grep -rn "\.update({"` | — | **405** |
| …in `editors/` | same, scoped | 311 | **320** |
| …literally `.update({ model` | `grep -rn "\.update({ model"` | 54 | **59** |
| …by area | same | — | editors **320**, ui **40**, uikit **34**, components **11** |
| Inline `onClick` closures | `grep -rnE "onClick: \(\) =>"` | 218 | **366** — see correction 3 |
| `private xxxProps()` builders | `grep -rnE "private [a-zA-Z]*Props\(\)"` | ~40 uikit + 22 ui/components | **135** renderer-wide, **18** in uikit — see correction 3 |
| Whole-state `(s) => s` bindings | `grep -rnE "\((s\|state)\) => \1[,)]"` | 3 named sites | **22** — but only **2** are the target; see correction 2 |
| `this.memo` call sites | `grep -rn "this\.memo"` | 20 | **20**, in 8 uikit models: `MultiListBox` 6, `Select` 3, `Tree` 3, `Autocomplete` 2, `ListBox` 2, `Menu` 2, `MultiSelect` 1, `Popover` 1 |
| `applyRestProps` | call sites / files | 39 files | **40** call sites in **40** files, **all** reachable from `onUpdate` — verified, not inferred |
| `ElementRef` / `bindRef` | files / props / calls | 22 `ref?:` props | **27** files reference `ElementRef`, **34** `ref?:` props, **17** `bindRef(` calls, **4** views carry `*CallerRef` machinery |
| `onModel` channel | `grep -rn "onModel"` | a handful of files | **112** mentions — editors 56, uikit 26, components 16, ui 9 |
| `last*` / `applied*` guard fields | `grep -rnE "private (last\|applied)[A-Z]"` | 28 | **72** — see correction 3 |
| `createDepsGate` consumers | files | — | **14** |
| `dom-props.ts` | `wc -l` | 241 | **241** |

### Corrections to the plan

1. **`ui/app/MainPageView.ts:85` no longer matches the plan's description.** It now reads
   `this.bind(app.window.state, (state): MainPageState => state, …)` — still a whole-state
   selector, but on `app.window.state`, not on `pagesModel`. Line 87 (`mnemeStatusModel`) is the
   other one. `PageTabsView.ts` lives at `ui/tabs/`, not `ui/app/`.

2. **"Replace the `(s) => s` bindings" over-generalises, and following it literally would be
   churn.** Of the 22 whole-state bindings, most bind a **model's own small state** —
   `GraphBodyView`, `McpInspectorView`, `ResponseViewerView`, the storybook panels, the settings
   sections. That is the correct pattern for a view that renders most of a small state object, and
   narrowing it buys nothing. The defect is a whole-state selector on **hot, global, frequently
   dispatched** state: `ui/app/PagesView.ts:18` on `pagesModel.state` is the one canonical
   instance, with `MainPageView.ts:87` second. Statement 1 is scoped to global state for this
   reason.

   **Superseded in part by US-1199 — see the Notes.** Even `PagesView.ts:18` turned out not to be a
   defect: `compareSelection` compares arrays/Maps/Sets by identity, and `OpenFilesState` is exactly
   the five collections `managerProps()` reads, so the whole-state selector was already equivalent
   to the narrowed one. The real defect class is a **bare** `subscribe(() => …)` with no selector at
   all, which gates nothing. Read the US-1199 note before treating any wide selector as a target.

3. **Three counts are much larger than the plan's, and the difference is instrument, not drift.**
   366 vs 218 `onClick` closures, 135 vs ~62 props builders, 72 vs 28 guard fields. The plan did
   not record how it counted, so these are not comparable, and the plan's numbers should be treated
   as **withdrawn** rather than as a baseline that moved. Use the instruments in the table above.
   Note also that a large fraction of the 366 closures are in **construction-time** menu and
   toolbar descriptors, where an inline arrow is correct and costs nothing — the count is a
   population, not a defect list, and each task must state its own denominator.

4. **`applyRestProps`'s hazard is real and confirmed.** Every one of the 40 call sites is inside a
   `sync`/apply method reachable from both `onMount` and `onUpdate`, and the function removes and
   re-adds each listener on every call. This is the one plan claim in this epic that was checked
   against execution paths rather than shape.

5. **Drive-by for R9:** `dataset.part = "react-slot"` is in **two** files, not one —
   `uikit/Dialog/DialogView.ts:73` and `uikit/Tag/TagView.ts:124`. It stays R9's problem, but the
   count was wrong.

---

## B-3 — What this epic deliberately leaves behind

**The type half of R6.** `dom-props.ts` survives at 241 lines. Narrowing each component's contract
from an HTML-attribute grab-bag to explicit typed props is a per-component design decision across
40 components, and it is *orthogonal* to the pump: a component with a narrow props type that still
re-applies its props on every update has the same listener-identity problem, and a component that
applies rest props once at construction is already fixed regardless of how its props are typed.
Splitting on that seam lets this epic be judged by a behavioural property (statement 4) rather than
by a type-shape opinion. The narrowing becomes a follow-on — most naturally alongside R7's uikit
file merges in Epic C, where the same 40 components are already open.

**The full-rebuild tail (R4).** Several views this epic touches — `BreadcrumbView`,
`CategoryViewImpl`, `SecondaryViewsView`, `OpenTabsListView`'s list — also rebuild their DOM
wholesale. Converting the pump above them does not fix that, and fixing both at once makes each
regression un-attributable. If a rebuild site becomes *trivially* fixable as a side effect of a
conversion, take it and say so in the task doc; otherwise leave it for Epic C.

---

## B-4 — Task breakdown

Ordered so each task's output is the next task's input. US-1199 is the pilot and US-1200 writes the
convention **from** it — deliberately in that order, because a convention written before the first
conversion is a guess. US-1204 and US-1205 are independent of the R2 tasks and can run in parallel
with them; US-1206 is the one hard barrier and must land last in its lane.

| Task | Title | Plan item | Size |
|------|-------|-----------|------|
| US-1199 | Pilot: narrow the app-shell hot path off whole-state bindings | R2.3 | M |
| US-1200 | Write the convention — `update()` is configuration, callbacks are fields | R2.1/2.2, R10.5/10.6 | S |
| US-1201 | Sidebar: `OpenTabsListView` and the re-entrant list views | R2 | M |
| US-1202 | Editor roots: stop fanning `{ model }` to every descendant | R2 | L |
| US-1203 | The uikit drill: collapse the seven-layer props relay | R2 | L |
| US-1204 | Retire the ref channels — `ElementRef`, `bindRef`, `onModel` | R6 | M |
| US-1205 | Derive-on-write: retire the 20 `memo()` sites, then delete `memo`/`IMemo` | R6, R10.4 | M |
| US-1206 | `applyRestProps` at construction only | R6 | M |

### US-1199 — Pilot: the app-shell hot path

`ui/app/PagesView.ts:18` is the single worst binding in the renderer: a whole-state selector on
`pagesModel` — the app's hottest state — whose callback rebuilds `managerProps()` and reconciles
every page slot on **every** dispatch, including dispatches that touch nothing it renders. Convert
it, plus `MainPageView.ts:87`, `PageContentView.ts:35`, and `ui/tabs/PageTabsView.ts` (whose
subscription map re-runs the entire tab-strip reconcile on every keystroke that touches editor
state, and which mutates that map while listeners may be dispatching — see R8's re-entrancy note).

`PageContentView` is the reference: it already takes `{ pageId }` and subscribes itself. The target
shape for `PagesView` is the same — the manager receives the page-id list and grouping as
configuration, and each slot subscribes to its own page.

**Verify by use:** open, close, reorder, group, ungroup, pin, and compare tabs; then type into a
document and confirm the tab strip does not reconcile. This is a *presence* check with a real
failure mode — narrowing a selector one field too far silently stops updating something.

### US-1200 — Write the convention

Doc-only, written from what US-1199 actually did. Into `model-view-pattern.md` and
`uikit/CLAUDE.md`:

1. **Construction-time config vs. live data** (R2.1). Props configure; live data arrives via a
   shared model the child `bind()`s to, or via a targeted setter. `update(props)` becomes rare.
2. **Stable callbacks are fields** (R2.2). Bound methods created once. `TreeProviderViewImpl.ts:327-399`
   is the existing reference; DataGrid's header comment is the rationale, stated better there than
   a doc would state it fresh.
3. **`KeyedList` and `SubtreeSwap` are the only sanctioned patterns for dynamic children**
   (R10.5), with `notebook/NotebookBodyView.ts:262-284`'s idempotency guard as the worked example —
   so R4's offender class cannot regrow behind this epic.
4. **The `update()` contract** (R10.6) stated in prose. Narrowing it in the *type system* is
   explicitly deferred: it cannot be done while 400 call sites still pass data, so it is a
   post-epic item, not a task here.

The plan's R2.4 — a shallow-equality gate inside `VanillaView.update()` — is **rejected**, and the
doc should say why. The plan itself calls it "a crutch, not the fix"; adding it would mask exactly
the call sites the later tasks need to find, and would make statement 1's presence checks pass for
the wrong reason.

### US-1201 — Sidebar

`ui/sidebar/OpenTabsListView.ts` duplicates a 14-field ListBox props literal at `:31-45` and
`:110-124`, each with fresh `isSelected` / `getTooltip` / `onChange` closures. A fresh predicate
identity defeats the child's `DepsGate`, so the list repaints in full on any dispatch — a gate that
reads as working while gating nothing. It is also re-entrant: `onActiveChange` at `:116-119` calls
`updateList()` from inside its own change callback. `ToolsEditorsPanelView.ts:79-81` has the same
re-entrancy.

Hoist the callbacks to fields, build the props literal once, and push only what changed. The
re-entrancy is a behavioural fix, not a refactor — it must be verified by use.

### US-1202 — Editor roots

Nine editor roots fan an unchanged `{ model }` to every descendant on every dispatch:
`link-editor/index.ts:414-421`, `notebook/index.ts:264-275`, `grid/index.ts:249-260`,
`markdown/index.ts:187-189`, `log-view/index.ts:171-172`, `html/index.ts:196-197`,
`env-vars/index.ts:47`, `image/ImageView.ts:60`, `base/PageToolbarView.ts:431-433`. Plus
`rest-client/RequestBuilderView.ts:258,307,315` — a 7-key props object with 3 fresh closures per
pump into `KeyValueEditorView`.

The conversion is uniform: a descendant that needs the model gets it **once, at construction**, and
binds to the slice it renders. The 59 `.update({ model })` sites are the mechanical core; the
remainder of the 320 need per-site judgement.

**This is the largest task in the epic and the most likely to need splitting.** Take editors one at
a time, in the order above, and land each independently — a half-converted editor is a working
editor, and there is no shared barrier.

### US-1203 — The uikit drill

`MultiSelectView → PopoverView → PopoverFloatingView → MultiListBoxView → ListBoxView →
VirtualGridView → ListItemView` mints a fresh props object at each of seven hops.
`AutocompleteView.ts:103` is the pure form: `this.list.update(props.list)` — a props object whose
only content is another view's props object.

Collapse the relay: the hops that only forward should hold a child reference and configure it once.
This is where the `DepsGate` population (14 consumers) should shrink; a gate that exists only to
absorb a forwarded identity has nothing to do once the identity stops moving. **Do not delete
`createDepsGate` itself** — some gates guard genuine model-side recomputation and survive.

### US-1204 — Retire the ref channels

`ElementRef<T>` ports React 19 callback refs including the return-a-cleanup signature: 34 `ref?:`
props, 17 `bindRef` calls, 27 files, and four views maintaining `syncCallerRef`/`appliedCallerRef`
machinery (`AutocompleteView.ts:169,355`, `MultiSelectView.ts:66,288`, `PathInputView.ts:158,214`,
`SelectView.ts:72,312`). In vanilla the parent constructed the child and already holds `child.root`.
The whole channel is redundant.

Same for the app-layer `onModel` family (112 mentions) and `headerRef`
(`SecondaryViewsView.ts:47,180,199,219`), which forces a `const holder = {}` constructor trick in
two views purely to satisfy `super()` ordering — the tell that the channel is fighting the language.

**Ordering hazard, and the reason this task is not "mechanical":** EPIC-075 left
`TreeProviderViewModel.dispose()` with an explicit comment that `props.onModel?.(null)` must be the
**last** statement, because child views must dispose before the host is notified. Removing the
`onModel` channel removes that constraint's expression but not the constraint. Whatever replaces it
must preserve the ordering, and the tree-provider presence checks are what catches it.

### US-1205 — Derive-on-write

All 20 `memo()` sites are uikit models. `MultiListBoxModel.ts:63-132` chains **six**, the last
memoizing a *predicate function* so that a downstream deps gate sees a moved identity — pure hooks
thinking, and a direct cause of a gate defeat.

Convert to R10.4's house style: a setter that changes an input recomputes the derived fields
synchronously before dispatch, so views read plain fields. Where laziness genuinely matters, a small
explicitly-invalidated `cached(fn)` beats a deps array, because the invalidation is then visible in
the code path that causes it. There is **no `cached` helper today** — add one only if a real site
needs it; EPIC-075's US-1198 established the rule that a helper without a caller does not get added.

Then delete `memo` and `IMemo` from `TComponentModel`, which is what EPIC-075's A-3 deferred to this
epic. `depsChanged` stays — `deps-gate.ts` imports it deliberately so a vanilla gate stays
behaviour-identical to the old `effect()` by construction.

**Sequencing:** this task must follow US-1203 for `MultiListBox`, `Select`, `Tree`, `ListBox`, and
`Autocomplete`. Converting a memo before the pump above it stops moving means writing the
invalidation twice — the same argument EPIC-075 used to defer `memo` in the first place.

### US-1206 — `applyRestProps` at construction only

The barrier task. 40 call sites, all currently reachable from `onUpdate`, each removing and
re-adding every listener on every pump. Move the application to construction.

Three things make this non-mechanical:

- **Genuinely dynamic rest props.** Some components legitimately change an `aria-*` or `disabled`
  attribute after construction. Those need a targeted setter, not a re-spread. Find them before
  converting, not during.
- **`clearRestListeners` on dispose** must keep working, and its bookkeeping (`RestPropsState`) is
  what makes removal correct. Do not simplify the state object away.
- **The enumerated-attribute path** (`spellCheck`, `contentEditable`, `aria-*`) has a documented
  case-sensitivity trap in `dom-props.ts:150-156`: matching case-sensitively sends `spellCheck`
  down the boolean-attribute path and writes `""`, which for an enumerated attribute means `auto` —
  silently the opposite of what was asked. Any restructuring must preserve it.

This lands last because US-1203's collapse changes which components still receive updates at all.

---

## B-5 — Risks

- **US-1202 and US-1203 are each plausibly their own epic.** Together they are ~350 of the 405
  update sites. If they run long, splitting the epic at that seam is the right call and not a
  failure — B-1's statements are written so that statements 3 and 4 close without them.
- **This epic changes behaviour, unlike Epic A.** Every task in EPIC-075 was contract work behind
  unchanged call sites; every task here alters when a view repaints. The failure mode is *silence*:
  a selector narrowed one field too far stops updating something, with no error and no crash. The
  presence column is the only detector, and it must be walked by hand.
- **Two known re-entrancy defects are in scope** (`OpenTabsListView.ts:116-119`,
  `ToolsEditorsPanelView.ts:79-81`) plus `PageTabsView`'s subscription-map mutation during
  dispatch. These are real bugs, not shape complaints, and they should be verified as *fixed*
  rather than merely as *unchanged*.
- **Do not trust this document's own counts as a completion metric.** EPIC-075's retrospective is
  unambiguous on this: five of its stated facts were wrong, all five inferred from code shape
  rather than observed, and one prescribed fix would have introduced a real off-by-one. The three
  withdrawn counts in B-2 correction 3 are the same failure caught earlier. Re-measure at each
  task, record the instrument, and prefer a behavioural property over a grep count wherever both
  are available.
- **Scope creep toward R4 is the likely drift.** Half the views this epic opens also rebuild their
  DOM wholesale, and fixing that while already in the file will feel free. It is not — it makes
  regressions un-attributable. B-3 draws the line; hold it.

---

## B-6 — Acceptance

The epic closes when B-1's four statements hold, each with its presence column walked by hand and
the result recorded here — including anything that could not be verified, with repro steps, as
EPIC-075 did for its eight accepted-unverified items.

Deferred out of this epic by design, for whoever cuts Epic C: `dom-props.ts` type narrowing (B-3),
R4's full-rebuild sites, R5's immer collections, R7's model/view collapses, and R8's timer audit.

## B-7 — Verification walk (2026-08-30)

Driven against the running app after all nine tasks landed. Non-destructive only: five pages were
open including one with unsaved changes, so nothing was closed, edited, or saved.

**Verified working by use:**

| Surface | Exercises | Result |
|---|---|---|
| Tab activation (`showPage`) | `PagesModel.ordered` → `PagesView`'s narrowed selector (US-1199) → `managerProps` → `AppPageManagerView.reconcile` → `PageContentView` → `RenderEditorView` → `AsyncEditorView` | Active page switches; all five tabs render in the strip |
| Markdown editor render | `TextChromeView` / `PageToolbarView` (US-1203B — the widest blast radius in the epic) | Full document renders: headings, lists, links, code blocks, Copy button |
| Editor chrome segmented control | `SegmentedControlView` → `ButtonView` with the US-1206 targeted setters for `role` / `aria-checked` / `tabIndex` | "Text Editor / Git Diff / Preview" radiogroup renders with correct roles |
| Explorer tree | `TreeView` + `VirtualGridView` (US-1203A) and `TreeModel` derive-on-write (US-1205) | Full repo tree renders, expand/collapse state intact, virtualized rows correct |
| Sidebar panel stack | `CollapsiblePanelStackView` + the **retained** `headerRef` (US-1204) | Explorer, Boards and Git panels all render with their headers |
| Git panel | Editor-root conversions (US-1202) | Renders with its change count |

The markdown content appears twice in the accessibility tree. That is the **Minimap's DOM mirror**
(`MinimapModel` mirrors the source pane via `innerHTML`), which is pre-existing R4 behaviour and not
a duplication introduced here — worth recording because it reads like a double-mount defect at first
glance.

**Still unverified, and not claimed:**

- Dropdown *interaction* — `Select`, `MultiSelect`, `Autocomplete`, `Popover` open/filter/select.
  Their construction paths render (the sidebar and toolbars use them), but no dropdown was opened.
- Tab **mutation** — close, reorder, group, ungroup, pin, compare. Only activation was exercised,
  because the open set included unsaved work.
- "Type into a document and confirm the tab strip does not reconcile" — the central performance
  claim of US-1199. Not measured.
- Encryption lock/unlock changing tab width and pinned offsets — the highest-risk silent-failure
  path in the epic (US-1199's `state.encrypted` projection).
- The `DotView` construction-only assumption, which is correct today by inspection only.
- The seven US-1202 model-identity throws — no path was found that reaches them, and none was
  constructed.

**One false alarm, recorded so it does not outlive the session.** `showPage` appeared to fail
during this walk. It did not: the API takes a page **id string**, not a page object, and I passed
the object. Independent confirmation via `get_active_page` initially reinforced the wrong
conclusion, because both calls were wrong in the same way. Nothing in the epic is implicated.

## Notes

*(implementation notes appended per task, dated)*

### Addendum to B-2 — the defect population the baseline missed (measured 2026-08-29)

US-1199 established that the epic was counting the wrong thing. The `.update({` census (405 sites)
is a *population*, not a defect list, and the wide-selector census is mostly false positives. The
census that actually predicts a defect is **bare, selector-less subscriptions**, which gate nothing:

| Instrument | Result |
|---|---|
| `grep -rnE "\.subscribe\(\(\) =>"` renderer-wide | **56** |
| …by area | editors **44**, api **8**, ui **4**, uikit **0**, components **0** |

Two consequences for the remaining tasks. First, `ui/sidebar/` has **zero** — so US-1201's defect is
purely callback-identity churn, and its bare-subscribe census is expected to come back empty; that
is a finding, not a miss. Second, **44 of the 56 are in `editors/`**, which makes that the area
where this class actually lives, and reframes the work from "stop fanning `{ model }`" to "stop
subscribing without a selector".

**Correction — this instrument is itself faulty, and the fault is mine.** US-1207's triage of all
44 editor rows found the regex wrong in two independent ways:

1. It tests the shape of the *callback*, not the *absence of a selector*. `subscribe(() => ..., (s) =>
   s.foo)` passes a selector on the same line and matches anyway. Four rows are this
   (`file-diff/FileDiffBodyModel.ts:75,76`, `browser/BrowserSecondaryViews.ts:51`,
   `board/BoardSecondaryView.ts:71`) - all already gated.
2. It cannot distinguish `TOneState.subscribe` from `ComponentQueue.subscribe`. Roughly eight rows
   are deliberate focus-queue drains with intentional no-op handlers (`html/HtmlBodyView.ts:43,58`,
   `graph/GraphBodyView.ts:635`, `svg/SvgBodyView.ts:67,81`, `notebook/NotebookBodyView.ts:198`,
   `mermaid/MermaidBodyView.ts:136`, `rest-client/RestClientBodyView.ts:104`) - not state
   subscriptions at all.

So the 44 resolves to **17 convert, 27 leave**, and roughly a quarter of the census was false
positives. This was published one section above as "the census that actually predicts a defect",
which was overclaiming a grep the same way the original baseline overclaimed its own - while in the
act of correcting it. The rule this epic keeps relearning: a count is a population, and only a
per-site verdict with a stated reason is a defect list.

Of the genuine leaves, three kinds recur and are all correct: base-model **persistence forwarding**
(`descriptorChanged` must observe every state mutation, by design), **small view-owned state** where
the view renders nearly all of it, and the queue drains above (`ui/app/PageContentView.ts:62,103`
are the same deliberate-leave shape in `ui/`).

### US-1206 — `applyRestProps` at construction only (2026-08-30)

Implemented across `dom-props.ts` and 38 uikit view files. Targeted setters added in `InputView`,
`ButtonView` and `TagView` — the only three components whose consumers were shown to re-push a
residual attribute or listener after mount. typecheck, lint and `build-prod` pass; seven `throw`
sites, unchanged.

**The census was 39 invocations in 38 files, not the 40/40 recorded in B-2.** A fourth inherited
count wrong in this epic.

**One site was missed, and the "no longer reachable from any update path" claim was asserted before
it was true.** `editors/shared/ColorizedCodeView.ts` — the single non-uikit file in the census —
still ran `applyResidualProps()` from `onUpdate`, so every parent pump was still tearing down and
reinstalling its residual listeners. Found by resolving, for each of the 39 files, the method
enclosing `applyRestProps` and testing whether `onUpdate`'s body calls it. Now converted
(construction-only; its consumers update only `code`, `language` and `tabSize`), and the scan
returns zero. **B-1 statement 4 holds.**

Worth recording alongside it: while chasing that, I misread a grep that omitted an intervening
`applyConstructionRestProps()` method and briefly reported `CheckboxView` as broken. It was not.
The mechanical scan settled both questions — the real one and my false one — which is the same
lesson this epic has produced at every step: a partial view of a file is not a reading of it.

**`DotView` carries a new comment rather than a silent assumption.** Its verdict is construction-only
because current callers recreate the dot instead of updating its callback — true today, and if a
live dot ever re-pushes `onClick` the construction-only bridge keeps the stale one with no error.
The assumption is now written at the call site, where the next reader will hit it, rather than in a
task document nobody rereads. Same shape as the `state.encrypted` invariant from US-1199.

### US-1205 — derive-on-write (2026-08-29)

Implemented across the eight uikit models and their consumers. **`this.memo` returns zero**, and
`memo` / `IMemo` are deleted from `TComponentModel` — closing the one item EPIC-075 explicitly
deferred into this epic (see EPIC-075 A-3). `depsChanged` and every `DepsGate` are intact, as
required. typecheck, lint and `build-prod` pass; still exactly seven `throw` sites.

**The plan's cost table prevented a real regression, and it was the only instrument that could
have.** `TreeModel`'s `rows` + `indexByValue` derivation is O(all source nodes) + O(visible rows).
Converting a lazy memo to eager derive-on-write by the obvious rule — "recompute in every setter" —
would have made **every drag mouse-move pay a full tree walk**. That regression typechecks, lints,
builds, and passes the epic's own completion grep for statement 3. It was caught by reading the
loops rather than by reasoning about the pattern. Drag-only writes now bypass the derivation;
expansion, revision and row-input writes derive eagerly.

**No `cached(fn)` helper was added.** Eager covers all 20 sites and no genuine laziness requirement
survived inspection, so EPIC-075's US-1198 rule applied: a helper without a real caller does not get
added. That rule has now prevented four speculative additions across the two epics
(`Throttler`, `RunOnceScheduler`, and `cached` twice over).

`MultiListBoxModel`'s six-stage chain — whose final stage memoized a *predicate function* purely so
a downstream deps gate would see a moved identity — is unwound, and that predicate is now a stable
bound method. That single site is the clearest example in the codebase of a memo existing to defend
against the props pump rather than to cache a computation.

### US-1204 — ref channels (2026-08-29)

Implemented as a **deliberately partial** retirement. `ElementRef` and `bindRef` are gone from the
renderer (zero references), all four `*CallerRef` machineries are gone, and **19 uikit `ref?:`
contracts** were removed — every remaining `ref?:` match is a `href?:`/`selectedHref?:` false
positive or `automation/input.ts`'s unrelated element ref. 12 of the 16 `onModel` sites removed,
1 replaced by a `VirtualFlexGridView` getter, **3 kept**. typecheck, lint and `build-prod` pass;
still exactly seven `throw` sites.

**B-4's central claim for this task was wrong.** It said "the parent constructed the child and
already holds `child.root` — the whole channel is redundant." `onModel` publishes a *model*, not a
root, and `GridBodyView`'s three sites are genuinely deferred: `AVGrid.create()` runs in
`DataGridView.onMount()` (`uikit/DataGrid/DataGridView.ts:112-143`), **after** `GridBodyView` is
constructed, so at construction there is no model to hold. Those three stay, with the reason
recorded at the site.

**The `headerRef` claim was also wrong.** B-4 said it "forces a `const holder = {}` constructor trick
in two views purely to satisfy `super()` ordering". `CollapsiblePanelStackView` creates each header
inside `createPanel()` and reports it only after inserting owned nodes
(`uikit/CollapsiblePanelStack/CollapsiblePanelStackView.ts:105-183`), so `SecondaryViewsView`
genuinely cannot obtain it earlier. Retained, and no holder was removed because none was there.

**My `onModel` count was wrong too** — 16 executable sites, not 17. The extra match was the
EPIC-075 comment documenting the disposal-ordering hazard. That comment was rewritten rather than
deleted: removing the callback removes the constraint's *expression*, not the constraint. Child
views must still dispose before the host clears its model reference, which `VanillaView`'s
child-first disposal provides. No `throw` was added to assert it.

### US-1203 — the uikit drill (2026-08-29)

Split on investigation, as B-5 anticipated: **US-1203A** (uikit engine and list leaves) and
**US-1203B** (compound dropdowns plus the editor edges US-1202 deferred — `PopoverView`'s shell
split, `TextChromeView`, `PageToolbarView`, `RequestBuilderView`). 1203A implemented; 1203B queued.

**Three corrections to B-4's US-1203 description, two of which would have caused regressions.**

1. **The "seven-layer drill" is not seven relays.** `PopoverFloatingView` claims and mounts the
   caller-owned content view once per open branch and its `onUpdate()` stops at shell work
   (`uikit/Popover/PopoverView.ts:65-113`). The epic's third hop does not exist as a forwarding
   edge. `PopoverView → PopoverFloatingView` is also not a pure relay — it adds floating DOM,
   positioning, outside-click/Escape listeners, a resize handle and model middleware.
2. **`ListItemView`'s update is a row re-point, not a configuration relay.** It is a virtualized
   cell being re-aimed as the pool reuses it, carrying that row's label, selection, active state,
   slots, tooltip and drag data (`ListBoxView.ts:292-352`, `ListItemView.ts:102-179`). "Collapsing"
   it would have turned a pooled row into a permanently configured one and broken the cell pool.
3. **No `DepsGate` is removed — the epic's prediction that this population would shrink is wrong.**
   `ListBoxView.repaintGate` and `TreeView.repaintGate` both guard genuine model-side recomputation
   for direct consumers; removing either turns every targeted push into an unconditional full
   repaint. Collapsing the upstream relays reduces how often these gates are *reached*, which is the
   real benefit, but the gates themselves stay. B-4's "this is where the `DepsGate` population
   should shrink" is withdrawn.

So the drill's collapsible surface is a handful of forwarding/configuration edges, not seven. The
epic named a shape and assumed it was uniform; three of its hops turned out to be doing real work.

**US-1203A implemented (2026-08-29).** Five uikit source files: `VirtualGrid/VirtualGridView.ts`,
`VirtualGrid/index.ts`, `ListBox/ListBoxView.ts`, `ListBox/ListBoxModel.ts`,
`MultiListBox/MultiListBoxView.ts` — the first uikit source change in the epic. Retained grid and
ListBox configuration with targeted live-data and layout updates. Verified afterwards:
`ListItemView.ts` untouched, both `repaintGate`s still present, zero new `throw` sites. typecheck,
lint and `build-prod` pass, and the sidebar tree still renders all 24 items with virtualization and
expand state intact — the strongest available evidence that the shared list engine survived, though
it is one surface, not a sweep.

**US-1203B implemented (2026-08-29).** Popover shell/content split, `ListBox`, `Select`,
`MultiSelect`, `Autocomplete`, `TextChromeView`, `PageToolbarView`, `EditorToolbarView`,
`KeyValueEditorView`, `RequestBuilderView`, `MonacoEditorHostView`. typecheck, lint and
`build-prod` pass; still exactly seven `throw` sites renderer-wide, so no new ones. Epic total to
date: 49 changed source files, +798/-243.

**The finding that made this task safe was an asymmetry the epic's "collapse the relay" framing
would have erased.** The Popover content-factory contract is *not* uniform: `SelectView` and
`MultiSelectView` build a detached child and `host.append(...)` it, while `AutocompleteView` passes
the host into `AutocompleteContentView`, which **adopts it as its own root** and must not append.
Both sites already carry in-code warnings — `SelectView.ts:256-264` says "Omit this append and the
dropdown renders empty." Unifying them, which is what collapsing a relay uniformly means, breaks one
or the other. Left asymmetric, deliberately.

`RawBodyView` → `MonacoEditorHostView` was also confirmed **not** a model fan-out; its
language/options path and its `setValue()` body-value path stay separate.

**Verification gap, stated plainly.** This task changed the dropdown surfaces (Select, MultiSelect,
Autocomplete, Popover) and the toolbar chrome shared by *every* text-hosted editor, and none of
those surfaces was exercised. The renderer answers and the build is green; that is all that is
known. The dropdown paths and the text-editor chrome are the highest-value items on the
epic-close checklist.

### US-1207 — editor bare subscriptions (2026-08-29)

Implemented. 20 source files; every `leave` row untouched (spot-checked `base/EditorModel.ts`,
`base/TextHostEditorModel.ts`, `html/HtmlBodyView.ts`, `svg/SvgBodyView.ts`,
`graph/GraphBodyView.ts`, `notebook/NoteItemView.ts` — all unchanged). No fresh-array selectors
introduced, and no new `throw` guards: the seven from US-1202 are still the only ones. typecheck,
lint and `build-prod` pass.

`link-editor/linkTypes.ts` gained one line the plan did not list — the selector overload on
`ILinkSource.state.subscribe`, needed because `LinkTreeProvider` now selects against that interface.
Necessary and innocuous.

**The triage count in the task document was wrong, and I approved it.** Its prose said "17
conversions and 27 leaves"; the table it summarised has **21 convert and 23 leave** rows, which is
the correct partition of 44. Codex found the inconsistency while implementing and surfaced it
rather than guessing which number to obey — the right call, and the reason it did not quietly
convert 17 and leave four real defects behind. The document is corrected, with the error noted in
place rather than erased.

This is worth recording plainly: my plan review checked the *verdicts* and the *reasoning* and
never checked that the summary added up to 44. An arithmetic check on a table I had already read
would have caught it in seconds. Verifying claims and verifying totals are different passes, and I
only ran the first.

### US-1202 — editor roots, axis A (2026-08-29)

Implemented in eight editor roots: `link-editor`, `notebook`, `grid`, `markdown`, `log-view`,
`html`, `env-vars`, `image`. typecheck, lint and `build-prod` pass; the renderer answers and the
link editor renders.

**The task was split.** Codex recommended, and I accepted, separating the two axes that both live in
`editors/`: US-1202 is the `{ model }` fan-out, **US-1207** is the bare-subscription triage. The
epic's B-5 predicted this task might need splitting; it did, on a cleaner seam than expected — the
axes turned out to be independent rather than two halves of one job.

**Seven of the nine editor-root citations in B-4 were incomplete.** Each cited range stopped a line
or two above the chrome-model relay, so following the epic literally would have converted the direct
child calls and left the `TextChromeView` model fan intact — a half-conversion that would have looked
complete. Only `base/PageToolbarView.ts:431-433` and the three `rest-client` citations were current.
The corrected map is in the task document.

**A deferred-boundary table was produced and honoured**, which is the part of this task most likely
to have gone wrong. `TextChromeView`/`PageToolbarView`, both `KeyValueEditorView` relays,
`RawBodyView` → `MonacoEditorHostView`, `GridBodyView` (its `onModel` belongs to US-1204) and the
shared toolbar's uikit controls were left alone rather than converted twice. `src/renderer/uikit/**`
is untouched by this task.

**Unrequested behaviour change, accepted with reservations.** The conversion replaced
`this.model = requireXModel(props.model)` with an identity check that **throws** — seven new
`throw new Error("… received a different model instance.")` sites. The epic did not ask for this and
"nothing the app does changes" was the Epic A standard, not this epic's, but it is defensible here:

- The only path that can reuse an editor view with a different model is
  `AsyncEditorView.renderEditor()` (`ui/app/AsyncEditorView.ts:99-115`), which reuses the view only
  when the View constructor and cache key match — and it wraps `vanillaView.update({ model })` in a
  `try/catch` that disposes the view and shows `NativeEditorErrorView`. So the throw degrades to a
  visible error panel, not a wedged renderer.
- `RenderEditorView.onUpdate` (`ui/app/RenderEditorView.ts:28-36`) rebuilds when `model.id` changes,
  so the reuse path requires **same id, different instance**. That is a real supported shape —
  `EditorModel.ts:15` documents that `switchFrom` transfers the instance UUID to the new editor —
  but an editor switch also changes `editorId`, hence the cache key, hence forces a rebuild.

The residual risk is a same-`editorId`, same-`id`, new-instance replacement. None was found, but
none was proved impossible either. Recorded as **accepted unverified**: if it exists, the symptom is
an error panel in place of an editor after a model swap, not silent corruption.

### US-1201 — sidebar (2026-08-29)

Implemented. Two files: `ui/sidebar/OpenTabsListView.ts`, `ui/sidebar/ToolsEditorsPanelView.ts`.
Six update-path callbacks hoisted to bound fields; one retained `ListBoxProps` object whose live
`items`/`activeIndex` are assigned in place. typecheck, lint and `build-prod` pass; the renderer
answers.

**The gate defeat was real, and verified against the consumer rather than assumed.**
`ListBoxModel.repaintSignature()` (`uikit/ListBox/ListBoxModel.ts:224-271`) includes `props.items`,
`activeIndex`, `renderItem`, `props.isSelected` and `props.getTooltip`, and `ListBoxView.onUpdate`
feeds it to a `DepsGate` (`ListBoxView.ts:143-149`). Fresh `isSelected`/`getTooltip` identities
therefore reported a changed signature on every pump — a gate that read as working while gating
nothing. This is the first epic claim that survived verification intact.

**Two further epic claims did not.** The "14-field ListBox props literal" is 9 fields in the
constructor and 10 in the update path. And "the list repaints in full on any dispatch" is too
strong: `OpenTabsListView` already binds `pagesModel.state` on the `state.pages` slice
(`:51-56`), so the pump is not driven by arbitrary dispatches. The accurate claim is narrower —
every pump that *does* occur defeated the gate.

**Both alleged re-entrancy defects are benign, and nothing was changed for them.** The epic cited
`OpenTabsListView.ts:116-119` and `ToolsEditorsPanelView.ts:79-81` as "setState in the render body".
Neither mutates a `TOneState` listener array nor dispatches state from inside a state listener:
the first runs from a `ListBox` mouseenter/keyboard path, the second from a DOM button event. Both
were left synchronous. Two of the three re-entrancy allegations in this epic have now been
withdrawn on inspection; the third (`PageTabsView`) was withdrawn in US-1199.

**The sidebar bare-subscribe census returned zero**, as the B-2 addendum predicted — every
`ui/sidebar/` state subscription is already a targeted `bind()`, and the remaining `subscribe`
calls are `settings.onChanged` or registry notifications, not `TOneState`. Recorded as a finding
rather than a gap.

### US-1200 — the convention (2026-08-29)

Documentation only, as scoped. The full treatment went into `doc/standards/model-view-pattern.md`
("The props-pump convention"), with a short summary and link in `src/renderer/uikit/CLAUDE.md`.
Six sections: construction-config vs live data, stable callbacks as fields (including the
legitimate construction-time-arrow exception), selector authoring, `KeyedList`/`SubtreeSwap` as the
only sanctioned dynamic-children patterns, the `update()` contract with its type-level narrowing
explicitly deferred, and the rejection of R2 step 4's equality gate with the reason.

**The standards doc was itself teaching the bug.** Its `bind()` example at `model-view-pattern.md:210`
recommended `(state) => [state.isOpen, state.selectedIndex]` — an **array** selector, which
`compareSelection` compares by identity, so it fired on every dispatch. Corrected to a plain object.
Its later guidance to "put derived arrays in a model `memo()`" was also corrected, since US-1205
deletes `memo()`. Both were pre-existing and neither was in the epic's scope; they are the reason
this task was worth doing before the conversion tasks rather than after.

### US-1199 — app-shell hot path (2026-08-29)

Implemented. Four files: `ui/app/PagesView.ts`, `ui/app/MainPageView.ts`, `ui/app/PageContentView.ts`,
`ui/tabs/PageTabsView.ts`. typecheck, lint, and `build-prod` pass; the app renders (tab strip,
sidebar tree, indicators all present in an app snapshot after the change).

**Correction to this epic — statement 1's headline site was overstated, and B-2 correction 2 did not
go far enough.** The epic called `PagesView.ts:18` "the single worst binding in the renderer" and
said it reconciles all page slots "on every dispatch". Both are wrong, and the reason is
`compareSelection` (`core/state/state.ts:28-39`): it recurses into plain objects but compares
arrays, Maps and Sets **by identity**. `OpenFilesState` (`api/pages/PagesModel.ts:20-27`) is exactly
`{pages, ordered, leftRight, rightLeft, compareGroups}` — two arrays, two Maps, a Set — and
`managerProps()` reads all five. So `(state) => state` there was *already* equivalent to a
five-field projection: same dispatches, same skips. The conversion has **no runtime effect** and is
recorded in the task document as a contract/readability change only.

This is the fourth epic in a row in which a claim inferred from code shape did not survive contact
with the code. The instrument was available and cheap the whole time — reading one comparator.

**What the pilot actually bought, and it was not where the epic pointed.** `PageTabsView.ts:167-168`
subscribed to every page state and every main-editor state with **no selector at all**, so every
editor dispatch — every keystroke — called `refreshTabLayout()` and reconciled the whole tab strip.
Bare subscriptions, not wide selectors, are the real defect class. Both are now narrowed: pages to
`{pinned, mainEditorId, version}`, editors to `{encrypted, decrypted}`.

**A trap this epic must carry forward, and the reason plan review is worth its cost.** The obvious
narrowing — `(s) => s.pages.map(p => p.id)` — allocates a fresh array per dispatch, never compares
equal under `compareSelection`, and therefore fires on *every* dispatch. It would have converted a
mostly-gated binding into a fully ungated one while typechecking, linting, building, and reading as
the fix. Codex identified this independently during investigation. US-1200 writes it into
`model-view-pattern.md` as a standing rule.

**Two review corrections that changed the delivered work:**

1. The plan proposed a `queueMicrotask` to make `pageLayoutSubscriptions` safe against mutation
   during dispatch. `TOneState` is copy-on-write — `stateChanged()` iterates `this.listeners` while
   both unsubscribe paths *rebuild* the array (`state.ts:52-54, 84-92`) — so subscribing and
   unsubscribing mid-dispatch is already safe, and nothing that `syncPageLayoutSubscriptions()`
   does dispatches state, so it cannot re-enter itself. The deferral was dropped entirely rather
   than downgraded to a synchronous guard. Adding a microtask here would also have run against R8
   and R9, which exist to *delete* exactly this idiom.
2. The editor projection substitutes the stored `state.encrypted` flag for the content-derived
   `TextFileEncryptionModel.encrypted` getter. They agree only because `changeContent()` writes
   `state.encrypted = isEncrypted(newContent)` on every edit (`editors/text/TextEditorModel.ts:276`).
   That one line is the whole invariant; if it ever goes away, pinned-tab offsets and encrypted-tab
   widths go wrong with no error. Now cited at the projection site.

**Accepted unverified.** The manual checklist (open/close/reorder/group/ungroup/pin/compare, and
"type into a document and confirm the tab strip does not reconcile") has **not** been walked. The
render check was a single app snapshot confirming the renderer is alive — nothing more. The
encryption transition path (lock/unlock changing tab width and pinned offsets) is the highest-risk
unverified item, because a wrong projection there fails silently.

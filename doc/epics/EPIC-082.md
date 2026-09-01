# EPIC-082: React architecture removal at the call sites

## Status

**Status:** Completed
**Created:** 2026-09-01
**Started:** 2026-09-01
**Completed:** 2026-09-01

**Roadmap:** packages 4 + 5 of [de-react-refactoring-2.md](../de-react-refactoring-2.md) Part 6.
The second epic of that programme, sequenced after [EPIC-080](EPIC-080.md) because it consumes
`afterDispatch`. EPIC-081 (DOM & IO mechanisms) remains the free-floating parallel track and is
**not** a prerequisite.

## Overview

EPIC-080 built the mechanisms. This epic spends them: it removes React's *architecture* from the
places where it survived the migration as a shape rather than as a dependency. Two clusters, and
they are independent of one another:

- **§1.1 — `useEffect` emulation.** A `DepsGate` compares a dep array at the prop-pump boundary,
  then defers the body in a `queueMicrotask` that re-validates every dependency from scratch,
  guarded by `live`/`isLive`. There is no render or commit phase in this codebase, so nothing
  forbids writing state synchronously from `onUpdate` — and where the ordering *is* real,
  `afterDispatch` now expresses it deterministically instead of "hopefully next tick".
- **§1.2/§1.6/§1.7 — the `components/tree-provider/**` island.** The last un-migrated folder in
  spirit: stale React rationale kept as live justification, a render-prop bag, and portal refs.

The verification question here is the opposite of EPIC-080's. Nothing in this epic can brick the
app — every task is confined to one editor or one folder, and revert granularity is a single file.
What it *can* do is change visible behaviour in a specific editor in a way a green build does not
catch. So the check is **"does this editor still behave"**, per task, and the epic is deliberately
cut so that each task is independently revertible.

## Why now — the measured case

Re-verified against source at commit `caacc80a` (EPIC-080's merge), not taken from the report:

| Site | `DepsGate` | `queueMicrotask` | `this.live` | `isLive` |
|---|---|---|---|---|
| `editors/graph/GraphDetailPanelView.ts` | 9 | 10 | 12 | 9 |
| `editors/graph/GraphBodyView.ts` | 1 | 1 | 8 | 1 |
| `editors/graph/GraphLegendPanelView.ts` | 1 | 2 | 3 | 3 |
| `editors/rest-client/ResponseViewerView.ts` | 3 | 1 | 3 | 0 |
| `editors/settings/sections/McpSectionModel.ts` | 4 | 0 | 0 | 7 |
| `editors/env-vars/EnvVarsBodyView.ts` | 1 | 1 | 4 | 0 |
| `editors/rest-client/RequestBuilderView.ts` | 2 | 0 | 0 | 0 |
| `editors/file-diff/FileDiffBodyView.ts` | 2 | 0 | 0 | 0 |
| `editors/settings/sections/SettingsSections.ts` | 2 | 0 | 0 | 0 |
| `editors/rest-client/RestClientShared.ts` | 1 | 0 | 0 | 0 |
| `editors/settings/sections/BrowserProfilesSectionModel.ts` | 1 | 0 | 0 | 2 |

`GraphDetailPanelView` alone is a third of the cluster. Two of its methods are compressed onto
single ~900-character lines (`:594` and `:632`) — `syncSeed` at `:632` is one line containing a
`DepsGate`, a `queueMicrotask`, a triple guard, two loops and eleven model mutations. That file is
its own task and leads the epic.

The remaining six `DepsGate` files are **uikit primitives** (`ListBoxView`, `MultiListBoxView`,
`SelectView`, `TreeModel`, `TreeView`, plus `deps-gate.ts` itself). `DepsGate` is the sanctioned
form for prop-derived change detection — EPIC-056 kept it there deliberately when it de-microtasked
those same components. **This epic does not touch uikit.**

## Goals

1. `GraphDetailPanelView`, the graph panels, the rest-client views, and the settings/diff/env-vars
   sections express their consequences at the write site, or via a selector-scoped `bind()`, or via
   `afterDispatch` where the ordering is genuinely real — not via a microtask plus a re-validated
   triple guard.
2. No comment in `components/tree-provider/**` justifies a deferral with a React mechanism that
   does not exist. Either the deferral is load-bearing and says why in Persephone's own terms, or
   it is gone.
3. `CategoryViewImpl`'s items bridge is a stable renderer over a model handle, with one owner for
   the child views — not a per-update props bag whose children are created by one class and
   released by another.
4. `toolbarPortalRef` and the link-editor's three `*Ref*` props are replaced by host-passing, the
   mechanism the codebase already has (`PopoverView`'s `contentView: (host) => IOwnedView`,
   `overlayLayer.ts`).
5. Every `live`/`isLive` guard deleted along the way is deleted because the microtask it guarded is
   gone — never because it looked redundant. EPIC-080's US-1264 established that this family is
   mostly load-bearing (only 45 of ~215 references were provably removable); that finding stands and
   constrains this epic.

## Corrections to the report's plan

The roadmap's §1.1/§1.2/§1.5/§1.6/§1.7 were re-verified before and during the epic. Six claims
needed correcting, and three of them change what a task should do.

1. **The render-prop bag's stated cost is wrong — and the real cost is worse.** The report says
   `CategoryViewImpl.ts:334-360` builds "a freshly built 15-key props object containing 11
   callbacks per update". The object is **18 keys / 11 callbacks**, and every callback value is a
   stable bound field (`onSelect: this.onItemClick`, and `renderItems` itself is
   `private readonly` on `CategoryEditor.ts:358`). So there are no fresh closures, and per-update
   allocation is not the problem. The actual problem is **split ownership**: `CategoryEditor`
   creates, mounts, updates and releases the child views (`this.child(new LinksListView(...))`,
   `releaseActiveItems`), while `CategoryViewImpl` decides *when* that happens by calling
   `renderItems(state)` and `replaceChildren`-ing the returned `Node`. The `Node`-returning contract
   is what forces the `replaceChildren`, and the `replaceChildren` is what forces
   `flushPendingGridRepaintSoon`'s `queueMicrotask` at `:379` to re-sync the grid afterwards. Fix
   the ownership and the microtask goes with it. Do **not** plan this task around allocation.

2. **`CategoryViewImpl.ts:102` is a wording fix, not a code fix.** The report groups
   *"…before its layout effect runs"* with the stale-rationale sites. The other three sites justify
   a real deferral with a false reason; this one is a comment on a constructor-time `own()` that is
   correct and should stay. Reword only.

3. **§1.5's memo chains are unassigned across the whole programme.** Part 5 puts §1.5's *selector*
   anti-patterns into package 1 (US-1258) and never assigns the `lastProjection` shallow-compare
   chains to anything. `CategoryViewImpl.ts:275-283` (8 terms) is inside this epic's island and is
   folded into US-1272. The other three — `editors/git-tree/GitRefsView.ts:116-120`,
   `editors/markdown/MarkdownBodyView.ts:391-405`, `uikit/Popover/PopoverView.ts:377-380` — are
   **out of scope here** and go to the backlog with package 8, which is where the rest of the
   per-editor conversion work already sits.

4. **§1.8's vocabulary residue is also unassigned**, and it is the only orphan cheap enough to
   absorb rather than defer. Verified live: 16 `loadComponent` references, four "re-render" comments
   in `api/pages/PageModel.ts`, the `FileSearchModel` stale reason, `LivePreview`'s guard, and the
   `performance-janitor` scoping note. It becomes US-1274, last, and cuttable. **One caveat that
   changes its shape:** the report's "~10 occurrences" of "re-render" in the scripting docs are in
   `api/types/ui-log.d.ts` (9) and `api/types/ui.d.ts` (1) — those are the **public scripting API**
   surface, user-visible in IntelliSense, so that half needs `/userdoc` attention and is not a
   free rename.

5. **Four `DepsGate` files the report never named.** §1.1 lists seven files for treatment;
   eleven non-uikit files use `DepsGate`. `RestClientShared.ts`, `EnvVarsBodyView.ts`,
   `SettingsSections.ts` and `BrowserProfilesSectionModel.ts` are missing from the list. They are
   small (1–2 gate instances each) and are folded into US-1269 (`RestClientShared`) and US-1270
   (the other three) rather than left behind — an
   unassigned remnant is how a cluster survives a cleanup epic.

6. **§1.5's "fresh string" selector claim is wrong, and only arrays are affected.** The roadmap
   says selectors that allocate a fresh string — naming
   `editors/graph/GraphLegendPanelView.ts:467`'s `state.selectedNodes.map(...).join(",")` — "fire on
   **every** dispatch". Verified against `compareSelection` (`core/state/state.ts:30-42`, used by
   `subscribe` at `:106`): **arrays** are identity-compared (`:31-33`), but **plain objects are
   shallow-compared by value, recursively** (`:35-40`) and **strings compare with `===` on their
   value**. So the joined-key selector is correct by design and does not fire spuriously; its only
   cost is running the map+join on every dispatch. The genuine defects are the fresh-**array**
   selectors (`(state) => state.buttons ?? []` in the dialogs), which stay in US-1258.

   This matters beyond bookkeeping: the first draft of US-1268 planned to "fix" the joined key by
   selecting `state.selectedNodes` directly, which would have **loosened** the trigger —
   `GraphEditor.refreshSelectedNodes:663-681` reallocates that array with the same ids after every
   node edit, so the legend highlight would re-apply on every property edit. Any binding trigger in
   this epic must stay **value-comparable**, never a raw array.

Non-corrections, recorded so they are not re-raised: the report's "19 `DepsGate` references" in
§1.1 and "33 gate references" in Part 6 are both right — they count `DepsGate` and `Gate`
respectively. The `queueMicrotask` total is now 34, not the report's 36, because EPIC-080 removed
two.

## Overlap with EPIC-081

`editors/rest-client/RestClientShared.ts` appears in **both** epics: its `DepsGate` use belongs to
this epic (US-1269), and its self-rescheduling rAF spin on `offsetHeight` belongs to EPIC-081's P4
(`afterFirstLayout`). Different code in the same file, so this was never a reason to sequence the
epics.

**Handoff to EPIC-081, verified at close.** US-1269 left the spin untouched, and its current shape
differs from the roadmap's description — check the code, not the report. It now lives at
`scheduleMeasurement:268-280` and **still re-schedules itself indefinitely** while
`!this.root.isConnected || this.responsePane.offsetHeight <= 0`, but it does so through the
owner-bound `this.schedule.raf` and carries **no `live` guard** — EPIC-080's US-1263 converted the
handle management, not the loop. The roadmap still describes it as a raw `requestAnimationFrame`
guarded by `live`; that is stale. It shares only `this.resultHeight` and the gate's `prime()` at
`:278` with `resultMeasureGate`, which is enough that EPIC-081 must rebase on US-1269's diff but not
enough to move the epic boundary.

## Risk & abort criteria

- **The risk is behavioural, not structural.** Removing a `queueMicrotask` makes a state write land
  synchronously inside the dispatch that triggered it. Where that write feeds a view that is
  mid-update, the symptom is a stale or flickering panel, not a crash — invisible to typecheck,
  lint and build. **Every task must be verified in the running app**, in the editor it touches,
  before it is considered done. A green build is not evidence here.
- **`afterDispatch` is the answer only where the ordering is real.** The default is a synchronous
  consequence at the write site. Reaching for `afterDispatch` on every converted microtask would
  reproduce the same deferral with better spelling and no gain. A task that converts N microtasks
  into N `afterDispatch` calls has not done the work.
- **Abort criterion.** The graph strand (US-1267/US-1268) is the deep end. If `GraphDetailPanelView`
  cannot be de-effected without either an ordering surprise or a rewrite larger than the file, stop
  the strand there and keep what landed — the rest-client and settings tasks are independent and
  the tree-provider strand shares nothing with it.
- **The tree-provider strand has one consumer count that matters.** `CategoryViewImpl` has exactly
  **one** consumer (`editors/category/CategoryEditor.ts`), which is why US-1270 is tractable.
  `TreeProviderViewImpl` has **six** (archive ×2, explorer, link-editor, mneme-root, and its own
  editor), so anything that changes *its* props contract is a six-site change and should be
  resisted inside this epic.

## Linked Tasks

Two independent strands. Either may run first; within a strand the order is as listed.

### Strand A — §1.1 de-effecting, per editor

| Task | Scope | Status |
|---|---|---|
| US-1267 | `GraphDetailPanelView` — 9 gates, 10 microtasks, 12 `live`, and the two ~900-char lines | Planned |
| [US-1268](../tasks/US-1268-graph-panels-de-effect/README.md) | The rest of graph — `GraphBodyView`, `GraphLegendPanelView` | Planned |
| [US-1269](../tasks/US-1269-rest-client-de-effect/README.md) | rest-client — `ResponseViewerView`, `RequestBuilderView`, `RestClientShared` | Planned |
| [US-1270](../tasks/US-1270-settings-diff-envvars-de-effect/README.md) | settings + diff + env-vars — `McpSectionModel`, `SettingsSections`, `BrowserProfilesSectionModel`, `FileDiffBodyView`, `EnvVarsBodyView` | Planned |

### Strand B — the `tree-provider` island

| Task | Scope | Status |
|---|---|---|
| [US-1271](../tasks/US-1271-tree-provider-false-deferrals/README.md) | §1.2 — the three false deferrals (`TreeProviderViewModel:205`, `CategoryViewModel:187`, `CategoryViewModel:502`) and the `CategoryViewImpl:102` reword | Planned |
| [US-1272](../tasks/US-1272-category-items-ownership/README.md) | §1.6 — dismantle the items render-prop: one owner for the child views, stable renderer over a model handle; absorbs `flushPendingGridRepaintSoon` and the 8-term `lastProjection` chain | Planned |
| [US-1273](../tasks/US-1273-portal-refs-to-hosts/README.md) | §1.7 — `toolbarPortalRef` and the link-editor's `toolbarRefFirst`/`toolbarRefLast`/`footerRefLast` → host-passing | Planned |

### Residue

| Task | Scope | Status |
|---|---|---|
| [US-1274](../tasks/US-1274-vocabulary-residue/README.md) | §1.8 vocabulary — `loadComponent` → `loadView` (16 refs), the `PageModel` "re-render" comments, `FileSearchModel`'s stale reason, `LivePreview`'s guard, `performance-janitor` scoping. The scripting-API half (`ui-log.d.ts`, `ui.d.ts`) is user-visible. Cuttable. | Planned |

`CategoryViewModel:502`'s `setDragState` is the one deferral in US-1271 with visible consequences:
it wraps **every** drag-state write, so that drag feedback is currently one microtask late by
construction. **Correction (2026-09-01, while reviewing US-1271's plan):** the roadmap's framing —
and this epic's first draft — said removing it changes drag-hover timing "in every tree". It does
not. `CategoryViewModel` is imported by exactly one implementation file (`CategoryViewImpl`), which
has exactly one consumer (`CategoryEditor.ts:229`), and `TreeProviderViewModel` has neither
`setDragState` nor `dropTargetHref`. Site 3 therefore governs drag feedback in the **Category
editor only**; Explorer, Archive, Link editor and Mneme root drag through `TreeProviderViewImpl`
and are untouched. Verify by dragging rather than reading — but verify the editor the change can
actually reach. Site 1 (`adoptSelection`, in `TreeProviderViewModel`) is the one that *is* shared
by six consumers.

## Deferred verification

The epic's rule is that each task is verified in the running editor, because a green build cannot
catch what these changes break. What was verified, and what remains, is recorded here rather than
skipped.

### Verified 2026-09-01

**US-1267 — verified thoroughly** against `docs/examples/greek-gods.fg.json` (63 nodes, 87 links,
custom per-node properties), driven through the `asGraph()` facade with zero errors or unhandled
rejections throughout:

- header transitions across none → single → multi → cleared → reselected;
- expand/collapse via the header, on both single and multi selections;
- all three tabs switching, with real content — Info fields, the properties grid showing genuine
  custom values (`domain`, `description`), and the links grid showing Zeus's actual neighbours
  (Cronus, Rhea, Hera, Athena, Apollo…). This exercises both `syncSeed` conversions;
- **the tab invariant**: with the Links tab active, selecting three nodes and re-expanding lands on
  **Info**, not Links — the converted consequence works;
- the links consequence's re-entrancy path (`onExpandNode` + highlight) with no error;
- rapid selection churn (five selections at 40 ms intervals) with correct recovery.

**One anomaly investigated and cleared:** changing selection while the panel is expanded collapses
it, and it does not restore. This is **pre-existing, not a regression** — proven by checking out the
pre-US-1267 file, reproducing the identical behaviour, and restoring. Root cause: the initial
no-selection prop pump overwrites `wasExpanded` (initialised `true`) with `false`, in both versions,
because `depsChanged(undefined, …)` returns `true` so the original gate also fired on its first
evaluation. The `wasExpanded = true` initialiser is effectively dead in both. **Recorded as a
pre-existing UX oddity, deliberately not fixed here** — fixing it would make the diff no longer
behaviour-preserving, which is this task's whole contract. Worth a backlog entry.

**US-1271 — partially verified.** The `TreeProviderViewImpl` tree mounts and renders real directory
content after the change, which exercises site 2's conversion directly: the folder listing only
appears if the now-synchronous `subscribeWatch` + `loadItems` path works. Typecheck, lint and
`build-prod` all pass over the combined diff.

**US-1268 — verified.** Legend panel renders with real content and three tabs; expand/collapse works;
tab switches (Selection / Level / Shape) change content correctly; selection churn (single → multi →
different node → cleared) with the legend expanded produces no errors. The search-results toolbar
appears on a query. Zero errors or unhandled rejections across the sequence, once the unrelated
pre-existing defect below was fixed.

**US-1272 — verified on the list arm.** Reached the Category editor through the real navigation path
(Explorer folder row → `tree-category://` page). Confirmed via the **visible** editor instance —
note that five *hidden* instances from earlier pages coexist in the DOM and all read
"Please select a category in the Navigation Panel", which is a trap for any DOM assertion here:

- the new `itemsView(host, initialProps)` factory constructs, mounts and renders — **15 real item
  rows** through the owned `CategoryItemsViewHandle`;
- selection works (clicking a row marks exactly one selected);
- search filtering works — 15 rows → **3**, with correct matches;
- clearing the search restores 15 rows **and preserves the selection**, which exercises projection
  reconciliation across a filter round-trip;
- zero errors throughout.

Structural constraints confirmed: `components/tree-provider/` imports **zero** editor code (the
code-splitting constraint), `flushPendingGridRepaintSoon`/`pendingGridRepaint` are gone, and the gate's
dep array is exactly the nine intended terms with `loading`/`error`/`items`/`dropOverView` excluded —
fixed length, `changed()` called once per update.

**US-1269 — verified functionally.** Built a throwaway `.rest.json` fixture pointed at the **local
dev server** (not an external service) and sent all three requests. The response viewer rendered
`200 OK / 38 ms / 2.7 KB` with body language **json** for `/package.json`, then **html** for `/`.
That language transition is the direct proof of the one conversion: the converted consequence resets
`languageOverride` to `null` on a new `response` identity, so a broken reset would have left the
second response displaying `json`. Zero errors across all three sends. Fixture deleted afterwards.

*Operational note for future verification:* the rest-client editor marks its file **modified on
load**, so closing a fixture page raises a modal "Unsaved Changes" prompt. An awaited `closePage`
from `execute_script` deadlocks against that prompt — the script's own await blocks the dialog it is
waiting on. Call `closePage` **without** awaiting it, then click "Don't Save" from a later statement.

**US-1270 — zero behavioural change, so verification is by construction.** The review established
that its only candidate conversion was not one (see the note below), leaving ten `DepsGate` instances
retained, nine liveness guards retained, and one coalescer retained. The implemented diff is a
**13-line comment** on `EnvVarsBodyView.scheduleApply` and nothing else; `typecheck` and `lint` pass.
This is the single task in the epic where a green build *is* sufficient evidence, because no
behaviour moved — stated explicitly so the claim is not mistaken for the runtime checks the other
tasks required.

*Why the candidate was not a conversion:* `scheduleApply` (`EnvVarsBodyView.ts:440-456`) guards its
microtask with an `applyQueued` re-entry flag, so `handleEdit`/`handleAddRows`/`handleDeleteRows`
collapse into **one** `validateRows` + `setProfileData` per turn. That is a batching boundary, and the
roadmap's own §2.2 lists the identical pattern (`GridEditor.ts:850`) under *"well-reasoned and not
findings"*. Converting it would run the write once per event, and each write dispatches editor state
synchronously — reseeding the grid while its mutable row buffer is mid-mutation. It also surfaced a
trap worth carrying forward: **`afterDispatch` runs inline when no dispatch is in flight**
(`core/state/dispatch.ts:37-43`), so on a DOM grid event it would fire immediately and collapse
nothing. It is the wrong tool for coalescing.

### Defect found and fixed on the way (not part of any task's scope)

**Graph search results never showed matched properties — they threw.** Found 2026-09-01 while
verifying US-1268 by typing in the graph editor's node-search box. Typing a query that matched a node
*property* (rather than only a title) threw
`TypeError: Cannot read properties of undefined (reading 'replaceChildren')` from
`uikit/shared/highlight.ts:21`, via
`SearchResultRowView.updatePropertyRow` → `createPropertyRow` → `KeyedList.update`.

Cause: `createPropertyRow` builds the row as `row.append(key, document.createTextNode(": "), value)`,
but `updatePropertyRow` read `row.children[2]`. `children` is an element-only collection, so it holds
`[key, value]` and index 2 is `undefined`. One-character fix — `children[1]` — plus a comment naming
the skipped text node.

**Confirmed pre-existing** by reverting both US-1268 files to `HEAD` and reproducing, and confirmed
with real CDP keystrokes as well as synthetic input. It is in `GraphBodyView.ts`, the file US-1268
touched, but in `SearchResultRowView`, which US-1268 does not modify.

Fixed directly rather than delegated, per the project rule that defects are the reviewing agent's
own work. It is **not** part of US-1268's behaviour-preserving contract and should be called out
separately at commit time. Verified after the fix: four consecutive searches with zero errors, six
result rows, property rows rendering real values, and eight highlighted spans — highlighting that
could never have worked before.

**US-1273 — rename verified structurally; behaviour reported by the implementing agent.** The prop is
now `toolbarHost` (matching the existing house precedent at
`editors/git-tree/GitPanelSecondaryView.ts:34`), the editor's field is `searchHost`, and
`LinkEditorProps` plus its orphaned `TextFileModel` import are gone — all confirmed by grep.
`typecheck`, `lint` and `build-prod` pass over the **combined eight-task diff**.

**Honest limit on the Category-editor behavioural claims:** the list↔tiles switch, search filtering
and drag-hover were verified by the *implementing agent*, not independently re-verified by the
reviewer. My own independent runtime verification of that editor covered the **list arm only**
(15 rows, selection, search 15→3, restore preserving selection — recorded under US-1272 above). A
second attempt to reach the editor independently failed on environment rather than code: the tree
row would not expand under synthesised pointer events and the page being queried turned out to be
hidden. Treat the tiles arm as *reported working*, not *independently confirmed*.

**US-1274 — rename verified complete.** `rg loadComponent src/renderer` returns **zero**, `loadView`
covers the 16 renamed sites, and the two mentions in `doc/architecture/secondary-views.md` are
updated. House vocabulary survived (63 `reactive` uses intact) and the sanctioned React-as-history
comment in `TreeProviderViewImpl.ts` is untouched. The pre-existing, unrelated `loadView` method in
`editors/mneme-config/ModelPanel.ts` (5 uses at `HEAD`, 5 now) was not collided with — different
scope. The ten public scripting-API comments now describe observable behaviour to a script author
("updates the displayed grid in real time") rather than renderer internals; `assets/editor-types/`
matches byte-for-byte, which is expected since `folder-structure.md:28` documents it as generated by
a Vite plugin.

### Closure decision (2026-09-01)

The three items below were **flagged to the user before closure and remain unverified**. The user
reviewed the report listing them and authorised completing the epic ("everything looks good,
complete the epic"). They did **not** state that they had performed these checks, so this section
records them as outstanding rather than done — closure was a scoping decision, not a verification
result. If any of them later fails, the responsible task is named in the table.

### Still pending

| # | Task | What needs verifying | Why not done |
|---|---|---|---|
| 1 | US-1271 | Site 1 (`adoptSelection`): external navigation collapsing tree selection to the navigated item, across the six `TreeProviderViewImpl` consumers. | av-grid rows do not respond to synthetic `.click()`; needs real pointer interaction |
| 2 | US-1271 | Site 3 (`setDragState`): drag feedback in the **Category editor** only — folder rows, whitespace, enter/leave/clear/drop. | HTML5 drag-and-drop cannot be faithfully synthesised; needs a human dragging |
| 3 | US-1267 | The properties/links grids' **cancel and apply** paths. | Apply writes to `docs/examples/greek-gods.fg.json`, a user-facing documentation example that must not be modified. Needs a throwaway graph fixture |
| 4 | US-1272 / US-1273 | **Physical mouse-drag** hover onto a folder row, and scroll preservation across updates. | US-1273's implementing agent reported the list↔tiles switch and search working, and drag-hover setting `data-drop-active` — but via **synthesised DOM drag events**, and it stated physical mouse-drag automation was unavailable. HTML5 drag-and-drop cannot be faithfully synthesised, so this needs a human dragging |

## Questions raised at cut, and how they resolved

1. **Did `GraphDetailPanelView` want de-effecting or splitting?** → **De-effected in place, not split.**
   Its classes form one private ownership chain (only `GraphDetailPanelView` is exported, and
   `GraphBodyView:388` owns that single boundary), so a split would push private prop/model types
   across a file boundary while adding no ownership or scheduling seam — and would enlarge the revert
   surface of an independently-revertible task. The two ~900-character compressed methods were
   expanded instead, which was the substantive readability win.

2. **What replaced `renderItems`' `Node` return?** → **A caller-supplied factory:**
   `itemsView(host, initialProps) => CategoryItemsViewHandle`, with `root`/`mount`/`update`/`dispose`.
   This is the epic's most important design decision, and the review changed it: the first draft had
   `CategoryViewImpl` construct `LinksListView`/`LinksTilesView` directly, which would have put a
   static `editors/` import into `components/` — violating Critical Pattern 1 and pulling link-editor
   into all six `tree-provider` consumers' chunks. The plan's own cited precedent settled it:
   `PopoverView` does **not** import its content views; `contentView: (host) => IOwnedView` is
   supplied by the caller. So the **ownership** boundary moved to `CategoryViewImpl` while the
   **import** boundary stayed in `CategoryEditor`. `flushPendingGridRepaintSoon`'s microtask went
   with it, exactly as predicted — it existed only to compensate for the opaque `Node` contract.

3. **Was `performance-janitor` scoping worth doing?** → **No; left unchanged.** It is already
   documented and self-gating, and the roadmap only said "consider". US-1274 recommended dropping it
   and that recommendation was accepted, keeping the cuttable task genuinely small.

## Notes

- Package 8 (§1.4 teardown-rebuild renders, §1.3 `{state,setState}` secondary-view props, §1.7
  callback-ref drilling) stays in the backlog and is **not** pulled into this epic, per Part 6. The
  three §1.5 memo chains listed in correction 3 join it there.
- Deferred review model: tasks stay `[ ]` until the epic closes, then `/review`, `/document` and
  `/userdoc` run over the whole epic. US-1274 makes `/userdoc` non-optional this time — the
  scripting API docs are part of the diff.
- Two items deferred out of EPIC-080 belong to a later epic, not this one: the fourth listener list
  in `src/ipc/renderer/renderer-events.ts`, and `PageContentView`'s helper adoption. See
  [EPIC-080](EPIC-080.md) for the reasoning.

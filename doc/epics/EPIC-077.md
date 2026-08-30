# EPIC-077 — Post-De-React Epic C: proportional work

**Status:** Planned — cut 2026-08-30 from [`de-react-refactoring.md`](../de-react-refactoring.md).
**Scope:** R4 (full-rebuild sites), R5 (large collections under immer), R7 (model/view collapses
and types-only files), R8's surviving residue, and R6's deferred type half.
**Predecessors:** [EPIC-075](EPIC-075.md) — Epic A, core contracts (R1, R3, R10.1-3), completed
2026-08-29. [EPIC-076](EPIC-076.md) — Epic B, the props pump (R2, R6's pump half, R10.4-6),
completed 2026-08-30.
**Tracked on:** [active-work.md](../active-work.md)

Epic B's baseline section opened with a warning that most of the plan's figures were inferred
rather than observed. That warning held: roughly twenty of Epic B's own stated facts failed
verification and three would have caused regressions. **The same sweep was run before cutting this
epic, and it found the plan's R4/R7/R8 figures in worse shape than Epic B's were** — because Epic A
and Epic B changed ~130 source files underneath a plan written before either landed. §C-2 lists
what failed. Read it before reusing any number from the plan page for this epic's areas.

---

## C-1 — The closing property

Epic B's property was about *when* a view is told something: `update(props)` is construction-time
configuration, and live data reaches a child through the state slice it subscribes to. This epic's
property is about *how much work happens when it is told*:

> **The work a view or model does in response to a change is proportional to the change, not to the
> size of the collection it holds.**

Falsifiable statements, in the form Epic B used — each names what must be absent and what must be
present in its place:

1. **No view rebuilds its whole child set on an ungated update.** *Absent:* an `onUpdate` or state-apply
   path reaching `replaceChildren` / `innerHTML =` / a full `.map()`-and-append with no comparison
   against the previous input. *Present:* `KeyedList`, `SubtreeSwap`, a targeted write, or an
   explicit signature gate whose comparison is visible at the call site.
2. **No `updateRenderInfo({ all: true })` fires for a change that touched a bounded set of cells.**
   *Absent:* an ungated `{ all: true }` on a path that knows which rows changed. *Present:* the
   `{ rows: [...] }` form the VirtualGrid contract already documents at
   `uikit/VirtualGrid/types.ts:64`. Sites that genuinely invalidate every cell (a column-width
   change, a global format toggle) keep `{ all: true }` **with the reason stated in a comment**.
3. **No large accumulating collection sits inside immer state.** *Absent:* a `produce` pass over an
   unbounded array to mutate one element. *Present:* the pattern `state-management.md` already
   documents and `GridEditor.ts` / `FileSearchModel.ts` already follow — collection as a plain model
   field, version counter in state.
4. **No model touches the DOM.** *Absent:* element references, listeners, and `innerHTML` writes
   inside a `*Model.ts`. *Present:* the view owns the DOM; the model owns the data. This is uikit
   Rule 9, and it is currently violated in at least two places.

Statements 1–4 are the epic. **They do not cover R7 or R6-types**, which are file-shape and
type-shape work rather than proportionality — see §C-3 for why they ride along anyway, and why
they are the part to cut if this epic needs to be smaller.

---

## C-2 — Measured baseline (2026-08-30, branch `upcoming-v4.0.23`)

Measured after EPIC-076's 154-file commit `9ca76ea5`, so these supersede the plan page throughout.

| Quantity | Plan says | Measured | Note |
|---|---|---|---|
| `setTimeout(…, 0)` in editors | 23 | **11** | 16 renderer-wide; see correction 5 |
| `Omit<Native…>` contract sites | 33 | **26** (25 files) | Epic B removed some with the ref channels |
| `on*` handlers in the native-attribute layer | 22 | **22** | Holds — they live in `NativeEventProps`, not the interface body |
| `applyRestProps` files | 39 | **40** | 39 callers + the definition; consistent with Epic B's close |
| `dom-props.ts` length | 241 | **236** | |
| `memo()` sites in uikit | 20 | **0** | Deleted in EPIC-076 US-1205 |
| Types-only component files in uikit | 17 (+2 re-exports) | **~17 of that class**, 29 declaration-free files total | See correction 6 — the extra 12 must *not* be merged |
| `state.update` sites in `NotebookEditor.ts` | ~20 | **30** total, **21** touching `data.notes` | |

### Corrections to the plan

**1. `git-tree/GitTreeEditorView.ts` is at the wrong path.** R4's table cites
`components/git-tree/GitTreeEditorView.ts:252`. That file does not exist. There are two git-tree
folders — `components/git-tree/` (the reusable tree: `GitTreeView.ts`, `GitTreeModel.ts`) and
`editors/git-tree/` (the editor: `GitTreeEditorView.ts`, `GitTreeEditorModel.ts`). The cited site is
in the second. A conversion agent told to open the first would have found nothing and either
guessed or reported the task impossible.

**2. Breadcrumb's stated symptom is fiction, and its real one is worse.** The plan says the
per-update rebuild "destroys focus in the crumb". Nothing in `uikit/Breadcrumb/` is focusable —
no `tabIndex`, no `tabindex`, no `focus` call anywhere in the folder; the segments are plain
`<span>`s. Focus cannot be destroyed because focus never lives there.

The actual defect is one the plan does not name. `applyProps` attaches its per-segment click
handlers with `this.listen(...)`, and `VanillaView.listen` (`vanilla-view.ts:180-196`) ends with
`this.own(() => target.removeEventListener(...))`. So **every update pushes one disposer per segment
onto the view's DisposableStore and never releases them**, and each retained closure retains the
detached `<span>` it was bound to. The handlers are inert — their elements are gone — but the store
and the elements grow without bound for the life of the view. This is a leak, not a repaint cost,
and it reframes the fix: the rebuild must go, but so must the assumption that `listen()` is safe to
call from an update path. **That assumption is worth a sweep of its own** — any other view calling
`this.listen` outside `onMount` has the same unbounded growth.

**3. Two of R8's five bullets are already delivered, and a third was withdrawn.**
- Bullet 4 — "Five dialogs copy the same 'focus after mount' timer … Extract a `focusAfterPaint(el)`
  helper" — is **done**. `core/utils/scheduling.ts:146` exports `focusAfterPaint`, EPIC-075 shipped
  it under R10.3, and all five named dialogs now call it under `this.own(...)`:
  `CreateBoardDialogView.ts:174`, `InputDialogView.ts:137`, `LibrarySetupDialogView.ts:158`,
  `PasswordDialogView.ts:162`, `CreateBoardVarsStorageDialogView.ts:138`. Zero `setTimeout` remains
  in any of them.
- Bullet 1 — the constructor-wide `postCreate` timer — the plan already marks as removed.
- Bullet 5 — re-entrancy at `PageTabsView.ts:167-176`, `OpenTabsListView.ts:116-119`,
  `ToolsEditorsPanelView.ts:79-81` — **EPIC-076 withdrew all three allegations.** `TOneState`
  dispatch is copy-on-write (`stateChanged()` does `this.listeners.forEach(...)`; both unsubscribe
  paths do `this.listeners = this.listeners.filter(...)`), so subscribing or unsubscribing mid-dispatch
  is already safe. `PageTabsView`'s subscription map was additionally rewritten in US-1199.

R8 is therefore not a strand any more. What survives is listed in US-1221 and is roughly a third of
what the plan describes.

**4. Most `{ all: true }` sites are already gated.** The plan lists `NotebookBodyView.ts:235`,
`LogBodyView.ts:138,159`, `LinksTilesView.ts:129,182` as full-repaint offenders. Four of those five
now sit behind a comparison: `NotebookBodyView.ts:228` (`if (cellsChanged)`), `LogBodyView.ts:132`
(`if (previous.showTimestamps !== next.showTimestamps)`), `LinksTilesView.ts:129`
(`if (widthChanged || columnsChanged)`), and `ListBoxView.ts:207` (`if (contentChanged)`) — and the
first three of those are exactly the "invalidates every cell for a real reason" case that statement 2
permits. The genuinely ungated set is smaller and different: `LinksTilesView.ts:182`,
`LogBodyView.ts:153`, `TreeView.ts:127,204`, `CategoryViewImpl.ts:379`, `FileSearchView.ts:73,143`.
**Do not convert from the plan's list.** Re-derive it.

**5. The `setTimeout(…, 0)` census is stale by more than half, and three of the survivors must not be
touched.** Not 23 in editors: **16 renderer-wide, 11 in editors**. Of the 16, three are correct
idioms rather than ordering hacks — `core/state/events.ts:28` (async rethrow so a listener error
reaches the host without breaking the dispatch loop), `scripting/ScriptContext.ts:113` (a deliberate
yield to the event loop, exposed to user scripts), and `editors/graph/GraphEditor.ts:629` (a
click-ordering guard resetting `isPopupOpen`). The actionable population is ~13, not 23+.

**6. "17 types-only files" is right for the class the plan means, and dangerous as a sweep
instruction.** There are **29** declaration-free `.ts` files in uikit. Seventeen match the class the
plan is describing — a `<Folder>/<Folder>.ts` holding only the component's props interface, the file
the React component used to live in. The other twelve include four **shared type modules that are
correctly shared**: `Tree/types.ts` (393 lines), `VirtualGrid/types.ts` (224), `ListBox/types.ts`
(186), `DataGrid/types.ts` (82). An agent told to "merge the types-only files into their `*View.ts`"
would fold a 393-line module consumed across a dozen files into one view. US-1217 must name its
targets explicitly rather than describe them.

**7. Two R7 citations are stale — both because Epic B already fixed them.**
- `MultiListBox/MultiListBoxModel.ts` — the plan calls it "6 memos + 4 two-line setters, no
  lifecycle (converts under R6, then collapses)". It now contains **zero** memos (US-1205 converted
  the chain to derive-on-write) and stands at 189 lines. The R6 half is delivered; whether it still
  *collapses* is now an open question rather than a foregone conclusion, and 189 lines of
  derive-on-write is not obviously a trivial split.
- `Popover/PopoverModel.ts:251` — "an explicitly empty `init() {}` (a vestigial `useEffect(()=>{},[])`
  slot)". It is no longer empty: `init()` at `:262` owns a resize cancel. The citation is dead.

**8. What did verify, unchanged.** So the plan is not uniformly stale — these were checked and hold:
`MinimapModel.ts:46-47,101-102` still mirrors via `contentMirror.innerHTML = scrollContainer.innerHTML`
inside a MutationObserver, in a model; `CategoryViewImpl.ts` still calls `replaceChildren`
unconditionally *before* its `projectionChanged` gate, and the second clause of the `else if`
(`this.lastProjection?.filteredItems !== state.filteredItems`) is indeed dead, subsumed by the
`projectionChanged` computation above it; all three R5 sites are exactly as described
(`LogViewEditor.updateEntryAt` produces over the whole `entries[]`, `NotebookEditor` has 21
`data.notes` producer sites, `GraphVisibilityModel.ts:124` still carries its "frozen by immer"
shallow-copy workaround); `FileList.ts:68-75`'s `setViewFocusHandlers`/`clearViewFocusHandlers`
inversion is intact; `ImageViewport.ts:34` still holds a model class in the component-name file with
a "not React" comment at `:148`; `CategoryViewModel.ts:103`'s `renderItems` render prop survives.

**9. The `{ all: true }` contract is already written down.** `uikit/VirtualGrid/types.ts:64` states
it ("`{ rows: [...] }` and never `{ all: true }`. Every performance claim this project makes…"), and
`VirtualGridModel.ts:34,358` repeats the reasoning. Statement 2 is enforcement of an existing
contract, not a new opinion — say so in the task docs, because it changes the burden of proof at
each site from "is this worth changing" to "why is this exempt".

---

## C-3 — What this epic deliberately includes, and what it should shed first

**R7 and R6-types do not serve the closing property.** They are file-shape and type-shape work.
They ride along for one reason, stated in EPIC-076 §B-3 when R6 was split: R7 opens the same ~40
uikit components that R6's type narrowing must edit, and opening them twice costs more than doing
both at once.

That reason is real but it is not load-bearing. **If this epic needs to be smaller, cut strand 2
(US-1217 through US-1220) into a follow-on epic.** Strand 1 closes statements 1–4 on its own;
strand 2 closes nothing and can be measured only as "the files are smaller", which is not a
property. Do not cut strand 1 to keep strand 2.

**Not in this epic:** R9 (comment and dependency sweep) stays standalone, as the plan has always
had it — it is a sweep with two code-review items embedded, and it does not want to be scheduled
behind fourteen refactors. R10 is fully delivered across Epics A and B.

---

## C-4 — Task breakdown

### Strand 1 — proportional work (closes statements 1–4)

**US-1208 — The `listen()`-on-update sweep, and Breadcrumb.**
Correction 2's finding first, because it is a leak and it may not be confined to Breadcrumb: find
every `this.listen(...)` reachable from an update or state-apply path, not just `onMount`. Each is
unbounded disposer growth. Then fix `BreadcrumbView` itself — `KeyedList` over segments, handlers
hoisted to fields per the Epic B convention. **Do not cite "focus loss" as the motivation**; it is
false and would make the acceptance criterion unverifiable.

**US-1209 — Minimap: move the mirror into the view.**
`MinimapModel` writes `innerHTML` and holds DOM. Move the mirroring to the view (statement 4) and
make it incremental — apply the MutationObserver records rather than re-serializing the pane
(statement 1). This is the epic's only site where both a correctness rule and a performance rule
point at the same code.

**US-1210 — `CategoryViewImpl`: hoist the rebuild behind its own gate.**
Move the unconditional `content.replaceChildren` / `tileScope.replaceChildren` pair inside the
`projectionChanged` branch, and delete the dead second clause of the `else if`. Verify what
re-inserting an already-present child actually costs here before claiming a win — `replaceChildren`
with the same node still detaches and re-inserts, which resets scroll in the virtualized grid
underneath, and *that* is the observable symptom to test against.

**US-1211 — The app-shell rebuild tail.**
`SecondaryViewsView.updateStack` (the two-pass "render, ref fires, render again") plus the sidebar
trio whose `onUpdate` calls an ungated `refresh()`: `BuiltinEditorsListView.ts:64-68`,
`TrustedBoardsListView.ts:67-68`, `ToolsEditorsPanelView.ts:85`. Note that these three already
subscribe to the settings key they care about — the `onUpdate → refresh()` arm is the redundant one.

**US-1212 — The editor rebuild tail.**
`storybook/PropertyEditor.ts` and `LivePreview.ts`, `tools-hub/SearchBoardsTab.ts`,
`mneme-config/RootsPanel.ts`, `link-editor/LinksTilesView.ts`, `mcp-inspector/PromptsPanel.ts`, and
`editors/git-tree/GitTreeEditorView.ts` (correction 1 — **not** `components/git-tree/`).

**US-1213 — Re-derive and fix the ungated `{ all: true }` sites.**
Correction 4: derive the list fresh, convert what knows its changed rows to `{ rows: [...] }`, and
leave a stated reason on each survivor. `uikit/CategoryList/CategoryListView.ts`'s ungated
`groupItems` pass belongs here too — same shape, different primitive.

**US-1214 / US-1215 / US-1216 — R5, one editor each.**
log-view (`entries[]`), notebook (21 `data.notes` producer sites), graph (drop the frozen-node
workaround once nodes stop passing through `produce`). The pattern is documented and two editors
already follow it, so these are the lowest-risk tasks in the epic. Note log-view already has
`dirtyIndices` + `flushDirtyDebounced`, so the repaint side is handled — only the immer pass is left,
which makes it the right pilot.

### Strand 2 — shape (closes nothing; cut first if needed)

**US-1217 — The dialog shell.** Lift the Escape handler into `TDialogModel`/`DialogView` once — it
is duplicated across at least twelve dialog files — then collapse the thin models it leaves behind.
Order matters: lift first, collapse second, or the collapse has nothing to collapse into.

**US-1218 — Merge the types-only component files.** The ~17 of correction 6, **named individually in
the task doc**, with the four shared `types.ts` modules named as explicit exclusions.

**US-1219 — R7 residue.** `FileList`'s `setViewFocusHandlers` inversion (merge model into view),
`ImageViewport` (model out of the component-name file; it also violates statement 4), and
`VirtualFlexGridModel`. Re-examine `MultiListBoxModel` and `PopoverModel` against correction 7
before assuming either still collapses.

**US-1220 — R6's type half.** Narrow the 26 `Omit<Native…>` contracts to what each component
actually accepts, then shrink `dom-props.ts`. This is the task that most wants the others done
first: every contract narrowed while a component is still being edited elsewhere is a merge conflict.

### Strand 3 — residue

**US-1221 — The timing residue.** The ~13 actionable `setTimeout(…, 0)` sites of correction 5, with
the three named exemptions left alone; the `revealVersion` force-update counters in
`ArchiveEditor.ts:147` and `ExplorerEditorModel.ts:216`; `TreeProviderViewModel.ts:735`'s
`await new Promise(r => setTimeout(r, 0))` justified by a now-false "Wait for React to re-render"
comment; and the untracked timers not cancelled on dispose. Rule to apply and to state in the doc:
**every deliberate deferral names what it waits for, or becomes a direct call.**

---

## C-5 — Risks

**The plan page is the wrong source for this epic's numbers.** This is the first-order risk and
correction 1 shows what it costs: a task doc written from the plan sends an agent to a path that
does not exist. Every task doc in this epic must re-derive its own site list from the current tree
and record the command it used. Epic B learned this; Epic C's areas are worse because Epics A and B
edited them.

**"Ungated rebuild" is not the same as "wasteful rebuild".** Correction 4 is the warning: four of
five cited `{ all: true }` sites are gated, and three of those gates guard changes that genuinely do
invalidate every cell. A conversion that mechanically replaces `{ all: true }` with `{ rows }`
without checking what changed will produce stale cells — a silent visual defect that typechecks,
lints, and builds. **The burden at each site is to name which rows changed. If that cannot be named,
the site is exempt and says why.**

**Statement 4 has a legitimate exception class.** "No model touches the DOM" is uikit Rule 9, but
`ImageViewportModel` holds mouse handlers and `MinimapModel` holds a MutationObserver because both
are measuring the DOM, not rendering it. Moving measurement into a view is right; moving it and
*also* changing when it runs is two changes. Do the move first, verify, then optimise.

**Immer removal changes freeze semantics.** R5's three editors currently receive frozen objects, and
downstream code may rely on that — `GraphVisibilityModel.ts:124` demonstrably does, in the opposite
direction. Taking a collection out of `produce` means consumers can now mutate what they used to be
unable to. Check each collection's readers before moving it, not after.

**Strand 2 has no failure signal.** File merges and type narrowing produce no runtime symptom when
wrong — they produce a compile error, or nothing. That is comfortable but it means `npm run
typecheck` passing is the *whole* verification, and a narrowed contract that silently drops a prop a
caller was passing through `applyRestProps` will typecheck and lose an attribute at runtime. Diff
the rendered attribute set on a sample of narrowed components.

---

## C-6 — Acceptance

Strand 1's four statements, each verified by a command recorded in the task doc rather than asserted:

1. No `replaceChildren` / `innerHTML =` / full rebuild reachable from an `onUpdate` or state-apply
   path without a visible comparison against the previous input. Survivors carry a stated reason.
2. Every `{ all: true }` either names the changed rows instead, or carries a comment saying why it
   invalidates everything.
3. `log-view`, `notebook`, and `graph` hold their collections as plain model fields with a version
   counter in state; `GraphVisibilityModel`'s frozen-node workaround is deleted.
4. No DOM references, listeners, or `innerHTML` writes in any `*Model.ts` under `uikit/`.

Plus, for strand 1's discovered work: no `this.listen(...)` reachable from an update path
(correction 2).

Strand 2 has no behavioural acceptance criterion by construction — see §C-3. Its criteria are
`typecheck` + `lint` + `build-prod` green, `dom-props.ts` smaller than 236 lines, and the four shared
`types.ts` modules untouched.

**Verification is by use, not by build.** Epic B's §B-7 records that a green build proved nothing
about the renderer three separate times, and that one "independent confirmation" was worthless
because both calls were wrong the same way. The areas this epic touches — breadcrumbs, minimaps,
tile views, the sidebar, three editors' data paths — are all directly exercisable. Exercise them,
and record what was *not* exercised rather than letting silence imply coverage.

---

## Notes

*(dated entries per task, added as work lands — same convention as EPIC-075 and EPIC-076)*

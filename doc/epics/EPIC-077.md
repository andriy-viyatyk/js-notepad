# EPIC-077 — Post-De-React Epic C: proportional work

**Status:** Completed 2026-08-30 — cut from [`de-react-refactoring.md`](../de-react-refactoring.md).
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

### 2026-08-30 — US-1214, log-view entries out of immer

Landed as planned. `entries` left `LogViewEditorState` for a plain model field; `entriesVersion`
replaced the array-identity gate at `LogBodyView.ts:131`, and `getEntryAt()` is the view's read
boundary. Seven plan corrections, of which two would have been defects:

- `push(...newEntries)` on a large parse batch throws `RangeError` past the engine's argument
  limit — a *new* failure the `[...s.entries, ...newEntries]` it replaced does not have. Now a loop.
- The returned entry becomes live. Today immer's autoFreeze deep-freezes what `addEntry` returns,
  so a caller *cannot* mutate it; afterwards a caller can, and the mutation lands in the collection
  with no version bump and no repaint. The nine external callers were checked; none does it. The
  ownership rule is now stated on the method.

Recorded and left alone: `clear()` does not clear `dirtyIndices`, and `flushDirtyDebounced`
survives the stale indices only through `if (!entry) continue`. Pre-existing, not this task's.

### 2026-08-30 — US-1215, notebook notes out of immer

Landed across `NotebookEditor.ts`, `NotebookBodyView.ts`, `index.ts`, and
`NotebookEditorFacade.ts`. Serialized notebook JSON is byte-identical for an unchanged document,
which was the task's highest risk.

The plan's first draft would have replaced the immer pass with an ID array in state plus a
`getNote(id)` lookup per rendered row — O(V·N) row rendering, in the epic whose closing property
forbids exactly that. Corrected to two plain model fields (`notes`, `filteredNotes`), scalars only
in state, array-index row access, and a `Map` for id lookup.

Freeze policy resolved for the epic, since two R5 tasks were about to answer it differently:
**shallow-freeze the note object, do not walk nested containers, copy at the public facade
boundary.** US-1214 does not freeze because log entries are append-mostly with one updater path;
notebook notes have seventeen interactive producers, where a loud throw beats silent staleness.

### 2026-08-30 — US-1216, graph nodes out of immer — *the epic was wrong about this one*

The task collapsed to a comment fix and a stale-list fix, and that is the correct outcome.

**The premise was false.** The graph's source nodes are already a plain field on `GraphDataModel`;
statement 3 was satisfied here before this epic was written. The only arrays inside immer state are
the bounded `selectedNodes` / `linkedNodes` selection snapshots, which are not the collection R5
means.

**The epic's acceptance criterion was worse than false — following it would have caused a
regression.** §C-4 and §C-6 both say to delete `GraphVisibilityModel`'s "frozen by immer"
workaround. It is not a workaround. The spread at `:124` is *how* `_$showIndex` and `_$hiddenCount`
are set without writing to the source node, and D3 then adds `x`/`y`/`vx`/`vy`/`index` to the
copies. Deleting it would have written view-derived and simulation fields into the nodes that get
serialized to disk. Only the comment was false; it now states the real reason.

One genuine defect found on the way: `GraphExpansionSettingsView` snapshotted `getAllNodes()` at
construction, so its root-node list went stale after add/delete/rename/reparse. Fixed narrowly. The
`nodesVersion` channel the plan proposed threading through every producer was cut — nothing needed it.

### 2026-08-30 — US-1208, the `listen()`-on-update sweep, and Breadcrumb

`VanillaView.listen()` now returns a release handle (via the existing private `ownReleasable`), a
source-compatible change since every prior caller ignored the return value. 18 sites converted:
3 by delegation, 4 by making the element stable, 11 by releasing the handle before the element is
removed. `BreadcrumbView` is a `KeyedList` with one delegated root click handler.

**The sweep's first draft was the dangerous artefact, not the leak.** It found 54 sites and
proposed converting 52 to event delegation. Thirty-four were pooled cells in `ListBoxView`,
`TreeView`, `LinksListView`, and `LinksTilesView`, where `installCellListeners` runs **once per
wrapper, never per render** — each file says so in a comment, `TreeView.ts:480-487` explains that
the drag gates sit inside the handlers precisely because a pooled wrapper outlives the row that
decided whether it could drag, and `ListBoxView.ts:71-73` records that `CellPool` bounds the
population at 2000. Converting them would have rewritten drag-and-drop to fix a leak that is not
there. They are now recorded as verified exemptions, because the next sweep will run the same grep.

One site had to be reinstated after that cut: `LinksListView.ts:386` genuinely leaks. Its
`syncActionButton` disable branch clears `record[key]`, so a later re-enable builds a new button and
registers a new listener; `LinksTilesView`'s equivalent caches the button and only detaches it.
Same problem, two files, one leaks — the asymmetry is now documented in both.

Breadcrumb's motivation is the disposer growth, never focus loss (§C-2 correction 2).

### 2026-08-30 — US-1210, CategoryViewImpl rebuild gate

The `replaceChildren` pair moved behind `projectionChanged || !itemsChainMounted`, and the dead
second clause of the `else if` is gone.

**The second half of that gate is not decoration.** Gating on `projectionChanged` alone ships a
blank list: `applyState()` replaces `content`'s children on the message arm (`:234`) and the empty
arm (`:246`), and neither `error` nor `loading` is part of the projection — deliberately, because
putting them in would restore the scroll reset this task removes. So an error set and then cleared
with `filteredItems` unchanged would leave the content host holding the error element with nothing
to re-attach the bridge. The flag records whether the chain is mounted; the invariant is that the
chain is re-established whenever it is not mounted, and otherwise only when the projection changed.

`:379`'s `{ all: true }` was deliberately left to US-1213.

### 2026-08-30 — US-1209, Minimap

Two changes, sequenced with a verification gate between them, as planned. `MinimapModel` now holds
no DOM — no element references, no `MutationObserver`, no listeners, no `innerHTML` — which closes
statement 4 for this component; the view owns all of it and passes the model numbers. The mirror
then became incremental: `MutationRecord`s are applied against a source→clone `WeakMap`, with a
full re-clone as the named fallback.

The fallback carries a DEV-only warning naming the record type and the reason the mapping failed.
Without it, a broken incremental path degrades silently to full rebuilds — correct output, green
build, story looks right, and the entire task delivers nothing. That is the failure mode this
component was most exposed to.

### 2026-08-30 — US-1213, the ungated `{ all: true }` sweep

Seven sites converted, six exempted with a stated reason each, four `VirtualGrid` internals left
alone as the primitive's own behaviour. The census also corrected the epic twice: `ListBoxView`'s
call is at `:213` not `:207`, `CategoryViewImpl`'s had moved to `:385`, and `TreeView.ts:166` was
missing from the epic's list entirely.

Two decisions worth keeping:

**The model publishes what changed, in state, next to the version counter.** The first plan used a
destructive `consume…()` side channel on the model. That is correct only while exactly one consumer
reads exactly once, and nothing in the code says so — the failure when it is violated is an empty
row set, a skipped repaint, and a stale cell with a green build. `LogViewEditor` now publishes a
`renderChange` alongside `entriesVersion` — an index array, a `{ from, to }` range, or an explicit
`"all"` sentinel — and `FileSearchModel` publishes `firstChangedRow`. A full parse publishes the
sentinel; a large index array never enters immer.

**Both carry a DEV-only assertion** when the version moved, the row count did not, and the change
set is empty. That is the producer-forgot-to-record bug, and removing `{ all: true }` removes the
safety net that used to hide it.

**The win is smaller than the epic implies, and the document says so.** `updateRenderInfo` touches
the *rendered* cells, which the virtualizer bounds by the viewport — not by the collection. So a
conversion turns O(viewport) into O(changed), not O(collection) into O(1). It is worth having on
paths that fire per progress tick or per arriving search batch; it is not the order-of-magnitude
claim the plan page suggested.

### 2026-08-30 — US-1211, the app-shell rebuild tail

`SecondaryViewsView`'s two-pass handshake is gone: `CollapsiblePanelStack` gained a
`childrenFactory` that receives the stack-created header, so the child is built once with the
element it needs instead of being rendered, told about the header by a ref, and rendered again.
Checked against `uikit/CLAUDE.md` before adding it, with `children` / `childrenFactory` precedence
defined rather than left to implementation order.

`BuiltinEditorsListView` and `TrustedBoardsListView` lost their `onUpdate → refresh()` arms
entirely; both already subscribe to the settings key they care about. This is safe for a reason
that needed writing down, because it is not obvious: both read `this.props.onClose?.()` at event
time, and `VanillaView.update()` stores `this.props` *before* calling `onUpdate` — so deleting the
override stops the redundant refresh without stopping new props from arriving.

`ToolsEditorsPanelView` was the one the epic misread. It does not need a gate; it already has one,
defeated by an unstable callback identity from `MainPageView`. Hoisting that callback to a field
made the existing gate work.

### 2026-08-30 — US-1212, the editor rebuild tail

Four of seven candidates survived verification. `PropertyEditor` and `LivePreview` are teardown and
arm-transition paths already behind gates; `LinksTilesView`'s rebuild is a lookup-map refresh behind
an identity check, and its only real problem is the `{ all: true }` at `:182`, which belongs to
US-1213. The document records that no whole-child-set rebuild symptom was verified there — which is
the honest result, and better than the epic's assumption.

The surviving four are fixed with signature gates, and the rule imposed on them is that the
signature must be exhaustive **by construction** — an explicit destructure of the rendered fields,
adjacent to the render it guards, covering every variant of a discriminated union. A signature that
omits a field does not waste work; it freezes the view at a stale render. That is a worse defect
than the one being fixed, and it is invisible to every automated check this project has.

### 2026-08-30 — US-1217, the dialog shell

Thirteen duplicated Escape handlers lifted into `DialogView`, four models collapsed, ten kept.

The lift did not move the listener: `DialogView` already listened on its own root and forwarded to
`props.onKeyDown`, so nested-dialog precedence and Monaco's Escape handling are untouched. What made
this task safe was the contract, written into the prop's doc comment rather than only into the
implementation: `onKeyDown` runs first, a `preventDefault()` from it suppresses `onEscape`, and
otherwise Escape invokes `onEscape`. Defining that removed `EditLinkDialog` from the exclusion list
— it honours `defaultPrevented`, which is exactly what the contract respects.

The per-dialog differences the investigation found are the reason this was not a mechanical sweep:
three dialogs resolve `false` on Escape rather than `undefined`, `PasswordDialogView` keeps its
input-level Enter submit while losing its input-level Escape, and `TextDialog` stays out for Monaco.

### 2026-08-30 — US-1219, R7 residue — three of four parts are "no work"

`FileList`: the epic's proposed model-into-view merge is **unavailable**. `MenuBarView` imports
`FileListModel` and calls `showSearch()` for Ctrl+F. The inversion was removed instead — the model
no longer holds view-supplied focus callbacks, `setViewFocusHandlers`/`clearViewFocusHandlers` are
gone, and the parent route now goes through a view command. A better fix than the merge would have
been.

`ImageViewport`: model moved out of the component-name file into `ImageViewportModel.ts`, DOM
ownership moved to the view, timing and frequency deliberately unchanged — §C-5's "do the move
first, verify, then optimise" applied literally.

`VirtualFlexGridModel` stays; there was no R7 complaint to find. `MultiListBoxModel` stays — 189
lines of derive-on-write after EPIC-076 removed its six memos is not a trivial split, and the plan
page's basis for splitting it no longer exists. `PopoverModel:251` is confirmed a dead citation.

This task also produced the epic's only task-boundary collision: US-1219 moves the `FileList` focus
call, US-1221 changes its timing, and both edit the same statement. US-1219 owns the move and
carries the deferral across unchanged; US-1221 lands second and owns the timing.

### 2026-08-30 — Statement 4's two survivors, and why they stay

A renderer-wide check after US-1209 leaves exactly two `*Model.ts` files under `uikit/` holding DOM:

- `VirtualGridModel` holds `grid` and `container` element refs. Both are *measured* — viewport size
  and scrollbar thickness — and the fields already carry comments saying so. This is the grid's
  core design, not residue.
- `PopoverModel` attaches three pointer listeners during a resize drag. They live only between
  pointerdown and lostpointercapture/pointerup, remove themselves, and `cancelResize()` tears down a
  session that never ended. A comment recording the exemption was added.

Both are §C-5's named exception class: measuring the DOM, not rendering it. **§C-6's criterion 4 is
therefore too absolute as written** — the right form is "no DOM in a uikit model except measurement
and pointer-capture sessions, each carrying a stated reason". No task owned this check; it fell out
of verifying the epic's own acceptance.

### 2026-08-30 — US-1221, the timing residue

23 zero-delay sites renderer-wide (13 in editors), not the 16/11 §C-2 correction 5 records — the
epic's figure came from a single-line pattern that misses `setTimeout(() => {` … `}, 0)` spanning
lines. Both commands are in the task document; the multi-line `-U` form is the one to reuse.

Outcome: 9 became direct calls, 4 became `focusAfterPaint`, 5 kept their deferral with a comment
naming what it waits for, 3 exemptions untouched. Plus 6 lifecycle fixes and one deleted lie.

**The focus conversions were the near-miss.** Three sites were to become direct `focus()` calls on
the evidence that the input was "already mounted". Mounted is not visible: `focus()` on a
disconnected element, or one inside a `display:none` subtree at that instant, is a silent no-op —
no error, nothing a build can see, and almost certainly why those timers existed. Re-examined
against visibility rather than mountedness, two of the three could not prove it and now use
`focusAfterPaint`; the third was proven and is a direct call.

`TreeProviderViewModel.revealItem`'s `await new Promise(r => setTimeout(r, 0))` is gone along with
its "Wait for React to re-render" comment — the provider loads publish synchronously, the props
pump is synchronous, and `scrollToRowAfterPaint` is the real paint-aware mechanism. Both
`revealVersion` counters stay: they are monotonic command tokens consumed by a secondary view, not
forced re-renders, and they now say so.

### 2026-08-30 — US-1218, the types-only merges

17 shells merged into their `*View.ts` and deleted. All six Keep-shared and six Keep-other files
untouched, including the four the epic named — `Tree/types.ts` (393 lines), `VirtualGrid/types.ts`,
`ListBox/types.ts`, `DataGrid/types.ts`.

The investigation found two exclusions beyond the epic's four (`RadioGroup.ts`, `Menu/types.ts`) and
drew a boundary the epic had not: a props file for a *nested* component in a multi-component folder
(`Tree/TreeItem.ts`, `Tree/SectionItem.ts`) is not the `<Folder>/<Folder>.ts` shell the converted
root component left behind, and stays. Stating that as one rule rather than twelve per-file
justifications is what stops the next sweep reaching a different answer.

The hazard checked before implementing: after the merge, a props-only importer points at a module
that imports the view class and its CSS, so a value import would link both into a consumer that
wanted a type. With `CLAUDE.md`'s code-splitting rule for editors, that is the one way this
"no behavioural change" task could have changed behaviour — invisibly to typecheck, lint and build.
The baseline turned out to be 56/56 already `import type`, so this became a property to preserve
rather than a defect to fix, and it is now an acceptance criterion.

### 2026-08-30 — US-1220, narrowing the native contracts

Five contracts narrowed from `Omit<Native…>` to explicit `Pick<…>` — `ButtonProps`,
`IconButtonProps`, `InputProps`, `CheckboxProps`, `PopoverProps` — and **21 excluded deliberately**.
The epic asked for all 26; §C-5 explains why five with full caller sweeps beats twenty-six on
inference. `PopoverProps` earned its place because `UrlSuggestionsDropdown` passes a native
`onMouseDown` that a mechanical narrowing would have dropped.

**§C-6's `dom-props.ts` criterion is wrong and should be replaced, not satisfied.** The file is 236
lines — exactly the §C-2 baseline, no drift. (An intermediate figure of 216 came from
`Measure-Object -Line`, which counts only non-empty lines; `wc -l` / `grep -c ""` give 236. Use
those for a line-count claim.) The criterion is therefore unmet, and it is also unmeetable by this
task: what lives in `dom-props.ts` is the shared native vocabulary, still consumed by the 21
contracts left alone. Forcing a deletion to get under a number would be gaming the metric. The
measurable outcomes are the five verified narrowings, the 21 unchanged exclusions, and the
attribute-set diff.

---

## Verification by use — cold start, 2026-08-30

§C-6 requires exercise rather than a green build, and records that Epic B was misled three times by
builds that proved nothing. The instance running before this epic dated from the previous
afternoon, so **the whole epic was verified against two cold starts**, not a hot-swap.

What was exercised and what it proves:

| Surface | Result |
|---|---|
| Cold start, 6 pages restored (video, notebook JSON, git tree, grid, storybook, browser) | Renderer alive; restore path intact |
| Log view — four entries appended, then a progress entry updated **by id** | Rendered, and the bar read `70 / 100` after the in-place update. This is the whole US-1214 + US-1213 chain: plain-field mutation → `entriesVersion` bump → point `renderChange` → `{ rows: [i] }` repaint. A wrong row set shows `10 / 100`. |
| Minimap on a fresh markdown document | 50 mirrored descendants with correct text, and **no DEV fallback warning** — the incremental `MutationRecord` path is applying, not silently re-cloning |
| Breadcrumb story — clicked a middle segment | Navigated correctly, and `children[0]` was the **same node object** before and after: `KeyedList` reuses DOM, so no rebuild, so no per-update `listen()` registration. This is US-1208's closing property, observed |
| Dialog story — opened, pressed Escape | Closed. US-1217's lifted handler works end to end |
| RadioGroup, Tag, PathInput, CollapsiblePanelStack stories | All render with content |

**Not exercised, and recorded as such:** US-1210's arm-restoration path (needs a provider that
errors and recovers with an unchanged projection — the case the `itemsChainMounted` flag exists
for); US-1221's deep-collapsed-subtree reveal; US-1212's four signature gates; US-1220's
attribute-set diff; US-1211's secondary-view panel transitions.

**One signal chased to ground.** The first cold start logged a single
`ResizeObserver loop completed with undelivered notifications` during six-page restore. It did not
recur while exercising any changed surface, and a **second cold start produced zero** — a startup
race, not a layout loop introduced here. Recorded because "we saw it once and it went away" is the
kind of thing that otherwise resurfaces as a mystery.

### 2026-08-30 — the completion pass, and what `/review` found

`/review` reported no code changes needed but raised five findings. All five were verified against
the source before acting, and all five were real. Three are attributable to this epic; two are not.

**1. `focusAfterPaint` selected without focusing — a live user-facing bug, shipped since EPIC-075.**
`scheduling.ts` read `if (select) select(); else focus();`, and `HTMLInputElement.select()` does not
move focus. Every caller passing `select: true` got text selected in an element that never received
focus: the user types and nothing happens until they click. Two callers pass it — the browser URL
bar (which US-1221 *newly* routed through this helper) and `InputDialogView`, which has behaved this
way since the helper was introduced. Now focuses first, then selects; `select` is documented as
additive.

This is the strongest argument in the epic for the helper-extraction discipline cutting both ways:
centralising the pattern in EPIC-075 also centralised the defect, and it took a task routing a new
caller through it to surface it.

**2. `MinimapView` ignored a changed `scrollContainer` — regression from US-1209.** The old
`MinimapModel` had a setter that rebound the listener and observer when the source element changed;
the converted view bound once in `onMount` and `onUpdate` ignored the prop. Latent, because
`MarkdownBodyView` passes a stable panel — but the contract regressed, and the plan review approved
the mount-time binding without asking whether the source could change. Now rebinds, using the
release handle US-1208 added.

**3. A stale favicon error wiped a newer favicon — regression from US-1208's shape (b).** One
reused `<img>` plus one stable `error` listener means a late error for a previous URL removes a
working favicon; the pre-conversion code built a fresh image per sync, so late errors hit a detached
element. `HTMLImageElement` carries no per-load token, so comparison guards do not close the race.
The site moved from shape **(b) to (c)**: fresh image per URL, listener registered with a release
handle, released when the image is replaced. US-1208's document records the reclassification.

**4. `BrowserTabsModel` could leak a `BrowserBookmarks` instance — pre-existing.** Both
`preloadBookmarks` and `initBookmarks` check `this.bookmarks` *before* their await, and the
lifecycle generation was bumped only on dispose. An explicit init landing during the constructor's
300 ms preload left both seeing `null`, both constructing, and the second assignment overwriting the
first without disposing it — a leaked file watcher, and possibly the preloaded path winning over the
requested one. `initBookmarks` now bumps the generation, and both paths dispose the loser.

**5. `CodeBlock.ts` non-null assertions** — real, replaced with explicit guards.

Verified after the fixes on a third cold start: the URL input ends focused *and* selected; the
minimap still mirrors correctly after the rebind change; zero console errors, zero minimap
fallbacks, zero `ResizeObserver` notices.

---

## Closing summary

All fourteen tasks landed. The four statements of §C-1 are closed, with two qualifications recorded
above: statement 3 was already satisfied for the graph before this epic began, and statement 4 has
two deliberate exemptions (`VirtualGridModel`, `PopoverModel`) that measure rather than render.

**Where the epic itself was wrong**, all four recorded in the notes above: US-1216's premise (nodes
already plain) and its acceptance criterion (deleting the `GraphVisibilityModel` copy would have
leaked D3 fields into saved graphs); US-1219's proposed `FileList` merge (unavailable —
`MenuBarView` consumes the model); §C-6's statement-4 criterion (too absolute); and §C-6's
`dom-props.ts` line-count criterion (unmet and unmeetable, and it should be replaced rather than
gamed). §C-2's `setTimeout` census was also low by a third, from a single-line grep.

**What the plan reviews caught before implementation**, in rough order of what they saved: a
54-site delegation rewrite of drag-and-drop for a leak that did not exist (US-1208, cut to 18); a
blank-list regression from gating on `projectionChanged` alone (US-1210); an O(V·N) row lookup
introduced by the fix for an O(N) immer pass (US-1215); two `focus()` conversions that could not
prove the element was visible (US-1221); and a `push(...spread)` that would throw `RangeError` on a
large log parse (US-1214).

### 2026-08-30 — post-close defect: switching editors blanked the page

Reported by the user after the epic closed. Switching any editor (monaco → grid, grid → monaco,
svg → monaco) emptied the main area, with
`Error: Cannot register a resource on a disposed VanillaView` thrown from
`NavPanelButtonView.rebindSubscriptions` (`PageToolbarView.ts:129`).

**Two independent defects, both latent and both in code this epic did not edit.**

*The trigger.* `PageModel.setMainEditor` calls `attach(newEditor)`, which bumps
`page.state.version` and dispatches. `NavPanelButtonView` subscribes to that exact selector. Early
in the dispatch a subscriber rebuilds the toolbar for the new main editor, disposing the old
`PageToolbarView` and with it its child `NavPanelButtonView`. But `TOneState.stateChanged` ran
`this.listeners.forEach(...)`, and unsubscribing *replaces* the array rather than mutating it — so
the just-retired listener was still called later in the same pass. `sync()` then reached
`ownSubscription()` on a disposed view, which is illegal by design.

*The amplifier, and the reason the page went blank rather than merely logging.* That throw escaped
`forEach`, abandoning every subscriber after it in the dispatch — including the one that mounts the
replacement editor. A single bad listener could blank the application.

**Fixed in `TOneState`, matching `Emitter.fire` in `core/state/events.ts`** — which already solved
both halves for the event path and is cited in the new comment, so this is an existing decision
applied to the state primitive rather than a new opinion. Listeners are now registrations with an
`active` flag: a listener retired during a dispatch is skipped, and each listener is invoked inside
a `try`/`catch` that rethrows asynchronously so the error still reaches the host unswallowed.

`VanillaView` gained a `protected isDisposed`, and `NavPanelButtonView.sync()` returns early when
disposed — second line of defence, because a parent can also call in. The gap it covers is real and
general: `bind()` guards its own callback, but a view subscribing through raw `state.subscribe`
retained with `ownSubscription()` has no such guard.

**Verified fixed by use.** On a cold start with the fix: eleven editor switches — seven
monaco to grid and back, four svg to monaco and back — with zero renderer errors, zero entries in
the main-process log, and the correct editor mounted every time. The reported symptom does not
reproduce.

**Attribution is unresolved.** Neither `state.ts` nor `PageToolbarView.ts` was edited by this epic,
and both defects are old — a listener called after being retired, and a throw that abandons the rest
of a dispatch. Whether this epic's changes perturbed listener ordering enough to expose them, or
whether the behaviour predates it, was **not** established. A baseline bisect was attempted (stash
the epic, cold start, switch editors) but the app restart it needed was denied, and the working tree
was restored immediately. Recorded as unknown rather than guessed at; the fix is correct either way,
since both defects are real independently of what surfaced them.

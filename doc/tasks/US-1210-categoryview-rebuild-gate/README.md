# US-1210 — CategoryViewImpl: hoist the rebuild behind its own gate

**Epic:** [EPIC-077](../../epics/EPIC-077.md) — Post-De-React Epic C: proportional work

## Goal

Stop CategoryViewImpl from detaching and re-inserting the active category-items subtree on an
update whose rendered projection is unchanged. Keep the existing projection-sensitive rendering
and repaint behavior, while preventing the unrelated-update scroll reset caused by moving the
virtualized grid subtree.

This document records investigation and implementation planning only. No implementation, tests,
test harnesses, or dashboard entry are part of this task-document phase.

## Background

### Verified current behavior

The relevant view is src/renderer/components/tree-provider/CategoryViewImpl.ts. It has no
applyProps() method; the repeatable view entry points are onUpdate() and the state binding into
applyState().
onMount() builds the static shell and binds a selected state projection to applyState() at
:110-155; onUpdate() pumps props into the model driver and immediately calls applyState() at
:158-161. applyState() updates the footer and then reaches reconcileItemsArm() for a nonempty,
non-error listing at :223-252.

At the current source lines :273-326, reconcileItemsArm() computes projectionChanged and then
unconditionally performs the subtree replacement at :287-292:

~~~ts
const projectionChanged = !this.lastProjection
    || this.lastProjection.filteredItems !== state.filteredItems
    || this.lastProjection.selectedHrefs !== state.selectedHrefs
    || this.lastProjection.dropTargetHref !== state.dropTargetHref
    || this.lastProjection.searchText !== state.searchText
    || this.lastProjection.selectedHref !== this.props.selectedHref
    || this.lastProjection.multiSelect !== this.props.multiSelect
    || this.lastProjection.provider !== this.props.provider
    || this.lastProjection.renderItems !== this.props.renderItems
    || this.lastViewMode !== viewMode;

if (isTileMode) {
    this.content.replaceChildren(this.tileScope);
    this.tileScope.replaceChildren(this.bridgeHost);
} else {
    this.content.replaceChildren(this.bridgeHost);
}
~~~

The same method only decides whether to call renderItems() after that replacement. Its existing
render branch is at :294-307; the else-if currently reads:

~~~ts
} else if (projectionChanged || this.lastProjection?.filteredItems !== state.filteredItems) {
~~~

The second clause is dead. projectionChanged already compares exactly the same identity pair at
:277:

~~~ts
this.lastProjection.filteredItems !== state.filteredItems
~~~

Therefore, when this.lastProjection?.filteredItems !== state.filteredItems is true,
projectionChanged is necessarily true as well. When this.lastProjection is absent, the first
term !this.lastProjection makes projectionChanged true. The after-shape is consequently an
else-if (projectionChanged) with no change to the other projection fields.

The projection gate is not by itself sufficient to preserve the DOM chain. applyState() has two
non-items arms that replace content independently of the projection: the message arm replaces
content with a loading/error message at :232-234, and the empty arm replaces it with an empty
placeholder at :241-248. Both paths first dispose the active bridge. A later content-arm pass can
therefore have an unchanged projection while the chain is absent. The implementation must track
that structural fact separately and re-establish the chain whenever it is not mounted.

### What the replaced subtree contains

The static shell creates content and tileScope as separate divs at CategoryViewImpl.ts:73-78;
buildStaticDom() appends only content to the view root at :170-198. bridgeHost is a
display: contents host at :175-177 and is the node that receives the renderer's returned
active-items view at :294-305.

src/renderer/editors/category/CategoryEditor.ts:358-410 is the only current implementation of
the renderItems callback supplied to this view (categoryViewProps() passes the stable callback at
:273-287). It returns:

- LinksListView.root in list mode. LinksListView creates a focus-scope root at
  src/renderer/editors/link-editor/LinksListView.ts:73-85, constructs a VirtualGridView at
  :121-150, and appends grid.root to that root on mount at :153-156.
- LinksTilesView.root in tile mode. Its root intentionally uses display: contents at
  src/renderer/editors/link-editor/LinksTilesView.ts:132-137; it constructs a VirtualGridView at
  :137-167 and appends grid.root on mount at :170-174.

The exact containment is therefore:

~~~text
list:  CategoryViewImpl.content → bridgeHost → LinksListView.root → VirtualGridView.root → scroll container
tiles: CategoryViewImpl.content → tileScope → bridgeHost → LinksTilesView.root → VirtualGridView.root → scroll container
~~~

The virtualized grid is inside the subtree replaced by content.replaceChildren(...) in both
modes. In tile mode the second replacement also moves bridgeHost between tileScope and its
current child; it does not remove the grid from the overall replaced subtree.

src/renderer/uikit/VirtualGrid/VirtualGridView.ts makes the final scroll boundary explicit:
scrollElement returns the private container at :215-225; buildDom() creates the data-part="scroll"
container at :352-357, nests the grid area at :359-401, and appends that container to
VirtualGridView.root. The grid stylesheet and view use the scroll container for the virtualized
viewport. The source also documents the key DOM fact at :621-635: append() on an already-present
node is a remove-plus-reinsert move, and moving a subtree hosting a complex embedded widget resets
its scroll container to the top.

### How the current scroll reset is reached

VanillaView.bind() applies the selected state immediately and subscribes to future selected values
at src/renderer/uikit/shared/vanilla-view.ts:247-266. The selector in
CategoryViewImpl.onMount() (:142-153) includes:

~~~text
filteredItems, selectedHrefs, dropTargetHref, searchText,
loading, error, items, dropOverView
~~~

State subscription uses selector comparison (src/renderer/core/state/state.ts:74-96), while the
plain onUpdate() path is unconditional once the view is mounted
(src/renderer/uikit/shared/vanilla-view.ts:84-97). Either path can therefore reach
applyState() and reconcileItemsArm().

The following source-backed updates can reach that path without changing the projectionChanged
inputs:

| Update | Source path | Why the projection is unchanged |
|---|---|---|
| Drag enters/leaves category whitespace | CategoryViewModel.onDragEnter() :509-520 or onDragLeave() :531-543 → setDragState() :499-507 → state dropOverView write :516-519 / :534-539 → bound applyState() | dropOverView is selected by the view, but is not one of the fields compared by projectionChanged. On a file provider that accepts the drag, this is a direct unrelated update while the item list remains the same. |
| Loading starts for a refresh while existing items remain visible | CategoryViewModel.loadItems() :243-245 → state.loading = true | loading is selected by bind(), but not compared by projectionChanged. The model deliberately keeps existing items on screen while loading (CategoryViewModel.ts:217-219). |
| Parent re-pumps equivalent category props | CategoryEditorView.ensureCategorySurface() :226-234 → CategoryViewImpl.update() → onUpdate() CategoryViewImpl.ts:158-161 | onUpdate() calls applyState() even when the provider, items, selection, callbacks, and view mode retain the same identities/values. The category path itself is not included in StateProjection; navigation eventually publishes new model items. |

CategoryViewModel produces the first two update classes concretely. loadItems() also publishes
the resulting items and filteredItems at :256-262, or an error/empty result at :264-269; those
latter changes normally alter the projection or switch the message arm and are not the unrelated
case. Selection changes (setSelection() at :282-285), search changes (setSearchText() at
:314-320), drop-target changes (:516-519, :534-541), provider/category navigation, and view-mode
changes do affect the projection and must continue to pass the gate.

The current reset trace for the whitespace case is:

~~~text
dragenter on CategoryViewImpl.root
  → CategoryViewImpl root listener calls model.onDragEnter(null, event) (:200-220)
  → CategoryViewModel writes only dropOverView (:516-519)
  → bind selector calls CategoryViewImpl.applyState()
  → reconcileItemsArm() sees projectionChanged === false after the first render
  → current content/tileScope replacement still moves bridgeHost / the grid subtree (:287-292)
  → VirtualGridView scroll container is reinserted and can reset to scrollTop 0
~~~

The VirtualGridView source is the concrete evidence for the browser operation and its effect; no
runtime test or implementation change is included in this planning task. The manual acceptance
exercise below uses this same update because it does not also change the item projection.

### All callers and update triggers

rg over the renderer found one direct caller of CategoryViewImpl:
src/renderer/editors/category/CategoryEditor.ts:229, inside
CategoryEditorView.ensureCategorySurface(). The category editor module is registered as
category-view by src/renderer/editors/register-editors.ts:176, and tree-category:// links
select that editor target in src/renderer/content/parsers.ts:113-123 and
src/renderer/editors/base/editor-matchers.ts:151-153. The async editor path mounts the
CategoryEditorView through src/renderer/editors/category/index.ts:10-23 and
src/renderer/ui/app/AsyncEditorView.ts:99-125; those are construction paths, not additional
CategoryViewImpl callers.

Once the direct child exists, CategoryEditorView can call its update() through these verified
paths:

| Caller/path | Trigger and resulting update |
|---|---|
| CategoryEditorView.syncSurface() :154-189 → ensureCategorySurface() :226-234 | Initial mount; CategoryEditorView.onUpdate() :129-133; the filePath binding :121-126; and the page version subscription :145-151 all converge here. It refreshes the category props whenever the matching page/tree-provider host is available. |
| syncViewModeLoad() :191-205 | The async folder view-mode lookup resolves; the callback sets viewMode and updates the category view at :202-204. A view-mode change is intentionally in projectionChanged and must continue to render and reset to row 0 through the existing :309-313 path. |
| applySelectedHref() :310-314 | The host editor selection subscription at :303-307 changes, or applies its current selection while rebinding. selectedHref is in projectionChanged; preserve this update. |
| handleViewModeChange() :316-322 | The category view mode menu changes the mode, immediately updates the child at :319-320, and persists the mode. This is an intentional projection change. |

The host used by syncSurface() is one of LinkEditor, ExplorerEditor, or ArchiveEditor, as checked
by isTreeProviderHost() at CategoryEditor.ts:44-49; it is selected by matching the category
link's provider type/source URL against page.panelEditors at :52-64. The renderer callback always
comes from CategoryEditorView.renderItems() and updates or replaces the retained
LinksListView / LinksTilesView at :379-409; it is not another CategoryViewImpl caller.

Within the child model, the state-update triggers that feed CategoryViewImpl.applyState() are:

- initial provider/category setup and loading (CategoryViewModel.setProps() :160-201);
- provider watch callbacks (:204-235) that call loadItems();
- loading/list/error publication (:243-269);
- row selection, keyboard selection, and context-menu selection through setSelection()
  (:282-285, with callers at :337-370, :382-401, and :622-633);
- search input (:314-320);
- drag-enter/drag-leave/drop state (:499-568);
- successful item operations that call the refresh callback (:705-728, :746-768, with
  src/renderer/components/tree-provider/item-crud-actions.ts:13-18, :20-45, :47-66, :68-90,
  and :92-112); and
- successful drops that reload at CategoryViewModel.ts:598-618.

### { all: true } ownership decision

CategoryViewImpl.flushPendingGridRepaintSoon() queues an ungated
this.gridModel.update({ all: true }) at src/renderer/components/tree-provider/CategoryViewImpl.ts:375-381,
currently line :379. This task does not change it. The epic assigns the fresh derivation and
fixing of ungated { all: true } sites to US-1213 (doc/epics/EPIC-077.md:219-221); US-1213
owns this site and must either derive a bounded row update or retain { all: true } with a
source-backed reason. The implementation of US-1210 must leave that work explicitly assigned to
US-1213, not silently leave it unowned and not mix its repaint-contract change into this subtree
gate.

## Implementation Plan

1. In src/renderer/components/tree-provider/CategoryViewImpl.ts, add an explicit
   itemsChainMounted field initialized to false. Set it to false in the message arm after
   content.replaceChildren(this.createMessage(...)) at :232-234 and in the empty arm after
   content.replaceChildren(empty) at :241-248. Preserve the existing projectionChanged
   comparison, including filteredItems, selectedHrefs, dropTargetHref, searchText, selected prop
   href, multiSelect, provider, renderer callback, and view mode identities. Keep the
   initial-render behavior by using the existing !this.lastProjection term.
2. Move the list/tile content.replaceChildren(...) and tileScope.replaceChildren(...) pair behind
   the structural gate projectionChanged || !this.itemsChainMounted. The branch must still
   establish content → bridgeHost for list mode and content → tileScope → bridgeHost for tile mode
   before the active renderer is used. Set itemsChainMounted = true immediately after this
   items-arm chain is established. Do not replace the bridgeHost.replaceChildren(rendered) logic
   or the bridge identity check unless required to preserve that exact initial, projection-change,
   and chain-restoration behavior.
3. Delete the redundant || this.lastProjection?.filteredItems !== state.filteredItems clause
   from the else-if at the current :300, leaving else-if (projectionChanged). Do not remove any
   other projection comparison or add dropOverView, loading, error, or items merely because they
   can cause applyState(); those fields are intentionally separated from the rendered projection
   by the existing design.
4. Preserve the existing view-mode transition behavior at :309-313, including
   gridModel?.scrollToRow(0). A deliberate view-mode change remains allowed to reposition the grid;
   this task only prevents the unconditional structural move when no projection input changed.
5. Leave flushPendingGridRepaintSoon() and its { all: true } call untouched. Record or review that
   line only as US-1213-owned scope; do not turn this task into the repaint sweep.
6. Re-read the final CategoryViewImpl.reconcileItemsArm() flow after editing and verify that
   initial render, empty/error/loading arms, list mode, tile mode, renderer replacement, provider
   changes, selection/search changes, and mode changes all retain their current behavior. No
   changes are planned in the renderer, grid, model, CSS, or registration files listed below.

### Before → after shape

Before, the DOM move is outside the projection gate and the fallback clause repeats a comparison
already contained in projectionChanged:

~~~ts
if (isTileMode) {
    this.content.replaceChildren(this.tileScope);
    this.tileScope.replaceChildren(this.bridgeHost);
} else {
    this.content.replaceChildren(this.bridgeHost);
}

if (!this.bridge) {
    // initial renderer creation
} else if (projectionChanged || this.lastProjection?.filteredItems !== state.filteredItems) {
    // projection renderer update
}
~~~

After, the node-moving pair is reachable when the projection changes or when a message/empty arm
has torn down the chain. The existing initial render remains covered because !this.lastProjection
makes the first projection changed:

~~~ts
if (projectionChanged || !this.itemsChainMounted) {
    if (isTileMode) {
        this.content.replaceChildren(this.tileScope);
        this.tileScope.replaceChildren(this.bridgeHost);
    } else {
        this.content.replaceChildren(this.bridgeHost);
    }
    this.itemsChainMounted = true;
}

if (!this.bridge) {
    // initial renderer creation, unchanged
} else if (projectionChanged) {
    // projection renderer update, unchanged apart from the dead clause removal
}
~~~

The implementer may combine the two gate branches if the final control flow is clearer, but the
observable invariant is fixed: the chain is re-established whenever it is not currently mounted,
and otherwise only when the projection changed. No renderer work or repaint behavior is
accidentally lost on a real projection change.

## Concerns

- Scroll is the correctness symptom. The gain is not only avoiding DOM work. The active
  VirtualGridView scroll container is a descendant of the moved node, and the grid source
  explicitly warns that moving a widget subtree resets its scroll. Manual verification must use a
  populated, scrollable category list and an update that changes only dropOverView (drag hover)
  or the transient loading flag, not only a screenshot of unchanged rows.
- The gate is intentionally narrower than the state selector. loading, error, items, and
  dropOverView can cause applyState() for message/footer/drop styling reasons, but they are not
  projection inputs. The task must not broaden StateProjection without a separate behavior
  decision. An item result that creates a new filteredItems array remains a real projection
  change and must render.
- Initial and arm-transition behavior must survive. disposeBridge() clears both bridge and
  lastProjection at CategoryViewImpl.ts:357-367; the initial !this.lastProjection term therefore
  remains the source-backed way to admit a fresh renderer. The additional itemsChainMounted flag
  must be cleared by the empty/message arms and set after the items chain is restored, so an
  unchanged projection cannot leave the list detached after an arm transition. Empty-list and
  message arms still call their own replaceChildren() operations in applyState(); this task
  concerns the list/tile pair in reconcileItemsArm() plus the structural bookkeeping needed to
  restore it.
- Selection and mode changes are intentional gates. selectedHrefs, selected prop href, drag target,
  search text, provider, renderer identity, and mode are all compared today. Keep those comparisons.
  The existing mode-change scrollToRow(0) is an explicit semantic reset and is not the accidental
  subtree-move symptom.
- US-1213 boundary. The ungated { all: true } at CategoryViewImpl.ts:379 is assigned to US-1213.
  Do not fix or duplicate that work in US-1210; the implementer should leave the line unchanged and
  the task handoff should mention the ownership explicitly.
- No automated test surface. Project guidance says this project does not use unit tests. Do not
  add tests or a test harness. Verification is source inspection plus the manual running-app
  exercise below.

## Acceptance Criteria

- [ ] In src/renderer/components/tree-provider/CategoryViewImpl.ts, both
  content.replaceChildren(...) / tileScope.replaceChildren(...) calls in reconcileItemsArm() are
  behind projectionChanged || !itemsChainMounted; an update with identical projection inputs does
  not move bridgeHost while the chain is mounted.
- [ ] The else-if condition contains only projectionChanged after the !this.bridge branch; the
  clause this.lastProjection?.filteredItems !== state.filteredItems is deleted and the final source
  still visibly compares lastProjection.filteredItems !== state.filteredItems while computing
  projectionChanged.
- [ ] Initial rendering still mounts the correct list/tile subtree, and projection changes still
  render updated items, update the bridge when the renderer returns a different node, schedule the
  existing repaint, and preserve the explicit view-mode scrollToRow(0) behavior.
- [ ] A human can exercise the running app as follows: open a writable local-folder category with
  enough rows to scroll; scroll the category list well below the top; begin dragging a file over
  whitespace in that category list without dropping it; observe the drop-active state/update and
  confirm the list remains at the same scroll position; move the pointer out and confirm it still
  remains there. If the provider does not accept file drag, trigger a refresh that first toggles
  loading while the old populated list remains visible and check the same scroll invariant.
- [ ] A human can separately exercise arm restoration: populate and scroll a category list; force
  the error arm (or a loading arm with no items), then clear the error/loading condition without
  changing the items projection; confirm the list and its virtualized grid come back instead of a
  blank content area. This verifies the structural flag after applyState() has replaced content
  with a message or empty placeholder.
- [ ] The manual check is performed in both list mode and, where available, a tile mode with a
  scrollable grid. The virtualized grid remains a descendant of the active category subtree and
  the unrelated update does not reset its scroll container.
- [ ] CategoryViewImpl.ts:375-381 remains unchanged for this task; the { all: true } sweep is
  recorded as US-1213-owned work and is not left unassigned.
- [ ] No implementation changes are made to CategoryViewModel, CategoryEditor, LinksListView,
  LinksTilesView, VirtualGridView, registration/parsing files, CSS, or other unrelated files. No
  tests, test harnesses, dashboard entry, commit, or unrelated documentation update is added.

## Files that need no changes in this task

| File / area | Reason |
|---|---|
| src/renderer/components/tree-provider/CategoryViewModel.ts | Its state and action paths are the verified callers of applyState(); no model behavior change is needed for this gate. |
| src/renderer/editors/category/CategoryEditor.ts | It is the sole direct caller/renderer owner; its prop and active-items lifecycle already provide the required identity and DOM trace. |
| src/renderer/editors/category/CategoryEditorModel.ts | Supplies category link state only; no CategoryViewImpl rebuild logic lives here. |
| src/renderer/editors/category/index.ts | Registers the existing category editor module; no construction change is required. |
| src/renderer/editors/register-editors.ts | Existing category-view registration is correct and is not part of the gate. |
| src/renderer/content/parsers.ts and src/renderer/editors/base/editor-matchers.ts | Existing tree-category:// routing already reaches the category editor; no route change is needed. |
| src/renderer/editors/link-editor/LinksList.ts | Props/type surface only; the list renderer remains the returned child. |
| src/renderer/editors/link-editor/LinksListView.ts | Owns the list grid and its internal incremental grid updates; only its containing subtree move is gated here. |
| src/renderer/editors/link-editor/LinksTiles.ts | Props/type surface only; the tile renderer remains the returned child. |
| src/renderer/editors/link-editor/LinksTilesView.ts | Owns the tile grid and its internal updates; no tile implementation change is needed. |
| src/renderer/uikit/VirtualGrid/VirtualGridView.ts | Its scroll-container and move/reset behavior are the verified reason for this task; the grid contract is not changed here. |
| src/renderer/uikit/VirtualGrid/VirtualGridModel.ts and src/renderer/uikit/VirtualGrid/types.ts | The grid repaint API, including { all: true } ownership, is outside this task and belongs to US-1213 where applicable. |
| src/renderer/uikit/shared/vanilla-view.ts and src/renderer/core/state/state.ts | Existing update and selector semantics explain the paths; neither shared primitive needs modification. |
| src/renderer/components/tree-provider/CategoryView.css | The shell layout and drop-active styling are unchanged. |
| src/renderer/components/tree-provider/item-crud-actions.ts | Its refresh callbacks are existing update triggers, not rebuild logic. |
| doc/epics/EPIC-077.md and doc/active-work.md | The epic already lists US-1210; the user explicitly requested no dashboard entry or epic edit. |
| Tests and test harnesses | This project does not use unit tests, and none is to be added for this task. |

## Files Changed summary

| File / area | Planned change |
|---|---|
| src/renderer/components/tree-provider/CategoryViewImpl.ts | Track whether the items chain is mounted, gate the content/tileScope subtree replacement behind projectionChanged || !itemsChainMounted, and remove the dead filtered-items clause; leave the { all: true } line untouched for US-1213. |
| doc/tasks/US-1210-categoryview-rebuild-gate/README.md | Record the source-verified DOM, update paths, scroll-reset mechanism, implementation plan, concerns, acceptance exercise, and no-change inventory. |

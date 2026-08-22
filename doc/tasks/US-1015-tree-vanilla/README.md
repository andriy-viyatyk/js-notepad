# US-1015: `Tree` — rows, DnD, keyboard, and the largest model in `uikit/`

Part of [EPIC-056](../../epics/EPIC-056.md) (De-React Epic C3). Follows
[US-1013](../US-1013-virtual-grid-engine/README.md) (the engine) and
[US-1014](../US-1014-listbox-vanilla/README.md) (the first data view on it).

**Status:** Implemented 2026-08-22.

Verification: `npx tsc --noEmit`, `npm run lint` and `git diff --check` clean; all acceptance greps
pass; six offscreen runtime probes green (arms and their attribute removals, state-driven repaint
with `aria-activedescendant` removed on a shortening collapse and rewritten on an in-range one, drag
`data-dragging`/`data-drop-active` through the funnel, chevron modes, click/keyboard/section paths,
zero-cell repaint on a no-op update, indent-vs-level audit clean across 10 hard scroll jumps in a
262-row mixed-depth tree, and `revealItem` landing the target inside the viewport). The
`scrollToRowAfterPaint` diagnosis was confirmed by measurement rather than by reading: the immediate
scroll clamps at 600px where 1020px is needed; the after-paint form reaches 1040px.

## Goal

Convert `Tree`, `TreeItem` and Tree's own `SectionItem` to vanilla views on the `VirtualGrid`
engine, deleting `TreeModel`'s two `effect()` calls and re-homing the three state-driven arms at the
methods that set them. `Tree` is the largest conversion in the programme and the first one whose
repaint is driven by reactive state rather than by props alone.

## Background

### The surface, measured

Measured 2026-08-22 against `upcoming-v4.0.23`.

| Item | Measure |
|---|---|
| Files in `uikit/Tree/` | 9, **2,624 lines** — `TreeModel.ts` 815, `Tree.story.tsx` 443, `types.ts` 369, `Tree.tsx` 345, `TreeItem.tsx` 294, `TreeDndModel.ts` 157, `TreeKeyboardHandler.ts` 115, `SectionItem.tsx` 75, `index.ts` 11 |
| `effect()` calls to delete | **2** — `TreeModel.ts:761` (repaint) and `:791` (scroll-on-`activeIndex`) |
| `this.memo()` calls that stay | **3** — `rows`, `indexByValue`, `selectedKey` |
| Reactive state fields | **5** — `expanded`, `loading`, `revision`, `draggingValue`, `dragOverValue` |
| State-write sites | **8** — `TreeModel.ts:438, 452, 465, 512, 580, 605, 741` and `TreeDndModel.ts:136` |
| `queueMicrotask` / `setTimeout(0)` deferrals | **10** (see D5) |
| Emotion importers to convert | **3** — `Tree.tsx`, `TreeItem.tsx`, `SectionItem.tsx` |
| `renderIcon` call sites to convert | **2**, both in `TreeItem.tsx` (chevron open/closed, leading icon) |
| App-layer `<Tree>` call sites | **6** — `TreeProviderView`, `BoardsTree`, `GitRefsView`, `NotebookCategoriesSecondaryView`, `RestClientShared`, `ToolsTree` |
| ...of which pass `renderItem` | **4** — `TreeProviderView`, `BoardsTree`, `RestClientShared`, `ToolsTree` |
| App-layer `<TreeItem>` call sites | **5** — four inside a `renderItem`, one standalone (`RestClientShared.tsx:569`) |
| Production consumers of `revealItem` | **2** — `ExplorerSecondaryView.tsx:65` and `ArchiveSecondaryView.tsx:24`, both through `TreeProviderViewModel.revealItem` |
| Production consumers of `loadChildren` / `onLoadError` / `getAncestorValues` | **0** — story only |
| Production call sites of `Tree.expandAll` | **0**. `collapseAll` has 2 |

**The `renderItem` majority is the headline difference from US-1014.** In `ListBox`, `renderItem`
was the minority path. Here four of six consumers use it, so after this task most Tree rows in the
app are still one retained React root per visible row — and the `TreeItem` inside them is a
`mountVanilla` shim, i.e. React → vanilla per row. That is the expected shape (those four files are
Epic D/E territory), but it means **a `Tree` measurement taken through `TreeProviderView` is not the
`Tree` number**, exactly as US-1014 warned about `MultiListBox`. Take the Rule 4 measurement from
`GitRefsView` or `NotebookCategoriesSecondaryView`, the two consumers on the default row path.

### Two CSS defects this conversion must preserve, not fix

Both measured in the running renderer with the declared styles, not inferred.

**1. The hierarchy guides paint nothing.** `Indent` in `TreeItem.tsx` sets `height: 100%`, but
nothing gives the row a definite height: `Root` is `display: inline-flex; width: 100%` with no
`height`, and it is an ordinary auto-height child of the engine's absolutely positioned cell
wrapper. So the percentage resolves against an indefinite height, `align-items: center` does not
stretch it, and the used height is **0px** — measured. `border-left: 1px solid border.light` is
therefore a zero-height border that draws no line, and the documented
`.tree-indent { border-left-color: transparent }` override for a selected row in a focused tree is a
**no-op**. Adding `height: 100%` to the row makes the indent 22px (also measured), i.e. switches
guide lines on in every tree in the app — boards, tools, git refs, notebook categories, rest client,
tree provider.

**2. Non-first indents are 17px wide, not 16.** `Indent` sets no `box-sizing` and there is no global
`border-box` reset in the renderer (`Root` sets it on itself, and the property does not inherit), so
a non-first indent is `16px` content plus a `1px` border = **17px** — measured. The leading gutter
for level *N* is `16 + 17 × (N − 1)`, not `16 × N`.

Neither is this task's to fix. Turning the guides on is a visual change to six editors in a commit
whose stated purpose is "no visual change", and it would make the review of a 2,600-line diff
unreadable. **Reproduce both exactly** — in particular, do not add `box-sizing: border-box` to the
new indent rule, however much it looks like hygiene. Both are recorded as follow-ups in the epic.

### What carries over unchanged

- **`TreeDndModel.ts` and `TreeKeyboardHandler.ts` are already framework-free.** Their `React.*`
  event parameter types are cosmetic: every member they touch (`preventDefault`, `stopPropagation`,
  `dataTransfer`, `key`, `ctrlKey`, `shiftKey`, `altKey`) exists on the native event, and
  `getTraitDragDataFromEvent` is already typed `React.DragEvent | DragEvent`
  (`core/traits/dnd.ts:88`). Retype the parameters to native events; no bridging, no `toPublicEvent`.
- **`core/traits/` DnD plumbing** — no React import anywhere in it.
- **`types.ts`** — the public prop interface does not change. `onContextMenu` and
  `onDragStartOverride` keep their `React.MouseEvent` / `React.DragEvent` signatures; those are the
  public API and Epic F owns API cleanup. Bridge at the boundary with `toPublicEvent`, as
  `ListBoxModel.ts:160` does.
- **The three memos** — `rows`, `indexByValue`, `selectedKey`. Memos are a cache, not a lifecycle
  hook (roadmap §3.2).

### Existing infrastructure to reuse

Everything this task needs already exists; it adds no new shared primitive except the indent helper
(D4) and one engine entry point (D6).

| Need | Use |
|---|---|
| Vanilla lifecycle | `uikit/shared/vanilla-view.ts` — `VanillaView<P>`, `own`/`listen`/`child`/`bind` |
| Model driver | `createComponentModelDriver` (`core/state/model.ts`). Pumps props **in its constructor**; `mount()` **throws** if the model registered any `effect()` |
| Props-change detection | `uikit/shared/deps-gate.ts` — `createDepsGate()`, fixed-length signature, `changed()` at most once per update |
| `useId` replacement | `uikit/shared/element-id.ts` — `nextElementId("tree")` |
| React-valued slots | `uikit/shared/fill-slot.ts` — `fillSlot(host, content)`, one React root reused per host |
| String label highlighting | `uikit/shared/highlight.ts` — `highlightInto(host, text, searchText)` |
| DOM icons | `uikit/shared/slots.ts` — `createIconElement(name)`, `isIconName(value)` |
| Tooltip | `attachTooltip(element, options)` from `uikit/Tooltip` — attach once, `update()` per row |
| Spinner | `uikit/Spinner/SpinnerView.tsx` — `new SpinnerView({ size: 12 })` |
| Residual props | `uikit/shared/react-compat.ts` — `applyRestProps`, `clearRestListeners`, `bindRef`, `toPublicEvent` |
| React shim | `uikit/shared/mount.tsx` — `mountVanilla(Ctor, props)` |
| The engine | `uikit/VirtualGrid` — `VirtualGridView`, `VirtualGridModel`, `RenderCellFunc`, `CellStyle` |

**The reference implementation is `uikit/ListBox/`.** `ListBoxView.ts` is the shell pattern (arms,
bound `renderCell`, pooled-cell records in a `WeakMap`, listeners installed once per wrapper, `inert`
flag), `ListItemView.ts` is the row pattern (stable `display: contents` slot hosts, `applyRestProps`
last), `ListItem.css` is the CSS pattern. Read all three before starting.

### Files that need NO changes

Do not investigate these.

- `src/renderer/uikit/Tree/types.ts` — public props unchanged.
- `src/renderer/uikit/Tree/index.ts` — the same names are exported; only their implementation moves.
- `src/renderer/uikit/index.ts` — barrel re-exports `./Tree`, unchanged.
- All six app-layer `<Tree>` call sites and all five `<TreeItem>` call sites. Roadmap Rule 2 and
  C3-5: **nothing changes a React call site.** `Tree` and `TreeItem` keep their React faces as
  `mountVanilla` shims with byte-identical prop interfaces.
- `src/renderer/core/traits/**` — no React, nothing to convert.
- `src/renderer/uikit/RenderGrid/**` — the React engine is untouched (C3-1 coexistence).
- `src/renderer/editors/storybook/storyRegistry.ts` — `treeStory` keeps its export name.
- `src/renderer/uikit/ListBox/**` — with the single exception in D6, step 12.
## Decisions

Each was put to an independent agent with no conversation context; the reasoning was then checked
against the code and the decision made here. Where this document departs from the advice it received,
it says so and why.

### D1 — A state change reaches the DOM through a funnel in the model, not a subscription

`TreeModel`'s repaint effect mixes a memo, seven props and three state slices. Props pump through the
view's `update()`; **state does not**. React papered over this with `model.state.use()` in
`Tree.tsx`, which re-rendered the whole component on any state write.

**Decision: no state subscription.** One private funnel in `TreeModel`:

```ts
/**
 * The only place in `Tree/` that writes state.
 *
 * A vanilla driver pumps props through the view's `update()`, so a state write reaches nothing on
 * its own — there is no re-render to re-evaluate anything. Every write therefore carries its own
 * consequence, and this is where it is carried. Do not call `this.state.update` anywhere else in
 * this folder; `grep "state.update" uikit/Tree/` must return exactly one hit.
 */
private mutate(updater: (s: TreeState) => void): void {
    this.state.update(updater);
    this.onStateApplied?.();
}
```

`onStateApplied` is a settable field registered by the host view alongside `setGridRef`.
`TreeDndModel` gets a narrow public entry (`tree.mutateState(updater)`) rather than reaching
`tree.state` across the object boundary. **The seven scattered `this.gridRef?.update({ all: true })`
lines are deleted** — the funnel owns that now, and `gridRef` goes back to being only a scroll handle.

**Why not a subscription.** Three reasons, all verified in the source:

1. `TOneState.update` dispatches **synchronously** — `produce` → assign → `listeners.forEach(l => l())`
   inline (`core/state/state.ts:66-74`). It is not a mirror of `state.use()`, which goes through
   `useSyncExternalStore` and therefore *schedules* and batches. A raw subscription would run the
   view's repaint work between `state.update(...)` and `props.onExpandChange?.(...)` in `toggleAt`.
2. Unsubscribe does `this.listeners = this.listeners.filter(...)` (`state.ts:149,155`) — it replaces
   the array, so an in-flight `forEach` iterates the **old** one and can invoke a listener removed
   during that same pass. A subscription would have to go through `VanillaView.bind`'s disposal
   guard, never a raw `state.subscribe`.
3. It is the masked-defect machine from [de-react.md §6.1](../../de-react.md). A subscription
   repaints on frequent user-driven state writes, so a prop missing from the repaint signature would
   appear broken *until the user expands a node*, then fix itself. The funnel's repaint fires only as
   a consequence of a mutation the model itself performed, so a props-path gap stays failed on the
   props path — loud, local, reproducible.

**The consequence is "re-run the render pass", not "repaint the cells".** This is the part plain
option (A) gets wrong. `aria-activedescendant` is state-derived twice over: the bounds check reads
`rows.length`, and `itemId(i)` is `${rootId}-item-${rows.value[i].value}` (`TreeModel.ts:91-94`). A
`collapseAll()` with `activeIndex = 50` shortens the row list, so the attribute must be *removed*;
even in-range, the row at that index is now a different node, so the id must be *rewritten*. A
grid-only repaint leaves the root pointing at an id no longer in the DOM. React got this free.

So the view's callback is:

```ts
private refresh = (): void => {
    if (this.inert) return;
    if (this.armFor(this.props) !== this.arm) {
        this.applyArm(this.props);
        return;
    }
    this.applyActiveDescendant(this.props);
    this.repaintGate.prime(this.model.repaintSignature());
    this.grid?.model.update({ all: true });
};
```

- `applyActiveDescendant` is **extracted** from `applyArm`'s real-arm branch and called from both, so
  there stays exactly one writer of that attribute.
- **`applyRestProps` is deliberately not on this path.** It removes and re-adds every `on*` listener
  on every call (`react-compat.ts:87-107`, verified). Rest props cannot have changed on a state
  write, and reinstalling the root's listeners during drag events is a hazard, not just churn.
- **Re-prime the gate**, in the view, not the funnel. Immer gives `expanded` a new identity, so
  `rows.value` is a new array and the next props pump — any pump — would otherwise report "changed"
  and repaint a second time. Priming here is safe precisely because the funnel just painted
  everything, so the gate and the DOM agree.
- The arm re-derivation is **insurance for an unreachable branch**. Proof it is unreachable today:
  `rows.push` is unconditional per source and only the recursion is gated on `isExpanded`
  (`TreeModel.ts:173,182`), so `rows.length >= sources.length` always, and `rows.length === 0` iff
  `props.items` is empty. Expansion, collapse and `collapseAll()` cannot empty the list, and
  `revision` is bumped only on a load resolve, which requires a live row. Keep the check anyway: the
  proof rests on "one row pushed per source", which dies the day `searchText` filters instead of
  highlighting. It costs one cached-memo read.

### D2 — The repaint signature has 13 fixed slots, and it is not the historical dep list

```ts
repaintSignature(): readonly unknown[] {
    return [
        this.rows.value,            // memo output — not derivable from props (expand/collapse)
        this.selectedKey.value,     // memo output — a normalised primitive key
        this.props.activeIndex,
        this.props.searchText,
        this.props.renderItem,
        this.props.indentSize,
        this.props.isSelected,
        this.props.getTooltip,
        this.props.id,              // feeds itemId() through rootId
        this.props.traitTypeId,     // the four DnD-gating props decide the wrapper's
        this.props.getDragData,     // `draggable` attribute and whether the drop
        this.props.acceptsDrop,     // listeners act
        this.props.onDragStartOverride,
    ];
}
```

Per the memo rule settled in US-1014: compare a memo's **output** when it genuinely derives
something. `rows` is not derivable from props at all — its identity is the only signal carrying
expand/collapse — and `selectedKey`'s output is a normalised primitive. Both are output comparisons.
**No state slice appears here**; state goes through D1's funnel.

Three departures from the historical dep list at `TreeModel.ts:765-779`, all applications of
US-1014's correction that the signature must list every input a cell actually *reads*:

- **Dropped `rowHeight`** — passed to the engine as a prop, which compares it in `inputChanged()`.
- **Dropped `getContextMenu`** — read at event time in `onItemContextMenu`, never by `renderCell`.
  It changes no cell DOM.
- **Added `props.id` and the four DnD-gating props** — all five are read on the cell path and were
  absent from the effect, which never mattered while React repainted unconditionally on every parent
  render.

`ListBox` has the same `props.id` gap. It is pathological only — a component changing its own DOM id
mid-life — so it is recorded in the epic rather than fixed here.

### D3 — `selection-style.ts` dies by relocation into its last consumer

C3-7 says the module "becomes CSS and is deleted" because "all three of its consumers (`ListItem`,
`Tree`, `TreeItem`) are in this epic". That premise was wrong twice: `ListItem` already stopped
importing it (US-1014 hand-copied its rules into `ListItem.css`), and there is a **fourth** consumer
C3-7 did not count — `ui/sidebar/FolderItem.tsx`, which is app-layer and belongs to Epic D.

After this task converts `Tree` and `TreeItem`, the module's state is:

| Export | Used by, after this task |
|---|---|
| `rowSelectionBase` | `FolderItem.tsx:26` only |
| `rowFocusSelectionOverride` | `FolderItem.tsx:30` only |
| `focusSelectionOverride` | **nobody** — `Tree.tsx:41` was its only consumer |

**Decision: inline the two surviving fragments verbatim into `FolderItem.tsx`'s own `Root` block,
delete `focusSelectionOverride`, and delete the module.** This is not a conversion of `FolderItem` —
it stays Emotion, stays unlayered, and the emitted CSS is byte-identical because the same `CSSObject`
literals land at the same position in the same styled block. What it buys: `uikit/shared/` ends up
Emotion-free as C3-7 intended, a `ui/` → `uikit/shared` internal import disappears, and the epic
ledger becomes true instead of needing an amendment that admits the premise was miscounted.

The considered alternative was to leave the module alive for `FolderItem` and let Epic D delete it.
Rejected because it leaves an Emotion file in `uikit/shared/` whose only reason to exist is one
app-layer file two epics away, and it depends on a marker surviving months of edits.

**The finding that matters more than the scope call, and is adopted regardless:** the translated
container rule must keep a `[data-type="tree"]` anchor. `focusSelectionOverride('[data-type="tree-item"]')`
compiles today to `.css-hash[data-focus-selection]:focus-within [data-type="tree-item"][data-selected]`
— anchored to *this* Tree's generated class. Translated naively to a bare
`[data-focus-selection]:focus-within [data-type="tree-item"]…` it becomes a global rule that paints
any `TreeItem` under any opted-in container, including a `TreeItem` rendered inside a `ListBox`'s
`renderItem` — a pattern this codebase actually uses (`MenuBar.tsx` renders `FolderItem` exactly that
way). This is C3-8's selector-depth guard, and this is the one place in the task where the
Emotion-class → layer-rule widening bites.

One note for whoever converts `FolderItem` in Epic D, discovered here: it currently wins by
**origin**, not specificity — unlayered Emotion beats every `@layer` rule regardless of selector
weight — so its stylesheet must land in `@layer app` (declared in `theme/style-layers.css`, and
currently used by no file), never in `@layer uikit`, where source order against `ListItem.css` would
decide the outcome.

### D4 — Indents stay real elements, with an explicit `data-first` marker and a shared helper

The alternative considered was replacing the N indent elements with one `repeating-linear-gradient`.
Rejected on fidelity: a gradient paints its own box, and to be pixel-identical to today it would
have to paint a **0-height** strip (see the measured defect above) — its only route to looking like
anything is to also fix the height, which is the app-wide visual change this task must not make. It
also cannot express "first step 16px, remaining steps 17px" in one period, still needs a per-row
inline value for the total width, needs level 0 handled as `display: none` rather than zero width
(or the row's `gap` inserts 2px that is not there today), and renders a 1px stop worse than a 1px
border at the 125%/150% display scaling this app runs at.

**Decision: keep them as sibling elements**, held in a private `HTMLDivElement[]` on the view, grown
with `insertBefore(el, firstStableHost)` and shrunk with `remove()` plus array truncation, inline
width written only when `indentSize` actually changed.

- **Select the guides with `[data-part="tree-indent"]:not([data-first])`, not `:first-of-type`.**
  `:first-of-type` filters by element *name* among siblings and ignores the attribute filter attached
  to it, and `ChevronStub` is also a `div` — so at level 0, `div:first-of-type` matches the stub. It
  is correct today only by accident, and it silently deletes one guide from every row the first time
  someone puts an element at the head of the row. The marker is order-free and set once at creation.
- **Keep `class="tree-indent"` as well.** It is the hook `uikit/CLAUDE.md` documents and the one the
  selected-state override targets.
- **Never `replaceChildren()` on the row root.** `fillSlot` keys its state in a module-level
  `WeakMap<HTMLElement, ActiveSlot>` and the view holds hard references to its slot hosts, so the
  cache survives detachment: the next `setIcon`/`setLabel` would render into a **detached** host with
  no error, producing a row with correct height, correct background, working handlers and **no
  content** — the "blank primitive is a content bug, not a CSS bug" trap. It would also leave React
  roots mounted on detached trees, and kill the chevron's `click` listener while row-level handlers
  (which live on the cell wrapper) keep working, so the symptom reads as "chevron bug".
- **Share the logic, not by copy.** `SectionItem` renders byte-identical indent children. Put the
  helper in `uikit/Tree/tree-indents.ts` with a co-located `tree-indents.css` that the helper module
  itself imports, so "forgot to import the borrowed CSS" is structurally impossible. This is a
  defensible deviation from one-stylesheet-per-component because it is a shared sub-part. It is safe
  here — unlike `ListItem`, where C3-7 rejected a shared stylesheet — because `TreeItem`'s
  selected-state override is far more specific than the base rule, so there is **no source-order
  dependency** between the two files. Keep that override in `TreeItem.css`.
- `VanillaView`'s append-only `children` array is about owned child *views*; the indents are plain
  elements the view owns in an array, deliberately not child views, because a child view could not be
  released on shrink.

Cost is not a factor either way: ~2.3 ms to rebuild all 240 indents at 40 rows × level 6 against a
16 ms frame, ~0.1 ms in the grow/shrink-to-fit steady state, and `indentSize` is never passed by any
consumer in `ui/`, `editors/` or `components/` — it is always the default 16, so the width write is a
guarded no-op.

### D5 — Nine deferrals are deleted, one is changed, and the one that is changed is the risky one

Ten `queueMicrotask` / `setTimeout(0)` sites. C3-6's rule is that this class of deferral is a React
workaround that evaporates under a vanilla driver — true for nine of them. The tenth is not a React
workaround at all, and deleting it under the blanket rule would introduce a silent bug.

| # | Site | Action | Why |
|---|---|---|---|
| A | `runLoadAndExpand` pre-load (`:436`) | Delete | Callers are clicks, keys, timers — never a pump. Also **fixes** a real bug: the microtask makes `toggleAt`'s `loading` guard read a stale map, so two `toggleAt`s in one task both start a load |
| B | `runLoadAndExpand` reject (`:450`) | Delete, **and hoist `onLoadError` above the unwrapped block** | The only genuine callback reorder in the task: today `onLoadError` fires before the queued `onExpandChange(v,false)`. Hoisting keeps the observable order byte-identical, for free |
| C | `runLoadAndExpand` resolve (`:463`) | Delete | Already past an `await`; fires no consumer callback |
| D | `toggleAt` (`:510`) | Delete | The comment's own justification names React's render phase; a vanilla-driven model registers no effects at all. The write still precedes `onExpandChange`, so `TreeProviderViewModel.pruneSelectionToVisible()` still reads a fresh `getExpandedMap()`. `toggleAt` is the **last statement in every caller**, so nothing that ran before the callback now runs after it |
| E | `expandAll` (`:578`) | Delete | Story-only caller; fires no callback |
| F | `collapseAll` (`:603`) | Delete | Click-handler callers; fires no callback. The consumer's own `setTimeout(0)` re-expand of the root is unaffected |
| G | `revealItem` in-loop `setTimeout(0)` (`:710`) | Delete | Pure consequence of D — it existed to wait out `toggleAt`'s microtask. `memo()` is lazy and pull-based, so `rows.value` and `indexByValue.value` are fresh on the next line after a synchronous write |
| H | `expandAncestorsThenScroll` microtask (`:736`) | Delete | Same class as D |
| I | `expandAncestorsThenScroll` `setTimeout(resolve, 0)` (`:745`) | **Change — never delete** | See below |
| J | `TreeDndModel.update()` (`:133`) | Delete the wrapper, and route it through D1's funnel | Native drag events only. `dragenter` on the new row fires **before** `dragleave` on the old, so `onDragLeave`'s guard is unaffected by the schedule change. This is the site that had **no** repaint of its own and relied entirely on the deleted effect — the funnel is what fixes it |

**Site I is the riskiest item in the task**, and it is dangerous precisely because it sits next to H,
which *is* a React workaround. It is not waiting for data — after a synchronous `state.update`,
`indexByValue.value` is already fresh. It is waiting for the **scroll extent**, and that has moved:
`applyLayout` writes `area.style.height` inside `paint()`, which runs on `requestAnimationFrame`
(`VirtualGridView.ts:325,370` — verified). A `setTimeout(0)` macrotask lands after the microtask that
recomputes `renderInfo` but generally **before** the frame, so `scrollToRow`'s `container.scrollTop`
write is clamped to the stale extent. Revealing a deep item whose ancestors' expansion extends the
list past the old extent scrolls to a wrong position, with nothing re-issuing it. And `scrollToRow`'s
existing safety net does not catch it: `pendingScrollRow` is only taken when `!measured`, and the
grid *is* measured here.

This is the third time in this epic that guessing when the paint happened has produced a bug — see
US-1013's two entries in the epic notes — so D6 pays for the fix in the engine instead of guessing a
fourth time.

**No deferral can be left for a later task.** `createComponentModelDriver.mount()` throws if the
model registered any `effect()`, so `TreeModel.ts:761` and `:791` must go on day one; re-homing
:761's state-driven arms means opening every one of these bodies anyway. Leaving a `queueMicrotask`
inside a body being rewritten is *more* delta than removing it, and it would leave a comment
asserting a React render phase that no longer exists.

### D6 — The engine grows one public entry point: scroll after the next paint

`VirtualGridModel` already has the mechanism — a one-slot, last-wins `pendingScrollRow` flushed at
the **end** of `paint()`, after `applyLayout` has written the extent. It is currently reachable only
as `scrollToRow`'s unmeasured fallback. Expose it:

```ts
/**
 * Queue a scroll for the end of the next paint.
 *
 * Use this when the caller has just changed the row set: `scrollTop` is clamped to the scrollable
 * extent, and the extent is written by `applyLayout` **inside** the next paint. Scrolling before
 * that frame silently clamps to the old extent. `scrollToRow` is still the right call when the row
 * set has not changed — it is one frame faster, which keyboard navigation can feel.
 *
 * One slot, last-wins, same as the unmeasured fallback it shares.
 */
scrollToRowAfterPaint(row: number, rowAlign: RowAlign = "nearest"): void {
    if (this._disposed) return;
    this.pendingScrollRow = { row, align: rowAlign };
}
```

The caller must have scheduled a paint, which `update({ all: true })` always does.
`expandAncestorsThenScroll` then loses both awaits and becomes synchronous plus one queued scroll.
`revealItem` keeps its `async` signature and its `Promise<void>` return — both production callers
`void` it — but its contract changes from "returns when the row is visible" to "returns when the
scroll is queued". Document that on the method.

**`scrollToRow` stays the call** on the paths that change no rows: `revealItem`'s fast path 1
(already visible, ancestors already expanded), `scrollToItem`, and `TreeKeyboardHandler`'s `apply()`.

**One same-class fix in `ListBox`, deliberately in scope.** `ListBoxView.onUpdate` requests
`update({ all: true })` and then calls `syncActiveScroll` → `scrollToRow` in the same turn, so a list
whose items grew *and* whose `activeIndex` jumped past the old extent in one update has exactly the
bug described above. Mount is already safe (the grid is unmeasured, so the pending slot catches it);
a live update is not. Fix: use `scrollToRowAfterPaint` when the repaint gate reported changed, and
`scrollToRow` otherwise, so keyboard nav keeps its immediate scroll. This is one line plus a comment
in a file US-1014 owns, and it is cheaper than a note that ages. Flag it for the user's testing.

### D7 — `TreeItem` and `SectionItem` keep React faces; `Tree` gets one too

All three become `mountVanilla` shims (C3-5: nothing changes a React call site). `TreeItem`'s shim is
load-bearing, not vestigial — five app-layer call sites render it directly. `Tree`'s shim keeps its
generic cast:

```ts
export const Tree = TreeShim as <T = ITreeItem>(props: TreeProps<T>) => React.ReactElement | null;
```

`index.ts` keeps exporting `SectionItem as TreeSectionItem`, so the file name stays `SectionItem.tsx`
(shim) alongside `SectionItemView.ts`, mirroring `ListBox/`.

### D8 — `setReactId` becomes `setElementId`, from one shared counter

C3-5: `nextElementId("tree")` replaces `useId`. `rootId` stays `this.props.id ?? this._elementId`.
Note the shape difference from React: the old fallback was `` `tree-${reactId}` `` and
`nextElementId` already returns a prefixed id, so do not double-prefix. `itemId` keeps its
`` `${rootId}-item-${row.value}` `` form, which is what `aria-activedescendant` resolves against.
## Implementation plan

Order matters: the engine entry point first (D6 is needed by step 8), then the leaf row views, then
the shell, then the model, then the shims, then the CSS cleanup.

### Step 1 — Engine: `scrollToRowAfterPaint`

**File:** `src/renderer/uikit/VirtualGrid/VirtualGridModel.ts`

Add the public method from D6 next to `scrollToRow`. It writes the existing
`private pendingScrollRow?: { row: number; align: RowAlign }` slot, which `flushPendingScroll()`
already drains at the end of `VirtualGridView.paint()` (line 393, after `applyLayout` at 370).
No other engine change. Nothing to export — `VirtualGridModel` is already exported from
`uikit/VirtualGrid/index.ts`.

### Step 2 — Shared indent helper

**New file:** `src/renderer/uikit/Tree/tree-indents.ts`

```ts
import "./tree-indents.css";

const defaultIndentSize = 16;

/**
 * The level guides at the head of a tree row, shared by `TreeItemView` and `SectionItemView`.
 *
 * Owns a plain element array, not child views: a `VanillaView`'s `children` array is append-only,
 * so a child view could never be released when a recycled row's level shrinks.
 *
 * Rows are recycled, so `level` changes under a live instance. Grow and shrink in place — never
 * rebuild, and never touch the row root's child list wholesale (see the class doc on
 * `TreeItemView` for what that breaks).
 */
export class TreeIndents {
    private readonly elements: HTMLDivElement[] = [];
    private appliedSize: number | undefined;

    /** @param anchor the first stable element after the indents; new indents insert before it. */
    constructor(
        private readonly host: HTMLElement,
        private readonly anchor: HTMLElement,
        private readonly extraClassName?: string,
    ) {}

    sync(level: number, indentSize: number = defaultIndentSize): void {
        while (this.elements.length > level) {
            this.elements.pop()?.remove();
        }
        while (this.elements.length < level) {
            const element = document.createElement("div");
            element.dataset.part = "tree-indent";
            if (this.elements.length === 0) element.dataset.first = "";
            if (this.extraClassName) element.className = this.extraClassName;
            element.style.width = `${indentSize}px`;
            this.host.insertBefore(element, this.anchor);
            this.elements.push(element);
        }
        // `indentSize` is never passed by any consumer today, so this is normally a no-op.
        if (indentSize !== this.appliedSize) {
            this.appliedSize = indentSize;
            for (const element of this.elements) element.style.width = `${indentSize}px`;
        }
    }
}
```

**New file:** `src/renderer/uikit/Tree/tree-indents.css`

```css
/*
 * Level guides. Two properties of the Emotion original are reproduced deliberately and must not be
 * "tidied":
 *
 * 1. NO `box-sizing`. The original set none and there is no global border-box reset in the renderer,
 *    so a non-first indent is 16px of content plus a 1px border = 17px, and the gutter for level N
 *    is 16 + 17 × (N − 1). Adding border-box shifts every nested label one pixel per level.
 * 2. `height: 100%` against the row's indefinite height resolves to 0, so the border draws nothing
 *    today. Reproduced as-is — giving the row a definite height would switch guide lines on in six
 *    editors, which is a design change, not a conversion. See the epic's follow-up list.
 *
 * `:not([data-first])` rather than `:not(:first-of-type)`: `:first-of-type` filters by element name
 * and ignores the attribute filter, and the chevron stub is also a `div`.
 */
@layer uikit {
    [data-part="tree-indent"] {
        height: 100%;
        flex-shrink: 0;
    }

    [data-part="tree-indent"]:not([data-first]) {
        border-left: 1px solid var(--color-border-light, transparent);
    }
}
```

### Step 3 — `TreeItemView`

**New file:** `src/renderer/uikit/Tree/TreeItemView.ts`, modelled on
`uikit/ListBox/ListItemView.ts`.

DOM built once in `onMount`, in this order — the indents insert **before** `chevronHost`:

| Element | Notes |
|---|---|
| `chevronHost` | `<span data-part="chevron">`, `display: contents`. The three-way branch (spinner / chevron button / stub) is rebuilt inside it, so it is the indents' insertion anchor and must exist before any indent |
| `iconHost` | `<span class="tree-icon">` — a real box in the React DOM, so **not** `display: contents`; it carries its own flex rules. Written through `fillSlot` |
| `labelHost` | `<span class="label">` — `highlightInto` for a string, `fillSlot` otherwise, with the same `labelOwner` guard as `ListItemView` |
| `trailingHost` | `<span class="tree-trailing">` — a real box in the React DOM too. Written through `fillSlot`; React rendered it **only when `trailing != null`**, so toggle `hidden`/removal to match rather than leaving an empty box in the flex flow |

Root attributes, all written in both directions:

```
data-type="tree-item"                    always
data-name                                setAttr(name)
id                                       setAttr(id)
data-state                               "open" | "closed"  (always present)
data-selected / data-active / data-dragging / data-drop-active / data-loading / data-disabled
                                         toggleAttr(bool)
data-trailing-visibility                 "always" | "hover"  (always present, default "always")
role="treeitem"                          always
aria-selected                            "true" | "false"
aria-expanded                            "true"/"false" when hasChildren, else REMOVED
aria-level                               String(level + 1)
aria-disabled                            "true" when disabled, else REMOVED
```

Then `applyRestProps(root, rest, state)` **last**, matching the JSX spread order.

The chevron area, transcribed from `TreeItem.tsx:246-262`:

```ts
private setChevron(props: TreeItemProps): void {
    const { hideChevron, loading, hasChildren, expanded } = props;
    const mode: "none" | "spinner" | "chevron" | "stub" =
        hideChevron ? "none" : loading ? "spinner" : hasChildren ? "chevron" : "stub";
    if (mode === this.chevronMode) {
        // Only the chevron's own icon and label can change without a mode change.
        if (mode === "chevron") this.updateChevronIcon(expanded);
        return;
    }
    // ...tear down the previous mode (dispose the SpinnerView, drop the click listener), build the
    // new one. The click listener is installed on the button when the button is created.
    }
```

- Chevron: `<button class="tree-chevron" type="button" tabindex="-1">`, `aria-label` `"Collapse"` /
  `"Expand"`, child `createIconElement(expanded ? "chevron-down" : "chevron-right")`.
- Stub: `<div data-part="chevron-stub">`.
- Spinner: `<div data-part="chevron-stub" aria-label="Loading">` containing
  `new SpinnerView({ size: 12 })`. Dispose the `SpinnerView` on mode change and in `onDispose`.
- `onChevronClick` is called through a stored `props.onChevronClick` read at event time, so a
  recycled row's stale closure is never used.

Icon: same two-arm rule as `ListItemView.setIcon` — a **string is always an icon-name attempt**,
`isIconName(icon) ? createIconElement(icon) : null`, never falling through to `fillSlot`'s string arm
(React's `renderIcon` returned `null` for an unknown name; falling through would print the name as
text). React rendered `{icon && <span className="tree-icon">…}`, so the host is present only when
`icon` is truthy.

Tooltip: `attachTooltip(this.root, this.tooltipOptions(props))` once in `onMount`, `update()` in
`onUpdate`. `TreeItemProps.tooltip` is `SlotText`; `null`, `false` and `""` all mean "no tooltip",
and `attach-tooltip`'s `isEmptyContent` does **not** treat `""` as empty, so map it to
`{ content: null, disabled: true }`. `TreeItem` has no `tooltipDelayShow` prop — do not add one.

### Step 4 — `TreeItem.css`

**New file:** `src/renderer/uikit/Tree/TreeItem.css`. Translate `TreeItem.tsx`'s `Root`, `Chevron`
and `ChevronStub` blocks in their existing order. Values: `gap: var(--gap-xs, 2px)`,
`padding-right: var(--space-sm, 4px)`, chevron column `14px` (a local constant, not a token — keep
the literal and the comment explaining it is deliberately narrower than the 16px indents), chevron
svg `12px`, `.tree-icon svg` `var(--size-icon-md, 16px)`.

**Two things that differ from `ListItem.css` and must not be "made consistent":**

1. **Do not add `:not([data-drop-active])` to the focus override.** `ListItem.css` needed it because
   both rules lived in the same Emotion block, where source order decided. Tree's focus override
   lives on the *container* block, at specificity (0,5,0) against the drop rule's (0,2,0), so it
   already wins today. Adding the `:not()` would change behaviour: it would let the drop highlight
   show on a selected row in a focused tree, which it does not today.
2. `[data-loading]` is an **empty rule with a comment** in the original ("hook for future dim-while-
   loading"). An empty rule is not worth a CSS entry — drop the rule, keep the comment next to where
   `data-loading` is written in `TreeItemView`, so the attribute's purpose is still recorded.

The chevron/indent sub-override keeps its row-hosted form and needs **no** `[data-type="tree"]`
anchor (its Emotion `&` was already the row):

```css
[data-focus-selection]:focus-within [data-type="tree-item"][data-selected] > .tree-chevron,
[data-focus-selection]:focus-within [data-type="tree-item"][data-selected] > .tree-chevron:hover {
    color: var(--color-icon-selection, currentColor);
}
[data-focus-selection]:focus-within [data-type="tree-item"][data-selected] > .tree-indent {
    border-left-color: transparent;
}
```

### Step 5 — Tree's `SectionItemView` and `SectionItem.css`

**New files:** `src/renderer/uikit/Tree/SectionItemView.ts`, `src/renderer/uikit/Tree/SectionItem.css`.

Simpler than `TreeItem`, but **not** a copy of `ListBox/SectionItemView.ts`: Tree's section `label`
is `React.ReactNode`, not `string`, so it needs a `fillSlot` host — `ListBox`'s version writes
`root.textContent` and would silently drop a rich label. It also renders indents.

DOM: indents (via `TreeIndents`, with **no** `extraClassName` — section rows are never selected, so
they carry no `.tree-indent` hook, matching `SectionItem.tsx`, which omits the class), then a label
host. `data-type="tree-section"`, `role="presentation"`, `data-name`, `id`, `applyRestProps` last,
`bindRef`.

CSS: translate the `Root` block. Note `text-overflow: ellipsis` on a `display: flex` element is a
pre-existing no-op — carry it over verbatim with the same flag-and-leave comment
`ListBox/SectionItem.css` uses.

### Step 6 — `TreeView` (the shell)

**New file:** `src/renderer/uikit/Tree/TreeView.ts`, modelled closely on `ListBoxView.ts`. Reuse its
`CellRecord`/`Arm`/`CellKind` shapes, its `cells` `WeakMap`, `rowViews` `Set`, `inert` flag, and its
`cssLength`/`applyCellStyle`/`setOrRemove`/`toggle` helpers.

Differences from `ListBoxView`:

- **`armFor(props)`**: `props.loading ? "loading" : this.model.rows.value.length === 0 ? "empty" : "real"`.
- **Root attributes** (all in both directions): `id`, `data-type="tree"`, `data-name`,
  `data-keyboard-nav`, `data-focus-selection`, `data-multi-select`, `data-loading` / `data-empty`,
  and on the real arm only `role="tree"`, `aria-multiselectable`, `tabindex`
  (`focusAware ? 0 : -1`), `aria-activedescendant`. `focusAware = keyboardNav || focusSelection`.
  Note `data-keyboard-nav` and `data-focus-selection` are on **all three** React arms, unlike
  `ListBox` — check against `Tree.tsx:255-262` when writing this.
- **`applyActiveDescendant(props)`** extracted as its own method (D1), called from `applyArm`'s real
  arm and from `refresh`.
- **Permanent root listeners**: `contextmenu` → `model.onRootContextMenu`, `keydown` → gated on
  `arm === "real"` → `model.onKeyDown`, `mouseleave` → gated on `arm === "real"` →
  `model.onRootMouseLeave`. React put `onKeyDown` and `onMouseLeave` on the real arm only.
- **Register `refresh`** with the model right after constructing the driver:
  `this.model.onStateApplied = this.refresh;` and null it in a disposer **before** `driver.dispose()`.
- **Grid props**: `rowCount: () => this.model.rows.value.length` (a thunk, so a pure count change is
  the engine's own `inputChanged()` business), `columnCount: 1`, `columnWidth` (the same
  `(() => "100%") as ElementLength` constant), `rowHeight: props.rowHeight ?? 22`,
  `renderCell: this.renderCell`, `overscanRow: 2`, `fitToWidth: true`,
  `growToHeight: cssLength(props.growToHeight)`, `whiteSpaceY: props.whiteSpaceY`.
- **Message arm**: `<Spinner size={16} /> loading…` for loading, `props.emptyMessage ?? "no items"`
  for empty. Note the fallback string is `"no items"` here, not `ListBox`'s `"no rows"`.

`renderCell` mirrors `ListBoxView.renderCell` with three kinds — `"section"`, `"custom"`
(`props.renderItem`), `"item"` — plus the DnD wiring React put on the cell wrapper:

```ts
// Per-wrapper, installed once. The cell pool never resets a released element, so re-adding on
// recycle would stack listeners; and the gate has to be inside the handler because a pooled
// wrapper outlives the row that decided whether it could drag.
private installCellListeners(wrapper: HTMLElement): void {
    wrapper.addEventListener("click", (e) => this.withRecord(wrapper, (r) => this.model.onItemClick(r.index, toPublicEvent(e) as ...)));
    wrapper.addEventListener("dblclick", ...onItemDoubleClick(r.index));
    wrapper.addEventListener("mouseenter", ...onItemMouseEnter(r.index));
    wrapper.addEventListener("contextmenu", ...onItemContextMenu(e, r.index));
    wrapper.addEventListener("dragstart", (e) => this.withDrag(wrapper, (r) => this.model.onDragStart(e, r.index)));
    wrapper.addEventListener("dragend",   ...);
    wrapper.addEventListener("dragenter", (e) => this.withDrop(wrapper, (r) => this.model.onDragEnter(e, r.index)));
    wrapper.addEventListener("dragover",  ...);
    wrapper.addEventListener("dragleave", ...);
    wrapper.addEventListener("drop",      ...);
}
```

- `withRecord` is `ListBoxView.activeRecord`'s guard: `undefined` when `inert` or the arm is not
  `"real"`.
- `withDrag` / `withDrop` add `model.isDndEnabled && model.canDragRow(index)` /
  `canDropRow(index)` — the conditions React expressed by passing `undefined` for the handler. A
  gated no-op handler is behaviourally identical: for `dragenter`/`dragover`, "no handler" and "a
  handler that does not `preventDefault`" both mean "drop not allowed".
- **`draggable` on the wrapper** must be written in both directions:
  `wrapper.draggable = canDrag` (the IDL attribute, not `setAttribute`). React wrote
  `draggable={canDrag || undefined}`, and `""` is an invalid value for this enumerated attribute
  that falls back to `auto` = not draggable — the trap US-1014 hit with `applyRestProps`.
- The custom-cell path is keyed by cell coordinate exactly as `ListBoxView` does:
  `fillSlot(wrapper, [React.createElement(React.Fragment, { key: p.key }, node)])`.
- `renderItem`'s context object is built from the row: `item`, `source`, `level`, `expanded`,
  `hasChildren: r.hasChildren || r.lazyChildren`, `rowIndex`, `selected`, `active`, `dragging`,
  `dropActive`, `loading`, `id`, and `toggleExpanded: () => this.model.toggleAt(index)` — read the
  index from the record at call time, not from the closure's capture.

`onUpdate`:

```ts
protected onUpdate(props: TreeProps<T>): void {
    this.driver.update(props);
    this.applyArm(props);
    if (this.repaintGate.changed(this.model.repaintSignature())) {
        this.grid?.model.update({ all: true });
    }
    if (props.activeIndex !== this.lastActiveIndex) {
        this.syncActiveScroll(props.activeIndex);
    }
}
```

`syncActiveScroll` is `ListBoxView`'s single unconditional `scrollToRow` — the engine queues it
itself when unmeasured. It does **not** need `scrollToRowAfterPaint`: an `activeIndex` change alone
does not change the row set, and when the rows *did* change the repaint above has already been
requested, so use the D6 form only when the repaint gate reported changed (same rule as step 12).

### Step 7 — `TreeModel`: delete both effects, add the funnel

**File:** `src/renderer/uikit/Tree/TreeModel.ts`

1. Delete both `this.effect(...)` blocks from `init()`. `init()` becomes
   `init() { this.props.onModel?.(this); }`.
2. Add `onStateApplied: (() => void) | null = null;` and the `private mutate(updater)` funnel from
   D1, plus `mutateState = (updater: (s: TreeState) => void) => this.mutate(updater);` as
   `TreeDndModel`'s narrow entry.
3. Add `repaintSignature()` exactly as in D2.
4. Rename `setReactId` → `setElementId`, `_reactId` → `_elementId`; `rootId` becomes
   `this.props.id ?? this._elementId` (D8).
5. Rewrite the eight state-write sites to call `this.mutate(...)`, deleting their `queueMicrotask`
   wrappers and their now-redundant `gridRef?.update({ all: true })` lines, per D5's table. Keep
   every `if (!this.isLive) return;` guard that follows an `await`; drop the ones that existed only
   to re-check liveness *inside* a deleted microtask.
6. `expandAncestorsThenScroll`: delete the microtask and the `setTimeout(resolve, 0)`, and replace
   the trailing scroll with `this.gridRef?.scrollToRowAfterPaint(idx, align ?? "nearest")` **on the
   branch that expanded something**. The `needsExpand === false` branch keeps `scrollToRow`. The
   method no longer needs to be `async` internally, but keep its `Promise<void>` signature —
   `revealItem` awaits it.
7. `runLoadAndExpand` reject path: hoist `this.props.onLoadError?.(v, err)` **above** the state write
   so its order relative to `onExpandChange` is unchanged (D5 row B).
8. Retype the event parameters that are now fed native events: `onItemClick(rowIndex, e?)`,
   `onChevronClick`, `onItemContextMenu`, `onRootContextMenu`. `onRootContextMenu` reads
   `e.nativeEvent.contextMenuEvent` — with a native event that becomes `e.contextMenuEvent`.
   `onItemContextMenu` passes the event to `ContextMenuEvent.fromNativeEvent(e, "generic")`, which
   already wants the native one. The **public** `props.onContextMenu` keeps its React signature, so
   bridge it: `this.props.onContextMenu?.(toPublicEvent(e) as unknown as React.MouseEvent<HTMLDivElement>)`,
   as `ListBoxModel.ts:160` does.

**Do not** replace the `{ all: true }` repaints with a real dirty set. The epic says explicitly not
to take that chance in this task — behaviour first, precision as a follow-up with a measurement
attached.

### Step 8 — `TreeDndModel` and `TreeKeyboardHandler`

**Files:** `src/renderer/uikit/Tree/TreeDndModel.ts`, `TreeKeyboardHandler.ts`

- Retype `React.DragEvent<HTMLDivElement>` → `DragEvent` and
  `React.KeyboardEvent<HTMLDivElement>` → `KeyboardEvent`. Drop the `import React from "react"` from
  both. `TreeDndModel.onDragStart` passes the event to `props.onDragStartOverride`, whose public
  signature is `(source, level, e: React.DragEvent) => boolean` — cast at that one call site.
- `TreeDndModel`: replace the private `update()` wrapper's `queueMicrotask` + `state.update` with
  `this.tree.mutateState(update)` (D5 row J). The liveness check moves into the funnel's caller —
  keep an `if (!this.tree.isLive) return;` at the top of the wrapper.
- `e.dataTransfer` is `DataTransfer | null` on a native `DragEvent` where React's type had it
  non-null. Add the null guards; they are unreachable in a real drag but the compiler is right.
- `TreeKeyboardHandler` needs no other change.

### Step 9 — The three React shims

**Files:** `src/renderer/uikit/Tree/Tree.tsx`, `TreeItem.tsx`, `SectionItem.tsx`

Each collapses to a `mountVanilla` shim. Keep **every** prop interface and doc comment verbatim —
`TreeItemProps` and `SectionItemProps` move nowhere, they stay declared in their `.tsx` file exactly
as `ListItemProps` does, so `TreeItemView.ts` imports the type from `./TreeItem`. Keep the type
re-exports at the bottom of `Tree.tsx` (`TREE_ITEM_KEY`, `ITreeItem`, `TreeProps`, `TreeRow`,
`TreeItemRenderContext`) — `index.ts` re-exports from `./Tree`, not from `./types`.

Delete from `Tree.tsx`: the `styled` import, `color`, `tokens`, `focusSelectionOverride`, `useId`,
`useComponentModel`, `RenderGrid`, `Spinner`, both styled blocks, `columnWidth`, the two default
constants, and the whole `TreeView` function body.

### Step 10 — `Tree.css`

**New file:** `src/renderer/uikit/Tree/Tree.css`. The `Root` block plus the `EmptyRoot` block as
`[data-type="tree"] > [data-part="message"]`, following `ListBox.css`. Keep the `min-width: 0`
comment verbatim — it documents a real sidebar-splitter bug.

The focus override, **with the anchor** (D3):

```css
[data-type="tree"][data-focus-selection]:focus-within [data-type="tree-item"][data-selected] {
    background-color: var(--color-bg-tree-selection, transparent);
    color: var(--color-text-selection, currentColor);
    outline: 1px solid var(--color-border-active, currentColor);
    outline-offset: -1px;
}
[data-type="tree"][data-focus-selection]:focus-within [data-type="tree-item"][data-active] {
    outline: 1px solid var(--color-border-active, currentColor);
    outline-offset: -1px;
}
```

### Step 11 — Delete `selection-style.ts`, relocate into `FolderItem`

**Files:** `src/renderer/ui/sidebar/FolderItem.tsx` (edit),
`src/renderer/uikit/shared/selection-style.ts` (delete)

Replace the two spreads in `FolderItem.tsx`'s `Root` with the literals they expand to, **in place**,
so the emitted CSS is unchanged:

```ts
// Relocated from uikit/shared/selection-style.ts (EPIC-056 C3-7) when its last uikit consumer
// converted. Blurred-state row backgrounds, then the focused (:focus-within) override — the row
// sits inside a ListBox that opts in with data-focus-selection + tabindex (MenuBar renders it
// through ListBox's renderItem). Epic D converts this component; when it does, its stylesheet
// must land in `@layer app`, not `@layer uikit` — see the epic note.
"&[data-active]:not([data-selected])": { backgroundColor: color.background.message },
"&[data-selected]": { backgroundColor: color.background.light },
"&:hover:not([data-selected])": { backgroundColor: color.background.message },
'[data-focus-selection]:focus-within &[data-type="folder-item"][data-selected]': {
    backgroundColor: color.background.treeSelection,
    color: color.text.selection,
    outline: `1px solid ${color.border.active}`,
    outlineOffset: -1,
},
'[data-focus-selection]:focus-within &[data-type="folder-item"][data-active]': {
    outline: `1px solid ${color.border.active}`,
    outlineOffset: -1,
},
```

Drop the `selection-style` import. `color` is already imported. Then delete the module.

### Step 12 — The `ListBox` same-class scroll fix (D6)

**File:** `src/renderer/uikit/ListBox/ListBoxView.ts`

`onUpdate` currently requests a full repaint and then scrolls in the same turn. Thread the gate
result into the scroll so a grown list scrolls after the paint that writes the new extent:

```ts
const contentChanged = this.repaintGate.changed(this.model.repaintSignature());
if (contentChanged) this.grid?.model.update({ all: true });
if (props.activeIndex !== this.lastActiveIndex) {
    this.syncActiveScroll(props.activeIndex, contentChanged);
}
```

and in `syncActiveScroll`, `afterPaint ? scrollToRowAfterPaint(i) : void scrollToRow(i)`. Apply the
same shape in `TreeView`.

### Step 13 — `uikit/CLAUDE.md`

Add under Rule 9:

- **"A state-driven model in a vanilla view"** — the funnel rule, why not a subscription (the three
  verified facts in D1), and the sentence that decides the shape: *the consequence of a state write
  is to re-run the render pass, not to repaint the cells*, because root attributes can be
  state-derived. Name `aria-activedescendant` as the worked example.
- **"Scrolling after a change that resizes the content"** — `scrollToRow` vs
  `scrollToRowAfterPaint`, and the one-line reason (`scrollTop` clamps to an extent written inside
  the next paint).
- Amend the focus-selection contract paragraph: `selection-style.ts` no longer exists; the four
  copies are `ListItem.css`, `Tree.css` + `TreeItem.css`, `SelectableRow.css`, `CategoryList`, plus
  `FolderItem.tsx`'s inlined Emotion.

### Step 14 — `Tree.story.tsx`

Add a **deep synthetic tree** control — a generated tree of configurable depth and breadth, default
off — so the pool can be exercised at levels the hand-written sample never reaches. The existing
story already covers DnD, lazy loading, multi-select, custom rows and the imperative API; do not
restructure it. Its Emotion `CustomRow` stays (stories are exempt).

### Step 15 — Docs

- `doc/epics/EPIC-056.md`: mark US-1015 `Implemented`, link the task doc, amend C3-6 rows 3 and 4
  and C3-7, record the `props.id` gap in `ListBox`'s signature, and add the two preserved CSS
  defects to a follow-up list.
- `doc/active-work.md`: add the linked task entry under EPIC-056.
- `doc/architecture/styling-inventory.md` and `doc/architecture/key-files.md`: drop
  `selection-style.ts`, add the new CSS files.

### Step 16 — Verify

Per the epic's verification contract, then the runtime probes in the acceptance criteria below.
## Concerns

1. **The funnel is a convention, not a type constraint.** `state` is public on `TComponentModel`,
   and there are eight `this.state.update(` lines in git history to copy from. A future state write
   that skips `mutate()` produces a silent no-paint confined to one interaction. Mitigations, in
   order of value: make `mutate` the only place in `uikit/Tree/` where `state.update` appears and say
   so in its doc comment, so `grep "state.update" uikit/Tree/` is a conclusive check; give
   `TreeDndModel` the narrow `mutateState` entry instead of letting it touch `tree.state`. A lint
   rule banning `.state.update(` outside a vanilla-driven model's funnel is the only mechanical
   enforcement available and would generalise to every remaining C3 component — proposed for the
   epic, **not** built here.

2. **Site I is the one that can regress silently.** A clamped `scrollTop` looks like nothing at all:
   the list renders correctly and is simply scrolled to the wrong place. No story with a small tree
   will show it. It has two production consumers (Explorer and Archive "reveal selected item"), and
   `ArchiveSecondaryView` already wraps its call in a `requestAnimationFrame` — independent evidence
   that this path's timing is fragile today. Test it explicitly: reveal a deeply nested collapsed
   item in a tree long enough that expanding the ancestors extends the scrollable extent, and assert
   the row is actually in the viewport.

3. **Drag feedback is the other silent one.** `TreeDndModel` is the site with no repaint of its own;
   if the funnel is wired but `onStateApplied` is not registered — or is registered after the
   driver's constructor has already pumped props — a drag produces no `data-dragging` /
   `data-drop-active` at all, with no error anywhere. Also keep the drag state on the
   `update({ all: true })` / rAF path rather than any synchronous DOM write, so nothing mutates the
   DOM inside the `dragstart` handler before the browser snapshots the drag image. Check the drag
   ghost visually.

4. **Stale indents surviving recycling.** A `sync()` that grows but returns early on shrink, or
   shrinks by `remove()` without truncating the array, leaves a level-2 row recycled from a level-8
   row wearing six extra gutters. Invisible on first paint; appears only after scrolling hard through
   a tree of mixed depth, which is exactly why the pool does not reset elements. Assert
   `row.querySelectorAll('[data-part="tree-indent"]').length === level` for every visible row after a
   hard scroll. Its close cousin — the row going blank because the host list was wiped — has the same
   trigger and a completely different-looking symptom, so check both from the DOM.

5. **The four `renderItem` consumers change the Rule 4 baseline.** Do not report a `Tree` number
   measured through `TreeProviderView`. Measure through `GitRefsView` or
   `NotebookCategoriesSecondaryView`, and state in the epic which one, as US-1014 had to for
   `MultiListBox`.

6. **`FolderItem` is the least-tested line in the diff** (D3). It is a mechanical relocation with
   byte-identical output, but it is app-layer, in a `uikit` task, and outside this task's testing
   focus. Verify it visually — the menu-bar folder rows, selected and hovered, focused and blurred.

7. **`revealItem`'s contract narrows.** It returns when the scroll is *queued*, not when the row is
   visible. Both production callers `void` it, so nothing observes the difference today, but the
   docstring must say so or the next caller will await it and believe something false.

8. **Two preserved defects will look like conversion bugs.** The invisible guides and the 17px step
   are pre-existing and measured (see Background). Anyone reviewing the new CSS will read
   `height: 100%` with no definite parent height, or the missing `box-sizing`, as a mistake. The
   comments in `tree-indents.css` exist to stop that, and the epic follow-up list is where the fix
   belongs.

## Acceptance criteria

**Build and lint**

- `npx tsc --noEmit` clean.
- `npm run lint` clean.
- `git diff --check` clean.
- `grep -rn "state.update" src/renderer/uikit/Tree/` returns exactly one hit, inside `mutate`.
- `grep -rn "effect(" src/renderer/uikit/Tree/` returns nothing.
- `grep -rn "@emotion" src/renderer/uikit/Tree/` returns only `Tree.story.tsx`.
- `grep -rn "selection-style" src/renderer/` returns nothing.
- `grep -rn "queueMicrotask\|setTimeout" src/renderer/uikit/Tree/` returns only what D5 keeps.

**Behaviour, verified at runtime through offscreen probes, not by inspection**

1. All three arms render, and every per-arm root attribute is present *and absent* in the right arm —
   including `tabindex` being removed, not set to `-1`, off the real arm.
2. Expand and collapse repaint: a chevron click changes `rows.length`, the painted row count, and
   the row DOM, in one frame.
3. `collapseAll()` with a high `activeIndex` **removes** `aria-activedescendant` from the root; a
   collapse that keeps the index in range **rewrites** it to the new row's id. This is D1's worked
   example and the single most likely thing to be got wrong.
4. Drag over a droppable row sets `data-drop-active` on that row and clears it on leave; dragging a
   row sets `data-dragging`. Both with `TreeDndModel`'s microtask gone.
5. Lazy expand shows the chevron spinner, then the loaded children; a rejected load restores the
   collapsed state and fires `onLoadError` **before** `onExpandChange(v, false)`.
6. Keyboard: arrows, Home/End, PageUp/PageDown, ArrowRight/ArrowLeft expand/collapse/traverse,
   Ctrl+A in multi-select, Enter selects.
7. `revealItem` on a deeply nested collapsed item in a long tree lands the row **inside** the
   viewport (concern 2).
8. Pool bounds: after a hard scroll through a mixed-depth tree, every visible row has exactly `level`
   indents, no row is blank, and no row has a stale `data-first`.
9. Arm cycling (`real` → `loading` → `real` → `empty` → `real`) leaves no detached React roots and no
   duplicate listeners: click a row after each cycle and confirm exactly one `onChange`.
10. Repaint frequency: a parent re-render that changes nothing in the signature repaints **zero**
    cells. This is the measurement that proves the gate works and the one the React path could never
    pass.
11. Both `renderItem` and default-row consumers still render: check `TreeProviderView` (custom rows,
    `hideChevron` at level 0, rich trailing) and `GitRefsView` (default rows).
12. Tooltips appear on rows that have them, including a row that *gains* a tooltip while mounted.

**No visual change**

13. Side-by-side check of `GitRefsView`, `NotebookCategoriesSecondaryView`, `ToolsTree`, `BoardsTree`,
    `RestClientShared` and the Explorer tree, blurred and focused, with a selection and a hover.
14. Menu-bar folder rows unchanged (concern 6).
15. The level gutters are still `16 + 17 × (N − 1)` px and the guides are still invisible. If guide
    lines appear, the conversion changed something it should not have.

## Files changed

| File | Change |
|---|---|
| `uikit/VirtualGrid/VirtualGridModel.ts` | **Edit** — add `scrollToRowAfterPaint` (D6) |
| `uikit/Tree/tree-indents.ts` | **New** — shared indent helper (D4) |
| `uikit/Tree/tree-indents.css` | **New** — guide rules, with the two preserved defects documented |
| `uikit/Tree/TreeItemView.ts` | **New** — the row, single source of truth for its DOM |
| `uikit/Tree/TreeItem.css` | **New** — translated from `TreeItem.tsx`'s three styled blocks |
| `uikit/Tree/SectionItemView.ts` | **New** — section row, `ReactNode` label via `fillSlot` |
| `uikit/Tree/SectionItem.css` | **New** |
| `uikit/Tree/TreeView.ts` | **New** — the shell: arms, bound `renderCell`, pooled cells, DnD wiring |
| `uikit/Tree/Tree.css` | **New** — root + message host + the anchored focus override (D3) |
| `uikit/Tree/TreeModel.ts` | **Edit** — delete both effects; add `mutate`/`onStateApplied`/`repaintSignature`; `setElementId`; rewrite 8 state writes; 9 deferrals deleted, 1 changed |
| `uikit/Tree/TreeDndModel.ts` | **Edit** — native event types; route through the funnel |
| `uikit/Tree/TreeKeyboardHandler.ts` | **Edit** — native `KeyboardEvent` type only |
| `uikit/Tree/Tree.tsx` | **Rewrite** — `mountVanilla` shim + type re-exports |
| `uikit/Tree/TreeItem.tsx` | **Rewrite** — `mountVanilla` shim; `TreeItemProps` kept verbatim |
| `uikit/Tree/SectionItem.tsx` | **Rewrite** — `mountVanilla` shim; `SectionItemProps` kept verbatim |
| `uikit/Tree/Tree.story.tsx` | **Edit** — deep synthetic tree control |
| `uikit/ListBox/ListBoxView.ts` | **Edit** — one-line same-class scroll fix (D6, step 12) |
| `ui/sidebar/FolderItem.tsx` | **Edit** — inline the two relocated fragments, drop the import (D3) |
| `uikit/shared/selection-style.ts` | **Delete** (D3) |
| `uikit/CLAUDE.md` | **Edit** — two new subsections, focus-selection contract amended |
| `doc/epics/EPIC-056.md` | **Edit** — status, C3-6 rows 3/4, C3-7, follow-up list |
| `doc/active-work.md` | **Edit** — task entry |
| `doc/architecture/styling-inventory.md`, `key-files.md` | **Edit** — file inventory |

**Unchanged, deliberately:** `uikit/Tree/types.ts`, `uikit/Tree/index.ts`, `uikit/index.ts`, all six
`<Tree>` and five `<TreeItem>` call sites, `uikit/RenderGrid/**`, `core/traits/**`,
`editors/storybook/storyRegistry.ts`.

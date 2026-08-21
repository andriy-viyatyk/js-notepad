# US-1014: `ListBox`, `ListItem`, `SectionItem` — the first data view on the vanilla engine

**Epic:** [EPIC-056](../../epics/EPIC-056.md) (De-React C3)
**Status:** Implemented — awaiting user testing
**Blocked by:** [US-1013](../US-1013-virtual-grid-engine/README.md) — done
**Blocks:** US-1016 (`MultiListBox`), US-1017 (`Select`), US-1018 (`Autocomplete` half)

## Goal

Convert `uikit/ListBox/` — the list shell plus its two row components — from React onto the
vanilla `VirtualGrid` engine US-1013 landed, behind React-facing signatures that do not change.
Settle C3-6 #1 (the repaint trigger whose deps include two memos) and C3-6 #2 (scroll-into-view
with its unmeasured fallback), because `Tree` follows whatever this task decides.

## Background

### The surface, measured

| File | Lines | What it is |
|---|---:|---|
| `ListBoxModel.ts` | 278 | `TComponentModel`, 2 memos, **2 effects**, the keyboard handler, the context-menu dispatch |
| `ListBox.tsx` | 232 | Three structurally different roots (loading / empty / list) + the `renderCell` closure |
| `ListItem.tsx` | 199 | The default row. Emotion, `highlight`, `renderIcon`, a `Tooltip` wrapper |
| `types.ts` | 149 | Public props. Types only — no React runtime beyond `ReactNode` annotations |
| `SectionItem.tsx` | 56 | A non-interactive centred header row |
| `ListBox.story.tsx` | 188 | 11 controls |

### Call sites, counted (C3-5 says none of them change)

`<ListBox>`: **12** — 9 app-layer (`components/file-list`, `editors/browser`,
`editors/mcp-inspector`, `editors/notebook`, `editors/storybook`, `ui/sidebar` ×3) and 3 inside
`uikit/` (`Select.tsx:153`, `Autocomplete.tsx:145`, `MultiListBox.tsx:282`).

`<ListItem>` directly: **2** — `editors/link-editor/LinksList.tsx:138` and
`editors/link-editor/PinnedLinksPanel.tsx:101`. Both pass a React element for `icon`, a React
element for `tooltip`, a `trailing` node, HTML drag props through `...rest`, and `selectionStyle="focus"`.

`<SectionItem>` directly: **0**. Its only caller is `ListBox.tsx:110`. (`uikit/Tree/SectionItem.tsx`
is a separate copy and belongs to US-1015.) It is nonetheless exported from `uikit/index.ts`.

`ListBoxModel` as a type: **1** — `editors/browser/UrlSuggestionsDropdown.tsx` takes it through
`onModel` and calls `model.scrollToIndex(hoveredIndex)`. So the model stays a public class with
that method.

`renderItem` (the `ReactNode` escape hatch): **5** — `editors/notebook/TagsListView.tsx:180`
(returns `<SelectableRow>`), `ui/sidebar/BuiltinEditorsList.tsx:87` (`<UnpinnedRow>`),
`ui/sidebar/MenuBar.tsx:411` (`<FolderItem>`), `uikit/MultiListBox/MultiListBox.tsx:288` (an
Emotion `ItemRow`), and the story.

### The finding that shapes the row: React icons are the norm, not the exception

`IListBoxItem.icon` is `IconRef = IconName | ReactNode`. Every production trait provider fills it
with a React **element**, not an icon name:

| Provider | `icon` |
|---|---|
| `components/file-list/FileList.tsx:143` | `<FolderIcon />` / `<FileIcon path={…} />` |
| `ui/sidebar/OpenTabsList.tsx:24` | `<LanguageIcon language={…} />` |
| `ui/sidebar/BuiltinEditorsList.tsx:24`, `MenuBar.tsx:105` | React elements |
| `ListBox.story.tsx:19` | `<GlobeIcon />` |
| `editors/link-editor/LinksList.tsx:146` | `<TreeProviderItemIcon item={link} />` |

So "the default row path stays pure DOM" is false in practice for the majority of call sites, and
the design has to make React-valued slots cheap rather than exceptional.

### Infrastructure that already exists

| Need | Use |
|---|---|
| React component hosting a vanilla view | `mountVanilla(View, props)` — `uikit/shared/mount.tsx` |
| React content inside a vanilla region | `fillSlot(host, content)` — reuses one React root across React→React changes |
| `ref` + `...rest` on a vanilla root | `bindRef`, `applyRestProps`, `clearRestListeners` — `uikit/shared/react-compat.ts` |
| Framework-neutral tooltip | `attachTooltip(element, options)` — `uikit/Tooltip/attach-tooltip.ts` |
| DOM icons | `createIconElement(name)` — `uikit/shared/slots.ts` |
| The nearest precedent for a row | `uikit/SelectableRow/SelectableRowView.tsx` — 73 lines, `fillSlot` + `bindRef` + `applyRestProps` |
| Vanilla spinner | `SpinnerView` (`uikit/Spinner/SpinnerView.tsx`) |

### What the engine gives us

`VirtualGridOptions` (`uikit/VirtualGrid/VirtualGridModel.ts:85`) already covers everything
`ListBox` passes to `RenderGrid` today: `rowCount` (**or a `() => number`**), `columnCount`,
`rowHeight`, `columnWidth`, `renderCell`, `overscanRow`, `fitToWidth`, `whiteSpaceY`, plus
`onResize`. `VirtualGridProps` adds `growToHeight`, `className`, `onView`.
`VirtualGridModel` exposes `scrollToRow(row, align)`, `visibleRowCount`, `size`, `update(rerender)`,
`attach({grid, container})`.

The cell contract is `RenderCellFunc = (p: RenderCellParams) => HTMLElement | undefined` with
`p.previous` (the element this row/col had last paint) and `p.recycle?.()` (an element from the
pool). **`CellPool.release()` does not reset the element** — children, classes, attributes *and
listeners* survive — so a recycled row arrives wearing the previous occupant's everything.

### The two effects that must go

`createComponentModelDriver(...).mount()` **throws** when the model registered any `effect()`
(`core/state/model.ts:319`). So `ListBoxModel`'s two effects are not optional to remove.

### Files that need NO changes

Verified by reading each one; do not spend investigation time here.

| File | Why not |
|---|---|
| `src/renderer/uikit/index.ts` | The `ListBox` export block (lines 95-98) already names exactly what stays public: `ListBox`, `LIST_ITEM_KEY`, `ListItem`, `SectionItem` and their prop types. C3-5 keeps all four |
| `src/renderer/editors/storybook/storyRegistry.ts` | `listBoxStory` is already registered (line 48, 67); the story's `id`/`name`/`section` do not change |
| `src/renderer/uikit/VirtualGrid/**` | The engine already carries every option `ListBox` needs — `rowCount` as a thunk, `whiteSpaceY`, `fitToWidth`, `overscanRow`, `growToHeight`, `onResize` — plus `scrollToRow`, `visibleRowCount`, `size`. Any addition must be justified against C3-2, not assumed |
| `src/renderer/uikit/RenderGrid/**` | C3-1: the React engine is untouched by this epic. `ListBox` simply stops importing it |
| All 12 `<ListBox>` call sites | C3-5. Listed above; each is re-read only to confirm no diff is needed |
| `src/renderer/core/events/context-menu.ts` | `ContextMenuEvent.fromNativeEvent` already accepts a bare native `MouseEvent` as well as a React synthetic (`context-menu.ts:62`), so the vanilla path needs no new entry point |
| `src/renderer/uikit/Tree/SectionItem.tsx` | A separate copy owned by `Tree`. US-1015's, not this task's |

## Decisions taken in this task

Each open question went to an independent agent with no conversation context, which returned a
recommendation plus its reasoning; the reasoning was then checked against the code and accepted,
amended, or rejected. Where a recommendation was overridden, the override and its evidence are
recorded — a delegated decision leaves no discussion behind it, so the text is the only place the
"why" survives.

### D1 — The repaint trigger: one gate in the view, fed by a signature the model publishes (C3-6 #1)

`ListBoxModel` gains `repaintSignature(): readonly unknown[]`. `ListBoxView` holds a `DepsGate` and
calls it **once**, at the end of `onUpdate`, after the driver has pumped props. `depsChanged` (today
a private function at `core/state/model.ts:4`) is exported, so there is exactly one array comparator
in the tree and the replacement is behaviour-identical by construction.

New file `src/renderer/uikit/shared/deps-gate.ts`:

```ts
export interface DepsGate {
    /** True (and stores) when any slot moved since the last changed()/prime(). */
    changed(next: readonly unknown[]): boolean;
    /** Store without reporting — aligns the gate with a paint that already happened. */
    prime(next: readonly unknown[]): void;
}
export function createDepsGate(): DepsGate;
```

**Why split between model and view.** Not `setProps`/`mapProps` on the model:
`createComponentModelDriver` pumps props **in its constructor** (`core/state/model.ts:285`,
verified), before the view or the engine exist — so the first `setProps` fires into a null grid and
the signal is lost. It also cannot see the memo deps without a hand-rolled previous-signature field,
so the "free" `oldProps` comparison is not free; and it puts paint scheduling back in the model,
which is what the epic moves out. Not the view comparing its own retained props either: it cannot
see `selectedKey`, and it would duplicate "which inputs reach a cell" outside the model that owns
`renderCell`. The helper earns its own file because this lands three times in this epic (`ListBox`,
`MultiListBox`, `Tree`) and again in C4, and a hand-rolled inequality chain per component is where a
forgotten dep hides.

**The signature — nine fixed slots.** `depsChanged` treats a length change as "changed", so a
conditionally-pushed slot degenerates into "always repaint". Fixed length is a rule, not a style.

```ts
repaintSignature(): readonly unknown[] {
    return [
        this.props.items,          // NOT resolved.value.resolved — see the memo rule
        this.selectedKey.value,    // memo output: a normalised primitive key
        this.props.activeIndex,
        this.props.searchText,
        this.props.renderItem,
        this.props.isSelected,
        this.props.getTooltip,
        this.props.variant,        // ADDED — see the two corrections
        this.props.selectionStyle, // ADDED
    ];
}
```

**The memo rule, recorded as the precedent `Tree` follows — B13's undecided fourth row.** *Compare
the memo's **output** when the memo is a genuine derivation; compare the **upstream prop** when the
memo is a 1:1 pass-through of it.* Applied:

| Memo | Deps | Verdict |
|---|---|---|
| `ListBoxModel.resolved` (`:63`) | `[props.items]` **only** | Output identity changes *iff* `props.items` identity changes — same signal. So `resolved.value.resolved` is **redundant**; use `props.items`, which also avoids evaluating the memo inside change detection |
| `ListBoxModel.selectedKey` (`:77`) | `[props.value]` | Output is a **normalised primitive**, so comparing it is *strictly better* than comparing `props.value`: a caller handing over a new object that resolves to the same key collapses to no-change. **Keep the output** |
| `TreeModel.rows` (`:144`) | items, 4 props, `state.expanded`, `state.revision` | **Not** derivable from props; its identity is the only signal carrying expand/collapse. Substituting `props.items` under-paints on every toggle. **Keep the output** — the case that justifies allowing memos in a signature at all |

Reading a memo in change detection **evaluates** it. That is a *move* of work from paint time to pump
time, not a duplication — but build the signature **once** per `onUpdate`, and never read a memo in
the gate that nothing else reads. Cache poisoning is not a risk: these memos are pure and
self-healing, so an early read with stale deps caches a value the next read recomputes. Do not add a
defensive re-read.

**Two corrections to the recommendation, both derived from the code.**

1. **`variant` and `selectionStyle` are added, and this closes a live bug.** Neither appears in
   today's effect deps (`ListBoxModel.ts:228-238`), yet the story's `variant` and `selectionStyle`
   controls visibly work. The reason: `ListBox.tsx:103` builds `renderCell` as a **new closure on
   every render**, and `RenderGridModel.inputChanged()` compares `renderCell` by identity
   (`RenderGrid/RenderGridModel.ts:276`), so *every* parent re-render already repaints every visible
   cell. The effect was belt-and-braces over an unconditional repaint. Making `renderCell` a stable
   bound field — which D1 requires, or the gate is pointless — removes that blanket repaint and would
   turn the two missing deps into a silent regression. The signature must therefore carry every input
   a cell actually reads, not the historical dep list.
2. **`rowHeight` is dropped, and so is `getContextMenu`.** `rowHeight` is already compared by
   `VirtualGridModel.inputChanged()` (`:301`, verified) and `setOptions` calls
   `updateRenderInfo({ all: true })` when it changes (`:172-179`) — the engine owns it, and
   duplicating it risks two recomputes. `getContextMenu` affects **no cell DOM**: it is read live
   from `this.props` inside the row's `contextmenu` handler. Keeping it would repaint the whole window
   on every render for `MenuBar.tsx:542`, which passes an inline arrow. `getTooltip` stays — it does
   change what the row shows.

`rowCount` goes to the engine as a **thunk** (`rowCount: () => this.model.rowCount`), which
`VirtualGridOptions` already supports (`VirtualGridModel.ts:89`), so a pure length change
self-detects inside `inputChanged()` and needs no gate slot.

**Ordering discipline.**

```ts
protected onUpdate(props: ListBoxProps<T>): void {
    this.driver.update(props);                         // 1. model props + memos now current
    this.applyArm(props);                              // 2. D4 — arm, root attributes, engine options
    if (this.repaintGate.changed(this.model.repaintSignature())) {
        this.grid?.model.update({ all: true });        // 3. content-only repaint
    }
    if (props.activeIndex !== this.lastActiveIndex) {   // 4. D2
        this.syncActiveScroll(props.activeIndex);
    }
}
```

| Guard | Failure it prevents |
|---|---|
| gate **after** `driver.update` | a stale signature — the row keeps showing the old selection until some later unrelated update. The classic under-paint, invisible in a 60-item story |
| `prime()` at the end of `onMount`, never at construction | without it `depsChanged(undefined, next)` is `true`, so the first `onUpdate` always repaints everything once for nothing |
| never fire a repaint before `mount()` | `VanillaView.update()` stores props and skips `onUpdate` (`vanilla-view.ts:71`), so a pre-mount change cannot reach the gate. The fix is to render from stored props at mount, **not** to fire early: `VirtualGridModel.update()` queues onto a microtask that can run before `attach()`, consuming the `all: true` against an empty visible range |
| `renderCell` a **stable bound field** | a per-update closure makes `inputChanged()` true on every update and repaints unconditionally, defeating the gate (`VirtualGridView.ts:230` already calls this out) |
| never pass `force: true`, never call `updateRenderInfo` directly | `force` bypasses the queue and recomputes synchronously, turning two pumps into two recomputes |

**One paint per keystroke, guaranteed.** The engine coalesces twice: `update()` merges into
`pendingRerender` and defers the recompute to a microtask (`VirtualGridModel.ts:391`), and the view's
`onRepaintNeeded` coalesces onto one `requestAnimationFrame`. So *n* `update({ all: true })` calls in
one task produce one recompute and one paint. `searchText` and the filtered `items` normally arrive in
the same props object, so the gate fires once anyway. Verify by **frequency**, not correctness:
`grid.stats.paints` increments exactly once per keystroke.

### D2 — Scroll-into-view: the trigger moves to the view, the unmeasured fallback into the engine (C3-6 #2)

**This amends the epic.** C3-6 row 2 reads "`setProps` guard on `activeIndex`; the unmeasured
fallback becomes the engine's `attach()`-time pass." Both halves are corrected, and EPIC-056 is
edited to match rather than left to contradict the code.

**The trigger goes in `ListBoxView.onUpdate`, not `setProps`.** `activeIndex` is also one of D1's
signature slots, so the repaint and the scroll are two consequences of one prop change and must be
ordered. `setPropsInternal` runs `setProps` *after* `_evaluateEffects`, while the view runs
`driver.update(props)` *before* its own body — so a `setProps` trigger fires before the cells are
marked dirty. It happens to survive (the paint is on rAF and `scrollToRow` awaits a microtask), but
it is an ordering that must be re-derived on every future edit. In `onUpdate`, "mark dirty, then
scroll" is two adjacent statements. `setProps` also fires once too early, from the driver
constructor, before any grid exists — so it would need its own "no grid yet, remember this index"
field, duplicating what the engine is about to grow. And Rule 9 wants the model view-agnostic:
scroll-into-view is a viewport concern, which leaves room for a non-virtualized list view to satisfy
it with `Element.scrollIntoView()`.

**`attach()`'s pass alone does not cover it.** Verified: `attach()` *does* perform a synchronous
measured pass (`VirtualGridModel.ts:223-235` → `checkSize()` → `onFrameResize()` reads
`offsetWidth`/`offsetHeight` and recomputes synchronously). But it is only *useful* when the root has
layout at `mount()` time. For a dropdown that builds its content before laying it out, `offsetHeight`
is 0, `size` becomes `{0,0}`, `calcScrollOffsetY` computes with `visibleHeight = 0`, the browser
clamps the result, and **nothing re-issues the scroll** when the `ResizeObserver` later delivers the
real size. `AsyncRef` does not save us: `scrollToRow` awaits `renderInfo.async`, which resolves on the
*first* `renderInfo.ref(...)` — easily the height-0 one. That gap is the actual defect.

**The engine addition** — `src/renderer/uikit/VirtualGrid/VirtualGridModel.ts`, five small edits:

```ts
private pendingScrollRow?: { row: number; align: RowAlign };   // beside `scrollLost`

/** Both conditions, for the reason in "the correction" below. */
get measured(): boolean {
    if (!this.size.width || !this.size.height) return false;
    const container = this.containerRef.current;
    return !!container && !!(container.offsetHeight || container.offsetWidth);
}

async scrollToRow(row: number, rowAlign: RowAlign = "nearest"): Promise<void> {
    if (this._disposed) return;
    if (!this.measured) { this.pendingScrollRow = { row, align: rowAlign }; return; }  // last write wins
    this.pendingScrollRow = undefined;
    /* existing body, plus `if (this._disposed) return;` after the awaits */
}

/** Called by the VIEW at the end of a paint — not from onFrameResize. */
flushPendingScroll(): void {
    if (this._disposed || !this.pendingScrollRow || !this.measured) return;
    const pending = this.pendingScrollRow;
    this.pendingScrollRow = undefined;          // consume exactly once
    void this.scrollToRow(pending.row, pending.align);
}

// dispose()
this.pendingScrollRow = undefined;
```

`VirtualGridView.paint()` calls `flushPendingScroll()` at the end, next to the existing
`scrollNeedsRestore` handling — and also on the early-return path, because a container that has just
become scrollable is not a geometry change and might never produce another paint.

**The correction the runtime probe forced.** The flush was first written where this decision said it
belonged — at the end of `onFrameResize`'s size-change branch — and it *looked* like it worked: the
queued scroll ran and `container.scrollTop` read back as 95,724 out of 120,020. The list was still
showing row 0 at the top of the viewport. Instrumenting the container's own `scroll` listener found
why: at the moment the event was delivered, `container.offsetHeight` and `offsetWidth` were both
**0**, so `onScroll`'s hidden-guard discarded it and the model's `offset` stayed at zero while the
DOM was scrolled 95,724px. The resize callback knows the grid *root* has a size; that is not the same
condition as the scroll container having a layout box. Hence both changes above: `measured` tests the
container too, and the flush moved to the paint path, where the container is provably live because
the paint has already read its scrollbar thickness.

This is worth keeping in the record for the same reason US-1013's dead `CellPool` is: every visible
symptom of the first version was correct except the one that mattered, and no story arm would have
shown it.

**Why this belongs in the engine, and why it does not breach C3-2.** Only the engine knows when it
becomes measured — its own `ResizeObserver` updates `size`, so a host-side deferral must duplicate
the observer or guess with a timer, which is the code being removed. It is a **command queued in its
receiver**, not state a host observes: one plain field, no subscription, no store. C3-2's rule is
that a host wanting to *observe* the engine gets a callback (as `onResize` does); a host *commanding*
something the engine cannot do yet is the opposite direction. It also completes a promise `AsyncRef`
already makes in its own header — waiting for *measurement* rather than mere *existence* is the same
contract, correctly kept — and it fixes four consumers at once (`TreeModel.ts:791` is the identical
effect; `Select`, `MultiListBox` and `Autocomplete` inherit through `ListBox`), where a host-side
deferral gets copy-pasted four times. Rejected: a host-registered `onFirstMeasure` callback — the host
would still have to retain the row and re-issue, so the pending state lands in the host anyway, with
an extra hop and a stale-index guard per host.

**`setTimeout(0)` is deleted outright.** The host makes one unconditional `scrollToRow(ai)` call. The
React-effect-timing half of the original comment is genuinely gone: `VirtualGridView.onMount()` runs
`buildDom` → `applyRootProps` → `applyStaticStyles` → `listen(scroll)` → `model.attach()` →
**synchronous `paint()`**, and `attach()` measures before that paint. The layout half is now handled
by the pending slot. Note that `requestAnimationFrame` would have been *worse* than `setTimeout(0)`:
animation-frame callbacks run **before** `ResizeObserver` delivery, so an rAF fallback would have
fired while still unmeasured. The original fix depended on a spec ordering invisible at the call
site, which is the clearest argument that timing was the wrong tool. A synchronous
`getBoundingClientRect` in the host is no substitute either — you cannot measure your way out of
`display: none`.

**Failure symptom if the pending slot is omitted:** a bug invisible in Storybook and in every
normally-laid-out host, appearing only when a dropdown opens — the list pinned at row 0 with the
selected item off-screen, "fixed" by the first arrow key. It reads as intermittent and gets misfiled
as CSS or z-order.

**Races, closed by construction.** One field, overwritten rather than appended, so N changes while
unmeasured collapse to the newest and a stale index is discarded. Read-and-cleared before re-issuing,
so a later resize does not yank the user back to the active row. A *measured* call stores nothing, so
the mechanism can never contend with a real user scroll or with `scrollLost`/`restoreScroll`.
`dispose()` clears the field; `scrollToRow` guards on entry **and after its two awaits** — a guard the
existing body lacks, and the one the host's `if (!this.isLive)` used to provide, so it has to move
with the deferral. Accepted non-outcome: a grid that is never shown and is then disposed never runs
its pending scroll. That is correct.

`onKeyDown`'s direct `this.gridRef?.scrollToRow(target)` stays as it is. It is the *cause* of an
`onActiveChange` the parent may echo back; when it does, the second scroll is a no-op (`"nearest"` on
an already-visible row).

One constraint this puts on US-1017: `SelectModel` keeps `activeIndex` in **state**, so `SelectView`
must deliver it as a full `listBox.update(props)` rather than a side-channel push. Props are the only
channel `ListBoxView` watches, and a side channel would silently reintroduce this bug for the exact
consumer the epic's ordering names as the reason `Select` follows `ListBox`.

### D3 — React-valued slots: DOM-first per slot, roots owned by the pooled element

The "no React root per cell" rejection in C3-1 does **not** bind here, and the distinction is what
the rejection was about rather than a loophole. C3-1 rejected making `RenderCellFunc` itself return
`ReactNode` so the twelve app-layer `RenderGrid` consumers could keep working — a root in every cell
of `AVGrid`, rows × columns of scalar data cells. Nothing here changes the engine: `RenderCellFunc`
still returns `HTMLElement` and `VirtualGrid` never sees React. Four differences: **scale** (one
column, ~30 visible rows, in dropdowns and sidebars, not the data grid the rejection names as "the
fastest component in the app"); **lifecycle** (the rejected bridge creates a root per cell per frame,
this creates roots per *pooled element*, once, and a settled scroll creates zero); **conditionality**
(opt-in per slot — most consumers get no root at all); and the alternative is forbidden anyway, since
dropping `renderItem` violates C3-5 and pulls `TagsListView`, `BuiltinEditorsList` and `MenuBar` out
of Epics D/E into C3.

**Per-slot rendering.** Decide per slot, per render. Never route strings through `fillSlot` "for
uniformity": the icon slot is the library's most common non-empty slot, and that would put a root
behind every one.

| Slot | DOM path (no root) | React path |
|---|---|---|
| `label` | `string` → `textContent`, or `highlightInto(host, …)` when `searchText` is set | non-string `ReactNode` → `fillSlot` |
| `icon` | `IconName` → `createIconElement` | `ReactNode` → `fillSlot` |
| `trailing` | absent, or the default check / chevron-right → `createIconElement` | `ReactNode` → `fillSlot` |
| `tooltip` | always `attachTooltip` — one call per row view, `attachment.update({ content })` per row | a React body costs one root only while open (`tooltipRegistry` permits one at a time) |

So the default row is pure DOM whenever `label` is a string, `icon` is an `IconName` or absent,
`trailing` is absent or the default selection icon, and `tooltip` is a string or absent — covering
`Select`, `Autocomplete`, `MultiListBox`'s rows, `ToolsPanel` and `UrlSuggestionsDropdown`: **zero
roots**. `FileList` and `OpenTabsList` pay exactly one retained root per pooled element, for the icon
slot only, until Epic D converts `components/icons/`.

**Roots are retained per pooled element, never per row.** `fillSlot` keys its cache on the host
element in a `WeakMap` and re-renders the existing root on a React→React change. Because a pooled
element and its row view (and therefore its slot hosts) are stable across recycling, **the pool's
refusal to reset elements is exactly the property that makes root retention work**. Steady-state
`createRoot` calls after warm-up: zero.

**Reuse for a different row keys the caller's subtree by cell key.** For the `renderItem` path pass
`[React.createElement(React.Fragment, { key: p.key }, node)]` — an array, so the key is honoured
among siblings. This reproduces today's semantics exactly: `ListBox.tsx:112` already returns
`<div key={key}>` per cell, so React identity is keyed by cell coordinate and a scroll unmounts row
5's subtree and mounts row 305's. Without the key, a `useState` or an open menu inside `UnpinnedRow`
would bleed from one row to the next — no error, just a wrong-looking list.

**The leak vector, named.** Never run a slot cleanup on eviction; cleanup runs only at view disposal.
The view therefore tracks every row view it created in a real `Set` (not a `WeakSet`), disposed by a
single `own()`: `CellPool.clear()` drops references but never unmounts, and an
unmounted-but-never-disposed root keeps `systemIconModel` / `customEditorRegistry` subscriptions
alive on a detached tree.

**The traps that follow from the pool contract.**

| Trap | Rule |
|---|---|
| `release()` does not reset | row structure is recovered through a `WeakMap<HTMLElement, CellRecord>` holding kind, current index and the row view. `CellRecord` carries a comment saying so, because a future "helpful" reset in `CellPool.release()` would silently break `ListBox` |
| **the pool is untyped** | `p.recycle?.()` can hand back a wrapper whose last occupant was a section row or a custom `renderItem` cell. Always branch on `record.kind` **first**: same kind → `view.update(next)`; different kind → dispose the old row view / run the old slot cleanup, then install the new content. Missing this renders section markup under item props, with no error |
| listeners survive recycling | install `click` / `mouseenter` / `contextmenu` **once at wrapper creation**, reading `record.index`, which is rewritten every render. Zero per-frame listener work |
| DOM shape is frozen (C3-5) | the row index stays in `CellRecord`, **not** in a `data-row` attribute. Today's positioned wrapper carries only `style` |
| `fillSlot` owns its host | no `replaceChildren` / `append` / `textContent` behind its back, and never run the previous cleanup first. Each slot needs its **own** host element. Call `fillSlot` on the wrapper only on create or kind-change — re-appending the same `view.root` every frame is a pointless DOM write |
| `renderItem` returning `null` | releases that element's root. `ListBox.tsx:107` routes `item.section` to `SectionItem` *before* consulting `renderItem`; preserve that ordering rather than relying on the caller (`BuiltinEditorsList.tsx:88` returns `null` for sections) |
| heterogeneous slots | `fillSlot(host, null)` after a React slot calls `releaseReactSlot`, so a list alternating rows with and without `trailing` would create and destroy a root per recycle. Trait sets return the same kind for every row in practice; if a real list turns out mixed, fill with a stable empty React element instead of `null` |

**Delegation was considered and rejected** in favour of per-wrapper listeners, on one decisive fact:
`mouseenter` does not bubble. Container delegation would have to use `mouseover`, which fires on
every descendant and on intra-row moves — a behaviour change to `onActiveChange` in exchange for
saving ~100 listeners installed once.

`attach-tooltip` **fully removes** the per-row React `Tooltip` wrapper. `Tooltip.tsx` is already a
`cloneElement`-ref shim over `attachTooltip` (`Tooltip.tsx:74`), so calling it directly is
behaviourally identical with byte-identical DOM — and strictly better: `LinksList.tsx:148` passes
`<LinkTooltipContent/>`, which today sits inside a React wrapper on every row. When `tooltip` is
`null`, `false` or `""`, pass `disabled: true` rather than skipping the attachment, so
`attach-tooltip.ts:203-206` handles the transition and no attach/detach churn happens when a tooltip
appears mid-life.

**Guard rails, written into `uikit/CLAUDE.md` beside the C3-2 exemption** so this does not creep: the
engine's cell contract stays `HTMLElement`; a row whose slots are all DOM-representable creates no
root; roots are per pooled element, never per row; and **US-1016 makes `MultiListBox` build its
checkbox rows directly instead of through `renderItem`**, so every remaining consumer of the escape
hatch is app-layer and already scheduled for D/E — the seam drains the same way `RenderGrid` does.

Rejected: a root per row created on admission and unmounted on eviction (`createRoot` per admitted
row per frame, and `root.unmount()` racing the pool for an element already handed to its next
occupant). One React root over the whole cells region (the engine appends/removes children of
`regions.cells` and writes their geometry — React would fight `syncRegion` for the same children). A
parallel `renderItemDom?: (ctx) => HTMLElement` prop (new public API with no consumer, in the epic
whose rule is "no call-site change"; and `SlotContent` already accepts a DOM `Node`).
`renderToString` (loses events and state, and both icon components subscribe to live stores).

### D4 — The three arms: one stable root, an eager message host, and an engine created on entry to the real arm

`ListBox.tsx` returns three structurally different trees today (`:151` loading, `:168` empty, `:190`
real). A vanilla view has one stable root, so:

- **Root** — a `div` created in the constructor, `data-type="list-box"`, its class from `ListBox.css`.
- **Message host** — created eagerly in `onMount` as `<div data-part="message">`, replacing today's
  `EmptyRoot` (`ListBox.tsx:34-44`). It carries the spinner plus `loading…` for the loading arm and
  `emptyMessage` for the empty arm. `emptyMessage` is `SlotText` (`types.ts:118`), possibly a React
  node, so its content goes through `fillSlot`. Detached with `.remove()` whenever the arm is real.
- **Engine** — a `VirtualGridView` created on **entry** to the real arm and **disposed on leaving**
  it, held in a nullable field.

**Why create-and-dispose rather than retain-and-hide** (this overrides the recommendation, which
proposed keeping the engine alive behind `display: none`). Retaining it is cheaper in the abstract,
but it turns a settled question into an open one: hiding the container zeroes its `scrollTop`, the
model latches `scrollLost` (`VirtualGridModel.ts:264-269`), and on reshow `paint()` calls
`restoreScroll()` — putting a **stale offset back into a dataset that was replaced while the list was
in the loading or empty arm**. That is precisely the "blank band" failure `restoreScroll`'s own doc
comment warns about (`:558-568`), and avoiding it needs a way to reset the offset and clear the latch
that the engine does not expose. The recommendation conceded the point by proposing to reset the
offset to 0 on re-entry — which is exactly what a fresh engine gives for free.

Meanwhile the cost is not a regression: React discards and rebuilds the whole subtree at every arm
switch today, so create-and-dispose is *behaviour-identical*, and the rebuild is nine region divs and
a fresh `CellPool` once per arm transition (once per dropdown open for `Select`). The eager
alternative is worse than both: a `ListBox` mounting in the loading arm would measure a zero-sized
container and latch `scrollLost` at birth for no reason.

`SubtreeSwap` is the wrong tool and is rejected explicitly: its contract is *create a branch, insert
it, dispose and detach the old one* (`subtree-swap.ts:29-46`), which is the right semantics but the
other two arms are not `IOwnedView`s at all — they are one div with different content. Using it would
mean wrapping trivial DOM in two throwaway view classes to obtain semantics we can express in four
lines. Note also that `this.child()` **cannot** be used for the engine: `children` is append-only
(`vanilla-view.ts:158-163`), so a recreated grid would accumulate dead references. Hold it in a field
and register one `own(() => this.grid?.dispose())`.

**Root attributes — the removal side is where this breaks.** React's three returns differ by
attribute *presence*, not just value, and presence is snapshot-visible. `applyArm()` is the only
place these are written, and it always writes both branches:

| Attribute | loading | empty | real | Vanilla must |
|---|---|---|---|---|
| `data-loading` | `""` | absent | absent | set / `removeAttribute` |
| `data-empty` | absent | `""` | absent | set / `removeAttribute` |
| `role` | absent | absent | `"listbox"` (`:195`) | **`removeAttribute("role")` on leaving real** |
| `tabindex` | **absent** | **absent** | `0` or `-1` (`:197`) | `removeAttribute("tabindex")` — `root.tabIndex = -1` is *not* the same as absent |
| `aria-activedescendant` | absent | absent | id or absent (`:198`) | remove when `activeId` is undefined **and** when leaving real |
| `data-focus-selection` | **absent** | **absent** | `""` when `selectionStyle === "focus"` (`:196`) | easy to get wrong — today the loading arm does not carry it |

Two ordering rules taken from the React source:

1. `{...rest}` is spread **last** in all three arms (`:159`, `:176`, `:201`), so a caller-supplied
   `role` / `tabIndex` / `aria-*` wins. In vanilla: run `applyArm()` first, then `applyRestProps`,
   the same order `CategoryListView.applyRootProps` uses (`CategoryListView.ts:274-293`). Reversing
   it silently drops caller overrides.
2. `id` (`model.rootId`) is on all three arms and is not an arm concern.

**Listeners: install once, gate on arm.** `contextmenu` → `model.onRootContextMenu` is present in all
three arms (`:158`, `:175`, `:200`), so one permanent `this.listen(root, "contextmenu", …)`. Its "row
menu wins" gate reads `e.contextMenuEvent?.items.length` on the *native* event
(`ListBoxModel.ts:153`), so the method's parameter becomes a native `MouseEvent`. `keydown` is
real-arm-only in React, but `ListBoxModel.onKeyDown` already self-gates on `keyboardNav`
(`:158`); install it permanently plus one `if (this.arm !== "real") return`. A listener is not in the
DOM snapshot, and with no `tabindex` the root cannot be focused, so nothing observable changes.

**Observable versus free — the ledger this task is verified against.**

*Must match React exactly:* the per-arm attribute sets above including absences; `id`; the cell
wrapper `div` per row with its click / mouseenter / contextmenu behaviour (`:138-148`); row `id`
values from `model.itemId` and their agreement with `aria-activedescendant`; row-menu-before-
container-menu precedence; the `.label` class on `ListItem`'s span; `onKeyDown`'s keyboard semantics;
scroll-to-active on `activeIndex` change.

*Free:* whether the engine exists while another arm shows; listener attach strategy; cell recycling;
`data-part="message"` on the message div (Emotion's hashed `css-…` class cannot be preserved and does
not need to be — "class names" in C3-5 means stable public hooks like `.label` and
`.highlighted-text`); the id-generator format, as long as ids stay unique, stable across updates and
self-consistent with `aria-activedescendant`.

### D5 — One `ListItemView`, driven by both the pooled rows and the React face

```
ListBox/
  ListBox.tsx        → props/types (unchanged) + mountVanilla(ListBoxView, props)
  ListBoxView.ts     → the container view (D1, D2, D4)
  ListBox.css
  ListBoxModel.ts    → same public surface, both effects shed
  ListItem.tsx       → props/types (unchanged) + mountVanilla(ListItemView, props)
  ListItemView.ts    → the single source of truth for the row's DOM
  ListItem.css
  SectionItem.tsx    → props/types (unchanged) + mountVanilla(SectionItemView, props)
  SectionItemView.ts
  SectionItem.css
  types.ts, index.ts → unchanged
```

`ListItemProps` / `SectionItemProps` stay declared in the `.tsx` (where `index.ts` already re-exports
them from) and the views import the type from there — the same direction as `CategoryListView.ts:6`.

**Why a `VanillaView` subclass per row, and not a `createRow`/`updateRow` function pair.** A
`ListItem` row owns **per-row disposable resources**: a tooltip attachment and up to three `fillSlot`
cleanups. That is what `VanillaView`'s `own()` and ordered `dispose()` exist for
(`vanilla-view.ts:90-132`). The function-pair form is right for `CategoryList` because its rows own
nothing but two listeners; here it would force a hand-rolled per-element resource record and disposal
path in a `WeakMap` — reimplementing the base class badly.

The decisive argument is **drift**. `mountVanilla` makes the React face four lines over the *same*
class the virtualized path drives, so there is exactly one implementation of the row's DOM. The
option rejected hardest is "a thin React component that renders the same DOM independently": two
implementations of a row with six state attributes, three slots, three variants × three selection
styles and a drop state will diverge, and nothing in the build would catch it.

**How the virtualized path drives it.** In `ListBoxView`'s bound `renderCell`, replacing
`ListBox.tsx:103-149`:

```ts
const wrapper = p.previous ?? p.recycle?.() ?? document.createElement("div");
```

The **wrapper div is kept**. It preserves the existing DOM shape, and — the structurally important
part — it is the element the engine positions absolutely, writing
`display/position/left/top/width/height` onto it (`VirtualGrid/types.ts:47-54`). `ListItemView`'s root
stays an ordinary in-flow child, so **`ListItem.css` is not subject to C3-8's absolute-positioning
constraint at all**. That is a reason to keep the wrapper, not merely a consequence of keeping it.

Per-wrapper state lives in `WeakMap<HTMLElement, CellRecord>` — `{ kind: "item" | "section" |
"custom", index, view?, slotCleanup? }`. Listeners are installed once at creation and read
`record.index`. Row views are collected in a `Set<VanillaView<unknown>>` disposed by one `own()`.

**`ref` and `...rest`** are handled inside `ListItemView` exactly as `CategoryListView` does:
`applyRestProps` + `createRestPropsState` per view, `clearRestListeners` in `onDispose`, and
`bindRef(this.root, props.ref)` re-bound in `onUpdate` when the `ref` identity changes. Both app-layer
call sites' drag handlers map correctly through `applyRestProps` (`react-compat.ts:83-98`, whose
`doubleclick → dblclick` special case is already there), and `toPublicEvent` proxies `dataTransfer`
off the native event.

**Two incidental bugs this task fixes, both found during investigation.**

1. **`applyRestProps` writes `draggable=""` for `draggable={true}`** (`react-compat.ts:106`:
   `value === true ? "" : String(value)`). `draggable` is an *enumerated* attribute, not a boolean
   one — `draggable=""` is an invalid value whose default is `auto`, i.e. **a `div` that is not
   draggable**; React writes `draggable="true"`. `LinksList.tsx:151` and `PinnedLinksPanel.tsx:111`
   both pass it, so `ListItem` is the first converted component to expose the bug: nothing in
   `uikit/` routes `draggable` through rest props today (`ImageViewportView.ts:38` sets the
   *property* directly). Fixed generally, by special-casing the enumerated attributes `draggable`,
   `spellcheck` and `contenteditable` to write `"true"`. Failure mode otherwise: silent drag loss in
   the link editor.
2. **`SectionItem`'s `text-overflow: ellipsis` (`SectionItem.tsx:36`) is a pre-existing no-op** — the
   element is `display: flex`, so its text is an anonymous flex item and `text-overflow` does not
   apply. **Carried over verbatim and flagged, not fixed**: making it work would change how long
   section labels render, which is a separate decision, not a conversion.

### D6 — CSS: `selection-style.ts` is copied, not shared, and not yet deleted

**`uikit/shared/selection-style.ts` is left completely untouched.** `ListItem`'s share is written as a
hand-translated copy in `ListItem.css`; the file is deleted by the task that converts its last
consumer (US-1015 for `Tree`/`TreeItem`, plus `ui/sidebar/FolderItem.tsx`). This is what C3-7 already
decided — "the shared rules living in whichever stylesheet owns the row" — and what C2 did for
`CategoryList` (compare `CategoryList.css:61-71` against `focusSelectionOverride`'s output: a verbatim
hand-translation into the component's own stylesheet). The three remaining Emotion consumers each
scope the fragments to their *own* root selector, so a static copy scoped to
`[data-type="list-item"]` cannot collide in either direction. `ListItem.tsx` simply stops importing
the module.

Rejected: a shared `uikit/shared/row-selection.css`. The three Emotion consumers cannot consume it, so
it reduces no duplication now; it *adds* a cross-file source-order dependency for rules whose
correctness depends on order; and its selectors would have to be keyed on something generic, which
conflicts with the "scope from the component's `[data-type]` root" rule. Revisit when `TreeItem`
converts and there are two real consumers. Also rejected: converting the three consumers now — out of
scope, and it drags app chrome into a UIKit task.

**Rule order is load-bearing and must survive inside one file.** Emotion emitted these in source
order and two rules depend on it: the `[data-drop-active]` rule is deliberately last so it outranks
hover and accent-selection at equal specificity (`ListItem.tsx:122-128`), and the focus-within
override carries `:not([data-drop-active])` because it is one attribute *more* specific and would
otherwise win (`:120`). Both are preserved literally — which is the strongest argument for keeping
every row rule in `ListItem.css` rather than splitting it.

**The audit against C3-8.** Because the wrapper is the absolutely positioned element (D5), most of
the block is safe as-is. Sibling, `:nth-child`, `+`, `~` and `:empty` selectors: **none present** in
either file. Two rules do need rethinking:

| Rule | Verdict |
|---|---|
| `& > svg` (`ListItem.tsx:130-134`) | **Breaks.** Today `renderIcon(icon)` puts the `<svg>` directly under the row (`:192`). In the vanilla view an `IconName` stays a direct child via `createIconElement`, but a **React-node icon** — exactly what both app call sites pass — goes through `fillSlot`, which interposes `<span data-part="react-slot" style="display:contents">` (`fill-slot.ts:57-62`). The svg becomes a grandchild and loses its 16px sizing and `flex-shrink: 0`. Fixed in CSS, not by dropping the child combinator: `[data-type="list-item"] > svg, [data-type="list-item"] > [data-part="react-slot"] > svg { … }`. `display: contents` keeps the svg a flex item of the row, so `flex-shrink: 0` still works. **The single highest-risk item in the conversion** — the symptom is a giant or collapsed icon in the link editor only, never in the story |
| `& > .label` (`:136-142`) | Survives, but only if the view creates the `<span class="label">` itself and uses it as the `fillSlot` **host**, never as content. Then `.label` stays a direct child for both the string path and the React path. Keep the class name — it is a public hook, unlike the Emotion hash |

**The correction, found in the app after implementation.** The `& > svg` rule was translated as
two selectors under `[data-part="icon"]` only. But `& > svg` was never an *icon* rule — it matched
**every** svg the row put at its top level, and `ListItem` puts two there: the leading icon and the
default trailing check/chevron. Scoping the replacement to the icon slot left the trailing check with
no size at all, so it fell back to its intrinsic 24x24 inside a 22px row — visibly oversized in every
`Select` dropdown, which is exactly where the user found it.

The rule now names both levels of **both** slots. It deliberately stays on child combinators rather
than widening to a descendant selector: a custom `trailing` such as an `IconButton` renders its svg
deeper than one level, and the Emotion rule did not size that either — measured, a caller-supplied
`<button>` keeps its own 40x18 box with its inner svg untouched at 24x24. Widening the selector would
start resizing icons inside caller-supplied controls, which is a different bug in the same rule.

`width: 100%` + `box-sizing: border-box` are safe as a wrapper child, resolving against the wrapper's
engine-written width. The row sets no `height`; it stretches because the wrapper is `inline-flex` with
default `align-items: stretch`. **Do not "fix" this by adding `height: 100%`.**

One thing to verify in the story rather than assume: `rowFocusSelectionOverride`'s ancestor selector
(`[data-focus-selection]:focus-within &…`) now has to cross two extra levels the Emotion version never
did — the engine's scroll container and its cells region. The ancestor is the ListBox root, which sits
outside the scroll container, so `:focus-within` should still match; confirm it with the
`selectionStyle="focus"` arm.

Colour translation follows `CategoryList.css`: `--color-text-default`, `--color-bg-selection`,
`--color-bg-light`, `--color-bg-message`, `--color-bg-tree-selection`, `--color-text-selection`,
`--color-text-dark`, `--color-border-active`, each with a fallback. All exist in every theme.

### D7 — `gridRef` stays public and is retyped; ids come from a shared counter

`ListBoxModel.gridRef` becomes `VirtualGridModel | null`. It stays public: `onKeyDown` needs
`visibleRowCount`, and the field is not read outside `uikit/ListBox/` — verified, the only external
consumer is `UrlSuggestionsDropdown.tsx:40`, which calls `model.scrollToIndex(hoveredIndex)`. The
`RowAlign` union is textually identical in both engines
(`VirtualGrid/types.ts:32` and `RenderGrid/types.ts:20`), and no file imports it through `ListBox`, so
`scrollToIndex`'s signature is unchanged for every caller.

`useId` is replaced by a shared counter in `src/renderer/uikit/shared/element-id.ts`, following
`tooltipRegistry.nextId()`'s shape (C3-5). `ListBox` is the first of the five sites; the remaining
four convert in US-1015, US-1017 and US-1018. `model.setReactId` becomes `model.setElementId` fed by
the view, so `rootId` and `itemId` are unchanged in form.

## Implementation plan

### Step 1 — `src/renderer/core/state/model.ts`: export `depsChanged`

One word. `function depsChanged(` (line 4) becomes `export function depsChanged(`, and the parameter
types widen to `readonly unknown[] | undefined` / `readonly unknown[]`. No behaviour change; the
in-file callers are unaffected.

### Step 2 — `src/renderer/uikit/shared/deps-gate.ts` (new, ~30 lines)

`createDepsGate()` returning `{ changed, prime }` per D1, built on the exported `depsChanged`. Doc
comment states the two rules: the signature must be **fixed length**, and `changed()` is called at
most once per update.

### Step 3 — `src/renderer/uikit/shared/element-id.ts` (new, ~12 lines)

```ts
let next = 1;
/** Process-unique id fragment for a component instance. Replaces React's useId (EPIC-056 C3-5). */
export function nextElementId(prefix: string): string { return `${prefix}-${next++}`; }
```

### Step 4 — `src/renderer/uikit/shared/highlight.ts`: add the DOM form (C3-7)

Add `highlightInto(host: HTMLElement, text: string, searchText: string | null | undefined,
extraClassName?: string): void` — same tokenizing and same `.highlighted-text` class as the React
form, building text nodes and `<span>`s and writing them with `host.replaceChildren(...)`. Keep the
non-breaking-space promotion for leading/trailing spaces on leaf non-matches, which is the one
non-obvious behaviour in the React version. The React `highlight` stays for `AVGrid` (C4).

**`highlightInto` must not be used on a `fillSlot`-owned host.** The label host is owned by
`fillSlot` in the React-label path, so the view picks one owner per render: `fillSlot` for React
labels, `highlightInto`/`textContent` for string labels, and it clears the other owner's state by
calling `fillSlot(host, null)` when switching from React to string.

### Step 5 — `src/renderer/uikit/shared/react-compat.ts`: enumerated attributes

In `applyRestProps`, replace `value === true ? "" : String(value)` with a check against a
module-level `const ENUMERATED = new Set(["draggable", "spellcheck", "contenteditable"])`: for those
keys write `"true"` / `"false"`, for everything else keep today's behaviour. Comment names the
failure (D5, bug 1).

### Step 6 — `src/renderer/uikit/VirtualGrid/VirtualGridModel.ts`: the pending scroll (D2)

The five edits listed in D2 verbatim: the `pendingScrollRow` field, the `measured` getter, the guard
plus post-await guard in `scrollToRow`, the consume-once flush at the end of `onFrameResize`'s
size-change branch, and the clear in `dispose()`. Also update the file header's mapping table to name
the new field, and `VirtualGrid/index.ts` needs no change (the getter is on an already-exported class).

### Step 7 — `src/renderer/uikit/ListBox/ListItemView.ts` (new, ~200 lines)

`export class ListItemView extends VanillaView<ListItemProps>` with a **public** constructor.

- Constructor: root `div`, no child DOM.
- `onMount()`: build `<svg-or-icon-host>`, `<span class="label">`, `<span data-part="trailing">` as
  three stable hosts; `applyProps(this.props)`; `attachTooltip(this.root, this.tooltipOptions(props))`
  registered with `own()`; `bindRef`; `own(clearRestListeners)`; `own` each slot cleanup.
- `applyProps(props)` writes, in this order: `dataset.type = "list-item"`, `data-name`,
  `data-variant` (default `"select"`), `data-selection-style` (default `"check"`), `data-selected`,
  `data-active`, `data-disabled`, `data-drop-active`, `role="option"`, `aria-selected`,
  `aria-disabled`, `id`; then the three slots; then `applyRestProps` **last**.
- Slots per D3: icon → `createIconElement` for an `IconName`, `fillSlot` otherwise, nothing when
  absent; label → `textContent` / `highlightInto` / `fillSlot`; trailing → `props.trailing` when set,
  else the default `chevron-right` (accent) or `check` when `selected && showSelectionIcon &&
  selectionStyle !== "focus"`, else nothing. The default-trailing logic is transcribed from
  `ListItem.tsx:170-174` unchanged.
- `onUpdate(props)`: `applyProps(props)` + `attachment.update(...)`.
- `onDispose()`: `clearRestListeners`, clear ref, clear slot cleanups.

### Step 8 — `src/renderer/uikit/ListBox/SectionItemView.ts` (new, ~50 lines)

Trivial: root `div`, `data-type="list-section"`, `data-name`, `id`, `role="presentation"`,
`textContent = label`, `applyRestProps` last, `bindRef`. Pure DOM, no slots, no tooltip.

### Step 9 — `ListItem.css`, `SectionItem.css` (new)

Hand-translated from the two Emotion blocks per D6, `@layer uikit`, in the original rule order, with
the `> svg` fix and the `.label` child rule. `ListItem.css` absorbs `rowSelectionBase` and
`rowFocusSelectionOverride('[data-selection-style="focus"]:not([data-drop-active])')` as static
rules. Imported by their respective `*View.ts`.

### Step 10 — `src/renderer/uikit/ListBox/ListBoxModel.ts`

- `gridRef: VirtualGridModel | null`; import `VirtualGridModel` and `RowAlign` from `../VirtualGrid`.
- Delete **both** `effect()` calls (`:224`, `:255`) and the whole `init()` body except
  `this.props.onModel?.(this)`.
- Add `repaintSignature()` per D1.
- `setReactId` → `setElementId` (same shape); `rootId`/`itemId` unchanged.
- `onItemContextMenu(e: MouseEvent, idx)` and `onRootContextMenu(e: MouseEvent)` — native events;
  `onKeyDown(e: KeyboardEvent)` likewise. `ContextMenuEvent.fromNativeEvent` already accepts a bare
  native event (`context-menu.ts:62`).
- `onRootContextMenu` reads `e.contextMenuEvent?.items.length` directly instead of
  `e.nativeEvent.contextMenuEvent`.
- Everything else — the two memos, `isSelectedAt`, `findNextSelectable`, the keyboard switch,
  `scrollToIndex`, `onUnmount` — is unchanged.

### Step 11 — `src/renderer/uikit/ListBox/ListBoxView.ts` (new, ~330 lines)

`export class ListBoxView<T = IListBoxItem> extends VanillaView<ListBoxProps<T>>`, public constructor.

- Constructor: root `div`; `this.driver = createComponentModelDriver(props, ListBoxModel as …,
  defaultListBoxState)`; `this.model.setElementId(nextElementId("lb"))`;
  `own(() => this.driver.dispose())`; `own(() => this.grid?.dispose())`;
  `own(() => this.rowViews.forEach(v => v.dispose()))`.
- Fields: `arm: "loading" | "empty" | "real"`, `grid: VirtualGridView | null`, `messageHost`,
  `repaintGate`, `lastActiveIndex`, `cells: WeakMap<HTMLElement, CellRecord>`,
  `rowViews: Set<VanillaView<unknown>>`, `restPropsState`.
- `onMount()`: build the message host; `applyArm(this.props)`; `listen(root, "contextmenu", …)`;
  `listen(root, "keydown", …)`; `this.driver.mount()`; `syncActiveScroll(props.activeIndex)`;
  `repaintGate.prime(model.repaintSignature())`.
  **Order note:** `driver.mount()` runs `init()` → `props.onModel?.(this)`, and a consumer may call
  `scrollToIndex` synchronously from that callback — so the grid must already be created and its
  model assigned to `model.gridRef` before `driver.mount()`. `applyArm` does that.
- `onUpdate(props)`: the four steps in D1's block.
- `applyArm(props)`: compute the arm from `props.loading` / `resolved.length`; on entering real create
  the grid, append its root, `grid.mount()`, `model.setGridRef(grid.model)`; on leaving real dispose
  it, remove its root, `setGridRef(null)`; when already real call `grid.update(this.gridProps())`.
  Then write every root attribute per D4's table, then `applyRestProps` last.
- `renderCell` is a **bound field**, not a closure: reads `this.model` and `this.props`.
- `renderCell` body: resolve the wrapper, look up / create the `CellRecord`, install the three
  listeners on creation, branch on kind (section → `SectionItemView`; `renderItem` → keyed fragment
  through `fillSlot`; default → `ListItemView`), apply `p.style` to the wrapper, and return it.
- `syncActiveScroll(ai)`: store `lastActiveIndex`, return early on `null`/negative, otherwise one
  unconditional `void this.grid?.model.scrollToRow(ai)`.

### Step 12 — `ListBox.css` (new, ~30 lines)

Root: `display: flex; flex-direction: column; flex: 1 1 auto; outline: none`, the
`[data-disabled]` arm, and `[data-part="message"]` carrying today's `EmptyRoot` rules
(centred flex, `gap`, `flex: 1 1 auto`, `--color-text-light`).

### Step 13 — `ListBox.tsx`, `ListItem.tsx`, `SectionItem.tsx` become shims

Each keeps its prop interface and type re-exports **verbatim** and returns `mountVanilla(View, props)`.
`ListBox.tsx` keeps the `as <T = IListBoxItem>(props: ListBoxProps<T>) => React.ReactElement | null`
cast so its generic call signature is unchanged, and keeps re-exporting `LIST_ITEM_KEY` and the three
types from `./types`. No Emotion import survives in the folder.

### Step 14 — `ListBox.story.tsx`

No structural change — it drives the React face. Add one control, `rowCount`, so the story can
actually virtualize (60 items never exercises the pool), and add a stats line reporting
`grid.stats.paints` plus a React-root count, so D1's "one paint per keystroke" and D3's "a settled
scroll over the default path creates zero roots" are assertions rather than claims. Exposing those
needs a `onView`-style callback on `ListBoxView`; add it as a **story-only** field read through
`onModel`, not a new public prop.

### Step 15 — docs

- `src/renderer/uikit/CLAUDE.md` — a subsection under Rule 9 beside the C3-2 exemption stating D3's
  four guard rails, and one line in the row-selection contract section noting that `ListItem`'s
  fragments are now static CSS while `Tree`/`FolderItem` still use `shared/selection-style.ts`.
- `doc/epics/EPIC-056.md` — amend C3-6 rows 2 and 4 per D2 (the trigger is the host view's
  `onUpdate`, and the engine gains a pending-scroll slot because `attach()`'s pass alone does not
  cover a root without layout); record the memo-deps precedent from D1 as the answer to B13's fourth
  row; note the `MultiListBox`-drops-`renderItem` obligation for US-1016; mark US-1014 in progress.
- `doc/active-work.md` — add the US-1014 link under EPIC-056.

## Concerns

1. **`Select`'s async-loading arm is the real exposure, and it is not in any story.** The `loading`
   prop toggles the arm, which under D4 destroys and recreates the engine, and it is also the path
   where D2's pending scroll matters most (a popover that lays out after its content is built). The
   ListBox story can drive `loading`, but not *in a popover*. Verify by hand in the app against a
   `Select` with an async `items` source before this task is called done, or accept that US-1017 is
   where it gets found.
2. **Two React roots per pooled element is the worst realistic case** (`FileList` supplies both a
   React `icon` and, via `getTrailing`, a React `trailing`). That is ~68 roots for a 30-row window.
   Bounded and created once, but worth measuring rather than assuming — the story's root counter is
   there for this.
3. **`MultiListBox` gets temporarily slower.** It uses `renderItem` for every row, so until US-1016
   converts it, each of its visible rows carries a retained React root. It is a dropdown over a
   filter list, so the absolute cost is small; the point is not to read a `MultiListBox` measurement
   as the `ListBox` number.
4. **`:focus-within` across the engine's two extra DOM levels** is the one CSS behaviour I could not
   settle by reading (D6). If it fails, the `selectionStyle="focus"` arm loses its blue focused
   state — visible immediately in the story, so cheap to catch, but name it before assuming.
5. **`highlightInto` and `fillSlot` must not both own the label host.** Named in Step 4 with the fix;
   the failure mode is a label that stops updating after one React→string transition, with no error.
6. **The story's `renderItem` arm exercises `ListItem` inside `renderItem`** (`ListBox.story.tsx:81`),
   which means a React `ListItem` — hence a `mountVanilla` host — inside a `fillSlot` React root
   inside a pooled cell. That is three seams deep and is the most likely place for a disposal-order
   surprise. It is also a genuinely useful test, so keep it.
## Acceptance criteria

- `npx tsc --noEmit`, `npm run lint`, `git diff --check` all clean.
- `ListBoxModel` registers **zero** `effect()` calls, and is driven by `createComponentModelDriver`
  without its `mount()` throwing.
- No React call site changed: `git diff --stat` touches nothing under `components/`, `editors/`
  (except the story registry if needed) or `ui/`.
- The ListBox story's 11 controls all behave as before, including `loading`, `customRow`,
  `sections`, `contextMenu`, `predicateSelection` and all three `selectionStyle` arms.
- `browser_snapshot` of the story before and after the conversion produce the same `data-*` tree.
- `uikit/ListBox/` contains no `@emotion` import.
- The two `ListItem` app-layer call sites (`LinksList`, `PinnedLinksPanel`) still render their
  React icons, React tooltips, trailing nodes and drag behaviour.
- `Select`, `Autocomplete` and `MultiListBox` — the three in-`uikit/` consumers — still work,
  including `Select`'s keyboard-driven `activeIndex` scroll-into-view from a freshly opened popover.

## Verification results

`npx tsc --noEmit`, `npx eslint src/renderer/uikit`, `git diff --check` — all clean. Behaviour was
checked by rendering the React `<ListBox>` face into an offscreen root in the running app, so every
number below comes from the real engine and the real CSS.

### The arms, and the frozen attribute contract

| Check | Result |
|---|---|
| real arm | `role="listbox"`, `tabindex="0"`, `aria-activedescendant="lb-3-item-0"`, no `data-loading` / `data-empty` |
| loading arm | `data-loading` present; `role`, `tabindex`, `aria-activedescendant` all **absent**; message `"loading…"`; `[data-type="spinner"]` present; no engine in the DOM |
| empty arm | `data-empty` present, `data-loading` absent, message from `emptyMessage`, no engine |
| back to real | `role`, `tabindex` and `data-focus-selection` restored; sections render as `[data-type="list-section"]`; `aria-activedescendant="lb-3-item-a1"` for `activeIndex: 2` over a sectioned list |
| `selectionStyle="focus"` | `data-focus-selection` on the root, `data-selection-style="focus"` on rows, one `[data-selected]` row |

The same view instance served every arm (its generated id stayed `lb-3` throughout), which is the
point of D4: one stable root, attributes and children swapped in place.

### The row, and the highest-risk CSS item

| Check | Result |
|---|---|
| React-element icon (`<GlobeIcon/>`) | `[data-part="icon"] > [data-part="react-slot"] > svg`, rendered box **16px** — the `> svg` rule's replacement works through both `display: contents` levels |
| `IconName` icon (`"check"`) | `[data-part="icon"] > svg` directly, **0** `[data-part="react-slot"]` elements anywhere — the DOM path creates no React root at all |
| label | `class="label"` preserved; one `.highlighted-text` span for `searchText: "apple"` |
| standalone `<ListItem>` (the `LinksList` shape) | `data-name`, `data-variant="browse"`, `data-selection-style="focus"`, `data-selected`, `role="option"`, `aria-selected="true"`; `trailing` node present; **no** default check icon under `showSelectionIcon={false}`; icon 16px |
| **`draggable`** | attribute `"true"`, `element.draggable === true` — the `applyRestProps` fix. Before it: `""` and `false` |
| drag + click through `...rest` | `onClick` and `onDragStart` both fired |
| standalone `<SectionItem>` | `id`, `data-name`, `role="presentation"`, text content correct |

### Two defects found in the app after implementation, and fixed

Both came from the same screenshot of a `Select` dropdown: the selected row's check icon was
oversized.

| Defect | Cause | Fix | Measured after |
|---|---|---|---|
| the default trailing check/chevron had **no size**, rendering at its intrinsic 24x24 in a 22px row | the Emotion `& > svg` rule matched *both* top-level slot svgs; the translation scoped it to the icon slot only (see D6's correction) | the rule names both levels of both slots, still on child combinators | trailing svg **16x16** for `check` and for `accent`; a custom `<button>` trailing keeps 40x18 with its inner svg untouched at 24x24 |
| an **unknown icon name rendered as literal text** in the row | `setIcon` only special-cased *valid* names and let every other string fall through to `fillSlot`, whose string arm writes `textContent`. React's `renderIcon` returned `null` for an unknown name | a string is always an icon-name attempt: unknown names render nothing | `icon: "not-a-real-icon"` → row text `"row A"`, icon host has **0** child nodes |

The second was surfaced only because the first probe used `icon: "folder"` — which is not a
registered icon name — so a check written to verify one bug exposed another.

### Virtualization and pooling

10,000 rows, a 360x300 host, 24px rows:

| Phase | Row elements in the DOM |
|---|---:|
| first paint | 13 |
| after 20 scroll steps | 15 |
| after 60 scroll steps (24,000px) | 15 (19 wrappers total in the cells region) |

Bounded, and flat across a long scroll — the pool is doing its job through the row-view layer.

### The repaint gate (D1)

DOM writes inside the cells region, counted with a `MutationObserver` across one re-render:

| Change | Mutation records |
|---|---:|
| a new props object with **identical values** | **0-1** |
| `searchText` changes | 84-118 (13 rows repainted) |
| `variant` changes | 84 |
| `selectionStyle` changes | 118 |

The first row is the gate working. The last two are the correction recorded in D1 earning its keep:
`variant` and `selectionStyle` are **not** in the effect's historical dep list, and with a stable
`renderCell` their omission would have left the rows stale. `data-variant="browse"` and
`data-selection-style="accent"` were both confirmed applied on the rows after the change.

### Scroll-into-view (D2)

| Case | `scrollTop` | model `offset.y` | Top painted row | Active row painted |
|---|---:|---:|---|---|
| measured at mount, `activeIndex: 2500` | 59,724 | 59,724 | Row 2488 | yes |
| **built inside a `display: none` host**, `activeIndex: 4000`, then revealed | 0 → 95,724 | 95,724 | Row 3988 | yes |

The second row is the case the epic's `attach()`-time pass does not cover on its own and the one the
old `setTimeout(0)` was approximating. Before the fix described in D2 it produced `scrollTop: 95,724`
with **row 0 still painted at the top** — a scrolled container showing a blank band.

### Arm cycling

`real → loading → real` leaves `scrollTop: 0` with row 0 at the top, matching React's teardown of the
whole subtree. That is D4's create-and-dispose choice being behaviour-identical rather than merely
cheaper.

### The `renderItem` escape hatch

12 custom cells rendered, `[data-type="list-item"]` count **0**; switching back to the default rows
gave 12 `list-item` elements and **0** custom cells, with correct labels — so the kind-change branch
tears the React roots down and rebuilds the default rows rather than leaving a hybrid.

## Files changed

| File | Change |
|---|---|
| `src/renderer/core/state/model.ts` | `depsChanged` exported and its parameters widened to `readonly` |
| `src/renderer/uikit/shared/deps-gate.ts` | **new** — `createDepsGate`, the effect-free replacement for `effect(fn, deps)` |
| `src/renderer/uikit/shared/element-id.ts` | **new** — `nextElementId`, replacing `useId` (C3-5) |
| `src/renderer/uikit/shared/highlight.ts` | adds `highlightInto` (the DOM form, C3-7); the React `highlight` is untouched |
| `src/renderer/uikit/shared/react-compat.ts` | `applyRestProps` writes `"true"` for the enumerated attributes `draggable` / `spellcheck` / `contenteditable` |
| `src/renderer/uikit/VirtualGrid/VirtualGridModel.ts` | `pendingScrollRow`, the `measured` getter, `flushPendingScroll()`, the queue-when-unmeasured guard and post-await disposal guard in `scrollToRow`, and the clear in `dispose()` |
| `src/renderer/uikit/VirtualGrid/VirtualGridView.ts` | `paint()` calls `model.flushPendingScroll()` on both the normal and the early-return path |
| `src/renderer/uikit/ListBox/ListBoxView.ts` | **new** — the list shell (arms, gate, cells, active-row scroll) |
| `src/renderer/uikit/ListBox/ListItemView.ts` | **new** — the row, and the single source of truth for its DOM |
| `src/renderer/uikit/ListBox/SectionItemView.ts` | **new** — the section header row |
| `src/renderer/uikit/ListBox/ListBox.css` | **new** — root and message host |
| `src/renderer/uikit/ListBox/ListItem.css` | **new** — the Emotion block plus `selection-style.ts`'s two fragments, hand-translated |
| `src/renderer/uikit/ListBox/SectionItem.css` | **new** |
| `src/renderer/uikit/ListBox/ListBox.tsx` | now a `mountVanilla` shim; props, generic call signature and type re-exports unchanged |
| `src/renderer/uikit/ListBox/ListItem.tsx` | now a `mountVanilla` shim; `ListItemProps` unchanged |
| `src/renderer/uikit/ListBox/SectionItem.tsx` | now a `mountVanilla` shim; `SectionItemProps` unchanged |
| `src/renderer/uikit/ListBox/ListBoxModel.ts` | both effects removed; `repaintSignature()` added; `gridRef` retyped to `VirtualGridModel`; native event types; `setReactId` → `setElementId`; `onContextMenu` bridged through `toPublicEvent` |
| `src/renderer/uikit/ListBox/ListBox.story.tsx` | adds a `rowCount` control (default 60, max 10,000) so the story can virtualize |
| `src/renderer/uikit/CLAUDE.md` | D3's guard rails beside the C3-2 exemption; a note that `ListItem`'s selection fragments are now static CSS |
| `doc/epics/EPIC-056.md` | C3-6 rows 1/2/4 amended; the memo-deps precedent recorded; US-1016's `renderItem` obligation noted; status |
| `doc/active-work.md` | US-1014 linked under EPIC-056 |

`src/renderer/uikit/index.ts` and `src/renderer/editors/storybook/storyRegistry.ts` needed **no
change**, and neither did any of the 12 `<ListBox>` call sites, the 2 `<ListItem>` call sites, or
`uikit/shared/selection-style.ts` — which keeps its three remaining consumers.

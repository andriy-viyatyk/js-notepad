# US-1017: `Select` — four effects, async item loading, and the Rule 4 number

**Epic:** [EPIC-056](../../epics/EPIC-056.md) (De-React C3)
**Status:** Implemented — awaiting user testing
**Created:** 2026-08-22

## Goal

Convert `uikit/Select` to a hand-written vanilla view behind an unchanged React-facing signature:
delete all four `effect()` calls in `SelectModel`, compose the already-vanilla `Input`,
`IconButton`, `Popover` and `ListBox` views with **zero React roots in the open dropdown**, and take
EPIC-056's Rule 4 measurement (one keystroke in a `Select` search over a large list).

## Background — the surface, measured

All figures measured 2026-08-22 against `upcoming-v4.0.23` at commit `77dfe5d8`.

| Item | Measure |
|---|---|
| Files | `Select.tsx` **172** (Emotion, 3 declarations), `SelectModel.ts` **612**, `Select.story.tsx` 115, `index.ts` 2 |
| `effect()` | **4** — `SelectModel.ts:520`, `:535`, `:556`, `:577`. All four go (C3-6 rows 5–8) |
| `memo()` | **3** — `selectedResolved` (prop deps), `filtered` (4 state slices + 2 props), `displayText` (2 state slices + 1 memo) |
| `state.update` call sites | **23** in `SelectModel.ts` — more than any other model in the epic (`Tree` has ~8 and got a funnel for it) |
| `SelectState` fields | **9** — `open`, `searchText`, `activeIndex`, `popoverResized`, `loadedItems`, `loadedSources`, `itemsLoading`, `itemsLoaded`, `itemsError` |
| React hooks in `Select.tsx` | `useId` 1, `useComponentModel` 1, `useCallback` 1, `state.use` 1 |
| JSX call sites | **11** across 10 files — 8 app-layer files (10 sites) + `uikit/AVGrid/CellSelect.tsx` |
| `renderIcon` call sites | **1** — the chevron |
| Vanilla views it will compose | `InputView`, `IconButtonView`, `PopoverView`, `ListBoxView` — all four already exist |

### What it renders today

```
<Root data-type="select" data-name data-id data-state="open|closed" data-disabled data-readonly>   ← Emotion
    <Input ref value=displayText … endSlot={<IconButton icon=chevron-up|down …/>} />
    <Popover open onClose elementRef=rootRef placement="bottom-start" offset=[0,2]
             matchAnchorWidth resizable onResize outsideClickIgnoreSelector>
        <ListBox id items=filteredItems value=selectedResolved activeIndex onActiveChange
                 onChange searchText rowHeight growToHeight loading emptyMessage />
    </Popover>
</Root>
```

The Emotion `Root` is three declarations — `display: flex`, `width: 100%`, `min-width: 0` — so
`Select.css` is the cheapest stylesheet in the epic. `width` / `minWidth` / `maxWidth` are written to
the **root's inline style**, not forwarded anywhere; the inner `Input` then fills it, because
`Input.css` is `width: var(--input-width, 100%)`.

### Four findings that change what the epic doc says

**1. The story *does* cover the async arm.** EPIC-056's US-1017 note and Concern 6 both say the async
loading path "has no story coverage (the story passes arrays)". It is not true:
`Select.story.tsx:56-64` has an `itemsMode` control with `array` / `lazy-fn` / `lazy-promise`, the
last returning `delay(items, 500)`. The async arm is the one arm the story exercises *better* than
production does — see finding 2.

**2. No production call site passes a Promise or a function today.** All ten app-layer sites pass a
plain array. The async arm is reachable in production through exactly one path:
`AVGrid`'s `Column.options?: any[] | (() => any[] | Promise<any[]>)`
(`AVGrid/avGridTypes.ts:110`), which `CellSelect` bridges into `ItemsSource` as a function
(`CellSelect.tsx:69-82`). No production column supplies a function — the three that set `options`
pass literal arrays (`GraphDetailPanel.tsx:709,711`, `grid/components/ColumnsOptions.tsx:38`). So the
async arm is **live API with no live caller**, which is why the story is the exposure that matters
and why the interleavings have to be reasoned about rather than smoke-tested.

`CellSelect` is also the path that makes the async arm fire *immediately* rather than lazily: it
focuses the inner input on mount (`CellSelect.tsx:96-98`), Select opens on focus, and the loader is
invoked in that same burst. "Lazy until first open" is, for the only production consumer that could
use it, "eager on mount".

**3. One call site remounts its `items` array on every render.**
`editors/settings/sections/SettingsSections.tsx:88` builds `items` as a fresh array literal inside
the component body, so `props.items` changes identity on **every** prop pump. Today that fires
effect #5 (clear the cache) and then effect #6 (reload it) on every render of that section. Any
replacement has to be safe under a reset-then-reload pair on every single update — see D1.



**4. C3-9's Emotion close target is off by one.** The epic's secondary-count table says `@emotion`
importers in `uikit/` reach **9 at close, all `AVGrid/`**. Measured today: **13** — nine `AVGrid/`
files plus `Select.tsx`, `MultiSelect.tsx`, `Autocomplete.tsx` and `RenderGrid/RenderGrid.tsx`.
US-1017 takes it to 12 and US-1018 to **10**, not 9, because `RenderGrid.tsx` is Emotion and C3-1
deliberately keeps it alive as a React-only survivor on Epic F's removal ledger. The target should
read 10 (9 `AVGrid/` + `RenderGrid`). The correction belongs to US-1018 at epic close; it is recorded
here because this is where it was found.

### DOM contract — unchanged (C3-5)

| Element | Attributes that must survive verbatim |
|---|---|
| root | `data-type="select"`, `data-name`, `data-id="select-N"`, `data-state="open"\|"closed"`, `data-disabled`, `data-readonly`, inline `width`/`minWidth`/`maxWidth` |
| input wrapper | `data-type="input"`, `data-size`, `data-variant`, `data-tone`, `data-disabled`, `data-readonly` (all `InputView`'s) |
| input field | `aria-haspopup="listbox"`, `aria-expanded`, `aria-controls="select-N-listbox"`, `aria-label`, `aria-labelledby` |
| chevron | `data-type="icon-button"`, `data-size="sm"`, chevron-down when closed / chevron-up when open, `tabindex="-1"`, disabled when `disabled \|\| readOnly` |
| popover root | `data-type="popover"`, `data-placement`, `data-scroll`, `data-resizable`, `data-resized` (all `PopoverView`'s) |
| list | `id="select-N-listbox"`, `role="listbox"`, `aria-activedescendant="select-N-listbox-item-<value>"`, `data-type="list-box"`, `data-loading`/`data-empty` arms |

Two of those are load-bearing beyond addressing. `data-id` is interpolated into
`outsideClickIgnoreSelector` (`[data-type="select"][data-id="select-N"]`), which is what keeps a
click on the input from closing the popover the input just opened — so the id must be on the root
*before* the popover can open. And `AVGrid/CellSelect.tsx:44-59` styles the Select through three
descendant selectors (`[data-type="select"]`, `… [data-type="input"]`, `… [data-type="input"] input`),
so the root → input → field nesting is a contract, not an implementation detail.

The id source changes from React's `useId` to `nextElementId("select")` (C3-5), so the *value* goes
from `select-«r7»` to `select-3`. The value is generated and opaque in both cases; the relationship
is what the four attributes above encode, and it is preserved.

### Infrastructure that already exists and is reused unchanged

| Need | Existing piece |
|---|---|
| Model driver with no effects | `createComponentModelDriver` (`core/state/model.ts:275`) — throws if the model registers any `effect()` |
| Replacing `useId` | `shared/element-id.ts` `nextElementId(prefix)` (C3-5) |
| Vanilla input | `Input/InputView.tsx` — binds `props.ref` to its private `<input>` via `bindRef` |
| Vanilla icon button | `IconButton/IconButtonView.tsx` |
| Vanilla popover with a native-DOM content seam | `Popover/PopoverView.tsx` — `contentView?: (host) => IOwnedView`, today used only by `Menu/MenuView.ts:346` |
| Vanilla list | `ListBox/ListBoxView.ts` — owns its own `DepsGate`, `repaintSignature`, and the two scroll entry points |
| React boundary | `shared/mount.tsx` `mountVanilla` |
| Rest-prop/listener application | `shared/react-compat.ts` |

### Files that need NO changes

- `src/renderer/uikit/Select/index.ts` — re-exports `Select` and its three types from `./Select`,
  which keeps its exports.
- `src/renderer/uikit/Select/Select.story.tsx` — the props interface does not change, and its
  `itemsMode` control is exactly the coverage this task needs. It is the verification surface, not a
  thing to edit.
- `src/renderer/uikit/index.ts` — the barrel already points at `./Select`.
- All ten app-layer JSX call sites and `AVGrid/CellSelect.tsx` — C3-5.
- `doc/architecture/styling-inventory.md` — a **frozen 2026-08-18 snapshot**, never updated in place
  (its own header says so). US-1016 confirmed this the hard way; it still lists `ListBox.tsx` and
  `Input.tsx` as Emotion files after their conversion. No edit.
- `uikit/RenderGrid/` — C3-1's dying engine. Untouched.

## Decisions

Twelve decisions. Each was put to an independent agent with no conversation context; the reasoning
below is mine after checking each answer against the code, and the places where I overrode an
agent's recommendation are marked.

### D1 — The items-source reset lives in `setProps`, keyed on a model-owned sentinel

`TComponentModel.setProps` is called from `setPropsInternal` **after** `this.props` is assigned and
after `_evaluateEffects()` (`core/state/model.ts:183-188`), so it is the exact hook effect #5
occupied. It runs on every pump, including the first — which happens inside
`createComponentModelDriver(...)`, i.e. inside `SelectView`'s constructor.

```ts
const NO_SOURCE = Symbol("select-no-items-source");
private appliedItemsSource: unknown = NO_SOURCE;

setProps = (): void => {
    if (Object.is(this.props.items, this.appliedItemsSource)) return;
    this.appliedItemsSource = this.props.items;
    this.resetItemsCache();
};
```

The previous reference lives in `appliedItemsSource`, **not** in `this.oldProps`. `oldProps` would
work, but it is written for every consumer of the base class and cannot distinguish "never pumped"
from "pumped `undefined`"; the load cache's invalidation key belongs to the loader. The sentinel also
makes the first pump unconditionally a change, which is exactly `effect()`'s first-run semantics.

**Doing this in the constructor's pump is safe, and it is a structural argument rather than
discipline.** `open` is state, not a prop, and `defaultSelectState.open === false`, so the async arm
*cannot* fire before mount — no promise is ever started from a constructor. The sync arm writes state
that has no subscribers yet, and `onMount`'s `bind` applies immediately, so the first render already
has its items and the popover is never built empty.

Rejected: an explicit `invalidateItems()` the view calls from `onUpdate` (moves the
previous-reference bookkeeping and the sync/async classification into the view, and every future host
has to remember the call); folding it into the view's `DepsGate` (cache invalidation is not "does the
DOM need repainting", and `deps-gate.ts` documents one `changed()` per update); `mapProps` (a pure
transform hook — a state write there is a side effect in the wrong place).

### D2 — Sync sources load from `setProps`; async sources load from the open transition

For a sync source `itemsLoaded` goes false→true once and only an `items` change can make it false
again, so effect #6's `[items, open, itemsLoaded]` deps collapse to `[items]` — `setProps` covers the
sync arm completely and `open` never enters it.

```ts
private resetItemsCache(): void {
    this._loadId += 1;                       // plain field, bumped before any state write
    if (isSyncSource(this.props.items)) {
        this.startLoad();                    // its sync branch writes all five fields in ONE update
        return;
    }
    this.state.update((s) => {
        s.loadedItems = [];
        s.loadedSources = [];
        s.itemsLoaded = false;
        s.itemsError = null;
    });
    if (this.state.get().open) this.startLoad();
}

/** The async arm's trigger. Sync sources are already loaded by `resetItemsCache`. */
private startLoadIfNeeded(): void {
    if (this.state.get().itemsLoaded) return;
    if (isSyncSource(this.props.items)) return;
    this.startLoad();
}
```

For a sync source this is **one** state write per items change where the effect pair produced two
(clear, then load): `startLoad`'s sync branch already writes all five fields including
`itemsError: null`, so the clear-write is redundant. That matters because of finding 3 —
`SettingsSections.tsx:88` re-creates its array on every render, so this path runs on every pump of
that section.

**No `itemsLoading` guard in `startLoadIfNeeded`.** One agent proposed `if (itemsLoaded || itemsLoading) return`,
making the loader fire once per source rather than once per open. That is a real semantic change:
today effect #6 re-invokes on every open while `itemsLoaded` is false, and `_loadId` invalidation
drops the superseded result. Parity wins — the epic's rule is behaviour first — and the agent itself
offered the parity variant. Recorded because the change is defensible for a `() => Promise` doing
HTTP, and belongs in its own task with a decision attached.

**The reset also does not clear `itemsLoading`,** for the same reason. The same agent called that a
latent bug: an `items` change while an async load is in flight leaves `itemsLoading` true. Traced: it
is unobservable. `itemsLoading` feeds only `ListBox.loading`, which lives inside the popover; the
in-flight load can only exist after an open, and the stale flag can only be observed on the next
open, which calls `startLoad` and sets the flag true anyway. No visible difference, so no change.

### D3 — Two draft mutators and two funnels replace effects #7 and #8

`open` is written at nine sites (`tryOpen`, `onInputChange`, `onChevronClick`, `onPopoverClose`,
`commitSelection`, three keyboard-open arms, `Escape`). All of them funnel:

```ts
/** Draft mutators — they mutate an immer draft and never call `state.update` themselves, so a
 *  caller that must produce ONE write (commitSelection, onInputChange) can compose them. */
private openInto(s: SelectState, seedIndex: number): void {
    s.open = true;
    if (s.activeIndex == null && seedIndex >= 0) s.activeIndex = seedIndex;
}
private closeInto(s: SelectState): void {
    s.open = false;
    s.searchText = "";
    s.activeIndex = null;
    s.popoverResized = false;
}

private openPopover = (): void => {
    if (this.props.disabled || this.props.readOnly) return;
    if (this.state.get().open) return;
    const seedIndex = this.seedIndex(this.state.get().searchText);
    this.state.update((s) => this.openInto(s, seedIndex));
    this.startLoadIfNeeded();
};

private closePopover = (): void => {
    if (!this.state.get().open) return;
    this.state.update((s) => this.closeInto(s));
};
```

`commitSelection` needs no special case: its write already set `open = false` and `searchText = ""`,
and `closeInto` is a superset, so the merge is exact. `onChevronClick` stops being
`s.open = !s.open` and becomes `if (open) this.closePopover(); else this.openPopover();` — the right
shape now that the two directions have genuinely different consequences.

**Why draft mutators rather than two methods that each call `state.update`.** `commitSelection` and
`onInputChange` must each produce exactly **one** write. Two writes push the child tree twice, and
the first push would tear the popover down while `activeIndex` and `popoverResized` were still stale
— the exact split the deleted microtask created and the reason its guards had to be re-checked
inside it. One update means one `bind` fire, one `syncChildren()`, one popover teardown.

**What merging effect #7 into `commitSelection`'s write changes: nothing observable.** Between the
old close-write and the old microtask there was a React render in which `open` was already false, so
the popover was unmounted and nothing rendered `activeIndex` or `popoverResized` in that window.
`props.onChange?.(source)` still runs before the write, and `filteredSources[idx]` is still read
before it — load-bearing, because `searchText = ""` changes what `filtered` returns.

`grep "s.open = "` inside `uikit/Select/` must return **two** hits after this (the two draft
mutators). That is what makes the convention checkable, exactly as `TreeModel.mutate`'s single hit
does.

Rejected: inlining the four-field reset at each of the four close sites (four copies plus a fifth
partial one in `commitSelection`; Rule 9's `MultiListBox` note is explicit that a consequence
duplicated per path is how one path drifts). Rejected: a `bind()` in the view reacting to
`open === false` — that is a `state.update` from inside `TOneState`'s synchronous listener walk, a
genuine update-inside-an-update, and Rule 9 already names the answer ("consequences of the model's
own mutations belong at the mutation site").

### D4 — The seed index is computed before the update, and it indexes the **filtered** list

This is the one place the conversion fixes a live bug rather than preserving behaviour.

Effect #8 computed `s.loadedItems.findIndex(...)`, but `activeIndex` is consumed by a `ListBox` whose
`items` are `filteredItems`, and every other writer and reader of `activeIndex` is in filtered index
space (`commitSelection` reads `filteredSources[idx]`; the keyboard arms bound on
`filteredItems.length`). The two spaces coincide only while `searchText` is empty.

They diverge on a reachable path: a `Select` with a value selected and the popover closed shows the
selected label; the user types one character; `onInputChange` sets `open = true` **and**
`searchText = val` in the same write; effect #8 then fires on the `open` change with a non-empty
query and seeds an index into the *unfiltered* array. The visible result is the wrong row
highlighted and the list scrolled to the wrong place.

The fix walks the filtered order directly, so the returned number is an index into the array the
`ListBox` receives, by construction:

```ts
/** Index of the selected item in the list the ListBox will receive, or -1. Must be called with
 *  the search text being committed, not the one in state — inside `produce`, `state.get()` is
 *  still the OLD state, so no memo may be consulted from a producer. */
private seedIndex(searchText: string): number {
    const s = this.state.get();
    if (!s.itemsLoaded || s.loadedItems.length === 0) return -1;
    const sel = this.selectedResolved.value;          // reads props only — safe
    if (!sel) return -1;
    const filterMode = this.props.filterMode ?? "contains";
    const customFilter = this.props.filter;
    const matchFn = customFilter ?? ((it: IListBoxItem) => defaultMatch(it, searchText, filterMode));
    const skipFilter = filterMode === "off";          // `open` is true at every call site
    let visible = 0;
    for (const it of s.loadedItems) {
        if (!skipFilter && !matchFn(it, searchText)) continue;
        if (it.value === sel.value) return visible;
        visible++;
    }
    return -1;
}
```

An agent proposed the cheaper rule "return -1 whenever `searchText !== ""`", which also makes the
index valid by construction but drops the highlight in the case where the selected item *does* match
the query. The walk is O(n) with no allocation and seeds correctly in that case, so it is the better
trade for ten extra lines. `filtered`'s own memo body is unchanged — extracting a shared filter
helper was considered and rejected as churn for one caller.

**The general rule this establishes, and it is not a Select quirk:** never consult a `memo()` from
inside a `state.update` producer. `filtered` and `displayText` read `this.state.get()`, which inside
`produce` still returns the old state. Compute from explicit values before the update and assign the
result in the producer.

The old guards (`open`, `activeIndex == null`, non-empty items, a selection exists) all survive, for
a new reason: not to survive a deferral, but because a promise settles at an arbitrary later time and
the popover may have been closed, reopened, or the highlight already moved by keyboard or hover. In
the producer they are read from the **draft**, so they are the values being committed.

### D5 — The seed's second trigger is the three `itemsLoaded = true` producers

Effect #8's deps were `[open, itemsLoaded]`; the second trigger is how an async source gets its
highlight after the rows arrive. `itemsLoaded` is written true in exactly three places, all inside
`startLoad` — the sync-array branch, the non-thenable branch, and the promise `.then`. Each computes
the seed before its write and assigns it in the producer:

```ts
const seedIndex = this.state.get().open ? this.seedIndex(this.state.get().searchText) : -1;
this.state.update((s) => {
    s.loadedItems = r.items;
    s.loadedSources = r.sources;
    s.itemsLoaded = true;
    s.itemsLoading = false;
    if (s.open && s.activeIndex == null && seedIndex >= 0) s.activeIndex = seedIndex;
});
```

**Co-locating the seed with the row set in one write is what makes the scroll land.** The case that
matters is an async source whose popover is open on the `loading` arm when the promise resolves. One
write → one `bind` fire → one `syncChildren()` → one `list.update()` carrying **both** the new
`items` (new `filtered` identity, so `ListBoxModel.repaintSignature()` slot 0 moves) **and** the new
`activeIndex`. In `ListBoxView.onUpdate`: `applyArm` switches `loading → real` and builds a fresh
grid, `repaintGate.changed(...)` is true, `props.activeIndex !== lastActiveIndex`, so
`syncActiveScroll(idx, /* afterPaint */ true)` picks **`scrollToRowAfterPaint`** — the correct entry
point per Rule 9, whose precondition is satisfied because `grid.model.update({ all: true })` ran
immediately before.

Split that into two writes and the second push has `contentChanged === false`, so `ListBoxView`
picks `scrollToRow`. In this one scenario it survives by accident (the grid was just constructed, so
`measured` is false and the request parks in the engine's pending slot) — but that evaporates the
moment the row set changes while the grid is already measured, which is exactly Rule 9's measured
failure: lands at 600px where the target needs 1020px, silently, with nothing re-issuing it.
`growToHeight` makes it more likely here, because going from 0 to N rows changes the popover's own
height.

**One-line rule for the epic's authoring notes:** *a write that changes the `ListBox`'s item set and
its `activeIndex` must be a single `state.update`, so the host sees both in one push and chooses
`scrollToRowAfterPaint`.*

The open-time seed needs nothing extra: `activeIndex` is already in state when the floating branch
builds the `ListBoxView`, so it arrives through `onMount`, where `syncActiveScroll(activeIndex,
false)` runs against a brand-new unmeasured grid and the engine's pending slot is the intended
mechanism.

### D6 — One compound `bind()` on six state slices, one `syncChildren()`

Rule 9's discriminator is *what does the state feed?* Applied field by field:

| Field | Feeds | Verdict |
|---|---|---|
| `open` | `Popover.open`, `Input.aria-expanded`, the chevron's icon, root `data-state` | child prop (+ one trivial root attribute) |
| `searchText` | `Input.value` via `displayText`, `ListBox.searchText`, `filtered` | child prop |
| `activeIndex` | `ListBox.activeIndex` | child prop |
| `popoverResized` | `ListBox.growToHeight` | child prop |
| `loadedItems` | `filtered` → `ListBox.items` | child prop (indirect) |
| `itemsLoading` | `ListBox.loading` | child prop |
| `loadedSources` | `filtered.filteredSources`, read at event time only | renders nothing |
| `itemsLoaded` | the load cache | renders nothing |
| `itemsError` | **nothing** | renders nothing |

Six of nine are child props; three render nothing; none is `Tree`'s case.

```ts
this.bind(
    this.model.state,
    (state) => ({
        open: state.open,
        searchText: state.searchText,
        activeIndex: state.activeIndex,
        popoverResized: state.popoverResized,
        loadedItems: state.loadedItems,
        itemsLoading: state.itemsLoading,
    }),
    () => this.syncChildren(),
);
```

`compareSelection` compares the plain object key-wise and `loadedItems` by reference, which is right:
immer only gives that array a new identity when it is actually replaced.

`open` is the field that looks like a counterexample, because of `data-state` on the root. It is not.
The funnel row of Rule 9's table says "a render pass the children cannot express (root attributes
included)" — the operative words are *render pass*. `Tree` needed a funnel because
`aria-activedescendant`'s bounds check reads `rows.length` and its value reads `rows.value[i].value`,
so nothing short of re-running the pass is correct. `data-state` is `open ? "open" : "closed"`, a
one-line projection of a boolean already in the selector, and it is written as the first line of
`syncChildren()`.

**Why the 23-write-site count does not vote for a funnel.** It looks like the loudest possible signal
— three times `Tree`'s. But the funnel's value in `Tree` is the *checkability of a manual
convention*: delivery there is a call the mutation site makes (`onStateApplied`), so correctness
depends on no write bypassing `mutate()`, and `grep == 1` is what makes that auditable. With `bind`,
delivery is `TOneState.subscribe` — **a write cannot bypass it by construction** — so the write count
carries no correctness weight at all. And `bind` filters through `compareSelection`, so the no-op
writes this component produces in bulk (`onActiveIndexChange` firing per mouse-move within one row)
cost nothing, where `mutate()` would run the full consequence, including a floating-UI reposition,
on every one.

What the count *is* telling us is that the state transitions need a choke point — which is D3, a
state-transition funnel, not a DOM-delivery funnel. The two are different things and Select wants one
of each.

The three omitted fields each need a comment, because omitting them is a coupling argument rather
than a fact:
- `loadedSources` and `itemsLoaded` are written in the **same** `state.update` as `loadedItems` at
  every one of the four `startLoad` write sites, so neither can move alone.
- `itemsError` renders nothing anywhere. Its comment must say that adding an error arm requires
  adding the slot — an arm rendered from an unsubscribed field is `de-react.md` §6.1's masked defect
  in its purest form, appearing broken only until some unrelated state moved.

**`itemsError` and `SelectItemsResult` are kept.** An agent recommended deleting both as dead state
and a dead exported type (verified: `SelectItemsResult` is exported from `uikit/index.ts:104` and
consumed nowhere in the repo). Overridden — EPIC-056 C3-5 keeps every public surface, and the epic
defers API cleanup to Epic F by name. Deleting a barrel export is not a conversion.

### D7 — The dropdown uses `PopoverView`'s `contentView` seam, with no wrapper view

`PopoverViewProps.contentView?: (host: HTMLElement) => IOwnedView` keeps the floating root's children
native DOM. `MenuView.ts:346` is its only current user. Select uses it, and the open dropdown then
contains **zero** React roots.

Two properties of the seam decide the shape, and neither is visible in the prop's type
(`PopoverView.tsx:76-86`):

1. **`PopoverFloatingView.onMount` never appends `contentView.root`** — it does
   `this.child(this.props.contentView(this.root))` and then calls `mount()`. So the factory must
   attach whatever it builds.
2. **The popover is not an update channel.** `PopoverFloatingView.onUpdate` calls `applyProps` and
   `updateNativeResizeHandle()` and forwards nothing to the content view.

```ts
contentView: (host) => {
    // `ListBoxView`'s constructor builds its own detached root and the popover never appends it,
    // so this append is required — omit it and the dropdown renders empty (Rule 9's "renders blank
    // is a content bug" symptom). Props come from `syncChildren()`, never from the popover.
    const list = new ListBoxView<IListBoxItem>(this.listProps());
    host.append(list.root);
    this.listView = list;
    return list;
},
```

The `ListBoxView` is claimed by `PopoverFloatingView` via `child()`, so `SelectView` holds a **bare**
reference — never `this.child(...)` it (a second claim throws on the shared marker) and never dispose
it. Closing runs `PopoverView.syncBranch` → `swap.clear()` → the branch disposes → the list disposes
(engine gone, scroll reset), which is what React unmount does today. Reopening builds a fresh pair,
so `ListBoxView`'s `DepsGate` primes at its own `onMount` and the first paint is correct — which is
also why the factory must compute `this.listProps()` at construction time rather than rely on a
later push. `syncChildren()` clears the reference when `open` is false; that is hygiene, not
correctness, because `VanillaView.update()` early-returns when disposed
(`shared/vanilla-view.ts:71-73`).

**One agent insisted a wrapper view was mandatory**, on the grounds that the returned view's `root`
must *be* the host (as `MenuContentView`'s is) and that letting `ListBoxView` adopt the host would
collide with `PopoverFloatingView.applyProps` writing `root.dataset.type = "popover"` on every
update. The `data-type` collision is real, but it only applies to *adopting* the host. Appending a
child sidesteps it, and the code confirms nothing requires the returned root to be the host. No
wrapper class — one fewer view to own.

**Do not copy `MenuContentView`'s "props are the model" shape.** It reads the model live and re-syncs
from a `bind()`, which works for `Menu` only because nothing but state changes its output in
practice. Select's output depends on `props.items`, `emptyMessage`, `rowHeight`, `maxVisibleItems`,
`filter` and `filterMode`, all of which can move with no state write. Pushing typed `ListBoxProps`
from the one consequence keeps the channel explicit; it also happens to close a latent gap `Menu` has
today, where a replaced `items` array while the menu is open reaches nothing.

**Accepted cost, deliberately unguarded.** Every keystroke runs `PopoverFloatingView.onUpdate` →
`applyProps` → `applyRestProps` on the popover root → `position()` (a `computePosition` promise). No
"did the popover props change?" guard: `autoUpdate` already calls `position()` on every scroll and
resize frame, so it is designed for exactly this frequency, and a parent-side guard is the hazard
class Rule 9 bans. Instead `popoverProps()` stays minimal and never forwards Select's rest props.

Three idempotence properties make pushing this on every keystroke safe, and the design rests on them:
`syncBranch()` with `open` already true takes the `if (this.activeBranch) { update; return; }` path;
`SubtreeSwap.clear()` early-returns when inactive; and `resetManualSize()` is guarded on the
`wasOpen && !open` **transition**, not on the closed state.

### D8 — The chevron is an `IconButtonView` whose root is the `endSlot`, with two new identity gates

`fillSlot` accepts a `Node` and appends it with no React root (`shared/fill-slot.ts:129-136`), so an
`IconButtonView`'s root can be an `endSlot` directly. The chevron is created **once** in
`SelectView.onMount`, `child()`-owned, and its icon is swapped through
`chevron.update({ icon: open ? "chevron-up" : "chevron-down" })` with a **string** `IconName`, which
takes `IconButtonView.updateIcon`'s string branch → `createIconElement` → a DOM `<svg>`.

That last part is a measurable win worth naming: today `Select.tsx` passes
`icon={renderIcon("chevron-down")}`, a React node, so **every `Select` on screen carries a React root
inside its chevron even while closed**. Passing the name removes it. Do not rotate one glyph with CSS
instead — `chevron-up` and `chevron-down` are distinct registry glyphs and the DOM must stay
comparable to the React version an agent may be querying.

Three supporting changes, all in shared leaf files:

- **`InputProps.startSlot` / `endSlot` widen from `React.ReactNode` to `SlotContent`**
  (`string | Node | React.ReactNode`, already what `fillSlot` takes and `InputView` forwards), and
  `InputView.hasSlot`'s parameter widens with them. `HTMLElement` is not assignable to `ReactNode`,
  and a cast at the call site would hide the fact that the slot contract genuinely accepts nodes.
  Precedent: `TooltipProps.content` is already public and typed `SlotContent`.
- **An identity gate in `InputView.updateSlot`.** `fillSlot`'s node path runs
  `host.replaceChildren()` then `host.append(node)`, and `updateSlot` calls it on every `onUpdate` —
  so without a gate the chevron button is detached and re-appended on **every keystroke**. Not a
  correctness bug (same element object, so listeners, the tooltip attachment and `data-*` state all
  survive, and the button is unfocusable) but a needless mutation per keystroke: layout
  invalidation, a restarted CSS transition, and a spurious record in the Rule 4 `MutationObserver`
  count. The gate belongs in the calling view, not in `fillSlot`, whose documented contract is "each
  call is a transition, the caller must not pre-clear" — and every existing gate in this epic
  (`ListBoxView.lastEmptyMessage`, `MultiListBoxView.appliedCheckState`, `ListItemView.setCheck`)
  lives in the caller. It is safe for both arms: the same `Node` means the same content, and a React
  element built inline is always a new object, so a genuinely-changed subtree always has a new
  identity.
- **An identity gate in `IconButtonView.updateIcon`'s string branch.** Without it, `createIconElement`
  rebuilds the `<svg>` on every `chevron.update(...)`, i.e. every keystroke. Today's React path
  reconciles instead, so this churn would be *introduced* by the conversion rather than inherited —
  which is what puts it in scope. Gate on the last applied string only; a non-string `IconRef` keeps
  today's behaviour, where `fillSlot`'s React path already reuses the root.

`InputView` *contains* the chevron in its `end-slot` host but never owns it: `clearSlots()` calls
`host.remove()` and `fillSlot`'s cleanup calls `host.replaceChildren()`, neither of which disposes a
view. `SelectView` owns it through `child()`, so it is disposed exactly once.

Rejected: a raw `<button>` built by `SelectView` (would re-implement `size`/`variant`/`disabled`
attribute logic and the tooltip attachment `IconButtonView` already owns, and drifts the moment
`IconButton.css` grows a state); swapping `endSlot` between two prebuilt buttons (two views to own,
and it guarantees the detach/re-append on every open toggle); a new `endIcon` prop on `Input` (real
API growth to avoid a slot that already exists).

### D9 — The ref splits: stable for the model, identity-keyed for the caller

`Select`'s public `ref` points at the inner `<input>`, which has two consumers: `model.setInputRef`
(for `this.inputRef?.focus()`) and the caller's `props.ref`. `InputView` binds exactly one ref and
re-binds only when identity moves; the single production consumer
(`AVGrid/CellSelect.tsx:103`) passes a fresh inline arrow on every render.

```ts
/** One identity for the view's whole life, so `InputView` binds it exactly once. */
private readonly setInputElement = (el: HTMLInputElement | null): void => {
    this.inputElement = el;
    this.model.setInputRef(el);
    this.syncCallerRef(true);
};

private syncCallerRef(force: boolean): void {
    const ref = this.props.ref;
    if (!force && ref === this.appliedCallerRef) return;
    this.callerRefCleanup?.();          // the ref's own cleanup, or `ref(null)`
    this.appliedCallerRef = ref;
    this.callerRefCleanup = bindRef(this.inputElement, ref);
}
```

`inputProps()` always passes `ref: this.setInputElement`; `onUpdate` calls `syncCallerRef(false)`
after props are stored; `own(() => this.callerRefCleanup?.())` covers disposal. `bindRef`
(`shared/react-compat.ts:137`) already handles object refs, React-19 cleanup-returning callback refs,
and a null element.

**Why the model side must be stable.** `InputView.updateRef` does `clearRef()` then `bindRef(...)`
whenever identity moves, and `clearRef` on a callback ref that returned nothing calls `ref(null)`. A
per-update merged closure — the literal translation of today's `useCallback` — would therefore run
`model.setInputRef(null)` and then `setInputRef(el)` on **every keystroke**, leaving `model.inputRef`
transiently null, and would degenerate `InputView`'s `props.ref !== previousRef` gate into "always".

**Why the caller side still needs a per-identity re-bind.** A purely stable callback that read
`this.props.ref` live would never release ref₁ nor hand the element to ref₂. With `CellSelect` that
is invisible (both arrows do the same thing and the element never changes), but a consumer swapping
to a semantically different ref would silently never receive it. Split, each side gets the right
cadence: the model binds once, the caller re-binds only when its identity moves — which is exactly
what today's `useCallback([model, ref])` does, so no regression.

### D10 — `IconButton.css` moves into `IconButtonView.tsx`

`IconButtonView.tsx` imports `IconButton` **type-only**, which erases at compile time, so nothing in
its module graph pulls `IconButton.css` — the stylesheet is imported by the React shim
(`IconButton.tsx:5`). `SelectView` will import the view, not the shim. This is the same split
US-1016 fixed for `Input`, for the same reason and with the same comment shape.

Nothing breaks *today*, by luck: the app graph contains dozens of React `IconButton` consumers. It
breaks in any graph where no React face appears — an isolated story or test bundle, or a code-split
editor chunk whose only `IconButton` arrives through `SelectView`. The symptom is a UA-default
`<button>` around the chevron, which reads as a `Select` CSS bug while the cause is a missing module
edge two components away.

`Notification/NotificationView.tsx` and `SplitButton/SplitButtonView.ts` import
`../IconButton/IconButton.css` explicitly. After the move those imports are redundant — the bundler
dedupes by module id, so no duplicate rules and no source-order change — but they are **left alone**:
removing them touches two components this conversion has no business in, the line is local greppable
evidence that those views compose `IconButtonView`'s DOM directly, and US-1016 set the precedent by
leaving `DateInput.tsx`'s equivalent `import "../Input/Input.css"` in place. Say so in the commit
message so a later reader does not file it as an oversight; a sweep over all borrowed-CSS imports is
its own one-line task.

### D11 — Root sizing stays an inline style, cleared as well as set

`width` / `minWidth` / `maxWidth` go to `root.style.*`, with `""` when undefined so `Select.css`'s
`width: 100%` applies — the `MultiListBoxView.applyRoot` shape, and React's exact DOM output. An
agent suggested `--select-width` custom properties mirroring `InputView`'s `--input-width`. Rejected:
C3-5's promise is that a `browser_snapshot` diff is identical, and `style="width: 110px"` is what
React emits. The custom-property indirection exists in `Input` because `Input.css` needs a `100%`
default *for the same property*; `Select.css` gets that from the cascade for free.

`Select.css` is the three Emotion declarations, in `@layer uikit`:
`[data-type="select"] { display: flex; width: 100%; min-width: 0; }`.

### D12 — Native event types in the model, unwrapped at the view boundary

Rule 9 requires the model to use native DOM event types. The three input handlers and the two chevron
handlers reach their elements through `applyRestProps`, which delivers a `toPublicEvent` facade
(`shared/react-compat.ts:94-108`). `PathInputView.tsx:78` is the established precedent for the seam:
`onKeyDown={(event) => model.onInputKeyDown(event.nativeEvent)}`.

So `SelectModel.onInputKeyDown(e: KeyboardEvent)` and `onChevronMouseDown(e: MouseEvent)` retype to
native, and `SelectView` unwraps `.nativeEvent` in two stable bound fields. `onInputFocus` and
`onInputClick` take no argument and pass through as bound methods.

Handler identity is not a churn concern either way: `applyRestProps` removes and re-adds every `on*`
listener unconditionally on every call, so `InputView`'s per-keystroke listener churn is what it is
today. It is safe on the keyboard-open path, where the listener is removed and re-added during the
dispatch of its own `keydown`: per the DOM specification a listener added during dispatch on the
current target is not invoked for the current event.

## Implementation plan

Fourteen steps. Steps 1–3 are shared-file prerequisites and must land before step 6 compiles.

### 1. `src/renderer/uikit/Input/Input.tsx` — widen the slot props (D8)

```ts
-    /** Content rendered inside the input chrome, before the text. */
-    startSlot?: React.ReactNode;
-    /** Content rendered inside the input chrome, after the text. */
-    endSlot?: React.ReactNode;
+    /** Content rendered inside the input chrome, before the text. A DOM `Node` is appended
+     *  directly with no React root — that is how a vanilla parent supplies a composed view's
+     *  root (`Select` passes its chevron `IconButtonView`). */
+    startSlot?: SlotContent;
+    /** Content rendered inside the input chrome, after the text. See `startSlot`. */
+    endSlot?: SlotContent;
```

Add `import type { SlotContent } from "../shared/slots";` — check whether `SlotContent` is exported
from `shared/slots.ts` or only from `shared/fill-slot.ts` (it is declared in `fill-slot.ts`) and
import from wherever it lives.

### 2. `src/renderer/uikit/Input/InputView.tsx` — widen `hasSlot`, add the identity gate (D8)

```ts
-function hasSlot(value: React.ReactNode): boolean {
+function hasSlot(value: SlotContent): boolean {
```

New field beside `slotHosts` / `slotCleanups`:

```ts
    /**
     * The last value handed to `fillSlot` per slot. `fillSlot`'s node path runs
     * `replaceChildren()` + `append()`, and this method is called on every update — so without
     * this gate a vanilla parent passing a stable element (Select's chevron) would have it
     * detached and re-appended on every keystroke. Safe for both arms: the same `Node` means the
     * same content, and an inline React element is always a new object.
     */
    private readonly appliedSlots = new Map<"start" | "end", SlotContent>();
```

In `updateSlot`, before the `fillSlot` call and after the `!present` branch:

```ts
        const nextHost = host ?? this.createSlotHost(kind);
+       if (this.appliedSlots.get(kind) === value && host) return;
+       this.appliedSlots.set(kind, value);
        this.slotCleanups.set(kind, fillSlot(nextHost, value));
```

The `&& host` term makes the very first application unconditional even if `value` is `undefined`-ish
in the map's initial state. Clear the map in `clearSlots()`.

### 3. `src/renderer/uikit/IconButton/IconButtonView.tsx` + `IconButton.tsx` — CSS ownership and the icon gate (D8, D10)

Move `import "./IconButton.css";` out of `IconButton.tsx` and into `IconButtonView.tsx`, with the
comment shape `InputView.tsx` already carries. Add a gate to `updateIcon`:

```ts
+   private appliedIconName: string | undefined;

    private updateIcon(icon: IconRef): void {
        if (typeof icon === "string") {
+           // Gated on the applied name: a composed parent pushes props on every update (Select's
+           // chevron, once per keystroke) and `createIconElement` would rebuild the `svg` each
+           // time. Non-string refs keep the ungated path — `fillSlot` reuses their React root.
+           if (this.appliedIconName === icon) return;
+           this.appliedIconName = icon;
            this.iconCleanup = fillSlot(
                this.iconHost,
                createIconElement(isIconName(icon) ? icon : icon as never),
            );
            return;
        }
+       this.appliedIconName = undefined;
        this.iconCleanup = fillSlot(this.iconHost, renderIcon(icon));
    }
```

`clearIcon()` also resets `appliedIconName`.

### 4. `src/renderer/uikit/Select/SelectModel.ts` — the model, in five edits

**4a. Remove the React import and retype two handlers (D12).** Delete `import React from "react";`
if nothing else needs it — `SelectProps` extends `React.HTMLAttributes`, so it stays; keep the import
but change:

```ts
-    onChevronMouseDown = (e: React.MouseEvent) => {
+    onChevronMouseDown = (e: MouseEvent) => {
         e.preventDefault();
     };
-    onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
+    onInputKeyDown = (e: KeyboardEvent) => {
```

**4b. Add the load-cache plumbing (D1, D2).** Module scope, beside `isThenable`:

```ts
const NO_SOURCE = Symbol("select-no-items-source");

function isSyncSource(source: unknown): boolean {
    return Array.isArray(source) || isTraited<unknown[]>(source);
}
```

`startLoad` uses `isSyncSource` in place of its inline test. Add the field, `setProps`,
`resetItemsCache` and `startLoadIfNeeded` exactly as in D1/D2.

**4c. Add `seedIndex`, `openInto`, `closeInto`, `openPopover`, `closePopover` (D3, D4).** Bodies as in
D3/D4. `tryOpen` is **deleted** — `openPopover` replaces it and carries the same
`disabled || readOnly` guard.

**4d. Rewrite the nine `open` write sites (D3).**

| Site | Before | After |
|---|---|---|
| `onInputFocus` | `this.tryOpen()` | `this.openPopover()` |
| `onInputClick` | `this.tryOpen()` | `this.openPopover()` |
| `onInputChange` | `update(s => { if (!s.open) s.open = true; s.searchText = val; })` | see below |
| `onChevronClick` | `update(s => { s.open = !s.open; })` | `if (this.state.get().open) this.closePopover(); else this.openPopover();` then `this.inputRef?.focus()` |
| `onPopoverClose` | `update(s => { s.open = false; })` | `this.closePopover()` |
| `commitSelection` | `update(s => { s.open = false; s.searchText = ""; })` | `this.closePopover()` |
| `onInputKeyDown` ArrowDown/PageDown, `!open` | `update(s => { s.open = true; })` | `this.openPopover(); return;` |
| `onInputKeyDown` ArrowUp/PageUp, `!open` | as above | as above |
| `onInputKeyDown` Enter, `!open && !readOnly` | as above | as above |
| `onInputKeyDown` Escape | `update(s => { s.open = false; })` | `this.closePopover()` (then `props.onEscape?.()`, unchanged) |

`onInputChange` — one write, opening and seeding only on a transition:

```ts
    onInputChange: InputProps["onChange"] = (val: string) => {
        if (this.props.disabled || this.props.readOnly) return;
        const wasOpen = this.state.get().open;
        // The seed belongs to the open *transition* only: while already open, `activeIndex` keeps
        // whatever keyboard nav or hover put there, exactly as effect #8's deps did.
        const seedIndex = wasOpen ? -1 : this.seedIndex(val);
        this.state.update((s) => {
            if (!s.open) this.openInto(s, seedIndex);
            s.searchText = val;
        });
        if (!wasOpen) this.startLoadIfNeeded();
    };
```

**4e. Seed from the three `itemsLoaded = true` producers and delete `init()` (D5).** Apply the D5
snippet to `startLoad`'s sync-array branch, its non-thenable branch and its promise `.then`. Then
delete `init()` entirely — all four effects are gone. `dispose()` keeps its `_loadId += 1`.

Also add the `displayText` invariant comment (D-note in Concerns 4): `searchText` is stored verbatim
and `displayText` must return it unmodified while `open`.

Also fix two stale doc comments (no behaviour change): `items`' "`Promise<...>` — eager async; Select
awaits on mount" (it waits for the first open, like a function source), and `width`/`minWidth`/
`maxWidth`'s "Forwarded to inner Input" (they are written to the Select root).

### 5. `src/renderer/uikit/Select/Select.css` — new file (D11)

```css
/*
 * Translated from the single Emotion block in `Select.tsx` (EPIC-056 US-1017). Three declarations,
 * no state arms: every `data-*` state on the root is addressing only, and the visual states belong
 * to the composed `Input`, `IconButton`, `Popover` and `ListBox`.
 *
 * `width` / `min-width` / `max-width` from props are written to `element.style` by
 * `SelectView.applyRoot`, so the `width: 100%` here is the default the cascade provides — which is
 * why the view must write `""` and not `"100%"` when the prop is absent.
 */
@layer uikit {
    [data-type="select"] {
        display: flex;
        width: 100%;
        min-width: 0;
    }
}
```

### 6. `src/renderer/uikit/Select/SelectView.ts` — new file, the whole conversion

Class doc records the four load-bearing facts: zero React roots (the `contentView` seam plus the
string chevron icon); one compound `bind` feeding one `syncChildren()`; the popover is not an update
channel, so `SelectView` pushes list props itself; and `applyRoot` stays off the state path while
`data-state` deliberately does not.

Members: `driver`, `restPropsState`, `elementId` (from `nextElementId("select")` — set on the model
via `setReactId`, which keeps its name or is renamed to `setElementId` to match `ListBoxModel`),
`input!: InputView`, `chevron!: IconButtonView`, `popover!: PopoverView`,
`listView: ListBoxView<IListBoxItem> | undefined`, `inputElement`, `appliedCallerRef`,
`callerRefCleanup`.

Constructor: `super(props, document.createElement("div"))`; `root.dataset.type = "select"`; build the
driver; `this.model.setReactId(nextElementId("select"))` (the model's `selectId` prefixes `select-`
itself, so pass the bare counter value or adjust — check and state which); `own(() => this.driver.dispose())`,
`own(() => clearRestListeners(this.root, this.restPropsState))`, `own(() => this.callerRefCleanup?.())`.

`onMount()`:
1. `this.chevron = this.child(new IconButtonView(this.chevronProps())); this.chevron.mount();`
2. `this.input = this.child(new InputView(this.inputProps())); this.root.append(this.input.root); this.input.mount();`
3. `this.popover = this.child(new PopoverView(this.popoverProps())); this.root.append(this.popover.root); this.popover.mount();`
   (`PopoverView`'s root is `display: contents` and its real DOM lives in the overlay layer.)
4. `this.applyRoot(this.props); this.driver.mount();`
5. the compound `bind` from D6.

`onUpdate(props)`: `this.driver.update(props); this.applyRoot(props); this.syncCallerRef(false); this.syncChildren();`

`applyRoot(props)` — props path only: `data-name`, `data-disabled`, `data-readonly`, `data-id`
(`this.model.selectId`), the three inline sizes cleared with `""`, then `applyRestProps`.

`syncChildren()` — the single consequence of both paths:
```ts
const { open } = this.model.state.get();
this.root.dataset.state = open ? "open" : "closed";   // the ONE state-derived root write
this.chevron.update(this.chevronProps());
this.input.update(this.inputProps());
this.popover.update(this.popoverProps());
if (open) this.listView?.update(this.listProps());
else this.listView = undefined;
```

`inputProps()`: `{ ref: this.setInputElement, size: props.size ?? "md", value: this.model.displayText.value,
onChange: this.model.onInputChange, placeholder, disabled, readOnly, onFocus: this.model.onInputFocus,
onClick: this.model.onInputClick, onKeyDown: this.handleInputKeyDown, "aria-haspopup": "listbox",
"aria-expanded": open, "aria-controls": this.model.listboxId, "aria-label": props["aria-label"],
"aria-labelledby": props["aria-labelledby"], endSlot: this.chevron.root }`.

`chevronProps()`: `{ icon: open ? "chevron-up" : "chevron-down", size: "sm", tabIndex: -1,
disabled: props.disabled || props.readOnly, onMouseDown: this.handleChevronMouseDown,
onClick: this.model.onChevronClick }`.

`popoverProps()`: `{ open, onClose: this.model.onPopoverClose, elementRef: this.root,
placement: "bottom-start", offset: [0, 2], matchAnchorWidth: true, resizable: props.resizable,
onResize: this.model.onPopoverResize,
outsideClickIgnoreSelector: `[data-type="select"][data-id="${this.model.selectId}"]`,
contentView: the D7 factory }`. Never Select's rest props.

`listProps()`: exactly the fields `Select.tsx` passes today — `id: this.model.listboxId`,
`items: filteredItems`, `value: selectedResolved ?? null`, `activeIndex`, `onActiveChange`,
`onChange`, `searchText`, `rowHeight: this.model.rowHeight`,
`growToHeight: popoverResized ? undefined : maxVisibleItems * rowHeight`, `loading: itemsLoading`,
`emptyMessage: props.emptyMessage ?? "no results"`.

Two stable bound fields for the native unwrap (D12):
```ts
private readonly handleInputKeyDown = (event: React.SyntheticEvent<HTMLElement>): void => {
    this.model.onInputKeyDown(event.nativeEvent as KeyboardEvent);
};
private readonly handleChevronMouseDown = (event: React.SyntheticEvent<HTMLElement>): void => {
    this.model.onChevronMouseDown(event.nativeEvent as MouseEvent);
};
```

`setInputElement` / `syncCallerRef` per D9. Local helpers `cssLength`, `setOrRemove`, `toggle` copied
from `MultiListBoxView.ts`.

### 7. `src/renderer/uikit/Select/Select.tsx` — collapse to a shim

172 → ~100 lines. Keep `SelectProps`, `ItemsSource`, `SelectItemsResult` re-exports verbatim; the
props interface itself lives in `SelectModel.ts` and does not move. Body:

```tsx
function SelectShim<T = IListBoxItem>(props: SelectProps<T> & { ref?: React.Ref<HTMLInputElement> }) {
    return mountVanilla(
        SelectView as unknown as new (
            props: SelectProps<T> & { ref?: React.Ref<HTMLInputElement> },
        ) => SelectView<T>,
        props,
    );
}

export const Select = SelectShim as <T = IListBoxItem>(
    props: SelectProps<T> & { ref?: React.Ref<HTMLInputElement> },
) => React.ReactElement | null;
```

Delete the Emotion import, the `Root`, `useId`, `useComponentModel`, `useCallback`, `state.use`, the
prop destructuring and the JSX.

### 8–14. Verification and docs

8. `npx tsc --noEmit`, `npm run lint`, `git diff --check`.
9. Open the `Select` story; exercise every one of its twelve controls, and **all three `itemsMode`
   values** — this is the only exposure the async arm has (Background finding 1).
10. `browser_snapshot` the story before and after and diff the `data-*` output (C3-5).
11. App-level pass over the eight app-layer call sites the epic names, plus `AVGrid/CellSelect`
    (open a `grid-json` page, edit a cell backed by `Column.options`) — `CellSelect` is the only
    `ref` consumer and the only route to the async arm in production.
12. **Take the Rule 4 number** (C3-9) and record it in EPIC-056's Notes: install identical
    `MutationObserver`s on `[data-type="live-preview"]` and `#persephone-overlay-layer` with
    `{ subtree: true, childList: true, attributes: true, characterData: true }`, set the story to
    `itemCount: 1000`, open the dropdown, reset the counters, type **one** character, and report the
    two raw callback record counts and their total. Follow EPIC-055's Notes format.
13. Update `EPIC-056.md`: status line, the US-1017 row to Implemented with a link, and a Notes block.
    Correct the two statements Background findings 1 and 4 contradict (story coverage of the async
    arm; the Emotion close target of 9 → 10).
14. Update `uikit/CLAUDE.md` Rule 9 with the three rules this task establishes: never consult a
    `memo()` from inside a `state.update` producer; a write that changes a virtualized child's item
    set *and* its `activeIndex` must be one `state.update`; and the `contentView` seam's two
    properties (the factory must attach what it builds, and the popover forwards no updates, so the
    parent pushes the content view's props from its own single consequence). Add `doc/de-react.md`
    §6.1 only if the Rule 4 number or the index-space bug warrants it — the index-space bug is a
    *different* class from the masked defect (a wrong value, not a missing repaint), so it likely
    does not.

## Concerns / Open questions

All resolved; recorded so the reasoning is not re-litigated mid-implementation.

1. **The async arm has no production caller, so the story is the whole safety net.** Resolved by
   Background findings 1 and 2: the story covers it better than production does, and step 9 makes
   all three `itemsMode` values mandatory rather than optional. The interleaving table below is the
   other half.

2. **Deleting four `queueMicrotask` deferrals inside a synchronous dispatcher** (EPIC-056 Concern 5).
   Resolved by the ledger in D3/D5 plus the re-entrancy proof: in the listener walk that follows any
   of these writes, no DOM event is dispatched (`.value` assignment, attribute writes and `remove()`
   fire nothing, and `PopoverFloatingView.dispose()` only removes listeners); `ListBoxView` and
   `VirtualGridView` never invoke `onChange`/`onActiveChange` from an update or disposal path, only
   from user events; and `PopoverView` calls `props.onClose` from exactly two places,
   `onDocumentMouseDown` and `onDocumentKeyDown`, never from `update`, `syncBranch` or `dispose`. So
   the walk contains no second `state.update`.

   Three guards make the invariants code rather than commentary: `openPopover`'s `if (open) return`
   (also the focus-bounce guard — `open` is assigned to `currentState` *before* dispatch, so a
   nested `onInputFocus → openPopover` writes nothing and does not re-run the load or the seed);
   `closePopover`'s `if (!open) return` (a double close from `Escape` racing the popover's own
   document handler, or an outside click racing a chevron click); and `_suppressFocusOpen`, which is
   now load-bearing for a **second** reason: the popover subtree is detached *before*
   `inputRef.focus()` runs, where React detached it after the handler returned — so if focus was
   inside the popover it is on `<body>` by then, `focus()` becomes a real focus change, and
   `onInputFocus` fires synchronously. Do not move that assignment, and keep its clearing microtask
   (it is not a render-phase workaround — it clears a one-shot after the synchronous focus event).

3. **`_loadId` interleavings** (EPIC-056 Concern 6 asked for these written out).

   | Interleaving | Path | Verdict |
   |---|---|---|
   | `items` changes while the previous source's promise is in flight | `setProps` → `resetItemsCache` bumps `_loadId` **before** any state write, so the old settle handler's `myLoadId !== this._loadId` drops it | correct |
   | Two rapid open/close cycles, async source | each open calls `startLoadIfNeeded` → `itemsLoaded` still false → `startLoad` re-invokes and bumps `_loadId`; all but the last resolution is dropped | correct, and identical to today (see D2 on why no `itemsLoading` guard) |
   | `items` changes while the popover is open | sync: one write with the new snapshot. async: the clear-write empties the list, then `state.get().open` → `startLoad()` in the same tick | correct. `activeIndex` deliberately survives and may point past the new end — today's effects behave identically, so this preserves behaviour rather than fixing it |
   | promise resolves after dispose | `driver.dispose()` → `onUnmountInternal` sets `isLive = false` **and** `dispose()` bumps `_loadId`; the settle guard checks both | correct, unchanged |
   | function source returning a plain array | `startLoad` writes `itemsLoading: true`, invokes, gets a non-thenable, writes the full snapshot: two sequential synchronous writes, the first with `loadedItems: []`. No layout is flushed between two synchronous JS writes, so nothing is visible | correct. Cannot be avoided — you cannot know the return is non-thenable before invoking |
   | fresh array literal on every pump (`SettingsSections.tsx:88`) | every pump: `Object.is` fails → `resetItemsCache` → sync → `startLoad` → **one** write (today: two). The write dispatches, `syncChildren()` runs, and then `onUpdate` runs it again | correct, and cheaper than today. **It cannot loop:** a state write does not pump props in a vanilla driver, so reset → load → bind → sync never re-enters `setProps`. The duplicate sync is the one `MultiListBoxView` documents and accepts — do **not** add a `lastItemsSource` guard in the view |

   An agent recommended hoisting `SettingsSections`' two array literals to module constants to remove
   the churn at source. Correct, but out of scope: it is an app-layer edit, and C3-5 says nothing in
   this epic changes a React call site. Recorded as a follow-up.

4. **The `Input` value round trip is safe, and one adjacent hazard is deliberately left alone.** A
   keystroke echoes back synchronously: the browser has already set `field.value = "ab"`, and
   `displayText` returns `searchText` verbatim while open, so `InputView.applyProps`'s
   `String(value) !== this.field.value` guard means **no write happens at all** — no caret move, no
   selection collapse. This is stricter than React's controlled-input path, because the echo lands
   inside the `input` event dispatch rather than in a later commit, so there is no window in which
   DOM and state disagree. It holds only while nothing transforms the query, which is why D4/step 4e
   record that invariant next to `displayText`.

   **IME composition is a real hazard and is out of scope.** `displayText` returns `searchText` only
   while `open`; a close landing mid-composition (`Escape`, an outside `mousedown`) pushes the
   selected item's label instead, the guard passes, and `field.value` is assigned while a composition
   session is live — which in Chromium aborts the composition or leaves a duplicated fragment. It is
   **pre-existing and unchanged**: React writes `field.value` through the identical
   `InputView.applyProps` today. The fix belongs in `InputView` (track
   `compositionstart`/`compositionend`, skip the assignment while composing, apply the pending value
   on `compositionend`) and benefits every consumer including `MultiListBox`'s search box. Recorded
   as a follow-up rather than smuggled into a conversion.

5. **A keyboard open adds a `document` keydown listener during the dispatch of the keydown that
   opened it.** `PopoverFloatingView.onMount` installs `document` `mousedown` and `keydown`
   listeners, and on the `ArrowDown`/`ArrowUp`/`Enter` paths the branch is created from inside a
   `keydown` handler on the input, so the new document listener sits on an ancestor the event has not
   yet bubbled to. Harmless today — that handler acts only on `Escape`, `Escape` never opens, and the
   `Escape`-closes path already calls `stopPropagation()`. Noted rather than defended against,
   because it is a live trap for whoever adds a second key to that document handler.

6. **`itemsError` is written and rendered nowhere.** Kept (D6), out of the bind selector, with a
   comment saying that adding an error arm requires adding the slot. An arm rendered from an
   unsubscribed field is `de-react.md` §6.1's masked defect in its purest form.

## Acceptance criteria

1. `npx tsc --noEmit`, `npm run lint`, `git diff --check` clean.
2. `grep -rn "this.effect(" src/renderer/uikit/Select/` → **nothing**; `SelectModel.init` is gone.
3. `grep -rn "queueMicrotask" src/renderer/uikit/Select/` → **exactly one** hit, the
   `_suppressFocusOpen` clear in `commitSelection` (it is not a render-phase workaround).
4. `grep -rn "s.open = " src/renderer/uikit/Select/` → **exactly two**, the two draft mutators.
5. `grep -rln "@emotion" src/renderer/uikit/Select/` → **nothing**. Renderer-wide `uikit/` Emotion
   importers: **13 → 12**.
6. `grep -rn "\[data-part=\"react-slot\"\]"` count inside an open `Select` dropdown at runtime: **0**,
   with a 1000-item list scrolled and settled. Also 0 inside a **closed** `Select`'s chevron, which
   is new — today it is 1 per instance.
7. No `DepsGate` in `SelectView`, no `mutate()`/`onStateApplied` on `SelectModel`, and no per-field
   guards (`lastOpen`, `lastSearchText`, `lastActiveIndex`) in `SelectView`. Asserted as an *absence*
   so a later reader does not "fix" it into a funnel.
8. Story: all twelve controls exercised, including all three `itemsMode` values. `lazy-promise` shows
   the spinner arm, then the rows, and — with a value selected — the selected row is highlighted and
   scrolled into view when the rows land.
9. The index-space fix is demonstrated: with a value selected and the popover closed, typing one
   character that matches the selected item highlights **that** item, and typing one that does not
   highlights nothing. (Before the fix the first case highlights the wrong row.)
10. `browser_snapshot` diff of the story before/after: identical `data-*` output apart from the
    generated `data-id` / `id` values (C3-5).
11. App-level pass: all eight app-layer call sites render, filter and select; `AVGrid/CellSelect`
    autofocuses, opens, commits on pick and cancels on `Escape`, and its three descendant selectors
    still hit (`[data-type="select"]` → `[data-type="input"]` → `input`).
12. The Rule 4 number is recorded in EPIC-056's Notes with both raw counts and the method.

## Files changed

| File | Change |
|---|---|
| `src/renderer/uikit/Select/SelectView.ts` | **new** — the vanilla view (D6–D9, D11, D12) |
| `src/renderer/uikit/Select/Select.css` | **new** — three declarations in `@layer uikit` (D11) |
| `src/renderer/uikit/Select/Select.tsx` | 172 → ~100; Emotion and all hooks removed, `mountVanilla` shim, type re-exports kept |
| `src/renderer/uikit/Select/SelectModel.ts` | `init()` and all four effects deleted; `setProps`, `resetItemsCache`, `startLoadIfNeeded`, `seedIndex`, `openInto`, `closeInto`, `openPopover`, `closePopover` added; `tryOpen` deleted; nine `open` write sites rewritten; three `itemsLoaded` producers seed; two handlers retyped to native events; four doc comments corrected |
| `src/renderer/uikit/Input/Input.tsx` | `startSlot`/`endSlot` widen to `SlotContent` (D8) |
| `src/renderer/uikit/Input/InputView.tsx` | `hasSlot` widened; `appliedSlots` identity gate (D8) |
| `src/renderer/uikit/IconButton/IconButton.tsx` | `import "./IconButton.css"` removed (D10) |
| `src/renderer/uikit/IconButton/IconButtonView.tsx` | CSS import added; `appliedIconName` gate on `updateIcon` (D8, D10) |
| `src/renderer/uikit/shared/react-compat.ts` | **not in the original plan** — `isEnumeratedAttribute` now matches any `aria-` prefix, so a boolean `aria-*` renders as `"true"`/`"false"` as React does. See correction 4 |
| `doc/epics/EPIC-056.md` | status, task row, Notes block, two corrections, the Rule 4 number |
| `src/renderer/uikit/CLAUDE.md` | three new Rule 9 rules (step 14) |
| `doc/active-work.md` | US-1017 entry under EPIC-056 |

**Follow-ups recorded, not done here:** IME composition suppression in `InputView` (pre-existing,
shared file); hoisting `SettingsSections`' two `items` literals to module constants (app layer);
deleting the dead `itemsError` field and the unconsumed `SelectItemsResult` export (Epic F's API
cleanup); a sweep over borrowed-CSS imports (`Notification`, `SplitButton`, `DateInput`); making an
async source load once per source rather than once per open (a semantic change with a decision
attached).

## Corrections to this plan, made during implementation

Four places where the plan was wrong or incomplete. Each is corrected in the code and recorded here
rather than quietly overwritten.

1. **`seedIndex` must take the item array as a parameter, not read it from state.** D4's snippet read
   `s.loadedItems` and guarded on `s.itemsLoaded`. That is silently always -1 on the load path:
   `commitLoaded` calls it *before* its own write, when `loadedItems` is still empty and `itemsLoaded`
   still false — which is the whole point of that call site. The signature is
   `seedIndex(items: IListBoxItem[], searchText: string)`, and the length check replaces the
   `itemsLoaded` guard. Caught by the runtime probe, not by the type checker: the async arm rendered
   its rows correctly and simply had no highlight. This is the same class of mistake D4's own closing
   paragraph warns about, made inside the helper that warns about it.

2. **The three `itemsLoaded = true` producers are factored into one `commitLoaded(r)`.** The plan
   said to apply the seed snippet to each of `startLoad`'s three branches. One private method taking
   the resolved items is strictly better — one place to read, and the seed cannot be added to two of
   the three by accident. It also normalises `itemsError = null` across all three (previously only the
   sync branch cleared it; on the async branches it is already null from `startLoad`'s loading write,
   so this is a no-op, not a behaviour change).

3. **`setReactId` is renamed `setElementId`, and `selectId` returns the id directly.** The plan did
   not resolve this and flagged it for checking. The old getter was `` `select-${this._reactId}` ``, so
   passing `nextElementId("select")` would have produced `select-select-1`. The prefix now lives in the
   `nextElementId` call, matching `ListBoxModel.setElementId`.

4. **One shared file the plan did not name: `shared/react-compat.ts`.** `applyRestProps` dropped
   `aria-expanded={false}` and wrote `aria-expanded=""` for `true`; React renders booleans on `aria-*`
   as `"true"` / `"false"`, and `aria-expanded="false"` is not the same as no attribute. Found by the
   first DOM diff of the converted control. `isEnumeratedAttribute` now matches any `aria-` prefix
   alongside the existing three enumerated names. **Already live in the converted `PathInput`**
   (`PathInputView.tsx:83`), and US-1018 would have hit it twice more (`Autocomplete` and
   `MultiSelect` both pass `aria-expanded={open}`), so it is fixed in the shared layer rather than
   worked around in `SelectView`.

## Verification record (2026-08-22)

### Static

- `npx tsc --noEmit` — clean. `npm run lint` — clean.
- `grep -rn "this.effect(" Select/` — **nothing**; `SelectModel.init` is gone.
- `grep -rn "queueMicrotask" Select/` — **one** real call, the `_suppressFocusOpen` clear.
- `grep -rn "s.open = " Select/` — **two**, the two draft mutators.
- `grep -c "this.state.update(" SelectModel.ts` — **13** (was 23).
- `grep -rln "@emotion" Select/` — **nothing**. `uikit/` Emotion importers **13 → 12**.
- No `DepsGate`, no `mutate()`/`onStateApplied`, no `lastOpen`/`lastSearchText`/`lastActiveIndex`.

### Runtime — the converted control

Structure, closed: `div[data-type="select"][data-name][data-id="select-N"][data-state="closed"]` →
`div[data-type="input"]` → `input` + `div[data-part="end-slot"]` → `button[data-type="icon-button"]`
→ `span[data-part="icon"]` → `svg`. `aria-haspopup="listbox"`, `aria-controls="select-N-listbox"`,
`aria-expanded="false"`. **`[data-part="react-slot"]` count: 0** — new, and the chevron is why.

Open: the popover's only direct child is `div[data-type="list-box"]`, `role="listbox"`,
`id="select-N-listbox"`, 11 rows for `growToHeight` = 10 × 24 = 240px, popover width 402 against a
400px anchor (`matchAnchorWidth` plus its border). Rows are
`div[data-type="list-item"][data-variant="select"][data-selection-style="check"][role="option"]` with
`aria-selected` and `id="select-N-listbox-item-<value>"`. **`react-slot` count in the open dropdown
with 1,000 items: 0.**

One keystroke (`"1"`, 50 items): the list element is the *same object* (the branch was not rebuilt),
rows re-filter to the eleven `Option 1x` entries, and the label carries `.highlighted-text` spans.
This is the state-to-child-gate path: `filtered` recomputes, `props.items` gets a new identity,
`ListBoxModel.repaintSignature()` slot 0 moves, `ListBoxView` repaints.

**The index-space fix, demonstrated.** Value `Option 1`, popover closed, type `1`:
`aria-activedescendant` is `item-1`, the active row is `Option 1`, and it is also the selected row.
The filtered order is `Option 1, 10, 11, 12…`, so the old `loadedItems.findIndex` result of 1 would
have made `Option 10` active.

**The async arm.** A `() => Promise` source with a 300 ms delay and `Option 40` selected: **zero**
loader calls before the first open (nothing starts from the constructor); the `loading` arm shows the
spinner with 0 rows; after the resolution, 11 rows, `aria-activedescendant` = `item-40`, the active
and selected row is `Option 40`, and the visible window is `Option 31`–`43` — so it **scrolled**,
which is `scrollToRowAfterPaint` doing its job off the single co-located write. Reopening does not
re-invoke the loader (cache hit).

**Commit, keyboard, Escape.** Clicking `Option 38` emits `onChange(38)`, closes, removes the popover
and — the `_suppressFocusOpen` assertion — **does not re-open** despite the popover subtree now being
detached before `focus()` runs. The trigger then reads `Option 38 apple banana cherry`. `ArrowDown` on
the closed control opens it *and* seeds `aria-activedescendant` to `item-38`; a second `ArrowDown`
advances to `item-39`. `Escape` fires `onEscape` exactly once, closes, and leaves the trigger text.

**Disabled / read-only.** `disabled` → `data-disabled`, input disabled, chevron disabled, click does
not open. `readOnly` → `data-readonly`, input read-only but **not** disabled, chevron disabled, click
does not open.

**The items-identity churn site.** Rendering with a fresh `items` array five times in a row (the
`SettingsSections` shape) leaves the control correct and opens normally with the seed intact; an
`items` change *while open* keeps it open and re-renders the rows. No loop — a state write does not
pump props in a vanilla driver.

**Disposal.** Unmounting the React root while the dropdown is open leaves `#persephone-overlay-layer`
with zero children and no stray `[data-type="select"]`.

### Runtime — real consumers

**`CellSelect`** (`AVGrid`, the only `ref` consumer and the only production route to the async arm),
mounted with a real React root and an async `options` function: the ref fired **once** and is the
inner `<input>`; autofocus opened the dropdown; the loader ran once; rows `open`/`closed`/`pending`
arrived with `aria-activedescendant` on `item-closed` (the current value); committing `pending` emitted
`onChange("pending")` and closed with the ref still at one call; reopening served the cache; `Escape`
fired `onCancel` once. The three descendant selectors `CellSelect` styles through
(`[data-type="select"]` → `[data-type="input"]` → `input`) all still resolve.

**`SettingsSections.LinkBehaviorSection`** (the fresh-array-per-render site): trigger reads the live
setting, survives five forced re-renders, and opening seeds the highlight onto the selected row. 0
React slots.

AVGrid's own edit-mode entry could not be triggered synthetically (`grid.editCell` and a synthetic
`dblclick` both left `cellEdit` null), so `CellSelect` was exercised through its own React root rather
than through the grid's edit plumbing — which this task did not touch.

### Rule 4 (C3-9)

19 anchor-pane records, 198 overlay-layer records, **217 total**, for one keystroke over 1,000 items
with 11 rows rendered. Method, the deviation from the stated procedure, and the `applyRestProps`
observation are recorded in EPIC-056's Notes.

Probe artifacts cleaned up: three offscreen hosts removed, the temp `grid-json` page closed, the
overlay layer empty, no stray DOM, and the user's four original pages untouched.

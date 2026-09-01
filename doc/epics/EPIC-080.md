# EPIC-080: State, lifetime & scheduling core

## Status

**Status:** Completed
**Created:** 2026-08-31
**Started:** 2026-08-31
**Completed:** 2026-09-01

**Roadmap:** packages 2 + 3 of [de-react-refactoring-2.md](../de-react-refactoring-2.md) Part 6.
The first epic of that programme.

## Overview

The De-React second pass found that most surviving workarounds in the renderer are hand-rolled
substitutes for four missing framework mechanisms (its Part 3, RC1–RC3). This epic builds those
mechanisms and converts the call sites that exist only because they were absent:

- **P1** — one listener-list core; disposable emitters; the `EventChannel` unsubscribe fix.
- **P7** — one disposal contract, and views that can hand a store to their helpers.
- **P2** — `afterDispatch`: run work after the current state dispatch settles.
- **P3** — owner-bound scheduling: `this.schedule.raf/timeout/delayer`, cancelled on dispose.

This is the only epic in the programme that can break the whole app in a way no per-editor check
catches: every one of ~860 renderer files sits on these primitives. Its verification question is
*"did we brick it"*, which is why it is separated from the shallower mechanism work (EPIC-081) and
the per-editor conversions (EPIC-082).

## Why now — the measured case

**The correct implementation already exists twice in the tree, and the third copy is wrong.**
Verified at commit `804ca1db`:

| Listener list | Registration identity | Retired during dispatch | Idempotent disposer | Error contained |
|---|---|---|---|---|
| `TOneState.register` (`core/state/state.ts:91-101`) | object | skipped | yes | yes |
| `Emitter.event` (`core/state/events.ts:11-20`) | object | skipped | yes | yes |
| `EventChannel.subscribe` (`api/events/EventChannel.ts:39-47`) | **function ref** | **still called** | **no** | yes |

`state.ts:60-78` carries a paragraph explaining why `active` exists, ending with the bug that forced
it: *"Found when switching editors: `attach` bumps `page.state.version`, an earlier subscriber
rebuilt the toolbar and disposed the old `NavPanelButtonView`, and that view's own subscription then
ran anyway."* The same comment calls the shape *"that decision applied to the state primitive, not a
new opinion"* — the code already knows these are one mechanism. `EventChannel` never received the
fix, and it is the channel the content-delivery pipeline rides on.

**Two `EventChannel` bugs, not one.** The report named the retired-handler bug; investigation found a
second:

1. **`indexOf(handler)` keys on the function reference.** Subscribe the same handler twice and the
   first disposer removes the *other* registration. Both correct implementations hold a registration
   *object*, which is immune by construction.
2. **`sendAsync` is the serious exposure, not `send`.** It snapshots the handler list, then iterates
   LIFO **awaiting** each handler (`EventChannel.ts:74-86`). The unsubscribe window is therefore
   genuinely asynchronous and arbitrarily wide, not merely synchronously re-entrant: a subscriber
   disposed while an earlier handler awaits is still invoked afterwards. `sendAsync` is exactly the
   mechanism the Content Delivery Layer-3 open handler uses to intercept newest-first
   (`agents-common.md` Critical Pattern 6), so the widest window sits under the most
   ordering-sensitive code in the renderer.

**The `debounce` hazard is worse than "no cancel handle".** `shared/utils.ts:34-54`: when the optional
`canRun()` returns false, `run` **reschedules itself indefinitely** at `delay` intervals. So
`api/pages/PagesPersistenceModel.ts:71` — `debounce(this.saveState, 500, () => this.restored)` —
becomes a permanent 500 ms timer chain if `restored` never flips, with no handle anywhere to stop it.
19 call sites, **2** of them passing `canRun` (`PagesPersistenceModel.ts:71` and
`TextFileIOModel.ts:364-368`) — corrected from "8" during US-1263. One consumer is in the main
process (`src/main/open-window.ts:278`), so `debounce`'s signature is not renderer-private.

**The utilities exist; ownership is the gap.** `core/utils/scheduling.ts` already provides `Delayer`
(with `cancel()` *and* `dispose()`) and `afterPaint` (returning a cancel handle). `Delayer` has
exactly **one** consumer in the entire renderer (`GraphLegendPanelView.ts:46,73`); `afterPaint` is
used in two files. Meanwhile 21 raw `requestAnimationFrame` sites outside `scheduling.ts` each
hand-roll a handle field, a cancellation, and a `live` guard.

## Goals

- One listener-list core behind `TOneState`, `Emitter`, and `EventChannel`; both `EventChannel`
  unsubscribe bugs fixed; `dispose()` on `Emitter`, `Subscription`, and `EventChannel`.
- One disposal contract, with `IDisposable` as the interchange type, and a way for an owner to hand a
  store to a helper object.
- `afterDispatch` available as an **additive** primitive, with the elaborate ordering workarounds
  converted onto it.
- Owner-bound scheduling on `VanillaView`/`TModel`, and the 21 hand-rolled rAF sites retired.
- The `live` / `generation` / `inert` flag family reduced to `isDisposed` plus guarded helpers.

## The mechanisms

### P1 — one listener core; disposable emitters

Extract the `{ listener, active }` array with idempotent disposers that `TOneState` and `Emitter`
already share, and back all three lists with it. Add `dispose()` to `Emitter`/`Subscription`
(clearing all listeners) and to `EventChannel`.

Note the leak this closes: `core/state/events.ts` declares **five module-level `Subscription`
singletons** (`globalKeyDown`, `browserUrlChanged`, `windowClosing`, `secondaryViewsToggled`,
`panelExpanded` — corrected from "six" during US-1259; `rg "new Subscription"` finds these five plus
five instance fields). A `Subscription` has no `dispose()`, so any subscriber that fails to
unsubscribe is retained by a module global for the life of the window.

**There is a fourth listener list, outside the renderer.** `src/ipc/renderer/renderer-events.ts:5-46`
(`RendererEventObject`) violates the same triad and is worse on two counts: its disposer
`filter(cb => cb !== callback)` removes *every* registration of a duplicated callback rather than one,
and `listen` dispatches with `forEach` over the live field while the disposer **reassigns** that
field, so a handler unsubscribed mid-dispatch is still invoked. It carries a third error policy
(`console.error`) and 22 module-level singletons with no disposal. `src/ipc` has **zero** import edges
to `src/renderer` today, so sharing the core is a layering decision rather than a mechanical edit;
US-1259 records the disposition explicitly.

*Zero behaviour change except the bugs.* Highest trust-per-line in the epic.

### P7 — one disposal contract

Two implementations, and the asymmetry is the problem:

- `core/utils/DisposableStore.ts` — **correct**: per-item idempotent release handles, error-contained
  `dispose()` (runs every cleanup, rethrows the first failure), a `closed` flag. Takes
  `Cleanup = () => void`.
- `api/internal.ts:14-30` `DisposableCollection` — takes `IDisposable` **objects**; `dispose()` is a
  plain `for` loop, so **one throw abandons the rest**; no idempotency; and `add()` after `dispose()`
  silently repopulates a collection nobody will dispose again.

Upgrade `DisposableCollection` to `DisposableStore` semantics, or delete it in favour of a core store
accepting `Cleanup | IDisposable`; then let a `VanillaView`/`TModel` hand a store to helper objects
(`CellTooltip`, `ImperativeSplitter`, `KeyedList`) so helpers stop hand-rolling symmetric add/remove
listener lists. Includes the sweep of the 64 raw `addEventListener` sites onto `listen()`.

### P2 — `afterDispatch` (the transaction epilogue)

```ts
// Runs fn after the current dispatch (and any nested dispatches) fully settle;
// runs synchronously and immediately if no dispatch is in flight.
afterDispatch(fn: () => void): void
```

A module-level depth counter around `stateChanged`, and a FIFO drained when depth returns to zero.

**It must be additive.** `set()`'s existing semantics do not change; `afterDispatch` is a new
primitive and call sites move onto it one at a time. With **717** `state.update(` sites, 8
`state.set(`, 208 `.subscribe(` and 163 `bind(` sites, a global FIFO alters *when side effects land*
app-wide, and there is no test suite to catch a regression — see Risk below.

### P3 — owner-bound scheduling

```ts
this.schedule.raf(() => …)        // coalesced: a re-request replaces the pending one
this.schedule.timeout(ms, () => …)
this.schedule.delayer(ms)         // per-owner Delayer, disposed with the owner
```

**The shape is already proven in the same class.** `VanillaView.listen()`
(`uikit/shared/vanilla-view.ts:197-212`) is exactly this pattern for DOM events: `assertActive()`, a
disposal-guarded wrapper, and an idempotent early-release handle from `ownReleasable`. `schedule.*` is
a direct analogue backed by the existing `Delayer`/`afterPaint`, which makes it the most mechanical of
the four mechanisms despite touching the most files.

## Corrections to the report's plan

Found while investigating; both change a task definition.

**1. P2 does *not* retire all of `deferEditorCleanup`.** The report lists it as retired wholesale.
`api/pages/PageModel.ts:114-116,367-400` is actually **four** coordinating mechanisms, and only two of
them are about dispatch ordering:

| Mechanism | Fate under P2 |
|---|---|
| `setTimeout(…, 0)` at `:374` | replaced by `afterDispatch` |
| `cleanupGeneration` (`:114`) and the `pendingCleanupTimers` map (`:115`) | **deleted** — they exist only to make that timer invalidatable and cancellable |
| `pendingCleanupPromises` set (`:116`) + the `drainDeferredEditorCleanup` await loop (`:389-400`) | **must survive** |

The drain awaits **asynchronous editor disposal** so `PageModel` teardown (`:763`) cannot complete
while an editor is still closing. That is a different concern from dispatch ordering, and
`afterDispatch` does not address it. US-1262 must say so explicitly, or the conversion will delete a
real guarantee while "simplifying".

**2. Retiring the `live` flags is its own task.** The report folds it into the tail of P3. There are
**106** `this.live` references, and six spellings of the same concern coexist (`live`, `inert`,
`isLive`, `generation`, `isDisposed`, `_autoInitExplorerQueued`). A missed conversion is a
use-after-dispose that surfaces only under specific timing — the bug class that survives a green build
and a smoke test. It needs a mechanical, greppable rule decided up front, not a cleanup tacked onto
the end of another task.

## Risk & abort criteria

**The risk is concentrated in P2, and it is asymmetric.** P1, P7 and P3 are near-zero-behaviour
changes with immediate payoff; P2 changes global timing.

- **Abort criterion:** if `afterDispatch` produces ordering surprises under real use that are not
  resolved by the *first* conversion attempt, stop at US-1261, leave the primitive unused or revert
  it, and close the epic on P1/P7/P3. Those three stand entirely on their own — none of them depends
  on P2 existing.
- **Do not** batch state writes, add an equality gate to `update()`, or introduce a
  dependency-graph/observable layer. All three were considered and rejected in the report's
  "Considered and NOT recommended", and the second was already litigated in
  `model-view-pattern.md:488-506`.
- **Verification is manual and shallow-but-real:** typecheck, lint, `build-prod`, then a **cold start**
  (not an HMR reload) exercising page switching, editor open/close, and the content-delivery open
  path — the three flows that ride the converted ordering.

## Deferred verification

All four items were **verified by the user on 2026-09-01** — a true cold start (`npm start` from a
stopped dev server), visual confirmation that restored pages render correctly, closing the last
remaining tab (the flow US-1261's correction reshaped), and a rapid compare-mode double transition.
All four worked without issues. Item 3's confirmation is what unblocked US-1262.

| # | What needed checking | Raised by | Result |
|---|---|---|---|
| 1 | True cold start over page switching, editor open/close, and the content-delivery open path | epic risk section | ✅ Verified by user, no issues |
| 2 | Restored pages render correctly *visually* | US-1259 verification | ✅ Verified by user, no issues |
| 3 | Close the last remaining tab → one replacement page, after the outgoing page and its editors are disposed | US-1261 correction | ✅ Verified by user, no issues — **unblocked US-1262** |
| 4 | Compare mode: enter and exit twice in quick succession | US-1261 | ✅ Verified by user, no issues |

## Linked Tasks

| Task | Title | Status |
|------|-------|--------|
| US-1259 | P1 — one listener core, disposable emitters, both `EventChannel` unsubscribe bugs | Completed |
| US-1260 | P7 — unify the disposal contract; delete `DisposableCollection`; helper ownership | Completed |
| US-1261 | P2 — add `afterDispatch` (additive); convert `checkEmptyPage`, `AsyncEditorView`, `PageContentView` | Completed |
| US-1262 | P2 — convert `PageModel.deferEditorCleanup`, keeping the async cleanup drain | Completed |
| US-1263 | P3 — owner-bound `schedule.*`; convert the 21 rAF sites; fix the `debounce` reschedule hazard | Completed |
| US-1264 | Retire the *provable* `live` / `inert` duplicates (45 of ~215 refs; see below) | Completed |
| US-1265 | Replace the hand-rolled re-implementations of sanctioned helpers (2 of 3 sites; `PageContentView` deferred) | Completed |
| US-1266 | Sweep the 17 convertible raw `addEventListener` sites onto `listen()` | Completed |

**Sequence.** US-1259 → US-1260 first: they are the trust foundation, carry the only outright bug
fixes, and depend on nothing. US-1261 next, as the additive primitive plus its three simplest
conversions — the decision point for the epic. US-1262 only after US-1261 has held up in use, since it
is the most intricate conversion in the tree. US-1263 can start any time after US-1260 (it needs the
disposal contract, not `afterDispatch`). US-1264 comes **last of the mechanism work**: it can only
remove a `live` flag once the guarded replacement exists, so it needs US-1259, US-1260 and US-1263
landed. US-1265 is independent and can fill any gap after US-1261.

**US-1266 was split out of US-1260** during US-1260's investigation, on the investigation's own
recommendation and my agreement. The measured 64 raw `addEventListener` sites turned out to carry
three materially different migration rules, not one: only **17** are direct `listen()` conversions
(across seven view files), 10 belong to the two genuine helper-ownership fixes, and the remaining 37
are deliberately not converted — process-wide services, `window`/`document` targets, model-owned
pointer capture, generic DOM utilities, Monaco setup, and sandbox-injected listeners. Keeping all of
it in US-1260 would have buried a near-zero-behaviour disposal change under a mechanical sweep and
invited a blanket rewrite. US-1266 is sequenced after US-1260 and carries its own listener census.

Two findings from that investigation corrected the epic's assumptions:
**`DisposableCollection` has zero consumers** — open question 3 is resolved as *delete*, and this
epic's worry that it was "public-ish `api/` surface" was wrong; it is dead code, and `api/internal.ts`
survives only for `wrapSubscription` (`api/settings.ts:9,189`). **`KeyedList` does not have the
problem this epic attributed to it** — it has no listener list and already disposes correctly, so it
is not touched; the hand-rolled per-row list the epic was reaching for is in
`ui/sidebar/PinnedRailView.ts:142-155`, which is a US-1266 conversion candidate.

US-1265 covers the three hand-rolled re-implementations of sanctioned helpers pulled forward from the
roadmap's backlog package, because this epic touches `PageContentView` anyway:
`ui/dialogs/InputDialogView.ts:140-194` (re-does `KeyedList`),
`components/tree-provider/TreeProviderViewImpl.ts:167-181` (re-does `SubtreeSwap`), and
`ui/app/PageContentView.ts:125-182` (both).

Per the deferred-review model, tasks stay `[ ]` until the epic closes; `/review`, `/document` and
`/userdoc` run over the whole epic at close. Task folders are kept for the duration of the programme.

## Open questions

1. **Where does `afterDispatch` live?** A method on `TOneState` makes it discoverable but implies
   per-state depth, which is wrong — the counter must be module-global so *nested dispatches across
   different states* settle as one pass. Leaning to a small `core/state/dispatch.ts` module exporting
   `afterDispatch`, with `stateChanged` incrementing the shared depth. To be settled in US-1261.
2. **Does `schedule` belong on `VanillaView` only, or on `TModel` too?** Models do schedule work
   (`SelectModel`, `PathInputModel`, `BoardTargetModel`), and `uikit/CLAUDE.md` forbids models
   touching the DOM but not scheduling. Leaning to both, sharing one implementation.
3. **Is `DisposableCollection` deleted or upgraded?** Deletion is cleaner, but it is part of the
   public-ish `api/` surface. Count its consumers in US-1260 before deciding.
4. **`TGlobalState` / `TComponentState`** are behaviourally identical empty subclasses
   (`state.ts:138-140`). Keep them as intent markers and document that that is all they are — there is
   no behaviour to add. Confirm in US-1259 rather than opening a separate task.

## Notes

- Scale figures here were measured at commit `804ca1db`, not carried over from the report: 717
  `state.update(`, 8 `state.set(`, 208 `.subscribe(`, 163 `bind(`, 106 `this.live`, 21 raw
  `requestAnimationFrame` outside `scheduling.ts`, 64 raw `addEventListener`, 19 `debounce` call sites
  (**2** with `canRun`, corrected during US-1263).
- **The epic's framing of US-1264 was wrong, and the correction matters.** This epic described the
  `live`/`generation`/`inert` family as "106 sites, mechanical rule" — implying most are duplicates
  awaiting a sweep. Applying an actual rule shows the opposite: of 106 `this.live` references only
  **14** are provably redundant, and of 66 `this.inert` references only **31**. **No** generation
  counter is safe to remove. The 92 retained `live` guards protect async boundaries that none of the
  landed helpers own — uncancellable Promises (dynamic imports, IPC, filesystem, git), raw timers,
  unowned `queueMicrotask()` work, third-party callbacks, and direct `state.subscribe` registrations.
  The subtle one: a direct subscription's callback can fire during the **disposers phase**, after
  `isDisposed` is true but *before its own release entry is reached*, so `ListenerList`'s `active`
  flag does not cover it. Retiring those would recreate the exact use-after-dispose hazard this epic
  set out to remove. Reducing the flag family further requires **new owner mechanisms for async
  boundaries**, not more sweeping — a candidate for a later epic.
- **Deferred out of this epic:** `PageContentView`'s two hand-rolled patterns, which the epic listed
  under US-1265 as straightforward helper adoptions. Investigation showed they are not:
  its **content branch** is a raw DOM wrapper with two different shapes plus a nested
  `RenderEditorView`, which `KeyedList` (a keyed-collection helper) does not model; and its
  **compare branch** cannot use `SubtreeSwap`, because `SubtreeSwap` retires in the *opposite* order
  to the one US-1261 deliberately established. Verified at `uikit/shared/subtree-swap.ts:29-36,67,74`:
  it inserts the replacement, then disposes the old branch, then detaches it — whereas US-1261's
  `clearCompare()` detaches the compare root immediately and defers disposal through `afterDispatch`.
  Converting would invert a Monaco-sensitive order. Extending `SubtreeSwap` with a second retirement
  mode would mean re-reviewing **55 `new SubtreeSwap` call sites across 35 files**, which does not
  belong inside this epic. A future task should first design a dedicated content-branch owner.
  US-1265 therefore covers 2 sites, not 3.
- **Deferred out of this epic:** the fourth listener list, `src/ipc/renderer/renderer-events.ts`
  (`RendererEventObject`, 22 singletons). US-1259 records both its bugs and the reason for deferral:
  converting it means either relocating the listener core to a dependency-free shared module or
  approving the first `src/ipc` → `src/renderer` import edge, and neither belongs inside the epic's
  highest-trust task. It needs a future IPC event-infrastructure task; it is **not** covered by
  US-1260. Recorded here so it survives the task folder.
- **US-1258** (roadmap quick wins) is a standalone task, not part of this epic, and shares no mechanism
  with it — the two are independent and may land in either order.
- P8's lint clauses belong to **US-1131**, and its second clause (flagging `queueMicrotask` /
  `setTimeout(…, 0)` in `onUpdate`/`setProps`) has nothing to point at until US-1261 lands
  `afterDispatch`. Sequencing US-1131 after this epic makes it cheaper.
- **US-1131 lint-clause candidate:** flag a second `schedule.raf()` request while an owner already
  has one pending. The owner-wide slot intentionally replaces the first callback; independent
  concurrent loops must retain raw handles, as demonstrated by
  `src/renderer/editors/video/AudioVisualizer.ts:346-388`, where the animation and sizing loops
  must not clobber each other. Keep this candidate deferred until the owner scheduler lands.
- **EPIC-082** depends on this epic through US-1261: the §1.1 de-effecting wants `afterDispatch` for
  the cases where the ordering is genuinely real.

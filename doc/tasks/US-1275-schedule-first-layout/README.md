# US-1275: `schedule.firstLayout` + retire the duplicated `ResizeObserver` probes

**Status:** Planned

**Epic:** [EPIC-081 — DOM & IO mechanisms](../../epics/EPIC-081.md)

## Goal

Add two owner-bound layout primitives to `OwnerScheduler` in
`src/renderer/core/utils/scheduling.ts`, then replace the three duplicated one-shot resize probes
with `settledLayout` while US-1276 uses `firstLayout` for its three first-layout adopters. The
settled-versus-first investigation is resolved by EPIC-081's 2026-09-02 decision.

## Background

### Verified scheduler seam

`OwnerScheduler` already exists at `src/renderer/core/utils/scheduling.ts:154`; US-1263 has already
added the `schedule` getter to both owner bases:

- `src/renderer/uikit/shared/vanilla-view.ts:51` constructs the scheduler with the view's
  `DisposableStore` and an active assertion; `schedule` is exposed at `:166`.
- `src/renderer/core/state/model.ts:26` constructs the scheduler from the model store; its
  protected `schedule` getter is at `:33`.

The scheduler imports `DisposableStore` and `Cleanup` at `scheduling.ts:1`. Its `raf` at
`:168-195`, `timeout` at `:199-218`, and `delayer` at `:221-231` establish the required shape:
assert active, register the browser resource with the owner's store, guard callbacks after release,
release completed work before invoking the callback, and return an idempotent `Cleanup`. Do not
add another owner surface or modify either base class for this task.

The two public methods must have these shapes:

```ts
public firstLayout(element: HTMLElement, run: () => void): Cleanup
public settledLayout(element: HTMLElement, run: () => void, quietMs = 200): Cleanup
```

Both methods share one private per-call implementation, but remain two named public methods; do not
expose a mode flag or a `quietMs = 0` convention. Their contracts are:

- `firstLayout` observes `ResizeObserverEntry.contentRect`, ignores zero-sized entries, and runs
  synchronously when the element already has a non-zero content rect at call time. If the element is
  never laid out, it never fires and has no timeout; owner disposal cancels it. It disconnects and
  releases before invoking `run`, is idempotent, fires at most once, and never invokes `run` after
  release.
- `settledLayout` resets a per-call quiet timer on every resize observation and, after a non-zero
  observation, runs once when `quietMs` has elapsed since the last observation. The callback must
  re-check for a non-zero current rect; if the element is still zero-sized at expiry, it remains
  pending until a later non-zero observation. An already-laid-out element is still observed and
  follows the initial ResizeObserver delivery plus the quiet period; it does not run synchronously.
  If it is never laid out, it never fires and has no timeout; owner disposal cancels it. It
  disconnects and releases before invoking `run`, is idempotent, fires at most once, and never
  invokes `run` after release.

Setup failures must release the owner registration in the same way as `raf` and `timeout`.

**Critical scheduling constraint:** neither layout method may call `this.raf(...)`. `OwnerScheduler.raf`
at `src/renderer/core/utils/scheduling.ts:168-195` has one owner-wide `pendingRaf` coalescing slot;
using it internally would cancel an unrelated pending rAF and would make two layout waiters on one
owner interfere. The planned private implementation uses independent observer/timer/active handles
per call, modeled on `timeout` at `:199-218`, and therefore satisfies this constraint. The existing
`raf` slot and its semantics remain unchanged.

### Verified canonical probe: `GitChangesView`

`src/renderer/editors/git-tree/GitChangesView.ts:54-55` owns `resizeObserver` and `resizeTimer`.
`onMount()` builds and mounts the staged panel and splitter at `:88-146`, then installs the probe at
`:158`. The probe at `:391-412` observes `this.root`, debounces for 200 ms, reads
`element.clientHeight`, and, only while `bottomHeight` is undefined, sets
`bottomHeight = Math.max(60, height * 0.5)`, applies that height to the staged panel, and updates
the splitter. `onDispose()` manually clears/disconnects these fields at `:166-170`.

The actual source has a private, view-local `bottomHeight` only; repository search found no
app/restart setting for it. It is frozen for the view's lifetime after the first measurement, which
is enough to create the timing hazard. `src/renderer/editors/register-editors.ts:80-84` registers the Git secondary panel,
and `src/renderer/editors/git-tree/GitPanelSecondaryView.ts:264-271` mounts `GitChangesView` as its
changes body, placing it under the same collapsible secondary-view stack transition.

### Verified link probes

Both link panels use the same shape and the same one-time defaulting behavior:

- `src/renderer/editors/link-editor/panels/LinkTagsSecondaryView.ts:35-36` declares the fields;
  `:120-147` creates the bottom list and splitter with `bottomHeight ?? 150`; `:220-241` applies
  the debounced 50% measurement; `onDispose()` clears/disconnects at `:93-97`.
- `src/renderer/editors/link-editor/panels/LinkHostnamesNavigationPanel.ts:31-32` declares the
  fields; `:127-154` creates the bottom list and splitter with `bottomHeight ?? 150`; `:227-248`
  applies the debounced 50% measurement; `onDispose()` clears/disconnects at `:87-91`.

The link `bottomHeight` fields are also view-local and frozen for each view's lifetime. Both views mount
inside the native secondary-view stack. `src/renderer/ui/secondary-views/SecondaryViewsView.ts:171-181`
renders each panel with `alwaysRenderContent: true`, and
`src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.css:9-17` transitions each panel's
`flex` for `0.15s ease` when its `data-state` changes. A first non-zero `ResizeObserver` entry can
therefore occur during the open transition; the existing 200 ms debounce is deliberately later than
that transition and measures the settled container height.

### First-versus-settled verdict — resolved gate

The three adopters all want **settled**:

| Adopter | Verdict | Evidence |
|---|---|---|
| `GitChangesView.installResizeObserver` | **settled** | Its 200 ms debounce precedes the one-time `height * 0.5` default for the staged panel. The value is retained in `bottomHeight` for the view lifetime, so an in-transition height would freeze a wrong split. |
| `LinkTagsNavigationPanelView.installResizeObserver` | **settled** | The 200 ms debounce feeds the one-time 50% bottom-panel default; the containing collapsible panel has a 150 ms flex transition. |
| `LinkHostnamesNavigationPanelView.installResizeObserver` | **settled** | Same one-time 50% default and same 150 ms collapsible-panel flex transition. |

This met EPIC-081's abort criterion and is now resolved by
[EPIC-081's “The abort gate fired — and the resolution” section](../../epics/EPIC-081.md#the-abort-gate-fired--and-the-resolution-2026-09-02).
US-1275 adds both named methods: these three adopters use `settledLayout(..., 200)`, while
US-1276's three independent adopters use `firstLayout`. The 200 ms default preserves the current
observable quiet-period behavior; no rect-stability detection is introduced.

## Implementation Plan

### 1. Add both named layout methods

- [ ] Implement `OwnerScheduler.firstLayout(element, run): Cleanup` with the first-non-zero,
      synchronous-already-laid-out, never-laid-out/no-timeout, one-shot, release-safe contract.
- [ ] Implement `OwnerScheduler.settledLayout(element, run, quietMs = 200): Cleanup` with a
      per-call quiet timer reset by each resize observation, no rect-stability detection, the
      initial-observation-plus-quiet-period already-laid-out behavior, and the same cancellation and
      one-shot contract.
- [ ] Share the private observer/timer implementation without exposing a mode flag, and do not call
      `this.raf(...)` from either method. Verify the independent handles against
      `OwnerScheduler.timeout()` at `src/renderer/core/utils/scheduling.ts:199-218`.

### 2. Implement the owner-bound primitive(s)

Update `src/renderer/core/utils/scheduling.ts`. Match the existing `timeout` registration and
release contract, not the owner-wide `raf` slot. The public surface and shared private shape are:

Before:

```ts
export class OwnerScheduler {
    // raf(), timeout(), and delayer() exist; add two named layout waiters.
}
```

After:

```ts
public firstLayout(element: HTMLElement, run: () => void): Cleanup {
    return this.layoutWait(element, run, undefined);
}

public settledLayout(
    element: HTMLElement,
    run: () => void,
    quietMs = 200,
): Cleanup {
    return this.layoutWait(element, run, quietMs);
}

private layoutWait(
    element: HTMLElement,
    run: () => void,
    quietMs: number | undefined,
): Cleanup {
    // Use independent observer/timer handles registered in this.disposables;
    // never call this.raf(). First layout may complete synchronously; settled
    // layout waits for the initial observation plus quietMs.
}
```

The private implementation must not import a view/model type. It must clean up the observer and any
per-call timer on owner disposal and when the callback wins, release before `run`, and keep all
release paths idempotent. A never-laid-out element remains pending until owner disposal; neither
method invents a timeout.

### 3. Adopt the settled primitive in the three probes

Update these exact methods without changing the 50% defaults, min/max
clamps, or splitter updates:

- `src/renderer/editors/git-tree/GitChangesView.ts:391-412`,
  `GitChangesView.installResizeObserver()`.
- `src/renderer/editors/link-editor/panels/LinkTagsSecondaryView.ts:220-241`,
  `LinkTagsNavigationPanelView.installResizeObserver()`.
- `src/renderer/editors/link-editor/panels/LinkHostnamesNavigationPanel.ts:227-248`,
  `LinkHostnamesNavigationPanelView.installResizeObserver()`.

Before:

```ts
const observer = new ResizeObserver(() => {
    if (this.resizeTimer !== undefined) clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
        const height = element.clientHeight;
        if (height <= 0 || this.bottomHeight !== undefined) return;
        this.bottomHeight = Math.max(MIN_HEIGHT, height * 0.5);
        this.applyBottomHeight(this.bottomHeight);
        this.splitter?.update(this.splitterProps(this.bottomHeight));
        observer.disconnect();
    }, 200);
});
observer.observe(element);
this.own(() => { /* clear timer and disconnect */ });
```

After:

```ts
this.schedule.settledLayout(this.root, () => {
    const height = this.root.clientHeight;
    if (height <= 0 || this.bottomHeight !== undefined) return;
    this.bottomHeight = Math.max(MIN_HEIGHT, height * 0.5);
    this.applyBottomHeight(this.bottomHeight);
    this.splitter?.update(this.splitterProps(this.bottomHeight));
});
```

Delete each adopter's `resizeObserver` and `resizeTimer` fields, the manual `onDispose()` cleanup
for those fields, and the `own(...)` cleanup installed by the probe. Keep all other disposal and
child-view cleanup unchanged. The final implementation must prove that the callback runs after the
sidebar's flex transition has settled, not merely after the first non-zero rect.

## Concerns

- **First versus settled is now explicit:** all three current 200 ms probes are settled-layout
  logic. Their `bottomHeight` values are view-local and frozen for the view's lifetime, so a
  first-layout callback would make each 50% default depend on an animated intermediate height.
  `settledLayout(..., 200)` preserves the existing quiet-period behavior.
- **The two methods must remain distinct:** do not replace the named `firstLayout` and
  `settledLayout` APIs with a mode flag, a `quietMs = 0` convention, or rect-stability detection.
- **Neither method may use `OwnerScheduler.raf()`:** its one owner-wide coalescing slot at
  `src/renderer/core/utils/scheduling.ts:168-195` is unsuitable for independent layout waiters.
  The planned shared implementation uses per-call observer/timer handles like `timeout()` at
  `:199-218`.
- **No `ResizeObserver` field is needed after adoption:** the owner scheduler/settle primitive must
  own observer lifetime. Do not leave a redundant local cleanup or a second observer handle.
- **Do not broaden scope:** `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.css`
  is evidence for the timing decision, not a planned change. Do not alter secondary-view animation
  behavior as part of this task.
- No unit tests or test harnesses are to be added. `doc/active-work.md` is intentionally unchanged.

## Acceptance Criteria

- [ ] `OwnerScheduler.firstLayout(element, run)` and
      `OwnerScheduler.settledLayout(element, run, quietMs = 200)` exist as two named methods sharing
      one private implementation; neither uses `OwnerScheduler.raf()`'s coalescing slot.
- [ ] `firstLayout` runs synchronously for an already-laid-out element, otherwise waits for the first
      non-zero content rect; a never-laid-out element never fires and has no timeout; release is
      idempotent, fires at most once, and prevents `run` after release.
- [ ] `settledLayout` waits for the initial observation plus `quietMs` when already laid out, resets
      its per-call timer after every resize observation, and otherwise never fires for a never-laid-
      out element without a timeout; release is idempotent, fires at most once, and prevents `run`
      after release.
- [ ] `GitChangesView`, `LinkTagsNavigationPanelView`, and
      `LinkHostnamesNavigationPanelView` measure after layout settles and preserve their existing
      50% defaults, clamps, and splitter updates.
- [ ] The three local `resizeObserver`/`resizeTimer` fields and their probe-specific `own(...)`
      cleanup are removed only after the shared primitive owns the lifetime.
- [ ] The callback cannot run twice and cannot run after the owning view is disposed.
- [ ] No implementation, unit test, test harness, commit, or `doc/active-work.md` edit is included
      in this investigation task.

## Files Changed Summary

| File | Planned change |
|---|---|
| `src/renderer/core/utils/scheduling.ts` | Add named `firstLayout` and `settledLayout` methods sharing a per-call, owner-bound implementation. |
| `src/renderer/editors/git-tree/GitChangesView.ts` | Replace the settled one-shot resize probe with `settledLayout(..., 200)`; remove its local observer/timer fields and cleanup. |
| `src/renderer/editors/link-editor/panels/LinkTagsSecondaryView.ts` | Replace the settled one-shot resize probe; remove its local observer/timer fields and cleanup. |
| `src/renderer/editors/link-editor/panels/LinkHostnamesNavigationPanel.ts` | Replace the settled one-shot resize probe; remove its local observer/timer fields and cleanup. |
| `src/renderer/uikit/shared/vanilla-view.ts` | **No change**; `schedule` already exists from US-1263 (`:51`, getter at `:166`). |
| `src/renderer/core/state/model.ts` | **No change**; model `schedule` already exists from US-1263 (constructor at `:26`, getter at `:33`). |
| `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.css` | **No change**; inspected only as evidence for the 150 ms transition. |
| `doc/active-work.md` | **No change** by explicit instruction. |

# US-1276: layout-measurement retries

**Status:** Planned — depends on [US-1275](../US-1275-schedule-first-layout/README.md)

**Epic:** [EPIC-081 — DOM & IO mechanisms](../../epics/EPIC-081.md)

## Goal

Replace the remaining owner-bound layout retry work with US-1275's approved shared layout
primitives, while preserving each adopter's guards and behavior. The three secondary-view probes use
`settledLayout`; the three adopters in this task use `firstLayout`, and the ImageViewport fix remains
an independent synchronous change.

## Background

### Dependency and owner contract

`OwnerScheduler` is already available through protected `this.schedule` on `VanillaView` and
`TModel` (`src/renderer/uikit/shared/vanilla-view.ts:166` and
`src/renderer/core/state/model.ts:33`). US-1275 adds the two named methods
`firstLayout(element, run)` and `settledLayout(element, run, quietMs = 200)` through one private
implementation. Do not add another scheduler, local observer owner, or test harness.

The layout methods must not call `this.raf(...)`. `OwnerScheduler.raf()` at
`src/renderer/core/utils/scheduling.ts:168-195` coalesces through one owner-wide `pendingRaf` slot;
that would clobber unrelated rAF work and independent layout waiters. US-1275's planned
implementation uses independent per-call observer/timer handles, modeled on `timeout()` at
`src/renderer/core/utils/scheduling.ts:199-218`, so these adopters do not enter the coalescing slot.

### Verified `RestDetailView` retry

`src/renderer/editors/rest-client/RestClientShared.ts:88-90` declares `resultMeasureGate`, nullable
`resultHeight`, and a `Cleanup`-typed `measureFrame`. The view constructs a `requestPane` with
`flex: "7 1 0"` and a `responsePane` with `flex: "3 1 0"` at `:113-126`. On mount, it registers
`measureFrame` cleanup at `:149-153`, mounts the response viewer, and calls `syncLayout()` at
`:227`. `syncLayout()` calls `scheduleMeasurement()` while `resultHeight` is null (`:252-255`).

The retry at `RestDetailView.scheduleMeasurement():268-280` cancels the previous scheduler frame,
uses `this.schedule.raf`, and self-reschedules while the root is disconnected or
`responsePane.offsetHeight <= 0`. Once non-zero, it assigns `resultHeight`, calls `syncLayout()`,
and **must retain** `this.resultMeasureGate.prime([this.resultHeight])` exactly as the last step.

This is a first-usable-layout wait: it needs the response pane's first non-zero height so it can
freeze the initial response height and apply the fixed-height layout. There is no 200 ms debounce or
settled-animation requirement in this code path. The target element should be
`this.responsePane`, while the existing `root.isConnected`/positive-height guard remains in the
callback as a defensive lifecycle check.

Before:

```ts
this.measureFrame?.();
this.measureFrame = this.schedule.raf(() => {
    this.measureFrame = undefined;
    if (!this.root.isConnected || this.responsePane.offsetHeight <= 0) {
        this.scheduleMeasurement();
        return;
    }
    this.resultHeight = this.responsePane.offsetHeight;
    this.syncLayout();
    this.resultMeasureGate.prime([this.resultHeight]);
});
```

After (using the approved first-layout primitive and preserving synchronous completion):

```ts
this.measureFrame?.();
let completed = false;
const release = this.schedule.firstLayout(this.responsePane, () => {
    completed = true;
    this.measureFrame = undefined;
    if (!this.root.isConnected || this.responsePane.offsetHeight <= 0) {
        this.scheduleMeasurement();
        return;
    }
    this.resultHeight = this.responsePane.offsetHeight;
    this.syncLayout();
    this.resultMeasureGate.prime([this.resultHeight]);
});
if (!completed) this.measureFrame = release;
```

The exact callback body and `resultMeasureGate.prime` behavior are not optional. The local cleanup
field may remain because `scheduleMeasurement()` explicitly releases a prior pending waiter before
replacement; owner disposal must also cancel it through the scheduler store.

### Verified `MarkdownBodyView` retry and generation guard

The current retry is at `src/renderer/editors/markdown/MarkdownBodyView.ts:516-550` (the supplied
`520-544` range is shifted in this checkout). `anchorRetry` is a `Cleanup | null` at `:132`, and
`cancelAnchorRetry()` releases it at `:136-139`. `scrollToAnchor()` captures the current
`MarkdownEditor` and `lifecycleGeneration` at `:518-520`, then:

- checks `isCurrent(model, generation)` before each attempt;
- stops while `typedQueue.pendingRequestCount > 0`;
- asks `MarkdownBlockView` to resolve the anchor;
- records scroll position when found; and
- schedules another `this.schedule.raf(attempt)` only through ten failed attempts.

`MarkdownBlockView` registers the request handler at `:227-257`; anchor lookup is a synchronous DOM
query at `:252-256`. Its render path replaces and mounts the entire block synchronously at
`:336-366`. `MarkdownBodyView` mounts the block before subscribing to queued events at
`:245-274`, and updates the block synchronously at `:504-513`.

`firstLayout` does **not** subsume the `isCurrent(model, generation)` guard. It must be retained:
`MarkdownBodyView.replaceModel()` increments `lifecycleGeneration`, cancels the pending retry,
detaches old subscriptions, and binds the new model at `:304-332`; the view itself is not disposed.
Keep `active`, `model === capturedModel`, and `lifecycleGeneration === captured` checks around both
the request and its Promise continuation. Keep the ten-attempt cap. Because `firstLayout` may run
synchronously for an already-laid-out element, store its returned cleanup only when the callback has
not already completed; otherwise a completed synchronous waiter would leave a stale `anchorRetry`
field.

The adopter verdict is **first** for the layout portion: it needs the content block to become usable,
not the 200 ms settled dimension used by the three secondary-view split defaults. `firstLayout` is
only the geometry gate; it does not replace synchronous anchor lookup or the bounded missing-anchor
retry. The chosen block root and the synchronous-completion handling above preserve that behavior.

Before:

```ts
if (++attempts <= 10 && this.isCurrent(model, generation)) {
    this.anchorRetry = this.schedule.raf(attempt);
}
```

After:

```ts
if (++attempts <= 10 && this.isCurrent(model, generation)) {
    let completed = false;
    const release = this.schedule.firstLayout(this.markdownBlock.root, () => {
        completed = true;
        attempt();
    });
    if (!completed) this.anchorRetry = release;
}
```

Do not remove `isCurrent`, `active`, `lifecycleGeneration`, `cancelAnchorRetry`, or the ten-attempt
bound. The selected element and synchronous-completion handling must preserve the bounded retry
behavior even when the element is already laid out.

### Verified `AudioVisualizerView` sizing loop

`src/renderer/editors/video/AudioVisualizer.ts:145-147` declares the sizing frame handle and
`sizingGeneration`. Its owner cleanup at `:215-223` cancels that handle and increments the sizing
generation. `onMount()` invokes `scheduleCanvasMeasurement()` at `:265` and starts the separate
animation loop at `:267`.

The sizing loop at `:364-382` cancels an earlier sizing request, retries up to three times while
`canvas.offsetWidth` or `offsetHeight` is zero, and then copies the element dimensions to the canvas
backing store. It is a first-usable-layout wait: once both dimensions are non-zero, the one-shot
backing-store sizing is valid. The continuous draw loop at `:347` and `:355` is a different,
concurrent raw-rAF mechanism. `OwnerScheduler.raf` coalesces per owner and cannot represent both
loops, so **only** `scheduleCanvasMeasurement()` may change.

Because the sizing method is only called from `onMount()` (`:265`), and
`cancelCanvasMeasurement()` is only called by that method (`:365`) and is not used elsewhere, the
hand-rolled `sizingGeneration`, `sizingRafId`, `cancelCanvasMeasurement()`, and their disposer
cleanup can go away after conversion. The animation `rafId`, `animationGeneration`,
`stopAnimation()`, raw `requestAnimationFrame` calls, and `inert` guard must remain.

Before:

```ts
this.cancelCanvasMeasurement();
const generation = ++this.sizingGeneration;
let attempts = 0;
const measure = (): void => {
    if (this.inert || generation !== this.sizingGeneration) return;
    this.sizingRafId = undefined;
    const width = this.canvas.offsetWidth;
    const height = this.canvas.offsetHeight;
    if (width > 0 && height > 0) {
        if (this.canvas.width !== width) this.canvas.width = width;
        if (this.canvas.height !== height) this.canvas.height = height;
        return;
    }
    attempts++;
    if (attempts < 3) this.sizingRafId = requestAnimationFrame(measure);
};
this.sizingRafId = requestAnimationFrame(measure);
```

After (using the approved first-layout primitive):

```ts
this.schedule.firstLayout(this.canvas, () => {
    if (this.inert) return;
    const width = this.canvas.offsetWidth;
    const height = this.canvas.offsetHeight;
    if (width > 0 && height > 0) {
        if (this.canvas.width !== width) this.canvas.width = width;
        if (this.canvas.height !== height) this.canvas.height = height;
    }
});
```

The new primitive's owner disposal replaces the sizing-specific cancellation. It is acceptable for
the new waiter to outlive the old three-frame budget while the owner remains alive, because it is now
waiting for the first actual layout signal rather than guessing three paint opportunities.

### Verified `ImageViewportView` missed-load timer

The report path is correctly `src/renderer/uikit/ImageViewport/ImageViewportView.ts`. The current
timer field is at `:22`; the initial image source assignment is at `:51`, the update assignment is
at `:81`, and `scheduleSourceCheck()` is at `:96-106`. The timer waits 50 ms, checks
`image.complete`, and invokes `onImageLoad()` if the source is still current. `onImageLoad()` reads
natural dimensions and the root's `getBoundingClientRect()` at `:108-114` and `:216-223`.

Verdict: **neither** first nor settled; this is a missed-load race, not a layout waiter, and must not use `firstLayout`. The correct fix is synchronous
`complete` handling at both source-assignment paths, with the initial check performed only after the
image has been appended, its `load` listener installed, and `driver.mount()` completed so
`getContainerBounds()` can see the mounted root. The update path is already mounted and can check
immediately after assigning `src`. Then delete `sourceTimer`, `scheduleSourceCheck()`, and the timer
cleanup in `onDispose()`.

Before:

```ts
this.image.src = this.props.src;
// later: scheduleSourceCheck(this.props.src)

if (this.image) this.image.src = props.src;
this.scheduleSourceCheck(props.src);
```

After:

```ts
// In onMount, after listener installation and driver.mount():
this.image.src = this.props.src;
if (this.image.complete) this.onImageLoad();

// In onUpdate:
if (this.image) {
    this.image.src = props.src;
    if (this.image.complete) this.onImageLoad();
}
```

Do not call `onImageLoad()` before the initial image is appended/mounted: that would calculate the
container bounds while the root is detached. The `load` listener remains the asynchronous path for
images that are not complete at assignment time.

## Implementation Plan

### 1. Use the resolved US-1275 contract

- [ ] Use US-1275's two named methods: `firstLayout` for `RestDetailView`, `MarkdownBodyView`, and
      AudioVisualizer sizing; `settledLayout(..., 200)` for the three US-1275 secondary probes.
- [ ] Implement the Markdown synchronous-completion storage pattern above so the ten-attempt anchor
      retry remains bounded and `isCurrent(model, generation)` remains in force.

### 2. Convert first-layout adopters after US-1275

- [ ] Update `RestDetailView.scheduleMeasurement()` at
      `src/renderer/editors/rest-client/RestClientShared.ts:268-280`; retain the response-height
      guard, owner cleanup handle, `syncLayout()`, and exact `resultMeasureGate.prime([...])` call.
- [ ] Update `MarkdownBodyView.scrollToAnchor()` at
      `src/renderer/editors/markdown/MarkdownBodyView.ts:516-550`; preserve model/generation
      guards, pending-request guard, Promise rejection handling, and the ten-attempt cap.
- [ ] Update only `AudioVisualizerView.scheduleCanvasMeasurement()` at
      `src/renderer/editors/video/AudioVisualizer.ts:364-382`; remove sizing-only fields/generation/
      cancellation and leave the continuous animation loop raw at `:347` and `:355`.

### 3. Refresh the stale `raf` documentation

- [ ] Update the `OwnerScheduler.raf` comment at
      `src/renderer/core/utils/scheduling.ts:162-167`: retain the rule that the owner-wide slot
      cannot express independent concurrent loops, but replace the AudioVisualizer citation because
      US-1276 removes that file's second loop.
- [ ] Do not rewrite history in `doc/epics/EPIC-080.md:316-319`. Record/tell US-1131 that its lint
      candidate points at the same stale AudioVisualizer example and needs a pointer or updated
      example after this conversion.

### 4. Apply the synchronous ImageViewport fix

- [ ] Move the initial `src` assignment to the mounted/listener-ready point if needed, then check
      `image.complete` synchronously after assignment.
- [ ] Check `complete` synchronously after the `onUpdate()` assignment as well.
- [ ] Delete `sourceTimer`, `scheduleSourceCheck()`, the 50 ms `setTimeout`, and its disposal code.
- [ ] Preserve the `load` event listener, `live` behavior, current-source behavior, model
      `handleImageLoad()` call, and visibility reconciliation.

### 5. Verify scope

- [ ] Confirm no raw rAF in the continuous AudioVisualizer draw loop was converted.
- [ ] Do not add tests or a harness. Do not edit `doc/active-work.md`.

## Concerns

- **Resolved dependency:** EPIC-081's abort criterion led to two named methods. The three duplicated
  secondary-view probes use `settledLayout(..., 200)`; these three adopters use `firstLayout`.
- **Markdown is not a pure dimension probe:** the callback queries whether a rendered anchor exists.
  `firstLayout` only signals geometry, including its synchronous already-laid-out path; it does not
  subsume the anchor lookup, bounded retry, or generation checks.
- **Markdown model replacement is not view disposal:** scheduler owner disposal alone cannot cancel
  work when `replaceModel()` swaps models. `isCurrent(model, generation)` remains required.
- **Audio concurrent-loop constraint:** `OwnerScheduler.raf`'s one owner-wide coalescing slot would
  clobber the animation loop if used for both purposes. Only the sizing loop is in scope.
- **Image initial ordering:** the existing initial `src` assignment precedes the `load` listener,
  append, and driver mount. The synchronous check must be placed after those prerequisites, not
  immediately before `root.append()`.
- No unit tests or test harnesses are to be added. `doc/active-work.md` is intentionally unchanged.

## Acceptance Criteria

- [ ] US-1275's two named layout methods are available with independent per-call handles; neither
      uses `OwnerScheduler.raf()`'s owner-wide coalescing slot.
- [ ] `RestDetailView` no longer uses the self-rescheduling zero-height rAF loop, and its
      `resultMeasureGate.prime([this.resultHeight])` behavior is unchanged.
- [ ] `MarkdownBodyView` preserves `isCurrent(model, generation)`, active/model-generation safety,
      pending-request handling, and the ten-attempt bound while using the approved layout signal.
- [ ] Only the AudioVisualizer sizing loop changes; raw continuous draw rAF at
      `src/renderer/editors/video/AudioVisualizer.ts:347` and `:355` remains unchanged.
- [ ] AudioVisualizer sizing no longer has `sizingGeneration`, `sizingRafId`, or
      `cancelCanvasMeasurement()` after the conversion; animation fields remain.
- [ ] `ImageViewportView` handles an already-complete image synchronously at both source
      assignments, retains the asynchronous `load` path, and has no 50 ms timer.
- [ ] No implementation, unit test, test harness, commit, or `doc/active-work.md` edit is included
      in this investigation task.

## Files Changed Summary

| File | Planned change |
|---|---|
| `src/renderer/core/utils/scheduling.ts` | US-1275 provides the two layout methods; US-1276 updates the stale `OwnerScheduler.raf` comment to remove the obsolete AudioVisualizer example while retaining the coalescing rule. |
| `src/renderer/editors/rest-client/RestClientShared.ts` | Replace `scheduleMeasurement()`'s unbounded zero-height rAF retry with `firstLayout`; preserve `resultMeasureGate.prime`. |
| `src/renderer/editors/markdown/MarkdownBodyView.ts` | Replace the retry scheduling with `firstLayout`; preserve generation and ten-attempt guards. |
| `src/renderer/editors/video/AudioVisualizer.ts` | Convert only `scheduleCanvasMeasurement()`; remove sizing-specific cancellation/generation while retaining raw animation rAF. |
| `src/renderer/uikit/ImageViewport/ImageViewportView.ts` | Replace the missed-load timer with synchronous `complete` checks at both source assignments. |
| `src/renderer/uikit/shared/vanilla-view.ts` | **No change**; `schedule` already exists. |
| `src/renderer/core/state/model.ts` | **No change**; not needed by these view adopters. |
| `src/renderer/uikit/ImageViewport/ImageViewportModel.ts` | **No change**; model image-load behavior remains the consumer. |
| `src/renderer/editors/video/AudioPlayer.ts` | **No change**; inspected to verify the visualizer is mounted as a child view. |
| `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.css` | **No change**; inspected only for US-1275's settled-layout evidence. |
| `doc/epics/EPIC-080.md` | **No change**; do not rewrite its history. Tell US-1131 that its lines 316-319 citation of the second AudioVisualizer loop is stale and needs a pointer or updated example. |
| `doc/active-work.md` | **No change** by explicit instruction. |

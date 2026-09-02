# US-1278: One-shot board tab-loaded waiter

Epic: [EPIC-081 — DOM & IO mechanisms](../../epics/EPIC-081.md)

## Goal

Replace `BoardTargetModel.waitForLoaded()`'s 50 ms polling loop with a one-shot waiter resolved
by the existing `BoardEditorModel.loadedTabs.add(tab)` signal, preserving its never-rejecting
timeout contract and ensuring pending waiters are removed on timeout and disposal.

## Background

Verified source at the current checkout (the epic's baseline is commit `d44ab072`):

- `src/renderer/editors/board/BoardEditorModel.ts:140` declares `loadedTabs` as a plain
  `Set<string>`. It is not reactive state, so neither a state subscription nor a layout helper is
  applicable.
- `BoardTargetModel.ts:165-173` currently checks the set immediately, then recursively schedules
  `tick` with `setTimeout(tick, 50)` until the timeout. The comment at `:159-163` explicitly says
  the Promise never rejects because the following CDP command's resolve-and-retry path reports
  genuine failures with a real message; that contract must remain exactly intact.
- `BoardEditorModel.ts:168-180` already contains the correct one-shot registry,
  `frameLoadWaiters`, and resolves/removes matching waiters in `markFrameLoaded()` immediately
  after `loadedTabs.add(tab)`.
- `BoardEditorModel.ts:186-196` removes a waiter when its timeout fires. `dispose()` at
  `:566-585` clears frames and `loadedTabs`, resolves all pending frame-load waiters with
  `false`, empties the registry, and then calls `super.dispose()`.

The existing `waitForFrameLoad(tab, timeoutMs)` is therefore the model-level waiter to reuse;
`waitForLoaded()` can await it and discard its boolean result. `ensureReady()` already checks
`loadedTabs` at `BoardTargetModel.ts:143` before `mountAndWait()`, so the “NEXT load” semantics
are appropriate for the not-yet-loaded path. `switchTab()` at `:121-130` does not make that
check before calling `mountAndWait()`, so `waitForLoaded()` must retain an immediate
`loadedTabs.has(tabId)` fast path for an already-ready secondary tab.

`clearIframe()` at `BoardEditorModel.ts:155-161` deletes a tab's readiness flag when its exact
iframe is removed. It must not resolve a pending waiter as successful: the waiter is waiting for
the next `loadedTabs.add(tab)`, and resolving on deletion would let the following CDP command race
a dead frame. If a replacement frame mounts, `markFrameLoaded()` resolves it; if not, its timeout
or model disposal resolves it without rejection. `dispose()` clears the set and resolves pending
waiters with `false`, so disposal cannot retain the registry.

## Implementation Plan

1. Update `src/renderer/editors/board/BoardTargetModel.ts` only. Keep the existing
   `waitForLoaded()` comment verbatim, including the explanation that it never rejects and why
   cdp-service must surface the real error.

2. Replace the polling body with a synchronous already-loaded fast path and the existing model
   waiter. Before:

   ```ts
   private waitForLoaded(tabId: string, timeoutMs: number): Promise<void> {
       return new Promise((resolve) => {
           const start = performance.now();
           const tick = () => {
               if (this.model.loadedTabs.has(tabId) || performance.now() - start > timeoutMs) resolve();
               else setTimeout(tick, 50);
           };
           tick();
       });
   }
   ```

   After:

   ```ts
   private waitForLoaded(tabId: string, timeoutMs: number): Promise<void> {
       if (this.model.loadedTabs.has(tabId)) return Promise.resolve();
       return this.model.waitForFrameLoad(tabId, timeoutMs).then(() => undefined);
   }
   ```

   This adds no second registry. `waitForFrameLoad()`'s existing `frameLoadWaiters` entry is
   removed when its timeout fires, is filtered and resolved by `markFrameLoaded()` immediately
   after `loadedTabs.add(tab)`, and is resolved/cleared during `BoardEditorModel.dispose()`.

3. **Registration ordering is a mandatory constraint:** in `mountAndWait()`, call
   `waitForLoaded()` and retain its Promise **before** `setSecondaryViewsState()` and
   `setActivePanel()`; `setActivePanel()` can itself mount the frame and cause the next
   `markFrameLoaded()`. Await the retained Promise only after both state changes. Reversing these
   operations can silently miss the signal and stall for the full 5 seconds. Keep the 5,000 ms
   value and the visible UI side effects. The fast path preserves the existing immediate behavior
   when `switchTab()` selects an already-loaded tab.

4. Leave `src/renderer/editors/board/BoardEditorModel.ts` unchanged: its existing waiter is
   sufficient. Verify its `loadedTabs.delete()` and `loadedTabs.clear()` meanings against the
   existing frame teardown and disposal order; do not create a parallel waiter list.

5. Re-check `BoardTargetModel.ts:100` (`tabs` loading projection) and `:143` (`ensureReady` fast
   path). They remain plain `Set.has()` reads and are unaffected by the waiter implementation.

## Concerns

- `waitForFrameLoad()` means the next load and deliberately does not resolve immediately when a
  tab is already in the set. The `waitForLoaded()` fast path is required because `switchTab()` can
  call the wait for an already-loaded tab.
- A waiter must be registered before panel state changes to avoid missing a synchronous or
  same-turn `markFrameLoaded()`. The current Promise must continue to resolve on timeout/disposal,
  never reject, and leave no `frameLoadWaiters` entry behind.
- `loadedTabs.delete(tab)` means the old iframe is no longer attachable; it is not a success or
  failure result for a pending next-load waiter. `loadedTabs.clear()` during disposal invalidates
  all readiness flags, while the following loop resolves every pending waiter with `false`.
- The source currently has an unrelated `waitForFrameLoad()` timer whose callback becomes a no-op
  after success. **NOTE — out of scope:** the resolved waiter's timer and closure therefore remain
  alive until the timeout elapses. This is pre-existing and harmless; do not clear it as part of
  this task or turn the task into a general timer-lifetime refactor.
- No reactive subscription, `firstLayout`, unit tests, or test harness belongs in this task.

## Acceptance Criteria

- [x] `BoardTargetModel.waitForLoaded()` contains no recursive 50 ms polling and no
  `performance.now()` timeout loop.
- [x] Already-loaded tabs still resolve immediately, including the `switchTab()` path.
- [x] Not-yet-loaded tabs use the existing `BoardEditorModel.frameLoadWaiters` registry and are
  registered before panel mounting can trigger `markFrameLoaded()`.
- [x] `BoardEditorModel.markFrameLoaded()` still resolves waiters only after `loadedTabs.add(tab)`;
  timeout removes its waiter, and disposal resolves all pending waiters with `false` and clears the
  registry.
- [x] The never-reject timeout comment and behavior remain intact; a timeout still allows the
  subsequent CDP command to report the genuine failure.
- [x] `loadedTabs.delete()` remains a non-success teardown invalidation, `loadedTabs.clear()`
  remains disposal invalidation, and the reads at `BoardTargetModel.ts:100` and `:143` retain their
  existing semantics.
- [x] No state subscription, layout helper, unit test, or test harness is added; `doc/active-work.md`
  is not edited.

## Files Changed Summary

| File | Planned change | Scope |
|---|---|---|
| `src/renderer/editors/board/BoardTargetModel.ts` | Replace the poll with the existing one-shot waiter, preserve the fast path/timeout contract, and register before mounting. | Implementation |
| `src/renderer/editors/board/BoardEditorModel.ts` | No planned behavior change; verify and reuse its existing registry, add site, timeout cleanup, delete/clear teardown, and disposal. | No change planned |
| `src/renderer/editors/board/BoardWebview.ts` | No change; it already calls `markFrameLoaded()` after CDP registration and `clearIframe()` on teardown. | No change |
| `src/renderer/api/mcp/board-commands.ts` | No change; `board_refresh` already uses the separate next-frame `waitForFrameLoad()` contract. | No change |
| `doc/epics/EPIC-081.md` | No change; correction 2 is authoritative. | No change |
| `doc/active-work.md` | No change per the request; the existing epic dashboard remains user-maintained. | No change |

Files that need **no changes** in US-1278:

- `src/renderer/core/state/` and any reactive state module — `loadedTabs` is a plain `Set<string>`.
- `src/renderer/uikit/` and `OwnerScheduler` — this is remote-frame readiness, not layout work.
- `src/renderer/api/mcp/board-commands.ts` — its explicit refresh waiter is already correct and
  must retain its `NEXT` frame-load meaning.
- Tests and test harnesses — none are added under the project rules.

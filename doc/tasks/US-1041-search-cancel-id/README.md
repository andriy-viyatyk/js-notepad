# US-1041 — SearchChannel.cancel needs a search id

**Status:** Implemented 2026-08-29 — awaiting batched review · **Epic:** none

## Goal

Let a disposed `FileSearch` view cancel its own worker without cancelling another view's
search.

## Background

The main process cancels **per window** (`event.sender.id`). Two `FileSearch` views in the same
window therefore share a cancel scope: a disposed view calling cancel would abort a search
another live view is still waiting on.

## Scope correction (2026-08-29) — one acceptance criterion was unachievable

The document asked for two things. The first is real and is what this task does. The second
**cannot be delivered by adding a search id to cancel**, and would have sent an implementer
looking for a bug that is not in the cancel path:

> ~~A second concurrent search in the same window is unaffected.~~

**Concurrency is prevented at the `start` path, not the cancel path.** `activeSearches` is a
`Map<senderId, …>` — one entry per *window* — and `handleStart` calls `terminateSearch(senderId)`
before every new search, under the comment *"Only one search per window — replace whatever was
running"* (`main/search-service.ts:81-88`). So when view B starts a search, view A's search is
already dead, regardless of anything cancel does. Two concurrent searches in one window are not
supported today by design, and making them work is a different, larger task: `activeSearches`
would have to key on `searchId`, with N workers per window and a reworked `destroyed` handler.

**What this task actually delivers**, which is what its Goal states: a disposed view can cancel
**its own** search safely. Today `dispose()` deliberately does **not** cancel
(`FileSearchModel.ts:372-380`) and lets the worker run to completion, precisely because an
un-scoped cancel would kill whatever that window is running. Scoping the cancel by id lets
`dispose()` cancel again, so an abandoned search stops burning CPU and IO instead of walking a
tree nobody is watching.

## Background — the contract is already half-built

`SearchRequest` **already carries `searchId`** (`ipc/search-ipc.ts:24-25`), and the start handler
already destructures it (`search-service.ts:84`). Every streamed message back — result, progress,
complete, error — carries it too. **Only the cancel message lacks it**, which is why this is a
small change rather than a protocol redesign.

## Implementation plan

1. **`src/ipc/search-ipc.ts`** — add a `SearchCancel` interface (`{ searchId: string }`) beside
   `SearchRequest`, so the cancel message is typed like every other message on this channel.
2. **`src/main/search-service.ts`** — store the running search's `searchId` in the
   `activeSearches` entry, and change the cancel handler
   (`:164-166`) to terminate **only if the running entry's id matches** the one in the message.
   A non-matching id is a no-op, not an error: it means the search the caller is cancelling was
   already replaced or finished. Leave `terminateSearch(senderId)` unchanged for the `start`
   replacement path and the `destroyed` handler — both are correctly per-window.
3. **`src/renderer/components/file-search/FileSearchModel.ts`** —
   - `cancelSearch` sends `{ searchId: this.currentSearchId }`.
   - `dispose()` now cancels its own search before going inert. **Order matters:** capture the id
     first, because `cancelSearch` early-returns on `this.disposed` and the existing code sets
     `disposed = true` and nulls `currentSearchId` before anything else. Send the cancel directly
     rather than routing through `cancelSearch`, and keep the state update out of it — a disposed
     model must not touch its state.
   - Replace the long "deliberately NOT calling cancelSearch" comment with a short note saying the
     cancel is now id-scoped, and drop the US-1041 reference.

## Concerns

- **A stale spinner is a separate, pre-existing bug, out of scope.** When view B's search replaces
  view A's, A receives no `complete` and its `isSearching` stays true. That is a consequence of
  the one-search-per-window design and exists today; this task neither causes nor fixes it. Noted
  so a reviewer does not mistake it for fallout.
- Do not change the one-search-per-window design as a side effect. If concurrent searches are
  wanted, that is a deliberate decision with worker-count implications, taken separately.

## Acceptance criteria

- The cancel message carries a `searchId` and the main process terminates only on a match.
- A cancel bearing a stale or unknown id is a silent no-op.
- `FileSearchModel.dispose()` cancels its own running search, and a search belonging to another
  view in the same window is **not** terminated by it.
- The `start` replacement path and the `destroyed` cleanup keep their existing per-window
  behaviour.
- `typecheck`, `lint`, `build-prod` clean.

## Implementation record (2026-08-29)

**Shipped** across the three planned files. The contract turned out to be even more half-built
than the plan said: `activeSearches` **already stored `searchId`** on its entry
(`search-service.ts:29`), so the main process needed no new state — only a comparison.

`dispose()` captures the id, marks itself disposed, clears the field, then sends the cancel
directly, with no state update. Two guards were added at review: the main-process handler takes
`SearchCancel | undefined` and optional-chains `cancel?.searchId`, because a malformed message
must not throw in the **main** process; and the replacement comments state the invariant that
makes disposal safe, rather than only that it is safe.

**Runtime evidence, and it took four attempts to make the test valid.** The first three runs
reported success while proving nothing: the search completed *before* the cancel was sent, so
every assertion was vacuous. A warm OS file cache made it worse on each retry — the same search
went from 2.5s to under 400ms. Only when the probe asserted **"was the search still live at the
moment of cancel?"** did the results mean anything. Final run, both cases live at cancel:

| case | after cancel | completed? |
|---|---|---|
| stale id | kept streaming, 0 -> 4 messages | yes — ran to completion |
| own id | **0 further messages** | no — worker terminated |

*Instrument note worth keeping: a timing-dependent probe must assert that the condition under
test was still true when the stimulus was applied. Without that check, "nothing bad happened"
and "nothing happened at all" are indistinguishable — and both read as a pass.*

**Not fixed, pre-existing:** when one view's search replaces another's, the losing view never
receives `complete` and its `isSearching` stays true. That follows from the one-search-per-window
design, exists today, and is out of scope here.

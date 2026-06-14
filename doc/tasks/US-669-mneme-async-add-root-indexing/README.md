# US-669 — Mneme: async add-root + background indexing with per-root progress

**Epic:** [EPIC-032 — Mneme (vector memory)](../../epics/EPIC-032.md) · Phase 5 (Mneme, Rust)
**Status:** Planned — **description only, not yet investigated** (investigation deferred per request)

> This is a description-only placeholder. The implementation plan, concerns, and
> acceptance criteria will be filled in during a later investigation pass.

## Problem

`wiki_add_root` (and other reconcile-triggering tools) currently run a **blocking,
synchronous reconcile** — the MCP call doesn't return until the whole root has been
walked and indexed. For a real wiki this is fatal:

- Adding `D:\projects\EverGreen\wiki` showed progress for ~1 minute and then failed
  with `MCP error -32001: Request timed out` — the synchronous index outran the MCP
  request timeout.
- A wiki can hold **thousands of documents**; full indexing can take minutes. It
  **cannot** be synchronous.

## Desired behaviour

1. **Add returns immediately.** `wiki_add_root` registers the root and returns right
   away (root appears in `wiki_list_roots` / `wiki_status` immediately, even with an
   empty/partial index).
2. **Indexing runs in the background.** A background job indexes the new root after
   it's registered — without blocking the MCP call or other operations. (EPIC-032
   decision **D17** already specifies a dedicated embedding worker + cancellable
   background reindex job; US-659 built the reindex job machinery. This task makes
   **add-root** use it instead of blocking, and likely applies the same to any other
   currently-synchronous reconcile path.)
3. **Per-root progress is observable.** The Persephone config editor (US-664) must be
   able to show live indexing **status/progress per configured root** — phase
   (scanning / embedding / done), processed/total counts — for the background job,
   not just for a user-triggered `wiki_reindex`. `wiki_status.roots[].reindex`
   (`{ phase, processed, total }`) already exists; this task ensures it reflects the
   **background** add-root/initial-index job and that the editor surfaces it.

## Why

The whole point of Mneme is a large personal/work knowledge base. Synchronous indexing
makes adding any non-trivial root impossible (timeout) and freezes the control plane.
Background indexing + visible per-root progress is required for Mneme to be usable at
real scale.

## Additional improvement — default Mneme log file

Mneme currently logs to stdout/stderr, which Persephone's main process captures and
prints as `[Mneme] …` console lines. **Nobody sees these in practice:** in a packaged
build there's no console, and in dev they're buried in the `npm start` terminal. There
is no log file. When Mneme misbehaves (e.g. the disconnect during the failed add-root),
there is nothing to inspect after the fact.

**Desired:** Mneme writes its own **default log file** for troubleshooting.

- A fixed path under the Persephone data dir, alongside the existing config/model cache
  — e.g. `<userData>/data/mneme/mneme.log` (Mneme already receives `--config
  <userData>/data/mneme/mneme.toml`, so it knows this directory; alternatively
  Persephone passes an explicit `--log <path>` flag).
- **Truncated/rewritten on each Mneme start** (a single current-session log, not a
  growing/rolling archive) — keep it simple; latest run only.
- Mneme already uses `tracing`; this is most likely a `tracing` file layer (a
  truncating file writer) added next to the existing stdout layer, so the same events
  go to both. Confirm log level / filter during investigation (info by default).
- Keep stdout logging too (the main-process `[Mneme]` capture stays as-is).

This is small and independent of the async-indexing work, but bundled here at request —
it directly aids diagnosing issues like the synchronous-add-root disconnect.

## Scope notes (to confirm during investigation)

- Primarily a **Mneme (Rust)** change: make `wiki_add_root` enqueue a background
  reconcile rather than running it inline; ensure status reflects it; consider whether
  `wiki_reindex` should also gain an async/non-blocking mode.
- Persephone (US-664 editor) side: poll/subscribe to `wiki_status` so the per-root
  progress bar reflects the background job (the editor already renders
  `reindexProgress` from `wiki_status`; verify it picks up background jobs, not only
  jobs it started itself).
- Open question: how the editor learns about progress without holding the MCP call —
  periodic `wiki_status` poll vs. a progress/notification channel vs. a resource
  subscription (US-661).
- Relationship to US-664: US-664 ships against the current synchronous behaviour;
  US-669 upgrades the indexing model underneath and the editor's progress display.

## Acceptance criteria

_TBD — to be defined during investigation._

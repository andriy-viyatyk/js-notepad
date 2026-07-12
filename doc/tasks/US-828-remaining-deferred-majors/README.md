# US-828: Remaining deferred majors (`@electron/fuses`, `csv-parse`, `picomatch`)

**Epic:** [EPIC-040 — Dependency & Platform Updates](../../epics/EPIC-040.md)
**Status:** Planned / Deferred (placeholder — detailed plan pending)

> Placeholder. A full task doc (Goal → Background → Implementation plan → Concerns →
> Acceptance criteria) will be written following the CLAUDE.md "create a task" flow when this
> task is picked up. See [EPIC-040](../../epics/EPIC-040.md) for the upgrade inventory and rationale.

## Scope

Low-traffic libraries with breaking-change majors — batch or split at pickup:

- `@electron/fuses` 1.8.0 → 2.x — used in `forge.config.ts` (`FusesPlugin`). Verify fuses still
  flip on the packaged binary. (May get pulled forward earlier if a future Electron bump needs it.)
- `csv-parse` 6.1.0 → 7.x — used by the CSV grid editor / content parsing.
- `picomatch` 2.3.1 → 4.x — used for glob matching (file search / ignore patterns).

## Risk / notes

- Each has a breaking major but a small footprint. Verify the specific consumer of each after
  bumping.
- Re-audit at pickup — some of these may already have been carried along by other updates.

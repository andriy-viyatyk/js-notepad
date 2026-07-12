# US-827: Upgrade Vite (5 → 8)

**Epic:** [EPIC-040 — Dependency & Platform Updates](../../epics/EPIC-040.md)
**Status:** Planned / Deferred (placeholder — detailed plan pending)

> Placeholder. A full task doc (Goal → Background → Implementation plan → Concerns →
> Acceptance criteria) will be written following the CLAUDE.md "create a task" flow when this
> task is picked up. See [EPIC-040](../../epics/EPIC-040.md) for the upgrade inventory and rationale.

## Scope

Bump `vite` 5.4.21 → 8.x and align `vite-plugin-monaco-editor`.

## Risk / notes

- **Deferred / large.** Vite is the whole build system (dev HMR + prod bundling for main,
  preload, board-shim, renderer).
- **Gated by `@electron-forge/plugin-vite`** — Forge must officially support the target Vite
  major, or `npm start` and Forge packaging break. Check Forge's supported Vite range before
  starting; may require a coordinated Forge bump.
- Touches: `forge.config.ts`, `scripts/build-prod.mjs`, and all `vite.*.config.ts` files.
- Acceptance: `npm start` (HMR) and `npm run dist` (prod bundle) both work; output structure
  under `.vite/` unchanged.

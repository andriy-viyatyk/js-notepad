# US-826: Upgrade TypeScript (5.9 → 7.0)

**Epic:** [EPIC-040 — Dependency & Platform Updates](../../epics/EPIC-040.md)
**Status:** Planned / Deferred (placeholder — detailed plan pending)

> Placeholder. A full task doc (Goal → Background → Implementation plan → Concerns →
> Acceptance criteria) will be written following the CLAUDE.md "create a task" flow when this
> task is picked up. See [EPIC-040](../../epics/EPIC-040.md) for the upgrade inventory and rationale.

## Scope

Bump `typescript` 5.9.3 → 7.0.x (the Go-based "TypeScript 7" compiler).

## Risk / notes

- **Deferred / large.** Major compiler rewrite; verify the whole codebase still typechecks
  (`npm run typecheck`) and that Vite/Sucrase transpilation and Monaco's TS worker are unaffected.
- **Gated by the ESLint toolchain** — `@typescript-eslint/parser` must support the TS 7 version
  in use, so this generally lands **after** US-825.
- Confirm editor-side TS features (the scripting transpile path in
  `src/renderer/scripting/transpile.ts` and Monaco IntelliSense) still work.

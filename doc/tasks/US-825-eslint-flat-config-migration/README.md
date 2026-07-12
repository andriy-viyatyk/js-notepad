# US-825: ESLint flat-config migration (dev toolchain)

**Epic:** [EPIC-040 — Dependency & Platform Updates](../../epics/EPIC-040.md)
**Status:** Planned (placeholder — detailed plan pending)

> Placeholder. A full task doc (Goal → Background → Implementation plan → Concerns →
> Acceptance criteria) will be written following the CLAUDE.md "create a task" flow when this
> task is picked up. See [EPIC-040](../../epics/EPIC-040.md) for the upgrade inventory and rationale.

## Scope

Move the whole ESLint toolchain up together (they are interdependent — do not split):

- `eslint` 8.57.1 → 10.x
- `@typescript-eslint/eslint-plugin` + `@typescript-eslint/parser` 5.62.0 → 8.x
- `eslint-plugin-react-hooks` 4.6.2 → 7.x
- `eslint-import-resolver-typescript` 3.10.1 → 4.x
- `eslint-plugin-import` (verify compatibility)

## Risk / notes

- **Dev-only** — no runtime/bundle impact. Zero user-facing risk.
- ESLint 9+ requires the **flat config** (`eslint.config.js`) — the legacy `.eslintrc` +
  `--ext` CLI flags in the `lint` script (`package.json`) are removed/changed. This is a config
  rewrite, not just a version bump.
- Acceptance: `npm run lint` runs under flat config and the ruleset is equivalent (no newly
  silenced or newly noisy rules without intent).

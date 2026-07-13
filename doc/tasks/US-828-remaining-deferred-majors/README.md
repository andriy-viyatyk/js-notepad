# US-828: Remaining deferred majors (`csv-parse`, `picomatch`)

**Epic:** [EPIC-040 — Dependency & Platform Updates](../../epics/EPIC-040.md)
**Status:** Active — investigated 2026-07-13; ready to implement

## Goal

Clear the last two deferred dependency majors in EPIC-040 by bumping `csv-parse` 6 → 7 and
`picomatch` 2 → 4, each verified against its single consumer. This drains the epic's "deferred"
row down to nothing but the optional fuses-hardening follow-up.

## Background

### `@electron/fuses` is out of scope (no longer a dependency)

The original placeholder listed `@electron/fuses` 1 → 2. US-827 removed Electron Forge and the
direct `@electron/fuses` dependency with it. It now appears **only transitively**, owned by
`electron-builder`:

```
persephone@4.0.14
`-- electron-builder@26.15.3
  `-- app-builder-lib@26.15.3
    `-- @electron/fuses@1.8.0
```

There is nothing for us to bump — electron-builder pins its own copy. Re-introducing fuses as an
electron-builder `afterPack` hook is an **optional security-hardening follow-up**, not a version
bump, and is tracked separately (see Concerns). It is intentionally **excluded** from this task.

### `csv-parse` 6.1.0 → 7.0.1

- **Sole consumer:** `src/renderer/core/utils/csv-utils.ts` — imports
  `parse` from `csv-parse/browser/esm/sync` and calls it with
  `{ columns, skip_empty_lines, relax_column_count, relax_quotes, delimiter }`.
- **Verified against the v7.0.1 tarball:**
  - `./browser/esm/sync` subpath export still exists (`{types, default}`).
  - Our exact option set produces identical output: `columns:false` → `string[][]`,
    `columns:true` → `Record<string,string>[]`. The overloaded return types in `csv-utils.ts`
    still hold — no signature change needed.
- `csv-stringify` (also used in `csv-utils.ts`) stays on 6.x — out of scope, unaffected.

### `picomatch` 2.3.1 → 4.0.5

- **Consumers:**
  - `src/main/search-service.ts` — `picomatch(pattern, { dot: true })` → matcher, used for
    file-search include/exclude globs.
  - `src/main/vite-env.d.ts` — a hand-written `declare module "picomatch"` (picomatch ships no
    bundled `.d.ts`); signature `(glob: string | string[], options?: { dot?: boolean }) => (input: string) => boolean`.
- **Verified against the 4.0.5 build already in the tree:**
  - The `picomatch(glob, { dot })` → matcher API is unchanged across 2 → 4.
  - All patterns we actually feed match identically: `*.ts`, `src/**`, `**/*.tsx`, `dist/**`,
    `.gitignore` (with `dot:true`), `node_modules`, `*.{ts,tsx}`.
  - The hand-written type declaration in `vite-env.d.ts` still matches the real API — no change
    needed.
  - `engines` is `node >=12` (we run Node 24). No `exports` field — CJS `main`, resolves as today.
- **Dedupe bonus:** Vite 8 / tinyglobby already pull `picomatch@4.0.5` transitively. Bumping our
  direct dep to `^4` collapses the tree onto the single 4.0.5 copy instead of keeping a stale 2.3.1
  alongside it.

## Implementation plan

1. **`package.json`** — bump two `dependencies`:
   - `"csv-parse": "^6.1.0"` → `"^7.0.1"`
   - `"picomatch": "^2.3.1"` → `"^4.0.5"`
2. **Install** — `npm install` to update `package-lock.json`. Confirm the lock resolves
   `csv-parse@7.x` and dedupes `picomatch` onto a single `4.0.5`.
3. **No source changes expected.** `csv-utils.ts`, `search-service.ts`, and the `picomatch`
   type declaration in `vite-env.d.ts` were all verified compatible as-is. If `tsc` surfaces a
   type mismatch, adjust only the affected declaration.
4. **Verify** (see Acceptance criteria).

## Concerns / open questions

- **Fuses hardening (decision needed):** `@electron/fuses` is no longer ours to bump. Whether to
  add an electron-builder `afterPack` hook that flips the security fuses on the packaged binary is
  a separate hardening effort. Recommendation: **keep it out of US-828** and track it as its own
  optional task under EPIC-040, so this task stays a clean "dependency currency" bump. (User to
  confirm.)
- **Risk:** Low. Both bumps are behavior-verified against our exact call sites. The only runtime
  surfaces touched are the CSV grid editor (parse) and file-search glob matching.

## Acceptance criteria

- [x] `package.json` shows `csv-parse@^7` and `picomatch@^4`; `package-lock.json` updated
  (resolved `csv-parse@7.0.1`, direct `picomatch@4.0.5`).
- [x] `npm ls picomatch` shows the tree deduped onto our direct 4.0.5 (Vite/tinyglobby dedupe onto
  it; the remaining `2.3.2` copies are dev-tooling transitives — `sass`/`chokidar`/`micromatch` —
  not our direct dep).
- [x] `npm run typecheck` green.
- [x] `npm run lint` green.
- [x] `npm run build-prod` green.
- [ ] Smoke (user): open a CSV/TSV file in the grid editor → parses correctly (both raw and
  with-header modes); Excel copy-paste round-trips.
- [ ] Smoke (user): file-search with include (`*.ts`, `src/**`) and exclude (`node_modules`,
  `dist/**`) patterns returns the expected files.

## Files changed

| File | Change |
|------|--------|
| `package.json` | Bump `csv-parse` → `^7.0.1`, `picomatch` → `^4.0.5`. |
| `package-lock.json` | Regenerated by `npm install`. |
| _(source)_ | None expected — consumers verified compatible. |

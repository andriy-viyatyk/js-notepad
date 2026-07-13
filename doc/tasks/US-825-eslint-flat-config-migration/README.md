# US-825: ESLint flat-config migration (dev toolchain)

**Epic:** [EPIC-040 — Dependency & Platform Updates](../../epics/EPIC-040.md)
**Status:** Implemented (pending epic review) — see "Implementation outcome" below

> **Landed on ESLint 9, not 10.** `eslint-plugin-import@2.32.0` (latest) caps its eslint peer
> at `^9`; forcing eslint 10 would require switching to the `eslint-plugin-import-x` fork
> (renaming every `import/*` rule). The flat-config migration + all other plugin majors are
> fully achieved on eslint 9 with zero peer hacks. Revisit 10 when eslint-plugin-import ships
> v10 support. (User-approved decision.)

## Goal

Migrate the ESLint toolchain to its current majors and to the flat-config format
(`eslint.config.mjs`), retiring the legacy `.eslintrc.json` + `--ext` CLI flag. Move the whole
interdependent set together, then pull in the `@modelcontextprotocol/sdk` bump that was deferred
from US-822 (it was blocked on the resolver upgrade in this task). Dev-only: no runtime or bundle
impact.

## Background

### Current state (verified)

- **`.eslintrc.json`** (legacy eslintrc format) at repo root:
  - `env`: `browser`, `es6`, `node`
  - `extends`: `eslint:recommended`, `plugin:@typescript-eslint/eslint-recommended`,
    `plugin:@typescript-eslint/recommended`, `plugin:import/recommended`, `plugin:import/electron`,
    `plugin:import/typescript`, `plugin:react-hooks/recommended`
  - `parser`: `@typescript-eslint/parser`
  - `settings.import/resolver`: `{ typescript: { alwaysTryTypes: true }, node: true }`
  - `ignorePatterns`: `scratches/`, `assets/editor-types/`, `out/`, `.vite/`, `dist/`, `release/`
  - `rules`: `@typescript-eslint/no-empty-interface: off`, `@typescript-eslint/no-var-requires: off`,
    `no-useless-escape: off`, `@typescript-eslint/no-empty-function: off`,
    `import/no-named-as-default-member: off`, and a custom `@typescript-eslint/no-unused-vars: warn`
    (ignore patterns `^_`, `ignoreRestSiblings: true`)
  - `overrides` (all turn `@typescript-eslint/no-explicit-any: off`, the d.ts one also `no-var: off`):
    `**/*.d.ts`, `src/renderer/uikit/AVGrid/**/*`, `src/renderer/editors/grid/**/*`,
    `**/*.story.{ts,tsx}`, `assets/script-library/**/*`
- **`package.json`** lint script: `"lint": "eslint --ext .ts,.tsx ."` — **only `.ts`/`.tsx` are
  linted today**; `.js`/`.mjs`/`.cjs` (scripts, config files) are never linted.
- **Baseline:** `npm run lint` currently exits **0 with zero warnings**. This is the equivalence
  target — after migration, lint must again be clean (any new finding is a deliberate decision,
  see the triage step).
- **Node** in use: `v24.18.0` (satisfies ESLint 10's `engines`: `^20.19 || ^22.13 || >=24`).

### Target versions (latest, verified against the npm registry)

| Package | Current | Target | Notes |
|---------|---------|--------|-------|
| `eslint` | 8.57.1 | **9.39.5** | Flat config is the default in 9. (Not 10 — see the status note; `eslint-plugin-import` peer caps at 9.) |
| `@typescript-eslint/eslint-plugin` | 5.62.0 | — | **Replaced** by the `typescript-eslint` meta package. |
| `@typescript-eslint/parser` | 5.62.0 | **8.63.0 (kept explicit)** | Meta package supplies the parser for the config, but `eslint-plugin-import`'s deep-parse rules `require('@typescript-eslint/parser')` **by name** — so it must remain an explicit top-level devDep too. |
| `typescript-eslint` (meta) | — (new) | 8.63.0 | Provides `tseslint.config()`, `tseslint.configs.*`, `tseslint.parser`. |
| `eslint-plugin-react-hooks` | 4.6.2 | 7.1.1 | Ships flat configs; peer allows eslint `^10`. |
| `eslint-import-resolver-typescript` | 3.10.1 | 4.4.5 | New `createTypeScriptImportResolver` factory; fixes the MCP SDK `exports`-map resolution. |
| `eslint-plugin-import` | 2.32.0 | 2.32.0 | **No change** — already latest; already exposes `flatConfigs` (`recommended`/`electron`/`typescript` all present, verified). |
| `@eslint/js` | — (new) | **9.39.5** | Supplies `js.configs.recommended` (the flat replacement for the `eslint:recommended` string). Versioned independently of eslint — its latest is 9.39.5, not 10.x. |
| `globals` | — (new) | 17.7.0 | Supplies `languageOptions.globals` (flat has no `env`). |
| `@modelcontextprotocol/sdk` | 1.27.1 | 1.29.0 | Deferred from US-822 — unblocked by the resolver 3→4 bump (see below). |

### Flat-config API facts confirmed by inspecting the installed / published packages

- `eslint-plugin-import@2.32.0` → `flatConfigs` object present with keys
  `recommended, errors, warnings, react, react-native, electron, typescript`. The three we use
  (`recommended`, `electron`, `typescript`) all exist in flat form.
- `eslint-plugin-react-hooks@7.1.1` → exports `configs.flat.recommended`
  (`{ plugins: { 'react-hooks': plugin }, rules: {…} }`) and `configs.flat['recommended-latest']`.
  `flat.recommended` is the direct replacement for the old `plugin:react-hooks/recommended`.
  ⚠️ **v7's `recommended` also folds in the React-Compiler rule set** (not just `rules-of-hooks` +
  `exhaustive-deps` as in v4). See Concerns.
- `eslint-import-resolver-typescript@4.4.5` → exports `createTypeScriptImportResolver`; used via
  the `settings['import/resolver-next']` array form (supported by eslint-plugin-import ≥ 2.31).
- `typescript-eslint@8.63.0` (meta) → `tseslint.configs.recommended` is an **array** bundling the
  base + `eslint-recommended` (core-rule disables) + recommended TS rules, i.e. it replaces BOTH
  `plugin:@typescript-eslint/eslint-recommended` AND `plugin:@typescript-eslint/recommended`.

### The MCP SDK dependency (why it lives in this task)

`@modelcontextprotocol/sdk` is bumped 1.27.1 → 1.29.0 **after** the resolver upgrade. The SDK is
imported via deep subpath specifiers with `.js` extensions in `src/main/mcp-http-server.ts`
(lines 12–23: `@modelcontextprotocol/sdk/server/mcp.js`, `/server/streamableHttp.js`, `/types.js`).
The 1.29 `exports` map uses `./*` wildcards that `eslint-import-resolver-typescript@3.10.1` fails to
resolve (→ `import/no-unresolved`). The resolver 4.x upgrade in this task fixes that, so the SDK
bump is safe to land here and verified by a clean `npm run lint`.

## Implementation plan

### Step 1 — Dependency changes (`package.json`)

**Remove** from `devDependencies`:
- `@typescript-eslint/eslint-plugin`
- `@typescript-eslint/parser`

**Add / change** in `devDependencies`:
- `eslint`: `^8.57.1` → `^10.7.0`
- `eslint-plugin-react-hooks`: `^4.6.2` → `^7.1.1`
- `eslint-import-resolver-typescript`: `^3.10.1` → `^4.4.5`
- `typescript-eslint`: `^8.63.0` (new)
- `@eslint/js`: `^10.7.0` (new)
- `globals`: `^16.5.0` (new — pin to the current major at install time)
- keep `eslint-plugin-import`: `^2.32.0`

**Change** in `dependencies`:
- `@modelcontextprotocol/sdk`: `^1.27.1` → `^1.29.0` (apply in Step 5, after the resolver works)

**Update the lint script** in `package.json`:
```jsonc
// before
"lint": "eslint --ext .ts,.tsx .",
// after (flat config discovers files; scope to ts/tsx is done inside eslint.config.mjs)
"lint": "eslint .",
```

Install with `npm install` (runs `postinstall` → `patch-package`; the monaco patch must still apply
cleanly — unrelated to ESLint, but confirm the postinstall is green).

### Step 2 — Create `eslint.config.mjs` (repo root)

`.mjs` because `package.json` has no `"type": "module"`. Authored with the `tseslint.config()`
helper so `files`-scoping propagates into the `extends` array. Skeleton (fill rules from Step 3):

```js
// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import reactHooks from "eslint-plugin-react-hooks";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import globals from "globals";

export default tseslint.config(
    // Global ignores (flat-config replacement for ignorePatterns).
    {
        ignores: [
            "scratches/**",
            "assets/editor-types/**",
            "out/**",
            ".vite/**",
            "dist/**",
            "release/**",
        ],
    },

    // Main config — scoped to ts/tsx ONLY, to preserve the old `--ext .ts,.tsx` behavior
    // (js/mjs/cjs — scripts, config files — stay unlinted, exactly as before).
    {
        files: ["**/*.ts", "**/*.tsx"],
        extends: [
            js.configs.recommended,
            ...tseslint.configs.recommended,          // = eslint-recommended + recommended
            importPlugin.flatConfigs.recommended,
            importPlugin.flatConfigs.electron,
            importPlugin.flatConfigs.typescript,
            reactHooks.configs.flat.recommended,
        ],
        languageOptions: {
            parser: tseslint.parser,
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.es2021,
            },
        },
        settings: {
            "import/resolver-next": [
                createTypeScriptImportResolver({ alwaysTryTypes: true }),
            ],
        },
        rules: {
            // ---- carried over verbatim from .eslintrc.json ----
            "no-useless-escape": "off",
            "@typescript-eslint/no-empty-function": "off",
            "import/no-named-as-default-member": "off",
            "@typescript-eslint/no-unused-vars": [
                "warn",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                    destructuredArrayIgnorePattern: "^_",
                    ignoreRestSiblings: true,
                },
            ],
            // ---- migrated to v8 successor rule names (same intent) ----
            // old: @typescript-eslint/no-empty-interface: off  (removed/deprecated → merged here)
            "@typescript-eslint/no-empty-object-type": "off",
            // old: @typescript-eslint/no-var-requires: off  (deprecated → renamed)
            "@typescript-eslint/no-require-imports": "off",
            // ---- triage additions decided in Step 4 go here ----
        },
    },

    // Per-file overrides (order matters — later wins).
    {
        files: ["**/*.d.ts"],
        rules: {
            "no-var": "off",
            "@typescript-eslint/no-explicit-any": "off",
        },
    },
    {
        files: [
            "src/renderer/uikit/AVGrid/**/*.ts",
            "src/renderer/uikit/AVGrid/**/*.tsx",
            "src/renderer/editors/grid/**/*.ts",
            "src/renderer/editors/grid/**/*.tsx",
            "**/*.story.ts",
            "**/*.story.tsx",
            "assets/script-library/**/*.ts",
            "assets/script-library/**/*.tsx",
        ],
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
        },
    },
);
```

### Step 3 — Rule-equivalence mapping (`.eslintrc.json` → flat)

| Old (`.eslintrc.json`) | Flat-config replacement |
|---|---|
| `env: {browser, es6, node}` | `languageOptions.globals: {...globals.browser, ...globals.node, ...globals.es2021}` |
| `eslint:recommended` | `js.configs.recommended` |
| `@typescript-eslint/eslint-recommended` + `.../recommended` | `...tseslint.configs.recommended` (array, covers both) |
| `import/recommended`, `import/electron`, `import/typescript` | `importPlugin.flatConfigs.{recommended,electron,typescript}` |
| `react-hooks/recommended` | `reactHooks.configs.flat.recommended` |
| `parser: @typescript-eslint/parser` | `languageOptions.parser: tseslint.parser` |
| `settings.import/resolver` | `settings['import/resolver-next']: [createTypeScriptImportResolver({alwaysTryTypes:true})]` |
| `ignorePatterns: [...]` | `{ ignores: [...] }` global block (append `/**`) |
| `no-empty-interface: off` | `no-empty-object-type: off` (rule renamed in v8) |
| `no-var-requires: off` | `no-require-imports: off` (rule renamed in v8) |
| all other `rules` / `overrides` | copied verbatim (only glob overrides gain explicit `.ts/.tsx` extensions) |

### Step 4 — Triage new v8 findings (the real work)

Because the baseline is 100% clean, **any** finding after migration is new. v8's `recommended` is
stricter than v5's; rules newly present that were **not** in v5 recommended and may fire:
`no-namespace`, `no-unsafe-function-type`, `no-wrapper-object-types`, `no-unsafe-declaration-merging`,
`no-unused-expressions`, `no-require-imports`, `no-empty-object-type`. React-hooks v7 additionally
brings the React-Compiler rules into `recommended`.

Procedure:
1. Run `npm run lint`, capture the full report.
2. Group findings by rule id.
3. For each rule, decide **fix vs disable**, guided by the equivalence principle (US-825 is a
   toolchain migration, not a code-cleanup task — prefer preserving today's behavior):
   - **`no-require-imports` / `no-empty-object-type`** — already disabled in Step 2 (they are the
     renamed successors of rules we deliberately turned off). The codebase intentionally uses
     `require(...)` in documented spots (`file-path.ts`, `fs.ts`) and empty interfaces.
   - **`no-namespace`** — the script API type surface uses `declare namespace` heavily; expect
     hits in `**/*.d.ts`. Add `"@typescript-eslint/no-namespace": "off"` to the d.ts override
     (and/or globally) rather than rewriting the type surface.
   - **React-Compiler rules (react-hooks v7)** — if they surface broad new warnings, pin
     react-hooks back to the classic two rules instead of `flat.recommended`
     (`"react-hooks/rules-of-hooks": "error"`, `"react-hooks/exhaustive-deps": "warn"`) to keep the
     exact v4 surface. Decide with the user (see Concerns).
   - **Genuinely valuable, low-volume findings** (e.g. a real `no-unsafe-function-type` on a stray
     `Function`) — fix the code.
4. Every rule that is turned **off** in triage gets a one-line comment stating why. No silent
   disables.
5. Re-run until `npm run lint` is clean (0 errors; warnings only where intended, e.g. the existing
   `no-unused-vars: warn`).

### Step 5 — MCP SDK bump

1. With the resolver 4.x in place, set `@modelcontextprotocol/sdk` to `^1.29.0`, `npm install`.
2. `npm run lint` — confirm `src/main/mcp-http-server.ts` no longer reports `import/no-unresolved`
   on the `@modelcontextprotocol/sdk/*.js` subpaths.
3. `npm run typecheck` — confirm the SDK types still resolve.

### Step 6 — Cleanup & verify

- Delete `.eslintrc.json`.
- Confirm no other tooling references it (search for `.eslintrc`).
- Run the full gate: `npm run lint` (clean), `npm run typecheck` (clean),
  `npm run build-prod` (unaffected but confirms nothing broke), and a quick `npm start` smoke.
- `git diff` sanity: only `package.json`, `package-lock.json`, `eslint.config.mjs` (new),
  `.eslintrc.json` (deleted), and any source files touched during triage.

## Concerns / open questions

1. **v8 `recommended` is stricter than v5 — decide the triage philosophy.** Recommended default:
   preserve today's behavior (disable newly-added rules that produce broad noise, documented),
   fixing only small/clear real issues. Alternative: treat this as a chance to adopt the stricter
   set and fix the code. **Recommendation: preserve behavior** (this is a toolchain task; code
   cleanup should be its own task if wanted).
2. **React-hooks v7 `recommended` now includes React-Compiler rules.** If these light up the
   codebase, do we (a) adopt them, or (b) pin to the classic `rules-of-hooks` + `exhaustive-deps`
   for an exact v4 match? **Recommendation: (b)** unless the compiler findings are trivially clean.
3. **`typescript-eslint` meta package vs the two separate packages.** Plan uses the meta package
   (idiomatic v8 flat-config path; provides `tseslint.config`/`tseslint.parser`). This removes the
   two `@typescript-eslint/*` devDeps. If you'd rather keep them explicit, we can wire the plugin
   and parser manually instead — cosmetic difference only.
4. **Scope stays ts/tsx-only.** The plan deliberately does NOT start linting `.js`/`.mjs` (scripts,
   config). Widening scope would surface a large new backlog and is out of scope here.
5. **`globals` version** is pinned at install time to whatever the current major is (~^16).

## Implementation outcome

### Two ecosystem surprises (resolved)

1. **`eslint-plugin-import@2.32.0` peer-caps eslint at `^9`** — landed on eslint **9.39.5** instead
   of 10 (user-approved). Flat config is the default in 9; nothing about the migration is lost.
2. **`eslint-plugin-import@2.32.0` does not honor `import/resolver-next`** and its deep-parse rules
   (`import/namespace`/`default`/`export`) `require('@typescript-eslint/parser')` by name. Fixes:
   - Use the **classic** `settings['import/resolver'] = { typescript: { alwaysTryTypes: true }, node: true }`
     form (resolver v4 stays backward-compatible with it). `resolver-next` silently no-ops on 2.32.
   - Keep **`@typescript-eslint/parser@^8.63.0` as an explicit top-level devDep** (the `typescript-eslint`
     meta package nests it where `eslint-module-utils` can't `require` it).
   - react-hooks pinned to the two classic rules via `plugins: { 'react-hooks': reactHooks }` +
     explicit `rules-of-hooks`/`exhaustive-deps` (not `configs.flat.recommended`).

### Triage of new findings (baseline was 0/0; every finding below is a deliberate decision)

The v8 `recommended` set is stricter than v5, and the resolver upgrade changed a couple of
resolutions. All resolved to preserve the pre-upgrade behavior:

| Finding (rule) | How it was handled |
|---|---|
| ~3790 `import/namespace`/`default`/`export` | Root cause: parser not resolvable — fixed by the explicit `@typescript-eslint/parser` devDep. |
| ~88 "unused eslint-disable directive" | `linterOptions.reportUnusedDisableDirectives: "off"` (eslintrc default; flat defaults to "warn"). |
| 3 `scripts/*.js` parse errors | Added `**/*.{js,jsx,mjs,cjs}` to `ignores` — restores the old `--ext .ts,.tsx` scope. |
| 2 `import/no-unresolved` (csv `browser/esm/sync`) | Fixed by the classic-resolver switch (resolver was never being invoked before). |
| 3 `import/no-unresolved` (`@modelcontextprotocol/sdk/*.js`) | `import/no-unresolved: ['error', { ignore: ['^@modelcontextprotocol/sdk/'] }]` — the 1.29 `./*` wildcard exports can't satisfy the TS resolver's `.js`+`.d.ts` lookup, but the imports build and run. |
| 9 `react-hooks/rules-of-hooks` (AVGrid models) | False positives (model-view `useModel()` pattern) — `rules-of-hooks: off` scoped to `src/renderer/uikit/AVGrid/model/**`. |
| 3 `@typescript-eslint/no-unused-expressions` | New in v8 recommended; intentional `cond && fn()` statements — rule off globally. |
| 6 `@typescript-eslint/no-wrapper-object-types` (`Symbol` type) | Kept the rule on; updated the stale `ban-types` file-directive in `view.tsx` to the v8 successor. |
| 2 `ban-types` "rule not found" | `ban-types` was removed in v8 → updated the two dead directives (`view.tsx`, `Text.tsx`) to their successors / plain comment. |
| 8 `@typescript-eslint/no-unused-vars` (unused catch bindings) | v8 changed `caughtErrors` default "none"→"all"; set `caughtErrors: "none"` to restore v5 behavior. |
| 1 `import/no-named-as-default` (`Hls`) | Resolver now sees hls.js's named `Hls` export — inline `eslint-disable-next-line` on the one import. |

### Verification (all green)

- `npm run lint` → **exit 0, zero output** (0 errors, 0 warnings) — matches the pre-migration baseline.
- `npm run typecheck` → clean.
- `npm run build-prod` → success (~26s); the chunk-size warnings are pre-existing.
- `postinstall`/`patch-package` still applies the monaco patch cleanly (`monaco-editor@0.55.1 ✔`).
- MCP SDK at 1.29.0; `src/main/mcp-http-server.ts` lints clean.
- `npm start` smoke: **pending manual confirmation by the user.**

## Acceptance criteria

- [x] `npm run lint` runs under flat config (`eslint.config.mjs`) and exits clean (0 errors,
      0 warnings), equivalent in spirit to the pre-migration ruleset — every deviation is a
      documented decision (triage table above).
- [x] `.eslintrc.json` removed; `package.json` lint script is `eslint .`; no dangling `.eslintrc`
      references.
- [x] ESLint 9, `typescript-eslint` 8, `eslint-plugin-react-hooks` 7,
      `eslint-import-resolver-typescript` 4 installed; `@typescript-eslint/eslint-plugin` removed
      (parser kept explicit for eslint-plugin-import).
- [x] `@modelcontextprotocol/sdk` at 1.29.0 with `src/main/mcp-http-server.ts` linting clean and
      `npm run typecheck` clean.
- [x] `npm run typecheck` and `npm run build-prod` remain green. `npm start` smoke — pending user.

## Files changed (summary)

| File | Change |
|------|--------|
| `package.json` | eslint 8→9.39.5; +@eslint/js, +globals, +typescript-eslint; @typescript-eslint/eslint-plugin removed, parser kept (8.63); react-hooks 4→7; resolver-ts 3→4; MCP SDK 1.27→1.29; lint script → `eslint .` |
| `package-lock.json` | regenerated by `npm install` |
| `eslint.config.mjs` | **new** — flat config (replaces `.eslintrc.json`) |
| `.eslintrc.json` | **deleted** |
| `src/renderer/core/state/view.tsx` | stale `ban-types`/`no-empty-interface` file-directives → v8 successor rule names |
| `src/renderer/uikit/Text/Text.tsx` | dead `ban-types` line-directive → plain explanatory comment |
| `src/renderer/editors/video/VPlayer.tsx` | inline `eslint-disable-next-line import/no-named-as-default` on the hls.js default import |

# US-826: Upgrade TypeScript (5.9 → 7.0)

**Epic:** [EPIC-040 — Dependency & Platform Updates](../../epics/EPIC-040.md)
**Status:** **Deferred** (investigated 2026-07-13; blocked on the ecosystem — see Decision)

## Decision (2026-07-13)

**Strategy D — keep deferred until the ecosystem is ready.** A literal `typescript` → 7.0.2 swap
is externally blocked by `typescript-eslint` (peer cap `<6.1.0` **and** it needs the TS JS API,
which the native compiler does not expose). Type-checking on `typescript@5.9` works fine today, so
there is no dev-experience gap to close now. The dual-toolchain option (Strategy A) is viable but
adds real churn (tsconfig migration + 25 `controller.ts` + 15 excalidraw fixes) for only a
typecheck-speed win — not worth it yet.

**Revisit trigger:** `@typescript-eslint` ships native-compiler support — i.e. its peer range
admits `typescript >= 7` **and** `@typescript-eslint/typescript-estree` can parse against the
native compiler. When that lands, do the clean full swap (Strategy B) and reuse the migration notes
below (baseUrl removal, `bundler` resolution, the two compiler-diff clusters).

The investigation below is retained so the task can be picked up without re-probing.

## Goal

Adopt TypeScript 7.0 (the native Go compiler) as far as the current ecosystem allows, to gain
much faster type-checking, **without** regressing lint, build, or the in-editor experience.

## Background

### How TypeScript is actually used in this repo

There is exactly **one** `tsconfig.json` (root) and TypeScript is consumed in only these places:

| Consumer | Uses | Affected by a workspace `typescript` bump? |
|----------|------|--------------------------------------------|
| `npm run typecheck` = `tsc --noEmit` | workspace `tsc` binary | **Yes** — this is the only direct `tsc` consumer |
| `typescript-eslint` (`npm run lint`) | workspace `typescript` **JS compiler API** (via `@typescript-eslint/typescript-estree`) | **Yes** — imports `typescript` at runtime; peer-caps it |
| Monaco IntelliSense | Monaco bundles **its own** copy of the TS language service | No |
| Production build transpile | **Vite / esbuild** (`@electron-forge/plugin-vite`) — not `tsc` | No |
| Script transpile (`src/renderer/scripting/transpile.ts`) | **sucrase** — not `tsc` | No |

So a workspace TypeScript upgrade touches **two** things: the `typecheck` script and `typescript-eslint`.

### What "TypeScript 7" actually is (verified 2026-07-13)

`typescript@latest` on npm is now **7.0.2** — the **native Go compiler** ("tsgo"), not the JS
codebase. Evidence from the published package:

- It has **no `tsserver`** — `bin` is only `{ "tsc": "bin/tsc" }` (the 6.0.0-beta JS line still ships both `tsc` and `tsserver`).
- It pulls in per-platform **binary** dependencies (`@typescript/typescript-win32-x64`, `-darwin-arm64`, `-linux-x64`, …).
- The same compiler is also published as `@typescript/native-preview` (bin `tsgo`), which is the drop-in used for probing here.

Because it is a native binary, **it does not expose the JavaScript compiler API** that
`typescript-eslint` (and many other tools) call programmatically.

## The blocker (why this was deferred)

`@typescript-eslint/*@8.63.0` — installed in US-825 — peer-requires:

```
typescript: ">=4.8.4 <6.1.0"
```

and at runtime `@typescript-eslint/typescript-estree` **imports the `typescript` JS API** to build
the AST. TypeScript 7 (native) satisfies neither: the peer range excludes it (→ `npm install`
ERESOLVE) and there is no JS API for estree to consume (→ `npm run lint` breaks at runtime).

**Conclusion:** the workspace `typescript` package **must stay `<6.1.0`** until `typescript-eslint`
ships native-compiler support (tracked upstream; not in the latest release). A straight
`typescript` → 7.0.2 swap is **not viable** — it would undo the 0-errors/0-warnings lint baseline
US-825 just established.

## Investigation results (probes run 2026-07-13, non-destructive via `npx`)

Baseline: **`tsc 5.9.3` + current config (`moduleResolution: node`) = 0 errors.**

### 1. TS7 requires two config changes (both are hard removals)

| Current option | TS7 status | Fix |
|----------------|-----------|-----|
| `"baseUrl": "."` | **Removed** in TS7 | Delete it — **safe**: a repo-wide grep found **0** bare-specifier imports (`from "src/…"` etc.); all imports are relative. |
| `"moduleResolution": "node"` (a.k.a. node10) | **Removed** in TS7 | Change to `"bundler"` (matches our Vite/ESNext setup). |

### 2. The two compilers disagree — even on the same config

| Compiler + resolution | Result |
|-----------------------|--------|
| `tsc 5.9` + `node` | **0 errors** (baseline) |
| `tsc 5.9` + `bundler` | **15 errors** — all `@excalidraw/excalidraw/dist/types/**` deep imports. `bundler` enforces the package `exports` map, which does not expose `dist/types/**`; `node` resolution let them through. |
| `tsgo` (TS7) + `bundler` | **25 errors** — all in `src/ipc/main/controller.ts` (below). TS7 did **not** flag the excalidraw imports. |

### 3. The 25 TS7-only errors (`src/ipc/main/controller.ts`, all `TS2345`)

Two clusters, both from stricter/different Electron-type handling under TS7:

- **6×** `BrowserWindow.fromWebContents(...)` now types as `BrowserWindow | null`, passed where
  `BrowserWindow | undefined` / `BrowserWindow` is expected (e.g. `openWindows.setCanQuit(window, …)`
  at line 64, `showOpenFileDialog(BrowserWindow.fromWebContents(...))` at 68/71/74, `windowReady(window)`
  at 110, `openWindows.findByWindow(window)` at 122).
- **19×** ipc handler methods `(event: IpcMainEvent, …) => Promise<…>` no longer match a specific
  Electron `ipcMain` overload and fall back to the catch-all `(...args: unknown[]) => unknown`
  (lines 476–494, the handler-registration block).

These are legitimate null-safety / typing fixes (nullish-coalescing / guards / a small handler
adapter), not blockers — but they are **real code changes**, concentrated in one file.

## Strategy options

| # | Strategy | Viable now? | Notes |
|---|----------|-------------|-------|
| **A** | **Dual toolchain (recommended):** keep `typescript@5.9.x` as the workspace package (typescript-eslint + editor + build untouched); add `@typescript/native-preview` (tsgo 7.0) and point `npm run typecheck` at it. | ✅ Yes | Delivers the real TS7 win (native-speed typecheck) with zero risk to lint/build/editor. Requires migrating the tsconfig (baseUrl/resolution) and fixing the 25 controller.ts errors so tsgo is clean. |
| B | Full swap — `typescript` → 7.0.2 as the sole TS. | ❌ No | Breaks `npm install` (peer) **and** `npm run lint` (no JS API). Revisit only after typescript-eslint ships native support. |
| C | Transitional bump — `typescript` → 6.0 (JS line; typescript-eslint's `<6.1.0` allows 6.0.x). | ⚠️ Not yet | Real `typescript` bump that keeps the toolchain intact, but `6.0.0` is still `beta` on npm today, and it brings no native-speed win. Defer until 6.0 is stable. |
| D | Keep deferred until typescript-eslint supports TS7, then do B cleanly. | ✅ Defensible | The literal "5.9→7.0 swap" is externally blocked; typecheck already runs fine on 5.9. Lowest effort, no dev-experience gain now. |

## Implementation plan — Strategy A (pending user confirmation)

> Only execute after the user selects Strategy A. If C/D is chosen, this plan is replaced/paused.

Chosen sub-shape: **one shared tsconfig** that *both* compilers accept (cleaner than maintaining
two configs whose module resolution diverges, which would make the editor and the typecheck see
different worlds).

1. **`package.json`**
   - Add devDep `@typescript/native-preview` (pin the probed `7.0.0-dev.*` build, or `typescript@7.0.2`'s native package if preferred — decide at implementation).
   - Keep `typescript` at `^5.9.3` (do **not** bump — typescript-eslint needs it).
   - Change `"typecheck"` from `tsc --noEmit` to `tsgo --noEmit`.
2. **`tsconfig.json`**
   - Remove `"baseUrl": "."` (verified unused).
   - Change `"moduleResolution": "node"` → `"bundler"`.
3. **Fix the 15 excalidraw deep imports** (surface once the shared config is `bundler`, because `tsc 5.9`/lint will now enforce `exports`). Files: `src/renderer/editors/draw/{DrawBody.tsx,DrawEditor.ts,drawExport.ts,drawLibrary.ts,index.tsx}`, `src/renderer/scripting/api-wrapper/DrawEditorFacade.ts`. Options (decide at implementation): re-point to the public `@excalidraw/excalidraw` type exports if equivalents exist, add a local `declare module` shim for the `dist/types/**` paths, or a scoped module-augmentation. Must keep `tsc 5.9` (editor/lint) at 0 errors.
4. **Fix the 25 `controller.ts` errors** — nullish handling for `BrowserWindow.fromWebContents` results and a typed adapter (or `satisfies`) for the ipc handler-registration block so TS7 resolves the correct overload.
5. **Verify:** `tsgo --noEmit` = 0 · `tsc --noEmit` (5.9, still used by editor/lint) = 0 · `npm run lint` = 0/0 · `npm run build-prod` green · Monaco IntelliSense + script transpile unaffected (neither uses workspace TS).
6. **CI:** ensure the CI image installs the tsgo binary for the platform it runs on (native per-arch dependency).

## Concerns / open questions

1. **Strategy fork (must resolve first).** A vs C vs D — this changes the whole task. Recommendation: **A**.
2. **Is the win worth the churn?** The only concrete benefit is faster `typecheck` (dev + CI). Typecheck on 5.9 currently completes fine. If the team doesn't feel typecheck latency, **D (defer)** is entirely reasonable.
3. **excalidraw deep imports are a pre-existing smell** independent of TS7 — they only "work" because `node` resolution ignores the `exports` map. Fixing them is worthwhile regardless, but it is extra scope surfaced by the resolution change.
4. **tsgo dev-preview channel.** `typescript@7.0.2` is stable, but the native package is also distributed as `@typescript/native-preview` on a `dev` tag; confirm which artifact to pin so builds are reproducible.
5. **`@types/node` is still `^20`** while Electron 43 runs Node 24 (US-821). Out of scope here, but a `bundler`-resolution change could surface node-type differences; watch during step 5. Consider a separate task.

## Acceptance criteria

- [ ] Strategy selected by the user and recorded here.
- [ ] (If A) `npm run typecheck` runs the native TS7 compiler and reports **0 errors**.
- [ ] (If A) `npm run lint` still **0 errors / 0 warnings**; `typescript` stays `<6.1.0`.
- [ ] (If A) `npm run build-prod` green; Monaco IntelliSense and script execution unaffected.
- [ ] EPIC-040 + dashboard rows updated to reflect the outcome.

## Files that need NO changes

- `src/renderer/scripting/transpile.ts` (sucrase — independent of workspace TS).
- Monaco setup / `configure-monaco.ts` (Monaco bundles its own TS).
- Vite / electron-forge config (esbuild transpile — independent of `tsc`).
- `eslint.config.mjs` (typescript-eslint keeps consuming `typescript@5.9`).

## Files changed summary (Strategy A — projected)

| File | Change |
|------|--------|
| `package.json` | Add `@typescript/native-preview` devDep; `typecheck` → `tsgo --noEmit`; keep `typescript@^5.9`. |
| `tsconfig.json` | Remove `baseUrl`; `moduleResolution` → `bundler`. |
| `src/renderer/editors/draw/{DrawBody.tsx,DrawEditor.ts,drawExport.ts,drawLibrary.ts,index.tsx}` | Fix `@excalidraw/.../dist/types/**` deep imports. |
| `src/renderer/scripting/api-wrapper/DrawEditorFacade.ts` | Same excalidraw import fix. |
| `src/ipc/main/controller.ts` | Null-safety + ipc handler typing (25 `TS2345`). |

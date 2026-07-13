# US-827: Upgrade Vite (5 → 8)

**Epic:** [EPIC-040 — Dependency & Platform Updates](../../epics/EPIC-040.md)
**Status:** **Implemented (pending epic review)** — Strategy C; Vite 8 on both paths, Forge removed. Verified 2026-07-13.

## Implementation outcome (2026-07-13)

All three phases landed. Persephone now builds on **Vite 8.1.4** (rolldown-based) with **no Electron Forge dependency**.

**Phase A — Forge-free dev.** New `scripts/dev.mjs` runs the renderer Vite dev server + watch-mode
main/preload/preload-webview/board-shim builds + Electron launch, and restarts Electron on
main/preload rebuilds (debounced; board-shim rebuilds don't restart). `package.json` `start` →
`node scripts/dev.mjs`. Verified: dev server on 5273, HMR, `touch src/main.ts` → rebuild → restart.

**Phase B — Vite 8 + monaco plugin.** `vite@^8.1.4`; swapped `vite-plugin-monaco-editor@1.1.0` →
`vite-plugin-monaco-editor-esm@^2.0.2`. Two ecosystem surprises fixed:
- **Vite 8 uses rolldown, no longer hoists `esbuild`** — the plugin does `import {buildSync} from 'esbuild'` with no declared dep → added `esbuild` as an explicit devDep. (`rollupOptions` still work — rolldown-vite keeps the name.)
- **Plugin fed esbuild an extensionless worker entry** (`.../ts.worker`) → `fs.existsSync` false (file is `ts.worker.js`) → esbuild "could not resolve". Fixed via **patch-package** (`patches/vite-plugin-monaco-editor-esm+2.0.2.patch`): `resolveMonacoPath` now tries `+ '.js'`. Fixes both the dev middleware and the prod build hook (shared function).
- Workers now emit under `monacoeditorwork/` (the fork's default `publicPath`); updated `src/preload.ts` `MonacoEnvironment.getWorkerUrl` to `./monacoeditorwork/<label>.worker.bundle.js`. Verified all 4 workers serve HTTP 200 (dev) and emit to `monacoeditorwork/` (prod).
- Removed now-redundant `inlineDynamicImports` from the board-shim builds (Vite 8 sets `codeSplitting:false` for IIFE and warns otherwise).

**Phase C — Forge removed.** Uninstalled `@electron-forge/{cli,plugin-vite,plugin-fuses,plugin-auto-unpack-natives}`
and `@electron/fuses`; deleted `forge.config.ts`, `forge.env.d.ts`, and the four dead
`vite.{main,preload,preload-webview,board-shim}.config.ts` (only Forge referenced them — the build
scripts use inline `configFile:false` configs). Fixed stale comments in `vite-env.d.ts`,
`board-shim.ts`, `board-scaffold.ts`. Audits: **no runtime native `.node` modules** (the 12 present
are all build/dev-time — rolldown/lightningcss/resolver/extract-zip), so no `asarUnpack` needed;
**fuses were never applied in prod** (Forge's `FusesPlugin` only runs under `electron-forge
package/make`, which the `build-prod.mjs`+electron-builder pipeline never invokes) — so removal is
**no regression**. Porting fuses to an electron-builder `afterPack` hook remains an optional
hardening follow-up (see concern 4).

**Verification:** `npm start` (dev + HMR + restart) ✓ · `npm run build-prod` 0 ✓ · `npm run typecheck` 0 ✓ · `npm run lint` 0/0 ✓ · Monaco workers serve/emit ✓. Full `npm run dist` (electron-builder packaging) not run here — `electron-builder.yml` is unchanged and only the Vite output it consumes was affected; left for manual/CI verification.

## Goal

Move the build system from Vite 5.4 to Vite 8 without regressing dev HMR (`npm start`) or the
production bundle (`npm run dist`), keeping the `.vite/` output structure unchanged.

## Decision (2026-07-13)

**Strategy C — decouple dev from Forge.** Replace `electron-forge start` with an own dev script
that starts a Vite dev server for the renderer and builds main/preload/board-shim in watch mode
(mirroring how `scripts/build-prod.mjs` already builds prod without Forge). This removes the Forge
gate — the only reason we were pinned to Vite 5 was `@electron-forge/plugin-vite` (dev only) — so
Vite 8 can land on **both** dev and prod now, and Forge is dropped as a dependency entirely.

Rationale: production already bypasses Forge, so this unifies dev and prod on our own Vite usage
and eliminates the alpha-Forge risk. Cost: we reimplement the HMR/main-reload orchestration Forge
gave us for free (detailed below), and replace the stale monaco plugin.

## Background

### Two independent build paths (only one goes through Forge)

| Path | Command | Driver | Uses Forge? |
|------|---------|--------|-------------|
| **Dev** | `npm start` | `electron-forge start` → `@electron-forge/plugin-vite` (Vite dev server + HMR + main/preload rebuild) | **Yes** |
| **Prod** | `npm run dist` | `scripts/build-prod.mjs` calls Vite's `build()` **JS API directly** (5 builds: main, preload, preload-webview, board-shim, renderer), then `electron-builder` packages `.vite/` | **No** — bypasses Forge entirely |

This split is the key to the whole task: **production already does not depend on Forge**, so the
Forge gate below applies only to `npm start`.

### Build config surface (what we own)

- `forge.config.ts` — declares the `VitePlugin` build/renderer entries (dev only).
- `scripts/build-prod.mjs` — the prod builder; calls `build()` with `configFile`, `resolve.conditions`, `rollupOptions` (`input`/`output.format` cjs+iife/`external`), `define`. **This is our largest direct Vite-API surface.**
- `vite.renderer.config.ts` — real config: dev `server.port/strictPort`, a custom `editorTypesPlugin` (`buildStart` + `configureServer`/`server.watcher`), and `vite-plugin-monaco-editor`.
- `vite.main.config.ts`, `vite.preload.config.ts`, `vite.preload-webview.config.ts` — empty `defineConfig({})` (Forge injects settings at dev time).
- `vite.board-shim.config.ts` — overrides `rollupOptions.output.format: 'iife'` + `inlineDynamicImports`.

## Investigation results (verified 2026-07-13)

### The gate — Forge officially supports only Vite 5 on the stable channel

| Fact | Value |
|------|-------|
| Installed Vite | `5.4.21` |
| Vite dist-tags | `latest 8.1.4`, `previous 7.3.6`, `beta 8.1.0-beta.0` |
| **Latest stable Forge** | `@electron-forge/*@7.11.2` |
| `@electron-forge/plugin-vite@7.11.2` on Vite | devDependency **`vite: ^5.0.12`** (no runtime dep, no peer) — developed/tested against Vite 5 |
| **`@electron-forge/plugin-vite@8.0.0-alpha.10`** on Vite | devDependency **`vite: ^8.0.0`** — Vite 8 support lands in **Forge 8** |
| Forge 8 status | **alpha only** (`8.0.0-alpha.10`); no stable release |

So `npm start` (dev HMR) runs through a Forge plugin whose supported Vite is 5. **Vite 8 support
requires Forge 8, which is currently alpha.** There is no safe intermediate on the stable Forge
line — any of Vite 6/7/8 puts dev mode on unsupported territory.

### Node engine — not a blocker

Vite 7 and 8 both require Node `^20.19.0 || >=22.12.0`. We run **Node 24.18.0** (Electron 43, US-821) → fine.

### Second liability — `vite-plugin-monaco-editor@1.1.0` is stale

Last published **2022-07-02** (~4 years). It only constrains `monaco-editor` (no Vite pin) and uses
older Vite plugin-hook patterns. It is a real compatibility risk across Vite 6/7/8 and will likely
need replacing (e.g. a maintained ESM fork such as `vite-plugin-monaco-editor-esm`, or a
hand-rolled worker-bundling setup) as part of any Vite-major bump.

## Strategy options

| # | Strategy | Viable now? | Notes |
|---|----------|-------------|-------|
| A | **Defer until Forge 8 is stable.** Then do Vite 8 + Forge 8 together, plus replace the monaco plugin. | ✅ Defensible / clean | Mirrors US-826 — the stable-channel tooling isn't ready. Dev HMR keeps working on the supported combo; lowest risk. |
| B | Adopt **Forge 8 alpha + Vite 8** now. | ⚠️ Risky | Puts the *entire* dev build toolchain of a shipping app on an alpha Forge release. Not advisable for a release branch. |
| **C** | **✅ SELECTED — Decouple dev from Forge** — replace `npm start` with an own Vite dev server + Electron launch (mirroring how prod already bypasses Forge), then adopt Vite 8 on both paths now. | ✅ but large | Removes the Forge gate entirely and unifies dev/prod on our own Vite usage. Big architectural change (reimplement Forge's HMR/main-preload reload) + monaco-plugin replacement. See the implementation plan below. |

## Implementation plan — Strategy C (decouple dev from Forge, then Vite 8)

Sequenced to isolate the two risks (removing Forge vs. bumping Vite). Each phase is independently verifiable.

### How Forge's dev mode works today (what we must replicate)

Verified from `@electron-forge/plugin-vite@7.11.2` internals + our own code:

- **Renderer:** `vite.createServer({ configFile, ...userConfig })` → `await server.listen()` → read `server.resolvedUrls` for the dev URL (our `vite.renderer.config.ts` pins port `5273`, `strictPort`).
- **Main / preload / board-shim:** `vite.build({ ...config, build.watch enabled })` → returns a **RollupWatcher**; each rebuild emits a `BUNDLE_END` event.
- **Dev-URL contract (already in our code):** the main bundle is built with two `define` constants — `MAIN_WINDOW_VITE_DEV_SERVER_URL` (the dev URL string; `undefined` in prod) and `MAIN_WINDOW_VITE_NAME` (`"main_window"`). `src/main/open-window.ts` consumes them: dev → `loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)`, prod → `loadFile(../renderer/${MAIN_WINDOW_VITE_NAME}/index.html)`; also gates `will-navigate` on the dev origin. `scripts/build-prod.mjs` already sets these exact defines (URL = `"undefined"`). Declared in `src/main/vite-env.d.ts`.
- **Electron launch + restart:** Forge **core** (not the plugin) spawns Electron and restarts it when the main/preload bundle changes. This is the piece we reimplement.

### Phase A — Replace Forge dev with an own script (stay on Vite 5)

Prove `npm start` works without Forge **before** changing any versions.

1. **New `scripts/dev.mjs`** — mirrors `build-prod.mjs` but for dev:
   - `createServer({ configFile: "vite.renderer.config.ts", mode: "development" })` + `listen()`; take `server.resolvedUrls.local[0]` as `devUrl`.
   - Build `main` (with `define: { MAIN_WINDOW_VITE_DEV_SERVER_URL: JSON.stringify(devUrl), MAIN_WINDOW_VITE_NAME: '"main_window"' }`, `resolve.conditions: ["node"]`, node builtins `external`), `preload`, `preload-webview` (cjs, node externals), and `board-shim` (iife) — each with `build: { watch: {} }` so `build()` returns a RollupWatcher.
   - Electron lifecycle: `import electronPath from "electron"` (npm `electron` default export = exe path); `spawn(electronPath, ["."], { stdio: "inherit" })`. Start Electron after the first main `BUNDLE_END`; on later `BUNDLE_END` (debounced across the 4 watchers) kill + respawn. Renderer edits use Vite HMR — no restart.
   - `SIGINT` handler: close watchers, `server.close()`, kill the Electron child.
2. **`package.json`** — `"start": "node scripts/dev.mjs"` (was `electron-forge start`).
3. **Verify:** `npm start` launches, renderer HMR works, editing a `src/main/**` or preload file restarts Electron, `open-window.ts` dev-URL load + `will-navigate` gating unchanged.

### Phase B — Bump Vite 5 → 8 + replace the monaco plugin

4. **`package.json`** — `vite` → `^8.1.4`. Replace `vite-plugin-monaco-editor@1.1.0` (4 yrs stale) with a maintained equivalent (evaluate `vite-plugin-monaco-editor-esm`, or hand-roll worker bundling) preserving the four workers (`typescript`, `editorWorkerService`, `json`, `html`).
5. **`scripts/build-prod.mjs` + `scripts/dev.mjs`** — re-validate the direct `build()`/`createServer()` API against Vite 8 (config-default and `build.target` shifts); fix as needed. Output `.vite/` structure must stay identical (naming already pinned via `rollupOptions.output`).
6. **`vite.renderer.config.ts`** — update monaco-plugin usage; re-check `editorTypesPlugin` hooks (`buildStart`, `configureServer`, `server.watcher`) against the Vite 8 plugin API.
7. **Verify:** `npm start` (Vite 8 dev + HMR) and `npm run dist` (Vite 8 prod bundle) both work; Monaco loads all workers with no console errors.

### Phase C — Remove Forge

8. **`package.json`** — remove `@electron-forge/cli`, `@electron-forge/plugin-vite`, `@electron-forge/plugin-fuses`, `@electron-forge/plugin-auto-unpack-natives`, `@electron-forge/shared-types`.
9. **Delete `forge.config.ts`.** (Prod already ignores it — electron-builder drives packaging.)
10. **Fuses audit (see concern 4):** decide whether to port the intended fuses to an electron-builder `afterPack` hook via `@electron/fuses`. If yes, keep `@electron/fuses` and add the hook; if no, remove `@electron/fuses` too.
11. **`asarUnpack` audit:** confirm nothing relied on `plugin-auto-unpack-natives` (the Rust sidecars ship via `extraFiles`, not asar-unpacked native modules) — add `asarUnpack` to `electron-builder.yml` only if a real native `.node` dependency surfaces.
12. **Verify:** clean `npm install`, `npm start`, `npm run dist`, packaged app launches; VMP signing (`afterSign`) still runs.

## Concerns / open questions

1. **Reimplementing HMR/reload orchestration.** Forge core gives us Electron launch + restart-on-main-change for free; Phase A rebuilds it in `scripts/dev.mjs`. Main risk is edge cases (debouncing restarts across the 4 watchers, clean child teardown on `SIGINT`, not restarting on renderer-only edits). Manageable but the primary effort of this task.
2. **Vite major breaking changes** (Phase B): Vite 6 Environment API + config-default shifts; Vite 7 default `build.target` (`baseline-widely-available`) and legacy removals; Vite 8 defaults. Our renderer/board-shim pin `target: 'esnext'`/explicit formats, which insulates us; still re-validate the direct `build()`/`createServer()` calls.
3. **`vite-plugin-monaco-editor` replacement** — 4 years stale, the highest-uncertainty item. Confirm a maintained alternative bundles the four workers and loads them under Electron (`nodeIntegration`) without console errors.
4. **Fuses are NOT applied in prod today.** `forge.config.ts`'s `FusesPlugin` only runs under `electron-forge package/make`, which the prod pipeline (`build-prod.mjs` + `electron-builder`) never invokes — `electron-builder.yml`'s only hook is `afterSign: scripts/vmp-sign.mjs` (VMP signing). So dropping Forge causes **no fuses regression**. Open question: *should* the intended fuses (`RunAsNode` off, `OnlyLoadAppFromAsar`, `EmbeddedAsarIntegrityValidation`, …) be ported to an electron-builder `afterPack` hook via `@electron/fuses`? Arguably a separate hardening task; decide during Phase C step 10.
5. **`.vite/` output contract.** `package.json` `main` = `.vite/build/main.js`; `electron-builder` packages `.vite/`. Output naming already pinned via `rollupOptions.output` in `build-prod.mjs` — keep it pinned through the Vite 8 bump.
6. **Prod-path pre-check.** The prod builder is Forge-independent, so Vite 8 on `build-prod.mjs` can be validated in isolation early to de-risk the API surface.

## Acceptance criteria

- [x] Strategy selected — **C (decouple dev from Forge)**, recorded above.
- [x] Phase A: `npm start` runs via `scripts/dev.mjs` (no Forge); renderer HMR works; main/preload edits restart Electron; `open-window.ts` dev-URL load + `will-navigate` gating unchanged.
- [x] Phase B: `vite@8` on both paths; `npm run build-prod` produces the same `.vite/` structure; Monaco workers emit/serve. (Full `npm run dist` packaging left for manual/CI.)
- [x] Phase C: all `@electron-forge/*` + `@electron/fuses` removed, `forge.config.ts` deleted; build/typecheck/lint green; fuses decision recorded (no regression; hardening is a follow-up).
- [x] EPIC-040 + dashboard rows updated to reflect the outcome.

## Files that will change (Strategy C)

| File | Change |
|------|--------|
| `scripts/dev.mjs` | **New** — Forge-free dev orchestrator (renderer dev server + watch-mode main/preload/board-shim + Electron launch/restart). |
| `package.json` | `"start"` → `node scripts/dev.mjs`; `vite` → `^8.1.4`; remove all `@electron-forge/*`; swap `vite-plugin-monaco-editor` for a maintained plugin; resolve `@electron/fuses` per the fuses decision. |
| `scripts/build-prod.mjs` | Re-validate/adjust direct `build()` calls for Vite 8. |
| `vite.renderer.config.ts` | Update monaco-plugin usage; re-check `editorTypesPlugin` hooks against the Vite 8 plugin API. |
| `forge.config.ts` | **Deleted.** |
| `electron-builder.yml` | Only if the fuses/`asarUnpack` audits (Phase C steps 10–11) require a hook/entry. |
| `vite.*.config.ts` (main/preload/board-shim) | Re-verify; likely unchanged (minimal). |

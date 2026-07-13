# EPIC-040: Dependency & Platform Updates (Keep Persephone Current)

## Status

**Status:** Completed
**Created:** 2026-07-12
**Completed:** 2026-07-13

## Overview

An ongoing "housekeeping" epic to keep Persephone's runtime and library versions current, so
the app never drifts into a state where it is too outdated to update safely (stale Chromium =
site-compatibility breakage; stale toolchains = painful multi-major migrations later). Each
component or library upgrade is tracked as its own task under this epic, upgraded and verified
in isolation so a regression can be attributed to a single bump. The epic stays open long-term:
tasks are added as new versions ship and closed as they land.

## Goals

- **Never fall dangerously behind.** Upgrade the runtime (Electron/Chromium/Node) and key
  libraries on a regular cadence rather than in one giant, risky leap.
- **One bump per task.** Each upgrade is isolated so its regressions are attributable and its
  verification is scoped. Runtime-critical libraries (Electron, Monaco, Anthropic SDK) each get
  their own task; low-risk in-major bumps may be batched into a single "safe batch" task.
- **Preserve DRM.** The Electron runtime must remain the Castlabs `+wvcus` fork so Widevine /
  VMP signing keeps working (Netflix, Disney+ in the built-in browser).
- **No functional regressions.** Every upgrade is verified against the areas it can affect
  (build, editors, browser, scripting, boards, DRM) before its task is marked done.

## Upgrade inventory (snapshot 2026-07-12)

Baseline audit of `npm outdated` + Castlabs Electron fork. Grouped by risk; each row becomes (or
feeds) a task.

### Runtime

| Component | Current | Target | Notes |
|-----------|---------|--------|-------|
| Electron (Castlabs) | `v39.8.0+wvcus` (Chromium 142 / Node 22) | `v43.0.0+wvcus` (Chromium 150 / Node 24) | US-821. Latest stable fork tag; DRM preserved. |

### Safe batch — patch/minor within same major (low risk)

`@electron-forge/*` 7.10.2→7.11.2 · `electron-builder` 26.8.1→26.15.3 ·
`@modelcontextprotocol/sdk` 1.27.1→1.29.0 · `react`/`react-dom` 19.2.0→19.2.7 ·
`@types/react` →19.2.17 · `mermaid` 11.12.2→11.16.0 · `immer` →11.1.11 · `zustand` →5.0.14 ·
`@floating-ui/react` →0.27.20 · `react-tooltip` →5.30.1 · `iconv-lite` →0.7.3 ·
`csv-stringify` →6.8.1 · `hls.js` →1.6.16 · `video.js` →8.23.9 · `@excalidraw/excalidraw` →0.18.1.

### Runtime-critical majors — each its own task

| Library | Current | Latest | Risk |
|---------|---------|--------|------|
| `@anthropic-ai/sdk` | 0.86.1 | 0.111.0 | Pre-1.0; powers `ai` namespace / Claude sessions. |
| `monaco-editor` | 0.52.2 | 0.55.1 | Core editor; lockstep with `@monaco-editor/react` + `vite-plugin-monaco-editor` + the `monaco-editor+0.52.2.patch`. |

### Dev-toolchain majors — own task (dev-only, no runtime impact)

ESLint flat-config migration: `eslint` 8→9 (10 blocked — `eslint-plugin-import` peer-caps at 9),
`@typescript-eslint/*` 5→8, `eslint-plugin-react-hooks` 4→7, `eslint-import-resolver-typescript`
3→4 (move together).

### Deferred — large, standalone efforts

`typescript` 5.9→7.0 (Go-based compiler; deferred in US-826 — blocked on typescript-eslint) ·
~~`vite` 5→8~~ (done in US-827 — landed on Vite 8 + rolldown, **Electron Forge removed** by
decoupling dev; the plugin-vite gate no longer applies) · ~~`csv-parse` 6→7~~ (done in US-828) ·
~~`picomatch` 2→4~~ (done in US-828 — deduped onto Vite's transitive 4.0.5).

**`@electron/fuses`** is no longer a dependency — US-827 removed Forge and `@electron/fuses` with
it. It now appears only transitively under `electron-builder`, so there is nothing to bump (US-828
confirmed this and excluded it). Fuses were never applied in shipped builds (Forge's `FusesPlugin`
only runs under `electron-forge package/make`, which the electron-builder pipeline never invokes).
Re-introducing fuses as an electron-builder `afterPack` hook is an optional **hardening**
follow-up, not a version bump — its own task when picked up (kept out of US-828 by decision).

## Linked Tasks

| Task | Title | Status |
|------|-------|--------|
| US-821 | [Update Electron to 43.0.0 (Castlabs +wvcus)](../tasks/US-821-electron-43-upgrade/README.md) | Done (reviewed) — residual release-time QA (DRM in signed build + packaged installer) tracked in backlog |
| US-822 | [Safe batch — low-risk minor/patch npm bumps](../tasks/US-822-safe-batch-minor-bumps/README.md) | Done (reviewed) |
| US-823 | [Upgrade `@anthropic-ai/sdk` (0.86 → 0.111)](../tasks/US-823-anthropic-sdk-major/README.md) | Done (reviewed) — verified offline via mock harness |
| US-824 | [Upgrade `monaco-editor` (0.52 → 0.55)](../tasks/US-824-monaco-editor-major/README.md) | Done (reviewed) — 0.55 namespace move; menu-paste bug patched |
| US-825 | [ESLint flat-config migration](../tasks/US-825-eslint-flat-config-migration/README.md) | Done (reviewed) — flat config on eslint 9; incl. deferred MCP SDK 1.29 |
| US-826 | [Upgrade TypeScript (5.9 → 7.0)](../tasks/US-826-typescript-7/README.md) | Deferred → moved to backlog (blocked on typescript-eslint native-TS7 support) |
| US-827 | [Upgrade Vite (5 → 8)](../tasks/US-827-vite-8/README.md) | Done (reviewed) — Vite 8 (rolldown) dev+prod, Electron Forge removed (own `scripts/dev.mjs`), monaco plugin swapped + patched |
| US-828 | [Remaining deferred majors (csv-parse / picomatch)](../tasks/US-828-remaining-deferred-majors/README.md) | Done (reviewed) — csv-parse 6→7, picomatch 2→4 (behavior-identical); `@electron/fuses` transitive-only → out of scope |

## Notes

### 2026-07-12
- Epic created. Baseline audit captured above. First task: Electron → 43.0.0 stable.
- All Castlabs release tags keep the `+wvcus` suffix, so DRM is preserved across every upgrade
  path — the `electronDownload.mirror` in `electron-builder.yml` does not change.

### 2026-07-13 — Epic closed
- All seven implemented tasks (US-821/822/823/824/825/827/828) reviewed at epic level — clean,
  no architecture/standards violations. Dev docs (`CLAUDE.md`, `folder-structure.md`,
  `browser-editor.md`) and user docs (`whats-new.md` "Under the hood") updated. typecheck / lint /
  build-prod green.
- **US-826 (TypeScript 7)** deferred — moved to [backlog](../tasks/backlog.md) (blocked on
  typescript-eslint native-TS7 support).
- **Residual release-time QA (US-821):** DRM playback in a VMP-signed E43 build + packaged NSIS
  installer — cannot be verified locally; tracked in [backlog](../tasks/backlog.md) for the next
  signed build.
- **Fuses hardening** (electron-builder `afterPack`) tracked in backlog as an optional follow-up.
- This was a snapshot upgrade cycle; open a fresh dependency-update epic for the next cycle.

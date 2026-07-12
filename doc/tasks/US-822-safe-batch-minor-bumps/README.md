# US-822: Safe batch — low-risk minor/patch npm bumps

**Epic:** [EPIC-040 — Dependency & Platform Updates](../../epics/EPIC-040.md)
**Status:** Planned (placeholder — detailed plan pending)

> Placeholder. A full task doc (Goal → Background → Implementation plan → Concerns →
> Acceptance criteria) will be written following the CLAUDE.md "create a task" flow when this
> task is picked up. See [EPIC-040](../../epics/EPIC-040.md) for the upgrade inventory and rationale.

## Scope

One batched task for the low-risk, in-major bumps that carry no expected breaking changes:

- `@electron-forge/*` (cli + 3 plugins) 7.10.2 → 7.11.2
- `electron-builder` 26.8.1 → 26.15.3
- `@modelcontextprotocol/sdk` 1.27.1 → 1.29.0
- `react` / `react-dom` 19.2.0 → 19.2.7, `@types/react` → 19.2.17
- `mermaid` 11.12.2 → 11.16.0
- `immer` → 11.1.11, `zustand` → 5.0.14
- `@floating-ui/react` → 0.27.20, `react-tooltip` → 5.30.1
- `iconv-lite` → 0.7.3, `csv-stringify` → 6.8.1, `hls.js` → 1.6.16, `video.js` → 8.23.9
- `@excalidraw/excalidraw` → 0.18.1

## Risk / notes

- Low risk; verify `npm run typecheck` + `npm run lint` + a boot smoke test after the batch.
- Re-audit `npm outdated` at pickup time — versions will have moved on.
- Runtime-critical majors (`@anthropic-ai/sdk`, `monaco-editor`) are **excluded** — they get
  their own tasks (US-823, US-824).

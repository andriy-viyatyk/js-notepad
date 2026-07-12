# US-822: Safe batch — low-risk minor/patch npm bumps

**Epic:** [EPIC-040 — Dependency & Platform Updates](../../epics/EPIC-040.md)
**Status:** Done (pending commit)

## Scope (as implemented)

Low-risk, in-major bumps with no expected breaking changes. Declared floors bumped in
`package.json` and the lockfile regenerated:

- `@electron-forge/*` (cli + 3 plugins) 7.10.2 → 7.11.2
- `electron-builder` 26.8.1 → 26.15.3
- `react` / `react-dom` 19.2.0 → 19.2.7, `@types/react` → 19.2.17
- `mermaid` 11.12.2 → 11.16.0
- `immer` → 11.1.11, `zustand` → 5.0.14
- `@floating-ui/react` → 0.27.20, `react-tooltip` → 5.30.1
- `iconv-lite` → 0.7.3, `csv-stringify` → 6.8.1, `hls.js` → 1.6.16, `video.js` → 8.23.9
- `@excalidraw/excalidraw` → 0.18.1

## Deferred out of this task

- **`@modelcontextprotocol/sdk` 1.27.1 → 1.29.0 — moved to [US-825](../US-825-eslint-flat-config-migration/README.md).**
  The bump itself works (TypeScript and the Vite bundler both resolve the deep imports in
  `src/main/mcp-http-server.ts`), but `eslint-import-resolver-typescript@3.10.1` can't follow the
  SDK's newer `./*` wildcard `exports` map with `.js` import extensions, so `npm run lint` fails
  with `import/no-unresolved`. The fix is the resolver 3→4 upgrade, which lives in US-825 — so
  the MCP bump is paired with it there. Kept at 1.27.1 for now (lockfile pinned).

## Verification (2026-07-12)

| Check | Result |
|-------|--------|
| `npm run typecheck` | ✅ clean |
| `npm run lint` | ✅ clean (after deferring the MCP SDK bump) |
| `node scripts/build-prod.mjs` (full prod bundle) | ✅ all targets built (react 19.2.7, mermaid 11.16, video.js 8.23.9, excalidraw 0.18.1) |
| `npm start` dev boot | ✅ (see commit) |

## Notes

- Runtime-critical majors (`@anthropic-ai/sdk`, `monaco-editor`) were **excluded** by design —
  they get their own tasks (US-823, US-824).

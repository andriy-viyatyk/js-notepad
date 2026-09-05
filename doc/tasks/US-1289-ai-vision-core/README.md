# US-1289: AiVision core — types, path parser, resolver, root + pages descriptors, helpSearch

**Epic:** [EPIC-083](../../epics/EPIC-083.md) · **Status:** Implemented — awaiting user test · **Created:** 2026-09-05

## Goal

Lay down the AiVision pattern that every later task copies: the shared descriptor interface, the
path grammar, a process-agnostic resolver, result shaping, hint formatting, `helpSearch`, and the
first three described nodes — root, `pages`, and `Page`. Implemented by Claude directly so the
pattern is fixed before Codex follows it for the facades (US-1291) and namespaces (US-1292).

## Background

- Design decisions 1–8 in the epic are binding; this document only records how they land in code.
- The tree is the existing wrapper graph: `AppWrapper` → `PageCollectionWrapper` → `PageWrapper` →
  facades, all in `src/renderer/scripting/api-wrapper/`. `ScriptContext` builds an `AppWrapper`
  per run and `dispose()` releases it; the resolver runs inside one such context.
- `PageWrapper.grouped` creates the grouped page on read (`PageWrapper.ts:127`), and
  `pagesModel.getGroupedPage` / `isGrouped` answer without side effects — that is what `children()`
  must use.
- Privacy metadata for browser pages comes from the editor state (`isIncognito`, `isTor`, `url`) as
  `toPageSummary` in `api/mcp/page-commands.ts` reads it.
- MCP tools are data (`IMcpToolDef`); pass-through tools forward to the renderer command registry
  in `api/mcp/command-registry.ts`. One server instance exists per MCP session, so per-session state
  lives in the tool-definition closure.

## Implementation plan

Shared (both processes) — `src/shared/ai-vision/`:

- [x] `types.ts` — `IAiVisible`, `IAiVisionDescriptor`, `IAiMember`, `IAiChild`, `isAiVisible`,
      constructor registry `registerAiVision` / `getAiVision`.
- [x] `path-parser.ts` — `parsePath(path)` → segments (`member`, `index`, `call`, `help`);
      JSON-literal args and indexes; errors carry the offset.
- [x] `result-shaper.ts` — strings truncated to `maxLength`; visible instances → `summarize()`;
      arrays mapped and capped; class instances without a descriptor → `{ kind, note }` (never a
      raw dump); cycle-safe.
- [x] `hint.ts` — hint text for a node (kind, summary, live children, members, `$help` pointer) and
      the full `$help` rendering.
- [x] `resolver.ts` — `resolveCall(root, request, seenKinds)`: walks the live tree awaiting every
      hop, enforces `restricted()`, validates member names against `members` when a descriptor
      exists, applies `args`/`value`, and returns the `{ path, result, hint }` envelope or the
      `{ error, resolvedUpTo, hint }` envelope.
- [x] `help-search.ts` — BFS over `children()` only; matches all query tokens against member
      name/summary/signature and node summary/help; instance paths rank first.

Renderer — `src/renderer/scripting/ai-vision/`:

- [x] `root.ts` — `AiRoot`: delegates to `AppWrapper`, adds `page` (active page) and
      `helpSearch(query, limit?)`; reserves `windows`, `main`, `guides`, `tools`, `script`, `pipe`.
- [x] `call.ts` — `aiCall(request)`: creates a `ScriptContext`, resolves, disposes.
- [x] `PageCollectionWrapper.aiVision` — kind `Pages`; `children()` = open pages; `index()` by
      position or id; `summarize()`.
- [x] `PageWrapper.aiVision` — kind `Page`; `children()` = the facade matching the current editor
      plus `grouped` only when already grouped; `restricted()` for incognito/Tor browser pages;
      `summarize()` with privacy-safe browser fields.
- [x] `api/mcp/call-command.ts` + registry entry `call`.

Main — minimal so the work is testable; US-1290 completes it:

- [x] `main/mcp/tools/call-tools.ts` — the `call` tool, pass-through with per-session hint dedupe.
      Windows prefix, the `windows`/`main` nodes, guide updates and the final description text are
      US-1290 / US-1295.

## Acceptance criteria

- `call` with `path: ""` lists root members; `pages` lists open pages as children; `pages[0]`
  and `pages["<id>"]` resolve; `page.content` returns text; `pages[i].asGrid().rowCount` works on a
  grid page; `helpSearch("add rows")` returns a callable path.
- Unknown member → error plus the parent's member list; no exception text leaks.
- Reading hints, `$help`, or `children()` never creates a grouped page.
- Incognito/Tor browser page: listed with flags and no url; anything under it refused.
- `npm run lint` and `tsc` clean.

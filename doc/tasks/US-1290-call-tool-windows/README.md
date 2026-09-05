# US-1290: `call` MCP tool — `windows[i]` prefix, main-process `windows` node, guides

**Epic:** [EPIC-083](../../epics/EPIC-083.md) · **Status:** Implemented — awaiting user test · **Created:** 2026-09-05

## Goal

Finish the `call` tool that US-1289 shipped in minimal form: route the optional `windows[i].`
prefix, serve the `windows` node from the main process with the shared resolver (the first
main-process AiVision node — the pattern US-1295's `main` node copies), and point the guides and
server instructions at the tool. Implemented by Claude because it establishes that pattern.

## Background

- `sendToRenderer(method, params, windowIndex)` in `main/mcp/renderer-bridge.ts` picks the first
  open window when `windowIndex` is omitted — that is what "no prefix = main window" means.
- Window knowledge lives in `main/open-windows.ts` (`openWindows.windows`, `createWindow`) and
  `main/window-states.ts` (`getState(index)` → persisted pages). `list_windows`/`open_window` in
  `tools/window-tools.ts` were the model for the node's members; they stay as they are.
- The shared resolver (`src/shared/ai-vision/resolver.ts`) is root-agnostic, so the main process
  resolves against its own `MainAiRoot` with the same code and the same per-session `seenKinds`.

## Implementation

- [x] `main/mcp/ai-vision/main-root.ts` — `MainAiRoot` → `WindowsNode` (kind `Windows`; children =
      every window with status and page count; `index(i)`) → `WindowNode` (kind `Window`; `index`,
      `status`, `pageCount`, `activePageId`, persisted `pages` without browser urls, `open()`,
      `focus()`; lists `.pages` as a live child only when open).
- [x] `tools/call-tools.ts` — `routeCallPath`: no `windows` prefix → forward as before; `windows`,
      `windows[i]`, `windows[i].<own member>`, `$help` → local resolve; deeper → forward the
      remainder with `windowIndex = i`. Forwarded responses get the prefix re-applied to `path`,
      `resolvedUpTo` and hint child paths so the agent sees the paths it typed. Description gains a
      `windows` example.
- [x] Renderer root lists `windows` as a member (with the "prefix any path" summary) so the root
      hint is complete even though the main process answers it.
- [x] Guides: `mcp-res-overview.md` (mental-model bullet + first routing-table row),
      `mcp-res-scripting.md` (paths mirror `app.*`), `SERVER_INSTRUCTIONS` (first scenario).

## Acceptance criteria

- `windows` lists every window with status; `windows[0]` summarises; `windows[0].pages` returns
  persisted page summaries without browser urls; `windows[0].$help` renders.
- `windows[0].pages[0].content` returns the same text as `pages[0].content`, and its hint paths
  carry the `windows[0].` prefix.
- `windows[99]` → "No item 99" with the Windows children list; `windows["x"].pages` → the
  numeric-index error.
- `windows[i].open()` on a closed window reopens it; `focus()` on a closed one is refused.
- Lint and type check clean.

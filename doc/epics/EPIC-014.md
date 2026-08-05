# EPIC-014: Claude AI Chat Panel

## Status

**Status:** Backlog (recorded idea — see `../tasks/backlog.md`)
**Created:** 2026-03-26
**Revised:** 2026-04-07

## Overview

Add a dedicated Claude AI chat panel to Persephone — a right-side panel (mirroring the PageNavigator on the left) that provides a persistent chat interface powered by the `@anthropic-ai/claude-agent-sdk`. The panel integrates deeply with Persephone: it auto-registers the Persephone MCP server, injects context about the active page, renders rich markdown responses with syntax-highlighted code blocks, and streams responses in real time.

The panel is global (app-level, not page-specific), so conversations persist as the user switches between tabs. Claude has full access to Persephone's MCP tools via automatic server registration.

## Motivation

- Users with Claude Pro/Team subscriptions can use Claude Code CLI — the Agent SDK reuses that auth (no separate API key required if Claude CLI is installed)
- A dedicated chat UI is dramatically better than a raw terminal: markdown rendering, code blocks, tool call display, conversation history, context injection
- Tight integration is only possible with a custom editor — MCP auto-registration, page context injection, insert-to-page actions
- Terminal editor is a separate, complex undertaking with diminishing returns (VS Code already does it well). A simple keyboard shortcut (`Ctrl+\``) to open the system PowerShell at the current directory covers the basic shell access need

## Goals

- **Right-side Claude chat panel** — toggleable, resizable, persistent across tab switches
- **Rich chat UI** — markdown rendering, syntax-highlighted code, tool call visualization, streaming
- **Deep Persephone integration** — auto-register Persephone MCP, inject active page context on demand
- **Conversation management** — persist history, clear/new conversation, abort in-flight requests
- **Configurable** — API key setting, model selection, system prompt customization

## Architecture

```
Right Panel (renderer)
└── ClaudeChatPanel.tsx         ← Chat UI: message list, input, toolbar
    └── ClaudeChatModel.ts      ← State: messages, streaming, abort, settings
            │
            │  @anthropic-ai/claude-agent-sdk
            │  query({ prompt, options: { mcpServers, systemPrompt, cwd, ... } })
            │
            ▼
    Claude Agent SDK (Node.js, runs in renderer process)
            │
            ▼
    Claude AI (API or Claude CLI auth)
            │
            ▼  MCP (via mcpServers option)
    Persephone MCP Server (localhost HTTP)
    ├── execute_script, create_page, ui_push
    ├── get_page_content, set_page_content
    └── list_pages, open_url, ...
```

### SDK Integration

Package: `@anthropic-ai/claude-agent-sdk`

The `query()` function returns an async iterator of typed messages. Key options used:

| Option | Usage |
|--------|-------|
| `prompt` | User message text |
| `options.mcpServers` | Auto-register Persephone MCP at chat start |
| `options.systemPrompt` | Inject Persephone context (active page, page list) |
| `options.cwd` | Set to Persephone project dir so CLAUDE.md is discovered |
| `options.model` | Configurable — default `claude-sonnet-4-6` |
| `options.abortController` | Cancel in-flight request |
| `options.resume` | Resume previous conversation session |
| `options.maxTurns` | Configurable safety limit |

Message types from the iterator that the UI handles:
- `assistant` — render as Claude message (markdown)
- `tool_use` — render as collapsible tool call card (tool name + input)
- `tool_result` — show result inline under the tool call card
- `result` — final message, marks streaming complete
- `system` (type: `init`) — capture session ID for resume

### Authentication

The SDK supports:
1. `ANTHROPIC_API_KEY` environment variable (or entered in settings)
2. Existing Claude CLI session (if `claude` CLI is installed and logged in — no API key needed)
3. AWS Bedrock / Google Vertex (via env vars)

Authentication status is shown in the panel header. If no auth is configured, the panel shows a setup prompt with a link to settings.

### Panel Layout

The right panel mirrors the PageNavigator on the left. Layout change in `Pages.tsx`:

```
Before:
[left nav panel] [splitter] [page editor container]

After:
[left nav panel] [splitter] [page editor container] [splitter] [right claude panel]
```

The right panel is:
- **App-level** (not per-tab) — conversation survives tab switches
- **Collapsible** — hidden by default, toggled via toolbar button or keyboard shortcut
- **Resizable** — drag the splitter, default width 320px, min 240px
- **Width persisted** in app settings

### MCP Auto-Registration

When the user sends the first message (or on panel open), `ClaudeChatModel` reads the Persephone MCP server address from `app.settings` (the same HTTP server used by external MCP clients) and passes it as `options.mcpServers`:

```typescript
options.mcpServers = [{
    type: "http",
    url: `http://localhost:${mcpPort}`,
    name: "persephone",
}];
```

This means Claude automatically has access to all Persephone MCP tools without any user setup.

### Page Context Injection

The panel toolbar has a **"@ Insert Page"** button. When clicked, it appends a context block to the current input:

```
[Page: "filename.ts"]
```language
<current page content>
```
```

This is opt-in per message — the user decides when to share page content. The system prompt (always injected) contains only lightweight context: active page name, list of open page titles, and Persephone version.

## UI Components

### Chat Panel

```
┌─────────────────────────────────┐
│ Claude  [model: sonnet] [•] [×] │  ← header: model badge, status, close
├─────────────────────────────────┤
│                                 │
│  ┌─────────────────────────┐   │
│  │ User                    │   │  ← user message bubble
│  │ How do I add a new tab? │   │
│  └─────────────────────────┘   │
│                                 │
│  ┌─ Claude ───────────────────┐ │
│  │ You can use `app.pages`... │ │  ← assistant message (markdown)
│  │ ```typescript              │ │
│  │ app.pages.addPage(...)     │ │  ← code block (Monaco/shiki)
│  │ ```                        │ │
│  │ ▶ Tool: get_page_content   │ │  ← collapsible tool call card
│  └────────────────────────────┘ │
│                                 │
├─────────────────────────────────┤
│ [@] [↑page] .............. [▶] │  ← toolbar: @ context, insert, input, send
└─────────────────────────────────┘
```

### Message Types Rendered

| SDK Message | Rendered As |
|-------------|-------------|
| `user` | Right-aligned bubble |
| `assistant` (text) | Left-aligned with markdown |
| `tool_use` | Collapsible card: `▶ Tool: {name}` with JSON input |
| `tool_result` | Indented result under tool card (truncated if long) |
| `result` (error) | Error banner |
| Streaming | Cursor blink on last assistant message |

## Linked Tasks

| Task | Title | Status |
|------|-------|--------|
| US-385 | Right panel slot in Pages.tsx layout | Planned |
| US-386 | ClaudeChatModel + SDK integration (query, streaming, abort) | Planned |
| US-387 | Chat UI — message list, input, markdown rendering | Planned |
| US-388 | MCP auto-registration + page context injection | Planned |
| US-389 | Conversation persistence + session resume | Planned |
| US-390 | Settings: API key, model, system prompt | Planned |
| US-391 | PowerShell shortcut (Ctrl+\`) — open shell at cwd | Planned |

## Open Questions

1. **Session persistence scope:** Save conversation per working directory (cwd) or globally? Per-cwd feels more natural (like Claude Code's `.claude/` directory approach).
2. **System prompt customization:** Allow user to edit the system prompt in settings? Or keep it Persephone-managed only?
3. **Multiple conversations:** Support named conversation history (like Claude.ai) or just one active + clear? v1: one active conversation.
4. **Insert-to-page action:** Should Claude responses have an "Insert into active page" button? Useful but adds complexity — defer to v2.
5. **Panel placement:** Right side is the plan. But should it be a floating panel option too? Defer to v2.
6. **SDK in renderer vs worker:** The `query()` async iterator runs Node.js code. Persephone uses `nodeIntegration: true` so renderer can use Node.js directly — no worker needed for v1.
7. **`@anthropic-ai/claude-agent-sdk` vs `@anthropic-ai/claude-code`:** The former is the current package name. Verify which is available on npm and whether it bundles Claude or requires the CLI installed.

## Notes

### 2026-03-26 (initial)
- Epic originally focused on terminal editor + Claude CLI. Rejected: terminal is complex, diminishing returns vs VS Code.
- Agent SDK (`@anthropic-ai/claude-agent-sdk`) approach rejected at the time because Team subscriptions lack API keys.

### 2026-04-07 (revised)
- Completely rewritten after discovering SDK can use existing Claude CLI auth — no API key required.
- Terminal editor dropped in favor of dedicated chat panel with rich UI.
- Terminal access addressed via simple PowerShell shortcut (US-391).
- Right-side panel (app-global) chosen over per-tab secondary editor — chat context should survive tab navigation.
- MCP auto-registration via `options.mcpServers` is the key integration point — no `.mcp.json` required.

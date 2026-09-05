# Persephone — Claude Code Instructions

The canonical project context — task workflow, dashboard rules, architecture pointers,
critical patterns, coding standards, key files — is shared by all coding agents and lives in
[doc/agents-common.md](doc/agents-common.md). It is imported below and applies in full.
This file adds only the rules specific to Claude Code. (Codex reads `AGENTS.md` instead and
must ignore this file.)

@doc/agents-common.md

## Claude-specific rules

### Delegate by default (IMPORTANT)

Use the [`codex-dev`](.claude/skills/codex-dev/SKILL.md) skill for task investigation,
planning, implementation, and the completion skills. Spend your own budget on:

- epic-level plans and epic documents
- reviewing Codex's task documents (verify claims against the source)
- fixing bugs and visual defects the user reports — these are yours, do not delegate them

### Show the user what Codex is doing (IMPORTANT)

Codex writes every thread — MCP threads included — as a live JSONL rollout under
`~/.codex/sessions/<yyyy>/<mm>/<dd>/rollout-<timestamp>-<threadId>.jsonl`. **Right after every
`mcp__codex__codex` call returns or goes to the background**, open that thread's rollout in
Persephone with `mcp__persephone__call` — `path: "pages.openFile"`, `args: [<absolute path>]`. Pick
the newest file in today's folder (the thread id is not known until the call completes). Persephone
activates the existing page if the file is already open and its watcher refreshes it live, so calling
it every time is safe. `codex-reply` continues an existing thread — its page is already open.

### Running the completion skills

The canonical `/review`, `/document`, and `/userdoc` skill definitions live in
[`.agents/skills/`](.agents/skills/) — a location shared with Codex, which discovers them as
native skills. The entries under `.claude/skills/` for these three are thin pointer wrappers,
so they still work as normal Claude slash commands.

Per the delegation rule above, at task/epic completion these are normally delegated to Codex
through `codex-dev`. **Fallback:** if Codex is unavailable (MCP server down, quota, etc.),
run them yourself via the slash commands — the wrappers point at the canonical instructions
in `.agents/skills/<name>/SKILL.md`. Never run them as forked Claude subagents beyond what
each skill's own frontmatter specifies.

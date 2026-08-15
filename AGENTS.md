# Persephone Agent Guidelines

Read and follow [`CLAUDE.md`](CLAUDE.md) completely. It is the canonical source of
project context, architecture guidance, coding standards, and task workflow for
all coding agents working in this repository.

## Codex compatibility

- Treat references to "Claude" in `CLAUDE.md` as applying to Codex as well when
  they describe project knowledge, coding rules, documentation, or workflow.
- Files under `.claude/` and Claude slash commands are not automatically
  available to Codex. Follow the compatibility workflow below when completion
  requires `/review`, `/document`, or `/userdoc`.
- Codex-specific instructions in this file take precedence over conflicting
  agent-specific instructions in `CLAUDE.md`. Shared project rules in
  `CLAUDE.md` remain authoritative.

## Completion skills via sub-agents

When the task-completion rules in `CLAUDE.md` require `/review`, `/document`, or
`/userdoc`, the primary agent MUST NOT perform that skill's workflow itself.
Instead, it MUST spawn a separate sub-agent for each required skill:

- `/review`: the sub-agent must read
  [`.claude/skills/review/SKILL.md`](.claude/skills/review/SKILL.md) completely
  and follow it faithfully.
- `/document`: the sub-agent must read
  [`.claude/skills/document/SKILL.md`](.claude/skills/document/SKILL.md)
  completely and follow it faithfully.
- `/userdoc`: the sub-agent must read
  [`.claude/skills/userdoc/SKILL.md`](.claude/skills/userdoc/SKILL.md)
  completely and follow it faithfully.

Use one dedicated sub-agent per skill and run them in the completion order
defined by `CLAUDE.md`. The primary agent coordinates the sequence, supplies
the task scope and relevant implementation context, reviews each sub-agent's
result, and integrates or addresses its findings before continuing. If
`CLAUDE.md` says a skill does not apply (for example, for certain Rust tasks),
or the user explicitly asks to skip it, do not spawn that skill's sub-agent.

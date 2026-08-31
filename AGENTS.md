# Persephone Agent Guidelines (Codex)

Read and follow [`doc/agents-common.md`](doc/agents-common.md) completely. It is the
canonical source of project context, architecture guidance, coding standards, and task
workflow for all coding agents working in this repository.

Do **not** read the root `CLAUDE.md` — it contains only Claude-Code-specific rules layered
on top of the same shared document, and none of them apply to Codex. (Editor-scoped
`CLAUDE.md` files that the shared guidelines link to, such as
`src/renderer/uikit/CLAUDE.md`, remain authoritative references and should be read when
working in those areas.)

## Codex compatibility

- References to "the agent" in `doc/agents-common.md` apply to Codex.
- Every commit created by Codex MUST include this exact GitHub co-author trailer:
  `Co-authored-by: Codex <noreply@openai.com>`.
- The completion skills (`review`, `document`, `userdoc`) are native Codex skills,
  discovered from [`.agents/skills/`](.agents/skills/). Files under `.claude/` and Claude
  slash commands are not automatically available to Codex; the `.claude/skills/` copies of
  these three skills are thin pointers for Claude's use — the `.agents/skills/` versions
  are canonical.
- Codex-specific instructions in this file take precedence over conflicting
  instructions elsewhere. Shared project rules in `doc/agents-common.md` remain
  authoritative.

## Completion skills via sub-agents

When the task-completion rules in `doc/agents-common.md` require `/review`, `/document`, or
`/userdoc`, the primary agent MUST NOT perform that skill's workflow itself.
Instead, it MUST spawn a separate sub-agent for each required skill. Each sub-agent must
read its skill definition completely and follow it faithfully:

- `review`: [`.agents/skills/review/SKILL.md`](.agents/skills/review/SKILL.md)
- `document`: [`.agents/skills/document/SKILL.md`](.agents/skills/document/SKILL.md)
- `userdoc`: [`.agents/skills/userdoc/SKILL.md`](.agents/skills/userdoc/SKILL.md)

Use one dedicated sub-agent per skill and run them in the completion order
defined by `doc/agents-common.md`. The primary agent coordinates the sequence, supplies
the task scope and relevant implementation context, reviews each sub-agent's
result, and integrates or addresses its findings before continuing. If
`doc/agents-common.md` says a skill does not apply (for example, for certain Rust tasks),
or the user explicitly asks to skip it, do not spawn that skill's sub-agent.

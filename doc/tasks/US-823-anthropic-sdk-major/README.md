# US-823: Upgrade `@anthropic-ai/sdk` (0.86.1 → 0.111.0)

**Epic:** [EPIC-040 — Dependency & Platform Updates](../../epics/EPIC-040.md)
**Status:** Planned (placeholder — detailed plan pending)

> Placeholder. A full task doc (Goal → Background → Implementation plan → Concerns →
> Acceptance criteria) will be written following the CLAUDE.md "create a task" flow when this
> task is picked up. See [EPIC-040](../../epics/EPIC-040.md) for the upgrade inventory and rationale.

## Scope

Bump `@anthropic-ai/sdk` 0.86.1 → 0.111.0 (or latest at pickup).

## Risk / notes

- **Pre-1.0 package** — minor version bumps can and do carry breaking API changes. Read the
  SDK CHANGELOG between the two versions before touching code.
- Powers the script `ai` namespace and Claude sessions. Key consumers:
  - `src/renderer/scripting/api-wrapper/AiNamespace.ts`
  - `src/renderer/scripting/api-wrapper/ClaudeSession.ts`
- Verify streaming, tool use, and abort behavior still work after the bump (these are the
  surfaces most likely to shift across SDK majors).

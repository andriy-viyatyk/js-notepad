# US-1050 — Add an unregister_toolset MCP tool

**Status:** Open · **Epic:** none

## Goal

Give the agent a supported way to unregister a toolset, closing the asymmetry with
`create_toolset`.

## Background

The agent can `create_toolset` (with a user confirmation prompt) but has **no way to
unregister or remove one**. Cleaning up a scratch toolset required reaching into the internal
`toolsTrust.untrust` via `execute_script` — which is the tell that the public surface is
missing a member.

## Implementation plan

1. Add an MCP tool in `src/renderer/api/mcp/tool-commands.ts`, **beside `refresh_toolset`**,
   that unregisters a toolset by **root path**.
2. Folder deletion stays the agent's own `fs` call — this tool only unregisters.
3. Follow `refresh_toolset`'s parameter and error shape so the three tools read as a set.

## Concerns

**Does it need a confirmation prompt like registration?** Unregistering is less dangerous than
registering — it removes trust rather than granting it — so probably **no prompt**. Flagged
here rather than decided silently.

## Acceptance criteria

- `unregister_toolset` removes a toolset by root path.
- A toolset registered by `create_toolset` can be fully cleaned up without `execute_script`.
- `typecheck`, `lint`, `build-prod` clean.

# EPIC-090 deletion gate — two-model run

**Date:** 2026-09-06
**Gate file:** [qa/surfaces/gate.md](../surfaces/gate.md)
**Epic:** [EPIC-090](../../doc/epics/EPIC-090.md) — decision 6 (two model families), decision 7 (abort criteria)
**Purpose:** authorise (or refuse) the deletion of 32 MCP tools in US-1349.

Ten scenarios cover all 32 deleted-tool capabilities. Every scenario starts from `call` with **no
path**, and each records whether the overview led to the right branch and what wrong turns were
taken. `execute_tool` is deliberately not in the gate: its replacement is unproven and it is not
being deleted (EPIC-090 Needs user check 1).

| Pass | Model | Reaches Persephone via |
|---|---|---|
| 1 | Haiku, `mcp-test-agent-call` skill | `allowed-tools: mcp__persephone__call` — simulates call-only regardless of manifest; tests the documentation |
| 2 | Codex `gpt-5.6-luna` (high) | its own MCP client against the **real** reduced manifest, `PERSEPHONE_MCP_CALL_ONLY=1` |

---

## Pass 1 — Haiku (`mcp-test-agent-call`)


# US-823: Upgrade `@anthropic-ai/sdk` (0.86.1 → 0.111.0)

**Epic:** [EPIC-040 — Dependency & Platform Updates](../../epics/EPIC-040.md)
**Status:** Done (pending commit)

## Goal

Upgrade `@anthropic-ai/sdk` from 0.86.1 to 0.111.0 (or latest at pickup) and verify the one
consumer — the scripting `ai.ClaudeSession` wrapper — still compiles and runs correctly. Because
no Anthropic API key is available in this environment, the task defines an **offline verification
plan** that exercises the upgraded SDK end-to-end without contacting Anthropic.

## Background

### The only consumer

The SDK is used by exactly **one file**: `src/renderer/scripting/api-wrapper/ClaudeSession.ts`.
It is exposed to scripts as `ai.ClaudeSession` via
`src/renderer/scripting/api-wrapper/AiNamespace.ts` (`createAiNamespace()` returns
`{ ClaudeSession }`). Script-facing type declarations mirror the wrapper surface in
`src/renderer/api/types/ai.d.ts` and its editor-IntelliSense copy `assets/editor-types/ai.d.ts`
(the two must stay in sync). **Those `.d.ts` files are our own declarations — they do not import
from the SDK**, so they only change if the bump forces a change to `ClaudeSession`'s public API.

### Exact SDK surface used (this is what a bump can break)

`ClaudeSession.ts` uses a deliberately narrow slice of the SDK:

- **Lazy runtime load:** `require("@anthropic-ai/sdk").default` (bypasses Vite bundling; same
  pattern as the MCP connection manager).
- **Type imports:**
  - `import type AnthropicClass from "@anthropic-ai/sdk"`
  - from the **deep path** `@anthropic-ai/sdk/resources/messages/messages`:
    `Message`, `MessageParam`, `MessageCreateParamsNonStreaming`, `ContentBlock`,
    `ToolResultBlockParam`, `Tool`, `Tool.InputSchema`, `ToolChoice`.
- **Constructor:** `new Anthropic({ apiKey, dangerouslyAllowBrowser: true })`.
- **Call:** `client.messages.create(reqOptions)` — **non-streaming** only.
- **Request fields:** `model`, `max_tokens`, `messages`, `system`, `temperature`,
  `stop_sequences`, `tools` (`name` / `description` / `input_schema`), `tool_choice`
  (`{type:"auto"}` / `{type:"any"}` / `{type:"tool", name}`).
- **Response fields:** `response.content` (`ContentBlock[]`), `response.stop_reason`
  (`"tool_use"` sentinel drives the tool loop), block fields `.type` / `.name` / `.input` /
  `.id`, and text-block `.text`.

This is the stable core of the Messages API. It is non-streaming, uses no beta features, no
structured outputs, no agent/session SDK primitives.

### Breaking-change assessment (0.87 → 0.111)

Reviewed the SDK CHANGELOG across the range. **No breaking change is documented that touches our
surface.** Relevant notes:

- Structured-outputs `output_format` → `output_config` (v0.72, *before* our range) — **not used**.
- `system.message` streaming events (v0.106) — **not used** (we're non-streaming).
- v0.111 "gate session tool calls on `evaluated_permission`; bound idle by server `stop_reason`"
  — pertains to the SDK's own **agent/session** helpers, **not** the raw `messages.create` we call.

So the expected risk is **low**, concentrated in two spots that can only be confirmed
empirically against the installed 0.111 package:

1. **The deep import path** `@anthropic-ai/sdk/resources/messages/messages` — SDK majors
   sometimes reorganize the `resources` tree or the package `exports` map (cf. the MCP SDK
   resolver issue in US-822). If it moved, `npm run typecheck` fails immediately.
2. **Constructor options** — if `dangerouslyAllowBrowser` were renamed/removed, instantiation or
   typecheck fails.

## Implementation plan

> Work on `upcoming-v4.0.14` (per the EPIC-040 branch decision — no separate branches).

### Step 1 — Bump

Edit `package.json`: `"@anthropic-ai/sdk": "^0.86.1"` → `"^0.111.0"` (confirm latest at pickup).
Then `npm install`. Note: because the floor moves above the locked version, `npm install`
re-resolves. Verify with
`node -e "console.log(require('./node_modules/@anthropic-ai/sdk/package.json').version)"`.

### Step 2 — Typecheck (Tier 1, the primary gate)

`npm run typecheck`. This is where a pre-1.0 major bump breaks. It validates the deep import
path, all type imports, the request/response field usage, `Tool.InputSchema`, and `ToolChoice`.
Fix any fallout in `ClaudeSession.ts`:
- If the deep path moved, update the import (find the new path under
  `node_modules/@anthropic-ai/sdk/resources/`).
- If a type was renamed, update the alias.

### Step 3 — Lint + build (Tier 1)

`npm run lint` and `node scripts/build-prod.mjs`. Catches `exports`-map / packaging / bundling
changes for both the `require()` and the type imports (exactly the failure class US-822 hit with
the MCP SDK). If lint's `import/no-unresolved` trips on the deep path (older
`eslint-import-resolver-typescript`), coordinate with US-825 as we did for the MCP SDK — do
**not** silently disable the rule.

### Step 4 — Offline runtime harness (Tier 3, no key)

Write a throwaway Node script under `scratchpad/` (not committed) that proves the full round-trip
against a **local mock**, using the SDK's `ANTHROPIC_BASE_URL` support:

1. Start a tiny local `http.createServer` that responds to `POST /v1/messages` with a canned
   `Message` JSON: an assistant message with a `text` content block and
   `stop_reason: "end_turn"`; and a second canned response with a `tool_use` block +
   `stop_reason: "tool_use"` to drive the tool loop, then an `end_turn` follow-up.
2. Point the SDK at it: set `process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:<port>"` (the SDK
   honors this) and construct the session with a **dummy** key.
3. Drive the actual wrapper logic: `userMessage()` → `send()` with a registered tool, asserting:
   request serialization (model/messages/tools/tool_choice), response parsing
   (`textFromBlocks`), the `stop_reason === "tool_use"` loop, `tool_result` framing, and
   `lastResponse`.

Because `ClaudeSession`'s constructor only forwards `apiKey` + `dangerouslyAllowBrowser`, drive
the mock via the **`ANTHROPIC_BASE_URL` env var** (no code change needed) — do **not** add a
`baseURL` config field just for testing. This runs the entire upgraded-SDK request/response path
with zero Anthropic contact.

### Step 5 — App boot (Tier 2)

`npm start`; confirm clean boot (the SDK is lazy-loaded, so it won't load until a script
constructs `ai.ClaudeSession`, but boot confirms nothing in the bundle broke).

### Step 6 — Docs / sync check

If Step 2 forced any change to `ClaudeSession`'s public API, update **both**
`src/renderer/api/types/ai.d.ts` **and** `assets/editor-types/ai.d.ts` to match (keep them in
sync). If the wrapper surface is unchanged, no doc changes are needed.

## Offline test coverage — what is and isn't verified

| Layer | Verified offline? | How |
|-------|-------------------|-----|
| Type/API surface (imports, signatures, field names) | ✅ | `npm run typecheck` |
| Package `exports` / deep-path resolution / bundling | ✅ | lint + `build-prod` |
| Constructor contract | ✅ | harness instantiation |
| Request serialization (model/messages/tools/tool_choice) | ✅ | local mock harness |
| Response parsing + tool-use loop + `lastResponse` | ✅ | local mock harness |
| **Live Anthropic acceptance of the request** | ❌ | needs a real key — *but this depends on Anthropic's server, not the SDK version*, so it is out of scope for validating the bump |
| Streaming | n/a | wrapper is non-streaming |

## Concerns / Open questions

- **Deep import path stability** — the single most likely break. Confirm
  `@anthropic-ai/sdk/resources/messages/messages` still exists in 0.111 (it exists in 0.86); if
  moved, update the import. Caught by typecheck.
- **Lint resolver interaction** — if the deep path trips `import/no-unresolved` under the current
  resolver, pair the fix with US-825 (as with the MCP SDK), rather than disabling the rule.
- **No live-key validation** — accepted. The mock harness + typecheck cover everything the SDK
  *version* governs; live acceptance is independent of the client-library version.
- **Mock fidelity** — hand-craft the canned response to match the current Messages schema; if the
  new SDK changed a response field name, typecheck flags it first and the mock is updated to match.

## Verification log (2026-07-12)

Implemented on `upcoming-v4.0.14`. **Zero code changes required** — `ClaudeSession.ts` compiles
and runs unchanged against 0.111.0; the deep import path
`@anthropic-ai/sdk/resources/messages/messages` still exists.

| Check | Result |
|-------|--------|
| Installed version | ✅ `0.111.0` |
| Deep import path present | ✅ `resources/messages/messages.d.ts` exists in 0.111 |
| `npm run typecheck` | ✅ clean |
| `npm run lint` | ✅ clean — **no resolver issue** (unlike the MCP SDK in US-822; the deep path resolves for `import/no-unresolved`) |
| `node scripts/build-prod.mjs` | ✅ all targets built |
| **Offline mock harness** (real `ClaudeSession` + local server via `ANTHROPIC_BASE_URL`, dummy key) | ✅ **12/12 assertions** — text round-trip, tool-use loop, request serialization (model/messages/tools/tool_choice), response parsing (`textFromBlocks`/`lastResponse`), `tool_result` framing, and `tool-call`/`tool-result` events |
| `npm start` boot | ✅ clean (Widevine CDM ready; SDK is lazy-loaded so it doesn't load until a script constructs `ai.ClaudeSession`) |
| `ai.d.ts` sync | ✅ no change needed — wrapper public API unchanged |

The mock harness was a throwaway under the session scratchpad (not committed).

## Acceptance criteria

- [x] `package.json` shows `@anthropic-ai/sdk` at ^0.111.0; lockfile regenerated.
- [x] `npm run typecheck` passes (deep import path + all types resolve).
- [x] `npm run lint` passes (no resolver issue).
- [x] `node scripts/build-prod.mjs` builds all targets.
- [x] Offline mock harness drives `ClaudeSession.send()` through a text response **and** a
      tool-use round successfully (12/12 assertions).
- [x] `npm start` boots cleanly.
- [x] `ai.d.ts` (both copies) confirmed unchanged — wrapper public API unchanged.

## Files changed (expected)

| File | Change |
|------|--------|
| `package.json` | `@anthropic-ai/sdk` → ^0.111.0 |
| `package-lock.json` | Regenerated. |
| `src/renderer/scripting/api-wrapper/ClaudeSession.ts` | Only if typecheck requires (import path / type-name fixes). Likely none. |
| `src/renderer/api/types/ai.d.ts` + `assets/editor-types/ai.d.ts` | Only if the wrapper's public API changed (keep in sync). Likely none. |

## Files that need NO changes

- `src/renderer/scripting/api-wrapper/AiNamespace.ts` — just re-exports `ClaudeSession`.
- Any other source — the SDK has a single consumer.

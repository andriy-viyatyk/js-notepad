# US-683: Mneme — rename `wiki_*` tools to bare names (`read`, `write`, …) + de-wiki wording

**Epic:** [EPIC-032 — Mneme](../../epics/EPIC-032.md) · Phase 4 (tool-surface polish)
**Status:** Implemented (unreviewed) — verified 2026-06-15 (`cargo build --release` + `cargo test` + `tsc` + `eslint` all clean)

## Goal

Rename every MCP tool from `wiki_*` to a **bare verb/noun** (`read`, `write`, `edit`, `glob`, …) and
neutralize the "wiki" wording in descriptions/guide. Two wins:

1. **Removes the misleading "wiki" implication.** A root can be any markdown folder — a worklog, notes,
   task tracker — not just a "wiki". The all-`wiki_` naming makes an agent hesitate ("is this non-wiki
   root in scope?").
2. **Makes the tools a clean mirror of the agent's native filesystem tools.** MCP namespaces every tool
   by server name, so the agent already sees `mcp__mneme__<tool>`. Bare names yield
   `mcp__mneme__read` ≈ `Read`, `mcp__mneme__write` ≈ `Write`, `mcp__mneme__glob` ≈ `Glob` — reinforcing
   the "Mneme behaves like a filesystem" model (the same principle behind US-686's image-aware `read`).

A `mneme_*` prefix is explicitly **rejected**: the server namespace already supplies "mneme", so
`mcp__mneme__mneme_read` would be redundant. Bare names are the cleanest target.

## Background

- **The namespace is real and observable.** In a connected Claude Code session the tools appear as
  `mcp__mneme__wiki_read`, `mcp__mneme__wiki_upload`, … — the `mcp__<server>__` prefix is added by the
  client, so "mneme" is already present. (The server is registered under the name `mneme`.)
- **rmcp derives the tool name from the handler method name.** In
  [`mneme/src/mcp/server.rs`](../../../mneme/src/mcp/server.rs) each tool is
  `#[tool(description = …)] async fn wiki_X(…)` with **no** explicit `name=`, and the live tool list
  shows the exposed name equals the method name (`wiki_read`). So **renaming the method renames the
  tool** — no attribute needed. (Fallback if any bare name collides with a trait/macro identifier:
  keep the method name and add `#[tool(name = "X", description = …)]`.)
- **The tool layer is thin.** Each `MnemeServer::wiki_X` wrapper delegates to a `ServerState` method
  whose name is **already** non-wiki (`read_doc`, `write_doc`, `glob`, `grep`, `search`, `tree`, …).
  Renaming only the wrapper methods leaves `ServerState` — and therefore the **tests**, which call
  `ServerState` directly — untouched.
- **The only hardcoded consumer is Persephone itself.** External agents (e.g. the Evergreen agent that
  raised this) discover tools at runtime, so they simply see the new names — nothing to migrate. The
  Persephone renderer hardcodes the names by string in 5 files (mapped below); those change in the same
  pass. **No deprecated `wiki_*` aliases** — clean rename, single commit.

## Rename table (19 tools)

| Current (`server.rs` line) | New | Current | New |
|---|---|---|---|
| `wiki_read` (77) | `read` | `wiki_tags` (138) | `tags` |
| `wiki_write` (89) | `write` | `wiki_add_root` (143) | `add_root` |
| `wiki_upload` (95) | `upload` | `wiki_remove_root` (148) | `remove_root` |
| `wiki_edit` (101) | `edit` | `wiki_list_roots` (154) | `list_roots` |
| `wiki_delete` (107) | `delete` | `wiki_root_config` (159) | `root_config` |
| `wiki_glob` (113) | `glob` | `wiki_reindex` (164) | `reindex` |
| `wiki_grep` (118) | `grep` | `wiki_status` (195) | `status` |
| `wiki_search` (123) | `search` | `wiki_index_delete` (200) | `index_delete` |
| `wiki_tree` (128) | `tree` | `wiki_model_update` (206) | `model_update` |
| `wiki_timeline` (133) | `timeline` | | |

## Implementation plan

All Rust paths under `mneme/`. **Rust task** — `/review` & `/userdoc` do not apply; verify with
`cargo build --release` + `cargo test`. The renderer changes (§5) are TypeScript.

### 1. Rename the 19 tool methods — `mneme/src/mcp/server.rs`

Rename each `async fn wiki_X` → `async fn X` per the table (the `#[tool_router] impl MnemeServer`
block, lines 77–206). The method bodies are unchanged — they still delegate to the same `ServerState`
methods. Verify `cargo build` (watch for any bare-name collision; fall back to `#[tool(name="X")]`
on the original method if one appears).

### 2. De-wiki the tool descriptions — `server.rs`

In the same `#[tool(description = …)]` strings, replace wiki-specific phrasing with neutral terms:
"wiki file/document" → "document", "wiki root"/"the wiki" → "root" / "knowledge base". Keep the
"≈ Read/Write/Edit/Glob/Grep" parallels. Where helpful (e.g. `read`/`write`/`glob` top-level), note a
root may be a wiki, notes, **worklog**, or any markdown folder.

### 3. `INSTRUCTIONS` const — `server.rs` (line ~29)

Update the tool list to the new names and soften the "wiki" framing: "Mneme is a markdown **knowledge
base**" and "a root may be a wiki, notes, worklog, or any markdown folder". Keep it concise.

### 4. Guide + README — `mneme/assets/wiki-guide.md`, `mneme/README.md`

- **`wiki-guide.md`**: rename every `wiki_*` reference to the bare name; neutralize the "wiki" wording
  (title, prose) to "knowledge base / root / document", noting non-wiki roots are in scope. *(Optional,
  low value: rename the file `wiki-guide.md` → `guide.md` and update `include_str!(".../wiki-guide.md")`
  in `server.rs`. The resource URI is already `mneme://guide`. Skip unless doing a clean sweep.)*
- **`mneme/README.md`**: update the "Tools:" line (line ~59) to the bare names; de-wiki the surrounding
  prose.

### 5. Persephone renderer call sites (TypeScript)

Update the hardcoded `callTool({ name: "wiki_X" })` strings to the bare names. Functional sites:

| File | `name:` strings to update |
|---|---|
| `src/renderer/content/providers/MnemeProvider.ts` | `wiki_upload`→`upload` (:54), `wiki_write`→`write` (:60) |
| `src/renderer/content/tree-providers/MnemeTreeProvider.ts` | `wiki_tree`→`tree` (:59) |
| `src/renderer/api/mneme-status.ts` | `wiki_status`→`status` (:117) |
| `src/renderer/editors/mneme-root/MnemeRootEditorModel.ts` | `wiki_list_roots`→`list_roots` (:209), `wiki_tags`→`tags` (:281), `wiki_search`→`search` (:321) |
| `src/renderer/editors/mneme-config/MnemeConfigEditorModel.ts` | `wiki_status` (:180), `wiki_add_root` (:261), `wiki_remove_root` (:281), `wiki_reindex` (:300), `wiki_root_config` (:358, :374), `wiki_model_update` (:398), `wiki_index_delete` (:469) |

Comments / type-doc references mentioning `wiki_*` (e.g. in `mnemeTypes.ts`, model docstrings) may be
swept for cleanliness in the same pass — non-functional, so optional.

### 6. Verify

- `cargo build --release` + `cargo test` (tests call `ServerState`, not the wrappers → should pass
  unchanged).
- `tsc --noEmit` + `eslint` on the changed renderer files.
- Smoke: rebuild + **reconnect mneme**, open a Mneme root in Persephone — search, tree, status, and the
  config editor must still function under the new names.

## Concerns / decisions

1. **No `wiki_*` aliases.** Only Persephone hardcodes the names (updated here); external agents
   auto-discover. Aliases would be permanent dead surface — skip them.
2. **Bare names rely on client namespacing.** Claude Code namespaces (`mcp__mneme__`), and Persephone's
   own client talks to a single mneme connection (no cross-server collision). A non-namespacing client
   would make `read`/`write` dangerously generic — but that's the client's responsibility and all real
   ones namespace. Acceptable.
3. **Method-rename vs `#[tool(name=)]`.** Renaming methods is cleaner (removes "wiki" from the code too)
   and is the plan; the attribute form is the documented fallback for any name collision.
4. **Tests are unaffected** — they exercise `ServerState` methods (`read_doc`, `glob`, …), which keep
   their names. No test edits expected.
5. **Live sessions go stale.** Any already-connected agent session (including a Claude Code chat) holds
   the old `mcp__mneme__wiki_*` tool list until mneme is rebuilt and the client reconnects. Reconnect
   before further live testing.

## Acceptance criteria

- [x] All 19 tool methods renamed to bare names; no `wiki_`-prefixed tool remains in `server.rs`
      (compiles clean). **Live-verified 2026-06-15** after mneme rebuild + reconnect: all 19 resolve as
      `mcp__mneme__<bare>`, no `wiki_*` remains; smoke-tested status/list_roots/tree/write/read/glob/
      tags/edit/grep/search(hybrid)/delete round-trip on TestWiki — all OK.
- [x] Tool descriptions, `INSTRUCTIONS`, the guide, and the README use neutral "root / knowledge base /
      document" wording and note a root may be a worklog/notes/any markdown folder.
- [x] Persephone's renderer call sites use the new names (`tsc` + `eslint` clean). *Live UI check
      (open a Mneme root → search/tree/tags/status/config) pending mneme rebuild + reconnect.*
- [x] `cargo build --release` + `cargo test` pass (23+11+1 tests ok); `tsc --noEmit` + `eslint` clean.

## Files changed (summary)

| File | Change |
|------|--------|
| `mneme/src/mcp/server.rs` | rename 19 tool methods; de-wiki descriptions; update `INSTRUCTIONS` |
| `mneme/assets/wiki-guide.md` | bare tool names + de-wiki wording *(optional: rename → `guide.md`)* |
| `mneme/README.md` | Tools line + prose |
| `src/renderer/content/providers/MnemeProvider.ts` | `upload`, `write` |
| `src/renderer/content/tree-providers/MnemeTreeProvider.ts` | `tree` |
| `src/renderer/api/mneme-status.ts` | `status` |
| `src/renderer/editors/mneme-root/MnemeRootEditorModel.ts` | `list_roots`, `tags`, `search` |
| `src/renderer/editors/mneme-config/MnemeConfigEditorModel.ts` | `status`, `add_root`, `remove_root`, `reindex`, `root_config`, `model_update`, `index_delete` |
| `src/renderer/editors/mneme-config/mnemeTypes.ts`, `MnemeRootEditorView.tsx`, `results-to-markdown.ts`, `RootsPanel.tsx`, `src/main/mneme-service.ts` | stale `wiki_*` tool-name **comment** references swept to bare names |
| `mneme/src/{config,lib}.rs`, `indexer/{mod,job}.rs`, `index/mod.rs`, `model/mod.rs`, `mcp/{mod,results}.rs`, `store/{mod,walk,grep,glob,roots,edit}.rs` | stale `wiki_*` tool-name **doc-comment** references swept to bare names (~55 refs); one agent-facing error string in `mcp/mod.rs` updated too — all comment-only, no functional change |

The doc-comment sweep (last two rows) was an added cleanliness pass beyond the minimal rename, so
the codebase carries no stale `wiki_*` tool references. It is comment-only and build-verified.

### Files that need NO functional changes

- `mneme/src/mcp/mod.rs` `ServerState` methods (`read_doc`, `write_doc`, `glob`, …) — already non-wiki;
  only the `server.rs` wrappers are renamed (mod.rs doc-comments were swept for accuracy only).
- `mneme/src/mcp/params.rs` / `results.rs` — param/result **types** are not tool names (results.rs had
  one comment ref swept).
- `mneme/tests/*` — exercise `ServerState`, not the renamed wrappers; all 35 tests pass unchanged.

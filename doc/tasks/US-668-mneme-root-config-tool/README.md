# US-668 — Mneme `wiki_root_config` tool (live per-root include/ignore)

**Epic:** [EPIC-032 — Mneme (vector memory)](../../epics/EPIC-032.md) · Phase 5 prerequisite
**Status:** Implemented — pending manual test (`cargo build --release` + `cargo test` green; review deferred to epic close)
**Blocks:** [US-664 — Mneme config & monitoring editor](../US-664-mneme-config-editor/README.md) (its include/ignore "Filters" section consumes this tool)

> **Rust task.** Per project rules, `/review` and `/userdoc` do **not** apply to `mneme/`. Verify with `cargo build --release` + `cargo test`. Update `mneme/`'s own docs (agent guide, README pointer) instead.

## Goal

Add a single MCP tool, `wiki_root_config`, that lets a client **read** a root's `include`/`ignore` glob lists and **update** them **live** — re-applying the walk filters and the file watcher and reconciling the index — without restarting the Mneme process or tearing down the index. This closes the only control-plane gap that blocks US-664's per-root filter editing (today include/ignore are only in `mneme.toml`, read at startup/add, with no MCP read or write path).

## Background

Verified against `mneme/src/` (file:line below). Key facts that make this small:

- **`RootConfig`** (`mneme/src/config.rs:31-43`): `{ name, folder, include: Vec<String> (default `["*.md"]` via `default_include()` at :45), ignore: Vec<String> (default `[]`) }`. `config::save` (`config.rs:115-122`) serializes the whole `Config` to TOML; `persist_roots` (`mcp/mod.rs:684-689`) snapshots `registry().configs()` and calls it after every root mutation.
- **Filters are never cached.** `walk_root(root: &RootConfig)` (`mneme/src/store/walk.rs:33-87`) **rebuilds** the include allowlist (`GitignoreBuilder` post-filter) and the ignore overrides (`OverrideBuilder` + `DEFAULT_IGNORES` at :31) from `root.include`/`root.ignore` on **every call**. Its only three call sites all pass a `&RootConfig`: `indexer/mod.rs:166`, `indexer/mod.rs:232` (`reconcile_job`), `store/mod.rs:166`. ⇒ **Mutating the `RootConfig` is sufficient; no matcher to invalidate.**
- **Three copies of each root's config exist** and must all be updated on a SET:
  1. `RootRegistry.roots: Vec<RootConfig>` inside `DocumentStore` (`store/roots.rs:16-18`) — pure config/validation; has `add`/`remove`/`get`/`configs` but **no update method**.
  2. `IndexManager.roots: Vec<RootConfig>` (`indexer/mod.rs:382`) — the live serving copy.
  3. The `RootConfig` **captured by value** into the watcher's debounce closure (`watcher/mod.rs:46-83`, captured at `:55`). The watcher filters events only by `DEFAULT_IGNORES` (`is_watch_ignored`, `:61`) — include/ignore matter only inside the reconcile it triggers — but its captured copy is a **snapshot**, so a filter change needs the watcher **restarted** (drop + `RootWatcher::start`) to avoid stale filters on watcher-triggered reconciles.
- **Reconcile** picks up the change: `JobManager::reconcile_blocking` (`indexer/job.rs:105-119`) runs `reconcile_job` (`indexer/mod.rs:223-323`) which calls `walk_root(cfg)` fresh. Reconcile adds newly-included docs **and deletes** docs that no longer match (its `ReconcileStats` has `deleted`). This is exactly what a filter change needs.
- **MCP tool wiring pattern** (mirror `wiki_add_root`): params struct in `mcp/params.rs:147-153` (`#[derive(Debug, Deserialize, schemars::JsonSchema)]`); result struct in `mcp/results.rs:94-98` (`#[derive(Debug, Serialize)]`); `#[tool(description=...)]` handler in `mcp/server.rs:120-123` calling `self.state.<method>(p).await.map_err(to_mcp)` wrapped in `structured(...)` (`server.rs:56-59`); the `ServerState` method in `mcp/mod.rs` runs blocking work inside `blocking(move || {...}).await`. The `#[tool_router]`/`#[tool_handler]` macros auto-register — no manual dispatch list. Tool descriptions are the `#[tool(description=...)]` string; the agent guide is `mneme/assets/wiki-guide.md` (served as `mneme://guide`).
- **Tests:** `mneme/tests/mcp.rs` (`#[tokio::test]`, calls `ServerState` methods directly via a `setup(name)` temp-root harness; see `add_remove_list_roots_persists_config` at :272). `tests/document_store.rs` + `tests/indexer.rs` for walk/reconcile-level assertions.

## Implementation plan

### Tool contract

`wiki_root_config { root: string, include?: string[], ignore?: string[] }`
- **GET** — both `include` and `ignore` omitted: returns current config, no mutation, no persist, no reconcile.
- **SET** — either provided: omitted field = **unchanged**, provided field replaces (so `include: []` is an explicit "index nothing", distinct from omitted). Validates, applies live, persists, reconciles.
- Result (both modes): `{ name, folder, include, ignore }` — the effective config after the call.

### Steps

1. **`mcp/params.rs`** — add:
   ```rust
   #[derive(Debug, Deserialize, schemars::JsonSchema)]
   pub struct RootConfigParams {
       /// Registered root name.
       pub root: String,
       /// New include allowlist globs. Omit (with ignore) to read current config.
       pub include: Option<Vec<String>>,
       /// New ignore globs (gitignore-style). Omit (with include) to read current config.
       pub ignore: Option<Vec<String>>,
   }
   ```

2. **`mcp/results.rs`** — add:
   ```rust
   #[derive(Debug, Serialize)]
   pub struct RootConfigResult {
       pub name: String,
       pub folder: String,
       pub include: Vec<String>,
       pub ignore: Vec<String>,
   }
   ```

3. **`store/roots.rs`** — add `RootRegistry::update_filters(&mut self, name, include, ignore) -> Result<RootConfig>`: find entry by name (reuse the same unknown-root error as `remove`); replace `include`/`ignore` in place; return the cloned updated `RootConfig`.

4. **`indexer/mod.rs`** — add `IndexManager::update_root_filters(&mut self, name, include, ignore) -> Result<Arc<RootIndex>>`:
   - Update the matching entry in `self.roots` (`:382`).
   - **Restart the watcher**: `self.watchers.remove(name)` (drops/stops the old debouncer), then `RootWatcher::start(updated_cfg.clone(), Arc::clone(&ri), self.embed.clone(), Arc::clone(&self.jobs), self.cancel.clone())` and re-insert. (Brief miss-window between drop and the post-call reconcile is closed by that reconcile.)
   - Return the `Arc<RootIndex>` handle for the caller's reconcile.

5. **`mcp/mod.rs`** — add `ServerState::root_config(self: &Arc<Self>, p: RootConfigParams) -> Result<RootConfigResult>` inside `blocking(move || {...})`:
   - **GET** (`p.include.is_none() && p.ignore.is_none()`): read from `store.read().registry().get(&p.root)`; return its `{name, folder, include, ignore}`. Unknown root → error.
   - **SET**: resolve `new_include = p.include.unwrap_or(existing.include.clone())`, `new_ignore = p.ignore.unwrap_or(existing.ignore.clone())`.
     a. **Validate globs first** (build a throwaway `GitignoreBuilder`/`OverrideBuilder` from the new lists; on error return without mutating — never persist an unreconcilable config).
     b. `store.write().registry_mut().update_filters(...)`.
     c. `index.lock().update_root_filters(...)` → `Arc<RootIndex>`.
     d. `persist_roots(&st)`.
     e. `jobs.reconcile_blocking(&h, &updated_cfg, &st.embed, CancellationToken::new(), |_| {})` (re-walk: add newly-included, delete now-excluded).
     f. return the effective `RootConfigResult`.

6. **`mcp/server.rs`** — add inside the `#[tool_router]` impl block:
   ```rust
   #[tool(description = r##"Read or update a wiki root's include/ignore glob filters live. \
   Omit both include and ignore to read the current config. Provide either to update it: the \
   given list replaces that filter (include=[] means index nothing), the omitted one is kept. \
   Updates apply immediately — filters are re-applied, the watcher restarted, and the root \
   reindexed (newly-matching files are added, no-longer-matching files removed). \
   include defaults to ["*.md"]; ignore is gitignore-style on top of built-in defaults \
   (.git, .mneme, node_modules, target, dist, build)."##)]
   async fn wiki_root_config(&self, Parameters(p): Parameters<RootConfigParams>)
       -> std::result::Result<CallToolResult, McpError> {
       structured(self.state.root_config(p).await.map_err(to_mcp)?)
   }
   ```

7. **`mneme/assets/wiki-guide.md`** — add a `wiki_root_config` bullet under the Management/control-plane section, documenting GET vs SET and that a SET reindexes the root.

8. **Tests** (`mneme/tests/mcp.rs`) — new `#[tokio::test]`s using `setup()`:
   - GET returns defaults (`include: ["*.md"]`, `ignore: []`) for a fresh root.
   - SET `include: ["*.md","*.txt"]` then GET reflects it; a `.txt` file under the root becomes searchable/indexed after the call (assert via `wiki_status` docCount or `wiki_glob`).
   - SET narrowing `include` removes previously-indexed docs (docCount drops).
   - SET persists: re-load `Config` from the saved TOML and assert the new lists are present.
   - Unknown root → error. Invalid glob → error and config unchanged (not persisted).

## Concerns / open questions (with proposed resolutions)

1. **Watcher restart miss-window.** Dropping the old watcher before `start` leaves a tiny window where disk events aren't observed. **Resolution:** the mandatory post-update `reconcile_blocking` (step 5e) re-walks the whole root and reconciles, so any change in that window is caught. No special handling needed.
2. **Reconcile cost on large roots.** SET runs a blocking full reconcile (same as `wiki_add_root` does today), which can re-embed newly-included docs. **Resolution:** acceptable and consistent with `add_root`; US-664's editor wraps the call in a progress overlay. (Could emit progress notifications later, like `wiki_reindex`, if needed — not in scope.)
3. **Empty `include`.** ~~means "index nothing"~~ **Corrected during implementation:** `walk_root` falls back to the default `["*.md"]` when `include` is empty (walk.rs), so an empty include does **not** disable a root — it reverts to markdown-only. **Resolution:** keep `walk_root`'s existing fallback (changing it is out of scope/risky) and document the fallback in the tool description; "disable a root" is done via `wiki_remove_root`, not an empty include.
4. **Partial update semantics.** Chosen: omitted field = unchanged; both omitted = GET. `Option<Vec<String>>` cleanly distinguishes "omitted" from "set to empty". **Resolution:** as specified — no ambiguity.
5. **Concurrent reindex on the same root.** `reconcile_blocking` already waits for any in-flight pass (single-flight per root, `job.rs:105-119`). **Resolution:** rely on existing single-flight; no new locking.

## Acceptance criteria

- [x] `wiki_root_config` is listed as an MCP tool with a clear description and appears in `wiki-guide.md`.
- [x] GET (both args omitted) returns `{ name, folder, include, ignore }` for an existing root; unknown root errors. *(test: `root_config_get_returns_defaults`, `root_config_unknown_root_errors`)*
- [x] SET updates `include`/`ignore` (omitted field preserved), applies live (no restart), persists to `mneme.toml`, and reconciles — newly-matching files indexed, no-longer-matching files removed. *(test: `root_config_set_filters_reindex_and_persist`)*
- [x] Invalid globs are rejected before any mutation/persist. *(test: `root_config_invalid_glob_rejected`)*
- [x] The watcher uses the new filters after a SET — the watcher is dropped + restarted with the updated `RootConfig` in `IndexManager::update_root_filters`, and `walk_root` re-reads filters every pass. *(covered by code; manual disk-event check pending)*
- [x] `cargo build --release` and `cargo test` pass (12 mcp tests incl. 4 new; full suite green); no new clippy warnings.

## Implementation summary

Implemented per plan, renderer-free, no behavior changes outside the new tool:
- `mcp/params.rs` `RootConfigParams` · `mcp/results.rs` `RootConfigResult` · `mcp/server.rs` `#[tool] wiki_root_config` · `mcp/mod.rs` `ServerState::root_config` (GET short-circuits; SET validates → updates registry + index → restarts watcher → persists → `reconcile_blocking`).
- `store/roots.rs` `RootRegistry::update_filters` · `indexer/mod.rs` `IndexManager::update_root_filters` (updates live config + restarts watcher, returns handle) · `store/walk.rs` `validate_filters` (builds the same matchers without walking).
- `assets/wiki-guide.md` documents the tool.
- **Note (vs original plan):** an empty `include` does **not** mean "index nothing" — `walk_root` falls back to the default `["*.md"]` on an empty include (walk.rs), so the tool description documents that fallback rather than promising an empty-include "disable". Concern 3 updated accordingly.

**Manual test:** point the MCP Inspector at `http://localhost:7700/mcp`, call `wiki_root_config {"root":"<name>"}` (GET), then `wiki_root_config {"root":"<name>","include":["*.md","*.txt"]}` (SET) and confirm via `wiki_status` that the doc count changes and `mneme.toml` is updated.

## Files changed (planned)

| File | Change |
|------|--------|
| `mneme/src/mcp/params.rs` | add `RootConfigParams` |
| `mneme/src/mcp/results.rs` | add `RootConfigResult` |
| `mneme/src/mcp/server.rs` | add `#[tool] wiki_root_config` handler |
| `mneme/src/mcp/mod.rs` | add `ServerState::root_config` (GET/SET) |
| `mneme/src/store/roots.rs` | add `RootRegistry::update_filters` |
| `mneme/src/indexer/mod.rs` | add `IndexManager::update_root_filters` (update `roots` + restart watcher) |
| `mneme/assets/wiki-guide.md` | document `wiki_root_config` |
| `mneme/tests/mcp.rs` | tests for GET/SET/persist/errors |

### Files needing NO change
- `mneme/src/store/walk.rs` — `walk_root` already reads filters fresh from `RootConfig`; no caching to update.
- `mneme/src/indexer/job.rs` — `reconcile_blocking` is reused as-is.
- `mneme/src/watcher/mod.rs` — `RootWatcher::start` is reused as-is; only the *caller* (IndexManager) restarts it.
- Persephone side (`src/...`) — none here; the consuming editor is US-664.

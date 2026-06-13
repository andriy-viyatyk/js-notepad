# US-655: [Phase 1] MCP server (Streamable HTTP, loopback, text-search mode) + agent guide

**Epic:** [EPIC-032 — Mneme (Wiki / Vector Memory service)](../../epics/EPIC-032.md)
**Status:** Implemented (Phase 1) — `cargo build --release` clean (no warnings); full suite **54 tests** (13 + 19 + 4 + 7 + 11) pass; `mneme serve` verified live (loopback bind, single stdout readiness line, MCP `initialize` + capabilities round-trip). Awaiting epic-level review.
**Created:** 2026-06-13

## Goal

Turn Mneme from a CLI/library into a running **MCP server over Streamable HTTP** (loopback `127.0.0.1`, no auth), exposing the full `wiki_*` tool surface in **text-search mode** (FTS5 only — no embeddings) plus document/attachment **resources** and a `wiki_*` **agent guide**. This is the Phase-1 milestone: a usable text-search wiki, fully driveable via MCP — connect the HTTP endpoint to a Claude chat / MCP Inspector to test.

**Explicitly NOT in scope** (deferred to later tasks, per the epic phasing):
- Embeddings / vector / hybrid search + RRF (US-657/US-658) — `wiki_search` is **FTS-only** here.
- Model download / provisioning (US-656) — `wiki_model_update` is a clear-notice **stub**.
- Concurrency & responsiveness: reader pool, priority embed worker, **cancellable reindex job + MCP progress notifications + backpressure** (US-659) — `wiki_reindex` runs a **synchronous** reconcile and returns stats.
- Resource **subscriptions** (`resources/subscribe` + `notifications/resources/updated` / `list_changed`) and `MnemeProvider`/`MnemeTreeProvider` (US-661/662) — resources here are **read/list only**; the server does **not** advertise the `subscribe` capability.
- Bearer/OAuth (networked/Azure) — loopback-only, no auth (backlog).

## Background

### What exists (built in US-652/653/654)

`mneme/` is a self-contained Cargo crate (`persephone-mneme`, `[[bin]] mneme`, `[lib] persephone_mneme`). The pieces US-655 wires together:

- **Document Store** — `src/store/mod.rs` `DocumentStore` (`&self`, synchronous):
  - `open(&Config) -> Result<Self>`, `from_roots(Vec<RootConfig>)`, `registry() -> &RootRegistry`, `registry_mut() -> &mut RootRegistry`.
  - `read(addr, offset?, limit?) -> Result<String>`, `read_bytes(addr) -> Result<Vec<u8>>` (binary attachments), `write(addr, content)`, `edit(addr, old, new, replace_all)`, `delete(addr)`.
  - `list(path?) -> Result<Vec<String>>` (addresses), `glob(pattern, path?) -> Result<Vec<String>>`, `grep(pattern, path?, &GrepOptions) -> Result<GrepResult>`.
  - All `{root}/{path}` addressing resolves through `RootRegistry` → `WikiAddress` (no-traversal safe).
- **RootRegistry** — `src/store/roots.rs`: `from_config`, `get(name)`, `configs() -> &[RootConfig]`, `resolve(&WikiAddress)`, **`add(folder, name?) -> Result<&RootConfig>`** and **`remove(name) -> Result<()>`** (both exist, with full validation: non-empty/normalized name, no `/\` /whitespace, unique, folder exists, no path overlap).
- **WikiAddress** — `src/store/address.rs`: `{ root: String, rest: String }`, `parse(s) -> Result<Self>` (splits on first `/`; `rest` may be empty = the root itself; rejects `.`/`..`), `resolve(root_folder) -> Result<PathBuf>`.
- **grep types** — `src/store/grep.rs`: `OutputMode { FilesWithMatches, Content, Count }`; `GrepOptions { ignore_case: bool, context: usize, output_mode: OutputMode }` (`Default`); `ContentLine { line_number: usize, text: String, is_match: bool }`; `GrepResult { Files(Vec<String>), Counts(Vec<(String,usize)>), Content(Vec<(String,Vec<ContentLine>)>) }`.
- **Index** — `src/index/mod.rs` `IndexDb` (rusqlite `Connection`, `Send + !Sync`; shared as `Arc<Mutex<IndexDb>>`):
  - `open_or_create(root_name, root_folder, &ModelConfig)`, `root_name()`, `meta() -> Result<Meta{model,precision,dims,schema_version}>`.
  - `upsert_document(rel, &ParsedDoc, content_hash, mtime, size)`, `delete_document(rel)`, `doc_state(rel) -> Option<DocState{content_hash,mtime,size}>`, `all_doc_paths() -> Vec<String>`, `update_doc_stat(rel, mtime, size)`, `doc_count() -> usize`.
  - `search_fts(query, limit) -> Vec<FtsHit{address,heading:Option<String>,snippet}>` — **minimal seed**: `chunks_fts MATCH`, ordered by FTS5 `rank`, snippet via `snippet(...)`. **No title/tags/score, no filters yet.**
  - free fn `content_hash(&[u8]) -> String`.
  - Schema (`src/index/schema.rs`, `SCHEMA_VERSION = 1`): `documents(id, path, title, created, verified, content_hash, mtime, size)`, `doc_tags(doc_id, tag)`, `chunks(id, doc_id, ordinal, heading, text)`, `chunks_fts(text)` (rowid = chunks.id), `chunks_vec(embedding float[768])` (empty), `meta(key,value)`.
  - Versioned path (`src/index/path.rs`): `model_id(&ModelConfig) -> String` (`gte-multilingual-base-int8`), `index_db_path(root_folder, model_id) -> PathBuf` (`<root>/.mneme/<modelId>/index-v<schemaVer>.db`), `ensure_mneme_dir(root_folder)`. **Verify these are reachable** — `index/mod.rs` may declare `mod path;` privately; US-655 needs `pub mod path;` (or re-exports) for `wiki_status`/`wiki_index_delete`.
- **markdown** — `src/markdown/mod.rs`: `parse_document(filename_stem, content, birthtime: Option<SystemTime>, mtime: SystemTime) -> ParsedDoc { meta: EffectiveMeta{title,tags,created:Option<String>,verified:Option<String>}, chunks: Vec<Chunk{ordinal,heading,text}> }`. Used for `wiki_read`'s parsed-frontmatter view.
- **Indexer** — `src/indexer/mod.rs`:
  - `index_one(&IndexDb, rel, abs) -> Result<IndexOutcome>` — the single-file primitive `wiki_write`/`wiki_edit` call after writing (mtime+size fast-path → content-hash dedup → upsert/refresh).
  - `reconcile_root(&IndexDb, &RootConfig) -> Result<ReconcileStats>`, `ReconcileStats{scanned,indexed,refreshed,skipped,deleted,errors}`.
  - `IndexManager { roots: Vec<RootConfig>, dbs: HashMap<String, Arc<Mutex<IndexDb>>>, watchers: Vec<RootWatcher> }`: `open`, `handle(root) -> Option<Arc<Mutex<IndexDb>>>`, `reconcile_root(root)`, `reconcile_all()`, `start_watchers()`, `spawn_deferred_reconcile()`, `start(roots, model)` (open + watchers + deferred), `shutdown()`.
- **Config** — `src/config.rs`: `Config { roots, model: ModelConfig, transport: TransportConfig{bind,port,token}, gpu }`, `load(path) -> Result<Config>`. **No `save` yet.** `default_config_path()`. `RootConfig { name, folder, include, ignore }`.
- **CLI** — `src/main.rs`: synchronous `fn main() -> ExitCode`; `Serve { port }` arm is a **stub** that prints a stderr notice. `Reindex`/`Watch`/`Status` work. Logging → stderr; stdout reserved for the server readiness line.
- **error** — `src/error.rs`: `MnemeError` (`#[from]` for `Io`, `Walk`, `Glob`, `Regex`, `Sqlite`, `Notify`), `Result<T>` alias.

### Dependency landscape (verified against the official `rust-sdk` repo, mid-2026)

- **`rmcp` 1.7.0** is current. The **Streamable-HTTP server transport is mature** (SSE was removed in 0.11; streamable-http is now the only non-stdio transport and the first-class path). **The "axum + manual JSON-RPC fallback" contingency in US-651 is NOT needed** — `StreamableHttpService` is a ready tower service.
- Features needed: `["server", "macros", "transport-streamable-http-server"]`. `server` pulls in `schemars`; `rmcp` **re-exports `schemars`** (`rmcp::schemars`) — derive `JsonSchema` through the re-export to avoid a version-skew dependency.
- Tokio is required: `tokio = { version = "1", features = ["rt-multi-thread","macros","net","signal"] }`. Also `tokio-util` (`CancellationToken`), `axum` (0.8), `serde_json`, `base64`.
- rmcp ≥ 1.4 ships a **loopback Host-header allowlist** (`localhost`/`127.0.0.1`/`::1`) on the streamable-http server by default — DNS-rebind protection for free; matches our loopback-only posture.

### Patterns to follow

- **Tools** (per the verified `examples/servers` patterns): a `#[tool_router]` impl block with `#[tool(description = "…")]` async fns taking `Parameters<Req>` where `Req: Deserialize + JsonSchema`; a separate `#[tool_handler] impl ServerHandler` for `get_info` + resources. Return `Result<CallToolResult, McpError>`; use `CallToolResult::structured(serde_json::to_value(result)?)` for data tools and `CallToolResult::success(vec![Content::text("…")])` for confirmations.
- **Blocking calls**: every fs/SQLite call runs inside `tokio::task::spawn_blocking`. **Never hold a `std::sync::Mutex` guard across `.await`** — acquire inside the blocking closure, finish, drop, return.
- **Serve glue**: `StreamableHttpService::new(factory, LocalSessionManager::default().into(), StreamableHttpServerConfig::default().with_cancellation_token(ct.child_token()))`, mounted at `/mcp` via `axum::Router::nest_service`, served on a `tokio::net::TcpListener` bound to `127.0.0.1:<port>`.

## Implementation plan

### Step 1 — Cargo dependencies (`mneme/Cargo.toml`)

Add under `[dependencies]`:

```toml
# --- US-655: MCP server (Streamable HTTP) ----------------------------------
rmcp = { version = "1.7", features = ["server", "macros", "transport-streamable-http-server"] }
tokio = { version = "1", features = ["rt-multi-thread", "macros", "net", "signal"] }
tokio-util = { version = "0.7", features = ["rt"] }   # CancellationToken
axum = "0.8"
serde_json = "1"
base64 = "0.22"
```

Verify exact resolved versions at first `cargo build` (rmcp churns; `axum`/`schemars` major must match what rmcp re-exports). `serde` is already present; derive `JsonSchema` via `rmcp::schemars` (do **not** add a top-level `schemars` dep).

### Step 2 — index layer additions (`src/index/mod.rs`)

`search_fts` is too thin for `wiki_search`'s `{ uri, title, tags, snippet, score }` contract and carries no filters. Add a richer, filtered text search plus the accessors `wiki_tags`/`wiki_timeline`/`wiki_status` need. (All FTS-compatible — they need **no** embeddings; the vector lane + RRF graft on in US-658.)

1. **`SearchFilter`** struct (new, in `index/mod.rs` or a small `index/search.rs`):
   ```rust
   #[derive(Debug, Default, Clone)]
   pub struct SearchFilter {
       pub subtree: Option<String>,    // rel-path prefix within the root ("" = whole root)
       pub tags: Vec<String>,          // doc must have ALL of these
       pub exclude_tags: Vec<String>,  // doc must have NONE of these
       pub created_from: Option<String>, // ISO YYYY-MM-DD inclusive (documents.created)
       pub created_to: Option<String>,
   }
   ```
2. **`TextHit`** result row (one per document, best chunk wins the snippet):
   ```rust
   pub struct TextHit {
       pub address: String,        // "{root}/{rel}"
       pub title: String,
       pub tags: Vec<String>,
       pub snippet: String,
       pub score: f64,             // FTS5 bm25() — lower is better; expose as-is + document ordering
   }
   ```
3. **`fn search_text(&self, query, &SearchFilter, limit) -> Result<Vec<TextHit>>`** — `chunks_fts MATCH ?` joined to `chunks` → `documents`, with the filter as a SQL `WHERE` (path `LIKE prefix||'%'`, `created BETWEEN`, tag include via `EXISTS`/`IN doc_tags`, exclude via `NOT EXISTS`). Group to one row per document (best `bm25`), `LEFT JOIN doc_tags` aggregated to a tag list. `score = bm25(chunks_fts)`. The address is `format!("{}/{}", self.root_name(), path)`.
4. **`fn tag_counts(&self, subtree: Option<&str>) -> Result<Vec<(String, usize)>>`** — `SELECT tag, count(*) FROM doc_tags [JOIN documents on path prefix] GROUP BY tag ORDER BY tag`.
5. **`fn docs_with_tag(&self, tag, subtree: Option<&str>) -> Result<Vec<DocMeta>>`** for `wiki_timeline`, where `DocMeta { path, title, created: Option<String>, verified: Option<String>, tags: Vec<String> }`. (Timeline parses the `YYYY-MM-DD` from the *filename*, not `created` — the handler does that; this just returns the `log`-tagged docs.)
6. **`fn doc_meta(&self, rel) -> Result<Option<DocMeta>>`** — used by `wiki_read` to attach parsed frontmatter without re-parsing the file (optional; `wiki_read` may instead call `parse_document` on freshly read bytes — see Step 4). Include if cheap; otherwise skip.
7. Make `pub mod path;` (or re-export `model_id`, `index_db_path`) so the MCP layer can build inventory paths. Add **`fn db_path(&self) -> &Path`** (store the path in `IndexDb` at open, or recompute via `index::path`) for `wiki_status`/`wiki_index_delete`.

Add unit tests for `search_text` filters (tags include/exclude, date range, subtree) and `tag_counts` in `mneme/tests/` (hermetic, `CARGO_TARGET_TMPDIR`, mirroring US-653/654 tests).

### Step 3 — config save + IndexManager root mutation

1. **`src/config.rs`** — add:
   ```rust
   /// Serialize config back to TOML (used by wiki_add_root / wiki_remove_root).
   pub fn save(path: &Path, cfg: &Config) -> Result<()> { /* create parent, toml::to_string_pretty, write */ }
   ```
   Add the `toml` crate (or reuse figment's — prefer a direct `toml = "0.8"` dep for serialization; figment doesn't write).
2. **`src/indexer/mod.rs`** — change `watchers: Vec<RootWatcher>` → **`watchers: HashMap<String, RootWatcher>`** (keyed by root name) so a single root's watcher can be stopped. Update `start_watchers` accordingly. Add:
   ```rust
   /// Register a new root at runtime: open its IndexDb, start its watcher. Caller persists config + reconciles.
   pub fn add_root(&mut self, cfg: RootConfig, model: &ModelConfig) -> Result<Arc<Mutex<IndexDb>>>;
   /// Stop + drop a root's watcher and its IndexDb handle. Does NOT delete the on-disk index.
   pub fn remove_root(&mut self, name: &str) -> Result<()>;
   /// Snapshot of (name, folder) for wiki_list_roots / wiki_status.
   pub fn root_names(&self) -> Vec<String>;
   ```
   `shutdown` drops the map (unchanged semantics).

### Step 4 — MCP module (`src/mcp/`)

New module, four files:

- **`src/mcp/mod.rs`** — `ServerState`, the `ServerHandler` impl (`get_info`, resources), and the **serve glue**.
- **`src/mcp/server.rs`** — the `#[tool_router]` impl block with all `wiki_*` tools (or keep in `mod.rs` if compact).
- **`src/mcp/params.rs`** — `#[derive(Deserialize, rmcp::schemars::JsonSchema)]` request structs (one per tool).
- **`src/mcp/results.rs`** — `#[derive(Serialize)]` result structs returned via `CallToolResult::structured`.

**Shared state** (cloned into each per-session handler via the factory closure):

```rust
#[derive(Clone)]
pub struct MnemeServer { state: Arc<ServerState>, tool_router: ToolRouter<Self> }

pub struct ServerState {
    store: RwLock<DocumentStore>,     // reads concurrent; add/remove takes write
    index: Mutex<IndexManager>,       // locked only briefly: clone a per-root handle / mutate structure
    config: Mutex<Config>,            // for persistence on add/remove
    config_path: PathBuf,
    model: ModelConfig,               // cached for IndexDb::open_or_create on add_root
}
```

Concurrency contract (text mode; US-659 refines): a read tool takes `store.read()` (or `index.lock()` only to **clone** the `Arc<Mutex<IndexDb>>` handle, then releases it) and does the fs/SQLite work under `spawn_blocking`, locking just that per-root `IndexDb`. So a `wiki_reindex` on root A (holds A's `IndexDb` lock) does not block a `wiki_search` on root B. Management mutations take `store.write()` + `index.lock()` + `config.lock()` together.

**Tools** (`#[tool]` async fns; each `spawn_blocking`s its blocking body):

| Tool | Request fields | Backing | Result |
|------|---------------|---------|--------|
| `wiki_read` | `path, offset?, limit?` | `store.read` + `parse_document` on bytes | `{ content, frontmatter:{title,tags,created,verified} }` |
| `wiki_write` | `path, content` | `store.write` → resolve `(root,rel)` → `index.handle(root)` → `index_one` | text "ok" |
| `wiki_edit` | `path, old_string, new_string, replace_all?` | `store.edit` → `index_one` | text "ok" |
| `wiki_delete` | `path` | `store.delete` → `handle.delete_document(rel)` | text "ok" |
| `wiki_glob` | `pattern, path?` | `store.glob` | `{ matches: [uri] }` |
| `wiki_grep` | `pattern, path?, -i?, -n?, context?, output_mode?` | `store.grep` | mode-shaped (`files`/`content`/`count`) |
| `wiki_search` | `query, mode?, subtree?, tags?, excludeTags?, dateRange?, topK?, ext?` | per-scoped-root `index.search_text(query, filter, topK)`, merge by score | `{ results:[{uri,title,tags,snippet,score}] }` |
| `wiki_tree` | `path?` | `store.list` → synthesize dirs + depth | `{ entries:[{uri,name,isDir,depth}] }` (depth-first) |
| `wiki_timeline` | `tags?, from?, to?, subtree?` | `index.docs_with_tag("log", subtree)` + parse date from filename, filter, newest-first | `{ entries:[{uri,title,date,tags}] }` |
| `wiki_tags` | `subtree?` | `index.tag_counts(subtree)` | `{ tags:[{tag,count}] }` |
| `wiki_add_root` | `folder, name?` | `store.write()`+`index.lock()`: `registry.add` → `IndexManager.add_root` → `config::save` → reconcile | `{ name, folder }` |
| `wiki_remove_root` | `root` | `registry.remove` + `IndexManager.remove_root` + `config::save` | text "ok" |
| `wiki_list_roots` | — | `registry.configs` | `{ roots:[{name,folder}] }` |
| `wiki_reindex` | `path?` | synchronous `IndexManager.reconcile_root`/`reconcile_all` | `{ roots:[{name,...ReconcileStats}] }` |
| `wiki_status` | — | per root: `doc_count`, `meta`, `db_path` + size | `{ roots:[{name,folder,docCount,model,precision,schemaVer,indexPath,indexBytes}] }` |
| `wiki_index_delete` | `root, modelId, schemaVer` | delete the versioned `.db` file; **refuse the active** `(modelId, schemaVer)` | text "ok" / error |
| `wiki_model_update` | `model?` | **stub** → error/notice "model management arrives in US-656 (text-search mode has no embeddings)" | notice |

Notes baked into the tools:
- **`wiki_search` mode**: accept `mode: text|vector|hybrid` (default **`text`** for US-655 — overriding the design's eventual `hybrid` default, which becomes active in US-658). If `vector`/`hybrid` is requested while no embeddings exist, run text and add a `"note": "vector/hybrid unavailable until embeddings (US-658); returned text results"` field. `ext` accepted but only `.md` is indexed today (multi-type is backlog) — document the no-op.
- **subtree scoping**: `WikiAddress::parse(subtree)` → choose the one root DB + pass `rest` as the `SearchFilter.subtree` prefix; omitted = iterate all root DBs and merge.
- **`wiki_tree` depth/dirs**: derive from the sorted flat address list (split on `/`, emit each unique ancestor once with `isDir:true`, files `isDir:false`, `depth` = segment count after the root). Keep it in the handler — no new store/index method.

### Step 5 — resources + agent guide

In `impl ServerHandler for MnemeServer`:
- **`list_resource_templates`** → advertise `mneme://{root}/{path}` (so agents/Persephone discover the scheme).
- **`list_resources`** → return just the agent guide `mneme://guide` (do **not** enumerate every document — agents use `wiki_glob`/`wiki_tree`).
- **`read_resource`** →
  - `mneme://guide` → the embedded guide text (`include_str!`).
  - `mneme://{root}/{path}` → resolve via the store. If the extension is text/markdown (or the bytes are valid UTF-8), return `ResourceContents::text(...).with_mime_type("text/markdown")`; otherwise `store.read_bytes` → `base64 STANDARD.encode` → `ResourceContents::blob(...).with_mime_type(guess_mime(path))`. Map a missing file to `McpError::resource_not_found`.
- **Do NOT** advertise `enable_resources_subscribe()` — subscriptions are US-661/662.

**Agent guide**: create `mneme/assets/wiki-guide.md` — concise `wiki_*` usage guide for agents (the tool surface, `{root}/{path}` addressing, frontmatter conventions, "files are the source of truth", text-mode caveat that semantic search is not yet enabled). Embed via `include_str!("../../assets/wiki-guide.md")`. Summarize the same in `ServerInfo` **`with_instructions(...)`** so it surfaces at connect time.

`get_info`:
```rust
ServerInfo::new(ServerCapabilities::builder().enable_tools().enable_resources().build())
    .with_instructions(INSTRUCTIONS.to_string())
    .with_server_info(Implementation::from_build_env())
```

### Step 6 — serve glue (`src/mcp/mod.rs`)

```rust
pub fn serve(cfg: Config, config_path: PathBuf, bind: &str, port: u16) -> Result<()> {
    let rt = tokio::runtime::Builder::new_multi_thread().enable_all().build()?;
    rt.block_on(async move {
        // open store + IndexManager::start (watchers + deferred reconcile) — reuse US-654
        let state = Arc::new(ServerState::new(cfg, config_path)?);
        let ct = CancellationToken::new();
        let svc = StreamableHttpService::new(
            { let s = state.clone(); move || Ok(MnemeServer::new(s.clone())) },
            LocalSessionManager::default().into(),
            StreamableHttpServerConfig::default().with_cancellation_token(ct.child_token()),
        );
        let app = axum::Router::new().nest_service("/mcp", svc);
        let listener = tokio::net::TcpListener::bind((bind, port)).await?;
        // THE single allowed stdout line — the spawner (Persephone) waits for this:
        println!("listening on {}:{}", bind, port);
        axum::serve(listener, app)
            .with_graceful_shutdown(async move { let _ = tokio::signal::ctrl_c().await; ct.cancel(); })
            .await?;
        Ok(())
    })
}
```
(Bridge `std::io::Error`/`axum`/`hyper` errors into `MnemeError` — add a `#[from] std::io::Error` is already present; add variants/`map_err` for the serve errors as needed.)

### Step 7 — wire `serve` in `main.rs`

Replace the stub `Command::Serve` arm with a call to `mcp::serve(cfg, config_path, &cfg.transport.bind, port_or_configured)`. Keep `Reindex`/`Watch`/`Status` synchronous (do **not** add `#[tokio::main]` — the runtime is built only inside `serve`). Update the `Serve` doc comment (drop "stub — implemented in US-655").

### Step 8 — lib + docs

- `src/lib.rs` — add `pub mod mcp;` (alphabetical, after `markdown`); update the status doc-comment to note the MCP server (text-search mode).
- `mneme/README.md` — status line, module-layout block (`mcp/`), CLI section (`serve` no longer a stub), a short "MCP surface (text-search mode)" note + how to connect (Inspector / Claude over `http://127.0.0.1:<port>/mcp`).
- `mneme/mneme.example.toml` — confirm `[transport]` documents `bind`/`port`.

### Step 9 — tests

- `mneme/tests/mcp.rs` (hermetic): build a `ServerState` over a temp root, call the tool handler functions **directly** (not over HTTP) to assert behavior — `wiki_read`/`write`/`edit`/`delete` round-trip + index sync, `wiki_search` finds written content + respects tag/date/subtree filters, `wiki_glob`/`wiki_grep`, `wiki_tree` shape, `wiki_tags`/`wiki_timeline`, `wiki_add_root`/`remove_root`/`list_roots` (+ config persisted), `wiki_reindex` stats, `wiki_status`, `wiki_index_delete` refuses the active DB, `wiki_model_update` returns the stub notice. Factor tool bodies so they're callable without an MCP transport (a thin `async fn` per tool that the `#[tool]` wrapper delegates to, or plain methods on `ServerState`).
- Optionally one live HTTP smoke test (bind ephemeral port, `initialize` + `tools/list`) — keep it bounded/optional to avoid flakiness.
- Verify: `cargo build`, `cargo build --release` (clean, no warnings), `cargo test` (US-652+653+654+655 all green).

## Concerns / open questions (with recommended resolutions)

1. **Async boundary — don't make all of `main` async.** *Recommended:* build a `tokio` multi-thread runtime **inside the `serve` arm** and `block_on`; leave `reindex`/`watch`/`status` synchronous. Keeps US-654's synchronous CLI intact and confines tokio to the server. ✅ (in plan)

2. **Holding a lock across `.await` (deadlock/`Send` hazard).** *Recommended:* all blocking work in `spawn_blocking`; acquire `std::sync::Mutex`/`RwLock` guards **inside** the closure and drop before returning. Lock the `IndexManager` only to **clone** a per-root `Arc<Mutex<IndexDb>>` handle, then release — never hold it during fs/SQLite. ✅ (in plan)

3. **`search_fts` is too thin for the `wiki_search` contract.** It returns `{address,heading,snippet}` only — no title/tags/score/filters. *Recommended:* add `search_text(query, &SearchFilter, limit) -> Vec<TextHit{uri,title,tags,snippet,score}>` with FTS-compatible SQL filters (subtree prefix, tags include/exclude, created date range), one row per document (best `bm25`). This is the natural seed US-658 extends with the vector lane + RRF — keep `search_fts` or fold it into `search_text`. ✅ (Step 2)

4. **`mode` default conflicts with the design.** The design's eventual default is `hybrid`, but US-655 has no embeddings. *Recommended:* default `mode = text` in US-655; on a `vector`/`hybrid` request, run text and return a `note` that semantic search lands in US-658. Flip the default to `hybrid` in US-658. (Documented no-op for `ext` too — only `.md` is indexed; multi-type is backlog.)

5. **`wiki_tags` / `wiki_timeline` have no index accessor.** *Recommended:* add `tag_counts(subtree?)` and `docs_with_tag("log", subtree?)` to `IndexDb` (pure SQL over `doc_tags`/`documents`). Timeline parses the `YYYY-MM-DD` date from the **filename** (per US-651), not `created`. ✅ (Step 2)

6. **`wiki_remove_root` can't stop one root's watcher** — `IndexManager.watchers` is an unkeyed `Vec`. *Recommended:* change to `HashMap<String, RootWatcher>` and add `IndexManager::add_root`/`remove_root`/`root_names`. Removing a root drops its watcher + `IndexDb` handle but **does not delete the on-disk `.mneme` index** (rebuildable; deletion is `wiki_index_delete`'s job). ✅ (Step 3)

7. **Config persistence on `add_root`/`remove_root`** — `config.rs` has no `save`. *Recommended:* add `config::save(path, &Config)` (TOML serialize; add a `toml` dep — figment reads but doesn't write). Mutations update the registry, the `IndexManager`, **and** persist the config atomically under the held locks. ✅ (Step 3)

8. **`wiki_model_update` in a no-embeddings build.** *Recommended:* register the tool (surface completeness/discoverability) but return a clear notice that model management arrives in US-656. Better than omitting — agents see the full intended surface. (Alternative: omit until US-656 — rejected for discoverability.)

9. **`wiki_reindex` synchronous, no progress notifications.** The design's cancellable job + MCP progress is US-659. *Recommended:* US-655 runs a **synchronous** `reconcile_*` (fast in text mode — no embedding) and returns `ReconcileStats`. Note in the tool description that live progress/cancel arrives with embeddings (US-659). Run it in `spawn_blocking` so the HTTP server stays responsive.

10. **`wiki_status` / `wiki_index_delete` need the versioned-index path + db size.** *Recommended:* make `index::path` reachable (`pub mod path;` / re-export `model_id`,`index_db_path`) and add `IndexDb::db_path()`. `wiki_index_delete` removes the versioned `.db` file for `(root, modelId, schemaVer)` and **refuses the active identity**. Full inventory UI is US-664 — keep the tool minimal.

11. **Resources: list everything vs. templates.** Enumerating every doc in `list_resources` is wasteful. *Recommended:* `list_resources` returns only `mneme://guide`; advertise `mneme://{root}/{path}` via `list_resource_templates`; `read_resource` serves any doc/attachment by URI (text for md/UTF-8, base64 blob for binary). ✅ (Step 5)

12. **Subscriptions / live-refresh.** Tempting to wire the watcher → `resources/updated` now. *Recommended:* **defer** — the watcher has no handle to MCP sessions, and `MnemeProvider` (the consumer) is US-662. Do **not** advertise `subscribe` in US-655; resources are read/list only. Revisit in US-661/662. (Explicit out-of-scope.)

13. **`rmcp` version churn / `axum`+`schemars` major alignment.** *Recommended:* pin `rmcp = "1.7"`, derive `JsonSchema` via `rmcp::schemars` (no separate `schemars` dep), and verify the resolved `axum` major at first build. The streamable-http server is mature (verified) — **the axum-fallback contingency in US-651 is not needed**; if a build-time surprise appears, the fallback remains documented there.

14. **Per-session handler factory cost.** `StreamableHttpService` calls the factory **per session**; `MnemeServer::new` must be cheap. *Recommended:* the factory clones the `Arc<ServerState>` only (the store/index/config live behind the Arc, constructed once at `serve` start) — no per-session reopen of DBs.

15. **Loopback/auth.** *Recommended:* bind `127.0.0.1` only, no auth (rmcp's default Host allowlist covers DNS-rebind). `transport.token`/bearer is networked/Azure only — out of scope. ✅

## Acceptance criteria

- [x] `mneme serve [--port N]` binds `127.0.0.1:<port>`, prints exactly one stdout line `listening on 127.0.0.1:<port>`, logs to stderr, and serves MCP over Streamable HTTP at `/mcp` until Ctrl-C (graceful shutdown). *(Verified: stdout one line; TCP listening; stderr logs.)*
- [x] On `serve`, watchers + the deferred startup reconcile run (US-654 wiring via `IndexManager::start`).
- [x] An MCP client connects, `initialize` succeeds, capabilities advertise `tools` + `resources`, and the server `instructions` summarize usage. *(Verified via a live `initialize` POST.)*
- [x] File-like tools round-trip: `wiki_write` creates+indexes a doc; `wiki_read` returns content + parsed frontmatter; `wiki_edit`/`wiki_delete` update the index; `wiki_glob`/`wiki_grep` match.
- [x] `wiki_search` (text mode) finds written content and honors `subtree`, `tags`/`excludeTags`, `dateRange`; returns `{uri,title,tags,snippet,score}`; `vector`/`hybrid` degrade to text with a note.
- [x] `wiki_tree` (flat `{uri,name,isDir,depth}`), `wiki_tags` (`{tag,count}`), `wiki_timeline` (`log`-tagged, date-from-filename, newest-first) work.
- [x] Management: `wiki_add_root`/`wiki_remove_root`/`wiki_list_roots` mutate the registry **and persist config**; `wiki_reindex` returns reconcile stats; `wiki_status` reports per-root inventory; `wiki_index_delete` refuses the active DB; `wiki_model_update` returns the US-656 stub notice.
- [x] Resources: `read_resource` serves `mneme://{root}/{path}` (text + base64 blob) and `mneme://guide`; `list_resource_templates` advertises the scheme. `subscribe` is **not** advertised.
- [x] `mneme/assets/wiki-guide.md` exists and is served as `mneme://guide`.
- [x] `cargo build --release` clean (no warnings); `cargo test` green (US-652+653+654+655); new `tests/mcp.rs` + `tests/index_search.rs` cover the tool surface.

## Implementation notes (post-hoc)

Deviations from the plan, discovered during the build:

1. **Added `indexer::reindex_file` (forced) — the synchronous write path does NOT use `index_one`.** `index_one`'s mtime+size fast-path can wrongly **Skip** a same-length edit made within the filesystem's mtime resolution (caught by a test: `"oldword"→"newword"`, identical size, same mtime tick → stale index). Since `wiki_write`/`wiki_edit` just changed the content, the MCP write path calls a new `reindex_file` that always reads + content-hashes (keeping hash dedup, dropping the stat fast-path). `index_one` is unchanged and still used by reconcile/watcher.
2. **`rmcp` 1.7 API specifics** (verified against the installed crate, vs. the plan's sketch): `ServerInfo::new(caps).with_instructions(..)` (the struct is `#[non_exhaustive]` — no struct literal); `ListResourcesResult::with_all_items(..)` / `ListResourceTemplatesResult::with_all_items(..)`; `ReadResourceResult::new(..)`; `ResourceContents::text/blob`; `RawResource::new(..).no_annotation()`; the request params are the plural aliases `PaginatedRequestParams` / `ReadResourceRequestParams`. **`#[tool_handler(router = self.tool_router)]`** is required to use the router stored once in `new` — the bare `#[tool_handler]` default rebuilds it per call via `Self::tool_router()`.
3. **`Result` alias hazard:** importing `crate::error::Result` into the rmcp adapter shadows `std::result::Result` and breaks the `#[tool_handler]` macro expansion (arity error). `server.rs` imports only `MnemeError` and writes `std::result::Result<…, McpError>` in handlers.
4. **Dropped `tokio-util`/`CancellationToken`** — `axum::serve(...).with_graceful_shutdown(ctrl_c)` is sufficient; the dep was removed.
5. **Concurrency seam (US-659 will refine):** `ServerState` holds `RwLock<DocumentStore>` + `Mutex<IndexManager>` + `Mutex<Config>`. The index Mutex is locked only briefly to **clone** a per-root `Arc<Mutex<IndexDb>>` handle; the actual FTS/reconcile work runs under that per-root DB lock, so a reconcile on root A doesn't block a search on root B. All fs/SQLite work runs in `tokio::task::spawn_blocking`; no lock guard is held across `.await`.

## Files changed (summary)

| File | Change |
|------|--------|
| `mneme/Cargo.toml` | + `rmcp`, `tokio`, `tokio-util`, `axum`, `serde_json`, `base64`, `toml` |
| `mneme/src/lib.rs` | + `pub mod mcp;`; status doc-comment |
| `mneme/src/main.rs` | `Serve` arm → `mcp::serve(...)` (runtime built inside the arm); doc comment |
| `mneme/src/config.rs` | + `pub fn save(path, &Config)` |
| `mneme/src/index/mod.rs` | + `SearchFilter`, `TextHit`, `DocMeta`, `search_text`, `tag_counts`, `docs_with_tag`, `doc_meta?`, `db_path`; `pub mod path` / re-exports |
| `mneme/src/indexer/mod.rs` | `watchers: Vec` → `HashMap<String,RootWatcher>`; + `add_root`/`remove_root`/`root_names` |
| `mneme/src/mcp/mod.rs` | **new** — `ServerState`, `ServerHandler` (get_info + resources), `serve` glue |
| `mneme/src/mcp/server.rs` | **new** — `#[tool_router]` impl: all `wiki_*` tools |
| `mneme/src/mcp/params.rs` | **new** — request structs (`Deserialize` + `rmcp::schemars::JsonSchema`) |
| `mneme/src/mcp/results.rs` | **new** — result structs (`Serialize`) |
| `mneme/assets/wiki-guide.md` | **new** — `wiki_*` agent guide (embedded + `mneme://guide`) |
| `mneme/tests/mcp.rs` | **new** — tool-surface tests (direct handler calls) |
| `mneme/tests/index_search.rs` (or extend existing) | **new/edit** — `search_text` filters + `tag_counts` |
| `mneme/README.md` | status, module layout (`mcp/`), CLI (`serve` live), MCP-surface note |
| `mneme/mneme.example.toml` | confirm `[transport]` `bind`/`port` documented |
| `doc/active-work.md` | link the US-655 entry to this doc |
| `doc/epics/EPIC-032.md` | link the US-655 row in Linked Tasks |

## Files that need NO changes

- `mneme/src/store/**` — `DocumentStore`/`RootRegistry` (incl. `add`/`remove`)/`WikiAddress`/grep/glob/walk are complete; the MCP layer only *calls* them.
- `mneme/src/markdown/**` — `parse_document`/`EffectiveMeta`/`Chunk` are sufficient for `wiki_read`.
- `mneme/src/index/schema.rs` — schema is complete (no DDL change; new methods are read-only queries / a stat update already present).
- `mneme/src/watcher/mod.rs` — `RootWatcher` unchanged; only `IndexManager`'s storage of it changes.
- `mneme/src/error.rs` — likely sufficient (`#[from] std::io::Error` covers bind errors); add a `Mcp(String)`/serde variant only if a serialize/`McpError` bridge needs it.
- Persephone side (`src/main`, `src/renderer`) — **no changes**; Persephone integration is Phases 3–6 (US-660+).
```

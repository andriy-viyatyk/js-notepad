# US-666: Mneme — `wiki_grep` metadata filters + `mneme://status` resource

**Epic:** [EPIC-032 — Mneme](../../epics/EPIC-032.md) · Phase 1/2 gap-closing
**Status:** Done (verified end-to-end over MCP; `/review` + `/userdoc` N/A for the Rust crate)

## Goal

Close the two functional gaps the post-implementation review found between the EPIC-032 MCP
surface and the shipped Mneme code:

1. `wiki_grep` is missing its spec'd `tags?`, `dateRange?`, and `-n?` parameters (deferred in a
   code comment to US-653, whose index now exists — so the blocker is gone).
2. The epic lists `mneme://status` as a readable resource; only the `wiki_status` **tool** exists.

Resource **subscriptions** stay out of scope — they remain correctly deferred to US-661/662. This
task only adds a **readable** status resource.

## Background

### Current `wiki_grep` (text scan, no metadata filters)
- Params: `mneme/src/mcp/params.rs:57-70` (`GrepParams`) — `pattern`, `path?`, `-i?`, `context?`,
  `output_mode?`. No `tags`, `dateRange`, or `-n`.
- Handler: `mneme/src/mcp/mod.rs:172-190` (`grep`) — maps `GrepParams` → `store::grep::GrepOptions`,
  calls `Store::grep`, returns `grep_to_json(result)`.
- Store: `mneme/src/store/mod.rs:124-158` (`Store::grep`) — streaming regex scan over the walked
  file set; **no index access** (the comment at `store/mod.rs:122-123` explicitly reserves
  `tags`/`dateRange` for the index layer). Returns `GrepResult` keyed by `{root}/{path}` address
  in all three output modes.
- Scan core: `mneme/src/store/grep.rs` — `GrepResult::{Files, Counts, Content}`; `ContentLine`
  already carries `line_number`. Content mode **always** emits line numbers today (`grep.rs:92`);
  there is no `-n` toggle.

### Index metadata filtering already exists (reuse it)
- `SearchFilter` struct: `mneme/src/index/mod.rs:64-78` (`subtree`, `tags`, `exclude_tags`,
  `created_from`, `created_to`).
- `push_filter_sql`: `mneme/src/index/mod.rs:693-715` — appends the shared predicates to any query
  that exposes the `documents` alias `d`. **Reuse this** for the new "docs matching filter" query.
- `wiki_search` already wires `tags`/`excludeTags`/`dateRange` through `SearchFilter`
  (`mneme/src/mcp/mod.rs:199-205`) — mirror that param→filter mapping for grep (grep takes **`tags`
  only**, no `excludeTags`, per the epic spec).
- Per-root index handles are reached from the MCP handler via
  `st.index.lock().unwrap().handle(&root)` → `RootIndex` (`mneme/src/index/pool.rs`), read through
  `h.read(|db| …)`. The `Store` layer cannot see the index; **the metadata filter must therefore
  be applied in the MCP `grep` handler**, not in `Store::grep`.
- `DateRange` param struct already exists: `mneme/src/mcp/params.rs:81-87` (`from`/`to` ISO dates).
- Scope helper: `scope(&st, path)` → `(roots, subtree_prefix)` (`mneme/src/mcp/mod.rs`, used by
  `search` at `:198`). Use it so the allowed-set is computed over the **same** scoped roots the
  scan walks.

### `mneme://status` resource
- `wiki_status` tool handler: `mneme/src/mcp/mod.rs:479-523` (`ServerState::status`) → returns
  `StatusResult` (`mneme/src/mcp/results.rs:157`, already `Serialize`).
- Resource plumbing: `mneme/src/mcp/server.rs` — `GUIDE_URI` constant (`:23-24`),
  `list_resources` (`:195-202`, currently only the guide), `read_resource` (`:223-244`, special-cases
  `GUIDE_URI` then falls through to `mneme://{root}/{path}`).
- Capabilities: `:185-192` — `enable_tools()` + `enable_resources()` only.
  **Do not** add `enable_resource_subscriptions()` (US-661/662).

## Implementation plan

### Part A — `wiki_grep` metadata filters + `-n`

**A1. Extend `GrepParams`** — `mneme/src/mcp/params.rs:57-70`:
```rust
#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct GrepParams {
    /// Literal/regex pattern (streaming scan over indexed files — not FTS).
    pub pattern: String,
    pub path: Option<String>,
    #[serde(default, rename = "-i")]
    pub ignore_case: bool,
    /// Show line numbers in Content mode (default true). `-n: false` suppresses them.
    #[serde(rename = "-n")]
    pub line_numbers: Option<bool>,
    #[serde(default)]
    pub context: usize,
    #[serde(default)]
    pub output_mode: GrepOutputMode,
    /// Document must carry every one of these tags (`.md` frontmatter only).
    #[serde(default)]
    pub tags: Vec<String>,
    /// Restrict to documents whose `created` date is in range.
    #[serde(rename = "dateRange")]
    pub date_range: Option<DateRange>,
}
```
- `line_numbers: Option<bool>` → handler treats `None`/`Some(true)` as "include" (preserves
  current behavior), `Some(false)` as "omit". (Decision in Concerns.)
- `DateRange` is already defined in the same file — no new type.

**A2. `-n` toggle in the scan output** — `mneme/src/store/grep.rs`:
- Add `line_numbers: bool` to `GrepOptions` (default `true` in its `Default` impl).
- In `grep_to_json` (handler side — see A4) honor it: when `false`, omit the `line_number` field
  from Content-mode JSON rows. (Keep `ContentLine.line_number` populated internally; only the
  JSON projection changes. Simplest: pass the flag into `grep_to_json`.)

**A3. New index query — docs matching a `SearchFilter`** — `mneme/src/index/mod.rs`:
Add a method on `IndexDb` returning the rel-paths of documents matching the metadata filter,
reusing `push_filter_sql`:
```rust
/// Rel-paths (`documents.path`) of every document matching the metadata filter — for callers
/// (wiki_grep) that need to restrict a non-FTS scan to tag/date/subtree-matching docs.
pub fn docs_matching(&self, filter: &SearchFilter) -> Result<Vec<String>> {
    let mut sql = String::from("SELECT d.path FROM documents d WHERE 1=1");
    let mut params: Vec<Value> = Vec::new();
    push_filter_sql(&mut sql, &mut params, filter);
    // … prepare, query_map collecting d.path …
}
```

**A4. Apply the filter in the `grep` handler** — `mneme/src/mcp/mod.rs:172-190`:
- Build `GrepOptions` including `line_numbers: p.line_numbers.unwrap_or(true)`.
- If `p.tags` is non-empty **or** `p.date_range` is `Some`:
  - `let (roots, subtree_prefix) = scope(&st, p.path.as_deref())?;`
  - For each scoped root, build `SearchFilter { subtree: non_empty(subtree_prefix.clone()),
    tags: p.tags.clone(), exclude_tags: vec![], created_from, created_to }`, call
    `h.read(|db| db.docs_matching(&filter))?`, and collect `format!("{root}/{rel}")` into an
    `allowed: HashSet<String>`.
  - Run `store.grep(...)` as today, then **filter the typed `GrepResult`** to entries whose
    address ∈ `allowed` before `grep_to_json`. Add a small helper
    `fn filter_grep_result(r: GrepResult, allowed: &HashSet<String>) -> GrepResult` (match each
    variant, retain by address).
- If neither filter is present, behavior is unchanged (no index round-trip).
- **Non-`.md` note:** tags/created come from `.md` frontmatter only; with a `tags`/`dateRange`
  filter, non-`.md` indexed files (a future `ext` capability) won't be in `documents` and are thus
  excluded — acceptable and consistent with `wiki_search`'s documented limitation.

**A5. Update the agent guide** — `mneme/assets/wiki-guide.md`: document `wiki_grep`'s new `tags`,
`dateRange`, and `-n` params.

### Part B — `mneme://status` readable resource

**B1. Constant** — `mneme/src/mcp/server.rs` near `GUIDE_URI`:
```rust
const STATUS_URI: &str = "mneme://status";
```

**B2. `list_resources`** — `mneme/src/mcp/server.rs:195-202`: add a second `RawResource`:
```rust
let status = RawResource::new(STATUS_URI, "Mneme service status").no_annotation();
Ok(ListResourcesResult::with_all_items(vec![guide, status]))
```

**B3. `read_resource`** — `mneme/src/mcp/server.rs:223-244`: special-case `STATUS_URI` **before**
the `mneme://{root}/{path}` fallthrough:
```rust
if uri == STATUS_URI {
    let status = self.state.status().await.map_err(to_mcp)?;
    let json = serde_json::to_string_pretty(&status).map_err(/* → McpError */)?;
    return Ok(ReadResourceResult::new(vec![
        ResourceContents::text(json, uri) // mime application/json if the ctor supports it
    ]));
}
```
`ServerState::status()` already exists (`mcp/mod.rs:479`) and `StatusResult` is `Serialize`.

**B4. Capabilities unchanged** — leave `:185-192` as-is. Subscriptions are US-661/662.

**B5. Update the README** — `mneme/README.md` "MCP surface" section: list `mneme://status` as a
readable resource and note `wiki_grep`'s new filters.

## Concerns / open questions

- **`-n` default.** Current Content-mode output always includes line numbers. To avoid a silent
  behavior change for existing callers, `-n` defaults to **true** (`Option<bool>` → `unwrap_or(true)`),
  and only an explicit `-n: false` suppresses them. (Claude's own Grep defaults `-n` off, but
  Mneme already emits them, so preserving current output is the safer default. Flag if you'd rather
  match Grep's opt-in semantics.)
- **Filter applied post-scan, not as a pre-filter.** The scan still walks every file; matching docs
  are intersected with the index afterward. At personal wiki scale this is fine and keeps
  `Store::grep` index-free. A pre-filter (only read allowed files) is a possible later optimization.
- **`tags`/`dateRange` exclude non-`.md` files** (no frontmatter rows in `documents`) — documented
  limitation, consistent with `wiki_search`.
- **No `excludeTags` on grep** — the epic spec for `wiki_grep` lists `tags?` only; not adding one.
- **Status resource is read-only / not subscribable** — `notifications/resources/updated` for
  `mneme://status` is explicitly out of scope (US-661/662).

## Acceptance criteria

- [x] `wiki_grep` accepts `tags`, `dateRange`, and `-n`; their JSON schema is published in the
      tool's `inputSchema`.
- [x] `wiki_grep { pattern, tags: ["x"] }` returns only matches in documents carrying tag `x`;
      `dateRange` restricts by `created`; both compose with `path` scope and all three output modes.
- [x] `wiki_grep` with no `tags`/`dateRange` is byte-identical to current behavior (no index hit).
- [x] `-n: false` omits line numbers from Content-mode output; default/`true` keeps them.
- [x] `resources/list` includes `mneme://status`; `resources/read { uri: "mneme://status" }`
      returns the same payload as the `wiki_status` tool as JSON text.
- [x] Server capabilities still advertise tools + resources only (no subscriptions).
- [x] `cargo build --release` and `cargo test` pass; a test covers `docs_matching` + a
      tag-filtered grep.
- [x] `mneme/assets/wiki-guide.md` and `mneme/README.md` updated.

## Files changed (planned)

| File | Change |
|------|--------|
| `mneme/src/mcp/params.rs` | `GrepParams`: add `tags`, `date_range` (`dateRange`), `line_numbers` (`-n`) |
| `mneme/src/store/grep.rs` | `GrepOptions`: add `line_numbers` (default true) |
| `mneme/src/index/mod.rs` | new `IndexDb::docs_matching(&SearchFilter)` (reuses `push_filter_sql`) |
| `mneme/src/mcp/mod.rs` | `grep` handler: build allowed-set from index when tags/dateRange set, filter `GrepResult`; pass `line_numbers` into `grep_to_json` |
| `mneme/src/mcp/server.rs` | `STATUS_URI` const; `list_resources` + `read_resource` serve `mneme://status` |
| `mneme/assets/wiki-guide.md` | document grep filters + `-n` |
| `mneme/README.md` | note `mneme://status` resource + grep filters |

### Files that need NO change
- `mneme/src/mcp/results.rs` — `StatusResult` is already `Serialize`.
- `mneme/src/index/pool.rs`, `embed/*`, `indexer/*`, `watcher/*` — untouched.
- Capabilities builder in `server.rs` — unchanged (no subscriptions).

## Post-implementation additions (testing pass)

End-to-end testing against a live `mneme serve` (real model on DirectML, driven via the official MCP
SDK client + the Persephone MCP Inspector) surfaced a few improvements, done in the same pass:

1. **FTS now indexes chunk headings + the document title**, not just body text — a term that
   appears only in a heading/title (e.g. an H1 "Docker layer caching" when the body says
   "Dockerfile") was previously unfindable by `wiki_search mode:text`. `chunks_fts` rows are now
   `title (first chunk) + heading + body`; stored `chunks.text` stays body-only. (`index/mod.rs`)
   - **Bumped `SCHEMA_VERSION` 1 → 2** (`index/schema.rs`) so existing indexes rebuild via the
     versioned-DB path (no migration code) — content of the FTS index changed.
2. **Server identity** → `persephone-mneme` / title `Mneme` / crate version (was rmcp's
   `from_build_env()` default `rmcp`/`1.7.0`, shown to every client incl. the Inspector). (`mcp/server.rs`)
3. **Every `wiki_*` tool description now carries a coherent `call → result` example** — one
   running scenario (register root `personal` → add `personal/contacts/jane.md` → find/view/admin).
   Raw-string literals use `r##"…"##` (a `"#` inside JSON like `"content":"#` closes `r#"…"#`
   early). (`mcp/server.rs`)
4. **Scope params reworded** — dropped the confusing *"Optional `{root}` … (omit = all roots)"*;
   they now read e.g. *"The `{root}` or `{root}/sub` to list (e.g. `personal`)"* and the guide tells
   agents to always provide the root (`wiki_list_roots` if unknown). Fields stay `Option` (Persephone
   keeps the all-roots fallback internally). (`mcp/params.rs`, `mcp/server.rs`, `assets/wiki-guide.md`)

Additional files changed beyond the planned table: `mneme/src/index/schema.rs`,
`mneme/src/mcp/server.rs`, `mneme/src/mcp/params.rs`, `mneme/assets/wiki-guide.md`, plus version-assert
updates in `mneme/tests/index.rs` and `mneme/tests/mcp.rs` (now reference `SCHEMA_VERSION`).

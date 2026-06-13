# US-653: [Phase 1] Frontmatter + chunker + SQLite schema (FTS5 + sqlite-vec)

**Epic:** [EPIC-032 — Mneme (Wiki / Vector Memory service)](../../epics/EPIC-032.md)
**Phase:** 1 — Mneme core service (text-search, MCP-testable)
**Status:** Implemented (Phase 1) — `cargo build --release` + full suite (13 Document-Store + 19 index/markdown tests = 32) pass; awaiting epic-level review.
**Created:** 2026-06-13

## Goal

Add the two layers that sit directly below the Document Store (US-652) and directly above the future indexer (US-654): a **markdown layer** (`markdown/`) that parses YAML frontmatter — resolving `title`/`tags`/`created`/`verified` with read-time fallbacks — and chunks a document by headings; and an **index layer** (`index/`) that creates and owns the per-root **SQLite database** (bundled SQLite + FTS5 + `sqlite-vec`) at its **versioned path**, with a `meta` row, a delete-then-insert document upsert, and the read helpers reconcile will need. At the end of this task the crate can: parse a markdown file into `(effective metadata, chunks)`; open-or-create a per-root index DB whose `vec0` table proves `sqlite-vec` links and loads; upsert a parsed document so its chunks are full-text searchable via FTS5; and read back a document's state for change detection — all exercised by tests. **No** walker orchestration / watcher / reconcile loop (US-654), **no** MCP server (US-655), **no** embeddings populating `chunks_vec` (US-657/658), **no** ranked hybrid `wiki_search` (US-655/658).

## Background

### What this task realizes (from EPIC-032 / US-651)

- **US-653 scope line (EPIC-032):** "YAML frontmatter parse (title/tags/created/verified + read-time fallbacks materialized in the index), heading chunker, SQLite (bundled + FTS5 + sqlite-vec) schema at the versioned index path, `meta` row."
- **Frontmatter schema (EPIC-032 decision):** four **optional** fields — `title`, `tags`, `created`, `verified` — none required for v1. Read-time fallbacks: `title` → first H1, else filename stem; `created` → file birthtime, else mtime; `tags` → `[]`; `verified` → none (a freshness/"valid as of" date, optional). **Effective values are materialized into the SQLite `documents` table at index time** — all later filtering runs against the index, files are not re-read for filtering. Open schema (unknown keys are irrelevant here — see Concern 8). **Reindex is read-only**: fallbacks are computed into the index, the source `.md` is never rewritten (backfill deferred).
- **Chunker (D8):** split the markdown body **by headings**, with a **size cap**. A search hit points at a section — better display and better embedding quality than whole-document vectors. Each chunk carries its heading + an ordinal.
- **Index storage (D4 / US-651 "Storage"):** SQLite + `sqlite-vec` + FTS5, one active `.db` per `(model+precision, schema version)` at **`.mneme/<modelId>/index-v<schemaVer>.db`** inside each wiki root (per-root DBs, D12). Tables: `documents` (path, effective frontmatter, content hash, mtime, size), `chunks` (doc_id, heading, text, ordinal), `chunks_fts` (FTS5), `chunks_vec` (`sqlite-vec` vec0, holds embeddings — **empty until US-657/658**), `meta` (model + precision + dims + schema version). Fully rebuildable from the files; a model/schema-version change selects a **new** versioned file (old kept for reversible switch-back — no migration code).
- **`.mneme/` self-exclusion (US-651 "Storage"):** Mneme writes a `.mneme/.gitignore` containing `*` so the derived index never enters version control. (`.mneme` is already in the walker's `DEFAULT_IGNORES`, so the index is never walked/indexed either.)
- **FTS works before the model arrives (D11):** the DB and FTS5 index are fully functional with no embeddings present; the `chunks_vec` table exists but is empty. This is why US-655 can ship a usable text-search wiki in Phase 1 before US-656/657 add the model.

### What US-652 already provides (build on, don't duplicate)

| Piece | Where | US-653 uses it for |
|---|---|---|
| `DocumentStore` (read/write/edit/delete/read_bytes/list/glob/grep) | `mneme/src/store/mod.rs` | unchanged; US-654 will drive the indexer through the walk + parse + upsert |
| `walk::walk_root(&RootConfig) -> Vec<WalkedFile{abs, rel}>` (`rel` = forward-slash path within root) | `mneme/src/store/walk.rs` | the indexable file set; US-654 feeds `rel` + `abs` to parse + upsert (US-653 just needs the `rel` shape) |
| `WikiAddress` parse + safe resolution | `mneme/src/store/address.rs` | addresses stay `{root}/{rel}`; the index stores `rel` per-root |
| `Config` / `RootConfig` (+ `ModelConfig { name, path, precision }`) | `mneme/src/config.rs` | derive `modelId` for the versioned path from `config.model` |
| `MnemeError` + `Result` (thiserror) | `mneme/src/error.rs` | extend with `Sqlite`/`Yaml`/`Schema` variants |
| stdout-discipline invariant (logs → stderr) | `lib.rs` / README | unchanged — no `println!` from the new modules |

The index DB is **per-root** (`.mneme/` lives inside the root folder), so an `IndexDb` instance is bound to one root; `documents.path` holds the **`rel`** path within that root, and full `{root}/{rel}` addresses are built at query time from the root name the `IndexDb` was opened with.

### Source module layout added by this task (subset of US-651's full layout)

```
mneme/src/
├─ lib.rs            + pub mod markdown;  + pub mod index;
├─ error.rs          + Sqlite / Yaml / Schema variants
├─ markdown/
│  ├─ mod.rs         parse_document(...) -> ParsedDoc { meta, chunks }; re-exports
│  ├─ frontmatter.rs split the leading `---` block, deserialize RawFrontmatter (serde),
│  │                  resolve EffectiveMeta with fallbacks (title/created/tags/verified)
│  └─ chunker.rs     heading-based chunker + size cap (pulldown-cmark); plain-text window fallback
└─ index/
   ├─ mod.rs         IndexDb: open_or_create / meta / upsert_document / delete_document /
   │                  doc_state / all_doc_paths / search_fts (test/US-655 helper)
   ├─ schema.rs      DDL string + SCHEMA_VERSION const + sqlite-vec auto-extension registration
   └─ path.rs        versioned path resolution + modelId derivation + .mneme/.gitignore writer
```

`tokio`, `notify`, `ort`/`tokenizers`, `reqwest`, `rmcp` are still **not** added — the markdown + index layers are synchronous. The only new runtime deps are the SQLite stack, YAML, markdown, date, and hashing crates (Step 1).

## Implementation plan

### Step 1 — Dependencies (`mneme/Cargo.toml`)

Add to `[dependencies]` (versions verified mid-2026; pin in `Cargo.lock`, confirm latest minors at build time):

```toml
rusqlite       = { version = "0.40", features = ["bundled"] }   # static SQLite (incl. FTS5); no system lib
sqlite-vec     = "0.1"            # vec0 vector extension (bundles its C source, built via cc)
serde_yaml_ng  = "0.10"           # YAML frontmatter (maintained successor to the archived serde_yaml)
pulldown-cmark = "0.13"           # markdown parse → heading-aware chunking
chrono         = "0.4"            # YYYY-MM-DD parse + SystemTime→date (UTC); see Concern 6
sha2           = "0.11"           # content hash (documents.content_hash)
hex            = "0.4"            # sha2 digest → lowercase hex
```

Notes:
- **FTS5:** the `bundled` SQLite is compiled with `SQLITE_ENABLE_FTS5`, so SQL-level `CREATE VIRTUAL TABLE … USING fts5(…)` + `MATCH` work without an extra feature. Add `rusqlite`'s `"fts5"` feature **only** if we ever call rusqlite's FTS5 *Rust* API (custom tokenizers) — we don't here. Verify at build (Concern 1).
- **`zerocopy`** (f32→bytes vector encoding) is **not** added now — `chunks_vec` stays empty in US-653; encoding lands with embeddings in US-657/658.
- `noyalib` (pure-Rust, zero-unsafe YAML) is a possible lighter alternative to `serde_yaml_ng`, but it's pre-1.0 (0.0.x) with little adoption; `serde_yaml_ng` matches US-651's tech table and is far more battle-tested. Frontmatter is tiny author-controlled YAML, so the libyaml backend's `unsafe` is not a practical concern.

### Step 2 — Frontmatter parser (`markdown/frontmatter.rs`)

- **Split the block:** if the file starts with `---\n` (allowing a leading BOM/whitespace tolerance kept minimal), find the closing `\n---` line; everything between is the YAML block, everything after is the body. No leading `---` → empty frontmatter, whole file is body.
- **`RawFrontmatter`** (all `Option`, `#[serde(default)]`): `title: Option<String>`, `tags: Option<Vec<String>>`, `created: Option<String>`, `verified: Option<String>`. Deserialize with `serde_yaml_ng::from_str`. **Malformed YAML → treat as no frontmatter** (log at `warn`, fall back to computed values); indexing must never fail on a bad block (Concern 8).
- **`EffectiveMeta { title: String, tags: Vec<String>, created: Option<String>, verified: Option<String> }`** resolved from `(raw, filename, birthtime, mtime)`:
  - `title` = `raw.title` else first H1 in body (reuse the chunker's heading scan / a cheap first-`# ` line via pulldown-cmark) else filename stem.
  - `tags` = `raw.tags` else `[]`.
  - `created` = `raw.created` (validated `YYYY-MM-DD`) else `birthtime`→`YYYY-MM-DD` (UTC) else `mtime`→`YYYY-MM-DD` (UTC). Stored as ISO date TEXT (Concern 6).
  - `verified` = `raw.verified` (validated `YYYY-MM-DD`) else `None`.
  - Invalid date strings in frontmatter are dropped to the fallback (don't fail).

### Step 3 — Chunker (`markdown/chunker.rs`)

- **`Chunk { ordinal: usize, heading: Option<String>, text: String }`**.
- **`chunk_markdown(body: &str) -> Vec<Chunk>`** using `pulldown-cmark` (`Parser::new_ext`, default options):
  - Walk events; a `Event::Start(Tag::Heading{ level, .. })` opens a new **section** whose `heading` is the heading text (accumulated from `Event::Text` until `Event::End(TagEnd::Heading(_))`). Body text/code/list events between headings accumulate into the current section's text.
  - Using the parser (not a line `^#` split) means a `#` inside a fenced code block is **not** mistaken for a heading, and setext headings are handled (Concern 10).
  - Content before the first heading becomes an initial chunk with `heading: None`.
- **Size cap:** `const MAX_CHUNK_CHARS: usize = 2000;` (~500 tokens — tunable when embeddings land in US-657). A section longer than the cap is split into ≤cap windows (prefer paragraph/line boundaries; hard-split only if a single line exceeds the cap), each keeping the section's `heading` and a continuing `ordinal`.
- **Ordinals** are document-global, assigned in document order across all chunks.
- **Plain-text fallback** `chunk_plain(body: &str) -> Vec<Chunk>` (fixed ≤cap windows, `heading: None`) is included for non-`.md` files, but **non-md indexing itself stays deferred** (US-651) — US-654 only feeds `.md` through `chunk_markdown` for now.
- **Heading path** (e.g. `H1 > H2`) is a nice-to-have for snippet display — **deferred**; store the nearest heading text only.

`markdown/mod.rs` exposes `parse_document(filename: &str, content: &str, birthtime: Option<SystemTime>, mtime: SystemTime) -> ParsedDoc { meta: EffectiveMeta, chunks: Vec<Chunk> }` — split frontmatter, resolve `EffectiveMeta`, chunk the body. (US-654 supplies `content`/`birthtime`/`mtime` from the walk; US-653 tests supply them directly.)

### Step 4 — Versioned path + modelId (`index/path.rs`)

- **`SCHEMA_VERSION: u32 = 1`** (crate const, lives in `schema.rs`; re-export or reference here).
- **`model_id(model: &ModelConfig) -> String`** = `format!("{}-{}", name, precision)` with D5 defaults when unset: `name` → `"gte-multilingual-base"`, `precision` → `"int8"` → e.g. `gte-multilingual-base-int8`. (The model isn't downloaded until US-656; the path is keyed on the **configured/target** model so it's stable, and FTS works before the model exists — Concern 5.)
- **`index_db_path(root_folder: &Path, model_id: &str, schema_ver: u32) -> PathBuf`** = `root_folder/.mneme/{model_id}/index-v{schema_ver}.db`.
- **`ensure_mneme_dir(root_folder)`** — create `.mneme/` if missing and write `.mneme/.gitignore` with `*` (once; don't clobber if present).
- Use the existing `file-path`-free `std::path` here (Rust crate, not the TS `file-path` rule — that rule is Persephone-renderer-only).

### Step 5 — Schema + sqlite-vec registration (`index/schema.rs`)

- **`register_sqlite_vec()`** — register `sqlite-vec` as a SQLite **auto-extension** so every connection has `vec0`. Current pattern (rusqlite 0.40):
  ```rust
  use rusqlite::auto_extension::{register_auto_extension, RawAutoExtension};
  use sqlite_vec::sqlite3_vec_init;
  pub fn register_sqlite_vec() {
      // Process-global; call ONCE before opening any Connection (Concern 1).
      unsafe {
          let raw: RawAutoExtension = std::mem::transmute(sqlite3_vec_init as usize);
          register_auto_extension(raw).expect("register sqlite-vec");
      }
  }
  ```
  Guard with a `std::sync::Once` so repeated `IndexDb::open_or_create` calls (and tests) register exactly once.
- **DDL** (`CREATE TABLE IF NOT EXISTS …`), applied in a transaction on a freshly created DB:
  ```sql
  CREATE TABLE documents (
    id           INTEGER PRIMARY KEY,
    path         TEXT NOT NULL UNIQUE,   -- rel path within the root, forward-slash
    title        TEXT NOT NULL,
    created      TEXT,                   -- ISO YYYY-MM-DD (effective; fallback-filled)
    verified     TEXT,                   -- ISO YYYY-MM-DD or NULL
    content_hash TEXT NOT NULL,
    mtime        INTEGER NOT NULL,       -- epoch seconds (reconcile fast-path)
    size         INTEGER NOT NULL
  );
  CREATE TABLE doc_tags (
    doc_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    tag    TEXT NOT NULL,
    PRIMARY KEY (doc_id, tag)
  );
  CREATE INDEX idx_doc_tags_tag ON doc_tags(tag);          -- wiki_tags counts / tag filters
  CREATE TABLE chunks (
    id      INTEGER PRIMARY KEY,
    doc_id  INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL,
    heading TEXT,
    text    TEXT NOT NULL
  );
  CREATE INDEX idx_chunks_doc ON chunks(doc_id);
  CREATE VIRTUAL TABLE chunks_fts USING fts5(text, content='chunks', content_rowid='id');
  CREATE VIRTUAL TABLE chunks_vec USING vec0(embedding float[768]);   -- empty until US-657/658
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  ```
  - `chunks_fts` is **external-content** over `chunks` (no duplicated text). It is kept in sync **manually** in `upsert`/`delete` (Concern 2) — no triggers.
  - `chunks_vec` dim = **768** (D5 default). Stored in `meta` too; US-657/658 must match the real model's dims (a mismatch → different `modelId` → fresh DB).
- **`meta` rows** written on create: `schema_version`, `model`, `precision`, `dims`. On open of an existing DB, read + assert `schema_version == SCHEMA_VERSION` (defense-in-depth — the path already encodes it; mismatch → `MnemeError::Schema`).
- **Pragmas on open:** `PRAGMA journal_mode=WAL;` and `PRAGMA foreign_keys=ON;` (FK cascade needs it). Full single-writer/reader-pool concurrency is **US-659**; US-653 just opens a single connection with sane pragmas.

### Step 6 — IndexDb (`index/mod.rs`)

```rust
pub struct IndexDb { conn: rusqlite::Connection, root_name: String }

pub struct DocState { pub content_hash: String, pub mtime: i64, pub size: i64 }

impl IndexDb {
    /// Resolve the versioned path under root_folder/.mneme/, ensure the dir + .gitignore,
    /// open (WAL + FK), create schema + meta if new, validate schema_version if existing.
    pub fn open_or_create(root_name: &str, root_folder: &Path, model: &ModelConfig) -> Result<Self>;

    pub fn meta(&self) -> Result<Meta>;                          // model, precision, dims, schema_version

    /// Delete-then-insert. Replaces any existing rows for `rel_path`:
    /// 1. look up existing doc id; collect its chunk ids;
    /// 2. delete those rows from chunks_fts and chunks_vec by rowid (virtual tables are NOT
    ///    reached by FK cascade — Concern 2); delete the document (cascades chunks + doc_tags);
    /// 3. insert document (effective meta + content_hash + mtime + size), doc_tags,
    ///    chunks; insert chunks_fts(rowid=chunk.id, text). chunks_vec left empty (US-658).
    /// All in one transaction.
    pub fn upsert_document(&self, rel_path: &str, doc: &ParsedDoc,
                           content_hash: &str, mtime: i64, size: i64) -> Result<()>;

    pub fn delete_document(&self, rel_path: &str) -> Result<()>;  // same virtual-table cleanup

    pub fn doc_state(&self, rel_path: &str) -> Result<Option<DocState>>;  // reconcile dedup (US-654)
    pub fn all_doc_paths(&self) -> Result<Vec<String>>;                   // reconcile deletes (US-654)

    /// Minimal FTS query — proves chunks_fts works; returns (rel_path, heading, snippet).
    /// The ranked, filtered, hybrid wiki_search is US-655/658; this is the test/early-text-search seam.
    pub fn search_fts(&self, query: &str, limit: usize) -> Result<Vec<FtsHit>>;
}
```

- **`content_hash(bytes: &[u8]) -> String`** helper (sha2 → hex) lives here (or in a small `index/hash.rs`); US-654 calls it for dedup decisions, US-653 uses it to store complete rows (Concern 4).
- `search_fts` uses `chunks_fts MATCH ?` joined to `documents` for the `rel_path`; `snippet(chunks_fts, …)` for the excerpt. Keep it simple — relevance tuning + RRF + vector are US-658.

### Step 7 — Error variants (`error.rs`)

Add: `Sqlite(#[from] rusqlite::Error)`, `Yaml(String)` (from `serde_yaml_ng::Error` — store as string to keep the enum light, mirroring `Config(String)`), `Schema(String)` (schema-version mismatch / corrupt meta). Keep the existing `Result` alias.

### Step 8 — Tests (`mneme/tests/index.rs`, fixtures generated at runtime)

Follow US-652's hermetic pattern — build fixtures programmatically under `CARGO_TARGET_TMPDIR`, nothing committed. Cover:
- **frontmatter:** full block parsed; missing fields fall back (title→H1→filename; created→birthtime/mtime UTC; tags→[]); malformed YAML degrades to "no frontmatter" without error; invalid date string falls back.
- **chunker:** splits by headings; a `#` inside a fenced code block does **not** start a chunk; an oversized section is split into ≤`MAX_CHUNK_CHARS` windows keeping the heading; pre-first-heading content is its own `heading: None` chunk; ordinals are contiguous and document-ordered.
- **schema/meta:** `open_or_create` builds the DB at the versioned path, writes `.mneme/.gitignore` (`*`), and `meta` reports the right model/precision/dims/schema_version; re-opening reuses it; a `schema_version` mismatch errors.
- **sqlite-vec loads:** creating the `chunks_vec` `vec0(embedding float[768])` table succeeds (proves the auto-extension is registered + links). A dummy-vector KNN round-trip is **deferred to US-658** (avoids pulling `zerocopy` now).
- **upsert → FTS:** upsert a parsed doc, `search_fts("term")` finds it with the right `rel_path`; re-upsert (changed content) replaces chunks (no dupes); `doc_tags` reflects the frontmatter tags.
- **delete:** `delete_document` removes the document, its `chunks`, `doc_tags`, and `chunks_fts` rows (search no longer matches; `all_doc_paths` no longer lists it).
- **reconcile helpers:** `doc_state` returns the stored hash/mtime/size; `all_doc_paths` lists every upserted path.

### Step 9 — Docs touch-ups (within this task)

- `mneme/README.md` — add `markdown/` + `index/` to the module-layout block; add a short "Index layout" note (`.mneme/<modelId>/index-v<schemaVer>.db`, self-ignored, rebuildable; `chunks_vec` empty until embeddings). Update the Status line to US-653.
- `mneme/mneme.example.toml` — no schema change; the `[model]` `name`/`precision` already drive `modelId` (a one-line comment pointing that out is enough).
- Epic/dashboard updates per the workflow (this doc linked; row marked appropriately) — see "Files changed".

## Concerns / open questions (with proposed resolutions)

**1. `sqlite-vec` auto-extension registration is the riskiest dependency.** It's a C extension; the Rust registration pattern **changed around rusqlite 0.34** — the old `transmute(_ as *const ())` form is broken.
→ **Resolution:** use `rusqlite::auto_extension::register_auto_extension` with `RawAutoExtension` (Step 5), called **once** process-globally before any `Connection` opens, guarded by `std::sync::Once`. The `sqlite-vec` crate bundles its own C source (built via `cc`) — no system library. **De-risk early:** US-653 creates the `chunks_vec` table now (even though empty) and a test asserts the `vec0` table is creatable — so a linking/registration failure surfaces in this task, not in US-658. Treat exact API as **verify-at-build** (same posture as `rmcp` in US-651). If `sqlite-vec` ever fails to link/register, the fallback is to load it as a runtime loadable extension (`Connection::load_extension`) shipped beside the exe — recorded, not expected.

**2. FTS5 sync strategy + virtual-table cleanup (triggers vs manual).** `chunks_fts` (external-content FTS5) and `chunks_vec` (vec0) are **virtual tables not reached by `ON DELETE CASCADE`** — deleting a `documents`/`chunks` row does **not** remove their rows.
→ **Resolution:** manage both **manually** in `upsert`/`delete` (all write logic in one Rust place, easy to reason about and test): on replace/delete, collect the doc's chunk ids first, then `DELETE FROM chunks_fts WHERE rowid IN (…)` and `DELETE FROM chunks_vec WHERE rowid IN (…)` before deleting the `documents` row (which cascades `chunks` + `doc_tags`). FTS5 triggers are the documented alternative but add trigger subtleties for the external-content case; manual sync is preferred here. `chunks_vec` deletes are written now (defensive) even though it's empty until US-658.

**3. Where the US-653 ↔ US-654 ↔ US-655/657/658 line falls.** The upsert/parse/chunk pieces are the *backends* the indexer drives, but the walk→hash→dedup→upsert **orchestration** + watcher + reconcile loop is US-654; embeddings into `chunks_vec` are US-657/658; ranked filtered hybrid `wiki_search` is US-655/658.
→ **Resolution (scope fence):** US-653 ships `markdown/` + `index/` as **synchronous libraries** — `parse_document`, `IndexDb` with delete-then-insert `upsert_document`, `delete_document`, and the reconcile read helpers (`doc_state`, `all_doc_paths`) plus a minimal `search_fts` for tests. **No** `tokio`/`notify`/`ort`. `chunks_vec` is created but stays empty. US-654 adds the walker+watcher+reconcile that *call* these; US-657/658 fill `chunks_vec` + build hybrid search; US-655 wraps it all in MCP. No CLI surface added beyond an optional read-only `status` line (Step 9 keeps it minimal / tests carry the proof).

**4. Content-hash ownership (`documents.content_hash`).** The column must be populated on upsert, but the **dedup decision** (skip unchanged files) is US-654's reconcile.
→ **Resolution:** US-653 provides a `content_hash(&[u8]) -> hex` helper (sha2) and **stores** the hash on every upsert so rows are complete; US-654 reads it back via `doc_state` to decide skip/reprocess/delete. `sha2` + `hex` deps land here. (This keeps the `documents` row self-describing and lets US-653 tests assert `doc_state`.)

**5. `modelId` / `dims` before the embedding model exists.** The versioned DB path keys on `(model+precision, schemaVer)`, but the model isn't downloaded until US-656 and embeddings aren't computed until US-657.
→ **Resolution:** derive `modelId` from `config.model` with **D5 defaults** (`gte-multilingual-base` / `int8`) → a stable path `.mneme/gte-multilingual-base-int8/index-v1.db`; `dims = 768` (D5, verified locally per EPIC-032). FTS5 is fully functional with no vectors (D11), so the DB is useful immediately. `meta` records model/precision/dims/schema_version. If the **real** model later reports different dims/precision, that's a different `modelId` → a **fresh** DB (the decided versioned-rebuild, US-651 "Schema migrations") — no migration code, no corruption risk.

**6. Date storage format + timezone determinism.** `created`/`verified` are calendar dates; the birthtime/mtime fallbacks are `SystemTime` instants.
→ **Resolution:** store `created`/`verified` as **ISO `YYYY-MM-DD` TEXT** — lexicographic order == chronological, so date-range filters (US-655/658) are plain `BETWEEN`/`>=`/`<=` SQL, no date functions. Convert `SystemTime` → date via **`chrono::DateTime<Utc>`** (never `Local` — `Local` is machine-dependent and breaks test determinism). The explicit frontmatter `created:` is authoritative (D14); the UTC-derived fallback is used only when it's absent. `mtime` is **also** stored as epoch-seconds INTEGER for the reconcile fast-path (US-654's mtime+size compare). Chosen `chrono` over `time` for one-line `NaiveDate` parsing + `SystemTime` conversion (the `time` crate needs feature flags + format-description macros for the same).

**7. `birthtime` is not available on every platform/filesystem.** `std::fs::Metadata::created()` errors on some Linux kernels/filesystems (it's reliable on the Windows target).
→ **Resolution:** fallback chain `created` frontmatter → birthtime (`created()`) → **mtime** (`modified()`) — exactly D14 ("file mtime only a fallback"). `parse_document` takes `birthtime: Option<SystemTime>` (the caller passes `metadata.created().ok()`); when `None`, it uses `mtime`. No platform-specific code.

**8. Malformed / open-schema frontmatter.** A document may have a broken YAML block, or extra keys beyond the four we read.
→ **Resolution:** **never fail indexing on frontmatter.** A YAML parse error → log `warn`, treat as no-frontmatter, use all computed fallbacks. Extra/unknown keys are simply ignored by serde (we don't `deny_unknown_fields`). The epic's "open schema — unknown keys preserved on rewrite" requirement is **already satisfied with zero work**: there is no structured rewrite path in this epic — `wiki_write` (US-655) writes the **whole file verbatim**, so unknown keys round-trip naturally. US-653 only *reads* frontmatter for indexing.

**9. Chunk size cap value + non-md chunking.** The heading chunker needs a concrete cap; non-md plain-text chunking is configurable-but-deferred (US-651).
→ **Resolution:** `MAX_CHUNK_CHARS = 2000` (~500 tokens) as a tunable constant — revisit when the real tokenizer lands in US-657 (a token-based cap can replace the char cap behind the same `chunk_markdown` surface). A `chunk_plain` fixed-window chunker is included (trivial) for future non-md indexing, but **non-md indexing stays deferred** — US-654 feeds only `.md` through `chunk_markdown`. Heading *path* (H1>H2 breadcrumb) for snippets is deferred; store the nearest heading only.

**10. Heading detection must respect markdown structure.** A naive `^#` line split would mis-split on `#` inside fenced code blocks and miss setext (`===`/`---`) headings.
→ **Resolution:** chunk via **`pulldown-cmark`** events (`Tag::Heading` / `TagEnd::Heading`), not line regex — fenced code and setext are handled correctly. Default `Options` (no need for heading-attribute parsing). This is why `pulldown-cmark` is a dependency rather than hand-rolling the split.

## Acceptance criteria

- [x] `cargo build --release` and `cargo test` pass on Windows with the new SQLite/YAML/markdown/date/hash deps (CI `cargo build` step from US-652 still green).
- [x] `parse_document` returns `EffectiveMeta` with correct fallbacks (title→H1→filename; created→birthtime→mtime as UTC `YYYY-MM-DD`; tags→[]; verified optional) and chunks split by heading with the `MAX_CHUNK_CHARS` cap; malformed frontmatter degrades gracefully.
- [x] The chunker does not treat `#` inside fenced code blocks as a heading (covered by a test).
- [x] `IndexDb::open_or_create` builds the per-root DB at `.mneme/<modelId>/index-v<schemaVer>.db`, writes `.mneme/.gitignore` (`*`), and records `meta` (model, precision, dims=768, schema_version); re-open reuses it; a schema-version mismatch is an error.
- [x] The `chunks_vec` `vec0(embedding float[768])` table is created successfully — `sqlite-vec` is registered as an auto-extension and links into the binary (covered by a test, incl. `vec_version()`); the table stays empty (embeddings = US-657/658).
- [x] `upsert_document` is delete-then-insert: re-upserting a changed document replaces its chunks/FTS/tags with no duplication; `search_fts` finds an upserted document by a body term and returns its full `{root}/{rel}` address.
- [x] `delete_document` removes the document plus its `chunks`, `doc_tags`, and `chunks_fts` rows (and `chunks_vec` rows by rowid).
- [x] `doc_state` / `all_doc_paths` return the stored hash/mtime/size and the full path set (the reconcile read seam for US-654).
- [x] No new async/watcher/MCP/embedding code; `chunks_vec` empty; all logging still stderr-only.

## Implementation notes (post-hoc — deviations from the plan above)

Implemented and verified (`cargo build --release` + `cargo test` → 32/32 pass on Windows, cargo 1.93.1; library + release build clean, no warnings). Deliberate deviations:

1. **FTS5 table is *standalone*, not external-content.** The plan (Concern 2) proposed external-content FTS5 (`content='chunks'`) with manual sync. In practice external-content **deletes** require re-supplying the original column text (the `'delete'` command) and are error-prone; a **standalone** `CREATE VIRTUAL TABLE chunks_fts USING fts5(text)` keyed by `rowid = chunks.id` supports plain `INSERT`/`DELETE BY rowid` directly. The small text duplication is fine at personal scale. Manual upsert/delete sync (and the explicit `chunks_vec`-by-rowid cleanup, since FK cascade doesn't reach virtual tables) is unchanged.
2. **Crate version floors:** `rusqlite = "0.37"` (resolves `libsqlite3-sys` 0.35 / SQLite 3.x with FTS5 built in; has the `auto_extension::register_auto_extension` + `RawAutoExtension` API) and `sha2 = "0.10"` — slightly below the "0.40 / 0.11" the planning research reported, but the registration API and `Digest` surface are identical; pinned in `Cargo.lock`. `sqlite-vec` 0.1.9, `pulldown-cmark` 0.13.4, `serde_yaml_ng` 0.10, `chrono` 0.4.45, `hex` 0.4.3.
3. **`search_fts` expects plain (alphanumeric) query terms.** FTS5 treats `-`/`:`/quotes as query operators; the minimal helper passes the term through verbatim, so a term like `unique-token` parses as an operator expression. This is acceptable for the test/early-text-search seam — US-655's real `wiki_search` will own query escaping/validation. (Surfaced by a test; fixture terms are plain words.)
4. **No CLI change.** `status`/`serve` are untouched (the plan flagged a `status` index line as optional); the index layer is proven entirely by `tests/index.rs`. `rusqlite` is added as a **dev-dependency** (same version/features → no extra compile) so two tests can tamper/inspect the DB file directly (schema-mismatch, `doc_tags`).
5. **Bug fixed during implementation — upsert must delete the `documents` row.** First pass cleared only the virtual-table rows in `remove_doc_rows`; the re-insert then tripped `UNIQUE(documents.path)`. Corrected so upsert deletes the existing `documents` row (cascading `chunks` + `doc_tags`) before re-inserting. Covered by `reupsert_replaces_chunks_without_duplication`.

## Files changed (summary)

| File | Change |
|------|--------|
| `mneme/Cargo.toml` | edit — add `rusqlite` (bundled), `sqlite-vec`, `serde_yaml_ng`, `pulldown-cmark`, `chrono`, `sha2`, `hex` |
| `mneme/Cargo.lock` | edit — pinned |
| `mneme/src/lib.rs` | edit — `pub mod markdown;` + `pub mod index;` |
| `mneme/src/error.rs` | edit — add `Sqlite` / `Yaml` / `Schema` variants |
| `mneme/src/markdown/mod.rs` | **new** — `parse_document` → `ParsedDoc { meta, chunks }` |
| `mneme/src/markdown/frontmatter.rs` | **new** — split `---` block, `RawFrontmatter`, `EffectiveMeta` + fallbacks |
| `mneme/src/markdown/chunker.rs` | **new** — heading chunker + size cap (pulldown-cmark); plain-text fallback |
| `mneme/src/index/mod.rs` | **new** — `IndexDb` (open_or_create / meta / upsert / delete / doc_state / all_doc_paths / search_fts) + `content_hash` |
| `mneme/src/index/schema.rs` | **new** — DDL + `SCHEMA_VERSION` + `register_sqlite_vec` |
| `mneme/src/index/path.rs` | **new** — versioned path + `model_id` + `.mneme/.gitignore` |
| `mneme/tests/index.rs` | **new** — frontmatter / chunker / schema / sqlite-vec-loads / upsert→FTS / delete / reconcile-helpers tests |
| `mneme/README.md` | edit — module layout + index-layout note + status line |
| `mneme/mneme.example.toml` | edit — one comment noting `[model]` drives the index `modelId` path |
| `doc/active-work.md` | edit — link the US-653 entry to this doc |
| `doc/epics/EPIC-032.md` | edit — link the US-653 row in Linked Tasks |

### Files that need NO changes (don't investigate)

- `mneme/src/store/**` — the Document Store/walk/address/grep are stable from US-652; US-653 builds *beside* them, not into them. (US-654 wires the walk to the indexer.)
- `mneme/src/main.rs` — no required CLI change (an optional read-only index line in `status` is the only candidate; tests carry the proof). `serve` stays a US-655 stub.
- `mneme/build.rs`, `.github/workflows/publish.yml`, `.gitignore` — build wiring is unchanged (the existing `cargo build --release` step covers the new deps; `.mneme/` is already self-ignored and `mneme/target/` already gitignored).
- Any Persephone TypeScript / `src/main/**` — no Persephone integration in this task (US-660+).
```


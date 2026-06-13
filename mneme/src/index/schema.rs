//! Index DB schema + `sqlite-vec` auto-extension registration.
//!
//! The schema version is encoded in the DB *path* (see [`super::path`]); a bump there selects
//! a fresh versioned file rather than migrating in place. `meta` carries the same identity for
//! self-description / defense-in-depth.

use std::sync::Once;

/// Bump when the table layout changes — selects a new `index-v<N>.db` path (full rebuild).
pub const SCHEMA_VERSION: u32 = 1;

/// Embedding dimension for the `chunks_vec` table. D5 (gte-multilingual-base = 768). The table
/// stays empty until US-657/658; if the real model reports different dims, that's a different
/// `modelId` → a fresh DB.
pub const EMBED_DIM: u32 = 768;

static REGISTER_VEC: Once = Once::new();

/// Register `sqlite-vec` as a SQLite auto-extension so every connection has `vec0`.
///
/// Process-global; must run before any `Connection` opens. Guarded by `Once` so repeated
/// `IndexDb::open_or_create` calls (and tests) register exactly once. `sqlite-vec` bundles its
/// own C source (built via `cc`) — no system library.
pub fn register_sqlite_vec() {
    REGISTER_VEC.call_once(|| {
        use rusqlite::auto_extension::{register_auto_extension, RawAutoExtension};
        use sqlite_vec::sqlite3_vec_init;
        // SAFETY: `sqlite3_vec_init` has the standard SQLite extension-init ABI; transmuting the
        // bare `extern "C" fn()` symbol to `RawAutoExtension` matches what sqlite-vec expects.
        unsafe {
            let raw: RawAutoExtension = std::mem::transmute(sqlite3_vec_init as *const ());
            register_auto_extension(raw).expect("register sqlite-vec auto-extension");
        }
    });
}

/// Full schema DDL, applied in one transaction on a freshly created DB.
///
/// - `chunks_fts` is a standalone FTS5 table keyed by `rowid = chunks.id`; kept in sync
///   manually in upsert/delete (virtual tables are not reached by FK cascade). A standalone
///   table (vs external-content) stores its own text copy so plain `INSERT`/`DELETE BY rowid`
///   work directly — external-content deletes need the original text and are error-prone; the
///   small duplication is fine at personal scale.
/// - `chunks_vec` (vec0) holds embeddings — created separately (needs `EMBED_DIM`), populated
///   in US-657/658.
pub const SCHEMA_SQL: &str = "\
CREATE TABLE documents (
    id           INTEGER PRIMARY KEY,
    path         TEXT NOT NULL UNIQUE,
    title        TEXT NOT NULL,
    created      TEXT,
    verified     TEXT,
    content_hash TEXT NOT NULL,
    mtime        INTEGER NOT NULL,
    size         INTEGER NOT NULL
);
CREATE TABLE doc_tags (
    doc_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    tag    TEXT NOT NULL,
    PRIMARY KEY (doc_id, tag)
);
CREATE INDEX idx_doc_tags_tag ON doc_tags(tag);
CREATE TABLE chunks (
    id      INTEGER PRIMARY KEY,
    doc_id  INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL,
    heading TEXT,
    text    TEXT NOT NULL
);
CREATE INDEX idx_chunks_doc ON chunks(doc_id);
CREATE VIRTUAL TABLE chunks_fts USING fts5(text);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
";

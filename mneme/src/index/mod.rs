//! Per-root SQLite index — schema owner + document upsert/delete + reconcile read helpers.
//!
//! One [`IndexDb`] is bound to one wiki root (the `.mneme/` folder lives inside the root, D12);
//! `documents.path` holds the forward-slash `rel` path within that root, and full
//! `{root}/{rel}` addresses are built from the `root_name` the DB was opened with. The index is
//! a derived, rebuildable artifact — the files on disk stay the source of truth.
//!
//! Scope (US-653): schema + frontmatter/chunk persistence + the read seam reconcile (US-654)
//! needs. Embeddings populate `chunks_vec` in US-657/658; the orchestrating walk/watcher is
//! US-654; ranked hybrid `wiki_search` is US-655/658. `search_fts` here is a minimal FTS query
//! that proves the index works and seeds early text search.

pub mod path;
pub mod schema;

use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};

use crate::config::ModelConfig;
use crate::error::{MnemeError, Result};
use crate::markdown::ParsedDoc;

use schema::{EMBED_DIM, SCHEMA_VERSION};

pub struct IndexDb {
    conn: Connection,
    root_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Meta {
    pub model: String,
    pub precision: String,
    pub dims: u32,
    pub schema_version: u32,
}

/// Stored per-document state for reconcile dedup (US-654).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocState {
    pub content_hash: String,
    pub mtime: i64,
    pub size: i64,
}

/// A minimal FTS hit — `address` is the full `{root}/{rel}`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FtsHit {
    pub address: String,
    pub heading: Option<String>,
    pub snippet: String,
}

/// SHA-256 of bytes as a lowercase hex string (documents.content_hash). US-654 calls this for
/// reconcile dedup decisions; US-653 uses it to store complete rows.
pub fn content_hash(bytes: &[u8]) -> String {
    let digest: [u8; 32] = Sha256::digest(bytes).into();
    hex::encode(digest)
}

impl IndexDb {
    /// Open (or create) the per-root index at `<root_folder>/.mneme/<modelId>/index-v<N>.db`.
    /// A new DB gets the schema + `meta`; an existing DB's `schema_version` is validated.
    pub fn open_or_create(root_name: &str, root_folder: &Path, model: &ModelConfig) -> Result<Self> {
        schema::register_sqlite_vec();

        let model_id = path::model_id(model);
        let db_path = path::index_db_path(root_folder, &model_id);
        let is_new = !db_path.exists();

        path::ensure_mneme_dir(root_folder)?;
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let conn = Connection::open(&db_path)?;
        conn.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;")?;

        let (model_name, precision) = (
            model.name.as_deref().unwrap_or("gte-multilingual-base"),
            model.precision.as_deref().unwrap_or("int8"),
        );

        if is_new {
            conn.execute_batch(schema::SCHEMA_SQL)?;
            // chunks_vec needs the embedding dim interpolated; created after the static schema
            // so a sqlite-vec link/registration failure surfaces here (and in US-653 tests).
            conn.execute_batch(&format!(
                "CREATE VIRTUAL TABLE chunks_vec USING vec0(embedding float[{EMBED_DIM}]);"
            ))?;
            for (k, v) in [
                ("schema_version", SCHEMA_VERSION.to_string()),
                ("model", model_name.to_string()),
                ("precision", precision.to_string()),
                ("dims", EMBED_DIM.to_string()),
            ] {
                conn.execute("INSERT INTO meta (key, value) VALUES (?1, ?2)", params![k, v])?;
            }
        }

        let db = Self { conn, root_name: root_name.to_string() };

        if !is_new {
            let stored = db.meta()?;
            if stored.schema_version != SCHEMA_VERSION {
                return Err(MnemeError::Schema(format!(
                    "index schema v{} != expected v{} at {}",
                    stored.schema_version,
                    SCHEMA_VERSION,
                    db_path.display()
                )));
            }
        }
        Ok(db)
    }

    pub fn root_name(&self) -> &str {
        &self.root_name
    }

    pub fn meta(&self) -> Result<Meta> {
        let get = |key: &str| -> Result<String> {
            self.conn
                .query_row("SELECT value FROM meta WHERE key=?1", [key], |r| r.get(0))
                .map_err(|_| MnemeError::Schema(format!("missing meta key '{key}'")))
        };
        Ok(Meta {
            model: get("model")?,
            precision: get("precision")?,
            dims: get("dims")?.parse().unwrap_or(EMBED_DIM),
            schema_version: get("schema_version")?.parse().unwrap_or(0),
        })
    }

    /// Delete-then-insert. Replaces any existing rows for `rel_path` with the parsed document.
    /// `chunks_vec` is left empty (embeddings = US-657/658). All in one transaction.
    pub fn upsert_document(
        &self,
        rel_path: &str,
        doc: &ParsedDoc,
        content_hash: &str,
        mtime: i64,
        size: i64,
    ) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;

        if let Some(doc_id) = doc_id_for(&tx, rel_path)? {
            remove_doc_rows(&tx, doc_id)?;
            // Delete the document row too (cascades chunks + doc_tags) before re-inserting,
            // else the UNIQUE(path) constraint trips.
            tx.execute("DELETE FROM documents WHERE id=?1", [doc_id])?;
        }

        tx.execute(
            "INSERT INTO documents (path, title, created, verified, content_hash, mtime, size)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                rel_path,
                doc.meta.title,
                doc.meta.created,
                doc.meta.verified,
                content_hash,
                mtime,
                size
            ],
        )?;
        let doc_id = tx.last_insert_rowid();

        for tag in &doc.meta.tags {
            tx.execute(
                "INSERT OR IGNORE INTO doc_tags (doc_id, tag) VALUES (?1, ?2)",
                params![doc_id, tag],
            )?;
        }

        {
            let mut ins_chunk = tx.prepare(
                "INSERT INTO chunks (doc_id, ordinal, heading, text) VALUES (?1, ?2, ?3, ?4)",
            )?;
            let mut ins_fts = tx.prepare("INSERT INTO chunks_fts (rowid, text) VALUES (?1, ?2)")?;
            for c in &doc.chunks {
                ins_chunk.execute(params![doc_id, c.ordinal as i64, c.heading, c.text])?;
                let chunk_id = tx.last_insert_rowid();
                ins_fts.execute(params![chunk_id, c.text])?;
            }
        }

        tx.commit()?;
        Ok(())
    }

    pub fn delete_document(&self, rel_path: &str) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        if let Some(doc_id) = doc_id_for(&tx, rel_path)? {
            remove_doc_rows(&tx, doc_id)?;
            tx.execute("DELETE FROM documents WHERE id=?1", [doc_id])?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn doc_state(&self, rel_path: &str) -> Result<Option<DocState>> {
        Ok(self
            .conn
            .query_row(
                "SELECT content_hash, mtime, size FROM documents WHERE path=?1",
                [rel_path],
                |r| {
                    Ok(DocState {
                        content_hash: r.get(0)?,
                        mtime: r.get(1)?,
                        size: r.get(2)?,
                    })
                },
            )
            .optional()?)
    }

    pub fn all_doc_paths(&self) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare("SELECT path FROM documents ORDER BY path")?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    /// Minimal FTS query (proves the index + seeds early text search). Returns hits as full
    /// `{root}/{rel}` addresses with a snippet. The ranked, filtered, hybrid `wiki_search` with
    /// RRF + vectors is US-655/658.
    pub fn search_fts(&self, query: &str, limit: usize) -> Result<Vec<FtsHit>> {
        let mut stmt = self.conn.prepare(
            "SELECT d.path, c.heading, snippet(chunks_fts, 0, '[', ']', '…', 12)
             FROM chunks_fts
             JOIN chunks c    ON c.id = chunks_fts.rowid
             JOIN documents d ON d.id = c.doc_id
             WHERE chunks_fts MATCH ?1
             ORDER BY rank
             LIMIT ?2",
        )?;
        let root = self.root_name.clone();
        let rows = stmt.query_map(params![query, limit as i64], move |r| {
            let path: String = r.get(0)?;
            Ok(FtsHit {
                address: format!("{root}/{path}"),
                heading: r.get(1)?,
                snippet: r.get(2)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }
}

fn doc_id_for(conn: &Connection, rel_path: &str) -> Result<Option<i64>> {
    Ok(conn
        .query_row("SELECT id FROM documents WHERE path=?1", [rel_path], |r| r.get(0))
        .optional()?)
}

/// Remove a document's chunk-derived rows that FK cascade can't reach (the virtual tables).
/// `chunks` + `doc_tags` are cascaded when the `documents` row is deleted; `chunks_fts` and
/// `chunks_vec` (vec0) are virtual and must be deleted by `rowid` explicitly.
fn remove_doc_rows(conn: &Connection, doc_id: i64) -> Result<()> {
    let chunk_ids: Vec<i64> = {
        let mut stmt = conn.prepare("SELECT id FROM chunks WHERE doc_id=?1")?;
        let rows = stmt.query_map([doc_id], |r| r.get(0))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };
    for id in &chunk_ids {
        conn.execute("DELETE FROM chunks_fts WHERE rowid=?1", [id])?;
        // chunks_vec is empty until US-658, but delete defensively so the path is correct then.
        conn.execute("DELETE FROM chunks_vec WHERE rowid=?1", [id])?;
    }
    Ok(())
}

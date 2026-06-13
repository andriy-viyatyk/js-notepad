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
pub mod vector;

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use rusqlite::types::Value;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use sha2::{Digest, Sha256};

use crate::config::ModelConfig;
use crate::embed::Embedder;
use crate::error::{MnemeError, Result};
use crate::markdown::ParsedDoc;

use schema::{EMBED_DIM, SCHEMA_VERSION};

pub struct IndexDb {
    conn: Connection,
    root_name: String,
    db_path: PathBuf,
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

/// Metadata filters for [`IndexDb::search_text`] / `tag_counts` / `docs_with_tag` (US-655).
/// All FTS-compatible (plain SQL predicates) — the vector lane + RRF graft on in US-658.
#[derive(Debug, Clone, Default)]
pub struct SearchFilter {
    /// Rel-path prefix within the root (`""`/`None` = whole root).
    pub subtree: Option<String>,
    /// Document must carry every one of these tags.
    pub tags: Vec<String>,
    /// Document must carry none of these tags.
    pub exclude_tags: Vec<String>,
    /// Inclusive `documents.created` lower bound (ISO `YYYY-MM-DD`).
    pub created_from: Option<String>,
    /// Inclusive `documents.created` upper bound.
    pub created_to: Option<String>,
}

/// One `wiki_search` result row — one per document, best chunk wins the snippet.
#[derive(Debug, Clone, PartialEq)]
pub struct TextHit {
    pub address: String,
    pub title: String,
    pub tags: Vec<String>,
    pub snippet: String,
    /// FTS5 `bm25()` — **lower is better** (may be negative). Callers sort ascending.
    pub score: f64,
}

/// Effective document metadata read back from the index (`wiki_timeline`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocMeta {
    pub path: String,
    pub title: String,
    pub created: Option<String>,
    pub verified: Option<String>,
    pub tags: Vec<String>,
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

        let db = Self {
            conn,
            root_name: root_name.to_string(),
            db_path: db_path.clone(),
        };

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

    /// The on-disk path of this versioned index DB (`wiki_status` inventory). US-655.
    pub fn db_path(&self) -> &Path {
        &self.db_path
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

    /// Refresh just the filesystem stat for an unchanged document — the content hash matched
    /// but `mtime`/`size` moved (e.g. `touch`, `git checkout`). Avoids a redundant re-parse +
    /// re-upsert on the next reconcile (the mtime+size fast-path then hits). US-654.
    pub fn update_doc_stat(&self, rel_path: &str, mtime: i64, size: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE documents SET mtime=?2, size=?3 WHERE path=?1",
            params![rel_path, mtime, size],
        )?;
        Ok(())
    }

    /// Count of indexed documents (the `status` index-vs-disk report). US-654.
    pub fn doc_count(&self) -> Result<usize> {
        let n: i64 = self
            .conn
            .query_row("SELECT count(*) FROM documents", [], |r| r.get(0))?;
        Ok(n as usize)
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

    /// Ranked, filtered FTS text search (`wiki_search` text mode). One row per document — the
    /// best-ranking chunk wins the snippet — with the metadata filter applied as SQL predicates
    /// (subtree prefix, tags include/exclude, `created` range). `score` = bm25 (lower is better).
    pub fn search_text(&self, query: &str, filter: &SearchFilter, limit: usize) -> Result<Vec<TextHit>> {
        Ok(self.text_lane(query, filter, limit)?.into_iter().map(|(_, h)| h).collect())
    }

    /// Vector KNN lane (`wiki_search` vector mode). Pre-filters candidate chunk-ids by the
    /// metadata filter, runs a constrained KNN over `chunks_vec`, collapses to one row per
    /// document (the nearest chunk wins the snippet), best-first by distance. `score` = cosine
    /// distance (lower is better). `query_vec` must be the normalized query embedding.
    pub fn search_vector(&self, query_vec: &[f32], filter: &SearchFilter, limit: usize) -> Result<Vec<TextHit>> {
        Ok(self.vector_lane(query_vec, filter, limit)?.into_iter().map(|(_, h)| h).collect())
    }

    /// Hybrid lane (`wiki_search` hybrid mode). Runs the text + vector lanes and fuses them
    /// per-document with Reciprocal Rank Fusion. Best-first by RRF score (**higher is better**).
    pub fn search_hybrid(
        &self,
        query: &str,
        query_vec: &[f32],
        filter: &SearchFilter,
        limit: usize,
    ) -> Result<Vec<TextHit>> {
        let text = self.text_lane(query, filter, limit)?;
        let vecs = self.vector_lane(query_vec, filter, limit)?;

        // Keep the richest hit per doc (prefer the text snippet; fall back to the vector one).
        let mut by_doc: HashMap<i64, TextHit> = HashMap::new();
        for (doc_id, hit) in &vecs {
            by_doc.entry(*doc_id).or_insert_with(|| hit.clone());
        }
        for (doc_id, hit) in &text {
            by_doc.insert(*doc_id, hit.clone()); // text wins the snippet when present
        }

        let text_ids: Vec<i64> = text.iter().map(|(id, _)| *id).collect();
        let vec_ids: Vec<i64> = vecs.iter().map(|(id, _)| *id).collect();
        let fused = vector::rrf_merge(&text_ids, &vec_ids);

        let mut hits = Vec::with_capacity(limit);
        for (doc_id, rrf) in fused.into_iter().take(limit) {
            if let Some(mut h) = by_doc.remove(&doc_id) {
                h.score = rrf; // RRF: higher is better
                hits.push(h);
            }
        }
        Ok(hits)
    }

    /// FTS lane keeping the internal `doc_id` so the hybrid lane can fuse on it. One row per
    /// document, best-first by bm25 (ascending rank).
    fn text_lane(&self, query: &str, filter: &SearchFilter, limit: usize) -> Result<Vec<(i64, TextHit)>> {
        let mut sql = String::from(
            "SELECT d.id, d.path, d.title, bm25(chunks_fts) AS score,
                    snippet(chunks_fts, 0, '[', ']', '…', 12) AS snip
             FROM chunks_fts
             JOIN chunks c    ON c.id = chunks_fts.rowid
             JOIN documents d ON d.id = c.doc_id
             WHERE chunks_fts MATCH ?",
        );
        let mut p: Vec<Value> = vec![Value::Text(query.to_string())];
        push_filter_sql(&mut sql, &mut p, filter);
        // Headroom so per-document dedup (best chunk wins) can still fill `limit` documents.
        sql.push_str(" ORDER BY rank LIMIT ?");
        p.push(Value::Integer((limit as i64).saturating_mul(8).max(limit as i64)));

        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params_from_iter(p), |r| {
            Ok((
                r.get::<_, i64>(0)?,    // doc_id
                r.get::<_, String>(1)?, // path
                r.get::<_, String>(2)?, // title
                r.get::<_, f64>(3)?,    // score (bm25)
                r.get::<_, String>(4)?, // snippet
            ))
        })?;

        let mut seen = HashSet::new();
        let mut hits = Vec::new();
        for row in rows {
            let (doc_id, path, title, score, snippet) = row?;
            if !seen.insert(doc_id) {
                continue; // already kept this document's best chunk
            }
            hits.push((
                doc_id,
                TextHit {
                    address: format!("{}/{}", self.root_name, path),
                    title,
                    tags: self.tags_for_doc(doc_id)?,
                    snippet,
                    score,
                },
            ));
            if hits.len() >= limit {
                break;
            }
        }
        Ok(hits)
    }

    /// Vector KNN lane keeping the internal `doc_id`. Pre-filters candidate chunk-ids by the
    /// metadata filter (when present), runs a `rowid IN (…)`-constrained KNN, collapses to one
    /// row per document (nearest chunk wins), best-first by distance.
    fn vector_lane(&self, query_vec: &[f32], filter: &SearchFilter, limit: usize) -> Result<Vec<(i64, TextHit)>> {
        let k = (limit.saturating_mul(8)).max(limit) as i64;

        // Pre-filter: candidate chunk-ids matching the metadata filter (skipped when no filter).
        let candidates: Option<Vec<i64>> = if filter_is_empty(filter) {
            None
        } else {
            let mut sql =
                String::from("SELECT c.id FROM chunks c JOIN documents d ON d.id = c.doc_id WHERE 1=1");
            let mut p: Vec<Value> = Vec::new();
            push_filter_sql(&mut sql, &mut p, filter);
            let mut stmt = self.conn.prepare(&sql)?;
            let ids = stmt
                .query_map(params_from_iter(p), |r| r.get::<_, i64>(0))?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            if ids.is_empty() {
                return Ok(Vec::new()); // filter excludes everything → no vector hits
            }
            Some(ids)
        };

        let mut sql = String::from(
            "SELECT v.distance, c.doc_id, c.heading, c.text, d.path, d.title
             FROM chunks_vec v
             JOIN chunks c    ON c.id = v.rowid
             JOIN documents d ON d.id = c.doc_id
             WHERE v.embedding MATCH ? AND k = ?",
        );
        let mut p: Vec<Value> = vec![Value::Blob(vector::to_blob(query_vec)), Value::Integer(k)];
        if let Some(ids) = &candidates {
            sql.push_str(" AND v.rowid IN (");
            for (i, id) in ids.iter().enumerate() {
                if i > 0 {
                    sql.push(',');
                }
                sql.push('?');
                p.push(Value::Integer(*id));
            }
            sql.push(')');
        }
        sql.push_str(" ORDER BY v.distance");

        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params_from_iter(p), |r| {
            Ok((
                r.get::<_, f64>(0)?,            // distance
                r.get::<_, i64>(1)?,            // doc_id
                r.get::<_, Option<String>>(2)?, // heading
                r.get::<_, String>(3)?,         // chunk text
                r.get::<_, String>(4)?,         // path
                r.get::<_, String>(5)?,         // title
            ))
        })?;

        let mut seen = HashSet::new();
        let mut hits = Vec::new();
        for row in rows {
            let (distance, doc_id, heading, text, path, title) = row?;
            if !seen.insert(doc_id) {
                continue; // already kept this document's nearest chunk
            }
            hits.push((
                doc_id,
                TextHit {
                    address: format!("{}/{}", self.root_name, path),
                    title,
                    tags: self.tags_for_doc(doc_id)?,
                    snippet: snippet_from(heading.as_deref(), &text),
                    score: distance,
                },
            ));
            if hits.len() >= limit {
                break;
            }
        }
        Ok(hits)
    }

    /// True if every chunk of `rel_path` already has a `chunks_vec` row. A document with no
    /// chunks counts as "has vectors" (nothing to embed). Drives the US-658 backfill check.
    pub fn doc_has_vectors(&self, rel_path: &str) -> Result<bool> {
        let doc_id = match doc_id_for(&self.conn, rel_path)? {
            Some(id) => id,
            None => return Ok(true),
        };
        let chunks: i64 = self
            .conn
            .query_row("SELECT count(*) FROM chunks WHERE doc_id=?1", [doc_id], |r| r.get(0))?;
        if chunks == 0 {
            return Ok(true);
        }
        let vecs: i64 = self.conn.query_row(
            "SELECT count(*) FROM chunks_vec
             WHERE rowid IN (SELECT id FROM chunks WHERE doc_id=?1)",
            [doc_id],
            |r| r.get(0),
        )?;
        Ok(vecs >= chunks)
    }

    /// (Re)build `chunks_vec` rows for one document: read its chunks, embed the texts as
    /// passages, and replace any existing vec rows in one transaction. Idempotent. Embedding
    /// runs outside the txn (the slow part); the delete+insert is the only locked work.
    /// Returns the number of vectors written.
    pub fn embed_document_chunks(&self, rel_path: &str, embedder: &dyn Embedder) -> Result<usize> {
        let doc_id = match doc_id_for(&self.conn, rel_path)? {
            Some(id) => id,
            None => return Ok(0),
        };
        let (ids, texts): (Vec<i64>, Vec<String>) = {
            let mut stmt = self
                .conn
                .prepare("SELECT id, text FROM chunks WHERE doc_id=?1 ORDER BY ordinal")?;
            let rows = stmt.query_map([doc_id], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))?;
            let mut ids = Vec::new();
            let mut texts = Vec::new();
            for row in rows {
                let (id, text) = row?;
                ids.push(id);
                texts.push(text);
            }
            (ids, texts)
        };
        if ids.is_empty() {
            return Ok(0);
        }

        let refs: Vec<&str> = texts.iter().map(String::as_str).collect();
        let vecs = embedder.embed_passages(&refs)?;
        if vecs.len() != ids.len() {
            return Err(MnemeError::Embed(format!(
                "embedder returned {} vectors for {} chunks",
                vecs.len(),
                ids.len()
            )));
        }
        if let Some(v) = vecs.first() {
            if v.len() != EMBED_DIM as usize {
                return Err(MnemeError::Embed(format!(
                    "embedding dim {} != index dim {EMBED_DIM}",
                    v.len()
                )));
            }
        }

        let tx = self.conn.unchecked_transaction()?;
        {
            let mut del = tx.prepare("DELETE FROM chunks_vec WHERE rowid=?1")?;
            let mut ins = tx.prepare("INSERT INTO chunks_vec (rowid, embedding) VALUES (?1, ?2)")?;
            for (id, v) in ids.iter().zip(&vecs) {
                del.execute([id])?;
                ins.execute(params![id, vector::to_blob(v)])?;
            }
        }
        tx.commit()?;
        Ok(ids.len())
    }

    /// Distinct tags + document counts (`wiki_tags`), optionally scoped to a rel-path prefix.
    pub fn tag_counts(&self, subtree: Option<&str>) -> Result<Vec<(String, usize)>> {
        let mut sql = String::from(
            "SELECT t.tag, count(*) FROM doc_tags t JOIN documents d ON d.id = t.doc_id",
        );
        let mut p: Vec<Value> = Vec::new();
        if let Some(st) = subtree.filter(|s| !s.is_empty()) {
            sql.push_str(" WHERE (d.path = ? OR d.path LIKE ?)");
            p.push(Value::Text(st.to_string()));
            p.push(Value::Text(format!("{st}/%")));
        }
        sql.push_str(" GROUP BY t.tag ORDER BY t.tag");
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params_from_iter(p), |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)? as usize))
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    /// Documents carrying `tag` (`wiki_timeline` uses `"log"`), optionally scoped to a rel-path
    /// prefix. Returns effective metadata; the caller derives the timeline date from the filename.
    pub fn docs_with_tag(&self, tag: &str, subtree: Option<&str>) -> Result<Vec<DocMeta>> {
        let mut sql = String::from(
            "SELECT d.id, d.path, d.title, d.created, d.verified
             FROM documents d
             JOIN doc_tags t ON t.doc_id = d.id AND t.tag = ?",
        );
        let mut p: Vec<Value> = vec![Value::Text(tag.to_string())];
        if let Some(st) = subtree.filter(|s| !s.is_empty()) {
            sql.push_str(" WHERE (d.path = ? OR d.path LIKE ?)");
            p.push(Value::Text(st.to_string()));
            p.push(Value::Text(format!("{st}/%")));
        }
        sql.push_str(" ORDER BY d.path");
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params_from_iter(p), |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, Option<String>>(4)?,
            ))
        })?;
        let mut out = Vec::new();
        for row in rows {
            let (doc_id, path, title, created, verified) = row?;
            out.push(DocMeta {
                tags: self.tags_for_doc(doc_id)?,
                path,
                title,
                created,
                verified,
            });
        }
        Ok(out)
    }

    fn tags_for_doc(&self, doc_id: i64) -> Result<Vec<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT tag FROM doc_tags WHERE doc_id = ?1 ORDER BY tag")?;
        let rows = stmt.query_map([doc_id], |r| r.get::<_, String>(0))?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }
}

/// Append the shared `SearchFilter` predicates (subtree prefix, tags include/exclude, `created`
/// range) to a query that already exposes the `documents` alias `d`. Shared by the text and
/// vector lanes so both filter identically.
fn push_filter_sql(sql: &mut String, p: &mut Vec<Value>, filter: &SearchFilter) {
    if let Some(st) = filter.subtree.as_deref().filter(|s| !s.is_empty()) {
        sql.push_str(" AND (d.path = ? OR d.path LIKE ?)");
        p.push(Value::Text(st.to_string()));
        p.push(Value::Text(format!("{st}/%")));
    }
    for tag in &filter.tags {
        sql.push_str(" AND EXISTS (SELECT 1 FROM doc_tags t WHERE t.doc_id = d.id AND t.tag = ?)");
        p.push(Value::Text(tag.clone()));
    }
    for tag in &filter.exclude_tags {
        sql.push_str(" AND NOT EXISTS (SELECT 1 FROM doc_tags t WHERE t.doc_id = d.id AND t.tag = ?)");
        p.push(Value::Text(tag.clone()));
    }
    if let Some(from) = &filter.created_from {
        sql.push_str(" AND d.created >= ?");
        p.push(Value::Text(from.clone()));
    }
    if let Some(to) = &filter.created_to {
        sql.push_str(" AND d.created <= ?");
        p.push(Value::Text(to.clone()));
    }
}

/// Whether a filter constrains nothing — lets the vector lane skip the candidate-id pre-filter
/// and run an unconstrained KNN.
fn filter_is_empty(filter: &SearchFilter) -> bool {
    filter.subtree.as_deref().map_or(true, str::is_empty)
        && filter.tags.is_empty()
        && filter.exclude_tags.is_empty()
        && filter.created_from.is_none()
        && filter.created_to.is_none()
}

/// Build a short search snippet for the vector lane (FTS supplies its own via `snippet()`):
/// the heading (when present) plus a truncated slice of the chunk text.
fn snippet_from(heading: Option<&str>, text: &str) -> String {
    const MAX: usize = 200;
    let body: String = text.chars().take(MAX).collect();
    let body = body.trim();
    match heading {
        Some(h) if !h.is_empty() => format!("{h} — {body}"),
        _ => body.to_string(),
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

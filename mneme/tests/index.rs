//! US-653 integration tests — markdown layer (frontmatter + chunker) and the per-root SQLite
//! index (schema, sqlite-vec load, upsert→FTS, delete, reconcile read helpers).
//!
//! Hermetic: every fixture is built under `CARGO_TARGET_TMPDIR` (nothing committed), mirroring
//! US-652's `document_store.rs`.

use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use persephone_mneme::config::ModelConfig;
use persephone_mneme::index::{content_hash, IndexDb};
use persephone_mneme::markdown::{chunker, parse_document};

fn tmp_root(name: &str) -> PathBuf {
    let dir = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

// 1970-01-01 / a later date, for deterministic created-fallback assertions.
fn epoch() -> SystemTime {
    UNIX_EPOCH
}
fn day(secs: u64) -> SystemTime {
    UNIX_EPOCH + Duration::from_secs(secs)
}

// ---------------------------------------------------------------------------------------------
// Frontmatter + fallbacks
// ---------------------------------------------------------------------------------------------

#[test]
fn frontmatter_full_block_parses() {
    let content = "---\ntitle: My Doc\ntags: [work, postgres]\ncreated: 2026-01-15\nverified: 2026-06-13\n---\n# Heading\nBody.";
    let d = parse_document("file", content, Some(epoch()), epoch());
    assert_eq!(d.meta.title, "My Doc");
    assert_eq!(d.meta.tags, vec!["work", "postgres"]);
    assert_eq!(d.meta.created.as_deref(), Some("2026-01-15"));
    assert_eq!(d.meta.verified.as_deref(), Some("2026-06-13"));
}

#[test]
fn title_falls_back_to_h1_then_filename() {
    let from_h1 = parse_document("the-file", "# Real Title\n\ntext", None, epoch());
    assert_eq!(from_h1.meta.title, "Real Title");

    let from_name = parse_document("the-file", "no heading here", None, epoch());
    assert_eq!(from_name.meta.title, "the-file");
}

#[test]
fn created_falls_back_birthtime_then_mtime() {
    // birthtime present → use it (UTC). 1970-01-01.
    let with_birth = parse_document("f", "x", Some(epoch()), day(1_000_000_000));
    assert_eq!(with_birth.meta.created.as_deref(), Some("1970-01-01"));

    // no birthtime → mtime. 1_700_000_000s = 2023-11-14 UTC.
    let with_mtime = parse_document("f", "x", None, day(1_700_000_000));
    assert_eq!(with_mtime.meta.created.as_deref(), Some("2023-11-14"));
}

#[test]
fn tags_default_empty_and_verified_optional() {
    let d = parse_document("f", "# T\nbody", None, epoch());
    assert!(d.meta.tags.is_empty());
    assert_eq!(d.meta.verified, None);
}

#[test]
fn malformed_frontmatter_degrades_to_none() {
    // Invalid YAML inside the block → treated as no frontmatter, fallbacks apply.
    let content = "---\ntitle: [unterminated\n  : : :\n---\n# Fallback Title\nbody";
    let d = parse_document("fname", content, None, epoch());
    assert_eq!(d.meta.title, "Fallback Title"); // from H1, not the broken block
    assert!(d.meta.tags.is_empty());
}

#[test]
fn invalid_date_string_falls_back() {
    let content = "---\ncreated: not-a-date\n---\nbody";
    let d = parse_document("f", content, Some(epoch()), epoch());
    assert_eq!(d.meta.created.as_deref(), Some("1970-01-01")); // birthtime fallback
}

// ---------------------------------------------------------------------------------------------
// Chunker
// ---------------------------------------------------------------------------------------------

#[test]
fn chunks_split_by_heading_with_preamble() {
    let body = "intro paragraph\n\n# First\nalpha text\n\n## Second\nbeta text";
    let chunks = chunker::chunk_markdown(body);
    assert_eq!(chunks.len(), 3);
    assert_eq!(chunks[0].heading, None); // preamble
    assert!(chunks[0].text.contains("intro"));
    assert_eq!(chunks[1].heading.as_deref(), Some("First"));
    assert!(chunks[1].text.contains("alpha"));
    assert_eq!(chunks[2].heading.as_deref(), Some("Second"));
    // Ordinals are contiguous + document-ordered.
    assert_eq!(chunks.iter().map(|c| c.ordinal).collect::<Vec<_>>(), vec![0, 1, 2]);
}

#[test]
fn hash_inside_code_fence_is_not_a_heading() {
    let body = "# Real\ntext\n\n```\n# not a heading\nmore code\n```\nafter";
    let chunks = chunker::chunk_markdown(body);
    let headings: Vec<_> = chunks.iter().filter_map(|c| c.heading.as_deref()).collect();
    assert!(headings.contains(&"Real"));
    assert!(!headings.contains(&"not a heading"));
    // The code-fence content stays within the "Real" section — a single chunk, not split.
    assert_eq!(chunks.len(), 1);
}

#[test]
fn oversized_section_is_split_keeping_heading() {
    let big = "x".repeat(chunker::MAX_CHUNK_CHARS * 2 + 100);
    let body = format!("# Big\n{big}");
    let chunks = chunker::chunk_markdown(&body);
    assert!(chunks.len() >= 2, "expected the section to be split");
    assert!(chunks.iter().all(|c| c.heading.as_deref() == Some("Big")));
    assert!(chunks.iter().all(|c| c.text.chars().count() <= chunker::MAX_CHUNK_CHARS));
}

// ---------------------------------------------------------------------------------------------
// Index — schema, meta, sqlite-vec
// ---------------------------------------------------------------------------------------------

fn open(root: &std::path::Path) -> IndexDb {
    IndexDb::open_or_create("personal", root, &ModelConfig::default()).unwrap()
}

#[test]
fn open_creates_versioned_db_and_gitignore() {
    let root = tmp_root("idx_create");
    let _db = open(&root);

    let db_path = root
        .join(".mneme")
        .join("gte-multilingual-base-int8")
        .join("index-v1.db");
    assert!(db_path.exists(), "versioned DB not created at {db_path:?}");

    let gi = root.join(".mneme").join(".gitignore");
    assert_eq!(std::fs::read_to_string(gi).unwrap(), "*\n");
}

#[test]
fn meta_reports_model_and_schema() {
    let root = tmp_root("idx_meta");
    let m = open(&root).meta().unwrap();
    assert_eq!(m.model, "gte-multilingual-base");
    assert_eq!(m.precision, "int8");
    assert_eq!(m.dims, 768);
    assert_eq!(m.schema_version, 1);
}

#[test]
fn reopen_reuses_existing_db() {
    let root = tmp_root("idx_reopen");
    {
        let db = open(&root);
        let parsed = parse_document("a", "# A\nhello world", None, epoch());
        db.upsert_document("a.md", &parsed, &content_hash(b"x"), 1, 1).unwrap();
    }
    // Second open must not wipe the data.
    let db = open(&root);
    assert_eq!(db.all_doc_paths().unwrap(), vec!["a.md"]);
}

#[test]
fn sqlite_vec_extension_loads() {
    // open_or_create creates `chunks_vec USING vec0(...)` — succeeding proves the auto-extension
    // is registered and sqlite-vec links into the binary. Also check vec_version() directly.
    let root = tmp_root("idx_vec");
    persephone_mneme::index::schema::register_sqlite_vec();
    let conn = rusqlite::Connection::open_in_memory().unwrap();
    let v: String = conn.query_row("SELECT vec_version()", [], |r| r.get(0)).unwrap();
    assert!(v.starts_with('v'), "unexpected vec_version: {v}");
    let _db = open(&root); // creates the vec0 table without error
}

#[test]
fn schema_version_mismatch_is_an_error() {
    let root = tmp_root("idx_mismatch");
    open(&root); // create v1
    let db_path = root
        .join(".mneme")
        .join("gte-multilingual-base-int8")
        .join("index-v1.db");
    {
        let conn = rusqlite::Connection::open(&db_path).unwrap();
        conn.execute("UPDATE meta SET value='999' WHERE key='schema_version'", [])
            .unwrap();
    }
    let err = IndexDb::open_or_create("personal", &root, &ModelConfig::default());
    assert!(err.is_err(), "expected a schema-version mismatch error");
}

// ---------------------------------------------------------------------------------------------
// Index — upsert, FTS, tags, delete, reconcile helpers
// ---------------------------------------------------------------------------------------------

#[test]
fn upsert_then_fts_finds_document() {
    let root = tmp_root("idx_fts");
    let db = open(&root);
    let parsed = parse_document(
        "notes",
        "---\ntags: [postgres]\n---\n# Notes\nThe quick brown fox jumps.",
        None,
        epoch(),
    );
    db.upsert_document("notes.md", &parsed, &content_hash(b"v1"), 10, 20).unwrap();

    let hits = db.search_fts("brown", 10).unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].address, "personal/notes.md");
    assert!(hits[0].snippet.contains("brown"));
}

#[test]
fn reupsert_replaces_chunks_without_duplication() {
    let root = tmp_root("idx_reupsert");
    let db = open(&root);

    let v1 = parse_document("d", "# D\napple banana", None, epoch());
    db.upsert_document("d.md", &v1, &content_hash(b"v1"), 1, 1).unwrap();

    let v2 = parse_document("d", "# D\ncherry date", None, epoch());
    db.upsert_document("d.md", &v2, &content_hash(b"v2"), 2, 2).unwrap();

    // Old terms gone, new terms present, exactly one document.
    assert!(db.search_fts("apple", 10).unwrap().is_empty());
    assert_eq!(db.search_fts("cherry", 10).unwrap().len(), 1);
    assert_eq!(db.all_doc_paths().unwrap(), vec!["d.md"]);
    assert_eq!(db.doc_state("d.md").unwrap().unwrap().content_hash, content_hash(b"v2"));
}

#[test]
fn tags_are_stored() {
    let root = tmp_root("idx_tags");
    let db = open(&root);
    let parsed = parse_document("t", "---\ntags: [alpha, beta]\n---\n# T\nbody", None, epoch());
    db.upsert_document("t.md", &parsed, &content_hash(b"x"), 1, 1).unwrap();

    // doc_tags is internal; assert via a fresh sqlite read (dev-dep rusqlite).
    let db_path = root
        .join(".mneme")
        .join("gte-multilingual-base-int8")
        .join("index-v1.db");
    let conn = rusqlite::Connection::open(&db_path).unwrap();
    let mut stmt = conn.prepare("SELECT tag FROM doc_tags ORDER BY tag").unwrap();
    let tags: Vec<String> = stmt
        .query_map([], |r| r.get(0))
        .unwrap()
        .map(|r| r.unwrap())
        .collect();
    assert_eq!(tags, vec!["alpha", "beta"]);
}

#[test]
fn delete_removes_document_and_fts() {
    let root = tmp_root("idx_delete");
    let db = open(&root);
    let parsed = parse_document("g", "# G\nuniquetoken here", None, epoch());
    db.upsert_document("g.md", &parsed, &content_hash(b"x"), 1, 1).unwrap();
    assert_eq!(db.search_fts("uniquetoken", 10).unwrap().len(), 1);

    db.delete_document("g.md").unwrap();
    assert!(db.search_fts("uniquetoken", 10).unwrap().is_empty());
    assert!(db.all_doc_paths().unwrap().is_empty());
    assert!(db.doc_state("g.md").unwrap().is_none());
}

#[test]
fn doc_state_and_all_paths_round_trip() {
    let root = tmp_root("idx_state");
    let db = open(&root);
    for (p, body) in [("a.md", "# A\na"), ("b.md", "# B\nb")] {
        let parsed = parse_document(p, body, None, epoch());
        db.upsert_document(p, &parsed, &content_hash(body.as_bytes()), 42, 99).unwrap();
    }
    assert_eq!(db.all_doc_paths().unwrap(), vec!["a.md", "b.md"]);
    let st = db.doc_state("a.md").unwrap().unwrap();
    assert_eq!(st.mtime, 42);
    assert_eq!(st.size, 99);
    assert_eq!(st.content_hash, content_hash(b"# A\na"));
}

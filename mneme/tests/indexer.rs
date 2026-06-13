//! US-654 integration tests — the indexer (reconcile + fast-path + dedup), the watcher's
//! self-trigger guard, and the always-on watcher's eventual-consistency wiring.
//!
//! Hermetic: every fixture is built under `CARGO_TARGET_TMPDIR` (nothing committed), mirroring
//! US-652/653. The deterministic core is tested synchronously via `reconcile_root`; only one
//! test exercises the live watcher, and it polls with a bounded timeout (no fixed sleeps).

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use persephone_mneme::config::{Config, ModelConfig, RootConfig};
use persephone_mneme::embed::LazyEmbedder;
use persephone_mneme::index::{IndexDb, RootIndex};
use persephone_mneme::indexer::{index_one, reconcile_root, IndexManager, IndexOutcome};
use persephone_mneme::watcher::is_watch_ignored;

fn tmp_root(name: &str) -> PathBuf {
    let dir = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn write_file(root: &Path, rel: &str, content: &str) {
    let p = root.join(rel);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(p, content).unwrap();
}

fn root_config(name: &str, folder: &Path) -> RootConfig {
    RootConfig {
        name: name.to_string(),
        folder: folder.to_path_buf(),
        include: vec!["*.md".to_string()],
        ignore: Vec::new(),
    }
}

fn open_db(name: &str, folder: &Path) -> IndexDb {
    IndexDb::open_or_create(name, folder, &ModelConfig::default()).unwrap()
}

// ---------------------------------------------------------------------------------------------
// Reconcile — the deterministic core (synchronous, no watcher)
// ---------------------------------------------------------------------------------------------

#[test]
fn reconcile_indexes_new_files_and_is_idempotent() {
    let root = tmp_root("idx_new");
    write_file(&root, "a.md", "# Alpha\nalphabody");
    write_file(&root, "sub/b.md", "# Beta\nbetabody");
    let cfg = root_config("wiki", &root);
    let db = open_db("wiki", &root);

    let s1 = reconcile_root(&db, &cfg, None).unwrap();
    assert_eq!(s1.scanned, 2);
    assert_eq!(s1.indexed, 2);
    assert_eq!(s1.deleted, 0);

    let mut paths = db.all_doc_paths().unwrap();
    paths.sort();
    assert_eq!(paths, vec!["a.md".to_string(), "sub/b.md".to_string()]);
    assert_eq!(db.search_fts("alphabody", 10).unwrap().len(), 1);

    // Second pass: nothing changed → everything fast-path skipped.
    let s2 = reconcile_root(&db, &cfg, None).unwrap();
    assert_eq!(s2.scanned, 2);
    assert_eq!(s2.indexed, 0);
    assert_eq!(s2.skipped, 2);
    assert_eq!(s2.refreshed, 0);
}

#[test]
fn reconcile_reindexes_changed_content() {
    let root = tmp_root("idx_changed");
    write_file(&root, "a.md", "# A\noldterm here");
    let cfg = root_config("wiki", &root);
    let db = open_db("wiki", &root);
    reconcile_root(&db, &cfg, None).unwrap();
    assert_eq!(db.search_fts("oldterm", 10).unwrap().len(), 1);

    write_file(&root, "a.md", "# A\nnewterm here and more text");
    let s = reconcile_root(&db, &cfg, None).unwrap();
    assert_eq!(s.indexed, 1);
    assert_eq!(db.search_fts("oldterm", 10).unwrap().len(), 0);
    assert_eq!(db.search_fts("newterm", 10).unwrap().len(), 1);
    // No duplicate document row for the same path.
    assert_eq!(db.all_doc_paths().unwrap().len(), 1);
}

#[test]
fn reconcile_drops_deleted_files() {
    let root = tmp_root("idx_deleted");
    write_file(&root, "a.md", "# A\nkeepme");
    write_file(&root, "b.md", "# B\ndropme");
    let cfg = root_config("wiki", &root);
    let db = open_db("wiki", &root);
    reconcile_root(&db, &cfg, None).unwrap();
    assert_eq!(db.all_doc_paths().unwrap().len(), 2);

    std::fs::remove_file(root.join("b.md")).unwrap();
    let s = reconcile_root(&db, &cfg, None).unwrap();
    assert_eq!(s.deleted, 1);
    assert_eq!(db.all_doc_paths().unwrap(), vec!["a.md".to_string()]);
    assert_eq!(db.search_fts("dropme", 10).unwrap().len(), 0);
}

#[test]
fn index_one_outcomes_indexed_skipped_refreshed() {
    let root = tmp_root("idx_outcomes");
    let abs = root.join("a.md");
    write_file(&root, "a.md", "# A\nsameterm content");
    let db = open_db("wiki", &root);

    // New file → Indexed.
    assert_eq!(index_one(&db, "a.md", &abs, None).unwrap(), IndexOutcome::Indexed);
    // Unchanged stat → Skipped.
    assert_eq!(index_one(&db, "a.md", &abs, None).unwrap(), IndexOutcome::Skipped);

    // Rewrite identical bytes (mtime moves, content hash identical) → Refreshed.
    // Sleep briefly so the filesystem mtime is observably different.
    std::thread::sleep(Duration::from_millis(1100));
    std::fs::write(&abs, "# A\nsameterm content").unwrap();
    assert_eq!(
        index_one(&db, "a.md", &abs, None).unwrap(),
        IndexOutcome::Refreshed
    );

    // Genuine content change → Indexed.
    std::fs::write(&abs, "# A\ndifferentterm now").unwrap();
    assert_eq!(index_one(&db, "a.md", &abs, None).unwrap(), IndexOutcome::Indexed);
}

#[test]
fn reconcile_skips_non_markdown_and_ignored_dirs() {
    let root = tmp_root("idx_filter");
    write_file(&root, "doc.md", "# Doc\nindexme");
    write_file(&root, "notes.txt", "not markdown");
    write_file(&root, "node_modules/dep.md", "# Dep\nignored");
    let cfg = root_config("wiki", &root);
    let db = open_db("wiki", &root);

    let s = reconcile_root(&db, &cfg, None).unwrap();
    assert_eq!(s.indexed, 1);
    assert_eq!(db.all_doc_paths().unwrap(), vec!["doc.md".to_string()]);
}

// ---------------------------------------------------------------------------------------------
// Watcher self-trigger guard (unit, no timing)
// ---------------------------------------------------------------------------------------------

#[test]
fn watcher_ignores_mneme_and_default_dirs() {
    let root = Path::new("/wiki");
    // The index's own WAL/SHM writes must never wake a reconcile (else: infinite loop).
    assert!(is_watch_ignored(root, &root.join(".mneme/m/index-v1.db-wal")));
    assert!(is_watch_ignored(root, &root.join(".git/HEAD")));
    assert!(is_watch_ignored(root, &root.join("node_modules/x/readme.md")));
    // A normal document is not ignored.
    assert!(!is_watch_ignored(root, &root.join("notes/today.md")));
    // A path outside the root is treated as ignored.
    assert!(is_watch_ignored(root, Path::new("/elsewhere/a.md")));
}

// ---------------------------------------------------------------------------------------------
// Watcher live wiring (eventual consistency, bounded poll)
// ---------------------------------------------------------------------------------------------

/// Poll `db` until `pred` holds or the timeout elapses; returns whether it held. Reads through
/// the root's read-only pool (US-659).
fn poll_until(db: &Arc<RootIndex>, timeout: Duration, pred: impl Fn(&IndexDb) -> bool) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if db.read(|d| pred(d)) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    false
}

#[test]
fn watcher_reconciles_on_add_edit_delete() {
    let root = tmp_root("idx_watch");
    write_file(&root, "seed.md", "# Seed\nseedterm");
    let cfg = root_config("wiki", &root);

    // Empty model cache → embedder resolves to None (hermetic, FTS-only) even where the real
    // model is provisioned.
    let hermetic = Config {
        model: ModelConfig {
            path: Some(root.join("_models")),
            ..Default::default()
        },
        ..Default::default()
    };
    let mut mgr = IndexManager::open(
        std::slice::from_ref(&cfg),
        &ModelConfig::default(),
        LazyEmbedder::new(hermetic),
    )
    .unwrap();
    let db = mgr.handle("wiki").unwrap();
    // Index the seed file first so the DB starts populated.
    mgr.reconcile_all();
    mgr.start_watchers().unwrap();

    let timeout = Duration::from_secs(8);

    // Add.
    write_file(&root, "added.md", "# Added\naddedterm");
    assert!(
        poll_until(&db, timeout, |d| d
            .search_fts("addedterm", 10)
            .map(|h| !h.is_empty())
            .unwrap_or(false)),
        "watcher did not index the added file in time"
    );

    // Edit.
    write_file(&root, "added.md", "# Added\neditedterm");
    assert!(
        poll_until(&db, timeout, |d| d
            .search_fts("editedterm", 10)
            .map(|h| !h.is_empty())
            .unwrap_or(false)
            && d.search_fts("addedterm", 10).map(|h| h.is_empty()).unwrap_or(false)),
        "watcher did not pick up the edit in time"
    );

    // Delete.
    std::fs::remove_file(root.join("added.md")).unwrap();
    assert!(
        poll_until(&db, timeout, |d| d
            .all_doc_paths()
            .map(|p| !p.contains(&"added.md".to_string()))
            .unwrap_or(false)),
        "watcher did not drop the deleted file in time"
    );

    mgr.shutdown();
}

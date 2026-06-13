//! US-655 index-layer tests — `search_text` metadata filters + `tag_counts` / `docs_with_tag`.
//! Synchronous (no MCP transport, no runtime); hermetic under `CARGO_TARGET_TMPDIR`.

use std::path::{Path, PathBuf};

use persephone_mneme::config::{ModelConfig, RootConfig};
use persephone_mneme::index::{IndexDb, SearchFilter};
use persephone_mneme::indexer::reconcile_root;

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

fn cfg(name: &str, folder: &Path) -> RootConfig {
    RootConfig {
        name: name.to_string(),
        folder: folder.to_path_buf(),
        include: vec!["*.md".to_string()],
        ignore: Vec::new(),
    }
}

fn populated(name: &str) -> (PathBuf, IndexDb, RootConfig) {
    // Unique dir per test — tests run in parallel and each per-root DB is single-writer.
    let root = tmp_root(name);
    write_file(&root, "a.md", "---\ntags: [x, work]\ncreated: 2026-01-01\n---\n# Alpha\nfooterm here");
    write_file(&root, "b.md", "---\ntags: [y]\ncreated: 2026-05-01\n---\n# Beta\nfooterm there");
    write_file(&root, "log/2026/2026-06-13.md", "---\ntags: [log, work]\n---\n# Day\nfooterm logged");
    let c = cfg("wiki", &root);
    let db = IndexDb::open_or_create("wiki", &root, &ModelConfig::default()).unwrap();
    reconcile_root(&db, &c).unwrap();
    (root, db, c)
}

#[test]
fn search_text_returns_title_tags_and_one_row_per_doc() {
    let (_root, db, _c) = populated("idxsearch_rows");
    let hits = db.search_text("footerm", &SearchFilter::default(), 10).unwrap();
    assert_eq!(hits.len(), 3, "all three docs match");
    let a = hits.iter().find(|h| h.address == "wiki/a.md").expect("a.md present");
    assert_eq!(a.title, "Alpha");
    assert!(a.tags.contains(&"work".to_string()));
    assert!(!a.snippet.is_empty());
}

#[test]
fn search_text_tag_include_and_exclude() {
    let (_root, db, _c) = populated("idxsearch_tags");
    let only_x = db
        .search_text(
            "footerm",
            &SearchFilter {
                tags: vec!["x".to_string()],
                ..Default::default()
            },
            10,
        )
        .unwrap();
    assert_eq!(only_x.len(), 1);
    assert_eq!(only_x[0].address, "wiki/a.md");

    let not_work = db
        .search_text(
            "footerm",
            &SearchFilter {
                exclude_tags: vec!["work".to_string()],
                ..Default::default()
            },
            10,
        )
        .unwrap();
    let addrs: Vec<&str> = not_work.iter().map(|h| h.address.as_str()).collect();
    assert_eq!(addrs, vec!["wiki/b.md"], "a.md and the log doc carry 'work'");
}

#[test]
fn search_text_date_range_and_subtree() {
    let (_root, db, _c) = populated("idxsearch_dates");
    let recent = db
        .search_text(
            "footerm",
            &SearchFilter {
                created_from: Some("2026-04-01".to_string()),
                ..Default::default()
            },
            10,
        )
        .unwrap();
    let addrs: Vec<String> = recent.iter().map(|h| h.address.clone()).collect();
    // a.md (created 2026-01-01) is excluded; b.md (2026-05-01) is kept. (The log doc has no
    // frontmatter `created`, so it falls back to file birthtime ≈ today and also passes — that's
    // correct fallback behavior, so we only assert the explicit-date boundary here.)
    assert!(!addrs.contains(&"wiki/a.md".to_string()), "a.md is before the lower bound");
    assert!(addrs.contains(&"wiki/b.md".to_string()), "b.md is within range");

    let in_log = db
        .search_text(
            "footerm",
            &SearchFilter {
                subtree: Some("log".to_string()),
                ..Default::default()
            },
            10,
        )
        .unwrap();
    assert_eq!(in_log.len(), 1);
    assert!(in_log[0].address.starts_with("wiki/log/"));
}

#[test]
fn tag_counts_and_docs_with_tag() {
    let (_root, db, _c) = populated("idxsearch_tagcounts");
    let counts = db.tag_counts(None).unwrap();
    let get = |t: &str| counts.iter().find(|(tag, _)| tag == t).map(|(_, c)| *c);
    assert_eq!(get("work"), Some(2)); // a.md + log doc
    assert_eq!(get("x"), Some(1));
    assert_eq!(get("log"), Some(1));

    let logs = db.docs_with_tag("log", None).unwrap();
    assert_eq!(logs.len(), 1);
    assert_eq!(logs[0].path, "log/2026/2026-06-13.md");
    assert!(logs[0].tags.contains(&"work".to_string()));
}

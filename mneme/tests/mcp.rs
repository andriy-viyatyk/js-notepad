//! US-655 MCP tool-surface tests — exercise the `wiki_*` logic on `ServerState` directly
//! (no HTTP transport), the way the rmcp tool wrappers call it. Hermetic under
//! `CARGO_TARGET_TMPDIR`; each test owns its own roots + config file.

use std::path::PathBuf;
use std::sync::Arc;

use persephone_mneme::config::{Config, ModelConfig, RootConfig};
use persephone_mneme::mcp::params::*;
use persephone_mneme::mcp::ServerState;

fn tmp_dir(name: &str) -> PathBuf {
    let dir = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

/// A `ServerState` over one empty root named "wiki", plus the on-disk paths (root, config file).
fn setup(name: &str) -> (Arc<ServerState>, PathBuf, PathBuf) {
    let base = tmp_dir(name);
    let root = base.join("wiki");
    std::fs::create_dir_all(&root).unwrap();
    let cfg_path = base.join("mneme.toml");
    let cfg = Config {
        roots: vec![RootConfig {
            name: "wiki".to_string(),
            folder: root.clone(),
            include: vec!["*.md".to_string()],
            ignore: Vec::new(),
        }],
        // Point the model cache at an empty dir so these tests stay hermetic + FTS-only even on
        // a dev machine where the real model is provisioned (embedder resolves to None).
        model: ModelConfig {
            path: Some(base.join("models")),
            ..Default::default()
        },
        ..Default::default()
    };
    let state = ServerState::new(cfg, cfg_path.clone()).unwrap();
    (state, root, cfg_path)
}

fn write_params(path: &str, content: &str) -> WriteParams {
    WriteParams {
        path: path.to_string(),
        content: content.to_string(),
    }
}

fn search_params(query: &str) -> SearchParams {
    SearchParams {
        query: query.to_string(),
        mode: SearchMode::Text,
        subtree: None,
        tags: Vec::new(),
        exclude_tags: Vec::new(),
        date_range: None,
        top_k: None,
        ext: None,
    }
}

#[tokio::test]
async fn write_read_search_roundtrip() {
    let (state, _root, _cfg) = setup("mcp_roundtrip");
    state
        .write_doc(write_params(
            "wiki/note.md",
            "---\ntags: [alpha, work]\ncreated: 2026-01-10\n---\n# Title\nfindme body text",
        ))
        .await
        .unwrap();

    let r = state
        .read_doc(ReadParams {
            path: "wiki/note.md".to_string(),
            offset: None,
            limit: None,
        })
        .await
        .unwrap();
    assert!(r.content.contains("findme"));
    assert_eq!(r.frontmatter.title, "Title");
    assert!(r.frontmatter.tags.contains(&"alpha".to_string()));
    assert_eq!(r.frontmatter.created.as_deref(), Some("2026-01-10"));

    let s = state.search(search_params("findme")).await.unwrap();
    assert_eq!(s.results.len(), 1);
    assert_eq!(s.results[0].uri, "wiki/note.md");
    assert_eq!(s.results[0].title, "Title");
    assert!(s.note.is_none());
}

#[tokio::test]
async fn search_vector_mode_degrades_with_note() {
    let (state, _root, _cfg) = setup("mcp_vecnote");
    state
        .write_doc(write_params("wiki/n.md", "# N\nseekme"))
        .await
        .unwrap();
    let mut p = search_params("seekme");
    p.mode = SearchMode::Hybrid;
    let s = state.search(p).await.unwrap();
    assert_eq!(s.results.len(), 1);
    assert!(s.note.is_some(), "hybrid mode without embeddings carries a note");
}

#[tokio::test]
async fn edit_and_delete_update_the_index() {
    let (state, _root, _cfg) = setup("mcp_editdelete");
    state
        .write_doc(write_params("wiki/d.md", "# D\noldword"))
        .await
        .unwrap();
    assert_eq!(state.search(search_params("oldword")).await.unwrap().results.len(), 1);

    state
        .edit_doc(EditParams {
            path: "wiki/d.md".to_string(),
            old_string: "oldword".to_string(),
            new_string: "newword".to_string(),
            replace_all: false,
        })
        .await
        .unwrap();
    assert_eq!(state.search(search_params("oldword")).await.unwrap().results.len(), 0);
    assert_eq!(state.search(search_params("newword")).await.unwrap().results.len(), 1);

    state
        .delete_doc(DeleteParams {
            path: "wiki/d.md".to_string(),
        })
        .await
        .unwrap();
    assert_eq!(state.search(search_params("newword")).await.unwrap().results.len(), 0);
}

#[tokio::test]
async fn glob_and_grep() {
    let (state, _root, _cfg) = setup("mcp_globgrep");
    state.write_doc(write_params("wiki/a.md", "# A\nhitword")).await.unwrap();
    state.write_doc(write_params("wiki/sub/b.md", "# B\nnope")).await.unwrap();

    let g = state
        .glob(GlobParams {
            pattern: "wiki/**/*.md".to_string(),
            path: None,
        })
        .await
        .unwrap();
    assert_eq!(g.matches.len(), 2);

    let grep = state
        .grep(GrepParams {
            pattern: "hitword".to_string(),
            path: None,
            ignore_case: false,
            context: 0,
            output_mode: GrepOutputMode::FilesWithMatches,
        })
        .await
        .unwrap();
    let files = grep.get("files").and_then(|v| v.as_array()).unwrap();
    assert_eq!(files.len(), 1);
    assert_eq!(files[0], "wiki/a.md");
}

#[tokio::test]
async fn tree_synthesizes_dirs_with_depth() {
    let (state, _root, _cfg) = setup("mcp_tree");
    state.write_doc(write_params("wiki/note.md", "# N\nx")).await.unwrap();
    state.write_doc(write_params("wiki/sub/deep.md", "# D\ny")).await.unwrap();

    let t = state.tree(TreeParams { path: None }).await.unwrap();
    let dir = t.entries.iter().find(|e| e.uri == "mneme://wiki/sub").unwrap();
    assert!(dir.is_dir);
    assert_eq!(dir.depth, 1);
    let file = t.entries.iter().find(|e| e.uri == "mneme://wiki/sub/deep.md").unwrap();
    assert!(!file.is_dir);
    assert_eq!(file.depth, 2);
}

#[tokio::test]
async fn tags_and_timeline() {
    let (state, _root, _cfg) = setup("mcp_tags_timeline");
    state
        .write_doc(write_params(
            "wiki/log/2026/2026-06-13.md",
            "---\ntags: [log, standup]\n---\n# Day\nworked",
        ))
        .await
        .unwrap();
    state
        .write_doc(write_params(
            "wiki/log/2026/2026-06-12.md",
            "---\ntags: [log]\n---\n# Prev\nstuff",
        ))
        .await
        .unwrap();

    let tags = state.tags(TagsParams { subtree: None }).await.unwrap();
    let log_count = tags.tags.iter().find(|t| t.tag == "log").map(|t| t.count);
    assert_eq!(log_count, Some(2));

    let tl = state
        .timeline(TimelineParams::default())
        .await
        .unwrap();
    assert_eq!(tl.entries.len(), 2);
    assert_eq!(tl.entries[0].date, "2026-06-13"); // newest first
    assert_eq!(tl.entries[0].uri, "mneme://wiki/log/2026/2026-06-13.md");
}

#[tokio::test]
async fn reindex_picks_up_a_direct_disk_write() {
    let (state, root, _cfg) = setup("mcp_reindex");
    // Write straight to disk (bypassing wiki_write — simulates an external edit).
    std::fs::write(root.join("ext.md"), "# Ext\nexternalterm").unwrap();

    let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
    let r = state
        .reindex(ReindexParams { path: None }, tokio_util::sync::CancellationToken::new(), tx)
        .await
        .unwrap();
    assert_eq!(r.roots.len(), 1);
    assert!(r.roots[0].indexed >= 1);
    assert_eq!(state.search(search_params("externalterm")).await.unwrap().results.len(), 1);
}

#[tokio::test]
async fn add_remove_list_roots_persists_config() {
    let (state, _root, cfg_path) = setup("mcp_roots");
    let extra = tmp_dir("mcp_roots_extra");

    let added = state
        .add_root(AddRootParams {
            folder: extra.display().to_string(),
            name: Some("extra".to_string()),
        })
        .await
        .unwrap();
    assert_eq!(added.name, "extra");

    let roots = state.list_roots().await.unwrap();
    assert_eq!(roots.roots.len(), 2);
    let saved = std::fs::read_to_string(&cfg_path).unwrap();
    assert!(saved.contains("extra"), "config persisted the new root");

    state
        .remove_root(RemoveRootParams {
            root: "extra".to_string(),
        })
        .await
        .unwrap();
    assert_eq!(state.list_roots().await.unwrap().roots.len(), 1);
}

#[tokio::test]
async fn status_reports_inventory() {
    let (state, _root, _cfg) = setup("mcp_status");
    state.write_doc(write_params("wiki/s.md", "# S\nx")).await.unwrap();

    let st = state.status().await.unwrap();
    assert_eq!(st.roots.len(), 1);
    let wiki = &st.roots[0];
    assert_eq!(wiki.name, "wiki");
    assert_eq!(wiki.doc_count, 1);
    assert_eq!(wiki.schema_ver, 1);
    assert!(!wiki.index_path.is_empty());
}

#[tokio::test]
async fn index_delete_refuses_the_active_db() {
    let (state, _root, _cfg) = setup("mcp_indexdel");
    let err = state
        .index_delete(IndexDeleteParams {
            root: "wiki".to_string(),
            model_id: "gte-multilingual-base-int8".to_string(),
            schema_ver: 1,
        })
        .await;
    assert!(err.is_err(), "must refuse deleting the active (modelId, schemaVer)");
}

#[tokio::test]
async fn model_update_rejects_unknown_model_name() {
    let (state, _root, _cfg) = setup("mcp_modelupd");
    // Requesting a model that differs from the configured name (default "gte-multilingual-base")
    // must return a Config error explaining that switching is deferred.
    let result = state
        .model_update(false, Some("some-other-model".to_string()))
        .await;
    assert!(
        result.is_err(),
        "requesting a different model name must fail"
    );
    let err_msg = result.unwrap_err().to_string();
    assert!(
        err_msg.contains("switching models is deferred"),
        "unexpected error: {err_msg}"
    );
}

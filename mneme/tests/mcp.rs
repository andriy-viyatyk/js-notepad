//! US-655 MCP tool-surface tests — exercise the `wiki_*` logic on `ServerState` directly
//! (no HTTP transport), the way the rmcp tool wrappers call it. Hermetic under
//! `CARGO_TARGET_TMPDIR`; each test owns its own roots + config file.

use std::path::PathBuf;
use std::sync::Arc;

use base64::Engine;
use persephone_mneme::config::{Config, ModelConfig, RootConfig};
use persephone_mneme::mcp::params::*;
use persephone_mneme::mcp::results::ReadResult;
use persephone_mneme::mcp::{ReadOutcome, ServerState};

/// Minimal PNG-ish bytes: the real 8-byte PNG signature + the start of an IHDR chunk. Contains
/// NUL bytes, so the UTF-8/NUL heuristic classifies it as binary (matching a real PNG).
const PNG_BYTES: &[u8] = &[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // signature
    0x00, 0x00, 0x00, 0x0D, b'I', b'H', b'D', b'R', // IHDR length + type (NULs present)
];

fn b64(bytes: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

/// Unwrap a `wiki_read` outcome that must be a text document.
fn expect_text(o: ReadOutcome) -> ReadResult {
    match o {
        ReadOutcome::Text(r) => r,
        _ => panic!("expected a text read outcome"),
    }
}

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

/// Poll `status` until the (single) root's `doc_count` settles at `expected`, or panic after a
/// short timeout. `root_config` SET reindexes in the background (US-693), so callers that change
/// filters must wait for the reconcile rather than reading `doc_count` synchronously.
async fn wait_doc_count(state: &Arc<ServerState>, expected: usize) {
    for _ in 0..200 {
        if state.status().await.unwrap().roots[0].doc_count == expected {
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
    let got = state.status().await.unwrap().roots[0].doc_count;
    panic!("doc_count did not reach {expected} within the timeout (last = {got})");
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

    let r = expect_text(
        state
            .read_doc(ReadParams {
                path: "wiki/note.md".to_string(),
                offset: None,
                limit: None,
            })
            .await
            .unwrap(),
    );
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
            line_numbers: None,
            context: 0,
            output_mode: GrepOutputMode::FilesWithMatches,
            tags: Vec::new(),
            date_range: None,
        })
        .await
        .unwrap();
    let files = grep.get("files").and_then(|v| v.as_array()).unwrap();
    assert_eq!(files.len(), 1);
    assert_eq!(files[0], "wiki/a.md");
}

#[tokio::test]
async fn nonmarkdown_write_is_listable_but_not_indexed() {
    let (state, _root, _cfg) = setup("mcp_nonmd");
    // A non-`.md` file written through wiki_write is stored + listable + readable…
    state.write_doc(write_params("wiki/page.html", "<h1>uniquetoken</h1>")).await.unwrap();

    let g = state
        .glob(GlobParams { pattern: "wiki/*.html".to_string(), path: None })
        .await
        .unwrap();
    assert_eq!(g.matches, vec!["wiki/page.html"]);

    let r = expect_text(
        state
            .read_doc(ReadParams { path: "wiki/page.html".to_string(), offset: None, limit: None })
            .await
            .unwrap(),
    );
    assert!(r.content.contains("uniquetoken"));

    // …but it is NOT indexed (default include is *.md), so search finds nothing — and no orphan
    // index row remains for the next reconcile to churn.
    assert_eq!(state.search(search_params("uniquetoken")).await.unwrap().results.len(), 0);
}

#[tokio::test]
async fn grep_tag_filter_and_line_number_toggle() {
    let (state, _root, _cfg) = setup("mcp_grep_filters");
    state.write_doc(write_params("wiki/a.md", "---\ntags: [keep]\n---\n# A\nhitword")).await.unwrap();
    state.write_doc(write_params("wiki/b.md", "---\ntags: [drop]\n---\n# B\nhitword")).await.unwrap();

    let params = |tags: Vec<String>, output_mode, line_numbers| GrepParams {
        pattern: "hitword".to_string(),
        path: None,
        ignore_case: false,
        line_numbers,
        context: 0,
        output_mode,
        tags,
        date_range: None,
    };

    // Both docs contain "hitword"…
    let all = state.grep(params(Vec::new(), GrepOutputMode::FilesWithMatches, None)).await.unwrap();
    assert_eq!(all["files"].as_array().unwrap().len(), 2);

    // …but a tag filter narrows to the document carrying `keep`.
    let kept = state
        .grep(params(vec!["keep".to_string()], GrepOutputMode::FilesWithMatches, None))
        .await
        .unwrap();
    let files = kept["files"].as_array().unwrap();
    assert_eq!(files.len(), 1);
    assert_eq!(files[0], "wiki/a.md");

    // Default content output carries lineNumber; `-n: false` omits it.
    let with_n = state.grep(params(Vec::new(), GrepOutputMode::Content, None)).await.unwrap();
    assert!(with_n["matches"][0]["lines"][0].get("lineNumber").is_some());
    let no_n = state.grep(params(Vec::new(), GrepOutputMode::Content, Some(false))).await.unwrap();
    assert!(no_n["matches"][0]["lines"][0].get("lineNumber").is_none());
}

#[tokio::test]
async fn tree_synthesizes_dirs_with_depth() {
    let (state, _root, _cfg) = setup("mcp_tree");
    state.write_doc(write_params("wiki/note.md", "# N\nx")).await.unwrap();
    state.write_doc(write_params("wiki/sub/deep.md", "# D\ny")).await.unwrap();

    let t = state.tree(TreeParams { path: None, depth: None }).await.unwrap();
    let dir = t.entries.iter().find(|e| e.uri == "mneme://wiki/sub").unwrap();
    assert!(dir.is_dir);
    assert_eq!(dir.depth, 1);
    let file = t.entries.iter().find(|e| e.uri == "mneme://wiki/sub/deep.md").unwrap();
    assert!(!file.is_dir);
    assert_eq!(file.depth, 2);
}

#[tokio::test]
async fn tree_depth_limits_levels() {
    let (state, _root, _cfg) = setup("mcp_tree_depth");
    state.write_doc(write_params("wiki/note.md", "# N\nx")).await.unwrap();
    state.write_doc(write_params("wiki/sub/deep.md", "# D\ny")).await.unwrap();

    // "wiki" has no slash → absolute depth 0; its immediate children are at depth 1. depth: 1
    // keeps the "wiki" node (0) + children (1: wiki/note.md, wiki/sub) but NOT the grandchild
    // wiki/sub/deep.md (depth 2).
    let t = state
        .tree(TreeParams { path: Some("wiki".into()), depth: Some(1) })
        .await
        .unwrap();
    assert!(t.entries.iter().any(|e| e.uri == "mneme://wiki/sub"));
    assert!(t.entries.iter().any(|e| e.uri == "mneme://wiki/note.md"));
    assert!(
        !t.entries.iter().any(|e| e.uri == "mneme://wiki/sub/deep.md"),
        "depth:1 must not include the grandchild document",
    );
    // The deepest emitted entry is at absolute depth 1 (immediate children of "wiki").
    assert_eq!(t.entries.iter().map(|e| e.depth).max(), Some(1));

    // Omitting depth still returns the full subtree (grandchild present).
    let full = state
        .tree(TreeParams { path: Some("wiki".into()), depth: None })
        .await
        .unwrap();
    assert!(full.entries.iter().any(|e| e.uri == "mneme://wiki/sub/deep.md"));
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
    // add_root opens/creates the per-root index, so the `.mneme` folder exists on disk.
    assert!(
        extra.join(".mneme").exists(),
        "add_root created the .mneme index folder"
    );

    state
        .remove_root(RemoveRootParams {
            root: "extra".to_string(),
        })
        .await
        .unwrap();
    assert_eq!(state.list_roots().await.unwrap().roots.len(), 1);
    // remove_root deletes the now-orphaned on-disk index (the root folder itself is left alone).
    assert!(
        !extra.join(".mneme").exists(),
        "remove_root deleted the .mneme index folder"
    );
}

#[tokio::test]
async fn root_config_get_returns_defaults() {
    let (state, root, _cfg) = setup("mcp_rootcfg_get");
    let r = state
        .root_config(RootConfigParams {
            root: "wiki".to_string(),
            include: None,
            ignore: None,
        })
        .await
        .unwrap();
    assert_eq!(r.name, "wiki");
    assert_eq!(r.include, vec!["*.md".to_string()]);
    assert!(r.ignore.is_empty());
    assert_eq!(r.folder, root.display().to_string());
}

#[tokio::test]
async fn root_config_set_filters_reindex_and_persist() {
    let (state, _root, cfg_path) = setup("mcp_rootcfg_set");
    state.write_doc(write_params("wiki/a.md", "# A\nalpha")).await.unwrap();
    state.write_doc(write_params("wiki/b.md", "# B\nbeta")).await.unwrap();
    assert_eq!(state.status().await.unwrap().roots[0].doc_count, 2);

    // Narrow the include to only `a.md` → the SET reindexes and drops `b.md`.
    let r = state
        .root_config(RootConfigParams {
            root: "wiki".to_string(),
            include: Some(vec!["a.md".to_string()]),
            ignore: None,
        })
        .await
        .unwrap();
    assert_eq!(r.include, vec!["a.md".to_string()]);
    assert!(r.ignore.is_empty(), "omitted ignore is kept");
    // SET reindexes in the background (US-693) — wait for the reconcile to drop `b.md`.
    wait_doc_count(&state, 1).await;

    // Persisted to the config file (persist is synchronous; happens before the call returns).
    let saved = std::fs::read_to_string(&cfg_path).unwrap();
    assert!(saved.contains("a.md"), "config persisted the new include: {saved}");

    // Widen back to `*.md` → `b.md` (still on disk) is re-indexed in the background.
    state
        .root_config(RootConfigParams {
            root: "wiki".to_string(),
            include: Some(vec!["*.md".to_string()]),
            ignore: None,
        })
        .await
        .unwrap();
    wait_doc_count(&state, 2).await;
}

#[tokio::test]
async fn root_config_unknown_root_errors() {
    let (state, _root, _cfg) = setup("mcp_rootcfg_unknown");
    assert!(state
        .root_config(RootConfigParams {
            root: "nope".to_string(),
            include: None,
            ignore: None,
        })
        .await
        .is_err());
}

#[tokio::test]
async fn root_config_invalid_glob_rejected() {
    let (state, _root, _cfg) = setup("mcp_rootcfg_badglob");
    let res = state
        .root_config(RootConfigParams {
            root: "wiki".to_string(),
            include: None,
            ignore: Some(vec!["a[".to_string()]), // unclosed character class
        })
        .await;
    assert!(res.is_err(), "invalid glob must be rejected");

    // Validation runs before any mutation, so the config is unchanged.
    let r = state
        .root_config(RootConfigParams {
            root: "wiki".to_string(),
            include: None,
            ignore: None,
        })
        .await
        .unwrap();
    assert_eq!(r.include, vec!["*.md".to_string()]);
    assert!(r.ignore.is_empty());
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
    assert_eq!(wiki.schema_ver, persephone_mneme::index::schema::SCHEMA_VERSION);
    assert!(!wiki.index_path.is_empty());
}

#[tokio::test]
async fn index_delete_refuses_the_active_db() {
    let (state, _root, _cfg) = setup("mcp_indexdel");
    let err = state
        .index_delete(IndexDeleteParams {
            root: "wiki".to_string(),
            model_id: "gte-multilingual-base-int8".to_string(),
            schema_ver: persephone_mneme::index::schema::SCHEMA_VERSION,
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

#[tokio::test]
async fn upload_lists_and_roundtrips_binary() {
    let (state, root, _cfg) = setup("mcp_upload");
    state
        .upload(UploadParams {
            path: "wiki/img/logo.png".to_string(),
            content_base64: b64(PNG_BYTES),
        })
        .await
        .unwrap();

    // Listable like a filesystem (US-685)…
    let g = state
        .glob(GlobParams { pattern: "wiki/**/*.png".to_string(), path: None })
        .await
        .unwrap();
    assert_eq!(g.matches, vec!["wiki/img/logo.png"]);
    // …and the stored bytes round-trip exactly.
    assert_eq!(std::fs::read(root.join("img/logo.png")).unwrap(), PNG_BYTES);
}

#[tokio::test]
async fn read_image_returns_image_outcome() {
    let (state, _root, _cfg) = setup("mcp_read_image");
    let encoded = b64(PNG_BYTES);
    state
        .upload(UploadParams { path: "wiki/logo.png".to_string(), content_base64: encoded.clone() })
        .await
        .unwrap();

    match state
        .read_doc(ReadParams { path: "wiki/logo.png".to_string(), offset: None, limit: None })
        .await
        .unwrap()
    {
        ReadOutcome::Image { mime, base64, .. } => {
            assert_eq!(mime, "image/png");
            assert_eq!(base64, encoded);
        }
        _ => panic!("a png must read as an image outcome"),
    }
}

#[tokio::test]
async fn read_svg_is_text_not_image() {
    let (state, _root, _cfg) = setup("mcp_read_svg");
    // SVG is valid UTF-8 → the text path, even though it is an "image" type.
    state
        .write_doc(write_params("wiki/icon.svg", "<svg><title>uniqueword</title></svg>"))
        .await
        .unwrap();
    let r = expect_text(
        state
            .read_doc(ReadParams { path: "wiki/icon.svg".to_string(), offset: None, limit: None })
            .await
            .unwrap(),
    );
    assert!(r.content.contains("uniqueword"));
}

#[tokio::test]
async fn read_nonimage_binary_returns_notice() {
    let (state, root, _cfg) = setup("mcp_read_bin");
    std::fs::write(root.join("blob.bin"), [0u8, 1, 2, 3, 255]).unwrap();
    match state
        .read_doc(ReadParams { path: "wiki/blob.bin".to_string(), offset: None, limit: None })
        .await
        .unwrap()
    {
        ReadOutcome::Binary { note } => assert!(note.contains("not displayable"), "note: {note}"),
        _ => panic!("a non-image binary must return a notice"),
    }
}

#[tokio::test]
async fn upload_binary_is_not_indexed() {
    let (state, _root, _cfg) = setup("mcp_upload_noindex");
    state
        .upload(UploadParams { path: "wiki/a.png".to_string(), content_base64: b64(PNG_BYTES) })
        .await
        .unwrap();
    // The upload creates no index row…
    assert_eq!(state.status().await.unwrap().roots[0].doc_count, 0);

    // …and a reconcile (which walks the index set = *.md) doesn't pick it up either.
    let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
    state
        .reindex(ReindexParams { path: None }, tokio_util::sync::CancellationToken::new(), tx)
        .await
        .unwrap();
    assert_eq!(state.status().await.unwrap().roots[0].doc_count, 0);
}

// --- US-674 tree editing: mkdir / rename / recursive delete -----------------------------------

#[tokio::test]
async fn mkdir_creates_empty_folder_visible_in_tree() {
    let (state, root, _cfg) = setup("mcp_mkdir");
    state
        .mkdir(MkdirParams { path: "wiki/projects/2026".to_string() })
        .await
        .unwrap();

    // On disk…
    assert!(root.join("projects/2026").is_dir());
    // …and visible in the directory-aware tree, even with no files inside.
    let t = state.tree(TreeParams { path: None, depth: None }).await.unwrap();
    assert!(
        t.entries.iter().any(|e| e.uri == "mneme://wiki/projects/2026" && e.is_dir),
        "empty folder must appear as a dir node",
    );
    assert!(t.entries.iter().any(|e| e.uri == "mneme://wiki/projects" && e.is_dir));
    // glob lists files only → the empty folder is not a match.
    let g = state
        .glob(GlobParams { pattern: "wiki/**/*".to_string(), path: None })
        .await
        .unwrap();
    assert!(g.matches.is_empty(), "no files yet: {:?}", g.matches);
}

#[tokio::test]
async fn rename_file_moves_and_updates_index() {
    let (state, _root, _cfg) = setup("mcp_rename_file");
    state.write_doc(write_params("wiki/a.md", "# A\nmovetoken")).await.unwrap();

    state
        .rename(RenameParams { from: "wiki/a.md".to_string(), to: "wiki/sub/b.md".to_string() })
        .await
        .unwrap();

    // Searchable at the new address, count unchanged, old path gone.
    let s = state.search(search_params("movetoken")).await.unwrap();
    assert_eq!(s.results.len(), 1);
    assert_eq!(s.results[0].uri, "wiki/sub/b.md");
    assert_eq!(state.status().await.unwrap().roots[0].doc_count, 1);
    assert!(state
        .read_doc(ReadParams { path: "wiki/a.md".to_string(), offset: None, limit: None })
        .await
        .is_err());
}

#[tokio::test]
async fn rename_to_nonindexed_extension_drops_from_index() {
    let (state, _root, _cfg) = setup("mcp_rename_ext");
    state.write_doc(write_params("wiki/note.md", "# N\nextword")).await.unwrap();
    assert_eq!(state.status().await.unwrap().roots[0].doc_count, 1);

    // Renaming `.md` → `.txt` leaves the file on disk but drops it from the index (Decision 8).
    state
        .rename(RenameParams { from: "wiki/note.md".to_string(), to: "wiki/note.txt".to_string() })
        .await
        .unwrap();
    assert_eq!(state.status().await.unwrap().roots[0].doc_count, 0);
    let g = state
        .glob(GlobParams { pattern: "wiki/*.txt".to_string(), path: None })
        .await
        .unwrap();
    assert_eq!(g.matches, vec!["wiki/note.txt"]);
}

#[tokio::test]
async fn rename_folder_moves_contents_and_index() {
    let (state, _root, _cfg) = setup("mcp_rename_folder");
    state.write_doc(write_params("wiki/old/x.md", "# X\nfoldertoken")).await.unwrap();
    assert_eq!(state.status().await.unwrap().roots[0].doc_count, 1);

    state
        .rename(RenameParams { from: "wiki/old".to_string(), to: "wiki/new".to_string() })
        .await
        .unwrap();

    // The contents (and their index rows) followed the folder; the old path is gone.
    let s = state.search(search_params("foldertoken")).await.unwrap();
    assert_eq!(s.results.len(), 1);
    assert_eq!(s.results[0].uri, "wiki/new/x.md");
    assert_eq!(state.status().await.unwrap().roots[0].doc_count, 1);

    let t = state.tree(TreeParams { path: None, depth: None }).await.unwrap();
    assert!(t.entries.iter().any(|e| e.uri == "mneme://wiki/new"));
    assert!(!t.entries.iter().any(|e| e.uri == "mneme://wiki/old"));
}

#[tokio::test]
async fn rename_refuses_existing_destination() {
    let (state, _root, _cfg) = setup("mcp_rename_conflict");
    state.write_doc(write_params("wiki/a.md", "# A\naa")).await.unwrap();
    state.write_doc(write_params("wiki/b.md", "# B\nbb")).await.unwrap();

    assert!(
        state
            .rename(RenameParams { from: "wiki/a.md".to_string(), to: "wiki/b.md".to_string() })
            .await
            .is_err(),
        "must refuse to overwrite an existing destination",
    );
    assert_eq!(state.status().await.unwrap().roots[0].doc_count, 2);
}

#[tokio::test]
async fn delete_folder_recursively_removes_files_and_index() {
    let (state, root, _cfg) = setup("mcp_delete_folder");
    state.write_doc(write_params("wiki/dir/x.md", "# X\naa")).await.unwrap();
    state.write_doc(write_params("wiki/dir/y.md", "# Y\nbb")).await.unwrap();
    assert_eq!(state.status().await.unwrap().roots[0].doc_count, 2);

    // Deleting the folder removes its files from disk AND their index rows (via scoped reconcile).
    state.delete_doc(DeleteParams { path: "wiki/dir".to_string() }).await.unwrap();

    assert!(!root.join("dir").exists(), "folder removed from disk");
    assert_eq!(state.status().await.unwrap().roots[0].doc_count, 0);
    let g = state
        .glob(GlobParams { pattern: "wiki/**/*.md".to_string(), path: None })
        .await
        .unwrap();
    assert!(g.matches.is_empty(), "no markdown left: {:?}", g.matches);
}

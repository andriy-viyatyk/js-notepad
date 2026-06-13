//! US-658 hybrid-search tests.
//!
//! The hermetic test needs no model (embedder `None`): it proves indexing stays FTS-only and the
//! vector lane returns nothing when no vectors were written. The real-inference test is
//! `#[ignore]`d — it needs the provisioned model + ONNX Runtime — and is run manually with
//! `cargo test --test hybrid_search -- --ignored` after `mneme model-update`.

use std::path::{Path, PathBuf};

use persephone_mneme::config::{Config, ModelConfig, RootConfig};
use persephone_mneme::embed::LazyEmbedder;
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

/// With no embedder, indexing keeps `chunks_vec` empty: FTS works, `doc_has_vectors` is false,
/// and the vector lane returns nothing (so vector/hybrid can degrade to text).
#[test]
fn no_model_leaves_vectors_empty_and_vector_lane_empty() {
    let root = tmp_root("hybrid_nomodel");
    write_file(&root, "a.md", "# Alpha\nhello world content here");
    let c = cfg("wiki", &root);
    let db = IndexDb::open_or_create("wiki", &root, &ModelConfig::default()).unwrap();

    reconcile_root(&db, &c, None).unwrap();

    assert!(
        !db.search_text("hello", &SearchFilter::default(), 10).unwrap().is_empty(),
        "FTS must work without a model"
    );
    assert!(!db.doc_has_vectors("a.md").unwrap(), "no embedder → no vectors");
    let zero = vec![0.0f32; 768];
    assert!(
        db.search_vector(&zero, &SearchFilter::default(), 10).unwrap().is_empty(),
        "empty chunks_vec → no vector hits"
    );
}

/// Real ONNX inference: indexing embeds every doc, the vector lane ranks the on-topic docs above
/// an unrelated one, and hybrid keeps the on-topic doc ahead of the recipe. Ignored in CI.
#[test]
#[ignore = "needs the provisioned model + ONNX Runtime; run with --ignored after `mneme model-update`"]
fn real_hybrid_ranks_semantic_and_keyword_above_unrelated() {
    let embedder = LazyEmbedder::new(Config::default()); // default cache base = real user cache
    let emb = embedder
        .get()
        .expect("model must be provisioned (run `mneme model-update`)");

    let root = tmp_root("hybrid_real");
    write_file(&root, "cancel.md", "# Cancelling\nSteps to end your membership and stop recurring billing.");
    write_file(&root, "recipe.md", "# Pancakes\nThe recipe calls for two cups of flour and a pinch of salt.");
    write_file(&root, "subscription.md", "# Subscription\nManage how to cancel your subscription and billing here.");
    let c = cfg("wiki", &root);
    let db = IndexDb::open_or_create("wiki", &root, &ModelConfig::default()).unwrap();

    reconcile_root(&db, &c, Some(emb.as_ref())).unwrap();

    for f in ["cancel.md", "recipe.md", "subscription.md"] {
        assert!(db.doc_has_vectors(f).unwrap(), "{f} should be embedded");
    }

    let qv = emb.embed_query("how do I cancel my subscription").unwrap();

    let vhits = db.search_vector(&qv, &SearchFilter::default(), 10).unwrap();
    assert!(!vhits.is_empty(), "vector lane returned nothing");
    assert_ne!(
        vhits[0].address, "wiki/recipe.md",
        "the recipe must not be the nearest vector hit"
    );

    let hhits = db.search_hybrid("cancel subscription", &qv, &SearchFilter::default(), 10).unwrap();
    let rank = |addr: &str| hhits.iter().position(|h| h.address == addr);
    let sub_rank = rank("wiki/subscription.md").expect("subscription doc must appear in hybrid results");
    let recipe_rank = rank("wiki/recipe.md");
    assert!(
        recipe_rank.map_or(true, |r| sub_rank < r),
        "subscription (rank {sub_rank}) should out-rank the recipe (rank {recipe_rank:?})"
    );
}

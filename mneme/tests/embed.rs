//! US-657 embedding-engine tests.
//!
//! The hermetic tests need no model and no GPU (they run in CI). The real-inference test is
//! `#[ignore]`d — it needs the provisioned 340 MB model + ONNX Runtime — and is run manually
//! on a dev machine with `cargo test -- --ignored` after `mneme model-update`.

use persephone_mneme::config::{Config, ModelConfig};
use persephone_mneme::embed::{l2_normalize, Embedder, OnnxEmbedder};
use persephone_mneme::error::MnemeError;

/// `load` against a cache base with no model files → `ModelMissing` (never a panic, so the
/// caller can degrade to FTS).
#[test]
fn load_missing_model_errors() {
    let tmp = std::env::temp_dir().join(format!("mneme-embed-empty-{}", std::process::id()));
    std::fs::create_dir_all(&tmp).unwrap();
    let cfg = Config {
        model: ModelConfig {
            name: None,
            path: Some(tmp.clone()), // empty dir → status.complete == false
            precision: None,
        },
        ..Default::default()
    };
    let res = OnnxEmbedder::load(&cfg);
    assert!(
        matches!(res, Err(MnemeError::ModelMissing(_))),
        "expected ModelMissing for an empty cache dir"
    );
    let _ = std::fs::remove_dir_all(&tmp);
}

/// Public normalization helper produces unit-norm vectors.
#[test]
fn l2_normalize_is_unit_norm() {
    let mut v = vec![1.0f32, 2.0, 2.0];
    l2_normalize(&mut v);
    let norm = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    assert!((norm - 1.0).abs() < 1e-6, "norm {norm}");
}

/// Real ONNX inference against the provisioned model. Ignored in CI (needs the model bytes +
/// runtime). Run with: `cargo test --test embed -- --ignored` after `mneme model-update`.
#[test]
#[ignore = "needs the provisioned model + ONNX Runtime; run with --ignored after `mneme model-update`"]
fn real_inference_similarity() {
    let cfg = Config::default(); // default cache base = real user cache
    let emb = OnnxEmbedder::load(&cfg).expect("model must be provisioned (run `mneme model-update`)");
    assert_eq!(emb.dims(), 768);

    let q = emb.embed_query("how do I cancel my subscription").unwrap();
    let related = emb
        .embed_passages(&["Steps to end your membership and stop recurring billing"])
        .unwrap()
        .remove(0);
    let unrelated = emb
        .embed_passages(&["The recipe calls for two cups of flour and a pinch of salt"])
        .unwrap()
        .remove(0);

    assert_eq!(q.len(), 768);
    let norm = q.iter().map(|x| x * x).sum::<f32>().sqrt();
    assert!((norm - 1.0).abs() < 1e-3, "query vector not normalized: {norm}");

    let cos = |a: &[f32], b: &[f32]| a.iter().zip(b).map(|(x, y)| x * y).sum::<f32>();
    let s_related = cos(&q, &related);
    let s_unrelated = cos(&q, &unrelated);
    assert!(
        s_related > s_unrelated,
        "related ({s_related:.4}) should out-score unrelated ({s_unrelated:.4})"
    );
    eprintln!("provider={} related={s_related:.4} unrelated={s_unrelated:.4}", emb.provider());
}

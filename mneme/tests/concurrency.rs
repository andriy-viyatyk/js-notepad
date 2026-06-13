//! US-659 concurrency tests — the reindex JobManager (single-flight, cancellation, progress) and
//! reader-pool responsiveness.
//!
//! The hermetic tests need no model (the embed worker resolves to `None`): they exercise the job
//! lifecycle, the `Cancelled` partial path, and coalesced idempotency. The `#[ignore]`d test needs
//! the provisioned model + ONNX Runtime and proves a bulk reindex is cancellable + completable and
//! that pooled reads stay responsive while it runs (`--ignored` after `mneme model-update`).

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use persephone_mneme::config::{Config, ModelConfig, RootConfig};
use persephone_mneme::embed::{EmbedWorker, LazyEmbedder};
use persephone_mneme::index::{RootIndex, SearchFilter};
use persephone_mneme::indexer::{JobManager, Phase};
use tokio_util::sync::CancellationToken;

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

#[test]
fn blocking_reconcile_indexes_all_and_reports_done() {
    let root = tmp_root("conc_done");
    for i in 0..3 {
        write_file(&root, &format!("d{i}.md"), &format!("# Doc {i}\nbody number {i}"));
    }
    let c = cfg("wiki", &root);
    let ri = Arc::new(RootIndex::open_or_create("wiki", &root, &ModelConfig::default()).unwrap());
    let (_w, emb) = EmbedWorker::start_with(None); // hermetic — no model
    let jobs = JobManager::new();

    let stats = jobs
        .reconcile_blocking(&ri, &c, &emb, CancellationToken::new(), |_| {})
        .unwrap();
    assert_eq!(stats.indexed, 3);
    assert_eq!(stats.vectorized, 0, "no model → no vectors");

    let p = jobs.progress_for("wiki").unwrap();
    assert_eq!(p.phase, Phase::Done);
    assert_eq!(p.processed, p.total);
    assert_eq!(ri.read(|db| db.doc_count().unwrap()), 3);
}

#[test]
fn cancelled_reconcile_reports_cancelled_phase() {
    let root = tmp_root("conc_cancel");
    for i in 0..3 {
        write_file(&root, &format!("d{i}.md"), "# D\nbody");
    }
    let c = cfg("wiki", &root);
    let ri = Arc::new(RootIndex::open_or_create("wiki", &root, &ModelConfig::default()).unwrap());
    let (_w, emb) = EmbedWorker::start_with(None);
    let jobs = JobManager::new();

    let token = CancellationToken::new();
    token.cancel(); // pre-cancelled — the pass stops before the first file
    let stats = jobs.reconcile_blocking(&ri, &c, &emb, token, |_| {}).unwrap();

    assert_eq!(stats.scanned, 0, "cancel before any file is scanned");
    assert_eq!(jobs.progress_for("wiki").unwrap().phase, Phase::Cancelled);
}

#[test]
fn coalesced_reconcile_is_idempotent() {
    let root = tmp_root("conc_coalesce");
    for i in 0..3 {
        write_file(&root, &format!("d{i}.md"), "# D\nbody");
    }
    let c = cfg("wiki", &root);
    let ri = Arc::new(RootIndex::open_or_create("wiki", &root, &ModelConfig::default()).unwrap());
    let (_w, emb) = EmbedWorker::start_with(None);
    let jobs = JobManager::new();

    // Two coalesced passes back-to-back: the second is a cheap fast-path no-op; the index is
    // consistent and the job ends Done.
    jobs.reconcile_coalesced(&ri, &c, &emb, CancellationToken::new());
    jobs.reconcile_coalesced(&ri, &c, &emb, CancellationToken::new());

    assert_eq!(ri.read(|db| db.doc_count().unwrap()), 3);
    assert_eq!(jobs.progress_for("wiki").unwrap().phase, Phase::Done);
}

/// Real ONNX inference: a bulk reindex is cancellable mid-pass and a follow-up reconcile completes
/// the remainder (idempotent backfill), and a pooled FTS read stays responsive while it runs.
#[test]
#[ignore = "needs the provisioned model + ONNX Runtime; run with --ignored after `mneme model-update`"]
fn real_reindex_is_cancellable_completable_and_reads_stay_responsive() {
    let root = tmp_root("conc_real");
    for i in 0..24 {
        write_file(
            &root,
            &format!("n{i}.md"),
            &format!("# Note {i}\nSome content about topic {i} with enough text to embed properly."),
        );
    }
    let c = cfg("wiki", &root);
    let ri = Arc::new(RootIndex::open_or_create("wiki", &root, &ModelConfig::default()).unwrap());
    let (_w, emb) = EmbedWorker::start(LazyEmbedder::new(Config::default()));
    let jobs = JobManager::new();

    // Run a reindex on a background thread; cancel it shortly after it starts embedding.
    let token = CancellationToken::new();
    let (ri2, c2, emb2, jobs2, tok2) =
        (Arc::clone(&ri), c.clone(), emb.clone(), Arc::clone(&jobs), token.clone());
    let stop = Arc::new(AtomicBool::new(false));
    let stop2 = Arc::clone(&stop);
    let handle = std::thread::spawn(move || {
        let s = jobs2
            .reconcile_blocking(&ri2, &c2, &emb2, tok2, |_| {})
            .unwrap();
        stop2.store(true, Ordering::SeqCst);
        s
    });

    // While the reindex runs, a pooled FTS read must return promptly (never blocked by the writer).
    std::thread::sleep(Duration::from_millis(30));
    let started = Instant::now();
    let _ = ri.read(|db| db.search_text("topic", &SearchFilter::default(), 5).unwrap());
    assert!(
        started.elapsed() < Duration::from_millis(500),
        "pooled read should stay responsive during a reindex"
    );

    std::thread::sleep(Duration::from_millis(40));
    token.cancel();
    let _partial = handle.join().unwrap();

    // A follow-up full reconcile completes the remainder — every doc ends embedded (idempotent).
    jobs.reconcile_blocking(&ri, &c, &emb, CancellationToken::new(), |_| {}).unwrap();
    for i in 0..24 {
        assert!(
            ri.read(|db| db.doc_has_vectors(&format!("n{i}.md")).unwrap()),
            "n{i}.md should be embedded after the completing reconcile"
        );
    }
}

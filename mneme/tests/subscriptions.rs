//! US-670 integration test — the watcher half of MCP resource subscriptions.
//!
//! Verifies the new, bug-prone wiring: a filesystem change is debounced, mapped to its
//! `mneme://{root}/{path}` resource URI, and emitted on the fan-out channel — with a
//! `list_changed` signal on structural (create/remove/rename) changes. The peer-delivery half
//! (`notify_resource_updated` over a live `Peer`) is exercised by the US-661 client + manual
//! testing, since constructing a `Peer` requires a live MCP transport.
//!
//! Hermetic: fixtures live under `CARGO_TARGET_TMPDIR`; the live watcher is polled with a bounded
//! timeout (no fixed sleeps).

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use persephone_mneme::config::{Config, ModelConfig, RootConfig};
use persephone_mneme::embed::LazyEmbedder;
use persephone_mneme::indexer::IndexManager;
use persephone_mneme::mcp::subscriptions::{WatchEvent, WatchNotifier};
use tokio::sync::mpsc::UnboundedReceiver;

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

/// Drain the channel until an event satisfying `pred` arrives, or the timeout elapses.
fn wait_for(
    rx: &mut UnboundedReceiver<WatchEvent>,
    timeout: Duration,
    mut pred: impl FnMut(&WatchEvent) -> bool,
) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        while let Ok(ev) = rx.try_recv() {
            if pred(&ev) {
                return true;
            }
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    false
}

#[test]
fn watcher_emits_resource_updated_and_list_changed() {
    let root = tmp_root("subs_watch");
    write_file(&root, "seed.md", "# Seed\nseed");
    let cfg = root_config("wiki", &root);

    // Empty model cache → embedder resolves to None (hermetic, FTS-only).
    let hermetic = Config {
        model: ModelConfig {
            path: Some(root.join("_models")),
            ..Default::default()
        },
        ..Default::default()
    };
    let (notifier, mut rx) = WatchNotifier::new();
    let mgr = IndexManager::start(
        std::slice::from_ref(&cfg),
        &ModelConfig::default(),
        LazyEmbedder::new(hermetic),
        Some(notifier),
    )
    .unwrap();

    let timeout = Duration::from_secs(8);

    // Creating a doc → resources/updated for its URI + a structural resources/list_changed.
    write_file(&root, "added.md", "# Added\nadded");
    assert!(
        wait_for(&mut rx, timeout, |ev| matches!(
            ev,
            WatchEvent::Updated(u) if u == "mneme://wiki/added.md"
        )),
        "watcher did not emit resources/updated for the added doc"
    );
    assert!(
        wait_for(&mut rx, timeout, |ev| matches!(ev, WatchEvent::ListChanged)),
        "watcher did not emit resources/list_changed on create"
    );

    // Editing an existing doc → resources/updated for its URI.
    write_file(&root, "added.md", "# Added\nedited");
    assert!(
        wait_for(&mut rx, timeout, |ev| matches!(
            ev,
            WatchEvent::Updated(u) if u == "mneme://wiki/added.md"
        )),
        "watcher did not emit resources/updated for the edit"
    );

    mgr.shutdown();
}

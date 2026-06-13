//! Hermetic tests for the model provisioner (US-656).
//!
//! All network activity is replaced by a local `tiny_http` fixture server started on an
//! OS-assigned port (127.0.0.1:0). No real model files are downloaded; the test blobs are
//! small in-memory byte sequences.

use std::path::PathBuf;
use std::sync::Arc;
use std::thread;

use sha2::{Digest, Sha256};
use tiny_http::{Header, Response, Server};

use persephone_mneme::config::ModelConfig;
use persephone_mneme::error::MnemeError;
use persephone_mneme::model::{
    download_file, manifest, model_dir, provision_entry, ModelEntry, ModelFile,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Unique temp dir per test, rooted at CARGO_TARGET_TMPDIR.
fn test_dir(name: &str) -> PathBuf {
    let base = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join("us656");
    let dir = base.join(name);
    std::fs::create_dir_all(&dir).expect("create test dir");
    dir
}

/// SHA-256 of a byte slice, as lowercase hex.
fn sha256_hex(data: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(data);
    hex::encode(h.finalize())
}

/// A minimal HTTP fixture entry: the blob to serve and the port the server is on.
struct Fixture {
    port: u16,
    #[allow(dead_code)]
    blob: Arc<Vec<u8>>,
}

/// Spawn a `tiny_http` server on 127.0.0.1:0.
///
/// Each request is handled in a background thread:
/// - If the `Range` header is present and the server is configured to honour it,
///   respond 206 with the sliced blob.
/// - Otherwise respond 200 with the full blob.
///
/// `honour_range`: pass `true` for 206-resumption tests, `false` to simulate servers
/// that ignore Range (returns 200 full content).
///
/// The server shuts down once `shutdown_tx` is dropped.
fn spawn_fixture(blob: Vec<u8>, honour_range: bool) -> (Fixture, std::sync::mpsc::Sender<()>) {
    let server = Server::http("127.0.0.1:0").expect("bind fixture server");
    let port = server.server_addr().to_ip().unwrap().port();
    let blob = Arc::new(blob);
    let blob_srv = Arc::clone(&blob);
    let (tx, rx) = std::sync::mpsc::channel::<()>();
    thread::spawn(move || {
        for req in server.incoming_requests() {
            // Check if a Range header is present.
            let range_start: Option<u64> = if honour_range {
                req.headers()
                    .iter()
                    .find(|h| h.field.equiv("Range"))
                    .and_then(|h| {
                        // "bytes=<start>-"
                        let val = h.value.as_str();
                        val.strip_prefix("bytes=")
                            .and_then(|s| s.trim_end_matches('-').parse::<u64>().ok())
                    })
            } else {
                None
            };

            if let Some(start) = range_start {
                let start = start as usize;
                let slice = if start < blob_srv.len() {
                    blob_srv[start..].to_vec()
                } else {
                    Vec::new()
                };
                let len = slice.len();
                let total = blob_srv.len();
                let content_range = format!("bytes {start}-{}/{total}", total.saturating_sub(1));
                let resp = Response::from_data(slice)
                    .with_status_code(206)
                    .with_header(
                        Header::from_bytes(b"Content-Range", content_range.as_bytes()).unwrap(),
                    )
                    .with_header(
                        Header::from_bytes(b"Content-Length", len.to_string().as_bytes()).unwrap(),
                    );
                let _ = req.respond(resp);
            } else {
                let data = blob_srv.as_ref().clone();
                let len = data.len();
                let resp = Response::from_data(data).with_header(
                    Header::from_bytes(b"Content-Length", len.to_string().as_bytes()).unwrap(),
                );
                let _ = req.respond(resp);
            }

            // Stop after shutdown signal.
            if rx.try_recv().is_ok() {
                break;
            }
        }
    });
    (Fixture { port, blob }, tx)
}

/// Build a synthetic `ModelEntry` with one file pointed at `http://127.0.0.1:<port>/file`.
fn make_entry(port: u16, blob: &[u8]) -> ModelEntry {
    ModelEntry {
        name: "test-model".to_string(),
        precision: "int8".to_string(),
        version: "1".to_string(),
        dims: 4,
        files: vec![ModelFile {
            filename: "model.bin".to_string(),
            url: format!("http://127.0.0.1:{port}/model.bin"),
            sha256: sha256_hex(blob),
            bytes: blob.len() as u64,
        }],
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/// 1. Fresh download — serve a blob, verify sha256, no `.part` remains.
#[test]
fn test_fresh_download() {
    let blob = b"hello model world".to_vec();
    let (fixture, _tx) = spawn_fixture(blob.clone(), false);
    let dir = test_dir("fresh");
    let dest = dir.join("model.bin");
    let sha = sha256_hex(&blob);

    download_file(
        &format!("http://127.0.0.1:{}/model.bin", fixture.port),
        &dest,
        &sha,
        blob.len() as u64,
    )
    .expect("download_file should succeed");

    assert!(dest.exists(), "dest file must exist");
    let got = std::fs::read(&dest).unwrap();
    assert_eq!(got, blob);
    let part = dir.join("model.bin.part");
    assert!(!part.exists(), ".part must be cleaned up");
}

/// 2. SHA-256 mismatch — expect `MnemeError::Checksum`, no final file, no `.part`.
#[test]
fn test_sha256_mismatch() {
    let blob = b"real content".to_vec();
    let (fixture, _tx) = spawn_fixture(blob.clone(), false);
    let dir = test_dir("mismatch");
    let dest = dir.join("model.bin");
    let wrong_sha = "0".repeat(64);

    let result = download_file(
        &format!("http://127.0.0.1:{}/model.bin", fixture.port),
        &dest,
        &wrong_sha,
        blob.len() as u64,
    );
    assert!(
        matches!(result, Err(MnemeError::Checksum { .. })),
        "expected Checksum error, got: {result:?}"
    );
    assert!(!dest.exists(), "final file must not exist on mismatch");
    let part = dir.join("model.bin.part");
    assert!(!part.exists(), ".part must be cleaned up on mismatch");
}

/// 3. Resume 206 — pre-write partial `.part`, serve remainder via Range=206.
#[test]
fn test_resume_206() {
    let blob: Vec<u8> = (0u8..=200).collect();
    let (fixture, _tx) = spawn_fixture(blob.clone(), true); // honour Range
    let dir = test_dir("resume206");
    let dest = dir.join("model.bin");
    let sha = sha256_hex(&blob);
    let split = 50;

    // Write the first `split` bytes as .part
    let part_path = dir.join("model.bin.part");
    std::fs::write(&part_path, &blob[..split]).unwrap();

    download_file(
        &format!("http://127.0.0.1:{}/model.bin", fixture.port),
        &dest,
        &sha,
        blob.len() as u64,
    )
    .expect("resume download should succeed");

    assert!(dest.exists());
    let got = std::fs::read(&dest).unwrap();
    assert_eq!(got, blob);
    assert!(!part_path.exists(), ".part cleaned up after resume");
}

/// 4. Server ignores Range (returns 200 full content) — restarts cleanly.
#[test]
fn test_server_ignores_range_200() {
    let blob: Vec<u8> = (0u8..=100).collect();
    let (fixture, _tx) = spawn_fixture(blob.clone(), false); // does NOT honour Range
    let dir = test_dir("ignore_range");
    let dest = dir.join("model.bin");
    let sha = sha256_hex(&blob);

    // Pre-write a stale .part to simulate an interrupted download.
    let part_path = dir.join("model.bin.part");
    std::fs::write(&part_path, b"stale junk").unwrap();

    download_file(
        &format!("http://127.0.0.1:{}/model.bin", fixture.port),
        &dest,
        &sha,
        blob.len() as u64,
    )
    .expect("should succeed even when server ignores Range");

    let got = std::fs::read(&dest).unwrap();
    assert_eq!(got, blob);
    assert!(!part_path.exists());
}

/// 5. Already present + verified — provision is a no-op (no HTTP request is made).
#[test]
fn test_already_present_no_op() {
    let blob = b"verified content".to_vec();
    let sha = sha256_hex(&blob);
    let dir = test_dir("already_present");

    // Write the blob directly (simulating a prior download).
    let dest = dir.join("model.bin");
    std::fs::write(&dest, &blob).unwrap();

    // Point entry at a non-listening port — if provision tries to connect, it will fail.
    let entry = ModelEntry {
        name: "test-model".to_string(),
        precision: "int8".to_string(),
        version: "1".to_string(),
        dims: 4,
        files: vec![ModelFile {
            filename: "model.bin".to_string(),
            url: "http://127.0.0.1:1/model.bin".to_string(), // nothing listening
            sha256: sha.clone(),
            bytes: blob.len() as u64,
        }],
    };

    let status = provision_entry(&entry, &dir, false).expect("provision should be no-op");
    assert!(status.complete, "should be complete");
    assert!(status.files[0].verified);
    // Final file is still the original content.
    assert_eq!(std::fs::read(&dest).unwrap(), blob);
}

/// 6. Force re-download — files present, `force=true` → re-downloads.
#[test]
fn test_force_redownload() {
    let blob = b"fresh content".to_vec();
    let (fixture, _tx) = spawn_fixture(blob.clone(), false);
    let dir = test_dir("force");
    let entry = make_entry(fixture.port, &blob);
    let dest = dir.join("model.bin");

    // Write a wrong file first.
    std::fs::write(&dest, b"stale").unwrap();

    let status = provision_entry(&entry, &dir, true).expect("force provision should succeed");
    assert!(status.complete);
    assert_eq!(std::fs::read(&dest).unwrap(), blob);
}

/// 7. Offline path override — `cfg.model.path` pointing at dir with verified files.
#[test]
fn test_offline_path_override() {
    let blob = b"offline model bytes".to_vec();
    let sha = sha256_hex(&blob);

    // Build a fake cache dir with the file already present.
    let cache_base = test_dir("offline_cache");
    let entry_dir = cache_base.join("test-model-int8-v1");
    std::fs::create_dir_all(&entry_dir).unwrap();
    std::fs::write(entry_dir.join("model.bin"), &blob).unwrap();

    // ModelConfig pointing path at cache_base.
    let cfg = ModelConfig {
        name: Some("test-model".to_string()),
        precision: Some("int8".to_string()),
        path: Some(cache_base.clone()),
    };

    // Use provision_entry directly (target_entry would look in manifest, not needed here).
    let entry = ModelEntry {
        name: "test-model".to_string(),
        precision: "int8".to_string(),
        version: "1".to_string(),
        dims: 4,
        files: vec![ModelFile {
            filename: "model.bin".to_string(),
            url: "http://127.0.0.1:1/model.bin".to_string(), // non-listening
            sha256: sha.clone(),
            bytes: blob.len() as u64,
        }],
    };
    let dir = model_dir(&cfg, &entry).unwrap();
    let status = provision_entry(&entry, &dir, false).expect("offline provision should succeed");
    assert!(status.complete, "offline dir with valid file must be complete");
}

/// 8. Manifest parses — `manifest()` returns the expected entry.
#[test]
fn test_manifest_parses() {
    let entries = manifest().expect("manifest() must parse");
    assert!(
        !entries.is_empty(),
        "manifest must contain at least one entry"
    );
    let first = &entries[0];
    assert_eq!(first.name, "gte-multilingual-base");
    assert_eq!(first.precision, "int8");
    assert!(!first.files.is_empty());
}

/// 9. Manifest consistency — every entry has ≥1 file, model IDs unique.
#[test]
fn test_manifest_consistency() {
    let entries = manifest().expect("manifest() must parse");
    let mut seen = std::collections::HashSet::new();
    for e in &entries {
        assert!(!e.files.is_empty(), "entry '{}' has no files", e.name);
        let id = format!("{}-{}", e.name, e.precision);
        assert!(seen.insert(id.clone()), "duplicate model id: {id}");
    }
}

/// 10. Cache base and model dir resolve correctly with defaults.
#[test]
fn test_cache_base_and_model_dir() {
    let cfg = ModelConfig {
        name: None,
        precision: None,
        path: None,
    };
    // Should not error (requires OS config dir).
    let base = persephone_mneme::model::cache_base(&cfg);
    assert!(base.is_ok(), "cache_base with defaults must resolve");

    // With explicit path override.
    let tmp = test_dir("cache_base");
    let cfg2 = ModelConfig {
        name: None,
        precision: None,
        path: Some(tmp.clone()),
    };
    let base2 = persephone_mneme::model::cache_base(&cfg2).unwrap();
    assert_eq!(base2, tmp);
}

// ---------------------------------------------------------------------------
// Helper used in test_resume_206: verify we can write a partial .part and that
// the hasher from reading it matches the prefix.
// ---------------------------------------------------------------------------

/// Sanity-check that sha256 of prefix bytes matches what the hasher accumulates.
#[test]
fn test_partial_sha256_accumulation() {
    let full = b"abcdefghijklmnop".to_vec();
    let prefix = &full[..8];
    let rest = &full[8..];

    let mut h = Sha256::new();
    h.update(prefix);
    h.update(rest);
    let combined = hex::encode(h.finalize());

    let direct = sha256_hex(&full);
    assert_eq!(combined, direct, "incremental sha256 must match direct");
}

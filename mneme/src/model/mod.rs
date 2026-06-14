//! Model provisioner (US-656).
//!
//! Downloads and verifies the configured embedding model files into a local cache directory.
//! Supports HTTP range-resume for interrupted downloads and atomic rename on completion.
//!
//! The bundled manifest (`assets/models.json`) declares all known model entries.
//! The active entry is selected by `ModelConfig.name` + `ModelConfig.precision`
//! (defaults: `gte-multilingual-base` / `int8`).
//!
//! Cache layout:
//! ```text
//! <cache_base>/<name>-<precision>-v<version>/
//!   model.onnx
//!   tokenizer.json
//! ```

use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::config::ModelConfig;
use crate::error::{MnemeError, Result};

// --- manifest types ----------------------------------------------------------

const MANIFEST_BYTES: &[u8] = include_bytes!("../../assets/models.json");

pub const DEFAULT_MODEL_NAME: &str = "gte-multilingual-base";
pub const DEFAULT_PRECISION: &str = "int8";

/// A single file within a model entry.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ModelFile {
    pub filename: String,
    pub url: String,
    pub sha256: String,
    pub bytes: u64,
}

/// A single model entry in the manifest.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ModelEntry {
    pub name: String,
    pub precision: String,
    pub version: String,
    pub dims: u32,
    pub files: Vec<ModelFile>,
}

/// Top-level manifest structure.
#[derive(Debug, Deserialize)]
struct Manifest {
    #[allow(dead_code)]
    schema: u32,
    models: Vec<ModelEntry>,
}

// --- status types ------------------------------------------------------------

/// Per-file download/verify status.
#[derive(Debug, Clone, Serialize)]
pub struct ModelFileStatus {
    pub filename: String,
    pub present: bool,
    pub verified: bool,
    pub bytes: u64,
}

/// Live model-download progress, derived from the filesystem (present files + `.part` sidecars)
/// against the manifest's total bytes. `phase` is `idle`/`downloading`/`verifying`/`done`/`error`.
/// Surfaced on `wiki_status.model.download` so the editor can show a progress bar without holding
/// the (now background) `wiki_model_update` call open.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelDownloadStatus {
    pub phase: String,
    pub bytes_done: u64,
    pub bytes_total: u64,
}

/// Overall model status returned by `status()` and `provision()`.
#[derive(Debug, Clone, Serialize)]
pub struct ModelStatus {
    pub name: String,
    pub precision: String,
    pub version: String,
    pub dir: String,
    pub complete: bool,
    pub files: Vec<ModelFileStatus>,
    /// Live download progress when a background `wiki_model_update` is in flight (or errored).
    /// `None` from the pure `status()` / `provision()` helpers — the MCP server fills it in.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download: Option<ModelDownloadStatus>,
}

// --- public helpers ----------------------------------------------------------

/// Parse and return the bundled manifest.
pub fn manifest() -> Result<Vec<ModelEntry>> {
    let m: Manifest = serde_json::from_slice(MANIFEST_BYTES)
        .map_err(|e| MnemeError::Internal(format!("models.json parse error: {e}")))?;
    Ok(m.models)
}

/// Resolve the local cache base directory.
///
/// If `cfg.path` is Some, use it directly; otherwise fall back to
/// `<os-config-dir>/persephone/data/mneme/models`.
pub fn cache_base(cfg: &ModelConfig) -> Result<PathBuf> {
    if let Some(ref p) = cfg.path {
        return Ok(p.clone());
    }
    dirs::config_dir()
        .map(|d| d.join("persephone").join("data").join("mneme").join("models"))
        .ok_or_else(|| MnemeError::Internal("cannot determine OS config directory".to_string()))
}

/// Resolve the directory for a specific model entry.
pub fn model_dir(cfg: &ModelConfig, entry: &ModelEntry) -> Result<PathBuf> {
    let base = cache_base(cfg)?;
    let dir_name = format!("{}-{}-v{}", entry.name, entry.precision, entry.version);
    Ok(base.join(dir_name))
}

/// Find the target manifest entry matching `cfg.name` + `cfg.precision`.
pub fn target_entry(cfg: &ModelConfig) -> Result<ModelEntry> {
    let name = cfg.name.as_deref().unwrap_or(DEFAULT_MODEL_NAME);
    let precision = cfg.precision.as_deref().unwrap_or(DEFAULT_PRECISION);
    let entries = manifest()?;
    entries
        .into_iter()
        .find(|e| e.name == name && e.precision == precision)
        .ok_or_else(|| {
            MnemeError::Config(format!(
                "no manifest entry for model '{name}' precision '{precision}'"
            ))
        })
}

/// Verify a file's SHA-256 against an expected hex digest.
/// Returns `true` if the file exists and its digest matches.
fn verify_file(path: &Path, expected_sha256: &str) -> bool {
    let mut f = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return false,
    };
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 4096];
    loop {
        match f.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => hasher.update(&buf[..n]),
            Err(_) => return false,
        }
    }
    let got = hex::encode(hasher.finalize());
    got == expected_sha256
}

/// The in-progress download sidecar path for a final destination (`model.onnx` → `model.onnx.part`).
fn part_path(dest_path: &Path) -> PathBuf {
    let mut p = dest_path.as_os_str().to_owned();
    p.push(".part");
    PathBuf::from(p)
}

/// Download a single file with resume support and atomic rename on success.
///
/// - `dest_path`: the final destination (e.g. `model_dir/model.onnx`)
/// - `.part` suffix is used during download; renamed to `dest_path` on success
/// - Sends `Range: bytes=<offset>-` if a `.part` file already exists
/// - If server returns 200 instead of 206 (ignores Range): restarts cleanly
/// - On completion: verifies sha256; on mismatch removes `.part` and returns `Checksum` error
pub fn download_file(
    url: &str,
    dest_path: &Path,
    expected_sha256: &str,
    _expected_bytes: u64,
) -> Result<()> {
    let part_path = part_path(dest_path);

    // Pre-seed hasher from existing .part and compute resume offset.
    let (mut hasher, range_start) = if part_path.exists() {
        let mut f = std::fs::File::open(&part_path)?;
        let mut h = Sha256::new();
        let mut buf = [0u8; 4096];
        let mut total = 0u64;
        loop {
            match f.read(&mut buf)? {
                0 => break,
                n => {
                    h.update(&buf[..n]);
                    total += n as u64;
                }
            }
        }
        tracing::debug!(bytes = total, path = %part_path.display(), "resuming partial download");
        (h, total)
    } else {
        (Sha256::new(), 0u64)
    };

    // Build and send the request.
    let request = if range_start > 0 {
        ureq::get(url).header("Range", format!("bytes={range_start}-"))
    } else {
        ureq::get(url)
    };

    let response = request
        .call()
        .map_err(|e| MnemeError::Download(format!("GET {url}: {e}")))?;

    let status = response.status().as_u16();
    tracing::debug!(status, url, range_start, "HTTP response");

    // Decide how to open the .part file.
    let mut part_file = if status == 206 && range_start > 0 {
        // Server honoured Range — append to existing .part.
        std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&part_path)?
    } else {
        // Either no resume was attempted (range_start == 0), or server returned 200
        // despite our Range header — start fresh.
        if range_start > 0 {
            tracing::debug!("server returned {status} (ignored Range); restarting download");
            hasher = Sha256::new();
        }
        std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&part_path)?
    };

    // Stream body into .part, feeding the hasher.
    let mut reader = response.into_body().into_reader();
    let mut buf = [0u8; 4096];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                hasher.update(&buf[..n]);
                part_file.write_all(&buf[..n])?;
            }
            Err(e) => {
                return Err(MnemeError::Download(format!(
                    "read error streaming {url}: {e}"
                )));
            }
        }
    }
    drop(part_file);

    // Verify sha256.
    let got = hex::encode(hasher.finalize());
    if got != expected_sha256 {
        let _ = std::fs::remove_file(&part_path);
        let filename = dest_path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| dest_path.display().to_string());
        return Err(MnemeError::Checksum {
            file: filename,
            expected: expected_sha256.to_string(),
            got,
        });
    }

    // Atomic rename.
    std::fs::rename(&part_path, dest_path)?;
    tracing::info!(path = %dest_path.display(), "model file downloaded and verified");
    Ok(())
}

/// Provision a model entry from an explicit entry (used by tests and `provision`).
///
/// Files that are already present and verified are skipped unless `force` is true.
pub fn provision_entry(entry: &ModelEntry, base_dir: &Path, force: bool) -> Result<ModelStatus> {
    std::fs::create_dir_all(base_dir)?;

    let mut file_statuses = Vec::new();
    for mf in &entry.files {
        let dest = base_dir.join(&mf.filename);
        let already_ok = dest.exists() && verify_file(&dest, &mf.sha256);
        if already_ok && !force {
            tracing::debug!(file = %mf.filename, "already present and verified — skip");
        } else {
            tracing::info!(file = %mf.filename, force, "downloading model file");
            download_file(&mf.url, &dest, &mf.sha256, mf.bytes)?;
        }
        let present = dest.exists();
        let verified = if present {
            verify_file(&dest, &mf.sha256)
        } else {
            false
        };
        let bytes = if present {
            std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0)
        } else {
            0
        };
        file_statuses.push(ModelFileStatus {
            filename: mf.filename.clone(),
            present,
            verified,
            bytes,
        });
    }

    let complete = file_statuses.iter().all(|f| f.verified);
    Ok(ModelStatus {
        name: entry.name.clone(),
        precision: entry.precision.clone(),
        version: entry.version.clone(),
        dir: base_dir.display().to_string(),
        complete,
        files: file_statuses,
        download: None,
    })
}

/// Download and verify model files into the cache (public entry point).
///
/// Skips files that are already present and verified unless `force` is true.
/// Returns a `ModelStatus` describing what is on disk after the operation.
pub fn provision(cfg: &ModelConfig, force: bool) -> Result<ModelStatus> {
    let entry = target_entry(cfg)?;
    let dir = model_dir(cfg, &entry)?;
    provision_entry(&entry, &dir, force)
}

/// Query the on-disk status of the configured model without downloading anything.
pub fn status(cfg: &ModelConfig) -> Result<ModelStatus> {
    let entry = target_entry(cfg)?;
    let dir = model_dir(cfg, &entry)?;

    let mut file_statuses = Vec::new();
    for mf in &entry.files {
        let dest = dir.join(&mf.filename);
        let present = dest.exists();
        let verified = if present {
            verify_file(&dest, &mf.sha256)
        } else {
            false
        };
        let bytes = if present {
            std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0)
        } else {
            0
        };
        file_statuses.push(ModelFileStatus {
            filename: mf.filename.clone(),
            present,
            verified,
            bytes,
        });
    }

    let complete = file_statuses.iter().all(|f| f.verified);
    Ok(ModelStatus {
        name: entry.name.clone(),
        precision: entry.precision.clone(),
        version: entry.version.clone(),
        dir: dir.display().to_string(),
        complete,
        files: file_statuses,
        download: None,
    })
}

/// Compute download progress from the filesystem: sum the bytes of present final files plus any
/// `.part` sidecars, against the manifest's total bytes. The caller supplies `in_flight`/`errored`
/// (it owns the background-job state) — the filesystem alone can't tell an active download from a
/// stale `.part`. Phase: `error` if errored; while in flight, `verifying` once a `.part` is at full
/// size (sha256 + rename pending) else `downloading`; otherwise `done` when all files are present,
/// else `idle`.
pub fn download_progress(cfg: &ModelConfig, in_flight: bool, errored: bool) -> Result<ModelDownloadStatus> {
    let entry = target_entry(cfg)?;
    let dir = model_dir(cfg, &entry)?;

    let mut bytes_done = 0u64;
    let mut bytes_total = 0u64;
    let mut all_present = true;
    let mut any_part_full = false;
    for mf in &entry.files {
        bytes_total += mf.bytes;
        let dest = dir.join(&mf.filename);
        if dest.exists() {
            bytes_done += std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
        } else {
            all_present = false;
            if let Ok(m) = std::fs::metadata(part_path(&dest)) {
                bytes_done += m.len();
                if m.len() >= mf.bytes {
                    any_part_full = true;
                }
            }
        }
    }

    let phase = if errored {
        "error"
    } else if in_flight {
        if any_part_full {
            "verifying"
        } else {
            "downloading"
        }
    } else if all_present {
        "done"
    } else {
        "idle"
    };

    Ok(ModelDownloadStatus {
        phase: phase.to_string(),
        bytes_done,
        bytes_total,
    })
}

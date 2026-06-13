//! Embedding engine (US-657).
//!
//! Turns text into a normalized 768-dim embedding vector using the ONNX model + tokenizer
//! that the provisioner (US-656) places on disk, via ONNX Runtime (`ort`) with the DirectML
//! execution provider when available and an automatic CPU fallback (driven by [`GpuMode`]).
//!
//! This task produces vectors only. Writing them into `chunks_vec`, KNN, and RRF merge is
//! US-658; the dedicated embedding worker + priority queue + progress is US-659. Inference is
//! serialized behind a `Mutex<Session>` for now — the single-worker model lands in US-659.
//!
//! `gte-multilingual-base` is a GTE encoder: sentence embeddings are the **CLS** token of the
//! last hidden state, L2-normalized, with **no** instruction prefix (unlike the E5/Qwen
//! families). The prefix constants below are the single place to change if a future asymmetric
//! model is adopted (D5 upgrade path) — the [`Embedder`] surface does not change.

use std::path::Path;
use std::sync::{Arc, Mutex, OnceLock};

use ort::execution_providers::{CPUExecutionProvider, DirectMLExecutionProvider};
use ort::session::{builder::GraphOptimizationLevel, Session};
use ort::value::Tensor;
use tokenizers::Tokenizer;

use crate::config::{Config, GpuMode};
use crate::error::{MnemeError, Result};
use crate::model;

/// Whether text is a search query or an indexed passage — lets an implementation apply the
/// correct instruction prefix for asymmetric-retrieval models. (gte-multilingual-base treats
/// both the same; see the prefix constants.)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EmbedKind {
    Query,
    Passage,
}

/// gte-multilingual-base uses no instruction prefix. Centralized so a future prefixed model
/// (e.g. the Qwen3 upgrade in D5) is a one-line change with no API churn.
const QUERY_PREFIX: &str = "";
const PASSAGE_PREFIX: &str = "";

/// Produces normalized embedding vectors. `Send + Sync` so it can live in an `Arc` and be
/// called from `spawn_blocking` (US-658/659).
pub trait Embedder: Send + Sync {
    /// Embed one query string → normalized `Vec<f32>` of length [`Embedder::dims`].
    fn embed_query(&self, text: &str) -> Result<Vec<f32>>;
    /// Embed a batch of passages (chunks) → one normalized vector each.
    fn embed_passages(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>>;
    /// Output dimension (768 for gte-multilingual-base).
    fn dims(&self) -> usize;
    /// Active execution provider, for status/logs (e.g. `"DirectML (CPU fallback)"` / `"CPU"`).
    fn provider(&self) -> &str;
}

/// ONNX Runtime + HuggingFace-tokenizers implementation of [`Embedder`].
pub struct OnnxEmbedder {
    session: Mutex<Session>,
    tokenizer: Tokenizer,
    dims: usize,
    provider: String,
    /// Input names declared by the model — used to decide whether to feed `token_type_ids`.
    input_names: Vec<String>,
}

impl OnnxEmbedder {
    /// Load the configured model from the provisioner cache and build an inference session.
    ///
    /// Returns [`MnemeError::ModelMissing`] if the model files are not present
    /// (run `mneme model-update` first). The execution provider is selected from `cfg.gpu`.
    pub fn load(cfg: &Config) -> Result<Self> {
        let entry = model::target_entry(&cfg.model)?;
        let dir = model::model_dir(&cfg.model, &entry)?;
        let onnx_path = dir.join("model.onnx");
        let tok_path = dir.join("tokenizer.json");

        // The provisioner is the source of truth for "is the model present + verified".
        let st = model::status(&cfg.model)?;
        if !st.complete || !onnx_path.exists() || !tok_path.exists() {
            return Err(MnemeError::ModelMissing(format!(
                "model files missing under {}; run `mneme model-update`",
                dir.display()
            )));
        }

        Self::load_from_files(&onnx_path, &tok_path, entry.dims as usize, cfg.gpu)
    }

    /// Build an embedder from explicit file paths (used by `load` and by tests).
    pub fn load_from_files(
        onnx_path: &Path,
        tok_path: &Path,
        dims: usize,
        gpu: GpuMode,
    ) -> Result<Self> {
        let mut tokenizer =
            Tokenizer::from_file(tok_path).map_err(|e| MnemeError::Embed(e.to_string()))?;
        // Pad to the longest sequence in each batch so tensor rows align; truncate to the
        // model's max context. Chunks are ~500 tokens, well under the cap.
        configure_tokenizer(&mut tokenizer);

        let (eps, provider) = execution_providers(gpu);
        let session = Session::builder()
            .map_err(embed_err)?
            .with_execution_providers(eps)
            .map_err(embed_err)?
            .with_optimization_level(GraphOptimizationLevel::Level3)
            .map_err(embed_err)?
            .commit_from_file(onnx_path)
            .map_err(embed_err)?;

        let input_names = session.inputs().iter().map(|i| i.name().to_string()).collect();
        tracing::info!(provider = %provider, dims, "embedding session ready");

        Ok(Self {
            session: Mutex::new(session),
            tokenizer,
            dims,
            provider,
            input_names,
        })
    }

    /// Tokenize + run + pool + normalize a batch. Shared core for both trait methods.
    fn encode(&self, texts: &[&str], kind: EmbedKind) -> Result<Vec<Vec<f32>>> {
        if texts.is_empty() {
            return Ok(Vec::new());
        }
        let prefix = match kind {
            EmbedKind::Query => QUERY_PREFIX,
            EmbedKind::Passage => PASSAGE_PREFIX,
        };
        let prefixed: Vec<String> = texts.iter().map(|t| format!("{prefix}{t}")).collect();

        let encodings = self
            .tokenizer
            .encode_batch(prefixed, true)
            .map_err(|e| MnemeError::Embed(e.to_string()))?;

        let batch = encodings.len();
        let seq = encodings.iter().map(|e| e.get_ids().len()).max().unwrap_or(0);
        if seq == 0 {
            return Err(MnemeError::Embed("empty tokenization".to_string()));
        }

        let mut ids = Vec::with_capacity(batch * seq);
        let mut mask = Vec::with_capacity(batch * seq);
        for e in &encodings {
            // Padding strategy guarantees every encoding is already `seq` long.
            ids.extend(e.get_ids().iter().map(|&v| v as i64));
            mask.extend(e.get_attention_mask().iter().map(|&v| v as i64));
        }

        let shape = [batch, seq];
        let ids_t = Tensor::from_array((shape, ids)).map_err(embed_err)?;
        let mask_t = Tensor::from_array((shape, mask.clone())).map_err(embed_err)?;

        let mut session = self.session.lock().unwrap();
        let outputs = if self.input_names.iter().any(|n| n == "token_type_ids") {
            let tt = Tensor::from_array((shape, vec![0i64; batch * seq])).map_err(embed_err)?;
            session
                .run(ort::inputs![
                    "input_ids" => ids_t,
                    "attention_mask" => mask_t,
                    "token_type_ids" => tt,
                ])
                .map_err(embed_err)?
        } else {
            session
                .run(ort::inputs![
                    "input_ids" => ids_t,
                    "attention_mask" => mask_t,
                ])
                .map_err(embed_err)?
        };

        // First output is the last hidden state, shape [batch, seq, dims].
        let (out_shape, data) = outputs[0].try_extract_tensor::<f32>().map_err(embed_err)?;
        let dim = *out_shape.last().ok_or_else(|| {
            MnemeError::Embed("model output has no dimensions".to_string())
        })? as usize;
        if dim != self.dims {
            return Err(MnemeError::Embed(format!(
                "model output dim {dim} != expected {}",
                self.dims
            )));
        }

        let mut out = Vec::with_capacity(batch);
        for b in 0..batch {
            // CLS pooling: token 0 of row b.
            let start = b * seq * dim;
            let mut v = data[start..start + dim].to_vec();
            l2_normalize(&mut v);
            out.push(v);
        }
        Ok(out)
    }
}

impl Embedder for OnnxEmbedder {
    fn embed_query(&self, text: &str) -> Result<Vec<f32>> {
        let mut v = self.encode(&[text], EmbedKind::Query)?;
        v.pop()
            .ok_or_else(|| MnemeError::Embed("no embedding produced".to_string()))
    }

    fn embed_passages(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>> {
        self.encode(texts, EmbedKind::Passage)
    }

    fn dims(&self) -> usize {
        self.dims
    }

    fn provider(&self) -> &str {
        &self.provider
    }
}

/// Lazily builds (once) the process embedder and shares it across the search + index paths.
///
/// The build happens on the first [`LazyEmbedder::get`] — which lands on the deferred-reconcile
/// thread or the first vector search, whichever comes first — so it stays off the `serve`
/// startup path. A cached `None` after the build attempt means the model is not provisioned
/// (logged once); callers degrade to FTS and never crash. Held behind an `Arc` by both
/// `ServerState` (search) and `IndexManager` (indexing) so the model loads exactly once.
pub struct LazyEmbedder {
    cell: OnceLock<Option<Arc<dyn Embedder>>>,
    config: Config,
}

impl LazyEmbedder {
    pub fn new(config: Config) -> Arc<Self> {
        Arc::new(Self {
            cell: OnceLock::new(),
            config,
        })
    }

    /// Build-once accessor. Returns a clone of the cached `Option` (cheap after the first call).
    pub fn get(&self) -> Option<Arc<dyn Embedder>> {
        self.cell
            .get_or_init(|| match OnnxEmbedder::load(&self.config) {
                Ok(e) => Some(Arc::new(e) as Arc<dyn Embedder>),
                Err(MnemeError::ModelMissing(_)) => {
                    tracing::info!("embedding model not provisioned — FTS-only");
                    None
                }
                Err(e) => {
                    tracing::warn!("embedder build failed ({e}) — FTS-only");
                    None
                }
            })
            .clone()
    }
}

// --- pure helpers (unit-testable without a model) --------------------------------------------

fn embed_err<E: std::fmt::Display>(e: E) -> MnemeError {
    MnemeError::Embed(e.to_string())
}

/// Configure batch-longest padding and truncation to the model's max context.
fn configure_tokenizer(tokenizer: &mut Tokenizer) {
    use tokenizers::{PaddingParams, PaddingStrategy, TruncationParams};
    tokenizer.with_padding(Some(PaddingParams {
        strategy: PaddingStrategy::BatchLongest,
        ..Default::default()
    }));
    let _ = tokenizer.with_truncation(Some(TruncationParams {
        max_length: MAX_SEQ_LEN,
        ..Default::default()
    }));
}

/// Model max context (gte-multilingual-base supports 8192 with NTK RoPE scaling).
const MAX_SEQ_LEN: usize = 8192;

/// Build the execution-provider list for the configured GPU mode, plus a human label.
/// CPU is always appended as the guaranteed fallback so session creation never hard-fails on
/// a machine without DirectML.
fn execution_providers(
    mode: GpuMode,
) -> (Vec<ort::execution_providers::ExecutionProviderDispatch>, String) {
    match mode {
        GpuMode::Auto | GpuMode::On => (
            vec![
                DirectMLExecutionProvider::default().build(),
                CPUExecutionProvider::default().build(),
            ],
            "DirectML (CPU fallback)".to_string(),
        ),
        GpuMode::Off => (
            vec![CPUExecutionProvider::default().build()],
            "CPU".to_string(),
        ),
    }
}

/// L2-normalize in place. A zero vector is left untouched (no NaN).
pub fn l2_normalize(v: &mut [f32]) {
    let norm = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 0.0 {
        for x in v.iter_mut() {
            *x /= norm;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_unit_norm() {
        let mut v = vec![3.0f32, 4.0];
        l2_normalize(&mut v);
        let norm = (v[0] * v[0] + v[1] * v[1]).sqrt();
        assert!((norm - 1.0).abs() < 1e-6);
        assert!((v[0] - 0.6).abs() < 1e-6);
        assert!((v[1] - 0.8).abs() < 1e-6);
    }

    #[test]
    fn normalize_zero_vector_no_nan() {
        let mut v = vec![0.0f32, 0.0, 0.0];
        l2_normalize(&mut v);
        assert!(v.iter().all(|x| *x == 0.0));
    }

    #[test]
    fn ep_list_matches_mode() {
        assert_eq!(execution_providers(GpuMode::Off).0.len(), 1);
        assert_eq!(execution_providers(GpuMode::Off).1, "CPU");
        assert_eq!(execution_providers(GpuMode::Auto).0.len(), 2);
        assert_eq!(execution_providers(GpuMode::On).0.len(), 2);
        assert!(execution_providers(GpuMode::Auto).1.contains("DirectML"));
    }
}

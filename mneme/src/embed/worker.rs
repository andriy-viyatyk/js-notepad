//! Embedding worker + priority queue (US-659).
//!
//! ONNX inference is CPU-bound and serialized behind one model session, so it must not run
//! inline on the request/reconcile path (where it would hold the per-root index lock for the
//! whole bulk reindex — US-658's behaviour). This module moves all embedding onto **one
//! dedicated worker thread** that owns the [`Embedder`], fed by a **priority queue**:
//!
//! - **interactive** lane (unbounded) — a search query embed, a just-edited document. Drained
//!   first, so it preempts *queued* bulk work.
//! - **bulk** lane (bounded → **backpressure**) — reindex batches. A full lane blocks the
//!   producer (bounding memory) instead of ballooning the queue.
//!
//! The worker drains all pending interactive jobs before taking one bulk job, so the
//! interactive-latency floor during a reindex is a single in-flight bulk batch (US-651). All
//! callers are synchronous (`spawn_blocking` / CLI threads), so the handle uses sync channels
//! end-to-end — no async plumbing. The model is resolved **on the first job** via
//! [`LazyEmbedder`], keeping load off the `serve` startup path; a missing model resolves to
//! `None` and every embed returns `Ok(None)` so callers degrade to FTS.

use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;

use crossbeam_channel::{bounded, unbounded, Receiver, Sender};

use crate::error::{MnemeError, Result};

use super::{Embedder, EmbedKind, LazyEmbedder};

/// Bulk-lane capacity — the number of in-flight reindex embed jobs before the producer blocks
/// (backpressure). Small: each job is one document's chunks, tens of ms on the worker.
const BULK_QUEUE: usize = 8;

// Embedder-resolution state, published by the worker after its first `get()` so callers can
// cheaply pre-check availability without submitting a job.
const UNKNOWN: u8 = 0;
const PRESENT: u8 = 1;
const ABSENT: u8 = 2;

/// Which queue a submitted embed joins.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Priority {
    /// Search query / single edited doc — preempts queued bulk work.
    Interactive,
    /// Reindex batch — bounded lane (backpressure).
    Bulk,
}

/// One unit of work for the worker: embed `texts` as a query or as passages.
struct EmbedJob {
    texts: Vec<String>,
    kind: EmbedKind,
    /// One-shot reply: `Ok(None)` = no model (degrade), `Ok(Some(vecs))` = one vector per text.
    reply: Sender<Result<Option<Vec<Vec<f32>>>>>,
}

/// Owns the worker thread. Held alive for the process; dropping all [`EmbedHandle`]s closes the
/// queues and the thread exits. Kept as a field so the thread isn't detached accidentally.
pub struct EmbedWorker {
    _join: JoinHandle<()>,
}

/// Cloneable submit handle. Shared by the search path, the indexer, and the watcher.
#[derive(Clone)]
pub struct EmbedHandle {
    interactive: Sender<EmbedJob>,
    bulk: Sender<EmbedJob>,
    state: Arc<AtomicU8>,
}

impl EmbedWorker {
    /// Start the worker, resolving the model lazily (on the first job) via `lazy`.
    pub fn start(lazy: Arc<LazyEmbedder>) -> (EmbedWorker, EmbedHandle) {
        Self::spawn(move || lazy.get())
    }

    /// Start the worker with an already-resolved embedder (tests; pre-resolved injection).
    pub fn start_with(embedder: Option<Arc<dyn Embedder>>) -> (EmbedWorker, EmbedHandle) {
        Self::spawn(move || embedder)
    }

    fn spawn(resolve: impl FnOnce() -> Option<Arc<dyn Embedder>> + Send + 'static) -> (EmbedWorker, EmbedHandle) {
        let (itx, irx) = unbounded::<EmbedJob>();
        let (btx, brx) = bounded::<EmbedJob>(BULK_QUEUE);
        let state = Arc::new(AtomicU8::new(UNKNOWN));
        let worker_state = Arc::clone(&state);
        let join = std::thread::Builder::new()
            .name("mneme-embed".into())
            .spawn(move || worker_loop(resolve, irx, brx, worker_state))
            .expect("spawn mneme embed worker");
        (
            EmbedWorker { _join: join },
            EmbedHandle { interactive: itx, bulk: btx, state },
        )
    }
}

impl EmbedHandle {
    /// Embed one query at interactive priority. `Ok(None)` = no model (caller falls back to text).
    pub fn embed_query(&self, text: &str) -> Result<Option<Vec<f32>>> {
        let (tx, rx) = bounded(1);
        self.interactive
            .send(EmbedJob { texts: vec![text.to_string()], kind: EmbedKind::Query, reply: tx })
            .map_err(|_| stopped())?;
        let out = rx.recv().map_err(|_| dropped())??;
        Ok(out.map(|mut v| v.remove(0)))
    }

    /// Embed a batch of passages. `pri` = [`Priority::Bulk`] for reindex, [`Priority::Interactive`]
    /// for a single just-edited document. `Ok(None)` = no model (caller skips embedding).
    pub fn embed_passages(&self, texts: &[&str], pri: Priority) -> Result<Option<Vec<Vec<f32>>>> {
        let (tx, rx) = bounded(1);
        let job = EmbedJob {
            texts: texts.iter().map(|s| s.to_string()).collect(),
            kind: EmbedKind::Passage,
            reply: tx,
        };
        let sender = match pri {
            Priority::Interactive => &self.interactive,
            Priority::Bulk => &self.bulk,
        };
        sender.send(job).map_err(|_| stopped())?;
        rx.recv().map_err(|_| dropped())?
    }

    /// Cheap availability pre-check: `None` until the worker has resolved the model once, then
    /// `Some(true)` if a model is loaded, `Some(false)` if none is provisioned.
    pub fn available(&self) -> Option<bool> {
        match self.state.load(Ordering::SeqCst) {
            PRESENT => Some(true),
            ABSENT => Some(false),
            _ => None,
        }
    }
}

fn stopped() -> MnemeError {
    MnemeError::Embed("embed worker stopped".into())
}
fn dropped() -> MnemeError {
    MnemeError::Embed("embed worker dropped the reply".into())
}

fn worker_loop(
    resolve: impl FnOnce() -> Option<Arc<dyn Embedder>>,
    irx: Receiver<EmbedJob>,
    brx: Receiver<EmbedJob>,
    state: Arc<AtomicU8>,
) {
    let mut emb: Option<Arc<dyn Embedder>> = None;
    let mut resolver = Some(resolve);

    loop {
        // Drain all queued interactive jobs first — they preempt queued bulk work.
        let mut served = false;
        while let Ok(job) = irx.try_recv() {
            ensure_resolved(&mut resolver, &mut emb, &state);
            run_job(emb.as_deref(), job);
            served = true;
        }
        if served {
            continue;
        }
        // Nothing interactive pending: block until either lane has work.
        crossbeam_channel::select! {
            recv(irx) -> msg => match msg {
                Ok(job) => { ensure_resolved(&mut resolver, &mut emb, &state); run_job(emb.as_deref(), job); }
                Err(_) => break, // all handles dropped → shut down
            },
            recv(brx) -> msg => match msg {
                Ok(job) => { ensure_resolved(&mut resolver, &mut emb, &state); run_job(emb.as_deref(), job); }
                Err(_) => break,
            },
        }
    }
}

/// Resolve the model on the first job (off the startup path) and publish availability once.
fn ensure_resolved(
    resolver: &mut Option<impl FnOnce() -> Option<Arc<dyn Embedder>>>,
    emb: &mut Option<Arc<dyn Embedder>>,
    state: &Arc<AtomicU8>,
) {
    if let Some(r) = resolver.take() {
        *emb = r();
        state.store(if emb.is_some() { PRESENT } else { ABSENT }, Ordering::SeqCst);
    }
}

fn run_job(emb: Option<&dyn Embedder>, job: EmbedJob) {
    let result = match emb {
        None => Ok(None), // no model — callers degrade to FTS / skip embedding
        Some(e) => match job.kind {
            EmbedKind::Query => e.embed_query(&job.texts[0]).map(|v| Some(vec![v])),
            EmbedKind::Passage => {
                let refs: Vec<&str> = job.texts.iter().map(String::as_str).collect();
                e.embed_passages(&refs).map(Some)
            }
        },
    };
    let _ = job.reply.send(result); // receiver may have given up (e.g. cancelled) — ignore
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;
    use std::time::Duration;

    /// A fake embedder that records call order and sleeps, so the priority/backpressure
    /// behaviour is observable without a real ONNX model.
    struct SleepyEmbedder {
        order: Arc<std::sync::Mutex<Vec<String>>>,
        started: Arc<AtomicUsize>,
        sleep: Duration,
    }

    impl Embedder for SleepyEmbedder {
        fn embed_query(&self, text: &str) -> Result<Vec<f32>> {
            self.started.fetch_add(1, Ordering::SeqCst);
            std::thread::sleep(self.sleep);
            self.order.lock().unwrap().push(text.to_string());
            Ok(vec![0.0; 768])
        }
        fn embed_passages(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>> {
            self.started.fetch_add(1, Ordering::SeqCst);
            std::thread::sleep(self.sleep);
            self.order.lock().unwrap().push(texts.join(","));
            Ok(texts.iter().map(|_| vec![0.0; 768]).collect())
        }
        fn dims(&self) -> usize {
            768
        }
        fn provider(&self) -> &str {
            "sleepy"
        }
    }

    fn sleepy(sleep_ms: u64) -> (Arc<SleepyEmbedder>, Arc<std::sync::Mutex<Vec<String>>>) {
        let order = Arc::new(std::sync::Mutex::new(Vec::new()));
        let emb = Arc::new(SleepyEmbedder {
            order: Arc::clone(&order),
            started: Arc::new(AtomicUsize::new(0)),
            sleep: Duration::from_millis(sleep_ms),
        });
        (emb, order)
    }

    #[test]
    fn interactive_preempts_queued_bulk() {
        let (emb, order) = sleepy(40);
        let (_w, h) = EmbedWorker::start_with(Some(emb as Arc<dyn Embedder>));

        // Flood the bulk lane from a background thread; once the worker picks up the first bulk
        // job (and is busy in its 40 ms sleep), enqueue an interactive job. It must run before
        // the remaining bulk jobs.
        let hb = h.clone();
        let bulk = std::thread::spawn(move || {
            for i in 0..6 {
                let _ = hb.embed_passages(&[&format!("bulk{i}")], Priority::Bulk);
            }
        });
        std::thread::sleep(Duration::from_millis(10)); // let the first bulk job start
        h.embed_query("INTERACTIVE").unwrap();
        bulk.join().unwrap();

        let log = order.lock().unwrap().clone();
        let interactive_pos = log.iter().position(|s| s == "INTERACTIVE").unwrap();
        let last_bulk_pos = log.iter().rposition(|s| s.starts_with("bulk")).unwrap();
        // The interactive job jumped ahead of at least some still-queued bulk jobs.
        assert!(
            interactive_pos < last_bulk_pos,
            "interactive should preempt queued bulk: {log:?}"
        );
    }

    #[test]
    fn no_model_returns_none() {
        let (_w, h) = EmbedWorker::start_with(None);
        assert_eq!(h.embed_query("x").unwrap(), None);
        assert_eq!(h.embed_passages(&["a", "b"], Priority::Bulk).unwrap(), None);
        assert_eq!(h.available(), Some(false));
    }

    #[test]
    fn passages_roundtrip_through_worker() {
        let (emb, _order) = sleepy(0);
        let (_w, h) = EmbedWorker::start_with(Some(emb as Arc<dyn Embedder>));
        let out = h.embed_passages(&["a", "b", "c"], Priority::Bulk).unwrap().unwrap();
        assert_eq!(out.len(), 3);
        assert_eq!(out[0].len(), 768);
        assert_eq!(h.available(), Some(true));
    }
}

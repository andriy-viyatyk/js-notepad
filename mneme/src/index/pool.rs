//! Per-root concurrency wrapper (US-659): one writer + a read-only connection pool.
//!
//! [`super::IndexDb`] is a single SQLite connection. Holding it behind one `Mutex` (US-654/658)
//! serializes *reads* against the writer, so a search blocks for the whole of a bulk reindex.
//! [`RootIndex`] splits that: writes still serialize through `Mutex<IndexDb>`, but reads check
//! out a read-only `IndexDb` from a [`ReadPool`] over the same WAL DB file — so searches/reads
//! run concurrently with the writer and see the last committed snapshot (eventually consistent
//! during a reindex). `sqlite-vec`'s auto-extension applies to every connection, so KNN works on
//! pooled readers too.

use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use crossbeam_channel::{bounded, Receiver, Sender};

use crate::config::ModelConfig;
use crate::error::Result;

use super::IndexDb;

/// Read-only connections per root. Small — personal scale; reads are short.
const READ_POOL: usize = 4;

/// A bounded pool of read-only [`IndexDb`] connections over one root's index DB. `read` checks
/// one out (blocking only if all are busy) and returns it when the closure completes — even on
/// panic, via the lease guard.
pub struct ReadPool {
    tx: Sender<IndexDb>,
    rx: Receiver<IndexDb>,
}

/// Returns a borrowed connection to the pool on drop (so a panic in the read closure can't leak
/// it out of the pool).
struct Lease<'a> {
    db: Option<IndexDb>,
    tx: &'a Sender<IndexDb>,
}

impl Drop for Lease<'_> {
    fn drop(&mut self) {
        if let Some(db) = self.db.take() {
            let _ = self.tx.send(db);
        }
    }
}

impl ReadPool {
    fn open(root_name: &str, db_path: &Path, size: usize) -> Result<Self> {
        let (tx, rx) = bounded(size);
        for _ in 0..size {
            let db = IndexDb::open_readonly(root_name, db_path)?;
            tx.send(db).expect("prefill read pool");
        }
        Ok(Self { tx, rx })
    }

    /// Run `f` with a checked-out read-only connection. Blocks only while every connection is busy.
    pub fn read<R>(&self, f: impl FnOnce(&IndexDb) -> R) -> R {
        let db = self.rx.recv().expect("read pool connection");
        let lease = Lease { db: Some(db), tx: &self.tx };
        f(lease.db.as_ref().expect("leased connection"))
    }
}

/// One root's index: a serialized writer plus a read-only pool. The serving path
/// ([`crate::indexer::IndexManager`]) holds these as `Arc<RootIndex>`.
pub struct RootIndex {
    writer: Mutex<IndexDb>,
    readers: ReadPool,
    db_path: PathBuf,
    root_name: String,
}

impl RootIndex {
    /// Open (or create) the writer, then open the read-only pool over the same file.
    pub fn open_or_create(root_name: &str, root_folder: &Path, model: &ModelConfig) -> Result<Self> {
        let writer = IndexDb::open_or_create(root_name, root_folder, model)?;
        let db_path = writer.db_path().to_path_buf();
        let readers = ReadPool::open(root_name, &db_path, READ_POOL)?;
        Ok(Self {
            writer: Mutex::new(writer),
            readers,
            db_path,
            root_name: root_name.to_string(),
        })
    }

    /// Run `f` on a pooled read-only connection (search, status, doc_state, doc_has_vectors, …).
    pub fn read<R>(&self, f: impl FnOnce(&IndexDb) -> R) -> R {
        self.readers.read(f)
    }

    /// Acquire the serialized writer (upsert / delete / vector write). Recovers a poisoned lock —
    /// a prior panic must not wedge indexing.
    pub fn writer(&self) -> MutexGuard<'_, IndexDb> {
        self.writer.lock().unwrap_or_else(|p| p.into_inner())
    }

    pub fn db_path(&self) -> &Path {
        &self.db_path
    }

    pub fn root_name(&self) -> &str {
        &self.root_name
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::markdown::parse_document;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Arc;
    use std::time::{Duration, Instant, SystemTime};

    static SEQ: AtomicU32 = AtomicU32::new(0);

    fn scratch() -> PathBuf {
        let n = SEQ.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("mneme-pool-{}-{n}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn put(root: &RootIndex, rel: &str, body: &str) {
        let parsed = parse_document("t", body, None, SystemTime::now());
        root.writer().upsert_document(rel, &parsed, "h", 1, body.len() as i64).unwrap();
    }

    #[test]
    fn pooled_read_sees_committed_writes_and_has_vec0() {
        let dir = scratch();
        let root = RootIndex::open_or_create("wiki", &dir, &ModelConfig::default()).unwrap();
        put(&root, "a.md", "# A\nhello world");

        let count = root.read(|db| db.doc_count().unwrap());
        assert_eq!(count, 1);
        // vec0 auto-extension is present on the read-only connection (KNN substrate).
        let vec_rows = root.read(|db| {
            db.chunk_texts_for("a.md").unwrap(); // read path works
            // count chunks_vec via a search that touches the vtable indirectly:
            db.doc_has_vectors("a.md").unwrap()
        });
        // No model → no vectors written, but the chunks_vec virtual table must still be queryable.
        assert!(!vec_rows, "doc has chunks but no vectors yet");
    }

    #[test]
    fn read_does_not_block_on_held_writer() {
        let dir = scratch();
        let root = Arc::new(RootIndex::open_or_create("wiki", &dir, &ModelConfig::default()).unwrap());
        put(&root, "a.md", "# A\nbody");

        // Hold the writer lock for 300 ms on a background thread.
        let r2 = Arc::clone(&root);
        let holder = std::thread::spawn(move || {
            let _w = r2.writer();
            std::thread::sleep(Duration::from_millis(300));
        });
        std::thread::sleep(Duration::from_millis(30)); // ensure the writer lock is held

        let started = Instant::now();
        let count = root.read(|db| db.doc_count().unwrap());
        let elapsed = started.elapsed();

        assert_eq!(count, 1);
        assert!(
            elapsed < Duration::from_millis(200),
            "pooled read should not wait for the writer lock (took {elapsed:?})"
        );
        holder.join().unwrap();
    }
}

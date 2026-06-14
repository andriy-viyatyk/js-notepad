//! Mneme CLI entry.
//!
//! `serve` is a stub until US-655 wires the MCP HTTP server; `status` exercises config
//! loading + the Document Store walk end-to-end. All logs go to stderr; stdout is reserved
//! for the (future) server's single startup readiness line.

use std::io::Write;
use std::path::PathBuf;

use clap::{Parser, Subcommand};
use tracing_subscriber::EnvFilter;

use persephone_mneme::config;
use persephone_mneme::embed::LazyEmbedder;
use persephone_mneme::indexer::IndexManager;
use persephone_mneme::model;
use persephone_mneme::store::DocumentStore;

#[derive(Parser)]
#[command(name = "mneme", version, about = "Mneme — knowledge-base / vector-memory service")]
struct Cli {
    /// Config file path (else $MNEME_CONFIG, else the OS config dir).
    #[arg(long, global = true)]
    config: Option<PathBuf>,
    /// Verbose logging (debug level) when RUST_LOG is unset.
    #[arg(short, long, global = true)]
    verbose: bool,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Run the MCP server (Streamable HTTP, loopback) — text-search mode.
    Serve {
        /// Override the configured port.
        #[arg(long)]
        port: Option<u16>,
    },
    /// Reconcile the index with the files on disk (synchronous, foreground).
    Reindex {
        /// "{root}" or "{root}/sub" to scope; omit = all roots.
        path: Option<String>,
    },
    /// Watch every root and reconcile on change; runs until interrupted (Ctrl-C).
    Watch,
    /// Load config and report roots + indexable file counts.
    Status,
    /// Download and verify the configured embedding model into the cache (FTS works without it).
    ModelUpdate {
        /// Re-download and re-verify even if the model files are already present.
        #[arg(long)]
        force: bool,
    },
    /// Embed a string with the configured model and print the vector (debug / verification).
    Embed {
        /// Text to embed.
        text: String,
        /// Treat the text as a search query (vs an indexed passage/chunk).
        #[arg(long)]
        query: bool,
    },
    /// Run a search across all roots and print ranked hits (debug / verification).
    Search {
        /// The search query.
        query: String,
        /// `text`, `vector`, or `hybrid` (default `hybrid`; degrades to text with no model).
        #[arg(long, default_value = "hybrid")]
        mode: String,
        /// Max results (default 10).
        #[arg(long = "top-k")]
        top_k: Option<usize>,
    },
}

fn main() -> std::process::ExitCode {
    let cli = Cli::parse();

    // For the long-running server, mirror logs into a truncate-on-start file beside the config
    // (e.g. <userData>/data/mneme/mneme.log) — the spawning app captures stdout/stderr but exposes
    // them nowhere, so this is the only post-hoc record. One-shot CLI commands log to stderr only
    // (writing the file each run would clobber the server's log).
    let log_file = if matches!(cli.command, Command::Serve { .. }) {
        log_path(&cli)
    } else {
        None
    };
    init_logging(cli.verbose, log_file);

    match run(cli) {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(e) => {
            tracing::error!("{e}");
            eprintln!("error: {e}");
            std::process::ExitCode::FAILURE
        }
    }
}

/// Resolve the config file path (CLI flag, else `$MNEME_CONFIG`, else the OS default).
fn resolve_config_path(cli: &Cli) -> PathBuf {
    cli.config
        .clone()
        .or_else(|| std::env::var_os("MNEME_CONFIG").map(PathBuf::from))
        .unwrap_or_else(config::default_config_path)
}

/// The default Mneme log path: `mneme.log` beside the resolved config file.
fn log_path(cli: &Cli) -> Option<PathBuf> {
    resolve_config_path(cli)
        .parent()
        .map(|d| d.join("mneme.log"))
}

/// Initialize tracing: always to stderr (the existing `[Mneme]` capture), and — when `log_file` is
/// set — additionally to a truncating file layer so both sinks receive the same events.
fn init_logging(verbose: bool, log_file: Option<PathBuf>) {
    use tracing_subscriber::prelude::*;

    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new(if verbose { "debug" } else { "info" }));
    let stderr_layer = tracing_subscriber::fmt::layer().with_writer(std::io::stderr);
    let registry = tracing_subscriber::registry().with(filter).with(stderr_layer);

    match log_file.and_then(open_log_writer) {
        Some(writer) => registry
            .with(tracing_subscriber::fmt::layer().with_ansi(false).with_writer(writer))
            .init(),
        None => registry.init(),
    }
}

/// Create (truncating) the log file and return a thread-safe `MakeWriter`. Failures are reported to
/// stderr and logging falls back to stderr-only.
fn open_log_writer(path: PathBuf) -> Option<FileMakeWriter> {
    if let Some(dir) = path.parent() {
        if let Err(e) = std::fs::create_dir_all(dir) {
            eprintln!("mneme: cannot create log dir {}: {e}", dir.display());
            return None;
        }
    }
    match std::fs::File::create(&path) {
        Ok(f) => Some(FileMakeWriter(std::sync::Arc::new(std::sync::Mutex::new(f)))),
        Err(e) => {
            eprintln!("mneme: cannot open log file {}: {e}", path.display());
            None
        }
    }
}

/// A `MakeWriter` over a shared, mutex-guarded file: every event locks, writes its line, unlocks
/// (no interleaving between threads). The file is opened with truncation, so each `serve` start
/// overwrites the previous session's log.
#[derive(Clone)]
struct FileMakeWriter(std::sync::Arc<std::sync::Mutex<std::fs::File>>);

impl<'a> tracing_subscriber::fmt::MakeWriter<'a> for FileMakeWriter {
    type Writer = FileMakeWriter;
    fn make_writer(&'a self) -> Self::Writer {
        self.clone()
    }
}

impl Write for FileMakeWriter {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.0.lock().unwrap().write(buf)
    }
    fn flush(&mut self) -> std::io::Result<()> {
        self.0.lock().unwrap().flush()
    }
}

fn run(cli: Cli) -> persephone_mneme::error::Result<()> {
    let config_path = resolve_config_path(&cli);

    let mut cfg = config::load(&config_path)?;
    let store = DocumentStore::open(&cfg)?;

    match cli.command {
        Command::Serve { port } => {
            if let Some(p) = port {
                cfg.transport.port = p;
            }
            let bind = cfg.transport.bind.clone();
            let port = cfg.transport.port;
            tracing::info!(
                roots = store.registry().configs().len(),
                "config loaded from {}",
                config_path.display()
            );
            // serve reopens its own store/index manager; release this one first.
            drop(store);
            persephone_mneme::mcp::serve(cfg, config_path, &bind, port)?;
        }
        Command::Reindex { path } => {
            let embedder = LazyEmbedder::new(cfg.clone());
            let mgr = IndexManager::open(store.registry().configs(), &cfg.model, embedder)?;
            let targets: Vec<String> = match path.as_deref() {
                // The indexer reconciles a whole root; a "{root}/sub" scope maps to its root.
                Some(p) => vec![p.split('/').next().unwrap_or(p).to_string()],
                None => mgr.root_names(),
            };
            for root in targets {
                // Live progress to stderr (stdout is reserved); \r overwrites the line in place.
                let s = mgr.reconcile_root_cb(&root, |pr| {
                    eprint!("\r  {root}: {} {}/{}        ", pr.phase.as_str(), pr.processed, pr.total);
                })?;
                eprintln!();
                println!(
                    "  {root}: {} scanned, {} indexed, {} refreshed, {} skipped, {} vectorized, {} deleted, {} error(s)",
                    s.scanned, s.indexed, s.refreshed, s.skipped, s.vectorized, s.deleted, s.errors
                );
            }
        }
        Command::Watch => {
            let roots = store.registry().configs();
            let embedder = LazyEmbedder::new(cfg.clone());
            let _mgr = IndexManager::start(roots, &cfg.model, embedder)?;
            eprintln!(
                "mneme watch: watching {} root(s); press Ctrl-C to stop.",
                roots.len()
            );
            loop {
                std::thread::park();
            }
        }
        Command::Status => {
            println!("config: {}", config_path.display());
            let roots = store.registry().configs();
            if roots.is_empty() {
                println!("(no roots configured)");
            }
            for r in roots {
                let count = store.list(Some(&r.name)).map(|v| v.len()).unwrap_or(0);
                println!(
                    "  {}  ->  {}  [{} indexable file(s)]",
                    r.name,
                    r.folder.display(),
                    count
                );
            }
            // Model status
            let ms = model::status(&cfg.model);
            match ms {
                Ok(ms) => {
                    println!(
                        "  model: {} {} v{}  dir: {}  complete: {}",
                        ms.name, ms.precision, ms.version, ms.dir, ms.complete
                    );
                }
                Err(e) => println!("  model: (status error: {e})"),
            }
        }
        Command::ModelUpdate { force } => {
            let ms = model::provision(&cfg.model, force)?;
            println!("model: {} {} v{}", ms.name, ms.precision, ms.version);
            println!("  dir: {}", ms.dir);
            println!("  complete: {}", ms.complete);
            for f in &ms.files {
                println!(
                    "  {} — present: {}, verified: {}, bytes: {}",
                    f.filename, f.present, f.verified, f.bytes
                );
            }
        }
        Command::Embed { text, query } => {
            use persephone_mneme::embed::{Embedder, OnnxEmbedder};
            let emb = OnnxEmbedder::load(&cfg)?;
            let kind = if query { "query" } else { "passage" };
            let v = if query {
                emb.embed_query(&text)?
            } else {
                emb.embed_passages(&[text.as_str()])?.remove(0)
            };
            let norm = v.iter().map(|x| x * x).sum::<f32>().sqrt();
            let head: Vec<String> = v.iter().take(8).map(|x| format!("{x:.4}")).collect();
            println!("provider: {}", emb.provider());
            println!("kind: {kind}  dims: {}  L2-norm: {norm:.4}", v.len());
            println!("  [{}, …]", head.join(", "));
        }
        Command::Search { query, mode, top_k } => {
            use persephone_mneme::index::SearchFilter;

            let top_k = top_k.unwrap_or(10);
            let embedder = LazyEmbedder::new(cfg.clone());
            let mgr = IndexManager::open(store.registry().configs(), &cfg.model, embedder)?;
            let filter = SearchFilter::default();

            // Embed the query for vector/hybrid via the worker; with no model, fall back to text.
            let qv = if mode == "vector" || mode == "hybrid" {
                mgr.embed_handle().embed_query(&query)?
            } else {
                None
            };
            let effective = match (mode.as_str(), &qv) {
                ("vector", Some(_)) => "vector",
                ("hybrid", Some(_)) => "hybrid",
                _ => "text",
            };

            let mut hits = Vec::new();
            for name in mgr.root_names() {
                if let Some(h) = mgr.handle(&name) {
                    let lane = match (effective, &qv) {
                        ("vector", Some(v)) => h.read(|db| db.search_vector(v, &filter, top_k))?,
                        ("hybrid", Some(v)) => h.read(|db| db.search_hybrid(&query, v, &filter, top_k))?,
                        _ => h.read(|db| db.search_text(&query, &filter, top_k))?,
                    };
                    hits.extend(lane);
                }
            }
            if effective == "hybrid" {
                hits.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
            } else {
                hits.sort_by(|a, b| a.score.partial_cmp(&b.score).unwrap_or(std::cmp::Ordering::Equal));
            }
            hits.truncate(top_k);

            if mode != effective {
                println!("(no model — degraded {mode} → text)");
            }
            println!("mode: {effective}  ({} hit(s))", hits.len());
            for h in hits {
                println!("  [{:.4}] {}", h.score, h.address);
                if !h.snippet.is_empty() {
                    println!("         {}", h.snippet.replace('\n', " "));
                }
            }
        }
    }
    Ok(())
}

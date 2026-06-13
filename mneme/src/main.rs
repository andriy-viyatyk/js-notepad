//! Mneme CLI entry.
//!
//! `serve` is a stub until US-655 wires the MCP HTTP server; `status` exercises config
//! loading + the Document Store walk end-to-end. All logs go to stderr; stdout is reserved
//! for the (future) server's single startup readiness line.

use std::path::PathBuf;

use clap::{Parser, Subcommand};
use tracing_subscriber::EnvFilter;

use persephone_mneme::config;
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
    /// Run the MCP server (Streamable HTTP, loopback). [stub — implemented in US-655]
    Serve {
        /// Override the configured port.
        #[arg(long)]
        port: Option<u16>,
    },
    /// Load config and report roots + indexable file counts.
    Status,
}

fn main() -> std::process::ExitCode {
    let cli = Cli::parse();

    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new(if cli.verbose { "debug" } else { "info" }));
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_env_filter(filter)
        .init();

    match run(cli) {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(e) => {
            tracing::error!("{e}");
            eprintln!("error: {e}");
            std::process::ExitCode::FAILURE
        }
    }
}

fn run(cli: Cli) -> persephone_mneme::error::Result<()> {
    let config_path = cli
        .config
        .or_else(|| std::env::var_os("MNEME_CONFIG").map(PathBuf::from))
        .unwrap_or_else(config::default_config_path);

    let mut cfg = config::load(&config_path)?;
    let store = DocumentStore::open(&cfg)?;

    match cli.command {
        Command::Serve { port } => {
            if let Some(p) = port {
                cfg.transport.port = p;
            }
            tracing::info!(
                roots = store.registry().configs().len(),
                "config loaded from {}",
                config_path.display()
            );
            // Stub: the real Streamable HTTP server (loopback bind, stdout readiness line)
            // lands in US-655. Notice goes to stderr (stdout stays clean).
            eprintln!(
                "mneme serve: MCP HTTP server not yet implemented (US-655). \
                 Would bind {}:{}.",
                cfg.transport.bind, cfg.transport.port
            );
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
        }
    }
    Ok(())
}

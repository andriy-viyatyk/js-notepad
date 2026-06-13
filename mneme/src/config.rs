//! Service configuration.
//!
//! The full config the service will eventually use is defined here; US-652 only acts on
//! `roots` (+ their `include`/`ignore` globs). Later tasks read the fields they own:
//! `model` (US-656/657), `transport` (US-655), `gpu` (US-657).
//!
//! Sources, in increasing precedence: built-in defaults → TOML file → `MNEME_`-prefixed
//! env vars → CLI flags (applied by the caller). Config-path precedence is resolved in
//! `main.rs`: `--config` flag → `$MNEME_CONFIG` → `dirs::config_dir()/persephone-mneme/mneme.toml`.
//! The `persephone-mneme` app-data base is intentionally specific (avoids clashing with any
//! third-party `mneme`); US-656's model-cache dir should use the same base.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{MnemeError, Result};

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct Config {
    #[serde(default)]
    pub roots: Vec<RootConfig>,
    #[serde(default)]
    pub model: ModelConfig,
    #[serde(default)]
    pub transport: TransportConfig,
    #[serde(default)]
    pub gpu: GpuMode,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RootConfig {
    /// Root id used in `mneme://{name}/…` URIs (unique, normalized).
    pub name: String,
    /// Absolute OS path; must exist.
    pub folder: PathBuf,
    /// Include allowlist (default `["*.md"]`) — default-deny document selection.
    #[serde(default = "default_include")]
    pub include: Vec<String>,
    /// Extra gitignore-style ignore patterns (on top of the built-in defaults).
    #[serde(default)]
    pub ignore: Vec<String>,
}

pub fn default_include() -> Vec<String> {
    vec!["*.md".to_string()]
}

/// Embedding-model config — read by US-656/657, inert in US-652.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct ModelConfig {
    pub name: Option<String>,
    pub path: Option<PathBuf>,
    pub precision: Option<String>,
}

/// Transport config — single Streamable HTTP channel (US-655 wires the server).
/// Local default binds loopback with no auth; a token is only meaningful for a
/// non-loopback bind (networked/Azure).
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TransportConfig {
    #[serde(default = "default_bind")]
    pub bind: String,
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default)]
    pub token: Option<String>,
}

fn default_bind() -> String {
    "127.0.0.1".to_string()
}

fn default_port() -> u16 {
    7700
}

impl Default for TransportConfig {
    fn default() -> Self {
        Self {
            bind: default_bind(),
            port: default_port(),
            token: None,
        }
    }
}

#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GpuMode {
    #[default]
    Auto,
    On,
    Off,
}

/// Load config, merging an optional TOML file with `MNEME_`-prefixed env vars.
/// A missing file is not an error (defaults + env apply).
pub fn load(path: &Path) -> Result<Config> {
    use figment::providers::{Env, Format, Toml};

    let mut figment = figment::Figment::new();
    if path.exists() {
        figment = figment.merge(Toml::file(path));
    }
    figment = figment.merge(Env::prefixed("MNEME_"));
    figment
        .extract()
        .map_err(|e| MnemeError::Config(e.to_string()))
}

/// Standalone default config path: `<os-config-dir>/persephone-mneme/mneme.toml`.
pub fn default_config_path() -> PathBuf {
    dirs::config_dir()
        .map(|d| d.join("persephone-mneme").join("mneme.toml"))
        .unwrap_or_else(|| PathBuf::from("mneme.toml"))
}

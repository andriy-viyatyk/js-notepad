//! Versioned index path resolution + `modelId` derivation.
//!
//! The index lives at `<root>/.mneme/<modelId>/index-v<schemaVer>.db` (per-root, D12). The
//! path encodes its compatibility identity: a model/precision or schema-version change selects
//! a *different* path → a fresh DB → full rebuild, with old DBs kept (no migration code).

use std::path::{Path, PathBuf};

use crate::config::ModelConfig;
use crate::error::Result;
use crate::index::schema::SCHEMA_VERSION;

/// D5 defaults — the configured/target model even before it's downloaded (US-656). FTS works
/// without the model present (D11), so the path is stable from the start.
const DEFAULT_MODEL_NAME: &str = "gte-multilingual-base";
const DEFAULT_PRECISION: &str = "int8";

/// `<model>-<precision>`, e.g. `gte-multilingual-base-int8`.
pub fn model_id(model: &ModelConfig) -> String {
    let name = model.name.as_deref().unwrap_or(DEFAULT_MODEL_NAME);
    let precision = model.precision.as_deref().unwrap_or(DEFAULT_PRECISION);
    format!("{name}-{precision}")
}

/// `<root>/.mneme/<modelId>/index-v<schemaVer>.db`.
pub fn index_db_path(root_folder: &Path, model_id: &str) -> PathBuf {
    root_folder
        .join(".mneme")
        .join(model_id)
        .join(format!("index-v{SCHEMA_VERSION}.db"))
}

/// Ensure `<root>/.mneme/` exists and self-excludes from version control (`.gitignore` = `*`).
/// `.mneme` is also in the walker's `DEFAULT_IGNORES`, so the index is never indexed either.
pub fn ensure_mneme_dir(root_folder: &Path) -> Result<()> {
    let mneme = root_folder.join(".mneme");
    std::fs::create_dir_all(&mneme)?;
    let gitignore = mneme.join(".gitignore");
    if !gitignore.exists() {
        std::fs::write(&gitignore, "*\n")?;
    }
    Ok(())
}

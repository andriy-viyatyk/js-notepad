//! Error type shared across the crate.

use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum MnemeError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("walk error: {0}")]
    Walk(#[from] ignore::Error),

    #[error("glob error: {0}")]
    Glob(#[from] globset::Error),

    #[error("regex error: {0}")]
    Regex(#[from] regex::Error),

    #[error("unknown root '{0}'")]
    UnknownRoot(String),

    #[error("invalid address '{0}': {1}")]
    InvalidAddress(String, &'static str),

    #[error("path escapes its root")]
    PathEscape,

    #[error("root '{0}' already exists")]
    DuplicateRoot(String),

    #[error("invalid root name '{0}': {1}")]
    InvalidRootName(String, &'static str),

    #[error("folder does not exist: {0}")]
    FolderMissing(PathBuf),

    #[error("root folder overlaps existing root '{0}'")]
    OverlappingRoot(String),

    #[error("string not found for edit")]
    EditNotFound,

    #[error("string not unique ({0} occurrences); pass replace_all=true")]
    EditNotUnique(usize),

    #[error("config error: {0}")]
    Config(String),

    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("frontmatter yaml error: {0}")]
    Yaml(String),

    #[error("index schema error: {0}")]
    Schema(String),

    #[error("watch error: {0}")]
    Notify(#[from] notify::Error),

    #[error("{0}")]
    Internal(String),

    #[error("download error: {0}")]
    Download(String),

    #[error("checksum mismatch for {file}: expected {expected}, got {got}")]
    Checksum {
        file: String,
        expected: String,
        got: String,
    },
}

pub type Result<T> = std::result::Result<T, MnemeError>;

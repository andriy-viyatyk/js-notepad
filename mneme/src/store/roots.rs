//! Root registry — `name → RootConfig`, with add/remove/validate.
//!
//! Invariants enforced on registration: the folder must exist; the name is normalized and
//! unique; a new root may not overlap an existing one (neither a path-prefix of the other).
//! The MCP `add_root`/`remove_root` tools (US-655) call these; persistence of a
//! dynamic change back to the config file is wired there — US-652 exposes the in-memory
//! registry + validation, and [`RootRegistry::configs`] is the persistence hook.

use std::path::PathBuf;

use crate::config::{default_include, RootConfig};
use crate::error::{MnemeError, Result};

use super::address::WikiAddress;

pub struct RootRegistry {
    roots: Vec<RootConfig>,
}

impl RootRegistry {
    pub fn from_config(roots: Vec<RootConfig>) -> Result<Self> {
        let mut reg = RootRegistry { roots: Vec::new() };
        for r in roots {
            reg.insert(r)?;
        }
        Ok(reg)
    }

    pub fn get(&self, name: &str) -> Option<&RootConfig> {
        self.roots.iter().find(|r| r.name == name)
    }

    /// The current roots — the persistence hook for US-655 (serialize + write back).
    pub fn configs(&self) -> &[RootConfig] {
        &self.roots
    }

    pub fn resolve(&self, addr: &WikiAddress) -> Result<PathBuf> {
        let root = self
            .get(&addr.root)
            .ok_or_else(|| MnemeError::UnknownRoot(addr.root.clone()))?;
        addr.resolve(&root.folder)
    }

    /// Register a new root (folder = OS path, name defaults to the folder basename).
    pub fn add(&mut self, folder: PathBuf, name: Option<String>) -> Result<&RootConfig> {
        let name = name.unwrap_or_else(|| {
            folder
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default()
        });
        let r = RootConfig {
            name,
            folder,
            include: default_include(),
            ignore: Vec::new(),
        };
        self.insert(r)?;
        Ok(self.roots.last().unwrap())
    }

    pub fn remove(&mut self, name: &str) -> Result<()> {
        let before = self.roots.len();
        self.roots.retain(|r| r.name != name);
        if self.roots.len() == before {
            return Err(MnemeError::UnknownRoot(name.to_string()));
        }
        Ok(())
    }

    /// Replace a root's `include`/`ignore` filter lists in place (`root_config` SET).
    /// Returns the updated config (folder/name are unchanged). Errors if the name is unknown.
    pub fn update_filters(
        &mut self,
        name: &str,
        include: Vec<String>,
        ignore: Vec<String>,
    ) -> Result<RootConfig> {
        let r = self
            .roots
            .iter_mut()
            .find(|r| r.name == name)
            .ok_or_else(|| MnemeError::UnknownRoot(name.to_string()))?;
        r.include = include;
        r.ignore = ignore;
        Ok(r.clone())
    }

    fn insert(&mut self, mut r: RootConfig) -> Result<()> {
        r.name = normalize_name(&r.name)?;
        if self.get(&r.name).is_some() {
            return Err(MnemeError::DuplicateRoot(r.name));
        }
        if !r.folder.is_dir() {
            return Err(MnemeError::FolderMissing(r.folder));
        }
        let canon = r.folder.canonicalize()?;
        for ex in &self.roots {
            let ex_canon = ex.folder.canonicalize()?;
            if canon.starts_with(&ex_canon) || ex_canon.starts_with(&canon) {
                return Err(MnemeError::OverlappingRoot(ex.name.clone()));
            }
        }
        self.roots.push(r);
        Ok(())
    }
}

fn normalize_name(name: &str) -> Result<String> {
    let n = name.trim();
    if n.is_empty() {
        return Err(MnemeError::InvalidRootName(name.to_string(), "empty"));
    }
    if n.contains('/') || n.contains('\\') || n.chars().any(char::is_whitespace) {
        return Err(MnemeError::InvalidRootName(
            name.to_string(),
            "must not contain '/', '\\', or whitespace",
        ));
    }
    Ok(n.to_string())
}

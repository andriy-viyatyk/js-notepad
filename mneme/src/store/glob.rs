//! `glob` — compile a path/name pattern matched against `{root}/{path}` addresses.
//! `literal_separator(true)` so `*` does not cross `/` and `**` is the recursive wildcard.

use globset::{GlobBuilder, GlobMatcher};

use crate::error::Result;

pub fn compile_glob(pattern: &str) -> Result<GlobMatcher> {
    Ok(GlobBuilder::new(pattern)
        .literal_separator(true)
        .build()?
        .compile_matcher())
}

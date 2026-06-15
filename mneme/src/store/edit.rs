//! `edit` — exact string replacement (≈ Edit).

use crate::error::{MnemeError, Result};

/// Replace `old` with `new`. Errors if `old` is empty/absent, or — unless `replace_all` —
/// if `old` occurs more than once.
pub fn apply_edit(content: &str, old: &str, new: &str, replace_all: bool) -> Result<String> {
    if old.is_empty() {
        return Err(MnemeError::EditNotFound);
    }
    let count = content.matches(old).count();
    if count == 0 {
        return Err(MnemeError::EditNotFound);
    }
    if count > 1 && !replace_all {
        return Err(MnemeError::EditNotUnique(count));
    }
    Ok(if replace_all {
        content.replace(old, new)
    } else {
        content.replacen(old, new, 1)
    })
}

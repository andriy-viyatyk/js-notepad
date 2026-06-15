# US-686: Mneme — `wiki_read` sees images (like `Read`) + `wiki_upload`

**Epic:** [EPIC-032 — Mneme](../../epics/EPIC-032.md) · Phase 4
**Status:** Design for review
**Depends on:** [US-685](../US-685-mneme-filesystem-navigability/README.md) (non-markdown files are listable, `.mneme/` guarded, write path settled).

## Goal

Make Mneme's file tools behave **exactly like the agent's own `Read` / `Write` tools**, so an agent
uses them fluently:

1. **`wiki_read` returns an image as a vision block** for raster images (`png`/`jpeg`/`gif`/`webp`)
   — the agent *sees* the picture, the same way the built-in `Read` tool shows an image. Text files
   (incl. `.svg`, `.mmd`, `.html`, `.json`) stay on the text path. Other binary (`pdf`/`zip`/office)
   returns a typed "not displayable" notice instead of mojibake — mirroring how `Read` declines them.
2. **`wiki_upload`** writes base64 bytes to a path — the one capability with **no** `Read`/`Write`/`Edit`
   analog (the agent's `Write` is text-only), needed for an agent to store an image/PDF/diagram next
   to a markdown doc. `wiki_write` stays text/UTF-8 only.

**Dropped from the original design:** `wiki_download` and a `ReadResult.binary` flag. Rationale in
[Concerns §1](#concerns--decisions).

## Background

### How the agent's tools work (the bar we match)

- **`Read`**: text → UTF-8 with line numbers (`offset`/`limit`); **images → an image content block
  the model sees visually** (not base64 text); other binary → declined, never mojibake. **`Write`**:
  UTF-8 text only — the agent cannot emit raw binary. **`Edit`**: exact string replace.

### Feasibility — both verified before writing this doc

- **rmcp 1.7 supports tool-returned images.** Tool handlers in [`mcp/server.rs`](../../../mneme/src/mcp/server.rs)
  already return `CallToolResult` directly via the local `structured()` / `ok_text()` helpers
  ([`server.rs:64`, `:69`](../../../mneme/src/mcp/server.rs)) — the `#[tool]` macro does **not**
  auto-serialize. `rmcp::model::Content::image(base64, mime)` is a first-class constructor; an image
  result is `CallToolResult::success(vec![Content::image(b64, mime)])`. `base64` (v0.22) is already a
  dependency. No SDK blocker.
- **Claude Code's MCP client renders tool-returned image blocks as real vision** for
  `image/{png,jpeg,gif,webp}`, ~5 MB/image cap. The **resources/read blob** path (what the *UI* uses
  via `MnemeProvider.readBinary`) is **not** a guaranteed vision path for agents — so the tool-image
  path is the correct one for `wiki_read`, and the UI path stays untouched.

### Current code sites

- **`wiki_read`** → [`server.rs:76`](../../../mneme/src/mcp/server.rs) calls
  `structured(self.state.read_doc(p)…)`; `read_doc` ([`mcp/mod.rs:160`](../../../mneme/src/mcp/mod.rs))
  does `store.read` (lossy UTF-8) → **mojibake on a `.png`**, no binary awareness. Returns `ReadResult`
  ([`results.rs:15`](../../../mneme/src/mcp/results.rs): `content: String`, `frontmatter`).
- **Binary read already works for the UI**, not for agents: `read_resource_body` serves any file as a
  base64 blob over `resources/read` ([`server.rs:278`](../../../mneme/src/mcp/server.rs),
  `ResourceBody::Blob`). The Image viewer uses it (US-687). **Untouched by this task.**
- **`wiki_write`** → `write_doc` ([`mcp/mod.rs:189`](../../../mneme/src/mcp/mod.rs)) takes
  `content: String`; `store.write` exists, `store.read_bytes` exists — a `write_bytes` is the only
  missing store primitive.
- The **`.mneme/` address guard** (US-685, `WikiAddress::parse`) already protects upload from touching
  the index dir.

## Implementation plan

All paths under `mneme/`. **Rust task** — `/review` & `/userdoc` do not apply; verify with
`cargo build --release` + `cargo test`.

### 1. `store::write_bytes`

In [`store/mod.rs`](../../../mneme/src/store/mod.rs), next to `write`:

```rust
/// Write raw bytes (binary upload — `wiki_upload`). Creates parent dirs; `.mneme/` is already
/// rejected by `WikiAddress::parse`.
pub fn write_bytes(&self, addr: &str, bytes: &[u8]) -> Result<()> {
    let p = self.resolve(addr)?;
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&p, bytes)?;
    Ok(())
}
```

### 2. Detection helpers (in `mcp/mod.rs`)

```rust
/// Vision-supported image MIME for a path's extension, or None. `image/*` only — these are the
/// types Claude Code renders as a vision block from a tool result.
fn image_mime(rel: &str) -> Option<&'static str> {
    match rel.rsplit('.').next().map(str::to_ascii_lowercase).as_deref() {
        Some("png") => Some("image/png"),
        Some("jpg" | "jpeg") => Some("image/jpeg"),
        Some("gif") => Some("image/gif"),
        Some("webp") => Some("image/webp"),
        _ => None,
    }
}

/// True when bytes are not valid UTF-8 or contain a NUL — treat as binary. SVG/mermaid/HTML/JSON
/// are valid UTF-8 and therefore stay on the text path.
fn looks_binary(bytes: &[u8]) -> bool {
    bytes.contains(&0) || std::str::from_utf8(bytes).is_err()
}

/// Max image bytes inlined as a vision block (Claude vision ~5 MB/image). Larger → notice.
const MAX_INLINE_IMAGE_BYTES: usize = 5 * 1024 * 1024;
```

### 3. `read_doc` returns a typed outcome (in `mcp/mod.rs`)

Replace `ReadResult` as the *return type* of `read_doc` with an outcome enum (keep `ReadResult` for
the text variant). Add to `mcp/mod.rs`:

```rust
/// What `read_doc` produced — the server.rs handler maps each arm to MCP content.
pub enum ReadOutcome {
    /// UTF-8 text file: content + frontmatter (today's behavior).
    Text(ReadResult),
    /// Vision-supported image: base64 bytes + MIME + a short human note.
    Image { base64: String, mime: &'static str, note: String },
    /// Non-displayable binary (PDF/zip/office) or oversized image: a typed notice, no bytes.
    Binary { note: String },
}
```

Rewrite `read_doc` ([`mcp/mod.rs:160`](../../../mneme/src/mcp/mod.rs)) to read bytes first and branch:

```rust
pub async fn read_doc(self: &Arc<Self>, p: ReadParams) -> Result<ReadOutcome> {
    let st = Arc::clone(self);
    blocking(move || {
        let store = st.store.read().unwrap();
        let wa = WikiAddress::parse(&p.path)?;
        let abs = store.registry().resolve(&wa)?;
        let bytes = std::fs::read(&abs)?;

        // Text path (incl. .svg/.mmd/.html/.json) — unchanged behavior.
        if !looks_binary(&bytes) {
            let content = store.read(&p.path, p.offset, p.limit)?;
            let full = store.read(&p.path, None, None)?;
            let stem = file_stem(&wa.rest);
            let md = std::fs::metadata(&abs).ok();
            let birthtime = md.as_ref().and_then(|m| m.created().ok());
            let mtime = md.as_ref().and_then(|m| m.modified().ok()).unwrap_or_else(SystemTime::now);
            let parsed = parse_document(&stem, &full, birthtime, mtime);
            return Ok(ReadOutcome::Text(ReadResult {
                content,
                frontmatter: Frontmatter {
                    title: parsed.meta.title,
                    tags: parsed.meta.tags,
                    created: parsed.meta.created,
                    verified: parsed.meta.verified,
                },
            }));
        }

        // Binary: vision image (within cap) → image block; else a typed notice.
        let kb = (bytes.len() + 1023) / 1024;
        match image_mime(&wa.rest) {
            Some(mime) if bytes.len() <= MAX_INLINE_IMAGE_BYTES => Ok(ReadOutcome::Image {
                base64: base64::engine::general_purpose::STANDARD.encode(&bytes),
                mime,
                note: format!("{} ({}, {} KB)", wa.rest, mime, kb),
            }),
            Some(mime) => Ok(ReadOutcome::Binary {
                note: format!("<image too large to inline: {} {} KB ({}); read via the UI>", wa.rest, kb, mime),
            }),
            None => Ok(ReadOutcome::Binary {
                note: format!("<binary file: {} {} KB — not displayable as text>", wa.rest, kb),
            }),
        }
    })
    .await
}
```

(`offset`/`limit` apply to decoded text exactly as today; binary short-circuits before that.)

### 4. `wiki_read` handler maps the outcome to MCP content (in `server.rs`)

Replace the body at [`server.rs:76`](../../../mneme/src/mcp/server.rs):

```rust
async fn wiki_read(&self, Parameters(p): Parameters<ReadParams>) -> std::result::Result<CallToolResult, McpError> {
    match self.state.read_doc(p).await.map_err(to_mcp)? {
        ReadOutcome::Text(r) => structured(r),
        ReadOutcome::Image { base64, mime, note } =>
            Ok(CallToolResult::success(vec![Content::image(base64, mime.to_string()), Content::text(note)])),
        ReadOutcome::Binary { note } => Ok(CallToolResult::success(vec![Content::text(note)])),
    }
}
```

Import `ReadOutcome` from `crate::mcp` (alongside the existing `ServerState` use). Update the
`#[tool(description …)]` for `wiki_read`: "…Images (png/jpg/gif/webp) are returned as a viewable
image; other binary returns a short notice."

### 5. `wiki_upload` tool

**Params** ([`params.rs`](../../../mneme/src/mcp/params.rs)):

```rust
#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct UploadParams {
    /// `{root}/{path}` address to write.
    pub path: String,
    /// File bytes, base64 (STANDARD).
    #[serde(rename = "contentBase64")]
    pub content_base64: String,
}
```

**Handler** ([`mcp/mod.rs`](../../../mneme/src/mcp/mod.rs), under file-like tools):

```rust
pub async fn upload(self: &Arc<Self>, p: UploadParams) -> Result<()> {
    let st = Arc::clone(self);
    blocking(move || {
        let wa = WikiAddress::parse(&p.path)?; // rejects .mneme/
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(p.content_base64.as_bytes())
            .map_err(|e| MnemeError::Internal(format!("invalid base64: {e}")))?;
        st.store.read().unwrap().write_bytes(&wa.to_string(), &bytes)?;
        Ok(()) // binary is never in the index set — no index_file call
    })
    .await
}
```

**Tool** ([`server.rs`](../../../mneme/src/mcp/server.rs)), wired into `#[tool_router] impl MnemeServer`
like `wiki_write`:

```rust
#[tool(description = r##"Create/overwrite a BINARY file (image/PDF/diagram) from base64 bytes. For text/markdown use wiki_write. Stored and listable (wiki_glob) but not indexed/searched. Example: wiki_upload {"path":"work/diagrams/arch.png","contentBase64":"iVBORw0K…"} → "ok""##)]
async fn wiki_upload(&self, Parameters(p): Parameters<UploadParams>) -> std::result::Result<CallToolResult, McpError> {
    self.state.upload(p).await.map_err(to_mcp)?;
    Ok(ok_text())
}
```

### 6. Guide + instructions

- [`mneme/assets/wiki-guide.md`](../../../mneme/assets/wiki-guide.md): under "File-like", document that
  `wiki_read` returns images as viewable pictures (non-image binary → a notice) and add
  `wiki_upload { path, contentBase64 }` (binary writes; listable but not indexed). Note `wiki_write`
  stays text-only.
- `INSTRUCTIONS` ([`server.rs:29`](../../../mneme/src/mcp/server.rs)) + the MCP server-instruction string:
  add `wiki_upload` to the file-like tool list.
- `mneme/README.md`: add `wiki_upload` to the "Tools:" line; note `wiki_read` is image-aware.

### 7. Tests (`mneme/tests/mcp.rs`)

- `wiki_upload` a small valid PNG (base64) → `wiki_glob` lists it (US-685) → `wiki_read` on it returns
  a result whose content has an **image** item with `mimeType == "image/png"` (assert via the
  `CallToolResult` content, not `structured_content`).
- `wiki_read` on a `.md` → `ReadOutcome::Text` path: structured content, frontmatter intact.
- `wiki_read` on an `.svg` (valid UTF-8) → **text** path, not image.
- `wiki_read` on a small non-image binary (e.g. a fake `.bin` with NUL bytes) → a text notice
  containing "not displayable", no image item.
- `wiki_upload` then `reconcile_root` → **no index row** for the binary; `wiki_search` returns 0.

## Concerns / decisions

1. **Why drop `wiki_download`?** Returning base64 *as text* to an agent is useless — the model can't
   "see" an image from a base64 string, and `Read` never does this. Images now ride a vision block via
   `wiki_read`; non-image binary can't be "seen" regardless, so a notice is the honest answer. The
   **UI's** base64 need is already met by `resources/read` (untouched). If a future programmatic
   (non-agent) consumer genuinely needs base64-over-tools, add it then with that justification — it is
   not part of "mirror `Read`."
2. **Why `wiki_upload` survives the mirror.** It has no `Read`/`Write`/`Edit` analog (the agent's
   `Write` is text-only). It's a deliberate extension for the user's "agent stores a diagram/image next
   to a doc" scenario; the realistic byte source is bytes the agent fetched or generated. Kept, clearly
   labeled binary-only.
3. **Detection is content-based, not extension-based** (`looks_binary`): a misnamed `.png` that is
   actually text still reads as text; an image with the right extension + valid image bytes inlines.
   `image_mime` is extension-based only to pick the MIME label (Claude's MIME detection is
   extension-based too; we control the field).
4. **5 MB inline cap.** Over the cap → a notice (read via UI). No global attachment size cap is added;
   large media/video stays out of scope (epic decision, 2026-06-13).
5. **Binary files are never indexed** — `wiki_upload` skips `index_file`; consistent with US-685's
   markdown-only index set.
6. **`read_doc` return-type change is internal.** Its only caller is the `wiki_read` handler; no other
   code consumes `ReadResult` from `read_doc`. The UI reads text via `resources/read`, not this tool.

## Acceptance criteria

- [x] `wiki_read` on a png/jpg/gif/webp returns an **image** content block (`mimeType` set) + a short
  text note. *(test: `read_image_returns_image_outcome` — `ReadOutcome::Image`, `mime == image/png`)*
- [x] `wiki_read` on a `.md`/`.svg`/`.json` returns text + frontmatter (text path, unchanged).
  *(tests: `write_read_search_roundtrip`, `read_svg_is_text_not_image`)*
- [x] `wiki_read` on a non-image binary returns a "not displayable" notice — no mojibake, no bytes.
  *(test: `read_nonimage_binary_returns_notice`)*
- [x] `wiki_upload` writes a binary file from base64; it then appears in `wiki_glob` and round-trips
  identical bytes. *(test: `upload_lists_and_roundtrips_binary`)*
- [x] Uploaded binary files create no index row and don't affect `wiki_search`.
  *(test: `upload_binary_is_not_indexed`)*
- [x] **Live check:** uploaded a generated PNG to `TestWiki/test/mneme-686.png` via `wiki_upload`
  and `wiki_read` it from this agent session — the image rendered as a real vision block (the agent
  *saw* "MNEME 686" / "vision OK" on a blue field, not base64). Verified 2026-06-15.
- [x] `cargo build --release` and `cargo test` pass. *(full suite green; release build clean)*

## Files changed (summary)

| File | Change |
|------|--------|
| `mneme/src/store/mod.rs` | `write_bytes` |
| `mneme/src/mcp/mod.rs` | `image_mime` / `looks_binary` / `MAX_INLINE_IMAGE_BYTES`; `ReadOutcome` enum; image-aware `read_doc`; `upload` handler |
| `mneme/src/mcp/params.rs` | `UploadParams` |
| `mneme/src/mcp/server.rs` | `wiki_read` maps `ReadOutcome` → content; `wiki_upload` tool; `wiki_read` desc; `INSTRUCTIONS` |
| `mneme/assets/wiki-guide.md`, `mneme/README.md` | Document image-aware `wiki_read` + `wiki_upload` |
| `mneme/tests/mcp.rs` | image-read, text-vs-image, binary-notice, upload round-trip, not-indexed tests |

### Files that need NO changes

- `read_resource_body` / `is_text_addr` / `ResourceBody` — the UI binary path (`resources/read`) is
  already correct; untouched.
- `mneme/src/mcp/results.rs` — `ReadResult` is reused unchanged inside `ReadOutcome::Text` (no `binary`
  field is added).
- The indexer — binary uploads are not indexable.

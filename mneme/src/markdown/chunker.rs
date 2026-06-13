//! Markdown chunker — split a document body into chunks by heading, with a size cap (D8).
//!
//! Uses `pulldown-cmark` events (not a line `^#` split) so a `#` inside a fenced code block
//! is not mistaken for a heading and setext headings are handled. A section longer than the
//! cap is split into windows preserving the heading + a continuing ordinal. Content before
//! the first heading becomes a chunk with `heading: None`.

use pulldown_cmark::{Event, HeadingLevel, Parser, Tag, TagEnd};

/// Section size cap in characters (~500 tokens). Tunable when the real tokenizer lands
/// (US-657) — a token-based cap can replace this behind the same `chunk_markdown` surface.
pub const MAX_CHUNK_CHARS: usize = 2000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Chunk {
    pub ordinal: usize,
    pub heading: Option<String>,
    pub text: String,
}

/// The first level-1 heading text in the document, for the `title` fallback.
pub fn first_h1(body: &str) -> Option<String> {
    let mut in_h1 = false;
    let mut text = String::new();
    for ev in Parser::new(body) {
        match ev {
            Event::Start(Tag::Heading { level: HeadingLevel::H1, .. }) => {
                in_h1 = true;
                text.clear();
            }
            Event::Text(t) | Event::Code(t) if in_h1 => text.push_str(&t),
            Event::End(TagEnd::Heading(HeadingLevel::H1)) if in_h1 => {
                let t = text.trim().to_string();
                return if t.is_empty() { None } else { Some(t) };
            }
            _ => {}
        }
    }
    None
}

/// Split a markdown body into heading-delimited, size-capped chunks.
pub fn chunk_markdown(body: &str) -> Vec<Chunk> {
    // Collect (heading, section-text) spans in document order.
    let mut sections: Vec<(Option<String>, String)> = Vec::new();
    let mut current: (Option<String>, String) = (None, String::new());

    let mut in_heading = false;
    let mut heading_text = String::new();

    for ev in Parser::new(body) {
        match ev {
            Event::Start(Tag::Heading { .. }) => {
                // Close the current section and open a new one once the heading text is known.
                in_heading = true;
                heading_text.clear();
            }
            Event::End(TagEnd::Heading(_)) => {
                in_heading = false;
                // Push the section accumulated so far, then start a fresh one under this heading.
                if !current.1.trim().is_empty() || current.0.is_some() {
                    sections.push(std::mem::take(&mut current));
                }
                let h = heading_text.trim().to_string();
                current = (Some(h).filter(|s| !s.is_empty()), String::new());
            }
            Event::Text(t) | Event::Code(t) => {
                if in_heading {
                    heading_text.push_str(&t);
                } else {
                    current.1.push_str(&t);
                }
            }
            Event::SoftBreak | Event::HardBreak => {
                if !in_heading {
                    current.1.push('\n');
                }
            }
            Event::End(TagEnd::Paragraph)
            | Event::End(TagEnd::CodeBlock)
            | Event::End(TagEnd::Item)
            | Event::End(TagEnd::BlockQuote(_)) => {
                if !in_heading {
                    current.1.push('\n');
                }
            }
            _ => {}
        }
    }
    if !current.1.trim().is_empty() || current.0.is_some() {
        sections.push(current);
    }

    // Flatten sections to size-capped chunks with global ordinals.
    let mut chunks = Vec::new();
    let mut ordinal = 0;
    for (heading, text) in sections {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            // Keep a heading-only section as an (empty-body) chunk so the heading is searchable
            // via its own text in `chunks_fts` only if it carries the heading; skip pure noise.
            if let Some(h) = &heading {
                chunks.push(Chunk { ordinal, heading: Some(h.clone()), text: h.clone() });
                ordinal += 1;
            }
            continue;
        }
        for window in split_capped(trimmed, MAX_CHUNK_CHARS) {
            chunks.push(Chunk { ordinal, heading: heading.clone(), text: window });
            ordinal += 1;
        }
    }
    chunks
}

/// Plain-text chunker (fixed ≤cap windows, no headings) — for future non-`.md` indexing.
/// Non-md indexing itself is deferred (US-651); included here so the surface exists.
pub fn chunk_plain(body: &str) -> Vec<Chunk> {
    split_capped(body.trim(), MAX_CHUNK_CHARS)
        .into_iter()
        .enumerate()
        .map(|(ordinal, text)| Chunk { ordinal, heading: None, text })
        .collect()
}

/// Split `text` into windows of at most `cap` characters, preferring line boundaries; a single
/// over-cap line is hard-split by character count.
fn split_capped(text: &str, cap: usize) -> Vec<String> {
    if text.chars().count() <= cap {
        return vec![text.to_string()];
    }
    let mut out = Vec::new();
    let mut buf = String::new();
    for line in text.split_inclusive('\n') {
        if line.chars().count() > cap {
            // Flush, then hard-split the long line.
            if !buf.trim().is_empty() {
                out.push(buf.trim().to_string());
            }
            buf = String::new();
            let mut chars = line.chars().peekable();
            while chars.peek().is_some() {
                let piece: String = chars.by_ref().take(cap).collect();
                out.push(piece.trim().to_string());
            }
            continue;
        }
        if buf.chars().count() + line.chars().count() > cap {
            if !buf.trim().is_empty() {
                out.push(buf.trim().to_string());
            }
            buf = String::new();
        }
        buf.push_str(line);
    }
    if !buf.trim().is_empty() {
        out.push(buf.trim().to_string());
    }
    out.retain(|s| !s.is_empty());
    out
}

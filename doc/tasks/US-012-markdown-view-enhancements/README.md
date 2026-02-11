# US-012: Markdown View Enhancements

## Status

**Status:** Planned
**Priority:** Low
**Started:** -
**Completed:** -

## Summary

Enhance the Markdown view with two post-render improvements: syntax-highlighted code blocks using Monaco's `colorize()` API, and inline Mermaid diagram rendering for ` ```mermaid ` code blocks.

## Why

- Code blocks in Markdown currently render as plain styled `<pre><code>` elements with no syntax highlighting
- Mermaid diagrams are a popular documentation tool (used by GitHub, GitLab, Notion) but render as plain text in our Markdown view
- Both features improve the Markdown preview to be closer to what developers expect from modern renderers
- Monaco is already loaded in the app — `colorize()` adds highlighting with zero extra dependencies
- Mermaid integration builds on US-011 (Mermaid Diagram Viewer) which adds `mermaid.js` to the project

## Dependencies

- **US-011** (Mermaid Diagram Viewer) — must be completed first to have `mermaid.js` available in the project. The code block colorization feature can be implemented independently.

## Acceptance Criteria

### Code Block Syntax Highlighting
- [ ] Code blocks with language tags (e.g., ` ```typescript `) render with Monaco syntax highlighting
- [ ] Code blocks without a language tag render as plain text (no colorization)
- [ ] Highlighting uses the same dark theme as Monaco editor
- [ ] No noticeable delay — colorization happens quickly after render
- [ ] No full Monaco editor instances created (uses `colorize()` API only)

### Mermaid Diagram Rendering
- [ ] ` ```mermaid ` code blocks render as SVG diagrams inline
- [ ] Invalid Mermaid syntax shows an error message instead of the diagram
- [ ] Diagrams use dark theme to match the app
- [ ] Other code blocks are unaffected

### General
- [ ] Both features work in standalone Markdown view and in notebook note items
- [ ] No regressions in existing Markdown rendering
- [ ] Performance acceptable with many code blocks (10+)

## Technical Approach

Both features share the same pattern: **post-render processing** of `<pre><code>` elements in the rendered Markdown HTML.

### Feature 1: Code Block Syntax Highlighting via `monaco.editor.colorize()`

**API:**
```typescript
const html = await monaco.editor.colorize(code, language, { tabSize: 4 });
// Returns HTML string with <span> elements styled for syntax highlighting
```

- Lightweight — no editor instance created, no DOM mounting
- Uses Monaco's existing tokenizer and theme
- Already available since Monaco is loaded for the text editor

**Implementation approach:**

After Markdown renders to HTML:
1. Query all `<pre><code class="language-*">` elements
2. Extract the language from the class name (e.g., `language-typescript` → `typescript`)
3. Call `monaco.editor.colorize(textContent, language)` for each
4. Replace the `<code>` element's innerHTML with the colorized HTML
5. Skip blocks without a recognized language class

**Performance:**
- `colorize()` is fast (~1-5ms per block) and async
- Process blocks in parallel with `Promise.all()`
- For large documents, could limit to visible blocks or first N blocks

### Feature 2: Mermaid Diagram Rendering

**Requires:** `mermaid.js` from US-011

After Markdown renders to HTML:
1. Query all `<pre><code class="language-mermaid">` elements
2. Extract the diagram text from `textContent`
3. Call `mermaid.render(uniqueId, diagramText)` for each
4. Replace the `<pre>` element with the resulting SVG
5. On error, show error message in place of the diagram

**Implementation approach:**
```typescript
const mermaid = await import("mermaid");
mermaid.default.initialize({ startOnLoad: false, theme: "dark" });

for (const block of mermaidBlocks) {
    try {
        const { svg } = await mermaid.default.render(`mmd-${id}`, block.textContent);
        block.closest("pre").outerHTML = `<div class="mermaid-diagram">${svg}</div>`;
    } catch (e) {
        block.closest("pre").outerHTML = `<div class="mermaid-error">${e.message}</div>`;
    }
}
```

### Shared Post-Render Pipeline

Both features plug into the same processing step. The flow:

```
Markdown source → markdown renderer → raw HTML → post-render processing → final DOM
                                                   ├─ colorize code blocks
                                                   └─ render mermaid diagrams
```

This could be a single `processCodeBlocks(container)` function that:
1. Finds all `<pre><code>` elements
2. For `language-mermaid` blocks → render diagram
3. For other `language-*` blocks → colorize with Monaco
4. Skip blocks with no language class

## Files to Modify

- `src/renderer/editors/markdown/MarkdownView.tsx` (or its model) — add post-render processing step
- Possibly extract a utility: `src/renderer/editors/markdown/processCodeBlocks.ts`

## Implementation Steps

### Step 1: Code block colorization (no dependency on US-011)

1. Find the Markdown render output hook (where HTML is set to DOM)
2. After render, query `<pre><code class="language-*">` elements
3. Map language class names to Monaco language IDs
4. Call `monaco.editor.colorize()` for each block
5. Replace innerHTML with colorized output
6. Style: ensure colorized output inherits proper background/padding from existing `<pre>` styles

### Step 2: Mermaid diagram rendering (after US-011)

1. In the same post-render step, detect `language-mermaid` blocks
2. Dynamically import mermaid.js
3. Render each block to SVG
4. Replace `<pre>` with SVG container
5. Add CSS for `.mermaid-diagram` (centered, max-width, optional border)
6. Add CSS for `.mermaid-error` (error styling)

### Step 3: Testing and edge cases

- Empty code blocks
- Unknown language identifiers (graceful fallback to plain text)
- Very long code blocks
- Multiple mermaid diagrams in one document
- Mermaid blocks with syntax errors
- Re-render on content change (avoid stale highlighted blocks)

## Notes

- `monaco.editor.colorize()` requires Monaco to be loaded. In MarkdownView this is always true since Monaco is the primary editor.
- Mermaid's `render()` creates temporary DOM elements — ensure cleanup happens properly.
- Each `mermaid.render()` call needs a unique element ID — use incrementing counter or UUID.
- The post-render step should be debounced if content changes rapidly (live preview while typing).
- Consider caching colorized output if the same code block content hasn't changed.

## Related

- Depends on: US-011 (Mermaid Diagram Viewer) — for mermaid.js package
- Modifies: Markdown view (`src/renderer/editors/markdown/`)
- Uses: Monaco `colorize()` API (already available)

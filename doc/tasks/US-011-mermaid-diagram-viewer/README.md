# US-011: Mermaid Diagram Viewer

## Status

**Status:** Planned
**Priority:** Low
**Started:** -
**Completed:** -

## Summary

Add a Mermaid diagram viewer as a content-view editor for `.mmd` files. Users can edit Mermaid syntax in Monaco and switch to a rendered diagram preview, following the same pattern as Markdown and SVG views.

## Why

- Mermaid is a popular diagramming language used widely in documentation (GitHub, GitLab, Notion, etc.)
- Developers frequently create flowcharts, sequence diagrams, ER diagrams, and other visuals with Mermaid
- Currently `.mmd` files open as plain text with no preview capability
- Follows established content-view pattern (like Markdown, SVG) — low architectural risk

## Acceptance Criteria

- [ ] `.mmd` files open in Monaco editor with syntax highlighting
- [ ] Editor switch offers "Mermaid" view option for `.mmd` files
- [ ] Mermaid view renders the diagram from page content (shows unsaved changes)
- [ ] Supports common diagram types: flowchart, sequence, class, state, ER, Gantt, pie, git graph
- [ ] Diagram re-renders when content changes
- [ ] Error display when Mermaid syntax is invalid
- [ ] Zoom/pan support for rendered diagram (reuse BaseImageView or similar)
- [ ] Dynamic import keeps mermaid.js out of the main bundle
- [ ] No regressions in existing functionality

## Technical Approach

### Library

**mermaid.js** (`mermaid` on npm)
- The standard Mermaid rendering engine (same one used by GitHub, VS Code extensions)
- API: `mermaid.render(id, diagramText)` returns SVG string
- ~1.5MB bundled — must use dynamic `import()` for code splitting
- Runs entirely in the browser, no server needed

### Architecture

Follow the **SvgView / MarkdownView content-view pattern**:

1. Monaco editor is the primary editor (text editing)
2. MermaidView is a content-view alternative (read-only rendered preview)
3. User switches between them via editor switch buttons in toolbar

### Display Options

**Option A: Reuse BaseImageView (recommended)**
- Render Mermaid → SVG string → data URL → `<img src="data:image/svg+xml,...">`
- Pass to `BaseImageView` for zoom/pan (same as SvgView)
- Gets zoom, pan, keyboard shortcuts, reset for free
- Limitation: SVG is static image (no interactive tooltips)

**Option B: Inline SVG with custom scroll**
- Render Mermaid → SVG string → inject as `innerHTML`
- Custom zoom/pan implementation
- Allows interactive SVG features (click, hover tooltips)
- More work to implement

Option A is recommended for initial implementation — minimal code, proven pattern.

## Files to Create/Modify

### New files:
- `src/renderer/editors/mermaid/MermaidView.tsx` — content-view component
- `src/renderer/editors/mermaid/index.ts` — exports

### Files to modify:
- `src/renderer/editors/register-editors.ts` — register `.mmd` file association and Mermaid content-view
- `src/renderer/editors/registry.ts` — add mermaid editor definition (if needed)
- `src/renderer/setup/configure-monaco.ts` — register `.mmd` language association (if not already handled)

## Implementation Steps

### Step 1: Install mermaid package
```bash
npm install mermaid
```

### Step 2: Create MermaidView component

```typescript
// src/renderer/editors/mermaid/MermaidView.tsx
import { BaseImageView } from "../image";
import { TextFileModel } from "../text/TextPageModel";

interface MermaidViewProps {
    model: TextFileModel;
}

function MermaidView({ model }: MermaidViewProps) {
    const content = model.state.use((s) => s.content);
    const [svgUrl, setSvgUrl] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        renderDiagram(content).then(setSvgUrl).catch(e => setError(e.message));
    }, [content]);

    if (error) return <div className="error">{error}</div>;
    return <BaseImageView src={svgUrl} alt="Mermaid Diagram" />;
}

async function renderDiagram(content: string): Promise<string> {
    const mermaid = await import("mermaid");
    mermaid.default.initialize({ startOnLoad: false, theme: "dark" });
    const { svg } = await mermaid.default.render("mermaid-diagram", content);
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
```

### Step 3: Register editor

Register `.mmd` files to open in Monaco by default, with MermaidView as content-view option:
- `acceptFile()` matches `.mmd` extension
- `switchOption()` returns "Mermaid" for mermaid language
- Category: `"content-view"`

### Step 4: Monaco language association

Ensure `.mmd` files get syntax highlighting. Options:
- Map to an existing language (e.g., `markdown` or `plaintext`)
- Or register a basic `mermaid` language with keyword highlighting

### Step 5: Dark theme support

Mermaid supports themes. Use `"dark"` theme to match js-notepad's dark UI:
```typescript
mermaid.initialize({ theme: "dark" });
```

### Step 6: Error handling

When Mermaid syntax is invalid:
- Show error message in the view area (similar to NotebookEditor error state)
- Keep previous valid render visible while editing (debounce re-render)

## Notes

- Mermaid render is async and can be slow for complex diagrams — consider debouncing (300-500ms)
- The `render()` call creates a temporary SVG element in the DOM; ensure cleanup
- Mermaid unique ID requirement: each `render()` call needs a unique element ID
- For notebook editor integration: `.mmd` could also be a supported language for note content, giving inline diagram previews (future enhancement)

## Related

- Similar pattern: SvgView (`src/renderer/editors/svg/SvgView.tsx`)
- Similar pattern: MarkdownView (`src/renderer/editors/markdown/`)
- Reuses: BaseImageView (`src/renderer/editors/image/BaseImageView.tsx`)
- Editor registration: [Editor Guide](../../standards/editor-guide.md)

# US-786: Markdown view — "Copy" and "Open in new tab" buttons for rendered images

**Status:** Implemented (all plan steps done; `tsc --noEmit` + `eslint` clean — awaiting user testing)

## Goal

Give images rendered in the Markdown view the same hover-toolbar treatment that
Mermaid diagrams already have: a small toolbar in the top-right corner of each
image with a **Copy** button (copy the image to the clipboard as PNG) and an
**Open in new tab** button (open the image in its own Persephone page via the
image viewer).

## Background

### How rendering works today

`src/renderer/editors/markdown/MarkdownBlock.tsx` maps each markdown element to a
React renderer via `getComponents()`:

- **Mermaid** (` ```mermaid ` fences) → `MermaidBlock` (`CodeBlock.tsx:94`). It
  renders the diagram SVG as an `<img>` inside a `.mermaid-diagram` wrapper with
  a `.diagram-toolbar` containing two `.toolbar-btn` buttons: **Open in Editor**
  (`OpenLinkIcon` → `pagesModel.addEditorPage("mermaid-view", …)`) and **Copy**
  (`CopyIcon` → `copyImageToClipboard`). Toolbar is hover-revealed via CSS.
- **Code blocks** → `CodePreBlock` (a single Copy button).
- **Images** (`img` renderer, `MarkdownBlock.tsx:424-431`) → a **bare `<img>`**
  with its `src` routed through `resolveRelatedLink(filePath, src, wikiRoot)`.
  No wrapper, no toolbar. This is the gap.

The mermaid `<img>` is created directly in `MermaidBlock` JSX, so it does **not**
pass through the `img` component override — adding a toolbar to the `img`
renderer will not double-decorate mermaid diagrams.

### Reusable pieces that already exist

- **`copyImageToClipboard(img: HTMLImageElement)`** — `CodeBlock.tsx:77`. Draws
  the image onto a canvas and writes a PNG `ClipboardItem`. Currently **not
  exported** (module-local). Works on any loaded, non-tainted image.
- **Toolbar CSS** — the `.diagram-toolbar` / `.toolbar-btn` rules in
  `MarkdownBlockRoot` (`MarkdownBlock.tsx:116-152`) are scoped under
  `.mermaid-diagram`. A parallel `.md-image` wrapper needs its own copy of these
  rules (or the selectors can be generalized to apply to both).
- **`OpenLinkIcon`, `CopyIcon`** — `../../theme/icons`.

### "Open in new tab" mechanism

The image viewer is the `image-view` editor (`content/resolvers.ts:163-168` maps
`.png/.jpg/.jpeg/.gif/.webp/.bmp/.ico` → `image-view`; `:204` maps
`image/*` content-type → `image-view`). The clean, pipeline-consistent way to
open the image in a new page is:

```ts
await app.events.openRawLink.sendAsync(createLinkData(resolvedSrc));
```

(no `pageId` → opens a new tab; the existing US-784 markdown-link interceptor is
unaffected because it only fires on `<a>` clicks, not on these buttons). `app`
and `createLinkData` are already imported in `MarkdownBody.tsx`; the new image
component will import them itself.

The `resolvedSrc` is whatever `resolveRelatedLink` produced for the `<img src>`:
- **`file://…`** (resolved local image) → resolves to `image-view`. ✓
- **`http(s)://…`** (remote image) → resolver inspects content-type → `image-view`. ✓
- **`data:` / `blob:`** (embedded) → see Concerns.

## Implementation plan

1. **Export `copyImageToClipboard`** from `CodeBlock.tsx` (add `export` to the
   existing function) so the new image component can reuse it. (Alternative:
   move it to a tiny shared helper, but exporting in place is the smallest
   change and keeps the mermaid usage working unchanged.)

2. **New component `MarkdownImage`** — recommended in a new file
   `src/renderer/editors/markdown/MarkdownImage.tsx` (keeps `CodeBlock.tsx`
   focused on code/mermaid). It:
   - Takes the already-resolved `src` plus passthrough `<img>` props (`alt`,
     `title`, width/height, etc.).
   - Renders `<span class="md-image"><img ref={imgRef} src={src} …/><div class="diagram-toolbar">…</div></span>`.
     (Wrapper is `inline-block` because markdown images are inline-level.)
   - **Open** button (`OpenLinkIcon`, `title="Open in new tab"`) →
     `app.events.openRawLink.sendAsync(createLinkData(src))`. **Hidden when
     `src` starts with `data:` or `blob:`** (can't resolve to `image-view`).
   - **Copy** button (`CopyIcon`, `title="Copy"`, transient `copied` state for
     the 750 ms scale animation, same as mermaid) → `copyImageToClipboard(imgRef.current)`.
   - Mirrors the mermaid `MermaidBlock` button markup/behavior for visual
     consistency.

3. **Wire it into the `img` renderer** in `MarkdownBlock.tsx` `getComponents()`:
   replace the bare `<img>` with
   `<MarkdownImage src={resolveRelatedLink(filePath, …, wikiRoot)} {...props} />`.

4. **CSS** — add a `.md-image` block to `MarkdownBlockRoot` mirroring the
   `.mermaid-diagram` toolbar rules (`position: relative; display: inline-block;
   width: fit-content;` + the `.diagram-toolbar` / `.toolbar-btn` hover rules).
   Prefer **generalizing the existing selectors** to cover both wrappers
   (e.g. `"& .mermaid-diagram, & .md-image"` for the shared toolbar rules) over
   duplicating the full block, to avoid drift. The existing
   `"& img": { maxWidth: "100%", … }` rule continues to apply to the inner img.
   All colors come from `color` tokens (no hardcoded colors) — the mermaid
   toolbar rules already use `color.text.*`, `color.background.light`,
   `color.border.default`, so reuse those.

5. **Verify** `tsc --noEmit` and `eslint` are clean.

## Concerns / Open questions

- **Scope: which contexts get the buttons?** **DECIDED: show everywhere (match
  mermaid), no gating prop.** `MarkdownBlock` is reused beyond the Markdown view
  — log-view (`MarkdownOutputView`), mcp-inspector, mneme-root, notebook notes
  (`compact` mode) — and the mermaid toolbar is already unconditional in all of
  them, so the image toolbar is consistent and hover-only / non-intrusive.

- **`data:` / `blob:` images and "Open in new tab".** **DECIDED: hide the Open
  button when `src` starts with `data:` or `blob:`** (keep only **Copy**) —
  cleaner UX than a button that can't resolve to `image-view`.

- **CORS-tainted remote images.** `copyImageToClipboard` draws to a canvas;
  cross-origin images without CORS headers taint the canvas and `toBlob`/
  clipboard write throws. The mermaid path never hits this (SVG data URL).
  **Recommendation: wrap the copy in try/catch and show a brief failure state**
  (or just swallow). Low priority — most markdown images are local files.

- **No design-token / color additions expected** — the mermaid toolbar already
  defines every color we need.

## Files changed (planned)

| File | Change |
|------|--------|
| `src/renderer/editors/markdown/CodeBlock.tsx` | `export` the existing `copyImageToClipboard` helper |
| `src/renderer/editors/markdown/MarkdownImage.tsx` | **New** — image wrapper with Copy + Open toolbar |
| `src/renderer/editors/markdown/MarkdownBlock.tsx` | `img` renderer uses `MarkdownImage`; add/generalize `.md-image` toolbar CSS |

## Acceptance criteria

- Hovering a rendered image in the Markdown view reveals a top-right toolbar with
  **Open in new tab** and **Copy** buttons styled identically to the mermaid
  toolbar.
- **Copy** places the image on the clipboard as PNG (pasteable into another app).
- **Open in new tab** opens the image in a new Persephone page via the image
  viewer (verified with a local `file://` image and a remote `http(s)` image,
  e.g. the images in `Data-Platform-Testing.md`).
- Mermaid diagrams and code blocks are visually and behaviorally unchanged
  (no double toolbars).
- `tsc --noEmit` and `eslint` clean.

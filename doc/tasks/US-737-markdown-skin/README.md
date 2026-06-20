# US-737: Recommended component — marked + highlight.js

**Epic:** [EPIC-034 — Web Board](../../epics/EPIC-034.md) · **Status:** Implemented (epic-deferred review)

## Goal

Adopt **marked + highlight.js** as a recommended Web Board component pair, following the
[adoption workflow](../../epics/EPIC-034.md#adoption-workflow-per-component-tasks--proven-on-us-727):
a dedicated demo board, a Persephone skin tuned against the `--p-*` contract, an
autonomous MCP style review across both themes, and promotion to `boards-assets/`
with a manifest entry.

Unlike the prior single-component skins, this is **two libraries that work together**:
**marked** parses Markdown → HTML (it ships no CSS — it emits bare semantic HTML), and
**highlight.js** tokenizes fenced code into `.hljs-*` spans (it ships only class names —
its colors live entirely in a theme stylesheet you choose). So the deliverable is **one
combined CSS skin** (`markdown.css`) with two parts: rendered-markdown typography + a
highlight.js token theme — both written against `--p-*`, no JS-colored surface.

## What was built

Demo board at `.persephone/boards/marked + highlight.js/` (gitignored working artifact):

- **Vendored** `lib/marked.min.js` (**15.0.12**, global `marked`) and `lib/highlight.min.js`
  (**highlight.js 11.11.1**, `@highlightjs/cdn-assets` common-languages bundle, global `hljs`).
  No highlight.js theme CSS is vendored — `markdown.css` *is* the theme.
- **`index.html`** — toolbar (title + theme pill + Reload) over a scrolling `.markdown-body`
  article; load order `board-base.css → markdown.css`, then the two libs + `app.js`.
- **`app.js`** — fetches the markdown source over `persephone.execute("node scripts/sample.js")`
  (dogfoods the channel), renders with `marked.parse()`, then calls `hljs.highlightElement`
  on each `pre code`. Pure CSS skin → no recolor on theme switch; `onThemeChange` only
  refreshes the theme pill.
- **`content.md`** — the sample document exercising every feature: headings, inline styles,
  ordered/unordered/task lists, a GFM table, blockquote, hr, and fenced code in JS, JSON,
  CSS, Python, Bash, and a diff (covering every token group).
- **`scripts/sample.js`** — backend; reads `content.md`, appends a generated-at stamp, returns
  a single `@@RESULT@@`-tagged JSON document (`{ markdown, generatedAt }`), logs to stderr.
- **`markdown.css`** — the skin. **Part 1** styles `.markdown-body` prose (proportional system
  font; h1/h2 ruled with `--p-border`; accent task-list checkboxes; accent blockquote border;
  `--p-panel` table header + faint zebra; `--p-text`-tint inline-code pills; `--p-panel`/`--p-border`
  `<pre>` frame). **Part 2** maps every `.hljs-*` class onto `--p-*` by role.

### Token → `--p-*` mapping

`--p-*` carries no syntax palette, so highlight.js's ~8 default-theme hues fold onto the
semantic tokens. Each maps to a value the theme system already keeps legible on its own
background, so it reads in **both** themes:

| Role | `--p-*` |
|------|---------|
| plain text, operators, punctuation, variables, params | `--p-text` |
| comments, quotes (italic) | `--p-text-muted` |
| keywords, tags, literals (`true`/`false`/`null`) | `--p-accent` |
| titles / functions / classes, types, built-ins, attr (e.g. JSON keys) | `--p-link` |
| strings, regexp, escapes, additions | `--p-success` |
| numbers, symbols, meta, css id/class selectors | `--p-warning` |
| deletions | `--p-error` |

## Verification

- MCP review (`browser_evaluate` probes + screenshots) in **dark (default-dark)** and
  **light (light-modern)**:
  - Probe in **light** (where the skin fallbacks ≠ the theme values) confirmed every token
    traces to its `--p-*`: keyword = `--p-accent` `rgb(0,95,184)`, title/attr = `--p-link`
    `rgb(30,77,122)`, string = `--p-success` `rgb(26,127,55)`, number = `--p-warning`
    `rgb(154,103,0)`, comment = `--p-text-muted`, base = `--p-text` — **not** the literal
    fallback and **not** highlight.js's shipped default.
  - The light-theme risk (amber/green/blue washing out on a near-white code panel) was
    checked visually and passed — light-modern's `--p-warning` is a dark amber, not an
    invisible yellow; all tokens stay readable on `--p-panel`.
  - Exercised JS, JSON, CSS, Python, Bash, and diff fences; GFM table, task list, blockquote.
  - Live theme switch re-tinted the document with **no reload / no re-render** (pure CSS skin);
    `onThemeChange` fired (theme pill updated).
- `execute()` data path works end-to-end (markdown source loaded from `scripts/sample.js`).

## Acceptance criteria

- [x] Board renders markdown + highlighted code natively-themed in **both** dark and light.
- [x] Theming via a **CSS skin** against `--p-*` (literal fallbacks; readable token hues in both themes).
- [x] Both libraries are **local** to the board (no CDN); board loads offline.
- [x] At least one data path goes through `persephone.execute()` (markdown source).
- [x] Skin promoted to `boards-assets/markdown.css`; manifest + README updated.

## Files changed (committed)

| Path | Change |
|------|--------|
| `boards-assets/markdown.css` | published combined CSS skin (frozen, stamped `marked@15.0.12 + highlight.js@11.11.1`) |
| `boards-assets/manifest.json` | added `markdown` entry (two-library vendor, CSS skin, token-map note) |
| `boards-assets/README.md` | components table — marked + highlight.js row |

The demo board `.persephone/boards/marked + highlight.js/` stays local (gitignored).

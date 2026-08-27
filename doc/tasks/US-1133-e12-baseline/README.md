# US-1133 — EPIC-070 / E12: the live baseline

**Epic:** [EPIC-070](../../epics/EPIC-070.md) (De-React E12)
**Captured:** 2026-08-27, running dev session (`npm start`), before any E12 change.

E11's standing rules apply and are the reason this task exists at all:

- *A DOM baseline is the only instrument that sees a silent conversion regression.*
- *A report of what could not be done is not evidence about what was done.*
- *A roots figure without the open-page list is not a measurement.*

**Data handling.** This session has customer files and Evergreen boards open. Every query below
reads **structure only** — tag names, `data-*` markers, inline `display`, child counts, SVG
`viewBox`/`width`/`height`. No `textContent`, no file content, no page titles are captured.

## Session shape

**7 pages open, 3 ever activated.**

| # | Editor | Ever activated |
|---|---|---|
| 1 | `board-editor:…/todo` | no |
| 2 | `monaco` | no |
| 3 | `md-view` | **yes (active)** |
| 4 | `board-view` | no |
| 5 | `md-view` | no |
| 6 | `monaco` | **yes** |
| 7 | `board-editor:…/Dev Dashboard` | **yes** |

## The measurement

| Metric | Baseline |
|---|---|
| `[data-react-root]` count | **6** |
| — of which page-level (`PageSlot`) roots | **3** |
| — of which `GlobalStyles` | 1 |
| — of which nested (depth 1) | 2 |
| Page placeholders in `AppPageManagerView` | **7** |
| — rendered (`childElementCount > 0`) | **3** |
| — carrying a React root | **3** |
| `[data-part="react-slot"]` markers | 1 |
| Rendered `<svg>` elements | **238** |
| — **empty** (no element child but `<title>`) | **0** |
| — inside a `[data-react-root]` subtree | **204** |
| Distinct icon `viewBox` values | 11 |

### The six roots

| # | Depth | Chain (nearest first) | First child | What it is |
|---|---|---|---|---|
| 1 | 0 | *(none)* | — | `GlobalStyles` (Emotion; Epic F) |
| 2 | 0 | `pages-container < app-content` | `DIV` | **`PageSlot` root** — the contract |
| 3 | 0 | `pages-container < app-content` | `DIV` | **`PageSlot` root** |
| 4 | 1 | `react-slot < text-chrome-children < text-chrome-root < page-editor < pages-container < app-content` | `DIV[monaco-body]` | `MonacoBody` (§E12-1 finding) |
| 5 | 0 | `pages-container < app-content` | `DIV` | **`PageSlot` root** |
| 6 | 1 | `page-editor < pages-container < app-content` | `DIV[board-host]` | `board`, `Component` arm |

Each `PageSlot` root's first child is a bare `DIV` — the `mountVanilla` host `PageContentBridge`
returns — and holds nothing else React.

### DOM structure of the page host

```
[data-name="pages-container"]              (1 child)
  └─ DIV                                    AppPageManagerView.root — no data-* marker
       ├─ DIV  display:none  kids:0  root:no    ← never activated: zero cost
       ├─ DIV  display:none  kids:0  root:no
       ├─ DIV  display:flex  kids:1  root:YES   ← active page
       ├─ DIV  display:none  kids:0  root:no
       ├─ DIV  display:none  kids:0  root:no
       ├─ DIV  display:none  kids:1  root:YES   ← activated earlier, retained
       └─ DIV  display:none  kids:1  root:YES
```

## What the baseline settles

1. **The contract's cost is exactly one React root per *activated* page** — 3 roots for 3 activated
   pages, 0 for the 4 that were never opened. The per-open-tab term E12-2 predicts removing is real
   and it is measured here.
2. **Concern 2's `hasBeenActive` laziness is load-bearing and now quantified.** 4 of 7 placeholders
   hold nothing at all. Any native arm that renders eagerly turns this session from 3 constructed
   editors into 7, including two boards and a Monaco. The closing measurement must re-check this
   ratio, not just the root count.
3. **No icon is currently broken.** 238 rendered SVGs, **0 empty**. So after the icon conversion,
   *any* empty `<svg>` is unambiguously a regression — this is the comparison E11 lacked when it
   misread `createIconElement`'s empty-SVG fallback as three conversion regressions.
4. **The page-island root corrupts every "is this inside React?" instrument.** 204 of 238 SVGs count
   as "inside a React root" today, because a `PageSlot` root wraps a page's *entire* subtree
   including all of its native content. After E12 this should collapse to the board editor's own
   icons. It is a good closing metric precisely because it is currently meaningless.
5. **The page placeholders carry no `data-*` marker.** This is why E11's `:scope > [data-type]` probe
   matched nothing. US-1134 should stamp a `data-name` on the placeholder so the instrument can
   address it — see [ui-element-contract](../../architecture/ui-element-contract.md).
6. **The root count is not stable across readings within one session.** Successive probes minutes
   apart read 7, then 6, because an editor's own nested root disposed between them. A single number
   is not the measurement; the number **plus** the page list **plus** the per-root chain is. Report
   all three at close.

## Reproducing it

`mcp__persephone__execute_script`, wrapped in an IIFE with a `return` (the runner returns
`undefined` for a bare trailing expression after `const` declarations, and re-running top-level
`const` in the shared scope throws "already declared").

- Roots: `document.querySelectorAll("[data-react-root]")`; per root walk `parentElement` counting
  ancestors that also carry the attribute (depth) and collecting
  `data-name`/`data-type`/`data-part` (chain); record `firstElementChild`.
- Placeholders: `[data-name="pages-container"]` → `firstElementChild` → `children`; record
  `style.display`, `childElementCount`, and whether the element carries `data-react-root`.
- Icons: `document.querySelectorAll("svg")`; empty = zero element children ignoring `<title>`.
- **Do not** use `data-part="react-slot"` for root counts — `uikit/Dialog/DialogView.tsx:86` and
  `uikit/Tag/TagView.tsx:88` stamp it unconditionally (US-1091).

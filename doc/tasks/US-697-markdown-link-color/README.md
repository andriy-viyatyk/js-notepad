# US-697: Markdown view — softer link color (distinct from search highlights)

## Goal

Soften the hyperlink color in the markdown view so it no longer reuses the saturated
blue accent (`misc.blue`). Links currently share the exact same blue as search-match
highlights, which makes the Mneme search results view (rendered via `MarkdownBlock`)
look "mostly blue." A new per-theme link token — a 50/50 blend of body text and the
blue accent — gives links a calmer, lower-contrast color while keeping matched words
the only saturated blue, so the matches read as the actual search hits.

## Background

- **Markdown link styling** lives in `src/renderer/editors/markdown/MarkdownBlock.tsx`,
  in the `MarkdownBlockRoot` styled component's `& a` block (lines 200–209). Both the
  link itself and `strong` inside a link use `color.misc.blue`:
  ```ts
  "& a": {
      color: color.misc.blue,
      textDecoration: "none",
      "&:hover": { textDecoration: "underline" },
      "& strong": { color: color.misc.blue },
  },
  ```
- **Search-match highlights** are colored globally in
  `src/renderer/theme/GlobalStyles.tsx` (lines 105–113): `.highlighted-text` and
  `.highlighted-text-active` both set text color to `color.misc.blue` (active match also
  adds a yellow `color.highlight.activeMatch` background). The match span class
  (`highlighted-text`) is produced by `src/renderer/editors/markdown/rehypeHighlight.ts`
  and is **shared app-wide** (e.g. file search via `uikit/shared/highlight.ts`).
  **This task does not touch the highlight color** — see Concerns.
- **Why the Mneme search view looks blue:** `MnemeRootEditorView.tsx` renders results as
  markdown (`### [title](href)`) through `MarkdownBlock`. The title links get
  `misc.blue` and the matched words inside them also get `misc.blue` → everything blue.
  Softening only the link color fixes this without weakening the match signal.
- **Color tokens:** `src/renderer/theme/color.ts` exposes the `misc` group
  (`misc.blue` = `var(--color-misc-blue)`, lines 49–55). There is no existing `link`
  token. Each of the 9 theme files under `src/renderer/theme/themes/` defines a
  `colors: Record<string, string>` map of CSS-variable → value; `applyTheme`
  (`themes/index.ts`) sets each as a CSS custom property. A new token must be added to
  `color.ts` **and** to all 9 theme files.

## Implementation plan

### 1. Add the `misc.link` token to `color.ts`

`src/renderer/theme/color.ts`, in the `misc` group (after `blue`, line 50):
```ts
misc: {
    blue: "var(--color-misc-blue)",
    link: "var(--color-misc-link)",   // softer link color: 50/50 blend of text.default + misc.blue
    green: "var(--color-misc-green)",
    ...
},
```

### 2. Add `--color-misc-link` to all 9 theme files

Add the variable to the `colors` map of each theme (alongside `--color-misc-blue`).
Values are a 50/50 RGB blend of that theme's `--color-text-default` and
`--color-misc-blue`, rounded:

| Theme file | text.default | misc.blue | **`--color-misc-link`** |
|---|---|---|---|
| `default-dark.ts` | `#cccccc` | `#3794ff` | `#82b0e6` |
| `light-modern.ts` | `#3B3B3B` | `#005FB8` | `#1e4d7a` |
| `quiet-light.ts` | `#333333` | `#4B69C6` | `#3f4e7d` |
| `abyss.ts` | `#6688cc` | `#6688cc` | `#9fc4f5` *(brightened, not blended — see note)* |
| `monokai.ts` | `#f8f8f2` | `#66d9ef` | `#afe9f1` |
| `red.ts` | `#f8f8f8` | `#6c9ef8` | `#b2cbf8` |
| `solarized-dark.ts` | `#839496` | `#268bd2` | `#5590b4` |
| `solarized-light.ts` | `#657B83` | `#268bd2` | `#4683ab` |
| `tomorrow-night-blue.ts` | `#ffffff` | `#bbdaff` | `#ddedff` |

`default-dark.ts` also carries a documentation-comment block for its tokens (around
line 46, `// --color-misc-blue   textLink.foreground`); add a matching comment line for
`--color-misc-link` there. The other themes have no such comment block — value only.

### 3. Point markdown links at the new token

`src/renderer/editors/markdown/MarkdownBlock.tsx`, `& a` block (lines 201 & 207):
```ts
"& a": {
    color: color.misc.link,          // was color.misc.blue
    textDecoration: "none",
    "&:hover": { textDecoration: "underline" },
    "& strong": { color: color.misc.link },   // was color.misc.blue
},
```

### 4. Verify

- `npm run lint` and `tsc --noEmit` clean.
- Manual: open a markdown doc with links → links read softer than before, underline on
  hover unchanged. Run a Mneme search → result titles (links) are calm, matched words
  still pop blue. Spot-check default-dark + one light theme (light-modern).

## Concerns / open questions

1. **Search-match highlight left blue (recommended).** `.highlighted-text` is global and
   shared with file search; recoloring it is broader than this request and would weaken
   the "this is your match" signal. Recommendation: keep matches at `misc.blue`; softening
   links alone resolves the "mostly blue" complaint. *If* the view still feels too blue
   after testing, a follow-up could give inactive matches a faint background tint instead
   of blue text — but only after seeing the softened result.
2. **Abyss theme:** its `text.default` already equals `misc.blue` (`#6688cc`), so links
   there already matched body text before this change. A 50/50 blend would be invisible,
   so abyss inverts the rule: its link token is **brightened** (`#9fc4f5`) to stand out
   against the periwinkle body text.
3. **Scope:** only `MarkdownBlock`'s `& a` changes color. Monaco-rendered links, link
   editors, and other `misc.blue` consumers are untouched.

## Acceptance criteria

- [ ] `misc.link` token exists in `color.ts` and `--color-misc-link` is defined in all 9 theme files.
- [ ] Markdown links (and `strong` inside links) use `color.misc.link`, not `misc.blue`.
- [ ] Search-match highlights are unchanged (still `misc.blue`).
- [ ] Links are visibly softer than matched words in a Mneme search result.
- [ ] `npm run lint` + `tsc --noEmit` clean.

## Files changed

| File | Change |
|---|---|
| `src/renderer/theme/color.ts` | Add `misc.link` token |
| `src/renderer/theme/themes/default-dark.ts` | Add `--color-misc-link` (+ doc comment) |
| `src/renderer/theme/themes/light-modern.ts` | Add `--color-misc-link` |
| `src/renderer/theme/themes/quiet-light.ts` | Add `--color-misc-link` |
| `src/renderer/theme/themes/abyss.ts` | Add `--color-misc-link` |
| `src/renderer/theme/themes/monokai.ts` | Add `--color-misc-link` |
| `src/renderer/theme/themes/red.ts` | Add `--color-misc-link` |
| `src/renderer/theme/themes/solarized-dark.ts` | Add `--color-misc-link` |
| `src/renderer/theme/themes/solarized-light.ts` | Add `--color-misc-link` |
| `src/renderer/theme/themes/tomorrow-night-blue.ts` | Add `--color-misc-link` |
| `src/renderer/editors/markdown/MarkdownBlock.tsx` | `& a` color → `color.misc.link` (2 lines) |

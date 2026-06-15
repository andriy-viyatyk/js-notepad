# US-680: [Phase 4] Mneme search results — render as markdown via MarkdownBlock

**Epic:** EPIC-032 — Mneme
**Status:** Implemented — awaiting manual smoke test

## Goal

Replace the hand-built result-row rendering in the Mneme root search view (US-676/US-678)
with a single generated **markdown document** rendered through the existing `MarkdownBlock`
component. Each result becomes a markdown section whose document link is a proper
`mneme://{root}/{path}` URL, so navigation rides Persephone's standard `openRawLink` flow —
no bespoke result rendering or click wiring needed.

## Background

### Why this works

`MarkdownBlock` is already a reusable, self-contained presentational component:

- **File:** `src/renderer/editors/markdown/MarkdownBlock.tsx` (exported from `../markdown/index.tsx`).
- **Props:** `content: string` (required), plus optional `highlightText`, `compact`, `filePath`,
  `className`, `style`, `onMatchCountChange`.
- Uses `react-markdown` + `remark-gfm` + `rehype-raw`. No Monaco / EditorModel dependency.
- Already embedded outside its own editor: `MarkdownOutputView` (log-view) and
  `ResourceContentView` (mcp-inspector) both do `<MarkdownBlock content={…} compact />`.
- Has its own scroll-less styled root (`MarkdownBlockRoot`); the caller wraps it in a scrollable `Panel`.

### How link navigation works (the key premise)

Markdown links render as plain `<a href="…">`. `MarkdownBlock` does **not** intercept left-clicks;
instead Electron's main-process `will-navigate` handler (`src/main/open-window.ts`) catches every
anchor navigation, calls `event.preventDefault()`, and forwards non-`file://`/non-`http(s)` URLs via
`eOpenUrl` → renderer `handleOpenUrl` → `app.events.openRawLink.sendAsync(createLinkData(url))`.
The `mneme://` parser (`src/renderer/content/parsers.ts`) then routes it. `resolveRelatedLink`
(`src/renderer/core/utils/path-utils.ts`) passes `mneme://…` hrefs through unchanged (it only rewrites
`http(s)`/`file`/`mailto`/`#`).

**Net:** a standard markdown link `[CDI work](mneme://EvergreenWiki/work/cdi.md)` navigates correctly
with zero extra wiring.

### Navigation behavior — open in a new page (decided)

The automatic `will-navigate` path calls `openRawLink` **without `pageId`/`sourceId`**, so a clicked
result link opens the document in a **new page** while the search results stay on the current page.
**This is the desired behavior for this task** — no click interceptor is added; we rely entirely on the
standard `will-navigate` → `openRawLink` → `mneme://` parser path. (Future: in-page navigation, e.g.
Ctrl+Click, may be added to the markdown view itself — **out of scope here**.)

Consequence: `MnemeRootEditorModel.openResult(uri)` is no longer called by anything (row-click is also
removed). Remove it, along with any now-unused imports it pulled in (`app`, `createLinkData`) if nothing
else in the model uses them.

### Current code being replaced

`src/renderer/editors/mneme-root/MnemeRootEditorView.tsx` lines ~221–271: the results `Panel` that
`.map()`s over `s.results` into per-hit `Panel`s (title `Text bold`, snippet `Text preWrap`, `Tag`s,
and a `Text variant="link"` path link calling `model.openResult`). The empty/not-searched/no-root
states (lines ~223–236) and the status strip (loading/error/note) stay as-is — only the **results list**
becomes a markdown document.

The search toolbar (input + mode `Select` + Filters + Search button) from US-676/US-678 is unaffected.

Result shape (`WikiSearchHit`, `MnemeRootEditorModel.ts`): `{ uri, title, tags: string[], snippet, score }`
where `uri` is scheme-less `{root}/{path}`.

## Implementation plan

1. **Markdown generation helper** — add a pure function (in `MnemeRootEditorModel.ts` as a method, or a
   small `results-to-markdown.ts` next to the model) that turns `WikiSearchHit[]` into a markdown string:
   - Per hit, render a section. Proposed layout (final wording subject to review):
     ```
     ### [{title || path}](mneme://{uri})

     {escaped snippet}

     `tag1` `tag2`   ·   `{uri}`   ·   score {score}
     ```
   - **Link:** `[label](mneme://{uri})` — prepend `mneme://` to the scheme-less `uri` (mirror
     `openResult`'s prepend logic so both stay consistent).
   - **Snippet escaping:** snippets may contain markdown metacharacters and FTS5 highlight markers
     (`[...]`). Escape backslash/backtick/asterisk/underscore/`[`/`]`/`<`/`>` (or wrap in a blockquote)
     so prose renders verbatim and doesn't accidentally form links/emphasis. Decide escape vs. blockquote
     during implementation (see Concerns).
   - **Tags:** render as inline code (`` `tag` ``) or a trailing list — chosen to read cleanly in markdown.
2. **Render in the view** — replace the results-`map` block with:
   ```tsx
   <Panel direction="column" flex={1} height={0} width="100%" overflowY="auto">
       <MarkdownBlock content={resultsMarkdown} compact highlightText={s.searchQuery} />
   </Panel>
   ```
   - Keep the three guard states (no root / not searched / no results) exactly as today; only swap the
     populated branch for the `MarkdownBlock`.
   - `resultsMarkdown` is `useMemo`'d from `s.results` (regenerate only when results change).
   - `highlightText={s.searchQuery}` is a free bonus — `MarkdownBlock` highlights matched query text.
   - **No click interceptor** — links navigate to a new page via the standard `will-navigate` →
     `openRawLink` path (decided).
3. **Cleanup** — remove `MnemeRootEditorModel.openResult()` (now unused) and its now-unused imports
   (`app`, `createLinkData`) if nothing else in the model references them. In the view, drop the now-unused
   per-row imports (the per-hit `Tag`/`Text` rows go away — check whether `Tag`/`Text` are still used
   elsewhere in the file before removing their imports). Verify `tsc --noEmit` + `eslint` clean.
4. **No Emotion in editors** — `MarkdownBlock` brings its own styles; the wrapper uses `Panel` props only.

## Concerns / open questions

1. **Snippet escaping vs. blockquote.** ✅ **Resolved.** Escape markdown-significant chars (`[`, `]`, `*`,
   `` ` ``, `<`, `>`, `_`, `\`) and render inline; revisit blockquote only if it reads better. Quick visual
   check during impl.
2. **Navigation — open in new page.** ✅ **Resolved.** Links open the document in a new page via the
   standard `will-navigate` → `openRawLink` path; **no interceptor**. `openResult` is removed (step 3).
   In-page navigation (Ctrl+Click) is a future enhancement to the markdown view — out of scope.
3. **Score display.** Show the relevance `score`? Useful while testing Mneme search modes. Proposed: show
   it (small, trailing). Easy to drop later.
4. **Lost affordances.** Current rows render tags as `Tag` chips and the path as a styled link. Markdown
   renders tags as inline code and the title as the link. This is a deliberate simplification per the
   user's request ("we do not need special result rendering"). Confirm the markdown look is acceptable.
5. **`compact` + theme.** `MarkdownBlock`'s styles are theme-driven; `compact` matches the denser result
   list. Confirm spacing reads well inside the search view.

## Acceptance criteria

- Search results render as a single markdown document via `MarkdownBlock` (no per-row JSX).
- Clicking a result's document link opens that document in a **new page** via `mneme://` → `openRawLink`
  (search results remain on the current page).
- Empty / not-searched / no-root / loading / error / degraded-note states unchanged.
- Search toolbar (query, mode, filters) unchanged.
- `tsc --noEmit` and `eslint` clean. No Emotion added under `src/renderer/editors/`.

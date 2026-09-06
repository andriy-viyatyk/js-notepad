# EPIC-086: The page node redesign, and the text-and-preview editor family through `call`

## Status

**Status:** Completed
**Created:** 2026-09-05
**Started:** 2026-09-05
**Completed:** 2026-09-06
**Roadmap:** [agent-transparency-roadmap.md](../agent-transparency-roadmap.md), epic 3 of 7

## Overview

Epics 1 and 2 made the *shell* transparent — the chrome that is there no matter which page is open.
This epic is the first to go **inside a page**. Before it can, the page node itself has to change
shape, and that redesign is where the epic starts.

### Why the page node is wrong today

`pages[i]` is `PageWrapper`, and its editor access is thirteen `as*()` methods —
`asText()`, `asGrid()`, `asMarkdown()`, … — each doing `ensureEditor()` + an `instanceof` check
(`PageWrapper.ts:283-407`). That shape dates from the **single text host** architecture, when every
editor was a sibling view over one `TextFileModel` and "as grid" meant "look at the same content
through the grid view". The architecture was since inverted: the page's main model *is* the specific
editor model (`GridEditor`, `SvgEditor`, …) holding its content host, and switching editors
**replaces** the model. There is now exactly one editor on a page at any moment, so `asGrid()` is a
redundant segment in front of the thing the agent actually wants:

```
pages[0].asGrid().rows        today
pages[0].editor.rows          what the structure says
```

The user reviewing the tree (2026-09-05) set the principle the redesign follows: **the structure the
agent sees should match the structure the user sees.** A user describes a page as "the tab, the
editor, its toolbar with the editor switch, and the side panels". The agent should find exactly those
nodes, in those words.

### No compatibility constraint

User decision, 2026-09-05: Persephone has a handful of downloads and the user has no scripts of their
own. The script API is **simplified in place** — `as*()` is removed from `PageWrapper`, the `.d.ts`
typings, the guides and the docs — rather than kept beside a new agent-only shape. The agent tree and
the script API stay one surface, which is what EPIC-083's "every path has the same name in scripts"
rule wanted; it no longer needs the exception `AiRoot` had to carve out.

### The editor family this epic then covers

| Surface | Editor id | Facade today | Named controls today | Curated `elements` (verified) |
|---|---|---|---|---|
| Monaco / text | `monaco` | `TextEditorFacade` | 1 | 12 |
| Markdown preview | `md-view` | `MarkdownEditorFacade` | 6 | 7 |
| HTML preview | `html-view` | `HtmlEditorFacade` | 3 | 4 |
| SVG preview | `svg-view` | `SvgEditorFacade` | 4 | 4 |
| Mermaid diagram | `mermaid-view` | `MermaidEditorFacade` | 6 | 6 |
| Graph | `graph-view` | `GraphEditorFacade` | 26 | 26 (19 existing + 7 added) |
| Image | `image-view` | `ImageEditorFacade` | 9 | 3 |
| Video | `video-view` | **none** | 14 | 10 |
| File diff | `file-diff` | **none** | 5 | 4 (the 5th is the git-revisions panel, which stays on `page.panels`) |
| Compare | *not an editor* — a page **mode** | **none** | 2 | 2 |

**The last column was added 2026-09-06**, after each task's investigation counted the source. The
"named controls today" column was a first-pass estimate; the verified counts differ because
structural roots, transient menu roots, status labels, viewport gestures and generated native media
controls are evidence of the render tree but are **not** curated controls. Image (9 → 3) and video
(14 → 10) shrank for that reason; markdown, HTML and Monaco grew because shared `TextChromeView`
contributions and the script panel belong to the editor facade under decision 8.

Two facts the table understates. **Three surfaces have no facade** — video and file diff are real
editors `PageWrapper` never mapped, and compare is a *mode* the page enters
(`pagesModel.query.isInCompareMode`, `PageContentView.ts:77-88`) with `CompareEditor` mounted over
two `TextFileModel`s, so it is a relationship between two pages, not a property of one. And **the
`elements` protocol does not yet work inside a page**: every EPIC-084/085 surface was a singleton,
but `PagesView` renders *every* open page into a retained `PageSlot` (`PagesView.ts:44`,
`PageSlot.ts:18`), so a bare `[data-name="image-save"]` matches every open image page plus the
grouped one. `visible` would answer for the wrong page and `highlight` would ring the wrong button,
both with `found: true` — EPIC-085's *silent success* finding, waiting in a new place.

## Goals

- `pages[i]` reads like the page the user sees: `tab`, `editor`, `editorSwitches`, `panels`,
  `grouped`, plus the plain properties. No `as*()` anywhere — tree, scripts, typings, docs.
- Editor surfaces carry `elements` and `highlight` **correctly**: scoped to their own page, and
  honest about a page the user cannot currently see.
- Every editor in the table has a facade reachable as `pages[i].editor`, including the three that
  have none, with compare placed where the mode lives.
- Each surface's toolbar, panels and dialogs are named with a purpose line each — the hand-written
  words a type cannot carry (roadmap principle 2).
- `create_page`, `get_page_content`, `set_page_content` and `open_url`-for-non-browser-targets are
  marked **retirable**. Nothing is deleted; deletion is EPIC-090's.

## Design decisions

### The page node (US-1310)

1. **`page.editor` is the current editor's facade, not a string.** Reading it returns the facade for
   the page's `mainEditorInstance` — the existing thirteen facade classes are reused as the node
   values, gaining `id` (the editor id) and `name` (the registry display name) so an agent or a
   script can tell which one it got. In TypeScript the property is a discriminated union on `id`
   (`IEditorFacade = ITextEditor | IGridEditor | …`), which is how a script narrows it:
   `if (page.editor.id === "grid-json") page.editor.addRows(5)`. The union replaces the per-method
   return types; nothing is lost that a script could have used.

2. **Switching lives in `page.editorSwitches`, mirroring the toolbar widget.** The widget on the
   page toolbar (`PageToolbarView.ts:350`, `data-name="page-editor-switch"`) shows the compatible
   editors for the page's language and file (`editorRegistry.getSwitchOptions`). The node exposes
   the same: `current`, `options: [{ id, label }]`, `switchTo(id)`, and `elements` for the widget.
   `switchTo` accepts **any** registered editor id — the same latitude the old `page.editor = "…"`
   setter and `asX(true)` had, which scripts need for grouped output pages whose content was just
   assigned — and rejects with the registry's reason when `switchMainEditor` refuses. `options` is
   what the user is offered; `switchTo` is what the user *could* do through the menu. The `$help`
   says which is which. The writable `editor` string and every `as*(force)` go.

   **Revised 2026-09-05, during US-1310's review.** The widget does not use
   `editorRegistry.getSwitchOptions()`: `SwitchWidgetView.syncSegments`
   (`PageToolbarView.ts:302-328`) merges the model's `findCompatibleEditors()` override with
   matching board editors and the board-info "+" entry. That merge is extracted into a shared helper
   used by both the widget and the node, so `options` is exactly what the user sees. Two more
   findings from the same review: `switchMainEditor` returns normally *without switching* when the
   user declines the release prompt or the page has no file to rebuild over, so `switchTo` verifies
   the editor id after the await and throws a diagnostic otherwise; and `page.editor` is never
   `undefined` — an editor with no operation facade (video, file-diff, boards) returns a
   `GenericEditorFacade` carrying `id` and `name`, so the tree stays navigable on every page.

3. **`page.tab` is the page's own tab-strip entry.** Today the tab's controls (`tab-language`,
   `tab-close`, `tab-sound`) are in `ui.elements`, scoped with `[data-active]` — correct for the
   active page and *wrong for every other one*, whose tab is visible while its editor is not. The
   per-page node uses the page-scoped selectors from decision 5 and carries what the tab shows:
   title, modified marker, pinned state, the language button, close, and the sound indicator where
   present. `ui.elements` keeps the strip itself (`page-tabs`, add button, scroll arrows); the
   per-tab entries move here.

4. **`panels` keeps its name.** EPIC-085 shipped `page.panels` with QA coverage yesterday; the user's
   "sidePanels" is the same thing, and the surface is not renamed for the word. It gains the one
   control it owns and did not list: the toolbar's nav-panel toggle (`page-nav-panel`).

### Scoping and activation (US-1311)

5. **Element selectors are page-scoped, from a new attribute on the page slot.** `PageSlot` emits
   `data-name="page-slot"` but no identity. Add `data-page-id="<id>"` to the slot element — and to
   the tab element, for decision 3 — and resolve an editor surface's declared selectors beneath it.
   This is an **identity** attribute, not a `data-name` and not a state attribute;
   [ui-element-contract.md](../architecture/ui-element-contract.md) gains a row saying so. One
   attribute buys correct scoping for every editor surface in epics 3–5.

6. **`highlight` on a page surface activates the page first.** An inactive page is in the DOM
   without layout (`offsetParent === null`), so the overlay would report `found: true` and draw
   nothing. Follow `settings.highlight(key)`'s precedent (EPIC-085 decision 6, revised): bring the
   surface on screen, then draw. `elements[].visible` keeps its literal meaning — on screen right
   now — and `$help` says an inactive page reports everything invisible until activated.

7. **`elements` stops at a foreign document.** HTML preview renders into an iframe and the browser
   into a webview; `document.querySelectorAll` crosses neither. Those surfaces declare their host
   chrome only, and `$help` points at the automation surface EPIC-089 hangs on the same node.
   Declaring an element that can never be found is worse than declaring nothing.

8. **An editor's element list belongs to its facade** — the node whose state explains why the
   element exists (EPIC-085 decision 7). The toolbar items an editor contributes are the editor's;
   the switch widget is `editorSwitches`'; the nav-panel button is `panels`'; the tab is `tab`'s.

### The family

9. **Compare hangs off `pages`, not off a page.** It is a property of a *pair* (`compareGroups`,
   `leftRight`, `rightLeft` in `PagesModel`); `pages.openDiff({ firstPath, secondPath })` already
   exists as one entry point. The node lists which pairs are compared and which side each is on, how
   to enter and leave, and `CompareEditor`'s own controls as its `elements`.

10. **File diff and video get ordinary facades**, mapped in `FACADE_FOR_EDITOR` and surfaced through
    `page.editor` like the rest. File diff's git-revisions panel is already reachable through
    `page.panels`; the facade cross-references it rather than re-listing it.

11. **Video is read-mostly and says so.** Playback members that change what is audible carry a
    `caution`; the surface gains nothing the toolbar does not already offer.

12. **Graph is one task on its own** — 26 named controls, two panels, a popover and a context menu.

13. **Retirable, not retired.** The four tools are marked only after US-1317's Haiku run passes.

14. **This release is 5.0.0.** Removing `as*()` and the assignable `page.editor` string breaks the
    scripting API, and a major version says so even with no scripts to protect. `package.json` was
    bumped from the unreleased 4.0.24 and `docs/whats-new.md` opens with a **Breaking Changes**
    section that US-1310 keeps accurate; the working branch keeps its `upcoming-v4.0.24` name until
    the user renames it (a remote-branch change, theirs to make).

## Linked Tasks

| Task | Title | Status |
|------|-------|--------|
| [US-1310](../tasks/US-1310-page-node-redesign/README.md) | The page node redesign — `page.editor` as the current facade, `editorSwitches`, removal of `as*()` from wrapper, typings, guides and docs | Reviewed |
| [US-1311](../tasks/US-1311-page-scoped-elements/README.md) | Page-scoped selectors (`data-page-id`), activate-then-highlight, `page.tab`, proven on the Monaco editor's toolbar | Reviewed |
| [US-1312](../tasks/US-1312-monaco-text-surface/README.md) | The Monaco/text surface — toolbar, script panel, encryption and find/replace controls | Reviewed |
| [US-1313](../tasks/US-1313-preview-family/README.md) | The preview family — markdown, HTML, SVG and mermaid | Reviewed |
| [US-1314](../tasks/US-1314-media-surfaces/README.md) | Media — the image surface, and a new video facade | Reviewed |
| [US-1315](../tasks/US-1315-diff-and-compare/README.md) | Diff — the file-diff facade, and compare mode on `pages` | Reviewed |
| [US-1316](../tasks/US-1316-graph-surface/README.md) | The graph surface — toolbar, detail and legend panels, expansion settings | Reviewed |
| [US-1317](../tasks/US-1317-editor-surface-acceptance/README.md) | Acceptance run on Haiku via `mcp-test-agent-call`; `qa/surfaces/editors/*.md`; three tools marked retirable (`open_url` corrected, not marked) | Reviewed |

US-1310 comes first and is the largest: it touches every facade's help text, the `.d.ts` typings in
`assets/editor-types/` and `src/renderer/api/types/`, `docs/api/page.md`, `docs/scripting.md`, the
`pages`/`scripting`/`overview` MCP guides, the root help block, and the QA files that spell
`asGrid()`. US-1311 depends on it. US-1312–US-1316 are independent of each other. US-1317 closes.

## Acceptance

- `pages[0]` lists `tab`, `editor`, `editorSwitches`, `panels`, `grouped` and no `as*()` member;
  `grep -r "asGrid\|asText(" src assets docs qa` returns nothing but history files.
- A Haiku agent with `call` alone answers "what can I do on this markdown page?" from
  `pages[i].editor`, and "show me where the preview is refreshed" rings the right button of the
  **right** page while two markdown pages are open.
- `elements` on an open-but-inactive page reports everything invisible; `highlight` on the same
  surface brings it on screen and rings it — neither silently succeeds.
- Video, file diff and compare answer "what is playing", "which revisions is this diff between",
  "which pages are being compared" without `execute_script`.
- Everything `create_page`, `get_page_content` and `set_page_content` return is reachable through
  `pages` for every editor in the table.
- Typecheck, lint and production build pass; no tool removed and no `data-type` renamed.

## Needs user check (raised 2026-09-06, work continued under the agent's own assumption)

Nothing here blocked implementation; each was decided and the reasoning recorded. Listed so they
can be re-verified rather than rediscovered.

1. **`open_url` was scheduled for retirement on a false premise, and was not marked.** The roadmap
   said this epic retires "`open_url` for non-browser targets", but the tool has no non-browser
   branch at all — its handler calls `openUrlInBrowserTab` unconditionally
   (`src/renderer/api/mcp/page-commands.ts:192-202`). The planned `pages.openUrl` member does not
   exist. **Assumption taken:** `open_url` is wholly EPIC-089's, and only the other three tools were
   marked retirable. The correction and what EPIC-089 must decide are written into
   [agent-transparency-roadmap.md](../agent-transparency-roadmap.md), section "The `open_url`
   correction". If you disagree that this belongs to EPIC-089, that section is the one to change.

2. **The epic table's control counts were estimates and are now corrected.** Image fell 9 → 3 and
   video 14 → 10 because structural roots, status labels, transient menu roots, viewport gestures
   and generated native media controls are not curated controls; markdown, HTML and Monaco grew
   because shared `TextChromeView` contributions and the script panel belong to the editor facade
   under decision 8. **Assumption taken:** curated means *actionable, user-visible, app-owned*. The
   table's new last column records both numbers.

3. **Encryption exposes no password-taking member.** US-1312's plan proposed `encrypt(password)`
   and `decrypt(password)`; these were removed in review because a member that *accepts* a password
   writes a secret into agent call arguments and MCP transcripts, which is the roadmap's
   "a typed value is never readable" rule from the other direction. **Assumption taken:** only
   `showEncryptionDialog`, `encryptWithCurrentPassword` and `makeUnencrypted` are public. If you
   want scripted encryption with a supplied password, that is a deliberate reopening.

4. **Graph detail edits were left out.** Editing a node's id, title, properties and links stays
   UI-only; data edits go through `page.content`. **Assumption taken:** widening the private graph
   mutation models for no demonstrated agent scenario is not worth the surface. A scenario reopens it.

5. **The acceptance run covered the markdown surface only.** Text, media, diff and graph were
   verified directly through `call` during implementation but were not put in front of a Haiku
   agent. **Assumption taken:** the full five-file Haiku sweep is EPIC-090's, where the call-only
   flag makes it the real gate.

6. **`strictNullChecks` is off, so this epic's central invariant is unenforceable by the compiler.**
   `tsconfig.json` sets `noImplicitAny` but not `strict`, so a getter declared `: string` may return
   `undefined` and `npm run typecheck` passes. That is exactly how `MarkdownEditorFacade.html` came
   to declare `string` while returning `string | undefined` and while its canonical `.d.ts` said
   `html?: string` — three statements, two of them wrong, all green. Caught and fixed by hand here.
   **Assumption taken:** not this epic's problem to solve; turning on `strictNullChecks` across the
   codebase is a large, separate decision that is yours. But every "returns `undefined` when
   unavailable" member added by EPIC-086 rests on review discipline rather than on the compiler, and
   the next epic that adds facades inherits that exposure. Worth a task if you want it enforced.

## Notes

### 2026-09-06 — US-1312 to US-1317 implemented; the epic's acceptance run

Five surfaces landed in one overnight run (Codex from reviewed plans; `apply_patch` only, no
encoding damage in any of the five). Each was checked live through `call` before its commit:

- **US-1312 Monaco/text** — 12 page-scoped declarations, `text-run-script` and `text-toggle-script`
  visible on a JavaScript page and the other ten correctly false.
- **US-1313 preview family** — markdown's 7 controls, and `openSearch()` flipped the four `find-*`
  entries from invisible to visible in the same `elements` read, so the surface works as a UI
  regression test as well as an agent surface.
- **US-1314 media** — the pinned audio page answered `source`, `format`, `playerState` and
  `mediaMounted: false`, with the live media properties correctly absent rather than zeroed.
- **US-1315 diff** — a file-diff page answered `from` (a commit) and `to` (unstaged) directly, and
  `pages.compare.enter` on an ungrouped page threw "no grouped pair exists" rather than `false`.
- **US-1316 graph** — 33 declarations, no per-node selector, and `graph-detail-panel` correctly
  reporting `visible: true` while dimmed and empty.

**The plan reviews earned their cost.** Each of the five had at least one defect that would have
shipped: a null-host path returning `false` instead of `undefined`; password-taking members; a
fabricated `PageWrapper` code snippet citing a `"text-editor"` key that does not exist; a live-media
bridge built on a `data-part` DOM query; and three unresolved either/or questions in the graph plan.
The `data-part` one is the most instructive — it would have worked, and failed silently later.

**Acceptance run.** Haiku with `call` alone, two markdown pages open, passed both questions:
enumerated the page's capabilities from `page.editor`, and rang the correct page's control. One
finding acted on — the markdown `$help` never said the preview re-renders automatically, so the
agent spent two `helpSearch` calls hunting a refresh control that does not exist. Log:
[qa/runs/2026-09-06-epic-086-editor-surfaces.md](../../qa/runs/2026-09-06-epic-086-editor-surfaces.md).

**Tools marked retirable:** `create_page`, `get_page_content`, `set_page_content` — each path
exercised live first. `open_url` was **not** marked; see "Needs user check" item 1.

### 2026-09-05 — US-1311 implemented and checked live

Page-scoped elements landed (Codex, from the reviewed plan; `apply_patch`-only, no encoding damage
this time). The three `qa/surfaces/page.md` scenarios were run through `call` against the dev build:

- **Scoping.** Every selector on `tab`, `editorSwitches`, `panels` and the Monaco proof carries
  `[data-page-id="<id>"]`. An inactive markdown page reported its tab visible and its toolbar
  switch invisible; the active jsonl page reported all four Monaco controls invisible — correctly,
  since none of their conditions (script language, compare, html) applied.
- **Activate-then-highlight.** `pages[2].editorSwitches.highlight("page-editor-switch")` on the
  inactive page activated it (`page.id` flipped), the switch became `visible: true`, and one ring
  was drawn on the scoped selector.
- **Tab highlight does not activate.** `pages[3].tab.highlight("tab-language")` on the now-inactive
  page rang the tab and left `page.id` unchanged.

The plan review's one round-trip finding was real: the overlay scrolls its target with
`inline: "nearest"` unconditionally, which would have parked a centred tab back behind the sticky
pinned tabs; the tab node now passes `{ scroll: false }`. Dashboard: US-1311 stays `[ ]`
(implemented, review deferred to epic close per the epic model).

### 2026-09-05 — US-1310 implemented; the encoding incident

US-1310 landed (Codex, from the reviewed plan; 49 minutes). Live check through `call`: a video page
answers `pages[0].editor` with the generic facade (`id: "video-view"`, `name: "Video Player"`) and an
empty `editorSwitches.options`, as its toolbar shows; a markdown page lists `monaco`, `file-diff`,
`md-view` — the same three segments the widget draws. Zero `as*()` references remain outside release
history. Typecheck, lint and production build pass.

Two things went wrong on the way and are worth keeping:

- **The MCP call to Codex timed out after 30 idle minutes while Codex kept working.** The final
  report never reached Claude, and a monitor keyed on the session log's *mtime* fired early because
  Windows does not update mtime while the writer holds the file open. Watch the log's **size**.
- **Codex's bulk edits double-encoded every file they touched** — UTF-8 read as cp1252 and written
  back with a BOM — so `folder-structure.md` alone churned 1,856 lines of box-drawing characters it
  never meant to edit, and `PageToolbarView.ts` failed to parse. Repaired mechanically (reverse the
  cp1252 round-trip per line; a line that is already valid UTF-8 fails the reversal and is left alone),
  2,803 + 446 lines. Codex's own final verification pass then wrote clean output. Instruction for
  every later Codex thread in this epic: **edit through `apply_patch` only; never write files from
  PowerShell**, and the committer greps for `â€` before committing.

One small addition after the fact: every operation facade's `summarize()` now carries `id` and
`name` too — the generic facade did, the twelve real ones did not, so `pages[i].editor` on a markdown
page answered `{ MarkdownEditor, viewMounted }` without saying which editor it was.

### 2026-09-05 — design review before implementation
- The user reviewed the tree before task 1 was delegated and named the defect: `as*()` is the shape
  of an architecture Persephone no longer has, and the agent's tree should mirror the page the user
  sees. Two decisions followed — the redesign covers the **script API too**, with no compatibility
  kept, because there are no scripts to protect; and the epic's first task became the page node
  itself rather than the scoping mechanism.
- Verified before writing: the resolver's `provide()` (`resolver.ts:125`) would have allowed an
  agent-only divergence without touching scripts, and `AiRoot` already uses that pattern. It is not
  needed now and the decision above is the simpler one.
- Scope checked against the source: three of the ten surfaces have no facade at all (video, file
  diff, compare), and compare is not an editor, so decision 9 moves it to `pages` rather than
  inventing an `asCompare()` that one page could not answer.
- The user offered a separate epic for the facade rewrite, ahead of this one, and left the call to
  the agent. Kept inside EPIC-086 as US-1310: it is one task plus a documentation sweep, and every
  later task hangs off the node it produces, so splitting it would only add an epic's ceremony. What
  a separate epic *would* have bought — review before seven tasks build on it — is taken instead by
  running the completion skills on US-1310 alone as a **mid-epic review** the moment it lands, so
  the redesign is reviewed and documented before US-1311 starts.

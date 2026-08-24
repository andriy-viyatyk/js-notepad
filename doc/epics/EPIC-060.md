# EPIC-060: De-React Epic E2 — The embeddable bodies

## Status

**Status:** Active
**Created:** 2026-08-24
**Completed:**

## Overview

E1 ([EPIC-059](EPIC-059.md)) built the four seams an editor needs to reach the screen without React
and proved each on a small consumer. E2 is the first epic to spend them, and it spends them on one
coherent group rather than "whichever editor is next": **the five editors that supply
`EditorModule.Body`** — the chrome-free body another editor can embed.

Four of those five are still React (`grid`, `markdown`, `svg`, `html`); `mermaid` was converted in E1
as the `BodyView` arm's proof. Converting the remaining four lets the React `Body` contract be
**deleted from the registry**, which is a real collection off the removal ledger rather than another
deferral. It also lands the `hast → DOM` markdown renderer that three editors block on.

**Closing property, stated up front so it is falsifiable:** when E2 closes,
`EditorModule.Body?: React.ComponentType` no longer exists in `editors/base/editorRegistry.ts`, its
E1-9 normalization shim is gone, and the notebook per-note dispatch mounts `BodyView` directly.

## Why this group, and not "largest first"

The roadmap's suggested order is small-editor-first then large-editor-to-prove-scale, by line count.
That ordering was written before E1 measured the dependency structure, and line count turns out to be
the wrong axis for the *first* conversion epic. Three reasons this group wins:

1. **It closes a contract instead of shrinking a number.** Every editor conversion removes React from
   one editor. Only this group removes a React *type* from a shared registry — and a contract that
   still exists is a contract every later epic has to keep satisfying.
2. **Three editors are blocked behind one task in it.** `markdown`, `notebook` and `mcp-inspector` all
   wait on the `hast → DOM` renderer (roadmap open decision #1, §3.6; E1-5). It is the one item the
   roadmap itself says is worth pulling early, and its plan is already written and reviewed.
3. **The surface is small and the template already exists.** 1,627 `.tsx` lines of body code across
   nine files, and `mermaid`'s `MermaidBodyView` is a working example of the exact shape each of the
   four needs.

The large editors (`graph` 3,259 · `link-editor` 2,847 · `notebook` 2,001) are deliberately not here.
Two of the three also carry ledger entries of their own (`RenderGrid`, `RenderFlexGrid`, `highlight`'s
React form), so they are conversion *plus* collection work and belong in an epic scoped around that,
not bolted onto this one.

## The surface, measured (2026-08-24)

`editors/` is now **173 `.tsx` files, 27,838 lines** — down from E1's 180 / 28,640, the first
measurement in this programme to fall.

### What E2 converts

| File | Lines | What it is |
|---|---:|---|
| `markdown/MarkdownBlock.tsx` | 323 | react-markdown host: preprocessing, plugins, async git-root resolution, context menu, match counting, command queue |
| `markdown/MarkdownBody.tsx` | 256 | The `Body` itself |
| `markdown/CodeBlock.tsx` | 246 | `code`/`pre` overrides, Mermaid fences, image-copy helper |
| `markdown/MarkdownImage.tsx` | 55 | `img` override with copy/open toolbar |
| `grid/components/ColumnsOptions.tsx` | 394 | Columns popover — see Concern 1 |
| `grid/GridBody.tsx` | 129 | The `Body`; wraps the already-vanilla av-grid `DataGrid` |
| `grid/components/CsvOptions.tsx` | 107 | CSV options popover |
| `html/HtmlBody.tsx` | 76 | The `Body` |
| `svg/SvgBody.tsx` | 41 | The `Body`; wraps the already-vanilla `ImageViewport` |
| **Total** | **1,627** | plus the four `index.tsx` chrome shells (402 lines) which **stay React** — see E2-2 |

Local state in the group is small: `markdown` 6 `useState` / 8 `useEffect`, `grid` 2 / 4, `html` 0 / 3,
`svg` 0 / 0. Absorbed by each conversion per E1-7, not deferred.

### What E2 does *not* touch

- **The four `index.tsx` chrome shells.** They keep rendering `<TextChrome>` around
  `mountVanilla(BodyView, …)`. E1-8's asymmetry is the reason and it has not changed: a React parent
  hosting a vanilla child costs zero roots, a vanilla parent hosting React slot contributions costs
  one root per slot host. All **14** `<TextChrome>` call sites survive this epic by design. This epic
  converts leaves.
- **`notebook` itself.** Only its per-note dispatch (`note-editor/NoteItemActiveEditor.tsx`) is
  repointed, because that is the one consumer of the contract being deleted. See E2-3.
- **`react-markdown` and `hast-util-to-jsx-runtime` as packages.** They become collectable here;
  Epic F removes them. `scripting/api-wrapper/MarkdownEditorFacade.ts` mentions react-markdown only in
  a comment, so after US-1048 the renderer has zero importers.

## How this epic is being run — ORCHESTRATOR ONLY (Claude Code)

> **Codex: ignore this entire section.** It is the orchestrating agent's operating procedure, not task
> context, and acting on it would be wrong — it tells the reader to commit, to delegate work to Codex,
> and to make scope decisions. If a delegation prompt pointed you at this document, your scope is
> **only** the task document you were given plus the **Decisions** section below (E2-1 … E2-5), which
> is genuine design context. Skip from here to "## Decisions". Never commit, never run `/review`,
> `/document` or `/userdoc`, and never edit this file or `doc/active-work.md`.

*(User grant, 2026-08-24 — see E2-5. This epic is executed **autonomously**, delegating heavily to
Codex. If you are a fresh or post-compaction **Claude Code** agent picking this up, this section is
your operating procedure: follow it before reading anything else. It is recorded here rather than only
in the session because the session will be compacted and this document will not.)*

### The loop, per task

Work the first `Planned` task in [Linked Tasks](#linked-tasks) with no unmet ordering constraint:

0. **Scope what Codex is allowed to read.** Codex reads whatever you point it at, and the section
   above reads like instructions — so name the task document and, if epic context is needed, the
   **Decisions** section specifically. Never tell Codex to read this file in full.
1. **Delegate investigation** — thread A, per [`codex-dev`](../../.claude/skills/codex-dev/SKILL.md).
   Codex writes `doc/tasks/US-XXXX-short-name/README.md` per `.claude/rules/task-docs.md`. Always pass
   the `developer-instructions` that make it read `CLAUDE.md` in full — `AGENTS.md` is the only thing
   it gets for free. `approval-policy: never`, `sandbox: workspace-write`.
2. **Review the plan yourself.** The only undelegated step, and where the Claude budget goes. Verify
   load-bearing claims **against the source** — compile the claim, do not skim it. The findings that
   have mattered in this programme are always the same five shapes: a cited line that does not say
   what the plan claims; a stated invariant the code does not guarantee; a "matches current behaviour"
   claim where behaviour is the opposite; a cross-document conflict; a value that is
   `undefined`/async/identity-unstable where the plan assumes present/sync/stable.
3. **Send corrections to Codex** (same thread A), then read `git diff -- doc/tasks/<folder>/README.md`
   — the diff, not the document again.
4. **Delegate implementation to a fresh Codex thread.** Thread A is near its context limit by then and
   cannot be compacted over MCP. State in the prompt: no unit tests, do not commit, run
   `npm run typecheck` / `npm run lint` / `npm run build-prod` and fix what they report.
5. **Smoke-verify.** Confirm the three gates actually passed (re-run them yourself if Codex's summary
   is vague) and read only the files you flagged as risky in step 2. **Stage your own work first**
   (`git add` the task document and epic edits) so `git diff` is exactly Codex's output and
   `git diff --stat` is an honest scope check against the plan's Files Changed table — this is also
   what catches a file Codex touched that the plan never mentioned.
6. **Verify it runs.** E1's visual round found four defects, three of which passed structural MCP
   checks. So: assert `offsetWidth > 0` on a converted host rather than only its presence, and open at
   least one editor the task did not touch. Anything needing human eyes goes to
   [Testing owed](#testing-owed) — do not block on it.
7. **Commit** (one per task, message naming the task and what changed) and push. Mark the task `Done`
   and add a Notes entry for anything a later task needs.

### Standing rules for this epic

- **Commit per task, and push.** Authorised for EPIC-060 specifically; does not generalise.
- **Epic tasks stay `[ ]` on the dashboard.** No `/review`, `/document` or `/userdoc` per task — they
  are deferred to epic close and go to **Codex**, never a forked Claude subagent.
- **Keep the `doc/tasks/US-XXXX-*` folders.** One sweep at the end of the whole programme.
- **When a concern appears you are not confident about: ask Codex for its reasoning first**, then make
  the decision yourself and record it here with the reasoning, not just the verdict. It argues from a
  different starting point and has been right before in this programme. Do not defer to the user, and
  do not adopt Codex's answer without checking it.
- **Persephone is under your full control while this runs.** If it is unreachable over MCP, run the
  recovery in [`codex-dev` §5a](../../.claude/skills/codex-dev/SKILL.md): touch a main-process file to
  force a Vite rebuild and window restart; failing that, kill Vite and `npm start`. Two attempts is
  the budget. **Do not report a wedged renderer as a defect until a cold start reproduces it.**

## Decisions

### E2-1 — The epic is defined by the contract it deletes, not the editors it converts

Scope is "every provider of `EditorModule.Body`", which is a closed set the compiler can confirm:
`grid`, `html`, `markdown`, `svg` (React) and `mermaid` (already `BodyView`). This is what makes the
closing property above checkable rather than a judgement call, and it is why `notebook` — 2,001 lines
and an obvious neighbour — is out of scope even though one of its files is edited.

The alternative framing considered and rejected was "convert the four smallest editors". It scores the
same on lines and leaves the registry contract standing, so a later epic would have to re-derive why
the `Body` arm exists before it could remove it.

### E2-2 — The chrome shells stay React; E1-8 is re-affirmed, not re-litigated

E1-8 established that converting `editors/base` chrome ahead of its call sites would create up to six
React roots per open editor against one today, because every chrome component carries React subtree
slots. Nothing in E2 changes that: converting `svg`'s 93-line shell would turn its toolbar
contributions into `fill-slot` React roots. Each converted editor here therefore ends as **one React
root for the chrome, zero for the body** — no worse than today and strictly better per editor.

Consequence, stated plainly so it is not mistaken for a shortfall at close: E2 reduces the
`<TextChrome>` call-site count by **zero**. The chrome drains in the epic that owns the last shell.

### E2-3 — Deleting the `Body` arm inverts the E1-9 shim rather than removing a capability

`editorRegistry.loadModule` currently normalizes upward: if a module supplies `BodyView` and no
`Body`, it synthesizes `Body = mountVanilla(BodyView)` so React consumers need no change
(E1-9, `editorRegistry.ts:316-322`). With all five providers on `BodyView` that shim has no input, and
its one consumer — `NoteItemActiveEditor.tsx:73,85`'s `EmbeddedNoteEditor`, which reads `module.Body`
and renders `<Body model={editor} editorConfig={…} />` — calls `mountVanilla(module.BodyView, …)`
instead.

That consumer stays a React component. This is the free direction from E1-8, so no root is added and
`notebook` does not need converting for the contract to go.

### E2-4 — US-1048's plan is inherited as written and re-checked, not re-investigated

The plan at [`US-1048`](../tasks/US-1048-hast-dom-markdown/README.md) was investigated and corrected
inside E1 (E1-10, E1-12): the walker is hand-written, `hast-util-to-dom` is **not** adopted, `input`
and `a` become rehype HAST rewrites, and only `code`/`pre`/`img` need a substitution seam. Four
transitive packages are promoted to direct dependencies (`unified`, `remark-parse`, `remark-rehype`,
`property-information`).

It goes to implementation directly. What is owed first is a **re-check of its version and line-number
claims** against the current tree, since it was written against `editors/markdown` before E1's later
tasks landed — not a fresh investigation.

### E2-5 — Autonomy is granted for this epic, and Codex carries the load

*(Superseded 2026-08-24 by a direct user grant, hours after this section was first written to say the
opposite. Both states are kept: the original text is the correct **default**, and the grant below is
the exception. A later epic inherits the default, not the exception.)*

The user's instruction: *"please proceed with epic implementation autonomously. Use codex havily."*
So E2 runs like E1 did — per-task commits, no per-step review, decisions made and recorded here rather
than deferred upward — with one added emphasis: **delegate more, and delegate earlier.** Investigation
and implementation both go to Codex per [`codex-dev`](../../.claude/skills/codex-dev/SKILL.md). The
Claude budget is spent on reviewing plans against the source, on the decisions in this section, and on
the defects the user reports — nothing else.

The rest of E1's operating procedure carries unchanged, because it is project rule rather than
epic-specific permission: tasks stay `[ ]` on the dashboard, `/review` + `/document` + `/userdoc` are
deferred to epic close and go to **Codex** never to a forked Claude subagent, and the
`doc/tasks/US-XXXX-*` folders are kept for the whole programme.

## Rule 4 — the measured number

> **GATE — CLEARED 2026-08-24, before any US-1048 code.** Baseline recorded below. Do not re-open it.

**Metric, as originally specified:** DOM writes counted by `MutationObserver` (EPIC-053's method)
while rendering one fixed markdown document, react-markdown versus the `hast → DOM` walker. The fixed
input is [`rule4-fixture.md`](../tasks/US-1048-hast-dom-markdown/rule4-fixture.md), which is part of
the measurement and must not be edited — it covers headings, inline marks, nested lists, task-list
checkboxes, a table, three fence kinds, raw HTML and relative links, and deliberately contains **no
mermaid fence** because mermaid renders asynchronously to an image and would make the count
non-deterministic.

**Metric revised, for a reason worth writing down: `MutationObserver` cannot measure a React initial
mount.** Taking the baseline produced `1,050` mutations on `document.body` and **zero** inside
`.markdown-block`, against a subtree that demonstrably contains 254 elements. React 19 assembles a
new subtree **detached** and attaches it with a single insertion, so from the observer's seat an
entire markdown render is one `addedNodes` entry on the parent. EPIC-053's method is sound for
*updates* to a mounted tree and blind to the mount itself. Anyone reaching for it on a conversion that
replaces a first render should reach for something else — this is the general lesson, not a
markdown-specific one.

DOM-API call counters (patching `createElement`/`createTextNode`/`appendChild`/`insertBefore`/
`setAttribute`/`removeChild`) do see detached construction, and were tried second: `1,100` calls for
the fixture's open. They were rejected as the headline anyway, because the number is dominated by
page-open chrome that US-1048 does not touch, and a control-subtraction design needs the page closed
and reopened per sample — which did not hold across samples in practice.

**So the headline is an exact count, not a benchmark** — the same move E1 made when its typing metric
turned out to measure Monaco instead of us (EPIC-059, "Metric revised"). What US-1048 removes is
countable exactly:

**React elements created per render of the fixture: 254 → 0.**

`hast-util-to-jsx-runtime` creates one React element per HAST node, so the count is the rendered
element count: **254 elements per `.markdown-block`**. After US-1048 the walker writes DOM nodes
directly and creates none. The DOM output is unchanged by design — both implementations must build the
same tree — so this is precisely the reconciliation layer, with no error bars.

The count is *per live render*, and one open document can occupy more than one live render — see the
slot note below. Multiply if you want a whole-app figure; the per-render number is the one that
isolates the renderer.

The secondary numbers are counts too: React roots per open `grid`/`markdown`/`svg`/`html` editor
(1 → 1, unchanged by design per E2-2), and React contracts removed from `editorRegistry.ts`
(1 — the `Body` arm, US-1054).

**Measured baseline, on React, 2026-08-24:**

| Quantity | Value |
|---|---:|
| Elements in one rendered `.markdown-block` (fixture) | 254 |
| React elements created per render | **254** |
| `MutationObserver` mutations inside `.markdown-block` during mount | 0 *(instrument blind, see above)* |
| DOM-API calls during the fixture's page open | 1,100 |

**Corrected 2026-08-24 — the "renders twice" reading was wrong, and the correction is instructive.**
The first pass observed two `.markdown-block` subtrees with identical element counts for one document
and recorded a ×2 multiplier as a property of md-view. It is not: the duplication comes from
**page-manager slots** — a document can be held by a retained slot and by a grouped-pane peer at the
same time — so the pair was two slots showing one document, which is also why the two copies had
different widths (1,362px and 799px: two panes of a grouped page). Re-checked afterwards with the
group closed: still two subtrees, both the fixture, both hidden, both 254 elements.

So the renderer renders once per slot, and the honest headline is the per-render count. The lesson is
the same one the `MutationObserver` finding taught, one level up: **an observation about a shared host
is not a finding about the component inside it.** Both mistakes came from measuring the page instead
of the renderer.

## Linked Tasks

| Task | Title | Status |
|------|-------|--------|
| US-1051 | Convert the `svg` and `html` bodies to `BodyView` — the two trivial twins; `MermaidBodyView` is the template | **Done** |
| US-1048 | `hast → DOM` markdown renderer; `MarkdownBlock` to vanilla; `a` and `input` overrides become rehype plugins | **Done** |
| US-1052 | Convert the `markdown` body: `MarkdownBody`, `CodeBlock`, `MarkdownImage` | Planned |
| US-1053 | Convert the `grid` body: `GridBody`, `ColumnsOptions`, `CsvOptions` | Planned |
| US-1054 | Delete the React `Body` arm: repoint `NoteItemActiveEditor` to `BodyView`, remove `Body` and the E1-9 normalization shim | Planned |

**Ordering constraints.** US-1048 precedes US-1052 (the renderer is what `MarkdownBody` renders
through). US-1054 is last — it cannot land until all four providers are on `BodyView`. US-1051 and
US-1053 are independent of everything else and of each other. Take the Rule 4 baseline before US-1048.

**US-1051 is first on purpose.** It is the cheapest possible exercise of the `BodyView` seam by a
second and third consumer, so if E1's seam has a gap it surfaces in 117 lines rather than inside the
largest task in the epic.

## Concerns

1. ~~**`ColumnsOptions.tsx` is the largest single file in the epic (394 lines) and is a popover, not a
   body.**~~ **Resolved 2026-08-24, and it shrinks the epic.** Both popovers are shell-owned:
   `grid/index.tsx:59` calls `showColumnsOptions` and `grid/index.tsx:74` calls `showCsvOptions`, both
   from the toolbar. So `ColumnsOptions.tsx` (394) and `CsvOptions.tsx` (107) stay React until the
   chrome epic, and **US-1053 converts only `GridBody.tsx` (129 lines)** — not 630. `uikit/DataGrid/`
   already has a `DataGridView.ts` beside its React face, so the body mounts the vanilla grid directly
   rather than a React adapter. The epic's converted surface drops from 1,627 lines to **1,126**.
2. **The markdown walker has no test net and this project has no unit tests.** Its correctness surface
   is every markdown document a user opens. Verification is by rendering a corpus and comparing DOM
   shape against the react-markdown output; US-1048's plan must name which documents, and this is a
   strong candidate for a Testing-owed row.
3. **Four packages become direct dependencies.** Rule 2 is satisfied because all four are already
   installed transitively and nothing new enters the tree — but the promotion should be recorded, and
   `hast-util-to-dom` staying *un*adopted is the load-bearing half of E1-10.

## Testing owed

Checks that need human eyes. Every row is cleared with the user **before this epic closes** — an
unchecked row blocks completion, it is not a footnote. Add a row the moment something is deferred.

E1's visual-testing round found four defects, three of which the structural MCP checks had passed
clean. Two cheap additions it earned, to be applied to every task here: assert `offsetWidth > 0` on a
converted host rather than only its presence, and open at least one editor the task did not touch.

| Task | What to look at | How to reach it |
|---|---|---|
| *(none yet)* | | |

## Notes

### 2026-08-24

- Epic opened and scoped. `editors/` re-measured at **173 `.tsx` files / 27,838 lines**, down from
  E1's 180 / 28,640 — the first inherited count in this programme to *fall*, and the reason is E1
  itself: converted views moved from `.tsx` to `.ts`.
- Verified at open against the source rather than E1's prose: the `Body` provider set is exactly
  `grid`, `html`, `markdown`, `svg` (React) plus `mermaid` (`BodyView`); the arm's only consumer is
  `NoteItemActiveEditor.tsx:73,85`; the E1-9 shim is `editorRegistry.ts:316-322`; and `<TextChrome>`
  still has exactly **14** JSX call sites — the other files matching `TextChrome` reference it in
  comments or types — so E1's figure holds.
- The `highlight` React-form ledger entry also holds unchanged: `GraphBody`, `LinksList`,
  `LinkCategoryPanel`, `ExpandedNoteView`, `NoteItemView` — none of them in this epic's scope.
**US-1051 — the seam held, and the review round earned its keep.** Both bodies converted with no
change to their `index.tsx` chrome shells (E2-2) and no registry change (E2-3): `editorRegistry`
synthesizes `Body` from `BodyView` for both, verified live, so notebook's per-note dispatch keeps
working untouched. Verified on a live page rather than structurally — `svg-root` 1530×962 with the
image at its natural 240×140, the HTML iframe 1530×962 with `sandbox` exactly `allow-scripts`, and
both confirmed by screenshot.

Three things worth carrying into US-1052/1053:

1. **`sandbox` must be set on the detached root, not in `onMount`.** `mount.tsx:34,37` appends the view
   root to the live DOM *before* calling `mount()`, so an iframe that gets `srcdoc` before `sandbox`
   inside `onMount` would navigate once unsandboxed. React never had this problem because it sets both
   attributes on a detached element. Any converted view whose root has security- or
   layout-critical attributes must set them in the constructor.
2. **`ComponentQueue.subscribe` drains synchronously on subscribe** (`ComponentQueue.ts:33-35`) — it is
   not change-only like a state subscription. So a queue subscription must come *after* the children
   its handler touches are mounted. Ordering in `onMount` is: mount children → bind state → subscribe
   queues.
3. **A write that looks idempotent may not be.** The first implementation assigned `iframe.srcdoc` on
   every `onUpdate`; assigning `srcdoc` *navigates*, and `onUpdate` fires on every shell re-render, so
   the preview would have reloaded (losing scroll position, re-running scripts) on updates that never
   touched the content. React only wrote the attribute when the value changed. `HtmlBodyView` now
   guards on the last applied value. **When translating React to a vanilla view, every DOM write
   inherits React's "only if changed" for free and loses it on conversion** — the ones that hurt are
   those with side effects beyond their value.

**US-1048 — the renderer landed, and `react-markdown` now has zero runtime importers.** The walker is
`markdown/hast-dom.ts` (161 lines, hand-written, `hast-util-to-dom` not adopted per E1-10);
`MarkdownBlockView.ts` replaces the react-markdown host, `CodeBlock` and `MarkdownImage` became vanilla
`.ts` views, and `input`/`a` became `rehypeMarkdownOverrides.ts` HAST rewrites. `MarkdownBlock.tsx` is
now a nine-line `mountVanilla` face, so its four React call sites in `log-view` and `mcp-inspector` did
not change. Four transitive packages were promoted to direct (`unified`, `remark-parse`,
`remark-rehype`, `property-information`).

**Verified against the recorded baseline, which is what made this checkable.** The fixture rendered
**253** elements against the pre-conversion **254**, and every structural count matched exactly —
1 `h1`, 8 `h2`, 5 table rows, 3 `pre`, 3 `code-block-wrapper`s, 3 copy buttons, 14 `li`, 4 `ul`,
2 `ol`, the raw-HTML `div[align=center]`, 3 task-list SVG icons, and **0 leftover `input` elements**
(the `input` override really did become a rehype rewrite). The single-element delta is inside the 99
Monaco colorization `span`s in the first fence — tokenizer output, not document structure. Both paths
were then confirmed on screen: the full-page editor, and the `compact` React-adapter path via a
`ui_push` markdown entry in Log View.

`react-markdown` and `hast-util-to-jsx-runtime` are now **collectable** — no importer remains outside
one explanatory comment in the walker. Removing the packages is Epic F's, not this epic's.

- `svg` and `html` are both thin bodies over a single host element with no React state: `SvgBody`
  renders the already-vanilla `ImageViewport` from a recomputed data URL and hands its model up via
  `imageModelSetter` — the exact shape `MermaidBodyView` converted in E1 — while `HtmlBody` is a
  sandboxed `<iframe srcDoc>` plus an injected click/pointerdown script, whose only React machinery is
  a `useMemo` on the content and a `useRef` reporting the live iframe to the model. This is why they
  are one task and why they go first.

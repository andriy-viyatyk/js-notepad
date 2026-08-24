# EPIC-059: De-React Epic E1 — Editor foundations

## Status

**Status:** Active
**Created:** 2026-08-24
**Completed:** —

## Overview

Epic E is 180 `.tsx` files and 28,640 lines — the largest surface in the programme, and the only one
the roadmap describes as *open-ended by design*: one editor per task, in any order. That description
is right about the editors and wrong about what sits under them. **Nothing in `editors/` can be
converted today, because there is no seam through which a vanilla editor can be registered, mounted,
or given chrome.** `EditorModule.Component` is typed `React.ComponentType`,
`AsyncEditorView.renderEditor` creates a React root unconditionally, `<TextChrome>` wraps 14 editors
as JSX, and 12 editors render Monaco through a React lifecycle wrapper.

EPIC-059 builds that seam and proves it on four small editors — one per chrome shape, two of them
going fully vanilla. It converts no large editor. Its
whole purpose is that every epic after it can convert one editor per task with no shared work left to
negotiate — which is the property the roadmap assumed Epic E already had.

Epic D ([EPIC-058](EPIC-058.md)) left the shell vanilla and the application root flipped, so every
primitive these editors consume already exists as a vanilla view.

## What the investigation at epic open established

Six things. The first is the reason this epic exists at all.

**1. `editors/` contains zero vanilla code — and no way to add any.** Not one of the 180 `.tsx` files
references `VanillaView`, and `mountVanilla`/`mountReact` appear nowhere in the folder. That is not
merely "unconverted": the two registration contracts an editor reaches the screen through are both
React-typed, and `ui/app/AsyncEditorView.ts:85-95` wraps `module.Editor` in
`React.createElement(EditorErrorBoundary, …)` with no alternative branch. A vanilla editor written
today could not be registered, and if registered could not be mounted.

| Contract | File | React-typed as | Providers |
|---|---|---|---:|
| Editor module | `editors/base/editorRegistry.ts:28` | `Component: React.ComponentType<{model}>` | **31** |
| Embeddable body | `editors/base/editorRegistry.ts:36` | `Body?: React.ComponentType<{model, editorConfig?}>` | **5** (grid, markdown, svg, mermaid, html) |
| Lazy editor module | `editors/types.ts:4-10` | `FileEditorComponent = React.ComponentType` | — |
| Secondary view | `ui/secondary-views/secondary-view-registry.ts:36` | `loadComponent: () => Promise<{default: React.ComponentType<SecondaryViewProps>}>` | **14** editor-owned |

**2. `@monaco-editor/react` is 18 importers, and only 12 of them are React.** The roadmap called the
wrapper "trivial — lifecycle only". That is right, and the measurement makes it cheaper still:

| Import | Files | What it is |
|---|---:|---|
| `Editor` / `DiffEditor` | **12** | The React component — the actual work |
| `Monaco` (type) | 5 | `typeof monaco`, in `api/setup/monaco-languages/*` |
| `loader` | 1 | `configure-monaco.ts:2` |

`monaco-editor` is already a direct dependency at 0.55.1, and `configure-monaco.ts` **already imports
it directly** (`import * as monaco from "monaco-editor"`) and computes `type Monaco = typeof monaco`
locally at line 16. Its one call, `loader.config({ monaco })`, exists solely to hand the React wrapper
the monaco instance the file already has. So the six non-component importers are free: the type
repoints to `monaco-editor`, and the `loader.config` line is *deleted*, not replaced.

**3. `react-markdown` has exactly one importer.** `editors/markdown/MarkdownBlock.tsx:1`. Roadmap
§3.6's plan — keep `remark`/`rehype`, replace only the final `hast → JSX` step — is confirmed against
`node_modules`: `unified` 11.0.5, `remark-parse` 11.0.0, `remark-rehype`, `mdast-util-to-hast` 13.2.1,
`hast-util-raw` 9.1.0 and `property-information` are all present. **What §3.6 did not say is that they
are present only as transitive dependencies**, so the conversion declares four of them directly —
`unified`, `remark-parse`, `remark-rehype`, `property-information` (`remark-gfm` and `rehype-raw`
already are). `hast-util-to-dom` is **absent, and is not adopted** — see E1-10, which settles the
walker in favour of a hand-written one and holds the epic at zero new dependencies. Eight files
consume `MarkdownBlock` and its props do not change.

**4. Epic P's payoff did not reach `editors/`.** Unlike Epic D — which found 7 `useState` in 9,192
lines — the editors hold **107 `useState`, 153 `useEffect`, 148 `useRef`** across 180 files. Epic P's
task 2 named `graph/GraphDetailPanel.tsx` (11), `notebook/ExpandedNoteView.tsx` (5) and
`graph/GraphBody.tsx` (5) as the worst offenders and those are now at 0, 0 and 3, so the lifting
happened where it was scheduled; it was simply never scheduled across the long tail. The consolation
is that the residue is flat — the worst file now holds **4** — so no single editor carries a
state-excavation problem. `forwardRef` and `useImperativeHandle` are at **0**, and there are **no
React contexts** in `editors/` at all. Where this state goes is settled by **E1-7**: it is absorbed by
each editor's own conversion, not deferred to an epic that does not exist.

**5. Emotion never enters `editors/`, and it is not because the styles were converted.** Zero Emotion
importers, 4 `.css` files, and **103 literal `style={{…}}` sites across 35 files** — measured
geometry, third-party handles and content presentation, which
[styling-inventory.md](../architecture/styling-inventory.md) already classifies as legitimately
editor-local. Epic A's token work is therefore not a prerequisite for any editor, and Epic F's Emotion
uninstall does not wait on Epic E.

**6. The removal ledger's editor-owned entries are smaller than they read.** Of the 13 app-layer
`uikit/RenderGrid` importers, only **four render a React component** — `LinksList.tsx` and
`LinksTiles.tsx` (`RenderGrid`), `LogBody.tsx` and `NotebookBody.tsx` (`RenderFlexGrid`). The other
nine import `RenderGridModel` or a type. `RenderGridModel` is itself React-coupled
(`import React, { CSSProperties, HTMLAttributes }` at line 1), so those nine are not free — but they
are model-level repointings rather than render conversions, and none of them belongs to this epic.

Separately, **a vanilla `Panel` already exists**: `uikit/Panel/panel-style.ts` exports
`createPanelElement`, used at 84 sites after Epic D. The ledger says Panel got no vanilla twin; that
was true when C1 wrote it and is not true now. The 636 `<Panel>` tags in `editors/` therefore convert
mechanically alongside their editors, with no design work owed.

## The surface, measured

Measured at `714e4133` (`Complete US-1040`), from the repository root.

| | Roadmap §2 | Measured | Delta |
|---|---:|---:|---:|
| `editors/` `.tsx` files | 181 | **180** | −1 |
| `editors/` `.tsx` lines | 28,203 | **28,640** | +437 |

The fourth inherited figure in this programme to survive a re-measure, and the closest yet in
percentage terms (+1.5%). Note there are **no story files in `editors/`** — the 180 are all
production — and a further 142 `.ts` files that are already React-free.

### By editor, `.tsx` lines (the conversion surface)

`.ts` lines are shown because they are the part that does *not* move, and they are why the largest
editors are not the largest conversions.

| Editor | `.tsx` | files | `.ts` | Notes |
|---|---:|---:|---:|---|
| graph | 3,259 | 8 | 4,725 | Largest; more logic already in `.ts` than view |
| link-editor | 2,847 | 16 | 1,798 | 2 of the 4 `RenderGrid` renderers; 4 secondary views |
| notebook | 2,001 | 11 | 1,590 | `RenderFlexGrid`; the `Body` dispatch; `MiniTextEditor` |
| rest-client | 1,978 | 7 | 1,544 | 2 Monaco `Editor` sites |
| browser | 1,692 | 9 | 3,391 | Last `@floating-ui/react` importer |
| log-view | 1,661 | 21 | 681 | `RenderFlexGrid`; `MarkdownOutputView` |
| mcp-inspector | 1,630 | 8 | 1,263 | 3 Monaco sites; consumes `MarkdownBlock` |
| git-tree | 1,502 | 7 | 522 | `DiffEditor` |
| board | 1,022 | 9 | 2,409 | Webview host |
| video | 1,006 | 6 | 1,062 | |
| markdown | 954 | 5 | 416 | Blocked on the `hast → DOM` renderer |
| settings | 813 | 8 | 316 | |
| grid | 787 | 4 | 1,123 | `Body` provider |
| explorer | 670 | 3 | 371 | 3 secondary views |
| board-info | 665 | 3 | 738 | |
| mneme-config | 607 | 4 | 733 | |
| base | 541 | 5 | 1,528 | The shared chrome — deliberately **not** converted here (E1-8) |
| text | 442 | 1 | 1,234 | The default editor; `ScriptPanel` |
| *(19 smaller)* | 4,563 | 45 | 5,196 | mermaid 222 · svg 134 · compare 108 · image 105 · … |

### What leaves with this epic

| Surface | Now | After EPIC-059 |
|---|---:|---|
| `editors/` files that can host a vanilla view | **0** | all of them (seam) |
| `@monaco-editor/react` importers | 18 | **11** (6 repointed, `compare` converted) |
| `react-markdown` importers | 1 | **0** |
| React roots created per open editor | 1 | 0 for a converted editor |
| Editors fully vanilla | 0 | **2** (`toolset`, `compare`) — the chrome-free shape |
| Editors partly vanilla (body/actions inside a React chrome shell) | 0 | 2 (`image`, `mermaid`) |
| New dependencies added | — | **0** (E1-10); 4 transitive packages declared direct |
| `editors/base` chrome | React | **unchanged, deliberately** — drains with its call sites (E1-8) |

## How this epic is being run — ORCHESTRATOR ONLY (Claude Code)

> **Codex: ignore this entire section.** It is the orchestrating agent's operating procedure, not task
> context, and acting on it would be wrong — it tells the reader to commit, to delegate work to Codex,
> and to make scope decisions. If you were pointed at this document by a delegation prompt, your scope
> is **only** the task document you were given plus the **Decisions** section below (E1-1 … E1-10),
> which is genuine design context. Skip from here to "## Decisions". Never commit, never run
> `/review`, `/document` or `/userdoc`, and never edit this file or `doc/active-work.md`.

*(User decision, 2026-08-24. This epic is executed **autonomously**: the user is not reviewing each
step. If you are a fresh or post-compaction **Claude Code** agent picking this up, this section is your
operating procedure — follow it before reading anything else. It is recorded here, not only in the
session, because the session will be compacted and this document will not.)*

### The loop, per task

Work the **first `Planned` task** in [Linked Tasks](#linked-tasks) that has no blocking predecessor
(see the ordering constraints below the table). For each one:

0. **Scope what Codex is allowed to read.** Codex reads whatever you point it at, and this document's
   procedure section reads like instructions — so a delegation prompt must name the task document and,
   if epic context is needed, the **Decisions** section specifically. The fence at the top of this
   section exists for the case where it reads the whole file anyway. Never tell Codex to "read
   EPIC-059.md in full."
1. **Delegate investigation to Codex** — thread A, per [`.claude/skills/codex-dev`](../../.claude/skills/codex-dev/SKILL.md).
   Codex writes `doc/tasks/US-XXXX-short-name/README.md` following `.claude/rules/task-docs.md`.
   Always pass the `developer-instructions` that make it read `CLAUDE.md` in full; `AGENTS.md` is the
   only thing it gets for free. `approval-policy: never`, `sandbox: workspace-write`.
2. **Review the plan yourself.** This is the only step that is not delegated, and it is where the
   Claude budget is meant to go. Verify load-bearing claims **against the source** — compile the claim,
   do not skim it. The findings that have mattered in this programme are always the same five shapes: a
   cited line that does not say what the plan claims; a stated invariant the code does not guarantee; a
   "matches current behaviour" claim where behaviour is the opposite; a cross-document conflict; a
   value that is `undefined`/async/identity-unstable where the plan assumes present/sync/stable.
3. **Send corrections to Codex** (same thread A), then read `git diff -- doc/tasks/<folder>/README.md`
   — the diff, not the document again.
4. **Delegate implementation to a fresh Codex thread.** Thread A is near its context limit by then and
   cannot be compacted over MCP. State in the prompt: no unit tests, do not commit, run
   `npm run typecheck` / `npm run lint` / `npm run build-prod` and fix what they report.
5. **Smoke-verify** — confirm the three gates actually passed (re-run them yourself if Codex's summary
   is vague), and read only the files you flagged as risky in step 2.

   **Isolate Codex's changes with the index** *(user tip, 2026-08-24)*. Before handing off, `git add`
   everything you wrote yourself — the task document, epic edits, notes. Then Codex's implementation is
   the **only** thing in the unstaged working tree, so `git diff` is exactly its output and
   `git diff --stat` is an honest scope check against the plan's Files Changed table. Without this, your
   own doc edits are mixed into the same diff and you end up re-reading your own prose to find its code.
   It also catches the quiet failure mode: a file Codex touched that the plan never mentioned shows up
   immediately instead of at review time.
6. **Commit.** One commit per task, message naming the task and what it changed. Push.
7. Mark the task `Done` in the table and add a Notes entry for anything a later task needs to know.

### Standing rules for this epic

- **Commit per task, and push.** The user has authorised this for EPIC-059 specifically. It does not
  generalise past this epic.
- **Epic tasks stay `[ ]` on the dashboard.** Do **not** run `/review`, `/document` or `/userdoc` per
  task — they are deferred to epic close (CLAUDE.md, deferred review model). When they do run, they go
  to **Codex**, never to a forked Claude subagent.
- **Keep the `doc/tasks/US-XXXX-*` folders.** Roadmap Rule 8 — one sweep at the end of the whole
  De-React programme, not at task or epic close.
- **When a concern appears that you are not confident about: ask Codex for its reasoning first.** It is
  the simpler model, but it argues from a different starting point and has been right before in this
  programme. Take its reasoning as input, then **make the decision yourself** and record it in this
  document with the reasoning — not just the verdict. Do not defer the decision to the user, and do not
  adopt Codex's answer without checking it.
- **Persephone is under your full control while this runs.** Nothing unsaved is in it, and the user can
  reopen any page including pinned ones. If it is unreachable over MCP, run the recovery in
  [`codex-dev` §5a](../../.claude/skills/codex-dev/SKILL.md): touch a main-process file to force a Vite
  rebuild and main-window restart; if that fails, kill Vite and `npm start` fresh. Two attempts is the
  budget — then stop and wait. **Do not report a wedged renderer as a defect until a cold start
  reproduces it.**
- **Visual verification with no user present.** Assume there is none: the user has stated the laptop
  screen will usually be locked and the Persephone window not visible while this epic runs. Do what you
  can yourself through the `browser_*` and `execute_script` MCP tools — a locked screen does not stop
  MCP, so DOM assertions, `data-name` checks and script-driven state changes all still work. For
  anything that genuinely needs human eyes (does it *look* right, is the spacing wrong, does the
  animation stutter), **do not block and do not wait**: append a row to
  [Testing owed](#testing-owed) and carry on to the next task. The user clears the whole backlog in one
  pass before the epic closes.

### Testing owed

Checks that need human eyes, deferred by the rule above. Every one of them is cleared with the user
**before this epic closes** — an unchecked row is a blocker for epic completion, not a footnote. Add a
row the moment you defer something; do not batch them up at the end from memory.

| Task | What to look at | How to reach it |
|---|---|---|
| US-1043 | The **compare editor**'s appearance: the two file-path labels ellipsizing on the *left* (`dir="rtl"`), the `→` separator between them, toolbar background/border, and the exit button. Structure was verified over MCP (both labels present with `dir="rtl"` and full-path `title`, `.toolbar-root` with `role="toolbar"`, `data-name="compare-exit"`, one `.monaco-diff-editor`, `→` present) — what is owed is only the visual judgement that it matches the React version. | Group two files and enter compare mode (or run `app._pages.openDiff({firstPath, secondPath})` from a script). |
| US-1042 | The converted **toolset editor** rendered on screen: header row (icon · title · Registered/Not-registered badge · Refresh pushed to the far right by the spacer), the Open Folder / Open Log buttons, and either the manifest-error list or the `Tools (n)` cards. Compare against the React version in `git show 8ed0ee0b:src/renderer/editors/toolset/ToolsetEditorView.tsx`. | Sidebar → Agent Tools → click a registered toolset. **Could not be reached autonomously:** the editor is only routed to from the registered-toolset list, and `create_toolset` requires a human confirmation prompt to register, so no toolset could be created without you. Everything reachable without one was verified — see the Notes entry for US-1042. |

## Decisions

### E1-1 — Epic E is split, and this is the first of its epics

Epic C was split four ways at 14,671 lines. Epic E is 28,640 and the roadmap left it as one
open-ended epic on the argument that editors are independent, lazily-imported units. Finding 1 is the
counter-argument: the editors are independent of *each other* and jointly dependent on four shared
seams, none of which exists. An open-ended epic that must deliver those seams before its first task
can start is two epics wearing one number, and Rule 4 ("one measured number per epic") cannot be
satisfied by an epic with no closing date.

So: **EPIC-059 is Epic E1 — foundations. Editor conversions land in later epics, scoped and
re-measured when each opens.** Deliberately *not* decided here: how many later epics, or which
editors group together. Every epic in this programme that inherited a downstream scope had to
re-measure it (C2 moved three components out of itself, C3 overturned four of its inherited figures,
C4 four more), and fixing E2's boundary now would be the fifth instance. The one thing worth
recording is the natural grouping the measurement suggests: the four `RenderGrid`/`RenderFlexGrid`
renderers (`link-editor`, `log-view`, `notebook`) want to be together, and `markdown`, `notebook` and
`mcp-inspector` all follow this epic's `MarkdownBlock`.

This is a recommendation rather than a user decision, and it is cheap to reverse: renaming the epic
back to "Epic E" changes nothing in its task list.

### E1-2 — Every seam ships with its first consumer in the same task

An additive vanilla arm on a React-typed registry, with no editor using it, is speculative
infrastructure — a shape this programme has rejected twice during EPIC-058 review. So each seam task
converts one real editor through the seam it adds:

The pilots were first chosen as "the three smallest editors". Measuring the chrome (E1-8) gave a better
reason: **the editor population splits three ways by which shared chrome wraps it, and each shape
converts differently.** One pilot per shape.

| Shape | Editors | Pilot | What it proves |
|---|---:|---|---|
| No shared chrome | rest | **toolset** (167 lines, 2 files) | The registry's vanilla `View` arm end to end — the whole editor goes vanilla, no React anywhere in it |
| Renders `<PageToolbar>` directly | **6** | **image** (105 lines) | Vanilla body *and* vanilla toolbar contributions inside a React chrome shell — the shape 6 editors will use |
| Wrapped in `<TextChrome>` | **14** | **mermaid** (222 lines) | The same shape one level deeper, plus the `Body` arm; also the `pre` override the markdown renderer needs |

Plus **compare** (108 lines, chrome-free) as US-1043's Monaco-host consumer — the second editor to go
fully vanilla.

**`image` cannot be the seam's pilot, and that changed the plan.** The first draft named it for
US-1042 on the strength of being the smallest editor. Reading it disqualifies it twice over:
`ImageView.tsx:60` renders `<PageToolbar>`, so per E1-8 the editor keeps a React shell and is
therefore still registered through the **React** `Component` arm — it cannot exercise the vanilla arm
US-1042 ships, which violates E1-2's own rule. And of its 72 lines, roughly 45 are toolbar
contributions and the body is the single `<ImageViewport>` line, so "convert the body" would have
delivered almost nothing.

`toolset` replaces it as the seam pilot and is better on every axis: chrome-free and Monaco-free, so
the whole editor converts; 167 lines across 2 files; pure UIKit composition (`Panel`, `Text`,
`Button`, `IconButton`, `Spacer` — all converted in C1); and **two independent reactive sources**
(`model.state.use` over five fields, plus `toolsTrust.useIsTrusted`), so it exercises `bind()`
properly rather than rendering once.

`image` keeps a task of its own, correctly described: it proves the chrome-shell shape and collects a
`WithMenu` render-prop call site (removal ledger, EPIC-055 C2-5) by moving to `openMenu`.

### E1-3 — The Monaco host is a vanilla view, not a wrapper replacement

`@monaco-editor/react`'s `Editor` is not swapped for an equivalent — the 12 call sites pass
controlled props (`value`, `onChange`, `options`, `onMount`, `keepCurrentModel`) to a component that
reconciles them into imperative Monaco calls. A vanilla `MonacoHostView` owns
`monaco.editor.create(…)` and exposes the model directly, so the call sites stop describing state and
start commanding a widget. That is the same control inversion EPIC-057 C4-2 documented for av-grid,
and it is a **Rule 2 exception** for the same reason: a controlled-prop shim would be a reconciliation
layer built at the end of the programme in order to delete it.

This makes it the programme's **third documented Rule 2 exception**, after C3-1 (`RenderGrid`'s cell
contract) and C4-2 (av-grid). Unlike those, its blast radius is bounded and known: 12 files, listed
in finding 2.

### E1-4 — `loader.config` is deleted, not ported

`configure-monaco.ts` already holds the monaco instance it feeds the wrapper. With the wrapper gone
there is nothing to configure, so the line and the import go. `vite-plugin-monaco-editor-esm` and
`monaco-editor` are untouched, and no worker or language registration changes — the five
`monaco-languages/*` files keep their `Monaco` type, repointed one import deeper.

### E1-5 — The markdown renderer is this epic's designated slip item

Roadmap §3.6 says to pull it early because three editors block on it, and it is scheduled here for
that reason. But two of its five node overrides (`code` → Monaco-colorized `CodeBlock`, `pre` →
mermaid SVG) mount real interactive views, so it depends on both the Monaco host and the mermaid
conversion landing first. If it slips it slips to E2, where `markdown` itself is converted, at no cost
to anything else in this epic. Precedent: EPIC-056 C3-10.

### E1-6 — `EditorErrorBoundary` stays, and gains a vanilla-editor exemption

EPIC-058 D5 kept it because React has no vanilla equivalent for descendant render failures and the
thing it guards stays React until Epic E ends. That reasoning is unchanged, but it now needs a
refinement: a *converted* editor must not be wrapped in it, because doing so would create a React root
per vanilla editor and defeat the seam. So `AsyncEditorView` branches on the module's arm — React
editors keep the boundary, vanilla editors get a `try/catch` around `mount()` and the existing
`EditorError` view. The ledger entry stays; its "collectable once" condition is unchanged.

### E1-7 — Local state is absorbed by each editor's conversion, not deferred

*(User correction, 2026-08-24. This section previously listed the 107 `useState` occurrences as a
concern for a later epic to own, and asked whether to lift-then-convert or convert-and-absorb. Both
framings were wrong.)*

There is no later epic. Epic F is removal — deleting packages and stripping adapters — so it cannot
absorb view state, and an editor that still holds `useState` has not been converted. **A vanilla view
has no render function for state to live in, so the state moves in the same edit that converts the
view. The choice is not *when* but *where*, and that is decided per occurrence:**

| Kind of state | Home | Mechanism |
|---|---|---|
| Anything the view renders | `TComponentState` on the editor's model | `bind(selector, apply)` (roadmap §3.2) |
| Ephemeral, not rendered through a binding — a drag index, a measured width, a pending flag | A plain field on the view | Direct assignment; see the hazard below |

**This is Epic D's measured precedent, not a new rule.** EPIC-058 took `ui/` + `components/` from 7
`useState` to **1**, and that one is `ui/app/AsyncEditor.tsx:32` — a surviving React *face*, not a
converted view. Every dialog, plus `git-tree`, `file-search` and `secondary-views`, moved its local
state onto a model's `TComponentState`. Epic P's "lift into models" was only ever prep that made a
*future* conversion mechanical while the code was still React; inside a conversion the lift and the
translation are one edit.

**The hazard attaches to the second row, and it is this programme's dominant defect class.** A plain
view field is mutable and shared with the synchronous notification path, so any read of `this.*` or a
per-row record *after* a store mutation in the same handler is suspect — EPIC-058 hit this six times,
twice as user-visible bugs (`PinnedRailView` drag oscillation, `PageTabView.onLanguageClick`). No
build gate detects it. So: prefer the model row; use a view field only for state no binding renders,
and read it before mutating, never after.

**Consequence for E2's scoping:** the `useState` count per editor is a *sizing* input for grouping
editors into later epics, and nothing more. It does not generate tasks of its own.

### E1-8 — The `editors/base` chrome is not converted here; it drains with its call sites

*(Resolves what was Concern 1. The concern asked whether the subtree-slot mechanism would hold at
`TextChrome`'s fan-out. Measuring it shows the question is the wrong one: the conversion is not risky,
it is **counterproductive**, and the number says so.)*

Every element of the chrome exists to be extended by the editor inside it, so every one of them
carries React subtree slots:

| Component | React slots |
|---|---|
| `TextChrome` | `children`, `toolbarContributions`, `rightToolbarContributions`, `footerContributions` |
| `PageToolbar` | `children`, `rightContributions` |
| `ContentHostFooter` | `footerContributions` |
| `EditorToolbar` | `children` |

`uikit/shared/fill-slot.ts:90-125` fills a React-valued slot by creating a React root per slot host
and reusing it across updates. The mechanism works and is exercised in production. That is precisely
the problem: converting the chrome while the editors that fill its slots are still React would create
**up to six React roots per open editor, against one today.** Rule 4's number for this epic is React
roots and DOM writes, so the chrome conversion would move it the wrong way and buy nothing — the
slot contents are the same React trees either way.

**The load-bearing mechanism is that the two nesting directions do not cost the same.** This is worth
stating explicitly because the whole decision rests on it:

| Direction | Adapter | Root cost |
|---|---|---|
| React parent hosts a vanilla child | `mountVanilla` | **Zero** — it is a React *component* in the existing tree (`uikit/shared/mount.tsx`), not a new root |
| Vanilla parent hosts a React child | `fill-slot` → `mountReactHandle` | **One root per slot host** |

So a React chrome shell wrapping vanilla bodies and vanilla toolbar contributions is free, while a
vanilla chrome wrapping React contributions is not. Converting the chrome last is the cheap ordering,
not merely the safe one.

The direction that does work is Rule 1 read plainly: **convert the leaf, leave the container.** An
editor keeps a thin React shell that renders `<TextChrome>` (or `<PageToolbar>`) around
`mountVanilla(BodyView, { model })`. One React root for the chrome, zero for the body — no worse than
today, and strictly better per converted editor. Once the last of the 14 `<TextChrome>` call sites is
vanilla, its slots are DOM nodes, `fill-slot`'s non-React arm handles them, and the chrome converts
for free with no slot problem at all.

So the chrome joins the removal ledger rather than this epic's task list, alongside `Panel` and
`WithMenu`, which drain the same way for the same reason. **This withdraws the `editors/base` chrome
task from E1.**

### E1-9 — The registry normalizes the `Body` arm, so React consumers need no change

*(Resolves what was Concern 2 — the notebook's per-note `Body` dispatch.)*

`notebook/note-editor/NoteItemActiveEditor.tsx:63-105` holds `{ editor, Body }` in `useState` and
renders `<Body model={editor} editorConfig={…} />`. The concern was that widening `Body` forces the
notebook to handle both arms while it is itself still React.

It does not, because the normalization belongs one level down. `editorRegistry.getModule()` returns
both arms and synthesizes the missing one:

- a **vanilla** consumer — `AsyncEditorView`, which is already a `VanillaView` — takes the vanilla arm
  directly, which is the whole point of the seam (no React root);
- a **React** consumer — the notebook — asks for the React arm, and the registry hands back
  `mountVanilla(BodyView)` when the module only supplies a vanilla one.

`mountVanilla` already returns a React component (`uikit/shared/mount.tsx`), so the synthesis is a
one-line wrap. **`NoteItemActiveEditor.tsx` needs no edit at all** — not a branch, not a widened type.
This is the same adapter placement that let Epic C convert 44 components behind unchanged call sites,
applied to a registry instead of a component.

### E1-10 — The `hast → DOM` walker is hand-written, and adds no dependency

*(Resolves what was Concern 3 — the `hast-util-to-dom` addition.)*

Roadmap §3.6 left this open: "a hook, or a hand-written walk of ~100 lines. Either is acceptable."
Three things settle it toward the hand-written walk.

**1. Two of the five overrides are not overrides at all.** `input` (checkbox → icon) and `a` (href
resolution, plus react-markdown's `urlTransform` `decodeURIComponent`) are **pure hast → hast
rewrites**. They become rehype plugins in the existing pipeline, beside `rehypeHeadingIds` and
`rehypeHighlight`, and need no per-node seam whatsoever. That leaves `code` (Monaco-colorized
`CodeBlock`), `pre` (mermaid SVG) and `img` (`MarkdownImage`) — three overrides that *substitute* a
mounted view for a node.

**2. Substitution is not what a converter's hook offers.** `hast-util-to-dom`'s `afterTransform` fires
*after* a node has been converted, which decorates a result rather than replacing it. Three of our
three remaining overrides need replacement.

**3. Markdown is the exact case roadmap §3.4 was written about.** It is untrusted input rendered in a
`nodeIntegration: true`, no-CSP, no-Trusted-Types renderer, where an `innerHTML` path is arbitrary code
execution rather than defacement. A walk we own is auditable by inspection against that rule; a
third-party converter has to be audited for it, and re-audited on every bump.

**Dependency outcome: zero additions.** `hast-util-to-dom` is not adopted. Four packages we already
ship transitively become direct dependencies — `unified`, `remark-parse`, `remark-rehype` and
`property-information` (the hast-property → DOM-attribute map, which is also what `react-markdown`
uses, so the mapping is not hand-rolled) — which is honest declaration of what the code imports, not
new weight. `remark-gfm` and `rehype-raw` are already direct. `react-markdown` and
`hast-util-to-jsx-runtime` leave with Epic F.

### E1-11 — `compare` is not a registered editor module, so US-1043 converts a React island

Found while taking the baseline, and it reshapes the task. `compare` appears nowhere in
`editors/register-editors.ts`: there is no `compareModule`, no `Component:` arm, and it is never
reached through `editorRegistry` or `AsyncEditorView`. It is a plain React component rendered directly
by the **already-vanilla** `ui/app/PageContentView.ts`:

```ts
// PageContentView.updateCompare, :169-176
this.compareHost = document.createElement("div");
this.compareHandle = mountReactHandle(this.compareHost, this.compareElement(model, groupedModel, leftPageId));
```

Three consequences:

- **US-1043 does not exercise the registration seam**, and does not need to — US-1042 already proved it
  with `toolset`. The epic doc previously called `compare` "the second editor to go fully vanilla" via
  the chrome-free shape; that phrasing was wrong about the mechanism, right about the outcome.
- **It is a textbook Rule 1 conversion**: the parent (`PageContentView`) is already vanilla and stays
  untouched in structure; the React child becomes a vanilla child. Nothing is converted alongside its
  parent.
- **It deletes a React root outright** rather than merely avoiding a new one — `updateCompare`'s
  `mountReactHandle` call and `clearCompare`'s generation-guarded disposal both go, replaced by an owned
  child view. That is the Rule 4 headline.

`CompareEditor` also already holds its logic in a `TComponentModel` (`CompareEditorModel`, with
`editorDidMount`/`dispose` and a `monaco.IDisposable` subscription), so the conversion is a view
translation with the model largely intact — which is exactly the shape roadmap §3.1 predicted.

## Linked Tasks

| Task | Title | Status |
|------|-------|--------|
| US-1042 | Vanilla editor registration seam (`Component`/`Body` arms, registry normalization, `AsyncEditorView` branch, `EditorErrorBoundary` exemption) + convert the **`toolset`** editor | **Done** |
| US-1043 | Vanilla Monaco host; repoint the 6 non-component `@monaco-editor/react` importers; convert the `compare` editor | **Done** |
| US-1044 | `editors/shared` widgets to vanilla (`FindBar`, `ColorizedCode`, `editor-menu-items`, `link-open-menu`) | Planned |
| US-1045 | Convert the `image` editor inside its React `<PageToolbar>` shell — the chrome-shell shape; moves `WithMenu` → `openMenu` | Planned |
| US-1046 | `EditorModule.Body` arm's proof: convert the `mermaid` editor body inside its React `TextChrome` shell | Planned |
| US-1047 | Secondary-view vanilla arm + convert one editor-owned panel | Planned |
| US-1048 | `hast → DOM` markdown renderer; `MarkdownBlock` to vanilla; `a` and `input` overrides become rehype plugins | Planned |

Seven tasks. Two changes from the first draft, both from reading the code rather than re-planning:
**the `editors/base` chrome task was withdrawn** (E1-8 — counterproductive, not merely risky), and
**US-1042's pilot changed from `image` to `toolset`** while `image` kept a task of its own (E1-2 —
`image` cannot exercise the arm US-1042 ships, because it needs a React chrome shell).

Ordering constraints: **US-1042 first** — everything else registers through it. US-1043 and US-1046
before US-1048 (E1-5: the `code` and `pre` overrides mount a Monaco block and a mermaid SVG). US-1044,
US-1045 and US-1047 are independent of each other.

## Rule 4 — the measured number

Taken on the React implementation **before** US-1043, because that is the measurement that cannot be
recovered afterwards (roadmap §7, Epic C verification).

**Metric:** DOM writes counted by `MutationObserver` (EPIC-053's method) plus React roots created,
over one open → type-10-characters → close cycle of the `compare` editor.

Chosen because `compare` is 108 lines whose entire content is a controlled Monaco widget, so the
number isolates exactly what E1-3 changes: how much reconciliation sits between a keystroke and the
widget. The secondary number — React roots per open editor, 1 → 0 — is a count, not a benchmark, and
is reported alongside rather than as the headline.

> **GATE — CLEARED 2026-08-24, before any US-1043 code.** Baseline recorded below. Do not re-open it.

### Metric revised, and the baseline

The typing half of the metric above was dropped after trying to take it. Three reasons:

1. **It would have measured Monaco, not us.** Monaco repaints its own viewport on every keystroke, so
   DOM writes during typing are dominated by the widget and the React wrapper's reconciliation is lost
   in the noise. The metric would have been precise and uninformative.
2. **It is not drivable autonomously.** Compare mode cannot be toggled from the scripting API —
   `app._pages` is a `PageCollectionWrapper` exposing `group`/`ungroup`/`openDiff`/`closePage`, with no
   compare-mode control — so an open→type→close cycle needs the UI.
3. **What E1-3 removes is countable exactly.** See E1-11: compare mode's React root is created in one
   named place, so the number is a fact about the code rather than a benchmark with error bars.

**Headline number — React roots created for compare mode: 1 → 0.** `PageContentView.updateCompare`
(`ui/app/PageContentView.ts:169-176`) calls `mountReactHandle`, so entering compare mode creates a
React root and the whole `CompareEditor` subtree inside it. After US-1043 the vanilla view is a direct
child and no root is created.

**Measured baseline, on React, taken at `84ce5881`:**

| Measurement | Value |
|---|---:|
| DOM mutations for a cold compare-editor mount | **2,001** |
| Settle window | 2,525 ms |
| Resulting `.monaco-diff-editor` nodes | 1 |

**Result, measured after US-1043 at the same commit-adjacent state:**

| Measurement | React (before) | Vanilla (after) | Change |
|---|---:|---:|---:|
| DOM mutations, cold compare-editor mount | 2,001 | **1,096** | **−45%** |
| React roots created for compare mode | 1 | **0** | −1 |
| `.monaco-diff-editor` nodes produced | 1 | 1 | — |

The 45% is larger than expected — the working assumption was that Monaco's own rendering would swamp
the difference. It did not: nearly half the DOM traffic of opening a diff was the React wrapper and its
reconciliation, not the widget.

Method — repeat exactly to get the "after" number: install a `MutationObserver` on
`document.getElementById("root")` with `{childList, subtree, attributes, characterData}`, call
`app._pages.openDiff({firstPath, secondPath})` on two small scratch text files, wait 2,500 ms, then
disconnect and sum `records.length`. Restore the layout afterwards with `ungroup` + `closePage`; the
files used were two 4-line text files differing on two lines.

**MCP measurement pitfall, found 2026-08-24.** `await import('http://localhost:5273/src/…')` from
`execute_script` returns a **fresh module instance**, not the running app's singleton — an imported
`editorRegistry` came back with zero definitions while the app was working normally. Reach live state
through the scripting context's `app` object model instead, and instrument the real DOM directly
(`document.getElementById("root")` *is* the app's root, so a `MutationObserver` there measures the real
thing). Only use dev-server imports for pure functions and types.

## Concerns

**None open.** The three technical concerns this epic opened with were resolved into decisions rather
than carried:

| Was | Resolved by | Outcome |
|---|---|---|
| `TextChrome`'s subtree slots at fan-out | **E1-8** | The chrome conversion is withdrawn from the epic — it would create up to 6 React roots per open editor against 1 today. It drains with its call sites. |
| The notebook's per-note `Body` dispatch | **E1-9** | The registry normalizes the arms, so `NoteItemActiveEditor.tsx` needs no edit at all. |
| `hast-util-to-dom` as a new dependency | **E1-10** | Not adopted. Hand-written walker, zero new dependencies; two of the five overrides become rehype plugins. |

What remains is ordinary execution risk, held in the task documents rather than here. The one item
worth naming, because it is a *programme* commitment rather than a task risk: **E1-3 is the third
documented Rule 2 exception**, and the roadmap's abort criteria treat repeated Rule 2 breakage as a
signal the abstraction is wrong. Three exceptions across six epics, each with a written justification
and a bounded blast radius, is not that signal — but a fourth should prompt a re-read of §9 before it
is accepted.

## Notes

### 2026-08-24
- Epic opened. Scope re-measured at `714e4133`: 180 `.tsx` files, 28,640 lines against the roadmap's
  181 / 28,203.
- Six investigation findings recorded above; findings 1 and 6 change the roadmap's picture of Epic E
  and are reflected back into `de-react.md` §7 and the removal ledger.
- Six decisions recorded (E1-1 … E1-6), including the programme's third Rule 2 exception (E1-3).
- **E1-7 added on user correction.** The `editors/` `useState` residue was first written up as a
  concern for a later epic to own, with lift-then-convert vs convert-and-absorb left open. Both
  framings were wrong: Epic F is removal and cannot absorb view state, and a vanilla view has no
  render function to hold it — so the state moves in the same edit that converts the view. The open
  question is only *where* it lands (model `TComponentState` vs plain view field), and Epic D already
  answered that by precedent. Reflected back into `de-react.md` §7.
- **E1-8 … E1-10 added, resolving the three remaining concerns.** Two changed the plan: the
  `editors/base` chrome task is **withdrawn** (E1-8 — converting slot-bearing containers ahead of the
  editors that fill them would multiply React roots 1 → up to 6 per open editor), and
  `hast-util-to-dom` is **not adopted** (E1-10 — the walker is hand-written, so the epic adds zero
  dependencies). Task count 7 → 6.
- **US-1042 done.** Registry gains the `Component | View` discriminated union (a compile-time
  invariant — `npm run typecheck` confirmed all 31 `Component:` providers, 5 `Body:` providers,
  `register-editors.ts` and every reader compile untouched), normalization synthesizes the missing
  React arm **inside `loadModule()` before the cache write** so there is one stable wrapper identity
  per editor id, `AsyncEditorView` mounts a vanilla view with no React root, and `toolset` is the first
  fully vanilla editor.

  Five defects were found in review and fixed before commit, four of which the gates could not have
  caught: **UTF-8 corruption** in four string literals, two of them user-visible (`—` and `•` in
  `ui.notify` and the manifest-error list); **`SpacerView` never mounted**, so it had no
  `data-type="spacer"` and therefore no flex growth, silently breaking the header layout — `this.child()`
  registers ownership but does **not** mount; **retiring a vanilla view never detached its root**
  (`vanilla-view.ts` documents that `dispose()` deliberately leaves the root attached), which would have
  rendered two editors at once on a vanilla→vanilla switch and left dead DOM under the new React root on
  vanilla→React; **React-root reuse across editor switches was lost**, a regression — the original code
  deliberately kept `this.handle` and re-rendered into it, so blanket disposal added root churn plus a
  synchronous unmount inside `onUpdate`; and **unguarded disposal**, which could throw out of `onUpdate`
  into the state-notification path.

  *Verified live over MCP:* repeated `monaco → md-view → monaco → md-view` switches on a scratch page
  returned identical DOM counts every time with zero `[data-name="editor-error"]` nodes — no stale
  accumulation and no root churn, which is exactly what the third and fourth defects were about. The
  React path is intact. The toolset editor's own appearance is in Testing owed.

  *Dismissed after checking, so it is not re-investigated:* `element.hidden` on the description/author
  spans works — `Text.css` sets `display` only under `[data-truncate]`/`[data-align]`, there is no bare
  `[data-type="text"]` display rule and no author `[hidden]` rule, so the UA `[hidden] { display: none }`
  applies.
- **US-1043 done, and it produced the epic's Rule 4 number: DOM mutations for a cold compare-editor
  mount 2,001 → 1,096, a 45% reduction, plus one React root deleted.** The vanilla
  `MonacoDiffEditorHostView` owns `createDiffEditor` and the two text models;
  `PageContentView.updateCompare` no longer calls `mountReactHandle`. `createToolbarElement` /
  `applyToolbarAttributes` were added to `uikit/Toolbar/toolbar-style.ts` (mirroring `panel-style.ts`)
  and `ToolbarView` now calls the factory, so the toolbar contract has one source of truth;
  `data-roving-host` deliberately stays in `ToolbarView`, since it advertises a roving-tabindex manager
  a static toolbar does not have. `MONACO_THEME_NAME` is exported and `loader.config` is gone.

  **Codex overturned my own analysis on the disposal question, and was right.** I checked that
  `DiffEditorWidget`'s `onWillDispose` guards are removed synchronously (`autorunImpl.js:40-51`) and
  concluded the macrotask defer from `FileDiffBodyModel` was obsolete. Codex found the actual
  mechanism: `setDiffModel` (`diffEditorWidget.js:318-325`) defers the *previous model-ref* disposal
  with an explicit `setTimeout(…, 0)` and a TODO admitting it, live in 0.55.1. The defer stays. The
  lesson is narrow and worth keeping: checking that the listeners are gone is not the same as checking
  that nothing else deferred work touching the models.

  Three defects found in review and fixed before commit: a **speculative `MonacoEditorHostView`** with
  zero consumers (I let the two-host design through at plan review — my mistake, corrected here; the
  plain host now waits for a real `Editor` call site); **`this.child(new CompareEditor(...))`**, which
  leaked one dead view per compare exit because `VanillaView` has no child-release API and
  `clearCompare` is called from five sites including ordinary page switches; and a missing comment on
  the global `setTheme` call.

  *Verified live over MCP:* compare mounts with both `dir="rtl"` labels carrying full-path titles, the
  `.toolbar-root`/`role="toolbar"` from the new factory, the exit button, the `→` separator, and one
  diff editor. Three page-switch cycles and two reopen cycles left the counts at exactly 1 — no
  accumulation. Ungrouping dropped `compare-root`, `.monaco-diff-editor` and `.monaco-host-root` all to
  **0**, confirming `clearCompare` detaches the root and the host tears the widget down.
- **Two counting errors of my own, corrected.** `<TextChrome>` has **14** JSX call sites, not 25 — the
  original figure counted comment mentions alongside tags. And `image` is **not** chrome-free: it
  renders `<PageToolbar>` (`image/ImageView.tsx:60`). The second error improved the pilot rationale
  rather than only fixing it: the editors split three ways by which chrome wraps them (14 `TextChrome`
  · 6 `PageToolbar` · the rest bare), and the three pilots are now one per shape instead of three of a
  kind.

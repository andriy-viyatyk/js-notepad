# EPIC-061 — Epic E3: Delete `@monaco-editor/react`

**Status:** Active
**Created:** 2026-08-24
**Roadmap:** [de-react.md](../de-react.md) §7 Epic E (E3)
**Predecessors:** [EPIC-059](EPIC-059.md) (E1 — foundations), [EPIC-060](EPIC-060.md) (E2 — editor bodies)

## The closing property

> `@monaco-editor/react` has **zero importers in `src/`**, `loader.config({ monaco })` is gone from
> `api/setup/configure-monaco.ts`, and the package is removed from `package.json`.

Compiler- and `npm ls`-checkable, not a judgement call. Everything in this epic exists to make that
sentence true.

## Overview

Every Monaco editor in the application is currently created by a React component from
`@monaco-editor/react`. This epic replaces that with a `VanillaView` host the project owns, converts
the 13 mount points onto it, and deletes the dependency.

Monaco itself does not move. `monaco-editor` stays a direct dependency, `vite-plugin-monaco-editor-esm`
stays, and `configure-monaco.ts` keeps every language, theme, keybinding and IntelliSense concern it
owns today. The only thing deleted is the React *lifecycle wrapper* around
`monaco.editor.create` / `createDiffEditor`.

## Why this group, and not "largest first"

EPIC-060 E2-1 established that a conversion epic should be scoped by the **shared contract it can
delete**, because a contract that survives is one every later epic must keep satisfying. The two
contracts still open in `editors/` are `@monaco-editor/react` and the `editors/base` chrome
(`TextChrome` and friends).

**The wrapper is the one to take now, and the chrome is the one to take last.** The chrome cannot be
converted ahead of its call sites without making things worse on Rule 4's own metric — EPIC-059 E1-8
measured up to six React roots per open editor against one today, because every chrome component
carries React subtree slots. It converts for *free* once its 14 call sites are vanilla, so it belongs
at the end of Epic E, not the middle.

The wrapper has the opposite shape. Each `<Editor>` is a **leaf**: it renders no application content,
so a vanilla host plus a thin React face converts it under Rule 1 without touching a single parent.
And it is what the largest remaining editors block on — of the eight biggest by line count, **seven**
mount Monaco through the wrapper (`rest-client`, `notebook`, `mcp-inspector`, `git-tree`, `text`,
`file-diff`, `monaco`). Doing it first means each of those editors converts later against a host it
already uses, instead of converting the host and the editor in one change.

E1 already built half of it. `editors/shared/MonacoDiffEditorHostView.ts` (108 lines) is a working
vanilla diff host with one converted consumer (`compare/CompareEditor.ts`), so this epic has a proven
in-tree template rather than a design problem.

## The surface, measured

Measured 2026-08-24 against the tree.

| Consumer | Mount points | Kind | Lines in file |
|---|---:|---|---:|
| `editors/monaco/MonacoBody.tsx` | 1 | `Editor` | 230 |
| `editors/rest-client/RequestBuilder.tsx` | 2 | `Editor` | 681 |
| `editors/rest-client/ResponseViewer.tsx` | 2 | `Editor` | 390 |
| `editors/text/ScriptPanel.tsx` | 1 | `Editor` | 442 |
| `editors/mcp-inspector/ToolArgForm.tsx` | 1 | `Editor` | 198 |
| `editors/mcp-inspector/ResourceContentView.tsx` | 1 | `Editor` | 139 |
| `editors/mcp-inspector/ToolResultView.tsx` | 1 | `Editor` | 101 |
| `editors/notebook/note-editor/MiniTextEditor.tsx` | 1 | `Editor` | 105 |
| `ui/dialogs/TextDialogView.ts` | 1 | `Editor` | 163 |
| `editors/file-diff/FileDiffBody.tsx` | 1 | `DiffEditor` | 79 |
| `editors/git-tree/CommitDiffPanel.tsx` | 1 | `DiffEditor` | 282 |
| `api/setup/configure-monaco.ts` | — | `loader` | — |
| **Total** | **13** | 11 `Editor`, 2 `DiffEditor` | **2,810** |

Line counts are the *files*, not the work: only the mount seam changes in most of them. The two
`DiffEditor` sites convert onto the host E1 already shipped.

"Mount points" counts **JSX sites, not live editors**. `MiniTextEditor` is one site that instantiates
one Monaco editor *per rendered note row* (E3-6), so the notebook is the only consumer where the host
must be safe to instantiate many times over concurrently and be recycled. Everywhere else a site is
one editor.

**The prop surface is small and near-uniform**, which is what makes this mechanical. Across all 13
sites the wrapper is given only: `value`, `language`, `options`, `theme`, `onChange`, `onMount`,
`height`, `original` / `modified`, `keepCurrentOriginalModel` / `keepCurrentModifiedModel`, and one
`key`. Three of those do not survive the conversion at all — see E3-4, E3-5 and E3-6.

## Operating procedure — ORCHESTRATOR ONLY

<!-- CODEX: the block below is not addressed to you. Skip to "Decisions". -->

Same as EPIC-060. Investigation and implementation go to Codex via the
[`codex-dev`](../../.claude/skills/codex-dev/SKILL.md) skill; Claude's budget is spent on this
document, on **reviewing each task plan against the source**, and on live verification. Per-task
commits. `/review`, `/document` and `/userdoc` run once at epic close, through Codex.

Two rules carried forward from EPIC-060's close, because both were paid for the hard way:

- **A template is not a specification.** `MonacoDiffEditorHostView` is the template here, and unlike
  `MermaidBodyView` it does build its editor in `onMount()`. Still check every new view against
  `uikit/CLAUDE.md:496-502` rather than against the template.
- **Verify with geometry, not presence.** A Monaco editor that mounts into a zero-height host looks
  identical to one that failed to mount. Assert `offsetHeight` on the host *and* a non-empty
  `.view-lines`, on an **active** page — an inactive page measures 0×0.

## Decisions

### E3-1 — The epic is defined by the dependency it deletes

Continues E2-1. The scope is "every importer of `@monaco-editor/react`", which is a `grep`, not an
opinion. A task is done when its importers are gone; the epic is done when `npm ls` no longer lists
the package.

This also front-loads the thing seven of the eight largest editors block on, so it is a foundations
epic in the same sense E1 was — E1 built the seams a vanilla editor needs to be *registered and
mounted*; E3 builds the one it needs to *show text*.

### E3-2 — Two hosts, not one host with a mode flag

`MonacoEditorHostView` is written as a **sibling** of the existing `MonacoDiffEditorHostView`, not a
generalization of it. `monaco.editor.create` and `monaco.editor.createDiffEditor` return unrelated
types (`IStandaloneCodeEditor` vs `IStandaloneDiffEditor`) with different model contracts — one model
versus an `{ original, modified }` pair — and the ownership rules E1 worked out for the diff case
(deferred disposal, so Monaco does not throw "TextModel got disposed before DiffEditorWidget model
got reset") are specific to having two models.

A single host taking a `mode` would have to union both editor types on its public field, which pushes
a narrowing cast into all 13 call sites. Two hosts, ~100 lines each, with any genuinely shared model
bookkeeping factored out only if the second one demands it — the "demanded by a real conversion"
test from EPIC-053 B14.

### E3-3 — This is a control inversion, and E1-3 already declared it a Rule 2 exception

The wrapper is a **controlled** React component: it takes `value` as a prop and reconciles the
editor's text toward it. `monaco.editor.create` is uncontrolled — it owns a model and reports changes.
This is the same boundary C4-2 hit with av-grid, and EPIC-059 E1-3 already recorded the Monaco
replacement as the programme's **third documented Rule 2 exception**.

What that means in practice: the vanilla host is *not* given a `value` prop that it diffs on every
update. It exposes `setValue` / `getEditor` and lets the model own the text, which is what the four
`onMount`-taking consumers already do. The React faces keep the call sites compiling — no
controlled-prop compatibility shim, for exactly C4-2's reason: it would be a reconciliation layer
added near the end of a programme whose purpose is removing one.

### E3-4 — The `theme` prop is deleted, not ported

Twelve of the thirteen sites pass `theme="custom-dark"`. **Monaco themes are global** — there is no
per-instance theme in the Monaco API — and `configure-monaco.ts` already defines that one theme
(`MONACO_THEME_NAME`, `:90`) and applies it via `applyMonacoTheme` on every theme switch (`:104`).

So all twelve are a no-op repeated twelve times, with the app's single theme name hardcoded as a
string literal at each. The vanilla hosts take no `theme` prop and the literals go. This is the kind
of thing worth doing *during* a conversion rather than after: the prop's absence is what proves it was
never load-bearing.

### E3-5 — `height` becomes CSS

`MiniTextEditor` is the only site passing `height`, and it passes the wrapper's string/number prop
(`fillContainer ? "100%" : contentHeight`) while *also* setting the same geometry on its own wrapper
`<div>`'s inline style. The host root is a plain element with a class; its size comes from the
stylesheet and from the one content-height case the notebook genuinely needs. No `height` prop.

### E3-6 — `key={model.id}` becomes `setModel`, and that is this epic's Rule 4 number

`MiniTextEditor.tsx:53` carries the comment *"Force remount when note changes (ensures onMount is
called)"*. That is a React workaround with a real cost, and the cost is larger than the comment
suggests.

**The trigger is not switching notes — it is scrolling.** `NoteItemView.tsx:344` renders
`NoteItemActiveEditor` for **every** note row unconditionally, so each note whose view is `monaco`
owns its own Monaco editor. The notes list is virtualized by `RenderFlexGrid`, so scrolling
**recycles** a row onto a different note; `model.id` changes, the `key` changes, and React tears the
Monaco editor down and builds a new one.

**Baseline, measured live on the React implementation before any conversion** (2026-08-24,
`C:\data\js-notepad-notes\temp\test.note.json`, 13 notes, 3 rows rendered at a time, notes list
`scrollHeight` 5,039 / `clientHeight` 962). The row-12 Monaco node was tagged with a marker
attribute, then the list was scrolled to the top and back:

| Step | Marked node | `.monaco-editor` count | Rows (`:M` = has Monaco) |
|---|---|---:|---|
| Start (scrollTop 4077) | present, connected | 1 | `r10:-` `r11:-` `r12:M` |
| Scrolled to top | **gone from the DOM** | 1 | `r0:M` `r1:-` `r2:-` |
| Scrolled back to 4077 | still gone — **rebuilt, not restored** | 1 | `r10:-` `r11:-` `r12:M` |

So one top↔bottom round trip destroys and constructs **2** Monaco editors, and the editor that
returns to row 12 is a different instance from the one that left it. In a notebook where more notes
use the `monaco` view, every recycled row pays.

A vanilla host does not need any of it. A recycled row becomes `editor.setModel(nextModel)` against
a host that stays mounted — precisely the "stable control identity" §3.1 of the roadmap says a
vanilla view restores and JSX cannot express.

**Rule 4's measured number for this epic is therefore Monaco editor constructions per notes-list
scroll round trip: 2 → 0.** Taken on the React implementation first, since EPIC-057 established that
is the measurement which cannot be recovered afterwards. Wall-clock scroll smoothness is the
user-visible consequence, but the construction count is what closes the epic, because it is not
sensitive to machine load.

*Correction to this decision as first written:* it said "per note switch", inferred from the `key`
and its comment. The live measurement above shows the mechanism is the same but the trigger is row
recycling during ordinary scrolling — a much more frequent event than switching notes, which makes
this the strongest number in the epic rather than an incidental one.

### E3-7 — `loader.config` and the uninstall land last, in their own task

`loader.config({ monaco })` cannot be deleted while any wrapper consumer remains: without it the
wrapper falls back to its CDN default, which Electron resolves as a local file path and fails with
`ENOENT` (E1-3, and the comment at `configure-monaco.ts:14-17`). So it is not a cleanup detail to
fold into the last conversion — it is the gate that makes the closing property true, and it gets its
own task so that the tree is releasable at every point before it (Rule 3).

That task also collects the removal-ledger entry rather than deferring it to Epic F. EPIC-060 left
`react-markdown` installed-but-unimported and recorded it as *collectable*; the roadmap's own note
says collecting a duplicate in the epic that frees it is cheaper than collecting it in a cleanup epic
that has to re-establish why it existed. `@monaco-editor/react` is uninstalled here, in the epic that
frees it.

## Linked tasks

| Task | Scope | Mount points |
|---|---|---:|
| [ ] US-1056 | `MonacoEditorHostView` + React face; `monaco/MonacoBody.tsx` as the pilot consumer | 1 |
| [ ] US-1057 | `rest-client` (`RequestBuilder`, `ResponseViewer`) and `text/ScriptPanel` | 5 |
| [ ] US-1058 | `mcp-inspector` (`ToolArgForm`, `ResourceContentView`, `ToolResultView`) | 3 |
| [ ] US-1059 | `notebook/MiniTextEditor` (E3-6, the Rule 4 number) and `ui/dialogs/TextDialogView` | 2 |
| [ ] US-1060 | The two `DiffEditor` sites onto E1's existing diff host | 2 |
| [ ] US-1061 | Delete `loader.config`, uninstall the package, update docs and the removal ledger | — |

US-1056 goes first and alone: it establishes the host contract, and `MonacoBody` is the main text
editor, so it is both the riskiest consumer and the one that exercises the most host behaviour
(wheel zoom, drop suppression, encrypted read-only, `onMount`, `onChange`). The four middle tasks are
independent of each other and can run in parallel. US-1061 requires all of them.

## Concerns

1. **`TextDialogView.ts` currently spends a React root on the wrapper.** It is an already-vanilla view
   that calls `mountReactHandle` (`:74`) purely to render `React.createElement(Editor, ...)` (`:91`).
   Converting it deletes a React root outright — the only site in this epic where that is true, since
   the other twelve sit inside React trees that already exist. Worth measuring separately as a second
   Rule 4 data point, and worth doing carefully: it is a dialog, so it mounts and unmounts constantly
   and a leaked model or listener will accumulate visibly.

2. **`RequestBuilder.tsx` has two mount points with different lifetimes** (`:383` headers, `:558`
   body) and one is inside a conditional. Two host instances, not one reused — and the conditional
   arm must actually dispose its host rather than orphan a Monaco instance.

3. **`file-diff` already depends on deferred model disposal.** `FileDiffBodyModel.ts:38,139` documents
   passing `keepCurrentOriginalModel` / `keepCurrentModifiedModel` so the wrapper does not dispose
   models before the widget resets. E1's diff host has `releaseOwnedModels` for exactly this, but the
   mapping from "two boolean props" to "the host defers disposal" must be verified against
   `CompareEditor`'s working usage rather than assumed. This is the one place in the epic where a
   wrong guess produces a Monaco exception rather than a visual defect.

4. **`ScriptPanel.tsx` is in `editors/text/` and also renders `<PageToolbar>`.** Only its Monaco mount
   is in scope. Do not let the chrome conversion leak in — that is E1-8's trap, and it is the specific
   thing that would make this epic worse on Rule 4's metric.

5. **The `onMount` signature is the wrapper's, not Monaco's.** `OnMount` is `(editor, monaco) => void`.
   Four consumers use it and one (`TextDialogView`) imports the *type*. The host should hand back the
   editor only; the `monaco` namespace is an import away at every call site and passing it perpetuates
   a wrapper concept.

6. **`MiniTextEditor` is the one many-instance consumer, and the only one where disposal is
   load-bearing.** Every rendered note row with the `monaco` view owns an editor, and the row is
   recycled by `RenderFlexGrid` on scroll. Under React the `key` remount guaranteed teardown; a
   vanilla host that reuses the instance must be certain the *old* note's model is released when a row
   is rebound, or scrolling a large notebook leaks a Monaco model per recycle — which is strictly
   worse than the churn E3-6 removes. This is the task to review hardest.

7. **Not in scope: the residual `useState`/`useEffect` in these files.** E1-7 absorbs view state into
   each editor's own conversion, and these editors are not being converted here — only their Monaco
   seam. Resist the tidy-up; it widens the diff without advancing the closing property.

## Testing owed

*(Filled as tasks land. Empty at close is the goal.)*

## Notes

- Next free US number after this epic's tasks: **US-1062**.
- Next free epic number: **EPIC-062**.
- The per-task commit authorization granted for EPIC-060 and reaffirmed here **does not generalise**
  past this epic.

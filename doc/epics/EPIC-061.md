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
one Monaco editor *per rendered note row*, so the notebook is the only consumer where the host must be
safe to instantiate several times over concurrently, and where it is mounted and disposed constantly
as rows scroll in and out of the virtualized list. Everywhere else a site is one editor. See the
withdrawn E3-6 for what that churn is and is not.

**The prop surface is small and near-uniform**, which is what makes this mechanical. Across all 13
sites the wrapper is given only: `value`, `language`, `options`, `theme`, `onChange`, `onMount`,
`height`, `original` / `modified`, `keepCurrentOriginalModel` / `keepCurrentModifiedModel`, and one
`key`. Three of those do not survive the conversion at all: `theme` (E3-4), `height` (E3-5), and the
`key`, which is a React concept with no vanilla equivalent — though **not** for the reason the
withdrawn E3-6 gave.

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

### E3-6 — WITHDRAWN: the notebook's Monaco churn is virtualization, not the `key`

**This decision was wrong. It is kept in full rather than deleted, because the mistake is the useful
part.**

#### What it claimed

`MiniTextEditor.tsx:53` carries `key={model.id}` with the comment *"Force remount when note changes
(ensures onMount is called)"*. `NoteItemView.tsx:344` renders `NoteItemActiveEditor` for **every**
note row, so each note whose view is `monaco` owns an editor. I measured the notes list live before
any conversion and found real churn:

| Step | Marked node | `.monaco-editor` count | Rows (`:M` = has Monaco) |
|---|---|---:|---|
| Start (scrollTop 4077) | present, connected | 1 | `r10:-` `r11:-` `r12:M` |
| Scrolled to top | **gone from the DOM** | 1 | `r0:M` `r1:-` `r2:-` |
| Scrolled back to 4077 | still gone — rebuilt, not restored | 1 | `r10:-` `r11:-` `r12:M` |

From that I set Rule 4's number at **Monaco constructions per notes-list scroll round trip: 2 → 0**,
on the theory that the `key` was forcing the remount and a vanilla host would rebind with `setModel`
instead.

#### Why it is wrong

The measurement is real; the attribution was not. `RenderFlexGrid` renders each row through
`FlexCell`, keyed by `p.key`, and `renderInfo.ts:314` builds that key as ``​`${row}_${col}`​`` — the
**row index**, not the note identity. So scrolling does not rebind a surviving row to a different
note. It unmounts the rows that left the viewport (keys `10_0`…`12_0` disappear) and mounts the rows
that entered it (`0_0`…`2_0`). The Monaco editor is destroyed because **its row left the screen**,
which is what virtualization is.

A vanilla host does not change that by even a little. `mountVanilla` disposes the view when React
unmounts the subtree, so the host dies with the row exactly as the wrapper did. **The target of 0 was
unreachable, and no amount of `setModel` reaches it.** Codex established this at US-1059's
investigation, in answer to the question I told it to lead with; I then confirmed it against
`renderInfo.ts:314` rather than taking it on trust.

Two further live measurements, for the record:

- Typing **one character** into the notebook search box destroyed the marked editor and left 2
  constructed, with visible rows moving `r10,r11,r12` → `r8,r9,r10`. Real churn, and frequent — but
  the row indices moved too, so this is the same confounded measurement as the scroll one.
- Filtering while parked at the very top, where rows `r0..r2` stay rendered under unchanged keys and
  the first note still matched, left the marked editor **alive**. So React is not remounting
  gratuitously: when the row index and the note are both unchanged, the editor survives.

What `key={model.id}` actually costs is therefore the narrow residue: the same row index binding a
*different* note while staying on screen. It is real, it cannot be isolated from virtualization churn
by DOM observation alone, and it is much smaller than this decision claimed.

#### What replaces it

Two things, and they belong to different owners.

**Rule 4's number for EPIC-061 is structural, not performance.** This epic buys a deleted dependency,
so the number is the one the closing property already names, plus the one React root it removes:
`@monaco-editor/react` importers **13 → 0** with the package uninstalled, and `TextDialogView`'s React
root **1 → 0** (Concern 1 — the only site in the epic where converting removes a root outright, since
the other twelve sit in React trees that already exist). E1's number was structural in the same way;
an epic whose deliverable is a deletion should not be made to report a speed figure it does not buy.

**The notebook's scroll churn is a `RenderFlexGrid` problem and it already has an owner.** The removal
ledger's `RenderFlexGrid.tsx` entry is collectable once *"Epic E converts `LogBody.tsx` and
`NotebookBody.tsx` — either onto a vanilla variant or off flex rows entirely."* Rebuilding a Monaco
editor whenever a note row scrolls out of view is a cost of rebuilding the row from scratch, and it is
fixable only by a row host that pools or retains its cells the way av-grid does. Whichever epic takes
that entry should take this measurement with it: the baseline above is the before-figure, and it is
still valid there, because nothing in EPIC-061 changes it.

#### The generalisation worth carrying

Both times I have measured this programme's Rule 4 number wrong, the error was the same one: I
measured a real effect and attributed it to the component I was about to change. EPIC-060 read
page-manager slot duplication as md-view rendering twice; this read virtualization row churn as a
React `key`. **The check that catches it is asking what else could produce the number, and then
finding the line that decides** — `renderInfo.ts:314` here, the retained-slot code there. A
before/after measurement is not evidence about a cause until the cause has been located in source.

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

### E3-8 — The echo guard belongs to the host, once

Added after reading `MonacoBody.tsx` while US-1056's plan was being written, because it is the one
design point in this epic where a wrong choice is repeated eleven times.

The wrapper is doing more content work than `value=` suggests. `MonacoBody` subscribes to
`host.state` (`:25-33`) and passes `sliced.content` down, so **the wrapper is the thing that writes
externally-changed content into the editor** — after a script edits the page, a file reloads, or a
slice changes. Under E3-3 the host is uncontrolled and will not do that reconciliation, so the
consumer's model must. And the moment a consumer subscribes to its own content state and calls
`setValue`, it has built a loop:

> user types → `onChange` → `host.changeContent` → state update → content subscription →
> `setValue` → **cursor jumps to the end of the document and the undo stack is destroyed**

The wrapper avoids this by comparing the incoming value against `editor.getValue()` before writing.
That guard is not optional and it is not a consumer concern: eleven call sites must not each
rediscover it. **`MonacoEditorHostView.setValue(next)` is the single external-write entry point for
every consumer in this epic**, and it owns the whole policy — compare, write, suppress. Consumers
subscribe to their own content state and call `setValue` freely.

**Refined during US-1056's plan review**, in two ways that matter to every later task:

- The comparison alone is not the whole guard. The wrapper writes through `setValue` only when the
  editor is **read-only**; when it is editable it uses a full-range `executeEdits` followed by
  `pushUndoStop`, because `setValue` discards the undo stack. Both paths live in the host's
  `setValue`. As first written this decision said only "compare before writing", which would have
  silently downgraded undo behaviour on every editable consumer.
- **The mount callback hands back the host view, not the raw editor.** Under `mountVanilla` a React
  consumer has no reference to the view it mounted (`mount.tsx` keeps it in a ref and exposes
  nothing), so a callback giving out only `IStandaloneCodeEditor` would leave every consumer unable
  to call `setValue` — and therefore reimplementing the policy against the raw editor, which is
  exactly what this decision forbids. `onMount?: (host: MonacoEditorHostView) => void`, with
  `host.getEditor()` for the consumer-specific setups that genuinely need the widget. This does not
  weaken Concern 5: that concern was about not perpetuating the wrapper's `(editor, monaco)` pair,
  and a Persephone object carrying the policy is the better of the two.
- Suppression is save-and-restore, not `finally { flag = false }`. A re-entrant write would otherwise
  clear a guard it did not set.

Two smaller members of the same family, both currently handled by the wrapper's prop diffing and both
therefore now the host's job:

- **`language` changes at runtime** (`MonacoBody` reads it from state), so the host needs
  `setLanguage` over `monaco.editor.setModelLanguage` — not language-at-construction only.
- **`options` change at runtime**: `readOnly: !!sliced.encrypted` flips when a file is
  encrypted/decrypted. The host needs an `updateOptions` path, not just constructor options.

### E3-9 — Monaco collapses inside a flex parent, and the host CSS is what prevents it

`MonacoDiffEditorHostView.css` already carries the fix and the reason: *"Monaco's diff root sets only
`height: 100%` inline; as a flex child it shrinks to content width (0) and the panes collapse."* The
single-editor case has the same shape and needs the equivalent `> .monaco-editor { width: 100% }`
rule.

This is why the epic's verification rule is geometry rather than presence: a collapsed Monaco is
present, mounted, has a model, and is zero pixels wide. **The new host gets its own root class rather
than reusing `.monaco-host-root`** — two hosts sharing one class across two stylesheets, where each
adds a different child rule, is a defect waiting for whichever one is loaded second.

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
   load-bearing.** Every rendered note row with the `monaco` view owns an editor, and rows are
   unmounted and remounted continuously as the virtualized list scrolls (see the withdrawn E3-6 —
   `renderInfo.ts:314` keys cells by row index, so an off-screen row is destroyed, not rebound).
   That makes the notebook the consumer that exercises the host's **disposal** path hardest, by a
   wide margin: every scroll disposes hosts and creates new ones. A host that leaks its model on
   dispose leaks once per row that ever left the screen, which in a long notebook is unbounded and
   completely invisible. This is the task to review hardest, and disposal — not rebinding — is where
   to look.

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

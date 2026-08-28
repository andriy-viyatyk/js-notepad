# EPIC-073 — De-React Epic E15: the last React editor

**Status:** Complete
**Created:** 2026-08-27
**Completed:** 2026-08-28
**Roadmap:** [de-react.md](../de-react.md) → Epic E — Editors (final epic)
**Predecessor:** [EPIC-072](completed.md) (E14 — the `Component` arm dies)

Epic E ends here. Five editor bodies still produce React elements; when they are native, **no
editor in Persephone produces React**, and every React file that remains is either storybook's
deliberately-kept React arm or Epic F's removal work.

---

## E15-1 — The closing property

Four statements. Per [EPIC-072](completed.md)'s finding **C9a**, each is paired with a *presence*
statement, because every one of them is phrased as a removal and is therefore satisfiable by
deleting the feature.

| # | Removal — "it no longer does X" | Presence — "it still does Y" |
|---|---|---|
| 1 | Zero non-story `.tsx` under `editors/{graph,rest-client,env-vars,file-diff}`; no `createElement` in any `EditorModule`. **`draw` is excepted** — see E15-2 correction 7: it keeps one named vendor island for Excalidraw | All five editors open and work: graph draws its canvas and expands a node; rest-client sends a request and shows the response; env-vars lists and unlocks; file-diff shows a diff with a revision picked; draw shows the Excalidraw canvas |
| 2 | No file matches `return mountVanilla(` — all 21 faces gone | Every native view that imported a `*Props` type from a deleted face still typechecks **and still renders** — the props moved, they did not vanish |
| 3 | `PopoverView` and `DialogView` are `.ts` with no `react` import and no React fallback path | A popover opens, positions and **resizes**; a dialog opens, commits, and runs its focus pass |
| 4 | React's runtime is reachable from exactly **two** places, both deliberate and named: storybook's `component:` arm, and `draw`'s Excalidraw island. Epic F reduces this to **one** — see E15-8 | The storybook editor still renders the `Panel` and `Text` stories, and the other 43 stories still render through `view:` |

**What must not be claimed.** E15 does **not** remove React from the renderer, and no task may
say so. After E15, `react` is still installed, still imported by ~80 files for its *types*, and
still executed for two stories. Statement 4 is deliberately a statement about *reachability*, not
absence. See E15-8.

---

## E15-2 — Seven corrections, three confirmations — and one of the corrections is mine

E14's close record instructed E15 to **re-measure every figure rather than inherit it**. Doing so
confirmed more than it corrected, which is itself worth recording — this is the first handoff in
the programme that mostly survived contact.

**Confirmed exactly.** The five bodies measure **199 / 130 / 36 / 13 / 5** markers (graph,
rest-client, env-vars, file-diff, draw) — every figure right. `editors/` is **385** markers and the
whole renderer **403** across **50** non-story `.tsx`. And `GraphBody.tsx` really is the **sole**
consumer of `highlight.ts`'s React form: it is the only file that imports `highlight` and the only
one that calls it. (`GitTreeView.ts`'s `cell.highlight(...)` is an unrelated method on a grid cell,
and the other four importers take `highlightInto`, the native form.)

**Corrected:**

1. **The face count is 21, not 19.**
2. **`EditorErrorBoundary.tsx` cannot die in E15.** The handoff said its "eight consumers are all
   in that list". Measured, the two files have **9 consumer edges across 8 files**, and one of them
   is **not** in the list: `editors/storybook/LivePreview.ts`. `EditorError.tsx` does have exactly
   3 consumers, all bodies, so it dies. `EditorErrorBoundary.tsx` must **survive** — which makes it
   the one React file E15 may not delete despite it dropping to a single consumer.
3. **The `SlotText` → `SlotContent` sweep is not De-React work.** Both aliases include
   `React.ReactNode` — `SlotText = string | React.ReactNode`, `SlotContent = string | Node |
   React.ReactNode`. Unifying them removes a duplicate name, not a React dependency. Worth doing;
   not worth counting. (17 files, 32 references.)
4. **The handoff omits what actually gates Epic F.** ~**260** `React.*` type references across
   **80 files that contain no React runtime at all** — 83 `CSSProperties`, 56 `Ref`, 35
   `HTMLAttributes`, 33 `ReactElement`, 15 `ReactNode`. `npm uninstall react` waits on those, not
   on the five bodies. See E15-8; this is explicitly **not** E15's work.
5. **`Popover` and `Dialog` are not React components to convert.** Both are already
   `VanillaView` classes, instantiated with `new PopoverView(...)` by native code across board,
   browser and grid. What survives in each is a **residual React path beside an already-native
   one** — `PopoverView.tsx:237` returns `<>{this.props.children}{resizeHandle}</>` and has a
   native `document.createElement` handle at line 248; `DialogView.tsx:161` returns a fragment
   holding `<DialogCommitSignal onCommit={...}/>`. The work is deleting a branch, not writing a view.
6. **Only 2 stories hold the React `component:` arm**, not the harness generally — `Panel.story.tsx`
   and `Text.story.tsx`, exactly the two the roadmap's Epic F table predicted. 43 of 45 use `view:`.
7. **My own error, found before implementation: `draw` cannot lose React at all.**
   `@excalidraw/excalidraw@0.18.1` declares `react` and `react-dom` as **peer dependencies** and
   ships no non-React entry point (`node_modules/@excalidraw/excalidraw/package.json`: `exports`
   has a single `.` target; `peerDependencies` requires React 17/18/19). `Excalidraw` is a React
   component and `useHandleLibrary` a React hook, both used at `DrawBody.tsx:2`. **No amount of
   conversion removes a React root from this editor.** The original statement 1 promised zero
   non-story `.tsx` in `editors/draw`, which is satisfiable only by moving the same JSX into
   `createElement` calls in a `.ts` file — worse code for no reduction in React. That is the
   "satisfiable by deletion" trap of **C9a** in a new costume: a removal-shaped statement that can
   be met without achieving anything.

   So `draw` is re-scoped (see US-1167 in E15-5) to *shrink* its React surface to a single named
   vendor island rather than eliminate it, and the closing statements above name it as a permanent
   exception. **This also breaks Epic F's premise** — see E15-8, and it is a user decision, not
   this epic's to make.

---

## E15-3 — Instruments: seven failures, and a new rule for overlays

Scoping this epic broke its own instruments five times, and implementing it broke them twice more.
The first five are **the same error**: matching a name without the context that gives it meaning.
Recorded because the programme keeps re-learning it.

| # | Instrument | Failure | Root cause |
|---|---|---|---|
| 1 | react-usage gen 1 | `TreeItemView.ts` (only `React.Ref`) read as real React | matched `<HTMLDivElement>` as a JSX tag — **the generic-type-argument failure E13 already documented**, reintroduced |
| 2 | react-usage gen 2 | every `VanillaView` read as React | matched `document.createElement` as `createElement` — no receiver |
| 3 | react-usage gen 3 | **every** dynamic test silently returned false; the run still printed a plausible table | written through a shell heredoc, which ate one backslash level: `"\\b"` → a literal backspace, `"\\s"` → `s` |
| 4 | face classifier gen 1 | reported **0 faces rendered by app code** | barrel spec `"../../uikit"` resolves to `src/renderer/uikit`, not `…/uikit/index`, so every barrel edge missed |
| 5 | my hand-grep ground truth | said 6 renderers where the instrument said 8 | `grep "<Button[ />]"` uses a **literal space**, so it cannot see `<Button` with props on the next line — the exact bug `e14-faces.mjs` documents as having made E13 read twelve live faces as dead |

**Failures 6 and 7, found during US-1168's live pass, both of which reported a working feature as
broken:**

| # | Failure | Root cause |
|---|---|---|
| 6 | "the revision picker does not open" | the **active page drifted between two scripts**, so the second queried a different page's editor. With restored pages settling asynchronously, any gap between scripts is a gap in which the visible page can change — make open-click-measure a single atomic script |
| 7 | the same false negative, for a second reason | **`offsetParent` is `null` for `position: fixed` elements.** The popover was on screen at 462×286, and the "is it visible" filter this programme has used since EPIC-072 excluded it anyway |

**A third lesson, from implementation rather than scoping: a validation case pinned to a conversion
*target* rots as the work proceeds.** Three of this epic's instruments failed their own known-answer
checks mid-implementation — not because the instrument broke, but because the file the case named had
been converted or deleted. The react classifier's `GraphBody.tsx` case went `ABSENT` after US-1170;
the face classifier's "Button has 8 application renderers" case went to 0 after US-1166…US-1170; and
the `*.tsx`-count case moved every task. Each time the instrument correctly refused to publish
numbers — which is the behaviour that was designed in, and it worked — but each refusal cost a round
trip to re-baseline.

The fix is to pin validation cases to **invariants**, not to targets: "`mount.tsx` calls `createRoot`,
so it is a VALUE user" and "`TreeItemView.ts` references only `React.Ref`, so it is TYPE-only" held
across the entire epic, while every case naming an editor body decayed within one task. When a
measurement script must be trusted across a multi-task epic, choose its known answers from the parts
of the tree the epic is *not* changing.

Failure 7 is a standing correction to the EPIC-072 rule, not a one-off. *"Query the visible element,
not the first match"* was right, but `offsetParent` is the wrong implementation of "visible" for
anything positioned `fixed` — which is every popover, dialog, menu and tooltip in this codebase. Use
`getBoundingClientRect()` or computed style there. **US-1172 converts `PopoverView` and `DialogView`,
so it must not use `offsetParent` in a single assertion.**

Two of these are worse than an arithmetic slip.

**#3 produced a wrong answer that looked right.** Nothing errored; the table was well-formed and
internally consistent. The only reason it was caught is that a validation case demanded VALUE and
got TYPE. **Every measurement script in this programme must carry its known answers and exit
non-zero when one fails** — the gen-4 classifier does, and that is the only reason its numbers are
quotable. A second silent no-op happened the same way minutes later: a `str.replace` that matched
nothing and asserted nothing, so a "tightened" instrument was actually unchanged.

**#4 and #5 together are the new rule.** #4 nearly published a *correction to a correct handoff*:
it "showed" that no face has an application caller, which would have made E14's "faces die with
their last callers" look wrong and reshaped this epic around a phantom. Then #5 had me validating
the fixed instrument against a hand-grep that was itself broken — and briefly treating the
instrument as the faulty one. So:

> **When two cheap instruments disagree, the tie-break is reading the source — never a third
> regex.** And a hand-grep is not ground truth; it is just a cheaper instrument with its own bugs.
> E14 established that at least one of two disagreeing instruments is wrong. E15 adds: *it may be
> the one you are validating against.*

---

## E15-4 — The measured baseline

**JSX and React.** 403 markers across 50 non-story `.tsx` (`editors/` 385 / 19). Of 124 files that
import `react`, **44 use it as a value** and **80 use it only for types**. The `.tsx` extension is
now a poor proxy for React: 24 of the 50 hold no JSX at all.

**The five bodies — 383 of the 403 markers, and all the real work:**

| Body | markers | non-story `.tsx` | `.tsx` lines | notes |
|---|---|---|---|---|
| `graph` | 199 | 7 | ~3,270 | largest body left; sole consumer of `highlight.ts`'s React form |
| `rest-client` | 130 | 5 | 1,644 | renders the most distinct faces (8) |
| `env-vars` | 36 | 1 | 404 | single file; smallest real conversion |
| `file-diff` | 13 | 2 | 205 | also the sole renderer of `GitTree.tsx` |
| `draw` | 5 | 1 | 163 | Excalidraw host; third-party integration |

Nothing outside these folders imports their `.tsx`; the only cross-folder edge is `drawExport.ts`,
a plain `.ts` used by image/mermaid/svg. **The five are independent of each other and of everything
else** — which is what makes this epic decomposable, and is why E14 split them off.

**The 21 `mountVanilla` faces, by what actually renders them:**

- **15 rendered only by the five bodies** — `Button` (8 renderers), `IconButton` (7), `Input` (5),
  `SegmentedControl` (3), `Spacer` (3), `Textarea` (3), `Checkbox` (2), `DataGrid` (2), `Spinner`
  (2), `Splitter` (2), `GitTree` (1), `Autocomplete` (1), `Select` (1), `SelectableRow` (1),
  `Slider` (1). Every renderer, without exception, is one of the 14 body files.
- **4 with no renderer at all, kept alive purely as props-type homes** — `Dot`, `ListBox` (13 type
  users), `Tag`, `SecondaryViews`.
- **2 unreferenced outright** — `BoardScreenshot.tsx`, `NotebookBody.tsx`. Deletable today.

**What survives E15 by design:** `Panel.tsx`, `Text.tsx` and their two `component:` stories;
`EditorErrorBoundary.tsx` (storybook); `mount.tsx` and `fill-slot.ts`'s React arm (reachable from
those stories); `GlobalStyles.tsx` (Emotion, Epic F); React hooks in `core/state/model.ts`,
`ComponentQueue.ts` and five cache/helper modules; and the ~260-reference type surface.

---

## E15-5 — The cut

Ordered smallest-first, so the pattern is established on a 400-line body before the 3,270-line one.
Each body is independent; a stall in one blocks nothing except the two sweeps at the end.

1. **US-1165 — delete the two unreferenced faces.** `BoardScreenshot.tsx`, `NotebookBody.tsx`. Zero
   renderers, zero type users, verified. Pure deletion, no behaviour, no dependency.
2. **US-1166 — `env-vars`.** One file, 404 lines, 36 markers. Establishes the pattern: which faces
   get native equivalents, how the error boundary is replaced, how the body's state binds.
3. **US-1167 — `draw`, re-scoped: reduce it to a minimal vendor island.** React cannot leave this
   editor (E15-2 correction 7). What *can* leave is everything around the vendor component: the
   `Panel`/`Spinner` chrome, `EditorError`, the click handler, the debounce, the URL-change
   subscription and the theme wiring all go native, and `DrawBody.tsx` shrinks to an island whose
   only job is to render `<Excalidraw>` and call `useHandleLibrary`. The island keeps its `.tsx`
   and its React root, named and documented as a vendor exception. This is worth doing under
   *either* answer to the Epic F question below, which is why it is not blocked on it.
   **Do not** convert the island to `createElement` in a `.ts` file to satisfy a file-extension
   count — that is the trap correction 7 describes.
4. **US-1168 — `file-diff`.** 205 lines, 13 markers, 2 files. Also retires `GitTree.tsx`, whose
   only renderer is `RevisionPicker.tsx`.
5. **US-1169 — `rest-client`.** 1,644 lines, 130 markers, 5 files. Renders 8 distinct faces; the
   `WithMenu` React face has 3 renderers, all here.
6. **US-1170 — `graph`.** ~3,270 lines, 199 markers, 7 files. Also converts `highlight.ts`'s React
   form to the native `highlightInto` path, whose last consumer this is.
7. **US-1171 — retire the 19 remaining faces.** Relocate each props interface to its native module
   *first*, repoint importers, then delete. Blocked on tasks 2–6.
8. **US-1172 — strip the residual React paths.** `PopoverView.tsx` → `.ts` (drop the fragment
   branch, keep the native resize handle), `DialogView.tsx` → `.ts` (drop `DialogCommitSignal`,
   keep the focus pass), delete `Icon.tsx`, and replace `EditorError.tsx` with E14's
   `NativeEditorErrorView`. Blocked on tasks 2–6.

**Non-goals**, each because it belongs to another epic and bundling it would recreate E14's failure
mode of an epic that cannot close: the React type surface (Epic F), `Panel.tsx`/`Text.tsx` and
their stories (Epic F, per C1's explicit no-vanilla-twin decision), the state primitives' hooks
(Epic B/F), `GlobalStyles.tsx` (Epic F), and the `SlotText` unification (worth doing, not De-React).

---

## E15-6 — Concerns

Carried from E14 because they are live here: **C1** (make implicit teardown explicit), **C1a**
(ownership on a shared key — ignoring and disposing are not interchangeable), **C9a** (a proof of
absence is not a proof of presence).

**C12 — a `.tsx` file is now more likely to be a type home than a React component.** 24 of 50
non-story `.tsx` hold no JSX; `Input.tsx` has 24 props-type users and 5 renderers, `ListBox.tsx`
has 13 type users and **zero** renderers. Deleting a face without relocating its props interface
breaks native views that never touched React. This is why US-1171 relocates before deleting, and
why "delete the face" is never a safe-looking one-line change.

**C13 — the React type surface is not React, and must not be swept up by accident.** A task that
converts a body will be tempted to "finish the job" on `React.CSSProperties` in a neighbouring
file. It must not: 260 references across 80 files is Epic F's blocker, and a conversion task that
grows into it stops being reviewable. Flag it, leave it.

**C14 — `PopoverView` and `DialogView` each have two live paths, and the native one is not the
obvious one.** `PopoverView` holds both a React fragment branch and a `document.createElement`
resize handle; deleting the wrong branch silently loses the resize affordance, which no root count
would notice. Both views have live native callers in board, browser and grid — surfaces E14 could
not reach — so **US-1172 needs an interactive pass, not a structural proof** (C9a).

**C15 — `EditorErrorBoundary.tsx` is a deliberate survivor.** It will drop to one consumer and look
deletable. It is not: storybook's `component:` arm renders through it. A task that deletes it
breaks the two `component:` stories, and typecheck will not complain about a story that still
compiles but no longer has a boundary.

**C16 — validate instruments against source, and make them fail loudly.** From E15-3: every
measurement script carries known answers and exits non-zero on a miss; when two instruments
disagree, read the code rather than writing a third regex; never write a regex-bearing script
through a heredoc; and never trust an edit whose match was not asserted.

**C18 — a vendor's framework choice is not convertible, and a removal-shaped statement can hide
that.** `draw` was scoped as a 163-line, 5-marker body — the second-easiest task in the epic — and
it is in fact the only one that cannot reach the goal, because `@excalidraw/excalidraw` requires
React by contract. The scoping measured markers, files and lines, and every figure was right; what
it never asked was *what does this file import, and can that thing exist without React?* Before
scoping any future conversion, list the target's third-party imports and check each one's
`peerDependencies`. The generalisation of **C9a**: a statement phrased as a removal can be
satisfiable-but-pointless as well as satisfiable-by-deletion — moving JSX into `createElement`
calls in a `.ts` file would have "met" the original statement 1 while changing nothing.

**C17 — the browser and board surfaces E14 could not reach are now dependencies of this epic.**
E14 conceded navigation, downloads, bookmarks, Tor, incognito, suggestions, tab drag-and-drop and
the hover preview as *unverified*. `PopoverView` is what the hover preview and the downloads popup
are built from, and US-1164 (the toolbar button order) was a second defect found by a user in that
same region. **An interactive pass over browser and board should happen before US-1172**, not after.

---

## E15-7 — What "Epic E is finished" will and will not mean

**Will:** no editor in Persephone produces a React element; every editor mounts through a native
per-page path (E14) with a native view (E15); the face layer is gone; `editors/` measures **0** JSX
markers, down from 542 at E14's start.

**Will not:** React uninstalled, `react` unimported, or zero React roots in a live session. A
storybook page showing the `Panel` story will still create a root — correctly, by design, and that
is Epic F's to remove. **And an open `draw` page will still create a root, which Epic F cannot
remove either** (E15-2 correction 7). E15's live verification must therefore measure roots **per editor**, not
per application: the honest claim is *opening any of the four fully-converted editors adds no React root, and `draw` adds exactly one, in its vendor island*,
and a whole-app count of zero is not achievable in this epic.

---

## E15-8 — Handoff to Epic F, measured

**Epic F's opening line is superseded by a user decision (2026-08-27): React stays, scoped to the
Excalidraw editor alone.** The roadmap's Epic F began *"Delete `react-dom`, then `react`, …"*. That
is not achievable: `@excalidraw/excalidraw@0.18.1` declares `react` and `react-dom` as
`peerDependencies`, offers no non-React entry point, and is described upstream as *"Excalidraw as a
React component"*. The framework-free half of that package (`@excalidraw/element`,
`@excalidraw/utils` — both declare no React) exists only under prerelease tags
(`0.18.0-f0063e113`, `0.1.3-test32`), so it is not a dependency to pin today.

**The decided terminal state of the programme is therefore:** `react` and `react-dom` remain
installed, and the **only** place either may be imported or executed is the `draw` editor's
Excalidraw island. Everything else on Epic F's list still happens — `@emotion/*`,
`react-markdown`, `@types/react*`, `@monaco-editor/react`, `react-tooltip`,
`eslint-plugin-react-hooks`, the UIKit React wrappers, the adapters, and the ~260-reference React
**type** surface.

**Explicitly out of scope, by the same decision:** moving Excalidraw into persephone-boards. That is
a plausible future route — it would need board functionality enhanced first, and it would remove the
last React dependency as a side effect — but it is *not* De-React work and no task in this programme
may drift into it.

**This gives Epic F a closing statement that can be enforced rather than asserted**, which is the
C9a discipline applied to the programme's own ending. Today **116 files import `react`** (39 as a
value, 77 for types only), so the rule cannot be switched on yet. When the type surface is gone,
Epic F's last task should add a local ESLint rule — the repo already has a local plugin from
EPIC-071 — forbidding any import of `react`/`react-dom` outside `src/renderer/editors/draw/**`.
Then "React is confined to Excalidraw" stops being a claim in a document and becomes a build
failure if it ever stops being true. Baseline to drive it down from: **116 importers**.

So Epic F inherits, with figures taken in this epic rather than asserted:So Epic F inherits, with figures taken in this epic rather than asserted:

- **The type surface** — ~260 `React.*` references across 80 files with no React runtime: 83
  `CSSProperties`, 56 `Ref`, 35 `HTMLAttributes`, 33 `ReactElement`, 15 `ReactNode`, 11
  `MouseEvent`, 5 `DragEvent`, 3 `SyntheticEvent`, plus `InputHTMLAttributes`,
  `ButtonHTMLAttributes`, `LabelHTMLAttributes`, `UIEvent`, `RefObject`, `Dispatch`. This is the
  actual blocker on `npm uninstall react`.
- **Storybook's React arm** — `storyTypes.ts`'s `component: ComponentType<P>` and
  `previewChildren?: () => ReactNode`, `LivePreview.ts`'s `React.createElement`, and the two
  stories that use them. Removing it requires deciding what replaces `Panel` and `Text`'s only
  regression net.
- **`Panel.tsx` / `Text.tsx`** — 14 and 8 body renderers today, so after E15 they are held **only**
  by those two stories plus `EditorError.tsx`'s replacement.
- **The React runtime bridge** — `mount.tsx` (`createRoot`) and `fill-slot.ts`'s React arm.
- **Hooks outside views** — `core/state/model.ts` and `ComponentQueue.ts` (`useEffect`/`useRef`,
  the reactive bridge, Epic B territory), plus `api/board-updates.ts`,
  `components/icons/favicon-cache.ts`, `editors/board/board-icon-cache.ts`, `board-usage-cache.ts`,
  `ui/sidebar/pinned-items.ts` — five modules exporting hooks whose React consumers E15 removes,
  so they should be re-measured for deadness rather than converted.
- **`GlobalStyles.tsx`** — the one Emotion importer, and the last React root in a normal session.
- **`SlotText`/`SlotContent`** — 17 files, 32 references; a naming unification, not a removal.

The next free epic number is **EPIC-074**; the next free task number after this epic's is
**US-1173**.

---

## E15-9 — Tasks

| Task | Scope | Blocked by |
|---|---|---|
| US-1165 | Delete `BoardScreenshot.tsx`, `NotebookBody.tsx` | — |
| US-1166 | Convert `env-vars` | — |
| US-1167 | Convert `draw` | — |
| US-1168 | Convert `file-diff`, retire `GitTree.tsx` | — |
| US-1169 | Convert `rest-client` | — |
| US-1170 | Convert `graph`, retire `highlight.ts`'s React form | — |
| US-1171 | Relocate props types, delete the 19 remaining faces | US-1166…1170 |
| US-1172 | Strip React paths from `PopoverView`/`DialogView`, delete `Icon.tsx`, `EditorError.tsx` → `NativeEditorErrorView` | US-1166…1170 |

## E15-10 — Progress

- [x] US-1165 — delete the two unreferenced faces
- [x] US-1166 — `env-vars`
- [x] US-1167 — `draw`
- [x] US-1168 — `file-diff`
- [x] US-1169 — `rest-client`
- [x] US-1170 — `graph`
- [x] US-1171 — retire the face layer
- [x] US-1172 — strip the residual React paths


---

## E15-11 — Close record

### The closing property, assessed honestly

| # | Statement | Verdict |
|---|---|---|
| 1 | Zero non-story `.tsx` under the four fully-converted bodies; `draw` excepted | **Met.** `find` over `graph`, `rest-client`, `env-vars`, `file-diff` returns nothing. `editors/` holds exactly one `.tsx`: `ExcalidrawIsland.tsx`. Presence: all five editors open and render — graph draws its canvas, rest-client builds a request, env-vars lists namespaces, file-diff shows a diff, draw shows the Excalidraw canvas |
| 2 | No file matches `return mountVanilla(` | **Met.** 21 → 0 faces. Presence: tab labels, tree rows and button contents all still render, which is the evidence the relocated props types survived |
| 3 | `PopoverView`/`DialogView` are `.ts` with no React path | **Met structurally**, partly unverified live. Both are `.ts` with no `react` import. A popover opens at 462×286, `position: fixed`, 0 React roots inside. **The resize affordance and the dialog commit/focus pass were not exercised** — see below |
| 4 | React's runtime reachable from exactly **two** places | **Not met as written — the statement undercounted, and that is my error.** There are **three**: `GlobalStyles`, mounted at `index.tsx:15` as "the sole startup React root" and live in *every* session; storybook's `component:` arm; and `draw`'s Excalidraw island. The rest of this document acknowledged `GlobalStyles` throughout (E15-4, E15-7); statement 4 simply failed to count it. Corrected here rather than quietly reinterpreted |

**Measured, start → close.** JSX markers **403 → 10**; `editors/` **385 → 2**; non-story `.tsx`
**50 → 9**; `mountVanilla` faces **21 → 0**; `react` importers **116 → 84**; React *runtime* users
**39 → 14**. All 14 `effect()` registrations in `graph` are gone, as is the last
`ReactDOM.createPortal` in the editors. `highlight.ts`'s React form, `WithMenu.tsx`, `Icon.tsx` and
`EditorError.tsx` are deleted; `fill-slot.ts`'s React arm and four uikit views' `createElement` uses
are gone, all five proven dead before removal.

### The finding that outlasts the epic: a sized element is not a rendered one

Two defects reached the tree, and **both passed every structural check**:

1. **The Excalidraw island host collapsed to zero height** (US-1167). The host `div` is an element
   the React original did not have — `<Excalidraw>` was the wrapper's direct child. Created bare it
   is `display: block; height: 0`, and Excalidraw's own container is `height: 100%`, so it resolved
   against zero. Measured: `draw-root` 1507×951 → wrapper 1507×951 → **host 1507×0** → canvases
   1507×0.
2. **The graph never rendered** (US-1170). The React original's `canvasRef` did two things —
   `editor.renderer.setCanvas(el)` and `canvasRefSetter?.(el)`. The conversion kept only the
   *unmount* half, so `ForceGraphRenderer` never received the canvas: no simulation, no drag/zoom,
   no `handleResize()` — leaving the **backing store at the HTML default 300×150 while the element
   measured 1557×949** — no `ResizeObserver`, and the already-loaded data never applied.

At the moment each shipped, the readings were: 0 React roots in the editor (or 1 on the correct host
for draw), no crash, correct element geometry, and for graph a footer correctly reporting "6 nodes"
from the model. Every one of those was true. The features were blank.

The rule, a strict generalisation of **C9a**:

> **A sized element is not a rendered one.** Element geometry, React-root counts, crash checks and
> model-derived labels are all *upstream* of rendering. For a canvas, read the **backing store**
> (`canvas.width/height`, not CSS size) and a **pixel histogram** — an unrendered canvas is one
> uniform transparent colour. For a nested host, walk the height chain and find where it goes to
> zero. Neither defect was findable any other way, and both were found within minutes once the right
> instrument was used.

Corollary, now proven twice: **introducing a nesting level the original did not have is a layout
change.** `mountVanilla`'s host is deliberately `display: contents` for exactly this reason
(`mount.tsx:86-90`); `mountReactHandle`'s host is a plain `div` the caller must size. Two hosts that
look alike, one exempt and one not.

### Instruments: a third failure class

E15-3 records five scoping failures and two implementation ones. A third class emerged while
closing: **five validation cases went stale mid-epic**, each naming a file the work deleted —
`GraphBody.tsx`, `Button.tsx` (twice, in two different instruments), `WithMenu.tsx`, and the
`*.tsx`-count baseline. Every time the script correctly **refused to publish numbers and exited
non-zero** — the guard designed in at E15-3 did its job seven times — but each refusal cost a
re-baseline.

*Pin known answers to invariants, not to conversion targets.* `mount.tsx` calls `createRoot`;
`uikit/Tree/types.ts` references only React types. Both held across the whole epic, while every case
naming an editor body decayed within one task.

### Two false alarms, both mine

Each produced a confident "the conversion is broken" reading:

1. **A crash caused by an invented fixture.** A hand-written `.rest.json` used `{version, requests}`
   with `body: {kind, text}`; the real schema is `{ type: "rest-client", requests: RestRequest[] }`
   with **`body: string`** (`restClientTypes.ts:19-32`). An object therefore reached
   `monaco.editor.createModel`. The React original would have failed identically.
2. **A stale error state surviving the fix.** With the fixture corrected the page *still* showed the
   crash, because `openRawLink` on an already-open path **reactivates the existing page** rather than
   remounting it — and that page held its crashed state. Opening under a new filename rendered
   correctly. *To re-test a crash fix, open a fresh path.*

**Verify the fixture against the schema, and the page identity, before believing a failure.**

### What the epic learned about its own scope

`draw` was scoped as the second-easiest task — 163 lines, 5 markers — and was the only one that could
not reach the goal, because `@excalidraw/excalidraw` requires React by contract. The scoping measured
markers, files and lines correctly and never asked *what does this file import, and can that thing
exist without React?* (concern **C18**). The discovery reached past the epic: it invalidated Epic F's
opening line, and the user decided the programme's terminal state is **"React only where a vendor
requires it"**, with relocating Excalidraw into persephone-boards explicitly out of scope.

A correction worth keeping: **removing the draw editor would not free React either.** Four other
files import pure helpers from the same single-entry package, and `drawExport.ts` alone has seven
consumers including the native `image`, `mermaid`, `svg` and `graph` editors.

### Review

`/review` found **six** must-fix items, all applied and re-verified live: four editor `index.ts`
files declared lifecycle fields with `!` rather than the codebase's established `| undefined`
pattern (`notebook/index.ts:224,227`); `GraphBodyView` dereferenced `tooltip!` four times inside a
closure; and its loading `SpinnerView` was constructed with `new` rather than `this.child(...)`, so
its cleanup never ran — a real **C1** violation. `/document` updated six developer-doc areas.
`/userdoc` found no user-facing change warranted, which is correct: this epic changed no behaviour by
design.

### Still unverified, cheapest and highest-value first

Recorded as *unverified* rather than replaced with a measurement of a different property (C9a):

1. **Dialog open → commit → focus pass.** `DialogCommitSignal` became a native scheduled focus pass
   and no dialog was opened. **Highest-value remaining check.**
2. **Popover resize.** Reachable *only* through `uikit/Popover/Popover.story.ts` — no application
   caller sets `resizable`, which also means that path has no app consumer at all.
3. **Graph interaction** — node select → detail panel, hover tooltip positioning, legend contents,
   expansion/tuning sliders, search highlighting through `highlightInto`.
4. **Rest-client's Monaco hosts** — both sit behind a `SegmentedControlView` switch a synthetic click
   cannot drive, so `MonacoEditorHostView` under rest-client is untested at runtime. Sending a request
   needs network.
5. **av-grid editing** in `env-vars` and `file-diff`, and file-diff's revision pick and readOnly rule.
6. **The four repointed stories** compile but were never rendered.
7. **`PopoverView`'s board, browser and grid call sites** — hover preview, downloads popup, column
   options. Only the file-diff picker was exercised.

### Handoff to Epic F

- **The React type surface** — ~**70** files import `react` for types only. This, not the editors, is
  the blocker on uninstalling anything.
- **The enforceable closing statement.** Epic F's last task should add a local ESLint rule (the repo
  has had a local plugin since EPIC-071) forbidding `react`/`react-dom` imports outside
  `editors/draw/**`. Baseline to drive down: **84 importers**, of which **14** use React as a value.
  Then "React is confined to Excalidraw" becomes a build failure rather than a claim in a document.
- **The three live React roots** — `GlobalStyles` (Epic F), storybook's `component:` arm with
  `Panel.tsx`/`Text.tsx` and `EditorErrorBoundary.tsx`, and the Excalidraw island (permanent).
- **Seven hook-exporting modules** whose React consumers this epic removed —
  `api/board-updates.ts`, `components/icons/favicon-cache.ts`, `core/state/model.ts`,
  `core/state/ComponentQueue.ts`, `editors/board/board-icon-cache.ts`,
  `editors/board/board-usage-cache.ts`, `ui/sidebar/pinned-items.ts`. **Re-measure these for deadness
  rather than converting them** — several may now be dead exports.
- **`SlotContent`'s `React.ReactNode` arm** — the runtime branch is gone; the type alias remains.
- The next free epic number is **EPIC-074**; the next free task number is **US-1173**.

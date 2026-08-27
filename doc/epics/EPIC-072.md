# EPIC-072 — De-React E14: the `Component` arm dies

**Status:** Complete
**Completed:** 2026-08-27
**Created:** 2026-08-27
**Roadmap:** [de-react.md](../de-react.md) — Epic E, fourteenth epic
**Predecessor:** [EPIC-071](EPIC-071.md) (E13 — the editor bodies that still build React)

---

## Closing property

E13 reduced `EditorModule.Component` from eight callers to two. Those two — `board` and `browser` —
are the last editors in the application whose module hands the registry a React component instead of
a `VanillaView` constructor, and while either survives the registry must keep both arms plus a
`mountVanilla` normalisation shim to bridge them.

This epic closes when the arm does not exist. Four statements, each checkable:

| # | Statement | Instrument |
|---|---|---|
| 1 | `EditorModule` has **one** view arm. No `Component` field, no `React.ComponentType` in `editorRegistry.ts`, and `loadModule()` contains no `mountVanilla` normalisation branch. | `grep -n "Component" src/renderer/editors/base/editorRegistry.ts` returns only unrelated words; the file has no `react` import |
| 2 | `board` and `browser` produce **no React element**. | `e14-jsx.mjs` (gen-4 stripper, §E14-3) reports 0 markers for every file under `editors/board/` and `editors/browser/`; neither folder holds a non-story `.tsx` |
| 3 | No React root is created **per list row** anywhere in `ui/sidebar`. | The `TrustedBoardsListView` / `TrustedToolsListView` subtree contains **zero** `[data-react-root]` — an absolute, so it holds at any row count and needs no baseline (US-1154) |
| 4 | `@floating-ui/react` is not a dependency, and the two hosts still work: a board's iframe re-handshakes its `MessagePort` after a reload, and each browser tab holds exactly **one** connected `<webview>`. | `package.json`; a live pass per §E14-7 C3/C4 |

**What must not be claimed.**

- **Not a total root count.** E13 established that Rule 4 has no content-independent form on a
  virtualised surface: the figure is a function of how much data exists and how much is on screen.
  Statement 3 is deliberately a *derivative* — does the count move with the row count — not a level.
- **Not a `.tsx` file count.** 42 of the renderer's 85 non-story `.tsx` files hold **zero** JSX
  (§E14-4). The extension stopped measuring React in E11 and has drifted further since; US-1159 exists
  to retire the residue, and its completion changes no behaviour and must not be reported as progress
  against React.
- **Not "the editors are React-free".** After this epic three editor bodies still build React
  (`graph`, `rest-client`, `env-vars`) plus two small ones, and `uikit/` still holds React internally.
  Statement 2 is about two folders, not about `editors/`.

---

## E14-1 — The scoping correction: this is not the last epic in Epic E

EPIC-071's close record states that *"E14 is the last epic in Epic E"* and hands it a single list:
`graph`, `rest-client`, `browser`, `board`, `env-vars`, `file-diff`, `draw`, `EditorError.tsx` — 535
markers. That same record also instructs its successor to **re-measure every blocker rather than
inherit the paragraph**. Doing so changes the answer, so this epic is scoped against the measurement
and not against the inheritance.

The measurement (§E14-4) says the seven-editor list is two jobs with different shapes:

- **`board` + `browser` are one atomic unit.** 157 markers across 15 files. The `Component` arm cannot
  be deleted until *both* are converted — one remaining caller keeps the whole two-arm registry, the
  shim, and the `React.ComponentType` import alive. They are also the only two editors in the
  programme that host a foreign document (a cross-origin `iframe`; a per-tab `<webview>`), which is a
  lifetime problem no earlier conversion has met.
- **`graph`, `rest-client`, `env-vars`, `file-diff`, `draw` are five independent bodies.** 383 markers
  across 16 files, no shared contract, no ordering constraint, nothing gated on them. Exactly E13's
  shape, decomposable to any granularity, and incapable of blocking anything.

Combining them produces an epic that **cannot close if either webview conversion stalls**, with 383
markers of unrelated work stranded inside it. Splitting puts the atomic unit in an epic of its own,
where a stall is contained and where the arm's removal — the structural milestone — is the epic's
whole point rather than its last task.

**The order is deliberate: the risky bounded unit goes first.** The five bodies have no blocker and
can be done at any time; the two hosts are the only thing that can prevent Epic E from closing at all.
Discovering a webview-hosting problem now, with four epics of Epic E remaining as slack, is worth
more than discovering it last, when it is the sole obstacle and there is nothing left to reorder
around it. E15 then becomes Epic E's genuine last epic, and by then it inherits only work that is
known to be safe.

---

## E14-2 — Four things the close record has wrong, measured

Recorded because the record is the handoff and a successor reading it would act on all four.

**1. `board` does not host a `<webview>`.** Both the close record and E12's survivor rationale
describe *"the two editors that host a `<webview>`"*. `browser` does — `Electron.WebviewTag`, one per
tab (`BrowserView.tsx:53,186`). `board` hosts a **cross-origin `<iframe src="board://<host>/index.html">`**
(`BoardWebview.tsx:26-30`, and the file's own doc comment says so: *"iframe in EPIC-037"*). The
filename is the trap. The distinction is load-bearing, not cosmetic: an iframe's isolation comes from
the `board://` origin plus `nodeIntegrationInSubFrames:false` plus the served CSP, and its privileged
bridge is a `MessagePort` handshake re-run on every `load`. None of that is `<webview>` machinery, and
a plan written against `<webview>` semantics would target the wrong lifecycle.

**2. The `Component` arm is not a webview constraint.** The record's framing implies the arm survived
*because* these editors host foreign documents. It did not. Both `Component` implementations are
three-line JSX wrappers:

```tsx
function BoardEditorComponent({ model }: { model: EditorModel }) {
    return <BoardEditorView model={model as BoardEditorModel} />;
}
```

The arm survives only because `BoardEditorView` and `BrowserEditorView` are still React components.
It falls out the moment those two views are native — there is no hosting reason for it to exist. That
makes the arm's deletion a **consequence** of this epic's two conversions rather than a separate
problem, which is the second reason to scope the epic this way.

**3. `@floating-ui/react` is gated on one file.** The record lists the uninstall alongside eighteen
faces and three contracts, implying it is blocked on the whole sweep. It is not: there is exactly one
importer in the entire tree, `editors/browser/BrowserTabsPanel.tsx`. `@floating-ui/dom` is separate
and stays. So the uninstall is US-1157's acceptance criterion, not a project.

**4. The marker figure is 542, not 535.** Small, and the direction is instructive — see §E14-3.

---

## E14-3 — Instrument validation: three failures inside one scoping session

E13's most durable finding was that *a grep counts occurrences of a string; a measurement counts
occurrences of a behaviour*, and its corollaries: **narrowing a pattern is not validating it**, and
**validation costs one line — run the instrument against a case whose answer you already know.**

E13 corrected itself four times. Scoping E14 produced three more failures **before a single number
was written down**, which is the first time in this programme that the validation step ran early
enough to catch them all. Recorded because the pattern is now unmistakable and because two of the
three are new shapes.

| Instrument | Read as | Actually | Cause | Direction |
|---|---:|---:|---|---|
| `find … ! -name "*.stories.tsx"` | 87 non-story `.tsx` | **85** | The repo's convention is `*.story.tsx`, singular. The exclusion matched nothing and silently excluded nothing. | inflated |
| face → caller scan, import-gated | **0** callers for every face | 4 for `WithMenu` alone | The import gate tested the *stripped* source, and stripping empties string literals — so every module path became `""` and no path ever matched `/uikit/`. | erased the entire result |
| JSX marker count (E13's own gen-3 stripper) | `FileDiffBody.tsx` = **0** markers | **5** | `FileDiffBody.tsx:61` renders the JSX text *"this file **isn't** in a git repository"*. The stripper treats that apostrophe as a string opener and swallows every marker to the end of the file. | under-reported |

The third is the one that matters, because **it is the instrument E13 published its headline
`1,337 → 535` with**. Corrected, `editors/` measures **542**. The error is small in aggregate and
severe per file: any file whose JSX prose contains a contraction under-reports, and one reported zero
while holding a fully React body. Had E14 inherited that list, `file-diff` would have been filed as
already converted.

The failures share the shape E13 named, now stated in its sharpest form: **every one of these
instruments failed on entirely ordinary content** — a naming convention the repo uses everywhere, a
module path in quotes, an English contraction. None failed on anything exotic. An instrument that
only survives unusual input is not a strict instrument; it is an instrument that has not met its own
codebase yet.

Two additions to the rule:

- **When two instruments disagree, at least one is wrong, and it is worth knowing which before
  either number is used.** Both defects above were found that way: the marker scan said
  `FileDiffBody.tsx` had no JSX while the caller scan said it used three faces. Cross-checking two
  cheap instruments against each other is a better validator than making one instrument careful,
  because it needs no ground truth to be prepared in advance.
- **The caller scan's type-only column is unreliable and is not used.** Detecting a *type* use needs
  an import test; word-presence over-reports badly (`Text` matched 106 files, including
  `content/encoding.ts` and `core/utils`). Only the value column — a JSX opening tag or an explicit
  `createElement` — is quoted anywhere in this epic. The programme has published type-only face
  counts before; they should be treated as upper bounds.

The gen-4 stripper (`scratchpad/e14-jsx.mjs`) treats `'` and `"` as string delimiters **only when the
partner appears on the same line** — a JS string literal cannot span an unescaped newline, so nothing
real is lost and JSX prose survives. It is validated in-file against three known answers before use.

---

## E14-4 — The baseline

Static, measured 2026-08-27 with the gen-4 instrument. All non-story `.tsx` under `src/renderer/`.

**React-producing code, by subsystem** (markers / lines / files):

| Subsystem | Markers | Lines | Files | E14? |
|---|---:|---:|---:|---|
| `editors/graph` | 199 | 3,278 | 7 | — E15 |
| `editors/rest-client` | 130 | 1,649 | 5 | — E15 |
| `editors/browser` | **111** | **1,479** | **8** | **yes** |
| `editors/board` | **46** | **865** | **7** | **yes** |
| `editors/env-vars` | 36 | 405 | 1 | — E15 |
| `editors/file-diff` | 13 | 207 | 2 | — E15 |
| `ui/sidebar` | **6** | **247** | **2** | **yes** |
| `editors/draw` | 5 | 164 | 1 | — E15 |
| `uikit/Popover` | 4 | 414 | 1 | — E15 |
| `ui/app` (`EditorErrorBoundary`) | **4** | **30** | **1** | **yes** |
| `uikit/Dialog` | 3 | 213 | 1 | — E15 |
| `uikit/Menu` (`WithMenu`) | 2 | 74 | 1 | — E15 |
| `editors/base` (`EditorError`) | **2** | **24** | **1** | **yes** |
| `theme/GlobalStyles.tsx` | 1 | 161 | 1 | — Epic F |
| `uikit/shared/mount.tsx` | 1 | 160 | 1 | — the boundary primitive; stays |
| `uikit/{Panel,Text,Icon}` | 3 | 265 | 3 | — E15 |
| **Total** | **566** | | **43** | **169 markers in E14** |

`editors/` alone is **542** markers across 36 files.

**And 42 of the 85 non-story `.tsx` files hold zero JSX.** They fall into two clean groups, which is
the structural fact this epic acts on:

- **15 are native `VanillaView` classes sitting in a `.tsx` file.** `ButtonView`, `CheckboxView`,
  `CollapsiblePanelStackView`, `DialogContentView`, `DotView`, `IconButtonView`, `InputView`,
  `LabelView`, `AlertItemView`, `PathInputView`, `SegmentedControlView`, `SelectableRowView`,
  `SliderView`, `SpinnerView`, `TagView`. **Eight reference React not at all**; the other seven
  reference it only for prop types, which a `.ts` file imports perfectly well. This is pure extension
  debt — the file is native, the extension says otherwise, and every `.tsx`-based count in this
  programme has been reading it as React (US-1159).
- **19 are the `mountVanilla` face shims** — `Checkbox.tsx` is three lines around
  `mountVanilla(CheckboxView, props)`. These are React *entry points*, not React implementations. They
  are the correct measure of remaining React surface and they die when their last value caller dies,
  which is why this epic touches none of them.

**Live baseline: [US-1154](../tasks/US-1154-e14-baseline/README.md), captured 2026-08-27.** The app
measures **9** React roots, and **7 of them are the browser**: five `page-slot<webview-area<browser-body`
— **one per open tab** — plus two toolbar roots, one of them nested inside the other. `board`
contributes exactly one, its whole React tree being a single `Component`-arm mount. The remaining root
is `GlobalStyles`. **So `browser` carries a per-open-tab root term**, the same content-dependent shape
E13 found in `tools-hub`'s rows, and it is why E13 could report one root across seventeen tabs: no
browser page was open. Three things could not be measured and are recorded there with their reasons —
in particular `page-slot` **is not a partition** (a browser tab is a `page-slot` inside the browser's
own `page-slot`, so a naive per-slot digest double-counts every tab into its parent).

---

## E14-5 — The cut

**In scope: 169 markers, 19 files, 2,645 lines.**

| Target | Files | Why it is here |
|---|---|---|
| `ui/sidebar/TrustedBoardsListView.tsx`, `TrustedToolsListView.tsx` | 2 | The largest measured React concentration in the app, and independent of everything else |
| `editors/board/` | 7 — `BoardEditorView`, `BoardWebview`, `BoardToolbar`, `BoardGlyph`, `BoardNotFoundView`, `UntrustedBoardView`, `index.tsx` | Half the atomic unit |
| `editors/browser/` | 8 — `BrowserView`, `BrowserTabsPanel`, `BookmarksDrawer`, `TorStatusOverlay`, `UrlSuggestionsDropdown`, `DownloadButton`, `BrowserSecondaryViews`, `index.tsx` | The other half; carries the `@floating-ui/react` uninstall |
| the native failure path (`ui/app/AsyncEditorView.ts`, `VanillaView.mount()`, `PageSlot`) | 0 new | Establish what the user sees when a native editor throws, once US-1158 removes the React arm from the registry. **Neither `EditorError.tsx` nor `EditorErrorBoundary.tsx` is deleted here** — see the correction below |
| `editorRegistry.ts` | — | The arm and the shim |
| 15 native `*View.tsx` | 15 renames | Extension debt; behaviour-neutral |

**`ui/sidebar` first, deliberately.** It is 6 markers, it is independent of the atomic unit, and it
closes the epic's statement 3 on its own. Doing it first means the epic has delivered its highest
measured value before the two risky conversions start — and if `browser` turns out to be a
multi-epic problem, statement 3 has already landed.

---

## E14-6 — The two hybrids, and why they are the interesting part

Every conversion so far has been *React component → native view*. Both files in this epic's most
delicate task are already **hybrids**, in opposite directions, and each is a distinct lesson.

**Native container, React content — `TrustedBoardsListView.tsx`.** It is already a `VanillaView`
(both call sites use `new TrustedBoardsListView({})`). It builds its rows natively and then calls
`fillSlot` (`:155`) to mount a React root for each row's **trailing** content — an `IconButton` plus a
`Tag` (`:32,85-86`). That is one React root *per rendered row*, which is where E13 measured 24 roots
in a tab that holds one editor. The conversion is small and entirely local: build the trailing content
with the native `IconButtonView`/`TagView` (both already exist, both already zero-JSX) and drop the
`fillSlot` call. Its two callers — `editors/tools-hub/ToolsHubView.ts:109` and
`ui/sidebar/ToolsEditorsPanelView.ts:99` — need no change.

**The lesson is about E12's survivor list.** These two files were named as deliberate survivors —
*"views held by the `tools-hub` and browser editors"* — on the basis of who held them, without
measuring what they cost. **A survivor list of files is not a survivor list of roots**, and one entry
on that list outweighed all eight editors E13 converted.

**React container, native content — `BrowserView.tsx:598-618`.** The browser's per-tab lifetime is
already driven by `PageManager`, a `mountVanilla` face over the native `PageManagerView`; React passes
it a `renderPage` callback that returns a React fragment per tab. So the seam is inverted: converting
`BrowserView` means `renderPage` returns a native view, and the `PageManager` **face** leaves the
browser's path while the native view it wraps stays exactly as it is. This is the cheapest shape a
conversion can have, and it is worth naming because it is invisible in a marker count — 111 markers
overstate `browser` by however much of its structure is already native underneath.

---

## E14-7 — Concerns

**C1 — The `key`-driven remount contract is the epic's real risk.** `BoardWebview.tsx`'s own doc
comment states it: *"Lifecycle is view-driven: the parent keys this component by
`selectedBoard__reloadToken`, so switching/reloading a board unmounts (→ unregister + dispose) and
remounts."* A `VanillaView` has no `key`. That whole contract — unregister the board, dispose the
`MessagePort`, tear down the iframe, then rebuild — must become an **explicit** dispose-and-recreate
keyed on the same token. This is EPIC-068's persistent-child hazard in its most demanding form (*what
React did by not rendering must become an explicit deletion when something always renders*), applied
to **six** `useEffect` blocks and a port handshake rather than to a button. (US-1156's investigation
corrected my count of eight — `BoardWebview.tsx` has six, at `:94,171,238,360,371,394`, plus one in
`BoardToolbar.tsx:47`. It recorded the discrepancy rather than inventing a seventh block to match the
brief, which is the right instinct: **a plan that reconciles itself to a stated number instead of to
the source has stopped measuring.**) **The plan must enumerate
what the remount currently tears down before proposing what replaces it** — a diff of the deleted
file against the new one, which is what resolved E13's settings delta.

**C1a — and the first defect it produced came from converting *too* defensively.** US-1156 landed,
verified clean on the properties this epic measures, and then failed in the user's hands: the board
bridge never connected. Cause — the native port-delivery filter called `port.close()` on a port whose
`boardId` did not match, where the React original simply returned. `api.onBoardPort` is a **global**
subscription, so the non-matching branch is another live frame's port, and closing it killed that
frame's bridge. It needed two mounted board frames, so a one-board-at-a-time verification pass could
not see it.

**The rule this yields is a counterweight to C1, not a footnote to it.** C1 says make implicit teardown
explicit — and that pressure makes *more* disposal feel safer than less. It is not: **when an event
arrives on a shared broadcast, the non-matching branch of the filter belongs to somebody else, so
ignoring and disposing are not interchangeable.** Every `if (notMine)` branch added during a conversion
should be checked for whether it disposes something it merely failed to recognise. Note also that this
class is **invisible to every instrument this epic relies on** — root count, iframe count and
connected-webview count were all correct while the bridge was dead. The only signal was a message in
the board's own log, and the only reason it was found is that a human opened a second board.

**C2 — The browser has already been bitten by exactly this, and the guard is in the code.**
`BrowserView.tsx:62-72` warns on a *"duplicate webview mount for tab … previous webview is still
connected (US-806)"*. A leaked `<webview>` keeps a live guest renderer, so the failure is a resource
leak with no visible symptom — the worst kind for this programme's verification style. That guard must
survive the conversion, and it is also the best available assertion for statement 4: exactly one
connected webview per tab.

**C3 — Verifying `board` means running a board.** Boards are agent-authored and live in their own
folders, so a scratch board is cheap to create and safe to render — unlike `mneme-root`, whose
verification was blocked by policy in E13. There is no reason for `board` to close unverified, and it
should not: the acceptance criterion is a reload that re-handshakes the port, not a green build.

**C4 — Verifying `browser` requires network, or a deliberate substitute.** Tor mode, `about:blank`
tabs, bookmarks, downloads and URL suggestions are seven distinct surfaces. Decide up front which are
verified live and which are conceded, and record the concession the way E13's §E13-17 did —
*unmeasured because the instrument cannot reach it* and *unmeasured because measuring it is not
allowed* are different states, and only the first is worth retrying.

**C5 — Cold restart per task, not per epic.** Both editors are reached through a dynamic `import()`,
which HMR cannot clear after a `.tsx` → `.ts` rename (E11). Every task's verification starts from a
cold dev server. The 15 renames in US-1159 are mostly statically imported, but `uikit` barrels are
imported everywhere; treat the whole batch as requiring a cold start.

**C6 — `mountVanilla` is not going anywhere.** It has ~30 callers and is the programme's boundary
primitive. US-1158 deletes the registry's *use* of it, not the function. A plan that proposes removing
`uikit/shared/mount.tsx` has misread the scope.

**C7 — The error path cannot be removed in this epic, and measuring it said so.** C7 originally
assumed `EditorError.tsx` and `EditorErrorBoundary.tsx` belonged to the registry's `Component` arm and
would fall out with it. They do not. Measured:

| File | Consumers |
|---|---|
| `editors/base/EditorError.tsx` | `draw/DrawBody.tsx`, `graph/GraphBody.tsx`, `rest-client/RestClientBody.tsx` — **all three are E15**. (`grid/GridEditor.ts` matches on a grep but its only mention is a code comment, not a use.) |
| `ui/app/EditorErrorBoundary.tsx` | `draw`, `env-vars`, `file-diff`, `graph`, `rest-client` `index.ts` files — **all five are E15** — plus `storybook/LivePreview.ts` and `ui/app/AsyncEditorView.ts` |

**Neither `board` nor `browser` uses either file.** So deleting them in E14 would mean converting five
E15 editors first, which is precisely the coupling this epic was scoped to avoid. Both deletions move
to E15's inheritance list (§E14-8), where their consumers live.

What *is* E14's is the half of the original concern that survives the correction, and it is the part
that could regress silently. `AsyncEditorView.ts:139-146` wraps a React editor in the boundary **only
on its React arm**; when it takes the vanilla arm there is no boundary, and protection comes instead
from `VanillaView.mount()`'s dispose-and-rethrow rollback and `PageSlot`'s construction rollback (both
added in EPIC-071). After US-1158 the registry mounts native views only, so **every** editor failure
takes that path. US-1160 must establish what the user actually sees on it — a message, or a blank
slot — before this epic claims the arm's removal was safe. Nothing is deleted; the deliverable is
knowledge, plus a native error view if the answer turns out to be "a blank slot".

**The general lesson repeats E14-2's:** a file that *looks* like it belongs to a subsystem — by name,
by folder, by which epic mentioned it — belongs to whoever imports it, and only a consumer scan can
say who that is. `EditorError.tsx` sits in `editors/base/`, the folder the registry lives in, and has
nothing to do with the registry.

**C8 — `board` and `browser` both hold secondary views.** `BrowserSecondaryViews.tsx` and
`board-secondary.ts` register sidebar panels. US-1152 records five pre-existing views in one class —
*a view that accepts a replaceable model but binds as if the model were fixed*. Any secondary view
converted here must not be the sixth. Check `onUpdate()` retargeting explicitly; do not fix the
pre-existing five in this epic.

**C9 — Do not let the 15 renames drift into a refactor.** US-1159 is `git mv` plus import fixes plus a
cold start. Eight files need nothing else. If a rename requires a code change beyond an import
specifier, that file leaves the task and gets recorded — the value of a behaviour-neutral task is
entirely in its being behaviour-neutral.

**C9a — a proof of absence is not a proof of presence, and statement 3 was briefly satisfied by a
bug.** US-1155's live pass was declined as *could not reach the surface* and replaced with a structural
argument: no value on the path into the trusted-boards subtree can create a React root, therefore
statement 3 holds. The argument was sound and the conclusion was true. It was also **vacuous**, because
the close review then found that `trailingElement` was being dropped before the row renderer — the
subtree contained no trailing content at all. Zero React roots in an empty subtree measures nothing.

The cause was an error in the *plan review*, the step this programme spends its most expensive budget
on: the correction asserted the trailing slot was `ListItemView.setTrailing()` and cited real
`ListBox` evidence, but `TreeView` renders `TreeItemView` — a different class with its own
`setTrailing()`. The implementation faithfully forwarded the prop into something that never read it.

Three rules follow, and the third is new to this programme:

1. **Verify which class a call site actually instantiates before reasoning about that class's
   contract.** Two views with the same method name and an overlapping prop vocabulary are not the same
   view, and a symbol search finds both.
2. **Never let a proof of absence stand in for a deferred live pass.** Absence-of-React and
   presence-of-feature are independent claims; a conversion can satisfy the first by breaking the
   second. Where a live pass is genuinely unreachable, say the feature is *unverified* — do not
   substitute a measurement of a different property.
3. **Pair every "it no longer does X" assertion with an "it still does Y" assertion.** Every closing
   statement in this epic is phrased as a removal, which makes them all vulnerable to being satisfied
   by deletion. The board and browser statements were saved from this only because their live passes
   happened to check that an iframe and a webview were *present*.

**C10 — Statement 3 is an absolute, not a difference, and that was a correction.** It was first
written as *same tab, different row count, unchanged root count*, because E13 established that Rule 4
has no content-independent form on a virtualised surface. Capturing the baseline (US-1154) showed a
better instrument: **zero `[data-react-root]` in the list's own subtree**. Zero is content-independent
— it holds for 0 rows and for 1,000 — so it needs no baseline, no second capture, and cannot be
satisfied by luck, whereas "the count did not move" is also satisfied by going from one root per row
to one root per list. The general form is worth carrying forward: **when a count is content-dependent,
do not measure its stability — measure its absence in the subtree that owns it.** As a side effect the
tools-hub editor's unreachability from a script (US-1154, item 1) stops mattering.

**C11 — Eleven concerns was E13's count and it was not padding.** This epic has ten and three of them
(C1, C2, C7) are single points of failure in code with no test coverage and no automatic verification.
If a plan comes back that does not address C1 in detail, it is not ready.

---

## E14-8 — Non-goals

Everything here is deliberate, and each entry names who inherits it.

| Not in E14 | Inherits |
|---|---|
| `graph` (199 markers, 3,278 lines — the largest body left, a canvas, a 1,235-line detail panel, and the last consumer of `highlight.ts`'s React form) | E15 |
| `rest-client` (130), `env-vars` (36), `file-diff` (13), `draw` (5) | E15 |
| `uikit/`'s own React internals — `Popover`, `Dialog`, `WithMenu`, `Panel`, `Text`, `Icon` | E15 |
| `editors/base/EditorError.tsx` and `ui/app/EditorErrorBoundary.tsx` — all eight consumers are E15 editors or the React arm they keep alive (C7) | E15 |
| The 19 `mountVanilla` face shims | They die with their last value caller; no task ever deletes them on purpose |
| `SlotText` → `SlotContent` (15 consumer declarations; EPIC-064's blocker expired in E13) | E15, as a single sweep |
| `theme/GlobalStyles.tsx` — the last Emotion root | Epic F |
| US-1131's two guard gaps (`this.listen()` outside `onMount()`; indirect-subclass coverage) | Its own entry. **The `this.listen()` rule should be measured before this epic's conversions start** — E13's review found that defect three times in new code, and this epic writes two large views. |
| US-1152's five secondary-view rebinding defects | Its own entry (see C8) |
| US-1153's two unverified E13 surfaces | Its own entry |

---

## E14-9 — Tasks

| # | Task | Depends on |
|---|---|---|
| 1 | **US-1154** — live baseline: DOM digests and root counts for `board`, `browser`, and the tools-hub Registered-boards tab at two different row counts (C10), with validated instruments and the registered-board count recorded | — |
| 2 | **US-1155** — `ui/sidebar/TrustedBoardsListView`, `TrustedToolsListView`: native trailing content, `fillSlot` gone. Closes statement 3 | US-1154 |
| 3 | **US-1156** — `board` → View arm: 7 files native, with the `key`-remount contract made explicit (C1) and verified against a scratch board reload (C3) | US-1154 |
| 4 | **US-1157** — `browser` → View arm: 8 files native, one connected `<webview>` per tab (C2), `renderPage` returning a native view (§E14-6), and `@floating-ui/react` uninstalled | US-1154 |
| 5 | **US-1158** — delete `EditorModule.Component`, the `React.ComponentType` type, and `loadModule()`'s `mountVanilla` normalisation branch. `EditorModule` has one view arm. Closes statement 1 | US-1156, US-1157 |
| 6 | **US-1159** — 15 native `*View.tsx` → `.ts`. Behaviour-neutral by construction (C9) | — |
| 7 | **US-1160** — establish the native failure path: what the user sees when a native editor throws, given `VanillaView.mount()`'s rollback and `PageSlot`'s, now that the registry has no React arm. Deletes nothing (C7) | US-1158 |
| 8 | **US-1161** — close measurement against US-1154's baseline, then `/review`, `/document`, `/userdoc` | all |

US-1155, US-1156, US-1157 and US-1159 are independent of one another and can run in any order or in
parallel. US-1158 is the gate.

---

## E14-10 — Progress

- [x] US-1154 — live baseline
- [x] US-1155 — `ui/sidebar` trailing-slot roots
- [x] US-1156 — `board` → View arm
- [x] US-1157 — `browser` → View arm
- [x] US-1158 — delete the `Component` arm
- [x] US-1159 — native views out of `.tsx`
- [x] US-1160 — the native failure path
- [x] US-1161 — close measurement and review
- [x] US-1162 — **mid-epic regression fix**: the board bridge never connected (user-reported). The
  native port filter closed a port whose `boardId` did not match, but `api.onBoardPort` is a global
  subscription, so it was destroying another live frame's bridge. Fixed by testing ownership before
  liveness; generalised as concern C1a, which then found four more instances in the close review
- [x] US-1155a — **review fix**: `TreeItemProps.trailingElement` was declared and forwarded but never
  consumed by `TreeItemView`, so the trusted-boards trailing controls never rendered. See C9a


---

## E14-11 — Close record

**All four closing statements met.**

| # | Statement | Evidence |
|---|---|---|
| 1 | `EditorModule` has one view arm | `grep "Component" editorRegistry.ts` → **no matches**; no `react` import; type is `EditorModuleCommon & { View: VanillaViewCtor<…> }` |
| 2 | `board` and `browser` produce no React element | 0 non-story `.tsx` in either folder; live, both subtrees measure **0** roots (root-inclusive) |
| 3 | No per-row React root in `ui/sidebar` | 0 roots in the list subtree, **and** trailing content verified *present* — see C9a |
| 4 | `@floating-ui/react` gone, both hosts work | absent from `package.json` and the lockfile, 0 importers; board reload re-creates its iframe with a new nonce and detaches the old; each browser tab holds exactly one connected `<webview>` |

**Measured, start → close.** JSX markers **566 → 403**; `editors/` **542 → 385**; non-story `.tsx`
**85 → 50**; `editors/` non-story `.tsx` **36 → 19**; `Component:` callers **2 → 0**; `board`+`browser`
`.tsx` **15 → 0**. Live, with a board, a browser and a markdown editor open: **1** React root
(`GlobalStyles`, Epic F's target), down from 9 at baseline. `PageSlot` and `PageManagerView` are now
fully native, so **every editor in the application mounts through a native per-page path**.

Five files were deleted outright, each because its last caller was converted rather than by decision:
`PageManager.tsx`, `BoardGlyph.tsx`, `BoardsTree.tsx`, `ToolsTree.tsx`, and the registry's
normalisation shim. All verified at zero live references.

### The finding that outlasts it: ownership on a shared key

**This epic shipped a user-visible bug and then found four more of the same shape.** `BoardWebview`
called `port.close()` on a port whose `boardId` did not match — but `api.onBoardPort` is a **global**
subscription, so the non-matching branch is another live frame's port. Closing it destroyed that
frame's bridge; the user saw a board with no data and no chart. The close review then found the same
shape four more times: the browser's `webviewRefs` delete, its `webviewReady` delete, its main-process
IPC registration/unregistration, and the board's CDP frame unregister — the last two keyed in main by a
bare string, so a stale view could unregister a live one.

Stated once, as **C1a**: *when an event or entry arrives on a shared broadcast, map, or registry key,
the thing you did not create belongs to somebody else — ignoring and disposing are not
interchangeable.* And its counterweight matters as much: **C1 tells a conversion to make implicit
teardown explicit, and that pressure makes *more* disposal feel safer than less.** It is not. The React
originals were correct here precisely because they did less.

**This class is invisible to every instrument this programme relies on.** While the board's bridge was
dead, the React root count, the iframe count and the connected-webview count were all correct. The only
signal was a line in the board's own log, and the only reason it was found is that a human opened a
second board. Two of the four remaining instances required a duplicate-mount ordering the codebase
itself records as "observed once, trigger unknown" — reachable, unreproducible on demand, and silent.

The fixes carry their own risk, which was checked: an over-strict ownership test would block
*legitimate* cleanup and leak entries instead. Verified not to — `webviewRefs` and `webviewReady` both
track the tab count exactly across 4→3→2→1 and a re-add.

### The second finding: a proof of absence is not a proof of presence

Recorded in full as **C9a**. US-1155's live pass was declined as unreachable and replaced with a
structural argument that no value on the path could create a React root. The argument was sound, the
conclusion true, and the result **vacuous** — the close review found `trailingElement` was being dropped
before the row renderer, so the subtree being reasoned about was empty. The pin buttons and Update tags
were constructed, claimed, mounted, and never inserted.

The cause was an error in the *plan review*, the step this workflow spends its most expensive budget on:
the correction asserted the trailing slot was `ListItemView.setTrailing()`, citing real `ListBox`
evidence, when `TreeView` renders `TreeItemView` — a different class with its own `setTrailing()`. The
implementation faithfully forwarded the prop into something that never read it.

**Every closing statement in this epic is phrased as a removal, which makes them all satisfiable by
deletion.** Statements 2 and 4 survived only because their live passes happened to also check that an
iframe and a `<webview>` were *present*. So: pair every "it no longer does X" with an "it still does Y",
and never let a proof of absence substitute for a deferred live pass — say *unverified* instead.

### Instruments, again — and a new recurring failure

E13 corrected its instruments four times; E14 corrected three before publishing a number (the
`*.stories.tsx` glob that matched nothing, an import gate testing stripped source where every module
path had become `""`, and E13's own JSX stripper treating an apostrophe in JSX prose as a string
opener — which made `file-diff` measure zero while holding a full React body). Corrected, `editors/`
was 542, not 535.

**And a fourth failure recurred three separate times: querying the first matching element instead of
the visible one.** It reported identical element counts for two different editors, and it made a
*working* board reload look broken (`iframeIdentityChanged: false`) because the first
`board-webview-wrap` of four belonged to an inactive page. On a surface where inactive pages stay in the
DOM, **"the element" and "the visible element" are different queries**, and the wrong one fails in both
directions. Scope every DOM assertion to what is on screen.

### What US-1160 found by probing rather than reading

The task traced five layers carefully and correctly and still located its fix one layer below the actual
failure. A module-load rejection surfaces at `showEditorPage` → `createEditor` → `loadModule`, because
`createEditor` needs the module to build the editor *model* — so it loads and fails before
`AsyncEditorView` is reached. The `.catch()` added there is therefore **defence-in-depth, not a live-bug
fix**, and the reachable failure is a **silent no-op**: no page, no message, nothing reported (carried as
US-1163). *The layer that owns a failure is not always the layer that looks like it should* — and one
probe found in a single run what five files of reading did not.

Verified positively: a constructor throw and an `onMount()` throw both produce a native "Editor crashed"
panel with message and stack plus a `console.error`, with the app still usable and **still only one React
root** — a crash no longer reintroduces React.

### Carried forward

- **US-1163** — a failed editor open is a silent no-op at `createEditor`.
- **Deferred type assertions** — 7 `as unknown as`, 5 `as never`, 7 `!`, 1 ESLint suppression in the
  converted paths, recorded in [EPIC-072-review.md](../tasks/EPIC-072-review.md). Only
  `BoardEditorView`'s manufactured `BranchView` casts were simplified.
- **`webviewReady` residual** — hardened for ownership, but it is a `Set` with no identity to compare;
  the guard uses the `webviewRefs` ownership test rather than its own.
- **Unverified browser surfaces**, all *could not reach with the available instrument* rather than *not
  allowed*: HTTPS navigation and redirects, downloads, bookmarks, Tor status/reconnect, incognito, URL
  suggestions, tab drag-and-drop, the `@floating-ui/dom` hover preview, close-other/close-below, and
  last-tab replacement. Several review findings were in exactly this untested region, which is the
  argument for an interactive pass before the next browser change.
- **`ui/sidebar` tools panel** — reached in the end via `app.window.openMenuBar("tools-editors")`, but
  the trusted-boards rows were verified through the `uikit/Tree` module directly rather than in that
  panel.

### E15 is Epic E's last epic

It inherits five independent bodies — `graph` (199 markers, 3,278 lines, the largest left), `rest-client`
(130), `env-vars` (36), `file-diff` (13), `draw` (5) — plus `uikit/`'s own React internals (`Popover`,
`Dialog`, `WithMenu`, `Panel`, `Text`, `Icon`), the `SlotText` → `SlotContent` sweep (15 declarations),
`EditorError.tsx` and `EditorErrorBoundary.tsx` (whose eight consumers are all in that list), and the 19
`mountVanilla` face shims, which die with their last callers. Nothing gates anything else, so it can be
decomposed freely. **Per this epic's own findings it must re-measure every figure above rather than
inherit this paragraph.** The next free epic number is **EPIC-073**.

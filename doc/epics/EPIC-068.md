# EPIC-068 — De-React Epic E10: the `PageToolbar` editor group

**Status:** Complete
**Completed:** 2026-08-26
**Created:** 2026-08-26
**Roadmap:** [de-react.md](../de-react.md) § Epic E

---

## Closing property

`editors/base/PageToolbar.ts` is deleted at **0 callers**, its six editors — `archive`, `image`,
`category`, `board-info`, `git-tree`, `video` — register `EditorModule.View` instead of
`EditorModule.Component`, and each of the six opens with **0 React roots** where it opens with 1
today. The `editors/base` chrome removal-ledger row loses its `PageToolbar` clause.

**What must not be claimed at close.** Not that `editors/` is React-free — nine React-arm editors
remain (`about`, `board`, `browser`, `mcp-inspector`, `mneme-config`, `mneme-root`, `settings`,
`storybook`, `tools-hub`). Not that the ledger row is collected — `EditorToolbar` and
`ContentHostFooter` keep their callers. Not that the rest-props bridge moved: `applyRestProps` is
fed by every remaining JSX caller, and this epic removes six of them, not the last.

---

## E10-1 — The contract search, and its result

E5-1's standing rule requires this epic to find its own axis rather than inherit the previous one's
guess. E9 named `ui/secondary-views/SecondaryViews.tsx` as "the E10 candidate" on a roots-per-line
ratio; that note is **not** the scoping input, and the search was run over the whole import graph.

**The search returns a negative, for the first time in the programme: no contract remains.**

Five epics in a row (E4 `RenderCellFunc`, E5 `ReactSecondaryViewDefinition`, E6 `IconRef`,
E7 `Views.registerView`, E9 `TextChromeProps`) found the same shape — one type whose React-typed
member pins callers that would otherwise be vanilla. Every candidate tested here fails that test,
and each fails for a *different* reason, which is what makes the negative credible rather than a
failure to look hard enough.

| Candidate | Measured | Why it is not a contract |
|---|---|---|
| `EditorModule.Component: React.ComponentType` (`editorRegistry.ts:38`) | **15** editors on the arm, 15 on `View` | **Load-bearing.** The arm is not what pins them — their own bodies are React. `browser` (1,471 JSX lines), `mcp-inspector` (1,642), `video` (1,050), `board` (894) and `settings` (820) would each be a conversion with or without the arm. This is the dual arm E8 taught us to distinguish, on the load-bearing side |
| `PageToolbarProps` / `EditorToolbarProps` / `ContentHostFooterProps` `ReactNode` members | 5 + 2 + 3 React refs, 10 caller editors | **Nominal.** All three files are pure `mountVanilla` shims. E8's own test — *a `mountVanilla` face is not a React implementation* — says their React types bind no implementation. The pin is that the ten callers are JSX, not that the props are `ReactNode` |
| `SvgIconComponent = ((props) => ReactElement) & { createElement?: … }` (`theme/icons.tsx:12`) | 713 lines, **45** importers, 122 exports — but only **32** JSX usages in 18 files | **Live but thin, and already inverted where it matters.** E6 took the icon *reference* type and icon React roots measure 0. What survives is 32 `<XxxIcon>` JSX sites, 14 of them inside React-arm editors that convert anyway. The type's shape is still wrong — a React component with an *optional* DOM builder, the inverse of what it should be, which is why `createIconComponentElement` throws — but fixing that shape frees nobody. Recorded for Epic F, not scheduled here |
| `applyRestProps` / `clearRestListeners` / `bindRef` (`uikit/shared/react-compat.ts`) | **40** / **39** / **18** importers; **40** files type props as React DOM attributes; **44** carry `React.Ref` in props; **20** `uikit/*View.tsx` files are `.tsx` for this reason alone | **A real contract whose precondition is unmet.** E8 deferred it "after the last JSX caller" and that is still true: this epic removes six callers of many. It is the last thing in `uikit/`, not the next |
| `Story.component: React.ComponentType<P>` (`editors/storybook/storyTypes.ts:26`) | **45** stories, 4,309 lines, rendered through the single spread at `LivePreview.tsx:64` | **A genuine contract — pinning a harness, not the app.** Every component it names is already vanilla, so the `ComponentType` typing is exactly nominal, and the two `.story.ts` files show the vanilla arm exists in form. But its roots exist only while the Storybook editor is open, it buys no user-facing behaviour, and Epic C's verification harness is still wanted for the `uikit/` work that comes after. **Deferred deliberately, with its measurement recorded** so the next epic need not re-derive it |
| `CategoryViewProps.renderItems: (props) => React.ReactNode` (`CategoryViewModel.ts:103`) | **1** caller (`CategoryEditor.tsx:116`) | **One caller is not a contract** — the third rejection on caller count, after `trailing?: ReactNode` (E7, 0 JSX callers) and `renderItem` (E8, 0 real callers). It is still the mechanism that makes `category`'s root disappear, so it sits inside this epic's scope as a *task detail* rather than its axis |

**The transferable finding.** A negative search result is itself a scoping input. What it says is
that the remaining React is **terminal**: it is React because its own content is React, not because
a type upstream of it demands React. From here the axis is content, and the only question is how to
cut it.

## E10-2 — Baseline, measured live

Taken on the user's own six-page session, not a fixture — E7's practice, because a fixture session
has repeatedly measured something other than what it claimed to.

| Instrument | Count |
|---|---|
| `[data-react-root]` | **4** |
| `[data-part="react-slot"]` | **0** |
| Union | **4** |

The four resolve exactly: **1** empty invisible root at `body` level (`GlobalStyles`), **2** under
`[data-name="pages-container"]` (the two open `board-view` pages), and **1** under
`[data-name="page-editor"]` (`git-tree`). So **3 of the 4 are one per open React-arm editor**, and
they are all born at the same line — `ui/app/AsyncEditorView.ts:146`'s `mountReactHandle`.

Two things follow. First, **`[data-part="react-slot"]` reads 0**, which independently confirms E9's
closing claim on a real session rather than on the fixture E9 measured. Second, the instrument for
this epic is exact and needs no new tooling: **React roots = 1 per open React-arm editor + 1 for
`GlobalStyles`**, so a converted editor moves the count by exactly 1 and a failed conversion is
visible immediately. `git-tree` is one of the six in scope and is open in the user's session, so
Rule 4 is measurable on their real workspace from the fifth task onward.

The end state this points at is worth naming: once all 15 React-arm editors are converted the app
holds **one** React root, `GlobalStyles`, which E7 measured as the last non-story Emotion importer.
Epic F's precondition and this epic's direction are the same thing.

## E10-3 — Why this cut, and what it rejects

With no contract to follow, the surface is 15 editors and **9,497 JSX lines** (against 23,466 total
lines in those folders — the JSX figure is the one that matters, and it is 40% of the whole). That
is two to three epics' worth. E7's correction applies: *line count picks the surface, not the order
of tasks within it.*

The cut is **the connected component of the `PageToolbar` module graph** — E8's atomic unit, which
cost that epic three mis-cuts and one red build before it was found. Not "the small editors" and not
"one folder": the set of callers that must all go before a file can be deleted.

| Group | Editors | JSX lines | Collects |
|---|---|---:|---|
| **`PageToolbar`** | archive, image, category, board-info, git-tree, video | **2,895** | the `PageToolbar` clause of the chrome ledger row |
| `EditorToolbar` | browser, mcp-inspector, mneme-config | 3,699 | that clause — later epic |
| `ContentHostFooter` | board | 894 | that clause — later epic |
| unchromed | about, mneme-root, settings, storybook, tools-hub | 2,009 | nothing; `storybook` belongs with its own contract |

`PageToolbar` first because it is the only group whose deletion is reachable in one epic, because
its six editors are independent siblings rather than a chain, and because three of them
(`image` 65, `archive` 122, `category` 266 JSX lines) are thin enough to establish the pattern
before the epic spends anything on `git-tree` (727) or `video` (1,050).

**Rejected: "the small editors first."** The eight editors under 700 JSX lines total 2,497 lines —
slightly cheaper than this cut, and it collects **nothing**, because it leaves `git-tree` and `video`
on `PageToolbar` and `browser`/`mcp-inspector` on `EditorToolbar`. Cheapness that deletes no file is
how a programme accumulates half-converted groups.

**Rejected: `SecondaryViews.tsx` (E9's named candidate).** 17 lines, and E9 credited it with 4 roots
on the strength of the baseline it took then. Re-measured here it accounts for **0** of the 4 live
roots — the per-page secondary-views hosts E9 counted are gone. The candidate was correct when it was
written and is not correct now, which is the fifth instance of this programme's own recurring lesson:
**a forward-looking note is a measurement with a date on it.** Re-verifying it cost one query;
inheriting it would have cost an epic aimed at nothing.

## E10-4 — A seventh caller the ledger does not mention

`PageToolbar.ts` exports **two** components. The ledger row records six callers of `PageToolbar`; the
module also exports `SwitchWidget`, and `editors/board/BoardToolbar.tsx:160` imports it. So the file
has **7** callers across **7** editors, and `board` is in the `ContentHostFooter` group, not this one.

Converting `board` to reach a deletion would nearly double this epic. It is not necessary:
`SwitchWidget` is already nothing but `mountVanilla(SwitchWidgetView, props)`, and `mountVanilla` is
generic, so `BoardToolbar.tsx` can call it directly on `SwitchWidgetView` with no new React face and
no change to the board editor's arm. The closing task moves `SwitchWidget` out of the way rather than
converting an editor to chase it.

The general point, and the reason this is a section rather than a footnote: **a removal-ledger row
names the callers someone counted, and a module can have callers of a different export.** Grep the
module path, not the component name.

## E10-5 — Concerns

1. **`video`'s `AudioVisualizer.tsx` (331 lines) drives a canvas from `requestAnimationFrame`.**
   Measurement-after-paint is §6.1's third fix shape, and a canvas sized before layout settles is the
   exact failure. Size it after the first paint with a bounded retry, never on a microtask scheduled
   before it.
2. **`category`'s conversion crosses into `components/`.** `CategoryViewImpl.ts:300` mounts a React
   root for `props.renderItems`, whose sole caller is `CategoryEditor.tsx:116`. Rule 1 forbids
   converting a component and its parent in one change — so use the E6/E8 playbook instead of a
   simultaneous conversion: **widen** the prop to `ReactNode | Node`, migrate the caller, then
   **narrow** it to `Node` and delete the `mountReactHandle`. Three steps, one boundary moving at a
   time.
3. **`category` holds 2 of the 15 remaining JSX rest-prop spread sites** (`CategoryEditor.tsx:137`
   and `:139`, `{...commonProps}` into `LinksList`/`LinksTiles`). Converting them reduces what feeds
   `applyRestProps`; it does not close it, and the epic must not report it as progress on the bridge.
4. **Every non-editor child these six render already has a vanilla arm** — verified:
   `GitTreeView.ts`, `FileListView.ts`, `FileGridView.ts`, `TreeProviderViewImpl.ts`,
   `CategoryViewImpl.ts`, `ImageViewportView.ts`. This is what lets the closing property promise 0
   roots rather than E9's relocation. **It is also the single assumption most worth re-checking per
   task**, because E9's seven relocating editors were the consequence of not checking it.
5. **`archive` reaches `components/tree-provider` through `TreeProviderViewModel`, not
   `CategoryViewImpl`.** Different path, different root question. Measure `archive` separately rather
   than generalising from `category`.
6. **`git-tree` is open in the user's live session and pinned pages are reopened on restart.** A
   regression there is immediately visible to them, which is a reason to sequence it late — after the
   pattern is established — not a reason to avoid it.
7. **`board-info`'s `BoardScreenshot.tsx` (80 lines) renders an image with intrinsic sizing.** Same
   class as concern 1, smaller.
8. **Six `index.tsx` files become `index.ts`.** E9 measured that git records these as delete+add
   rather than renames, because the files are rewritten. Expected, not a mistake to fix.

## E10-6 — Non-goals

- The nine other React-arm editors. `EditorToolbar` and `ContentHostFooter` keep their faces.
- The `applyRestProps` / `clearRestListeners` / `bindRef` bridge, and the 20 `uikit/*View.tsx` files
  that are `.tsx` only because of it (E10-1).
- The Storybook harness and `Story.component` — deferred with its measurement recorded (E10-1).
- `theme/icons.tsx`'s inverted `SvgIconComponent` shape (E10-1), and
  `components/icons/LanguageIcon.tsx`.
- `EditorErrorBoundary` — nine importers, seven of them already-vanilla editors that keep it around
  their React content. It goes when the last React editor subtree does.
- `GlobalStyles`, the last non-story Emotion importer and the last root. Epic F.

## E10-7 — Tasks

Thin-first, so the pattern is paid for on 65 lines rather than 1,050. The six editors are independent
siblings — there is no import chain between them, which E9's ordering error is the reason to state
explicitly rather than assume.

| Task | Scope | JSX lines |
|---|---|---:|
| US-1112 | `image` → `View`. `ImageEditor.ts` / `ImageToolbarView.ts` are already vanilla; `ImageView.tsx` + `index.tsx` are all that remain. The pilot | 65 |
| US-1113 | `archive` → `View`. `ArchiveEditor.ts` / `ArchiveSecondaryView.ts` already vanilla. Establishes the `components/tree-provider` path (concern 5) | 122 |
| US-1114 | `category` → `View`, plus the `renderItems` widen/migrate/narrow (concern 2) and its two spread sites | 266 |
| US-1115 | `board-info` → `View` (`BoardInfoEditorView.tsx` 564, `BoardScreenshot.tsx` 80) | 665 |
| US-1116 | `git-tree` → `View` (`GitTreeEditorView.tsx` 321, `CommitDiffPanel.tsx` 289, `CommitInfoPanel.tsx` 88). First task measurable on the user's live session | 727 |
| US-1117 | `video` → `View` (`AudioVisualizer.tsx` 331, `VPlayer.tsx` 259, `AudioPlayer.tsx` 164, `AudioControls.tsx` 155, `VideoView.tsx` 107). Carries concern 1 | 1,050 |
| US-1118 | Move `SwitchWidget` off `PageToolbar.ts` (E10-4), delete `PageToolbar.ts` at 0 callers, update the ledger row, re-measure roots | — |

Per-task gate, mechanical: the editor's `index` registers `View`, the `<PageToolbar` count drops by
one, and the editor measures 0 `[data-react-root]` and 0 `[data-part="react-slot"]` when open.

## E10-8 — Closing measurement

All seven tasks implemented 2026-08-26. **Review is complete; `/document` is complete and
`/userdoc` remains** before the epic's dashboard entries can move from `[ ]`.

| Measure | Start | End |
|---|---:|---:|
| `<PageToolbar` JSX call sites | 6 | **0** |
| `PageToolbar.ts` callers (incl. `SwitchWidget`) | 7 | **0** — the file is deleted |
| Editors on the React `Component` arm | 15 | **9** |
| Editors registering `View` | 15 | **21** |
| JSX lines in the six editors | 2,895 | **9** (the deliberate `BoardScreenshot.tsx` shim) |
| `.tsx` in `editors/` (non-story) | 94 | **76** |
| Renderer non-story `.tsx` | 205 | **187** |
| Files importing React (non-story) | 222 | **209** |
| Already-vanilla `.ts` importing React | 67 | **65** |
| React roots contributed by each of the six | 1 each | **0 each** |

**Rule 4, honestly.** Five of the six were verified live and each measured **0**
`[data-react-root]` and **0** `[data-part="react-slot"]` in its own page, with real content
rendering: the image decoding at 256×256; archive showing 23 tree rows; category mounting a native
`LinksListView` at 1280×927 over real archive entries; board-info rendering its properties surface
including the trust state. **`git-tree` was not verified live** — both programmatic routes are
closed (`addEditorPage("git-tree", …)` refuses it as "a standalone editor that requires a
specialized model", and opening a repo folder does not produce one), and the user was actively
working in the app, so hunting for the sidebar route was not worth disturbing their session. Its
static verification is complete (real Panel root, `ResizeObserver` created in `onMount()` and
disconnected through `own()`, a `createComponentModelDriver` with zero `effect()` registrations, no
React import in any of its three files, three commands green). Recorded as **statically verified,
live-unverified** rather than assumed — the same discipline E9 applied to `svg-view`.

Whole-app roots read **3** at close: `GlobalStyles` plus one per open board page. That matches
E10-2's arithmetic exactly — roots = 1 per open React-arm editor + 1 — which is what makes the
instrument trustworthy rather than coincidental.

### What the review caught, and what it means

Two defects were caught at plan review that no build could see, and both are instances of rules
this programme already wrote down:

- **A `DocumentFragment` passed to a slot** (US-1113). Slots are re-filled *unconditionally*
  (`PageToolbarView.onUpdate:420-427`) and `fill-slot.ts:137` appends, which empties a fragment —
  so mount would work and the first update would delete both toolbar buttons permanently. This is
  EPIC-064's finding in its most extreme form: *when a contract changes from a value to a resource,
  every cache of that value becomes a bug.* A fragment is destroyed by the act of being used. The
  fix (a persistent `display: contents` span) was then verified live across four page-activation
  cycles.
- **`bind()` used for a subscription whose source object changes** (US-1114). `bind()` registers
  its unsubscribe through `own()` (`vanilla-view.ts:216`), and `own()` has **no early-release API**
  (`:129-132`) — `releaseChild()` covers child views only. Re-calling `bind()` therefore stacks live
  subscriptions across every panel attach/detach, and worse than leaking, **stale hosts keep pushing
  their old selection**, so selection visibly fights itself. This is §4's "forgotten unsubscribe"
  named as the real work of the migration.

### Post-implementation review follow-up

The completion review found five unacted findings. These remain implementation follow-up rather than
documentation changes:

- **P1:** `CommitDiffPanel.ts` never populates `changeMap`, so diff status badges disappear.
- **P1:** an inactive `AudioPlayer` can receive video sources and corrupt the active player state.
- **P1:** audio is not paused or cleared during disposal in `AudioPlayer.ts` and `VPlayer.ts`.
- **P2:** `BoardInfoEditorView.ts` and `BoardScreenshotView.ts` overwrite the Panel `data-type`.
- **P2:** newly added non-null assertions occur in `ArchiveEditorView.ts`, `AudioControls.ts`,
  `AudioPlayer.ts`, `AudioVisualizer.ts`, `BoardInfoEditorView.ts`, `BoardScreenshotView.ts`,
  `CategoryEditor.ts`, `GitTreeEditorView.ts`, `ImageView.ts`, `VideoView.ts`, and `VPlayer.ts`.

**A cross-rule interaction discovered mid-epic and now recorded:** an editor view that **measures
its own root cannot use a `display: contents` root** — such an element generates no box, so
`ResizeObserver` never fires and `getBoundingClientRect()` reads zero, *silently*. `git-tree` needed
a real Panel root for this reason independently of the "React already wrapped it in one Panel"
reason. Where the two rules conflict, the measurement wins.

**One of this epic's own concerns was retired rather than implemented.** E10-5 concern 7 predicted
`BoardScreenshot.tsx` would need post-paint measurement with a bounded retry. It has no measurement
at all — no `getBoundingClientRect`, `ResizeObserver`, `offsetWidth` or `naturalWidth`, just fixed
dimensions. The implementation brief was told explicitly *not* to add measurement, because otherwise
this document would have talked someone into writing it. Fifth instance of the programme's recurring
lesson, this time against itself: *a forward-looking note is a measurement with a date on it.*

**E10-4's correction held.** `PageToolbar.ts`'s seventh caller was `board/BoardToolbar.tsx:160`,
through the `SwitchWidget` export rather than `PageToolbar` itself. It now calls
`mountVanilla(SwitchWidgetView, { model })` directly, so the module deleted at 0 callers without
`board` being converted. *A removal-ledger row names the callers someone counted, and a module can
have callers of a different export.*

**Left deliberately.** `BoardScreenshot.tsx` survives as an 8-line `mountVanilla` shim because
`editors/tools-hub/SearchBoardsTab.tsx:158` still renders it — E5's standing rule (one
implementation, React export reduced to a shim), and `tools-hub` converts in a later epic.
`EditorToolbar` and `ContentHostFooter` keep their React faces and their ledger clauses.
`createContentsRoot()` is now duplicated locally in **eight** files; extracting it was deliberately
out of scope for a per-editor epic and is recorded here as the candidate it always was.

### Process note, for the next epic of this shape

The per-task briefs accumulated ten rules, each with the file:line proving it. US-1112–US-1114 each
needed corrections; **US-1116 and US-1117 needed none** — the earlier failures had become
preconditions. That is the argument for writing the rule down in the brief rather than only in the
epic: a correction applied once is a fix, a correction written into the next brief is a class
removed.

Every `.tsx` → `.ts` conversion also hit the **stale dynamic-import trap** in the dev server: the
editor silently fails to load until `editors/register-editors.ts` is touched to invalidate Vite's
cached specifier resolution. `build-prod` is unaffected. It looks exactly like a broken conversion,
so it belongs in the routine, not in the diagnosis.

## E10-9 — Progress

- [x] US-1112 `image` — live-verified 0 roots
- [x] US-1113 `archive` — live-verified 0 roots
- [x] US-1114 `category` — live-verified 0 roots
- [x] US-1115 `board-info` — live-verified 0 roots
- [x] US-1116 `git-tree` — statically verified; **live-unverified** (see E10-8)
- [x] US-1117 `video` — statically verified
- [x] US-1118 `PageToolbar.ts` deleted at 0 callers

## E10-10 — The close review, and why it was the step that paid

`/review`, `/document` and `/userdoc` all ran (2026-08-26). `/userdoc` changed nothing — this epic is
a rendering-mechanism change with no user-facing behaviour, so there was nothing to tell a user, and
that is the correct outcome rather than a skipped step. `/document` updated the roadmap, six
architecture docs and three standards docs; all remain ticket-free.

`/review` surfaced **five findings, of which two were real regressions this epic introduced**. Both
were invisible to `tsc --noEmit`, ESLint and `build-prod`, and neither would have been caught by the
epic's own Rule 4 root count — which is the argument for the review step in a form worth keeping:

| Finding | Verdict |
|---|---|
| `changeMap` never populated — `CommitDiffPanel.ts:339` defined `changeMapFor()` and **nothing ever called it**, so `this.changeMap` stayed the empty `Map` from `:82` and both readers got `undefined` | **Real regression, fixed.** Commit status badges and the "Open in new Tab" context action were silently missing. Now refreshed from `state.changes` at the top of `applyState` (`:196`) |
| Inactive audio received the video/HLS source and emitted unguarded media events | **Real regression, fixed.** New because the audio child is now *persistent* where React unmounted it. Handlers gated on `active`; the source is cleared while inactive (`AudioPlayer.ts:80-114,139-150`) |
| Media resource never released on disposal | **Pre-existing, fixed anyway.** In a file this epic rewrote — freshly authored code should not be marked reviewed with a known leak in it. `pause()` / `removeAttribute("src")` / `load()` before the references are dropped (`AudioPlayer.ts:128-131`, `VPlayer.disposeVideoAdapter`, already wired through `own()` at `VPlayer.ts:90`) |
| `Panel` `data-type` overwritten by custom types | **Non-issue.** The old React `Panel` set the same custom types and no consumer requires `data-type="panel"` |
| Definite-assignment assertions on `onMount`-initialised fields | **No change.** Valid under the lifecycle guarantees; `onUpdate` cannot precede `onMount` |

**The finding worth carrying into the rest of the programme** is the first, because it names a defect
class this conversion pattern manufactures: **a `useMemo` whose result feeds a callback becomes dead
code if the port defines the recompute but never calls it.** The type system cannot see it — an empty
`Map` is still a `Map` — and the symptom is *absence* (a missing badge, a missing menu item), which
is exactly what a reviewer's eye skips and what a root count cannot measure. Every remaining
De-React editor conversion should check each ported `useMemo`/`useCallback` for a live caller, not
merely a definition.

Second, smaller, but the same shape as this epic's `DocumentFragment` finding: the **persistent-child
consequence**. React unmounting a subtree used to suppress a whole class of side effects for free;
a native view keeps its children alive, so anything that was quiet only because it was unmounted
becomes live. Finding 2 is that, and it will recur wherever a converted parent keeps an inactive
branch mounted.

# EPIC-069 — De-React E11: the Storybook contract

**Status:** Complete
**Created:** 2026-08-26
**Completed:** 2026-08-27
**Roadmap:** [De-React programme](../de-react.md), Epic E11. Follows
[EPIC-068](completed.md) (E10, the `PageToolbar` editor group).

## Closing property

`Story.component: React.ComponentType<P>` — [`editors/storybook/storyTypes.ts:27`](../../src/renderer/editors/storybook/storyTypes.ts) —
is replaced by a `VanillaViewCtor` arm, `previewChildren`'s `React.ReactNode` return goes with it,
and `LivePreview` mounts the view directly instead of spreading props into
`<Component {...componentProps} />` ([`LivePreview.tsx:64`](../../src/renderer/editors/storybook/LivePreview.tsx)).
**41 of the 43 `.story.tsx` files become `.story.ts`**, the six non-story `.tsx` files of the
Storybook editor become native views, and `storybook` leaves the `EditorModule.Component` arm.

The measured number (Rule 4) is **not** roots — see E11-2 for why the roots instrument is unfit
here. It is **uikit React faces freed**: 21 of the 49 non-story `.tsx` files in `uikit/` have zero
non-story JSX users today, and **15 of those are kept alive by exactly one caller — their own
story.** E11 frees every one of them, and deletes each whose remaining caller count reaches zero.

**What must not be claimed at close:**

- **That the app got less React.** It did not, measurably. This epic converts a harness and the
  editor that hosts it. No user-facing page loses a React root. The payoff is that a removal-ledger
  row becomes drainable, which is a claim about Epic F, not about today's renderer.
- **That all 44 React faces can now go.** 28 of the 49 still have non-story JSX callers, most of
  them in `mcp-inspector`, `settings`, `browser`, `rest-client` and `graph`. E11 removes the
  *harness* blocker, not the *app* blocker; both have to fall before a face is deletable.
- **That the React arm is gone.** Two stories cannot convert — `Panel` and `Text` have no vanilla
  twin, by C1's explicit decision, and inventing one to close this epic would be exactly the
  "accidentally writing a worse React" failure Epic B warned about (§E11-4). The arm survives with
  two named callers and a removal-ledger row.
- **That the stories still cover the React faces afterwards.** They stop. That is a real loss of
  coverage on 28 shims and it is accepted with a stated reason (§E11-5, concern 2), not overlooked.
- **That E10's roots arithmetic held.** It did not (§E11-2). E10 closed reporting 3 roots and 0
  slot markers; the same instrument on a live 8-page session reads **16 and 5**. The number was
  right for the session it was taken on and wrong as a general claim.

---

## E11-1 — The contract, and the search that found it

E5-1 requires every epic in this programme to run its own contract search rather than inherit the
previous epic's guess. Seven consecutive epics have vindicated that rule. **E11 is the first time it
vindicated the rule in the opposite direction: the re-measurement did not reject an inherited
candidate, it *promoted* one E10 had measured and set aside.**

E10's search came back negative and concluded that "the remaining React is terminal — React because
its own content is React, not because a type above it demands React." That conclusion is correct for
the *application*. It is wrong for the tree as a whole, and E10's own rejection table says why in a
row it did not follow up:

> | `Story.component: React.ComponentType` | 45 stories, one spread at `LivePreview.tsx:64` | A **genuine contract pinning a harness, not the app**; deferred with its measurement recorded |

The phrase "pinning a harness" is what carried the deferral, and it is the part that does not
survive measurement. What the contract pins is not the harness. It is **uikit**.

### The measurement

| Fact | Measured |
|---|---|
| `.story.tsx` files | **43** (4,272 lines) — but only **42** are registered; `SelectableRow.story.tsx` is an orphan (§E11-10) |
| `.story.ts` files | 2 (`Checkbox`, `Label`) — 44 stories registered in total, not 45 (§E11-10) |
| `.story.tsx` files containing **zero JSX** | **10** — `Button`, `Divider`, `IconButton`, `Panel`, `ProgressBar`, `Slider`, `Spacer`, `Spinner`, `SplitButton`, `TruncatedText` |
| Non-story, non-`*View`, non-`mount` `.tsx` in `uikit/` | 49 |
| …with **zero** non-story JSX users | **21** |
| …of those 21, kept alive by their own story alone | **15** — `Breadcrumb`, `CategoryList`, `CollapsiblePanelStack`, `Dialog`, `ImageViewport`, `Menu`, `Minimap`, `MultiListBox`, `MultiSelect`, `Notification`, `PathInput`, `RadioGroup`, `SplitButton`, `Tree`, `TruncatedText` |
| The remaining 6 | `DialogContent`, `ListBox/SectionItem`, `Tree/SectionItem`, `AlertItem`, `AlertsBar`, `ProgressOverlay` — no story; verify each caller individually |

So the removal ledger's second row —

> React faces on converted UIKit components (`Component.tsx` → `mountVanilla`) · Kept because:
> scaffolding that keeps call sites working mid-migration · **Collectable once: Epic E finishes**

— is **wrong about its own precondition**. Epic E finishing does not free these faces. Fifteen of
them have no application caller *now*, and Epic E cannot remove the caller they do have, because
that caller is a story and stories are not in Epic E. The row has been mis-stating its unblock
condition since C1 created it, and nothing but this measurement notices — which is precisely the
failure mode the ledger's own preamble warns about: *"a component whose last consumer is gone still
compiles, and nothing but this list notices."*

### The contract is single-armed — the first one in this programme that is

Every prior contract in this programme had a vanilla arm built beside it before the React arm was
deleted: `EditorModule` has `View` beside `Component`, the secondary-view registry got its vanilla
arm in E1, `SlotContent` has a `Node` arm, `TreeItemProps.label` is `React.ReactNode | Node`.
`Story` has **no** vanilla arm at all. `component: React.ComponentType<P>` is the only way to
declare a story, so the arm has to be built here before anything can convert — which makes E11 a
build-the-arm-then-migrate epic rather than a delete-the-arm epic, and puts the pilot earlier than
usual.

### A correction to the roadmap, found by the same search

[`de-react.md`](../de-react.md) records, in Epic C's story-coverage paragraph:

> Note two of C1's stories are vanilla-only `.story.ts` files (`Checkbox`, `Label`) — a `.tsx` glob
> misses them.

They are not vanilla. [`Checkbox.story.ts`](../../src/renderer/uikit/Checkbox/Checkbox.story.ts)
imports the React face and casts it into the contract:

```ts
import { Checkbox } from "./Checkbox";
component: Checkbox as any,
```

They are React stories that happen to contain no JSX, so the `.ts` extension is legal — not a
vanilla precedent. **There is no existing vanilla story to copy.** The `as any` is worth reading as
evidence in its own right: it is the contract refusing a value that does not fit, silenced.

This is the same class as a second finding the search turned up, which the epic should record
because every future measurement in this programme depends on it: **64 of the 70 non-story `.tsx`
files in `uikit/` contain no JSX whatsoever.** Only `WithMenu.tsx`, `Panel.tsx`, `Text.tsx`,
`shared/mount.tsx`, `Dialog/DialogView.tsx` and `Popover/PopoverView.tsx` do, and five of those hold
exactly one tag. Every `.tsx`-file count in this programme's history therefore *overstates* the JSX
surface, in `uikit/` by an order of magnitude. **The extension is not the measurement.**

### The candidates rejected, each re-verified against source

E10's rejections were re-tested rather than inherited. All hold except the one above.

| Candidate | Measured now | Verdict |
|---|---|---|
| `EditorModule.Component` (`editorRegistry.ts:38`) | **9** editors on the arm (was 15 at E10 open) | **Load-bearing** — every one is a genuinely React body. Unchanged verdict |
| `EditorToolbar` / `ContentHostFooter` | 3 callers (`browser`, `mcp-inspector`, `mneme-config`) and 1 (`board`) | **Nominal, re-verified by reading both files** — each is a 3-line `mountVanilla` shim. E10's rejection stands; collecting them is bookkeeping, not liberation, and it cannot happen without converting `browser` |
| `SlotContent`'s React arm (`fill-slot.ts:5`) | 34 importers | **Load-bearing** — the bodies it carries are genuinely React. Same verdict as `EditorModule.Component`, one layer down |
| `uikit/Tree/types.ts` + `ListBox/types.ts` React-typed slots (`label`, `renderItem`, `renderTrailing`) | Every measured caller already returns `Node`; `renderItem` has **no** caller outside `uikit/` | A **drained** contract, not a pinning one — cleanup, and it frees nobody |
| `React.CSSProperties` (`panel-style.ts`, 6 sites; two `cssLength` helpers) | Type-only, erased at compile time | **Not a React dependency in any sense Rule 4 can measure** |
| `EditorErrorBoundary` | 9 consumers — and **7 are already-converted `View`-arm editors** that build `createElement(EditorErrorBoundary, …)` as chrome `children` | A real React root inside a native shell, but it is the *body* that is React; the boundary is a consequence. See E11-2 |

---

## E11-2 — The live baseline, and why E10's roots instrument is unfit

Taken on the user's real session, eight pages, two of them browser pages:

| Query | Count |
|---|---|
| `[data-react-root]` | **16** |
| `[data-part="react-slot"]` | **5** |

E10 closed reporting **3** and **0**, with the arithmetic *"roots = 1 per open React-arm editor + 1
for `GlobalStyles`, so one conversion moves the count by exactly 1."* That arithmetic is wrong, and
the DOM says where it fails. Attributing the 16 by `data-name` ancestry:

| Host chain | Roots |
|---|---:|
| *(no `data-name`)* — `GlobalStyles` | 1 |
| `pages-container` | 3 |
| `page-editor` | 3 |
| `editor-toolbar` | 2 |
| `url-input < url-bar < browser-toolbar-content < editor-toolbar` | 3 |
| `webview-area < browser-body` | 4 |

Six of those sit **inside** a React editor's own root — `editor-toolbar`, `url-input` and
`webview-area` are all descendants of `page-editor`. A React root nested inside a React root is not
an accident; it is the documented consequence of the two-way boundary composing in both directions
at once:

1. A React editor renders a converted uikit face — `<EditorToolbar>`, `<Input>`.
2. That face is `mountVanilla(SomeView, props)`, so a **native** view mounts inside the React tree.
3. That native view fills a slot whose content is a React element, so `fillSlot` takes its React arm
   and calls `mountReactHandle` — **a new React root**, nested inside the outer one.

So an editor's root cost is **1 + one per element-valued slot fill anywhere in its tree**, not 1.
The browser editor alone accounts for four to seven roots depending on its state, which is why E10
measured 3: its session held board pages and no browser page.

**The consequence reaches forward, and it is the finding worth carrying out of this epic.** The root
count is **not monotonically decreasing in this programme.** Converting a uikit component *raises*
the root count for every un-converted editor that passes it element children, and only that editor's
own conversion brings it back down. A rising root count mid-programme is expected behaviour, not a
regression — E9 saw the local form of this and recorded a mid-epic peak of 4–5; this is the same
effect measured across the whole tree instead of inside one epic.

Two corollaries for whoever measures next:

- **State the session, not just the number.** "3 roots" and "16 roots" are both true and neither is
  the app's root count. A roots figure without the open-page list is not a measurement.
- **Rule 4 needs a different number for a harness epic.** Stories render only when the Storybook
  page is open, so E11 moves the whole-app count by zero. E11's number is faces freed (§E11-8), and
  the roots figure it *can* honestly claim is local: opening the Storybook page.

`US-1091` on the dashboard is relevant and unfixed — `DialogView.tsx:87` and `TagView.tsx:88` stamp
`data-part="react-slot"` unconditionally, so the slot marker over-reports. The 5 above should be read
as an upper bound; `data-react-root` is the reliable half of the instrument.

---

## E11-3 — Why this cut, and the two alternatives that lost

Three cuts were measured. The other two are recorded because both are the natural next epic once
this one lands, and their numbers should not have to be re-derived.

**Chosen — the Storybook contract.** 43 story files (4,272 lines) plus the 6-file Storybook editor
(396 lines, 27 JSX tags). It is the only *genuine* contract left in the tree by this programme's own
test — one React-typed member pinning callers whose content has no reason to be React — and its
deletion is the only thing that can free 15 uikit faces, because Epic E structurally cannot. E2-1's
rule applies directly: an epic that closes by deleting a contract beats one that closes by shrinking
a number, and *"a contract that survives is one every later epic must keep satisfying."* Every story
written from here until Epic F would otherwise be written against a React type.

**Rejected — "the form-and-panel editors."** `settings` (820 lines, 248 JSX tags), `mcp-inspector`
(1,642 / 171), `mneme-config` (586 / 97), `mneme-root` (284 / 26), `about` (240 / 31), `tools-hub`
(269 / 37). Homogeneous, no webview, no Monaco, no canvas, no floating-ui — the safest large group in
`editors/`, and it takes the `Component` arm from 9 to 3. It lost on two counts. It closes by
shrinking a number rather than deleting a contract, and — the decisive one — **the three uikit faces
it appeared to strand do not actually strand.** `DateInput.tsx`, `ProgressBar.tsx` and
`TagsInput.tsx` each look collectable when only application callers are counted, and each keeps
exactly one caller: its own story. Chasing that is what found E11's contract, so the rejected cut
earned its keep. It is the obvious E12 and its measurement is now on record.

**Rejected — "the last two `editors/base` chrome files."** `browser` + `mcp-inspector` +
`mneme-config` + `board`, 4,597 lines, closing by deleting `EditorToolbar.ts` and
`ContentHostFooter.ts` at zero callers and retiring E1-8's ledger row. Attractive as a closing
property and wrong as an axis: E10 already rejected these three files as **nominal** — pure
`mountVanilla` shims that bind no React implementation — and re-reading both files confirms it. It
also concentrates every hard hazard left in `editors/` into one epic: two `<webview>` elements whose
content is destroyed by reparenting, the single remaining `@floating-ui/react` importer
(`BrowserTabsPanel.tsx:2`), and the board trust flow. Deleting a file that pins nothing is not worth
buying with that.

---

## E11-4 — The five stories that cannot simply convert

Each `.story.tsx` needs a vanilla constructor to point at. Five do not have an obvious one.

| Story | Situation | Resolution |
|---|---|---|
| `Panel` (63 lines) | `Panel.tsx` is a real React implementation with **no vanilla twin, by C1's explicit decision** — vanilla views write plain elements with semantic classes instead | **Stays React.** Do not invent a `PanelView` to close this epic |
| `Text` (39 lines) | Same — `Text.tsx` is React-only by the same decision | **Stays React** |
| `DateInput` (57 lines) | `DateInput.tsx` is itself `mountVanilla(InputView, { type: "date", … })` — there is no `DateInputView` because the component *is* the wrapper | Point the story at `InputView` with `type="date"`, **or** write `DateInputView` so the wrapper's stated purpose (a themed calendar later, with no call-site churn) survives. Task-level decision; prefer the second, and then `DateInput.tsx` is deletable |
| `Progress` (99 lines) | No `Progress.tsx`; the folder holds `ProgressOverlay.tsx` and `ProgressOverlayView.ts` | Point at `ProgressOverlayView`; verify the story still exercises what it did |
| `Tooltip` (81 lines) | `Tooltip.tsx` has no `TooltipView` — the vanilla form is `attach-tooltip.ts`, attachment-based rather than a mounted view | Needs a story shape that attaches to an anchor the harness owns. The one story here with genuine design content |

So the honest closing figure is **43 → 2** `.story.tsx`, not 43 → 0, and `Story` keeps a React arm
with two named callers plus a removal-ledger row that unblocks when `Panel` and `Text` die in
Epic F. Deleting the two stories to reach zero is available and **not recommended**: they exercise
the only two real React implementations left in `uikit/`, they are the last regression net those
files have, and a story deleted to round a number reads later as an oversight.

---

## E11-5 — Concerns

1. **The harness has no assertions, so verification is 45 manual page views.** `de-react.md` is
   explicit that Storybook *"is a visual harness, not an assertion suite; it shows a difference, it
   does not fail a build."* A converted story that renders nothing is green in `tsc`, ESLint and
   `build-prod`. This is the epic's single largest risk and its whole verification cost. Mitigation:
   the component browser lists every story in one page, so a sweep is one page and 45 clicks; the
   `data-name` contract makes each preview's DOM comparable before and after, drivable from the
   `browser_*` tools. **Take the "before" DOM for every story in the first task** — it is the one
   measurement that cannot be recovered once the story is converted (Rule 4's own note).

2. **28 React faces lose their story coverage, and that is accepted.** Once a story points at
   `ButtonView`, `Button.tsx` has no exercised path in the tree while 27 application JSX call sites
   still use it. The reason it is acceptable: each of those faces is a two-or-three-line
   `mountVanilla` shim with no logic to regress, and the shim's own scheduled deletion date makes
   investment in covering it wasted (Epic F's note on keeping wrappers thin). It is **not**
   acceptable for `Panel` and `Text`, which is exactly why §E11-4 keeps their stories React. State
   this in the close, so a later epic does not read the gap as an accident.

3. **`previewChildren` is the seam Epic B left explicitly temporary** — *"`previewChildren` remains
   the temporary React-only slot seam until later conversions remove it."* This is that later
   conversion. Its `() => React.ReactNode` becomes `() => Node`, and every provider has to build DOM
   rather than JSX. Check the providers before planning the arm: a provider returning an array or a
   fragment must not hand a `DocumentFragment` to a slot — **E10's finding: slots are re-filled
   unconditionally and `fill-slot.ts:137` appends, so a fragment is emptied by its first use.**

4. **`LivePreview` spreads arbitrary runtime prop values into the component**
   (`{...componentProps}`), after deleting empty-string enums and injecting
   `STORYBOOK_MANAGED_PROPS`. React tolerates unknown props on a component; `view.update(props)` has
   no equivalent tolerance, and a `VanillaView` that receives a prop it does not know may ignore it
   silently — which in a harness whose entire purpose is showing the effect of a prop is a defect
   that *looks like* a working preview. Decide how an unknown prop surfaces before converting the
   property editor.

5. **`EditorErrorBoundary` protects the preview, and that protection is load-bearing here.** A story
   is the most likely thing in the app to throw during render, and `LivePreview.tsx:63` is why a
   broken story shows a message instead of blanking the page. A native `LivePreview` must keep a
   React boundary around the mounted view *or* replace it with an explicit `try/catch` around
   `new ctor(...)` / `view.mount()` and a rendered error state. The ledger's note that
   `window.onerror` and a `try/catch` around `mountReact` "are not equivalents" is about *descendant
   render* failures in a React subtree; a vanilla mount throws synchronously at a point the caller
   owns, so a `try/catch` **is** equivalent here. Say so explicitly in the task, with the reasoning,
   or the next reader will treat the ledger note as forbidding it.

6. **A ported `useMemo`/`useCallback` whose recompute is never called is dead code the type system
   cannot see.** E10's close review found exactly this in `CommitDiffPanel` — `changeMapFor()`
   defined, never called, commit badges silently absent, every gate green. `LivePreview` and
   `PropertyEditor` both derive values per render. **Check each ported derivation for a live caller,
   not merely a definition.**

7. **The persistent-child consequence.** React unmounting the previous preview suppressed its side
   effects for free. A native `LivePreview` that keeps the old view mounted while showing a new one
   leaves timers, observers and media live — E10's inactive-`<audio>` regression in a different
   costume. Dispose the outgoing view explicitly and verify it, particularly for `Notification`,
   `Progress`, `Tooltip` and `Popover`, whose stories own floating layers.

8. **`bind()` is only for state that outlives the view.** `LivePreview` re-targets a *different*
   story on every selection change. A `bind()` per selection stacks subscriptions with no release —
   `own()` has no early-release API — and stale stories keep pushing values. Use the
   replaceable-field pattern (subscribe *and* apply immediately, both halves), as `CategoryEditor`
   does.

9. **The stale dynamic-import trap fires on every `.tsx` → `.ts` rename.** 41 renames here. The dev
   server keeps resolving the old specifier until the *importer* is touched; for stories the
   importer is `storyRegistry.ts`, which imports all 45 by extensionless path — so a single touch of
   that file clears the whole batch. `build-prod` is unaffected. Do not diagnose a missing story as
   a conversion defect until `storyRegistry.ts` has been touched and, if needed, a cold start run.

10. **`storyTypes.ts` is imported by all 45 stories**, so a change to `Story` is a 45-file compile
    fan-out. Add the vanilla arm *beside* `component` (Rule 1: never both sides of a boundary in one
    change) so the tree stays green while stories convert one group at a time.

---

## E11-6 — Non-goals

- **`Panel` and `Text`.** No vanilla twin is written. They drain as Epic E converts their call sites
  (425 `<Panel>` tags in `editors/`, 1 in `ui/`) and die in Epic F.
- **The application's React roots.** Zero user-facing pages change. If the whole-app roots figure
  moves, something is wrong.
- **`EditorToolbar`, `ContentHostFooter`, `EditorErrorBoundary`'s 9 consumers, the single
  `@floating-ui/react` importer.** All measured here (§E11-1, §E11-3) so E12 does not re-derive
  them; none is touched.
- **The 6 no-story `uikit/` faces** (`DialogContent`, both `SectionItem`s, `AlertItem`, `AlertsBar`,
  `ProgressOverlay`). They have zero non-story JSX users and no story, so they are collectable
  *independently* of this contract — which makes them a separate small cleanup, not E11's business.
  Recorded so they are not lost.
- **Renaming the 64 no-JSX `.tsx` files in `uikit/`.** Cosmetic, and it would put a 64-file rename
  inside an epic whose risk already lives in silent rendering failures. It is a finding, not a task.

---

## E11-7 — Tasks

| # | Task | Scope |
|---|---|---|
| 1 | Baseline and the vanilla arm | Capture the "before" DOM of all 45 previews (§E11-5 concern 1). Add `Story.view?: VanillaViewCtor<P>` beside `component`, teach `LivePreview` to prefer it, settle the unknown-prop and error-boundary questions (concerns 4, 5). No story converted yet |
| 2 | Pilot — the 10 zero-JSX stories | `Button`, `Divider`, `IconButton`, `ProgressBar`, `Slider`, `Spacer`, `Spinner`, `SplitButton`, `TruncatedText` (not `Panel`). Near-mechanical; establishes the shape and the verification loop. Also converts the two existing `.story.ts` files off `component` |
**Tasks 3 onward were re-cut after US-1120 (§E11-10).** The original split was by JSX tag count,
which classified 35 demo-wrapper stories as mechanical; the axis is now **wrapper complexity**, and
every task is gated on the DOM comparison rather than on a conversion summary.

| # | Task | Scope |
|---|---|---|
| 3 | The `type: "icon"` synthetic prop | Resolve an icon PropDef centrally from preset id to `IconRef`, the way `STORYBOOK_MANAGED_PROPS` already handles `background`. Deletes the same translation from four wrappers and unblocks `keyof P` for `Button`, `IconButton`, `SplitButton`, `Toolbar`. Small, and it is a prerequisite for four stories |
| 4 | Simple demos — layout context and single-value controls (11) | `Dot` (156 lines, 48 tags), `ImageViewport` (24), `Input`, `Textarea`, `SegmentedControl`, `RadioGroup`, `Tag`, `TagsInput`, `Splitter`, `Minimap`, `Breadcrumb`. Each wrapper is either pure layout or one `useState` mirroring a value; ~1,000 lines total |
| 5 | Composite and stateful demos (5) | `CollapsiblePanelStack`, `CategoryList`, `PathInput`, `GitTree`, `Notification` — wrappers with sample data, several handlers, or a service dependency |
| 6 | The floating layer (5) | `Menu`, `Tooltip`, `Popover`, `Dialog`, `Progress`. §E11-5 concern 7 lands here — an undisposed overlay outlives its story — and `Tooltip` and `Progress` carry the §E11-4 decisions (no `TooltipView`; `Progress` has only `ProgressOverlayView`) |
| 7 | Virtualized data views and dropdowns (8) | `Tree` (485 lines), `DataGrid` (412), `VirtualGrid` (298), `ListBox`, `MultiListBox`, `Select`, `MultiSelect`, `Autocomplete`. Largest and most stateful, and the only ones that **measure their own root** — §E11-10's centered-flex-item hazard is decided here |
| 8 | `DateInput` | Write `DateInputView` (or point at `InputView`) and convert; delete `DateInput.tsx` if it reaches zero callers |
| 9 | The Storybook editor | The 6 non-story `.tsx` → native views; `storybook` leaves the `Component` arm; `previewChildren` loses its React type. Verify the US-1119 items §E11-10 still lists as owed |
| 10 | Delete the React arm's reach, and collect | Confirm `Story.component` has exactly two callers (`Panel`, `Text`); delete every uikit face whose caller count is now zero, **verifying each individually** — an index re-export makes a folder import look like a face import; correct the removal-ledger row and add the `Panel`/`Text` row |

---

## E11-8 — The closing measurement

Measured after Task 10, on a cold-started app with the Storybook page open.

| Figure | Before | Target | **Actual** |
|---|---:|---:|---:|
| `.story.tsx` files | 43 | 2 | **2** (`Panel`, `Text`) |
| `.story.ts` files | 2 | 43 | **43** |
| `Story.component` callers | 44 | 2 | **2** |
| Storybook editor non-story `.tsx` | 6 (396 lines) | 0 | **0** |
| Editors on the `EditorModule.Component` arm | 9 | 8 | **8** |
| `uikit/` faces deleted outright | 0 | ≥ 15 | **2** — see below |
| `uikit/` faces reduced to type-only modules | 0 | — | **17** |
| `uikit/` non-story `.tsx` | 70 | — | **51** |
| Renderer non-story `.tsx` | 187 | ≤ 181 | **162** |
| Stories rendering | 44 of 45 | 45 | **45, zero failures** |
| React roots, Storybook page, vanilla story | — | 0 | **1** — `uikit/Toolbar`'s, not this epic's |
| React roots, Storybook page, `panel`/`text` | — | — | **2** — the deliberate compatibility island |

**The one target missed, and why it was the wrong target.** The epic predicted "≥ 15 faces deleted"
and delivered **2**. That was not a shortfall in the work; the prediction rested on an assumption
nobody had checked — that a React face is only a component. It is not: **each face file is also its
props-type module.** `Dialog.tsx` exported `Dialog` *and* `DialogProps`, which 16 files import;
`Menu.tsx` had 28 type importers. So the split is:

- **3 measured as free** — of which **2 were genuinely free** (`MultiSelect`, `PathInput`) and one,
  `AlertsBar`, was not: `src/renderer/index.tsx:3` imports a live `AlertsBarView` **defined inside
  that same file**. My own measurement classified it free because it searched for `<AlertsBar` JSX
  and value imports of the *component name*. This is EPIC-068's `SwitchWidget` lesson exactly —
  *a module can have callers of a different export* — and it is the reason Task 10's brief required
  each deletion be verified individually rather than taken from the list.
- **17 with a dead component and live types** — the React function and its `mountVanilla` call are
  deleted, the props interfaces stay, and the file is renamed `.ts`. Nothing in the tree renders
  them any more.
- **29 still have live app callers** and are untouched.

So the accurate closing claim is: **20 of 49 `uikit/` React components are now dead code that has
been removed, and 2 files are gone.** Reducing the remaining 17 to zero is a type-relocation job,
which is Epic F's shape, not this epic's — and Epic F now inherits the measurement instead of
rediscovering it.

## E11-10 — Findings during implementation

Recorded as they were measured, so later tasks inherit them instead of rediscovering them.

### The story count is 44, not 45 — and one story file is an orphan

The "45 stories" figure in §E11-1 and §E11-8 was wrong, and the error is instructive: the count came
from `grep`-ing `storyRegistry.ts` for imported `*Story` identifiers, which also matched the
`import { Story }` **type** import. `ALL_STORIES.length` is **44** at runtime.

Meanwhile there are **45 story files** on disk. The extra one is
`src/renderer/uikit/SelectableRow/SelectableRow.story.tsx` — it exports `selectableRowStory` and
**nothing imports it**. It has never appeared in the Storybook.

That also corrects [`de-react.md`](../de-react.md)'s Epic C coverage claim. It records `SelectableRow`
as the first of the six missing stories that C1 closed; the file was written but never wired into the
registry, so the "42 of 44 components have a story" figure is overstated by one — 41 are actually
reachable. **Decision: register it in US-1120 and convert it there** (25 lines, 3 JSX tags,
`SelectableRowView.tsx` already exists). It is a one-line fix that restores intended coverage and
makes this epic's own closing count truthful; deleting a working story to avoid registering it would
be the worse trade. Third instance in this programme of *the extension — or in this case the
import list — is not the measurement.*

### The baseline is captured (§E11-5 concern 1 discharged)

44 records under the session scratchpad `story-baseline/`, one JSON per story with its rendered
`html`, ordinal, id and status. **42 hold real DOM.** The two that do not:

- `progress-bar` — **unrecoverable**, and deliberately so: it is the US-1119 pilot, already on the
  vanilla arm when the baseline ran. The cost of having chosen it as the pilot, accepted knowingly.
- `notification` — recorded as empty. The reason first written here, that `NotificationDemo` needs an
  interaction, was an **inference and it was wrong**: the real cause was a live crash, found later in
  US-1123 and described below. The empty record is still the correct capture of what the branch did
  at that moment; the explanation attached to it was not.

**The mechanism matters more than the artefact**, because it replaces the UI-clicking procedure
US-1119 planned and it is repeatable for the "after" side of every later task. Rather than driving
the component browser, each story's React arm is rendered directly into a detached, off-screen host
via `mountReactHandle`, with props from `buildInitialProps(story)`, then disposed. That avoids three
failure modes the planned procedure had: no virtualized-row staleness, no accessibility-ref churn,
and no dependence on the Storybook page being open. It captures the *component* subtree rather than
the preview pane, which is the comparable unit anyway.

### The Storybook page cannot be opened programmatically

`app.pages.addEditorPage("storybook-view")` is refused — *"a standalone editor that requires a
specialized model"* — and the scripting facade (`PageCollectionWrapper`) exposes `showAboutPage`,
`showSettingsPage`, `showMcpInspectorPage` and `showBrowserPage` but **not** `showStorybookPage`,
even though `PagesLifecycleModel:792` has it. The sidebar tool that calls it
(`tools-editors-registry.ts:170-175`) is not in the DOM until its panel is opened.

This is the same wall EPIC-068 hit with `git-tree`, and it has the same consequence: **per-story
visual verification through the real `LivePreview` cannot be automated from MCP.** The detached-mount
harness above is the automatable substitute — it exercises `mountVanilla` and the view, but not
`LivePreview`'s arm selection, prop plumbing or error boundary. Every task must therefore state which
of the two it verified with. Adding `showStorybookPage` to the scripting facade would remove the
wall for four lines; it is **out of scope** here (it is an API change, not a De-React one) and is
recorded as a follow-up worth having.

### The task grouping was built on the wrong predicate — 35 of 45 stories are demo wrappers

§E11-7 split the stories by **JSX tag count** (10 zero-JSX, then "simple JSX", "floating-layer",
"data-view"). That measured the wrong thing, and US-1120 found out the expensive way.

The predicate that matters is **what `component:` points at**. Measured across all 45 stories:

| `component` / `view` target | Count |
|---|---:|
| The uikit face or its `*View` directly | **10** (the 9 now converted, plus `Panel`) |
| A **story-local React wrapper** — `*Demo`, `*Preview`, `*WithIcon`, `*WithPreset` | **35** |

A story-local wrapper is not a formality. It holds demo state, sample data, event handlers, layout
context, and sometimes real branching — `DividerInPreview` swapped its entire layout on the
`orientation` prop. Several contain no JSX at all because they are written with
`React.createElement`, which is exactly why a JSX-tag count classified them as mechanical.

**So the remaining epic is not "point 35 stories at a `*View`". It is "rewrite 35 React demo
wrappers as `VanillaView` demo classes"** — roughly 4,000 lines of authored view code, not renames.
The payoff in §E11-1 is unchanged and still real; the *cost* in §E11-3 was understated, and it was
understated because the sizing used file extensions and tag counts rather than reading what each
story renders. **Third instance in this one epic of the same lesson**: the `.tsx` extension is not
the measurement, the import list is not the measurement, and the JSX tag count is not the
measurement.

The task list in §E11-7 should therefore be re-cut by *wrapper complexity* — stateless layout
context, then stateful demos, then floating-layer, then virtualized data views — rather than by tag
count. US-1120 establishes the demo-view pattern on three of them.

### The baseline caught three silent regressions in its first use

US-1120 converted eight stories with `typecheck`, `lint` and `build-prod` all green, and reported
three others as blocked. The DOM comparison showed **five byte-identical and three that had lost
their demo container**:

- **`divider`** — a bare `<div data-type="divider">` where the baseline had "Above / divider /
  Below" in a 200px column Panel. A horizontal rule alone in a centered preview is effectively
  invisible, and `orientation` — the story's only control — demonstrated nothing.
- **`spacer`** — a bare `<span data-type="spacer" style="--spacer-size: 0px">`, which renders
  **nothing visible at all**. The story was blank.
- **`selectable-row`** — lost its `data-focus-selection` + `tabindex="0"` wrapper, which is a **CSS
  opt-in** for focus-within selection styling (`uikit/ListBox/ListBox.css:7`,
  `CategoryList.css:61-68`), so `selected` and `active` — its only two controls — could no longer
  show what they do.

This is precisely the failure mode §E11-5 concern 1 named as the epic's largest risk, arriving on
the first batch: **a story that renders *something* while no longer rendering what it used to, with
every gate green.** Two things it settles beyond this epic. First, the baseline is not optional
bookkeeping — it was the only instrument that saw this, and it paid for itself within one task.
Second, and more uncomfortable: the implementing agent reported three stories as blocked while
silently flattening three others of the *same class*. **A report of what could not be done is not
evidence about what was done.** Later tasks in this epic must be gated on the DOM comparison, never
on the conversion summary.

### Reading the DOM diff: two benign differences, and one real win

All three US-1120 regressions were fixed and re-verified against baseline. The comparison also
surfaced two differences that are **expected and harmless**, and which will recur on every one of
the 35 wrapper conversions — recorded here once so they are not investigated 35 times:

1. **The `display: contents` wrapper moves.** In the React arm each `<Component>` is
   `mountVanilla`, so the wrapper sits around *the component*; in a converted demo view the wrapper
   sits around *the whole demo* and the component is a direct child. Neither element generates a
   box, so layout and appearance are unchanged.
2. **Boolean panel attributes render differently.** React emits `data-border="true"`;
   `createPanelElement` emits `data-border=""`. Every stylesheet selects on presence
   (`[data-border]`), so both behave identically.

The third difference is not benign — it is the epic's thesis showing up as a measurement.
`selectable-row`'s **baseline** contained:

```html
<div data-type="selectable-row"><span data-part="react-slot" data-react-root="" style="display: contents;">
```

The React `<SelectableRow>` handed its children to `fillSlot`, which took its React arm and created
a **nested React root inside the story**. The converted version has no `react-slot` and no
`react-root` — the child is plain DOM. So this story went from costing 1 nested React root to
costing 0, which is the **first concrete root reduction in E11** and confirms §E11-2's mechanism
from the opposite direction: the nesting appears wherever a native view is handed React slot
content, and disappears when the caller stops being React.

It also means the epic's "no user-facing page loses a React root" caveat is right but incomplete:
the *Storybook page itself* loses roots as stories convert. That is worth measuring at close as a
local number, and it is the only roots claim E11 may honestly make.

### The `iconPreset` synthetic prop, and why three stories are still React

`Button`, `IconButton`, `SplitButton` and `Toolbar` each declare a `PropDef` named `iconPreset` with
`type: "icon"`, and each hand-rolls the same translation in its wrapper —
`icon: resolveIconPreset(iconPreset)` (`editors/storybook/iconPresets.tsx`). `iconPreset` is a
**synthetic harness prop**: no component has it, so US-1119's `PropDef<P>`'s `keyof P & string`
correctly refuses it. That is the constraint working, not an obstacle.

The fix belongs in the harness, not in four wrappers: `STORYBOOK_MANAGED_PROPS` already exists for
exactly this class (it holds `background`), so a `type: "icon"` PropDef should be resolved centrally
from a preset id to an `IconRef` and delivered as the component's real `icon` prop. That deletes
triplicated logic and unblocks the `keyof P` check for four stories. **Scheduled as its own task**
below; those three stories stay on the React arm until it lands.

### US-1123 surfaced a live crash in `NotificationView` — every toast was broken

`NotificationView`'s constructor did this:

```ts
public constructor(props: NotificationProps) {
    super(props, document.createElement("div"));
    this.root.classList.add("notification-root");
    this.iconHost.dataset.part = "icon";   // iconHost is only assigned in onMount()
}
```

`iconHost` is declared `HTMLSpanElement | undefined` and created in `onMount()`, so **every**
`new NotificationView(...)` threw `Cannot read properties of undefined (reading 'dataset')`.
Verified live before the fix, not inferred.

`AlertItemView` constructs a `NotificationView` **in its own constructor**
(`uikit/Notification/AlertItemView.tsx:31`), and `AlertsBar` is mounted from the application root —
so **no alert or toast in the app could render.** Fixed here by deleting that constructor line;
`onMount()` already sets the attribute. Confirmed after the fix: `NotificationView` mounts with its
icon, and `AlertItemView` renders its message.

Three things worth keeping:

- **It never shipped.** `git log -S` places its introduction in `17a0a5b7` (EPIC-066, retyping
  converted-view event props), which exists only on `upcoming-v4.0.23` — not on `main`, not in any
  tag. It would have shipped in 4.0.23.
- **It is the `uikit/CLAUDE.md` rule that US-1055 already tracks**: the constructor must not create
  or touch child DOM. Two epics have now hit it. It is worth an ESLint rule or a base-class guard
  rather than a third occurrence, and that argues for raising US-1055's priority.
- **It is why `notification`'s baseline was empty**, which corrects the inference recorded above.
  The React face is `mountVanilla(NotificationView)`, so the throw happened inside
  `useLayoutEffect` during commit and the root simply rendered nothing. The converted story renders
  2,210 characters of real DOM where the baseline had 0 — a case where "the after is bigger than the
  before" is correct rather than suspicious, and the only one in this epic so far.

The general lesson is the uncomfortable one: **an empty baseline is not self-explanatory.** This one
was recorded with a plausible cause attached and the cause was wrong. A story that renders nothing
deserves the same "locate it in source" discipline the programme already applies to before/after
measurements (`de-react.md`, E3's withdrawn Rule 4 number).

### The close review found the same constructor rule broken twice more — one a second live crash

`/review` reported five findings it did not act on. Verified against source, the two in
`uikit/Progress/ProgressOverlayView.ts` are **the same defect as the `NotificationView` crash**, in a
file this epic never touched:

- **`BlockingBranchView`'s constructor** set `this.header.dataset.part` and
  `this.content.dataset.part` while both are created in `onMount()`. Confirmed live: clicking the
  Progress story's controls produced `Uncaught TypeError: Cannot read properties of undefined
  (reading 'dataset')` and the blocking element never appeared — **the application's blocking
  progress overlay could not render.** Fixed; the overlay now appears for the duration of a timed
  lock and is gone afterwards, with no errors.
- **`ProgressPillView`'s constructor** created its `SpinnerView` via `this.child(...)`, and
  `onMount()` created a second one over the same field. The first was owned but never mounted and
  immediately orphaned — a leak *and* a constructor building child DOM. Fixed.

Both were introduced in **EPIC-055 (C2)** on 2026-08-21 (`3f7f8d5a`, "Implement US-1009 vanilla
progress overlay"), are not on `main`, and are in no tag — the latest release is v4.0.22, so like the
`NotificationView` crash they were **unreleased and would have shipped in 4.0.23**.

**That makes four violations of one rule** — *the constructor must not create or touch child DOM*
(`uikit/CLAUDE.md`) — across three epics: `MermaidBodyView` (EPIC-059, tracked as US-1055),
`NotificationView` (EPIC-066), and both classes here (EPIC-055). Two of the four were **live
crashes**, and neither was caught by `tsc`, ESLint, `build-prod`, or any story render — a definite
assignment assertion (`private x: T | undefined`) makes the constructor compile and the throw is a
runtime `TypeError` on a path nothing exercised.

Four instances is no longer a series of mistakes; it is a missing guard. The cheapest fix is
mechanical: either an ESLint rule forbidding `this.<field>` writes and `this.child(...)` calls in a
`VanillaView` constructor, or a base-class assertion that fails loudly in development. **This should
be scheduled before the next conversion epic, not after** — every remaining epic in this programme
writes new `VanillaView` subclasses, so the fifth instance is already being invited.

### Three findings recorded rather than fixed

The other three are pre-existing lifecycle concerns, none in code this epic added, and each deserves
its own task rather than being folded into an epic close:

| Finding | File | Why it is not fixed here |
|---|---|---|
| `ListBoxView` retains obsolete rows in `rowViews` | `uikit/ListBox/ListBoxView.ts` | The set is added to at `:329`/`:335` and removed from only at `:424`, so a row discarded by another path stays. **This epic's only change to the file is the four-line `Node` arm for the widened `renderItem`, which creates no view** — the concern predates it |
| `DataGridView` omits `releaseChild()` on replaced branches | `uikit/DataGrid/DataGridView.ts` | Untouched by this epic |
| `ToolbarView` reuses a single-use DOM `IconRef` | `uikit/Toolbar/ToolbarView.ts` | Untouched by this epic. Plausibly related to the nested React root this epic measured in `ToolbarView` and recorded above — worth investigating together |

### The verification harness must use the real prop-preparation path

US-1121 moved the `type: "icon"` preset resolution into the harness, which was the right call — and
it immediately broke the DOM comparison, in a way worth recording because the same trap will recur.

The comparison harness (§E11-10) reproduces `LivePreview`'s prop preparation in order to render a
story. When the resolution moved into `LivePreview` as a **module-private** function, the comparison
kept passing the raw preset id, so views received `icon: "folder"` — and there is no icon named
`folder`, the real name is `folder-open`. `createIconElement` produced an **empty `<svg>`**, and
three stories looked like regressions. They were not; the duplicate was wrong.

Two things follow. First, an operational one: **a DOM comparison is only evidence if it renders
through the same preparation the harness uses.** §E11-10 already warned that the detached harness
does not exercise `LivePreview`'s prop plumbing; that warning turned out to be the whole story.
Second, the fix is structural rather than a note-to-self — the preparation is now
`prepareStoryProps()` in `editors/storybook/story-props.ts`, exported and called by `LivePreview`,
so there is one definition and the comparison uses it directly. It also has to survive `LivePreview`
becoming a native view later, which is a second reason it does not belong inside the component.

A false alarm is cheap; a *silent* divergence between the verification path and the real one is not,
and with 35 stories left to verify it would have compounded.

### Six `uikit/` props were under-declared, and the stories are what proved it

The conversions turned up a consistent, unremarked defect in `uikit/`'s public types. Six props are
consumed by `fillSlot`, which accepts `string | Node | React.ReactNode`, yet were **declared
`ReactNode` only** — so a vanilla caller handing a DOM node was blocked by the declaration while the
implementation would have accepted it happily:

| Prop | Was | Now |
|---|---|---|
| `CollapsiblePanelStackProps.buttons` | `ReactNode` | `ReactNode \| Node` |
| `DialogContentProps.headerButtons` | `React.ReactNode` | `React.ReactNode \| Node` |
| `TreeProps.renderItem` | `… => React.ReactNode` | `… => React.ReactNode \| Node` |
| `ListBoxProps.renderItem` | `… => React.ReactNode` | `… => React.ReactNode \| Node` |
| `ListBoxProps.emptyMessage` | `SlotText` | `SlotText \| Node` |
| `AutocompleteProps.emptyMessage` | `SlotText` | `SlotText \| Node` |

Every one is a one-word change, none needed a runtime change, and in the first case the correct type
was **already written on the adjacent line** (`children: ReactNode | Node`). They went unnoticed
because until now every caller was React, so nothing ever tried to pass a `Node`.

Two things worth keeping. First, this is roadmap **Rule 7 applied inward**: the first instinct in
US-1123 was a `as unknown as ReactNode` cast at the call site, which would have left the wrong
declaration in place and hidden the next instance too. Widening the prop is the fix; casting is the
workaround, and the rule that came out of it held on every later application. Second, it is a
concrete answer to the question of what a harness is *for*. §E11-5 concern 2 accepts that converted
stories stop covering the React faces — but converting them **surfaced six real contract defects in
`uikit/`**, which is coverage of a different and arguably better kind: the stories became the first
non-React consumer of these props, and that is exactly what a library about to lose its React
callers needs.

### `toolbar`'s nested React root is pre-existing

`toolbar`'s converted DOM still carries `data-react-root=""` on `.toolbar-root`. **So does its
baseline** — this is not a conversion artefact. `ToolbarView` fills its content slot through
`fillSlot`'s React arm regardless of what the caller passes, so the root survives the story
conversion. It is a `uikit/` matter rather than a story matter; recorded here so a later task does
not chase it as a regression, and flagged as one more root that a `uikit/`-side fix could reclaim.

### The stale dynamic-import trap needed a full dev-server restart, not a touch

EPIC-068 recorded that a `.tsx` → `.ts` rename leaves the Vite dev server resolving the stale
specifier until the **importer** is touched, and that touching `editors/register-editors.ts` clears
it. That remedy was written into every brief in this epic and it worked for the 43 story renames,
whose importer is `storyRegistry.ts`.

It did **not** work for the editor's own `index.tsx` → `index.ts`. Opening the page kept failing with

```
Failed to fetch dynamically imported module: …/editors/storybook/index.tsx?t=1787774630758
```

and — the diagnostic detail worth keeping — **the `?t=` timestamp never changed** across a touch of
`register-editors.ts`, a `location.reload()` of the renderer, and a main-process rebuild. A frozen
cache-busting timestamp means nothing in the chain re-resolved the specifier; the stale resolution
lived in the dev server's own module graph, not in the renderer's.

So the recovery ladder in [`codex-dev`](../../.claude/skills/codex-dev/SKILL.md) §5a needed its
step 2: kill the dev server and `npm start`. **The rule is narrower than EPIC-068 stated**: touching
the importer clears a stale *renderer* module, but a renamed module that is reached through a
**dynamic** `import()` from the editor registry needs the server restarted. A frozen `?t=` is how to
tell the two apart, and it is worth checking before concluding a conversion is broken — the symptom
is identical to a genuine mount failure, which is exactly what §5a warns about.

### The US-1119 pilot is verified live

Exercised through the real vanilla path (`mountVanilla(ProgressBarView, props)` inside a React root):
it renders `data-type="progress-bar"` with `aria-valuenow="50"` and a 50% fill, and on
`value: 90` it re-renders to `aria-valuenow="90"` and 90% **on the same DOM node**
(`sameNodeAfterUpdate: true`). That in-place update with no remount is precisely the behaviour a
static review cannot confirm, and the reason ProgressBar was chosen as the pilot over the smaller
`Spinner`.

Still **not** verified for US-1119, and owed before the epic closes: the arm selection, unexpected-key
warning, malformed-story message and `key={story.id}` boundary reset as seen through the real
`LivePreview` in an open Storybook page.

---

## E11-9 — Progress

- [x] Task 1 — baseline captured (45 records) and the vanilla arm landed; ProgressBar pilot verified live
- [x] Task 2 — pilot: 8 zero-JSX stories converted, 5 byte-identical, 3 regressions found and fixed
- [x] Task 3 — the `type: "icon"` synthetic prop; resolution centralised, `prepareStoryProps()` extracted
- [x] Task 4 — 11 simple demos converted; element counts and text verified equal to baseline
- [x] Task 5 — 5 composite demos converted; surfaced and fixed the `NotificationView` crash
- [x] Task 6 — 5 floating-layer demos converted; overlays verified to open and to leave nothing behind on dispose
- [x] Task 7 — 8 data-view stories converted + `ProgressBar` renamed; row counts, dropdown open/teardown and tree expansion all verified against the figures Codex committed to
- [x] Task 8 — `DateInputView` written, `DateInput.tsx` delegates to it, story converted; ISO API verified live
- [x] Task 9 — the Storybook editor is native; verified live (opens, 34 virtualized rows, previews render, arm switching disposes)
- [x] Task 10 — 2 faces deleted, 17 reduced to type modules, ledger corrected
- [x] Review pass — `/review`, `/document`, `/userdoc` via Codex; its two `ProgressOverlayView` findings were real and are fixed, three pre-existing `uikit/` findings carried forward as US-1132
- [x] Epic closed 2026-08-27 after the user verified the Storybook by hand

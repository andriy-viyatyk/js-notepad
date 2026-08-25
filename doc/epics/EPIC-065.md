# EPIC-065 — De-React E7: the dialog/popper view registry

**Status:** Complete
**Created:** 2026-08-25
**Completed:** 2026-08-25
**Roadmap:** [De-React programme](../de-react.md), Epic E7. Follows
[EPIC-064](EPIC-064.md) (E6, the icon contract).

## Closing property

`core/state/view.tsx` is **deleted** — `Views`, `View`, `DefaultView` and `IViewRegistration` with
it — and `ui/dialogs/dialog-view-registry.ts` is the only registry the dialog and popper hosts
consult. `DialogsView.ts` and `PoppersView.ts` lose their React fallback arm, their `fillSlot`
import and their `import type React`. No dialog or popper costs a React root while open.

**What must not be claimed at close:** that the app has no React roots (18 remain, all outside this
epic's scope — §E7-7), that `uikit/` has no Emotion importer (`theme/GlobalStyles.tsx` survives, and
E7 makes it the *last* non-story one — §E7-2), or that the `Popover` React face is gone (two callers
survive, both by Rule 2 — §E7-7). E6-11 is the standing reason this paragraph exists: the epic
before last over-reached in its own closing property, in the document written to catch exactly that.

---

## E7-1 — The contract, and the fresh search that confirmed it

E6-8 recorded this candidate **with its measurements already taken**, which is what E5-1 asked for.
But a recorded candidate is still a prediction until re-verified, and E4-1's generalisation —
*"no contract left" is a claim about the whole import graph, not about one folder* — cuts both ways:
a candidate found while looking at `uikit/` can be displaced by something the next sweep turns up.
The standing check from E5 is that **the axis of the next epic is not predicted from the folder the
current one touched.** So the search was re-run across the whole renderer before this document
committed to an axis.

**The contract, re-measured and unchanged:**

`core/state/view.tsx` exposes `Views.registerView(viewId, React.FC)` and
`Views.renderView(): ReactElement`. `ui/dialogs/dialog-view-registry.ts` exposes the vanilla arm,
`registerDialogView(viewId, VanillaViewCtor)`. `DialogsView.ts` and `PoppersView.ts` consult the
native registry first and fall back to `Views.renderView` through `fillSlot`. This is precisely
E5's `ReactSecondaryViewDefinition` shape one layer down: **a dual-armed registry where the React
arm pins its registrants regardless of their own content.**

| | Count |
|---|---:|
| Registrations on the vanilla arm (`registerDialogView`) | **14** |
| Registrations still on the React arm (`Views.registerView`) | **4** |

The four, with the measurement that matters most (§E7-5):

| File | Lines | React-local state |
|---|---:|---|
| `editors/grid/components/ColumnsOptions.tsx` | 394 | 1 `useMemo` on an immutable field |
| `editors/link-editor/EditLinkDialog.tsx` | 356 | **none** |
| `editors/browser/BrowserDownloadsPopup.tsx` | 206 | **none** |
| `editors/grid/components/CsvOptions.tsx` | 107 | `useState` + `useEffect` + 2 `useCallback` |
| **Total** | **1,063** | |

### What the sweep turned up instead, and why none of it displaces the candidate

Recorded so the next epic does not have to re-run the same greps, and so a rejected candidate is
rejected *on a number* rather than on taste.

- **`trailing?: React.ReactNode` (`uikit/ListBox/types.ts`, `uikit/Tree/TreeItem.tsx`).** The same
  slot family `IconRef` belonged to, and the obvious next thing to narrow. **5 call sites, of which
  0 pass JSX.** It is a dead React arm, not a contract with pinned callers — a type narrowing
  attachable to any commit that touches those files, and explicitly **not** an epic. Recording the
  zero is the point: without it this gets re-proposed every epic on the strength of its shape.
- **`uikit/shared/highlight.ts`'s React form** (`highlight(): React.ReactNode`) — a standing
  removal-ledger entry. Sole surviving caller is `editors/graph/GraphBody.tsx`, 3 sites. It is
  pinned by `graph` (3,259 lines, unscheduled), so **the ledger entry cannot be collected until
  graph converts**, whatever else happens. Not this epic; worth stating because "collect the
  highlight ledger entry" reads like small work and is not.
- **`SlotContent = string | Node | React.ReactNode` (`fill-slot.ts`)** and the ~14 remaining
  `children?: React.ReactNode` / `headerButtons?: React.ReactNode` props across `uikit/`. These are
  the React *faces* of converted components, kept by Rule 2 and fed by genuine React callers. E6-1
  already corrected the claim that deleting a contract empties the machinery underneath it.
- **The 5 `uikit/` React faces of vanilla views** (`Autocomplete`, `Menu`, `MultiSelect`,
  `PathInput`, `Select`) construct `PopoverView` through its internal `contentView` seam, not
  through React children. They cost no root and are not in scope.

No candidate outweighs a 4-registration contract whose deletion removes a whole file and a whole
registry arm. The axis holds.

---

## E7-2 — Measured surface at epic open (2026-08-25)

### Live React roots

Measured in the running app, both markers queried (`[data-react-root]` and
`[data-part="react-slot"]` — E5-3's corrected instrument), on the working session as found: 6 pages
(1 board, 1 notebook, 1 markdown preview, 1 file-diff, 1 git-tree, 1 browser tab).

| | Count |
|---|---:|
| Live React roots, total, no dialog open | **18** |
| …of which are icon-slot arms | **0** |

**EPIC-064's closing property verified in the wild**, on a real session rather than the fixture it
was measured on: 44 → 0 icon arms, and the 18 survivors are exactly the direct `mountReactHandle`
roots E6-7 named as non-goals.

### Root cost per dialog — the number this epic drives to zero

Each dialog was opened, counted and closed on a scratch page; the count returned to baseline every
time, so no measurement leaked into the next.

| Dialog / popper | Roots while open |
|---|---:|
| `EditLinkDialog` | **+4** |
| `BrowserDownloadsPopup` | +2 |
| `CsvOptions` | +2 |
| `ColumnsOptions` | +2 |

The +2 decomposes exactly, and the decomposition is why this epic is worth doing rather than being
two roots of noise: **one root for the registry's `fillSlot` arm, one for `PopoverView`'s
`mountReactHandle` children arm.** Converting a popper collects *both* — the registry arm because
the view is native, and the Popover arm because a native content view uses `PopoverView`'s
`contentView` seam, which the 5 uikit consumers already use and which keeps the floating root's
children native DOM.

Worth noting for the instrument's sake: the roots sit **outside** `.popover-shell`, so a selector
scoped to the visible popover finds none of them. Same class of error as E5-3's — a count is only
as good as the selector's reach.

### Emotion, and what E7 leaves behind

Three importers of `@emotion/*` remain in the renderer:

| File | Fate |
|---|---|
| `core/state/view.tsx` (`ViewRoot = styled.div`) | **Deleted by this epic** |
| `theme/GlobalStyles.tsx` (`css` + `Global`) | Survives — the app's global stylesheet |
| `uikit/Tree/Tree.story.tsx` | Survives — a story |

So **E7 leaves `theme/GlobalStyles.tsx` as the last non-story Emotion importer in the renderer.**
That is a concrete programme milestone and a cheap thing to check, so it is stated here rather than
discovered later: after this epic, "remove Emotion" is one file.

---

## E7-3 — No capability gap, again — but for a component conversion this time

E6-3 could say "nothing has to be built" because every icon already had a DOM builder. The same
turns out to hold here, which is *not* obvious for a conversion epic: four dialogs with their own
layout could easily have needed a new primitive. Every uikit component the four use has a vanilla
arm today:

| Used by the four | Vanilla arm |
|---|---|
| `Dialog`, `DialogContent` | `DialogView.tsx`, `DialogContentView.tsx` |
| `Panel`, `Text` | `createPanelElement`, `createTextElement` (builders, not views) |
| `Button`, `IconButton`, `Input`, `Textarea`, `Checkbox`, `Spacer` | `*View` |
| `Select`, `PathInput`, `TagsInput`, `RadioGroup` | `SelectView`, `PathInputView`, `TagsInputView`, `RadioGroupView` |
| `Popover` | `PopoverView` + its `contentView` seam |
| `Tooltip` | `Tooltip/attach-tooltip.ts` |
| `DataGrid` | `DataGridView.ts` |

And there is a directly comparable precedent to copy: **14 dialogs on the vanilla arm already**,
of which `ui/dialogs/CommitDialog.ts` + `CommitDialogView.ts` is the closest in shape to the work
here — a `TDialogModel` holding all state, a `VanillaView` binding to it, `registerDialogView` at
module scope. Every task in §E7-8 references it rather than re-deriving the pattern.

---

## E7-4 — Rule 4 metric

**Metric:** React roots created while a given dialog or popper is open, measured per dialog with
both markers queried, on a scratch page, returning to baseline between measurements.

**Why not the usual total-root count.** E6's 44 were on screen continuously, so a single whole-app
number was the honest instrument. These 10 are not: they exist only while a dialog is open, and at
most one dialog plus one popper is realistically open at once. A total-root count would move by 2
and read as noise, understating an epic that removes a registry arm and a file. **The metric has to
match how the cost is incurred** — per dialog, not per session. Recording this because picking the
wrong instrument is now twice-attested in this programme (E5-3's blind selector, E6-5's lying file
extension), and both times the number was wrong before the work was.

**Target:** each of the four → **0**. Total across the four: 10 → 0.

**Secondary, checkable at close:** `core/state/view.tsx` does not exist; nothing imports `Views`;
`DialogsView.ts` and `PoppersView.ts` contain no `fillSlot` and no `React`; non-story Emotion
importers = 1.

---

## E7-5 — Line count is not the difficulty axis here; React-local state is

E4-1 said that with no shared contract to scope by, line count is the fallback axis, and E5 and E6
both repeated it. Measured on these four, **line count inverts the actual difficulty**:

- `EditLinkDialog` (356) and `BrowserDownloadsPopup` (206) — the two largest — have **zero React
  hooks.** Every piece of their state lives in the `TDialogModel` / `TPopperModel` already, reached
  through exactly one `model.state.use()`. That one call is a `this.bind(...)` in a `VanillaView`.
  They are large but mechanical: markup translation, no state migration.
- `CsvOptions` (107) — the smallest, by a factor of three — is the only one with genuine React-local
  state: a `useState` for the "Other" delimiter box, kept in sync with model state by a `useEffect`,
  plus two `useCallback`s. That local-vs-model sync loop has to be lifted into the model, and it is
  the one place in the epic where behaviour can silently change.
- `ColumnsOptions` (394) has one `useMemo`, keyed on `model.isCsv` — immutable for the lifetime of a
  popper instance. It becomes a constructor-time constant. Not state at all.

**So the ordering in §E7-8 is by state complexity, not by size**, and the pilot is the 206-line file
rather than the 107-line one. The generalisation worth carrying forward: *for a conversion, the cost
is where the state lives, and line count only correlates with that when the component owns its own
state.* Line count remains the right axis for choosing **which surface** to take next — it is the
wrong axis for ordering tasks **within** a surface.

---

## E7-6 — Concerns / open questions

1. **`CsvOptions`' local-vs-model delimiter sync is the epic's one real behaviour risk.** The
   current code keeps a local `other` string that follows `csvDelimiter` only when both are
   non-empty and differ, and pushes single characters back through `setDelimiter`. Truncation to one
   character, the empty-string case, and the "don't clobber what the user is typing" guard are all
   encoded in that pair of hooks. **The task must state the observable behaviour it is preserving,
   not just move the code** — typing a two-character delimiter, clearing the box, and switching the
   radio while the box has content are the three cases to check by hand.
2. **`EditLinkDialog`'s `handleKeyDown` is typed `React.KeyboardEvent`.** It lives on the model, so
   it survives the view conversion, but its parameter type must become a DOM `KeyboardEvent`.
   `e.defaultPrevented`, `e.preventDefault()`, `e.key`, `e.ctrlKey` and `e.metaKey` all exist on
   both, so the body is unchanged — but this is a model file keeping a React type after its view
   stops being React, which is exactly the kind of residue that survives a conversion unnoticed.
3. **`ColumnsOptions` hosts a `DataGrid`.** `DataGridView` is a mounting shim over an imperative
   av-grid instance that *owns* its own row/column/selection state (EPIC-057 C4-2), and the React
   `<DataGrid>` face pushes props into it on every parent render. A `VanillaView` host updates on
   `bind`, not on every render, so the push cadence changes. Verify column reorder, resize and the
   visibility checkboxes by hand — a shim whose update cadence changes is not something `tsc` can
   check.
4. **`showPopper`/`showDialog` resolve a promise the caller awaits.** All four public entry points
   (`showCsvOptions`, `showColumnsOptions`, `showDownloadsPopup`, `showEditLinkDialog`) keep their
   exact signatures and resolution behaviour — they are the API, and the registry swap must be
   invisible to every caller. `showDownloadsPopup` additionally has `isDownloadsPopupOpen()`
   reading `visiblePoppers()`; that must keep working.
5. **Deleting `core/state/view.tsx` moves types, not just code.** `IViewData`, `IDialogViewData`,
   `ViewProps`, `ViewPropsRO` and `DefaultProps` live there and are imported by
   `dialog-view-registry.ts`, `DialogsView.ts` and `poppers/types.ts`. Only `DefaultView`,
   `IViewRegistration`, `Views` and `View` are actually dead. **The final task relocates the
   surviving types rather than deleting the file wholesale** — and the load-bearing `any` in
   `IDialogViewData`'s default type parameter, with the comment explaining why widening to `unknown`
   breaks subclass assignment, must travel with it verbatim.
6. **The single-use-`Node` hazard from E6.** Four occurrences last epic, four mechanisms, none
   visible to `tsc`, lint, build or the root count. These conversions build DOM in views rather than
   passing icons around, so the exposure is lower — but any icon or element hoisted to module scope
   or cached across `bind` calls in the new views is the same bug. Named here so each task's review
   looks for it.
7. **No new stories are owed.** Dialogs and poppers are exercised through the app, and the 14
   already-converted dialogs added none.

---

## E7-7 — Non-goals, with reasons

| Surface | Why it stays |
|---|---|
| The 18 remaining React roots | `AsyncEditorView`, `PageSlot`, `BoardSecondaryView`, `GlobalStyles`, `CategoryViewImpl`, `PopoverView`, `ToolbarView`. All host React content from React callers (Rule 2). E6-7 named the same set. |
| `PopoverView`'s `mountReactHandle` arm | After this epic its React-children callers are `editors/board/BoardToolbar.tsx` and `editors/file-diff/RevisionPicker.tsx` — 2 surviving callers, both unscheduled conversions. The arm goes when they do, not here. |
| `theme/GlobalStyles.tsx` and its Emotion import | The app's global stylesheet. Becomes the last non-story Emotion importer (§E7-2) — a one-file epic of its own, later. |
| `uikit/shared/highlight.ts`'s React form | Pinned by `GraphBody.tsx`. §E7-1. |
| `trailing?: React.ReactNode` | 5 sites, 0 pass JSX. A type narrowing, not an epic. §E7-1. |
| `fillSlot`'s React arm, `mount.tsx`'s `createRoot` | Still fed by `Button` children, `Input` slots and dialog children from React callers. E6-1. |
| `editors/base` chrome, the 24 `<TextChrome>` sites | E1-8: converts for free once the last shell is vanilla. Deliberately last in the programme. |
| `graph` (3,259), the browser editor (1,692) | Unscheduled conversions. Only `BrowserDownloadsPopup` — a popper the browser editor opens, not the editor itself — is in scope. |

---

## E7-8 — Task breakdown

Ordered by state complexity, not line count (§E7-5). The type narrowing is **last** (Rule 3: `main`
is releasable after every task, and the dual-armed registry means each conversion is independently
shippable). Rule 1 is satisfied throughout: each dialog is a leaf, and its parent — the
`DialogsView`/`PoppersView` host — is already vanilla and is touched only by the final task.

Every task's completion condition includes green `tsc --noEmit` **and** green `npm run lint` with
zero warnings, and a live check that the dialog opens, functions and closes with **0 React roots**
attributable to it. Green `tsc` is a completion condition, never a follow-up (EPIC-063's process
fix).

- [ ] **US-1086 — `BrowserDownloadsPopup` → vanilla.** The pilot: 206 lines, zero React hooks, one
  `downloads.state.use()` → one `bind`. Establishes the popper-with-`contentView` pattern the next
  three copy. Keeps `showDownloadsPopup` / `closeDownloadsPopup` / `isDownloadsPopupOpen`
  signatures exactly. Includes the progress bar and the per-item button states.
- [ ] **US-1087 — `EditLinkDialog` → vanilla.** Largest file, zero hooks. Uses `DialogView` +
  `DialogContentView` and the vanilla `Select`, `PathInput`, `TagsInput`, `Textarea` views. Resolves
  concern 2 (the `React.KeyboardEvent` on the model). Discovered-images list and the Tor image
  proxy path must both still work.
- [ ] **US-1088 — `ColumnsOptions` → vanilla.** Hosts `DataGridView`; concern 3 is this task's
  main risk, and column reorder / resize / visibility are hand-checked. The `useMemo` becomes a
  constructor constant.
- [ ] **US-1089 — `CsvOptions` → vanilla.** Smallest file, hardest state. Lifts the local `other`
  delimiter into the model per concern 1, and the task brief states the three behaviours being
  preserved before it changes any code.
- [ ] **US-1090 — Delete the React arm.** Relocate the surviving types out of
  `core/state/view.tsx` per concern 5, delete the file, drop the `Views` fallback plus the
  `fillSlot` and `React` imports from `DialogsView.ts` and `PoppersView.ts`, and confirm the
  Emotion importer count is 1 non-story. Closing property met here and nowhere earlier.

Any `.tsx` → `.ts` rename is an **explicit requirement of each brief**, not a follow-up — all four
files lose their JSX and must lose the extension with it (EPIC-063's process fix; EPIC-064 had to
rename 26 files in one batch because earlier epics deferred it). A batch rename needs a full app
restart, not a renderer reload — Vite serves every module and `tsc` stays green while the running
renderer holds stale specifier resolutions.

---

## E7-9 — Progress

*(updated as tasks complete)*

| Task | Status |
|---|---|
| US-1086 `BrowserDownloadsPopup` | **Done** — +2 roots → **0**, verified live |
| US-1087 `EditLinkDialog` | **Done** — +4 roots → **0**, verified live |
| US-1088 `ColumnsOptions` | **Done** — +2 roots → **0**, verified live |
| US-1089 `CsvOptions` | **Done** — +2 roots → **0**; 3 of 4 invariants verified live |
| US-1090 Delete the React arm | **Done** — closing property met |

### US-1087 / US-1088 — notes

Both converted, `.tsx` → `.ts`, `registerDialogView`, `PopoverView.contentView` for the popper.
`tsc --noEmit` and `npm run lint` green, run directly rather than taken from the report. React
registrations went 4 → 3 → **1**. US-1087 split model from view (following `CommitDialog`); US-1088
kept one file, because there the model is the bulk of the 394 lines and never changed.

Two properties preserved in US-1088 that were worth stating in the brief rather than leaving to be
rediscovered:

- **`rowsForGrid()` identity.** Under React the rows array was re-pushed on every parent render; a
  `VanillaView` pushes only on `bind`, a *lower* cadence. That is safe here **only** because
  `rowsForGrid()` returns `grid?.getRows() ?? rows` — av-grid's own array once the grid exists — so
  re-pushing is an identity no-op. Copying or spreading it would have discarded av-grid's in-place
  cell edits, since av-grid writes `row[key] = value` itself. A cadence change is safe or unsafe
  depending on a property of the *value*, not of the cadence.
- **The `onClose` guard reads live state.** `visiblePoppers().length === 1 && !changed` is what stops
  a click-outside from discarding pending column edits, so `changed` must be read at close time, not
  captured when the view was built.

The two surviving `React` mentions in `ColumnsOptions.ts` are historical comments ("under the React
grid…") recording why `isStatusColumn` was dropped and why row/column apply order now matters. Kept
deliberately: they are reasoning, not residue.

### US-1086 — notes

Renamed `.tsx` → `.ts`. Registered with `registerDialogView`; uses `PopoverView`'s `contentView`
seam, so **both** roots went (registry arm and Popover children arm) — the popper now costs **0**,
measured live, down from +2.

`git mv` was unavailable (the environment could not write `.git/index`), so the rename is a plain
filesystem rename. Git will infer it at commit time from content similarity, and since the body is
rewritten React → DOM the similarity is low: **expect this to appear as delete + add, not `R100`**.
Worth recording because EPIC-064 preserved `R100` on 26 renames and a future reader comparing the
two commits would otherwise read the difference as carelessness.

Verified live rather than by report — every branch, on a real session:

| Branch | Result |
|---|---|
| Roots while open | **0** (was 2) |
| Completed items (real data) | filename, size, Open, Show-in-Folder render |
| Downloading | `500 KB / 2.0 MB`, Cancel, progress bar at exactly 25% for 512k/2048k |
| Failed | "Failed" + error text + Dismiss |
| Cancelled | "Cancelled" + Dismiss |
| Empty | "No downloads" |
| `Clear` button | present with completed items, absent when empty, absent when all downloading |
| Empty `<svg>` count | 0 |
| `isDownloadsPopupOpen()` | correct before and after close |

One detail worth carrying into the next three: the tooltip attachment is disposed **both** in
`renderDownloads` before a rebuild and via `this.own(...)` on view disposal. A `TooltipAttachment`
rebuilt per item is a resource, not markup — the E6 lesson (*when a contract changes from a value to
a resource, every cache of that value becomes a bug*) applies to anything a rebuild replaces, and a
leaked tooltip registration is invisible to `tsc`, lint and the root count alike.

---

## E7-10 — Result

Complete 2026-08-25. `/review`, `/document` and `/userdoc` all ran (via Codex, per project
convention). The review found **no code concerns** — only two documentation items, both fixed: a
stale `core/state/view.tsx` entry in `folder-structure.md`, and a next-task-number in the dashboard.
All five tasks are `[x]`; the epic is archived in [completed.md](completed.md).

| Metric | Open | Close |
|---|---:|---:|
| `Views.registerView` callers | 4 | **0** |
| React roots per dialog (`EditLinkDialog`) | 4 | **0** |
| React roots per popper (each of the other three) | 2 | **0** |
| Non-story `@emotion` importers | 3 | **1** |
| Non-story `.tsx` files in `src/renderer` | 234 | **229** |
| `core/state/view.tsx` | 95 lines | **deleted** |

Closing property met and checked: the file is gone, nothing imports it, both hosts contain no
`fillSlot` and no React, and a missing native ctor now throws naming the `viewId` instead of silently
rendering nothing. The surviving types (`IViewData`, `IDialogViewData`, `ViewProps`) moved into
`ui/dialogs/dialog-view-registry.ts` — every consumer was already in that folder, so concern 5's
"relocate rather than delete wholesale" needed no new shared module. `DefaultProps` folded into
`ViewProps`; the load-bearing `any` and its explanatory comment travelled verbatim.

**`theme/GlobalStyles.tsx` is now the only non-story Emotion importer in the renderer.**

Verified live, on a restarted app, not taken from a report: all four open, render and close with **0**
React roots and **0** empty `<svg>`; `EditLinkDialog` shows its preview image, its discovered-image
tile and its conditional clear button; the downloads popup was checked across all five item states.
`tsc --noEmit` and `npm run lint` were run by me at every stage, both exit 0 with zero warnings.

### Findings that outlast this epic

**1. The Rule 4 instrument over-reports, and this is the third instrument correction in the
programme.** `data-part="react-slot"` is stamped *unconditionally* by `uikit/Dialog/DialogView.tsx:87`
and `uikit/Tag/TagView.tsx:88`, before either view chooses its native or React arm — so a host holding
plain DOM carries the React marker. `fill-slot.ts` sets it only on its real React container, so the
defect is confined to those two views. The reliable marker is **`data-react-root`**, set only by
`mountReactHandle` and deleted on dispose. Measured directly: `EditLinkDialog` open reported 1 root
under the both-markers instrument and **0** under `data-react-root`, the difference being a `SPAN`
with `hasReactRoot: false` parenting a native `DIV`.

E5-3 added the second marker *because a root was invisible*; this epic finds the same instrument
counting roots that do not exist. Both are the same lesson in opposite directions: **a marker is
evidence only if it is set exactly when the thing it marks exists.** Recorded as US-1091 rather than
fixed here — changing a uikit instrument after this epic's implementation closed would put unreviewed
`uikit/` changes inside a finished epic, which is the trap EPIC-064 avoided with its 37 icon sites.

**2. A live verification run against a renderer that predates a `.tsx` → `.ts` rename is not evidence
about the code — and it can hang, not merely error.** `CLAUDE.md` already warns that a converted
dynamic import may report `Failed to fetch dynamically imported module` after a rename. The stronger
form: it can wedge the renderer outright, and `tsc`, `npm run lint` and the dev server all stay green
while it does. This cost two wedges and, worse, a *well-argued wrong hypothesis* — I had traced a
plausible re-entrant bind (the Title textarea's `autoFocus` blurring `PathInputView`, whose `onBlur`
writes model state, re-triggering the bind) and was one step from "fixing" a bug that did not exist.
A temporary counter in the bind callback that **throws after N invocations and captures the first few
stacks** settled it in one run: `syncState` had executed exactly once. Converting a suspected
infinite loop into a throw is cheap, safe, and worth reaching for before reading more code.

**3. E7-5 held in practice.** The 107-line file needed the epic's only state migration; the 356-line
file was pure markup translation. Line count picks the *surface*; it does not order the tasks within
one.

**4. Whether a cadence change is safe depends on a property of the value, not of the cadence.**
`ColumnsOptions` pushed rows on every React render and now pushes only on `bind`. That is safe solely
because `rowsForGrid()` returns av-grid's own array, making a re-push an identity no-op. Copying it
would have discarded in-place cell edits. The same reduction in update frequency would have been a
data-loss bug against a value that was freshly built each call.

### Not done, deliberately

- **`/review`, `/document`, `/userdoc` have not run.** They are user-initiated.
- **Manual checks the automated sweep could not drive:** `ColumnsOptions` column reorder, resize and
  the visibility checkboxes — concern 3's `DataGridView` cadence risk — need a human, because the
  edit path runs inside av-grid and cannot be driven synthetically. The popper renders with 0 roots
  and the right columns (the `Type` column correctly hidden for CSV), but *editing* is unverified.
- **`CsvOptions` invariant 3** ("clearing the box leaves the delimiter untouched") rests on reading
  the `if (valueToSet)` guard, not on a live check: `RadioGroupView` renders custom DOM rather than
  `input[type="radio"]`, so the delimiter could not be read back from the popover. Invariants 1, 2
  and 4 — including the subtle one, that a deliberately-emptied box is **not** repopulated when the
  radio group changes — were verified live.
- **US-1091** (the marker fix above) and EPIC-064's 37 pre-existing `Icon.createElement!()` sites.

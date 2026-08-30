# EPIC-078 — Post-De-React close-out: make the codebase stop claiming React

**Status:** **Completed 2026-08-30** — all seven tasks implemented and reviewed; `/review`,
`/document`, `/userdoc` run at close (see [completed.md](completed.md)). Cut 2026-08-30.
**Scope:** R9 from [`de-react-refactoring.md`](../de-react-refactoring.md) — the comment, shim and
dependency sweep — plus the De-React residue recorded in
[`backlog.md`](../tasks/backlog.md) under *Technical Debt* and *Architecture Improvements*.
**Predecessors:** [EPIC-075](EPIC-075.md) (Epic A, core contracts) and
[EPIC-076](EPIC-076.md) (Epic B, the props pump), both complete;
[EPIC-077](EPIC-077.md) (Epic C, proportional work), planned.
**Tracked on:** [active-work.md](../active-work.md)

This closes the post-De-React programme. R9 was always meant to be standalone, and it is being cut
as an epic anyway for one reason: on its own it is a sweep nobody schedules, and the four De-React
residuals sitting in the backlog have the same shape and would rot beside it. Together they are a
small, coherent epic that ends the programme rather than leaving a tail.

**Do not treat this as a comment-editing task.** Five of R9's items are decisions or live defects
with a comment attached, and the sweep itself has a trap in it (§D-2 correction 6).

---

## D-1 — The closing property

> **Nothing in the shipped code — its comments, its DOM contract, its dependency list, or the
> instruments that read them — claims a React mechanism that no longer exists.**

Falsifiable statements:

1. **No comment describes a contract in terms of React.** *Absent:* "call from `useEffect`",
   "wait for React to re-render", "React passed no style", "the React version", references to a
   `.tsx` that was deleted. *Present:* a statement of what the code actually waits for, does, or
   differs from — or nothing, where the comment was only archaeology.
2. **No shipped DOM attribute or CSS selector carries a React name it does not earn.**
   *Absent:* `data-part="react-slot"` on a permanently native host. *Present:* a name describing
   the slot. `data-react-root` on the real Excalidraw island stays — it is the one marker that
   still means what it says.
3. **No dependency, lint rule, or shim exists for React outside the sanctioned island.**
   *Absent:* `clsx` (zero uses), a shim whose deleting task already shipped, a helper documented as
   serving files that do not exist. *Present:* `react`/`react-dom` declared with their
   Excalidraw-only role stated at the declaration.
4. **Every surviving React reference is load-bearing and says why.** The test is not "does the word
   appear" but "would a reader act wrongly on it".

---

## D-2 — Measured baseline (2026-08-30, branch `upcoming-v4.0.23`)

R9's citations are the oldest untouched text on the plan page — written 2026-08-29 but describing a
tree that Epics A and B then edited. Every item below was checked.

| Quantity | Plan says | Measured |
|---|---|---|
| React mentions in renderer `.ts` (excl. `editors/draw/`) | ~80–100 | **~194** (`React` 175 + `react` 19) |
| …plus decoys the naive sweep would also match | not mentioned | **79** (`reactive`, `reactivity`, `reaction*`) |
| `data-part="react-slot"` sites | 1 (`DialogView.ts:73`) | **7** — 2 writers, 4 CSS selectors, 1 doc reference |
| `clsx` uses in `src/` | 0 | **0** — confirmed; still declared at `package.json:59` |
| `.tsx` files outside `editors/draw/` | — | **0** — `ExcalidrawIsland.tsx` is the only one in the repo |
| `getDefaultEditorModelState` callers ("preserved standalone shim files") | implied plural | **1**, and it is not a shim |

### Corrections to the plan

**1. `BrowserWebviewModel` is clean — the citation is dead.** R9's first code-review item cites
`browser/BrowserWebviewModel.ts:147,166,171` for doc comments defining a *"call from useEffect
(cleanup)"* contract. There is **no occurrence of `React` or `useEffect` anywhere in that file.** It
was fixed at some point between the sweep and now. Drop the item.

**2. The automation item is archaeology, not a code-review item — the plan misreads it.** R9 flags
`automation/commands.ts:81,184-185` + `AppTargetModel.ts:6-7` as "a timing workaround justified by
'waiting for a React effect'; the wait may now be unnecessary **or insufficient**. Verify behavior
before touching." That is not what the code says. The comment at `:81` describes the `"app"` sentinel
as driving "Persephone's own React UI" — a stale *description of the app*, one wrong word, no timing
claim. The waits at `:184-190` are CDP navigation waits justified by `navigate()` updating the
webview asynchronously, which is still true and has nothing to do with React. **Downgrade to the
mechanical sweep.** Its "verify behavior before touching" warning was the right instinct pointed at
the wrong file.

**3. US-1023 already ran, and the shim it was supposed to delete is still here.** R9 says of
`ui/dialogs/poppers/grid-context-menu.ts`: "self-declared shim ('until US-1023 deletes it'); check
US-1023 status and delete." US-1023 is **completed** — `[x]` in `completed.md`, and EPIC-057 records
`uikit/AVGrid/` as deleted. The file still exists and still carries its comment at `:6` claiming it
is exempt "until US-1023 deletes it with the rest of the React grid". So either US-1023 missed it or
the exemption was never real. **This is the one R9 item that is a live finding rather than a tidy-up**,
and it must be investigated, not deleted on sight — an exemption that survived its own deletion task
may be load-bearing for a reason nobody wrote down.

**4. `editors/base/index.ts:14`'s "preserved standalone shim files" do not exist.**
`getDefaultEditorModelState` has exactly **one** caller — `BrowserEditorModel.ts:255` — an ordinary
editor model, not a shim. The plan says "confirm those shims still exist"; they do not. The helper is
fine, its documentation is false.

**5. `react-slot` is a seven-site coordinated rename, and the backlog already scoped it better than
the plan page did.** R9 cites only `DialogView.ts:73`. Actual: two writers (`DialogView.ts:71`,
`TagView.ts:159`) and **four CSS selectors** — `uikit/ListBox/ListItem.css:111,113`,
`uikit/Panel/Panel.css:68`, `uikit/Tree/TreeItem.css:133` — plus a deliberate reference in
`editors/draw/react-island.ts:20` explaining why the *real* island needs its own marker. Rename the
six; leave `react-island.ts` and `data-react-root` alone. The backlog entry (*Technical Debt → Two
residuals*) already lists the stylesheets and proposes `children-slot`; use it, not the plan page.
Its line numbers have drifted by a few (`DialogView.ts:73`→`:71`, `TagView.ts:124`→`:159`).

**6. The sweep's own grep is the hazard — and this is the correction that matters most.** The plan
estimates "~80–100 React mentions in comments/identifiers". The real figure in renderer `.ts`
outside the draw island is **~194**. But the same case-insensitive search also matches **79**
occurrences of `reactive`, `reactivity`, `reaction`, `reacts` — and those are the project's **own
correct vocabulary** for its state primitives, which `state-management.md` uses throughout. A sweep
run as `grep -i react` and applied without reading each hit will edit 79 correct usages into
nonsense, and the result compiles, lints, and builds clean. **The task doc must specify the pattern
and the exclusion**, and the reviewer must check the decoys were untouched rather than checking the
targets were hit.

**7. `eslint-plugin-react-hooks` is already scoped — that bullet is done.** R9 asks to "confirm
`eslint-plugin-react-hooks` is scoped to `editors/draw/**` in the ESLint config". It is:
`eslint.config.*` line 580 scopes the rules to `src/renderer/editors/draw/**`, and lines 567/570 add
a `no-restricted-imports` rule with the message "EPIC-074 F-h: React is confined to
`editors/draw/**`…". EPIC-074 did this. What remains of that bullet is only the documentation half —
state react/react-dom's Excalidraw-only role where the deps are declared.

**8. `BrowserView.tsx` no longer exists.** The backlog's duplicate-webview row says a detector "logs
`[browser] duplicate webview mount…`" in `BrowserView.tsx`. The file is `BrowserView.ts`. Not this
epic's work, but fix the citation while passing — a stale path in a *repro instruction* is worse than
one in a comment, because it is read exactly when someone is already confused.

**9. What verified unchanged.** `fill-slot.ts`'s `ActiveNodeSlot`/`generation` machinery is intact,
including the "without creating a React root" comment at `:40`; `vanilla-view.ts` still carries four
references to a hypothetical "adapter" (`:7,20,105,131` — the plan's line numbers have drifted);
`core/utils/performance-janitor.ts` exists and is still gated on a measure-count threshold;
`clsx` is still declared with zero uses.

**10. One item belongs to EPIC-077, not here.** R9 lists
`components/tree-provider/TreeProviderViewModel.ts:198-199,720` (the `queueMicrotask`/`setTimeout(0)`
justified by React render-phase rules) and marks it "goes with R8". EPIC-077 US-1221 owns it.
**Do not touch it in this epic** — two epics editing the same deferral is how a justification comment
gets replaced twice with different reasoning.

---

## D-3 — Task breakdown

**US-1222 — The four decisions.**
R9's genuinely-open items, none of which is an edit until someone decides:
- **`vanilla-view.ts`'s adapter fiction.** Four comments describe a future adapter that owns root
  detachment. No adapter exists. Per the plan: either commit to `dispose()` detaching its own root
  and simplify `releaseChild`, or write down a real reason to keep the split. Pick one; the current
  state is a design deferred to a component that was never built.
- **`fill-slot.ts`'s `ActiveNodeSlot`/`generation` machinery**, which defends against a React arm
  that no longer exists. Establish what it still protects before removing it — `fillSlot` is called
  from everywhere.
- **`performance-janitor.ts`** — verify the draw island still emits the dev-build `performance.measure`
  spam it suppresses. If it does, keep it and say so; if not, delete it.
- **`grid-context-menu.ts`** — correction 3. Investigate why it outlived US-1023 before deleting it.

**US-1223 — Rename `data-part="react-slot"`.**
Two TS writers, four CSS selectors, one deliberate exclusion (`react-island.ts`). Correction 5.
Check `browser_snapshot` output and any `app.ui.highlightElement` selectors before renaming — this is
a shipped, queryable DOM contract, not an internal name.

**US-1224 — Dependency and documentation cleanup.**
Remove `clsx`. Document react/react-dom's Excalidraw-only role at the declaration. Fix
`editors/base/index.ts:14`'s false shim comment (correction 4). The ESLint half is already done
(correction 7).

**US-1225 — The archaeology sweep.**
~194 real mentions across `page-manager`, the nine "the React version" comparisons in `git-tree`,
`PageTabView.ts`, `PinnedRailView.ts`, `MainPageView.ts`, `ButtonView.ts`, the
`MultiSelectView`/`MultiListBoxView`/`SelectView` "React passed no style" triplet, board caches,
`CategoryViewModel.ts:644` (points at a deleted `.tsx`), and the automation strings downgraded in
correction 2. **Correction 6 governs this task**: state the pattern, state the 79-hit exclusion, and
verify the decoys survived.

**US-1226 — `ToolbarView`'s append-then-wipe trap.**
`ToolbarView.onUpdate` calls `fillSlot(this.root, props.children)`, and `fillSlot` opens with an
unconditional `replaceChildren()` — so anything a caller appended into the toolbar root is destroyed
by the first prop change. Both callers did it: `Toolbar.story.ts` (fixed as US-1187) and
`StorybookEditorView.ts:81`, which escapes only because it never calls `update()`. Two of two callers
making the same mistake is an under-documented contract. Prefer absorbing or refusing the manual
append over documenting the hazard — a trap removed beats a trap explained.

**US-1227 — Panel roots: restore a stable inspection contract.**
Eight `<Panel>` call sites pass a custom `data-type` through residual props, so their roots are not
addressable as `[data-type="panel"]`; six also omit `name`. Preserved by US-1003's private
`panel-root` class. Audit `browser_snapshot`, `app.ui.highlightElement`, and DOM selectors before
choosing between a separate component marker and repairing the callers. See
[ui-element-contract.md](../architecture/ui-element-contract.md).

**US-1228 — Answer the `ListBoxView` `rowViews` question.**
Not a defect — an unanswered question, and the cheapest task in the epic. `releaseCell` (`:405-414`)
removes a view on a kind change and never on eviction, deliberately, because re-adding listeners on
recycle would stack an unbounded set per pooled cell. Open question: does a wrapper leaving the pool
take its view out of `rowViews`, or does the set grow with scroll distance until teardown?
**Answer it by scrolling a long list and reading `rowViews.size`.** If it tracks the pool, the code is
correct and earns a comment saying so. Either outcome closes the item.

---

## D-4 — Risks

**A comment sweep looks like the safest work in the programme and is not.** Three of R9's ten items
turned out to be a live finding (correction 3), a dead citation (1), and a misread (2). The
failure mode here is not breaking the build — it is *deleting a comment that was the only record of
a real constraint*. Rule for every removal: if a comment justifies behaviour, the behaviour must be
re-justified in the new comment or shown not to need one. Deleting both the reason and the doubt
leaves the next reader worse off than the stale comment did.

**Correction 6 is a silent-corruption risk, not a nuisance.** 79 correct uses of the project's own
"reactive" vocabulary sit inside the sweep's blast radius, and mangling them produces no build error.
This is the same shape as EPIC-077's `{ all: true }` hazard: a mechanical conversion that typechecks,
lints, builds, and is wrong.

**`react-slot` is a shipped contract.** Four CSS selectors and any automation or `highlightElement`
call that targets it. Renaming is right; renaming without auditing the readers is a visual regression
in three components that no build step catches.

**Two of these tasks legitimately end in "no change".** US-1222's `performance-janitor` and
US-1228's `rowViews` may both verify as correct-as-written. **That is a successful outcome and the
task doc must say so up front**, or the implementing agent will feel obliged to change something.

---

## D-5 — Acceptance

1. `grep -rn "React" --include=*.ts src/renderer | grep -v editors/draw/` returns only references
   that are load-bearing, each explaining what it means. The count is not the criterion; the
   remainder having a reason is.
2. The 79 `reactive`/`reactivity`/`reaction*` occurrences are **untouched** — verified explicitly,
   not assumed.
3. `data-part="react-slot"` returns zero across `.ts` and `.css`, except `editors/draw/react-island.ts`.
   `data-react-root` is unchanged.
4. `clsx` is gone from `package.json`; `react`/`react-dom` remain with their Excalidraw-only role
   documented at the declaration.
5. Each of US-1222's four decisions is recorded in this doc's Notes with its outcome — including
   "verified correct, left alone".
6. `ToolbarView` cannot lose a caller's manual append, or `ToolbarProps.children` documents why it can.
7. `de-react-refactoring.md` is marked closed: all ten proposals delivered or deliberately dropped.

**Verification is by use where the change is visible.** Statements 3, 6 and 7 of this epic are
DOM-and-docs and can be read; US-1223's rename and US-1227's Panel contract change what
`browser_snapshot` returns and must be exercised through it. Record what was not exercised.

---

## D-6 — What this leaves

On close, the post-De-React programme (R1–R10) is finished. What remains in the backlog from this
era is not React residue: the `getExpandedMap()` hint-only blind spot, the third silent
content-host module-failure path, and the script-`app`-surface smoke test are ordinary defects and
gaps that predate or postdate the migration. They belong on the dashboard as standalone work or in a
future correctness epic — **not** appended to this one, whose closing property they do not serve.

---

## Notes

### All seven tasks — implemented 2026-08-30

Delegated to Codex in four investigation threads and four implementation threads; plan review and
final verification done directly. `npm run typecheck`, `npm run lint`, `npm run build-prod` pass.
114 changed files. **Not reviewed yet** — tasks are marked `[ ] **implemented**` pending the
batched `/review` + `/document` + `/userdoc` pass at epic close.

**Measured against D-5:**

| Criterion | Result |
|---|---|
| React mentions in renderer `.ts` outside `editors/draw/` | 194 → **21**, each load-bearing (see below) |
| The 79 decoys untouched | **Verified**: 72 lowercase + 7 capital before *and* after; and **zero changed lines in the whole diff contain a decoy token** |
| `data-part="react-slot"` in authored source | **0** |
| `data-react-root` unchanged | **Yes** — `react-island.ts:22,38` |
| `clsx` removed | **Yes**, `package.json` + lockfile |

The 21 survivors are: 7 capital-`Reactive` decoys, Monaco's `JsxEmit.React` enum value, 4
ordinary-English "React to…" verbs, 3 in `performance-janitor.ts` (verified live and documented),
2 repointed EPIC-067 citations, 2 in `vanilla-view.ts` contrasting explicit lifecycle calls with
effects, and 2 in `TreeProviderViewModel.ts` **deliberately left for EPIC-077 US-1221**.

### The four decisions (US-1222) — all resolved as "no source change"

Verified, then documented in place. `vanilla-view.ts`'s ownership split **kept**, wording moved off
the hypothetical adapter onto the real owners (`SubtreeSwap.disposeBranch`); `fill-slot.ts`'s
`generation` guard **retained** — it still protects recycled native cells re-filling the same host
via `ListBoxView`'s `kind === "custom"` path; `performance-janitor.ts` **kept** —
`react-dom-client.development.js` still calls `performance.measure`.

**`grid-context-menu.ts` was never a shim, and R9's recommendation would have caused a regression.**
R9 read its header as self-declaring an exemption "until US-1023 deletes it" and advised deleting it
once US-1023 was confirmed complete. It is a live adapter with four callers
(`FileGridView`, `GitTreeView`, `GridBodyView`, `DataGrid.story`) that swaps av-grid's **SVG source
string** icons for icon elements; `fillSlot` writes a string as `textContent`, so deleting it would
render raw `<svg …>` markup as visible text in every grid context menu. The header was a **garbled
sentence** whose exemption referred to the old React grid's UIKit-side handoff — a different file
US-1023 did delete. Prose repaired; adapter kept.

### US-1226 — the epic's stated preference was wrong, and Codex was right to say so

C-3 preferred "a trap removed beats a trap explained" and named option (b). Codex established that
(b) is not containment here: refusing appends needs DOM-API interception because the root is a
public `HTMLElement` observed only after mutation, and absorbing into a wrapper collides with
`collectStops()` treating each direct root child as a toolbar stop plus `Toolbar.css` layout
depending on direct children. Pushback accepted. A middle option landed instead — a **dev-only
child-identity snapshot** compared before each `fillSlot`, which cannot false-positive because the
check runs before `fillSlot` writes.

### US-1227 — the backlog's premise was obsolete; the conclusion survived for a better reason

The backlog said eight call sites "pass a custom `data-type` through residual props".
`PanelElementAttributes` has **no** `data-type` field and `applyPanelAttributes` writes
`dataset.type = "panel"` unconditionally — there is no props channel. The override is a
**post-construction `dataset.type =` assignment** by the caller. The additive `data-component="panel"`
marker is therefore not merely the lighter option but the only safe one: the custom values are
load-bearing CSS selectors (`TreeProviderView.css` selects `tree-provider-search`/`-error`/`-empty`),
so repairing callers would break styling.

### Defects that a green build did not catch

Three, all found by verification rather than by the toolchain:

1. **US-1227 was half-applied.** `messagePanel` got the marker; `searchPanel` did not. The task's own
   acceptance criterion was failing while all three commands passed.
2. **A leaf component became the global owner of a platform type.** Option (c)'s dev guard needed
   `import.meta.env.DEV`; with `vite/client` absent from tsconfig, a `declare global { interface
   ImportMeta … }` was hand-rolled inside `ToolbarView.ts` — the only such declaration in the repo.
   Now `src/renderer/types/vite-env.d.ts`.
3. **Two seam defects from this epic's own task partitioning.** `grid-context-menu.ts:59` claimed
   host-contributed "icons are already React elements" (false — they arrive as icon elements, not
   SVG source strings) and `vanilla-view.ts:233` carried a `React view:` migration example. Both
   survived because those files were excluded from US-1225 as "owned by US-1222", while US-1222's
   scope was only the four decisions. **Partitioning a sweep by file rather than by line leaves
   seams** wherever a file is owned by a narrow task.

A fourth was mine: excluding `react-island.ts` wholesale preserved a comment asserting `fillSlot`'s
span carries `data-part="react-slot"`, which US-1223 had just made false — while
`model-view-pattern.md` was correctly updated to contradict it.

### Verified by use, and what was not

`execute_script` against the running app confirmed the rename is live and every panel carries the
new marker (44 `[data-type="panel"]`, 44 `[data-component="panel"]`, 44 `.panel-root`, 0 missing).

**Not verified, and recorded as such:** the probe returned `withOverriddenType: 0` — no panel with an
overridden `data-type` rendered in that session, so the marker's *actual purpose* is unexercised.
Also unexercised: US-1226's dev warning firing on a real manual append, and the `searchPanel` marker
(no tree-provider search was open). A 44/44 match is not evidence for the overridden case.

One false alarm worth recording so it is not re-run as a finding: two
`[data-type="tree-provider-view"]` elements lacked the marker, which looked like a third missed
class. They are plain view roots that were never panels — the same wrong inference (a custom
`data-type` implies a Panel) that the backlog's "residual props" framing encodes.

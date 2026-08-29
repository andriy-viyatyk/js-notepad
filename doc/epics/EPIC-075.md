# EPIC-075 — Post-De-React Epic A: core contracts

**Status:** Planned
**Created:** 2026-08-29
**Plan:** [de-react-refactoring.md](../de-react-refactoring.md) → **R1**, **R3**, **R10.1–R10.3**
**Predecessor programme:** De-React (EPIC-069 … [EPIC-074](EPIC-074.md), all complete)

The De-React programme removed React. It did not remove the *shape* of React, and the shape lives
in the layer everything else sits on: `core/state/model.ts` still carries a working hooks runtime,
and `VanillaView` — which owns disposal properly — has no counterpart for models or for the ~108
subscriptions that are hand-managed beside it.

This epic fixes the **contracts**, not the call sites. It is deliberately first because every other
proposal in the plan gets cheaper once the base classes say what they mean: R6 cannot retire the
memo chains while `memo()` is a documented model feature; R2 cannot narrow `update(props)` while
views drive models through `setPropsInternal`; R8's timer audit needs a place to put a named
deferral. Nothing here changes what the app does.

---

## A-1 — The closing property

**A model is a constructor, `setProps`, and `dispose`. Nothing a view calls on a model starts with
an underscore, and nothing a view subscribes to outlives the view.**

Four statements, each paired with a **presence** check. This pairing is the C9a discipline
inherited from [EPIC-072](completed.md) and it applies with full force here: every statement below
is phrased as a removal, and every one of them is satisfiable by deleting the feature instead of
converting it.

| # | Removal — "it no longer does X" | Presence — "it still does Y" |
|---|---|---|
| 1 | `grep "this\.effect[<(]"` over `src/renderer` returns **zero** hits, and `TComponentModel` no longer declares `effect`, `_evaluateEffects`, `hasRegisteredEffects`, `mapProps`, or `onUnmount`. `createComponentModelDriver` has no throw branch. | Every settings section still works: MCP enable/disable still starts and stops the status subscriptions; the Browser Profiles list still refreshes; Default Browser still reports its status on open; Git integration and Video Player still mirror their settings. |
| 2 | No view outside `core/state/` calls `setPropsInternal`, `_initInternal`, or `onUnmountInternal`. `isFirstUse` and `oldProps` are gone from `TComponentModel`. | Tree-provider still restores its expansion on provider change, still reveals `selectedHref`, and `MenuModel` still detects a reopened menu. |
| 3 | Every `.subscribe()` in `src/renderer` is either registered with `own()`/`ownSubscription()` or has an explicitly commented reason not to be. Zero `private *Unsubscribe` / `private *Subscription` teardown fields remain in views. | The behaviours those subscriptions drive are unchanged — in particular the five secondary views from US-1152 still re-bind correctly when their model is replaced. |
| 4 | Exactly **one** listener-teardown shape exists in the renderer: a `() => void` disposer. `SubscriptionObject` (`{ unsubscribe }`) is gone. | `globalKeyDown`, `browserUrlChanged`, `windowClosing`, `secondaryViewsToggled`, `panelExpanded`, every `EventChannel`, and every `ComponentQueue` still deliver — including `EventChannel`'s LIFO short-circuit and `ComponentQueue`'s queue-then-drain and request/reply. |

**What must not be claimed.** This epic does not touch the props pump (R2), does not narrow
`update(props)`, and does **not** delete `memo()` — see A-3. After it, uikit models still carry
20 memo call sites and views still re-push props objects. Statement 1 is a statement about the
*effect* runtime only.

---

## A-2 — Measured baseline (2026-08-29, branch `upcoming-v4.0.23`)

Re-measured against the tree, not inherited from the plan. Two figures moved since the plan was
written; both are recorded here rather than silently corrected.

| Figure | Plan said | Measured now |
|---|---|---|
| `this.effect()` registrations | 8 | **8** — `BrowserProfilesSectionModel.ts:32`, `DefaultBrowserSectionModel.ts:14`, `McpSectionModel.ts:28,32,36,37`, `SettingsSections.ts:127,341` |
| Views calling model internals | 5 files | **5** — `BrowserProfilesSection.ts:365,366,451,456`, `DefaultBrowserSection.ts:71-73`, `McpSection.ts:112,113,191,197`, `SettingsSections.ts:170,171,183,187` (Git) and `:360,361,375,379` (Video Player) |
| `createComponentModelDriver` consumers | — | **28 files** — all of them driver-clean today; they are what statement 1 must not break |
| `this.memo<…>()` call sites | 20 | **20**, in 8 uikit model files (`Autocomplete`, `ListBox`, `Menu`, `MultiListBox`, `MultiSelect`, `Popover`, `Select`, `Tree`) |
| `.subscribe()` in `editors/` | 114 | **116** |
| …of which `own(…subscribe…)` inline | 5 | **6** in `editors/`, **9** renderer-wide |
| Hand-rolled unsubscribe/subscription fields | ~101 | **108** across `editors`, `components`, `ui`, `uikit` |
| `isFirstUse` / `oldProps` readers | tree-provider + MenuModel | **3 files** — `CategoryViewModel.ts:157-171`, `TreeProviderViewModel.ts:157-192`, `MenuModel.ts:88` |

**Correction to the plan (R3.1).** The plan asks `ownSubscription` to accept *three* teardown
shapes. There are **two**: `TOneState.subscribe` and `ComponentQueue.subscribe` return
`() => void`; `Subscription.subscribe` and `EventChannel.subscribe` return `{ unsubscribe }`.
`{ dispose }` is the shape of `ComponentQueue` *itself*, not of a subscription. US-1196 reduces
this to one shape, so US-1197's helper is written against one — see A-4 for why that ordering
matters.

---

## A-3 — What this epic deliberately leaves behind

`memo()` and `IMemo` **survive this epic.** The plan (R1 step 2) offers the choice of deleting them
with the rest of the hooks surface or splitting; splitting is correct here. All 20 call sites are
uikit models whose conversion is a *design* change (derive-on-write, R10.4) tangled with the props
pump — a model memoizes because a parent re-pushes props, so converting a memo before R2 lands
means writing the invalidation twice. Epic A therefore deletes the *effect* runtime, which has no
such entanglement, and leaves `memo` as a single documented, non-React-shaped utility with a
comment naming EPIC B as its removal point.

Consequence for statement 1: `TComponentModel` still exists after this epic. It ends up as
`props` + `setProps` + `init` + `dispose` + `memo`, which is a coherent vanilla component-model
contract rather than a hooks emulation.

---

## A-4 — Task breakdown

Ordered so that each task's output is the next task's input. US-1195 and US-1196 are independent of
US-1192–1194 and can run in parallel with them; US-1197 is the one hard barrier — it must land after
both, or the conversion gets rewritten.

| Task | Title | Plan item | Size |
|------|-------|-----------|------|
| US-1192 | Detox the settings sections — stop driving models through their internals | R1.1 | M |
| US-1193 | Delete the hooks-emulation surface from `TComponentModel` | R1.2 | S |
| US-1194 | Retire `isFirstUse` / `oldProps` | R1.3 | S |
| US-1195 | Extract `DisposableStore`; give models disposal parity | R10.2 + R3.3 | M |
| US-1196 | One event primitive — `Emitter<T>`, one teardown shape | R10.1 | M |
| US-1197 | `ownSubscription` — route every subscription through ownership | R3.1/3.2/3.4 | L |
| US-1198 | `core/utils/scheduling.ts` — named, disposable deferrals | R10.3 | S |

### US-1192 — Detox the settings sections

The eight surviving `effect()` registrations and the five views that drive their models through
`setPropsInternal` / `_initInternal` / `onUnmountInternal` are the same five files. Convert both
halves together: effects with a deps array become explicit `settings.onChanged` subscriptions plus
a `DepsGate` where a comparison is genuinely needed; run-once effects become `init()` bodies; the
two `queueMicrotask` prop→state mirrors (`SettingsSections.ts:333,341,346`,
`McpSectionModel.ts:28,32`) become one line in the view's `onUpdate` — the microtask existed only
to dodge React's update-during-render rule and has nothing to defer to now. The views then adopt
`createComponentModelDriver` like the other 28 consumers.

`DefaultBrowserSectionModel.ts` (47 lines, no props, one run-once effect) folds into its view
instead of converting — this is the R7 collapse arriving early because the conversion would
otherwise be wasted work.

**Verify by use, not by grep:** open Settings and exercise each section. MCP is the one with real
behaviour behind the deps array — toggling `mcpEnabled` / `mnemeEnabled` must still start and stop
the corresponding status subscription exactly once.

### US-1193 — Delete the hooks-emulation surface

Mechanical once US-1192 lands: remove `effect`, `EffectRegistration`, `_evaluateEffects`,
`hasRegisteredEffects`, `mapProps`, `onUnmount`, and the `hasRegisteredEffects` throw in
`createComponentModelDriver`. Keep `memo`/`IMemo` (A-3) and annotate them. `depsChanged` stays —
`uikit/shared/deps-gate.ts` imports it deliberately so a vanilla gate is behaviour-identical to the
old `effect()` by construction. Sweep the stale doc comments that name the removed machinery
(`model.ts:189,250` "Called by useComponentModel", `SelectModel.ts:654`, `TreeModel.ts:529`).

### US-1194 — Retire `isFirstUse` / `oldProps`

Three readers. Replace with local previous-value fields on the models that need them — the value
being compared is one or two named props (`provider`, `category`, `selectedHref`, `showLinks`), not
the whole props object, so the local field is both smaller and more honest than `oldProps`. Then
delete both fields from `TComponentModel`.

Watch the ordering: `oldProps` is written by `setPropsInternal` *before* `setProps` runs, so a
local field must be assigned at the **end** of `setProps`, not the start. Getting this backwards
inverts every comparison in `TreeProviderViewModel.ts:157-192` — this is the one silent-failure
risk in the task, and the tree-provider presence checks in A-1 statement 2 exist to catch it.

### US-1195 — Extract `DisposableStore`; give models disposal parity

`VanillaView` already implements the idiom internally: a disposer list, error-isolated execution
that runs every cleanup and rethrows the first failure, and depth-first child ordering. Extract it
to `core/utils/DisposableStore.ts`, have `VanillaView` consume it (behaviour must not change — the
`ownReleasable` splice semantics and the snapshot-then-clear ordering in `dispose()` are load-bearing
and documented), and give `TModel` and `EditorModel` the same `own()` / `dispose()` mechanics.

The model side is the point: `TModel` has no disposer registry today, which is *why* models
hand-roll teardown, which is half of the 108 fields US-1197 has to convert.

While in `model.ts`: delete the `setTimeout(() => this.postCreate?.(), 0)` in the `TModel`
constructor (R8). Every model in the app pays for a timer that exactly one consumer uses
(`ui/dialogs/TorInfoDialog.ts:23`); call it explicitly there.

### US-1196 — One event primitive

Adopt a VSCode-style `Emitter<T>` / `Event<T>` in `core/state/` — a plain listener array, no
`CustomEvent` allocation per fire, `subscribe` returning a `() => void` disposer. Migrate
`Subscription` onto it (the five global events keep their names and their import sites);
`EventChannel` and `ComponentQueue` keep their distinct semantics — LIFO short-circuit,
queue-then-drain, request/reply — but return the same shape. `SubscriptionObject` is deleted, and
every `.unsubscribe()` call site becomes a call to the returned disposer.

This is a wide, shallow rename with one real hazard: `EventChannel.sendAsync`'s LIFO order is a
documented architectural contract (late subscribers intercept first — see CLAUDE.md §6, the open
handler depends on it). The `Emitter` migration must not touch dispatch order.

### US-1197 — `ownSubscription`

The barrier task. Add `protected ownSubscription(disposer)` to `VanillaView`, built on the existing
`ownReleasable` and returning a release handle exactly like `bind()` does — the rebindable cases
(model replacement, the US-1152 class) need that handle, and it is the reason this is a helper
rather than a plain `own()` call. Then convert the 108 hand-rolled fields.

Mechanical, but not blind. Three groups need judgement:

- **Rebindable subscriptions** — retain and call the release handle before re-binding. This is the
  bug class US-1152 already produced once.
- **Global listeners** — `board/BoardWebview.ts:150` and `html/HtmlBodyView.ts:136` add `window`
  `"message"` listeners with no registered removal. These are real leaks and are the reason this
  task is scoped as a fix rather than a refactor.
- **Re-attach-inside-render** — `notebook/ExpandedNoteView.ts:124,277-316` and the per-cell
  listeners in the recycled-cell grid (`notebook/NoteItemView.ts:330-372`) re-attach on an update
  path; registering each attachment with `own()` without releasing the previous one converts a
  listener leak into an unbounded disposer list. These need the release handle, not `own()`.

Models converted in US-1195 use their new `own()` for the same job.

### US-1198 — `core/utils/scheduling.ts`

A small set of named, disposable deferrals — `Delayer` (debounce returning a promise), `Throttler`,
`RunOnceScheduler`, and `afterPaint` / `focusAfterPaint` (rAF-based, cancelled on dispose) — so a
view registers a deferral with `own()` instead of leaving a bare timer.

Scoped to *introducing* the helpers plus the two conversions that are unambiguous: the five dialogs
that copy the same focus-after-mount timer (`CreateBoardDialogView.ts:185`, `InputDialogView.ts:148`,
`LibrarySetupDialogView.ts:168`, `PasswordDialogView.ts:173`,
`CreateBoardVarsStorageDialogView.ts:149`) collapse to `focusAfterPaint`, and
`FileSearchView.ts:146` — which already does it correctly by hand — becomes the reference. The
remaining ~11 `setTimeout(…, 0)` ordering hacks stay put for R8, where each gets individually
verified; converting a deferral you do not understand into a *named* deferral you do not understand
is not progress.

---

## A-5 — Risks

- **US-1192 is the only task with real behavioural surface.** Everything else is contract work
  behind unchanged call sites. Settings is also poorly covered by any automated check, so its
  presence list in A-1 statement 1 has to be walked by hand.
- **Statement 3 is undercountable.** "Every subscription is owned" measured as "zero `private
  *Unsubscribe` fields" is the wrong instrument — a subscription assigned to a differently-named
  field, or captured in a closure, passes. Pair the field count with a `.subscribe(` census, and
  record any deliberate exception in the code with a comment, per the statement's own wording.
- **US-1196 dispatch order.** LIFO in `EventChannel.sendAsync` is depended upon by the content
  pipeline; a listener-array rewrite is exactly where that silently flips.
- **The plan's figures drift.** Two of eight moved in a few days (A-2). Re-measure at the start of
  each task rather than trusting this table.

## Notes

### 2026-08-29
- Epic cut from [de-react-refactoring.md](../de-react-refactoring.md) as the first of the four
  suggested blocks. Figures re-measured against `upcoming-v4.0.23`; two corrections recorded in A-2.
- Decision: `memo()` is explicitly out of scope and moves to Epic B with the props pump (A-3).
- Decision: the `TModel` `postCreate` timer (plan R8) is pulled forward into US-1195 rather than
  waiting for Epic C — it is three lines in a file that task already rewrites.

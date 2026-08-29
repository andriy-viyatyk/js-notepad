# EPIC-075 — Post-De-React Epic A: core contracts

**Status:** Completed 2026-08-29
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

### 2026-08-29 — US-1192 implemented and verified

Plan review found three defects worth recording, because two of them are leaks the grep census
would never have caught:

- The plan put each converted `DepsGate` in the **view** and left the effect body in the model.
  Corrected: `TComponentModel.setPropsInternal` already calls `setProps?.(props)` *after* assigning
  props, which is the old effect's exact moment in the old order, so each model now owns its gates
  in its own file and every view's update path is `driver.update(currentProps())` + `sync(...)`.
  This needs a `private initialized = false` guard, because `createComponentModelDriver` pumps
  `setPropsInternal` **in its constructor**, before `init()`.
- `onUnmountInternal` runs the effect-cleanup loop *before* `dispose()`, and that loop was the only
  thing unsubscribing `eMcpStatusChanged` / `eMnemeStatusChanged`. With `_effects` empty it does
  nothing — one leaked listener per Settings open/close. Now explicit in `McpSectionModel.dispose()`.
- `GitIntegrationModel` had **no** `dispose()` at all, and its `alive` closure was cancelled by that
  same loop; `setProbe` has no `isLive` guard, so a late `git.probe()` would write to a disposed
  model. Now cancelled from a new `dispose()`.

Also corrected: the epic's own scope text above cites `queueMicrotask` at `McpSectionModel.ts:28,32`
— **wrong**, those are synchronous port mirrors inside deps-gated effects. The two real microtask
sites are `SettingsSections.ts:129` (Git) and `:343` (Video).

**Verified by use** (fresh renderer load, not an HMR patch — the window was reloaded first, which
also proves `createComponentModelDriver.mount()` does not throw for a missed effect):

| Check | Result |
|---|---|
| All 13 settings sections mount with content | pass |
| MCP status subscription delivers (`Running — N clients connected`, URL) | pass |
| Default Browser async status resolves after the model→view fold | pass (`Registered`) |
| Git probe resolves on open | pass (`Git 2.55.0 detected`) |
| Git disable → probe row clears; re-enable → re-probes | pass |
| Git **same-value** `settings.set` → no re-run | pass |
| Mneme enable gate: toggle off drops the mneme entry from the config JSON, toggle on restores it | pass |
| Tor port mirror follows `tor.socks-port` | pass (9050 → 9051 → 9050) |
| Unrelated key (`browser-profiles`) does **not** reset the Tor field | pass |
| `npm run typecheck`, `npm run lint`, `npm run build-prod` | pass |
| Renderer-wide census: `this.effect[<(]` = 0; no `*Internal` caller outside `core/state/` | pass (two stale *comments* remain, swept by US-1193) |

**Not verified — must be walked before the epic closes:**
- **Toggling `mcp.enabled`.** Disabling the MCP server severs the agent's own transport, so this was
  deliberately not exercised. It is the same code path as the Mneme toggle, which passed.
- **Default Browser register / unregister.** These mutate Windows shell registration; only the
  status read was exercised.
- **Browser Profiles mutations** (add / remove / clear profile data) and the bookmark-file rows.
- **Video Player** VLC-path picker and port-blur validation.

### 2026-08-29 — US-1193 implemented

Plan review found one thing worth recording: US-1193 and US-1195 were both editing the *same three
lines* of `onUnmountInternal` from opposite directions — 1193 removing the `onUnmount?.()` dispatch,
1195 wrapping the `dispose()` call to drain a `DisposableStore`. Resolved by fixing the order
(**US-1193 → US-1195**) and writing the interim shape into both documents:

```ts
onUnmountInternal = () => {
    this.isLive = false;
    this.dispose?.();
};
```

Deleted: `EffectRegistration`, `_effects`, `effect()`, `_evaluateEffects()`, `hasRegisteredEffects`
(and the driver's throw branch), `mapProps`, `onUnmount`. `_initInternal` reduces to "call `init()`
once". `memo`/`IMemo` retained and annotated for Epic B. `depsChanged` retained and its comment
rewritten. `model.ts` net **−100 lines**.

The three `onUnmount` implementers merged into `dispose()` with call position preserved:
`TreeProviderViewModel` (`props.onModel?.(null)` kept explicitly **last**, after the watch
teardown, with a comment saying why), `GraphDetailModel`, `ListBoxModel`. None calls `super` —
US-1195's independent store drain covers them. The `ListBoxView.ts:97` / `TreeView.ts:103`
registration-order comments were **updated**, not deleted; only the stale `onUnmount` wording
changed.

Verified: `npm run typecheck`, `npm run lint`, `npm run build-prod` pass; renderer-wide census for
`effect(`, `_evaluateEffects`, `hasRegisteredEffects`, `mapProps`, `onUnmount` returns zero; the app
renders after a full reload. **Statement 1 of A-1 is now closed.**

Not verified: the three merged `dispose()` bodies were confirmed by reading the diff (call position
and ordering), not by exercising Graph detail-panel teardown or ListBox host re-binding in the UI.

### 2026-08-29 — US-1194 implemented

The epic's own guidance for this task was **wrong**, and the correction is the finding worth
keeping. A-4 says to assign the replacement local field "at the **end** of `setProps`, not the
start". That is not equivalent to `oldProps`: `setPropsInternal` writes `oldProps` unconditionally
on every pump, but `CategoryViewModel.setProps` has an early return. Concretely — with `multiSelect`
off, `selectedHref` moving A → B takes the early return, so an end-assigned snapshot stays stuck at
A; when `multiSelect` later turns on with `selectedHref` still B, the stale field fires a selection
seed that `oldProps` would not.

All three conversions therefore use **capture → compare → immediately assign**: read the previous
fields into locals, compute every comparison, assign the new values *before* any branch or early
return, then act on the captured locals only. Equivalent to `oldProps` on every path by
construction, and it also removed the `MenuModel` branch restructuring the plan had called for
(the `return`-after-reset became an `else if`).

First-call sentinels replace `isFirstUse`: `previousProvider === undefined` in both tree models
(`provider: ITreeProvider` is non-optional — verified) and `previousOpen === undefined` in
`MenuModel` (`open: boolean`, also non-optional — verified). `oldProps` and `isFirstUse` are gone
from `TComponentModel`, along with the driver's `isFirstUse = false` write.

Renderer-wide `oldProps` / `isFirstUse` count is **0**, including the last stale comment at
`SelectModel.ts:229`, which was swept by hand. `npm run typecheck` and `npm run lint` pass.
**Statement 2 of A-1 is now closed.**

**Verified in the app:** the Explorer tree mounts and lists a folder's contents after a full
reload — the `first` branch (`initializeTree` + `subscribeWatch`) works.

**Not verified — must be walked before the epic closes.** These are the two presence checks named in
A-1 statement 2, and both need driving the Explorer/Collections **sidebar**, not the Explorer page:
- **Provider change restores expansion.** Follow the steps in
  `doc/tasks/US-1194-retire-oldprops/README.md` ("Manual verification"): expand a nested category in
  a `.link.json` collection, then open a second collection with a matching nested category while the
  Collections panel stays mounted, and confirm the category is still expanded. Do **not** substitute
  the File Explorer **Make Root** flow — it clears `ExplorerEditor.treeState` on purpose.
- **`selectedHref` is revealed.** With the Explorer sidebar open and the target below the fold, open
  a file under that root from the main editor and confirm the tree expands to and highlights it.
- **A menu detects reopening.** Open the Link Editor view-mode menu, dismiss it, reopen it, and
  confirm the current mode is still marked selected with a clean search/submenu state.

### 2026-08-29 — US-1195 implemented

`core/utils/DisposableStore.ts` now holds the idiom; `VanillaView` consumes it in a 19-line diff
that preserves every documented ordering rule. `TModel` gains `protected own()` and a public
idempotent `dispose()`; `EditorModel.dispose()` drains the store after `queue.dispose()`; the
`postCreate` timer is gone from the `TModel` constructor and called explicitly in
`TorInfoDialog.ts` after `showDialog()` registers the model.

`TComponentModel.onUnmountInternal` ended as:

```ts
onUnmountInternal = () => {
    this.isLive = false;
    try {
        this.dispose();
    } finally {
        super.dispose();
    }
};
```

The `try`/`finally` is deliberate and was a review correction: the plan had proposed error handling
that would have let a throwing `dispose()` hook stop being propagated. This shape guarantees the
drain while leaving today's propagation exactly as it was.

Two review findings worth keeping:
- The plan would have rewritten eight models whose `dispose` is a **class-field arrow** into
  prototype methods. I compiled that exact shape against this repo's `target: ESNext` — a derived
  class field overriding a base prototype method is accepted, `super.dispose()` inside the field
  arrow included — so all eight were left alone. That is eight files of avoided churn.
- The `closeAndTake()` seam is named and documented with its actual reason: **a child's disposal can
  call a release handle belonging to its parent**, so the parent's disposer list must be closed and
  cleared before any child runs.

**Correction to the task document's census.** It listed `NoteItemEditModel` among the "6 direct
`TModel` subclasses"; it is a **plain class** (`NoteItemEditModel.ts:175`), so the real count is
**5**. Codex caught this during implementation and correctly declined to add `super.dispose()` there.

`own()` ships with **zero** registrations — converting hand-rolled teardown is US-1197.

**Verified in the app** (after a full reload): three pages opened and closed cleanly (7 → 10 → 7)
and Settings still rendered all 13 sections afterwards, so `VanillaView` disposal through the store
survives repeated create/dispose cycles. `npm run typecheck`, `npm run lint`, `npm run build-prod`
pass.

**Not verified:** the Tor info dialog's new explicit `postCreate()` call — opening that dialog needs
a configured Tor profile. Worth one manual open before the epic closes.

### 2026-08-29 — US-1196 implemented

`Emitter<T>` / `Event<T>` replaces the `EventTarget` + `CustomEvent` machinery. `AppEvent` and
`SubscriptionObject` are **deleted**, along with `Subscription`'s dead `type` / `appEvent`
constructor parameters — all ten construction sites were zero-argument, verified. `.unsubscribe()`
call sites renderer-wide: **0**. **Statement 4 of A-1 is now closed.**

**Correction to A-2.** The epic recorded two teardown shapes. There were **three**: `settings.onChanged`
goes through `wrapSubscription` (`api/internal.ts`), which exposed `{ dispose }` — a real
subscription shape, not just `ComponentQueue`'s own method. The A-2 note was itself incomplete.

Three review findings, two of which were invisible-until-production:
- **`CustomEvent.detail` is `null` when nothing is sent**, while a plain listener array passes
  `undefined`. Audited every no-payload sender; only `windowClosing` qualifies and its one consumer
  ignores the payload — but `Subscription.send()` normalizes `undefined` → `null` anyway, so the
  boundary is preserved exactly rather than by argument.
- **DOM dispatch surfaces a listener throw as an *uncaught* error.** A naive `catch` +
  `console.error` would have preserved dispatch while quietly downgrading error visibility. The
  Emitter catches and re-throws asynchronously so the error still reaches the global handler and
  later listeners still run.
- Scope reaches `src/ipc/renderer/renderer-events.ts` and `src/shared/`, outside A-1 statement 4's
  "renderer" wording. Recorded as a deliberate decision: `rendererEvents` is a renderer-facing
  `{ unsubscribe }` producer, and leaving it would make statement 4 false in practice.

Each primitive keeps its own error policy — no shared catch was introduced.

**Verified in the app** (full reload, 81 files changed):
- **The `sendAsync` LIFO contract holds end to end.** `app.events.openRawLink.sendAsync(...)` on a
  file path ran the full three-layer content pipeline, created the page titled `package.json`, and
  came back with `handled === true` — the short-circuit the open handler depends on (CLAUDE.md §6).
  `EventChannel.sendAsync`'s body is byte-identical to before.
- `settings.onChanged` still delivers through its new `() => void` shape: Git disable/enable still
  clears and re-probes, and all 13 settings sections still render.
- `npm run typecheck`, `npm run lint`, `npm run build-prod` pass.

**Not verified:** `ComponentQueue` request/reply and queue-then-drain under a real editor workload,
and the five global events beyond `windowClosing`'s consumer being unreachable from a script.

### 2026-08-29 — US-1198 implemented

`core/utils/scheduling.ts` ships **three** helpers, each with a live call site: `Delayer<T>`,
`afterPaint`, `focusAfterPaint`.

**Two corrections to A-4's description of this task:**
1. **The zero-delay `setTimeout` census is 28, not ~11.** Five convert here; **23** remain for R8.
2. **The five dialog focus timers are neither identical nor leaking.** All five already cleared
   their timers on disposal, `InputDialogView` *selects* rather than focuses when `selectAll` is
   set, and `CreateBoardDialogView` picks between two inputs from a mount-time snapshot. So this
   conversion buys deduplication and a named, disposable primitive — it is **not** a leak fix, and
   should not be credited as one.

Two review findings:
- **The dead-API rule was applied inconsistently.** `Throttler` was correctly refused for having no
  caller, but `Delayer` and `RunOnceScheduler` were both being added with zero call sites, each
  justified by a future caller that was not being converted. Resolved per helper: `Delayer`'s real
  caller (`GraphLegendModel.scheduleDescription()`, a 300 ms per-key debounce) is converted here so
  the contract is exercised by something real; `RunOnceScheduler` was **dropped** — its only
  candidate, `PagesModel.checkEmptyPage()`, could change page-lifecycle ordering, which is exactly
  the deferral A-4 warns against renaming blindly. R8 can add it with its caller.
- **`requestAnimationFrame` does not fire in a hidden or occluded window; `setTimeout(0)` did.**
  Persephone is multi-window and the background-capable path was confirmed to exist, so a naive rAF
  swap would have left a dialog in a non-painting window silently unfocused. `afterPaint` therefore
  races rAF against a 100 ms timeout with a single active guard so the callback runs at most once,
  and disposal cancels both.

`Delayer` rejects on cancel and dispose; the graph-legend caller catches that rejection so a
disposed panel cannot produce an unhandled rejection.

**Verified in the app** (full reload): `app.ui.input("…", { value: "hello world", selectAll: true })`
focused the input with all 11 characters selected — the live `selectAll` predicate evaluated on the
callback, which is the branch that differs from the other four. `app.ui.password(...)` focused its
password input. Both dialogs disposed cleanly. `npm run typecheck`, `npm run lint`,
`npm run build-prod` pass.

**Not verified:** `CreateBoardDialogView`'s two-input `hasFolder` branch, `LibrarySetupDialogView`,
and `CreateBoardVarsStorageDialogView` — each needs its own opening path. The rAF-fallback path
(a dialog opened in a non-painting window) was not exercised.

### 2026-08-29 — US-1197 Delivery A implemented

The task was split at review into two separately verified deliveries: **A** = the helper plus the
entire behaviour-changing surface (11 sites), **B** = the 198-site mechanical sweep. One 218-site
diff is not verifiable in a project with no automated tests, and splitting keeps the bisect surface
at eleven sites rather than two hundred.

`VanillaView.ownSubscription(disposer)` is `return this.ownReleasable(disposer)`, documented as a
deliberate greppable alias — the *name* is the census instrument for statement 3, so it must not be
collapsed back into `ownReleasable` later.

**Correction to A-4: the two `window` "message" listeners were NOT leaks.**
A-4 says they "add `window` `message` listeners with no registered removal. These are real leaks and
are the reason this task is scoped as a fix rather than a refactor." Both claims are false against
the code:
- `html/HtmlBodyView.ts` already registered removal via `this.own(...)`.
- `board/BoardWebview.ts` held a hand-rolled `messageUnsubscribe` field cleared in `onDispose()`
  (`BoardWebview.ts:80-92`).

So Delivery A normalizes two correct-but-hand-rolled teardowns; it does not fix a leak. **This is
the second epic claim of a "leak" that did not survive contact with the code** — the five dialog
focus timers in US-1198 were the first. The pattern is worth naming: the plan's leak assertions were
inferred from shape, not verified, and every one of them should be re-checked before being repeated.

The notebook re-attach conversions are the real content of Delivery A and are correct:
`ExpandedNoteView.syncTags()` and `syncComment()` both **release the previous attachment before
building the replacement**, and `syncTags` aggregates its per-tag listeners into a single release
handle, so repeated updates do not grow the disposer list. That was the specific defect to avoid.

Codex also verified that the six US-1152 binding files **already** had correct release-before-rebind
handling — no change needed there.

**Verified in the app** (full reload, `.note.json` fixture in the session scratchpad): the notebook
opens with its tag list rendered, and expanding/collapsing the note three times keeps the tags
rendering with no visible accumulation. `npm run typecheck`, `npm run lint`, `npm run build-prod`
pass.

**Not verified:** actual listener-count instrumentation across many update cycles (the disposer list
is not observable from a script); tag add/remove and comment add, which are the paths that re-enter
`syncTags`/`syncComment` with real mutations; and the board/HTML webview `message` paths.

**Note for Delivery B:** one already-correct `this.own(...)` in `HtmlBodyView.ts:136` was renamed to
`ownSubscription`, against the review rule that correctly-owned sites are left alone. Harmless here,
but Delivery B must hold that line or its diff stops being reviewable.

### 2026-08-29 — US-1197 Delivery B implemented; all seven tasks are code-complete

Delivery B converted the remaining **198** sites and added owner/rationale comments to all **94**
deliberate exceptions. Final census: **62 already owned / 198 converted / 94 exceptions = 354
semantic registration sites**, every row resolved. 163 files changed, +1251 / −922.

**Correction to A-1 statement 3 — its removal clause is unachievable as written, and should not be
used as the completion instrument.**

Statement 3 says: *"Zero `private *Unsubscribe` / `private *Subscription` teardown fields remain in
views."* After the conversion **85** such fields remain, and that is **correct**, not a shortfall.
The rebindable class — the US-1152 pattern the epic itself mandates — *requires* retaining the
release handle in a field:

```ts
this.pageStateUnsubscribe = this.ownSubscription(page.state.subscribe(...));
```

Sampled and confirmed across `PageToolbarView`, `PageTabView`, `MarkdownBodyView`, `MonacoBodyView`,
and `BoardWebview`: the surviving fields hold `ownSubscription` handles, which is the prescribed
pattern, not hand-rolled teardown. Driving the field count to zero would mean deleting the ability
to rebind.

A-5 already warned that the field count is the wrong instrument because it *undercounts* (a
differently-named field or a closure passes). This is the same instrument failing in the other
direction: it also *overcounts*, by treating the correct pattern as a defect. **The completion
instrument for statement 3 is the 354-site census — every registration owned or commented — and the
field count should be struck from the statement.**

### Closing property — final status

| Statement | Status |
|---|---|
| 1 — effect runtime gone | **Closed** (US-1192, US-1193). Renderer-wide census zero; Settings verified by use. |
| 2 — no view calls model internals; `isFirstUse`/`oldProps` gone | **Closed** (US-1192, US-1194). Renderer-wide count zero. |
| 3 — every subscription owned or commented | **Closed by census** (US-1197 A+B): 354/354 rows resolved. Its *field-count* clause is withdrawn — see the correction above. |
| 4 — exactly one teardown shape | **Closed** (US-1196). `.unsubscribe()` call sites zero; `AppEvent` and `SubscriptionObject` deleted. |

`memo()` / `IMemo` survive as designed (A-3), annotated for Epic B. `TComponentModel` ends as
`props` + `setProps` + `init` + `dispose` + `memo`.

**Three epic claims did not survive contact with the code**, all of the same shape — a "leak" or a
figure inferred from code shape rather than observed:
1. The two `window` `"message"` listeners were **not** leaking (US-1197 A).
2. The five dialog focus timers were **not** leaking and were **not** identical (US-1198).
3. The zero-delay `setTimeout` census was **28**, not ~11 (US-1198); and A-2's teardown-shape
   correction was itself incomplete — there were **three** shapes, not two (US-1196).

**Verified in the app after Delivery B** (full reload): Settings renders all 13 sections, Monaco
mounts, 11 tabs render, and six page switches plus forced back-and-forth rebinding all render
correctly — which exercises the retained-handle rebinding path directly. `npm run typecheck`,
`npm run lint`, `npm run build-prod` pass.

### Outstanding before this epic can close

Implementation is complete. These remain, and are the reason the epic is **not** being closed here:

**Manual verification not reachable from a script or unsafe to exercise:**
- Toggling `mcp.enabled` (severs the agent's own MCP transport; same code path as the Mneme toggle,
  which passed).
- Default Browser register / unregister (mutates Windows shell registration).
- Browser Profiles add / remove / clear profile data; the VLC path picker.
- The three US-1194 presence checks, which need the Explorer/Collections **sidebar** driven by hand:
  provider-change expansion restore, `selectedHref` reveal, and menu-reopen detection. Exact steps
  are in `doc/tasks/US-1194-retire-oldprops/README.md`.
- The Tor info dialog's new explicit `postCreate()` call (needs a configured Tor profile).
- `CreateBoardDialogView`'s two-input branch, `LibrarySetupDialogView`, and
  `CreateBoardVarsStorageDialogView` focus paths; and `afterPaint`'s 100 ms fallback in a
  non-painting window.
- Notebook tag add/remove and comment add — the paths that re-enter `syncTags` / `syncComment` with
  real mutations — plus listener-count instrumentation across many update cycles.
- `ComponentQueue` request/reply and queue-then-drain under a real editor workload.

**Process:**
- `/review`, `/document`, `/userdoc` have **not** been run. Per `CLAUDE.md`'s deferred-review model
  they are due at epic close and go to Codex.
- All seven tasks are **uncommitted** in the working tree (173 changed paths).

### 2026-08-29 — Visual verification pass (Persephone visible)

Worked through the outstanding manual list against the running app.

**Now verified:**

| Check | Task | Result |
|---|---|---|
| Menu reopen detection | US-1194 | Context menu opens (10 rows) → closes fully → reopens with identical rows, no stale hover or search. The `previousOpen === undefined` sentinel and the reset branch both behave. |
| Tree expand / collapse | US-1194 | `📁 Disco` closed → open → closed via its chevron. |
| Expansion survives a tree rebuild | US-1194 | `Disco` left expanded, a second collection (`my.link.json`) opened into the Collections panel, tree rebuilt 159 → 174 rows with both collections' categories present — `Disco` **still expanded**. |
| Notebook `syncComment` re-attach | US-1197 A | "+ Add comment" click replaced the button with a live textarea — the old click listener was released and the new subtree attached. |
| Notebook `syncTags` re-attach | US-1197 A | **Decisive:** removed `alpha`, then removed `beta` from the *rebuilt* tag DOM. The second removal proves the listeners re-attached after the first `syncTags` rebuild are live, which is exactly what release-before-reattach had to preserve. |
| `LibrarySetupDialogView` focus | US-1198 | Settings → Script Library → Browse…: dialog opens, focus lands on a text input **inside the dialog**. |
| `CreateBoardVarsStorageDialogView` focus | US-1198 | Settings → Board Environment Variables → Create…: same result. |

Four of the five US-1198 dialogs are now verified (Input with its `selectAll` branch, Password,
LibrarySetup, CreateBoardVarsStorage).

**Correction — a false alarm I raised and then disproved.** Opening `CLAUDE.md` as a tab did **not**
mark it selected in the sidebar tree, which initially looked like the `selectedHref` reveal path
failing. It is not evidence of a regression: `selectedHref` is supplied by the **Explorer editor's
own** `selectionState` (`ExplorerEditorModel.ts:61`, `ArchiveSecondaryView.ts:109`,
`CategoryEditor.ts:279`) — it tracks navigation *within an Explorer/Category editor*, not any file
opened in any tab. My test targeted the wrong mechanism. The reveal path remains **unverified**,
neither confirmed nor suspected.

**Still unverified after this pass:**
- **`selectedHref` reveal** — needs navigating inside an Explorer editor page with the target below
  the fold. My DOM instruments kept missing because the tree is virtualized (only visible rows exist,
  and their `getBoundingClientRect()` is zeroed inside the transformed container).
- **Browser Profiles add / remove / clear** — synthetic `input` events did not drive the name field,
  so the Add button stayed disabled. Needs real typing. The section's rendering and its
  settings-driven refresh are already verified.
- **`CreateBoardDialogView`'s two-input `hasFolder` branch** — the one dialog of the five whose
  behaviour genuinely differs. Reachable only through the Boards secondary view.
- Toggling `mcp.enabled` (would sever the agent's own transport); Default Browser register /
  unregister (mutates Windows shell registration); the Tor info dialog's explicit `postCreate()`;
  `afterPaint`'s 100 ms fallback in a non-painting window; `ComponentQueue` request/reply under a
  real editor workload.

**Side effects of this pass, for the record:** the currently-playing track was changed to
"Whitney Houston – I Will Always Love You" while testing the content pipeline, and the scratchpad
notebook fixture (`us1197.note.json`, session scratchpad — not user data) had both its tags removed
and a comment field opened. A `browser-profiles` add was attempted and did **not** take, so that
setting is unchanged. All settings toggled during earlier passes were restored.

# EPIC-081: DOM & IO mechanisms

**Status:** Completed 2026-09-02 (created 2026-09-01)

## Overview

Packages 6 + 7 of [de-react-refactoring-2.md](../de-react-refactoring-2.md) — the last epic in that
programme. Two mechanisms, each replacing a family of hand-rolled workarounds:

- **P4** — a one-shot "wait for first real layout" primitive plus an explicit transition kick,
  adopted across the §2.2 timing-hack inventory.
- **P5** — a shared self-write echo guard, adopted at the three file-echo sites in §2.3.

Both are **independent of EPIC-080 and EPIC-082**: nothing here needs `afterDispatch`, and nothing
here touches a converted view's effect structure. That is why the roadmap left this epic
free-floating, and it is why it can be reverted task by task without disturbing the state core.

## Why now

EPIC-080 (state/lifetime/scheduling core) and EPIC-082 (React-pattern removal at the call sites)
both closed 2026-09-01. This is the only epic left in the roadmap, and EPIC-080 shipped the
`OwnerScheduler` that P4's primitive should hang off — so the mechanism has a home it did not have
when the report was written.

Measured against source at commit `d44ab072`:

| Population | Count | Evidence |
|---|---|---|
| `ResizeObserver` → 200 ms → measure → `disconnect()` one-shot probes, duplicated near-verbatim | 3 | `GitChangesView.ts:391-412`, `LinkTagsSecondaryView.ts:220-241`, `LinkHostnamesNavigationPanel.ts:227-248` |
| Layout-measurement retry loops | 3 → **2 converted** | `RestClientShared.scheduleMeasurement:268-280` (unbounded) and `AudioVisualizer.scheduleCanvasMeasurement:364-382` (×3) converted; `MarkdownBodyView.ts:520-544` (×10) turned out not to be a layout probe — see the implementation-review findings below |
| Missed-`load` re-check timer | 1 | `ImageViewport/ImageViewportView.ts:95-105` |
| 10 ms style-recalc waits before a CSS open-transition | 2 | `BookmarksDrawer.ts:49`, `MenuBarView.ts:245` |
| Polling loops that are not layout-related | 1 | `BoardTargetModel.waitForLoaded:165-173` |
| `skipNext*` arm-and-hope echo flags, same design three times | 3 | `api/settings.ts:186,238-239,288`, `browser-search-history.ts:25,45-46,67`, `TextHostEditorModel.ts:63,274,286-287` |
| P4/P5 helpers already present | **0** | `afterFirstLayout`, `kickTransition`, `createEchoGuard` all return zero hits renderer-wide |

## Goals

1. One owner-bound first-layout primitive, adopted at every site that is genuinely waiting for
   layout — and *only* those sites.
2. `kickTransition` replacing the two 10 ms transition waits.
3. One echo-guard utility with token/content matching, replacing three copies of a flag whose
   documented failure mode is swallowing a genuine external edit.
4. Every timing hack this epic does **not** fix is recorded with the reason, so the next reader does
   not have to re-derive that it was considered.

## Corrections to the report's plan

Seven, from verifying Part 4/5's claims against source rather than reading them. Four change what
the work is.

1. **`afterFirstLayout` belongs on `OwnerScheduler`, not as a free function in `uikit/shared/`.**
   P4 specifies "a free function returning a cancel handle" — which re-creates exactly the manual
   handle field EPIC-080's US-1263 spent a whole task retiring across 21 rAF sites. It ships as
   `this.schedule.firstLayout(el, fn)` (`core/utils/scheduling.ts`, `OwnerScheduler` at `:154`),
   auto-cancelled on dispose alongside `raf` / `timeout` / `delayer`. `kickTransition` **does** stay
   a free function in `uikit/shared/` — it is synchronous and owns no lifetime.

2. **`BoardTargetModel.waitForLoaded` is not a layout probe, and P4 cannot fix it.** The roadmap
   files it under "polling / spinning on layout", but it polls `BoardEditorModel.loadedTabs`, which
   is a **plain `Set<string>`** (`BoardEditorModel.ts:140`) — not reactive state. So neither
   `firstLayout` nor a `state.subscribe` applies. The fix is a one-shot waiter list resolved at the
   `loadedTabs.add(tab)` write site (`BoardEditorModel.ts:175`), preserving the never-reject timeout
   semantics its own comment documents. It gets its own task: second file, no shared mechanism.

3. **The three focus-race delays are out of scope.** `TextChromeView.ts:492`, `BoardWebview.ts:154`,
   `BrowserView.ts:464` (100–200 ms) are **not** waiting for layout — the element is already laid
   out. They are waiting for a *competing* focus to finish, which P4 does not address at all.
   Fixing them means giving the focus pipeline an ordering contract: materially larger, riskier, and
   verifiable only by hand across three editors. → backlog, not this epic.

4. **`AudioVisualizer`: the sizing retry converts, the animation loop must not — and converting it
   discharges a hazard EPIC-080 recorded.** The continuous draw loop (`:347`, `:355`) is legitimate
   raw `requestAnimationFrame`: `OwnerScheduler.raf` coalesces per owner, so it *cannot* express two
   concurrent loops. EPIC-080 left the file raw for that reason and filed the collision as a
   US-1131 lint-clause candidate ([EPIC-080.md](EPIC-080.md), lines 316-319). Moving only
   `scheduleCanvasMeasurement:364-382` onto `firstLayout` removes the second loop, so the collision
   stops being reachable in this file and the hand-rolled `sizingGeneration` counter goes with it.

5. **`ImageViewportView` needs no helper, and its path in the report is stale.** It is
   `uikit/ImageViewport/ImageViewportView.ts:95-105`, not `uikit/ImageViewportView.ts:100`. The
   50 ms timer re-checks `image.complete` in case `load` was missed — the honest fix is a
   **synchronous** `complete` check at the `src` assignment, deleting the timer rather than
   converting it.

6. **§2.4 and §2.5 are unassigned to any Part 5 package** — the same gap EPIC-082 found for §1.5 and
   §1.8. Packages 6 and 7 cover §2.2 and §2.3 only; the sole §2.5 item with an owner is
   `grid-context-menu`, via P6 in package 1. Disposition:
   - §2.5's two cheap items (`MenuView.ts:132`, `TreeModel.focusRoot:743-746`) are **absorbed as
     US-1280** — they are DOM-mechanism work, which is this epic's subject.
   - §2.4's `cell-tooltip.ts:155` module-global observer goes to the **backlog**: its own comment
     names the fix as an upstream av-grid popover open/close hook, which is not a Persephone change.
   - §2.4's `ToolbarView` roving-tabindex triple-trigger is already package 1 (US-1258).

7. **`LogBodyView` stays with US-1258.** P4's text lists the `scrollToRowAfterPaint` adoption, but
   package 1 owns it and it needs no new mechanism — `scrollToRowAfterPaint` already exists and is
   used correctly by `TreeModel.ts:871` and `ListBoxView.ts:527`. Verified still unfixed
   (`LogBodyView.ts:203-204`, the 50/150/300 shotgun). **EPIC-081's `firstLayout` does not replace
   it**; if US-1258 has still not landed when this epic closes, flag it rather than absorbing it.

## A bonus the plan did not predict

`MenuView.ts:132` reaches its own row through a `querySelector` on a `data-type` / `data-id` string
**inside a `queueMicrotask`** — a surviving §1.1-shaped deferred effect body that EPIC-082 never
saw, because that epic was scoped to graph, rest-client, and tree-provider. Exposing the node from
the `KeyedList` record the view already owns removes the DOM query and the microtask in one edit.

## Risk & abort criteria

Risk is **visual and local**, the opposite of EPIC-080's profile: every adopter here either paints
something or focuses something, so a regression shows on the first look rather than hiding behind
timing. Revert granularity is one file per adopter, one task per group.

The one real behavioural trap, and it applies to every `firstLayout` adopter:

> **The 200 ms debounce is not only noise.** `GitChangesView.ts:396-404` measures `clientHeight`
> *after* resizes settle, and seeds a 50 % default split from it. `firstLayout` fires at
> the first non-zero rect — earlier by design. If a panel animates open, "first non-zero" and
> "settled" are different numbers, and the seeded default would be wrong and then saved. Each
> adopter must be checked for whether it wants *first* or *settled*; `firstLayout` is only correct
> for the former.

**Abort criteria:** if two or more adopters turn out to want "settled" rather than "first", stop and
re-scope — the primitive is then the wrong shape and needs a settle variant before any further
adoption. Do not paper over it by putting a delay back inside the callback.

## Linked Tasks

**Strand A — P4 and the §2.2 layout sweep**

- [x] US-1275: `schedule.firstLayout` + retire the 3× duplicated `ResizeObserver` probe
- [x] US-1276: convert the remaining layout-measurement retries — `RestClientShared`,
      `MarkdownBodyView`, the `AudioVisualizer` sizing loop, `ImageViewportView`
- [x] US-1277: delete the two 10 ms transition hacks — dead `data-open` flag in `BookmarksDrawer`, inlined style flush in `MenuBarView` (revised: no `kickTransition` helper — one adopter)
- [x] US-1278: `BoardTargetModel.waitForLoaded` — one-shot waiter instead of a 50 ms poll

**Strand B — P5 echo guard**

- [x] US-1279: `createEchoGuard()` + adopt at `api/settings.ts`, `browser-search-history.ts`,
      `TextHostEditorModel.ts`

**Residue (droppable)**

- [x] US-1280: §2.5 DOM pokes — `MenuView` row node from the `KeyedList` record (also deletes a
      `queueMicrotask`); `TreeModel.focusRoot` through a view-provided callback

US-1280 is lowest priority by construction: it is correctness-of-layering, not behaviour, and
dropping it costs the epic nothing. US-1275 gates US-1276; the other tasks are independent.

## The abort gate fired — and the resolution (2026-09-02)

US-1275's investigation reported **all three** `ResizeObserver` adopters as wanting *settled*, not
*first*. That is the abort criterion above, so implementation stopped there, as it should have. I
verified the finding against source rather than taking it:

- The probe's `clearTimeout` runs on **every** resize observation
  (`LinkTagsSecondaryView.ts:222-224`), so the 200 ms timer restarts each time and fires 200 ms after
  the **last** resize. That is settled semantics **by construction** — not an incidental debounce.
- Both link panels sit inside `CollapsiblePanelStack`, whose CSS animates
  `transition: flex 0.15s ease` (`CollapsiblePanelStack.css:13`). So the observed height genuinely
  changes after the first non-zero frame, and a *first*-layout measurement would freeze a 50 % split
  computed from an animated intermediate height.

Two of three adopters demonstrably want settled, which is the gate. **The primitive was the wrong
shape, exactly as the abort criterion anticipated.**

### Resolution: two named primitives, not one

`OwnerScheduler` gains **both**, sharing one private implementation:

| Method | Fires | Adopters |
|---|---|---|
| `firstLayout(el, run)` | first non-zero content rect | US-1276's three: `RestClientShared`, `MarkdownBodyView`, `AudioVisualizer` sizing |
| `settledLayout(el, run, quietMs = 200)` | `quietMs` after the last resize observation | US-1275's three: `GitChangesView`, `LinkTagsSecondaryView`, `LinkHostnamesNavigationPanel` |

Two **named** methods rather than one method with a mode flag, deliberately: a `quietMs = 0` default
would hand "first" semantics to any caller who did not think about it, and this finding is precisely
about call sites that had not. Named methods also stay greppable for future sweeps.

`settledLayout` keeps **200 ms** as its default because the goal of US-1275 is de-duplicating three
hand-rolled copies and giving the semantics an honest name — not re-tuning behaviour. The epic's
"do not put a delay back in" rule bars smuggling a delay **inside a first-layout callback**; a
declared, named quiet period in the contract is the opposite of that.

**Not chosen, recorded as a follow-up:** detecting settle by rect stability across two consecutive
animation frames, which would delete the 200 ms constant entirely and settle in ~32 ms instead. It is
a behaviour change with a real failure mode (an eased transition can plateau to an identical
fractional rect mid-animation and fire early), and this epic is behaviour-preserving. → backlog.

### What this changes about the epic

- US-1275 delivers **both** primitives plus its three settled adopters; US-1276 still depends on it.
- No task is dropped and the epic's scope is unchanged. The gate did its job: it caught a wrong
  mechanism at plan time rather than as three wrong 50 % splits at runtime.
- Correction to this document: the Git split is **view-local** (a private `bottomHeight` field), not
  persisted across restarts — my "persisted" claim above was wrong, and is fixed in place. The timing
  hazard survives the correction, since the first measurement still freezes the default for the life
  of the view.

## Investigation revised two more corrections (2026-09-02)

Both found by Codex and verified by me against source. Both make the epic *smaller*, which is the
right direction.

### `kickTransition` is not built — there is only one adopter

`BookmarksDrawer`'s 10 ms timer sets `this.panel.dataset.open = ""`, and **nothing consumes it**:
renderer-wide the only occurrence of `data-open` is that write, with no `[data-open]` selector in any
CSS. The drawer's animation actually runs off the inline `style.transition` on `panelWrap`
(`BookmarksDrawer.ts:37`) plus the `style.transform` toggle at `:49`, neither of which touches the
flag. So that site is **dead code to delete**, not a hack to convert.

That leaves `MenuBarView` as the sole genuine adopter — confirmed real: `MenuBar.css:9`
(`.menu-bar-backdrop.doDisplay`) changes display and `:27`
(`.menu-bar-backdrop.open .menu-bar-content`) drives the transition, so a flush between them is
required.

**This revises correction 1.** A shared `uikit/shared/kickTransition` helper for a single call site is
indirection without payoff, so the `getBoundingClientRect()` flush is inlined in `MenuBarView` with a
comment explaining why the forced reflow must not be "cleaned up". US-1277 is retitled *delete the
two 10 ms transition hacks*. If a second adopter ever appears, extracting the helper then is trivial;
inventing it now for one caller is not.

**A trap that comes with the deletion:** in `BookmarksDrawer.ts:49` the guard is
`if (props.open && !this.animationTimer)`, and `animationTimer` does double duty — timer handle *and*
once-per-open guard for `this.panel.focus()`. Removing the timer without replacing that guard makes
`focus()` fire on every `sync()` while the drawer is open, stealing focus mid-typing. The task
document carries this as a must-fix.

### `BoardEditorModel` already has the waiter US-1278 was going to build

**This revises correction 2.** That correction said the fix was "a one-shot waiter list resolved at
the `loadedTabs.add(tab)` write site". The waiter already exists: `waitForFrameLoad`
(`BoardEditorModel.ts:186-197`), resolved from `markFrameLoaded` (`:174-180`) — which is exactly
where `loadedTabs.add` happens — and already drained with `false` on dispose (`:582-583`). So
`BoardTargetModel.waitForLoaded`'s 50 ms poll was duplicating a mechanism one file away.
`BoardEditorModel` is left **unchanged**; only the polling caller changes.

**The trap here:** `waitForFrameLoad` resolves on the **NEXT** load and does not resolve for an
already-loaded tab, while `waitForLoaded` currently returns immediately in that case. A naive swap
turns "already loaded" into a silent 5 s stall — no error, because the contract never rejects. The
plan keeps an explicit `loadedTabs.has()` fast path ahead of the waiter, and requires the promise to
be registered *before* the state changes that trigger the mount.

## Measured, not assumed: the echo guard's round-trip (2026-09-02)

US-1279 replaces a boolean "skip the next event" flag with **exact content matching**. That trade has
an asymmetry worth naming: today's flag always suppresses the echo (its bug is the *rare* case — a
genuine external edit swallowed), whereas a content match that never matches would fail in the
*common* case, making every settings save trigger a reload. Codex correctly reported that the
`saveDataFile` → `getDataFile` round-trip is **not provable from source**, because the read path does
heuristic encoding detection.

So it was measured instead, at runtime through `app.fs` in the running app — seven payloads written
and read back, compared for exact string equality:

| Case | Round-trips identically? |
|---|---|
| plain ASCII | yes |
| **header + JSON — the real settings shape** | **yes** (109 chars out, 109 back) |
| trailing newline / no trailing newline | yes |
| CRLF | yes |
| Unicode (Cyrillic, accents, emoji) | yes |
| **leading BOM** | **no** — stripped on read (8 written, 7 back, first difference at index 0) |

**Exact matching is therefore safe for both file sites.** The only divergence is a leading BOM, and
neither site can produce one: settings writes `${settingsFileHeader}
${lines.join("
")}` and
history writes `entries.join("
")`.

**BOM-stripping was deliberately NOT added to `createEchoGuard`.** The guard is generic and
`TextHostEditorModel` passes document content, where a leading BOM can be legitimate content that
stripping would corrupt. It stays a pure exact matcher; the BOM case is recorded as a limitation of
any future adopter that writes one, whose symptom would be the self-reload echo returning.

The probe used a throwaway data file, deleted afterwards; real settings and history were never
touched.

**A second finding from the same review:** overlapping writes ARE reachable — the settings debounce
is insufficient and browser history has no serialization at all. A single pending token would have
mishandled that (first event matches nothing, clears, and triggers a spurious reload). The design now
retains a small bounded token set.

## Two defects caught in implementation review (2026-09-02)

Both were found by reading the diff at the two places the plan flagged as risky, and both are the
same shape: a primitive applied to a site that was never actually a layout probe. Fixed directly.

### `MarkdownBodyView`'s anchor retry is NOT a layout probe — reverted to `schedule.raf`

The retry lives inside the `scrollToAnchor` result handler and re-runs when the anchor is **not
found**, up to ten times. It is not waiting for its container to gain layout — `markdownBlock.root`
is already laid out — it is waiting for *content still rendering* (images, mermaid) to produce the
anchor. Converted to `firstLayout`, the callback fires **immediately** on every attempt, so all ten
attempts burn through in a handful of microtasks without the renderer ever painting, and anchor
navigation silently fails. No build check catches this.

Reverted to `this.schedule.raf(attempt)` — the frame yield the retry actually needs — with a comment
recording why it must stay. **This site is now deliberately NOT converted**, and the roadmap's §2.2
grouping of it as a "rAF retry ×10" alongside genuine layout probes was the source of the error, in
my epic document as much as in the report. A real fix needs a render-complete signal from
`typedQueue`, which is a different and larger task. → backlog.

### `ImageViewportView`'s synchronous `complete` check needed a layout guard

The deletion of the 50 ms timer was right, and the actual root cause turned out to be **ordering**:
the `load` listener is attached at `:58` and `src` was previously assigned before it, so the event
could genuinely be missed. Assigning `src` after the listener fixes that outright.

But the replacement called `onImageLoad()` **synchronously during `onMount`**, and `onImageLoad`
fits the image to `getContainerBounds()`. At mount the container can still be 0x0, which would
compute a nonsense zoom. The same hazard exists at the `onUpdate` site for a different reason: a page
that is open but not active measures 0x0, so changing `src` on a background tab would fit against a
zero box. Both sites now require `this.root.clientWidth > 0`, keeping the missed-event guard without
the hazard.

## Verification plan — to run with the user before epic completion

**Recorded at the user's instruction (2026-09-02):** implementation runs autonomously; anything that
needs a human at the keyboard is logged here instead of blocking, and we walk it before the epic
closes. Every row is a behaviour a green build cannot prove.

`Status` values: `pending` (not yet attempted), `agent-verified` (checked via MCP/CDP by the agent),
`needs user` (requires a real mouse, a real file-system event, or a judgement about how an animation
*feels*).

**ALL ROWS VERIFIED BY THE USER — 2026-09-02, no issues found.** The user walked the full ledger,
including the five rows that required a human (A5, A7, A8, B2, B4) and the two regression checks on
defects found in implementation review (A4, A6). Every row below is therefore `user-verified`; the
per-row `Status` column is left as written so the *reason* each check existed stays on the record.

**B2 passing is the substantive result of this epic.** It is the row that proves the arm-and-hope
bug is actually fixed rather than relocated: an external edit to the settings file is now picked up
instead of being swallowed by a flag left armed by a write that produced no watcher event. That was
a real defect in shipped behaviour, not a refactoring artifact.

Also green before verification: `npm run typecheck`, `npm run lint` and `npm run build-prod` across
the whole change, and the renderer survived HMR of all fourteen changed files.

The app was driven only for read-only probes plus one throwaway data file (deleted). No user page,
setting, or file was modified.

### Strand A — layout

| # | What to check | Why a build cannot prove it | Status |
|---|---|---|---|
| A1 | Open Git Tree → Changes panel. The bottom split seeds at ~50% of the panel height, as before. | The **first-vs-settled** trap, now handled by `settledLayout`. The value is view-local but frozen for the view's lifetime, so a mid-animation measurement gives a visibly wrong split until the tab is reopened. | user-verified |
| A2 | Same for the Link editor's Tags and Hostnames secondary panels — **and open them from collapsed**, so the 150 ms `CollapsiblePanelStack` flex transition actually runs. | These are the two adopters that proved the settled requirement (`CollapsiblePanelStack.css:13`). Opening an already-open panel does not exercise the animation and would pass vacuously. | user-verified |
| A3 | Open a `.rest.json`, send a request with the response pane initially collapsed/hidden. | The old code spun a rAF indefinitely while `offsetHeight <= 0`; the replacement must still land the measurement when the pane becomes visible late. | user-verified |
| A4 | Open a long markdown doc **containing images or mermaid diagrams** and follow an in-page anchor link that sits below them. | This site was converted, found broken in review, and reverted to `schedule.raf`. The check confirms the revert restored working anchor scrolling — and the content above the anchor must be slow-rendering, or the retry never engages and the test passes vacuously. | user-verified |
| A5 | Play an audio file with the visualizer; resize the pane while playing. | The draw loop must stay raw rAF while only the sizing loop converts. A regression here is a blank or wrongly-sized canvas, or a stalled animation. | user-verified |
| A6 | Open an image already in cache (reopen the same file), a large/slow one, **and** switch an image page's file while that page is in the background, then activate it. | The third case is the 0x0 hazard found in review: an inactive page measures zero, so an unguarded fit would zoom against a zero box. All three must land at a sane zoom. | user-verified |

### Strand A — transitions

| # | What to check | Why a build cannot prove it | Status |
|---|---|---|---|
| A7 | Open/close the browser Bookmarks drawer: it must still **slide**, and — critically — **click into the drawer's search/list, then trigger another `sync()`** (resize the splitter) and confirm focus is NOT yanked back to the panel. | Dead-code deletion, so the slide should be untouched. The focus half is the real risk: `animationTimer` was doubling as the once-per-open focus guard. Focus theft mid-typing is invisible to any build check. | user-verified |
| A8 | Open/close the sidebar menu bar. It must still animate, not snap. | The one genuine style-flush site (`MenuBar.css:9` + `:27`). If the inlined `getBoundingClientRect()` flush is wrong or gets "tidied away", the transition silently does not run — and only a human can judge that it animated. | user-verified |

### Strand A — board

| # | What to check | Why a build cannot prove it | Status |
|---|---|---|---|
| A9 | Drive a board tab through automation/CDP twice: once on a **cold** tab, then again on the **same already-loaded** tab. | The already-loaded case is the trap — `waitForFrameLoad` resolves only on the NEXT load, so a missing fast path turns it into a silent 5 s stall rather than an error. One cold run alone would pass and hide it. | user-verified |
| A10 | Close/reload a board while a tab is still loading. | `loadedTabs.delete` and `.clear()` exist; pending waiters must not leak or hang. | user-verified |

### Strand B — echo guard

| # | What to check | Why a build cannot prove it | Status |
|---|---|---|---|
| B1 | Change a setting in the UI. The settings file must not reload-echo back over it. | The behaviour being preserved. The round-trip it depends on is now **measured faithful** (above), so this confirms a known expectation rather than probing an unknown. | user-verified |
| B2 | **Edit the settings file externally** (outside Persephone) and confirm the change is picked up. | This is the **bug the current code has**: arm-and-hope leaves the flag set when a write produces no watcher event, swallowing the next genuine external edit. The whole point of P5 is that B2 starts passing. | user-verified |
| B3 | Same pair for browser search history. | Identical copy of the same flag. | user-verified |
| B4 | If `TextHostEditorModel` stays in scope: edit an open file externally, confirm the editor picks it up and does not echo its own saves. | Different shape (content update, not a watcher event) — see the task's question 4. | user-verified |

### Residue

| # | What to check | Why a build cannot prove it | Status |
|---|---|---|---|
| C1 | Keyboard-navigate a long context menu past the visible area; the hovered row scrolls into view. | The `queueMicrotask` existed so the DOM was present; reading the `KeyedList` record must not reintroduce a first-open timing hole. | user-verified |
| C2 | Tree keyboard focus still returns to the tree root (every `focusRoot` caller). | A model→view callback replacing a `getElementById` can silently no-op. | user-verified |

## Notes

- **US-1258 is still uncreated** and still holds three live defects. It shares no mechanism with
  this epic and may land in either order — see correction 7 for the one place they touch.
- `TreeModel.focusRoot` (`:742-746`) carries a comment actively defending the DOM query ("the root
  already carries `id={rootId}`, so no extra ref plumbing is needed") against `uikit/CLAUDE.md`'s
  rule that models must not query the DOM. That is a §1.2 stale-rationale case — fix the code and
  the comment together.
- Deliberately **not** touched, and why: `PathInputModel.ts:185` (150 ms blur/click grace — a
  correct, honestly-labelled affordance), `ScriptRunner.ts:119` (1000 ms attribution heuristic — no
  signal exists to replace it), the 0 ms teardown-ordering hops in `GraphEditor.ts:629` and the two
  Monaco hosts (waiting on event propagation, not on a state dispatch, so `afterDispatch` is the
  wrong tool), and the `MinimapView.ts:133` subtree observer (inherent to a minimap).
- When this epic closes, the programme is done except package 8 in the backlog: remove the
  **Current Refactoring Roadmap** section from [active-work.md](../active-work.md), per the
  instruction at the end of that section.

## EPIC-078 — Post-De-React close-out: make the codebase stop claiming React

**Completed 2026-08-30.** Final epic of the post-De-React programme
(`../de-react-refactoring.md`): R9's comment/shim/dependency sweep plus the four De-React residuals
recorded in [`backlog.md`](../tasks/backlog.md). Seven tasks, 127 changed files.

- **EPIC-078** — [Post-De-React close-out](EPIC-078.md) — R9 plus the backlog residuals. Cut
  2026-08-30 with **ten corrections to R9's citations**, including one live finding (a "shim" that
  outlived the task meant to delete it and turned out never to be a shim), one dead citation, one
  misread code-review item, and a sweep hazard: 79 correct uses of the project's own "reactive"
  vocabulary sit inside `grep -i react`'s blast radius. Started and completed 2026-08-30.
  - [x] [US-1222: The four decisions — adapter fiction, `fill-slot` generation, janitor, the US-1023 shim](../tasks/US-1222-react-residue-decisions/README.md)
  - [x] [US-1223: Rename `data-part="react-slot"` to `children-slot`](../tasks/US-1223-rename-react-slot/README.md)
  - [x] [US-1224: Dependency and documentation cleanup — drop `clsx`, fix the false shim comment](../tasks/US-1224-dependency-cleanup/README.md)
  - [x] [US-1225: The React archaeology sweep](../tasks/US-1225-react-archaeology-sweep/README.md)
  - [x] [US-1226: `ToolbarView`'s append-then-wipe trap](../tasks/US-1226-toolbar-append-trap/README.md)
  - [x] [US-1227: Panel roots — restore a stable inspection contract](../tasks/US-1227-panel-inspection-contract/README.md)
  - [x] [US-1228: Answer the `ListBoxView` `rowViews` retention question](../tasks/US-1228-listbox-rowviews-question/README.md)

**What closed.** React mentions in renderer `.ts` outside `editors/draw/` went 194 → **20**, each
load-bearing. All 79 `reactive`/`reactivity`/`reaction*` decoys are untouched — verified by counting
before and after *and* by confirming no changed line in the whole diff contains a decoy token.
`data-part="react-slot"` is gone from authored source (now `children-slot`); `data-react-root`, the
one marker that still means what it says, is retained. `clsx` is removed. `/review` fixed two
further stale comments; `/document` updated 13 developer documents; `/userdoc` correctly found
nothing user-facing to change.

**The finding that outlives the epic.** R9's recommendation for `ui/dialogs/poppers/grid-context-menu.ts`
— "self-declared shim, check US-1023's status and delete" — would have caused a visible regression.
It is a live adapter with four callers that replaces av-grid's **SVG source-string** icons with icon
elements; because `fillSlot` writes a string as `textContent`, deleting it would render raw
`<svg …>` markup as visible text in every grid context menu. Its header was a **garbled sentence**
whose exemption referred to the old React grid's UIKit-side handoff — a different file US-1023 did
delete. The lesson generalises: an exemption that survived its own deletion task deserves
investigation, not deletion on sight.

**Three defects a green build did not catch**, all found by verification: US-1227 shipped
half-applied (`searchPanel` never got the marker while its own acceptance criterion claimed
otherwise); a `declare global { interface ImportMeta … }` made a leaf uikit component the global
owner of a platform type; and two comments fell in the **seam** between US-1222 and US-1225, because
those files were excluded from the sweep as "owned by US-1222" while US-1222's scope was only the
four decisions. Partitioning a sweep by file rather than by line leaves seams.

**Where the epic was wrong and said so.** C-3 preferred "a trap removed beats a trap explained" for
`ToolbarView` and named a specific option. That option was not available — `collectStops()` treats
each direct root child as a toolbar stop and the CSS layout depends on direct children, so a wrapper
restructures focus and layout rather than containing anything. A dev-only child-identity snapshot
landed instead. Separately, the backlog's premise for US-1227 (callers override `data-type` "through
residual props") was obsolete — there is no props channel; the override is a post-construction
`dataset.type =` assignment — but the conclusion survived for a better reason: the custom values are
load-bearing CSS selectors, so an additive marker is the only safe option.

**Accepted unverified.** No panel with an overridden `data-type` rendered during verification, so the
new `data-component="panel"` marker's actual purpose is unexercised; likewise US-1226's dev warning
firing on a real manual append, and the `searchPanel` marker. A 44/44 panel match is not evidence for
the overridden case.

## EPIC-076 — Post-De-React Epic B: the props pump

**Completed 2026-08-30.** Second epic of the post-De-React programme (`de-react-refactoring.md`):
R2, the pump-entangled half of R6, and R10.4-6. Ten tasks, ~130 changed source files.

- **EPIC-076** — [Post-De-React Epic B: the props pump](EPIC-076.md) — R2, the pump-entangled
  half of R6, and R10.4-6. Cut 2026-08-29 with its figures re-measured; three of the plan's counts
  are withdrawn as non-comparable and the `(s) => s` sweep is narrowed to global state only.
  Started 2026-08-29.
  - [x] [US-1199: Pilot — narrow the app-shell hot path off whole-state bindings](../tasks/US-1199-app-shell-hot-path/README.md)
  - [x] [US-1200: Write the convention — `update()` is configuration, callbacks are fields](../tasks/US-1200-props-pump-convention/README.md)
  - [x] [US-1201: Sidebar — `OpenTabsListView` and the re-entrant list views](../tasks/US-1201-sidebar-props-pump/README.md)
  - [x] [US-1202: Editor roots — stop fanning `{ model }` to every descendant](../tasks/US-1202-editor-roots/README.md)
  - [x] [US-1207: Editor roots — triage and convert bare subscriptions](../tasks/US-1207-editor-bare-subscriptions/README.md)
  - [x] [US-1203: The uikit drill — collapse the seven-layer props relay](../tasks/US-1203-uikit-drill/README.md)
  - [x] [US-1203B: Compound dropdowns and the deferred editor edges](../tasks/US-1203B-dropdowns-and-editor-edges/README.md)
  - [x] [US-1204: Retire the ref channels — `ElementRef`, `bindRef`, `onModel`](../tasks/US-1204-ref-channels/README.md)
  - [x] [US-1205: Derive-on-write — retire the 20 `memo()` sites, then delete `memo`/`IMemo`](../tasks/US-1205-derive-on-write/README.md)
  - [x] [US-1206: `applyRestProps` at construction only](../tasks/US-1206-rest-props-at-construction/README.md)

**What closed.** `VanillaView.update(props)` is now documented and used as construction-time
configuration; children that render live data subscribe to the slice they render. All four B-1
statements hold, verified rather than asserted: no whole-state selector on global state; callbacks
hoisted to stable fields in the converted areas; `this.memo` at zero with `memo`/`IMemo` deleted
from `TComponentModel` and every `ElementRef`/`bindRef`/`ref?:` channel retired; and
`applyRestProps` unreachable from any update path.

**What was deliberately left.** `dom-props.ts`'s type surface (R6's type half) goes to Epic C
alongside R7, which opens the same components. Three `GridBodyView.onModel` channels and `headerRef`
were retained because their models and elements do not exist at construction time. Seven
model-identity `throw` guards added in US-1202 were kept, contained by `AsyncEditorView`'s
`try/catch`. R4 full-rebuild sites, R5 immer collections and R8 timers are untouched.

**The finding that outlives the epic.** Roughly twenty of this epic's own stated facts failed
verification, and every one of them was inferred from code shape rather than observed. Three would
have caused regressions if implemented as written: "collapse the seven-layer relay" would have
broken the virtualized cell pool; "the DepsGate population should shrink" would have turned every
targeted push into a full repaint; and the obvious selector narrowing (`state.pages.map(...)`) would
have converted a mostly-gated binding into a fully ungated one, because `compareSelection` compares
arrays by identity. Two more near-misses were caught the same way: eager derive-on-write applied
uniformly would have made every tree drag pay an O(all-nodes) walk, and unifying the Popover content
factories would have broken either Select or Autocomplete. Counts published in this epic — including
two of my own — were wrong roughly a quarter of the time; a grep is a population, and only a
per-site verdict with a stated reason is a defect list.

---

# Completed Epics

Last 10 completed epics, newest first. Older epics are pruned.

---

## EPIC-075 — [Post-De-React Epic A: core contracts](EPIC-075.md)

**Completed 2026-08-29. All four closing statements hold, one of them with its instrument rewritten.**
Seven tasks, ~173 changed paths. `core/state/model.ts` lost **100 lines net**: `effect`,
`EffectRegistration`, `_evaluateEffects`, `hasRegisteredEffects`, `mapProps`, `onUnmount`,
`isFirstUse`, `oldProps`, the driver's throw branch, and the `postCreate` constructor timer every
model in the app paid for. `TComponentModel` ends as `props` + `setProps` + `init` + `dispose` +
`memo`. Renderer-wide: `this.effect(` **0**, `*Internal` callers outside `core/state/` **0**,
`isFirstUse`/`oldProps` **0**, `.unsubscribe()` **0**. `AppEvent` and `SubscriptionObject` deleted.
New: `core/utils/DisposableStore.ts` and `core/utils/scheduling.ts` (`Delayer`, `afterPaint`,
`focusAfterPaint`). `memo`/`IMemo` survive by decision (A-3), annotated for Epic B.

**Its largest finding is that the epic's own claims were the least reliable thing in it.** Five of
its stated facts did not survive contact with the code, and every one was inferred from shape rather
than observed:

1. **A-4 called the two `window` `"message"` listeners "real leaks … with no registered removal",
   and made that the justification for scoping US-1197 as a fix.** Neither leaked:
   `html/HtmlBodyView.ts` already used `this.own(...)`, and `board/BoardWebview.ts` cleared a
   `messageUnsubscribe` field in `onDispose()`.
2. **A-4 called the five dialog focus timers copies of "the same" timer.** All five already cleared
   on disposal, and two behave differently — `InputDialogView` *selects* rather than focuses, and
   `CreateBoardDialogView` chooses between two inputs from a mount-time snapshot. US-1198 is
   deduplication, not a leak fix.
3. **The zero-delay `setTimeout` census was 28, not "~11"** — 23 remain for R8.
4. **A-2's own correction was incomplete.** It recorded two teardown shapes; there were **three** —
   `settings.onChanged` goes through `wrapSubscription` and exposed `{ dispose }`. Fixing only
   `Subscription` would have left statement 4 false while looking done.
5. **A-4's instruction for US-1194 was wrong.** It said to assign the replacement previous-value
   field "at the **end** of `setProps`". `oldProps` is written unconditionally on every pump, but
   `CategoryViewModel.setProps` has an early return: with `multiSelect` off, `selectedHref` moving
   A → B takes that return and an end-assigned snapshot sticks at A, firing a selection seed later
   that `oldProps` never would. All three conversions use **capture → compare → immediately assign**,
   which is equivalent on every path by construction.

**Statement 3's instrument had to be rewritten mid-epic, and the correction generalises.** It
demanded "zero `private *Unsubscribe` / `*Subscription` teardown fields remain in views". **85
remain, and that is correct** — the rebindable US-1152 pattern the epic itself mandates *requires*
holding the release handle in a field (`this.pageStateUnsubscribe = this.ownSubscription(...)`).
Driving the count to zero would mean deleting the ability to rebind. A-5 had already warned the
field count *undercounts* (a differently-named field or a closure passes); it also **overcounts**, by
scoring the prescribed pattern as a defect. The clause was struck and completion measured by a
**354-site semantic census** built from `.subscribe(` / `.watch(` / `.on(` / `addEventListener(` call
sites: **62 already owned, 198 converted, 94 deliberately unowned** — every exception carrying a
source comment naming its owner. *A census keyed to how a construct is stored is not a census of the
construct.*

**Three silent-behaviour changes were caught in plan review, none of which would have failed a
build.** (a) `onUnmountInternal` runs its cleanup loop *before* `dispose()`, and that loop was the
only thing unsubscribing `eMcpStatusChanged`/`eMnemeStatusChanged` — with `_effects` empty it does
nothing, leaking one listener per Settings open/close; `GitIntegrationModel` had **no** `dispose()`
at all while its `setProbe` has no liveness guard. (b) `CustomEvent.detail` is **`null`** when
nothing is sent, where a plain listener array passes `undefined` — `Subscription.send()` now
normalizes. (c) DOM `dispatchEvent` surfaces a listener throw as an **uncaught** error; a naive
`catch`/`console.error` would have preserved dispatch while silently downgrading error visibility,
so `Emitter` re-throws asynchronously. A fourth was avoided by measurement rather than reasoning:
the plan would have rewritten eight models whose `dispose` is a class-field arrow into prototype
methods, and compiling that exact shape against `target: ESNext` showed it is accepted —
`super.dispose()` from inside the field arrow included.

**Scope discipline held in two places.** `RunOnceScheduler` and `Throttler` were dropped for having
no call site — `Delayer` shipped only because its caller (`GraphLegendModel.scheduleDescription`)
was converted with it. And US-1197 was split into two separately verified deliveries (11 behavioural
sites, then the 198-site sweep) rather than one 218-site diff, with 62 already-correct `own(...)`
calls left un-renamed so the sweep stayed reviewable.

**Verified by use, not by grep**, across full renderer reloads: the `EventChannel.sendAsync` LIFO
short-circuit driven end-to-end through `openRawLink` (page created, `handled === true`); Settings'
MCP/Mneme/Git/Tor-port gates including same-value no-ops and unrelated-key isolation; page
create/dispose cycles; menu reopen; tree expansion surviving a rebuild; notebook `syncTags`
re-attach proven by removing a second tag from the *rebuilt* DOM; and four of the five focus dialogs.

**Accepted unverified at close**, recorded with repro steps in the epic's Notes: the `selectedHref`
reveal inside an Explorer editor (the virtualized tree defeated every DOM instrument tried), Browser
Profiles add/remove/clear, `CreateBoardDialogView`'s two-input branch, toggling `mcp.enabled` (it
severs the agent's own MCP transport), Default Browser registration, the Tor dialog's explicit
`postCreate()`, `afterPaint`'s 100 ms fallback in a non-painting window, and `ComponentQueue`
request/reply under a real editor workload.

---

## EPIC-074 — [De-React Epic F: React confined](EPIC-074.md)

**Completed 2026-08-28. The De-React programme is finished.** `react` and `react-dom` are importable
from exactly **one directory** — `src/renderer/editors/draw/` — and `npm run lint` fails if that
changes. The only `.tsx` file in the repository is `editors/draw/ExcalidrawIsland.tsx`.

`react` importers **85 → 2**, React *value* users **16 → 2**, type-only **69 → 0**, non-story `.tsx`
**10 → 1**, story `.tsx` **2 → 0**. 169 files changed, **+468 / −2,877**. Deleted: 10 dead
`mountVanilla` faces and the vanilla-to-React adapter, 9 dead hook entry points, the dead
`IState.use()` hook path (15 wrapper call sites), storybook's React arm with the `Panel`/`Text` faces,
and the React event proxy. Emotion `<Global>` became a native `theme/global-styles.ts`, which killed
the last always-live React root. `@emotion/react`, `@emotion/styled` and `react-markdown` are
uninstalled; **`react`, `react-dom`, `@types/react` and `@types/react-dom` stay installed
permanently** — Excalidraw declares the first two as peer dependencies and its own `.d.ts` imports
React, so no amount of our own work removes them. That is the stated outcome, not a shortfall.

**Its largest finding is about measurement, not React: a census keyed to one spelling of a construct
is not a census of the construct.** The instrument that has measured React usage in every epic since
A was wrong **three times here**, each differently, each time producing a confident wrong total —
(1) the import regex hardcoded double quotes, hiding `core/state/state.ts`, which calls four React
hooks, from *every figure this programme ever published*; (2) `@types/react` declares a global `React`
namespace, so `core/traits/dnd.ts:48` referenced React types with no import at all, invisible to any
import-based query; (3) the value test looked for `React.member`, so
`scripting/ScriptContext.ts:64`'s `readonly React = React` — a namespace used as a value, never
dereferenced — was filed as type-only. Defects 1 and 3 were **blocking**: both files were React value
users outside `editors/draw/`, so the epic's own closing rule could not have passed while either
stood. *An epic whose deliverable is a lint rule cannot be scoped by a query weaker than the rule.*
The corrected baseline was 85/16/69, not the 84/14/70 the epic published at scoping time.

**Two plan corrections it made on itself.** F-e and F-f were ordered wrongly: the runtime half
(`applyRestProps`) and the type half (`React.HTMLAttributes`) of one contract lived in different
tasks, and doing runtime first left every `on*` handler receiving a native `Event` while its declared
type promised a synthetic one — nothing failing to compile while
`editors/link-editor/index.ts:260`'s `event.nativeEvent` silently became `undefined`. Reversed, with
the general rule: **when a contract's runtime and its types are changed by separate tasks, change the
types first — a type change fails loudly and lists the work, a runtime change fails silently and
hides it.** And F-h could not "just delete `mount.tsx`": `VanillaViewCtor`, the type the whole vanilla
architecture rests on, was stranded in that React module with 13 references across eight subsystems,
and relocating it touched more files than the rule did.

**One breaking change, recorded rather than absorbed:** the injected `React` script global is gone.
It was documented (`docs/scripting.md`, `whats-new.md:1145`) but provably inert — no script-facing API
can consume a React value across all 40 `assets/editor-types/*.d.ts`, and it never had typings — so a
script could build a React element nothing could render. Scripts referencing `React` now throw
`ReferenceError`; a what's-new entry says so.

`/review` found two must-fix items, both real and both fixed: `dom-props.ts` compared enumerated
attributes case-sensitively while the new props type spells them camelCase, so `spellCheck={true}`
would have written `""` — which for an enumerated attribute means *auto*, the opposite of the
request — and the props type omitted `draggable` while the helper still special-cased it. A rename
that makes an implicit contract explicit surfaces disagreements that were always there.

Also recorded: **`execute_script` cannot use dynamic `import()`** (V8 rejects it inside `new Function`
with a *parse* error naming no import — use the `app` global instead), and raw HTTP to the app's own
MCP endpoint is not a usable verification fallback. Left unverified by decision: the theme-switch
stylesheet rebuild (argued sound by inspection; `app.settings.set("theme", …)` does **not** apply a
theme in-session, which is a property of the settings path and not evidence about the subscription),
plus the post-proxy event checks now tracked with US-1173.

---

## EPIC-073 — [De-React Epic E15: the last React editor](EPIC-073.md)

**Completed 2026-08-28.** Epic E is finished: **no editor in Persephone produces React except the one
a vendor requires.** The last five React editor bodies are native — `env-vars`, `file-diff`,
`rest-client`, `graph`, and `draw` reduced to an 87-line Excalidraw island — the 18-face
`mountVanilla` layer is deleted after its props types were relocated into native modules, and the
residual React paths are gone from `PopoverView`, `DialogView`, `highlight.ts`, `fill-slot.ts` and
four uikit views. JSX markers **403 → 10**, `editors/` **385 → 2**, non-story `.tsx` **50 → 9**,
faces **21 → 0**, `react` importers **116 → 84**, React *runtime* users **39 → 14**. `editors/` now
contains exactly one `.tsx`.

**Its largest finding was not about React at all: a sized element is not a rendered one.** Two
defects reached the tree and **both passed every structural check**. The Excalidraw island host `div`
— an element the React original never had — was created bare, so `display: block; height: 0` made
Excalidraw's `height: 100%` resolve against zero and the canvas collapsed. And `GraphBodyView` kept
only the *unmount* half of the original's `canvasRef` callback, so `setCanvas()` was never called:
the renderer built no simulation, never ran `handleResize()`, and left the canvas **backing store at
the HTML default 300×150 while the element measured 1557×949**. At the moment each shipped the
readings were 0 React roots on the correct host, no crash, correct element geometry, and — for graph —
a footer correctly reporting the fixture's node count from the model. All true; both features blank.
The instruments that found them were a walk down the height chain and a **canvas pixel histogram**.
The corollary, proven twice: *introducing a nesting level the original did not have is a layout
change* — which is why `mountVanilla`'s host is deliberately `display: contents` while
`mountReactHandle`'s must be sized by its caller.

**It also discovered that the programme's stated ending was impossible, and the user redefined it.**
`draw` was scoped as the second-easiest task and was the only one that could not reach the goal:
`@excalidraw/excalidraw` declares `react`/`react-dom` as peer dependencies with no non-React entry
point. The scoping had measured markers, files and lines correctly and never asked *what does this
file import, and can that thing exist without React?* (**C18**). That invalidated Epic F's opening
line — "Delete `react-dom`, then `react`" — and the **user decision (2026-08-27)** is that the
terminal state is **"React only where a vendor requires it"**, scoped to the Excalidraw editor, with
relocating Excalidraw into persephone-boards explicitly out of the programme. Removing the draw
*editor* would not free React either: four other files take pure helpers from the same single-entry
package, and `drawExport.ts` alone has seven consumers including the native `image`, `mermaid`, `svg`
and `graph` editors.

**Closing statement 4 was wrong as written, and is corrected rather than reinterpreted.** It claimed
React's runtime is reachable from exactly two places; there are three — `GlobalStyles` at
`index.tsx:15`, "the sole startup React root", live in *every* session, which the rest of the epic
document acknowledged and the statement simply failed to count. Statements 1–3 were met.

**Instruments failed seven times and a third failure class appeared.** Beyond E15-3's five scoping
failures and two implementation ones, **five validation cases went stale mid-epic** because each
named a file the work deleted. Every time the script refused to publish numbers and exited non-zero —
the guard built in at E15-3 earned itself seven times over — but each refusal cost a re-baseline.
*Pin known answers to invariants, not to conversion targets.* Two false alarms were also recorded,
both from verification rather than code: a hand-invented `.rest.json` schema (the real `body` is a
`string`) crashed Monaco, and the corrected fixture *still* showed the crash because `openRawLink`
reactivates an existing page rather than remounting it — **to re-test a crash fix, open a fresh
path.**

`/review` found six must-fix items, all applied and re-verified: four editor `index.ts` files used
`!` lifecycle fields instead of the codebase's `| undefined` pattern, `GraphBodyView` dereferenced
`tooltip!` in a closure, and its loading `SpinnerView` was never claimed through `this.child(...)`
so its cleanup never ran — a real C1 violation. `/userdoc` correctly found nothing: the epic changed
no behaviour by design.

Carried forward to Epic F: the ~70-file React **type** surface (the actual blocker on uninstalling
anything); an **enforceable** closing statement — an ESLint rule confining `react` imports to
`editors/draw/**`, with 84 importers as the baseline; the three live React roots; and seven
hook-exporting modules whose React consumers are now gone and which should be **re-measured for
deadness rather than converted**. Unverified and worth a human pass: the dialog commit/focus path,
popover resize (reachable only via its storybook story), graph interaction, and rest-client's Monaco
hosts.

## EPIC-072 — [De-React Epic E14: the `Component` arm dies](EPIC-072.md)

**Completed 2026-08-27.** `EditorModule.Component` no longer exists: the registry has one required
`View` arm, no React import, and no `mountVanilla` normalisation shim. `board` and `browser` — the last
two React editors, hosting a cross-origin `iframe` and a per-tab `<webview>` — are native, and
`PageSlot`/`PageManagerView` are native too, so **every editor in the application now mounts through a
native per-page path**. `@floating-ui/react` is uninstalled. JSX markers **566 → 403** (`editors/`
542 → 385), non-story `.tsx` **85 → 50**, and a live session with a board, a browser and a markdown
editor measures **1** React root — `GlobalStyles`, Epic F's target — down from 9 at baseline. Five files
died because their last caller was converted: `PageManager.tsx`, `BoardGlyph.tsx`, `BoardsTree.tsx`,
`ToolsTree.tsx`, and the shim.

**It was scoped against a fresh measurement rather than E13's handoff, and the measurement split the
work.** E13 named E14 as Epic E's last epic with seven editors; measured, `board`+`browser` are one
*atomic* unit (the arm cannot go while either survives) and the other five are independent bodies that
can never block anything. Combining them would have produced an epic unable to close if either host
conversion stalled. It also corrected four claims in that handoff — `board` hosts an **iframe**, not a
`<webview>`; the arm survived only because two three-line JSX wrappers existed, not for any hosting
reason; the `@floating-ui/react` uninstall was gated on **one** importer; and the marker figure was 542,
not 535.

**Its headline finding is ownership on a shared key, and it cost a user-visible bug to learn.**
`BoardWebview` called `port.close()` on a port whose `boardId` did not match — but `api.onBoardPort` is a
**global** subscription, so that port belonged to another live frame, and closing it killed that frame's
bridge (the user saw a board with no data or chart). The close review then found **four more instances of
the same shape**: the browser's `webviewRefs` and `webviewReady` deletes, its main-process IPC
registration, and the board's CDP frame unregister — the last two keyed in main by a bare string, so a
stale view could unregister a live one. Stated as **C1a**: *when something arrives on a shared broadcast,
map, or registry key, the entry you did not create belongs to somebody else — ignoring and disposing are
not interchangeable.* Its counterweight matters equally: C1 tells a conversion to make implicit teardown
**explicit**, and that pressure makes *more* disposal feel safer than less. It is not; the React
originals were correct because they did less. **The class is invisible to every instrument this programme
uses** — root, iframe and webview counts were all correct while the bridge was dead.

**Its second finding indicts this programme's verification style.** US-1155's live pass was declined as
unreachable and replaced with a structural proof that no value on that path could create a React root.
Sound, true, and **vacuous**: the review found `trailingElement` was dropped before the row renderer, so
the subtree was empty. The pin buttons and Update tags were built, claimed, mounted, and never inserted.
The cause was an error in the *plan review* — the correction named `ListItemView.setTrailing()` with real
`ListBox` evidence, but `TreeView` renders `TreeItemView`, a different class with its own `setTrailing()`.
So: **a proof of absence is not a proof of presence**, every closing statement phrased as a removal is
satisfiable by deletion, and a deferred live pass should be recorded as *unverified* rather than replaced
with a measurement of a different property.

**Instruments failed four more times.** Three before any number was published (a `*.stories.tsx` glob
that matched nothing; an import gate testing stripped source where every module path had become `""`;
and E13's own JSX stripper treating an apostrophe in JSX prose as a string opener, which made
`file-diff` measure zero while holding a full React body). The fourth recurred three times and is new:
**querying the first matching element instead of the visible one** — it reported identical element counts
for two different editors and made a *working* board reload look broken. Where inactive pages stay in the
DOM, "the element" and "the visible element" are different queries.

**US-1160 also relocated its own fix by probing rather than reading.** A module-load rejection surfaces
at `showEditorPage` → `createEditor` → `loadModule`, one layer below `AsyncEditorView`, because
`createEditor` needs the module to build the editor model. The added `.catch()` is defence-in-depth; the
reachable failure is a **silent no-op** — no page, no message, nothing reported (**US-1163**). Verified
positively: constructor and `onMount()` throws both show a native "Editor crashed" panel with message and
stack, and a crash no longer reintroduces React.

Carried forward: **US-1163**, the deferred type assertions, and the browser's network-dependent surfaces
(navigation, downloads, bookmarks, Tor, incognito, suggestions, drag-and-drop, hover preview) which
remain *could not reach with the available instrument* — several review findings were in exactly that
untested region.

## EPIC-071 — [De-React Epic E13: the editor bodies that still build React](EPIC-071.md)

**Completed 2026-08-27.** The first epic in this programme scoped purely by **body**: its contract
search came back negative for the third consecutive time, so there was no React-typed declaration left
pinning callers that would otherwise be vanilla. Eight editors converted — `monaco`, `about`,
`tools-hub`, `mneme-root`, `mneme-config`, `settings`, `mcp-inspector`, `link-editor` — plus the
`VanillaView` lifecycle guard and the `uikit/` face collection.

**All four closing properties met:**

| Property | Result |
|---|---|
| `EditorModule.Component` reduced to the `<webview>` editors only | **8 → 2** (`board`, `browser`) |
| Faces removed from the value graph | **9** — 2 deleted, 7 type-relocated to `.ts` |
| One React root on the everyday path | **1** (`GlobalStyles`) across 17 open tabs, 0 empty SVGs app-wide |
| Converted bodies produce no React | zero React imports/JSX/`createElement` in all eight folders |

`editors/` JSX markers **1,337 → 535** (60% of the remaining editor JSX); `editors/` non-story `.tsx`
76 → 36; `uikit/` 51 → 39; renderer 136 → 85.

**The headline was met at task 2 of 10.** `MonacoBody.tsx` — one 239-line file — accounted for three of
the app's four live React roots. The other eight tasks bought the arm property, the collection and the
guard, none of which a root count shows: **a single metric would have declared the epic finished after
its second task**, which is the argument for the four-part closing property it opened with.

**Its largest finding is about instruments, not React.** The epic corrected its own measurement **four
times**, always the same mistake: E12's `createElement` column counted `document.createElement` and the
icon builders E12 itself had just created (12 React-producing editors read as 7); a constructor `append`
scan read 49 sites as 2; a hook-token count read 47 as 35; and — the dangerous one — the JSX face matcher
`<Sym[[:space:]/>]` missed **every multi-line opening tag**, so twelve *live* faces looked dead and a task
had been scheduled to delete them. The mechanism: **a grep counts occurrences of a string; a measurement
counts occurrences of a behaviour, and the gap is always filled by imports, comments, types, generics and
the codebase's own dominant formatting convention.** Narrowing a pattern is not validating it; validation
costs one line — run the instrument against a case whose answer you already know.

**Close review: nine findings, six fixed, three handed to US-1152.** Finding 3 resolved the one thing
the epic could not explain: `settings` measured 25 buttons against a baseline of 24 because
`LibraryPathSectionView` always built a clear button that React had rendered **conditionally**. Settings
now matches its pre-conversion baseline on **15 of 16** element counts. The lesson corrected the epic's
own reasoning: an unexplained mismatch surrounded by exact matches is *more* likely to be real, not
less — fifteen matches are evidence the instrument is sound. Also fixed: 6 panel-type casts, 24
`undefined as never` clears, **135 definite-assignment assertions**, and 5 non-null assertions. One cast
survives, documented rather than silenced, because removing it needs the deferred `SlotText` →
`SlotContent` migration.

**Carried forward:** `graph` (the largest remaining body, with a canvas and the last `highlight.ts`
React consumer), `rest-client`, `browser`, `board`, `env-vars`, `file-diff`, `draw` and
`editors/base/EditorError.tsx` — 535 markers, E14's scope, inherited as a list rather than a search.
Also **US-1152** (five pre-existing secondary views that bind as if their model were fixed), **US-1153**
(`mneme-root` and `link-editor` tiles mode, closed unverified), and the measurement that the biggest
React concentration in the app is **not an editor** — `tools-hub`'s Registered-boards tab holds 26
roots, 24 of them one *per visible row* in shell code E12 named as a survivor without weighing it.

---

## EPIC-070 — [De-React Epic E12: the shell's React-typed content](EPIC-070.md)

**Completed 2026-08-27.** Three contracts outside `editors/` still declared **React** for content the
producer already held as **DOM**, each with a DOM twin already built and already dominant: the per-page
React island (`renderPage: (id) => ReactNode`), the icon component type (`SvgIconComponent`), and
`FileList.getTrailing`. All three are gone.

**Measured against the captured baseline on the same session shape** (7 pages open, 3 activated):
**React roots 6 → 3**, the three survivors exactly as predicted — `GlobalStyles`, `MonacoBody`, and the
board editor's `board-host`. **The Rule 4 instrument is honest for the first time in the programme**:
`1 (GlobalStyles) + 1 per React-producing editor instance`, with **no term that scales with open
tabs** — 4 of 7 open pages now cost nothing. `theme/icons.tsx` → `theme/icons.ts`, `SvgIconComponent`
reduced to `{ createElement; viewBox? }` with **no call signature**, **116 icon React components → 1**
generic face, 30 named icon JSX tags → **0**, 17 slot contracts widened to `SlotContent`, both
DOM→React laundering sites deleted, 9 dead faces + 4 dead barrels + 2 stubs collected. Renderer
non-story `.tsx` 162 → **136**; non-editor JSX markers 62 → **11**. `editors/` deliberately
**unchanged at 1337 markers**, reported so the epic is not misread as progress against Epic E.

**The closing property was checked file by file, not by a count.** Each of the eleven non-editor files
still holding JSX was matched to what keeps it alive — the boundary itself, the Emotion root, the error
boundary eight editor modules need, the two faces with no vanilla twin, the generic `Icon` face, and
views held by the `tools-hub` and browser editors. Epic F inherits a list of which editor conversion
frees which file.

**Its largest finding is not about its own cut: the programme's headline metric was a proxy and it was
wrong.** `EditorModule.Component` callers measures which arm a module *registers on*, not whether it
produces React — `monaco` has counted as converted since E2 while mounting `MonacoBody` as a React
element, and **twelve `View`-arm editors still produce React**, all live. What remains of Epic E is
re-cut on the body count.

**And a sharper variant of that lesson: a count off by one is not a rounding error, it is an
unexamined case.** 115 of 116 icons matched the scoping regex and I read that as "all of them". The
missing one — `PersephoneIcon`, the only JSX-bodied icon, the only theme-dependent one, and the only
icon whose artwork existed *twice* — was the strongest case for the change.

**Four carry-forward findings:** a `mountVanilla` face outlives its last caller silently, and a dead
barrel is what hides it; a split leaves a stub, and a stub is a face (passing that finding into the
next brief made that task find two of its own); a scope fence drawn to prevent a collision also hides
what is behind it (`Ornament.tsx` survived inside one); and widening a type is a promise the
implementation must keep or not make.

**Its close review found three real defects**, the most instructive being a *silenced* violation
rather than a bug: UIKit imported the new app-coupled `Icon` face under an
`eslint-disable import/no-restricted-paths` — the only `uikit/ → components/` import in the codebase.
**A suppression comment is the same tell as `as unknown as`, `icon as never` and `asReactNode`**, all
three of which this epic deleted while adding a fourth of the same kind without noticing. Also fixed:
`PageSlot.renderNative` had no mount-failure rollback, which would have left a page **permanently
blank for the session**, and `PageSlot.dispose` could leak one arm.

---

## EPIC-069 — [De-React Epic E11: the Storybook contract](EPIC-069.md)

**The first epic whose search reversed its predecessor's verdict rather than an inherited candidate.**
E10 closed on a negative — "the remaining React is terminal" — having measured
`Story.component: React.ComponentType` and set it aside as *"a genuine contract pinning a harness,
not the app."* That phrase was the error: what it pinned was `uikit/`. 21 of the 49 face files had
zero non-story JSX users and 15 were held by exactly one caller — their own story — so the removal
ledger's "React faces … collectable once Epic E finishes" row had been stating the wrong unblock
condition since C1, because Epic E cannot remove a story. It was also the programme's first
**single-armed** contract: every earlier one had a vanilla arm built beside it, `Story` had none, so
the arm had to be built before anything could convert.

| Measure | Start | End |
|---|---|---|
| `.story.tsx` / `.story.ts` | 43 / 2 | **2 / 43** |
| `Story.component` callers | 44 | **2** (`Panel`, `Text` — permanent, §E11-4) |
| Storybook editor non-story `.tsx` | 6 (396 lines) | **0** |
| Editors on the React `Component` arm | 9 | **8** |
| `uikit/` non-story `.tsx` | 70 | **51** |
| Renderer non-story `.tsx` | 187 | **162** |
| Stories rendering | 44 of 45 | **45, zero failures** |
| React roots, Storybook page, per vanilla story | 1 + slots | **1** — `uikit/Toolbar`'s, not this epic's |

**Three measurement lessons, all the same shape.** The scoping used file extensions, an import list
and JSX tag counts, and all three lied. `.tsx` overstated the surface — **64 of 70** non-story `.tsx`
files in `uikit/` contain no JSX at all. The import list gave "45 stories" by counting the `Story`
*type* import; the real registry held **44**, plus one orphan (`SelectableRow.story.tsx`, written in
C1 and never registered, so the roadmap's "42 of 44 have a story" was overstated by one). And the tag
count classified **35 demo-wrapper stories as mechanical** — they render a story-local React wrapper,
several written with `React.createElement` and therefore tagless — which turned "point 35 stories at a
view" into "rewrite 35 demo wrappers as `VanillaView`s" and forced the task list to be re-cut
mid-epic by wrapper complexity.

**The epic's own headline number was wrong, and usefully so.** It predicted "≥15 faces deleted" and
delivered **2**, because each face file is *also* its props-type module (`Menu.tsx` has 28 type
importers, `Dialog.tsx` 16). The accurate result: **20 of 49 React components removed as dead code**,
2 files deleted, 17 reduced to type-only modules renamed `.ts`. Deleting a face is a
**type-relocation** job — Epic F's shape — and the ledger now carries the three-way split
(3 free / 17 type-only / 29 still-live) with importer counts.

**Three unreleased bugs found, two of them live crashes**, none catchable by any gate:

- `NotificationView`'s constructor touched a child field before `onMount()` created it, so every
  construction threw — **no toast or alert in the app could render** (EPIC-066).
- `BlockingBranchView` did the same — **the blocking progress overlay could not render** — and
  `ProgressPillView` leaked a `SpinnerView` created in its constructor (EPIC-055, on the branch since
  2026-08-21). Both surfaced by the close review.

That is **four violations of one rule across three epics** — *the constructor must not create or touch
child DOM* — and `private x: T | undefined` makes every one of them compile. Carried forward as
**US-1131**: guard it mechanically before the next conversion epic, since every remaining epic writes
new `VanillaView` subclasses.

**What converting a harness bought beyond the contract.** The stories became `uikit/`'s **first
non-React consumer**, and that immediately surfaced **six under-declared public props** —
`CollapsiblePanelStack.buttons`, `DialogContent.headerButtons`, `Tree`/`ListBox.renderItem`,
`ListBox`/`Autocomplete.emptyMessage` — all consumed by `fillSlot`, which already accepted `Node`, yet
declared `ReactNode` only. Each fix was one word; in the first case the correct type was already on
the adjacent line. That is a fair answer to §E11-5 concern 2's accepted loss of face coverage.

**Two process findings.** A pre-conversion **DOM baseline** was the only instrument that caught
anything: it found three silent regressions in the first batch — `spacer` rendering nothing visible at
all — with `tsc`, ESLint and `build-prod` green, in the same task whose summary reported three *other*
stories as blocked. Hence the rule the epic ran on afterwards: *a report of what could not be done is
not evidence about what was done*, so every later task was gated on the DOM diff, never the summary.
And the harness must render through the **real** preparation path — duplicating `LivePreview`'s
prop preparation for verification produced a false regression report, fixed structurally by exporting
`prepareStoryProps()`.

Also narrower than EPIC-068 stated: touching the importer clears a stale `.tsx` → `.ts` rename for a
**static** import, but a module reached through a **dynamic** `import()` needs the dev server
restarted. A frozen `?t=` timestamp in the error distinguishes the two.

---

## EPIC-068 — [De-React Epic E10: the `PageToolbar` editor group](EPIC-068.md)

The first epic in this programme whose **contract search came back negative**. Five epics running had
found one React-typed member pinning otherwise-vanilla callers; every candidate here failed that
test, each for a different reason — `EditorModule.Component` is load-bearing (15 editors, but their
bodies are genuinely React), the three surviving chrome props are *nominal* (all three files are pure
`mountVanilla` shims, so by E8's own test they bind no implementation), `SvgIconComponent` is live but
thin (45 importers, only 32 JSX usages), the `applyRestProps` bridge is a real contract whose
precondition is unmet, `Story.component` is a genuine contract pinning a **harness** rather than the
app, and `renderItems` had one caller. What the negative says: the remaining React is **terminal** —
React because its own content is React, not because a type above it demands React. So the axis became
content, cut along *the connected component of the `PageToolbar` module graph* (E8's atomic unit):
six editors, 2,895 of the 9,497 JSX lines left in `editors/`. Seven tasks, all reviewed.

| Measure | Start | End |
|---|---|---|
| `<PageToolbar` JSX call sites | 6 | **0** |
| `PageToolbar.ts` callers (incl. `SwitchWidget`) | 7 | **0** — the file is deleted |
| Editors on the React `Component` arm | 15 | **9** |
| Editors registering `View` | 15 | **21** |
| JSX lines in the six editors | 2,895 | **9** (a deliberate shim) |
| `.tsx` in `editors/` (non-story) | 94 | **76** |
| Renderer non-story `.tsx` | 205 | **187** |
| React roots per converted editor | 1 each | **0 each** |

**Rule 4, honestly.** Five of the six were verified live, each measuring 0 `[data-react-root]` and 0
`[data-part="react-slot"]` with real content rendering. **`git-tree` is recorded as statically
verified but live-unverified** — both programmatic open routes are closed (`addEditorPage` refuses it
as "a standalone editor that requires a specialized model") and the user was working in the app, so
it was not worth disturbing their session. Same discipline E9 applied to `svg-view`. Whole-app roots
read 3 at close (`GlobalStyles` + one per open board page), matching the baseline arithmetic exactly.

**Four findings outlast the epic**, and three are the same lesson from different directions —
*what React did for free by destroying things must become explicit when nothing is destroyed*:

- **Never pass a `DocumentFragment` to a slot.** Slots are re-filled unconditionally
  (`PageToolbarView.onUpdate:420-427`) and `fill-slot.ts:137` appends, which *empties* a fragment — so
  mount works and the first update deletes the content. EPIC-064's "a cache of a resource is a bug" in
  its purest form: a fragment is destroyed by the act of being used.
- **`bind()` is only for state that outlives the view.** It registers its unsubscribe through `own()`,
  which has **no early-release API**, so re-binding a changing-source subscription both leaks and lets
  stale sources keep pushing values — selection visibly fighting itself, not merely waste. §4's
  "forgotten unsubscribe", found in the wild.
- **A `useMemo` whose result feeds a callback becomes dead code if the port defines the recompute but
  never calls it.** The close review's sharpest catch: `changeMapFor()` was defined and never called,
  so commit badges and an "Open in new Tab" action were silently missing with every gate green. An
  empty `Map` is still a `Map`, and the symptom is *absence* — which no root count can measure.
- **A view that measures its own root cannot use a `display: contents` root** — no box, so
  `ResizeObserver` never fires and `getBoundingClientRect()` reads zero, silently. Two of the epic's
  own rules conflicted here; the measurement wins.

**It retired one of its own concerns rather than implementing it.** E10-5 concern 7 predicted
`BoardScreenshot.tsx` would need post-paint sizing with a bounded retry; it measures nothing at all,
and the implementation brief was told explicitly *not* to add it — otherwise the epic document would
have talked someone into writing dead complexity. Fifth instance of *a forward-looking note is a
measurement with a date on it*, this time caught inside the epic that wrote it. It also **rejected
E9's named E10 candidate on re-measurement**: `SecondaryViews.tsx` was credited with 4 roots when that
note was written and accounts for 0 now.

**E10-4's correction.** The removal ledger recorded six `PageToolbar` callers; the module had a
**seventh** through its `SwitchWidget` export (`board/BoardToolbar.tsx:160`). That site now calls
`mountVanilla(SwitchWidgetView, …)` directly, so the module deleted at 0 callers without converting
`board`. *A ledger row names the callers someone counted, and a module can have callers of a
different export — grep the module path, not the component name.*

**Process finding.** The per-task briefs accumulated ten rules with a file:line each; the first three
tasks needed corrections and the last two needed **none**. *A correction applied once is a fix; a
correction written into the next brief is a class removed.* Every `.tsx` → `.ts` conversion also hit
the dev-server **stale dynamic-import trap** — the editor silently fails to load until
`register-editors.ts` is touched. `build-prod` is unaffected; it belongs in the routine, not the
diagnosis.

**Left deliberately.** `BoardScreenshot.tsx` survives as an 8-line `mountVanilla` shim
(`tools-hub/SearchBoardsTab.tsx:158` still renders it). `EditorToolbar` (3 callers) and
`ContentHostFooter` (1) keep their React faces and ledger clauses. `createContentsRoot()` is
duplicated locally in eight files — extracting it was out of scope for a per-editor epic.

| Task | Title |
|---|---|
| US-1112 | [`image` → `View` (the pilot)](../tasks/US-1112-image-editor-native/README.md) |
| US-1113 | [`archive` → `View`](../tasks/US-1113-archive-editor-native/README.md) |
| US-1114 | [`category` → `View`, plus the `renderItems` widen/migrate/narrow](../tasks/US-1114-category-editor-native/README.md) |
| US-1115 | [`board-info` → `View`, plus `subscribeCatalog`](../tasks/US-1115-board-info-editor-native/README.md) |
| US-1116 | [`git-tree` → `View`](../tasks/US-1116-git-tree-editor-native/README.md) |
| US-1117 | [`video` → `View`](../tasks/US-1117-video-editor-native/README.md) |
| US-1118 | `SwitchWidget` moved; `PageToolbar.ts` deleted at 0 callers |

---

## EPIC-067 — [De-React Epic E9: the editor chrome contract](EPIC-067.md)

The contract was `TextChromeProps`' four `ReactNode` members — `children`, `toolbarContributions`,
`rightToolbarContributions`, `footerContributions` — consumed by **14 editors** and pinning every one
of them to React regardless of its own content. The qualifying evidence: seven of the fourteen already
had a vanilla `BodyView`, and their only remaining `.tsx` file was the `index.tsx` whose whole job was
to wrap that vanilla body in `<TextChrome>`. Nine tasks, all reviewed.

| Measure | Start | End |
|---|---|---|
| `<TextChrome>` call sites | 14 | **0** — the file is deleted |
| `TextChromeProps`' `ReactNode` members | 4 | **0** |
| Editors registering `EditorModule.View` | 1 | **15** |
| Editors on the `Component` arm | 30 | 15 |
| `.tsx` files in `editors/base` | 5 | **1** (`EditorError.tsx`) |
| `.tsx` files in `editors/text` | 1 | **0** |
| Renderer non-story `.tsx` | 225 | **205** |
| JSX-bearing files, renderer-wide | 126 | **106** |
| JSX-bearing files in `editors/` | 107 | **88** |
| React roots on opening a chrome editor | 2 | **0** (6 editors) / 1–2 (7 with React bodies) |

**Rule 4, honestly.** Six editors reach 0. Seven **relocate** the root into a still-React body, which
the epic predicted and which is why its closing property never promised 0 across the board. The
documented intermediate peak of 4–5 roots — inherent to the epic rather than to its ordering, since
Rule 1 keeps parents React for at least one task — is gone. `svg-view` is recorded as **unmeasured**:
`addEditorPage` does not force an editor id, so that row had measured `monaco` in both the baseline
and the first closing draft. Fourth Rule 4 instrument correction in the programme, and the same shape
as the third — make the instrument report what it actually measured.

**Four §6.1 masked defects fixed**, each surviving only on an incidental React re-render:
`RunButtons`' `hasTextSelection()`, `ContentHostFooter`'s self-documented forced re-render,
`NavPanelButton`'s three unsubscribed reads, and `ScriptPanel`'s result-less
`libraryService.state.use()`. For the first, the channel **already existed** — `MonacoEditor` has kept
`hasSelection` in state for years and `hasTextSelection()` reads it; the only thing missing was a
`bind`. Where a channel genuinely did not exist, one was added in the service that owns the private
state (`subscribeCatalogBoardsForFile`, `subscribeInstalled`), each sharing one extracted projection
with its existing hook so the two cannot drift.

**Five lessons worth carrying:**

- **Derive task order from the import graph, not from the containment relationship you are thinking
  about.** `ScriptPanel` is a child of `TextChrome` but is not the chrome's leaf; converting it first
  would have added a React root in an epic measured in roots. Caught at plan review.
- **A cast at a `mountVanilla` face means the view's props and the face's props disagree — fix the
  relationship, not the type.** A footer that *extends* a toolbar silently inherits its props type.
- **The `SlotContent` widening rule** — native class takes `SlotContent`, React face keeps
  `React.ReactNode`. E8's residue, surfacing from the other side, in three of nine tasks.
- **A deferral is a measurement with a date on it.** E1-8 was right about the mechanism and the
  magnitude and wrong only to treat a transient cost as a permanent reason. The epic's own first draft
  then made the mirror-image error in the paragraph diagnosing it.
- **Replacing a forced re-render with a channel is only complete when every *writer* goes through
  it.** The close review caught the epic's own regression: `pipe` was a plain field and
  `PagesLifecycleModel` assigned it directly, so the provider badge was missing on every normally
  opened file and appeared only after a Save As. Fixed by making `pipe` an accessor over the channel,
  which removes the class rather than the instance.

**Two live bugs surfaced during verification that the epic exposed rather than caused**, both
pre-existing and both §6.1: the grid's toolbar search not clearing (`|| undefined` erased the
"cleared" signal that three cooperating layers needed) and the script panel's splitter being
unreachable over a Grid editor (a flex item without `min-height: 0` could not shrink below av-grid's
own measured height, so the grid overflowed 162px and buried it). Tracked as US-1108 and US-1110.

**Left deliberately.** `PageToolbar`, `EditorToolbar` and `ContentHostFooter` keep React faces (6, 3
and 1 callers outside the epic); `EditorError.tsx` keeps four; the registry's `View` → `Component`
normalisation shim is still consumed by `ui/app/RenderEditorView.ts`; `applyRestProps`,
`clearRestListeners`, `bindRef` and `fillSlot` all stay. One `as unknown as` survives, in
`isTextFileHost` — a deliberate runtime duck-type probe, now a proper type predicate, whose comment
records that US-559 once silently inverted it. E8 had scheduled the rest-props bridge "to the end,
with `<TextChrome>`"; E9 shows those were never one deadline.

| Task | Title |
|---|---|
| US-1099 | [`EditorToolbarView`; delete the dead `AsyncEditor.tsx`](../tasks/US-1099-editor-toolbar-native/README.md) |
| US-1100 | [`ScriptPanelView`](../tasks/US-1100-script-panel-native/README.md) |
| US-1101 | [`ContentHostFooterView`](../tasks/US-1101-content-host-footer-native/README.md) |
| US-1102 | [`PageToolbarView` and `SwitchWidgetView`](../tasks/US-1102-page-toolbar-native/README.md) |
| US-1103 | [`TextChromeView`](../tasks/US-1103-text-chrome-native/README.md) |
| US-1104 | [`markdown`, `html`, `svg`, `log-view` → `View`](../tasks/US-1104-vanilla-body-editors-native/README.md) |
| US-1105 | [`notebook`, `mermaid`, `grid` → `View`](../tasks/US-1105-toolbar-cluster-editors-native/README.md) |
| US-1106 | [`env-vars`, `rest-client`, `monaco`, `file-diff` → `View`](../tasks/US-1106-react-body-editors-native/README.md) |
| US-1107 | [`graph`, `link-editor`, `draw` → `View`; delete the contract](../tasks/US-1107-close-the-chrome-contract/README.md) |

---

## EPIC-066 — [De-React Epic E8: delete the synthetic-event round trip](EPIC-066.md)

The contract was found by search, not inherited: **65 already-vanilla `.ts` files still imported
React**, and **48 of the React symbols they used were event types**. Converted views were typing their
public props with React event types, so a vanilla view wrapped the native event it already had via
`toPublicEvent` and its caller unwrapped it again. **All 27 wrap sites were cast, 17 with the double
`as unknown as`** — the compiler stating outright that the prop type was wrong. Six tasks, all
reviewed.

| Measure | Start | End |
|---|---|---|
| `toPublicEvent` call sites outside `react-compat.ts` | 27 | **0** |
| …using `as unknown as` | 17 | **0** |
| Exported `toPublicEvent` / `PublicEventHandler` | 2 | **0** (module-private) |
| Lossy `nativeEvent as KeyboardEvent`/`as MouseEvent` casts | 11 | **0** |
| `.nativeEvent` read sites | 32 | **1** |
| Dual-armed `"nativeEvent" in e` accessors | 2 | **1** |
| Already-vanilla `.ts` files importing React | 65 | **58** |

**Rule 4 deliberately did not move** (7 roots on a 7-page session): this epic removed event
*translation*, not roots — the root count measures the React that renders, not the React that types.
Verified live on a cold-started app: all nine converted seams deliver a real native event class
(`Dialog`, `Toolbar`, `Textarea` keydown/paste, `ListBox`/`Tree` context menu, `Input`/`Button`
keydown), asserted on `constructor.name`, which the old `Object.create(null)` Proxy could never
report.

Its central finding is a reusable test: **a `mountVanilla` face is not a React implementation.** React
never creates events for a view whose DOM node belongs to a vanilla view, so React event types on such
props are nominal for *every* caller, JSX included — which is what separates a dead dual arm from a
load-bearing one. Three self-corrections are recorded in the epic: the closing property promised to
delete `toPublicEvent`, but `applyRestProps` calls it (E8-13); the task breakdown was mis-cut three
times by directory, costing one red build, before settling on *the connected component of the
prop-type graph* as the atomic unit (E8-8); and E8-11 was stated as an absolute about the app when the
evidence only supported a claim about `uikit/` (E8-14).

- [x] [US-1093: Pilot + seam decision — `Textarea`](../tasks/US-1093-textarea-native-events/README.md)
- [x] [US-1094: The React-faced four + all 14 dialog callers](../tasks/US-1094-react-faced-native-events/README.md)
- [x] [US-1095: The `onContextMenu` prop chain](../tasks/US-1095-context-menu-native-events/README.md)
- [x] [US-1096: `components/tree-provider`](../tasks/US-1096-tree-provider-native-events/README.md)
- [x] [US-1097: `editors/link-editor` + `ui/sidebar`](../tasks/US-1097-link-editor-native-events/README.md)
- [x] [US-1098: Close the round trip](../tasks/US-1098-close-the-round-trip/README.md)

**Left deliberately:** `applyRestProps` / `clearRestListeners` (39/38 files) and `bindRef` (17) — the
JSX rest-props bridge, which goes with `<TextChrome>` at the end of the programme;
`core/events/context-menu.ts`'s dual arm, blocked behind the browser editor and the link-editor React
islands, which still dispatch genuine SyntheticEvents; and the two JSX-free `mountVanilla` faces in
`components/tree-provider`, left for a deliberate sweep of the population EPIC-064 measured rather
than renamed for sitting in a touched folder.

---

## EPIC-065 — [De-React Epic E7: the dialog/popper view registry](EPIC-065.md)

The contract was `core/state/view.tsx`'s `Views.registerView(viewId, React.FC)` /
`renderView(): ReactElement` — a dual-armed registry in exactly EPIC-063's shape, one layer down,
where **14 registrations had already moved to the vanilla arm and 4 had not**. Converting those four
deleted the file entire (`Views`, `View`, `DefaultView`, `IViewRegistration`) and collected a
residual Emotion importer. Five tasks, all reviewed.

**Rule 4: React roots per dialog 10 -> 0** across the four (`EditLinkDialog` 4, the three poppers 2
each), verified live on a restarted app with 0 empty `<svg>`. `theme/GlobalStyles.tsx` is now the
**only non-story Emotion importer in the renderer** — after this, "remove Emotion" is one file.
Non-story `.tsx` 234 -> 229. The surviving types (`IViewData`, `IDialogViewData`, `ViewProps`) moved
into `ui/dialogs/dialog-view-registry.ts`, whose folder already held every consumer, and a missing
native constructor now throws naming the `viewId` instead of silently rendering nothing.

- [x] US-1086: `BrowserDownloadsPopup` -> vanilla (the pilot)
- [x] US-1087: `EditLinkDialog` -> vanilla (model/view split)
- [x] US-1088: `ColumnsOptions` -> vanilla (hosts the data grid)
- [x] US-1089: `CsvOptions` -> vanilla (the only real state migration)
- [x] US-1090: Delete the React arm; relocate the surviving types

Four things it produced that outlast it. **(1)** *A marker is evidence only if it is set exactly when
the thing it marks exists.* The programme's own root-count instrument **over-reports**:
`data-part="react-slot"` is stamped unconditionally by `DialogView` and `TagView` before either picks
its native or React arm, so a host holding plain DOM carries the React marker. `data-react-root` is
authoritative. EPIC-063 added the second marker because a root was *invisible*; this is the same
lesson reversed, and the third instrument correction in the programme. **(2)** *Line count picks the
surface, not the order of tasks within it* — the two largest files here had **zero** React hooks
(all state already in their model, one `.use()` becoming one `bind()`), while the smallest, at a
third the size, carried the epic's only state migration. **(3)** *Whether a cadence change is safe
depends on a property of the value, not of the cadence*: the columns popover went from pushing rows
every render to pushing only on `bind`, which is safe **only** because its accessor returns the
grid's own array, making a re-push an identity no-op — copying it would have discarded in-place cell
edits. **(4)** *A live verification run against a renderer that predates a `.tsx` -> `.ts` rename is
not evidence about the code, and it can hang rather than error* — while `tsc`, lint and the dev
server all stay green. That cost two renderer wedges and a well-argued but wrong defect hypothesis;
a temporary counter in the bind that throws after N invocations and captures the first stacks settled
it in one run.

It also rejected its most plausible rival contract **on a number** rather than on taste:
`trailing?: React.ReactNode` has 5 call sites of which **0 pass JSX** — a dead arm, not a contract —
and recorded that `highlight()`'s React form cannot be collected until `graph` converts, whatever
else happens.

---

## EPIC-064 — [De-React Epic E6: delete the `ReactNode` arm from the uikit icon contract](EPIC-064.md)

The contract was `IconRef = IconName | ReactNode` in `uikit/shared/slots.ts`, with `renderIcon()`
returning a `ReactNode`. Measured live, **44 of the app's 72 React roots (61%) existed only to render
an SVG that already had a DOM builder** — every icon in the app has one. So this epic was a 205-site
call-site migration behind a type narrowing, with **no component converted**: unusual for the
programme, and the best Rule 4 payoff per unit of risk in it. Eight tasks, all reviewed.

**Rule 4: icon React roots 44 -> 0**, verified live on both of the open-epic conditions (browser tab
active and monaco active) and again with freshly opened rest-client, link-editor and graph pages.
Total live roots 72 -> 6; the survivors are the ones the epic named in advance. `icon={<XIcon/>}`
142 -> 0 and `React.createElement(XIcon)` 63 -> 0.

- [x] US-1077: Rule 4 baseline and instrument
- [x] US-1078: Extension hygiene — 26 `.tsx` -> `.ts` renames and 2 committed HMR shims deleted
- [x] US-1079: The 63 `React.createElement(XIcon)` sites in already-vanilla files
- [x] US-1080: uikit internals — the ungated `renderIcon` branches
- [x] US-1081: `editors/` icon sites, part 1 — link-editor, rest-client, graph, git-tree
- [x] US-1082: `editors/` icon sites, part 2 — browser, video, text, settings, html and the rest
- [x] US-1083: `editors/base` chrome and `ui/sidebar` icon values
- [x] US-1084: Narrow `IconRef` to `IconName | Node`; delete `renderIcon`

Four things it produced that outlast it. **(1)** *When a contract changes from a value to a resource,
every cache of that value becomes a bug* — the single-use `Node` hazard hit four times through four
mechanisms (a shared items array, a `useMemo`, a module-scope constant, a story reusing one node),
invisible to `tsc`, lint and the build every time, with the symptom being an icon vanishing *somewhere
other than* the code being changed. **(2)** *A contract can be thinner than its type suggests*:
`renderIcon` went dead without being replaced, because its only job was name -> React element and a
`ReactNode` icon needs no conversion. **(3)** *A `.tsx` count measures "files that could hold JSX",
not React* — 130 of 262 held none and 28 never mentioned React, so earlier epics' progress figures are
overstated. **(4)** An empty `<svg>` on screen is the cheap runtime tell for a migrated site naming an
icon that does not exist, since `createIconElement` falls back to one silently.

It also corrected its own closing property at close (E6-11): `SlotText` does **not** narrow, because
one caller genuinely needs React (the link-editor tooltip). That is the same over-reach E6-1 was
written to catch — predicting a sibling endpoint from an upstream one — this time committed by this
epic's own document. **E7's candidate is measured in advance** (E6-8): `core/state/view.tsx`'s
dialog/popper view registry, dual-armed at 14 vanilla registrations to 4 React, whose conversion
deletes the file entire and collects a residual Emotion importer.

---

## EPIC-063 — [De-React Epic E5: delete the React secondary-view contract](EPIC-063.md)

`ReactSecondaryViewDefinition` in `ui/secondary-views/secondary-view-registry.ts` typed a sidebar
panel as `React.ComponentType`, pinning 13 of the 14 registered panels to React through the registry
rather than through their own content. The registry is now single-armed; `LazySecondaryView.tsx`,
`SideBarPanelHeader.tsx` (with its `createPortal` seam) and `components/icons/EditorIcon.tsx` are
deleted; neither contract file imports React. **Rule 4: sidebar React roots 6 -> 0.**

Two things outlast it. It fixed the programme's Rule 4 *instrument* — a root created by a direct
`mountReactHandle` call was invisible to the `[data-part="react-slot"]` query every earlier count had
used, so a surface hosting a live React subtree could measure zero; `mountReactHandle` now marks its
host `data-react-root`. And it established the standing answer to "convert a component that still has
React callers": **one implementation with the React export reduced to a `mountVanilla` shim**, never
two parallel implementations. Both of its post-close defects (a tree at 100px, labels at 0px) were
inline-style translations that `tsc`, lint, the build and the root count were all blind to.

*(This section was missing: the epic was marked complete and removed from the dashboard, but its
summary was never added here, leaving the roadmap's `[EPIC-063](epics/completed.md)` links pointing at
nothing. Added retrospectively by EPIC-064's close.)*

---
## EPIC-062 — [De-React Epic E4: delete the React `RenderGrid` contract](EPIC-062.md)

The third editor epic scoped by the contract it deletes. `uikit/RenderGrid/` is gone, and with it
the last React virtualization engine: `uikit/VirtualGrid/` (`VirtualGridView`,
`VirtualFlexGridView`) is now the only one. Seven tasks, all reviewed.

- [x] [US-1062: LinksList to VirtualGridView (pilot)](../tasks/US-1062-linkslist-virtualgrid/README.md)
- [x] US-1063: `VirtualFlexGridView` — measured-height wrapper over `VirtualGridView`
- [x] [US-1068: remove the React roots from `PathInputView`](../tasks/US-1068-pathinput-no-react-root/README.md)
- [x] [US-1064: `NotebookBody` and its cell subtree to `VirtualFlexGrid` (carries Rule 4)](../tasks/US-1064-notebook-virtual-flex-grid/README.md)
- [x] [US-1065: `LogBody` and its cell subtree to `VirtualFlexGrid`](../tasks/US-1065-logbody-virtual-flex-grid/README.md)
- [x] [US-1066: `LinksTiles` to `VirtualGridView`](../tasks/US-1066-linkstiles-virtual-grid/README.md)
- [x] [US-1067: delete `uikit/RenderGrid/` — the closing property](../tasks/US-1067-delete-rendergrid/README.md)

**An unplanned second closing property.** `RenderGrid.tsx` imported `@emotion/styled` and was the
fourth of the four residual Emotion importers `CLAUDE.md` documented. Three remain. This epic
removed an Emotion importer as well as a grid contract.

**What it cost, and the lesson worth carrying forward — E4-15.** The notebook conversion passed
typecheck, lint, production build, and a scroll-and-geometry battery that found nothing, while the
editor was substantially broken: six user-reported interaction bugs, five of them a behaviour React
supplied implicitly that direct DOM does not and whose absence has **no declaration site**. A dead
`#avg-container` id killed the mouse wheel; `onFocus`/`onBlur` translated to the non-bubbling
`focus`/`blur` broke activation; a sandboxed iframe's focus transition is never announced; a React
component that rendered no DOM became a layout box that collapsed the expanded overlay; and
child-before-parent disposal turned a state capture into a throw that stranded the overlay. A green
build says nothing about any of them. E4-15 is the resulting pre-conversion checklist, now
generalised into `doc/standards/model-view-pattern.md`.

**Two verification lessons, also recorded.** A fixture that cannot trigger the mechanism under test
produces a green result that means nothing — the 17-link tile file fills 4x5 exactly, yields 20px
of scroll, and swept clean while exercising no recycling at all. And an invariant that asserts over
a property the *user* also manipulates will fight the user invisibly: the end-of-paint "the model
wins" scroll rule was sound in argument, cancelled every native scrollbar drag, and no programmatic
probe could ever have reproduced it (E4-13).

---

## EPIC-061 — [De-React Epic E3 — Delete `@monaco-editor/react`](EPIC-061.md)

The second editor epic scoped by the **contract it deletes**, and the first in the programme whose
close is a dependency uninstall. It took every Monaco mount point in the renderer — 13 across 11
files — and put them behind two `VanillaView` hosts the project owns.

**Closing property, delivered:** `@monaco-editor/react` has zero importers in `src/`,
`loader.config({ monaco })` is gone from `api/setup/configure-monaco.ts`, and the package is removed
from `package.json`. `npm ls @monaco-editor/react` returns empty. `monaco-editor` and
`vite-plugin-monaco-editor-esm` stay, and every language, theme, keybinding and IntelliSense concern
`configure-monaco.ts` owns is untouched.

The wrapper was taken **before** the `editors/base` chrome deliberately: each `<Editor>` is a leaf, so
a host plus a thin React face converts it under Rule 1 without touching a parent, and seven of the
eight largest remaining editors mount Monaco. The chrome is the opposite shape and stays last
(EPIC-059 E1-8). With both editor-wide contracts now gone, E4 onward fall back to line count.

**`editors/shared/MonacoEditorHostView.ts`** is new (`monaco.editor.create`); E1's
`MonacoDiffEditorHostView.ts` gained a React face and replace-and-release `setModel`. Kept separate on
purpose (E3-2) — the two editor types and model contracts differ, and a `mode` union would push a
narrowing cast into every call site.

The design work was one decision, **E3-8**: the hosts are *uncontrolled*, so `initialValue` is read
once and external writes go through `setValue` / `setDiffValues`, which own the whole policy —
compare, choose `editor.setValue` when read-only versus `executeEdits` + `pushUndoStop` when not so
the undo stack survives, and suppress the host's own `onChange` with save-and-restore. Eleven
consumers must not each rediscover that; the failure mode is the cursor jumping to the end of the
document while the user types. The mount callback therefore hands back the **host view**, not the raw
editor, since `mountVanilla` gives a React consumer no other way to reach it.

**Rule 4:** wrapper importers **13 → 0** with the package uninstalled, plus `ui/dialogs/TextDialogView.ts`'s
React root **1 → 0** — an already-vanilla view that had been calling `mountReactHandle` purely to render
the wrapper. Structural rather than performance, deliberately: **E3-6 is marked WITHDRAWN** in the epic
doc and kept in full. It had claimed 2 → 0 Monaco constructions per notebook scroll, attributing
measured churn to `MiniTextEditor`'s `key={model.id}`. `renderInfo.ts:314` keys virtualized cells by
row index, so scrolling destroys off-screen rows outright and a vanilla host dies with them — the
target was unreachable. The churn is real, its baseline is recorded, and it belongs to whichever epic
takes the removal ledger's `RenderFlexGrid` entry.

**Twelve `theme="custom-dark"` literals** were deleted rather than ported (E3-4): Monaco themes are
global, so all twelve were the same no-op repeated.

The recurring lesson across three review rounds was one shape — **the two sibling hosts meaning
different things by the same method name**: `setModel` releasing displaced models on one and leaking on
the other, controlled props on one and not the other, echo suppression on one and not the other. Each
was caught by comparing the hosts rather than by reading either alone. The close review's two false
positives had a shape too: both reasoned forward from "`onUpdate` does not reconcile content" without
checking whether the component survives the content change.

Testing owed: **empty**.

---

## EPIC-060 — [De-React Epic E2 — The embeddable bodies](EPIC-060.md)

The first editor-conversion epic, and the first scoped by the **contract it deletes** rather than by
line count. It took the five editors that supply `EditorModule.Body` — the chrome-free body another
editor can embed — so that the React `Body` arm could be removed from the registry. `mermaid` was
already converted in E1; `svg`, `html`, `markdown` and `grid` landed here.

**Closing property, delivered:** `EditorModule.Body?: React.ComponentType` no longer exists in
`editorRegistry.ts`, its EPIC-059 E1-9 normalization shim is deleted, and
`notebook/note-editor/NoteItemActiveEditor.tsx` mounts `mountVanilla(module.BodyView, …)` directly.
Notebook itself stays React — a React parent hosting a vanilla child costs zero roots (E1-8), which is
how a 2,001-line editor avoided being dragged into this epic to delete a type.

The biggest piece was **US-1048**: react-markdown's HAST→JSX step replaced by a hand-written
`hast → DOM` walker (`markdown/hast-dom.ts`), with `code`/`pre`/`img` as mounted vanilla views and
`input`/`a` as rehype HAST rewrites. `MarkdownBlock.tsx` survives as a nine-line `mountVanilla` face
for its four React call sites in `log-view` and `mcp-inspector`. Four transitive packages became
direct (`unified`, `remark-parse`, `remark-rehype`, `property-information`); `hast-util-to-dom` was
deliberately **not** adopted. **`react-markdown` and `hast-util-to-jsx-runtime` now have no importer**
outside one explanatory comment, so both are collectable in Epic F — the packages are still installed.

Every editor's `index.tsx` deliberately stays a React `TextChrome` shell, so the epic reduced the
`<TextChrome>` call-site count by **zero**, by design. The chrome drains in the epic that owns the last
shell.

**Rule 4 — React elements created per markdown render: 254 → 0.** Two measurement lessons, both worth
more than the number. `MutationObserver` **cannot measure a React initial mount** — React 19 assembles
a subtree detached and attaches it once, so an entire markdown render reads as one `addedNodes` entry
and the observer reported 0 mutations inside a 254-element tree. And the first pass mistook
page-manager slot duplication (a retained slot plus a grouped peer) for the renderer rendering twice.
Both errors had the same shape: measuring the page instead of the component.

**Scope shrank once during the epic, on evidence.** `ColumnsOptions` (394 lines) and `CsvOptions`
(107) turned out to be opened from the `grid/index.tsx` toolbar, so they are shell-owned and stay React
until the chrome epic — US-1053 became `GridBody` alone, and the epic's converted surface fell from
1,627 lines to 1,126.

**Reviews found six real problems across the epic**, which is the argument for keeping the plan-review
step un-delegated. Before implementation: an iframe whose `sandbox` would have been set *after*
`mount.tsx` attached the root, allowing one unsandboxed navigation; a queue subscription ordered before
the child its handler touches, where `ComponentQueue.subscribe` drains synchronously; and two
unexamined "is the host null" checks. After implementation: an `iframe.srcdoc` written on every update
— assigning it *navigates*, so the preview reloaded on updates that never touched the content
(**React gave "only write if changed" for free; a vanilla view loses it, and the writes that hurt are
the ones with side effects beyond their value**). At epic close, Codex's `/review` caught child DOM
built in constructors in all five new views, against an explicit rule in `uikit/CLAUDE.md:496-502` —
waved through four times because the E1 template does it too. *A template is not a specification.*

Verified live throughout rather than structurally, after E1's visual round found three defects that
structural checks had passed: geometry assertions (`offsetWidth > 0`) on every converted host in both
the full-page and embedded branches, the fixture's element count against a baseline recorded before
the conversion, scroll position surviving a full re-render, and the embedded path exercised through a
real notebook.

Tasks: US-1051 (svg + html), US-1048 (`hast → DOM` renderer), US-1052 (markdown body), US-1053 (grid
body), US-1054 (delete the `Body` arm). Follow-up: **US-1055** — `MermaidBodyView` carries the same
constructor violation from EPIC-059, left out of scope deliberately.

---

## EPIC-059 — [De-React Epic E1 — Editor foundations](EPIC-059.md)

Built the four seams every later editor conversion needs, each shipped with a consumer that uses it.
The epic existed because **nothing in `editors/` could be converted**: both registries were typed
`React.ComponentType`, `AsyncEditorView` created a React root unconditionally, and the folder held
zero `VanillaView` references.

`EditorModule` became a discriminated union with `View`/`BodyView` arms (31 `Component:` and 5
`Body:` providers unchanged), normalized in `loadModule()` before the cache write so each editor id
keeps one wrapper identity. `MonacoDiffEditorHostView` owns `createDiffEditor` and its models
directly. `editors/shared` lost React in two files. The three chrome shapes are now documented with a
pilot each — chrome-free (`toolset`), `<PageToolbar>` (`image`, 6 editors follow), `TextChrome`
(`mermaid`, 14 follow) — and the secondary-view registry gained `arm: "vanilla"`.

Rule 4: a cold compare-editor mount went **2,001 → 1,096 DOM mutations (−45%)**, plus one React root
deleted. Larger than the working assumption that Monaco's own rendering would swamp the difference —
nearly half the DOM traffic of opening a diff was the React wrapper and its reconciliation.

US-1048 (`hast → DOM` markdown renderer) was **deferred to Epic E2** under E1-5's pre-authorisation,
on evidence rather than caution: no E1 task depended on it, it cannot be split without either
regressing Monaco/mermaid output or mounting a React root per code block, and E2 converts the
markdown editor that owns it. Its plan was written first, so E2 inherits it intact.

Also fixed **US-1049** (found while verifying US-1043): closing one half of a grouped pair threw an
immer `MapSet` error and left the tab orphaned and unclosable.

**Two review rounds, both of which earned their keep.** The epic-close review found two defects the
per-task reviews had missed — `RenderEditorView` retaining a dead editor per editor change, and
`CompareEditor` leaking two Monaco text models per rebind — and its dominant finding generalised a
fix applied in only one place: `VanillaView` had no way to unregister a child, which had produced
**four** leak sites, so the primitive gained `releaseChild()` rather than four hand-patches.

Then the **visual-testing round found four more defects, three of them invisible to the structural
MCP checks that had already passed** — the epic's most transferable lesson:

1. **`loader.config({ monaco })` must stay.** US-1043 deleted it reasoning it "existed only to hand
   the React wrapper the instance" — precisely why 11 remaining wrapper consumers need it. Without
   it the loader falls back to its CDN URL, which Electron resolves as a local file path: every
   Monaco-backed editor hung at "Loading…" with `ENOENT`. The breakage was in the editors US-1043
   *didn't* touch, and none was opened during its verification.
2. **The diff widget collapsed to width 0.** Monaco's `.monaco-diff-editor` sets only `height`
   inline and relies on being a block child; inside the flex host it laid out at 38px/5px — line
   numbers visible, content clipped. The structural check had verified *presence*, never *geometry*.
3. **The `hidden` attribute was inert on every UIKit root** — a class bug, not a mermaid bug. Each
   UIKit CSS sets `display` on its root, and an author `display` rule beats the UA `[hidden]` rule,
   so all ~20 `.hidden =` toggles in converted views were silently doing nothing (the reported
   symptom was a mermaid spinner that never left). Fixed at the primitive: six UIKit stylesheets
   gained a `<root>[hidden] { display: none; }` counter-rule.
4. **`TagsInputView` never mounted its `TagView`s** — latent since Epic C2, not an E1 regression.
   Ownership was claimed and the root inserted, but `TagView` builds all its DOM in `onMount()`, so
   every chip rendered as a bare zero-width span and selecting a tag looked like a no-op. Same class
   as US-1042's `SpacerView` finding. All `claimViewOwnership` sites swept; this was the only miss.

The follow-up Codex review of those four fixes found **0 must-fix and 3 advisory documentation gaps**,
all closed: the `[hidden]` counter-rule and the "ownership does not mount" rule are now stated in
`coding-style.md`, `component-guide.md`, `model-view-pattern.md` and `uikit/CLAUDE.md`, and the stale
"`loader.config` is deleted" planning text in `de-react.md` and E1-4 was corrected. Full record:
`doc/tasks/epic59-fixes-review.md`.

- [x] US-1042: Vanilla editor registration seam + convert the `toolset` editor
- [x] US-1043: Vanilla Monaco host + convert the `compare` editor
- [x] US-1044: `editors/shared` widgets to vanilla
- [x] US-1045: Convert the `image` editor inside its React `<PageToolbar>` shell
- [x] US-1046: Convert the `mermaid` editor body inside its React `TextChrome` shell
- [x] US-1047: Secondary-view vanilla arm + convert one editor-owned panel
- [ ] US-1048: `hast → DOM` markdown renderer — **deferred to Epic E2** (E1-12), plan written

## EPIC-058 — [De-React Epic D — Shell and shared components](EPIC-058.md)

Converted `src/renderer/ui/` (dialogs, secondary views, sidebar, tabs, MainPage) and
`src/renderer/components/` (icons, page-manager, file-search, tree-provider, file-list, file-grid,
git-tree) to vanilla views behind unchanged React-facing signatures, then **flipped the application
root**: `src/renderer.tsx` is now `await bootstrap(); mount(container)`, `createRoot` appears only in
`uikit/shared/mount.tsx`, and the app creates exactly one startup React root — the `GlobalStyles`
Emotion island. Emotion importers went **21 → 4**, each with the owner D6 names; `react-dom/server`
left `src/` entirely; React portal hosts went 4 → 1, kept deliberately as the published
`SecondaryViewProps.headerRef` compatibility arm for 14 editor files; `EditorErrorBoundary` survives
as the epic's one intentional React class component (D5). `#root`'s geometry moved out of Emotion into
a static `theme/root.css` so first-paint layout no longer depends on a React commit.

Rule 4: **207 DOM writes** for a full open+close of the native confirmation dialog (MutationObserver
over `#root` and the overlay layer, stable across runs) — 153 attribute writes against 53 structural
operations. Structure is now cheap; the residual cost is unconditional attribute rewriting at ~74% of
all DOM writes in every subject measured, with a named cause in `applyPanelAttributes`. That is an
Epic E/F optimization target that no build gate or smoke test surfaces.

Verification: `npm run typecheck`, `npm run lint`, `npm run build-prod` and `git diff --check` passed
throughout. All 13 dialogs were verified to open and dismiss, including Monaco mounting with syntax
highlighting inside a dialog under the vanilla shell. The user verified at the machine what synthetic
events cannot reach: drag-reorder of pinned rows, sidebar folders and tabs, tab drag-out and
drag-between windows, splitter drags, `Ctrl+F` search routing, open animation and first-open focus,
and a cold `npm start`. Epic-level review and both documentation passes completed; the review's one
real finding (a `GitTreeView` repaint guard that could never fire, because `VanillaView.update()`
assigns `this.props` before `onUpdate` runs) was fixed, and its second was reclassified as a
documented trade-off with the follow-up filed as US-1041.

Six defects were found *after* the build gates were green, five of them variations on one hazard: a
React handler closure captures per-render constants, while a vanilla view's fields and per-row records
are mutable and shared with the synchronous notification path. That rule is now recorded in
`doc/standards/model-view-pattern.md`.

- [x] [US-1025: Icon DOM builders — 54 language icon bodies + `BoardGlyph`; `react-dom/server` out](../tasks/US-1025-icon-dom-builders/README.md)
- [x] [US-1026: `components/icons/` vanilla DOM views](../tasks/US-1026-components-icons-vanilla-views/README.md)
- [x] [US-1027: `components/file-list/` + `components/file-grid/`](../tasks/US-1027-file-list-grid/README.md)
- [x] [US-1028: `components/file-search/` (first `RenderGrid` collection)](../tasks/US-1028-file-search/README.md)
- [x] [US-1029: Tree primitive seams for tree-provider](../tasks/US-1029-tree-provider/README.md)
- [x] [US-1037: `components/tree-provider/TreeProviderView`](../tasks/US-1037-tree-provider-view/README.md)
- [x] [US-1038: `components/tree-provider/CategoryView`](../tasks/US-1038-category-view/README.md)
- [x] [US-1030: `components/git-tree/` vanilla GitTree view](../tasks/US-1030-git-tree-vanilla/README.md)
- [x] [US-1031: `components/page-manager/` portal hosts → `appendChild`](../tasks/US-1031-page-manager-append-child/README.md)
- [x] [US-1032: `ui/dialogs/` host, 13 dialogs, and the popper path](../tasks/US-1032-dialogs-vanilla/README.md)
- [x] [US-1033: `ui/secondary-views/` host and the registry contract](../tasks/US-1033-secondary-views-vanilla/README.md)
- [x] [US-1034: `ui/sidebar/` and `MenuBar` (two slices)](../tasks/US-1034-sidebar-menubar/README.md)
- [x] [US-1035: `ui/tabs/`](../tasks/US-1035-tabs-vanilla/README.md)
- [x] [US-1036: `ui/app/` and the root flip](../tasks/US-1036-app-root-flip/README.md)

---

## EPIC-057 — [De-React Epic C4 — AVGrid → av-grid](EPIC-057.md)

Replaced the final React grid consumers with the pinned `av-grid@2.2.3` engine through the
`uikit/DataGrid/` boundary, then removed the legacy `uikit/AVGrid/` namespace: 30 files and
4,917 lines, including nine Emotion importers and the final Rule 6 exemption. The dependency,
layered CSS bridge, persisted grid state, context-menu handoff, cell tooltip/ellipsis, Git Tree
renderer, remaining app consumers, and architecture indexes are all aligned to the replacement.

Verification: `npm run typecheck`, `npm run lint`, `npm run build-prod`, and `git diff --check`
passed. Epic-level review, developer-documentation, and user-documentation checks completed; the
new `GridEditor.ts` non-null assertion found in review was replaced with an explicit lookup guard.
Closure uses current-version verification only: historical comparison and the pre-migration Rule 4
measurement were waived by the user, and Menu behavior was user-tested. The broader consumer smoke
list remains a documented manual follow-up because the live Persephone MCP was unavailable after
the renderer restart.

- [x] [US-1019: Adopt av-grid — dependency, `--p-*` bridge, layered CSS, mounting shim, story, and the Rule 4 “before” numbers](../tasks/US-1019-adopt-av-grid/README.md)
- [x] [US-1020: `editors/grid/` — the JSON/CSV grid editor](../tasks/US-1020-grid-editor-av-grid/README.md)
- [x] [US-1021: `components/git-tree/` — the commit history grid on av-grid](../tasks/US-1021-git-tree-av-grid/README.md)
- [x] [US-1024: the cell-overflow tooltip, restored once in `DataGridView`](../tasks/US-1024-cell-overflow-tooltip/README.md)
- [x] [US-1022: the four remaining consumers — `FileGrid`, `EnvVarsBody`, `GraphDetailPanel`, `GridOutputView`](../tasks/US-1022-remaining-grid-consumers/README.md)
- [x] [US-1023: Delete `uikit/AVGrid/` and close Epic C](../tasks/US-1023-delete-avgrid/README.md)

---

## EPIC-056 — [De-React Epic C3 — Virtualization engine, data views and dropdowns](EPIC-056.md)

Converted the vanilla virtualization engine, data views, and dropdown composites while preserving
their React-facing APIs: `VirtualGrid`, `ListBox`, `Tree`, `MultiListBox`, `Select`, `MultiSelect`,
and `Autocomplete`. The epic recorded the memo-dependency and model-driver rules, removed the C3
effects, drained `Panel` from production `uikit/` consumers, and measured the final Rule 4 search
interaction at 217 raw MutationObserver records (19 in the anchor pane and 198 in the overlay layer).

Verification: `npm run typecheck`, `npm run lint`, and `git diff --check` passed. Epic-level architecture
review, developer-documentation, and user-documentation checks completed; review findings around
vanilla lifecycle guards and native event handling were fixed before closure.

- [x] [US-1013: The vanilla virtualization engine — `VirtualGrid`](../tasks/US-1013-virtual-grid-engine/README.md)
- [x] [US-1014: `ListBox`, `ListItem`, `SectionItem` — the first data view on the vanilla engine](../tasks/US-1014-listbox-vanilla/README.md)
- [x] [US-1015: `Tree` — rows, DnD, keyboard, and the largest model in `uikit/`](../tasks/US-1015-tree-vanilla/README.md)
- [x] [US-1016: `MultiListBox` — checkbox rows and the select-all header](../tasks/US-1016-multilistbox-vanilla/README.md)
- [x] [US-1017: `Select` — four effects, async item loading, and the Rule 4 number](../tasks/US-1017-select-vanilla/README.md)
- [x] [US-1018: `MultiSelect` and `Autocomplete` — the last two dropdowns and `Panel`'s eviction](../tasks/US-1018-multiselect-autocomplete-vanilla/README.md)

---

## EPIC-055 — [De-React Epic C2 — Floating layer and composites](EPIC-055.md)

Converted the floating layer and composite UIKit surfaces to vanilla views behind their existing
React-facing APIs: Popover, Menu, Dialog, root-mounted notifications and progress, chrome widgets,
composites, Minimap, and ImageViewport. The epic also completed the UIKit `@floating-ui/dom` move,
exercised the model driver across four models, established native submenu/attachment ownership, and
recorded the final Rule 4 mutation measurement. Menu behavior was smoke-tested in Storybook; the
historical all-React comparison was explicitly waived because closure only required verification of
the new implementation.

Verification: `npm run typecheck`, `npm run lint`, and `git diff --check` passed. Epic-level review,
developer-documentation, and user-documentation checks completed; review findings were fixed before
closure. The final Rule 4 Menu-story measurement was 125 raw MutationRecords across the live-preview
and overlay roots (6 + 119) using the pinned observer options.

- [x] [US-1005: `Popover` — vanilla floating root on `@floating-ui/dom`](../tasks/US-1005-popover-vanilla-floating-root/README.md)
- [x] [US-1006: `Menu` and `WithMenu` — `openMenu` attachment and recursive submenus](../tasks/US-1006-menu-vanilla-recursive/README.md)
- [x] [US-1007: `Dialog` and `DialogContent` — focus trap and backdrop](../tasks/US-1007-dialog-vanilla-focus-trap/README.md)
- [x] [US-1008: `Notification`, `AlertItem`, and `AlertsBar` — vanilla root-mounted alerts](../tasks/US-1008-notification-vanilla-alerts/README.md)
- [x] [US-1009: `Progress` — `ProgressOverlay`, its first story, and `Panel`'s eviction](../tasks/US-1009-progress-vanilla-overlay/README.md)
- [x] [US-1010: `Toolbar`, `Splitter`, `Breadcrumb`, `CollapsiblePanelStack` — vanilla chrome](../tasks/US-1010-chrome-vanilla-conversions/README.md)
- [x] [US-1011: `SplitButton`, `TagsInput`, `DateInput`, `CategoryList`](../tasks/US-1011-composite-vanilla-conversions/README.md)
- [x] [US-1012: `Minimap` and `ImageViewport` — canvas views and their first stories](../tasks/US-1012-canvas-vanilla-conversions/README.md)

---

## EPIC-054 — [De-React Epic C1 — Foundation and primitives](EPIC-054.md)

Established the foundation for converting UIKit components from React to direct DOM ownership
behind unchanged React-facing APIs. The epic closed the `uikit/` import boundary, added vanilla
view lifecycle and React-compatibility contracts, introduced layered component CSS and the DOM
icon path, moved Tooltip to a framework-neutral attachment, and converted the C1 component set:
Button, IconButton, TruncatedText, SegmentedControl, the stateless leaves, Checkbox, Slider,
RadioGroup, Input, Textarea, and Panel's styling surface. Storybook and running-app smoke checks
covered the converted component paths and representative editor/shell callers; no intended
user-facing workflow change was introduced.

Verification: `npm run typecheck`, `npm run lint`, and `git diff --check` passed. Epic-level review,
developer-documentation, and user-documentation checks completed. The review's two Tooltip
non-null assertions were fixed before closure; no other implementation blockers remained.

- [x] [US-995: Rule 6 — close the `uikit/` → app-layer imports and lint the boundary](../tasks/US-995-uikit-boundary-lint/README.md)
- [x] [US-996: The vanilla UIKit contracts — CSS, slots, React-compat helpers, Rule 4 baseline](../tasks/US-996-vanilla-uikit-contracts/README.md)
- [x] [US-997: DOM icon path — rewrite the 116 icon bodies as markup; dual-face factories](../tasks/US-997-dom-icon-path/README.md)
- [x] [US-998: `Tooltip` — attachment-based, on `@floating-ui/dom`](../tasks/US-998-tooltip-attachment/README.md)
- [x] [US-999: `Button`, `IconButton`, `TruncatedText`, `SegmentedControl` + the Rule 4 after-number](../tasks/US-999-button-cluster/README.md)
- [x] [US-1000: `Text` and the stateless leaves — `Label`, `Tag`, `SelectableRow`, `Divider`, `Dot`, `Spacer`, `Spinner`, `ProgressBar`](../tasks/US-1000-text-stateless-leaves/README.md)
- [x] [US-1001: `Checkbox`, `Slider`, `RadioGroup`](../tasks/US-1001-checkbox-slider-radio-group/README.md)
- [x] [US-1002: `Input` and `Textarea`](../tasks/US-1002-input-textarea/README.md)
- [x] [US-1003: `Panel` — Emotion to CSS, no vanilla face](../tasks/US-1003-panel-css/README.md)

---

## EPIC-053 — [De-React Epic B — The reactive foundation and the boundary](EPIC-053.md)

Established the framework-neutral reactive foundation and the React/vanilla boundary: zustand was
removed from the state layer; vanilla view ownership, binding, keyed DOM reconciliation, subtree
swapping, model drivers, and two-way mount adapters were added; and the Storybook PathInput pilot
converted one UIKit component end to end behind its unchanged React-facing API. The pilot also
validated nested React ownership, portal disposal, controlled updates, keyboard and mouse behavior,
and the co-located CSS path. No user-facing documentation change was warranted.

Verification: `npm run typecheck`, `npm run lint`, and `git diff --cached --check` passed. The
converted Storybook PathInput produced 3 MutationObserver records for one ArrowDown with its
popover open under the documented observer options and reset point. Epic-level review,
developer-documentation, and user-documentation checks completed.

- [x] [US-985: Drop zustand from the state layer](../tasks/US-985-drop-zustand/README.md)
- [x] [US-986: Vanilla view lifecycle and `bind()`](../tasks/US-986-vanilla-view-lifecycle/README.md)
- [x] [US-987: Keyed-list and subtree-swap helpers](../tasks/US-987-structural-helpers/README.md)
- [x] [US-988: Model driver — the non-React `useComponentModel`](../tasks/US-988-model-driver/README.md)
- [x] [US-989: `mountVanilla` / `mountReact`](../tasks/US-989-boundary-adapters/README.md)
- [x] [US-990: Storybook vanilla render path](../tasks/US-990-storybook-vanilla-render/README.md)
- [x] [US-994: Retire the Storybook side-by-side preview](../tasks/US-994-retire-side-by-side-preview/README.md)
- [x] [US-991: Pilot — one component converted end to end](../tasks/US-991-pathinput-pilot/README.md)
- [x] [US-992: Authoring rules for vanilla views](../tasks/US-992-vanilla-view-authoring/README.md)

---

## EPIC-052 — [De-React Epic A — Style and token foundation](EPIC-052.md)

Established the styling and token foundation for the de-React roadmap: durable Emotion and
inline-style inventories, CSS custom properties for UIKit tokens, shared theme state and color
resolution, Emotion-to-CSS conventions, and a completed Spinner CSS pilot. The public board theme
contract and existing user workflows remain unchanged.

Verification: `npm run typecheck`, `npm run lint`, and `git diff --check` passed. Epic-level review,
developer documentation, and user-documentation checks completed; no user-facing documentation
change was warranted.

- [x] [US-980: Relocate the Emotion and inline-style inventories](../tasks/US-980-styling-inventory-relocation/README.md)
- [x] [US-981: Emit `uikit/tokens.ts` as CSS custom properties](../tasks/US-981-token-css-vars/README.md)
- [x] [US-982: One theme state and one color resolver](../tasks/US-982-theme-state-resolver/README.md)
- [x] [US-983: Emotion-to-CSS conventions](../tasks/US-983-emotion-to-css-conventions/README.md)
- [x] [US-984: Pilot — convert Spinner to co-located CSS](../tasks/US-984-spinner-css-pilot/README.md)

---

## EPIC-051 — [De-React Epic P — Preparation (React-side)](EPIC-051.md)

Completed the React-side preparation work for the de-React roadmap. UIKit, shell, and coupled
component slots now use neutral icon names and text types; local model-owned state, imperative
handles, contexts, and effects were moved to explicit model boundaries; ordinary DOM refs use
React 19 ref props; body overlays share one host; and the Emotion and inline-style surfaces were
inventoried for Epic A. The epic remains React-only and introduces no user-facing workflow change.

Verification: `npm run typecheck`, `npm run lint`, and `git diff --check` passed. Epic-level review,
developer documentation, and user-documentation checks completed; no user-facing documentation
change was warranted.

- [x] [US-965: Icon name registry + neutral slot types (foundation)](../tasks/US-965-icon-registry-slots/README.md)
- [x] [US-966: Neutral slots — UIKit primitives and inputs](../tasks/US-966-neutral-slots-primitives/README.md)
- [x] [US-967: Neutral slots — UIKit list and data components](../tasks/US-967-neutral-slots-list-data/README.md)
- [x] [US-968: Neutral slots — UIKit containers and floating layer](../tasks/US-968-neutral-slots-containers-floating/README.md)
- [x] [US-969: Neutral slots — `ui/` and `components/`](../tasks/US-969-neutral-slots-shell/README.md)
- [x] [US-970: Lift local `useState` into models](../tasks/US-970-lift-state-models/README.md)
- [x] [US-976: Below-threshold local state](../tasks/US-976-below-threshold-state/README.md)
- [x] [US-971: Imperative handles → model methods / `ComponentQueue`](../tasks/US-971-imperative-handles/README.md)
- [x] [US-977: `forwardRef` → React 19 ref props](../tasks/US-977-react19-ref-props/README.md)
- [x] [US-972: React context → explicit model references](../tasks/US-972-explicit-model-references/README.md)
- [x] [US-973: Route `document.body` portals through one host](../tasks/US-973-portal-host/README.md)
- [x] [US-974: Move model-owned effects into `TComponentModel.effect()`](../tasks/US-974-effects-into-model/README.md)
- [x] [US-978: Move graph effects into existing models](../tasks/US-978-graph-effects/README.md)
- [x] [US-975: Emotion usage inventory](../architecture/styling-inventory.md)
- [x] [US-979: Inline style inventory](../architecture/styling-inventory.md)

---

## EPIC-050 — [Folder-content view — multiselect and drag-and-drop](EPIC-050.md)

Brought the folder page — the `CategoryEditor` / `CategoryView` pair that opens when a folder is clicked in the Explorer panel — up to the parity EPIC-049 gave the tree beside it. It is the Explorer's "list pane", and it was the poor relation: one row selectable, every action singular, and nothing draggable in or out. Dropping files from Windows Explorer onto it did not file them into the open folder at all; the window-level fallback in `GlobalEventService` opened them as tabs. The feasibility work found the same shape EPIC-049 found: the set-shaped operations all existed, but they were keyed on tree nodes. Crucially the four drop actions read only **two** things from a node — a target directory path and a display title — so they were *target-shaped, not tree-shaped*, and could be lifted into a shared module behind a `DropTarget` of `{ path, title }` with the tree keeping a thin node→target adapter. That observation is what made the extraction a standalone task rather than a copy.

Range selection was **easier** here than in the tree, and worth recording as the counterexample to EPIC-049's central tension. `Tree` had to own Shift+click ranges because only it knew the flat visible row order, which collided with UIKit Rule 2. In this view the visible order *is* `filteredItems`, which the model already holds — so the model computes ranges itself, the list and tile components stay dumb (render from a set, forward the click event), and no protocol was needed. The lesson is that Rule 2's tension was never about ranges; it was about a primitive that owns layout the consumer can't see.

Three of the epic's edits were made only because a "no behavior change" claim was checked mechanically rather than by reading. The extraction was verified by pulling every user-visible string literal out of `git show HEAD:TreeProviderViewModel.tsx` and out of the new modules and diffing the two sets — all differences were interpolation-variable renames producing identical output. And returning `boolean` from the new `deleteItemsBatch` would have *changed* behavior: for a single item it would have reported success, making the tree clear its selection and re-list a second time, neither of which happens today. It returns `"none" | "single" | "batch"` so the caller's existing per-item path stays untouched. One pre-existing bug found during the extraction was deliberately **preserved and backlogged** rather than fixed — in a link-collection provider, a drag of only directories leaves `moveItemsInto` with nothing to move, so it returns `false` and the caller never re-lists. Fixing it inside a no-behavior-change refactor would have made the refactor unreviewable.

Selection revealed two ordering traps. Because `selectedIds` *replaces* `selectedId` rather than supplementing it, the initially-selected row painted nothing until the seed ran on first render too, not only on external change — and the seed then has to skip when the primary is already in the set, or Ctrl-deselecting the primary snaps it back. Separately, Ctrl+click must **append** to the set rather than rebuild it from the visible order: rebuilding silently drops hrefs hidden by the search filter, and those must survive so clearing the search brings them back highlighted. Set order carries no meaning here, which is what makes appending safe. A third trap was `this.isFirstUse` read *inside* the deferred callback, where both lifecycle flags have already been reset — it has to be captured first.

Drag-and-drop was shaped almost entirely by one browser constraint: **Chrome's protected mode releases only `dataTransfer.types` during `dragenter`/`dragover`**, never the payload. So the planned per-row `canDrop(item, payload)` at hover time is impossible, and the design split into a type-level `acceptsDrag(dataTransfer)` at hover plus a payload-level `canDropOn(item, payload)` at drop. Every check that needs the actual items — above all "is this folder inside the set being dragged" — therefore fails at drop time with a message rather than by refusing the hover. That is now written into `trait-system.md`, because it is a property of the platform, not of this view.

The whitespace-versus-row highlight was solved without stopping propagation on enter/leave: rows let those events bubble so the view's own drag-enter counter stays positive for the entire time the drag is inside it, and whitespace paints only when "inside the view AND no row targeted". The counter is keyed per target rather than tracked with a boolean because child elements fire spurious `dragleave`; the spec's ordering (dragenter on the new target before dragleave on the old) is what keeps the root counter off zero when crossing between rows. Only `drop` stops propagation — and it must, for whitespace drops as much as row drops, or dropping into the open folder *also* opens every file as a tab.

Two items were cut during implementation rather than shipped. `ListItem`'s new drop highlight lost to the focused-selection override, which is more specific by one attribute; rather than an `!important`, the override's own `rowMatch` was narrowed with `:not([data-drop-active])` at the source, which is inert for every existing consumer and makes the two rules mutually exclusive by construction. And a plural trait-drag payload prop was written for the list components, then **removed as dead code**: the native-drag override is gated to the file provider and returns `true` for every draggable row there, so the trait payload is only reachable when nothing is draggable. The tree needs both paths only because it also serves Mneme and link-collection providers. Nothing dims during a drag-out either, and that is not an omission — `webContents.startDrag` takes over the gesture, so no `dragend` ever reaches the row and any dim would risk sticking.

A late unplanned task closed the asymmetry that testing exposed: a drop made in the folder page refreshed the tree, but a move made in the tree left the folder page stale. The tree had had live refresh all along through an opt-in, duck-typed `provider.watch` — deliberately not on `ITreeProvider` — and the folder page simply never subscribed. Subscribing was ~15 lines, and it came free for Mneme folder pages (an agent writing a note now shows up) and link categories. It needed no care over flicker or stale selections only because `loadItems` already gated the loading placeholder on an empty listing and already re-validated the selection against the new listing.

The review's one must-fix had nothing to do with the feature. `CategoryViewModel.tsx` contained a raw NUL byte in a string literal where an escape sequence was intended, which made **git treat the whole file as binary** — losing line-level diff and blame from that commit onward. It had been visible for two tasks as a `binary file matches` notice from a grep and was read past. The fix also removed the reason for the sentinel: the drag-enter counter is now keyed `string | null` with `null` meaning the view itself, so no "impossible href" has to be manufactured and the question of whether a path could collide with it does not arise. Multi-select, drops and drag-out are gated on one helper (`supportsMultiSelect` → `type === "file"`), so the archive, Mneme, Link-collection and Boards folder pages and the Links editor's own list and tile views are untouched; widening is a one-line change.

- [x] US-941: Extract EPIC-049's plural + drop actions into shared, target-shaped helpers — `plural-actions.tsx`, `tree-drop-actions.ts`, `DropTarget`, three-valued `deleteItemsBatch`
- [x] US-942: `CategoryView` multi-selection — Ctrl/Shift/Ctrl+A/Delete/Escape; plural menu that skips Layer 2; transient `selectedHrefs`
- [x] US-943: Drop into the folder page — whitespace and folder-row targets; `acceptsDrag`/`canDropOn` split; `ListItem` `dropActive`
- [x] US-944: Drag out of the folder page — native OS drag of N paths; internal move onto a folder row needed no code
- [x] US-945: Live-refresh the folder page from the provider's `watch`

---

## EPIC-049 — [Explorer file-tree multiselect](EPIC-049.md)

Gave the Explorer panel's file tree a real multi-selection — Ctrl+click, Shift+click, `Ctrl+A`, and Shift with the arrow/Home/End/Page keys — so every action it already offered now works on a set: Copy Paths, Cut/Copy to the Windows clipboard, Delete, dragging out to Windows Explorer or Teams, dragging into a Links page or another Persephone window, and moving by drop inside the tree. The feasibility work found that almost none of this was an I/O problem: `clipboardWriteFilePaths`, `startOsFileDrag`, `copyPathsInto`, `LinkDragData.items` and the provider `importFiles`/`importLinks`/`moveToCategory` entry points were **already plural** and were being handed one-element arrays. The single-item restriction lived in exactly two places — the UIKit `Tree` primitive and `TreeProviderViewModel.selectedValue: string | null` — plus one genuine gap: the file-provider branch of `moveItems` was gated on `remaining.length === 1`, so a multi-item internal move silently did nothing. The selection **visuals** needed no work at all, because the focus-aware selection contract is pure CSS keyed off each row's own `[data-selected]`; N rows paint correctly and `[data-active]` stays singular, which is exactly Explorer's "many selected, one focused".

The design tension worth recording is that range selection is defined over the *flat visible row order*, which only the Tree knows, while UIKit Rule 2 forbids a primitive owning its primary value. The resolution: the Tree stores **no** selection. It reads the current set back through the consumer's existing `isSelected` predicate, one call per visible row, computes the result of the gesture, and emits it through a new `onSelectionChange`; the consumer stores it and keeps painting through `isSelected`. The only thing the Tree retains is a transient **anchor**, stored by row *value* rather than index so it survives a re-list. Testing `shiftKey` before `ctrlKey` made Ctrl+Shift+click a range extend with no extra branch. That pattern is now written into Rule 2 itself, because the rule as stated read as forbidding it.

Two user decisions shaped behavior more than the mechanics did. **Nested selections are pruned before every operation, not just on-disk ones** — a folder and a file inside it are one operation input, the folder — which matters most for the payloads that leave the app: handing Windows three overlapping paths would make Explorer copy the inner files twice. One shared helper does the pruning at each action's entry point, and its consequence is deliberate and visible: the count in a menu label or confirm is the *pruned* count, so a folder plus two files inside it deletes as "1 item" while three rows stay highlighted. **Only visible rows may stay selected** — collapsing a folder deselects everything under it, so the user always sees the whole selection and nothing hides in a closed folder. That one also resolves a latent inconsistency rather than adding a rule: `buildTree` re-lists children only for expanded paths, so a selection surviving a collapse would have referenced nodes absent from the tree data, and would have been silently dropped at action time. The prune is scoped to explicit collapse gestures and deliberately **not** wired into `buildTree`, where it would race the reveal path — navigation sets the selection to a file moments before its ancestors are expanded.

The implementation's own surprises were in restore and in drag feedback. Persistence was planned as verify-only, but the first-use seed preferred the incoming `selectedHref` whenever it was set — and the Explorer *always* sets it from its own navigation state on restart, so the persisted plural set would never have been read; the rule now restores the set when it is consistent with the navigated file and lets navigation win otherwise. Pre-epic state carrying only a single href still restores as a one-item selection. On the drag side, `webContents.startDrag` renders the icon of the first path only and Electron exposes no way to compose a count badge, so a multi-file drag looks like a single-file drag while in flight — accepted and documented rather than worked around. Two limits are worth knowing for future work: the "can't drop a folder into itself" guard suppresses the drop highlight for in-process trait drags only, because a native OS drag exposes no paths during `dragover`, so for the Explorer that guard lands at drop time as a warning; and the primary row that `Ctrl+V` targets is the bottom-most selected row rather than literally the last-clicked one, since the Tree emits sets in visible order. Multiselect is an **opt-in prop** passed by `ExplorerSecondaryView` alone — the Mneme, Archive, Links, Script-library, Boards and Menu Bar trees take the single-element path unchanged, and the non-file provider with a `rename` (Mneme) keeps its own provider-level single-item move. Reviewed at epic level: no must-fix findings.

- [x] US-937: UIKit `Tree` multi-selection API — `multiSelect` + `onSelectionChange`; value-based transient anchor; Ctrl/Shift/Ctrl+A/Shift+Arrow gestures; story toggle
- [x] US-938: `TreeProviderView` plural selection + actions — `selectedValues`; `operationItems` pruning; plural menus + batch delete; `pruneSelectionToVisible`; `copyPathsToOsClipboard`
- [x] US-939: Multi-item drag-out and drop — `dragItemsFor`; batch file-provider move via `copyPathsInto`; plural drop guards
- [x] US-940: Explorer wiring, persistence, docs — `multiSelect` opt-in; Layer-3 `(event, selection)` bail-out; plural-selection restore fix; developer + user docs

---

## EPIC-048 — [Persephone UI Guidance for Agents](EPIC-048.md)

Gave an agent connected over MCP the ability to *explain* Persephone, not just drive it. An agent could already snapshot the app window and click it; nothing told it what the header's glyph does, what the corner indicators are, or which of the 32 editors exists — so "where do I change the language of this tab?" got an answer reverse-engineered from a DOM dump, if at all. Two new guides fix that (`read_guide("ui")` for the chrome, `read_guide("ui-editors")` for the catalog), plus a **highlight overlay** so the agent can point at an element instead of describing it.

The epic introduced **no new addressing scheme**: `data-name` was already the convention across ~65 files, so the work was completing coverage on the shell (14 attributes added, nothing renamed) and writing it down as a contract in `doc/architecture/ui-element-contract.md` — a `data-name` quoted in a guide is agent-facing API, and renaming one is a documentation change. Live verification earned its keep three times over facts that would have shipped a wrong guide: `tab-language` does not exist on `noLanguage` editors, a **pinned tab renders no title text** (so titles must come from `list_pages`), and `[data-name="menu-bar"]` is always in the DOM (`display: none` when closed), so its presence says nothing about whether the menu is open.

The overlay (`assets/agent/ui-highlight.js`) is one dependency-free module serving two callers — `app.ui.highlightElement()` in the app window, the same file pasted into `browser_evaluate` for boards. Its look is **fixed in every theme by design**, not by limitation: a callout styled to match the surrounding theme is indistinguishable from Persephone's own UI, and the user must be able to tell an agent placed it. That rules out reading a board's `--p-*` tokens and is a documented exception to the no-hardcoded-colors rule. Two implementation findings: `app-asset://` maps the URL's **host** to a directory, so a top-level asset has no reachable URL; and detach-only removal was insufficient, because Persephone hides the Menu Bar with `display: none` rather than unmounting — the first version left a ring floating over empty space in the single most likely flow. Removal is now visibility-based.

Reviewing the highlight recipe corrected a security claim carried since epic creation: `app-asset:` is unreachable from web pages **not** because of `BLOCKED_PROTOCOLS` — that guards only `will-navigate` and would not stop a `fetch` — but because the protocol handler is registered on two sessions that browser pages are not in. Verified live from an `https://` origin (fetch, XHR, `<script src>`, `<iframe src>` all fail). Left standing, someone could have deleted the entry as redundant or trusted it to stop a fetch. Consequently **browser-page highlighting is documented as unsupported**, with a plain-border fallback, rather than as a nice-to-have.

A late task covered the case the guides all assume away — a **fresh install with MCP off and an agent that has never heard of Persephone**. The obvious plan died on investigation (nothing auto-loads an install directory into an agent's context), but `extraResources` already ships every guide to `resources/assets`, so they are readable with no MCP and no network; `build/README.txt` mainly exists to say so. The real blocker was that settings edited on disk *looked* like they worked: `_onChanged` fired only from `set()`, so an external edit flipped `mcp.enabled` and the Settings toggle while the server stayed down. `loadSettings` now diffs and emits on watcher reloads only — the initial load must not, or startup starts MCP and Mneme twice. That made every window actuate global settings, which the audit showed was already true at startup and safe, but it did surface a genuine race: `startMcpHttpServer` guarded on a variable assigned inside the `listen` callback, so two callers both reached `listen()` on the same port.

QA against Haiku produced the epic's most transferable lesson. Six of nine scenarios passed; the three failures had nothing in common except that **no guide was read**, though each guide held the answer. Strengthening the routing instruction was tried and verified live — and changed nothing, because instructions are part of what gets skipped. What did work was **naming the thing precisely**: "language" can read as UI locale, document language, or Monaco's syntax mode, and clarifying it to "the Monaco syntax-highlighting mode" took one case from 42 tool calls without opening a guide to 15 with the guide read first. The same test passes first try on Sonnet. So ambiguity, not indifference, is what sends a weak model exploring — and exploring is expensive, since it improvises against live state (one run closed the user's tab while guessing). The structural remedy for genuinely unambiguous cases is backlogged.

- [x] [US-924: Element addressing contract — complete `data-name` coverage](../tasks/US-924-ui-element-contract/README.md)
- [x] [US-925: `assets/agent/ui-highlight.js` overlay + `app.ui.highlightElement`](../tasks/US-925-ui-highlight-overlay/README.md)
- [x] [US-926: `assets/mcp-res-ui.md` — UI overview guide + MCP wiring](../tasks/US-926-ui-guide/README.md)
- [x] [US-927: `assets/mcp-res-ui-editors.md` — editor catalog](../tasks/US-927-ui-editors-guide/README.md)
- [x] [US-929: Agent cold start — settings apply on disk change, install-dir README, settings docs](../tasks/US-929-agent-cold-start/README.md)
- [x] US-928: QA scenarios + user docs

---

## EPIC-047 — [Move the PDF Viewer to a Published Board](EPIC-047.md)

Moved PDF viewing out of the installer and into the published-boards catalog, deleting the built-in `pdf-view` editor and the **21 MB** of vendored pdf.js it served (`assets/pdfjs/`) — a payload every user downloaded whether or not they ever opened a PDF, and almost entirely third-party code, since the built-in viewer was a thin `<object>` around pdf.js's own stock `viewer.html`. The replacement `pdf-viewer` board hosts that **same unmodified stock viewer** in a nested same-origin iframe, so the UI users see is unchanged (search, thumbnails, outline, zoom/fit, rotate, text layer, print, Save-as) at a ~3.5 MB opt-in download, and pdf.js security fixes now arrive as board updates rather than app releases. The gating risk was the board sandbox: no catalog board had ever used a Worker, WebAssembly, or a nested iframe under `BOARD_CSP`. Rather than spike it with a throwaway, the v1 board *was* the spike — it found that `frame-src` and `'wasm-unsafe-eval'` were blocked while the Worker had been permitted all along (`worker-src` falls back through `child-src` to `script-src 'self'`), so `BOARD_CSP` gained `frame-src 'self'`, an explicit `worker-src 'self'`, and `'wasm-unsafe-eval'` — all same-origin, admitting no remote content.

The hard part was **non-local sources**: archive-embedded and `http(s)` PDFs had to keep working, and the epic first planned a mirrored read-only `editorKind: "binary-host"` modeled on the text content host. Investigation superseded that twice over. A simple custom-editor board already receives the page's live content pipe (it was disposing it unread), and `IContentHost.content` is a `string`, so a binary variant would have been parallel code rather than reuse. What shipped instead is much smaller: **`getFilePath()` always resolves to a readable LOCAL path** — a plain local file returns its own path with no I/O, anything else is materialized from the pipe into a memoized read-only cache file — plus one declarative manifest gate, **`editorSources: "local" | "any"`**, because the resolver refuses a non-local source to a simple board *before* any board code runs and so could not be an opt-in-by-calling API. Default-closed deliberately: boards reading via `readFile` would break on those sources, and the failure is invisible to an author who only tests local files. The payoff is that the board carries **no source-specific code at all** — one code path proven live across a local file, `pdfs.zip!sample.pdf`, and a remote `https` PDF. Two further resolution gates surfaced during implementation that the investigation had missed (the Layer 2 file resolver skipped the merged resolver for a non-local url; the http resolver picks its editor from a hardcoded table), the latter fixed narrowly so a board may override the table's editor but the table still decides browser-vs-content. Parity was confirmed against the built-in viewer over a written checklist before anything was deleted, including the two items that were open questions rather than expectations — print and Save-as from inside a `board://` frame both work with no bridge support.

Removal was deliberately last, and several degradations were accepted rather than papered over with permanent compat code: a persisted `pdf-view` tab is dropped on the one upgrade that removes the editor, a saved link with `target: "pdf-view"` gets no remap, and the `"pdf-view"` scripting/MCP editor id is removed with no alias. The one place that did earn new logic is remote-URL routing, where the http extension table doubles as the browser-vs-content decision: `.pdf` keeps an entry carrying `browserFallback: true` with no editor, so a claiming board still wins and, without one, Chromium's own viewer renders it in a browser tab. `safe-file://` — a privileged scheme that existed solely to feed pdf.js — came out with it. The board's `editorPriority` stays at the published 200 (nothing built-in claims `.pdf` any more, so it has no tie to lose); the drop to 100 is ladder hygiene staged unreleased, avoiding a version bump and a `minAppVersion` constraint for a change no user could observe. Reviewed at epic level with no must-fix findings.

- [x] US-904: Prune shipped pdf.js dead weight (`.map` files, sample PDF) from `assets/pdfjs/`
- [x] US-905: `pdf-viewer` board v1 (local files only) — doubles as the `BOARD_CSP` spike
- [x] US-906: Widen `BOARD_CSP` for the directives US-905 proved necessary (same-origin only)
- [x] [US-907: Binary source for custom-editor boards — read the page's content pipe from a board](../tasks/US-907-board-binary-source/README.md)
- [x] US-908: `pdf-viewer` board v2 — archive-embedded and remote PDFs
- [x] US-909: Parity verification against the built-in viewer
- [x] US-910: Publish `pdf-viewer` to the catalog
- [x] [US-911: Remove the built-in PDF editor, `assets/pdfjs/`, and the unused `safe-file://` scheme](../tasks/US-911-remove-builtin-pdf/README.md)

---

## EPIC-046 — [Board Environment Variables](EPIC-046.md)

Gave boards a first-class way to store secrets (connection strings, API keys, passwords) **outside** the board folder, so copying, sharing, or committing a board never leaks them. A single, user-configured `.env.json` file (`board-vars.file` setting) holds a `namespace → profile → key → value` schema and is optionally password-encrypted by reusing Persephone's existing file-encryption mechanism (`shell.encryption`/`ui.password`/`TextFileModel.decrypt`) — deliberately **not** OS-bound (`safeStorage`/DPAPI), which breaks on non-persistent pooled VMs. A session-singleton `BoardEnvStore` (`api/board-vars/`) models the encrypted-file access flow directly on the existing `BrowserBookmarks` pattern (load → detect encryption → prompt once per session → session-unlocked). Each board's namespace is its manifest's **`author`/`name`** when both are explicitly set, else its root path — stable across a board's dev-repo copy and its installed copy, with a non-blocking advisory dialog at registration time when two boards' computed namespaces collide. Boards read/write only their own namespace via a new bridge API, **`persephone.var.get/set/list/show`**, routed through `board-vars-bridge.ts` with requests serialized on a shared chain so concurrent boards can't each pop a dialog at once — `BoardWebview` resolves the namespace itself from the calling board's root, so a board can never name or reach another board's slice. A new built-in editor (`env-vars-view`, `*.env.json`) gives users a namespace-list + profile-tabs + AVGrid review/edit view (plain text, no masking — simpler than the originally-designed reveal-toggle and unnecessary for a file already kept outside the shareable board folder), reachable from Settings or `persephone.var.show()`. Finally, an agent-facing admin surface, **`app.boardVars`** (`get`/`set`/`list`/`listNamespaces`/`namespaceFor`/`show`), gives scripts unrestricted namespace access — unlike the board-side bridge, deliberately not namespace-locked, since `execute_script` already carries full app trust equal to `app.fs`/`app.settings` — so an agent can provision a freshly-scaffolded board's secrets in the same script that created it. Reviewed at epic level — one must-fix (`app.boardVars.show()` with no namespace could resolve to the wrong editor if the configured file didn't literally end in `.env.json`; fixed to force the `env-vars-view` editor explicitly) plus a stale inline type widened for accuracy.

- [x] [US-887: Vars store foundation — settings path + `.env.json` schema + `BoardEnvStore`](../tasks/US-887-board-vars-foundation/README.md)
- [x] [US-888: Board API `persephone.var.get/set/list` + "Create environment variables storage" dialog](../tasks/US-888-board-vars-bridge-api/README.md)
- [x] [US-889: `*.env.json` built-in editor + `persephone.var.show()`](../tasks/US-889-board-vars-editor/README.md)
- [x] [US-890: Namespace collision warning at board registration](../tasks/US-890-board-vars-collision-warning/README.md)
- [x] [US-891: Agent-facing `app.boardVars` admin API + board-guide docs](../tasks/US-891-board-vars-agent-api/README.md)

---

## EPIC-045 — [Published Boards Catalog](EPIC-045.md)

Let users **discover and install boards the project publishes** — custom editors, viewers, and tools — from inside Persephone, without leaving the file they're opening. A public GitHub repo (`andriy-viyatyk/persephone-boards`) is the catalog: `main` carries a `boards-manifest.json` describing every published board, and each board version is a per-board GitHub **Release** ZIP asset. A main-process **catalog service** (`published-boards-service.ts`, mirroring `version-service`) fetches the raw manifest on a 24h gate, caches the last-good copy for offline use, and broadcasts changes; a **download service** (`board-download-service.ts`) streams each release ZIP with an incremental **sha256** verify. Installation is deliberately **two consented steps** that keep the "nothing is trusted without the user's dialog click" invariant intact: **Download** (byte-progress, checksum-verified, extracted locally — trusts *nothing*; the board sits inert on disk, reviewable by the user or their AI agent) and **Register board** (the standard `showTrustBoardDialog` — only then does the normal custom-editor machinery pick the board up). Opening a file whose type has no installed editor but matches a published board shows a **`+` entry** in the editor switch (`Text | +`) that maps to a real registered **Board Info editor** (`editors/board-info/`) — a host-capable holder (adopts/yields `CONTENT_HOST_TRAIT` without rendering) so `Text ↔ + ↔ board` switches transfer the content host losslessly. The Board Info editor serves both **install mode** (Download → Register, multi-match tiles) and **properties mode** (info, an on-demand version history for **update/rollback** via a safe temp-extract + folder-swap that never destroys a working board, Uninstall/Unregister, Open board). Updates surface **silently** — an "Update available" badge in the Tools & Editors → Boards tab (context-menu Update) and a dot on the in-board Properties button; the swap is guarded by an open-pages/busy precondition with a "Close pages & continue" shortcut. A board's `standalone` bit (derived: no masks → standalone; masks → opt-in) drives **pin gating** (only standalone boards are pinnable), and per-version **`minAppVersion`** compatibility hides/refuses versions an older app can't run while keeping older compatible versions installable. The **`app.boards`** script API gained a full lifecycle + catalog surface (`registerBoard`/`unregisterBoard`/`renameBoard`; `searchPublished`/`getPublishedVersions`/`downloadPublished`/`installPublished`/`uninstallBoard`/`checkPublishedUpdates`) under the request-vs-grant model — an agent can drive discover → download → review → register → update/rollback → uninstall with at most one dialog click per privilege step. A new full-page **Tools & Editors hub** (`editors/tools-hub/`, a singleton page) is the page-sized counterpart of the sidebar panel (opened via its "Open in new tab" button); its **Search boards** tab is the sole catalog-browsing surface (browse/filter/install without a matching file open + Refresh catalog), and the panel and hub share extracted components (`PinnedRail`, `BuiltinEditorsList`, the trusted-boards/tools lists). The About page's "Check for Updates" now also force-refreshes the catalog and shows an "Available boards" count. Publishing is a version bump + merge to `main`: a **GitHub Action** (`persephone-boards` repo) zips each board, creates the tagged release, and rewrites both catalog manifests with no manual steps — validated end-to-end by publishing `drawio-viewer` v1.0.0 from the live catalog. Reviewed at epic level — one must-fix hardened (a catalog `id` charset guard + a path-containment check close a catalog-driven path-traversal vector) plus a `formatBytes` de-duplication; security invariant verified to hold on every trust-adjacent path.

- [x] [US-862: Catalog service (main): manifest fetch, cache, periodic check, IPC](../tasks/US-862-catalog-service/README.md)
- [x] [US-863: Install engine: download + sha256 verify + extract + install registry](../tasks/US-863-install-engine/README.md)
- [x] US-866: persephone-boards repo: initial commit + publish script + GitHub Action (separate repo)
- [x] [US-868: Agent API: `app.boards.registerBoard` / `unregisterBoard` / `renameBoard`](../tasks/US-868-agent-board-lifecycle/README.md)
- [x] [US-864: "+" editor-switch entry + Board Info editor (install mode, progress)](../tasks/US-864-switch-entry-board-info/README.md)
- [x] [US-865: Updates: version compare, activation toast, safe re-install, sidebar badges](../tasks/US-865-updates/README.md)
- [x] [US-867: Board Info editor: properties mode + version history & rollback](../tasks/US-867-board-info-properties/README.md)
- [x] [US-869: Agent API: catalog — searchPublished / installPublished / versions / uninstall](../tasks/US-869-agent-catalog-api/README.md)
- [x] [US-870: Tools & Editors hub page (Built-in / Registered boards / Search boards / Tools + Pinned)](../tasks/US-870-tools-hub/README.md)
- [x] US-871: SegmentedControl tooltip support + "+" switch-entry tooltip
- [x] US-872: About "Check for Updates" also force-refreshes the boards catalog

---

## EPIC-044 — [Board Secondary Views](EPIC-044.md)

Added the last piece that lets a **Board** stand in for a full built-in editor: a board can now contribute one or more **secondary (sidebar) views** — a second board-relative `.html` rendered in its own sidebar panel and wired to the *same* board model as the main view — closing the gap that kept editors like Todo (a main list + a coordinated "Lists/Tags" sidebar panel) from moving out of Persephone's core and into boards. A board declares views in `board-manifest.json` (**`secondaryViews: [{ id, html?, title? }]`**, read by a `fileMasks`-independent reader) and/or replaces them at runtime with **`persephone.setSecondaryViews([...])`**; each declared view maps to a stable panel-id family **`board-secondary:<viewId>`** that the secondary-view registry resolves — via a new **`registerPrefix`** — to a single generic **`BoardSecondaryView`** component. Frames stay synchronized through a new **`persephone.state.*`** shared-state channel (`init`/`get`/`set`/`merge`/`onChange`) injected into **every** board frame, authoritative on the Persephone side (`BoardEditorState.sharedState` on the base `BoardEditorModel`, so *every* board gets it), with writes round-tripped through the host and ordered by a monotonic `sharedStateSeq` guard, and **opt-in persistence** — only keys declared via `state.init(defaults, { restorableKeys })` are written to the page descriptor, so large/transient state never bloats the open-pages file. Each frame learns its role synchronously at boot via **`persephone.view`** (`"main"` or the view id, delivered on a `view=` URL param) so one HTML file can encapsulate every view. The second iframe reuses `BoardWebview` with `entry` + **`isMain`** props: because all frames share one `model.id`, only the main frame owns the automation target / CDP registration / ui.log reset / autofocus, and **job reaping is per-sink** (a secondary frame's teardown reaps only its own `boardId`, never the shared owner) — so closing a secondary panel never tree-kills the main frame's processes or breaks its automation. Board panels die on navigate-away (Pattern A); busy-board re-promotion re-derives them. The **proving ground** is the built-in Todo reimplemented as a **content-host board with a Lists/Tags secondary view** (selection→filter coordinated purely through `persephone.state.*`, file content through `persephone.host.*`), authored outside the repo (`C:\projects\persephone-boards\todo`) and registered **alongside** the built-in Todo as an A/B test — the built-in editor is untouched. **US-858** lifts the v1 main-frame-only automation limit by mapping each board frame onto the `IBrowserTarget` **tab** abstraction (frames-as-tabs): `browser_tabs` lists them, `select` opens+activates the sidebar panel, and each frame registers for CDP under its own `${model.id}/${tab}` key. Authoring the Todo board surfaced a reliability inventory (**US-859**) that drove two hardening tasks: **US-860** made `persephone.host.getContent`/`getLanguage` **await the handshake internally** (safe in any call order — the editor-switch empty-render trap is gone, no ready-gate needed), made `setContent` read-your-own-write, added a **generation-counter guard** to `customEditorRegistry.refresh()` (a stale overlapping refresh from a rapid untrust+trust board-folder rename can no longer clobber the newer result), and delegated `BoardContentEditorModel.modified` to its host so a dirty content-host board reports correctly in `list_pages` / the tab dot; **US-861** mirrors board-frame `console.error`/`console.warn` to the board's `ui.log` (new `board:log` message) and made **`board_refresh` deterministic** (awaits the remounted main frame's load + CDP re-registration via `waitForFrameLoad`, returns `frameReady`) so a snapshot right after a refresh can't hit the stale pre-reload frame. Reviewed at epic level — clean, no architecture or coding-standard violations.

- [x] [US-851: Manifest + base-model plumbing for declared secondary views](../tasks/US-851-manifest-model-plumbing/README.md)
- [x] [US-852: `persephone.state.*` shared-state bridge (get/set/merge/onChange) + opt-in persistence](../tasks/US-852-shared-state-bridge/README.md)
- [x] [US-853: Second-iframe rendering + `board-secondary:*` panel family + multi-frame safety](../tasks/US-853-second-iframe-rendering/README.md)
- [x] [US-854: `persephone.setSecondaryViews` dynamic control](../tasks/US-854-set-secondary-views/README.md)
- [x] [US-855: Persistence & restore hardening](../tasks/US-855-persistence-restore-hardening/README.md)
- [x] [US-856: Docs, guides, demo board](../tasks/US-856-docs-guides-demo-board/README.md)
- [x] [US-857: Proving-ground Todo board (content-host board with secondary views, A/B alongside the built-in)](../tasks/US-857-todo-board/README.md)
- [x] [US-858: Automate secondary views via `browser_*` (frames-as-tabs)](../tasks/US-858-automate-secondary-views/README.md)
- [x] [US-859: Board authoring reliability & predictability for agents (problem inventory — triaged)](../tasks/US-859-board-authoring-reliability/README.md)
- [x] [US-860: Board bridge readiness & registry hardening (US-859 #1–#5, #13)](../tasks/US-860-board-bridge-readiness/README.md)
- [x] [US-861: Board debugging observability (US-859 #8, #10)](../tasks/US-861-board-debug-observability/README.md)

---

## EPIC-043 — [Content-Host Boards](EPIC-043.md)

Delivered EPIC-042's explicitly-deferred content-host variant: a custom-editor **Board can now let Persephone own the file it edits**, the same way every built-in editor does. A board declares **`editorKind: "content-host"`** in `board-manifest.json` (vs. the default `"simple"`, which is EPIC-042's direct-`filePath` behavior); Persephone then builds the board **with an `IContentHost`** — the exact `TextFileModel` that backs Monaco/Grid/Notebook — so it keeps the content pipe (`file://` / `https://` / archive providers), encoding detection, encryption, the auto-save cache, dirty/modified tracking, the tab's unsaved dot, the "save changes?" release prompt, and Ctrl+S. The board works with the content through an injected **`persephone.host.*`** bridge (`getContent` / `setContent` / `onContentChange` / `getLanguage` / `save`). The model is a new subclass **`BoardContentEditorModel extends BoardEditorModel`** (composing the host via `CONTENT_HOST_TRAIT`, template `MonacoEditor`) that inherits all board machinery (iframe/trust/toolbar/automation/icon) unchanged and adds only the host composition — so plain boards are untouched. Because the host is shared, a content-host board **switches with Monaco/Grid by transferring the same host** (no reload, no data loss) in both directions, and — unlike the simple board — works over **non-local files** (`https://`, inside archives, encrypted) since Persephone owns the pipe. Construction/switch/persistence branch on the kind (`PagesLifecycleModel`, `PageModel.switchMainEditor` both directions, and a `PagesPersistenceModel.restorePage` board branch placed before the generic `if (d.host)` so a restored content-host board rebuilds the subclass + host); all three `isPlainLocalPath` gates are lifted by kind. The content bridge rides a net-new renderer→iframe push (`host:content`, echo-guarded) plus a new shim inbound handler, and the shim injects an automatic `window`-level Ctrl+S (opt-out via `preventDefault`) so saving needs zero board code; content-host boards support no busy retention (the host transfers out on switch). Two custom-editor polish items shipped alongside: a simple custom-editor board now shows the **file name** (not the board name) in its tab, and a file claimed by a trusted custom-editor board shows that **board's icon** in the Explorer tree / file lists / tabs (the board icon wins over the language icon when the board is the file's default editor — e.g. `.drawio` shows the drawio-viewer icon). The **DrawIO viewer board** (authored in the external boards repo, not bundled) was converted from simple to content-host as the proving ground: it renders `.drawio` XML via `host.getContent()`/`onContentChange()`, the user edits the raw XML in Monaco (host transfers on switch), switches back to see the updated diagram, and Ctrl+S saves. Reviewed at epic level — clean, no must-fix concerns (the sanctioned `components/icons` → `editors/board` icon import was recorded in the dependency rules).

- [x] [US-843: Manifest `editorKind` + association plumbing](../tasks/US-843-editorkind-plumbing/README.md)
- [x] [US-844: `BoardContentEditorModel` — the content-host board model (crux)](../tasks/US-844-board-content-editor-model/README.md)
- [x] [US-845: Construction + switch + persistence integration](../tasks/US-845-construction-switch-persistence/README.md)
- [x] [US-846: Content bridge (`persephone.host.*`) + view wiring + auto-save](../tasks/US-846-content-bridge-view-wiring/README.md)
- [x] US-847: Convert the DrawIO viewer to content-host (proving ground, authored outside the repo)
- [x] [US-848: Show file name (not board name) in tab for a simple custom-editor board](../tasks/US-848-simple-board-file-title/README.md)
- [x] [US-849: Show the board icon for board-associated files in the Explorer tree](../tasks/US-849-explorer-board-file-icon/README.md)

---

## EPIC-042 — [Boards as Custom Editors](EPIC-042.md)

Closed the last gap between a Board and a first-class editor: a **trusted** board can now register itself as the editor for a file type, appearing in the page's **editor switch** next to the built-in editor (Monaco/Grid/…) and — when it outranks the built-in — becoming the default open target. A board declares the association in `board-manifest.json`: **`fileMasks`** (glob masks matched against the file basename, e.g. `*.drawio`, `*.grid.json`), **`editorPriority`** (its slot on the existing resolution ladder — monaco 0 / grid 20 / draw 50 / viewers 100 / category 200; strictly-greater wins, built-ins win ties), and **`editorName`** (switch-widget label). The fields are honored only when the board is trusted. Board editors are runtime-discovered, so they live in a **separate reactive `customEditorRegistry`** (never mutated into the static `editorRegistry`) keyed by the virtual id **`board-editor:<boardRoot>`**; `resolveEditorIdForFile` merges built-in + board candidates at the two file-open decision points (direct open + `openRawLink` file resolver), gated to real local files only (`isPlainLocalPath`). An untrust drops associations live (no filesystem watcher). Switching to a board reuses navigation's unsaved-changes guard (`confirmRelease()` — Save/Don't Save/Cancel; cancel aborts, staying on the built-in) and rebuilds through `createEditorFromFile` in both directions (no shared content host); a board's `editorId` is dynamic while acting as a custom editor but `getRestoreData()` pins `"board-view"` for persistence, and MCP/automation detection broadened via `isBoardEditorId`. The file path reaches the board as the async bridge method **`persephone.getFilePath()`** (delivered through `ILinkData.filePath` → `BoardEditorState.filePath` → `BoardPortInitMsg`), which the board reads/writes with the existing `persephone.readFile()`/`writeFile()` — the simple direct-`filePath` case (the content-host variant reusing Persephone's content pipe is deferred to a successor epic). The **DrawIO viewer board** (authored in a separate external boards repo, not bundled) is the proving ground — a read-only `.drawio` (diagrams.net) viewer that validated the whole path end-to-end and retired the built-in DrawIO-viewer plan. Its authoring surfaced and fixed two plumbing gaps (the render-path `board-editor:<root>` → `board-view` module mapping in `RenderEditor`, and reusing `SwitchWidget` in `BoardToolbar` so the switch-back UI shows while on a board). Reviewed at epic level — clean, no architecture/standards violations.

- [x] [US-836: Board manifest — `fileMasks` + `editorPriority` + editor identity](../tasks/US-836-board-manifest-file-association/README.md)
- [x] [US-837: Custom-editor registry — reactive `mask → trusted board` map](../tasks/US-837-custom-editor-registry/README.md)
- [x] [US-838: filePath into the board — async `persephone.getFilePath()`](../tasks/US-838-filepath-into-board/README.md)
- [x] [US-839: Resolution + switch integration (the crux)](../tasks/US-839-resolution-switch-integration/README.md)
- [x] [US-840: DrawIO viewer board (proving ground) — retires the built-in US-454 plan](../tasks/US-840-drawio-viewer-board/README.md)

---

## EPIC-041 — [Unified Focused/Unfocused List Selection](EPIC-041.md)

Spread the Explorer file-tree's **two-state selection** to every selectable list in the app: a selected/hovered row is subtle **gray** (`background.light` / `background.message`) when its list is **not** focused, and **blue** (`background.treeSelection`) with a **blue outline** (`border.active`) when the list **is** focused. Previously this behavior lived only inside the `Tree` primitive, reachable only via `keyboardNav`, while every other list hand-rolled its own selection with a different token and no focused-vs-unfocused distinction. The mechanism is pure CSS — `:focus-within` gated by a container `data-focus-selection` attribute + a focusable (`tabIndex=0`) container, **no JS focus state**. US-829 extracted the visuals into one shared contract (`uikit/shared/selection-style.ts` — `rowSelectionBase` on the row, `focusSelectionOverride` on descendant-row containers, `rowFocusSelectionOverride` on standalone rows), refactored `Tree`/`TreeItem` onto it with **zero visual change** (Explorer is the live regression guard), and added `ListItem`/`ListBox` `selectionStyle="focus"` + a `Tree` `focusSelection` opt-in, decoupling focus-styling from `keyboardNav`. US-830 flipped the already-shared-primitive consumers (Rest Client tree, Notebook Categories via `focusSelection`; MCP Tools, Storybook, Links list-mode + pinned via `selectionStyle="focus"`) — the blue focused override moved to a **row-hosted** rule so a standalone `ListItem` (outside `ListBox`) is self-contained and its container needs only `data-focus-selection` + `tabIndex=0`. US-831 retrofitted the five hand-rolled surfaces (App menu `FolderItem`, Notebook Tags, ToDo, MCP Resources, Links Tags/Hostnames — the last two gaining a real selected background, replacing today's text-only blue) via a new minimal UIKit **`SelectableRow`** primitive — the Rule-7-clean home for the focus CSS that editor code (no Emotion) can't express inline. **No new color tokens, no theme edits.** Reviewed at epic level — clean, no architecture/standards violations.

- [x] [US-829: Shared focus-aware selection style](../tasks/US-829-shared-selection-style/README.md) — `uikit/shared/selection-style.ts`; `Tree`/`TreeItem` refactor (zero visual change); `ListItem`/`ListBox` `selectionStyle="focus"` + `Tree` `focusSelection`; decoupled from `keyboardNav`
- [x] [US-830: Shared-primitive consumers](../tasks/US-830-shared-primitive-consumers/README.md) — Rest Client tree, Notebook Categories (Tree); MCP Tools, Storybook, Links list-mode + pinned (ListBox); row-hosted `rowFocusSelectionOverride` for standalone `ListItem`
- [x] [US-831: Bespoke-row retrofits](../tasks/US-831-bespoke-row-retrofits/README.md) — App menu, Notebook Tags, ToDo, MCP Resources, Links Tags/Hostnames; new `uikit/SelectableRow` primitive

---

## EPIC-040 — [Dependency & Platform Updates (Keep Persephone Current)](EPIC-040.md)

A housekeeping cycle to pull Persephone's runtime and key libraries current so it never drifts into an unupdatable state (stale Chromium = site breakage; stale toolchains = painful multi-major migrations later). Each bump was isolated to its own task and verified against the surfaces it could affect, so any regression stays attributable. Landed: **Electron 39 → 43** (Castlabs `+wvcus` fork — Chromium 150 / Node 24, Widevine DRM + VMP signing preserved; also fixed an Electron-43 cross-origin regression by enabling `corsEnabled` on the `app-asset://` scheme), a **safe batch** of minor/patch npm bumps, **`@anthropic-ai/sdk` 0.86 → 0.111** (no code change — narrow, stable Messages-API slice), **`monaco-editor` 0.52 → 0.55** (top-level `monaco.typescript`/`monaco.css` namespace move; upstream menu-paste bug patched), the **ESLint flat-config migration** (eslint 9 + `@typescript-eslint` 8 + react-hooks 7), **Vite 5 → 8** (rolldown) with **Electron Forge fully removed** — dev now runs on an own `scripts/dev.mjs` (renderer dev server + HMR + watch-built main/preload/board-shim + Electron restart), prod on `scripts/build-prod.mjs`; and the last deferred majors **`csv-parse` 6 → 7** and **`picomatch` 2 → 4** (both verified behavior-identical against their sole consumers). Fuses were dropped with Forge (never actually applied in shipped builds; re-adding via an electron-builder `afterPack` hook is an optional hardening follow-up in the backlog). Reviewed at epic level — clean, no architecture/standards violations. **US-826 (TypeScript 5.9 → 7.0)** was deferred to the backlog: TS 7 is the native Go compiler with no JS API, and typescript-eslint peer-caps `typescript` `<6.1.0`. Residual release-time QA (DRM playback in a signed build + packaged installer) is tracked in the backlog for the next signed build.

- [x] [US-821: Update Electron to 43.0.0 (Castlabs +wvcus)](../tasks/US-821-electron-43-upgrade/README.md) — residual signed-build DRM/installer QA in backlog
- [x] [US-822: Safe batch — low-risk minor/patch npm bumps](../tasks/US-822-safe-batch-minor-bumps/README.md)
- [x] [US-823: Upgrade `@anthropic-ai/sdk` (0.86 → 0.111)](../tasks/US-823-anthropic-sdk-major/README.md)
- [x] [US-824: Upgrade `monaco-editor` (0.52 → 0.55)](../tasks/US-824-monaco-editor-major/README.md)
- [x] [US-825: ESLint flat-config migration](../tasks/US-825-eslint-flat-config-migration/README.md)
- [ ] [US-826: Upgrade TypeScript (5.9 → 7.0)](../tasks/US-826-typescript-7/README.md) — **deferred → [backlog](../tasks/backlog.md)** (blocked on typescript-eslint native-TS7 support)
- [x] [US-827: Upgrade Vite (5 → 8)](../tasks/US-827-vite-8/README.md) — Electron Forge removed
- [x] [US-828: Remaining deferred majors (csv-parse / picomatch)](../tasks/US-828-remaining-deferred-majors/README.md)

---

## EPIC-038 — [Agent Tools Registry](EPIC-038.md)

Added an **Agent Tools registry** — Persephone's *executable memory*, complementing Mneme's *knowledge* memory. An agent (or user) turns a working integration script into a persistent, reusable **tool**: a folder (a *toolset*) holding a `tools-manifest.json` declaring one or more tools plus scripts in **any language**, an optional `.env` for secrets, and an optional `README`. Once registered, any MCP-connected agent discovers tools with **`search_tools`** (Claude-Code-`ToolSearch`-style — matches return complete, ready-to-call definitions) and runs them with **`execute_tool`** (args delivered as JSON on **stdin**, results returned via a `##PERSEPHONE_RESULT##<json>` sentinel line — last-wins so noisy stdout is harmless; failures carry `stderr` + `exitCode` + `toolsetRoot` so the agent fixes the tool rather than working around it). The MCP surface is **constant-size** regardless of how many tools exist (`search_tools` / `execute_tool` / `refresh_toolset` / `create_toolset`) — deliberately *not* dynamic first-class tools, to avoid per-session schema bloat and flaky `listChanged` support. The design mirrors the Boards subsystem end-to-end: folder + manifest identity (`tools-manifest.ts`), a **user-only trust registry** (`tools-trust.ts` / `trustedTools.txt`, exact-path match — registration ≡ trust, never stored in the manifest, never exposed on `app`/scripts so a script can't self-register or self-execute), a reactive enumeration model (`registered-tools.ts`), template scaffolding (`tool-template/` + `tool-scaffold.ts`), and the command-runner execution engine (`tool-executor.ts` — cwd = toolset root, `.env` injection, `timeoutMs` tree-kill, self-rotating per-toolset `tools-execution.log`). Every agent-initiated registration (`create_toolset`, or registering a copied folder) is gated by a **"Register this toolset?"** confirmation dialog — a deliberate divergence from boards' auto-trust, because a registered tool later runs headlessly on every call. Management UI (US-805, re-scoped from a standalone list editor): registered toolsets surface on the two boards panels (an Explorer-sibling **Boards/Tools** switch + a third **Tools** segment in the global Tools & Editors panel), a lightweight **per-toolset editor** (`persephone-toolset://`, `toolset-view`) shows manifest info + tool list + execution log, and `tools-manifest.json` gets a register-gated **Open Toolset** icon in the Explorer tree. Toolsets are **portable** — self-contained relative-path folders with a `requirements` field for provisioning a new machine. Reviewed at epic level (close-out review clean; two optional correctness fixes applied — removed an unused icon; corrected an empty-`.env` doc claim).

- [x] US-801: Toolset package format + registry (`tools-manifest.json`, `toolsTrust`, `registeredTools` model)
- [x] US-802: Execution engine (stdin-JSON args, `.env` secrets, timeout, output contract, in-memory stats + self-rotating per-toolset log)
- [x] US-803: MCP surface (`search_tools` full-definition results / `execute_tool` / `refresh_toolset` + `mcp-res-tools.md` guide + instructions; `create_toolset` deferred to US-804)
- [x] US-804: Scaffolding + authoring template (`assets/tool-template/`, `createToolset` scaffold, registration confirmation dialog, `create_toolset` MCP tool)
- [x] US-805: Management UI — toolsets on the Boards/Tools panels + a per-toolset editor + `tools-manifest.json` open-icon (no standalone list editor)

---

## EPIC-037 — [Migrate Board `<webview>` → `<iframe>`](EPIC-037.md)

Replaced the board host `<webview>` tag with an in-DOM **cross-origin `<iframe src="board://<host>/index.html">`**, eliminating the tag's guaranteed per-open cold start (fresh out-of-process renderer + ephemeral partition + an async `registerBoardProtocol` round-trip before navigation — ~0.5–2 s) so a board now opens **instantly, like any built-in editor**. The trusted-code threat model justifies the move: a board is local, user-authorized, extension-like code (it can already `execute()` arbitrary processes), so SOP + `nodeIntegrationInSubFrames: false` + the served CSP is adequate isolation, and the in-DOM iframe composes naturally under all host overlays (the reason `WebContentsView` was rejected). Each board loads a **distinct `board://<host>`** origin (a stable hash of the board root minted by `registerBoard` in main), giving per-board storage isolation without separate session partitions; the `board://` handler moved from per-partition to a **single host-routed** handler on the shared session. The privileged bridge left the (now-deleted) `preload-board.ts` for a **`MessagePort` RPC**: main mints a `MessageChannelMain` port pair per board, the renderer brokers a one-time handshake transferring `port1` into the frame (`targetOrigin: "board://<host>"`), then the board talks **directly** to a main-process handler over the duplex port (`execute` streaming, dialogs, files, links, notify, theme push). The `window.persephone` surface is rebuilt by a browser-IIFE shim (`board-shim.ts`) the handler inlines into served HTML before the first author script. Automation (`browser_*`) was re-pointed below the frozen `IBrowserTarget` seam to target the board **frame** via CDP (`BoardTargetModel` + `cdp-service` `registerBoardFrame`), so the agent contract is byte-for-byte unchanged. The redundant open-time auto-reload (the "blink") was removed — manual **Reload** + a new **`board_refresh`** MCP tool replace it. Load failures funnel into the board's `ui.log` from four detectors (main `did-fail-load` + 404 logging; shim `securitypolicyviolation`, `window.onerror`/`unhandledrejection`; handshake watchdog). A go/no-go gate (US-775) confirmed the dramatic open-latency win before the bridge/automation rewrites committed; a live POC (US-776) de-risked the cross-origin port transfer + streaming end-to-end first. Reviewed at epic level (close-out fixed 2 concerns: `</script` escaping of the inlined shim source; a minimal `BoardEditorModel.dispose()` to clear the live iframe ref + frame CDP registration).

- [x] [US-769: Remove board auto-reload (blink fix); keep manual Reload; add `board_refresh` MCP tool](../tasks/US-769-remove-board-auto-reload/README.md)
- [x] [US-770: `<iframe>` host (no `sandbox` attr) + cross-origin `board://<host>` loading; host-routed handler; host CSP fix](../tasks/US-770-iframe-host-and-handler/README.md)
- [x] [US-771: `MessagePort` RPC bridge — `MessageChannelMain` board↔main; shim injected by `board://` handler; retire `preload-board.ts`](../tasks/US-771-messageport-bridge/README.md)
- [x] [US-772: Storage & theme parity verification (per-board-host origin isolation; no-flash + retint)](../tasks/US-772-storage-theme-parity/README.md)
- [x] [US-773: Automation parity (CDP on board frame + `BoardTargetModel`; focus→overlay dismissal)](../tasks/US-773-automation-frame-parity/README.md)
- [x] [US-774: Lifecycle — load-failure reporting (modes A+B+D+E); switch/close/dispose; multi-window](../tasks/US-774-board-lifecycle-parity/README.md)
- [x] US-775: **Go/no-go gate** — GO (iframe opens instantly vs. `<webview>` ~0.5–2 s); no production-code scope
- [x] [US-776: POC — `<iframe>` pre-script injection & bridge handshake (proven end-to-end; gate passed)](../tasks/US-776-iframe-bridge-poc/README.md)

---

## EPIC-036 — [Boards: Explorer-integrated switcher & in-board chrome](EPIC-036.md)

Reoriented Boards around the **Explorer root** instead of around `.persephone`. Introduced a single reusable, fully-expanded **`BoardsTree`** (folders compacted VSCode-style; pure `boards-tree-build.ts`) rendered everywhere boards are listed: a new **Explorer-sibling "Boards" panel** (`BoardsSecondaryView`, backed by `ExplorerEditor` exactly like Search, scoped to the Explorer root), the global **"Tools & Editors → Custom Boards & Editors"** tab (retrofitted onto the same tree, multi-root), and an **in-board toolbar** switcher popover. A new **Create-board dialog** (folder picker defaulting to the Explorer root + name + live target-location label) replaced the old name-only prompt. The **`.persephone` project mode was removed entirely** — the `persephone-folder://` scheme, the project Board editor's board-list view (`BoardListSecondaryView`), and the Explorer "Create .persephone project" / "Trust all boards" affordances are gone; `BoardEditorModel` is now single-board only, and a `.persephone` folder is an ordinary folder. An open board gained a Persephone **`BoardToolbar`** (Reload, Show-log, full board path → switcher popover, and a File Explorer button that opens the sidebar Explorer rooted at the board's parent folder); the switcher's scope rides a new persisted `ILinkData.explorerRoot` captured at open. Trust became **hierarchical** (`board-trust` is ancestor-aware, outer wins) so a board nested in a trusted folder is auto-trusted and the registry never holds a nested pair. Reviewed at epic level (close-out review clean — no concerns). Follow-on polish: `BoardsTree` hover-row highlight + a reusable `TreeItem` `trailingVisibility` opt-in.

- [x] [US-759: `BoardsTree` component — single reusable fully-expanded boards tree (single-root + multi-root)](../tasks/US-759-boards-tree/README.md)
- [x] [US-760: "Create board" dialog — folder picker + name + computed location](../tasks/US-760-create-board-dialog/README.md)
- [x] [US-761: Boards as an Explorer-sibling panel (mirror Search; remove Explorer Refresh)](../tasks/US-761-boards-explorer-panel/README.md)
- [x] [US-762: Single-board-only `BoardEditorModel`; remove `.persephone` project mode](../tasks/US-762-single-board-only/README.md)
- [x] [US-763: In-board toolbar — Reload, Show-log, path + boards popover](../tasks/US-763-in-board-toolbar/README.md)
- [x] [US-764: Retrofit Tools & Editors Boards tab onto `BoardsTree`](../tasks/US-764-tools-editors-boards-tree/README.md)
- [x] [US-766: Trust registry — forbid nested boards (inherited trust, outer wins)](../tasks/US-766-trust-no-nested-boards/README.md)

---

## EPIC-035 — [Boards Anywhere — portable boards, manifest identity, board-level trust, link/MCP open & sidebar registry](EPIC-035.md)

Generalized EPIC-034's Web Boards from "a board lives inside a `.persephone` project" into **portable, first-class custom tools**. A board is now identified by a **`board-manifest.json`** at its root (descriptive metadata only — no trust or behavior fields) and can live **anywhere on disk**; `.persephone/boards/` stays as the default create location. Trust moved from per-project to **per-board** — a path-keyed registry (`board-trust.ts` / `trustedBoards.txt`) that is also the **known-boards registry** (trusted ≡ registered); trust is never read from the manifest, foreign boards prompt a "Trust board" dialog, and boards Persephone creates are auto-trusted at creation. Boards open through a new **`persephone-board://`** in-app link scheme routed via `openRawLink` (parser-only, sibling of `persephone-folder://`). A board lifecycle API (**`app.boards`** — `createBoard`/`createDemoBoard`/`openBoard` + `app.openRawLink`) plus **`create_board`/`open_board` MCP tools** and a `read_guide("boards")` agent guide let an agent stand up and develop a board end-to-end with no user clicks. The **Explorer** adds an "Open Board" trailing button on `board-manifest.json` rows (row click still opens the JSON), and the sidebar **"Tools & Editors"** panel gained a **"Custom Boards & Editors"** tab listing trusted boards grouped by folder — boards are pinnable alongside built-in editors (unified `PinnedRef` over the `pinned-editors` setting) and pinned boards appear in the add-page dropdown. Reviewed at epic level (close-out fixed 2 concerns: stale board files in `folder-structure.md`; `app.ui.notify` vs the `ui` singleton). The Custom Editor axis (file-extension routing, file-as-input) is deferred to a successor epic.

- [x] [US-745: `board-manifest.json` — board identity file](../tasks/US-745-board-manifest/README.md)
- [x] [US-746: Boards anywhere — decouple board location from `.persephone/boards/`](../tasks/US-746-boards-anywhere/README.md)
- [x] [US-747: Trust at board level — per-board registry; project gate → "Trust all boards in this project" bulk action](../tasks/US-747-board-level-trust/README.md)
- [x] [US-748: Open-a-board link scheme (`persephone-board://`)](../tasks/US-748-open-board-link-scheme/README.md)
- [x] [US-749: Explorer "Open Board" row button](../tasks/US-749-explorer-open-board-button/README.md)
- [x] [US-750: Board lifecycle — `create_board`/`open_board` MCP tools + `app.boards` + `app.openRawLink` + agent boards guide](../tasks/US-750-board-lifecycle-api-mcp/README.md)
- [x] [US-751: Sidebar "Tools & Editors" Custom Boards & Editors tab + pinnable boards (remove ≡ untrust)](../tasks/US-751-tools-editors-boards-tab/README.md)

---

## EPIC-034 — [Web Board — HTML-page board with `persephone.execute` + board scripts](EPIC-034.md)

Added **Web Boards**: small local apps whose UI is a plain HTML page the user owns, hosted in a **sandboxed `<webview>`** (sandbox + contextIsolation on, nodeIntegration off, CSP forbidding remote network) served over a per-partition **`board://`** protocol, with a single injected `window.persephone` bridge. The bridge's one method, **`execute()`**, streams a real OS process spawned in the main process (a shared **command runner** — `runner-channels.ts` + `app.proc` — with whole-tree kill and per-owner reaping), plus an integration tier (`notify`, `openRawLink`, native file dialogs) and a live **`--p-*` theme contract** (CSS variables + JS mirror with `onThemeChange`). Boards live under a project's **`.persephone/boards/<Name>/`** behind a **per-project trust gate** (RCE-explicit confirmation; an untrusted project won't render). The **Board editor** (Pattern B, survive-navigation) provides a sidebar board list + main management surface with create/delete, "Create Demo board", per-board custom icons, `ui.log`, and live reload; a **"Create .persephone project"** Explorer context menu bootstraps a project. Boards are authored and debugged by an **AI agent over MCP** — they are first-class **`browser_*` automation targets** (the automation layer duck-types `editorId`, pulling no editor module into its bundle). Shipped a recommended-components catalog under **`boards-assets/`** (`manifest.json` + 9 component skins + a no-dependency native `<dialog>` pattern) and a living, self-documenting **demo board** (`assets/demo-board/`). Reviewed at epic level (close-out fixed 4 concerns: automation static-import isolation, board view/factory split, proc-contract drift guard, async `fs.append`).

- [x] [US-719: Command runner — shared main-process streaming spawn service (IPC interface; consumed by board preload, renderer `app` API, and optional MCP tool)](../tasks/US-719-command-runner/README.md)
- [x] [US-720: Process lifecycle — whole-tree kill (`taskkill /T`) + per-owner reaping](../tasks/US-720-process-lifecycle/README.md)
- [x] [US-721: Project trust gate + dialog (per `.persephone`; `trustedProjects.txt`; RCE-explicit confirmation)](../tasks/US-721-project-trust-gate/README.md)
- [x] [US-722: `.persephone` folder + Board editor + folder-click routing (sidebar board list + main management)](../tasks/US-722-board-editor-routing/README.md)
- [x] [US-723: `board://` protocol + locked-down webview + bridge injection + CSP](../tasks/US-723-board-protocol-webview/README.md)
- [x] [US-724: `persephone` bridge (board preload) — `execute()` handle (thin client over US-719) + integration tier (`openRawLink`, `notify`, file dialogs)](../tasks/US-724-board-bridge/README.md)
- [x] [US-725: Theme contract — `--p-*` CSS variables + `persephone.theme` (live update)](../tasks/US-725-theme-contract/README.md)
- [x] [US-726: Templates & scaffolding + `ui.log` + live reload](../tasks/US-726-config-templates-log/README.md)
- [x] [US-727: Recommended-components manifest + first skin (Tabulator)](../tasks/US-727-tabulator-skin/README.md)
- [x] [US-728: Demo board — bundle `assets/demo-board/` + "Create Demo board" entry points (empty-state button + "+ New board" `SplitButton` dropdown; snapshots the prepared demo, no project-creation dialog)](../tasks/US-728-demo-board/README.md)
- [x] [US-730: Web Boards as `browser_*` MCP automation targets (snapshot/click/type a board's webview; reuse the existing CDP engine)](../tasks/US-730-board-mcp-automation/README.md)
- [x] [US-731: "Create .persephone project" Explorer context menu (create-or-reveal `.persephone` → select → open Board editor; no dialog)](../tasks/US-731-create-persephone-project/README.md)
- [x] US-732: Shared board base stylesheet — `assets/board-base.css` (page bg, themed scrollbars, monospace default) copied into every board by the scaffolder; both templates link it first
- [x] [US-734: Recommended component — Chart.js (charts/dashboards; JS theme adapter)](../tasks/US-734-chartjs-skin/README.md)
- [x] [US-735: Recommended component — Flatpickr (date / time / range picker; `--p-*` CSS skin)](../tasks/US-735-flatpickr-skin/README.md)
- [x] [US-736: Recommended component — Tom Select (rich select / tags / autocomplete; `--p-*` CSS skin)](../tasks/US-736-tom-select-skin/README.md)
- [x] [US-737: Recommended component — marked + highlight.js (markdown render + code highlighting; `--p-*` code theme)](../tasks/US-737-markdown-skin/README.md)
- [x] [US-738: Recommended component — Mermaid (diagrams; JS `themeVariables` from `persephone.theme`)](../tasks/US-738-mermaid-skin/README.md)
- [x] [US-739: Recommended component — Split.js (resizable layout panes; `--p-*` CSS skin)](../tasks/US-739-split-skin/README.md)
- [x] [US-740: Recommended component — SortableJS (drag-to-reorder lists / kanban; `--p-*` CSS skin)](../tasks/US-740-sortablejs-skin/README.md)
- [x] [US-741: Recommended component — Tippy.js (tooltips / popovers / menus; `--p-*` CSS skin)](../tasks/US-741-tippy-skin/README.md)
- [x] [US-742: Recommended component — native `<dialog>` modal (no-dependency pattern skin)](../tasks/US-742-dialog-modal-skin/README.md)
- [x] [US-744: Per-board custom icon (`icon.svg`/`png`/`ico` → tab + tile + sidebar row; `BoardIcon` fallback)](../tasks/US-744-board-icon/README.md)

---

## EPIC-032 — [Mneme — Wiki / Vector Memory service](EPIC-032.md)

Built **Mneme**, a standalone Rust knowledge-base service that turns any folder of Markdown into a locally-indexed, searchable **vector memory** (SQLite FTS5 + `sqlite-vec`, on-device int8 ONNX embedding via `ort`), exposing hybrid full-text + semantic search and file-like read/write/edit/glob/grep tools over MCP. Integrated into Persephone end-to-end: a single shared auto-reconnecting MCP client with resource-subscription live-refresh, a `MnemeProvider` (read/write/edit), an Explorer-like tree sidebar with create/rename/delete + OS and cross-root drag-drop, a root search view (markdown-rendered results, tag/date filters), a config & monitoring editor (roots, include/ignore, reindex progress, model download/inventory, log), a Settings toggle with sidecar auto-launch, a tri-state header indicator, and first-run routing to download the model. Inference is **CPU-only** (DirectML/GPU benchmarked and removed). Shipped via electron-builder `extraFiles` (`mneme.exe`, ONNX statically linked, no bundled DLLs); the ~357 MB embedding model is a **separate GitHub release** (`mneme-models-v1`) downloaded on first use. Reviewed at epic level (US-690/691/692) and per-task for the Rust crate.

- [x] [US-651: Mneme — App architecture](../tasks/US-651-mneme-architecture/README.md)
- [x] [US-652: Project scaffold + config + Document Store](../tasks/US-652-mneme-scaffold/README.md)
- [x] [US-653: Frontmatter + chunker + SQLite schema (FTS5 + sqlite-vec)](../tasks/US-653-mneme-index-schema/README.md)
- [x] [US-654: Indexer + watcher + reconcile](../tasks/US-654-mneme-indexer-watcher/README.md)
- [x] [US-655: MCP server (Streamable HTTP, loopback, text-search) + agent guide](../tasks/US-655-mneme-mcp-server/README.md)
- [x] [US-656: Model Provisioner (download + sha256 + cache)](../tasks/US-656-mneme-model-provisioner/README.md)
- [x] [US-657: Embedding Engine (ort, CPU)](../tasks/US-657-mneme-embedding-engine/README.md)
- [x] [US-658: Hybrid search (sqlite-vec KNN + RRF)](../tasks/US-658-mneme-hybrid-search/README.md)
- [x] [US-659: Concurrency & responsiveness (worker, WAL, reindex job)](../tasks/US-659-mneme-concurrency/README.md)
- [x] [US-666: grep tags/dateRange/-n + mneme://status resource](../tasks/US-666-mneme-grep-filters-status-resource/README.md)
- [x] [US-660: Persephone settings + sidecar auto-launch](../tasks/US-660-mneme-settings-sidecar/README.md)
- [x] [US-671: MCP connection auto-reconnect](../tasks/US-671-mcp-connection-auto-reconnect/README.md)
- [x] [US-670: Resource-subscription emit (capability + subscribe/unsubscribe + watcher fan-out)](../tasks/US-670-mneme-resource-subscription-emit/README.md)
- [x] [US-661: McpConnectionManager subscription support (client wiring)](../tasks/US-661-mcp-subscription-support/README.md)
- [x] [US-662: MnemeProvider (read/write/edit + live-refresh)](../tasks/US-662-mneme-provider/README.md)
- [x] [US-673: Single shared MCP connection (fix status timeouts)](../tasks/US-673-mneme-single-connection/README.md)
- [x] [US-663: MnemeTreeProvider + Explorer-like sidebar panel](../tasks/US-663-mneme-tree-provider/README.md)
- [x] [US-674: Tree editing — create/rename/delete files & folders](../tasks/US-674-mneme-tree-editing/README.md)
- [x] [US-675: Tree — drag-and-drop file upload from the OS](../tasks/US-675-mneme-tree-file-drop/README.md)
- [x] [US-676: Root main view — search with displayed results](../tasks/US-676-mneme-root-search-view/README.md)
- [x] [US-678: Search — tag & date filters](../tasks/US-678-mneme-search-filters/README.md)
- [x] US-679: Sanitize FTS5 query (hyphens/operators no longer error)
- [x] [US-680: Search results — render as markdown via MarkdownBlock](../tasks/US-680-mneme-search-results-markdown/README.md)
- [x] US-681: Lower default `topK` 10→5 + document `topK`/`subtree` in tool description
- [x] [US-685: Decouple wiki file set from index set (full filesystem navigability)](../tasks/US-685-mneme-filesystem-navigability/README.md)
- [x] [US-686: `read` returns images as vision blocks + `upload`](../tasks/US-686-mneme-binary-tools/README.md)
- [x] [US-687: Relative `mneme://` links open attachments in the Image viewer](../tasks/US-687-mneme-relative-links/README.md)
- [x] [US-683: Rename `wiki_*` tools to bare names + de-wiki wording](../tasks/US-683-mneme-wiki-naming-generalization/README.md)
- [x] [US-668: `root_config` tool (live include/ignore)](../tasks/US-668-mneme-root-config-tool/README.md)
- [x] [US-664: Config & monitoring editor (+ header indicator)](../tasks/US-664-mneme-config-editor/README.md)
- [x] [US-677: Config editor — single-page redesign + toolbar cleanup](../tasks/US-677-mneme-config-redesign/README.md)
- [x] [US-669: Async long-running ops + live progress (add-root, model download, log file)](../tasks/US-669-mneme-async-add-root-indexing/README.md)
- [x] [US-688: Tree — own drag-drop (intra-root move + cross-root / cross-window copy)](../tasks/US-688-mneme-tree-cross-root-dnd/README.md)
- [x] [US-689: Small enhancements (Log button → mneme.log; +`getDataFolder` IPC)](../tasks/US-689-mneme-small-enhancements/README.md)
- [x] [US-690: Epic completion — code review](../tasks/US-690-epic032-review/README.md)
- [x] [US-691: Epic completion — developer docs](../tasks/US-691-epic032-document/README.md)
- [x] [US-692: Epic completion — user docs](../tasks/US-692-epic032-userdoc/README.md)
- [x] [US-693: Make "Apply & reindex" async (non-blocking)](../tasks/US-693-mneme-async-apply-filters/README.md)
- [x] [US-694: CPU-only embedding (GPU/DirectML benchmarked & removed) + folder opens in Explorer](../tasks/US-694-mneme-adaptive-gpu-embedding/README.md)
- [x] [US-695: "Remove root" deletes the on-disk `.mneme` index folder](../tasks/US-695-mneme-remove-root-delete-index/README.md)
- [x] US-696: Quiet the host console (stderr capped at WARN+ when `mneme.log` sink exists)
- [x] [US-665: Installer + first release (electron-builder `extraFiles` mneme.exe; model GitHub release)](../tasks/US-665-mneme-installer-release/README.md)

---

## EPIC-031 — [Git Functionality Enhancements (incremental)](EPIC-031.md)

Grew git from the read-only v1 (EPIC-030) into day-to-day tooling, built incrementally — one user-requested increment at a time, with a **per-task** review model (not the deferred epic-level pass). Delivered: a **"Changes" panel** (working-tree status → stage / unstage / reset → **commit** via a Commit dialog with editable author + branch), a **"Branches & Tags" panel** (browse, switch, create branch, click-to-reveal in the graph), **Push** and **Pull** (Git-Extensions-style split-button; shared fetch / ahead-behind / `GIT_TERMINAL_PROMPT=0` fail-fast auth foundation; never force-pushes), a Git Tree **bottom panel** (Commit + Diff tabs), **auto-refresh** (recursive watcher + `GIT_OPTIONAL_LOCKS=0`), persisted grid column layout, File Diff compare-commits improvements, and a new UIKit **`SplitButton`**. All mutating ops stay behind the off-by-default "Git integration" setting and degrade gracefully. Small one-off tweaks were logged in the rolling **US-625** (batch-reviewed 2026-06-10). Close-out: all tasks reviewed per-task — no outstanding review at close. Future git work will be filed as separate tasks/epics.

- [x] [US-616: Changes panel — status backend + unstaged/staged display](../tasks/US-616-git-changes-panel/README.md)
- [x] [US-617: Changes panel — manual close + empty-page + persistence](../tasks/US-617-git-changes-close-lifecycle/README.md)
- [x] [US-618: Git Diff "File History" panel + datetime column + L/R side-select](../tasks/US-618-git-diff-revisions-panel/README.md)
- [x] [US-619: Multiple same-type secondary panels (composite panel keys)](../tasks/US-619-multi-panel-secondary-views/README.md)
- [x] US-620: Changes panel — "Show Git Tree" header button
- [x] US-621: Git Tree toolbar — repository name (basename + full path on hover)
- [x] US-622: Git Tree grid — preserve column width/order across refresh/load-more
- [x] US-623: Git Tree grid — persist column layout in editor state
- [x] [US-624: Git Tree auto-refresh — recursive watcher + `--no-optional-locks`](../tasks/US-624-git-tree-autorefresh/README.md)
- [x] [US-625: Rolling log of small git tweaks (closed with epic; entries batch-reviewed)](../tasks/US-625-git-small-enhancements/README.md)
- [x] [US-629: Git Tree bottom panel + "Commit" tab](../tasks/US-629-git-tree-commit-panel/README.md)
- [x] [US-630: Git Tree "Diff" tab (changed files + per-file diff)](../tasks/US-630-git-tree-commit-diff-tab/README.md)
- [x] [US-631: Changes panel — stage / unstage / reset + AVGrid `FileGrid`](../tasks/US-631-git-stage-unstage/README.md)
- [x] [US-632: Changes panel — Commit staged files (Commit dialog)](../tasks/US-632-git-commit/README.md)
- [x] [US-634: Git Tree "Branches & Tags" panel + relocate "x" close](../tasks/US-634-git-branches-tags-panel/README.md)
- [x] [US-635: "Branches & Tags" panel — polish + click-to-reveal in graph](../tasks/US-635-git-branches-panel-polish/README.md)
- [x] [US-636: Switch to branch / remote branch / commit](../tasks/US-636-git-switch-branch-commit/README.md)
- [x] [US-637: File Diff — "commits to compare" link metadata](../tasks/US-637-git-diff-compare-commits/README.md)
- [x] [US-638: Create branch (grid "Create branch here" + Commit dialog)](../tasks/US-638-git-create-branch/README.md)
- [x] [US-641: Git Push + shared fetch / ahead-behind / auth foundation](../tasks/US-641-git-push/README.md)
- [x] [US-642: Git Pull — split-button + conflict reporting + UIKit `SplitButton`](../tasks/US-642-git-pull/README.md)

---

## EPIC-030 — [Git Integration — Git Tree + File Diff editors](EPIC-030.md)

Read-first git tooling, v1. Git access via **simple-git** in the main process (`git-service.ts` + `git-ipc.ts`), exposed to the renderer through a settings-gated, directory-cached API (`api/git.ts`). A new **"Git integration" setting** (off by default) gates everything — when off, zero git activity. Git membership is detected **once on the shared `TextFileModel` host** (`gitRepo` via `rev-parse`), so every text editor inherits the **"Git Diff" switch** with no per-editor code. Two new registered editors: a **Git Tree** editor (opened from the `.git` node in Explorer — branch/commit history on `AVGrid` + an SVG `BranchTreeCell` painting a ported VS Code MIT swimlane layout, paginated via the editor-owned `GitTreeModel`), and a **File Diff** editor (host-adopting, Monaco side-by-side diff with `from`/`to` revision pickers that reuse the Git Tree component in a popover; the Unstaged side is editable and writes back). v1 is strictly read/inspect — no mutating git operations. Close-out: `/review`, `/document`, `/userdoc` run as a single deferred pass over US-610–US-613. **Review disposition:** the `styled.*` usage in `components/git-tree/` was flagged against `coding-style.md:109` but **accepted** as consistent with existing `components/` precedent (`tree-provider/`, `file-search/`, `icons/`); the rule was left unchanged.

- [x] US-610: Git service + IPC + "Git integration" setting + host detection
- [x] US-611: Git Tree component (AVGrid + SVG BranchTreeCell + swimlane layout)
- [x] US-612: Git Tree editor + Explorer `.git` entry point
- [x] US-613: File Diff editor

---

## EPIC-029 — [Standalone PageNavigator → `SecondaryViews`, a reusable panel host](EPIC-029.md)

Renamed `PageNavigator` → `SecondaryViews` family and turned the component controlled (`views` + `ISecondaryViewsState` + `setState` props — no longer bound to `PageModel`). Widened `editor.page` from the concrete `PageModel` to a new `IPageHost` interface; `BrowserPanelHost` is the second implementer, hosting the bookmarks sidebar inside the Browser empty page and drawer. The `secondaryEditor` field renamed `secondaryView` everywhere, including persisted state. Link Editor panels became always-open (no close affordance, no duplicate in-view panels). Notebook, Todo, and Rest Client moved their bespoke splitter side-panel layouts into `SecondaryViews`. The stale `editors/base/IPageHost.ts` stub (deleted in US-607) was removed; `IPageHost` now lives at `api/pages/IPageHost.ts`. Close-out: `/review` (US-607), `/document` (US-608), `/userdoc` (US-609).

- **Phase 1a — Foundation**
- [x] [US-595: Rename `secondaryEditor`→`secondaryView` + `PageNavigator`→`SecondaryViews` family](../tasks/US-595-rename-secondary-view/README.md)
- [x] [US-596: `ISecondaryViewsState` + controlled `SecondaryViews` component](../tasks/US-596-controlled-secondary-views/README.md)
- [x] [US-597: `IPageHost` typing for `editor.page` (+ derived `isMain`)](../tasks/US-597-ipagehost-typing/README.md)
- **Phase 1b — Per-editor adoption**
- [x] [US-598: Explorer — adopt + verify under new infra](../tasks/US-598-explorer-adopt/README.md)
- [x] [US-599: Archive — adopt + verify under new infra](../tasks/US-599-archive-adopt/README.md)
- [x] [US-600: Links — finalize `IPageHost` membership + `isMain`](../tasks/US-600-links-finalize-ipagehost/README.md)
- [x] [US-600-a: Links — always-on `SecondaryViews`, drop in-view panels, unify Category click](../tasks/US-600-a-links-secondaryviews-refactor/README.md)
- **Phase 2 — Browser**
- [x] [US-601: Browser adopts `SecondaryViews` in its empty page + bookmarks drawer](../tasks/US-601-browser-secondaryviews/README.md)
- **Phase 3 — Remaining editors**
- [x] [US-602: Notebook → `SecondaryViews`](../tasks/US-602-notebook-secondaryviews/README.md)
- [x] [US-603: Todo → `SecondaryViews`](../tasks/US-603-todo-secondaryviews/README.md)
- [x] [US-604: Rest Client → `SecondaryViews`](../tasks/US-604-rest-client-secondaryviews/README.md)
- **Phase 4 — Close-out**
- [x] US-607: Epic close-out — `/review` (code audit vs architecture docs)
- [x] US-608: Epic close-out — `/document` (dev docs in `/doc/`)
- [x] US-609: Epic close-out — `/userdoc` (user docs in `/docs/`)

---

## EPIC-028 — [Unified Editor Architecture — Editors as Standalone Models](EPIC-028.md)

Single-hierarchy editor rewrite via strangler-fig migration over 37 tasks. All 22 editors became top-level `EditorModel` subclasses; text-bearing editors share `IContentHost`; owner-orchestrated switching via `CONTENT_HOST_TRAIT`. The `ContentViewModel` subsystem and the `EditorView` type alias are gone. Major version bump 3.0.10 → 4.0.1. Task folders and the `EPIC-028-editor-architecture/` design folder (walkthroughs, mockups, concerns log) were deleted on close — the per-task READMEs and walkthroughs were in-flight implementation contracts, not enduring reference material. The architectural outcome is captured in `/doc/architecture/editors.md` and the EPIC-028.md doc above. `/review`, `/document`, `/userdoc` skipped per user direction (US-583 / US-584 / US-585 already refreshed the dev-doc and user-doc surfaces).

- **Phase A — Foundation**
- [x] US-547: Foundation primitives — `EditorModel`, `IContentHost`, `ComponentQueue`, `TOneState` selector subscribe, new `editorRegistry`, `PageDescriptor` v4 types, `CONTENT_HOST_TRAIT` (inert)
- [x] US-548: PageModel adapter layer — unified `editors[]` + `_mainEditorId`; `LegacyEditorAdapter`; persistence dual-reads (v3 or v4) writes v4; `compareGroups` to `PagesModel.state`
- [x] US-549: Shared chrome — `PageToolbar` + `TextChrome`; NavPanel button auto-renders for sidebar editors; portal refs retired
- **Phase B — Cross-cutting**
- [x] US-550: MCP + scripting facades partial — `mcp-handler.ts` MI1–MI5; `page.asX()` gains `force?: boolean`; `PageWrapper.type` retired
- **Phase C — Per-editor migrations**
- [x] US-551: Monaco / Text editor migration — `MonacoEditor` v4 class + `<MonacoBody>`; `CONTENT_HOST_TRAIT` + cross-camp switch
- [x] US-552: Grid editor migration — 3 registry ids collapsed into 1 class with `format`
- [x] US-552-B: Host-managed editor view state — generic `getEditorState`/`setEditorState` on `IContentHost`; HS1 pattern established
- [x] US-553: LogView editor migration — `LogViewEditor` over `TextFileModel` host; cleanup of `acquireViewModelSync` callsites
- [x] US-554: Markdown editor migration — search + compact-mode + scroll machinery
- [x] US-560: Svg editor migration — baseline Tier-5 template
- [x] US-561: Html editor migration — identity-only state slice
- [x] US-562: Mermaid editor migration — async render + lightMode HS1
- [x] US-564: Graph editor migration — six owned submodels relocated; canvas-ref bridge
- [x] US-565: Draw editor migration — bidirectional Excalidraw payload loop; HS1 darkMode
- [x] US-555: Link editor migration — first sidebar-owning Tier-5; `beforeNavigateAway` + `onMainEditorChanged` first exercises
- [x] US-556: Todo editor migration — first non-sidebar-owning Tier-5 since Draw
- [x] US-563: Rest Client editor migration — `RestClientShared` extraction; response-cache split-by-scale
- [x] US-557: Notebook editor migration — outer-only scope; inner per-note deferred to US-579
- [x] US-558: Browser editor migration — first no-host v4 editor; first to embed another v4 EditorModel (drawer LinkEditor)
- [x] US-566: Compare editor migration — verification pass (zero source changes; landed in US-548 + US-549)
- [x] US-567: Explorer editor migration — first secondary-only `EditorModel` v4 native
- [x] US-568: PDF editor migration — generic v4-native no-host restore branch (`V4_NO_HOST_EDITOR_IDS`) + `wrapLegacyForPage` early-return for v4 instances
- [x] US-569: Image editor migration — dual-resource lifecycle (blob URL + cache file)
- [x] US-570: Archive editor migration — first no-host sidebar-owning v4 editor; completes EX8 `instanceof` chain
- [x] US-571: Video editor migration — streaming-server session lifecycle + VLC integration; `PageToolbar.noSpacer` opt-in
- [x] US-572: Settings editor migration — simplest no-host (identity-only state)
- [x] US-573: About editor migration — near-clone of Settings
- [x] US-574: MCP Inspector editor migration — most stateful no-host; mechanically the Video pattern in place
- [x] US-575: Storybook editor migration — singleton with persisted UI state
- [x] US-576: Category editor migration — only tree-provider consumer; closes walkthrough-30
- **Phase D — Cleanup**
- [x] US-581: Native v4 editor registry — internalize matching + retire legacy-registry dependency
- [x] US-579: Notebook inner per-note migration — embedded v4 `EditorModel` instances per note via duck-typed `NoteItemEditModel` host
- [x] US-559: Strangler-fig retirement — delete `LegacyEditorAdapter` + content-view subsystem + dual-read persistence; fold legacy `EditorModel` base into `TextFileModel`; bump 3.0.10 → 4.0.1
- [x] US-582: Post-strangler cleanup — drop `V4` prefix, fold `editors/base/v4/*` up, strip EPIC-028 narrative across ~135 files
- [x] US-583: EPIC-028 documentation audit + punch list — 72 files audited, 20 changes identified, U1/U2/U3 user-locked
- [x] US-584: Dev-doc refresh for EPIC-028 close-out — 9 architecture files updated, `editor-guide.md` rewritten, `CLAUDE.md` Key Files refreshed, 5 diagrams rewritten + 2 retired
- [x] US-585: User-doc + QA sweep for EPIC-028 close-out — `page.md` + `editors.md` + `whats-new.md` v4.0.1 section; 37 spot-check files clean

---

## EPIC-025 — [Unified Component Library and Storybook Editor](EPIC-025.md)

- [x] US-437: Design system HTML — closed; exploration complete
- [x] [US-438: Pattern research — adopted patterns + component naming table](../tasks/US-438-pattern-research/README.md)
- [x] US-439: New components folder setup + CLAUDE.md
- [x] US-426: Design tokens — spacing, sizing, border-radius, font-size constants
- [x] [US-427: Layout primitives — Flex, HStack, VStack, Panel, Card, Spacer](../tasks/US-427-layout-primitives/README.md)
- [x] [US-440: Bootstrap component set — minimal components needed for Storybook](../tasks/US-440-bootstrap-components/README.md)
- [x] [US-434: Storybook editor — component browser, live preview, property editor](../tasks/US-434-storybook-editor/README.md)
- [x] [US-450: UIKit Toolbar — semantic landmark, roving tabindex, Storybook adoption](../tasks/US-450-uikit-toolbar/README.md)
- [x] [US-451: UIKit layout refactor — unified Panel + Storybook lighthouse](../tasks/US-451-uikit-panel-refactor/README.md)
- [x] [US-432: Dialog component — new implementation + migration](../tasks/US-432-dialog-component/README.md)
- [x] [US-466: UIKit Popover — overlay primitive](../tasks/US-466-uikit-popover/README.md)
- [x] [US-467: UIKit Tooltip — overlay primitive](../tasks/US-467-uikit-tooltip/README.md)
- [x] [US-468: UIKit ListBox — virtualized list primitive](../tasks/US-468-uikit-listbox/README.md)
- [x] [US-469: UIKit RadioGroup — selection primitive](../tasks/US-469-uikit-radiogroup/README.md)
- [x] [US-470: UIKit Textarea — multi-line text input primitive](../tasks/US-470-uikit-textarea/README.md)
- [x] [US-471: UIKit Input — start/end slots](../tasks/US-471-uikit-input-slots/README.md)
- [x] [US-472: UIKit Select — searchable single-value combobox](../tasks/US-472-uikit-select/README.md)
- [x] [US-473: UIKit Popover — resizable mode](../tasks/US-473-uikit-popover-resizable/README.md)
- [x] [US-474: UIKit PathInput — hierarchical-path autocomplete input](../tasks/US-474-uikit-pathinput/README.md)
- [x] [US-475: UIKit Tag and TagsInput — pill primitive + tag-row composite](../tasks/US-475-uikit-tag/README.md)
- [x] [US-452: About screen — UIKit migration](../tasks/US-452-about-screen-migration/README.md)
- [x] [US-455: MermaidView — UIKit migration](../tasks/US-455-mermaid-view-migration/README.md)
- [x] [US-456: SvgView — UIKit migration](../tasks/US-456-svg-view-migration/README.md)
- [x] [US-457: HtmlView — UIKit migration](../tasks/US-457-html-view-migration/README.md)
- [x] [US-458: ImageViewer — UIKit migration](../tasks/US-458-image-viewer-migration/README.md)
- [x] [US-459: BaseImageView — UIKit adoption](../tasks/US-459-base-image-view-adoption/README.md)
- [x] [US-460: MarkdownSearchBar — UIKit migration](../tasks/US-460-markdown-search-bar-migration/README.md)
- [x] [US-461: Shared FindBar — consolidate MarkdownSearchBar + BrowserFindBar](../tasks/US-461-shared-findbar-consolidation/README.md)
- [x] [US-462: TorStatusOverlay — UIKit migration](../tasks/US-462-tor-status-overlay-migration/README.md)
- [x] [US-463: BrowserDownloadsPopup + DownloadButton — UIKit migration](../tasks/US-463-browser-downloads-migration/README.md)
- [x] [US-464: UrlSuggestionsDropdown — UIKit migration](../tasks/US-464-url-suggestions-dropdown-migration/README.md)
- [x] [US-465: CompareEditor — UIKit migration](../tasks/US-465-compare-editor-migration/README.md)
- [x] [US-476: AlertsBar + AlertItem — UIKit migration](../tasks/US-476-alerts-bar-migration/README.md)
- [x] [US-477: Progress dialog — UIKit migration](../tasks/US-477-progress-dialog-migration/README.md)
- [x] [US-481: UIKit Menu + WithMenu](../tasks/US-481-uikit-menu-with-menu/README.md)
- [x] [US-484: UIKit ListBox extensions — row tooltip, context menu, predicate selection, section rows](../tasks/US-484-uikit-listbox-extensions/README.md)
- [x] [US-485: UIKit Tree — virtualized expand/collapse tree primitive](../tasks/US-485-uikit-tree/README.md)
- [x] [US-488: UIKit Tree extensions — drag-and-drop via traits](../tasks/US-488-uikit-tree-dnd/README.md)
- [x] [US-489: UIKit Tree extensions — lazy children loading](../tasks/US-489-uikit-tree-lazy-load/README.md)
- [x] [US-486: UIKit Splitter — resizable divider primitive](../tasks/US-486-uikit-splitter/README.md)
- [x] [US-487: UIKit model-view migrations — Select, Menu, Popover, PathInput](../tasks/US-487-uikit-model-view-migrations/README.md)
- [x] [US-478: PageTabs / PageTab — UIKit migration](../tasks/US-478-page-tabs-migration/README.md)
- [x] [US-479: FileList + RecentFileList — UIKit migration](../tasks/US-479-filelist-migration/README.md)
- [x] [US-490: OpenTabsList — UIKit migration](../tasks/US-490-opentabslist-migration/README.md)
- [x] [US-491: FolderItem + MenuBar left list — UIKit migration](../tasks/US-491-folderitem-migration/README.md)
- [x] [US-495: ScriptLibraryPanel — UIKit migration](../tasks/US-495-scriptlibrarypanel-migration/README.md)
- [x] [US-496: ToolsEditorsPanel — UIKit migration](../tasks/US-496-toolseditorspanel-migration/README.md)
- [x] [US-497: TreeProviderView — UIKit Tree migration](../tasks/US-497-treeproviderview-migration/README.md)
- [x] [US-492: Sidebar — final integration testing and cleanup](../tasks/US-492-sidebar-integration-testing/README.md)
- [x] [US-480: MarkdownView — UIKit migration](../tasks/US-480-markdown-view-migration/README.md)
- [x] [US-503: UIKit `Dot` primitive — colored circle for status / swatch / palette](../tasks/US-503-uikit-dot/README.md)
- [x] [US-498: Settings page — UIKit migration](../tasks/US-498-settings-page-migration/README.md)
- [x] [US-504: UIKit ghost variants + hover-reveal pattern](../tasks/US-504-uikit-ghost-and-hover-reveal/README.md)
- [x] [US-499: TodoEditor — UIKit migration](../tasks/US-499-todoeditor-migration/README.md)
- [x] [US-500: TextEditor chrome — UIKit migration](../tasks/US-500-text-editor-chrome-migration/README.md)
- [x] [US-533: UIKit `Autocomplete` primitive — free-text input with suggestions dropdown](../tasks/US-533-uikit-autocomplete/README.md)
- [x] [US-534: UIKit primitive extensions — `Text.color` free-form, `Textarea` width/flex, `Panel.dimmed`](../tasks/US-534-uikit-primitive-extensions/README.md)
- [x] [US-501: RestClient editor — UIKit migration](../tasks/US-501-rest-client-migration/README.md)
- [x] [US-502: MCP Inspector — UIKit migration](../tasks/US-502-mcp-inspector-migration/README.md)
- [x] [US-505: Archive editor — UIKit migration](../tasks/US-505-archive-editor-migration/README.md) — absorbed into other migrations
- [x] [US-506: Category editor — UIKit migration](../tasks/US-506-category-editor-migration/README.md) — absorbed into other migrations
- [x] [US-507: Explorer + Search secondary editors — UIKit migration](../tasks/US-507-explorer-secondary-editors-migration/README.md) — absorbed into other migrations
- [x] [US-508: Draw editor — UIKit migration](../tasks/US-508-draw-editor-migration/README.md)
- [x] [US-509: Grid editor chrome — UIKit migration](../tasks/US-509-grid-editor-chrome-migration/README.md)
- [x] [US-511: PDF Viewer — UIKit migration](../tasks/US-511-pdf-viewer-migration/README.md) — absorbed into other migrations
- [x] [US-516: UIKit Breadcrumb primitive](../tasks/US-516-uikit-breadcrumb/README.md)
- [x] [US-517: UIKit CollapsiblePanelStack primitive](../tasks/US-517-uikit-collapsible-panel-stack/README.md)
- [x] [US-512: Notebook editor — UIKit migration](../tasks/US-512-notebook-editor-migration/README.md)
- [x] [US-519: UIKit primitive additions for Graph editor migration](../tasks/US-519-uikit-graph-editor-precursors/README.md)
- [x] [US-513: Graph editor — UIKit migration](../tasks/US-513-graph-editor-migration/README.md)
- [x] [US-520: UIKit primitive additions for Video / Audio editor migration](../tasks/US-520-uikit-video-editor-precursors/README.md)
- [x] [US-514: Video / Audio Player editor — UIKit migration](../tasks/US-514-video-audio-player-migration/README.md)
- [x] [US-521: UIKit `name` debug attribute for all primitives](../tasks/US-521-uikit-name-debug-attribute/README.md)
- [x] [US-515: Browser editor chrome — UIKit migration](../tasks/US-515-browser-editor-chrome-migration/README.md)
- [x] [US-522: UIKit `name` debug-attribute rollout across migrated screens](../tasks/US-522-uikit-debug-naming-rollout/README.md)
- [x] [US-523: LinkEditor — UIKit migration](../tasks/US-523-link-editor-migration/README.md)
- [x] [US-529: UIKit ProgressBar primitive — inline linear progress](../tasks/US-529-uikit-progress-bar/README.md)
- [x] [US-524: LogView editor — UIKit migration](../tasks/US-524-log-view-editor-migration/README.md)
- [x] [US-525: App shell + PageNavigator — chrome migration](../tasks/US-525-app-shell-chrome-migration/README.md)
- [x] [US-530: Editor base shared chrome — UIKit migration](../tasks/US-530-editor-base-chrome-migration/README.md)
- [x] [US-531: `showPopupMenu` — UIKit Menu migration](../tasks/US-531-show-popup-menu-migration/README.md)
- [x] [US-535: `MenuItem` caller-import flips](../tasks/US-535-menuitem-import-flips/README.md)
- [x] [US-536: `components/data-grid/` → `uikit/AVGrid/` migration](../tasks/US-536-uikit-datagrid/README.md)
- [x] [US-538: UIKit `RenderGrid` — virtualization primitive promotion](../tasks/US-538-uikit-rendergrid/README.md)
- [x] [US-539: UIKit `MultiSelect` — multi-value selection primitive](../tasks/US-539-uikit-multiselect/README.md)
- [x] [US-537: RestClient `TreeView` → UIKit `Tree` flip](../tasks/US-537-treeview-flip-restclient/README.md)
- [x] [US-542: Grid options popovers — `Popper` → UIKit `Popover` flip](../tasks/US-542-grid-options-popover-flip/README.md)
- [x] [US-543: KEEP folders — UIKit migration of legacy primitive consumers](../tasks/US-543-keep-folders-uikit-migration/README.md)
- [x] [US-532: Final `components/` sweep — empty the legacy folder](../tasks/US-532-legacy-components-removal/README.md)
- [x] [US-545: EPIC-025 documentation audit + punch list](../tasks/US-545-doc-audit/README.md)
- [x] [US-546: Dev-doc refresh for EPIC-025 close-out](../tasks/US-546-dev-doc-refresh/README.md)
- [x] [US-547: User-doc + QA + asset-guide sweep for EPIC-025 close-out](../tasks/US-547-user-doc-sweep/README.md)
- [x] US-518: UIKit ListBox `selectionStyle="accent"` + Storybook left-panel migration

---

## EPIC-026 — [Trait System — Universal Data Adaptation Layer](EPIC-026.md)

- [x] [US-428: Trait system core — TraitKey, TraitSet, Traited, traited()](../tasks/US-428-trait-system-core/README.md)
- [x] [US-444: Trait-based drag-drop infrastructure + link pilot — TraitRegistry, serialization, native HTML5 DnD, convert link-drag](../tasks/US-444-trait-drag-drop-infrastructure/README.md)
- [x] [US-447: Convert remaining data drags to trait-based system](../tasks/US-447-convert-data-drags-to-traits/README.md)
- [x] [US-448: Cross-type drop targets — FILE_FOLDER→Links import, cross-editor category drops, LINK→RestClient](../tasks/US-448-cross-type-drop-targets/README.md)
- [x] [US-449: Remove React-DnD dependency — convert component-level drags to native HTML5](../tasks/US-449-remove-react-dnd/README.md)
- [x] US-446: Documentation — trait system guide in /doc/architecture/

---

## EPIC-024 — [Video Player Editor](EPIC-024.md)

- [x] US-412: Video player standalone editor — model, registration, UI shell
- [x] US-413: Video playback component (video.js + hls.js)
- [x] US-414: URL input with cURL parsing and format detection
- [x] US-415: IProvider streaming extension (readStream + range support)
- [x] US-416: Local video streaming server for VLC and proxied sources
- [x] US-417: VLC integration — settings and launch

---

## EPIC-023 — [Unified ILinkData Pipeline](EPIC-023.md)

- [x] US-404: Define `ILinkData` interface and helper functions
- [x] US-405: Loosen EventChannel constraint and consolidate link pipeline events
- [x] US-406: Refactor Layer 1 parsers to use ILinkData
- [x] US-407: Refactor Layer 2 resolvers to use ILinkData
- [x] US-408: Refactor Layer 3 open handler and replace ISourceLink
- [x] US-409: Update all pipeline callers to use createLinkData / linkToLinkData
- [x] US-410: Update script API types, IoNamespace, and editor-types
- [x] US-411: Update architecture documentation

---

## EPIC-021 — [Browser Automation API (Lightweight RPA)](EPIC-021.md)

- [x] US-365: CDP integration (Electron debugger API)
- [x] US-366: Browser query and interaction API
- [x] US-367: Browser wait methods (waitForSelector, waitForNavigation)
- [x] US-368: Tab management and background automation
- [x] US-371: Browser accessibility snapshot
- [x] US-369: MCP browser automation commands
- [x] US-375: Automation layer architecture (refactoring)
- [x] US-376: Input dispatch via CDP (Trusted Types fix)
- [x] US-377: Ref resolution improvements
- [x] US-374: Accessibility snapshot: include iframes, detect overlays/popups
- [x] US-372: Fix script implicit return with block-body callbacks
- [x] US-373: Missing Playwright MCP browser tools (browser_hover implemented)
- [x] US-379: Fix browser_evaluate — accept `function` param (Playwright compat)
- [x] US-380: Fix browser_select_option — accept `values` array (Playwright compat)
- [x] US-381: Fix browser_wait_for — add `time` and `textGone` params (Playwright compat)
- [x] US-382: Fix browser_tabs — action-based interface (Playwright compat)
- [x] US-378: Known issues & edge cases (review before epic completion)
- [x] US-383: Block browser automation on incognito/Tor pages
- [x] US-384: MCP browser tools toggle (optional Playwright tools)
- [ ] US-370: Data protection hooks (PHI sanitization layer) — moved to backlog

---

## EPIC-020 — [Browser Network Request Logging & Resource Discovery](EPIC-020.md)

- [x] US-362: Network request logging in main process
- [x] US-363: Merge network logs into Show Resources
- [x] US-364: Open non-GET network requests in RestClient

---

## EPIC-018 — [Secondary Editors — Content Applications](EPIC-018.md)

- [x] US-337: Add `imgSrc` to ITreeProviderItem
- [x] US-338: Move favicon-cache to shared location
- [x] US-339: ItemTile component
- [x] US-340: CategoryView tile modes
- [x] US-341: Rename CategoryEditor → ExplorerFolderEditor + view mode
- [x] US-342: Test in Explorer — fixes and adjustments
- [x] US-343: Make folder editor provider-agnostic
- [x] US-344: LinkTreeProvider
- [x] US-345: Shared panel components
- [x] US-346: Extract LinksList and LinksTiles
- [x] US-348: LinkEditor refactoring — browser removal, context menus
- [x] US-349: CategoryView uses LinksList/LinksTiles
- [x] US-350: ILink type consolidation
- [x] US-351: Secondary editor registration
- [x] US-352: Clean up and unify link actions
- [x] US-353: Replace CategoryTree with TreeProviderView in LinkCategoryPanel
- [x] US-354: Consolidate ILink drag-drop into LinkDragEvent
- [x] US-355: Standalone link collection page
- [x] US-356: Multi-file drop handler
- [x] US-357: Link secondary editor fixes
- [x] US-358: HTML resource extraction
- [x] US-359: Links panel improvements
- [x] US-361: Adopt libarchive-wasm for multi-format archive support

## EPIC-019 — [Explorer as Secondary Editor + Multi-Panel Support](EPIC-019.md)

- [x] US-327: Multi-panel secondaryEditor
- [x] US-328: Create ExplorerEditorModel
- [x] US-329: Wire PageModel to ExplorerEditorModel
- [x] US-330: Search as Explorer panel
- [x] US-331: Per-editor highlighting
- [x] US-332: Simplify pageNavigatorModel
- [x] US-333: Replace expandSecondaryPanel event with direct method
- [x] US-334: Explorer/Search state persistence
- [x] US-335: Update documentation for EPIC-019
- [x] US-336: Improve Explorer/Archive panel highlighting

## EPIC-017 — [Page/Editor Architecture Refactor](EPIC-017.md)

- [x] US-317: Rename core types
- [x] US-318: Rename PageModel → EditorModel
- [x] US-319: Rename editor subclasses + EditorModule interface
- [x] US-320: Rename remaining editor names for consistency
- [x] US-321: Create PageModel class
- [x] US-322: Wire PagesModel to PageModel
- [x] US-323: Simplify navigatePageTo
- [x] US-324: Clean up EditorModel
- [x] US-326: EPIC-017 post-refactor bug fixes

## EPIC-016 — [Secondary Editors — Sidebar Extension System](EPIC-016.md)

- [x] US-312: Source link persistence
- [x] US-313: Secondary editor lifecycle
- [x] US-314: Secondary editor registry
- [x] US-315: ZipPageModel + ZipSecondaryEditor
- [x] US-316: Refactor PageNavigator for secondary editor models

## EPIC-015 — [ITreeProvider — Browsable Source Abstraction](EPIC-015.md)

- [x] US-290: Tree provider types
- [x] US-291: FileTreeProvider
- [x] US-292: ZipTreeProvider
- [x] US-293: TreeProviderView
- [x] US-295: CategoryView
- [x] US-296: Nav panel tree provider
- [x] US-297: Folder editor
- [x] US-298: NavigationData
- [x] US-299: Navigator toggle
- [x] US-300: Sidebar tree provider
- [x] US-301: Page navigator panels
- [x] US-302: Secondary provider
- [x] US-303: Link pipe utils
- [x] US-304: Navigation data persistence
- [x] US-305: Collapsible panel history
- [x] US-306: File search component
- [x] US-307: Search panel integration
- [x] US-308: Decommission nav search
- [x] US-310: Remove file explorer
- [x] US-311: Explorer autorefresh

## EPIC-012 — [Unified Link & Provider Architecture](EPIC-012.md)

- [x] US-260: EventChannel LIFO
- [x] US-261: Interfaces/types
- [x] US-262: FileProvider/ContentPipe
- [x] US-263: Link event channels
- [x] US-264: Raw link parsers
- [x] US-265: Pipe resolvers
- [x] US-266: Open handler
- [x] US-267: Migrate entry points
- [x] US-268: Migrate TextFileIOModel
- [x] US-269: Zip transformer
- [x] US-270: HTTP provider
- [x] US-271: Script API docs
- [x] US-273: cURL parser
- [x] US-274: Migrate reference editors
- [x] US-275: Decrypt transformer
- [x] US-276: Pipe serialization
- [x] US-288: Review EPIC-012
- [x] US-289: Browser image cache

## EPIC-013 — [Rebrand to "Persephone"](EPIC-013.md)

## EPIC-010 — [Rest Client](EPIC-010.md)

- **EPIC-063** — [De-React Epic E5: delete the React secondary-view contract](EPIC-063.md) — completed 2026-08-25
  - [x] US-1069: The icon DOM arm — `SecondaryViewsView.resolveIcon` returns a DOM node via `createEditorIconElement`, so a vanilla panel with no registry `icon` override keeps its glyph (E5-2)
  - [x] US-1070: `link-editor`'s three secondary views (`link-category`, `link-tags`, `link-hostnames`) + their panels
  - [x] US-1071: `notebook`'s two secondary views + `category-tree`, `TagsListView` — closes the notebook's last `.tsx`
  - [x] US-1072: The three thin providers — `archive-tree`, `rest-panel`, `board-secondary:*`
  - [x] US-1073: The git pair — `git-changes`, `git-diff-revisions` + the `components/git-tree` React leaves
  - [x] US-1074: `mneme-tree`
  - [x] US-1075: `explorer`'s two (`explorer`, `boards`) + `BoardsTree`, `ToolsTree`
  - [x] US-1076: Delete the contract — registry single-armed, `LazySecondaryView.tsx` / `SideBarPanelHeader.tsx` / `SecondaryViews`' React child path / `EditorIcon.tsx` removed; re-measure E5-3

# De-React Refactoring — Second Pass

**Date:** 2026-08-31
**Scope:** `src/renderer` (~860 files), excluding the sanctioned React island `editors/draw/**`.
**Method:** three parallel code surveys — (1) surviving React-era patterns, (2) workarounds /
suspicious indirect code, (3) ground-truth audit of the view/state infrastructure — followed by
spot-verification of the highest-leverage claims against source.

**Headline:** the migration is *clean* at the surface level — zero React imports, zero JSX, zero
`.tsx` outside `draw`, zero Emotion, zero `TODO/FIXME/HACK` markers, and almost every deferral
carries a paragraph-length comment. What remains is one layer deeper: React's *architecture*
survives in specific clusters (effect emulation, props-snapshot pushing, stale React rationale),
and a family of workarounds exists because a few framework-level mechanisms are missing
(post-dispatch scheduling, owner-bound timers, a unified disposal contract, an echo-write guard).
This report inventories both and proposes the small set of mechanisms that would retire most of
the workarounds at once.

---

## Part 1 — React patterns that survived and should be removed

Ordered by leverage. Everything here is compatible with the documented house conventions
(`doc/standards/model-view-pattern.md`, `src/renderer/uikit/CLAUDE.md`) — these are places where
the code *violates* or *under-uses* those conventions in a React-shaped way, not proposals to
change the conventions.

### 1.1 `useEffect` emulation: `DepsGate` + `queueMicrotask` effect bodies

> **DELIVERED by [EPIC-082](epics/completed.md) (2026-09-01), US-1267–US-1270.** Zero
> `queueMicrotask` and zero `DepsGate` remain in the graph and rest-client files below. The counts
> in this section are the original survey's and are **stale**: `GraphDetailPanelView` had 9
> `createDepsGate()` instances (19 was a `DepsGate` *text* count) and 10 deferred bodies, not 11.
> Note also that a `DepsGate` alone is **not** a defect — it is the sanctioned form for prop-derived
> change detection, and 14 instances were deliberately retained across US-1269/US-1270.

The heaviest cluster. The pattern transliterates `useEffect(fn, [deps])`: a `DepsGate` compares a
dep array at the prop-pump boundary, then defers the body in a `queueMicrotask` that re-validates
*every* dependency again from scratch (because the microtask may run after props moved), guarded
by `live` / `isLive` flags.

**Hotspot:** `src/renderer/editors/graph/GraphDetailPanelView.ts` — 19 `DepsGate` references and
**11 `queueMicrotask` effect bodies** in one file. Seven near-identical private methods
(`runNodeGate`, `runTabGate`, `runSelectionGate`, `runExpandGate`, `runCollapseGate`,
`runExpandedCallbackGate`, `runLinksGate`), each shaped like:

```ts
// GraphDetailPanelView.ts:245
private runTabGate(state: GraphDetailState): void {
    const isMulti = this.props.nodes.length > 1;
    if (!this.tabGate.changed([isMulti, state.activeTab]) || !isMulti || state.activeTab !== "links") return;
    queueMicrotask(() => {
        if (!this.live || !this.driver.model.isLive || this.props.nodes.length <= 1
            || this.driver.model.state.get().activeTab !== "links") return;
        this.driver.model.setActiveTab("info");
    });
}
```

There is no render/commit phase in this codebase, so nothing forbids writing state synchronously
from `onUpdate` — the microtask is inherited React discipline, and its cost is the triple guard
re-checked eleven times. `GraphDetailPanelView.ts:595` and `:632` compress the same pattern onto
single ~900-character lines.

Same shape, smaller: `editors/graph/GraphLegendPanelView.ts:472,615`,
`editors/graph/GraphBodyView.ts:706`, `editors/rest-client/ResponseViewerView.ts:159`,
`editors/rest-client/RequestBuilderView.ts`, `editors/settings/sections/McpSectionModel.ts`
(9 gate refs), `editors/file-diff/FileDiffBodyView.ts`.

**Scale:** 17 files use `DepsGate`; 36 `queueMicrotask` + 8 `Promise.resolve().then` sites
renderer-wide.

**Fix:** apply the treatment EPIC-056 (C3-6/C3-7) already applied to `uikit/Select`, `Tree`,
`ListBox`, `MultiSelect` — those were deliberately de-microtasked and now document why. Effect
bodies become synchronous consequences at the write site (the documented derive-on-write
convention), or selector-scoped `bind()` calls where the trigger is a state change. Most gates
disappear because `state.subscribe(listener, selector)` already does the change detection.

### 1.2 Stale React rationale kept as live justification

> **DELIVERED by [EPIC-082](epics/completed.md) (2026-09-01), US-1271.** Three false deferrals
> removed; `CategoryViewImpl.ts:102` was a wording fix only — the code it described was correct.

Comments that justify a deferral with a React mechanism that no longer exists. The code may still
be defensible, but the *stated reason* is false, so a future reader cannot tell whether the
deferral is load-bearing:

- `components/tree-provider/TreeProviderViewModel.ts:205-207` — *"setProps runs during render, so
  a synchronous state.update here would trip React's update-while-rendering warning"* →
  `queueMicrotask` at `:209`. There is no render and no warning to trip.
- `components/tree-provider/CategoryViewModel.ts:187` — *"setProps runs during render, where a
  state write is not allowed"* → `Promise.resolve().then()` at `:188`.
- `components/tree-provider/CategoryViewModel.ts:502` — *"a state write straight out of a drag
  handler can land mid-render"* → `queueMicrotask` at `:503`, wrapping **every** drag-state write,
  so all drag feedback is one microtask late by construction.
- `components/tree-provider/CategoryViewImpl.ts:102` — *"…before its layout effect runs"*.
- `uikit/shared/overlayRegistry.ts:59-63` and `uikit/shared/tooltipRegistry.ts:117-120` —
  *"Snapshot for `useSyncExternalStore`"*: `getVersion()` has **zero callers** (verified by grep;
  only the two definitions exist). Dead API kept for a hook that is gone. Delete both.

`components/tree-provider/TreeProviderViewImpl.ts:371-373` is the honest counter-example — it
documents a *real* migration bug and is the template for what the others should say (or the
deferral should simply be removed).

The `components/tree-provider/**` folder is the last un-migrated island in spirit: it also holds
the render-prop machinery (§1.6) and portal refs (§1.7). It deserves one dedicated cleanup task.

### 1.3 Controlled `{ state, setState }` props and literal `setState(partial)`

- `ui/secondary-views/SecondaryViewsView.ts:23-31` — a props interface carrying
  `state: ISecondaryViewsState` + `setState: (patch: Partial<…>) => void`. This is React
  "lifting state up" verbatim, patch-object `setState` included, with
  `SecondaryViewsModel.setStateQuiet` (`SecondaryViewsModel.ts:40-46`) as the "uncontrolled
  escape hatch". The feeding bridges (`editors/browser/BrowserSecondaryViews.ts:42-54`,
  `ui/app/PageContentView.ts:110`) subscribe to reactive state, snapshot it into a fresh props
  object, and `update()` the child on every notification. The model is already an `IState`; pass
  the model and let the child `bind()` — this is exactly the props-pump convention
  `model-view-pattern.md` prescribes and cites `PageContentView` for.
- `editors/notebook/ExpandedNoteView.ts:372-374` — a private
  `setState(values: Partial<ExpandedState>)` doing `Object.assign` inside `update()`, called 10×
  with object literals (`this.setState({ addingTag: true, newTagValue: "" })`). One-off, but a
  perfect specimen; inline the `state.update` calls.

### 1.4 Full teardown-and-rebuild `render()` methods

**24 sites** do `root.replaceChildren()` then re-append the whole subtree on every update — a
React function-component render with no reconciler underneath. Clearest:

- `editors/board-info/BoardInfoEditorView.ts:171-185` — `sync(props)` releases all dynamic
  children, clears the root, and re-runs a tree of `render*` helpers (`renderInstall`,
  `renderProperties`, `renderVersions`, `renderVersionRow`) per update.
- `editors/mcp-inspector/McpInspectorView.ts:255,264` — two `private render(state)` methods that
  dispose children and rebuild wholesale; also `PromptsPanel.ts:387`, `ResourceContentView.ts:69,160`,
  `ToolResultView.ts:162`.
- `editors/about/AboutView.ts:112`, `editors/base/TextChromeView.ts:335,470`,
  `editors/settings/sections/BrowserProfilesSection.ts:53`, `editors/settings/sections/McpSection.ts:64`,
  `editors/markdown/MarkdownBlockView.ts:210,339,362`, `editors/mneme-config/RootsPanel.ts:305`.

**Fix:** the sanctioned structural helpers — `KeyedList` for collections, `SubtreeSwap` for a
conditional branch, per-field `bind()` for scalar text/attributes. For rarely-changing panels
(About, BoardInfo) a rebuild may be acceptable; then gate it on the *inputs that matter* rather
than running on every parent update.

Related: hand-rolled re-implementations of the sanctioned helpers —
`ui/dialogs/InputDialogView.ts:140-194` re-implements `KeyedList` with an index-keyed `Map` and
allocates a fresh inline `onClick` per button per update;
`components/tree-provider/TreeProviderViewImpl.ts:167-181` re-implements `SubtreeSwap` with
manual `enterTreeArm`/`leaveTreeArm`; `ui/app/PageContentView.ts:125-182` does both.

### 1.5 Shallow "projection changed?" memos where a selector `bind()` suffices

> **PARTLY DELIVERED.** `CategoryViewImpl`'s 8-term chain went with EPIC-082's US-1272. The other
> three chains (`GitRefsView`, `MarkdownBodyView`, `PopoverView`) were unassigned by Part 5 and are
> now in [tasks/backlog.md](tasks/backlog.md) with package 8. **The "fresh string" selector claim
> below is wrong:** `compareSelection` (`core/state/state.ts:30-42`) identity-compares **arrays**
> only — it recursively value-compares plain objects and compares strings by value. So
> `GraphLegendPanelView`'s joined-key selector is correct by design and was deliberately kept. Only
> the fresh-**array** selectors (the four dialog `?? []` cases, still US-1258) are real defects.

`React.memo`'s shallow compare, inlined by hand:

- `components/tree-provider/CategoryViewImpl.ts:278-330` — an 8-term `!==` chain against
  `this.lastProjection`.
- `editors/git-tree/GitRefsView.ts:116-128` — same shape, 4 terms.
- `editors/markdown/MarkdownBodyView.ts:391-405` — `previous`/`lastProjection` swap.
- `uikit/Popover/PopoverView.ts:348,377-380` — `previousProps` compare (`componentDidUpdate`).

`TOneState.subscribe(listener, selector)` already performs this comparison at the source
(`core/state/state.ts:29-40`). Where the inputs come from props rather than state, `DepsGate` is
the sanctioned form — but prefer moving the data to a model + `bind()`.

**Also fix while there:** documented selector anti-patterns live in shipped code — selectors that
allocate a fresh array (`(state) => state.buttons ?? []` at `ui/dialogs/InputDialogView.ts:120`,
`ConfirmationDialogView.ts:72`, `CommitDialogView.ts:168`, `TextDialogView.ts:80`) or a fresh
string (`state.selectedNodes.map(...).join(",")` at `editors/graph/GraphLegendPanelView.ts:467`).
Arrays are identity-compared, so these fire on **every** dispatch — exactly what
`model-view-pattern.md:428-441` forbids, and silent. (See P8 for a lint idea.)

### 1.6 Render props

> **DELIVERED by [EPIC-082](epics/completed.md) (2026-09-01), US-1272.** The tree-provider instance
> is dismantled: `renderItems: (props) => Node` became a caller-supplied
> `itemsView(host, initialProps) => CategoryItemsViewHandle` factory. **The stated cost below is
> wrong** — the callbacks were stable bound fields, not fresh closures; the real defect was split
> ownership. uikit row-renderers remain a legitimate extension point, as this section says.

15 declarations of "function prop returning a node tree". The purest:
`components/tree-provider/CategoryViewModel.ts:103` `renderItems: (props) => Node`, invoked at
`CategoryViewImpl.ts:334-360` with a freshly built **15-key props object containing 11
callbacks per update**. Others: `uikit/ListBox/types.ts:150`, `uikit/Tree/types.ts:176,201`,
`components/page-manager/PageManagerView.ts:11` (`renderPage: (id) => VanillaViewCtor` —
component-type-as-prop), `uikit/CollapsiblePanelStack/CollapsiblePanelStackView.ts:23`.

In uikit primitives a row-renderer is a legitimate extension point (keep it), but the call-site
contract should be a *stable* renderer receiving a model/row handle — not a per-update bag of 11
closures. The tree-provider instance is the one to dismantle.

### 1.7 Refs, ref boxes, and portals

> **PORTALS DELIVERED by [EPIC-082](epics/completed.md) (2026-09-01), US-1273.** `toolbarPortalRef`
> became `toolbarHost` (the mechanism was already host-passing; only the React vocabulary was
> wrong), and the link-editor's three ref props were **dead** — the whole `LinkEditorProps`
> interface was unreferenced and is deleted. **Callback-ref drilling and the `{current: T}` boxes
> are NOT done** — they remain in [tasks/backlog.md](tasks/backlog.md) with package 8.

- **Callback refs with the `(el | null)` unmount convention — 43 uses.** Declared at
  `uikit/CollapsiblePanelStack/CollapsiblePanelStackView.ts:26,56` and drilled *pass-through*
  (no consumption in between) through eight secondary views (`editors/archive/ArchiveSecondaryView.ts:52,125`,
  `editors/explorer/ExplorerSecondaryView.ts:66,431`, `editors/git-tree/GitPanelSecondaryView.ts:147,309`, …).
  A vanilla view can expose the element (or a focus/scroll method) directly.
- **`{ current: T }` ref boxes** — `components/git-tree/GitTreeView.ts:204,242`,
  `editors/graph/GraphBodyView.ts:356` (+ prop at `GraphDetailPanelView.ts:52`). `useRef` boxes in
  a language with fields; the box only bought mutability across React renders.
- **Imperative ref setters** — `editors/notebook/note-editor/NoteItemEditModel.ts:190-256`:
  "Portal refs for toolbar elements", three setters + three nullable fields.
- **Portals** — `components/tree-provider/CategoryViewModel.ts:96-97` `toolbarPortalRef`
  (fed by `editors/category/CategoryEditor.ts:82,179-181,285`), `editors/link-editor/linkTypes.ts:94-98`.
  React needed portals because a component couldn't append outside its subtree; here the codebase
  already supports constructing a view *into a host* (`PopoverView`'s `contentView: (host) => IOwnedView`,
  `overlayLayer.ts`). Pass the target host instead.

### 1.8 Vocabulary and small residue

> **DELIVERED by [EPIC-082](epics/completed.md) (2026-09-01), US-1274**, except two deliberate
> retentions: `performance-janitor` was left unscoped (already self-gating), and `LivePreview`'s
> throw was **kept** — it is a valid lifetime invariant, so its documentation was the thing missing.
> `storyTypes.ts`'s `defaultProps` stays by design.

- `loadComponent` naming for lazy *view* modules — `ui/secondary-views/secondary-view-registry.ts:34`
  and 13 registrations in `editors/register-editors.ts`. Rename to `loadView`.
- "re-render" as the documented mental model in non-UI code — `api/pages/PageModel.ts:30,34,37,60`
  and the public scripting API docs (`api/types/ui-log.d.ts:358-445`, `api/types/ui.d.ts:6`,
  ~10 occurrences). The renderer has no re-render; the docs should say "subscribers repaint".
- `defaultProps` — `editors/storybook/storyTypes.ts:29` and stories. Acceptable inside the
  storybook surface (it is a props-table playground by design); don't let it leak out.
- `FileSearchModel.ts:67` — rows kept off reactive state "because of the full re-render each copy
  triggers": the *decision* is fine (large arrays off state), the *reason* is stale; reword.
- `editors/storybook/LivePreview.ts:63-65` — `onUpdate` throws if the model changes; nothing can
  re-supply props. Delete the guard or the doc for it.
- `core/utils/performance-janitor.ts:23` — app-lifetime `setInterval(60s)` clearing
  `performance` measures leaked by React-devtools in the draw island. Documented and self-gating,
  but consider scoping it to windows that actually mounted the draw editor.

### Deliberately NOT flagged (React-shaped by design — do not "fix")

For future review passes: the following look React-ish but are the documented house framework,
with the design reasoning recorded in `model-view-pattern.md` / `uikit/CLAUDE.md`:

- `VanillaView` `props`/`onMount`/`onUpdate`/`onDispose` lifecycle, and the **absence of an
  equality gate in `update()`** — a gate was proposed and explicitly rejected
  (`model-view-pattern.md:488-506`).
- `KeyedList` / `SubtreeSwap` / `fillSlot` — the sanctioned structural helpers. The `key`
  vocabulary is fine; the mechanism is DOM-first (removals before creations, scroll-preserving
  fast path).
- `dom-props.ts` residual-props path and `children` slots on uikit primitives — a compatibility
  seam, priced and contained. Optional long-term trim: once §1.4/§1.7 land, measure how many
  `on*` rest-props remain and shrink `NativeEventProps` to what is actually used.
- Controlled `value`/`onChange` on uikit *primitives* (Rule 2) — the intended contract. The smell
  is only when app-level views that already own the model round-trip through these props
  (e.g. `editors/browser/BrowserView.ts:501` wiring `onHoveredIndexChange` back into its own model).
- Immer-based `state.update()` — 709 call sites, uniform and safe. A granular-signals rewrite
  would be a framework migration, not a cleanup. If a hot path shows up in profiling, add a
  documented `setField`-style escape hatch then, not preemptively.
- `display: contents` wrappers (138 sites) — the accepted answer to the one-root-element
  contract; `component-guide.md` already documents the `[hidden]` footgun.

---

## Part 2 — Workarounds inventory

The renderer has essentially **no undocumented hacks** — every guard names its loop. But several
*families* of workarounds exist, and each family points at one missing mechanism (Part 3).

### 2.1 Escaping the synchronous state dispatch (the biggest family)

`TOneState.set()` dispatches synchronously and re-entrantly (`core/state/state.ts:102-113`), so
any consequence that must not run *inside* the dispatch gets pushed out with a timer plus manual
invalidation. 54 `live`-flag guards across 18 files, plus generation counters in at least 5 places:

- `api/pages/PageModel.ts:374` — `deferEditorCleanup`: `setTimeout(…, 0)` + `cleanupGeneration` +
  a `Map` of pending timers + `drainDeferredEditorCleanup()`. Three coordinating mechanisms so
  editor disposal outlives a synchronous dispatch. The most elaborate ordering workaround in the tree.
- `api/pages/PagesModel.ts:166` — `checkEmptyPage()` `setTimeout(…, 0)`: "Wait for page-removal
  dispatch and its observers to settle before creating a replacement."
- `ui/app/AsyncEditorView.ts:69`, `ui/app/PageContentView.ts:199-203` — microtask-deferred
  disposal + generation check.
- `editors/markdown/MarkdownBodyView.ts` — `lifecycleGeneration` checked four times inside one
  retry loop.

The `live` flags also duplicate machinery the base class already has: `bind()`/`listen()` are
disposal-guarded and `isDisposed` exists (`uikit/shared/vanilla-view.ts:154`). Six spellings of
the same concern coexist: `live`, `inert`, `isLive`, `generation`, `isDisposed`,
`_autoInitExplorerQueued`.

**Fix:** P2 (post-dispatch queue) + P3 (owner-bound scheduling) below.

### 2.2 Timing hacks

**Worst — shotgun retry:** `editors/log-view/LogBodyView.ts:203-204`
```ts
scrollToEnd();
this.scrollTimers = [setTimeout(scrollToEnd, 50), setTimeout(scrollToEnd, 150), setTimeout(scrollToEnd, 300)];
```
Four attempts at three arbitrary delays because there is no signal for "the grid finished
measuring the new rows" — but that signal **exists**: `RenderGridModel.scrollToRowAfterPaint`,
documented in `uikit/CLAUDE.md:558` and used correctly by `uikit/Tree/TreeModel.ts:870` and
`ListBoxView.ts:517`. LogBodyView never adopted it. Highest-confidence single fix in this report.

**Polling / spinning on layout:**
- `editors/rest-client/RestClientShared.ts` — a rAF that re-schedules itself indefinitely while
  `responsePane.offsetHeight <= 0`, spinning for as long as the pane is hidden-but-connected.
  **Updated 2026-09-01 (EPIC-082 close):** now `scheduleMeasurement:268-280`. The loop is unchanged,
  but EPIC-080's US-1263 made it owner-bound via `this.schedule.raf` and it no longer has a `live`
  guard — so the description above ("guarded by `live`", raw rAF at `:270-283`) is stale. EPIC-082's
  US-1269 deliberately left it for this package and must be rebased onto.
- `editors/board/BoardTargetModel.ts:170` — `setTimeout(tick, 50)` polling for a tab the code
  itself mounted, up to 5 s, "never rejects" on timeout.
- `editors/markdown/MarkdownBodyView.ts:536` (rAF retry ×10), `editors/video/AudioVisualizer.ts:380` (×3).

**Magic small delays** (each papers over a real ordering problem):

| Site | Delay | Papers over |
|---|---|---|
| `editors/browser/BookmarksDrawer.ts:49`, `ui/sidebar/MenuBarView.ts:245` | 10 ms | style-recalc so a CSS open-transition runs (an explicit `getBoundingClientRect()` flush is the honest form) |
| `editors/git-tree/GitChangesView.ts:395`, `link-editor/panels/LinkTagsSecondaryView.ts:224`, `LinkHostnamesNavigationPanel.ts:231` | 200 ms | `ResizeObserver → debounce → measure → disconnect()` — a one-shot "wait for first real layout" dressed as a resize handler, duplicated verbatim in 3 files |
| `editors/base/TextChromeView.ts:492`, `editors/board/BoardWebview.ts:154`, `editors/browser/BrowserView.ts:464` | 100–200 ms | focus-after-page-focus races |
| `uikit/PathInput/PathInputModel.ts:185` | 150 ms | blur/click grace so suggestion-row clicks land (classic, honestly labelled) |
| `uikit/ImageViewportView.ts:100` | 50 ms | re-check `image.complete` in case `load` was missed |
| `editors/graph/GraphEditor.ts:629`, `editors/shared/MonacoEditorHostView.ts:202`, `MonacoDiffEditorHostView.ts:179` | 0 ms | popup-close / detached-Monaco-model teardown ordering |
| `scripting/ScriptRunner.ts:119` | 1000 ms | time-window heuristic attributing unhandled rejections to a script |

Well-reasoned and *not* findings (listed so they aren't re-flagged): the async rethrow
`setTimeout(() => { throw error; }, 0)` in `core/state/state.ts:85` / `events.ts:28`;
`GridEditor.ts:850`'s documented per-cell `onEdit` coalescing; `core/utils/scheduling.ts`
`afterPaint` (rAF + 100 ms background-window fallback).

### 2.3 Echo / re-entrancy guards

Seven boolean guards, all documented, three of them the *same* design duplicated:

- `api/settings.ts:186,239,288` — `skipNextFileChange`: armed by `saveSettings()` so the
  `FileWatcher` doesn't reload our own write. **Fragile**: if a save ever fails to produce a
  watcher event, the flag stays armed and swallows the next *genuine* external edit.
- `editors/browser/browser-search-history.ts:25,46,67` — identical copy of the above.
- `editors/base/TextHostEditorModel.ts:63,274,287` — `_skipNextContentUpdate`, same
  arm-and-hope failure mode.
- Nestable/correct variants: `MonacoEditorHostView.ts:105-120` (`suppressOnChange` with
  save/restore), `MermaidEditor.ts:108-112` (try/finally), `SelectModel.ts:246,425-481`
  (`_suppressFocusOpen` — documented as "the one surviving queueMicrotask in this file").

**Fix:** P5 — one shared self-write guard utility with token/content matching instead of
arm-and-hope, used by all three file-echo sites.

### 2.4 Observers detecting self-caused changes

- `uikit/Toolbar/ToolbarView.ts:70-75` — a `MutationObserver` on `{childList, subtree}` **plus**
  a `queueMicrotask` **plus** direct calls from `onUpdate`, all invoking `applyRovingTabIndex()`.
  Three redundant triggers for mutations the view itself makes via `fillSlot`.
- `uikit/DataGrid/cell-tooltip.ts:155` — module-global `MutationObserver` on `document.body`
  matching `.avg-popover` by class name, "installed once for the module and never torn down". The
  comment itself names the right fix: an upstream av-grid popover open/close hook.
- The 3× duplicated `ResizeObserver → 200 ms → disconnect` one-shot layout probe (§2.2).
- Legitimate but expensive (not a finding): `uikit/Minimap/MinimapView.ts:133` full-subtree
  mirroring observer — inherent to a minimap.

### 2.5 Cross-boundary DOM pokes

Mostly disciplined (`data-type`/`data-part` per uikit Rule 1). Exceptions:

- `uikit/Menu/MenuView.ts:132` — the view queries its *own* list DOM by attribute string to
  scroll a row the `KeyedList` it owns already holds. Expose the node from the list record.
- `uikit/Tree/TreeModel.ts:744` — `document.getElementById(this.rootId)?.focus()` from a
  **model**; `uikit/CLAUDE.md` says models must not query the DOM. Route through a view-provided
  focus callback or the existing queue.
- `ui/dialogs/poppers/grid-context-menu.ts:108` — the only self-declared "workaround": av-grid's
  `preventDefault()` doesn't spare the grid from `GlobalEventService.handleContextMenu`, because
  that document-level listener **ignores `defaultPrevented`**, so every grid-like surface must
  remember `stopPropagation()`. Fix the service (one line: bail when `event.defaultPrevented`),
  then delete the workaround comment.

### 2.6 Infrastructure-level inconsistencies (from the ground-truth audit)

These are not workarounds but latent defects/duplication that the pattern work should fold in:

- **`EventChannel` disposers are not idempotent and don't deactivate**
  (`api/events/EventChannel.ts:41-46` — `indexOf`/`splice`, no `active` flag): a handler
  unsubscribed during a `send` pass still runs in that pass; a stale disposer called twice can
  remove a different handler. The repo's two *other* listener lists (`state.ts:93-100`,
  `events.ts:15-19`) already do this correctly — three near-identical implementations, one buggy.
- **`Emitter`/`Subscription` have no `dispose()`** (`core/state/events.ts:8-41`) — a module-level
  `Subscription` retains every leaked subscriber forever.
- **Three competing disposal contracts:** function-cleanups (`core/utils/DisposableStore.ts`),
  `IDisposable` objects (`api/internal.ts:14-30` `DisposableCollection` — no idempotency, no
  error containment, one throw aborts the rest), and bare `() => void` unsubscribers.
- **`debounce` (`shared/utils.ts`, 19 call sites) returns no cancel handle** — a debounced call
  can fire after its owner is disposed. `Delayer` exists (`core/utils/scheduling.ts:5-100`) with
  exactly **one** consumer (`GraphLegendPanelView.ts:73`).
- **21 raw `requestAnimationFrame` sites** outside `scheduling.ts`, each with a hand-rolled
  handle field + cancellation + `live` guard (`FileSearchView.ts:165`,
  `ArchiveSecondaryView.ts:155`, `ExplorerSecondaryView.ts:396`, `TruncatedTextView.ts:105`, …).
- **64 raw `addEventListener` sites**, some inside uikit views that have disposal-guarded
  `listen()` available (`uikit/Textarea/TextareaView.ts:216-218`,
  `uikit/Tooltip/attach-tooltip.ts:199-234`, `uikit/Popover/PopoverModel.ts:237-239`).
- `TGlobalState` / `TComponentState` are behaviorally identical empty subclasses
  (`state.ts:138-140`) — fine as markers, but document that that's all they are.

---

## Part 3 — Root causes

Five mechanisms are missing; nearly every finding in Part 2 is a hand-rolled substitute for one
of them.

1. **RC1 — No "after the current dispatch settles" hook.** `TOneState.set()` notifies
   synchronously and re-entrantly; consequences that must not run mid-dispatch escape via
   `setTimeout(0)` / `queueMicrotask` + generation counters + `live` flags (§2.1, §1.1).
2. **RC2 — No owner-bound scheduling.** Every deferred callback re-implements handle storage,
   cancellation, and disposal guarding (21 rAF sites, 82 setTimeout sites, `debounce` without
   cancel).
3. **RC3 — Fragmented disposal.** Three contracts, three listener-list implementations (one
   subtly wrong), emitters that can't be disposed, and views that can't hand a store to helpers.
4. **RC4 — No "first real layout" / "content painted" signal** outside av-grid's
   `scrollToRowAfterPaint`. Hence the ResizeObserver one-shots, the 10 ms transition kicks, the
   rAF spins on `offsetHeight`.
5. **RC5 — No self-write echo guard.** Hence three copies of `skipNextFileChange` with an
   arm-and-never-disarm failure mode.

---

## Part 4 — Recommended patterns (adapted from VSCode and similar vanilla codebases)

VSCode (`src/vs/base`) is the closest large-scale prior art: a framework-free TypeScript renderer
with models, views, emitters, and explicit lifetimes. The following are the pieces that *fit*
Persephone's documented conventions. Each names what it replaces.

### P1 — One listener-list core; disposable emitters (VSCode `event.ts` `Emitter<T>`)

Extract the one correct listener-list implementation (the `{listener, active}` array with
idempotent disposers that `TOneState` and `Emitter` already share) into a single internal core,
and back all three of `TOneState`, `Emitter`, and `EventChannel` with it. Add `dispose()` to
`Emitter`/`Subscription` (clears all listeners) and to `EventChannel`.

*Retires:* the `EventChannel` unsubscribe bug, the emitter leak surface, and two of the three
duplicate implementations. Small, zero-behavior-change (except the bug), high trust payoff.

### P2 — A post-dispatch queue on the state core (the "transaction epilogue")

Add one primitive to `TOneState` (or a tiny shared dispatcher module):

```ts
// runs fn after the current dispatch (and any nested dispatches) fully settle;
// runs synchronously immediately if no dispatch is in flight.
afterDispatch(fn: () => void): void
```

Implementation: a module-level depth counter incremented around `stateChanged`, and a FIFO drained
when depth returns to zero. This is the same idea as VSCode's observable *transactions*, reduced
to the one case Persephone needs.

*Retires:* `PageModel.deferEditorCleanup`'s `setTimeout(0)` + generation + timer map,
`PagesModel.checkEmptyPage`'s timer, `AsyncEditorView`/`PageContentView` microtask disposals, and
the honest remainder of §1.1's microtask effects — with **deterministic** ordering instead of
"hopefully next tick", which also deletes most generation counters and re-validation guards.

### P3 — Owner-bound scheduling on `VanillaView`/`TModel` (VSCode `async.ts` + `dom.ts`)

Give owners self-cancelling schedule helpers, mirroring how `listen()` already wraps
`addEventListener`:

```ts
this.schedule.raf(() => …)        // coalesced: re-request replaces pending; cancelled on dispose
this.schedule.timeout(ms, () => …)
this.schedule.delayer(ms)          // per-owner Delayer, disposed with the owner
```

Backed by the existing `scheduling.ts` (`Delayer`, `afterPaint`) — the utilities exist; the gap
is ownership. VSCode's equivalents are `RunOnceScheduler`, `Throttler`, `Delayer`, and
`scheduleAtNextAnimationFrame`, all `IDisposable`.

*Retires:* the 21 hand-rolled rAF handle fields and their `live` guards, the cancel-less
`debounce` hazard (deprecate `debounce` in views in favor of `this.schedule`), and most remaining
`live` flags — `isDisposed` plus guarded helpers covers the rest.

### P4 — `afterFirstLayout(el)` / explicit transition kick (RC4)

Two tiny DOM utilities in `uikit/shared/`:

- `afterFirstLayout(el, fn)` — one `ResizeObserver` entry (or rAF when already laid out), fires
  once with the first non-zero rect, self-disconnects, returns a cancel handle. Replaces the 3×
  duplicated `ResizeObserver → 200 ms → disconnect` probe, the `RestClientShared` rAF spin, and
  the `AudioVisualizer`/`MarkdownBodyView` measure retries.
- `kickTransition(el, className)` — `el.getBoundingClientRect()` flush + `classList.add`, the
  honest form of the 10 ms open-transition timers (`BookmarksDrawer`, `MenuBarView`).

Also: adopt `scrollToRowAfterPaint` in `LogBodyView` (delete the 50/150/300 shotgun) — that one
is a plain bug fix, no new mechanism needed.

### P5 — A shared self-write echo guard (RC5)

One utility, e.g. `createEchoGuard()` with `guard.arm(token)` / `guard.consume(token): boolean`
where the token is derived from the written content (mtime/hash/URL) and **expires** (time-boxed
or single-shot with content match) instead of arm-and-hope. Adopt in `api/settings.ts`,
`browser-search-history.ts`, and `TextHostEditorModel`. The Monaco `suppressOnChange`
save/restore variant is already correct; leave it (or fold it in as the nestable flavor).

### P6 — `GlobalEventService` honors `defaultPrevented`

One-line policy fix in `api/internal/GlobalEventService.ts` (`handleContextMenu`, and audit the
other 8 document-level listeners for the same blindness). This is how VSCode's global listeners
behave: a component that handled its event calls `preventDefault()`, and shared services respect
it. Deletes the `grid-context-menu.ts:108` workaround and the "every grid must remember
stopPropagation" tax.

### P7 — Unify the disposal contract (VSCode `lifecycle.ts`)

Adopt `IDisposable` (already Monaco-compatible per `api/types/common.d.ts`) as the *interchange*
type, keep function-cleanups as the convenience form, and:

- upgrade `DisposableCollection` (`api/internal.ts`) to `DisposableStore` semantics (idempotent,
  error-contained, self-removal) or delete it in favor of the core one accepting
  `Cleanup | IDisposable`;
- let a `VanillaView`/`TModel` *hand a store* to helper objects (`CellTooltip`,
  `ImperativeSplitter`, `KeyedList`) — a `protected get disposables(): DisposableStore` or an
  `own(helper: IDisposable)` overload — so helpers stop hand-rolling symmetric
  add/removeEventListener lists;
- sweep the 64 raw `addEventListener` sites inside views onto `listen()`.

### P8 — Enforcement, not documentation (fits US-1131)

The selector rules ("no fresh arrays", fixed-length deps, `changed()` once per update) are
enforced only by prose today, and Part 1 shows shipped violations. Two cheap lint clauses:

- selector returning `[`…`]`, `.map(`, `.filter(`, `.join(` or `?? []` inside a
  `bind`/`subscribe` selector argument → error;
- `queueMicrotask`/`Promise.resolve().then`/`setTimeout(…, 0)` inside `onUpdate`/`setProps`
  bodies → warning pointing at `afterDispatch` (P2) once it exists.

These belong in the already-planned US-1131 lint-gaps task.

### Considered and NOT recommended

- **A reactive/observable framework (VSCode `observable.ts`, signals, computed graphs).** The
  house convention is derive-on-write into plain fields, explicitly chosen in
  `model-view-pattern.md:679-708` ("do not hide invalidation behind a dependency array"). P2 gives
  the ordering benefit without importing a dependency-graph mental model. Revisit only if
  selector sprawl becomes the dominant bug source.
- **An equality gate in `VanillaView.update()`** — already litigated and rejected; the
  DataGridView header documents the local answer for the one hot boundary.
- **A `h()`/`$()` DOM-builder DSL** (VSCode `dom.ts`). Tempting (there is no DOM construction
  utility, every view hand-writes `createElement`+`append`), but it re-introduces a
  tree-description layer one step from JSX. The current verbosity is uniform and greppable; only
  reconsider if a concrete pain (e.g. §1.4 rebuild sites) survives the KeyedList/bind refactors.
- **Batching state writes.** N writes = N dispatches today; nothing measured says this hurts.
  Don't add transactions speculatively — P2's epilogue queue is deliberately not a batcher.

---

## Part 5 — Suggested work packages (ranked)

Small, independently landable; 1–3 are mostly mechanism, 4–8 mostly cleanup that the mechanisms
unlock.

1. **Quick wins (one small task):** LogBodyView → `scrollToRowAfterPaint`; delete
   `getVersion()`/`useSyncExternalStore` residue in overlay/tooltip registries;
   `GlobalEventService` honors `defaultPrevented` + delete the grid-context-menu workaround;
   fix the four fresh-array selectors in dialogs; `ExpandedNoteView.setState` inline;
   `ToolbarView` single-trigger roving tabindex.
2. **P1 + P7:** one listener core, disposable emitters, fixed `EventChannel` unsubscribe,
   unified disposal contract, raw-listener sweep.
3. **P2 + P3:** `afterDispatch` + owner-bound `schedule.*`; then convert
   `PageModel.deferEditorCleanup`, `PagesModel.checkEmptyPage`, `AsyncEditorView`,
   `PageContentView`, and the rAF handle fields; retire `live`/generation duplicates.
4. **Graph/rest-client/settings de-effecting (§1.1):** apply the EPIC-056 treatment to
   `GraphDetailPanelView` (worst), `GraphLegendPanelView`, `ResponseViewerView`,
   `RequestBuilderView`, `McpSectionModel`, `FileDiffBodyView` — using P2 where ordering is real.
5. **tree-provider cleanup (§1.2, §1.6, §1.7):** remove stale React rationale and the microtask
   drag-write, dismantle the 15-key render-prop bag, replace portals with host-passing, replace
   the hand-rolled arm-switching with `SubtreeSwap`.
6. **P4 + timing-hack sweep (§2.2):** `afterFirstLayout`, `kickTransition`, convert the 3×
   ResizeObserver probes, the transition timers, the rest-client spin, the board polling loop.
7. **P5 echo guard (§2.3):** shared utility; adopt at the three file-echo sites.
8. **Teardown-rebuild renders (§1.4) + secondary-view `{state,setState}` (§1.3) + callback-ref
   drilling (§1.7):** per-editor conversions to `bind()`/`KeyedList`/`SubtreeSwap`; lowest
   urgency, largest diff.

P8's lint clauses fold into the existing **US-1131** task rather than a new one.

---

## Part 6 — Delivery plan: how this report becomes epics

**Status:** this document is the active refactoring roadmap. It is tracked on
[active-work.md](active-work.md) and comes off the dashboard when the programme below closes.

Epics are **not** created up front — each one is written when work is about to start on it, so its
task breakdown reflects what the previous epic actually learned. The numbers below are reserved
intent, not existing documents.

### The cut lines

Part 5's eight packages are grouped by **risk and abort criteria**, not by subject matter, because
that is what decides whether an epic can close under the deferred-review model (an epic stays open
until every task in it lands, so mixing afternoon-sized work with high-risk core work strands the
cheap wins).

| # | Scope | Part 5 packages | Why it stands alone |
|---|---|---|---|
| **US-1258** (standalone task) | Quick wins | 1 | Six unrelated fixes sharing no mechanism, three of them live defects — nothing to gate them behind |
| **EPIC-080** | State, lifetime & scheduling core | 2, 3 | The only work that can break the whole app in a way no per-editor check catches; verification question is "did we brick it" |
| **EPIC-081** | DOM & IO mechanisms | 6, 7 | Zero dependency on the state core; shallow, independently landable tasks |
| **EPIC-082** | React architecture removal at the call sites | 4, 5 | Per-editor conversions; localized visual risk, revert granularity of one file |
| *(backlog)* | Teardown-rebuild renders, `{state,setState}` props, ref drilling | 8 | Lowest urgency, largest diff — drawn down opportunistically, not as an open epic |

Sequence: **US-1258 → EPIC-080 → EPIC-082**, with **EPIC-081** free-floating (the parallel track if
two are ever wanted at once). The single hard cross-epic dependency is P2: §1.1's de-effecting wants
`afterDispatch` to exist for the cases where the ordering is genuinely real.

### US-1258 — quick wins (standalone task, land first)

Package 1 verbatim. Not folded into an epic because the items share no mechanism, and three are
defects rather than refactors: `LogBodyView`'s 50/150/300 ms scroll shotgun, `GlobalEventService`
ignoring `defaultPrevented` (a tax on every grid-like surface), and the four fresh-array dialog
selectors that fire on **every** dispatch. Those should not queue behind a framework refactor.

### EPIC-080 — state, lifetime & scheduling core — **created 2026-08-31**

Document: [epics/EPIC-080.md](epics/EPIC-080.md). Writing it re-verified this section
against source and changed two task definitions — see that document's *Corrections to the
report's plan*: P2 does **not** retire all of `deferEditorCleanup` (the async cleanup drain
must survive), and two `EventChannel` unsubscribe bugs exist rather than one.

Packages 2 + 3, in order: **P1** (one listener core, disposable emitters, the `EventChannel`
unsubscribe fix) → **P7** (unified disposal contract) → **P2** (`afterDispatch`) → **P3**
(owner-bound `schedule.*`) → the conversion sweep (`PageModel.deferEditorCleanup`,
`PagesModel.checkEmptyPage`, `AsyncEditorView`, `PageContentView`, the 21 rAF handle fields).

Two constraints to carry into the epic document:

- **P2 must be additive.** It is the highest-leverage *and* highest-risk item in this report. With
  ~1700 `.update(` call sites and re-entrant dispatch, a module-level depth counter draining a
  global FIFO changes *when side effects land* app-wide. Introduce `afterDispatch` as a new
  primitive and convert call sites one at a time — do **not** change `set()`'s existing semantics.
  Abort criterion stated up front: if ordering surprises appear under real use, stop there and keep
  P1/P7, which are unambiguous wins independently.
- **Retiring the `live` flags is its own task.** 106 `this.live` references; a missed one is a
  use-after-dispose that surfaces only under specific timing — the bug class that survives a green
  build and a smoke test. It needs a mechanical, greppable conversion rule, not a "while we are in
  here" cleanup tacked onto P3.

### EPIC-081 — DOM & IO mechanisms

Packages 6 + 7: **P4** (`afterFirstLayout`, `kickTransition`) with the §2.2 timing-hack sweep, and
**P5** (`createEchoGuard`) adopted at the three file-echo sites. Independent of EPIC-080, so it can
run in parallel or fill a gap.

### EPIC-082 — React architecture removal at the call sites — **COMPLETED 2026-09-01**

Document: [epics/EPIC-082.md](epics/EPIC-082.md). Writing it re-verified this section against
source at commit `caacc80a` and produced **six corrections** — see that document's *Corrections to
the report's plan*. Two change what the work is: the render-prop bag's stated cost (fresh closures
per update) is false — every callback is a stable bound field, and the real problem is split
ownership between `CategoryViewImpl` and `CategoryEditor`; and §1.5's `lastProjection` memo chains
plus §1.8's vocabulary residue turned out to be **unassigned to any package in Part 5**. §1.8 is
absorbed as US-1274; the three out-of-island memo chains go to the backlog with package 8.

Packages 4 + 5, sequenced after EPIC-080's P2:

- §1.1 de-effecting, per editor — `GraphDetailPanelView` first (33 gate references in one file),
  then `GraphLegendPanelView`, `ResponseViewerView`, `RequestBuilderView`, `McpSectionModel`,
  `FileDiffBodyView`.
- the `components/tree-provider/**` island as one task: stale React rationale (§1.2), the 15-key
  render-prop bag (§1.6), portals → host-passing and the hand-rolled arm-switching → `SubtreeSwap`
  (§1.7).

### Backlog rather than an epic — package 8

§1.4 (76 `replaceChildren()` sites renderer-wide, 24 of them teardown-and-rebuild), §1.3
secondary-view `{state, setState}`, §1.7 callback-ref drilling (43 uses), and — added when EPIC-082 was cut — the three §1.5
`lastProjection` memo chains Part 5 left unassigned. **Recorded 2026-09-01** in
[tasks/backlog.md](tasks/backlog.md) under *Recorded Epics*, to be drawn down opportunistically — when a task already has
someone inside that editor. An epic here would accumulate fifteen tasks and never close.

**One exception pulled forward into EPIC-080:** the three hand-rolled re-implementations of
sanctioned helpers — `ui/dialogs/InputDialogView.ts:140-194` (re-does `KeyedList`),
`components/tree-provider/TreeProviderViewImpl.ts:167-181` (re-does `SubtreeSwap`), and
`ui/app/PageContentView.ts:125-182` (both) — since EPIC-080's conversion sweep touches
`PageContentView` anyway.

### P8's lint clauses → US-1131

As Part 4 says, they fold into the existing task. Note the sequencing: clause 2 (flag
`queueMicrotask` / `setTimeout(…, 0)` inside `onUpdate`/`setProps`) has nothing to point at until
EPIC-080 lands `afterDispatch`, so US-1131 gets cheaper scheduled after it.

### Verified before planning

The claims the epic structure rests on were re-checked against source at commit `804ca1db`:
`EventChannel.subscribe` (`api/events/EventChannel.ts:39-47`) uses `indexOf`/`splice` with no
`active` flag while `TOneState.register` (`core/state/state.ts:91-101`) has the correct idempotent
form; `stateChanged` (`state.ts:79-88`) is a plain synchronous loop, so P2's premise holds;
`getVersion()` has callers nowhere (only `uikit/shared/overlayRegistry.ts:60` and
`tooltipRegistry.ts:118` define it); and the scale counts match — 17 `DepsGate` files, 36
`queueMicrotask`, 21 raw `requestAnimationFrame` outside `scheduling.ts`, 64 raw
`addEventListener`.

---

*Survey inputs: three parallel code sweeps (React-pattern remnants; workarounds; infrastructure
ground truth), 2026-08-31. Key line references spot-verified against source at commit `893dacb4`.*

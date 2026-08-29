# De-React Refactoring Proposals

**Status:** Accepted — the high-level plan for the post-De-React refactoring programme.
**Epics cut so far:** [EPIC-075](epics/EPIC-075.md) — Epic A, core contracts (R1, R3, R10.1-3).
**Tracked on:** [active-work.md](active-work.md)
**Date:** 2026-08-29
**Scope:** Post-migration review of the whole renderer (uikit, ui, components, editors, core/state), looking for React-era artifacts that survived the De-React migration, plus vanilla-world patterns worth adopting.

## How this review was done

Three parallel codebase sweeps (uikit / ui+components / editors+scripting+automation) over ~600 renderer files, plus a direct read of the core primitives (`core/state/*`, `uikit/shared/vanilla-view.ts`, `deps-gate.ts`).

## Executive summary

The migration is genuinely done at the **mechanics** level:

- Zero React imports, JSX, or hooks outside `editors/draw/**` (the sanctioned Excalidraw island).
- `innerHTML` wholesale rebuilds are essentially gone (a handful of guarded/legitimate sites).
- Lifecycle discipline via `VanillaView.own()/bind()/child()/listen()` is strong where it's used.
- Keyed reconciliation (`KeyedList`, `SubtreeSwap`, VirtualGrid cell pool) is in place for the components where it matters most.

What survived is the **shape of React**, not the dependency. The dominant artifact — the root cause behind most other findings — is the **props pump**: parents re-pushing freshly allocated props objects down the view tree on every update, exactly like a JSX render body. Everything downstream of that (deps gates, `memo()` chains, 28 hand-rolled `last*`/`applied*` guard fields, DataGrid's callback trampolines) exists to *defend against* the pump. The vanilla-native alternative — children subscribing to the exact state slice they render, via the selector `subscribe()` that `TOneState` already has — is used in the best files and absent in the rest.

The proposals below are ordered so each one makes the next cheaper. R1–R3 are the high-leverage structural fixes; R4–R8 are targeted cleanups; R9 is a sweep; R10 is forward-looking.

---

## R1. Delete the hooks-emulation machinery from `TComponentModel`

> **Scheduled:** [EPIC-075](epics/EPIC-075.md) — US-1192, US-1193, US-1194. `memo()` deferred to Epic B.

**Problem.** `core/state/model.ts` still carries a full React-hooks emulation: `effect(fn, depsFactory)`, `memo(fn, depsFactory)`, `_evaluateEffects`, `hasRegisteredEffects` (doc comment: *"requires the React adapter"* — the adapter is gone), `isFirstUse`, `oldProps`, `mapProps`, `onUnmount`. `createComponentModelDriver` **throws** on any model with registered effects — yet 8 `effect()` registrations survive, all in `editors/settings/sections/*`, and those views bypass the driver by calling the underscore internals directly (`setPropsInternal` → `_initInternal` → `own(() => model.onUnmountInternal())`), making the private React-internal surface into de-facto public API:

- `settings/sections/BrowserProfilesSection.ts:365-366,451,456`
- `settings/sections/DefaultBrowserSection.ts:71-73`
- `settings/sections/McpSection.ts:112-113,191,197`
- `settings/sections/SettingsSections.ts:170-187` (GitIntegration), `:360-379` (VideoPlayer)

Two of the effects are pure prop→state mirrors wrapped in `queueMicrotask` **solely to dodge React's update-during-render rule** (`SettingsSections.ts:333,341,346`; `McpSectionModel.ts:28,32`) — in vanilla these are one line in `onUpdate`.

Field usage outside settings is nearly dead: `mapProps` — zero uses; `onUnmount` — zero external uses; `isFirstUse` — 2 uses (tree-provider); `oldProps` — 6 uses (tree-provider + `uikit/Menu/MenuModel.ts:88`).

**Proposal.**
1. Convert the 8 settings-section effects to explicit `settings.onChanged` subscriptions + `DepsGate` (or plain `onUpdate` writes for the two mirrors).
2. Delete `effect()`, `_evaluateEffects`, `hasRegisteredEffects`, `mapProps`, `onUnmount`, and the throw branch in `createComponentModelDriver` (~120 lines of core). `memo()` goes too, but only after the 20 uikit call sites convert (see R6) — or split this into two steps.
3. Migrate the few `isFirstUse`/`oldProps` readers (tree-provider, MenuModel) to local previous-value fields, then delete those too.

**Payoff:** removes the last structural React dependency, closes the "views poke model internals" hole, simplifies the model contract to: constructor + `setProps` + `dispose`.

---

## R2. Kill the props pump — children subscribe, parents stop re-pushing

**Problem.** `VanillaView.update(props)` has no equality gate, and the codebase treats it as a render call. Counts: **311** `.update({...})` calls in editors alone (54 literally `.update({ model })`), **~40** private `xxxProps()` builder methods in uikit, **22** more in ui/components, **218** inline `onClick: () => ...` closures re-allocated per pump. Canonical offenders:

- Editor root views fanning an unchanged `{ model }` to every descendant on every dispatch: `link-editor/index.ts:414-421`, `notebook/index.ts:264-275`, `grid/index.ts:249-260`, `markdown/index.ts:187-189`, `log-view/index.ts:171-172`, `html/index.ts:196-197`, `env-vars/index.ts:47`, `image/ImageView.ts:60`, `base/PageToolbarView.ts:431-433`.
- `ui/app/PagesView.ts:19` — binds with the **whole-state selector** `(state) => state` on `pagesModel` (the app's hottest state), then rebuilds `managerProps()` and reconciles all page slots on every dispatch. Same whole-state selectors at `ui/app/MainPageView.ts:85,87` and `editors/grid/components/ColumnsOptions.ts:389`.
- `ui/sidebar/OpenTabsListView.ts:31-45,110-124` — a 14-field ListBox props literal duplicated twice, with fresh `isSelected`/`getTooltip`/`onChange` closures per update; a fresh predicate identity defeats the child's DepsGate, so the list repaints in full on any dispatch. Re-entrant via its own `onActiveChange` (`:116-119`).
- `rest-client/RequestBuilderView.ts:258,307,315` — 7-key props object with 3 fresh closures per pump into `KeyValueEditorView`.
- Seven-layer drill in uikit: `MultiSelectView → PopoverView → PopoverFloatingView → MultiListBoxView → ListBoxView → VirtualGridView → ListItemView`, a fresh props object minted at each hop. `AutocompleteView.ts:103` is the pure form: `this.list.update(props.list)` — a props object whose only content is another view's props object.
- The tell that the pump is dead weight: `ui/app/PageContentView.ts` receives only `{ pageId }` and **re-subscribes to `pagesModel` itself**; the mcp-inspector panels have empty `onUpdate(_props): void {}` hooks and are entirely subscription-driven — the pump above them carries nothing.
- `DataGrid/DataGridView.ts:13-32,241` documents the pump as a known hazard and builds a per-callback **trampoline table** whose only job is to undo it.

**Proposal.** Establish a convention (document in `model-view-pattern.md` + `uikit/CLAUDE.md`) and convert incrementally:

1. **Construction-time config vs. live data.** Props are for construction-time configuration; live data reaches a child either through a shared model/state the child `bind()`s to, or through targeted setter methods. `update(props)` becomes rare.
2. **Stable callbacks are fields.** All `onX` handlers hoisted to bound methods created once (the pattern `TreeProviderViewImpl.ts:327-399` already uses). No closures inside props builders.
3. **Narrow the selectors.** Replace `(s) => s` bindings with per-child slice subscriptions (`PagesView.ts:19`, `MainPageView.ts:85,87`, `PageContentView.ts:35`, `PageTabsView.ts:167-168` — the last one re-runs the entire tab-strip reconcile on every keystroke that touches editor state).
4. Optionally add a shallow-equality gate inside `VanillaView.update()` as a transitional safety net — but treat it as a crutch, not the fix.

**Payoff:** deletes the reason for most `DepsGate`s, `memo()` chains, `last*` guard fields, and the DataGrid trampolines; fixes the two hottest render paths in the app.

---

## R3. Route all subscriptions through ownership (`ownSubscription` helper)

> **Scheduled:** [EPIC-075](epics/EPIC-075.md) — US-1195 (model parity), US-1197 (helper + conversion).

**Problem.** In `editors/` there are **114** `.subscribe()` calls and only **5** go through `this.own(...)`. The other ~109 are hand-managed via ~101 `private xUnsubscribe`/`xSubscription` fields with manual teardown — each an independent leak opportunity (`base/PageToolbarView.ts:129-264` tracks **five** such fields in one view; also `browser/BrowserSecondaryViews.ts:47-48`, `board/BoardWebview.ts:154,191,207`, `board-info/BoardInfoEditorModel.ts:180,263,494`). The same "subscribe on one line, `own(() => sub.dispose())` on the next" is copy-pasted six times in ui/sidebar. Raw `addEventListener` without registered removal exists on **global** targets: `board/BoardWebview.ts:150` and `html/HtmlBodyView.ts:136` (`window`, `"message"`), plus re-attach-inside-render-path sites in `notebook/ExpandedNoteView.ts:124,277-316` and per-cell listeners in the recycled-cell grid (`notebook/NoteItemView.ts:330-372`).

**Proposal.**
1. Add `protected ownSubscription(sub)` to `VanillaView` (built on the existing `ownReleasable`), accepting all three teardown shapes in use (`() => void`, `{ unsubscribe() }`, `{ dispose() }`) and returning a release handle like `bind()` does.
2. Mechanical conversion of the ~109 hand-rolled fields; the "rebindable" cases (model replacement — the US-1152 class) retain the release handle.
3. Give **models** disposal parity: `TModel` currently has no disposer registry, so models hand-roll teardown too. Add the same `own()`/disposer-list mechanics to `TModel` (or a shared `DisposableStore`, see R10).
4. Audit and fix the global/window listeners and the re-attach-in-render sites listed above.

**Payoff:** structurally closes the leak class that already produced US-1152; deletes ~100 boilerplate fields.

---

## R4. Fix the genuine full-rebuild sites

**Problem.** A short tail of views still rebuild DOM wholesale on every update — the literal transcription of a JSX `.map()` body:

| Site | Issue |
|---|---|
| `uikit/Breadcrumb/BreadcrumbView.ts:33,86` | Rebuilds every segment + separator and `replaceChildren` on **every** `update()`, with per-element `addEventListener`; destroys focus in the crumb. |
| `uikit/Minimap/MinimapModel.ts:46-47,101-102` | Mirrors the source pane via `contentMirror.innerHTML = scrollContainer.innerHTML` inside a MutationObserver — full serialize+reparse per mutation batch, and a **model touching DOM** (against uikit Rule 9). |
| `components/tree-provider/CategoryViewImpl.ts:276-330` | `reconcileItemsArm` calls `replaceChildren` unconditionally on every state apply, **before** the `projectionChanged` gate; even a no-op dispatch detaches/re-attaches the tile scope. (Line 303's clause is dead — subsumed by line 280.) |
| `ui/secondary-views/SecondaryViewsView.ts:134-149` | `updateStack()` maps every panel to fresh props, and `drainHeaderUpdates` runs it a **second time** in the same pass — the React "render, ref fires, render again" two-pass, by hand; triggered from the global icon subscription (`:78`). |
| `mcp-inspector/PromptsPanel.ts:335` | `MessageBlockView.onUpdate` does unconditional `replaceChildren()` + rebuild per parent pump. |
| `storybook/PropertyEditor.ts:187-199`, `storybook/LivePreview.ts:181` | Full clear + rebuild of all rows / the preview. |
| `tools-hub/SearchBoardsTab.ts:105-275`, `mneme-config/RootsPanel.ts:301`, `link-editor/LinksTilesView.ts:463-539`, `git-tree/GitTreeEditorView.ts:252` | Clear-and-rebuild in `onUpdate` paths. |
| `ui/sidebar/BuiltinEditorsListView.ts:106-117`, `TrustedBoardsListView.ts:82-99`, `ToolsEditorsPanelView.ts:63-70` | `refresh()` recomputes the whole row set on every `onUpdate` with no input comparison. |
| `update({ all: true })` full-grid repaints | `notebook/NotebookBodyView.ts:235` (any change to data/categories/tags/searchText repaints all cells), `log-view/LogBodyView.ts:138,159`, `link-editor/LinksTilesView.ts:129,182`. |
| `uikit/CategoryList/CategoryListView.ts:76` | Full `groupItems` grouping pass on every update, no signature gate (contrast `ListBoxView.ts:146`, which gates). |

**Proposal.** Convert each to the already-sanctioned incremental primitives: `KeyedList` for lists, `SubtreeSwap` for conditional branches, targeted writes for scalar fields. The idempotency guard in `notebook/NotebookBodyView.ts:262-284` (well-commented) is the model to copy. For Minimap, mirror via cloned nodes / incremental MutationObserver application in the **view**, not the model.

---

## R5. Move large collections out of immer state

**Problem.** `state-management.md` already documents the rule ("Large Accumulating Collections Don't Belong in State") and `GridEditor.ts:126` / `FileSearchModel.ts:64,102` follow it — but three editors don't:

- `log-view/LogViewEditor.ts:390-396` — `updateEntryAt` runs `produce` over the **entire `entries: LogEntry[]`** to mutate one entry: O(n) structural-share pass + deep freeze per edit on a growing log.
- `notebook/NotebookEditor.ts` — ~20 `state.update` sites all producing over `data.notes[]`; combined with the `update({all:true})` repaint (R4), every note edit = immer pass over all notes → projection compare → repaint of every visible cell.
- `graph/GraphVisibilityModel.ts:124` — carries a shallow-copy workaround because "original nodes may be frozen by immer": graph node data is passing through `produce` too.

**Proposal.** Apply the documented pattern: collection as a plain model field + a version counter in state; batch producer writes. One US per editor (log-view, notebook, graph).

---

## R6. Retire the React-types emulation layer in uikit

**Problem.** `uikit/shared/dom-props.ts` (241 lines) is a hand-rolled `@types/react`:

- `NativeHTMLAttributes` re-declares 22 camelCase `on*` handlers, `tabIndex`, `children?: NativeSlotContent` — React spellings on native DOM. The `Omit<NativeHTMLAttributes<…>, "style" | "className">` incantation repeats **33 times**.
- `applyRestProps` (`:159`) is a JSX-spread emulator used by **39 files** that removes and re-adds **every** listener on each call (no listener identity — exactly the problem JSX spreads have); `TreeView` comments already flag it as a drag-time hazard. It also translates `className`→`class` / `htmlFor`→`for` for props the contract bans.
- `ElementRef<T>` (`:3`) ports React 19 callback refs *including the return-a-cleanup signature* (`bindRef`, `:223`); 22 `ref?:` props, and four views maintain `syncCallerRef`/`appliedCallerRef` machinery (`AutocompleteView.ts:169,355`, `MultiSelectView.ts:66,288`, `PathInputView.ts:158,214`, `SelectView.ts:72,312`). In vanilla the parent constructed the child and already holds `child.root` — the whole channel is redundant. Same for the app-layer callback refs: `headerRef` (`SecondaryViewsView.ts:47,180,199,219`) and the `onModel` family (`TreeProviderViewImpl.ts:28`, `RecentFileListView.ts:15,30,57`, `FileList.ts:23`, …), which even force a `const holder = {}` constructor trick in two views purely to satisfy `super()` ordering.
- Controlled-input write-back guards ported verbatim: `Input/InputView.ts:154`, `Textarea/TextareaView.ts:167-172`.
- **All 20 `memo()` call sites in the renderer are in uikit** (8 model files). `MultiListBox/MultiListBoxModel.ts:63-132` chains **six** memos, the last memoizing a *predicate function* so a downstream deps gate sees a moved identity — pure hooks thinking. `Select/SelectModel.ts:256-309` and `Tree/TreeModel.ts:176-243` similar.
- Render props: `CategoryViewModel.ts:103` `renderItems` invoked with a **20-field** object, its identity tracked as a deps slot (`CategoryViewImpl.ts:287,327`) — the React footgun verbatim. Also `renderTrailing`, `getTrailing`.
- Last `className`-as-prop holdouts: `DialogViewProps.className` (always the literal `"dialog"`, `DialogsView.ts:76,95`) and `PageManagerProps.className`.

**Proposal.** Narrow component contracts to what each component actually accepts (explicit typed props instead of an HTML-attribute grab-bag); apply rest-props once at construction only; delete the `ElementRef`/`onModel` channels in favor of direct child references; convert the memo chains to derive-on-write (see R10.4); then shrink or delete `dom-props.ts`. This is the largest uikit item and pairs with R2 (the pump is why the spread/refs exist).

---

## R7. Collapse trivial Model/View splits and types-only files

**Problem.** The Model/View split earns its keep when the model has behavior (`TreeModel` 823 lines, `SelectModel` 721 — keep). But:

- **~8 dialog models** are just an Escape handler + one or two setters: `ConfirmationDialog.ts:21-30`, `TextDialog.ts:38-55`, `InputDialog.ts:35-63`, `RegisterToolsetDialog`, `TrustBoardDialog`, `NamespaceCollisionDialog`, `OpenUrlDialog`, `PasswordDialog`. The Escape handler is duplicated verbatim ≥5×: it is dialog-**shell** behavior — lift it into `TDialogModel`/`DialogView` once, then collapse.
- `uikit/MultiListBox/MultiListBoxModel.ts` — 6 memos + 4 two-line setters, no lifecycle (converts under R6, then collapses). `uikit/VirtualGrid/VirtualFlexGridModel.ts` — thin delegate. `uikit/Popover/PopoverModel.ts:251` — an explicitly empty `init() {}` (a vestigial `useEffect(()=>{},[])` slot).
- `editors/settings/sections/DefaultBrowserSectionModel.ts` — 47 lines, no props, one run-once effect; fold into its view (goes with R1).
- `components/file-list/FileList.ts:37-76` — `FileListModel` is three setters plus a `setViewFocusHandlers`/`clearViewFocusHandlers` inversion where the view hands the model DOM callbacks so the model can call them back. Merge into the view.
- **17 types-only component files** in uikit (`Breadcrumb/Breadcrumb.ts`, `CategoryList/CategoryList.ts`, `Dialog/Dialog.ts`, `Divider/Divider.ts`, `MultiListBox/MultiListBox.ts`, `Toolbar/Toolbar.ts`, …) — the exact file the React component used to live in — plus two one-line re-exports (`Menu/Menu.ts`, `Menu/types.ts`). Merge the interfaces into the `*View.ts`.
- `uikit/ImageViewport/ImageViewport.ts` — model named `ImageViewportModel` living in the component-name file, holding DOM refs and mouse handlers (against Rule 9); comment at `:149` still says "not React".

---

## R8. Lifecycle & timing hygiene

**Problem.** Ordering hacks and force-update idioms translated literally from React:

- `core/state/model.ts:51` — **every `TModel` in the app** pays a `setTimeout(() => this.postCreate?.(), 0)` constructor timer; exactly **one** consumer exists (`ui/dialogs/TorInfoDialog.ts:23`). Delete the hook; call the one consumer explicitly.
- Version-counter force updates — React's `forceUpdate`/key-bump verbatim: `archive/ArchiveEditor.ts:147`, `explorer/ExplorerEditorModel.ts:216` (`setTimeout(() => this.revealVersion.update(...), 0)`). Replace with a direct method call on the target view.
- `components/tree-provider/TreeProviderViewModel.ts:721` — `await new Promise(r => setTimeout(r, 0))` justified by a now-false *"Wait for React to re-render"* comment; per uikit's own docs `setTimeout(0)` doesn't await a layout pass — use `scrollToRowAfterPaint`/rAF or delete. Also `:202,297` (untracked timers not cancelled on dispose), `TreeProviderViewImpl.ts:407`, `FileList.ts:56`.
- ~11 other `setTimeout(...,0)` ordering hacks in editors (`explorer/ExplorerEditorModel.ts:126-150`, `archive/ArchiveEditor.ts:136,147`, `browser/BrowserUrlBarModel.ts:32,218`, `graph/GraphEditor.ts:629`) — none carries a comment explaining the ordering constraint it encodes. Rule: every deliberate deferral must state what it waits for, or be replaced by an explicit call.
- Five dialogs copy the same "focus after mount" timer (`CreateBoardDialogView.ts:185`, `InputDialogView.ts:148`, `LibrarySetupDialogView.ts:168`, `PasswordDialogView.ts:173`, `CreateBoardVarsStorageDialogView.ts:149`); `FileSearchView.ts:146` already does it right (rAF + cancel in `own()`). Extract a `focusAfterPaint(el)` helper.
- Re-entrancy: `PageTabsView.ts:167-176` mutates its subscription map while listeners may be dispatching (`TOneState.subscribe` replaces the listeners array, but an in-flight `forEach` holds the old one); `OpenTabsListView.ts:116-119` and `ToolsEditorsPanelView.ts:79-81` re-push props from inside their own change callbacks ("setState in the render body").

---

## R9. Sweep stale React comments, shims, and dependencies

**Problem.** ~80–100 React mentions survive in comments/identifiers. Most are harmless archaeology, but several **actively mislead**, and two justify live timing workarounds with mechanisms that no longer exist — those are code-review items, not comment edits:

**Misleading / code-review-grade:**
- `browser/BrowserWebviewModel.ts:147,166,171` — doc comments define a *"call from useEffect (cleanup)"* contract that no longer exists.
- `automation/commands.ts:81,184-185` + `automation/AppTargetModel.ts:6-7` — a timing workaround justified by "waiting for a React effect"; the wait may now be unnecessary **or insufficient**. Verify behavior before touching.
- `components/tree-provider/TreeProviderViewModel.ts:198-199,720` — `queueMicrotask`/`setTimeout(0)` justified by React render-phase rules (goes with R8).
- `uikit/Dialog/DialogView.ts:73` — `dataset.part = "react-slot"` — **a React name baked into the shipped DOM contract**, queryable by CSS and automation.
- `uikit/shared/fill-slot.ts:13-30,40,85-92` — the `ActiveNodeSlot`/`generation` machinery defends against a React arm that no longer exists.
- `uikit/shared/vanilla-view.ts:6-8,38-39,104-105,232-234` — four references to a hypothetical future "adapter" that owns root detachment. **Decide the fiction:** no adapter exists; either commit to `dispose()` detaching its own root (and simplify `releaseChild`) or document a real reason to keep the split.
- `ui/dialogs/poppers/grid-context-menu.ts:5-7,61` — self-declared shim ("until US-1023 deletes it"); check US-1023 status and delete.
- `core/utils/performance-janitor.ts` — exists solely to suppress React 19 dev-build `performance.measure` spam; verify the draw island still needs it.
- `editors/base/index.ts:14` — "consumed by preserved standalone shim files"; confirm those shims still exist.

**Dependency cleanup (`package.json`):**
- `clsx` — **zero occurrences in `src/`**. Remove.
- `react`/`react-dom` remain top-level runtime deps serving exactly one file (`editors/draw/ExcalidrawIsland.tsx`). Keep (Excalidraw needs them) but document that fact where the deps are declared, and confirm `eslint-plugin-react-hooks` is scoped to `editors/draw/**` in the ESLint config.

**Archaeology sweep (mechanical, ~50 sites):** `page-manager` ("React island", "React node" — `PageManagerView.ts:10,16`, `AppPageManagerView.ts:23`, `ImperativeSplitter.ts:2`), nine "the React version" comparisons in `git-tree`, `PageTabView.ts:141,411`, `PinnedRailView.ts:243`, `MainPageView.ts:126-127`, `ButtonView.ts:121-170`, `MultiSelectView`/`MultiListBoxView`/`SelectView` "React passed no style" triplet, board caches, `CategoryViewModel.ts:644` (points at a deleted `.tsx`), `core/state/model.ts:189,250` ("Called by useComponentModel" — which no longer exists), `SelectModel.ts:654`, `TreeModel.ts:529`.

---

## R10. Vanilla-world patterns worth adopting (VSCode-inspired)

Forward-looking; each could be a small standalone US.

> **Scheduled:** items 1-3 in [EPIC-075](epics/EPIC-075.md) — US-1196 (`Emitter`), US-1195 (`DisposableStore`), US-1198 (scheduling). Items 4-6 belong with Epic B.

1. **One event primitive.** The renderer currently has four: `TOneState` (reactive state), `Subscription` (a wrapper over `EventTarget`/`CustomEvent` in `core/state/events.ts`), `ComponentQueue` (queued events + request/reply), and `EventChannel` (LIFO async). Their teardown shapes differ (`() => void` vs `{ unsubscribe }` vs `{ dispose }`), which is why R3 needs a three-shape helper. Proposal: adopt a VSCode-style `Emitter<T>`/`Event<T>` (plain listener array — no DOM `CustomEvent` allocation per fire) as the single fire-and-listen primitive, returning one teardown shape. `Subscription` migrates onto it mechanically; `ComponentQueue` and `EventChannel` keep their distinct semantics but return the same teardown shape.
2. **`DisposableStore` as a shared utility.** `VanillaView` already implements the idiom internally (disposer list, error-isolated run, depth-first children). Extract it so **models** (`TModel`, `EditorModel`) get the same `own()`/`dispose()` mechanics instead of hand-rolled teardown — this is the model-side half of R3.
3. **Scheduling helpers instead of ad-hoc timers.** A tiny `core/utils/scheduling.ts` with `Delayer` (debounce that returns a promise), `Throttler`, `RunOnceScheduler`, and `focusAfterPaint`/`afterPaint` (rAF-based) — all disposable, so views register them with `own()`. Replaces the ad-hoc `setTimeout`/`queueMicrotask`/rAF spread from R8 and gives every deferral a named, auditable type.
4. **Derived values: derive-on-write, not deps arrays.** House style: a setter that changes an input also recomputes the derived fields (synchronously, before dispatch), so views read plain fields. Where laziness genuinely matters, a small `cached(fn)` invalidated explicitly by the setters beats a deps-array `memo()` — the invalidation is then visible in the code path that causes it. (This is the philosophical replacement for R6's memo chains; VSCode's observables solve the same problem, but a full observable graph is more machinery than this codebase needs.)
5. **Keep and bless `KeyedList` + `SubtreeSwap`.** They are the right vanilla answer to reconciliation. Document them as the *only* sanctioned patterns for dynamic children in `model-view-pattern.md`, with the `NotebookBodyView.ts:262-284` idempotency guard as the reference example — so R4's offender class can't regrow.
6. **`update()` contract clarification.** After R2, document `VanillaView.update(props)` as construction-config-only, and consider narrowing it in a later pass so the type system distinguishes "configure" from "here is new data".

---

## Suggested priority & sequencing

| # | Proposal | Size | Risk | Notes |
|---|----------|------|------|-------|
| 1 | R1 hooks machinery removal | M | Low | Unblocks R6/R7; settings sections only |
| 2 | R3 `ownSubscription` + model disposal | M | Low | Mechanical; closes the US-1152 leak class |
| 3 | R2 props-pump conversion | L | Med | Per-area: app shell hot paths first (`PagesView`, `PageContentView`, `PageTabsView`), then sidebar, then editor roots, then uikit |
| 4 | R4 full-rebuild fixes | M | Low | Independent per-site fixes; Breadcrumb + Minimap + CategoryViewImpl first |
| 5 | R5 immer large-state | S×3 | Low | log-view, notebook, graph — pattern already documented |
| 6 | R6 dom-props/refs/memo retirement | L | Med | After R2; largest uikit change |
| 7 | R7 model/view collapses | M | Low | Dialogs first (shared Escape), then uikit file merges |
| 8 | R8 timing hygiene | S | Med | Each deferral needs individual verification |
| 9 | R9 comment/dep sweep | S | Low | Except the two code-review items (browser webview, automation wait) |
| 10 | R10 patterns | S–M each | Low | Emitter + DisposableStore + scheduling are the valuable three |

A sensible epic split: **EPIC A — core contracts** (R1, R3, R10.1-3), **EPIC B — the pump** (R2, R6, R10.4-6), **EPIC C — targeted fixes** (R4, R5, R7, R8), **standalone** (R9).

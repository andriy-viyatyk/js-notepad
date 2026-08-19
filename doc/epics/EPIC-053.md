# EPIC-053: De-React Epic B — The reactive foundation and the boundary

## Status

**Status:** Completed
**Created:** 2026-08-18
**Completed:** 2026-08-19

## Overview

The third epic of the [de-React roadmap](../de-react.md) (§7, "Epic B"), and the one the roadmap
calls "the largest design epic and the one that decides whether the rest is pleasant or miserable".
It delivers the vanilla half of roadmap §3: the reactive primitive a view binds to, the view
lifecycle itself, and the two adapters that let React and vanilla nest in either direction so no
later epic is ever all-or-nothing.

Epic A made *styling* reachable from non-React code. Epic B makes *rendering* reachable from it.
After this epic, a component can be written with no React in it and dropped into the running app
behind an unchanged React-facing signature — which is the entire precondition for Epic C.

Unlike Epics P and A, **this epic is not independently valuable in the same way**. Dropping zustand
stands on its own; the view lifecycle, the binding primitive and the adapters are
worth nothing until something is converted. That is why the epic ends with a pilot: it is the only
task that proves the rest was built correctly, and it is the point at which the roadmap's abort
criteria (§9) can first be evaluated against real code.

**Roadmap Rule 5 ("no new React") remains in force** from Epic A. Rule 1 (never convert a component
and its parent in the same change) and Rule 2 (preserve the React-facing prop signature) begin to
bind here, at the pilot.

## What the roadmap assumed, and what is actually true

Measured on the branch at epic open. Four of the roadmap's statements about this epic are wrong, and
three of them make the epic **smaller**.

| Roadmap statement | Actual state |
|---|---|
| "`ComponentQueue` gains a plain `subscribe` path in place of its hook" | **Already done.** `subscribe()` and `register()` are the primary implementation ([`ComponentQueue.ts:35`](../../src/renderer/core/state/ComponentQueue.ts), `:88`), each draining its backlog on registration. `use()` and `useRequest()` are six-line `useRef`/`useEffect` wrappers over them. The channel is already framework-free; only the two hooks are React, and they are deleted in Epic F, not here. |
| "`immer`'s `produce` stays — it is framework-agnostic and used in five files" (§3.3) | **Used in one file.** `state.ts` is the only importer of `immer` in the entire tree, through `TOneState.update()`. The conclusion (keep it) is unchanged; the count is not. |
| "React observes them through 16 `useSyncExternalStore` call sites — that is the entire bridge" (§2) | **Misdescribed.** There are 16 such call sites in 10 files, but **none of them are the state layer's own bridge** — 14 hand-roll a subscription to an `IState` (`editor.state`, `vm.state`) inside a component, and 2 bridge the plain-object overlay/tooltip registries. `TOneState.use()` reaches React through **zustand**, not through those sites. The bridge to rebuild is `use()`; the 16 sites are independent and can stay as they are. |
| "the state layer sheds a dependency … `zustand` is deleted" (§3.3) | **True, and cleaner than described.** `zustand` is imported by exactly one file, in two statements. But the roadmap does not say what replaces `use()`: zustand supplies `useStoreWithEqualityFn`, whose selector-caching contract is not reproducible with a bare `useSyncExternalStore`. See B1. |

Two roadmap claims hold up exactly as written: `TComponentModel` is React-free apart from the file's
top-level import (`effect`, `memo`, `_evaluateEffects`, `setPropsInternal`, `_initInternal`,
`onUnmountInternal` touch no React), and `useComponentModel` is a thin adapter — 20 lines at
`model.ts:238-257`, of which 9 are the generic signature and 8 are the body (the roadmap's "twelve
line" figure is close enough to stand, but it is not exact).

## The surface, measured

| Item | Measure |
|---|---|
| `zustand` importers | 1 file, 2 import statements (`create`, `useStoreWithEqualityFn`) |
| `immer` importers | 1 file (`state.ts`) |
| State layer total | 722 lines across 6 files (`state` 162, `model` 258, `ComponentQueue` 133, `view` 95, `events` 70, `index` 4) |
| `IState.subscribe` call sites | 153 |
| `.use()` call sites | 319 total — 255 `state.use(` / `.state.use(`, plus 33 `settings.use(`, 11 `ComponentQueue` `.use(`, 5 `themeState.use(`, and a `TGlobalState` tail. All but the 11 queue sites go through `TOneState.use()` |
| `useComponentModel` call sites | 57 |
| `useModel` call sites | 8 |
| `Views.registerView` call sites | 18 |
| `ComponentQueue.use()` call sites | 11 |
| `TComponentModel.effect()` call sites | 65 — **4** mount-once, **50** with `this.props.*` deps, **17** with `this.state` deps (10 of those also read props), **4** with deps on neither |
| `useSyncExternalStore` call sites | 16, in 10 files (independent of the state layer — see above) |
| Stories in the harness | 39 registered in `storyRegistry.ts` (38 uikit + `GitTree` from `components/`), of which 2 are already plain `.ts` (`Checkbox`, `Label`) |
| React render call in the harness | 1 — [`LivePreview.tsx:61`](../../src/renderer/editors/storybook/LivePreview.tsx) |
| `.tsx` in the five areas Epics C–E convert | 341 files / 54,950 lines (`editors` 180/28,810 · `uikit` 100/14,354 · `ui` 36/5,796 · `components` 21/3,531 · `theme` 4/2,459). `src/renderer` as a whole is 344 files / 55,187 lines |
| Vanilla-ready hosts already in place | 1 — `getOverlayLayer()` ([`overlayLayer.ts`](../../src/renderer/uikit/shared/overlayLayer.ts), Epic P US-973), explicitly documented as available to non-React views |

**The epic's measured number** (roadmap Rule 4): `zustand` importers → 0; and the pilot component
rendered through its vanilla-backed React-facing entry point in the Storybook harness, producing an
equivalent `data-name` DOM tree; and a counted reduction in DOM writes per state update for one named
interaction, measured and recorded by US-991. Running across the epics that follow: `this.effect(` call sites
**65 → 0** by Epic F (B13).

## What av-grid already settles

[`C:\projects\av-grid`](file:///C:/projects/av-grid) is not only the motivating benchmark — it is a
finished implementation of half this epic's design questions, in production, with tests. It should
be read before any task here is written.

- **`core/observable.ts` (170 lines) is the drop-zustand answer, already written.** It is a value
  plus a listener array with `get` / `set` / `update` / `clear` / `subscribe` / `batch` / `flush` /
  `dispose`. Its header documents three deliberate departures from Persephone's `TOneState`: **no
  selectors** (the render layer's dirty set does that job more precisely), **shallow clone instead
  of immer**, and **microtask-coalesced notification** with a nesting `batch()` depth counter — the
  last of which this epic does not adopt (B8).
- **`render/CellPool.ts` (93 lines) is the keyed-list answer** in its high-performance form.
- **`render/` is a vanilla port of Persephone's own `uikit/RenderGrid/`**, with the same file names
  (`RenderGrid`, `RenderGridModel`, `renderInfo`, `rerender-check`, `AsyncRef`) — but the fidelity
  differs sharply per file, and the difference matters. `types.ts:11` says `renderInfo.ts` and
  `rerender-check.ts` are "ported nearly line-for-line" (`ReactNode` → `HTMLElement`,
  `CSSProperties` → `CellStyle`, refs dropped). `RenderGrid.ts:2`, by contrast, calls itself
  "**a rewrite of `RenderGrid.tsx`, not a transliteration of it**", and `RenderGridModel.ts:4-13`
  documents a substitution table with a **different public API**: `extends TComponentModel` →
  `extends Model`, `mapProps`/`setProps` → `setOptions(partial)`, `isFirstUse` + `setTimeout` →
  a `ResizeObserver` in `attach()`, `isLive` → `disposed`. It is public API, not an internal of the
  grid. See B9.
- **`view/` holds 18 files, six view classes, and no base class at all** — `Popover`, `Menu`,
  `VirtualList`, `GridInteractions`, `OptionsFilterContent`, `CustomFilterContent`. The rest are
  **factory functions** returning a record of callbacks (`createCellInput`, `createCellSelect`,
  `createSelectColumn`, `createButton`, `showFilterPopover`, `renderHeaderCell`, `renderDataCell`,
  …), several of which expose `destroy()` from the returned object with no class at all. There is no
  `VanillaView`, no `bind()`, no shared disposal registry anywhere. This is direct evidence against
  one of the roadmap's candidate tasks, and it is raised as Concern 2 rather than quietly adopted
  either way.
- **`view/Popover.ts` is the reference for a view that lives outside its owner's DOM**, which is the
  shape `mountVanilla` has to support.

**The code is a design reference, not a source to copy.** The contracts differ in three ways that
matter — Persephone's `IState` has the selector overload (≈255 call sites depend on it), keeps
immer, and is consumed by React — so the *decisions* port and the *lines* do not.

## Decisions

**B1 — `use()` is rebuilt on React's own `useSyncExternalStore`, with no replacement dependency.**
Dropping zustand removes `useStoreWithEqualityFn`, which is what makes `use(selector)` re-render
only on a real change. React 19 exports `useSyncExternalStore` directly; only the *with-selector*
variant is a shim, and it is a `useRef`-cached snapshot around the `compareSelection` function
`state.ts` already owns — roughly fifteen lines.
The selector form uses that cached comparison; the no-selector overload must instead pass the
current state object directly to `useSyncExternalStore`, preserving zustand's Object.is behavior
for replaced-but-deep-equal state objects.

**`use-sync-external-store` is already a direct dependency and is removed, not adopted.**
`package.json:87` declares it directly because the current `zustand/traditional` import consumes
zustand's optional peer at runtime; it is not independent unused cleanup. The hand-rolled shim
wins on its own merits: it is ~15 lines against `compareSelection`, which we own and must call
anyway, versus a package we would then carry and update forever for one function. **US-985 removes
the direct `use-sync-external-store` declaration after removing `zustand/traditional` along with
`zustand`; the transitive copy required by Excalidraw's nested zustand remains.**

**Two details the rebuild must get right, neither of which `useOptionalState` demonstrates.**
`useOptionalState` (`state.ts:127-155`) hand-rolls a subscription with `useState`/`useEffect` over
the *non-selector* `subscribe()` and never calls `compareSelection` — it is a precedent for
subscribing by hand, **not** for the cached snapshot this needs. `useSyncExternalStore` requires
`getSnapshot` to return a **referentially stable** value between notifications; a selector that
builds an object (`s => ({ open, activeIndex })`, which is the common form here) returns a new
object every call and makes React loop forever. The snapshot must be cached in a `useRef` and
replaced only when `compareSelection` reports a change. Second, `use()` has a **no-selector**
overload (`state.ts:80`, currently `this.store(state => state)`) that must keep working.

**B2 — `immer` stays.** The roadmap's reason (framework-agnostic) is right even though its count is
wrong. `TOneState.update()` gives callers a deep mutable draft, and an unknown number of the update
call sites mutate nested objects; av-grid's shallow-clone substitute is safe there only because
nothing in the grid compares nested state. Persephone's `compareSelection` does exactly that. This
epic does not change `update()` semantics.

**B3a — The `Views` registry is not converted in this epic.** `core/state/view.tsx` is React *and*
Emotion (`ViewRoot` is a `styled.div`), and its 18 `registerView` call sites are dialogs and
poppers — shell surface that belongs to Epic D. Roadmap §3.1 does describe a vanilla `Views` path
("registers a class and returns a DOM node instead of a `ReactElement`"), but nothing in Epic B
needs it: the pilot is a leaf reached through `mountVanilla`, not through `Views`. **US-986's base
class is therefore designed for the `mountVanilla` boundary only, and the dialog host is explicitly
out of scope.** When Epic D converts it, `View`/`renderView` gain a vanilla branch the same way
`LivePreview` does in US-990 — that is a note for Epic D, not a deferred decision here.

**B3 — `ComponentQueue` is not modified.** Its non-React path already exists (see the table above).
The model-driver task confirms this by using `subscribe`/`register` directly and changes nothing in
the file.

**B4 — The two-way adapters are the epic's real deliverable, and they land before the pilot.**
`mountVanilla` (a React component owning a host `<div>`) and `mountReact` (a vanilla view creating a
React root) are what make roadmap §5 true. Everything else in this epic is replaceable; without
these two, no later epic can proceed incrementally. `getOverlayLayer()` is the precedent for the
host-element discipline and the adapters follow it.

**B5 — The Storybook harness's temporary widening is superseded by US-994.** `Story` remains
almost framework-neutral data: `id`, `name`, `section`, `props`
(the `PropDef` union) and `defaultProps` carry no React types. Exactly two fields do — `component:
React.ComponentType<P>` and `previewChildren?: () => ReactNode` — and there is exactly one render
call, `LivePreview.tsx:61`. `previewChildren` stays React-only until Epic C answers the subtree-slot
question (Epic P D4).

US-990 temporarily rendered both versions at once, so `component` was not widened to a union. A
separate vanilla field and split pane were later removed by US-994: after conversion, both paths
would render the same vanilla implementation and provide no comparison.
US-994 returned `LivePreview.tsx:61` to one pane, keeping the unchanged `propValues` path and
`EditorErrorBoundary`. `ComponentBrowser` and `PropertyEditor` remain untouched. US-991 verifies
the vanilla-backed production path at the appropriate point in the conversion, rather than beside
an identical direct vanilla render.

> **Reversed 2026-08-19, in part — US-994 removes `vanillaComponent` and the split pane.** *(User
> decision.)* The paired pane assumed the two panes render different implementations. They do not.
> Rule 2 requires a converted component to keep its React-facing signature, so `PathInput.tsx`
> becomes a thin `mountVanilla(PathInputView, props)` delegate — at which point `component` renders
> the React face, which renders the vanilla view, and `vanillaComponent` renders the same vanilla
> view directly. **Both panes produce identical DOM from identical code**, differing only in whether
> the adapter or a vanilla parent constructed the view. There is no delta to compare, and the Rule 4
> mutation counts would count the same DOM writes twice.
>
> This applies to every Epic C conversion for the same reason: a converted component *replaces* its
> React implementation, so no later component has a React version left to occupy the second pane
> either. Verification is the ordinary single-pane story, which after conversion renders exactly
> what a production caller gets. The measured number moves from two panes at once to two points in
> time — see the US-991 note.
>
> The rest of B5 stands: `Story` is framework-neutral data apart from `component` and
> `previewChildren`, `previewChildren` stays React-only pending Epic C's subtree-slot question, and
> `LivePreview` remains the single render call. US-990 was not wasted — it proved `mountVanilla`
> renders and disposes correctly from a React parent before any production caller depended on it,
> and its preview-level `EditorErrorBoundary` is kept.

**B6 — Nothing in this epic changes a React call site.** Every task before the pilot adds code
beside the existing path; the pilot converts one component behind an unchanged signature (Rule 2).
The 57 `useComponentModel`, 8 `useModel`, 18 `registerView` and 319 `.use()` call sites compile
untouched at **every commit before the pilot**. US-991 then changes exactly one of them — `PathInput`
itself — behind an unchanged signature, so no *caller* changes anywhere in the epic.

**B7 — Roadmap decision #2 (templating) governs every line of view code written here.**
`document.createElement` for structure; `innerHTML` only for static, code-owned markup and never
with interpolated runtime data. In this process model (`nodeIntegration: true`,
`contextIsolation: false`, no CSP, no sanitizer in the renderer) that is a security boundary, not a
style preference. If the tasks add an `el(tag, props, ...children)` helper it stays a helper over
`createElement` and **does not accept a markup string**. See roadmap §3.4.

**B8 — No update coalescing. `set()` stays synchronous, and there is no batching task.**
*(User decision, 2026-08-18, resolving Concern 1.)* av-grid coalesces because it is a virtualized
surface repainting hundreds of cells per frame; that is a property of *that* workload, not of
components in general. Persephone's other components have no such pressure, and there are 153
`subscribe()` call sites written against synchronous notification whose behaviour would change for
no demonstrated benefit. The migration starts simple and the optimization is added if a converted
view actually shows a multi-pass problem — at which point the fix is scoped to that view, and
`Observable`'s `batch()` / `flush()` shape is already available to copy. The component class that
*does* have the pressure is handled by B9 instead, which is the more precise answer to the same
question.

**B9 — The virtualized components take av-grid's render engine rather than a hand-written one.**
*(User direction, 2026-08-18.)* Investigation confirms this is not a port but a **re-adoption of a
fork**: av-grid's `render/` folder is a vanilla rewrite of `uikit/RenderGrid/`, carrying the same
file names and, by its own header, ported "nearly line-for-line" with `ReactNode` → `HTMLElement`
and refs dropped. It is exported as public API — `RenderGrid`, `RenderGridModel`, `calcRenderInfo`,
`prepareRerender`, `CellPool`, `AsyncRef`, `Observable` — and av-grid's own docs note the engine is
"useful on its own", with its benchmark harness driving `RenderGrid` directly with no grid on top.
The virtualization work Epic B would otherwise have to invent for `LogView`, `Tree`, `ListBox`,
`GitTree`, `LinkEditor`, `NotebookBody`, `FileSearch` and the rest is therefore already written and
tested.

Two consequences bound the scope:

- **This is not an Epic B task.** The engine is free; the cost is per-consumer, because
  Persephone's `RenderedCell` is a `ReactNode` and av-grid's is an `HTMLElement`. A consumer can
  only move once *its own cell renderers produce DOM*, which is exactly Epic C (`Tree`, `ListBox`)
  and Epic E (`LogView`, `NotebookBody`, `LinkEditor`, `GitTree`) work. Epic B's job is to record
  the decision and to **not build a competing keyed-list/virtualization primitive** — US-987 stays a
  general keyed-list and subtree-swap helper for ordinary views and explicitly does not grow into a
  virtualizer.
- **The source is copied in, and the two copies are a deliberate permanent fork.** *(User decision,
  2026-08-18, reversing the initial recommendation to consume av-grid as a dependency.)* av-grid's
  source lands in the Persephone tree and is then developed against Persephone's needs — including
  giving its view classes the B10 base. **The av-grid repository is not frozen and is not
  regenerated from Persephone's code.** It continues as a separate, deliberately light library whose
  only consumer is boards. Two copies of the same grid is the accepted outcome, not a problem to be
  solved later.

  The reason is that the two artifacts have opposite constraints, so the same code cannot be right
  for both. av-grid's value to a board *is* its lightness: zero runtime dependencies, one UMD file
  to vendor, and a `--p-*` fallback chain that themes it with no JavaScript. Building it out of
  Persephone's tree would couple it to UIKit, which grows in functionality over time, and every one
  of those additions would arrive in a board's bundle whether the board wanted it or not. This is
  the same reasoning the roadmap already applies to markdown in §3.6, where `marked` is the right
  answer for boards and the wrong one for the renderer: boards and the renderer are different
  products and are allowed different choices.

  **Consequences worth stating plainly.** Roadmap open decision #5's "one source tree, two products"
  target is unaffected — it is about UIKit extraction, and av-grid is now explicitly *not* an
  instance of it. Nothing changes for boards: the catalog entry, the unpinned jsdelivr URLs and the
  `--p-*` contract all stay as they are.

  **The two repositories are not kept in sync, and Persephone does not track the other one.** After
  the copy lands, av-grid is a completely separate project. There is no port-the-fix process, no
  cross-repo checklist, and no task or epic in Persephone that exists because something changed in
  av-grid. When a fix in one is worth having in the other, the owner raises it in that project on
  its own terms. Divergence is the expected steady state, not a debt.

**B10 — There is a view base class, and views form an ownership hierarchy.**
*(User decision, 2026-08-18, resolving Concern 2.)* The lifecycle is defined and evolved in one
place rather than restated in every view, and a view **owns its child views**: disposing a parent
disposes its children, depth-first, without the parent's author writing a teardown method.

This makes the disposal registry uniform rather than larger. A view already has to own two kinds of
thing that must be released — state subscriptions and DOM listeners — so children are a third entry
in a registry that exists anyway, not a new mechanism. It is also the one guarantee React gives for
free that nothing else in this migration replaces: unmounting a subtree currently disposes
everything under it, and without cascading disposal every converted container becomes a place where
a leak can hide.

Two details US-986 must pin down, because they are where this design usually goes wrong:

- **Children are registered explicitly, not discovered from the DOM.** A view's children are the
  views it constructed, which is not the same set as the views inside its root element — `Popover`
  in av-grid is the standing counter-example, and `mountVanilla` hosts are another. Ownership is
  declared by whoever created the child.
- **`mountReact` participates.** A React root created inside a vanilla view is a child for disposal
  purposes and must be unmounted by the cascade, or the boundary leaks in exactly the direction
  roadmap §9 warns about.

The base stays minimal in what it *provides* — root element, disposal registry (subscriptions,
listeners, children), `bind`, and the `mount` / `update(props)` / `dispose` lifecycle — and adds
nothing else. av-grid's ten base-class-free view classes remain the standing reminder of what this
must not become — enforced by asking whether each addition is demanded by a real conversion, not by
a line budget (B14).

**B11 — The ownership hierarchy does not carry a context lookup.** *(Considered and rejected,
2026-08-18.)* Cascading disposal (B10) makes a parent→child chain available, and an ancestor-lookup
API in the shape of React context would be easy to add on top of it. It is not added, for three
reasons.

**Epic P deleted exactly this, on purpose.** US-972 replaced all five React context sites —
`EditorConfigContext`, `LogViewContext`, `AVGrid/filters/useFilters`, `AVGrid/useAVGridContext`,
`uikit/shared/highlight` — with explicit model references and parameters, on the roadmap's stated
grounds that "context has no vanilla equivalent". The renderer today contains **zero
`createContext` and zero `useContext` call sites**. Reintroducing the mechanism under a new name in
the next epic would spend that work rather than build on it.

**Both cases it would serve already have an answer, and they are different answers.** Genuinely
ambient values — the theme, the overlay host — are **module singletons**: `themeState` (EPIC-052 A3)
and `getOverlayLayer()` (Epic P US-973) are imported directly by whoever needs them, with no tree
walk and no provider. Subtree-scoped values are **explicit**: `editorConfig` is threaded as a prop,
`highlight()` takes its search text as an argument. A chain lookup is a worse fit for the first
(module scope is simpler than tree scope for something with one instance) and a strictly weaker
version of the second (it loses the type checking that makes the explicit form safe).

**It would interact badly with B10 specifically.** Ownership is registered explicitly and is
deliberately *not* the DOM tree — `Popover` and `mountVanilla` hosts render outside their owner's
root. A lookup walking the ownership chain and a lookup walking the DOM would disagree for exactly
the cases where a developer would reach for context, and neither answer is obviously the right one.
A mechanism whose scoping rule is ambiguous at the boundary is worse than no mechanism.

**Reopening condition:** a concrete case in Epic C or D where a value is needed by a deep view, has
more than one live instance (so a module singleton is wrong), and threading it costs more than three
intermediate views. That case has not appeared in five context sites' worth of prior evidence, but
if it does, this decision is the place to revisit — with the scoping rule settled first.

**B12 — `PathInput` is the pilot.** *(User decision, 2026-08-18, resolving Concern 3.)*
`uikit/PathInput/` is 159 lines of view over a 292-line model, a 72-line pure helper and a 111-line
story. It was chosen over the trivial primitives (which have no model and would prove nothing) and
over `Tree` / `ListBox` (whose models are larger than the entire primitive layer this epic builds).

What makes it the right size is that it exercises **every primitive in the epic at once**, and one
of them in the harder direction:

| Primitive | How `PathInput` exercises it |
|---|---|
| `mountVanilla` (US-989) | Four React consumers — `EditLinkDialog`, `ExpandedNoteView`, `NoteItemView`, `TagsInput` — plus the story registry keep calling `<PathInput …>` unchanged (Rule 2). |
| `mountReact` (US-989) | Rule 1 forbids converting a component and its children together, so the vanilla `PathInput` **hosts React `Input` and React `Popover`**. The pilot is therefore a React → vanilla → React sandwich and validates both adapters nested, not just the easy direction. |
| View base + cascade (B10, US-986) | Those two React roots are registered children; disposing `PathInput` must unmount both. |
| `bind` (US-986) | `model.state.use(s => ({ open, activeIndex }))` becomes two independent bindings. |
| Keyed list (US-987) | `suggestions.map(…)` keyed by `s.path`, with per-row refs — the exact case `bind` cannot express. |
| Model driver (US-988) | `useComponentModel(props, PathInputModel, defaultPathInputState)`, including the ref plumbing (`setInputRef`, `setRowRef`). |
| Effect decomposition (B13) | Four `effect()` calls: two on a `memo` (B13's unresolved fourth shape), one on state, one mount-once. It exercises **none** on props — 50 of the 65 real sites — so the dominant decomposition is not validated here and that risk carries into Epic C. |
| Storybook path (US-990) | `PathInput.story.tsx` already exists. |

Three things it does **not** cost, which is why it is cheap:

- **`PathInputModel` is React-free at runtime but not in its type signatures.** It uses React types
  in **three** places, not one: the `React.HTMLAttributes<HTMLDivElement>` it extends (`:11`), and
  two event handlers wired straight to DOM events — `onRowMouseDown(e: React.MouseEvent)` (`:156`)
  and `onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>)` (`:171`). A vanilla view hands
  those native `MouseEvent` / `KeyboardEvent`, which are not assignable to React's synthetic types,
  so **the model does change**: both signatures widen to the native event. Both handlers use only
  `e.key` and `e.preventDefault()`, which exist on both, so it is a signature edit and nothing more.
  `suggestions.ts` (72 lines) is pure and imports nothing. The pilot is therefore *mostly* a view
  rewrite — roadmap §2's "models cross the boundary untouched" is close to true but not literally
  true, and this is where that gets measured rather than assumed.
- **The `useCallback` ref-merging glue simply disappears.** `setInputRef` exists only to merge the
  model's ref with a forwarded one; a vanilla view holds `this.inputEl` for its lifetime. That is
  the "stable control identity" argument of §3.1, demonstrated rather than asserted.
- **`TComponentModel.memo` is verified untouched.** `model.suggestions.value` is a memo, and it
  should survive the conversion without a line changing.

**It is also the first real application of Epic A's style conventions.** `Root` and `SuggestionRow`
are Emotion, and a vanilla view cannot use `styled`, so the pilot converts them under US-983's rules
— with `data-active` / `data-disabled` / `data-readonly` exercising the A6 discrete-state form at a
scale `Spinner` could not. Epic A's conventions get a second, larger validation for free.

**Two concrete things to check, both easy to get wrong:** the vanilla root must keep emitting
`data-type="path-input"`, because `Popover`'s `outsideClickIgnoreSelector` depends on it and the
popover will otherwise close on its own input clicks; and `Popover` portals into
`getOverlayLayer()`, so the pilot confirms that a React child of a vanilla parent still reaches the
shared overlay host.

**B13 — `effect()` is React-era scaffolding. The vanilla driver evaluates no effects.**
*(User decision, 2026-08-19, replacing Concern 4 rather than answering it.)* The original question —
does the driver reproduce React's "effects evaluate during render" ordering, or adopt the natural
post-mount one — assumed `effect(callback, depsFactory)` is part of the target state. It is not.

**Neither reference implementation has the concept.** av-grid, which is a full vanilla port of this
codebase's own grid, contains **zero** effect or dependency-array machinery; its views have explicit
methods and `destroy()`. VSCode's primitives are `Emitter<T>` / `Event<T>`
(`vs/base/common/event.ts`) and `DisposableStore` / `IDisposable` (`vs/base/common/lifecycle.ts`) —
explicit lifecycle, explicit subscription, explicit disposal, and nothing that diffs a dependency
array. `effect()` exists to solve a problem React creates: a render function runs repeatedly and
does not know what changed, so the dependencies are declared and a reconciler diffs them. **A
vanilla view does not have that problem — it knows what changed, because it is what changed it.**

**Almost every call site maps onto something that already exists.** Classified by parsing all 65
`this.effect(` calls and inspecting the deps factory (a deps array can read both props and state, so
those two rows overlap by 10):

| Effect shape | Sites | Framework-neutral replacement |
|---|---:|---|
| Deps on `this.props.*` | **50** | `setProps(props)`, comparing against `this.oldProps` |
| Deps on `this.state` | **17** | the method that changes the state performs the consequence |
| No deps — run once on mount | **4** | `init()` / the view's `mount()` |
| Deps on a `memo()` or on **another model's** state | **4** | **undecided — see below** |
| Returns a cleanup function | — | the B10 disposal registry |

**The dominant shape is props, not mount-once**, and that is the honest cost of this decision: 50 of
65 become `setProps` + `oldProps` comparisons, which is a real refactor rather than a deletion. It
is still a refactor that ships on React, one model at a time, with no behavioural change.

**The fourth row is a genuine gap and is not resolved by this decision.** Four sites depend on
something with no local mutator, so "the method that changes it performs the consequence" has no
owner:

- `uikit/PathInput/PathInputModel.ts:255` and `:264` — deps `[this.suggestions.value]`, where
  `suggestions` is a `memo()` (`:90`). A memo is pull-based and has no setter, so nothing can
  "perform the consequence" at write time.
- `ui/sidebar/MenuBar.tsx:164` — deps `[menuFolders.state.get().folders]`
- `ui/tabs/PageTabs.tsx:60` — deps `[pagesModel.state.get().pages.length]`

  Both read **another model's** state, whose mutator lives in a different class that cannot know
  about this consequence.

The available answers are (a) convert the memo into a field written explicitly by whoever changes
its inputs, and (b) for foreign state, an explicit `subscribe` registered in `init()` and released
through the disposal registry — which is `bind` in all but name. **US-991 must pick one for the memo
case and record it**, because the pilot hits it twice and Epic C will hit it again.

`init`, `setProps`, `oldProps` and `dispose` are all on `TComponentModel` today and all behave
identically under React and under the vanilla driver. **A model can therefore shed its effects while
still on React**, as an ordinary refactor with no behavioural change, and is only then convertible.
No adapter object is introduced: an adapter would be a container for an empty set, since the
replacements are not React-specific.

The pilot's four effects are the worked example. **Neither target method exists today** — both are
introduced by the conversion, and two existing call paths are rerouted through one of them:

```
// today (PathInputModel.ts)                        // after
:255 effect(rowRefs.length = n,  [suggestions.value])  ┐ new applySuggestions(next), called
:264 effect(activeIndex = null,  [suggestions.value])  ┘ wherever the suggestion inputs change
:274 effect(scrollIntoView(),    [state.activeIndex])  → new setActiveIndex(i), and reroute the
                                                          three existing writers through it:
                                                          onRowMouseEnter (:166) and the ArrowDown
                                                          / ArrowUp branches of onInputKeyDown
:285 effect(autoFocus …)            (no deps)          → init() / mount()
```

The first two are the fourth-row case above: `suggestions` is a `memo`, so `applySuggestions` only
exists once the memo becomes an explicitly-written field. **That trade has to be made deliberately** —
the memo's deps guard is what stops the suggestion list being recomputed on every keystroke, so
whatever replaces it must preserve that, or the pilot ships a performance regression in a live
component.

**Consequences:**

- **US-988's driver contains no `_evaluateEffects()` call.** Its lifecycle is `mount()` /
  `update(props)` → `setPropsInternal` → `setProps` / `dispose`. There is no evaluation, so there is
  no ordering question — which is why Concern 4 dissolves instead of resolving.
- **Zero `effect()` calls is a precondition for converting a model**, checkable with one grep.
- **`effect()`, `memo()`'s deps machinery's sibling `_evaluateEffects`, and the registration array
  stay on `TComponentModel`** for unconverted models, and are deleted in Epic F with the rest of the
  React surface. `memo()` itself is unaffected — it is a cache, not a lifecycle hook, and roadmap
  §3.2 already classifies it as solved.
- **This retires a latent bug class rather than porting it.** Today an effect's *first* evaluation
  runs after commit (from `useEffect` → `_initInternal`) and every later one runs during render
  (from `setPropsInternal`), so the same effect sees a fresh DOM once and a stale DOM thereafter.
  `PathInputModel`'s scroll-into-view effect is a live instance: on a keyboard move it scrolls using
  the row elements from the *previous* commit. Decomposition removes the discrepancy by construction.
- **Measured number** (roadmap Rule 4): `this.effect(` call sites **65 → 0** by Epic F.

**B14 — The roadmap's "200 lines" is an estimate, not a budget.** *(User decision, 2026-08-19,
resolving Concern 5.)* Roadmap §3.2 and §7 say the primitives "should land in roughly 200 lines" and
that substantially more means the epic is drifting. That figure was an assumption made before
anything was measured, and it does not survive the measurement: av-grid's `Observable` is 170 lines
on its own, and `CellPool` another 93. **The primitives are implemented at whatever size they need
to be**, and no task in this epic is scoped, split, or rejected on a line count.

**What the number was standing in for is still worth keeping**, because it was never really about
lines — the roadmap's own phrasing is "the failure mode of this phase is accidentally writing a
worse React". That check survives in a form that can actually be applied:

- **A primitive is added when a converted component demands it, never in advance.** The pilot is the
  demand test; anything US-991 does not need is not built in this epic.
- **av-grid's `view/` folder is the comparison.** Ten production view classes needed no base class,
  no binding helper and no framework. When something here has no counterpart there, that is the
  moment to ask why — not to refuse it, but to answer the question deliberately.
- **B11 is the worked example of the check passing.** A context lookup was rejected on its merits —
  it duplicated two mechanisms that already exist, and its scoping rule was ambiguous at the
  boundary — not because it would have cost lines.

Drift is a design judgement. It is caught by asking whether a thing is needed, not by counting what
it costs.

**B15 — Only `render/` and the grid come in. Everything with a UIKit counterpart is dropped and
UIKit is used instead.** *(User decision, 2026-08-19, resolving Concern 7a.)* The scope is defined
by what Persephone already owns: **`uikit/RenderGrid/` and `uikit/AVGrid/` are replaced by their
av-grid counterparts, and nothing else is imported.** av-grid's supporting view classes exist only
because that library has no UIKit to lean on; Persephone does, and importing them would install a
second `Popover` and a second `Menu` permanently — the exact opposite of what a single component
library is for.

The correspondence is close to file-for-file, which is what makes this a swap rather than a merge:

| av-grid | Lands as | Note |
|---|---|---|
| `render/` (`RenderGrid`, `RenderGridModel`, `renderInfo`, `rerender-check`, `CellPool`, `types`) | `uikit/RenderGrid/` | Same file names on both sides; the vanilla port of this folder is what started the whole idea (B9). |
| `core/AsyncRef.ts` | `uikit/RenderGrid/` | Travels with the engine, and carries the fix for US-993. |
| `AVGrid.ts`, `options.ts`, `types.ts`, `gridUtils.ts`, `column-width.ts`, `validate.ts` | `uikit/AVGrid/` | Counterparts of `AVGrid.tsx`, `useResolveOptions.ts`, `avGridTypes.ts`, `avGridUtils.ts`, `column-width.ts`. |
| `model/` | `uikit/AVGrid/model/` | Near-identical rosters; Persephone additionally has `AVGridActions`, `EffectsModel`, `ContextMenuModel`, av-grid additionally has `StructureModel`. Note `FiltersModel` changes folder — `uikit/AVGrid/filters/` here, `src/model/` there. |
| `view/` grid internals — `HeaderCell`, `DataCell`, `CellInput`, `CellSelect`, `SelectColumn`, `DefaultEditFormatter`, `GridInteractions`, `cellDom`, `icons` | `uikit/AVGrid/` | These are the grid; they have no life outside it. |
| `view/FilterBar`, `FilterPopover`, `OptionsFilterContent`, `CustomFilterContent`, `ContextMenu` | `uikit/AVGrid/filters/` | The filter surface, which is one of the named core units. |
| `view/Popover`, `view/Menu`, `view/Button` | **dropped** | Use `uikit/Popover`, `uikit/Menu`, `uikit/Button`. |
| `view/VirtualList` | **dropped** | Three view consumers — `CellSelect`, `OptionsFilterContent`, `Menu`; the React versions already use `uikit/Select` and `uikit/MultiListBox`, so those are the substitutes. |
| `core/observable`, `core/events`, `core/csv`, `highlight.ts` | **dropped** | Persephone owns `TOneState`, `core/state/events.ts`'s `Subscription`, `core/utils/csv-utils.ts` and `uikit/shared/highlight.ts`. |
| `core/utils.ts` | `uikit/AVGrid/` | Not optional — `gridUtils.ts:12` and `model/ColumnsModel.ts:11` import `isNullOrUndefined` / `memorize` / `range` from it, and both of those files are coming in. |
| `styles/av-grid.css.ts` | **adapted, not copied** | The `--avg-*` → `--p-*` fallback chain is the board contract; the in-app copy reads Epic A's app tokens instead. It also carries the class names for the dropped `Popover` / `Menu` / `VirtualList`, so the adaptation is not mechanical. |
| `src/index.ts` (public barrel) | **dropped** | `uikit/RenderGrid/index.ts` and `uikit/AVGrid/index.ts` stay as Persephone's barrels and keep their current export surface. |
| **`uikit/RenderGrid/RenderFlexGrid.tsx` — no av-grid counterpart exists** | **undecided** | 241 lines with three production consumers (`LogBody.tsx`, `NotebookBody.tsx`, `NoteItemViewModel.ts`). "`uikit/RenderGrid/` is replaced" would delete it. It is also one of roadmap §3.5's five Rule 6 leaks (it imports `shared/utils`). **Epic C must decide: keep and port by hand, or migrate its three consumers.** |

**The absorption is not a drop-in, in two ways the table alone hides.** First, `RenderGridModel`'s
public API differs from the React version's — `setOptions(partial)` instead of `mapProps`/`setProps`,
`attach()` with a `ResizeObserver` instead of `isFirstUse` + `setTimeout`, `disposed` instead of
`isLive` — so all ~15 `RenderGrid` consumers need **host-wiring changes**, not just cell renderers
that emit DOM. Second, the drop list is not four leaves: `Popover` is referenced by **nine** of the
files being imported (`HeaderCell`, `FilterBar`, `FilterPopover`, `CellSelect`, `CustomFilterContent`,
`GridInteractions`, `ContextMenu`, `AVGridModel`, `AVGrid.ts`) and `Menu` by **seven**, so every one
of those call sites is rewritten against `uikit/Popover` and `uikit/Menu`. That rewrite is the actual
content of the absorption task.

**The consequence to plan around: this makes AVGrid one of the *last* Epic C conversions, not one of
the first.** A vanilla grid built on UIKit's `Popover`, `Menu`, `Button`, `Select` and
`MultiListBox` cannot land until those are themselves vanilla — otherwise the hottest component in
the app is wrapping React roots through `mountReact` on every dropdown and every filter popover.
Taking av-grid's self-contained view classes instead would have let the grid land early and
independently; that is the price of not carrying a duplicate component set forever, and it is worth
paying. The roadmap's Epic C candidate ordering already puts "AVGrid → av-grid" last, so nothing
needs to move.

**One thing it fixes for free.** Roadmap §3.5 lists `uikit/AVGrid/model/ContextMenuModel.tsx` →
`ui/dialogs/poppers/showPopupMenu` as a Rule 6 violation that "dies with AVGrid". Under this plan it
dies properly: the replacement context menu is built on `uikit/Menu`, so the app-layer import is
closed rather than merely relocated.

## Goals

- The state layer has no framework dependency: `zustand` is deleted and `TOneState` is a value, a
  listener array, and one React adapter that Epic F can remove without touching the class.
- A view can bind a piece of state to a DOM element declaratively, in one line, next to the element
  it maintains — and its subscriptions, listeners and child views are released when it is disposed,
  by construction rather than by discipline.
- A React parent can host a vanilla child, and a vanilla parent can host a React child, so any single
  component can be converted or reverted in isolation.
- The Storybook harness can exercise the vanilla-backed production entry point, which is how Epic C
  will verify converted components.
- The React-only lifecycle machinery has a written, framework-neutral replacement for every one of
  its uses, so a model can be made convertible without waiting for the view work.
- One real component is converted end to end, so the roadmap's abort criteria are evaluated against
  code rather than against a prediction.
- `main` is releasable after every task.

## Linked Tasks

| Task | Title | Status |
|------|-------|--------|
| [US-985](../tasks/US-985-drop-zustand/README.md) | Drop zustand from the state layer | Implemented |
| [US-986](../tasks/US-986-vanilla-view-lifecycle/README.md) | Vanilla view lifecycle and `bind()` | Implemented |
| [US-987](../tasks/US-987-structural-helpers/README.md) | Keyed-list and subtree-swap helpers | Implemented |
| [US-988](../tasks/US-988-model-driver/README.md) | Model driver — the non-React `useComponentModel` | Implemented |
| [US-989](../tasks/US-989-boundary-adapters/README.md) | `mountVanilla` / `mountReact` | Implemented |
| [US-990](../tasks/US-990-storybook-vanilla-render/README.md) | Storybook vanilla render path | Implemented |
| [US-994](../tasks/US-994-retire-side-by-side-preview/README.md) | Retire the Storybook side-by-side preview | Implemented |
| [US-991](../tasks/US-991-pathinput-pilot/README.md) | Pilot — one component converted end to end | Implemented |
| [US-992](../tasks/US-992-vanilla-view-authoring/README.md) | Authoring rules for vanilla views | Implemented |

There is deliberately **no update-batching task** — see B8.

### Ordering

**US-985 is first** and is a self-contained dependency removal with no behavioural change; it can
ship the day it is written, and it is independent of everything else in the epic.

**US-986 → US-987 → US-988 → US-989** is the primitive chain, in dependency order. US-990 depends on
US-989 (the harness consumes `mountVanilla`). **US-994 lands after US-990 and before US-991**: it
retires the paired preview, so the pilot is never written against a harness surface that is about to
be deleted. **US-991 depends on everything** and is what validates it. **US-992 is written last**,
from what the pilot actually taught rather than from what the primitives were intended to teach.

### Task notes

**US-985 — Drop zustand.** Replace `this.store = create<T>(...)` with a plain field, keep the
existing `listeners` array as the single notification path, and rebuild `use()` on React's
`useSyncExternalStore` with a `useRef`-cached selector snapshot compared by the existing
`compareSelection` (B1). Remove both `zustand` imports and the `zustand` dependency from
`package.json`. `get`, `set`, `update`, `clear` and `subscribe` keep their exact current semantics
including synchronous notification. No coalescing is added (B8). Note that `set()` currently
notifies through **two** paths — `this.store.setState()` (zustand's own subscribers, which is how
`use()` re-renders) and `this.stateChanged()` (the `listeners` array, which is how `subscribe()`
fires). After this task there is one path, and `use()` becomes a consumer of `listeners` like
everything else. The task also deletes the now-unused `use-sync-external-store` dependency (B1).

**US-986 — Vanilla view lifecycle and `bind()`.** A base class (B10) providing `mount` /
`update(props)` / `dispose`, an owned root element, and a disposal registry holding three kinds of
owned thing — state subscriptions, DOM listeners, and **child views** — so `dispose()` releases all
of them depth-first without the author writing a teardown method. `bind(selector, apply)` applies
immediately, subscribes with the selector, and registers the unsubscribe — note that
`IState.subscribe`'s selector overload captures its baseline at subscribe time and **does not fire
on registration**, so the immediate apply is a required part of the primitive rather than a
convenience. Children are registered explicitly by whoever constructs them, never discovered from
the DOM (B10). **Adoption of a view one did not construct is not supported** — there is one owner,
fixed at construction, and a view that needs to dispose something it did not create registers a
plain disposer in the same registry instead. That keeps ownership single and unambiguous; if a real
case appears in Epic C that this cannot express, it is a change to B10, not a workaround.

**US-987 — Structural helpers.** The two cases `bind` cannot express: a keyed list (create / update /
remove by key, preserving element identity for unchanged keys) and a subtree swap for conditionals.
They live beside the view base from US-986, inside `uikit/` — not `core/` — because they are view
machinery and Rule 6 permits `uikit/` to depend on `core/` but not the reverse.

`CellPool.ts` is a **reference for the idea, not the target**: it is a recycling pool for a
virtualized surface, and B15 means Persephone gets that behaviour by absorbing av-grid rather than by
generalizing it here. This helper is the ordinary case — build, update in place, remove — and it
does **not** grow into a virtualizer (B14).

The only in-epic consumer is the pilot's suggestion list (`suggestions.map(…)` keyed by `s.path`,
with a per-row element reference kept for the scroll-into-view path), so that is the acceptance
criterion: the list re-renders on every keystroke, unchanged keys keep their DOM node, and the row
references stay valid across an update.

**US-988 — Model driver.** The non-React replacement for `useComponentModel`: construct the model,
pump `setPropsInternal` on update, `_initInternal` on mount, `onUnmountInternal` on dispose, and set
`isFirstUse = false` after the first prop pump — that flag is read by `TreeProviderViewModel.ts:157`
and `:190`, `CategoryViewModel.ts:155` and `RenderGridModel.ts:207`, so a driver that omits it
changes behaviour in four models.

Per B13 the driver **introduces no new effect evaluation**, but note precisely what that means:
`setPropsInternal` itself calls `_evaluateEffects()` unconditionally (`model.ts:176`) and **that
call is not removed** — 57 React call sites depend on it. It is simply a no-op for a convertible
model, because such a model has zero registered effects. Do not strip it, and do not bypass
`setPropsInternal` to avoid it. Per B3 `ComponentQueue` is not touched.

**US-989 — The adapters.** The signatures are fixed here so no task has to guess them; roadmap §5's
`mountReact(el, node)` is ambiguous about which argument is which and is superseded by these:

```ts
// React parent hosts a vanilla child.
function mountVanilla<P>(ctor: VanillaViewCtor<P>, props: P): ReactElement;

// Vanilla parent hosts a React child. `host` is the DOM node to render into;
// `element` is the React element to render. Returns a disposer.
function mountReact(host: HTMLElement, element: ReactElement): () => void;
```

`mountVanilla` owns a host `<div>`, forwards prop changes to `update()`, and calls `dispose()` on
unmount. `mountReact` creates a React root in `host`, and its disposer is registered as a child of
the calling view so the B10 cascade reaches it.

**Disposal ordering is the specified hazard.** `root.unmount()` must run **before** the host element
is detached, and a React child may render *outside* the vanilla parent's root — `uikit/Popover`
portals into `getOverlayLayer()` (`Popover.tsx:165`), which is where the pilot puts its suggestion
list. A disposal that only removes its own root element leaves that popover mounted in the shared
overlay host. Neither adapter may leak a root or a subscription on rapid mount/unmount.

**StrictMode:** the renderer does not enable `React.StrictMode` today (`renderer.tsx` renders
`<RootComponent />` directly), so double-invocation cannot be checked by running the app. Either
wrap the Storybook preview in `StrictMode` for the duration of this task, or drop the criterion and
say so — do not leave it as an unverifiable acceptance item. This is where boundary bugs live, and roadmap §9 names them as an abort
criterion, so this task carries the epic's risk.

**US-990 — Storybook vanilla render path.** Historical prerequisite for the boundary: it added the
optional `Story.vanillaComponent` field and split `LivePreview` so `mountVanilla` could be exercised
before any production call site depended on it. **US-994 supersedes that preview surface** while
keeping the adapter and the preview-level error boundary.

**US-994 — Retire the Storybook side-by-side preview.** Remove `vanillaComponent` and the split pane
and return `LivePreview` to a single preview, keeping the `EditorErrorBoundary` US-990 added — it
matters more once a thrown error comes from a vanilla view's `mount()` rather than from React. See
B5's reversal note for why the paired pane cannot show a difference. Neither adapter changes;
`mountVanilla` simply waits for its real caller in US-991.

**US-991 — Pilot: `PathInput`** (B12). **This task also produces the epic's measured number**
(roadmap Rule 4, "if a phase cannot show what it bought, it does not close"): DOM writes per state
update, counted for one named interaction — a single ArrowDown through the suggestion list with the
popover open — on the converted vanilla implementation. A `MutationObserver` on the preview pane
in the Storybook harness is sufficient to count them; no production instrumentation is added.
The user explicitly chose to validate the converted implementation only: the obsolete React
implementation is not a supported Storybook path, and switching this live checkout back is not a
reliable verification method after the state-layer removal. Record the vanilla count and the exact
procedure in the epic's Notes.
Converted end to end behind an unchanged React-facing signature, verified in the harness through
the unchanged story. It begins with the B13 decomposition — the model's
four `effect()` calls retire into a new `applySuggestions()`, a new `setActiveIndex()` (with
`onRowMouseEnter` and both keydown branches rerouted through it) and `init()`. Neither method exists
today, and `suggestions` must stop being a `memo` for the first to be possible — see B13's fourth
row, which US-991 is responsible for resolving. That refactor ships on React before any view code is
written.

Two model changes fall out and should be expected rather than treated as findings: the two event
handlers widen from React synthetic types to native events, and the memo becomes an explicitly
written field whose recompute guard must be preserved. Anything *beyond* those two is a finding
worth recording, because the epic's premise is that models cross the boundary nearly untouched. It exercises every primitive in the epic, with
`mountReact` in the harder nested direction (vanilla parent, React `Input` and `Popover` children),
and converts the component's Emotion under Epic A's US-983 conventions on the way. The model and
`suggestions.ts` should need no changes; if either does, that is a finding worth recording, because
the epic's premise is that models cross the boundary untouched.

**US-992 — Authoring rules.** Update [`uikit/CLAUDE.md`](../../src/renderer/uikit/CLAUDE.md) and
[`model-view-pattern.md`](../standards/model-view-pattern.md) for vanilla views: the lifecycle
contract, `bind` versus direct DOM writes, the disposal discipline, the templating rule (B7), and
where the boundary adapters are used and where they are not. Written after the pilot so the rules
describe something that has been done once.

## Concerns / Open questions

All questions that change the shape of a task are now settled; Concerns 7–9 are acknowledged risks
and scoping notes carried for the record.

1. **Is update coalescing the default, or an explicit `batch(fn)` scope?** *(Resolved —
   **neither**. See B8 and B9.)* av-grid coalesces because it is a virtualized component
   repainting large numbers of cells; that optimization belongs to that workload, not to components
   in general. Rather than impose microtask delivery on 153 existing `subscribe()` call sites for no
   demonstrated benefit, the migration starts simple and adds the optimization only if a converted
   view shows a real problem. The virtualized components — the ones that genuinely have the
   pressure — get av-grid's already-optimized render engine instead of a batching primitive
   underneath a hand-written one (B9).

2. **A view base class, or plain classes plus free helpers?** *(Resolved — **base class**, with a
   parent→child ownership hierarchy. See B10.)* The base defines the lifecycle in one place so it
   can be enhanced in one place, and cascading disposal replaces the one guarantee React gives for
   free that nothing else in this migration replaces. av-grid's base-class-free `view/` folder
   stands as the counter-example to keep the base minimal, not as an argument against having one.

3. **Which component is the pilot?** *(Resolved — **`PathInput`**. See B12.)*

4. **Does the model driver reproduce "effects evaluate during render"?** *(Resolved — the question
   was wrong. **Neither**: the vanilla driver evaluates no effects. See B13.)* Both answers assumed
   `effect()` survives the migration. It does not — it is a React-shaped API with no counterpart in
   either reference implementation, and every one of its 65 call sites maps onto a lifecycle method
   `TComponentModel` already has.

5. **The 200-line guard rail needs a definition before it can bind.** *(Resolved — it does not
   bind. See B14.)* The number was an estimate in the roadmap, not a requirement, and it does not
   survive the measurements: av-grid's `Observable` is 170 lines on its own. The primitives are
   sized by what they need to do.

6. **This epic makes the app harder to debug before it makes it faster.** *(Resolved — **not an
   issue**, 2026-08-19.)* Roadmap §4 lists React DevTools as a real loss of iteration speed. It is
   not a loss here: **the user does not use React DevTools today**, so converted code giving them up
   costs nothing. §4's assessment stands in general and is simply inapplicable to this project.

   **Fast refresh — the other half of §4's first bullet — is not enabled either, and never has
   been.** `vite.renderer.config.ts` registers `editorTypesPlugin`, `vite-plugin-monaco-editor-esm`
   and `vite-plugin-electron-renderer`, and **no `@vitejs/plugin-react`**; neither
   `@vitejs/plugin-react` nor `react-refresh` appears in `package.json`. A renderer edit therefore
   already triggers a full page reload rather than a state-preserving component update, and
   `scripts/dev.mjs` restarts Electron for main/preload changes. Converting a component to vanilla
   changes nothing about that loop. **Roadmap §4's entire first bullet is inapplicable to this
   project.**

   **§4's second bullet — the correctness safety net — is untouched by this**; it was always the
   real cost, and it is answered by B10's cascading disposal, the US-990 boundary verification, and
   roadmap §9's abort criteria rather than by tooling.

7. **Absorbing av-grid is decided (B9); the landing details are Epic C's.** None of the following
   is Epic B's to answer, but each is recorded so the Epic C task is written against facts rather
   than against B15's summary.

   *(a)* **What comes in, and what is dropped.** *(Resolved — **only the two folders Persephone
   already has**. See B15.)*

   *(b)* **`RenderFlexGrid` has no av-grid counterpart and no decided fate.** `uikit/RenderGrid/`
   is "replaced by" av-grid's `render/`, but `RenderFlexGrid.tsx` (241 lines) exists only on the
   Persephone side and has three production consumers. Epic C must decide whether to port it by
   hand or migrate `LogBody`, `NotebookBody` and `NoteItemViewModel` off it. Recorded in B15's table.

   *(c)* **The absorbed code is ported onto Persephone's state primitive.** B15 drops
   `core/observable`, so the earlier worry about two primitives coexisting permanently does not
   arise: av-grid's `Observable`/`Model` are replaced by `TOneState`/`TComponentModel` as the code
   lands. One thing the port has to confirm rather than assume — av-grid's models were written
   against **microtask-coalesced** notification, and `TOneState` notifies **synchronously** (B8).
   The grid should be indifferent, because `RenderGrid` already coalesces at the paint level by
   painting on `requestAnimationFrame` and returning early when `calcRenderInfo` produces an
   identical object, so the notification cadence underneath it does not reach the DOM. That is the
   expectation; it is worth measuring during the port rather than trusting.

   *(d)* **av-grid's tests do not come with it, and that is fine.** *(Resolved — 2026-08-19.)*
   Persephone does not run unit tests, and absorbing av-grid does not change that: the 11,360 lines
   of `*.test.ts` are **excluded from the copy** rather than ported to a harness that does not
   exist. The project's bug-prevention spend goes into clear code, which is what B15's file-for-file
   correspondence and the drop list are for — less absorbed surface means less untested surface.
   Nothing further is proposed here.

8. **`uikit/RenderGrid/AsyncRef.ts` has a live bug.** Found while reading av-grid, but it is a
   Persephone defect on its own terms and stands whatever happens to B9: the constructor body sets
   `this.resolveAsync = undefined` *after* the `async` field initializer installed it, so the first
   `ref()` replaces the promise instead of resolving it, and anything that captured `async` early
   waits forever. **Fixed in US-993** (completed 2026-08-19) — standalone, unrelated to this epic
   and not blocked by it. The implementation was taken from av-grid's `core/AsyncRef.ts`.

   The reachable symptom is narrow but real. `RenderGridModel` reads `containerRef.async` and
   `renderInfo.async` inside `scrollTo`, `scrollToRow`, `scrollToCol`, `scrollBy` and
   `onRenderInfoChanged` (`RenderGridModel.ts:326`, `:495-547`). Each reads `this.async` at call
   time, so once the container has mounted the ref has already replaced the dead promise with a
   resolved one and everything works — which is why this has survived. The failure is confined to a
   scroll issued **before** the container mounts: that call takes the original, unresolvable promise
   and hangs forever, so the continuation that sets `scrollLeft`/`scrollTop` never runs and the
   promise stays pending for the life of the model. It reads as "the grid ignored my
   scroll-to-row", not as an error, which is the other reason it went unnoticed. The fix is to
   build the promise in the constructor body after `resolveAsync` is reset.

9. **Roadmap open decisions.** Only #2 (templating) and #6 (Storybook) touch this epic, and both were
   settled on 2026-08-18 before it opened, so nothing here is blocked. #1, #3 and #5 belong to Epics
   C, E and F and are untouched. This epic settles no roadmap-level decision of its own — its output
   is code, not a decision.

## Notes

### 2026-08-18

- Epic opened from the roadmap after EPIC-052 (Epic A) closed. IDs assigned: EPIC-053, tasks
  US-985 … US-992. The next free epic number is EPIC-054.
- Investigation found three of the roadmap's Epic B assumptions wrong in the direction of less work:
  `ComponentQueue`'s non-React path already exists, `immer` is a one-file dependency rather than
  five, and the 16 `useSyncExternalStore` call sites are not the state layer's React bridge —
  `TOneState.use()` reaches React through zustand, and rebuilding that is what US-985 actually is.
- `C:\projects\av-grid` was read as a design reference and settles the shape of US-985, US-986 and
  US-988 with a working implementation. It also supplies the counter-evidence behind Concern 2: it
  has ten view classes and no view base class.
- Per the epic deferred-review model, `/review`, `/document` and `/userdoc` run once at epic close,
  not per task.
- Concern 1 resolved by the user the same day: **no update coalescing** (B8). av-grid's microtask
  batching is an optimization for a virtualized surface, not a general need; the migration starts
  simple and revisits it only if a converted view shows a real problem. The batching task was
  removed and the remaining tasks renumbered to US-985 … US-992.
- **B9 added the same day, from user direction:** the virtualized components adopt av-grid's render
  engine rather than a hand-written one. Investigation found av-grid's `render/` folder is a vanilla
  port of Persephone's own `uikit/RenderGrid/` — same file names, ported "nearly line-for-line",
  `ReactNode` → `HTMLElement` — and that the engine is public API, not internal to the grid. The
  engine is therefore free; the per-consumer cost is converting cell renderers to DOM, which is Epic
  C and Epic E work. Epic B's obligation is only to *not* build a competing virtualization
  primitive.
- Reading av-grid also surfaced a live Persephone bug in `uikit/RenderGrid/AsyncRef.ts` (Concern 8),
  raised as standalone task **US-993**; the side-by-side reversal became **US-994**. The next free
task number is now US-995.
- **B9 revised the same day, on user direction:** av-grid's source is **copied into Persephone**
  rather than consumed as a dependency, so Persephone has full control over it. The av-grid
  repository is **not** frozen and is **not** regenerated from Persephone's code — it continues as a
  separate, deliberately light library for boards, because building it out of Persephone's tree
  would couple it to a UIKit that grows over time and every addition would land in a board's bundle
  uninvited. **Two copies of the same grid is the accepted outcome**, kept deliberately out of sync:
  after the copy lands the two repositories are unrelated projects, and Persephone tracks no task or
  epic on account of the other. This is the same boards-versus-renderer reasoning the roadmap
  already applies to markdown in §3.6. Roadmap open decision #5 is unaffected: av-grid is explicitly
  not an instance of "one source tree, two products". Nothing changes for boards.
- Concern 2 resolved by the user the same day: **a view base class** (B10), with views forming an
  ownership hierarchy so a parent disposes its children. The lifecycle is then defined and enhanced
  in one place, and cascading disposal replaces the one guarantee React currently gives for free.
  Children are registered explicitly rather than discovered from the DOM, and `mountReact` roots
  participate in the cascade.
- A context-style ancestor lookup over the new hierarchy was considered and **rejected** (B11):
  Epic P's US-972 deleted all five React context sites and the renderer now has zero `createContext`
  / `useContext` usages; ambient values are module singletons (`themeState`, `getOverlayLayer`) and
  scoped values are explicit parameters. A reopening condition is recorded rather than a
  door left ajar.
- Concern 3 resolved by the user the same day: **`PathInput` is the pilot** (B12). It exercises
  every primitive in the epic, and because Rule 1 forbids converting its `Input` and `Popover`
  children at the same time, it validates `mountReact` nested inside `mountVanilla` rather than only
  the easy direction. Its model is already React-free at runtime, so the pilot is a view rewrite —
  which is exactly the claim roadmap §2 makes about the codebase and has not yet been tested.
- Concern 4 dissolved rather than resolved (B13, 2026-08-19). The user rejected both offered
  orderings on the grounds that `effect()` should not survive React at all — confirmed against both
  reference implementations, neither of which has the concept. All 65 call sites map onto `init` /
  `setProps` + `oldProps` / the mutating method / the B10 disposal registry, every one of which
  already works under React, so models can shed their effects before conversion rather than during
  it. An adapter object to hold the React-only remainder was considered and rejected: there is no
  remainder to hold. The vanilla driver evaluates no effects, so the ordering question disappears.
- Concern 5 resolved by the user on 2026-08-19: **the roadmap's 200-line figure is an estimate, not
  a requirement** (B14). Nothing here is scoped or split on a line count. The anti-drift intent it
  stood for is kept as a design check — a primitive is added only when a real conversion demands it,
  with av-grid's base-class-free `view/` folder as the comparison and B11 as the worked example.
- Concern 6 dismissed by the user on 2026-08-19: **roadmap §4's first bullet does not apply to this
  project at all.** React DevTools are not used, and React Fast Refresh is not enabled either —
  verified: `vite.renderer.config.ts` registers no `@vitejs/plugin-react`, and neither that plugin
  nor `react-refresh` is a dependency. A renderer edit already causes a full reload today, so
  converting a component changes nothing about the dev loop. §4's second bullet (the correctness
  safety net) still stands and is answered by B10, the US-990 harness and the abort criteria, not by
  tooling.
- Concern 7(a) resolved by the user on 2026-08-19: **only the two folders Persephone already owns
  come in** — `uikit/RenderGrid/` and `uikit/AVGrid/` are replaced by their av-grid counterparts
  (engine, grid models, cell views, filter bar and filter popovers), and everything with a UIKit
  counterpart is dropped in favour of it: `Popover`, `Menu`, `Button`, `VirtualList` (→ `Select` /
  `MultiListBox`), `Observable`, `Subscription`, `csv`, `highlight` (B15). The correspondence
  between the two trees is close to file-for-file, so this is a swap rather than a merge. The
  trade-off is sequencing: a grid built on UIKit cannot land until UIKit is vanilla, so
  "AVGrid → av-grid" stays last in Epic C. It also closes the `ContextMenuModel` Rule 6 leak
  properly rather than relocating it.
- Concern 7(c) resolved by the user on 2026-08-19: **av-grid's `*.test.ts` files are excluded from
  the copy.** Persephone does not run unit tests and absorbing the grid does not change that; no
  harness is introduced.
- **Every question raised at epic open is now resolved.** Concern 8 is tracked as standalone US-993;
  Concern 9 records the roadmap decisions this epic deliberately does not touch.

### 2026-08-19 — independent verification pass

An agent with no context re-derived the document's claims against `src/` and `C:\projectsv-grid`
and found real defects. Corrected here:

- **B13's effect classification was wrong.** The original 42 mount-once / 49 props / 12 state came
  from greps that miscounted block-body deps factories. Re-parsed: **4 mount-once, 50 props, 17
  state (10 both), 4 neither**. The dominant shape is props, not mount-once, so the decomposition is
  a larger refactor than first stated — and a **fourth shape** (deps on a `memo` or on another
  model's state, 4 sites) has no replacement rule and is now flagged for US-991 to settle.
- **B13's worked example named methods that do not exist** (`setSuggestions`, `setActiveIndex`) and
  skipped the fact that `suggestions` is a `memo` with no setter. Rewritten against real code.
- **B1's premise was false**: `use-sync-external-store` is already a *direct* dependency
  (`package.json:87`) because `zustand/traditional` consumes zustand's optional peer at runtime;
  it is not independent unused cleanup. B1 restated on its merits; US-985 removes it together
  with zustand, while Excalidraw's nested zustand retains its transitive copy. The cited
  precedent (`useOptionalState`) does not demonstrate the cached-snapshot form `useSyncExternalStore`
  requires, and copying it would infinite-loop — now stated explicitly, along with the no-selector
  overload.
- **The side-by-side harness was unnecessary as specified.** Widening `component` to a union yields
  one pane, not two, and a separate `vanillaComponent` would render the same converted view. US-990
  briefly supplied that field and split pane; US-994 removed it after the user chose the single
  production-facing preview.
- **The epic's second measured number had no owner.** Assigned to US-991, with the interaction and
  counting method named.
- **"Ported nearly line-for-line" was over-scoped.** It applies to `renderInfo`/`rerender-check`
  only; `RenderGrid.ts` calls itself a rewrite and `RenderGridModel` has a *different public API*
  (`setOptions`/`attach`/`disposed`), so ~15 consumers need host-wiring changes, not just DOM cell
  renderers. B9 and B15 corrected.
- **B15's mapping omitted four files**, including `RenderFlexGrid.tsx` — 241 lines with three
  consumers and no av-grid counterpart, which "replace the folder" would have deleted. Added, with
  its fate flagged as Concern 7(b). Also corrected: `VirtualList` has three consumers not two, and
  the `Popover`/`Menu` drop requires rewriting nine and seven of the *imported* files respectively.
- **B12 overstated `PathInputModel` as React-free.** It has three React type usages, two of them
  event-handler signatures that must widen to native events.
- Smaller corrections: 39 stories not 38; 319 `.use()` sites not ~255; six av-grid view classes plus
  factory functions, not "ten classes"; `.tsx` totals labelled; epic Status set to Active to match
  the dashboard; B6 scoped to "before the pilot"; `US-988` told not to strip `setPropsInternal`'s
  `_evaluateEffects()` call and to set `isFirstUse`.
- Gaps closed: adapter signatures fixed (`mountVanilla(ctor, props)` / `mountReact(host, element)`)
  with the unmount-before-detach ordering and the portal case named; `Views`/dialog host declared
  out of scope (B3a); child *adoption* decided against; US-987 given a location, a scope limit and
  an acceptance criterion; StrictMode noted as not enabled, with two options.

**One item is deliberately left open and assigned:** B13's fourth effect shape — what replaces a
`memo`-dependent effect. US-991 resolves it against `PathInput` and the answer becomes the rule for
Epic C.

The epic is ready for task documents to be written.

### 2026-08-19 — closeout verification

- `npm run typecheck`, `npm run lint`, and `git diff --cached --check` pass after the final review
  fixes. The PathInput bridge now disposes its nested React root before the model driver, keyed-list
  reconciliation has no new non-null assertions, and the pilot stylesheet supplies fallbacks for
  every token variable.
- The PathInput Storybook smoke pass confirmed the vertical suggestion list, controlled value
  updates, keyboard and mouse selection, focus/blur behavior, nested Popover disposal, and no
  synchronous nested-root warning. Native root event listeners adapt events to the unchanged
  React-facing prop contract.
- The user decided that a pre-conversion comparison is not required: the converted component is the
  supported Storybook implementation and there is no separate React implementation to compare.
  With the popover open and the observer reset immediately before one `ArrowDown`, the active
  Storybook PathInput produced **3 mutation records**. Observer options were
  `{ subtree: true, childList: true, attributes: true, characterData: true }`, observing the
  `[data-type="live-preview"]` pane; initial popover-opening mutations were excluded by resetting
  the counter after the popover opened. The records were the root `data-state` update and two
  input `name` attribute updates. No production instrumentation was added.

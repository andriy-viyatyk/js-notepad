# Roadmap: De-React

**Status:** Proposed — not scheduled
**Created:** 2026-08-16

Replace React with direct DOM manipulation across the renderer, the way VSCode is built, without
a flag day. This document is a **roadmap**, not a task: it sizes the work, fixes the ground rules,
and splits it into epics that can each be scheduled, paused or abandoned independently.

The trigger is [`C:\projects\av-grid`](file:///C:/projects/av-grid) — a dependency-free
reimplementation of the AVGrid UIKit component that renders straight to the DOM and measurably
outperforms the React original. It is the existence proof that the rest of this document builds on.

---

## 1. The thesis

React is not paying for itself here. The parts of it we rely on — component composition and
declarative rendering — we can reproduce; the parts that cost us — reconciliation on every state
change, and a rendering model that cannot express "repaint exactly these two cells" — are the
ones that show up as sluggishness in the heaviest views.

The claim is narrow and testable: **for our workloads, a hand-written DOM update path is faster
and the migration is affordable because the hard half is already done.**

## 2. Why this codebase can absorb it

Two properties make this a fraction of the usual cost:

**State is already framework-independent.** `TOneState` / `TGlobalState` / `TComponentState` /
`TModel` are ours. React observes them through **16 `useSyncExternalStore` call sites** — that is
the entire bridge. In a typical React app the state layer *is* React and must be rebuilt from
nothing; here it does not move at all.

**Model-View is already enforced.** 127 files use the model pattern and only **65 of 348 `.tsx`
files hold local `useState`**. Most views are pure projections of a model, so there is no logic
hiding in a render function that has to be excavated first.

### The surface, measured

| Area | `.tsx` files | Lines | Notes |
|------|-------------:|------:|-------|
| `editors/` | 181 | 28,203 | The long tail — lazily imported, independently convertible |
| `uikit/` | 101 | 14,671 | 44 components; the foundation everything else sits on |
| `ui/` (shell) | 36 | 5,738 | Tabs, sidebar, dialogs, MainPage |
| `components/` | 21 | 3,478 | Icons, page-manager, file-search, tree-provider |
| `theme/` | 4 | 2,441 | Mostly icon SVG components |
| **Total** | **348** | **55,346** | Against 88,065 lines of `.ts` that are already React-free |

### Third-party coupling

| Dependency | Replacement | Cost |
|---|---|---|
| `@monaco-editor/react` | `monaco.editor.create` directly | Trivial — the wrapper is lifecycle only |
| `@floating-ui/react` | `@floating-ui/dom` | Same library, vanilla core |
| `react-tooltip` | our own `uikit/Tooltip` | Small |
| `zustand` (1 file) | A value plus the listener array `TOneState` already keeps | Small — the dependency is deleted, not replaced (§3.3) |
| Emotion (85 files) | CSS custom properties + static CSS | Medium, mechanical |
| `react-markdown` | `markdown-it` + our own block renderers | **The one real port** |

`react-markdown` is the only entry with no cheap swap. It backs the markdown preview, the notebook
note editor and the MCP inspector, all through custom component overrides. Its replacement must be
decided before Phase 3 starts, not discovered during it.

## 3. What we keep

Two ideas are worth preserving explicitly, because they are the reason the estimate above is
credible: **model/view separation** and **state-driven view updates**. Neither is a React feature
we would be reimplementing — both are already ours, and React is only one of two possible
consumers of them.

### 3.1 Model/View separation

The split is the one familiar from Delphi and Windows Forms: one unit builds the controls and
wires their events to model methods, another unit holds the logic. `TComponentModel` in
[`core/state/model.ts`](../src/renderer/core/state/model.ts) already implements the model half
**without touching React**:

```ts
effect(callback, depsFactory)   // own useEffect equivalent
memo(computeFn, depsFactory)    // own useMemo equivalent
_evaluateEffects()              // own effect reconciliation
setPropsInternal(props) / _initInternal() / onUnmountInternal()
```

`useComponentModel` is a twelve-line adapter that pumps that machine from React. In the vanilla
world it becomes `view.update(props)` / `view.mount()` / `view.dispose()` and **the model layer
does not change**. The same holds for the `Views` registry in
[`core/state/view.tsx`](../src/renderer/core/state/view.tsx): a `viewId → view` map with the model
passed in; the vanilla version registers a class and returns a DOM node instead of a
`ReactElement`.

The migration moves *towards* this paradigm rather than away from it. A vanilla view is a class
that builds its DOM once and keeps named fields for the elements it later updates — which restores
something JSX cannot express: **stable control identity**. `this.okButton` exists for the lifetime
of the view. Under React the node is re-derived on every render and reachable only through a ref.
That identity is exactly what lets av-grid repaint two cells while a focused editor and a running
transition survive untouched.

### 3.2 Reactivity — state-driven view updates

The requirement is that DOM writes are not scattered through business logic: logic changes state,
and a separate declarative binding turns that change into a DOM update. `IState<T>` already
provides the primitive:

```ts
subscribe: {
    (listener: () => void): () => void;
    <R>(listener: (value: R) => void, selector: (state: T) => R): () => void;
};
```

The selector overload compares structurally (`compareSelection`) and fires only on real change.
`useOptionalState` already uses it; React reaches the same state through `use()`, which is one
method out of six. A vanilla view binds instead:

```ts
this.bind(s => s.title, title => { this.titleEl.textContent = title; });
```

Declared once in the view constructor, next to the element it maintains. Business logic only calls
`state.update(...)` and never touches the DOM. This is classic data binding — the model is the
same one Delphi and WPF used — and it is the mechanism that keeps DOM mutation out of logic
methods.

**What React does that we must write ourselves.** Four gaps, all bounded, all belonging to Epic B:

| Gap | Resolution |
|---|---|
| Lists and conditionals | A keyed-list helper (create / update / remove by key) and a swap-subtree helper. av-grid's element pooling is the high-performance form of the same idea. |
| Batching | `set()` fires listeners synchronously, so three consecutive `update()` calls cause three DOM passes. Needs a microtask coalescer. |
| Derived state | Already solved — `TComponentModel.memo()` is framework-agnostic; keep as is. |
| Imperative view commands | Already solved — `ComponentQueue` is the model→view command channel for things that are not state (scroll-to-row, focus). Only its React hook goes. |

Together that is on the order of 200 lines. **If it grows much past that, stop** — the failure mode
of this phase is accidentally writing a worse React.

### 3.3 The state layer sheds a dependency

[`core/state/state.ts`](../src/renderer/core/state/state.ts) imports `create` from `zustand` — the
React entry point — while maintaining **its own `listeners` array** anyway. zustand supplies only
`getState` / `setState` and the `use()` hook, and it is imported in **exactly one file in the
codebase**. Its core is a value plus a listener array notified on write, which `TOneState` already
half-implements.

So the store becomes a plain field and **`zustand` is deleted**, rather than swapped for
`zustand/vanilla`. `immer`'s `produce` stays — it is framework-agnostic and used in five files.

This is worth doing early: it is small, it is testable in isolation, and it removes the last
React-coupled import from the state layer before any view work begins.

## 4. What we give up

Stated plainly, so the decision is made with eyes open:

- **React DevTools and fast-refresh** for converted code. VSCode lives without them; it is still a
  real loss of iteration speed.
- **The correctness safety net.** React's "recompute everything, diff it" becomes "know exactly
  what changed and touch only that". Every converted component is a new opportunity for stale DOM,
  a forgotten unsubscribe or a leaked listener. This — not the translation — is the actual work.
- **Ecosystem access.** Any future React component is off the table once the shell flips.

The mitigation for the second point is that we have done it once already, deliberately and with
measurements, in av-grid. Its dirty-set discipline is the pattern the rest of the migration copies.

## 5. The enabling idea: a two-way boundary

Everything below depends on React and vanilla coexisting **indefinitely**, in either nesting
direction, so that no phase is ever all-or-nothing. Two adapters make that true:

- `mountVanilla(...)` — a React component that owns a host `<div>` and hands the node to a vanilla
  view. Converts **leaves** while parents stay React.
- `mountReact(el, node)` — a vanilla view that creates a React root inside a DOM node. Converts
  **containers** while leaves stay React.

With both, any single component can be converted or reverted in isolation, and the migration can
stop permanently at any phase boundary with a coherent app.

## 6. Rules of engagement

These hold for every epic below.

1. **Never convert a component and its parent in the same change.** One side of every boundary
   stays fixed.
2. **Preserve the React-facing prop signature during a swap.** Change the API only after the last
   React caller is gone. This is what keeps 348 call sites compiling untouched.
3. **Every phase ships.** `main` is releasable after every task, never only at the end of an epic.
4. **One measured number per epic.** Same discipline as av-grid: if a phase cannot show what it
   bought, it does not close.
5. **No new React.** From the day Epic A opens, new UIKit components are written vanilla-first with
   a React wrapper — not the reverse.

## 7. The epics

Seven epics, roughly in dependency order. IDs are assigned when each epic doc is created; the next
free number today is **EPIC-051**.

### Epic P — Preparation (React-side)

The only epic that writes **no vanilla code at all**. Every task in it is a normal React refactor
that leaves the app on React, is verifiable the same day, and shrinks the surface every later epic
has to convert. It can start immediately at zero risk, and — the point worth holding on to —
**every item here is an improvement on its own terms**, so if the migration is never scheduled
past this epic, nothing was wasted.

Ordered by how much they unblock:

**1. Replace `ReactNode` props with framework-neutral slots.** The most valuable item, and the one
that must be finished before Epic C. 109 files declare `ReactNode`/`ReactElement` props — **47 of
them in `uikit/`**: `icon?: ReactNode`, `label: ReactNode`, `emptyMessage?`, `title?`, `trailing?`,
`startSlot` / `endSlot`, `separatorContent`, `rootLabel`. Rule 2 ("preserve the React-facing
signature") cannot save these, because the signature *is* React. Each becomes either a data
descriptor (icon name + props) or a neutral slot callback that React can satisfy today and a
vanilla view can satisfy tomorrow.

**2. Lift local `useState` into models.** 112 occurrences across 65 `.tsx` files. State living in a
view is exactly what cannot cross the boundary; moving it into `TComponentState` now turns each
later conversion into a pure rendering translation. Worst offenders first:
`graph/GraphDetailPanel.tsx` (11), `notebook/ExpandedNoteView.tsx` (5), `graph/GraphBody.tsx` (5),
then a long tail of 2–3 each.

**3. Convert `useImperativeHandle` / `forwardRef` to model methods.** 9 files expose imperative
handles (`AVGrid`, `Tree`, `ListBox`, `RenderGrid`, `Textarea`, `ImageViewport`, `FileList`,
`LinksList`, `MarkdownBlock`); 33 use `forwardRef`. An imperative handle is already a model method
written in the wrong place — the caller wants to command the view. Moved onto the model or onto
`ComponentQueue`, it survives the migration untouched.

**4. Replace React context with explicit model references.** Five sites:
`EditorConfigContext`, `LogViewContext`, `AVGrid/filters/useFilters`, `AVGrid/useAVGridContext`,
`uikit/shared/highlight`. Context has no vanilla equivalent; each becomes a model passed down or
resolved from the editor. Small, but each one blocks whichever component depends on it.

**5. Route `createPortal` through one portal host.** 10 files, including `uikit/Popover`,
`uikit/Tooltip`, `page-manager` (4 each) and `GraphTooltip`. The vanilla equivalent is an
`appendChild` to a layer element — trivial, but the call sites need a shared helper *first* so both
worlds target the same layer. Introduce it and adopt it while still on React.

**6. Move logic out of `useEffect` into `TComponentModel.effect()`.** 198 `useEffect` call sites.
`effect(callback, depsFactory)` already exists and is React-free, so this is a same-day move with
no behavioural change. Judgement required: effects doing DOM measurement legitimately belong to the
view and should stay.

**7. Inventory Emotion usage.** Split the 85 Emotion files into "static style object" (mechanical
to convert) and "dynamic, prop-driven" (needs open decision #4). Cheap to produce and it de-risks
Epic A's estimate before Epic A is scheduled.

**Explicitly not prep work:** the 422 `useCallback` and 118 `useMemo` call sites. They exist only to
tame reconciliation and simply disappear during conversion — no one should schedule a task for
them. Likewise `data-name` coverage is already an established contract
([ui-element-contract.md](architecture/ui-element-contract.md)) and needs no new work; it is a
ready-made way to assert that a converted view produces an equivalent DOM, drivable from the
`browser_*` tools.

### Epic A — Style and token foundation

Emit `theme/color.ts` and `uikit/tokens.ts` as CSS custom properties on `:root`, per theme,
alongside the existing object exports. Vanilla views style with plain CSS; React keeps importing
`color.*` unchanged. Nothing in the app changes behaviour.

Candidate tasks: CSS-variable emission for all 10 themes · token pass-through in `GlobalStyles` ·
theme-switch path without a React re-render · Emotion-to-CSS conventions in `coding-style.md`.

**Blocks everything else.** Small, low-risk, no user-visible change.

### Epic B — The reactive foundation and the boundary

The largest design epic and the one that decides whether the rest is pleasant or miserable. It
delivers the vanilla half of §3: the view base class, the binding primitive, and the adapters that
let the two worlds nest in either direction.

Candidate tasks:

- **Drop zustand** — replace the store inside `TOneState` with a plain value plus the listener
  array it already maintains; delete the dependency. Keep `immer`. (§3.3)
- **Vanilla view base class** — `mount` / `update(props)` / `dispose`, an owned root element, and
  a disposal registry for subscriptions and listeners.
- **`bind(selector, apply)`** — apply immediately, subscribe with the selector, register the
  unsubscribe. The single primitive the whole reactivity story rests on. (§3.2)
- **Keyed-list and swap-subtree helpers** — the two structural cases `bind` cannot express.
- **Update batching** — microtask coalescer so consecutive `state.update()` calls produce one DOM
  pass.
- **Model driver** — the non-React replacement for `useComponentModel`, pumping
  `setPropsInternal` / `_initInternal` / `onUnmountInternal`; `ComponentQueue` gains a plain
  `subscribe` path in place of its hook.
- **`mountVanilla` / `mountReact`** — the two-way adapter pair.
- **Pilot** — one real component converted end to end to validate the contract before Epic C
  scales it to 44.
- **Authoring rules** — update `uikit/CLAUDE.md` and `model-view-pattern.md` for vanilla views.

Guard rail: the primitives above should land in roughly 200 lines. Substantially more means the
epic is drifting into building a framework instead of a binding layer.

### Epic C — UIKit conversion

The 44 components in `uikit/`, converted leaf-first behind identical React-facing signatures.
Drop in av-grid for AVGrid. Move Popover / Menu / Tooltip to `@floating-ui/dom` and delete
`react-tooltip`.

Candidate tasks, roughly in order: primitives (Button, IconButton, Label, Text, Icon, Divider,
Spacer, Dot, Tag) · inputs (Input, Textarea, Checkbox, RadioGroup, Select, MultiSelect,
Autocomplete, DateInput, PathInput, TagsInput, Slider) · floating layer (Popover, Menu, Tooltip,
Dialog, Notification) · containers (Panel, Toolbar, Splitter, CollapsiblePanelStack,
SegmentedControl, Breadcrumb) · data views (ListBox, MultiListBox, Tree, RenderGrid,
SelectableRow, CategoryList, Minimap, ImageViewport) · **AVGrid → av-grid**.

**This is the epic that pays.** 14,671 lines, and nearly all the perceived speed lives here.
If the migration stops after Epic C, it was still worth doing.

### Epic D — Shell and shared components

`ui/` (tabs, sidebar, dialogs, MainPage) and `components/`. Flip the application root to vanilla;
from here React survives only inside unconverted editors, via `mountReact`.

Candidate tasks: icon set from `.tsx` components to a sprite or inline-SVG helper · page/tab host ·
sidebar and menu bar · dialog host · secondary-views host · root flip.

Depends on Epic C being effectively complete.

### Epic E — Editors

28,203 lines across 181 files, but already lazily imported and already model/view split — the
ideal migration unit. One editor per task, in whatever order suits other work. Open-ended by
design: this epic may stay active for a long time and that is acceptable.

Suggested order: a small one first to establish the pattern (mermaid, image, video), then a large
one to prove it scales (graph — 3,001 lines, or notebook — 1,949), then by whatever is being
touched anyway. The `react-markdown` replacement must land before markdown, notebook and
mcp-inspector.

Largest first: graph 3,001 · link-editor 2,860 · notebook 1,949 · rest-client 1,917 · browser
1,700 · log-view 1,693 · mcp-inspector 1,637 · git-tree 1,425.

### Epic F — Removal

Delete `react-dom`, then `react`, `@types/react*`, `@emotion/*`, `@monaco-editor/react`,
`react-markdown`, `react-tooltip`, `eslint-plugin-react-hooks`. Strip the adapters. Update
`CLAUDE.md`, `component-guide.md`, `model-view-pattern.md`, `uikit-vs-components-split.md`.

Only reachable if Epic E finishes. Not a goal in itself.

## 8. Open decisions

Each of these changes the shape of an epic and should be settled before that epic opens.

| # | Question | Blocks |
|---|---|---|
| 1 | What replaces `react-markdown`? `markdown-it` with custom renderers is the default assumption. | Epic E |
| 2 | Templating: `innerHTML` from template strings, or explicit `document.createElement`? av-grid's answer should carry. | Epic B |
| 2a | *Settled:* model/view split and state-driven binding are preserved, built on the existing `TComponentModel` and `IState.subscribe`. See §3. | — |
| 3 | Do converted UIKit components keep a React wrapper permanently (making UIKit publishable to React consumers, like av-grid), or is the wrapper scaffolding to be deleted in Epic F? | Epic C, Epic F |
| 4 | Emotion's dynamic prop-driven styling — CSS variables set via `style`, or generated class hooks? | Epic A |
| 5 | Does UIKit become a separate package alongside av-grid, or stay in-tree? | Epic C |
| 6 | Storybook editor (`editors/storybook/`) — does it become the conversion harness? | Epic B |

## 9. Abort criteria

The roadmap is a bet, and it should be cheap to fold. Stop and reassess if:

- Epic C's measured gain on a representative view is under ~2× on interaction cost. The premise
  was speed; without it the churn is unjustified.
- Boundary bugs (stale DOM, leaks) outnumber the components converted in any single task.
- The React-facing-signature rule has to be broken repeatedly to make a conversion work — that
  means the abstraction is wrong and the "no flag day" property is being lost.

Folding is always available: every epic boundary leaves a coherent, shippable app, and Epics P, A
and B are useful on their own even if nothing after them is ever scheduled. Epic P in particular
is a pure win — neutral component APIs, state in models and no imperative handles are all things
this codebase should have regardless of which rendering library it uses. Scheduling
Epic P is therefore **not** a commitment to the rest of the roadmap; it is the cheapest way to buy
the option.

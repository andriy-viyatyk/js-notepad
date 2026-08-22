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
| `@floating-ui/react` | `@floating-ui/dom` | Same library, vanilla core. **Not retired inside Epic C** — C1 moved `Tooltip`, C2 empties `uikit/`, and two app-layer importers (`editors/browser/BrowserTabsPanel.tsx`, `ui/dialogs/poppers/showPopupMenu.tsx`) survive into Epics E and D |
| `react-tooltip` | our own `uikit/Tooltip` | **Done — uninstalled in C1.** It had zero importers; it was an uninstall, not a migration |
| `zustand` (1 file) | A value plus the listener array `TOneState` already keeps | Small — the dependency is deleted, not replaced (§3.3) |
| Emotion (85 files) | CSS custom properties + static CSS | Medium, mechanical. **58 production importers as of C2 open** — `uikit` 35, `components` 11, `ui` 10, `theme` 1, `editors` 0 |
| `react-markdown` | Its own `remark`/`rehype` stack, minus the React step | Small — see §3.6 |

`react-markdown` looked like the only entry with no cheap swap: it backs the markdown preview, the
notebook note editor and the MCP inspector, all through custom component overrides. Investigation
(open decision #1, settled 2026-08-18) found it is a thin React binding over a parsing stack that is
already framework-free, so the parser is kept and only its final `hast → React` step is replaced.
The remaining work is the five node overrides. See §3.6.

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

Together that was estimated at on the order of 200 lines. **The estimate was retired when Epic B
opened** (EPIC-053 B14); what stands is the concern behind it — the failure mode of this phase is
accidentally writing a worse React, and the check is whether a primitive is demanded by a real
conversion, not what it costs in lines.

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

### 3.4 Templating — how a view builds its DOM

*Open decision #2, settled 2026-08-18.*

**Structure is built with `document.createElement`. `innerHTML` is used only for static markup the
code owns — inline SVG icons, fixed skeletons — and never with interpolated runtime data.**

This is not a preference; it is what both reference implementations already do.

**av-grid.** `view/HeaderCell.ts` is the pattern: a `build(el)` function creates each child with
`createElement`, assigns `className` / `type` / `tabIndex` / `data-*` directly, appends them in one
`el.append(...)`, and stores the four elements in a `HeaderParts` record. Later paints reach those
elements by name and never re-query the DOM. `innerHTML` appears only as `filter.innerHTML =
filterIcon` — a module-level SVG constant. Text goes through `cellDom.ts`'s `setText`, which writes
`nodeValue` on the existing text node rather than `textContent`, because `textContent` discards the
node and allocates a fresh one on every paint. Even style writes are read-before-write guarded.

The one place av-grid puts content into `innerHTML` is `DataCell.ts`, for markdown already rendered
by `marked`, and it is guarded by `if (el.innerHTML !== rendered)` so the parser does not re-run when
nothing changed. That is a deliberate rich-content renderer, not the general case.

**VSCode.** `vs/base/browser/dom.ts` provides `$('div.some-class', attrs, ...children)`, which is a
thin builder over `createElement`. Its list rows use `renderTemplate(container)` to build the DOM
once and return a template object holding element references, then `renderElement(item, index,
template)` to update them — the same "build once, keep named references, update in place" shape.
VSCode additionally enforces Trusted Types, so an `innerHTML` assignment must pass through an
explicit policy; the default is that runtime data cannot reach the HTML parser at all.

**Why this matters more here than in a browser app.** Persephone's renderer runs with
`nodeIntegration: true` and `contextIsolation: false`, and there is no CSP, no Trusted Types policy
and no sanitizer dependency in the renderer today (the only CSP in the codebase is the one served to
board frames). The app displays untrusted text constantly — file names, HTTP response bodies,
archive entry names, git refs, page titles, markdown. Interpolating any of it into `innerHTML` is not
a defacement risk in this process model; it is arbitrary code execution. `createElement` plus
`textContent` / `nodeValue` is immune by construction, which settles the question independently of
ergonomics or speed.

**The verbosity objection has a bounded answer.** VSCode's whole solution is one `$()` helper;
av-grid does not even have that and writes the calls out. Epic B may add a small `el(tag, props,
...children)` helper if the call sites justify it — but it stays a helper over `createElement`, and
it does not accept a markup string. Like every other primitive, it is added only if the call sites
demand it (EPIC-053 B14).

**Available but not the default:** a `<template>` element parsed once and `cloneNode(true)` per
instance is legitimate for a large repeated structure, since it parses static markup once and clones
cheaply. It costs the named-reference clarity — the clone has to be walked or queried to find its
parts — so reach for it only where a measurement says the structure is worth it. av-grid needed it
nowhere.

### 3.5 Keeping UIKit extraction-ready

*Open decision #5, settled 2026-08-18: UIKit stays in-tree, but the folder boundary is treated as a
future package boundary.*

The intent is that one source tree eventually produces two products — Persephone, and one or more
libraries that boards can vendor the way they already vendor av-grid. That extraction is **not**
scheduled and is not part of this migration; the only commitment here is to stop it becoming
impossible.

**The distance is already short.** Measured across the 157 non-story files in `uikit/`, everything
it reaches for outside itself is:

| Target | Imports | Files | Extractable? |
|---|---:|---:|---|
| `theme/color` | 41 | 41 | Yes — after Epic A this file is only `var(--color-*)` strings with no imports of its own |
| `core/state` | 30 | 28 | Yes — the state primitives are already framework-free (§3.1) |
| `core/traits` | 14 | 12 | Yes |
| `core/utils` | 12 | 9 | Yes |
| `theme/icons` + `theme/icon-registry` | 15 | 13 | Yes — Epic P's registry (D2) is a name→renderer map |
| `api/*`, `ui/*`, `shared/*` | **5** | **5** | **No — these are the real leaks** |

So the natural package split is the one already implied by the imports: a **core** package (state,
traits, utils, the color-variable references) and a **uikit** package on top of it, beside the
existing av-grid. Nothing needs to be invented to get there.

**The five leaks, in full:**

| File | Imports | Note |
|---|---|---|
| `uikit/AVGrid/model/ContextMenuModel.tsx` | `ui/dialogs/poppers/showPopupMenu` | Dies with AVGrid — av-grid replaces it |
| `uikit/ListBox/ListBoxModel.ts` | `api/events/events` (`ContextMenuEvent`) | Real |
| `uikit/Tree/TreeModel.ts` | `api/events/events` (`ContextMenuEvent`) | Real |
| `uikit/Menu/types.ts` | `api/types/events` (`MenuItem`) | Real — a re-export of an app type |
| `uikit/RenderGrid/RenderFlexGrid.tsx` | `shared/utils` | Real |

Four files were closed during C1–C3; once AVGrid is gone, no `uikit/` → app-layer leak remains.

**Status at C3 close (2026-08-22): closed, except AVGrid's.** `ListBoxModel` and `TreeModel` now read
`core/events/context-menu`, `Menu/types` no longer re-exports an app type, and `RenderFlexGrid`
imports `core/utils/*` rather than `shared/utils`. The only remaining violation is
`uikit/AVGrid/model/ContextMenuModel.tsx`, which dies with AVGrid in C4 — so it stays as the single
documented exemption in the lint zone (`eslint.config.mjs`).

**The standing rule that keeps it that way** is Rule 6 in §6.

**Theming is the other half of extraction, and Epic A already delivers it.** av-grid is themable
inside a board with no JavaScript at all: every `--avg-*` token falls back to its `--p-*`
counterpart, so a theme switch re-tints it with zero repaints and nothing to re-apply. A UIKit
library has to work the same way, which means its styling must be CSS custom properties end to end —
exactly what open decision #4 settled. Epic A is therefore not only the token foundation for vanilla
views; it is the precondition for UIKit ever leaving the tree.

### 3.6 Markdown — the port that mostly isn't one

*Open decision #1, settled 2026-08-18.*

§2 called `react-markdown` "the one real port". On inspection that is wrong, and in a useful
direction: **`react-markdown` is a thin React binding over a parsing stack that is already
framework-free.** It is `remark-parse` → `remark-gfm` → `mdast-util-to-hast` → `hast-util-raw` →
**`hast-util-to-jsx-runtime`**. Only the last step is React. Every one of those packages is already
in `node_modules` as a transitive dependency.

**The decision: keep the whole stack and replace only the final step with a `hast → DOM` renderer**
(`hast-util-to-dom` is the ecosystem's own version of it, same authors, same tree shape). Everything
upstream is untouched.

What that buys, concretely:

- **Both custom plugins keep working, unmodified.** `rehypeHeadingIds.ts` (slugged heading ids, so
  `#fragment` links resolve) and `rehypeHighlight.ts` (wraps search matches in `.highlighted-text`)
  are plain unified plugins operating on hast, and neither imports React. Verified.
- **`remark-gfm` and `rehype-raw` keep working, unmodified.** Tables, task lists, strikethrough, and
  raw embedded HTML all behave exactly as today — no re-testing of markdown semantics.
- **The output tree is identical**, so `MarkdownBlock.css` and the `.markdown-block` scoping survive
  as they are.

The work is then the five node overrides in `getComponents()` — `code` (Monaco-colorized
`CodeBlock`), `pre` (mermaid SVG), `input` (checkbox → icon), `a` (link resolution), `img`
(`MarkdownImage`) — which become "when the walker reaches this hast node, build this DOM instead".
Two of them (`code`, `pre`) are substantial because they mount real interactive views, but they are
being rewritten in Epic E anyway; the other three are near-trivial. Six call sites consume
`MarkdownBlock` (`MarkdownBody`, `MarkdownOutputView`, `McpInspectorView`, `ResourceContentView`,
`MnemeRootEditorView`, plus the re-export), and its props stay as they are.

**Why not `marked`, which the boards catalog recommends?** Because boards and the renderer have
opposite constraints, and the same choice is right in one and wrong in the other:

| | Boards | Persephone renderer |
|---|---|---|
| Delivery | Vendored UMD from a CDN, CSP-sandboxed frame | Bundled, `nodeIntegration: true`, no CSP, no sanitizer |
| Content | Authored by the board's own agent | Arbitrary untrusted files, HTTP bodies, wiki pages |
| Output needed | An HTML string into `innerHTML` | A DOM tree with mounted interactive views |

`marked` (and `markdown-it` in its default mode) emits an HTML **string**. Putting that string into
`innerHTML` is exactly what open decision #2 forbids, and markdown here is untrusted input, so it
would be an XSS→RCE path in this process model rather than a defacement risk — `marked` dropped its
own sanitizer in v5 and points users at DOMPurify, which would be a new dependency purchased to
re-solve a problem the current stack does not have. Node-level overrides that mount a Monaco block
or a mermaid SVG also do not survive string rendering; they would need placeholder elements and a
DOM post-pass. `marked` remains the right recommendation for boards and nothing about that changes.

**The one thing to confirm when the task is written:** the exact per-node override seam in the
`hast → DOM` walker (a hook, or a hand-written walk of ~100 lines). Either is acceptable; the
overrides are the task's real content and the walker is not where the risk lives.

**Sequencing.** This lands before the markdown, notebook and mcp-inspector editors in Epic E, and it
is the one Epic E item worth doing early, since three editors block on it.

## 4. What we give up

Stated plainly, so the decision is made with eyes open:

- ~~**React DevTools and fast-refresh** for converted code.~~ *Assessed at Epic B open (EPIC-053,
  Concern 6) and found **not to apply to this project**. React DevTools are not used. React Fast
  Refresh is not enabled and never has been — `vite.renderer.config.ts` registers no
  `@vitejs/plugin-react`, and neither that plugin nor `react-refresh` is a dependency, so a renderer
  edit already triggers a full reload (and `scripts/dev.mjs` restarts Electron for main/preload
  changes). Converting a component to vanilla costs nothing in either respect.*
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
6. **`uikit/` imports nothing above itself.** It may import `core/` and `theme/color`; it may not
   import `api/`, `ui/`, `components/` or `shared/`. A component that needs an app concept takes it
   as a prop or a callback. This costs nothing to hold — there are five violations today (§3.5) and
   one of them dies with AVGrid — and it is the whole of what "extraction-ready" means in practice
   (open decision #5). Stories are exempt: they are a harness, not the library.

### 6.1 The masked-defect class — "it fixes itself when I interact with it"

Recorded during EPIC-056 after this shape produced three separate bugs inside one epic. It will
recur in Epics D and E, so the symptom is worth recognising on sight.

**Symptom.** Something is visibly wrong on first render — a clipped icon, a stale highlight, a row
that shows the previous selection — and it corrects itself the moment you interact with the
component in *any* way, including ways unrelated to the defect (moving the mouse over a row, typing
a character, resizing). It never reproduces once you have touched the component, which makes it read
as a rendering race or a CSS problem and gets it misfiled as either.

**Cause.** It is neither. React re-rendered on every parent render and, in doing so, silently did
work that nothing had *asked* it to do. Converted code does only what it declares, so anything that
was riding on the incidental re-render stops happening — and the interaction that "fixes" it is
simply the first thing that triggers an explicit update.

The concrete mechanism in `uikit/`: `RenderGrid`'s host built its `renderCell` closure fresh on every
render, and the engine compares `renderCell` by identity, so **every parent re-render recomputed and
repainted every visible cell.** Two latent defects hid behind that, both surfacing the week
`ListBox` stopped doing it (US-1014 made `renderCell` a stable field, which is required for its
repaint gate to mean anything):

- `variant` and `selectionStyle` were missing from the repaint dependencies, and had been for as
  long as the effect existed. Nothing noticed, because the blanket repaint covered them.
- `VirtualGrid` computed its cell geometry with `scrollBarWidth: 0` on first paint — the geometry has
  to be computed *before* a paint, but the scrollbar only exists *after* it — and never recomputed.
  Cells were laid out at the container's full width, putting each row's trailing slot under the
  scrollbar. The blanket repaint had been re-settling it on the next render.

The third instance (US-1016) is the same class with a different mechanism, and the one most likely to
recur: **the missing input was not a prop but a callback's identity.** `MultiListBox` owns its
selection as an array and hands `ListBox` a membership predicate, never a `value`. That predicate was
a stable bound method, so checking a row moved no slot of the repaint signature at all — the
checkbox kept its old glyph until the pointer moved over a row and changed `activeIndex`. React hid it
because the inline row renderer was a fresh closure per render. The fix is to memoize the predicate on
the selection, so its identity is a truthful signal; a `revision` counter would have been a proxy for a
channel that already existed, with a forgotten bump as its silent failure mode.

**The generalisation worth carrying into Epics D and E:** when a parent owns state that a converted
child renders but is never *given* (a predicate instead of a value, a formatter instead of a string),
the callback's identity is the only channel that state has. Freezing that identity for tidiness
silently freezes the child's output with it.

**How to diagnose.** Do not start from the CSS. Snapshot the two states and diff the *geometry
inputs*, not the appearance: for a virtualized host, compare what the render info was computed with
(`info.input.*`) against what is measured now (`model.scrollBarWidth`, `model.size`). A mismatch is
the whole bug. For a content defect, compare the declared dependency list against every value the
render path actually reads — the missing one is usually a prop the old effect never listed, because
it never had to.

**How to fix.** Make the work explicit at the point that owns it, and do not restore a blanket
repaint to paper over it:

- a value the output depends on → add it to the model's repaint signature (fixed length, see
  `uikit/shared/deps-gate.ts`);
- state the child renders but is never handed → carry it in the identity of the callback that
  exposes it, and memoize that callback on the state;
- a measurement that is only valid *after* a paint → settle it after that paint, with a bounded
  retry, never on a microtask scheduled before it — and make it a **recompute** rather than a
  repaint when per-cell geometry is involved, because a repaint cannot change what
  `calcRenderInfo` already decided;
- work React did per render that has no owner yet → give it one, rather than reintroducing an
  unconditional update.

**Where to look first when it recurs.** Any `VirtualGrid` host on first open, before interaction:
dropdowns (`Select`, `Autocomplete`, `MultiSelect`), the sidebar lists, `FileList`, and `Tree`. Check
first paint specifically — a story that you have already clicked in will not show it.

## 7. The epics

Seven epics, roughly in dependency order. IDs are assigned when each epic doc is created.

### Epic P — Preparation (React-side)

**Scheduled as [EPIC-051](epics/EPIC-051.md) on 2026-08-16. Completed.**

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

**Scheduled as [EPIC-052](epics/EPIC-052.md) on 2026-08-18. Completed.**
Investigation at epic open found the color half of the description below **already
done** — `color.ts` emits 77 `var(--color-*)` strings and all nine themes (not ten) define exactly
those 77 with no drift — and found the real gap elsewhere: nothing outside CSS is ever told that the
theme changed. See the epic doc for the re-scoped task list.

Emit `theme/color.ts` and `uikit/tokens.ts` as CSS custom properties on `:root`, per theme,
alongside the existing object exports. Vanilla views style with plain CSS; React keeps importing
`color.*` unchanged. Nothing in the app changes behaviour.

Candidate tasks: CSS-variable emission for all 10 themes · token pass-through in `GlobalStyles` ·
theme-switch path without a React re-render · Emotion-to-CSS conventions in `coding-style.md`.

**Blocks everything else.** Small, low-risk, no user-visible change.

### Epic B — The reactive foundation and the boundary

**Scheduled as [EPIC-053](epics/EPIC-053.md) on 2026-08-18. Completed 2026-08-19.**
Investigation at epic open found three of the candidate tasks below smaller than
described: `ComponentQueue`'s plain `subscribe` path **already exists**, `immer` is a one-file
dependency rather than five, and the 16 `useSyncExternalStore` call sites in §2 are **not** the
state layer's React bridge — `TOneState.use()` reaches React through zustand, and rebuilding that
is what the drop-zustand task actually is. Two decisions taken at epic open change the candidate
list below: **update batching is not done** — av-grid's microtask coalescing is an optimization for
a virtualized surface, and imposing it on 153 existing `subscribe()` sites buys nothing (EPIC-053
B8) — and the components that genuinely need it (`LogView`, `Tree`, `ListBox`, and the rest of the
`RenderGrid` consumers) **adopt av-grid's render engine** instead, which is itself a vanilla port of
Persephone's own `uikit/RenderGrid/` (B9). av-grid's **source is copied into the tree rather than
consumed as a dependency**, so Persephone controls it outright — while the av-grid repository
continues separately as the deliberately light library boards vendor, since building it out of a
growing UIKit would push weight into every board's bundle. Two copies of the same grid is the
accepted outcome, and open decision #5 is unaffected: av-grid is explicitly not an instance of "one
source tree, two products". The per-consumer conversion work lands in Epics C and E; Epic B's
obligation is only to not build a competing virtualization primitive. A third decision reaches
forward into every later epic: **`TComponentModel.effect()` does not survive React** (B13). Neither
av-grid nor VSCode has a dependency-array concept, and all 65 call sites map onto `init()`,
`setProps` + `oldProps`, or the method that makes the change — all of which already work under
React. Models therefore shed their effects *before* being converted, the vanilla driver evaluates
none, and `effect(` call sites 65 → 0 is a measured number carried through to Epic F. All the
epic's shaping questions are settled; see the epic doc for the task list and the decisions.

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
- **Storybook harness** — the existing `editors/storybook/` preview exercises the vanilla
  implementation through each converted component's unchanged React-facing shim. The original
  plan considered a second `vanillaComponent` field and side-by-side panes, but the public React
  face now calls `mountVanilla` itself, so a second pane would render the same implementation twice
  and add no comparison signal. `Story` remains a small React-facing record with serializable
  prop definitions; `previewChildren` remains the temporary React-only slot seam until later
  conversions remove it.
- **Pilot** — one real component converted end to end to validate the contract before Epic C
  scales it to 44.
- **Authoring rules** — update `uikit/CLAUDE.md` and `model-view-pattern.md` for vanilla views.

Guard rail: the primitives above were estimated at roughly 200 lines. **That number was retired at
epic open** (EPIC-053 B14) — it was an assumption made before anything was measured, and av-grid's
`Observable` alone is 170 lines. The concern behind it stands: the failure mode of this phase is
accidentally writing a worse React. It is checked by requiring that each primitive be demanded by a
real conversion rather than added in advance, not by counting lines.

### Epic C — UIKit conversion

The 44 components in `uikit/`, converted leaf-first behind identical React-facing signatures.
Drop in av-grid for AVGrid. Move Popover / Menu / Tooltip to `@floating-ui/dom` and delete
`react-tooltip`.

**This is the epic that pays.** 14,671 lines, and nearly all the perceived speed lives here.
If the migration stops after Epic C, it was still worth doing.

#### Split into four epics (user decision, 2026-08-19)

*C1 shipped as [EPIC-054](epics/completed.md). C2 shipped as [EPIC-055](epics/EPIC-055.md). C3
is implemented as [EPIC-056](epics/EPIC-056.md). The next free epic number is **EPIC-057**; C4 gets its doc
and its ID when it is genuinely next up, the way this programme has scheduled every epic so far.*

At scheduling time this was measured against the tree and **split into four independently
schedulable epics** rather than run as one. Whole, it would have been 44 components and 14,671
lines — by a wide margin the largest epic in the project, with no clean internal boundary to pause
at. The split lines are not arbitrary: they follow the `uikit/` internal import graph, which is a
chain with a single cycle.

| | Epic | Components | Lines | Blocked on |
|---|---|---:|---:|---|
| **C1** | Foundation and primitives | 20 | 3,209 | Epic B |
| **C2** | Floating layer and composites | 15 | 4,104 | C1 |
| **C3** | Virtualization engine, data views and dropdowns | 7 | 7,578 | C1, C2 |
| **C4** | AVGrid → av-grid | 1 (+15 consumers) | ~4,914 | C2, C3 |

C2's and C3's component counts and line figures were **re-measured when C2 opened**
(EPIC-055, 2026-08-20) and are not the numbers this table carried at the split: `Select`,
`MultiSelect` and `Autocomplete` moved from C2 to C3 because all three render a C3 component. C3's
figure was then **re-measured when C3 opened** (EPIC-056, 2026-08-21) and came in at 7,578 — the one
estimate in this programme that held. C4's figure still inherits the §2 denominator and should be
re-measured when C4 opens.

**C1 — Foundation and primitives.** The twenty components at the bottom of `uikit/`'s own
dependency graph: `Tooltip`, `Button`, `IconButton`, `TruncatedText`, `SegmentedControl`,
`Input`, `Textarea`, `Checkbox`, `Slider`, `RadioGroup`, `Tag`, `Label`, `Divider`, `Dot`,
`Spacer`, `Spinner`, `ProgressBar`, `SelectableRow`, plus `Panel` and `Text`. Fifteen of them
import no other `uikit/` component, so the epic is almost entirely parallel; the only chain is
`Tooltip → {Button, IconButton, TruncatedText} → SegmentedControl`.

It carries the epic-wide groundwork: roadmap Rule 6's leak closure, the Emotion-to-CSS contract,
the DOM icon path (moved here from Epic D — `renderIcon` returns a `ReactNode`, so without it
every icon in the app would sit inside a React root), and the subtree-slot answer deferred from
Epic P (D4).

**It also settles the container idiom for the whole programme.** `Panel` looked like the
foundation and is not: of its 716 production JSX tags, 636 are in `editors/` and 74 in `ui/` and
`components/`, against **6 inside `uikit/`**. It is app-facing styling sugar, so it gets no
vanilla equivalent — vanilla views write plain elements with semantic classes in their own
stylesheets, which is VSCode's pattern. `Panel` stays React-only and drains away as Epics D and E
convert its call sites. Delivered in [EPIC-054](epics/EPIC-054.md).

**C2 — Floating layer and composites.** `Popover`, `Menu`, `Dialog`, `Notification`, `Progress`,
`DateInput`, `TagsInput`, `Toolbar`, `Splitter`, `Breadcrumb`, `CollapsiblePanelStack`,
`SplitButton`, `CategoryList`, `Minimap`, `ImageViewport`. Carries the bulk of the
`@floating-ui/react` → `@floating-ui/dom` move and empties it out of `uikit/` entirely; C1 does
`Tooltip` first because it is the simplest floating consumer and therefore the right place to
establish the pattern. Note the dependency is **not** fully retired here —
`editors/browser/BrowserTabsPanel.tsx` and `ui/dialogs/poppers/showPopupMenu.tsx` also import it
and convert in Epics E and D. C2 is also the first epic that converts `TComponentModel` models
(four of them, seven `effect()` calls), so B13's effect-shedding is first paid for here.
Delivered in [EPIC-055](epics/EPIC-055.md).

**`Select`, `MultiSelect` and `Autocomplete` are C3, not C2** *(user decision, 2026-08-20,
EPIC-055 C2-1)*. All three render `<ListBox>` / `<MultiListBox>` in their dropdown, and `ListBox`
needs a vanilla `RenderGrid`. The real chain is `Popover → Menu → ListBox → Select`, which crosses
the C2/C3 line twice; putting the three above `ListBox` makes the order match the graph.

**C3 — Virtualized data views and dropdowns.** `ListBox`, `MultiListBox`, `Tree`, the absorption of
av-grid's `render/` folder as `uikit/RenderGrid/`, and — per C2-1 — `Select`, `MultiSelect` and
`Autocomplete`. EPIC-053 B15 treats `RenderGrid` and `AVGrid` as one absorption; the import graph
says otherwise. av-grid's `render/` is standalone — today's `uikit/RenderGrid/` imports nothing from
`uikit/` — so the engine can land as soon as C1 is done, while `ListBox` and `Tree` on top of it
cannot land until C2 has produced a vanilla `Popover` and `Menu`, and the three dropdown composites
cannot land until `ListBox` has. This epic also resolves B15's one explicitly undecided item,
`RenderFlexGrid.tsx`. **Its scope must be re-measured when it opens**, not inherited: it is now
seven components, and whether the dropdown family deserves its own epic is a question for that
point (EPIC-055 Concern 6). Implemented in [EPIC-056](epics/EPIC-056.md).

**What the C3 measurement changed** *(EPIC-056, 2026-08-21)*. The scope re-measure held the line
estimate (7,578) but overturned two assumptions in this section. First, the absorption is **not a
swap**: `RenderCellFunc` returns a `ReactNode` and av-grid's returns an `HTMLElement`, and
`RenderGrid`/`RenderGridModel` have **12 app-layer importer files**, so the React engine survives C3
and drains through Epics D and E the way `Panel` does (EPIC-056 C3-1). Which means, second, that
**C4 is no longer "the only part of Epic C that reaches outside `uikit/`"** — nothing in C3 reaches
outside either, but only because those twelve call sites are deliberately left for D and E rather
than converted here. B15's undecided `RenderFlexGrid` row is resolved the same way: it stays
React-only for its two `editors/` consumers (C3-3). The dropdown family stays inside C3, with
`MultiSelect` and `Autocomplete` as the designated slip items (C3-10).

**C4 — AVGrid → av-grid.** The grid itself, plus the ~15 consumer files in `editors/` and
`components/` that need host-wiring changes because `RenderGridModel`'s public API differs from the
React version's (B15). The only part of Epic C that reaches outside `uikit/`, the only part that is
an adoption rather than a conversion, and therefore the one that is cleanly abortable on its own.

**Verification runs through the Storybook harness** built in Epic B. Each converted component is
exercised through its existing story; the public React shim mounts the vanilla implementation, and
the `data-name` contract
([ui-element-contract.md](architecture/ui-element-contract.md)) makes the DOM before and after
comparable — drivable from the `browser_*` tools. It is a visual harness, not an assertion suite;
it shows a difference, it does not fail a build. Note that open decision #6's *side-by-side* form
did not survive contact: EPIC-053 B5 was partially reversed by US-994, because a converted
component's React face renders the vanilla view, so both panes would have shown the same DOM. Rule
4's number is therefore taken at two points in time — **on the React implementation before the
conversion, which is the one measurement that cannot be recovered afterwards** — not in two panes.

Story coverage was 38 of the 44 components at the split. The six without a story were `AVGrid`
(superseded by av-grid anyway), `RenderGrid`, `Minimap`, `ImageViewport`, `Progress` and
`SelectableRow` — which, apart from AVGrid, are precisely the measurement-heavy components whose
conversion is hardest. Writing those stories is cheap and belongs to whichever epic owns the
component, before the component is converted rather than after. **C1 and C2 closed four of the six**
(`SelectableRow`, then `Minimap`, `ImageViewport` and `Progress`), so coverage measured 42 of 44 when
C3 opened: `RenderGrid` is C3's to write, `AVGrid` is C4's. Note two of C1's stories are vanilla-only
`.story.ts` files (`Checkbox`, `Label`) — a `.tsx` glob misses them.

**One extra task, cheap and unrelated to rendering:** close the four remaining `uikit/` → app-layer
imports listed in §3.5 (`ListBoxModel`, `TreeModel`, `Menu/types`, `RenderFlexGrid`; the fifth dies
with AVGrid), and adopt Rule 6. That is the entire cost of keeping open decision #5 open. It is
independent of every conversion and lands in **C1**.

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
touched anyway. The `hast → DOM` renderer that replaces react-markdown's React step
(open decision #1, §3.6) must land before markdown, notebook and mcp-inspector — it is the one
Epic E item worth pulling early, since three editors block on it.

Largest first: graph 3,001 · link-editor 2,860 · notebook 1,949 · rest-client 1,917 · browser
1,700 · log-view 1,693 · mcp-inspector 1,637 · git-tree 1,425.

### Epic F — Removal

Delete `react-dom`, then `react`, `@types/react*`, `@emotion/*`, `@monaco-editor/react`,
`react-markdown`, `react-tooltip`, `eslint-plugin-react-hooks`. Strip the adapters. Update
`CLAUDE.md`, `component-guide.md`, `model-view-pattern.md`, `uikit-vs-components-split.md`.

**Per open decision #3, this epic also strips the React wrapper off every converted UIKit
component** — they were scaffolding, not a published API. Two consequences that reach backwards:

- The API can finally be cleaned up, because the React-facing signature stops being a contract the
  moment the last React caller is gone. Concretely, the `| ReactNode` arm of Epic P's
  `IconRef = IconName | ReactNode` (D3) is deleted here, and the subtree slots Epic P deferred (D4)
  never need a permanently React-compatible design — only one good enough to carry the migration.
- Epic C should therefore keep each wrapper thin and mechanical. Effort spent making the React
  surface pleasant — memoization, ref ergonomics, prop polish — is effort spent on code with a
  scheduled deletion date.

This does not constrain open decision #5: a vanilla-only UIKit is still publishable as a vanilla
library, exactly like av-grid. Dropping React support removes a consumer, not the option to ship.

#### The removal ledger

*Added 2026-08-21 (user decision at EPIC-056 open). Temporary duplication during the migration is
accepted — it is often the only way to keep Rule 2 — **on the condition that every duplicate is
written down here when it is created, and that the programme cannot close while any entry is still in
the tree**. Draining is not a guarantee: a component whose last consumer is gone still compiles, and
nothing but this list notices. An individual conversion epic may close with a documented survivor;
the entry remains until the later epic that owns its last consumer removes it.*

Each entry names what was kept, why, and what makes it collectable. Add a row in the epic that
creates the duplicate, not in the epic that hopes to remove it.

| Survivor | Kept because | Collectable once | Created by |
|---|---|---|---|
| `uikit/Panel/` | App-facing styling sugar with 716 JSX tags, 636 of them in `editors/`; a vanilla twin was deliberately not written (C1) | Epics D and E convert its call sites; C3 removes the last `uikit/` one | C1 / EPIC-054 |
| `uikit/RenderGrid/` (`RenderGrid`, `RenderGridModel`, `renderInfo`, `rerender-check`, `types`, `AsyncRef`) | Its cell contract returns a `ReactNode`; 12 app-layer importers cannot be swapped without breaking Rule 2 (EPIC-056 C3-1) | C4 replaces `uikit/AVGrid/`, and Epics D and E convert the 12 app-layer importers | C3 / EPIC-056 |
| `uikit/RenderGrid/RenderFlexGrid.tsx` | Variable-height virtualization with no av-grid counterpart and two `editors/` consumers (EPIC-056 C3-3) | Epic E converts `LogBody.tsx` and `NotebookBody.tsx` — either onto a vanilla variant or off flex rows entirely | C3 / EPIC-056 |
| React faces on converted UIKit components (`Component.tsx` → `mountVanilla`) | Scaffolding that keeps call sites working mid-migration (open decision #3) | Epic E finishes; covered by this epic's main body above | C1 onward |
| `WithMenu`'s render-prop face | 14 call sites; a render prop has no vanilla equivalent, so `openMenu` was added underneath it (EPIC-055 C2-5) | Its call sites use `openMenu` directly | C2 / EPIC-055 |
| `renderIcon`'s `ReactNode` arm (`IconRef = IconName \| ReactNode`) | Epic P's D3 compromise | Already scheduled above — the arm is deleted with the wrappers | Epic P |
| `uikit/shared/highlight.ts` React form | `AVGrid/DataCell.tsx` still consumes it after C3 adds the DOM form (EPIC-056 C3-7) | C4 replaces `uikit/AVGrid/` | C3 / EPIC-056 |

**Two entries are already collectable at the point C4 closes** (`RenderGrid`'s `AVGrid` importers,
`highlight`'s React form), which is worth checking there rather than deferring to F on principle:
collecting a duplicate in the epic that frees it is cheaper than collecting it in a cleanup epic that
has to re-establish why it existed.

**Not in this epic, but reachable from it:** with React gone and Rule 6 held, `uikit/` and `core/`
are package-shaped, and the "one source tree, two products" idea behind open decision #5 becomes a
build-configuration question rather than a refactor. Deciding it is post-migration work and should
be scheduled on its own merits — the payoff is that boards could vendor UIKit the way they already
vendor av-grid, which is a Boards feature, not a de-React one.

Only reachable if Epic E finishes. Not a goal in itself.

## 8. Open decisions

Each of these changes the shape of an epic and should be settled before that epic opens.

| # | Question | Blocks |
|---|---|---|
| 1 | *Settled (2026-08-18):* **Nothing replaces the parser — only the last step.** Keep `remark`/`rehype`; swap `hast-util-to-jsx-runtime` (react-markdown's React step) for a `hast → DOM` renderer. Neither `markdown-it` nor `marked` is adopted. See §3.6. | Epic E |
| 2 | *Settled (2026-08-18):* **`document.createElement` for structure; `innerHTML` only for static, code-owned markup, never with interpolated runtime data.** This is what av-grid already does and what VSCode does. See §3.4. | Epic B |
| 2a | *Settled:* model/view split and state-driven binding are preserved, built on the existing `TComponentModel` and `IState.subscribe`. See §3. | — |
| 3 | *Settled (2026-08-18, user decision):* **Scaffolding — deleted in Epic F.** There is no plan to consume UIKit from a React app, so once React leaves Persephone every UIKit component is vanilla-only with no React support. Rule 2 still governs the *migration* (a swap must not break call sites), but the React-facing signature is not a permanent contract, so Epic F is free to clean up the API. Keep the wrappers thin and mechanical in Epic C — do not invest in React ergonomics for something scheduled for deletion. | Epic C, Epic F |
| 4 | *Settled (2026-08-18, user decision):* **CSS custom properties**, not generated class hooks. Scalar values (size, offset, width, color) are written to `element.style` as `--*` variables and consumed by a static rule; discrete boolean state uses a `data-*` attribute and a static rule, which is already the UIKit state model. Generated class hooks are rejected — they reintroduce a runtime style engine. This is the mechanism boards already use (`--p-*`), where a theme switch is a variable re-push and nothing walks the component tree. See [EPIC-052](epics/EPIC-052.md) A6. | Epic A |
| 5 | *Settled (2026-08-18, user decision):* **Stays in-tree; designed for extraction, not extracted.** Packaging UIKit during the migration would compound two risky changes, so no package is built here. But the folder boundary is treated as a future package boundary from Epic C onward, so extraction stays a later decision rather than a rewrite. The eventual target shape — one source tree producing two products (Persephone + one or more libraries, so boards can consume UIKit the way they already consume av-grid) — is recorded in §7 "Epic F" as post-migration work. See §3.5 for the measured distance to that boundary. | Epic C |
| 6 | *Settled:* **No second Storybook pane is needed.** Converted React-facing components mount their vanilla views through `mountVanilla`, so the existing story preview already exercises the implementation that ships. The in-app gallery is Persephone's own harness, not the Storybook.js product. | Epic C |

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

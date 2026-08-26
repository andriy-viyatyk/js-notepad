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
| `@monaco-editor/react` | `monaco.editor.create` directly | **Done — uninstalled in EPIC-061 (E3).** Not trivial and not a swap: the wrapper is controlled and `monaco.editor.create` is not, so it was a control inversion across 13 mount points behind two `VanillaView` hosts |
| `@floating-ui/react` | `@floating-ui/dom` | Same library, vanilla core. **Not retired inside Epic C** — C1 moved `Tooltip`, C2 empties `uikit/`, and two app-layer importers (`editors/browser/BrowserTabsPanel.tsx`, `ui/dialogs/poppers/showPopupMenu.tsx`) survive into Epics E and D |
| `react-tooltip` | our own `uikit/Tooltip` | **Done — uninstalled in C1.** It had zero importers; it was an uninstall, not a migration |
| `zustand` (1 file) | A value plus the listener array `TOneState` already keeps | Small — the dependency is deleted, not replaced (§3.3) |
| Emotion (85 files) | CSS custom properties + static CSS | Medium, mechanical. **58 production importers as of C2 open** — `uikit` 35, `components` 11, `ui` 10, `theme` 1, `editors` 0 |
| `react-markdown` | The existing `remark`/`rehype` stack plus the hand-written `hast → DOM` walker | Converted in the editor migration; the package remains installed until Epic F |

`react-markdown` looked like the only entry with no cheap swap: it backs the markdown preview, the
notebook note editor and the MCP inspector, all through custom component overrides. Investigation
(open decision #1, settled 2026-08-18) found it is a thin React binding over a parsing stack that is
already framework-free, so the parser was kept and only its final `hast → React` step was replaced
by the local DOM walker described in §3.6. The package remains installed until Epic F.

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
does not change**. Dialogs and poppers follow the same shape through
[`ui/dialogs/dialog-view-registry.ts`](../src/renderer/ui/dialogs/dialog-view-registry.ts): a
`viewId → VanillaView` constructor map with the model passed in. The former React registry is gone.

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
| `uikit/ListBox/ListBoxModel.ts` | `api/events/events` (`ContextMenuEvent`) | Real |
| `uikit/Tree/TreeModel.ts` | `api/events/events` (`ContextMenuEvent`) | Real |
| `uikit/Menu/types.ts` | `api/types/events` (`MenuItem`) | Real — a re-export of an app type |

The four former files were closed during C1–C4, so no `uikit/` → app-layer leak remains.

**Status after E4 close (2026-08-25): closed.** `ListBoxModel` and `TreeModel` now read
`core/events/context-menu`, `Menu/types` no longer re-exports an app type, and the former AVGrid
context-menu model was deleted with C4. The lint zone has no remaining
uikit-to-app exemption.

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

**The decision: keep the whole stack and replace only the final step with a hand-written `hast → DOM`
walker** (`markdown/hast-dom.ts`). Everything upstream is untouched; the walker is deliberately
local so it can preserve the existing interactive `code`, `pre`, and `img` seams without adopting
another renderer package.

What that buys, concretely:

- **Both custom plugins keep working, unmodified.** `rehypeHeadingIds.ts` (slugged heading ids, so
  `#fragment` links resolve) and `rehypeHighlight.ts` (wraps search matches in `.highlighted-text`)
  are plain unified plugins operating on hast, and neither imports React. Verified.
- **`remark-gfm` and `rehype-raw` keep working, unmodified.** Tables, task lists, strikethrough, and
  raw embedded HTML all behave exactly as today — no re-testing of markdown semantics.
- **The output tree is identical**, so `MarkdownBlock.css` and the `.markdown-block` scoping survive
  as they are.

The five node overrides in `getComponents()` — `code` (Monaco-colorized `CodeBlock`), `pre` (mermaid
SVG), `input` (checkbox → icon), `a` (link resolution), and `img` (`MarkdownImage`) — are now
"when the walker reaches this hast node, build this DOM instead". The interactive `code`, `pre`,
and `img` nodes are owned `VanillaView` instances; `input` and `a` are rehype HAST rewrites. The
other markdown consumers continue to use the shared block renderer, whose props remain stable.

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
7. **When a first-party library falls short, enhance the library.** *(User decision, 2026-08-22,
   EPIC-057 C4-10.)* Where this programme adopts code Persephone does not own the source of —
   av-grid is the one case — a missing option, an unfit behaviour or an inexpressible hook is fixed
   **upstream**, not worked around in the host. No prop faked in a shim, no reach past a public
   façade into internals, no CSS compensating for markup the library should have produced. Persephone
   and av-grid have the same owner, so the upstream fix costs a change and a version bump and every
   consumer gets it, boards included. A workaround is only ever cheaper in the hour it is written,
   and it is what turns one library into two diverging ones.
8. **Epic and task documents are kept for the whole programme.** *(User decision, 2026-08-22.)* The
   `doc/tasks/US-XXX-*` folders are **not** deleted at each epic's close — they are swept once, when
   De-React is finished. This programme's epics re-measure each other's assumptions: EPIC-056
   overturned four of C3's inherited figures and EPIC-057 four of C4's, and in both cases the
   evidence lived in an earlier epic's task documents. The project's normal delete-on-close rule
   resumes for work outside De-React.

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

The former React grid host built its `renderCell` closure fresh on every render, and the engine
compared `renderCell` by identity, so **every parent re-render recomputed and repainted every visible
cell.** Two latent defects hid behind that, both surfacing the week
`ListBox` stopped doing it (US-1014 made `renderCell` a stable field, which is required for its
repaint gate to mean anything):

- `variant` and `selectionStyle` were missing from the repaint dependencies, and had been for as
  long as the effect existed. Nothing noticed, because the blanket repaint covered them.
- `VirtualGrid` computed its cell geometry with `scrollBarWidth: 0` on first paint — the geometry has
  to be computed *before* a paint, but the scrollbar only exists *after* it — and never recomputed.
  Cells were laid out at the container's full width, putting each row's trailing slot under the
  scrollbar. The blanket repaint had been re-settling it on the next render.

The current mechanism is the framework-free `uikit/VirtualGrid/`: `VirtualGridView` owns the
scroll element and DOM cell pool, while `VirtualFlexGridView` adds measured row heights.

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
handles (`AVGrid`, `Tree`, `ListBox`, `VirtualGridView`, `Textarea`, `ImageViewport`, `FileList`,
`LinksList`, `MarkdownBlock`); 33 use `forwardRef`. An imperative handle is already a model method
written in the wrong place — the caller wants to command the view. Moved onto the model or onto
`ComponentQueue`, it survives the migration untouched.

**4. Replace React context with explicit model references.** Three sites:
`EditorConfigContext`, `LogViewContext`, and `uikit/shared/highlight`. Context has no vanilla equivalent; each becomes a model passed down or
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
`VirtualGrid` consumers) **use the framework-free `uikit/VirtualGrid/` render engine** instead.
The separate av-grid dependency remains the boards vendor and the `DataGrid` mounting boundary;
the per-consumer conversion work lands in Epics C and E. Epic B's obligation was only to not build
a competing virtualization primitive. A third decision reaches
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
- **Storybook harness** — the existing `editors/storybook/` preview renders each story's
  declared arm directly: converted demos use `Story<P>.view` and story-local `VanillaView` classes,
  while `Panel` and `Text` retain the React `component` arm. The original plan considered a second
  vanilla field and side-by-side panes, but the public React face still calls `mountVanilla` for
  application callers, so a second pane would render the same implementation twice and add no
  comparison signal. `story-props.ts` provides the single prop-preparation path, and
  `previewChildren` follows the selected arm (`ReactNode` for React stories, `Node` for vanilla).
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
is implemented as [EPIC-056](epics/EPIC-056.md), and C4 is scoped as
[EPIC-057](epics/EPIC-057.md) — the last epic in Epic C. The next free epic number is
**EPIC-058**.*

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
| **C4** | AVGrid → av-grid | 1 (+**12** consumers) | **4,917** | C2, C3 |

C2's and C3's component counts and line figures were **re-measured when C2 opened**
(EPIC-055, 2026-08-20) and are not the numbers this table carried at the split: `Select`,
`MultiSelect` and `Autocomplete` moved from C2 to C3 because all three render a C3 component. C3's
figure was then **re-measured when C3 opened** (EPIC-056, 2026-08-21) and came in at 7,578 — the one
estimate in this programme that held. C4's figure was **re-measured when C4 opened**
(EPIC-057, 2026-08-22) and came in at **4,917** against the inherited ~4,914 — the second inherited
figure to survive. Its *consumer* count did not: "~15" measured **12 files that reference AVGrid in
code**, with seven more mentioning it only in comments.

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
needs the framework-free `VirtualGrid`. The real chain is `Popover → Menu → ListBox → Select`, which crosses
the C2/C3 line twice; putting the three above `ListBox` makes the order match the graph.

**C3 — Virtualized data views and dropdowns.** `ListBox`, `MultiListBox`, `Tree`, the framework-free
`uikit/VirtualGrid/` primitive, and — per C2-1 — `Select`, `MultiSelect` and `Autocomplete`.
The engine can land as soon as C1 is done, while `ListBox` and `Tree` on top of it cannot land until
C2 has produced a vanilla `Popover` and `Menu`, and the three dropdown composites cannot land until
`ListBox` has. Implemented in [EPIC-056](epics/EPIC-056.md); the measured-height
`VirtualFlexGridView` was completed in E4.

**What the C3 measurement changed** *(EPIC-056, 2026-08-21)*. The scope re-measure held the line
estimate (7,578) but identified the important contract boundary: the former React cell function
returned a `ReactNode`, while the framework-free `VirtualGrid` contract returns an `HTMLElement`.
The later editor conversions completed that boundary, and the dropdown family stayed inside C3,
with `MultiSelect` and `Autocomplete` as the designated slip items (C3-10).

**C4 — AVGrid → av-grid.** The grid itself, plus the consumer files in `editors/` and
`components/` that need host-wiring changes because the former React grid model's public API differs
React version's (B15). The only part of Epic C that reaches outside `uikit/`, the only part that is
an adoption rather than a conversion, and therefore the one that is cleanly abortable on its own.
Scoped as [EPIC-057](epics/EPIC-057.md).

**What the C4 measurement changed** *(EPIC-057, 2026-08-22)*. Three things, beyond the counts above.
First, **B15's "copy the source into the tree" was written before av-grid was a library** — it is now
published at 2.1.0 with generated types and 11,360 lines of tests in its own repository, and
Persephone's own boards already vendor it from npm (`boards-assets/manifest.json` names it the
default board grid). EPIC-057 C4-1 settles it as **the dependency** (user decision, 2026-08-22) —
with vendoring kept explicitly available if the dependency ever gets in the way, which is what makes
the reversal safe: the mounting shim is the only file that names the package, so a later copy-in is
one import path and a folder. Second, **B15's "host-wiring changes" is control inversion, not an API rename**: the former React grid
is a fully controlled React component and av-grid is uncontrolled-plus-callbacks, so nine of the
props the call sites pass sit on that boundary. A controlled-prop compatibility shim is therefore
ruled out — it would be a reconciliation layer added at the end of the programme that exists to
remove them — which makes C4 the programme's **second and last documented Rule 2 exception**, after
C3-1. The epic is scoped one task per consumer group for that reason. Third, **theming is nearly
free**: av-grid reads the `--p-*` contract directly and Persephone already owns the 24-pair
`--p-*` → `--color-*` map for boards, so the whole bridge is that map declared once at the renderer
root — with `injectStyles: false`, or a runtime-injected sheet would out-order the whole
`@layer uikit` contract C3-8 established.

**Verification runs through the Storybook harness** built in Epic B. Each story's declared arm is
exercised: converted demos mount their story-local vanilla view directly, while the `Panel` and
`Text` compatibility stories use the React arm. The public React shims still mount the same vanilla
implementations for application callers, and the `data-name` contract
([ui-element-contract.md](architecture/ui-element-contract.md)) makes the DOM before and after
comparable — drivable from the `browser_*` tools. It is a visual harness, not an assertion suite;
it shows a difference, it does not fail a build. Note that open decision #6's *side-by-side* form
did not survive contact: EPIC-053 B5 was partially reversed by US-994, because a converted
component's React face and its vanilla story would exercise the same implementation, so both panes
would have added no comparison signal. Rule 4's number is therefore taken at two points in time —
**on the React implementation before the conversion, which is the one measurement that cannot be
recovered afterwards** — not in two panes.

Story coverage was 38 of the 44 components at the split. The six without a story were `AVGrid`
(superseded by av-grid anyway), the former React virtualization component, `Minimap`, `ImageViewport`, `Progress` and
`SelectableRow` — which, apart from AVGrid, are precisely the measurement-heavy components whose
conversion is hardest. Writing those stories is cheap and belongs to whichever epic owns the
component, before the component is converted rather than after. **C1 and C2 closed four of the six**
(`SelectableRow`, then `Minimap`, `ImageViewport` and `Progress`), so coverage measured 42 of 44 when
C3 opened: the virtualization story was C3's to write, `AVGrid` was C4's. Note two of C1's stories are
`.story.ts` files (`Checkbox`, `Label`) — a `.tsx` glob misses them. **They are not vanilla stories**,
which this paragraph claimed until E11 checked: both import the React face and cast it into the
contract (`component: Checkbox as any`), so they are React stories that happen to contain no JSX.

**One extra task, cheap and unrelated to rendering:** close the four remaining `uikit/` → app-layer
imports listed in §3.5 (`ListBoxModel`, `TreeModel`, `Menu/types`, and the former grid wrapper; the fifth dies
with AVGrid), and adopt Rule 6. That is the entire cost of keeping open decision #5 open. It is
independent of every conversion and lands in **C1**.

### Epic D — Shell and shared components

**Complete as [EPIC-058](epics/EPIC-058.md) (scoped 2026-08-22, closed 2026-08-24).**

`ui/` (tabs, sidebar, dialogs, MainPage) and `components/` are now native `VanillaView` shells and
coupled views behind unchanged React-facing faces where compatibility requires them. The application
root is mounted by `src/renderer/index.tsx`'s `mount(container)` callback; React survives in editor
islands and explicit compatibility boundaries, via `mountReact`.

Candidate tasks: icon set from `.tsx` components to a sprite or inline-SVG helper · page/tab host ·
sidebar and menu bar · dialog host · secondary-views host · root flip.

The shell's startup React root is now limited to `GlobalStyles`. The geometry of `#root` lives in
static `theme/root.css`, loaded at entry before the shell measures layout. The secondary-view
registry retains one React-compatible `headerRef` arm for editor callers, and `EditorErrorBoundary`
remains the deliberate React class island around React editor content. The source-level
`react-dom/server` importer is gone; any server exports still present in a bundled React package are
packaging residue for the removal epic, not an application importer.

Depends on Epic C being effectively complete.

**Two things the epic-open investigation added to this sketch.** First, `theme/`'s icon files were
never assigned to an epic and are claimed here (EPIC-058 D2): 115 of the app's 169 icons already have
a DOM builder and the 54 that do not are exactly `theme/language-icons.tsx`, because
`createIconWithViewBox` only attaches `createElement` for a string icon body. That asymmetry is the
sole reason `react-dom/server` is in the renderer bundle, so the icon task is measured in icon bodies
rather than lines. Second, the shell holds **zero React contexts and seven `useState`** across 9,192
`.tsx` lines — Epic P's payoff lands here — so the hazards are structural (four portal hosts, the
error boundary, the root flip) rather than stateful.

### Epic E — Editors

**E1 is complete as [EPIC-059](epics/EPIC-059.md), E2 as [EPIC-060](epics/EPIC-060.md), and E3 as
[EPIC-061](epics/EPIC-061.md), all 2026-08-24. E4 is complete as
[EPIC-062](epics/completed.md), 2026-08-25, and E5 as [EPIC-063](epics/EPIC-063.md), also
2026-08-25.** **E6 is complete as [EPIC-064](epics/EPIC-064.md)**, 2026-08-25. The next
free epic number is **EPIC-065**.

**E3 took the second shared contract, `@monaco-editor/react`, and closed by uninstalling it.** With
both editor-wide contracts now gone — `EditorModule.Body` in E2 and the Monaco wrapper in E3 — the
only shared contract left in `editors/` is the `editors/base` chrome, which E1-8 established must
convert **last** because doing it early costs React roots rather than saving them. E3 concluded from
that that E4 onward would be scoped by line count.

**EPIC-062 corrected it (E4-1) and is now closed:** the shared contract was owned by `uikit/`, not
`editors/`. Its former cell contract returned a `ReactNode`, so its importers were pinned to React by
the primitive they rendered through, exactly as `EditorModule.Body` and the Monaco wrapper pinned
theirs. E4 deleted that contract and collected its two removal-ledger entries; current consumers use
the framework-free `VirtualGrid` contract, with `VirtualGridView` for fixed-height rows and
`VirtualFlexGridView` for measured rows. Its generalisation:
"no contract left" is a claim about the whole import graph, not about one folder.

**E5 ([EPIC-063](epics/EPIC-063.md)) applied that generalisation and found the prediction wrong a
second time.** E4 had repeated E3's claim — line count from here on — and the surviving contract was
simply in the third folder, `ui/`: `ReactSecondaryViewDefinition` in
`ui/secondary-views/secondary-view-registry.ts` types a sidebar panel as
`React.ComponentType<SecondaryViewProps>`, pinning **13 of the 14 registered panels** (1,633 lines
across 9 editors) to React through the registry rather than through their own content. E1 built the
vanilla arm beside it and converted one provider as the pilot; the React arm had stood untouched
since. **The standing check, now recorded twice over:** predicting the next epic's scoping axis from
the folder the current epic happened to touch has failed in both E3→E4 and E4→E5, so E6 is scoped by
*searching* the import graph for a contract, starting from the two candidates E5-8 records —
`uikit/shared/slots.ts`'s `IconRef`/`SlotText` `ReactNode` members, and the `editors/base` chrome
that E1-8 fixed as deliberately last.

**E5 closed 2026-08-25 with its property met**: the registry is single-armed,
`LazySecondaryView.tsx`, `SideBarPanelHeader.tsx` (with its `createPortal` seam) and
`components/icons/EditorIcon.tsx` are deleted, neither contract file imports React, and the sidebar
measures **0 React roots**, from 6 at open. Two things it produced outlast the epic. First, it fixed
the programme's **Rule 4 instrument**: a React root created by a direct `mountReactHandle` call was
invisible to the `[data-part="react-slot"]` query that every root count in this programme has used, so
a surface hosting a live React subtree could measure zero — `mountReactHandle` now marks its host
`data-react-root`, and both selectors must be queried. That is the third Rule 4 methodology
correction (after EPIC-060's page-manager mis-read and E3-6's Monaco-churn mis-attribution) and the
first whose fix was to make the thing *measurable* rather than to re-read the source. Second, it
established the standing answer to "convert a component that still has React callers": **one
implementation with the React export reduced to a `mountVanilla` shim**, never two parallel
implementations — which satisfies Rule 2 more strongly than duplication, since the surviving callers
then compile *and behave* unchanged. Two surfaces survive deliberately under Rule 1:
`ui/secondary-views/SecondaryViews.tsx` (the host's own React face, owned by the browser editor) and
`BoardWebview`'s island inside the board-secondary panel.

**E6 ([EPIC-064](epics/EPIC-064.md), complete) ran the search E5-1 requires and candidate 1 is the contract:**
`uikit/shared/slots.ts`'s `IconRef = IconName | ReactNode`, with `renderIcon()` returning a
`ReactNode` — the same shape as `RenderCellFunc`, one type in a shared module pinning its callers to
React regardless of their own content. Measured live with E5-3's corrected instrument, **44 of the
app's 72 React roots (61%) exist for no reason but that return type**: inside each is a plain `<svg>`
that React rendered into a `display: contents` span inside a host a `VanillaView` already owned. It
is legacy rather than a capability gap — all 173 icon components have a DOM builder, `createIconElement`
sits in the same file with 106 call sites — so E6 is a **205-site call-site migration behind a type
narrowing, with no component converted**, which makes it the best Rule 4 payoff per unit of risk in
the programme. Two findings it records for later epics. First, **it corrects E5-8's own consequence**:
deleting the member does not remove `createRoot` from `uikit/`, because `fillSlot` is fed separately
by `Button` children and `Input` slots from React callers (`TextChrome` among them, which stays last).
Generalised: *deleting a contract removes the callers it pins, not every caller of the machinery
underneath it* — `renderIcon` is a contract, `fillSlot` is machinery that outlives it. Second, a
**reporting correction in the same family as E5-3's instrument fix**: 130 of the renderer's 262
non-story `.tsx` files contain no JSX at all, and 28 never mention React, so the `.tsx` counts every
epic has reported as a progress figure overstate the remaining React — a `mountVanilla` shim needs no
JSX, so the extension measures "could hold JSX", not React. **E7's candidate was measured in advance**
(E6-8): the dialog/popper registry was dual-armed at 14 vanilla registrations to 4 React, and its
conversion could delete `core/state/view.tsx` and collect a residual Emotion importer.
**Closed with its property met:** icon React roots measure **0** (from 44) on every
page set tried, total live roots 72 -> 6, `renderIcon` is deleted and `IconRef` is `IconName | Node`.
It also corrected *its own* closing property (E6-11): `SlotText` does not narrow, because the
link-editor tooltip genuinely needs React — the same over-reach E6-1 was written to catch, this time
in the correcting epic's own document. Its most transferable finding: **when a contract changes from a
value to a resource, every cache of that value becomes a bug** — the single-use DOM-node hazard hit
four times through four distinct mechanisms (a shared items array, a `useMemo`, a module-scope
constant, a story sharing one node between a button and a menu row), and `tsc`, lint, the build and
the root count were blind to every one. Its close also backfilled EPIC-063's missing
`completed.md` summary, whose absence had left the roadmap's E5 links pointing at nothing.

**E7 ([EPIC-065](epics/EPIC-065.md)) completed the dialog/popper registry conversion.** The four
remaining React-registered dialogs and poppers are native `VanillaView`s, and
`ui/dialogs/dialog-view-registry.ts` is now the only registry. Both hosts require a native
constructor and name the missing `viewId` in their error; `core/state/view.tsx` and its Emotion
import are gone. Opening the four surfaces now creates 0 React roots, down from 10 across the four;
`theme/GlobalStyles.tsx` is the only non-story Emotion importer, and the renderer's non-story
`.tsx` count moved from 234 to 229. The conversion also corrected the root-count instrument again:
`data-react-root` is authoritative, while `data-part="react-slot"` can be present on native Dialog
and Tag slots and therefore over-report.

**E8 ([EPIC-066](epics/completed.md)) deleted the synthetic-event round trip.** Converted views no
longer type their public props with React event types, so none of them wraps the native event it
already has: the 27 `toPublicEvent` call sites outside `react-compat.ts` are gone, along with all 17
`as unknown as` double casts and all 11 lossy `nativeEvent as KeyboardEvent`/`as MouseEvent` casts.
`.nativeEvent` reads went 32 → 1, `core/traits/dnd.ts`'s dual arm collapsed, and already-vanilla `.ts`
files importing React went 65 → 58. `toPublicEvent` and `PublicEventHandler` are module-private rather
than deleted, because `applyRestProps` uses both — a direct contradiction between two of that epic's
own non-goals, invisible until the external caller count reached zero.

Two lessons from E8 that later epics should carry:

- **A `mountVanilla` face is not a React implementation.** React never creates events for a view whose
  DOM node belongs to a vanilla view, so React event types on such props are nominal for *every*
  caller, JSX included. This is the test that separates a dead dual arm from a load-bearing one — and
  the one surviving arm (`core/events/context-menu.ts`) is load-bearing precisely because four real
  React components in the browser and link editors still dispatch to it. The rule now lives in
  [standards/model-view-pattern.md](standards/model-view-pattern.md).
- **Compute task boundaries from the type graph, not the directory tree.** E8's breakdown was mis-cut
  three times by folder and produced one red build before settling on *the connected component of the
  prop-type graph* as the atomic unit: retyping a prop breaks all of its callers in the same compile,
  and two prop chains that meet at a single forwarding caller are one unit. Keeping green `tsc` a
  per-task gate rather than an end-of-epic one is what caught it.

E8 also confirmed, deliberately, that **Rule 4 does not measure everything**: its root count did not
move, because it removed event *translation* rather than roots. The root count measures the React that
renders, not the React that types, and the remaining work is increasingly the latter.

**E9 ([EPIC-067](epics/EPIC-067.md), scoped 2026-08-26) takes the `editors/base` chrome** — the item
E1-8 fixed as deliberately last and the three epics since inherited without re-checking. The contract
is `TextChromeProps`' four `ReactNode` members (`children`, `toolbarContributions`,
`rightToolbarContributions`, `footerContributions`), consumed by **14** editors, and its qualifying
evidence is that **7 of those editors already have a vanilla `BodyView` and their only remaining
`.tsx` file is the `index.tsx` that wraps it in `<TextChrome>`** — the same
one-type-pins-its-callers-regardless-of-their-own-content shape as E4's `RenderCellFunc`, E5's
`ReactSecondaryViewDefinition`, E6's `IconRef` and E7's `Views.registerView`. The next free epic
number is **EPIC-068**.

Three things it records before implementing anything, each of which is a correction to this document
rather than a new claim:

- **The "24 `<TextChrome>` call sites" figure carried in the dashboard is wrong; it is 14.** The
  removal ledger's own "14 `<TextChrome>` and 6 direct `<PageToolbar>`" was right. A `<TextChrome`
  grep returns 16 hits — one definition, one comment at `graph/GraphBody.tsx:302`.
- **E1-8's deferral has expired, and this is the fourth instance of its class.** Its reasoning was
  that converting the chrome ahead of its callers buys nothing "since the slot contents are the same
  React trees either way" — true when every body was React, false now that seven are vanilla and
  their slot contents are `Button`/`IconButton` clusters that are themselves already vanilla. The
  generalisation worth carrying: **a deferral is a measurement with a date on it.** E1-8's conclusion
  was correct on its evidence and read as a rule for two epics without being re-measured, which is
  the same failure mode as the inherited-figure corrections in E4, E5 and E6 — only applied to a
  *decision* rather than a count.
- **Rule 4's baseline includes a root the instrument had not been pointed at.** Measured live at
  scoping: 11 roots, of which **2 are `fillSlot` roots opened *inside* a native `IconButton` by the
  still-React chrome** (`text-chrome-footer` → `text-toggle-script`, on text-host editors only). So a
  chrome-pinned editor costs 2 roots, not 1 — the React face of a container leaks roots into the
  vanilla components it holds, which is the inverse of the direction this programme usually measures.

E9 also splits a pairing E8 made: E8 deferred `applyRestProps`/`clearRestListeners`/`bindRef`/
`fillSlot` "to the end, with `<TextChrome>`", but `<TextChrome>` can go now while the bridge cannot —
`PageToolbar` (6 callers), `EditorToolbar` (3) and `ContentHostFooter` (1) keep React faces, and every
remaining React editor body still feeds it. **Two deletions scheduled together are not one deadline.**
The E10 candidate it names, with the measurement already taken, is
`ui/secondary-views/SecondaryViews.tsx` — 17 lines producing **one React root per open page**, 4 of
the 11 measured, and the best remaining roots-per-line target in the tree. As always that is a
candidate, not an axis: E5-1 requires E10 to run its own search.

**E9 ([EPIC-067](epics/completed.md)) deleted the editor chrome contract.** `editors/base/TextChrome.tsx`
is gone, and with it the four `ReactNode` members of `TextChromeProps` that pinned **14** editors to
React regardless of their own content — the same shape as E4's `RenderCellFunc`, E5's
`ReactSecondaryViewDefinition`, E6's `IconRef` and E7's `Views.registerView`. All fourteen now register
`EditorModule.View`; the `Component` arm went 30 → 15. `EditorToolbar`, `PageToolbar`,
`ContentHostFooter` and `ScriptPanel` are native views. Renderer non-story `.tsx` went 225 → 205,
JSX-bearing files 126 → 106, and `editors/` 107 → 88. Six of the fourteen editors now open with **0**
React roots, from 2; the other seven relocate their root into a still-React body, which is what the
epic predicted and why its closing property never promised 0 across the board.

Five things E9 produced that outlast it:

- **Derive task order from the import graph, not from the containment relationship you happen to be
  thinking about.** The first cut put `ScriptPanel` first because it is a child of `TextChrome` — true,
  but it is not the chrome's *leaf*, `EditorToolbar` is. Converting the child first would have forced a
  `fillSlot` React root for its toolbar and **added** a root in an epic measured in roots. Caught at
  plan review. E8's lesson was the same faculty pointed at a different graph.
- **A cast at a `mountVanilla` face means the view's props and the face's props disagree — fix the
  relationship, not the type.** `ContentHostFooterView` first *extended* `EditorToolbarView`, which
  silently inherits its props type, and produced an `as unknown as` — a direct regression against E8's
  closing property. A footer contains a toolbar; it is not one. Inheriting a view to inherit its root
  element inherits its type parameter too, and composition costs one field.
- **The `SlotContent` widening rule**: a converted view's *children* are still typed in React's
  vocabulary, invisible while every caller is React and a hard error the moment one is not. Native
  class takes `SlotContent`, React face keeps `React.ReactNode`. This is E8's residue surfacing from
  the other side, and it recurred in three of E9's nine tasks.
- **A deferral is a measurement with a date on it.** E1-8 fixed the chrome as "deliberately last" and
  was right about both the mechanism and the magnitude — a chrome-pinned editor peaks at 4–5 roots
  mid-conversion. What it got wrong was treating a transient cost as a permanent reason: the peak is a
  property of the epic rather than of its ordering (bottom-up and top-down peak identically, and only
  converting a component together with its parent avoids it, which Rule 1 forbids), it drains inside
  the same epic, and its exit condition had become cheap. The epic's own first draft then made the
  mirror-image error in the paragraph diagnosing it — re-measuring the editor *bodies*, which had
  changed, and not the *slot mechanism*, which had not.
- **A measurement that cannot name its own subject is not evidence.** The fourth Rule 4 instrument
  correction, and the same shape as E5-3's: `app.pages.addEditorPage(editorId, …)` does not force the
  editor, so the `svg-view` row in both the baseline and the closing table had actually measured
  `monaco`. The fix was to make the instrument report the *resolved* editor id. Thirteen correct rows
  were hiding one that had never measured the editor it was labelled with. `svg-view` is recorded as
  **unmeasured** rather than assumed.

**Four §6.1 masked defects were found and given real channels** — `RunButtons`' `hasTextSelection()`,
`ContentHostFooter`'s self-documented forced re-render, `NavPanelButton`'s three unsubscribed reads,
and `ScriptPanel`'s result-less `libraryService.state.use()`. The most instructive is the first: the
channel **already existed** (`MonacoEditor` has kept `hasSelection` in state for years, and
`hasTextSelection()` reads it) and the only thing missing was a `bind`. Where a channel genuinely did
not exist, E9 added one rather than reaching past a façade: `subscribeCatalogBoardsForFile` and
`subscribeInstalled` sit beside their existing hooks in the services that own the private state, each
sharing one extracted projection with its hook so the two cannot drift.

**Two live bugs surfaced during verification that E9 exposed rather than caused** — the grid's toolbar
search not clearing, and the script panel's splitter being unreachable over a Grid editor. Both were
pre-existing, both were `§6.1`, and both had been surviving on an incidental React re-render. The
second is the better illustration: the grid's content panel lacked `min-height: 0`, so as a flex item
it could not shrink below av-grid's own measured height, and the grid overflowed 162px downward and
buried the splitter — `elementFromPoint` over it returned `render-grid-scroll`. "Switch editor away
and back and it works" was the tell in both cases.

**What survives deliberately**, so a later epic does not read it as an oversight: `PageToolbar`,
`EditorToolbar` and `ContentHostFooter` keep React faces (6, 3 and 1 callers outside the epic);
`EditorError.tsx` keeps four; the registry's `View` → `Component` normalisation shim is still consumed
by `ui/app/RenderEditorView.ts`; and `applyRestProps` / `clearRestListeners` / `bindRef` / `fillSlot`
all stay. That last point corrects an E8 assumption: E8 scheduled that bridge "to the end, with
`<TextChrome>`", and E9 shows the two were never one deadline — `<TextChrome>` could go while the
bridge could not. **Two deletions scheduled together are not one deadline.**

**E10's candidate, measured but not chosen**: `ui/secondary-views/SecondaryViews.tsx` — 17 lines
producing one React root per open page, the best remaining roots-per-line target in the tree. As
always that is a candidate, not an axis: E5-1 requires E10 to run its own contract search, now six
consecutive times vindicated. *(E10 ran that search and **rejected this candidate**: re-measured on a
live session it accounts for 0 roots, not 4. See below.)*

**E10 ([EPIC-068](epics/EPIC-068.md), scoped 2026-08-26) is the `PageToolbar` editor group, and its
contract search is the first in this programme to come back negative.** Five epics running found the
same shape — one React-typed member pinning callers that would otherwise be vanilla. Every candidate
E10 tested fails that test, and each fails for a *different* reason, which is what makes the negative
credible rather than a failure to look hard enough:

| Candidate | Measured | Verdict |
|---|---|---|
| `EditorModule.Component: React.ComponentType` | 15 editors on the arm, 15 on `View` | **Load-bearing** — their bodies are genuinely React, so the arm pins nobody |
| `PageToolbar`/`EditorToolbar`/`ContentHostFooter` props | 10 caller editors | **Nominal** — all three files are pure `mountVanilla` shims, and E8's own test says such a face binds no React implementation |
| `SvgIconComponent` (`theme/icons.tsx:12`) | 713 lines, 45 importers, but **32** JSX usages | Live but thin; its shape is still inverted (a React component with an *optional* DOM builder, which is why `createIconComponentElement` throws) but fixing it frees nobody |
| `applyRestProps` / `clearRestListeners` / `bindRef` | 40 / 39 / 18 importers; **20** `uikit/*View.tsx` files are `.tsx` for this alone | A real contract whose **precondition is unmet** — still waiting on the last JSX caller |
| `Story.component: React.ComponentType` | 45 stories, one spread at `LivePreview.tsx:64` | A **genuine contract pinning a harness, not the app**; deferred with its measurement recorded |
| `CategoryViewProps.renderItems` | **1** caller | One caller is not a contract — the third rejection on caller count |

**What the negative means:** the remaining React is **terminal** — React because its own content is
React, not because a type above it demands React. From here the axis is content. The cut is therefore
*the connected component of the `PageToolbar` module graph* (E8's atomic unit): six editors,
**2,895** of the **9,497** JSX lines left in `editors/`, chosen over "the small editors first" (2,497
lines, and it collects **nothing** because it strands `git-tree` and `video` on `PageToolbar`).

Three findings from the scoping worth carrying. First, the baseline was taken on the user's **real
six-page session** rather than a fixture: **4** roots, of which 3 are one per open React-arm editor,
all born at `ui/app/AsyncEditorView.ts:146`, and `[data-part="react-slot"]` reads **0** —
independently confirming E9's closing claim on a live session rather than on the fixture E9 measured.
That makes E10's instrument exact and free: roots = 1 per open React-arm editor + 1 for
`GlobalStyles`, so one conversion moves the count by exactly 1. Second, **E9's own named E10
candidate was rejected on re-measurement** — `SecondaryViews.tsx` was credited with 4 roots when that
note was written and accounts for 0 now. Fifth instance of *a forward-looking note is a measurement
with a date on it*, and the clearest vindication yet of E5-1's rule: re-verifying cost one query,
inheriting would have cost an epic aimed at nothing. Third, **the removal ledger undercounts
`PageToolbar` by one caller** — the row lists six callers of `PageToolbar`, but the module also
exports `SwitchWidget`, which `editors/board/BoardToolbar.tsx:160` imports. *A ledger row names the
callers someone counted, and a module can have callers of a different export: grep the module path,
not the component name.* The next free epic number is **EPIC-070**.

**E10 is complete as [EPIC-068](epics/completed.md) (2026-08-26)** — all seven tasks reviewed, and the
close review's two real regressions **fixed** rather than deferred. `PageToolbar.ts` is deleted at 0
callers; the `Component` arm goes 15 → **9**, the `View` arm 15 → **21**, `editors/` non-story `.tsx`
94 → **76**, and each of the six editors contributes **0** React roots where it contributed 1.
Whole-app roots read 3 at close (`GlobalStyles` + one per open board page), matching E10-2's
arithmetic exactly. Five of the six were verified live with real content rendering; **`git-tree` is
recorded as statically verified but live-unverified** — both programmatic open routes are closed and
the user was working in the app — the same discipline E9 applied to `svg-view` rather than assuming.

Three findings outlast the epic. **A `DocumentFragment` must never be passed to a slot**: slots are
re-filled unconditionally (`PageToolbarView.onUpdate:420-427`) and `fill-slot.ts:137` appends, which
empties a fragment — EPIC-064's *a cache of a resource is a bug* in its purest form, since a fragment
is destroyed by being used. **`bind()` is only for state that outlives the view**: it registers its
unsubscribe through `own()`, which has no early-release API, so re-binding a changing-source
subscription both leaks and lets stale sources keep pushing values — §4's "forgotten unsubscribe",
found in the wild. And a genuine cross-rule interaction: **a view that measures its own root cannot
use a `display: contents` root**, because such an element has no box, so `ResizeObserver` never fires
and `getBoundingClientRect()` reads zero, silently; where the two rules conflict the measurement
wins. E10 also **retired one of its own concerns** rather than implementing it — the predicted
post-paint sizing for `BoardScreenshot` was unnecessary, since that file measures nothing — a fifth
instance of *a forward-looking note is a measurement with a date on it*, this time caught inside the
epic that wrote it.

Its most transferable process finding: the per-task briefs accumulated ten rules with a file:line
each, and the first three tasks needed corrections while the last two needed **none**. *A correction
applied once is a fix; a correction written into the next brief is a class removed.*

**Its close review found two real regressions that no gate could see**, and the first names a defect
class this conversion pattern manufactures: **a `useMemo` whose result feeds a callback becomes dead
code if the port defines the recompute but never calls it.** `CommitDiffPanel`'s `changeMapFor()` was
defined and never called, so commit status badges and an "Open in new Tab" action were silently
missing while `tsc`, ESLint and `build-prod` all stayed green — an empty `Map` is still a `Map`, and
the symptom is *absence*, which a root count cannot measure. Every remaining editor conversion should
check each ported `useMemo`/`useCallback` for a live **caller**, not merely a definition. The second
is the **persistent-child consequence**: React unmounting a subtree used to suppress side effects for
free, so an inactive branch that a native parent now keeps mounted becomes live — here an inactive
`<audio>` receiving the video source and emitting spurious loading/error states. Both are the same
lesson as the epic's `DocumentFragment` finding, from a third direction: *what React did for free by
destroying things must become explicit when nothing is destroyed.*

**E11 ([EPIC-069](epics/EPIC-069.md), scoped 2026-08-26) is the Storybook contract, and it is the
first epic whose search reversed the *previous* epic's own verdict rather than a candidate the
previous epic inherited.** E10 closed on a negative — "the remaining React is terminal" — having
measured `Story.component: React.ComponentType` and set it aside as *"a genuine contract pinning a
harness, not the app."* Re-measured, the phrase is the error: what it pins is `uikit/`. **21 of the 49
non-story `.tsx` files in `uikit/` have zero non-story JSX users, and 15 of those are kept alive by
exactly one caller — their own story.** So the removal ledger's `React faces on converted UIKit
components` row has been stating the wrong unblock condition since C1 created it: **Epic E finishing
does not free them**, because Epic E cannot remove a story. The row is corrected below. That is the
ledger's own stated failure mode arriving on schedule — *"a component whose last consumer is gone
still compiles, and nothing but this list notices"* — except the list was what was wrong.

It is also the first single-armed contract in the programme. Every earlier one had a vanilla arm
built beside it before the React arm died (`EditorModule.View`, the secondary-view registry's arm,
`SlotContent`'s `Node` arm, `TreeItemProps.label`'s `| Node`); `Story` has none, so E11 builds the arm
before anything can convert.

**Two measurement corrections carried forward, both of the same shape — an extension is not a
measurement.** First, this document's claim that *"two of C1's stories are vanilla-only `.story.ts`
files (`Checkbox`, `Label`)"* is **wrong**: both import the React face and cast it in
(`component: Checkbox as any`). They are React stories that happen to hold no JSX, so there was no
vanilla precedent to copy — and the `as any` is the contract refusing a value that does not fit,
silenced. Second, and larger: **64 of the 70 non-story `.tsx` files in `uikit/` contain no JSX at
all.** Only `WithMenu`, `Panel`, `Text`, `shared/mount`, `Dialog/DialogView` and `Popover/PopoverView`
do, five of them with a single tag. Every `.tsx`-count in this programme's history therefore
overstates the JSX surface, in `uikit/` by an order of magnitude.

**E11 also retires E10's roots arithmetic.** E10 closed reporting 3 roots and 0 slot markers, with the
rule *"roots = 1 per open React-arm editor + 1 for `GlobalStyles`, so one conversion moves the count
by exactly 1."* The same instrument on a live eight-page session reads **16 and 5**, and the DOM says
why: six of the roots sit *inside* a React editor's own root, at `editor-toolbar`, `url-input` and
`webview-area`. The mechanism is the two-way boundary composing in both directions at once — a React
editor renders a converted uikit face, `mountVanilla` puts a native view inside the React tree, and
that view's `fillSlot` React arm calls `mountReactHandle`, **nesting a React root inside a React
root**. So an editor's cost is 1 + one per element-valued slot fill in its tree; the browser editor
alone is four to seven. E10 measured 3 because its session had no browser page open.

The consequence is a standing correction to Rule 4's instrument: **the root count is not
monotonically decreasing in this programme.** Converting a `uikit/` component *raises* it for every
un-converted editor that passes that component element children, and only the editor's own conversion
brings it down. A rising count mid-programme is expected, not a regression — E9 saw the local form and
recorded a 4–5 mid-epic peak; this is the same effect across the whole tree. And a roots figure
without the open-page list is not a measurement: "3" and "16" are both true of the same build.
Sixth instance of *a forward-looking note is a measurement with a date on it*, and the first where
re-measuring **promoted** a deferred candidate instead of rejecting one. The next free epic number is
**EPIC-070**.

**E11 is complete as [EPIC-069](epics/completed.md) (2026-08-27)** — all ten tasks reviewed.
`Story.component` goes from **44 callers to 2** (`Panel`, `Text`, permanently, since neither has a
vanilla twin by C1's decision); `.story.tsx` 43 → **2**; the Storybook editor's six `.tsx` → **0**;
`uikit/` non-story `.tsx` 70 → **51**; renderer non-story `.tsx` 187 → **162**; and all **45** stories
render with zero failures, verified against a pre-conversion DOM baseline rather than on report.

**Its headline prediction was wrong, and that is the finding.** It expected "≥15 `uikit/` React faces
deleted" and deleted **2**, because a face file is *also* its props-type module — `Menu.tsx` has 28
type importers, `Dialog.tsx` 16. So **20 of 49 React components were removed as dead code** while only
2 files could go; 17 became type-only modules renamed `.ts`. **Deleting a React face is a
type-relocation job, not a deletion**, and the removal ledger now carries the three-way split
(3 free / 17 type-only / 29 still-live) with importer counts so Epic F inherits it.

**Three measurement lessons, all one shape: the proxy is not the measurement.** The `.tsx` extension
overstated the surface (**64 of 70** non-story `.tsx` in `uikit/` hold no JSX); the import list gave
"45 stories" by counting the `Story` *type* import when the registry held **44**, plus an orphan
(`SelectableRow.story.tsx`, written in C1 and never registered — so §Epic C's "42 of 44 have a story"
was overstated by one); and the JSX tag count classified **35 demo-wrapper stories as mechanical**,
because they render story-local React wrappers, several built with `React.createElement` and therefore
tagless. That last one turned "point 35 stories at a view" into "rewrite 35 wrappers as
`VanillaView`s" and forced a mid-epic re-cut by wrapper complexity.

**Four findings outlast the epic.** First, **a DOM baseline is the only instrument that sees a silent
conversion regression**: it caught three in the first batch — `spacer` rendering nothing visible at all
— with `tsc`, ESLint and `build-prod` green, in the same task whose summary reported three *different*
stories as blocked. Hence the standing rule: *a report of what could not be done is not evidence about
what was done.* Second, **the verification path must be the real one** — duplicating `LivePreview`'s
prop preparation to run the comparison produced a false regression report, fixed by exporting
`prepareStoryProps()` so the harness and the editor share one definition. Third, **converting a
harness has a payoff beyond the contract**: the stories became `uikit/`'s first non-React consumer and
immediately surfaced **six under-declared public props** (`CollapsiblePanelStack.buttons`,
`DialogContent.headerButtons`, `Tree`/`ListBox.renderItem`, `ListBox`/`Autocomplete.emptyMessage`), all
consumed by `fillSlot` — which already accepted `Node` — yet declared `ReactNode` only. Fourth, and
correcting E10: **touching the importer clears a stale `.tsx` → `.ts` rename only for a static
import**; a module reached through a **dynamic** `import()` needs the dev server restarted, and a
frozen `?t=` timestamp in the error is how to tell the two apart.

**It also found three unreleased bugs, two of them live crashes**, and together they name a missing
guard rather than a run of mistakes. `NotificationView`'s constructor touched a child field before
`onMount()` created it, so **no toast or alert in the app could render** (EPIC-066); `BlockingBranchView`
did the same, so **the blocking progress overlay could not render**, and `ProgressPillView` leaked a
spinner created in its constructor (both EPIC-055, on the branch since 2026-08-21, surfaced by the
close review). That is **four violations of one rule across three epics** — *the constructor must not
create or touch child DOM* (`uikit/CLAUDE.md`) — and none was catchable: `private x: T | undefined`
makes the constructor compile and the failure is a runtime `TypeError` on a path no gate or story
exercises. **Guard it mechanically before the next conversion epic** (US-1131), because every epic
remaining in this programme writes new `VanillaView` subclasses.

**Two cuts were measured and rejected, and both are recorded so E12 does not re-derive them.** The
*form-and-panel editors* — `settings` (820 lines, 248 JSX tags), `mcp-inspector` (1,642 / 171),
`mneme-config` (586 / 97), `mneme-root` (284 / 26), `about` (240 / 31), `tools-hub` (269 / 37) — are
the safest large group left in `editors/` (no webview, Monaco, canvas or floating-ui) and take the
`Component` arm 9 → 3. They lost because they close by shrinking a number, and because the three
uikit faces they appeared to strand (`DateInput`, `ProgressBar`, `TagsInput`) each keep one caller:
their own story. **Chasing that discrepancy is what found E11's contract**, so the rejected cut earned
its keep. The *last two `editors/base` chrome files* — `browser` + `mcp-inspector` + `mneme-config` +
`board`, 4,597 lines, closing by deleting `EditorToolbar.ts` and `ContentHostFooter.ts` at zero
callers — lost because E10 had already measured all three chrome files as **nominal** pure
`mountVanilla` shims (re-verified by reading them), and because it concentrates every remaining hard
hazard in one epic: two `<webview>` elements destroyed by reparenting, the last `@floating-ui/react`
importer (`BrowserTabsPanel.tsx:2`), and the board trust flow.

**E3 also withdrew its own Rule 4 number**, which is worth reading (EPIC-061 E3-6): a measured
Monaco-churn figure in the notebook was attributed to a React `key` and turned out to be
the former measured React grid wrapper unmounting off-screen rows — `renderInfo.ts:314` keys
virtualized cells by row index. The churn is real and its baseline is recorded; E4 replaced that
wrapper with `VirtualFlexGridView`. That is the second time this
programme mis-attributed a Rule 4 measurement to the component about to be changed (EPIC-060 read
page-manager slot duplication as md-view rendering twice), so the lesson is recorded there as a
standing check: **a before/after measurement is not evidence about a cause until the cause has been
located in source.**

**E2's scoping supersedes the "one editor per task, in any order" sketch below** — see
[EPIC-060 E2-1](epics/EPIC-060.md#e2-1--the-epic-is-defined-by-the-contract-it-deletes-not-the-editors-it-converts).
Line count is the wrong axis for the first conversion epic. Grouping the editors by the *shared
contract* they provide lets an epic close by deleting a registry type rather than by shrinking a
number, and a contract that survives is one every later epic must keep satisfying. E2 therefore takes
the five `EditorModule.Body` providers (`grid`, `html`, `markdown`, `svg`, and E1's already-converted
`mermaid`), which also front-loads the `hast → DOM` renderer that three editors block on. Later
conversion epics should be scoped the same way where a shared contract exists, and by line count only
where none does.

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

#### Split, and what the E1 measurement changed *(EPIC-059, 2026-08-24)*

Re-measured at epic open: **180 `.tsx` files, 28,640 lines** — +1.5% on the inherited figure, the
fourth of this programme's inherited numbers to survive. Four things change the sketch above.

**First, "open-ended by design" was wrong about the foundations, and Epic E is split.** The editors
are independent of *each other* and jointly dependent on four shared seams, **none of which exists**:
`EditorModule.Component`/`Body` and the secondary-view registry are typed `React.ComponentType`,
`ui/app/AsyncEditorView.ts` creates a React root unconditionally, `<TextChrome>` wraps 25 editors as
JSX, and 12 editors render Monaco through the React lifecycle wrapper. `editors/` holds **zero**
`VanillaView` references and no `mountVanilla`/`mountReact` call — a vanilla editor written today
could not be registered, and if registered could not be mounted. EPIC-059 is therefore **E1 —
foundations**, and editor conversions land in later epics scoped when each opens (EPIC-059 E1-1). The
suggested pilot order survives inside E1: `image`, `compare` and `mermaid` are converted there as the
proving consumers of the seams they exercise (E1-2).

**Second, `@monaco-editor/react`'s "trivial" is measurable and even smaller than stated**: 18
importers at epic open, of which **12** used the `Editor`/`DiffEditor` component, 5 imported the
`Monaco` *type*, and 1 called `loader`. After E1-3, 11 wrapper consumers remained. The replacement
is a control inversion, not a swap, making it the programme's **third documented Rule 2 exception**
after C3-1 and C4-2 (E1-3).

**Closed by E3 ([EPIC-061](epics/EPIC-061.md), 2026-08-24.)** The 13 remaining mount points were
converted onto two hosts — `editors/shared/MonacoEditorHostView.ts` for `monaco.editor.create` and
E1's `MonacoDiffEditorHostView.ts` for `createDiffEditor` — `loader.config({ monaco })` was deleted
from `configure-monaco.ts`, and the package was **uninstalled**. `monaco-editor` and
`vite-plugin-monaco-editor-esm` stay. The CDN-fallback hazard the `loader.config` guarded against was
a property of the wrapper, not of Monaco: with no wrapper, nothing consults the loader, verified live
after removal by TypeScript plus both custom languages (`mermaid`, `log`) still tokenizing.

**Third, §3.6's "already in `node_modules`" is true but incomplete**: **EPIC-060 promotes**
`unified`, `remark-parse`, `remark-rehype`, and `property-information` to direct dependencies for
the native walker. In `src/`, `react-markdown` now has no importer, while
`hast-util-to-jsx-runtime` has no importer outside the one explanatory comment in
`markdown/hast-dom.ts`. Both packages remain installed and are collectable in Epic F.

**Fourth, Epic P's state lifting never reached the long tail — and does not need its own epic.**
`editors/` holds **107 `useState`**, 153 `useEffect` and 148 `useRef` — against Epic D's 7 in a
comparable folder. The three files Epic P named are done; nothing else was scheduled. That residue is
absorbed by each editor's own conversion rather than deferred (EPIC-059 E1-7, user decision
2026-08-24): a vanilla view has no render function for state to live in, so the lift and the
translation are one edit, and Epic F is removal work that could not absorb view state anyway. Epic D
is the precedent — it took the shell from 7 `useState` to 1, and that one is a surviving React face.
The count is a *sizing* input for grouping editors into later epics, not a task generator. It is
flat, too (worst file: 4), so it is a per-editor cost rather than an excavation. `forwardRef`,
`useImperativeHandle` and React contexts are all at **0**, and Emotion never entered `editors/` at
all — so Epic A is not a prerequisite for any editor and Epic F's Emotion uninstall does not wait on
Epic E.

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
| `uikit/Panel/` (the React `Panel.tsx` face) | App-facing styling sugar with 716 JSX tags, 636 of them in `editors/`. C1's "no vanilla twin" no longer holds: `Panel/panel-style.ts` exports `createPanelElement`, used at 84 sites after Epic D, so what survives is the React face, not the concept (EPIC-059 finding 6) | Epic E converts the remaining editor call sites; two shell header wrappers remain deliberately for pointer-event behavior | C1 / EPIC-054 |
| React faces on converted UIKit components (`Component.tsx` → `mountVanilla`) | Scaffolding that keeps call sites working mid-migration (open decision #3) | **This row stated the wrong precondition from C1 until E11 measured it.** It read "Epic E finishes", which is false: **21 of the 49 faces already have zero non-story JSX users, and 15 of those are held by exactly one caller — their own `.story.tsx`**, which Epic E cannot touch. The real condition is *both* blockers falling: the application's JSX call sites (Epic E) **and** the `Story.component: React.ComponentType` contract (E11 / [EPIC-069](epics/EPIC-069.md)). E11 frees the harness half and deletes every face that reaches zero | C1 onward |
| `Story.component: React.ComponentType` for `Panel` and `Text` | Both are real React implementations with **no vanilla twin, by C1's explicit decision** — vanilla views write plain elements with semantic classes instead — so their stories cannot point at a `VanillaViewCtor`. Inventing a `PanelView` to close E11 would be the "accidentally writing a worse React" failure Epic B warned about. Their stories are also the last regression net those two files have | `Panel.tsx` and `Text.tsx` die with the wrappers in Epic F; the arm and both stories go with them | E11 / EPIC-069 |
| `WithMenu`'s render-prop face | 14 call sites; a render prop has no vanilla equivalent, so `openMenu` was added underneath it (EPIC-055 C2-5) | Its call sites use `openMenu` directly | C2 / EPIC-055 |
| `renderIcon`'s `ReactNode` arm (`IconRef = IconName \| ReactNode`) | Epic P's D3 compromise | Already scheduled above — the arm is deleted with the wrappers | Epic P |
| `uikit/shared/highlight.ts` React form | Two editor consumers still use it: GraphBody and LinkCategoryPanel (EPIC-056 C3-7) | The remaining editor consumers use the DOM form; the React form can be removed when those two boundaries convert | C3 / EPIC-056 |
| `editors/base` chrome (`TextChrome`, `PageToolbar`, `EditorToolbar`, `ContentHostFooter`) | Every one of them exists to be extended by the editor inside it, so all four carry React subtree slots (`TextChrome` has four). Converting them ahead of their call sites would create **up to six React roots per open editor against one today** — worse on Rule 4's own metric, for no gain, since the slot contents are the same React trees either way (EPIC-059 E1-8) | **Split by E9 ([EPIC-067](epics/completed.md)), and `TextChrome` is now collected.** `TextChrome` was deleted there — its 14 call sites convert and the file is deleted. The other three are **not**: **`PageToolbar` is now collected too, by E10 ([EPIC-068](epics/EPIC-068.md)).** It had 6 direct callers (`archive`, `board-info`, `category`, `git-tree`, `image`, `video`) — **plus a seventh caller of the same module through its `SwitchWidget` export, `editors/board/BoardToolbar.tsx:160`, which this row originally missed**; that site now calls `mountVanilla(SwitchWidgetView, { model })` directly, so the module was deleted at 0 callers without converting `board`. Two remain: `EditorToolbar` 3 (`browser`, `mcp-inspector`, `mneme-config`) and `ContentHostFooter` 1 (`board`), each keeping a React face until its own editor converts. E1-8's "so the conversion is free" still does not survive the measurement: the React faces feed native views through `fillSlot`, costing those 4 editors +1..2 roots each. E1-8's "so the conversion is free" does not survive the measurement: the React faces feed native views through `fillSlot`, costing those 10 editors +1..2 roots each against −2 on each of the 14 | E1 / EPIC-059 |
| `EditorErrorBoundary` React class component | Descendant render failures in the still-React editor subtree require a React error boundary; `window.onerror` and a `try/catch` around `mountReact` are not equivalents | Epic E converts the last React editor subtree it protects | Epic D |

| **US-1128 correction: the collected React component half of converted UIKit faces** | E11 removed the Storybook contract blocker, but the face file usually remains the live props-type module. The measurement is **3 free face candidates / 17 dead-component-live-types / 29 still-live** among the 49 non-story, non-`*View` `.tsx` files. The 3 candidates are `MultiSelect`, `AlertsBar`, and `PathInput`; `AlertsBar.tsx` is retained because `src/renderer/index.tsx` imports its live `AlertsBarView` (and the module also owns `alertsBarModel`). | With both blockers gone — application JSX callers and `Story.component` — the React component is dead, but deleting its file is usually a **type-relocation** job. The 17 type-only faces and type-importer counts are: `Menu` (28), `Dialog` (16), `ImageViewport` (6), `CategoryList` (5), `MultiListBox` (4), `RadioGroup` (4), `Label` (3), `Minimap` (3), `Toolbar` (3), `AlertItem` (2), `DialogContent` (2), `Notification` (2), `SplitButton` (2), `ListBox/SectionItem` (2), `Tree/SectionItem` (2), `CollapsiblePanelStack` (1), and `ProgressOverlay` (1). | US-1128 / E11 |

#### Collected or collectable after the editor-body conversion

| Item | State | Removal owner |
|---|---|---|
| `EditorModule.Body` React arm and its registry normalization shim | **Collected.** All five embeddable bodies expose `BodyView`; notebook dispatch mounts that view directly. | Done in the editor conversion epic |
| `@monaco-editor/react` | **Collected — uninstalled in [EPIC-061](epics/EPIC-061.md).** Zero importers in `src/`, `loader.config({ monaco })` deleted from `configure-monaco.ts`, package removed from `package.json`. Collected in the epic that freed it rather than deferred to Epic F, per this section's own note. | Done in E3 |
| `react-markdown` and `hast-util-to-jsx-runtime` application importers | **Collectable in Epic F.** Neither has an application importer now; `hast-util-to-jsx-runtime` remains only in one explanatory source comment. The npm packages are still installed. | Epic F |

**The former React grid entries were collected in E4**, the epic that freed them, rather than
deferred to a cleanup epic that would have had to re-establish why they existed.

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

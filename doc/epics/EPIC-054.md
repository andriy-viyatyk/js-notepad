# EPIC-054: De-React Epic C1 — Foundation and primitives

## Status

**Status:** Active
**Created:** 2026-08-19
**Completed:** —

## Overview

The first of four epics that together make up the [de-React roadmap](../de-react.md)'s Epic C
("UIKit conversion"). Epic C was measured at scheduling time and **split four ways** — the roadmap
records the split and the reasoning; this doc is C1.

C1 is `uikit/`'s foundation: the twenty components at or near the bottom of the library's own
dependency graph, converted to vanilla behind unchanged React-facing signatures. Epic B converted
one component; C1 converts eighteen and settles two as legacy shims.

It also carries the groundwork the other three epics spend without re-deciding: the Emotion-to-CSS
contract, the subtree-slot answer Epic P deferred (EPIC-051 D4), the DOM icon path, the
React-compatibility helpers every conversion needs (`...rest`, `ref`, synthetic events), and
roadmap Rule 6's leak closure.

## What the investigation at epic open established

The roadmap's Epic C section has since been **rewritten** to carry these findings, so this table
is the record of what changed and why — not a list of text still to be found in `de-react.md`.
Each row states the original assumption and what measurement showed.

| Original assumption | What measurement showed |
|---|---|
| Epic C's candidate ordering grouped `Panel` with the containers (`Toolbar`, `Splitter`, `CollapsiblePanelStack`), implying UIKit is built on it | **`Panel` is app-facing sugar, not a UIKit building block.** Of its **716** production JSX tags, **636 are in `editors/`** and 74 in `ui/` + `components/`, against **6 inside `uikit/`** (in four components, all C2). It gets no vanilla face — see C1-1. |
| "converted **leaf-first**", implying a deep chain to unwind | **The production graph is shallow and wide.** **15 of C1's 20 components import no other `uikit/` component.** The entire internal structure is three edges: `Text ← Label`, `Tooltip ← {Button, IconButton, TruncatedText}`, `Button ← SegmentedControl`. (Sixteen of the twenty do import `../tokens` or `../shared/slots`; only `Divider`, `Dot`, `Spacer` and `Spinner` import nothing from `uikit/` at all.) |
| "Move Popover / Menu / Tooltip to `@floating-ui/dom` and **delete `react-tooltip`**" | **`react-tooltip` has zero importers** — dead code in `package.json`, an uninstall rather than a migration. **`@floating-ui/react` has 6 importers, not 4**: the three `uikit/` files plus `Menu/WithMenu.tsx`, and also `editors/browser/BrowserTabsPanel.tsx` and `ui/dialogs/poppers/showPopupMenu.tsx`. The dependency therefore **survives C2** and leaves with Epics D and E. |
| Epic A would convert Emotion to CSS | **Epic A made CSS variables available and converted no Emotion.** `uikit/` still has **53** Emotion files, 18 in C1 scope (**76** production files renderer-wide). Every Epic C conversion carries an Emotion-to-CSS step; C1 extends the contract Epic A began. |
| Epic D owns "icon set from `.tsx` components to a sprite or inline-SVG helper" | **The icon conversion is a C1 prerequisite and moves here.** `renderIcon()` returns a `ReactNode` built from `getIcon(name)`, a React component (`uikit/shared/slots.ts:17`). `IconButton` is *nothing but* an icon. Leaving icons in Epic D would put a React root inside every icon in the app. See C1-6. |
| Epic P item 1 ("neutral slots") "must be finished before Epic C" | **Finished for icons and text; subtree slots were deferred *to* Epic C** by EPIC-051 D4. C1 owns the answer (C1-4). |

## The surface, measured

All figures re-measured 2026-08-19 with comment-stripped, story-excluded scans. See the
measurement note below.

| Item | Measure |
|---|---|
| C1 components | **20** — `Tooltip`, `Button`, `IconButton`, `TruncatedText`, `SegmentedControl`, `Input`, `Textarea`, `Checkbox`, `Slider`, `RadioGroup`, `Tag`, `Label`, `Divider`, `Dot`, `Spacer`, `Spinner`, `ProgressBar`, `SelectableRow`, `Panel`, `Text` |
| C1 lines | **3,209** (`uikit/` production is 162 files / 22,164 lines — the roadmap §2 figure of 101 files / 14,671 lines is not reproducible and should not be used as a denominator) |
| Internal dependencies | Three edges only: `Text ← Label`, `Tooltip ← {Button, IconButton, TruncatedText}`, `Button ← SegmentedControl`. **15 of 20 import no other `uikit/` component** |
| External references | `Button` 298 · `IconButton` 231 · `Input` 86 · `Tooltip` 20 |
| `Panel` production JSX tags | **716** — `editors/` 636, `ui/` 63, `components/` 11, **`uikit/` 6** (+72 in stories) |
| `Panel` tags needing a per-instance scalar | **43.2%** of production tags (`width`, `height`, `minWidth`, `minHeight`, `maxWidth`, `maxHeight`, inset/offsets, `zIndex`, non-bare `flex`) |
| `PanelProps` declared props | **52** |
| Emotion importers in C1 | **18** (of 53 in `uikit/` production, 76 renderer-wide) |
| Local `useState` in C1 | **2 files** — `Tooltip.tsx`, `TruncatedText.tsx` |
| `TComponentModel` models in C1 | **0** |
| `effect()` call sites in C1 | **0.** EPIC-053 B13's effect-shedding is a no-op here |
| `ReactNode`/`ReactElement` **prop declarations** in C1 | **9** — `Input` 2, `SegmentedControl` 2, `Tooltip` 2, `Panel` 1, `SelectableRow` 1, `TruncatedText` 1 (a raw grep returns 12; three are comments or internal types) |
| C1 components rendering `{children}` | **8** — `Panel`, `Text`, `Label`, `Checkbox`, `SelectableRow`, `Tag`, `Button`, `TruncatedText`. **This is a slot surface** (C1-4) |
| C1 components spreading `...rest` | **16** — every one carries arbitrary handler, `aria-*` and `data-*` props (C1-10) |
| C1 components declaring `ref?: React.Ref` | **6** — `Panel`, `SelectableRow`, `Input`, `Button`, `IconButton`, `Tooltip` (C1-10) |
| `renderIcon` consumers in C1 | **5** — `Button`, `IconButton`, `Checkbox`, `RadioGroup`, `Tag` |
| Story coverage | **19 of 20.** `SelectableRow` is the only C1 component with no story |
| Icon set | **116** registry entries in `theme/icon-registry.ts`; `theme/icons.tsx` 1,599 lines; two factories (`createIcon`, `createIconWithViewBox`) |
| `react-tooltip` importers | **0**, anywhere in the tree |
| Rule 6 violations | **5** today; **1** after this epic (the survivor dies with AVGrid in C4) |

**The numbers that shape the epic.** Zero models and zero effects means Epic B's model driver
(`createComponentModelDriver`, US-988) is **not used anywhere in C1**. And 18 Emotion files against
20 components means the styling conversion, not the rendering conversion, is the bulk of the work.

> **Measurement note.** Two earlier drafts of this document carried numbers that did not survive
> audit. The first was built on a `grep -rhno` dependency map that strips filenames, so its
> `.story.` exclusion silently matched nothing and **story files counted as production
> dependencies** — producing a phantom `Button` ↔ `Tooltip` cycle (it was `Tooltip.story.tsx`
> importing `Button`) and a claim that `Panel` was the library's floor. The second understated the
> slot surface by omitting `children`, and miscounted the icon registry, the `@floating-ui/react`
> importers and the `renderIcon` consumers. **Every figure above was re-derived by an independent
> pass that strips comments and excludes stories explicitly.** Treat a number in this document as
> checkable, and re-check it rather than inheriting it.

## Decisions

**C1-1 — `Panel` and `Text` keep their React faces and gain no vanilla component API. Vanilla
views write their own DOM with their own semantic classes.** *(User decision, 2026-08-19.)*

`Panel` has no behaviour. No state, no effects, no listeners; it does nothing with `children` but
pass them through. Its body computes `data-*` attributes and an inline style object from 52 props.
It exists because in React a component is the only unit of styling reuse, so shared container
styling *had* to become one.

In vanilla that constraint does not exist — a CSS class is a unit of styling reuse. A
`createPanel(props)` factory would import the utility-props idiom into vanilla code where it buys
nothing, and would have almost no callers: **only 6 of `Panel`'s 716 production tags are inside
`uikit/`**, in four C2 components. It would sit unused for the entire epic.

**The pattern vanilla views use instead is VSCode's**, which has no `Panel` equivalent anywhere in
it: a widget builds plain elements, gives them **semantic** class names (`.monaco-list-row`,
`.pane-header`, `.monaco-split-view2`), and puts its layout rules in its own `.css` file. Anything
computed per-instance is written straight to `element.style` by the code that computes it.

The call-site data supports the same split. A utility-class vocabulary cannot replace `Panel` even
in principle: **43.2% of its production tags need a per-instance scalar**, so classes alone cannot
express the call sites, and classes-plus-inline-styles is the same two mechanisms with a new
vocabulary to learn — bought for code with a scheduled deletion date, which roadmap open decision
#3 already rules out.

Concretely:

- **`Panel`**: Emotion becomes `Panel.css`; the React face is otherwise untouched; **no vanilla API
  is exported.** It becomes an explicitly legacy, app-facing shim whose call sites drain as Epics D
  and E convert `editors/` and `ui/`, and which Epic F deletes.
- **`Text`**: same, plus `Text.css` and a small helper mapping `TextStyleProps` to the `data-*`
  attributes that stylesheet keys on — because `Label` is converted and needs them. **No
  `createText()` factory**; the reuse is the stylesheet.
- **The four C2 components that use `Panel`** (`Autocomplete`, `Notification`, `Progress`,
  `Toolbar`) stop using it when they convert, writing their own DOM. Recorded here so C2 does not
  go looking for a vanilla `Panel`.

**C1-2 — Nothing in this epic changes a React call site.** Every C1 component keeps its exact
current props, its exact `data-*` output, its exact DOM shape, and its exact class names. This is
roadmap Rule 2. `Panel` keeps emitting `.scroll-container` (consumed by
`theme/GlobalStyles.tsx:121,126`), every `data-type` / `data-name` / state attribute is preserved
per [ui-element-contract.md](../architecture/ui-element-contract.md), and no prop is renamed,
widened, or removed. API cleanup is Epic F's, per roadmap open decision #3.

**C1-3 — Every converted component gets a `VanillaView` subclass and a `mountVanilla` React face.**
*(Revised 2026-08-19 after audit.)*

An earlier draft split C1 into "`VanillaView` subclasses" and "plain build functions" for the
stateless leaves. That was wrong on three counts, and the audit is the reason it changed:

- **There is no such thing as a listener-free C1 component.** **16 of 20 spread `...rest`**, which
  carries `onClick`, `onKeyDown`, `onContextMenu` and arbitrary `aria-*`/`data-*` from the caller.
  Honouring that behind an unchanged signature requires listener bookkeeping (C1-10), so the
  disposal registry is needed everywhere.
- **A build function cannot occupy `Story.component`**, which is typed `React.ComponentType<P>`
  (`storyTypes.ts`) and rendered at `LivePreview.tsx:66`. 19 of 20 components have a story, and the
  stories are this epic's verification surface.
- **It contradicted C1-2 and the Goals.** A bare build function is not a React component, so those
  eight components would either lose their signature or not be converted at all.

So the shape is uniform, and it is the shape `PathInput` already demonstrates: `XView extends
VanillaView<XProps>` in `XView.tsx`, a React face in `X.tsx` that is a one-line
`mountVanilla(XView, props)`, and `X.css` beside them. `Panel` and `Text` are the only exceptions
(C1-1) and are the only two components that keep a hand-written JSX body.

What *does* vary is whether a view needs `bind` at all: with zero models and zero state in 18 of
the 20 components, most views have no subscription and update purely through `onUpdate(props)`.

**C1-4 — The subtree-slot answer (roadmap Epic P, EPIC-051 D4).** Epic P converted icon props to
`IconRef` and text props to strings, and deferred **subtree** props to Epic C. C1 owns the answer.

```ts
// uikit/shared/slots.ts
export type SlotContent = string | Node | ReactNode;

/** Fill `host` with `slot`. Returns a disposer; call it before refilling or discarding `host`. */
export function fillSlot(host: HTMLElement, slot: SlotContent): () => void;
```

`fillSlot` dispatches on the runtime value: a `string` sets `textContent`; a DOM `Node` is adopted;
anything else is a React node and goes through `mountReact`, returning its disposer.

**There is deliberately no `IconRef` arm.** `IconName` is a `string`, so `fillSlot("close")` could
not tell the icon from the literal word. Epic P's `IconRef` escapes this only because it is used on
props *named* `icon`. Icons reach a slot as a `Node` via `createIconElement` (C1-6). At the type
level the union collapses to `Node | ReactNode`; the arms name `fillSlot`'s dispatch order, not
three distinct static types.

**`children` is a slot, and it is the largest one.** Eight C1 components render `{children}` —
`Button` (298 external call sites), `Text`, `Panel`, `Tag`, `Label`, `TruncatedText`,
`SelectableRow`, `Checkbox`. A converted view must fill that region, so `children` routes through
`fillSlot` exactly like a named slot. **The string fast path is what makes this affordable**: the
overwhelmingly common case is `<Button>Save</Button>`, which is a `textContent` write and involves
no React at all. Only a call site passing JSX children costs a root.

**The named-slot surface, production only:** `endSlot` 12 · `content` 18 · `buttons` 6 ·
`trailing` 5 · `startSlot` 2 · `extraElement` 2 · `extraElementTop` 1 — **46 call sites**.
`headerButtons`, `headerAction`, `header` and `separatorContent` have **no production callers**,
but each has one or two **story** callers, which must keep compiling and rendering and are served
by the `ReactNode` arm.

**The React arm is accepted as transitional.** *(User decision, 2026-08-19.)* A `mountReact` root
inside a converted component is the same bridge tax the US-991 pilot paid. It preserves Rule 2 at
every unmigrated call site, it exists only while a slot is non-empty, and roadmap open decision #3
schedules the arm's deletion in Epic F. The alternative — a strict `string | Node` — would force
call sites in `editors/` and `components/` to hand-build DOM and pass it into React code, which is
a worse shape than the tax it avoids, and those files convert in Epics D and E anyway.

**C1-5 — `Tooltip` becomes attachment-based, and adopts `@floating-ui/dom`.** Today `Tooltip` takes
`children: React.ReactElement` and `cloneElement`s it to inject a ref and handlers. `cloneElement`
has no vanilla equivalent, and it forces every consumer to *compose* a `Tooltip` element around
itself — which is why `Button.tsx:179` wraps its own output when `title` is set, and why
`IconButton` and `TruncatedText` do the same.

```ts
// uikit/Tooltip/attach-tooltip.ts
export interface TooltipOptions {
    content: SlotContent;          // was ReactNode
    placement?: Placement;          // @floating-ui/dom Placement, default "top"
    offset?: [number, number];      // default [0, 8]
    delayShow?: number;             // default 800
    delayHide?: number;             // default 100
    disabled?: boolean;
    name?: string;                  // data-name on the floating root
}
export function attachTooltip(trigger: Element, options: TooltipOptions): {
    update(options: TooltipOptions): void;
    dispose(): void;
};
```

`Button`'s view calls `attachTooltip(this.root, { content: title })` instead of wrapping itself.
**The React `<Tooltip>` face keeps `cloneElement` and its ref**, and calls `attachTooltip` from a
`useEffect` once it has the trigger node — its signature and its 20 external call sites do not move.
`content` becomes `SlotContent`, so a string tooltip involves no React on either face.

Two things make this cheaper than it sounds. `tooltipRegistry.ts` and `overlayLayer.ts` are
**already completely framework-free** (`overlayLayer.ts:9` says it "remains available for future
non-React views"), so singleton coordination, drag suppression and the portal host carry over
untouched. And `Tooltip` is the simplest floating consumer in the library — no focus management, no
interactive content, no keyboard navigation. **That is why the `@floating-ui/dom` adoption starts
here** rather than in C2, where `Popover`, `Menu` and `Dialog` have all three.

Note `@floating-ui/react` is **not** removed by C2: `editors/browser/BrowserTabsPanel.tsx` and
`ui/dialogs/poppers/showPopupMenu.tsx` also import it, and they convert in Epics E and D.

**C1-6 — The icon bodies are rewritten as static markup; the factories build both faces.**
*(User decision, 2026-08-19, replacing a mechanism that did not work.)*

An earlier draft claimed "the seam is the factory, not the 116 icon bodies". That is false:
`createIconWithViewBox = (viewBox) => (icon: ReactNode) => …` receives an **already-constructed
`ReactNode`** (`<g><rect/></g>`), and there is no way to get SVG DOM out of a `ReactNode` without
rendering it through React.

So the bodies change. Each icon's JSX body becomes a **static markup string**, and the factory
produces both faces from it:

```ts
export const CloseIcon = createIcon(24)(`
    <g stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <line x1="17" y1="7" x2="7" y2="17"/>
        <line x1="7" y1="7" x2="17" y2="17"/>
    </g>
`);
// React face:   <svg …><g dangerouslySetInnerHTML={{ __html: body }}/></svg>  (or equivalent)
// Vanilla face: svg.innerHTML = body
```

This is **static, code-owned markup with no interpolated runtime data**, which is exactly what
roadmap open decision #2 sanctions (`de-react.md` §3.4 and the decision table). Note the roadmap's
phrase "available but not the default" belongs to the `<template>` + `cloneNode` mechanism, not to
this one — the sanction for `innerHTML` is stated separately and directly.

The conversion is mechanical and should be done by a codemod over `theme/icons.tsx`, not by hand:
JSX attribute names become their SVG equivalents (`strokeWidth` → `stroke-width`, `fillRule` →
`fill-rule`, `clipPath` → `clip-path`), and `{/* comments */}` are dropped. **This makes US-997 the
largest task in the epic**, and it is scoped accordingly.

Two details the task must settle. `icon-registry.ts` has **116** entries; `getIcon(name)` must
resolve to both faces, and the task states what happens for a name with no builder. And
`IconRef = IconName | ReactNode` still has its `ReactNode` arm — `icon={<CloseIcon/>}` appears
widely — so a converted component receiving that arm falls through to `fillSlot` (C1-4) exactly
like any other slot. `language-icons.tsx` (641 lines) has no C1 consumer and is out of scope.

**C1-7 — Emotion leaves a component when that component is converted; `uikit/CLAUDE.md` Rule 7 is
amended, not deleted.** Rule 7 currently reads "No Emotion outside UIKit". Through Epics C–E it
becomes "No Emotion" outright, but the transition is per-component, so both worlds coexist and the
rule must say which is which.

The contract already exists in part — Epic A defined the cascade (`@layer base, uikit, app, editor`,
[coding-style.md](../standards/coding-style.md)) and both converted stylesheets follow it. C1
**extends** it rather than inventing it:

- one `ComponentName.css` per component, imported from the file that owns the DOM;
- **wrapped in `@layer uikit { … }`** — as `PathInput.css:1` and `Spinner.css:1` already are;
- selectors keyed on the same `data-*` attributes the Emotion rules use today;
- every colour and token read as a `var(--*)` reference with a fallback.

**Shared style fragments get a shared stylesheet.** `uikit/shared/selection-style.ts` is an Emotion
module consumed by `SelectableRow` (C1), `CategoryList` (C2), `ListBox/ListItem` and `Tree/TreeItem`
(C3), and `ui/sidebar/FolderItem` (Epic D), and `uikit/CLAUDE.md` documents it as a mandatory shared
contract. Duplicating its rules into `SelectableRow.css` would let the copies drift across three
epics. It becomes `uikit/shared/selection-style.css` in `@layer uikit`, keyed on the same
attributes, imported by each consumer; the Emotion export stays until its last React consumer
converts.

**C1-8 — The measured number (roadmap Rule 4).** DOM writes for one named interaction — **one hover
that opens a `Button`'s tooltip** — counted with the `MutationObserver` method EPIC-053
established, on the React implementation before conversion and the vanilla one after.

**The observer must cover the overlay layer, not just the preview pane.** `Tooltip` renders through
`ReactDOM.createPortal(…, getOverlayLayer())`, and `overlayLayer.ts:31` appends that layer to
`document.body` — so the tooltip's DOM is **outside** `[data-type="live-preview"]`. An observer
scoped to the pane alone would count approximately nothing, before and after. Observe both
`[data-type="live-preview"]` and `#persephone-overlay-layer`, with identical options, reset point
and interaction on both runs.

**Two tasks own this number.** **US-996 takes the React baseline** — it cannot be recovered once a
conversion lands, and Epic B lost its equivalent to sequencing. **US-999 takes the after-number**,
because it is the first point at which both `Tooltip` and `Button` are vanilla, and records both in
this epic's Notes. Per Rule 4 the epic cannot close without both.

Three secondary counts close alongside it:

| Count | Open | Target at close |
|---|---:|---:|
| `@emotion` importers in `uikit/` | 53 | 35 |
| `uikit/` → app-layer imports (Rule 6) | 5 | 1 |
| `react-tooltip` importers / dependency | 0 / present | 0 / removed |

**C1-9 — Rule 6 becomes a lint rule, with one documented exemption.** Closing the four leaks is
trivial; keeping them closed for three more epics is the point. `eslint.config.mjs` has no
`import/no-restricted-paths` rule today, so US-995 authors one: scoped to `src/renderer/uikit/**`,
resolving and banning `api/`, `ui/`, `components/` and `src/shared/` imports, with story files
exempt per the roadmap's own carve-out. Resolved paths are required so the allowed
`uikit/shared/` helper folder cannot be confused with `src/shared/` at a different nesting depth.

**It must not fail on the violation this epic deliberately keeps.**
`uikit/AVGrid/model/ContextMenuModel.tsx:1` imports `ui/dialogs/poppers/showPopupMenu` and survives
until C4 (EPIC-053 B15 shows it dies properly there). That file carries a file-level
`eslint-disable` with a "removed in EPIC-C4" comment — an explicit, greppable exemption rather than
a hole in the rule.

**C1-10 — The React-compatibility helpers are built once, in US-996, not nine times.** This is the
gap the audit found most likely to sink the epic: `PathInputView` needed a **27-line synthetic-event
shim** (`toPublicEvent`, `:39-65`), attribute and listener bookkeeping (`:255-323`, including an
`onDoubleClick → dblclick` special case), and **~40 lines of ref plumbing** (`:212-232`, `:408-419`)
to keep an unchanged React signature working. **16 of 20** C1 components spread `...rest` and **6**
declare a `ref`. Without a shared helper, nine tasks each re-derive that or silently drop it, and
the loss shows up at runtime rather than at compile time.

US-996 extracts from `PathInputView` into `uikit/shared/`:

- **`toPublicEvent(event)`** — adapts a native event to the `React.SyntheticEvent` shape callers
  receive (`nativeEvent`, `preventDefault`, `isDefaultPrevented`, `stopPropagation`,
  `isPropagationStopped`, `persist`).
- **`applyRestProps(root, rest, previous)`** — forwards arbitrary attributes and `on*` handlers to
  a root element, **removing what disappeared since the previous prop set** (see Concern 1), and
  returning the bookkeeping needed for the next update.
- **`bindRef(el, ref, previous)`** — assigns object and function refs, honouring a function ref's
  cleanup return and the null-on-unmount contract.

**Composition between vanilla views.** `SegmentedControl` composes `Button`; C2 and C3 need this
constantly. The convention: each converted component exports its `XView` class **from its own
folder** (`uikit/Button/ButtonView.ts`), a parent constructs `new XView(props)`, registers it with
`this.child(view)` and appends `view.mount()`. `uikit/index.ts` continues to export **only the
React face** until Epic F — consistent with `uikit/CLAUDE.md` Rule 9, which already states the
Epic B primitives are not re-exported from the barrel.

## Goals

- Convert eighteen of `uikit/`'s foundation components to vanilla behind unchanged React-facing
  signatures, and settle `Panel` and `Text` as legacy React-only shims that later epics drain
  rather than convert.
- Build the React-compatibility layer (`...rest`, `ref`, synthetic events, slots) **once**, so that
  C2, C3, C4 and Epic E inherit it instead of re-deriving it per component.
- Establish the three contracts the remaining epics spend: Emotion to layered component CSS, the
  subtree-slot type, and the DOM icon path.
- Establish the container idiom for the programme — semantic classes in the view's own stylesheet,
  not a utility-props component (C1-1).
- Adopt `@floating-ui/dom` on the simplest floating consumer, so C2 inherits a proven pattern.
- Close Rule 6's four remaining leaks and make the boundary lint-enforced.
- Produce Rule 4's measured number with a genuine React baseline.

## Linked Tasks

| Task | Title | Status |
|------|-------|--------|
| US-995 | [Rule 6 — close the `uikit/` → app-layer imports and lint the boundary](../tasks/US-995-uikit-boundary-lint/README.md) | Planned |
| US-996 | [The vanilla UIKit contracts — CSS, slots, React-compat helpers, Rule 4 baseline](../tasks/US-996-vanilla-uikit-contracts/README.md) | Planned |
| US-997 | [DOM icon path — rewrite the 116 icon bodies as markup; dual-face factories](../tasks/US-997-dom-icon-path/README.md) | Planned |
| US-998 | [`Tooltip` — attachment-based, on `@floating-ui/dom`](../tasks/US-998-tooltip-attachment/README.md) | Planned |
| US-999 | `Button`, `IconButton`, `TruncatedText`, `SegmentedControl` + the Rule 4 after-number | Planned |
| US-1000 | `Label`, `Tag`, `SelectableRow`, `Divider`, `Dot`, `Spacer`, `Spinner`, `ProgressBar` | Planned |
| US-1001 | `Checkbox`, `Slider`, `RadioGroup` | Planned |
| US-1002 | `Input` and `Textarea` | Planned |
| US-1003 | `Panel` — Emotion to CSS, no vanilla face | Planned |

Task documents are written before implementation, per
[CLAUDE.md](../../CLAUDE.md)'s task-creation workflow — this epic doc is the design, not the spec.
When each is created, its row and its dashboard entry become links to
`doc/tasks/US-XXX-short-name/README.md`.

### Ordering

The graph is shallow, so most of the epic is parallel. Four constraints bind it.

**US-995 is independent of everything** and can run at any point.

**US-996 first among the conversion tasks.** Every later task consumes its helpers (C1-10), its CSS
contract (C1-7) and `fillSlot` (C1-4) — and it takes the Rule 4 React baseline, which stops being
possible the moment a conversion lands.

**US-997 before US-999, US-1000 and US-1001** — the `renderIcon` consumers are `Button`,
`IconButton` (US-999), `Tag` (US-1000) and `Checkbox`, `RadioGroup` (US-1001). It is **not** a
prerequisite for US-1002: `Input` has no icon prop, and `SegmentedControl` only forwards `icon` to
`Button`.

**US-998 → US-999.** `Button`, `IconButton` and `TruncatedText` import `Tooltip`, and the
attachment redesign (C1-5) is what lets them stop composing it.

**US-1000 carries `Text`.** `Label` reuses `Text.css` and the `TextStyleProps` attribute helper
(C1-1), so both ship with US-1000 rather than sitting in the `Panel` task. US-1003 is `Panel` only,
depends on nothing, and is the right thing to defer if the epic runs long.

**US-1001 and US-1002 are independent** of each other and of US-998/999.

**Rule 1 is deliberately relaxed once.** Roadmap §6 Rule 1 says never convert a component and its
parent in the same change. US-999 converts `Button` and its consumer `SegmentedControl` together.
This is accepted because both convert behind unchanged signatures, the boundary between them is
internal to a single task's review, and splitting them would leave `SegmentedControl` composing a
vanilla `Button` through `mountVanilla` for no benefit. Any further relaxation needs its own note.

### Verification

Every conversion task verifies the same way, and each task's acceptance criteria state it
explicitly:

- `npm run typecheck`, `npm run lint`, `git diff --check`;
- open the component's story in the Storybook editor and exercise every prop control;
- **capture `browser_snapshot` before and after the conversion and diff the `data-*` output** — the
  `data-name` contract ([ui-element-contract.md](../architecture/ui-element-contract.md)) is what
  makes the two DOM trees comparable, and C1-2 promises they are identical.

Two exceptions. `SelectableRow` has no story, so US-1000 writes one before converting it. `Panel`
has no story-shaped verification worth the name at 716 call sites, so US-1003 is verified by a
smoke pass over the running app instead.

### Task notes

**US-995 — Rule 6.** Close `ListBox/ListBoxModel.ts:6` and `Tree/TreeModel.ts:6`
(`api/events/events` → the neutral core context-menu contract), `Menu/types.ts:1` (a re-export of
`api/types/events`'s `MenuItem`), and `RenderGrid/RenderFlexGrid.tsx:9` (`shared/utils` → a
renderer-core bridge that preserves the shared `debounce` owner). Move `BaseEvent` with the
context-menu contract, leave the shipped `api/types/` declarations untouched, and author the
resolved-path lint rule plus the `ContextMenuModel.tsx` C4 exemption per C1-9. None of the four
relocations requires converting the component that holds it — which is why this lands in C1 even
though `ListBox`, `Tree` and `RenderGrid` are C3 components.

**US-996 — The contracts.** No component is converted. Deliverables:

1. `SlotContent` and `fillSlot` in `uikit/shared/slots.ts` (C1-4).
2. `toPublicEvent`, `applyRestProps` and `bindRef` in `uikit/shared/`, extracted from
   `PathInputView.tsx` rather than written fresh (C1-10). `PathInput` is refactored onto them, which
   is also how they get their first test.
3. `uikit/shared/selection-style.css` (C1-7).
4. `uikit/CLAUDE.md`: amend Rule 7 for the layered component-CSS contract, and **extend Rule 9 with
   the prop-removal rule** — every `onUpdate` must clear as well as set (Concern 1).
5. **The Rule 4 React baseline**, measured per C1-8 and recorded in this epic's Notes.

Amending Rule 7 rather than replacing it matters: Emotion remains correct for the 35 `uikit/` files
this epic does not touch, and for `ui/` and `components/` until Epic D.

Also record here that **`Story.previewChildren` stays React-only through C1**, closing EPIC-053 B5's
deferral ("`previewChildren` stays React-only until Epic C answers the subtree-slot question"). It
is assigned into `componentProps.children` at `LivePreview.tsx:48-50` and is served by `fillSlot`'s
`ReactNode` arm like any other JSX child.

**US-997 — Icons.** The epic's largest task, per C1-6. Codemod `theme/icons.tsx`'s 116 icon bodies
from JSX to static markup strings; teach `createIcon` / `createIconWithViewBox` to build both a
React component and a DOM element from one body; extend `icon-registry` to resolve a name to both;
add `createIconElement(name, props): SVGElement` beside `renderIcon`, whose signature does not
change. State the fallback for a registry name with no builder. `language-icons.tsx` is out of
scope.

**US-998 — `Tooltip`.** The attachment redesign and the `@floating-ui/dom` adoption (C1-5). Add
`@floating-ui/dom` as a direct dependency and **uninstall `react-tooltip`** (zero importers).
`@floating-ui/react` stays — it has 6 importers and outlives C2. `Tooltip` is one of C1's two
stateful components; its `useState` values become view fields, and `tooltipRegistry` and
`overlayLayer` are consumed unchanged.

**US-999 — `Button`, `IconButton`, `TruncatedText`, `SegmentedControl`.** The only dependent cluster.
`Button.tsx:179`'s self-wrapping becomes an `attachTooltip` call; `IconButton` and `TruncatedText`
follow. `TruncatedText` is C1's other `useState` component — it measures overflow to decide whether
to show a tooltip, which is view-owned DOM measurement and stays in the view. `SegmentedControl`'s
`label` and `icon` become `SlotContent`. `Button`'s and `Tag`'s `children` route through `fillSlot`
with the string fast path (C1-4). **This task also takes the Rule 4 after-number** (C1-8) and
records both figures in the Notes.

**US-1000 — `Text` and the stateless leaves.** Eight components plus `Text`'s stylesheet and
attribute helper. Two specifics:

- **`Label`'s DOM must not change.** Today `Label.tsx:48-62` renders
  `<label data-type="label" …>` containing **one or two** `<Text>` elements — the second being
  `<Text color="error">*</Text>` when `required`. The vanilla `Label` builds the same
  `<label data-type="label">` with the same one or two `<span data-type="text" …>` children
  carrying identical attributes. The helper's job is computing that attribute set, nothing more.
  Collapsing the nested spans would break both C1-2 and `Text.css`'s selectors.
- **`SelectableRow`** consumes `selection-style` and moves to the shared stylesheet from US-996; it
  also needs its story written first.

**US-1001 — `Checkbox`, `Slider`, `RadioGroup`.** Three views, all controlled (UIKit Rule 2: no
internal state for the primary value), so each is a listener, a projection and a `bind`-free update
path. `Checkbox` renders `{children}` and `Checkbox`/`RadioGroup` call `renderIcon`.

**US-1002 — `Input` and `Textarea`.** The first named-slot consumers: `startSlot` and `endSlot`
render through `fillSlot` with the disposer owned by the view. Both import no other `uikit/`
component, so the task is independent — the `IconButton`/`Panel`/`Text` dependencies an earlier
draft attributed to `Input` were story-file artefacts. Both declare a `ref` that must survive
(C1-10).

**US-1003 — `Panel`.** Emotion to `Panel.css` in `@layer uikit`; the React face otherwise untouched;
**no vanilla API** (C1-1). Two details that are easy to get wrong:

- **`.scroll-container` is a real class consumed by `theme/GlobalStyles.tsx:121,126`**, not an
  Emotion artefact. It must keep being applied under the same condition (`overflow` is
  `auto`/`scroll` and `scrollbar` is not `"hidden"`).
- **`compactStyle` stays exactly as it is.** Its comment explains React-specific behaviour — React
  clears a style property written as `undefined`, which would destroy the `flex` and `overflow`
  shorthands. `Panel` remains React-only, so that reasoning still holds and the function must not be
  "simplified" during the CSS extraction.

Record in `Panel`'s own doc comment that it is legacy and app-facing: new vanilla code writes its own
container with a semantic class.

## Concerns / Open questions

1. **Stale DOM on the update path is the failure mode to design against, and it now has an owner.**
   React's "recompute and diff" is what silently cleared removed properties; nothing does that now.
   A view that only writes the props present in the new set will carry a stale attribute, class or
   listener forward forever. US-996 puts the rule in `uikit/CLAUDE.md` Rule 9 and encodes it in
   `applyRestProps` (C1-10), so each of the eight conversion tasks inherits it rather than
   rediscovering it. This is roadmap §4's named cost of the migration and C1 is the first epic where
   it appears at scale.

2. **Emotion is 18 of C1's files and will dominate the diffs.** The rendering conversion for a
   stateless leaf is often twenty lines; its stylesheet is two hundred. That is a reviewing hazard —
   a large mechanical CSS diff is where a changed selector hides. Attribute-selector Emotion
   converts character-for-character, so any *semantic* change to a selector must be called out in
   the task rather than left in the diff.

3. **US-997 is now the epic's largest task and its estimate is the softest.** Rewriting 116 icon
   bodies is mechanical but not free, and the codemod has to get SVG attribute casing right
   (`strokeWidth` → `stroke-width`) across bodies that were written by hand over time. If it
   overruns, the fallback is to convert only the icons C1's five `renderIcon` consumers actually
   use and leave the rest on the React path until Epic D — worth deciding early rather than
   mid-task.

4. **`@floating-ui/react` outlives Epic C.** Two app-layer files import it directly. Nothing in C1
   is blocked by this, but the roadmap's "third-party coupling" table implies the swap completes
   inside the UIKit epics, and it does not. Worth a roadmap correction when C2 opens.

5. **The roadmap's `uikit/` size figures (101 files, 14,671 lines) are not reproducible.** Actual
   production `uikit/` is 162 files / 22,164 lines. The four-way split's per-epic line estimates
   inherit the old denominator. Nothing in C1 depends on it — C1's own 3,209 is measured directly —
   but C2's and C3's scoping should re-measure rather than inherit.

6. **The icon conversion is scope moved *into* this epic, and the roadmap's Epic D entry should be
   updated when C1 closes** to reflect what is left there (`language-icons.tsx`, and any sprite
   consolidation still worth doing once the main set has a DOM path).

## Notes

### 2026-08-20

- **US-996 React Rule 4 baseline:** On the Storybook `Button` story, `title` was set to
  `Rule 4 baseline tooltip`. A `MutationObserver` was installed on both
  `[data-type="live-preview"]` and `#persephone-overlay-layer` with identical options
  `{ subtree: true, childList: true, attributes: true, characterData: true }`. The counter was
  reset immediately before hovering the live-preview button, the tooltip show delay was allowed
  to elapse (1.2 seconds), and the React implementation produced **3 mutation records**. The
  overlay layer and tooltip were both present. US-999 owns the matching after-number.

### 2026-08-19

- Epic opened. Roadmap Epic C measured at **44 components** and **split into four epics** by user
  decision; C1 is this doc, C2–C4 are described in the roadmap and get their IDs when each is next
  up. The next free epic number is **EPIC-055**; the next free task number is **US-1004**.
- **EPIC-053 B15's ordering is refined by C3/C4's separation.** B15 treats `RenderGrid` and `AVGrid`
  as one absorption; they sit at opposite ends of the chain. av-grid's `render/` is standalone and
  can land right after C1, while the grid on top of it is blocked on C2's `Popover`, `Menu` and
  `Select`. B15's own conclusion ("AVGrid is one of the *last* Epic C conversions") is unaffected
  and is what C4 encodes.
- C1 uses **none of Epic B's model driver**: zero models and zero `effect()` call sites in scope.

### 2026-08-19 — dependency-graph correction and the `Panel` decision

- The first draft was built on a `uikit/` dependency map that **counted story files as production
  dependencies**. Two conclusions were wrong: that `Panel` was the library's floor, and that
  `Button` ↔ `Tooltip` formed a cycle. Corrected: `Panel` is imported by **4** production
  components, and `Tooltip` imports **no** UIKit component — the "cycle" was `Tooltip.story.tsx`
  importing `Button`.
- **C1-1 was decided on the corrected data** *(user decision)*: `Panel` gets no vanilla face;
  vanilla views use semantic classes in their own stylesheets, which is VSCode's pattern (`dom.ts`'s
  `$()` factory, per-widget CSS, direct `style` writes for computed values, no utility-props
  container anywhere in the product). A utility-class vocabulary was considered and rejected on
  measurement: **43.2% of `Panel`'s production tags need a per-instance scalar**.

### 2026-08-19 — independent audit and revision

Two independent agents audited this document with no prior context — one verifying every measured
claim against the tree, one checking internal consistency and implementability. Both found real
defects. The document was revised throughout; the substantive changes:

- **Corrected numbers:** `@floating-ui/react` importers 4 → **6** (and it now outlives C2);
  icon registry entries 118 → **116**; `Panel` production tags 714 → **716** with `uikit/` 7 → **6**
  and `ui/` 65 → **63**; scalar share 41.8% → **43.2%** (production denominator, consistently);
  `PanelProps` "~35" → **52**; Emotion renderer-wide 77 → **76** production; `ReactNode` sites
  "12" → **9 prop declarations**; "16 of 20 import nothing from `uikit/`" → **15 import no other
  `uikit/` component**.
- **`children` was added as a slot surface** (C1-4). Eight C1 components render it, including
  `Button` at 298 call sites. The earlier "29 call sites" figure omitted it and also omitted
  `content` (18 sites); the named-slot surface is **46**, and four props previously called "unused"
  have story callers that must keep working.
- **C1-3 was reversed.** The "plain build function" tier could not occupy `Story.component`
  (`React.ComponentType<P>`), contradicted C1-2, and ignored that **16 of 20 components spread
  `...rest`** and therefore do have listeners. Every converted component now gets a `VanillaView`
  and a `mountVanilla` face, matching `PathInput`.
- **C1-6's mechanism was replaced** *(user decision)*. The icon bodies are `ReactNode` values, so
  "the seam is the factory, not the bodies" was false. The 116 bodies are rewritten as static
  markup by codemod; US-997 becomes the epic's largest task.
- **C1-8's measurement was fixed.** `Tooltip` portals to the overlay layer on `document.body`, so
  an observer scoped to `[data-type="live-preview"]` would have counted nothing before *or* after.
  The observer now covers both, and **US-999 owns the after-number**, which no task previously did.
- **C1-10 was added** — the shared `toPublicEvent` / `applyRestProps` / `bindRef` helpers extracted
  from `PathInputView`, plus the convention for one vanilla view composing another. Without it,
  nine tasks would each re-derive ~70 lines of React-compatibility plumbing or silently drop `ref`
  and handler forwarding.
- **Also added:** `@layer uikit` to the CSS contract (both existing converted stylesheets already
  use it); a shared-stylesheet clause for `uikit/shared/selection-style.ts`; the lint mechanism and
  its `ContextMenuModel.tsx` exemption (C1-9); an explicit Verification section; `TooltipOptions`
  and the React face's implementation (C1-5); `Label`'s exact DOM shape (US-1000); the `Text.css`
  ordering coupling resolved by moving `Text` into US-1000; the Rule 1 relaxation for
  `SegmentedControl` acknowledged; and EPIC-053 B5's `previewChildren` deferral closed in US-996.
- **`Progress` was unassigned by the four-way split** and is assigned to **C2** *(user decision)*.
  With `PathInput` converted in Epic B, the split now covers all 44 components.

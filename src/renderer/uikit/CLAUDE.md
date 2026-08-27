# UIKit — Component Authoring Guide

This folder contains Persephone's new component library (`src/renderer/uikit/`).
Every component in this folder **must** follow these rules. Read this file before creating or modifying any component here.

---

## Folder structure

Each component lives in its own subfolder:

```
uikit/
  tokens.ts              ← design token constants
  index.ts               ← public exports
  Button/
    Button.tsx
    index.ts
  Input/
    Input.tsx
    index.ts
  ...
```

Converted components use a co-located `Component.css` stylesheet imported by `Component.tsx`.
Plain CSS is scoped from the required `[data-type="component-name"]` root and uses the existing
`data-part` vocabulary for stable internal regions. Existing components remain on Emotion until
an explicit conversion task; do not mix Emotion and static CSS for the same converted subtree.

### Which virtualization engine to use

**New code uses `VirtualGrid`** (`uikit/VirtualGrid/`, `VirtualGridView` + `VirtualGridModel`).
It is the vanilla engine: cell renderers return an `HTMLElement`, the view owns the scroll shell
and its nine regions, and consumers own their cell subtrees directly. Use `VirtualFlexGridView`
only when row height is measured from nominated content; fixed-height surfaces use
`VirtualGridView`.

---

## Rule 1 — Data attributes for state (mandatory on every component)

Set `data-type` and `data-*` state attributes on the root element. Never express interactive state via CSS class names.

```tsx
<button
    data-type="button"
    data-disabled={disabled || undefined}
    data-variant={variant}
    data-size={size}
>
```

**`data-type` is required on every component.** Use kebab-case matching the component name.
It enables DOM inspection in DevTools and reliable querying by AI agent scripts:
```js
document.querySelectorAll('[data-type="button"][data-disabled]')
```

Pass `undefined` (not `false`) when a boolean attribute is inactive — `data-disabled="false"` still matches `[data-disabled]`.

### Standard state attributes

| Attribute | Values | When to use |
|-----------|--------|-------------|
| `data-type` | kebab-case name | **Always** — every component's root element |
| `data-name` | free-form string | optional caller-supplied debug label (`name` prop). Never used for styling. |
| `data-disabled` | present / absent | component is disabled |
| `data-selected` | present / absent | item is selected |
| `data-active` | present / absent | item is focused / highlighted |
| `data-drop-active` | present / absent | item is the current drag-and-drop target |
| `data-checked` | `"true"` / `"false"` / `"mixed"` | checkbox or toggle state |
| `data-state` | `"open"` / `"closed"` | expandable or floating element |
| `data-orientation` | `"horizontal"` / `"vertical"` | layout direction |
| `data-variant` | e.g. `"ghost"` / `"danger"` | visual variant |
| `data-size` | `"sm"` / `"md"` / `"lg"` | size variant |

### Debug naming via `data-name`

Every primitive accepts an optional `name?: string` prop. When set, the value is
emitted as `data-name="…"` on the same element that carries `data-type`. This is a
debug-inspection aid — it never affects styling, state, or behavior.

```tsx
<Panel name="url-bar-wrapper" flex={1}>…</Panel>
// → <div data-type="panel" data-name="url-bar-wrapper">
```

**When to set `name`** (in call sites):
- Multiple instances of the same primitive in one tree (especially `Panel`,
  `IconButton`, `Splitter`, `Divider`).
- Any `IconButton` — the `<svg>` child doesn't reveal the action.
- Any element that participates in cross-component selectors (`closest`,
  `querySelector`) — name doubles as a stable hook.

**When to skip:** purely structural one-off Panels where the surrounding
`data-type` chain already identifies the element.

**Authoring requirement:** every new UIKit primitive MUST accept `name?: string`
and emit `data-name={name}` on the same element as its `data-type`. Pass
`undefined` (not `""`) when unset — React then omits the attribute. Destructure
`name` before the rest spread so the attribute is emitted only once.

### Style state via Emotion attribute selectors

```ts
const Root = styled.button({
    cursor: "pointer",
    "&[data-disabled]": {
        opacity: 0.4,
        pointerEvents: "none",
    },
    '&[data-variant="danger"]': {
        color: color.button.dangerFg,
    },
    '&[data-size="sm"]': {
        height: height.controlSm,
        fontSize: fontSize.sm,
    },
}, { label: "Button" });
```

---

Static CSS is the target form for new or converted components; the Emotion example above is the
legacy form for components that have not been migrated.

```tsx
import "./Button.css";

export function Button({ size = "md", disabled, name, label }: ButtonProps) {
    return (
        <button
            data-type="button"
            data-name={name}
            data-size={size}
            data-disabled={disabled || undefined}
        >
            <span data-part="label">{label}</span>
        </button>
    );
}
```

```css
@layer uikit {
    [data-type="button"] {
        color: var(--color-text-default, currentColor);
        border-radius: var(--radius-md, 0px);
        font-size: var(--font-base, 13px);
    }

    [data-type="button"][data-size="sm"] {
        height: var(--size-control-sm, 24px);
    }

    [data-type="button"][data-disabled] {
        opacity: 0.4;
        pointer-events: none;
    }
}
```

Static selectors begin at the component's `[data-type]` root. Use established `data-part` names
for structure and preserve direct-child relationships where DOM shape matters. Use
`var(--color-...)` and the app token families (`--space-*`, `--gap-*`, `--radius-*`, `--size-*`,
`--font-*`) rather than literals. Scalar runtime inputs use component-prefixed custom properties
on the consuming element with a fallback; finite state uses `data-*` attributes. The public
component still omits `style` and `className`, even though its implementation may set an internal
custom property on its own raw root. Do not render `<style>` from a component for keyframes: use a
stable `persephone-<component>-<animation>` name in the co-located stylesheet.

---

## Rule 2 — Controlled components (no internal state for primary value)

Never use `useState` for the component's primary value. Models own all state.

```tsx
// WRONG
function Input({ defaultValue }: { defaultValue?: string }) {
    const [value, setValue] = useState(defaultValue ?? "");
    ...
}

// CORRECT
function Input({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    ...
}
```

**Allowed** internal transient state:
- `isHovered`, `isFocused` — visual-only feedback
- `isOpen` — dropdown open/closed when not controlled externally
- A **gesture anchor** — the reference point a range gesture extends from (`Tree`'s multi-select
  anchor). It is not the value; it only says where the next range starts.

When a gesture needs to compute a *new* composite value the component doesn't own — a
Ctrl/Shift-click producing the next selection **set** — read the current value back through the
props predicate (`isSelected` per visible row), compute the result, and emit it
(`onSelectionChange`). The component keeps the derivation because it alone knows the presentation
order; the consumer keeps the state.

---

## Rule 3 — Trait-based data binding (list/collection components)

Applies to: **Select, MultiSelect, ListBox, Tree, SegmentedControl, and any component that takes a list of items.**

Accept `T[] | Traited<T[]>` for items/options props. Call `resolveTraited(items, KEY)` once at the top of the component — result is always the component's native array type.

```tsx
import { resolveTraited, Traited, TraitType } from "../../core/traits/traits";
import { TraitRegistry } from "../../core/traits/TraitRegistry";

export interface IOption {
    label: string;
    value: string;
    icon?: IconRef;
}

const OPTION_KEY = TraitRegistry.register<TraitType<IOption>>("select-option");

export interface SelectProps<T = IOption> {
    items: T[] | Traited<T[]>;
    value: IOption | null;
    onChange: (v: IOption) => void;
}

export function Select<T = IOption>({ items, value, onChange }: SelectProps<T>) {
    const options = resolveTraited<IOption>(items, OPTION_KEY);
    // options is IOption[] — consume normally from here
}
```

**Rules:**
- Never add `getLabel`, `getValue`, `getIcon` accessor props — removed at point of conversion.
- The `TraitRegistry.register()` call lives in the component file — one key per component.
- Scalar-value components (`Input`, `Checkbox`, `TextField`) do not use this pattern — only list/collection props.

---

## Rule 4 — Roving tabindex (keyboard-navigable widgets only)

Applies to: **Toolbar, Tree, ListBox, SegmentedControl, Tab bar, and similar widgets.**

- Only one item has `tabIndex={0}` at a time (the active item); all others get `tabIndex={-1}`
- Arrow keys move focus within the widget; Tab / Shift+Tab exits it entirely
- Callers are unaware of this — it is internal behavior only

Do not apply to simple lists that are not keyboard-navigable widgets.

---

## Rule 5 — Focus trap (modal dialogs only)

Applies to: **all components that render a blocking modal overlay.**

When the modal opens:
- Move focus to the first focusable element inside
- Tab / Shift+Tab cycle only within the modal
- On close, return focus to the element that was focused before the modal opened

Does **not** apply to non-modal side panels or popovers that do not block background interaction.

---

## Rule 6 — UI Descriptor pattern (`ComponentSet`)

**Use when:** the list of child components is dynamic — built at runtime, driven by data, or constructed by a script that has no JSX.

The utility component `ComponentSet` accepts a `ComponentItem[]` descriptor array and renders the items as a flat React fragment (no wrapper element). Container components (`Toolbar`, `Menu`, `StatusBar`) stay as pure layout containers — they know nothing about descriptors.

```tsx
// Dynamic children via ComponentSet — Toolbar is unchanged
<Toolbar>
    <ComponentSet descriptors={items} />
</Toolbar>

// Static children via plain JSX — always prefer when the list is known
<Toolbar>
    <Button label="Run" onClick={handleRun} />
    <Separator />
    <Toggle label="Wrap" checked={wordWrap} onChange={setWordWrap} />
</Toolbar>
```

**`ComponentItem` — intersection type, not duplicated props:**

Each variant is `{ type: "x" } & XProps`. The existing component props are the descriptor shape; only a `type` discriminant is added.

```typescript
// uikit/ComponentSet/types.ts
export type ComponentItem =
    | { type: "button"    } & ButtonProps
    | { type: "toggle"    } & ToggleProps
    | { type: "select"    } & SelectProps
    | { type: "separator" }
    | { type: "text"      } & TextProps
```

After `item.type === "button"`, TypeScript gives you full `ButtonProps`. Adding a new variant produces a compile error in `ComponentSet` if the registry is not updated.

**`ComponentSet` implementation:**

```tsx
// uikit/ComponentSet/ComponentSet.tsx
import React from "react";
import { ComponentItem } from "./types";
import { Button }    from "../Button";
import { Toggle }    from "../Toggle";
import { Select }    from "../Select";
import { Separator } from "../Separator";
import { Text }      from "../Text";

const REGISTRY: Record<string, React.ComponentType<any>> = {
    button:    Button,
    toggle:    Toggle,
    select:    Select,
    separator: Separator,
    text:      Text,
};

export function ComponentSet({ descriptors }: { descriptors: ComponentItem[] }) {
    return (
        <>
            {descriptors.map((item, i) => {
                const { type, ...props } = item;
                const Component = REGISTRY[type];
                return Component ? <Component key={i} {...props} /> : null;
            })}
        </>
    );
}
```

**Rules:**
- `ComponentSet` renders a `<Fragment>` — never a wrapper `<div>`. The container's flex/grid layout applies directly to the rendered children.
- The registry lives in `ComponentSet/ComponentSet.tsx` — not in the container's file and not in a global file.
- New library components must be added to both `ComponentItem` and `REGISTRY` when they are implemented.
- Do not use `ComponentSet` for static, known UI. `<Button onClick={fn}>Run</Button>` is always cleaner than a descriptor object.

---

## Rule 7 — No Emotion outside UIKit (mandatory in app code)

Application code (everything outside `src/renderer/uikit/`) **must not** use Emotion or any
inline style escape hatch when composing UIKit components.

**Forbidden in app code:**
- `import styled from "@emotion/styled"` — no `styled.div`, `styled(Component)`, etc.
- `import { css } from "@emotion/css"` — no class generation
- Passing `style={…}` to a UIKit component
- Passing `className=…` to a UIKit component

**The rule on UIKit component types:** UIKit components forbid `style` and `className` at
the type level (`extends Omit<React.HTMLAttributes<…>, "style" | "className">`). Trying to
pass them produces a TypeScript error.

**Inside UIKit (`src/renderer/uikit/`)** Emotion is still used for component implementations.
Internal helpers and primitive HTML elements (`<div style={{…}}>`) are also fine — the rule
applies to *consumers* of UIKit, not to UIKit itself.

**When a layout need can't be expressed by existing props:** extend the UIKit component's
prop surface, do not work around the rule. The right answer is "Panel needs a new prop", not
"this one place needs `style=`".

**Why:**
- **Consistency.** Every screen in Persephone uses the same Panel/Button/Toolbar with the
  same defaults. No one-off styling drift.
- **JSON descriptors.** Scripts will eventually build UIs from descriptor objects
  (`{ component: "Panel", direction: "row", gap: "sm" }`). A descriptor can carry props but
  not Emotion — so anything achievable only through Emotion is unreachable from scripts.
- **AI agent legibility.** With layout expressed in props, an agent can read intent from JSX
  alone without consulting separate `styled.*` blocks.

**When this rule may be relaxed:** when scripts need to ship custom styles into UIs, a curated
escape hatch (e.g. `style?: Pick<CSSProperties, "color" | …>`) may be added for a future script UI
API. Until then, no escape hatch.

**Application chrome exception (`src/renderer/ui/`)**

Files in `src/renderer/ui/` that render the Persephone application's one-of-a-kind chrome
surfaces (page tab strip, sidebar, navigation bar, etc.) are not subject to the no-Emotion
clause. Their visual layout is unique to Persephone, will not be reused elsewhere, and would
distort the UIKit surface if every chrome quirk became a `Panel` prop or a new UIKit primitive.

Such files MAY use `@emotion/styled`, `style={…}`, and `className=…` on their own local
elements (plain `<div>`s, etc.) for chrome layout. They MUST still:

- Use only UIKit components (`Button`, `IconButton`, `Tooltip`, `Divider`, `Panel`, …) for
  primitive rendering — no imports from `src/renderer/components/basic/` or
  `components/form/` for new code.
- Apply Rule 1 (`data-*` for state) on their own elements.
- Avoid passing `style={…}` or `className=…` to UIKit components (that's still a TypeScript
  error).

This exception does **not** apply to anything that could plausibly be reused (forms,
dialogs, settings panels, list rows). For those, the strict rule still holds — extend a
UIKit primitive instead of styling around it.

**Foundational compositional primitive guidance**

`VirtualGridView` is a multi-region composition: cells, sticky bands, and sticky corners are
owned by the shell, while overlay hosts are added through its explicit surface. Styling belongs
to the grid stylesheet or to the host's own scoped stylesheet; a cell renderer owns only its cell
subtree. The Omit-style enforcement (`extends Omit<HTMLAttributes<…>, "style" | "className">`)
still applies to primitives that wrap a single HTML element (Button → button, Input → input).

When in doubt: this exemption is for **foundational compositional primitives with
multiple styleable regions**, not a general escape hatch. New UIKit primitives that
wrap one HTML element follow the strict Rule 7 contract.

---

## Rule 8 — Model-view architecture for complex components

Simple components stay as plain function components with React hooks. Once a component
grows past the small-and-readable threshold, migrate it to the model-view pattern documented
in [`/doc/standards/model-view-pattern.md`](../../../doc/standards/model-view-pattern.md).

### Thresholds (from the standard doc)

**Migrate to model-view when any of the following hold:**

- More than 4–5 `useState()` hooks
- More than 3 `useCallback()` hooks
- The component function body is long and hard to follow at a glance
- Hooks have many or cyclic dependencies that force `// eslint-disable react-hooks/exhaustive-deps`
- Multiple `useEffect`s with overlapping responsibilities

**Stay with plain hooks when:**

- 1–2 simple `useState()` hooks
- 1–2 `useCallback()` hooks
- Body is short and presentational
- The component is a thin wrapper over a primitive

### What the migration looks like

The pattern moves all logic into a `TComponentModel` subclass; the View becomes a pure
render function. Refs, handlers, computed values, side effects, and memos all live in the
model. See the standard doc for the full pattern, including:

- `TComponentState` — the state primitive
- `TComponentModel` — the base class with `init()`, `dispose()`, `effect()`, `memo()`
- `useComponentModel(props, ModelClass, defaultState)` — the single React hook the View uses

### Naming and file layout

Co-locate the model with the component. Inside the component's UIKit subfolder:

```
uikit/ListBox/
    ListBox.tsx           ← View (pure render)
    ListBoxModel.ts       ← Model (TComponentModel subclass)
    ListBox.story.tsx
    index.ts
```

Model classes are suffixed `Model` (matching the rest of the codebase — `GridPageModel`,
`NotebookViewModel`, `ImageViewModel`).

### Why this matters in UIKit specifically

UIKit primitives are reused across the entire app. A component with 10+ `useCallback`s and
tangled `useEffect` deps is harder to extend in follow-up tasks (the next consumer often
needs one more prop, one more state slice, one more effect). The model-view split keeps
each new feature additive — a new method on the model rather than a new closure with a new
dependency that risks breaking the existing ones.

It also unlocks alternative views over the same model later (e.g. a dense vs. comfortable
ListBox skin) without touching the logic.

---

## Rule 9 — Vanilla view authoring

Components converted from React may expose a framework-free `VanillaView` alongside the
existing React view. The detailed model contract is in
[`/doc/standards/model-view-pattern.md`](../../../doc/standards/model-view-pattern.md); this
section is the mandatory checklist for a class extending `VanillaView`.

Import `VanillaView`, `KeyedList`, and `SubtreeSwap` directly from their files under
`uikit/shared/`; these lifecycle and structural helpers are internal and are not public barrel
exports from `uikit/index.ts`.

### Lifecycle and ownership

- The constructor creates the stable root and may construct the model driver and view-owned
  state needed for the initial prop pump. Whatever the constructor touches, the constructor must
  have created; whatever `onMount()` creates, only `onMount()` and later may touch. It must not
  install listeners or subscriptions, measure layout, or start timers. A resource created in the
  constructor registers its cleanup with `own()` immediately; `onMount()` registers cleanup for
  resources it creates. This wording matches the deliberate create → claim → mount pattern used
  by `child()` and avoids treating ownership registration as child-DOM misuse.
- Every view used by `mountVanilla` or a constructor slot declares a **public** constructor. The
  base constructor is protected, so inheriting it is not a valid public constructor contract.
- `mount()` is where child DOM and bindings are built. The owner attaches `root` before calling
  `mount()` when the view may measure itself. `update(props)` always stores the latest props;
  before mount it does not call `onUpdate`, and `onMount()` renders from the stored props.
- Ownership and mounting are separate operations. `claimViewOwnership(view)` and `this.child(view)`
  only register lifetime ownership; they do not call `mount()`. Every claimed child must be mounted
  exactly once before its root is handed to a structural inserter or expected to render. For a view
  claimed directly rather than through `this.child()`, the usual order is create → claim → mount →
  return or insert, and the owner must also dispose it explicitly.
- `dispose()` is idempotent and disposes owned children first, then registered resources in FIFO
  order, then `onDispose()`. It attempts the complete cleanup snapshot and rethrows the first
  error afterward. Registration order is load-bearing. It makes the view inert but does not remove
  `root`; the adapter or structural helper that attached the root owns detachment.
- `bind()` is legal from `onMount()` onward. It applies once immediately, then subscribes. Its
  apply callback must tolerate the disposed view because a state notification may still visit a
  listener removed during that same notification pass.

### DOM, events, and state

- Build structure with `document.createElement`, `append`, and explicit properties/attributes.
  Static, code-owned `innerHTML` is allowed when genuinely clearer, but never interpolate runtime
  data into markup. `replaceChildren` is limited to a region owned outright by the view, never a
  `KeyedList` or other structural-helper container.
- Use semantic elements, `data-type` on the root, `data-name` for public debug names, and the
  established `data-part` vocabulary for stable internal regions. Keep interaction state in
  `data-*` attributes and co-located static CSS; do not reintroduce `className` as state.
- Use native DOM event types (`Event`, `MouseEvent`, `KeyboardEvent`, and so on), not React
  synthetic event types. The model remains reusable by both views and must not query the DOM.
- Store DOM references on the view and clear them during disposal. `bind` is for synchronized
  state-to-DOM projections; direct DOM work remains appropriate for structure, input feedback,
  attributes, focus, measurement, and other imperative operations.
- A vanilla-driven model uses `createComponentModelDriver` and registers no
  `TComponentModel.effect()` entries. Move behavior to explicit model methods, `setProps`, view
  lifecycle hooks, or cancellable async work. Keep prop-to-state seeding behind an identity guard
  in `setProps`, because prop pumping runs on every update.

#### The one exemption from the state primitives

`uikit/VirtualGrid/VirtualGridModel.ts` uses **no state primitive at all** — plain fields, and one
`onRepaintNeeded` callback the view supplies, which paints on `requestAnimationFrame`. This is a
named, bounded exemption (EPIC-056 C3-2), not an oversight, and it applies to that file only.

The reason is that its single consumer is a paint loop that already carries a precise dirty set
(`RerenderInfo`), so a subscription buys nothing, while `TOneState` would add immer `produce` on
every update and synchronous listener dispatch from inside a scroll handler. There is exactly one
subscriber and it is known statically — that is a callback, not a subject.

Two rules come with it. The callback may only ever **schedule** a paint, never paint
synchronously, because it is invoked from a `ResizeObserver` callback. And if a *host* ever needs
to observe the engine rather than command it, the answer is another registered callback in the
options — as `onResize` and `onInnerSizeChange` already are — never a store bolted onto the model.
Every other component in this folder uses the state primitives; do not generalise from this one.

#### Replacing `effect()` in a vanilla-driven model

`createComponentModelDriver` refuses to mount a model that registered any `effect()`, but the
question an effect answered — "did any of these inputs move?" — does not go away. The answer is
`uikit/shared/deps-gate.ts`: the **model** publishes a fixed-length signature of everything its
rendered output reads, and the **host view** holds a `DepsGate` and calls it once, at the end of
`onUpdate`, after the driver has pumped props. `ListBoxModel.repaintSignature()` is the reference
shape.

Five rules, each of which has already bitten:

- **Fixed length.** `depsChanged` treats a length change as "changed", so a conditionally-pushed
  slot silently degenerates into "always repaint".
- **Gate after the pump, prime at the end of `onMount`.** Gating first compares a stale signature;
  never priming makes the first update repaint everything for nothing.
- **Compare a `memo`'s output only when the memo genuinely derives something.** When its only
  dependency is a prop, the prop *is* the signal — compare that instead and skip evaluating the
  memo inside change detection. When its output is a normalised primitive, comparing the output is
  better than comparing the prop. `ListBoxModel.resolved` is the first case, `selectedKey` the
  second, `TreeModel.rows` the third.
- **Do not put reactive state in the signature.** A state change does not pump props in a vanilla
  driver, so a state slot is dead code. State-driven arms belong in `bind()`, and consequences of
  the model's own mutations belong at the mutation site.
- **A caller-owned selection travels through a callback's *identity*.** When a parent owns the
  selection and passes a predicate rather than a value — `MultiListBox` passes `isSelected` and never
  passes `value` — that predicate is the only slot that can carry the change. A stable bound method
  means checking a row moves no slot at all: the gate reports no change and the row keeps its old
  DOM until an unrelated input moves, so it self-heals on the next mouse move and reads as a
  rendering glitch rather than a missing repaint. Memoize the predicate on the selection
  (`MultiListBoxModel.isSelected`). A `revision` counter is not the fix — it is a proxy for a signal
  that already has a channel, and a forgotten bump has no compiler or runtime signal at all.

#### Never read state or a `memo()` from inside a `state.update` producer

Immer runs the producer against the *previous* state, and `this.state.get()` still returns it — so a
memo consulted there is computed from pre-write values, and a guard read from `this.state` compares
against them too. The failure is silent: the producer writes a plausible value that is one step
stale.

Compute from explicit values **before** the update and assign the result inside the producer; read
the guards from the **draft**, which is the state being committed. `SelectModel.seedIndex` takes both
the item array and the search text as parameters for exactly this reason — its first version read
`loadedItems` from state, which is empty on the load path, so the highlight it exists to seed was
silently never applied.

#### A state-driven model in a vanilla view

`ListBox`'s inputs are all props, so its `DepsGate` in the host's `onUpdate` is the whole story.
`Tree` is the first converted component whose rendered output also depends on **reactive state**
(expansion, lazy-load flags, drag state), and props are the only thing a vanilla driver pumps.

**Two mechanisms exist, and the choice between them is not stylistic.** Ask what the state *feeds*:

| The state is… | Use | Example |
|---|---|---|
| a **child's prop** — the view's job is to push it down | one compound `bind()` on the fields, applying through a single `syncChildren()` | `MultiListBox` (`searchText`, `activeIndex`); `MenuView` |
| **internal** — the consequence is a render pass the children cannot express (root attributes included) | a `mutate()` funnel on the model calling one host-registered callback | `Tree` (expansion, lazy-load flags, drag state) |

Two secondary signals point the same way. Write-site count: `Tree` has ~8 across three files, so a
funnel that makes `grep "state.update"` return exactly one hit buys a checkable convention;
`MultiListBox` has two two-line setters in one file and the convention would be pure ceremony (its
acceptance criteria assert **2**, not 0, so a later reader does not "fix" it into a funnel). And
`bind` filters through `compareSelection`, so a no-op write costs nothing, where `mutate()` runs the
full consequence regardless.

Whichever you pick, **every path must call the same consequence.** `MultiListBox`'s select-all header
derives from `searchText` *and* from `props.value`, so narrowing the filter has to be able to flip it
with no prop change at all; a `bind` that refreshed only the input and the list would have rebuilt the
masked defect inside the task that removed one. And do **not** keep per-field guards
(`lastSearchText`, `lastActiveIndex`) in the parent: a guard maintained on one of two paths either
re-pushes forever or skips a needed push. Let the children's own gates absorb the duplicate.

For the internal case, the answer is **not** a state subscription:

- Every state write goes through one funnel on the model — `TreeModel.mutate()` — which writes the
  state and then calls a single host-registered callback (`onStateApplied`). `grep "state.update"`
  inside the component folder must return exactly one hit; that is what makes the convention
  checkable. A submodel gets a narrow entry point (`mutateState`) rather than touching `state`.
- **The consequence of a state write is to re-run the render pass, not to repaint the cells.** Root
  attributes can be state-derived, and `aria-activedescendant` is the worked example: its bounds
  check reads `rows.length` *and* its value reads `rows.value[i].value`, so a `collapseAll()` with a
  high `activeIndex` must *remove* the attribute and an in-range collapse must *rewrite* it. A
  grid-only repaint leaves the root pointing at an id that is no longer in the DOM.
- Keep `applyRestProps` off the state path. It removes and re-adds every `on*` listener on every
  call, rest props cannot have changed on a state write, and reinstalling the root's listeners
  during a drag is a hazard rather than churn.
- Re-prime the `DepsGate` from the state path. Immer gives the mutated slice a new identity, so a
  derived memo's output is a new object and the next props pump would otherwise repaint a second
  time. Priming is safe there precisely because that path just painted everything.

Why not a subscription **in that case**, concretely (all three points are about a state-driven
*render pass*; none of them argues against `bind()` for a field that is simply a child's prop):
`TOneState.update` dispatches **synchronously** (it is not a
mirror of `state.use()`, which batches through `useSyncExternalStore`), unsubscribe replaces the
listener array so an in-flight dispatch can still call a listener removed during that pass, and a
state-driven blanket repaint is the masked-defect machine described in
[/doc/de-react.md](../../../doc/de-react.md) §6.1 — a prop missing from the signature would appear
broken only until the user expanded a node, then fix itself.

#### Scrolling after a change that resizes the content

`VirtualGridModel` has two scroll entry points and they are not interchangeable. `scrollTop` is
clamped to the scrollable extent, and the extent (`area.style.height`) is written by `applyLayout`
**inside** the next paint, on `requestAnimationFrame`.

- `scrollToRow(row)` — the row set has not changed. One frame faster, which keyboard navigation
  can feel.
- `scrollToRowAfterPaint(row)` — the caller has just changed the row set. Measured: expanding a
  folder and scrolling immediately lands at 600px where the target needs 1020px, silently, with
  nothing re-issuing the request. A `setTimeout(0)` does not help: it runs after the microtask that
  recomputes the geometry but before the frame that applies it.

The symptom of getting this wrong is not an error or a blank row — the list renders perfectly and is
simply scrolled to the wrong place.

**A parent therefore must not split "the rows changed" and "the highlight moved" into two state
writes.** The host picks its entry point from `contentChanged && activeIndex !== lastActiveIndex` in
one `onUpdate`, so one write means one push carrying both, and it chooses `scrollToRowAfterPaint`
correctly. Two writes give the second push `contentChanged === false` and it picks `scrollToRow`.
That survives by accident while the grid is still unmeasured — the engine's pending slot catches it —
and stops surviving the moment the row set changes on a measured grid. `SelectModel.commitLoaded`
assigns the seeded `activeIndex` in the same `state.update` as `loadedItems` for this reason, and
`openInto`/`closeInto` exist so a caller that must produce one write can compose draft mutators
instead of calling two setters.

#### React-valued slots inside a virtualized row

`ListBox` keeps a `renderItem` prop returning `ReactNode`, and `ListItem`'s `label`, `trailing` and
`tooltip` accept React values. **`icon` no longer does** — EPIC-064 narrowed `IconRef` to
`IconName | Node`, so an icon is a registry name or a DOM node and never a React element; no call
site in the tree passes React for an icon. The remaining React-valued slots are allowed, and are not
a reopening of C3-1's rejected "React root per cell": the
engine's cell contract is still `HTMLElement` and `VirtualGrid` never sees React. Four guard rails
keep it from creeping:

- Decide **per slot**, not per row: an `IconName` becomes a DOM `svg` with no root; only a genuine
  React value goes through `fillSlot`. Never route strings through `fillSlot` for uniformity.
- A DOM icon node is **single-use**: appending it to a second host *moves* it and blanks the first.
  Build it at the point of use — never cache, memoise, hoist to module scope, or share one node.
  `tsc`, lint and the build are all blind to this, and the symptom is an icon disappearing somewhere
  *other* than the code being changed (EPIC-064 hit it four times, once per caching mechanism).
- Roots are retained **per pooled element**, never per row. The pool's refusal to reset a released
  element is exactly what makes that work; a settled scroll must create zero roots.
- Never run a slot cleanup on eviction — only at view disposal. Track created elements in a real
  `Set`, because an unmounted-but-undisposed root keeps its subscriptions alive on a detached tree.
- Key the caller's subtree by the cell key, so a recycled element remounts it rather than letting
  one row's state bleed into another's.

### Structural helpers and React boundaries

- Claim a child with `this.child(view)` exactly once. Ownership is enforced by the shared marker;
  an already-owned view throws. Use `this.listen` and `this.own` for cleanup, and register
  constructor-created resources before mount-created resources because disposal is FIFO.
- `KeyedList` validates all keys before mutation, removes and detaches deleted nodes, creates
  missing nodes, reconciles order with its cursor without re-inserting an already-correct node,
  then updates every record. `SubtreeSwap` owns one conditional root and inserts a replacement
  before disposing and detaching the old branch. Both helpers detach their managed nodes; this is
  deliberately different from `VanillaView.dispose()`.
- `mountVanilla` is a React boundary with a module-level stable host component. It appends the
  root before `mount()`, skips the redundant first `update`, and replaces the view only when the
  constructor identity changes. Do not define the host inside `mountVanilla` or use a changing key.
- `PopoverView`'s `contentView?: (host) => IOwnedView` keeps the floating root's children native
  DOM. A native content view must use this seam; the `children` arm is React compatibility and
  mounts a nested React root. The seam has two properties the prop's type does not show. **It never
  appends what the factory returns** — `PopoverFloatingView.onMount` only claims it with `child()` and mounts it, so the
  factory attaches its own DOM (`host.append(view.root)`) or the dropdown renders empty. And **it is
  not an update channel**: `PopoverFloatingView.onUpdate` forwards nothing to the content view, so
  the parent pushes the content's props itself, from its own single consequence, and keeps a *bare*
  reference to it — a second `child()` claim throws on the shared marker. `MenuView`'s
  `MenuContentView` reads its model live instead, which works only because nothing but state changes
  a menu's output; `SelectView` pushes typed `ListBoxProps`, because `items`, `emptyMessage`,
  `rowHeight` and the filter can all move with no state write.
- **A `contentView` whose content is more than one sibling must *adopt* the host as its root**
  (`super(props, host)`), not wrap it. `MenuContentView` and `AutocompleteContentView` both do.
  A real wrapper element becomes the popover's sole flex item, moving the `overflow`/shrink
  semantics down a level; a `display: contents` wrapper preserves layout but stops the children being
  *direct* children of `.popover-shell`, which a `:scope >` query and an agent reading the tree can
  both see. Adoption means the factory appends nothing — the view's own appends land on the host —
  so **the two factory shapes look different on purpose**: `SelectView`'s must `host.append` because
  a `ListBoxView` builds its own detached root, and `AutocompleteView`'s must not. The price of
  adoption is three writes the content view may never make on `this.root`, because
  `PopoverFloatingView` reasserts them on every update and wins silently: `dataset.type`, any
  `className` assignment, and `replaceChildren` (the resize handle is appended to that same root
  *after* the content mounts). Tag children instead. Name the three in the class comment — the
  failure mode is an attribute reverting one update later, not an exception.
- `mountReact` is only a temporary seam when a vanilla view owns a React subtree with no vanilla
  equivalent yet. The view owns the host element and the returned disposer owns the React root;
  neither adapter is a substitute for converting an ordinary parent or child.
- `fillSlot` **owns the host element it is given.** Call it again to change the content; never run
  the previous cleanup first, and never write to that host directly (`replaceChildren`, `append`,
  `textContent`) behind its back. It caches per-host state so a React→React change re-renders the
  existing root instead of building a new one — pre-clearing throws that away and remounts the
  root on every update, which resets any state inside the slot. A superseded cleanup is a no-op on
  its own, so there is nothing to clean up manually. When a view needs several nodes in one slot
  (an icon plus a label), pass a `DocumentFragment`, so the children still land as direct children
  of the host and the host's own `gap` still applies.

### Converting an existing React component

- **Account for every field, not every prop.** The prop *interface* is usually carried over intact,
  so a diff of the type looks complete while a field the old JSX read is silently never forwarded
  to the vanilla view. Check the fields of item/data types too (`ISegment.label`, option shapes,
  row descriptors) — those are read inside the old render body, not named in the component's props,
  and are the ones that go missing. The symptom is not an error: the element renders with correct
  size, styling and handlers, and is simply empty.
- **A converted primitive that renders blank is a content bug, not a CSS bug.** Backgrounds are
  transparent on several variants, so an empty element is invisible while still being hoverable
  and clickable. Check the DOM for the missing child before reading the stylesheet.

See the PathInput pilot at `uikit/PathInput/PathInputView.tsx` for the complete working shape.

---

## Focus-aware list selection (shared contract)

Selectable lists share one focus-aware selection look (the Explorer file-tree behavior): a
selected/active row shows a subtle **gray** background when its list is **not** focused, and a
**blue** background + blue outline when the list **is** focused. This is pure CSS — no JS focus
state. It was built from three fragments in `shared/selection-style.ts`, which **no longer exists**
(EPIC-056 C3-7, deleted in US-1015); the table below records the shape each surviving copy took and
which fragment it descends from. It is gated by a container attribute:

| Fragment | Applied on | Purpose |
|----------|-----------|---------|
| `rowSelectionBase` | the **row**'s styled block (self-selector spread) | blurred base — `[data-selected]` → `background.light`, `[data-active]:not([data-selected])` → `background.message` |
| `focusSelectionOverride(rowSelector)` | the focusable **container**'s styled block | focused override for rows that are *descendants* of the container (e.g. `Tree` → `TreeItem`, `CategoryList` → its rows) |
| `rowFocusSelectionOverride(rowMatch)` | the **row**'s own styled block | focused override for a row primitive used *without* its own styled container (e.g. `ListItem` outside `ListBox`, `SelectableRow`) — matches whenever the row sits inside any focused-within `[data-focus-selection]` ancestor |

**The module is gone; there are now four independent per-component copies.** `ListItem.css` holds a
hand-translated `rowSelectionBase` + `rowFocusSelectionOverride` scoped to `[data-type="list-item"]`;
`TreeItem.css` holds the blurred base and `Tree.css` the focused override; `SelectableRow.css` and
`CategoryList` hold their own; and `ui/sidebar/FolderItem.tsx` has the two fragments inlined into its
own Emotion block, which is where the module finally died (its last consumer was app-layer, two
epics away from conversion). Each copy is scoped to its own component root, so they cannot collide.
The rule order *inside* each block is load-bearing, which is why a shared stylesheet was not worth
the cross-file source-order dependency.

**Two traps this split leaves behind.** First, `Tree`'s focused override lives on the *container*,
so its CSS selector must keep a `[data-type="tree"]` anchor — the Emotion original was scoped to the
component's generated class, and an unanchored translation becomes a global rule that paints any
`TreeItem` under any opted-in container, including one rendered through a `ListBox`'s `renderItem`.
Second, `TreeItem.css` deliberately does **not** carry `ListItem`'s `:not([data-drop-active])`
carve-out: Tree's override outranks its drop rule on specificity (0,5,0 against 0,2,0) rather than
on source order, so adding the exclusion would change behaviour rather than preserve it.

**For whoever converts `FolderItem`:** its stylesheet must land in `@layer app`, never `@layer
uikit`. Unlayered Emotion currently outranks every layered rule regardless of specificity, so the
row wins today by origin; in `uikit` it would fight `ListItem.css` on source order instead.

**How a container opts in:** set `data-focus-selection` **and** `tabIndex={0}` on the scroll
container so `:focus-within` can trigger on click. `ListBox` does this for you via
`selectionStyle="focus"` (works even with a custom `renderItem`); `Tree` via its `focusSelection`
prop (or `keyboardNav`, which implies it). For a plain container you own, pass `tabIndex={0}` +
`data-focus-selection=""` directly (a `Panel` forwards both via `...rest` — Rule 7 clean).

**The rows.** A row that rides a shared primitive (`ListItem`, `TreeItem`) already carries the
focus-mode CSS. For a **bespoke** row in editor code that can't use Emotion (Rule 7), wrap the
row content in the **`SelectableRow`** primitive — a layout-neutral `<div>` that composes
`rowSelectionBase` + `rowFocusSelectionOverride` verbatim and exposes `selected` / `active` props.
It is content-height (no percentage height), so a single child provides the layout; give that
child `flex={1}`/`minWidth={0}` where it must stretch, and size it to the grid `rowHeight` in a
virtualized list.

**Descendants that declare their own colors.** All three fragments paint only `backgroundColor`,
`color`, and `outline` on the matched row itself. Label text follows because it inherits the
row's `color` — but any descendant that sets a color of its own silently opts out of the state
change. A row primitive with such children must restate them under the same
`[data-focus-selection]:focus-within &[data-selected]` ancestor selector, so the rule activates
in exactly the states the container override does. `TreeItem` does this for its two: the chevron
(which sets `icon.default`) takes `icon.selection`, and the level guides (`border.light`) go
`borderLeftColor: transparent` — invisible against the highlight, rather than needing a guide
color that reads correctly against both the row and the selection background in every theme.
Both are targeted through plain child-hook classes (`.tree-chevron`, `.tree-indent`), which
express structure, not state, so Rule 1 still holds.

No new color tokens are needed — the look reuses `background.light` / `background.message`
(blurred) and `background.treeSelection` / `border.active` / `text.selection` / `icon.selection`
(focused), all defined in every theme.

**Multi-selection needs nothing extra.** The fragments key off each row's own `[data-selected]`, so
N selected rows paint correctly with no styling change — `[data-active]` stays singular (one
highlighted row). `Tree` supports opt-in multi-selection via `multiSelect` (Ctrl/Shift+click,
Ctrl+A, Shift+Arrow/Home/End/PageUp/Down): it stores **no** selection, derives the current set by
calling `isSelected` per visible row, keeps only a transient anchor, and emits the resulting set
through `onSelectionChange` for the consumer to store — Rule 2, with the range math staying in the
Tree because it alone knows the flat visible row order.

**A transient row state that must outrank selection.** `ListItem` also accepts `dropActive`, which
marks the row currently under a drag (`data-drop-active` → selection background plus a
`border.active` outline). Selection is persistent and drop-target is momentary, so the momentary
one has to win — but the focused-selection override is *more* specific by one attribute and would
otherwise swallow it. The fix belongs at the source, not in an `!important`: `ListItem` narrows the
`rowMatch` it hands `rowFocusSelectionOverride` with `:not([data-drop-active])`, so the two rules
are mutually exclusive by construction. Anything adding a similar transient state should carve it
out of the selection override the same way, and keep the exclusion in the row primitive where both
rules are visible together.

---

## Naming conventions

### Component names

Use the canonical naming table in this guide. Never use old names from
`src/renderer/components/`.

| Old name | New name |
|----------|----------|
| `SwitchButtons` | `SegmentedControl` |
| `ComboSelect` | `Select` |
| `ListMultiselect` | `MultiSelect` |
| `List` | `ListBox` |
| `Popper` | `Popover` |
| `PopupMenu` | `Menu` |
| `TreeView` | `Tree` |
| `Chip` | `Tag` |
| `CircularProgress` | `Spinner` |
| `FlexSpace` | `Spacer` |
| `TextAreaField` | `Textarea` |
| `OverflowTooltipText` | `TruncatedText` |

### Prop names

Use predictable, self-documenting names. An AI agent reading the prop should understand it without opening the file.

| Concept | Use | Avoid |
|---------|-----|-------|
| Current value | `value` | `val`, `selectedValue`, `currentItem` |
| Change handler | `onChange` | `onValueChange`, `onSelect`, `handleChange` |
| Disabled state | `disabled` | `isDisabled`, `enabled` (inverted) |
| Loading state | `loading` | `isLoading`, `pending` |
| Open/closed | `open` | `isOpen`, `visible`, `show` |
| Open change handler | `onOpenChange` | `onToggle`, `setOpen` |
| List of options | `items` | `options`, `data`, `list` |
| Click handler | `onClick` | `onPress`, `handleClick` |
| Icon element | `icon` | `iconLeft`, `startIcon`, `leftAdornment` |
| Placeholder text | `placeholder` | `hint`, `hintText` |
| Debug identifier | `name` (→ `data-name`) | `id`, `debugId`, `label` |

### Boolean props

- Name as adjectives, not questions: `disabled` not `isDisabled`, `loading` not `isLoading`
- Default to `false` — caller opts in to the special state

---

## Styling rules

These rules describe the target for converted components. Existing Emotion implementations may
keep the legacy form until their conversion task, but a converted subtree must not mix Emotion and
plain CSS. Import `Component.css` from the owning component, wrap rules in `@layer uikit`, and
scope every selector from the component's `[data-type]` root. The startup layer order is
`@layer base, uikit, app, editor;`. Use established `data-part` names for internal structure;
do not rename them or replace state attributes with classes. Parent-owned descendant selectors are
allowed when they target a child's `[data-type]` or `[data-part]` and preserve the documented
owner relationship.

**An element inside a portalled branch needs a root-level `data-type` hook.** Scoping every
selector from the component's own `[data-type]` root is the rule, and it silently cannot work for
DOM the component renders into `#persephone-overlay-layer` — a popover's contents are not
descendants of the component root. Give that element its own `data-type` and select on it
unqualified. `[data-type="popover-resize-handle"]` and `[data-type="autocomplete-header"]` are the
two instances. Do not reach for `[data-type="popover"] > [data-part="…"]` (it claims every other
component's popover) or for `data-name` (which
[ui-element-contract.md](../../../doc/architecture/ui-element-contract.md) reserves as an addressing
handle, never a styling hook).

**Direct vanilla views must import borrowed styles explicitly.** A view that constructs another
converted component's DOM directly, or calls a shared attribute helper such as
`applyTextAttributes()`, cannot rely on the React face's stylesheet import or on a type-only
component import to load CSS. Import the borrowed component stylesheet alongside the view's own
stylesheet. This keeps direct-view bundles correct when the React face is not present in the
module graph.

**The `[hidden]` counter-rule is required when a root sets `display`.** The browser's user-agent
`[hidden]` rule can lose to an author `display` rule, so every converted root whose stylesheet sets
`display` must also declare `<root-selector>[hidden] { display: none; }` in the same `@layer`.
Keep the selector scoped to that component root; app-owned roots use their own local equivalent.

### Colors

Never use hex codes, `rgb()`, or named colors. Always import from `color.ts`:
```ts
import color from "../../theme/color";
// (adjust relative path based on component subfolder depth)
```

If a needed color is missing from `color.ts`, add it there and in all theme definitions under `src/renderer/theme/themes/`.

### Design tokens

Use constants from `uikit/tokens.ts` for all spacing, sizing, border-radius, and font-size values:
```ts
import { spacing, radius, fontSize, height, gap } from "../tokens";
```

Never hardcode pixel values that exist in the token scale.

### Emotion conventions

- One `styled.*` per logical DOM element
- All interactive states (`:hover`, `[data-*]`) go inside the same `styled` definition — no scattered overrides elsewhere
- Always include `{ label: 'ComponentName' }` as the second argument for DevTools readability

---

## Accessibility

- Always set `data-type` on the root element
- Use semantic HTML elements: `<button>` not `<div>` for clickable things, `<input>` for text input, etc.
- Forward `aria-*` and `role` props to the underlying element via `...rest`
- Never suppress the browser focus ring without providing an alternative focus indicator

---

## Component file template

```tsx
import React from "react";
import styled from "@emotion/styled";
import color from "../../theme/color";
import { fontSize, height, spacing } from "../tokens";

// --- Types ---

export interface ButtonProps {
    /** Optional debug label emitted as `data-name` on the root element. Use to disambiguate
     *  multiple instances of this primitive in DOM inspector output. Never used for styling. */
    name?: string;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    variant?: "default" | "danger" | "ghost";
    size?: "sm" | "md" | "lg";
    icon?: React.ReactNode;
}

// --- Styled ---

const Root = styled.button({
    display: "inline-flex",
    alignItems: "center",
    gap: spacing.sm,
    cursor: "pointer",
    border: "none",
    background: "transparent",

    "&[data-disabled]": {
        opacity: 0.4,
        pointerEvents: "none",
    },
    '&[data-variant="danger"]': {
        color: color.button.dangerFg,
    },
    '&[data-size="sm"]': {
        height: height.controlSm,
        fontSize: fontSize.sm,
        padding: `0 ${spacing.sm}px`,
    },
    '&[data-size="md"]': {
        height: height.controlMd,
        fontSize: fontSize.base,
        padding: `0 ${spacing.md}px`,
    },
}, { label: "Button" });

// --- Component ---

export function Button({
    name,
    label,
    onClick,
    disabled,
    variant = "default",
    size = "md",
    icon,
}: ButtonProps) {
    return (
        <Root
            data-type="button"
            data-name={name}
            data-disabled={disabled || undefined}
            data-variant={variant}
            data-size={size}
            onClick={disabled ? undefined : onClick}
        >
            {icon}
            {label}
        </Root>
    );
}
```

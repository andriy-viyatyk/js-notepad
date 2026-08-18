# UIKit — Component Authoring Guide

This folder contains Persephone's new component library (`src/renderer/uikit/`).
Every component in this folder **must** follow these rules. Read this file before creating or modifying any component here.

---

## Folder structure

Each component lives in its own subfolder:

```
uikit/
  tokens.ts              ← design token constants (US-426)
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
    icon?: React.ReactNode;
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
escape hatch (e.g. `style?: Pick<CSSProperties, "color" | …>`) may be added — see EPIC-025
Phase 6 (Script UI API). Until then, no escape hatch.

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

**Foundational compositional primitive exception (`RenderGrid` / `RenderFlexGrid`)**

`uikit/RenderGrid/` and `uikit/RenderFlexGrid` expose `className`, `contentProps`,
`renderAreaProps`, and `blockStyles` as part of their public API. These are not
violations of Rule 7 — they are the API. RenderGrid is a multi-region composition
(sticky-top, sticky-bottom, sticky-left, sticky-right, sticky-corners, render area)
whose entire purpose is to host caller-styled regions. AVGrid and editor lists rely
on these slots to paint region backgrounds and wire region-level event handlers.

The Omit-style enforcement (`extends Omit<HTMLAttributes<…>, "style" | "className">`)
applies to primitives that wrap a single HTML element (Button → button, Input →
input). RenderGrid does not extend `HTMLAttributes`, so the type-level guard is
not applicable in the first place — its props are an explicit, hand-crafted surface.

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

## Focus-aware list selection (shared contract)

Selectable lists share one focus-aware selection look (the Explorer file-tree behavior): a
selected/active row shows a subtle **gray** background when its list is **not** focused, and a
**blue** background + blue outline when the list **is** focused. This is pure CSS — no JS focus
state — built from three fragments in `shared/selection-style.ts` and gated by a container
attribute:

| Fragment | Applied on | Purpose |
|----------|-----------|---------|
| `rowSelectionBase` | the **row**'s styled block (self-selector spread) | blurred base — `[data-selected]` → `background.light`, `[data-active]:not([data-selected])` → `background.message` |
| `focusSelectionOverride(rowSelector)` | the focusable **container**'s styled block | focused override for rows that are *descendants* of the container (e.g. `Tree` → `TreeItem`, `CategoryList` → its rows) |
| `rowFocusSelectionOverride(rowMatch)` | the **row**'s own styled block | focused override for a row primitive used *without* its own styled container (e.g. `ListItem` outside `ListBox`, `SelectableRow`) — matches whenever the row sits inside any focused-within `[data-focus-selection]` ancestor |

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

Use the names from the US-438 naming table. Never use old names from `src/renderer/components/`.

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

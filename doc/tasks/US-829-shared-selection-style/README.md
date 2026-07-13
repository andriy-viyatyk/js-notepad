# US-829: Shared focus-aware selection style

**Epic:** [EPIC-041 — Unified Focused/Unfocused List Selection](../../epics/EPIC-041.md)
**Status:** Implemented — pending visual verification (typecheck + lint green)

## Goal

Extract the Explorer file-tree's two-state ("gray when blurred / dark-blue + blue border when
focused") selection styling into a **single shared source of truth**, and wire it into the two
shared list primitives (`Tree`/`TreeItem` and `ListBox`/`ListItem`) so any list can opt into the
Explorer look with one prop. **No user-visible surface changes in this task** except that the
Explorer tree (the reference) must remain pixel-identical. This is the foundation for US-830
(prop-flip consumers) and US-831 (bespoke-row retrofits).

## Background

### The reference mechanism (verified)

The two-state selection is pure CSS — **no JS focus state**. It is split across two elements:

- **Row (unfocused base):** `TreeItem` (`src/renderer/uikit/Tree/TreeItem.tsx:96-101`) paints the
  blurred look on itself:
  ```ts
  "&[data-active]:not([data-selected])": { backgroundColor: color.background.message }, // hover/active gray
  "&[data-selected]":                     { backgroundColor: color.background.light },   // selected gray
  ```
- **Container (focused override):** `Tree` (`src/renderer/uikit/Tree/Tree.tsx:42-51`) overrides it
  via `:focus-within`, gated on `data-keyboard-nav`:
  ```ts
  '&[data-keyboard-nav]:focus-within [data-type="tree-item"][data-selected]': {
      backgroundColor: color.background.treeSelection,
      color: color.text.selection,
      outline: `1px solid ${color.border.active}`,
      outlineOffset: -1,
  },
  '&[data-keyboard-nav]:focus-within [data-type="tree-item"][data-active]': {
      outline: `1px solid ${color.border.active}`,
      outlineOffset: -1,
  },
  ```
- **Focusability:** `Tree.tsx:316` sets `tabIndex={keyboardNav ? 0 : -1}` on the root
  `<div data-type="tree">`; `:314` sets `data-keyboard-nav`. So the container is a tab stop and
  clicking a (non-focusable) row lands focus on the container → `:focus-within` matches. Explorer
  opts in because `TreeProviderView.tsx:351` passes `keyboardNav`.

**Consequence (the thing to fix):** focus-styling is bundled with keyboard navigation — a list
can't get the focus look without also enabling arrow-key nav. This task decouples them with a new
`data-focus-selection` gate (see below), while keeping `keyboardNav` implying it for back-compat.

### Tokens (already exist — `src/renderer/theme/color.ts`, defined in all 10 themes)

| Role | Token |
|------|-------|
| Unfocused selected bg | `color.background.light` |
| Unfocused hover/active bg | `color.background.message` |
| Focused selected bg | `color.background.treeSelection` |
| Focused selection outline | `color.border.active` |
| Focused selected text | `color.text.selection` |

No new tokens are required.

### ListBox / ListItem today

- `ListItem` (`src/renderer/uikit/ListBox/ListItem.tsx:85-95`) has `variant` (`select`/`browse`)
  and `selectionStyle` (`check`/`accent`). `accent` → loud `color.background.selection`;
  `browse` hover → `color.background.message`. **No `:focus-within` rule at all.**
- `ListBox` (`src/renderer/uikit/ListBox/ListBox.tsx:20-29`, `191-201`) root is a
  `<div data-type="list-box">`, `tabIndex={keyboardNav ? 0 : -1}`, forwards `variant` +
  `selectionStyle` to the default `ListItem`.

### Existing UIKit conventions to follow

- Shared internal helpers live in `src/renderer/uikit/shared/` (e.g. `highlight.ts`) and are
  imported directly (`../shared/highlight`) — **not** re-exported from a public index.
- Colors from `color.ts`; data-attributes for state; `{ label: "…" }` on every `styled`.
- `@emotion/react` is available in this codebase (used by `GlobalStyles.tsx`); `CSSObject`
  imports from there.

## Design decision

Keep the **row-owns-base / container-owns-focused-override** split (it is exactly how Explorer
works today, so the Tree half is behavior-identical), but move both halves into one shared module
and switch the container gate from `data-keyboard-nav` to a dedicated `data-focus-selection`
attribute:

- **`rowSelectionBase`** — the blurred row backgrounds, applied on the *row* styled block
  (`TreeItem`, and `ListItem`'s new `focus` mode).
- **`focusSelectionOverride(rowSelector)`** — the `:focus-within` blue override, applied on the
  *container* styled block (`Tree` root, `ListBox` root), gated on `data-focus-selection`.
- A container opts in by (a) carrying `data-focus-selection` and (b) being focusable
  (`tabIndex=0`). `keyboardNav` implies both (back-compat); a new `focusSelection` prop enables
  them **without** arrow-key nav.

`ListItem` gains a third `selectionStyle="focus"` that uses `rowSelectionBase` (gray) instead of
`accent`'s loud fill. It is designed to pair with `variant="browse"` (whose `:hover` = gray
`background.message`, matching the blurred hover). The four `accent`/`check`/`select`/`browse`
behaviors are untouched.

## Implementation plan

### Step 1 — New shared module `src/renderer/uikit/shared/selection-style.ts`

```ts
import type { CSSObject } from "@emotion/react";
import color from "../../theme/color";

/**
 * Blurred-state row backgrounds for a focus-aware selectable list (the Explorer look
 * when its list is NOT focused). Applied on the ROW element's own styled block via a
 * self-selector spread. The row must carry `data-selected` / `data-active`.
 *
 * Pairs with `focusSelectionOverride`, which adds the focused (`:focus-within`) blue
 * override on the container.
 */
export const rowSelectionBase: CSSObject = {
    "&[data-active]:not([data-selected])": {
        backgroundColor: color.background.message,
    },
    "&[data-selected]": {
        backgroundColor: color.background.light,
    },
};

/**
 * Focused-state override for a focus-aware selectable list (the Explorer look when its
 * list IS focused): selected row → blue background + blue outline; active row → blue
 * outline. Applied on the focusable CONTAINER's styled block.
 *
 * Gated on `data-focus-selection` so it is inert unless the container opts in, and scoped
 * to `rowSelector` (the descendant row element carrying `data-selected` / `data-active`).
 * The container must be focusable (`tabIndex=0`) for `:focus-within` to trigger on click.
 *
 * VS Code mapping: treeSelection = list.activeSelectionBackground,
 * text.selection = list.activeSelectionForeground, border.active = focusBorder.
 */
export function focusSelectionOverride(rowSelector: string): CSSObject {
    return {
        [`&[data-focus-selection]:focus-within ${rowSelector}[data-selected]`]: {
            backgroundColor: color.background.treeSelection,
            color: color.text.selection,
            outline: `1px solid ${color.border.active}`,
            outlineOffset: -1,
        },
        [`&[data-focus-selection]:focus-within ${rowSelector}[data-active]`]: {
            outline: `1px solid ${color.border.active}`,
            outlineOffset: -1,
        },
    };
}
```

### Step 2 — `Tree` root: consume the shared override + new gate (`src/renderer/uikit/Tree/Tree.tsx`)

**2a.** Add import (after line 3, `import color …`):
```ts
import { focusSelectionOverride } from "../shared/selection-style";
```

**2b.** Replace the inline focus rules in the `Root` styled block (lines 35-51, the comment block
+ the two `&[data-keyboard-nav]:focus-within …` rules) with a single spread. Before:
```ts
        // Focused-tree row visuals — only for trees that opt into keyboardNav …
        '&[data-keyboard-nav]:focus-within [data-type="tree-item"][data-selected]': { … },
        '&[data-keyboard-nav]:focus-within [data-type="tree-item"][data-active]': { … },
```
After:
```ts
        // Focused-list selection visuals (gray when blurred → blue + outline when the tree
        // is focused). Shared with ListBox via uikit/shared/selection-style. Gated on
        // data-focus-selection; inert for trees that don't opt in.
        ...focusSelectionOverride('[data-type="tree-item"]'),
```

**2c.** Destructure the new `focusSelection` prop (in the big destructure starting line 104):
```ts
        keyboardNav = false,
        focusSelection = false,   // ← add
```

**2d.** Compute a single "focus-aware" flag once (near the top of the render body, after the
destructure), then apply it to all three `<Root>` render sites (loading `:272`, empty `:290`,
main `:310`). Add `data-focus-selection` alongside the existing `data-keyboard-nav`, and widen
`tabIndex`:
```ts
const focusAware = keyboardNav || focusSelection;
// …
<Root
    …
    data-keyboard-nav={keyboardNav || undefined}
    data-focus-selection={focusAware || undefined}   // ← add (all 3 sites)
    tabIndex={focusAware ? 0 : -1}                    // ← was: keyboardNav ? 0 : -1 (main site only)
    …
/>
```
(The loading/empty roots have no rows and no `tabIndex`; add only `data-focus-selection` there for
consistency — harmless. The `tabIndex` change is only on the main render site at line 316.)

### Step 3 — `TreeItem`: source base from the shared const (`src/renderer/uikit/Tree/TreeItem.tsx`)

**3a.** Add import (after line 3):
```ts
import { rowSelectionBase } from "../shared/selection-style";
```
**3b.** Replace the two base rules (lines 96-101) with a spread — behavior-identical (same tokens),
now single-sourced. Keep the surrounding `data-disabled`, `data-dragging`, `data-drop-active`,
`data-loading` rules exactly as-is and in the same order (drop-active must still come after
selected so it wins). Before:
```ts
        "&[data-active]:not([data-selected])": { backgroundColor: color.background.message },
        "&[data-selected]": { backgroundColor: color.background.light },
```
After:
```ts
        ...rowSelectionBase,
```

### Step 4 — `ListItem`: add `selectionStyle="focus"` (`src/renderer/uikit/ListBox/ListItem.tsx`)

**4a.** Add import (after line 3):
```ts
import { rowSelectionBase } from "../shared/selection-style";
```
**4b.** Widen the `selectionStyle` prop type + doc (line 58):
```ts
    selectionStyle?: "check" | "accent" | "focus";
```
Add a doc bullet: `• "focus" — focus-aware selection (Explorer look): gray when the list is
blurred, blue + outline when focused. Pair with variant="browse". No default trailing icon.`

**4c.** Add the focus-mode base rule to the `Root` styled block (after the accent rule at line
92-95). Nesting under `[data-selection-style="focus"]` scopes `rowSelectionBase`'s self-selectors
to focus rows only (Emotion concatenates the nested `&`):
```ts
        '&[data-selection-style="focus"]': {
            ...rowSelectionBase,
        },
```
**4d.** Suppress the default trailing icon in focus mode (line 138-142):
```ts
    const defaultTrailing = selected && showSelectionIcon && selectionStyle !== "focus"
        ? selectionStyle === "accent"
            ? <ChevronRightIcon />
            : <CheckIcon />
        : null;
```

### Step 5 — `ListBox` root: consume the shared override + gate (`src/renderer/uikit/ListBox/ListBox.tsx`)

**5a.** Add import (after line 3):
```ts
import { focusSelectionOverride } from "../shared/selection-style";
```
**5b.** Add the override to the `Root` styled block (inside the object at lines 20-29):
```ts
        "&[data-disabled]": { opacity: 0.6, pointerEvents: "none" },
        ...focusSelectionOverride('[data-type="list-item"]'),   // ← add
```
**5c.** On the main `<Root>` (lines 191-201) set the gate + focusability. `selectionStyle` is
already destructured (line 81):
```ts
const focusAware = keyboardNav || selectionStyle === "focus";
// …
<Root
    …
    data-focus-selection={selectionStyle === "focus" || undefined}   // ← add
    tabIndex={focusAware ? 0 : -1}                                    // ← was: keyboardNav ? 0 : -1
    …
/>
```
(Loading/empty roots: optional `data-focus-selection`; not required — no rows.)

### Step 6 — Prop-type: add `"focus"` to `ListBoxProps.selectionStyle` (`src/renderer/uikit/ListBox/types.ts`)

Line 147:
```ts
    selectionStyle?: "check" | "accent" | "focus";
```
Extend the doc block (lines 138-146) with the same `"focus"` bullet as Step 4b.

### Step 7 — Prop-type: add `focusSelection` to `TreeProps` (`src/renderer/uikit/Tree/types.ts`)

After the `keyboardNav` prop (line 216):
```ts
    /**
     * Enables the focus-aware selection styling (Explorer look: gray when the tree is blurred,
     * blue + outline when focused) and makes the tree root focusable, WITHOUT enabling
     * arrow-key navigation. `keyboardNav` implies this. Default: false.
     */
    focusSelection?: boolean;
```

### Step 8 — Verification story (optional but recommended)

Add a `selectionStyle="focus"` case to `src/renderer/uikit/ListBox/ListBox.story.tsx` (a
`variant="browse"` list) so the ListBox focus behavior can be visually verified in the Storybook
editor during this task, before any real consumer is switched in US-830. Mirror the existing
story structure in that file (read it first). If the file's structure makes this awkward, skip and
rely on US-830's first consumer.

## Concerns / open questions

| # | Concern | Resolution |
|---|---------|------------|
| C1 (epic) | **Will focus actually land in the list?** `:focus-within` needs focus inside the focusable container. This task makes the containers focusable exactly as Explorer's Tree already is, so the mechanism is proven for Tree. For ListBox/bespoke containers it is verified per-surface in US-830/831. Not a blocker for US-829. |
| C2 (epic) | **Decouple focus-styling from keyboard-nav.** Resolved here: new `data-focus-selection` gate + `focusSelection` prop (Tree) / `selectionStyle="focus"` (ListBox) enable the look without arrow-nav; `keyboardNav` still implies it. |
| I1 | **Explorer regression risk.** The Tree/TreeItem edits must be behavior-identical for `keyboardNav` consumers. `data-focus-selection` is set whenever `keyboardNav` is true, and the tokens/rules are unchanged — so Explorer, Rest Client tree, and Notebook Categories (all Tree consumers) render exactly as before **until** US-830 opts them in. Explorer is the live regression guard (it uses `keyboardNav`). |
| I2 | **`focus` mode must pair with `variant="browse"`.** `variant="select"` `:hover`/`[data-active]` paints the loud `background.selection`, which would fight the gray blurred look. All US-830 ListBox targets (MCP Tools, Storybook, Link surfaces) already use `variant="browse"`. Documented in the prop doc; not enforced in code. |
| I3 | **Active-row blue outline needs `activeIndex` wiring.** The focused active-row outline only appears when a row carries `data-active`, which ListBox sets from the controlled `activeIndex`. Consumers that don't wire `activeIndex`/`onActiveChange` still get correct selected-row styling and `:hover` gray; they simply won't get the keyboard-cursor outline. Acceptable — not required for US-829. |
| I4 | **Keep emitting `data-keyboard-nav`.** Do not remove `data-keyboard-nav` from the Tree root — scripts/tests/agents may query it. Styling moves to `data-focus-selection`; both attributes coexist. |
| I5 | **`CSSObject` import path.** Use `import type { CSSObject } from "@emotion/react"` (confirmed available). If the spread into a `styled.div({...})` object argument trips a type error, `CSSObject` from `@emotion/serialize` is the fallback. |

## Acceptance criteria

- [ ] New `src/renderer/uikit/shared/selection-style.ts` exports `rowSelectionBase` and
  `focusSelectionOverride(rowSelector)`.
- [ ] `Tree`/`TreeItem` consume the shared helpers; the inline focus rules and inline base rules
  are gone (single-sourced). `Tree` accepts a `focusSelection` prop and emits
  `data-focus-selection` + `tabIndex=0` when `keyboardNav || focusSelection`.
- [ ] `ListItem` accepts `selectionStyle="focus"` (gray base, no default trailing icon);
  `ListBox` emits `data-focus-selection` + is focusable in focus mode and carries the override.
- [ ] `ListBoxProps.selectionStyle` and `ListItemProps.selectionStyle` include `"focus"`;
  `TreeProps` includes `focusSelection`.
- [ ] `npm run lint` and a typecheck/build are clean.
- [ ] **Explorer panel is pixel-identical** to before (unfocused gray, focused blue + border,
  hover, drag/drop-active, arrow-key nav) — the primary regression guard.
- [ ] (If Step 8 done) The Storybook ListBox `focus` story shows gray-when-blurred /
  blue+outline-when-focused.

## Files changed

| File | Change |
|------|--------|
| `src/renderer/uikit/shared/selection-style.ts` | **New.** `rowSelectionBase` + `focusSelectionOverride`. |
| `src/renderer/uikit/Tree/Tree.tsx` | Import + spread `focusSelectionOverride`; `focusSelection` prop; `data-focus-selection` + widened `tabIndex` on Root (3 sites). |
| `src/renderer/uikit/Tree/TreeItem.tsx` | Import + spread `rowSelectionBase` (replaces inline base rules). |
| `src/renderer/uikit/Tree/types.ts` | Add `focusSelection?: boolean` to `TreeProps`. |
| `src/renderer/uikit/ListBox/ListItem.tsx` | Import `rowSelectionBase`; `selectionStyle="focus"` type + rule; suppress default trailing in focus mode. |
| `src/renderer/uikit/ListBox/ListBox.tsx` | Import + spread `focusSelectionOverride`; `data-focus-selection` + widened `tabIndex` on Root. |
| `src/renderer/uikit/ListBox/types.ts` | Add `"focus"` to `ListBoxProps.selectionStyle`. |
| `src/renderer/uikit/ListBox/ListBox.story.tsx` | (Optional) add a `selectionStyle="focus"` story. |

## Files that need NO changes

- `src/renderer/theme/color.ts` and `src/renderer/theme/themes/*` — all required tokens
  (`background.light`, `background.message`, `background.treeSelection`, `border.active`,
  `text.selection`) already exist in every theme.
- `src/renderer/uikit/Tree/TreeModel.ts`, `ListBox/ListBoxModel.ts` — no logic change; styling
  only.
- `src/renderer/components/tree-provider/TreeProviderView.tsx` and any current consumer — untouched
  in US-829 (they keep working via `keyboardNav`); consumer opt-ins happen in US-830/831.
- `src/renderer/uikit/AVGrid/*` — out of scope for this epic.

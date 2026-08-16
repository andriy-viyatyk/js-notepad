# US-967: Neutral slots - UIKit list and data components

## Status

**Status:** Implemented - pending EPIC-051 review
**Priority:** High
**Epic:** [EPIC-051: De-React Epic P - Preparation (React-side)](../../epics/EPIC-051.md)
**Depends on:** [US-965: Icon name registry + neutral slot types (foundation)](../US-965-icon-registry-slots/README.md), [US-966: Neutral slots - UIKit primitives and inputs](../US-966-neutral-slots-primitives/README.md)
**Created:** 2026-08-16

## Goal

Adopt the neutral icon and text-slot vocabulary from US-965 across the UIKit list and data
components. Plain text props become `string`, genuine rich text props use the existing `SlotText`
alias, and component-owned built-in icons resolve through the shared registry without introducing
a generic subtree-slot protocol.

## Background

US-965 provides `IconRef = IconName | ReactNode`, `SlotText = string | ReactNode`, and
`renderIcon(icon, props?)`. US-966 establishes the staged migration rules: use plain strings when
the inventory has no rich callers, retain `SlotText` only where rich content exists, keep arbitrary
subtrees and `children` as React composition, and leave render callbacks as callbacks until their
neutral return contract is designed.

EPIC-051 assigns this task the list/data surface: `ListBox`, `MultiListBox`, `MultiSelect`,
`Autocomplete`, `Select`, `CategoryList`, `Breadcrumb`, `Tree`, and `SelectableRow`. The public
item shapes and row primitives are included because their props are the slots consumed by those
containers.

### Measured text-slot inventory

The renderer was re-measured by counting JSX call sites that pass elements rather than strings:

| Prop | Rich callers | Total callers | Planned type |
|---|---:|---:|---|
| `rootLabel` | 0 | 18 | `string` |
| `separatorContent` | 0 | 2 | `string` |
| `selectAllLabel` | 0 | 1 | `string` |
| `emptyMessage` | 3 | 15 | `SlotText` |
| `tooltip` | 2 | 7 | `SlotText` |

The rich `emptyMessage` callers are intentional styled messages in trusted-tool and board
surfaces. The rich `tooltip` callers are link previews in `LinksList` and `PinnedLinksPanel`; they
remain valid React subtrees behind `SlotText`.

Labels on the default list rows and tree trait data were re-checked across the renderer and resolve
to strings. Typecheck also found four editor-owned rich row renderers that are intentionally outside
this UIKit conversion: the link-folder `ListItem`, tree-provider custom labels, Rest client custom
`TreeItem` rows, and notebook category rows. Their row styling remains React composition, so the
low-level `ListItem`/`TreeItem` label props and `ITreeItem` source shape retain the React arm for
those named callers; all default list/tree data labels are strings. `trailing`, `renderItem`,
`header`, `headerAction`, `startSlot`,
`endSlot`, and `SelectableRow.children` are arbitrary subtrees and remain React props under D4/D5.

### Component inventory

| Component / type | Current React-bearing surface | US-967 treatment |
|---|---|---|
| `IListBoxItem`, `ListItem`, `SectionItem` | label, icon, tooltip, trailing | label becomes `string`; tooltip uses `SlotText`; icon uses `IconRef`; trailing remains a subtree |
| `ListBoxProps` | `getTooltip`, `renderItem`, `emptyMessage` | `getTooltip`/`emptyMessage` use `SlotText`; `renderItem` remains a React callback |
| `MultiListBox`, `MultiSelectModel` | `selectAllLabel`, `emptyMessage` | `selectAllLabel` becomes `string`; `emptyMessage` uses `SlotText` |
| `AutocompleteModel` | header, headerAction, emptyMessage, startSlot, endSlot | keep header/action/input slots; `emptyMessage` uses `SlotText` |
| `SelectModel` | `emptyMessage` | use `SlotText`; preserve the existing input subtree boundary |
| `CategoryList` | `rootLabel`, owned chevrons | `rootLabel` becomes `string`; resolve owned chevrons by name |
| `Breadcrumb` | `rootLabel`, `separatorContent` | both become `string` |
| `ITreeItem`, `TreeItem`, `Tree` | label, icon, tooltip, trailing, `getTooltip`, `renderItem`, `emptyMessage` | label becomes `string`; tooltip/empty use `SlotText`; icon uses `IconRef`; trailing/render callbacks remain |
| `SelectableRow` | `children` | no conversion; it is a subtree boundary |

Owned state and navigation icons should use registry names: list selection icons (`check`,
`chevron-right`), multi-list checkbox states (`checked`, `indeterminate`, `unchecked`), tree and
category chevrons (`chevron-down`, `chevron-left`, `chevron-right`), and Select/MultiSelect trigger
chevrons (`chevron-up`, `chevron-down`). Existing caller-provided React icons remain accepted by
`IconRef`, including prop-taking resolver components and story fixtures.

## Implementation plan

### 1. Normalize the shared list item and row types

- In `src/renderer/uikit/ListBox/types.ts`, use `string` for `IListBoxItem.label`,
  `IconRef` for `IListBoxItem.icon`, `SlotText` for `ListBoxProps.getTooltip`'s return value and
  `emptyMessage`, and leave `renderItem` returning `ReactNode`.
- In `src/renderer/uikit/ListBox/ListItem.tsx`, use `IconRef` for `icon`, `string` for `label`,
  and `SlotText` for `tooltip`; resolve caller icons with `renderIcon`. Replace the
  component-owned default check and accent chevron with `renderIcon("check")` and
  `renderIcon("chevron-right")`. With a string label, remove the unnecessary runtime type guard
  around search highlighting.
- In `src/renderer/uikit/ListBox/SectionItem.tsx`, use `string` for `label`.
- In `src/renderer/uikit/ListBox/ListBox.tsx`, preserve the existing virtualization, selection,
  context-menu, keyboard, tooltip, and custom-renderer behavior while forwarding the narrowed
  types to `ListItem` and `SectionItem`.

### 2. Normalize multi-list and select wrappers

- In `src/renderer/uikit/MultiListBox/MultiListBox.tsx` and
  `src/renderer/uikit/MultiSelect/MultiSelectModel.ts`, make `selectAllLabel` a `string` and
  `emptyMessage` a `SlotText`.
- Resolve MultiListBox's select-all and per-row checked icons through the registry, preserving
  the `data-part="icon"`/`data-part="check"` hooks and all mixed/checked/unchecked styling.
- Keep `MultiSelect`'s `Input` end slot and trigger behavior unchanged; replace only its owned
  up/down chevron elements with named icons. Verify forwarding preserves the same empty message
  and select-all behavior.
- In `src/renderer/uikit/Select/SelectModel.ts` and `Select.tsx`, use `SlotText` for
  `emptyMessage` and replace the owned trigger chevrons with named icons. Do not alter the
  existing input, popover, async-loading, filtering, or list selection behavior.

### 3. Normalize autocomplete and text-bearing data props

- In `src/renderer/uikit/Autocomplete/AutocompleteModel.ts`, use `SlotText` for `emptyMessage`.
  Keep `header`, `headerAction`, `startSlot`, and `endSlot` as React subtree props under D4; the
  model and view must continue to pass them through unchanged.
- Keep `filter`, `renderItem`, and other caller callbacks unchanged. Do not add a callback whose
  return type is a React node as a supposed framework-neutral replacement.
- Verify `Autocomplete`'s empty-state visibility rule still distinguishes no message from a
  supplied empty message and that the inner `ListBox` receives the same value.

### 4. Convert CategoryList and Breadcrumb text props

- In `src/renderer/uikit/CategoryList/CategoryList.tsx`, change `rootLabel` to `string` and
  resolve the owned back/forward chevrons through `renderIcon` using the registry names. Preserve
  drill-in, keyboard/focus selection styling, counts, separator behavior, and DOM data parts.
- In `src/renderer/uikit/Breadcrumb/Breadcrumb.tsx`, change `rootLabel` and `separatorContent`
  to `string`. Keep the segment construction, click paths, trailing separator behavior, clipping,
  and direct text rendering unchanged.

### 5. Normalize Tree and its item data

- In `src/renderer/uikit/Tree/types.ts`, use `string` for `ITreeItem.label`,
  `TreeProps.getTooltip`'s return value, and `TreeProps.emptyMessage`; use `IconRef` for
  `ITreeItem.icon`; keep `TreeItemRenderContext` and `renderItem` React callbacks unchanged.
- In `src/renderer/uikit/Tree/TreeItem.tsx`, use `IconRef` for `icon`, `string` for `label`, and
  `SlotText` for `tooltip`; resolve caller icons with `renderIcon`. Replace the owned
  expanded/collapsed chevrons with named icons while preserving the `.tree-chevron` class hook,
  focus behavior, indentation, loading stub, tooltip wrapper, and trailing subtree. With a string
  label, remove the unnecessary runtime type guard around search highlighting.
- In `src/renderer/uikit/Tree/SectionItem.tsx`, use `string` for `label` and preserve the
  indentation and section-row layout.
- In `src/renderer/uikit/Tree/Tree.tsx`, forward the neutral types without changing flattening,
  expansion, drag-and-drop, multi-selection, keyboard navigation, context menus, or custom row
  rendering.
- Confirm editor-owned custom renderers, including the Rest client tree and tree-provider label
  accessors, continue to compile with string labels. No editor prop declarations are converted in
  this epic.

### 6. Keep the children boundary explicit

- In `src/renderer/uikit/SelectableRow/SelectableRow.tsx`, make no change to `children`; document
  and verify that the component remains a neutral row shell around an arbitrary subtree.
- Leave `trailing`, autocomplete header/action, input slots, custom render callbacks, and all
  other subtree disguises as React composition. Do not add `SlotContent`, `renderSlot`, a generic
  slot callback, or an icon descriptor.

### 7. Verify the staged migration

- Re-export no new public abstraction beyond the existing `IconRef`, `SlotText`, and `renderIcon`
  foundation; update local imports to use the shared module directly where appropriate.
- Run `npm run typecheck`, `npm run lint`, and `git diff --check`.
- Perform smoke checks for named and legacy item icons, list selection states, multi-list mixed
  selection, tree expanded/collapsed states, category/breadcrumb text, empty messages, and rich
  link tooltips/empty messages. Confirm the existing data-part/data-type hooks, keyboard/focus
  behavior, context-menu wiring, drag-and-drop, and tooltip suppression remain intact.
- Do not add unit tests; this repository has no unit-test harness and the smoke checks are the
  intended verification for this refactor.

## Concerns / Open questions

### Label narrowing is verified by the renderer inventory and compiler

The renderer inventory found no rich item-data labels and the five trait label accessors return
strings. The compiler identified these existing rich editor-owned row callers, which are retained
under the D1 boundary rather than restyled in this task:

- `src/renderer/editors/link-editor/LinksList.tsx` — directory label styling.
- `src/renderer/components/tree-provider/TreeProviderView.tsx` — `getLabel` override.
- `src/renderer/editors/rest-client/RestClientShared.tsx` — root/action and method-badge rows.
- `src/renderer/editors/notebook/category-tree.tsx` — category size label composition.

Consequently `IListBoxItem.label` and the ListBox `SectionItem.label` prop are `string`; the Tree
`ITreeItem`, `TreeItem`, and Tree `SectionItem` label boundaries retain `ReactNode` for these named
editor callers. String labels still take the search-highlighting path; rich labels retain the
existing guard.

### `SlotText` still contains ReactNode

This is intentional for the two measured rich surfaces: `emptyMessage` and `tooltip`. The
plain-string props (`rootLabel`, `separatorContent`, `selectAllLabel`, and all list/tree labels)
are narrowed directly so their public contracts actually shrink. The rich props can be narrowed
further only after their subtree boundary is designed.

### Render callbacks remain React callbacks

`getTooltip` can return text or a rich tooltip subtree, so its returned value follows `SlotText`.
`renderItem` is different: it returns an arbitrary row subtree and remains `ReactNode` under D5.
This task must not introduce a callback helper that merely hides that distinction.

### Built-in icon props and CSS hooks

Registry conversion must happen at the consuming component. Preserve existing SVG sizing, wrapper
parts, and class/data hooks while replacing direct built-in icon elements. In particular, list
selection, multi-list checkbox, tree chevron, and category/breadcrumb navigation styling must be
visually checked because typecheck cannot detect a dropped icon hook.

There are no unresolved design questions blocking implementation; the boundaries above are the
approved D2-D5 decisions and the measured caller inventory.

## Acceptance criteria

- [x] `rootLabel`, `separatorContent`, and `selectAllLabel` are typed `string`; their existing
      callers and rendered text are unchanged.
- [ ] `IListBoxItem.label` and the ListBox `SectionItem.label` prop are typed `string`; the Tree
      item/section label props retain a React arm only for the four named editor callers documented
      above, and `ListItem.label` does the same for the link-folder caller.
- [x] `SlotText` remains only on `emptyMessage` and `tooltip` in this task, and the three rich
      empty states and two rich link tooltips still render.
- [x] List and tree item icons use `IconRef`/`renderIcon`; existing React icon and resolver callers
      remain compatible.
- [x] ListBox default selection icons, MultiListBox checkbox states, Tree/CategoryList navigation
      icons, and Select/MultiSelect trigger chevrons use registry names without losing DOM parts,
      class hooks, sizing, or state styling.
- [x] `ListItem`'s default selection trailing uses `renderIcon("check")` and the accent variant
      uses `renderIcon("chevron-right")`; both glyphs are visually verified.
- [x] `MultiListBox` maps its checkbox states to `"checked"`, `"unchecked"`, and
      `"indeterminate"`; mixed-state styling and `data-part` hooks are unchanged.
- [ ] List/tree default data labels are plain strings and search highlighting remains active for
      them; documented editor-owned rich labels retain the prior guard; `trailing` remains a React
      subtree.
- [x] `renderItem`, `getTooltip`, autocomplete headers/actions, input slots, and
      `SelectableRow.children` retain their documented callback/subtree boundaries; no generic
      slot callback or icon descriptor is introduced.
- [ ] ListBox, MultiListBox, MultiSelect, Autocomplete, Select, CategoryList, Breadcrumb, Tree,
      and SelectableRow preserve selection, filtering, keyboard, focus, drag/drop, context-menu,
      tooltip, and accessibility behavior.
- [x] `npm run typecheck`, `npm run lint`, and `git diff --check` pass; the named/legacy icon,
      rich-slot, empty-state, and visual state smoke checks show no regression.
- [x] No unit-test harness or tests are added.

## Implementation notes

The implementation uses the existing `IconRef`, `SlotText`, and `renderIcon` foundation. Named
icons preserve the existing list/tree wrappers and MultiListBox `data-part` hooks. `npm run
typecheck`, `npm run lint`, and `git diff --check` pass. Manual visual smoke checks remain for the
ListItem check/accent glyphs, MultiListBox mixed state, tree/category navigation states, and the
rich editor-owned label/tooltip surfaces.

## Files to create or modify

- `src/renderer/uikit/ListBox/types.ts`
- `src/renderer/uikit/ListBox/ListBox.tsx`
- `src/renderer/uikit/ListBox/ListItem.tsx`
- `src/renderer/uikit/ListBox/SectionItem.tsx`
- `src/renderer/uikit/MultiListBox/MultiListBox.tsx`
- `src/renderer/uikit/MultiSelect/MultiSelectModel.ts`
- `src/renderer/uikit/MultiSelect/MultiSelect.tsx`
- `src/renderer/uikit/Autocomplete/AutocompleteModel.ts`
- `src/renderer/uikit/Autocomplete/Autocomplete.tsx`
- `src/renderer/uikit/Select/SelectModel.ts`
- `src/renderer/uikit/Select/Select.tsx`
- `src/renderer/uikit/CategoryList/CategoryList.tsx`
- `src/renderer/uikit/Breadcrumb/Breadcrumb.tsx`
- `src/renderer/uikit/Tree/types.ts`
- `src/renderer/uikit/Tree/Tree.tsx`
- `src/renderer/uikit/Tree/TreeItem.tsx`
- `src/renderer/uikit/Tree/SectionItem.tsx`
- `src/renderer/uikit/SelectableRow/SelectableRow.tsx` (boundary verification/documentation only)
- `doc/active-work.md`
- `doc/epics/EPIC-051.md`

## Related

- [EPIC-051: De-React Epic P - Preparation (React-side)](../../epics/EPIC-051.md)
- [US-965: Icon name registry + neutral slot types (foundation)](../US-965-icon-registry-slots/README.md)
- [US-966: Neutral slots - UIKit primitives and inputs](../US-966-neutral-slots-primitives/README.md)
- [De-React roadmap](../../de-react.md)
- [UIKit authoring guide](../../../src/renderer/uikit/CLAUDE.md)
- [Component creation guide](../../standards/component-guide.md)

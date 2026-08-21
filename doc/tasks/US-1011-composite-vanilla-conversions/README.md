# US-1011: Composite UIKit controls — vanilla views

**Status:** Implemented
**Epic:** [EPIC-055 — De-React Epic C2: Floating layer and composites](../../epics/EPIC-055.md)
**Created:** 2026-08-21

## Goal

Convert `SplitButton`, `TagsInput`, `DateInput`, and `CategoryList` to thin React adapters over
direct-DOM views. Preserve their public props, caller-facing DOM contracts, interaction behavior,
and existing Storybook stories while composing the already-converted UIKit primitives directly.

This is the last composite group in C2 before the independent canvas task. `SplitButton` is ordered
after US-1006 because its current implementation uses `WithMenu`; the other three depend only on
C1/B output and can be implemented in the same task.

## Background

### Measured surface

The production JSX surface is small but behaviorally different in each component:

| Component | Production call sites | Current behavior-bearing surface | Direct dependencies |
|---|---:|---|---|
| `SplitButton` | 3 | Three Emotion blocks, `WithMenu` render prop, primary/caret actions | `Button`, `IconButton`, `Menu/WithMenu` |
| `TagsInput` | 3 usages in 2 files | One local `newTag` state, add-on-blur, remove callbacks, dynamic tag list | `Tag`, `PathInput` |
| `DateInput` | 2 | 28-line wrapper that forces `Input` to `type="date"` | `Input` |
| `CategoryList` | 2 | `expandedCategory` state, a value-sync effect, memoized grouping, two row modes | icon registry, selection styling |

The production consumers are `PageTabs`, `GitTreeEditorView`, and `BoardsSecondaryView` for
`SplitButton`; `MnemeRootEditorView` and `EditLinkDialog` for `TagsInput`/`DateInput`; and
`LinkHostnamesPanel` and `LinkTagsPanel` for `CategoryList`. The four Storybook stories remain
verification surfaces and are not rewritten.

### Existing conversion contracts

- `ButtonView`, `IconButtonView`, `TagView`, `InputView`, and `PathInputView` are already vanilla
  views. The new views should construct and own them directly instead of mounting a nested React
  component for each child.
- `KeyedList` is the structural helper for stable keyed DOM records. Its phase order is duplicate
  key validation, removal, creation, cursor-based order reconciliation, then update of every
  retained and new record.
- `openMenu(anchor, options)` is the imperative replacement for `WithMenu`'s render prop. It owns
  the recursive vanilla menu and returns a `MenuHandle` with `update()` and `dispose()`.
- `createIconElement()` is the DOM icon path established by US-997. `CategoryList` currently uses
  only the literal `chevron-left` and `chevron-right` names, so it needs no React icon arm.
- `fillSlot` remains available inside already-converted child views, but these composites should
  not use it to hide a newly introduced React component tree. `PathInputView` itself still has its
  documented temporary input bridge; that is an existing boundary, not a reason to recreate the
  old `TagsInput` or `DateInput` React nesting.

### DOM shape to preserve

The roots currently emit `data-type="split-button"`, `data-type="tags-input"`, and
`data-type="category-list"`; `DateInput` exposes the same `data-type="input"` root as `Input`.
The following direct-child relationships are load-bearing:

```text
SplitButton root
  Button or IconButton primary
  span[data-part="separator"]
  div (caret slot; a private class may be added to this existing element)
    IconButton caret

TagsInput root
  Tag*
  div (input slot; a private class may be added to this existing element)
    PathInput              (only when readOnly is false)

CategoryList root
  div[data-part="row"]*  (one root row, or one open parent row plus child rows)
```

The new adapter hosts are `display: contents` and are not part of the component DOM contract. The
view-created roots above remain the elements that receive the component attributes and stylesheet
hooks.

## Implementation plan

### 1. Establish the view/adaptor boundaries

- Add `SplitButtonView`, `TagsInputView`, and `CategoryListView` beside their
  existing components. Keep the exported component files as React-facing adapters that call
  `mountVanilla`; retain the current prop interfaces and barrel exports.
- Use public constructors on every view, as required by `VanillaViewCtor`.
- Give each component root a private, stable class hook (`split-button-root`, `tags-input-root`,
  or `category-list-root`) because `className` is omitted from these public prop types while
  residual `data-type` attributes can be supplied by callers. Keep the existing `data-type` and
  `data-name` attributes for addressing and snapshots.
- Forward residual attributes/listeners through `applyRestProps`, preserving each component's
  current rest-spread behavior. Clear removed attributes/listeners on every update and register
  all child, listener, slot, menu, keyed-list, and ref cleanup with the view owner.
- Audit each converted stylesheet for `>`, `:empty`, `:nth-child`, `+`, and `~` selectors before
  editing. None of these components may gain an extra structural host between a styled root and
  its owned children.

### 2. Convert SplitButton and replace WithMenu

- Create the root, separator, and caret-slot elements natively. Preserve the existing classes of
  the child roots (`data-type="button"`/`"icon-button"`, `split-primary`, `split-caret`) and
  the separator's direct-child position.
- Construct a `ButtonView` when `children` is present and an `IconButtonView` otherwise. Append
  the selected primary root, separator, and caret slot before mounting the child views so their
  lifecycle contract is satisfied. Update the retained child view in place when props change;
  replace/dispose it only when the primary arm changes between labelled and icon-only.
- Construct one `IconButtonView` for the caret and wire its click to `openMenu(caretRoot, options)`.
  Pass `placement: "bottom-end"` and `offset: [-4, 4]` explicitly; `openMenu` has no WithMenu
  fallback. Keep the `${name}-menu` naming convention and the current `items`, `menuDisabled`,
  and `menuTitle` values.
- Keep the `WithMenu` focus contract: capture the previously focused element when opening, restore
  it from the menu handle's `onClose`, clear the saved element after restore, and clear the handle
  field there because `openMenu` self-disposes before invoking `onClose`. Dispose any remaining
  handle on view disposal. If the menu is already open, `onUpdate` must call `handle.update()`
  rather than opening a second menu; item-array identity changes must not reopen it.
- Keep primary action behavior exactly once. The primary `ButtonView`/`IconButtonView` owns its
  tooltip and DOM click semantics; SplitButton must not add a second primary click listener.
- Move the three Emotion blocks to `SplitButton.css` under `@layer uikit`, rooted at
  `.split-button-root`. Preserve separator hover visibility, caret widths, icon specificity,
  opacity, token values, and the current hover order. Keep the specificity comments beside the
  caret rules: `@layer` does not change the intra-layer arithmetic used to out-specify
  `IconButton.css`. The root-driven separator hover must still paint while the pointer is over the
  caret, whose tooltip path must leave the caret slot's child structure flat. Import this stylesheet
  and `../Button/Button.css` plus `../IconButton/IconButton.css` from `SplitButtonView` because
  those child views do not import their own stylesheets.

### 3. Convert TagsInput with direct Tag and PathInput ownership

- Replace `newTag` React state with a view-owned draft string. Construct one `PathInputView` for
  the add field and update it with the draft, `items`, separator, max depth, placeholder, size,
  disabled, and the existing `onChange`/`onBlur` behavior.
- Use `KeyedList` for the tag rows. Each record must own a `TagView`, update its label/variant/size/
  disabled/remove callback in place, and dispose it before its root is detached. The list must
  support caller-provided duplicate tag strings without violating `KeyedList`'s unique-key
  precondition; derive an occurrence key such as `${tag}#${occurrenceIndex}` rather than throwing
  or dropping a row. The UI's add path rejects duplicates, but callers can supply them.
- Keep the exact add algorithm: trim the final value, remove one trailing separator, reject empty
  values and duplicates, append accepted values, and clear the draft. `undefined` from the blur
  path only clears the draft. Removing a tag filters all matching values exactly as the current
  callback does.
- Keep the root's `data-disabled`, `data-readonly`, `aria-label`, `tags-input-root` class, and
  residual attributes. When `readOnly` becomes true, dispose/remove the input slot; when it becomes
  false, create/insert it after the tag list and mount the `PathInputView` after attachment.
- Move the root and input-slot Emotion blocks to `TagsInput.css` under `@layer uikit`. Preserve
  wrapping, gap, minimum sizes, flex growth, and the disabled pointer/opacity rule. Do not add a
  React slot wrapper around the tags or input slot.

### 4. Convert DateInput by adapting InputView directly

- `DateInput` must mount `InputView` directly with `{ ...rest, ref, type: "date", value, onChange }`.
  `type` is already omitted from `DateInputProps`, so callers cannot override it. This preserves
  InputView's root, inner `<input type="date">`, controlled-property assignment, ref, focus, and
  native-attribute behavior without a second view or adapter host.
- Import `../Input/Input.css` from `DateInput.tsx`: `Input.css` is currently imported by the React
  `Input.tsx` face, not by `InputView.tsx`, and direct construction must not rely on another caller
  importing the stylesheet.

### 5. Convert CategoryList and keep expansion controlled

- Replace the Emotion root with a native `div`, the `category-list-root` class, and the existing
  `data-type`, `data-name`, `tabIndex=0`, `data-focus-selection`, `scroll-container`, and residual
  attributes.
- Keep the grouping algorithm and sort order exactly: simple values first, parent values grouped
  by separator, parent groups sorted by name with child-bearing groups after simple groups, and
  children sorted by display name. `separator="\0"` continues to disable drill-in.
- Use `KeyedList` for rows and update a single list container in place when the external `value`,
  `items`, `separator`, `rootLabel`, or `getCount` changes. Preserve the two row modes:
  flat/root mode has the root pseudo-row and groups; expanded mode has the open parent row followed
  by its children. Keep `data-state="open"`, `data-selected` presence semantics, counts, and
  direct row/name/count/expand parts.
- Preserve the current controlled-state timing intentionally. External `value`/`separator`
  updates synchronize `expandedCategory` before reconciliation; clicking a parent/back button first
  updates the local expansion mode and then calls `onChange`, matching the current React state
  update plus effect behavior. No model is needed: this is transient view interaction, not business
  state.
- Use native click listeners. Expand/back handlers stop propagation before calling `onChange`; row
  clicks call `onChange` once. Use `createIconElement("chevron-left"/"chevron-right"), never the
  removed React `renderIcon` path.
- Translate the current CategoryList Emotion rules into `CategoryList.css` under `@layer uikit`,
  rooted at `.category-list-root`. Include the consumer-specific focus-selection rules currently
  produced by `focusSelectionOverride('[data-part="row"]')` in this component stylesheet. Do not
  create or import a generic `shared/selection-style.css`: US-996 deliberately left the six
  consumer-specific selectors with their owning component, and CategoryList is the owner here.

### 6. Remove old Emotion/composition code without changing callers

- Delete the four old component implementations' Emotion imports, React hook logic, and
  `WithMenu`/`renderIcon` usage that the views replace. Keep all public `index.ts` exports, stories,
  story registry entries, and production call sites unchanged.
- Add stylesheet imports only from the new view modules. `SplitButtonView` must import its own
  `SplitButton.css` plus `../Button/Button.css` and `../IconButton/IconButton.css`; `DateInput.tsx`
  must import `../Input/Input.css`; `TagView` and `PathInputView` already import their own sheets.
  No direct-constructed child may rely on another caller or React face importing CSS incidentally.
- Keep `selection-style.ts` in place. Tree, TreeItem, ListBox/ListItem, and FolderItem still use
  its other fragments after CategoryList stops importing it. The only rules copied into
  `CategoryList.css` are the container-hosted pair produced by
  `focusSelectionOverride('[data-part="row"]')`, both gated by
  `[data-focus-selection]:focus-within`.
- Preserve the public JSDoc on all four prop interfaces in the thin faces, including the DateInput
  explanation of why the wrapper exists. The view extraction must not turn the public API reference
  into undocumented props.

### 7. Verify in stories and real consumers

Run `npm run typecheck`, `npm run lint`, and `git diff --check`. Then exercise all four stories in
both light and dark themes:

- SplitButton: icon-only and labelled primary arms, primary/caret disabled states, tooltip titles,
  menu open/close, keyboard navigation, submenu behavior, focus restoration, and item updates.
- TagsInput: add with Enter/blur, trailing-separator trimming, duplicate rejection, remove buttons,
  namespaced suggestions, disabled/read-only transitions, both variants, both sizes, and an input
  value update while the list changes.
- DateInput: controlled ISO value, native calendar popup, clearing, disabled/read-only, keyboard,
  ref/focus, and width/size changes.
- CategoryList: root selection, counts, drill-in/back, external controlled selection changes, flat
  `"\0"` mode, focus-selection styling, hover, and long-list scrolling.

Smoke the real consumers listed in Background, especially the page-tabs and Git-tree split buttons,
the Mneme date/tag filters, and both link-editor CategoryLists. Capture Storybook DOM snapshots and
check that no extra structural wrapper changes the listed direct-child relationships. Confirm the
converted component folders no longer import `@emotion/styled` and that no React root is introduced
by US-1011 itself beyond the existing PathInput bridge.

## Concerns / Open questions

1. **SplitButton's menu is an attachment, not a child tree.** `openMenu` appends the menu into the
   floating layer and calls `onClose` from the handle. The view must not claim the menu as a normal
   `VanillaView` child or remove it by DOM-only mutation. The handle owns disposal; SplitButton owns
   the handle and focus restoration. Verify a submenu click closes only the menu chain and that a
   parent update while open calls `update()` rather than resetting focus or placement.

2. **TagsInput combines keyed DOM rows with view ownership.** `KeyedList` manages nodes, while
   `TagView` owns behavior and does not detach its root from `dispose()`. The implementation must
   dispose a removed TagView before KeyedList detaches its node, claim each view exactly once, and
   avoid double-disposal when the parent and list are both cleaned up. Duplicate caller values are
   another edge: React currently renders them despite duplicate keys; the vanilla key must remain
   unique without silently dropping a tag.

3. **PathInput still contains its documented temporary React bridge.** This task should construct
   `PathInputView` directly and must not copy its bridge or add another `mountReact` root. The
   expected result is one TagsInput-owned PathInput view whose existing input bridge remains an
   explicit Epic B boundary until the later parent/root flip.

4. **CategoryList's old `useEffect` had a visible two-phase controlled update.** The vanilla view
   should synchronize `expandedCategory` and reconcile rows in one update, which removes a transient
   stale mode but is the intended lifecycle correction. Keep the click behavior immediate and make
   the controlled external update deterministic; do not introduce a timer or a model just to mimic
   React's effect scheduling.

5. **Static CSS is layered and component roots need stable hooks.** The old Emotion rules were
   unlayered. Rooting the new rules at private classes prevents caller residual `data-type` props
   from disabling the component's own styles, but it also changes cascade precedence against any
   unlayered ancestor/descendant selector. Audit the three actual app consumers for selectors
   reaching into these roots, and verify the new `@layer uikit` rules in both themes. The child
   component styles remain their own owners; do not duplicate them in these composite stylesheets.

6. **CategoryList's shared-selection roadmap sentence is stale.** `selection-style.css` does not
   exist: US-996 explicitly deferred the consumer-specific fragments, and US-1000 gave
   `SelectableRow` its local rules. This task resolves the choice by placing CategoryList's exact
   descendant selector in `CategoryList.css`. If a genuinely shared row shape is needed later, it
   belongs to the task that converts the second matching consumer, not this composite conversion.

7. **No new model is warranted.** `TagsInput.newTag` and `CategoryList.expandedCategory` are
   transient interaction state local to a view; their durable values are already controlled by
   `value`/`onChange`. Keep them as view fields with explicit update/reconcile methods. Introducing
   a `TComponentModel` would add ownership and disposal complexity without a cross-view consumer.

## Acceptance criteria

- [ ] `SplitButton`, `TagsInput`, `DateInput`, and `CategoryList` are thin `mountVanilla` adapters
      with public constructors and unchanged public prop/barrel APIs.
- [ ] SplitButton uses direct `ButtonView`/`IconButtonView` children and `openMenu`; it preserves
      primary/caret actions, menu updates, submenu behavior, tooltip titles, and focus restoration.
- [ ] TagsInput uses direct `TagView`/`PathInputView` ownership and a keyed stable list; add/remove,
      blur/Enter, separator trimming, duplicate rejection, disabled, read-only, variant, size, and
      duplicate caller values behave correctly.
- [ ] DateInput directly mounts `InputView` with forced `type="date"` and imports `Input.css`;
      controlled ISO values, refs, native attributes, sizing, disabled/read-only, and focus behavior
      match Input.
- [ ] CategoryList preserves grouping/sorting, root and expanded row modes, counts, selection,
      drill-in/back, controlled updates, flat separator mode, direct row DOM shape, and focus styling.
- [ ] The four composite stylesheets are static `@layer uikit` CSS with stable private root hooks;
      no converted component imports `@emotion/styled`, and CategoryList does not introduce a
      premature generic shared selection stylesheet.
- [ ] Existing child styles are imported through runtime view dependencies; no styling depends on
      another component or Storybook importing CSS incidentally.
- [ ] All four stories and the named production consumers work in light and dark themes, with no
      regression in keyboard, pointer, focus, menu, date-picker, or list interactions.
- [ ] `npm run typecheck`, `npm run lint`, and `git diff --check` pass; callers, stories, and public
      barrel exports require no changes.

## Files expected to change

| File | Change |
|---|---|
| `src/renderer/uikit/SplitButton/SplitButton.tsx` | Thin vanilla adapter; preserve public props |
| `src/renderer/uikit/SplitButton/SplitButtonView.ts` | New direct-DOM composite view and menu attachment |
| `src/renderer/uikit/SplitButton/SplitButton.css` | New layered static composite styles |
| `src/renderer/uikit/TagsInput/TagsInput.tsx` | Thin vanilla adapter; preserve public props |
| `src/renderer/uikit/TagsInput/TagsInputView.ts` | New keyed Tag/PathInput composite view |
| `src/renderer/uikit/TagsInput/TagsInput.css` | New layered static composite styles |
| `src/renderer/uikit/DateInput/DateInput.tsx` | Thin vanilla adapter |
| `src/renderer/uikit/CategoryList/CategoryList.tsx` | Thin vanilla adapter; preserve public props |
| `src/renderer/uikit/CategoryList/CategoryListView.ts` | New keyed native rows and controlled expansion |
| `src/renderer/uikit/CategoryList/CategoryList.css` | New layered styles, including local focus selection |
| `doc/active-work.md` | Link US-1011 under EPIC-055 |
| `doc/epics/EPIC-055.md` | Update the US-1011 status when implementation completes |
| `doc/tasks/US-1011-composite-vanilla-conversions/README.md` | This investigation and implementation plan |

No production call site, story, public barrel, or generic shared selection stylesheet should be
changed by the implementation unless verification proves a current type/import issue.

## Related work

- [US-1006 — Menu and WithMenu](../US-1006-menu-vanilla-recursive/README.md)
- [US-996 — Vanilla UIKit contracts](../US-996-vanilla-uikit-contracts/README.md)
- [US-997 — DOM icon path](../US-997-dom-icon-path/README.md)
- [US-999 — Button cluster](../US-999-button-cluster/README.md)
- [US-1000 — Text and stateless leaves](../US-1000-text-stateless-leaves/README.md)
- [US-1010 — Vanilla chrome conversions](../US-1010-chrome-vanilla-conversions/README.md)

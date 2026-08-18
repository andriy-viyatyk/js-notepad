# US-977: `forwardRef` → React 19 ref props

## Status

**Status:** Implemented — reviewed as part of EPIC-051 close-out

## Goal

Replace the 21 command-independent `forwardRef` wrappers in `src/renderer` with ordinary React
19 components that accept an explicit `ref` prop. Preserve every DOM ref's element type,
callback/object-ref behavior, nulling behavior, and runtime output. Command-shaped handles are
handled by [US-971](../US-971-imperative-handles/README.md) and are not recreated here.

## Background

The EPIC-051 baseline scan found 33 production `forwardRef` files under `src/renderer`, excluding
stories. US-971 converted twelve of them: its nine command-handle surfaces plus
`RenderFlexGrid.tsx`, `RecentFileList.tsx`, and `GridBody.tsx`. The remaining surface is exactly 21
files: 20 UIKit wrappers and the SVG icon factory. The authoritative file list is below; it
excludes the twelve command surfaces and ordinary wrappers already converted by US-971.

The remaining 21 are ordinary DOM-forwarding wrappers. They are a mechanical but independently
reviewable migration: `forwardRef` is removed, `ref?: React.Ref<Element>` (or the exact generic
equivalent) is part of the component props, and the component passes that ref to the same DOM
element as before. This task does not delete a DOM ref or turn one into a model command.

`theme/icons.tsx` is included because `SvgIcon` is an ordinary SVG ref wrapper, not an imperative
icon handle. `SvgIconProps` already extends `SVGProps<SVGSVGElement>`, which carries the SVG ref,
and `SvgIconComponent` remains compatible with the icon registry after the wrapper is removed.

## Files in scope

Exactly 21 production files remain after US-971:

### UIKit primitives and wrappers — 20 files

```text
src/renderer/uikit/Input/Input.tsx
src/renderer/uikit/Button/Button.tsx
src/renderer/uikit/DateInput/DateInput.tsx
src/renderer/uikit/IconButton/IconButton.tsx
src/renderer/uikit/Tree/TreeItem.tsx
src/renderer/uikit/Tree/SectionItem.tsx
src/renderer/uikit/PathInput/PathInput.tsx
src/renderer/uikit/Panel/Panel.tsx
src/renderer/uikit/Notification/Notification.tsx
src/renderer/uikit/Notification/AlertItem.tsx
src/renderer/uikit/SelectableRow/SelectableRow.tsx
src/renderer/uikit/MultiSelect/MultiSelect.tsx
src/renderer/uikit/Select/Select.tsx
src/renderer/uikit/AVGrid/CellSelect.tsx
src/renderer/uikit/AVGrid/CellInput.tsx
src/renderer/uikit/Menu/Menu.tsx
src/renderer/uikit/Autocomplete/Autocomplete.tsx
src/renderer/uikit/ListBox/SectionItem.tsx
src/renderer/uikit/ListBox/ListItem.tsx
src/renderer/uikit/Popover/Popover.tsx
```

### Theme wrapper — 1 file

```text
src/renderer/theme/icons.tsx
```

## Implementation plan

### 1. Establish the React 19 ref-prop shape

- For each file, move the ref element type into the component's public props as
  `ref?: React.Ref<...>` or the exact `RefObject`/callback-compatible type required by the existing
  implementation.
- Remove only the `forwardRef` wrapper and its render-function `(_, ref)` signature. Keep the
  component's existing props, default values, memoization, display name behavior where relevant,
  and DOM structure unchanged.
- Pass the ref to the same input, button, div, SVG, cell editor, or popup element as before. Do not
  replace it with a model reference, callback protocol, or `ComponentQueue` command.
- Preserve callback refs, object refs, `null` on unmount, and the exact DOM element type. A ref that
  is consumed by a component must remain attached to the same DOM target.

### 2. Convert generic UIKit components carefully

Three components need careful generic inference review:

- `AVGrid/CellSelect.tsx` currently has a generic render function whose type is erased by
  `forwardRef`; removing the wrapper should restore inference and may expose existing call-site
  errors that must be fixed rather than suppressed.
- `MultiSelect/MultiSelect.tsx` and `Select/Select.tsx` use casts solely to reattach generic
  inference after `forwardRef`; remove those casts with the wrappers and preserve the generic
  component signatures.
- The other 18 files are monomorphic DOM wrappers. They belong to the mechanical conversion path;
  in particular, Tree/ListBox section and row components, `CellInput`, and `Autocomplete` are not
  generic risks.

### 3. Convert simple DOM wrappers

Apply the same mechanical change to `Input`, `Button`, `DateInput`, `IconButton`, `PathInput`,
`Panel`, `Notification`, `AlertItem`, `SelectableRow`, `Menu`, and `Popover`. In `Menu.tsx`, remove
the explicit `React.ForwardRefExoticComponent<MenuProps & React.RefAttributes<HTMLDivElement>>`
annotation as well as the wrapper; it describes the old value shape and must not remain.

### 4. Convert the SVG icon factory

In `src/renderer/theme/icons.tsx`, remove both `forwardRef` wrappers: the `SvgIcon` wrapper and
the `IconWithViewBox` wrapper inside `createIconWithViewBox`. Remove the now-unnecessary cast on
the latter as well. Retain `ref` in `SvgIconProps` and pass it to the same root `<svg>`. Keep
`createIcon`, `createIconWithViewBox`, `SvgIconComponent`, viewBox handling, class names, and all
114+ registry icons unchanged. Confirm that the registry's
`satisfies Record<string, SvgIconComponent>` remains type-correct.

### 5. Verify the finite wrapper surface

- Scan production renderer source, excluding `*.story.tsx`, and require `forwardRef` = 0 after the
  US-971 command conversions are present.
- Search for the 21 file paths and confirm each now exposes the intended DOM ref prop without
  retaining a wrapper or changing the element type.
- Run `npm run typecheck`, `npm run lint`, and `git diff --check`.
- Smoke-test representative callback and object refs for text input, button, list row, generic
  selection, grid cell editing, popover, and SVG icon behavior.
- No unit-test harness or new test framework is required.

## Concerns / Open questions

### Generic JSX inference

React's `forwardRef` typing can erase generic inference. The only generic files in this surface
are `AVGrid/CellSelect.tsx`, `MultiSelect/MultiSelect.tsx`, and `Select/Select.tsx`. Removing the
wrapper and, for the latter two, the compensating cast should simplify their types. Keep explicit
generic props and verify representative callers rather than solving type errors with `unknown` or
`any`.

### DOM ref versus command handle

The presence of `ref` does not make a component a command handle. This task preserves refs that
identify DOM nodes. Methods such as grid scrolling, tree reveal, file search, Markdown scrolling,
and image copy belong to US-971's models or queues and must not be exposed through a new ref-shaped
API here.

### SVG factory compatibility

`SvgIconProps` inherits the SVG ref through `SVGProps<SVGSVGElement>`, and the icon component type
is a plain function type. Both wrapper removals, including the `IconWithViewBox` cast, should
therefore be type-neutral, but the registry and a representative generated icon must still be
typechecked because this module is imported by many files.

## Acceptance criteria

- [ ] The 21 files listed in this document no longer use `forwardRef`; the twelve files converted
      by US-971 are already clean.
- [ ] Production `src/renderer` has zero `forwardRef` call sites; stories are excluded from this
      scan.
- [ ] Each converted component accepts the appropriate React 19 `ref` prop and preserves the
      previous DOM element, callback/object-ref behavior, and nulling behavior.
- [ ] `CellSelect`, `MultiSelect`, and `Select` retain JSX generic inference and do not widen
      their item/value types; the two compensating generic casts are removed.
- [ ] `SvgIcon` still forwards SVG refs, and the icon factory plus registry remain type-correct.
- [ ] No command-shaped ref API, DOM element in a business model, or queue is introduced by this
      task.
- [ ] `npm run typecheck`, `npm run lint`, `git diff --check`, and the representative smoke checks
      pass. No unit-test harness is added.

## Files to create or modify

No new files are expected. Modify only the 21 files listed above, plus their directly affected
type/import declarations if the React 19 prop shape requires it. Changes to the twelve command
surfaces belong in US-971.

## Related

- [EPIC-051: De-React Epic P — Preparation](../../epics/EPIC-051.md)
- [US-971: Imperative handles → model methods / `ComponentQueue`](../US-971-imperative-handles/README.md)
- [React 19 ref migration guidance](../../de-react.md)

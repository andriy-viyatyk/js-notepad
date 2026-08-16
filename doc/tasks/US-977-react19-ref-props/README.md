# US-977: `forwardRef` → React 19 ref props

## Status

**Planned — split from US-971; pending review.**

## Goal

Replace the 24 command-independent `forwardRef` wrappers in `src/renderer` with ordinary React
19 components that accept an explicit `ref` prop. Preserve every DOM ref's element type,
callback/object-ref behavior, nulling behavior, and runtime output. Command-shaped handles are
handled by [US-971](../US-971-imperative-handles/README.md) and are not recreated here.

## Background

The EPIC-051 baseline scan found 33 production `forwardRef` files under `src/renderer`, excluding
stories. Nine overlap with US-971's command-handle surface and disappear as part of those model or
queue conversions:

```text
AVGrid, Tree, ListBox, RenderGrid, Textarea, ImageViewport,
FileList, MarkdownBlock, LinksList
```

The remaining 24 are ordinary DOM-forwarding wrappers. They are a mechanical but independently
reviewable migration: `forwardRef` is removed, `ref?: React.Ref<Element>` (or the exact generic
equivalent) is part of the component props, and the component passes that ref to the same DOM
element as before. This task does not delete a DOM ref or turn one into a model command.

`theme/icons.tsx` is included because `SvgIcon` is an ordinary SVG ref wrapper, not an imperative
icon handle. `SvgIconProps` already extends `SVGProps<SVGSVGElement>`, which carries the SVG ref,
and `SvgIconComponent` remains compatible with the icon registry after the wrapper is removed.

## Files in scope

Exactly 24 production files remain after excluding the nine US-971 command surfaces:

### UIKit primitives and wrappers — 21 files

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
src/renderer/uikit/RenderGrid/RenderFlexGrid.tsx
src/renderer/uikit/Popover/Popover.tsx
```

### Shell and theme wrappers — 3 files

```text
src/renderer/theme/icons.tsx
src/renderer/ui/sidebar/RecentFileList.tsx
src/renderer/editors/grid/GridBody.tsx
```

`RecentFileList.tsx` and `GridBody.tsx` remain in this task only for their ordinary DOM ref
forwarding. Their command/model changes belong to US-971. If US-971 changes either file first,
US-977 should convert the resulting DOM-ref prop in the same final shape rather than reintroducing
`forwardRef`.

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
  is intentionally not consumed by a component remains intentionally unused; do not invent a new
  target.

### 2. Convert generic UIKit components carefully

Convert the generic or traited wrappers first and resolve their inference at their call sites:

- `TreeItem.tsx`, `SectionItem.tsx`, `MultiSelect.tsx`, `Select.tsx`, `CellSelect.tsx`,
  `CellInput.tsx`, `Autocomplete.tsx`, `ListBox/SectionItem.tsx`, `ListBox/ListItem.tsx`, and
  `RenderFlexGrid.tsx`.
- Keep generic item/value/row parameters inferable in JSX. Where removing `forwardRef` loses the
  compiler's inferred intersection, spell the `ref` prop in the props type and preserve the
  existing generic component signature rather than widening to `any`.
- Verify traited rows, render callbacks, and ref callbacks at the existing call sites. A successful
  runtime render is not enough if the migration silently loses the item type.

### 3. Convert simple DOM wrappers and shell files

Apply the same mechanical change to `Input`, `Button`, `DateInput`, `IconButton`, `PathInput`,
`Panel`, `Notification`, `AlertItem`, `SelectableRow`, `Menu`, and `Popover`. Then convert
`RecentFileList.tsx` and `GridBody.tsx` after reconciling any model callback changes delivered by
US-971. Keep all imperative behavior in the owner model/queue; only the DOM ref prop remains in
these wrappers.

### 4. Convert the SVG icon factory

In `src/renderer/theme/icons.tsx`, remove the `forwardRef` wrapper from `SvgIcon` while retaining
`ref` in `SvgIconProps` and passing it to the root `<svg>`. Keep `createIcon`,
`createIconWithViewBox`, `SvgIconComponent`, viewBox handling, class names, and all 114+ registry
icons unchanged. Confirm that the registry's `satisfies Record<string, SvgIconComponent>` remains
type-correct.

### 5. Verify the finite wrapper surface

- Scan production renderer source, excluding `*.story.tsx`, and require `forwardRef` = 0 after the
  US-971 command conversions are present.
- Search for the 24 file paths and confirm each now exposes the intended DOM ref prop without
  retaining a wrapper or changing the element type.
- Run `npm run typecheck`, `npm run lint`, and `git diff --check`.
- Smoke-test representative callback and object refs for text input, button, list row, generic
  selection, grid cell editing, popover, SVG icon, recent-file search, and grid body behavior.
- No unit-test harness or new test framework is required.

## Concerns / Open questions

### Generic JSX inference

React's `forwardRef` typing can preserve generic inference differently from a plain function. The
high-risk files are the traited Tree/ListBox rows, selection controls, AVGrid cell components, and
RenderFlexGrid. Keep explicit generic props and verify representative callers rather than solving
type errors with `unknown` or `any`.

### DOM ref versus command handle

The presence of `ref` does not make a component a command handle. This task preserves refs that
identify DOM nodes. Methods such as grid scrolling, tree reveal, file search, Markdown scrolling,
and image copy belong to US-971's models or queues and must not be exposed through a new ref-shaped
API here.

### Cross-task ordering

Nine original `forwardRef` files overlap US-971 and are intentionally absent from this document.
The final `forwardRef` scan reaches zero only after both tasks' changes are present. If US-971
lands first, use its resulting props as the source of truth for `RecentFileList` and `GridBody`;
do not apply an old render-function signature during this task.

### SVG factory compatibility

`SvgIconProps` inherits the SVG ref through `SVGProps<SVGSVGElement>`, and the icon component type
is a plain function type. The wrapper removal should therefore be type-neutral, but the registry
and a representative generated icon must still be typechecked because this module is imported by
many files.

## Acceptance criteria

- [ ] The 24 files listed in this document no longer use `forwardRef`; the nine command-surface
      files are handled by US-971.
- [ ] Production `src/renderer` has zero `forwardRef` call sites after US-971 and US-977 are both
      applied; stories are excluded from this scan.
- [ ] Each converted component accepts the appropriate React 19 `ref` prop and preserves the
      previous DOM element, callback/object-ref behavior, and nulling behavior.
- [ ] Generic Tree/ListBox/select/grid components retain JSX type inference and do not widen
      their item/value types.
- [ ] `SvgIcon` still forwards SVG refs, and the icon factory plus registry remain type-correct.
- [ ] No command-shaped ref API, DOM element in a business model, or queue is introduced by this
      task.
- [ ] `npm run typecheck`, `npm run lint`, `git diff --check`, and the representative smoke checks
      pass. No unit-test harness is added.

## Files to create or modify

No new files are expected. Modify only the 24 files listed above, plus their directly affected
type/import declarations if the React 19 prop shape requires it. Changes to the nine command
surfaces belong in US-971.

## Related

- [EPIC-051: De-React Epic P — Preparation](../../epics/EPIC-051.md)
- [US-971: Imperative handles → model methods / `ComponentQueue`](../US-971-imperative-handles/README.md)
- [React 19 ref migration guidance](../../de-react.md)

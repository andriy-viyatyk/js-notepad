# US-1125: Virtualized data views and dropdowns

**Status:** Complete  
**Priority:** Highest  
**Epic:** [EPIC-069 — De-React E11: the Storybook contract](../../epics/EPIC-069.md)  
**Created:** 2026-08-26

## Goal

Move the eight virtualized data-view/dropdown story demos from the React `component` arm to
story-local vanilla demo views, while preserving their metadata, controls, sample data, layout,
interactions, and first-paint virtualization. Rename the already-converted ProgressBar story to
the correct `.story.ts` extension.

## Background

US-1120 and US-1122 establish the story-local wrapper pattern: the `Story<P>` generic describes the
demo wrapper, constructor code creates only the stable root, and `onMount()` creates, claims, mounts,
and appends child views. The wrapper owns demo state and pushes changed child props explicitly.
`createPanelElement` and `createTextElement` preserve the existing UIKit DOM/style contract without
reintroducing React composition.

These stories are the only remaining group whose real components measure their own roots. Their
outer demo roots must be real, explicitly sized elements; a `display: contents` root or a centered
shrink-to-fit flex item silently gives the virtualized engine a zero viewport. The existing sizes to
preserve are:

| Story | Measured host supplied by the demo | Approximate default rendered rows |
|---|---:|---:|
| Tree | `420 × 460` | 4 collapsed sample rows; about 20–22 rows when `deep`/expanded |
| DataGrid/theming, element-renderer, context-menu, overflow-tooltip | `720 × 420` | about 16–20 rows |
| DataGrid/in-popover | `420 × 260` | about 10–12 rows |
| VirtualGrid | `660 × 360` | about 12–14 rows plus sticky bands |
| VirtualFlexGrid | `660 × 360` | about 10–14 variable-height rows |
| ListBox | `360 × 300` | about 12–15 rows |
| MultiSelect | dropdown max-height `10 × 24 = 240` | about 10 rows |
| Select | dropdown max-height `10 × 24 = 240` | about 10 rows |
| MultiListBox | list max-height `10 × 24 = 240` plus search/select-all rows | about 10 list rows |
| Autocomplete | dropdown max-height `10 × 24 = 240` | about 10 rows |

`VirtualGridView` is the fixed-row engine; `VirtualFlexGridView` is retained only for the second
story because that demo measures nominated content. The virtualized view implementations already
settle scrollbar geometry after paint with bounded recomputation, and their models expose the fixed
dependency signatures required by `DepsGate`; this task must not paper over those mechanisms with a
blanket repaint.

The custom-row stories expose one under-declared native slot. `fillSlot` accepts `string | Node |
React.ReactNode`, but `TreeProps.renderItem` and `ListBoxProps.renderItem` currently declare only
`React.ReactNode`. The public props and the corresponding vanilla cell branches will be widened to
accept a native `Node`; the story will return native DOM for Tree and native `ListItemView` roots for
ListBox, with explicit ownership and disposal. No DOM node will be cast to `ReactNode`.

## Implementation Plan

### 1. Create the local vanilla demo wrappers

Rename each listed `.story.tsx` to `.story.ts`, remove React imports and component arms, and export a
typed `Story<DemoProps>` using a story-local `VanillaView` class. Keep every `id`, `name`, `section`,
PropDef field/value, and default exactly as written.

- `src/renderer/uikit/Tree/Tree.story.ts`: preserve all sample trees, trait registration, lazy
  mutation/load behavior, deep-tree stress data, selection/predicate/multi-select state, context
  menus, DnD handlers, toolbar buttons, custom-row rendering, and the `420 × 460` panel. Memoize
  the `isSelected` callback by the selected-value set so multi-selection is a truthful repaint input.
- `src/renderer/uikit/DataGrid/DataGrid.story.ts`: preserve all five panel branches, rows/columns,
  theme cycling, viewport readout, popover branch, ratio element renderer, context-menu adapter,
  and overflow-tooltip fixture. Own each `DataGridView`, button, and native popover content branch;
  rebuild/dispose the branch when `panel` changes. Keep the explicit `720 × 420` and popover
  `420 × 260` hosts. If av-grid lacks a required capability, report it rather than adding a story
  shim.
- `src/renderer/uikit/VirtualGrid/VirtualGrid.story.ts`: convert both `virtualGridStory` and
  `virtualFlexGridStory`. Keep module-level cell renderers stable, stats polling, growth/scroll
  timers, status text, and the `660 × 360` measurable roots. Dispose intervals, timers, and child
  views.
- `src/renderer/uikit/ListBox/ListBox.story.ts`: preserve stable 10,000-item data, section mode,
  filtering, selection predicate, custom rows/removal, tooltip/context-menu callbacks, style
  variants, drop feedback, and the `360 × 300` host. Return direct native content for the custom
  row path and dispose any story-created ListItem/IconButton views at teardown.
- `src/renderer/uikit/MultiSelect/MultiSelect.story.ts`: retain generated items, controlled value,
  format-selection callback, all dropdown sizing/selection props, and the `520`-wide demo panel.
  Update the owned `MultiSelectView` and value label in place.
- `src/renderer/uikit/Select/Select.story.ts`: retain array/function/promise item modes, the 500ms
  lazy delay, controlled value, all sizing props, and the `600`-wide demo panel. Rebuild the item
  source callback when its dependencies change and dispose the child view with the demo.
- `src/renderer/uikit/MultiListBox/MultiListBox.story.ts`: retain item generation, disabled-row
  pattern, controlled selection, filtering, select-all, row-height/max-visible/height controls,
  and the `420`-wide panel. Update the child and selected-value label in place.
- `src/renderer/uikit/Autocomplete/Autocomplete.story.ts`: preserve header, header-action, empty
  message, history filtering, submit/escape logs, controlled input, and all sizing props. Create
  persistent native header/action/empty nodes once, pass them through the existing native slot seam,
  and dispose the action view explicitly.

The declaration shape changes from:

```ts
export const listBoxStory: Story = {
    component: ListBoxDemo as React.ComponentType<Record<string, unknown>>,
    props: [/* existing definitions */],
};
```

to:

```ts
class ListBoxDemoView extends VanillaView<ListBoxDemoProps> { /* state and child ownership */ }

export const listBoxStory: Story<ListBoxDemoProps> = {
    view: ListBoxDemoView,
    props: [/* the same definitions */],
};
```

### 2. Widen the native custom-row slot

Change only the under-declared prop surfaces and their vanilla consumers:

```ts
// Before
renderItem?: (ctx: ListItemRenderContext<T>) => React.ReactNode;

// After
renderItem?: (ctx: ListItemRenderContext<T>) => React.ReactNode | Node;
```

Apply the same change to `TreeProps.renderItem`. In `TreeView.renderCell()` and
`ListBoxView.renderCell()`, use `fillSlot(wrapper, node)` for a native `Node`; retain the existing
React fragment/key path for genuine React values. This removes the need for `as any` or a DOM-to-
React cast and avoids a React root for native custom rows.

### 3. Rename the ProgressBar story and touch the registry

Rename `src/renderer/uikit/ProgressBar/ProgressBar.story.tsx` to
`src/renderer/uikit/ProgressBar/ProgressBar.story.ts`. Touch
`src/renderer/editors/storybook/storyRegistry.ts` after all renames so Vite drops stale extension
resolution state. Preserve import order, registry order, and unrelated entries.

### 4. Verify source and behavior

- Compare all story metadata, PropDefs, defaults, sample data, labels, handlers, branch conditions,
  and layout values against the original files.
- Check constructors create no child DOM; all children are created in `onMount()`, mounted once,
  claimed once, and disposed when replaced or when the demo exits.
- Check first paint at the host sizes above, before any click: virtualized grids must have non-zero
  measured viewports and roughly the listed visible row counts. Check Tree deep/lazy expansion,
  list custom-row scrolling/recycling, dropdown opening, filtering, lazy loading, sizing, selection,
  submit/escape, and all DataGrid panel branches.
- Confirm Tree multi-selection changes create a new predicate identity, and that no state, formatter,
  item source, or structural branch is a dead definition.
- Run `npm run typecheck`, `npm run lint`, and `npm run build-prod`. Do not add tests or a harness.

## Concerns

1. **Root measurement:** resolved by using real story roots and preserving the explicit panel/host
   sizes listed above. No measuring child is hosted directly under a contents root.
2. **Scrollbar geometry:** the existing `VirtualGridView`/`VirtualFlexGridView` post-paint bounded
   settle path remains authoritative. The stories will not add a timeout repaint or alter model
   geometry.
3. **Indirect selection state:** resolved by replacing Tree's selection predicate whenever the
   consumer-owned `Set` changes. The predicate is the only channel the child receives.
4. **Native custom rows:** resolved by widening `TreeProps.renderItem` and `ListBoxProps.renderItem`
   and branching on `Node` in the two vanilla views. Any story-created ListItem/IconButton views are
   explicitly retained and disposed; no DOM node is cast to a React type.
5. **DataGrid third-party boundary:** av-grid remains mounted through `DataGridView`. A missing
   av-grid feature is an upstream finding, not a local workaround.
6. **Known benign DOM differences:** the contents-wrapper relocation, `data-border=""` versus
   `data-border="true"`, and removal of React slot/root markers are expected per EPIC-069 §E11-10.

## Acceptance Criteria

- [x] Both VirtualGrid story exports and the other seven listed story files use typed vanilla demo
      views; no listed story retains a React `component` arm.
- [x] ProgressBar is renamed to `.story.ts`, and `storyRegistry.ts` is touched for the renamed
      module graph.
- [x] Every original metadata value, control, default, data set, handler, layout branch, and
      interaction survives; all measured hosts have real non-zero dimensions on first paint.
- [x] Tree and ListBox native custom rows use the widened Node-capable prop without casts, and all
      story-created views, timers, intervals, listeners, popovers, and branches have disposal paths.
- [x] No changes are made to `storyTypes.ts`, `story-props.ts`, `LivePreview.tsx`, unrelated stories,
      `Panel`, `Text`, `doc/active-work.md`, or `doc/epics/EPIC-069.md`; no tests, harness, commit,
      or React-face deletion is added.
- [x] `npm run typecheck`, `npm run lint`, and `npm run build-prod` pass.

## Verification Results

Source inspection confirmed that every listed `id`, `name`, `section`, PropDef value/default, sample
data set, callback, and branch survived. All eight files now use story-local `VanillaView` wrappers;
VirtualGrid retains both `VirtualGridView` and `VirtualFlexGridView` stories. Constructors create only
their stable roots; child DOM is created and mounted from `onMount()`. No listed story retains React
imports, a `component` arm, `as any`, or a DOM-to-React cast. No demo behavior was identified as lost.

The explicit §6.1 protections are: real measured hosts at the sizes above; stable callback identities
for Tree selection mode and MultiSelect formatting; dependency-keyed item/row derivations; explicit
post-mount update calls; and preservation of the views' own bounded post-paint geometry recompute.
Select's lazy promise timer, VirtualFlexGrid growth/scroll timers, custom-row views, popover content,
and all structural branch replacements have disposal paths. The only widened UIKit props are
`TreeProps.renderItem`, `ListBoxProps.renderItem`, `ListBoxProps.emptyMessage`, and
`AutocompleteProps.emptyMessage` to accept native `Node` content.

Gate results: `npm run typecheck` passed; `npm run lint` passed; `npm run build-prod` passed (exit 0;
the existing Vite bundle-size/dynamic-import warnings remain informational).

## Files Changed Summary

| File | Change |
|---|---|
| `doc/tasks/US-1125-data-view-stories/README.md` | Plan, resolved concerns, host sizes, and verification record. |
| `src/renderer/uikit/Tree/Tree.story.ts` | Vanilla Tree demo wrapper. |
| `src/renderer/uikit/DataGrid/DataGrid.story.ts` | Vanilla DataGrid demo wrapper and native popover content. |
| `src/renderer/uikit/VirtualGrid/VirtualGrid.story.ts` | Vanilla fixed and measured virtual-grid demos. |
| `src/renderer/uikit/ListBox/ListBox.story.ts` | Vanilla ListBox demo with owned custom-row views. |
| `src/renderer/uikit/MultiSelect/MultiSelect.story.ts` | Vanilla MultiSelect demo. |
| `src/renderer/uikit/Select/Select.story.ts` | Vanilla Select demo with lazy item sources. |
| `src/renderer/uikit/MultiListBox/MultiListBox.story.ts` | Vanilla MultiListBox demo. |
| `src/renderer/uikit/Autocomplete/Autocomplete.story.ts` | Vanilla Autocomplete demo with native slots. |
| `src/renderer/uikit/ProgressBar/ProgressBar.story.ts` | Extension-only rename from `.tsx`. |
| `src/renderer/uikit/Tree/types.ts` | Widen `renderItem` to accept native `Node`. |
| `src/renderer/uikit/ListBox/types.ts` | Widen `renderItem` to accept native `Node`. |
| `src/renderer/uikit/Tree/TreeView.ts` | Pass native custom-row nodes directly through `fillSlot`. |
| `src/renderer/uikit/ListBox/ListBoxView.ts` | Pass native custom-row nodes directly through `fillSlot`. |
| `src/renderer/editors/storybook/storyRegistry.ts` | Touch for renamed story resolution. |
| `src/renderer/editors/storybook/storyTypes.ts`, `story-props.ts`, `LivePreview.tsx`, `Panel`, `Text`, `doc/active-work.md`, `doc/epics/EPIC-069.md` | No changes. |

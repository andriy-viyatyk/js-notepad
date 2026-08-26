# US-1122: Simple demo wrappers — layout context and single-value controls

**Status:** Implemented  
**Priority:** High  
**Epic:** [EPIC-069 — De-React E11: the Storybook contract](../../epics/EPIC-069.md)  
**Created:** 2026-08-26

## Goal

Move the eleven simple Storybook demos from the React `component` arm to the vanilla `view` arm,
renaming their story files to `.ts` while preserving each story's identity, controls, defaults,
demo layout, sample data, and interaction state.

## Background

US-1119 established the typed exactly-one-arm `Story<P>` contract and `mountVanilla`; US-1120
established that the story-local wrapper is part of the demo and must become a story-local
`VanillaView`, rather than being replaced by the bare component view. The required lifecycle rule in
`src/renderer/uikit/CLAUDE.md` is that a vanilla view constructor creates only its stable root;
child DOM is created and mounted from `onMount()`.

The relevant vanilla faces are already available at these exact paths:

| Story | Child view | Demo-specific context |
|---|---|---|
| `src/renderer/uikit/Dot/Dot.story.tsx` | `DotView` | Nine-panel dot catalogue and configurable dot |
| `src/renderer/uikit/ImageViewport/ImageViewport.story.tsx` | `ImageViewportView` | Fixed SVG sample; real demo root for measurement |
| `src/renderer/uikit/Input/Input.story.tsx` | `InputView` | Controlled value, slot presets, value/tip text |
| `src/renderer/uikit/Textarea/Textarea.story.tsx` | `TextareaView` | Controlled value and value/tip text |
| `src/renderer/uikit/SegmentedControl/SegmentedControl.story.tsx` | `SegmentedControlView` | Fixed segments and controlled initial value |
| `src/renderer/uikit/RadioGroup/RadioGroup.story.tsx` | `RadioGroupView` | Derived radio data, controlled value, validity repair |
| `src/renderer/uikit/Tag/Tag.story.tsx` | `TagView` | Three tags, icon nodes, last-action text |
| `src/renderer/uikit/TagsInput/TagsInput.story.tsx` | `TagsInputView` | Named tag sets and controlled tag array |
| `src/renderer/uikit/Splitter/Splitter.story.tsx` | `SplitterView` | Controlled size and orientation-dependent panels |
| `src/renderer/uikit/Minimap/Minimap.story.tsx` | `MinimapView` | Scrollable sample content and measured scroll target |
| `src/renderer/uikit/Breadcrumb/Breadcrumb.story.tsx` | `BreadcrumbView` | Controlled breadcrumb plus static examples |

The wrapper's former `useState` values become plain fields. A handler updates that field, updates
the displayed state where applicable, and pushes the controlled value to the owned child view.
Former effects become explicit work in `onMount()`/`onUpdate()`: input-like demos reset from their
initial value, while `RadioGroup` re-derives items and repairs an invalid selection. Structural
changes such as Splitter orientation/side rebuild the owned layout and dispose the outgoing child.
Panel wrappers use `createPanelElement` from `src/renderer/uikit/Panel/panel-style.ts`; static Text
content uses `createTextElement` from `src/renderer/uikit/Text/text-style.ts` so the existing text
attributes and stylesheet remain comparable.

`ImageViewportView` and `MinimapView` measure their own roots. Their demo roots must therefore be
real elements, never `display: contents`; all other wrappers may use a contents root where that
preserves the former adapter layout. No changes are needed in `storyTypes.ts`, `story-props.ts`,
`LivePreview.tsx`, or any component/view implementation.

## Implementation Plan

### 1. Convert the story files

For each listed story, remove the React runtime/component arm, import the concrete child view and
its prop type, declare a local public-constructor `VanillaView` demo class, and export
`Story<TheDemoViewProps>`. Keep `id`, `name`, `section`, every `PropDef` entry and value, and every
`defaultProps` value verbatim.

- `src/renderer/uikit/Dot/Dot.story.tsx` → `.ts`: build the complete static dot grid in `onMount()`;
  own every `DotView` child, and update only the configurable dot on control changes.
- `src/renderer/uikit/ImageViewport/ImageViewport.story.tsx` → `.ts`: use a real root, append and
  mount one `ImageViewportView` with the unchanged `DEMO_IMAGE` and alt text.
- `src/renderer/uikit/Input/Input.story.tsx` → `.ts`: keep the value field, initial-value reset,
  slot preset behavior, close-button handler, and value/tip rows; create/dispose slot child views
  as the preset changes and pass their DOM nodes to `InputView`.
- `src/renderer/uikit/Textarea/Textarea.story.tsx` → `.ts`: keep the controlled value reset and
  the value/tip rows while forwarding every textarea prop to one mounted `TextareaView`.
- `src/renderer/uikit/SegmentedControl/SegmentedControl.story.tsx` → `.ts`: keep the fixed
  `DEMO_ITEMS`, initial-value reset, and `background` managed prop while forwarding the remaining
  control values to one `SegmentedControlView`.
- `src/renderer/uikit/RadioGroup/RadioGroup.story.tsx` → `.ts`: derive the same `IRadio[]`, preserve
  initial-value reset and invalid-selection repair, and update the selected-value text.
- `src/renderer/uikit/Tag/Tag.story.tsx` → `.ts`: create fresh theme-colored icon nodes per Tag,
  preserve all three tag callbacks and last-action text, and update the three `TagView` children.
- `src/renderer/uikit/TagsInput/TagsInput.story.tsx` → `.ts`: retain `TAG_SETS`, the controlled
  tags field, and the value display while updating one `TagsInputView` in place.
- `src/renderer/uikit/Splitter/Splitter.story.tsx` → `.ts`: retain the size field and callback;
  rebuild the orientation/side-dependent panel subtree on structural changes, releasing the old
  `SplitterView`, and update the fixed panel in place for drag-size changes.
- `src/renderer/uikit/Minimap/Minimap.story.tsx` → `.ts`: construct the real flex/scroll layout,
  attach the scroll container before mounting `MinimapView`, and keep its measurement-visible root.
- `src/renderer/uikit/Breadcrumb/Breadcrumb.story.tsx` → `.ts`: preserve the controlled value and
  all six static examples as mounted `BreadcrumbView` children, updating only the configurable one.

The declaration shape changes as follows:

```ts
// Before
export const inputStory: Story = {
    component: InputDemo as React.ComponentType<Record<string, unknown>>,
    props: [/* existing definitions */],
};

// After
class InputDemoView extends VanillaView<InputDemoViewProps> { /* local demo context */ }

export const inputStory: Story<InputDemoViewProps> = {
    view: InputDemoView,
    props: [/* the same definitions and values */],
};
```

### 2. Touch the story registry

Modify `src/renderer/editors/storybook/storyRegistry.ts` after the renames so its existing eleven
extensionless story imports resolve to the new `.story.ts` modules and Vite drops stale `.tsx`
specifiers. Preserve registry order and all unrelated imports/entries.

### 3. Verify preservation and gates

- Compare each converted source's story metadata, `props`, and `defaultProps` against the original.
- Check every demo's state, sample data, handlers, layout panels, static examples, and child-view
  ownership; confirm replaced children are disposed and no demo root requiring measurement is
  `display: contents`.
- Confirm only the eleven stories, the registry, and this task document changed for this task;
  do not edit `storyTypes.ts`, `story-props.ts`, `LivePreview.tsx`, `Panel`, `Text`, or unrelated
  stories. Do not add tests or a harness.
- Run `npm run typecheck`, `npm run lint`, and `npm run build-prod`.

## Concerns

1. **Synthetic wrapper props:** `initialValue`, `slotPreset`, `items`, `count`, and similar names
   belong to the demo view props, not the child component props. The story generic must describe
   the demo surface so `PropDef<P>` validates the controls actually sent to the demo.
2. **Slots and icons:** a slot child is owned by the demo and its root is passed as a `Node`; it is
   mounted exactly once and disposed when replaced. Icon nodes are created at their point of use,
   with `color.misc.blue` for Tag's dot, so no DOM node is shared between tags.
3. **Structural updates:** Splitter's orientation and side alter the layout tree, so its outgoing
   child and layout are explicitly retired and rebuilt. Ordinary content/value changes update the
   existing child views.
4. **Measurement:** ImageViewport and Minimap receive real demo roots. This intentionally permits a
   small wrapper-shape difference where needed to keep `getBoundingClientRect()` and observers
   functional.
5. **Known benign DOM differences:** the `display: contents` wrapper relocation, Panel boolean
   attribute spelling, and removal of the old React slot/root span are expected per EPIC-069
   §E11-10 and are not conversion defects.

## Verification Results

- Source check: all eleven stories retain identical `id`, `name`, `section`, `props`, and
  `defaultProps` values; each now declares a typed vanilla `view` and no `component` arm.
- Lifecycle check: demo child DOM is built in `onMount()`, all real component instances are owned
  and mounted views, and Splitter releases its outgoing child before structural rebuilds.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run build-prod` — passed on retry; the first same-session attempt encountered a transient
  Windows `spawn EPERM` while loading the Vite renderer config, with no source diagnostic.

## Acceptance Criteria

- [x] All eleven files are renamed from `.story.tsx` to `.story.ts` and use the vanilla `view` arm
      with a concrete demo-view prop type.
- [x] Each former React wrapper's layout, sample data, handlers, state, reset/repair behavior, and
      static content is preserved; every real component instance is an owned, mounted child view.
- [x] Constructors create only stable roots; child DOM is created in `onMount()`, and replaced
      children are disposed before removal.
- [x] `ImageViewport` and `Minimap` use real measurable demo roots; all Panel containers use
      `createPanelElement` with equivalent attributes.
- [x] `id`, `name`, `section`, every `PropDef` value, and every `defaultProps` value are unchanged.
- [x] `src/renderer/editors/storybook/storyRegistry.ts` is touched for the renamed import graph;
      no other Storybook infrastructure or unrelated story is changed.
- [x] `npm run typecheck`, `npm run lint`, and `npm run build-prod` pass.
- [x] No unit tests, test harness, commit, dashboard/epic edit, or React face deletion is added.

## Files Changed Summary

| File | Change |
|---|---|
| `src/renderer/uikit/Dot/Dot.story.ts` | Local vanilla demo for the complete dot catalogue. |
| `src/renderer/uikit/ImageViewport/ImageViewport.story.ts` | Measurable vanilla demo around the fixed image sample. |
| `src/renderer/uikit/Input/Input.story.ts` | Controlled input demo with native slot child views and text context. |
| `src/renderer/uikit/Textarea/Textarea.story.ts` | Controlled textarea demo with value/tip context. |
| `src/renderer/uikit/SegmentedControl/SegmentedControl.story.ts` | Controlled fixed-segment demo. |
| `src/renderer/uikit/RadioGroup/RadioGroup.story.ts` | Derived-items controlled radio demo. |
| `src/renderer/uikit/Tag/Tag.story.ts` | Three-tag demo with callbacks and icon nodes. |
| `src/renderer/uikit/TagsInput/TagsInput.story.ts` | Controlled tag-set demo. |
| `src/renderer/uikit/Splitter/Splitter.story.ts` | Controlled splitter with rebuildable layout context. |
| `src/renderer/uikit/Minimap/Minimap.story.ts` | Measurable minimap scroll demo. |
| `src/renderer/uikit/Breadcrumb/Breadcrumb.story.ts` | Controlled breadcrumb plus static examples. |
| `src/renderer/editors/storybook/storyRegistry.ts` | Touch renamed story import resolution. |
| `src/renderer/uikit/*/*.story.tsx` for the eleven listed stories | Removed by rename. |
| `doc/active-work.md`, `doc/epics/EPIC-069.md`, `storyTypes.ts`, `story-props.ts`, `LivePreview.tsx`, `Panel`, `Text` | No changes. |

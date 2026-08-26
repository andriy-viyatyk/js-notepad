# US-1120: Zero-JSX stories on the vanilla arm

**Status:** Implemented  
**Priority:** High  
**Epic:** [EPIC-069 — De-React E11: the Storybook contract](../../epics/EPIC-069.md)  
**Created:** 2026-08-26

## Goal

Move the zero-JSX Storybook stories whose declared controls fit their existing vanilla view
constructors from the React `component` arm to the vanilla `view` arm, using concrete prop types and
renaming converted `.story.tsx` files to `.story.ts`. Register the previously orphaned
`SelectableRow` story while preserving every story identity, declared control, and existing default
value.

## Background

US-1119 added the exactly-one-arm `Story<P>` contract in
`src/renderer/editors/storybook/storyTypes.ts`, including `PropDef<P>` with
`name: keyof P & string`, and made `LivePreview` mount a vanilla arm through
`mountVanilla`. `AnyStory` is the heterogeneous registry type; registry entries must use it rather
than casts at the array.

EPIC-069 §E11-7 Task 2 assigns this batch to the pilot conversion. §E11-10 records that
`src/renderer/uikit/SelectableRow/SelectableRow.story.tsx` exports `selectableRowStory` but is not
imported by `src/renderer/editors/storybook/storyRegistry.ts`; registering it changes
`ALL_STORIES.length` from 44 to 45. The registry importer must also be touched after the story
renames to clear Vite's stale extensionless-specifier resolution.

The inspected view declarations are:

| Story | Vanilla view | Generic required by the class declaration |
|---|---|---|
| Button | `ButtonView` | `ButtonViewProps` |
| Divider | `DividerView` | `DividerProps` |
| IconButton | `IconButtonView` | `IconButtonViewProps` |
| Slider | `SliderView` | `SliderProps` |
| Spacer | `SpacerView` | `SpacerProps` |
| Spinner | `SpinnerView` | `SpinnerProps` |
| SplitButton | `SplitButtonView` | `SplitButtonProps` |
| TruncatedText | `TruncatedTextView` | `TruncatedTextViewProps` |
| Checkbox | `CheckboxView` | `CheckboxProps` |
| Label | `LabelView` | `LabelProps` |
| SelectableRow | `SelectableRowView` | `SelectableRowProps` |

There are three, not four, dedicated `*ViewProps` aliases among these eleven current source files:
`ButtonViewProps`, `IconButtonViewProps`, and `TruncatedTextViewProps`. The remaining eight view
classes explicitly extend `VanillaView` with the React face props type shown above.

Three current stories use React wrapper-only `iconPreset` controls:
`Button.story.tsx` (`ButtonWithIcon`), `IconButton.story.tsx` (`IconButtonWithPreset`), and
`SplitButton.story.tsx` (`SplitButtonWithPreset`). `iconPreset` is not a key of
`ButtonViewProps`, `IconButtonViewProps`, or `SplitButtonProps`. The task rule forbids deleting or
changing those controls, widening the generic, or restoring `as any`; therefore those three stories
remain on the React arm and are explicitly reported as unconverted findings. This is a type-contract
finding, not a reason to weaken `keyof P`.

`SelectableRow.story.tsx` is the exception to the zero-JSX extension assumption: its 3 JSX tags are
visible in the source. Its story is made `.ts` by replacing the JSX fixture with a local vanilla
demo view and a DOM-created child node; its `id`, `name`, `section`, `PropDef` entries, and values
remain unchanged.

The first direct-view conversion exposed a broader story pattern: the React `component` is often a
story-local `*Demo`, `*Preview`, or `*WithIcon` wrapper rather than the uikit face itself. The DOM
comparison found this pattern caused three regressions in this batch (`Divider`, `Spacer`, and
`SelectableRow`). **35 of the 45 stories share this story-local-wrapper shape**, so later story
tasks must port the demo context as a local vanilla view instead of pointing at the bare component
view.

## Implementation Plan

### 1. Convert the compatible story declarations

For these eight files, replace the React story arm with the specified view arm and concrete generic:

- `src/renderer/uikit/Divider/Divider.story.tsx` → `.ts`, `Story<DividerDemoViewProps>`,
  `view: DividerDemoView`; the local demo view owns the orientation-specific Panel and a mounted
  `DividerView` child, rebuilding that subtree when orientation changes.
- `src/renderer/uikit/Slider/Slider.story.tsx` → `.ts`, `Story<SliderProps>`, `view: SliderView`.
- `src/renderer/uikit/Spacer/Spacer.story.tsx` → `.ts`, `Story<SpacerDemoViewProps>`,
  `view: SpacerDemoView`; the local demo view owns the bordered row Panel and a mounted
  `SpacerView` child, forwarding `size || undefined`.
- `src/renderer/uikit/Spinner/Spinner.story.tsx` → `.ts`, `Story<SpinnerProps>`, `view: SpinnerView`.
- `src/renderer/uikit/TruncatedText/TruncatedText.story.tsx` → `.ts`,
  `Story<TruncatedTextViewProps>`, `view: TruncatedTextView`.
- `src/renderer/uikit/Checkbox/Checkbox.story.ts`, `Story<CheckboxProps>`,
  `view: CheckboxView`, and remove its `as any`.
- `src/renderer/uikit/Label/Label.story.ts`, `Story<LabelProps>`, `view: LabelView`, and remove
  its `as any`.
- `src/renderer/uikit/SelectableRow/SelectableRow.story.tsx` → `.ts`,
  `Story<SelectableRowDemoViewProps>`, `view: SelectableRowDemoView`; the local demo view owns the
  280px focus-selection wrapper and a mounted `SelectableRowView` child. Its DOM
  `previewChildren` provider returns one module-level persistent Panel element.

The before → after declaration shape is:

```ts
// Before
import { Component } from "./Component";
import { Story } from "../../editors/storybook/storyTypes";

export const componentStory: Story = {
    id: "component",
    name: "Component",
    section: "Bootstrap",
    component: Component as any,
    props: [/* existing PropDef entries */],
};

// After
import type { ComponentProps } from "./Component";
import { ComponentView } from "./ComponentView";
import type { Story } from "../../editors/storybook/storyTypes";

export const componentStory: Story<ComponentProps> = {
    id: "component",
    name: "Component",
    section: "Bootstrap",
    view: ComponentView,
    props: [/* the same PropDef entries and values */],
};
```

`Button`, `IconButton`, and `SplitButton` are intentionally not put through a fake generic or an
adapter in this task: their wrapper-only `iconPreset` control is the recorded `keyof P` mismatch.
Their current React stories and filenames remain unchanged.

The demo-view shape established by the three repaired stories is:

```ts
// Before: the story-local React wrapper supplied context around the real face.
const DividerInPreview = ({ orientation }: DividerDemoViewProps) =>
    React.createElement(Panel, panelProps(orientation),
        React.createElement("span", null, "Above"),
        React.createElement(Divider, { orientation }),
        React.createElement("span", null, "Below"));

// After: the story-local vanilla demo supplies the same context and owns the face view.
class DividerDemoView extends VanillaView<DividerDemoViewProps> {
    public constructor(props: DividerDemoViewProps) {
        super(props, createPanelElement(panelProps(props.orientation)));
    }

    protected onMount(): void {
        const divider = this.child(new DividerView({ orientation: this.props.orientation }));
        this.root.append(createText("Above"), divider.root, createText("Below"));
        divider.mount();
    }

    protected onUpdate(props: DividerDemoViewProps): void {
        // Rebuild only when the orientation changes; otherwise update the child in place.
    }
}

const dividerStory: Story<DividerDemoViewProps> = {
    view: DividerDemoView,
};
```

The real implementations also rebuild the Divider layout on structural orientation changes,
forward Spacer props without remounting, and use `this.child(...)` plus `mount()` for every face.
All demo child DOM is created in `onMount()`; constructors create only the stable demo root.

### 2. Register the orphan and touch the importer

Modify `src/renderer/editors/storybook/storyRegistry.ts` to import
`selectableRowStory` from `../../uikit/SelectableRow/SelectableRow.story` in the Lists group and
place it in `ALL_STORIES` with the other Lists stories. Keep `AnyStory[]`, do not add array-level
casts, and leave all existing registry order entries unchanged apart from the new SelectableRow
entry. This edit also deliberately touches the importer after the `.tsx` → `.ts` renames.

Before → after:

```ts
// Before
import { autocompleteStory } from "../../uikit/Autocomplete/Autocomplete.story";
// ...
autocompleteStory, categoryListStory, listBoxStory,
```

```ts
// After
import { selectableRowStory } from "../../uikit/SelectableRow/SelectableRow.story";
import { autocompleteStory } from "../../uikit/Autocomplete/Autocomplete.story";
// ...
selectableRowStory, autocompleteStory, categoryListStory, listBoxStory,
```

### 3. Verify source preservation and gates

- Compare every converted story's `props` array and `defaultProps` object against its pre-change
  source. No `PropDef` entry, option list, label, or default value may be added, removed, or
  changed. Preserve `id`, `name`, and `section` verbatim.
- Confirm the three reported `iconPreset` mismatches remain unconverted and no `as any` is added.
- Run `npm run typecheck`, `npm run lint`, and `npm run build-prod`. Do not add unit tests or a
  harness; the user will perform the 45-story DOM comparison against EPIC-069's baseline.

## Concerns

1. **Wrapper-only controls — resolved as findings.** `iconPreset` is supplied by the three React
   story wrappers and is not accepted by the required direct view prop types. The prescribed safe
   response is to report those stories, not to loosen `Story<P>`, widen a view type, remove a
   control, or add `as any`. A later task can design a typed vanilla story adapter if it is needed.
2. **SelectableRow's JSX — resolved.** The source contradicts the zero-JSX note in the task: the
   story has three JSX tags. A DOM-only `previewChildren` callback permits the required `.ts`
   rename without introducing a React node into the vanilla constructor.
3. **Story-local demo context — resolved after baseline comparison.** The first implementation
   pointed three stories at bare face views and silently removed their demo containers. `Divider`
   lost its orientation-specific labels/layout, `Spacer` became blank, and `SelectableRow` lost its
   focus-selection opt-in. Each now has a local vanilla demo view that owns the equivalent Panel or
   focus wrapper while delegating the real component DOM to its child view. This is the reference
   pattern for the other 35 wrapper-shaped stories.
4. **Persistent preview child — resolved.** `SelectableRow` keeps its `previewChildren` provider,
   but memoizes its Panel element at module scope. The same Node is returned across refills because
   `fillSlot` appends Nodes and slots are refilled unconditionally.
5. **No other implementation files are needed.** `storyTypes.ts`, `LivePreview.tsx`, and the
   existing view classes are consumed as completed by US-1119 and are not modified.

## Unconverted Stories

- `src/renderer/uikit/Button/Button.story.tsx` — `iconPreset` is not a key of `ButtonViewProps`;
  its React wrapper maps that control to the view's `icon` prop.
- `src/renderer/uikit/IconButton/IconButton.story.tsx` — `iconPreset` is not a key of
  `IconButtonViewProps`; its React wrapper resolves the preset and supplies the required `icon`.
- `src/renderer/uikit/SplitButton/SplitButton.story.tsx` — `iconPreset` is not a key of
  `SplitButtonProps`; its React wrapper also supplies required `icon`, `items`, and `onClick`
  values. All three remain React stories until a separately designed typed adapter is authorized.

## Verification Results

- Source-level comparison: all eight converted stories retain identical `props`, `defaultProps`,
  `id`, `name`, and `section` values; the three unconverted stories are unchanged.
- DOM comparison follow-up: `truncated-text`, `label`, `checkbox`, `slider`, and `spinner` remain
  byte-identical; `Divider`, `Spacer`, and `SelectableRow` now retain their story-local demo
  containers and update semantics through local vanilla demo views.
- Registry source count: `ALL_STORIES` now contains 45 entries, including `selectableRowStory`.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run build-prod` — passed; existing bundler size/dynamic-import warnings only.

## Acceptance Criteria

- [x] Eight compatible stories use their specified `view` arm and exact concrete generic, with no
      `as any`; the three `iconPreset` wrapper stories are listed as unconverted findings.
- [x] `Divider`, `Spacer`, and `SelectableRow` preserve their story-local demo context through
      local vanilla demo views, mounted child views, and explicit structural rebuilding where needed.
- [x] Converted `.story.tsx` files are renamed to `.story.ts`; `Checkbox` and `Label` remain `.ts`.
- [x] `SelectableRow.story.ts` is registered in `storyRegistry.ts`, increasing `ALL_STORIES` from
      44 to 45, and the registry importer is touched after the renames.
- [x] Every converted story preserves `id`, `name`, `section`, every `PropDef` entry/value, and
      every existing `defaultProps` value exactly.
- [x] The registry uses `AnyStory` without array-level casts; `storyTypes.ts` and `LivePreview.tsx`
      are unchanged.
- [x] `npm run typecheck`, `npm run lint`, and `npm run build-prod` pass.
- [x] No unit tests, test harnesses, commits, dashboard/epic edits, Panel/Text edits, or unrelated
      story/component changes are introduced.

## Files Changed Summary

| File | Planned change |
|---|---|
| `src/renderer/uikit/Divider/Divider.story.ts` | Local vanilla demo view with orientation-specific Panel and mounted `DividerView`; renamed from `.tsx`. |
| `src/renderer/uikit/Slider/Slider.story.ts` | Vanilla `SliderView` story; renamed from `.tsx`. |
| `src/renderer/uikit/Spacer/Spacer.story.ts` | Local vanilla demo view with bordered Panel and mounted `SpacerView`; renamed from `.tsx`. |
| `src/renderer/uikit/Spinner/Spinner.story.ts` | Vanilla `SpinnerView` story; renamed from `.tsx`. |
| `src/renderer/uikit/TruncatedText/TruncatedText.story.ts` | Vanilla `TruncatedTextView` story; renamed from `.tsx`. |
| `src/renderer/uikit/Checkbox/Checkbox.story.ts` | Vanilla `CheckboxView` story; removes `as any`. |
| `src/renderer/uikit/Label/Label.story.ts` | Vanilla `LabelView` story; removes `as any`. |
| `src/renderer/uikit/SelectableRow/SelectableRow.story.ts` | Local vanilla demo view with focus wrapper, mounted `SelectableRowView`, and persistent preview child; renamed from `.tsx`. |
| `src/renderer/editors/storybook/storyRegistry.ts` | Register `SelectableRow`; importer touch for renamed stories. |
| `src/renderer/uikit/Button/Button.story.tsx` | No change: `iconPreset` mismatch finding. |
| `src/renderer/uikit/IconButton/IconButton.story.tsx` | No change: `iconPreset` mismatch finding. |
| `src/renderer/uikit/SplitButton/SplitButton.story.tsx` | No change: `iconPreset` mismatch finding. |
| `src/renderer/uikit/ProgressBar/ProgressBar.story.tsx` | No change; converted by US-1119. |
| `src/renderer/uikit/Panel/Panel.story.tsx` and `src/renderer/uikit/Text/Text.story.tsx` | No change; permanent React survivors. |
| `src/renderer/editors/storybook/storyTypes.ts` and `src/renderer/editors/storybook/LivePreview.tsx` | No change; completed by US-1119. |
| `doc/active-work.md` and `doc/epics/EPIC-069.md` | No change, per task instruction. |

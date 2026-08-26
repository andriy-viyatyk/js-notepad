# US-1121: The `type: "icon"` synthetic harness prop

**Status:** Implemented  
**Priority:** High  
**Epic:** [EPIC-069 â€” De-React E11: the Storybook contract](../../epics/EPIC-069.md)  
**Created:** 2026-08-26

## Goal

Make Storybook resolve `type: "icon"` controls centrally from preset ids to `IconRef` values,
then move the Button, IconButton, SplitButton, and Toolbar stories to the vanilla arm without
losing their demo wrappers, hover context, fallback icons, or SplitButton's per-host icon factory.

## Background

US-1119 made `PropDef<P>["name"]` a `keyof P & string`. The current `iconPreset` names are
synthetic wrapper controls, so they correctly fail against the actual component prop types. The
control is still conceptually valid; its translation belongs in the Storybook harness, alongside
the existing `STORYBOOK_MANAGED_PROPS` injection in
`src/renderer/editors/storybook/LivePreview.tsx`.

`src/renderer/editors/storybook/iconPresets.tsx` is the existing source of preset rendering:
`resolveIconPreset()` returns `IconRef | null`, and `PropertyEditor.tsx` already renders
`ICON_PRESETS` for `type: "icon"`. The property editor therefore remains unchanged. The harness
will scan each story's `props`, resolve an icon-typed value under its declared prop name, and pass
the resulting `IconRef | null` to the selected component or view. `null` means that no icon was
selected; optional Button accepts that directly, while the two stories whose old wrappers supplied
required visual fallbacks continue to do so locally.

The complete preparation sequence is exported as `prepareStoryProps()` from
`src/renderer/editors/storybook/story-props.ts`. Verification must use that function because it is
the only faithful reproduction of the harness render path; duplicating the sequence omitted icon
resolution once and produced a false empty-icon regression. Keeping it beside the harness types
also lets a later native `LivePreview` use the same preparation unchanged.

The inspected component contracts are:

| Story | Real icon prop | Vanilla story shape |
|---|---|---|
| Button | `ButtonProps.icon?: IconRef` | `ButtonDemoView` owns a `ButtonView` and optional hover-reveal Panel |
| IconButton | `IconButtonProps.icon: IconRef` | `IconButtonDemoView` owns an `IconButtonView`, using a fresh `settings` fallback for null |
| SplitButton | `SplitButtonProps.icon: IconRef` | `SplitButtonDemoView` owns a `SplitButtonView`; its `makeIcon()` clones a resolved DOM node or creates `download` |
| Toolbar | no `ToolbarProps.icon` | `ToolbarDemoView` owns a `ToolbarView` and preserves the fixed nested Save demo icon; no icon PropDef exists in this checkout |

`SplitButtonProps` requires one icon for the primary region and its `items` are independently
rendered. A DOM `IconRef` is single-use: appending it to the menu after the primary moves it out
of the primary. The vanilla demo therefore keeps the old factory behavior, cloning the harness's
resolved DOM icon for each use and creating a new download node when the harness value is null.

Each converted story-local wrapper uses a stable `display: contents` host, builds child DOM in
`onMount()`, claims and mounts its face view, and updates it in place. Button and IconButton
rebuild their owned Panel subtree when `hideUntilParentHover` changes because that prop changes
the returned structure; otherwise only the child view is updated. Toolbar retains `picked` in a
vanilla field and re-renders the existing ToolbarView's React-compatible children, matching the
old wrapper's state lifetime while using the already-converted Toolbar view.

## Implementation Plan

1. Keep the existing icon PropDef declaration in
   `src/renderer/editors/storybook/storyTypes.ts`; its `default?: IconPresetId` remains the
   editor-facing value type and the existing `keyof P & string` contract is satisfied by the
   real `icon` keys.
2. In `src/renderer/editors/storybook/LivePreview.tsx`, import `resolveIconPreset` and resolve
   every `type: "icon"` PropDef after prop values/defaults and before either rendering arm. Do not
   add `icon` to `STORYBOOK_MANAGED_PROPS`, because icon controls must remain visible in
   `PropertyEditor.tsx`.
3. Rename and rewrite the four story files:
   `Button.story.tsx`, `IconButton.story.tsx`, `SplitButton.story.tsx`, and `Toolbar.story.tsx`
   become `.story.ts` files. Each story keeps its existing `id`, `name`, `section`, control order,
   labels, options, and default values. The first three change the icon PropDef name from
   `iconPreset` to the real `icon`; Toolbar keeps its current controls and fixed Save demo because
   it has no icon PropDef in the actual source.
4. Implement the local demo views in the story files:

   ```ts
   // Before
   const ButtonWithIcon = (props: any) => {
       const { iconPreset, ...rest } = props;
       return React.createElement(Button, {
           ...rest,
           icon: resolveIconPreset(iconPreset),
       });
   };

   // After
   class ButtonDemoView extends VanillaView<ButtonDemoViewProps> {
       public constructor(props: ButtonDemoViewProps) {
           super(props, createContentsHost());
       }

       protected onMount(): void {
           this.rebuild(this.props);
       }

       protected onUpdate(props: ButtonDemoViewProps): void {
           // Rebuild only when the hover Panel structure changes.
       }
   }
   ```

   The actual implementation must forward all wrapper-interpreted props, preserve `title ||`
   `undefined`, retain Button/IconButton's hover-reveal Panel and hint text, preserve IconButton's
   settings fallback, preserve SplitButton's primary/menu items and callbacks, and retain
   Toolbar's Demo/Action/Save/Spacer/SegmentedControl sample plus its `picked` state.
5. Touch `src/renderer/editors/storybook/storyRegistry.ts` after the `.tsx` â†’ `.ts` renames so
   Vite does not retain stale story specifier resolution. Do not reorder stories or alter unrelated
   registry entries.
6. Compare the four original story declarations against the new versions. The only intended
   control declaration changes are the three `iconPreset` â†’ `icon` key changes required by the
   component contracts; all metadata, options, labels, and defaults remain unchanged. Confirm no
   React wrapper uses `resolveIconPreset` or `as any` afterward.
7. Run `npm run typecheck`, `npm run lint`, and `npm run build-prod`. No tests or verification
   harness are to be added; the user owns the four-story DOM comparison.

## Concerns

1. **The source does not match one statement in EPIC-069.** The checked-in Toolbar story imports
   `resolveIconPreset` but has no `iconPreset` PropDef and resolves a fixed `"save"` icon for its
   nested IconButton. `ToolbarProps` likewise has no `icon`. This task preserves that behavior and
   converts Toolbar's actual wrapper; it does not invent an editable Toolbar control or add an
   `icon` prop to Toolbar.
2. **Null at the harness boundary is intentional.** `resolveIconPreset("none")` and an absent
   value produce `null`. Button receives no icon; IconButton supplies a fresh settings node; and
   SplitButton supplies fresh download/cloned nodes, matching the old wrappers.
3. **SplitButton cannot receive one shared DOM node.** Its primary and menu item each consume an
   icon host. `SplitButtonDemoView.makeIcon()` returns a clone for a resolved Node and a fresh
   fallback node otherwise. String `IconRef` values are safe to reuse, but the current resolver
   produces Nodes, so the clone path is required.
4. **Structural hover changes need explicit ownership cleanup.** The Button and IconButton demo
   views release their child view and replace only their contents when the hover wrapper toggles;
   ordinary prop changes update the existing child view.
5. **No other files need changes.** `PropertyEditor.tsx` remains unchanged because its icon
   selector already edits preset ids from `ICON_PRESETS`. `iconPresets.tsx`, all component views,
   `Panel`, `Text`, the nine prior converted stories, `doc/active-work.md`, and
   `doc/epics/EPIC-069.md` remain unchanged.

## Verification Results

- Source review: the three editable icon controls now use the real `icon` key; all original
  metadata, control order, labels, options, and default values are preserved. Toolbar had no
  `iconPreset` control in this checkout and retains its fixed Save demo.
- `PropertyEditor.tsx` and `iconPresets.tsx` are unchanged; icon preset resolution occurs once
  in `LivePreview.tsx` before either rendering arm.
- `npm run typecheck` â€” passed.
- `npm run lint` â€” passed.
- `npm run build-prod` â€” passed; existing bundler size and dynamic-import warnings only.

## Acceptance Criteria

- [x] `type: "icon"` PropDefs name the consuming real `icon` prop for Button, IconButton, and
      SplitButton; their preset ids resolve centrally in `LivePreview` to `IconRef | null`.
- [x] `PropertyEditor.tsx` is unchanged from the user's perspective and `ICON_PRESETS` remains its
      source.
- [x] Button, IconButton, SplitButton, and Toolbar stories use local `VanillaView` demo classes;
      their `.story.tsx` files are renamed to `.story.ts` and the registry importer is touched.
- [x] Button and IconButton preserve the hover-reveal Panel and hint; IconButton preserves its
      settings fallback; SplitButton preserves its download fallback, items, handlers, and
      per-host icon factory; Toolbar preserves its sample children and selected-segment state.
- [x] Every story keeps its `id`, `name`, `section`, PropDef labels/options/default values, and
      existing `defaultProps` values; no `as any` is introduced.
- [x] No files outside the scoped stories, `LivePreview.tsx`, and
      `storyRegistry.ts` are changed, and no tests or harnesses are added.
- [x] `npm run typecheck`, `npm run lint`, and `npm run build-prod` pass.

## Files Changed Summary

| File | Planned change |
|---|---|
| `doc/tasks/US-1121-icon-synthetic-prop/README.md` | Record the resolved icon-harness design, wrapper conversion plan, concerns, and acceptance criteria. |
| `src/renderer/editors/storybook/story-props.ts` | Export the single faithful story-prop preparation sequence for rendering and verification. |
| `src/renderer/editors/storybook/LivePreview.tsx` | Resolve icon-typed prop values through `resolveIconPreset` before rendering either arm. |
| `src/renderer/editors/storybook/storyRegistry.ts` | Touch the importer after the four story extension renames. |
| `src/renderer/uikit/Button/Button.story.ts` | Vanilla Button demo view with preserved optional hover Panel. |
| `src/renderer/uikit/IconButton/IconButton.story.ts` | Vanilla IconButton demo view with preserved hover Panel and settings fallback. |
| `src/renderer/uikit/SplitButton/SplitButton.story.ts` | Vanilla SplitButton demo view with fresh/cloned per-host icons and preserved menu behavior. |
| `src/renderer/uikit/Toolbar/Toolbar.story.ts` | Vanilla Toolbar demo view with preserved sample content and selected-segment state. |

Files intentionally needing **no changes**: `src/renderer/editors/storybook/PropertyEditor.tsx`,
`src/renderer/editors/storybook/iconPresets.tsx`, all four component implementation files and
stylesheets, `src/renderer/uikit/Panel/`, `src/renderer/uikit/Text/`, the nine stories converted
by US-1120, `doc/active-work.md`, and `doc/epics/EPIC-069.md`.

# US-975: Emotion usage inventory

**Status:** Implemented — reviewed as part of EPIC-051 close-out
**Created:** 2026-08-18
**Epic:** [EPIC-051 — De-React Epic P](../../epics/EPIC-051.md)

## Goal

Produce the Emotion inventory that Epic A needs before replacing Emotion with CSS custom
properties and static CSS. Classify every current renderer import as static/non-prop styling or
true prop-driven Emotion interpolation, and record the small set of infrastructure and story
exceptions without changing source code.

## Background

Epic P's opening measurement counted 79 renderer files importing `@emotion/styled` or
`@emotion/react`. The pinned scan below reproduces that number on the current branch and includes
`*.story.tsx`, matching the epic's baseline. For production code, the story is excluded, leaving
78 files.

The classification in this document is deliberately narrower than "does the component's
appearance depend on props?": a style is **static/non-prop Emotion** when the Emotion definition
does not read runtime props. It may still respond to `data-*` attributes, pseudo-classes, shared
selectors, or inline styles supplied by the component. It is **dynamic Emotion** only when an
Emotion style callback reads a runtime value such as `topPx`, `$size`, or `indentSize`.
Inline `style={{ ... }}` values are not part of this Emotion count; they are measured separately in
[US-979](../US-979-inline-style-inventory/README.md).

The codebase already has useful seams for the eventual conversion:

- `theme/color.ts` resolves theme colors to CSS custom properties.
- `uikit/tokens.ts` centralizes UIKit spacing, sizes, radii, and font sizes.
- Most component variants are already expressed as static selectors over `data-*` attributes.
- `src/renderer/uikit/shared/selection-style.ts` centralizes reusable selector objects, while
  `src/renderer/theme/GlobalStyles.tsx` owns global rules and theme-dependent scrollbar SVG data
  URIs.

Emotion remains a package dependency (`@emotion/react` 11.14.0 and `@emotion/styled` 11.14.1),
but this task does not remove or alter dependencies. It is a measurement and planning task only.

## Inventory

### Pinned measurement

Run from the repository root:

```powershell
rg -l '@emotion/(styled|react)' src/renderer --glob '*.{ts,tsx}' | Sort-Object
```

Measured result on 2026-08-18:

| Area | Files | Eligible static/non-prop | Dynamic Emotion | Superseded | Notes |
|---|---:|---:|---:|---:|---|
| `uikit/` | 56 | 42 | 5 | 9 | Includes one story; `42 + 5 + 9 = 56` |
| `ui/` | 10 | 10 | 0 | 0 | Shell styles use static objects/selectors |
| `components/` | 11 | 11 | 0 | 0 | Coupled components use static objects/selectors |
| `core/` | 1 | 1 | 0 | 0 | `core/state/view.tsx` root wrapper |
| `theme/` | 1 | 1 | 0 | 0 | `GlobalStyles.tsx` is global stylesheet infrastructure |
| **Total** | **79** | **65** | **5** | **9** | **78 production; 69 eligible after AVGrid exclusion** |

### Eligible static/non-prop files — 65

These files have no Emotion style callback that reads component props. Their eventual conversion
is expected to be CSS extraction plus preservation of the existing selectors, token references,
animation rules, and inline values where those are already part of the rendering code.

**`uikit/` — 42 production files**

- `src/renderer/uikit/Autocomplete/Autocomplete.tsx`
- `src/renderer/uikit/Breadcrumb/Breadcrumb.tsx`
- `src/renderer/uikit/Button/Button.tsx`
- `src/renderer/uikit/CategoryList/CategoryList.tsx`
- `src/renderer/uikit/Checkbox/Checkbox.tsx`
- `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.tsx`
- `src/renderer/uikit/Dialog/Dialog.tsx`
- `src/renderer/uikit/Dialog/DialogContent.tsx`
- `src/renderer/uikit/Divider/Divider.tsx`
- `src/renderer/uikit/Dot/Dot.tsx`
- `src/renderer/uikit/IconButton/IconButton.tsx`
- `src/renderer/uikit/ImageViewport/ImageViewport.tsx`
- `src/renderer/uikit/Input/Input.tsx`
- `src/renderer/uikit/Label/Label.tsx`
- `src/renderer/uikit/ListBox/ListBox.tsx`
- `src/renderer/uikit/ListBox/ListItem.tsx`
- `src/renderer/uikit/ListBox/SectionItem.tsx`
- `src/renderer/uikit/Menu/Menu.tsx`
- `src/renderer/uikit/Minimap/Minimap.tsx`
- `src/renderer/uikit/MultiListBox/MultiListBox.tsx`
- `src/renderer/uikit/MultiSelect/MultiSelect.tsx`
- `src/renderer/uikit/Notification/Notification.tsx`
- `src/renderer/uikit/Panel/Panel.tsx`
- `src/renderer/uikit/PathInput/PathInput.tsx`
- `src/renderer/uikit/Popover/Popover.tsx`
- `src/renderer/uikit/ProgressBar/ProgressBar.tsx`
- `src/renderer/uikit/RadioGroup/RadioGroup.tsx`
- `src/renderer/uikit/RenderGrid/RenderGrid.tsx`
- `src/renderer/uikit/SegmentedControl/SegmentedControl.tsx`
- `src/renderer/uikit/Select/Select.tsx`
- `src/renderer/uikit/SelectableRow/SelectableRow.tsx`
- `src/renderer/uikit/shared/selection-style.ts`
- `src/renderer/uikit/Slider/Slider.tsx`
- `src/renderer/uikit/SplitButton/SplitButton.tsx`
- `src/renderer/uikit/Splitter/Splitter.tsx`
- `src/renderer/uikit/Tag/Tag.tsx`
- `src/renderer/uikit/TagsInput/TagsInput.tsx`
- `src/renderer/uikit/Text/Text.tsx`
- `src/renderer/uikit/Textarea/Textarea.tsx`
- `src/renderer/uikit/Tooltip/Tooltip.tsx`
- `src/renderer/uikit/Tree/Tree.tsx`
- `src/renderer/uikit/TruncatedText/TruncatedText.tsx`

### Superseded — do not convert in Epic A — 9 files

The UIKit AVGrid implementation is scheduled for replacement by the dependency-free vanilla
`av-grid`. Extracting its Emotion CSS into Epic A would create work that is immediately deleted,
and `AVGrid.tsx` is especially unsafe to treat as mechanical: it is the only `styled(RenderGrid)`
composition and its roughly 170-line block reaches into RenderGrid's DOM through load-bearing
descendant selectors and specificity. These nine files remain part of the 79-file measurement but
are excluded from the 69-file Epic A conversion estimate:

- `src/renderer/uikit/AVGrid/AVGrid.tsx`
- `src/renderer/uikit/AVGrid/CellInput.tsx`
- `src/renderer/uikit/AVGrid/CellSelect.tsx`
- `src/renderer/uikit/AVGrid/DataCell.tsx`
- `src/renderer/uikit/AVGrid/filters/FilterBar.tsx`
- `src/renderer/uikit/AVGrid/filters/FilterPopover.tsx`
- `src/renderer/uikit/AVGrid/filters/OptionsFilterContent.tsx`
- `src/renderer/uikit/AVGrid/HeaderCell.tsx`
- `src/renderer/uikit/AVGrid/SelectColumn.tsx`

**`ui/` — 10 files**

- `src/renderer/ui/app/EditorErrorBoundary.tsx`
- `src/renderer/ui/app/MainPage.tsx`
- `src/renderer/ui/app/Pages.tsx`
- `src/renderer/ui/secondary-views/SideBarPanelHeader.tsx`
- `src/renderer/ui/sidebar/FolderItem.tsx`
- `src/renderer/ui/sidebar/MenuBar.tsx`
- `src/renderer/ui/sidebar/PinnedRail.tsx`
- `src/renderer/ui/sidebar/ToolsEditorsPanel.tsx`
- `src/renderer/ui/tabs/PageTab.tsx`
- `src/renderer/ui/tabs/PageTabs.tsx`

**`components/` — 11 files**

- `src/renderer/components/file-grid/FileGrid.tsx`
- `src/renderer/components/file-list/FileList.tsx`
- `src/renderer/components/file-search/FileSearch.tsx`
- `src/renderer/components/git-tree/BranchTreeCell.tsx`
- `src/renderer/components/git-tree/GitStatusBadge.tsx`
- `src/renderer/components/git-tree/GitTree.tsx`
- `src/renderer/components/git-tree/RefBadge.tsx`
- `src/renderer/components/git-tree/SideSelectToggle.tsx`
- `src/renderer/components/icons/FileIcon.tsx`
- `src/renderer/components/tree-provider/CategoryView.tsx`
- `src/renderer/components/tree-provider/TreeProviderView.tsx`

**`core/` and `theme/` — 2 files**

- `src/renderer/core/state/view.tsx` — static `ViewRoot` wrapper; the `Views` registry remains
  part of Epic B's framework boundary work.
- `src/renderer/theme/GlobalStyles.tsx` — global CSS and theme-dependent SVG scrollbar rules;
  not a component-level extraction candidate.

### Dynamic Emotion files — 5

Four are eligible production files. The fifth is a story-only demo and is inventory-only under D10.

| File | Runtime style inputs | Likely future seam |
|---|---|---|
| `src/renderer/uikit/Progress/ProgressOverlay.tsx` | `topPx` controls pill position; `clickable` controls pointer events | CSS custom property for position plus a class/data attribute for interactivity |
| `src/renderer/uikit/Spinner/Spinner.tsx` | `$size` controls dimensions; `$color` controls color | CSS custom properties or direct inline dimensions/color; preserve the keyframe |
| `src/renderer/uikit/Tree/SectionItem.tsx` | `Indent.size` and `Indent.first` control width/border | CSS custom property for width and a class/data attribute for the first indent |
| `src/renderer/uikit/Tree/TreeItem.tsx` | `Indent.size`, `Indent.first`, `Chevron.size`, `ChevronStub.size` | CSS custom property for dimensions and a class/data attribute for first-indent behavior |
| `src/renderer/uikit/Tree/Tree.story.tsx` | `$level`, `$selected`, `$active` in the custom-row demo | Story harness only; do not let it drive production conversion scope |

Representative current forms:

```tsx
const Root = styled.div<{ width: CSSProperties["width"] }>(
    (props) => ({ minWidth: props.width }),
);

const SpinnerRoot = styled.span<{ $size: number; $color?: string }>(
    ({ $size, $color }) => ({ width: $size, height: $size, color: $color }),
);
```

### Keyframes — 3 runtime Emotion definitions

These are static with respect to component props, but they are a separate conversion mechanic:
Emotion currently mints runtime animation names, while plain CSS needs stable names in a stylesheet.
The names must be globally unique and the declarations must remain available to every consumer.

| File | Definition | Use |
|---|---|---|
| `src/renderer/uikit/Dialog/Dialog.tsx:3,27` | `pulse` | Dialog attention animation |
| `src/renderer/uikit/ProgressBar/ProgressBar.tsx:3,36` | `indeterminateSlide` | Indeterminate fill animation |
| `src/renderer/uikit/Spinner/Spinner.tsx:3,21` | `spin` | Spinner rotation; also has dynamic size/color inputs |

Four files import `@emotion/react` at runtime: `GlobalStyles.tsx` (the `css` and `Global`
runtime) and the three keyframe files. `shared/selection-style.ts` has a fifth, type-only import
that compiles away; it is listed separately below because its exported selectors are shared
infrastructure.

The rest of the prop-dependent visuals use static selectors over attributes or ordinary React
inline styles, so they belong in the static inventory rather than this five-file dynamic list.

## Implementation plan

This task intentionally produces documentation only; it does not convert any Emotion usage.

1. **Freeze and publish the measurement.** Keep the pinned command, the 79-file total, the
   65/5/9 partition, the production 78-file count, the 69-file eligible count, and the exact file
   lists above together so Epic A can detect scope drift rather than re-inventing the baseline.

2. **Record the static extraction surface.** Treat the 65 eligible static/non-prop files as the
   mechanical candidate set for Epic A. Preserve existing `data-*` selector behavior, `color.ts`
   and `tokens.ts` references, pseudo-class specificity, keyframes, labels used for debugging, and
   the reusable selection-style selectors. Do not infer that every prop-dependent visual needs a
   generated class: most already arrives as a data attribute or inline style. The nine AVGrid
   files are measured but explicitly excluded because the component is superseded.

3. **Record the dynamic decision surface.** Carry the four eligible production dynamic files and their
   runtime inputs into the Epic A open-decision work. Keep `Tree.story.tsx` out of the production
   estimate. No dynamic styling strategy is selected here; the later task must apply the chosen
   strategy consistently to scalar values, discrete state, and pointer-event behavior.

4. **Keep infrastructure separate.** Handle `GlobalStyles.tsx`, `selection-style.ts`, and
   `core/state/view.tsx` as explicit infrastructure entries, not as ordinary component rewrites.
   `selection-style.ts` is not a runtime Emotion dependency, but its exported selector objects are
   spread into consumers across Tree, ListBox, CategoryList, and SelectableRow, so its conversion
   must be coordinated with those consumers rather than sized as a one-line type-only change.
   In particular, the global stylesheet's resolved-color SVG data URIs and theme-switch behavior
   must survive the token foundation in Epic A, while the `Views` registry remains an Epic B
   boundary concern.

5. **Verify the inventory without style conversion.** Re-run the pinned scan and confirm 79 files,
   65 eligible static entries, 5 dynamic entries, 9 superseded AVGrid entries, 78 production
   files, and 69 eligible production files. Confirm that `src/renderer/editors/` contains zero
   Emotion files; editor-owned styling is already following the scoped-CSS policy. No Emotion
   package or style conversion belongs in US-975.

## Concerns / Open questions

1. **Roadmap open decision #4 is not resolved.** Epic A still needs to choose between CSS custom
   properties set by the view and generated class hooks for dynamic prop-driven styling. This task
   should expose the exact cases, not silently decide the architecture. A practical default is
   static CSS for discrete state plus CSS custom properties for scalar geometry/color values, but
   that remains an Epic A decision.

2. **"Static" does not mean "copy the generated Emotion CSS blindly."** The conversion must
   preserve selector specificity and insertion order. Tree/list focus-selection overrides,
   `data-*` variant rules, direct-child SVG sizing, and hover/focus rules are behavior-sensitive;
   a CSS extraction that merely copies declarations but changes ordering can alter the UI. AVGrid
   is the most extreme example and is excluded because its replacement is already scheduled.

3. **Inline styles are a sibling inventory, not part of this count.** There are 133
   `style={{ ... }}` sites across 51 non-story `.tsx` files. [US-979](../US-979-inline-style-inventory/README.md)
   records that surface so Epic A cannot mistake the six dynamic Emotion files for a complete
   dynamic-style estimate.

4. **GlobalStyles has runtime theme work.** Its scrollbar arrow SVGs embed a resolved color in a
   data URI, and the global rules depend on the active theme. Moving component styles first while
   leaving this mechanism implicit could make scrollbar colors stale after a theme switch. Treat
   it as token/theme infrastructure, not as a mechanical component conversion.

5. **The story is a measurement exception.** `Tree.story.tsx` is included so the 79-file baseline
   matches the epic, but it is not a production Emotion consumer. It should remain available as a
   visual harness and should not be counted as Epic A production work.

6. **The editors are already clean.** A repository scan finds zero Emotion imports under
   `src/renderer/editors/`. Their scoped CSS and inline styles remain separate from this UIKit/
   shell inventory.

7. **Emotion's generated class identity is not an API contract.** No caller should depend on
   Emotion class names. The future CSS form must preserve DOM structure, attributes, and behavior,
   while debug `label` names and the `data-name` contract should remain useful for automation and
   visual verification.

## Acceptance criteria

- [ ] The pinned scan reconciles to 79 Emotion-importing renderer files.
- [ ] The inventory partitions all 79 files into 65 eligible static/non-prop files, 5 dynamic
      Emotion files, and 9 superseded AVGrid files, with every path listed in this document.
- [ ] The production estimate is explicit: 78 files after excluding `Tree.story.tsx`, with 69
      eligible files after excluding AVGrid and four eligible production dynamic files.
- [ ] `GlobalStyles.tsx`, `uikit/shared/selection-style.ts`, and `core/state/view.tsx` have named
      infrastructure treatment rather than being silently mixed into component conversion work.
- [ ] Dialog, ProgressBar, and Spinner keyframes have a named inventory and stable-name conversion
      requirement.
- [ ] The dynamic table records every runtime Emotion input and a candidate CSS-variable/class
      seam without choosing roadmap open decision #4.
- [ ] No Emotion style conversion or package dependency change is made by US-975; the output is
      the documented inventory used to plan Epic A.
- [ ] The dashboard and EPIC-051 link to this document, and the inventory is marked Implemented
      pending epic-level review and the later Epic A decision.

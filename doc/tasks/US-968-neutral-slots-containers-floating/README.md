# US-968: Neutral slots - UIKit containers and floating layer

## Status

**Status:** Implemented — reviewed as part of EPIC-051 close-out
**Priority:** High
**Epic:** [EPIC-051: De-React Epic P - Preparation (React-side)](../../epics/EPIC-051.md)
**Depends on:** [US-965: Icon name registry + neutral slot types (foundation)](../US-965-icon-registry-slots/README.md), [US-966: Neutral slots - UIKit primitives and inputs](../US-966-neutral-slots-primitives/README.md), [US-967: Neutral slots - UIKit list and data components](../US-967-neutral-slots-list-data/README.md)
**Created:** 2026-08-16

## Goal

Adopt the neutral icon and text-slot vocabulary from US-965 across the remaining UIKit container
headers. Convert the container-owned title/icon contracts and named built-in icons while keeping
arbitrary children, action subtrees, render-prop triggers, and grid extras at their documented
React composition boundaries until Epic C designs the mount adapter.

## Background

US-965 provides `IconRef = IconName | ReactNode`, `SlotText = string | ReactNode`, and
`renderIcon(icon, props?)`. US-966 and US-967 establish the staged rules used here:

- use plain `string` where the inventory has no rich callers;
- use `IconRef` for icons so named icons can survive the later SVG migration while legacy React
  icons remain compatible;
- use `renderIcon` at the consuming component for component-owned icons;
- leave arbitrary subtrees as React composition under EPIC-051 D4;
- leave callbacks that return React subtrees as callbacks under D5.

This task covers the container and floating-layer inventory named by EPIC-051: `DialogContent`,
`CollapsiblePanel`, `PopoverModel`, `WithMenu`, `RenderGridModel`, and `AVGridModel`.

### Measured inventory

The renderer was re-measured on 2026-08-16, excluding stories unless noted:

| Surface | Current React-bearing prop | Measured callers / finding | US-968 treatment |
|---|---|---|---|
| `DialogContent` | `title` | 14 production callers; all values are strings or typed string state; no `title={<...>}` caller | `string` |
| `DialogContent` | `icon` | 14 production callers; built-in icons map to registry names, except `TorIcon` from `language-icons.tsx` | `IconRef`; migrate registry-compatible built-ins, retain `TorIcon` as a legacy React node |
| `DialogContent` | `headerButtons` | one story caller in `Dialog.story.tsx:84`; no production callers found | keep as a React subtree for the documented affordance |
| `DialogContent` | `children` | dialog bodies are arbitrary subtrees | retain React subtree |
| `CollapsiblePanel` | `title` | three callers in `CollapsiblePanelStack.story.tsx`; all are strings | `string` |
| `CollapsiblePanel` | `icon` | zero production or story callers found | `IconName` |
| `CollapsiblePanel` | `buttons` | one story caller in `CollapsiblePanelStack.story.tsx:51`; no production callers found | keep as a React subtree for the documented affordance |
| `CollapsiblePanel` | `children` | panel bodies are arbitrary subtrees | retain React subtree |
| `WithMenu` | render-prop `children` | 12 production files; each callback returns one React trigger element | retain callback under D5 |
| `PopoverModel` / `Popover` | `children` | every use supplies arbitrary popover content; no text/icon slot exists | no API conversion; retain children under D4 |
| `RenderGridModel` | `extraElement`, `extraElementTop` | extras are arbitrary content; top/bottom controls include click handlers and positioning classes | retain React subtrees under D4 |
| `AVGridModel` | `extraElement` | `GitTree` supplies an interactive load-more subtree; AVGrid also creates add-row/add-column controls | retain React subtree under D4 |

The measured inventory does not justify a new `SlotContent`, `renderSlot`, callback-returning-
`ReactNode` helper, or serializable descriptor. `SlotText` has no new consumer in this task.

## Implementation plan

### 1. Normalize `DialogContent`

- In `src/renderer/uikit/Dialog/DialogContent.tsx`, change `title?: React.ReactNode` to
  `title?: string` and `icon?: React.ReactNode` to `icon?: IconRef`.
- Keep `headerButtons` and `children` as React subtrees. They are composition boundaries, not text
  or icon data, and must not be wrapped in a generic callback type.
- When an icon is present, render it with `renderIcon(icon)` so both a registry name and an existing
  React resolver remain valid. Keep the existing header detection, title layout, sizing, close
  behavior, and DOM attributes unchanged.
- Make the component-owned close icon use the registry name `"close"` through the existing
  `IconButton` contract.
- Migrate registry-compatible built-in icons at the `DialogContent` call sites to names:
  `git`, `confirm`, `board`, `lock`, `open-file`, `warning`, `folder-open`, and `rename`.
  Keep `TorIcon` from `theme/language-icons.tsx` as a React-node caller because language icons are
  explicitly excluded from `IconName`.
- While touching those call sites, use names for the four additional built-in controls:
  `CreateBoardDialog.tsx:132` and `CreateBoardVarsStorageDialog.tsx:116` use
  `icon="folder-open"`, `OpenUrlDialog.tsx:83` uses `icon="open-file"`, and
  `EditLinkDialog.tsx:236` uses `icon="close"`.
- Confirm all dialog titles remain strings after the type narrowing; no dialog body or close
  button behavior changes.

### 2. Normalize `CollapsiblePanel`

- In `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.tsx`, change the marker
  component's `title` to `string` and `icon` to `IconName`. The icon has zero callers, so D3's
  legacy React arm is unnecessary here; widen it later only if a real caller appears.
- Keep `buttons`, `children`, and `headerRef` unchanged. `buttons` is an interactive subtree and
  `headerRef` is intentionally used by secondary views to portal their own header content.
- Resolve the owned expanded/collapsed chevrons with `renderIcon("chevron-down")` and
  `renderIcon("chevron-right")`. Preserve the existing no-chevron rules, header click handling,
  `data-state` attributes, SVG sizing selectors, header button event isolation, and panel-body
  mount behavior.
- Resolve `panel.icon` with `renderIcon`; the result remains a bare SVG direct child of the header.
- Keep `headerButtons` and `buttons` as designed React subtree affordances even though each has only
  one story caller and no production pressure. Deleting documented API solely because it is unused
  would be a product decision; Epic C can handle these low-pressure adapter cases last or remove
  them deliberately.
- Leave `CollapsiblePanelStack`'s own `children` contract unchanged; it consumes marker elements,
  not a neutral data list.

### 3. Confirm the floating-layer boundary

- Inspect `src/renderer/uikit/Popover/PopoverModel.ts` and `Popover.tsx` and make no children
  conversion. `children` is the only React-bearing public slot, and it carries arbitrary popover
  content. Keep the existing floating-ui positioning, resize handling, dismissal effects, and
  `document.body` portal unchanged; the shared portal host belongs to US-973.
- Inspect `src/renderer/uikit/Menu/WithMenu.tsx` and keep its render prop as
  `(setOpen: (anchor: Element | null) => void) => React.ReactElement`. It is a component subtree
  callback, and all 12 production callers rely on that trigger element. Preserve focus restore,
  anchor state, placement, offset, and menu close behavior.
- Record these as explicit D4/D5 deferrals rather than hiding the React return type behind an alias.

### 4. Confirm grid extra-element deferrals

- Inspect `src/renderer/uikit/RenderGrid/RenderGridModel.ts` and `RenderGrid.tsx`. Keep
  `extraElement` and `extraElementTop` as React subtrees and preserve their current insertion
  points: after rendered cells and inside the sticky-top region respectively.
- Inspect `src/renderer/uikit/AVGrid/model/AVGridModel.ts` and `AVGrid/AVGrid.tsx`. Keep
  `AVGridProps.extraElement` as a React subtree and preserve the precedence rule where the
  internal add-row control wins over a caller-supplied extra element. Keep the internal add-column
  control in `extraElementTop`.
- Verify `src/renderer/components/git-tree/GitTree.tsx`'s `loadMore` subtree continues to render
  and remains interactive. No callback protocol, text alias, or descriptor is introduced for these
  controls; they are the same subtree boundary as `children`.

### 5. Close the US-967 row-label carry-over where callers permit

- Keep `ListItemProps.label`, `ITreeItem.label`, and `TreeItemProps.label` as React-capable
  contracts because typecheck found real rich callers: the styled folder label in
  `editors/link-editor/LinksList.tsx:84`, the public `TreeProviderView.getLabel` override at
  `components/tree-provider/TreeProviderView.tsx:297-299`, styled category labels in
  `editors/notebook/category-tree.tsx:18-42`, and composed Rest Client labels in
  `editors/rest-client/RestClientShared.tsx:498-574`.
- Keep `Tree/SectionItem.label` React-capable as well: the generic `Tree.tsx:193-197` section
  branch forwards the shared `ITreeItem.label` shape, which still permits the named rich callers.
- Preserve the rich-label guards on the four primitives; this is the measured compiler outcome,
  not an invented generic slot protocol.
- Record the concrete blockers in the US-967 document so the remaining neutral boundary can be
  designed with Epic C rather than silently weakening those callers.

### 6. Verify the staged migration

- Use direct imports from `uikit/shared/slots` for `IconRef` and `renderIcon`; do not add another
  slot abstraction or expand the public barrel exports.
- Run `npm run typecheck`, `npm run lint`, and `git diff --check`.
- Perform smoke checks for dialog titles/icons/close buttons, the CollapsiblePanel expanded and
  collapsed chevrons, story action buttons, all WithMenu trigger variants, popover dismissal and
  resize behavior, grid add-row/add-column controls, and the GitTree load-more links.
- Confirm dialog body composition, panel header portals, focus restoration, tooltip/menu behavior,
  data attributes, SVG sizing, and grid insertion positions are unchanged.
- Do not add unit tests; this project has no unit-test harness and the smoke checks are the intended
  verification for this refactor.

## Concerns / Open questions

### Subtree props are intentionally deferred

`headerButtons`, `buttons`, `children`, `WithMenu`'s render prop, `Popover.children`,
`RenderGrid.extraElement`/`extraElementTop`, and `AVGrid.extraElement` all carry arbitrary or
interactive React subtrees. Converting them to `SlotText` would be incorrect, and a callback
returning `ReactNode` would be the framework-specific protocol rejected by EPIC-051 D4/D5. Epic C
must define how `mountReact`/`mountVanilla` transports these subtrees.

### Row-label subtrees remain at named legacy callers

The US-967 carry-over could not narrow the four Tree/List row primitives without breaking four real
styling/control patterns: LinksList's bold folder label, TreeProviderView's public rich label
override, notebook category count labels, and Rest Client root/request labels. The generic
`Tree.tsx` section branch also forwards that shared label shape, so `Tree/SectionItem.label` retains
its React arm until a string-only section-data boundary is designed.

### Dynamic and excluded icons remain valid legacy callers

`DialogContent.icon` cannot narrow to `IconName` alone: its 14 callers include the excluded
`TorIcon`, and the staged `IconRef` contract preserves that real legacy caller. `CollapsiblePanel`
has zero icon callers, so it can use `IconName` directly. Only built-in icons with verified registry
names should be changed to strings; language icons remain outside the registry.

### Story-only subtree affordances are intentionally kept

`DialogContent.headerButtons` has one story caller (`Dialog.story.tsx:84`) and
`CollapsiblePanel.buttons` has one story caller (`CollapsiblePanelStack.story.tsx:51`), with no
production callers for either. Both are coherent documented layout affordances and remain React
subtrees under D4. Epic C should handle these low-pressure cases last or explicitly remove them as
a product/API decision.

### `DialogContent` title narrowing is safe on current callers

The 14 production dialog callers contain no JSX title. Dialog state and public dialog options were
also inspected and are typed as strings. If typecheck finds a newly discovered rich title, retain
the React arm only at that named caller and document it; do not introduce a generic rich-title
protocol in this task.

### Floating portal ownership is out of scope

`Popover` still portals to `document.body`, but this task must not alter that behavior. US-973 owns
the shared overlay host for body portals; changing it here would mix slot migration with portal
infrastructure and risk regressions in menus, autocomplete, and grid popovers.

There are no unresolved design questions blocking implementation. The boundaries above are the
approved D2-D5 decisions and the measured caller inventory.

## Acceptance criteria

- [x] `DialogContent.title` is `string`; all 14 production title callers compile and render the
      same text.
- [x] `DialogContent.icon` is `IconRef`, the component-owned close icon resolves as `"close"`,
      registry-compatible dialog icons use names, and the excluded `TorIcon` caller remains valid.
- [x] `DialogContent.headerButtons` and `children` remain arbitrary React subtrees with unchanged
      header detection, sizing, close behavior, and dialog-body composition.
- [x] `CollapsiblePanel.title` is `string` and `icon` is `IconName`; its owned state icons resolve as
      `"chevron-down"` / `"chevron-right"` without changing header state or event behavior.
- [x] The chevron and optional panel icon remain direct `<svg>` children of the header, so the
      existing `& > svg` 14x14 sizing applies in both states.
- [x] `CollapsiblePanel.buttons`, `children`, and `headerRef` remain unchanged subtree/portal
      boundaries; the interactive story button still works. The two story-only subtree affordances
      are explicitly kept for Epic C rather than silently deleted.
- [x] `PopoverModel`/`Popover` children, `WithMenu`'s React render prop, and all focus/anchor/menu
      behavior remain unchanged; no generic slot callback is introduced.
- [x] `RenderGrid`/`AVGrid` extra elements remain React subtrees at their existing insertion points;
      GitTree load-more and AVGrid add-row/add-column controls still render and respond.
- [x] The US-967 carry-over is resolved according to measured callers: Tree `SectionItem.label` is
      `string`, while `ListItem.label`, `ITreeItem.label`, and `TreeItem.label` retain their React
      arm with the four concrete rich callers documented in US-967.
- [x] The four additional built-in Button/IconButton call sites use registry names: the two
      `folder-open` browse buttons, the `open-file` button, and the `close` button.
- [x] No `SlotContent`, `renderSlot`, generic subtree descriptor, or language-icon registry entry
      is introduced.
- [ ] `npm run typecheck`, `npm run lint`, and `git diff --check` pass; the documented visual and
      interaction smoke checks show no regression.
- [x] No unit-test harness or tests are added.

## Files to create or modify

- `src/renderer/uikit/Dialog/DialogContent.tsx`
- `src/renderer/uikit/Dialog/Dialog.story.tsx` (headerButtons story verification)
- `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.tsx`
- `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.story.tsx` (buttons/title story verification)
- `src/renderer/ui/dialogs/CommitDialog.tsx`
- `src/renderer/ui/dialogs/ConfirmationDialog.tsx`
- `src/renderer/ui/dialogs/CreateBoardDialog.tsx`
- `src/renderer/ui/dialogs/CreateBoardVarsStorageDialog.tsx`
- `src/renderer/ui/dialogs/InputDialog.tsx`
- `src/renderer/ui/dialogs/LibrarySetupDialog.tsx`
- `src/renderer/ui/dialogs/NamespaceCollisionDialog.tsx`
- `src/renderer/ui/dialogs/OpenUrlDialog.tsx`
- `src/renderer/ui/dialogs/PasswordDialog.tsx`
- `src/renderer/ui/dialogs/RegisterToolsetDialog.tsx`
- `src/renderer/ui/dialogs/TextDialog.tsx`
- `src/renderer/ui/dialogs/TorInfoDialog.tsx` (verification only; retain the excluded language icon)
- `src/renderer/ui/dialogs/TrustBoardDialog.tsx`
- `src/renderer/editors/link-editor/EditLinkDialog.tsx`
- `src/renderer/uikit/ListBox/ListItem.tsx` (US-967 row-label carry-over)
- `src/renderer/uikit/Tree/types.ts` (US-967 row-label carry-over)
- `src/renderer/uikit/Tree/TreeItem.tsx` (US-967 row-label carry-over)
- `src/renderer/uikit/Tree/SectionItem.tsx` (US-967 row-label carry-over)
- `src/renderer/uikit/Popover/PopoverModel.ts` (boundary verification only)
- `src/renderer/uikit/Popover/Popover.tsx` (boundary verification only)
- `src/renderer/uikit/Menu/WithMenu.tsx` (callback boundary verification only)
- `src/renderer/uikit/RenderGrid/RenderGridModel.ts` (extra-element deferral verification)
- `src/renderer/uikit/RenderGrid/RenderGrid.tsx` (insertion-point verification)
- `src/renderer/uikit/AVGrid/model/AVGridModel.ts` (extra-element deferral verification)
- `src/renderer/uikit/AVGrid/AVGrid.tsx` (precedence/forwarding verification)
- `src/renderer/components/git-tree/GitTree.tsx` (load-more smoke verification)
- `doc/active-work.md`
- `doc/epics/EPIC-051.md`

## Related

- [EPIC-051: De-React Epic P - Preparation (React-side)](../../epics/EPIC-051.md)
- [US-965: Icon name registry + neutral slot types (foundation)](../US-965-icon-registry-slots/README.md)
- [US-966: Neutral slots - UIKit primitives and inputs](../US-966-neutral-slots-primitives/README.md)
- [US-967: Neutral slots - UIKit list and data components](../US-967-neutral-slots-list-data/README.md)
- [De-React roadmap](../../de-react.md)
- [UIKit authoring guide](../../../src/renderer/uikit/CLAUDE.md)
- [Component creation guide](../../standards/component-guide.md)

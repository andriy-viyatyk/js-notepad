# US-966: Neutral slots — UIKit primitives and inputs

## Status

**Status:** Implemented - pending EPIC-051 review
**Priority:** High
**Epic:** [EPIC-051: De-React Epic P — Preparation (React-side)](../../epics/EPIC-051.md)
**Depends on:** [US-965: Icon name registry + neutral slot types (foundation)](../US-965-icon-registry-slots/README.md)
**Created:** 2026-08-16

## Goal

Adopt the neutral icon and text-slot vocabulary from US-965 across the leaf UIKit primitives and
inputs covered by EPIC-051. Keep all existing React callers compiling while replacing internal
React-only icon data with registry names where the component owns that data.

This task does not invent a generic subtree-slot protocol. `Input`'s `startSlot`/`endSlot` and
component `children` remain React composition until the mount-adapter work in Epic C.

## Background

US-965 provides:

- `IconRef = IconName | ReactNode` and `SlotText = string | ReactNode` in
  `src/renderer/uikit/shared/slots.ts`.
- `renderIcon(icon, props?)`, which resolves string names through
  `src/renderer/theme/icon-registry.ts` and passes legacy React nodes through unchanged.
- An already-adapted `IconButton`; its public icon/title contract is the reference shape for the
  other primitives in this task.

EPIC-051 D3 keeps the React arm of icon slots during the preparation epic, so existing call sites
such as `icon={<SaveIcon />}` do not need a repository-wide rewrite. D4 is equally important here:
text-bearing props use plain strings when the inventory shows no rich callers; `SlotText` remains
available for props that genuinely carry rich content in later tasks. `children` and arbitrary
subtree slots remain ReactNode until the mount adapters define how React and vanilla subtrees cross
the boundary.

The current target inventory is:

| Component | Current React-bearing surface | US-966 treatment |
|---|---|---|
| `Button` | `title`, `icon`, plus `children` | `title → string`, `icon → IconRef`; keep `children` |
| `IconButton` | Already adapted by US-965 | Narrow `title` from `SlotText` to `string`; preserve the icon contract |
| `Input` | `startSlot`, `endSlot` | Leave both as ReactNode; defer to Epic C |
| `RadioGroup` | `IRadio.label`, `IRadio.icon`; built-in radio icons | `label → string`, `icon → IconRef`; registry-backed built-ins |
| `Notification` | `SEVERITY_ICON` stores React nodes | Store `IconName` values and resolve at render time |
| `SplitButton` | `icon`, `title`, `menuTitle`, plus optional `children` | `icon → IconRef`, text props → `string`; keep `children` |
| `Tag` | `label`, `icon` | `label → string`, `icon → IconRef`; add semantic `tone` |
| `Checkbox` | Built-in checked/unchecked React icons; label is `children` | Use registry names internally; keep `children` |

Measured renderer usage, including UIKit stories, is approximately 152 `Button`, 178 `IconButton`,
62 `Input`, 4 `RadioGroup`, 2 `Notification`, 3 `SplitButton`, 28 `Tag`, and 12 `Checkbox` JSX
occurrences. The unions from US-965 preserve these callers; the migration target is the primitive
contracts and their owned icon values, not every existing JSX expression.

Relevant current call-site findings:

- `Tag` has one rich label in `src/renderer/editors/mcp-inspector/ToolsPanel.tsx`. It is styling
  smuggled through content rather than a genuine rich label; the call site should use
  `label="destructive" tone="error"`, allowing `Tag.label` to become a plain string.
- `RadioGroup` is consumed by `InputDialog`, `CsvOptions`, and `RadioboxesDialogView`; their
  current item data is already string-labelled. The story is the only current icon-bearing item
  example.
- `Input` has subtree slots in `Autocomplete`, `Select`, `MultiSelect`, tree-provider views,
  editor bars, and dialogs. These are exactly the composition cases D4 defers.
- `SplitButton` delegates its primary region to `Button` or `IconButton` and its caret to
  `IconButton`; its internal `ChevronDownIcon` can use the stable `"chevron-down"` name without
  changing the public child/subtree boundary.
- Narrowing `Tag.label` also exposes two existing composition cases: the AVGrid filter chip keeps
  its interactive formatted label as standard `children` while passing an empty string label, and
  `PromptsPanel` uses a plain role label with a semantic tone. `SegmentedControl` narrows its
  forwarded segment tooltip to `string` alongside `Button`.

### US-967 handoff measurement

The next task's text-slot inventory has also been measured by counting JSX call sites that pass
elements rather than strings:

| Prop | Rich callers | Total callers | Planned type |
|---|---:|---:|---|
| `rootLabel` | 0 | 18 | `string` |
| `separatorContent` | 0 | 2 | `string` |
| `selectAllLabel` | 0 | 1 | `string` |
| `emptyMessage` | 3 | 15 | `SlotText` |
| `tooltip` | 2 | 7 | `SlotText` |

This is a handoff for US-967, not additional implementation scope for US-966.

## Implementation plan

### 1. Normalize `Button`

- In `src/renderer/uikit/Button/Button.tsx`, change `icon?: React.ReactNode` to `icon?: IconRef`
  and `title?: React.ReactNode` to `title?: string`.
- Render the icon through `renderIcon(icon)` so a named icon and a legacy React node have the
  same output path. Preserve the existing icon-before-children order.
- Pass `title` directly to the existing React `Tooltip`; do not add a text renderer or callback.
- Leave `children`, button attributes, ref forwarding, variants, sizing, `data-*` state, and
  disabled behavior unchanged.

### 2. Narrow `IconButton` text and retain its reference icon consumer

- In `src/renderer/uikit/IconButton/IconButton.tsx`, change `title?: SlotText` from US-965 to
  `title?: string`; the renderer still passes it directly to the React `Tooltip`.
- Confirm the component continues to use `IconRef` and `renderIcon` from US-965.
- Do not duplicate the registry or change the already-established warning/unknown-name behavior.
- Keep this component in the task's smoke checks because all other icon-bearing primitives either
  delegate to it or should follow its contract.

### 3. Preserve `Input`'s subtree boundary

- In `src/renderer/uikit/Input/Input.tsx`, make no neutral-slot substitution for `startSlot` or
  `endSlot`; they remain `React.ReactNode` under D4.
- Do not add `SlotContent`, `renderSlot`, callback slots, descriptor objects, or a second adapter
  layer. Keep the current wrapper/field DOM, sizing, invalid/readonly/disabled styling, and direct
  slot rendering unchanged.
- Check `DateInput`, `Autocomplete`, `Select`, and `MultiSelect` type usage after the other
  component changes; their existing slot pass-throughs must continue to compile.

### 4. Normalize `RadioGroup`

- In `src/renderer/uikit/RadioGroup/RadioGroup.tsx`, change `IRadio.label` to `string` and
  `IRadio.icon` to `IconRef`.
- Replace direct `RadioCheckedIcon`/`RadioUncheckedIcon` rendering with the registry names
  `"radio-checked"` and `"radio-unchecked"` through `renderIcon`, passing
  `{ className: "radio-icon" }` so the state icon keeps every existing hover, checked, and
  focus-visible, and disabled selector.
- Render `radio.icon` through `renderIcon` while preserving the existing `.item-icon` layout
  hooks, keyboard behavior, roving tabindex, trait resolution, disabled state, and ARIA output.
- Keep `IRadio` as the public item shape; do not introduce icon descriptors or accessor props.

### 5. Make `Notification`'s severity icons neutral

- In `src/renderer/uikit/Notification/Notification.tsx`, change `SEVERITY_ICON` from
  `Record<NotificationSeverity, React.ReactNode>` to `Record<NotificationSeverity, IconName>`.
- Map `info`, `success`, `warning`, and `error` to the matching registry names and render the
  selected value with `renderIcon`.
- Use the named `"close"` icon for the internal close `IconButton`.
- Preserve the severity-specific role/live-region behavior, message text, close-event propagation
  guard, animation, styling selectors, and public props.

### 6. Normalize `SplitButton`

- In `src/renderer/uikit/SplitButton/SplitButton.tsx`, use `IconRef` for `icon` and `string` for
  `title` and `menuTitle`.
- Keep the primary label as `children` and leave the `WithMenu` render callback unchanged; both
  are subtree/React composition boundaries covered by D4/D5.
- Pass the primary icon and text values through `Button`/`IconButton` as today, and replace the
  internal caret element with the stable `"chevron-down"` name.
- Preserve the separator/caret DOM hooks, menu behavior, sizing, disabled behavior, and tooltip
  defaults.

### 7. Normalize `Tag` and `Checkbox`

- In `src/renderer/uikit/Tag/Tag.tsx`, change `label` to `string` and `icon` to `IconRef`,
  rendering the icon with `renderIcon`.
- Add `tone?: "default" | "error" | "warning" | "success"`, emit `data-tone`, and style the
  semantic tones from `color.ts`. Keep `[data-selected]` as the higher-priority selected-state
  treatment so the existing selection semantics do not change.
- Preserve the standard `children` composition path for the AVGrid filter chip; `label` remains a
  plain string even when a caller needs a richer subtree alongside it.
- In `src/renderer/editors/mcp-inspector/ToolsPanel.tsx`, replace the rich `destructive` label
  with `label="destructive" tone="error"`.
- Preserve the tag's remove-button event isolation, click/selected/disabled states, truncation,
  native `title` attribute, and data attributes.
- In `src/renderer/uikit/Checkbox/Checkbox.tsx`, replace direct checked/unchecked icon imports
  with `renderIcon("checked")` / `renderIcon("unchecked")`. Keep the label as `children`; it is
  not a text prop to convert in this task.
- Preserve controlled `checked`, click prevention, disabled behavior, accessible label/content,
  and the existing icon data-part/layout hooks.

### 8. Verify the public surface and behavior

- Keep the existing exports in `src/renderer/uikit/index.ts`; `IconRef`, `SlotText`, and
  `renderIcon` are already exposed by US-965. `SlotText` has no consumer in this task but remains
  exported for US-967's rich `emptyMessage` and `tooltip` props. No new descriptor or callback type
  is exported.
- Run `npm run typecheck` and `npm run lint`.
- Run a smoke check covering named and legacy icons in `Button`, `IconButton`, `RadioGroup`,
  `SplitButton`, and `Tag`; severity rendering in `Notification`; built-in states in `Checkbox`;
  and subtree compatibility in `Input`.
- Compare the rendered DOM/data attributes for the affected primitives and confirm no tooltip,
  keyboard, focus, event-propagation, sizing, or disabled-state regression.
- Do not add unit tests; this project has no unit-test harness and the existing smoke verification
  is the intended check.

## Concerns / Open questions

### D4 leaves `Input` partially unchanged (resolved boundary)

The task inventory names `Input.startSlot`/`endSlot`, but those values are arbitrary subtrees, not
text or icons. The approved D4 decision explicitly defers them, along with `children`, `trailing`,
`headerButtons`, and related props, to Epic C's mount-adapter contract. US-966 should document and
verify this boundary rather than introduce a React-returning callback that vanilla views cannot
satisfy.

### Plain strings versus `SlotText` (resolved)

`SlotText = string | ReactNode` is intentionally not used for the measured US-966 text props:
because `string` is already assignable to `ReactNode`, the alias would remove no React type and
would reject no caller. `Button.title`, `IconButton.title`, `SplitButton.title`,
`SplitButton.menuTitle`, `Tag.label`, and `IRadio.label` therefore become plain `string`. The
export remains for US-967 props with verified rich callers.

### Registry names versus direct icon imports (resolved)

Only icon values owned by these primitives should be converted now (`Notification` severity,
`Checkbox` state, `RadioGroup` state, `SplitButton` caret, and Notification close). Existing
application/editor icon call sites retain React nodes through `IconRef`; a broad call-site rewrite
would exceed US-966 and would conflict with the staged migration described by D3.

### `RadioGroup` trait data remains compatible (accepted)

Trait-backed item arrays still resolve to `IRadio`. Their `label` and `icon` fields use the same
normalized `string`/`IconRef` shape as ordinary item arrays, so no new trait key or accessor
convention is needed.

## Acceptance criteria

- [ ] `Button.title` is `string`, `icon` uses `IconRef` and `renderIcon`, and children/DOM behavior
      are unchanged.
- [ ] `IconButton.title` is narrowed to `string`; its `IconRef`/`renderIcon` contract and named/
      legacy icon smoke checks remain intact.
- [ ] `Input.startSlot` and `Input.endSlot` remain React subtree slots with no callback or
      descriptor abstraction added; dependent wrappers still type-check.
- [ ] `RadioGroup` uses `string`/`IconRef`, registry-backed built-in radio icons, and preserves
      trait resolution, keyboard navigation, roving tabindex, and ARIA output.
- [ ] RadioGroup's state icon still carries `className="radio-icon"`; hover, focus-visible,
      checked, and `[data-disabled]:hover` icon styling selectors still apply and are verified
      visually.
- [ ] `Notification` uses an `IconName` severity map and registry-backed close/severity icons
      with unchanged severity semantics and event behavior.
- [ ] `SplitButton` uses `IconRef`/`string`, keeps children and `WithMenu` callbacks unchanged,
      and uses the named caret icon.
- [ ] `Tag.label` is `string`, `icon` uses `IconRef`, and `tone` supports default/error/warning/
      success colors; `ToolsPanel.tsx` uses `label="destructive" tone="error"`.
- [ ] `Checkbox` uses registry-backed checked-state icons while retaining children as its label
      content.
- [ ] Icon props use `IconRef` and `renderIcon`; no direct internal icon conversion drops required
      SVG props or class hooks.
- [ ] `Button.title`, `IconButton.title`, `SplitButton.title`, `SplitButton.menuTitle`,
      `Tag.label`, and `IRadio.label` are typed `string`; no ReactNode arm remains on them.
- [ ] No `SlotContent`, `renderSlot`, generic slot callback, or serializable icon descriptor is
      introduced.
- [ ] `npm run typecheck` and `npm run lint` pass; the smoke checks show no DOM, accessibility,
      styling, focus, event, or tooltip regressions.

## Files to create or modify

- `src/renderer/uikit/Button/Button.tsx`
- `src/renderer/uikit/RadioGroup/RadioGroup.tsx`
- `src/renderer/uikit/Notification/Notification.tsx`
- `src/renderer/uikit/SplitButton/SplitButton.tsx`
- `src/renderer/uikit/Tag/Tag.tsx`
- `src/renderer/uikit/Checkbox/Checkbox.tsx`
- `src/renderer/uikit/Input/Input.tsx` — investigation/type-compatibility check only; no subtree
  protocol change
- `src/renderer/uikit/IconButton/IconButton.tsx` — narrow `title` to `string`; icon contract was
  adapted by US-965
- `src/renderer/editors/mcp-inspector/ToolsPanel.tsx` — replace the rich Tag label with `tone`
- `src/renderer/editors/mcp-inspector/PromptsPanel.tsx` â€” narrow the role Tag to a string label
- `src/renderer/uikit/AVGrid/filters/FilterBar.tsx` â€” preserve the interactive filter-chip
  subtree through standard children
- `src/renderer/uikit/SegmentedControl/SegmentedControl.tsx` â€” narrow forwarded segment titles
- `doc/active-work.md`
- `doc/epics/EPIC-051.md`

## Progress

### Investigation

- [x] Read EPIC-051 D2–D5 and the UIKit authoring rules.
- [x] Inspect all eight target primitives and their public props.
- [x] Measure renderer JSX usage and identify subtree/rich-content boundaries.
- [x] Confirm the registry contains the built-in icon names required by this task.

### Implementation

- [x] Normalize Button, RadioGroup, Notification, SplitButton, Tag, and Checkbox.
- [x] Verify IconButton and preserve Input's deferred subtree slots.
- [x] Run `npm run typecheck` and `npm run lint`.
- [ ] Perform the manual named/legacy icon and visual state smoke checks in the acceptance criteria.

## Related

- [EPIC-051: De-React Epic P — Preparation (React-side)](../../epics/EPIC-051.md)
- [US-965: Icon name registry + neutral slot types (foundation)](../US-965-icon-registry-slots/README.md)
- [De-React roadmap](../../de-react.md)
- [UIKit authoring guide](../../../src/renderer/uikit/CLAUDE.md)
- [Component creation guide](../../standards/component-guide.md)

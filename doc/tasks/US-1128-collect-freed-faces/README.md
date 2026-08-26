# US-1128: Collect freed UIKit faces

**Status:** Implemented
**Priority:** High
**Epic:** [EPIC-069 — De-React E11: the Storybook contract](../../epics/EPIC-069.md)
**Created:** 2026-08-26

## Goal

Collect the UIKit React component adapters freed by the completed Storybook contract conversion,
while preserving the props-type modules that remain live. Correct the removal ledger with the
measured split between removable files, dead React components with live types, and still-live faces.

## Background

EPIC-069 §E11-7 task 10 originally expected at least 15 whole UIKit face files to reach zero
callers. The post-E11 measurement changes that conclusion: each face commonly exports both a React
component and the props types consumed by native views and application code. Among the 49
non-story, non-`*View` `.tsx` files in `src/renderer/uikit/`:

- 3 are genuinely free at the module path level: `MultiSelect`, `PathInput`, and the
  `AlertsBar` face candidate, subject to rechecking `AlertsBar`'s other exports.
- 17 have an unreferenced React component but live props types: `Menu` (28 type importers),
  `Dialog` (16), `ImageViewport` (6), `CategoryList` (5), `MultiListBox` (4), `RadioGroup` (4),
  `Label` (3), `Minimap` (3), `Toolbar` (3), `AlertItem` (2), `DialogContent` (2), `Notification`
  (2), `SplitButton` (2), `ListBox/SectionItem` (2), `Tree/SectionItem` (2),
  `CollapsiblePanelStack` (1), and `ProgressOverlay` (1).
- 29 still have live JSX or value callers and are outside this task.

The module-path verification must inspect both `Folder/Face` and `Folder` imports. A folder import
resolves through `index.ts` and may use a different export from the same module, as `AlertsBar` does.
The current application import is `src/renderer/index.tsx:3`, which imports `AlertsBarView` from
`src/renderer/uikit/Notification/AlertsBar`; therefore `AlertsBar.tsx` is a mixed live module and
must remain intact. Its React `AlertsBar` adapter is not separately collected in this task.

The surviving `Panel.tsx` and `Text.tsx` React implementations and stories are explicitly outside
scope under EPIC-069 §E11-4 and C1. No vanilla twins are written.

## Implementation Plan

### 1. Create the task record before implementation

Track the corrected measurement, the module-path verification rule, the `AlertsBarView` exception,
and the exact rename/deletion set in this document. Do not edit `doc/active-work.md` or
`doc/epics/EPIC-069.md`, as the epic owner maintains both.

### 2. Verify and delete standalone free faces

Individually grep all renderer imports and exports for both the face file path and its folder path.
Delete the face files and remove only their component/type re-exports where the module has no other
caller:

- `src/renderer/uikit/MultiSelect/MultiSelect.tsx`
- `src/renderer/uikit/PathInput/PathInput.tsx`

Keep the public `MultiSelectProps` and `PathInputProps` types by re-exporting them directly from
`MultiSelectModel.ts` and `PathInputModel.ts`, respectively. Remove the corresponding component
exports from each folder barrel and from `src/renderer/uikit/index.ts`.

For `src/renderer/uikit/Notification/AlertsBar.tsx`, retain the file and all exports because the
application imports its live `AlertsBarView`; retain its barrel exports as needed. Record this
finding rather than treating the face as a whole-file deletion.

Before:

```ts
export { MultiSelect } from "./MultiSelect";
export type { MultiSelectProps } from "./MultiSelect";
```

After:

```ts
export type { MultiSelectProps } from "./MultiSelectModel";
```

### 3. Remove adapters from the 17 type-only modules and rename them

For each module below, remove the exported React component function and its `mountVanilla` call,
retain every public props interface and other type/value export, convert imports to type-only where
appropriate, and rename the file from `.tsx` to `.ts`:

| Old file | New file | What remains |
|---|---|---|
| `src/renderer/uikit/Menu/Menu.tsx` | `Menu.ts` | `MenuProps` type re-export |
| `src/renderer/uikit/Dialog/Dialog.tsx` | `Dialog.ts` | `DialogPosition`, `DialogProps` |
| `src/renderer/uikit/ImageViewport/ImageViewport.tsx` | `ImageViewport.ts` | viewport constants, state, `ImageViewportModel`, `ImageViewportProps` |
| `src/renderer/uikit/CategoryList/CategoryList.tsx` | `CategoryList.ts` | `CategoryListProps` |
| `src/renderer/uikit/MultiListBox/MultiListBox.tsx` | `MultiListBox.ts` | `MultiListBoxProps` |
| `src/renderer/uikit/RadioGroup/RadioGroup.tsx` | `RadioGroup.ts` | `IRadio`, `RADIO_KEY`, `RadioGroupProps` |
| `src/renderer/uikit/Label/Label.tsx` | `Label.ts` | `LabelProps` |
| `src/renderer/uikit/Minimap/Minimap.tsx` | `Minimap.ts` | `MinimapProps` |
| `src/renderer/uikit/Toolbar/Toolbar.tsx` | `Toolbar.ts` | `ToolbarProps` |
| `src/renderer/uikit/Notification/AlertItem.tsx` | `AlertItem.ts` | `AlertData` |
| `src/renderer/uikit/Dialog/DialogContent.tsx` | `DialogContent.ts` | `DialogContentProps` |
| `src/renderer/uikit/Notification/Notification.tsx` | `Notification.ts` | `NotificationSeverity`, `NotificationProps` |
| `src/renderer/uikit/SplitButton/SplitButton.tsx` | `SplitButton.ts` | `SplitButtonProps` |
| `src/renderer/uikit/ListBox/SectionItem.tsx` | `SectionItem.ts` | `SectionItemProps` |
| `src/renderer/uikit/Tree/SectionItem.tsx` | `SectionItem.ts` | `SectionItemProps` |
| `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.tsx` | `CollapsiblePanelStack.ts` | `CollapsiblePanelProps`, `CollapsiblePanelStackProps` |
| `src/renderer/uikit/Progress/ProgressOverlay.tsx` | `ProgressOverlay.ts` | `ProgressOverlayProps` |

The two `SectionItem.ts` files remain distinct because they are in different folders and carry
different public props. `CollapsiblePanelStack.ts` retains the props used by
`CollapsiblePanelStackView`; both dead React functions (`CollapsiblePanel` and
`CollapsiblePanelStack`) are removed. `RadioGroup.ts` retains `RADIO_KEY`, which is a live runtime
trait key rather than a React face.

Update each folder barrel and `src/renderer/uikit/index.ts` so type exports resolve from the renamed
modules and no deleted component value is exported. Touch static importers of renamed modules where
the import statement can be changed without changing the public type; there are no dynamic imports
of these face modules. Do not alter surviving prop declarations.

Before:

```tsx
import React from "react";
import { mountVanilla } from "../shared/mount";
import { MenuView } from "./MenuView";

export function Menu(props: MenuProps): React.ReactElement {
    return mountVanilla(MenuView, props);
}
```

After:

```ts
import type React from "react";

export type { MenuProps } from "./MenuModel";
```

### 4. Correct the append-only removal ledger

Edit only the `React faces on converted UIKit components` row in `doc/de-react.md`. Preserve its
history, but state the accurate condition: after both application JSX callers and the
`Story.component` contract are gone, the React component is dead while the face file usually still
hosts live props types. Record the three-way split (3 free, 17 dead-component/live-types, 29
still-live) and the 17 type-importer counts so Epic F inherits the measurement and treats collection
as type relocation rather than blind deletion. Keep the existing Panel/Text survivor row and all
other ledger entries intact.

### 5. Verify source reach and gates

- Re-run module-path searches individually after edits: no JSX `<Name` use or value import of each
  removed adapter; type imports resolve from the renamed `.ts` file; `Panel` and `Text` are
  unchanged.
- Confirm no stale face-file imports remain and no dynamic importer needs a dev-server restart for
  this set. If a dynamic import is found, restart the Vite server as required by §E11-10.
- Run `npm run typecheck`, `npm run lint`, and `npm run build-prod`.
- Do not add tests or harnesses, commit, edit `doc/active-work.md`, or edit `doc/epics/EPIC-069.md`.

## Concerns

1. **`AlertsBar` is not a whole-file free face. Resolved.** The recorded application import is
   still live, but it imports `AlertsBarView` from the face module. Since the module also owns
   `alertsBarModel` and the native view, the file stays and the finding is reported. The React
   adapter itself is not removed independently because the task defines this as a file-level free
   face deletion and says to keep a candidate with a caller.
2. **Props must not be narrowed. Resolved.** Interfaces and existing runtime exports such as
   `RADIO_KEY` remain unchanged; only dead React adapter functions and their imports disappear.
3. **Rename resolution. Resolved.** These are static, extensionless imports. The source audit will
   verify every importer after the rename; no dynamic `import()` reaches any renamed face module.
4. **Panel/Text. Resolved.** Their React implementations and stories remain untouched by C1 and
   §E11-4.
5. **No deferred completion skills. Resolved.** This is an epic task, so the project workflow
   defers `/review`, `/document`, and `/userdoc` to epic completion.

## Verification Results

- `MultiSelect.tsx` and `PathInput.tsx` were individually checked by file and folder module path;
  neither has a JSX or value caller. Both were deleted, and their props types now re-export from
  their model modules.
- `AlertsBar.tsx` was not deleted: `src/renderer/index.tsx:3` imports `AlertsBarView` from the
  module, which also owns `alertsBarModel`. This is the expected-free candidate that was retained
  and reported.
- All 17 listed adapter modules were individually checked for JSX/value callers, renamed to `.ts`,
  and retain their public types/live value exports. No explicit `.tsx` import specifiers or dynamic
  imports reach these modules; extensionless static imports resolve the renamed files.
- `Panel.tsx`, `Text.tsx`, and both stories were not changed by this task. No tests, harnesses,
  casts, dashboard edits, or epic edits were added.
- `doc/de-react.md` appends the corrected ledger entry with the two-blocker condition and the
  3/17/29 split plus all 17 type-importer counts.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run build-prod` — passed. It emitted the repository's existing chunk-size and ineffective
  dynamic-import warnings; production build completed successfully.

## Acceptance Criteria

- [x] `MultiSelect.tsx` and `PathInput.tsx` are deleted only after individual file/folder path
      caller checks; their props types still resolve from model modules.
- [x] `AlertsBar.tsx` remains with its live `AlertsBarView` and alert model, and the finding is
      recorded in the final task response.
- [x] Each of the 17 listed `.tsx` files is renamed to `.ts`; its React adapter function and
      `mountVanilla` call are gone; its public types and other live exports remain unchanged.
- [x] All folder and top-level UIKit barrels export surviving types and live values only; no
      deleted adapter value is exported.
- [x] No `Panel.tsx` or `Text.tsx` file/story is changed, no casts are added, and no tests or
      harnesses are written.
- [x] `doc/de-react.md` records the corrected two-blocker condition and the measured 3/17/29
      split with all type-importer counts, without rewriting unrelated ledger history.
- [x] `npm run typecheck`, `npm run lint`, and `npm run build-prod` pass.

## Files Changed Summary

| File | Change |
|---|---|
| `doc/tasks/US-1128-collect-freed-faces/README.md` | Task scope, measured split, verification plan, and final results. |
| `src/renderer/uikit/MultiSelect/MultiSelect.tsx` | Delete the unreferenced React face. |
| `src/renderer/uikit/PathInput/PathInput.tsx` | Delete the unreferenced React face. |
| `src/renderer/uikit/Menu/Menu.tsx` → `Menu.ts` | Retain `MenuProps`; remove the React adapter. |
| `src/renderer/uikit/Dialog/Dialog.tsx` → `Dialog.ts` | Retain `DialogPosition` and `DialogProps`; remove the React adapter. |
| `src/renderer/uikit/ImageViewport/ImageViewport.tsx` → `ImageViewport.ts` | Retain viewport model/state and props; remove the React adapter. |
| `src/renderer/uikit/CategoryList/CategoryList.tsx` → `CategoryList.ts` | Retain `CategoryListProps`. |
| `src/renderer/uikit/MultiListBox/MultiListBox.tsx` → `MultiListBox.ts` | Retain `MultiListBoxProps`. |
| `src/renderer/uikit/RadioGroup/RadioGroup.tsx` → `RadioGroup.ts` | Retain `IRadio`, `RADIO_KEY`, and `RadioGroupProps`. |
| `src/renderer/uikit/Label/Label.tsx` → `Label.ts` | Retain `LabelProps`. |
| `src/renderer/uikit/Minimap/Minimap.tsx` → `Minimap.ts` | Retain `MinimapProps`. |
| `src/renderer/uikit/Toolbar/Toolbar.tsx` → `Toolbar.ts` | Retain `ToolbarProps`. |
| `src/renderer/uikit/Notification/AlertItem.tsx` → `AlertItem.ts` | Retain `AlertData`. |
| `src/renderer/uikit/Dialog/DialogContent.tsx` → `DialogContent.ts` | Retain `DialogContentProps`. |
| `src/renderer/uikit/Notification/Notification.tsx` → `Notification.ts` | Retain severity and notification props types. |
| `src/renderer/uikit/SplitButton/SplitButton.tsx` → `SplitButton.ts` | Retain `SplitButtonProps`. |
| `src/renderer/uikit/ListBox/SectionItem.tsx` → `SectionItem.ts` | Retain `SectionItemProps`. |
| `src/renderer/uikit/Tree/SectionItem.tsx` → `SectionItem.ts` | Retain `SectionItemProps`. |
| `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.tsx` → `CollapsiblePanelStack.ts` | Retain both panel props interfaces. |
| `src/renderer/uikit/Progress/ProgressOverlay.tsx` → `ProgressOverlay.ts` | Retain `ProgressOverlayProps`. |
| `src/renderer/uikit/index.ts` and affected folder `index.ts` files | Remove dead component exports and preserve type/value exports. |
| `doc/de-react.md` | Correct the append-only React-face removal-ledger row with the measured split. |

Files intentionally not changed: `src/renderer/uikit/Notification/AlertsBar.tsx`,
`src/renderer/uikit/Panel/Panel.tsx`, `src/renderer/uikit/Text/Text.tsx`, all `*View` files,
`doc/active-work.md`, `doc/epics/EPIC-069.md`, tests, verification harnesses, and unrelated
still-live UIKit faces.

# US-1159 — Move native views out of `.tsx`

## Goal

Rename the 15 native `VanillaView` implementation files under `src/renderer/uikit/` from `.tsx` to
`.ts`. The task is behaviour-neutral: no implementation code changes are permitted.

## Background

EPIC-072 §E14-4 identifies these files as extension debt: they contain no JSX, but their `.tsx`
extension inflates React-oriented file counts. Eight have no React reference. The other seven use
React only for `React.Ref<...>` type annotations; a `.ts` module can retain those type positions.

Per concern C9, this task is limited to `git mv` and import-specifier fixes demanded by the compiler.
The audit found no explicit `.tsx` import specifiers, literal dynamic imports, `import.meta.glob`
entries, or Vite/tsconfig path mappings for these files. All normal imports—including story imports—
are extensionless and therefore require no edits.

## Implementation Plan

- [x] Verify each candidate contains no JSX and no runtime React use.
- [x] Confirm the eight zero-React files and the seven `React.Ref`-type-only files.
- [x] Check non-story importers, `*.story.ts` harnesses, dynamic imports, glob entries, and config
      mappings for extension-sensitive references.
- [x] Rename each verified file with `git mv`; leave all importers unchanged.
- [x] Run `npm run typecheck`, `npm run lint`, and `npm run build-prod`.

Before → after for every source file:

```text
src/renderer/uikit/<Component>/<Component>View.tsx
→ src/renderer/uikit/<Component>/<Component>View.ts
```

The import shape remains unchanged:

```ts
import { <Component>View } from "./<Component>View";
```

## Concerns

### Verification results

All 15 candidates passed the scope gate; none were excluded.

| Group | Files | Result |
|---|---|---|
| No React references | `CheckboxView`, `CollapsiblePanelStackView`, `DotView`, `LabelView`, `SegmentedControlView`, `SliderView`, `SpinnerView`, `TagView` | No JSX, `React` identifier, `createElement` React call, or JSX runtime use. |
| Type-only React references | `ButtonView`, `DialogContentView`, `IconButtonView`, `InputView`, `AlertItemView`, `PathInputView`, `SelectableRowView` | No JSX or runtime React use; every React reference is the default import used only by `React.Ref<...>` declarations. |

The story harness is unaffected: the 14 stories that reference these views use extensionless imports;
`AlertItemView` has no UIKit story reference. The public React face files remain unchanged, as do all
other extensionless importer files, the story files, `vite.config.*`, `tsconfig*.json`, and build
scripts. No import became a barrel import.

The specific unchanged story files are `Checkbox/Checkbox.story.ts`,
`CollapsiblePanelStack/CollapsiblePanelStack.story.ts`, `Dot/Dot.story.ts`, `Label/Label.story.ts`,
`SegmentedControl/SegmentedControl.story.ts`, `Slider/Slider.story.ts`, `Spinner/Spinner.story.ts`,
`Tag/Tag.story.ts`, `Button/Button.story.ts`, `Dialog/Dialog.story.ts`,
`IconButton/IconButton.story.ts`, `Input/Input.story.ts`, `PathInput/PathInput.story.ts`, and
`SelectableRow/SelectableRow.story.ts` (all under `src/renderer/uikit/`).

Validation completed: `npm run typecheck` passed; `npm run lint` passed; and `npm run build-prod`
completed successfully. The production build emitted existing bundler warnings for empty
`import.meta`, ineffective dynamic imports, and large chunks, but no errors.

If a compiler check reports that any rename needs a code change beyond an import specifier, that file
must be restored to `.tsx` and recorded as excluded rather than refactored here. No such exception
was found during the pre-rename audit.

## Acceptance Criteria

- Every listed source path has a corresponding `.ts` path and was moved with `git mv`. The sandbox
  prevents writing the repository's real `.git/index`, so the moves remain unstaged here and will be
  detected as renames when the work is staged normally.
- No listed file contains JSX or runtime React usage.
- No importer, story harness, dynamic import, glob, or config mapping requires an extension update.
- `npm run typecheck`, `npm run lint`, and `npm run build-prod` complete successfully.
- No unit tests or test harnesses are added, and no commit is created.

## Files Changed

| Path | Change |
|---|---|
| `src/renderer/uikit/Checkbox/CheckboxView.tsx` → `src/renderer/uikit/Checkbox/CheckboxView.ts` | Rename only |
| `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStackView.tsx` → `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStackView.ts` | Rename only |
| `src/renderer/uikit/Dot/DotView.tsx` → `src/renderer/uikit/Dot/DotView.ts` | Rename only |
| `src/renderer/uikit/Label/LabelView.tsx` → `src/renderer/uikit/Label/LabelView.ts` | Rename only |
| `src/renderer/uikit/SegmentedControl/SegmentedControlView.tsx` → `src/renderer/uikit/SegmentedControl/SegmentedControlView.ts` | Rename only |
| `src/renderer/uikit/Slider/SliderView.tsx` → `src/renderer/uikit/Slider/SliderView.ts` | Rename only |
| `src/renderer/uikit/Spinner/SpinnerView.tsx` → `src/renderer/uikit/Spinner/SpinnerView.ts` | Rename only |
| `src/renderer/uikit/Tag/TagView.tsx` → `src/renderer/uikit/Tag/TagView.ts` | Rename only |
| `src/renderer/uikit/Button/ButtonView.tsx` → `src/renderer/uikit/Button/ButtonView.ts` | Rename only |
| `src/renderer/uikit/Dialog/DialogContentView.tsx` → `src/renderer/uikit/Dialog/DialogContentView.ts` | Rename only |
| `src/renderer/uikit/IconButton/IconButtonView.tsx` → `src/renderer/uikit/IconButton/IconButtonView.ts` | Rename only |
| `src/renderer/uikit/Input/InputView.tsx` → `src/renderer/uikit/Input/InputView.ts` | Rename only |
| `src/renderer/uikit/Notification/AlertItemView.tsx` → `src/renderer/uikit/Notification/AlertItemView.ts` | Rename only |
| `src/renderer/uikit/PathInput/PathInputView.tsx` → `src/renderer/uikit/PathInput/PathInputView.ts` | Rename only |
| `src/renderer/uikit/SelectableRow/SelectableRowView.tsx` → `src/renderer/uikit/SelectableRow/SelectableRowView.ts` | Rename only |
| `doc/tasks/US-1159-view-extension-debt/README.md` | Task record |
| `doc/active-work.md` | Dashboard link |

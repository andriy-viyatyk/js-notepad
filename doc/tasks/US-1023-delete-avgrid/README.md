# US-1023 — delete the legacy `uikit/AVGrid` namespace

**Epic:** [EPIC-057](../../epics/EPIC-057.md) — De-React Epic C4 (`AVGrid` → `av-grid`)
**Status:** Planned
**Created:** 2026-08-22
**Depends on:** US-1019, US-1020, US-1021, US-1022, US-1024
**Blocks:** closing EPIC-057 / Epic C

## Goal

Delete the superseded React `src/renderer/uikit/AVGrid/` implementation and remove its stale
barrel exports and current-code references now that every production consumer mounts `av-grid`
through `uikit/DataGrid`.

This is a cleanup task, not another grid migration. It must leave the npm `av-grid` dependency,
the `uikit/DataGrid/` mounting shim, `RenderGrid/`, and `VirtualGrid/` intact.

## Investigation summary

The scan was run against `132824f6` (`Implement US-1022 remaining grid consumers`), after the last
four consumers moved to `uikit/DataGrid`.

| Surface | Current measurement | Consequence |
|---|---:|---|
| `src/renderer/uikit/AVGrid/` tracked files | **30** | Delete the complete folder, including its 13-file model namespace and filter helpers |
| Production lines in that folder | **4,917** (`4,413` non-blank) | The epic’s line figure is accurate; only its printed file count was wrong. Record the 30-file correction and preserve the 4,917-line baseline |
| Emotion importers in the folder | **9** | All disappear with the folder |
| Production importers outside the folder | **0** | No consumer migration is required by US-1023 |
| `uikit/index.ts` legacy export block | **1** | Remove the block; no replacement exports belong in the general UIKit barrel |
| npm `av-grid` dependency | **1** exact pin, `2.2.3` | Keep it; `uikit/DataGrid/**` is its deliberate import boundary |

The 30 files to delete are:

```text
src/renderer/uikit/AVGrid/AVGrid.tsx
src/renderer/uikit/AVGrid/avGridTypes.ts
src/renderer/uikit/AVGrid/avGridUtils.ts
src/renderer/uikit/AVGrid/CellInput.tsx
src/renderer/uikit/AVGrid/CellSelect.tsx
src/renderer/uikit/AVGrid/column-width.ts
src/renderer/uikit/AVGrid/DataCell.tsx
src/renderer/uikit/AVGrid/DefaultEditFormater.tsx
src/renderer/uikit/AVGrid/HeaderCell.tsx
src/renderer/uikit/AVGrid/SelectColumn.tsx
src/renderer/uikit/AVGrid/useResolveOptions.ts
src/renderer/uikit/AVGrid/utils.tsx
src/renderer/uikit/AVGrid/index.ts
src/renderer/uikit/AVGrid/filters/FilterBar.tsx
src/renderer/uikit/AVGrid/filters/FilterPopover.tsx
src/renderer/uikit/AVGrid/filters/FiltersModel.ts
src/renderer/uikit/AVGrid/filters/OptionsFilterContent.tsx
src/renderer/uikit/AVGrid/model/AVGridActions.ts
src/renderer/uikit/AVGrid/model/AVGridData.ts
src/renderer/uikit/AVGrid/model/AVGridEvents.ts
src/renderer/uikit/AVGrid/model/AVGridModel.ts
src/renderer/uikit/AVGrid/model/ColumnsModel.ts
src/renderer/uikit/AVGrid/model/ContextMenuModel.tsx
src/renderer/uikit/AVGrid/model/CopyPasteModel.ts
src/renderer/uikit/AVGrid/model/EditingModel.ts
src/renderer/uikit/AVGrid/model/EffectsModel.ts
src/renderer/uikit/AVGrid/model/FocusModel.ts
src/renderer/uikit/AVGrid/model/RowsModel.ts
src/renderer/uikit/AVGrid/model/SelectedModel.ts
src/renderer/uikit/AVGrid/model/SortColumnModel.ts
```

The current source scan finds only the old barrel block as a code dependency:

```text
src/renderer/uikit/index.ts
  export { AVGrid, AVGridModel, FilterBar, FiltersModel, ... } from "./AVGrid";
  export type { AVGridProps, Column, CellFocus, ... } from "./AVGrid";
```

The remaining `AVGrid` names in `uikit/DataGrid/**` are intentionally the upstream library’s
class/type names (`AVGrid.create`, `AVGridOptions`, `AVGridStateSnapshot`, and
`DataGridInstance`), not imports from the deleted Persephone namespace. In particular,
`uikit/DataGrid/types.ts` owns the four legitimate package references. The package must not be
renamed or removed.

## Background

### What the preceding tasks delivered

- US-1019 introduced the exact-pinned `av-grid` dependency, the renderer `--p-*` bridge, the
  layered `DataGrid.css`, `DataGridView`, the `DataGrid` React face, and the integration story.
- US-1020 moved `editors/grid/` and its popover filter/context-menu path.
- US-1021 moved `components/git-tree/`, including the DOM `BranchTreeCell` renderer and git
  context-menu handoff.
- US-1024 restored clipped-cell ellipsis and the hover tooltip once in `DataGridView`.
- US-1022 moved `FileGrid`, `EnvVarsBody`, `GraphDetailPanel`, and `GridOutputView`.

US-1022’s post-migration check confirms the old folder is now imported only by the general UIKit
barrel. `DataGrid` is already the only door to the npm package: consumers import its types and
helpers from `uikit/DataGrid`, while `DataGridView.ts` is the only production module that calls
`AVGrid.create`.

### Code and documentation references that become stale

The implementation should clean current code comments and durable architecture indexes in the same
change. These are references to update, not additional runtime migrations:

| File | Required correction |
|---|---|
| `src/renderer/uikit/index.ts` | Remove the complete legacy AVGrid export block. Keep `RenderGrid`, `VirtualGrid`, and all unrelated UIKit exports. |
| `src/renderer/uikit/DataGrid/index.ts` | Keep the package-boundary explanation, but replace references to the deleted `./AVGrid` barrel and old `column-width.ts` with “the former React grid” / the upstream av-grid helpers where appropriate. |
| `src/renderer/uikit/DataGrid/DataGridView.ts` | Describe the former React grid without linking to a deleted `uikit/AVGrid` path. Keep the actual `AVGrid` package import and `AVGrid.create` call. |
| `src/renderer/uikit/shared/highlight.ts` | Change the “stays until AVGrid converts” note to the post-C4 state; the React helper remains for its current React consumers, not for the deleted grid. |
| `src/renderer/uikit/Select/SelectView.ts` | Replace the stale `AVGrid/CellSelect` implementation-path example with a neutral former-grid example. |
| `src/renderer/editors/grid/index.tsx` | Rename the stale `AVGridModel` ref comment to the `DataGridInstance` handle that the file now stores. |
| `src/renderer/components/git-tree/GitTree.tsx`, `swimlane-layout.ts`, `src/renderer/editors/env-vars/EnvVarsEditor.ts`, `src/renderer/editors/git-tree/GitChangesView.tsx`, `src/renderer/editors/git-tree/GitTreeEditorView.tsx`, `src/renderer/editors/file-diff/RevisionPicker.tsx` | Remove or rephrase comments that describe the deleted React grid as the current implementation. Preserve historical explanations when they still explain a compatibility decision. |
| `src/renderer/ui/dialogs/poppers/grid-context-menu.tsx` | Point the parity/source comments at the current `DataGrid` context-menu path rather than the deleted `ContextMenuModel`. |
| `src/renderer/components/CLAUDE.md` | Change FileGrid and GitTree descriptions from AVGrid-based to `DataGrid`/av-grid-based. |
| `src/renderer/uikit/CLAUDE.md` | Remove AVGrid from the RenderGrid compositional-exception wording; do not weaken the RenderGrid exception itself. |
| `doc/architecture/overview.md` | Replace `AVGrid/` in the UIKit examples with `DataGrid/` and retain `RenderGrid/` / `VirtualGrid/` as distinct survivors. |
| `doc/architecture/folder-structure.md` | Remove the `uikit/AVGrid/` node and update grid editor, file-grid, and git-tree descriptions to `DataGrid`/av-grid. |
| `doc/architecture/key-files.md` | Remove the Advanced grid row, update FileGrid and env editor descriptions, and retain the `DataGridView` ownership entry if it is added/needed. |
| `doc/architecture/context-menu.md` | Replace the deleted AVGrid context-menu consumer with the current DataGrid host path. |
| `doc/architecture/secondary-views.md` | Update the Git Tree click-to-reveal description from `AVGridModel` to the `DataGridInstance` handle where it describes current behavior. |
| `eslint.config.mjs` | Remove the obsolete `uikit/AVGrid/**/*.ts{,x}` `any` allowlist entries and the AVGrid-model `react-hooks/rules-of-hooks` override. Keep the adjacent `uikit/DataGrid/**` allowlist and its upstream-generic rationale. |
| `doc/de-react.md` | Close the last Rule 6 exemption, re-base the highlight collection row on its five remaining React consumers, reduce the “collectable” count, and state that AVGrid’s former RenderGrid imports are gone. Preserve the independent 4,917-line measurement. |
| `doc/epics/EPIC-057.md` | Reconcile the stale 29-file count to the measured 30-file / 4,917-line deletion, link US-1023, record the zero-importer result, and prepare the epic’s close-state wording. |

### Records that must remain historical

Do not rewrite old task analyses merely to make a repository-wide text search say zero. In
particular:

- `doc/architecture/styling-inventory.md` is explicitly a frozen 2026-08-18 snapshot; its
  superseded AVGrid list is historical evidence and must remain unchanged.
- Completed/planned task READMEs that document the pre-migration React grid are historical task
  records. They may be left with their original paths, unless a link is actually broken and the
  task’s durable-link policy requires a repair.
- `doc/de-react.md` is the live programme dashboard and must be updated where C4 changes its
  current claims: the Rule 6 exception at lines 235/243–246, the `RenderGrid` deferred-collection
  row at 791, and the collectable-count sentence around 798. Its independent 4,917-line baseline
  at 614 is historical measurement and must not be changed.
- Older epic documents and completed/planned task READMEs may retain historical C4/C3 reasoning,
  but current claims or broken links must be updated deliberately rather than mechanically erased.

## Implementation plan

### 1. Freeze the cleanup baseline

- Confirm the worktree is clean and record the implementation base commit in the task/epic notes.
- Re-run the inventory from the repository root: count `src/renderer/uikit/AVGrid/**`, count lines,
  count `@emotion` imports, and list every source importer outside the directory.
- Confirm the four US-1022 consumers and the other earlier consumers import from
  `uikit/DataGrid`, not the old barrel. Do not change any consumer as part of this task.
- Run the existing baseline checks before deletion if a later failure needs attribution:
  `npm run typecheck`, `npm run lint`, and `npm run build-prod`.

### 2. Remove the legacy runtime namespace and barrel surface

- Delete all 30 files listed above, which removes the React component, its filters, its model
  namespace, its cell renderers/editors, and the old utility/type aliases as one indivisible unit.
- Remove the AVGrid export/value/type block from `src/renderer/uikit/index.ts`.
- In `eslint.config.mjs`, remove only the two AVGrid-scoped `@typescript-eslint/no-explicit-any`
  globs and the complete AVGrid-model `react-hooks/rules-of-hooks: "off"` override. Keep the
  `uikit/DataGrid/**`, `editors/grid/**`, and story allowlists; the comment explaining upstream
  `AVGrid<R = any>` now belongs solely to the DataGrid entries.
- Do **not** remove `av-grid` from `package.json` or `package-lock.json`; `uikit/DataGrid/**`
  still imports it and is the replacement implementation.
- Do **not** alter `uikit/DataGrid/**` behavior, `RenderGrid/**`, or `VirtualGrid/**` merely because
  their comments or upstream type names contain `AVGrid`.

### 3. Clean live source comments and ownership descriptions

- Apply the exact current-code comment updates in the table above.
- Keep comments that explicitly explain the former implementation’s behavior when they are still
  useful, but use past tense and avoid paths that no longer resolve.
- Ensure no current source comment claims that `uikit/AVGrid` is an active owner, consumer, or
  package boundary. The only permitted source-level `AVGrid` implementation reference after this
  step is the upstream class/type used inside `uikit/DataGrid/**`.

### 4. Reconcile durable architecture documentation

- Update the architecture indexes and component/uikit guidance listed above.
- Update the live programme dashboard `doc/de-react.md`: the Rule 6 zone has no exemption after
  the old context-menu model disappears; `uikit/shared/highlight.ts` still has five live React
  consumers in `editors/` (GraphBody, LinksList, LinkCategoryPanel, ExpandedNoteView, and
  NoteItemView), so its collection point moves to Epics D/E; and RenderGrid no longer has an
  AVGrid importer.
- Update EPIC-057’s measured surface and task table from “Planned” to the implementation state,
  but leave final archival/status movement to the explicit epic-completion workflow.
- Record the replacement boundary clearly: `uikit/DataGrid/` is the Persephone mounting seam;
  `av-grid` is the external engine; no consumer imports the package directly.
- Keep the frozen styling inventory and historical task records unchanged as specified above.

### 5. Verify absence, boundary, and replacement

- The directory `src/renderer/uikit/AVGrid/` no longer exists.
- `src/renderer/uikit/index.ts` contains no export from `./AVGrid` and no legacy AVGrid symbols.
- No production source imports a deleted `uikit/AVGrid` path or legacy `AVGridModel`/`AVGridProps`
  surface. A raw `AVGrid` grep is not sufficient because the upstream package intentionally uses
  that class name.
- A symbol-level scan covers every former barrel export (`AVGrid`, `AVGridModel`, `FilterBar`,
  `FiltersModel`, `detectColumnWidth`, `useResolveOptions`, `defaultCompare`, `formatDispayValue`,
  `filterRows`, `defaultValidate`, `columnDisplayValue`, `gridBoolean`,
  `recordsToTableHTML`, `recordsToClipboardFormatted`, `rowsToCsvText`, and the former exported
  type names). The live uses resolve through `uikit/DataGrid`; unused legacy names are absent.
  Note that the old `formatDispayValue` spelling would fail loudly if reintroduced; upstream uses
  `formatDisplayValue`.
- `eslint.config.mjs` has no AVGrid-folder glob and no AVGrid-model hooks override; the DataGrid
  `any` exemption and its explanation remain.
- `uikit/DataGrid/**` remains the only production source importing from the `av-grid` package;
  `npm ls av-grid` still resolves the exact pinned version `2.2.3`.
- Run `npm run typecheck`, `npm run lint`, `npm run build-prod`, and `git diff --check`.
- Inspect the compiled dependency graph or build output if needed to ensure the deleted React grid
  modules are absent while the DataGrid shim and `av-grid/av-grid.css` remain present.
- Re-run the no-import scan after all documentation/comment edits so a new stale source path is not
  introduced while cleaning the indexes.

## Concerns / open questions

### 1. The epic’s opening file count is stale, but its line count is correct

The measured current deletion is 30 files / 4,917 lines (4,413 non-blank), while EPIC-057 prints
29 files / 4,917 lines. The folder has not changed since the epic’s measured baseline; the close
record must correct only the file count and preserve the line figure.

### 2. `AVGrid` remains a valid upstream name

Deleting the Persephone `AVGrid` namespace does not make every `AVGrid` token wrong. The npm class
is still `AVGrid`, `AVGridOptions` is still an upstream type, and `DataGridInstance` aliases the
upstream instance. `uikit/DataGrid/types.ts` also intentionally re-exports the upstream state
snapshot and options types. Verification must distinguish package imports under `uikit/DataGrid/**`
from deleted relative imports and old Persephone barrel symbols.

### 3. Barrel compatibility is not a live consumer requirement

The scan finds no source consumer of the old `uikit/index.ts` exports after US-1022. Removing them
is therefore the intended API cleanup, not a migration opportunity. If typecheck reveals an
unexpected consumer, stop and classify it before reintroducing a compatibility alias; do not
resurrect the deleted folder or export a second DataGrid surface from the general barrel.

### 4. Historical documentation can look like a failed absence scan

Many task READMEs and the frozen styling inventory deliberately mention the old path. A completion
scan that demands zero textual `AVGrid` matches across `doc/` would destroy useful historical
context. The acceptance scan must be scoped to live source imports/current ownership docs, with
historical exceptions named and reviewed.

### 5. The live roadmap has C4 claims that must change

`doc/de-react.md` is not merely historical. US-1023 closes its last Rule 6 exemption, removes the
old AVGrid importer from the RenderGrid row, and leaves the React highlight helper with five live
editor consumers. The task must update those claims while preserving the independent 4,917-line
measurement and older historical task analyses.

### 6. Cleanup comments must not erase the C4 boundary rationale

The important architectural rule survives deletion: app code reaches the library only through
`uikit/DataGrid`. Comments in `DataGrid/index.ts` and `DataGridView.ts` should be shortened or
reworded, not removed wholesale, because they explain why direct package imports and a general
UIKit-barrel export are forbidden.

### 7. No runtime behavior should change, but app smoke coverage still matters

US-1023 deletes unreachable code, so it should not alter grid behavior. A fresh build plus a focused
smoke pass of the JSON/CSV grid, Git Tree, FileGrid/Changes, environment variables, graph detail,
and log-grid output is still required to catch an accidentally removed replacement export or CSS
import. This is cleanup risk, not a new feature risk.

## Acceptance criteria

- [ ] `src/renderer/uikit/AVGrid/` is deleted in full: exactly the 30 currently tracked files,
  including filters, models, utilities, and the barrel.
- [ ] `uikit/index.ts` no longer exports the legacy AVGrid component, model, filters, helpers, or
  types; no source consumer depended on those exports.
- [ ] `uikit/DataGrid/` remains the sole Persephone boundary to npm `av-grid`; the exact dependency
  pin remains installed and no direct app-layer import is introduced.
- [ ] Current source imports/comments and durable architecture indexes no longer describe the
  deleted namespace as an active implementation; the frozen styling inventory and historical task
  records remain intentionally unchanged.
- [ ] `eslint.config.mjs` contains neither an AVGrid-folder `any` glob nor an AVGrid-model hooks
  override; the DataGrid exemption remains intact.
- [ ] `doc/de-react.md` records the closed Rule 6 exception, the five live highlight React
  consumers / D–E collection point, and the removal of AVGrid’s RenderGrid importer. Its 4,917
  line baseline remains unchanged.
- [ ] EPIC-057 records the corrected close inventory (30 files / 4,917 lines deleted, 9 Emotion
  importers removed, zero old-folder importers remaining) and links this task.
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run build-prod` passes and retains the DataGrid/av-grid CSS in the renderer bundle.
- [ ] `git diff --check` passes.
- [ ] Focused smoke testing confirms the JSON/CSV grid, Git Tree, FileGrid/Changes,
  environment-variable grid, graph detail grids, and log-grid output still render and retain their
  migrated interactions.

## Files expected to change

### Delete

- `src/renderer/uikit/AVGrid/**` — the 30-file legacy namespace.

### Modify

- `src/renderer/uikit/index.ts`
- `eslint.config.mjs`
- Live source comments listed in the implementation plan (only where they name the deleted owner)
- `src/renderer/components/CLAUDE.md`
- `src/renderer/uikit/CLAUDE.md`
- `doc/architecture/overview.md`
- `doc/architecture/folder-structure.md`
- `doc/architecture/key-files.md`
- `doc/architecture/context-menu.md`
- `doc/architecture/secondary-views.md`
- `doc/de-react.md`
- `doc/epics/EPIC-057.md`
- `doc/active-work.md`

### Explicitly not changed

- `package.json` / `package-lock.json` dependency `av-grid@2.2.3`
- `src/renderer/uikit/DataGrid/**`
- `src/renderer/uikit/RenderGrid/**`
- `src/renderer/uikit/VirtualGrid/**`
- `boards-assets/manifest.json` — its `window.AVGrid` / `AVGrid.version` references are to the npm
  library and must remain.
- `.persephone/data/tasks.json` — application data, not a source import or architecture record.
- `doc/architecture/styling-inventory.md` frozen snapshot
- Historical task READMEs solely to remove old implementation references

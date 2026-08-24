# US-1067 — Delete `uikit/RenderGrid/`

Epic: [EPIC-062 — De-React Epic E4](../../epics/EPIC-062.md)

Status: planned; investigation complete, implementation deliberately not started.

## Goal

Delete the React `RenderGrid` contract after its consumers have moved to the
framework-free `VirtualGrid` mechanism, so the epic's closing property is true:
`src/renderer/uikit/RenderGrid/` is absent, the UIKit barrel exposes no legacy
grid names, and current documentation describes `VirtualGridView` and
`VirtualFlexGridView` instead. The epic defines that property as deletion of the
whole folder plus zero `RenderGrid` matches under `src/`.
([doc/epics/EPIC-062.md:13-19](../../epics/EPIC-062.md))

## Background

The folder currently contains seven files and 2,315 lines: `RenderGrid.tsx`,
`RenderFlexGrid.tsx`, `RenderGridModel.ts`, `renderInfo.ts`,
`rerender-check.ts`, `types.ts`, and `index.ts`. Its barrel exports the React
faces, model, props, flex-cell types, and the duplicated geometry types.
([src/renderer/uikit/RenderGrid/index.ts:1-38](../../../src/renderer/uikit/RenderGrid/index.ts);
[src/renderer/uikit/RenderGrid/RenderGrid.tsx:42-45](../../../src/renderer/uikit/RenderGrid/RenderGrid.tsx);
[src/renderer/uikit/RenderGrid/RenderFlexGrid.tsx:89-118](../../../src/renderer/uikit/RenderGrid/RenderFlexGrid.tsx))

The replacement is already present: `VirtualGrid` defines an
`HTMLElement`-returning cell contract and the shared model capability, while
`VirtualGridView` owns the scroll element and `VirtualFlexGridView` is the
measured-height view. ([src/renderer/uikit/VirtualGrid/types.ts:78-85](../../../src/renderer/uikit/VirtualGrid/types.ts);
[src/renderer/uikit/VirtualGrid/types.ts:160-185](../../../src/renderer/uikit/VirtualGrid/types.ts);
[src/renderer/uikit/VirtualGrid/index.ts:1-52](../../../src/renderer/uikit/VirtualGrid/index.ts);
[src/renderer/uikit/VirtualGrid/VirtualGridView.ts:204-214](../../../src/renderer/uikit/VirtualGrid/VirtualGridView.ts))

The converted consumers now use the replacement directly: the log and
notebook hosts import `VirtualFlexGridView`, and the tile host imports
`VirtualGridView`; their React boundary files use only `GridModelCapability`.
([src/renderer/editors/log-view/LogBodyView.ts:2-9](../../../src/renderer/editors/log-view/LogBodyView.ts);
[src/renderer/editors/notebook/NotebookBodyView.ts:2-14](../../../src/renderer/editors/notebook/NotebookBodyView.ts);
[src/renderer/editors/link-editor/LinksTiles.tsx:1-5](../../../src/renderer/editors/link-editor/LinksTiles.tsx);
[src/renderer/editors/link-editor/LinksTilesView.ts:5-17](../../../src/renderer/editors/link-editor/LinksTilesView.ts))

### Preconditions verified before planning deletion

1. **PASS — no file outside `uikit/RenderGrid/` imports from the folder.** A
   repository-wide source search found no external import of the legacy path or
   legacy model/type names. The only surviving outside reference is the
   deliberate barrel re-export block in `uikit/index.ts`, which is this task's
   removal target. The former consumers use the native imports cited above, and
   the remaining link boundary imports `GridModelCapability` from `VirtualGrid`.
   ([src/renderer/uikit/index.ts:125-144](../../../src/renderer/uikit/index.ts);
   [src/renderer/editors/link-editor/LinksList.tsx:1-6](../../../src/renderer/editors/link-editor/LinksList.tsx);
   [src/renderer/editors/link-editor/LinkItemList.tsx:1-3](../../../src/renderer/editors/link-editor/LinkItemList.tsx);
   [src/renderer/editors/link-editor/LinkEditor.ts:1-13](../../../src/renderer/editors/link-editor/LinkEditor.ts))

2. **PASS — no live `#avg-container` lookup or equivalent remains.** The
   legacy markup is confined to `RenderGrid.tsx`; `VirtualGridView` exposes its
   actual scroller instead, and the notebook uses that property. The remaining
   `#avg-container` mention in `VirtualGridView.ts` is explanatory prose about
   the deleted lookup, not a selector or DOM lookup.
   ([src/renderer/uikit/RenderGrid/RenderGrid.tsx:101-105](../../../src/renderer/uikit/RenderGrid/RenderGrid.tsx);
   [src/renderer/uikit/VirtualGrid/VirtualGridView.ts:204-214](../../../src/renderer/uikit/VirtualGrid/VirtualGridView.ts);
   [src/renderer/editors/notebook/NotebookBodyView.ts:315-321](../../../src/renderer/editors/notebook/NotebookBodyView.ts))

3. **PASS — nothing depends on the legacy barrel names.** Outside the folder
   and the barrel block, the legacy component/model/property names have no
   source references. The geometry names that remain in use are exported from
   `VirtualGrid/index.ts` and defined in `VirtualGrid/types.ts`; the current
   list, tiles, log, notebook, tree, and file-search code uses those native
   types rather than the duplicate React types.
   ([src/renderer/uikit/VirtualGrid/index.ts:26-52](../../../src/renderer/uikit/VirtualGrid/index.ts);
   [src/renderer/uikit/VirtualGrid/types.ts:12-27](../../../src/renderer/uikit/VirtualGrid/types.ts);
   [src/renderer/components/file-search/FileSearchView.ts:1-5](../../../src/renderer/components/file-search/FileSearchView.ts);
   [src/renderer/uikit/ListBox/ListBoxView.ts:17-20](../../../src/renderer/uikit/ListBox/ListBoxView.ts);
   [src/renderer/uikit/Tree/TreeView.ts:17-20](../../../src/renderer/uikit/Tree/TreeView.ts))

### Ledger files identified

- **De-React removal ledger:** `doc/de-react.md`, whose removal-ledger table
  contains the `uikit/RenderGrid/` and `uikit/RenderGrid/RenderFlexGrid.tsx`
  survivors. ([doc/de-react.md:879-899](../../de-react.md))
- **Styling/Emotion inventory:** `doc/architecture/styling-inventory.md`,
  whose Emotion and inline-style inventories list `RenderGrid.tsx` as a
  remaining UIKit owner. ([doc/architecture/styling-inventory.md:28-53](../../architecture/styling-inventory.md);
  [doc/architecture/styling-inventory.md:55-105](../../architecture/styling-inventory.md))

## Implementation Plan

### 1. Re-run the deletion gate

- Repeat the three source searches above immediately before editing.
- Confirm that no import path, type name, or barrel consumer has appeared.
- If any precondition changes from PASS, stop without deleting the folder and
  report the blocking file and line.

### 2. Remove the React implementation and its barrel exports

- Delete every file in `src/renderer/uikit/RenderGrid/`: `RenderGrid.tsx`,
  `RenderFlexGrid.tsx`, `RenderGridModel.ts`, `renderInfo.ts`,
  `rerender-check.ts`, `types.ts`, and `index.ts`.
- Remove the legacy React export block from
  `src/renderer/uikit/index.ts:133-144`, including `RenderGrid`,
  `RenderGridModel`, `RenderFlexGrid`, `RenderGridProps`,
  `RenderFlexGridProps`, `RenderFlexCellParams`, and the duplicate geometry
  exports. Keep the `VirtualGrid` exports and replace the stale comment at
  `src/renderer/uikit/index.ts:125-126` with wording that describes the
  surviving native aliases.

Before:

```ts
// Virtualization, React — legacy.
export { RenderGrid, RenderGridModel, RenderFlexGrid } from "./RenderGrid";
export type { RenderGridProps, RenderFlexGridProps, RenderFlexCellParams, ... } from "./RenderGrid";
```

After:

```ts
// VirtualGrid is the framework-free virtualization contract.
export { VirtualGridView, VirtualFlexGridView, VirtualGridModel } from "./VirtualGrid";
export type { VirtualGridProps, VirtualFlexGridProps, RenderCellParams, RenderCellFunc, ... } from "./VirtualGrid";
```

The exact retained export list must match `VirtualGrid/index.ts:1-52`; no
compatibility alias may point back to the deleted folder.

### 3. Close both removal-ledger entries and refresh styling inventory

- In `doc/de-react.md:891-899`, remove the two E4-owned survivor rows for
  `uikit/RenderGrid/` and `uikit/RenderGrid/RenderFlexGrid.tsx` after the folder
  is actually gone. Do not claim collection before the deletion.
- Update the React-highlight ledger row in the same table from five consumers
  to its current two remaining React consumers (`GraphBody` and
  `LinkCategoryPanel`); the converted notebook and list consumers now call the
  DOM form `highlightInto` or no longer import the React form.
  ([src/renderer/editors/graph/GraphBody.tsx:1-4](../../../src/renderer/editors/graph/GraphBody.tsx);
  [src/renderer/editors/link-editor/panels/LinkCategoryPanel.tsx:1-4](../../../src/renderer/editors/link-editor/panels/LinkCategoryPanel.tsx);
  [src/renderer/editors/notebook/ExpandedNoteView.ts:1-10](../../../src/renderer/editors/notebook/ExpandedNoteView.ts);
  [src/renderer/editors/notebook/NoteItemView.ts:1-10](../../../src/renderer/editors/notebook/NoteItemView.ts);
  [src/renderer/uikit/shared/highlight.ts:17-40](../../../src/renderer/uikit/shared/highlight.ts))
- Re-run the documented inventory commands in
  `doc/architecture/styling-inventory.md:11-26`. Remove the deleted Emotion
  importer and its inline-style sites from the inventory, recalculate totals,
  and leave the remaining `mount.tsx` inline compatibility host documented.

Before:

```md
The current renderer has **4 Emotion importers** … `RenderGrid/RenderGrid.tsx`.
```

After:

```md
The current renderer has the recalculated residual Emotion importer count;
`RenderGrid/RenderGrid.tsx` is no longer an importer or inline-style owner.
```

The post-deletion numbers must come from the documented commands, not from the
old snapshot. ([doc/architecture/styling-inventory.md:28-44](../../architecture/styling-inventory.md);
[doc/architecture/styling-inventory.md:55-89](../../architecture/styling-inventory.md))

### 4. Update the five living architecture documents

Rewrite current descriptions, paths, counts, and examples so they name the
mechanism that exists after deletion. The replacement facts are the native
cell contract and the two native views in `VirtualGrid`.
([src/renderer/uikit/VirtualGrid/types.ts:145-185](../../../src/renderer/uikit/VirtualGrid/types.ts);
[src/renderer/uikit/VirtualGrid/VirtualFlexGridView.ts:1-20](../../../src/renderer/uikit/VirtualGrid/VirtualFlexGridView.ts))

| Document | Current stale sites | Required result |
|---|---|---|
| `doc/architecture/overview.md` | `:127` lists `RenderGrid/` beside `VirtualGrid/`. | List only the current `VirtualGrid/` primitive and its native flex view. |
| `doc/architecture/folder-structure.md` | `:505` calls `LogBody.tsx` a `RenderFlexGrid` component; `:766-767` lists the deleted folder. | Describe `LogBodyView`/`VirtualFlexGridView` and show only `VirtualGrid/` in UIKit. |
| `doc/architecture/key-files.md` | `:158-160` still indexes `RenderGrid.tsx` as a React survivor. | Retain the native `VirtualGridView` entry and add/describe `VirtualFlexGridView`; remove the deleted path. |
| `doc/architecture/styling-inventory.md` | `:30-53`, `:62`, `:88`, and `:104` name the deleted Emotion/inline-style owner. | Use recalculated residual counts and current native style ownership. |
| `doc/de-react.md` | Current roadmap/ledger prose at `:770-775`, `:879-899` and the RenderGrid migration notes found at `:238`, `:392`, `:533-534`, `:654-680`, `:771-781`. | Mark the React contract as collected and describe `VirtualGrid`/`VirtualFlexGridView` as the current mechanism; retain only clearly historical rationale where needed. |

Before:

```md
RenderGrid/ — React virtualization survivor
```

After:

```md
VirtualGrid/ — framework-free virtualization engine, VirtualGridView for
fixed-height rows and VirtualFlexGridView for measured row heights
```

Do not edit `doc/epics/EPIC-062.md`; if its closing decision or counts need
correction, report that separately. ([doc/epics/EPIC-062.md:626-705](../../epics/EPIC-062.md))

### 5. Verify the closing property

- Confirm `src/renderer/uikit/RenderGrid/` no longer exists and
  `rg -n "RenderGrid|RenderFlexGrid|RenderGridModel" src` returns no matches.
- Confirm no `#avg-container` markup or `closest("#avg-container")`-style
  lookup remains; the explanatory `VirtualGridView` comment may remain because
  it documents the former defect. ([src/renderer/uikit/VirtualGrid/VirtualGridView.ts:204-214](../../../src/renderer/uikit/VirtualGrid/VirtualGridView.ts))
- Confirm the legacy export block is absent and native geometry/capability
  exports remain available from `VirtualGrid/index.ts:26-52`.
- Run `npm run typecheck`, `npm run lint`, and `npm run build-prod`, the
  repository's configured verification commands. ([package.json:9-14](../../../package.json))
- Do not add unit tests or a test harness; the project explicitly forbids them
  for this work, per the task constraints.

## Concerns

- **Live tile-layout caveat:** the US-1066 record says typecheck, lint, and
  production build were run, but the tile-layout control could not be driven
  synthetically. Therefore tile geometry, tile recycling, and favicon repaint
  in tile mode remain static-reading-only evidence for this epic close; this
  deletion does not depend on restoring `RenderGrid` and the caveat must remain
  explicit in the closing record. ([doc/tasks/US-1066-linkstiles-virtual-grid/README.md:8-15](../US-1066-linkstiles-virtual-grid/README.md);
  [doc/tasks/US-1066-linkstiles-virtual-grid/README.md:340-353](../US-1066-linkstiles-virtual-grid/README.md))
- The native grid deliberately exposes `scrollElement`; no replacement should
  recreate the deleted internal id lookup. ([src/renderer/uikit/VirtualGrid/VirtualGridView.ts:204-214](../../../src/renderer/uikit/VirtualGrid/VirtualGridView.ts))
- The old React and native geometry implementations are parallel historical
  forks, but no current consumer depends on the deleted fork after the three
  preconditions passed. The final source grep is the acceptance check for that
  claim. ([src/renderer/uikit/RenderGrid/renderInfo.ts:314-315](../../../src/renderer/uikit/RenderGrid/renderInfo.ts);
  [src/renderer/uikit/VirtualGrid/renderInfo.ts:380-381](../../../src/renderer/uikit/VirtualGrid/renderInfo.ts))

### Files that need no changes

`src/renderer/editors/link-editor/`, `src/renderer/editors/log-view/`,
`src/renderer/editors/notebook/`, and the `src/renderer/uikit/VirtualGrid/`
implementation are already converted and are only verification inputs.
([src/renderer/editors/log-view/LogBodyView.ts:37-58](../../../src/renderer/editors/log-view/LogBodyView.ts);
 [src/renderer/editors/notebook/NotebookBodyView.ts:5-10](../../../src/renderer/editors/notebook/NotebookBodyView.ts);
 [src/renderer/editors/link-editor/LinksTilesView.ts:75-104](../../../src/renderer/editors/link-editor/LinksTilesView.ts))

The following are hard no-touch inputs: `doc/epics/EPIC-062.md`,
`doc/epics/EPIC-015.md` through `doc/epics/EPIC-061.md`,
`doc/epics/completed.md`, `doc/tasks/completed.md`, and every prior
`doc/tasks/US-*/README.md`. Their historical references must remain intact.
([doc/epics/EPIC-062.md:688-705](../../epics/EPIC-062.md))

## Acceptance Criteria

- All seven files under `src/renderer/uikit/RenderGrid/` are deleted, and the
  directory is gone. ([src/renderer/uikit/RenderGrid/index.ts:1-38](../../../src/renderer/uikit/RenderGrid/index.ts))
- `src/renderer/uikit/index.ts` no longer exports any legacy RenderGrid value or
  type, while `VirtualGrid/index.ts` remains the native export source.
  ([src/renderer/uikit/index.ts:116-144](../../../src/renderer/uikit/index.ts);
  [src/renderer/uikit/VirtualGrid/index.ts:1-52](../../../src/renderer/uikit/VirtualGrid/index.ts))
- The three deletion preconditions remain PASS immediately before deletion and
  the final source searches return no legacy imports, names, or markup lookup.
- Both De-React removal-ledger rows are collected and the styling/Emotion
  inventory is recalculated from the documented commands.
  ([doc/de-react.md:879-899](../../de-react.md);
  [doc/architecture/styling-inventory.md:11-44](../../architecture/styling-inventory.md))
- The five specified living documents describe `VirtualGrid/`,
  `VirtualGridView`, and `VirtualFlexGridView`, with no current claim that
  `RenderGrid` exists. ([doc/architecture/overview.md:117-130](../../architecture/overview.md);
  [doc/architecture/folder-structure.md:759-768](../../architecture/folder-structure.md);
  [doc/architecture/key-files.md:155-162](../../architecture/key-files.md))
- `npm run typecheck`, `npm run lint`, and `npm run build-prod` pass; no tests or
  harnesses are added, per the task constraints. ([package.json:9-14](../../../package.json))
- The tile-layout verification caveat is retained in the closing documentation.
  ([doc/tasks/US-1066-linkstiles-virtual-grid/README.md:340-353](../US-1066-linkstiles-virtual-grid/README.md))

## Files Changed summary

| File or path | Planned change |
|---|---|
| `src/renderer/uikit/RenderGrid/` | Delete all seven legacy implementation files. |
| `src/renderer/uikit/index.ts` | Remove the legacy export block and stale comment; retain native exports. |
| `doc/de-react.md` | Collect the two RenderGrid ledger entries and update the remaining highlight count/current roadmap prose. |
| `doc/architecture/styling-inventory.md` | Recalculate Emotion and inline-style inventories after deletion. |
| `doc/architecture/overview.md` | Replace the obsolete UIKit folder listing. |
| `doc/architecture/folder-structure.md` | Replace obsolete RenderGrid and RenderFlexGrid descriptions. |
| `doc/architecture/key-files.md` | Remove the deleted React key-file row; describe native virtualization views. |
| `doc/active-work.md` | Link the existing US-1067 dashboard entry to this document. |
| `doc/tasks/US-1067-delete-rendergrid/README.md` | This investigation and implementation plan. |

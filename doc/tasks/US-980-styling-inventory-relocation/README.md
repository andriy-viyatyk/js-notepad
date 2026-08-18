# US-980: Relocate the Emotion and inline-style inventories

**Status:** Planned
**Priority:** High
**Epic:** [EPIC-052 — De-React Epic A: Style and token foundation](../../epics/EPIC-052.md)
**Created:** 2026-08-18

## Goal

Move the two EPIC-051 styling inventories into durable developer documentation before the Epic P
task folders are cleaned up. The durable document must preserve the pinned scans, measured totals,
complete file partitions, dynamic/keyframe exceptions, and ownership boundaries that EPIC-052 uses
as its baseline.

## Background

US-975 currently contains the Emotion inventory in
`doc/tasks/US-975-emotion-inventory/README.md`: 79 renderer files import `@emotion/styled` or
`@emotion/react`, partitioned into 65 eligible static/non-prop files, 5 dynamic files, and 9
superseded AVGrid files. The 79-file scan includes the one `Tree.story.tsx`; the production count is
78 and the eligible production conversion estimate is 69.

US-979 currently contains the literal inline-style inventory in
`doc/tasks/US-979-inline-style-inventory/README.md`: 133 `style={{...}}` sites across 51 non-story
`.tsx` files. It is a separate surface from Emotion and intentionally does not include
`style={...}` objects, model-provided style objects, CSS files, or serialized styles.

The task folders are implementation history, not durable architecture references. Their contents
are scheduled for cleanup when EPIC-051 closes, while EPIC-052 still needs these measurements for
US-981, US-983, and US-984. The durable home selected by EPIC-052 is
`doc/architecture/styling-inventory.md`.

## Measured baseline

Run from the repository root:

```powershell
$emotion = @(rg -l '@emotion/(styled|react)' src/renderer --glob '*.{ts,tsx}' | Sort-Object)
"Emotion files: $($emotion.Count)"
$emotion

$inline = @(rg -n 'style\s*=\s*\{\{' src/renderer --glob '*.tsx' --glob '!*.story.tsx')
"Inline-style sites: $($inline.Count)"
$inline
```

Measured on 2026-08-18:

| Surface | Files | Sites | Partition |
|---|---:|---:|---|
| Emotion imports | 79 | — | 65 static/non-prop, 5 dynamic, 9 superseded AVGrid |
| Literal inline styles | 51 | 133 | editors 35/103; uikit 6/18; ui 3/4; components 6/7; theme 1/1 |

The current source documents contain the exact file lists. The implementation must carry those
lists into the durable document rather than replacing them with aggregate counts only.

## Implementation plan

### 1. Create the durable inventory

Create `doc/architecture/styling-inventory.md` as the single durable source for both inventories.
Move or reproduce, without losing classification detail:

- both pinned scan commands and the date of the measured baseline;
- the Emotion area table and the 65/5/9 partition;
- all 65 eligible static/non-prop paths, all 9 superseded AVGrid paths, and all 5 dynamic paths;
- the four eligible production dynamic runtime inputs and the story-only exception;
- the three keyframe definitions in Dialog, ProgressBar, and Spinner;
- the `GlobalStyles.tsx`, `selection-style.ts`, and `core/state/view.tsx` infrastructure treatment;
- the 133 inline-style sites partitioned as 35/103, 6/18, 3/4, 6/7, and 1/1;
- the complete 51-file inline-style list and highest-density files;
- the distinction between literal `style={{...}}` sites and indirect style objects;
- ownership boundaries and the handoff to EPIC-052.

The document is an inventory, not a conversion plan. It must not change source code, package
dependencies, scan scope, or the styling strategy already decided in EPIC-052.

### 2. Make the durable document self-sufficient

Put all rationale needed by a future reader into `doc/architecture/styling-inventory.md`: why the
scans exist, why the Emotion partition distinguishes static, dynamic, story, AVGrid, keyframe, and
infrastructure cases, why inline styles are a separate surface, and why indirect style objects are
out of scope. Do not edit US-975 or US-979; they are historical task records and their folders are
scheduled for deletion.

### 3. Link permanent documentation to the durable source

Update all permanent references so no closed-epic record points into a task folder that will be
deleted:

- update the four US-975/US-979 links in `doc/epics/EPIC-051.md` and
  `doc/epics/completed.md` to point to `doc/architecture/styling-inventory.md`;
- add a pointer to the durable source beside the inventory-count prose in `EPIC-051.md` at the
  US-975 and US-979 notes;
- update `doc/epics/EPIC-052.md` so its exact-list and reverification references use the durable
  source without duplicating its tables;
- add a `Styling inventory` row to the Documentation Map in the root `CLAUDE.md`, which is the
  permanent developer-doc index loaded each session.

Do not add the inventory to `doc/architecture/key-files.md`, `coding-style.md`, or
`uikit/CLAUDE.md`; those files have different ownership and purpose. The architecture document
owns this measured scope.

### 4. Reconcile and validate the move

Run both pinned scans and verify that the durable document still accounts for every result exactly:

- Emotion: 79 files total; 65 eligible static/non-prop, 5 dynamic, 9 superseded; 78 production;
  69 eligible production after the AVGrid exclusion.
- Inline styles: 133 sites across 51 non-story files; area table totals 35/103, 6/18, 3/4,
  6/7, and 1/1.
- `src/renderer/editors/` has zero Emotion imports.
- No listed path is missing from the repository and no path appears in a partition twice.

Use `git diff --check`. No `npm` build or unit tests are required because US-980 changes developer
Confirm `git diff --name-only -- src/` is empty so no renderer source changed, then run
`git diff --check`. No `npm` build or unit tests are required because US-980 changes developer
documentation only and must not change runtime behavior.

### 5. Make cleanup safe

Check all links from the durable document, `EPIC-051.md`, `doc/epics/completed.md`, `EPIC-052.md`,
and `CLAUDE.md`. They must use paths that remain valid after the EPIC-051 task folders are removed.
Do not delete the US-975 or US-979 folders as part of US-980; task-folder cleanup is an
epic-completion action and requires the normal user confirmation.

## Concerns / Open questions

1. **The durable document must outlive the task folders.** US-975 and US-979 are historical records
   that may be deleted when EPIC-051 cleanup is approved. The durable document therefore carries
   both the exact lists and the rationale; it must not depend on either task README for context.

2. **This is a frozen snapshot, not a live report.** The durable document must say prominently that
   it records the 2026-08-18 baseline and is never updated in place. The pinned commands are how a
   reader obtains the current picture after US-981, US-984, or later epics change the source tree.

3. **The Emotion count includes a story; the inline count does not.** This intentional difference
   must remain visible beside the commands. Otherwise a future reader may incorrectly subtract the
   story from both inventories or compare 79 files directly with 51 files.

4. **Indirect inline styles are not resolved by this move.** The durable document must retain the
   explicit boundary around `style={p.style}`, model-provided style objects, and other serialized
   paths. A later inventory or migration task owns those paths; US-980 must not inflate the 133-site
   baseline without a new pinned measurement.

5. **AVGrid and editor ownership are handoffs, not omissions.** The nine UIKit AVGrid files are
   measured but superseded, and the 103 editor inline-style sites remain editor-owned. Keep those
   classifications in the durable document so later work does not reopen already-set scope.

6. **No runtime verification is needed for a docs-only move.** The meaningful checks are path/link
   integrity, scan reconciliation, and diff cleanliness. Running typecheck or lint would add no
   coverage unless the documentation edit accidentally touches source files.

## Acceptance criteria

- [ ] `doc/architecture/styling-inventory.md` is the durable source for both EPIC-051 inventories.
- [ ] The durable document is explicitly marked as a frozen 2026-08-18 snapshot and includes
      self-counting pinned Emotion and inline-style scans.
- [ ] The durable document contains complete, non-overlapping partitions: Emotion 65/5/9 across
      79 files and inline styles 133 sites across 51 files with the five area rows.
- [ ] The dynamic Emotion inputs, three keyframes, infrastructure files, AVGrid exclusion,
      editor ownership boundary, highest-density inline files, and indirect-style boundary are
      preserved.
- [ ] `EPIC-051.md`, `doc/epics/completed.md`, `EPIC-052.md`, and the root `CLAUDE.md` Documentation
      Map link to the durable inventory; no permanent document depends on US-975 or US-979.
- [ ] Both scans reconcile to 79 Emotion files and 133 inline-style sites across 51 files, with
      no duplicate or unlisted path in the durable partitions.
- [ ] `git diff --name-only -- src/` is empty, no package dependency or styling behavior changes
      in US-980, and `git diff --check` passes.

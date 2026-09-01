# US-1274: Clear §1.8 vocabulary residue

Epic: [EPIC-082 — React architecture removal at the call sites](../../epics/EPIC-082.md)

Status: Planned

Baseline: commit `caacc80a` (verified against the current checkout on 2026-09-01)

## Goal

Remove the small set of current renderer vocabulary that still describes native views in React's
terms, while preserving behavior and keeping this cuttable task proportionate. The public scripting
API comments are a separate user-visible part of the work: they must describe what a script author
observes, not how a renderer updates DOM.

## Background

This task is the §1.8 orphan absorbed by EPIC-082 correction 4. It is documentation- and naming-led;
it does not introduce a new state primitive, lifecycle rule, renderer mechanism, test harness, or
editor behavior. The working tree already contains unrelated EPIC-082 changes; this document's
implementation scope is limited to the files and lines listed below.

### Verified source inventory

The exact `loadComponent` count is **16 in `src/renderer/`**:

| Site | Verified use | Planned result |
|---|---|---|
| `src/renderer/ui/secondary-views/secondary-view-registry.ts:34` | `SecondaryViewDefinition.loadComponent` is typed as an async `VanillaViewCtor<SecondaryViewProps>` loader. | Rename the field to `loadView`; describe it as a view loader. |
| `src/renderer/ui/secondary-views/LazySecondaryViewView.ts:67` | `startLoad()` invokes `definition.loadComponent()` before mounting `module.default`. | Invoke `definition.loadView()`; preserve generation/liveness checks and import behavior. |
| `src/renderer/editors/register-editors.ts:15,21,30,41,47,53,59,65,71,77,83,89,96,107` | Thirteen exact-id `register()` definitions plus one `registerPrefix()` definition provide lazy native-view imports. | Rename all fourteen property keys; do not change any literal dynamic-import path. |
| `doc/architecture/secondary-views.md:259,432` | Current developer guidance and its registration example still say `loadComponent`. These two documentation mentions are not part of the 16 renderer-source count. | Update current guidance to `loadView`; leave historical epic records as history. |

The thirteen exact-id registrations and their import targets are:

1. `archive-tree` → `./archive/ArchiveSecondaryView`
2. `explorer` → `./explorer/ExplorerSecondaryView`
3. `search` → `./explorer/SearchSecondaryView`
4. `boards` → `./explorer/BoardsSecondaryView`
5. `link-category` → `./link-editor/panels/LinkCategorySecondaryView`
6. `link-tags` → `./link-editor/panels/LinkTagsSecondaryView`
7. `link-hostnames` → `./link-editor/panels/LinkHostnamesSecondaryView`
8. `notebook-categories` → `./notebook/panels/NotebookCategoriesSecondaryView`
9. `notebook-tags` → `./notebook/panels/NotebookTagsSecondaryView`
10. `rest-panel` → `./rest-client/panels/RestPanelSecondaryView`
11. `git-changes` → `./git-tree/GitPanelSecondaryView`
12. `git-diff-revisions` → `./file-diff/GitDiffRevisionsSecondaryView`
13. `mneme-tree` → `./mneme-root/MnemeTreeSecondaryView`

The four `PageModel` comments verified at `src/renderer/api/pages/PageModel.ts:31,35,38,61`
describe subscriber notifications as a page or editor “re-render.” The native model/view contract
has synchronous state subscribers and explicit `update()` calls; the wording will say that
subscribers are notified and the affected UI repaints/updates.

At `src/renderer/components/file-search/FileSearchModel.ts:62-69`, the decision to keep the large
accumulating rows array outside immer-managed state is correct. `TOneState.update()` would copy the
whole array for every incoming batch, making the search quadratic; only the trailing reason about a
“full re-render” is stale. Keep the immer-copy argument and `resultsVersion` signal unchanged, and
reword only that clause to describe subscriber/view update work.

At `src/renderer/editors/storybook/LivePreview.ts:63-66`, `LivePreviewView` stores one
`StorybookEditorModel`, binds to that model in `onMount()`, and is constructed once by
`StorybookEditorView:78`. `VanillaView.update()` does not rebind a model automatically. The guard
against a different model is therefore a valid lifetime invariant, not a stale React mechanism.
Retain the throw and add a concise comment explaining that a model identity change requires the
parent to replace this view. Do not touch `storyTypes.ts:29`: `defaultProps` is intentionally part
of the Storybook props-table playground.

At `src/renderer/core/utils/performance-janitor.ts:22-28`, the 60-second app-lifetime interval is
documented and self-gating. `src/renderer.ts:8` starts it once; production builds do not emit the
draw island's component-track measures, so the threshold branch is inactive there. Scoping it to a
window that mounted the draw editor would add lifecycle plumbing without improving release behavior.
The recommendation is to **drop item 5's scoping change** and leave this file and its current React
DevTools rationale unchanged.

### Public scripting API caveat

The separate public surface has exactly ten `re-render` comments: nine in
`src/renderer/api/types/ui-log.d.ts:358-445` and one in `src/renderer/api/types/ui.d.ts:6`.
These comments ship as IntelliSense, so they are user-visible documentation. The script-author
wording should say that setting a property updates the displayed progress overlay, grid, text,
Markdown, or Mermaid output in real time. This matches the surrounding `/docs` wording (“property
setters update ... in real-time”) and the scripting guide's “live ... setters” language; it does not
expose a renderer concept.

The current detailed user API page has thirteen stale property-table phrases in
`docs/api/ui-log.md:492-494,542-547,604-605,643-644`. They are a separate `/userdoc` follow-up at
epic close, where the page must be brought into line with the IntelliSense wording. `/userdoc` is
non-optional for EPIC-082 because this task changes the shipped scripting API surface.

### Vocabulary boundaries

The investigation uses exact searches for `loadComponent`, `re-render`/`rerender`, and the scoped
file paths. It does not sweep on `grep -i react`. The 79 correct uses of the house vocabulary
(`reactive`, `TOneState`, and `subscribe`) remain, as do ordinary verbs such as “react to” when they
mean responding to an event. The comments at
`src/renderer/components/tree-provider/TreeProviderViewImpl.ts:371-373` and `:383-386` explicitly
name React as migration history and are the sanctioned style reference; they are not current
mechanism justifications and must remain unchanged.

Historical epic/task records that describe the former React implementation are likewise not residue
in current source and are not sweep targets.

## Implementation Plan

- [x] Rename the secondary-view loader field and its complete source call chain.

  In `src/renderer/ui/secondary-views/secondary-view-registry.ts`, change the
  `SecondaryViewDefinition` property and its description:

  ```ts
  /** Dynamic import of the sidebar component. */
  loadComponent: () => Promise<{ default: VanillaViewCtor<SecondaryViewProps> }>;
  ```

  ```ts
  /** Dynamic import of the sidebar view. */
  loadView: () => Promise<{ default: VanillaViewCtor<SecondaryViewProps> }>;
  ```

  In `src/renderer/ui/secondary-views/LazySecondaryViewView.ts:startLoad`, change only
  `definition.loadComponent()` to `definition.loadView()`. Preserve `panelId`,
  `loadGeneration`, `live`, error handling, `mountPanel()`, and the literal module import paths.

  In `src/renderer/editors/register-editors.ts`, change all 14 loader property keys at the 13
  exact-id registrations and the `registerPrefix(BOARD_SECONDARY_PREFIX, ...)` registration. The
  `id`, labels, icons, registration method, and every literal `import("./...")` target remain
  byte-for-byte equivalent. After the rename, `rg -n 'loadComponent' src/renderer` must return
  no results and `rg -n 'loadView' src/renderer` must report exactly 16 source sites.

  Update the two current documentation sites in `doc/architecture/secondary-views.md`:
  `loadComponent()` in the registry description at `:259` and `loadComponent` in the example at
  `:432`. Do not rewrite old epic records that document the former contract.

- [x] Reword the four `PageModel` comments without changing state, notification, or subscriber
  behavior.

  Current wording in `src/renderer/api/pages/PageModel.ts:31,35,38,61`:

  ```ts
  /** Reactive page-level state — UI subscribes to this for re-render on page changes. */
  /** Current main editor ID — changes on navigation, triggers re-render for editor swap. */
  /* Drives SecondaryViews re-render and the per-page persistence subscription's ... */
  /** Reactive page-level state. UI subscribes directly for re-rendering. */
  ```

  Target wording should name the native consequence, for example:

  ```ts
  /** Reactive page-level state — UI subscribes to this for repaint on page changes. */
  /** Current main editor ID — changes on navigation, notifies subscribers for editor swap. */
  /* Drives the SecondaryViews repaint and the per-page persistence subscription's ... */
  /** Reactive page-level state. UI subscribes directly for repainting. */
  ```

  Keep `reactive`, the state shape, the `version` semantics, and all subscriber wiring unchanged.
  The final wording must contain no `re-render`/`rerender` claim about this native path.

- [x] Reword only the stale reason in the `FileSearchInternalState` comment at
  `src/renderer/components/file-search/FileSearchModel.ts:62-69`.

  Preserve the decision and its accurate immer explanation:

  ```ts
  `TOneState.update` runs immer `produce`, so keeping the accumulating array in state would
  copy the whole array on every arriving batch — quadratic over a large search, on top of
  the full re-render each copy triggers. The rows live in a plain field on the model instead, and
  `resultsVersion` is the cheap signal the view watches.
  ```

  Reword only the final clause, using the model/view behavior rather than React terminology:

  ```ts
  `TOneState.update` runs immer `produce`, so keeping the accumulating array in state would
  copy the whole array on every arriving batch — quadratic over a large search, on top of
  the subscriber and view-update work each copy would trigger. The rows live in a plain field
  on the model instead, and `resultsVersion` is the cheap signal the view watches.
  ```

  Do not move `allResults` into state, remove `resultsVersion`, alter `FileSearchView`, or change
  the result-row pooling and `firstChangedRow` protocol.

- [x] Document the valid fixed-model invariant in `src/renderer/editors/storybook/LivePreview.ts`
  while retaining the guard at `:63-66`.

  Current code:

  ```ts
  protected onUpdate(props: { model: StorybookEditorModel }): void {
      if (props.model !== this.model) {
          throw new Error("Live preview model cannot change after mount.");
      }
  }
  ```

  Planned code:

  ```ts
  /**
   * This view is bound to the model supplied at construction. A model identity change
   * requires the parent to replace the view; updating it cannot rebind that subscription.
   */
  protected onUpdate(props: { model: StorybookEditorModel }): void {
      if (props.model !== this.model) {
          throw new Error("Live preview model cannot change after mount.");
      }
  }
  ```

  The parent path is `StorybookEditorView.onMount():78` → `new LivePreviewView({ model: this.model })`;
  it updates the child from Storybook state, not with a replacement model. Keep the guard, the
  `readonly model`, the one `bind()` in `onMount()`, `defaultProps` preparation, and all story
  teardown/error behavior unchanged. Do not alter `src/renderer/editors/storybook/storyTypes.ts:29`.

- [x] Update the ten public scripting IntelliSense comments as a separately marked public-API step.

  In `src/renderer/api/types/ui-log.d.ts`, replace the nine property comments at `:358-362`,
  `:385,389`, `:418-420`, and `:443-445` with script-author wording. In
  `src/renderer/api/types/ui.d.ts:6`, replace the progress-label wording. Use the same observable
  language already established by the surrounding API comments and `/docs`: setting the property
  updates the visible output in real time. Representative change:

  ```ts
  /** Grid data (array of objects). Setting triggers re-render. */
  data: any[];
  ```

  ```ts
  /** Grid data (array of objects). Setting updates the displayed grid in real time. */
  data: any[];
  ```

  Apply the corresponding nouns precisely: progress overlay label, displayed grid, displayed text,
  rendered Markdown, and rendered Mermaid diagram. Do not describe a renderer, component, render
  phase, or DOM repaint to a script author. Do not change any public property types or runtime
  implementation.

  At epic close, `/userdoc` must update the 13 matching property-table phrases in
  `docs/api/ui-log.md:492-494,542-547,604-605,643-644` to the same script-author wording. This
  task's implementation must not use the user-doc update as a reason to modify unrelated docs.

- [x] Leave `src/renderer/core/utils/performance-janitor.ts` unchanged. The item-5 recommendation
  is to drop the optional window-scoping experiment: the interval is a documented, threshold-gated
  containment for a live producer in the sanctioned draw island, and `src/renderer.ts:8` starts it
  once for the application. No new window registration, draw mount/unmount hook, or timer ownership
  should be introduced by this cuttable task.

- [ ] Run static and runtime verification in proportion to the rename and wording-only changes.
  Static checks must include the exact source inventory, a diff audit proving all dynamic-import
  literals are unchanged, and searches proving the scoped stale phrases are gone. Run the normal
  lint, typecheck, and production build as supplementary checks; do not add unit tests or a test
  harness.

  Runtime verification must open several secondary views through the running app. Exercise at
  least `archive-tree` (Archive), `explorer` (Explorer), `search` (Search), `boards` (Boards),
  `link-category` (Categories), `notebook-categories` (Notebook Categories), `git-changes` (Git),
  and `mneme-tree` (Wiki), and include one of `rest-panel` (Rest) or `git-diff-revisions` (File
  History) if the other task's working-tree state permits it. Also exercise the
  `board-secondary:*` prefix with a throwaway board fixture when available. The complete 13-id
  registration list remains the static acceptance inventory; the runtime set is named so a future
  verifier can reproduce it.

  Create any throwaway archive, board, REST, or other runtime fixture outside `docs/` (prefer a
  temporary workspace path), use it only for the smoke check, and remove it afterwards. Never
  modify a checked-in example under `docs/`.

## Concerns

- **Loader rename completeness and runtime-only failure:** `loadView` is a registry field consumed
  by the asynchronous `LazySecondaryViewView.startLoad()` path. A compiler can miss a stale dynamic
  registry object or a key used only after a panel is opened. The 16-site source count, unchanged
  literal import paths, and running-app secondary-view checks are all required. A partial rename is
  unacceptable.

- **Registration targets overlap other work:** two unchanged import targets in
  `register-editors.ts` enter protected areas: `./rest-client/panels/RestPanelSecondaryView` and
  `./file-diff/GitDiffRevisionsSecondaryView`. This task changes only the loader key in the shared
  registration file, not either target directory. If US-1269 or US-1270 is still being rebased or
  modifies that registration file, sequence this mechanical rename after that change and re-run
  the 16-site audit; do not edit the protected files to resolve a conflict. The same rule applies
  to the explicitly protected graph, tree-provider, settings, and file-diff paths listed below.

- **Public API wording is not an internal-comment sweep:** the ten `.d.ts` comments are shipped to
  script authors. The current `/docs` page already explains live property setters in user language,
  but its 13 property tables still say “re-render.” `/userdoc` must run over this task at epic close,
  and the epic must not close with those two public descriptions disagreeing.

- **House vocabulary must survive:** do not replace `reactive`, `TOneState`, `subscribe`, or other
  accurate state terminology merely because a broad case-insensitive React search finds it. Do not
  change the two `TreeProviderViewImpl` comments at `:371-373` and `:383-386`; their explicit React
  wording records migration history and is the approved style for historical explanation.

- **Storybook contract:** `defaultProps` at `src/renderer/editors/storybook/storyTypes.ts:29` is
  intentional inside the Storybook props-table playground. The LivePreview change documents the
  existing fixed-model contract only; it must not remove the props-table defaulting or redesign
  story prop preparation.

- **Janitor scope:** no scoping change is recommended. If implementation pressure requires cutting
  an item, this is the first item to drop, because it is already self-gating and its current React
  reference describes an active dev-only producer in the sanctioned island. Preserve the current
  safety behavior and document this recommendation in the implementation result.

- **Protected files and no test additions:** do not touch anything under `src/renderer/uikit/`, or
  `src/renderer/editors/graph/GraphDetailPanelView.ts`, `GraphBodyView.ts`,
  `GraphLegendPanelView.ts`, `src/renderer/editors/rest-client/**`,
  `src/renderer/components/tree-provider/**`, `src/renderer/editors/category/CategoryEditor.ts`,
  `src/renderer/editors/env-vars/EnvVarsBodyView.ts`, or the settings/file-diff files named by
  EPIC-082. Do not write unit tests or test harnesses.

No implementation question remains: rename all 16 renderer-source sites, reword the four page
comments and one File Search reason, retain and document the LivePreview guard, reword the ten
public IntelliSense comments, and leave the janitor unchanged.

## Acceptance Criteria

- [ ] `src/renderer/` contains exactly 16 `loadView` sites corresponding to the 13 exact-id
  registrations, the one `board-secondary:` prefix registration, the registry field, and the lazy
  loader call; it contains zero `loadComponent` sites. The 13 exact-id IDs and all literal dynamic
  import targets listed in Background are accounted for, with no key or path drift.
- [ ] `doc/architecture/secondary-views.md:259,432` uses `loadView`; historical epic/task records
  remain unchanged and are not mistaken for current source.
- [ ] `PageModel.ts` has no `re-render`/`rerender` wording at the four verified comment sites; the
  page state shape, version bumps, subscriber wiring, and runtime behavior are unchanged.
- [ ] `FileSearchModel.ts` still keeps rows off immer-managed state, still explains the whole-array
  copy cost and `resultsVersion` signal, and no longer uses “full re-render” as the reason.
- [ ] `LivePreview.ts` retains the model-identity throw and adds only the fixed-model invariant
  documentation. Story selection, prop updates, error handling, and child disposal remain intact.
- [ ] `storyTypes.ts:29` and all Storybook `defaultProps` declarations remain unchanged.
- [ ] The ten `re-render` comments in `src/renderer/api/types/ui-log.d.ts` and `ui.d.ts` are written
  for script authors using observable “updates ... in real time” language; no public type or runtime
  API changes. At epic close, `/userdoc` updates the 13 matching `docs/api/ui-log.md` table phrases.
- [ ] `performance-janitor.ts` and its startup call remain unchanged; the result records the
  recommendation to drop optional window scoping from this cuttable task.
- [ ] Running-app verification opens and successfully loads several named secondary views, including
  the Archive, Explorer/Search, Link, Notebook, Git, and Mneme registrations, and exercises the
  prefix registration when a throwaway board fixture is used. No lazy-load error appears after
  switching among panels.
- [ ] Any runtime fixture is created outside `docs/`, removed afterward, and no checked-in file under
  `docs/` is modified.
- [ ] Lint, typecheck, and production build pass as supplementary evidence. No unit tests or test
  harnesses are added.
- [ ] No file under `src/renderer/uikit/` or any EPIC-082 protected path is changed, including the
  sanctioned React-history comments in `TreeProviderViewImpl.ts`.
- [ ] `doc/active-work.md` links its existing US-1274 dashboard row to this README, and the EPIC-082
  task table links its existing US-1274 row to this README while retaining `[ ]` / Planned status.

## Files Changed Summary

| File | Planned change | Scope |
|---|---|---|
| `src/renderer/ui/secondary-views/secondary-view-registry.ts` | Rename `SecondaryViewDefinition.loadComponent` to `loadView`; describe the loader as a view loader. | Implementation |
| `src/renderer/ui/secondary-views/LazySecondaryViewView.ts` | Invoke `definition.loadView()` from `startLoad()`. | Implementation |
| `src/renderer/editors/register-editors.ts` | Rename all 14 lazy-loader keys; preserve all 13 IDs, the prefix registration, and literal import paths. | Implementation |
| `doc/architecture/secondary-views.md` | Update the two current `loadComponent` references to `loadView`. | Developer documentation |
| `src/renderer/api/pages/PageModel.ts` | Reword four subscriber/repaint comments only. | Wording-only implementation |
| `src/renderer/components/file-search/FileSearchModel.ts` | Reword the stale full-render reason only; keep rows off reactive state. | Wording-only implementation |
| `src/renderer/editors/storybook/LivePreview.ts` | Add the fixed-model invariant documentation; retain the guard and behavior. | Wording-only implementation |
| `src/renderer/api/types/ui-log.d.ts` | Reword nine public IntelliSense comments for script authors. | Public API documentation |
| `src/renderer/api/types/ui.d.ts` | Reword the public progress-label IntelliSense comment. | Public API documentation |
| `docs/api/ui-log.md` | Update 13 property-table phrases at epic close through mandatory `/userdoc`; not an implementation edit in this task. | Epic-close user documentation |
| `doc/active-work.md` | Link the existing US-1274 dashboard row to this README. | Dashboard link |
| `doc/epics/EPIC-082.md` | Link the existing US-1274 row to this README. | Epic link |
| `doc/tasks/US-1274-vocabulary-residue/README.md` | Record verified scope, decisions, implementation plan, concerns, and acceptance criteria. | This task document |

Files that need **no changes** in US-1274:

- `src/renderer/core/utils/performance-janitor.ts` and `src/renderer.ts` — the janitor is retained
  unchanged; item 5's optional scoping is explicitly dropped.
- `src/renderer/editors/storybook/storyTypes.ts` and all Storybook story files — `defaultProps` is
  deliberate in this props-table playground.
- Every file under `src/renderer/uikit/`, including `uikit/Progress/progressModel.ts` and any
  other files whose generic comments contain “re-render”; the hard constraint wins over a broad
  vocabulary search.
- `src/renderer/components/tree-provider/TreeProviderViewImpl.ts`, especially its two sanctioned
  React-history comments at `:371-373` and `:383-386`.
- `src/renderer/editors/graph/**`, `src/renderer/editors/rest-client/**`,
  `src/renderer/components/tree-provider/**`, `src/renderer/editors/category/CategoryEditor.ts`,
  `src/renderer/editors/env-vars/EnvVarsBodyView.ts`, and the EPIC-082 settings/file-diff files;
  the loader registration may name some of their lazy modules, but their implementations are not
  edit targets.
- Historical records such as `doc/epics/EPIC-016.md`, `EPIC-058.md`, `EPIC-059.md`, `EPIC-063.md`,
  and `doc/de-react-refactoring-2.md`; they preserve historical terminology and baseline findings.
- Any test, fixture, harness, or checked-in example under `docs/`; runtime checks use throwaway files
  outside `docs/` and add no test infrastructure.

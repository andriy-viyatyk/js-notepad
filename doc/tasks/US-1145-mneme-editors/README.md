# US-1145 — Mneme root and config native editor bodies

**Epic:** [EPIC-071](../../epics/EPIC-071.md), task 4 (E13 De-React)
**Status:** investigation / implementation plan

## Goal

Move `mneme-root` and `mneme-config` from the `EditorModule.Component` arm to
`EditorModule.View` using native `VanillaView` classes. Preserve the current editor behavior and
DOM surface while making lifecycle ownership, conditional-child retirement, and source
subscriptions explicit.

This document is an investigation and implementation plan only. It proposes no implementation,
unit tests, or test harnesses. The dashboard is intentionally unchanged.

## Background

EPIC-071 §E13-4 places these two Component-arm editors in the same conversion cut. The measured
scope below is carried from that epic after verifying the complete JSX-bearing-file inventory;
the line and marker totals are not re-derived here:

| Editor | JSX-bearing files | Lines | JSX markers | React `createElement` |
|---|---:|---:|---:|---:|
| `mneme-config` | 3 | 589 | 114 | 0 |
| `mneme-root` | 2 | 286 | 41 | 0 |

The JSX-bearing files are `MnemeConfigView.tsx`, `RootsPanel.tsx`, and `ModelPanel.tsx` for
`mneme-config`, plus `MnemeRootEditorView.tsx` and `index.tsx` for `mneme-root`. The source search
found the two root-editor hook invocations requested by the epic (`useState` ×1 and `useMemo` ×1,
each appearing twice textually because the import is counted) and the config view's `useEffect` ×1
(also two textual occurrences including its import). There is no second `useEffect` invocation in
this editor folder. There are no React `createElement` calls in either editor. The detailed hook
audit below is authoritative for the source currently present.

The conversion should reuse US-1144's established direct-root pattern: public native view classes,
direct UIKit helpers/views, replaceable subscriptions for changing sources, and explicit retirement
of conditional children.

The governing earlier findings are explicit in `doc/epics/EPIC-071.md`: §E13-7 requires a live
caller for every ported memo/callback, rejects permanent `bind()` subscriptions for changing
sources, and calls out persistent-child side effects (`:310-365`); §E13-8 keeps API expansion and
test-harness work out of this cut (`:366-424`); and §E13-11 confirms the constructor/ownership
guard, replaceable subscriptions, state-dependent root measurements, and US-1144's conversion
pattern (`:425-616`). The baseline task records the two unresolved routes and the structure-only
digest requirement for these editors (`doc/tasks/US-1151-e13-baseline/README.md:185-187,214-215`).

## Verified source inventory

### `mneme-root`

`MnemeRootEditorView.tsx` defines one React body function, `MnemeRootEditorView`, at
`src/renderer/editors/mneme-root/MnemeRootEditorView.tsx:31-252`. The JSX-free registration wrapper
`MnemeRootEditorComponent` is in `index.tsx:11-13`; the module registers it on `Component` at
`index.tsx:15-19`. The native replacement is one public `MnemeRootEditorView extends VanillaView`
class, registered directly on `View`; no `TextChromeView` is required because the current body is
already the direct page root.

The existing render reads the model state at `MnemeRootEditorView.tsx:32-48`, derives busy and the
selected mode at `50-51`, and produces the direct root `Panel` at `80-250`. The native view must
retain the same root and all names/semantic UIKit props while moving state reads and updates into
an explicit subscription/render path.

### `mneme-config`

`MnemeConfigView.tsx:29-129` defines the main body and `:131-133` defines its registration wrapper.
`RootsPanel.tsx:53-96`, `:98-228`, and `:230-342` define `RootsPanel`, `RootRow`, and
`FiltersEditor`; `RootRowModel` and `FiltersEditorModel` are React-only model wrappers at
`RootsPanel.tsx:23-25` and `:46-51`. `ModelPanel.tsx:13-109` defines `ModelPanel`. The native
replacement should make the editor view own the root, status header, `ModelPanelView`, and
`RootsPanelView`, with per-root `RootRowView` and `FiltersEditorView` children where their
conditional lifetimes require ownership.

The main config body reads `model.state.use()` at `MnemeConfigView.tsx:30`, computes connection and
model readiness at `31-32`, and conditionally renders the stopped state (`39-55`) or connected
layout (`57-127`). `RootsPanel` reads model state at `RootsPanel.tsx:54-56`; `RootRow` reads it at
`98-114` and uses a `RootRowModel` plus its expanded state at `100-101`; `FiltersEditor` reads state
and its local model at `230-241`. `ModelPanel` reads state at `ModelPanel.tsx:14-18`. These reads must
be replaced with fields plus an owned model-state subscription rather than React hooks.

## Hook and component lifecycle audit

### `mneme-root`

| Current unit | Evidence | Native destination and live caller |
|---|---|---|
| `MnemeRootEditorView` | `MnemeRootEditorView.tsx:31-252` | Public `VanillaView` editor root; model-state subscription installed in `onMount`, replaced in `onUpdate` if the model identity changes, and unsubscribed in `onDispose`. |
| `model.state.use` projection | `:32-48` | One explicit state subscription updates the direct controls, conditional regions, and result view. The projection must describe the `MnemeRootEditorState` fields rendered by the JSX. |
| `useMemo(resultsMarkdown)` | `:55` | Synchronous `resultsToMarkdown(state.results)` recomputation in the result update path. Its required live caller is the `MarkdownBlock` JSX at `:246`; after conversion this must be an actual `MarkdownBlockView.update({ content: resultsMarkdown, compact: true, highlightText: searchQuery })` call, not an unused cached method. |
| `useState(filtersOpen)` | `:59` | `filtersOpen` becomes a view field initialized to `false`; `toggleFilters` at `:65-69` becomes a view method. Its live caller is the `mneme-filters-toggle` Button at `:117-124`, and opening still calls `model.loadTagVocab()`. |
| `handleKeyDown` | `:73-78` | Native `KeyboardEvent` listener on `TextareaView` in `onMount`/the filter-control branch; Enter without Shift calls `model.runSearch()`. The listener belongs to the owned textarea view and is removed with that view. |
| `MarkdownBlock` React face | import `:11`, JSX use `:246` | Replace with the existing `MarkdownBlockView` native view. It is not deleted: the React face still has live callers in `src/renderer/editors/mcp-inspector/McpInspectorView.tsx:23,388` and `ResourceContentView.tsx:5,86`. |
| UIKit JSX faces | imports `:2-10`, uses throughout `:80-250` | Construct `Panel`/`Text` DOM helpers and `TextareaView`, `SelectView`, `ButtonView`, `SpinnerView`, `TagsInputView`, and `DateInputView` directly. No UIKit face is deleted by this task. |

There are no `useCallback` invocations in this editor. The textual `useState` and `useMemo` counts
are two each because each import and invocation is present; the invocation audit above is the
behavioral count. `resultsMarkdown` has one named live caller, which is an acceptance criterion.

### `mneme-config`

| Current unit | Evidence | Native destination and lifecycle |
|---|---|---|
| `MnemeConfigView` | `MnemeConfigView.tsx:29-129` | `MnemeConfigEditorView`, a public native root. Build stable root resources in the constructor; create/mount children in `onMount`; pump state and replace conditional regions in the state subscription/update path. |
| `MnemeConfigEditorComponent` | `MnemeConfigView.tsx:131-133` | Delete the React adapter; `index.ts` registers `MnemeConfigEditorView` on `View`. |
| `useEffect` | import `MnemeConfigView.tsx:1`, invocation `:34-37` | Replace with the root's model-state subscription. On a connected transition, call `model.loadIndexInventory()`; install the subscription in `onMount`, replace it in `onUpdate` when the model identity changes, and unsubscribe in `onDispose`. Guard async work against a disposed or superseded model. |
| Main `model.state.use()` | `:30` | The explicit subscription drives running/disconnected content, connection-error and model-health branches, toolbar values, and child updates. |
| `RootsPanel` | `RootsPanel.tsx:53-96` | `RootsPanelView`; own a keyed collection of `RootRowView`s by the TypeScript `WikiRootStatus.name` key, removing and disposing rows absent from the latest `WikiStatus.roots`. |
| `RootRow` | `RootsPanel.tsx:98-228` | `RootRowView`; keep `expanded` as a view field, and update from the parent’s current `WikiRootStatus`, `reindexProgress`, `rootConfigs`, and `staleIndexes` projections. `toggleFilters` at `:116-120` remains live through the Filters button at `:148-150`. |
| `RootRowModel` / `useComponentModel` | `RootsPanel.tsx:23-25`, `:100-101` | Remove the React-only model wrapper. The sole `expanded` value is view-owned; the parent must not retain a collapsed `FiltersEditorView`. |
| `FiltersEditor` | `RootsPanel.tsx:230-342` | `FiltersEditorView`, owned only while its row is expanded. Its include/ignore arrays and drafts become view fields; `addGlob`, `removeGlob`, `apply`, and `reset` become methods called by the native Tag/Input/Button children at the corresponding JSX sites. |
| `FiltersEditorModel` / `useComponentModel` | `RootsPanel.tsx:46-51`, `:233-241` | Remove the React-only model wrapper. If a native subscription is used for the selected `WikiRootConfig`, replace it when the root key changes; do not bind a changing root identity permanently. |
| `ModelPanel` | `ModelPanel.tsx:13-109` | `ModelPanelView`; update from `WikiStatus.model`, `WikiModelDownload`, and `isModelReady`. The per-file `WikiModelFile[]` rows are reconciled by `filename`. |
| `EditorToolbar` React face | import/use `MnemeConfigView.tsx:8`, `:60-102` | Construct `EditorToolbarView` directly. The React wrapper remains live for `browser` and `mcp-inspector` (`BrowserView.tsx:3,421` and `McpInspectorView.tsx:13,107`), so it is not a zero-caller deletion. |

There are no `useState`, `useMemo`, or `useCallback` invocations in `mneme-config`; its two textual
`useEffect` occurrences are the import and the one invocation above. `RootsPanel`'s two
`useComponentModel` uses are also covered because they carry state that React previously destroyed
when the corresponding subtree unmounted.

### `bind()` decisions

The native plan must not use `bind()` for the model-state subscriptions described above. The
registered source is `props.model.state`, whose identity can change when the adapter updates the
view; `bind()` registers cleanup only through `own()` and has no early-release operation. A
replaceable `stateSubscription` field must unsubscribe the old model before subscribing to the new
one in `onUpdate`, with an identity guard in each callback. The same rule applies to any
`model.state` selector scoped to a selected root key or to a selected model/file projection: replace
that subscription when the key/source changes. `own()` is still appropriate for subscriptions whose
source is fixed for the complete view lifetime, and for the final disposer of the active replacement
slot; it is not a substitute for early release of a changing source.

## Before → after registration shape

```tsx
// Before: src/renderer/editors/mneme-root/index.tsx:11-18
function MnemeRootEditorComponent({ model }: { model: EditorModel }) {
    return <MnemeRootEditorView model={model as MnemeRootEditorModel} />;
}
// ...
Component: MnemeRootEditorComponent,
```

```ts
// After: proposed native registration
export const mnemeRootModule: EditorModule = {
    createEditor: () => new MnemeRootEditorModel(/* existing typed state */),
    View: MnemeRootEditorView,
};
```

Apply the same `Component` → `View` change to `mnemeConfigModule` (`index.ts:13-17`), preserving
`createEditor`, the config page id, and the existing model/type exports. The public native
constructor must validate the incoming `EditorModel` type before using Mneme-specific state.

## UIKit face and non-UIKit caller audit

The complete value-use search checked both JSX tags and `createElement(Face, ...)` arguments. No
`React.createElement` or `createElement` call occurs in either editor folder, so every face below is
held by a JSX value use. The `mneme-config` `ProgressBar` face has exactly the two importers named
in the source: `ModelPanel.tsx:5,55` and `RootsPanel.tsx:8,185`.

| Face | Value callers in these editors | Last caller within these two editors after conversion? | Other renderer value callers after this conversion |
|---|---|---:|---|
| `ProgressBar` | `ModelPanel.tsx:55-58`; `RootsPanel.tsx:185-188` | **Yes** | No other non-story React-face value caller found; `ProgressBarView` is used directly by `board-info` and `log-view`. UIKit face retained for US-1149/US-1150; do not delete here. |
| `Divider` | `RootsPanel.tsx:293` | **Yes** | `mcp-inspector` and `settings` still use the React face. |
| `Tag` | `RootsPanel.tsx:297`, `316` | **Yes** | `mcp-inspector` and `link-editor/LinkTooltip.tsx` still use it. |
| `Dot` | `MnemeConfigView.tsx:42`, `71`, `114`; `RootsPanel.tsx:145`; `ModelPanel.tsx:35`, `73`, `82` | **Yes** | `settings`, `browser`, `board`, `mcp-inspector`, and other existing consumers remain. |
| `Spacer` | `MnemeConfigView.tsx:86`; `RootsPanel.tsx:136` | **Yes** | `mcp-inspector`, `browser`, `rest-client`, and shared native chrome remain. |
| `Spinner` | `MnemeRootEditorView.tsx:209` | No | `browser`, `draw`, and `graph` retain React-face value callers. |
| `Textarea` | `MnemeRootEditorView.tsx:94` | No | `settings`, `rest-client`, and `mcp-inspector` retain React-face value callers. |
| `Select` | `MnemeRootEditorView.tsx:107` | No | `settings`, `mcp-inspector`, and `graph` retain React-face value callers. |
| `TagsInput` | `MnemeRootEditorView.tsx:140`, `152` | No | No other non-story React-face value caller found; native `TagsInputView` is used elsewhere. Retain the UIKit face for the later collection/type-relocation work. |
| `DateInput` | `MnemeRootEditorView.tsx:167`, `178` | No | No other non-story React-face value caller found; retain it for the later collection/type-relocation work. |
| `Panel`, `Text`, `Button` | Multiple JSX uses in both editors | No | Each has callers across several remaining renderer editors and/or native consumers. |

The native implementation must use the corresponding `*View` classes and direct helpers, and must
not delete any file under `src/renderer/uikit/`. The exact five E13-4 hand-off faces held by
`mneme-config` (`ProgressBar`, `Divider`, `Tag`, `Dot`, and `Spacer`) all lose their last value
caller within this two-editor conversion; their wider caller status is recorded above for US-1149.

### Non-UIKit React faces and `mountVanilla` leftovers

The non-UIKit React imports were searched across `src/renderer`, excluding stories and the face's
own file:

| Face | Import/use in these editors | Other callers found | Action |
|---|---|---|---|
| `EditorToolbar` (`src/renderer/editors/base/EditorToolbar.ts`) | `MnemeConfigView.tsx:8,60-102` | `browser/BrowserView.tsx:3,421` and `mcp-inspector/McpInspectorView.tsx:13,107` | Use `EditorToolbarView` directly; keep the React face and its `base/index.ts:28-29` re-export. |
| `MarkdownBlock` (`src/renderer/editors/markdown/MarkdownBlock.ts`) | `MnemeRootEditorView.tsx:11,246` | `mcp-inspector/McpInspectorView.tsx:23,388` and `mcp-inspector/ResourceContentView.tsx:5,86` | Use `MarkdownBlockView` directly; keep the React face and `markdown/index.ts:208-209` re-export. |
| `MnemeConfigView`, `RootsPanel`, `ModelPanel`, `MnemeRootEditorView` | Local definitions imported only by their own current registration/body files | None outside the two editor folders | Remove the old React definitions while renaming/replacing their implementation files with native views; they are not independent `mountVanilla` faces to delete. |

No non-UIKit `mountVanilla` face reaches zero callers from this conversion, and no dead non-UIKit
barrel re-export was found. The UIKit zero-caller results are deliberately hand-off findings only;
US-1149/US-1150 owns their deletion or type relocation.

## Opening routes

Both editors are standalone and reject generic `addEditorPage`: `PagesLifecycleModel.ts:274-277`
throws for an editor definition without a content host. `mneme-config` has an internal opener at
`PagesModel.ts:271`, but the script-facing page wrapper has no `showMnemeConfigPage` declaration
(`src/renderer/api/types/pages.d.ts:97-123`). The clickable route for the implementation-time
baseline is the visible `span[data-name="mneme-indicator"]`: `MainPageView.ts:187-196` builds it,
and `MainPageView.ts:193` calls `pagesModel.showMnemeConfigPage()`. The same config opener is also
the `Mneme` row in the sidebar Tools & Editors registry (`ui/sidebar/tools-editors-registry.ts:164-167`).
The indicator itself is implemented in `src/renderer/ui/app/MainPageView.ts`, not in
`src/renderer/ui/sidebar/`.

`mneme-root` has no dedicated opener on `PagesModel` or the script wrapper. Its clickable route is
the existing Mneme tree entry in the Explorer secondary view: `ExplorerSecondaryView.ts:332-342`
creates the visible `explorer-open-mneme` trailing button and sends the typed
`encodeMnemeFolderLink(fpDirname(item.href))` through `openRawLink`. The route must be exercised
from a visible Mneme tree entry without recording its root path, title, note, or file contents.
This is also consistent with the model's documented entry path at
`MnemeRootEditorModel.ts:119-126`. Baseline and post-conversion digests must query structure only.

## Conditional branches and persistent-child hazard

React removed these subtrees automatically. Native code must explicitly retire a branch when its
condition becomes false if the branch owns listeners, subscriptions, async work, or a nested view;
plain text-only regions may be replaced in a region owned outright by the parent.

### `mneme-root`

| Branch | Evidence | Native lifetime decision |
|---|---|---|
| Filters open/closed | `MnemeRootEditorView.tsx:136-201`, controlled by `useState` at `:59` | **Destroy when closed.** The branch owns `TagsInputView` and `DateInputView` controls and their event/listener state. Create the filter view/children only on open, dispose and detach it on close; the model's lazy `loadTagVocab()` may finish independently but must not update a disposed view. |
| Status strip present/absent | `:205-220` | **Replace/remove when absent.** Retire `SpinnerView` and its text region when neither searching nor an error/note is present. It may use a parent-owned replacement region, but no stale spinner or status text may remain mounted. |
| Initial/error, not-searched, empty-results, or markdown-results arm | `:224-248` | **Destroy the previous arm before installing the next.** The markdown arm owns `MarkdownBlockView`, whose lookup/transient-view lifecycle must end when results are replaced by a message arm. The `resultsMarkdown` memo's replacement is consumed by the live `MarkdownBlockView` update on the results arm. |

The `results` collection itself is model state (`MnemeRootEditorState.results`), not a view-owned
data cache. `resultsToMarkdown` remains a pure typed transformation and must be called by the
state-driven update path before the native Markdown view is updated.

### `mneme-config`

| Branch | Evidence | Native lifetime decision |
|---|---|---|
| Not running vs running page | `MnemeConfigView.tsx:39-55` vs `:57-127` | **Retire the old page branch.** The stopped branch's controls and the running branch's toolbar/panels must not coexist when `running` changes. Rebuild through an owned root region, preserving the stable `mneme-config-root` marker. |
| Connection error strip | `:104-109` | **Remove when false.** It has no independent async owner, so a view-owned replacement region is sufficient. |
| Connected/model-health warning strips | `:111-120` | **Remove when false.** These are text/Dot display branches only; update/rebuild the owned region and do not leave stale warning DOM. |
| Roots empty message vs keyed root rows | `RootsPanel.tsx:86-92` | **Reconcile and retire.** Remove the empty message when rows exist, and dispose each `RootRowView` whose `WikiRootStatus.name` key leaves the latest `WikiStatus.roots`. Do not keep detached rows with reindex or config controls alive. |
| Root reindexing button arm | `:151-170` | **Replace or safely update the ButtonView.** The Cancel and Reindex actions are mutually exclusive. A single same-type ButtonView may be updated if its old handler/disabled/label are fully replaced; otherwise release the old branch before mounting the new one. |
| Per-root progress row | `:182-195` | **Destroy when no progress.** Its ProgressBar and progress label must not stay mounted after manual/background progress disappears. |
| Background error text | `:197-201` | **Remove when false.** It is a parent-owned text region without an independent side effect. |
| Stale-index list | `:203-223` | **Keyed reconcile and retire removed entries.** Each removed stale-index row must release its Delete button and DOM; do not retain a detached row merely because the index inventory was previously present. |
| Expanded FiltersEditor vs collapsed row | `:225` | **Destroy when collapsed.** `FiltersEditorView` owns inputs, Tags, and button listeners; retaining it would keep the React-unmounted subtree's interactions and local draft state live. |
| Filters loading vs loaded editor | `:247-253` vs `:291-340` | **Replace the branch.** When the selected `WikiRootConfig` arrives, remove the loading view before creating the editor controls. |
| Include/ignore tag arrays | `:296-318` | **Keyed reconcile and release removed TagViews.** A removed glob must not leave its `onRemove` listener or detached child view registered. |
| Model download/progress branch | `ModelPanel.tsx:51-69` | **Destroy when inactive.** The progress branch is shown for active download or error; retaining it while the condition is false would keep the child mounted and its side effects live, precisely the persistent-child hazard called out by EPIC-068 §E13-7.6. Recreate/update it for a new `WikiModelDownload` state and release it when absent/inactive. |
| No model vs model details | `ModelPanel.tsx:71-105` | **Replace the exclusive arm.** Remove the no-model warning when `WikiStatus.model` appears, and remove the model details when it disappears. Reconcile the `WikiModelFile[]` rows by the TypeScript `filename` key. |
| Model warning in header | `:33-37` | **Remove when ready or downloading.** This is a display-only child region; it must not remain visible after `isModelReady`/download state changes. |

The config model already owns its Mneme connection/IPC subscriptions and polling lifecycle in
`MnemeConfigEditorModel.ts:89-104`, `:228-264`, and `:558-566`; the native view must not duplicate
or dispose the shared `mnemeConnection`. The view owns only the DOM children and its replaceable
model-state subscription.

The remaining conditional expressions are display updates within the owned regions, not additional
long-lived children: root mode fallback and filter-count calculations (`MnemeRootEditorView.tsx:51,
60-63`), the root-name placeholder and filter-button icon/label (`:104,120-124`), and the active
filter summary (`:188-195`) update in place; the status/search/result lifetime decisions are listed
above. Config's connection label and optional URL (`MnemeConfigView.tsx:73-85`), the reindex button
label and progress values (`RootsPanel.tsx:151-170,182-195`), and model/download/file status text
(`ModelPanel.tsx:42-65,82-96`) update in place inside the branches already covered above. The
registration factory's optional `filePath` and decoded-link guards (`mneme-root/index.tsx:19-25`)
select model initialization rather than mounting a child and require no separate view lifetime.

## Constraint audit

- **Colors:** No hardcoded hex, `rgb()`, `rgba()`, or named CSS color literal was found in either
  editor's JSX/source. The UI uses semantic UIKit color props (`neutral`, `light`, `warning`,
  `error`, and `success`) at the lines cited above. Both editor models use the existing
  `MEMORY_ICON_COLOR` token from `src/renderer/theme/palette-colors.ts` for their tab icon
  (`MnemeRootEditorModel.ts:3,147` and `MnemeConfigEditorModel.ts:5,554`); preserve that token and
  add no literal color in native code.
- **Filesystem/path access:** No `require(...)`, `require("path")`, or `require("fs")` occurs in
  either editor folder. `MnemeConfigEditorModel.ts:8-11,450-510` uses the approved `app.fs` API
  and `fpJoin`/`fpBasename` utilities; retain that model boundary and do not introduce direct
  Node filesystem/path calls in the view.
- **Error stringification:** No hand-rolled `e instanceof Error ? e.message : String(e)` pattern
  occurs. Config model user-visible catches use `errMessage(err)` at
  `MnemeConfigEditorModel.ts:130,169,219,301,319,358,398,421,444,510`; root model catches use
  fixed safe fallback messages at `MnemeRootEditorModel.ts:275,336,379` with no value stringification.
  Any new user-visible catch in the native views must use `errMessage` from
  `src/shared/utils.ts`, while best-effort cleanup may remain silent.
- **React construction:** The complete `React.createElement`/`createElement` search is empty in
  both editors. The native files must not reintroduce a React boundary; `MarkdownBlockView` is the
  direct native replacement for the existing `MarkdownBlock` wrapper.

## Implementation Plan

1. **Convert the root editor body.** Rename
   `src/renderer/editors/mneme-root/MnemeRootEditorView.tsx` to `.ts` and replace the function
   with a public `MnemeRootEditorView extends VanillaView<{ model: EditorModel }>` (or an equivalent
   public native class). Validate `MnemeRootEditorModel` in the constructor, create the stable root,
   and use the direct native counterparts for every current UIKit face. Replace `MarkdownBlock`
   with a claimed and mounted `MarkdownBlockView`; do not use `mountVanilla`.
2. **Port root state and branches.** Rename
   `src/renderer/editors/mneme-root/index.tsx` to `index.ts`, remove
   `MnemeRootEditorComponent`, and register `View: MnemeRootEditorView`. Install a replaceable
   model-state subscription in `onMount`, update the view on state changes and model replacement,
   and release it in `onDispose`. Lift `filtersOpen` to a view field; call `resultsToMarkdown` in
   the same state-driven path that updates the live `MarkdownBlockView`. Mount and retire the filter,
   status, and result-arm children according to the branch table above.
3. **Convert the config body and panels.** Rename
   `src/renderer/editors/mneme-config/MnemeConfigView.tsx`, `RootsPanel.tsx`, and `ModelPanel.tsx`
   to `.ts` native implementations. Replace `MnemeConfigEditorComponent`, `RootsPanel`,
   `RootRow`, `FiltersEditor`, and `ModelPanel` with public or internally owned native view
   classes. Use the existing model commands (`restartMneme`, `loadIndexInventory`, `addRoot`,
   `reindex`, `getRootConfig`, `setRootConfig`, `updateModel`, and related methods) rather than
   duplicating side effects in views.
4. **Port config state and conditional ownership.** Keep one parent model-state projection and
   pump child views from it. Use keyed reconciliation by the TypeScript keys
   `WikiRootStatus.name`, `StaleIndexEntry.path`, `WikiModelFile.filename`, and glob strings where
   the current JSX supplies keys. Implement the `useEffect` behavior as a connected-transition
   action that loads index inventory, using a replaceable source subscription because the model
   prop may change. Ensure the `ModelPanel` download branch is actually released when inactive.
5. **Register the config native view.** Keep
   `src/renderer/editors/mneme-config/index.ts` as TypeScript, remove its
   `MnemeConfigEditorComponent` import and `Component` field, and set `View` to the validated
   native editor constructor. Preserve `MNEME_CONFIG_PAGE_ID`, `createEditor`, and model/type
   exports.
6. **Compose direct DOM under the UIKit lifecycle contract.** Import the direct helper/view modules
   and their co-located styles at the native view boundary. The root conversion needs the panel,
   text, textarea, select, button, spinner, tags-input, date-input, and Markdown styles. The
   config conversion needs panel, text, button, icon-button, spacer, dot, progress-bar, divider,
   and editor-toolbar dependencies. Constructors may create stable roots and call `this.child(...)`
   to claim ownership, but must not install listeners/subscriptions, measure layout, start timers,
   or touch an `onMount`-only field. Mount each claimed child exactly once in `onMount`; clear DOM
   references in `onDispose`.
7. **Capture implementation-time UI digests through the verified routes.** Before changing each
   editor, open config through `span[data-name="mneme-indicator"]` and root through the existing
   `explorer-open-mneme` Mneme-tree action. Capture structure only: root/slot counts, tag and
   `data-name` markers, visible branch state, and `emptySvgs`. Repeat after conversion in the same
   activation and branch state. Report every root count with the state measured (connection/running
   state, resolved/unresolved root state, filter/search branch, and visible editor set); never record
   text content, root paths, note titles, or configuration values. Do not add an opener or use
   `addEditorPage`, and do not run `npm run build-prod`.

### Required before → after hook translation

```tsx
// Before: src/renderer/editors/mneme-config/MnemeConfigView.tsx:34-37
useEffect(() => {
    if (connected) void model.loadIndexInventory();
}, [connected]);
```

```ts
// After: native view outline
protected onMount(): void {
    this.subscribeToModel(this.model);
    this.sync(this.model.state.get());
}

protected onUpdate(props: { model: EditorModel }): void {
    if (props.model !== this.model) this.replaceModelSubscription(props.model);
    this.sync(this.model.state.get());
}
```

`subscribeToModel` must trigger `loadIndexInventory()` only on the connected transition (including
the already-connected initial state), guard completion by model/view identity, and unsubscribe the
old source before installing a new one. This is the implementation shape, not permission to add a
new API.

## Concerns

- **Persistent children:** Native branch switching must dispose and detach children that React
  would have unmounted. The highest-risk branch is `ModelPanel.tsx:51-69`: an inactive download
  view must not remain mounted with its progress behavior live. Expanded root filters and the root
  search-result Markdown view carry the same risk.
- **Changing source identity:** `model.state` belongs to the supplied editor model, and a selected
  root/config key can change while a keyed native row is reused. Do not use `bind()` for these
  subscriptions; its `own()` cleanup has no early-release API. Use a replaceable unsubscribe slot,
  replace it before subscribing to a new model/root source, and guard callbacks by identity.
- **Model/view side effects:** The config model already owns shared connection, IPC, polling, abort,
  and model operations (`MnemeConfigEditorModel.ts:89-104,228-264,558-566`). The view must observe
  that state without opening another connection, timer, or filesystem handle. The root model owns
  the shared connection status subscription and tree provider (`MnemeRootEditorModel.ts:233-275,392-400`);
  the view must not dispose the shared service.
- **Markdown replacement:** `MarkdownBlock` is a React `mountVanilla` face, but its native twin
  `MarkdownBlockView` has its own async lookup and transient child ownership. The result branch must
  update that twin directly and retire it on branch change.
- **Constructor guard:** Constructors may create stable roots and call `this.child(...)` to claim
  ownership, but must not install listeners/subscriptions, start timers, measure layout, or read
  fields created only in `onMount`. Mount each claimed child exactly once in `onMount`, and register
  cleanup at resource creation time; the local ESLint rules mechanically enforce this contract.
- **Live-data verification:** The required routes expose real customer data. Capture only DOM
  structure and state/type labels; do not read or record `textContent`, root paths, note titles, or
  configuration/file contents. A root count without its measured running/connection, resolved/root,
  filter/search, and active-page state is not a valid comparison.
- **No scope expansion:** Do not modify the sidebar, route/API surface, UIKit face files, shared
  vanilla-view/lifecycle infrastructure, Monaco/about/tools-hub implementations, or any test
  harness. No unit tests or test harnesses are proposed.

## Acceptance Criteria

- `mnemeRootModule` in `src/renderer/editors/mneme-root/index.ts` and `mnemeConfigModule` in
  `src/renderer/editors/mneme-config/index.ts` register `View`, not `Component`; the JSX adapter
  functions are gone, the native constructors are public, and invalid editor models fail before
  model-specific use.
- All five JSX-bearing implementation files are native TypeScript views, all direct child views
  are created/mounted/owned according to `src/renderer/uikit/CLAUDE.md`, and no React hook or React
  element construction remains in either converted editor body. The existing secondary Mneme tree
  view is unchanged.
- The hook audit is complete: `mneme-root` ports its one `useState` and one `useMemo` invocation;
  `mneme-config` ports its one `useEffect` invocation; `useComponentModel` state in `RootsPanel`
  is also removed. The `resultsToMarkdown` computation has the live `MarkdownBlockView` caller
  identified at `MnemeRootEditorView.tsx:246` before conversion and retained as an explicit native
  update. No ported `useMemo` or `useCallback` definition is left without a live caller.
- Root search behavior remains intact: query/mode/filter/date controls call the existing model
  methods, Enter submits, filter expansion lazily calls `loadTagVocab`, status arms update, and
  each result/message branch retires the preceding owned branch. Config behavior remains intact:
  connected inventory loading, root/filter actions, model update/progress, stale-index actions, and
  semantic readiness display continue to use the existing typed model methods.
- Every conditional branch listed in this document has an explicit native lifetime policy. In
  particular, collapsed filters, removed keyed rows, inactive progress/download branches, and
  replaced result/model/config arms have no retained child views or listeners.
- Through the config route `span[data-name="mneme-indicator"]` and the root route
  `explorer-open-mneme`, capture a structure-only before digest at implementation time and a
  matching after digest in the same state. The digest must preserve the current named markers,
  visible branch structure, semantic controls, and interaction routes. Do not invent numeric
  baselines in this plan.
- The implementation-time digest reports each converted editor's `[data-react-root]` count and
  `[data-part="react-slot"]` count together with the state measured: active page/editor set,
  config `running`/`connectionStatus`/model-readiness branch, and root `rootName` resolution,
  `filtersOpen`, search/status/result branch. The converted editor body contributes no React root
  in the same state; any roots owned by shared shell/secondary views are reported separately rather
  than folded into the editor result.
- `emptySvgs` is **0** in both before and after structure digests, and all existing SVG/icon
  actions remain visible. No customer Mneme values are copied into this document or verification
  record.
- Face hand-off is accurate: within these two editors, `ProgressBar`, `Divider`, `Tag`, `Dot`, and
  `Spacer` lose their last React value callers; no `uikit/` face is deleted here. The non-UIKit
  `EditorToolbar` and `MarkdownBlock` faces remain because their other renderer callers are listed
  above, and no zero-caller non-UIKit `mountVanilla` face or dead barrel is left by this conversion.
- The constraint audit remains clean: no hardcoded color, direct `require("path")`/`require("fs")`,
  or hand-rolled caught-error stringification is introduced. New caught-error messages use
  `errMessage` from `src/shared/utils.ts`.
- The implementation task may run the normal lint/type checks, but it must not run
  `npm run build-prod` for this task and must add no unit test or test harness.

## Files that need NO changes

- `src/renderer/editors/mneme-root/MnemeRootEditorModel.ts`
- `src/renderer/editors/mneme-root/MnemeTreeSecondaryView.ts`
- `src/renderer/editors/mneme-root/results-to-markdown.ts`
- `src/renderer/editors/mneme-config/MnemeConfigEditorModel.ts`
- `src/renderer/editors/mneme-config/mnemeTypes.ts`
- `src/renderer/editors/base/EditorToolbar.ts`
- `src/renderer/editors/base/EditorToolbarView.ts`
- `src/renderer/editors/markdown/MarkdownBlock.ts`
- `src/renderer/editors/markdown/MarkdownBlockView.ts`
- `src/renderer/api/pages/PagesModel.ts`
- `src/renderer/api/pages/PagesLifecycleModel.ts`
- `src/renderer/api/types/pages.d.ts`
- `src/renderer/ui/app/MainPageView.ts`
- `src/renderer/ui/sidebar/tools-editors-registry.ts`
- `src/renderer/editors/explorer/ExplorerSecondaryView.ts`
- `src/renderer/uikit/` and all UIKit face/style files
- `eslint.config.mjs`
- `src/renderer/uikit/shared/vanilla-view.ts`
- `src/renderer/components/page-manager/PageSlot.ts`
- Anything under `src/renderer/editors/monaco/`, `src/renderer/editors/about/`,
  `src/renderer/editors/tools-hub/`, or `src/renderer/ui/sidebar/`
- Any test file or test harness
- `doc/active-work.md`

## Files Changed summary

| File | Planned change |
|---|---|
| `src/renderer/editors/mneme-root/MnemeRootEditorView.tsx` → `.ts` | Replace the React search body with a native `VanillaView`, direct UIKit views, a native Markdown view, explicit state subscription, and branch retirement. |
| `src/renderer/editors/mneme-root/index.tsx` → `index.ts` | Remove the JSX module adapter and register `MnemeRootEditorView` on `View`; preserve editor creation, standalone path decoding, and exports. |
| `src/renderer/editors/mneme-config/MnemeConfigView.tsx` → `.ts` | Replace the main config React body with a native root, direct toolbar/primitive composition, and connected-state lifecycle. |
| `src/renderer/editors/mneme-config/RootsPanel.tsx` → `.ts` | Replace panel, keyed root rows, filter editor, and component-model hooks with owned native views and explicit reconciliation. |
| `src/renderer/editors/mneme-config/ModelPanel.tsx` → `.ts` | Replace model/download/file-list JSX with a native view and explicit progress/model branch ownership. |
| `src/renderer/editors/mneme-config/index.ts` | Remove the React component import/field and register the native config view on `View`; preserve page id and exports. |

No source implementation is being written in this investigation; the only file written is this
task document.

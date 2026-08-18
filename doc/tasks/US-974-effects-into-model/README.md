# US-974: Move model-owned effects into TComponentModel.effect()

## Status

**Status:** Implemented — reviewed as part of EPIC-051 close-out
**Priority:** Medium
**Epic:** [EPIC-051: De-React Epic P (Preparation)](../../epics/EPIC-051.md)
**Created:** 2026-08-18

## Goal

Move model-owned side effects out of React view functions and into the existing
TComponentModel lifecycle. The view remains responsible for DOM measurement,
focus, scrolling, third-party DOM handles, and other D8 work that a future
vanilla view must own directly.

This task stays on React. It does not create a model merely to hide a DOM effect,
change effect semantics, or convert useMemo/useCallback.

## Background

TComponentModel.effect(callback, depsFactory?) already provides the required
React-free effect primitive. Effects are registered in init(), re-evaluated when
the model receives new props, and cleaned up by onUnmountInternal(). Existing
model-backed views can therefore move subscriptions, async loads, prop/state
synchronization, and model-to-model wiring without adding another hook protocol.

The important implementation detail is in
src/renderer/core/state/model.ts: useComponentModel() calls setPropsInternal(props)
during render, and setPropsInternal() evaluates registered effects during that
render pass. A model effect must not synchronously write another component's state
from that path. Prop seeding needs an identity guard in setProps, and state writes
that can be reached during render need a deferred, liveness-checked path.

### Current measured surface

The opening epic count of 175 is stale on the current branch. The pinned
executable scan below reports 176 non-story .tsx call sites in 92 files:

    rg -n '^\s*(?:React\.)?useEffect\s*\(' src/renderer --glob '*.tsx' --glob '!*.story.tsx'

The broad lexical scan reports 177 because
src/renderer/uikit/Popover/Popover.tsx:89 mentions useEffect in an explanatory
comment. The anchored scan is the completion scan and avoids counting that
comment.

| Area | Files | Executable call sites |
|---|---:|---:|
| src/renderer/editors/ | 57 | 127 |
| src/renderer/uikit/ | 18 | 26 |
| src/renderer/ui/ | 10 | 11 |
| src/renderer/components/ | 7 | 12 |
| **Total** | **92** | **176** |

Thirty-three of the 92 files already call useComponentModel; they contain 67
effects. Cross-referencing the D8 ledger leaves 24 files and 46 effects that
could move. The nine files whose effects are all D8 are a reviewed no-change
group. The three graph files account for 19 of the remaining effects and are
split into [US-978: Graph effects into models](../US-978-graph-effects/README.md).
US-974 therefore owns 21 files and 27 mechanical conversion/deletion actions.
The other 59 files are reviewed below but are not given an ad-hoc component
model solely to relocate a hook.

### Why the boundary is explicit

An effect count does not identify an effect owner. The current surface includes
ResizeObserver, requestAnimationFrame, focus and scroll writes, webviews,
Monaco, audio/video players, Excalidraw, floating-ui, grid handles, and React
lifecycle handoffs. Moving those into a model would make the model DOM-aware or
would create a model whose only job is to call dispose() on a view-owned resource.
D8 explicitly keeps that work in the view.

The task therefore has three completion obligations:

1. Convert the 27 model-owned effects/actions in the 21 mechanical files,
   retaining only the named D8 exceptions.
2. Keep the nine model-backed D8-only files unchanged and record them as a
   reviewed no-change group.
3. Record the 59 non-model files as reviewed exclusions with their owner class;
   they are not an implicit second implementation list.

## Implementation plan

### 1. Freeze the inventory and classify ownership

- Use the anchored scan above, excluding all *.story.tsx files.
- Treat src/renderer/core/state/model.ts, state.ts, ComponentQueue.ts, and the
  React adapter hooks in .ts files as framework infrastructure, not component call
  sites. They are listed under Files requiring no changes.
- For each effect in the 33 model-backed files below, classify it as:
  - model: async load, subscription to a non-DOM event source, prop/state
    synchronization, model-to-model wiring, or model-owned cleanup;
  - D8: DOM measurement/mutation, focus/scroll, ResizeObserver, a third-party
    DOM handle, or a post-commit floating-ui operation.
- Do not infer ownership from the fact that an effect calls a model method. If
  the effect also reads or writes a DOM ref, the view remains the owner.

### 2. Register model-owned effects in existing models

Modify only the following existing model-backed files, moving their model-owned
effects into the inline/co-located model's init()/dispose() or an existing model
setter. Keep model classes inline when they already are inline; do not introduce
a new *Model.ts solely for this task.

The 33-file audit is divided into three groups:

| Group | Files | Effects/actions | Disposition |
|---|---:|---:|---|
| Mechanical conversion | 21 | 27 | Implement in US-974. |
| Model-backed, reviewed D8-only | 9 | 13 | No code change in US-974. |
| Graph follow-up | 3 | 19 | Implement in US-978. |

The nine D8-only files are
components/file-grid/FileGrid.tsx, components/file-list/FileList.tsx,
components/tree-provider/CategoryView.tsx, editors/git-tree/GitChangesView.tsx,
editors/git-tree/GitTreeEditorView.tsx, editors/grid/GridBody.tsx,
uikit/Popover/Popover.tsx, uikit/RenderGrid/RenderFlexGrid.tsx, and
uikit/RenderGrid/RenderGrid.tsx. Their effects are all listed in the D8 ledger.

The graph follow-up owns editors/graph/GraphBody.tsx,
editors/graph/GraphDetailPanel.tsx, and editors/graph/GraphLegendPanel.tsx.
US-974 does not modify those three files.

The detailed audit table below retains all 33 paths so the intersection remains
traceable. Rows marked no change or US-978 are review records, not US-974 diff
targets.

| File | Effects | Required result |
|---|---:|---|
| src/renderer/components/file-grid/FileGrid.tsx | 1 | Retain grid-ref selection read as D8. |
| src/renderer/components/file-list/FileList.tsx | 1 | Retain ref-handler registration; it closes over DOM refs. |
| src/renderer/components/git-tree/GitTree.tsx | 3 | Retain grid-handle/update work; move only model-owned column synchronization. |
| src/renderer/components/tree-provider/CategoryView.tsx | 2 | Retain grid update/scroll effects as D8. |
| src/renderer/components/tree-provider/TreeProviderView.tsx | 1 | Move model lifecycle callback to model init/unmount if post-mount timing remains safe. |
| src/renderer/editors/about/AboutView.tsx | 1 | Move runtime/catalog loading and update-event subscription into the model. |
| src/renderer/editors/category/CategoryEditor.tsx | 1 | Move persisted view-mode loading with path-change cancellation. |
| src/renderer/editors/compare/CompareEditor.tsx | 1 | Replace view cleanup with owning-model lifecycle; do not double-dispose. |
| src/renderer/editors/env-vars/EnvVarsBody.tsx | 2 | Retain autofocus; move data-to-grid seeding with an identity guard. |
| src/renderer/editors/git-tree/CommitDiffPanel.tsx | 3 | Move commit/change and diff loads; retain Monaco scroll reset. |
| src/renderer/editors/git-tree/GitChangesView.tsx | 1 | Retain ResizeObserver measurement. |
| src/renderer/editors/git-tree/GitTreeEditorView.tsx | 1 | Retain ResizeObserver measurement. |
| src/renderer/editors/graph/GraphBody.tsx | 6 | Follow-up US-978; no change in US-974. The no-deps color refresh and DOM key listeners remain in the view. |
| src/renderer/editors/graph/GraphDetailPanel.tsx | 12 | Follow-up US-978; no change in US-974. |
| src/renderer/editors/graph/GraphLegendPanel.tsx | 4 | Follow-up US-978; no change in US-974. |
| src/renderer/editors/grid/GridBody.tsx | 2 | Retain autofocus and grid scroll restoration as D8. |
| src/renderer/editors/log-view/items/MermaidOutputView.tsx | 1 | Move cancellable Mermaid rendering into the existing output model. |
| src/renderer/editors/markdown/CodeBlock.tsx | 1 | Move cancellable Mermaid rendering into MermaidModel; keep stale-result guard. |
| src/renderer/editors/notebook/ExpandedNoteView.tsx | 3 | Move note-to-editor synchronization, editor cleanup, and category seeding with identity guards. |
| src/renderer/editors/rest-client/ResponseViewer.tsx | 1 | Move response-to-language state synchronization into the model. |
| src/renderer/editors/settings/sections/SettingsSections.tsx | 2 | Move Git probe loading and port prop synchronization into owning models. |
| src/renderer/editors/tools-hub/SearchBoardsTab.tsx | 1 | Move idempotent catalog/registry loading into the model. |
| src/renderer/ui/secondary-views/LazySecondaryView.tsx | 1 | Keep async component loading in LazySecondaryViewModel, including cancellation/error state. |
| src/renderer/ui/sidebar/MenuBar.tsx | 1 | Move invalid-folder reconciliation into MenuBarModel with current dependency semantics. |
| src/renderer/ui/sidebar/OpenTabsList.tsx | 2 | Move window-page loading into the model without duplicate mount/open loads. |
| src/renderer/uikit/AVGrid/AVGrid.tsx | 1 | Move onModel lifecycle handoff if post-commit timing is preserved. |
| src/renderer/uikit/ImageViewport/ImageViewport.tsx | 2 | Move only model handoff; retain every-render visibility/fit-scale check as D8. |
| src/renderer/uikit/ListBox/ListBox.tsx | 1 | Move model lifecycle handoff without changing onModel(null) timing. |
| src/renderer/uikit/Minimap/Minimap.tsx | 2 | Move scroll-container prop sync into the model; delete the redundant view init()/dispose() effect because useComponentModel already owns that lifecycle. |
| src/renderer/uikit/Popover/Popover.tsx | 1 | Retain floating-ui position-reference effect as post-commit D8. |
| src/renderer/uikit/RenderGrid/RenderFlexGrid.tsx | 2 | Retain both DOM measurement/observer effects as D8. |
| src/renderer/uikit/RenderGrid/RenderGrid.tsx | 2 | No change; both effects are D8 ResizeObserver/scroll-restoration work. |
| src/renderer/uikit/Tree/Tree.tsx | 1 | Move model lifecycle handoff without changing the public callback contract. |

The model registration pattern is:

    // Before: logic owned by a React view
    useEffect(() => {
        const unsubscribe = source.subscribe(model.handleChange);
        return unsubscribe;
    }, [source, model]);

    // After: the existing component model owns the subscription
    init() {
        this.effect(() => {
            const unsubscribe = this.props.source.subscribe(this.handleChange);
            return unsubscribe;
        }, () => [this.props.source]);
    }

For a prop-to-state seed, use an identity guard in setProps or an equivalent
model method. Do not register a new effect from setProps() and do not blindly
write state on every parent render.

For AVGrid, ListBox, and Tree onModel handoffs, verify the 13 production callers
that pass an inline onModel arrow. The current React effect tears down and
re-runs for a fresh callback identity on every parent render; moving the handoff
to init()/onUnmount changes that cadence to once on mount and once on unmount.
That is intentional, but it must be checked against callers that do more than
assign a ref in their callback. Preserve post-commit mount timing and the
onModel(null) unmount notification.

For prop-to-state seeds, the required shape is an identity guard, not an
unguarded model effect:

    // Before: every matching prop change seeds the view-owned draft
    useEffect(() => {
        if (data === appliedRef.current) return;
        setRows(toRows(data));
        appliedRef.current = data;
    }, [data]);

    // After: the model owns the source identity and the draft update
    setProps = (props) => {
        if (props.data === this.appliedData) return;
        this.appliedData = props.data;
        this.setRows(toRows(props.data));
    };

Do not translate a no-deps React effect mechanically. React runs this after
every commit, whereas TComponentModel.effect without a depsFactory runs once:

    // This remains in GraphBody.tsx:289 and ImageViewport.tsx:344.
    useEffect(() => {
        editor.refreshColors();
    });

There is no render-token dependency in TComponentModel that reproduces this
cadence. These two effects stay in the view unless the behavior is deliberately
redesigned in a separate task.

### 3. Preserve the named D8 view effects

The following effects remain in their current React views. They are not missed
conversions:

- DOM focus, scroll, measurement, and observer work:
  components/file-grid/FileGrid.tsx:168,
  components/file-list/FileList.tsx:112,
  components/git-tree/GitTree.tsx:410,417,
  components/tree-provider/CategoryView.tsx:122,126,
  editors/base/TextChrome.tsx:48,
  editors/browser/BookmarksDrawer.tsx:50,57,
  editors/browser/TorStatusOverlay.tsx:29,
  editors/browser/UrlSuggestionsDropdown.tsx:38,
  editors/env-vars/EnvVarsBody.tsx:213,
  editors/git-tree/CommitDiffPanel.tsx:128,
  editors/git-tree/GitChangesView.tsx:164,
  editors/git-tree/GitTreeEditorView.tsx:62,
  editors/graph/GraphBody.tsx:174,391,426,
  editors/grid/GridBody.tsx:66,73,
  editors/link-editor/LinkItemList.tsx:42,47,
  editors/link-editor/LinkItemTiles.tsx:28,33,
  editors/link-editor/LinksTiles.tsx:332,337,
  editors/link-editor/panels/LinkHostnamesNavigationPanel.tsx:75,93,
  editors/link-editor/panels/LinkTagsSecondaryView.tsx:75,93,
  editors/log-view/LogBody.tsx:38,71,88,
  editors/log-view/items/TextOutputView.tsx:29,71,
  editors/markdown/MarkdownBlock.tsx:262,
  editors/markdown/MarkdownBody.tsx:72,82,157,
  editors/video/AudioControls.tsx:47,
  editors/video/AudioPlayer.tsx:99,101,137,
  editors/video/AudioVisualizer.tsx:151,169,192,211,218,251,
  editors/video/VPlayer.tsx:64,99,116,147,179,
  uikit/AVGrid/filters/FilterBar.tsx:128,218,
  uikit/AVGrid/filters/FilterPopover.tsx:60,
  uikit/AVGrid/CellInput.tsx:56,
  uikit/AVGrid/CellSelect.tsx:96,
  uikit/ImageViewport/ImageViewport.tsx:344,
  uikit/Popover/Popover.tsx:91,
  uikit/RenderGrid/RenderFlexGrid.tsx:34,61,
  uikit/RenderGrid/RenderGrid.tsx:51,62,
  uikit/Textarea/Textarea.tsx:164,171,
  uikit/Tooltip/Tooltip.tsx:121,145,155.
- Third-party host or embedded-frame lifecycle:
  editors/board/BoardWebview.tsx:95,171,238,371,382,405,
  editors/browser/BrowserView.tsx:71,90,100,408,
  editors/html/HtmlBody.tsx:42,51,
  editors/monaco/MonacoBody.tsx:114,
  editors/notebook/note-editor/NoteItemActiveEditor.tsx:68,
  editors/draw/DrawBody.tsx:55,78,
  editors/video/AudioPlayer.tsx:101,
  editors/video/AudioVisualizer.tsx:163,218,251,
  editors/video/VPlayer.tsx:64,99,147.

The final implementation ledger must keep exact line references current after
edits. If an effect changes category during implementation, update the ledger
and explain why; do not delete the D8 exception merely to make the scan reach zero.

### 4. Record the non-model exclusions

These files are reviewed but are not modified by US-974 because they have no
existing TComponentModel and their effects are view lifecycle, external
integration, DOM work, or small one-purpose synchronization where creating a
model would be architectural churn:

src/renderer/components/file-search/FileSearch.tsx
src/renderer/components/icons/LanguageIcon.tsx
src/renderer/editors/archive/ArchiveSecondaryView.tsx
src/renderer/editors/base/TextChrome.tsx
src/renderer/editors/board/BoardToolbar.tsx
src/renderer/editors/board/BoardWebview.tsx
src/renderer/editors/board-info/BoardInfoEditorView.tsx
src/renderer/editors/board-info/BoardScreenshot.tsx
src/renderer/editors/browser/BookmarksDrawer.tsx
src/renderer/editors/browser/BrowserView.tsx
src/renderer/editors/browser/TorStatusOverlay.tsx
src/renderer/editors/browser/UrlSuggestionsDropdown.tsx
src/renderer/editors/draw/DrawBody.tsx
src/renderer/editors/explorer/BoardsSecondaryView.tsx
src/renderer/editors/explorer/ExplorerSecondaryView.tsx
src/renderer/editors/git-tree/CommitInfoPanel.tsx
src/renderer/editors/grid/components/CsvOptions.tsx
src/renderer/editors/html/HtmlBody.tsx
src/renderer/editors/link-editor/LinkBody.tsx
src/renderer/editors/link-editor/LinkItemList.tsx
src/renderer/editors/link-editor/LinkItemTiles.tsx
src/renderer/editors/link-editor/LinksTiles.tsx
src/renderer/editors/link-editor/panels/LinkHostnamesNavigationPanel.tsx
src/renderer/editors/link-editor/panels/LinkTagsSecondaryView.tsx
src/renderer/editors/log-view/items/TextOutputView.tsx
src/renderer/editors/log-view/LogBody.tsx
src/renderer/editors/markdown/MarkdownBlock.tsx
src/renderer/editors/markdown/MarkdownBody.tsx
src/renderer/editors/mcp-inspector/McpInspectorView.tsx
src/renderer/editors/mneme-config/MnemeConfigView.tsx
src/renderer/editors/monaco/MonacoBody.tsx
src/renderer/editors/notebook/NotebookBody.tsx
src/renderer/editors/notebook/note-editor/MiniTextEditor.tsx
src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx
src/renderer/editors/notebook/TagsListView.tsx
src/renderer/editors/settings/sections/FileSearchSection.tsx
src/renderer/editors/shared/ColorizedCode.tsx
src/renderer/editors/shared/FindBar.tsx
src/renderer/editors/video/AudioControls.tsx
src/renderer/editors/video/AudioPlayer.tsx
src/renderer/editors/video/AudioVisualizer.tsx
src/renderer/editors/video/VPlayer.tsx
src/renderer/ui/app/AsyncEditor.tsx
src/renderer/ui/dialogs/InputDialog.tsx
src/renderer/ui/dialogs/CreateBoardDialog.tsx
src/renderer/ui/dialogs/CreateBoardVarsStorageDialog.tsx
src/renderer/ui/sidebar/RecentFileList.tsx
src/renderer/ui/sidebar/TrustedBoardsList.tsx
src/renderer/ui/sidebar/TrustedToolsList.tsx
src/renderer/uikit/AVGrid/CellInput.tsx
src/renderer/uikit/AVGrid/CellSelect.tsx
src/renderer/uikit/AVGrid/filters/FilterBar.tsx
src/renderer/uikit/AVGrid/filters/FilterPopover.tsx
src/renderer/uikit/CategoryList/CategoryList.tsx
src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStack.tsx
src/renderer/uikit/Notification/AlertItem.tsx
src/renderer/uikit/Notification/AlertsBar.tsx
src/renderer/uikit/Textarea/Textarea.tsx
src/renderer/uikit/Tooltip/Tooltip.tsx

Several entries also appear in the D8 ledger because a file contains both
model-owned and view-owned effects. The file list is not a request to change the
D8 effects.

### 5. Verify behavior and the residual scan

- Run npm run typecheck and npm run lint.
- Run git diff --check.
- Re-run the anchored executable scan. It must show no model-owned effect left
  in the 33 model-backed files except for the named D8 lines.
- Smoke-test graph selection/detail/legend synchronization, env-var grid
  reseeding and autofocus, Git diff loading, Mermaid output, notebook note
  editing, response-language changes, settings Git probing, sidebar loading,
  AVGrid/list/tree model callbacks, Popover positioning, ImageViewport
  visibility recovery, and grid/media/Monaco/webview interactions.
- Confirm async cancellation and cleanup on unmount; especially do not leave
  stale Mermaid/Git results or duplicate registry subscriptions.
- Do not add a unit-test harness. This repository uses typecheck, lint, the
  pinned scan, and focused runtime smoke checks for this refactor.

## Concerns / Open questions

1. **Effect execution during render.** On the first render, the model has no
   registered effects; init() runs post-mount and registers/evaluates them. On
   renders 2..N, setPropsInternal() evaluates registered effects during the
   render phase, before commit. A synchronous TComponentState/Zustand write from
   that path can notify the current subscriber while it is rendering, producing
   a warning or a render loop. Resolve this with guarded setProps logic for prop
   seeding and a liveness-checked microtask only where a state write genuinely
   cannot be moved to an event/async callback. The renderer currently mounts the
   root without StrictMode; these render-phase effects are not StrictMode-safe,
   so enabling StrictMode later requires revisiting all 27 conversions.

2. **D8 is a real boundary, not a failed conversion.** ResizeObserver, DOM
   geometry, focus, scroll restoration, floating-ui reference registration, webview,
   Monaco, audio/video, canvas, and Excalidraw require mounted DOM or third-party
   handles. They remain in the view and must be listed in the final ledger.

3. **Lifecycle handoffs and callback timing.** Moving onModel(model) into
   init()/onUnmount is safe only if callers still observe the callback after mount
   and receive null on unmount. If a caller depends on exact commit ordering,
   retain that bridge as a view effect and record it as D8 lifecycle work.

4. **No-deps effects stay in the view.** A React effect without a dependency
   array runs after every commit, while TComponentModel.effect without a
   dependency factory runs once. There is no render-token dependency to bridge
   that difference. GraphBody.tsx:289 and ImageViewport.tsx:344 therefore remain
   in the view by decision, not as unresolved work.

5. **Async races and cleanup.** Every moved async operation needs the current
   cancellation/liveness guard. This applies to About catalog/update loading,
   Category view-mode loading, Git diff/message loads, Mermaid rendering, and
   the settings Git probe. Cleanup must be registered through this.effect() or
   dispose() and must not be duplicated by the view.

6. **Graph risk is isolated.** GraphBody, GraphDetailPanel, and GraphLegendPanel
   contain 19 effects/actions across three inline models, including selection
   transitions, prop-to-state seeding, timer cleanup, and render-phase state
   writes. They are isolated in US-978 so the mechanical 27-action conversion
   can be reviewed independently.

7. **Overlap with editor-specific work.** The 59 non-model files include editor
   bodies and third-party wrappers that will eventually receive their own models or
   vanilla views. US-974 records them, but does not pre-build those abstractions.
   If the epic requires those effects to move now, split that work by editor family
   rather than expanding this task into 59 unrelated model designs.

## Acceptance criteria

- [ ] The pinned executable scan reconciles to 176 non-story .tsx useEffect call
      sites across 92 files; the broad 177 match is explained by the Popover
      comment and is not used as the completion count.
- [ ] The 21 mechanical files complete 27 model-owned effect conversions or
      deletions; the nine D8-only model-backed files are unchanged and the three
      graph files are explicitly handed to US-978.
- [ ] No new ad-hoc model is created solely for a D8 DOM effect.
- [ ] The named D8 effects remain view-owned, with a final line-level ledger and
      no DOM refs, geometry, focus, scroll, floating-ui, webview, Monaco, audio,
      video, canvas, or Excalidraw handles moved into component models.
- [ ] Prop-to-state seeding uses identity guards and does not synchronously write
      state from a render-phase model effect.
- [ ] Async subscriptions and loads preserve cancellation, cleanup, and current
      callback dependency semantics; no duplicate subscriptions or stale updates
      appear after unmount.
- [ ] Lifecycle callbacks (onModel, model cleanup, and equivalent handoffs)
      preserve current mount/unmount behavior, or are explicitly retained in
      the D8 ledger when timing depends on React commit.
- [ ] The 13 inline-arrow onModel callers are checked for the intentional change
      from every-render teardown/re-registration to mount/unmount cadence.
- [ ] GraphBody.tsx:289 and ImageViewport.tsx:344 remain view effects because
      their React no-deps cadence has no TComponentModel.effect equivalent.
- [ ] The 59 non-model files are recorded as reviewed exclusions, not silently
      counted as unfinished conversion work.
- [ ] npm run typecheck, npm run lint, git diff --check, the anchored scan, and
      focused smoke checks pass.

## Related

- [EPIC-051: De-React Epic P](../../epics/EPIC-051.md)
- [US-970: Lift local useState into models](../US-970-lift-state-models/README.md)
- [US-972: React context -> explicit model references](../US-972-explicit-model-references/README.md)
- [US-978: Graph effects into models](../US-978-graph-effects/README.md)
- [Model-view pattern](../../standards/model-view-pattern.md)
- [State management](../../architecture/state-management.md)

## Files Changed Summary

| Change | Files |
|---|---|
| Task documentation | doc/tasks/US-974-effects-into-model/README.md |
| Dashboard/epic links | doc/active-work.md, doc/epics/EPIC-051.md |
| Implementation surface | The 21 mechanical model-backed .tsx files listed in Implementation plan section 2; no new model files are planned. |
| Explicitly no changes | The 59 non-model files listed in Implementation plan section 4, plus React infrastructure/hooks in src/renderer/core/state/model.ts, src/renderer/core/state/state.ts, src/renderer/core/state/ComponentQueue.ts, and the .ts adapter hooks under src/renderer/uikit/AVGrid/model/, src/renderer/uikit/AVGrid/useResolveOptions.ts, src/renderer/components/icons/favicon-cache.ts, and related cache helpers. |

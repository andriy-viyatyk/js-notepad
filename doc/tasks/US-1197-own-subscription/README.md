# US-1197 — `ownSubscription`: route every subscription through ownership

## Goal

Add `VanillaView.ownSubscription()` and route every subscription-like registration in the
renderer through the owning view or model. Rebinding paths retain the returned release handle;
the two currently unremoved global message listeners become correctly removable. Behaviour is
otherwise unchanged.

This is a planning document only. No implementation is included yet.

Epic: [EPIC-075 — Post-De-React Epic A: core contracts](../../epics/EPIC-075.md).

## Background

US-1195 has landed `DisposableStore` and `TModel.own()` / `TModel.dispose()`; US-1196 has landed
the single `() => void` subscription disposer shape. The task therefore has one helper input
shape and must not touch `TOneState`, the remaining `TComponentModel` surface, `memo()`, or
`DisposableStore` semantics. US-1198 concurrently owns `src/renderer/core/utils/scheduling.ts`
and the five dialog focus-timer conversions; this task must not modify those files.

The epic's old figures are not used as the baseline. On 2026-08-29, a fresh call-site census of
`src/renderer` found:

| Registration syntax | Sites |
|---|---:|
| `.subscribe(` | 208 |
| `.watch(` | 13 |
| `.on(` | 46 |
| `addEventListener(` | 104 |
| **Total syntax-matched sites** | **371** |

These are raw call-site matches, including deliberately non-view-owned registrations such as
Node/D3/video listeners and inline DOM listeners. The final counts below will classify every
match by ownership and explain exclusions; a teardown-field search is only a secondary check.

The semantic count is **354 registration sites**. Three of the 357 expressions are not
registrations: `BrowserSecondaryViews.ts:26,35` call the class's own `subscribe()` method, and
`ForceGraphRenderer.ts:549` uses D3 `.on(..., null)` to remove a prior handler. They remain in the
audit trail as explicitly classified non-registration expressions.

## Implementation Plan

### 1. Add the helper contract

Modify `src/renderer/uikit/shared/vanilla-view.ts` only. Add:

```ts
/**
 * Alias for ownReleasable: the name is the greppable ownership marker used by
 * A-1 statement 3's renderer-wide subscription census.
 */
protected ownSubscription(disposer: () => void): () => void {
    return this.ownReleasable(disposer);
}
```

`ownSubscription` is intentionally an alias for the private `ownReleasable`, rather than making
that lower-level primitive protected. Its name is the greppable ownership marker for A-1 statement
3's renderer-wide census; collapsing it later would make a subscription disappear from the
instrument even if disposal still happened. The helper must return the release handle from
`ownReleasable`, not merely call `own()`. The handle is idempotent, invokes the disposer once, and
removes its entry from the view's `DisposableStore`. `bind()` at
`src/renderer/uikit/shared/vanilla-view.ts` is the precedent: it performs its immediate state
application, subscribes, and returns `this.ownReleasable(unsubscribe)`.
This return value is required when a view rebinds to a replacement model/source or re-attaches
listeners during an update; calling only `ownSubscription()` would retain dead registrations in
the store and keep old callbacks active.

Do not alter `ownReleasable`, `bind()`, `listen()`, `dispose()`, or
`src/renderer/core/utils/DisposableStore.ts` semantics.

### 2. Convert model-owned registrations

Use `this.own(disposer)` in `TModel` subclasses that are not views, after confirming their
`dispose()` chain. Models converted in US-1195 are the intended owner for model registrations.
Convert hand-rolled subscription fields and teardown methods to the existing disposer shape;
preserve registration order and callback identity. Do not change `TComponentModel`'s remaining
surface, `TOneState`, or `memo()`.

### 3. Convert fixed-lifetime view registrations

For each classified view registration, replace a hand-rolled field plus teardown with
`this.ownSubscription(source.subscribe(...))`, `this.ownSubscription(source.watch(...))`, or an
equivalent disposer returned by the source. Use `ownSubscription` only where the release handle is
genuinely needed (model replacement or re-attach-on-update), or where a hand-rolled field or
missing teardown is being replaced. Leave already-correct `this.own(source.subscribe(...))` calls
untouched; the acceptance criterion permits both ownership helpers, and a rename alone buys no
ownership or verification value. Use `this.listen(...)` for ordinary static DOM listeners where
its guarded listener semantics are appropriate; preserve special listener options and function
identity.

### 4. Handle the judgement groups before the mechanical sweep

These paths must be implemented and reviewed separately:

- `src/renderer/editors/board/BoardWebview.ts:150` and
  `src/renderer/editors/html/HtmlBodyView.ts:136`: own the global `window` `message` listener and
  retain the exact handler/options needed for removal. This is the intentional leak fix.
- `src/renderer/editors/notebook/ExpandedNoteView.ts` update/re-attach path and
  `src/renderer/editors/notebook/NoteItemView.ts` recycled-cell per-cell listeners: retain a
  release handle, invoke it before rebuilding the listener-bearing DOM, then register the new
  attachment. Do not append a new disposer on every render.
- All five US-1152 secondary-view/model-replacement cases: retain the binding/subscription
  release handle and call it before binding the replacement. The five are the two link-category
  views, `MnemeTreeSecondaryView`, the two tags secondary views, and hostnames navigation; exact
  file/method inventory is recorded in the census below.

### 5. Delivery boundaries and verification

The implementation must land as **two separate deliveries**, with the first fully verified before
the second starts. This is a bisectability requirement, not merely an ordering preference.

**Delivery A — stages 1–3: the behaviour-changing surface.** This delivery contains only the
helper, the two global `window` `message` listener conversions, the `ExpandedNoteView` and
recycled-cell re-attach fixes, and the five US-1152 secondary surfaces (six binding-bearing files).
It is roughly twenty registration sites. Verify it in the running app and inspect the diff line by
line before beginning Delivery B. If a regression appears after Delivery A, the suspect surface
is limited to these sites.

**Delivery B — stages 4–6: the mechanical ownership sweep.** Start only after Delivery A is
verified. This delivery contains model-owned registrations, fixed-lifetime view registrations,
the required exception comments, and the final census/tooling checks. Do not fold Delivery A and B
into one commit or one reviewable diff; after the combined sweep a regression would have roughly
218 possible sites across unrelated files.

Within those delivery boundaries, implement and check the following stages:

1. Helper plus a compile/typecheck checkpoint.
2. The two global `message` listeners and the notebook update/re-attach paths; inspect listener
   counts while repeatedly updating/discarding notes.
3. The five US-1152 rebinding views and any other model-replacement paths; exercise replacement
   and source swaps.
4. Model-owned registrations, grouped by model directory, with disposal-order review.
5. Remaining fixed-lifetime view subscriptions/listeners, file group by file group.
6. Renderer-wide census re-run from `.subscribe(`, `.watch(`, `.on(`, and `addEventListener(`;
   resolve every row, add comments for deliberate exceptions, and run typecheck/lint/build.

The stage-1 helper and stages 2–3 are Delivery A. Stages 4–6 are Delivery B. Each delivery gets
its own verification record and must be safe to bisect independently.

The task must not run or add unit tests or test harnesses. The project uses manual running-app
verification for the risky behaviour.

## Census

The complete file-grouped census is being built incrementally from registration call sites. Each
row will have one of these final classifications:

- **Already owned** — the registration is already tied to `this.own`, `this.listen`, a model's
  `own()`, or an enclosing owner with an equivalent verified lifecycle.
- **Converted by US-1197** — the current teardown is hand-rolled, missing, or otherwise needs to
  route through the new helper/owner.
- **Deliberately not owned** — the registration has an independent owner or is not a renderer
  resource owned by this view/model; the implementation must add a nearby code comment naming
  the reason. No exception is acceptable without that comment.

### Baseline measurement record

The 371 raw matches above were measured before planning with `rg`-equivalent patterns over
`src/renderer/**/*.ts` and `*.tsx`. The 208 `.subscribe(` matches include both the 116 editor
matches cited by the epic and the rest of the renderer; the 105 `addEventListener(` matches
include DOM, injected-document, and global listeners. The classification census will distinguish
registration sites from calls that merely happen to share `.on(` syntax.

### Classification summary

| Classification | Sites | Meaning in this census |
|---|---:|---|
| Already owned | **62** | Existing `own`/`bind`/`listen`, an owning model helper, or a returned disposer whose caller already owns the lifetime |
| Converted by US-1197 | **198** | View/model/service registrations with a hand-rolled or absent lifetime that will be routed through ownership |
| Deliberately not owned | **94** | App-lifetime/global registrations, external stream/plugin registrations, injected-document listeners, or the three non-registration expressions; each exception gets a source comment |
| **Semantic total** | **354** | All actual registration expressions |

The counts are by registration expression, not by field. This is why the converted number is not
the old 108-field figure: the census also covers differently named/closure-held subscriptions,
watchers, event-emitter listeners, and DOM listeners on view-owned dynamic nodes. Existing
hand-rolled field count is **93** with the narrower current declaration search; it is retained
only as a secondary diagnostic, never as the completion instrument.

### File-grouped complete census

`S` means `.subscribe(`, `W` means `.watch(`, `O` means `.on(`, and `D` means
`addEventListener(`. The suffix is the classification: `A` already owned, `C` converted by this
task, and `X` deliberately not owned (including a non-registration expression). Every number is a
current source line and every syntax match is listed. Lines inside comments and API declaration
examples are excluded; the two listeners in the HTML string are retained as runtime registrations.

#### API, core services, and content

| File | Census rows |
|---|---|
| `src/renderer/api/app.ts` | S312X, S334X |
| `src/renderer/api/board-install-registry.ts` | S131A |
| `src/renderer/api/boards.ts` | S322A, S323A |
| `src/renderer/api/board-trust.ts` | S73A |
| `src/renderer/api/board-vars/BoardEnvStore.ts` | S41X |
| `src/renderer/api/downloads.ts` | S34C, S39C, S48C, S59C, S68C |
| `src/renderer/api/internal.ts` | S39A |
| `src/renderer/api/internal/GlobalEventService.ts` | D79X, D80X, D83X, D84X, D86X, D87X, D88X, D89X, D90X |
| `src/renderer/api/internal/KeyboardService.ts` | D12X |
| `src/renderer/api/internal/RendererEventsService.ts` | S20X, S21X, S22X, S23X, S24X, S27X, S28X, S31X, S34X, S37X, S40X |
| `src/renderer/api/internal/WindowStateService.ts` | S10X, S14X |
| `src/renderer/api/library-service.ts` | S48C, W200C |
| `src/renderer/api/mcp-handler.ts` | O14X |
| `src/renderer/api/mneme-connection.ts` | S47X, S53X |
| `src/renderer/api/mneme-status.ts` | S57X, S66X |
| `src/renderer/api/node-fetch.ts` | O103X, O178X, O191X, O201X, O211X, O249X, O254X |
| `src/renderer/api/pages/PageModel.ts` | S271C, S626C |
| `src/renderer/api/pages/PagesModel.ts` | S71C, S79C |
| `src/renderer/api/proc.ts` | O77X |
| `src/renderer/api/published-boards.ts` | S50X, S88A, S111A |
| `src/renderer/api/setup/configure-monaco.ts` | S240X |
| `src/renderer/api/setup/library-intellisense.ts` | S24X |
| `src/renderer/api/tools/registered-tools.ts` | S99A |
| `src/renderer/api/tools/tool-executor.ts` | O235X, O236X, O237X, O238X |
| `src/renderer/api/tools/tools-trust.ts` | S66A |
| `src/renderer/api/window.ts` | S63X |
| `src/renderer/components/file-search/FileSearchModel.ts` | O137C |
| `src/renderer/components/file-search/FileSearchView.ts` | D280C, D312C |
| `src/renderer/components/git-tree/load-more-footer.ts` | D44C |
| `src/renderer/components/icons/favicon-cache.ts` | O212X, O213X, O214X, O216X, O217X |
| `src/renderer/components/icons/language-icon-resolver.ts` | S212A, S213A |
| `src/renderer/components/page-manager/ImperativeSplitter.ts` | D39A, D40A, D41A, D42A, D43A, D44A |
| `src/renderer/components/tree-provider/CategoryViewModel.ts` | W225C |
| `src/renderer/components/tree-provider/TreeProviderViewModel.ts` | W265C |
| `src/renderer/content/ContentPipe.ts` | W144A |
| `src/renderer/content/open-handler.ts` | S15X |
| `src/renderer/content/parsers.ts` | S43X, S65X, S80X, S89X, S100X, S113X, S125X, S138X, S150X, S162X, S172X |
| `src/renderer/content/providers/FileProvider.ts` | W57A |
| `src/renderer/content/providers/MnemeProvider.ts` | S66A |
| `src/renderer/content/resolvers.ts` | S110X, S184X, S231X, S324X |
| `src/renderer/content/tree-context-menus.ts` | S15X, S25X, S45X |
| `src/renderer/content/tree-providers/FileTreeProvider.ts` | W238A |
| `src/renderer/core/utils/file-watcher.ts` | W10A, W125A |

The API/content `X` rows are initialized once during application bootstrap or are listeners on a
short-lived external request/stream. Their implementation comments must name that owner and say
why routing them through a view/model store would be incorrect; they are not silently accepted by
the field count.

#### Editors and editor models

| File | Census rows |
|---|---|
| `src/renderer/editors/about/AboutView.ts` | S78C |
| `src/renderer/editors/base/EditorModel.ts` | S96C |
| `src/renderer/editors/base/PageToolbarView.ts` | S129C, S146C, S150C, S159C, S231A, S264C |
| `src/renderer/editors/base/TextChromeView.ts` | S291C |
| `src/renderer/editors/base/TextHostEditorModel.ts` | S247A, S284A, S320A, S321A |
| `src/renderer/editors/board/BoardContentEditorModel.ts` | S110C |
| `src/renderer/editors/board/BoardSecondaryView.ts` | S70C |
| `src/renderer/editors/board/board-theme.ts` | S41X |
| `src/renderer/editors/board/BoardWebview.ts` | D150C, S154C, S191C, S207C |
| `src/renderer/editors/board/busy-boards.ts` | S39A |
| `src/renderer/editors/board-info/BoardInfoEditorModel.ts` | S180C, S263C, S494C |
| `src/renderer/editors/board-info/BoardInfoEditorView.ts` | D351C |
| `src/renderer/editors/browser/BrowserBookmarks.ts` | S74C |
| `src/renderer/editors/browser/BrowserBookmarksUIModel.ts` | S139C, S145C |
| `src/renderer/editors/browser/BrowserEditor.ts` | S77C |
| `src/renderer/editors/browser/BrowserPanelHost.ts` | S64C, S128C |
| `src/renderer/editors/browser/BrowserSecondaryViews.ts` | S26X (method call), S35X (method call), S47C, S48C |
| `src/renderer/editors/browser/BrowserTabsPanel.ts` | D57C |
| `src/renderer/editors/browser/BrowserTorModel.ts` | S17C, O49C, O50C |
| `src/renderer/editors/browser/BrowserView.ts` | D186C |
| `src/renderer/editors/browser/BrowserWebviewModel.ts` | O168C |
| `src/renderer/editors/category/CategoryEditor.ts` | S146C, S303C |
| `src/renderer/editors/compare/CompareEditor.ts` | S161C, S165C |
| `src/renderer/editors/draw/DrawBodyView.ts` | S225A |
| `src/renderer/editors/draw/DrawEditor.ts` | S109C |
| `src/renderer/editors/env-vars/EnvVarsEditor.ts` | S79A |
| `src/renderer/editors/file-diff/FileDiffBodyModel.ts` | S78C, S81C, S87C, S97C |
| `src/renderer/editors/file-diff/FileDiffBodyView.ts` | S245C |
| `src/renderer/editors/file-diff/FileDiffEditor.ts` | S220A |
| `src/renderer/editors/git-tree/CommitDiffPanel.ts` | S137C |
| `src/renderer/editors/git-tree/CommitInfoPanel.ts` | S61C |
| `src/renderer/editors/graph/ForceGraphRenderer.ts` | O93X, O535X, O549X (D3 removal), O566X, O573X, O581X |
| `src/renderer/editors/graph/GraphBodyView.ts` | S635A |
| `src/renderer/editors/grid/GridBodyView.ts` | S249C, S253C |
| `src/renderer/editors/grid/GridEditor.ts` | S306A, S321A, S335A |
| `src/renderer/editors/html/HtmlBodyView.ts` | D10X (injected document), D10X (injected document), S41C, S58C, S107C, D136C |
| `src/renderer/editors/link-editor/EditLinkDialogView.ts` | D174C |
| `src/renderer/editors/link-editor/LinkBody.ts` | S97C, S98C, S116C, S117C |
| `src/renderer/editors/link-editor/LinkEditor.ts` | S229A |
| `src/renderer/editors/link-editor/LinksTilesView.ts` | D351C |
| `src/renderer/editors/link-editor/LinkTooltipView.ts` | D58C, D114C, D136C |
| `src/renderer/editors/link-editor/LinkTreeProvider.ts` | S305C |
| `src/renderer/editors/log-view/items/MermaidOutputView.ts` | S54A |
| `src/renderer/editors/log-view/LogBodyView.ts` | S108C, S109C |
| `src/renderer/editors/markdown/MarkdownBlockView.ts` | S186A |
| `src/renderer/editors/markdown/MarkdownBodyView.ts` | S340C, S363C, S376C, S386C |
| `src/renderer/editors/mermaid/index.ts` | S115C |
| `src/renderer/editors/mermaid/MermaidBodyView.ts` | S134C, S138C |
| `src/renderer/editors/mermaid/MermaidEditor.ts` | S102C, S124C |
| `src/renderer/editors/mneme-config/MnemeConfigEditorModel.ts` | S101C |
| `src/renderer/editors/mneme-config/MnemeConfigView.ts` | S102C |
| `src/renderer/editors/mneme-root/MnemeRootEditorView.ts` | S317C |
| `src/renderer/editors/monaco/MonacoBodyView.ts` | S115C, S157C, D317C |
| `src/renderer/editors/notebook/ExpandedNoteView.ts` | D124C, S158C, D277C, D300C, D305C, D316C |
| `src/renderer/editors/notebook/index.ts` | S76C |
| `src/renderer/editors/notebook/NotebookBodyView.ts` | S194C, S198C, S199C |
| `src/renderer/editors/notebook/NotebookEditor.ts` | S205A |
| `src/renderer/editors/notebook/note-editor/NoteItemToolbarView.ts` | S59C, S60C |
| `src/renderer/editors/notebook/NoteItemView.ts` | S104C, D330C, D346C, D370C, D372C |
| `src/renderer/editors/notebook/NoteItemViewModel.ts` | D193A |
| `src/renderer/editors/notebook/panels/NotebookCategoriesSecondaryView.ts` | S93C |
| `src/renderer/editors/notebook/panels/NotebookTagsSecondaryView.ts` | S91C |
| `src/renderer/editors/rest-client/multipartBuilder.ts` | O41X, O44X, O45X |
| `src/renderer/editors/rest-client/RestClientBodyView.ts` | S104C |
| `src/renderer/editors/rest-client/RestClientEditor.ts` | S155A, O695X, O696X, O697X |
| `src/renderer/editors/settings/sections/BrowserProfilesSection.ts` | S457C |
| `src/renderer/editors/settings/sections/FileSearchSection.ts` | S56C |
| `src/renderer/editors/settings/sections/McpSection.ts` | S201C |
| `src/renderer/editors/settings/sections/McpSectionModel.ts` | S74C, S86C |
| `src/renderer/editors/settings/sections/SettingsSections.ts` | S58C, S94C, S212C, S268C, S332C, S423C, S487C |
| `src/renderer/editors/settings/sections/ThemeSection.ts` | S95A |
| `src/renderer/editors/svg/SvgBodyView.ts` | S67C, S83C, S107C |
| `src/renderer/editors/text/ScriptPanel.ts` | S59C |
| `src/renderer/editors/text/TextFileIOModel.ts` | W71C |
| `src/renderer/editors/toolset/ToolsetEditorView.ts` | S147C, S166C |
| `src/renderer/editors/video/AudioVisualizer.ts` | S240C |
| `src/renderer/editors/video/VideoView.ts` | S121C |
| `src/renderer/editors/video/VPlayer.ts` | O165X, O166X, O167X, O168X, O169X |

The line-10 HTML registrations are deliberately in the generated `srcdoc`, not the host view;
the nested browser document owns them until that document is navigated. `NoteItemViewModel:193`
is owned by the model's explicit element teardown. D3, Node streams, and the video player have
their own resource owners; comments added at the owning boundary must make that explicit.

#### Scripting, UI, and UIKit

| File | Census rows |
|---|---|
| `src/renderer/scripting/api-wrapper/AppWrapper.ts` | S16A |
| `src/renderer/scripting/worker/WorkerRunner.ts` | O74A, O81A, O90A, O115A |
| `src/renderer/theme/global-styles.ts` | S162X |
| `src/renderer/ui/app/MainPageView.ts` | D111C, D119C, D147C, D160C |
| `src/renderer/ui/app/PageContentView.ts` | S35A, S54C, S95C |
| `src/renderer/ui/dialogs/DialogsView.ts` | S29A |
| `src/renderer/ui/dialogs/poppers/PoppersView.ts` | S24A |
| `src/renderer/ui/secondary-views/SideBarPanelHeaderView.ts` | D68C |
| `src/renderer/ui/sidebar/BuiltinEditorsListView.ts` | S57C |
| `src/renderer/ui/sidebar/FolderItemView.ts` | D48C |
| `src/renderer/ui/sidebar/PinnedRailView.ts` | S80C, D144C |
| `src/renderer/ui/sidebar/ScriptLibraryPanelView.ts` | S75C |
| `src/renderer/ui/sidebar/TrustedBoardsListView.ts` | S56C |
| `src/renderer/ui/tabs/PageTabsView.ts` | S97C, S167C, S168C |
| `src/renderer/ui/tabs/PageTabView.ts` | S171C, S231C |
| `src/renderer/uikit/Breadcrumb/BreadcrumbView.ts` | D62C, D75C |
| `src/renderer/uikit/CategoryList/CategoryListView.ts` | D204C, D205C |
| `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStackView.ts` | D113C, D165C |
| `src/renderer/uikit/DataGrid/cell-tooltip.ts` | D181C, D182C, D185C, D186C |
| `src/renderer/uikit/ImageViewport/ImageViewport.ts` | D253C, D255C |
| `src/renderer/uikit/ListBox/ListBoxView.ts` | D386C, D390C, D394C |
| `src/renderer/uikit/Menu/MenuView.ts` | D166C, D167C, D168C |
| `src/renderer/uikit/Minimap/MinimapModel.ts` | D51C, D200C |
| `src/renderer/uikit/PathInput/PathInputView.ts` | D82C, D83C, D84C |
| `src/renderer/uikit/Popover/PopoverModel.ts` | D221C, D222C, D223C |
| `src/renderer/uikit/RadioGroup/RadioGroupView.ts` | D90C, D91C |
| `src/renderer/uikit/shared/dom-props.ts` | D192C |
| `src/renderer/uikit/shared/tooltipRegistry.ts` | D62X, D63X, D64X |
| `src/renderer/uikit/Tree/Tree.story.ts` | D279C |
| `src/renderer/uikit/Tree/TreeItemView.ts` | D247C |
| `src/renderer/uikit/Tree/TreeView.ts` | D492C, D496C, D500C, D504C, D509C, D513C, D517C, D521C, D525C, D529C |
| `src/renderer/uikit/shared/vanilla-view.ts` | D186A, S258A |
| `src/renderer/uikit/Tag/TagView.ts` | D141C |
| `src/renderer/uikit/Textarea/TextareaView.ts` | D190C, D191C, D192C |
| `src/renderer/uikit/Tooltip/attach-tooltip.ts` | D197A, D198A, D222A, D223A, D224A, D225A, D226A, S227A, S228A |

Dynamic DOM rows marked `C` will use the owning view's guarded `listen()` (or an equivalent
owned/releasable helper where the target is replaced). Rows marked `A` already have a returned
cleanup or an enclosing disposer. The three tooltip-registry document listeners are an
application-wide singleton registration and are `X`, not view listeners.

### Deliberate exceptions and required source comments

The `X` rows are not omitted. Implementation must add a nearby comment at each exception's
registration (or at the shared helper that covers all repeated registrations) with the concrete
reason below:

- Bootstrap/application-lifetime event wiring: `api/app.ts`, `api/board-vars/BoardEnvStore.ts`,
  `api/internal/*`, `api/mcp-handler.ts`, `api/mneme-connection.ts`, `api/mneme-status.ts`,
  `api/proc.ts`, `api/published-boards.ts`, `api/setup/*`, `api/window.ts`,
  `content/open-handler.ts`, `content/parsers.ts`, `content/resolvers.ts`, and
  `content/tree-context-menus.ts`. These are installed once by `App.initEvents()` and live for
  the renderer process; there is no view/model owner to which a per-view disposer could belong.
- Request/stream ownership: `api/node-fetch.ts`, `editors/rest-client/multipartBuilder.ts`,
  `editors/rest-client/RestClientEditor.ts:695-697`, and the external D3/video callbacks in
  `ForceGraphRenderer.ts`, `VPlayer.ts`. The request, stream, simulation, or player owns and
  releases the listener at its own lifecycle boundary; a view-level disposer would either end a
  still-running operation or remove a listener from a reused external object.
- Generated nested document: both `HtmlBodyView.ts:10` listeners run inside the `srcdoc` string;
  the nested browser document owns them and navigation replaces that document.
- `ForceGraphRenderer.ts:549` is a D3 handler removal, not a registration; the comment must say
  so. `BrowserSecondaryViews.ts:26,35` invoke the class's own binder and are not subscriptions;
  the comment must prevent a future syntax-only census from treating them as registrations.

No other `X` classification is permitted. If implementation discovers a different owner, change
the row to `A` and document the owner in the census rather than silently increasing the exception
set.

## Judgement groups: verified current lines and before → after

The following line references are from the current working tree on 2026-08-29. They are separate
from the mechanical census because each has a distinct leak/rebinding failure mode.

### Global `window` message listeners

`BoardWebview.ts:150-151` currently adds the listener and stores a hand-written removal handle;
`HtmlBodyView.ts:136-137` currently registers removal with `own()` but still has a separately
managed handler closure. The before state is therefore “not routed through the new subscription
contract”, even where a manual removal already happens in this post-US-1196 tree.

Before (`src/renderer/editors/board/BoardWebview.ts:150-151`):

```ts
window.addEventListener("message", this.handleMessage);
this.messageUnsubscribe = () => window.removeEventListener("message", this.handleMessage);
```

After:

```ts
window.addEventListener("message", this.handleMessage);
this.ownSubscription(() => window.removeEventListener("message", this.handleMessage));
```

The implementation must register the removal after the add, or use a small local helper that adds
first and returns the exact matching disposer. Preserve the existing `onDispose` ordering and
avoid a second active listener if iframe creation can be retried.

Before (`src/renderer/editors/html/HtmlBodyView.ts:136-137`):

```ts
window.addEventListener("message", onMessage);
this.own(() => window.removeEventListener("message", onMessage));
```

After:

```ts
window.addEventListener("message", onMessage);
this.ownSubscription(() => window.removeEventListener("message", onMessage));
```

The intended behaviour change is removal on view disposal; message filtering and focus
announcement are unchanged.

### Re-attach inside an update/render path

`ExpandedNoteView.ts:124` attaches the stable category host during `onMount`; the dynamic
attachments at `:277,300,305,316` are rebuilt by `syncTags()` / `syncComment()` on updates.
`NoteItemView.ts:330,346,370,372` are the recycled-cell equivalents. The static category listener
should be owned once; the dynamic group must release the old group before replacing the DOM.

Before (`ExpandedNoteView.ts:272-278`):

```ts
const add = document.createElement("span");
add.textContent = "+ Add comment";
add.addEventListener("click", () => this.props.notebookModel.addComment(note.id));
this.commentHost.replaceChildren(add);
```

After:

```ts
const add = document.createElement("span");
add.textContent = "+ Add comment";
const onAdd = () => this.props.notebookModel.addComment(note.id);
add.addEventListener("click", onAdd);
this.releaseDynamicListeners = this.ownSubscription(() => add.removeEventListener("click", onAdd));
this.commentHost.replaceChildren(add);
```

For a group that is repeatedly replaced, retain one `releaseDynamicListeners` handle, call it
before rebuilding, and assign a new `ownSubscription`-backed release handle after all four current
controls are attached. Do **not** use `listen()` for these repeatedly-created nodes: `listen()`
uses `own()` and would recreate the unbounded disposer-list problem. The same release-before-
rebuild rule applies to `NoteItemView.ts:330-372`; handlers must continue to capture the current
note/index exactly as they do now. The stable `ExpandedNoteView.ts:124` category-host listener
may use `listen()` because it is attached once during mount.

Before (`NoteItemView.ts:330-346`, representative):

```ts
add.addEventListener("click", () => this.props.onAddComment?.(this.props.note.id));
// ...
element.addEventListener("click", this.model.handleAddTagClick);
```

After:

```ts
const onAdd = () => this.props.onAddComment?.(this.props.note.id);
add.addEventListener("click", onAdd);
this.releaseCellListeners = this.ownSubscription(() => add.removeEventListener("click", onAdd));
// ...
element.addEventListener("click", this.model.handleAddTagClick);
```

The `ExpandedNoteView.ts:124` category-host registration is a one-time mount registration and
must be converted with the same ownership primitive, but it is not repeatedly registered by
`sync()`.

### Model replacement and the US-1152 rebinding class

US-1152's completed record says the class was a view accepting a replaceable model but binding as
if its model were fixed: the old source kept invoking callbacks against the reused view. It
identified **six binding-bearing files across five secondary surfaces**, not five total files:

| Surface | Current binding site | Required release-before-rebind |
|---|---|---|
| Link category panel | `src/renderer/editors/link-editor/panels/LinkCategoryPanel.ts:50-61` | `editorBinding` before replacement |
| Link category secondary view | `src/renderer/editors/link-editor/panels/LinkCategorySecondaryView.ts:82-105` | `pageBinding` and `hostBinding`, including source identity swaps |
| Link tags panel | `src/renderer/editors/link-editor/panels/LinkTagsPanel.ts:42-56` | `editorBinding` before replacement |
| Link tags navigation/secondary surface | `src/renderer/editors/link-editor/panels/LinkTagsSecondaryView.ts:74-91` | `editorBinding` before replacement |
| Mneme tree secondary view | `src/renderer/editors/mneme-root/MnemeTreeSecondaryView.ts:95-124` | model and page bindings before replacement |
| Hostnames navigation | `src/renderer/editors/link-editor/panels/LinkHostnamesNavigationPanel.ts:68-87` | `editorBinding` before replacement |

The current code already uses `bind()` release handles in these paths because US-1152 landed
before this task. The conversion is to preserve that pattern where the source is an `IState`, and
to use `ownSubscription` for direct subscriptions. The generic before → after shape is:

Before:

```ts
private binding: (() => void) | undefined;

private bindEditorState(editor: LinkEditor): void {
    this.binding?.();
    this.binding = this.bind(editor.state, selectState, (state) => this.applyState(state));
}
```

After:

```ts
private bindingRelease: (() => void) | undefined;

private bindEditorState(editor: LinkEditor): void {
    this.bindingRelease?.();
    this.bindingRelease = this.bind(editor.state, selectState, (state) => this.applyState(state));
}
```

For direct `subscribe()` sites in the same class:

```ts
this.subscriptionRelease?.();
this.subscriptionRelease = this.ownSubscription(editor.state.subscribe(() => this.sync()));
```

The six concrete `bind()` sites have the same verified before → after requirement. In the current
tree, the `before` form is the defect shape that US-1152 fixed; the `after` form is already present
and must not regress while nearby subscriptions are converted:

```ts
// LinkCategoryPanel.ts:50-54
// before: this.editorBinding = this.bind(editor.state, ...);
// after:
this.editorBinding?.();
this.editorBinding = this.bind(editor.state, ...);

// LinkCategorySecondaryView.ts:82-90 and :94-102
// before: pageBinding/hostBinding were replaced without releasing the old source.
// after:
this.pageBinding?.();
this.pageBinding = this.bind(pageState, ...);
this.hostBinding?.();
this.hostBinding = this.bind(hostState, ...);

// LinkTagsPanel.ts:42-46
// before: this.editorBinding = this.bind(editor.state, ...);
// after:
this.editorBinding?.();
this.editorBinding = this.bind(editor.state, ...);

// LinkTagsSecondaryView.ts:74-78
// before: this.editorBinding = this.bind(editor.state, ...);
// after:
this.editorBinding?.();
this.editorBinding = this.bind(editor.state, ...);

// MnemeTreeSecondaryView.ts:95-98 and :113-118
// before: model/page bindings were retained across a model replacement.
// after:
this.modelStateBinding?.();
this.modelStateBinding = this.bind(model.state, ...);
this.pageStateBinding?.();
this.pageStateBinding = this.bind(model.page.state, ...);

// LinkHostnamesNavigationPanel.ts:68-72
// before: this.editorBinding = this.bind(editor.state, ...);
// after:
this.editorBinding?.();
this.editorBinding = this.bind(editor.state, ...);
```

The ellipses above stand for the existing selectors and apply callbacks, which are part of the
verified behavior and must remain byte-for-byte equivalent in the implementation. The current
release calls are why these six `bind()` sites are classified **already owned**, while the
notebook secondary views' direct `subscribe()` sites remain **converted by US-1197**.

Do not remove the identity guards (`this.editor === editor` / `this.boundEditor === editor`), the
source-identity checks in `LinkCategorySecondaryView`, or the immediate `bind()` application.
Those guards and releases cover different races.

## Files that must not change

The following are explicit no-change boundaries for implementation:

- `src/renderer/core/state/state.ts` (`TOneState`) and the remaining public surface of
  `src/renderer/core/state/model.ts` (`TComponentModel`, `memo()`, and its existing
  `DisposableStore` use).
- `src/renderer/core/utils/DisposableStore.ts`; its close/snapshot, error, and release semantics
  are load-bearing.
- `src/renderer/core/utils/scheduling.ts`, plus
  `src/renderer/ui/dialogs/CreateBoardDialogView.ts`,
  `src/renderer/ui/dialogs/InputDialogView.ts`,
  `src/renderer/ui/dialogs/LibrarySetupDialogView.ts`,
  `src/renderer/ui/dialogs/PasswordDialogView.ts`, and
  `src/renderer/ui/dialogs/CreateBoardVarsStorageDialogView.ts`; these belong to US-1198.
- `doc/active-work.md`; the user will maintain the dashboard.
- Tests and test harnesses: none are to be added or modified because this project does not use
  them.

## Concerns

- The raw syntax count is intentionally broader than the epic's `.subscribe()` figure. Both the
  371 raw syntax matches and the 357 comment-filtered expressions remain recorded for auditability,
  but **354 semantic registration sites is the single headline total used by the acceptance
  criterion**; completion is checked against its 62/198/94 classification split.
- A subscription captured in a differently named field or closure is still a registration. The
  census must never infer ownership from field names.
- Every deliberately unowned site needs a source comment explaining its independent owner or why
  it is not a view/model resource. This is required by A-1 statement 3, not optional annotation.
- Rebinding and update-path conversions must preserve callback ordering, immediate-application
  behaviour, listener options, and DOM replacement behaviour.
- The current working tree already contains the US-1195/1196 edits as uncommitted changes. The
  implementer must preserve unrelated user changes and avoid treating the working-tree diff as a
  clean US-1197 baseline.

## Acceptance Criteria

- `VanillaView` exposes `protected ownSubscription(disposer: () => void): () => void`, implemented
  on `ownReleasable`, with the release semantics documented above.
- The renderer-wide census is complete and generated from `.subscribe(`, `.watch(`, `.on(`, and
  `addEventListener(` call sites. Its final summary reports **354 semantic registration sites**:
  **62 already owned**, **198 converted by US-1197**, and **94 deliberately not owned** (the
  three non-registration syntax hits are tracked separately).
- All converted registrations have one `() => void` disposer and no view retains a hand-rolled
  subscription teardown field.
- The two global `window` `message` listeners are removed on view disposal.
- Expanded notebook re-attachments and recycled-cell listeners release the previous attachment
  before registering a replacement; repeated updates do not grow the disposer list.
- Every US-1152 binding-bearing view releases old model/source bindings before rebinding, while
  the five secondary-surface replacement behaviours remain live.
- Every deliberate exception has a nearby code comment with its reason.
- No changes are made to `TOneState`, `TComponentModel`'s remaining surface, `memo()`,
  `DisposableStore` semantics, US-1198 scheduling files/dialogs, or `doc/active-work.md`.
- Human verification covers the risky conversions in a running app, as specified below.

### Human verification of risky conversions

Run a fresh renderer load, not only an HMR update. For the two global listeners, open and close a
Board webview and an HTML editor repeatedly, then inspect DevTools listener breakpoints or the
window listener list: each view's `message` handler must disappear after disposal, and messages
must still update a live view.

For `ExpandedNoteView`, keep an expanded note mounted, trigger the update path repeatedly (edit
the note, add/remove comments, and add/edit/remove tags), and verify each control responds once.
With DevTools event-listener inspection or a temporary local counter, the number of active
listeners should remain proportional to the current controls, not the number of updates. Dispose
the editor and confirm the controls no longer react.

For the recycled notebook grid, scroll a set of cells in and out of the viewport repeatedly and
change tags/comments on recycled cells. Each visible cell must respond once, and a handler from a
previous note must never act on the newly assigned note. Close the notebook and confirm no cell
handler remains active.

For the US-1152 class, keep the secondary view host mounted while replacing its model/source with
another editor or linked source. Verify the replacement immediately renders current state,
subsequent changes from the new source update it, and changes from the old source no longer do.
Exercise all five secondary surfaces: link-category navigation (including source swap), Mneme
tree, notebook tags, notebook categories, and hostnames navigation. The link-category and
link-tags surfaces each contain a panel plus a navigation/secondary binding, hence the six files
listed above. Reuse the same host where the UI permits; if a surface cannot be reused in normal
navigation, record that and use the source-level lifecycle check described by its view's
mount/update path rather than claiming a tab switch proved it.

## Files Changed Summary

| File/group | Planned change |
|---|---|
| `src/renderer/uikit/shared/vanilla-view.ts` | Add `ownSubscription()` over `ownReleasable()` |
| Renderer model/view files identified in the census | Route registrations through `own()` / `ownSubscription()` or `listen()`; preserve behaviour |
| `src/renderer/core/utils/DisposableStore.ts` | **No change**; US-1195 semantics are load-bearing |
| `src/renderer/core/state/model.ts` | **No change** to `TOneState`, `TComponentModel` surface, or `memo()` |
| `src/renderer/core/utils/scheduling.ts` and five US-1198 dialogs | **No change**; concurrent US-1198 scope |
| `doc/active-work.md` | **No change** per user instruction |

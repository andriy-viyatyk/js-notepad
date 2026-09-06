# US-1325 - The board page surface

Epic: [EPIC-088 - Boards and tools through call, and the retirement of seven tools](../../epics/EPIC-088.md)

**Status: Implemented.** The facade, types, registration, model reload helper and the `board-trust`
control name are in place; `board_refresh` is untouched and its retirement marking waits for US-1332.

## Goal

Give every board page a real pages[i].editor facade for the plain board-view editor and the
dynamic board-editor:<root> custom-editor ids. The facade will expose model-backed board state,
the existing reload behavior as reload(), and a small page-scoped elements list, making
pages[i].editor.reload() the verified replacement path for board_refresh without driving the
cross-origin board iframe; iframe snapshot/click/type remains EPIC-089.

## Background

### Existing model and render branches

BoardEditorState already contains the board root, selected-board sentinel, reload token, optional
busy flag, secondary-view declarations, and transient status text at
src/renderer/editors/board/BoardEditorModel.ts:20-85. Defaults identify the editor as board-view
and leave selectedBoard absent at :88-97. BoardEditorModel.editorId returns board-view for a
plain board and board-editor:<root> when a board is acting as a custom editor
(BoardEditorModel.ts:112-120; custom-editor-registry.ts:27-41). The existing isBoardEditorId()
recognizes both forms at custom-editor-registry.ts:210-216; facade registration must therefore
handle the dynamic form instead of registering only one literal key.

The view chooses its main branch entirely from model state plus the app-side trust model:
BoardEditorView.syncBranch() derives selectedRoot from state.selectedBoard and state.boardRoot,
then selects not-found, untrusted, or the trusted branch at
src/renderer/editors/board/BoardEditorView.ts:176-185. It constructs BoardNotFoundView,
UntrustedBoardView, or the trusted BoardHostView at :218-240.
contentHostError is a fourth, non-trust branch inside the trusted case at :181-185 and
:234-236; the facade must expose that error separately rather than falsely claiming that an
iframe is live. The task's public render discriminator remains the required three-state trust /
availability contract:

| Facade renderState | Model evidence | Current view | Restricted? |
| --- | --- | --- | --- |
| not-found | !state.boardRoot or !state.selectedBoard | BoardNotFoundView | No |
| untrusted | selected root exists and boardTrust.isTrusted(root) is false | UntrustedBoardView | Yes |
| trusted | selected root exists and boardTrust.isTrusted(root) is true | BoardHostView, or ContentErrorView when state.contentHostError is set | No |

This is a model-only computation; it must not inspect branch instances, data-type, text, or
iframe DOM. refreshBoards() clears selectedBoard when isBoardFolder() fails but retains the
requested boardRoot (BoardEditorModel.ts:454-477), so a missing manifest is reported as
renderState: not-found, boardName: undefined, and not as a missing root. isBoardFolder() checks
for board-manifest.json at board-manifest.ts:133-146.

Trust is app-side and never read from the board manifest: board-trust.ts:1-18 documents the
boundary, and boardTrust.isTrusted() is an ancestor-aware model lookup at :55-65. The existing
view's trust path opens showTrustBoardDialog(), then confirms namespace collisions, then writes
the trust registry at BoardEditorView.ts:263-267. The facade will not expose a trust setter or
silently call boardTrust.trust().

The trusted branch is a cross-origin iframe, despite the BoardWebview.ts filename:
src/renderer/editors/board/BoardWebview.ts:34-39 and :132-149 show the board origin and iframe
mount. BoardEditorModel.target is the existing automation adapter for the frame
(BoardEditorModel.ts:126-145), but this task does not add iframe content operations to the
facade.

### Existing reload contract and tool being replaced

The board model already owns the two pieces needed for a correct reload. reloadBoard() bumps the
remount token and invalidates the icon at BoardEditorModel.ts:543-551. waitForFrameLoad()
registers a waiter before the reload, resolves true from the next markFrameLoaded(), and resolves
false on timeout or disposal at :168-198; getFrame() and currentIframe expose live-frame absence
as undefined at :163-165 and :200-203. BoardWebview.handleLoad() marks the main frame only after
CDP registration succeeds (BoardWebview.ts:237-249), so this is the attachable-frame signal the
facade must reuse.

The current board_refresh path validates the selected page and board id, calls
waitForFrameLoad(), calls reloadBoard(), and returns
{ refreshed: true, pageId, frameReady: await ready } at
src/renderer/api/mcp/board-commands.ts:48-61. The tool definition documents that pageId is
optional, defaults to the active board, and that frameReady: false means the frame did not load
within the timeout at src/main/mcp/tools/board-tools.ts:27-33.

The implementation will expose that existing sequence through a model helper,
reloadAndWait(): Promise<boolean>, for the facade to call. The legacy MCP handler remains
unchanged; its current waitForFrameLoad()/reloadBoard() ordering and response behavior are
intentionally preserved. The facade method is exactly:

~~~ts
reload(): Promise<{
    refreshed: true;
    pageId: string;
    frameReady: boolean;
    renderState: "trusted" | "untrusted" | "not-found";
}>
~~~

It obtains pageId from editor.page?.id, rejects clearly if the model is not attached to a page
or has no board root. When renderState is untrusted or not-found, it skips the wait and returns
immediately with frameReady: false plus that renderState; it does not spend five seconds waiting
for a frame that cannot mount. A trusted board calls the shared model helper and a frame that
never signals load returns frameReady: false after the existing five-second timeout; disposal
also resolves the existing waiter as false
(BoardEditorModel.ts:183-196, :580-584). The model helper uses the explicit BOARD_CDP_TAB
constant for both the waiter and frame lookup, imported from src/ipc/api-types.ts:115-118; it
does not use the literal "main". A non-board page has no BoardEditorFacade or reload member after narrowing
page.editor; the legacy board_refresh handler continues to return its existing “not a board
page” invalid-parameter error (board-commands.ts:53-56). No boards.refresh() member is added.
The facade-only render-state short-circuit does not alter reloadAndWait()'s semantics or the
legacy board_refresh handler; changing that handler/tool is US-1332's call.

### Facade and descriptor patterns

GitTreeEditorFacade.ts and ArchiveEditorFacade.ts are the patterns to copy. Both define static
member and element declarations, create page-scoped elements in aiVision, use
pageScopeSelector() and activatePageAndWaitForLayout(), pass highlightOptions: { all: true },
and provide elements, provide, help, and summarize
(GitTreeEditorFacade.ts:17-55, :81-104; ArchiveEditorFacade.ts:8-41, :50-71). Their getters
return copied model snapshots and use undefined for unavailable state
(GitTreeEditorFacade.ts:107-153; ArchiveEditorFacade.ts:74-86).

The page selector contract is [data-page-id=<id>] from
src/renderer/scripting/ai-vision/page-elements.ts:5-8; highlighting activates the page and
waits for its rendered slot at :36-40. Descriptor members, dynamic provide, restricted, and
curated element declarations are defined by src/shared/ai-vision/types.ts:16-39, :57-85.

Registration belongs in src/renderer/scripting/api-wrapper/PageWrapper.ts:56-90: add the facade
to the private EditorFacade union and register board-view in FACADE_FOR_EDITOR. Because a custom
board id contains an arbitrary root path, the PageWrapper.editor lookup at :167-175 must use
isBoardEditorId(id) as the dynamic fallback to the same board factory. The public canonical type
union is IEditorFacade in src/renderer/api/types/page.d.ts:28-44; the new board leaf declaration
belongs under src/renderer/api/types/. assets/editor-types/*.d.ts is generated output and must
not be hand-edited.

### State contract and absent-value audit

The planned public shape is deliberately small:

| Member | Source and meaning | No board root | No manifest / invalid board | No frame |
| --- | --- | --- | --- | --- |
| id, name | Facade identity supplied by PageWrapper; dynamic ids preserve board-editor:<root> | Identity remains available | Identity remains available | Identity remains available |
| boardRoot | BoardEditorModel.state.boardRoot (BoardEditorModel.ts:290-294) | undefined | The requested root remains available, because refreshBoards() clears selection rather than root | Unchanged |
| boardName | state.selectedBoard, which is cleared for a missing manifest (BoardEditorModel.ts:467-469) | undefined | undefined | Unchanged |
| renderState | state.boardRoot + state.selectedBoard + boardTrust.isTrusted(); never DOM-derived | not-found (state discriminator, not an absent-value marker) | not-found | Unchanged |
| getManifest() | Promise<IBoardManifest \| undefined> over readBoardManifest(); null is normalized to undefined (board-manifest.ts:149-162) | Promise of undefined | Promise of undefined | Still readable; it does not depend on an iframe |
| secondaryViews | If the board is resolved, reads state.secondaryViewDefs, defaults it with ?? [], maps each declaration through boardSecondaryPanelId(), and adds current page.activePanelId expansion (BoardEditorModel.ts:482-500; board-secondary.ts:1-20) | undefined | undefined because renderState is not trusted/resolved, even though persisted defs may survive | Declarations remain available; expansion is undefined only when there is no page host |
| statusText | Model state.statusText; empty clear sentinel maps to undefined (BoardEditorModel.ts:511-516; BoardEditorView.ts:105-135) | undefined | undefined | Model value remains independent of frame presence |
| busy | If the board is unresolved, undefined; otherwise state.busy ?? false, with setBusy() authoritative (BoardEditorModel.ts:216-226) | undefined | undefined | Preserves model busy state; no iframe query |
| frameReady | getFrame(BOARD_CDP_TAB) plus loadedTabs.has(BOARD_CDP_TAB), using BOARD_CDP_TAB from src/ipc/api-types.ts:115-118 (BoardEditorModel.ts:136-180) | undefined | undefined | undefined when no frame is mounted; false while a frame is mounted but not registered; true only after markFrameLoaded() |
| contentHostError | Model error branch (BoardEditorView.ts:181-185, :234-236); errMessage() always supplies a non-empty fallback (src/shared/utils.ts:12-18) | undefined | undefined | Actual non-empty error remains available if present |

The renderState string and an attached board's genuine busy: false are state values, not
absence markers. Every unavailable optional value in the table is undefined, never false, 0,
empty string, or null; getManifest() also converts readBoardManifest()'s null to undefined.
contentHostError is only assigned undefined or errMessage() output, and errMessage() guarantees
a non-empty fallback, so it needs no empty-string normalization.
An attached valid board with no secondary declarations reports a real secondaryViews: [], not
undefined. The implementation must preserve this table under strictNullChecks: false.

### Secondary views, sidebar state, status, and busy state

The manifest declares SecondaryViewDecl { id, html?, title? } at
src/renderer/editors/board/board-manifest.ts:23-34, :125-130. On a valid board, the model seeds
those declarations once, derives board-secondary:<id> panel ids, and clears the derived panel
list when the board is invalid at BoardEditorModel.ts:470-500. BoardSecondaryView parses the
panel id, labels the panel from the declaration, and renders a board frame only when the selected
root exists, the declaration exists, and the board is trusted; otherwise it reports a placeholder
(src/renderer/editors/board/BoardSecondaryView.ts:104-151).

The facade's secondaryViews is therefore a copied model projection with entries such as
{ id, panelId: board-secondary:<id>, title, html, expanded }. Its source field is
state.secondaryViewDefs, not the derived state.secondaryView list: refreshBoards() clears only
the latter when selection becomes invalid (BoardEditorModel.ts:466-476), while persisted
secondaryViewDefs can survive. The separate validity gate is the facade's renderState
discriminator, equivalently requiring state.selectedBoard; only a resolved board may project
secondaryViewDefs ?? [], mapped through boardSecondaryPanelId(). Thus an invalid/not-found
board reports undefined, while a valid manifest with no declarations reports a real [].
It reports declarations even when a panel is collapsed, and uses the existing page model's active panel for expanded; it does not
inspect BoardSecondaryView or its DOM. The generic page panel surface already lists live panel
records and exposes page.panels.items / expand()
(src/renderer/api/types/page-panels.d.ts:15-44), and its board-panel label logic understands
board-secondary:* from src/renderer/scripting/ai-vision/page-panels.ts:52-60. The board facade
will cross-reference that page-panel ownership rather than duplicate panel close/expand actions.

statusText is set by the board bridge and stored in model state (BoardWebview.ts:316-321), then
rendered only for a content-host footer by BoardHostView (BoardEditorView.ts:105-135). The
facade exposes the model value without claiming that a plain board has a visible footer. busy is
likewise read from model state; setBusy() updates the state, the busy-board registry, and the
main-process owner (BoardEditorModel.ts:216-226). Neither property reaches into an iframe.

### Curated elements and the UIKit name lifetime

The raw name: census in src/renderer/editors/board/ is 22 matches, but it includes non-DOM
fields and parameters in board-api.d.ts:97, :151, :153, board-scaffold.ts:49,
BoardEditorModel.ts:533, and custom-editor-registry.ts:51-52. The actual board views also name
structural containers (BoardEditorView.ts:76-100, BoardSecondaryView.ts:23-46) and a status dot
(BoardToolbar.ts:191-200). Those are not all useful agent controls.

The curated editor list will contain only page-scoped controls:

| elements name | One-line purpose | data-name source / decision |
| --- | --- | --- |
| board-toolbar-explorer | Locate the toolbar control that toggles the board's Explorer navigator. | Existing name on IconButtonView at BoardToolbar.ts:105-109; preserve exactly. |
| board-toolbar-reload | Locate the toolbar Reload board control; the facade action is reload(). | Existing name at BoardToolbar.ts:110-114; preserve exactly. |
| board-toolbar-log | Locate the control that opens the board's ui.log. | Existing name at BoardToolbar.ts:115-119; preserve exactly. |
| board-toolbar-properties | Locate the control that opens Board Info/properties. | Existing name at construction and on every propertiesButton.update() (BoardToolbar.ts:120-124, :181-190); preserve exactly. |
| board-trust | Locate the Trust board action in the untrusted placeholder. | Add name: board-trust to the existing ButtonView props at UntrustedBoardView.ts:39-45; no existing name/type is renamed. |

The following names are intentionally not editor elements: board-host and board-webview-wrap are
structural roots; board-secondary-view and board-secondary-content belong to the sidebar panel;
board-toolbar is a structural root; board-toolbar-update-dot is an update indicator; and
board-toolbar-switcher plus board-toolbar-boards belong to the floating popover/tree. The
popover is mounted in the global overlay layer (src/renderer/uikit/Popover/PopoverView.ts:68-75;
overlayLayer.ts:5-34), so a page-scoped selector cannot honestly resolve it. Board choices remain
visible through the existing page.panels.boards / panel elements, while secondary views remain in
editor.secondaryViews and page.panels.items.

Every curated selector is resolved below pageScopeSelector(pageId) and the facade will pass
highlightOptions: { all: true }, even though the five selected names normally identify one
control. The implementation must verify name persistence at every update site: IconButtonView
deletes data-name when an update omits name
(src/renderer/uikit/IconButton/IconButtonView.ts:83-90), PopoverView does the same
(PopoverView.ts:160-185), TreeView applies the current name on every update
(TreeView.ts:273-282), and panels delete omitted values in panel-style.ts:303-331. The four
existing toolbar buttons are mounted once, the properties button preserves its name in its
update, and the newly named Trust button is not updated by UntrustedBoardView.onUpdate()
(UntrustedBoardView.ts:48-59), so no curated data-name may be mount-only and then stripped.
Existing data-name and data-type values are not renamed.

### Trust dialog and iframe boundary in help

The facade help must say that an untrusted board's content is restricted until the user answers
the Trust-this-Board dialog, shown as Trust this board?. The dialog is created by
src/renderer/ui/dialogs/TrustBoardDialog.ts:7-20, and its live call path is dialogs[0] while it
is open (src/renderer/scripting/ai-vision/dialogs/index.ts:69-95); the adapter that resolves it
is src/renderer/scripting/ai-vision/dialogs/trust-board.ts:13-33. help must point to that
dialog/path, explain that the facade never accepts or returns a trust decision, and state that
restricted() returns text only for renderState === untrusted; it returns undefined for trusted and
not-found states. Not-found is an unavailable/empty board, not a privacy boundary.

The same help must state plainly that this facade describes board chrome, trust state, manifest
metadata, reload, status, busy state, and secondary panels only. It does not add snapshot, click,
type, or other content interaction inside the board's cross-origin iframe; those operations are
the EPIC-089 automation surface. board_refresh is not deleted or edited in this task, and its
retirement is verified only after this facade is exercised live by the later EPIC-088 acceptance
task.

## Implementation Plan

### 1. Add the board facade and canonical public types

Create src/renderer/scripting/api-wrapper/BoardEditorFacade.ts, following the Git Tree and
Archive facade structure:

- Define static members for id, name, boardRoot, boardName, renderState, getManifest,
  secondaryViews, statusText, busy, frameReady, contentHostError, reload, and the inherited
  elements / highlight descriptor members.
- Implement all state from BoardEditorModel.state, boardTrust, the model's frame registries,
  and the model helper for manifest reads. Return fresh objects/arrays for manifest and secondary
  view snapshots.
- Add aiVision with kind BoardEditor, BOARD_ELEMENTS, BOARD_MEMBERS, the help text described
  above, provide: elements.provide, elements: BOARD_ELEMENTS, and a summary that includes the
  editor id, render state, board root, board name, frame readiness, busy state, and status text
  without probing the view.
- Implement restricted() only for the untrusted render state. It must not restrict not-found or
  content-host-error state.
- Implement reload() by requiring a page id and board root, short-circuiting non-trusted
  renderState to { refreshed: true, pageId, frameReady: false, renderState }, otherwise calling
  the shared model reloadAndWait(), and returning
  { refreshed: true, pageId, frameReady, renderState }.

Before:

~~~ts
// PageWrapper.ts currently falls back for board ids.
const factory = editor ? FACADE_FOR_EDITOR[id] : undefined;
return factory ? factory(editor, id, name) : new GenericEditorFacade(id, name);
~~~

After:

~~~ts
const factory = editor
    ? FACADE_FOR_EDITOR[id]
        ?? (isBoardEditorId(id) ? BOARD_FACADE_FACTORY : undefined)
    : undefined;
return factory ? factory(editor, id, name) : new GenericEditorFacade(id, name);
~~~

Create src/renderer/api/types/board-editor.d.ts with the public render-state, manifest,
secondary-view, reload-result, and IBoardEditor declarations. Use board-view or board-editor:<root>
for the board id so custom-editor pages retain a typed board identity. Add the new type to
IEditorFacade and the board id to IFacadeEditorId in src/renderer/api/types/page.d.ts:28-44.
Do not edit generated assets/editor-types/ files; they will be refreshed by the normal generator.

### 2. Centralize and reuse frame-ready reload

Add BoardEditorModel.reloadAndWait(): Promise<boolean> beside reloadBoard() in
src/renderer/editors/board/BoardEditorModel.ts:543-551. It must register the existing
waitForFrameLoad(BOARD_CDP_TAB) promise before calling reloadBoard(), and return that promise's
boolean. It must not inspect the iframe or duplicate the timeout/loaded-set logic. The facade,
not this helper, performs the non-trusted render-state short-circuit.

Before:

~~~ts
const ready = board.waitForFrameLoad(BOARD_CDP_TAB);
board.reloadBoard();
return { result: { refreshed: true, pageId: page.id, frameReady: await ready } };
~~~

After:

~~~ts
const frameReady = await board.reloadAndWait();
return { result: { refreshed: true, pageId: page.id, frameReady } };
~~~

Leave src/renderer/api/mcp/board-commands.ts:48-61 unchanged: board_refresh keeps its current
ordering, timeout, and response behavior, while the facade reuses the same model waiter through
reloadAndWait(). Keep src/main/mcp/tools/board-tools.ts:28-34 unchanged: this task does not
delete or alter board_refresh; US-1332 performs the live retirement check.

### 3. Register the facade for plain and custom board editors

Update src/renderer/scripting/api-wrapper/PageWrapper.ts:25-64, :66-90, :167-175:

- Import BoardEditorModel, BoardEditorFacade, and isBoardEditorId.
- Add BoardEditorFacade to EditorFacade.
- Add the board-view factory to FACADE_FOR_EDITOR.
- Use the isBoardEditorId() fallback for board-editor:<root> ids, preserving the existing
  customEditorRegistry name lookup at :169-171.

The model instance passed to the factory must be the page's main editor; no facade may create a
second model or inspect a view. Existing non-board editor ids continue to use their current
factory or GenericEditorFacade.

### 4. Add the one missing control name and build the curated descriptor

Update src/renderer/editors/board/UntrustedBoardView.ts:39-45 with
name: board-trust. Do not rename any existing board name or type. Leave the toolbar and
secondary-view names unchanged, but verify each update path listed in the curation table.

In BoardEditorFacade.ts, declare exactly the five curated elements from the table. Use
pageScopeSelector(pageId) as scopeSelector, activatePageAndWaitForLayout(pageId) as
beforeHighlight, and { all: true } as highlightOptions. Do not add a selector for the portalled
board switcher or for structural roots. board-secondary-view stays panel-owned, not
editor-owned.

### 5. Expose model-backed render, manifest, panel, status, busy, and frame state

Implement the state table exactly:

- renderState uses only BoardEditorModel.state and boardTrust.isTrusted(), with the
  contentHostError string kept separate.
- getManifest() calls a model-side wrapper around readBoardManifest() and maps missing or
  malformed manifests from null to undefined; it returns copied known metadata and never
  returns a live parsed object.
- secondaryViews reads state.secondaryViewDefs behind the separate resolved-board gate
  (renderState discriminator / state.selectedBoard), projects secondaryViewDefs ?? [] through
  boardSecondaryPanelId(), and copies the records. It reports a real empty array for a valid
  manifest with no declarations, and undefined for an unresolved/not-found board even if stale
  persisted definitions remain. Add the current panel expansion only from the page model; do not
  call BoardSecondaryView.
- statusText maps the model's empty clear value to undefined; it does not read the footer.
- busy reports undefined for an unresolved board and state.busy ?? false for a resolved board; it
  does not infer running state from the DOM or frame.
- frameReady returns undefined with no mounted main frame, false for a mounted but not yet
  loaded frame, and true only after the existing loadedTabs signal.
- Every optional absent value follows the audit table. Preserve genuine empty arrays and genuine
  booleans; never use null, empty string, 0, or false to stand for unavailable data. The
  contentHostError assignment uses errMessage(), whose fallback guarantees non-empty text, so
  no empty-to-undefined mapping is needed there.

### 6. Document the trust, dialog, and EPIC-089 boundaries in help

The descriptor help must name:

- the Trust-this-Board dialog (shown as Trust this board?) and the dialogs[0] resolution path;
- src/renderer/ui/dialogs/TrustBoardDialog.ts and
  src/renderer/scripting/ai-vision/dialogs/trust-board.ts as the dialog implementation and
  adapter paths;
- restricted() only for untrusted content, with not-found explicitly unrestricted;
- the shared reload result and frameReady: false timeout behavior;
- board-secondary:*, statusText, busy, and the fact that sidebar expansion/closure belongs to
  page.panels;
- the honest boundary that no board-iframe snapshot/click/type operation exists here and EPIC-089
  owns that content automation.

### 7. Verify without adding tests

Review the source after implementation for the five-element inventory, page-scoped selectors,
{ all: true }, every name-preserving update, dynamic board-id registration, model-only render
state, the absent-value table, shared reload ordering, restricted-state behavior, and the exact
reload result. Do not add unit tests or a test harness; this project does not use them for this
surface. The later live surface acceptance belongs to US-1332.

## Concerns

- **Content-host error is not one of the three trust states.** BoardEditorView has a real fourth
  branch. The facade must keep renderState: trusted plus contentHostError rather than hide the
  error or incorrectly label it untrusted; restricted() remains undefined because this is not a
  privacy boundary.
- **Dynamic custom-editor ids need runtime fallback.** A literal board-view map entry alone would
  leave board-editor:<root> pages on GenericEditorFacade; isBoardEditorId() is the verified
  discriminator and must be used in PageWrapper.
- **Reload failure is a result, not a thrown timeout.** The existing waiter intentionally resolves
  false on timeout/disposal. A trusted facade reload preserves that signal and adds renderState;
  untrusted/not-found reloads skip the impossible wait and immediately return frameReady: false
  with renderState. The legacy tool keeps its current handler behavior.
- **Trust cannot be automated through a setter.** The only trust path remains the user-confirmed
  Trust-this-Board dialog (shown as Trust this board?) followed by the existing namespace collision confirmation. The facade
  reports the state and the dialog path but never accepts a trust boolean or writes the trust list.
- **Popover and iframe controls are outside this facade's element contract.** The board switcher is
  portalled and the board content is cross-origin; neither can be made honest with a page-scoped
  selector. Sidebar panels remain under page.panels, and iframe automation is EPIC-089.
- **Absent values require manual review.** strictNullChecks is disabled. The implementation must
  preserve the explicit undefined versus real empty-array/boolean distinctions in the audit table.
- **Generated declarations are not source files.** Update only src/renderer/api/types/; do not
  hand-edit assets/editor-types/*.d.ts.
- **No retirement marking occurs here.** board_refresh remains intact until US-1332 exercises
  pages[i].editor.reload() live through call.

## Acceptance Criteria

- [ ] pages[i].editor returns BoardEditorFacade for board-view and board-editor:<root> pages,
      with the existing editor id/name preserved.
- [ ] IBoardEditor is added to the canonical IEditorFacade union and its generated asset is not
      hand-edited.
- [ ] The facade reports renderState: trusted | untrusted | not-found from model state and
      boardTrust, never from DOM queries; contentHostError separately reports the existing trusted
      content-host error branch.
- [ ] restricted() returns text only for the untrusted state. Trusted and not-found boards are
      not restricted; not-found is not treated as private content.
- [ ] help names the Trust-this-Board dialog (shown as Trust this board?), dialogs[0], TrustBoardDialog.ts, and
      scripting/ai-vision/dialogs/trust-board.ts; no facade member silently grants trust or accepts
      a trust decision.
- [ ] reload() has the exact Promise<{ refreshed: true; pageId: string; frameReady: boolean;
      renderState: "trusted" | "untrusted" | "not-found" }> shape, uses BOARD_CDP_TAB explicitly
      for the shared waiter/frame lookup, short-circuits untrusted/not-found with frameReady:
      false, and returns false rather than throwing when a trusted board frame times out or is
      disposed; reloadAndWait() and the legacy handler retain their existing semantics.
- [ ] A non-board page has no board reload() member, while the unchanged legacy handler retains
      its existing not-a-board error; no boards.refresh() member is added.
- [ ] The absent-value audit is implemented exactly: optional unavailable values are undefined,
      never false, 0, empty string, or null; genuine [] and false values remain distinguishable.
- [ ] secondaryViews exposes copied board-secondary:<id> declarations and expansion state from
      model/page state, while page.panels remains the owner of sidebar controls and layout.
- [ ] statusText, busy, frameReady, and contentHostError are model-backed and never read from the
      board iframe or footer DOM.
- [ ] Exactly five page-scoped elements are curated: board-toolbar-explorer,
      board-toolbar-reload, board-toolbar-log, board-toolbar-properties, and the new board-trust,
      each with the stated purpose and { all: true } highlighting.
- [ ] Existing data-name/data-type values are not renamed; board-trust is the only added name;
      every curated name survives construction and all later UIKit updates.
- [ ] help honestly states that board iframe snapshot/click/type is not part of this task and is
      owned by EPIC-089.
- [ ] src/main/mcp/tools/board-tools.ts is unchanged, no tests or harness are added, the
      dashboard is unchanged, and no commit is created.

## Files Changed

| File | Planned change |
| --- | --- |
| doc/tasks/US-1325-board-page-surface/README.md | This verified implementation plan, state/absence contract, reload contract, element curation, trust boundary, concerns, and acceptance criteria. |
| src/renderer/scripting/api-wrapper/BoardEditorFacade.ts | New model-backed board facade, five curated page-scoped elements, reload(), getManifest(), render-state restriction, secondary/status/busy/frame projections, and help. |
| src/renderer/scripting/api-wrapper/PageWrapper.ts | Register the board facade for board-view and dynamic ids recognized by isBoardEditorId(). |
| src/renderer/api/types/board-editor.d.ts | Canonical IBoardEditor, manifest/panel snapshots, render-state, and reload-result declarations. |
| src/renderer/api/types/page.d.ts | Add the board facade type and board editor id form to the canonical facade unions. |
| src/renderer/editors/board/BoardEditorModel.ts | Add the model-side manifest wrapper and the shared reloadAndWait() orchestration around the existing waiter and reload action. |
| src/renderer/editors/board/UntrustedBoardView.ts | Add name: board-trust to the existing Trust board button. |

Files intentionally needing **no changes**:

- src/main/mcp/tools/board-tools.ts - keep board_refresh and its documentation intact until
  US-1332 verifies live retirement.
- src/renderer/api/mcp/board-commands.ts - keep the existing board_refresh handler ordering,
  timeout, and response behavior intact; the facade-only short-circuit is in this task.
- src/renderer/editors/board/BoardEditorView.ts, BoardToolbar.ts, BoardWebview.ts,
  BoardNotFoundView.ts, BoardSecondaryView.ts, BoardsTreeView.ts, custom-editor-registry.ts,
  board-manifest.ts, and board-secondary.ts - their existing render branches, toolbar handlers,
  iframe lifecycle, panel registration, id predicate, manifest parsing, and panel-id helpers are
  the verified sources reused by the facade; only UntrustedBoardView needs a name addition.
- src/renderer/api/board-trust.ts, src/renderer/ui/dialogs/TrustBoardDialog.ts, and
  src/renderer/scripting/ai-vision/dialogs/trust-board.ts - existing trust storage, dialog, and
  AiVision adapter remain the authority; the facade only describes their path.
- src/renderer/scripting/api-wrapper/GitTreeEditorFacade.ts, ArchiveEditorFacade.ts,
  src/renderer/scripting/ai-vision/elements.ts, and page-elements.ts - existing facade, element,
  page-scope, and highlight behavior is reused.
- src/renderer/api/types/index.d.ts, src/renderer/api/types/page-panels.d.ts, and the
  src/renderer/scripting/ai-vision/page-panels.ts panel implementation - existing sidebar
  ownership already exposes live panel records; this task does not duplicate panel actions in the
  board facade.
- assets/editor-types/*.d.ts - generated output only; never hand-edit.
- Unit tests, a test harness, docs/**, doc/active-work.md, doc/epics/EPIC-088.md, and commits -
  explicitly out of scope; the dashboard and epic already list US-1325.

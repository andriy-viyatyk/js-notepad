# US-1217 — The dialog shell: lift Escape once, then collapse the thin models

## Goal

Give the shared dialog shell one Escape-dispatch path while preserving each dialog's exact close
result, event ordering, and non-Escape keyboard behavior. After that first step, remove only the
dialog-specific model subclasses that contain no state or public behavior beyond the duplicated
Escape handler. This document records the investigation and implementation plan; it does not
implement the change.

This task belongs to EPIC-077 (doc/epics/EPIC-077.md), §C-3/§C-4 (US-1217), and addresses the
§C-5 risk that Strand 2 has no runtime failure signal. No dashboard entry, unit test, test harness,
or commit is part of this task.

## Background

### Verified Escape census

The current tree has **14 application dialog files** with a model-level Escape branch: 13 under
src/renderer/ui/dialogs/ and src/renderer/editors/link-editor/EditLinkDialog.ts. The epic's
"at least twelve" figure is therefore verified as 14 files. There are 15 Escape checks if the
second, input-local Password path is counted separately: PasswordDialogView.ts:180 duplicates
the model path in the same dialog. The 14 dialog files and exact current lines are:

| Dialog file | Current Escape line | Current behavior |
|---|---:|---|
| src/renderer/ui/dialogs/ConfirmationDialog.ts | 26 | Prevents default; closes with undefined. |
| src/renderer/ui/dialogs/CommitDialog.ts | 44 | Prevents default; closes with undefined; also handles Ctrl/Cmd+Enter. |
| src/renderer/ui/dialogs/CreateBoardVarsStorageDialog.ts | 29 | Prevents default; closes with undefined; also handles Enter submit. |
| src/renderer/ui/dialogs/CreateBoardDialog.ts | 44 | Prevents default; closes with undefined; also handles Enter submit. |
| src/renderer/ui/dialogs/InputDialog.ts | 39 | Prevents default; closes with undefined; also handles Enter submit. |
| src/renderer/ui/dialogs/LibrarySetupDialog.ts | 78 | Prevents default; closes with undefined; also handles Enter link. |
| src/renderer/ui/dialogs/NamespaceCollisionDialog.ts | 16 | Prevents default; closes with false. |
| src/renderer/ui/dialogs/OpenUrlDialog.ts | 17 | Prevents default; closes with undefined; also handles Ctrl+Enter submit. |
| src/renderer/ui/dialogs/PasswordDialog.ts | 55 | Prevents default; closes with undefined. |
| src/renderer/ui/dialogs/RegisterToolsetDialog.ts | 26 | Prevents default; closes with false. |
| src/renderer/ui/dialogs/TextDialog.ts | 47 | Prevents default; closes with undefined; contains a Monaco editor. |
| src/renderer/ui/dialogs/TorInfoDialog.ts | 28 | Prevents default; closes with undefined; also starts async Tor work. |
| src/renderer/ui/dialogs/TrustBoardDialog.ts | 15 | Prevents default; closes with false. |
| src/renderer/editors/link-editor/EditLinkDialog.ts | 39 | First returns when defaultPrevented; otherwise prevents default and closes with undefined; also handles Ctrl/Cmd+Enter. |

The extra Password path is at src/renderer/ui/dialogs/PasswordDialogView.ts:178-180: its
password and confirmation input elements each have a view-owned keydown listener at :141-142,
which calls close(undefined) for Escape before the event bubbles to the dialog root. The lift must
remove only that input-local Escape branch, leaving its Enter-to-submit behavior, so Escape is
handled once at the shell.

### Event and disposal ownership

DialogView is the actual keyboard boundary. Its onMount() attaches
this.listen(this.root, "keydown", this.onKeyDown) at src/renderer/uikit/Dialog/DialogView.ts:68;
this is a listener on each dialog root, not on document, an input, or the outer DialogsView. The
event bubbles from child inputs and from the Monaco host to that root. DialogView.onKeyDown at
:149-174 currently forwards the event to the optional DialogProps.onKeyDown callback before its
Tab-trap logic.

The close/disposal authority is the dialog model and dialog collection: TDialogModel.close and
its onClose callback are at src/renderer/core/state/model.ts:58-82; showDialog() installs the
callback that removes the data item and resolves the promise at
src/renderer/ui/dialogs/DialogsView.ts:134-144; and DialogsView disposes the native view and
removes its root at :103-117. The model is not disposed by DialogsView, so the shell must call the
model's existing close, not merely remove a DOM node or invoke a document-level callback.

The selected owner is therefore **DialogView for the event gate, using an onEscape close callback
supplied by the view that owns the model**. This preserves the existing root-level event scope and
lets DialogView call preventDefault() exactly where the keyboard event is available. The callback
invokes TDialogModel.close, where result resolution and removal are owned. Adding a document
listener would make all open dialogs compete for one event, alter topmost-dialog ordering, and
potentially dismiss a different dialog; attaching to an input would miss clicks on the shell and
make dismissal depend on focus. Putting the whole event policy in TDialogModel loses because the
model does not receive an event unless a view forwards it, and it would still require every shell
to forward a callback while hiding the actual DOM boundary.

The proposed DialogProps.onEscape?: () => void is deliberately separate from onKeyDown, with this
precise contract:

~~~ts
// Before: src/renderer/uikit/Dialog/Dialog.ts:13
onKeyDown?: (event: KeyboardEvent) => void;

// After: retain custom keys and add a shell-owned Escape shorthand.
/** Escape shorthand. DialogView calls onKeyDown first. If onKeyDown calls
 * preventDefault(), onEscape is not called. If both hooks are supplied, onKeyDown
 * runs first for every key; for an unhandled Escape, DialogView prevents default
 * and then calls onEscape. Non-Escape keys never call onEscape. */
onEscape?: () => void;
onKeyDown?: (event: KeyboardEvent) => void;
~~~

This additive prop is permitted by the UIKit authoring rule at
src/renderer/uikit/CLAUDE.md:263-264 (Rule 7): when an existing interaction need cannot be
expressed by existing props, extend the native component's prop surface with a new explicit prop.
`onEscape` is explicit and additive; it does not replace or weaken `onKeyDown`.

The planned DialogView.onKeyDown ordering and contract are:

~~~ts
// Before: src/renderer/uikit/Dialog/DialogView.ts:149-153
this.props.onKeyDown?.(event);
if (event.defaultPrevented || event.key !== "Tab") return;

// After: the general hook runs first; an unconsumed Escape uses the shorthand.
this.props.onKeyDown?.(event);
if (event.key === "Escape" && !event.defaultPrevented && this.props.onEscape) {
    event.preventDefault();
    this.props.onEscape();
    return;
}
if (event.defaultPrevented || event.key !== "Tab") return;
~~~

The `onKeyDown` hook therefore always runs first. When both hooks are supplied, an Escape that the
consumer has not prevented is handled by the shell; a consumer that calls preventDefault() opts out
without an exclusion. Monaco's text-area input prevents default for Escape but does not stop
propagation (node_modules/monaco-editor/esm/vs/editor/browser/controller/editContext/textArea/textAreaEditContextInput.js:110-124).
TextDialog is the explicit exception: its existing handler at TextDialog.ts:44-49 intentionally
closes even when Monaco has already default-prevented the event, so that handler stays first and
the view does not route TextDialog through onEscape. EditLinkDialog's handler at
EditLinkDialog.ts:37-47 already honors defaultPrevented; remove only its Escape branch, add the
shared onEscape callback, and let the shell preserve that gate. It is therefore no longer an
exclusion. No other inspected application dialog confirms first, ignores Escape while busy, is
modal-but-not-dismissable, or performs Escape-specific cleanup.

### Per-dialog behavior differences

All 14 model paths prevent default and dismiss; they are not identical in result value or other
key behavior. The implementation must preserve these facts:

- NamespaceCollisionDialog, TrustBoardDialog, and RegisterToolsetDialog resolve false on Escape,
  not undefined. Their shared shell calls must therefore be explicit
  onEscape: () => model.close(false) callbacks.
- CommitDialog, CreateBoardDialog, CreateBoardVarsStorageDialog, InputDialog, LibrarySetupDialog,
  and OpenUrlDialog retain their non-Escape Enter/Ctrl+Enter behavior in their model handlers after
  the Escape branch is removed.
- PasswordDialogView retains its input-level Enter submit path at :178-180, but its input-level
  Escape close is removed because the root shell now owns Escape.
- TextDialog retains its Monaco-specific model Escape path at TextDialog.ts:44-49. The model
  handler runs before any shell shorthand and deliberately closes despite Monaco's default
  prevention; this is the one explicit shared-shell exclusion.
- TorInfoDialog may be loading or reconnecting, but its current Escape handler has no busy guard;
  Escape closes during either state, and existing viewDisposed checks prevent late async writes.
  Do not add a busy guard.
- CommitDialogModel.canClose at src/renderer/ui/dialogs/CommitDialog.ts:61-69 rejects only
  after view disposal or for a submitted result whose onAction rejects; Escape passes undefined
  and does not confirm first.
- EditLinkDialog keeps its defaultPrevented gate and Ctrl/Cmd+Enter save behavior, but its Escape
  branch moves to the shared shell. A nested consumer that default-prevents Escape opts out through
  the common contract, so EditLinkDialog is not an exclusion.

### Thin-model assessment

Step 2 is deliberately after Step 1. Once the shell owns Escape, these four subclasses contain no
dialog-specific model behavior:

| Model | What remains after Step 1 | Decision |
|---|---|---|
| ConfirmationDialogModel | Generic TDialogModel state containing title, message, and buttons, plus inherited close; no custom state or public method. | Collapse the subclass; construct TDialogModel directly and let the view supply onEscape: () => model.close(undefined). |
| NamespaceCollisionDialogModel | Generic state containing namespace and collidingRoot, plus inherited close; no custom state or public method. | Collapse the subclass; construct the generic model directly and preserve false through the view's explicit Escape callback. |
| TrustBoardDialogModel | Generic state containing boardPath, plus inherited close; no custom state or public method. | Collapse the subclass; construct the generic model directly and preserve false through the view's explicit Escape callback. |
| RegisterToolsetDialogModel | Generic state containing toolsetName, toolsetRoot, and tools, plus inherited close; no custom state or public method. | Collapse the subclass; construct the generic model directly and preserve false through the view's explicit Escape callback. |

The generic TDialogModel instance is still required because showDialog() requires the shared
state, close, result, and onClose contract. “Collapse” means removing the empty dialog-specific
subclass, not moving state or close ownership into raw DOM.

The following ten models stay because each has real state, a public method used by its view/callers,
an asynchronous lifecycle, or a deliberate event policy:

| Model | Why it stays |
|---|---|
| CommitDialogModel | Field setters, submit, canClose, onAction, committing state, and view-disposal protection; retains Ctrl/Cmd+Enter. |
| CreateBoardVarsStorageDialogModel | path/creating state, setPath, browse, async submit, and disposeView; retains Enter submit. |
| CreateBoardDialogModel | folder/name/creating state, setters, async scaffold submit, and disposeView; retains Enter submit. |
| InputDialogModel | Mutable value/selected-option state and setters; retains validation and Enter submit. |
| LibrarySetupDialogModel | Folder/copy/linking state, setters, async browse/link, and disposeView; retains Enter link. |
| OpenUrlDialogModel | Value state plus setValue, submit, and openFile; retains Ctrl+Enter. |
| PasswordDialogModel | Password/confirmation/error state, validation, and submit; input Enter remains view-specific. |
| TextDialogModel | editorText, constructor initialization, and handleEditorChange are the Monaco result boundary. |
| TorInfoDialogModel | Loading/reconnecting/info state, postCreate, async load/reconnect, and disposeView. |
| EditLinkDialogModel | Link-edit state, setters, save operation, and the intentional defaultPrevented/Ctrl+Enter keyboard policy. |

## Investigation commands

Commands used to derive and verify the claims above:

~~~text
Get-Content -Raw CLAUDE.md
Get-Content -Raw .claude/rules/task-docs.md
Get-Content -Raw doc/epics/EPIC-077.md
Get-Content -Raw doc/active-work.md
Get-Content -Raw doc/standards/model-view-pattern.md
Get-Content -Raw src/renderer/uikit/CLAUDE.md
rg -n -i 'prop|childrenFactory|additive|public|shared|component|API|contract|backward|breaking' src/renderer/uikit/CLAUDE.md
rg --files src/renderer | rg 'Dialog|dialog'
rg -n 'Escape' src/renderer/ui/dialogs src/renderer/editors/link-editor/EditLinkDialog.ts
rg -n 'listen\(this\.root, "keydown"|private readonly onKeyDown|this\.props\.onKeyDown' src/renderer/uikit/Dialog/DialogView.ts
rg -n 'handleKeyDown =|event\.key === "Escape"|if \(e\.key === "Escape"' src/renderer/ui/dialogs/TextDialog.ts src/renderer/editors/link-editor/EditLinkDialog.ts
rg -n 'class .*Model extends TDialogModel|class .*DialogModel extends TDialogModel|export class .*DialogModel extends TDialogModel|handleKeyDown = ' src/renderer/ui/dialogs src/renderer/editors/link-editor/EditLinkDialog.ts
rg -n 'onKeyDown: \(event\) => model\.handleKeyDown|onKeyDown: \(event\) => this\.model\.handleKeyDown' src/renderer/ui/dialogs src/renderer/editors/link-editor/EditLinkDialogView.ts
rg -n 'new DialogView\(' src/renderer/ui/dialogs src/renderer/editors/link-editor src/renderer/uikit/Dialog src/renderer/editors/grid/components src/renderer/editors/browser/BrowserDownloadsPopup.ts
rg -n 'listen\(this\.root, "keydown"|listen\([^,]+, "keydown"' src/renderer/uikit/Dialog/DialogView.ts src/renderer/ui/dialogs src/renderer/editors/link-editor/EditLinkDialogView.ts
rg -n -C 8 'close\(|canClose|onClose|disposeView|loading|reconnecting|creating|linking|handleInputKeyDown|defaultPrevented' src/renderer/ui/dialogs src/renderer/editors/link-editor/EditLinkDialog.ts
rg -n 'showConfirmationDialog|showCommitDialog|showCreateBoardDialog|showCreateBoardVarsStorageDialog|showInputDialog|showLibrarySetupDialog|showNamespaceCollisionDialog|showOpenUrlDialog|showPasswordDialog|showRegisterToolsetDialog|showTextDialog|showTorInfoDialog|showTrustBoardDialog|showEditLinkDialog' src/renderer --glob '*.ts'
rg -n 'registerDialogView|new PopoverView|onClose:|onKeyDown:' src/renderer/ui/dialogs/poppers src/renderer/editors/grid/components/CsvOptions.ts src/renderer/editors/grid/components/ColumnsOptions.ts src/renderer/editors/browser/BrowserDownloadsPopup.ts
rg -n -i 'Escape|KeyCode\.Escape|keydown|stopPropagation|preventDefault' node_modules/monaco-editor/esm/vs/editor/browser/controller/editContext/textArea/textAreaEditContextInput.js node_modules/monaco-editor/esm/vs/editor/browser/controller/editContext/native/nativeEditContext.js
~~~

The search found the 14 model-level application files listed above, one additional
PasswordDialogView.ts:180 input path, and no production DialogView use beyond those 14
application views. It also found no application dialog model whose Escape branch confirms first,
checks a busy flag, refuses dismissal, or performs cleanup unique to Escape.

## Implementation Plan

The order below is mandatory: complete and manually verify Step 1 before removing any model
subclass in Step 2.

### Step 1 — lift Escape into the existing dialog-root shell

1. Modify src/renderer/uikit/Dialog/Dialog.ts to add optional
   onEscape?: () => void to DialogProps. Document that onKeyDown runs first, that its
   preventDefault() suppresses onEscape, and that when both are supplied the shell calls onEscape
   only for an unconsumed Escape; non-Escape behavior remains onKeyDown's existing contract.
2. Modify src/renderer/uikit/Dialog/DialogView.ts:onKeyDown so the root listener calls the
   consumer's onKeyDown first, then handles event.key === "Escape" only when it is not
   defaultPrevented and onEscape exists: call preventDefault(), invoke onEscape, and return before
   the Tab-trap path. Keep it on the dialog root; do not add a document listener, an outer
   DialogsView listener, or an input listener.
3. In these 13 shared-shell application views, replace the shell's model Escape forwarding with an explicit
   onEscape close callback while preserving all other view construction and ownership:
   src/renderer/ui/dialogs/ConfirmationDialogView.ts,
   src/renderer/ui/dialogs/CommitDialogView.ts,
   src/renderer/ui/dialogs/CreateBoardVarsStorageDialogView.ts,
   src/renderer/ui/dialogs/CreateBoardDialogView.ts,
   src/renderer/ui/dialogs/InputDialogView.ts,
   src/renderer/ui/dialogs/LibrarySetupDialogView.ts,
   src/renderer/ui/dialogs/NamespaceCollisionDialogView.ts,
   src/renderer/ui/dialogs/OpenUrlDialogView.ts,
   src/renderer/ui/dialogs/PasswordDialogView.ts,
   src/renderer/ui/dialogs/RegisterToolsetDialogView.ts,
   src/renderer/ui/dialogs/TorInfoDialogView.ts, and
   src/renderer/ui/dialogs/TrustBoardDialogView.ts, plus
   src/renderer/editors/link-editor/EditLinkDialogView.ts. Use undefined for the undefined-result
   dialogs and false for Namespace/Trust/Register. Keep onKeyDown in the six views whose models
   still process Enter/Ctrl+Enter, and in EditLinkDialog for Ctrl/Cmd+Enter, but those model
   handlers must no longer process Escape.
   Keep TextDialogView's existing onKeyDown path as the explicit Monaco exclusion described above.
4. In the ten staying models that retain a keyboard handler, remove only the Escape branch and
   its early return where present. Keep the exact non-Escape behavior in CommitDialog.ts,
   CreateBoardVarsStorageDialog.ts, CreateBoardDialog.ts, InputDialog.ts, LibrarySetupDialog.ts,
   OpenUrlDialog.ts, and EditLinkDialog.ts. Remove the model-level Escape handler from Password
   and Tor after their views have the shell callback; their other state/lifecycle methods remain.
   TextDialog.ts keeps its model-level Escape path because Monaco's default-prevented event must
   retain its current close behavior.
5. In src/renderer/ui/dialogs/PasswordDialogView.ts, change handleInputKeyDown at :178-181 to
   retain only Enter-to-submit. The shell callback handles Escape after the event bubbles from
   either password input. Do not add stopPropagation, which would make the shell miss Escape.
6. In src/renderer/editors/link-editor/EditLinkDialog.ts, remove only the Escape branch while
   retaining the early defaultPrevented gate and Ctrl/Cmd+Enter save behavior. Add the shared
   onEscape callback in EditLinkDialogView.ts. Because DialogView runs onKeyDown first and honors
   defaultPrevented, nested consumers retain the existing opt-out behavior; EditLinkDialog is not
   an exclusion.
7. Before Step 2, manually exercise every row in the acceptance matrix below. Specifically check
   Escape from the dialog body and from its focused input/editor, check the expected resolved
   result where the caller exposes one, and check that two concurrently visible dialogs do not
   let a root-level Escape handler dismiss a sibling.

Before → after for a retaining model:

~~~ts
// Before: src/renderer/ui/dialogs/OpenUrlDialog.ts:16-24
handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
        e.preventDefault();
        this.close(undefined);
    }
    if (e.key === "Enter" && e.ctrlKey) { /* submit */ }
};

// After: the shell handles Escape; the model still owns Ctrl+Enter.
handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey) { /* submit */ }
};
~~~

Before → after for the special Password input:

~~~ts
// Before: src/renderer/ui/dialogs/PasswordDialogView.ts:178-180
if (event.key === "Enter") this.model.submit();
else if (event.key === "Escape") void this.model.close(undefined);

// After: Escape bubbles to DialogView.onEscape; Enter remains local behavior.
if (event.key === "Enter") this.model.submit();
~~~

### Step 2 — collapse only the four empty subclasses

8. After Step 1 has passed its manual checks, remove the four subclass declarations and construct
   the generic TDialogModel directly in their existing show functions in
   ConfirmationDialog.ts, NamespaceCollisionDialog.ts, TrustBoardDialog.ts, and
   RegisterToolsetDialog.ts. Keep their exported IDs, prop/state interfaces, default-state
   construction, registry registrations, public show functions, and result types. The views keep
   reading model.state; only the empty handleKeyDown type intersections/imports disappear.
9. Keep the ten models named in the thin-model assessment as model classes. Do not move their
   state, async operations, setters, validation, editor result boundary, or disposal guards into
   views. The only movement for those models is the common Escape branch into the shell and the
   removal of that branch from their existing handler where applicable.
10. Re-run the census searches. The expected result is no duplicated model-level Escape branch in
    the 13 shared-shell app dialog models, one intentional TextDialog model-level Escape branch
    for Monaco, one shell implementation in DialogView, and no second Password input Escape branch.

## Concerns

- **Result preservation is load-bearing.** false versus undefined is observable to callers even
  where both are currently treated as cancellation. Namespace collision, board trust, and
  toolset registration must use explicit false-valued Escape callbacks.
- **Event ordering is load-bearing.** The listener remains on each DialogView.root. The general
  onKeyDown hook runs first; only an unprevented Escape reaches onEscape. A document listener would
  change which dialog wins when multiple entries are in dialogsState, and an input listener would
  change dismissal based on focus. Monaco's preventDefault is not a propagation stop, so the shared
  shell must honor defaultPrevented while TextDialog retains its deliberate local override.
- **EditLink uses the shared contract.** Its defaultPrevented check remains the consumer opt-out for
  nested Escape handlers, while its Escape close moves to onEscape. It is not an exclusion.
- **Password currently closes twice on Escape from its inputs.** One close occurs at the input and
  one at the root. Removing only the input Escape branch makes the new shell the sole path while
  retaining Enter submit; the manual check must verify one visible dismissal and no repeated
  follow-up action.
- **Busy operations must remain dismissable.** Create-board, create-storage, library-link, and
  Tor flows have async work and disposal guards, but no current Escape busy guard. Do not infer
  that disabled buttons make Escape non-dismissable.
- **Thin-model meaning is constrained.** The four collapsed classes still have generic model
  instances for reactive display state and close; only their empty subclasses disappear. A model
  with any listed real state/public method remains.
- **Verification has no automated failure signal.** There is no unit-test harness for this task.
  Structural checks are npm run typecheck, npm run lint, and npm run build-prod after
  implementation, but the manual matrix below is the behavioral acceptance criterion. Record any
  dialog that could not be reached in the running app rather than implying coverage.

## Acceptance Criteria

- [ ] The verified count remains 14 application dialog files with model-level Escape handling
      before the change; the final source has one shared Escape branch in
      src/renderer/uikit/Dialog/DialogView.ts, no duplicated Escape branch in shared-shell models,
      and only the explicitly retained TextDialog Monaco branch.
- [ ] Escape is handled by the existing DialogView.root keydown listener, not document, an input,
      or DialogsView; it calls preventDefault() and the model-backed close callback.
- [ ] TextDialog preserves its existing Monaco behavior: its local model handler closes on Escape
      even when Monaco default-prevents the event. EditLinkDialog uses the shared onEscape hook;
      DialogView runs its onKeyDown first and honors defaultPrevented, so no exclusion is needed.
- [ ] Namespace collision, trust-board, and register-toolset Escape resolve false; all other
      participating shared-shell dialogs preserve their current undefined Escape result.
- [ ] Commit, create-board, create-storage, input, library, and open-URL non-Escape keyboard
      actions remain unchanged; Password retains input Enter submit; Tor remains dismissable while
      loading/reconnecting and retains its async disposal guards.
- [ ] Exactly four dialog-specific subclasses collapse: Confirmation, NamespaceCollision,
      TrustBoard, and RegisterToolset. Exactly ten models stay for the state/method/lifecycle
      reasons recorded above. TextDialogModel is among the ten staying models and remains the
      explicit Monaco exclusion; EditLinkDialogModel stays but uses the shared Escape hook.
- [ ] The Password input-local Escape branch at PasswordDialogView.ts:180 is gone, leaving one
      shell dismissal path; no unrelated input or editor keyboard behavior changes.
- [ ] Every dialog in the manual matrix is exercised from its verified running-app entry point.
      For each row, Escape is tested from the body and the row's focused input/editor, and the
      expected close result or caller cancellation is observed.
- [ ] npm run typecheck, npm run lint, and npm run build-prod are green after implementation; no
      unit tests or test harnesses are added. The final report records any manual reachability
      limitation explicitly.
- [ ] No files listed under Files needing no changes are modified, no dashboard entry is added,
      and no commit is created.

### Manual acceptance matrix

| Dialog | Verified running-app entry point | Escape-specific check |
|---|---|---|
| Confirmation | Explorer Boards → Delete Board (BoardsSecondaryView.ts:458), Git Changes reset (GitChangesView.ts:290), or app.ui.confirm (api/ui.ts:30). | Focus body and, when available, a button; press Escape and verify cancellation (undefined/null) with no destructive action. |
| Commit | Open a Git Tree editor with changes and activate Commit; GitChangesView.ts:301. | Escape from each commit input closes without invoking onAction; separately verify Ctrl/Cmd+Enter still submits. |
| Create board | Explorer Boards panel → create board or demo board; BoardsSecondaryView.ts:403 and :412. | Escape from folder/name and while Create is busy; verify dismissal and no late create/update reaches the disposed view. |
| Create environment-variable storage | Settings storage Create (SettingsSections.ts:296) or an unconfigured board-vars request (board-vars-bridge.ts:51). | Escape from path and while creating; verify dismissal and cancellation result. |
| Input | app.ui.input (api/ui.ts:39), Git Tree create branch (GitTreeEditorModel.ts:273), or Script Panel save (ScriptPanel.ts:251). | Escape in text input and with radio options; verify no Enter submission and caller cancellation. |
| Library setup | Sidebar Script Library → Link (ScriptLibraryPanelView.ts:90) or Script Panel when unlinked (ScriptPanel.ts:227). | Escape from folder input and while linking; verify close and no late update to disposed view. |
| Namespace collision | Register/trust a board whose manifest author/name collides with an already trusted board; namespace.ts:59-62. | Escape the advisory and verify the flow receives false and does not register. |
| Open URL | Application File → Open, backed by PagesLifecycleModel.ts:489. | Escape in the multiline URL textarea; verify close, while Ctrl+Enter still submits. |
| Password | app.ui.password (api/ui.ts:48) or an environment-store password prompt. | Escape from both password and confirmation inputs; verify one dismissal, no submit/validation side effect, and cancellation. |
| Register toolset | Open an untrusted toolset manifest through Explorer; ExplorerSecondaryView.ts:269. | Escape and verify the MCP/toolset caller receives false and does not register. |
| Text | app.ui.textDialog (api/ui.ts:58), or a script/video error calling ScriptRunner.ts:62. | Verify body Escape closes; with Monaco focused, verify the existing local handler still closes despite Monaco default prevention and editor input remains intact. |
| Tor info | In a Tor-enabled Browser editor, click toolbar Tor connection info; BrowserTorModel.ts:33-34. | Escape during lookup, reconnect, and loaded states; verify dismissal and no post-disposal repaint. |
| Trust board | Open an untrusted board or Board Info → Trust; BoardEditorView.ts:264 and api/boards.ts:82. | Escape and verify false, no continuation to namespace/trust registration, and normal focus return. |
| Edit link | Link editor Add/Edit Link (LinkEditor.ts:1018) or browser bookmark Add/Edit (BrowserBookmarksUIModel.ts:295). | Verify an unconsumed Escape closes through onEscape, a nested defaultPrevented Escape does not, and Ctrl/Cmd+Enter still saves. |

### Files needing no changes

These files were inspected and are explicitly outside the implementation scope:

| File | Reason |
|---|---|
| src/renderer/core/state/model.ts | TDialogModel owns generic close/result semantics but not the DOM event boundary; no change is needed when the shell owns onEscape. |
| src/renderer/ui/dialogs/DialogsView.ts | Existing showDialog resolution and root disposal are correct; a document/collection listener would be the wrong scope. |
| src/renderer/ui/dialogs/dialog-view-registry.ts | Registry typing and model transport remain valid; the callback is a DialogProps concern. |
| src/renderer/uikit/Dialog/DialogContentView.ts | Header close button remains an ordinary model close call; it does not own keyboard scope. |
| src/renderer/uikit/Dialog/Dialog.story.ts | Story-only dialog supplies its own onKeyDown/closeDialog at :278-283; it is not a production TDialogModel dialog. |
| src/renderer/ui/dialogs/TextDialog.ts | Explicit Monaco exclusion: its model Escape handler intentionally closes after Monaco default-prevents the event, preserving the current editor behavior. |
| src/renderer/ui/dialogs/TextDialogView.ts | Explicit Monaco exclusion: it continues passing TextDialogModel.handleKeyDown at :53 instead of routing Escape through onEscape. |
| src/renderer/ui/dialogs/poppers/PoppersView.ts | Popper collection host; children use PopoverView, not the modal DialogView root. |
| src/renderer/ui/dialogs/poppers/types.ts | TPopperModel only inherits generic dialog close and stores position; no Escape handler is present. |
| src/renderer/ui/dialogs/poppers/showPopupMenu.ts | App popup menu is a PopoverView surface at :182, not a modal dialog shell. |
| src/renderer/editors/grid/components/CsvOptions.ts | Grid options uses PopoverView at :174-180; no modal DialogView Escape path. |
| src/renderer/editors/grid/components/ColumnsOptions.ts | Columns options uses PopoverView at :439-450; no modal DialogView Escape path. |
| src/renderer/editors/browser/BrowserDownloadsPopup.ts | Downloads surface uses PopoverView at :270-275; it is not a modal dialog shell. |
| src/renderer/uikit/Popover/PopoverView.ts | Popover has its own outside/Escape close contract and is not changed by the modal lift. |
| src/renderer/uikit/Popover/PopoverModel.ts | Popover state and positioning model only; no duplicated modal Escape handler. |
| node_modules/monaco-editor/esm/vs/editor/browser/controller/editContext/textArea/textAreaEditContextInput.js | Read-only dependency evidence: Monaco prevents default for Escape but does not stop propagation; dependency files are not edited. |
| node_modules/monaco-editor/esm/vs/editor/browser/controller/editContext/native/nativeEditContext.js | Read-only dependency evidence; native edit-context handling is not application code. |

## Files Changed summary

| File | Planned change |
|---|---|
| doc/tasks/US-1217-dialog-shell/README.md | This verified investigation and implementation plan. |
| src/renderer/uikit/Dialog/Dialog.ts | Add optional shell-level onEscape callback type. |
| src/renderer/uikit/Dialog/DialogView.ts | Run onKeyDown first, honor defaultPrevented, then handle unconsumed Escape once at the existing dialog-root listener while preserving the Tab trap. |
| src/renderer/ui/dialogs/ConfirmationDialog.ts | Remove the empty subclass; construct the generic dialog model. |
| src/renderer/ui/dialogs/ConfirmationDialogView.ts | Supply the shared undefined-result Escape callback and remove the handler-only type intersection. |
| src/renderer/ui/dialogs/NamespaceCollisionDialog.ts | Remove the empty subclass; construct the generic dialog model. |
| src/renderer/ui/dialogs/NamespaceCollisionDialogView.ts | Supply the shared false-result Escape callback and remove the handler-only type intersection. |
| src/renderer/ui/dialogs/TrustBoardDialog.ts | Remove the empty subclass; construct the generic dialog model. |
| src/renderer/ui/dialogs/TrustBoardDialogView.ts | Supply the shared false-result Escape callback and remove the handler-only type intersection. |
| src/renderer/ui/dialogs/RegisterToolsetDialog.ts | Remove the empty subclass; construct the generic dialog model. |
| src/renderer/ui/dialogs/RegisterToolsetDialogView.ts | Supply the shared false-result Escape callback and remove the handler-only type intersection. |
| src/renderer/ui/dialogs/CommitDialog.ts / CommitDialogView.ts | Remove only model Escape forwarding; retain commit state, can-close policy, and Ctrl/Cmd+Enter. |
| src/renderer/ui/dialogs/CreateBoardVarsStorageDialog.ts / CreateBoardVarsStorageDialogView.ts | Lift only Escape; retain Enter, async create, and disposal guard. |
| src/renderer/ui/dialogs/CreateBoardDialog.ts / CreateBoardDialogView.ts | Lift only Escape; retain Enter, async scaffold, and disposal guard. |
| src/renderer/ui/dialogs/InputDialog.ts / InputDialogView.ts | Lift only Escape; retain value/options state and Enter submit. |
| src/renderer/ui/dialogs/LibrarySetupDialog.ts / LibrarySetupDialogView.ts | Lift only Escape; retain Enter link, async work, and disposal guard. |
| src/renderer/ui/dialogs/OpenUrlDialog.ts / OpenUrlDialogView.ts | Lift only Escape; retain Ctrl+Enter submit and URL/file actions. |
| src/renderer/ui/dialogs/PasswordDialog.ts / PasswordDialogView.ts | Lift Escape to the shell; retain password state/validation and input Enter submit. |
| src/renderer/ui/dialogs/TorInfoDialog.ts / TorInfoDialogView.ts | Lift Escape to the shell; retain load/reconnect behavior and disposal guards. |
| src/renderer/editors/link-editor/EditLinkDialog.ts / EditLinkDialogView.ts | Lift Escape to the shared shell; retain the defaultPrevented opt-out and Ctrl/Cmd+Enter save behavior. |

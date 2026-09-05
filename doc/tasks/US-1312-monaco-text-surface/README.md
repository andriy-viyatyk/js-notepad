# US-1312: The Monaco/text surface

Epic: [EPIC-086](../../epics/EPIC-086.md) - Task 3 of 8 in the page node redesign and the
text-and-preview editor family.

Status: Implemented.

## Goal

Complete the `TextEditorFacade` for the `monaco` page surface. The facade must describe every
editor-owned, user-visible text control with a truthful purpose, stable `data-name`, and page-scoped
visibility; it must also expose the text actions and state an agent needs to answer "what can I do
on this text page?" without claiming that absent conditional controls exist.

This task follows US-1311's page-scoping proof. It does not own `page-editor-switch` or
`page-nav-panel`, which remain on `editorSwitches` and `panels` respectively per EPIC-086 decision 8
([EPIC-086.md:95-99](../../epics/EPIC-086.md:95)).

## Background

### Roadmap checklist and contract

The epic's required surface work is the roadmap checklist: a descriptor, an exhaustive curated
`elements` list with one-line purposes and `data-name`s, callable actions with `caution`, named
dialogs/menus in `$help`, applicable privacy/trust restrictions, surface QA, and only then tool
retirement ([doc/agent-transparency-roadmap.md:133-146](../../agent-transparency-roadmap.md:133)).
The selector contract uses `data-name` for semantic handles and keeps `data-type` load-bearing;
new names may be added, but existing `data-type` values must not be renamed
([doc/architecture/ui-element-contract.md:7-30](../../architecture/ui-element-contract.md:7)).
US-1311 already supplies the repeated-page identity and activation infrastructure: page-owned
selectors use `[data-page-id="<id>"]`, `elements.visible` is a literal layout observation, and
highlighting a slot-hosted element activates the page before drawing
([US-1311 README](../US-1311-page-scoped-elements/README.md:128)).

### Current facade and page wiring

`TextEditorFacade` currently declares only four text toolbar elements—`text-compare-left`,
`text-run-script`, `text-run-all-script`, and `text-show-resources`—at
`src/renderer/scripting/api-wrapper/TextEditorFacade.ts:7-12`. Its member list contains identity,
mount state, selection/cursor/navigation, highlighting, insertion, and selection replacement at
`TextEditorFacade.ts:14-24`; its help still calls the four controls a proof surface at lines 26-30.
The descriptor already uses `createElements`, `pageScopeSelector`, and
`activatePageAndWaitForLayout` at `TextEditorFacade.ts:35-48`, so US-1312 extends the existing
contract rather than creating a second resolver.

The current page identity and resolver implementation is already usable: `createElements` resolves
declared names, scopes selector branches, computes `visible` with `offsetParent`, and passes the
same selector through the pre-highlight hook and overlay at
`src/renderer/scripting/ai-vision/elements.ts:64-75` and `elements.ts:90-143`.
`activatePageAndWaitForLayout` calls `pagesModel.showPage` and waits for the requested slot to have a
non-zero layout rectangle at `src/renderer/scripting/ai-vision/page-elements.ts:15-40`.

### Verified render tree and complete control inventory

`TextChromeView` creates the shared page toolbar, four text-specific toolbar contribution views, an
optional script panel, and a footer for a real `TextFileModel` at
`src/renderer/editors/base/TextChromeView.ts:338-401`. Monaco's body is the `children` slot and
creates the named `monaco-body` container at `src/renderer/editors/monaco/MonacoBodyView.ts:37-56`;
the actual Monaco widget is created by `MonacoEditorHostView` at
`src/renderer/editors/shared/MonacoEditorHostView.ts:16-52`.

The controls below are the complete editor-owned actionable inventory found by following that tree.
The first four already have names and declarations; the remaining names are emitted by child views
but are not yet in `TEXT_ELEMENTS`.

| Control and purpose | `data-name` evidence | Condition / planned facade declaration |
|---|---|---|
| Compare this text page with the left grouped page. | `TextChromeView.ts:92-102` | Rendered only when an owner page has a left grouped page and `pagesModel.canCompare` is true (`TextChromeView.ts:73-90`). Existing declaration. |
| Run the current or selected script. | `TextChromeView.ts:152-163` | Rendered only for a script language and an editor with `runScript` (`TextChromeView.ts:144-150`). Existing declaration. |
| Run the complete script rather than only the selection. | `TextChromeView.ts:168-180` | Rendered only when the script-language run branch is active and the Monaco selection flag is true. Existing declaration; otherwise `visible: false`. |
| Show extracted resources referenced by an HTML text file. | `TextChromeView.ts:233-243` | The button is removed unless `host.state.language === "html"` (`TextChromeView.ts:224-231`). Existing declaration; otherwise `visible: false`. |
| Open or close the related script panel. | `ContentHostFooterView.ts:68-84` | Rendered only when the text host has a script model. Add/retain `text-toggle-script` from `ContentHostFooterView.ts:72-80`. |
| Resize the open script panel. | `ScriptPanelView.ts:276-282` | Present only while the script panel state is open (`ScriptPanelView.ts:119-132`). Add `script-panel-splitter`. |
| Run the related script, or its selection. | `ScriptPanelView.ts:285-293` | Present while the script panel is open. Add `script-run`; its title changes with `hasSelection`. |
| Run all related-script content. | `ScriptPanelView.ts:295-303` | Created only when `hasSelection` is true and released when selection disappears (`ScriptPanelView.ts:198-207`, `225-233`). Add `script-run-all`; absent means `visible: false`. |
| Select an ad-hoc or library script. | `ScriptPanelView.ts:305-315` | Present while the script panel is open. Add `script-select`. |
| Save the current script to the script library. | `ScriptPanelView.ts:318-326` | Present while open; disabled, rather than absent, when `dirty` is false (`ScriptPanelView.ts:320-325`). Add `script-save`; `visible` describes DOM presence, not enabled state. |
| Open the selected script, or a library-rooted empty page, in a new tab. | `ScriptPanelView.ts:329-337` | Present while open. Add `script-open-tab`. |
| Close the related script panel. | `ScriptPanelView.ts:339-347` | Present while open. Add `script-close`. |

`text-chrome-root`, `text-chrome-top`, `text-chrome-footer`, `script-panel`,
`script-monaco-host`, and `monaco-body` are structural roots, not actionable controls. They are
still evidence of the rendered tree at `TextChromeView.ts:274-282`, `TextChromeView.ts:356-392`,
`ContentHostFooterView.ts:51-66`, and `ScriptPanelView.ts:152-189`; do not inflate the curated
control inventory with containers. `page-editor-switch` is created by `PageToolbarView` at
`src/renderer/editors/base/PageToolbarView.ts:300-318` and belongs to `page.editorSwitches`.
`page-nav-panel` is created at `PageToolbarView.ts:196-216` and belongs to `page.panels`.

### Conditional visibility contract

The implementation must preserve the existing `createElements` semantics. A declaration remains in
the static `elements` list even when its view is conditionally removed; `visible` is recomputed from
the page-scoped selector and rendered layout, and must be `false` when the control is absent. No
missing script, selection, compare partner, or HTML control may be converted into a fabricated
`found: true` or `visible: true`. This follows the resolver's actual `querySelectorAll` plus
`offsetParent` test at `src/renderer/scripting/ai-vision/elements.ts:90-97` and the normal overlay
result path at `elements.ts:129-143`.

The exact cases to cover are:

- `text-compare-left`: only when the page has a left grouped page and `canCompare(left, owner)`;
  the view removes the button otherwise (`TextChromeView.ts:73-110`).
- `text-run-script`: only for `isScriptLanguage(language)` and a model `runScript` method
  (`TextChromeView.ts:144-160`).
- `text-run-all-script` and `script-run-all`: selection-dependent; each must be false when its
  corresponding selection state is false (`TextChromeView.ts:152-181`; `ScriptPanelView.ts:198-233`).
- `text-show-resources`: HTML-language only (`TextChromeView.ts:224-238`).
- `text-toggle-script`: only when `TextFileModel.script` exists (`TextChromeView.ts:364-376`).
- all script-panel controls and splitter: only while `ScriptPanelState.open` is true
  (`ScriptPanelView.ts:119-132`, `152-207`).

`text-run-all-script` and `script-run-all` also depend on `MonacoEditorState.hasSelection`, which is
non-persisted and defaults to `false` on restore (`src/renderer/editors/monaco/MonacoEditor.ts:17-22`).
They are therefore absent immediately after a restart until the current selection state is rebuilt;
that absence is expected and must remain `visible: false`, not be treated as a regression.

### Encryption, menus, and dialogs

Encryption is not a persistent toolbar control. The text host contributes its menu to the page-tab
context menu through `EditorModel.onGetMenuItems` and `TextFileModel.onGetMenuItems`
(`src/renderer/editors/base/EditorModel.ts:246-256`; `src/renderer/editors/text/TextEditorModel.ts:442-445`).
The menu has `Decrypt` (disabled unless encrypted), `Encrypt` or `Change Password` (disabled when
encrypted), and `Make Unencrypted` (disabled unless decrypted) at
`src/renderer/editors/shared/editor-menu-items.ts:69-107`. These are transient popup-menu actions,
not page-slot `elements`, so their state is menu-item `enabled`, not `elements.visible`; `$help`
must name them and direct the agent to `menus[0].items` and
`menus[0].click(label)`, whose live contract is `src/renderer/scripting/ai-vision/menus/index.ts:17-37`.

The facade nevertheless needs encryption state and safe actions. `TextFileModel` already has
`encrypted`, `decrypted`, and `withEncryption` getters at
`src/renderer/editors/text/TextEditorModel.ts:252-266`, plus encryption delegates at lines 447-453.
The task implementation should expose these read-only state properties and only the correctly named
facade operations `showEncryptionDialog(message?)`, `encryptWithCurrentPassword()`, and
`makeUnencrypted()`. Encrypting or unlocking is done through the password dialog, which the agent
drives through `dialogs[i]` with buttons and cancel only; no facade member accepts a raw password.
Every operation that writes file content or changes encryption must carry `caution`; raw passwords
must never be returned or included in summaries. The password dialog itself is privacy-preserving:
it offers only `Encrypt`/`Decrypt` and `Cancel` through its adapter at
`src/renderer/scripting/ai-vision/dialogs/password.ts:9-33`, while its view names the input,
submit, and cancel controls at `src/renderer/ui/dialogs/PasswordDialogView.ts:43-109`.

The surface can raise these dialogs, all of which must be named in `TEXT_EDITOR_HELP` / `$help`:

| Surface path | Dialog / reason | Evidence |
|---|---|---|
| Encryption menu or facade encryption action | Password dialog for encrypt/decrypt; the agent sees buttons and cancel only, never the password. | `TextFileEncryptionModel.ts:150-160`; `dialogs/password.ts:19-33`. |
| Rename menu/facade action | Input dialog titled `Rename File`. | `src/renderer/editors/text/TextEditorModel.ts:428-440`; `src/renderer/api/ui.ts:38-43`. |
| Close/release of modified text | Confirmation dialog titled `Unsaved Changes` with Save / Don't Save / Cancel. | `TextFileActionsModel.ts:73-96`. |
| Save ad-hoc script to library | Library setup dialog when no library path, then an input dialog for script name/folder. | `src/renderer/editors/text/ScriptPanel.ts:223-259`; `src/renderer/ui/dialogs/LibrarySetupDialog.ts:89-101`; `src/renderer/ui/dialogs/InputDialog.ts:65-75`. |
| Overwrite an existing library script | Confirmation dialog with Overwrite / Cancel. | `ScriptPanel.ts:275-285`. |
| Script output error when output is suppressed | Read-only Monaco text dialog titled `Script Error`. | `src/renderer/scripting/ScriptRunner.ts:49-72`. |

The surface also raises the page-tab popup menu containing Save, Save As, Rename, file-path actions,
HTML-only Open in Browser, and the encryption group (`editor-menu-items.ts:69-107`). Showing HTML
resources opens resource pages or emits a notification; it does not raise a dialog
(`TextChromeView.ts:523-535`). There is no text-surface privacy/trust restriction beyond the
password rule; `restricted()` is not required.

### Find / replace reachability

The reusable `FindBarView` is used by browser and markdown views, not Monaco
(`src/renderer/editors/shared/FindBarView.ts:26-87`; `src/renderer/editors/markdown/MarkdownBodyView.ts:408-425`).
Monaco is created as a standalone editor with its own built-in UI at
`src/renderer/editors/shared/MonacoEditorHostView.ts:37-52`; this repository does not add a
Monaco `FindBarView`, `find-input`, `find-next`, `find-prev`, or replace control to the text surface.
The only current facade-side find behavior is programmatic decoration through
`setHighlightText`, implemented by `MonacoBodyView.ts:289-305` and advertised at
`TextEditorFacade.ts:18-23`.

Monaco does expose supported command IDs for the native widgets: `actions.find`,
`editor.action.startFindReplaceAction`, `editor.action.replaceOne`, and
`editor.action.replaceAll` are defined at
`node_modules/monaco-editor/esm/vs/editor/contrib/find/browser/findModel.js:43-60`, and the
editor API exposes `editor.trigger(source, handlerId, payload)` at
`node_modules/monaco-editor/monaco.d.ts:2851`. Therefore the implementation plan must add a
mounted-editor bridge for `openFind()` and `openReplace()` (with `openReplace()` marked `caution`
because replacement can mutate content), using typed queue events through `MonacoEditor.ts` and
`MonacoBodyView.ts` so calls are safe before mount. It must not invent `elements` declarations for
controls the renderer cannot address with a stable app-owned `data-name`, and it must not add a
second custom find bar to this task. Native replace execution remains a caution-bearing action;
the facade help should state that the widget is Monaco-native rather than a persistent page element.

### Script output and action members

The main toolbar invokes `MonacoEditor.runScript`, which selects the current Monaco selection unless
`all` is requested and calls `runScriptWith` at `src/renderer/editors/monaco/MonacoEditor.ts:107-127`.
The script panel invokes `runRelatedScript` through `ScriptPanelModel` at
`src/renderer/editors/text/ScriptPanelView.ts:285-302`; `TextFileModel` exposes both action delegates
at `TextEditorModel.ts:455-459`. UI-mode output is written to the grouped page unless suppressed;
suppressed errors open the Script Error dialog (`ScriptRunner.ts:47-72`).

The facade member inventory should consequently add, where the underlying host is a
`TextFileModel`, read-only state for encryption and script-panel state, plus methods for:

- `runScript(all?: boolean)` and `runRelatedScript(all?: boolean)` — execute user code; `caution`;
- `openSearchInNavPanel()` — opens the file navigator/search panel when the host has a path or
  sidebar (`TextFileActionsModel.ts:37-46`); `caution` because it changes page UI;
- `saveFile(saveAs?: boolean)`, `renameFile(newName: string)`, and `promptRename()` — write or
  rename files; `caution` and dialog notes;
- encryption state and actions described above; all writes carry `caution`;
- `openFind()` and `openReplace()` as the native Monaco bridge described above;
- script-panel state/actions needed to explain and use `text-toggle-script`, `script-select`,
  `script-save`, `script-open-tab`, and `script-close`, with `caution` on library/file-writing
  operations. Their underlying model methods are at `ScriptPanel.ts:114-124`, `199-221`,
  `223-297`, and `306-332`.

The missing public surface should be resolved explicitly rather than by exposing the whole model:

| Facade member group | Planned public members | Evidence / safety |
|---|---|---|
| Encryption state | `encrypted: boolean \| undefined`, `decrypted: boolean \| undefined`, `withEncryption: boolean \| undefined` | `TextEditorModel.ts:252-266`; read-only properties, with no password value; `undefined` means no text host is attached. |
| Encryption actions | `showEncryptionDialog(message?)`, `encryptWithCurrentPassword()`, `makeUnencrypted()` | `TextEditorModel.ts:447-453`; no raw-password member is exposed, and all state/content changes are `caution`-bearing. |
| File actions | `saveFile`, `renameFile`, `promptRename`, `openSearchInNavPanel` | `TextEditorModel.ts:423-440`, `455-459`; writes and UI-opening calls are caution-bearing and may raise the dialogs above. |
| Script actions/state | `runScript`, `runRelatedScript`, script selection/open/save/close state and actions; host-backed state is `... \| undefined` | `TextEditorModel.ts:455-459`; `ScriptPanel.ts:114-124`, `176-221`, `223-332`; execution and library writes are caution-bearing. |
| Find/replace | `openFind`, `openReplace` | Supported native Monaco command IDs and `editor.trigger` are verified above; `openReplace` is caution-bearing. |

Do not expose the raw-password delegates `encript` or `decrypt` from
`TextEditorModel.ts:447-450`; the password-dialog flow is the only unlock/encrypt path visible to
the agent. Do not expose lifecycle hooks `confirmRelease`/`canClose` or internal error/input hooks
`alertEncryptionError`/`handleKeyDown` from `TextEditorModel.ts:455-463`; they are not user-facing
capabilities. The canonical public types must match the implemented facade exactly.

## Implementation Plan

1. **Extend the text facade descriptor.** In
   `src/renderer/scripting/api-wrapper/TextEditorFacade.ts`, expand `TEXT_ELEMENTS` with
   `text-toggle-script`, `script-panel-splitter`, `script-run`, `script-run-all`, `script-select`,
   `script-save`, `script-open-tab`, and `script-close`. Keep the four existing names byte-for-byte;
   do not add `page-editor-switch` or `page-nav-panel`. Keep all declarations page-scoped using the
   existing `createElements` options at `TextEditorFacade.ts:35-40`, and update help to state the
   literal visibility and activation behavior.

2. **Preserve the verified control names.** `text-toggle-script` already has a UIKit name and the
   script controls/splitter already have names in `ContentHostFooterView.ts:68-84` and
   `ScriptPanelView.ts:274-347`; no new `data-name` attribute is currently required. Verify the
   mounted UIKit roots emit those names. If implementation discovers an app-owned control for this
   task that genuinely lacks one, add the `data-name` in its owning view and record the exact
   file/line here; do not rename any `data-type`. Do not add names to Monaco's internal generated
   DOM or to structural roots just to increase the count.

3. **Add the missing facade members and canonical types.** Update
   `TEXT_EDITOR_MEMBERS`, the `TextEditorFacade` methods/getters, and
   `src/renderer/api/types/text-editor.d.ts` together. Narrow the content host to
   `TextFileModel` using the repository's existing model guard/pattern, keep password values private,
   and mark every write, script execution, UI-opening, encryption, rename, save, replacement, and
   library mutation with an explicit `caution`. Add only members that can be implemented against
   the current model; avoid exposing internal `alertEncryptionError` or `handleKeyDown`.

4. **Define the null-host contract before implementing host-backed members.** `TextEditorFacade`
   holds a `MonacoEditor`, whose typed host accessor can be null while `_host` starts detached or
   after extraction (`src/renderer/editors/base/TextHostEditorModel.ts:57`, `82`, `134-136`).
   When that accessor is null, encryption and script-panel state getters return `undefined`, never
   `false`; action methods throw a diagnostic that names the reason, such as `Text editor action
   unavailable: no text host attached`, instead of resolving silently. Apply this contract to every
   host-backed member, document it in `$help`, and keep the normal conditional-control `visible`
   semantics separate from host absence.

5. **Bridge the verified native find/replace commands.** Add typed queue events in
   `MonacoEditor.ts` and dispatch them from `MonacoBodyView.ts` to the mounted Monaco editor using
   `editor.trigger("api", "actions.find", undefined)` and
   `editor.trigger("api", "editor.action.startFindReplaceAction", undefined)`. Keep the queue
   safe before mount. Add `{ type: "openFind" }` and `{ type: "openReplace" }` to the
   fire-and-forget `MonacoQueueEvent` union, and handle them in `MonacoBodyView`'s event switch
   beside `revealLine`/`focus` (`src/renderer/editors/monaco/MonacoEditor.ts:6-15`). Expose
   `openFind(): void` and caution-bearing `openReplace(): void` through the facade, like
   `revealLine`, not `Promise<void>`. Retain `setHighlightText` as the programmatic all-match
   decoration operation. Do not add a fake selector or a second custom find bar for Monaco's native
   widget.

6. **Name the dialogs and popup menu in `$help`.** Update `TEXT_EDITOR_HELP` with the password,
   rename, unsaved-change, script-library setup/name/overwrite, and Script Error dialog cases, and
   the page-tab popup-menu items. State that most text elements are conditional and that a majority
   report `visible: false` on an ordinary text page, so invisible entries are expected. Cross-reference
   `dialogs[i]` and `menus[0]`; do not duplicate transient dialog controls in page-scoped `elements`.

7. **Keep generated typings generated.** Edit only `src/renderer/api/types/text-editor.d.ts` for
   canonical declarations. `assets/editor-types/*.d.ts` is generated by the `editorTypesPlugin` in
   `vite.renderer.config.ts:8-47`, which copies canonical declarations during Vite `buildStart`;
   run `npm run build-prod` (or start the Vite dev server with `npm run start`) to regenerate it.
   Never hand-edit `assets/editor-types/`.

8. **Add the text-surface QA file now.** Create `qa/surfaces/editors/text.md` in this task, using
   `qa/surfaces/page.md`'s call-only scenario format (`qa/surfaces/page.md:1-62`) and covering:
   two same-kind pages and scoped inventories; script-language and non-script conditional states;
   selection-driven run-all, including its absent-after-restart state because `hasSelection` is
   non-persisted and defaults to false (`MonacoEditor.ts:17-22`); HTML-only resources; grouped compare availability; script panel open,
   selection, save, and close controls; encryption state/menu/dialog privacy; native find/replace
   actions; script output/suppressed-error behavior; inactive-page
   highlight activation; and a no-fabricated-success assertion for every missing conditional.
   This task owns the file because each surface task has the implementation-specific scenarios;
   US-1317 should only run these files and add the index row. Deferring the file to US-1317 would
   lose the exact inventory and conditional assertions while the implementation is fresh.

9. **Verify without unit tests.** Run typecheck, lint, and the relevant production build after
   implementation, then run the manual call-only scenarios. No unit tests or test harnesses are in
   scope because this project does not use them. Verify no selector reports a hidden/absent control
   as visible or found, and verify the page-scoped selector returned in `elements` is the selector
   used by `highlight`.

### Before -> after snippets

```ts
// src/renderer/scripting/api-wrapper/TextEditorFacade.ts (current)
const TEXT_ELEMENTS = [
    { name: "text-compare-left", purpose: "..." },
    { name: "text-run-script", purpose: "..." },
    { name: "text-run-all-script", purpose: "..." },
    { name: "text-show-resources", purpose: "..." },
];

// planned
const TEXT_ELEMENTS = [
    // the four existing declarations, unchanged
    { name: "text-toggle-script", purpose: "Open or close the related script panel." },
    { name: "script-panel-splitter", purpose: "Resize the open related script panel." },
    { name: "script-run", purpose: "Run the related script or its selection." },
    { name: "script-run-all", purpose: "Run all related-script content when selected text exists." },
    { name: "script-select", purpose: "Select an ad-hoc or library script." },
    { name: "script-save", purpose: "Save the current script to the library." },
    { name: "script-open-tab", purpose: "Open the selected script in a new page." },
    { name: "script-close", purpose: "Close the related script panel." },
];
```

```ts
// src/renderer/scripting/api-wrapper/TextEditorFacade.ts (current)
const TEXT_EDITOR_MEMBERS: readonly IAiMember[] = [
    // identity, mount, selection, cursor, edit, and line members only
];

// planned additions (exact signatures must match the canonical .d.ts)
{ name: "encrypted", kind: "property", summary: "Whether the text content is encrypted." },
{ name: "decrypted", kind: "property", summary: "Whether this encrypted file is currently unlocked." },
{ name: "withEncryption", kind: "property", summary: "Whether this text file has encryption state." },
{ name: "showEncryptionDialog", kind: "method", signature: "showEncryptionDialog(message?: string): Promise<void>", caution: "opens the button/cancel-only password dialog" },
{ name: "encryptWithCurrentPassword", kind: "method", signature: "encryptWithCurrentPassword(): Promise<void>", caution: "encrypts file content without accepting a password" },
{ name: "makeUnencrypted", kind: "method", signature: "makeUnencrypted(): Promise<void>", caution: "removes encryption from file content" },
{ name: "runScript", kind: "method", signature: "runScript(all?: boolean): Promise<void>", caution: "executes user code and can write grouped output" },
{ name: "openReplace", kind: "method", signature: "openReplace(): void", caution: "opens a UI that can mutate editor content" },
```

## Concerns

- **Conditional controls:** declarations must be static and page-scoped, while `visible` and
  highlight results remain literal. The view removes controls from the DOM in several branches;
  absent is not success (`TextChromeView.ts:84-90`, `147-150`, `224-230`; `ScriptPanelView.ts:123-132`).
- **Detached host:** `MonacoEditor` can outlive an extracted or not-yet-attached
  `TextFileModel` (`TextHostEditorModel.ts:57`, `82`, `134-136`). Host-backed state must return
  `undefined` in that interval, never a fabricated `false`; host-backed actions must throw a
  diagnostic naming `no text host attached` rather than silently resolving.
- **Toolbar ownership:** the text facade owns text contributions; `editorSwitches` owns
  `page-editor-switch`; `panels` owns `page-nav-panel`. This is the epic's state-explaining ownership
  rule, not a reason to duplicate declarations (`PageToolbarView.ts:373-387`; EPIC-086 decision 8).
- **Find/replace:** Monaco's native widget has supported command IDs but no app-owned selector in
  this codebase. Bridge the commands through the mounted editor, expose the actions, and do not
  report a persistent `elements` selector or fabricate `found: true`.
- **Transient UI:** popup menu rows intentionally expose labels through `menus`, not stable
  `data-name`s (`src/renderer/uikit/Menu/MenuView.ts:145-176`); dialog interaction belongs to
  `dialogs` adapters. The text help must name these surfaces without claiming they are persistent
  editor elements.
- **Generated output:** `assets/editor-types/` must be regenerated by Vite and never edited by hand
  (`vite.renderer.config.ts:8-47`).
- **Coding constraints:** no unit tests or test harnesses; no hardcoded colours; use `errMessage`
  for caught `unknown` values; use `file-path` utilities rather than `require("path")`. These are
  mandatory project standards from `doc/agents-common.md:282-284` and must remain explicit in the
  implementation review.
- **Script and encryption writes:** all script execution, file saves/renames, replacement, library
  writes, encryption/decryption, and unencrypt operations need `caution`; password input is never
  readable from the agent tree.
- **Encryption privacy:** raw-password delegates `encript(password)` and `decrypt(password)` are
  not facade members. Encryption and unlocking go through `showEncryptionDialog` and its
  button/cancel-only `dialogs[i]` adapter; only `encryptWithCurrentPassword()` and
  `makeUnencrypted()` are exposed as non-password actions.
- **QA ownership:** this task writes `qa/surfaces/editors/text.md`; US-1317 runs the completed
  surface files and maintains the index. This keeps the surface's exact conditional inventory beside
  its implementation plan.

## Acceptance Criteria

- `TextEditorFacade.elements` declares the four existing text-toolbar controls plus
  `text-toggle-script`, `script-panel-splitter`, `script-run`, `script-run-all`, `script-select`,
  `script-save`, `script-open-tab`, and `script-close`, each with a one-line purpose and a verified
  emitted `data-name`; no structural root is mislabeled as an actionable control.
- `page-editor-switch` appears only under `page.editorSwitches`, and `page-nav-panel` appears only
  under `page.panels`; the text facade does not duplicate either selector.
- Every declared selector is page-scoped by the US-1311 resolver. Active-page visibility is literal;
  inactive-page highlighting activates and waits for layout; absent conditional controls remain
  `visible: false` and return the normal not-found result.
- Script language, selection, HTML, compare availability, script-panel open state, and disabled
  `script-save` behavior are covered in `qa/surfaces/editors/text.md` with call-only scenarios.
- The facade help names the page-tab popup menu and all dialogs this surface raises: password,
  rename input, unsaved-change confirmation, library setup/name/overwrite dialogs, and Script Error;
  it also says that most text elements are conditional and a majority report `visible: false` on
  an ordinary text page.
- Facade members expose encryption state, script execution/output actions, file and library actions,
  and verified find/replace reachability. All writing or UI-changing members carry `caution`; raw
  passwords are not exposed.
- When the text host is null, encryption and script-panel state getters return `undefined`, and
  every host-backed action throws a diagnostic naming `no text host attached`; no host-backed call
  silently resolves or turns the absence into `false`.
- Native Monaco find/replace is bridged through supported commands, exposed as caution-aware facade
  actions, and deliberately has no fabricated persistent `elements` entry.
- Canonical types are updated only under `src/renderer/api/types/`; `assets/editor-types/` is
  regenerated by Vite, never hand-edited. No `data-type` is renamed, no hardcoded colours are added,
  caught values use `errMessage`, and path handling uses `file-path`.
- Typecheck, lint, production build, and manual QA pass; no unit tests or harnesses are added.

## Files that need NO changes

- `src/renderer/scripting/ai-vision/elements.ts` - US-1311 already provides page scoping, literal
  visibility, and pre-highlight activation; US-1312 only consumes it.
- `src/renderer/scripting/ai-vision/page-elements.ts` - page identity and bounded layout waiting
  already satisfy the text facade's page activation contract.
- `src/renderer/scripting/ai-vision/page-editor-switches.ts` - owns the editor switch and is outside
  the text facade.
- `src/renderer/scripting/ai-vision/page-panels.ts` - owns navigation/sidebar controls, including
  `page-nav-panel`, and is outside the text facade.
- `src/renderer/editors/base/PageToolbarView.ts` - its existing `page-editor-switch` and
  `page-nav-panel` ownership is correct; no rename or duplicate declaration is needed.
- `src/renderer/editors/base/TextChromeView.ts` - the four existing text-toolbar names and their
  conditional render branches are already correct; only the facade inventory/help consumes them.
- `src/renderer/editors/base/ContentHostFooterView.ts` and
  `src/renderer/editors/text/ScriptPanelView.ts` - all required script-panel names are already
  emitted at the verified lines; no view change or `data-type` rename is needed.
- `src/renderer/editors/shared/MonacoEditorHostView.ts` - it only mounts the Monaco widget; the
  command bridge belongs at the `MonacoEditor`/`MonacoBodyView` boundary and does not require a
  host-view change.
- `src/renderer/editors/shared/FindBarView.ts` - belongs to browser/markdown, not Monaco; do not
  make it a text-surface dependency.
- `src/renderer/scripting/ai-vision/menus/index.ts` and `dialogs/index.ts` - existing live menu and
  dialog adapters already cover transient UI; only text facade help needs cross-references.
- `doc/architecture/ui-element-contract.md` - the `data-name` and `data-page-id` rules are already
  documented; no contract change is required unless implementation discovers a genuinely new rule.
- `assets/editor-types/` - generated output only; regenerate from canonical declarations.
- `doc/active-work.md` and `doc/epics/EPIC-086.md` - orchestrator-owned and explicitly out of scope.

## Files Changed Summary

| Path | Current status | Planned change |
|---|---|---|
| `doc/tasks/US-1312-monaco-text-surface/README.md` | New task document | Record verified inventory, decisions, implementation plan, constraints, and acceptance criteria. |
| `src/renderer/scripting/api-wrapper/TextEditorFacade.ts` | Four elements and core Monaco members | Add complete text elements, state/actions, caution/help, dialog/menu references, and native find/replace actions. |
| `src/renderer/api/types/text-editor.d.ts` | Core Monaco typings only | Add the implemented text state/actions/elements contract. |
| `src/renderer/editors/monaco/MonacoEditor.ts` | No find/replace facade bridge | Add typed queue events for the verified native find/replace commands. |
| `src/renderer/editors/monaco/MonacoBodyView.ts` | Handles selection and text decorations | Dispatch queued find/replace commands when the editor is mounted. |
| `src/renderer/editors/text/ScriptPanel.ts` | Existing script-panel model actions | Only change if facade wrappers require a public-safe accessor or corrected error handling. |
| `src/renderer/editors/base/ContentHostFooterView.ts` | Emits `text-toggle-script` | No change; the required name is already emitted. |
| `src/renderer/editors/text/ScriptPanelView.ts` | Emits all script-panel names | No change; the required names are already emitted. |
| `qa/surfaces/editors/text.md` | Not yet present | Add call-only Monaco/text surface scenarios; US-1317 runs them and maintains the index. |
| `assets/editor-types/*.d.ts` | Generated | Regenerated by Vite `editorTypesPlugin`; never hand-edited. |

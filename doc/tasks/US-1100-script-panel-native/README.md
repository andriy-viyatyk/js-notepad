# US-1100: ScriptPanelView after native EditorToolbar

## Goal

Convert the script panel rendered by the text chrome and board editor into one
framework-free `ScriptPanelView`, after US-1099 has converted
`editors/base/EditorToolbar.tsx` to `EditorToolbarView`. Keep `ScriptPanel` as
a thin React `mountVanilla` face for the still-React `BoardEditorView` caller.
Preserve the existing `ScriptPanelModel` public location and state shape, DOM
addressing contract, script-library behaviour, and Monaco lifecycle while
adding no React root inside the panel.

This is the second implementation task of [EPIC-067](../../epics/EPIC-067.md)
and depends on US-1099’s `EditorToolbarView`.
The Rule 4 baseline listed by the epic is already recorded in EPIC-067 §E9-2
under “The per-editor baseline, measured 2026-08-26”. This task must not
re-measure it or plan another baseline pass.

## Background

### Scope and ordering

`src/renderer/editors/base/TextChrome.tsx:102` renders `<ScriptPanel
model={textHost} />`; `src/renderer/editors/board/BoardEditorView.tsx:91`
renders the same face for content-host boards. `ScriptPanel` is therefore a
child of the chrome and must be native before the chrome conversion under Rule
1. US-1099 must convert the nested `EditorToolbar` first; converting both
parent and child here would violate Rule 1. `BoardEditorView` is outside
EPIC-067, so its import must continue to work
through the React face. The programme standing answer recorded in the roadmap
§7 and EPIC-063 is one implementation with a React export reduced to
`mountVanilla`, never parallel React and native implementations.

The current file is 455 lines. It contains both the runtime-neutral
`ScriptPanelModel` and the React rendering function. The model is imported
directly by `src/renderer/editors/text/TextEditorModel.ts:9,177` and the
public exports are re-exported by `src/renderer/editors/text/index.ts:2-3`.
The model declarations must remain available from `./ScriptPanel`, and the
`ScriptPanelState` fields and `defaultScriptPanelState` values must not change.

The current render surface is:

```tsx
export function ScriptPanel({ model }: ScriptPanelProps) {
    const scriptModel = model.script;
    const state = model.script.state.use();
    const scriptHostRef = useRef<MonacoEditorHostView | null>(null);

    // ...return null when closed, otherwise render Panel, Splitter,
    // EditorToolbar, and MonacoEditorHost...
}
```

The planned public face is:

```tsx
export function ScriptPanel({ model }: ScriptPanelProps) {
    return mountVanilla(ScriptPanelView, { model });
}
```

`ScriptPanelView` should live in a new
`src/renderer/editors/text/ScriptPanelView.ts` file. Keep the model in
`src/renderer/editors/text/ScriptPanel.ts` so the existing `TextEditorModel`
import and the `editors/text/index.ts` re-exports do not move. Rename the
current `.tsx` file to `.ts` with `git mv`: after the change it contains no JSX,
and no extensionless importer needs editing (`TextEditorModel.ts:9` plus
`editors/text/index.ts:2-3`, `TextChrome.tsx:13`, and
`BoardEditorView.tsx:11` remain valid). The face may import the view;
the view should use type-only imports for model-side types where possible so
there is no runtime cycle back into the face module.

### Verified state and lifecycle surface

There are no `useState`, `useMemo`, or React `useCallback` calls in
`ScriptPanel.tsx` before the rename. The complete hook/reactive surface is:

| Current source | What it does today | Native destination |
|---|---|---|
| `src/renderer/editors/text/ScriptPanel.tsx:348`, `model.script.state.use()` | Reads all six `ScriptPanelState` fields: `content`, `open`, `height`, `hasSelection`, `selectedScript`, and `dirty`. It drives visibility, panel height, editor value, run-button title/visibility, selected dropdown item, and save-button disabled state. | `ScriptPanelView.onMount()` binds the script model state. The binding must include every rendered field and call one synchronisation path that creates/removes the open branch, updates height/content, and refreshes the toolbar. |
| `src/renderer/editors/text/ScriptPanel.tsx:349`, `useRef<MonacoEditorHostView \| null>` | Holds the mounted `MonacoEditorHostView`; it is set by the host’s `onMount` callback and cleared by the effect when the panel closes. It is not a DOM ref. | A private `MonacoEditorHostView \| undefined` owned by `ScriptPanelView`. Register it with `child()`, append and mount it in the open branch, and release/dispose the whole branch on close. Clear the field when the child is disposed. |
| `src/renderer/editors/text/ScriptPanel.tsx:351-359`, `useEffect([state.content, state.open])` | When closed, clears the host-view ref. When open, calls `setValue(state.content)` on the existing Monaco host so selecting a library file replaces the editor text without remounting it. | The script-state binding performs the same work explicitly: initial open creates the host with `initialValue`; later content changes call `setValue` only when the host is ready; closing disposes the host branch and clears the reference. No effect or timer is needed. |
| `src/renderer/editors/text/ScriptPanel.tsx:361`, `libraryService.state.use()` | Subscribes to all library-service state so a scan/file-watch update recomputes `getAvailableScripts()` and the selected entry. | Bind `libraryService.state` to the `scriptPanelIndex` (or an equivalent selected library projection) and refresh the toolbar’s `Select` props. `getAvailableScripts()` must still call `ensureInitialized()` before reading the index. |
| `ScriptPanelModel` constructor at `src/renderer/editors/text/ScriptPanel.tsx:69-71` | Subscribes the model state to `saveStateDebounced`, a 300 ms model-owned persistence callback. This is not a React hook and is not an effect to port. | Leave this subscription and `ScriptPanelModel.dispose()` ownership in place. EPIC-053 B13 says `TComponentModel.effect()` registrations shed before conversion; this model extends `TModel` and has no `effect()` registration to preserve or recreate. |
| `ScriptPanelModel.setupSelectionListener` at `src/renderer/editors/text/ScriptPanel.tsx:145-153` | Monaco cursor-selection changes update `ScriptPanelState.hasSelection`; the native toolbar can therefore show/hide `script-run-all`. | Keep the Monaco listener in the model, but dispose any previous listener before installing a new one. Add the close/unmount path required to dispose it and clear `editorRef` when the host view goes away; do not dispose the whole page-owned model when the panel is merely toggled closed. |

The model methods used by the current JSX remain the event/action methods of
the native view: `handleKeyDown`, `setHeight`, `handleEditorChange`,
`handleEditorDidMount`, `selectScript`, `saveToLibrary`, `openInTab`, and
`toggleOpen`. Retype `ScriptPanelModel.handleKeyDown` from
`React.KeyboardEvent` to the native `KeyboardEvent`; its reads of `code`, the
modifier flags, `preventDefault()`, and `stopPropagation()` are all available
on the native event. After the `.tsx` to `.ts` rename, the module must import no
React type at all. The React face does not own a React-rendered element and
therefore does not receive React SyntheticEvents.

### Reactive-channel defect found in this file

`ScriptPanelModel.getAvailableScripts()` reads
`this.pageModel.state.get().language` at
`src/renderer/editors/text/ScriptPanel.tsx:179` to choose the
language-specific library directory. The React component subscribes to
`model.script.state` and `libraryService.state`, but not to
`model.state.language`. A language change can therefore leave the dropdown
showing the old script list until an unrelated script/library update causes a
render. This is the §6.1 masked-defect class: React’s incidental parent renders
have been acting as an undeclared channel.

The native view must bind `model.state` to `language` and refresh the dropdown
when it changes. The `language` read at
`src/renderer/editors/text/ScriptPanel.tsx:248` is inside the
user-triggered `saveToLibrary()` action and is not a render dependency; it does
not need a separate view binding.

`ScriptPanelState.hasSelection` itself already has a real channel: the
Monaco `onDidChangeCursorSelection` listener writes it and the component
subscribes to the script state. Do not confuse this with EPIC-067 §E9-6’s
separate `TextChrome.RunButtons` defect, where `model.hasTextSelection()` is
read without a subscription; that chrome fix belongs to the later chrome task.

### Refs and disposal

The current `scriptHostRef` in `src/renderer/editors/text/ScriptPanel.tsx` is a ref to `MonacoEditorHostView`, not to a DOM
element. The `MonacoEditorHost` face at
`src/renderer/editors/text/ScriptPanel.tsx:440-451` calls
`onMount(hostView)`, stores that view ref, and passes its Monaco editor to
`scriptModel.handleEditorDidMount(hostView.getEditor())`. The actual
`MonacoEditorHostView` owns the Monaco editor, model, content subscription, and
its own disposal at `src/renderer/editors/shared/MonacoEditorHostView.ts:37-53,
129-151`.

The native view must own the host as a child and preserve this order:

1. On open, append and mount `MonacoEditorHostView` and let its `onMount`
   callback register the editor with `ScriptPanelModel`.
2. On close, dispose/release the child so Monaco listeners, model, and editor
   are disposed; clear the view field; and tell `ScriptPanelModel` to dispose
   its cursor-selection listener and set `editorRef` to `null`.
3. On final view disposal, repeat the same cleanup if an open branch exists.
   Do not call `ScriptPanelModel.dispose()` on a close toggle: the containing
   `TextFileModel` owns that model and needs its state subscription for a later
   reopen. Its existing final `dispose()` at `TextEditorModel.ts:245-251`
   remains the page/model lifecycle cleanup.

There is no ScriptPanel DOM ref callback and no overlay ref in this component.
`TextFileModel.setEditorOverlayRef` belongs to `TextChrome` and must not be
introduced into `ScriptPanelView`.

### Floating UI, menus, and native equivalents

`src/renderer/editors/text/ScriptPanel.tsx` does not call `createPortal`, `@floating-ui/*`, or a menu
API. Its only dropdown is the `<Select>` at `:406-414`. The React `Select`
export is already a `mountVanilla(SelectView, ...)` face; `SelectView` composes
native `InputView`, `IconButtonView`, `PopoverView`, and `ListBoxView`, and its
`PopoverView` uses the existing `contentView` path to put native list content
in the floating overlay. The native equivalent already in the tree is
therefore `SelectView`/`PopoverView`, not a new ScriptPanel popper or portal.

`EditorToolbar` at `src/renderer/editors/text/ScriptPanel.tsx:388-438` is
converted by US-1099 before this task. `ScriptPanelView` must compose the
resulting `EditorToolbarView` directly and own its native children; no
`fillSlot`, `mountReactHandle`, `React.createElement`, or other React island is
permitted in `ScriptPanelView.ts`.

### Current `data-name` output

The element contract is documented in
[`doc/architecture/ui-element-contract.md`](../../architecture/ui-element-contract.md).
The current JSX and the verified UIKit implementations produce these names:

| Current source | Current `data-name` | Native requirement |
|---|---|---|
| `Panel name="script-panel"` at `src/renderer/editors/text/ScriptPanel.tsx:373` | `script-panel` | Preserve on the open panel root; produce no `script-panel` element while closed, matching the current `return null`. |
| `Splitter name="script-panel-splitter"` at `src/renderer/editors/text/ScriptPanel.tsx:380` | `script-panel-splitter` | Preserve on `SplitterView`. |
| `EditorToolbar` with no `name` at `src/renderer/editors/text/ScriptPanel.tsx:388` | `editor-toolbar` (the default at `src/renderer/editors/base/EditorToolbar.tsx:19`) | Preserve through `EditorToolbarView` from US-1099. |
| `IconButton name="script-run"` at `src/renderer/editors/text/ScriptPanel.tsx:389` | `script-run` | Preserve. |
| Conditional `IconButton name="script-run-all"` at `src/renderer/editors/text/ScriptPanel.tsx:397-405` | `script-run-all` only when `hasSelection` is true | Preserve the conditional presence and name. |
| `Select name="script-select"` at `src/renderer/editors/text/ScriptPanel.tsx:406` | `script-select` | Preserve on the Select root. |
| `IconButton name="script-save"` at `src/renderer/editors/text/ScriptPanel.tsx:415` | `script-save` | Preserve, including `disabled={!state.dirty}`. |
| `IconButton name="script-open-tab"` at `src/renderer/editors/text/ScriptPanel.tsx:423` | `script-open-tab` | Preserve. |
| `IconButton name="script-close"` at `src/renderer/editors/text/ScriptPanel.tsx:431` | `script-close` | Preserve. |
| `Panel name="script-monaco-host"` at `src/renderer/editors/text/ScriptPanel.tsx:439` | `script-monaco-host` | Preserve on the host container. |

The unnamed `Spacer` remains unnamed. The `MonacoEditorHostView` root keeps
its existing `data-type="monaco-host"`; it does not currently emit a
`data-name`. The native implementation must use `createPanelElement` and the
existing `SplitterView`/`MonacoEditorHostView` contracts rather than inventing
different structural attributes.

## Implementation Plan

1. **Preserve the model module and expose the native view boundary.**

   In `src/renderer/editors/text/ScriptPanel.ts`, retain
   `ScriptPanelState`, `defaultScriptPanelState`, `ScriptDropdownEntry`, and
   the complete `ScriptPanelModel` implementation in the same module so
   `TextEditorModel.ts:177` and `editors/text/index.ts` keep their existing
   import path and public model shape. Remove the React JSX implementation and
   replace the `ScriptPanel` export with the thin face shown above. Remove the
   old React hook, `Panel`, `Splitter`, `IconButton`, `Spacer`, `Select`, and
   `MonacoEditorHost` face imports from this file. Retype
   `handleKeyDown` to native `KeyboardEvent`; the renamed module must have no
   React type import. Retain the model’s existing fs/library/dialog/action
   behaviour and dynamic imports.

   Add `src/renderer/editors/text/ScriptPanelView.ts` with a public
   `ScriptPanelView extends VanillaView<{ model: TextFileModel }>` and a
   public constructor. Use `createPanelElement` for the display-contents host
   and the two Panel-shaped DOM containers; import the existing Panel and
   splitter CSS as required by native views. The view owns only view-local
   children/resources, not the page-owned `ScriptPanelModel`.

2. **Translate the closed/open branch without changing DOM shape.**

   Keep the `ScriptPanelView` root `display: contents` and create the actual
   `script-panel` subtree only when `model.script.state.open` is true. The
   open subtree must have this order:

   ```text
   script-panel
   ├── script-panel-splitter
   ├── editor-toolbar (native `EditorToolbarView` from US-1099)
   └── script-monaco-host
       └── monaco-host
   ```

   Use `SplitterView` with `orientation: "horizontal"`, `side: "after"`,
   `min: 60`, and `onChange: scriptModel.setHeight`. Apply the current Panel
   attributes exactly: outer direction column, `height: state.height`,
   `overflow: "hidden"`, and `shrink: false`; host Panel flex 1 and minHeight
   0. On close, release the open branch and remove its root so the
   `script-panel` name disappears exactly as it does for the current React
   `return null`.

3. **Replace every hook with explicit lifecycle/binding work.**

   In `ScriptPanelView.onMount()`:

   - call `libraryService.ensureInitialized()` once from `onMount()` before
     the first available-script projection; retain the idempotent call inside
     `ScriptPanelModel.getAvailableScripts()` for non-view callers;
   - bind the script state fields needed by the branch and toolbar;
   - bind `libraryService.state` to its script-panel index so file-watch scans
     refresh the Select;
   - bind `model.state` to `language` to fix the verified stale-dropdown defect;
   - call the same synchronisation method immediately through each binding’s
     normal `bind()` initial application;
   - create/update the open branch from the current state without a React
     render phase.

   The synchronisation method must distinguish structural changes from ordinary
   updates. A close disposes the Monaco child and clears model/editor refs; an
   open constructs the branch with the current content and height; a content
   change calls `MonacoEditorHostView.setValue()` only if its host is ready; a
   height change updates the splitter and panel style; selection/dirty/library/
   language changes update only the toolbar props and Select entries. Do not
   use a blanket repaint in place of the missing language binding.

   The content path must go through `MonacoEditorHostView.setValue()` only.
   The update cycle is `onChange -> handleEditorChange -> changeContent ->
   state.content -> binding -> setValue`; `setValue()` is the guard because it
   returns when the Monaco model already has the value and suppresses its
   on-change callback while applying an external edit
   (`src/renderer/editors/shared/MonacoEditorHostView.ts:100-122`).
   `ScriptPanelView` must not call `editor.setValue()` or `executeEdits()`
   directly, or the caret-reset/edit loop will return.

   `onUpdate()` should handle a changed view prop deliberately. The normal
   callers keep the same `TextFileModel` instance for the mounted view, but if
   the model changes, dispose the old branch and rebind/use the new model rather
   than retaining a stale Monaco editor or subscription.

4. **Compose the native toolbar and its dynamic children.**

   Instantiate and own the native `EditorToolbarView` produced by US-1099.
   Its children must be native `IconButtonView`, `SelectView`, and
   `SpacerView` instances, in this order:

   ```text
   EditorToolbarView
   ├── script-run
   ├── script-run-all (only while hasSelection is true)
   ├── script-select
   ├── script-save
   ├── script-open-tab
   ├── SpacerView
   └── script-close
   ```

   Insert/release the `script-run-all` child when the `hasSelection` binding
   changes, and update the existing Select, save button, and other child props
   from the same synchronisation path. Preserve the current action semantics:
   F5 run, Ctrl/Cmd-S save only when dirty, library selection,
   save-to-library, open-in-tab, and close. Pass native DOM keyboard events to
   `scriptModel.handleKeyDown` from the panel root. `ScriptPanelView.ts` must
   contain no `fillSlot`, `mountReactHandle`, `React.createElement`, JSX, or
   React import.

5. **Make Monaco and selection cleanup explicit.**

   Keep `MonacoEditorHostView` as the native editor child, with
   `initialValue: state.content`, `language: "typescript"`,
   `options: { automaticLayout: true }`, `onMount` calling
   `handleEditorDidMount`, and `onChange` calling `handleEditorChange`.
   Register the host with `child()` and mount it after appending it to the
   `script-monaco-host` element.

   Extend the existing model lifecycle only as needed to make the repeated
   open/close path safe: dispose an existing cursor-selection subscription
   before replacing it, provide a close/unmount cleanup that disposes that
   subscription and sets `editorRef = null`, and make final `dispose()` leave
   no editor ref behind. Do not invoke final model disposal when the panel is
   toggled closed, and do not change the persisted state fields or model
   delegation surface. The model’s 300 ms save debounce remains model-owned;
   this view must not introduce a separate timer.

6. **Verify the conversion.**

   Run the project’s required `tsc --noEmit` and `npm run lint` gates. This
   project has no unit-test harness; do not add tests. Manually inspect the
   script panel closed/open states, language change and library refresh,
   selection-driven Run All visibility, content replacement, save/open/close
   actions, Monaco disposal on close and page disposal, and both callers
   (`TextChrome` and `BoardEditorView`). Compare the current and converted DOM
   by the `data-name` table above. The Rule 4 number is not re-measured in this
   task; the already-recorded EPIC-067 §E9-2 baseline is the source of truth.

### Files intentionally not changed

- `src/renderer/editors/base/TextChrome.tsx` — its conversion is US-1101;
  only its existing child call site is verified here.
- `src/renderer/editors/board/BoardEditorView.tsx` — it remains a React caller
  and must continue using the thin `ScriptPanel` face.
- `src/renderer/editors/text/TextEditorModel.ts` — the model import and
  `script = new ScriptPanelModel(this)` line remain valid and unchanged.
- `src/renderer/editors/text/index.ts` — existing `ScriptPanel` and model
  re-exports remain valid; add no duplicate implementation export unless the
  implementation requires a public `ScriptPanelView` export.
- `src/renderer/ui/app/AsyncEditor.tsx` and `src/renderer/ui/app/index.ts` —
  the separate US-1099 deletion. The repository-wide verification found three
  hits: the file’s own definitions/exports and the barrel export; there are no
  real importers. That deletion is not part of US-1100.
- `src/renderer/ui/app/AsyncEditorView.ts` — live native implementation; it is
  unrelated to the US-1099 deletion and must not be altered here.
- `src/renderer/uikit/Select/SelectView.ts` and
  `src/renderer/uikit/Popover/PopoverView.tsx` — existing native dropdown/
  floating implementation; no new portal or menu abstraction.
- `doc/active-work.md` — the user maintains the dashboard; do not add or edit
  its entry in this task.

## Concerns

All investigation concerns below are resolved constraints for implementation,
not requests for a second design pass.

1. **The language dependency is easy to miss.** `getAvailableScripts()` reads
   `pageModel.state.get().language` but the old component does not subscribe to
   that state. The native view must bind `TextFileModel.state.language`; a
   script-state or library-state binding alone is insufficient.

2. **Closing is not disposing the page model.** The `TextFileModel` owns
   `ScriptPanelModel` for the lifetime of the page. The view must dispose the
   Monaco child and its selection listener on branch close while retaining the
   model’s state subscription and persisted state for reopen. Final page
   disposal still calls `ScriptPanelModel.dispose()` from
   `TextEditorModel.dispose()`.

3. **Repeated opens expose the existing listener/ref hazard.** The current
   model overwrites `selectionListenerDisposable` on each Monaco mount without
   disposing the previous one, and leaves `editorRef` pointing at a disposed
   editor after the host closes. The native lifecycle must close that gap; a
   stale selection listener or editor ref is a correctness/resource defect,
   not an acceptable compatibility detail.

4. **The panel must add zero React roots.** US-1099 has already converted the
   nested toolbar, so `ScriptPanelView` must compose `EditorToolbarView`,
   `IconButtonView`, `SelectView`, and `SpacerView` directly. This is checkable
   while open:
   `document.querySelectorAll('[data-name="script-panel"] [data-react-root]').length`
   must be `0`. No React bridge or React element factory belongs in the view.

5. **Closed DOM must remain absent, not merely hidden.** The old component
   returns `null` while `state.open` is false. A permanently mounted panel
   with `display: none` would change the DOM comparison and can affect queries;
   the native view must create/remove the named branch instead.

6. **The model’s persistence subscription is not a React effect.** It is the
   explicit `state.subscribe(this.saveStateDebounced)` in the model and must
   remain owned by `ScriptPanelModel.dispose()`. EPIC-053 B13’s effect-shedding
   rule means no `TComponentModel.effect()` adapter or replacement effect is
   appropriate here.


## Acceptance Criteria

- [ ] `src/renderer/editors/text/ScriptPanelView.ts` is a native
  `VanillaView` with explicit `onMount`/binding/child ownership and no React
  hook-driven implementation.
- [ ] `src/renderer/editors/text/ScriptPanel.ts` is only the retained model
  module plus the thin `ScriptPanel` `mountVanilla(ScriptPanelView, { model })`
  face; `ScriptPanelModel`, `defaultScriptPanelState`, and the state shape are
  still available from the existing import/re-export paths. The `.tsx` to `.ts`
  rename is recorded with `git mv`; extensionless importers at
  `TextEditorModel.ts:9`, `editors/text/index.ts:2-3`, `TextChrome.tsx:13`, and
  `BoardEditorView.tsx:11` require no edits.
- [ ] `ScriptPanelModel.handleKeyDown` uses native `KeyboardEvent`, and
  `src/renderer/editors/text/ScriptPanel.ts` imports no React type at all.
- [ ] `TextChrome.tsx:102` and `BoardEditorView.tsx:91` both continue to render
  the same `ScriptPanel` face without caller changes, and there is one native
  implementation rather than a React duplicate.
- [ ] Every current hook has an explicit native destination: script state and
  library state use `bind`, the language read has a new `TextFileModel.state`
  binding, the host ref is an owned child field, and the content-sync effect is
  an explicit state synchronisation method. No `useState`, `useMemo`, or model
  `effect()` is added.
- [ ] Changing the text-host language refreshes the script dropdown without an
  unrelated render, proving the masked-defect fix.
- [ ] Opening, changing content, selecting a library script, changing Monaco
  selection, saving, opening in a tab, closing, reopening, and final page
  disposal preserve current behaviour. Monaco/editor and selection-listener
  resources are released on close and disposal, with no stale `editorRef`.
- [ ] Content synchronisation uses `MonacoEditorHostView.setValue()` and never
  calls Monaco `editor.setValue()` or `executeEdits()` directly from
  `ScriptPanelView`, preserving the equality/suppression guard against an
  onChange edit loop and caret reset.
- [ ] The converted DOM preserves the exact current `data-name` values:
  `script-panel`, `script-panel-splitter`, `editor-toolbar`, `script-run`,
  conditional `script-run-all`, `script-select`, `script-save`,
  `script-open-tab`, `script-close`, and `script-monaco-host`; the panel is
  absent while closed.
- [ ] The Select continues to use the existing native `SelectView`/
  `PopoverView` implementation, and no ScriptPanel portal, floating-ui React
  popper, menu, `fillSlot`, `mountReactHandle`, `React.createElement`, JSX, or
  React import is introduced. With the panel open,
  `document.querySelectorAll('[data-name="script-panel"] [data-react-root]').length`
  is exactly `0`.
- [ ] `tsc --noEmit` and `npm run lint` pass. No unit tests or test harness are
  added, and no Rule 4 re-measurement is performed.

### Files Changed

| File | Planned change |
|---|---|
| `src/renderer/editors/text/ScriptPanel.ts` | Rename the JSX-free model/React-face module from `.tsx` with `git mv`; retain the model and public state exports, replace the JSX implementation with the thin `mountVanilla` face, retype the key handler to native `KeyboardEvent`, and add editor-listener/ref cleanup. |
| `src/renderer/editors/text/ScriptPanelView.ts` | New zero-React-root `VanillaView`, explicit state/library/language bindings, open-branch ownership, native `EditorToolbarView` and child views, native splitter/Monaco host, edit-loop-safe content sync, and disposal. |

No other implementation files, dashboard entries, epic tables, tests, or user
documentation are planned to change.

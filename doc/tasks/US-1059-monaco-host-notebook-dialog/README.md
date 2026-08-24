# US-1059: Monaco host for notebook rows and text dialogs

Epic: [EPIC-061 — Delete @monaco-editor/react](../../epics/EPIC-061.md)

## Goal

Convert the Monaco mount in MiniTextEditor.tsx to the shared vanilla host and
convert TextDialogView.ts from a nested React Monaco root to a direct claimed
MonacoEditorHostView child. This removes two wrapper importers and removes the
one React root this epic can delete outright: TextDialogView roots 1 → 0.

## Background

### Part A — MiniTextEditor

EPIC-061 E3-6 is withdrawn. The measured notebook scroll churn is real, but it
belongs to virtualized row lifetime rather than to key={model.id}. The
removal-ledger entry for RenderFlexGrid.tsx is future work for the epic that
moves LogBody.tsx and NotebookBody.tsx off flex rows or onto a pooling variant.
US-1059 does not redesign virtualization or claim a construction-count
improvement.

The current identity path is verified:

- renderInfo.ts:296-344 caches cells by its row/column key built at line 314.
- RenderFlexGrid.tsx:213-227 renders each cell through FlexCell keyed by that
  logical row/column key.
- NotebookBody.tsx:64-96 maps notes[p.row] and returns NoteItemView keyed by
  note.id at line 74.
- NoteItemView.tsx:344-353 renders NoteItemActiveEditor for every note; the
  Monaco branch renders MiniTextEditor at
  note-editor/NoteItemActiveEditor.tsx:29-38.

When a row leaves the viewport, its FlexCell, NoteItemView, and MiniTextEditor
unmount. When a row enters, a new subtree mounts. A vanilla host is disposed by
mountVanilla with that subtree, just as the React wrapper was. key={model.id}
has no vanilla equivalent and must be removed, but it is not being removed as a
performance fix. A future row-pooling change may revisit identity, but it is
outside this task.

MiniTextEditor.tsx:22-104 reads content/language and content height, keeps the
wrapper div as the size owner, passes controlled value, language, wrapper
height, theme, callbacks, and compact options to Editor, and calls
editorModel.setHighlightText(editorConfig.highlightText) in an effect. The
replacement keeps the wrapper, content-height calculation, maxEditorHeight
clamp, highlight effect, and options. It removes only the React-only key, value,
height, and theme props.

#### Content synchronization

initialValue alone is not sufficient. A visible row can receive changed note
content without unmounting:

1. NoteItemViewModel.init() watches note content/language/editor
   (NoteItemViewModel.ts:72-78) and calls syncEditModel() (:102-107).
2. NoteItemEditModel.syncFromNote() updates the mounted model's state.content
   and state.language when note data differs (NoteItemEditModel.ts:310-325).
3. MiniTextEditor subscribes to those fields at :24-27, so it rerenders while
   its host remains mounted.

The host is uncontrolled and treats initialValue as mount-only. Therefore
MiniTextEditor needs a setValue effect for external note changes. It must use
the host compare/suppress policy, not call Monaco directly. User typing updates
the same state through handleEditorChange (NoteItemEditModel.ts:59-61 and
:260-267), so host equality makes that sync a no-op rather than an echo.

#### Options, sizing, callbacks, and disposal

The host's live update path calls editor.updateOptions(props.options ?? {}).
Thus minimap: { enabled: !editorConfig.hideMinimap } remains live. The
highlight effect stays untouched and remains owned by the note editor model.

NoteEditorModel.handleEditorDidMount accepts a raw
IStandaloneCodeEditor, stores it, installs selection/content-size listeners,
and records initial content height (NoteItemEditModel.ts:51-57). The new
callback accepts MonacoEditorHostView; the consumer calls host.getEditor() and
passes that raw editor to the unchanged handler. handleEditorChange(value:
string | undefined) already calls changeContent(value || "", true); the host
supplies a string.

NoteEditorModel enforces a minimum content height of 50, and MiniTextEditor
applies maxEditorHeight only in content-sized mode (MiniTextEditor.tsx:34-39).
The wrapper keeps height: contentHeight; the host CSS root uses height: 100% to
fill it. Fill-container mode keeps its flex wrapper and the host fills it. The
host's full-width child rule remains necessary to avoid E3-9's collapsed editor.

On each row mount, MonacoEditorHostView.onMount() creates an ITextModel and
marks it host-owned. On row unmount, onDispose() does:

    editor.setModel(null)
      → editor.dispose()
      → scheduleModelDisposal(ownedModels)
      → model.dispose() on the deferred macrotask

MiniTextEditor must not dispose the editor or model itself. After the deferred
disposal turn, no live editor or model from a row that left the viewport may
remain. This is the notebook-specific lifecycle check.

### Part B — TextDialogView

TextDialogView.ts is already a VanillaView, but it creates a React root at line
74 solely to render React.createElement(Editor, ...) at line 91. Today:

- The constructor creates the stable editorHost, panels, DialogContentView, and
  DialogView (:29-64), but no Monaco.
- onMount() mounts content, calls mountReactHandle, syncs buttons, mounts the
  dialog, and binds title/editor/button state (:72-85).
- editorElement() builds value, language, read-only-gated onChange, OnMount,
  theme, and options (:88-108).
- editorHandle lets syncEditor() at :115-117 rerender that root.
- releaseEditor() at :156-162 removes the host and queues root disposal.

After conversion, mountReactHandle, editorHandle, editorElement(), and OnMount
disappear. syncEditor() becomes host update() for options/language/callback and
host setValue() for text. releaseEditor() disappears because claimed-child
ownership disposes the host.

The dialog's read-only state maps to options.readOnly. Keep the callback-level
guard too: pass undefined for onChange while state.readOnly is true, as current
line 94 does.

Dialogs mount and unmount frequently. The required lifecycle is:

    onMount(): create host → this.child(host) → append(host.root) → host.mount()
    dispose(): VanillaView disposes the claimed host child once

The host is created in onMount(), not the constructor. The owner must claim,
attach, and then mount it; this.child() alone does not mount a child. This
follows src/renderer/uikit/CLAUDE.md:496-502. The parent/DialogsView owns
structural detachment; the host must not remove its own root.

## Implementation Plan

### Part A — convert the notebook mount seam

1. In src/renderer/editors/notebook/note-editor/MiniTextEditor.tsx, replace the
   wrapper import with MonacoEditorHost and a MonacoEditorHostView type import.
2. Add a host ref and content synchronization effect:

       const hostRef = useRef<MonacoEditorHostView | null>(null);

       useEffect(() => {
           hostRef.current?.setValue(content);
       }, [content]);

   This is required because note props can update the mounted edit model, while
   initialValue is construction-only. Host equality checking prevents a
   user-edit echo and preserves the host's undo policy.
3. Replace Editor with MonacoEditorHost, passing initialValue={content},
   language={language}, the existing options, and
   onChange={editorModel.handleEditorChange}. In onMount, store the host and
   call editorModel.handleEditorDidMount(host.getEditor()).
4. Remove key={model.id}, wrapper value, height, and theme. Keep the wrapper
   div, rootStyle, content sizing, max-height clamp, options, highlight effect,
   and unrelated hooks/state unchanged.
5. Manually verify live minimap option updates, highlighting, content-height
   updates, active-page geometry, and disposal. After a row leaves the viewport
   and the deferred callback runs, its editor must be disconnected and its
   model absent from monaco.editor.getModels(). Repeat across rows to check
   that models do not accumulate. This is a manual check, not a unit test.

Before:

    <Editor
        key={model.id}
        height={fillContainer ? "100%" : contentHeight}
        value={content}
        language={language}
        onMount={editorModel.handleEditorDidMount}
        onChange={editorModel.handleEditorChange}
        theme="custom-dark"
        options={options}
    />

After:

    <MonacoEditorHost
        initialValue={content}
        language={language}
        onMount={(host) => {
            hostRef.current = host;
            editorModel.handleEditorDidMount(host.getEditor());
        }}
        onChange={editorModel.handleEditorChange}
        options={options}
    />

### Part B — remove the dialog's nested React root

1. In src/renderer/ui/dialogs/TextDialogView.ts, remove React, Editor, OnMount,
   mountReactHandle, and MountedReactRoot imports. Add a direct
   MonacoEditorHostView import.
2. Keep editorHost as the stable constructor-created container. Add an optional
   editorView field, but do not instantiate the host in the constructor.
3. In onMount(), after contentView.mount(), create current-state host props,
   claim the host with this.child(...), append host.root, and call host.mount()
   exactly once. The host callback focuses host.getEditor().
4. Replace editorElement() with a host-props helper. Preserve language
   defaulting, automatic layout, word wrap, minimap, line numbers,
   scrollBeyondLastLine, line highlighting, and domReadOnly. Remove theme; map
   state.readOnly ?? true to options.readOnly and retain the callback guard.
5. Replace syncEditor() with editorView?.update(nextProps) followed by
   editorView?.setValue(state.text || ""). Delete editorHandle,
   editorElement(), and releaseEditor(). Leave title, buttons, key handling,
   and unrelated state/effect code unchanged.
6. Child ownership disposes the host before remaining dialog cleanup;
   DialogsView.ts:106-124 removes the native dialog root. Do not detach the host
   root from inside MonacoEditorHostView.

Before:

    this.editorHandle = mountReactHandle(this.editorHost, this.editorElement());
    this.editorHandle?.render(this.editorElement());
    this.editorHost.remove();
    queueMicrotask(() => handle.dispose());

After:

    const host = this.child(new MonacoEditorHostView(this.editorProps()));
    this.editorView = host;
    this.editorHost.append(host.root);
    host.mount();
    this.editorView?.update(this.editorProps());
    this.editorView?.setValue(this.model.state.get().text || "");

initialValue is construction-only; current state text uses setValue.

## Concerns

1. The withdrawn E3-6 measurement is background for future RenderFlexGrid
   removal-ledger work, not a US-1059 performance target.
2. Notebook disposal is load-bearing. The host owns its created model;
   MiniTextEditor must not dispose Monaco directly. Verify setModel(null) →
   editor dispose → deferred model dispose repeatedly.
3. Content sync must not be omitted: syncEditModel() can update the mounted
   model from changed note props; initialValue covers fresh mount only.
4. Dialog read-only has two responsibilities: live options.readOnly and the
   callback guard. Keep both.
5. Do not create the dialog host in the constructor, mount it more than once,
   create one per state notification, or retain the nested-root microtask path.
6. On active notebook and dialog pages, verify non-zero host offsetHeight and
   non-empty .view-lines; presence alone is insufficient.
7. Do not touch configure-monaco.ts, package files, dashboard entries,
   unrelated hooks, or the concurrent editor directories.

## Acceptance Criteria

### Part A

- [ ] MiniTextEditor.tsx uses MonacoEditorHost, with no wrapper import, React
      key, wrapper height, controlled value, or theme prop.
- [ ] initialValue={content} and language={language} seed each fresh row;
      host.getEditor() adapts mount and the existing change callback updates
      NoteItemEditModel.
- [ ] The content effect calls host.setValue(content); equal user-edit values
      do not echo through onChange.
- [ ] hideMinimap remains live through host options, highlighting remains intact,
      and content/max-height geometry remains correct.
- [ ] After a row leaves the viewport and deferred disposal runs, no editor or
      model from that row remains live; MiniTextEditor performs no disposal.

### Part B

- [ ] TextDialogView.ts has no wrapper package, React element creation,
      mountReactHandle, MountedReactRoot, or OnMount.
- [ ] The constructor creates stable dialog structure only; the host is created,
      claimed, attached, and mounted exactly once from onMount().
- [ ] State updates call host update() for options/language/callback and
      setValue() for text; no nested React root remains.
- [ ] state.readOnly maps to live options.readOnly, and the callback guard
      remains explicit.
- [ ] Dialog disposal releases host editor/model/listener resources once per
      open/close cycle; active geometry has non-zero height and non-empty
      .view-lines.
- [ ] The structural figure is TextDialogView React roots 1 → 0.
- [ ] No tests, loader cleanup, package uninstall, dashboard edit, or commit is
      made by this task.

## Files Changed

| File | Planned change |
|---|---|
| src/renderer/editors/notebook/note-editor/MiniTextEditor.tsx | Replace wrapper mount with host; preserve sizing/options/highlighting and add host-mediated content sync. |
| src/renderer/ui/dialogs/TextDialogView.ts | Replace nested React root with one claimed, attached, mounted host child and route state through host APIs. |

### Files that require no changes

| File | Reason |
|---|---|
| src/renderer/editors/shared/MonacoEditorHostView.ts | US-1056 already supplies live options, setValue, host-owned cleanup, and deferred disposal. |
| src/renderer/editors/shared/MonacoEditorHost.tsx | Existing thin React face is the shared mount surface. |
| src/renderer/editors/shared/MonacoEditorHostView.css | Existing full-size and full-width child rules provide geometry. |
| src/renderer/editors/notebook/note-editor/NoteItemEditModel.ts | Existing content, language, callback, and content-size contracts remain. |
| src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx | Existing editor-selection boundary remains unchanged. |
| src/renderer/uikit/RenderGrid/RenderFlexGrid.tsx | Virtualization is documented, not changed; pooling is future ledger work. |
| src/renderer/editors/notebook/NotebookBody.tsx | Logical-row rendering and note-key behavior are not part of this seam. |
| src/renderer/editors/notebook/NoteItemView.tsx | The note view remains intact; only its nested mount changes. |
| src/renderer/uikit/shared/mount.tsx | Existing lifecycle appends before mount and disposes on unmount. |
| src/renderer/uikit/CLAUDE.md | Lifecycle rules are applied, not edited. |
| src/renderer/api/setup/configure-monaco.ts | Explicitly out of scope; global theme setup remains for US-1061. |
| doc/active-work.md and doc/epics/EPIC-061.md | Tracking is not edited by this request. |
| package.json and lockfiles | Dependency removal belongs to US-1061. |
| Concurrent editor directories and test files | No concurrent editor files or tests are touched. |

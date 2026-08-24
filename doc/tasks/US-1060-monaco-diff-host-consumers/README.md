# US-1060: React diff consumers on the shared Monaco diff host

## Goal

Convert the `DiffEditor` mount in `FileDiffBody.tsx` and the `DiffEditor`
mount in `CommitDiffPanel.tsx` to a thin React face over the existing
`MonacoDiffEditorHostView`. Remove the wrapper-only theme and keep-model props
without changing either editor's surrounding UI or behavior.

This is US-1060 of [EPIC-061](../../epics/EPIC-061.md). It does not create a
second diff host, merge the diff host with US-1056's single-editor host, or
touch the Monaco configuration.

## Background

### Existing host and verified React-face gap

`src/renderer/editors/shared/MonacoDiffEditorHostView.ts` is already a working
vanilla host. Its constructor creates only `.monaco-host-root`; `onMount()`
creates `monaco.editor.createDiffEditor`; `createModel()` records created
models in `ownedModels`; `setModel()` can attach an explicitly owned or
borrowed `{ original, modified }` pair; and `listenToModifiedContent()` stores
the modified-side subscription in the host's owned-subscription set.

The host has no React face today. The only source consumer is
`src/renderer/editors/compare/CompareEditor.ts`, and there is no
`MonacoDiffEditorHost.tsx` or other React importer of the diff host. This was
verified with a source search rather than inferred from the roadmap. The new
`src/renderer/editors/shared/MonacoDiffEditorHost.tsx` is therefore the missing
adapter, not a new Monaco host.

`MonacoDiffEditorHostView.css` already supplies the full-size flex root and the
important direct-child rule:

```css
.monaco-host-root {
    display: flex;
    flex: 1 1 auto;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
}

.monaco-host-root > .monaco-diff-editor {
    width: 100%;
}
```

The stylesheet is already imported by the host and needs no new consumer
stylesheet.

There is one existing host-contract asymmetry that this task must close before
the React face uses model replacement. The current diff-host `setModel()` at
`MonacoDiffEditorHostView.ts:54-64` adds an incoming owned pair and calls
`editor.setModel(models)`, but it does not release the pair it displaces. The
single-editor host added by US-1056 does release its current owned model inside
`setModel()`, after detaching it. Consequently, the two hosts currently give
the same method name different ownership guarantees.

The diff host must be brought into parity: `setModel()` must capture the
current diff model, call `editor.setModel(null)` before releasing it, and pass
only the previously-owned original/modified models to the existing deferred
`releaseOwnedModels()` path. It must not synchronously dispose models. A
borrowed current pair passes through the ownership guard untouched.

### Compare establishes the ownership contract

`src/renderer/editors/compare/CompareEditor.ts:83-180` is the working vanilla
consumer and must remain unchanged. It:

1. mounts the host explicitly;
2. calls `diffHost.createModel()` twice, so the host owns both temporary text
   models;
3. calls `diffHost.setModel({ original, modified }, "owned")`;
4. on replacement, first calls `diffHost.setModel(null)`, then
   `diffHost.releaseOwnedModels(previousModels)`, and only then creates and
   attaches the next pair; and
5. uses `listenToModifiedContent()` for the editable modified side.

On host disposal, the current implementation disposes owned subscriptions,
calls `editor.setModel(null)`, calls `editor.dispose()`, clears the editor
field, and only then schedules disposal of the remaining host-owned models in
a macrotask. Borrowed models are never disposed by the host. That ordering is
required by Monaco's diff-widget model reset behavior.

The release guard is verified to be idempotent in the current source. The
single-editor host's `releaseOwnedModel()` returns when
`ownedModels.delete(model)` is false. The diff host's plural equivalent uses
`models.filter((model) => this.ownedModels.delete(model))` and returns when no
model was deleted. Therefore a second release of an already-released model is
a no-op and cannot schedule a second `dispose()`.

After the host change, `CompareEditor` must remain source- and behavior-
unchanged. Its explicit `releaseOwnedModels(previousModels)` call stays in
place as a now-redundant compatibility/documentation guard: the new
`setModel(null)` releases the pair first, and the explicit second release is
the verified no-op described above. This preserves the existing compare code
and makes the host safe for repeated React-side pair replacement as well.

### Resolved FileDiff model ownership and the keep flags

The installed `@monaco-editor/react` `DiffEditor` source was read from
`node_modules/@monaco-editor/react/dist/index.mjs.map`. With no model paths,
the wrapper creates the original and modified `ITextModel` instances from the
`original` and `modified` strings, attaches them to the widget, and normally
disposes them during wrapper cleanup. `keepCurrentOriginalModel` and
`keepCurrentModifiedModel` are the only reason that wrapper leaves those two
models for its caller.

`FileDiffBody.tsx:57-75` currently passes both keep flags. Its body model stores
the two models in `FileDiffBodyModel.ts:42-43` and disposes them from
`FileDiffBodyModel.dispose()` at `:138-153` after a `setTimeout(0)`. The
comments at `FileDiffBodyModel.ts:38-41` and `:139-145` document the Monaco
exception that this avoids.

After this conversion, the ownership answer is unambiguous:

- `MonacoDiffEditorHostView` creates both File Diff models through its own
  `createModel()` path and owns them. `FileDiffBodyModel` owns application
  text state and the editable write-back listener, not Monaco text models.
- On unmount, the host disposes its subscriptions, calls
  `editor.setModel(null)`, calls `editor.dispose()`, and schedules disposal of
  its owned original and modified models in the next macrotask. The model
  disposal therefore happens after both detach and widget disposal.
- The `keepCurrentOriginalModel` / `keepCurrentModifiedModel` pair maps to
  nothing in the React face. It is not a new `setModel()` ownership choice:
  host-created models are already owned, while the explicit `owned`/`borrowed`
  argument remains only for callers attaching models themselves, as
  `CompareEditor` does.
- `FileDiffBodyModel`'s manual `originalModel`/`modifiedModel` fields and
  delayed model-disposal block must be removed. Keeping them would schedule a
  second disposal of host-owned models; removing host ownership would leak
  the models. The host's existing detach-then-dispose-then-macrotask order is
  the single cleanup path.

The File Diff body still needs the raw widget for consumer-specific behavior:
it reads `getModifiedEditor()` and observes modified-side content so Unstaged
edits write back to `FileDiffEditor.host`. The callback receives the host view;
it obtains the widget with `host.getEditor()` (added to the shared host) and
uses the existing host-owned `listenToModifiedContent()` subscription helper.
The body does not own the widget or either text model.

### The two wrapper consumers and their live behavior

`FileDiffBody.tsx:56-78` renders only the diff body inside a column `Panel`.
Its original side is `fromText`, its modified side is `toText`, and both can
change while the component remains mounted: revision selection and live
Unstaged host content update `FileDiffBodyModel.state`, which re-renders the
same mount point. There is no `key` forcing a React remount. The host face must
therefore update the existing models, not rely on `onMount()` running again.

Its option contract is preserved exactly:

- `readOnly: to.kind !== "unstaged"`: the modified/right side is editable only
  for the working-tree comparison; all revision-to-revision comparisons are
  read-only.
- `originalEditable: false`: the original/left side is never editable.
- `renderSideBySide: true` and `automaticLayout: true` remain options.

`CommitDiffPanel.tsx` is exactly 282 lines. It does substantially more than
the diff mount: its model loads commit files and both blob contents; the
component renders the left `FileList`, file-status badges, selection and
context-menu actions, the `Splitter`, the right diff/empty-state branch, and
the “Open in new Tab” link action. Only the Monaco seam at `:257-269` changes.

The commit panel is also live. Selecting another file changes `selectedFile`
and asynchronously replaces `diff.before`/`diff.after` while the component
continues rendering the same `<DiffEditor>` branch; there is no `key`. The
existing `useEffect` at `:146-151` intentionally resets both scroll positions
after new content loads. After conversion it keeps the same behavior, but its
ref changes from `IStandaloneDiffEditor` to `MonacoDiffEditorHostView` and it
calls `hostRef.current?.getEditor()` before using
`getOriginalEditor()`/`getModifiedEditor()`.

The commit diff remains read-only with
`readOnly: true`, `originalEditable: false`, `renderSideBySide: false`, and
`automaticLayout: true`. No commit-side write-back listener is needed.

### Options, language, theme, and layout

The wrapper's relevant runtime behavior is broader than initial construction:
it updates both model values, applies language to both models, and calls
`updateOptions()` when those props change. The current shared diff host only
accepts `options` and creates the widget, so the host is missing the shared
behavior these two React consumers require. Enhance the host itself with:

- optional `original`, `modified`, and `language` props for host-created React
  models;
- an `onMount?: (host: MonacoDiffEditorHostView) => void` callback;
- `onUpdate()` logic that calls `editor.updateOptions()` before synchronizing
  model values, applies the language to both models (using Monaco's existing
  text-language fallback when it is absent), and does not recreate the widget;
- a `getEditor()` method guarded by the host's existing readiness check; and
- host-owned initial model creation/attachment when the string props are
  supplied, without changing the explicit model API used by `CompareEditor`.

This is a shared-host enhancement, not a consumer workaround: neither React
caller can express initial two-model creation, live two-sided synchronization,
or shared ownership safely using the current `options`-only host. Keep
`CompareEditor` on its explicit `createModel`/`setModel` path.

`originalEditable` and `renderSideBySide` reach Monaco as construction options
in `createDiffEditor`, and the host's `onUpdate()` must also forward the whole
options object through `editor.updateOptions()` for live changes (especially
File Diff's `readOnly` gate). Do not special-case either option in the
consumers.

There is no `theme` prop after conversion. The host continues to apply the
global `MONACO_THEME_NAME` through the already imported configuration symbol;
the two `theme="custom-dark"` literals are deleted. `configure-monaco.ts`
already owns the single global theme and is not touched.

Both parents provide a resolvable flex height. File Diff's
`TextChrome` root is a column flex container with `height={0}` and `flex={1}`;
`FileDiffBody` is its `flex={1}`, overflow-hidden child. Commit Diff is under
the fixed-height Git Tree bottom panel, then a `flex={1}, height={0}` scrolling
panel, a `flex={1}` row, and the `flex={1}` `commit-diff-view` column. The
existing diff-host root sizing and width counter-rule therefore apply at both
sites. Verification must still measure an active page's host `offsetHeight`
and non-empty `.view-lines`; inactive pages legitimately measure `0×0`.

## Implementation Plan

### 1. Enhance the existing diff host, without creating or merging hosts

Modify `src/renderer/editors/shared/MonacoDiffEditorHostView.ts` only. Keep
the class as a sibling of `MonacoEditorHostView`; do not add a mode flag and do
not alter `MonacoEditorHostView.ts` or its React face.

Extend `MonacoDiffEditorHostProps` with the React-face contract:

```ts
export interface MonacoDiffEditorHostProps {
    original?: string;
    modified?: string;
    language?: string;
    options?: monaco.editor.IStandaloneDiffEditorConstructionOptions;
    onMount?: (host: MonacoDiffEditorHostView) => void;
}
```

The implementation must follow this lifecycle:

1. `onMount()` creates the diff widget with
   `{ automaticLayout: true, ...this.props.options }`. When the string props
   are present for a React consumer, it creates both models through
   `createModel()`, attaches them as an owned pair, applies the initial
   language, applies `MONACO_THEME_NAME`, and then invokes the host-object
   callback. When those props are absent, the host remains model-less for
   `CompareEditor` to populate with its existing explicit API.
2. `onUpdate(props)` updates the widget options first. For the host-created
   pair, synchronize original and modified contents only when they differ;
   preserve the wrapper's read-only versus editable modified-side write path
   so an editable File Diff keeps its undo behavior. Retain the current pair
   for ordinary same-file content writes so a user edit does not recreate the
   model and lose its cursor/undo state. If a prop update does replace the
   pair—for example, a file/revision identity change—the new pair must be
   attached through `setModel()`, whose replacement-release contract below
   prevents two owned models per selection from accumulating.
3. `getEditor()` returns the ready
   `monaco.editor.IStandaloneDiffEditor`, using the same `assertReady()` error
   behavior as `createModel`, `setModel`, and `listenToModifiedContent`.
4. Preserve `createModel`, `setModel`, `releaseOwnedModels`, and
   `listenToModifiedContent` for `CompareEditor`. Change `setModel()` so it
   captures the currently attached pair, calls `editor.setModel(null)`, and
   invokes `releaseOwnedModels()` on only that pair before attaching the new
   one. `releaseOwnedModels()` schedules the disposal in a macrotask and its
   `ownedModels.delete()` guard makes the unchanged explicit release in
   `CompareEditor` a harmless no-op. Attaching a borrowed pair must not
   transfer disposal responsibility.
5. Preserve idempotent disposal and the exact order: dispose host-owned
   subscriptions; `editor.setModel(null)`; `editor.dispose()`; clear the editor;
   then `scheduleModelDisposal()` for only the remaining owned models. Do not
   move model disposal into a React callback or into either consumer.

The new shared behavior should be represented by a host-owned update path,
not duplicated in each caller. The lifecycle seam is:

Before, the host only creates the widget and leaves all models to callers:

```ts
protected onMount(): void {
    this.editor = monaco.editor.createDiffEditor(this.root, {
        automaticLayout: true,
        ...this.props.options,
    });
    monaco.editor.setTheme(MONACO_THEME_NAME);
}
```

After, the host also owns the React-face pair and hands back the host view:

```ts
protected onMount(): void {
    this.editor = monaco.editor.createDiffEditor(this.root, {
        automaticLayout: true,
        ...this.props.options,
    });
    if (this.props.original !== undefined || this.props.modified !== undefined) {
        const language = this.props.language ?? "text";
        const original = this.createModel(this.props.original ?? "", language);
        const modified = this.createModel(this.props.modified ?? "", language);
        this.setModel({ original, modified }, "owned");
        this.reactOriginalModel = original;
        this.reactModifiedModel = modified;
    }
    monaco.editor.setTheme(MONACO_THEME_NAME);
    this.props.onMount?.(this);
}

protected onUpdate(props: MonacoDiffEditorHostProps): void {
    const editor = this.getEditor();
    editor.updateOptions(props.options ?? {});
    // Update the host-created pair and both languages; do not recreate it.
}
```

The snippet is illustrative. The implementation must also handle the latest
callback/options, compare values before writing, preserve the modified editor's
editable undo path, and avoid treating `CompareEditor`'s borrowed/explicit
props-less path as a React pair.

The replacement contract is the shared-host fix. The current implementation
is:

```ts
public setModel(models: monaco.editor.IDiffEditorModel | null, ownership = "borrowed") {
    const editor = this.assertReady();
    if (models && ownership === "owned") {
        this.ownedModels.add(models.original);
        this.ownedModels.add(models.modified);
    }
    editor.setModel(models);
}
```

It must become the diff equivalent of
`MonacoEditorHostView.setModel()`:

```ts
public setModel(
    models: monaco.editor.IDiffEditorModel | null,
    ownership: MonacoModelOwnership = "borrowed",
): void {
    const editor = this.assertReady();
    const current = editor.getModel();
    const samePair = current && models &&
        current.original === models.original && current.modified === models.modified;

    if (!samePair && current) {
        editor.setModel(null);
        this.releaseOwnedModels([current.original, current.modified]);
    }
    if (models && ownership === "owned") {
        this.ownedModels.add(models.original);
        this.ownedModels.add(models.modified);
    }
    if (!samePair) editor.setModel(models);
}
```

The final code may use a clearer pair-comparison helper, but the ordering and
ownership rules are mandatory. `releaseOwnedModels()` removes models from the
owned set before scheduling them, so `CompareEditor`'s existing explicit call
after `setModel(null)` remains in place and does not double-schedule or double-
dispose anything. The same contract covers repeated Commit Diff pair changes.

### 2. Add the thin React face

Create `src/renderer/editors/shared/MonacoDiffEditorHost.tsx` following the
nine-line `src/renderer/editors/shared/MonacoEditorHost.tsx` template. It must
only import `mountVanilla`, the view, and its prop type; re-export the prop
type; and return `mountVanilla(MonacoDiffEditorHostView, props)`.

Before, both consumers import the third-party component:

```tsx
import { DiffEditor } from "@monaco-editor/react";
```

After, both import the project-owned face:

```tsx
import { MonacoDiffEditorHost } from "../shared/MonacoDiffEditorHost";
```

The face must not add React Monaco hooks, a second root, `theme`, `height`, or
controlled-value logic.

### 3. Convert `FileDiffBody` and remove its old model cleanup

Modify `src/renderer/editors/file-diff/FileDiffBody.tsx:57-75`:

- replace `DiffEditor` with `MonacoDiffEditorHost`;
- pass `original={fromText}`, `modified={toText}`, and `language={language}`;
- keep `onMount={bodyModel.onDiffMount}` but change that callback's type and
  meaning to receive `MonacoDiffEditorHostView`;
- keep `options.readOnly`, `originalEditable: false`,
  `renderSideBySide: true`, and `automaticLayout: true` exactly as they are;
- delete `keepCurrentOriginalModel`, `keepCurrentModifiedModel`, their stale
  lifecycle comment, and `theme="custom-dark"`.

Before:

```tsx
<DiffEditor
    language={language}
    original={fromText}
    modified={toText}
    onMount={bodyModel.onDiffMount}
    keepCurrentOriginalModel
    keepCurrentModifiedModel
    options={{
        readOnly: to.kind !== "unstaged",
        originalEditable: false,
        renderSideBySide: true,
        automaticLayout: true,
    }}
    theme="custom-dark"
/>
```

After:

```tsx
<MonacoDiffEditorHost
    language={language}
    original={fromText}
    modified={toText}
    onMount={bodyModel.onDiffMount}
    options={{
        readOnly: to.kind !== "unstaged",
        originalEditable: false,
        renderSideBySide: true,
        automaticLayout: true,
    }}
/>
```

Modify `src/renderer/editors/file-diff/FileDiffBodyModel.ts` as part of the
same seam conversion:

- change `onDiffMount` to receive `MonacoDiffEditorHostView`;
- call `host.getEditor()` to retain the raw modified-side editor needed for
  `getValue()` and write-back, and use `host.listenToModifiedContent()` so the
  subscription is disposed with the host;
- remove `originalModel`, `modifiedModel`, `contentSub`, and the macrotask that
  directly disposes models;
- keep the application-state subscriptions, modified-side write-back gate,
  and cleanup of the raw-editor reference; no application model owns a Monaco
  `ITextModel` after this change.

The resulting ownership boundary is:

```ts
// Before: FileDiffBodyModel retained wrapper-created models and disposed them.
private originalModel: monaco.editor.ITextModel | null = null;
private modifiedModel: monaco.editor.ITextModel | null = null;
setTimeout(() => {
    original?.dispose();
    modified?.dispose();
}, 0);

// After: the host owns the widget, models, and modified-content subscription.
onDiffMount = (host: MonacoDiffEditorHostView): void => {
    this.modifiedEditor = host.getEditor().getModifiedEditor();
    host.listenToModifiedContent(() => {
        // Existing Unstaged-only write-back, using this.modifiedEditor, remains.
    });
};
```

Do not replace the host-owned cleanup with another consumer-side delayed
dispose. This removes the double-dispose path while retaining Monaco's safe
ordering.

### 4. Convert `CommitDiffPanel` without changing its other UI

Modify only the Monaco seam in
`src/renderer/editors/git-tree/CommitDiffPanel.tsx`:

- replace the wrapper import with `MonacoDiffEditorHost` and the host-view
  type;
- change `diffEditorRef` to a
  `useRef<MonacoDiffEditorHostView | null>(null)` (rename it to
  `diffHostRef` if that makes the ownership clear);
- change `onMount={(editor) => { diffEditorRef.current = editor; }}` to store
  the host view;
- in the scroll-reset effect, call `diffHostRef.current?.getEditor()` and
  retain the two existing `setScrollPosition` calls;
- remove the wrapper-specific comment about child `setValue` effects and
  explain that the host's `onUpdate()` synchronizes content before this parent
  passive effect resets scroll;
- pass `original={diff.before}`, `modified={diff.after}`, and
  `language={language}` to the face, retain the four options, and delete the
  `theme` prop.

Before:

```tsx
const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);

<DiffEditor
    language={language}
    original={diff.before}
    modified={diff.after}
    onMount={(editor) => { diffEditorRef.current = editor; }}
    options={{
        readOnly: true,
        originalEditable: false,
        renderSideBySide: false,
        automaticLayout: true,
    }}
    theme="custom-dark"
/>
```

After:

```tsx
const diffHostRef = useRef<MonacoDiffEditorHostView | null>(null);

<MonacoDiffEditorHost
    language={language}
    original={diff.before}
    modified={diff.after}
    onMount={(host) => { diffHostRef.current = host; }}
    options={{
        readOnly: true,
        originalEditable: false,
        renderSideBySide: false,
        automaticLayout: true,
    }}
/>
```

The raw `IStandaloneDiffEditor` is still needed only inside the existing scroll
reset (`getOriginalEditor()` and `getModifiedEditor()`). The host ref is the
lifecycle reference; the raw widget is obtained through `getEditor()` for that
narrow Monaco operation. All file-list rendering, status badges, splitter,
context menu, navigation action, commit loading, empty states, and panel
layout remain unchanged.

### 5. Verify the conversion without adding tests or touching cleanup/config

Perform source and manual checks proportional to this lifecycle risk:

- `rg` finds no `@monaco-editor/react` import in `FileDiffBody.tsx` or
  `CommitDiffPanel.tsx`; the new face imports `mountVanilla`; no wrapper
  `DiffEditor` remains at either mount point.
- `CompareEditor.ts` still creates, owns, replaces, releases, and disposes its
  models through the unchanged host API. Its behavior and source seam do not
  regress when the host gains React props/update logic.
- On an active File Diff page, verify both host geometry (`offsetHeight` and
  non-zero width) and non-empty `.view-lines`. Repeat for the active Git Tree
  Commit Diff panel; do not use an inactive page as the geometry baseline.
- In File Diff, switch `from`/`to` revisions while mounted, edit the modified
  side when `to.kind === "unstaged"`, and confirm non-Unstaged revisions are
  read-only. Verify the original side is never editable and no Monaco disposal
  exception occurs when leaving the editor.
- In Commit Diff, select multiple files after scrolling one diff, verify both
  panes reset to the top, and confirm the list, badges, splitter, context menu,
  empty states, and “Open in new Tab” action still render.
- Verify host-owned models are disposed exactly once after
  `setModel(null)`/widget disposal, and `FileDiffBodyModel` no longer disposes
  any Monaco model. Verify the host callback receives the host view, not a raw
  widget.
- In Compare, exercise a model-pair replacement and exit compare mode. Confirm
  the unchanged explicit `releaseOwnedModels(previousModels)` is harmless
  after `setModel(null)` now releases the same pair internally, and confirm
  each old pair is disposed once after the macrotask.
- Verify the app theme still comes from `configure-monaco.ts`; no new theme
  literal, loader configuration, package change, unit test, or dashboard edit
  is introduced.

## Concerns

1. **Ownership is resolved, not open.** The React face must create both File
   Diff models through the host and the host must own them. The old
   `keepCurrent*Model` flags and `FileDiffBodyModel` model-disposal code must
   not survive. The only safe sequence is `setModel(null)` → widget
   `dispose()` → macrotask model disposal, with borrowed models excluded.

2. **Replacement must be safe in the shared host.** The existing diff host
   lacks a React face, host callback, getter, and live string-prop update path,
   and its `setModel()` currently leaves displaced owned models in the set.
   Add the React capabilities and the single-editor host's replace-and-release
   contract to `MonacoDiffEditorHostView`; do not have either React consumer
   compensate with its own `releaseOwnedModels()` call. Ordinary same-model
   writes may stay in place for cursor/undo behavior, but every actual pair
   replacement—including repeated Commit Diff selection changes—goes through
   the shared release path.

3. **Options must update before content.** File Diff's `to.kind` can flip
   `readOnly` while `toText` changes in the same render. `onUpdate()` must call
   `editor.updateOptions()` before applying modified content, so the editable
   path uses `executeEdits`/`pushUndoStop` and the read-only path uses
   `setValue`, matching the wrapper.

4. **The host must distinguish its React pair from Compare's explicit pair.**
   `CompareEditor` passes no `original`/`modified` host props and must continue
   to create models itself. The host's new React model fields must not overwrite
   or dispose Compare's models, and `setModel()` must retain its explicit
   borrowed default and owned opt-in.

5. **Raw widget access is still legitimate but narrow.** File Diff needs the
   modified editor for write-back and Commit Diff needs both code editors for
   scroll reset. Those operations use `host.getEditor()` after the host-object
   callback; neither consumer stores the raw editor as its lifecycle owner.

6. **Live content means no remount assumption.** Neither mount point has a
   `key`; both keep the host mounted while selected revisions/files change.
   The shared host must update an existing pair in place when that preserves
   user-edit state, and use the safe `setModel()` replacement path when a new
   pair is selected. Commit's parent scroll effect must run after the host
   update, and File Diff must preserve modified-side edits without replacing
   the model on every echo.

7. **Geometry can fail silently.** Both parent chains are flex-resolvable and
   the existing diff CSS includes `width: 100%` for Monaco's direct child, but
   active-page geometry and `.view-lines` still need manual verification.

8. **Scope is deliberately narrow.** Do not convert `TextChrome`, the Git Tree
   panel, the File Diff editor model, `configure-monaco.ts`, or the single-editor
   host. Do not add unit tests or a dashboard entry.

## Acceptance Criteria

- [ ] `src/renderer/editors/shared/MonacoDiffEditorHost.tsx` exists as a thin
  `mountVanilla` face and re-exports the diff-host props.
- [ ] `MonacoDiffEditorHostView.ts` remains the only diff host, keeps the
  existing `CompareEditor` ownership API, and adds the host-object mount
  callback, `getEditor()`, host-created React model pair, live
  original/modified/language/options updates, and replace-and-release
  semantics for `setModel()`.
- [ ] Host-created React models are owned by the host; borrowed models remain
  borrowed; disposal is idempotent and occurs only after
  `setModel(null)` and widget disposal, via the existing macrotask deferral.
  Releasing a pair twice is a no-op, and borrowed pairs are never scheduled.
- [ ] `FileDiffBody.tsx` renders `MonacoDiffEditorHost` with its original,
  modified, language, and options values; its `theme` and both
  `keepCurrent*Model` props are gone.
- [ ] `FileDiffBodyModel.ts` receives a host view, uses the host/raw editor only
  for modified-side write-back, and contains no manual original/modified model
  disposal.
- [ ] File Diff preserves `readOnly: to.kind !== "unstaged"`,
  `originalEditable: false`, side-by-side rendering, and live revision/content
  updates.
- [ ] The verified current `CommitDiffPanel.tsx` surface (282 lines before
  implementation) retains the same surrounding feature behavior except for
  the Monaco seam; its host ref obtains the raw widget only for the existing
  scroll reset, and its read-only/single-column options remain unchanged.
- [ ] Both `theme="custom-dark"` literals and all `@monaco-editor/react`
  component imports at these two sites are removed. No `configure-monaco.ts`
  change is made.
- [ ] Existing `MonacoDiffEditorHostView.css` supplies geometry for both sites;
  no redundant consumer height/style workaround is added.
- [ ] Manual active-page verification confirms non-zero host geometry and
  `.view-lines`, live model updates, read-only/editable behavior, scroll reset,
  write-back, and clean model/widget disposal without Monaco exceptions for
  File Diff, Commit Diff, and Compare model replacement.
- [ ] No unit tests, package changes, dashboard/epic edits, single-editor-host
  edits, or commit are made by this task.

## Files Changed

| File | Planned change |
|---|---|
| `src/renderer/editors/shared/MonacoDiffEditorHostView.ts` | Enhance the existing diff host with the host-object callback, raw-editor getter, host-owned React model pair, live value/language/options updates, and single-editor-equivalent replace-and-release semantics while preserving Compare's explicit ownership API and deferred cleanup. |
| `src/renderer/editors/shared/MonacoDiffEditorHost.tsx` | New nine-line-style React face calling `mountVanilla`. |
| `src/renderer/editors/file-diff/FileDiffBody.tsx` | Replace the wrapper mount, remove `theme` and `keepCurrent*Model`, and pass live diff values/options to the host face. |
| `src/renderer/editors/file-diff/FileDiffBodyModel.ts` | Accept the host-object mount callback, use the host-owned modified-content listener, and remove manual Monaco model disposal. |
| `src/renderer/editors/git-tree/CommitDiffPanel.tsx` | Replace the wrapper mount, store a host ref, use `getEditor()` for scroll reset, and preserve all other panel UI. |

### Files that require no changes

| File | Reason |
|---|---|
| `src/renderer/editors/shared/MonacoDiffEditorHostView.css` | Existing full-size flex geometry and `> .monaco-diff-editor { width: 100% }` rule already serve both consumers. |
| `src/renderer/editors/compare/CompareEditor.ts` | Existing vanilla consumer is the ownership/lifecycle reference and must remain unchanged. |
| `src/renderer/editors/shared/MonacoEditorHostView.ts` | US-1056's single-editor host is a separate sibling per EPIC-061 E3-2. |
| `src/renderer/editors/shared/MonacoEditorHost.tsx` | Single-editor React face is a template only; this task adds the parallel diff face. |
| `src/renderer/api/setup/configure-monaco.ts` | Global theme and loader cleanup remain in US-1061; this task only removes consumer theme props. |
| `src/renderer/editors/file-diff/FileDiffEditor.ts` | Revision state and application host ownership remain unchanged. |
| `src/renderer/editors/git-tree/GitTreeEditorView.tsx` and `GitTreeEditorModel.ts` | Parent layout and commit/tree state already provide the required mounted geometry and lifecycle. |
| `src/renderer/uikit/shared/mount.tsx` | `mountVanilla` already appends, mounts, updates, disposes, and removes the host root. |
| `doc/active-work.md` and `doc/epics/EPIC-061.md` | US-1060 is already listed; the user explicitly forbids a dashboard or epic-table edit. |
| `package.json`, lockfiles, and test files | The dependency remains until US-1061; this task adds no unit tests or test harness. |

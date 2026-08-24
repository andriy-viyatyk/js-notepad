# US-1056: Monaco editor host + `MonacoBody` pilot

## Goal

Create `MonacoEditorHostView`, a sibling of the working diff-editor host, that
owns one `monaco.editor.create` instance and its host-owned model lifecycle.
Expose it through a thin React face, then convert the main text-editor body
from `@monaco-editor/react`'s `<Editor>` to that face without changing the
surrounding `TextChrome`/React editor island.

This is the first task of [EPIC-061](../../epics/EPIC-061.md). E3-2 through
E3-5 and E3-8 are binding: the plain and diff hosts remain separate, the plain
host is uncontrolled, external writes have one host-owned policy, it has no
`theme` or `height` prop, and sizing belongs to CSS.

## Background

### Epic and UIKit constraints

EPIC-061 deletes the shared lifecycle dependency `@monaco-editor/react`, not
Monaco itself. `monaco-editor` remains the direct runtime and type dependency.
E3-2 requires a new sibling at
`src/renderer/editors/shared/MonacoEditorHostView.ts`; do not add a mode flag to
`MonacoDiffEditorHostView.ts`, whose editor/model types and deferred diff-model
cleanup are different.

The host is an intentional Rule 2 exception under E3-3. `monaco.editor.create`
owns a model and reports changes; it must not receive a controlled `value` prop
that reconciles text on every React update. The host accepts an
`initialValue` used only while creating its first model, exposes imperative
`setValue`/`getEditor` access, and accepts or replaces models with explicit
ownership. Under E3-8, `setValue` is the single external-write entry point for
all consumers in this epic: comparison, read-only handling, editable
`executeEdits`/`pushUndoStop`, and callback suppression live in the host once.
The application content model remains the source of truth.

`src/renderer/uikit/CLAUDE.md` Rule 9, especially lines 496-502, requires that
the constructor create only the stable root. It may not create Monaco, child
DOM, listeners, subscriptions, measurements, or timers. Monaco creation belongs
in `onMount()`, after `mountVanilla` has attached the root. `VanillaView.dispose`
does not detach the root; the adapter owns root removal. The public constructor
must be explicit because `VanillaView`'s base constructor is protected.

The direct template is
`src/renderer/editors/shared/MonacoDiffEditorHostView.ts` and
`src/renderer/editors/compare/CompareEditor.ts`. The template provides the
following contracts to preserve for the single-editor sibling:

- `VanillaView` owns a stable `.monaco-host-root` and the editor field.
- Monaco resources created by the host are tracked separately from borrowed
  resources.
- `assertReady()` rejects imperative calls before mount or after disposal.
- subscriptions are explicitly disposed before the editor.
- the editor is detached/disposed before host-owned models are disposed, with
  model disposal deferred to a macrotask.
- the host applies `MONACO_THEME_NAME` globally after widget creation; this is
  harmless and consistent with the existing template, but it is not a public
  per-instance theme prop.

`src/renderer/uikit/shared/mount.tsx`'s `mountVanilla` appends the view root,
calls `mount()`, forwards later props through `update()`, and disposes/removes
the view root on cleanup. `src/renderer/editors/markdown/MarkdownBlock.tsx`
is the reference for a minimal React face: it contains only the
`mountVanilla` import, view/type imports, type re-export, and forwarding
function.

### What the installed `<Editor>` currently does

The installed wrapper is `@monaco-editor/react` 4.7.0. Its implementation was
verified in `node_modules/@monaco-editor/react/dist/index.mjs.map`, in the
embedded `Editor.tsx` source, and its compiled equivalent in
`node_modules/@monaco-editor/react/dist/index.mjs`. From `MonacoBody`'s point
of view, the relevant behavior is:

| Existing wrapper behavior | Evidence in current source | Replacement responsibility |
|---|---|---|
| Creates or reuses a model before creating the widget, using `value` (or default value) and `language` (or default language). With no `path`, the model is created without a URI. | Wrapper `getOrCreateModel` and `createEditor`; current `MonacoBody.tsx:135-137` passes `value` and `language`. | `MonacoEditorHostView.onMount()` creates its first model from `initialValue` and `language`, tracks it as host-owned, and creates the editor with that model. |
| Creates the widget with `automaticLayout: true`, then spreads `options`. | Wrapper `createEditor`; current `MonacoBody.tsx:141-147` also passes `automaticLayout: true`. | The host's `monaco.editor.create` call defaults `automaticLayout` to `true` and applies the consumer's options. `MonacoEditorHostView.css` supplies full-size geometry. |
| Subscribes to `onDidChangeModelContent` and calls `onChange(editor.getValue(), event)` for model changes. The wrapper suppresses the callback only for its own controlled-value `executeEdits` path. | Wrapper `subscriptionRef` / `onDidChangeModelContent`; current `MonacoBody.tsx:124-129` maps the callback to `host.changeContent(value ?? "", true)`. | The host owns the model subscription and calls the new `onChange(value: string)` API. `MonacoBody` retains only the user-write mapping. |
| Reconciles a changing controlled `value`: in read-only mode it calls `setValue`; otherwise it replaces the full model with `executeEdits` and calls `pushUndoStop`; both paths suppress the wrapper's `onChange`. | Wrapper `useUpdate` for `[value]`; current `MonacoBody.tsx:136` supplies `sliced.content`. | Under E3-8, `MonacoEditorHostView.setValue(next)` is the single external-write entry point. It compares first, chooses the read-only or editable path, and suppresses its own `onChange`; `MonacoBody` calls only `hostRef.current?.setValue(sliced.content)`. |
| Applies a changing `language` with `monaco.editor.setModelLanguage`. | Wrapper `useUpdate` for `[language]`; current `MonacoBody.tsx:137` supplies `sliced.language`. | The host applies its `language` prop to the current model on mount and update. This is model configuration, not controlled text reconciliation. |
| Applies changing `options` with `editor.updateOptions(options)`. | Wrapper `useUpdate` for `[options]`; `MonacoBody`'s inline options include encrypted read-only state. | The host updates options on view update so encrypted/read-only changes remain effective. The consumer continues to own the option values. |
| Calls `onMount(editor, monaco)` after the editor is ready. | Wrapper `onMountRef` effect; current `MonacoBody.tsx:98-112` only uses the editor argument. | The host callback is `(host) => void`, where `host` is the `MonacoEditorHostView`; it is invoked after the editor/model/subscription are ready. Consumers call `host.getEditor()` when they need Monaco's raw editor. |
| Sets the global theme during creation and in the theme effect. | Wrapper `setTheme(theme)`; `configure-monaco.ts:90-104` defines/applies the app theme. | No `theme` prop. Apply imported `MONACO_THEME_NAME` after creation like the diff host; global theme changes remain owned by `configure-monaco.ts`. |
| Renders a loading-aware `<section>`/container, including width and height props, and hides the editor container until loader initialization completes. | Wrapper `MonacoContainer`; current call site is nested in the `Panel` at `MonacoBody.tsx:133-149`. | Not reproduced. `app.ts:135-140` runs `initMonaco()` during application setup, the direct host is synchronous once mounted, and the host root's CSS supplies geometry. No `height` prop is introduced. |
| Calls `loader.init()` and cancels it on unmount. | Wrapper `useMount`; `configure-monaco.ts:18` currently points that loader at the bundled instance. | Not reproduced. The host imports `monaco-editor` directly. `configure-monaco.ts:1-18` is explicitly out of scope because E3-7 removes `loader.config` only after all wrapper consumers are gone. |
| Supports wrapper-only path/view-state, `keepCurrentModel`, `beforeMount`, `overrideServices`, `line`, and `onValidate` behavior. | Wrapper `Editor.tsx` props and effects; none are passed by `MonacoBody`. | Not reproduced in this task. No current `MonacoBody` behavior depends on them, and no compatibility surface should be invented for later conversions. |

The host therefore reproduces the model/language setup, change subscription,
automatic layout, live options, host-object mount callback, and disposal. It
does not recreate the wrapper's loading React tree, loader initialization,
controlled `value` reconciliation, theme prop, height prop, path/view-state
cache, or unused wrapper callbacks.

### Content and model ownership answers

`MonacoEditor.ts` contains the `MonacoEditor` application editor model and its
typed queue; it has no Monaco `ITextModel`, no `monaco.editor.create` call, and
no model disposal. Its `contentHost` comes from `TextHostEditorModel`, which
stores a `TextFileModel` in `_host`
(`src/renderer/editors/base/TextHostEditorModel.ts:56`) and exposes it through
`contentHost`/`host` (`:126-134`). `MonacoBody.tsx:21` narrows that host to
`TextFileModel`.

`TextFileModel` is the owner of application text state. Its default state creates
the `content`/`language` fields (`TextEditorModel.ts:45-61`); `changeContent`
writes `state.content` and modification metadata (`:254-263`); and
`newTextFileModel` constructs the application model (`:446-455`). Nothing in
these files constructs or owns a Monaco `ITextModel`.

Therefore `MonacoBody` does need the new host to create its initial Monaco
model. The host owns that Monaco model and disposes it; `TextFileModel` owns the
text value and must never dispose the Monaco model. The host API must also allow
an explicitly borrowed model in later tasks so a caller that already owns a
model can attach it without a double-dispose.

Today content synchronization is implicit in the wrapper: `MonacoBody` selects
`content`, `language`, and `encrypted` with `host.state.use` at
`MonacoBody.tsx:23-33`, then passes `sliced.content` as `<Editor value>` at
`:135-137`. The wrapper's controlled-value effect writes external changes into
the Monaco model. Under E3-8, the host owns that policy once. The
implementation adds a `useEffect` in `MonacoBody.tsx` keyed by
`sliced.content` that calls `hostRef.current?.setValue(sliced.content)` and
does no comparison, undo-path selection, or callback suppression itself.

`MonacoEditorHostView.setValue` reads the current model and returns when its
value already equals the requested text. If the editor is read-only it uses
`editor.setValue`; otherwise it replaces the model's full range with
`executeEdits` and calls `pushUndoStop`. It suppresses its own `onChange` during
that write. All eleven consumers in this epic use this same host entry point.
`MonacoBody`'s `handleChange` therefore remains only the user-write path to
`host.changeContent(value, true)`.

### Consumer-specific setup and teardown

`MonacoBody.tsx:98-112` installs three consumer-specific mount behaviors:
`setupWheelZoom`, `setupSelectionListener`, and `setupRichPaste`; their teardown
closures are stored in `cleanupsRef`. The component's effect at `:114-122`
runs each closure, clears find decorations, and clears the host ref on unmount.
`setupWheelZoom` itself adds a capturing, non-passive wheel listener to
`editor.getDomNode()` after `hostView.getEditor()` and returns its removal
closure (`:155-166`).

This remains `MonacoBody` ownership after conversion. It must not move into the
generic host or into `MonacoEditor.ts`: wheel zoom depends on the app `api`, and
selection/rich-paste depend on this consumer's model and behavior. `MonacoBody`
uses `hostView.getEditor()` for those raw-editor operations; the host only owns
generic Monaco editor/model/subscription cleanup.

Drop suppression is different: `dropIntoEditor: { enabled: false }` is an
editor construction option at `MonacoBody.tsx:144-146`, not a listener created
by `MonacoBody`. Keep that option in the consumer's options object. There is no
separate drop teardown; `editor.dispose()` removes the editor's option-bearing
widget. The host disposes the widget, while the consumer continues to own its
wheel/selection/paste teardown.

`MonacoBody.tsx` survives as a React file. It still calls `state.use`, drains
`typedQueue`, handles request/reply queue calls, owns refs/effects/callbacks,
and renders the surrounding UIKit `Panel`. It is not a `mountVanilla` face like
`MarkdownBlock.tsx`. The new `src/renderer/editors/shared/MonacoEditorHost.tsx`
is the thin React face over the vanilla host; `MonacoBody` imports and renders
that face inside its existing panel. The `handleMount` focus call remains
correct because `src/renderer/uikit/shared/mount.tsx:34,37` appends the view
root to the live DOM before calling `view.mount()`, so the host callback runs
with an attached editor and `ed.focus()` still lands correctly.

## Implementation Plan

### 1. Add the single-editor vanilla host

Create `src/renderer/editors/shared/MonacoEditorHostView.ts` as a sibling of
`MonacoDiffEditorHostView.ts`. Use direct `monaco-editor` imports, the
`VanillaView` file import, and a co-located stylesheet. Do not import React or
`@monaco-editor/react`.

The public props and imperative surface should be explicit and future-consumer
oriented:

- `initialValue?: string`: used only for the first host-created model; never
  compared or reconciled in `onUpdate`.
- `language?: string`: initial model language and later model-language updates.
- `options?: monaco.editor.IStandaloneEditorConstructionOptions`: construction
  and live `updateOptions` input, including consumer-owned `readOnly` and
  `dropIntoEditor` settings.
- `onMount?: (host: MonacoEditorHostView) => void`: the Persephone host object,
  never the wrapper's `(editor, monaco)` pair. Consumers needing the raw editor
  call `host.getEditor()`.
- `onChange?: (value: string) => void`: host-owned model subscription callback;
  the value is always a string because the host owns or explicitly attaches a
  current model, and the unused wrapper event/`undefined` signature is not
  carried forward.
- `createModel(value, language?, uri?)`, `setModel(model, ownership?)`,
  `setValue(value)`, and `getEditor()`, with the same `assertReady` discipline
  as the diff host. `setModel` must distinguish host-owned and borrowed models;
  borrowed models are never disposed by this host.

Use the following lifecycle shape:

1. Constructor: create only the stable root with `className =
   "monaco-host-root"` and `data-type = "monaco-host"`; call `super` with a
   public constructor. Do not create the Monaco model/editor here.
2. `onMount()`: create the initial model from `initialValue`/`language`, add it
   to the owned-model set, call `monaco.editor.create(this.root, { model,
   automaticLayout: true, ...options })`, register the model content
   subscription, apply `MONACO_THEME_NAME` as the existing diff host does, and
   invoke the host-object `onMount` callback.
3. `onUpdate(props)`: keep the latest callback/options/language behavior without
   using `initialValue` as a controlled value. Update construction options with
   `editor.updateOptions(props.options ?? {})`; update the current model's
   language when `props.language` changes. Do not recreate the editor for normal
   prop updates.
4. `setValue(value)`: provide the single external-write entry point for this
   epic. Read the current model and return when the value already matches; use
   `editor.setValue` when read-only, otherwise replace the full range with
   `executeEdits` and call `pushUndoStop`. Suppress the host `onChange` callback
   for this programmatic write, saving the previous suppression state and
   restoring it in `finally` so nested/re-entrant writes cannot clear an outer
   suppression state. User edits continue to invoke the callback normally.
5. `setModel`/model replacement: detach the current model before replacing it,
   register ownership only when requested, and schedule disposal of released
   host-owned models after the widget no longer references them. Do not dispose
   borrowed models.
6. `onDispose()`: use an idempotent disposed guard; dispose host subscriptions;
   call `editor.setModel(null)` before `editor.dispose()`; clear the editor
   field; schedule each remaining host-owned model for deferred disposal; and
   never detach `root` in the view itself. Match the diff host's
   `scheduleModelDisposal`/`assertReady` pattern.

Before, the shared folder has only the diff host:

```ts
export class MonacoDiffEditorHostView extends VanillaView<MonacoDiffEditorHostProps> {
    protected onMount(): void {
        this.editor = monaco.editor.createDiffEditor(this.root, {
            automaticLayout: true,
            ...this.props.options,
        });
    }
}
```

After, add a separate single-editor owner:

```ts
export class MonacoEditorHostView extends VanillaView<MonacoEditorHostProps> {
    public editor: monaco.editor.IStandaloneCodeEditor | undefined;

    public constructor(props: MonacoEditorHostProps) {
        super(props, createHostRoot());
    }

    protected onMount(): void {
        const model = this.createModel(this.props.initialValue ?? "", this.props.language);
        this.editor = monaco.editor.create(this.root, {
            model,
            automaticLayout: true,
            ...this.props.options,
        });
        // Subscribe, apply the configured global theme, then hand back the host.
        this.props.onMount?.(this);
    }
}
```

The snippet is the lifecycle seam, not a complete implementation: the actual
host must include the subscription, update, ownership, deferred disposal, and
`assertReady` details above. Do not generalize the diff host or put a `mode`
union on either public editor field.

The host owns the external-write policy in one method. The implementation
shape must avoid a non-null assertion and must restore, rather than clear, the
previous suppression state:

```ts
public setValue(value: string): void {
    const editor = this.assertReady();
    const model = editor.getModel();
    if (!model || model.getValue() === value) return;

    const previousSuppression = this.suppressOnChange;
    this.suppressOnChange = true;
    try {
        if (editor.getOption(monaco.editor.EditorOption.readOnly)) {
            editor.setValue(value);
        } else {
            const range = model.getFullModelRange();
            editor.executeEdits("external-sync", [{
                range,
                text: value,
                forceMoveMarkers: true,
            }]);
            editor.pushUndoStop();
        }
    } finally {
        this.suppressOnChange = previousSuppression;
    }
}
```

The model-content listener checks `suppressOnChange` before calling
`this.props.onChange?.(editor.getValue())`; it never exposes Monaco's event or
an `undefined` value through the new host API.

### 2. Add the thin React face and CSS

Create `src/renderer/editors/shared/MonacoEditorHost.tsx` with the same shape as
`MarkdownBlock.tsx` and `ColorizedCode.tsx`: re-export the host props and return
`mountVanilla(MonacoEditorHostView, props)`. It must not contain Monaco hooks,
controlled-value logic, or an additional React root.

Create `src/renderer/editors/shared/MonacoEditorHostView.css`. Scope the host
root as the diff stylesheet does and give it `display: flex`, `flex: 1 1
auto`, `width: 100%`, `height: 100%`, `min-width: 0`, and `min-height: 0`.
Keep sizing on this host root; do not add `height` to the public props. Add the
same full-width child safeguard as the working diff host, scoped to the single
editor root (`.monaco-host-root > .monaco-editor { width: 100%; }`), because the
former wrapper supplied a block-level full-width container. Use the existing
`@layer editor` convention and do not add colors or inline style.

Before, `MonacoBody.tsx:135-148` renders the wrapper directly:

```tsx
<Editor
    value={sliced.content}
    language={sliced.language}
    onMount={handleMount}
    onChange={handleChange}
    theme="custom-dark"
    options={{
        automaticLayout: true,
        readOnly: Boolean(sliced.encrypted),
        dropIntoEditor: { enabled: false },
    }}
/>
```

After, it renders the host face with initial text separated from later sync:

```tsx
<MonacoEditorHost
    initialValue={sliced.content}
    language={sliced.language}
    onMount={handleMount}
    onChange={handleChange}
    options={{
        automaticLayout: true,
        readOnly: Boolean(sliced.encrypted),
        dropIntoEditor: { enabled: false },
    }}
/>
```

The `theme="custom-dark"` literal and `height`/wrapper props are absent. Do
not touch `configure-monaco.ts` or its `loader.config({ monaco })` line in this
task.

### 3. Convert only the Monaco mount seam in `MonacoBody.tsx`

Modify `src/renderer/editors/monaco/MonacoBody.tsx` only for the new host seam:

- replace the `Editor` import with the `MonacoEditorHost` face import;
- keep the direct `monaco-editor` import because `MonacoBody` uses
  `monaco.Range`, editor types, and decoration types;
- keep the new `hostRef`, queue subscriptions, selection decorations, focus logic,
  `setupWheelZoom`, `setupSelectionListener`, `setupRichPaste`, and their
  existing cleanup effect;
- retain the `Panel` wrapper and its existing props;
- keep `automaticLayout: true`, `readOnly: Boolean(sliced.encrypted)`, and
  `dropIntoEditor: { enabled: false }` in the host options;
- remove only the wrapper `theme` prop and controlled `value` prop;
- keep a `hostRef` for `MonacoEditorHostView`, assigning it in the mount callback
  and calling `hostView.getEditor()` before installing the three existing
  consumer behaviors;
- add the external content-sync effect described in Background, calling only
  `hostRef.current?.setValue(sliced.content)`; do not add a comparison,
  editable/read-only branch, or `syncingContentRef` to the consumer;
- do not move this state into `MonacoEditor.ts` or refactor the existing
  hooks/effects.

The callback boundary changes from the wrapper's type to the host-object
callback:

```tsx
// Before: wrapper supplies (editor, monaco), although this consumer uses editor only.
const handleMount = useCallback(
    (ed: monaco.editor.IStandaloneCodeEditor) => { /* ... */ },
    [model, host],
);

// After: the host object carries the external-write policy; raw editor access is explicit.
const handleMount = useCallback(
    (hostView: MonacoEditorHostView) => {
        hostRef.current = hostView;
        const ed = hostView.getEditor();
        /* unchanged setup using ed */
    },
    [model, host],
);
```

The meaningful new code is now a one-line handoff to the host policy:

```tsx
const hostRef = useRef<MonacoEditorHostView | null>(null);

useEffect(() => {
    hostRef.current?.setValue(sliced.content);
}, [sliced.content]);

const handleChange = useCallback((value: string) => {
    host?.changeContent(value, true);
}, [host]);
```

The `handleMount` focus call remains correct: `mount.tsx:34,37` appends the view
root to the live DOM before calling `view.mount()`, so the editor is attached
when the host invokes the callback and `ed.focus()` still lands as before. No
broad `useState`/`useEffect` cleanup is part of this task (EPIC-061 Concern 6).

### 4. Verify the pilot and handoff contract

After implementation, verify the source-level and manual behavior below. Do
not add unit tests or a test harness; this repository does not use them.

- `rg` finds no `@monaco-editor/react` import in the files changed by this
  task, while `configure-monaco.ts:2` and `:18` remain untouched for later
  wrapper consumers.
- The host constructor creates only its root; Monaco creation occurs only in
  `onMount()`; repeated mount/dispose paths do not create duplicate models or
  listeners.
- `getEditor`/`createModel`/`setModel` before mount and after disposal fail via
  the host's assert-ready error; dispose is idempotent; borrowed models are not
  disposed; host-owned models are disposed once after editor detachment.
- On an active page, measure both the host root's `offsetHeight` and a
  non-empty `.view-lines` collection. An inactive page is not a valid geometry
  check because it measures `0×0`.
- Edit text manually and verify `TextFileModel.changeContent` receives the
  user edit; update content externally through a script/file reload/state
  change and verify the editor updates without an echo that marks the update as
  a user edit.
- Change language and encrypted state and verify model language and read-only
  options update without editor recreation.
- Verify Ctrl/Cmd-wheel still calls `api.zoom`, selection state still updates,
  rich paste still works for Markdown/HTML, and the wheel/selection/paste
  listeners are removed when the body unmounts.
- Verify dropped files are not inserted into editor text, and the host/widget
  is disposed when the page body is removed.
- Verify the app theme remains controlled by `configure-monaco.ts`; no
  `theme` prop or new loader configuration is introduced.

## Concerns

1. **Initial model versus controlled value.** `MonacoBody` has no existing
   Monaco model to pass. The host must create the initial `ITextModel`, but
   `initialValue` must be construction-only. Any `onUpdate` code that compares
   it as a value prop would violate E3-3 and recreate the wrapper's controlled
   reconciliation under a new name.

2. **External-sync echo.** Monaco content events do not inherently distinguish
   user edits from programmatic writes. The host's `setValue` method must guard
   its write and restore the prior suppression state. Otherwise a script or
   file reload will call `changeContent(..., true)` again and be misclassified
   as a user edit. Consumers must call this entry point rather than reproduce
   the policy.

3. **Read-only ordering.** `sliced.encrypted` changes the host options while
   `sliced.content` may change in the same render. The host must apply updated
   options before the content-sync effect runs, so the effect can preserve the
   wrapper's read-only `setValue` branch. `mountVanilla`'s update is a layout
   effect and `MonacoBody`'s sync is a normal effect; verify this rather than
   introducing a second state path.

4. **Ownership and deferred cleanup.** `TextFileModel` must never receive an
   `ITextModel` disposal responsibility. The host must detach the model from
   the editor, dispose the editor, then defer disposal of only its own model
   set. A replacement API that blindly disposes every attached model will break
   later note/model-switch consumers and can double-dispose borrowed models.

5. **Consumer-specific teardown.** The generic host must not absorb
   `setupWheelZoom`, selection state, rich paste, decorations, or app-specific
   cleanup. These behaviors currently live in `MonacoBody` and its refs/effect;
   preserve that ownership while the host owns only Monaco lifecycle resources.

6. **Global theme.** E3-4 forbids a `theme` prop. `MONACO_THEME_NAME` and
   `applyMonacoTheme` remain in `configure-monaco.ts`; do not remove
   `loader.config` early, change the theme setup, or port the literal into the
   new React face.

7. **Layout.** The former wrapper provided a full-size section and child
   container. The new root must be a flex-safe full-size element inside the
   existing `Panel`, including `min-height: 0`, or Monaco can appear mounted
   while rendering into zero height. Use the active-page geometry check in the
   verification plan.

8. **Scope creep in `MonacoBody`.** Do not convert its remaining React logic,
   alter queue behavior, move model behavior into `MonacoEditor.ts`, or tidy
   unrelated hooks. This task proves the host through one consumer; later epic
   tasks own their own content synchronization and app-specific behavior.

## Acceptance Criteria

- [ ] `src/renderer/editors/shared/MonacoEditorHostView.ts` exists as a
  single-editor sibling, imports `monaco-editor` directly, and never imports
  `@monaco-editor/react` or React.
- [ ] Its constructor creates only a stable root with the host data/type
  attributes; `monaco.editor.create` is called only from `onMount()`.
- [ ] The host creates and owns its initial `ITextModel`, supports explicit
  borrowed-model attachment/replacement, exposes `createModel`, `setModel`,
  `setValue`, and `getEditor`, and guards imperative access with
  `assertReady`.
- [ ] The host reproduces automatic layout, language setup/update, options
  update, the model `onDidChangeModelContent` callback, host-object mount
  callback, and idempotent editor/model/subscription disposal. Model disposal
  is deferred and borrowed models are never disposed.
- [ ] `MonacoEditorHostView.css` gives the host root full-size flex geometry;
  no `height` or `theme` prop is added.
- [ ] `src/renderer/editors/shared/MonacoEditorHost.tsx` is a thin
  `mountVanilla` face with the host prop type re-exported.
- [ ] `MonacoBody.tsx` renders `MonacoEditorHost` instead of `<Editor>`, drops
  the wrapper `theme` and controlled `value` props, and retains language,
  automatic layout, encrypted read-only, and drop suppression options.
- [ ] `MonacoBody.tsx` sends external `sliced.content` changes through
  `hostRef.current?.setValue` without a user-change echo; the host owns the
  comparison, read-only/editable write path, undo preservation, and callback
  suppression. Its existing queue, selection, rich-paste, wheel-zoom,
  decoration, focus, and teardown logic is otherwise unchanged.
- [ ] `MonacoBody.tsx` remains a React component. It does not become a
  `mountVanilla` face; only the new host has that adapter.
- [ ] `configure-monaco.ts`, especially `loader.config({ monaco })`, is
  unchanged. `MonacoDiffEditorHostView.ts`, its stylesheet, `CompareEditor.ts`,
  `MonacoEditor.ts`, and `monaco/index.tsx` are unchanged.
- [ ] Manual verification confirms active-page geometry, external/user text
  synchronization, language/read-only updates, wheel zoom, selection,
  rich-paste, drop suppression, theme behavior, and complete disposal.
- [ ] No unit tests, test harnesses, package uninstall, loader cleanup,
  dashboard entry, epic-table edit, or commit is made by this task.

## Files Changed

| File | Planned change |
|---|---|
| `src/renderer/editors/shared/MonacoEditorHostView.ts` | New single-editor `VanillaView`; creates `monaco.editor.create` in `onMount`, owns/accepts models, updates language/options, exposes imperative access, and performs deferred cleanup. |
| `src/renderer/editors/shared/MonacoEditorHostView.css` | New full-size flex geometry for the host root and Monaco child. |
| `src/renderer/editors/shared/MonacoEditorHost.tsx` | New thin React face calling `mountVanilla`. |
| `src/renderer/editors/monaco/MonacoBody.tsx` | Replace the wrapper mount with the host face; move external content reconciliation to an explicit consumer effect; retain app-specific React behavior. |

### Files that require no changes

| File | Reason |
|---|---|
| `src/renderer/editors/shared/MonacoDiffEditorHostView.ts` | E3-2 requires a sibling, not a mode-flag generalization; its diff model contract remains intact. |
| `src/renderer/editors/shared/MonacoDiffEditorHostView.css` | Existing diff-host geometry is already working and is not the single-editor stylesheet. |
| `src/renderer/editors/compare/CompareEditor.ts` | Existing diff consumer is outside this pilot and already uses the diff host. |
| `src/renderer/editors/monaco/MonacoEditor.ts` | Owns the application editor state/queue, not a Monaco widget or `ITextModel`. |
| `src/renderer/editors/monaco/index.tsx` | Its `TextChrome`/`MonacoBody` composition remains valid. |
| `src/renderer/uikit/shared/mount.tsx` | `mountVanilla` already supplies the required adapter lifecycle. |
| `src/renderer/editors/markdown/MarkdownBlock.tsx` | Reference face only; no behavior change. |
| `src/renderer/api/setup/configure-monaco.ts` | E3-7 defers loader/configuration deletion until US-1061; theme setup is retained. |
| `package.json` and lockfiles | The dependency remains until US-1061. |
| `doc/active-work.md` and `doc/epics/EPIC-061.md` | The US-1056 dashboard/epic entries already exist; this task must not add or edit them. |
| Test files or test harnesses | This project does not use them for this conversion. |

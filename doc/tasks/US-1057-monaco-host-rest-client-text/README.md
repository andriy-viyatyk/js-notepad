# US-1057: Convert rest-client and text editors to `MonacoEditorHost`

## Goal

Convert the five `@monaco-editor/react` `<Editor>` mount points in the
rest-client request/response UI and the text editor's script panel to the
`MonacoEditorHost` face established by [US-1056](../US-1056-monaco-editor-host/README.md).
The task changes only the Monaco lifecycle seam; it does not convert editor
chrome or change the surrounding React/state architecture.

This is a task in [EPIC-061](../../epics/EPIC-061.md), which remains the owner
of the eventual dependency removal.

## Background

### Host contract to use

The implemented contract is in
`src/renderer/editors/shared/MonacoEditorHostView.ts`, exposed by
`src/renderer/editors/shared/MonacoEditorHost.tsx`, and was piloted by
`src/renderer/editors/monaco/MonacoBody.tsx` in commit `bd5ad007`.

Each consumer must pass `initialValue` once, omit `theme` and `height`, and
receive a host view from `onMount`. If a consumer needs Monaco's widget, it
calls `host.getEditor()`. External content reconciliation goes through the
consumer's `hostRef.current?.setValue(next)` effect; the host owns equality
checking, the read-only versus editable write path, undo preservation, and
`onChange` suppression. No consumer may reproduce that policy against the raw
editor.

`mountVanilla` in `src/renderer/uikit/shared/mount.tsx` creates the view,
appends its root, mounts it, and on React cleanup calls `view.dispose()` before
removing the root. `MonacoEditorHostView.onDispose()` disposes subscriptions,
detaches and disposes the editor, and defers disposal of host-owned models.
Therefore a conditional host is not orphaned when its JSX arm disappears.

### Mount lifetime and conditional rendering

`RequestBuilder` is rendered by `SplitDetailPanel` without a `key` at
`src/renderer/editors/rest-client/RestClientShared.tsx:275`. The splitters only
change panel dimensions. Its two hosts have these exact conditions:

- The headers host at `RequestBuilder.tsx:383-389` is rendered when
  `headersView !== "table"` (the `else` arm of `headersView === "table" ?`),
  inside `RequestBuilderModel` state. Switching back to Table unmounts it.
- The body host at `RequestBuilder.tsx:558-564` is the fall-through return of
  `BodyContent`. The preceding arms return for `bodyType` `none`, `binary`,
  `form-data`, and `form-urlencoded`; it is therefore rendered only for
  `bodyType === "raw"`. Changing body type away from raw unmounts it.

There is no mount-site `key`; the headers view/body-type switches are the
explicit conditional lifetime changes, and the `Splitter`s do not remount
either child. The enclosing rest-client page can of course unmount its React
tree when the page/editor is removed, which uses the same `mountVanilla`
cleanup path.

`ResponseViewer` also has no mount-site `key`. Its body host is present only
when `activeTab === "body"` and `!response.isBinary`; its headers JSON host is
present only when `activeTab === "headers"` and `headersView === "json"`.
The `executing` and `!response` early returns unmount both. These tab/view
conditions are the intended host lifetimes, not leaks.

`ScriptPanel` returns `null` while `state.open` is false, so closing the panel
unmounts its host. Its splitter changes `state.height` only and has no `key`.
EPIC-061 Concern 4 names `<PageToolbar>`, but the verified current source
imports and renders `EditorToolbar` at `ScriptPanel.tsx:12` and
`ScriptPanel.tsx:377-427`. Whichever chrome name is intended by the epic
wording, that toolbar and all of its controls remain untouched here.

### Per-site content-source investigation

The following is the conversion decision for every site. “Sync effect” means
an effect that calls only the host's `setValue` entry point, with a condition
that clears a stale ref when the conditional host arm is not present.

| Site | Current `value` source | Can that source change after this host mounts? | Decision |
|---|---|---|---|
| `RequestBuilder.tsx:383` headers JSON | `headersJson` from the local `RequestBuilderModel` state. `switchToJsonView()` sets it before changing `headersView` to `"json"`; typing calls `handleHeadersJsonChange`, which already updates the same state from the editor event. | Yes, typing changes the state after mount, but there is no independent external writer while this arm remains mounted. That state change is feedback from the editor, not a value that needs to be written back. | `initialValue={headersJson}` only; no sync effect. The ordering invariant below is load-bearing. |
| `RequestBuilder.tsx:558` raw body | `request.body` from the selected `RestRequest` prop. `handleMonacoBodyChange` writes edits through `vm.updateRequest`. | Yes. `RestClientEditor.updateRequest()` replaces the request object in state, and paste/load/request changes can change `body` while `bodyType` remains `"raw"`. | `initialValue={request.body}` plus a guarded `[request.body, request.bodyType]` effect calling `bodyHostRef.current?.setValue(request.body)`. The extra `bodyType` dependency clears a ref after the raw arm unmounts. |
| `ResponseViewer.tsx:349` formatted body | `formattedBody`, computed from `response.body` and the selected `language` by `formatBody()`. | Yes. `RestClientEditor.sendRequest()` installs a new response, and selecting a cached response also changes the `response` prop while the Body tab can remain selected. | `initialValue={formattedBody}` plus a guarded effect keyed by `formattedBody` and the active body condition. The `language` prop remains the host's live language-update path. |
| `ResponseViewer.tsx:374` headers JSON | `headersAsJson`, computed from `response.headers` by the `useMemo` at `ResponseViewer.tsx:135-140`. | Yes. A new or selected response changes the headers while the JSON view can remain mounted. | `initialValue={headersAsJson}` plus a guarded effect keyed by `headersAsJson` and the active headers-JSON condition. |
| `ScriptPanel.tsx:429` | `state.content` from `ScriptPanelModel.state`; `handleEditorChange` writes editor edits back to it. | Yes. `restore()` and `selectScript()` can replace content after the panel is open, and the panel's state remains the source of truth. | `initialValue={state.content}` plus a guarded `[state.content, state.open]` effect calling `scriptHostRef.current?.setValue(state.content)`. |

The response body is a viewer path and has no `onChange`, but the current
source's `EDITOR_OPTIONS` does not actually set `readOnly`; only the headers
JSON site explicitly adds `readOnly: true`. This task preserves those existing
options exactly rather than introducing a separate editor-behavior change.
The host's editable `executeEdits` path remains correct for the formatted body
if external content changes.

### Why each initial/sync decision is safe

The headers JSON site has exactly two writers. `switchToJsonView()` writes
`headersJson` at `RequestBuilder.tsx:99`, then writes `headersView = "json"` at
`:101`. State listeners run synchronously: at `:99` the conditional at
`:356-391` still renders the Table arm, so no host exists; at `:101` the JSON
arm mounts with the already-updated `headersJson`. The only other writer is
`handleHeadersJsonChange` at `RequestBuilder.tsx:121`, which is the editor's
own `onChange` feedback. This is why `initialValue={headersJson}` is sufficient
here. The order of `:99` before `:101` is a constraint and must not be
reversed: the old controlled wrapper would self-heal a stale mount, but
`initialValue` is read once, so the converted view would retain stale headers.

The raw request body is different: `handleMonacoBodyChange` at
`RequestBuilder.tsx:223-228` writes through `vm.updateRequest`, whose
`RestClientEditor.ts:424-447` state update creates the next request object.
The raw fall-through in `BodyContent` stays mounted while `bodyType` remains
`"raw"`, so the new host must receive later `request.body` values through
`setValue`.

The formatted response value is recomputed by `ResponseViewer.tsx:148-151`
from `response.body` and `language`. `RestClientEditor.ts:748-752` installs
completed responses, while `RestClientEditor.ts:306-313` restores a selected
request's cached response. Either can change the value without changing the
active Body arm, so it needs the `formattedBody` sync effect; `language` itself
is handled by the host's live language update.

The response headers JSON value is recomputed from every response's headers by
`ResponseViewer.tsx:135-140`. The same response assignments at
`RestClientEditor.ts:748-752` and `:306-313` can change it while the Headers /
JSON arm remains mounted, so it needs the `headersAsJson` sync effect.

The script content is written by the existing editor handler at
`ScriptPanel.tsx:126-128`, but it is also replaced by `selectScript()` at
`:211-216` and by `restore()` at `:73-83`. Those post-mount writers justify
the `state.content` sync effect; `state.open` is included only to invalidate
the ref when the panel's `return null` path unmounts the host.

### Options and constants

`RequestBuilder.tsx:33-44` defines `BODY_EDITOR_OPTIONS` as a module-level
constant, with stable identity and `automaticLayout: true`.
`ResponseViewer.tsx:30-41` defines `EDITOR_OPTIONS` the same way, also with
`automaticLayout: true`. The headers JSON site passes a fresh
`{ ...EDITOR_OPTIONS, readOnly: true }` object on render; the formatted-body
site passes the stable constant. `ScriptPanel` currently creates an inline
`{ automaticLayout: true }` object.

`MonacoEditorHostView.onUpdate()` calls `editor.updateOptions()` on every
view update. Monaco's `editorConfiguration.updateOptions()` deep-clones and
migrates the object, calls `EditorOptionsUtil.applyUpdate()`, and returns
without recomputing validated options when no semantic option changed
(`node_modules/monaco-editor/esm/vs/editor/browser/config/editorConfiguration.js:118-126`).
The fresh headers object is therefore harmless. None of these five sites
passes an option that must not be re-applied; `readOnly: true` is a normal live
option and the repeated `automaticLayout: true` is compatible with the host's
default.

### Existing mount handlers

Neither `RequestBuilder.tsx` nor `ResponseViewer.tsx` currently passes
`onMount`. Their new refs are only to obtain the host object for external
content sync; they do not need `getEditor()`.

`ScriptPanelModel.handleEditorDidMount` currently accepts a raw
`IStandaloneCodeEditor`, stores it in `editorRef`, and passes it to
`setupSelectionListener` (`ScriptPanel.tsx:155-158`). The converted JSX must
adapt the new callback at the boundary:

```tsx
onMount={(hostView) => {
    scriptHostRef.current = hostView;
    scriptModel.handleEditorDidMount(hostView.getEditor());
}}
```

This preserves the model's existing raw-editor state and cursor-selection
listener without making `ScriptPanelModel` know about the host contract.

## Implementation Plan

### 1. Convert `RequestBuilder.tsx`

- Replace the `Editor` import with `MonacoEditorHost` and
  `MonacoEditorHostView` imports.
- Keep `BODY_EDITOR_OPTIONS` as the module-level constant, including its
  existing `automaticLayout: true`; do not add `theme` or `height`.
- Convert the conditional headers JSON arm to `MonacoEditorHost` with
  `initialValue={headersJson}`, `language="json"`, `options={BODY_EDITOR_OPTIONS}`
  and a string-only `onChange`. Do not add a sync effect for this site.
- In `BodyContent`, retain the existing non-raw branches and convert only the
  raw fall-through to a host. Store its host view in a ref, assign it from
  `onMount`, and add the guarded effect for `request.body` described above.
  The effect must clear the ref when `request.bodyType !== "raw"` so a later
  request update cannot call `setValue` on a disposed host.
- Keep `language={request.bodyLanguage}` so the host updates the model
  language without recreating the editor. Change the consumer handler boundary
  to the host's `(value: string) => void` shape; do not add comparison,
  read-only branching, or echo suppression in `RequestBuilder`.

The host's string-only callback also removes the wrapper-era dead fallbacks
from both editable request handlers:

```tsx
// Before: RequestBuilder.tsx:119-121
const handleHeadersJsonChange = useCallback((value: string | undefined) => {
    const json = value ?? "";
    // validate json and call model.setHeadersJson(json) / vm.updateRequest(...)
}, [vm, request.id, model]);

// After
const handleHeadersJsonChange = useCallback((value: string) => {
    const json = value;
    // unchanged validation and model/vm writes
}, [vm, request.id, model]);

// Before: RequestBuilder.tsx:223-228
const handleMonacoBodyChange = useCallback(
    (value: string | undefined) => {
        vm.updateRequest(request.id, { body: value ?? "" });
    },
    [vm, request.id],
);

// After
const handleMonacoBodyChange = useCallback(
    (value: string) => {
        vm.updateRequest(request.id, { body: value });
    },
    [vm, request.id],
);
```

Before:

```tsx
<Editor
    value={request.body}
    language={request.bodyLanguage}
    theme="custom-dark"
    options={BODY_EDITOR_OPTIONS}
    onChange={onMonacoChange}
/>
```

After:

```tsx
<MonacoEditorHost
    initialValue={request.body}
    language={request.bodyLanguage}
    options={BODY_EDITOR_OPTIONS}
    onMount={(host) => { bodyHostRef.current = host; }}
    onChange={onMonacoChange}
/>
```

### 2. Convert `ResponseViewer.tsx`

- Replace the wrapper import with `MonacoEditorHost` and
  `MonacoEditorHostView`.
- Convert the formatted-body site to `initialValue={formattedBody}` and keep
  `language={language}` and `options={EDITOR_OPTIONS}`. Add a host ref and a
  conditional sync effect keyed by `formattedBody`; do not add an `onChange`.
- Convert the headers-as-JSON site to
  `initialValue={headersAsJson}`, `language="json"`, and
  `options={{ ...EDITOR_OPTIONS, readOnly: true }}`. Keep the fresh object
  literal; it is harmless under Monaco's semantic option diff. Add its own
  conditional sync effect keyed by `headersAsJson`; do not share a host ref
  between the two mutually exclusive arms.
- Include `activeTab`, `headersView`, `executing`, and response-presence/binary
  guards as needed to clear refs when an editor arm disappears. This prevents a
  content change during another tab or the loading/empty state from calling a
  disposed host.
- Remove all `theme="custom-dark"` literals. Do not add `height`, change the
  viewer chrome, or introduce a consumer-side value comparison.

Before:

```tsx
<Editor
    value={formattedBody}
    language={language}
    theme="custom-dark"
    options={EDITOR_OPTIONS}
/>
```

After:

```tsx
<MonacoEditorHost
    initialValue={formattedBody}
    language={language}
    options={EDITOR_OPTIONS}
    onMount={(host) => { formattedBodyHostRef.current = host; }}
/>
```

The headers arm follows the same shape, with
`initialValue={headersAsJson}`, `language="json"`, and the existing
`{ ...EDITOR_OPTIONS, readOnly: true }` options object.

### 3. Convert `ScriptPanel.tsx`

- Replace the wrapper import with `MonacoEditorHost` and
  `MonacoEditorHostView`; add the ref/effect hooks needed for the host.
- Keep `EditorToolbar` and every toolbar control exactly as they are. The
  `Panel` height and splitter remain the layout/chrome owner; no host `height`
  prop is introduced.
- Pass `initialValue={state.content}`, `language="typescript"`, and the
  existing `automaticLayout: true` option object. Delete only the wrapper's
  `theme` prop.
- Assign `scriptHostRef` from the host callback, then call
  `scriptModel.handleEditorDidMount(hostView.getEditor())` so the existing
  `editorRef` and selection listener continue to receive the raw widget.
- Route later `state.content` changes through the guarded host `setValue`
  effect. Guard `state.open` so closing the panel clears the ref after the
  host is disposed. Keep `handleEditorChange` as the state write path with the
  host's string-only callback type, removing its wrapper-era `value || ""`
  fallback.

Before:

```tsx
<Editor
    value={state.content}
    language="typescript"
    onMount={scriptModel.handleEditorDidMount}
    onChange={scriptModel.handleEditorChange}
    theme="custom-dark"
    options={{ automaticLayout: true }}
/>
```

After:

```tsx
<MonacoEditorHost
    initialValue={state.content}
    language="typescript"
    onMount={(hostView) => {
        scriptHostRef.current = hostView;
        scriptModel.handleEditorDidMount(hostView.getEditor());
    }}
    onChange={scriptModel.handleEditorChange}
    options={{ automaticLayout: true }}
/>
```

The editable script handler has the same signature cleanup:

```tsx
// Before: ScriptPanel.tsx:126-128
handleEditorChange = (value: string | undefined) => {
    this.changeContent(value || "");
};

// After
handleEditorChange = (value: string) => {
    this.changeContent(value);
};
```

### 4. Verify the conversion

- Confirm the five files no longer import `@monaco-editor/react`, and all five
  sites have no `theme` or `height` prop.
- Confirm the headers JSON site has only `initialValue`, while the other four
  sites call `setValue` from the correct state-derived effect.
- Verify request headers/body, response body/headers, and script panel
  conditional transitions dispose the host through `mountVanilla`; no
  `.monaco-editor` instance or host-owned model remains after unmount.
- Verify user edits still reach `vm.updateRequest` or `ScriptPanelModel`, while
  request changes, new responses, response-header changes, and script loads
  update the mounted text without an `onChange` echo.
- Verify request body and response language updates use host updates rather
  than editor recreation, and the response headers JSON remains read-only.
- Verify active-page geometry (`offsetHeight` and non-empty `.view-lines`),
  including the request split panels and script panel. An inactive page is not
  a valid geometry check.
- Do not add unit tests or a test harness. Do not touch
  `configure-monaco.ts`, the host implementation, unrelated state hooks, the
  dashboard, or the epic table.

## Concerns

1. **Conditional refs must be invalidated.** `mountVanilla` does dispose the
   host on React unmount, but a consumer ref can still point at the disposed
   view. Each sync effect must clear its ref when its JSX arm is absent before
   attempting a later `setValue`.

2. **Headers JSON is intentionally initial-only.** `headersJson` is local
   state seeded before the JSON arm mounts and then updated by the editor's own
   change handler. Adding an effect merely to write that same feedback value
   back is dead code and would obscure the distinction from the request body,
   whose `request.body` is externally replaced.

3. **Response formatted-body read-only semantics are existing-source
   semantics.** The path has no `onChange`, but `EDITOR_OPTIONS` does not set
   `readOnly`; only the headers JSON options object does. This task preserves
   the verified options and does not silently broaden scope by changing the
   formatted viewer's editability.

4. **Fresh options identity is not a lifecycle hazard.** The headers JSON
   spread creates a new object each render, but Monaco compares option values
   internally. No memoization or consumer-side workaround is needed.

5. **Toolbar/chrome scope.** The epic's Concern 4 references `PageToolbar`,
   while the current file renders `EditorToolbar`. This source discrepancy
   does not change the decision: the toolbar subtree is outside US-1057 and
   must remain untouched.

6. **No unrelated cleanup.** Do not refactor residual `useState`/`useEffect`
   usage, reorganize request/response state, or change splitter behavior. The
   only new effects are the content handoffs required by the uncontrolled host
   contract and the guards required by the existing conditional lifetimes.

## Acceptance Criteria

- [ ] `RequestBuilder.tsx`, `ResponseViewer.tsx`, and `ScriptPanel.tsx` use
  `MonacoEditorHost` at all five existing mount points.
- [ ] All five `theme="custom-dark"` literals are removed and no `height` prop
  is introduced. No host or consumer redesign is made.
- [ ] The request headers JSON host uses `initialValue={headersJson}` only.
- [ ] The request raw body host synchronizes `request.body` through
  `hostRef.current?.setValue` while raw and clears its ref when the raw arm is
  absent.
- [ ] The two response hosts synchronize `formattedBody` and `headersAsJson`
  respectively when their active conditional arms remain mounted, and clear
  stale refs when those arms disappear. The headers JSON host keeps
  `readOnly: true`.
- [ ] The script host synchronizes `state.content`, preserves
  `ScriptPanelModel.handleEditorDidMount`'s raw-editor behavior through
  `host.getEditor()`, and does not alter the toolbar.
- [ ] Consumer `onChange` callbacks accept the host's string value and retain
  their existing application-state write paths. No consumer implements a
  comparison, `executeEdits`, `setValue` read-only branch, or echo guard.
- [ ] Conditional switching and parent/page unmount dispose the host through
  `mountVanilla`; no Monaco widget/model is orphaned.
- [ ] `EDITOR_OPTIONS` and `BODY_EDITOR_OPTIONS` remain module-level constants,
  both retain `automaticLayout: true`, and fresh options identity at the
  response headers site is accepted without a workaround.
- [ ] Active-page geometry, user edits, external updates, language updates,
  read-only behavior, and disposal are manually verified. No unit tests are
  added.
- [ ] `configure-monaco.ts`, `MonacoEditorHostView.ts`,
  `MonacoEditorHost.tsx`, `MonacoBody.tsx`, the dashboard, and
  `EPIC-061.md` are unchanged. No commit is made by this task.

## Files Changed

| File | Planned change |
|---|---|
| `src/renderer/editors/rest-client/RequestBuilder.tsx` | Replace two wrapper sites; add the raw-body host ref and external-content sync; preserve conditional rendering and splitters. |
| `src/renderer/editors/rest-client/ResponseViewer.tsx` | Replace two wrapper sites; add independent guarded sync effects for formatted body and headers JSON; preserve response tabs/options. |
| `src/renderer/editors/text/ScriptPanel.tsx` | Replace the script mount; adapt the existing raw-editor mount handler through `host.getEditor()`; add guarded content sync; leave toolbar unchanged. |

### Files that require no changes

| File | Reason |
|---|---|
| `src/renderer/editors/shared/MonacoEditorHostView.ts` | US-1056 already established the required lifecycle, ownership, update, and `setValue` contract. |
| `src/renderer/editors/shared/MonacoEditorHost.tsx` | Existing React face is reused unchanged. |
| `src/renderer/editors/monaco/MonacoBody.tsx` | Pilot consumer is complete in US-1056 and is outside this task. |
| `src/renderer/uikit/shared/mount.tsx` | Existing adapter already disposes the view and removes its root on React unmount. |
| `src/renderer/editors/rest-client/RestClientShared.tsx` | Split-detail composition and splitter behavior are verified but not part of the mount seam. |
| `src/renderer/editors/rest-client/RestClientEditor.ts` | Existing request/response state ownership is the source being synchronized, not a conversion target. |
| `src/renderer/editors/base/EditorToolbar.tsx` | Script toolbar/chrome is explicitly out of scope. |
| `src/renderer/api/setup/configure-monaco.ts` | Loader/theme cleanup is deferred to US-1061. |
| `doc/active-work.md` and `doc/epics/EPIC-061.md` | The task entry already exists; user explicitly requested no dashboard or epic-table edit. |
| Test files or test harnesses | No unit tests or test harness are to be added for this conversion. |

# US-1058: Monaco host for MCP inspector

## Goal

Convert the three `mcp-inspector` `<Editor>` mount points from
`@monaco-editor/react` to the established `MonacoEditorHost` face from
US-1056, without changing the surrounding MCP inspector UI or its state model.
The editable tool-argument editor must continue to follow live argument and
loading-state changes; the two read-only result views must keep their current
mount-time content behavior.

This task is part of [EPIC-061](../../epics/EPIC-061.md), and is a consumer
conversion only. The host contract, `configure-monaco.ts`, dependency removal,
dashboard entry, and tests are outside this task.

## Background

### Host contract to use

US-1056 landed the contract in
`src/renderer/editors/shared/MonacoEditorHostView.ts` and its thin face at
`src/renderer/editors/shared/MonacoEditorHost.tsx`:

- `initialValue` is read only in `onMount()` when the host creates its first
  model (`MonacoEditorHostView.ts:37-52`). It is not a controlled value.
- `onMount` receives `MonacoEditorHostView`; a consumer calls
  `host.getEditor()` only when it needs the raw Monaco widget
  (`MonacoEditorHostView.ts:8-14,122-124`).
- `onChange` receives `(value: string) => void`. The host does not expose the
  wrapper's event object or `undefined` value (`MonacoEditorHostView.ts:155-164`).
- External content changes use `hostRef.current?.setValue(next)`. The host
  compares against the model, selects `editor.setValue` for read-only content
  or `executeEdits` plus `pushUndoStop` for editable content, and suppresses
  the resulting content callback (`MonacoEditorHostView.ts:98-120`). A
  consumer must not reproduce any of that policy.
- `onUpdate()` calls `editor.updateOptions(props.options ?? {})` on every host
  update and updates model language when it changes
  (`MonacoEditorHostView.ts:54-65`). This is what makes a live `readOnly` /
  `domReadOnly` change work when the host remains mounted.
- The host supplies `automaticLayout: true` when creating Monaco
  (`MonacoEditorHostView.ts:44-48`), and its root stylesheet supplies its own
  full-size flex geometry. Consumers pass no `theme` or `height` prop.

`src/renderer/editors/monaco/MonacoBody.tsx` is the landed consumer pattern
(also introduced by `git show bd5ad007`): it stores the host in a ref, receives
the host object in `handleMount`, and has a one-line content effect that calls
`setValue` (`MonacoBody.tsx:100-131`). Its raw-editor behavior is accessed
through `hostView.getEditor()`; this task has no MCP-specific raw-editor setup.

`src/renderer/uikit/shared/mount.tsx` confirms the lifecycle ordering needed by
the editable site: `mountVanilla` appends the view root and calls `view.mount()`
in a layout effect (`mount.tsx:26-38`), then forwards later props through
`view.update(props)` in a layout effect (`mount.tsx:77-84`). The consumer's
normal `useEffect` content sync therefore runs after a live options update.

### Verified per-site content lifetime

The answer to the task's central question is:

- **`ToolArgForm.tsx` — sync effect required.** The code editor's current
  `value` is `ArgField`'s `value` prop, supplied by
  `ToolArgForm.tsx:63` as `args[name] || ""`; `args` comes from
  `ToolsPanel.tsx:18,180` (`ts.toolArgs`). `McpInspectorEditorModel.setToolArg`
  replaces that record on every edit (`McpInspectorEditorModel.ts:386-390`),
  and argument state is also reset when a tool is selected
  (`McpInspectorEditorModel.ts:377-384`). The `ArgField` is keyed only by the
  argument name (`ToolArgForm.tsx:55-65`), so a same-named code field remains
  the same component instance while its `value` changes. The host therefore
  needs an effect keyed by that `value` which calls only `setValue`.
  `initialValue` still supplies the first value for a newly mounted field.

- **`ResourceContentView.tsx` — `initialValue` only.** The Monaco branch uses
  `content.text` (`ResourceContentView.tsx:91-106`). For static resources,
  `readResource()` explicitly clears `readContent` at
  `McpInspectorEditorModel.ts:572` before assigning the newly read object at
  `:580-587`. The static result gate is
  `ResourcesPanel.tsx:166` (`rs.readContent &&`), and
  `ResourcesPanel.tsx:175` passes `rs.readContent` to `ResourceContentView`.
  For templates,
  `readTemplateResource()` explicitly clears `templateReadContent` at
  `McpInspectorEditorModel.ts:531` before assigning the replacement at
  `:541-548`. The template result gate is
  `ResourcesPanel.tsx:233` (`rs.templateReadContent &&`), and
  `ResourcesPanel.tsx:242` passes `rs.templateReadContent` to
  `ResourceContentView`. In both cases the false
  gate unmounts the old view before the arriving result mounts a fresh one.
  The resource selection methods also clear both content slots
  (`McpInspectorEditorModel.ts:488-511`). This clear-before-read invariant is
  what makes `initialValue` sufficient; if either clear is removed while the
  gate stays true, add a `setValue` sync effect at the same time. A sync effect
  is dead code for the current state transitions.

- **`ToolResultView.tsx` — `initialValue` only.** The text branch's current
  value is `TextResult`'s `text` prop (`ToolResultView.tsx:81-98`), derived
  from `result.content`. The inner list is explicitly keyed by array index at
  `ToolResultView.tsx:41-42` (`key={i}`), so when a non-null result were
  replaced in place, React would reuse the same-position `ResultItem`,
  `TextResult`, and editor instance. The remount comes from elsewhere:
  `callTool()` sets `toolCallLoading = true` and `toolResult = null` together at
  `McpInspectorEditorModel.ts:420`; `ToolsPanel.tsx:241` gates the whole
  subtree on `ts.toolResult ?`, with `ToolsPanel.tsx:242` passing the result to
  `ToolResultView`. The null therefore selects the placeholder and unmounts the
  editor; the response/error assignment at `McpInspectorEditorModel.ts:427-445`
  mounts a fresh one. `selectTool()` and `loadTools()` also clear `toolResult`
  (`:366-371,377-384`). This clear-before-call invariant—not natural
  per-result keying—is what makes `initialValue` sufficient; if a later UX
  change keeps the previous result visible by removing the clear at `:420`, add
  a `setValue` sync effect at the same time. No sync effect is needed under the
  current model lifecycle.

This conclusion is about the actual current state transitions, not merely the
absence of a `key` prop. A future path that replaced a non-null result/content
in place would need to be reconsidered, but that is not part of this task.

### Editable `ToolArgForm` details

The only editable Monaco site is `ToolArgForm.tsx:151-170`. Its current
callback is:

```tsx
const handleEditorChange = useCallback(
    (v: string | undefined) => onChange(name, v || ""),
    [name, onChange],
);
```

The wrapper's callback accepted `string | undefined` plus an event. The host
callback is `(value: string) => void`, so the converted callback must be:

```tsx
const handleEditorChange = useCallback(
    (v: string) => onChange(name, v),
    [name, onChange],
);
```

The `undefined` handling and the `|| ""` fallback are dead after conversion.
The current source uses `||`, not `??`; no separate nullish-coalescing path is
present. Empty strings remain empty strings through the new callback.

The inline `options` object currently passes both `readOnly: disabled` and
`domReadOnly: disabled` (`ToolArgForm.tsx:156-169`). `disabled` is not derived
from the schema or the argument value: `ToolsPanel.tsx:178-183` passes
`ts.toolCallLoading`, and `McpInspectorEditorModel.callTool()` sets that state
to `true` before the request and back to `false` in both success and error
paths (`McpInspectorEditorModel.ts:420,427-445`). `selectedTool` and the
`ToolArgForm` remain rendered while loading, so this is a live option change
on a mounted host. Keep both options in the inline object; the host's
`onUpdate()` must apply them on every update.

### Resource branches and editor options

`ResourceContentView.tsx` also imports `MarkdownBlock` at line 6. Its markdown
branch (`:72-88`) is a surviving React call site and has its own scrollable
panel and link-click handling. Its blob branches (`:111-131`) render images or
binary metadata. They are independent of the non-markdown text branch at
`:91-107`; only that branch's `<Editor>` changes. Do not alter the markdown,
image, or binary branches.

`EDITOR_OPTIONS` is a module-level constant in both read-only consumers:

- `ResourceContentView.tsx:10-23`
- `ToolResultView.tsx:8-21`

Both constants already contain `automaticLayout: true`, as well as
`readOnly: true` and `domReadOnly: true`. Keep the constants and pass them as
the host's `options`; the explicit `automaticLayout` reinforces the host
default and does not require a new consumer mechanism. The host still owns
the default. There is no need to move either constant into the shared host.

### Geometry and parent layout

The three sites have resolvable height through their existing parents; none is
an unbounded Monaco root that should be given a new `height` prop. The host
stylesheet remains responsible for the root's `height: 100%`, `flex: 1 1
auto`, `min-height: 0`, `width: 100%`, and full-width Monaco child.

- **ToolArgForm:** the host is inside `Panel border rounded="md"
  overflow="hidden" height={height}` at `ToolArgForm.tsx:150`, where `height`
  is explicitly `120` for object/array fields and `80` for code-like fields
  (`:146-149`). It is a fixed-height panel, not a scroll container, and the
  host root can resolve `height: 100%` from it.
- **ResourceContentView:** the host branch is inside the inner
  `Panel flex={1} overflow="hidden" height={0}` at `:93-107`. Its parent in
  `ResourcesPanel.tsx` is the `Panel flex={1} overflowY="auto" height={0}` at
  `:166-176` or `:233-243`. That outer panel is the scroll container, while
  the flex chain supplies the available content height. The markdown and image
  branches also use scrollable panels, but they do not contain this host.
- **ToolResultView:** the result area is a flex column: the bottom result
  panel and its content panel in `ToolsPanel.tsx:197-250`, then
  `ToolResultView`'s `Panel flex={1} overflow="hidden"` at
  `ToolResultView.tsx:38-45`, then each text result's
  `Panel flex={1} minHeight={40} overflow="hidden"` at `:84-92`. There is no
  fixed-height or scroll-container wrapper at the Monaco site; flex allocation
  supplies the height. Verify this on an active page with host
  `offsetHeight` and non-empty `.view-lines`, because an inactive page measures
  `0×0` and presence alone cannot detect a collapsed editor.

## Implementation Plan

### 1. Convert `ToolArgForm.tsx` with live text and option synchronization

Modify only the Monaco branch in
`src/renderer/editors/mcp-inspector/ToolArgForm.tsx`:

1. Replace the `@monaco-editor/react` `Editor` import with
   `MonacoEditorHost` and the `MonacoEditorHostView` type from
   `../shared/MonacoEditorHost` and `../shared/MonacoEditorHostView`.
2. Add a host ref in `ArgField` and an `onMount` callback that stores the host
   object. There is no need to call `getEditor()` because this consumer has no
   raw-editor behavior.
3. Add a content effect keyed by the current `value` (and guarded for the code
   branch) that calls only `hostRef.current?.setValue(value)`. Clear the ref
   when the same keyed `ArgField` changes from a code field to a non-code field,
   so a disposed host cannot receive a later sync.
4. Change `handleEditorChange` to `(v: string) => onChange(name, v)` as shown
   above; do not preserve the wrapper's undefined/event signature.
5. Replace the JSX `<Editor>` with `<MonacoEditorHost>` using
   `initialValue={value}`, `language={lang}`, the host mount/change callbacks,
   and the existing inline options. Keep `automaticLayout`, all display
   options, `readOnly: disabled`, and `domReadOnly: disabled`.
6. Delete only `theme="custom-dark"`. Do not add `height` to the host; the
   existing parent `Panel height={height}` remains because it is the actual
   field geometry.

Before:

```tsx
<Editor
    value={value}
    language={lang}
    theme="custom-dark"
    onChange={handleEditorChange}
    options={{
        automaticLayout: true,
        // ...
        readOnly: disabled,
        domReadOnly: disabled,
    }}
/>
```

After:

```tsx
<MonacoEditorHost
    initialValue={value}
    language={lang}
    onMount={handleEditorMount}
    onChange={handleEditorChange}
    options={{
        automaticLayout: true,
        // ...
        readOnly: disabled,
        domReadOnly: disabled,
    }}
/>
```

The effect is the consumer handoff, not a second reconciliation policy:

```tsx
useEffect(() => {
    if (!isCodeEditor) {
        hostRef.current = null;
        return;
    }
    hostRef.current?.setValue(value);
}, [value, isCodeEditor]);
```

Do not compare values, select a write method, suppress callbacks, or manipulate
the Monaco model in `ToolArgForm.tsx`.

### 2. Convert the read-only resource text branch

Modify `src/renderer/editors/mcp-inspector/ResourceContentView.tsx` only at
the non-markdown `content.text` branch:

1. Replace the wrapper import with `MonacoEditorHost`.
2. Keep `mimeToLanguage`, `EDITOR_OPTIONS`, and the existing `language`
   calculation.
3. Render `initialValue={content.text}`, `language={language}`, and
   `options={EDITOR_OPTIONS}`.
4. Remove `theme="custom-dark"`; add neither `height` nor an external sync
   effect.
5. Leave the `MarkdownBlock` branch, its click handler, and both blob branches
   byte-for-byte behaviorally unchanged.

Before:

```tsx
<Editor
    value={content.text}
    language={language}
    theme="custom-dark"
    options={EDITOR_OPTIONS}
/>
```

After:

```tsx
<MonacoEditorHost
    initialValue={content.text}
    language={language}
    options={EDITOR_OPTIONS}
/>
```

The false-to-true conditional in `ResourcesPanel` remounts the view for every
new fetched content object, so adding `setValue` synchronization would add
dead consumer code and obscure the verified lifecycle.

### 3. Convert the read-only tool result text branch

Modify `src/renderer/editors/mcp-inspector/ToolResultView.tsx` only at
`TextResult`'s Monaco branch:

1. Replace the wrapper import with `MonacoEditorHost`.
2. Keep `detectLanguage`, its `useMemo`, `EDITOR_OPTIONS`, the result item
   mapping, image branch, resource metadata branch, and resource-link branch.
3. Render `initialValue={text}`, `language={language}`, and
   `options={EDITOR_OPTIONS}`.
4. Remove `theme="custom-dark"`; add neither `height` nor a sync effect.

Before:

```tsx
<Editor
    value={text}
    language={language}
    theme="custom-dark"
    options={EDITOR_OPTIONS}
/>
```

After:

```tsx
<MonacoEditorHost
    initialValue={text}
    language={language}
    options={EDITOR_OPTIONS}
/>
```

The `toolResult = null` transition in `callTool()` is the reason
`initialValue` is correct here. Do not add an effect merely because `text` is
spelled `value` in the old wrapper call.

### 4. Source and behavior verification for the implementation handoff

The implementing agent should verify the following without adding unit tests or
a test harness:

- `rg` shows no `@monaco-editor/react` import in the three changed consumers.
- Each converted host has `initialValue`, no `theme`, and no host `height` prop.
- `ToolArgForm`'s code fields update when an external `args[name]` value
  changes while the same argument-name key remains mounted.
- Starting a tool call sets `disabled` from `ts.toolCallLoading`, and the
  mounted host applies both `readOnly` and `domReadOnly` changes through
  `onUpdate`; finishing on success and error restores editability.
- User edits still call `onArgChange(name, value)` with a string, including an
  empty string, and do not create a second external-sync echo.
- Selecting or reading a resource unmounts the old resource content before the
  new content mounts; markdown, image, and binary branches remain unchanged.
- Calling a tool clears the old result before the new result mounts; images and
  non-text result branches remain unchanged.
- On an active MCP inspector page, check each host root's `offsetHeight` and a
  non-empty `.view-lines` collection. Check ToolArgForm at both its 80px and
  120px parent heights, and check the resource/result flex chains. Do not use
  an inactive page for geometry verification.
- No change is made to `configure-monaco.ts`, the package manifest, the
  dashboard, the epic table, unrelated hooks/state, or tests.

## Concerns

1. **Only one site needs external synchronization.** This is intentional and
   resolved from the state transitions above: `ToolArgForm` keeps mounted
   same-name fields while `args` changes; resource and tool result views clear
   their content slot and remount. If implementation discovers a new path that
   updates a non-null result in place, stop and re-check the lifecycle rather
   than adding broad effects to all three consumers.

2. **Live read-only ordering.** `disabled` is `ts.toolCallLoading`, which can
   change in the same render as an argument value. The host options update is
   forwarded by `mountVanilla`'s layout effect, while the consumer sync is a
   normal effect. Preserve this ordering so `setValue` sees the current
   read-only setting and let the host choose the write path.

3. **Conditional code-field host lifetime.** `ArgField` can change from a code
   schema to a scalar schema without changing its `key={name}`. The host ref
   must be cleared when the code branch disappears; otherwise a later value
   effect could call `setValue` on the disposed host. This is ref hygiene, not
   a second Monaco lifecycle implementation.

4. **Geometry is not presence.** Resource content is nested in an
   `overflowY="auto"` panel and ToolResult is nested in several flex panels;
   ToolArgForm uses an explicit 80/120px parent. Keep the host CSS untouched
   and verify actual dimensions on an active page. Do not add consumer
   `height` props to mask a geometry problem.

5. **Branch scope.** `ResourceContentView`'s `MarkdownBlock` import and its
   image/blob rendering are intentional surviving React paths. The task owns
   only its Monaco text branch. Likewise, ToolResultView's image/resource/link
   branches are not editor conversions.

6. **Do not widen EPIC-061 Concern 7.** Existing `useState`/`useEffect` and
   other MCP inspector state are not cleanup targets. Only imports, the three
   Monaco JSX seams, the editable callback/ref/effect, and the necessary host
   face wiring are in scope.

## Acceptance Criteria

- [ ] `ToolArgForm.tsx` renders `MonacoEditorHost` with
  `initialValue={value}`, the existing language/options, a host-object
  `onMount`, and a string-only `onChange`.
- [ ] `ToolArgForm.tsx` synchronizes mounted code fields through an effect that
  calls only `hostRef.current?.setValue(value)`, and clears the ref when the
  code branch is removed.
- [ ] `ToolArgForm.tsx` retains `readOnly: disabled` and `domReadOnly:
  disabled`; `disabled` remains sourced from `ts.toolCallLoading` through
  `ToolsPanel.tsx`.
- [ ] `ResourceContentView.tsx` converts only its non-markdown text `<Editor>`
  to `MonacoEditorHost` with mount-only `initialValue`; no sync effect is
  added.
- [ ] `ResourceContentView.tsx` retains `MarkdownBlock`, markdown link
  handling, image rendering, and binary-content rendering unchanged.
- [ ] `ToolResultView.tsx` converts only `TextResult`'s text `<Editor>` to
  `MonacoEditorHost` with mount-only `initialValue`; no sync effect is added.
- [ ] Both module-level `EDITOR_OPTIONS` constants remain usable as host
  options, including their existing `automaticLayout`, `readOnly`, and
  `domReadOnly` values.
- [ ] All three `theme="custom-dark"` literals are removed, and no `theme` or
  host `height` prop is introduced.
- [ ] The three files contain no `@monaco-editor/react` imports.
- [ ] Active-page geometry verification confirms non-zero host height and
  non-empty `.view-lines` for the fixed-height ToolArgForm site and both flex
  result/resource chains.
- [ ] No unit tests, `configure-monaco.ts` change, dependency removal,
  dashboard/epic edit, unrelated state cleanup, or commit is made for this
  task.

## Files Changed

| File | Planned change |
|---|---|
| `src/renderer/editors/mcp-inspector/ToolArgForm.tsx` | Replace the editable wrapper mount with `MonacoEditorHost`; add host ref, mount-only initial value, `setValue` sync for mounted code fields, live options preservation, and the string-only change callback. |
| `src/renderer/editors/mcp-inspector/ResourceContentView.tsx` | Replace only the non-markdown text `<Editor>` with the host face; retain mount-only content, language/options, MarkdownBlock, and blob branches. |
| `src/renderer/editors/mcp-inspector/ToolResultView.tsx` | Replace only `TextResult`'s read-only text `<Editor>` with the host face; retain remount-based content lifetime and all non-text branches. |

### Files that require no changes

| File | Reason |
|---|---|
| `src/renderer/editors/shared/MonacoEditorHostView.ts` | US-1056's host contract is established; do not redesign or move comparison, write-path, callback suppression, or options handling into consumers. |
| `src/renderer/editors/shared/MonacoEditorHost.tsx` | The existing thin React face already exposes the required host props and lifecycle. |
| `src/renderer/editors/shared/MonacoEditorHostView.css` | The host already owns full-size flex geometry and the single-editor full-width safeguard. |
| `src/renderer/editors/mcp-inspector/ToolsPanel.tsx` | Its existing conditional result mount and `disabled={ts.toolCallLoading}` wiring are the verified lifecycle/source; no JSX change is needed. |
| `src/renderer/editors/mcp-inspector/ResourcesPanel.tsx` | Its existing content-clearing conditionals establish resource remounts; no parent layout change is needed. |
| `src/renderer/editors/mcp-inspector/McpInspectorEditorModel.ts` | Its state transitions are investigation evidence, not part of this conversion. |
| `src/renderer/api/setup/configure-monaco.ts` | Loader/theme configuration remains until US-1061. |
| `doc/active-work.md` and `doc/epics/EPIC-061.md` | The user explicitly says the dashboard entry already exists and forbids dashboard/epic edits. |
| `package.json` and lockfiles | `@monaco-editor/react` remains installed until the EPIC-061 cleanup task. |
| Test files or test harnesses | The user explicitly forbids unit tests; this conversion uses source and manual geometry verification. |

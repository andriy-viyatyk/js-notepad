# US-1143 — Convert the Monaco body to a native view

**Epic:** [EPIC-071](../../epics/EPIC-071.md), E13-3 / task 2  
**Status:** Investigation and implementation plan only; no source implementation has been made.

## Goal

Convert `src/renderer/editors/monaco/MonacoBody.tsx` into a native `MonacoBodyView` extending
`VanillaView`, and make `src/renderer/editors/monaco/index.ts` pass its DOM root to
`TextChromeView`. The conversion must preserve Monaco editing, navigation, selection, rich paste,
find decorations, focus behavior, and the scripting queue while removing the `MonacoBody` React
root from the live `monaco` editor.

## Background

EPIC-071 §E13-3 records that the live session has four React roots: one `GlobalStyles` root and
three `MonacoBody` roots (`doc/epics/EPIC-071.md:141-177`). The `monaco` baseline captured by
US-1151 is one React root, 115 elements, two buttons, one SVG, `CANVAS` 3, `TEXTAREA` 1, and the
six markers `text-chrome-root`, `text-chrome-top`, `page-nav-panel`, `monaco-body`,
`text-chrome-footer`, and `text-toggle-script` (`doc/tasks/US-1151-e13-baseline/README.md`,
`monaco` section). The closing measurement must reproduce a visible `monaco` page and compare
against those structural checks.

The current native infrastructure already supplies both DOM twins required by this task:

- `createPanelElement` creates a `div`, applies the Panel attributes, and appends `Node` children
  (`src/renderer/uikit/Panel/panel-style.ts:303-357`). Its `{ name: "monaco-body", direction:
  "column", flex, position: "relative", overflow: "hidden" }` properties directly represent the
  complete JSX wrapper at `src/renderer/editors/monaco/MonacoBody.tsx:142-157`.
- `MonacoEditorHostView` owns the Monaco model/editor, mounts it into its stable root, updates
  language/options, exposes `setValue`, and invokes `onMount` after the editor exists
  (`src/renderer/editors/shared/MonacoEditorHostView.ts:23-67`, `:100-126`). Its `onChange` is
  called from the model-content listener (`:165-174`). The React `MonacoEditorHost` is only a
  `mountVanilla` adapter around that view (`src/renderer/editors/shared/MonacoEditorHost.ts:1-9`).
- `TextChromeViewProps.children` is `SlotContent` (`src/renderer/editors/base/TextChromeView.ts:18-24`),
  and `fillSlot` appends a `Node` directly without creating a React root (`src/renderer/uikit/shared/fill-slot.ts:83-153`).
  The native `MarkdownEditorView` and `HtmlEditorView` establish the intended create → claim →
  pass-root → mount pattern (`src/renderer/editors/markdown/index.ts:152-204`,
  `src/renderer/editors/html/index.ts:166-214`).

### Verified hook-to-lifecycle mapping

`MonacoBody.tsx` is 239 lines. The following maps every hook and callback to the native design.

| Current code | Verified behavior | Native replacement |
|---|---|---|
| `host?.state.use(...)` for `content`, `language`, and `encrypted` (`MonacoBody.tsx:25-35`) | It reads a host-owned slice and supplies initial content/language/read-only options to the host. `TextHostEditorModel.adoptHost()` can replace `_host` (`src/renderer/editors/base/TextHostEditorModel.ts:237-258`), and host extraction clears it (`:70-81`), so the state source can change identity. | Read the current host with `state.get()` during `onMount()`/host creation, then install one selector subscription registered with `own()` that calls a native `syncHost()` projection. Do not use `bind()` for this source: `bind()` has no early-release API and is intended for a state source that outlives the view (`src/renderer/uikit/shared/vanilla-view.ts:188-217`; `src/renderer/uikit/CLAUDE.md:487-512`). In `onUpdate()`, explicitly unsubscribe and rebind when the host identity changes, and dispose the host view when no host remains. |
| Fire-and-forget `model.typedQueue.use(...)` (`MonacoBody.tsx:37-54`) | Drains `revealLine`, `highlightText`, and `focus`, but ignores them if the editor is not mounted. | In `onMount()`, after the `MonacoEditorHostView` has mounted, call `typedQueue.subscribe(this.handleQueueEvent)` and register its returned unsubscribe with `own()`. The handler remains a live class method; it reads the current editor/decorations fields. On model replacement, explicitly unsubscribe the old queue and register the new model queue in `onUpdate()`; do not stack `own()`-only bindings across changing models. |
| Request/reply `model.typedQueue.useRequest(...)` (`MonacoBody.tsx:56-98`) | Answers selection/cursor queries and executes insert/replace edits; requests are queued until a handler is registered by `ComponentQueue` (`src/renderer/core/state/ComponentQueue.ts:64-99`). | Register `typedQueue.register(this.handleQueueRequest)` in `onMount()` after the Monaco host is ready, and register the returned unsubscribe with `own()`. Re-register on model identity change after releasing the old handler. Keep the current thrown `Monaco not mounted` behavior for an impossible request against a mounted body without an editor. |
| `handleMount` `useCallback` (`MonacoBody.tsx:100-116`) | Stores the editor/host, installs wheel zoom, selection state, rich paste, then autofocuses unless the sidebar owns focus. | `onMount()` constructs/appends/mounts the `MonacoEditorHostView`; its existing `onMount` prop invokes a native `onHostMount` method after `getEditor()` is valid. That method stores the fields and owns the three helper teardowns. Preserve the exact `if (!isFocusInSidebar()) ed.focus()` decision there (`MonacoBody.tsx:110-114`); this is US-808 and must not move before the host editor exists. If model/host identity changes, tear down and recreate the model-capturing selection/rich-paste resources in `onUpdate()`. |
| First `useEffect` (`MonacoBody.tsx:118-127`) | Teardowns helper listeners/actions and clears decorations/editor/host refs on React unmount. | `onDispose()` plus `own()` cleanup: release the current helper resources, clear the decoration collection, null DOM/view fields, and let `VanillaView` dispose the owned `MonacoEditorHostView`. `VanillaView.dispose()` is idempotent and disposes owned children before registered resources (`src/renderer/uikit/shared/vanilla-view.ts:83-126`). |
| Second `useEffect` (`MonacoBody.tsx:129-131`) | Pushes changed host content into Monaco through `hostRef.current?.setValue`. | The host selector subscription’s content arm calls `hostView.setValue(content)`; perform one immediate `syncHost()` after mounting/replacing the host so the initial snapshot is not missed. The current `MonacoEditorHostView.setValue` suppresses echoing the external write (`MonacoEditorHostView.ts:100-122`). |
| `handleChange` `useCallback` (`MonacoBody.tsx:133-138`) | Writes user edits to the current text host with `changeContent(value, true)`. | A native `handleChange(value)` class method passed in the host view props from `onMount()`/host creation. `MonacoEditorHostView` is its live caller through `onChange` at `:168-171`; guard the current host and preserve the `true` user-write flag. |
| `if (!host) return null` (`MonacoBody.tsx:140`) | React renders no Panel child when the content host is absent. | A native view must keep a stable root. Always create the `monaco-body` Panel root, but create/mount no `MonacoEditorHostView` and install no host/queue subscriptions when there is no host. `onUpdate()` must create the child if a host appears and tear it down if the host disappears; this is the native equivalent of the null branch without leaving an editor mounted. |

The three `useRef`s become view fields with live callers: `monacoRef` (`:19`) becomes the current
editor field read by both queue handlers and cleared by disposal; `hostRef` (`:20`) becomes the
current `MonacoEditorHostView` field used by content synchronization and host replacement;
`decorationsRef` (`:21`) becomes the collection field passed to `applyFindMatchDecorations` by the
`highlightText` handler and cleared on teardown. `cleanupsRef` (`:22`) becomes an owned resource
cleanup list used by `onHostMount()` and `onDispose()`/host replacement. There is no `useMemo`.
The two `useCallback`s become the live class methods described above: `onHostMount` is called by
`MonacoEditorHostView.onMount()` (`MonacoEditorHostView.ts:50-53`), and `handleChange` is called by
its model-content listener (`:168-171`). This explicitly names callers for every ported callback
and ref per EPIC-071 §E13-7 concern 1.

### Framework-free helper audit

All four bottom-of-file helpers are already imperative and framework-free except for the type on
`applyFindMatchDecorations`:

- `setupWheelZoom` (`MonacoBody.tsx:163-174`) attaches a capture-phase wheel listener, calls
  `api.zoom`, and returns its removal closure. Keep its behavior unchanged; call it from the native
  host-mount path and own its teardown.
- `setupSelectionListener` (`:176-190`) subscribes to Monaco cursor selection, derives
  `hasSelection`, and updates `MonacoEditor.state`. Keep it unchanged in substance; its native
  caller is `onHostMount()` and it must be recreated when the captured `MonacoEditor` model
  changes.
- `setupRichPaste` (`:192-218`) registers the `paste-as-rich` Monaco action and returns its
  disposal closure. Keep it unchanged in substance; call it from `onHostMount()` with the current
  `TextFileModel`, and recreate it on host identity changes because the async action closes over
  that host.
- `applyFindMatchDecorations` (`:220-238`) only reads Monaco and mutates a decoration collection.
  Replace `React.MutableRefObject<...>` with either the view’s small `{ current: ... }` holder or,
  preferably, a view method that passes/updates the class decoration field. Its live caller is the
  native `highlightText` queue handler; empty text clears the collection and non-empty text updates
  or creates it exactly as today.

## Implementation Plan

- [ ] Rename `src/renderer/editors/monaco/MonacoBody.tsx` to
  `src/renderer/editors/monaco/MonacoBodyView.ts` and replace the React function with a public
  `MonacoBodyView extends VanillaView<{ model: MonacoEditor }>`.
  - Construct the stable `monaco-body` root with `createPanelElement` using the exact current
    Panel props; append the owned `MonacoEditorHostView.root` only when a `TextFileModel` host is
    available, and mount each child exactly once.
  - Keep current host/editor/decorations/resource fields and implement `onMount()`, `onUpdate()`,
    and `onDispose()` according to the hook mapping above.
  - Build one host-state selector for `content`, `language`, and `encrypted`. Apply content with
    `setValue`, and apply language/read-only/drop options through `MonacoEditorHostView.update`.
    Because host identity can change, retain a manually replaceable unsubscribe and register the
    current cleanup with `own()`; never use a permanent `bind()` for this host source.
  - Install fire-and-forget and request queue handlers with `subscribe()` and `register()` after
    the host mount, own their current unsubscriptions, and replace them in `onUpdate()` when the
    model changes. Ensure queued commands drain only after `getEditor()` is available.
  - Preserve the seven queue operations exactly: `revealLine` centers and positions line 1 then
    focuses; `highlightText` applies find decorations; `focus` focuses; requests return selected
    text/cursor position and execute insert-at-cursor or replace-selection edits.
  - Preserve the exact US-808 sidebar focus guard in the host-mount callback.
- [ ] Update `src/renderer/editors/monaco/index.ts`.
  - Remove `createElement`/`react` and `EditorErrorBoundary` imports. The file has no other use of
    either after conversion; `TComponentState`, `MonacoEditor`, `TextChromeView`, `VanillaView`,
    and editor registry types remain needed (`:1-10`, `:50-60`).
  - In the `MonacoEditorView` constructor, create/claim `new MonacoBodyView({ model })`, pass
    `body.root` as `TextChromeView.children`, and mount body before chrome in `onMount()`.
  - In `onUpdate()`, update the body with the validated model and pass the same `body.root` to
    `chrome.update`. The two existing `children: createElement(...)` blocks are not two module
    entries: they are the constructor path (`:19-31`) and update path (`:37-47`) for the same
    `TextChromeView`; both must be converted.
- [ ] Leave `src/renderer/editors/shared/MonacoEditorHost.ts` unchanged. Its five remaining React
  consumer files (seven JSX call sites) are `mcp-inspector/ToolArgForm.tsx:11,166`, `mcp-inspector/ResourceContentView.tsx:8,101`,
  `mcp-inspector/ToolResultView.tsx:6,93`, `rest-client/RequestBuilder.tsx:22,382,567`, and
  `rest-client/ResponseViewer.tsx:17,369,394`. Therefore the React `MonacoEditorHost` face does
  **not** become a zero-caller collection in US-1143. `MonacoBody` itself has only the two
  construction/update references in `monaco/index.ts` (`rg` source scan), so its React face is the
  isolated removal.
- [ ] Verify the queue and script-facing compatibility after implementation by tracing, without
  adding tests or a test harness: `MonacoEditor` sends the operations through its typed wrappers
  (`src/renderer/editors/monaco/MonacoEditor.ts:6-15,70-105,131-138`); `TextEditorFacade` exposes
  `revealLine`, `setHighlightText`, `getSelectedText`, `getCursorPosition`, `insertText`, and
  `replaceSelection` (`src/renderer/scripting/api-wrapper/TextEditorFacade.ts:12-38`); `PageWrapper.asText`
  returns that facade (`src/renderer/scripting/api-wrapper/PageWrapper.ts:137-144`); and navigation
  routes `revealLine`/`highlightText` through `PageNavigator` (`src/renderer/api/pages/PageNavigator.ts:252-265`).
  Also preserve Monaco `focus`: `MonacoEditor.focus` sends it (`MonacoEditor.ts:70-72`), and
  `TextFileModel.focusEditor` reaches the main editor (`src/renderer/editors/text/TextEditorModel.ts:167-169`),
  used after encryption actions (`src/renderer/editors/text/TextFileEncryptionModel.ts:150-160`).
  `MonacoEditor.runScript` uses the selected-text request (`MonacoEditor.ts:108-126`), and the
  native text chrome invokes it from its run buttons (`src/renderer/editors/base/TextChromeView.ts:144-196`).

The complete caller ledger for the seven operations is:

- `TextEditorFacade` is the script-facing caller for the six exposed methods
  (`src/renderer/scripting/api-wrapper/TextEditorFacade.ts:12-38`), returned by `page.asText()`
  (`src/renderer/scripting/api-wrapper/PageWrapper.ts:137-144`). This covers reveal, highlight,
  selected text, cursor position, insert, and replace.
- Page navigation supplies `revealLine` and `highlightText` from an Explorer result
  (`src/renderer/editors/explorer/SearchSecondaryView.ts:22-31`), and dispatches them to the
  `TextFileModel`, which forwards to the main editor (`src/renderer/api/pages/PageNavigator.ts:252-265`,
  `src/renderer/editors/text/TextEditorModel.ts:171-179`). Restore replay also sends both directly
  through `MonacoEditor.typedQueue` (`src/renderer/editors/monaco/MonacoEditor.ts:131-138`).
- `focus` is sent by `MonacoEditor.focus` (`src/renderer/editors/monaco/MonacoEditor.ts:70-72`),
  reached by `TextFileModel.focusEditor` (`src/renderer/editors/text/TextEditorModel.ts:167-169`)
  after encryption actions (`src/renderer/editors/text/TextFileEncryptionModel.ts:150-160`).
- `MonacoEditor.runScript` awaits the selected-text request (`src/renderer/editors/monaco/MonacoEditor.ts:113-126`);
  its live chrome callers are the normal and “run all” buttons (`src/renderer/editors/base/TextChromeView.ts:144-196`).
- `TextFileActionsModel`’s `getSelectedText()` calls are a separate synchronous `TextFileModel`
  fallback, not the Monaco typed request (`src/renderer/editors/text/TextFileActionsModel.ts:56-70`);
  they remain unaffected. Notebook `NoteItemEditModel` has its own nested-editor selection path
  (`src/renderer/editors/notebook/note-editor/NoteItemEditModel.ts:293-299`) and is not a caller of
  this page body’s queue.
- [ ] Perform the documented manual structural verification only; do not propose or add unit tests
  or test harnesses. Confirm the visible `monaco` digest against the US-1151 baseline: React roots
  go **1 → 0**; `CANVAS` remains **3**; `TEXTAREA` remains **1**; and all six
  `data-name` markers (`text-chrome-root`, `text-chrome-top`, `page-nav-panel`, `monaco-body`,
  `text-chrome-footer`, `text-toggle-script`) remain present. Also confirm the body slot no longer
  needs the React-slot wrapper and that Monaco remains mounted and editable.

### Before → after code sketches

These are the exact structural edits the implementation should make; they are plan sketches, not
source changes made in this investigation.

```tsx
// Before: src/renderer/editors/monaco/index.ts:21-28 and :39-46
const chrome = new TextChromeView({
    model: props.model,
    children: createElement(
        EditorErrorBoundary,
        null,
        createElement(MonacoBody, { model }),
    ),
});
```

```ts
// After: native child ownership and a direct DOM slot
const body = new MonacoBodyView({ model });
const chrome = new TextChromeView({
    model: props.model,
    children: body.root,
});
this.body = this.child(body);
```

```tsx
// Before: src/renderer/editors/monaco/MonacoBody.tsx:27-35, 38-59, 118-131
const sliced = host?.state.use(selectHostSlice) ?? emptySlice;
model.typedQueue.use(handleEvent);
model.typedQueue.useRequest(handleRequest);
useEffect(() => hostRef.current?.setValue(sliced.content), [sliced.content]);
```

```ts
// After: stable fields, mount-time subscriptions, and explicit identity rebinding
protected onMount(): void {
    this.mountHostIfPresent();
    this.subscribeToCurrentHost(); // state.subscribe(...), cleanup registered with own()
    this.subscribeToCurrentQueue(); // typedQueue.subscribe/register, cleanup registered with own()
}

protected onUpdate(props: { model: MonacoEditor }): void {
    if (props.model !== this.model || props.model.contentHost !== this.host) {
        this.releaseCurrentHostAndSubscriptions();
        this.model = props.model;
        this.mountHostIfPresent();
        this.subscribeToCurrentHost();
        this.subscribeToCurrentQueue();
    } else {
        this.syncHost();
    }
}
```

```tsx
// Before: src/renderer/editors/monaco/MonacoBody.tsx:110-114
if (!isFocusInSidebar()) ed.focus();
```

```ts
// After: still the live MonacoEditorHostView onMount callback
private onHostMount(hostView: MonacoEditorHostView): void {
    this.editor = hostView.getEditor();
    // install setupWheelZoom/setupSelectionListener/setupRichPaste here
    if (!isFocusInSidebar()) this.editor.focus();
}
```

## Concerns

1. **Changing state-source identity.** `bind()` is tempting for the content/language/encrypted
   projection, but `host` is adopted/extracted during editor lifecycle. A permanent bind would keep
   the old host subscribed and allow stale content to write into the current editor. The plan uses a
   replaceable selector subscription, explicitly tears it down in `onUpdate()`, and registers final
   cleanup through `own()`.
2. **Queue timing and requests.** `ComponentQueue.send()` queues until `subscribe()` and
   `execute()` queues requests until `register()` (`src/renderer/core/state/ComponentQueue.ts:23-45,64-99`).
   Native `onMount()` must mount the Monaco host before registering both handlers, otherwise queued
   requests could observe a missing editor or fire-and-forget events could be discarded.
3. **Persistent-child hazard (§E13-7 concern 6 / E13-7.6).** React’s only conditional in
    `if (!host) return null` in `src/renderer/editors/monaco/MonacoBody.tsx`
    (`src/renderer/editors/monaco/MonacoBody.tsx:140`); there is no inactive tab/section
   branch inside this component. The native root remains stable, but the Monaco child must not be
   kept mounted when there is no host, and all host-specific subscriptions/actions must be released
   on that transition. `TextChromeView` has its own host branch (`TextChromeView.ts:344-418`), but
   that parent behavior is outside this task.
4. **Error boundary removal.** `EditorErrorBoundary` currently wraps the React body only in the
   two `monaco/index.ts` element constructions (`:2,23-27,41-45`). The requested native slot has no
   React boundary; the implementation must not silently recreate a React root or boundary in the
   body. **The native failure path is now stronger than the boundary it replaces, because US-1142
   built it:** `VanillaView.mount()` catches an `onMount()` throw, disposes the registered children
   and resources, skips `onDispose()` on the half-built view, and rethrows the original error
   (`src/renderer/uikit/shared/vanilla-view.ts:55-80`); `PageSlot.renderNative` and
   `AsyncEditorView` then roll back their own attachment. So removing the boundary here is not a
   loss of coverage — it is a move from a React-only render guard to a lifecycle-wide one. No
   separate error policy is needed for this task.
5. **DOM shape.** A direct Node slot removes the React compatibility wrapper and its
   `data-react-root`; this is expected and is the mechanism for the root reduction. The acceptance
   surface is therefore the baseline’s exact Monaco internals and six named markers, not a blind
   requirement that the total element count stay 115.
6. **Callback/ref regression class (§E13-7 concern 1).** Every former callback/ref has a live native
   caller named in Background. Implementation review must reject any helper or field that is only
   defined but not connected to the host mount callback, queue handlers, state subscription, or
   disposal path.

## Acceptance Criteria

- `MonacoBody.tsx` is replaced by a public `MonacoBodyView` native class in
  `src/renderer/editors/monaco/MonacoBodyView.ts`, with no React imports, JSX, hook-shaped queue
  calls, or `React.MutableRefObject` type.
- `src/renderer/editors/monaco/index.ts` imports neither React nor `EditorErrorBoundary`; both the
  constructor and update paths pass the native body root to `TextChromeView`, and `MonacoEditorView`
  still owns/mounts/updates the body and chrome in the correct order.
- The native body preserves content synchronization, language/read-only/drop options, user changes,
  wheel zoom, selection state, rich paste, find decorations, and the US-808
  `!isFocusInSidebar()` autofocus guard.
- The typed queue remains live for all seven operations: `revealLine`, `highlightText`, `focus`,
  `getSelectedText`, `getCursorPosition`, `insertText`, and `replaceSelection`. Script-facing
  `page.asText()` methods and navigation/run-script/encryption focus callers continue to reach the
  mounted Monaco editor; changing model/host identity does not leave stale subscriptions.
- The visible `monaco` DOM matches the US-1151 acceptance checks: `[data-react-root]` is **1 → 0**;
  `CANVAS` is **3**; `TEXTAREA` is **1**; and exactly the baseline markers
  `text-chrome-root`, `text-chrome-top`, `page-nav-panel`, `monaco-body`, `text-chrome-footer`, and
  `text-toggle-script` survive. The Monaco editor remains mounted and editable.
- No unit tests or test harnesses are added. `MonacoEditorHost.ts` remains because its verified
  `mcp-inspector` and `rest-client` callers are outside US-1143; no dashboard entry is added.

## Files Changed Summary

| File | Planned change |
|---|---|
| `doc/tasks/US-1143-monaco-body/README.md` | This investigation and implementation plan. |
| `src/renderer/editors/monaco/MonacoBody.tsx` | Rename/replace with native implementation; planned, not changed during investigation. |
| `src/renderer/editors/monaco/MonacoBodyView.ts` | New native `VanillaView` implementation resulting from the rename. |
| `src/renderer/editors/monaco/index.ts` | Replace both React slot constructions with the native body root. |

Files that need **no** changes: `src/renderer/editors/shared/MonacoEditorHost.ts`,
`src/renderer/editors/shared/MonacoEditorHostView.ts`,
`src/renderer/uikit/Panel/panel-style.ts`, `src/renderer/editors/base/TextChromeView.ts`,
`src/renderer/core/state/ComponentQueue.ts`, `src/renderer/scripting/api-wrapper/TextEditorFacade.ts`,
`src/renderer/api/types/text-editor.d.ts`, and the callers listed above. No tests or test harnesses
are part of this task.

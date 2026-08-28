# US-1169 — Convert the `rest-client` editor body to native views

## Goal

Convert the five React editor-body files under `src/renderer/editors/rest-client/` to native
`VanillaView` classes and delete their `.tsx` faces. The Rest Client must retain request editing,
menus, body modes, Monaco hosts, request-tree integration, sending, response viewing, and the
resizable request/response split while adding no React root in the visible Rest Client page editor.

This is task US-1169 of EPIC-073, E15-5. The task closes the Rest Client portion of E15-1: the
editor directory must contain no `.tsx` files and the editor module must have no `createElement`
path, while the feature remains demonstrably usable (EPIC-073:14-35, 176-210).

## Background

### Epic constraints and reviewed references

EPIC-073 measures Rest Client at 130 JSX markers across five files and 1,644 lines; it is the
largest E15 body after graph and renders eight distinct UIKit faces. Its three concerns are live:
C1 requires explicit teardown, C1a requires ownership-aware disposal for shared entries, and C9a
requires presence verification in addition to removal checks. C12 permits type-only imports from
surviving UIKit `.tsx` faces; C13 excludes the `React.*` type surface; C14 excludes
`PopoverView.tsx`/`DialogView.tsx` and their shared cleanup code (EPIC-073:14-35, 176-210,
214-261).

US-1166 and US-1168 are the reviewed implementation references. Carry forward their settled
decisions: native views bind state once from `onMount()`, `createComponentModelDriver` is used
only for effect-free component models, effect-bearing models are restructured, exact dependency
arrays become `createDepsGate()` arrays, conditional branches use `SubtreeSwap`, keyed rows use
`KeyedList` with removal disposal, and the editor index builds/attaches children in `onMount()`
with body first and chrome last (US-1166 README:343-399; US-1168 README:399-418).

The references also establish that `bind()`/`listen()` cleanup is registered through `own()` and
has no early-release operation, so subscriptions and listeners must be installed once rather than
from a repeatedly-called sync method (US-1166 README:431-439; `src/renderer/uikit/shared/vanilla-view.ts:202-230`).
`RenderEditorView` replaces the async editor when `model.id` changes, while the same native view
receives updates otherwise (`src/renderer/ui/app/RenderEditorView.ts:22-47`); this view therefore
throws when it receives a different model instance instead of rebuilding children.

The references’ verification records passed `npm run typecheck`, `npm run lint`, and
`npm run build-prod`, but left keyboard-dependent editing, write-back, some late-host paths, and
several manual branches explicitly unverified (US-1166 README:510-580; US-1168 README:533-588).
This document preserves that honesty for Rest Client: implementation and live behavior are not
verified in this planning thread.

### Verified current scope

The five conversion targets are:

| File | Verified lines | Current React constructs |
|---|---:|---|
| `src/renderer/editors/rest-client/RestClientBody.tsx` | 59 | `Panel`, `Text`, `SplitDetailPanel`, `EditorError`, `state.use`, `queue.use` (`:1-59`) |
| `src/renderer/editors/rest-client/KeyValueEditor.tsx` | 158 | `Panel`, `Textarea`, `Checkbox`, `Autocomplete`, `IconButton`, local `KeyValueRow`, `items.map` (`:1-158`) |
| `src/renderer/editors/rest-client/RestClientShared.tsx` | 327 | `SplitDetailPanel`, `Panel`, `Text`, `Textarea`, `Spacer`, `IconButton`, `WithMenu`, `Splitter`, `RequestBuilder`, `ResponseViewer` (`:1-327`) |
| `src/renderer/editors/rest-client/ResponseViewer.tsx` | 410 | `TComponentModel`, `Panel`, `Text`, `Button`, `IconButton`, `SegmentedControl`, `Spacer`, `WithMenu`, `MonacoEditorHost`, binary `<img>`, response-header map (`:1-410`) |
| `src/renderer/editors/rest-client/RequestBuilder.tsx` | 690 | `TComponentModel`, `Panel`, `Text`, `Button`, `IconButton`, `SegmentedControl`, `Spacer`, `Splitter`, `Textarea`, `WithMenu`, `Checkbox`, `Autocomplete`, `MonacoEditorHost`, local `BodyContent` and `FormDataEditor` (`:1-690`) |

The files currently have only local React consumers: `index.ts` imports `RestClientBody`, while
`RestClientShared.tsx` is imported by the already-native `RestPanelSecondaryView` and
`RestRequestTreeView` for `buildGroupedTree`, `RequestTreeItem`, `getRequestTreeChildren`, and
traits (`src/renderer/editors/rest-client/index.ts:1-57`,
`src/renderer/editors/rest-client/panels/RestPanelSecondaryView.ts:8-12`,
`src/renderer/editors/rest-client/panels/RestRequestTreeView.ts:11-18`). The two native panels do
not render any of the five `.tsx` faces; after the shared module is converted, their extensionless
imports must still resolve and their native tree behavior must remain unchanged.

### Existing model and behavior seams

`RestClientEditor` owns the persistent host-backed data, selected request, response cache, CRUD
operations, and request execution. `selectedRequest` is derived from `data.requests` and
`selectedRequestId` (`RestClientEditor.ts:301-317`); request updates, body-type/language changes,
header/form-data CRUD, and paste behavior are existing editor methods (`RestClientEditor.ts:319-644`).
Sending builds the request, calls `nodeFetch`, stores status/headers/body, and writes an error
response with `errMessage` (`RestClientEditor.ts:648-771`). The conversion must call those methods,
not move behavior into a new model.

The public shared state surface contains response, response time, executing, and invalid-header
flags (`restClientTypes.ts:71-85`). The body additionally needs data, parse error, and selected ID,
which should remain a private body projection rather than changing the expected no-change type
file. `RestClientEditor.loadData()` sets parse failures in `state.error` (`RestClientEditor.ts:245-297`),
so the old `EditorError` wrapper is not recreated: framework failures go through
`AsyncEditorView`/`NativeEditorErrorView`, while this data error needs a small native warning
branch using existing panel/text primitives.

`RequestBuilderModel` has setters only and registers no `effect()` (`RequestBuilder.tsx:52-76`),
so its driver can own it. `ResponseViewerModel.init()` registers an effect that clears the
language override on response changes (`ResponseViewer.tsx:96-128`), so it cannot be mounted by
`createComponentModelDriver` unchanged: the effect must move to a view-owned gate over exactly
`[response]`. The driver can then own the effect-free model.

`MonacoEditorHostView` creates its Monaco model/editor in `onMount()`, exposes `setValue()` and
`update()`, and disposes its owned model/subscriptions (`src/renderer/editors/shared/MonacoEditorHostView.ts:23-67`,
`:100-153`). A native body or response branch must append the host root before mounting it and
must set its host field from `onMount()`; a later value sync must guard that the host is ready.

`Panel`/`Text` native builders already import their static CSS (`src/renderer/uikit/Panel/panel-style.ts:1-3`,
`src/renderer/uikit/Text/text-style.ts:1-3`). Other native controls expose the required view
classes, including `ButtonView`, `IconButtonView`, `TextareaView`, `CheckboxView`,
`AutocompleteView`, `SegmentedControlView`, `SpacerView`, and `SplitterView` (for example
`src/renderer/uikit/SegmentedControl/SegmentedControlView.ts:10-45` and
`src/renderer/uikit/Splitter/SplitterView.ts:11-39`). Import the static CSS needed by native
controls from the native owner; do not edit any UIKit `.tsx` face.

### Native menu and overlay seam

`WithMenu` manages a `MenuHandle`, opens with default placement `bottom-start`, updates items,
disposes when closed, and disposes again on unmount (`src/renderer/uikit/Menu/WithMenu.tsx:6-66`).
The native replacement is `openMenu(anchor, options)` (`src/renderer/uikit/Menu/attach-menu.ts:5-76`).
Every converted menu site must hold its own `MenuHandle`, dispose an existing handle before
opening, set the field to `undefined` in `onClose`, and dispose any held handle in `onDispose`,
following `BrowserView.ts:356-357`.

`PopoverView.tsx` and `DialogView.tsx` are explicitly outside this task. No native plan may edit
them, `TextChromeView.updateSlots`, `uikit/shared/slots.ts`, or `uikit/shared/fill-slot.ts`.

## Implementation Plan

### Native file layout

Add native view modules beside the five deleted faces:

| New native module | Responsibility |
|---|---|
| `src/renderer/editors/rest-client/RestClientBodyView.ts` | Body projection, parse-error/empty/detail branches, and ownership of the selected detail view. |
| `src/renderer/editors/rest-client/KeyValueEditorView.ts` | Key/value editor and keyed `KeyValueRowView` rows. |
| `src/renderer/editors/rest-client/RestClientShared.ts` | The existing pure tree helpers plus `RestDetailView`, the native replacement for `SplitDetailPanel`. |
| `src/renderer/editors/rest-client/ResponseViewerView.ts` | Response tabs, headers/body branches, binary actions, response Monaco hosts, and response-view model driver. |
| `src/renderer/editors/rest-client/RequestBuilderView.ts` | Request controls, headers/body split, body-mode branches, form-data rows, request Monaco hosts, and request-builder model driver. |

The `.tsx` names are deleted only after all imports are repointed and the new modules typecheck.
The shared module keeps its basename so the already-native secondary panel imports continue to
resolve without a source change. The native classes are deliberately `*View`-named so the old
React faces cannot be accidentally reintroduced.

### 1. `RestClientBody.tsx` → `RestClientBodyView.ts`

#### Construct mapping

| Current React construct | Native construct | Why |
|---|---|---|
| `RestClientBody({ model: editor })` (`RestClientBody.tsx:6-10`) | `RestClientBodyView extends VanillaView<{ model: RestClientEditor }>` | Owns the body root, state projection, branch swap, queue subscription, and child detail lifecycle. |
| `editor.state.use((s) => ({ data, error, selectedRequestId, executing, response, responseTime, headersJsonInvalid }))` (`RestClientBody.tsx:11-19`) | One `bind(editor.state, selectBodyProjection, sync)` installed from `onMount()` | Replaces the hook with one stable subscription and gives the existing children a precise projection. |
| `editor.queue.use(...)` no-op focus handler (`RestClientBody.tsx:21-26`) | `editor.typedQueue.subscribe(() => undefined)` installed once from `onMount()` and released through `own()` | Preserves the intentional queue drain/no-op without a React hook; `ComponentQueue.subscribe` drains queued events (`src/renderer/core/state/ComponentQueue.ts:23-45`). |
| `if (state.error) return <EditorError>` (`RestClientBody.tsx:28`) | Local `RestClientErrorView` using `createPanelElement` and `createTextElement(..., { color: "warning", preWrap: true })` | The parse error is editor state, not a thrown native lifecycle failure. Preserve its warning text without importing `EditorError`; thrown construction/mount/update failures still reach `NativeEditorErrorView` through `AsyncEditorView` (`src/renderer/ui/app/AsyncEditorView.ts:99-164`). |
| Root `<Panel name="rest-client-root" ...>` (`RestClientBody.tsx:32-39`) | `createPanelElement({ name: "rest-client-root", direction: "column", flex: 1, height: 0, overflow: "hidden" })` | Keeps the exact root layout and uses the canonical native panel builder (`src/renderer/uikit/Panel/panel-style.ts:349-356`). |
| `selectedRequest ? <SplitDetailPanel> : <Panel><Text>...` (`RestClientBody.tsx:40-56`) | `SubtreeSwap<"error" | "detail" | "empty">` over a display-contents branch host | Conditional output has one explicit owner; changing selection/error disposes and detaches the outgoing view. `RestDetailView` is mounted only for a selected request; `RestEmptyView` updates its two existing messages from the data count. |
| `SplitDetailPanel` child (`RestClientBody.tsx:41`) | `RestDetailView` from the converted shared module | No existing native twin was found. This local native class is the minimal replacement and does not introduce a UIKit primitive. |

Define a private body projection with the eight fields currently read by the function, plus a
`selectBodyProjection()` selector. In `sync()`, select `editor.selectedRequest` from the existing
editor getter, choose the error/detail/empty key, update the active branch when its key is stable,
or call `SubtreeSwap.set()` and mount the newly created detached view. Clear the active references
when changing away from detail. Do not dispose `RestClientEditor`, its queue, or any object obtained
from the shared panels; this view only owns its own `RestDetailView`/empty/error branch.

Before:

```tsx
return state.error ? <EditorError>{state.error}</EditorError> : (
    <Panel name="rest-client-root" direction="column" flex={1} height={0} overflow="hidden">
        {selectedRequest ? <SplitDetailPanel vm={editor} request={selectedRequest} state={state} /> : ...}
    </Panel>
);
```

After:

```ts
this.bind(this.model.state, selectBodyProjection, this.sync);

private sync = (projection: RestClientBodyProjection): void => {
    const request = this.model.selectedRequest;
    const key = projection.error ? "error" : request ? "detail" : "empty";
    // Keep the existing branch and update it; otherwise SubtreeSwap owns the outgoing branch.
    this.swap.set(key, () => this.createBranch(key, projection, request));
    this.activeBranch?.mount();
};
```

The implementation snippet is schematic: it must assign the created branch exactly once and avoid
calling `mount()` on an already-mounted branch. `onUpdate()` must throw if `props.model` is not the
constructor model; it must not rebuild the swap.

### 2. `KeyValueEditor.tsx` → `KeyValueEditorView.ts`

#### Construct mapping

| Current React construct | Native construct | Why |
|---|---|---|
| `KeyValueEditor` function and outer `<Panel name="kv-editor">` (`KeyValueEditor.tsx:11-47`) | `KeyValueEditorView extends VanillaView<KeyValueEditorProps>` with a `createPanelElement` root | Owns the keyed row reconciler and its row resources. |
| `items.map(... key={index})` (`KeyValueEditor.tsx:30-45`) | `KeyedList<RestHeader, number, HTMLDivElement>` keyed by index | Preserves the existing index keys and stable focused controls while values change. |
| Local `KeyValueRow` function (`KeyValueEditor.tsx:50-72`) | `KeyValueRowView extends VanillaView<KeyValueRowProps>` | The row owns its Checkbox, key editor, value editor, delete control, and conditional branches. |
| Row `<Panel ... dimmed={!item.enabled}>` (`KeyValueEditor.tsx:92-100`) | `createPanelElement` plus `applyPanelAttributes` on row update | Retains the exact panel layout and dimming without a React element. |
| `<Checkbox checked ...>` (`KeyValueEditor.tsx:101-103`) | `CheckboxView` child | Native controlled checkbox; row updates it with the current item. |
| `keyOptions ? <Autocomplete> : <Textarea>` (`KeyValueEditor.tsx:110-132`) | Row-owned `SubtreeSwap<"autocomplete" | "textarea">` | Replaces the conditional editor and disposes the outgoing control if the mode changes. |
| Value `<Textarea>` (`KeyValueEditor.tsx:134-144`) | `TextareaView` child | Keeps the controlled string callback contract. |
| `isLast && isEmpty ? <Panel width={24}> : <IconButton>` (`KeyValueEditor.tsx:145-155`) | Row-owned `SubtreeSwap<"spacer" | "delete">`; use a small local `StaticPanelView` for the spacer and `IconButtonView` for delete | Preserves the add-row affordance and makes the conditional control’s teardown explicit. |
| `useCallback` row handlers (`KeyValueEditor.tsx:75-90`) | Stable row arrow handlers reading `this.props.index`/current props | Native updates replace props; no callback dependency arrays or listener churn are needed. |

The editor owns the `KeyedList` and registers `list.dispose()` once through `own()`. Its
`create` callback constructs and mounts a detached `KeyValueRowView`; its `update` callback calls
`row.update(...)`; its `remove` callback looks up the row view, calls `dispose()`, deletes the map
entry, and lets `KeyedList` detach the root. Do not call `child()` for rows that the `KeyedList`
itself owns; this avoids two owners for a keyed resource. Empty-last-row behavior remains in the
existing `RestClientEditor.updateHeader`/`ensureEmptyLastHeader` and `updateFormData` methods
(`RestClientEditor.ts:501-538`, `:542-578`).

The row’s Checkbox, key editor, value editor, and delete button are child-owned. All event handlers
must call the props supplied by the parent (`onUpdate`, `onDelete`, `onToggle`) with the same index
and partial values as the React face. No keyed row received from a map or registry exists here, so
C1a does not permit transferring or disposing any external resource.

### 3. `RestClientShared.tsx` → `RestClientShared.ts` and native `RestDetailView`

#### Shared-module construct mapping

| Current React construct | Native construct | Why |
|---|---|---|
| React import and `RequestBuilder`/`ResponseViewer` imports (`RestClientShared.tsx:1-18`) | No React import; type/value imports of `RequestBuilderView` and `ResponseViewerView` | Keeps pure tree helpers and the native detail composition in a framework-free module. |
| `RequestTreeItem`, traits, `buildGroupedTree`, `getRequestTreeChildren`, `getStatusColor` (`RestClientShared.tsx:21-70`) | Same exported types/functions in `.ts` | These are already consumed by native panels; behavior and exports stay unchanged. |
| `SplitDetailPanel` function (`RestClientShared.tsx:72-80`) | `RestDetailView extends VanillaView<RestDetailProps>` | No native twin exists; a local view is the minimal structure needed for the request/response split. |
| `useRef(detailRef/responsePaneRef)` (`RestClientShared.tsx:81-83`) | `detailRoot` and `responsePane` fields | Native roots are available directly and remain stable. |
| `useState(resultHeight)` (`RestClientShared.tsx:83`) | Plain `resultHeight: number | null` field | The value is local layout state, not editor model state. |
| `useLayoutEffect(..., [resultHeight])` (`RestClientShared.tsx:85-92`) | One `createDepsGate()` over exactly `[resultHeight]`; schedule a guarded measurement when the value is null | Preserve first-layout pinning without a hook, but never pin a detached or zero-height pane. The measurement callback must require `this.root.isConnected` and `responsePane.offsetHeight > 0`; otherwise it schedules the next animation frame. Store the pending frame id in a field and cancel it through one `own()` cleanup. |
| `useCallback` clamp/toggle/double-click handlers (`RestClientShared.tsx:94-150`) | Stable view methods/arrow handlers | They read the current root dimensions and update the existing splitter/child views. |
| `useMemo(copyMenuItems, [request])` (`RestClientShared.tsx:152-181`) | `copyMenuItems(request)` method returning fresh `MenuItem[]` | Dynamic imports and request capture remain the same; menu item nodes are not retained across opens. |
| Outer/request/response `<Panel>` tree (`RestClientShared.tsx:183-325`) | `createPanelElement` tree held in fields | Keeps `rest-detail`, `request-pane`, `response-pane`, headers, bodies, and overflow/flex props exactly. |
| Request `<Textarea>` collection/name (`RestClientShared.tsx:211-234`) | Two `TextareaView` children | Controlled string updates continue to call `updateRequestCollection`/`renameRequest`. |
| Request copy `<WithMenu>` + `IconButton` (`RestClientShared.tsx:235-248`) | `IconButtonView` plus `copyMenu: MenuHandle` via `openMenu` | Replaces the render-prop menu with the required caller-owned native handle. |
| Delete `IconButton` and async confirmation (`RestClientShared.tsx:249-255`) | `IconButtonView` with stable async handler | Preserves `app.ui.confirm` and `deleteRequest`; no React callback is needed. |
| `<Splitter>` (`RestClientShared.tsx:268-275`) | `SplitterView` | Uses the existing native drag implementation and exact horizontal/after/before-border props. |
| Response metadata fragment (`RestClientShared.tsx:299-309`) | A small `ResponseMetaView` (or equivalent native branch view) under `SubtreeSwap<"none" | "response">` | Keeps the conditional status/time/size branch explicitly owned; update its text and status color in place. |

`RestDetailView` constructs and owns one `RequestBuilderView`, one `ResponseViewerView`, the
collection/name fields, delete/copy controls, splitter, and response metadata. Append the complete
root hierarchy before mounting child views. The request pane uses `{ flex: "7 1 0" }` and response
pane `{ flex: "3 1 0" }` until the first measured response height; afterwards apply
`{ flex: "1 1 auto" }` to the request pane and `{ flex: "0 0 auto", height, shrink: false }` to
the response pane. Clamp drag values to 10–90% of `detailRoot.clientHeight`, and preserve the
0.3/0.7 double-click toggles from `RestClientShared.tsx:101-122`.

The detail view updates both child views from the supplied `RestClientViewState` and request. It
must not recreate either child when the request identity is unchanged. If the parent changes the
request, update the existing controls/children with the new request props; the body itself owns
the detail branch identity.

#### MenuHandle sites in this file

`copyMenu` is a field on `RestDetailView`. The copy button handler must dispose a held handle before
calling `openMenu(button.root, { items: this.copyMenuItems(this.props.request), onClose: () => {
this.copyMenu = undefined; } })`; use the same default placement/offset as `WithMenu` unless the
source supplies one. The handle is updated from `sync()` while open so the latest request is
captured. `onDispose()` disposes the held handle and clears the field. The handle owns only the
menu it opened; it must not dispose the button or any panel child.

### 4. `ResponseViewer.tsx` → `ResponseViewerView.ts`

#### Component-model decision and construct mapping

`ResponseViewerModel` is an effect-bearing model today: `init()` calls `this.effect()` with
`[this.props.response]` (`ResponseViewer.tsx:108-127`). `createComponentModelDriver.mount()` rejects
such a model (`src/renderer/core/state/model.ts:278-310`). Move the response-reset behavior out of
`init()` and into `ResponseViewerView`’s `responseResetGate`, then drive the now effect-free model
with `createComponentModelDriver` and dispose that driver once through `own()`.

| Current React construct | Native construct | Why |
|---|---|---|
| `ResponseViewerModel` plus `useComponentModel` (`ResponseViewer.tsx:96-133`) | Effect-free `ResponseViewerModel` + `createComponentModelDriver` | The model retains active tab/language/header-view state; the only effect is re-expressed by the view. |
| `init` effect clearing language override (`ResponseViewer.tsx:121-127`) | Effect-free model plus `responseResetGate.changed([props.response])`, exact trigger `[props.response]`, then a live-guarded `queueMicrotask` calling `model.setLanguageOverride(null)` | Preserves all three behaviors of the old effect: response identity is the trigger, the reset remains deferred until after the current commit, and the liveness guard prevents a post-teardown reset. Register the view-owned live flag cleanup through `own()`. |
| `useMemo(headersAsJson, [response])`, language detection, formatted body, body size (`ResponseViewer.tsx:135-180`) | Pure `headersAsJson(response)`, `detectLanguageFromHeaders`, `formatBody`, and `formatSize` calls during central sync | These are derived values; no memo hook is needed when the parent pushes a state projection. |
| Two host refs (`ResponseViewer.tsx:153-154`) | `formattedBodyHost` and `headersJsonHost` fields | Native host instances are stored directly and cleared when their owned branch is released. |
| Body host `useEffect` deps `[activeTab, executing, formattedBody, response]` (`ResponseViewer.tsx:156-163`) | `bodyValueGate` over exactly `[activeTab, executing, formattedBody, response]` | Calls `setValue` only for a live body Monaco host when the former effect would run. |
| Header JSON host `useEffect` deps `[activeTab, executing, headersAsJson, headersView, response]` (`ResponseViewer.tsx:165-172`) | `headersValueGate` over exactly `[activeTab, executing, headersAsJson, headersView, response]` | Preserves the second effect’s full dependency array and guard. |
| `useCallback` binary/open/copy handlers (`ResponseViewer.tsx:182-232`) | Stable view methods | Keeps `app.fs`, `pagesModel`, clipboard, and dynamic behavior unchanged. |
| `if (executing)`, `if (!response)`, normal response return (`ResponseViewer.tsx:236-404`) | Outer `SubtreeSwap<"executing" | "empty" | "response">` | Makes the three top-level branches explicitly disposable. |
| Active body/headers tab and headers table/JSON branches (`ResponseViewer.tsx:277-400`) | Nested `SubtreeSwap` instances for tab body, body binary/text, and header table/JSON | Reuses mounted controls/hosts only within the same branch and disposes outgoing Monaco/keyed-list resources. |
| Body `<MonacoEditorHost>` (`ResponseViewer.tsx:369-375`) | `MonacoEditorHostView` attached before mount, with `onMount` field assignment | Keeps the response body in Monaco and permits gated `setValue`/language updates. |
| Header JSON `<MonacoEditorHost readOnly>` (`ResponseViewer.tsx:394-400`) | `MonacoEditorHostView` with `readOnly: true` and the same attach-before-mount order | Retains the read-only JSON representation. |
| Response header `map(... key={i})` (`ResponseViewer.tsx:377-392`) | `KeyedList<RestHeader, number, HTMLDivElement>` keyed by index, with a row view/element map | Preserves stable rows and detaches/disposes each removed row in `remove`; no shared response entry is disposed. |
| Binary `<img>` and action buttons (`ResponseViewer.tsx:337-367`) | Native `HTMLImageElement`, `ButtonView`s, and a binary branch view | Keeps image preview, Save to File, and Image Viewer behavior without JSX. Own and revoke the preview blob URL when replaced/disposed. |

Build the response header controls once and update their `SegmentedControlView`, `SpacerView`,
`IconButtonView`, and menu trigger from the current projection. Use fresh file-icon elements when
creating/updating menu item arrays, because `MenuView` appends item icon Nodes directly and the old
face explicitly rebuilt them on every render (`ResponseViewer.tsx:211-218`).

#### MenuHandle site in this file

Store the response language menu as `languageMenu: MenuHandle | undefined`. The language button
opens it with `openMenu(languageButton.root, { items: languageMenuItems(language), onClose: () => {
this.languageMenu = undefined; } })`; dispose the existing handle before each open, update it from
central sync while held, and dispose it in `onDispose()`. The close callback only clears the field;
the handle’s own `dispose()` owns the overlay. Do not use `offsetParent` when later verifying this
menu; fixed overlays must be checked with `getBoundingClientRect()`.

### 5. `RequestBuilder.tsx` → `RequestBuilderView.ts`

#### Component-model decision and construct mapping

`RequestBuilderModel` only stores `bodyHeight`, `headersView`, and `headersJson` through setters and
does not call `effect()` (`RequestBuilder.tsx:52-76`). Drive it with
`createComponentModelDriver`, mount it once, bind its state once, and dispose it through `own()`.

| Current React construct | Native construct | Why |
|---|---|---|
| `RequestBuilder` + `useComponentModel`/`model.state.use()` (`RequestBuilder.tsx:46-92`) | `RequestBuilderView extends VanillaView<RequestBuilderProps>` with a `RequestBuilderModel` driver and one state bind | Preserves local split/header state without React. |
| `useLayoutEffect` deps `[bodyHeight, model]` (`RequestBuilder.tsx:85-92`) | `bodyMeasureGate` over exactly `[bodyHeight, model]`; schedule a guarded measurement when `bodyHeight === null` | Retain first-layout pixel pinning without storing 0: the callback must require `this.root.isConnected` and `bodyPanel.offsetHeight > 0`, retry on the next animation frame if either check fails, and store/cancel the pending frame id through one `own()` cleanup. |
| URL-bar Panel and method `WithMenu` (`RequestBuilder.tsx:255-306`) | `createPanelElement`, `ButtonView` with a method text Node, `TextareaView`, Send `ButtonView`, and `methodMenu: MenuHandle` | Keeps method color, URL keyboard/paste behavior, disabled send state, and menu selection. |
| Header split and table/JSON conditional (`RequestBuilder.tsx:308-390`) | Native panels, `SegmentedControlView`, copy `IconButtonView`, and `SubtreeSwap<"table" | "json">` | Preserves the table editor vs read/write JSON Monaco branch and explicit disposal. |
| Header `KeyValueEditor` (`RequestBuilder.tsx:365-373`) | `KeyValueEditorView` child with the same editor callbacks and `COMMON_HEADERS` | Reuses the native keyed editor and existing editor CRUD. |
| Header JSON `<MonacoEditorHost>` (`RequestBuilder.tsx:376-388`) | `MonacoEditorHostView`, attached before mount; field is gated by header-view/request sync | Retains JSON editing and the existing invalid-JSON state behavior. |
| Request body `<Splitter>` (`RequestBuilder.tsx:392-399`) | `SplitterView` | Preserves horizontal after-side drag and border placement. |
| Body type header and conditional language `WithMenu` (`RequestBuilder.tsx:401-446`) | `SegmentedControlView`, `SubtreeSwap<"raw" | "non-raw">`, `ButtonView` with file icon, and `bodyLanguageMenu: MenuHandle` | Keeps the language trigger present only for raw bodies and makes menu ownership explicit. |
| Local `BodyContent` (`RequestBuilder.tsx:458-576`) | `BodyContentView extends VanillaView` with `SubtreeSwap<BodyType>` | Each none/binary/form-data/form-urlencoded/raw branch owns exactly its controls/Monaco host. |
| Body host effect deps `[request.body, request.bodyType]` (`RequestBuilder.tsx:463-472`) | `bodyValueGate` over exactly `[request.body, request.bodyType]` | Updates a live raw Monaco host with `setValue`; non-raw branch disposal clears the host naturally. |
| Binary file button/text (`RequestBuilder.tsx:491-518`) | `ButtonView`, native text element, and `app.fs.showOpenDialog()` handler | Retains the file picker and selected-path styling without new CSS. |
| `FormDataEditor` and `request.formDataEntries.map(key={index})` (`RequestBuilder.tsx:578-690`) | `FormDataEditorView` plus `KeyedList<FormDataEntry, number, HTMLDivElement>` and `FormDataRowView` | Stable rows preserve focus and explicit row disposal; existing editor methods remain the owner of data. |
| Form-data type/file conditional and value conditional (`RequestBuilder.tsx:607-673`) | Row-owned `SubtreeSwap` branches with `ButtonView`, `TextareaView`, `IconButtonView`, and native path text | Preserves text/file toggle, browse action, empty-last-row spacer, and delete behavior. |
| `Panel`, `Text`, `Button`, `IconButton`, `SegmentedControl`, `Spacer`, `Splitter`, `Textarea`, `Checkbox`, `Autocomplete` throughout (`RequestBuilder.tsx:255-690`) | Corresponding `createPanelElement`, `createTextElement`, `ButtonView`, `IconButtonView`, `SegmentedControlView`, `SpacerView`, `SplitterView`, `TextareaView`, `CheckboxView`, and `AutocompleteView` | Uses only the existing native twins; type-only props imports from UIKit faces are permitted by C12. |

The request view’s central `sync()` must update existing child views and panel attributes without
re-registering binds/listeners. Store the current request/state projection in fields for handlers,
and regenerate menu item arrays from the current request when a menu is open. The header and body
splitter values use the current local height fields; clamp to 10–90% of the split root’s client
height. The first measurement must occur only after the root and relevant panel are attached.

Before:

```tsx
const model = useComponentModel(props, RequestBuilderModel, defaultRequestBuilderState);
const { bodyHeight, headersView, headersJson } = model.state.use();
useLayoutEffect(() => {
    if (bodyHeight === null && bodyPanelRef.current) {
        model.setBodyHeight(bodyPanelRef.current.offsetHeight);
    }
}, [bodyHeight, model]);
```

After:

```ts
this.driver = createComponentModelDriver(props, RequestBuilderModel, defaultRequestBuilderState);
this.bind(this.driver.model.state, (state) => state, this.syncLocalState);

private syncLocalState = (state: RequestBuilderState): void => {
    if (this.bodyMeasureGate.changed([state.bodyHeight, this.driver.model])) {
        this.scheduleBodyMeasure(state.bodyHeight);
    }
    this.syncExistingControls(state);
};
```

`syncLocalState` is illustrative: it must guard the panel/root, cancel any prior frame, and use a
live flag so a queued callback after disposal cannot write model state or DOM. The gate’s values
must remain exactly `[bodyHeight, model]`; do not gate on every request field.

#### MenuHandle sites in this file

There are three menu handles in this file:

| Field | Anchor | Items | Disposal/close behavior |
|---|---|---|---|
| `methodMenu` | `methodButton.root` | `HTTP_METHODS.map(...)` with current selected method | Dispose any existing handle before `openMenu`; `onClose` sets `methodMenu = undefined`; `onDispose` disposes it. |
| `bodyLanguageMenu` | `bodyLanguageButton.root` | `RAW_LANGUAGES.map(...)` with fresh file-icon Nodes | Same replacement/clear/dispose pattern; update while open from the current request. |
| `headersCopyMenu` is not in this file | — | — | The request copy handle belongs to `RestDetailView` in `RestClientShared.ts`, not to the builder. |

The method and body-language handlers must pass an `Element` anchor, not a React event or a
render-prop setter. The selected menu item callback calls the same editor method as the old face;
the menu’s `onClose` only clears the caller field.

### 6. Exact native `index.ts` edit

Modify only the Rest Client editor composition in
`src/renderer/editors/rest-client/index.ts`. Remove the `react` `createElement` import,
`EditorErrorBoundary` import, and `RestClientBody` import. Import `RestClientBodyView` instead.
Keep `RestClientEditor`, `defaultRestClientEditorState`, `TextChromeView`, `VanillaView`, the
module factory, and public exports.

Before:

```ts
const chrome = new TextChromeView({
    model: props.model,
    children: createElement(
        EditorErrorBoundary,
        null,
        createElement(RestClientBody, { model }),
    ),
});
super(props, chrome.root);
this.chrome = this.child(chrome);
```

After:

```ts
private model!: RestClientEditor;
private body!: RestClientBodyView;
private chrome!: TextChromeView;

public constructor(props: { model: EditorModel }) {
    super(props, createContentsRoot());
}

protected onMount(): void {
    const model = requireRestClientModel(this.props.model);
    this.model = model;
    const body = this.child(new RestClientBodyView({ model }));
    const chrome = this.child(new TextChromeView({
        model: this.props.model,
        children: body.root,
    }));
    this.body = body;
    this.chrome = chrome;
    this.root.append(body.root, chrome.root);
    body.mount();
    chrome.mount();
}

protected onUpdate(props: { model: EditorModel }): void {
    const model = requireRestClientModel(props.model);
    if (model !== this.model) {
        throw new Error("Rest Client view received a different model instance.");
    }
    this.body.update({ model });
    this.chrome.update({ model: props.model, children: this.body.root });
}
```

Add the same local `createContentsRoot()` helper used by the reviewed native editor compositions:
create a `span`, set `style.display = "contents"`, and pass it to `super()`. Appending body before
chrome and mounting body before chrome is required by the shipped native shape
(`src/renderer/editors/env-vars/index.ts:14-45`, `src/renderer/editors/grid/index.ts:218-243`).
`TextChromeView` takes the body Node through its slot (`TextChromeView.ts:409-433`); do not rebuild
that Node from `onUpdate()` and do not touch `updateSlots()`.

### 7. Deletion, imports, and CSS scope

After the native views are wired, delete:

- `src/renderer/editors/rest-client/RestClientBody.tsx`
- `src/renderer/editors/rest-client/KeyValueEditor.tsx`
- `src/renderer/editors/rest-client/RestClientShared.tsx`
- `src/renderer/editors/rest-client/ResponseViewer.tsx`
- `src/renderer/editors/rest-client/RequestBuilder.tsx`

Repoint only the internal imports to `*View` modules and keep the shared helper imports in
`RestPanelSecondaryView.ts` and `RestRequestTreeView.ts` extensionless against
`RestClientShared.ts`. Do not modify those already-native panel files unless typecheck proves an
import spelling change is required; their rendered tree is independent of the five React faces.

Native modules must import the static CSS required by controls whose `.tsx` face previously pulled
it in (`Button.css`, `IconButton.css`, `Textarea.css`, `Checkbox.css`, `SegmentedControl.css`,
`Spacer.css`, `Splitter.css`, and `Autocomplete.css` as applicable). `Panel.css` and `Text.css` are
already imported by their native builders, and Monaco/Menu modules bring their own host styles.
Do not add a new color literal, inline color, Emotion style, or UIKit primitive. Preserve existing
semantic HTTP status/method color sources (`universalColors`/`METHOD_COLORS`) rather than inventing a
new palette; all new styling remains static/co-located and all themed colors use existing tokens.

### 8. Suggested implementation order within this task

Proceed smallest source file first, while keeping each native dependency explicit:

1. Convert `RestClientBody.tsx` (59 lines) to the native body/error/empty/detail branch shell and
   establish the model-identity/index composition shape.
2. Convert `KeyValueEditor.tsx` (158 lines), including `KeyValueRowView`, keyed ownership, and its
   control/conditional branches.
3. Convert `RestClientShared.tsx` (327 lines) to `.ts`, first retaining pure exports, then add the
   `RestDetailView` split structure and copy menu. This makes the body’s detail dependency concrete.
4. Convert `ResponseViewer.tsx` (410 lines), remove the effect-bearing model registration, add the
   three exact gates, and verify response branch disposal/Monaco ownership.
5. Convert `RequestBuilder.tsx` (690 lines), reusing `KeyValueEditorView`, the shared detail layout,
   and the response/request native control patterns; implement the exact body/header gates and all
   three builder branches/menu handles.
6. Apply the exact `index.ts` composition, run the import sweep, then delete all five `.tsx` files.
7. Run structural checks and the existing typecheck/lint/build commands; perform the human presence
   pass only after a cold renderer/dev-server restart if a stale dynamic `.tsx` specifier is seen.

At every step, keep `RestClientEditor.ts` as the behavior owner. If implementation discovers that a
source claim here conflicts with actual code, stop and record the conflict in the verification
record rather than silently broadening the task.

## Concerns / Open questions

### Resolved decisions

1. **The two component models have different treatments.** `RequestBuilderModel` has no
   `effect()` and is driven by `createComponentModelDriver`. `ResponseViewerModel` currently has
   one effect and therefore cannot be passed unchanged to that driver: the driver throws when the
   model has registered effects (`core/state/model.ts:302-308`). Make the model effect-free
   specifically so `createComponentModelDriver` can own it, then express the old response effect
   through a view-owned gate. Do not weaken the driver guard.
2. **The complete gate ledger is fixed.** Each former effect/layout-effect has one gate, and no
   gate is driven from an unrestricted sync:

   | Native owner | Exact values passed to `changed()` | Consequence | Priming |
   |---|---|---|---|
   | `RestDetailView` | `[resultHeight]` | Schedule the first response-pane measurement only while height is `null`; later changes only reapply layout. | Prime after the initial attached measurement/layout has been applied. |
   | `ResponseViewerView` response reset | `[response]` | Live-guarded microtask clears language override. | Prime after the initial response projection. |
   | `ResponseViewerView` body host | `[activeTab, executing, formattedBody, response]` | Set a live body Monaco host’s value only under the old body-effect guard. | Prime after the initial branch/host is mounted. |
   | `ResponseViewerView` header JSON host | `[activeTab, executing, headersAsJson, headersView, response]` | Set a live header-JSON Monaco host’s value only under the old header-effect guard. | Prime after the initial branch/host is mounted. |
   | `RequestBuilderView` layout | `[bodyHeight, model]` | Schedule first body-pane measurement only while height is `null`; `model` is the stable driver model. | Prime after the initial attached measurement/layout has been applied. |
   | `BodyContentView` raw body host | `[request.body, request.bodyType]` | Set the raw Monaco host value only when the old effect would run; non-raw branches clear it by disposal. | Prime after the initial body branch/host is mounted. |

   The two `useLayoutEffect` conversions are included because their dependency semantics are still
   dependency-gated side effects even though they run after layout. Native `onMount()` does not
   guarantee that the root is attached and laid out, so neither site may store `offsetHeight` until
   `this.root.isConnected` is true and the measured height is greater than zero. If either check
   fails, retry on the next animation frame; never pin 0. A pending frame id is stored in a field
   and cancelled by one `own()` cleanup; no repeated `own()` registration is allowed
   (`src/renderer/uikit/shared/deps-gate.ts:12-44`, US-1168 README:405-406).
3. **The response-reset effect has three required behaviors.** Its dependency is response identity,
   not response content: the native gate must be `changed([props.response])`, matching
   `this.effect(..., () => [this.props.response])` (`ResponseViewer.tsx:121-127`). The reset must
   remain inside `queueMicrotask`, so it lands after the current commit rather than synchronously
   inside the gate. The microtask must also check a view-owned `isLive` flag, cleared through one
   `own()` cleanup, so teardown prevents a queued reset from calling the model. Make
   `ResponseViewerModel` effect-free specifically so `createComponentModelDriver` can own it; the
   unchanged driver throws for an effect-bearing model at `core/state/model.ts:302-308`.
4. **The parse-error branch is not a framework error boundary.** `RestClientEditor.loadData()` puts
   malformed JSON in `state.error` (`RestClientEditor.ts:292-297`), so the native body preserves
   that warning with a local panel/text view. It imports neither `EditorError` nor
   `EditorErrorBoundary`. Exceptions thrown by constructors, mounts, or updates are left for
   `AsyncEditorView` to display through `NativeEditorErrorView` (`AsyncEditorView.ts:99-164`).
5. **`SplitDetailPanel` gets a local view, not a new UIKit primitive.** The source search found no
   native twin; `RestDetailView` is editor-local and owns only the request/response composition.
   It uses existing panel attributes and `SplitterView`, matching the established native split
   pattern in `src/renderer/editors/mcp-inspector/ToolsPanel.ts:20-48`, `:80-155`.
6. **Native children own their own resources.** `SubtreeSwap` owns conditional branch views;
   `KeyedList` owns keyed row views and invokes their disposal in `remove`; parent views own fixed
   children with `child()`. Shared request-tree model/data and panel-owned views are borrowed and
   never disposed by the editor body. This applies C1a to every map/registry boundary
   (`src/renderer/uikit/shared/subtree-swap.ts:8-88`, `keyed-list.ts:18-166`).
7. **Menus are caller-owned, exactly four sites.** `RequestBuilderView` owns
   `methodMenu` and `bodyLanguageMenu`; `RestDetailView` owns `copyMenu`; `ResponseViewerView`
   owns `languageMenu`. Each handle is replaced only after disposing the previous handle, cleared
   by its `onClose`, updated while open from current props, and disposed in `onDispose`. No menu
   content or icon Node is shared across opens.
8. **The existing type and compatibility surfaces remain.** Type-only imports such as
   `import type { ButtonProps } from "../../uikit/Button/Button"` are allowed and erased; no
   UIKit `.tsx` face is changed/deleted, and no `React.*` alias, `slots.ts`, `fill-slot.ts`,
   `PopoverView.tsx`, `DialogView.tsx`, or `TextChromeView.updateSlots` is touched. This is the
   C12/C13/C14 boundary (EPIC-073:220-240; US-1168 README:493-498).
9. **The no-change model files stay no-change.** `RestClientEditor.ts` already owns request
   persistence/execution and uses `errMessage` in its request failure response
   (`RestClientEditor.ts:648-771`). Its older parse catch uses `e.message` at `:292-295`; that is
   pre-existing and outside this conversion’s expected scope. Do not broaden this task to repair
   it unless implementation is blocked and the scope change is recorded.
10. **No local HTTP target is guaranteed by the application.** The development server is configured
   at `http://localhost:5273/` (`scripts/dev.mjs:250`), which is a suitable loopback GET target
   when `npm start` is running. The documented loopback MCP endpoint is not verified here as a
   compatible Rest Client target. If the dev server is unavailable, sending requires a human with
   a network-accessible or human-started local HTTP target; do not claim a response was verified
   without actually sending one.

### Unverified until implementation and the human pass

- The native modules, compile result, lint result, production build, and final zero-`.tsx` search
  are unverified because this thread performs no implementation.
- The `RestDetailView` panel geometry, first-layout height pinning, nested request/body split, and
  Monaco final size are source-planned but not measured. The human pass must record non-zero
  `getBoundingClientRect()` dimensions for the visible page editor and Monaco hosts.
- Keyboard entry into `TextareaView`, `AutocompleteView`, and Monaco, including URL Enter/paste,
  header JSON editing, raw body editing, form-data editing, and response-language selection, is
  unverified until a human exercises it. If an available DOM instrument cannot type reliably, keep
  these checks unverified rather than substituting a structural assertion.
- Request sending, status/header/body rendering, error responses, response-cache restoration,
  binary save/image actions, and host-backed serialization are unverified. The response acceptance
  below requires an actual send; the loopback target is conditional on the dev server being up.
- Menu item selection and close/focus restoration, request-tree selection/context menus/dragging,
  splitter pointer dragging, body-mode transitions, keyed-row focus retention, and disposing while
  a file dialog or confirmation is pending are unverified.
- The exact browser layout behavior of `openMenu` with the converted anchors is unverified. Any
  overlay assertion must query the visible page editor and use `getBoundingClientRect()` or computed
  style for fixed-position menus/popovers; never use `offsetParent`, which is `null` for fixed
  elements (EPIC-073:89-137; US-1168 README:546-588).
- It is unverified whether any additional static CSS import is needed once the React faces are
  deleted; implementation must confirm this through the build and visible controls, without editing
  UIKit faces or adding ad hoc styles.

## Acceptance Criteria

### Native cut and lifecycle

- [ ] Add the five native modules named in the plan and delete exactly the five Rest Client `.tsx`
  files. `find src/renderer/editors/rest-client -name "*.tsx"` returns nothing.
- [ ] None of the new native modules contains JSX, a React runtime import, `useEffect`,
  `useLayoutEffect`, `useComponentModel`, `EditorError`, or `EditorErrorBoundary`. Type-only
  imports from UIKit face files are allowed; no UIKit `.tsx` file is changed or deleted.
- [ ] `RequestBuilderModel` is driven by `createComponentModelDriver` and has no registered
  `effect()`. `ResponseViewerModel` is made effect-free and its former response effect is owned by
  `ResponseViewerView`’s exact `[response]` gate. Both drivers are disposed once through `own()`.
- [ ] All six gates exist with the exact arrays in the gate ledger; each is primed after the initial
  branch/measurement has been applied. No bind/listen/gate registration occurs from a repeatedly
  called sync method.
- [ ] Both pinned-height callbacks require `this.root.isConnected` and a measured
  `offsetHeight > 0` before storing the value. If either condition is false, the callback retries on
  the next animation frame and never stores 0. After opening a request with a response, the
  response pane and request-body pane each report a non-zero pinned height, and dragging each
  splitter does not jump on the first drag. Each pending frame id is cancelled through one
  `own()` cleanup.
- [ ] Every `state.use(...)` is replaced by a bind or direct native subscription installed once
  from `onMount()`. The no-op focus queue uses one `typedQueue.subscribe()` and releases it through
  `own()`.
- [ ] Every conditional branch uses `SubtreeSwap`, every keyed list disposes removed row views in
  its `remove` callback, and every owned Monaco/control/menu/frame/blob resource has a teardown.
  A disposed view cannot let a queued callback update DOM or model state.
- [ ] The four `MenuHandle` fields follow the required dispose-before-open, `onClose` clear, and
  `onDispose` disposal pattern. Fresh menu icon Nodes are built for every menu item array.
- [ ] `RestClientEditor` remains the owner of request CRUD, host persistence, response cache, and
  sending; shared request-tree resources are never disposed by the new body/detail views.

### Exact editor composition and scope guard

- [ ] `src/renderer/editors/rest-client/index.ts` has no `createElement`, `EditorErrorBoundary`,
  or old `RestClientBody` import. It builds body and chrome in `onMount()`, appends body first and
  chrome last, mounts body first and chrome last, and passes `body.root` as the `TextChromeView`
  `children` Node.
- [ ] `RestClientEditorView.onUpdate()` throws on a different `RestClientEditor` instance and
  otherwise updates existing body/chrome instances only. It does not rebuild children.
- [ ] `RestClientShared.ts` preserves the exports consumed by
  `RestPanelSecondaryView.ts`/`RestRequestTreeView.ts`; those panels remain native and their
  request tree remains visible and interactive.
- [ ] No changes are made to `RestClientEditor.ts`, `parseClipboardRequest.ts`,
  `serializeRequest.ts`, `multipartBuilder.ts`, `httpConstants.ts`, `restClientTypes.ts`,
  `open-in-rest-client.ts`, `panels/RestPanelSecondaryView.ts`, or
  `panels/RestRequestTreeView.ts`, unless a verified import-resolution issue requires a separately
  recorded scope change.
- [ ] No UIKit `*.tsx` face, `React.*` type surface, `uikit/shared/slots.ts`,
  `uikit/shared/fill-slot.ts`, `PopoverView.tsx`, `DialogView.tsx`, or
  `TextChromeView.updateSlots` is edited. No tests, harnesses, fixtures, commits, or
  `doc/active-work.md` edits are added.
- [ ] New code follows project standards: colors come from existing theme/semantic sources and no
  color literal is added; no direct `require("path")`/`require("fs")` is added; caught values use
  `errMessage(e, fallback?)`; renderer file operations use `app.fs`; styling is static/co-located.

### Presence: opening and exercising Rest Client

Open the editor through one of the verified routes:

1. Use the sidebar **Rest Client** tool, whose native registry entry calls
   `pagesModel.addEditorPage("rest-client", "json", "untitled.rest.json")`
   (`src/renderer/ui/sidebar/tools-editors-registry.ts:129-133`), or open a real file whose name
   ends in `.rest.json`. The matcher accepts that extension and JSON content/type shape
   (`src/renderer/editors/base/editor-matchers.ts:103-112`).
2. Confirm the dynamic editor registration is `rest-client` with `hasContentHost: true`
   (`src/renderer/editors/register-editors.ts:160-163`). A URL opened through the existing
   `openInRestClient()` path is an additional verified route (`open-in-rest-client.ts:9-55`).

On the visible page editor, a human must see and exercise all of the following:

- the native request tree panel, including the add-request action and selecting a request;
- method selection, URL editing, and a request body construction with method, URL, headers through
  the key/value editor (including enable/delete/add-row behavior), and at least one body mode;
- both request splitters: drag the headers/body splitter and the request/response splitter, and
  confirm double-clicking their section headers toggles the proportions;
- all request controls’ menus: method, raw-body language, and copy-as menu; response body language
  and copy-headers menus; each opens at its anchor, shows items, and closes cleanly;
- sending the request and seeing a response with status, response headers, and response body in
  the Monaco host. Sending needs network I/O. Prefer `http://localhost:5273/` while the development
  server is running; if it is not available, this criterion requires a human with a suitable local
  or network target and must be marked unverified otherwise;
- response mode switching between Body and Headers, and header display switching between Table and
  JSON. The body language menu must change Monaco language. If a binary response is used, also
  verify the image/file actions, but binary behavior is optional to the core pass;
- switching away from and back to the page, reopening menus, and closing the page after editing to
  exercise child/Monaco/menu/listener teardown.

All DOM assertions must be scoped to the visible page editor, not the first matching page in the
document and not the whole application. Select the page-editor element with a non-empty
`getClientRects()` result (or the application’s equivalent visible-page marker), then query within
that element. Assert no `[data-react-root]` descendants there; do not make an application-wide zero
claim because Storybook and the named draw vendor island remain intentional React paths
(EPIC-073:265-275). For menus/popovers/fixed overlays, use `getBoundingClientRect()` or computed
style to establish visibility and position; never use `offsetParent`.

### Checks

- [ ] After implementation, `npm run typecheck`, `npm run lint`, and `npm run build-prod` pass.
- [ ] After a `.tsx` → `.ts` dynamic-import change, verification uses a cold renderer/dev-server
  restart if Vite reports a stale module specifier; a renderer reload alone is insufficient
  (EPIC-073:89-137; US-1166 README:529-531).
- [ ] Structural scope checks show no `.tsx` under `src/renderer/editors/rest-client`, no React
  runtime path in the five new modules, and no prohibited shared/UIKit file changes.
- [ ] Any failed or unavailable human behavior check is recorded as unverified, with the reason,
  rather than converted into a proof of presence or absence.

## Files Changed Summary

| File | Planned status | Scope |
|---|---|---|
| `doc/tasks/US-1169-rest-client-native/README.md` | Add | This planning document only. |
| `src/renderer/editors/rest-client/RestClientBodyView.ts` | Add | Native body projection, error/empty/detail `SubtreeSwap`, queue subscription, and lifecycle. |
| `src/renderer/editors/rest-client/KeyValueEditorView.ts` | Add | Native key/value editor, keyed rows, control branches, and row disposal. |
| `src/renderer/editors/rest-client/RestClientShared.ts` | Add; replaces `.tsx` | Existing pure shared helpers plus native `RestDetailView` and response metadata. |
| `src/renderer/editors/rest-client/ResponseViewerView.ts` | Add | Native response model/view, exact gates, response branches, menus, headers, binary view, and Monaco hosts. |
| `src/renderer/editors/rest-client/RequestBuilderView.ts` | Add | Native request model/view, exact gates, request controls, menus, body branches, form-data rows, and Monaco hosts. |
| `src/renderer/editors/rest-client/index.ts` | Modify | Body-first/chrome-last native composition and model identity guard. |
| `src/renderer/editors/rest-client/RestClientBody.tsx` | Delete | React body face. |
| `src/renderer/editors/rest-client/KeyValueEditor.tsx` | Delete | React key/value face and local row. |
| `src/renderer/editors/rest-client/RestClientShared.tsx` | Delete | React shared/detail face after helpers move to `.ts`. |
| `src/renderer/editors/rest-client/ResponseViewer.tsx` | Delete | React response face. |
| `src/renderer/editors/rest-client/RequestBuilder.tsx` | Delete | React request-builder face and local sub-components. |
| `src/renderer/editors/rest-client/RestClientEditor.ts` | No change expected | Existing model, persistence, response cache, CRUD, and send behavior. |
| `src/renderer/editors/rest-client/parseClipboardRequest.ts` | No change expected | Existing cURL/fetch parser. |
| `src/renderer/editors/rest-client/serializeRequest.ts` | No change expected | Existing copy-as serializers used by the native menu. |
| `src/renderer/editors/rest-client/multipartBuilder.ts` | No change expected | Existing multipart request builder. |
| `src/renderer/editors/rest-client/httpConstants.ts` | No change expected | Existing methods, headers, and semantic method colors. |
| `src/renderer/editors/rest-client/restClientTypes.ts` | No change expected | Existing request/response and shared state types. |
| `src/renderer/editors/rest-client/open-in-rest-client.ts` | No change expected | Existing URL-to-Rest-Client route. |
| `src/renderer/editors/rest-client/panels/RestPanelSecondaryView.ts` | No change expected | Already-native panel; consumes shared tree helpers only. |
| `src/renderer/editors/rest-client/panels/RestRequestTreeView.ts` | No change expected | Already-native request tree; consumes shared types/helpers only. |
| `src/renderer/uikit/**` faces and shared compatibility files | No change | C12/C13/C14 scope guard; use existing native twins and menu seam. |
| `src/renderer/ui/app/NativeEditorErrorView.ts` | No change | Existing AsyncEditorView error owner. |
| Tests/harnesses, commits, `doc/active-work.md` | None | Explicitly forbidden / outside “task document only” scope. |

## Verification record (investigation, 2026-08-27)

**Guidance read:** `CLAUDE.md` was read in full before investigation, followed by
`.claude/rules/task-docs.md`. The epic and the full US-1166/US-1168 task documents were read,
including their Verification records. Their reviewed lifecycle decisions are carried into this
plan; no implementation or test command was run.

**Source scope verified:** `src/renderer/editors/rest-client/` currently contains exactly the five
`.tsx` targets plus the expected `.ts` model/helper/panel files. The five target line counts are
59, 158, 327, 410, and 690 respectively (the supplied total is 1,644). The current native panel
files import only shared tree helpers/types and native tree/UI modules; no import from the five
faces was found.

**Rename verification hazard recorded:** `RestClientShared.tsx` has three current importers: the
deleted `RestClientBody.tsx` and the already-native `panels/RestPanelSecondaryView.ts:9` and
`panels/RestRequestTreeView.ts:17`. The editor registry reaches the whole directory through the
lazy `import("./rest-client")` at `src/renderer/editors/register-editors.ts:160`. After the
`.tsx` → `.ts` rename, a `Failed to fetch dynamically imported module` error can be Vite's stale
module/specifier cache rather than a conversion failure. The live pass must therefore use a cold
dev-server and renderer restart; an HMR or renderer-only reload is insufficient. If necessary,
touch the importer to invalidate the stale specifier, then retry before diagnosing the conversion.

**Model/effect findings verified:** `RequestBuilderModel` has no `init()`/`effect()` registration
(`RequestBuilder.tsx:52-76`). `ResponseViewerModel.init()` registers one effect over response
identity (`ResponseViewer.tsx:108-127`). The remaining three hook side effects and two layout
measurements have the exact dependency arrays recorded in the gate ledger
(`ResponseViewer.tsx:156-172`; `RequestBuilder.tsx:85-92`; `RequestBuilder.tsx:463-472`;
`RestClientShared.tsx:85-92`).

**Ownership findings verified:** `openMenu` returns a caller-owned `MenuHandle`
(`src/renderer/uikit/Menu/attach-menu.ts:13-76`); `WithMenu` has four Rest Client renderers at
the method/language/copy/language sites recorded above (`RequestBuilder.tsx:274-286`,
`:429-444`; `RestClientShared.tsx:235-248`; `ResponseViewer.tsx:294-307`). Native
`MonacoEditorHostView` owns its editor/model/subscriptions and exposes `setValue()`
(`src/renderer/editors/shared/MonacoEditorHostView.ts:23-153`). `SubtreeSwap`, `KeyedList`, and
`VanillaView.bind()` provide the explicit lifecycle contracts cited in the plan.

**Routing findings verified:** `.rest.json` matching/content detection is in
`src/renderer/editors/base/editor-matchers.ts:103-112`; dynamic registration is in
`src/renderer/editors/register-editors.ts:160-163`; the sidebar creates `untitled.rest.json` at
`src/renderer/ui/sidebar/tools-editors-registry.ts:129-133`; and the existing URL route is in
`src/renderer/editors/rest-client/open-in-rest-client.ts:9-55`.

**Not verified:** all implementation results, final structural counts, typecheck/lint/build,
visible-page zero-root behavior, request construction/sending/response rendering, menus,
response-mode switches, request-tree interaction, splitter dragging, and disposal. Those remain
acceptance-pass work and must not be inferred from the source plan.

---

## Verification record (2026-08-27)

**Gates:** `npm run typecheck`, `npm run lint`, `npm run build-prod` — all pass.

**Scope:** added `RestClientBodyView.ts`, `RequestBuilderView.ts`, `ResponseViewerView.ts`,
`KeyValueEditorView.ts`, `RestClientShared.ts`; changed `index.ts`; deleted all five `.tsx` files.

**Measured:** JSX markers **351 → 221** (exactly rest-client's 130), `editors/` 333 → 203,
non-story `.tsx` 44 → 39. `find src/renderer/editors/rest-client -name "*.tsx"` returns nothing and
no file in the folder imports `react`.

**Review finding I1 implemented as specified.** Both pinned-height sites guard correctly —
`RequestBuilderView.ts:187` and `RestClientShared.ts:275` both test
`!this.live || !this.root.isConnected || offsetHeight <= 0` and reschedule on the next animation
frame rather than pinning 0.

**Live pass, after a cold dev-server restart** (required: `RestClientShared.tsx` → `.ts` behind a
lazy `import()` — the E11 hazard the plan flagged).

| Check | Result |
|---|---|
| React roots in the visible page editor | **0** |
| React roots app-wide | **1** (`GlobalStyles`) |
| Editor renders the request | `E15/Local health · GET · http://127.0.0.1:7865/health · Send` |
| Headers section | `Headers [Table\|JSON]`, values `application/json`, `text/plain` |
| Body section | `Body [none\|form-data\|x-www-form-urlencoded\|raw\|binary]`, language `plaintext`, and the `This request has no body.` empty state for `bodyType: "none"` |
| Response pane | `Send a request to see the response.` placeholder |
| **Pinned pane heights (finding I1)** | `request-pane-body` **1261×630**, `request-body-splitter` 1261×6, `body-panel` 1261×237, `body-section-header` 1261×28, `body-type-select` 377×24, `body-language` 101×24, `body-content` 1261×209, `response-pane-body` **1261×266** — every value non-zero, nothing collapsed |

### Two false alarms on the way, both mine

1. **A crash caused by my own fixture.** The first run showed the native "Editor crashed" panel with
   `TypeError: factory.create is not a function` at `MonacoEditorHostView.onMount:24`. Cause: I
   invented the `.rest.json` schema. The real shape is `{ type: "rest-client", requests: RestRequest[] }`
   with **`body: string`** (`restClientTypes.ts:19-32`); I had written `{version, requests}` with
   `body: { kind, text }`, so an *object* reached `monaco.editor.createModel`. The React original
   would have failed identically — not a regression. Worth noting separately: a malformed
   `.rest.json` crashes the editor rather than showing an error state (pre-existing; not this task).
2. **Page reuse masking the fix.** After correcting the fixture the page *still* showed the crash,
   because `openRawLink` on an already-open path **reactivates the existing page** rather than
   remounting it — and that page was holding its crashed error state. Opening the corrected fixture
   under a **new filename** rendered correctly. *A stale error state survives a corrected input; to
   re-test a crash fix, open a fresh path.*

Both are worth recording because each independently produced a confident-looking "the conversion is
broken" reading, and neither was.

**Also confirmed working:** the native error surface built in EPIC-072. The bad fixture produced a
proper "Editor crashed" panel with message and stack, 0 React roots, and the app stayed usable.

**Not verified — recorded as unverified rather than replaced (C9a):**

- **The Monaco body and headers-JSON hosts were never instantiated.** Both appear only behind a
  `SegmentedControlView` switch (body type → `raw`, headers view → `JSON`), and a synthetic `click()`
  does not drive that control — the same instrument limit that blocked av-grid editing in US-1166
  and US-1168. So `MonacoEditorHostView` under rest-client is **untested at runtime**, including the
  `initialValue`/language wiring and the readOnly headers host.
- **Sending a request** and rendering a real response (status, headers, body) — needs network.
- **The `WithMenu` → `openMenu` sites** (request copy menu, response language menu) — not opened.
- **Splitter dragging**, and therefore the first-drag-does-not-jump behaviour the pinned heights
  exist for. The heights are correct; the drag itself is unexercised.
- **The request tree panel** — it is a sidebar secondary view, outside the page editor, and was not
  exercised.

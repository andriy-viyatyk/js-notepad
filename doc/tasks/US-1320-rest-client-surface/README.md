# US-1320 - The REST client surface

Epic: [EPIC-087 - The data editors through `call`, and the retirement of `ui_push`](../../epics/EPIC-087.md)

## Goal

Replace the identity-only `GenericEditorFacade` currently returned for `rest-client` pages with a
real, page-scoped REST client facade. The facade will expose a curated element inventory and
highlighting, copied snapshots of the collection/selected request/response state, and only
model-backed actions that do not accept credential values or return them as action results. This
document is a plan only;
it does not implement the facade, typings, UI changes, tests, or generated assets.

**Status: Implemented 2026-09-06** (review deferred to epic close, per the epic model).

Verified live through `call`: 21 page-scoped declarations with correct conditional visibility
(`response-*` invisible with no response, `form-data-*` invisible on a raw body), `count: 2,
highlighted: 2` on the repeated `kv-row-key`, and `selectedRequest` returning exactly what
`page.content` returns for the same page — no phantom redaction.

## Background

`src/renderer/editors/register-editors.ts:160` registers the `rest-client` editor, but
`src/renderer/scripting/api-wrapper/PageWrapper.ts:52-70,147-155` has no `rest-client` entry in
`FACADE_FOR_EDITOR`; a REST page therefore falls through to `GenericEditorFacade` and exposes only
`id` and `name`. `src/renderer/editors/rest-client/RestClientEditor.ts:89-170` is the model and
already owns host attachment, parsed request data, selection, response cache, and request methods.
`src/renderer/scripting/api-wrapper/RestClientEditorFacade.ts` does not exist yet.
The sidebar model is registered separately as `rest-panel` at
`src/renderer/editors/register-editors.ts:74-78`.

The exact facade pattern is `src/renderer/scripting/api-wrapper/NotebookEditorFacade.ts:1-39`:
declare one static element list, call `createElements` with
`scopeSelector: pageScopeSelector(pageId)`, use
`beforeHighlight: () => activatePageAndWaitForLayout(pageId)`, merge `elements.members`, and
expose `elements` plus `provide`. `createElements` resolves each default selector as
`[data-name="<name>"]`, measures live visibility, and delegates highlighting to the existing
overlay (`src/renderer/scripting/ai-vision/elements.ts:64-145`). The overlay deliberately rings
only the first match by default and rings all matches only when `all` is set
(`assets/agent/ui-highlight.js:281-286`); its result reports both total `count` and
`highlighted` rings (`:298-306`). Because every declared REST row selector is repeated, the facade
must pass `highlightOptions: { all: true }`.

The named-control inventory below was regenerated from the current source `name:` props. There are
64 unique names in the REST folder (75 raw occurrences), matching the verified scope. The
structural binary-response roots `response-binary` and `response-binary-actions` are included in
that count and audited here.
UIKit emits these as `data-name` on the same root as `data-type`: Panel does so through
`src/renderer/uikit/Panel/panel-style.ts:303-357`, and Button/IconButton/other primitives update or
delete the attribute from their `name` prop (`src/renderer/uikit/Button/ButtonView.ts:97-105`).
No existing `data-name` or `data-type` will be renamed.

`RestClientEditorState` is the authoritative state shape at
`src/renderer/editors/rest-client/RestClientEditor.ts:30-57`: `data.requests`,
`selectedRequestId`, `error`, `response`, `responseTime`, `executing`, and
`headersJsonInvalid`. `RestRequest` at
`src/renderer/editors/rest-client/restClientTypes.ts:19-32` contains arbitrary header values,
form-urlencoded values, multipart values, a raw body, a binary-file path, and a free-form URL;
there is no stored-variable map or interpolation model in this source. `RestResponse` at
`restClientTypes.ts:39-46` contains status, status text, arbitrary response headers, body,
binary status, and content type.

The main body view switches between parse error, selected-request detail, and empty states from
model state (`src/renderer/editors/rest-client/RestClientBodyView.ts:16-25,124-177`). The detail
view owns request metadata and the request/response subviews
(`src/renderer/editors/rest-client/RestClientShared.ts:104-228`); request controls and their
model callbacks are in `RequestBuilderView.ts:106-249`, header/form rows in
`RequestBuilderView.ts:251-359` and `KeyValueEditorView.ts:58-243`, and response controls/state
in `ResponseViewerView.ts:42-90,167-225,320-404`. These views contain local component models for
display tabs, split heights, language overrides, and header JSON editing. Those local models are
not editor state and are not valid facade action targets.

## Implementation Plan

### 1. Curate the 64 verified names

Declare one `REST_CLIENT_ELEMENTS` constant in the new facade. The 21 curated entries below are
the useful user-facing controls: request metadata/editing, request-shape controls, repeated
row locations, request send, and response display controls. Structural roots, layout panes,
scroll containers, headings, and panel-owned controls are omitted. Existing names and their
existing `data-type` values remain unchanged.

| Name | Decision | Purpose and source evidence |
| --- | --- | --- |
| `body-content` | Omit | Conditional body-branch root reused by every body type; `RequestBuilderView.ts:295-317` makes it a container, not a control. |
| `body-content-scroll` | Omit | Form-urlencoded scrolling container; `RequestBuilderView.ts:306` only supplies overflow/layout. |
| `body-language` | Curate | Conditional raw-body language menu trigger; `RequestBuilderView.ts:232-244` delegates the choice to model `updateBodyLanguage`. |
| `body-panel` | Omit | Request/body split pane; `RequestBuilderView.ts:102-103,183-187` uses it for layout. |
| `body-section-header` | Omit | Body section heading and double-click resize target; `RequestBuilderView.ts:131-141` is structural. |
| `body-type-select` | Curate | Select the selected request's body type; `RequestBuilderView.ts:132-137,215` calls model `updateBodyType`. |
| `form-data-browse` | Curate as repeated/conditional | File-row browse trigger, once per multipart file row; `RequestBuilderView.ts:354,358-359` opens a view-owned file dialog, so the facade exposes the location but no browse action. |
| `form-data-check-slot` | Omit | Structural checkbox slot in each multipart row; `RequestBuilderView.ts:348` contains the unnamed enabled checkbox. |
| `form-data-delete` | Curate as repeated/conditional | Delete trigger, once per non-empty multipart row; `RequestBuilderView.ts:355` calls model `deleteFormDataEntry`. |
| `form-data-editor` | Omit | Keyed multipart-row list host; `RequestBuilderView.ts:324-331` supplies list reconciliation rather than a user control. |
| `form-data-key` | Curate as repeated | Edit a multipart field name, once per row; `RequestBuilderView.ts:352` forwards only the `key` field to model `updateFormDataEntry`. |
| `form-data-row` | Omit as repeated | Structural multipart row wrapper; `RequestBuilderView.ts:347-355` contains the row controls. |
| `form-data-type-toggle` | Curate as repeated | Toggle text/file mode, once per row; `RequestBuilderView.ts:353` is model-backed and clears the old value internally without accepting a secret argument. |
| `form-data-value` | Curate as repeated | Locate the multipart value editor, once per text row; `RequestBuilderView.ts:358` proves its value is visible, while no value-setting facade action is exposed. |
| `headers-copy` | Omit | Copies enabled raw request header values to the clipboard; this is a view-owned clipboard action, not a model-backed facade action. |
| `headers-json` | Omit | Monaco host for the local JSON header editor; `RequestBuilderView.ts:262-266` is a view implementation container. |
| `headers-panel` | Omit | Request-header layout pane; `RequestBuilderView.ts:102,128,183-186` only controls split layout. |
| `headers-scroll` | Omit | Header table scroll container; `RequestBuilderView.ts:251-260` contains repeated rows. |
| `headers-section-header` | Omit | Structural Headers heading and double-click resize target; `RequestBuilderView.ts:122-141`. |
| `headers-view` | Curate | Switch the visible table/JSON header editor; `RequestBuilderView.ts:214,219-230` proves it is visible state, but its local `RequestBuilderModel` state is not exposed as a facade action. |
| `kv-editor` | Omit | Repeated key/value list host; `KeyValueEditorView.ts:58-61,243` owns reconciliation, not a user action. |
| `kv-row` | Omit as repeated | Structural header/form row wrapper; `KeyValueEditorView.ts:66,95` is the container for row controls. |
| `kv-row-check-slot` | Omit as repeated | Structural enabled-checkbox slot; `KeyValueEditorView.ts:78-79` contains the unnamed checkbox. |
| `kv-row-delete` | Curate as repeated | Delete a header or form-urlencoded row, once per row; `KeyValueEditorView.ts:216-220` forwards the row index to the model. |
| `kv-row-key` | Curate as repeated | Locate/edit a header or form-urlencoded key, once per row; `KeyValueEditorView.ts:170-180` forwards key changes without accepting a value. |
| `kv-row-key-slot` | Omit as repeated | Structural key-input slot; `KeyValueEditorView.ts:79` supplies width/layout only. |
| `kv-row-value` | Curate as repeated | Locate the header/form-urlencoded value editor, once per row; `KeyValueEditorView.ts:126,180` proves arbitrary values are visible, while no value setter is exposed. |
| `method-label` | Curate | Open the selected request's HTTP method menu; `RequestBuilderView.ts:114-119,211,243` updates the model through `updateRequest`. |
| `request-body-splitter` | Omit | View-local body-height splitter; `RequestBuilderView.ts:189-210` writes `RequestBuilderModel` layout state, not REST editor state. |
| `request-builder` | Omit | Structural request editor root; `RequestBuilderView.ts:95-103` contains URL, headers, and body controls. |
| `request-copy-as` | Omit | Serializes raw URL, headers, and body to the clipboard; `RestClientShared.ts:337-373` is a view-owned clipboard action, not a model-backed facade action. |
| `request-delete` | Curate | Delete the selected request; `RestClientShared.ts:341-348` calls model `deleteRequest` after confirmation. |
| `request-header-collection` | Curate | Edit the selected request's collection name; `RestClientShared.ts:321-326` calls `updateRequestCollection`. |
| `request-header-name` | Curate | Rename the selected request; `RestClientShared.ts:329-334` calls `renameRequest`. |
| `request-pane` | Omit | Request-side detail pane; `RestClientShared.ts:113-126,257-260` is layout. |
| `request-pane-body` | Omit | Request detail scrolling body; `RestClientShared.ts:183-190` contains `RequestBuilderView`. |
| `request-pane-header` | Omit | Request metadata header row; `RestClientShared.ts:127-147,190-198` is a layout/header container. |
| `request-split` | Omit | Request builder's internal split root; `RequestBuilderView.ts:96-99` is structural. |
| `response-binary` | Omit | Structural binary-response branch root; `ResponseViewerView.ts:467-479` contains unnamed save/open buttons. |
| `response-binary-actions` | Omit | Structural action host for binary response buttons; `ResponseViewerView.ts:468-480`; the child buttons have no stable names. |
| `response-copy-headers` | Omit | Copies raw response headers; `ResponseViewerView.ts:367-368,387-390` is a view-owned clipboard action, not a model-backed facade action. |
| `response-headers-list` | Omit | Repeated response-header list container; `ResponseViewerView.ts:437-447` owns row rendering. |
| `response-headers-view` | Curate | Switch response-header table/JSON presentation; `ResponseViewerView.ts:363-365` proves the visible control, but its state is local to the response view and has no facade action. |
| `response-language` | Curate | Open the response language override menu; `ResponseViewerView.ts:367-379` proves it is a conditional response display control, but the override is view-local and has no facade action. |
| `response-open-in-tab` | Curate | Open the displayed response in a new Monaco page; `ResponseViewerView.ts:367,383-386` is discoverable, but the facade will not reach into this view-owned action. |
| `response-pane` | Omit | Response-side detail pane; `RestClientShared.ts:120-126,261-264` is layout. |
| `response-pane-body` | Omit | Response detail content host; `RestClientShared.ts:200-206` contains `ResponseViewerView`. |
| `response-pane-header` | Omit | Structural Response heading/meta row; `RestClientShared.ts:137-146,207-212`. |
| `response-tab-body` | Omit | Response content host below the tabs; `ResponseViewerView.ts:294-295` contains body/header branches. |
| `response-tabs` | Omit | Structural response toolbar row; `ResponseViewerView.ts:294` contains the tab and action controls. |
| `response-tab-select` | Curate | Switch between response body and headers; `ResponseViewerView.ts:359-360` proves the visible control, but tab state is local to the view. |
| `response-viewer` | Omit | Dynamic response branch root reused by empty, executing, and response states; `ResponseViewerView.ts:137-140,244-270`. |
| `rest-client-root` | Omit | Empty/detail body branch root; `RestClientBodyView.ts:53-70` uses it as structural layout. |
| `rest-client-tree` | Omit from the editor facade | Sidebar request tree root; `panels/RestRequestTreeView.ts:95-116` belongs to the `rest-panel` node under `page.panels`. |
| `rest-detail` | Omit | Composite selected-request detail root; `RestClientShared.ts:104-111` contains both request and response panes. |
| `rest-detail-splitter` | Omit | View-local request/response height splitter; `RestClientShared.ts:252-318` writes presentation geometry. |
| `rest-empty` | Omit | Empty-state message container; `RestClientBodyView.ts:53-86` is not actionable. |
| `rest-panel-pane` | Omit from the editor facade | Sidebar panel body root; `panels/RestPanelSecondaryView.ts:41-56` belongs to `page.panels`. |
| `rest-secondary-view` | Omit from the editor facade | Sidebar secondary-view root; `panels/RestPanelSecondaryView.ts:20-33` is the `rest-panel` panel node, not editor content. |
| `rest-send` | Curate | Send the selected request; `RequestBuilderView.ts:213` calls model `sendRequest`, subject to the network caution below. |
| `rest-tree-add` | Omit from the editor facade | Sidebar Add Request button; `panels/RestRequestTreeView.ts:66-75` belongs to `page.panels`. |
| `rest-tree-root-label` | Omit from the editor facade | Sidebar Requests label and add-button host; `panels/RestRequestTreeView.ts:51-77` is panel-owned structure. |
| `url-bar` | Omit | URL/method/send layout row; `RequestBuilderView.ts:113-120` contains the three controls. |
| `url-input` | Curate | Locate the selected request URL editor; `RequestBuilderView.ts:212` writes model request state, and the facade exposes the copied full URL. |

The curated count is therefore **21**. Every repeated declaration (`kv-row-key`,
`kv-row-value`, `kv-row-delete`, `form-data-key`, `form-data-value`, `form-data-delete`,
`form-data-browse`, and `form-data-type-toggle`) must say “once per row” in its purpose/help. Since
these names can match multiple header, form-urlencoded, or multipart rows, `createElements` must
receive `highlightOptions: { all: true }`; the result's `count` is the total match count and
`highlighted` is the number of rings. No repeated selector identifies a particular row or supplies
an index for an action.

The five panel-owned names are deliberately not duplicated: `rest-secondary-view`,
`rest-panel-pane`, `rest-client-tree`, `rest-tree-add`, and `rest-tree-root-label` all land under
`page.panels` in US-1323, per EPIC-086 decision 8 and EPIC-087 decision 10. They do not belong in
`page.editor.elements`; this task only cross-references that ownership in `$help`.

### 2. Create and register the facade with page scope

Create `src/renderer/scripting/api-wrapper/RestClientEditorFacade.ts`, importing `RestClientEditor`,
the REST model types, `IAiMember`/`IAiVisible`/`IAiVisionDescriptor`, `ui`, `createElements`, and
`activatePageAndWaitForLayout`/`pageScopeSelector`. Preserve `id` and `name` and use the following
shape, with the 21 declarations and REST members supplied by the implementation:

Before (the relevant current `PageWrapper` behavior):

```ts
const factory = editor ? FACADE_FOR_EDITOR[id] : undefined;
return factory ? factory(editor, id, name) : new GenericEditorFacade(id, name);
```

After (new facade descriptor shape):

```ts
get aiVision(): IAiVisionDescriptor {
    const pageId = this.editor.page?.id;
    const elements = createElements(REST_CLIENT_ELEMENTS, ui.highlightElement.bind(ui), {
        scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
        beforeHighlight: pageId
            ? () => activatePageAndWaitForLayout(pageId)
            : undefined,
        highlightOptions: { all: true },
    });
    return {
        kind: "RestClientEditor",
        summary: "REST client request and response facade.",
        members: [...REST_CLIENT_MEMBERS, ...elements.members],
        help: REST_CLIENT_HELP,
        elements: REST_CLIENT_ELEMENTS,
        provide: elements.provide,
        summarize: () => ({
            kind: "RestClientEditor",
            id: this.id,
            name: this.name,
            requestCount: this.requests?.length,
            selectedRequestId: this.selectedRequestId,
            hasResponse: this.editor.page ? this.response !== undefined : undefined,
        }),
    };
}
```

The `summarize()` values must not include request/header/body/response values. With an attached
page, selectors resolve below `[data-page-id="<page id>"]`; highlighting activates the page and
waits for its rendered slot. Detached fallback behavior follows the established facade pattern,
but all host-backed getters and actions use the absent-value/guard rules below.

Update `FACADE_FOR_EDITOR` and its private factory union in
`src/renderer/scripting/api-wrapper/PageWrapper.ts:24-70`:

```ts
import { RestClientEditor } from "../../editors/rest-client/RestClientEditor";
import { RestClientEditorFacade } from "./RestClientEditorFacade";

type EditorFacade =
    | TextEditorFacade | GridEditorFacade | NotebookEditorFacade | RestClientEditorFacade
    // existing facade types...

const FACADE_FOR_EDITOR: Record<string, EditorFacadeFactory> = {
    // existing entries...
    "rest-client": (editor, id, name) =>
        new RestClientEditorFacade(editor as RestClientEditor, id, name),
};
```

This is the only `PageWrapper` change. The dashboard entry and the EPIC-087 task link already
exist and must not be edited.

### 3. Add the canonical, self-contained public typing

Create `src/renderer/api/types/rest-client-editor.d.ts` as a leaf declaration file. It must define
the public REST snapshot interfaces itself rather than import a renderer model type. The planned
shape is:

```ts
export type IRestBodyType = "none" | "form-urlencoded" | "raw" | "binary" | "form-data";
export type IRestRawLanguage = "plaintext" | "json" | "javascript" | "html" | "xml";

export interface IRestHeaderSnapshot {
    readonly key: string;
    readonly value: string;
    readonly enabled: boolean;
}

export interface IRestFormDataEntrySnapshot {
    readonly key: string;
    readonly value: string;
    readonly type: "text" | "file";
    readonly enabled: boolean;
}

export interface IRestRequest {
    readonly id: string;
    readonly name: string;
    readonly collection: string;
    readonly method: string;
    readonly url: string;
    readonly headers: IRestHeaderSnapshot[];
    readonly body: string;
    readonly bodyType: IRestBodyType;
    readonly bodyLanguage: IRestRawLanguage;
    readonly formData: IRestHeaderSnapshot[];
    readonly binaryFilePath: string;
    readonly formDataEntries: IRestFormDataEntrySnapshot[];
}

export interface IRestResponse {
    readonly status: number;
    readonly statusText: string;
    readonly headers: IRestHeaderSnapshot[];
    readonly body: string;
    readonly isBinary?: boolean;
    readonly contentType?: string;
    readonly size: string;
}

export interface IRestClientEditor {
    readonly id: "rest-client";
    readonly name: string;
    readonly requests: IRestRequest[] | undefined;
    readonly selectedRequestId: string | undefined;
    readonly selectedRequest: IRestRequest | undefined;
    readonly response: IRestResponse | undefined;
    readonly responseTime: number | undefined;
    readonly executing: boolean | undefined;
    readonly headersJsonInvalid: boolean | undefined;
    readonly error: string | undefined;

    selectRequest(id: string): void;
    addRequest(name?: string, collection?: string): IRestRequest;
    deleteRequest(id: string): void;
    deleteCollection(collectionName: string): void;
    renameRequest(id: string, name: string): void;
    updateRequestCollection(id: string, collection: string): void;
    moveRequest(fromId: string, toId: string, newCollection?: string): void;
    setRequestMethod(id: string, method: string): void;
    setRequestUrl(id: string, url: string): void;
    setBodyType(id: string, bodyType: IRestBodyType): void;
    setBodyLanguage(id: string, language: IRestRawLanguage): void;
    setHeaderKey(id: string, index: number, key: string): void;
    toggleHeader(id: string, index: number): void;
    deleteHeader(id: string, index: number): void;
    setFormDataKey(id: string, index: number, key: string): void;
    toggleFormData(id: string, index: number): void;
    deleteFormData(id: string, index: number): void;
    setFormDataEntryKey(id: string, index: number, key: string): void;
    toggleFormDataEntry(id: string, index: number): void;
    setFormDataEntryType(id: string, index: number, type: "text" | "file"): void;
    deleteFormDataEntry(id: string, index: number): void;
    send(): Promise<void>;
}
```

The exact public snapshot fields will be kept identical between the facade and declaration.
`IRestHeaderSnapshot` exposes copied `key`, `value`, and `enabled` fields. Form snapshots expose
the copied key, value, enabled, and type fields needed by their source model. `IRestRequest`
exposes id/name/collection/method, the full `url`, body type and language, the full `body` and
`binaryFilePath`, and copied header/form arrays including their values. `IRestResponse` exposes
status, status text, body, binary flag, content type, a display-compatible size, and copied
response headers including their values. These are the values already visible in the editor and
also reachable through the page's raw `content`; this facade does not claim to provide a secret
boundary.

Add the import and union member to `src/renderer/api/types/page.d.ts:1-36`:

Before:

```ts
import type { INotebookEditor } from "./notebook-editor";
export type IEditorFacade =
    | ITextEditor | IGridEditor | INotebookEditor | ILinkEditor /* ... */;
```

After:

```ts
import type { INotebookEditor } from "./notebook-editor";
import type { IRestClientEditor } from "./rest-client-editor";
export type IEditorFacade =
    | ITextEditor | IGridEditor | INotebookEditor | IRestClientEditor | ILinkEditor /* ... */;
```

`assets/editor-types/` is a flat generated copy. `vite.renderer.config.ts:8-65` shows
`editorTypesPlugin()` copying every canonical `.d.ts` into that directory and regenerating
`_imports.txt`; the generated `assets/editor-types/rest-client-editor.d.ts` must never be
hand-edited.

### 4. Expose copied state and complete the absent-value audit

Implement small snapshot helpers in `RestClientEditorFacade.ts`. Every getter must check
`this.editor.page` before treating model state as attached, find the selected request from the
model, construct new arrays and nested objects, and never return a live `state.data.requests`,
`RestRequest`, `RestHeader`, `FormDataEntry`, `response`, or response-header array. Reading is not
a security boundary on this surface: `rest-client` has `hasContentHost: true` at
`register-editors.ts:160`, so the same page's `content` already returns the raw `.rest.json` text.
Expose the values the user sees, copied into fresh public objects:

- `RestRequest.headers[*]` exposes copied `key`, `value`, and `enabled` fields. `COMMON_HEADERS` at
  `httpConstants.ts:3-35` is only the autocomplete list of common HTTP names; it is not a sensitive
  header list, and no such list exists in this codebase.
- `RestRequest.formData[*]` and `formDataEntries[*]` expose copied keys, values, enabled flags, and
  entry types. A raw `body` and `binaryFilePath` are also exposed as copied model values.
- `RestRequest.url` is exposed in full, including any userinfo, path, or query text. The model has
  no stored-variable map or interpolation service, so no separate variable surface is invented.
- `RestResponse.headers[*]` exposes copied key, value, and enabled fields, including values that
  may be `Set-Cookie` or token-bearing; `RestResponse.body` is returned as a copied string as user
  data. `status`, `statusText`, `contentType`, `isBinary`, response size, and timing mirror what
  `ResponseViewerView` displays.

Use `response.body` to calculate the displayed size without querying the view: text uses the same
`Blob` byte length as `ResponseViewerView.ts:201-210`; binary uses decoded byte size consistent
with the response's base64 representation. Keep the public size as a string if matching
`formatResponseSize()` at `ResponseViewerView.ts:501-508`, or document a numeric byte field plus
the formatted value; do not use `0`, `""`, `null`, or `false` for an absent response.

The getter audit is mandatory because `strictNullChecks` is disabled. `EditorModel.page` is the
only general detached-host signal (`src/renderer/editors/base/EditorModel.ts:64-67`). The
implementation must preserve these exact semantics:

| Getter | Attached page with no selected request / no response | Detached editor (`page === null`) |
| --- | --- | --- |
| `requests` | Fresh real array; empty collection is `[]`. | `undefined`. |
| `selectedRequestId` | `undefined` when model selection is the empty sentinel; otherwise the selected id. | `undefined`. |
| `selectedRequest` | `undefined` when no request is selected; otherwise a fresh copied snapshot. | `undefined`. |
| `response` | `undefined` until a response exists; otherwise a fresh copied snapshot including header values and body. | `undefined`. |
| `responseTime` | `undefined` until a response exists; a real response may legitimately have `0` milliseconds. | `undefined`. |
| `executing` | `undefined` when no request is selected; otherwise the real model boolean, including `false` before/after sending. | `undefined`. |
| `headersJsonInvalid` | `undefined` when no request is selected; otherwise the real model boolean. | `undefined`. |
| `error` | The actual parse-error message when present, otherwise `undefined`; selection does not turn success into a sentinel. | `undefined`. |

An attached page with requests but no selected request reports `requests: []` only when the
collection itself is empty; a non-empty attached collection reports its real request snapshots and
`selectedRequest === undefined`. No attached-empty value is fabricated as an absence: arrays are
`[]`, strings such as request names/collections are real strings, and booleans are real state. Only
the three genuine absence cases above produce `undefined`: no host, no selected request, or no
response yet. All returned arrays/objects, including nested header/form arrays, are fresh copies.

The descriptor must state the same in `$help`, including that `restricted()` is **not** used on
this facade. The data is already reachable through `page.content`, so hiding this facade node
would withhold nothing while breaking the surface. A genuine credential boundary would have to
be page-level and cover `content` and `editor` together; this task does not invent that broader
policy.

### 5. Add only model-backed actions; decide `send`

The facade action wrappers must guard `this.editor.page` and throw a diagnostic such as
`REST client action unavailable: no page host attached.` before mutating or sending. A
request-targeted action must also validate the requested id and throw a clear missing-request
diagnostic rather than silently claiming success. Forward valid operations to the existing model
methods; do not query a view, its local component model, Monaco, clipboard, or menu.

| Facade action | Existing model path | Caution / decision |
| --- | --- | --- |
| `selectRequest(id)` | `RestClientEditor.selectRequest()` at `RestClientEditor.ts:304-320`. | Changes current selection only. |
| `addRequest(name?, collection?)` | `addRequest()` at `:322-340`; returns a newly mapped copied snapshot. | `adds REST request data`. |
| `deleteRequest(id)` | `deleteRequest()` at `:342-358`. | `deletes REST request data`. |
| `deleteCollection(collectionName)` | `deleteCollection()` at `:382-401`. | `deletes all REST requests in a collection`. |
| `renameRequest(id, name)` | `renameRequest()` at `:360-369`. | `changes REST request data`. |
| `updateRequestCollection(id, collection)` | `updateRequestCollection()` at `:371-380`. | `changes REST request data`. |
| `moveRequest(fromId, toId, newCollection?)` | `moveRequest()` at `:403-425`; the sidebar uses this model path at `RestRequestTreeView.ts:252-277`. | `reorders/changes REST request data`. |
| `setRequestMethod(id, method)` | Narrow `{ method }` call to `updateRequest()` at `:427-450`, matching the method menu at `RequestBuilderView.ts:243`. | `changes REST request data`; no raw request payload. |
| `setRequestUrl(id, url)` | Narrow `{ url }` call to `updateRequest()` at `:427-450`, matching `urlProps()` at `RequestBuilderView.ts:212`. | `changes REST request target`; it is not an auth/token setter, and the value-setting argument is not echoed by this action. |
| `setBodyType(id, bodyType)` | `updateBodyType()` at `:454-472`, matching `body-type-select` at `RequestBuilderView.ts:215`. | `changes REST request data`; it does not accept a body value. |
| `setBodyLanguage(id, language)` | `updateBodyLanguage()` at `:474-477`, matching the body-language menu at `RequestBuilderView.ts:240,244`. | `changes REST request metadata`. |
| `setHeaderKey/toggleHeader/deleteHeader` | `updateHeader()`, `toggleHeader()`, `deleteHeader()` at `:516-541`; the table callbacks are `RequestBuilderView.ts:254-260`. | Key/toggle/delete are model writes; no header-value setter. Each write is cautioned. |
| `setFormDataKey/toggleFormData/deleteFormData` | `updateFormData()`, `toggleFormData()`, `deleteFormData()` at `:545-581`; callbacks are `RequestBuilderView.ts:304-312`. | Key/toggle/delete writes do not accept a value. Each write is cautioned. |
| `setFormDataEntryKey/toggleFormDataEntry/setFormDataEntryType/deleteFormDataEntry` | `updateFormDataEntry()`, `toggleFormDataEntry()`, `deleteFormDataEntry()` at `:585-620`; row callbacks are `RequestBuilderView.ts:351-355`. | Key/toggle/type/delete writes do not accept a value; switching type clears the old value. Each write is cautioned. |
| `send()` | `RestClientEditor.sendRequest()` at `:655-776`, the same method wired to `rest-send` at `RequestBuilderView.ts:213`. | Expose it as `async send(): Promise<void>` with a strong caution: it sends the user's real headers/body and visible credentials to the user's real service. It returns no response object or body; await completion, then read the copied `response` snapshot. |

Do not expose `updateRequest(id, changes)` because its `Partial<RestRequest>` argument could carry
raw headers, body, form values, binary paths, or other credentials. Do not expose
`setHeaderValue`, `setBody`, or `setFormDataValue`, and do not expose value setters,
`pasteRequest(clipboardText)` (`RestClientEditor.ts:625-646`), header/request/response copy
actions, or request serialization. A member that accepts a credential writes a new copy into its
call arguments and the MCP transcript, where the secret was not before; reading a value already
visible in the editor and already returned by `page.content` is a different act. The no-value-setter
rule is therefore deliberate, not a claim that reads are unavailable. Do not expose `focus()`
(`RestClientEditor.ts:122-124`): it sends a queue event to
a view and can silently target an unmounted view. Do not expose response open/save actions or
response language/tab actions as methods: their state and handlers live in
`ResponseViewerModel`/`ResponseViewerView` (`ResponseViewerView.ts:62-90,383-403`), not in the
editor model. They remain element locations where useful, but no facade method reaches into the
view.

`send()` is intentionally exposed despite its network effect because it is already a direct
editor-model operation, not a view-only callback. It is asynchronous (`sendRequest` awaits dynamic
fetch/body work), returns `Promise<void>`, clears the prior response while executing, and stores a
success or error response in model state (`RestClientEditor.ts:665-776`). Its caution must state
that the operation is external and sends the credentials visible in this surface to the user's
real service. A response result is never returned from the action; read the copied `response`
snapshot after completion, including its response-header values.

### 6. Help and descriptor completeness

`REST_CLIENT_HELP` must document:

- the `page.editor.id === "rest-client"` narrowing and the 21 curated names;
- page-scoped `elements`/`highlight`, including `highlightOptions: { all: true }` and repeated-row
  `count`/`highlighted` semantics;
- `rest-secondary-view`, `rest-panel-pane`, `rest-client-tree`, `rest-tree-add`, and
  `rest-tree-root-label` as `page.panels`/US-1323 controls, not editor controls;
- selected request/response visibility and every detached/no-selection/no-response result from the
  audit;
- the full `.rest.json` contents, credentials included, are also readable through `page.content`;
  the facade exposes copied URL, request header/form values, body, binary path, response body, and
  response-header values, with no stored-variable surface in the current model;
- no `setHeaderValue`, `setBody`, `setFormDataValue`, generic `updateRequest`, or paste action
  accepts credentials: doing so would put a new
  secret copy in call arguments and the MCP transcript, while reading existing values from the
  editor or `page.content` does not;
- safe copies rather than live arrays/objects;
- `send()`'s real-network caution, asynchronous `Promise<void>` result, and the requirement to read
  the copied response afterward;
- omitted generic updates, clipboard/serialization, paste, focus, and view-local actions with the
  model/secret/unmounted-view reason.

Before adding any new name to the UI, inspect every lifecycle call site. UIKit views delete
`data-name` whenever a later `update()` omits `name` (for example `ButtonView.ts:101-102` and
`panel-style.ts:309-331`). This warning is recorded because US-1318 shipped the same defect and
live testing caught it. The current plan adds no names, but if implementation discovers a missing
`data-name`, the `name` prop must be supplied at construction and at **every** update/re-render call
site for that view, including conditional branch and keyed-row updates. Never add it only once at
construction.

### 7. Verification and scope boundaries

After implementation, source review must confirm all 64 inventory decisions, all 21 declarations,
page scoping, `all: true`, full-value copy behavior, attached/empty/detached getter semantics,
model-only action forwarding, and the exact `data-type`/`data-name` preservation. Run typecheck,
lint, and the existing Vite type-copy path as appropriate; verify that the generated asset is
produced from `src/renderer/api/types/rest-client-editor.d.ts`. Unit tests, test harnesses, and
the dashboard are explicitly out of scope for this task.

## Concerns

- **Verified inventory count:** current source has 64 unique named controls and 75 raw occurrences;
  the structural `response-binary` and `response-binary-actions` names are included and omitted as
  structural roots. The implementation must retain this source-backed inventory.
- **Repeated selectors:** eight curated names repeat by row or conditional row branch. The facade
  must pass `highlightOptions: { all: true }`, document “once per row,” and never infer a row index
  from a selector. `visible` means at least one matching mounted row/control exists.
- **Page-level secret boundary:** Live verification found that `rest-client` has
  `hasContentHost: true` and the same page's `content` returns full `.rest.json` text, including
  URL query credentials, Authorization header values, and raw body values. The facade therefore
  exposes copied values the user sees and makes no protection claim; no member accepts a secret
  value. `restricted()` remains unused because hiding this node would withhold nothing while
  breaking the surface. If credentials must be withheld, a page-level boundary covering both
  `content` and `editor` is required and remains an unresolved epic-level decision.
- **Network action:** `send()` is model-backed and asynchronous but transmits the credentials
  visible in this surface to real services. It returns `Promise<void>` only, and response headers
  are copied on later reads. The caution is mandatory.
- **View-local state:** header/response display tabs, language overrides, split heights, clipboard
  actions, OS file dialogs, and focus are view/component concerns. They are either element-only
  locations or omitted, never facade methods. No action reaches a view or queues work against an
  unmounted view.
- **Absent values:** strict null checks are off. No selected request, no response, and no attached
  host must be hand-audited exactly as specified; real attached empty arrays/strings/booleans and a
  real zero-millisecond response must not be collapsed into absence sentinels.
- **Generated declarations:** `assets/editor-types/rest-client-editor.d.ts` is generated by
  `editorTypesPlugin()` and must not be hand-edited.
- **No tests or commit:** unit tests, test harnesses, dashboard edits, and commits are not part of
  this planning task; the explicitly requested epic concern is the only epic-file change.

## Acceptance Criteria

- [ ] `pages[i].editor` on a `rest-client` page returns `RestClientEditorFacade`, registered via
  `FACADE_FOR_EDITOR`, with preserved `id`/`name` identity metadata.
- [ ] The current source inventory contains 64 unique names/75 raw occurrences and every
  one is present in the table with a Curate/Omit decision and one-line source-backed reason.
- [ ] Exactly 21 controls are curated, all retain their existing names/types, and all resolve
  page-scoped selectors through `pageScopeSelector`.
- [ ] Repeated row controls say “once per row”; the facade passes `highlightOptions: { all: true }`
  and help explains `count` versus `highlighted`.
- [ ] The five REST sidebar names are absent from the editor facade and explicitly owned by
  `page.panels`/US-1323.
- [ ] State exposes collection/request/response information from verified model state only,
  returns fresh copies, and exposes full copied URL, request header/form values, body,
  `binaryFilePath`, response body, response headers, status, timing, size, and content type.
- [ ] The absent-value audit is implemented exactly: detached host, no selected request, and no
  response yet return `undefined` only where specified; attached empty arrays and genuine zero/
  empty/false values remain real values.
- [ ] No member accepts a password, token, body value, header value, or form value, and no stored
  variables are exposed. Reads may return credentials already visible in the editor and
  `page.content`; `restricted()` is unused because only a page-level boundary could withhold them.
- [ ] Model-backed request/collection/header/form/body metadata actions are exposed with cautions
  on writes; generic `updateRequest`, paste, clipboard/serialization, focus, and view-only actions
  are absent with reasons documented in help.
- [ ] `send()` is async `Promise<void>`, has a strong real-network caution, and leaves a fresh copied
  response snapshot as the response read path.
- [ ] `src/renderer/api/types/rest-client-editor.d.ts` is canonical and self-contained, and
  `src/renderer/api/types/page.d.ts` includes `IRestClientEditor`; generated assets are refreshed
  only by Vite.
- [ ] Any newly added `data-name` is supplied at every construction/update/re-render site; no
  existing `data-name` or `data-type` is renamed.
- [ ] No dashboard, unit test, test harness, hand-edited generated asset, user-documentation
  change, or commit is created by this task; the requested Needs user check is added to EPIC-087.

## Files Changed

| File | Planned change |
| --- | --- |
| `doc/tasks/US-1320-rest-client-surface/README.md` | This verified REST facade plan, 64-name curation table, absent-value audit, full-value exposure/boundary audit, action decisions, and acceptance criteria. |
| `doc/epics/EPIC-087.md` | Add the unresolved page-level REST credential-boundary question under Needs user check, with the live verification and explicit US-1320 assumption. |
| `src/renderer/scripting/api-wrapper/RestClientEditorFacade.ts` | New facade with 21 page-scoped elements, `all: true` highlighting, copied full-value state, model-backed actions, send caution, and complete help. |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | Import/register `RestClientEditorFacade` and add the `rest-client` factory entry. |
| `src/renderer/api/types/rest-client-editor.d.ts` | New self-contained public REST editor snapshots with full-value header/form/response shapes, state, and action declarations. |
| `src/renderer/api/types/page.d.ts` | Import `IRestClientEditor` and add it to `IEditorFacade`. |

Files intentionally needing **no changes**:

- `src/renderer/editors/rest-client/RestClientEditor.ts` - existing model state and methods cover
  the planned state/actions; no view bridge or model mutation is planned.
- `src/renderer/editors/rest-client/restClientTypes.ts` - existing source model types are read
  directly; public copied types live in the new canonical leaf declaration.
- `src/renderer/editors/rest-client/index.ts`, `RestClientBodyView.ts`, `RestClientShared.ts`,
  `RequestBuilderView.ts`, `ResponseViewerView.ts`, `KeyValueEditorView.ts`,
  `panels/RestPanelSecondaryView.ts`, and `panels/RestRequestTreeView.ts` - existing controls and
  model callbacks are sufficient; no existing name/type is renamed and no missing name is needed.
- `src/renderer/editors/register-editors.ts` - `rest-client` and `rest-panel` are already
  registered at `:74-78,160`.
- `src/renderer/scripting/api-wrapper/GenericEditorFacade.ts` - remains the fallback for editors
  without a facade.
- `src/renderer/scripting/api-wrapper/NotebookEditorFacade.ts` - exact page-scoped facade pattern
  and repeated-highlight precedent only; no notebook change belongs here.
- `src/renderer/scripting/ai-vision/elements.ts` and
  `src/renderer/scripting/ai-vision/page-elements.ts` - existing selector, visibility, page
  activation, and highlight infrastructure supplies the required behavior.
- `assets/agent/ui-highlight.js` - existing overlay already supports `all`, `count`, and
  `highlighted`; the facade must configure it rather than modify the asset.
- `src/renderer/uikit/Panel/panel-style.ts` and the UIKit primitive files - their current
  `data-name` update/delete contract is documented and must be respected, not changed here.
- `vite.renderer.config.ts` - existing `editorTypesPlugin()` already copies canonical declarations
  and regenerates `_imports.txt`.
- `assets/editor-types/rest-client-editor.d.ts` and `assets/editor-types/_imports.txt` - generated
  output; never hand-edit.
- `doc/active-work.md` - the dashboard entry already exists; the user explicitly said not to change
  it. `doc/epics/EPIC-087.md` is listed above because this task adds the explicitly requested
  Needs user check.
- Unit tests and test harnesses - explicitly out of scope.
- `docs/**` and release notes - no user-facing documentation change is requested in this planning
  task.

import type {
    IRestBodyType,
    IRestClientEditor,
    IRestFormDataEntrySnapshot,
    IRestHeaderSnapshot,
    IRestRawLanguage,
    IRestRequest,
    IRestResponse,
} from "../../api/types/rest-client-editor";
import type { RestClientEditor } from "../../editors/rest-client/RestClientEditor";
import type {
    BodyType,
    FormDataEntry,
    RawLanguage,
    RestHeader,
    RestRequest,
    RestResponse,
} from "../../editors/rest-client/restClientTypes";
import { ui } from "../../api/ui";
import { createElements } from "../ai-vision/elements";
import { activatePageAndWaitForLayout, pageScopeSelector } from "../ai-vision/page-elements";
import type { IAiElementDeclaration, IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";

const REST_CLIENT_ELEMENTS: readonly IAiElementDeclaration[] = [
    { name: "body-language", purpose: "Choose the raw request body language." },
    { name: "body-type-select", purpose: "Choose the selected request body type." },
    { name: "form-data-browse", purpose: "Browse for a multipart file value; this conditional control occurs once per file row and has no facade action." },
    { name: "form-data-delete", purpose: "Delete a multipart row; this conditional control occurs once per non-empty row." },
    { name: "form-data-key", purpose: "Edit a multipart field name; this control occurs once per row." },
    { name: "form-data-type-toggle", purpose: "Toggle a multipart row between text and file; this control occurs once per row." },
    { name: "form-data-value", purpose: "Locate a visible multipart text value; this control occurs once per text row and has no value-setting facade action." },
    { name: "headers-view", purpose: "Switch the request headers between table and JSON presentation." },
    { name: "kv-row-delete", purpose: "Delete a header or form-urlencoded row; this control occurs once per row." },
    { name: "kv-row-key", purpose: "Edit a header or form-urlencoded key; this control occurs once per row." },
    { name: "kv-row-value", purpose: "Locate a visible header or form-urlencoded value; this control occurs once per row and has no value-setting facade action." },
    { name: "method-label", purpose: "Choose the selected request HTTP method." },
    { name: "request-delete", purpose: "Delete the selected request." },
    { name: "request-header-collection", purpose: "Edit the selected request collection name." },
    { name: "request-header-name", purpose: "Rename the selected request." },
    { name: "response-headers-view", purpose: "Switch the response headers between table and JSON presentation." },
    { name: "response-language", purpose: "Choose a response language override; the override is local to the response view." },
    { name: "response-open-in-tab", purpose: "Open the displayed response in a new editor tab; this is a view-owned action." },
    { name: "response-tab-select", purpose: "Switch between the response body and headers." },
    { name: "rest-send", purpose: "Send the selected request to its real service; this operation is asynchronous and network-affecting." },
    { name: "url-input", purpose: "Locate and edit the selected request URL." },
];

const REST_CLIENT_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The concrete current editor id: rest-client." },
    { name: "name", kind: "property", summary: "The editor's registry display name." },
    { name: "requests", kind: "property", summary: "All REST requests as fresh copied snapshots, or undefined without an attached page host." },
    { name: "selectedRequestId", kind: "property", summary: "The selected request id, or undefined without a selection or attached page host." },
    { name: "selectedRequest", kind: "property", summary: "The selected REST request as a fresh copied snapshot, or undefined without a selection or attached page host." },
    { name: "response", kind: "property", summary: "The selected request response as a fresh copied snapshot, or undefined before a response or without an attached page host." },
    { name: "responseTime", kind: "property", summary: "Response time in milliseconds, including a real zero, or undefined before a response or without an attached page host." },
    { name: "executing", kind: "property", summary: "Whether the selected request is executing, or undefined without a selected request or attached page host." },
    { name: "headersJsonInvalid", kind: "property", summary: "Whether the selected request's JSON headers editor is invalid, or undefined without a selected request or attached page host." },
    { name: "error", kind: "property", summary: "The REST collection parse error, or undefined when parsing succeeded or without an attached page host." },
    { name: "selectRequest", kind: "method", signature: "selectRequest(id: string): void", summary: "Select a request by id; the id must exist." },
    { name: "addRequest", kind: "method", signature: "addRequest(name?: string, collection?: string): IRestRequest", summary: "Add REST request data and return its copied snapshot.", caution: "adds REST request data" },
    { name: "deleteRequest", kind: "method", signature: "deleteRequest(id: string): void", summary: "Delete a REST request by id.", caution: "deletes REST request data" },
    { name: "deleteCollection", kind: "method", signature: "deleteCollection(collectionName: string): void", summary: "Delete all REST requests in a collection.", caution: "deletes REST request data" },
    { name: "renameRequest", kind: "method", signature: "renameRequest(id: string, name: string): void", summary: "Rename a REST request.", caution: "changes REST request data" },
    { name: "updateRequestCollection", kind: "method", signature: "updateRequestCollection(id: string, collection: string): void", summary: "Change a REST request collection.", caution: "changes REST request data" },
    { name: "moveRequest", kind: "method", signature: "moveRequest(fromId: string, toId: string, newCollection?: string): void", summary: "Reorder or move a REST request.", caution: "reorders/changes REST request data" },
    { name: "setRequestMethod", kind: "method", signature: "setRequestMethod(id: string, method: string): void", summary: "Change a REST request method without accepting a payload.", caution: "changes REST request data" },
    { name: "setRequestUrl", kind: "method", signature: "setRequestUrl(id: string, url: string): void", summary: "Change a REST request target URL.", caution: "changes REST request target" },
    { name: "setBodyType", kind: "method", signature: "setBodyType(id: string, bodyType: IRestBodyType): void", summary: "Change a REST request body type without accepting a body value.", caution: "changes REST request data" },
    { name: "setBodyLanguage", kind: "method", signature: "setBodyLanguage(id: string, language: IRestRawLanguage): void", summary: "Change raw REST request body metadata.", caution: "changes REST request metadata" },
    { name: "setHeaderKey", kind: "method", signature: "setHeaderKey(id: string, index: number, key: string): void", summary: "Change a request header key without accepting its value.", caution: "changes REST request data" },
    { name: "toggleHeader", kind: "method", signature: "toggleHeader(id: string, index: number): void", summary: "Toggle a request header's enabled state.", caution: "changes REST request data" },
    { name: "deleteHeader", kind: "method", signature: "deleteHeader(id: string, index: number): void", summary: "Delete a request header row.", caution: "changes REST request data" },
    { name: "setFormDataKey", kind: "method", signature: "setFormDataKey(id: string, index: number, key: string): void", summary: "Change a form-urlencoded key without accepting its value.", caution: "changes REST request data" },
    { name: "toggleFormData", kind: "method", signature: "toggleFormData(id: string, index: number): void", summary: "Toggle a form-urlencoded row's enabled state.", caution: "changes REST request data" },
    { name: "deleteFormData", kind: "method", signature: "deleteFormData(id: string, index: number): void", summary: "Delete a form-urlencoded row.", caution: "changes REST request data" },
    { name: "setFormDataEntryKey", kind: "method", signature: "setFormDataEntryKey(id: string, index: number, key: string): void", summary: "Change a multipart key without accepting its value.", caution: "changes REST request data" },
    { name: "toggleFormDataEntry", kind: "method", signature: "toggleFormDataEntry(id: string, index: number): void", summary: "Toggle a multipart row's enabled state.", caution: "changes REST request data" },
    { name: "setFormDataEntryType", kind: "method", signature: "setFormDataEntryType(id: string, index: number, type: \"text\" | \"file\"): void", summary: "Change a multipart row type without accepting its value; switching type clears the old value in the model.", caution: "changes REST request data" },
    { name: "deleteFormDataEntry", kind: "method", signature: "deleteFormDataEntry(id: string, index: number): void", summary: "Delete a multipart row.", caution: "changes REST request data" },
    { name: "send", kind: "method", signature: "send(): Promise<void>", summary: "Send the selected request and leave its copied response snapshot available afterward.", caution: "sends the user's real headers/body and visible credentials to the user's real service" },
];

const REST_CLIENT_HELP = `Access via pages[i].editor after narrowing page.editor.id to "rest-client".
This page-scoped facade exposes copied REST collection, selected-request, and response state.
The curated editor controls are exposed through the members and elements below this page; inspect
their summaries for the live operation and selector contract. Conditional controls are visible only
while their matching mounted row or view branch exists.

elements resolves selectors below this page's [data-page-id] scope. highlight activates this page,
waits for its rendered layout, and passes highlightOptions: { all: true }; repeated controls therefore
ring every matching mounted row. A result's count is the total matching controls and highlighted is
the number of rings drawn by the overlay. A repeated selector does not identify a row or provide an
index for an action.

On an attached page, requests is always a fresh array of copied request snapshots; an empty
collection is []. selectedRequestId and selectedRequest are undefined when the model has no selected
request. response and responseTime are undefined until a response exists; a real zero response time
remains 0. executing and headersJsonInvalid are undefined without a selected request, otherwise they
return the real model booleans, including false. error returns the actual parse error when present,
otherwise undefined. Every getter returns undefined when editor.page is null. All objects and nested
header/form arrays are fresh copies.

Request snapshots include the full URL, method, collection, raw body, binaryFilePath, body type and
language, and copied header/form keys, values, enabled flags, and multipart entry types. Response
snapshots include copied response-header values, status, statusText, body, binary flag, content type,
formatted byte size, and response timing is exposed separately. The full .rest.json content,
including credentials, is also readable through page.content. The model has no stored-variable map,
so no stored-variable surface is invented. This facade uses no restricted() boundary because hiding
it would not hide the same data already available through page.content; a genuine credential boundary
would have to cover the page's content and editor together.

To create REST content through the page path, use a JSON root of
{ type: "rest-client", requests: [...] }. Each request needs a unique id; collection groups
requests, bodyType is "none", "raw", "form-urlencoded", "binary", or "form-data" for the
documented request model, and .rest.json is the required title suffix for the Rest Client switch.
Use send() deliberately: it sends the selected request's real headers and body to the real service.

Actions are model-backed and do not query views, Monaco, menus, or the clipboard. Request-targeted
actions validate that the id exists and throw a diagnostic otherwise. No action accepts a password,
token, header value, body value, or form value: setHeaderValue, setBody, setFormDataValue, generic
updateRequest, paste, clipboard/serialization, focus, and view-local response actions are omitted.
Accepting a secret would create a new copy in call arguments and the MCP transcript; reading existing
values already visible in the editor or page.content does not. Element-only response controls remain
locations because their state and handlers belong to view-local models.

send() is asynchronous and returns Promise<void>, never a response object or body. It sends the user's
real headers/body and visible credentials to the user's real service, clears the prior response while
executing, and leaves a copied response snapshot to read after awaiting completion.
`;

export class RestClientEditorFacade implements IAiVisible, IRestClientEditor {
    constructor(
        private readonly editor: RestClientEditor,
        readonly id: "rest-client",
        readonly name: string,
    ) {}

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

    get requests(): IRestRequest[] | undefined {
        if (!this.isAttached()) return undefined;
        return this.editor.state.get().data.requests.map(mapRequest);
    }

    get selectedRequestId(): string | undefined {
        if (!this.isAttached()) return undefined;
        return this.editor.state.get().selectedRequestId || undefined;
    }

    get selectedRequest(): IRestRequest | undefined {
        if (!this.isAttached()) return undefined;
        const request = this.editor.selectedRequest;
        return request ? mapRequest(request) : undefined;
    }

    get response(): IRestResponse | undefined {
        if (!this.isAttached()) return undefined;
        const response = this.editor.state.get().response;
        return response ? mapResponse(response) : undefined;
    }

    get responseTime(): number | undefined {
        if (!this.isAttached()) return undefined;
        const state = this.editor.state.get();
        return state.response ? state.responseTime : undefined;
    }

    get executing(): boolean | undefined {
        if (!this.isAttached() || !this.editor.selectedRequest) return undefined;
        return this.editor.state.get().executing;
    }

    get headersJsonInvalid(): boolean | undefined {
        if (!this.isAttached() || !this.editor.selectedRequest) return undefined;
        return this.editor.state.get().headersJsonInvalid;
    }

    get error(): string | undefined {
        return this.isAttached() ? this.editor.state.get().error : undefined;
    }

    selectRequest(id: string): void {
        this.requireRequest(id);
        this.editor.selectRequest(id);
    }

    addRequest(name?: string, collection?: string): IRestRequest {
        this.requireAttached();
        return mapRequest(this.editor.addRequest(name, collection));
    }

    deleteRequest(id: string): void {
        this.requireRequest(id);
        this.editor.deleteRequest(id);
    }

    deleteCollection(collectionName: string): void {
        this.requireAttached();
        this.editor.deleteCollection(collectionName);
    }

    renameRequest(id: string, name: string): void {
        this.requireRequest(id);
        this.editor.renameRequest(id, name);
    }

    updateRequestCollection(id: string, collection: string): void {
        this.requireRequest(id);
        this.editor.updateRequestCollection(id, collection);
    }

    moveRequest(fromId: string, toId: string, newCollection?: string): void {
        this.requireRequest(fromId);
        this.requireAttached();
        this.editor.moveRequest(fromId, toId, newCollection);
    }

    setRequestMethod(id: string, method: string): void {
        this.requireRequest(id);
        this.editor.updateRequest(id, { method });
    }

    setRequestUrl(id: string, url: string): void {
        this.requireRequest(id);
        this.editor.updateRequest(id, { url });
    }

    setBodyType(id: string, bodyType: IRestBodyType): void {
        this.requireRequest(id);
        this.editor.updateBodyType(id, bodyType as BodyType);
    }

    setBodyLanguage(id: string, language: IRestRawLanguage): void {
        this.requireRequest(id);
        this.editor.updateBodyLanguage(id, language as RawLanguage);
    }

    setHeaderKey(id: string, index: number, key: string): void {
        this.requireRequest(id);
        this.editor.updateHeader(id, index, { key });
    }

    toggleHeader(id: string, index: number): void {
        this.requireRequest(id);
        this.editor.toggleHeader(id, index);
    }

    deleteHeader(id: string, index: number): void {
        this.requireRequest(id);
        this.editor.deleteHeader(id, index);
    }

    setFormDataKey(id: string, index: number, key: string): void {
        this.requireRequest(id);
        this.editor.updateFormData(id, index, { key });
    }

    toggleFormData(id: string, index: number): void {
        this.requireRequest(id);
        this.editor.toggleFormData(id, index);
    }

    deleteFormData(id: string, index: number): void {
        this.requireRequest(id);
        this.editor.deleteFormData(id, index);
    }

    setFormDataEntryKey(id: string, index: number, key: string): void {
        this.requireRequest(id);
        this.editor.updateFormDataEntry(id, index, { key });
    }

    toggleFormDataEntry(id: string, index: number): void {
        this.requireRequest(id);
        this.editor.toggleFormDataEntry(id, index);
    }

    setFormDataEntryType(id: string, index: number, type: "text" | "file"): void {
        this.requireRequest(id);
        this.editor.updateFormDataEntry(id, index, { type });
    }

    deleteFormDataEntry(id: string, index: number): void {
        this.requireRequest(id);
        this.editor.deleteFormDataEntry(id, index);
    }

    async send(): Promise<void> {
        this.requireAttached();
        await this.editor.sendRequest();
    }

    private isAttached(): boolean {
        return this.editor.page !== null;
    }

    private requireAttached(): void {
        if (!this.isAttached()) {
            throw new Error("REST client action unavailable: no page host attached.");
        }
    }

    private requireRequest(id: string): RestRequest {
        this.requireAttached();
        const request = this.editor.state.get().data.requests.find(item => item.id === id);
        if (!request) {
            throw new Error(`REST client request unavailable: no request with id ${JSON.stringify(id)}.`);
        }
        return request;
    }
}

function mapHeader(header: RestHeader): IRestHeaderSnapshot {
    return { key: header.key, value: header.value, enabled: header.enabled };
}

function mapFormDataEntry(entry: FormDataEntry): IRestFormDataEntrySnapshot {
    return { key: entry.key, value: entry.value, type: entry.type, enabled: entry.enabled };
}

function mapRequest(request: RestRequest): IRestRequest {
    return {
        id: request.id,
        name: request.name,
        collection: request.collection,
        method: request.method,
        url: request.url,
        headers: request.headers.map(mapHeader),
        body: request.body,
        bodyType: request.bodyType,
        bodyLanguage: request.bodyLanguage,
        formData: request.formData.map(mapHeader),
        binaryFilePath: request.binaryFilePath,
        formDataEntries: request.formDataEntries.map(mapFormDataEntry),
    };
}

function mapResponse(response: RestResponse): IRestResponse {
    const bytes = response.isBinary
        ? Math.floor(response.body.length * 3 / 4)
        : new Blob([response.body]).size;
    return {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers.map(mapHeader),
        body: response.body,
        size: formatResponseSize(bytes),
        ...(response.isBinary === undefined ? {} : { isBinary: response.isBinary }),
        ...(response.contentType === undefined ? {} : { contentType: response.contentType }),
    };
}

function formatResponseSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

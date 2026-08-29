import { TComponentState } from "../../core/state/state";
import type { EditorStateBase } from "../base/EditorModel";
import { TextHostEditorModel } from "../base/TextHostEditorModel";
import { ComponentQueue } from "../../core/state/ComponentQueue";
import { TextFileModel } from "../text/TextEditorModel";
import { debounce, errMessage } from "../../../shared/utils";
import {
    BodyType,
    CachedResponse,
    FormDataEntry,
    RawLanguage,
    RestClientData,
    RestHeader,
    RestRequest,
    RestResponse,
    createDefaultRequest,
} from "./restClientTypes";

export type RestClientQueueEvent = { type: "focus" };
export type RestClientQueueRequest = never;

/** HS1 host-slot shape — the per-window UI field rides
 *  `host.editorSettings["rest-client"]`. Survives Rest Client ↔ Monaco
 *  switches AND app restarts. Replaces today's `<host.id>:rest-client`
 *  selection cache file. */
interface RestClientViewSettings {
    selectedRequestId?: string;
}

export interface RestClientEditorState extends EditorStateBase {
    // HS1 — ride host.editorSettings["rest-client"]:
    selectedRequestId: string;
    // View-derived — present on state for reactivity, stripped from
    // getRestoreData. Recomputed from host content via loadData /
    // rebuilt from responseCache on selectRequest.
    data: RestClientData;
    error: string | undefined;
    response: RestResponse | null;
    responseTime: number;
    // Transient UI state — not persisted:
    executing: boolean;
    headersJsonInvalid: boolean;
}

export const defaultRestClientEditorState: RestClientEditorState = {
    id: "",
    title: "",
    modified: false,
    secondaryView: undefined,
    selectedRequestId: "",
    data: { type: "rest-client", requests: [] },
    error: undefined,
    response: null,
    responseTime: 0,
    executing: false,
    headersJsonInvalid: false,
};

// Content-Type mapping (verbatim from RestClientViewModel)
const LANGUAGE_CONTENT_TYPES: Record<RawLanguage, string> = {
    plaintext: "text/plain",
    json: "application/json",
    javascript: "application/javascript",
    html: "text/html",
    xml: "application/xml",
};

function isBinaryContentType(contentType: string): boolean {
    const ct = contentType.toLowerCase();
    if (ct.startsWith("text/")) return false;
    if (ct.includes("json")) return false;
    if (ct.includes("xml")) return false;
    if (ct.includes("javascript")) return false;
    if (ct.includes("css")) return false;
    if (ct.includes("html")) return false;
    if (ct.includes("yaml")) return false;
    if (ct.includes("form-urlencoded")) return false;
    if (ct.startsWith("image/") || ct.startsWith("audio/") || ct.startsWith("video/")) return true;
    if (ct.includes("octet-stream") || ct.includes("pdf") || ct.includes("zip") || ct.includes("gzip")) return true;
    return false;
}

// Single collections/requests panel (labeled "Rest"). Registered once in
// adoptHost, constant for the editor's life on the page. The base
// beforeNavigateAway clears it on navigate-away (Pattern-B; no survival
// override). The sidebar is mandatory-open per PageModel.sidebarMandatory.
const REST_PANELS = ["rest-panel"];

export class RestClientEditor extends TextHostEditorModel<RestClientEditorState, void, RestClientQueueEvent> {
    readonly editorId = "rest-client";
    protected readonly displayName = "Rest Client";

    private static readonly responseCacheName = "rest-client-responses";

    // RC4 — ref-equality marker for serialization skip.
    private lastSerializedData: RestClientData | null = null;

    // RC7 — in-memory response cache keyed by request ID. Restored from
    // `<host.id>:rest-client-responses` on adoptHost (RC18 fire-and-forget);
    // persisted via debounced 500ms write. Binary responses skip disk write
    // (verbatim from today's RestClientViewModel.sendRequest gate).
    private responseCache: Record<string, CachedResponse> = {};

    // Save debounces — today's 300ms / 500ms cadences preserved:
    private onDataChangedDebounced = debounce(() => this.onDataChanged(), 300);
    private saveResponseCacheDebounced = debounce(() => this.saveResponseCache(), 500);

    readonly typedQueue: ComponentQueue<RestClientQueueEvent, RestClientQueueRequest>;

    constructor(state: TComponentState<RestClientEditorState>) {
        super(state);
        this.typedQueue = this.queue as unknown as ComponentQueue<
            RestClientQueueEvent,
            RestClientQueueRequest
        >;
    }

    protected untitledName(): string {
        return "untitled.rest.json";
    }

    focus(): void {
        this.typedQueue.send({ type: "focus" });
    }

    // ── Host adoption ───────────────────────────────────────────────────

    adoptHost(host: TextFileModel): void {
        super.adoptHost(host);

        // (Panels contribution now runs after the base host attach — accepted
        // micro-difference from the pre-base ordering.)
        this.secondaryView = REST_PANELS;

        // RC4 + RC5 — re-parse on external content changes; the base's echo
        // guard prevents the loop from our own serialize-back writes.
        this.subscribeHostContent((content) => this.loadData(content));

        // HS1 — seed the selection field from host slot (sync, no flicker) and
        // mirror back. Slice-subscribe so the mirror fires on selection-slot
        // changes but NOT on data / response / executing / headersJsonInvalid
        // mutations.
        this.mirrorHostSettings<RestClientViewSettings>(
            (saved) => {
                this.state.update((s) => {
                    if (saved.selectedRequestId !== undefined) s.selectedRequestId = saved.selectedRequestId;
                });
            },
            (s) => ({ selectedRequestId: s.selectedRequestId }),
            (s) => s.selectedRequestId,
        );

        // RC4 — state subscription → debounced serialize-back. Replaces
        // today's RestClientViewModel.onInit subscription.
        this.registerHostSubscription(this.state.subscribe(() => this.onDataChangedDebounced()));

        // RC18 — fire-and-forget async restore of the response cache. Hits
        // both the descriptor-replay path (restore() → adoptHost) AND the
        // legacy-host adoption path (attachEditorToPage → adoptHost). Same
        // fire-and-forget shape as today's loadData → restoreResponseCache
        // call site.
        void this.restoreResponseCache();
    }

    protected onHostAttached(host: TextFileModel): void {
        this.loadData(host.state.get().content ?? "");
    }

    // ────────────────────────────────────────────────────────────────────
    // BELOW: methods relocated from legacy RestClientViewModel.
    // Substitutions: `this.host` → `this._host`; cache-file selection-state
    // mechanics (`restoreSelectionState`, `saveSelectionState`,
    // `saveSelectionStateDebounced`, `selectionRestored`, `static cacheName`)
    // are dropped — replaced by the HS1 slice-subscribe mirror above.
    // ────────────────────────────────────────────────────────────────────

    // ── Serialization: state → file content ─────────────────

    private onDataChanged = (): void => {
        const { data, error } = this.state.get();
        if (error) return;
        if (!this._host) return;
        if (data.requests !== this.lastSerializedData?.requests) {
            this.lastSerializedData = data;
            // Strip empty trailing header/formData rows before serializing
            const cleanData: RestClientData = {
                ...data,
                requests: data.requests.map((r) => ({
                    ...r,
                    headers: r.headers.filter((h) => h.key || h.value),
                    formData: r.formData.filter((f) => f.key || f.value),
                    formDataEntries: r.formDataEntries.filter((f) => f.key || f.value),
                })),
            };
            const content = JSON.stringify(cleanData, null, 4);
            // Only update host if content actually changed (avoid false dirty on load)
            const currentContent = this._host.state.get().content || "";
            if (content !== currentContent) {
                this.writeToHost(content, true);
            }
        }
    };

    // ── Response cache (RC7 — verbatim from today, with adoptHost-driven
    //     restore via RC18) ────────────────────────────────────────────────

    private restoreResponseCache = async (): Promise<void> => {
        if (!this._host) return;
        const cached = await this._host.stateStorage.getState(
            this._host.id, RestClientEditor.responseCacheName,
        );
        if (!cached) return;
        try {
            this.responseCache = JSON.parse(cached);
            this.restoreResponseForSelected();
        } catch {
            this.responseCache = {};
        }
    };

    private saveResponseCache = (): void => {
        if (!this._host) return;
        const data = JSON.stringify(this.responseCache);
        this._host.stateStorage.setState(
            this._host.id, RestClientEditor.responseCacheName, data,
        );
    };

    private restoreResponseForSelected = (): void => {
        const { selectedRequestId } = this.state.get();
        const cached = this.responseCache[selectedRequestId];
        if (cached) {
            this.state.update((s) => {
                s.response = cached.response;
                s.responseTime = cached.responseTime;
            });
        }
    };

    // ── Data loading (RC4 — verbatim from RestClientViewModel.loadData,
    //     minus the selectionRestored / restoreSelectionState /
    //     restoreResponseCache kickoff — HS1 handles selection seeding in
    //     adoptHost; RC18 handles response-cache restore.) ────────────────

    loadData = (content: string): void => {
        if (!content || content.trim() === "") {
            this.state.update((s) => {
                s.data = { type: "rest-client", requests: [] };
                s.error = undefined;
                s.selectedRequestId = "";
            });
            this.lastSerializedData = this.state.get().data;
            return;
        }

        try {
            const parsed = JSON.parse(content);
            const requests: RestRequest[] = Array.isArray(parsed.requests)
                ? parsed.requests.map((r: Partial<RestRequest>) => ({
                    id: r.id || crypto.randomUUID(),
                    name: r.name ?? "",
                    collection: r.collection || "",
                    method: r.method || "GET",
                    url: r.url || "",
                    headers: Array.isArray(r.headers) ? r.headers : [],
                    body: r.body || "",
                    bodyType: r.bodyType || (r.body ? "raw" : "none"),
                    bodyLanguage: r.bodyLanguage || "plaintext",
                    formData: Array.isArray(r.formData) ? r.formData : [],
                    binaryFilePath: r.binaryFilePath || "",
                    formDataEntries: Array.isArray(r.formDataEntries) ? r.formDataEntries : [],
                }))
                : [];

            const data: RestClientData = { type: "rest-client", requests };

            this.state.update((s) => {
                s.data = data;
                s.error = undefined;
                if (!requests.some((r) => r.id === s.selectedRequestId)) {
                    s.selectedRequestId = requests[0]?.id || "";
                }
            });
            this.lastSerializedData = data;

            // Ensure selected request has empty last rows (for UI)
            const selectedId = this.state.get().selectedRequestId;
            if (selectedId) {
                this.ensureEmptyLastHeader(selectedId);
                this.ensureEmptyLastFormData(selectedId);
            }
        } catch (e) {
            this.state.update((s) => {
                s.error = `Failed to parse JSON: ${e.message}`;
            });
        }
    };

    // ── Request CRUD (relocated VERBATIM from RestClientViewModel) ──────

    get selectedRequest(): RestRequest | undefined {
        const { data, selectedRequestId } = this.state.get();
        return data.requests.find((r) => r.id === selectedRequestId);
    }

    selectRequest = (id: string): void => {
        this.state.update((s) => {
            s.selectedRequestId = id;
            const cached = this.responseCache[id];
            s.response = cached?.response ?? null;
            s.responseTime = cached?.responseTime ?? 0;
            s.executing = false;
        });
        this.ensureEmptyLastHeader(id);
        this.ensureEmptyLastFormData(id);
        // No saveSelectionStateDebounced — HS1 slice-subscribe handles persistence.
    };

    addRequest = (name?: string, collection?: string): RestRequest => {
        // Default to selected request's collection
        if (collection === undefined) {
            collection = this.selectedRequest?.collection || "";
        }
        const request = createDefaultRequest(name, collection);
        this.state.update((s) => {
            s.data = {
                ...s.data,
                requests: [...s.data.requests, request],
            };
            s.selectedRequestId = request.id;
            s.response = null;
            s.responseTime = 0;
        });
        this.ensureEmptyLastHeader(request.id);
        // No saveSelectionStateDebounced — HS1 slice-subscribe handles persistence.
        return request;
    };

    deleteRequest = (id: string): void => {
        this.state.update((s) => {
            const idx = s.data.requests.findIndex((r) => r.id === id);
            if (idx === -1) return;
            const requests = s.data.requests.filter((r) => r.id !== id);
            s.data = { ...s.data, requests };
            if (s.selectedRequestId === id) {
                const newIdx = Math.min(idx, requests.length - 1);
                s.selectedRequestId = requests[newIdx]?.id || "";
                const cached = this.responseCache[s.selectedRequestId];
                s.response = cached?.response ?? null;
                s.responseTime = cached?.responseTime ?? 0;
            }
        });
        delete this.responseCache[id];
        this.saveResponseCacheDebounced();
    };

    renameRequest = (id: string, name: string): void => {
        this.state.update((s) => {
            s.data = {
                ...s.data,
                requests: s.data.requests.map((r) =>
                    r.id === id ? { ...r, name } : r
                ),
            };
        });
    };

    updateRequestCollection = (id: string, collection: string): void => {
        this.state.update((s) => {
            s.data = {
                ...s.data,
                requests: s.data.requests.map((r) =>
                    r.id === id ? { ...r, collection } : r
                ),
            };
        });
    };

    deleteCollection = (collectionName: string): void => {
        const ids = this.state.get().data.requests
            .filter((r) => r.collection === collectionName)
            .map((r) => r.id);

        this.state.update((s) => {
            const requests = s.data.requests.filter((r) => r.collection !== collectionName);
            s.data = { ...s.data, requests };
            if (ids.includes(s.selectedRequestId)) {
                s.selectedRequestId = requests[0]?.id || "";
                const cached = this.responseCache[s.selectedRequestId];
                s.response = cached?.response ?? null;
                s.responseTime = cached?.responseTime ?? 0;
            }
        });
        for (const id of ids) {
            delete this.responseCache[id];
        }
        this.saveResponseCacheDebounced();
    };

    moveRequest = (fromId: string, toId: string, newCollection?: string): void => {
        this.state.update((s) => {
            const requests = [...s.data.requests];
            const fromIdx = requests.findIndex((r) => r.id === fromId);
            const toIdx = requests.findIndex((r) => r.id === toId);
            if (fromIdx === -1 || fromIdx === toIdx) return;

            const [moved] = requests.splice(fromIdx, 1);
            if (newCollection !== undefined) {
                moved.collection = newCollection;
            }

            if (toIdx === -1) {
                // toId is a collection node — append to end
                requests.push(moved);
            } else {
                // Adjust index after removal
                const adjustedIdx = toIdx > fromIdx ? toIdx - 1 : toIdx;
                requests.splice(adjustedIdx, 0, moved);
            }
            s.data = { ...s.data, requests };
        });
    };

    updateRequest = (id: string, changes: Partial<RestRequest>): void => {
        // Auto-sync bodyType when method changes
        if (changes.method) {
            const req = this.state.get().data.requests.find((r) => r.id === id);
            if (req) {
                const wasNoBody = ["GET", "HEAD"].includes(req.method);
                const isNoBody = ["GET", "HEAD"].includes(changes.method);
                if (!wasNoBody && isNoBody && req.bodyType !== "none") {
                    changes.bodyType = "none";
                } else if (wasNoBody && !isNoBody && req.bodyType === "none") {
                    changes.bodyType = "raw";
                }
            }
        }

        this.state.update((s) => {
            s.data = {
                ...s.data,
                requests: s.data.requests.map((r) =>
                    r.id === id ? { ...r, ...changes } : r
                ),
            };
        });
    };

    // ── Body type & language ────────────────────────────────────────────

    updateBodyType = (requestId: string, bodyType: BodyType): void => {
        this.updateRequest(requestId, { bodyType });

        if (bodyType === "form-urlencoded") {
            this.autoSetContentType(requestId, "application/x-www-form-urlencoded");
            this.ensureEmptyLastFormData(requestId);
        } else if (bodyType === "raw") {
            const req = this.state.get().data.requests.find((r) => r.id === requestId);
            if (req) {
                this.autoSetContentType(requestId, LANGUAGE_CONTENT_TYPES[req.bodyLanguage]);
            }
        } else if (bodyType === "form-data") {
            this.ensureEmptyLastFormDataEntry(requestId);
            // Don't auto-set Content-Type — it's set with boundary at send time
        } else if (bodyType === "binary") {
            this.autoSetContentType(requestId, "application/octet-stream");
        }
        // "none" — don't change Content-Type
    };

    updateBodyLanguage = (requestId: string, bodyLanguage: RawLanguage): void => {
        this.updateRequest(requestId, { bodyLanguage });
        this.autoSetContentType(requestId, LANGUAGE_CONTENT_TYPES[bodyLanguage]);
    };

    private autoSetContentType = (requestId: string, contentType: string): void => {
        const req = this.state.get().data.requests.find((r) => r.id === requestId);
        if (!req) return;

        const headers = [...req.headers];
        const ctIndex = headers.findIndex(
            (h) => h.key.toLowerCase() === "content-type" && h.key !== "",
        );

        if (ctIndex >= 0) {
            headers[ctIndex] = { ...headers[ctIndex], value: contentType };
        } else {
            // Insert before the empty last row
            const insertAt = headers.length > 0 && !headers[headers.length - 1].key && !headers[headers.length - 1].value
                ? headers.length - 1
                : headers.length;
            headers.splice(insertAt, 0, { key: "Content-Type", value: contentType, enabled: true });
        }

        this.updateRequest(requestId, { headers });
        this.ensureEmptyLastHeader(requestId);
    };

    // ── Header CRUD ─────────────────────────────────────────────────────

    /** Ensure the last header row is always empty (auto-add pattern). */
    private ensureEmptyLastHeader = (requestId: string): void => {
        const req = this.state.get().data.requests.find((r) => r.id === requestId);
        if (!req) return;
        const last = req.headers[req.headers.length - 1];
        if (!last || last.key || last.value) {
            this.updateRequest(requestId, {
                headers: [...req.headers, { key: "", value: "", enabled: true }],
            });
        }
    };

    deleteHeader = (requestId: string, index: number): void => {
        const req = this.state.get().data.requests.find((r) => r.id === requestId);
        if (!req) return;
        const headers = req.headers.filter((_, i) => i !== index);
        this.updateRequest(requestId, { headers });
        this.ensureEmptyLastHeader(requestId);
    };

    toggleHeader = (requestId: string, index: number): void => {
        const req = this.state.get().data.requests.find((r) => r.id === requestId);
        if (!req) return;
        const headers = req.headers.map((h, i) =>
            i === index ? { ...h, enabled: !h.enabled } : h
        );
        this.updateRequest(requestId, { headers });
    };

    updateHeader = (requestId: string, index: number, changes: Partial<RestHeader>): void => {
        const req = this.state.get().data.requests.find((r) => r.id === requestId);
        if (!req) return;
        const headers = req.headers.map((h, i) =>
            i === index ? { ...h, ...changes } : h
        );
        this.updateRequest(requestId, { headers });
        this.ensureEmptyLastHeader(requestId);
    };

    // ── Form Data CRUD ──────────────────────────────────────────────────

    private ensureEmptyLastFormData = (requestId: string): void => {
        const req = this.state.get().data.requests.find((r) => r.id === requestId);
        if (!req) return;
        const last = req.formData[req.formData.length - 1];
        if (!last || last.key || last.value) {
            this.updateRequest(requestId, {
                formData: [...req.formData, { key: "", value: "", enabled: true }],
            });
        }
    };

    deleteFormData = (requestId: string, index: number): void => {
        const req = this.state.get().data.requests.find((r) => r.id === requestId);
        if (!req) return;
        const formData = req.formData.filter((_, i) => i !== index);
        this.updateRequest(requestId, { formData });
        this.ensureEmptyLastFormData(requestId);
    };

    toggleFormData = (requestId: string, index: number): void => {
        const req = this.state.get().data.requests.find((r) => r.id === requestId);
        if (!req) return;
        const formData = req.formData.map((f, i) =>
            i === index ? { ...f, enabled: !f.enabled } : f
        );
        this.updateRequest(requestId, { formData });
    };

    updateFormData = (requestId: string, index: number, changes: Partial<RestHeader>): void => {
        const req = this.state.get().data.requests.find((r) => r.id === requestId);
        if (!req) return;
        const formData = req.formData.map((f, i) =>
            i === index ? { ...f, ...changes } : f
        );
        this.updateRequest(requestId, { formData });
        this.ensureEmptyLastFormData(requestId);
    };

    // ── Form Data Entries CRUD (multipart/form-data) ────────────────────

    ensureEmptyLastFormDataEntry = (requestId: string): void => {
        const req = this.state.get().data.requests.find((r) => r.id === requestId);
        if (!req) return;
        const last = req.formDataEntries[req.formDataEntries.length - 1];
        if (!last || last.key || last.value) {
            this.updateRequest(requestId, {
                formDataEntries: [...req.formDataEntries, { key: "", value: "", type: "text", enabled: true }],
            });
        }
    };

    deleteFormDataEntry = (requestId: string, index: number): void => {
        const req = this.state.get().data.requests.find((r) => r.id === requestId);
        if (!req) return;
        const formDataEntries = req.formDataEntries.filter((_, i) => i !== index);
        this.updateRequest(requestId, { formDataEntries });
        this.ensureEmptyLastFormDataEntry(requestId);
    };

    toggleFormDataEntry = (requestId: string, index: number): void => {
        const req = this.state.get().data.requests.find((r) => r.id === requestId);
        if (!req) return;
        const formDataEntries = req.formDataEntries.map((f, i) =>
            i === index ? { ...f, enabled: !f.enabled } : f
        );
        this.updateRequest(requestId, { formDataEntries });
    };

    updateFormDataEntry = (requestId: string, index: number, changes: Partial<FormDataEntry>): void => {
        const req = this.state.get().data.requests.find((r) => r.id === requestId);
        if (!req) return;
        const formDataEntries = req.formDataEntries.map((f, i) =>
            i === index ? { ...f, ...changes } : f
        );
        this.updateRequest(requestId, { formDataEntries });
        this.ensureEmptyLastFormDataEntry(requestId);
    };

    // ── Paste from clipboard ────────────────────────────────────────────

    pasteRequest = async (clipboardText: string): Promise<boolean> => {
        const { parseClipboardRequest } = await import("./parseClipboardRequest");
        const parsed = parseClipboardRequest(clipboardText);
        if (!parsed) return false;

        const requestId = this.state.get().selectedRequestId;
        if (!requestId) return false;

        this.updateRequest(requestId, {
            method: parsed.method,
            url: parsed.url,
            headers: parsed.headers,
            body: parsed.body,
            bodyType: parsed.bodyType,
            bodyLanguage: parsed.bodyLanguage,
            formData: parsed.formData,
        });
        this.ensureEmptyLastHeader(requestId);
        if (parsed.bodyType === "form-urlencoded") {
            this.ensureEmptyLastFormData(requestId);
        }
        return true;
    };

    // ── Request execution ───────────────────────────────────────────────

    setHeadersJsonInvalid = (invalid: boolean): void => {
        this.state.update((s) => { s.headersJsonInvalid = invalid; });
    };

    sendRequest = async (): Promise<void> => {
        const request = this.selectedRequest;
        if (!request || !request.url) return;

        if (this.state.get().headersJsonInvalid) {
            const { app } = await import("../../api/app");
            app.ui.notify("Fix invalid JSON in headers before sending", "warning");
            return;
        }

        this.state.update((s) => {
            s.executing = true;
            s.response = null;
            s.responseTime = 0;
        });

        const startTime = Date.now();

        try {
            const { nodeFetch } = await import("../../api/node-fetch");
            const headers: Record<string, string> = {};
            for (const h of request.headers) {
                if (h.enabled && h.key.trim()) headers[h.key.trim()] = h.value;
            }

            // Build body based on bodyType
            let body: string | ReadableStream | undefined;
            if (request.bodyType === "raw") {
                body = request.body || undefined;
            } else if (request.bodyType === "form-urlencoded") {
                const pairs = request.formData
                    .filter((f) => f.enabled && f.key.trim())
                    .map((f) => `${encodeURIComponent(f.key.trim())}=${encodeURIComponent(f.value)}`);
                body = pairs.length > 0 ? pairs.join("&") : undefined;
            } else if (request.bodyType === "binary") {
                if (request.binaryFilePath) {
                    const fs = require("fs") as typeof import("fs");
                    if (!fs.existsSync(request.binaryFilePath)) {
                        throw new Error(`File not found: ${request.binaryFilePath}`);
                    }
                    const nodeStream = fs.createReadStream(request.binaryFilePath);
                    body = new ReadableStream({
                        start(controller) {
                            // The request's Node stream owns these callbacks until the
                            // response body completes; a view disposer must not abort it.
                            nodeStream.on("data", (chunk: Buffer) => controller.enqueue(chunk));
                            nodeStream.on("end", () => controller.close());
                            nodeStream.on("error", (err: Error) => controller.error(err));
                        },
                    });
                }
            } else if (request.bodyType === "form-data") {
                const { buildMultipartBody } = await import("./multipartBuilder");
                const result = buildMultipartBody(request.formDataEntries);
                headers["Content-Type"] = `multipart/form-data; boundary=${result.boundary}`;
                body = result.stream;
            }
            // "none" → body stays undefined

            const res = await nodeFetch(request.url, {
                method: request.method,
                headers,
                body,
            });

            const responseHeaders: RestHeader[] = [];
            res.headers.forEach((v, k) => {
                responseHeaders.push({ key: k, value: v, enabled: true });
            });

            const contentType = res.headers.get("content-type") || "";
            const isBinary = isBinaryContentType(contentType);

            let responseBody: string;
            if (isBinary) {
                const buf = await res.arrayBuffer();
                responseBody = Buffer.from(buf).toString("base64");
            } else {
                responseBody = await res.text();
            }

            const responseTime = Date.now() - startTime;

            const response: RestResponse = {
                status: res.status,
                statusText: res.statusText,
                headers: responseHeaders,
                body: responseBody,
                isBinary,
                contentType,
            };

            // Don't persist binary responses to stateStorage (too large)
            this.responseCache[request.id] = { response, responseTime };
            if (!isBinary) {
                this.saveResponseCacheDebounced();
            }

            this.state.update((s) => {
                s.executing = false;
                s.response = response;
                s.responseTime = responseTime;
            });
        } catch (err) {
            const responseTime = Date.now() - startTime;
            const response: RestResponse = {
                status: 0,
                statusText: "Error",
                headers: [],
                body: errMessage(err),
            };

            this.responseCache[request.id] = { response, responseTime };
            this.saveResponseCacheDebounced();

            this.state.update((s) => {
                s.executing = false;
                s.response = response;
                s.responseTime = responseTime;
            });
        }
    };

    // ── Save / release / dispose ────────────────────────────────────────

    async saveState(): Promise<void> {
        // Flush BOTH pending debounced saves before host's saveState (RC4
        // — incidentally fixes today's lost-response-save bug; today's
        // onDispose only flushes onDataChanged).
        this.onDataChanged();
        this.saveResponseCache();
        await super.saveState();
    }

    async dispose(): Promise<void> {
        // Flush BOTH pending debounced saves.
        this.onDataChanged();
        this.saveResponseCache();
        await super.dispose();
    }
}

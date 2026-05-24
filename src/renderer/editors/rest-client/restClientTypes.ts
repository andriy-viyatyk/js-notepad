export interface RestHeader {
    key: string;
    value: string;
    enabled: boolean;
}

export type BodyType = "none" | "form-urlencoded" | "raw" | "binary" | "form-data";

export const RAW_LANGUAGES = ["plaintext", "json", "javascript", "html", "xml"] as const;
export type RawLanguage = typeof RAW_LANGUAGES[number];

export interface FormDataEntry {
    key: string;
    value: string;
    type: "text" | "file";
    enabled: boolean;
}

export interface RestRequest {
    id: string;
    name: string;
    collection: string;
    method: string;
    url: string;
    headers: RestHeader[];
    body: string;
    bodyType: BodyType;
    bodyLanguage: RawLanguage;
    formData: RestHeader[];
    binaryFilePath: string;
    formDataEntries: FormDataEntry[];
}

export interface RestClientData {
    type: "rest-client";
    requests: RestRequest[];
}

export interface RestResponse {
    status: number;
    statusText: string;
    headers: RestHeader[];
    body: string;
    isBinary?: boolean;
    contentType?: string;
}

export interface CachedResponse {
    response: RestResponse;
    responseTime: number;
}

export function createDefaultRequest(name?: string, collection?: string): RestRequest {
    return {
        id: crypto.randomUUID(),
        name: name || "New Request",
        collection: collection || "",
        method: "GET",
        url: "",
        headers: [],
        body: "",
        bodyType: "none",
        bodyLanguage: "plaintext",
        formData: [],
        binaryFilePath: "",
        formDataEntries: [],
    };
}

// =============================================================================
// US-563 — Dual-source typing (RC13) + minimal view-state interface for shared
// components. RestClientSource lets RequestBuilder / RequestTree / SplitDetailPanel
// compile against both the legacy RestClientViewModel (kept alive for future
// notebook-embed per RC12) and the new v4 RestClientEditor — method signatures
// are identical on both classes.
// =============================================================================

import type { RestClientViewModel } from "./RestClientViewModel";
import type { RestClientEditor } from "./RestClientEditor";

/** Dual-source typing for shared components — legacy VM AND v4 editor share
 *  identical setter/getter signatures. Components don't care which they receive. */
export type RestClientSource = RestClientViewModel | RestClientEditor;

/** Minimal state surface read by RequestBuilder + SplitDetailPanel. Both the
 *  legacy RestClientEditorState and the v4 RestClientEditorState satisfy it
 *  (extra fields on the v4 state — id/title/modified/secondaryEditor from
 *  EditorStateBase — are ignored by the shared components). */
export interface RestClientViewState {
    response: RestResponse | null;
    responseTime: number;
    executing: boolean;
    headersJsonInvalid: boolean;
}

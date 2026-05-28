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


import type { RestClientEditor } from "./RestClientEditor";

/** Source type for shared Rest Client components. this is just
 *  the v4 `RestClientEditor`; the alias is preserved so consumer call sites
 *  don't churn. */
export type RestClientSource = RestClientEditor;

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

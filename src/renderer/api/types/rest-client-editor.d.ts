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

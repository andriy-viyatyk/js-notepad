export interface McpResponse {
    result?: unknown;
    error?: { code: number; message: string; data?: unknown };
}

/** JSON-RPC params: object-or-null shape per spec. Handlers narrow as needed. */
export type McpParams = Record<string, unknown> | null | undefined;

export type McpCommandHandler = (params: McpParams) => Promise<McpResponse> | McpResponse;

export interface McpPageInfo {
    id: string;
    title: string;
    editor?: string;
    language?: string;
    filePath?: string;
    modified: boolean;
    pinned: boolean;
    active: boolean;
    profileName?: string;
    isIncognito?: boolean;
    isTor?: boolean;
    url?: string;
    boardRoot?: string;
    selectedBoard?: string;
}

export interface McpActivePage {
    id: string;
    title: string;
    editor?: string;
    language?: string;
    filePath?: string;
    modified: boolean;
    content?: string;
    image?: { data: string; mimeType: string };
    hint?: string;
    profileName?: string;
    isIncognito?: boolean;
    isTor?: boolean;
    url?: string;
}

export interface McpAppInfo {
    version: string;
    pageCount: number;
    activePageId: string | null;
    browserProfiles: string[];
    defaultBrowserProfile: string;
    resourcesDir: string;
    demoBoardDir: string;
    boardsAssetsBaseUrl: string;
    boardsManifestUrl: string;
}

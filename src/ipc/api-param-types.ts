export interface FileFilter {
    name: string;
    extensions: string[];
}

export interface OpenFileDialogParams {
    title?: string;
    defaultPath?: string;
    filters?: FileFilter[];
    multiSelections?: boolean;
}

export interface SaveFileDialogParams {
    title?: string;
    defaultPath?: string;
    filters?: FileFilter[];
}

export interface OpenFolderDialogParams {
    title?: string;
    defaultPath?: string;
    multiSelections?: boolean;
}

export type CommonFolder =
    | "userData" // C:\Users\USERNAME\AppData\Roaming\persephone
    | "appData"  // C:\Users\USERNAME\AppData\Roaming
    | "documents"
    | "exe"
    | "home" // C:\Users\USERNAME
    | "desktop"
    | "temp"
    | "pictures"
    | "music"
    | "videos"
    | "downloads";

export interface ReleaseInfo {
    tagName: string;
    version: string;
    htmlUrl: string;
    publishedAt: string;
    body: string;
}

export interface UpdateCheckResult {
    currentVersion: string;
    latestVersion: string | null;
    updateAvailable: boolean;
    releaseInfo: ReleaseInfo | null;
    error?: string;
}

export interface RuntimeVersions {
    electron: string;
    node: string;
    chrome: string;
}

export interface DownloadEntry {
    id: string;
    filename: string;
    url: string;
    savePath: string;
    totalBytes: number;
    receivedBytes: number;
    status: "downloading" | "completed" | "failed" | "cancelled";
    startTime: number;
    error?: string;
}

export interface PublishedBoardArchive {
    url: string;
    size: number;
    sha256: string;
}

/**
 * One board entry in the catalog `boards-manifest.json` (EPIC-045). The association
 * fields (fileMasks/editorName/editorKind/standalone) are copied by the publish
 * automation from the board's own board-manifest.json so the client can advertise a
 * board (the "+" switch entry, the catalog list) WITHOUT downloading it.
 */
export interface PublishedBoardInfo {
    id: string;
    version: string;
    name: string;
    description?: string;
    fileMasks?: string[];
    editorName?: string;
    editorKind?: "simple" | "content-host";
    standalone?: boolean;
    minAppVersion?: string;
    archive: PublishedBoardArchive;
}

export interface PublishedBoardsCatalog {
    schemaVersion: number;
    boards: PublishedBoardInfo[];
}

/**
 * Return value of `getPublishedBoards`. `catalog` is the last-good catalog (from the
 * network or the cache), or null if never fetched and nothing cached. Fetch failures
 * are silent — the cached catalog is still returned with `error` set for diagnostics.
 */
export interface PublishedBoardsResult {
    catalog: PublishedBoardsCatalog | null;
    /** epoch ms of the last successful network fetch (0 = never). */
    fetchedAt: number;
    /** true when returned from cache without a fresh network hit. */
    fromCache: boolean;
    error?: string;
}

export interface VideoStreamSessionConfig {
    /** Local file path to stream. Mutually exclusive with url. */
    filePath?: string;
    /** HTTP/HTTPS URL to proxy. Mutually exclusive with filePath. */
    url?: string;
    /** Custom request headers forwarded to the source URL. */
    headers?: Record<string, string>;
    /** HTTP method for the source request. Defaults to "GET". */
    method?: string;
    /**
     * Owner page ID. When provided, deleteVideoStreamSessionsByPage() will
     * destroy all sessions for this page — call it from the editor's dispose().
     */
    pageId?: string;
}

export interface VideoStreamSessionResult {
    sessionId: string;
    streamingUrl: string;
}
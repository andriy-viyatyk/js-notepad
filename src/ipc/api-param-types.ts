export interface FileFilter {
    name: string;
    extensions: string[];
}

/**
 * `defaultPath` vs `location` — both say where a dialog should open, with different strength.
 * A `defaultPath` carrying a directory is an explicit choice and beats the remembered folder;
 * a bare file name in it is only a suggested name. `location` is a weak preference used until
 * the user has picked a folder for that dialog kind, after which the memory wins. See
 * `main/dialog-folder-memory.ts`.
 */
export interface OpenFileDialogParams {
    title?: string;
    defaultPath?: string;
    location?: CommonFolder;
    filters?: FileFilter[];
    multiSelections?: boolean;
}

export interface SaveFileDialogParams {
    title?: string;
    defaultPath?: string;
    location?: CommonFolder;
    filters?: FileFilter[];
}

export interface OpenFolderDialogParams {
    title?: string;
    defaultPath?: string;
    location?: CommonFolder;
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
 * fields (fileMasks/folderMasks/editorName/editorKind/standalone) are copied by the publish
 * automation from the board's own board-manifest.json so the client can advertise a
 * board (the "+" switch entry, the catalog list) WITHOUT downloading it.
 */
export interface PublishedBoardInfo {
    id: string;
    version: string;
    name: string;
    description?: string;
    fileMasks?: string[];
    folderMasks?: string[];
    editorName?: string;
    editorKind?: "simple" | "content-host";
    standalone?: boolean;
    minAppVersion?: string;
    /** Screenshot file name inside the board's catalog folder (e.g. `"screenshot.png"`).
     *  A bare name by contract — never a path or a URL; see `isSafeAssetName`. */
    screenshot?: string;
    /** `screenshot` resolved against the catalog's raw base URL. Derived on the way out of
     *  the service rather than stored, so the cached catalog stays branch-agnostic and a
     *  `PERSEPHONE_BOARDS_BRANCH` switch takes effect without a refetch. */
    screenshotUrl?: string;
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

/** One published version of a board (from `boards/<id>/versions-manifest.json`, EPIC-045). */
export interface PublishedBoardVersion {
    version: string;
    date?: string;
    notes?: string;
    minAppVersion?: string;
    archive: PublishedBoardArchive;
}

/** A board's full version history (newest first). Fetched on demand (Board Info properties). */
export interface PublishedBoardVersions {
    schemaVersion: number;
    id: string;
    versions: PublishedBoardVersion[];
}

/** One in-flight board-archive download (EPIC-045 / US-863). `installId` is minted by the
 *  renderer so it can match `eBoardInstallProgress` events and cancel a specific download. */
export interface BoardArchiveDownloadRequest {
    installId: string;
    url: string;
    /** Expected lowercase hex sha256 — the download rejects on mismatch. */
    sha256: string;
    /** Expected byte size (from the catalog) — used for the progress bar total. */
    size: number;
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
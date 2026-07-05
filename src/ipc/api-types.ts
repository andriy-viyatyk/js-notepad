import { PageDragData, PageDescriptor, WindowPages } from "../shared/types";
import {
    CommonFolder,
    DownloadEntry,
    OpenFileDialogParams,
    OpenFolderDialogParams,
    RuntimeVersions,
    SaveFileDialogParams,
    UpdateCheckResult,
    VideoStreamSessionConfig,
    VideoStreamSessionResult,
} from "./api-param-types";
import { GitAheadBehind, GitCommit, GitFetchOptions, GitFileChange, GitIdentity, GitLogOptions, GitMutationResult, GitProbeResult, GitPullOptions, GitPullResult, GitPushOptions, GitPushResult, GitRefs, GitRepoInfo, GitStatusResult, GitSwitchTarget } from "./git-ipc";
import type { BoardThemePalette } from "./board-bridge-channels";
import type { ClipboardFileList } from "./clipboard-ipc";

export enum Endpoint {
    getAppRootPath = "getAppRootPath",
    getAssetsPath = "getAssetsPath",
    getDataFolder = "getDataFolder",
    maximizeWindow = "maximizeWindow",
    minimizeWindow = "minimizeWindow",
    restoreWindow = "restoreWindow",
    closeWindow = "closeWindow",
    setCanQuit = "setCanQuit",
    showOpenFileDialog = "showOpenFileDialog",
    showSaveFileDialog = "showSaveFileDialog",
    showOpenFolderDialog = "showOpenFolderDialog",
    inspectElement = "inspectElement",
    getCommonFolder = "getCommonFolder",
    zoom = "zoom",
    showItemInFolder = "showItemInFolder",
    showFolder = "showFolder",
    windowReady = "windowReady",
    getFileToOpen = "getFileToOpen",
    getUrlToOpen = "getUrlToOpen",
    getWindowIndex = "getWindowIndex",
    openNewWindow = "openNewWindow",
    getWindowPages = "getWindowPages",
    showWindowPage = "showWindowPage",
    addDragEvent = "addDragEvent",
    getFileIcon = "getFileIcon",
    resetZoom = "resetZoom",
    checkForUpdates = "checkForUpdates",
    getAppVersion = "getAppVersion",
    getRuntimeVersions = "getRuntimeVersions",
    setNativeTheme = "setNativeTheme",
    registerAsDefaultBrowser = "registerAsDefaultBrowser",
    unregisterAsDefaultBrowser = "unregisterAsDefaultBrowser",
    isRegisteredAsDefaultBrowser = "isRegisteredAsDefaultBrowser",
    openDefaultAppsSettings = "openDefaultAppsSettings",
    getDownloads = "getDownloads",
    cancelDownload = "cancelDownload",
    openDownload = "openDownload",
    showDownloadInFolder = "showDownloadInFolder",
    clearCompletedDownloads = "clearCompletedDownloads",
    setMcpEnabled = "setMcpEnabled",
    getMcpStatus = "getMcpStatus",
    setMnemeEnabled = "setMnemeEnabled",
    restartMneme = "restartMneme",
    getMnemeStatus = "getMnemeStatus",
    setBrowserToolsEnabled = "setBrowserToolsEnabled",
    startScreenSnip = "startScreenSnip",
    clipboardReadFilePaths = "clipboardReadFilePaths",
    clipboardWriteFilePaths = "clipboardWriteFilePaths",
    createVideoStreamSession = "createVideoStreamSession",
    deleteVideoStreamSession = "deleteVideoStreamSession",
    deleteVideoStreamSessionsByPage = "deleteVideoStreamSessionsByPage",
    openInVlc = "openInVlc",
    gitProbe = "gitProbe",
    gitDetectRepo = "gitDetectRepo",
    gitLog = "gitLog",
    gitShow = "gitShow",
    gitStatus = "gitStatus",
    gitCommitMessage = "gitCommitMessage",
    gitCommitFiles = "gitCommitFiles",
    gitStage = "gitStage",
    gitUnstage = "gitUnstage",
    gitDiscard = "gitDiscard",
    gitCommit = "gitCommit",
    gitIdentity = "gitIdentity",
    gitRefs = "gitRefs",
    gitSwitch = "gitSwitch",
    gitCreateBranch = "gitCreateBranch",
    gitFetch = "gitFetch",
    gitAheadBehind = "gitAheadBehind",
    gitPush = "gitPush",
    gitPull = "gitPull",
    gitRemoteUrl = "gitRemoteUrl",
    capturePageRegion = "capturePageRegion",
    registerBoard = "registerBoard",
    unregisterBoard = "unregisterBoard",
    updateBoardTheme = "updateBoardTheme",
    requestBoardPort = "requestBoardPort",
    disposeBoardPort = "disposeBoardPort",
    setBoardBusy = "setBoardBusy",
    reapBoardOwner = "reapBoardOwner",
    registerBoardFrame = "registerBoardFrame",
    unregisterBoardFrame = "unregisterBoardFrame",
}

/** Synthetic CDP "tab" id for a board (boards have no tabs). The automation
 *  regKey is `${boardEditorId}/${BOARD_CDP_TAB}` — built identically in the
 *  renderer target (BoardTargetModel) and the main controller registration. */
export const BOARD_CDP_TAB = "main";

/** A rectangle (CSS pixels, viewport-relative) to capture from the calling
 *  window's web contents. The main handler scales it by the window zoom factor
 *  before calling `webContents.capturePage`. */
export interface CaptureRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface McpStatus {
    running: boolean;
    url: string;
    clientCount: number;
}

export interface MnemeStatus {
    running: boolean;
    url: string;
    /** Set only on a failed start or an unexpected exit; drives the error toast. */
    error?: string;
}

export type Api = {
    [Endpoint.getAppRootPath]: () => Promise<string>;
    [Endpoint.getAssetsPath]: (fileName: string) => Promise<string>;
    [Endpoint.getDataFolder]: () => Promise<string>;
    [Endpoint.maximizeWindow]: () => Promise<void>;
    [Endpoint.minimizeWindow]: () => Promise<void>;
    [Endpoint.restoreWindow]: () => Promise<void>;
    [Endpoint.closeWindow]: () => Promise<void>;
    [Endpoint.setCanQuit]: (canQuit: boolean) => Promise<void>;
    [Endpoint.showOpenFileDialog]: (
        params: OpenFileDialogParams
    ) => Promise<string[] | undefined>;
    [Endpoint.showSaveFileDialog]: (
        params: SaveFileDialogParams
    ) => Promise<string | undefined>;
    [Endpoint.showOpenFolderDialog]: (
        params: OpenFolderDialogParams
    ) => Promise<string[] | undefined>;
    [Endpoint.inspectElement]: (x: number, y: number) => Promise<void>;
    [Endpoint.getCommonFolder]: (folder: CommonFolder) => Promise<string>;
    [Endpoint.zoom]: (delta: number) => Promise<void>;
    [Endpoint.showItemInFolder]: (path: string) => Promise<void>;
    [Endpoint.showFolder]: (path: string) => Promise<void>;
    [Endpoint.windowReady]: () => Promise<void>;
    [Endpoint.getFileToOpen]: () => Promise<string | undefined>;
    [Endpoint.getUrlToOpen]: () => Promise<string | undefined>;
    [Endpoint.getWindowIndex]: () => Promise<number>;
    [Endpoint.openNewWindow]: (filePath?: string) => Promise<number>;
    [Endpoint.getWindowPages]: () => Promise<WindowPages[]>;
    [Endpoint.showWindowPage]: (windowIndex: number, pageId: string) => Promise<void>;
    [Endpoint.addDragEvent]: (event: PageDragData) => Promise<void>;
    [Endpoint.getFileIcon]: (filePath: string) => Promise<string>;
    [Endpoint.resetZoom]: () => Promise<void>;
    [Endpoint.checkForUpdates]: (force?: boolean) => Promise<UpdateCheckResult>;
    [Endpoint.getAppVersion]: () => Promise<string>;
    [Endpoint.getRuntimeVersions]: () => Promise<RuntimeVersions>;
    [Endpoint.setNativeTheme]: (mode: "light" | "dark") => Promise<void>;
    [Endpoint.registerAsDefaultBrowser]: () => Promise<void>;
    [Endpoint.unregisterAsDefaultBrowser]: () => Promise<void>;
    [Endpoint.isRegisteredAsDefaultBrowser]: () => Promise<boolean>;
    [Endpoint.openDefaultAppsSettings]: () => Promise<void>;
    [Endpoint.getDownloads]: () => Promise<DownloadEntry[]>;
    [Endpoint.cancelDownload]: (id: string) => Promise<void>;
    [Endpoint.openDownload]: (id: string) => Promise<void>;
    [Endpoint.showDownloadInFolder]: (id: string) => Promise<void>;
    [Endpoint.clearCompletedDownloads]: () => Promise<void>;
    [Endpoint.setMcpEnabled]: (enabled: boolean, port?: number) => Promise<void>;
    [Endpoint.getMcpStatus]: () => Promise<McpStatus>;
    [Endpoint.setMnemeEnabled]: (enabled: boolean, port?: number) => Promise<MnemeStatus>;
    [Endpoint.restartMneme]: (port?: number) => Promise<MnemeStatus>;
    [Endpoint.getMnemeStatus]: () => Promise<MnemeStatus>;
    [Endpoint.setBrowserToolsEnabled]: (enabled: boolean) => Promise<void>;
    [Endpoint.startScreenSnip]: (hideWindows: boolean) => Promise<string | null>;
    [Endpoint.clipboardReadFilePaths]: () => Promise<ClipboardFileList>;
    [Endpoint.clipboardWriteFilePaths]: (paths: string[], cut: boolean) => Promise<boolean>;
    [Endpoint.createVideoStreamSession]: (config: VideoStreamSessionConfig, port?: number) => Promise<VideoStreamSessionResult>;
    [Endpoint.deleteVideoStreamSession]: (sessionId: string) => Promise<void>;
    [Endpoint.deleteVideoStreamSessionsByPage]: (pageId: string) => Promise<void>;
    [Endpoint.openInVlc]: (url: string, vlcPath?: string) => Promise<void>;
    [Endpoint.gitProbe]: () => Promise<GitProbeResult>;
    [Endpoint.gitDetectRepo]: (dir: string) => Promise<GitRepoInfo | null>;
    [Endpoint.gitLog]: (dir: string, opts: GitLogOptions) => Promise<GitCommit[]>;
    [Endpoint.gitShow]: (dir: string, rev: string, path: string) => Promise<string>;
    [Endpoint.gitStatus]: (dir: string) => Promise<GitStatusResult>;
    [Endpoint.gitCommitMessage]: (dir: string, hash: string) => Promise<string>;
    [Endpoint.gitCommitFiles]: (dir: string, hash: string) => Promise<GitFileChange[]>;
    [Endpoint.gitStage]: (dir: string, paths: string[]) => Promise<GitMutationResult>;
    [Endpoint.gitUnstage]: (dir: string, paths: string[]) => Promise<GitMutationResult>;
    [Endpoint.gitDiscard]: (dir: string, trackedPaths: string[], untrackedPaths: string[]) => Promise<GitMutationResult>;
    [Endpoint.gitCommit]: (dir: string, message: string, identity?: GitIdentity) => Promise<GitMutationResult>;
    [Endpoint.gitIdentity]: (dir: string) => Promise<GitIdentity>;
    [Endpoint.gitRefs]: (dir: string) => Promise<GitRefs>;
    [Endpoint.gitSwitch]: (dir: string, target: GitSwitchTarget) => Promise<GitMutationResult>;
    [Endpoint.gitCreateBranch]: (dir: string, name: string, startPoint?: string, checkout?: boolean) => Promise<GitMutationResult>;
    [Endpoint.gitFetch]: (dir: string, opts?: GitFetchOptions) => Promise<GitMutationResult>;
    [Endpoint.gitAheadBehind]: (dir: string) => Promise<GitAheadBehind>;
    [Endpoint.gitPush]: (dir: string, opts?: GitPushOptions) => Promise<GitPushResult>;
    [Endpoint.gitPull]: (dir: string, opts?: GitPullOptions) => Promise<GitPullResult>;
    [Endpoint.gitRemoteUrl]: (dir: string, remote: string) => Promise<string>;
    [Endpoint.capturePageRegion]: (rect: CaptureRect) => Promise<Uint8Array>;
    [Endpoint.registerBoard]: (boardRoot: string, theme: BoardThemePalette, tokens: Record<string, string>) => Promise<string>;
    [Endpoint.unregisterBoard]: (host: string) => Promise<void>;
    [Endpoint.updateBoardTheme]: (theme: BoardThemePalette) => Promise<void>;
    // Mint a per-board MessagePort in main and deliver port1 to this renderer via
    // a postMessage on `eBoardPort` (EPIC-037 / US-771). Resolves once the request
    // is sent; the port arrives asynchronously on the event channel. `ownerId` is
    // the owning BoardEditorModel id — the stable job-retention key (US-799).
    [Endpoint.requestBoardPort]: (boardId: string, host: string, ownerId: string) => Promise<void>;
    [Endpoint.disposeBoardPort]: (boardId: string) => Promise<void>;
    // Busy retention (US-799): mirror the renderer's busy flag / tree-kill every
    // job (kept + current) of a board owner on final teardown (model dispose).
    [Endpoint.setBoardBusy]: (ownerId: string, busy: boolean) => Promise<void>;
    [Endpoint.reapBoardOwner]: (ownerId: string) => Promise<void>;
    // `frameNonce` (the iframe's ?v= value) pins CDP automation to THIS tab's specific
    // board frame — disambiguating multiple tabs of the same board + the pre-reload
    // frame after a remount (US-796).
    [Endpoint.registerBoardFrame]: (boardId: string, boardHost: string, frameNonce?: string) => Promise<void>;
    [Endpoint.unregisterBoardFrame]: (boardId: string) => Promise<void>;
};

export enum EventEndpoint {
    eWindowMaximized = "eWindowMaximized",
    eBeforeQuit = "eBeforeQuit",
    eOpenFile = "eOpenFile",
    eOpenDiff = "eOpenDiff",
    eShowPage = "eShowPage",
    eMovePageIn = "eMovePageIn",
    eMovePageOut = "eMovePageOut",
    eZoomChanged = "eZoomChanged",
    eUpdateAvailable = "eUpdateAvailable",
    eOpenUrl = "eOpenUrl",
    eOpenExternalUrl = "eOpenExternalUrl",
    eDownloadStarted = "eDownloadStarted",
    eDownloadProgress = "eDownloadProgress",
    eDownloadCompleted = "eDownloadCompleted",
    eDownloadFailed = "eDownloadFailed",
    eDownloadCleared = "eDownloadCleared",
    eMcpStatusChanged = "eMcpStatusChanged",
    eMnemeStatusChanged = "eMnemeStatusChanged",
    eBoardNotify = "eBoardNotify",
    eBoardOpenRawLink = "eBoardOpenRawLink",
    // Main → host renderer: delivers a per-board MessagePort (EPIC-037 / US-771).
    // Carried via webContents.postMessage with the port on `event.ports[0]`, so it
    // is consumed through the preload's ports-aware `onPort` (NOT the typed event
    // system, which drops `event.ports`). No EventApi entry for that reason.
    eBoardPort = "eBoardPort",
}

export interface EventSubscription {
    unsubscribe: () => void;
}

export interface EventObject<T> {
    subscribe: (callback: (data: T) => void) => EventSubscription;
    send: (data: T) => void;
}

export type EventApi = {
    [EventEndpoint.eWindowMaximized]: EventObject<boolean>;
    [EventEndpoint.eBeforeQuit]: EventObject<void>;
    [EventEndpoint.eOpenFile]: EventObject<string>;
    [EventEndpoint.eOpenDiff]: EventObject<{ firstPath: string; secondPath: string }>;
    [EventEndpoint.eShowPage]: EventObject<string>;
    [EventEndpoint.eMovePageIn]: EventObject<{ page: PageDescriptor; targetPageId: string | undefined }>;
    [EventEndpoint.eMovePageOut]: EventObject<string>;
    [EventEndpoint.eZoomChanged]: EventObject<number>;
    [EventEndpoint.eUpdateAvailable]: EventObject<UpdateCheckResult>;
    [EventEndpoint.eOpenUrl]: EventObject<string>;
    [EventEndpoint.eOpenExternalUrl]: EventObject<string>;
    [EventEndpoint.eDownloadStarted]: EventObject<DownloadEntry>;
    [EventEndpoint.eDownloadProgress]: EventObject<{ id: string; receivedBytes: number; totalBytes: number }>;
    [EventEndpoint.eDownloadCompleted]: EventObject<{ id: string; savePath: string }>;
    [EventEndpoint.eDownloadFailed]: EventObject<{ id: string; error: string }>;
    [EventEndpoint.eDownloadCleared]: EventObject<DownloadEntry[]>;
    [EventEndpoint.eMcpStatusChanged]: EventObject<McpStatus>;
    [EventEndpoint.eMnemeStatusChanged]: EventObject<MnemeStatus>;
    // Board `persephone.notify()` → host renderer toast (US-724). Union
    // inlined to keep this shared module free of renderer-type imports.
    [EventEndpoint.eBoardNotify]: EventObject<{
        message: string;
        type?: "info" | "success" | "warning" | "error";
    }>;
    // Board `persephone.openRawLink(href, { editor })` → host renderer (US-756 C6).
    // `editor` is an optional registered editor id; the open pipeline falls back to
    // the default editor when omitted/unmatched.
    [EventEndpoint.eBoardOpenRawLink]: EventObject<{ href: string; editor?: string }>;
};

export enum RendererEvent {
    fileDropped = "file-dropped",
}
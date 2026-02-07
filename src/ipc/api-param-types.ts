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
    | "userData" // C:\Users\USERNAME\AppData\Roaming\js-notepad
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
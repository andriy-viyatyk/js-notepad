export interface IRuntimeVersions {
    electron: string;
    node: string;
    chrome: string;
}

export interface IUpdateInfo {
    currentVersion: string;
    latestVersion: string | null;
    updateAvailable: boolean;
    releaseUrl: string | null;
    releaseVersion: string | null;
    publishedAt: string | null;
    releaseNotes: string | null;
    error?: string;
}

export interface IVersionService {
    /** Runtime version info (Electron, Node, Chrome). */
    runtimeVersions(): Promise<IRuntimeVersions>;

    /** Check for updates. Returns update info. */
    checkForUpdates(force?: boolean): Promise<IUpdateInfo>;
}

export interface IEncryptionService {
    /** Encrypt text with password. Returns encrypted string. */
    encrypt(text: string, password: string): Promise<string>;

    /** Decrypt text with password. Returns decrypted string. */
    decrypt(encryptedText: string, password: string): Promise<string>;

    /** Check if text appears to be encrypted (checks version prefix). */
    isEncrypted(text: string): boolean;
}

export interface IShell {
    /** Open URL in the OS default browser. */
    openExternal(url: string): Promise<void>;

    /** Run the native screen-snip tool and return the captured PNG as a data URL,
     *  or null if the user cancelled or the tool failed. When `hideWindows` is true,
     *  Persephone's windows are hidden for the duration of the capture; when false,
     *  they stay visible (so the user can snip Persephone's own content). */
    startScreenSnip(hideWindows: boolean): Promise<string | null>;

    /** Version and update information. */
    readonly version: IVersionService;

    /** Content encryption/decryption (AES-GCM). */
    readonly encryption: IEncryptionService;
}

export interface ITextEditor {
    readonly id: "monaco";
    readonly name: string;
    /** True when the Monaco editor is visible and mounted. The
     *  queue layer defers commands until mount, so this is informational —
     *  consumers no longer need to gate calls on it. */
    readonly editorMounted: boolean;

    /** Get currently selected text, or empty string if no selection. */
    getSelectedText(): Promise<string>;

    /** Scroll to reveal a specific line in the center of the editor. */
    revealLine(lineNumber: number): void;

    /** Highlight all occurrences of text with find-match decorations. */
    setHighlightText(text?: string): void;

    /** Get current cursor position. Returns {lineNumber: 1, column: 1} if editor is not mounted. */
    getCursorPosition(): Promise<{ lineNumber: number; column: number }>;

    /** Insert text at current cursor position. */
    insertText(text: string): Promise<void>;

    /** Replace current selection with text. */
    replaceSelection(text: string): Promise<void>;

    /** Open Monaco's native find widget. */
    openFind(): void;

    /** Open Monaco's native find-and-replace widget. */
    openReplace(): void;

    /** Whether the text content is encrypted, or undefined while no text host is attached. */
    readonly encrypted: boolean | undefined;

    /** Whether this encrypted file is currently unlocked, or undefined while no text host is attached. */
    readonly decrypted: boolean | undefined;

    /** Whether this text file has encryption state, or undefined while no text host is attached. */
    readonly withEncryption: boolean | undefined;

    /** Open the button/cancel-only password dialog to encrypt or unlock the file. */
    showEncryptionDialog(message?: string): Promise<void>;

    /** Encrypt with the current in-memory password without accepting a password value. */
    encryptWithCurrentPassword(): Promise<void>;

    /** Remove encryption from the file content. */
    makeUnencrypted(): Promise<void>;

    /** Save the text file, optionally using Save As. */
    saveFile(saveAs?: boolean): Promise<boolean>;

    /** Rename the text file on disk. */
    renameFile(newName: string): Promise<boolean>;

    /** Open the Rename File dialog and rename after confirmation. */
    promptRename(): Promise<void>;

    /** Open the page's navigation/search panel when supported by this text page. */
    openSearchInNavPanel(): void;

    /** Execute the page script or its selection. */
    runScript(all?: boolean): Promise<void>;

    /** Execute the related script or its selection. */
    runRelatedScript(all?: boolean): Promise<void>;

    /** Whether the related script panel is open, or undefined while no text host is attached. */
    readonly scriptPanelOpen: boolean | undefined;

    /** Whether the related script has a selection, or undefined while no text host is attached. */
    readonly scriptHasSelection: boolean | undefined;

    /** Selected library script path, null for ad-hoc, or undefined while no text host is attached. */
    readonly scriptSelectedScript: string | null | undefined;

    /** Whether the related script has unsaved library changes, or undefined while no text host is attached. */
    readonly scriptDirty: boolean | undefined;

    /** Available related-script library paths, or undefined while no text host is attached. */
    readonly scriptAvailableScripts: string[] | undefined;

    /** Open or close the related script panel. */
    toggleScriptPanel(): void;

    /** Select a library script by path, or use the ad-hoc script when omitted. */
    selectScript(scriptPath?: string): Promise<void>;

    /** Save the related script to the script library. */
    saveScript(): Promise<void>;

    /** Open the selected related script, or a library-rooted empty page, in a new tab. */
    openScriptInTab(): Promise<void>;

    /** Close the related script panel if it is open. */
    closeScriptPanel(): void;
}

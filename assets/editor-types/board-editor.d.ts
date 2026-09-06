import type {
    IBrowserElementLocator,
    IBrowserNetworkRequest,
    IBrowserScreenshot,
    IBrowserTab,
} from "./browser-editor";

export type BoardRenderState = "trusted" | "untrusted" | "not-found";

export interface IBoardSecondaryViewDeclaration {
    readonly id: string;
    readonly html?: string;
    readonly title?: string;
}

export interface IBoardManifest {
    readonly schemaVersion: number;
    readonly name?: string;
    readonly description?: string;
    readonly author?: string;
    readonly repository?: string;
    readonly version?: string;
    readonly standalone?: boolean;
    readonly minAppVersion?: string;
    readonly fileMasks?: readonly string[];
    readonly folderMasks?: readonly string[];
    readonly editorPriority?: number;
    readonly editorName?: string;
    readonly editorKind?: "simple" | "content-host";
    readonly editorSources?: "local" | "any";
    readonly secondaryViews?: readonly IBoardSecondaryViewDeclaration[];
}

export interface IBoardSecondaryView {
    readonly id: string;
    readonly panelId: string;
    readonly html?: string;
    readonly title?: string;
    readonly expanded?: boolean;
}

export interface IBoardReloadResult {
    readonly refreshed: true;
    readonly pageId: string;
    readonly frameReady: boolean;
    readonly renderState: BoardRenderState;
}

export interface IBoardEditor {
    readonly id: "board-view" | `board-editor:${string}`;
    readonly name: string;
    readonly boardRoot: string | undefined;
    readonly boardName: string | undefined;
    readonly renderState: BoardRenderState;
    getManifest(): Promise<IBoardManifest | undefined>;
    readonly secondaryViews: readonly IBoardSecondaryView[] | undefined;
    readonly statusText: string | undefined;
    readonly busy: boolean | undefined;
    readonly frameReady: boolean | undefined;
    readonly contentHostError: string | undefined;
    reload(): Promise<IBoardReloadResult>;
    /** Main frame and declared secondary-view frames. */
    readonly tabs: IBrowserTab[];
    /** The selected board frame. */
    readonly activeTab: IBrowserTab | undefined;
    snapshot(options?: { tabId?: string }): Promise<string>;
    click(locator: IBrowserElementLocator, options?: { tabId?: string }): Promise<void>;
    hover(locator: IBrowserElementLocator, options?: { tabId?: string }): Promise<void>;
    type(locator: IBrowserElementLocator, text: string, options?: { tabId?: string; slowly?: boolean; submit?: boolean }): Promise<void>;
    select(locator: IBrowserElementLocator, values: string | string[], options?: { tabId?: string }): Promise<void>;
    pressKey(key: string, options?: { tabId?: string }): Promise<void>;
    evaluate(expression: string, options?: { tabId?: string }): Promise<unknown>;
    waitFor(options: {
        selector?: string;
        text?: string;
        textGone?: string;
        time?: number;
        timeout?: number;
        tabId?: string;
    }): Promise<void>;
    screenshot(options?: { tabId?: string }): Promise<IBrowserScreenshot | undefined>;
    networkRequests(options?: { tabId?: string }): Promise<IBrowserNetworkRequest[]>;
    /** Switch to the main frame or a declared secondary-view frame. */
    switchTab(tabId: string): Promise<void>;
}

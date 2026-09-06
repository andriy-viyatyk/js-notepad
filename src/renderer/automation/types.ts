import type { CdpSession } from "./CdpSession";

/** Tab info returned by IBrowserTarget. */
export interface ITargetTab {
    id: string;
    url: string;
    title: string;
    loading: boolean;
    active: boolean;
}

/** Lightweight adapter interface — what the automation layer needs from the browser editor. */
export interface IBrowserTarget {
    /** Editor model ID (for page identification). */
    readonly id: string;

    /** CDP session for a specific tab (or active tab if omitted). */
    cdp(tabId?: string): CdpSession;

    /** Focus the webview element so it receives keyboard events. */
    focusWebview(tabId?: string): void;

    /** Insert text into the focused element via Electron's native webview.insertText(). */
    insertText(text: string, tabId?: string): Promise<void>;

    /** Navigation */
    navigate(url: string): void;
    back(): void;
    forward(): void;
    reload(): void;

    /** Tab management */
    readonly tabs: ReadonlyArray<ITargetTab>;
    readonly activeTab: ITargetTab | undefined;
    addTab(url?: string): string;
    closeTab(tabId?: string): void;
    /** Select the active tab. Async for targets that must mount the tab's frame on demand
     *  (a board auto-expands + waits for a secondary-view frame); sync `void` otherwise. */
    switchTab(tabId: string): void | Promise<void>;

    /** Optional: ensure a tab is attachable before a command runs (e.g. a board expands
     *  + waits for a secondary-view frame). Omit when tabs are always ready. */
    ensureReady?(tabId?: string): Promise<void>;
}

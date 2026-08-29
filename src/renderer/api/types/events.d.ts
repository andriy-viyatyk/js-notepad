import type { ILinkData } from "./io.link-data";

/**
 * Menu item definition for context menus and popup menus.
 *
 * @example
 * const item: MenuItem = {
 *     label: "Generate Graph",
 *     onClick: () => runGraphScript(target.path),
 * };
 */
export interface MenuItem {
    label: string;
    onClick?: () => void;
    disabled?: boolean;
    icon?: any;
    invisible?: boolean;
    /** When true, a separator line is shown above this item. */
    startGroup?: boolean;
    hotKey?: string;
    /** Initially highlighted item. */
    selected?: boolean;
    id?: string;
    /** Sub-menu items. */
    items?: MenuItem[];
    minor?: boolean;
}

/** Base event passed through an EventChannel. */
export interface IBaseEvent {
    /** Set to `true` to short-circuit the pipeline in sendAsync(). */
    handled: boolean;
}

/**
 * Identifies the source/kind of context menu.
 * Allows scripts to filter events in a global `onContextMenu` channel.
 */
export type ContextMenuTargetKind =
    | "page-tab"
    | "file-explorer-item"
    | "file-explorer-background"
    | "sidebar-folder"
    | "sidebar-background"
    | "markdown-link"
    | "browser-webview"
    | "browser-url-bar"
    | "browser-tab"
    | "grid-cell"
    | "graph-node"
    | "graph-area"
    | "link-item"
    | "link-pinned"
    | "tree-provider-item"
    | "tree-provider-background"
    | "generic";

/**
 * Context menu event. Generic over the target type.
 *
 * @example
 * app.events.fileExplorer.itemContextMenu.subscribe((event) => {
 *     if (event.target.name === "package.json") {
 *         event.items.push({ label: "Generate Deps Graph", onClick: () => { ... } });
 *     }
 * });
 */
export interface IContextMenuEvent<T> extends IBaseEvent {
    /** Identifies the source of this context menu event. */
    readonly targetKind: ContextMenuTargetKind;
    readonly target: T;
    /** Menu items. Subscribers can push, remove, or replace items. */
    items: MenuItem[];
}

/** File target for file explorer context menu events. */
export interface IFileTarget {
    /** Full file path. */
    path: string;
    /** File name with extension. */
    name: string;
    /** True if this is a directory. */
    isDirectory: boolean;
}

/** Concrete type alias for file explorer context menu events. */
export type FileContextMenuEvent = IContextMenuEvent<IFileTarget>;

/**
 * A typed event channel. Subscribe to receive events.
 *
 * @example
 * const release = channel.subscribe((event) => {
 *     console.log("Event received:", event);
 * });
 * // Later: release();
 */
export interface IEventChannel<T extends { handled?: boolean }> {
    /** Register a handler (sync or async). In sendAsync: newest subscriber runs first (LIFO). */
    subscribe(handler: (event: T) => void | Promise<void>): () => void;
    /** Send an event synchronously. Calls all subscribers in FIFO order. */
    send(event: T): void;
    /** Send an event asynchronously. Calls subscribers in LIFO order, awaiting each.
     *  Returns `true` when completed (always true in current implementation). */
    sendAsync(event: T): Promise<boolean>;
}

/**
 * Bookmark event — fired before the Add/Edit Bookmark dialog opens.
 * Scripts can modify properties to alter what the user sees in the dialog.
 *
 * @example
 * app.events.browser.onBookmark.subscribe((event) => {
 *     if (event.href.includes("youtube.com")) {
 *         // Strip expiring query params from YouTube thumbnail URLs
 *         event.discoveredImages = event.discoveredImages.map(url => url.split("?")[0]);
 *     }
 * });
 */
export interface IBookmarkEvent extends IBaseEvent {
    /** Page title (editable). */
    title: string;
    /** Page URL (editable). */
    href: string;
    /** Images discovered on the page (editable — add, remove, or replace). */
    discoveredImages: string[];
    /** Currently selected image URL (editable). */
    imgSrc: string;
    /** Bookmark category (editable). */
    category: string;
    /** Bookmark tags (editable). */
    tags: string[];
    /** True if editing an existing bookmark, false if adding new. */
    readonly isEdit: boolean;
}

/** File explorer event channels. */
export interface IFileExplorerEvents {
    /** Fired when right-clicking a file or folder in the file explorer. */
    readonly itemContextMenu: IEventChannel<FileContextMenuEvent>;
}

/** Browser event channels. */
export interface IBrowserEvents {
    /** Fired before the Add/Edit Bookmark dialog opens. */
    readonly onBookmark: IEventChannel<IBookmarkEvent>;
}

/**
 * Application event channels for scripting integration.
 *
 * @example
 * app.events.fileExplorer.itemContextMenu.subscribe((event) => {
 *     if (event.target.name === "package.json") {
 *         event.items.push({ label: "Generate Deps Graph", onClick: () => runScript() });
 *     }
 * });
 */
export interface IAppEvents {
    readonly fileExplorer: IFileExplorerEvents;
    readonly browser: IBrowserEvents;
    /** Layer 1: Raw string → parsed link. Parsers subscribe here. */
    readonly openRawLink: IEventChannel<ILinkData>;
    /** Layer 2: Structured link → provider + transformers. Resolvers subscribe here. */
    readonly openLink: IEventChannel<ILinkData>;
    /** Layer 3: Content pipe + target → open page. Openers subscribe here. */
    readonly openContent: IEventChannel<ILinkData>;
}

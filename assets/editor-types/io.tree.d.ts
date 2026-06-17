/**
 * ITreeProvider — browsable data source abstraction.
 *
 * Enumerates children and provides tree operations (list, rename, delete, move).
 * Complements IProvider (reads/writes one resource) the same way a file explorer
 * complements a text editor.
 *
 * All content-returning methods are async. Simpler providers (ArchiveTreeProvider,
 * LinkTreeProvider) return immediately via Promise.resolve(); FileTreeProvider
 * does real disk I/O.
 */
export interface ITreeProvider {
    /** Provider type identifier (e.g., "file", "archive", "link"). */
    readonly type: string;
    /** Display name for UI. */
    readonly displayName: string;
    /** Root URL/path for this tree. */
    readonly sourceUrl: string;
    /** Path to pass to list() for root-level listing. */
    readonly rootPath: string;

    /** List direct children at a path. Returns ILink entries. */
    list(path: string): Promise<ILink[]>;
    /** Get metadata for a specific path. */
    stat(path: string): Promise<ITreeStat>;
    /** Resolve a child path to a raw link string for the open pipeline. */
    resolveLink(path: string): string;

    /** Return a raw link for opening an item via the openRawLink pipeline.
     *  For files: returns item.href. For directories: returns a tree-category:// link. */
    getNavigationUrl(item: ILink): string;

    /** Break a category path into ordered breadcrumb segments (root → leaf), EXCLUDING the
     *  root chip itself. Each segment's `category` can be fed to encodeCategoryLink({ category })
     *  to navigate there. Returns [] when `category` is the root. */
    getCategorySegments(category: string): ICategorySegment[];

    /** Resolve a stored href back to a navigation URL.
     *  Uses stat() to determine isDirectory, then delegates to getNavigationUrl().
     *  Useful for panel switch navigation where only the href is stored. */
    getNavigationUrlByHref(href: string): Promise<string>;

    /** Whether this tree supports root navigation (move up to parent, make subfolder root). */
    readonly navigable: boolean;

    /** Whether this tree supports write operations. */
    readonly writable: boolean;

    /** Trait type id used when DRAGGING a node from this provider's tree. Defaults to
     *  `"ILink"` (LINK-only). A provider returns its own id to attach extra traits — e.g.
     *  Mneme returns `"MnemeLink"` so its drag also carries `IFileLink` (cross-root copy). */
    readonly dragTraitTypeId?: string;

    /** Create a directory at the given path. */
    mkdir?(path: string): Promise<void>;
    /** Rename or move a file/directory. */
    rename?(oldPath: string, newPath: string): Promise<void>;

    /** Add a new item (link or file). */
    addItem?(item: Partial<ILink> & { href: string }): Promise<ILink>;
    /** Update item properties by href. */
    updateItem?(href: string, changes: Partial<ILink>): Promise<ILink>;
    /** Delete an item by href. */
    deleteItem?(href: string): Promise<void>;

    /** Move multiple items to a target category in one batch. */
    moveToCategory?(hrefs: string[], targetCategory: string): Promise<void>;
    /** Move an entire category sub-tree to a new parent category. */
    renameCategoryPath?(sourcePath: string, targetCategory: string): Promise<void>;
    /** Delete multiple items in one batch. */
    deleteItems?(hrefs: string[]): Promise<void>;

    /** Import dropped file-like items (e.g. OS files) into `targetCategory`. The provider
     *  reads each item's bytes and stores them. Optional — providers without import support
     *  omit it (and the tree won't advertise a file-drop zone). Takes `IFileLink[]`, never
     *  DOM `File` — provider-agnostic. */
    importFiles?(items: IFileLink[], targetCategory: string): Promise<void>;

    /** Import dropped link items (e.g. links dragged from another window's collection)
     *  into `targetCategory`. Unlike `importFiles`, this stores link metadata by href
     *  (no byte copy) and is implemented by catalog providers (link collections). A
     *  duplicate href is moved into `targetCategory` rather than duplicated. */
    importLinks?(items: ILink[], targetCategory: string): Promise<void>;

    /** Search items — async, yields results progressively. */
    search?(query: string, options: ITreeSearchOptions): ITreeSearchHandle;

    /** Whether this tree supports tag-based navigation. */
    readonly hasTags: boolean;
    /** Get all tags with item counts. Only available when hasTags is true. */
    getTags?(): ITreeTagInfo[];
    /** Get items matching a specific tag. Only available when hasTags is true. */
    getTagItems?(tag: string): ILink[];

    /** Whether this tree supports hostname-based navigation. */
    readonly hasHostnames: boolean;
    /** Get all hostnames with item counts. Only available when hasHostnames is true. */
    getHostnames?(): ITreeTagInfo[];
    /** Get items matching a specific hostname. Only available when hasHostnames is true. */
    getHostnameItems?(hostname: string): ILink[];

    /** Whether this tree supports pinning items. */
    readonly pinnable: boolean;
    /** Pin an item by href. */
    pin?(href: string): void;
    /** Unpin an item by href. */
    unpin?(href: string): void;
    /** Get all pinned items. */
    getPinnedItems?(): ILink[];

    /** Release resources. */
    dispose?(): void;
}

/**
 * Universal link item — used by tree providers, link collections, and scripts.
 *
 * This is the "Everything is a Link" type: one item type used everywhere —
 * Explorer, Archive, Link collections, scripts.
 */
export interface ILink {
    /** Unique identifier. Optional for tree provider items (href is unique within a category). */
    id?: string;
    /** Display title. */
    title: string;
    /** Resolved link string — URL, file path, or archive path. */
    href: string;
    /** Folder path using "/" separators. */
    category: string;
    /** Metadata tags — extension, type, etc. */
    tags: string[];
    /** Whether this entry is a directory/container. */
    isDirectory: boolean;
    /** File size in bytes. */
    size?: number;
    /** Last modified time (ISO string). */
    mtime?: string;
    /** Optional preview image URL or file path. Used for tile view thumbnails. */
    imgSrc?: string;
    /**
     * Whether this directory has sub-directories.
     * - `undefined` — unknown, assume expandable (default for FileTreeProvider/ArchiveTreeProvider)
     * - `true` / `false` — explicitly set by provider (LinkTreeProvider)
     */
    hasSubDirectories?: boolean;
    /**
     * Whether this directory has leaf items (non-directory children).
     * - `undefined` — unknown, assume expandable
     * - `true` / `false` — explicitly set by provider (LinkTreeProvider)
     */
    hasItems?: boolean;
    /** Preferred editor target for opening this link (e.g., "image-view", "monaco"). */
    target?: string;
    /** Optional semantic icon hint (e.g., "git") overriding the default folder/file icon. */
    icon?: string;
}

/** @deprecated Use ILink instead. */
export type ITreeProviderItem = ILink;

/**
 * A droppable file-like item — the data shape behind the `IFileLink` trait
 * (`/src/renderer/core/traits/fileLinkTraits.ts`). Produced by OS file drops (and,
 * later, other sources); consumed by trees that import files. `getBytes` works for
 * every producer; `filePath` is the OS path when known.
 *
 * Declared here (alongside ILink) rather than in `fileLinkTraits.ts` so this
 * script-API type file stays a self-contained leaf — the editor-types bundler only
 * follows imports within `api/types/`, never into runtime modules.
 */
export interface IFileLink {
    name: string;
    filePath?: string;
    getBytes(): Promise<Uint8Array>;
}

/** One breadcrumb segment: a folder on the path from root to the current category. */
export interface ICategorySegment {
    /** Display label for the segment (folder name). */
    label: string;
    /** Category value to navigate to (pass to encodeCategoryLink as `category`). */
    category: string;
}

/** Tag or hostname info with item count. */
export interface ITreeTagInfo {
    /** Tag or hostname value. */
    name: string;
    /** Number of items with this tag/hostname. */
    count: number;
}

/** File/directory metadata. */
export interface ITreeStat {
    /** Whether the path exists. */
    exists: boolean;
    /** Whether the path is a directory. */
    isDirectory: boolean;
    /** File size in bytes. */
    size?: number;
    /** Last modified time (ISO string). */
    mtime?: string;
}

/** Options for ITreeProvider.search(). */
export interface ITreeSearchOptions {
    /** Category to search within (empty string = root). */
    category: string;
    /** Filter by tags (e.g., only search in ["ts", "tsx"] files). */
    tags?: string[];
    /** Maximum number of results (default: 200). */
    limit?: number;
}

/** Handle for a progressive search operation. */
export interface ITreeSearchHandle {
    /** Subscribe to progressive results — called with each new batch of matches. */
    onResults(callback: (items: ITreeSearchResult[]) => void): void;
    /** Subscribe to progress updates (files scanned count). */
    onProgress?(callback: (filesSearched: number) => void): void;
    /** Cancel the search. */
    cancel(): void;
    /** Resolves when the search is complete. */
    done: Promise<void>;
}

/** A search result item with match context. */
export interface ITreeSearchResult extends ILink {
    /** Matched line numbers within the file (for content search). */
    matchLines?: number[];
    /** Preview snippet of the matched content. */
    matchPreview?: string;
}

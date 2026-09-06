/** A live sidebar panel contributed by one editor instance on a page. */
export interface IPagePanel {
    /** Bare registered panel id. */
    readonly id: string;
    /** Current display label. */
    readonly label: string;
    /** Owning EditorModel instance id. */
    readonly editorId: string;
    /** Owning EditorModel kind/registry id. */
    readonly editorKind: string;
    /** Whether this rendered panel is expanded. */
    readonly expanded: boolean;
}

/** Live sidebar panels and whole-sidebar controls for a page. */
export interface IPagePanels {
    /** Current rendered panel records, in sidebar order. */
    readonly items: readonly IPagePanel[];
    /** Observation of the sidebar's current visibility; readonly. */
    readonly isOpen: boolean;
    /** Measured sidebar width, or null until the lazy sidebar model exists; readonly. */
    readonly width: number | null;
    /**
     * Expand a bare panel id. If multiple owners contribute that id, the first rendered
     * owner is selected; use each item's editorId to see the distinct owners. Composite
     * rendered keys are not accepted.
     */
    expand(panelId: string): void;
    /**
     * Show or hide the whole sidebar container. Throws when the page has no sidebar panels.
     * Closing an individual panel is performed by that panel's own header control.
     */
    toggleSidebar(): void;
    readonly explorer: IExplorerPanel | undefined;
    readonly search: ISearchPanel | undefined;
    readonly boards: IBoardsPanel | undefined;
    readonly git: IGitPanel | undefined;
    readonly notebookCategories: IPagePanelNode | undefined;
    readonly notebookTags: IPagePanelNode | undefined;
    readonly rest: IPagePanelNode | undefined;
    readonly archive: IPagePanelNode | undefined;
    readonly fileHistory: IPagePanelNode | undefined;
    readonly elements: readonly IPagePanelElement[];
    highlight(name: string, message?: string): Promise<unknown>;
}

export interface IPagePanelElement {
    readonly name: string;
    readonly purpose: string;
    readonly selector: string;
    readonly visible: boolean;
}

export interface IPagePanelNode {
    readonly id: string;
    readonly label: string;
    readonly ownerEditorId: string;
    readonly expanded: boolean;
    readonly state: Record<string, unknown>;
    readonly elements: readonly IPagePanelElement[];
    close?(): Promise<void>;
}

export interface IExplorerPanel extends IPagePanelNode {
    readonly rootPath: string | undefined;
    readonly selectedHref: string | undefined;
    readonly providerType: string | undefined;
    readonly items: Promise<readonly Record<string, unknown>[] | undefined>;
    readonly itemCount: Promise<number | undefined>;
    listItems(): Promise<Record<string, unknown>[] | undefined>;
    openItem(item: Record<string, unknown>): Promise<void>;
    revealItem(href: string): void;
    navigateUp(): void;
    openSearch(folder?: string): void;
    openBoards(): void;
}

export interface ISearchPanel extends IPagePanelNode {
    readonly query: string | undefined;
    readonly includePattern: string | undefined;
    readonly excludePattern: string | undefined;
    readonly searchFolder: string | undefined;
    readonly results: readonly Record<string, unknown>[] | undefined;
    readonly totalMatches: number | undefined;
    readonly totalFiles: number | undefined;
    openSearchResult(path: string, lineNumber?: number): Promise<void>;
}

export interface IBoardsPanel extends IPagePanelNode {
    readonly rootPath: string | undefined;
    readonly tab: "boards" | "tools" | undefined;
    readonly boards: readonly string[] | undefined;
    readonly tools: readonly { readonly root: string; readonly name: string }[] | undefined;
    readonly boardCount: number | undefined;
    readonly toolsetCount: number | undefined;
    setTab(tab: "boards" | "tools"): void;
    openBoard(root: string): void;
    openToolset(root: string): void;
}

export interface IGitPanel extends IPagePanelNode {
    readonly activeTab: "changes" | "branches" | "tags" | undefined;
    readonly branch: string | undefined;
    readonly staged: readonly Record<string, unknown>[] | undefined;
    readonly unstaged: readonly Record<string, unknown>[] | undefined;
    readonly refs: Record<string, unknown> | undefined;
    readonly aheadBehind: Record<string, unknown> | undefined;
    readonly fileCount: number | undefined;
    refresh(): void;
    selectTab(tab: "changes" | "branches" | "tags"): void;
    setAlphabetical(value: boolean): void;
    openChange(path: string, list?: "unstaged" | "staged"): void;
    revealRef(name: string, kind: "branch" | "remote-branch" | "tag"): void;
}

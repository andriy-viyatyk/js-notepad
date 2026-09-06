import type { IPageHost } from "../../api/pages/IPageHost";
import type { EditorModel } from "../../editors/base/EditorModel";
import { parseBoardSecondaryPanelId } from "../../editors/board/board-secondary";
import { ExplorerEditor } from "../../editors/explorer/ExplorerEditorModel";
import { GitTreeEditorModel } from "../../editors/git-tree/GitTreeEditorModel";
import { createElements } from "./elements";
import { activatePageAndWaitForLayout, pageScopeSelector } from "./page-elements";
import { ui } from "../../api/ui";
import { isCompositePanelKey, panelKey } from "../../ui/secondary-views/panel-key";
import { secondaryViewRegistry } from "../../ui/secondary-views/secondary-view-registry";
import type { IAiChild, IAiElementDeclaration, IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";
import type { IPagePanel } from "../../api/types/page-panels";
import type { ITreeProviderItem } from "../../api/types/io.tree";

interface BoardPanelDeclaration { id: string; title?: string; }
interface BoardPanelOwnerState { secondaryViewDefs?: BoardPanelDeclaration[]; }
interface RenderedPanel extends IPagePanel { model: EditorModel; panelId: string; }

const PAGE_PANELS_MEMBERS: readonly IAiMember[] = [
    { name: "items", kind: "property", summary: "Live sidebar panel records in renderer order, including bare id, label, owner identity, and expanded state." },
    { name: "isOpen", kind: "property", summary: "Whether the page sidebar is open; read-only model state, false before the lazy sidebar model exists." },
    { name: "width", kind: "property", summary: "Current sidebar width; read-only and null before the lazy sidebar model exists." },
    { name: "expand", kind: "method", signature: "expand(panelId: string)", summary: "Expand a panel by bare id; duplicate ids resolve to the first rendered owner and composite ids are rejected.", caution: "changes the visible UI" },
    { name: "toggleSidebar", kind: "method", signature: "toggleSidebar()", summary: "Flip the whole sidebar container open or closed; never creates an Explorer. Throws when the page has no panels, and when closing is refused because a non-Explorer panel keeps the sidebar open.", caution: "changes the visible UI" },
];

const PANEL_NODE_MEMBERS: readonly IAiMember[] = [
    { name: "explorer", kind: "property", node: true, summary: "The live Explorer panel node, when present on this page." },
    { name: "search", kind: "property", node: true, summary: "The live Search panel node, when present on this page." },
    { name: "boards", kind: "property", node: true, summary: "The live Boards panel node, when present on this page." },
    { name: "git", kind: "property", node: true, summary: "The live merged Git panel node, when present on this page." },
    { name: "notebookCategories", kind: "property", node: true, summary: "The live Notebook Categories panel node, when present on this page." },
    { name: "notebookTags", kind: "property", node: true, summary: "The live Notebook Tags panel node, when present on this page." },
    { name: "rest", kind: "property", node: true, summary: "The live REST panel node, when present on this page." },
    { name: "archive", kind: "property", node: true, summary: "The live Archive panel node, when present on this page." },
    { name: "fileHistory", kind: "property", node: true, summary: "The live File History panel node, when present on this page." },
];

const SIDEBAR_ELEMENTS: readonly IAiElementDeclaration[] = [
    { name: "page-nav-panel", purpose: "The page toolbar control that opens the file Explorer sidebar." },
    { name: "secondary-views-container", purpose: "The page's sidebar panel container; present while the sidebar is open." },
    { name: "secondary-views-stack", purpose: "The collapsible stack of the page's sidebar panels." },
    { name: "secondary-views-splitter", purpose: "Resizes the page's sidebar." },
];

const ALIAS_TO_PANEL_ID: Readonly<Record<string, string>> = {
    explorer: "explorer", search: "search", boards: "boards", git: "git-changes",
    notebookCategories: "notebook-categories", notebookTags: "notebook-tags", rest: "rest-panel",
    archive: "archive-tree", fileHistory: "git-diff-revisions",
};

function panelLabel(model: EditorModel, panelId: string): string {
    const boardViewId = parseBoardSecondaryPanelId(panelId);
    if (boardViewId !== null) {
        const state = model.state.get() as BoardPanelOwnerState;
        const declaration = state.secondaryViewDefs?.find(view => view.id === boardViewId);
        return declaration?.title ?? (boardViewId || "View");
    }
    return secondaryViewRegistry.get(panelId)?.label ?? panelId;
}

/**
 * How many refs of each kind `summarize()` shows before falling back to a count.
 *
 * `summarize()` is what an agent receives merely for navigating to the git panel, and a real
 * repository has hundreds of branches and tags — this repo answered with about 170 of them before
 * the cap, on every read. The full lists stay on the node's `refs` member for a caller that wants
 * them; this is the at-a-glance view.
 */
const REF_SAMPLE_LIMIT = 15;

function sampleRefs(values: readonly string[]): Record<string, unknown> {
    return values.length > REF_SAMPLE_LIMIT
        ? { count: values.length, sample: values.slice(0, REF_SAMPLE_LIMIT), truncated: true }
        : { count: values.length, sample: [...values], truncated: false };
}

function summarizeRefs(refs: {
    /** Optional in `GitRefs` — a detached or freshly initialised repo may have no current ref. */
    current?: string;
    localBranches: readonly string[];
    remotes: readonly string[];
    remoteBranches: readonly string[];
    tags: readonly string[];
}): Record<string, unknown> {
    return {
        current: refs.current,
        remotes: [...refs.remotes],
        localBranches: sampleRefs(refs.localBranches),
        remoteBranches: sampleRefs(refs.remoteBranches),
        tags: sampleRefs(refs.tags),
        note: "Counts with a capped sample; read the panel's refs member for the full lists.",
    };
}

function panelState(record: RenderedPanel): Record<string, unknown> {
    if (record.model instanceof ExplorerEditor) {
        if (record.panelId === "search") {
            const search = record.model.searchState;
            return search ? {
                kind: "search", query: search.query, includePattern: search.includePattern,
                excludePattern: search.excludePattern, searchFolder: search.searchFolder,
                results: search.results.slice(0, 200).map(result => ({ ...result })),
                totalMatches: search.totalMatches, totalFiles: search.totalFiles,
            } : { kind: "search" };
        }
        if (record.panelId === "boards") {
            return {
                kind: "boards", rootPath: record.model.rootPath || undefined,
                tab: record.model.boardsTab, boards: record.model.listBoards(), tools: record.model.listToolsets(),
            };
        }
        return {
            kind: "explorer", rootPath: record.model.rootPath || undefined,
            selectedHref: record.model.selectionState.get().selectedHref ?? undefined,
            providerType: record.model.treeProvider?.type,
        };
    }
    if (record.model instanceof GitTreeEditorModel && record.panelId === "git-changes") {
        const state = record.model.state.get();
        if (!state.repoRoot) return { kind: "git" };
        const changes = record.model.changes.state.get();
        const refs = record.model.branches.state.get().refs;
        return {
            kind: "git", activeTab: state.gitPanelTab ?? "changes", branch: changes.branch,
            staged: changes.staged.map(change => ({ ...change })), unstaged: changes.unstaged.map(change => ({ ...change })),
            // Counts plus a capped sample, not the whole ref database. summarize() is what an agent
            // gets merely for *navigating* to this node, and a real repository has hundreds of
            // branches and tags — this one answered with ~170 before the cap. The full lists stay
            // available on the `refs` member for a caller that actually wants them.
            refs: summarizeRefs(refs),
            aheadBehind: { ...record.model.branches.state.get().aheadBehind },
        };
    }
    return { kind: record.editorKind, panelId: record.panelId };
}

function panelKind(record: RenderedPanel): "explorer" | "search" | "boards" | "git" | "generic" {
    if (record.model instanceof ExplorerEditor) {
        if (record.panelId === "search") return "search";
        if (record.panelId === "boards") return "boards";
        if (record.panelId === "explorer") return "explorer";
    }
    if (record.model instanceof GitTreeEditorModel && record.panelId === "git-changes") return "git";
    return "generic";
}

function panelElements(kind: ReturnType<typeof panelKind>): readonly IAiElementDeclaration[] {
    const explorer = [
        ["explorer-secondary-view", "The Explorer panel body."], ["explorer-header-actions", "The Explorer header action group."],
        ["explorer-up", "Navigate the Explorer root upward."], ["explorer-search", "Open Search for the Explorer root."],
        ["explorer-boards", "Open Boards for the Explorer root."], ["explorer-collapse-all", "Locate the view-owned collapse-all control; no facade action is attached."],
        ["explorer-close", "Close the Explorer sidebar."], ["explorer-open-board", "Open a visible board manifest; this selector may repeat."],
        ["explorer-open-toolset", "Open a visible toolset; this selector may repeat."], ["explorer-open-git", "Open a visible Git Tree entry; this selector may repeat."],
        ["explorer-open-mneme", "Open a visible Mneme root; this selector may repeat."],
    ] as const;
    const search = [["search-secondary-view", "The Search panel body."], ["search-secondary-close", "Close Search."]] as const;
    const boards = [
        ["boards-empty", "The Boards empty state."], ["boards-empty-actions", "The Boards empty-state action group."],
        ["boards-create-empty", "Locate empty-state board creation; no facade creation action is attached."], ["boards-create-demo-empty", "Locate empty-state Demo board creation; no facade creation action is attached."],
        ["boards-secondary-view", "The Boards panel body."], ["boards-tools-switch-bar", "The Boards/Tools switch bar."], ["boards-close", "Close Boards."],
        ["boards-tools-switch", "Switch the model-owned Boards/Tools display."], ["boards-create", "Locate board creation; no facade creation action is attached."],
        ["explorer-boards", "The data-driven Boards tree; inspect copied board state instead."], ["explorer-tools", "The data-driven Tools tree; inspect copied toolset state instead."],
    ] as const;
    const git = [
        ["git-panel", "The merged Git panel body."], ["git-panel-toolbar", "The Git panel toolbar host."], ["git-panel-tabs", "Switch Git Changes/Branches/Tags."],
        ["git-branches-sort-alpha", "Switch Git ref ordering."], ["git-panel-header-actions", "The Git panel header action host."], ["git-panel-refresh", "Refresh Git model projections."],
        ["git-panel-close", "Close the Git panel/editor through its model lifecycle."], ["git-panel-repo-name", "The Git repository label."], ["git-changes", "The Changes view root."],
        ["git-changes-unstaged", "The unstaged changes list."], ["git-changes-staged", "The staged changes list."], ["git-changes-toolbar", "The Changes toolbar."],
        ["git-changes-file", "A repeated changed-file control; it does not identify a path or row.", '[data-name="git-changes-unstaged"], [data-name="git-changes-staged"]'], ["git-commit", "Locate Commit; no facade commit action is attached."],
        ["git-stage", "Locate Stage; no facade stage action is attached."], ["git-unstage", "Locate Unstage; no facade unstage action is attached."], ["git-changes-splitter", "The Changes panel splitter."],
        ["git-branches-tree", "The data-driven branch tree."], ["git-tags-tree", "The data-driven tag tree."],
    ] as const;
    const source: readonly (readonly [string, string, string?])[] = kind === "explorer" ? explorer : kind === "search" ? search : kind === "boards" ? boards : kind === "git" ? git : [];
    return source.map(([name, purpose, selector]) => ({ name, purpose, ...(selector ? { selector } : {}) }));
}

function panelSpecificMembers(kind: ReturnType<typeof panelKind>): readonly IAiMember[] {
    if (kind === "explorer") return [
        { name: "rootPath", kind: "property", summary: "The Explorer root, or undefined without a provider." }, { name: "selectedHref", kind: "property", summary: "The selected Explorer href, or undefined without a selection." },
        { name: "providerType", kind: "property", summary: "The Explorer provider type, or undefined without a provider." }, { name: "items", kind: "property", summary: "A promise of copied root items; [] is a real empty directory." },
        { name: "itemCount", kind: "property", summary: "A promise of the copied root item count." }, { name: "listItems", kind: "method", signature: "listItems()", summary: "List copied Explorer items." },
        { name: "openItem", kind: "method", signature: "openItem(item)", summary: "Open an Explorer item through the model path.", caution: "navigates the current page" }, { name: "revealItem", kind: "method", signature: "revealItem(href)", summary: "Reveal an Explorer item when its mounted panel is active." },
        { name: "navigateUp", kind: "method", signature: "navigateUp()", summary: "Navigate the Explorer root upward." }, { name: "openSearch", kind: "method", signature: "openSearch(folder?)", summary: "Open Search for the Explorer root." },
        { name: "openBoards", kind: "method", signature: "openBoards()", summary: "Open Boards for the Explorer root." }, { name: "close", kind: "method", signature: "close()", summary: "Close the Explorer sidebar." },
    ];
    if (kind === "search") return [
        { name: "query", kind: "property", summary: "The current search query." }, { name: "includePattern", kind: "property", summary: "The current include pattern." }, { name: "excludePattern", kind: "property", summary: "The current exclude pattern." },
        { name: "searchFolder", kind: "property", summary: "The current search folder." }, { name: "results", kind: "property", summary: "Copied search result rows, or undefined before Search state exists." },
        { name: "totalMatches", kind: "property", summary: "The total search match count." }, { name: "totalFiles", kind: "property", summary: "The total search file count." },
        { name: "openSearchResult", kind: "method", signature: "openSearchResult(path, lineNumber?)", summary: "Open a search result through the model path.", caution: "navigates the current page" }, { name: "close", kind: "method", signature: "close()", summary: "Close Search." },
    ];
    if (kind === "boards") return [
        { name: "rootPath", kind: "property", summary: "The Boards root, or undefined without a usable Explorer root." }, { name: "tab", kind: "property", summary: "The model-owned Boards/Tools tab." },
        { name: "boards", kind: "property", summary: "Copied board roots under the Explorer root." }, { name: "tools", kind: "property", summary: "Copied registered toolset roots under the Explorer root." },
        { name: "boardCount", kind: "property", summary: "The board count." }, { name: "toolsetCount", kind: "property", summary: "The toolset count." },
        { name: "setTab", kind: "method", signature: "setTab(tab)", summary: "Switch the model-owned Boards/Tools tab." }, { name: "openBoard", kind: "method", signature: "openBoard(root)", summary: "Open a board through the model path.", caution: "navigates the current page" },
        { name: "openToolset", kind: "method", signature: "openToolset(root)", summary: "Open a toolset through the model path.", caution: "navigates the current page" }, { name: "close", kind: "method", signature: "close()", summary: "Close Boards." },
    ];
    if (kind === "git") return [
        { name: "activeTab", kind: "property", summary: "The active Git Changes/Branches/Tags tab." }, { name: "branch", kind: "property", summary: "The current branch, or undefined for detached/no repository." },
        { name: "staged", kind: "property", summary: "Copied staged changes, or undefined without a repository." }, { name: "unstaged", kind: "property", summary: "Copied unstaged changes, or undefined without a repository." },
        { name: "refs", kind: "property", summary: "Copied refs, or undefined without a repository." }, { name: "aheadBehind", kind: "property", summary: "Copied ahead/behind counts." }, { name: "fileCount", kind: "property", summary: "The count of distinct changed paths." },
        { name: "refresh", kind: "method", signature: "refresh()", summary: "Refresh Git model projections." }, { name: "selectTab", kind: "method", signature: "selectTab(tab)", summary: "Select the Git panel tab." }, { name: "setAlphabetical", kind: "method", signature: "setAlphabetical(value)", summary: "Set Git ref ordering." },
        { name: "openChange", kind: "method", signature: "openChange(path, list?)", summary: "Open a validated change through the model path.", caution: "navigates the current page" }, { name: "revealRef", kind: "method", signature: "revealRef(name, kind)", summary: "Reveal a loaded ref in the mounted Git Tree." }, { name: "close", kind: "method", signature: "close()", summary: "Close the Git panel/editor through its model lifecycle." },
    ];
    return [];
}

const PANEL_HELP = `Panel nodes are live and page-scoped. Their id, label, ownerEditorId, expanded,
state, and elements are read at call time; deferred panels expose only generic state and elements: [].
Current-task nodes expose copied model state and model/page actions. Repeated controls use
highlightOptions: { all: true }: count is total matching controls and highlighted is rings drawn, and
a repeated selector does not identify a row, path, change, or ref index. Git mutation controls remain
element-only. Reading children(), provide(), or index() never creates Explorer, a sidebar model, or a view.`;

export class PagePanelNode implements IAiVisible {
    constructor(private readonly hostProvider: () => IPageHost | null, private readonly resolver: () => RenderedPanel | undefined) {}
    private get record(): RenderedPanel | undefined { return this.resolver(); }
    private get owner(): EditorModel | undefined { return this.record?.model; }
    private get kind(): ReturnType<typeof panelKind> { const record = this.record; return record ? panelKind(record) : "generic"; }
    get id(): string { return this.record?.id ?? ""; }
    get label(): string { return this.record?.label ?? ""; }
    get ownerEditorId(): string { return this.record?.editorId ?? ""; }
    get expanded(): boolean { return this.record?.expanded ?? false; }
    get state(): Record<string, unknown> { const record = this.record; return record ? panelState(record) : {}; }

    get rootPath(): string | undefined { const owner = this.owner; return owner instanceof ExplorerEditor && owner.rootPath ? owner.rootPath : undefined; }
    get selectedHref(): string | undefined { const owner = this.owner; return owner instanceof ExplorerEditor ? owner.selectionState.get().selectedHref ?? undefined : undefined; }
    get providerType(): string | undefined { const owner = this.owner; return owner instanceof ExplorerEditor ? owner.treeProvider?.type : undefined; }
    get items(): Promise<readonly Record<string, unknown>[] | undefined> { return this.listItems(); }
    get itemCount(): Promise<number | undefined> { return this.listItems().then(items => items?.length); }
    listItems(): Promise<Record<string, unknown>[] | undefined> { const owner = this.owner; return owner instanceof ExplorerEditor ? owner.listItems().then(items => items?.map(item => ({ ...item, tags: [...item.tags] }))) : Promise.resolve(undefined); }
    openItem(item: Record<string, unknown>): Promise<void> { const owner = this.requireExplorer(); return owner.openItem(item as unknown as ITreeProviderItem); }
    revealItem(href: string): void { this.requireExplorer().revealItem(href); }
    navigateUp(): void { this.requireExplorer().navigateUp(); }
    openSearch(folder?: string): void { this.requireExplorer().openSearch(folder); }
    openBoards(): void { this.requireExplorer().openBoards(); }

    private searchState() { const owner = this.owner; return owner instanceof ExplorerEditor && this.id === "search" ? owner.searchState : undefined; }
    get query(): string | undefined { return this.searchState()?.query; }
    get includePattern(): string | undefined { return this.searchState()?.includePattern; }
    get excludePattern(): string | undefined { return this.searchState()?.excludePattern; }
    get searchFolder(): string | undefined { return this.searchState()?.searchFolder; }
    get results(): readonly Record<string, unknown>[] | undefined { return this.searchState()?.results.slice(0, 200).map(result => ({ ...result })); }
    get totalMatches(): number | undefined { return this.searchState()?.totalMatches; }
    get totalFiles(): number | undefined { return this.searchState()?.totalFiles; }
    openSearchResult(path: string, lineNumber?: number): Promise<void> { return this.requireExplorer().openSearchResult(path, lineNumber); }

    get tab(): "boards" | "tools" | undefined { const owner = this.owner; return owner instanceof ExplorerEditor && owner.rootPath ? owner.boardsTab : undefined; }
    get boards(): string[] | undefined { const owner = this.owner; return owner instanceof ExplorerEditor && owner.rootPath ? owner.listBoards() : undefined; }
    get tools(): Array<{ root: string; name: string }> | undefined { const owner = this.owner; return owner instanceof ExplorerEditor && owner.rootPath ? owner.listToolsets() : undefined; }
    get boardCount(): number | undefined { return this.boards?.length; }
    get toolsetCount(): number | undefined { return this.tools?.length; }
    setTab(tab: "boards" | "tools"): void { this.requireExplorer().setBoardsTab(tab); }
    openBoard(root: string): void { this.requireExplorer().openBoard(root); }
    openToolset(root: string): Promise<void> { return this.requireExplorer().openToolset(root); }

    private gitOwner(): GitTreeEditorModel | undefined { const owner = this.owner; return owner instanceof GitTreeEditorModel && this.id === "git-changes" ? owner : undefined; }
    get activeTab(): "changes" | "branches" | "tags" | undefined { return this.gitOwner()?.state.get().gitPanelTab ?? "changes"; }
    get branch(): string | undefined { return this.gitOwner()?.changes.state.get().branch; }
    private gitChanges(list: "staged" | "unstaged"): Array<Record<string, unknown>> | undefined { const owner = this.gitOwner(); return owner?.state.get().repoRoot ? owner.changes.state.get()[list].map(change => ({ ...change })) : undefined; }
    get staged(): Array<Record<string, unknown>> | undefined { return this.gitChanges("staged"); }
    get unstaged(): Array<Record<string, unknown>> | undefined { return this.gitChanges("unstaged"); }
    get refs(): Record<string, unknown> | undefined { const owner = this.gitOwner(); if (!owner?.state.get().repoRoot) return undefined; const refs = owner.branches.state.get().refs; return { current: refs.current, localBranches: [...refs.localBranches], remotes: [...refs.remotes], remoteBranches: [...refs.remoteBranches], tags: [...refs.tags] }; }
    get aheadBehind(): Record<string, unknown> | undefined { const owner = this.gitOwner(); return owner?.state.get().repoRoot ? { ...owner.branches.state.get().aheadBehind } : undefined; }
    get fileCount(): number | undefined { const paths = [...(this.staged ?? []), ...(this.unstaged ?? [])]; return paths.length ? new Set(paths.map(change => change.path)).size : (this.staged && this.unstaged ? 0 : undefined); }
    refresh(): void { this.requireGit().refresh(); }
    selectTab(tab: "changes" | "branches" | "tags"): void { this.requireGit().setGitPanelTab(tab); }
    setAlphabetical(value: boolean): void { this.requireGit().setBranchesAlphabetical(value); }
    openChange(path: string, list: "unstaged" | "staged" = "unstaged"): void { const owner = this.requireGit(); const changes = list === "staged" ? owner.changes.state.get().staged : owner.changes.state.get().unstaged; const change = changes.find(item => item.path === path); if (!change) throw new Error(`Git action unavailable: no ${list} change with path ${JSON.stringify(path)}.`); owner.openChangeDiff({ ...change }, list); }
    revealRef(name: string, kind: "branch" | "remote-branch" | "tag"): void { this.requireGit().revealRefForFacade(name, kind); }
    async close(): Promise<void> { const owner = this.owner; if (owner instanceof ExplorerEditor) { if (this.id === "search") owner.closeSearch(); else if (this.id === "boards") owner.closeBoards(); else owner.page?.setSecondaryViewsState({ open: false }); return; } if (owner instanceof GitTreeEditorModel) { await owner.requestClose(); return; } throw new Error("Panel close unavailable: this deferred panel has no current-task close path."); }

    get aiVision(): IAiVisionDescriptor {
        const declarations = panelElements(this.kind);
        const host = this.hostProvider(); const record = this.record;
        const scopeSelector = host && record ? `${pageScopeSelector(host.id)} [data-type="collapsible-panel"][data-name=${JSON.stringify(record.panelId)}]` : undefined;
        const elements = createElements(declarations, ui.highlightElement.bind(ui), { scopeSelector, beforeHighlight: host ? () => activatePageAndWaitForLayout(host.id) : undefined, highlightOptions: { all: true } });
        return { kind: this.kind === "generic" ? "PagePanel" : `${this.kind[0].toUpperCase()}${this.kind.slice(1)}Panel`, summary: this.kind === "generic" ? "Generic deferred sidebar panel node." : `Model-backed ${this.kind} sidebar panel node.`, members: [...PANEL_COMMON_MEMBERS, ...panelSpecificMembers(this.kind), ...elements.members], elements: declarations, provide: elements.provide, help: PANEL_HELP, summarize: () => ({ kind: "PagePanel", id: this.id, label: this.label, ownerEditorId: this.ownerEditorId, expanded: this.expanded, state: this.state }) };
    }
    private requireExplorer(): ExplorerEditor { const owner = this.owner; if (!(owner instanceof ExplorerEditor)) throw new Error("Explorer action unavailable: panel owner is not Explorer."); return owner; }
    private requireGit(): GitTreeEditorModel { const owner = this.gitOwner(); if (!owner || !owner.state.get().repoRoot) throw new Error("Git action unavailable: no repository is loaded."); return owner; }
}

const PANEL_COMMON_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The registered panel id." }, { name: "label", kind: "property", summary: "The current panel display label." },
    { name: "ownerEditorId", kind: "property", summary: "The owning editor instance id." }, { name: "expanded", kind: "property", summary: "Whether this rendered panel is expanded." },
    { name: "state", kind: "property", summary: "A copied panel-specific state snapshot." },
];

export class PagePanelsNode implements IAiVisible {
    constructor(private readonly hostProvider: () => IPageHost | null) {}
    private projectItems(host: IPageHost): RenderedPanel[] { const activePanel = host.activePanel; const activeIsComposite = isCompositePanelKey(activePanel); let bareActiveResolved = false; const items: RenderedPanel[] = []; for (const model of host.panelEditors) { const panelIds = (model.state.get() as { secondaryView?: string[] }).secondaryView ?? []; for (const panelId of panelIds) { if (!secondaryViewRegistry.has(panelId)) continue; const expanded = activeIsComposite ? activePanel === panelKey(model.id, panelId) : !bareActiveResolved && panelId === activePanel; if (expanded && !activeIsComposite) bareActiveResolved = true; items.push({ id: panelId, label: panelLabel(model, panelId), editorId: model.id, editorKind: model.editorId, expanded, model, panelId }); } } return items; }
    get items(): readonly IPagePanel[] { const host = this.hostProvider(); return host ? this.projectItems(host).map(({ model: _model, panelId: _panelId, ...item }) => item) : []; }
    get isOpen(): boolean { return this.hostProvider()?.secondaryViewsModel?.state.get().open ?? false; }
    get width(): number | null { return this.hostProvider()?.secondaryViewsModel?.state.get().width ?? null; }
    expand(panelId: string): void { if (isCompositePanelKey(panelId)) throw new Error("Page panel expansion accepts bare panel ids, not composite panel keys."); const host = this.hostProvider(); if (!host) throw new Error("Page is no longer attached."); host.expandPanel(panelId); }
    toggleSidebar(): void {
        const host = this.hostProvider();
        if (!host || this.projectItems(host).length === 0) {
            throw new Error("Page has no sidebar panels to show.");
        }
        // Stay consistent with `isOpen`, which reports false before the lazy model exists. Reading
        // a freshly-ensured model instead would see its `open: true` default and CLOSE the sidebar
        // for an agent that read `isOpen: false` and called this to open it.
        const sidebar = host.secondaryViewsModel;
        const open = sidebar ? sidebar.state.get().open : false;
        // PageModel.setSecondaryViewsState silently rewrites `open: false` to `true` while a
        // non-Explorer panel is present (its "mandatory-open clamp"). Reporting success for a
        // close that cannot happen is the silent failure this surface exists to eliminate.
        if (open && host.sidebarMandatory) {
            throw new Error(
                "This page's panels keep the sidebar open — it cannot be closed while they are"
                + " present. Only a page whose sole panel is the file Explorer can be closed.",
            );
        }
        host.setSecondaryViewsState({ open: !open });
    }
    children(): readonly IAiChild[] { const host = this.hostProvider(); if (!host) return []; const records = this.projectItems(host); const children: IAiChild[] = []; const aliases = new Set<string>(); for (const record of records) { const alias = Object.keys(ALIAS_TO_PANEL_ID).find(key => ALIAS_TO_PANEL_ID[key] === record.panelId); if (alias && !aliases.has(alias)) { aliases.add(alias); children.push({ segment: `.${alias}`, kind: `${panelKind(record)}Panel`, summary: `${record.label} panel` }); } children.push({ segment: `[${JSON.stringify(record.panelId)}]`, kind: `${panelKind(record)}Panel`, summary: `${record.label} panel owned by ${record.editorId}` }); } return children; }
    index(key: string | number): PagePanelNode | undefined { if (typeof key !== "string") return undefined; const panelId = ALIAS_TO_PANEL_ID[key] ?? key; const host = this.hostProvider(); if (!host || !this.projectItems(host).some(item => item.panelId === panelId)) return undefined; return new PagePanelNode(this.hostProvider, () => this.resolveRecord(panelId)); }
    provide(name: string): { value: unknown } | undefined { if (name === "elements" || name === "highlight") return this.sidebarElements().provide(name); const panelId = ALIAS_TO_PANEL_ID[name]; if (!panelId) return undefined; const host = this.hostProvider(); if (!host || !this.projectItems(host).some(item => item.panelId === panelId)) return undefined; return { value: new PagePanelNode(this.hostProvider, () => this.resolveRecord(panelId)) }; }
    get aiVision(): IAiVisionDescriptor { const elements = this.sidebarElements(); return { kind: "PagePanels", summary: "The page's live sidebar panels, whole-sidebar state, and sidebar controls.", members: [...PAGE_PANELS_MEMBERS, ...PANEL_NODE_MEMBERS, ...elements.members], children: () => this.children(), index: key => this.index(key), provide: name => this.provide(name), elements: SIDEBAR_ELEMENTS, help: `items is a live renderer-order projection of registered panels. Alias children resolve only while present; exact registered ids are indexable with page.panels["id"]. Duplicate owners remain visible in items and bare alias/index access chooses the first rendered owner. isOpen and width retain their false/null lazy-model contracts. children(), provide(), and index() are cheap and side-effect free; they never provision Explorer or a sidebar. Use each panel's own close control/lifecycle.`, summarize: () => ({ kind: "PagePanels", items: this.items, isOpen: this.isOpen, width: this.width }) }; }
    private sidebarElements() { const host = this.hostProvider(); return createElements(SIDEBAR_ELEMENTS, ui.highlightElement.bind(ui), { scopeSelector: host ? pageScopeSelector(host.id) : undefined, beforeHighlight: host ? () => activatePageAndWaitForLayout(host.id) : undefined }); }
    private resolveRecord(panelId: string): RenderedPanel | undefined { const host = this.hostProvider(); return host ? this.projectItems(host).find(item => item.panelId === panelId) : undefined; }
}

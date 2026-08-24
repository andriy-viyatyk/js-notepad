import { Subscription } from "../../core/state/events";
import { TModel } from "../../core/state/model";
import { TGlobalState } from "../../core/state/state";
import type { EditorModel } from "../../editors/base";
import type { HubTab } from "../../editors/tools-hub";
import { EditorView, PageDescriptor } from "../../../shared/types";
import { createLinkData } from "../../../shared/link-data";
import type { ILink } from "../types/io.tree";
import { PageModel } from "./PageModel";
import type { NavigatePageToOptions } from "./PageNavigator";

import { PagesQueryModel } from "./PagesQueryModel";
import { PagesNavigationModel } from "./PagesNavigationModel";
import { PagesPersistenceModel } from "./PagesPersistenceModel";
import { PagesLayoutModel } from "./PagesLayoutModel";
import { PagesLifecycleModel } from "./PagesLifecycleModel";

// ── State ────────────────────────────────────────────────────────────

const defaultOpenFilesState = {
    pages: [] as PageModel[],
    ordered: [] as PageModel[],
    leftRight: new Map<string, string>(),
    rightLeft: new Map<string, string>(),
    /** Compare-mode flag set keyed by left page id (walkthrough 06 / CK1). */
    compareGroups: new Set<string>(),
};

export type OpenFilesState = typeof defaultOpenFilesState;

// ── PagesModel ───────────────────────────────────────────────────────

export class PagesModel extends TModel<OpenFilesState> {
    onShow = new Subscription<PageModel>();
    onFocus = new Subscription<PageModel>();
    pageSubscriptions = new Map<string, () => void>();

    // ── Submodels (internal implementation) ──────────────────────────

    readonly query: PagesQueryModel;
    readonly navigation: PagesNavigationModel;
    readonly persistence: PagesPersistenceModel;
    readonly layout: PagesLayoutModel;
    readonly lifecycle: PagesLifecycleModel;

    constructor() {
        super(new TGlobalState(defaultOpenFilesState));
        this.query = new PagesQueryModel(this);
        this.persistence = new PagesPersistenceModel(this);
        this.layout = new PagesLayoutModel(this);
        this.navigation = new PagesNavigationModel(this);
        this.lifecycle = new PagesLifecycleModel(this);
    }

    // ── Internal methods (shared across submodels) ───────────────────

    attachPage = (page: PageModel) => {
        const pageId = page.id;
        const editorSubs = new Map<string, () => void>();

        const reconcileEditorSubs = () => {
            const present = new Set(page.editors.map((e) => e.id));
            for (const [id, unsub] of editorSubs) {
                if (!present.has(id)) {
                    unsub();
                    editorSubs.delete(id);
                }
            }
            for (const editor of page.editors) {
                if (editorSubs.has(editor.id)) continue;
                const sub = editor.descriptorChanged.subscribe(() => {
                    this.persistence.saveStateDebounced();
                });
                editorSubs.set(editor.id, () => sub.unsubscribe());
            }
        };

        reconcileEditorSubs();
        const pageUnsub = page.state.subscribe(() => {
            reconcileEditorSubs();
            this.persistence.saveStateDebounced();
        });

        this.pageSubscriptions.set(pageId, () => {
            for (const unsub of editorSubs.values()) unsub();
            editorSubs.clear();
            pageUnsub();
        });

        page.onClose = () => {
            this.detachPage(page);
            this.removePage(page);
            page.dispose();
        };
    };

    /** Kept as a no-op for callers from before . The new attachPage
     *  reconciles editor subscriptions automatically when `editors[]` changes. */
    resubscribeEditor = (_page: PageModel) => {
        // No-op — see attachPage.
    };

    detachPage = (page: PageModel) => {
        const pageId = page.id;
        const unsubscribe = this.pageSubscriptions.get(pageId);
        if (unsubscribe) {
            unsubscribe();
            this.pageSubscriptions.delete(pageId);
        }
        page.onClose = undefined;
    };

    /**
     * Remove a page from `pages[]` / `ordered[]`. Does NOT dispose the page —
     * `detachPage` cleared `onClose`, and the cross-window transfer path
     * (walkthrough 05 / M4) relies on this. CK7: drops compareGroups entry
     * for the pair.
     */
    removePage = (page: PageModel) => {
        const isActivePage = this.query.activePage === page;
        // Identify the leftId of the pair (if any) before removal.
        const state = this.state.get();
        const pairLeftId = state.leftRight.has(page.id)
            ? page.id
            : state.rightLeft.get(page.id);

        this.state.update((s) => {
            s.pages = s.pages.filter((p) => p !== page);
            s.ordered = s.ordered.filter((p) => p !== page);
            // Read `compareGroups` off the pre-update snapshot, never off the draft.
            // `TOneState.update` runs immer `produce` and this repository deliberately
            // does not call `enableMapSet()` (US-970), so *reading* a Set/Map property
            // on a draft makes immer try to proxy it and throw "The plugin for 'MapSet'
            // has not been loaded". Assigning one is fine, which is why every other
            // `compareGroups`/`leftRight`/`rightLeft` write in PagesLayoutModel is safe.
            // This path only ran when closing a page that was half of a grouped pair,
            // which is why it survived: `detachPage` had already cleared `page.onClose`,
            // so the throw left the page detached but still in `pages[]` — orphaned and
            // impossible to close again.
            if (pairLeftId && state.compareGroups.has(pairLeftId)) {
                const next = new Set(state.compareGroups);
                next.delete(pairLeftId);
                s.compareGroups = next;
            }
        });
        this.layout.fixGrouping();
        this.persistence.saveState();
        if (isActivePage) {
            const ordered = this.state.get().ordered;
            if (ordered.length) {
                this.onShow.send(ordered[ordered.length - 1]);
                this.onFocus.send(ordered[ordered.length - 1]);
            }
        }
        this.checkEmptyPage();
    };

    checkEmptyPage = () => {
        setTimeout(() => {
            if (this.state.get().pages.length === 0) {
                this.lifecycle.addEmptyPage();
            }
        }, 0);
    };

    /**
     * Close the first page if it's a fresh empty Monaco page and there are
     * exactly two pages total. Walkthrough 01 / L3 + A3: delegate to the
     * editor's `isFreshEmpty()` instead of hardcoding state-field checks.
     */
    closeFirstPageIfEmpty = () => {
        const pages = this.state.get().pages;
        if (pages.length !== 2) return;
        const firstPage = pages[0];
        if (firstPage.pinned) return;
        // Use the editor instance so isFreshEmpty() resolves correctly.
        if (firstPage.mainEditorInstance?.isFreshEmpty?.() === true) {
            firstPage.close();
        }
    };

    // ── Public API delegates ─────────────────────────────────────────

    // Query delegates
    get activePage() {
        return this.query.activePage;
    }
    get groupedPage() {
        return this.query.groupedPage;
    }
    findPage = (pageId?: string) => this.query.findPage(pageId);
    getGroupedPage = (withPageId: string) =>
        this.query.getGroupedPage(withPageId);
    getLeftGroupedPage = (withPageId: string) =>
        this.query.getLeftGroupedPage(withPageId);
    isLastPage = (pageId?: string) => this.query.isLastPage(pageId);
    isGrouped = (pageId: string) => this.query.isGrouped(pageId);
    canCompare = (leftId: string, rightId: string) =>
        this.query.canCompare(leftId, rightId);
    isInCompareMode = (pageId: string) => this.query.isInCompareMode(pageId);
    getTextFileHost = (pageId: string) => this.query.getTextFileHost(pageId);
    get pages() {
        return this.query.pages;
    }

    // Navigation delegates
    showPage = (pageId?: string) => this.navigation.showPage(pageId);
    showNext = () => this.navigation.showNext();
    showPrevious = () => this.navigation.showPrevious();
    focusPage = (page: PageModel) => this.navigation.focusPage(page);

    // Lifecycle delegates
    addPage = (editor: EditorModel | null, existingPage?: PageModel) =>
        this.lifecycle.addPage(editor, existingPage);
    addEmptyPage = () => this.lifecycle.addEmptyPage();
    addEmptyPageWithNavPanel = (folderPath: string) =>
        this.lifecycle.addEmptyPageWithNavPanel(folderPath);
    addEditorPage = (editor: EditorView, language: string, title: string, content?: string) =>
        this.lifecycle.addEditorPage(editor, language, title, content);
    addDrawPage = (dataUrl: string, title?: string) =>
        this.lifecycle.addDrawPage(dataUrl, title);
    openLinks = (links: (ILink | string)[], title?: string) =>
        this.lifecycle.openLinks(links, title);
    openFile = async (filePath?: string) => {
        if (!filePath) return undefined;
        const { app } = await import("../app");
        await app.events.openRawLink.sendAsync(createLinkData(filePath));
        return this.query.findPageByFilePath(filePath);
    };
    openFileAsArchive = (filePath: string) =>
        this.lifecycle.openFileAsArchive(filePath);
    closePage = (pageId: string) => this.lifecycle.closePage(pageId);
    openFileWithDialog = () => this.lifecycle.openFileWithDialog();
    openFileFromDialog = () => this.lifecycle.openFileFromDialog();
    openDiff = (
        params: { firstPath: string; secondPath: string } | undefined
    ) => this.lifecycle.openDiff(params);
    navigatePageTo = (
        pageId: string,
        newFilePath: string,
        options?: NavigatePageToOptions,
    ) => this.lifecycle.navigatePageTo(pageId, newFilePath, options);
    closeToTheRight = (pageId: string) =>
        this.lifecycle.closeToTheRight(pageId);
    closeOtherPages = (pageId: string) =>
        this.lifecycle.closeOtherPages(pageId);
    movePageIn = (data?: {
        page: PageDescriptor;
        targetPageId: string | undefined;
    }) => this.lifecycle.movePageIn(data);
    movePageOut = (pageId?: string) => this.lifecycle.movePageOut(pageId);
    duplicatePage = (pageId: string) => this.lifecycle.duplicatePage(pageId);
    handleOpenUrl = (url: string) => this.lifecycle.handleOpenUrl(url);
    handleExternalUrl = (url: string) =>
        this.lifecycle.handleExternalUrl(url);
    openPathInNewWindow = (filePath: string) =>
        this.lifecycle.openPathInNewWindow(filePath);
    requireGroupedText = (pageId: string, suggestedLanguage?: string) =>
        this.lifecycle.requireGroupedText(pageId, suggestedLanguage);
    requireWellKnownPage = (id: string) => this.lifecycle.requireWellKnownPage(id);
    showAboutPage = () => this.lifecycle.showAboutPage();
    showSettingsPage = () => this.lifecycle.showSettingsPage();
    showBrowserPage = (options?: {
        profileName?: string;
        incognito?: boolean;
        tor?: boolean;
        url?: string;
    }) => this.lifecycle.showBrowserPage(options);
    showMcpInspectorPage = (options?: { url?: string; name?: string; autoConnect?: boolean }) =>
        this.lifecycle.showMcpInspectorPage(options);
    showMnemeConfigPage = () => this.lifecycle.showMnemeConfigPage();
    showStorybookPage = () => this.lifecycle.showStorybookPage();
    showToolsHubPage = (opts?: { tab?: HubTab }) => this.lifecycle.showToolsHubPage(opts);
    showVideoPlayerPage = () => this.lifecycle.showVideoPlayerPage();
    openImageInNewTab = (imageUrl: string, title?: string) =>
        this.lifecycle.openImageInNewTab(imageUrl, title);
    openUrlInBrowserTab = (
        url: string,
        options?: {
            incognito?: boolean;
            profileName?: string;
            external?: boolean;
        }
    ) => this.lifecycle.openUrlInBrowserTab(url, options);

    // Layout delegates
    moveTab = (fromId: string, toId: string) =>
        this.layout.moveTab(fromId, toId);
    moveTabByIndex = (fromIndex: number, toIndex: number) =>
        this.layout.moveTabByIndex(fromIndex, toIndex);
    pinTab = (pageId: string) => this.layout.pinTab(pageId);
    unpinTab = (pageId: string) => this.layout.unpinTab(pageId);
    group = (leftPageId: string, rightPageId: string) =>
        this.layout.group(leftPageId, rightPageId);
    ungroup = (pageId: string) => this.layout.ungroup(pageId);
    groupTabs = (
        pageId1: string,
        pageId2: string,
        enforceAdjacency = false
    ) => this.layout.groupTabs(pageId1, pageId2, enforceAdjacency);
    fixGrouping = () => this.layout.fixGrouping();
    enterCompareMode = (pageId: string) => this.layout.enterCompareMode(pageId);
    exitCompareMode = (pageId: string) => this.layout.exitCompareMode(pageId);

    // Persistence delegates
    saveState = () => this.persistence.saveState();
    saveStateDebounced = () => this.persistence.saveStateDebounced();
    onAppQuit = () => this.persistence.onAppQuit();
    init = () => this.persistence.init();
}

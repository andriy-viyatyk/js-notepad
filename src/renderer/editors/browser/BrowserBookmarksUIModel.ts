const fs = require("fs");
import { BrowserBookmarks, createEmptyLinkFile } from "./BrowserBookmarks";
import { showEditLinkDialog } from "../link-editor/EditLinkDialog";
import { ui } from "../../api/ui";
import { api } from "../../../ipc/renderer/api";
import { settings, BrowserProfile } from "../../api/settings";
import type { BrowserEditorModel } from "./BrowserEditorModel";
import type { LinkItem } from "../link-editor/linkTypes";
import { app } from "../../api/app";
import { BookmarkEvent } from "../../api/events/events";
import { withTimeout } from "../../core/utils/utils";
import { DisposableStore } from "../../core/utils/DisposableStore";

/** Tracked image URLs from a specific navigation level. */
export interface TrackedImageLevel {
    level: number;
    imgUrls: string[];
}

const BOOKMARKS_FILE_FILTER = { name: "Link Files", extensions: ["link.json"] };

/**
 * How long a bookmark may wait on the page for its suggested images before the dialog
 * opens without them. The probe runs on the page's own renderer thread, so a loading or
 * busy page can hold it indefinitely — and the URL and title, which are the parts that
 * matter, are already known from our own tab state.
 */
const IMAGE_DISCOVERY_TIMEOUT = 1000;

/**
 * Manages bookmarks UI: drawer visibility, star button, image discovery,
 * and tracked images for the browser editor.
 */
export class BrowserBookmarksUIModel {
    readonly model: BrowserEditorModel;

    /** Per-tab tracked images for bookmark image discovery. */
    trackedImagesRef = new Map<string, TrackedImageLevel[]>();

    /** Cleanup function for linkEditor state subscription. */
    private bookmarksSub: (() => void) | null = null;
    /** Cleanup function for model state subscription (urlInput tracking). */
    private urlTrackingSub: (() => void) | null = null;
    private readonly subscriptions = new DisposableStore();

    constructor(model: BrowserEditorModel) {
        this.model = model;
    }

    /** Unsubscribe from all state subscriptions. */
    dispose = () => {
        this.bookmarksSub?.();
        this.bookmarksSub = null;
        this.urlTrackingSub?.();
        this.urlTrackingSub = null;
    };

    // =====================================================================
    // Bookmarks Initialization
    // =====================================================================

    /** Ensure bookmarks are loaded, prompting user to associate a file if needed. */
    ensureBookmarks = async (): Promise<BrowserBookmarks | null> => {
        if (this.model.tabs.bookmarks) {
            return this.model.tabs.bookmarks;
        }

        let filePath = this.model.tabs.getBookmarksFilePath();

        // If the configured file no longer exists, treat as unconfigured
        if (filePath && !fs.existsSync(filePath)) {
            filePath = "";
        }

        if (!filePath) {
            const choice = await ui.confirm(
                "This profile has no bookmarks file associated.\nChoose an option:",
                { title: "Bookmarks File", buttons: ["Select a file", "Create new file", "Cancel"] },
            );

            if (choice === "Select a file") {
                const result = await api.showOpenFileDialog({
                    title: "Select Bookmarks File",
                    filters: [BOOKMARKS_FILE_FILTER],
                });
                filePath = result?.[0] || "";
            } else if (choice === "Create new file") {
                const result = await api.showSaveFileDialog({
                    title: "Create Bookmarks File",
                    defaultPath: "bookmarks.link.json",
                    filters: [BOOKMARKS_FILE_FILTER],
                });
                if (result) {
                    filePath = result.endsWith(".link.json") ? result : result + ".link.json";
                    createEmptyLinkFile(filePath);
                }
            }

            if (!filePath) return null;

            // Persist the file path in settings for this profile
            const { profileName: pName, isIncognito: isInc } = this.model.state.get();
            if (isInc) {
                settings.set("browser-incognito-bookmarks-file", filePath);
            } else if (pName) {
                const profiles = settings.get("browser-profiles");
                settings.set("browser-profiles", profiles.map((p: BrowserProfile) =>
                    p.name === pName ? { ...p, bookmarksFile: filePath } : p,
                ));
            } else {
                const defaultName = settings.get("browser-default-profile");
                if (defaultName) {
                    const profiles = settings.get("browser-profiles");
                    settings.set("browser-profiles", profiles.map((p: BrowserProfile) =>
                        p.name === defaultName ? { ...p, bookmarksFile: filePath } : p,
                    ));
                } else {
                    settings.set("browser-default-bookmarks-file", filePath);
                }
            }
        }

        const bm = await this.model.tabs.initBookmarks(filePath);
        if (bm) {
            this.model.state.update((s) => { s.bookmarksReady = true; });
            this.startBookmarkTracking(bm);
        }
        return bm;
    };

    // =====================================================================
    // Bookmark Tracking (isBookmarked state)
    // =====================================================================

    /** Subscribe to linkEditor state changes to track whether current URL is bookmarked. */
    private startBookmarkTracking = (bm: BrowserBookmarks) => {
        // Clean up previous subscriptions
        this.dispose();

        // Track changes in the link editor (add/remove/edit bookmarks)
        this.bookmarksSub = this.subscriptions.add(bm.linkEditor.state.subscribe(
            () => this.updateIsBookmarked(),
            (state) => state.data.links,
        ));

        // Track urlInput changes to re-check isBookmarked
        this.urlTrackingSub = this.subscriptions.add(this.model.state.subscribe(
            () => this.updateIsBookmarked(),
            (state) => state.urlInput,
        ));

        this.updateIsBookmarked();
    };

    private updateIsBookmarked = () => {
        const bm = this.model.tabs.bookmarks;
        if (!bm) {
            this.model.state.update((s) => { s.isBookmarked = false; });
            return;
        }
        const { urlInput } = this.model.state.get();
        const found = !!bm.findByUrl(urlInput);
        const current = this.model.state.get().isBookmarked;
        if (found !== current) {
            this.model.state.update((s) => { s.isBookmarked = found; });
        }
    };

    // =====================================================================
    // Drawer Handlers
    // =====================================================================

    handleOpenBookmarks = async () => {
        const bm = await this.ensureBookmarks();
        if (bm) {
            this.model.state.update((s) => { s.bookmarksOpen = true; });
        }
    };

    handleBookmarkLinkClick = (url: string) => {
        const s = this.model.state.get();
        const currentTab = s.tabs.find((t) => t.id === s.activeTabId);
        const currentUrl = currentTab?.url || "";
        // Ctrl+Click (or Cmd+Click on Mac) opens in a new tab; plain click navigates current blank tab
        const e = window.event as KeyboardEvent | MouseEvent | undefined;
        const ctrlPressed = e?.ctrlKey || e?.metaKey;
        if (ctrlPressed || (currentUrl && currentUrl !== "about:blank")) {
            this.model.addTab(url);
        } else {
            this.model.navigate(url);
        }
        this.model.state.update((st) => { st.bookmarksOpen = false; });
    };

    handleCloseBookmarks = () => {
        this.model.state.update((s) => { s.bookmarksOpen = false; });
    };

    // =====================================================================
    // Star Button
    // =====================================================================

    /**
     * Re-entrancy guard for the star button. Everything before the dialog is async
     * (bookmark-file setup, favicon cache, the page image probe), so without this a user
     * who clicks the star again because nothing appeared yet ends up with one dialog per
     * click, all opening at once when the awaits finally settle.
     */
    private starClickBusy = false;

    /** Star button click: add or edit bookmark for the current URL. */
    handleStarClick = async () => {
        if (this.starClickBusy) return;
        this.starClickBusy = true;
        try {
            await this.runStarClick();
        } finally {
            this.starClickBusy = false;
        }
    };

    private runStarClick = async () => {
        const bm = await this.ensureBookmarks();
        if (!bm) return;

        const { urlInput, activeTabId, tabs, isIncognito, isTor } = this.model.state.get();

        // Cache the favicon for this hostname before showing the dialog.
        // US-896 — skip on Tor pages too: `saveFavicon` downloads over a raw Node
        // https request (no proxy at all) AND writes to the persistent on-disk
        // cache. The `page-favicon-updated` path in BrowserView already excludes
        // Tor; this one used to check only incognito.
        if (!isIncognito && !isTor) {
            const activeTab = tabs.find((t) => t.id === activeTabId);
            if (activeTab?.favicon) {
                const { getHostname, saveFavicon } = await import("../../components/icons/favicon-cache");
                const hostname = getHostname(urlInput);
                if (hostname) saveFavicon(hostname, activeTab.favicon);
            }
        }
        const existingLink = bm.findByUrl(urlInput);
        const metaImages = await this.discoverImages();
        const tracked = this.getTrackedImages(activeTabId);
        // Merge: meta-tag images first, then tracked images, deduplicated
        const seen = new Set(metaImages);
        const allImages = [...metaImages];
        for (const url of tracked) {
            if (!seen.has(url)) {
                allImages.push(url);
            }
        }

        const activeTab = tabs.find((t) => t.id === activeTabId);
        await this.showBookmarkDialog({
            title: activeTab?.pageTitle || "",
            href: urlInput,
            discoveredImages: allImages,
            existingLink,
        });
    };

    /**
     * Unified bookmark dialog entry point. Both star button and context menu
     * route through this method. Fires app.events.browser.onBookmark before
     * showing the dialog so scripts can modify bookmark data.
     */
    showBookmarkDialog = async (params: {
        title: string;
        href: string;
        discoveredImages: string[];
        imgSrc?: string;
        category?: string;
        tags?: string[];
        existingLink?: LinkItem;
    }): Promise<void> => {
        const bm = this.model.tabs.bookmarks;
        if (!bm) return;

        const isEdit = !!params.existingLink;

        // Fire onBookmark event — scripts can modify all parameters
        const bookmarkEvent = new BookmarkEvent(
            params.existingLink?.title ?? params.title,
            params.existingLink?.href ?? params.href,
            params.discoveredImages,
            params.existingLink?.imgSrc ?? params.imgSrc ?? "",
            params.existingLink?.category ?? params.category ?? "",
            params.existingLink?.tags ?? params.tags ?? [],
            isEdit,
        );
        await app.events.browser.onBookmark.sendAsync(bookmarkEvent);

        // Show dialog with (possibly modified) event data
        const bmState = bm.linkEditor.state.get();
        const result = await showEditLinkDialog({
            title: isEdit ? "Edit Bookmark" : "Add Bookmark",
            link: {
                title: bookmarkEvent.title,
                href: bookmarkEvent.href,
                imgSrc: bookmarkEvent.imgSrc || undefined,
                category: bookmarkEvent.category,
                tags: bookmarkEvent.tags,
            },
            categories: bmState.categories,
            tags: bmState.tags,
            discoveredImages: bookmarkEvent.discoveredImages,
            imageProxy: bm.linkEditor.imageProxy,
        });

        if (!result) return;

        if (params.existingLink) {
            bm.linkEditor.updateLink(params.existingLink.id, result);
        } else {
            bm.linkEditor.addLink(result);
        }
    };

    // =====================================================================
    // Image Discovery
    // =====================================================================

    /**
     * Extract og:image, twitter:image, and similar meta tag images from the active webview.
     * Bounded by `IMAGE_DISCOVERY_TIMEOUT` — returns `[]` rather than making the caller wait
     * on a page that cannot answer.
     */
    discoverImages = async (): Promise<string[]> => {
        const webview = this.model.webview.getActiveWebview();
        if (!webview) return [];
        try {
            const probe: Promise<string[]> = webview.executeJavaScript(`
                (() => {
                    const imgs = [];
                    const seen = new Set();
                    const add = (u) => {
                        try {
                            const abs = new URL(u, document.baseURI).href;
                            if (abs.startsWith('http') && !seen.has(abs)) {
                                seen.add(abs);
                                imgs.push(abs);
                            }
                        } catch {}
                    };
                    const og = document.querySelector('meta[property="og:image"]');
                    if (og) add(og.content);
                    const ogUrl = document.querySelector('meta[property="og:image:url"]');
                    if (ogUrl) add(ogUrl.content);
                    const tw = document.querySelector('meta[name="twitter:image"]')
                        || document.querySelector('meta[property="twitter:image"]');
                    if (tw) add(tw.content);
                    const schema = document.querySelector('meta[itemprop="image"]');
                    if (schema) add(schema.content);
                    const touch = document.querySelector('link[rel="apple-touch-icon"]');
                    if (touch) add(touch.href);
                    return imgs;
                })()
            `);
            return (await withTimeout(probe, IMAGE_DISCOVERY_TIMEOUT, [])) || [];
        } catch {
            return [];
        }
    };

    /** Collect all tracked images for a tab across all levels, deduplicated. */
    getTrackedImages = (tabId: string): string[] => {
        const tracked = this.trackedImagesRef.get(tabId) || [];
        const urls: string[] = [];
        const seen = new Set<string>();
        for (const entry of tracked) {
            for (const url of entry.imgUrls) {
                if (!seen.has(url)) {
                    seen.add(url);
                    urls.push(url);
                }
            }
        }
        return urls;
    };

    /** Add clicked images to a tab's level 0 tracking. Called from webview model. */
    trackClickedImages = (tabId: string, imgUrls: string[]) => {
        const tracked = this.trackedImagesRef.get(tabId) || [];
        let level0 = tracked.find((e) => e.level === 0);
        if (!level0) {
            level0 = { level: 0, imgUrls: [] };
            tracked.unshift(level0);
            this.trackedImagesRef.set(tabId, tracked);
        }
        for (const url of imgUrls) {
            if (url && !level0.imgUrls.includes(url)) {
                level0.imgUrls.push(url);
            }
        }
    };

    /** Shift tracked images on navigation: increment levels, drop > 2, add fresh level 0. */
    shiftTrackedImages = (tabId: string) => {
        const prev = this.trackedImagesRef.get(tabId) || [];
        const shifted = prev
            .map((e) => ({ level: e.level + 1, imgUrls: e.imgUrls }))
            .filter((e) => e.level <= 2);
        this.trackedImagesRef.set(tabId, [{ level: 0, imgUrls: [] }, ...shifted]);
    };
}

import { app } from "../api/app";
import { isArchivePath } from "../core/utils/file-path";
import { parseHttpRequest } from "../core/utils/curl-parser";
import { TREE_CATEGORY_PREFIX } from "./tree-providers/tree-provider-link";
import { GIT_TREE_PREFIX } from "./git-tree-link";
import { MNEME_FOLDER_PREFIX } from "./mneme-folder-link";
import { PERSEPHONE_BOARD_PREFIX } from "./persephone-board-link";
import { PERSEPHONE_TOOLSET_PREFIX } from "./persephone-toolset-link";
import { normalizeFileUrl, isFileUrl, isPlausibleFilePath } from "./link-utils";

/**
 * Register Layer 1 parsers on openRawLink.
 *
 * Registration order matters (LIFO execution):
 * 1. fileParser registered first → runs last (fallback)
 * 2. archiveParser registered second → runs first (checks for "!")
 *
 * Call during app bootstrap, before scripts load.
 */
export function registerRawLinkParsers(): void {
    // File parser — fallback for plain file paths and file:// URLs
    app.events.openRawLink.subscribe(async (data) => {
        let filePath = data.href;
        if (isFileUrl(filePath)) {
            filePath = normalizeFileUrl(filePath);
        }
        if (!isPlausibleFilePath(filePath)) {
            const { ui } = await import("../api/ui");
            ui.notify(`Invalid file path: ${filePath}`, "warning");
            data.handled = true;
            return;
        }
        data.url = filePath;
        data.handled = false;
        await app.events.openLink.sendAsync(data);
        data.handled = true;
    });

    // Archive parser — detects "!" separator
    app.events.openRawLink.subscribe(async (data) => {
        if (!isArchivePath(data.href)) return;
        let archivePath = data.href;
        if (isFileUrl(archivePath)) {
            archivePath = normalizeFileUrl(archivePath);
        }
        data.url = archivePath;
        data.handled = false;
        await app.events.openLink.sendAsync(data);
        data.handled = true;
    });

    // HTTP parser — detects http:// and https:// URLs
    app.events.openRawLink.subscribe(async (data) => {
        if (!data.href.startsWith("http://") && !data.href.startsWith("https://")) return;
        data.url = data.href;
        data.handled = false;
        await app.events.openLink.sendAsync(data);
        data.handled = true;
    });

    // data: URL parser — inline content (scripts, styles)
    app.events.openRawLink.subscribe(async (data) => {
        if (!data.href.startsWith("data:")) return;
        data.url = data.href;
        data.handled = false;
        await app.events.openLink.sendAsync(data);
        data.handled = true;
    });

    // mneme:// parser — Mneme wiki documents (EPIC-032). Routes to MnemeProvider
    // via the mneme:// resolver. Registered after the file fallback so it runs
    // first (LIFO) and the file parser never sees the scheme.
    app.events.openRawLink.subscribe(async (data) => {
        if (!data.href.startsWith("mneme://")) return;
        data.url = data.href;
        data.handled = false;
        await app.events.openLink.sendAsync(data);
        data.handled = true;
    });

    // tree-category:// parser — detects category links for folder/category navigation
    app.events.openRawLink.subscribe(async (data) => {
        if (!data.href.startsWith(TREE_CATEGORY_PREFIX)) return;
        data.url = data.href;
        data.target ??= "category-view";
        data.handled = false;
        await app.events.openLink.sendAsync(data);
        data.handled = true;
    });

    // git-tree:// parser — repo history view; navigates the current page
    // (the Explorer passes pageId, so openContent → navigatePageTo). Mirrors the
    // tree-category:// parser. (EPIC-030 / US-612)
    app.events.openRawLink.subscribe(async (data) => {
        if (!data.href.startsWith(GIT_TREE_PREFIX)) return;
        data.url = data.href;
        data.target ??= "git-tree";
        data.handled = false;
        await app.events.openLink.sendAsync(data);
        data.handled = true;
    });

    // mneme-folder:// parser — Mneme root editor; navigates the current page
    // (the Explorer passes pageId, so openContent → navigatePageTo). Mirrors the
    // git-tree:// parser. Opens the editor for a `.mneme` folder's root, distinct
    // from the `mneme://` document scheme above. (EPIC-032 / US-663)
    app.events.openRawLink.subscribe(async (data) => {
        if (!data.href.startsWith(MNEME_FOLDER_PREFIX)) return;
        data.url = data.href;
        data.target ??= "mneme-root";
        data.handled = false;
        await app.events.openLink.sendAsync(data);
        data.handled = true;
    });

    // persephone-board:// parser — opens a single board by its own root path
    // (US-748); routes to the board-view target. The link is a pure board
    // identifier — any per-open param rides as ILinkData metadata.
    app.events.openRawLink.subscribe(async (data) => {
        if (!data.href.startsWith(PERSEPHONE_BOARD_PREFIX)) return;
        data.url = data.href;
        data.target ??= "board-view";
        data.handled = false;
        await app.events.openLink.sendAsync(data);
        data.handled = true;
    });

    // persephone-toolset:// parser — opens a single toolset by its own root path
    // (US-805); routes to the toolset-view target. Mirrors the persephone-board://
    // parser above.
    app.events.openRawLink.subscribe(async (data) => {
        if (!data.href.startsWith(PERSEPHONE_TOOLSET_PREFIX)) return;
        data.url = data.href;
        data.target ??= "toolset-view";
        data.handled = false;
        await app.events.openLink.sendAsync(data);
        data.handled = true;
    });

    // cURL / fetch parser — detects "curl " or "fetch(" commands
    app.events.openRawLink.subscribe(async (data) => {
        const trimmed = data.href.trim();
        if (!/^(curl\s|fetch\()/i.test(trimmed)) return;

        const parsed = parseHttpRequest(trimmed);
        if (!parsed) return;

        // Set cURL-parsed fields, but don't override caller-provided values
        if (parsed.method !== "GET") data.method ??= parsed.method;
        if (Object.keys(parsed.headers).length > 0) data.headers ??= parsed.headers;
        if (parsed.body) data.body ??= parsed.body;

        data.url = parsed.url;
        data.handled = false;
        await app.events.openLink.sendAsync(data);
        data.handled = true;
    });
}

import { app } from "../api/app";
import { editorRegistry } from "../editors/base/editorRegistry";
import { isBoardEditorId, resolveEditorIdForFile } from "../editors/board/custom-editor-registry";
import { isArchivePath, parseArchivePath } from "../core/utils/file-path";
import { createPipeFromDescriptor } from "./registry";
import { resolveUrlToPipeDescriptor, isHttpUrl, toFileUrl } from "./link-utils";
import type { ILinkData } from "../../shared/link-data";
import { errMessage } from "../../shared/utils";

/**
 * Extract the effective path from a URL for editor resolution.
 * The effective path is the portion that carries the file extension,
 * which is passed to editorRegistry.resolve() for editor matching.
 *
 * - Archive paths ("C:\docs.zip!data/report.grid.json") → inner path after "!"
 * - HTTP URLs ("https://api.com/data.json?token=x") → pathname last segment
 * - Plain file paths → as-is
 */
export function extractEffectivePath(url: string): string {
    // Archive path: return inner path after "!"
    if (isArchivePath(url)) {
        const { innerPath } = parseArchivePath(url);
        return innerPath;
    }

    // HTTP/HTTPS URL: extract last pathname segment (before query string)
    if (isHttpUrl(url)) {
        try {
            const parsed = new URL(url);
            return parsed.pathname.split("/").pop() || "";
        } catch {
            return "";
        }
    }

    // Plain file path: as-is
    return url;
}

/**
 * Open `data.url` in a browser — a specific browser page (`browserPageId`), the
 * OS default browser, the internal browser, a named profile, or incognito,
 * per `data.browserMode`. With no `browserMode`, falls back to the
 * `link-open-behavior` setting (or forces internal when the target is
 * "browser"). Shared by the HTTP resolver and the file resolver so
 * `target: "browser"` works for both remote URLs and local files.
 */
async function openLinkInBrowser(data: ILinkData): Promise<void> {
    const browserMode = data.browserMode;
    const openInBrowser = data.target === "browser";

    // Route to a specific browser page if browserPageId is set
    const browserPageId = data.browserPageId;
    if (browserPageId) {
        const { pagesModel } = await import("../api/pages");
        const page = pagesModel.query.findPage(browserPageId);
        const editor = page?.mainEditor;
        if (editor && "navigate" in editor && "addTab" in editor) {
            const tabMode = data.browserTabMode ?? "addTab";
            if (tabMode === "navigate") {
                (editor as any).navigate(data.url); // eslint-disable-line @typescript-eslint/no-explicit-any
            } else {
                (editor as any).addTab(data.url); // eslint-disable-line @typescript-eslint/no-explicit-any
            }
        }
        return;
    }

    // Browser mode routing
    if (browserMode === "os-default") {
        const { shell } = await import("../api/shell");
        shell.openExternal(data.url);
    } else if (browserMode === "incognito") {
        const { pagesModel } = await import("../api/pages");
        await pagesModel.lifecycle.openUrlInBrowserTab(data.url, { incognito: true });
    } else if (browserMode?.startsWith("profile:")) {
        const profileName = browserMode.slice("profile:".length);
        const { pagesModel } = await import("../api/pages");
        await pagesModel.lifecycle.openUrlInBrowserTab(data.url, { profileName });
    } else if (browserMode === "internal") {
        const { pagesModel } = await import("../api/pages");
        // Reuse any non-incognito/non-tor browser page regardless of profile;
        // fall back to a new page using `browser-default-profile`.
        await pagesModel.lifecycle.openUrlInBrowserTab(data.url, { external: true });
    } else {
        // No browserMode — use link-open-behavior setting (existing fallback)
        const { settings } = await import("../api/settings");
        const behavior = settings.get("link-open-behavior");
        if (behavior === "internal-browser" || openInBrowser) {
            const { pagesModel } = await import("../api/pages");
            await pagesModel.lifecycle.openUrlInBrowserTab(data.url, { external: openInBrowser });
        } else {
            const { shell } = await import("../api/shell");
            shell.openExternal(data.url);
        }
    }
}

/**
 * Register Layer 2 resolvers on openLink.
 *
 * Registration order matters (LIFO execution):
 * - fileResolver registered first → runs last (fallback)
 * - httpResolver registered after → runs first (matches http/https URLs)
 *
 * Call during app bootstrap, before scripts load. The bootstrap resolver registry
 * owns these process-lifetime handlers; no view/model should dispose them.
 */
export function registerResolvers(): void {
    // File resolver — fallback, handles plain file paths and virtual paths (tree-category://)
    app.events.openLink.subscribe(async (data) => {
        // Skip HTTP URLs — handled by HTTP resolver
        if (isHttpUrl(data.url)) return;

        // Explicit browser intent for a local path → open in a browser instead
        // of an editor. The HTTP resolver does this for http(s) URLs; mirror it
        // here so `target: "browser"` / browserMode work for local files (e.g.
        // "Open in Browser" on an .html page tab). Normalize to a file:// URL so
        // both the OS-default browser (shell.openExternal) and the internal
        // browser receive a proper URL.
        if (data.target === "browser" || data.browserMode) {
            data.url = toFileUrl(data.url);
            await openLinkInBrowser(data);
            data.handled = true;
            return;
        }

        // Directory → open an empty page with the Explorer (folder tree) panel,
        // instead of a content pipe + empty Monaco editor. Matches the "Open Folder"
        // entry points (MenuBar, folder-tree context menu). Skip virtual schemes
        // (tree-category://, etc.) — those never name a real directory.
        if (!data.url.includes("://") && !isArchivePath(data.url)) {
            const stat = await app.fs.stat(data.url);
            if (stat.isDirectory) {
                const { pagesModel } = await import("../api/pages");
                await pagesModel.addEmptyPageWithNavPanel(data.url);
                pagesModel.closeFirstPageIfEmpty();
                data.handled = true;
                return;
            }
        }

        const pipeDescriptor = resolveUrlToPipeDescriptor(data.url);
        if (!pipeDescriptor) {
            // Virtual paths (tree-category://, etc.) don't resolve to a pipe
            // but still need to flow through openContent for page creation.
            // Create a placeholder file pipe — CategoryEditor resolves its treeProvider from secondary views, not the pipe.
            if (data.url.includes("://")) {
                data.target ||= "monaco";
                data.pipeDescriptor = {
                    provider: { type: "file", config: { path: data.url } },
                    transformers: [],
                };
                data.pipe = createPipeFromDescriptor(data.pipeDescriptor);
                data.handled = false;
                await app.events.openContent.sendAsync(data);
                data.handled = true;
            }
            return;
        }

        // Resolve target editor if not already specified via the merged resolver (built-in registry
        // + trusted file-associated boards, EPIC-042): a board that wins by priority becomes the
        // target, and its file rides the normal openFile path (→ buildEditorById board branch →
        // initFromBoardRoot). Two paths are passed because they answer different questions: masks
        // and built-in matching run on the EFFECTIVE path (an archive entry's inner name, a URL's
        // last segment minus its query), while the SOURCE capability gate is judged on the original
        // url — a non-local source reaches only a content-host board or one declaring
        // `editorSources: "any"`.
        data.target = data.target
            || resolveEditorIdForFile(data.url, extractEffectivePath(data.url))
            || "monaco";
        data.pipeDescriptor = pipeDescriptor;
        data.pipe = createPipeFromDescriptor(pipeDescriptor);

        // Fire Layer 3
        data.handled = false;
        await app.events.openContent.sendAsync(data);
        data.handled = true;
    });

    // mneme:// resolver — route Mneme wiki documents to MnemeProvider (EPIC-032).
    // Registered after the file resolver so it runs first (LIFO) and intercepts
    // the scheme before the file fallback wraps it in a file pipe.
    app.events.openLink.subscribe(async (data) => {
        if (!data.url?.startsWith("mneme://")) return;
        const path = data.url.slice("mneme://".length); // "{root}/{path}"
        data.target = data.target || editorRegistry.resolveId(path) || "monaco";
        data.pipeDescriptor = {
            provider: { type: "mneme", config: { path } },
            transformers: [],
        };
        data.pipe = createPipeFromDescriptor(data.pipeDescriptor);
        data.handled = false;
        await app.events.openContent.sendAsync(data);
        data.handled = true;
    });

    // HTTP resolver — handles http:// and https:// URLs.
    // URLs with recognized text extensions → open as content via HttpProvider.
    // Everything else → open in browser tab.
    //
    // This set answers only the content-vs-browser question. Once an extension
    // is content, the normal editor registry decides its editor just like a file.

    /**
     * Known HTTP content extensions. Everything else opens in a browser unless
     * a caller explicitly requests a content editor.
     */
    const httpContentExtensions = new Set([
        // Programming languages → Monaco
        ".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".jsx", ".tsx",
        ".json", ".jsonc", ".jsonl", ".css", ".scss", ".less",
        ".xml", ".xsl", ".xslt", ".xsd", ".yaml", ".yml", ".toml",
        ".ini", ".cfg", ".conf", ".sh", ".bash", ".zsh", ".bat", ".cmd",
        ".ps1", ".py", ".rb", ".go", ".rs", ".java", ".kt", ".swift",
        ".c", ".h", ".cpp", ".cc", ".cxx", ".hpp", ".cs", ".php", ".r",
        ".lua", ".sql", ".graphql", ".gql", ".proto",
        // Markup / data → Monaco
        ".md", ".markdown", ".csv", ".svg", ".txt", ".log", ".env", ".dockerfile",
        // Images → Image viewer
        ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico",
        // PDF → the pdf-viewer board if installed, else a browser tab (Chromium renders it)
        ".pdf",
        // Video → Video Player
        ".mp4", ".webm", ".ogg", ".m3u8", ".m3u",
        // Keep HTTP media routing aligned with video-view's registry matcher.
        ".mp3", ".wav", ".aac", ".flac", ".m4a", ".wma", ".opus", ".avi", ".mkv", ".mov",
    ]);
    const httpBrowserFallbackExtensions = new Set([".pdf"]);

    app.events.openLink.subscribe(async (data) => {
        if (!isHttpUrl(data.url)) return;

        // Route to RestClient when target is "rest-client"
        if (data.target === "rest-client") {
            const { openInRestClient } = await import("../editors/rest-client/open-in-rest-client");
            await openInRestClient(data.url, data);
            data.handled = true;
            return;
        }

        const openInBrowser = data.target === "browser";
        const effectivePath = extractEffectivePath(data.url);
        const ext = effectivePath.includes(".")
            ? effectivePath.slice(effectivePath.lastIndexOf(".")).toLowerCase()
            : "";
        const hasContentExtension = httpContentExtensions.has(ext);
        let headerTarget: string | undefined;
        let headerBrowserFallback = false;

        // For cURL/fetch requests without file extension: use Accept header to pick editor
        if (!hasContentExtension && data.headers) {
            const accept = data.headers["accept"] || data.headers["Accept"] || "";
            if (accept.includes("image/")) headerTarget = "image-view";
            else if (accept.includes("pdf")) headerBrowserFallback = true;
            else if (
                accept.includes("json")
                || accept.includes("xml")
                || accept.includes("css")
                || accept.includes("javascript")
                || accept.includes("text/")
                || accept.includes("*/*")
            ) headerTarget = "monaco";
        }

        // If an explicit non-browser editor target is set (e.g., "image-view", "monaco"),
        // skip the browser branch and use it as the content target directly.
        const hasExplicitEditorTarget = data.target && data.target !== "browser";

        const hasContentIntent = hasContentExtension || !!data.headers || !!data.fallbackTarget;
        const browserMode = data.browserMode;
        if (browserMode || openInBrowser || (!hasContentIntent && !hasExplicitEditorTarget)) {
            // Explicit browser mode, explicit "browser" target, or no recognized extension
            await openLinkInBrowser(data);
            data.handled = true;
            return;
        }

        // Recognized extension or explicit editor target — open as content via pipe.
        // A trusted board may claim this file type (EPIC-042): ask the merged resolver, which
        // applies the same priority ladder and the same source-capability gate as a local open, so
        // only a content-host board or one declaring `editorSources: "any"` can win a remote source.
        // The extension set decides browser-vs-content; this merged lookup owns
        // built-in editor matching plus eligible trusted-board precedence.
        const resolvedTarget = hasContentIntent
            ? resolveEditorIdForFile(data.url, effectivePath)
            : undefined;
        const boardWins = !!resolvedTarget && isBoardEditorId(resolvedTarget);

        // The extension has no built-in editor (`.pdf`) and no board claimed it — hand it to the
        // browser tab, which renders PDFs natively. Deliberately after the board lookup: an
        // installed board must still win, which is the whole reason the extension is content.
        if (
            (httpBrowserFallbackExtensions.has(ext) || headerBrowserFallback)
            && !boardWins
            && !hasExplicitEditorTarget
        ) {
            await openLinkInBrowser(data);
            data.handled = true;
            return;
        }

        data.target = data.target
            || (boardWins ? resolvedTarget : undefined)
            || data.fallbackTarget
            || headerTarget
            || resolvedTarget;

        const pipeDescriptor = resolveUrlToPipeDescriptor(data.url, data);
        if (!pipeDescriptor) return;

        data.pipeDescriptor = pipeDescriptor;
        data.pipe = createPipeFromDescriptor(pipeDescriptor);
        data.handled = false;
        await app.events.openContent.sendAsync(data);
        data.handled = true;
    });

    // draw-view + image data URL → import the image as a NEW untitled drawing (US-874).
    // The target is the real editor id; an image `data:` URL is the discriminator. Routed to
    // addDrawPage (a fresh untitled page) rather than a content-host bind, so Ctrl+S can't
    // overwrite a source. Registered last → runs first (LIFO), before the file resolver builds a
    // pipe. Accepts ONLY a data URL — a caller with an http/file image converts it first.
    app.events.openLink.subscribe(async (data) => {
        if (data.target !== "draw-view") return;
        if (!data.url?.startsWith("data:image/")) return;
        try {
            const { pagesModel } = await import("../api/pages");
            await pagesModel.addDrawPage(data.url, (data.title || "drawing") + ".excalidraw");
        } catch (err) {
            const { ui } = await import("../api/ui");
            ui.notify(
                `Failed to open image in Drawing editor: ${errMessage(err)}`,
                "error",
            );
        }
        data.handled = true; // don't fall through to the file-backed open path
    });
}

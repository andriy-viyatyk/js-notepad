import { app } from "../api/app";
import { editorRegistry } from "../editors/base/editorRegistry";
import { isBoardEditorId, resolveEditorIdForFile } from "../editors/board/custom-editor-registry";
import { isArchivePath, parseArchivePath } from "../core/utils/file-path";
import { createPipeFromDescriptor } from "./registry";
import { resolveUrlToPipeDescriptor, isHttpUrl, toFileUrl } from "./link-utils";
import type { ILinkData } from "../../shared/link-data";

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
 * Call during app bootstrap, before scripts load.
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
    // Extension map is self-contained — does not rely on editor registry.
    // Extension map determines which editor handles each URL.

    /**
     * Maps file extensions to { editor, language? } for HTTP content opening.
     *
     * `editor` is optional: an entry with only `browserFallback` means the extension has NO
     * built-in editor, so the URL becomes content only if a trusted board claims the type —
     * otherwise it opens in a browser tab. The entry must still exist, because this table also
     * decides browser-vs-content and the board lookup below is skipped entirely when there is
     * no mapping.
     */
    const httpContentExtensions: Record<
        string,
        { editor?: string; browserFallback?: boolean }
    > = {
        // Programming languages → Monaco
        ".js": { editor: "monaco" }, ".mjs": { editor: "monaco" }, ".cjs": { editor: "monaco" },
        ".ts": { editor: "monaco" }, ".mts": { editor: "monaco" }, ".cts": { editor: "monaco" },
        ".jsx": { editor: "monaco" }, ".tsx": { editor: "monaco" },
        ".json": { editor: "monaco" }, ".jsonc": { editor: "monaco" }, ".jsonl": { editor: "monaco" },
        ".css": { editor: "monaco" }, ".scss": { editor: "monaco" }, ".less": { editor: "monaco" },
        ".xml": { editor: "monaco" }, ".xsl": { editor: "monaco" }, ".xslt": { editor: "monaco" }, ".xsd": { editor: "monaco" },
        ".yaml": { editor: "monaco" }, ".yml": { editor: "monaco" },
        ".toml": { editor: "monaco" },
        ".ini": { editor: "monaco" }, ".cfg": { editor: "monaco" }, ".conf": { editor: "monaco" },
        ".sh": { editor: "monaco" }, ".bash": { editor: "monaco" }, ".zsh": { editor: "monaco" },
        ".bat": { editor: "monaco" }, ".cmd": { editor: "monaco" },
        ".ps1": { editor: "monaco" },
        ".py": { editor: "monaco" },
        ".rb": { editor: "monaco" },
        ".go": { editor: "monaco" },
        ".rs": { editor: "monaco" },
        ".java": { editor: "monaco" },
        ".kt": { editor: "monaco" },
        ".swift": { editor: "monaco" },
        ".c": { editor: "monaco" }, ".h": { editor: "monaco" },
        ".cpp": { editor: "monaco" }, ".cc": { editor: "monaco" }, ".cxx": { editor: "monaco" }, ".hpp": { editor: "monaco" },
        ".cs": { editor: "monaco" },
        ".php": { editor: "monaco" },
        ".r": { editor: "monaco" },
        ".lua": { editor: "monaco" },
        ".sql": { editor: "monaco" },
        ".graphql": { editor: "monaco" }, ".gql": { editor: "monaco" },
        ".proto": { editor: "monaco" },
        // Markup / data → Monaco
        ".md": { editor: "monaco" }, ".markdown": { editor: "monaco" },
        ".csv": { editor: "monaco" },
        ".svg": { editor: "monaco" },
        ".txt": { editor: "monaco" },
        ".log": { editor: "monaco" },
        ".env": { editor: "monaco" },
        ".dockerfile": { editor: "monaco" },
        // Images → Image viewer
        ".png": { editor: "image-view" },
        ".jpg": { editor: "image-view" }, ".jpeg": { editor: "image-view" },
        ".gif": { editor: "image-view" },
        ".webp": { editor: "image-view" },
        ".bmp": { editor: "image-view" },
        ".ico": { editor: "image-view" },
        // PDF → the pdf-viewer board if installed, else a browser tab (Chromium renders it)
        ".pdf": { browserFallback: true },
        // Video → Video Player
        ".mp4": { editor: "video-view" },
        ".webm": { editor: "video-view" },
        ".ogg": { editor: "video-view" },
        ".m3u8": { editor: "video-view" },
        ".m3u": { editor: "video-view" },
    };

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
        let mapping = ext ? httpContentExtensions[ext] : undefined;

        // For cURL/fetch requests without file extension: use Accept header to pick editor
        if (!mapping && data.headers) {
            const accept = data.headers["accept"] || data.headers["Accept"] || "";
            if (accept.includes("json")) mapping = { editor: "monaco" };
            else if (accept.includes("xml")) mapping = { editor: "monaco" };
            else if (accept.includes("css")) mapping = { editor: "monaco" };
            else if (accept.includes("javascript")) mapping = { editor: "monaco" };
            else if (accept.includes("image/")) mapping = { editor: "image-view" };
            else if (accept.includes("pdf")) mapping = { browserFallback: true };
            else if (accept.includes("text/") || accept.includes("*/*")) mapping = { editor: "monaco" };
        }

        // If headers present (cURL/fetch) but still no mapping — default to Monaco plaintext
        if (!mapping && data.headers) {
            mapping = { editor: "monaco" };
        }

        // Fallback target from metadata (e.g., "Links" panel sets "monaco" to avoid browser)
        if (!mapping && data.fallbackTarget) {
            mapping = { editor: data.fallbackTarget };
        }

        // If an explicit non-browser editor target is set (e.g., "image-view", "monaco"),
        // skip the browser branch and use it as the content target directly.
        const hasExplicitEditorTarget = data.target && data.target !== "browser";

        const browserMode = data.browserMode;
        if (browserMode || openInBrowser || (!mapping && !hasExplicitEditorTarget)) {
            // Explicit browser mode, explicit "browser" target, or no recognized extension
            await openLinkInBrowser(data);
            data.handled = true;
            return;
        }

        // Recognized extension or explicit editor target — open as content via pipe.
        // A trusted board may claim this file type (EPIC-042): ask the merged resolver, which
        // applies the same priority ladder and the same source-capability gate as a local open, so
        // only a content-host board or one declaring `editorSources: "any"` can win a remote source.
        // Deliberately narrow — ONLY a board id is taken from it. The hardcoded table above still
        // decides browser-vs-content AND remains the built-in editor choice, so no existing URL
        // routing changes.
        const boardTarget = mapping
            ? resolveEditorIdForFile(data.url, effectivePath)
            : undefined;
        const boardWins = !!boardTarget && isBoardEditorId(boardTarget);

        // The extension has no built-in editor (`.pdf`) and no board claimed it — hand it to the
        // browser tab, which renders PDFs natively. Deliberately after the board lookup: an
        // installed board must still win, which is the whole reason the mapping exists.
        if (mapping?.browserFallback && !boardWins && !hasExplicitEditorTarget) {
            await openLinkInBrowser(data);
            data.handled = true;
            return;
        }

        data.target = data.target
            || (boardWins ? boardTarget : undefined)
            || mapping?.editor;

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
                `Failed to open image in Drawing editor: ${err instanceof Error ? err.message : String(err)}`,
                "error",
            );
        }
        data.handled = true; // don't fall through to the file-backed open path
    });
}

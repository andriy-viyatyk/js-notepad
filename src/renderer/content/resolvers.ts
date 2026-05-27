import { app } from "../api/app";
import { editorRegistry } from "../editors/base/v4/editorRegistry";
import { isArchivePath, parseArchivePath } from "../core/utils/file-path";
import { createPipeFromDescriptor } from "./registry";
import { resolveUrlToPipeDescriptor, isHttpUrl } from "./link-utils";

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

        const pipeDescriptor = resolveUrlToPipeDescriptor(data.url);
        if (!pipeDescriptor) {
            // Virtual paths (tree-category://, etc.) don't resolve to a pipe
            // but still need to flow through openContent for page creation.
            // Create a placeholder file pipe — CategoryEditor resolves its treeProvider from secondary editors, not the pipe.
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

        // Resolve target editor if not already specified
        data.target = data.target
            || editorRegistry.resolveId(extractEffectivePath(data.url))
            || "monaco";
        data.pipeDescriptor = pipeDescriptor;
        data.pipe = createPipeFromDescriptor(pipeDescriptor);

        // Fire Layer 3
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

    /** Maps file extensions to { editor, language? } for HTTP content opening. */
    const httpContentExtensions: Record<string, { editor: string }> = {
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
        // PDF → PDF viewer
        ".pdf": { editor: "pdf-view" },
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
            else if (accept.includes("pdf")) mapping = { editor: "pdf-view" };
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
                data.handled = true;
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
                // External URL — reuse any non-incognito/non-tor browser page regardless
                // of profile; fall back to a new page using `browser-default-profile`.
                await pagesModel.lifecycle.openUrlInBrowserTab(data.url, { external: true });
            } else {
                // No browserMode — use link-open-behavior setting (existing fallback)
                const { settings } = await import("../api/settings");
                const behavior = settings.get("link-open-behavior");
                if (behavior === "internal-browser" || openInBrowser) {
                    const { pagesModel } = await import("../api/pages");
                    await pagesModel.lifecycle.openUrlInBrowserTab(data.url, {
                        external: openInBrowser,
                    });
                } else {
                    const { shell } = await import("../api/shell");
                    shell.openExternal(data.url);
                }
            }
            data.handled = true;
            return;
        }

        // Recognized extension or explicit editor target — open as content via pipe
        data.target = data.target || mapping?.editor;

        const pipeDescriptor = resolveUrlToPipeDescriptor(data.url, data);
        if (!pipeDescriptor) return;

        data.pipeDescriptor = pipeDescriptor;
        data.pipe = createPipeFromDescriptor(pipeDescriptor);
        data.handled = false;
        await app.events.openContent.sendAsync(data);
        data.handled = true;
    });
}

import type { IPipeDescriptor } from "../api/types/io.pipe";
import type { ILinkData } from "../../shared/link-data";
import { isArchivePath, parseArchivePath } from "../core/utils/file-path";
import { TREE_CATEGORY_PREFIX } from "./tree-providers/tree-provider-link";

// Node's `url` module for `pathToFileURL` (correct drive-letter / percent
// encoding). `require` rather than `import` because Vite externalizes Node
// builtins into broken browser stubs when statically imported — same pattern
// as `path-utils.ts`. `file-path.ts` does not expose `pathToFileURL`.
const url = require("url");

// =============================================================================
// URL helpers
// =============================================================================

/**
 * Normalize a file:// URL to a plain file path.
 * Strips "file://" or "file:///" prefix and decodes URI-encoded characters.
 */
export function normalizeFileUrl(raw: string): string {
    let path = raw;
    if (path.startsWith("file:///")) {
        path = path.slice(8); // "file:///C:/..." → "C:/..."
    } else if (path.startsWith("file://")) {
        path = path.slice(7); // "file://C:/..." → "C:/..."
    }
    return decodeURIComponent(path);
}

export function isFileUrl(raw: string): boolean {
    return raw.startsWith("file://");
}

/**
 * Convert a local file path to a `file://` URL, leaving values that already
 * carry a scheme (`http://`, `file://`, `data:`, …) untouched. A browser
 * expects a URL, so this is used when handing a local path to one
 * (OS-default via `shell.openExternal`, or the internal browser).
 */
export function toFileUrl(pathOrUrl: string): string {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(pathOrUrl) || pathOrUrl.startsWith("data:")) {
        return pathOrUrl;
    }
    if (!isPlausibleFilePath(pathOrUrl)) return pathOrUrl;
    return url.pathToFileURL(pathOrUrl).href;
}

/**
 * Check if a string looks like a valid Windows file path.
 * Accepts drive-letter paths (C:\..., C:/...) and UNC paths (\\...).
 */
export function isPlausibleFilePath(path: string): boolean {
    if (/^[A-Za-z]:[/\\]/.test(path)) return true;
    if (path.startsWith("\\\\")) return true;
    return false;
}

export function isHttpUrl(url: string): boolean {
    return url.startsWith("http://") || url.startsWith("https://");
}

export function isUrlOrCurl(href: string): boolean {
    const h = href.trimStart();
    return h.startsWith("http://") || h.startsWith("https://") || /^curl\s/i.test(h);
}

// =============================================================================
// Pipe descriptor resolution
// =============================================================================

/**
 * Resolve a URL to a pipe descriptor.
 *
 * Returns null for URLs that cannot be resolved to a pipe
 * (tree-category://, unrecognized formats).
 *
 * Handles: file paths, file:// URLs, archive paths (with "!"),
 * HTTP/HTTPS URLs.
 *
 * Note: "!" archive detection is only applied to file paths, not HTTP URLs,
 * because "!" is a valid character in HTTP URLs (query params, fragments).
 */
export function resolveUrlToPipeDescriptor(
    url: string,
    data?: ILinkData,
): IPipeDescriptor | null {
    // tree-category:// → no pipe
    if (url.startsWith(TREE_CATEGORY_PREFIX)) return null;

    // data: URL → DataUrlProvider
    if (url.startsWith("data:")) {
        return { provider: { type: "data", config: { url } }, transformers: [] };
    }

    // HTTP/HTTPS
    if (isHttpUrl(url)) {
        return resolveHttpPipeDescriptor(url, data);
    }

    // File path (normalize file:// URLs)
    return resolveFilePipeDescriptor(url);
}

function resolveFilePipeDescriptor(url: string): IPipeDescriptor | null {
    let filePath = url;
    if (isFileUrl(filePath)) {
        filePath = normalizeFileUrl(filePath);
    }
    if (!isPlausibleFilePath(filePath)) return null;

    if (isArchivePath(filePath)) {
        const { archivePath, innerPath } = parseArchivePath(filePath);
        return {
            provider: { type: "file", config: { path: archivePath } },
            transformers: [{ type: "archive", config: { archivePath, entryPath: innerPath } }],
        };
    }

    return {
        provider: { type: "file", config: { path: filePath } },
        transformers: [],
    };
}

function resolveHttpPipeDescriptor(url: string, data?: ILinkData): IPipeDescriptor {
    const httpConfig: Record<string, unknown> = { url };
    if (data?.method) httpConfig.method = data.method;
    if (data?.headers) httpConfig.headers = data.headers;
    if (data?.body) httpConfig.body = data.body;

    // No "!" archive detection for HTTP URLs — "!" is valid in HTTP URLs.
    // Archive-in-HTTP support deferred to future.
    return {
        provider: { type: "http", config: httpConfig },
        transformers: [],
    };
}

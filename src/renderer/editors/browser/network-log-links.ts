/**
 * Convert network log entries to ILink[] with cURL-formatted href strings.
 * Used by "Show Resources" to include fetch/XHR requests alongside DOM resources.
 */
import type { ILink } from "../../api/types/io.tree";
import type { NetworkLogEntry } from "../../../ipc/browser-ipc";

const READ_ONLY_METHODS = new Set(["GET", "HEAD"]);

function isReadOnly(method: string): boolean {
    return READ_ONLY_METHODS.has(method.toUpperCase());
}

function escapeSingleQuotes(s: string): string {
    return s.replace(/'/g, "'\\''");
}

/** Map of content-type MIME types to file extensions. */
const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
    "application/json": ".json",
    "application/javascript": ".js",
    "text/javascript": ".js",
    "text/css": ".css",
    "text/html": ".html",
    "text/xml": ".xml",
    "application/xml": ".xml",
    "text/plain": ".txt",
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
    "image/webp": ".webp",
    "application/wasm": ".wasm",
    "font/woff2": ".woff2",
    "font/woff": ".woff",
    "application/font-woff2": ".woff2",
    "application/font-woff": ".woff",
    "text/csv": ".csv",
};

/** Extract the MIME type from a content-type header value (strip charset etc). */
function parseMimeType(contentType: string): string {
    return contentType.split(";")[0].trim().toLowerCase();
}

/** Get the extension for a content-type, or undefined if unknown. */
function extensionForContentType(
    responseHeaders?: Record<string, string[]>,
): string | undefined {
    if (!responseHeaders) return undefined;
    // Response headers keys may vary in casing; content-type is typically lowercase
    const values = responseHeaders["content-type"] || responseHeaders["Content-Type"];
    if (!values || values.length === 0) return undefined;
    const mime = parseMimeType(values[0]);
    return CONTENT_TYPE_EXTENSIONS[mime];
}

/** Check if a filename already has a recognized extension. */
function hasExtension(name: string): boolean {
    const dot = name.lastIndexOf(".");
    if (dot <= 0) return false;
    const ext = name.substring(dot).toLowerCase();
    return ext.length >= 2 && ext.length <= 6;
}

function urlTitle(url: string, responseHeaders?: Record<string, string[]>): string {
    let name: string;
    try {
        const u = new URL(url);
        const segments = u.pathname.split("/").filter(Boolean);
        name = segments.length > 0
            ? segments[segments.length - 1] + u.search
            : u.hostname + u.pathname;
    } catch {
        name = url;
    }

    // Append extension from content-type if the title doesn't already have one
    if (!hasExtension(name.split("?")[0])) {
        const ext = extensionForContentType(responseHeaders);
        if (ext) name += ext;
    }

    return name;
}

function buildCurl(entry: NetworkLogEntry): string {
    const parts: string[] = [`curl '${entry.url}'`];

    if (entry.method !== "GET") {
        parts.push(`-X ${entry.method}`);
    }

    for (const [key, value] of Object.entries(entry.requestHeaders)) {
        if (key.startsWith(":")) continue; // Skip HTTP/2 pseudo-headers
        parts.push(`-H '${key}: ${value}'`);
    }

    if (entry.requestBody) {
        parts.push(`--data-raw '${escapeSingleQuotes(entry.requestBody)}'`);
    }

    return parts.join(" ");
}

/**
 * Convert network log entries to ILink[] with cURL href strings.
 * Each link is categorized under "Network/{METHOD}".
 * Deduplicates by final cURL string.
 */
export function networkLogToLinks(entries: NetworkLogEntry[]): ILink[] {
    const seen = new Set<string>();
    const result: ILink[] = [];

    for (const entry of entries) {
        const curl = buildCurl(entry);
        if (seen.has(curl)) continue;
        seen.add(curl);

        result.push({
            title: urlTitle(entry.url, entry.responseHeaders),
            href: curl,
            category: `Network/${entry.method}`,
            tags: [entry.resourceType, String(entry.statusCode ?? "pending")],
            isDirectory: false,
            // Non-GET methods should open in RestClient (wired in )
            target: isReadOnly(entry.method) ? undefined : "rest-client",
        });
    }

    return result;
}

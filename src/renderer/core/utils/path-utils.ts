const path = require("path");
const url = require("url");

/**
 * Resolves a link relative to a current file path.
 * Returns the original link for absolute URLs (http, https, file, mailto) and anchors (#).
 * For relative paths, resolves to an absolute file:// URL.
 */
export function resolveRelatedLink(currentFilePath?: string, link?: string): string {
    if (!currentFilePath || !link) return link || "";

    const lowerLink = link.toLowerCase();
    if (
        lowerLink.startsWith("http://") ||
        lowerLink.startsWith("https://") ||
        lowerLink.startsWith("file://") ||
        lowerLink.startsWith("mailto:") ||
        lowerLink.startsWith("#")
    ) {
        return link;
    }

    try {
        const currentDir = path.dirname(currentFilePath);
        const absolutePath = path.resolve(currentDir, link);
        const fileUrl = url.pathToFileURL(absolutePath).href;
        return fileUrl;
    } catch {
        return link;
    }
}

/**
 * Checks whether a link is a local/relative file reference
 * (not an external URL, mailto, or anchor-only link).
 */
export function isLocalLink(link: string): boolean {
    const lower = link.toLowerCase();
    return !(
        lower.startsWith("http://") ||
        lower.startsWith("https://") ||
        lower.startsWith("file://") ||
        lower.startsWith("mailto:") ||
        lower.startsWith("#")
    );
}

/**
 * Resolves a relative link to an absolute file path (not a file:// URL).
 * Strips URL fragments (#section) before resolution.
 */
export function resolveRelativePath(currentFilePath: string, link: string): string {
    const linkWithoutFragment = link.split("#")[0];
    const currentDir = path.dirname(currentFilePath);
    return path.resolve(currentDir, linkWithoutFragment);
}

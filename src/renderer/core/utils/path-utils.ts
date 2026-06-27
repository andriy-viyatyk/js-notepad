import { fpDirname, fpResolve, fpJoin, fpExtname } from "./file-path";
const url = require("url");

/**
 * Resolves a link relative to a current file path.
 * Returns the original link for absolute URLs (http, https, file, mailto) and anchors (#).
 * For relative paths, resolves to an absolute file:// URL.
 *
 * When `wikiRoot` is supplied (the file lives inside a git repo — see
 * `detectGitRoot`), a leading-slash link is treated as an Azure DevOps wiki
 * root-relative reference and resolved against the wiki root: `.attachments`
 * images (and any extension-bearing link) resolve to a literal path; an
 * extension-less link is a wiki page → the link path is already the on-disk
 * slug, so `.md` is appended and the path is mapped 1:1 to disk. See
 * `resolveAdoWikiLink`.
 */
export function resolveRelatedLink(currentFilePath?: string, link?: string, wikiRoot?: string): string {
    if (!currentFilePath || !link) return link || "";

    const lowerLink = link.toLowerCase();
    if (
        lowerLink.startsWith("http://") ||
        lowerLink.startsWith("https://") ||
        lowerLink.startsWith("file://") ||
        lowerLink.startsWith("mneme://") ||
        lowerLink.startsWith("mailto:") ||
        lowerLink.startsWith("data:") ||
        lowerLink.startsWith("blob:") ||
        lowerLink.startsWith("#")
    ) {
        return link;
    }

    // Mneme documents address attachments within the mneme:// namespace, not the OS filesystem,
    // so a relative link resolves with forward-slash segment math (fpResolve would emit OS
    // separators / backslashes). The on-disk path logic below is unchanged.
    if (currentFilePath.toLowerCase().startsWith("mneme://")) {
        return resolveMnemeLink(currentFilePath, link);
    }

    // Azure DevOps wiki: a leading slash means "from the wiki root", not the
    // OS/drive root (fpResolve would resolve "/x" to the drive root on Windows).
    // Only applies when the file is inside a git repo.
    if (wikiRoot && link.startsWith("/")) {
        const resolved = resolveAdoWikiLink(wikiRoot, link);
        if (resolved) return resolved;
    }

    try {
        // Decode URL-encoded characters (e.g. %5C for backslashes from markdown parsers)
        const decoded = decodeURIComponent(link);

        // Strip fragment (#section) before resolving — otherwise it becomes part of the filename
        const hashIndex = decoded.indexOf("#");
        const pathPart = hashIndex >= 0 ? decoded.slice(0, hashIndex) : decoded;
        const fragment = hashIndex >= 0 ? decoded.slice(hashIndex) : "";

        const currentDir = fpDirname(currentFilePath);
        const absolutePath = fpResolve(currentDir, pathPart);
        const fileUrl = url.pathToFileURL(absolutePath).href + fragment;
        return fileUrl;
    } catch {
        return link;
    }
}

// Extensions that mark a leading-slash ADO wiki link as a literal file
// (attachment) rather than a wiki page. A page link carries no extension and
// maps to `<slug>.md`. Using a known list (not "any dot") avoids mis-handling
// page titles that contain a dot, e.g. `Node.js` → `Node.js.md`.
const ADO_FILE_EXTENSIONS = new Set([
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".ico", ".avif",
    ".pdf", ".drawio",
]);

/**
 * Resolve an Azure DevOps wiki root-relative link (leading "/") to a file:// URL
 * under `wikiRoot`. Returns "" if the link can't be resolved (caller falls back).
 *
 * Key fact: an ADO wiki link path is ALREADY the on-disk slug. ADO stores a page
 * on disk by replacing spaces with "-" and percent-encoding a fixed special-char
 * set (incl. a literal "-" → "%2D"); it then emits links using that SAME encoded
 * path. So `/Applications/Business-Rule-Engine-(BRE)` maps directly to the file
 * `Applications/Business-Rule-Engine-(BRE).md`. We therefore map the link 1:1 to
 * disk — we must NOT decode the `%XX` (on-disk names literally contain it) and
 * must NOT re-encode the slug "-" (that double-encodes spaces into "%2D" and
 * breaks every multi-word page). The only normalization is a literal space → "-"
 * for hand-authored title-form links.
 */
function resolveAdoWikiLink(wikiRoot: string, link: string): string {
    try {
        const hashIndex = link.indexOf("#");
        const rawPath = hashIndex >= 0 ? link.slice(0, hashIndex) : link;
        const fragment = hashIndex >= 0 ? link.slice(hashIndex) : "";

        const segments = rawPath.split("/").filter(Boolean);
        if (!segments.length) return "";

        // Extension test uses a decoded view so an encoded last segment still
        // matches (`.attachments/a%20b.png` → ".png"); resolution below keeps the
        // raw segments.
        let lastDecoded = segments[segments.length - 1];
        try { lastDecoded = decodeURIComponent(lastDecoded); } catch { /* keep raw */ }
        const lastExt = fpExtname(lastDecoded).toLowerCase();

        let target: string;
        if (ADO_FILE_EXTENSIONS.has(lastExt)) {
            // Attachment / file — literal path under the wiki root. Decode so the
            // on-disk (decoded) attachment name is matched.
            const decodedSegments = segments.map((s) => {
                try { return decodeURIComponent(s); } catch { return s; }
            });
            target = fpJoin(wikiRoot, decodedSegments.join("/"));
        } else {
            // Wiki page — the link path is already the on-disk slug. Map 1:1,
            // only normalizing a literal space (title-form links) to "-".
            target = fpJoin(
                wikiRoot,
                segments.map((s) => s.replace(/ /g, "-")).join("/") + ".md",
            );
        }
        return url.pathToFileURL(target).href + fragment;
    } catch {
        return "";
    }
}

/**
 * Resolve a relative link inside a `mneme://{root}/{path}` document.
 * - leading "/"  → relative to the root top:    mneme://{root}/{link}
 * - otherwise    → relative to the document's directory.
 * "." / ".." are honored but clamped at {root} (Mneme rejects traversal above a root).
 * A "#fragment" is preserved.
 */
function resolveMnemeLink(currentMnemeUrl: string, link: string): string {
    const decoded = decodeURIComponent(link);
    const hashIndex = decoded.indexOf("#");
    const pathPart = hashIndex >= 0 ? decoded.slice(0, hashIndex) : decoded;
    const fragment = hashIndex >= 0 ? decoded.slice(hashIndex) : "";

    const addr = currentMnemeUrl.slice("mneme://".length); // {root}/{path}/guide.md
    const segs = addr.split("/").filter(Boolean);
    const root = segs[0] ?? "";
    const docDirSegs = segs.slice(1, -1); // path within the root, minus the filename

    const baseSegs = pathPart.startsWith("/") ? [] : docDirSegs.slice();
    for (const seg of pathPart.split("/")) {
        if (seg === "" || seg === ".") continue;
        if (seg === "..") {
            if (baseSegs.length) baseSegs.pop(); // clamp at root
            continue;
        }
        baseSegs.push(seg);
    }
    return `mneme://${[root, ...baseSegs].join("/")}${fragment}`;
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
    const currentDir = fpDirname(currentFilePath);
    return fpResolve(currentDir, linkWithoutFragment);
}

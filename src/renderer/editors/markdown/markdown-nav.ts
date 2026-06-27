import { isFileUrl, normalizeFileUrl } from "../../content/link-utils";
import { fpExtname } from "../../core/utils/file-path";

// Extensions that count as a "local markdown document" for in-page navigation
// (US-784). A clicked link to one of these — when it resolves to a local file —
// is navigated within the same page instead of opening a new tab.
const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);

/**
 * Whether a resolved anchor href points to a local markdown file.
 *
 * The Markdown view renders links with their resolved href — a relative `.md`
 * link becomes a `file://` URL (see `resolveRelatedLink`). Only `file://`
 * markdown is in scope: http(s)/mneme/mailto/data/blob/#anchor links and
 * non-markdown files all return false and keep their current behavior.
 */
export function isLocalMarkdownHref(href: string): boolean {
    if (!href || !isFileUrl(href)) return false;
    let path = normalizeFileUrl(href);
    // Strip query / fragment so the extension test sees the bare path.
    const cut = path.search(/[?#]/);
    if (cut >= 0) path = path.slice(0, cut);
    return MARKDOWN_EXTENSIONS.has(fpExtname(path).toLowerCase());
}

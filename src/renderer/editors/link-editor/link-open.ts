import type { ILink } from "../../api/types/io.tree";
import type { LinkItem, LinkEditorData } from "./linkTypes";
import { fpBasename } from "../../core/utils/file-path";

// Deliberately dependency-light (types + fpBasename only): the sync public API
// `pagesModel.openLinks` imports this statically, so it must not pull the
// link-editor chunk (linkTypes' side-effect import of linkTraits) at startup.

function normalizeLinksTitle(title?: string): string {
    if (!title) return "untitled.link.json";
    if (/\.link\.json$/i.test(title)) return title;
    return title + ".link.json";
}

/** Normalize raw links (paths/URLs or ILink objects) into `.link.json`
 *  document content plus its normalized title. */
export function buildLinkEditorContent(
    links: (ILink | string)[],
    title?: string,
): { title: string; content: string } {
    const linkItems: LinkItem[] = links.map((item) => {
        if (typeof item === "string") {
            return {
                id: crypto.randomUUID(),
                title: fpBasename(item) || item,
                href: item,
                category: "",
                tags: [],
                isDirectory: false,
            };
        }
        return {
            ...item,
            id: item.id || crypto.randomUUID(),
            category: item.category ?? "",
            tags: item.tags ?? [],
            isDirectory: item.isDirectory ?? false,
        };
    });

    const data: LinkEditorData = { links: linkItems, state: {} };
    return {
        title: normalizeLinksTitle(title),
        content: JSON.stringify({ type: "link-editor", ...data }, null, 4),
    };
}

/**
 * Rehype plugin that gives every rendered heading a stable `id` (US-901), so a
 * `#fragment` link can scroll to it. Mirrors GitHub's slug algorithm, which is
 * also what Azure DevOps wiki links assume.
 *
 * Author-supplied ids (raw HTML headings arriving through `rehypeRaw`) are never
 * overwritten.
 */
import type { Root, Element, ElementContent } from "hast";

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

/**
 * GitHub-style heading slug: lowercase, drop everything except word characters,
 * spaces and hyphens, then turn whitespace into hyphens.
 *
 * Deliberately collapses hyphen runs where github-slugger would keep them
 * (`A — B` → `a-b`, not `a--b`): this function is applied to BOTH sides of the
 * tolerant comparison below, so collapsing makes the two dialects meet instead of
 * making them diverge.
 *
 * Exported because anchor resolution needs the SAME function to compare a link's
 * fragment against heading text — that comparison is what absorbs the
 * GitHub-vs-Azure-DevOps dialect gap (ADO emits `#rtb.rul.2` for a heading GitHub
 * would slug as `rtbrul2`; slugifying both sides makes them meet).
 */
export function slugifyHeading(text: string): string {
    return text
        .trim()
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s-]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/** Concatenated text content of a HAST element, skipping nothing. */
function textContent(node: Element | ElementContent): string {
    if (node.type === "text") return node.value;
    if (node.type !== "element") return "";
    let out = "";
    for (const child of node.children) out += textContent(child);
    return out;
}

/**
 * Walk the tree and assign heading ids. Duplicate slugs get a `-1`, `-2`, … suffix
 * — the same disambiguation GitHub applies, so an authored `#rules-1` link
 * resolves to the second "Rules" heading.
 */
export function rehypeHeadingIds() {
    return (tree: Root) => {
        const used = new Map<string, number>();
        walk(tree, used);
    };
}

function walk(node: Root | Element, used: Map<string, number>): void {
    for (const child of node.children) {
        if (child.type !== "element") continue;
        if (HEADING_TAGS.has(child.tagName)) {
            assignId(child, used);
        }
        walk(child, used);
    }
}

function assignId(heading: Element, used: Map<string, number>): void {
    heading.properties ??= {};
    if (heading.properties.id) return; // author-supplied — leave alone

    const base = slugifyHeading(textContent(heading));
    if (!base) return; // nothing to slug (e.g. an image-only heading)

    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    heading.properties.id = seen === 0 ? base : `${base}-${seen}`;
}

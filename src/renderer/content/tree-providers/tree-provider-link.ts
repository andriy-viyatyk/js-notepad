import type { ICategorySegment } from "../../api/types/io.tree";

/** Prefix for tree-category links. */
export const TREE_CATEGORY_PREFIX = "tree-category://";

/** Segment a `/`-separated RELATIVE category (Link, Archive). Root category is "". */
export function relativeCategorySegments(category: string): ICategorySegment[] {
    if (!category) return [];
    const parts = category.split("/").filter(Boolean);
    return parts.map((label, i) => ({
        label,
        category: parts.slice(0, i + 1).join("/"),
    }));
}

/**
 * Minimal metadata encoded in a tree-category:// link.
 * Used for routing (parser detects prefix, sets editor target)
 * and fallback provider creation (if NavigationData has no provider).
 */
export interface ITreeProviderLink {
    /** Provider type: "file", "archive", "link". */
    type: string;
    /** Source URL (folder path, archive path, .link.json path). */
    url: string;
    /** Category path to display in CategoryView. */
    category: string;
}

/** Encode a tree provider link as a tree-category:// URL. */
export function encodeCategoryLink(link: ITreeProviderLink): string {
    const json = JSON.stringify(link);
    const base64 = btoa(json);
    return TREE_CATEGORY_PREFIX + base64;
}

/** Decode a tree-category:// URL back to an ITreeProviderLink. Returns null if invalid. */
export function decodeCategoryLink(raw: string): ITreeProviderLink | null {
    if (!raw.startsWith(TREE_CATEGORY_PREFIX)) return null;
    try {
        const base64 = raw.slice(TREE_CATEGORY_PREFIX.length);
        const json = atob(base64);
        return JSON.parse(json) as ITreeProviderLink;
    } catch {
        return null;
    }
}

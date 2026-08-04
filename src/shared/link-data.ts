import type { ILinkData } from "../renderer/api/types/io.link-data";
import type { ILink } from "../renderer/api/types/io.tree";

export type { ILinkData };

/** Fields that are NOT persisted when storing ILinkData as sourceLink on a page. */
const EPHEMERAL_FIELDS: ReadonlySet<string> = new Set([
    "handled",
    "pipe",
    "pageId",
    "revealLine",
    "highlightText",
    "fragment",
    "diffFrom",
    "diffTo",
    "envNamespace",
    "browserMode",
    "browserPageId",
    "browserTabMode",
    "fallbackTarget",
]);

/**
 * Create an ILinkData from a raw link string.
 *
 * @example
 * createLinkData("C:\\file.txt")
 * createLinkData("https://example.com", { target: "browser", browserMode: "incognito" })
 */
export function createLinkData(
    href: string,
    options?: Partial<Omit<ILinkData, "href" | "handled">>,
): ILinkData {
    return { handled: false, href, ...options };
}

/**
 * Convert an ILink to ILinkData.
 * Spreads all ILink fields so they survive the entire pipeline.
 *
 * @example
 * const data = linkToLinkData(link); // title, category, tags, imgSrc all preserved
 * await app.events.openRawLink.sendAsync(data);
 */
export function linkToLinkData(link: ILink): ILinkData {
    return { handled: false, ...link };
}

/**
 * Extract an ILink from ILinkData, filling required defaults for missing fields.
 * Used when storing a link back into a `.link.json` collection.
 */
export function linkDataToLink(data: ILinkData): ILink {
    return {
        id: data.id,
        title: data.title ?? data.url ?? data.href,
        href: data.url ?? data.href,
        category: data.category ?? "",
        tags: data.tags ?? [],
        isDirectory: data.isDirectory ?? false,
        imgSrc: data.imgSrc,
        size: data.size,
        mtime: data.mtime,
        target: data.target,
    };
}

/**
 * Strip ephemeral fields for persistence as sourceLink on pages.
 * Returns a new object — does not mutate the input.
 */
export function cleanForStorage(data: ILinkData): ILinkData {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
        if (EPHEMERAL_FIELDS.has(key)) continue;
        if (value !== undefined) cleaned[key] = value;
    }
    return cleaned as ILinkData;
}

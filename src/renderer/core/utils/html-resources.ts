import type { ILink } from "../../api/types/io.tree";

interface ExtractOptions {
    /** Base URL for resolving relative URLs. */
    baseUrl?: string;
}

/**
 * Parse HTML and extract resource URLs grouped by category.
 * Returns ILink[] suitable for app.pages.openLinks().
 *
 * Uses cheerio via require() — loaded at runtime from node_modules,
 * not bundled by Vite. Also available in user scripts.
 */
export function extractHtmlResources(html: string, options?: ExtractOptions): ILink[] {
    const cheerio = require("cheerio"); // eslint-disable-line @typescript-eslint/no-var-requires
    const $ = cheerio.load(html);
    const links: ILink[] = [];
    const seen = new Set<string>();

    const add = (category: string, href: string, title?: string, imgSrc?: string, target?: string) => {
        if (!href) return;
        // Skip data: URLs from HTML attributes (inline images etc.) — they are huge.
        // Our own generated data: URLs (inline scripts/styles) bypass this via addInline.
        if (href.startsWith("data:")) return;
        const resolved = resolveUrl(href.trim(), options?.baseUrl);
        if (!resolved || seen.has(resolved)) return;
        seen.add(resolved);
        links.push({
            title: title || urlBaseName(resolved) || resolved,
            href: resolved,
            category,
            tags: [] as string[],
            isDirectory: false,
            imgSrc,
            target,
        });
    };

    /** Add an inline content item (data: URL). Deduplicated by data URL. */
    const addInline = (category: string, dataUrl: string, title: string) => {
        if (seen.has(dataUrl)) return;
        seen.add(dataUrl);
        links.push({
            title,
            href: dataUrl,
            category,
            tags: [] as string[],
            isDirectory: false,
        });
    };

    // Images — set imgSrc + fallbackTarget for image viewer
    $("img[src]").each((_: number, el: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const src = $(el).attr("src");
        const resolved = resolveUrl(src.trim(), options?.baseUrl);
        add("Images", src, $(el).attr("alt"), resolved, "image-view");
    });
    $("picture source[srcset]").each((_: number, el: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const first = $(el).attr("srcset").split(",")[0].trim().split(/\s+/)[0];
        const resolved = resolveUrl(first.trim(), options?.baseUrl);
        add("Images", first, undefined, resolved, "image-view");
    });
    $("input[type=image][src]").each((_: number, el: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const src = $(el).attr("src");
        const resolved = resolveUrl(src.trim(), options?.baseUrl);
        add("Images", src, undefined, resolved, "image-view");
    });

    // Scripts (external)
    $("script[src]").each((_: number, el: any) => add("Scripts", $(el).attr("src"))); // eslint-disable-line @typescript-eslint/no-explicit-any

    // Scripts (inline) — encode as data: URLs
    const MAX_INLINE_SIZE = 1024 * 1024; // 1MB limit
    let inlineScriptIndex = 0;
    $("script:not([src])").each((_: number, el: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const content = $(el).html();
        if (!content?.trim() || content.length > MAX_INLINE_SIZE) return;
        inlineScriptIndex++;
        const encoded = Buffer.from(content).toString("base64");
        const dataUrl = `data:text/javascript;base64,${encoded}`;
        const size = formatSize(content.length);
        addInline("Inline Scripts", dataUrl, `script-block-${inlineScriptIndex} (${size}).js`);
    });

    // Stylesheets (external)
    $("link[rel=stylesheet][href]").each((_: number, el: any) => add("Stylesheets", $(el).attr("href"))); // eslint-disable-line @typescript-eslint/no-explicit-any

    // Styles (inline) — encode as data: URLs
    let inlineStyleIndex = 0;
    $("style").each((_: number, el: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const content = $(el).html();
        if (!content?.trim() || content.length > MAX_INLINE_SIZE) return;
        inlineStyleIndex++;
        const encoded = Buffer.from(content).toString("base64");
        const dataUrl = `data:text/css;base64,${encoded}`;
        const size = formatSize(content.length);
        addInline("Inline Styles", dataUrl, `style-block-${inlineStyleIndex} (${size}).css`);
    });

    // Media
    $("video[src]").each((_: number, el: any) => add("Media", $(el).attr("src"))); // eslint-disable-line @typescript-eslint/no-explicit-any
    $("audio[src]").each((_: number, el: any) => add("Media", $(el).attr("src"))); // eslint-disable-line @typescript-eslint/no-explicit-any
    $("video source[src], audio source[src]").each((_: number, el: any) => add("Media", $(el).attr("src"))); // eslint-disable-line @typescript-eslint/no-explicit-any

    // Fonts
    $("link[rel=preload][as=font][href]").each((_: number, el: any) => add("Fonts", $(el).attr("href"))); // eslint-disable-line @typescript-eslint/no-explicit-any

    // Iframes
    $("iframe[src]").each((_: number, el: any) => add("Iframes", $(el).attr("src"))); // eslint-disable-line @typescript-eslint/no-explicit-any

    // Favicons
    $("link[rel~=icon][href]").each((_: number, el: any) => add("Favicons", $(el).attr("href"))); // eslint-disable-line @typescript-eslint/no-explicit-any

    // Links (external only — skip anchors and javascript:)
    $("a[href]").each((_: number, el: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const href = $(el).attr("href");
        if (href.startsWith("#") || href.startsWith("javascript:")) return;
        add("Links", href, $(el).text().trim() || undefined);
    });

    return links;
}

function resolveUrl(href: string, baseUrl?: string): string {
    if (!baseUrl) return href;
    try {
        return new URL(href, baseUrl).href;
    } catch {
        return href;
    }
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function urlBaseName(url: string): string {
    try {
        const pathname = new URL(url).pathname;
        const parts = pathname.split("/").filter(Boolean);
        return parts.length > 0 ? decodeURIComponent(parts[parts.length - 1]) : "";
    } catch {
        // Not a valid URL — try simple path split
        const parts = url.split(/[/\\]/).filter(Boolean);
        return parts.length > 0 ? parts[parts.length - 1] : "";
    }
}

/**
 * Blob-URL resolution for `<img src>` values the renderer cannot load directly.
 *
 * Tile views render an item's `imgSrc` straight into an `<img>`. That works for the
 * shapes Chromium understands on its own — `http(s)`, `data:`, `blob:`, `file://`, and
 * (in this Electron renderer) a plain absolute Windows path. It does NOT work for an
 * archive entry, whose href is the app's own `archive.zip!inner/path.png` form: Chromium
 * has no idea what the `!` means, so the tile renders its fallback glyph and an archive
 * folder full of images shows nothing.
 *
 * Persephone already knows how to read those bytes — `pipeFromSourcePath` builds a
 * `FileProvider` + `ArchiveTransformer` pipe for exactly this path shape. This module
 * reads through that pipe once per source and hands back a blob URL the `<img>` can use.
 *
 * Lives beside `tor-src.ts` because it solves the same class of problem: an `imgSrc` that
 * needs rewriting before it reaches the DOM.
 *
 * Caching is deliberate, not incidental. Tiles are virtualized, so scrolling unmounts and
 * remounts the same cell repeatedly; without a cache every scroll re-reads the archive.
 * The cache is capped and evicts oldest-first, revoking the blob URL it drops so the bytes
 * are actually released.
 */

import { isArchivePath, fpExtname } from "../../core/utils/file-path";
import { pipeFromSourcePath } from "../../content/rebuild-pipe";

const MIME_BY_EXT: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".ico": "image/x-icon",
    ".svg": "image/svg+xml",
};

/** Cap on retained blob URLs. A tile grid shows a few dozen at a time; this leaves room
 *  for scrollback without pinning a whole archive's media folder in memory. */
const MAX_CACHED = 200;

// src → blob URL. Map iteration is insertion-ordered, which is what makes the
// oldest-first eviction below a one-liner.
const cache = new Map<string, string>();
// src → in-flight read, so two tiles mounting the same source share one archive read.
const pending = new Map<string, Promise<string | null>>();
// Sources whose read failed. Kept so a broken entry is attempted once, not once per scroll.
const failed = new Set<string>();

/**
 * True when `src` must be read through a content pipe rather than handed to the DOM.
 *
 * Only archive entries qualify today. Plain local paths are deliberately excluded: the
 * renderer loads them natively with lazy loading, and routing them here would read every
 * visible image fully into memory for no gain.
 */
export function isPipeImageSrc(src: string | null | undefined): boolean {
    return !!src && isArchivePath(src);
}
/** Memory-only lookup. Returns the blob URL, or null if not read yet / unreadable. */
export function getPipeImageSrcSync(src: string | null | undefined): string | null {
    if (!src) return null;
    return cache.get(src) ?? null;
}

/** Read `src` through a content pipe and cache the resulting blob URL. Concurrent callers
 *  for the same source share one read. Returns null when the source can't be read. */
export async function resolvePipeImageSrc(src: string): Promise<string | null> {
    const cached = cache.get(src);
    if (cached) return cached;
    if (failed.has(src)) return null;
    const inflight = pending.get(src);
    if (inflight) return inflight;

    const read = (async () => {
        try {
            const buffer = await pipeFromSourcePath(src).readBinary();
            const mime = MIME_BY_EXT[fpExtname(src).toLowerCase()] ?? "image/png";
            const url = URL.createObjectURL(
                new Blob([new Uint8Array(buffer)], { type: mime }),
            );
            cache.set(src, url);
            evictOverflow();
            return url;
        } catch {
            failed.add(src);
            return null;
        } finally {
            pending.delete(src);
        }
    })();
    pending.set(src, read);
    return read;
}

function evictOverflow() {
    while (cache.size > MAX_CACHED) {
        const oldest = cache.keys().next();
        if (oldest.done) return;
        const url = cache.get(oldest.value);
        cache.delete(oldest.value);
        if (url) URL.revokeObjectURL(url);
    }
}

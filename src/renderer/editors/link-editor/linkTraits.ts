import type { ILink, IFileLink } from "../../api/types/io.tree";
import { TraitKey, TraitSet, TraitTypeId, traitRegistry } from "../../core/traits";
import { FILE_LINK } from "../../core/traits/fileLinkTraits";
import { fs } from "../../api/fs";
import { fpBasename } from "../../core/utils/file-path";

// ── Trait interface ──────────────────────────────────────────────────────────

/** Trait for data that can be represented as ILink items. */
export interface LinkTrait {
    /** Get the draggable ILink items from the source data. */
    getItems(data: unknown): ILink[];
    /** Optional source identifier for same-source detection. */
    getSourceId?(data: unknown): string | undefined;
}

/** Trait key for link data. */
export const LINK = new TraitKey<LinkTrait>("Link");

// ── ILink trait registration ─────────────────────────────────────────────────

/** Data shape for ILink drag payload. */
export interface LinkDragData {
    items: ILink[];
    sourceId?: string;
}

/**
 * True for an href that is a real on-disk path (so its bytes can be copied), false
 * for URLs / curl commands / any URI scheme (`http://`, `mneme://`, `file://`, …).
 * Drives whether a link contributes file content when dropped on a file-backed
 * target (e.g. Mneme): local-file links copy, non-file links are ignored there.
 */
function isLocalFileHref(href: string): boolean {
    if (!href) return false;
    const h = href.trimStart();
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(h)) return false; // http://, mneme://, file://, …
    if (/^curl\s/i.test(h)) return false;
    return true;
}

const linkTraits = new TraitSet()
    .add(LINK, {
        getItems: (data: unknown) => (data as LinkDragData).items,
        getSourceId: (data: unknown) => (data as LinkDragData).sourceId,
    })
    // A link to a local file is also a file producer: dropping it on a file-backed
    // target (Mneme) copies the file; non-file links contribute nothing and are
    // ignored there. Bytes are read lazily so the drag payload stays small.
    .add(FILE_LINK, {
        getFiles: (data: unknown): IFileLink[] =>
            (data as LinkDragData).items
                .filter((i) => !i.isDirectory && isLocalFileHref(i.href))
                .map((i) => ({
                    name: i.title || fpBasename(i.href),
                    filePath: i.href,
                    getBytes: async () => fs.readBinary(i.href),
                })),
    });

traitRegistry.register(TraitTypeId.ILink, linkTraits);

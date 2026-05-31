import type {
    ITreeProvider,
    ITreeProviderItem,
    ITreeStat,
    ICategorySegment,
} from "../../api/types/io.tree";
import { archiveService } from "../../api/archive-service";
import { buildArchivePath } from "../../core/utils/file-path";
import { encodeCategoryLink, relativeCategorySegments } from "./tree-provider-link";

// Direct Node.js path — used only for basename/extname on plain filenames,
// not archive-aware path operations. Listed in coding-style.md exceptions.
const path = require("path") as typeof import("path");

const IMAGE_EXTENSIONS = new Set([
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".svg",
]);

/**
 * ITreeProvider for archives (ZIP, RAR, 7z, TAR, and related formats).
 *
 * Delegates all I/O to archiveService which handles the sequential queue
 * and archive reading via libarchive-wasm.
 */
export class ArchiveTreeProvider implements ITreeProvider {
    readonly type = "archive";
    readonly displayName: string;
    readonly navigable = false;
    readonly writable = false;
    readonly pinnable = false;
    readonly hasTags = false;
    readonly hasHostnames = false;

    readonly rootPath = "";

    constructor(public readonly sourceUrl: string) {
        this.displayName = path.basename(sourceUrl);
    }

    async list(innerDir: string): Promise<ITreeProviderItem[]> {
        let entries: { name: string; isDirectory: boolean }[];
        try {
            entries = await archiveService.listDir(this.sourceUrl, innerDir);
        } catch {
            return [];
        }

        const folders: ITreeProviderItem[] = [];
        const files: ITreeProviderItem[] = [];

        for (const entry of entries) {
            const innerPath = innerDir ? innerDir + "/" + entry.name : entry.name;

            if (entry.isDirectory) {
                folders.push({
                    title: entry.name,
                    href: buildArchivePath(this.sourceUrl, innerPath),
                    category: innerDir,
                    tags: [],
                    isDirectory: true,
                });
            } else {
                const ext = path.extname(entry.name).toLowerCase();
                const href = buildArchivePath(this.sourceUrl, innerPath);
                files.push({
                    title: entry.name,
                    href,
                    category: innerDir,
                    tags: ext ? [ext] : [],
                    isDirectory: false,
                    imgSrc: IMAGE_EXTENSIONS.has(ext) ? href : undefined,
                });
            }
        }

        // Folders first (alphabetical), then files by extension then name
        folders.sort((a, b) => a.title.localeCompare(b.title));
        files.sort((a, b) => {
            const extA = a.tags[0] ?? "";
            const extB = b.tags[0] ?? "";
            const extCmp = extA.localeCompare(extB);
            if (extCmp !== 0) return extCmp;
            return a.title.localeCompare(b.title);
        });

        return [...folders, ...files];
    }

    async stat(innerPath: string): Promise<ITreeStat> {
        try {
            const s = await archiveService.stat(this.sourceUrl, innerPath);
            return {
                exists: s.exists,
                isDirectory: s.isDirectory,
                size: s.size,
                mtime: s.mtime ? new Date(s.mtime).toISOString() : undefined,
            };
        } catch {
            return { exists: false, isDirectory: false };
        }
    }

    resolveLink(innerPath: string): string {
        return buildArchivePath(this.sourceUrl, innerPath);
    }

    getNavigationUrl(item: ITreeProviderItem): string {
        if (!item.isDirectory) return item.href;
        // Store the inner path (what list() expects), not the full archive href.
        // Root node has href === rootPath ("") — use rootPath directly.
        const innerPath = item.href === this.rootPath
            ? this.rootPath
            : (item.category ? item.category + "/" + item.title : item.title);
        return encodeCategoryLink({ type: this.type, url: this.sourceUrl, category: innerPath });
    }

    async getNavigationUrlByHref(href: string): Promise<string> {
        // Root path is always a directory (stat on "" may fail)
        if (href === this.rootPath) {
            return encodeCategoryLink({ type: this.type, url: this.sourceUrl, category: href });
        }
        const s = await this.stat(href);
        if (s.isDirectory) {
            return encodeCategoryLink({ type: this.type, url: this.sourceUrl, category: href });
        }
        return href;
    }

    getCategorySegments(category: string): ICategorySegment[] {
        return relativeCategorySegments(category);
    }
}

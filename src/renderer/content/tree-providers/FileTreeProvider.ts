import type {
    ITreeProvider,
    ITreeProviderItem,
    ITreeStat,
    ICategorySegment,
    IFileLink,
} from "../../api/types/io.tree";
import type { ISubscriptionObject } from "../../api/types/events";
import { copyPathsInto } from "../../core/utils/copy-files";
import { encodeCategoryLink } from "./tree-provider-link";
import { encodeGitTreeLink } from "../git-tree-link";
import { encodeMnemeFolderLink } from "../mneme-folder-link";
import { settings } from "../../api/settings";
import { debounce } from "../../../shared/utils";

// Direct Node.js imports — FileTreeProvider is a low-level filesystem provider
// that intentionally bypasses app.fs archive transparency. Listed in
// coding-style.md exceptions alongside FileProvider and CacheFileProvider.
const nodefs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");

const IMAGE_EXTENSIONS = new Set([
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".svg",
]);

/**
 * ITreeProvider for local filesystem directories.
 *
 * Uses Node.js fs/path directly — no archive-aware wrappers.
 * Archive browsing is handled by the separate ArchiveTreeProvider.
 */
export class FileTreeProvider implements ITreeProvider {
    readonly type = "file";
    readonly displayName: string;
    readonly navigable = true;
    readonly writable = true;
    readonly pinnable = false;
    readonly hasTags = false;
    readonly hasHostnames = false;

    readonly rootPath: string;

    constructor(public readonly sourceUrl: string) {
        this.displayName = path.basename(sourceUrl);
        this.rootPath = sourceUrl;
    }

    async list(dirPath: string): Promise<ITreeProviderItem[]> {
        let entries: import("fs").Dirent[];
        try {
            entries = nodefs.readdirSync(dirPath, { withFileTypes: true });
        } catch {
            return [];
        }

        const folders: ITreeProviderItem[] = [];
        const files: ITreeProviderItem[] = [];

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            const isDir = entry.isDirectory();

            if (isDir) {
                // A real `.git` repo dir → Git Tree entry point (EPIC-030 / US-612).
                const isGit = entry.name === ".git" && this.isGitRepoDir(fullPath);
                // A `.mneme` dir (a Mneme root's per-root store) → Mneme root editor
                // (EPIC-032 / US-663). Name-only detection, gated on `mneme.enabled`.
                const isMneme = !isGit
                    && entry.name === ".mneme"
                    && !!settings.get("mneme.enabled");
                folders.push({
                    title: entry.name,
                    href: fullPath,
                    category: dirPath,
                    tags: [],
                    isDirectory: true,
                    ...(isGit ? { target: "git-tree", icon: "git" } : {}),
                    ...(isMneme ? { target: "mneme-root", icon: "mneme" } : {}),
                });
            } else {
                const ext = path.extname(entry.name).toLowerCase();
                files.push({
                    title: entry.name,
                    href: fullPath,
                    category: dirPath,
                    tags: ext ? [ext] : [],
                    isDirectory: false,
                    imgSrc: IMAGE_EXTENSIONS.has(ext) ? fullPath : undefined,
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

        // Add ".." entry to navigate to parent (unless at root)
        const result: ITreeProviderItem[] = [];
        const normalized = dirPath.replace(/\\/g, "/");
        const rootNormalized = this.sourceUrl.replace(/\\/g, "/");
        if (normalized !== rootNormalized) {
            result.push({
                title: "..",
                href: path.dirname(dirPath),
                category: dirPath,
                tags: [],
                isDirectory: true,
            });
        }

        return [...result, ...folders, ...files];
    }

    async stat(filePath: string): Promise<ITreeStat> {
        try {
            const s = nodefs.statSync(filePath);
            return {
                exists: true,
                isDirectory: s.isDirectory(),
                size: s.size,
                mtime: s.mtime.toISOString(),
            };
        } catch {
            return { exists: false, isDirectory: false };
        }
    }

    resolveLink(filePath: string): string {
        return filePath;
    }

    getNavigationUrl(item: ITreeProviderItem): string {
        // `.git` repo dir → open the Git Tree editor (repoRoot = parent of .git).
        if (item.target === "git-tree") {
            return encodeGitTreeLink(path.dirname(item.href));
        }
        // `.mneme` dir → open the Mneme root editor (rootFolder = parent of .mneme).
        if (item.target === "mneme-root") {
            return encodeMnemeFolderLink(path.dirname(item.href));
        }
        if (!item.isDirectory) return item.href;
        return encodeCategoryLink({ type: this.type, url: this.sourceUrl, category: item.href });
    }

    /** Cheap, `git.enabled`-gated marker check for a real `.git` repo directory
     *  (HEAD + objects present). No git spawn. (EPIC-030 Concern 2B / US-612.) */
    private isGitRepoDir(gitPath: string): boolean {
        if (!settings.get("git.enabled")) return false;
        try {
            return nodefs.existsSync(path.join(gitPath, "HEAD"))
                && nodefs.existsSync(path.join(gitPath, "objects"));
        } catch {
            return false;
        }
    }

    async getNavigationUrlByHref(href: string): Promise<string> {
        const s = await this.stat(href);
        if (s.isDirectory) {
            return encodeCategoryLink({ type: this.type, url: this.sourceUrl, category: href });
        }
        return href;
    }

    getCategorySegments(category: string): ICategorySegment[] {
        const root = this.rootPath.replace(/\\/g, "/").replace(/\/+$/, "");
        const cur = category.replace(/\\/g, "/").replace(/\/+$/, "");
        if (!cur || cur === root) return [];
        const rel = cur.startsWith(root + "/") ? cur.slice(root.length + 1) : cur;
        const parts = rel.split("/").filter(Boolean);
        return parts.map((label, i) => ({
            label,
            // Absolute path of this ancestor. readdirSync accepts "/" on Windows,
            // so a "/"-joined absolute path is a valid navigation category.
            category: root + "/" + parts.slice(0, i + 1).join("/"),
        }));
    }

    async addItem(item: Partial<ITreeProviderItem> & { href: string }): Promise<ITreeProviderItem> {
        nodefs.writeFileSync(item.href, "");
        const title = item.title || path.basename(item.href);
        return { href: item.href, title, category: item.category ?? "", tags: [], isDirectory: false };
    }

    async mkdir(dirPath: string): Promise<void> {
        nodefs.mkdirSync(dirPath, { recursive: true });
    }

    /**
     * Import dropped file-like items into `targetCategory` (a directory path).
     * Items with an OS `filePath` are copied recursively (files + folders) via the
     * shared `copyPathsInto` helper — same behavior as clipboard paste; overwrite
     * confirmation is the caller's responsibility (TreeProviderViewModel prompts).
     * Byte-only producers (no `filePath`) are written directly. Enables OS-file /
     * cross-tree drag-drop onto Explorer folders.
     */
    async importFiles(items: IFileLink[], targetCategory: string): Promise<void> {
        const paths = items.map((i) => i.filePath).filter((p): p is string => !!p);
        if (paths.length) {
            const result = await copyPathsInto(paths, targetCategory, { move: false });
            if (result.errors.length) throw new Error(result.errors.join("\n"));
        }
        for (const item of items) {
            if (item.filePath) continue;
            const bytes = await item.getBytes();
            nodefs.writeFileSync(path.join(targetCategory, item.name), Buffer.from(bytes));
        }
    }

    async rename(oldPath: string, newPath: string): Promise<void> {
        nodefs.renameSync(oldPath, newPath);
    }

    async deleteItem(href: string): Promise<void> {
        const s = nodefs.statSync(href);
        if (s.isDirectory()) {
            nodefs.rmSync(href, { recursive: true });
        } else {
            nodefs.unlinkSync(href);
        }
    }

    /**
     * Watch the root directory recursively for changes.
     * Uses a single fs.watch({ recursive: true }) handle — efficient on Windows
     * (ReadDirectoryChangesW). Debounces at 500ms to batch rapid changes.
     * Returns a subscription object; call unsubscribe() to stop watching.
     * Gracefully degrades on failure (network drives, unmounted volumes).
     */
    watch(callback: () => void): ISubscriptionObject {
        try {
            const debouncedCallback = debounce(callback, 500);
            const watcher = nodefs.watch(this.sourceUrl, { recursive: true }, debouncedCallback);
            return { unsubscribe: () => watcher.close() };
        } catch {
            return { unsubscribe: () => {} };
        }
    }
}

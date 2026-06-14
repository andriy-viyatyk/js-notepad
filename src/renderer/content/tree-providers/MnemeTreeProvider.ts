import type {
    ITreeProvider,
    ILink,
    ITreeStat,
    ICategorySegment,
} from "../../api/types/io.tree";
import { mnemeConnection } from "../../api/mneme-connection";
import { parseToolResult } from "../../editors/mneme-config/mnemeTypes";
import { fpExtname } from "../../core/utils/file-path";

/** One `wiki_tree` entry (flat depth-first node). `depth` is the absolute
 *  slash count of the address; `uri` is `mneme://{root}/{path}`. */
interface MnemeTreeEntry {
    uri: string;
    name: string;
    isDir: boolean;
    depth: number;
}

/**
 * Read-only ITreeProvider for a single Mneme root (EPIC-032 / US-663).
 *
 * Lists one level per call via the `wiki_tree` MCP tool with `depth: 1` (the
 * sidecar then returns only the requested node + its immediate children — the
 * tree view loads deeper levels lazily on expand). File nodes open as
 * `mneme://{root}/{path}` documents through the existing open pipeline;
 * directories are expand-only (the provider is not navigable). All addresses
 * are scheme-less `{root}/{path}` (the `mneme://` prefix is added only by
 * `getNavigationUrl` for files) so they stay consistent with the tree view's
 * `category + "/" + title` child-path reconstruction.
 *
 * No write surface — file create/delete/rename is out of scope for this task.
 */
export class MnemeTreeProvider implements ITreeProvider {
    readonly type = "mneme";
    readonly displayName: string;
    readonly sourceUrl: string;
    readonly rootPath: string;

    readonly navigable = false;
    readonly writable = false;
    readonly hasTags = false;
    readonly hasHostnames = false;
    readonly pinnable = false;

    constructor(public readonly rootName: string) {
        this.displayName = rootName;
        this.rootPath = rootName;
        this.sourceUrl = `mneme://${rootName}`;
    }

    async list(path: string): Promise<ILink[]> {
        const client = mnemeConnection.getClient();
        if (!client) return [];

        let entries: MnemeTreeEntry[] = [];
        try {
            const result = await client.callTool(
                { name: "wiki_tree", arguments: { path, depth: 1 } },
                undefined,
                { timeout: 10_000 },
            );
            entries = parseToolResult<{ entries: MnemeTreeEntry[] }>(result)?.entries ?? [];
        } catch {
            return [];
        }

        // Immediate children of `path` have absolute depth === the parent's
        // segment count (a child adds exactly one segment / one slash).
        const childDepth = path.split("/").length;
        const folders: ILink[] = [];
        const files: ILink[] = [];
        for (const e of entries) {
            if (e.depth !== childDepth) continue;
            const href = e.uri.startsWith("mneme://") ? e.uri.slice("mneme://".length) : e.uri;
            if (e.isDir) {
                folders.push({ title: e.name, href, category: path, tags: [], isDirectory: true });
            } else {
                const ext = fpExtname(e.name).toLowerCase();
                files.push({ title: e.name, href, category: path, tags: ext ? [ext] : [], isDirectory: false });
            }
        }
        folders.sort((a, b) => a.title.localeCompare(b.title));
        files.sort((a, b) => a.title.localeCompare(b.title));
        return [...folders, ...files];
    }

    async stat(_path: string): Promise<ITreeStat> {
        // The sidebar opens items via getNavigationUrl(item) directly, so stat is
        // not on the click path; return a best-effort stub.
        return { exists: true, isDirectory: false };
    }

    resolveLink(path: string): string {
        return path;
    }

    getNavigationUrl(item: ILink): string {
        // Files open as mneme:// documents; directories expand in place (the
        // provider is not navigable), so they have no navigation URL.
        if (item.isDirectory) return "";
        return `mneme://${item.href}`;
    }

    async getNavigationUrlByHref(href: string): Promise<string> {
        return `mneme://${href}`;
    }

    getCategorySegments(category: string): ICategorySegment[] {
        const root = this.rootPath;
        if (!category || category === root) return [];
        const rel = category.startsWith(root + "/") ? category.slice(root.length + 1) : category;
        const parts = rel.split("/").filter(Boolean);
        return parts.map((label, i) => ({
            label,
            category: root + "/" + parts.slice(0, i + 1).join("/"),
        }));
    }

    dispose(): void {
        // The MCP connection is shared (mnemeConnection) — never disconnect it here.
    }
}

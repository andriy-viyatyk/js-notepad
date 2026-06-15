import type {
    ITreeProvider,
    ILink,
    ITreeStat,
    ICategorySegment,
} from "../../api/types/io.tree";
import type { ISubscriptionObject } from "../../api/types/events";
import type { IFileLink } from "../../core/traits/fileLinkTraits";
import { mnemeConnection } from "../../api/mneme-connection";
import { parseToolResult } from "../../editors/mneme-config/mnemeTypes";
import { fpExtname } from "../../core/utils/file-path";

/** One `tree` entry (flat depth-first node). `depth` is the absolute
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
 * Lists one level per call via the `tree` MCP tool with `depth: 1` (the
 * sidecar then returns only the requested node + its immediate children — the
 * tree view loads deeper levels lazily on expand). File nodes open as
 * `mneme://{root}/{path}` documents through the existing open pipeline;
 * directories are expand-only (the provider is not navigable). All addresses
 * are scheme-less `{root}/{path}` (the `mneme://` prefix is added only by
 * `getNavigationUrl` for files) so they stay consistent with the tree view's
 * `category + "/" + title` child-path reconstruction.
 *
 * Writable (US-674): `addItem`/`mkdir`/`rename`/`deleteItem` map onto the Mneme
 * MCP tools (`write`/`mkdir`/`rename`/`delete`) over the shared connection — the
 * generic tree view supplies the New File / New Folder / Rename / Delete / DnD-move
 * UX once `writable` is set. `watch` rides the connection's `resources/list_changed`
 * so the tree live-refreshes after any create/rename/delete (ours or an agent's).
 */
export class MnemeTreeProvider implements ITreeProvider {
    readonly type = "mneme";
    readonly displayName: string;
    readonly sourceUrl: string;
    readonly rootPath: string;

    readonly navigable = false;
    readonly writable = true;
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
                { name: "tree", arguments: { path, depth: 1 } },
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

    // --- Write surface (US-674) — maps onto the Mneme MCP tools ----------------

    /** Create a new (empty) document. `item.href` is the scheme-less `{root}/{path}`
     *  address the tree view built from `category + "/" + name`. */
    async addItem(item: Partial<ILink> & { href: string }): Promise<ILink> {
        const client = this.requireClient();
        await client.callTool({ name: "write", arguments: { path: item.href, content: "" } });
        const name = item.title || item.href.split("/").pop() || item.href;
        const ext = fpExtname(name).toLowerCase();
        return {
            title: name,
            href: item.href,
            category: item.category ?? "",
            tags: ext ? [ext] : [],
            isDirectory: false,
        };
    }

    /** Create an empty folder (≈ mkdir -p). */
    async mkdir(path: string): Promise<void> {
        const client = this.requireClient();
        await client.callTool({ name: "mkdir", arguments: { path } });
    }

    /** Rename or move a file or folder (also serves DnD move). Both paths are
     *  scheme-less `{root}/{path}` addresses. */
    async rename(oldPath: string, newPath: string): Promise<void> {
        const client = this.requireClient();
        await client.callTool({ name: "rename", arguments: { from: oldPath, to: newPath } });
    }

    /** Delete a file, or a folder and everything under it (the `delete` tool is recursive). */
    async deleteItem(href: string): Promise<void> {
        const client = this.requireClient();
        await client.callTool({ name: "delete", arguments: { path: href } });
    }

    /** Import dropped files into `targetCategory`. Always `upload` (binary-safe, no
     *  extension sniffing); the mneme watcher/reconcile indexes any `.md` shortly after. */
    async importFiles(items: IFileLink[], targetCategory: string): Promise<void> {
        const client = this.requireClient();
        for (const item of items) {
            const path = `${targetCategory}/${item.name}`;
            const bytes = Buffer.from(await item.getBytes());
            await client.callTool({
                name: "upload",
                arguments: { path, contentBase64: bytes.toString("base64") },
            });
        }
    }

    /** Live-refresh: rebuild the tree on any `resources/list_changed` (create/rename/delete),
     *  whether triggered by our own mutations or an external/agent change. */
    watch(callback: () => void): ISubscriptionObject {
        return mnemeConnection.onListChanged(callback);
    }

    private requireClient() {
        const client = mnemeConnection.getClient();
        if (!client) throw new Error("Mneme is not connected");
        return client;
    }

    dispose(): void {
        // The MCP connection is shared (mnemeConnection) — never disconnect it here.
    }
}

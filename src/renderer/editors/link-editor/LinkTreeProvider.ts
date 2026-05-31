import type {
    ITreeProvider,
    ILink,
    ITreeStat,
    ITreeTagInfo,
    ICategorySegment,
} from "../../api/types/io.tree";
import type { ISubscriptionObject } from "../../api/types/events";
import { encodeCategoryLink, relativeCategorySegments } from "../../content/tree-providers/tree-provider-link";
import { getHostname } from "../../components/tree-provider/favicon-cache";
import { fpBasename } from "../../core/utils/file-path";
import type { ILinkSource, LinkItem } from "./linkTypes";

export class LinkTreeProvider implements ITreeProvider {
    readonly type = "link";
    readonly displayName: string;
    readonly sourceUrl: string;
    readonly rootPath = "";

    readonly navigable = false;
    readonly writable = true;
    readonly hasTags = true;
    readonly hasHostnames = true;
    readonly pinnable = true;

    constructor(
        private readonly source: ILinkSource,
        sourceUrl: string,
    ) {
        this.sourceUrl = sourceUrl;
        this.displayName = sourceUrl ? fpBasename(sourceUrl) : "Links";
    }

    // =========================================================================
    // List
    // =========================================================================

    async list(categoryPath: string): Promise<ILink[]> {
        const links = this.source.state.get().data.links;
        const prefix = categoryPath ? categoryPath + "/" : "";
        const subCategories = new Map<string, number>();
        // Track which sub-categories have deeper sub-categories
        const hasSubCategories = new Set<string>();
        const items: ILink[] = [];

        for (const link of links) {
            const cat = link.category || "";
            if (cat === categoryPath) {
                // Direct child — leaf link item
                items.push(this.linkToItem(link));
            } else if (cat.startsWith(prefix)) {
                // Sub-category — extract direct child name
                const rest = cat.slice(prefix.length);
                const childName = rest.split("/")[0];
                subCategories.set(childName, (subCategories.get(childName) || 0) + 1);
                // Check if there are deeper levels (grandchild categories)
                if (rest.includes("/")) {
                    hasSubCategories.add(childName);
                }
            }
        }

        // Build directory items for sub-categories (sorted alphabetically)
        const dirItems: ILink[] = [];
        for (const [name, count] of [...subCategories.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
            const fullCategory = prefix + name;
            const hasDirectItems = links.some(l => l.category === fullCategory);
            dirItems.push({
                title: name,
                href: fullCategory,
                category: categoryPath,
                tags: [],
                isDirectory: true,
                size: count,
                hasSubDirectories: hasSubCategories.has(name),
                hasItems: hasDirectItems,
            });
        }

        return [...dirItems, ...items];
    }

    // =========================================================================
    // Stat / Resolve
    // =========================================================================

    async stat(path: string): Promise<ITreeStat> {
        const { categoriesSize, data } = this.source.state.get();
        if (path in categoriesSize) {
            return { exists: true, isDirectory: true };
        }
        const link = data.links.find(l => l.href === path);
        if (link) {
            return { exists: true, isDirectory: !!link.isDirectory };
        }
        return { exists: false, isDirectory: false };
    }

    resolveLink(path: string): string {
        return path;
    }

    getNavigationUrl(item: ILink): string {
        if (item.isDirectory) {
            return encodeCategoryLink({ type: this.type, url: this.sourceUrl, category: item.href });
        }
        return item.href;
    }

    async getNavigationUrlByHref(href: string): Promise<string> {
        const s = await this.stat(href);
        if (s.isDirectory) {
            return encodeCategoryLink({ type: this.type, url: this.sourceUrl, category: href });
        }
        return href;
    }

    getCategorySegments(category: string): ICategorySegment[] {
        return relativeCategorySegments(category);
    }

    // =========================================================================
    // Write operations
    // =========================================================================

    async addItem(item: Partial<ILink> & { href: string }): Promise<ILink> {
        const newLink = this.source.addLink({
            title: item.title,
            href: item.href,
            category: item.category,
            tags: item.tags,
            imgSrc: item.imgSrc,
        });
        return this.linkToItem(newLink);
    }

    async updateItem(href: string, changes: Partial<ILink>): Promise<ILink> {
        const link = this.source.state.get().data.links.find(l => l.href === href);
        if (!link) throw new Error(`Link not found: ${href}`);
        this.source.updateLink(link.id, {
            title: changes.title,
            href: changes.href,
            category: changes.category,
            tags: changes.tags,
            imgSrc: changes.imgSrc,
        });
        const updated = this.source.getLinkById(link.id);
        return this.linkToItem(updated);
    }

    async deleteItem(href: string): Promise<void> {
        const link = this.source.state.get().data.links.find(l => l.href === href);
        if (link) {
            await this.source.deleteLink(link.id, true);
        }
    }

    async moveToCategory(hrefs: string[], targetCategory: string): Promise<void> {
        for (const href of hrefs) {
            const link = this.source.state.get().data.links.find(l => l.href === href);
            if (link) {
                this.source.moveLinkToCategory(link.id, targetCategory);
            }
        }
    }

    /**
     * Move an entire category sub-tree to a new parent.
     * All links whose category equals `sourcePath` or starts with `sourcePath/`
     * get their category prefix replaced.
     * Example: renameCategoryPath("A/B", "C") → "A/B"→"C/B", "A/B/D"→"C/B/D"
     */
    async renameCategoryPath(sourcePath: string, targetCategory: string): Promise<void> {
        const { links } = this.source.state.get().data;
        const nameStart = sourcePath.lastIndexOf("/") + 1;
        const prefix = sourcePath + "/";
        for (const l of links) {
            if (l.category === sourcePath || l.category?.startsWith(prefix)) {
                const suffix = l.category.slice(nameStart);
                const newCategory = targetCategory ? targetCategory + "/" + suffix : suffix;
                this.source.moveLinkToCategory(l.id, newCategory);
            }
        }
    }

    // =========================================================================
    // Tags
    // =========================================================================

    getTags(): ITreeTagInfo[] {
        const { tags, tagsSize } = this.source.state.get();
        return tags.map(t => ({ name: t, count: tagsSize[t] || 0 }));
    }

    getTagItems(tag: string): ILink[] {
        const links = this.source.state.get().data.links;

        // Empty tag = "All" — return all items (no filter)
        if (!tag) return links.map(l => this.linkToItem(l));

        const separator = ":";
        let filtered: LinkItem[];

        if (tag.endsWith(separator)) {
            filtered = links.filter(l => l.tags?.some(t => t.startsWith(tag) || t === tag));
        } else {
            filtered = links.filter(l => l.tags?.includes(tag));
        }
        return filtered.map(l => this.linkToItem(l));
    }

    // =========================================================================
    // Hostnames
    // =========================================================================

    getHostnames(): ITreeTagInfo[] {
        const { hostnames, hostnamesSize } = this.source.state.get();
        return hostnames.map(h => ({ name: h, count: hostnamesSize[h] || 0 }));
    }

    getHostnameItems(hostname: string): ILink[] {
        const links = this.source.state.get().data.links;
        return links
            .filter(l => getHostname(l.href) === hostname)
            .map(l => this.linkToItem(l));
    }

    // =========================================================================
    // Pinning
    // =========================================================================

    pin(href: string): void {
        const link = this.source.state.get().data.links.find(l => l.href === href);
        if (link) this.source.pinLink(link.id);
    }

    unpin(href: string): void {
        const link = this.source.state.get().data.links.find(l => l.href === href);
        if (link) this.source.unpinLink(link.id);
    }

    getPinnedItems(): ILink[] {
        return this.source.getPinnedLinks().map(l => this.linkToItem(l));
    }

    // =========================================================================
    // Watch
    // =========================================================================

    watch(callback: () => void): ISubscriptionObject {
        const unsub = this.source.state.subscribe(callback);
        return { unsubscribe: unsub };
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private linkToItem(link: LinkItem): ILink {
        return {
            ...link,
            title: link.title || link.href,
            category: link.category || "",
            tags: link.tags || [],
            isDirectory: !!link.isDirectory,
        };
    }
}

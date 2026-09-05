import type { LinkEditor } from "../../editors/link-editor";
import type { LinkItem } from "../../editors/link-editor/linkTypes";
import type { IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";

const LINK_EDITOR_MEMBERS: readonly IAiMember[] = [
    { name: "links", kind: "property", summary: "All links (complete data, not filtered by UI)." },
    { name: "categories", kind: "property", summary: "All category names." },
    { name: "tags", kind: "property", summary: "All tag names." },
    { name: "linksCount", kind: "property", summary: "Total number of links." },
    { name: "addLink", kind: "method", signature: "addLink(url: string, title?: string, category?: string): void", summary: "Add a new link." },
    { name: "deleteLink", kind: "method", signature: "deleteLink(id: string): void", summary: "Delete a link by ID.", caution: "deletes link data" },
    { name: "updateLink", kind: "method", signature: "updateLink(id: string, data: { title?: string; category?: string; url?: string }): void", summary: "Update link properties. Map url to the link's href." },
];

const LINK_EDITOR_HELP = `Obtain via pages[i].asLink() on a links page (\`link-view\`); pass true — \`asLink(true)\` — to switch a compatible page to this editor first.
Links, categories, and tags management.`;

/**
 * Safe facade around LinkEditor for script access.
 * Implements the ILinkEditor interface from api/types/link-editor.d.ts.
 *
 * - Links are read-only snapshots (ILink projection of LinkItem)
 * - `href` is exposed as `url`, `pinned` is computed from state
 * - Delete operations skip confirmation dialogs
 */
export class LinkEditorFacade implements IAiVisible {
    constructor(private readonly editor: LinkEditor) {}

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "LinkEditor",
            summary: "Links management facade.",
            members: LINK_EDITOR_MEMBERS,
            help: LINK_EDITOR_HELP,
            summarize: () => ({
                kind: "LinkEditor",
                linksCount: this.linksCount,
                categories: this.categories,
                tags: this.tags,
            }),
        };
    }

    get links(): Array<{ readonly id: string; readonly url: string; readonly title: string; readonly category: string; readonly tags: readonly string[]; readonly pinned: boolean; readonly isDirectory: boolean }> {
        return this.editor.state.get().data.links.map((link) => mapLink(link, this.editor));
    }

    get categories(): string[] {
        return this.editor.state.get().categories;
    }

    get tags(): string[] {
        return this.editor.state.get().tags;
    }

    get linksCount(): number {
        return this.editor.state.get().data.links.length;
    }

    addLink(url: string, title?: string, category?: string): void {
        this.editor.addLink({ href: url, title: title ?? "", category: category ?? "" });
    }

    deleteLink(id: string): void {
        this.editor.deleteLink(id, true);
    }

    updateLink(id: string, data: { title?: string; category?: string; url?: string }): void {
        const updates: Partial<Omit<LinkItem, "id">> = {};
        if (data.title !== undefined) updates.title = data.title;
        if (data.category !== undefined) updates.category = data.category;
        if (data.url !== undefined) updates.href = data.url;
        this.editor.updateLink(id, updates);
    }
}

/** Map internal LinkItem → ILink. */
function mapLink(link: LinkItem, editor: LinkEditor) {
    return {
        id: link.id,
        url: link.href,
        title: link.title,
        category: link.category,
        tags: link.tags ?? [],
        pinned: editor.isLinkPinned(link.id),
        isDirectory: link.isDirectory ?? false,
    };
}

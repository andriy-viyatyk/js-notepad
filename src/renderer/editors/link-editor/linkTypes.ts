import type { ILink } from "../../api/types/io.tree";
import { TextFileModel } from "../text/TextEditorModel";

// Ensure link traits are registered at startup
import "../../core/traits/linkTraits";

// =============================================================================
// Link Item
// =============================================================================

/** Link item with required id — used in .link.json collections. */
export interface LinkItem extends ILink {
    id: string;
}

// =============================================================================
// View Modes
// =============================================================================

export type LinkViewMode =
    | "list"
    | "tiles-landscape"
    | "tiles-landscape-big"
    | "tiles-portrait"
    | "tiles-portrait-big";

// =============================================================================
// Link Editor Data (root structure)
// =============================================================================

/** Root data structure for .link.json file */
export interface LinkEditorData {
    links: LinkItem[];
    state: {
        /** View mode per category path (empty string = root/all) */
        categoryViewMode?: Record<string, LinkViewMode>;
        /** View mode per tag (empty string = all) */
        tagViewMode?: Record<string, LinkViewMode>;
        /** View mode per hostname (empty string = all) */
        hostnameViewMode?: Record<string, LinkViewMode>;
        /** Ordered array of pinned link IDs */
        pinnedLinks?: string[];
        /** Width of the pinned links panel */
        pinnedPanelWidth?: number;
    };
}


/**
 * Slice of state read by LinkTreeProvider. `LinkEditor` satisfies this
 * shape — its full state type is wider, but only these fields are consumed
 * by the provider.
 */
export interface ILinkSourceSnapshot {
    data: LinkEditorData;
    categories: string[];
    categoriesSize: Record<string, number>;
    tags: string[];
    tagsSize: Record<string, number>;
    hostnames: string[];
    hostnamesSize: Record<string, number>;
}

export interface ILinkSource {
    readonly state: {
        get(): ILinkSourceSnapshot;
        subscribe(listener: () => void): () => void;
        subscribe<R>(listener: (value: R) => void, selector: (state: ILinkSourceSnapshot) => R): () => void;
    };
    addLink(link?: Partial<LinkItem>): LinkItem;
    importLinks(
        items: ILink[],
        opts?: { moveExistingToCategory?: string },
    ): Promise<void>;
    getLinkById(id: string): LinkItem | undefined;
    updateLink(id: string, updates: Partial<Omit<LinkItem, "id">>): void;
    deleteLink(id: string, skipConfirm?: boolean): Promise<void>;
    moveLinkToCategory(linkId: string, category: string): void;
    pinLink(id: string): void;
    unpinLink(id: string): void;
    getPinnedLinks(): LinkItem[];
}

export type LinkSource = import("./LinkEditor").LinkEditor;

// =============================================================================
// Component Props
// =============================================================================

export interface LinkEditorProps {
    model: TextFileModel;
    /** When true, the categories/tags panel appears on the right instead of the left. */
    swapLayout?: boolean;
    /** Portal target for the first toolbar section (breadcrumb). When omitted, portal is not rendered. */
    toolbarRefFirst?: HTMLDivElement | null;
    /** Portal target for the last toolbar section (buttons, search). When omitted, portal is not rendered. */
    toolbarRefLast?: HTMLDivElement | null;
    /** Portal target for the footer section (link count). When omitted, portal is not rendered. */
    footerRefLast?: HTMLDivElement | null;
}

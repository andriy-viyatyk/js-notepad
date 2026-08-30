import { TDialogModel } from "../../core/state/model";
import { TComponentState } from "../../core/state/state";
import { showDialog } from "../../ui/dialogs/Dialogs";
import { registerDialogView } from "../../ui/dialogs/dialog-view-registry";
import type { LinkItem } from "./linkTypes";
import type { TorProxyInfo } from "./tor-src";
import { EditLinkDialogView } from "./EditLinkDialogView";

// =============================================================================
// Types
// =============================================================================

interface EditLinkDialogState {
    dialogTitle: string;
    linkTitle: string;
    href: string;
    category: string;
    tags: string[];
    imgSrc: string;
    target: string;
    categories: string[];
    availableTags: string[];
    discoveredImages: string[];
    /** US-896 — Tor session to fetch preview/discovered images through. */
    imageProxy: TorProxyInfo | null;
}

export type EditLinkResult = Omit<LinkItem, "id"> | undefined;

// =============================================================================
// Model
// =============================================================================

const editLinkDialogId = Symbol("editLinkDialog");

export class EditLinkDialogModel extends TDialogModel<EditLinkDialogState, EditLinkResult> {
    handleKeyDown = (e: KeyboardEvent) => {
        if (e.defaultPrevented) return;
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            this.save();
        }
    };

    setTitle = (value: string) => {
        this.state.update((s) => { s.linkTitle = value; });
    };

    setHref = (value: string) => {
        this.state.update((s) => { s.href = value; });
    };

    setCategory = (value: string) => {
        this.state.update((s) => { s.category = value; });
    };

    setCategoryFromBlur = (finalValue?: string) => {
        if (finalValue !== undefined) {
            this.state.update((s) => { s.category = finalValue; });
        }
    };

    setImgSrc = (value: string) => {
        this.state.update((s) => { s.imgSrc = value; });
    };

    setTarget = (value: string) => {
        this.state.update((s) => { s.target = value; });
    };

    setTags = (tags: string[]) => {
        this.state.update((s) => { s.tags = tags; });
    };

    selectDiscoveredImage = (url: string) => {
        this.state.update((s) => { s.imgSrc = url; });
    };

    save = () => {
        const state = this.state.get();
        this.close({
            title: state.linkTitle.trim(),
            href: state.href.trim(),
            category: state.category.trim(),
            tags: state.tags,
            isDirectory: false,
            imgSrc: state.imgSrc.trim() || undefined,
            target: state.target || undefined,
        });
    };
}

registerDialogView(editLinkDialogId, EditLinkDialogView);

// =============================================================================
// Public API
// =============================================================================

export interface ShowEditLinkDialogOptions {
    /** Dialog title (default: "Edit Link" or "Add Link") */
    title?: string;
    /** Existing link data (for editing) or defaults (for creating) */
    link?: Partial<LinkItem>;
    /** Available categories for autocomplete */
    categories?: string[];
    /** Available tags for autocomplete */
    tags?: string[];
    /** Discovered images from browser (for future integration) */
    discoveredImages?: string[];
    /** US-896 — Tor session to fetch preview/discovered images through. Pass the
     *  owning LinkEditor's `imageProxy`; omit outside Tor pages. */
    imageProxy?: TorProxyInfo | null;
}

export function showEditLinkDialog(options: ShowEditLinkDialogOptions = {}): Promise<EditLinkResult> {
    const { link = {}, categories = [], tags = [], discoveredImages = [] } = options;

    const modelState: EditLinkDialogState = {
        dialogTitle: options.title || (link.id ? "Edit Link" : "Add Link"),
        linkTitle: link.title ?? "",
        href: link.href ?? "",
        category: link.category ?? "",
        tags: link.tags ? [...link.tags] : [],
        imgSrc: link.imgSrc ?? "",
        target: link.target ?? "",
        categories,
        availableTags: tags,
        discoveredImages,
        imageProxy: options.imageProxy ?? null,
    };

    const model = new EditLinkDialogModel(new TComponentState(modelState));
    return showDialog({
        viewId: editLinkDialogId,
        model,
    }) as Promise<EditLinkResult>;
}

import { TComponentState } from "../../core/state/state";
import { app } from "../../api/app";
import type { ITreeProvider, ITreeProviderItem, ILink } from "../../api/types/io.tree";
import type { NavigationState } from "../base/navigation-state";
import type { TOneState } from "../../core/state/state";
import { folderViewModeService } from "./FolderViewModeService";
import {
    EditorModel,
    type EditorStateBase,
} from "../base/EditorModel";
import { createFolderIconElement } from "../../components/icons/icon-elements";
import { fpBasename } from "../../core/utils/file-path";
import { LinkEditor } from "../link-editor/LinkEditor";
import { ExplorerEditor } from "../explorer/ExplorerEditorModel";
import { ArchiveEditor } from "../archive/ArchiveEditor";
import { createLinkData } from "../../../shared/link-data";
import {
    decodeCategoryLink,
    encodeCategoryLink,
    type ITreeProviderLink,
} from "../../content/tree-providers/tree-provider-link";

export interface CategoryEditorModelState extends EditorStateBase {
    type: "categoryPage";
}

export function getDefaultCategoryEditorModelState(): CategoryEditorModelState {
    return {
        id: crypto.randomUUID(),
        title: "",
        modified: false,
        type: "categoryPage",
        filePath: "",
    };
}

export interface CategoryTreeProviderHost {
    readonly treeProvider: ITreeProvider | null;
    readonly selectionState: TOneState<NavigationState>;
    readonly id: string;
}

export type CategoryTreeProviderHostEditor = EditorModel & CategoryTreeProviderHost;

function isCategoryTreeProviderHost(editor: EditorModel): editor is CategoryTreeProviderHostEditor {
    return editor instanceof LinkEditor
        || editor instanceof ExplorerEditor
        || editor instanceof ArchiveEditor;
}

function findTreeProviderHost(
    secondaryViews: EditorModel[],
    type: string,
    sourceUrl: string,
): CategoryTreeProviderHostEditor | null {
    for (const editor of secondaryViews) {
        if (!isCategoryTreeProviderHost(editor)) continue;
        const provider = editor.treeProvider;
        if (provider && provider.type === type && provider.sourceUrl === sourceUrl) return editor;
    }
    return null;
}

function copyItem(item: ILink): ILink {
    return {
        ...item,
        tags: [...item.tags],
    };
}

export class CategoryEditorModel extends EditorModel<CategoryEditorModelState> {
    /** Editor identity. Matches `EditorDescriptor.editorId`. */
    readonly editorId = "category-view";

    noLanguage = true;

    constructor(state?: TComponentState<CategoryEditorModelState>) {
        super(state ?? new TComponentState(getDefaultCategoryEditorModelState()));
    }

    getIconElement = (): HTMLElement => {
        const wrapper = document.createElement("span");
        wrapper.style.display = "inline-block";
        wrapper.style.transform = "translate(-2px, -3px)";
        wrapper.append(createFolderIconElement());
        return wrapper;
    };

    /** Decoded category path from the tree-category:// link in filePath. */
    get categoryPath(): string | undefined {
        const link = this.decodedLink;
        return link?.category;
    }

    get providerHost(): CategoryTreeProviderHostEditor | null {
        const page = this.page;
        const link = this.decodedLink;
        return page && link ? findTreeProviderHost(page.panelEditors, link.type, link.url) : null;
    }

    get viewMode(): import("../../components/tree-provider/CategoryViewModel").CategoryViewMode {
        const categoryPath = this.categoryPath;
        if (!this.providerHost?.treeProvider || categoryPath === undefined) return "list";
        return folderViewModeService.getViewModeSync(categoryPath);
    }

    async listItems(): Promise<ILink[] | undefined> {
        const provider = this.providerHost?.treeProvider;
        const categoryPath = this.categoryPath;
        if (!provider || categoryPath === undefined) return undefined;
        const items = await provider.list(categoryPath);
        return items.slice(0, 200).map(copyItem);
    }

    selectItem(item: ITreeProviderItem): void {
        const host = this.providerHost;
        if (host) host.selectionState.update((state) => { state.selectedHref = item.href; });
    }

    async openItem(item: ITreeProviderItem): Promise<void> {
        const host = this.providerHost;
        const page = this.page;
        const provider = host?.treeProvider;
        if (!page || !host || !provider) throw new Error("Folder View action unavailable: no provider host is attached.");
        host.selectionState.update((state) => { state.selectedHref = item.href; });
        const url = provider.getNavigationUrl(item) ?? item.href;
        await app.events.openRawLink.sendAsync(createLinkData(url, {
            pageId: this.id,
            sourceId: host.id,
        }));
    }

    async openCategory(category: string): Promise<void> {
        const host = this.providerHost;
        const provider = host?.treeProvider;
        if (!this.page || !host || !provider) throw new Error("Folder View action unavailable: no provider host is attached.");
        const segments = provider.getCategorySegments(this.categoryPath ?? provider.rootPath);
        const count = category ? category.split("/").length : 0;
        const targetCategory = count === 0
            ? provider.rootPath
            : segments[count - 1]?.category;
        if (targetCategory === undefined) throw new Error("Folder View action unavailable: invalid category breadcrumb.");
        const url = encodeCategoryLink({ type: provider.type, url: provider.sourceUrl, category: targetCategory });
        await app.events.openRawLink.sendAsync(createLinkData(url, {
            pageId: this.id,
            sourceId: host.id,
        }));
    }

    async refresh(): Promise<void> {
        if (!this.page || !this.providerHost?.treeProvider) {
            throw new Error("Folder View action unavailable: no provider host is attached.");
        }
        await this.listItems();
    }

    /** Decoded link metadata. Null if filePath is not a valid tree-category:// link. */
    get decodedLink(): ITreeProviderLink | null {
        const filePath = this.state.get().filePath;
        if (!filePath) return null;
        return decodeCategoryLink(filePath);
    }

    /** Initialize from an ITreeProviderLink (sets filePath and title). */
    initFromLink(link: ITreeProviderLink): void {
        const title = fpBasename(link.category) || link.category || "Folder";
        this.state.update((s) => {
            s.title = title;
            s.filePath = encodeCategoryLink(link);
        });
    }
}

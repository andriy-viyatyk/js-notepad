import type { IFolderItem, IFolderViewEditor, IFolderViewMode } from "../../api/types/folder-view-editor";
import type { IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";
import { ui } from "../../api/ui";
import { createElements } from "../ai-vision/elements";
import { activatePageAndWaitForLayout, pageScopeSelector } from "../ai-vision/page-elements";
import type { CategoryEditorModel } from "../../editors/category/CategoryEditorModel";

const FOLDER_VIEW_ELEMENTS = [
    { name: "category-breadcrumb", purpose: "Navigate to a category in the Folder View breadcrumb." },
] as const;

const FOLDER_VIEW_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The concrete current editor id: category-view." },
    { name: "name", kind: "property", summary: "The editor's registry display name." },
    { name: "providerType", kind: "property", summary: "The resolved tree provider type, or undefined when no provider is attached." },
    { name: "providerName", kind: "property", summary: "The resolved tree provider display name, or undefined when no provider is attached." },
    { name: "sourceUrl", kind: "property", summary: "The resolved provider source URL, or undefined when no provider is attached." },
    { name: "rootPath", kind: "property", summary: "The resolved provider root path, or undefined when no provider is attached." },
    { name: "categoryPath", kind: "property", summary: "The current category path, or undefined when detached or the link is invalid." },
    { name: "selectedHref", kind: "property", summary: "The selected item href, or undefined when no provider or selection exists." },
    { name: "items", kind: "property", summary: "A promise of copied items for the current category; an attached empty directory is []." },
    { name: "itemCount", kind: "property", summary: "A promise of the copied current-category item count, or undefined without a provider." },
    { name: "viewMode", kind: "property", summary: "The effective persisted view mode, or undefined without a resolved provider." },
    { name: "listItems", kind: "method", signature: "listItems(): Promise<IFolderItem[] | undefined>", summary: "List copied item metadata for the current category." },
    { name: "openItem", kind: "method", signature: "openItem(item: IFolderItem): Promise<void>", summary: "Open an item through the model-owned link pipeline.", caution: "navigates the current page" },
    { name: "openCategory", kind: "method", signature: "openCategory(category: string): Promise<void>", summary: "Navigate to a category through the model-owned link pipeline.", caution: "navigates the current page" },
    { name: "refresh", kind: "method", signature: "refresh(): Promise<void>", summary: "Refresh the model-backed Folder View listing." },
];

const FOLDER_VIEW_HELP = `Access via pages[i].editor after narrowing editor.id to "category-view".
Folder View is page-scoped and has no content host. Its provider, source/root paths, category,
selection, listing, and effective view mode come from the CategoryEditorModel and its page-owned
tree-provider host. Detached or invalid-link provider state is undefined; an attached valid empty
directory returns [] and itemCount 0. items and listItems return copied metadata records and never
expose the mounted category view or its component models.

The only curated Folder View control is category-breadcrumb. elements are resolved below this
page's [data-page-id] scope; highlight activates the page and waits for its retained slot layout.
openItem(), openCategory(), and refresh() use the same model paths as the Folder View UI. No action
changes view mode or reaches into a mounted view. This surface is not a content or filesystem
security boundary; app.fs remains independent.`;

export class FolderViewEditorFacade implements IAiVisible, IFolderViewEditor {
    constructor(
        private readonly editor: CategoryEditorModel,
        readonly id: "category-view",
        readonly name: string,
    ) {}

    get aiVision(): IAiVisionDescriptor {
        const pageId = this.editor.page?.id;
        const elements = createElements(FOLDER_VIEW_ELEMENTS, ui.highlightElement.bind(ui), {
            scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
            beforeHighlight: pageId ? () => activatePageAndWaitForLayout(pageId) : undefined,
        });
        return {
            kind: "FolderViewEditor",
            summary: "Folder View provider-backed navigation facade.",
            members: [...FOLDER_VIEW_MEMBERS, ...elements.members],
            help: FOLDER_VIEW_HELP,
            elements: FOLDER_VIEW_ELEMENTS,
            provide: elements.provide,
            summarize: () => ({
                kind: "FolderViewEditor",
                id: this.id,
                name: this.name,
                providerType: this.providerType,
                categoryPath: this.categoryPath,
                selectedHref: this.selectedHref,
                viewMode: this.viewMode,
            }),
        };
    }

    get providerType(): string | undefined { return this.editor.providerHost?.treeProvider?.type; }
    get providerName(): string | undefined { return this.editor.providerHost?.treeProvider?.displayName; }
    get sourceUrl(): string | undefined { return this.editor.providerHost?.treeProvider?.sourceUrl; }
    get rootPath(): string | undefined { return this.editor.providerHost?.treeProvider?.rootPath; }
    get categoryPath(): string | undefined {
        return this.editor.page ? this.editor.categoryPath : undefined;
    }
    get selectedHref(): string | undefined {
        return this.editor.providerHost?.selectionState.get().selectedHref ?? undefined;
    }
    get items(): Promise<readonly IFolderItem[] | undefined> { return this.listItems(); }
    get itemCount(): Promise<number | undefined> {
        return this.listItems().then(items => items?.length);
    }
    get viewMode(): IFolderViewMode | undefined {
        return this.editor.page && this.editor.providerHost?.treeProvider
            ? this.editor.viewMode
            : undefined;
    }

    listItems(): Promise<IFolderItem[] | undefined> {
        return this.editor.listItems();
    }

    openItem(item: IFolderItem): Promise<void> {
        return this.editor.openItem({ ...item, tags: [...item.tags] });
    }

    openCategory(category: string): Promise<void> {
        return this.editor.openCategory(category);
    }

    refresh(): Promise<void> {
        return this.editor.refresh();
    }
}

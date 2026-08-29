import { app } from "../../api/app";
import type { IPageHost } from "../../api/pages/IPageHost";
import type {
    ICategorySegment,
    ITreeProvider,
    ITreeProviderItem,
} from "../../api/types/io.tree";
import { createLinkData } from "../../../shared/link-data";
import { encodeCategoryLink } from "../../content/tree-providers/tree-provider-link";
import type { TOneState } from "../../core/state/state";
import type { NavigationState } from "../base/navigation-state";
import type { EditorModel } from "../base/EditorModel";
import { PageToolbarView, type PageToolbarViewProps } from "../base/PageToolbarView";
import { BreadcrumbView } from "../../uikit/Breadcrumb/BreadcrumbView";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { supportsMultiSelect } from "../../components/tree-provider/plural-actions";
import { CategoryViewImpl } from "../../components/tree-provider/CategoryViewImpl";
import {
    type CategoryItemsRendererProps,
    type CategoryViewMode,
    type CategoryViewProps,
} from "../../components/tree-provider/CategoryViewModel";
import { LinkEditor } from "../link-editor/LinkEditor";
import { LinksListView } from "../link-editor/LinksListView";
import type { LinksListProps } from "../link-editor/LinksList";
import { LinksTilesView } from "../link-editor/LinksTilesView";
import type { LinksTilesProps } from "../link-editor/LinksTiles";
import { ExplorerEditor } from "../explorer";
import { ArchiveEditor } from "../archive";
import { CategoryEditorModel } from "./CategoryEditorModel";
import { folderViewModeService } from "./FolderViewModeService";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Text/Text.css";

interface ITreeProviderHost {
    treeProvider: ITreeProvider | null;
    selectionState: TOneState<NavigationState>;
}

type TreeProviderHostEditor = EditorModel & ITreeProviderHost;

function isTreeProviderHost(editor: EditorModel): editor is TreeProviderHostEditor {
    return (
        editor instanceof LinkEditor ||
        editor instanceof ExplorerEditor ||
        editor instanceof ArchiveEditor
    );
}

function findTreeProviderHost(
    secondaryViews: EditorModel[],
    type: string,
    sourceUrl: string,
): TreeProviderHostEditor | null {
    for (const editor of secondaryViews) {
        if (!isTreeProviderHost(editor)) continue;
        const tp = editor.treeProvider;
        if (tp && tp.type === type && tp.sourceUrl === sourceUrl) {
            return editor;
        }
    }
    return null;
}

function requireCategoryModel(model: EditorModel): CategoryEditorModel {
    if (!(model instanceof CategoryEditorModel)) {
        throw new Error("Category view received an invalid model.");
    }
    return model;
}

type ActiveItemsView = LinksListView | LinksTilesView;

export class CategoryEditorView extends VanillaView<{ model: EditorModel }> {
    private model: CategoryEditorModel;
    private pageToolbar!: PageToolbarView;
    private breadcrumb: BreadcrumbView | undefined;
    private categoryView: CategoryViewImpl | undefined;
    private messagePanel: HTMLDivElement | undefined;
    private searchPortal: HTMLDivElement | undefined;
    private activeItems: ActiveItemsView | undefined;
    private host: TreeProviderHostEditor | null = null;
    private selectedHref: string | null = null;
    private observedPage: IPageHost | null = null;
    private pageStateUnsub: (() => void) | undefined;
    private hostSelectionUnsub: (() => void) | undefined;
    private viewMode: CategoryViewMode = "list";
    private viewModePath: string | undefined;
    private viewModeGeneration = 0;
    private inert = false;

    public constructor(props: { model: EditorModel }) {
        super(props, createPanelElement({
            name: "category-editor-root",
            direction: "column",
            flex: 1,
            overflow: "hidden",
            background: "default",
        }));
        this.model = requireCategoryModel(props.model);
        this.own(() => { this.inert = true; });
    }

    protected onMount(): void {
        this.pageToolbar = this.child(new PageToolbarView(this.pageToolbarProps()));
        this.root.append(this.pageToolbar.root);
        this.pageToolbar.mount();

        this.own(() => {
            this.pageStateUnsub?.();
            this.pageStateUnsub = undefined;
            this.observedPage = null;
        });
        this.own(() => {
            this.hostSelectionUnsub?.();
            this.hostSelectionUnsub = undefined;
        });

        this.rebindPageState();
        this.bind(
            this.model.state,
            (state) => state.filePath,
            () => this.syncSurface(),
        );
    }

    protected onUpdate(props: { model: EditorModel }): void {
        this.model = requireCategoryModel(props.model);
        this.rebindPageState();
        this.syncSurface();
    }

    private rebindPageState(): void {
        const page = this.model.page;
        if (page === this.observedPage) {
            this.syncSurface();
            return;
        }

        this.pageStateUnsub?.();
        this.pageStateUnsub = undefined;
        this.observedPage = page;
        if (page) {
            this.pageStateUnsub = this.ownSubscription(page.state.subscribe(
                () => this.syncSurface(),
                (state) => state.version,
            ));
        }
        this.syncSurface();
    }

    private syncSurface(): void {
        const link = this.model.decodedLink;
        const page = this.model.page;
        const host = page && link
            ? findTreeProviderHost(page.panelEditors, link.type, link.url)
            : null;
        if (host !== this.host) {
            this.host = host;
            this.rebindHostSelection(host);
        }

        const provider = host?.treeProvider ?? null;
        this.syncViewModeLoad(this.model.categoryPath);
        if (!provider) {
            this.releaseCategorySurface();
            this.releaseBreadcrumb();
            this.searchPortal?.remove();
            this.searchPortal = undefined;
            this.ensureMessageSurface();
            this.pageToolbar.update(this.pageToolbarProps());
            return;
        }

        this.releaseMessageSurface();
        this.ensureBreadcrumb(provider);
        if (!this.searchPortal) {
            this.searchPortal = createPanelElement({
                name: "category-search-portal",
                direction: "row",
                align: "center",
                gap: "xs",
            });
        }
        this.ensureCategorySurface(provider);
        this.pageToolbar.update(this.pageToolbarProps());
    }

    private syncViewModeLoad(categoryPath: string): void {
        if (categoryPath === this.viewModePath) return;
        this.viewModePath = categoryPath;
        this.viewMode = "list";
        const generation = ++this.viewModeGeneration;
        void folderViewModeService.getViewMode(categoryPath).then((viewMode) => {
            if (
                this.inert
                || generation !== this.viewModeGeneration
                || categoryPath !== this.model.categoryPath
            ) return;
            this.viewMode = viewMode;
            const provider = this.host?.treeProvider;
            if (provider) this.categoryView?.update(this.categoryViewProps(provider));
        });
    }

    private ensureBreadcrumb(provider: ITreeProvider): void {
        const props = {
            name: "category-breadcrumb",
            rootLabel: provider.displayName,
            value: this.breadcrumbValue(provider),
            onChange: this.handleBreadcrumbChange,
            separators: "/",
            size: "sm" as const,
            clipStart: true,
        };
        if (!this.breadcrumb) {
            this.breadcrumb = this.child(new BreadcrumbView(props));
            this.breadcrumb.mount();
        } else {
            this.breadcrumb.update(props);
        }
    }

    private ensureCategorySurface(provider: ITreeProvider): void {
        const props = this.categoryViewProps(provider);
        if (!this.categoryView) {
            this.categoryView = this.child(new CategoryViewImpl(props));
            this.root.append(this.categoryView.root);
            this.categoryView.mount();
        } else {
            this.categoryView.update(props);
        }
    }

    private releaseBreadcrumb(): void {
        if (!this.breadcrumb) return;
        this.releaseChild(this.breadcrumb);
        this.breadcrumb = undefined;
    }

    private releaseCategorySurface(): void {
        if (!this.categoryView) return;
        this.releaseChild(this.categoryView);
        this.categoryView = undefined;
    }

    private ensureMessageSurface(): void {
        if (this.messagePanel) return;
        this.messagePanel = createPanelElement({ padding: "xl" });
        this.messagePanel.append(
            createTextElement("Please select a category in the Navigation Panel.", { color: "light" }),
        );
        this.root.append(this.messagePanel);
    }

    private releaseMessageSurface(): void {
        this.messagePanel?.remove();
        this.messagePanel = undefined;
    }

    private pageToolbarProps(): PageToolbarViewProps {
        return {
            name: "category-toolbar",
            model: this.model,
            borderBottom: true,
            children: this.breadcrumb?.root,
            rightContributions: this.searchPortal,
        };
    }

    private categoryViewProps(provider: ITreeProvider): CategoryViewProps {
        return {
            provider,
            category: this.model.categoryPath,
            viewMode: this.viewMode,
            onViewModeChange: this.handleViewModeChange,
            selectedHref: this.selectedHref ?? undefined,
            multiSelect: supportsMultiSelect(provider),
            onItemClick: this.handleSelect,
            onItemDoubleClick: this.handleNavigate,
            onFolderClick: this.handleNavigate,
            renderItems: this.renderItems,
            toolbarPortalRef: this.searchPortal,
            onItemsDisposed: this.releaseActiveItems,
        };
    }

    private breadcrumbValue(provider: ITreeProvider): string {
        return provider.getCategorySegments(this.model.categoryPath)
            .map((segment) => segment.label)
            .join("/");
    }

    private rebindHostSelection(host: TreeProviderHostEditor | null): void {
        this.hostSelectionUnsub?.();
        this.hostSelectionUnsub = undefined;
        if (!host) {
            this.applySelectedHref(null);
            return;
        }
        this.hostSelectionUnsub = this.ownSubscription(host.selectionState.subscribe(
            (href: string | null) => this.applySelectedHref(href),
            (state) => state.selectedHref,
        ));
        this.applySelectedHref(host.selectionState.get().selectedHref);
    }

    private applySelectedHref(selectedHref: string | null): void {
        this.selectedHref = selectedHref;
        const provider = this.host?.treeProvider;
        if (provider) this.categoryView?.update(this.categoryViewProps(provider));
    }

    private readonly handleViewModeChange = (mode: CategoryViewMode): void => {
        const categoryPath = this.model.categoryPath;
        this.viewMode = mode;
        const provider = this.host?.treeProvider;
        if (provider) this.categoryView?.update(this.categoryViewProps(provider));
        void folderViewModeService.setViewMode(categoryPath, mode);
    };

    private readonly handleSelect = (item: ITreeProviderItem): void => {
        this.host?.selectionState.update((state) => { state.selectedHref = item.href; });
    };

    private readonly handleNavigate = (item: ITreeProviderItem): void => {
        this.host?.selectionState.update((state) => { state.selectedHref = item.href; });
        const provider = this.host?.treeProvider;
        const url = provider?.getNavigationUrl(item) ?? item.href;
        const pageId = this.model.id;
        void app.events.openRawLink.sendAsync(createLinkData(url, {
            pageId,
            sourceId: this.host?.id,
        }));
    };

    private readonly handleBreadcrumbChange = (value: string): void => {
        const provider = this.host?.treeProvider;
        if (!provider) return;
        const segments: ICategorySegment[] = provider.getCategorySegments(this.model.categoryPath);
        const count = value ? value.split("/").length : 0;
        const targetCategory = count === 0
            ? provider.rootPath
            : segments[count - 1].category;
        const url = encodeCategoryLink({
            type: provider.type,
            url: provider.sourceUrl,
            category: targetCategory,
        });
        void app.events.openRawLink.sendAsync(createLinkData(url, {
            pageId: this.model.id,
            sourceId: this.host?.id,
        }));
    };

    private readonly renderItems = (itemProps: CategoryItemsRendererProps): Node => {
        const commonProps = {
            links: itemProps.items,
            selectedId: itemProps.selectedId,
            selectedIds: itemProps.selectedIds,
            getId: (item: ITreeProviderItem) => item.href,
            onSelect: itemProps.onSelect,
            onDoubleClick: itemProps.onDoubleClick,
            onEdit: itemProps.onEdit,
            onDelete: itemProps.onDelete,
            onContextMenu: itemProps.onContextMenu,
            onGridModel: itemProps.onGridModel,
            onItemDragEnter: itemProps.onItemDragEnter,
            onItemDragOver: itemProps.onItemDragOver,
            onItemDragLeave: itemProps.onItemDragLeave,
            onItemDrop: itemProps.onItemDrop,
            dropTargetId: itemProps.dropTargetId,
            dragSourceId: itemProps.dragSourceId,
            onDragStartOverride: itemProps.onDragStartOverride,
        };

        if (itemProps.viewMode === "list") {
            if (!(this.activeItems instanceof LinksListView)) {
                this.releaseActiveItems();
                this.activeItems = this.child(new LinksListView({
                    ...commonProps,
                    searchText: itemProps.searchText,
                } satisfies LinksListProps));
                this.activeItems.mount();
            } else {
                this.activeItems.update({
                    ...commonProps,
                    searchText: itemProps.searchText,
                });
            }
            return this.activeItems.root;
        }

        if (!(this.activeItems instanceof LinksTilesView)) {
            this.releaseActiveItems();
            this.activeItems = this.child(new LinksTilesView({
                ...commonProps,
                viewMode: itemProps.viewMode,
            } satisfies LinksTilesProps));
            this.activeItems.mount();
        } else {
            this.activeItems.update({
                ...commonProps,
                viewMode: itemProps.viewMode,
            });
        }
        return this.activeItems.root;
    };

    private readonly releaseActiveItems = (): void => {
        if (!this.activeItems) return;
        this.releaseChild(this.activeItems);
        this.activeItems = undefined;
    };
}

export { CategoryEditorModel };

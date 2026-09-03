import { app } from "../../api/app";
import { ContextMenuEvent } from "../../api/events/events";
import { registeredTools } from "../../api/tools/registered-tools";
import { toolsTrust } from "../../api/tools/tools-trust";
import { readToolsManifest, TOOLS_MANIFEST_FILE } from "../../api/tools/tools-manifest";
import { createLinkData } from "../../../shared/link-data";
import { encodeGitTreeLink } from "../../content/git-tree-link";
import { encodeMnemeFolderLink } from "../../content/mneme-folder-link";
import { encodePersephoneBoardLink } from "../../content/persephone-board-link";
import { encodeCategoryLink } from "../../content/tree-providers/tree-provider-link";
import { openToolset } from "../../content/persephone-toolset-link";
import { openWithDefaultApp } from "../../content/open-with-default-app";
import { FileTreeProvider } from "../../content/tree-providers/FileTreeProvider";
import type { ITreeProviderItem } from "../../api/types/io.tree";
import { showRegisterToolsetDialog } from "../../ui/dialogs/RegisterToolsetDialog";
import type { SecondaryViewProps } from "../../ui/secondary-views/secondary-view-registry";
import {
    createSideBarPanelHeader,
    type SideBarPanelHeaderHandle,
} from "../../ui/secondary-views/SideBarPanelHeaderView";
import { TreeProviderViewImpl } from "../../components/tree-provider/TreeProviderViewImpl";
import type {
    TreeProviderViewModel,
    TreeProviderViewSavedState,
} from "../../components/tree-provider/TreeProviderViewModel";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import type { IconButtonProps } from "../../uikit/IconButton/IconButtonView";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { Cleanup } from "../../core/utils/DisposableStore";
import { createIconElement } from "../../uikit/shared/slots";
import { MEMORY_ICON_COLOR } from "../../theme/palette-colors";
import { fpBasename, fpDirname } from "../../core/utils/file-path";
import { BOARD_MANIFEST_FILE } from "../board/board-manifest";
import type { ExplorerEditor } from "./ExplorerEditorModel";
import "../../uikit/IconButton/IconButton.css";

export default class ExplorerSecondaryView extends VanillaView<SecondaryViewProps> {
    private model: ExplorerEditor;
    private provider: FileTreeProvider | undefined;
    private treeProviderView: TreeProviderViewImpl | undefined;
    private treeProviderModel: TreeProviderViewModel | undefined;
    private header: SideBarPanelHeaderHandle | undefined;
    private headerActions: HTMLDivElement | undefined;
    private upButton: IconButtonView | undefined;
    private searchButton: IconButtonView | undefined;
    private boardsButton: IconButtonView | undefined;
    private collapseButton: IconButtonView | undefined;
    private closeButton: IconButtonView | undefined;
    private readonly trailingButtons = new Map<string, IconButtonView>();
    private revealFrame: Cleanup | undefined;

    public constructor(props: SecondaryViewProps) {
        super(props, createPanelElement({
            name: "explorer-secondary-view",
            direction: "column",
            flex: true,
            minHeight: 0,
            overflow: "hidden",
        }));
        this.model = props.model as ExplorerEditor;
    }

    protected onMount(): void {
        this.createHeaderActions();
        this.header = createSideBarPanelHeader({
            headerHost: this.props.headerHost,
            icon: this.props.iconElement,
            title: "Explorer",
            actions: this.headerActions,
        });
        this.own(() => this.header?.dispose());

        this.replaceProvider(this.model.rootPath);
        this.bind(
            this.model.state,
            (state) => state.rootPath,
            (rootPath) => this.replaceProvider(rootPath),
        );
        this.bind(
            this.model.selectionState,
            (state) => state.selectedHref,
            (selectedHref) => {
                if (this.provider && this.treeProviderView) {
                    this.treeProviderView.update(this.treeProps(this.provider, selectedHref ?? undefined));
                }
            },
        );
        this.bind(
            this.model.revealVersion,
            (state) => state.version,
            (version) => this.scheduleReveal(version),
        );
        this.own(() => this.cancelReveal());
        this.updateHeader(this.props);
    }

    protected onUpdate(props: SecondaryViewProps): void {
        const model = props.model as ExplorerEditor;
        if (model !== this.model) {
            this.model = model;
            this.replaceProvider(model.rootPath);
        }
        this.updateHeader(props);
    }

    protected onDispose(): void {
        this.cancelReveal();
        this.treeProviderModel = undefined;
        this.treeProviderView = undefined;
        this.provider = undefined;
        this.header = undefined;
        this.headerActions = undefined;
        this.upButton = undefined;
        this.searchButton = undefined;
        this.boardsButton = undefined;
        this.collapseButton = undefined;
        this.closeButton = undefined;
        this.trailingButtons.clear();
    }

    private createHeaderActions(): void {
        this.headerActions = createPanelElement({
            name: "explorer-header-actions",
            direction: "row",
            align: "center",
            gap: "xs",
            shrink: false,
        });
        this.upButton = this.child(new IconButtonView({
            name: "explorer-up",
            size: "sm",
            title: "Already at root",
            icon: "folder-up",
            onClick: (event) => {
                event.stopPropagation();
                this.model.navigateUp();
            },
        }));
        this.searchButton = this.child(new IconButtonView({
            name: "explorer-search",
            size: "sm",
            title: "Search",
            icon: "search",
            onClick: (event) => {
                event.stopPropagation();
                this.model.openSearch();
            },
        }));
        this.boardsButton = this.child(new IconButtonView({
            name: "explorer-boards",
            size: "sm",
            title: "Boards",
            icon: "board",
            onClick: (event) => {
                event.stopPropagation();
                this.model.openBoards();
            },
        }));
        this.collapseButton = this.child(new IconButtonView({
            name: "explorer-collapse-all",
            size: "sm",
            title: "Collapse All",
            icon: "collapse-all",
            onClick: (event) => {
                event.stopPropagation();
                this.treeProviderModel?.collapseAll();
            },
        }));
        this.closeButton = this.child(new IconButtonView({
            name: "explorer-close",
            size: "sm",
            title: "Close Panel",
            icon: "close",
            onClick: (event) => {
                event.stopPropagation();
                this.model.page?.setSecondaryViewsState({ open: false });
            },
        }));
        this.upButton.mount();
        this.searchButton.mount();
        this.boardsButton.mount();
        this.collapseButton.mount();
        this.closeButton.mount();
    }

    private replaceProvider(rootPath: string): void {
        if (this.provider?.sourceUrl === rootPath) {
            if (this.provider && this.treeProviderView) {
                this.treeProviderView.update(this.treeProps(
                    this.provider,
                    this.model.selectionState.get().selectedHref ?? undefined,
                ));
            }
            this.updateHeader(this.props);
            return;
        }

        const oldTree = this.treeProviderView;
        this.treeProviderView = undefined;
        this.treeProviderModel = undefined;
        if (oldTree) this.releaseChild(oldTree);

        if (this.provider && this.model.treeProvider === this.provider) {
            this.model.treeProvider.dispose?.();
            this.model.treeProvider = null;
        }
        this.provider = undefined;

        if (rootPath) {
            if (this.model.treeProvider && (this.model.treeProvider as FileTreeProvider).sourceUrl === rootPath) {
                this.provider = this.model.treeProvider as FileTreeProvider;
            } else {
                if (this.model.treeProvider) this.model.treeProvider.dispose?.();
                this.model.treeProvider = new FileTreeProvider(rootPath);
                this.provider = this.model.treeProvider as FileTreeProvider;
            }
            const tree = this.child(new TreeProviderViewImpl(this.treeProps(
                this.provider,
                this.model.selectionState.get().selectedHref ?? undefined,
            )));
            this.treeProviderView = tree;
            this.root.append(tree.root);
            tree.mount();
            this.treeProviderModel = tree.model;
        }
        this.updateHeader(this.props);
    }

    private treeProps(provider: FileTreeProvider, selectedHref?: string) {
        return {
            provider,
            multiSelect: true,
            selectedHref,
            initialState: this.model.treeState,
            onStateChange: this.handleStateChange,
            onItemClick: this.handleItemClick,
            onItemDoubleClick: this.handleItemDoubleClick,
            onContextMenu: this.handleContextMenu,
            renderTrailing: this.renderTrailingAction,
        };
    }

    private readonly handleStateChange = (state: TreeProviderViewSavedState): void => {
        this.model.setTreeState(state);
    };

    private readonly handleItemClick = (item: ITreeProviderItem): void => {
        const current = this.model.selectionState.get().selectedHref;
        if (current?.toLowerCase() === item.href.toLowerCase()) return;
        this.model.setSelectedHref(item.href);
        const rootPath = this.model.rootPath;
        const url = item.target === "git-tree" || item.target === "mneme-root"
            ? encodeCategoryLink({ type: "file", url: rootPath, category: item.href })
            : (this.provider?.getNavigationUrl(item) ?? item.href);
        void app.events.openRawLink.sendAsync(createLinkData(url, {
            pageId: this.model.page?.id ?? "",
            sourceId: "explorer",
        }));
    };

    private readonly handleItemDoubleClick = (item: ITreeProviderItem): void => {
        void openWithDefaultApp(item.href);
    };

    private readonly openToolsetFromManifest = async (toolsetRoot: string): Promise<void> => {
        await toolsTrust.load();
        if (!toolsTrust.isTrusted(toolsetRoot)) {
            const manifest = await readToolsManifest(toolsetRoot);
            const ok = await showRegisterToolsetDialog({
                toolsetName: manifest?.name ?? fpBasename(toolsetRoot),
                toolsetRoot,
                tools: (manifest?.tools ?? []).map((tool) => ({
                    name: tool.name,
                    description: tool.description,
                })),
            });
            if (!ok) return;
            await toolsTrust.trust(toolsetRoot);
            await registeredTools.refresh();
        }
        openToolset(toolsetRoot, {
            pageId: this.model.page?.id ?? "",
            sourceId: "explorer",
        });
    };

    private readonly renderTrailingAction = (item: ITreeProviderItem): Node | undefined => {
        let icon: "board" | "tools" | "git" | undefined;
        let name = "";
        let title = "";
        let onClick: IconButtonProps["onClick"] | undefined;
        if (!item.isDirectory) {
            const base = fpBasename(item.href).toLowerCase();
            if (base === BOARD_MANIFEST_FILE) {
                icon = "board";
                name = "explorer-open-board";
                title = "Open Board";
                onClick = (event) => {
                    event.stopPropagation();
                    const boardRoot = fpDirname(item.href);
                    void app.events.openRawLink.sendAsync(createLinkData(
                        encodePersephoneBoardLink(boardRoot),
                        {
                            pageId: this.model.page?.id ?? "",
                            sourceId: "explorer",
                            explorerRoot: this.model.rootPath,
                        },
                    ));
                };
            } else if (base === TOOLS_MANIFEST_FILE) {
                icon = "tools";
                name = "explorer-open-toolset";
                title = "Open Toolset";
                onClick = (event) => {
                    event.stopPropagation();
                    void this.openToolsetFromManifest(fpDirname(item.href));
                };
            }
        } else if (item.target === "git-tree") {
            icon = "git";
            name = "explorer-open-git";
            title = "Open Git Tree";
            onClick = (event) => {
                event.stopPropagation();
                void app.events.openRawLink.sendAsync(createLinkData(
                    encodeGitTreeLink(fpDirname(item.href)),
                    { pageId: this.model.page?.id ?? "", sourceId: "explorer" },
                ));
            };
        } else if (item.target === "mneme-root") {
            name = "explorer-open-mneme";
            title = "Open Mneme Root";
            onClick = (event) => {
                event.stopPropagation();
                void app.events.openRawLink.sendAsync(createLinkData(
                    encodeMnemeFolderLink(fpDirname(item.href)),
                    { pageId: this.model.page?.id ?? "", sourceId: "explorer" },
                ));
            };
            return this.getTrailingButton(item.href, name, title, "memory", onClick);
        }
        return icon && onClick
            ? this.getTrailingButton(item.href, name, title, icon, onClick)
            : undefined;
    };

    private getTrailingButton(
        href: string,
        name: string,
        title: string,
        icon: "board" | "tools" | "git" | "memory",
        onClick: NonNullable<IconButtonProps["onClick"]>,
    ): Node {
        let button = this.trailingButtons.get(href);
        const iconNode = icon === "memory"
            ? createIconElement("memory", { color: MEMORY_ICON_COLOR })
            : icon;
        const props = { name, size: "sm" as const, title, icon: iconNode, onClick };
        if (!button) {
            button = this.child(new IconButtonView(props));
            this.trailingButtons.set(href, button);
            button.mount();
        } else {
            button.update(props);
        }
        return button.root;
    }

    private readonly handleContextMenu = (
        event: ContextMenuEvent<ITreeProviderItem>,
        selection: ITreeProviderItem[],
    ): void => {
        if (selection.length > 1) return;
        const item = event.target;
        const provider = this.provider;
        if (!item?.isDirectory || !provider?.navigable) return;
        const rootPath = this.model.rootPath;
        if (item.href.toLowerCase() !== rootPath.toLowerCase()) {
            event.items.push({
                startGroup: true,
                label: "Make Root",
                onClick: () => this.model.makeRoot(item.href),
            });
        }
        event.items.push({
            label: "Search in Folder",
            icon: createIconElement("search", { width: 14, height: 14 }),
            onClick: () => this.model.openSearch(item.href),
        });
    };

    private scheduleReveal(version: number): void {
        this.cancelReveal();
        const selectedHref = this.model.selectionState.get().selectedHref;
        if (version <= 0 || !selectedHref) return;
        this.revealFrame = this.schedule.raf(() => {
            this.revealFrame = undefined;
            void this.treeProviderModel?.revealItem(selectedHref);
        });
    }

    private cancelReveal(): void {
        this.revealFrame?.();
        this.revealFrame = undefined;
    }

    private updateHeader(props: SecondaryViewProps): void {
        const provider = this.provider;
        const rootPath = this.model.rootPath;
        const parentPath = fpDirname(rootPath);
        const canNavigateUp = parentPath !== rootPath && rootPath !== "";
        this.upButton?.update({
            name: "explorer-up",
            size: "sm",
            title: canNavigateUp ? `Up to ${fpBasename(parentPath)}` : "Already at root",
            icon: "folder-up",
            disabled: !canNavigateUp,
            onClick: (event) => {
                event.stopPropagation();
                this.model.navigateUp();
            },
        });
        this.headerActions?.replaceChildren(
            ...(provider?.navigable && this.upButton ? [this.upButton.root] : []),
            ...(this.searchButton ? [this.searchButton.root] : []),
            ...(this.boardsButton ? [this.boardsButton.root] : []),
            ...(this.collapseButton ? [this.collapseButton.root] : []),
            ...(this.model.page?.sidebarMandatory || !this.closeButton ? [] : [this.closeButton.root]),
        );
        this.header?.update({
            headerHost: props.headerHost,
            icon: props.iconElement,
            title: "Explorer",
            actions: this.headerActions,
        });
    }
}

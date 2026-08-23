import type React from "react";
import { createComponentModelDriver, type ComponentModelDriver } from "../../core/state/model";
import { TraitSet, traited, type Traited } from "../../core/traits/traits";
import { TraitTypeId, type TraitDragPayload } from "../../core/traits";
import { api } from "../../../ipc/renderer/api";
import { supportsOsClipboard } from "./os-clipboard";
import { getTraitDropAction } from "./drop-dispatch";
import {
    TreeProviderViewModel,
    type TreeProviderViewModelProps,
    type TreeProviderViewProps,
    type TreeProviderViewState,
    type TreeProviderNode,
    defaultTreeProviderViewState,
} from "./TreeProviderViewModel";
import { createTreeProviderItemIconElement, subscribeFileIconElements } from "../icons/icon-elements";
import { TREE_ITEM_KEY } from "../../uikit/Tree/types";
import type { TreeProps } from "../../uikit/Tree/types";
import { TreeView } from "../../uikit/Tree/TreeView";
import type { TreeModel } from "../../uikit/Tree/TreeModel";
import { InputView } from "../../uikit/Input/InputView";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { toPublicEvent } from "../../uikit/shared/react-compat";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Text/Text.css";
import "./TreeProviderView.css";

type ViewProps = TreeProviderViewProps & {
    onModel?: (model: TreeProviderViewModel | null) => void;
};

type ProviderState = TreeProviderViewState;
type Arm = "tree" | "error" | "empty";

// The trait only supplies the fields TreeModel needs to flatten the provider tree. The icon
// accessor deliberately does not exist: direct DOM icons are projected by TreeView below.
const tpvNodeTraits = new TraitSet().add(TREE_ITEM_KEY, {
    value: (node: unknown) => (node as TreeProviderNode).data.href,
    label: (node: unknown) => (node as TreeProviderNode).data.title,
});

const getNodeChildren = (node: TreeProviderNode): TreeProviderNode[] | undefined => node.items;

export class TreeProviderViewImpl extends VanillaView<ViewProps> {
    private readonly driver: ComponentModelDriver<
        ProviderState,
        TreeProviderViewModelProps,
        TreeProviderViewModel
    >;
    private readonly iconCache = new Map<string, Element>();
    private readonly selectedSet = new Set<string>();
    private readonly modelProps = (props: ViewProps): TreeProviderViewModelProps => ({
        ...props,
        onModel: props.onModel,
    });

    private treeView: TreeView<TreeProviderNode> | undefined;
    private searchPanel: HTMLDivElement | undefined;
    private searchInput: InputView | undefined;
    private searchClose: IconButtonView | undefined;
    private searchField: HTMLInputElement | undefined;
    private messagePanel: HTMLDivElement | undefined;
    private messageText: HTMLSpanElement | undefined;
    private arm: Arm | undefined;
    private searchKey: number | undefined;
    private lastDisplayTree: TreeProviderNode | null | undefined;
    private lastTNodes: Traited<TreeProviderNode[]> | null = null;
    private activeIndex: number | null = null;
    private iconSubscription: (() => void) | undefined;
    private inert = false;

    public constructor(props: ViewProps) {
        super(props, document.createElement("div"));
        this.root.dataset.type = "tree-provider-view";
        this.driver = createComponentModelDriver(
            this.modelProps(props),
            TreeProviderViewModel,
            defaultTreeProviderViewState,
        );

        // The driver is constructed here, so its cleanup is registered here as well. Children are
        // disposed before these FIFO disposers, which lets TreeModel receive onModel(null) only
        // after the Tree and search views have released their DOM and listeners.
        this.own(() => { this.inert = true; });
        this.own(() => this.driver.dispose());
    }

    public get model(): TreeProviderViewModel {
        return this.driver.model;
    }

    protected onMount(): void {
        this.listen(this.root, "keydown", (event) => {
            if (this.arm !== "tree") return;
            this.onRootKeyDown(event);
        });
        this.listen(this.root, "contextmenu", (event) => {
            if (this.arm !== "tree") return;
            this.model.onBackgroundContextMenu(
                toPublicEvent(event) as unknown as React.MouseEvent<HTMLDivElement>,
            );
        });

        this.driver.mount();
        this.iconSubscription = subscribeFileIconElements(() => {
            if (this.inert) return;
            this.iconCache.clear();
            this.treeView?.refreshRows();
        });
        this.own(() => this.iconSubscription?.());

        this.bind(
            this.model.state,
            (state) => ({
                displayTree: state.displayTree,
                error: state.error,
                searchText: state.searchText,
                searchVisible: state.searchVisible,
                searchKey: state.searchKey,
                selectedValues: state.selectedValues,
            }),
            this.applyState,
        );
    }

    protected onUpdate(props: ViewProps): void {
        this.driver.update(this.modelProps(props));
        this.applyState(this.model.state.get());
    }

    private readonly applyState = (state: ProviderState): void => {
        if (this.inert) return;

        this.selectedSet.clear();
        for (const href of state.selectedValues) this.selectedSet.add(href.toLowerCase());

        const tNodes = this.tNodesFor(state.displayTree);
        if (state.error) {
            this.leaveTreeArm();
            this.removeSearch();
            this.showMessage("error", state.error);
            return;
        }
        if (!tNodes) {
            this.leaveTreeArm();
            this.removeSearch();
            this.showMessage("empty", "No content");
            return;
        }

        this.removeMessage();
        if (!this.treeView || this.searchKey !== state.searchKey) {
            this.leaveTreeArm();
            this.searchKey = state.searchKey;
            this.enterTreeArm(tNodes, state);
        } else {
            this.treeView.update(this.treeProps(tNodes, state));
        }
        this.arm = "tree";
        this.updateSearch(state);
    };

    private tNodesFor(displayTree: TreeProviderNode | null): Traited<TreeProviderNode[]> | null {
        if (displayTree === this.lastDisplayTree) return this.lastTNodes;
        this.lastDisplayTree = displayTree;
        this.lastTNodes = displayTree
            ? traited<TreeProviderNode[]>([displayTree], tpvNodeTraits)
            : null;
        return this.lastTNodes;
    }

    private enterTreeArm(tNodes: Traited<TreeProviderNode[]>, state: ProviderState): void {
        const view = this.child(new TreeView<TreeProviderNode>(this.treeProps(tNodes, state)));
        this.treeView = view;
        this.root.insertBefore(view.root, this.searchPanel ?? null);
        view.mount();
    }

    private leaveTreeArm(): void {
        if (!this.treeView) return;
        this.treeView.dispose();
        this.treeView.root.remove();
        this.treeView = undefined;
        this.model.setTreeModel(null);
    }

    private showMessage(kind: "error" | "empty", value: string): void {
        if (!this.messagePanel) {
            this.messagePanel = document.createElement("div");
            this.messagePanel.className = "panel-root";
            this.root.append(this.messagePanel);
        }
        this.messagePanel.dataset.type = kind === "error"
            ? "tree-provider-error"
            : "tree-provider-empty";
        this.messagePanel.dataset.direction = "row";
        if (!this.messageText) {
            this.messageText = document.createElement("span");
            this.messageText.dataset.type = "text";
            this.messageText.dataset.variant = "default";
            this.messageText.dataset.size = "sm";
            this.messagePanel.append(this.messageText);
        }
        this.messageText.dataset.color = kind === "error" ? "error" : "light";
        this.messageText.textContent = value;
        this.arm = kind;
    }

    private removeMessage(): void {
        this.messagePanel?.remove();
        this.messagePanel = undefined;
        this.messageText = undefined;
    }

    private ensureSearch(): void {
        if (this.searchInput) return;

        this.searchPanel = document.createElement("div");
        this.searchPanel.className = "panel-root";
        this.searchPanel.dataset.type = "tree-provider-search";
        this.searchPanel.dataset.name = "tree-provider-search";
        this.searchPanel.dataset.direction = "row";
        this.searchPanel.dataset.borderTop = "";

        this.searchClose = this.child(new IconButtonView({
            name: "tree-provider-search-close",
            size: "sm",
            title: "Close Search",
            icon: "close",
            onClick: this.onSearchClose,
        }));
        this.searchClose.mount();

        this.searchInput = this.child(new InputView({
            name: "tree-provider-search-input",
            size: "sm",
            value: "",
            placeholder: "Search...",
            ref: (element) => { this.searchField = element ?? undefined; },
            onChange: this.model.setSearchText,
            onKeyDown: this.onSearchKeyDown,
            onBlur: this.onSearchBlur,
        }));
        this.searchInput.mount();
        this.searchPanel.append(this.searchInput.root);
        this.root.append(this.searchPanel);
    }

    private removeSearch(): void {
        this.searchPanel?.remove();
        this.searchInput?.dispose();
        this.searchClose?.dispose();
        this.searchPanel = undefined;
        this.searchInput = undefined;
        this.searchClose = undefined;
        this.searchField = undefined;
    }

    private updateSearch(state: ProviderState): void {
        if (!state.searchVisible) {
            this.removeSearch();
            return;
        }
        this.ensureSearch();
        this.searchInput?.update({
            name: "tree-provider-search-input",
            size: "sm",
            value: state.searchText,
            placeholder: "Search...",
            ref: (element) => { this.searchField = element ?? undefined; },
            onChange: this.model.setSearchText,
            onKeyDown: this.onSearchKeyDown,
            onBlur: this.onSearchBlur,
            endSlot: state.searchText ? this.searchClose?.root : undefined,
        });
    }

    private treeProps(
        tNodes: Traited<TreeProviderNode[]>,
        state: ProviderState,
    ): TreeProps<TreeProviderNode> {
        const provider = this.props.provider;
        const writable = provider.writable;
        const showLinks = this.props.showLinks !== false;
        const deepSearch = state.searchText.length >= 3;
        const osDragEnabled = supportsOsClipboard(provider);

        return {
            name: "tree-provider",
            items: tNodes,
            getChildren: getNodeChildren,
            isSelected: this.isSelected,
            multiSelect: this.props.multiSelect,
            onSelectionChange: this.onSelectionChange,
            keyboardNav: true,
            canCollapse: this.canCollapse,
            collapseDescendants: true,
            activeIndex: this.activeIndex,
            onActiveChange: this.onActiveChange,
            onChange: this.model.onItemClick,
            onItemDoubleClick: this.model.onItemDoubleClick,
            searchText: state.searchText,
            defaultExpandedValues: this.model.initialExpandMap,
            defaultExpandAll: deepSearch,
            onExpandChange: this.onExpandChange,
            getHasChildren: (node) => {
                if (!node.data.isDirectory) return false;
                const { hasSubDirectories, hasItems } = node.data;
                if (hasSubDirectories === undefined && hasItems === undefined) return true;
                return showLinks ? !!(hasSubDirectories || hasItems) : !!hasSubDirectories;
            },
            getTooltip: (node) => node.data.href,
            getIconElement: this.getIconElement,
            getHideChevron: (_node, level) => level === 0,
            renderTrailing: (node) => this.props.renderTrailing?.(node.data),
            onItemContextMenu: this.onItemContextMenu,
            traitTypeId: writable
                ? ((provider.dragTraitTypeId as TraitTypeId | undefined) ?? TraitTypeId.ILink)
                : undefined,
            getDragData: writable ? this.getDragData : undefined,
            acceptsDrop: writable,
            acceptsFileDrop: writable && !!provider.importFiles,
            canTraitDrop: writable ? this.canTraitDrop : undefined,
            onTraitDrop: writable ? this.onTraitDrop : undefined,
            onDragStartOverride: osDragEnabled ? this.onOsDragStart : undefined,
            onModel: (tree: TreeModel<TreeProviderNode> | null) => this.model.setTreeModel(tree),
        };
    }

    private readonly isSelected = (node: TreeProviderNode): boolean =>
        this.selectedSet.has(node.data.href.toLowerCase());

    private readonly onSelectionChange = (nodes: TreeProviderNode[]): void => {
        this.model.setSelection(nodes.map((node) => node.data.href));
    };

    private readonly onActiveChange = (index: number | null): void => {
        this.activeIndex = index;
    };

    private readonly canCollapse = (node: TreeProviderNode): boolean =>
        node.data.href !== this.props.provider.rootPath;

    private readonly onExpandChange = (value: string | number, expanded: boolean): void => {
        this.model.onExpandChange(String(value), expanded);
    };

    private readonly getIconElement = (node: TreeProviderNode): Node => {
        const href = node.data.href;
        const cached = this.iconCache.get(href);
        if (cached) return cached;
        const element = createTreeProviderItemIconElement(node.data);
        this.iconCache.set(href, element);
        return element;
    };

    private readonly getDragData = (node: TreeProviderNode): unknown | null => {
        const provider = this.props.provider;
        if (node.data.href === provider.rootPath) return null;
        const items = this.model.dragItemsFor(node);
        return items.length ? { items, sourceId: provider.sourceUrl } : null;
    };

    private readonly onOsDragStart = (
        node: TreeProviderNode,
        _level: number,
        event: React.DragEvent,
    ): boolean => {
        const href = node.data.href;
        if (!href || href === this.props.provider.rootPath) return false;
        const paths = this.model.dragItemsFor(node).map((item) => item.href);
        if (!paths.length) return false;
        event.preventDefault();
        void api.startOsFileDrag(paths);
        return true;
    };

    private readonly canTraitDrop = (
        node: TreeProviderNode,
        payload: TraitDragPayload,
    ): boolean => this.props.provider.writable
        && !!getTraitDropAction(this.props.provider, node.data.href, payload);

    private readonly onTraitDrop = (node: TreeProviderNode, payload: TraitDragPayload): void => {
        const action = getTraitDropAction(this.props.provider, node.data.href, payload);
        if (!action) return;
        if (action.kind === "move") {
            void this.model.moveItems(action.items, node);
        } else if (action.kind === "import-links") {
            void this.model.importLinksTo(action.items, node);
        } else if (supportsOsClipboard(this.props.provider)) {
            void this.model.dropOsFilesInto(action.files, node);
        } else {
            void this.model.importFiles(action.files, node);
        }
    };

    private readonly onItemContextMenu = (
        node: TreeProviderNode,
        _level: number,
        event: React.MouseEvent<HTMLDivElement>,
    ): void => this.model.onItemContextMenu(node, event);

    private readonly onRootKeyDown = (event: KeyboardEvent): void => {
        const publicEvent = toPublicEvent(event) as unknown as React.KeyboardEvent<HTMLDivElement>;
        if (this.model.onTreeKeyDown(publicEvent)) return;
        if (event.ctrlKey && event.key === "f") {
            event.preventDefault();
            event.stopPropagation();
            this.model.showSearch();
            setTimeout(() => this.searchField?.focus(), 0);
        }
        if (event.key === "Escape" && this.model.state.get().searchVisible) {
            event.preventDefault();
            event.stopPropagation();
            this.model.hideSearch();
            this.treeView?.model.focusRoot();
        }
    };

    private readonly onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        this.model.hideSearch();
        this.treeView?.model.focusRoot();
    };

    private readonly onSearchBlur = (): void => {
        if (!this.model.state.get().searchText) this.model.hideSearch();
    };

    private readonly onSearchClose = (): void => {
        this.model.hideSearch();
        this.treeView?.model.focusRoot();
    };
}

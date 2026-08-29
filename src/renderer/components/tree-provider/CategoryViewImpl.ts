import { showAppPopupMenu } from "../../ui/dialogs";
import { createComponentModelDriver, type ComponentModelDriver } from "../../core/state/model";
import type { GridModelCapability } from "../../uikit/VirtualGrid";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { InputView } from "../../uikit/Input/InputView";
import { SpacerView } from "../../uikit/Spacer/SpacerView";
import { createIconElement } from "../../uikit/shared/slots";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { ITreeProviderItem } from "../../api/types/io.tree";
import type { IconName } from "../../theme/icon-registry";
import {
    CategoryViewModel,
    type CategoryItemsRendererProps,
    type CategoryViewMode,
    type CategoryViewProps,
    type CategoryViewState,
    defaultCategoryViewState,
} from "./CategoryViewModel";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Text/Text.css";
import "./CategoryView.css";

const VIEW_MODE_LABELS: Record<CategoryViewMode, string> = {
    "list": "List",
    "tiles-landscape": "Landscape",
    "tiles-landscape-big": "Landscape (Large)",
    "tiles-portrait": "Portrait",
    "tiles-portrait-big": "Portrait (Large)",
};

const VIEW_MODE_ICONS: Record<CategoryViewMode, IconName> = {
    "list": "view-list",
    "tiles-landscape": "view-landscape",
    "tiles-landscape-big": "view-landscape-big",
    "tiles-portrait": "view-portrait",
    "tiles-portrait-big": "view-portrait-big",
};

const VIEW_MODE_ORDER: CategoryViewMode[] = [
    "list", "tiles-landscape", "tiles-landscape-big",
    "tiles-portrait", "tiles-portrait-big",
];

type Arm = "content" | "message";
type CategoryModelDriver = ComponentModelDriver<
    CategoryViewState,
    CategoryViewProps,
    CategoryViewModel
>;

interface StateProjection {
    filteredItems: ITreeProviderItem[];
    selectedHrefs: string[];
    dropTargetHref: string | null;
    searchText: string;
    selectedHref?: string | null;
    multiSelect?: boolean;
    provider?: CategoryViewProps["provider"];
    renderItems?: CategoryViewProps["renderItems"];
}

interface StateSelection extends StateProjection {
    searchText: string;
    loading: boolean;
    error: string | null;
    items: ITreeProviderItem[];
    dropOverView: boolean;
}

/** Native shell for CategoryView and its editor-owned list/tile item view. */
export class CategoryViewImpl extends VanillaView<CategoryViewProps> {
    private readonly driver: CategoryModelDriver;
    private readonly content = document.createElement("div");
    private readonly footer = document.createElement("div");
    private readonly footerCount = document.createElement("span");
    private readonly bridgeHost = document.createElement("div");
    private readonly tileScope = document.createElement("div");
    private inputView: InputView | undefined;
    private clearButton: IconButtonView | undefined;
    private viewModeButton: IconButtonView | undefined;
    private spacerView: SpacerView | undefined;
    private bridge: Node | undefined;
    private gridModel: GridModelCapability | null = null;
    private pendingGridRepaint = false;
    private toolbarTarget: HTMLElement | null = null;
    private searchField: HTMLInputElement | undefined;
    private arm: Arm | undefined;
    private lastProjection: StateProjection | undefined;
    private lastViewMode: CategoryViewMode | undefined;
    private inert = false;

    public constructor(props: CategoryViewProps) {
        super(props, document.createElement("div"));
        this.driver = createComponentModelDriver(
            props,
            CategoryViewModel,
            defaultCategoryViewState,
        );

        // The model driver is constructed here, so it is always disposed even if mounting fails
        // or the adapter is disposed before its layout effect runs.
        this.own(() => { this.inert = true; });
        this.own(() => this.driver.dispose());
    }

    public get model(): CategoryViewModel {
        return this.driver.model;
    }

    protected onMount(): void {
        this.buildStaticDom();
        this.installRootListeners();
        this.driver.mount();

        this.inputView = this.child(new InputView({
            value: "",
            placeholder: "Search...",
            onChange: this.model.setSearchText,
            onKeyDown: this.onSearchKeyDown,
        }));
        this.clearButton = this.child(new IconButtonView({
            size: "sm",
            title: "Clear",
            icon: "close",
            onClick: this.onSearchClose,
        }));
        this.viewModeButton = this.child(new IconButtonView({
            size: "sm",
            title: "View Mode",
            icon: VIEW_MODE_ICONS.list,
            onClick: this.onViewModeMenu,
        }));
        this.spacerView = this.child(new SpacerView({}));

        this.inputView.mount();
        this.searchField = this.inputView.inputElement;
        this.clearButton.mount();
        this.viewModeButton.mount();
        this.spacerView.mount();
        this.footer.insertBefore(this.spacerView.root, this.footerCount);

        this.bind(
            this.model.state,
            (state) => ({
                filteredItems: state.filteredItems,
                selectedHrefs: state.selectedHrefs,
                dropTargetHref: state.dropTargetHref,
                searchText: state.searchText,
                loading: state.loading,
                error: state.error,
                items: state.items,
                dropOverView: state.dropOverView,
            }),
            (state) => this.applyState(state),
        );
    }

    protected onUpdate(props: CategoryViewProps): void {
        this.driver.update(props);
        this.applyState(this.model.state.get());
    }

    protected onDispose(): void {
        this.inert = true;
        this.detachToolbarNodes();
        this.disposeBridge();
        this.gridModel = null;
    }

    private buildStaticDom(): void {
        this.root.className = "category-view-root";
        this.root.dataset.type = "category-view";
        this.root.tabIndex = -1;

        this.content.className = "cv-content";
        this.bridgeHost.className = "cv-items-bridge";
        this.bridgeHost.style.display = "contents";
        this.tileScope.className = "panel-root cv-tile-focus-scope";
        this.tileScope.dataset.type = "category-tile-focus";
        this.tileScope.dataset.name = "links-tiles-focus-scope";
        this.tileScope.dataset.direction = "column";
        this.tileScope.dataset.focusSelection = "";
        this.tileScope.tabIndex = 0;

        this.footer.className = "panel-root category-footer";
        this.footer.dataset.type = "category-footer";
        this.footer.dataset.name = "category-footer";
        this.footer.dataset.direction = "row";
        this.footer.dataset.align = "center";
        this.footer.dataset.gap = "sm";
        this.footer.dataset.paddingX = "sm";
        this.footer.dataset.background = "dark";
        this.footer.dataset.borderTop = "";
        this.footerCount.className = "cv-footer-count";
        this.footer.append(this.footerCount);

        this.root.append(this.content);
    }

    private installRootListeners(): void {
        this.listen(this.root, "contextmenu", (event) => {
            if (this.arm !== "content") return;
            this.model.onBackgroundContextMenu(event);
        });
        this.listen(this.root, "keydown", (event) => {
            if (this.arm !== "content") return;
            this.model.onKeyDown(event);
        });
        this.listen(this.root, "dragenter", (event) => {
            if (this.arm === "content") this.model.onDragEnter(null, event);
        });
        this.listen(this.root, "dragover", (event) => {
            if (this.arm === "content") this.model.onDragOver(null, event);
        });
        this.listen(this.root, "dragleave", (event) => {
            if (this.arm === "content") this.model.onDragLeave(null, event);
        });
        this.listen(this.root, "drop", (event) => {
            if (this.arm === "content") this.model.onDrop(null, event);
        });
    }

    private applyState(state: StateSelection): void {
        if (this.inert) return;

        const contentArm = !state.error && !(state.loading && state.items.length === 0);
        this.arm = contentArm ? "content" : "message";
        this.root.toggleAttribute("data-drop-active", contentArm && state.dropOverView && !state.dropTargetHref);
        this.updateToolbar(contentArm);
        this.updateFooter(state);

        if (!contentArm) {
            this.disposeBridge();
            this.content.replaceChildren(this.createMessage(state.error ? "error" : "loading", state.error ?? "Loading..."));
            this.footer.remove();
            return;
        }

        if (!this.footer.parentNode) this.root.append(this.footer);

        if (state.filteredItems.length === 0) {
            this.disposeBridge();
            const empty = document.createElement("div");
            empty.className = "cv-empty";
            empty.textContent = state.searchText ? "No matching items" : "Empty folder";
            this.content.replaceChildren(empty);
            this.lastProjection = undefined;
            return;
        }

        this.reconcileItemsArm(state);
    }

    private createMessage(kind: "error" | "loading", text: string): HTMLDivElement {
        const message = document.createElement("div");
        message.className = kind === "error" ? "cv-error" : "cv-loading";
        message.textContent = text;
        return message;
    }

    private updateFooter(state: CategoryViewState): void {
        const totalCount = state.items.length;
        const filteredCount = state.filteredItems.length;
        this.footerCount.textContent = filteredCount === totalCount
            ? `${totalCount} items`
            : `${filteredCount} of ${totalCount} items`;
        if (state.selectedHrefs.length > 1) {
            this.footerCount.textContent += ` (${state.selectedHrefs.length} selected)`;
        }
    }

    private reconcileItemsArm(state: CategoryViewState): void {
        const viewMode = this.props.viewMode ?? "list";
        const isTileMode = viewMode !== "list";
        const projectionChanged = !this.lastProjection
            || this.lastProjection.filteredItems !== state.filteredItems
            || this.lastProjection.selectedHrefs !== state.selectedHrefs
            || this.lastProjection.dropTargetHref !== state.dropTargetHref
            || this.lastProjection.searchText !== state.searchText
            || this.lastProjection.selectedHref !== this.props.selectedHref
            || this.lastProjection.multiSelect !== this.props.multiSelect
            || this.lastProjection.provider !== this.props.provider
            || this.lastProjection.renderItems !== this.props.renderItems
            || this.lastViewMode !== viewMode;

        if (isTileMode) {
            this.content.replaceChildren(this.tileScope);
            this.tileScope.replaceChildren(this.bridgeHost);
        } else {
            this.content.replaceChildren(this.bridgeHost);
        }

        if (!this.bridge) {
            const rendered = this.renderItems(state);
            this.bridgeHost.replaceChildren(rendered);
            this.bridge = rendered;
            this.pendingGridRepaint = true;
            this.flushPendingGridRepaintSoon();
        } else if (projectionChanged || this.lastProjection?.filteredItems !== state.filteredItems) {
            const rendered = this.renderItems(state);
            if (rendered !== this.bridge) {
                this.bridgeHost.replaceChildren(rendered);
                this.bridge = rendered;
            }
            this.pendingGridRepaint = true;
            this.flushPendingGridRepaintSoon();
        }

        if (this.lastViewMode !== undefined && this.lastViewMode !== viewMode) {
            this.gridModel?.scrollToRow(0);
            this.pendingGridRepaint = true;
            this.flushPendingGridRepaintSoon();
        }

        this.lastProjection = {
            filteredItems: state.filteredItems,
            selectedHrefs: state.selectedHrefs,
            dropTargetHref: state.dropTargetHref,
            searchText: state.searchText,
            selectedHref: this.props.selectedHref,
            multiSelect: this.props.multiSelect,
            provider: this.props.provider,
            renderItems: this.props.renderItems,
        };
        this.lastViewMode = viewMode;
    }

    private renderItems(state: CategoryViewState): Node {
        const provider = this.props.provider;
        const selectedIds = this.props.multiSelect
            ? new Set(state.selectedHrefs)
            : undefined;
        const acceptsDrops = this.model.acceptsDrops;
        const allowsDrag = this.model.allowsDrag;
        return this.props.renderItems({
            items: state.filteredItems,
            viewMode: this.props.viewMode ?? "list",
            selectedId: this.props.selectedHref ?? undefined,
            selectedIds,
            searchText: state.searchText,
            onSelect: this.onItemClick,
            onDoubleClick: this.onItemDoubleClick,
            onEdit: provider.writable && provider.rename ? this.onEdit : undefined,
            onDelete: provider.writable && provider.deleteItem ? this.onDelete : undefined,
            onContextMenu: this.onItemContextMenu,
            onGridModel: this.onGridModel,
            onItemDragEnter: acceptsDrops ? this.onItemDragEnter : undefined,
            onItemDragOver: acceptsDrops ? this.onItemDragOver : undefined,
            onItemDragLeave: acceptsDrops ? this.onItemDragLeave : undefined,
            onItemDrop: acceptsDrops ? this.onItemDrop : undefined,
            dropTargetId: state.dropTargetHref,
            dragSourceId: allowsDrag ? provider.sourceUrl : undefined,
            onDragStartOverride: allowsDrag ? this.onDragStartOverride : undefined,
        } satisfies CategoryItemsRendererProps);
    }

    private disposeBridge(): void {
        if (this.bridge) {
            this.props.onItemsDisposed?.();
            this.bridge = undefined;
        }
        this.bridgeHost.replaceChildren();
        this.bridge = undefined;
        this.gridModel = null;
        this.pendingGridRepaint = false;
        this.lastProjection = undefined;
    }

    private readonly onGridModel = (model: GridModelCapability | null): void => {
        if (this.inert) return;
        this.gridModel = model;
        if (model) this.flushPendingGridRepaintSoon();
    };

    private flushPendingGridRepaintSoon(): void {
        queueMicrotask(() => {
            if (this.inert || !this.pendingGridRepaint || !this.gridModel) return;
            this.pendingGridRepaint = false;
            this.gridModel.update({ all: true });
        });
    }

    private updateToolbar(contentArm: boolean): void {
        const desired = contentArm ? this.props.toolbarPortalRef ?? null : null;
        if (desired !== this.toolbarTarget) {
            this.detachToolbarNodes();
            this.toolbarTarget = desired;
        }
        if (!desired || !this.inputView || !this.clearButton || !this.viewModeButton) return;

        if (this.inputView.root.parentNode !== desired) desired.append(this.inputView.root);
        if (this.props.onViewModeChange) {
            if (this.viewModeButton.root.parentNode !== desired) desired.append(this.viewModeButton.root);
        } else {
            this.viewModeButton.root.remove();
        }

        const state = this.model.state.get();
        this.inputView.update({
            value: state.searchText,
            placeholder: "Search...",
            onChange: this.model.setSearchText,
            onKeyDown: this.onSearchKeyDown,
            endSlot: state.searchText ? this.clearButton.root : undefined,
        });
        this.viewModeButton.update({
            size: "sm",
            title: "View Mode",
            icon: VIEW_MODE_ICONS[this.props.viewMode ?? "list"],
            onClick: this.onViewModeMenu,
        });
    }

    private detachToolbarNodes(): void {
        this.inputView?.root.remove();
        this.viewModeButton?.root.remove();
        this.toolbarTarget = null;
    }

    private readonly onSearchKeyDown = (event: KeyboardEvent): void => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        this.model.setSearchText("");
    };

    private readonly onSearchClose = (): void => {
        this.model.setSearchText("");
        this.searchField?.blur();
    };

    private readonly onViewModeMenu = (event: MouseEvent): void => {
        const onViewModeChange = this.props.onViewModeChange;
        if (!onViewModeChange) return;
        if (!(event.currentTarget instanceof Element)) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const viewMode = this.props.viewMode ?? "list";
        void showAppPopupMenu(rect.left, rect.bottom + 2, VIEW_MODE_ORDER.map((mode) => ({
            label: VIEW_MODE_LABELS[mode],
            icon: createIconElement(VIEW_MODE_ICONS[mode]),
            selected: mode === viewMode,
            onClick: () => onViewModeChange(mode),
        })));
    };

    private readonly onItemClick = (item: ITreeProviderItem, event?: MouseEvent): void => {
        this.model.onItemClick(item, event);
    };

    private readonly onItemDoubleClick = (item: ITreeProviderItem): void => {
        this.model.onItemDoubleClick(item);
    };

    private readonly onItemContextMenu = (event: MouseEvent, item: ITreeProviderItem): void => {
        this.model.onItemContextMenu(item, event);
    };

    private readonly onEdit = (item: ITreeProviderItem): void => {
        this.model.renameItem(item);
    };

    private readonly onDelete = (item: ITreeProviderItem, _skipConfirm: boolean): void => {
        void this.model.deleteItemAction(item);
    };

    private readonly onItemDragEnter = (item: ITreeProviderItem, event: DragEvent): void => {
        if (item.isDirectory) this.model.onDragEnter(item, event);
    };

    private readonly onItemDragOver = (item: ITreeProviderItem, event: DragEvent): void => {
        if (item.isDirectory) this.model.onDragOver(item, event);
    };

    private readonly onItemDragLeave = (item: ITreeProviderItem, event: DragEvent): void => {
        if (item.isDirectory) this.model.onDragLeave(item, event);
    };

    private readonly onItemDrop = (item: ITreeProviderItem, event: DragEvent): void => {
        if (item.isDirectory) this.model.onDrop(item, event);
    };

    private readonly onDragStartOverride = (item: ITreeProviderItem, event: DragEvent): boolean => {
        return this.model.handleOsDragStart(item, event);
    };
}

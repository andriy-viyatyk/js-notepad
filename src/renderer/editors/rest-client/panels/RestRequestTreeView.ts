import { app } from "../../../api/app";
import { LINK, TraitTypeId, type TraitDragPayload, resolveTraits } from "../../../core/traits";
import { TraitSet, traited } from "../../../core/traits/traits";
import type { MenuItem } from "../../../uikit/Menu";
import { IconButtonView } from "../../../uikit/IconButton/IconButtonView";
import { createPanelElement } from "../../../uikit/Panel/panel-style";
import { createTextElement } from "../../../uikit/Text/text-style";
import { TreeView } from "../../../uikit/Tree/TreeView";
import { TREE_ITEM_KEY, type TreeProps } from "../../../uikit/Tree/types";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import type { RestClientData, RestClientSource } from "../restClientTypes";
import {
    EMPTY_LABEL,
    getRequestTreeChildren,
    requestTreeItemTraits,
    type RequestTreeItem,
} from "../RestClientShared";
import { METHOD_COLORS } from "../httpConstants";

export interface RestRequestTreeViewProps {
    vm: RestClientSource;
    items: RequestTreeItem[];
    selectedId: string;
}

/** Native request projection used by the Rest secondary panel. */
export class RestRequestTreeView extends VanillaView<RestRequestTreeViewProps> {
    private readonly nativeTraits = new TraitSet().add(TREE_ITEM_KEY, {
        value: (item: unknown) => requestTreeItemTraits.get(TREE_ITEM_KEY)?.value?.(item)
            ?? (item as RequestTreeItem).id,
        label: (item: unknown) => this.createLabel(item as RequestTreeItem),
    });

    private tree: TreeView<RequestTreeItem> | undefined;
    private addButton: IconButtonView | undefined;
    private rootLabel: HTMLDivElement | undefined;
    private inactive = false;

    public constructor(props: RestRequestTreeViewProps) {
        super(props, document.createElement("div"));
        this.root.dataset.type = "rest-request-tree";
        // `display: contents` because the replaced `RequestTree` returned `<Tree>`
        // directly and contributed no DOM of its own — the tree was a flex child of the panel
        // pane. A plain block wrapper here breaks that chain: the pane is a definite-height flex
        // column and `TreeView` sizes itself with `flex: 1`, which against an auto-height block
        // resolves to the virtual grid's 100px fallback instead of the full panel height
        // (EPIC-062 E4-15, the same defect class).
        this.root.style.display = "contents";
    }

    protected onMount(): void {
        this.rootLabel = createPanelElement({
            name: "rest-tree-root-label",
            direction: "row",
            align: "center",
            flex: true,
            paddingLeft: "sm",
            gap: "xs",
        });
        this.rootLabel.append(createTextElement("Requests", {
            size: "xs",
            variant: "uppercased",
            color: "light",
            bold: true,
        }), createPanelElement({ flex: true }));
        this.addButton = this.child(new IconButtonView({
            name: "rest-tree-add",
            size: "sm",
            icon: "plus",
            title: "Add request",
            onClick: (event) => {
                event.stopPropagation();
                this.props.vm.addRequest();
            },
        }));
        this.rootLabel.append(this.addButton.root);
        this.addButton.mount();

        this.tree = this.child(new TreeView<RequestTreeItem>(this.treeProps(this.props)));
        this.root.append(this.tree.root);
        this.tree.mount();
        this.own(() => { this.inactive = true; });
    }

    protected onUpdate(props: RestRequestTreeViewProps): void {
        this.tree?.update(this.treeProps(props));
    }

    protected onDispose(): void {
        this.tree = undefined;
        this.addButton = undefined;
        this.rootLabel = undefined;
    }

    private treeProps(props: RestRequestTreeViewProps): TreeProps<RequestTreeItem> {
        return {
            name: "rest-client-tree",
            items: traited(props.items, this.nativeTraits),
            getChildren: getRequestTreeChildren,
            isSelected: (item) => item.id === props.selectedId,
            onChange: (item) => {
                if (item.request) props.vm.selectRequest(item.id);
            },
            getContextMenu: (item) => this.contextMenu(props.vm, item),
            onItemContextMenu: (item) => {
                if (item.request) props.vm.selectRequest(item.id);
            },
            traitTypeId: TraitTypeId.RestRequest,
            getDragData: this.getDragData,
            acceptsDrop: true,
            canTraitDrop: this.canTraitDrop,
            onTraitDrop: (item, payload) => this.onTraitDrop(props.vm, item, payload),
            defaultExpandAll: true,
            focusSelection: true,
            getHideChevron: (item) => !!item.isRoot,
        };
    }

    private createLabel(item: RequestTreeItem): Node {
        if (item.isRoot) return this.rootLabel ?? document.createTextNode("");
        if (item.isCollection) {
            return createTextElement(item.collectionName || EMPTY_LABEL, {
                size: "md",
                bold: !!item.collectionName,
                italic: !item.collectionName,
                color: item.collectionName ? "default" : "light",
            });
        }

        const request = item.request;
        if (!request) return createTextElement(EMPTY_LABEL, { size: "md", color: "light" });
        const method = createPanelElement({ minWidth: 32, justify: "center" });
        method.append(createTextElement(request.method, {
            size: "xs",
            bold: true,
            color: METHOD_COLORS[request.method],
            align: "center",
        }));
        return createPanelElement(
            { direction: "row", align: "center", gap: "sm" },
            [
                method,
                createTextElement(request.name || EMPTY_LABEL, {
                    size: "md",
                    truncate: true,
                    italic: !request.name,
                    color: request.name ? "default" : "light",
                }),
            ],
        );
    }

    private contextMenu(vm: RestClientSource, item: RequestTreeItem): MenuItem[] | undefined {
        if (item.isRoot || !item.request && !item.isCollection) return undefined;
        if (item.isCollection) {
            const collectionName = item.collectionName ?? "";
            return [
                {
                    label: "Add Request",
                    onClick: () => vm.addRequest(undefined, collectionName),
                },
                {
                    label: "Open in New Editor",
                    onClick: () => {
                        const requests = vm.state.get().data.requests
                            .filter((request) => request.collection === collectionName)
                            .map((request) => ({ ...request }));
                        const data: RestClientData = { type: "rest-client", requests };
                        const title = collectionName || EMPTY_LABEL;
                        app.pages.addEditorPage(
                            "rest-client",
                            "json",
                            `${title}.rest.json`,
                            JSON.stringify(data, null, 4),
                        );
                    },
                },
                {
                    label: "Delete Collection",
                    startGroup: true,
                    onClick: async () => {
                        const label = collectionName || EMPTY_LABEL;
                        const result = await app.ui.confirm(`Delete all requests in "${label}"?`);
                        if (result) vm.deleteCollection(collectionName);
                    },
                },
            ];
        }

        const request = item.request;
        if (!request) return undefined;
        return [
            {
                label: "Duplicate",
                onClick: () => {
                    const newRequest = vm.addRequest(`${request.name} (copy)`, request.collection);
                    vm.updateRequest(newRequest.id, {
                        method: request.method,
                        url: request.url,
                        headers: [...request.headers],
                        body: request.body,
                        bodyType: request.bodyType,
                        bodyLanguage: request.bodyLanguage,
                        formData: [...request.formData],
                        binaryFilePath: request.binaryFilePath,
                        formDataEntries: [...request.formDataEntries],
                    });
                },
            },
            {
                label: "Open in New Editor",
                onClick: () => {
                    const data: RestClientData = {
                        type: "rest-client",
                        requests: [{ ...request }],
                    };
                    app.pages.addEditorPage(
                        "rest-client",
                        "json",
                        `${request.name || "Request"}.rest.json`,
                        JSON.stringify(data, null, 4),
                    );
                },
            },
            {
                label: "Delete",
                startGroup: true,
                onClick: async () => {
                    const name = request.name || EMPTY_LABEL;
                    const result = await app.ui.confirm(`Delete "${name}"?`);
                    if (result) vm.deleteRequest(item.id);
                },
            },
        ];
    }

    private readonly getDragData = (item: RequestTreeItem): unknown | null => {
        if (item.isRoot || item.isCollection) return null;
        return { id: item.id };
    };

    private readonly canTraitDrop = (
        item: RequestTreeItem,
        payload: TraitDragPayload,
    ): boolean => {
        if (item.isRoot) return false;
        if (payload.typeId === TraitTypeId.RestRequest) return true;
        const traits = resolveTraits(payload.typeId);
        return !!traits?.get(LINK);
    };

    private readonly onTraitDrop = (
        vm: RestClientSource,
        item: RequestTreeItem,
        payload: TraitDragPayload,
    ): void => {
        if (this.inactive || item.isRoot) return;
        if (payload.typeId === TraitTypeId.RestRequest) {
            const data = payload.data as { id: string };
            if (item.isCollection) {
                vm.moveRequest(data.id, item.id, item.collectionName ?? "");
            } else {
                vm.moveRequest(data.id, item.id, item.request?.collection);
            }
            return;
        }

        const linkTrait = resolveTraits(payload.typeId)?.get(LINK);
        if (!linkTrait) return;
        const collection = item.isCollection
            ? item.collectionName ?? ""
            : item.request?.collection ?? "";
        for (const link of linkTrait.getItems(payload.data)) {
            if (!link.href) continue;
            const request = vm.addRequest(link.title || link.href, collection);
            vm.updateRequest(request.id, { url: link.href });
        }
    };
}

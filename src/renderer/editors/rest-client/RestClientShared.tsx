import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
    IconButton,
    Panel,
    Spacer,
    Splitter,
    Text,
    Textarea,
    Tree,
    TreeItem,
    TREE_ITEM_KEY,
    WithMenu,
} from "../../uikit";
import type { MenuItem, TreeItemRenderContext } from "../../uikit";
import universalColors from "../../theme/universal-colors";
import { CopyIcon, DeleteIcon, PlusIcon } from "../../theme/icons";
import { app } from "../../api/app";
import { RequestBuilder } from "./RequestBuilder";
import { ResponseViewer, getResponseSize } from "./ResponseViewer";
import { METHOD_COLORS } from "./httpConstants";
import { TraitTypeId, type TraitDragPayload, resolveTraits } from "../../core/traits";
import { TraitSet, type Traited } from "../../core/traits/traits";
import { LINK } from "../link-editor/linkTraits";
import { RestClientData, RestRequest } from "./restClientTypes";
import type { RestClientSource, RestClientViewState } from "./restClientTypes";

export interface RequestTreeItem {
    id: string;
    items?: RequestTreeItem[];
    request?: RestRequest;
    isRoot?: boolean;
    isCollection?: boolean;
    collectionName?: string;
}

export const EMPTY_LABEL = "(empty)";

export const requestTreeItemTraits = new TraitSet().add(TREE_ITEM_KEY, {
    value: (item: unknown) => (item as RequestTreeItem).id,
    label: (item: unknown) => {
        const r = item as RequestTreeItem;
        if (r.isRoot) return "";
        if (r.isCollection) return r.collectionName ?? "";
        return r.request?.name ?? "";
    },
});

export const getRequestTreeChildren = (item: RequestTreeItem) => item.items;

export function buildGroupedTree(requests: RestRequest[]): RequestTreeItem[] {
    const collectionOrder: string[] = [];
    const groups = new Map<string, RequestTreeItem[]>();

    for (const r of requests) {
        const col = r.collection || "";
        if (!groups.has(col)) {
            collectionOrder.push(col);
            groups.set(col, []);
        }
        groups.get(col).push({ id: r.id, request: r });
    }

    return collectionOrder.map((col) => ({
        id: `__col__${col}`,
        isCollection: true,
        collectionName: col,
        items: groups.get(col),
    }));
}

export function getStatusColor(status: number): string {
    if (status === 0) return universalColors.http.serverError;
    if (status < 300) return universalColors.http.success;
    if (status < 400) return universalColors.http.redirect;
    if (status < 500) return universalColors.http.clientError;
    return universalColors.http.serverError;
}

/** Show context menu using showAppPopupMenu (lazy import to avoid circular deps). */
async function showContextMenu(e: React.MouseEvent, items: MenuItem[]) {
    const { showAppPopupMenu } = await import("../../ui/dialogs/poppers/showPopupMenu");
    showAppPopupMenu(e.clientX, e.clientY, items);
}

// =============================================================================
// SplitDetailPanel
// =============================================================================

export function SplitDetailPanel({ vm, request, state }: {
    vm: RestClientSource;
    request: RestRequest;
    state: RestClientViewState;
}) {
    const detailRef = useRef<HTMLDivElement>(null);
    const responsePaneRef = useRef<HTMLDivElement>(null);
    const [resultHeight, setResultHeight] = useState<number | null>(null);

    // Pin resultHeight to the actually-rendered pixel size after first layout — same
    // reason as `RequestBuilder.bodyHeight` (splitter startValue must match what the
    // user sees on screen, otherwise the panel jumps on first drag).
    useLayoutEffect(() => {
        if (resultHeight === null && responsePaneRef.current) {
            setResultHeight(responsePaneRef.current.offsetHeight);
        }
    }, [resultHeight]);

    const getClampedHeight = useCallback((h: number) => {
        const container = detailRef.current;
        if (!container) return h;
        const total = container.clientHeight;
        return Math.max(total * 0.1, Math.min(total * 0.9, h));
    }, []);

    const handleResultHeightChange = useCallback((h: number) => {
        setResultHeight(getClampedHeight(h));
    }, [getClampedHeight]);

    const togglePanelHeight = useCallback((expandedRatio: number) => {
        const container = detailRef.current;
        if (!container) return;
        const total = container.clientHeight;
        const expanded = total * expandedRatio;
        const collapsed = total * (1 - expandedRatio);
        const current = resultHeight ?? total * 0.3;
        const isExpanded = Math.abs(current - expanded) < total * 0.05;
        setResultHeight(isExpanded ? collapsed : expanded);
    }, [resultHeight]);

    const handleTopHeaderDblClick = useCallback(() => {
        togglePanelHeight(0.3);
    }, [togglePanelHeight]);

    const handleBottomHeaderDblClick = useCallback(() => {
        togglePanelHeight(0.7);
    }, [togglePanelHeight]);

    const currentResultHeight = resultHeight ?? (detailRef.current?.clientHeight ?? 0) * 0.3;

    const topFlexProps: { flex?: number | string; height?: number; shrink?: boolean } =
        resultHeight !== null
            ? { flex: "1 1 auto" }
            : { flex: "7 1 0" };

    const bottomFlexProps: { flex?: number | string; height?: number; shrink?: boolean } =
        resultHeight !== null
            ? { flex: "0 0 auto", height: currentResultHeight, shrink: false }
            : { flex: "3 1 0" };

    const handleCollectionChange = useCallback(
        (value: string) => vm.updateRequestCollection(request.id, value),
        [vm, request.id],
    );

    const handleNameChange = useCallback(
        (value: string) => vm.renameRequest(request.id, value),
        [vm, request.id],
    );

    const handleDelete = useCallback(async () => {
        const name = request.name || EMPTY_LABEL;
        const result = await app.ui.confirm(`Delete "${name}"?`);
        if (result) vm.deleteRequest(request.id);
    }, [vm, request.id, request.name]);

    const copyMenuItems: MenuItem[] = useMemo(() => [
        {
            label: "Copy as cURL (bash)",
            onClick: async () => {
                const { serializeAsCurlBash } = await import("./serializeRequest");
                navigator.clipboard.writeText(serializeAsCurlBash(request));
            },
        },
        {
            label: "Copy as cURL (cmd)",
            onClick: async () => {
                const { serializeAsCurlCmd } = await import("./serializeRequest");
                navigator.clipboard.writeText(serializeAsCurlCmd(request));
            },
        },
        {
            label: "Copy as fetch",
            onClick: async () => {
                const { serializeAsFetch } = await import("./serializeRequest");
                navigator.clipboard.writeText(serializeAsFetch(request));
            },
        },
        {
            label: "Copy as fetch (Node.js)",
            onClick: async () => {
                const { serializeAsFetchNodeJs } = await import("./serializeRequest");
                navigator.clipboard.writeText(serializeAsFetchNodeJs(request));
            },
        },
    ], [request]);

    return (
        <Panel
            name="rest-detail"
            direction="column"
            flex={1}
            height={0}
            overflow="hidden"
            ref={detailRef}
        >
            {/* Top: Request */}
            <Panel
                name="request-pane"
                direction="column"
                overflow="hidden"
                minHeight={0}
                {...topFlexProps}
            >
                <Panel
                    name="request-pane-header"
                    direction="row"
                    align="center"
                    gap="xs"
                    paddingX="md"
                    paddingY="xs"
                    background="dark"
                    shrink={false}
                    onDoubleClick={handleTopHeaderDblClick}
                >
                    <Textarea
                        name="request-header-collection"
                        variant="ghost"
                        singleLine
                        value={request.collection}
                        onChange={handleCollectionChange}
                        placeholder="Collection"
                        size="sm"
                        maxWidth="40%"
                        minHeight={20}
                    />
                    <Text color="light" size="sm">/</Text>
                    <Textarea
                        name="request-header-name"
                        variant="ghost"
                        singleLine
                        value={request.name}
                        onChange={handleNameChange}
                        placeholder="Request name"
                        size="sm"
                        flex={1}
                        minWidth={50}
                        minHeight={20}
                    />
                    <Spacer />
                    <WithMenu items={copyMenuItems}>
                        {(setOpen) => (
                            <IconButton
                                name="request-copy-as"
                                size="sm"
                                icon={<CopyIcon />}
                                title="Copy request as..."
                                onClick={(e) => setOpen(e.currentTarget)}
                            />
                        )}
                    </WithMenu>
                    <IconButton
                        name="request-delete"
                        size="sm"
                        icon={<DeleteIcon />}
                        title="Delete request"
                        onClick={handleDelete}
                    />
                </Panel>
                <Panel
                    name="request-pane-body"
                    direction="column"
                    flex="1 1 0"
                    overflow="auto"
                    minHeight={0}
                >
                    <RequestBuilder vm={vm} request={request} state={state} />
                </Panel>
            </Panel>

            <Splitter
                name="rest-detail-splitter"
                orientation="horizontal"
                value={currentResultHeight}
                onChange={handleResultHeightChange}
                side="after"
                border="before"
            />

            {/* Bottom: Response */}
            <Panel
                name="response-pane"
                direction="column"
                overflow="hidden"
                minHeight={0}
                ref={responsePaneRef}
                {...bottomFlexProps}
            >
                <Panel
                    name="response-pane-header"
                    direction="row"
                    align="center"
                    gap="sm"
                    paddingX="md"
                    paddingY="xs"
                    background="dark"
                    shrink={false}
                    onDoubleClick={handleBottomHeaderDblClick}
                >
                    <Text size="xs" variant="uppercased" color="light" bold>Response</Text>
                    <Spacer />
                    {state.response && (
                        <>
                            <Text size="sm" bold color={getStatusColor(state.response.status)}>
                                {state.response.status === 0
                                    ? "Error"
                                    : `${state.response.status} ${state.response.statusText}`}
                            </Text>
                            <Text size="xs" color="light">{state.responseTime}ms</Text>
                            <Text size="xs" color="light">{getResponseSize(state.response)}</Text>
                        </>
                    )}
                </Panel>
                <Panel
                    name="response-pane-body"
                    direction="column"
                    flex="1 1 0"
                    overflow="hidden"
                    minHeight={0}
                >
                    <ResponseViewer
                        response={state.response}
                        responseTime={state.responseTime}
                        executing={state.executing}
                    />
                </Panel>
            </Panel>
        </Panel>
    );
}

// =============================================================================
// RequestTree
// =============================================================================

export function RequestTree({ vm, items, selectedId }: {
    vm: RestClientSource;
    items: Traited<unknown[]>;
    selectedId: string;
}) {
    const isSelected = useCallback(
        (item: RequestTreeItem) => item.id === selectedId,
        [selectedId],
    );

    const onChange = useCallback(
        (item: RequestTreeItem) => {
            if (item.request) vm.selectRequest(item.id);
        },
        [vm],
    );

    const handleItemContextMenu = useCallback(
        (item: RequestTreeItem, e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();

            if (item.request) vm.selectRequest(item.id);

            if (item.isCollection) {
                const colName = item.collectionName ?? "";
                const menuItems: MenuItem[] = [
                    {
                        label: "Add Request",
                        onClick: () => vm.addRequest(undefined, colName),
                    },
                    {
                        label: "Open in New Editor",
                        onClick: () => {
                            const requests = vm.state.get().data.requests
                                .filter((r) => r.collection === colName)
                                .map((r) => ({ ...r }));
                            const data: RestClientData = { type: "rest-client", requests };
                            const title = colName || EMPTY_LABEL;
                            app.pages.addEditorPage("rest-client", "json", `${title}.rest.json`, JSON.stringify(data, null, 4));
                        },
                    },
                    {
                        label: "Delete Collection",
                        startGroup: true,
                        onClick: async () => {
                            const label = colName || EMPTY_LABEL;
                            const result = await app.ui.confirm(`Delete all requests in "${label}"?`);
                            if (result) vm.deleteCollection(colName);
                        },
                    },
                ];
                showContextMenu(e, menuItems);
                return;
            }

            const req = item.request;
            const menuItems: MenuItem[] = [
                {
                    label: "Duplicate",
                    onClick: () => {
                        const newReq = vm.addRequest(`${req.name} (copy)`, req.collection);
                        vm.updateRequest(newReq.id, {
                            method: req.method,
                            url: req.url,
                            headers: [...req.headers],
                            body: req.body,
                            bodyType: req.bodyType,
                            bodyLanguage: req.bodyLanguage,
                            formData: [...req.formData],
                            binaryFilePath: req.binaryFilePath,
                            formDataEntries: [...req.formDataEntries],
                        });
                    },
                },
                {
                    label: "Open in New Editor",
                    onClick: () => {
                        const data: RestClientData = {
                            type: "rest-client",
                            requests: [{ ...req }],
                        };
                        app.pages.addEditorPage("rest-client", "json", `${req.name || "Request"}.rest.json`, JSON.stringify(data, null, 4));
                    },
                },
                {
                    label: "Delete",
                    startGroup: true,
                    onClick: async () => {
                        const name = req.name || EMPTY_LABEL;
                        const result = await app.ui.confirm(`Delete "${name}"?`);
                        if (result) vm.deleteRequest(item.id);
                    },
                },
            ];
            showContextMenu(e, menuItems);
        },
        [vm],
    );

    const getDragData = useCallback(
        (item: RequestTreeItem) => {
            if (item.isRoot || item.isCollection) return null;
            return { id: item.id };
        },
        [],
    );

    const canTraitDrop = useCallback(
        (dropItem: RequestTreeItem, payload: TraitDragPayload) => {
            if (dropItem.isRoot) return false;
            if (payload.typeId === TraitTypeId.RestRequest) return true;
            const traits = resolveTraits(payload.typeId);
            return !!traits?.get(LINK);
        },
        [],
    );

    const onTraitDrop = useCallback(
        (dropItem: RequestTreeItem, payload: TraitDragPayload) => {
            if (dropItem.isRoot) return;

            if (payload.typeId === TraitTypeId.RestRequest) {
                const data = payload.data as { id: string };
                if (dropItem.isCollection) {
                    vm.moveRequest(data.id, dropItem.id, dropItem.collectionName ?? "");
                } else {
                    vm.moveRequest(data.id, dropItem.id, dropItem.request?.collection);
                }
                return;
            }

            const traits = resolveTraits(payload.typeId);
            const linkTrait = traits?.get(LINK);
            if (!linkTrait) return;
            const dropped = linkTrait.getItems(payload.data);
            const collection = dropItem.isCollection
                ? (dropItem.collectionName ?? "")
                : (dropItem.request?.collection ?? "");
            for (const link of dropped) {
                if (!link.href) continue;
                const req = vm.addRequest(link.title || link.href, collection);
                vm.updateRequest(req.id, { url: link.href });
            }
        },
        [vm],
    );

    const renderItem = useCallback(
        (ctx: TreeItemRenderContext<RequestTreeItem>) => {
            const item = ctx.source;

            if (item.isRoot) {
                return (
                    <TreeItem
                        id={ctx.id}
                        level={ctx.level}
                        expanded={ctx.expanded}
                        hasChildren={ctx.hasChildren}
                        hideChevron
                        selected={false}
                        active={ctx.active}
                        label={
                            <Panel
                                name="rest-tree-root-label"
                                direction="row"
                                align="center"
                                flex={1}
                                paddingLeft="sm"
                                gap="xs"
                            >
                                <Text size="xs" variant="uppercased" color="light" bold>
                                    Requests
                                </Text>
                                <Spacer />
                                <IconButton
                                    name="rest-tree-add"
                                    size="sm"
                                    icon={<PlusIcon />}
                                    title="Add request"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        vm.addRequest();
                                    }}
                                />
                            </Panel>
                        }
                    />
                );
            }

            const labelNode = item.isCollection
                ? (
                    <Text
                        size="md"
                        bold={!!item.collectionName}
                        italic={!item.collectionName}
                        color={item.collectionName ? "default" : "light"}
                    >
                        {item.collectionName || EMPTY_LABEL}
                    </Text>
                )
                : (() => {
                    const req = item.request;
                    const badgeColor = METHOD_COLORS[req.method];
                    return (
                        <Panel direction="row" align="center" gap="sm">
                            <Panel minWidth={32} justify="center">
                                <Text size="xs" bold color={badgeColor} align="center">
                                    {req.method}
                                </Text>
                            </Panel>
                            <Text
                                size="md"
                                truncate
                                italic={!req.name}
                                color={req.name ? "default" : "light"}
                            >
                                {req.name || EMPTY_LABEL}
                            </Text>
                        </Panel>
                    );
                })();

            return (
                <TreeItem
                    id={ctx.id}
                    level={ctx.level}
                    expanded={ctx.expanded}
                    hasChildren={ctx.hasChildren}
                    label={labelNode}
                    selected={ctx.selected}
                    active={ctx.active}
                    dragging={ctx.dragging}
                    dropActive={ctx.dropActive}
                    onChevronClick={(e) => {
                        e.stopPropagation();
                        ctx.toggleExpanded();
                    }}
                    onContextMenu={(e) => handleItemContextMenu(item, e)}
                />
            );
        },
        [vm, handleItemContextMenu],
    );

    return (
        <Tree<RequestTreeItem>
            name="rest-client-tree"
            items={items}
            getChildren={getRequestTreeChildren}
            isSelected={isSelected}
            onChange={onChange}
            renderItem={renderItem}
            traitTypeId={TraitTypeId.RestRequest}
            getDragData={getDragData}
            acceptsDrop
            canTraitDrop={canTraitDrop}
            onTraitDrop={onTraitDrop}
            defaultExpandAll
        />
    );
}

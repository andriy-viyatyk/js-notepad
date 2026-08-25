import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
    IconButton,
    Panel,
    Spacer,
    Splitter,
    Text,
    Textarea,
    WithMenu,
} from "../../uikit";
import type { MenuItem } from "../../uikit";
import universalColors from "../../theme/universal-colors";
import { CopyIcon, DeleteIcon } from "../../theme/icons";
import { app } from "../../api/app";
import { RequestBuilder } from "./RequestBuilder";
import { ResponseViewer, getResponseSize } from "./ResponseViewer";
import { TraitSet } from "../../core/traits/traits";
import { RestRequest } from "./restClientTypes";
import type { RestClientSource, RestClientViewState } from "./restClientTypes";
import { TREE_ITEM_KEY } from "../../uikit/Tree/types";

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

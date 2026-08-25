import { useCallback, useEffect, useMemo } from "react";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { Tag } from "../../uikit/Tag";
import { Dot, DotColor } from "../../uikit/Dot";
import { Button } from "../../uikit/Button";
import { IconButton } from "../../uikit/IconButton";
import { Input } from "../../uikit/Input";
import { Select } from "../../uikit/Select";
import { IListBoxItem } from "../../uikit/ListBox";
import { Divider } from "../../uikit/Divider";
import { SegmentedControl, ISegment } from "../../uikit/SegmentedControl";
import { EditorToolbar } from "../base/EditorToolbar";
import {
    McpInspectorEditorModel,
    McpInspectorEditorState,
    McpPanelId,
} from "./McpInspectorEditorModel";
import { mcpConnectionStore } from "./McpConnectionStore";
import { ToolsPanel } from "./ToolsPanel";
import { ResourcesPanel } from "./ResourcesPanel";
import { PromptsPanel } from "./PromptsPanel";
import { MarkdownBlock } from "../markdown/MarkdownBlock";

const TRANSPORT_ITEMS: IListBoxItem[] = [
    { value: "http", label: "HTTP" },
    { value: "stdio", label: "Stdio" },
];

function dotColorFor(status: string): DotColor {
    switch (status) {
        case "connected": return "success";
        case "connecting": return "warning";
        case "error": return "error";
        default: return "neutral";
    }
}

interface McpInspectorViewProps {
    model: McpInspectorEditorModel;
}

function McpInspectorView({ model }: McpInspectorViewProps) {
    const s = model.state.use();
    const storeState = mcpConnectionStore.state.use();
    const isConnected = s.connectionStatus === "connected";
    const isConnecting = s.connectionStatus === "connecting";
    const connections = storeState.connections;

    useEffect(() => { mcpConnectionStore.load(); }, []);

    const handleConnect = useCallback(() => {
        if (isConnected || isConnecting) {
            model.disconnect();
        } else {
            model.connect();
        }
    }, [model, isConnected, isConnecting]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !isConnected && !isConnecting) {
            model.connect();
        }
    }, [model, isConnected, isConnecting]);

    const handleSelectSaved = useCallback((id: string) => {
        if (!id) return;
        const conn = connections.find((c) => c.id === id);
        if (conn) model.fillFromSaved(conn);
    }, [model, connections]);

    const handleClickConnection = useCallback((id: string) => {
        const conn = connections.find((c) => c.id === id);
        if (conn) model.fillFromSaved(conn);
    }, [model, connections]);

    const handleDeleteConnection = useCallback((e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        model.deleteSavedConnection(id);
    }, [model]);

    const savedItems = useMemo<IListBoxItem[]>(
        () => connections.map((c) => ({
            value: c.id,
            label: c.transport === "http" ? c.url : `${c.command} ${c.args}`,
        })),
        [connections],
    );

    const selectedTransport = useMemo(
        () => TRANSPORT_ITEMS.find((it) => it.value === s.transportType) ?? null,
        [s.transportType],
    );

    const panelSegments = useMemo<ISegment[]>(() => {
        const out: ISegment[] = [{ value: "info", label: "Info" }];
        if (s.hasTools) out.push({ value: "tools", label: "Tools" });
        if (s.hasResources) out.push({ value: "resources", label: "Resources" });
        if (s.hasPrompts) out.push({ value: "prompts", label: "Prompts" });
        out.push({ value: "history", label: "History" });
        return out;
    }, [s.hasTools, s.hasResources, s.hasPrompts]);

    return (
        <Panel name="mcp-inspector-root" direction="column" flex={1} overflow="hidden" tabIndex={-1}>
            {/* Connection bar */}
            <EditorToolbar borderBottom>
                <Panel
                    name="mcp-connection-bar"
                    direction="row"
                    align="center"
                    gap="sm"
                    paddingX="lg"
                    paddingY="sm"
                    flex={1}
                >
                    {connections.length > 0 && !isConnected && !isConnecting && (
                        <>
                            <Select<IListBoxItem>
                                name="mcp-saved-connections"
                                items={savedItems}
                                value={null}
                                onChange={(it) => handleSelectSaved(String(it.value))}
                                placeholder="Saved…"
                                size="sm"
                                maxWidth={160}
                            />
                            <Divider orientation="vertical" />
                        </>
                    )}

                    <Select<IListBoxItem>
                        name="mcp-transport"
                        items={TRANSPORT_ITEMS}
                        value={selectedTransport}
                        onChange={(it) => model.state.update((st) => {
                            st.transportType = it.value as "http" | "stdio";
                        })}
                        disabled={isConnected || isConnecting}
                        size="sm"
                        minWidth={70}
                        maxWidth={120}
                    />

                    {s.transportType === "http" ? (
                        <Panel flex={1}>
                            <Input
                                name="mcp-url"
                                placeholder="http://127.0.0.1:7865/mcp"
                                value={s.url}
                                onChange={(v) => model.state.update((st) => { st.url = v; })}
                                onKeyDown={handleKeyDown}
                                disabled={isConnected || isConnecting}
                                size="sm"
                            />
                        </Panel>
                    ) : (
                        <>
                            <Input
                                name="mcp-command"
                                placeholder="command (e.g. npx)"
                                value={s.command}
                                onChange={(v) => model.state.update((st) => { st.command = v; })}
                                onKeyDown={handleKeyDown}
                                disabled={isConnected || isConnecting}
                                size="sm"
                                width={160}
                            />
                            <Panel flex={1}>
                                <Input
                                    name="mcp-args"
                                    placeholder="args (e.g. -y @modelcontextprotocol/server-filesystem /path)"
                                    value={s.args}
                                    onChange={(v) => model.state.update((st) => { st.args = v; })}
                                    onKeyDown={handleKeyDown}
                                    disabled={isConnected || isConnecting}
                                    size="sm"
                                />
                            </Panel>
                        </>
                    )}

                    <Button
                        name="mcp-connect"
                        variant="default"
                        size="sm"
                        onClick={handleConnect}
                        disabled={isConnecting}
                    >
                        {isConnecting ? "Connecting…" : isConnected ? "Disconnect" : "Connect"}
                    </Button>
                </Panel>
            </EditorToolbar>

            {/* Error message */}
            {s.connectionStatus === "error" && s.errorMessage && (
                <Panel paddingX="lg" paddingY="xs" background="light" borderBottom>
                    <Text size="sm" color="error">{s.errorMessage}</Text>
                </Panel>
            )}

            {/* Server info bar (when connected) */}
            {isConnected && (
                <Panel
                    direction="row"
                    align="center"
                    gap="md"
                    paddingX="lg"
                    paddingY="xs"
                    borderBottom
                >
                    <Dot size="xs" color={dotColorFor(s.connectionStatus)} />
                    <Text size="sm" color="default" bold>{s.serverTitle || s.serverName}</Text>
                    {s.serverVersion && <Text size="sm" color="light">v{s.serverVersion}</Text>}
                    <Divider orientation="vertical" />
                    <SegmentedControl
                        name="mcp-panel-switch"
                        items={panelSegments}
                        value={s.activePanel}
                        onChange={(v) => model.setActivePanel(v as McpPanelId)}
                        size="sm"
                    />
                </Panel>
            )}

            {/* Body: panel content */}
            <Panel name="mcp-body" direction="row" flex={1} overflow="hidden" height={0}>
                {isConnected && s.activePanel === "info" && (
                    <ServerInfoPanel state={s} />
                )}
                {isConnected && s.activePanel === "tools" && (
                    <ToolsPanel model={model} />
                )}
                {isConnected && s.activePanel === "resources" && (
                    <ResourcesPanel model={model} />
                )}
                {isConnected && s.activePanel === "prompts" && (
                    <PromptsPanel model={model} />
                )}
                {isConnected && s.activePanel === "history" && (
                    <HistoryPanel model={model} />
                )}
                {!isConnected && (
                    <Panel flex={1} align="center" justify="center" overflow="auto">
                        {connections.length > 0 && s.connectionStatus === "disconnected" ? (
                            <Panel
                                direction="column"
                                width="100%"
                                maxWidth={560}
                                paddingX="xl"
                                gap="sm"
                            >
                                <Text size="base" color="default" bold>Saved Connections</Text>
                                {connections.map((c) => {
                                    const isActive = c.transport === s.transportType
                                        && (c.transport === "http" ? c.url === s.url : c.command === s.command && c.args === s.args);
                                    return (
                                        <Panel
                                            key={c.id}
                                            direction="row"
                                            align="center"
                                            gap="md"
                                            paddingX="lg"
                                            paddingY="sm"
                                            border
                                            rounded="md"
                                            borderColor={isActive ? "active" : "subtle"}
                                            background={isActive ? "light" : undefined}
                                            onClick={() => handleClickConnection(c.id)}
                                            revealChildrenOnHover
                                        >
                                            <Panel
                                                direction="column"
                                                flex={1}
                                                overflow="hidden"
                                                minWidth={0}
                                            >
                                                <Text size="sm" color="default" truncate>
                                                    {c.transport === "http" ? c.url : `${c.command} ${c.args}`}
                                                </Text>
                                            </Panel>
                                            <Tag size="sm" label={c.transport.toUpperCase()} />
                                            <IconButton
                                                icon="close"
                                                size="sm"
                                                title="Delete connection"
                                                hideUntilParentHover
                                                onClick={(e) => handleDeleteConnection(e, c.id)}
                                            />
                                        </Panel>
                                    );
                                })}
                                <Text size="xs" color="light">
                                    Click a connection to fill the connection bar, then click Connect.
                                </Text>
                            </Panel>
                        ) : (
                            <Panel
                                direction="column"
                                align="center"
                                gap="sm"
                                padding="xl"
                                maxWidth={560}
                            >
                                {s.connectionStatus === "disconnected" && (
                                    <Text size="sm" color="light" align="center">
                                        Enter a server URL or command above and click <b>Connect</b> to get started.
                                    </Text>
                                )}
                                {s.connectionStatus === "error" && (
                                    <Text size="sm" color="light" align="center">
                                        Connection failed. Check the URL and try again.
                                    </Text>
                                )}
                                {isConnecting && (
                                    <Text size="sm" color="light" align="center">Connecting…</Text>
                                )}
                            </Panel>
                        )}
                    </Panel>
                )}
            </Panel>
        </Panel>
    );
}

function ServerInfoPanel({ state }: { state: McpInspectorEditorState }) {
    const displayName = state.serverTitle || state.serverName;
    const handleWebsiteClick = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        if (state.serverWebsiteUrl) {
            import("../../api/pages").then(({ pagesModel }) =>
                pagesModel.openUrlInBrowserTab(state.serverWebsiteUrl),
            );
        }
    }, [state.serverWebsiteUrl]);

    return (
        <Panel
            direction="column"
            flex={1}
            overflow="auto"
            paddingX="xl"
            paddingY="lg"
            gap="lg"
        >
            <Panel direction="column" gap="xs">
                <Text size="xs" variant="uppercased" color="light" bold>Server Name</Text>
                <Text size="sm" color="default">{displayName}</Text>
            </Panel>
            {state.serverVersion && (
                <Panel direction="column" gap="xs">
                    <Text size="xs" variant="uppercased" color="light" bold>Version</Text>
                    <Text size="sm" color="default">{state.serverVersion}</Text>
                </Panel>
            )}
            {state.serverDescription && (
                <Panel direction="column" gap="xs">
                    <Text size="xs" variant="uppercased" color="light" bold>Description</Text>
                    <Text size="sm" color="default">{state.serverDescription}</Text>
                </Panel>
            )}
            {state.serverWebsiteUrl && (
                <Panel direction="column" gap="xs">
                    <Text size="xs" variant="uppercased" color="light" bold>Website</Text>
                    <Text size="sm" color="primary">
                        <a
                            href={state.serverWebsiteUrl}
                            onClick={handleWebsiteClick}
                            style={{ color: "inherit" }}
                        >
                            {state.serverWebsiteUrl}
                        </a>
                    </Text>
                </Panel>
            )}
            {state.instructions && (
                <Panel direction="column" gap="xs" flex={1}>
                    <Text size="xs" variant="uppercased" color="light" bold>Instructions</Text>
                    <Panel
                        flex={1}
                        border
                        rounded="md"
                        overflow="auto"
                        paddingX="lg"
                        paddingY="md"
                    >
                        <MarkdownBlock content={state.instructions} compact />
                    </Panel>
                </Panel>
            )}
        </Panel>
    );
}

function HistoryPanel({ model }: { model: McpInspectorEditorModel }) {
    const count = model.historyCount;

    const handleShow = useCallback(() => { model.showHistory(); }, [model]);
    const handleClear = useCallback(() => { model.clearHistory(); }, [model]);

    if (count === 0) {
        return (
            <Panel flex={1} align="center" justify="center">
                <Text size="sm" color="light">No requests recorded yet.</Text>
            </Panel>
        );
    }

    return (
        <Panel
            flex={1}
            direction="column"
            align="center"
            justify="center"
            gap="md"
        >
            <Text size="sm" color="light">
                {count} request{count !== 1 ? "s" : ""} recorded
            </Text>
            <Panel direction="row" gap="md">
                <Button variant="default" size="sm" onClick={handleShow}>
                    Open in Log View
                </Button>
                <Button variant="default" size="sm" onClick={handleClear}>
                    Clear
                </Button>
            </Panel>
        </Panel>
    );
}

export { McpInspectorView };

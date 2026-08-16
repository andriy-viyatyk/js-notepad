import { useCallback, useMemo, useRef, useState } from "react";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { Tag } from "../../uikit/Tag";
import { Button } from "../../uikit/Button";
import { Splitter } from "../../uikit/Splitter";
import { Spacer } from "../../uikit/Spacer";
import { ListBox, IListBoxItem } from "../../uikit/ListBox";
import { McpInspectorEditorModel } from "./McpInspectorEditorModel";
import { ToolArgForm } from "./ToolArgForm";
import { ToolResultView } from "./ToolResultView";

interface ToolsPanelProps {
    model: McpInspectorEditorModel;
}

export function ToolsPanel({ model }: ToolsPanelProps) {
    const ts = model.toolsState.use();
    const [sidebarWidth, setSidebarWidth] = useState(200);
    const [resultHeight, setResultHeight] = useState<number | null>(null);
    const detailRef = useRef<HTMLDivElement>(null);

    const selectedTool = ts.tools.find((t) => t.name === ts.selectedToolName) || null;

    const items = useMemo<IListBoxItem[]>(
        () => ts.tools.map((t) => ({ value: t.name, label: t.name })),
        [ts.tools],
    );
    const selectedItem = useMemo(
        () => items.find((it) => it.value === ts.selectedToolName) ?? null,
        [items, ts.selectedToolName],
    );

    const handleCallTool = useCallback(() => {
        model.callTool();
    }, [model]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter" && e.ctrlKey) {
            model.callTool();
        }
    }, [model]);

    // Compute clamped result height (10%-90% of container)
    const getClampedHeight = useCallback((h: number) => {
        const container = detailRef.current;
        if (!container) return h;
        const total = container.clientHeight;
        const min = total * 0.1;
        const max = total * 0.9;
        return Math.max(min, Math.min(max, h));
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

    const getInitialResultHeight = useCallback(() => {
        if (resultHeight !== null) return resultHeight;
        const container = detailRef.current;
        if (!container) return 200;
        return container.clientHeight * 0.3;
    }, [resultHeight]);

    const currentResultHeight = resultHeight ?? getInitialResultHeight();
    const topFlex = resultHeight !== null ? "1 1 auto" : "7 1 0";
    const bottomFlexProps = resultHeight !== null
        ? { height: currentResultHeight, flex: "0 0 auto" as const }
        : { flex: "3 1 0" as const, minHeight: 0 };

    return (
        <Panel name="mcp-tools-panel" direction="row" flex={1} overflow="hidden" onKeyDown={handleKeyDown}>
            {/* Sidebar */}
            <Panel name="mcp-tools-sidebar" direction="column" overflow="hidden" shrink={false} width={sidebarWidth}>
                <Panel
                    direction="row"
                    align="center"
                    justify="between"
                    paddingX="lg"
                    paddingY="md"
                    borderBottom
                    shrink={false}
                >
                    <Text size="xs" variant="uppercased" color="light" bold>Tools</Text>
                    <Tag size="sm" label={String(ts.tools.length)} />
                </Panel>
                <Panel direction="column" flex={1} overflow="hidden">
                    <ListBox<IListBoxItem>
                        name="mcp-tools-list"
                        items={items}
                        value={selectedItem}
                        onChange={(it) => model.selectTool(String(it.value))}
                        variant="browse"
                        selectionStyle="focus"
                        keyboardNav
                        getTooltip={(it) => String(it.value)}
                    />
                </Panel>
            </Panel>

            <Splitter
                name="mcp-tools-splitter"
                orientation="vertical"
                value={sidebarWidth}
                onChange={setSidebarWidth}
                side="before"
            />

            {/* Detail panel */}
            {selectedTool ? (
                <Panel name="mcp-tools-detail" direction="column" flex={1} overflow="hidden" ref={detailRef}>
                    {/* Top: tool name + args (scrollable) */}
                    <Panel
                        direction="column"
                        overflow="hidden"
                        height={0}
                        flex={topFlex}
                    >
                        <Panel
                            direction="row"
                            align="center"
                            gap="md"
                            paddingX="xl"
                            paddingY="sm"
                            borderBottom
                            shrink={false}
                            background="dark"
                            onDoubleClick={handleTopHeaderDblClick}
                        >
                            <Text size="base" color="default" bold>{selectedTool.name}</Text>
                            {selectedTool.annotations && (
                                <Panel direction="row" gap="sm" shrink={false}>
                                    {selectedTool.annotations.readOnlyHint && (
                                        <Tag size="sm" label="read-only" />
                                    )}
                                    {selectedTool.annotations.destructiveHint && (
                                        <Tag
                                            size="sm"
                                            label="destructive"
                                            tone="error"
                                        />
                                    )}
                                </Panel>
                            )}
                        </Panel>
                        <Panel
                            direction="column"
                            flex={1}
                            overflow="auto"
                            padding="lg"
                            gap="lg"
                        >
                            {selectedTool.description && (
                                <Text size="sm" color="light">{selectedTool.description}</Text>
                            )}
                            <Panel borderBottom paddingBottom="xs">
                                <Text size="xs" variant="uppercased" color="light" bold>Arguments</Text>
                            </Panel>
                            <ToolArgForm
                                schema={selectedTool.inputSchema}
                                args={ts.toolArgs}
                                onArgChange={model.setToolArg}
                                disabled={ts.toolCallLoading}
                            />
                        </Panel>
                    </Panel>

                    {/* Horizontal splitter */}
                    <Splitter
                        name="mcp-tools-result-splitter"
                        orientation="horizontal"
                        value={currentResultHeight}
                        onChange={handleResultHeightChange}
                        side="after"
                        border="before"
                    />

                    {/* Bottom: result */}
                    <Panel
                        direction="column"
                        overflow="hidden"
                        {...bottomFlexProps}
                    >
                        <Panel
                            direction="row"
                            align="center"
                            gap="md"
                            paddingX="lg"
                            paddingY="xs"
                            borderBottom
                            shrink={false}
                            background="dark"
                            onDoubleClick={handleBottomHeaderDblClick}
                        >
                            <Text size="xs" variant="uppercased" color="light" bold>Result</Text>
                            {ts.toolResult && (
                                <>
                                    <Tag size="sm" label={`${ts.toolResult.durationMs}ms`} />
                                    {ts.toolResult.isError && (
                                        <Text size="xs" color="error">Error</Text>
                                    )}
                                </>
                            )}
                            <Spacer />
                            <Button
                                name="mcp-call-tool"
                                variant="primary"
                                size="sm"
                                onClick={handleCallTool}
                                disabled={ts.toolCallLoading}
                            >
                                {ts.toolCallLoading ? "Calling…" : "▶ Call Tool"}
                            </Button>
                        </Panel>
                        <Panel
                            direction="column"
                            flex={1}
                            overflow="hidden"
                            paddingX="lg"
                            paddingY="md"
                        >
                            {ts.toolResult ? (
                                <ToolResultView result={ts.toolResult} />
                            ) : (
                                <Panel flex={1} align="center" justify="center">
                                    <Text size="sm" color="light">
                                        Click "Call Tool" to execute.
                                    </Text>
                                </Panel>
                            )}
                        </Panel>
                    </Panel>
                </Panel>
            ) : (
                <Panel flex={1} align="center" justify="center" overflow="auto">
                    <Text size="md" color="light">
                        {ts.tools.length === 0
                            ? "No tools available on this server."
                            : "Select a tool from the sidebar."}
                    </Text>
                </Panel>
            )}
        </Panel>
    );
}

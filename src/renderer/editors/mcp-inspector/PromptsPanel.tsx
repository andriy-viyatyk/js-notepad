import { useCallback, useState } from "react";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { Tag } from "../../uikit/Tag";
import { Button } from "../../uikit/Button";
import { Splitter } from "../../uikit/Splitter";
import { Textarea } from "../../uikit/Textarea";
import { McpInspectorEditorModel, McpPromptMessage } from "./McpInspectorEditorModel";

interface PromptsPanelProps {
    model: McpInspectorEditorModel;
}

export function PromptsPanel({ model }: PromptsPanelProps) {
    const ps = model.promptsState.use();
    const [sidebarWidth, setSidebarWidth] = useState(220);

    const selectedPrompt = ps.prompts.find((p) => p.name === ps.selectedPromptName) || null;

    const handleGetPrompt = useCallback(() => {
        model.getPrompt();
    }, [model]);

    return (
        <Panel name="mcp-prompts-panel" direction="row" flex={1} overflow="hidden">
            {/* Sidebar */}
            <Panel name="mcp-prompts-sidebar" direction="column" overflow="hidden" shrink={false} width={sidebarWidth}>
                <Panel
                    direction="row"
                    align="center"
                    justify="between"
                    paddingX="lg"
                    paddingY="md"
                    borderBottom
                    shrink={false}
                >
                    <Text size="xs" variant="uppercased" color="light" bold>Prompts</Text>
                    <Tag size="sm" label={String(ps.prompts.length)} />
                </Panel>
                <Panel direction="column" flex={1} overflow="auto">
                    {ps.prompts.map((p) => {
                        const isSelected = p.name === ps.selectedPromptName;
                        return (
                            <Panel
                                key={p.name}
                                direction="column"
                                paddingX="lg"
                                paddingY="sm"
                                gap="xs"
                                borderBottom
                                borderColor={isSelected ? "active" : "subtle"}
                                background={isSelected ? "light" : undefined}
                                onClick={() => model.selectPrompt(p.name)}
                                title={p.name}
                            >
                                <Text size="sm" color="default" truncate>{p.name}</Text>
                                {p.description && (
                                    <Text size="xs" color="light" truncate>{p.description}</Text>
                                )}
                            </Panel>
                        );
                    })}
                </Panel>
            </Panel>

            <Splitter
                name="mcp-prompts-splitter"
                orientation="vertical"
                value={sidebarWidth}
                onChange={setSidebarWidth}
                side="before"
            />

            {/* Detail */}
            {selectedPrompt ? (
                <Panel direction="column" flex={1} overflow="hidden">
                    <Panel
                        direction="column"
                        overflow="auto"
                        padding="xl"
                        gap="lg"
                        shrink={false}
                    >
                        <Text size="lg" color="default" bold>{selectedPrompt.name}</Text>
                        {selectedPrompt.description && (
                            <Text size="sm" color="light">{selectedPrompt.description}</Text>
                        )}

                        <Panel borderBottom paddingBottom="xs">
                            <Text size="xs" variant="uppercased" color="light" bold>Arguments</Text>
                        </Panel>
                        {selectedPrompt.arguments.length === 0 ? (
                            <Text size="sm" color="light" italic>No arguments</Text>
                        ) : (
                            selectedPrompt.arguments.map((arg) => (
                                <Panel direction="column" gap="xs" key={arg.name}>
                                    <Panel direction="row" gap="md" align="center">
                                        <Text size="sm" color="default">{arg.name}</Text>
                                        {arg.required && <Text size="xs" color="error">required</Text>}
                                    </Panel>
                                    <Textarea
                                        value={ps.promptArgs[arg.name] || ""}
                                        onChange={(v) => model.setPromptArg(arg.name, v)}
                                        placeholder={arg.description || ""}
                                        readOnly={ps.getPromptLoading}
                                        size="sm"
                                    />
                                    {arg.description && (
                                        <Text size="xs" color="light">{arg.description}</Text>
                                    )}
                                </Panel>
                            ))
                        )}

                        <Panel>
                            <Button
                                name="mcp-get-prompt"
                                variant="primary"
                                size="sm"
                                onClick={handleGetPrompt}
                                disabled={ps.getPromptLoading}
                            >
                                {ps.getPromptLoading ? "Loading…" : "Get Prompt"}
                            </Button>
                        </Panel>

                        {ps.promptError && (
                            <Text size="sm" color="error">{ps.promptError}</Text>
                        )}
                    </Panel>

                    {/* Messages */}
                    {ps.promptMessages && ps.promptMessages.length > 0 && (
                        <Panel
                            direction="column"
                            flex={1}
                            overflow="auto"
                            paddingX="xl"
                            paddingBottom="xl"
                            gap="md"
                            height={0}
                        >
                            <Panel borderBottom paddingBottom="xs">
                                <Text size="xs" variant="uppercased" color="light" bold>Messages</Text>
                            </Panel>
                            {ps.promptMessages.map((msg, i) => (
                                <MessageView key={i} message={msg} />
                            ))}
                        </Panel>
                    )}
                </Panel>
            ) : (
                <Panel flex={1} align="center" justify="center" overflow="auto">
                    <Text size="md" color="light">
                        {ps.prompts.length === 0
                            ? "No prompts available on this server."
                            : "Select a prompt from the sidebar."}
                    </Text>
                </Panel>
            )}
        </Panel>
    );
}

function MessageView({ message }: { message: McpPromptMessage }) {
    return (
        <Panel direction="column" paddingY="md" borderBottom gap="sm">
            <Panel direction="row">
                <Tag
                    size="sm"
                    label={message.role.toUpperCase()}
                    tone={message.role === "assistant" ? "success" : "default"}
                />
            </Panel>
            {message.content.map((block, i) => (
                <MessageContentBlock key={i} block={block} />
            ))}
        </Panel>
    );
}

function MessageContentBlock({ block }: { block: McpPromptMessage["content"][number] }) {
    if (block.type === "text") {
        return <Text size="sm" color="default" preWrap>{block.text}</Text>;
    }
    if (block.type === "image") {
        return (
            <Panel border rounded="md" overflow="hidden">
                <img
                    src={`data:${block.mimeType};base64,${block.data}`}
                    alt="Prompt content"
                    style={{ maxWidth: "100%" }}
                />
            </Panel>
        );
    }
    if (block.type === "resource") {
        return (
            <Panel direction="column" gap="xs">
                <Text size="xs" color="primary">{block.resource.uri}</Text>
                {block.resource.text && (
                    <Text size="sm" color="default" preWrap>{block.resource.text}</Text>
                )}
            </Panel>
        );
    }
    if (block.type === "resource_link") {
        return <Text size="xs" color="primary">{block.name || block.uri}</Text>;
    }
    return null;
}

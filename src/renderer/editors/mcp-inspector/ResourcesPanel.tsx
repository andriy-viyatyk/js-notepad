import { useCallback, useMemo, useState } from "react";
import { Panel } from "../../uikit/Panel";
import { SelectableRow } from "../../uikit/SelectableRow";
import { Text } from "../../uikit/Text";
import { Tag } from "../../uikit/Tag";
import { Button } from "../../uikit/Button";
import { Splitter } from "../../uikit/Splitter";
import { Textarea } from "../../uikit/Textarea";
import { McpInspectorEditorModel, extractTemplateParams } from "./McpInspectorEditorModel";
import { ResourceContentView } from "./ResourceContentView";

interface ResourcesPanelProps {
    model: McpInspectorEditorModel;
}

export function ResourcesPanel({ model }: ResourcesPanelProps) {
    const rs = model.resourcesState.use();
    const [sidebarWidth, setSidebarWidth] = useState(260);

    const selectedRes = rs.resources.find((r) => r.uri === rs.selectedUri) || null;
    const selectedTmpl = rs.templates.find((t) => t.uriTemplate === rs.selectedTemplateUri) || null;
    const templateParams = useMemo(
        () => selectedTmpl ? extractTemplateParams(selectedTmpl.uriTemplate) : [],
        [selectedTmpl],
    );

    const handleRead = useCallback(() => {
        model.readResource();
    }, [model]);

    const handleReadTemplate = useCallback(() => {
        model.readTemplateResource();
    }, [model]);

    const totalCount = rs.resources.length + rs.templates.length;

    return (
        <Panel name="mcp-resources-panel" direction="row" flex={1} overflow="hidden">
            {/* Sidebar */}
            <Panel name="mcp-resources-sidebar" direction="column" overflow="hidden" shrink={false} width={sidebarWidth}>
                <Panel
                    direction="row"
                    align="center"
                    justify="between"
                    paddingX="lg"
                    paddingY="md"
                    borderBottom
                    shrink={false}
                >
                    <Text size="xs" variant="uppercased" color="light" bold>Resources</Text>
                    <Tag size="sm" label={String(totalCount)} />
                </Panel>
                <Panel
                    direction="column"
                    flex={1}
                    overflow="auto"
                    tabIndex={0}
                    data-focus-selection=""
                >
                    {rs.resources.map((r) => {
                        const isSelected = r.uri === rs.selectedUri;
                        return (
                            <SelectableRow
                                key={r.uri}
                                selected={isSelected}
                                onClick={() => model.selectResource(r.uri)}
                            >
                                <Panel
                                    direction="column"
                                    paddingX="lg"
                                    paddingY="sm"
                                    gap="xs"
                                    borderBottom
                                    borderColor="subtle"
                                    title={r.uri}
                                    flex={1}
                                    minWidth={0}
                                >
                                    <Text size="sm" color="default" truncate>{r.name}</Text>
                                    <Text size="xs" color="primary" truncate>{r.uri}</Text>
                                </Panel>
                            </SelectableRow>
                        );
                    })}
                    {rs.templates.length > 0 && (
                        <>
                            <Panel
                                paddingX="lg"
                                paddingY="sm"
                                borderBottom
                                background="dark"
                                shrink={false}
                            >
                                <Text size="xs" variant="uppercased" color="light" bold>Templates</Text>
                            </Panel>
                            {rs.templates.map((t) => {
                                const isSelected = t.uriTemplate === rs.selectedTemplateUri;
                                return (
                                    <SelectableRow
                                        key={t.uriTemplate}
                                        selected={isSelected}
                                        onClick={() => model.selectTemplate(t.uriTemplate)}
                                    >
                                        <Panel
                                            direction="column"
                                            paddingX="lg"
                                            paddingY="sm"
                                            gap="xs"
                                            borderBottom
                                            borderColor="subtle"
                                            title={t.uriTemplate}
                                            flex={1}
                                            minWidth={0}
                                        >
                                            <Text size="sm" color="default" truncate>{t.name}</Text>
                                            <Text size="xs" color="primary" truncate>{t.uriTemplate}</Text>
                                        </Panel>
                                    </SelectableRow>
                                );
                            })}
                        </>
                    )}
                </Panel>
            </Panel>

            <Splitter
                name="mcp-resources-splitter"
                orientation="vertical"
                value={sidebarWidth}
                onChange={setSidebarWidth}
                side="before"
            />

            {/* Detail — static resource */}
            {selectedRes ? (
                <Panel direction="column" flex={1} overflow="hidden">
                    <Panel direction="column" padding="xl" gap="md" shrink={false}>
                        <Text size="lg" color="default" bold>{selectedRes.name}</Text>
                        <Panel wordBreak="break-all">
                            <Text size="sm" color="primary">{selectedRes.uri}</Text>
                        </Panel>
                        {selectedRes.description && (
                            <Text size="sm" color="light">{selectedRes.description}</Text>
                        )}
                        {selectedRes.mimeType && (
                            <Panel direction="row">
                                <Tag size="sm" label={selectedRes.mimeType} />
                            </Panel>
                        )}
                        <Panel direction="row">
                            <Button
                                name="mcp-read-resource"
                                variant="primary"
                                size="sm"
                                onClick={handleRead}
                                disabled={rs.readLoading}
                            >
                                {rs.readLoading ? "Reading…" : "▶ Read Resource"}
                            </Button>
                        </Panel>
                        {rs.readError && (
                            <Text size="sm" color="error">{rs.readError}</Text>
                        )}
                    </Panel>

                    {rs.readContent && (
                        <Panel
                            direction="column"
                            flex={1}
                            overflowY="auto"
                            paddingX="xl"
                            paddingBottom="xl"
                            height={0}
                        >
                            <ResourceContentView content={rs.readContent} />
                        </Panel>
                    )}
                </Panel>

            /* Detail — resource template */
            ) : selectedTmpl ? (
                <Panel direction="column" flex={1} overflow="hidden">
                    <Panel direction="column" padding="xl" gap="md" shrink={false}>
                        <Text size="lg" color="default" bold>{selectedTmpl.name}</Text>
                        <Panel wordBreak="break-all">
                            <Text size="sm" color="primary">{selectedTmpl.uriTemplate}</Text>
                        </Panel>
                        {selectedTmpl.description && (
                            <Text size="sm" color="light">{selectedTmpl.description}</Text>
                        )}
                        {selectedTmpl.mimeType && (
                            <Panel direction="row">
                                <Tag size="sm" label={selectedTmpl.mimeType} />
                            </Panel>
                        )}

                        <Panel borderBottom paddingBottom="xs">
                            <Text size="xs" variant="uppercased" color="light" bold>Parameters</Text>
                        </Panel>
                        {templateParams.length === 0 ? (
                            <Text size="sm" color="light" italic>No parameters</Text>
                        ) : (
                            templateParams.map((param) => (
                                <Panel direction="column" gap="xs" key={param}>
                                    <Text size="sm" color="default">{param}</Text>
                                    <Textarea
                                        value={rs.templateArgs[param] || ""}
                                        onChange={(v) => model.setTemplateArg(param, v)}
                                        placeholder={param}
                                        readOnly={rs.templateReadLoading}
                                        size="sm"
                                    />
                                </Panel>
                            ))
                        )}

                        <Panel direction="row">
                            <Button
                                name="mcp-read-template"
                                variant="primary"
                                size="sm"
                                onClick={handleReadTemplate}
                                disabled={rs.templateReadLoading}
                            >
                                {rs.templateReadLoading ? "Reading…" : "▶ Read Resource"}
                            </Button>
                        </Panel>
                        {rs.templateReadError && (
                            <Text size="sm" color="error">{rs.templateReadError}</Text>
                        )}
                    </Panel>

                    {rs.templateReadContent && (
                        <Panel
                            direction="column"
                            flex={1}
                            overflowY="auto"
                            paddingX="xl"
                            paddingBottom="xl"
                            height={0}
                        >
                            <ResourceContentView content={rs.templateReadContent} />
                        </Panel>
                    )}
                </Panel>
            ) : (
                <Panel flex={1} align="center" justify="center" overflow="auto">
                    <Text size="md" color="light">
                        {totalCount === 0
                            ? "No resources available on this server."
                            : "Select a resource from the sidebar."}
                    </Text>
                </Panel>
            )}
        </Panel>
    );
}

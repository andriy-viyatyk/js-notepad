import { useState } from "react";
import { McpRequestEntry } from "../logTypes";
import { ColorizedCode } from "../../shared/ColorizedCode";
import { Divider, IconButton, Panel, Spacer, Text } from "../../../uikit";
import { ChevronDownIcon, ChevronRightIcon } from "../../../theme/icons";

// =============================================================================
// Component
// =============================================================================

interface McpRequestViewProps {
    entry: McpRequestEntry;
}

/** Extract a short informative detail string from request method + params. */
function getDetail(method: string, params: unknown): string {
    if (!params || typeof params !== "object") return "";
    const p = params as Record<string, unknown>;
    const str = (key: string): string => (typeof p[key] === "string" ? p[key] as string : "");
    if (method === "tools/call") return str("name");
    if (method === "resources/read") return str("uri");
    if (method === "prompts/get") return str("name");
    if (method === "create_page") return str("title");
    if (method === "set_page_content") return str("title") || str("id");
    if (method === "get_page_content") return str("title") || str("id");
    if (method === "open_url") return str("url");
    for (const key of ["title", "name", "url", "uri", "id", "path"]) {
        const v = p[key];
        if (typeof v === "string" && v.length > 0) return v;
    }
    return "";
}

export function McpRequestView({ entry }: McpRequestViewProps) {
    const [expanded, setExpanded] = useState(false);

    const detail = getDetail(entry.method, entry.params);
    const hasError = !!entry.error;

    const toggle = () => setExpanded((v) => !v);

    return (
        <Panel name="log-mcp-request" direction="column">
            <div
                onClick={toggle}
                style={{ cursor: "pointer", userSelect: "none" }}
            >
                <Panel
                    name="log-mcp-header"
                    direction="row"
                    align="center"
                    gap="md"
                    paddingX="md"
                    paddingY="xs"
                >
                    <IconButton
                        name="log-mcp-toggle"
                        size="sm"
                        icon={expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                        onClick={(e) => { e.stopPropagation(); toggle(); }}
                    />
                    <Text size="md" bold>{entry.method}</Text>
                    {detail
                        ? <Text size="md" color="light" truncate>{detail}</Text>
                        : <Spacer />}
                    {hasError && <Text size="sm" color="error" bold>ERROR</Text>}
                    <Text size="xs" color="light">{entry.durationMs}ms</Text>
                </Panel>
            </div>

            {expanded && (
                <Panel
                    name="log-mcp-card"
                    direction="column"
                    border
                    rounded="md"
                    overflow="hidden"
                    paddingLeft="xxl"
                >
                    <Panel name="log-mcp-request-section" direction="column">
                        <Panel background="dark" paddingX="lg" paddingY="xs">
                            <Text size="xs" color="light" variant="uppercased" bold>Request</Text>
                        </Panel>
                        <Panel maxHeight={180} overflowY="auto">
                            {entry.params != null ? (
                                <ColorizedCode
                                    code={JSON.stringify(entry.params, null, 2)}
                                    language="json"
                                    tabSize={2}
                                />
                            ) : (
                                <Panel paddingX="lg" paddingY="sm">
                                    <Text size="sm" color="light">(no params)</Text>
                                </Panel>
                            )}
                        </Panel>
                    </Panel>
                    <Divider />
                    <Panel name="log-mcp-response-section" direction="column">
                        <Panel background="dark" paddingX="lg" paddingY="xs">
                            <Text size="xs" color="light" variant="uppercased" bold>Response</Text>
                        </Panel>
                        <Panel maxHeight={180} overflowY="auto">
                            {hasError ? (
                                <Panel paddingX="lg" paddingY="sm">
                                    <Text size="sm" color="error">{entry.error}</Text>
                                </Panel>
                            ) : entry.result != null ? (
                                <ColorizedCode
                                    code={JSON.stringify(entry.result, null, 2)}
                                    language="json"
                                    tabSize={2}
                                />
                            ) : (
                                <Panel paddingX="lg" paddingY="sm">
                                    <Text size="sm" color="light">(no result)</Text>
                                </Panel>
                            )}
                        </Panel>
                    </Panel>
                </Panel>
            )}
        </Panel>
    );
}

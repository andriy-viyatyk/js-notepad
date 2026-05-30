import { useMemo } from "react";
import { Editor } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { McpToolResult } from "./McpInspectorEditorModel";

const EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
    automaticLayout: true,
    readOnly: true,
    domReadOnly: true,
    minimap: { enabled: false },
    lineNumbers: "off",
    scrollBeyondLastLine: false,
    wordWrap: "on",
    folding: false,
    renderLineHighlight: "none",
    overviewRulerLanes: 0,
    padding: { top: 4, bottom: 4 },
    scrollbar: { alwaysConsumeMouseWheel: false },
};

function detectLanguage(text: string): string {
    const trimmed = text.trimStart();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
            JSON.parse(text);
            return "json";
        } catch { /* not valid JSON */ }
    }
    return "plaintext";
}

interface ToolResultViewProps {
    result: McpToolResult;
}

export function ToolResultView({ result }: ToolResultViewProps) {
    return (
        <Panel direction="column" gap="xs" flex={1} overflow="hidden">
            {result.content.map((item, i) => (
                <ResultItem key={i} item={item} isError={result.isError} />
            ))}
        </Panel>
    );
}

function ResultItem({ item, isError }: { item: McpToolResult["content"][number]; isError?: boolean }) {
    if (item.type === "text") {
        return <TextResult text={item.text} isError={isError} />;
    }
    if (item.type === "image") {
        return (
            <Panel border rounded="md" overflow="hidden">
                <img
                    src={`data:${item.mimeType};base64,${item.data}`}
                    alt="Tool result"
                    style={{ maxWidth: "100%" }}
                />
            </Panel>
        );
    }
    if (item.type === "resource") {
        return (
            <Panel direction="column" gap="xs">
                <Text size="xs" color="primary">{item.resource.uri}</Text>
                {item.resource.text && <TextResult text={item.resource.text} />}
            </Panel>
        );
    }
    if (item.type === "resource_link") {
        return (
            <Text size="sm" color="primary" title={item.uri}>
                {item.name || item.uri}
            </Text>
        );
    }
    return null;
}

function TextResult({ text, isError }: { text: string; isError?: boolean }) {
    const language = useMemo(() => detectLanguage(text), [text]);

    return (
        <Panel
            border
            borderColor={isError ? "active" : "subtle"}
            rounded="md"
            overflow="hidden"
            flex={1}
            minHeight={40}
        >
            <Editor
                value={text}
                language={language}
                theme="custom-dark"
                options={EDITOR_OPTIONS}
            />
        </Panel>
    );
}

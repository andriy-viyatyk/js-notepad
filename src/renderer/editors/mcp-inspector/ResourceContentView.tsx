import { MouseEvent as ReactMouseEvent } from "react";
import { Editor } from "@monaco-editor/react";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { MarkdownBlock } from "../markdown/MarkdownBlock";
import { ui } from "../../api/ui";
import { McpResourceContent } from "./McpInspectorEditorModel";

const EDITOR_OPTIONS: any = {
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

function mimeToLanguage(mimeType: string): string | null {
    const m = mimeType.toLowerCase();
    if (m === "application/json" || m.endsWith("+json")) return "json";
    if (m === "text/html" || m === "application/xhtml+xml") return "html";
    if (m === "text/css") return "css";
    if (m === "text/javascript" || m === "application/javascript") return "javascript";
    if (m === "text/typescript" || m === "application/typescript") return "typescript";
    if (m === "text/yaml" || m === "application/yaml" || m === "application/x-yaml") return "yaml";
    if (m === "text/xml" || m === "application/xml" || m.endsWith("+xml")) return "xml";
    if (m.startsWith("text/")) return "plaintext";
    return null;
}

interface ResourceContentViewProps {
    content: McpResourceContent;
}

/**
 * Block clicks on relative links inside MCP-resource markdown.
 *
 * MCP resources are keyed by URI (e.g. `test://static/resource/architecture.md`),
 * not by filesystem path, so a sibling reference like `[X](structure.md)` has
 * no anchoring base Persephone can fetch. Letting the browser resolve such
 * hrefs ends up navigating against the renderer origin (in dev:
 * `http://localhost:5173/structure.md`), which Vite answers with the SPA
 * fallback — opening a junk Persephone page. Absolute schemes (`http://`,
 * `https://`, `mailto:`, `#fragment`, `//host`) are still allowed through and
 * flow into the normal `openRawLink` pipeline.
 */
const ABSOLUTE_HREF_RE = /^([a-z][a-z0-9+.-]*:|#|\/\/)/i;

function onMarkdownClickCapture(e: ReactMouseEvent): void {
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href") || "";
    if (!href || ABSOLUTE_HREF_RE.test(href)) return;
    e.preventDefault();
    e.stopPropagation();
    ui.notify(
        `Relative link "${href}" cannot be resolved — MCP resources have no filesystem base.`,
        "info",
    );
}

export function ResourceContentView({ content }: ResourceContentViewProps) {
    const mime = content.mimeType || "";

    if (content.text !== undefined) {
        if (mime === "text/markdown" || mime === "text/x-markdown") {
            return (
                <Panel
                    direction="column"
                    flex={1}
                    overflow="auto"
                    border
                    rounded="md"
                    paddingX="lg"
                    paddingY="md"
                    height={0}
                    onClickCapture={onMarkdownClickCapture}
                >
                    <MarkdownBlock content={content.text} compact />
                </Panel>
            );
        }

        const language = mimeToLanguage(mime) || "plaintext";
        return (
            <Panel
                direction="column"
                flex={1}
                overflow="hidden"
                border
                rounded="md"
                height={0}
            >
                <Editor
                    value={content.text}
                    language={language}
                    theme="custom-dark"
                    options={EDITOR_OPTIONS}
                />
            </Panel>
        );
    }

    if (content.blob) {
        if (mime.startsWith("image/")) {
            return (
                <Panel border rounded="md" overflow="auto" flex={1} height={0}>
                    <img
                        src={`data:${mime};base64,${content.blob}`}
                        alt={content.uri}
                        style={{ maxWidth: "100%" }}
                    />
                </Panel>
            );
        }

        const sizeKb = Math.round((content.blob.length * 3) / 4 / 1024);
        return (
            <Panel padding="md" rounded="md" border background="light">
                <Text size="sm" color="light">
                    Binary content: {mime || "unknown type"} ({sizeKb} KB)
                </Text>
            </Panel>
        );
    }

    return (
        <Panel padding="md" rounded="md" border background="light">
            <Text size="sm" color="light">No content.</Text>
        </Panel>
    );
}

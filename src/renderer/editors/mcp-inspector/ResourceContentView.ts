import type { editor } from "monaco-editor";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { ui } from "../../api/ui";
import { MarkdownBlockView } from "../markdown/MarkdownBlockView";
import { MonacoEditorHostView } from "../shared/MonacoEditorHostView";
import type { McpResourceContent } from "./McpInspectorEditorModel";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Text/Text.css";
import "../markdown/MarkdownBlock.css";
import "./mcp-inspector.css";

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

function mimeToLanguage(mimeType: string): string | null {
    const mime = mimeType.toLowerCase();
    if (mime === "application/json" || mime.endsWith("+json")) return "json";
    if (mime === "text/html" || mime === "application/xhtml+xml") return "html";
    if (mime === "text/css") return "css";
    if (mime === "text/javascript" || mime === "application/javascript") return "javascript";
    if (mime === "text/typescript" || mime === "application/typescript") return "typescript";
    if (mime === "text/yaml" || mime === "application/yaml" || mime === "application/x-yaml") return "yaml";
    if (mime === "text/xml" || mime === "application/xml" || mime.endsWith("+xml")) return "xml";
    if (mime.startsWith("text/")) return "plaintext";
    return null;
}

const ABSOLUTE_HREF_RE = /^([a-z][a-z0-9+.-]*:|#|\/\/)/i;

export interface ResourceContentViewProps {
    content: McpResourceContent;
}

export class ResourceContentView extends VanillaView<ResourceContentViewProps> {
    private markdown: MarkdownBlockView | undefined;
    private editor: MonacoEditorHostView | undefined;

    public constructor(props: ResourceContentViewProps) {
        super(props, createPanelElement({ direction: "column", flex: true, overflow: "hidden" }));
        this.root.dataset.type = "mcp-resource-content";
    }

    protected onMount(): void {
        this.listen(this.root, "click", this.onMarkdownClickCapture, { capture: true });
        this.renderContent(this.props.content);
    }

    protected onUpdate(props: ResourceContentViewProps): void {
        this.disposeContent();
        this.renderContent(props.content);
    }

    protected onDispose(): void {
        this.disposeContent();
        this.root.replaceChildren();
    }

    private renderContent(content: McpResourceContent): void {
        const mime = content.mimeType || "";
        if (content.text !== undefined) {
            if (mime === "text/markdown" || mime === "text/x-markdown") {
                const panel = createPanelElement({
                    direction: "column",
                    flex: true,
                    overflow: "auto",
                    border: true,
                    rounded: "md",
                    paddingX: "lg",
                    paddingY: "md",
                    height: 0,
                });
                this.markdown = this.child(new MarkdownBlockView({ content: content.text, compact: true }));
                panel.append(this.markdown.root);
                this.markdown.mount();
                this.root.append(panel);
                return;
            }

            const panel = createPanelElement({
                direction: "column",
                flex: true,
                overflow: "hidden",
                border: true,
                rounded: "md",
                height: 0,
            });
            this.editor = this.child(new MonacoEditorHostView({
                initialValue: content.text,
                language: mimeToLanguage(mime) || "plaintext",
                options: EDITOR_OPTIONS,
            }));
            panel.append(this.editor.root);
            this.editor.mount();
            this.root.append(panel);
            return;
        }

        if (content.blob) {
            if (mime.startsWith("image/")) {
                const panel = createPanelElement({ border: true, rounded: "md", overflow: "auto", flex: true, height: 0 });
                const image = document.createElement("img");
                image.className = "mcp-content-image";
                image.src = `data:${mime};base64,${content.blob}`;
                image.alt = content.uri;
                panel.append(image);
                this.root.append(panel);
                return;
            }

            const sizeKb = Math.round((content.blob.length * 3) / 4 / 1024);
            this.root.append(createPanelElement({ padding: "md", rounded: "md", border: true, background: "light" }, [
                createTextElement(`Binary content: ${mime || "unknown type"} (${sizeKb} KB)`, { size: "sm", color: "light" }),
            ]));
            return;
        }

        this.root.append(createPanelElement({ padding: "md", rounded: "md", border: true, background: "light" }, [
            createTextElement("No content.", { size: "sm", color: "light" }),
        ]));
    }

    private readonly onMarkdownClickCapture = (event: MouseEvent): void => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const anchor = target.closest("a");
        if (!anchor) return;
        const href = anchor.getAttribute("href") || "";
        if (!href || ABSOLUTE_HREF_RE.test(href)) return;
        event.preventDefault();
        event.stopPropagation();
        ui.notify(
            `Relative link "${href}" cannot be resolved — MCP resources have no filesystem base.`,
            "info",
        );
    };

    private disposeContent(): void {
        if (this.markdown) {
            this.releaseChild(this.markdown);
        }
        if (this.editor) {
            this.releaseChild(this.editor);
        }
        this.markdown = undefined;
        this.editor = undefined;
        this.root.replaceChildren();
    }
}

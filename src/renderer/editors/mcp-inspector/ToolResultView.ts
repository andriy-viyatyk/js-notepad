import type { editor } from "monaco-editor";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { KeyedList } from "../../uikit/shared/keyed-list";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { MonacoEditorHostView } from "../shared/MonacoEditorHostView";
import type { McpToolResult, McpToolResultContent } from "./McpInspectorEditorModel";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Text/Text.css";
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

function detectLanguage(value: string): string {
    const trimmed = value.trimStart();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
            JSON.parse(value);
            return "json";
        } catch {
            // Plain text that starts like JSON remains plaintext.
        }
    }
    return "plaintext";
}

export interface ToolResultViewProps {
    result: McpToolResult;
}

export class ToolResultView extends VanillaView<ToolResultViewProps> {
    private list: KeyedList<IndexedResult, number, HTMLElement> | undefined;

    public constructor(props: ToolResultViewProps) {
        super(props, createPanelElement({ direction: "column", gap: "xs", flex: true, overflow: "hidden" }));
        this.root.dataset.type = "mcp-tool-result";
    }

    protected onMount(): void {
        this.list = new KeyedList(this.root, {
            keyOf: (entry) => entry.key,
            create: (entry) => {
                const view = new ResultItemView({
                    item: entry.item,
                    isError: this.props.result.isError,
                });
                view.mount();
                return view.root;
            },
            update: (element, entry) => {
                (element as ResultItemViewRoot).view?.update({
                    item: entry.item,
                    isError: this.props.result.isError,
                });
            },
            remove: (element) => {
                (element as ResultItemViewRoot).view?.dispose();
            },
        });
        this.own(() => this.list?.dispose());
        this.updateList(this.props.result);
    }

    protected onUpdate(props: ToolResultViewProps): void {
        this.updateList(props.result);
    }

    private updateList(result: McpToolResult): void {
        this.list?.update(result.content.map((item, key) => ({ item, key })));
    }
}

interface IndexedResult {
    item: McpToolResultContent;
    key: number;
}

interface ResultItemViewProps {
    item: McpToolResultContent;
    isError?: boolean;
}

type ResultItemViewRoot = HTMLElement & { view?: ResultItemView };

class ResultItemView extends VanillaView<ResultItemViewProps> {
    private readonly textViews = new Set<TextResultView>();

    public constructor(props: ResultItemViewProps) {
        super(props, createPanelElement({ direction: "column", gap: "xs" }));
        this.root.dataset.type = "mcp-tool-result-item";
        (this.root as ResultItemViewRoot).view = this;
    }

    protected onMount(): void {
        this.renderItem(this.props);
    }

    protected onUpdate(props: ResultItemViewProps): void {
        this.disposeContent();
        this.renderItem(props);
    }

    protected onDispose(): void {
        this.disposeContent();
        delete (this.root as ResultItemViewRoot).view;
    }

    private renderItem(props: ResultItemViewProps): void {
        const { item, isError } = props;
        // Only an item that hosts a Monaco editor grows to fill the RESULT panel; an image or a
        // resource link keeps its natural size, so a one-line link never claims half the panel.
        if (item.type === "text") {
            this.root.dataset.grow = "true";
            const textView = this.child(new TextResultView({ text: item.text, isError }));
            this.textViews.add(textView);
            this.root.append(textView.root);
            textView.mount();
            return;
        }
        if (item.type === "image") {
            const imagePanel = createPanelElement({ border: true, rounded: "md", overflow: "hidden" });
            const image = document.createElement("img");
            image.className = "mcp-content-image";
            image.src = `data:${item.mimeType};base64,${item.data}`;
            image.alt = "Tool result";
            imagePanel.append(image);
            this.root.append(imagePanel);
            return;
        }
        if (item.type === "resource") {
            const hasText = !!item.resource.text;
            const resourcePanel = createPanelElement(hasText
                ? { direction: "column", gap: "xs", flex: true, minHeight: 0, overflow: "hidden" }
                : { direction: "column", gap: "xs" });
            resourcePanel.append(createTextElement(item.resource.uri, { size: "xs", color: "primary" }));
            if (item.resource.text) {
                this.root.dataset.grow = "true";
                const textView = this.child(new TextResultView({ text: item.resource.text }));
                this.textViews.add(textView);
                resourcePanel.append(textView.root);
                textView.mount();
            }
            this.root.append(resourcePanel);
            return;
        }
        if (item.type === "resource_link") {
            const label = item.name || item.uri;
            const text = createTextElement(label, { size: "sm", color: "primary" });
            text.title = item.uri;
            this.root.append(text);
        }
    }

    private disposeContent(): void {
        this.textViews.forEach((view) => { this.releaseChild(view); });
        this.textViews.clear();
        delete this.root.dataset.grow;
        this.root.replaceChildren();
    }
}

class TextResultView extends VanillaView<{ text: string; isError?: boolean }> {
    private host: MonacoEditorHostView | undefined;

    public constructor(props: { text: string; isError?: boolean }) {
        super(props, createPanelElement({
            border: true,
            borderColor: props.isError ? "active" : "subtle",
            rounded: "md",
            overflow: "hidden",
            flex: true,
            minHeight: 40,
        }));
    }

    protected onMount(): void {
        this.host = this.child(new MonacoEditorHostView({
            initialValue: this.props.text,
            language: detectLanguage(this.props.text),
            options: EDITOR_OPTIONS,
        }));
        this.root.append(this.host.root);
        this.host.mount();
    }

    protected onUpdate(props: { text: string; isError?: boolean }): void {
        this.root.dataset.borderColor = props.isError ? "active" : "subtle";
        this.host?.update({
            initialValue: props.text,
            language: detectLanguage(props.text),
            options: EDITOR_OPTIONS,
        });
        if (this.host?.isReady) this.host.setValue(props.text);
    }
}

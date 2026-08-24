import { createPanelElement } from "../../../uikit/Panel/panel-style";
import { createTextElement } from "../../../uikit/Text/text-style";
import { DividerView } from "../../../uikit/Divider/DividerView";
import { IconButtonView } from "../../../uikit/IconButton/IconButtonView";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import { ColorizedCodeView } from "../../shared/ColorizedCodeView";
import type { McpRequestEntry } from "../logTypes";

export interface McpRequestViewProps { entry: McpRequestEntry; }
type StopPropagationEvent = { stopPropagation(): void };

function getDetail(method: string, params: unknown): string {
    if (!params || typeof params !== "object") return "";
    const values = params as Record<string, unknown>;
    const value = (key: string): string => typeof values[key] === "string" ? values[key] as string : "";
    if (method === "tools/call") return value("name");
    if (method === "resources/read") return value("uri");
    if (method === "prompts/get") return value("name");
    if (method === "create_page") return value("title");
    if (method === "set_page_content" || method === "get_page_content") return value("title") || value("id");
    if (method === "open_url") return value("url");
    for (const key of ["title", "name", "url", "uri", "id", "path"]) if (value(key)) return value(key);
    return "";
}

export class McpRequestView extends VanillaView<McpRequestViewProps> {
    private readonly toggleButton: IconButtonView;
    private readonly header = createPanelElement({ name: "log-mcp-header", direction: "row", align: "center", gap: "md", paddingX: "md", paddingY: "xs" });
    private readonly headerHost = document.createElement("div");
    private readonly methodText = createTextElement("", { size: "md", bold: true });
    private readonly detailText = createTextElement("", { size: "md", color: "light", truncate: true });
    private readonly spacer = createPanelElement({ flex: 1 });
    private readonly errorText = createTextElement("ERROR", { size: "sm", color: "error", bold: true });
    private readonly durationText = createTextElement("", { size: "xs", color: "light" });
    private readonly card = createPanelElement({ name: "log-mcp-card", direction: "column", border: true, rounded: "md", overflow: "hidden", paddingLeft: "xxl" });
    private readonly requestCode: ColorizedCodeView;
    private readonly responseCode: ColorizedCodeView;
    private readonly divider = new DividerView({});
    private readonly requestSection = createPanelElement({ name: "log-mcp-request-section", direction: "column" });
    private readonly responseSection = createPanelElement({ name: "log-mcp-response-section", direction: "column" });
    private readonly rootPanel = createPanelElement({ name: "log-mcp-request", direction: "column" });
    private expanded = false;

    public constructor(props: McpRequestViewProps) {
        super(props, document.createElement("div"));
        this.root.style.display = "contents";
        this.headerHost.append(this.header);
        this.toggleButton = new IconButtonView({ name: "log-mcp-toggle", size: "sm", icon: "chevron-right", onClick: this.handleToggleClick });
        this.header.append(this.toggleButton.root, this.methodText, this.detailText, this.spacer, this.errorText, this.durationText);
        this.requestCode = new ColorizedCodeView({ code: "", language: "json", tabSize: 2 });
        this.responseCode = new ColorizedCodeView({ code: "", language: "json", tabSize: 2 });
        this.buildSections();
        this.rootPanel.append(this.headerHost, this.card);
        this.child(this.toggleButton);
        this.child(this.requestCode);
        this.child(this.responseCode);
        this.child(this.divider);
    }

    protected onMount(): void {
        this.updateChildren(this.props);
        this.listen(this.headerHost, "click", this.handleHeaderClick);
        this.toggleButton.mount();
        this.requestCode.mount();
        this.responseCode.mount();
        this.divider.mount();
        this.root.append(this.rootPanel);
    }

    protected onUpdate(props: McpRequestViewProps): void { this.updateChildren(props); }

    private buildSections(): void {
        this.requestSection.append(this.sectionTitle("Request"));
        const requestBody = createPanelElement({ maxHeight: 180, overflowY: "auto" });
        requestBody.append(this.requestCode.root);
        this.requestSection.append(requestBody);
        this.responseSection.append(this.sectionTitle("Response"));
        const responseBody = createPanelElement({ maxHeight: 180, overflowY: "auto" });
        responseBody.append(this.responseCode.root);
        this.responseSection.append(responseBody);
        this.card.append(this.requestSection, this.divider.root, this.responseSection);
    }

    private sectionTitle(value: string): HTMLElement {
        const panel = createPanelElement({ background: "dark", paddingX: "lg", paddingY: "xs" });
        panel.append(createTextElement(value, { size: "xs", color: "light", variant: "uppercased", bold: true }));
        return panel;
    }

    private updateChildren(props: McpRequestViewProps): void {
        const entry = props.entry;
        const detail = getDetail(entry.method, entry.params);
        this.methodText.textContent = entry.method;
        this.detailText.textContent = detail;
        this.detailText.style.display = detail ? "" : "none";
        this.spacer.style.display = detail ? "none" : "";
        this.errorText.style.display = entry.error ? "" : "none";
        this.durationText.textContent = `${entry.durationMs}ms`;
        this.toggleButton.update({ name: "log-mcp-toggle", size: "sm", icon: this.expanded ? "chevron-down" : "chevron-right", onClick: this.handleToggleClick });
        this.requestCode.update({ code: entry.params != null ? JSON.stringify(entry.params, null, 2) : "(no params)", language: "json", tabSize: 2 });
        this.responseCode.update({ code: entry.error ? entry.error : entry.result != null ? JSON.stringify(entry.result, null, 2) : "(no result)", language: "json", tabSize: 2 });
        this.card.style.display = this.expanded ? "" : "none";
    }

    private readonly handleHeaderClick = (): void => { this.expanded = !this.expanded; this.updateChildren(this.props); };
    private readonly handleToggleClick = (event: StopPropagationEvent): void => { event.stopPropagation(); this.handleHeaderClick(); };
}

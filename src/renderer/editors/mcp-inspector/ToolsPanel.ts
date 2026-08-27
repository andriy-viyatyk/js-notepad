import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { ButtonView } from "../../uikit/Button/ButtonView";
import { ListBoxView } from "../../uikit/ListBox/ListBoxView";
import type { IListBoxItem, ListBoxProps } from "../../uikit/ListBox/types";
import { SpacerView } from "../../uikit/Spacer/SpacerView";
import { SplitterView } from "../../uikit/Splitter/SplitterView";
import { TagView } from "../../uikit/Tag/TagView";
import { SubtreeSwap } from "../../uikit/shared/subtree-swap";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { ToolArgFormView } from "./ToolArgForm";
import { ToolResultView } from "./ToolResultView";
import type { McpInspectorEditorModel, McpToolInfo, McpToolsPanelState } from "./McpInspectorEditorModel";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Text/Text.css";
import "./mcp-inspector.css";

export interface ToolsPanelProps { model: McpInspectorEditorModel; }

export class ToolsPanelView extends VanillaView<ToolsPanelProps> {
    private sidebarWidth = 200;
    private resultHeight: number | null = null;
    private countTag: TagView | undefined;
    private list: ListBoxView<IListBoxItem> | undefined;
    private detailSwap: SubtreeSwap<string> | undefined;
    private detail: ToolsDetailView | undefined;
    private detailKey = "";

    public constructor(props: ToolsPanelProps) {
        super(props, createPanelElement({ name: "mcp-tools-panel", direction: "row", flex: true, overflow: "hidden" }));
    }

    protected onMount(): void {
        this.listen(this.root, "keydown", this.onKeyDown);
        const sidebar = createPanelElement({ name: "mcp-tools-sidebar", direction: "column", overflow: "hidden", shrink: false, width: this.sidebarWidth });
        const header = createPanelElement({ direction: "row", align: "center", justify: "between", paddingX: "lg", paddingY: "md", borderBottom: true, shrink: false });
        header.append(createTextElement("Tools", { size: "xs", variant: "uppercased", color: "light", bold: true }));
        this.countTag = this.child(new TagView({ label: "0", size: "sm" }));
        header.append(this.countTag.root); this.countTag.mount(); sidebar.append(header);
        const listHost = createPanelElement({ direction: "column", flex: true, overflow: "hidden" });
        this.list = this.child(new ListBoxView<IListBoxItem>({ items: [], value: null, onChange: this.selectTool, variant: "browse", selectionStyle: "focus", keyboardNav: true, getTooltip: (item) => String(item.value) }));
        listHost.append(this.list.root); this.list.mount(); sidebar.append(listHost); this.root.append(sidebar);
        const splitter = this.child(new SplitterView({ name: "mcp-tools-splitter", orientation: "vertical", value: this.sidebarWidth, onChange: this.setSidebarWidth, side: "before" }));
        this.root.append(splitter.root); splitter.mount();
        const detailHost = document.createElement("div"); detailHost.style.display = "contents"; this.root.append(detailHost);
        this.detailSwap = new SubtreeSwap(detailHost); this.own(() => this.detailSwap.dispose());
        this.bind(this.props.model.toolsState, (state) => state, this.sync);
    }

    protected onUpdate(_props: ToolsPanelProps): void {}

    private readonly sync = (state: McpToolsPanelState): void => {
        this.countTag.update({ label: String(state.tools.length), size: "sm" });
        const items = state.tools.map((tool) => ({ value: tool.name, label: tool.name }));
        const selected = items.find((item) => item.value === state.selectedToolName) || null;
        const listProps: ListBoxProps<IListBoxItem> = { items, value: selected, onChange: this.selectTool, variant: "browse", selectionStyle: "focus", keyboardNav: true, getTooltip: (item) => String(item.value) };
        this.list.update(listProps);
        const tool = state.tools.find((item) => item.name === state.selectedToolName);
        const key = tool ? `tool:${tool.name}` : "empty";
        if (this.detail && this.detailKey === key) {
            this.detail.update(this.detailProps(tool));
            return;
        }
        this.detail = undefined; this.detailKey = key;
        let created: { mount: () => HTMLElement } | undefined;
        this.detailSwap.set(key, () => { if (!tool) { const view = new EmptyToolsView({ model: this.props.model }); created = view; return view; } const view = new ToolsDetailView(this.detailProps(tool)); this.detail = view; created = view; return view; });
        created?.mount();
    };

    private detailProps(tool: McpToolInfo | undefined): ToolsDetailProps {
        return { model: this.props.model, tool, resultHeight: this.resultHeight, onResultHeightChange: this.setResultHeight, onToggleHeight: this.toggleResultHeight };
    }
    private readonly selectTool = (item: IListBoxItem): void => this.props.model.selectTool(String(item.value));
    private readonly setSidebarWidth = (width: number): void => { this.sidebarWidth = width; const sidebar = this.root.querySelector<HTMLElement>('[data-name="mcp-tools-sidebar"]'); if (sidebar) sidebar.style.width = `${width}px`; };
    private readonly setResultHeight = (height: number): void => { this.resultHeight = this.detail?.clampResultHeight(height) ?? height; this.detail?.update(this.detailProps(this.props.model.toolsState.get().tools.find((tool) => tool.name === this.props.model.toolsState.get().selectedToolName))); };
    private readonly toggleResultHeight = (ratio: number): void => { this.detail?.togglePanelHeight(ratio); };
    private readonly onKeyDown = (event: KeyboardEvent): void => { if (event.key === "Enter" && event.ctrlKey) void this.props.model.callTool(); };
}

interface ToolsDetailProps { model: McpInspectorEditorModel; tool: McpToolInfo | undefined; resultHeight: number | null; onResultHeightChange: (height: number) => void; onToggleHeight: (ratio: number) => void; }
class ToolsDetailView extends VanillaView<ToolsDetailProps> {
    private args: ToolArgFormView | undefined;
    private resultSwap: SubtreeSwap<string> | undefined;
    private resultView: ToolResultView | undefined;
    private resultKey = "";
    private top: HTMLDivElement | undefined;
    private topHeader: HTMLDivElement | undefined;
    private toolTitle: HTMLSpanElement | undefined;
    private annotationHost: HTMLDivElement | undefined;
    private annotationViews: TagView[] = [];
    private bottom: HTMLDivElement | undefined;
    private detailRoot: HTMLElement | undefined;
    private resultButton: ButtonView | undefined;
    private resultLabel: HTMLSpanElement | undefined;

    public constructor(props: ToolsDetailProps) { super(props, createPanelElement({ name: "mcp-tools-detail", direction: "column", flex: true, overflow: "hidden" })); this.detailRoot = this.root; }
    protected onMount(): void {
        this.top = createPanelElement({ direction: "column", overflow: "hidden", height: 0 }) as HTMLDivElement;
        this.topHeader = createPanelElement({ direction: "row", align: "center", gap: "md", paddingX: "xl", paddingY: "sm", borderBottom: true, shrink: false, background: "dark" });
        this.listen(this.topHeader, "dblclick", () => this.props.onToggleHeight(0.3));
        this.toolTitle = createTextElement("", { size: "base", color: "default", bold: true });
        this.annotationHost = createPanelElement({ direction: "row", gap: "sm", shrink: false });
        this.topHeader.append(this.toolTitle, this.annotationHost);
        this.top.append(this.topHeader);
        this.args = this.child(new ToolArgFormView({ schema: this.props.tool?.inputSchema || { type: "object" }, args: {}, onArgChange: this.props.model.setToolArg }));
        const argsPanel = createPanelElement({ direction: "column", flex: true, overflow: "auto", padding: "lg", gap: "lg" }); argsPanel.append(this.args.root); this.args.mount(); this.top.append(argsPanel);
        this.root.append(this.top);
        const splitter = this.child(new SplitterView({ name: "mcp-tools-result-splitter", orientation: "horizontal", value: this.props.resultHeight ?? 200, onChange: this.props.onResultHeightChange, side: "after", border: "before" }));
        this.root.append(splitter.root); splitter.mount();
        this.bottom = createPanelElement({ direction: "column", overflow: "hidden" }) as HTMLDivElement;
        const bottomHeader = createPanelElement({ direction: "row", align: "center", gap: "md", paddingX: "lg", paddingY: "xs", borderBottom: true, shrink: false, background: "dark" });
        this.listen(bottomHeader, "dblclick", () => this.props.onToggleHeight(0.7));
        this.resultLabel = createTextElement("Result", { size: "xs", variant: "uppercased", color: "light", bold: true }); bottomHeader.append(this.resultLabel);
        this.resultButton = this.child(new ButtonView({ name: "mcp-call-tool", variant: "primary", size: "sm", onClick: () => void this.props.model.callTool() }));
        const spacer = this.child(new SpacerView({})); bottomHeader.append(spacer.root, this.resultButton.root); spacer.mount(); this.resultButton.mount(); this.bottom.append(bottomHeader);
        const resultHost = createPanelElement({ direction: "column", flex: true, overflow: "hidden", paddingX: "lg", paddingY: "md" });
        const resultBranchHost = document.createElement("div"); resultBranchHost.style.display = "contents"; resultHost.append(resultBranchHost); this.bottom.append(resultHost); this.root.append(this.bottom);
        this.resultSwap = new SubtreeSwap(resultBranchHost); this.own(() => this.resultSwap.dispose());
        this.sync(this.props);
    }
    protected onUpdate(props: ToolsDetailProps): void { this.sync(props); }
    protected onDispose(): void { this.resultView = undefined; }
    private sync(props: ToolsDetailProps): void {
        if (!props.tool) { this.root.replaceChildren(createPanelElement({ flex: true, align: "center", justify: "center" }, [createTextElement(props.model.toolsState.get().tools.length === 0 ? "No tools available on this server." : "Select a tool from the sidebar.", { size: "md", color: "light" })])); return; }
        const state = props.model.toolsState.get();
        this.applyLayout(props.resultHeight);
        this.args.update({ schema: props.tool.inputSchema, args: state.toolArgs, onArgChange: props.model.setToolArg, disabled: state.toolCallLoading });
        this.updateHeader(props.tool, state);
        const result = state.toolResult;
        const key = result ? "result" : "empty";
        if (this.resultView && this.resultKey === key && result) { this.resultView.update({ result }); return; }
        this.resultView = undefined; this.resultKey = key;
        let createdView: { mount: () => HTMLElement } | undefined;
        let createdBranch: { mount: () => HTMLElement } | undefined;
        this.resultSwap.set(result ? "result" : "empty", () => {
            if (result) { const view = new ToolResultView({ result }); createdView = view; this.resultView = view; return view; }
            const view = new EmptyResultView(); createdBranch = view; return view;
        });
        (createdView ?? createdBranch)?.mount();
    }
    private updateHeader(tool: McpToolInfo, state: McpToolsPanelState): void {
        this.toolTitle.textContent = tool.name;
        this.annotationViews.forEach((tag) => this.releaseChild(tag));
        this.annotationViews = [];
        if (tool.annotations?.readOnlyHint) { const tag = this.child(new TagView({ label: "read-only", size: "sm" })); this.annotationViews.push(tag); this.annotationHost.append(tag.root); tag.mount(); }
        if (tool.annotations?.destructiveHint) { const tag = this.child(new TagView({ label: "destructive", size: "sm", tone: "error" })); this.annotationViews.push(tag); this.annotationHost.append(tag.root); tag.mount(); }
        this.resultLabel.textContent = "Result";
        this.resultButton.update({ name: "mcp-call-tool", variant: "primary", size: "sm", onClick: () => void this.props.model.callTool(), disabled: state.toolCallLoading, children: state.toolCallLoading ? "Calling…" : "▶ Call Tool" });
    }
    private applyLayout(resultHeight: number | null): void {
        const height = resultHeight ?? (this.detailRoot.clientHeight > 0 ? this.detailRoot.clientHeight * 0.3 : 200);
        if (resultHeight === null) { this.top.style.flex = "7 1 0"; this.bottom.style.flex = "3 1 0"; this.bottom.style.minHeight = "0"; this.bottom.style.height = ""; } else { this.top.style.flex = "1 1 auto"; this.bottom.style.flex = "0 0 auto"; this.bottom.style.height = `${height}px`; }
    }
    public clampResultHeight(height: number): number { const total = this.detailRoot.clientHeight; if (!total) return height; return Math.max(total * 0.1, Math.min(total * 0.9, height)); }
    public togglePanelHeight(expandedRatio: number): void { const total = this.detailRoot.clientHeight; if (!total) return; const expanded = total * expandedRatio; const collapsed = total * (1 - expandedRatio); const current = this.props.resultHeight ?? total * 0.3; this.props.onResultHeightChange(this.clampResultHeight(Math.abs(current - expanded) < total * 0.05 ? collapsed : expanded)); }
}

class EmptyResultView extends VanillaView<Record<string, never>> {
    public constructor() { super({}, createPanelElement({ flex: true, align: "center", justify: "center" }, [createTextElement('Click "Call Tool" to execute.', { size: "sm", color: "light" })])); }
}

class EmptyToolsView extends VanillaView<{ model: McpInspectorEditorModel }> {
    public constructor(props: { model: McpInspectorEditorModel }) { super(props, createPanelElement({ flex: true, align: "center", justify: "center", overflow: "auto" })); }
    protected onMount(): void { const state = this.props.model.toolsState.get(); this.root.append(createTextElement(state.tools.length === 0 ? "No tools available on this server." : "Select a tool from the sidebar.", { size: "md", color: "light" })); }
}

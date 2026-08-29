import { createPanelElement, applyPanelAttributes, resolvePanelAttributes } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { ButtonView } from "../../uikit/Button/ButtonView";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { SpacerView } from "../../uikit/Spacer/SpacerView";
import { DotView } from "../../uikit/Dot/DotView";
import type { DotColor } from "../../uikit/Dot/DotView";
import { EditorToolbarView } from "../base/EditorToolbarView";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { pagesModel } from "../../api/pages";
import type { EditorModel } from "../base";
import { MnemeConfigEditorModel, type MnemeConfigEditorState } from "./MnemeConfigEditorModel";
import { isModelReady } from "./mnemeTypes";
import { ModelPanelView } from "./ModelPanel";
import { RootsPanelView } from "./RootsPanel";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Text/Text.css";
import "../../uikit/Button/Button.css";
import "../../uikit/IconButton/IconButton.css";
import "../../uikit/Spacer/Spacer.css";
import "../../uikit/Dot/Dot.css";

function connectionDotColor(status: string): DotColor {
    switch (status) {
        case "connected": return "success";
        case "connecting": return "warning";
        case "error": return "error";
        default: return "neutral";
    }
}

interface StoppedConfigProps { model: MnemeConfigEditorModel; }
class StoppedConfigView extends VanillaView<StoppedConfigProps> {
    private start: ButtonView | undefined; private settings: ButtonView | undefined;
    public constructor(props: StoppedConfigProps) { super(props, createPanelElement({ direction: "column", flex: true, align: "center", justify: "center", gap: "md" })); }
    protected onMount(): void {
        const dot = this.child(new DotView({ size: "md", color: "neutral" }));
        this.start = this.child(new ButtonView({ name: "mneme-start", variant: "primary", children: "Start Mneme", onClick: () => { void this.props.model.restartMneme(); } }));
        this.settings = this.child(new ButtonView({ name: "mneme-open-settings", children: "Open Settings", onClick: () => { void pagesModel.showSettingsPage(); } }));
        const actions = createPanelElement({ direction: "row", gap: "sm" }); actions.append(this.start.root, this.settings.root);
        this.root.append(dot.root, createTextElement("Mneme is not running", { size: "lg", color: "light" }), createTextElement("Mneme is disabled or not started.", { size: "md", color: "light" }), actions);
        dot.mount(); this.start.mount(); this.settings.mount();
    }
}

interface WarningProps { message: string; }
class ConfigWarningView extends VanillaView<WarningProps> {
    private message: HTMLSpanElement | undefined;
    public constructor(props: WarningProps) { super(props, createPanelElement({ direction: "row", align: "center", gap: "sm", paddingX: "lg", paddingY: "xs", background: "light", borderBottom: true })); }
    protected onMount(): void { const dot = this.child(new DotView({ size: "xs", color: "warning" })); this.message = createTextElement(this.props.message, { size: "md", color: "warning" }); this.root.append(dot.root, this.message); dot.mount(); }
    protected onUpdate(props: WarningProps): void { this.message.textContent = props.message; }
}

interface RunningConfigProps { model: MnemeConfigEditorModel; state: MnemeConfigEditorState; }
class RunningConfigView extends VanillaView<RunningConfigProps> {
    private connectionDot: DotView | undefined; private connectionText: HTMLSpanElement | undefined; private urlText: HTMLSpanElement | undefined;
    private restartButton: IconButtonView | undefined; private warningHost: HTMLDivElement | undefined; private errorHost: HTMLDivElement | undefined; private body: HTMLDivElement | undefined;
    private healthWarning: ConfigWarningView | undefined; private modelPanel: ModelPanelView | undefined; private rootsPanel: RootsPanelView | undefined;
    public constructor(props: RunningConfigProps) { super(props, createPanelElement({ direction: "column", flex: true, overflow: "hidden" })); this.root.tabIndex = -1; }
    protected onMount(): void {
        const bar = createPanelElement({ name: "mneme-status-bar", direction: "row", align: "center", gap: "sm", paddingLeft: "lg", paddingRight: "lg", paddingY: "sm", flex: true });
        this.connectionDot = this.child(new DotView({ size: "xs", color: "neutral" })); this.connectionText = createTextElement(""); bar.append(this.connectionDot.root, this.connectionText);
        this.warningHost = createPanelElement({}); this.errorHost = createPanelElement({});
        const spacer = this.child(new SpacerView({}));
        const mcp = this.child(new IconButtonView({ name: "mneme-open-mcp-inspector", size: "sm", icon: "mcp", title: "Open in MCP Inspector", onClick: () => { void this.props.model.openInMcpInspector(); } }));
        const log = this.child(new IconButtonView({ name: "mneme-open-log", size: "sm", icon: "log", title: "Open Mneme log", onClick: () => { void this.props.model.openLog(); } }));
        bar.append(this.warningHost, spacer.root, mcp.root, log.root); this.connectionDot.mount(); spacer.mount(); mcp.mount(); log.mount();
        const toolbar = this.child(new EditorToolbarView({ borderBottom: true, children: bar }));
        this.body = createPanelElement({ name: "mneme-body", direction: "column", flex: true, overflow: "auto", height: 0 });
        this.modelPanel = this.child(new ModelPanelView({ model: this.props.model, state: this.props.state })); this.rootsPanel = this.child(new RootsPanelView({ model: this.props.model, state: this.props.state }));
        this.body.append(this.modelPanel.root, this.rootsPanel.root); this.modelPanel.mount(); this.rootsPanel.mount(); this.root.append(toolbar.root, this.errorHost, this.body); toolbar.mount();
        this.sync(this.props);
    }
    protected onUpdate(props: RunningConfigProps): void { this.sync(props); }
    protected onDispose(): void { this.restartButton = undefined; this.healthWarning = undefined; this.urlText = undefined; this.warningHost = undefined; this.errorHost = undefined; this.body = undefined; }
    private sync(props: RunningConfigProps): void {
        const state = props.state; const connected = state.connectionStatus === "connected";
        this.connectionDot.update({ size: "xs", color: connectionDotColor(state.connectionStatus) }); this.connectionText.textContent = connected ? "Connected" : state.connectionStatus === "connecting" ? "Connecting…" : "Disconnected";
        if (!connected && !this.restartButton) { this.restartButton = this.child(new IconButtonView({ name: "mneme-restart", size: "sm", warning: true, icon: "refresh", title: "Restart Mneme", onClick: () => { void this.props.model.restartMneme(); } })); this.warningHost.insertBefore(this.restartButton.root, this.warningHost.firstChild); this.restartButton.mount(); }
        else if (connected && this.restartButton) { this.releaseChild(this.restartButton); this.restartButton = undefined; }
        if (state.url) { if (!this.urlText) { this.urlText = createTextElement(state.url, { size: "md", color: "light" }); this.warningHost.append(this.urlText); } else this.urlText.textContent = state.url; }
        else { this.urlText?.remove(); this.urlText = undefined; }
        const hasError = state.connectionStatus === "error" && !!state.errorMessage; this.errorHost.replaceChildren(); if (hasError) this.errorHost.append(createPanelElement({ paddingX: "lg", paddingY: "xs", background: "light", borderBottom: true }, [createTextElement(state.errorMessage, { size: "md", color: "error" })]));
        const needsHealth = connected && !isModelReady(state.status);
        if (needsHealth && !this.healthWarning) { this.healthWarning = this.child(new ConfigWarningView({ message: "No embedding model — semantic search is disabled; results fall back to text. Update the model in the Model tab." })); this.root.insertBefore(this.healthWarning.root, this.body); this.healthWarning.mount(); }
        else if (!needsHealth && this.healthWarning) { this.releaseChild(this.healthWarning); this.healthWarning = undefined; }
        this.modelPanel.update({ model: props.model, state }); this.rootsPanel.update({ model: props.model, state });
    }
}

export interface MnemeConfigEditorViewProps { model: EditorModel; }
function requireConfigModel(model: EditorModel): MnemeConfigEditorModel { if (!(model instanceof MnemeConfigEditorModel)) throw new Error("Mneme config view received an invalid model."); return model; }

export class MnemeConfigEditorView extends VanillaView<MnemeConfigEditorViewProps> {
    private model: MnemeConfigEditorModel; private stateSubscription: (() => void) | undefined; private connected = false; private live = false; private inventoryGeneration = 0; private pageModel: StoppedConfigView | RunningConfigView | undefined;
    public constructor(props: MnemeConfigEditorViewProps) { super(props, createPanelElement({ name: "mneme-config-root", direction: "column", flex: true })); this.model = requireConfigModel(props.model); }
    protected onMount(): void { this.live = true; this.subscribeToModel(this.model); }
    protected onUpdate(props: MnemeConfigEditorViewProps): void { const model = requireConfigModel(props.model); if (model !== this.model) this.replaceModelSubscription(model); this.sync(this.model.state.get()); }
    protected onDispose(): void { this.live = false; this.stateSubscription?.(); this.stateSubscription = undefined; this.inventoryGeneration++; this.pageModel = undefined; }
    private subscribeToModel(model: MnemeConfigEditorModel): void {
        this.stateSubscription?.(); this.stateSubscription = undefined; this.connected = false;
        this.stateSubscription = this.ownSubscription(model.state.subscribe(() => { if (!this.live || this.model !== model) return; this.applyModelState(model); }));
        this.applyModelState(model);
    }
    private replaceModelSubscription(model: MnemeConfigEditorModel): void { this.stateSubscription?.(); this.stateSubscription = undefined; this.model = model; this.subscribeToModel(model); }
    private applyModelState(model: MnemeConfigEditorModel): void { if (!this.live || this.model !== model) return; const state = model.state.get(); const nextConnected = state.connectionStatus === "connected"; if (nextConnected && !this.connected) this.loadInventory(model); this.connected = nextConnected; this.sync(state); }
    private loadInventory(model: MnemeConfigEditorModel): void { const generation = ++this.inventoryGeneration; void model.loadIndexInventory().then(() => { if (this.model !== model || generation !== this.inventoryGeneration) return; }).catch(() => { /* inventory is best-effort and the model owns its error surface */ }); }
    private sync(state: MnemeConfigEditorState): void {
        applyPanelAttributes(this.root, resolvePanelAttributes(state.running ? { name: "mneme-config-root", direction: "column", flex: true, overflow: "hidden" } : { name: "mneme-config-root", direction: "column", flex: true, align: "center", justify: "center", gap: "md" }));
        this.root.tabIndex = -1;
        const running = state.running;
        if (!this.pageModel || (running && !(this.pageModel instanceof RunningConfigView)) || (!running && !(this.pageModel instanceof StoppedConfigView))) {
            const next = running ? new RunningConfigView({ model: this.model, state }) : new StoppedConfigView({ model: this.model });
            this.child(next); this.root.append(next.root); next.mount(); const previous = this.pageModel; this.pageModel = next; if (previous) this.releaseChild(previous);
        } else if (this.pageModel instanceof RunningConfigView) this.pageModel.update({ model: this.model, state });
    }
}

export { MnemeConfigEditorView as MnemeConfigView };

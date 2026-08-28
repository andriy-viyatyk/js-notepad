import { app } from "../../api/app";
import { createFileTypeIconElement } from "../../components/icons/icon-elements";
import { createComponentModelDriver, TComponentModel, type ComponentModelDriver } from "../../core/state/model";
import { createDepsGate, type DepsGate } from "../../uikit/shared/deps-gate";
import { KeyedList } from "../../uikit/shared/keyed-list";
import { SubtreeSwap } from "../../uikit/shared/subtree-swap";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { createPanelElement, applyPanelAttributes, resolvePanelAttributes } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import type { ButtonProps } from "../../uikit/Button/ButtonView";
import { ButtonView } from "../../uikit/Button/ButtonView";
import type { CheckboxProps } from "../../uikit/Checkbox/CheckboxView";
import { CheckboxView } from "../../uikit/Checkbox/CheckboxView";
import type { IconButtonProps } from "../../uikit/IconButton/IconButtonView";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import type { SegmentedControlProps } from "../../uikit/SegmentedControl/SegmentedControlView";
import { SegmentedControlView } from "../../uikit/SegmentedControl/SegmentedControlView";
import type { SplitterProps } from "../../uikit/Splitter/SplitterView";
import { SplitterView } from "../../uikit/Splitter/SplitterView";
import type { TextareaProps } from "../../uikit/Textarea/TextareaView";
import { TextareaView } from "../../uikit/Textarea/TextareaView";
import { SpacerView } from "../../uikit/Spacer/SpacerView";
import { MonacoEditorHostView } from "../shared/MonacoEditorHostView";
import type { RestClientSource, RestClientViewState, RestRequest, BodyType, FormDataEntry } from "./restClientTypes";
import { RAW_LANGUAGES } from "./restClientTypes";
import { COMMON_HEADERS, HTTP_METHODS, METHOD_COLORS } from "./httpConstants";
import { KeyValueEditorView } from "./KeyValueEditorView";
import type { MenuHandle } from "../../uikit/Menu/attach-menu";
import { openMenu } from "../../uikit/Menu/attach-menu";
import "../../uikit/Button/Button.css";
import "../../uikit/Checkbox/Checkbox.css";
import "../../uikit/IconButton/IconButton.css";
import "../../uikit/SegmentedControl/SegmentedControl.css";
import "../../uikit/Spacer/Spacer.css";
import "../../uikit/Splitter/Splitter.css";
import "../../uikit/Textarea/Textarea.css";

const BODY_TYPES: Array<{ type: BodyType; label: string }> = [
    { type: "none", label: "none" }, { type: "form-data", label: "form-data" },
    { type: "form-urlencoded", label: "x-www-form-urlencoded" }, { type: "raw", label: "raw" },
    { type: "binary", label: "binary" },
];

const BODY_EDITOR_OPTIONS: import("monaco-editor").editor.IStandaloneEditorConstructionOptions = {
    automaticLayout: true, minimap: { enabled: false }, lineNumbers: "off", scrollBeyondLastLine: false,
    wordWrap: "on", folding: true, renderLineHighlight: "none", overviewRulerLanes: 0,
    padding: { top: 4, bottom: 4 }, scrollbar: { alwaysConsumeMouseWheel: false },
};

export interface RequestBuilderProps {
    vm: RestClientSource;
    request: RestRequest;
    state: RestClientViewState;
}

interface RequestBuilderState {
    bodyHeight: number | null;
    headersView: "table" | "json";
    headersJson: string;
}

const defaultRequestBuilderState: RequestBuilderState = { bodyHeight: null, headersView: "table", headersJson: "" };

class RequestBuilderModel extends TComponentModel<RequestBuilderState, RequestBuilderProps> {
    setBodyHeight = (height: number | null): void => { this.state.update((state) => { state.bodyHeight = height; }); };
    setHeadersView = (view: "table" | "json"): void => { this.state.update((state) => { state.headersView = view; }); };
    setHeadersJson = (json: string): void => { this.state.update((state) => { state.headersJson = json; }); };
}

export class RequestBuilderView extends VanillaView<RequestBuilderProps> {
    private readonly driver: ComponentModelDriver<RequestBuilderState, RequestBuilderProps, RequestBuilderModel>;
    private readonly splitRoot: HTMLDivElement;
    private readonly headersPanel: HTMLDivElement;
    private readonly bodyPanel: HTMLDivElement;
    private readonly headerContentHost = document.createElement("span");
    private readonly bodyLanguageHost = document.createElement("span");
    private readonly headersSwap = new SubtreeSwap<"table" | "json">(this.headerContentHost);
    private readonly languageSwap = new SubtreeSwap<"raw" | "non-raw">(this.bodyLanguageHost);
    private readonly bodyMeasureGate: DepsGate = createDepsGate();
    private bodyMeasureFrame: number | undefined;
    private bodyHeight: number | null = null;
    private live = false;
    private headersView: SegmentedControlView | undefined;
    private bodyTypeView: SegmentedControlView | undefined;
    private methodButton: ButtonView | undefined;
    private methodText: HTMLSpanElement | undefined;
    private urlInput: TextareaView | undefined;
    private sendButton: ButtonView | undefined;
    private headersBranch: VanillaView<unknown> | undefined;
    private pendingHeaders: VanillaView<unknown> | undefined;
    private languageBranch: VanillaView<unknown> | undefined;
    private pendingLanguage: VanillaView<unknown> | undefined;

    public constructor(props: RequestBuilderProps) {
        const splitRoot = createPanelElement({ name: "request-split", direction: "column", flex: 1, overflow: "hidden", minHeight: 0 });
        super(props, createPanelElement({ name: "request-builder", direction: "column", flex: 1, overflow: "hidden", minHeight: 0 }));
        this.driver = createComponentModelDriver(props, RequestBuilderModel, defaultRequestBuilderState);
        this.splitRoot = splitRoot;
        this.headerContentHost.style.display = "contents";
        this.bodyLanguageHost.style.display = "contents";
        this.headersPanel = createPanelElement({ name: "headers-panel", direction: "column", overflow: "hidden", minHeight: 0, flex: "6 1 0" });
        this.bodyPanel = createPanelElement({ name: "body-panel", direction: "column", overflow: "hidden", minHeight: 0, flex: "4 1 0" });
    }

    protected onMount(): void {
        this.live = true;
        this.own(() => { this.live = false; if (this.bodyMeasureFrame !== undefined) cancelAnimationFrame(this.bodyMeasureFrame); this.bodyMeasureFrame = undefined; });
        this.own(() => this.headersSwap.dispose());
        this.own(() => this.languageSwap.dispose());
        this.own(() => this.driver.dispose());
        this.driver.mount();

        const urlBar = createPanelElement({ name: "url-bar", direction: "row", align: "start", gap: "xs", paddingX: "md", paddingY: "xs", background: "dark", shrink: false });
        const methodText = createTextElement(this.props.request.method, { bold: true, color: METHOD_COLORS[this.props.request.method] });
        const methodButton = this.child(new ButtonView(this.methodProps(methodText)));
        const urlInput = this.child(new TextareaView(this.urlProps()));
        const sendButton = this.child(new ButtonView(this.sendProps()));
        methodButton.root.dataset.name = "method-label";
        urlBar.append(methodButton.root, urlInput.root, sendButton.root);
        this.methodButton = methodButton; this.methodText = methodText; this.urlInput = urlInput; this.sendButton = sendButton;

        const headersHeader = createPanelElement({ name: "headers-section-header", direction: "row", align: "center", gap: "xs", paddingX: "md", paddingY: "xs", background: "dark", shrink: false });
        const headersView = this.child(new SegmentedControlView(this.headersViewProps()));
        const headersCopy = this.child(new IconButtonView(this.headersCopyProps()));
        const headersSpacer = this.child(new SpacerView({}));
        headersHeader.append(createTextElement("Headers", { size: "xs", variant: "uppercased", color: "light", bold: true }), headersSpacer.root, headersView.root, headersCopy.root);
        this.headersView = headersView;
        this.headersPanel.append(headersHeader, this.headerContentHost);

        const splitter = this.child(new SplitterView(this.splitterProps()));
        const bodyHeader = createPanelElement({ name: "body-section-header", direction: "row", align: "center", gap: "xs", paddingX: "md", paddingY: "xs", background: "dark", shrink: false });
        const bodyTypeView = this.child(new SegmentedControlView(this.bodyTypeProps()));
        bodyHeader.append(createTextElement("Body", { size: "xs", variant: "uppercased", color: "light", bold: true }), bodyTypeView.root, this.bodyLanguageHost);
        this.bodyTypeView = bodyTypeView;
        const bodyContent = this.child(new BodyContentView({ vm: this.props.vm, request: this.props.request, onMonacoChange: this.handleMonacoBodyChange }));
        this.bodyPanel.append(bodyHeader, bodyContent.root);
        this.splitRoot.append(this.headersPanel, splitter.root, this.bodyPanel);
        this.root.append(urlBar, this.splitRoot);
        this.listen(headersHeader, "dblclick", this.handleHeadersDblClick);
        this.listen(bodyHeader, "dblclick", this.handleBodyDblClick);
        methodButton.mount(); urlInput.mount(); sendButton.mount(); headersSpacer.mount(); headersView.mount(); headersCopy.mount(); splitter.mount(); bodyTypeView.mount(); bodyContent.mount();
        this.sync(this.driver.model.state.get());
        this.bodyMeasureGate.prime([this.bodyHeight, this.driver.model]);
    }

    protected onUpdate(props: RequestBuilderProps): void {
        this.driver.update(props);
        this.sync(this.driver.model.state.get());
    }

    protected onDispose(): void {
        this.methodMenu?.dispose();
        this.bodyLanguageMenu?.dispose();
        this.methodMenu = undefined;
        this.bodyLanguageMenu = undefined;
        this.methodButton = undefined; this.urlInput = undefined; this.sendButton = undefined;
    }

    private readonly sync = (state: RequestBuilderState): void => {
        this.bodyHeight = state.bodyHeight;
        if (this.bodyMeasureGate.changed([state.bodyHeight, this.driver.model])) {
            if (state.bodyHeight === null) this.scheduleBodyMeasure();
            else this.applyLayout();
        }
        this.methodText && (this.methodText.textContent = this.props.request.method);
        if (this.methodText) this.methodText.style.color = METHOD_COLORS[this.props.request.method] ?? "";
        this.methodButton?.update(this.methodProps(this.methodText));
        this.urlInput?.update(this.urlProps());
        this.sendButton?.update(this.sendProps());
        this.headersView?.update(this.headersViewProps(state));
        this.bodyTypeView?.update(this.bodyTypeProps());
        this.syncHeaders(state);
        this.syncLanguage();
    };

    private applyLayout(): void {
        const pinned = this.bodyHeight;
        applyPanelAttributes(this.headersPanel, resolvePanelAttributes({ name: "headers-panel", direction: "column", overflow: "hidden", minHeight: 0, flex: pinned === null ? "6 1 0" : "1 1 auto" }));
        applyPanelAttributes(this.bodyPanel, resolvePanelAttributes({ name: "body-panel", direction: "column", overflow: "hidden", minHeight: 0, flex: pinned === null ? "4 1 0" : "0 0 auto", height: pinned ?? undefined, shrink: pinned !== null ? false : undefined }));
    }

    private scheduleBodyMeasure(): void {
        if (!this.live) return;
        if (this.bodyMeasureFrame !== undefined) cancelAnimationFrame(this.bodyMeasureFrame);
        this.bodyMeasureFrame = requestAnimationFrame(() => {
            this.bodyMeasureFrame = undefined;
            if (!this.live || !this.root.isConnected || this.bodyPanel.offsetHeight <= 0) { this.scheduleBodyMeasure(); return; }
            this.bodyHeight = this.bodyPanel.offsetHeight;
            this.driver.model.setBodyHeight(this.bodyHeight);
            this.applyLayout();
            this.bodyMeasureGate.prime([this.bodyHeight, this.driver.model]);
        });
    }

    private clampHeight(value: number): number {
        const total = this.splitRoot.clientHeight;
        return total ? Math.max(total * 0.1, Math.min(total * 0.9, value)) : value;
    }
    private readonly handleBodyHeightChange = (value: number): void => { this.bodyHeight = this.clampHeight(value); this.driver.model.setBodyHeight(this.bodyHeight); this.bodyMeasureGate.prime([this.bodyHeight, this.driver.model]); this.applyLayout(); };
    private readonly toggleBodyHeight = (ratio: number): void => { const total = this.splitRoot.clientHeight; if (!total) return; const expanded = total * ratio; const collapsed = total * (1 - ratio); const current = this.bodyHeight ?? total * 0.4; this.handleBodyHeightChange(Math.abs(current - expanded) < total * 0.05 ? collapsed : expanded); };
    private readonly handleHeadersDblClick = (): void => this.toggleBodyHeight(0.3);
    private readonly handleBodyDblClick = (): void => this.toggleBodyHeight(0.7);

    private splitterProps(): SplitterProps { return { name: "request-body-splitter", orientation: "horizontal", value: this.bodyHeight ?? this.splitRoot.clientHeight * 0.4, onChange: this.handleBodyHeightChange, side: "after", border: "before" }; }
    private methodProps(text: HTMLSpanElement | undefined): ButtonProps { return { name: "method-label", size: "sm", variant: "ghost", background: "dark", onClick: this.openMethodMenu, children: text ?? this.props.request.method }; }
    private urlProps(): TextareaProps { return { name: "url-input", value: this.props.request.url, onChange: (value) => this.props.vm.updateRequest(this.props.request.id, { url: value }), onKeyDown: this.handleUrlKeyDown, onPaste: this.handleUrlPaste, placeholder: "Enter URL or paste cURL/fetch...", flex: 1, minHeight: 24, maxHeight: 54 }; }
    private sendProps(): ButtonProps { return { name: "rest-send", variant: "primary", disabled: this.props.state.executing || !this.props.request.url, onClick: this.props.vm.sendRequest, children: this.props.state.executing ? "Sending..." : "Send" }; }
    private headersViewProps(state: RequestBuilderState = this.driver.model.state.get()): SegmentedControlProps { return { name: "headers-view", size: "sm", value: state.headersView, onChange: (value) => value === "json" ? this.switchToJsonView() : this.switchToTableView(), items: [{ value: "table", label: "Table" }, { value: "json", label: "JSON" }] }; }
    private bodyTypeProps(): SegmentedControlProps { return { name: "body-type-select", size: "sm", value: this.props.request.bodyType, onChange: (value) => this.props.vm.updateBodyType(this.props.request.id, value as BodyType), items: BODY_TYPES.map(({ type, label }) => ({ value: type, label })) }; }
    private headersCopyProps(): IconButtonProps { return { name: "headers-copy", size: "sm", icon: "copy", title: "Copy headers as JSON", onClick: this.copyHeaders }; }

    private syncHeaders(state: RequestBuilderState): void {
        const key = state.headersView;
        if (this.headersBranch && this.headersKey === key) { this.headersBranch.update(this.headersBranchProps(state)); return; }
        this.pendingHeaders = undefined;
        this.headersSwap.set(key, () => { const branch = key === "table" ? new HeadersTableView(this.headersBranchProps(state)) : new HeadersJsonView(this.headersBranchProps(state)); this.pendingHeaders = branch; return branch; });
        const branch = this.pendingHeaders; this.pendingHeaders = undefined; if (!branch) return; this.headersBranch = branch; this.headersKey = key; branch.mount();
    }
    private headersKey: "table" | "json" | undefined;
    private headersBranchProps(state: RequestBuilderState): HeadersBranchProps { return { vm: this.props.vm, request: this.props.request, json: state.headersJson, onJsonChange: this.handleHeadersJsonChange }; }
    private switchToJsonView = (): void => { const obj: Record<string, string> = {}; for (const header of this.props.request.headers) if (header.enabled && header.key.trim()) obj[header.key.trim()] = header.value; this.driver.model.setHeadersJson(JSON.stringify(obj, null, 2)); this.props.vm.setHeadersJsonInvalid(false); this.driver.model.setHeadersView("json"); };
    private switchToTableView = (): void => { try { const obj: unknown = JSON.parse(this.driver.model.state.get().headersJson); if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("not an object"); const headers = Object.entries(obj).map(([key, value]) => ({ key, value: String(value), enabled: true })); this.props.vm.updateRequest(this.props.request.id, { headers }); this.props.vm.setHeadersJsonInvalid(false); this.driver.model.setHeadersView("table"); } catch { app.ui.notify("Invalid JSON — fix errors before switching to Table view", "warning"); } };
    private readonly handleHeadersJsonChange = (value: string): void => { this.driver.model.setHeadersJson(value); try { const obj: unknown = JSON.parse(value); if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("not an object"); this.props.vm.updateRequest(this.props.request.id, { headers: Object.entries(obj).map(([key, item]) => ({ key, value: String(item), enabled: true })) }); this.props.vm.setHeadersJsonInvalid(false); } catch { this.props.vm.setHeadersJsonInvalid(true); } };

    private syncLanguage(): void {
        const key = this.props.request.bodyType === "raw" ? "raw" : "non-raw";
        if (this.languageBranch && this.languageKey === key) { this.languageBranch.update(this.languageProps(key)); return; }
        this.pendingLanguage = undefined;
        this.languageSwap.set(key, () => { const branch = key === "raw" ? new BodyLanguageButtonView(this.languageProps(key), this.openBodyLanguageMenu) : new EmptyView(); this.pendingLanguage = branch; return branch; });
        const branch = this.pendingLanguage; this.pendingLanguage = undefined; if (!branch) return; this.languageBranch = branch; this.languageKey = key; branch.mount();
    }
    private languageKey: "raw" | "non-raw" | undefined;
    private languageProps(_key: "raw" | "non-raw"): ButtonProps { return { name: "body-language", size: "sm", variant: "ghost", background: "dark", icon: createFileTypeIconElement({ language: this.props.request.bodyLanguage, width: 16, height: 16 }), title: "Change body language", onClick: this.openBodyLanguageMenu, children: this.props.request.bodyLanguage }; }
    private methodMenu: MenuHandle | undefined;
    private bodyLanguageMenu: MenuHandle | undefined;
    private readonly openMethodMenu = (): void => { this.methodMenu?.dispose(); this.methodMenu = openMenu(this.methodButton?.root ?? this.root, { items: HTTP_METHODS.map((method) => ({ label: method, selected: method === this.props.request.method, onClick: () => this.props.vm.updateRequest(this.props.request.id, { method }) })), onClose: () => { this.methodMenu = undefined; } }); };
    private readonly openBodyLanguageMenu = (): void => { this.bodyLanguageMenu?.dispose(); this.bodyLanguageMenu = openMenu(this.languageBranch?.root ?? this.root, { items: RAW_LANGUAGES.map((language) => ({ label: language, icon: createFileTypeIconElement({ language, width: 16, height: 16 }), selected: language === this.props.request.bodyLanguage, onClick: () => this.props.vm.updateBodyLanguage(this.props.request.id, language) })), onClose: () => { this.bodyLanguageMenu = undefined; } }); };
    private readonly handleUrlKeyDown = (event: KeyboardEvent): void => { if (event.key === "Enter") { event.preventDefault(); this.props.vm.sendRequest(); } };
    private readonly handleUrlPaste = (event: ClipboardEvent): void => { const text = event.clipboardData?.getData("text") ?? ""; const trimmed = text.trim(); if (trimmed.startsWith("fetch(") || /^curl\s/i.test(trimmed)) { event.preventDefault(); this.props.vm.pasteRequest(text); } };
    private readonly copyHeaders = async (): Promise<void> => { const obj: Record<string, string> = {}; for (const header of this.props.request.headers) if (header.enabled && header.key.trim()) obj[header.key.trim()] = header.value; await navigator.clipboard.writeText(JSON.stringify(obj, null, 2)); await new Promise((resolve) => setTimeout(resolve, 200)); };
    private readonly handleMonacoBodyChange = (value: string): void => { this.props.vm.updateRequest(this.props.request.id, { body: value }); };
}

interface HeadersBranchProps { vm: RestClientSource; request: RestRequest; json: string; onJsonChange: (value: string) => void; }
class HeadersTableView extends VanillaView<HeadersBranchProps> {
    private readonly editor: KeyValueEditorView;
    public constructor(props: HeadersBranchProps) { const root = createPanelElement({ name: "headers-scroll", direction: "column", flex: 1, overflowY: "auto", minHeight: 0, paddingX: "md", paddingBottom: "sm" }); const editor = new KeyValueEditorView({ items: props.request.headers, onUpdate: (index, changes) => props.vm.updateHeader(props.request.id, index, changes), onDelete: (index) => props.vm.deleteHeader(props.request.id, index), onToggle: (index) => props.vm.toggleHeader(props.request.id, index), keyOptions: COMMON_HEADERS, keyPlaceholder: "Header name", valuePlaceholder: "Value" }); super(props, root); this.editor = editor; }
    protected onMount(): void { this.root.append(this.editor.root); this.editor.mount(); }
    protected onUpdate(props: HeadersBranchProps): void { this.editor.update({ items: props.request.headers, onUpdate: (index, changes) => props.vm.updateHeader(props.request.id, index, changes), onDelete: (index) => props.vm.deleteHeader(props.request.id, index), onToggle: (index) => props.vm.toggleHeader(props.request.id, index), keyOptions: COMMON_HEADERS, keyPlaceholder: "Header name", valuePlaceholder: "Value" }); }
    protected onDispose(): void { this.editor.dispose(); }
}
class HeadersJsonView extends VanillaView<HeadersBranchProps> {
    private readonly host: MonacoEditorHostView;
    public constructor(props: HeadersBranchProps) { const host = new MonacoEditorHostView({ initialValue: props.json, language: "json", options: BODY_EDITOR_OPTIONS, onChange: props.onJsonChange }); super(props, createPanelElement({ name: "headers-json", flex: 1, overflow: "hidden", minHeight: 0 }, [host.root])); this.host = host; }
    protected onMount(): void { this.own(() => this.host.dispose()); this.host.mount(); }
    protected onUpdate(props: HeadersBranchProps): void { this.host.update({ language: "json", options: BODY_EDITOR_OPTIONS, onChange: props.onJsonChange }); }
}

class BodyLanguageButtonView extends VanillaView<ButtonProps> {
    private readonly button: ButtonView;
    public constructor(props: ButtonProps, onOpen: () => void) { const button = new ButtonView({ ...props, onClick: onOpen }); super(props, document.createElement("span")); this.button = button; this.root.style.display = "contents"; }
    protected onMount(): void { this.root.append(this.button.root); this.button.mount(); }
    protected onUpdate(props: ButtonProps): void { this.button.update(props); }
    protected onDispose(): void { this.button.dispose(); }
}
class EmptyView extends VanillaView<Record<string, never>> { public constructor() { const root = document.createElement("span"); root.style.display = "contents"; super({}, root); } }

interface BodyContentProps { vm: RestClientSource; request: RestRequest; onMonacoChange: (value: string) => void; }
class BodyContentView extends VanillaView<BodyContentProps> {
    private readonly contentHost = document.createElement("span");
    private readonly swap = new SubtreeSwap<BodyType>(this.contentHost);
    private readonly valueGate: DepsGate = createDepsGate();
    private active: VanillaView<unknown> | undefined;
    private pending: VanillaView<unknown> | undefined;
    private key: BodyType | undefined;
    private bodyHost: MonacoEditorHostView | undefined;
    public constructor(props: BodyContentProps) { super(props, document.createElement("span")); this.root.style.display = "contents"; this.contentHost.style.display = "contents"; }
    protected onMount(): void { this.root.append(this.contentHost); this.own(() => this.swap.dispose()); this.sync(this.props); this.valueGate.prime([this.props.request.body, this.props.request.bodyType]); }
    protected onUpdate(props: BodyContentProps): void { this.sync(props); if (this.valueGate.changed([props.request.body, props.request.bodyType]) && props.request.bodyType === "raw") this.bodyHost?.setValue(props.request.body); }
    protected onDispose(): void { this.bodyHost = undefined; }
    private sync(props: BodyContentProps): void { const type = props.request.bodyType; if (this.active && this.key === type) { this.active.update(props); return; } this.pending = undefined; this.swap.set(type, () => { const branch = this.create(type, props); this.pending = branch; return branch; }); const branch = this.pending; this.pending = undefined; if (branch) { this.active = branch; this.key = type; branch.mount(); } }
    private create(type: BodyType, props: BodyContentProps): VanillaView<unknown> { if (type === "none") return new NoneBodyView(); if (type === "binary") return new BinaryBodyView(props); if (type === "form-data") return new FormDataEditorView(props); if (type === "form-urlencoded") return new FormUrlEncodedView(props); return new RawBodyView(props, this.setBodyHost); }
    private readonly setBodyHost = (host: MonacoEditorHostView | undefined): void => { this.bodyHost = host; };
}
class NoneBodyView extends VanillaView<Record<string, never>> { public constructor() { super({}, createPanelElement({ name: "body-content", direction: "column", flex: 1, overflow: "hidden", minHeight: 0 }, [createPanelElement({ paddingX: "md", paddingY: "sm" }, [createTextElement("This request has no body.", { color: "light", italic: true })])])); } }
class BinaryBodyView extends VanillaView<BodyContentProps> {
    private readonly path: HTMLSpanElement;
    private readonly button: ButtonView;
    public constructor(props: BodyContentProps) { const path = createTextElement(props.request.binaryFilePath || "No file selected", { size: "sm", truncate: true, color: props.request.binaryFilePath ? "default" : "light", italic: !props.request.binaryFilePath }); const button = new ButtonView({ size: "sm", title: "Select file", icon: "folder-open", onClick: () => undefined, children: "Select File" }); super(props, createPanelElement({ name: "body-content", direction: "column", flex: 1, overflow: "hidden", minHeight: 0 }, [createPanelElement({ name: "binary-body", direction: "column", gap: "sm", paddingX: "md", paddingY: "sm" }, [createPanelElement({ direction: "row", align: "center", gap: "sm" }, [button.root, createPanelElement({ flex: 1, minWidth: 0 }, [path])])])])); this.path = path; this.button = button; }
    protected onMount(): void { this.button.update({ size: "sm", title: "Select file", icon: "folder-open", onClick: () => void this.selectFile(), children: "Select File" }); this.own(() => this.button.dispose()); this.button.mount(); }
    protected onUpdate(props: BodyContentProps): void { this.path.textContent = props.request.binaryFilePath || "No file selected"; this.button.update({ size: "sm", title: "Select file", icon: "folder-open", onClick: () => void this.selectFile(), children: "Select File" }); }
    private async selectFile(): Promise<void> { const result = await app.fs.showOpenDialog(); if (result?.[0]) this.props.vm.updateRequest(this.props.request.id, { binaryFilePath: result[0] }); }
}
class FormUrlEncodedView extends VanillaView<BodyContentProps> {
    private readonly editor: KeyValueEditorView;
    public constructor(props: BodyContentProps) { const editor = new KeyValueEditorView({ items: props.request.formData, onUpdate: (index, changes) => props.vm.updateFormData(props.request.id, index, changes), onDelete: (index) => props.vm.deleteFormData(props.request.id, index), onToggle: (index) => props.vm.toggleFormData(props.request.id, index), keyPlaceholder: "Key", valuePlaceholder: "Value" }); super(props, createPanelElement({ name: "body-content", direction: "column", flex: 1, overflow: "hidden", minHeight: 0 }, [createPanelElement({ name: "body-content-scroll", direction: "column", flex: 1, overflowY: "auto", minHeight: 0, paddingX: "md", paddingBottom: "sm" }, [editor.root])])); this.editor = editor; }
    protected onMount(): void { this.editor.mount(); }
    protected onUpdate(props: BodyContentProps): void { this.editor.update({ items: props.request.formData, onUpdate: (index, changes) => props.vm.updateFormData(props.request.id, index, changes), onDelete: (index) => props.vm.deleteFormData(props.request.id, index), onToggle: (index) => props.vm.toggleFormData(props.request.id, index), keyPlaceholder: "Key", valuePlaceholder: "Value" }); }
    protected onDispose(): void { this.editor.dispose(); }
}
class RawBodyView extends VanillaView<BodyContentProps> {
    private readonly host: MonacoEditorHostView;
    private readonly setHost: (host: MonacoEditorHostView | undefined) => void;
    public constructor(props: BodyContentProps, setHost: (host: MonacoEditorHostView | undefined) => void) { const host = new MonacoEditorHostView({ initialValue: props.request.body, language: props.request.bodyLanguage, options: BODY_EDITOR_OPTIONS, onMount: setHost, onChange: props.onMonacoChange }); super(props, createPanelElement({ name: "body-content", direction: "column", flex: 1, overflow: "hidden", minHeight: 0 }, [host.root])); this.host = host; this.setHost = setHost; }
    protected onMount(): void { this.own(() => this.host.dispose()); this.host.mount(); }
    protected onUpdate(props: BodyContentProps): void { this.host.update({ language: props.request.bodyLanguage, options: BODY_EDITOR_OPTIONS, onChange: props.onMonacoChange }); }
    protected onDispose(): void { this.setHost(undefined); }
}

interface FormDataRowProps { vm: RestClientSource; request: RestRequest; entry: FormDataEntry; index: number; isLast: boolean; }
class FormDataEditorView extends VanillaView<BodyContentProps> {
    private readonly list: KeyedList<{ entry: FormDataEntry; index: number }, number, HTMLDivElement>;
    private readonly rows = new Map<HTMLDivElement, FormDataRowView>();
    public constructor(props: BodyContentProps) { const root = createPanelElement({ name: "form-data-editor", direction: "column", gap: "xs" }); super(props, root); this.list = new KeyedList(root, { keyOf: (item) => item.index, create: (item) => { const row = new FormDataRowView(this.rowProps(item)); row.mount(); this.rows.set(row.root as HTMLDivElement, row); return row.root as HTMLDivElement; }, update: (element, item) => this.rows.get(element)?.update(this.rowProps(item)), remove: (element) => { this.rows.get(element)?.dispose(); this.rows.delete(element); } }); }
    protected onMount(): void { this.own(() => this.list.dispose()); this.updateList(this.props); }
    protected onUpdate(props: BodyContentProps): void { this.updateList(props); }
    private updateList(props: BodyContentProps): void { this.list.update(props.request.formDataEntries.map((entry, index) => ({ entry, index }))); }
    private rowProps(item: { entry: FormDataEntry; index: number }): FormDataRowProps { return { vm: this.props.vm, request: this.props.request, entry: item.entry, index: item.index, isLast: item.index === this.props.request.formDataEntries.length - 1 }; }
}
class FormDataRowView extends VanillaView<FormDataRowProps> {
    private readonly valueHost = document.createElement("span");
    private readonly deleteHost = document.createElement("span");
    private readonly valueSwap = new SubtreeSwap<"file" | "text">(this.valueHost);
    private readonly deleteSwap = new SubtreeSwap<"spacer" | "delete">(this.deleteHost);
    private keyInput: TextareaView | undefined;
    private checkbox: CheckboxView | undefined;
    private toggleButton: ButtonView | undefined;
    private valueBranch: VanillaView<unknown> | undefined;
    private deleteBranch: VanillaView<unknown> | undefined;
    private pendingValue: VanillaView<unknown> | undefined;
    private pendingDelete: VanillaView<unknown> | undefined;
    private valueKey: "file" | "text" | undefined;
    private deleteKey: "spacer" | "delete" | undefined;
    public constructor(props: FormDataRowProps) { super(props, createPanelElement({ name: "form-data-row", direction: "row", align: "start", gap: "xs", paddingTop: "xs", dimmed: !props.entry.enabled })); this.valueHost.style.display = "contents"; this.deleteHost.style.display = "contents"; }
    protected onMount(): void { const checkSlot = createPanelElement({ name: "form-data-check-slot", paddingTop: "sm", shrink: false }); const checkbox = this.child(new CheckboxView(this.checkboxProps())); const type = this.child(new ButtonView(this.typeProps())); const keyInput = this.child(new TextareaView(this.keyProps())); const keySlot = createPanelElement({ name: "form-data-key-slot", width: "30%", minWidth: 80, shrink: false }, [keyInput.root]); checkSlot.append(checkbox.root); this.checkbox = checkbox; this.keyInput = keyInput; this.toggleButton = type; this.root.append(checkSlot, type.root, keySlot, this.valueHost, this.deleteHost); checkbox.mount(); type.mount(); keyInput.mount(); this.syncValue(); this.syncDelete(); }
    protected onUpdate(props: FormDataRowProps): void { applyPanelAttributes(this.root, resolvePanelAttributes({ name: "form-data-row", direction: "row", align: "start", gap: "xs", paddingTop: "xs", dimmed: !props.entry.enabled })); this.checkbox?.update(this.checkboxProps()); this.keyInput?.update(this.keyProps()); this.toggleButton?.update(this.typeProps()); this.syncValue(); this.syncDelete(); }
    protected onDispose(): void { this.valueSwap.dispose(); this.deleteSwap.dispose(); this.checkbox = undefined; }
    private checkboxProps(): CheckboxProps { return { checked: this.props.entry.enabled, onChange: () => this.props.vm.toggleFormDataEntry(this.props.request.id, this.props.index) }; }
    private keyProps(): TextareaProps { return { name: "form-data-key", variant: "ghost", singleLine: true, value: this.props.entry.key, onChange: (value) => this.props.vm.updateFormDataEntry(this.props.request.id, this.props.index, { key: value }), placeholder: "Key", flex: "1 1 0", minWidth: 0, minHeight: 24 }; }
    private typeProps(): ButtonProps { return { name: "form-data-type-toggle", size: "sm", variant: "ghost", title: "Toggle text/file", onClick: () => this.props.vm.updateFormDataEntry(this.props.request.id, this.props.index, { type: this.props.entry.type === "text" ? "file" : "text", value: "" }), children: this.props.entry.type === "file" ? "File" : "Text" }; }
    private syncValue(): void { const key = this.props.entry.type; if (this.valueBranch && this.valueKey === key) { this.valueBranch.update(this.props); return; } this.pendingValue = undefined; this.valueSwap.set(key, () => { const branch = key === "file" ? new FormFileValueView(this.props) : new FormTextValueView(this.props); this.pendingValue = branch; return branch; }); const branch = this.pendingValue; this.pendingValue = undefined; if (branch) { this.valueBranch = branch; this.valueKey = key; branch.mount(); } }
    private syncDelete(): void { const key = this.props.isLast && !this.props.entry.key && !this.props.entry.value ? "spacer" : "delete"; if (this.deleteBranch && this.deleteKey === key) return; this.pendingDelete = undefined; this.deleteSwap.set(key, () => { const branch = key === "spacer" ? new StaticSpacerView() : new IconButtonView({ name: "form-data-delete", size: "sm", icon: "close", title: "Delete", onClick: () => this.props.vm.deleteFormDataEntry(this.props.request.id, this.props.index) }); this.pendingDelete = branch; return branch; }); const branch = this.pendingDelete; this.pendingDelete = undefined; if (branch) { this.deleteBranch = branch; this.deleteKey = key; branch.mount(); } }
}
class StaticSpacerView extends VanillaView<Record<string, never>> { public constructor() { super({}, createPanelElement({ width: 24, shrink: false })); } }
class FormTextValueView extends VanillaView<FormDataRowProps> { private readonly input: TextareaView; public constructor(props: FormDataRowProps) { const input = new TextareaView({ name: "form-data-value", variant: "ghost", singleLine: true, value: props.entry.value, onChange: (value) => props.vm.updateFormDataEntry(props.request.id, props.index, { value }), placeholder: "Value", flex: "1 1 0", minWidth: 0, minHeight: 24 }); super(props, input.root); this.input = input; } protected onMount(): void { this.own(() => this.input.dispose()); this.input.mount(); } protected onUpdate(props: FormDataRowProps): void { this.input.update({ name: "form-data-value", variant: "ghost", singleLine: true, value: props.entry.value, onChange: (value) => props.vm.updateFormDataEntry(props.request.id, props.index, { value }), placeholder: "Value", flex: "1 1 0", minWidth: 0, minHeight: 24 }); } }
class FormFileValueView extends VanillaView<FormDataRowProps> { private readonly text: HTMLSpanElement; private readonly button: IconButtonView; public constructor(props: FormDataRowProps) { const text = createTextElement(props.entry.value || "No file selected", { size: "sm", truncate: true, color: props.entry.value ? "default" : "light", italic: !props.entry.value }); const button = new IconButtonView({ name: "form-data-browse", size: "sm", icon: "folder-open", title: "Browse", onClick: () => undefined }); super(props, createPanelElement({ direction: "row", align: "center", gap: "xs", flex: "1 1 0", minWidth: 0 }, [button.root, createPanelElement({ flex: "1 1 0", minWidth: 0 }, [text])])); this.text = text; this.button = button; } protected onMount(): void { this.button.update({ name: "form-data-browse", size: "sm", icon: "folder-open", title: "Browse", onClick: () => void this.browse() }); this.own(() => this.button.dispose()); this.button.mount(); } protected onUpdate(props: FormDataRowProps): void { this.text.textContent = props.entry.value || "No file selected"; this.button.update({ name: "form-data-browse", size: "sm", icon: "folder-open", title: "Browse", onClick: () => void this.browse() }); } private async browse(): Promise<void> { const result = await app.fs.showOpenDialog(); if (result?.[0]) this.props.vm.updateFormDataEntry(this.props.request.id, this.props.index, { value: result[0] }); } }

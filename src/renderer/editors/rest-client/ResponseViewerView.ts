import { createFileTypeIconElement } from "../../components/icons/icon-elements";
import { app } from "../../api/app";
import { pagesModel } from "../../api/pages";
import { createComponentModelDriver, TComponentModel, type ComponentModelDriver } from "../../core/state/model";
import { createDepsGate, type DepsGate } from "../../uikit/shared/deps-gate";
import { SubtreeSwap } from "../../uikit/shared/subtree-swap";
import { KeyedList } from "../../uikit/shared/keyed-list";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import type { ButtonProps } from "../../uikit/Button/ButtonView";
import { ButtonView } from "../../uikit/Button/ButtonView";
import type { IconButtonProps } from "../../uikit/IconButton/IconButtonView";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import type { SegmentedControlProps } from "../../uikit/SegmentedControl/SegmentedControlView";
import { SegmentedControlView } from "../../uikit/SegmentedControl/SegmentedControlView";
import { SpacerView } from "../../uikit/Spacer/SpacerView";
import type { RestResponse, RestHeader } from "./restClientTypes";
import { MonacoEditorHostView } from "../shared/MonacoEditorHostView";
import type { MenuHandle } from "../../uikit/Menu/attach-menu";
import { openMenu } from "../../uikit/Menu/attach-menu";
import type { MenuItem } from "../../uikit/Menu/types";
import "../../uikit/Button/Button.css";
import "../../uikit/IconButton/IconButton.css";
import "../../uikit/SegmentedControl/SegmentedControl.css";

const RESPONSE_LANGUAGES = ["json", "html", "xml", "javascript", "css", "yaml", "plaintext"];

const EDITOR_OPTIONS: import("monaco-editor").editor.IStandaloneEditorConstructionOptions = {
    automaticLayout: true,
    minimap: { enabled: false },
    lineNumbers: "off",
    scrollBeyondLastLine: false,
    wordWrap: "on",
    folding: true,
    renderLineHighlight: "none",
    overviewRulerLanes: 0,
    padding: { top: 4, bottom: 4 },
    scrollbar: { alwaysConsumeMouseWheel: false },
};

type ResponseTab = "body" | "headers";

export interface ResponseViewerProps {
    response: RestResponse | null;
    responseTime: number;
    executing: boolean;
}

interface ResponseViewerState {
    activeTab: ResponseTab;
    languageOverride: string | null;
    headersView: "table" | "json";
}

const defaultResponseViewerState: ResponseViewerState = {
    activeTab: "body",
    languageOverride: null,
    headersView: "table",
};

class ResponseViewerModel extends TComponentModel<ResponseViewerState, ResponseViewerProps> {
    setActiveTab = (activeTab: ResponseTab): void => {
        this.state.update((state) => { state.activeTab = activeTab; });
    };

    setLanguageOverride = (languageOverride: string | null): void => {
        this.state.update((state) => { state.languageOverride = languageOverride; });
    };

    setHeadersView = (headersView: "table" | "json"): void => {
        this.state.update((state) => { state.headersView = headersView; });
    };
}

function detectLanguageFromHeaders(headers: RestHeader[]): string {
    const contentType = headers.find((header) => header.key.toLowerCase() === "content-type")?.value || "";
    if (contentType.includes("json")) return "json";
    if (contentType.includes("html")) return "html";
    if (contentType.includes("xml")) return "xml";
    if (contentType.includes("css")) return "css";
    if (contentType.includes("javascript")) return "javascript";
    return "plaintext";
}

function formatBody(body: string, language: string): string {
    if (language === "json") {
        try {
            return JSON.stringify(JSON.parse(body), null, 2);
        } catch {
            // Preserve non-JSON response text.
        }
    }
    return body;
}

function getExtensionFromContentType(contentType: string): string {
    const extensions: Record<string, string> = {
        "image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp",
        "image/svg+xml": ".svg", "application/pdf": ".pdf", "application/zip": ".zip",
        "application/gzip": ".gz", "application/octet-stream": ".bin",
    };
    for (const [type, extension] of Object.entries(extensions)) {
        if (contentType.includes(type)) return extension;
    }
    return ".bin";
}

export class ResponseViewerView extends VanillaView<ResponseViewerProps> {
    private readonly driver: ComponentModelDriver<ResponseViewerState, ResponseViewerProps, ResponseViewerModel>;
    private readonly branchHost = document.createElement("span");
    private readonly swap = new SubtreeSwap<"executing" | "empty" | "response">(this.branchHost);
    private readonly responseResetGate: DepsGate = createDepsGate();
    private readonly bodyValueGate: DepsGate = createDepsGate();
    private readonly headersValueGate: DepsGate = createDepsGate();
    private live = false;
    private activeBranch: VanillaView<unknown> | undefined;
    private pendingBranch: VanillaView<unknown> | undefined;
    private currentKey: "executing" | "empty" | "response" | undefined;
    private formattedBodyHost: MonacoEditorHostView | undefined;
    private headersJsonHost: MonacoEditorHostView | undefined;

    public constructor(props: ResponseViewerProps) {
        super(props, createPanelElement({ name: "response-viewer", direction: "column", flex: 1, overflow: "hidden", minHeight: 0 }));
        this.branchHost.style.display = "contents";
        this.driver = createComponentModelDriver(props, ResponseViewerModel, defaultResponseViewerState);
    }

    protected onMount(): void {
        this.live = true;
        this.own(() => { this.live = false; });
        this.own(() => this.swap.dispose());
        this.own(() => this.driver.dispose());
        this.root.append(this.branchHost);
        this.driver.mount();
        this.bind(this.driver.model.state, (state) => state, this.sync);
        this.responseResetGate.prime([this.props.response]);
        const state = this.driver.model.state.get();
        const derived = this.derived(this.props, state);
        this.bodyValueGate.prime([state.activeTab, this.props.executing, derived.formattedBody, this.props.response]);
        this.headersValueGate.prime([state.activeTab, this.props.executing, derived.headersAsJson, state.headersView, this.props.response]);
    }

    protected onUpdate(props: ResponseViewerProps): void {
        this.driver.update(props);
        this.sync(this.driver.model.state.get());
    }

    protected onDispose(): void {
        this.activeBranch = undefined;
        this.pendingBranch = undefined;
        this.formattedBodyHost = undefined;
        this.headersJsonHost = undefined;
    }

    private readonly sync = (state: ResponseViewerState): void => {
        const props = this.props;
        if (this.responseResetGate.changed([props.response])) {
            queueMicrotask(() => {
                if (this.live) this.driver.model.setLanguageOverride(null);
            });
        }
        const derived = this.derived(props, state);
        const key = props.executing ? "executing" : !props.response ? "empty" : "response";
        if (this.activeBranch && this.currentKey === key) {
            this.activeBranch.update(this.branchProps(state, derived));
        } else {
            this.pendingBranch = undefined;
            this.swap.set(key, () => {
                const branch = this.createBranch(key, state, derived);
                this.pendingBranch = branch;
                return branch;
            });
            const branch = this.pendingBranch;
            this.pendingBranch = undefined;
            if (branch) {
                this.activeBranch = branch;
                this.currentKey = key;
                branch.mount();
            }
        }

        if (this.bodyValueGate.changed([state.activeTab, props.executing, derived.formattedBody, props.response])) {
            if (!props.executing && props.response && state.activeTab === "body" && !props.response.isBinary) {
                this.formattedBodyHost?.setValue(derived.formattedBody);
            }
        }
        if (this.headersValueGate.changed([state.activeTab, props.executing, derived.headersAsJson, state.headersView, props.response])) {
            if (!props.executing && props.response && state.activeTab === "headers" && state.headersView === "json") {
                this.headersJsonHost?.setValue(derived.headersAsJson);
            }
        }
    };

    private derived(props: ResponseViewerProps, state: ResponseViewerState): DerivedResponse {
        const response = props.response;
        const headersAsJson = response ? JSON.stringify(Object.fromEntries(response.headers.map((header) => [header.key, header.value])), null, 2) : "";
        const language = state.languageOverride ?? (response ? detectLanguageFromHeaders(response.headers) : "plaintext");
        return {
            headersAsJson,
            language,
            formattedBody: response ? formatBody(response.body, language) : "",
            bodySize: response ? (response.isBinary ? formatResponseSize(Math.floor(response.body.length * 3 / 4)) : formatResponseSize(new Blob([response.body]).size)) : "",
        };
    }

    private branchProps(state: ResponseViewerState, derived: DerivedResponse): ResponseBranchProps {
        return { model: this.driver.model, response: this.props.response, responseTime: this.props.responseTime, state, derived, setBodyHost: this.setBodyHost, setHeadersHost: this.setHeadersHost };
    }

    private createBranch(key: "executing" | "empty" | "response", state: ResponseViewerState, derived: DerivedResponse): VanillaView<unknown> {
        if (key === "executing") return new ResponseMessageView("Sending request...");
        if (key === "empty") return new ResponseMessageView("Send a request to see the response.");
        return new ResponseBranchView(this.branchProps(state, derived));
    }

    private readonly setBodyHost = (host: MonacoEditorHostView | undefined): void => { this.formattedBodyHost = host; };
    private readonly setHeadersHost = (host: MonacoEditorHostView | undefined): void => { this.headersJsonHost = host; };
}

interface DerivedResponse {
    headersAsJson: string;
    language: string;
    formattedBody: string;
    bodySize: string;
}

interface ResponseBranchProps {
    model: ResponseViewerModel;
    response: RestResponse | null;
    responseTime: number;
    state: ResponseViewerState;
    derived: DerivedResponse;
    setBodyHost: (host: MonacoEditorHostView | undefined) => void;
    setHeadersHost: (host: MonacoEditorHostView | undefined) => void;
}

class ResponseMessageView extends VanillaView<Record<string, never>> {
    public constructor(message: string) {
        super({}, createPanelElement({ name: "response-viewer", direction: "column", flex: 1, overflow: "hidden" }, [
            createPanelElement({ paddingX: "md", paddingY: "sm" }, [createTextElement(message, { color: "light", italic: true })]),
        ]));
    }
}

class ResponseBranchView extends VanillaView<ResponseBranchProps> {
    private readonly contentHost = document.createElement("span");
    private readonly bodySwap = new SubtreeSwap<"text" | "binary" | "table" | "json">(this.contentHost);
    private tabControl: SegmentedControlView | undefined;
    private bodyActions: HTMLSpanElement | undefined;
    private headersActions: HTMLSpanElement | undefined;
    private bodyOpenButton: IconButtonView | undefined;
    private languageButton: ButtonView | undefined;
    private headersControl: SegmentedControlView | undefined;
    private headersCopyButton: IconButtonView | undefined;
    private spacer: SpacerView | undefined;
    private languageMenu: MenuHandle | undefined;
    private activeContent: VanillaView<unknown> | undefined;
    private pendingContent: VanillaView<unknown> | undefined;
    private contentKey: "text" | "binary" | "table" | "json" | undefined;

    public constructor(props: ResponseBranchProps) {
        super(props, createPanelElement({ name: "response-viewer", direction: "column", flex: "1 1 0", overflow: "hidden", minHeight: 0 }));
        this.contentHost.style.display = "contents";
    }

    protected onMount(): void {
        const tabs = this.child(new SegmentedControlView(this.tabProps()));
        const spacer = this.child(new SpacerView({}));
        const bodyActions = document.createElement("span");
        const headersActions = document.createElement("span");
        bodyActions.style.display = "contents";
        headersActions.style.display = "contents";
        const openButton = this.child(new IconButtonView(this.openButtonProps()));
        const languageButton = this.child(new ButtonView(this.languageButtonProps()));
        const headersControl = this.child(new SegmentedControlView(this.headersControlProps()));
        const headersCopyButton = this.child(new IconButtonView(this.headersCopyProps()));
        bodyActions.append(openButton.root, languageButton.root);
        headersActions.append(headersControl.root, headersCopyButton.root);
        this.tabControl = tabs;
        this.spacer = spacer;
        this.bodyActions = bodyActions;
        this.headersActions = headersActions;
        this.bodyOpenButton = openButton;
        this.languageButton = languageButton;
        this.headersControl = headersControl;
        this.headersCopyButton = headersCopyButton;
        const header = createPanelElement({ name: "response-tabs", direction: "row", align: "center", gap: "xs", paddingX: "sm", paddingY: "xs", shrink: false }, [tabs.root, spacer.root, bodyActions, headersActions]);
        this.root.append(header, createPanelElement({ name: "response-tab-body", direction: "column", flex: "1 1 0", overflowX: "hidden", overflowY: "auto", minHeight: 0 }, [this.contentHost]));
        tabs.mount();
        spacer.mount();
        openButton.mount();
        languageButton.mount();
        headersControl.mount();
        headersCopyButton.mount();
        this.own(() => this.bodySwap.dispose());
        this.sync(this.props);
    }

    protected onUpdate(props: ResponseBranchProps): void {
        this.tabControl?.update(this.tabProps(props));
        this.languageButton?.update(this.languageButtonProps(props));
        this.headersControl?.update(this.headersControlProps(props));
        this.sync(props);
    }

    protected onDispose(): void {
        this.languageMenu?.dispose();
        this.languageMenu = undefined;
        this.props.setBodyHost(undefined);
        this.props.setHeadersHost(undefined);
    }

    private sync(props: ResponseBranchProps): void {
        const response = props.response;
        if (!response) return;
        const key = props.state.activeTab === "body"
            ? (response.isBinary ? "binary" : "text")
            : props.state.headersView;
        if (this.activeContent && this.contentKey === key) {
            this.activeContent.update(this.contentProps(key));
        } else {
            this.pendingContent = undefined;
            this.bodySwap.set(key, () => {
                const branch = this.createContent(key);
                this.pendingContent = branch;
                return branch;
            });
            const branch = this.pendingContent;
            this.pendingContent = undefined;
            if (branch) {
                this.activeContent = branch;
                this.contentKey = key;
                branch.mount();
            }
        }
        this.bodyActions?.toggleAttribute("hidden", props.state.activeTab !== "body" || response.isBinary);
        this.headersActions?.toggleAttribute("hidden", props.state.activeTab !== "headers");
        if (this.languageMenu) this.languageMenu.update({ items: this.languageItems(props.derived.language), onClose: this.clearLanguageMenu });
    }

    private contentProps(key: "text" | "binary" | "table" | "json"): ResponseContentProps {
        return { response: this.props.response as RestResponse, derived: this.props.derived, setBodyHost: this.props.setBodyHost, setHeadersHost: this.props.setHeadersHost, key };
    }

    private createContent(key: "text" | "binary" | "table" | "json"): VanillaView<unknown> {
        return key === "text" ? new ResponseTextView(this.contentProps(key))
            : key === "binary" ? new ResponseBinaryView(this.contentProps(key), this.saveBinary, this.openImage)
                : key === "table" ? new ResponseHeadersTableView(this.contentProps(key))
                    : new ResponseHeadersJsonView(this.contentProps(key));
    }

    private tabProps(props: ResponseBranchProps = this.props): SegmentedControlProps {
        return { name: "response-tab-select", size: "sm", value: props.state.activeTab, onChange: (value) => this.propsModel().setActiveTab(value as ResponseTab), items: [{ value: "body", label: `Body${props.derived.bodySize ? ` (${props.derived.bodySize})` : ""}` }, { value: "headers", label: `Headers (${props.response?.headers.length ?? 0})` }] };
    }

    private headersControlProps(props: ResponseBranchProps = this.props): SegmentedControlProps {
        return { name: "response-headers-view", size: "sm", value: props.state.headersView, onChange: (value) => this.propsModel().setHeadersView(value as "table" | "json"), items: [{ value: "table", label: "Table" }, { value: "json", label: "JSON" }] };
    }

    private openButtonProps(): IconButtonProps { return { name: "response-open-in-tab", size: "sm", icon: "new-window", title: "Open in new tab", onClick: this.openInTab }; }
    private headersCopyProps(): IconButtonProps { return { name: "response-copy-headers", size: "sm", icon: "copy", title: "Copy headers as JSON", onClick: this.copyHeaders }; }
    private languageButtonProps(props: ResponseBranchProps = this.props): ButtonProps { return { name: "response-language", size: "sm", variant: "ghost", icon: createFileTypeIconElement({ language: props.derived.language, width: 16, height: 16 }), title: "Change response language", onClick: this.openLanguageMenu, children: props.derived.language }; }

    private languageItems(language: string): MenuItem[] {
        return RESPONSE_LANGUAGES.map((item) => ({ label: item, icon: createFileTypeIconElement({ language: item, width: 16, height: 16 }), selected: item === language, onClick: () => this.propsModel().setLanguageOverride(item) }));
    }

    private readonly clearLanguageMenu = (): void => { this.languageMenu = undefined; };
    private readonly openLanguageMenu = (): void => {
        this.languageMenu?.dispose();
        this.languageMenu = openMenu(this.languageButton?.root ?? this.root, { items: this.languageItems(this.props.derived.language), onClose: this.clearLanguageMenu });
    };

    private propsModel(): ResponseViewerModel { return this.props.model; }

    private readonly openInTab = (): void => {
        if (!this.props.response) return;
        app.pages.addEditorPage("monaco", this.props.derived.language, "Response", this.props.derived.formattedBody);
    };
    private readonly copyHeaders = async (): Promise<void> => {
        if (!this.props.response) return;
        await navigator.clipboard.writeText(this.props.derived.headersAsJson);
        await new Promise((resolve) => setTimeout(resolve, 200));
    };
    private readonly saveBinary = async (): Promise<void> => {
        const response = this.props.response;
        if (!response?.isBinary) return;
        const path = await app.fs.showSaveDialog({ defaultPath: `response${getExtensionFromContentType(response.contentType || "")}` });
        if (path) await app.fs.writeBinary(path, Buffer.from(response.body, "base64"));
    };
    private readonly openImage = (): void => {
        const response = this.props.response;
        if (!response?.isBinary) return;
        const blob = new Blob([Buffer.from(response.body, "base64")], { type: response.contentType || "image/png" });
        pagesModel.openImageInNewTab(URL.createObjectURL(blob));
    };
}

interface ResponseContentProps {
    response: RestResponse;
    derived: DerivedResponse;
    setBodyHost: (host: MonacoEditorHostView | undefined) => void;
    setHeadersHost: (host: MonacoEditorHostView | undefined) => void;
    key: "text" | "binary" | "table" | "json";
}

class ResponseTextView extends VanillaView<ResponseContentProps> {
    private host: MonacoEditorHostView | undefined;
    public constructor(props: ResponseContentProps) {
        const host = new MonacoEditorHostView({ initialValue: props.derived.formattedBody, language: props.derived.language, options: EDITOR_OPTIONS, onMount: (view) => props.setBodyHost(view) });
        super(props, host.root);
        this.host = host;
    }
    protected onMount(): void { this.own(() => this.host?.dispose()); this.host?.mount(); }
    protected onUpdate(props: ResponseContentProps): void { this.host?.update({ initialValue: props.derived.formattedBody, language: props.derived.language, options: EDITOR_OPTIONS }); }
    protected onDispose(): void { this.props.setBodyHost(undefined); }
}

class ResponseHeadersJsonView extends VanillaView<ResponseContentProps> {
    private host: MonacoEditorHostView | undefined;
    public constructor(props: ResponseContentProps) {
        const host = new MonacoEditorHostView({ initialValue: props.derived.headersAsJson, language: "json", options: { ...EDITOR_OPTIONS, readOnly: true }, onMount: (view) => props.setHeadersHost(view) });
        super(props, host.root); this.host = host;
    }
    protected onMount(): void { this.own(() => this.host?.dispose()); this.host?.mount(); }
    protected onUpdate(_props: ResponseContentProps): void { this.host?.update({ language: "json", options: { ...EDITOR_OPTIONS, readOnly: true } }); }
    protected onDispose(): void { this.props.setHeadersHost(undefined); }
}

class ResponseHeadersTableView extends VanillaView<ResponseContentProps> {
    private readonly list: KeyedList<{ header: RestHeader; index: number }, number, HTMLDivElement>;
    private readonly rows = new Map<HTMLDivElement, VanillaView<RestHeader>>();
    public constructor(props: ResponseContentProps) {
        const root = createPanelElement({ name: "response-headers-list", direction: "column", paddingX: "md", paddingY: "xs", gap: "xs" });
        super(props, root);
        this.list = new KeyedList(root, { keyOf: (entry) => entry.index, create: (entry) => { const row = new ResponseHeaderRowView(entry.header); row.mount(); this.rows.set(row.root as HTMLDivElement, row); return row.root as HTMLDivElement; }, update: (element, entry) => this.rows.get(element)?.update(entry.header), remove: (element) => { this.rows.get(element)?.dispose(); this.rows.delete(element); } });
    }
    protected onMount(): void { this.own(() => this.list.dispose()); this.list.update(this.items()); }
    protected onUpdate(props: ResponseContentProps): void { this.list.update(this.items(props)); }
    private items(props: ResponseContentProps = this.props): Array<{ header: RestHeader; index: number }> { return props.response.headers.map((header, index) => ({ header, index })); }
}

class ResponseHeaderRowView extends VanillaView<RestHeader> {
    private readonly value: HTMLSpanElement;
    public constructor(header: RestHeader) {
        const value = createTextElement(header.value, { color: "default", size: "sm" });
        super(header, createPanelElement({ direction: "row", gap: "md", align: "start", shrink: false }, [createTextElement(header.key, { color: "light", size: "sm", nowrap: true }), createPanelElement({ flex: "1 1 0", minWidth: 0, wordBreak: "break-all" }, [value])])); this.value = value;
    }
    protected onUpdate(header: RestHeader): void { this.value.textContent = header.value; }
}

class ResponseBinaryView extends VanillaView<ResponseContentProps> {
    private readonly image = document.createElement("img");
    private blobUrl = "";
    private readonly save: () => Promise<void>;
    private readonly open: () => void;
    private readonly message: HTMLSpanElement;
    private readonly actions: HTMLDivElement;
    private openButton: ButtonView | undefined;
    public constructor(props: ResponseContentProps, save: () => Promise<void>, open: () => void) {
        const root = createPanelElement({ name: "response-binary", direction: "column", align: "center", justify: "center", gap: "md", padding: "lg", flex: 1, overflowY: "auto" });
        const message = createTextElement("", { color: "light", italic: true, align: "center" });
        const actions = createPanelElement({ name: "response-binary-actions", direction: "row", gap: "sm" });
        super(props, root); this.save = save; this.open = open; this.message = message; this.actions = actions;
        this.image.alt = "Response"; this.image.style.maxWidth = "100%"; this.image.style.maxHeight = "300px"; this.image.style.objectFit = "contain";
    }
    protected onMount(): void {
        const saveButton = this.child(new ButtonView({ icon: "save", onClick: this.save, children: "Save to File" }));
        const openButton = this.child(new ButtonView({ icon: "new-window", onClick: this.open, children: "Open in Image Viewer" }));
        this.openButton = openButton;
        this.actions.append(saveButton.root, openButton.root);
        this.root.append(this.message, this.image, this.actions);
        saveButton.mount(); openButton.mount();
        this.sync();
    }
    protected onUpdate(): void { this.sync(); }
    protected onDispose(): void { if (this.blobUrl) URL.revokeObjectURL(this.blobUrl); }
    private sync(): void {
        const response = this.props.response; const isImage = (response.contentType || "").startsWith("image/");
        this.message.textContent = `Binary response — ${response.contentType || "unknown type"} (${this.props.derived.bodySize})`;
        this.image.hidden = !isImage;
        this.openButton?.root.toggleAttribute("hidden", !isImage);
        if (isImage) {
            if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
            this.blobUrl = URL.createObjectURL(new Blob([Buffer.from(response.body, "base64")], { type: response.contentType || "image/png" }));
            this.image.src = this.blobUrl;
        } else if (this.blobUrl) {
            URL.revokeObjectURL(this.blobUrl);
            this.blobUrl = "";
        }
    }
}

export function formatResponseSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getResponseSize(response: RestResponse | null): string {
    return response ? formatResponseSize(new Blob([response.body]).size) : "";
}

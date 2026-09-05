import { settings } from "../../../api/settings";
import { createComponentModelDriver, type ComponentModelDriver } from "../../../core/state/model";
import { ColorizedCodeView } from "../../shared/ColorizedCodeView";
import { ButtonView } from "../../../uikit/Button/ButtonView";
import type { ButtonProps } from "../../../uikit/Button/ButtonView";
import { CheckboxView } from "../../../uikit/Checkbox/CheckboxView";
import type { CheckboxProps } from "../../../uikit/Checkbox/CheckboxView";
import { DotView } from "../../../uikit/Dot/DotView";
import { InputView } from "../../../uikit/Input/InputView";
import type { InputProps } from "../../../uikit/Input/InputView";
import { SubtreeSwap } from "../../../uikit/shared/subtree-swap";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import { McpSectionModel, defaultMcpSectionState, type McpSectionProps, type McpSectionState } from "./McpSectionModel";
import { createSectionRoot, panel, text } from "./settings-native";
import "../../../uikit/Button/Button.css";
import "../../../uikit/Checkbox/Checkbox.css";
import "../../../uikit/Dot/Dot.css";
import "../../../uikit/Input/Input.css";

interface StatusProps {
    status: { running: boolean; url: string; clientCount: number } | { running: boolean; url: string };
    mneme: boolean;
    copied: string | null;
    onCopy: (value: string, label: string) => void;
}

class McpStatusView extends VanillaView<StatusProps> {
    private readonly statusPanel: HTMLDivElement;
    private readonly urlPanel: HTMLDivElement;
    private readonly dot: DotView;
    private readonly statusText: HTMLSpanElement;
    private readonly urlText: HTMLSpanElement;
    private readonly copyButton: ButtonView;

    public constructor(props: StatusProps) {
        const statusPanel = panel({ direction: "row", align: "center", gap: "md", paddingBottom: "lg" });
        const urlPanel = panel({ direction: "row", align: "center", gap: "md", paddingBottom: "lg" });
        const root = document.createElement("div");
        root.dataset.type = "settings-mcp-status";
        super(props, root);
        this.statusPanel = statusPanel;
        this.urlPanel = urlPanel;
        this.dot = this.child(new DotView({ size: "sm", color: props.status.running ? "success" : "neutral" }));
        this.statusText = text("", { size: "sm", color: "light" });
        this.urlText = document.createElement("span");
        this.urlText.dataset.type = "settings-url";
        this.copyButton = this.child(new ButtonView(this.copyButtonProps(props)));
    }

    protected onMount(): void {
        this.statusPanel.append(this.dot.root, this.statusText);
        this.urlPanel.append(this.urlText, this.copyButton.root);
        this.root.append(this.statusPanel, this.urlPanel);
        this.dot.mount();
        this.copyButton.mount();
        this.applyProps(this.props);
    }

    protected onUpdate(props: StatusProps): void {
        this.applyProps(props);
    }

    protected onDispose(): void {
        this.root.replaceChildren();
    }

    private applyProps(props: StatusProps): void {
        const running = props.status.running;
        const status = props.status as { running: boolean; url: string; clientCount?: number };
        this.dot.update({ size: "sm", color: running ? "success" : "neutral" });
        const clients = status.clientCount && status.clientCount > 0
            ? ` — ${status.clientCount} client${status.clientCount !== 1 ? "s" : ""} connected`
            : "";
        this.statusText.textContent = props.mneme
            ? running ? "Running" : "Stopped"
            : running ? `Running${clients}` : "Stopped";
        this.urlText.textContent = props.status.url;
        this.copyButton.update(this.copyButtonProps(props));
    }

    private copyButtonProps(props: StatusProps): ButtonProps {
        const label = props.mneme ? "mneme-url" : "url";
        return {
            variant: "default",
            size: "sm",
            background: "light",
            onClick: () => props.onCopy(props.status.url, label),
            children: props.copied === label ? "Copied!" : "Copy URL",
        };
    }
}

export class McpSectionView extends VanillaView<Record<string, never>> {
    private driver: ComponentModelDriver<McpSectionState, McpSectionProps, McpSectionModel> | undefined;
    private model: McpSectionModel | undefined;
    private mcpEnabledCheckbox: CheckboxView | undefined;
    private browserToolsCheckbox: CheckboxView | undefined;
    private mainScriptsCheckbox: CheckboxView | undefined;
    private mnemeEnabledCheckbox: CheckboxView | undefined;
    private portInput: InputView | undefined;
    private mnemePortInput: InputView | undefined;
    private configCode: ColorizedCodeView | undefined;
    private configCopyButton: ButtonView | undefined;
    private mcpStatusSwap: SubtreeSwap<string> | undefined;
    private mnemeStatusSwap: SubtreeSwap<string> | undefined;

    public constructor(props: Record<string, never>) {
        super(props, createSectionRoot("settings-section"));
    }

    protected onMount(): void {
        const driver = createComponentModelDriver(
            this.currentProps(),
            McpSectionModel,
            defaultMcpSectionState,
        );
        this.driver = driver;
        const model = driver.model;
        this.model = model;
        this.own(() => driver.dispose());

        this.root.append(
            panel({ paddingBottom: "lg" }, text("MCP Server", { bold: true, size: "sm" })),
            panel({ paddingBottom: "md" }, text("AI agents (Claude, ChatGPT, Gemini) can control Persephone via MCP", { color: "light", size: "xs" })),
        );
        const mcpRow = panel({ direction: "row", align: "center", gap: "md", paddingBottom: "lg" });
        this.mcpEnabledCheckbox = this.child(new CheckboxView(this.checkboxProps(
            model.props.mcpEnabled,
            model.handleToggle,
            "Enable MCP server",
        )));
        mcpRow.append(this.mcpEnabledCheckbox.root);
        this.mcpEnabledCheckbox.mount();
        this.root.append(mcpRow);

        const browserRow = panel({ direction: "row", align: "center", gap: "md", paddingBottom: "lg" });
        this.browserToolsCheckbox = this.child(new CheckboxView(this.checkboxProps(
            model.props.browserToolsEnabled,
            model.handleBrowserToolsToggle,
            "Enable browser interaction",
        )));
        browserRow.append(this.browserToolsCheckbox.root);
        this.browserToolsCheckbox.mount();
        this.root.append(browserRow);

        const mainScriptsRow = panel({ direction: "column", gap: "sm", paddingBottom: "lg" });
        this.mainScriptsCheckbox = this.child(new CheckboxView(this.checkboxProps(
            model.props.mainScriptsEnabled,
            model.handleMainScriptsToggle,
            "Allow main-process scripts",
        )));
        mainScriptsRow.append(this.mainScriptsCheckbox.root);
        mainScriptsRow.append(text("Warning: code runs in the main process and can freeze the app.", { color: "light", size: "xs" }));
        this.mainScriptsCheckbox.mount();
        this.root.append(mainScriptsRow);

        const portRow = panel({ direction: "row", align: "center", gap: "md", paddingBottom: "lg" });
        portRow.append(text("Port:", { size: "sm" }));
        this.portInput = this.child(new InputView(this.portProps(false)));
        portRow.append(this.portInput.root);
        this.portInput.mount();
        this.root.append(portRow);

        const mcpStatusHost = document.createElement("div");
        mcpStatusHost.style.display = "contents";
        const mnemeStatusHost = document.createElement("div");
        mnemeStatusHost.style.display = "contents";
        this.root.append(mcpStatusHost);
        this.mcpStatusSwap = new SubtreeSwap(mcpStatusHost);
        this.root.append(
            panel({ paddingTop: "sm", paddingBottom: "lg" }, text("Mneme (vector memory)", { bold: true, size: "sm" })),
            panel({ paddingBottom: "md" }, text("Local knowledge-base / memory service. Persephone launches it as a sidecar and serves it over loopback HTTP.", { color: "light", size: "xs" })),
        );
        const mnemeRow = panel({ direction: "row", align: "center", gap: "md", paddingBottom: "lg" });
        this.mnemeEnabledCheckbox = this.child(new CheckboxView(this.checkboxProps(
            model.props.mnemeEnabled,
            model.handleMnemeToggle,
            "Enable Mneme",
        )));
        mnemeRow.append(this.mnemeEnabledCheckbox.root);
        this.mnemeEnabledCheckbox.mount();
        this.root.append(mnemeRow);
        const mnemePortRow = panel({ direction: "row", align: "center", gap: "md", paddingBottom: "lg" });
        mnemePortRow.append(text("Port:", { size: "sm" }));
        this.mnemePortInput = this.child(new InputView(this.portProps(true)));
        mnemePortRow.append(this.mnemePortInput.root);
        this.mnemePortInput.mount();
        this.root.append(mnemePortRow);
        this.root.append(mnemeStatusHost);
        this.mnemeStatusSwap = new SubtreeSwap(mnemeStatusHost);

        this.root.append(
            panel({ paddingTop: "sm", paddingBottom: "md" }, text("AI client configuration:", { color: "light", size: "xs" })),
        );
        const code = document.createElement("pre");
        code.dataset.type = "settings-code";
        this.configCode = this.child(new ColorizedCodeView({ code: this.configJson(), language: "json" }));
        code.append(this.configCode.root);
        this.root.append(code, panel({ paddingTop: "md" }));
        const copyButton = this.child(new ButtonView({
            variant: "default", size: "sm", background: "light",
            onClick: () => this.model?.handleCopy(this.configJson(), "config"),
            children: "Copy",
        }));
        this.configCopyButton = copyButton;
        (this.root.lastElementChild as HTMLDivElement).append(copyButton.root);
        this.own(() => this.mcpStatusSwap?.dispose());
        this.own(() => this.mnemeStatusSwap?.dispose());
        this.configCode.mount();
        copyButton.mount();
        driver.mount();
        this.bind(model.state, (state) => state, (state) => this.syncState(state));
        const subscription = settings.onChanged.subscribe(({ key }) => {
            if (key === "mcp.enabled" || key === "mcp.port" || key === "mcp.browser-tools.enabled" || key === "main.scripting.enabled" || key === "mneme.enabled" || key === "mneme.port") {
                driver.update(this.currentProps());
                this.syncState(model.state.get());
            }
        });
        this.own(subscription);
    }

    protected onDispose(): void {
        this.driver = undefined;
        this.model = undefined;
        this.mcpEnabledCheckbox = undefined;
        this.browserToolsCheckbox = undefined;
        this.mainScriptsCheckbox = undefined;
        this.mnemeEnabledCheckbox = undefined;
        this.portInput = undefined;
        this.mnemePortInput = undefined;
        this.configCode = undefined;
        this.configCopyButton = undefined;
        this.mcpStatusSwap = undefined;
        this.mnemeStatusSwap = undefined;
    }

    private currentProps(): McpSectionProps {
        return {
            mcpEnabled: settings.get("mcp.enabled"),
            mcpPort: settings.get("mcp.port"),
            browserToolsEnabled: settings.get("mcp.browser-tools.enabled"),
            mainScriptsEnabled: settings.get("main.scripting.enabled"),
            mnemeEnabled: settings.get("mneme.enabled"),
            mnemePort: settings.get("mneme.port"),
        };
    }

    private checkboxProps(checked: boolean, onChange: (value: boolean) => void, children: string): CheckboxProps {
        return { checked, onChange, children };
    }

    private portProps(mneme: boolean): InputProps {
        const model = this.model;
        return {
            size: "sm",
            width: 72,
            type: "text",
            value: mneme ? model?.state.get().mnemePortValue ?? "" : model?.state.get().portValue ?? "",
            onChange: mneme ? model?.setMnemePortValue : model?.setPortValue,
            onBlur: mneme ? model?.handleMnemePortBlur : model?.handlePortBlur,
            onKeyDown: model?.handlePortKeyDown,
            disabled: mneme ? model?.props.mnemeEnabled : model?.props.mcpEnabled,
        };
    }

    private configJson(): string {
        const model = this.model;
        const mcpPort = model?.props.mcpPort ?? settings.get("mcp.port");
        const mnemePort = model?.props.mnemePort ?? settings.get("mneme.port");
        const mcpServers: Record<string, { type: string; url: string }> = {
            persephone: { type: "http", url: `http://127.0.0.1:${mcpPort}/mcp` },
        };
        if (model?.props.mnemeEnabled ?? settings.get("mneme.enabled")) {
            mcpServers.mneme = { type: "http", url: `http://127.0.0.1:${mnemePort}/mcp` };
        }
        return JSON.stringify({ mcpServers }, null, 2);
    }

    private syncState(state: McpSectionState): void {
        const model = this.model;
        if (!model) return;
        this.mcpEnabledCheckbox?.update(this.checkboxProps(model.props.mcpEnabled, model.handleToggle, "Enable MCP server"));
        this.browserToolsCheckbox?.update({ ...this.checkboxProps(model.props.browserToolsEnabled, model.handleBrowserToolsToggle, "Enable browser interaction"), disabled: model.props.mcpEnabled });
        this.mainScriptsCheckbox?.update(this.checkboxProps(model.props.mainScriptsEnabled, model.handleMainScriptsToggle, "Allow main-process scripts"));
        this.mnemeEnabledCheckbox?.update(this.checkboxProps(model.props.mnemeEnabled, model.handleMnemeToggle, "Enable Mneme"));
        this.portInput?.update(this.portProps(false));
        this.mnemePortInput?.update(this.portProps(true));
        this.configCode?.update({ code: this.configJson(), language: "json" });
        const copyLabel = state.copied === "config" ? "Copied!" : "Copy";
        this.configCopyButton?.update({
            variant: "default", size: "sm", background: "light",
            onClick: () => model.handleCopy(this.configJson(), "config"),
            children: copyLabel,
        });
        const mcpStatus = model.props.mcpEnabled ? state.status : null;
        if (mcpStatus) {
            this.mcpStatusSwap?.set(this.statusKey(mcpStatus, state.copied), () => {
                const view = new McpStatusView({ status: mcpStatus, mneme: false, copied: state.copied, onCopy: model.handleCopy });
                view.mount();
                return view;
            });
        } else this.mcpStatusSwap?.clear();
        const mnemeStatus = model.props.mnemeEnabled ? state.mnemeStatus : null;
        if (mnemeStatus) {
            this.mnemeStatusSwap?.set(this.statusKey(mnemeStatus, state.copied), () => {
                const view = new McpStatusView({ status: mnemeStatus, mneme: true, copied: state.copied, onCopy: model.handleCopy });
                view.mount();
                return view;
            });
        } else this.mnemeStatusSwap?.clear();
    }

    private statusKey(status: { running: boolean; url: string; clientCount?: number }, copied: string | null): string {
        return `${status.running}-${status.url}-${status.clientCount ?? 0}-${copied ?? ""}`;
    }
}

export { McpSectionView as McpSection };

import { TComponentModel } from "../../../core/state/model";
import { settings } from "../../../api/settings";
import { api } from "../../../../ipc/renderer/api";
import rendererEvents from "../../../../ipc/renderer/renderer-events";
import { createDepsGate, type DepsGate } from "../../../uikit/shared/deps-gate";

export interface McpSectionProps {
    mcpEnabled: boolean;
    mcpPort: number;
    browserToolsEnabled: boolean;
    mainScriptsEnabled: boolean;
    mnemeEnabled: boolean;
    mnemePort: number;
}

const defaultMcpSectionState = {
    status: null as { running: boolean; url: string; clientCount: number } | null,
    mnemeStatus: null as { running: boolean; url: string } | null,
    portValue: "",
    mnemePortValue: "",
    copied: null as string | null,
};

export type McpSectionState = typeof defaultMcpSectionState;

/** Coordinates server status subscriptions and editable MCP configuration fields. */
export class McpSectionModel extends TComponentModel<McpSectionState, McpSectionProps> {
    private copiedTimer: ReturnType<typeof setTimeout> | undefined;
    private initialized = false;
    private readonly mcpPortGate: DepsGate = createDepsGate();
    private readonly mnemePortGate: DepsGate = createDepsGate();
    private readonly mcpEnabledGate: DepsGate = createDepsGate();
    private readonly mnemeEnabledGate: DepsGate = createDepsGate();
    private mcpStatusDisposer: (() => void) | undefined;
    private mnemeStatusDisposer: (() => void) | undefined;

    init(): void {
        this.state.update((state) => {
            state.portValue = String(this.props.mcpPort);
            state.mnemePortValue = String(this.props.mnemePort);
        });
        this.subscribeMcpStatus();
        this.subscribeMnemeStatus();
        this.own(() => {
            this.stopMcpStatus();
            this.stopMnemeStatus();
        });
        this.mcpPortGate.prime([this.props.mcpPort]);
        this.mnemePortGate.prime([this.props.mnemePort]);
        this.mcpEnabledGate.prime([this.props.mcpEnabled]);
        this.mnemeEnabledGate.prime([this.props.mnemeEnabled]);
        this.initialized = true;
    }

    setProps = (props: McpSectionProps): void => {
        if (!this.initialized) return;
        if (this.mcpPortGate.changed([props.mcpPort])) {
            this.setPortValue(String(props.mcpPort));
        }
        if (this.mnemePortGate.changed([props.mnemePort])) {
            this.setMnemePortValue(String(props.mnemePort));
        }
        if (this.mcpEnabledGate.changed([props.mcpEnabled])) {
            this.stopMcpStatus();
            this.subscribeMcpStatus();
        }
        if (this.mnemeEnabledGate.changed([props.mnemeEnabled])) {
            this.stopMnemeStatus();
            this.subscribeMnemeStatus();
        }
    };

    private subscribeMcpStatus = (): void => {
        void api.getMcpStatus().then((status) => {
            if (this.isLive) this.state.update((state) => { state.status = status; });
        }).catch(() => {
            if (this.isLive) this.state.update((state) => { state.status = null; });
        });
        const subscription = rendererEvents.eMcpStatusChanged.subscribe((status) => {
            if (this.isLive) this.state.update((state) => { state.status = status; });
        });
        this.mcpStatusDisposer = subscription;
    };

    private subscribeMnemeStatus = (): void => {
        void api.getMnemeStatus().then((status) => {
            if (this.isLive) this.state.update((state) => { state.mnemeStatus = status; });
        }).catch(() => {
            if (this.isLive) this.state.update((state) => { state.mnemeStatus = null; });
        });
        const subscription = rendererEvents.eMnemeStatusChanged.subscribe((status) => {
            if (this.isLive) this.state.update((state) => { state.mnemeStatus = status; });
        });
        this.mnemeStatusDisposer = subscription;
    };

    private stopMcpStatus = (): void => {
        const disposer = this.mcpStatusDisposer;
        this.mcpStatusDisposer = undefined;
        disposer?.();
    };

    private stopMnemeStatus = (): void => {
        const disposer = this.mnemeStatusDisposer;
        this.mnemeStatusDisposer = undefined;
        disposer?.();
    };

    setPortValue = (portValue: string) => this.state.update((state) => { state.portValue = portValue; });
    setMnemePortValue = (mnemePortValue: string) => this.state.update((state) => { state.mnemePortValue = mnemePortValue; });

    handleToggle = () => settings.set("mcp.enabled", !this.props.mcpEnabled);
    handleBrowserToolsToggle = () => settings.set("mcp.browser-tools.enabled", !this.props.browserToolsEnabled);
    handleMainScriptsToggle = () => settings.set("main.scripting.enabled", !this.props.mainScriptsEnabled);
    handleMnemeToggle = () => settings.set("mneme.enabled", !this.props.mnemeEnabled);

    handlePortBlur = () => {
        const port = parseInt(this.state.get().portValue, 10);
        if (port >= 1024 && port <= 65535) settings.set("mcp.port", port);
        else this.setPortValue(String(this.props.mcpPort));
    };

    handleMnemePortBlur = () => {
        const port = parseInt(this.state.get().mnemePortValue, 10);
        if (port >= 1024 && port <= 65535) settings.set("mneme.port", port);
        else this.setMnemePortValue(String(this.props.mnemePort));
    };

    handlePortKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Enter") (event.target as HTMLInputElement).blur();
    };

    handleCopy = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        this.state.update((state) => { state.copied = label; });
        if (this.copiedTimer !== undefined) clearTimeout(this.copiedTimer);
        this.copiedTimer = setTimeout(() => {
            this.copiedTimer = undefined;
            if (this.isLive) this.state.update((state) => {
                if (state.copied === label) state.copied = null;
            });
        }, 2000);
    };

    dispose() {
        this.stopMcpStatus();
        this.stopMnemeStatus();
        if (this.copiedTimer !== undefined) clearTimeout(this.copiedTimer);
        this.copiedTimer = undefined;
    }
}

export { defaultMcpSectionState };

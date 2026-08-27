import { TComponentModel } from "../../../core/state/model";
import { settings } from "../../../api/settings";
import { api } from "../../../../ipc/renderer/api";
import rendererEvents from "../../../../ipc/renderer/renderer-events";

export interface McpSectionProps {
    mcpEnabled: boolean;
    mcpPort: number;
    browserToolsEnabled: boolean;
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
    init(): void {
        this.effect(
            () => { this.state.update((state) => { state.portValue = String(this.props.mcpPort); }); },
            () => [this.props.mcpPort],
        );
        this.effect(
            () => { this.state.update((state) => { state.mnemePortValue = String(this.props.mnemePort); }); },
            () => [this.props.mnemePort],
        );
        this.effect(() => this.subscribeMcpStatus(), () => [this.props.mcpEnabled]);
        this.effect(() => this.subscribeMnemeStatus(), () => [this.props.mnemeEnabled]);
    }

    private subscribeMcpStatus = () => {
        void api.getMcpStatus().then((status) => {
            if (this.isLive) this.state.update((state) => { state.status = status; });
        }).catch(() => {
            if (this.isLive) this.state.update((state) => { state.status = null; });
        });
        const subscription = rendererEvents.eMcpStatusChanged.subscribe((status) => {
            if (this.isLive) this.state.update((state) => { state.status = status; });
        });
        return () => subscription.unsubscribe();
    };

    private subscribeMnemeStatus = () => {
        void api.getMnemeStatus().then((status) => {
            if (this.isLive) this.state.update((state) => { state.mnemeStatus = status; });
        }).catch(() => {
            if (this.isLive) this.state.update((state) => { state.mnemeStatus = null; });
        });
        const subscription = rendererEvents.eMnemeStatusChanged.subscribe((status) => {
            if (this.isLive) this.state.update((state) => { state.mnemeStatus = status; });
        });
        return () => subscription.unsubscribe();
    };

    setPortValue = (portValue: string) => this.state.update((state) => { state.portValue = portValue; });
    setMnemePortValue = (mnemePortValue: string) => this.state.update((state) => { state.mnemePortValue = mnemePortValue; });

    handleToggle = () => settings.set("mcp.enabled", !this.props.mcpEnabled);
    handleBrowserToolsToggle = () => settings.set("mcp.browser-tools.enabled", !this.props.browserToolsEnabled);
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
        if (this.copiedTimer !== undefined) clearTimeout(this.copiedTimer);
        this.copiedTimer = undefined;
    }
}

export { defaultMcpSectionState };

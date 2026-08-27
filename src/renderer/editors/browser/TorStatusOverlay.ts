import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { ButtonView } from "../../uikit/Button/ButtonView";
import { SpinnerView } from "../../uikit/Spinner/SpinnerView";
import { ColorizedCodeView } from "../shared/ColorizedCodeView";
import { TorIcon } from "../../theme/language-icons";
import { TOR_BROWSER_COLOR } from "../../theme/palette-colors";
import type { BrowserEditor } from "./BrowserEditor";
import "../../uikit/Panel/Panel.css";
import "../../uikit/Text/Text.css";

export interface TorStatusOverlayProps { model: BrowserEditor; torStatus: "disconnected" | "connecting" | "connected" | "error"; torLog: string; }
const STATUS_MESSAGE: Record<TorStatusOverlayProps["torStatus"], string> = { connecting: "Connecting to Tor network...", connected: "Connected to Tor", error: "Failed to connect to Tor", disconnected: "Tor is not connected" };

export class TorStatusOverlayView extends VanillaView<TorStatusOverlayProps> {
    private readonly status = createTextElement("");
    private readonly iconHost = document.createElement("div");
    private readonly logHost = createPanelElement({ alignSelf: "center", width: "100%", maxWidth: 600, flex: true, paddingY: "md", paddingX: "xl", overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word" });
    private close: IconButtonView | undefined;
    private reconnect: ButtonView | undefined;
    private spinner: SpinnerView | undefined;
    private log: ColorizedCodeView | undefined;

    public constructor(props: TorStatusOverlayProps) {
        const root = createPanelElement({ name: "tor-overlay", position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 5, background: "dark", direction: "column", align: "center", overflow: "hidden" });
        super(props, root); this.iconHost.dataset.part = "status-icon"; const statusPanel = createPanelElement({ name: "tor-overlay-status", direction: "column", alignSelf: "center", align: "center", gap: "lg", paddingTop: "xxxl" }, [this.iconHost, this.status]); root.append(statusPanel, this.logHost);
    }
    protected onMount(): void { this.sync(this.props); }
    protected onUpdate(props: TorStatusOverlayProps): void { this.sync(props); }
    protected onDispose(): void { if (this.close) this.releaseChild(this.close); if (this.reconnect) this.releaseChild(this.reconnect); if (this.spinner) this.releaseChild(this.spinner); if (this.log) this.releaseChild(this.log); this.close = undefined; this.reconnect = undefined; this.spinner = undefined; this.log = undefined; }
    private sync(props: TorStatusOverlayProps): void {
        this.status.textContent = STATUS_MESSAGE[props.torStatus];
        if (props.torStatus === "connected") { if (!this.close) { this.close = this.child(new IconButtonView({ name: "tor-overlay-close", size: "sm", title: "Close", icon: "close", onClick: () => props.model.toggleTorOverlay() })); const bar = this.root.querySelector('[data-name="tor-overlay-close-bar"]') as HTMLElement || createPanelElement({ name: "tor-overlay-close-bar", position: "absolute", top: 8, right: 8 }); if (!bar.parentNode) { bar.append(this.close.root); this.root.append(bar); this.close.mount(); } } } else if (this.close) { this.releaseChild(this.close); this.close = undefined; }
        if (props.torStatus === "connecting") { if (!this.spinner) { this.spinner = this.child(new SpinnerView({ size: 40, color: TOR_BROWSER_COLOR })); this.spinner.mount(); } this.iconHost.replaceChildren(this.spinner.root); } else { if (this.spinner) { this.releaseChild(this.spinner); this.spinner = undefined; } this.iconHost.replaceChildren(TorIcon.createElement({ width: 40, height: 40 })); }
        const showReconnect = props.torStatus === "disconnected" || props.torStatus === "error";
        if (showReconnect && !this.reconnect) { this.reconnect = this.child(new ButtonView({ name: "tor-overlay-retry", children: "Reconnect", onClick: () => props.model.reconnectTor() })); this.root.querySelector('[data-name="tor-overlay-status"]')?.append(this.reconnect.root); this.reconnect.mount(); } else if (!showReconnect && this.reconnect) { this.releaseChild(this.reconnect); this.reconnect = undefined; }
        if (props.torLog) { if (!this.log) { this.log = this.child(new ColorizedCodeView({ code: props.torLog, language: "log" })); this.logHost.append(this.log.root); this.log.mount(); } else this.log.update({ code: props.torLog, language: "log" }); this.logHost.scrollTop = this.logHost.scrollHeight; } else if (this.log) { this.releaseChild(this.log); this.log = undefined; }
    }
}

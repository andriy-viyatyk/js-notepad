import { ButtonView } from "../../uikit/Button/ButtonView";
import { DialogContentView } from "../../uikit/Dialog/DialogContentView";
import { DialogView } from "../../uikit/Dialog/DialogView";
import type { DialogProps } from "../../uikit/Dialog/Dialog";
import { SpinnerView } from "../../uikit/Spinner/SpinnerView";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { createTextElement } from "../../uikit/Text/text-style";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import { TorIcon } from "../../theme/language-icons";
import type { DialogViewProps } from "./dialog-view-registry";
import type { TorInfoDialogModel } from "./TorInfoDialog";
import "../../uikit/Button/Button.css";
import "../../uikit/Dialog/Dialog.css";
import "../../uikit/Spinner/Spinner.css";

function formatLocation(info: { city?: string; region?: string; country?: string }): string {
    const parts = [info.city, info.region, info.country].filter(Boolean);
    return parts.length ? parts.join(", ") : "Unknown";
}

export class TorInfoDialogView extends VanillaView<DialogViewProps> {
    private readonly model: TorInfoDialogModel;
    private readonly dialogView: DialogView;
    private readonly contentView: DialogContentView;
    private readonly spinnerView: SpinnerView;
    private readonly closeButton: ButtonView;
    private readonly busyPanel: HTMLDivElement;
    private readonly busyText: HTMLSpanElement;
    private readonly infoPanel: HTMLDivElement;
    private readonly ipValue: HTMLSpanElement;
    private readonly locationValue: HTMLSpanElement;
    private readonly orgRow: HTMLDivElement;
    private readonly orgValue: HTMLSpanElement;
    private readonly torValue: HTMLSpanElement;
    private readonly errorElement: HTMLSpanElement;
    private readonly warningElement: HTMLSpanElement;
    private readonly noteElement: HTMLSpanElement;
    private readonly geoElement: HTMLSpanElement;
    private readonly reconnectButton: ButtonView;

    public constructor(props: DialogViewProps) {
        const model = props.model as TorInfoDialogModel;
        const spinnerView = new SpinnerView({ size: 16 });
        const busyText = createTextElement("Looking up the exit address through Tor...", {
            size: "sm",
            color: "light",
        });
        const busyPanel = createPanelElement(
            { direction: "row", gap: "md", align: "center" },
            [spinnerView.root, busyText],
        );
        const ipValue = createTextElement("");
        const locationValue = createTextElement("");
        const orgValue = createTextElement("");
        const torValue = createTextElement("");
        const orgRow = createPanelElement(
            { direction: "row", gap: "md", align: "baseline" },
            [
                createPanelElement({ width: 130, shrink: false }, [
                    createTextElement("Exit node", { size: "sm", color: "light" }),
                ]),
                orgValue,
            ],
        );
        const infoPanel = createPanelElement(
            { direction: "column", gap: "sm" },
            [
                createPanelElement(
                    { direction: "row", gap: "md", align: "baseline" },
                    [
                        createPanelElement({ width: 130, shrink: false }, [
                            createTextElement("IP address", { size: "sm", color: "light" }),
                        ]),
                        ipValue,
                    ],
                ),
                createPanelElement(
                    { direction: "row", gap: "md", align: "baseline" },
                    [
                        createPanelElement({ width: 130, shrink: false }, [
                            createTextElement("Location", { size: "sm", color: "light" }),
                        ]),
                        locationValue,
                    ],
                ),
                orgRow,
                createPanelElement(
                    { direction: "row", gap: "md", align: "baseline" },
                    [
                        createPanelElement({ width: 130, shrink: false }, [
                            createTextElement("Exiting through Tor", { size: "sm", color: "light" }),
                        ]),
                        torValue,
                    ],
                ),
            ],
        );
        const errorElement = createTextElement("", { size: "sm", color: "error" });
        const warningElement = createTextElement(
            "check.torproject.org says this request did not arrive over Tor.",
            { size: "sm", color: "warning" },
        );
        const noteElement = createTextElement("", { size: "sm", color: "light" });
        const geoElement = createTextElement("", { size: "xs", color: "light" });
        const explanationElement = createTextElement(
            "Reconnecting restarts Tor for every open Tor page. A new circuit does not always mean a different exit node.",
            { size: "xs", color: "light" },
        );
        const bodyPanel = createPanelElement(
            { direction: "column", gap: "md", paddingX: "xxl", paddingY: "xl" },
            [busyPanel, infoPanel, errorElement, warningElement, noteElement, geoElement, explanationElement],
        );
        const reconnectButton = new ButtonView({
            variant: "primary",
            disabled: true,
            onClick: () => { void model.reconnect(); },
            children: "Reconnect",
        });
        const closeButton = new ButtonView({
            onClick: () => { void model.close(undefined); },
            children: "Close",
        });
        const buttonsPanel = createPanelElement(
            { direction: "row", justify: "end", gap: "sm", padding: "md" },
            [closeButton.root, reconnectButton.root],
        );
        const contentChildren = document.createDocumentFragment();
        contentChildren.append(bodyPanel, buttonsPanel);
        const icon = TorIcon.createElement?.();
        const contentView = new DialogContentView({
            title: "Tor connection",
            icon,
            onClose: () => { void model.close(undefined); },
            minWidth: 460,
            maxWidth: 620,
            children: contentChildren,
        });
        const dialogView = new DialogView({
            className: props.className,
            name: "tor-info-dialog",
            onKeyDown: (event) => model.handleKeyDown(event.nativeEvent),
            children: contentView.root,
        } as DialogProps & { className?: string });

        super(props, dialogView.root);
        this.model = model;
        this.dialogView = this.child(dialogView);
        this.contentView = this.child(contentView);
        this.spinnerView = this.child(spinnerView);
        this.reconnectButton = this.child(reconnectButton);
        this.closeButton = this.child(closeButton);
        this.busyPanel = busyPanel;
        this.busyText = busyText;
        this.infoPanel = infoPanel;
        this.ipValue = ipValue;
        this.locationValue = locationValue;
        this.orgRow = orgRow;
        this.orgValue = orgValue;
        this.torValue = torValue;
        this.errorElement = errorElement;
        this.warningElement = warningElement;
        this.noteElement = noteElement;
        this.geoElement = geoElement;
        this.own(model.disposeView);
    }

    protected onMount(): void {
        this.spinnerView.mount();
        this.closeButton.mount();
        this.reconnectButton.mount();
        this.contentView.mount();
        this.dialogView.mount();
        this.bind(this.model.state, (state) => JSON.stringify(state), () => this.syncState());
        this.syncState();
    }

    private syncState(): void {
        const state = this.model.state.get();
        const busy = state.loading || state.reconnecting;
        const info = state.info;
        this.busyPanel.hidden = !busy;
        this.busyText.textContent = state.reconnecting
            ? "Restarting Tor \u2014 this can take up to a minute..."
            : "Looking up the exit address through Tor...";
        this.infoPanel.hidden = busy || !info;
        if (info) {
            this.ipValue.textContent = info.ip || "Unknown";
            this.locationValue.textContent = formatLocation(info);
            this.orgValue.textContent = info.org ?? "";
            this.orgRow.hidden = !info.org;
            this.torValue.textContent = info.isTor === null ? "Could not verify" : info.isTor ? "Yes" : "No";
        }
        this.errorElement.hidden = busy || !info?.error;
        this.errorElement.textContent = info?.error ?? "";
        this.warningElement.hidden = busy || info?.isTor !== false;
        this.noteElement.hidden = !state.note;
        this.noteElement.textContent = state.note;
        this.geoElement.hidden = busy || !info?.geoSource;
        this.geoElement.textContent = info?.geoSource
            ? `Location reported by ${info.geoSource}, queried through Tor.`
            : "";
        this.reconnectButton.update({
            variant: "primary",
            disabled: busy,
            onClick: () => { void this.model.reconnect(); },
            children: "Reconnect",
        });
    }
}



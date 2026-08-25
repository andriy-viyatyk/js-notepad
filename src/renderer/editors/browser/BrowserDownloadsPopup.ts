import type { DownloadEntry } from "../../../ipc/api-param-types";
import { downloads } from "../../api/downloads";
import { TComponentState } from "../../core/state/state";
import { ButtonView } from "../../uikit/Button/ButtonView";
import "../../uikit/Button/Button.css";
import { IconButtonView } from "../../uikit/IconButton/IconButtonView";
import { PopoverView } from "../../uikit/Popover/PopoverView";
import { createPanelElement } from "../../uikit/Panel/panel-style";
import { SpacerView } from "../../uikit/Spacer/SpacerView";
import { createTextElement } from "../../uikit/Text/text-style";
import { attachTooltip, type TooltipAttachment } from "../../uikit/Tooltip/attach-tooltip";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import color from "../../theme/color";
import {
    closePopper,
    showPopper,
    visiblePoppers,
} from "../../ui/dialogs/poppers/Poppers";
import { TPopperModel } from "../../ui/dialogs/poppers/types";
import type { DialogViewProps } from "../../ui/dialogs/dialog-view-registry";
import { registerDialogView } from "../../ui/dialogs/dialog-view-registry";

// =============================================================================
// Module-private model
// =============================================================================

const defaultDownloadsPopupState = {} as Record<string, never>;
type DownloadsPopupState = typeof defaultDownloadsPopupState;

class DownloadsPopupModel extends TPopperModel<DownloadsPopupState, void> {}

// =============================================================================
// Module-private view (registered with the vanilla Poppers registry)
// =============================================================================

const downloadsPopupId = Symbol("DownloadsPopup");
const ignoreSelector = "[data-downloads-button]";
const popupOffset: [number, number] = [0, 4];

interface DownloadItemResources {
    readonly buttons: Array<ButtonView | IconButtonView>;
    readonly tooltip: TooltipAttachment;
}

class DownloadsPopupContentView extends VanillaView<undefined> {
    private headerPanel: HTMLDivElement | undefined;
    private listPanel: HTMLDivElement | undefined;
    private clearButton: ButtonView | undefined;
    private itemResources: DownloadItemResources[] = [];

    public constructor(host: HTMLElement) {
        // The content view adopts the popover host so its body and list remain direct children of
        // the floating root. PopoverFloatingView owns the host's root attributes and must remain
        // the only writer of those attributes.
        super(undefined, host);
    }

    protected onMount(): void {
        const headerPanel = createPanelElement({
            name: "downloads-popup-header",
            direction: "row",
            align: "center",
            paddingX: "lg",
            paddingY: "md",
            borderBottom: true,
        });
        const spacerView = this.child(new SpacerView({}));
        headerPanel.append(
            createTextElement("Downloads", { size: "md", bold: true }),
            spacerView.root,
        );

        const listPanel = createPanelElement({
            name: "downloads-list",
            direction: "column",
            overflowY: "auto",
            maxHeight: 400,
        });
        const bodyPanel = createPanelElement(
            { name: "downloads-popup-body", direction: "column", width: 320 },
            [headerPanel, listPanel],
        );
        this.root.append(bodyPanel);
        spacerView.mount();

        this.headerPanel = headerPanel;
        this.listPanel = listPanel;
        this.own(() => this.disposeItemResources());
        this.bind(
            downloads.state,
            (state) => state.downloads,
            (downloadEntries) => this.renderDownloads(downloadEntries),
        );
    }

    private renderDownloads(downloadEntries: DownloadEntry[]): void {
        const hasCompleted = downloadEntries.some((entry) => entry.status !== "downloading");
        this.syncClearButton(hasCompleted);
        this.disposeItemResources();

        const listPanel = this.listPanel;
        if (!listPanel) return;

        if (downloadEntries.length === 0) {
            listPanel.replaceChildren(createPanelElement(
                { paddingY: "xxl", paddingX: "lg", align: "center", justify: "center" },
                [createTextElement("No downloads", { size: "md", color: "light" })],
            ));
            return;
        }

        downloadEntries.forEach((entry, index) => {
            const item = this.createDownloadItem(
                entry,
                index < downloadEntries.length - 1,
            );
            listPanel.append(item.element);
            this.itemResources.push(item.resources);
        });
    }

    private syncClearButton(hasCompleted: boolean): void {
        const headerPanel = this.headerPanel;
        if (!headerPanel) return;

        if (hasCompleted && !this.clearButton) {
            const clearButton = this.child(new ButtonView({
                name: "downloads-clear",
                size: "sm",
                variant: "ghost",
                onClick: () => { void downloads.clearCompleted(); },
                children: "Clear",
            }));
            clearButton.mount();
            headerPanel.append(clearButton.root);
            this.clearButton = clearButton;
            return;
        }

        if (!hasCompleted && this.clearButton) {
            const clearButton = this.clearButton;
            this.clearButton = undefined;
            this.releaseChild(clearButton);
        }
    }

    private createDownloadItem(
        entry: DownloadEntry,
        showBorder: boolean,
    ): { element: HTMLDivElement; resources: DownloadItemResources } {
        const { id, filename, status, receivedBytes, totalBytes, error } = entry;
        const isDownloading = status === "downloading";
        const progress = totalBytes > 0 ? Math.min(1, receivedBytes / totalBytes) : 0;
        const statusText = isDownloading
            ? `${formatBytes(receivedBytes)} / ${totalBytes > 0 ? formatBytes(totalBytes) : "?"}`
            : status === "completed"
                ? formatBytes(totalBytes)
                : status === "cancelled"
                    ? "Cancelled"
                    : "Failed";

        const filenamePanel = createPanelElement({ flex: true, overflow: "hidden" });
        filenamePanel.append(createTextElement(filename, { truncate: true, size: "md" }));
        const tooltip = attachTooltip(filenamePanel, {
            content: entry.savePath || filename,
        });

        const statusPanel = createPanelElement({ direction: "row", align: "center", gap: "md" }, [
            filenamePanel,
            createTextElement(statusText, { size: "sm", color: "light", nowrap: true }),
        ]);
        const itemPanel = createPanelElement({
            direction: "column",
            paddingY: "md",
            paddingX: "lg",
            gap: "sm",
            borderBottom: showBorder || undefined,
        }, [statusPanel]);

        if (isDownloading) itemPanel.append(this.createProgressBar(progress));
        if (error && status === "failed") {
            itemPanel.append(createTextElement(error, { size: "sm", color: "error" }));
        }

        const buttonsPanel = createPanelElement({ direction: "row", gap: "sm" });
        const buttons: Array<ButtonView | IconButtonView> = [];
        const addButton = <T extends ButtonView | IconButtonView>(button: T): void => {
            const ownedButton = this.child(button);
            ownedButton.mount();
            buttonsPanel.append(ownedButton.root);
            buttons.push(ownedButton);
        };

        if (isDownloading) {
            addButton(new ButtonView({
                size: "sm",
                variant: "ghost",
                onClick: () => { void downloads.cancelDownload(id); },
                children: "Cancel",
            }));
        }
        if (status === "completed") {
            addButton(new ButtonView({
                size: "sm",
                variant: "ghost",
                onClick: () => { void downloads.openDownload(id); },
                children: "Open",
            }));
            addButton(new IconButtonView({
                size: "sm",
                title: "Show in Folder",
                icon: "folder-open",
                onClick: () => { void downloads.showInFolder(id); },
            }));
        }
        if (status === "failed" || status === "cancelled") {
            addButton(new IconButtonView({
                size: "sm",
                title: "Dismiss",
                icon: "close",
                onClick: () => { void downloads.clearCompleted(); },
            }));
        }
        itemPanel.append(buttonsPanel);

        return {
            element: itemPanel,
            resources: { buttons, tooltip },
        };
    }

    private createProgressBar(progress: number): HTMLDivElement {
        const track = document.createElement("div");
        track.style.height = "3px";
        track.style.borderRadius = "2px";
        track.style.backgroundColor = color.border.light;
        track.style.overflow = "hidden";

        const fill = document.createElement("div");
        fill.style.height = "100%";
        fill.style.width = `${progress * 100}%`;
        fill.style.backgroundColor = color.border.active;
        fill.style.borderRadius = "2px";
        fill.style.transition = "width 0.3s ease";
        track.append(fill);
        return track;
    }

    private disposeItemResources(): void {
        const resources = this.itemResources;
        this.itemResources = [];
        this.listPanel?.replaceChildren();
        resources.forEach(({ buttons, tooltip }) => {
            tooltip.dispose();
            buttons.forEach((button) => this.releaseChild(button));
        });
    }
}

class DownloadsPopupView extends VanillaView<DialogViewProps> {
    private readonly model: DownloadsPopupModel;

    public constructor(props: DialogViewProps) {
        super(props, document.createElement("div"));
        this.root.style.display = "contents";
        this.model = props.model as DownloadsPopupModel;
    }

    protected onMount(): void {
        const popoverView = this.child(new PopoverView({
            name: "downloads-popup",
            open: true,
            ...this.model.position,
            outsideClickIgnoreSelector: ignoreSelector,
            onClose: () => { void this.model.close(); },
            contentView: (host) => new DownloadsPopupContentView(host),
        }));
        popoverView.mount();
    }
}

registerDialogView(downloadsPopupId, DownloadsPopupView);

// =============================================================================
// Public imperative API
// =============================================================================

/**
 * Open the downloads popup anchored to the given element. Resolves when the popup
 * closes (click-outside, Escape, or explicit `closeDownloadsPopup()`). No-op if
 * the popup is already open.
 */
export const showDownloadsPopup = async (anchor: Element): Promise<void> => {
    if (isDownloadsPopupOpen()) return;
    const state = new TComponentState(defaultDownloadsPopupState);
    const model = new DownloadsPopupModel(state);
    model.position = {
        elementRef: anchor,
        placement: "bottom-end",
        offset: popupOffset,
    };
    await showPopper<void>({ viewId: downloadsPopupId, model });
};

/** Close the downloads popup if it is currently open. */
export const closeDownloadsPopup = (): void => {
    closePopper(downloadsPopupId);
};

/** Whether the downloads popup is currently open. */
export const isDownloadsPopupOpen = (): boolean =>
    visiblePoppers().some((p) => p.viewId === downloadsPopupId);

// =============================================================================
// Module-private helpers
// =============================================================================

function formatBytes(bytes: number): string {
    if (bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, i);
    return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

import { Panel, Text, Button, IconButton, Spacer, Popover, Tooltip } from "../../uikit";
import color from "../../theme/color";
import { downloads } from "../../api/downloads";
import { DownloadEntry } from "../../../ipc/api-param-types";
import { TPopperModel } from "../../ui/dialogs/poppers/types";
import {
    closePopper,
    showPopper,
    visiblePoppers,
} from "../../ui/dialogs/poppers/Poppers";
import { TComponentState } from "../../core/state/state";
import { DefaultView, ViewPropsRO, Views } from "../../core/state/view";

// =============================================================================
// Module-private model
// =============================================================================

const defaultDownloadsPopupState = {} as Record<string, never>;
type DownloadsPopupState = typeof defaultDownloadsPopupState;

class DownloadsPopupModel extends TPopperModel<DownloadsPopupState, void> {}

// =============================================================================
// Module-private view (registered with the global Poppers registry)
// =============================================================================

const downloadsPopupId = Symbol("DownloadsPopup");
const ignoreSelector = "[data-downloads-button]";
const popupOffset: [number, number] = [0, 4];

function DownloadsPopupView({ model }: ViewPropsRO<DownloadsPopupModel>) {
    const downloadsList = downloads.state.use((s) => s.downloads);
    const hasCompleted = downloadsList.some((d) => d.status !== "downloading");

    return (
        <Popover
            name="downloads-popup"
            open
            {...model.position}
            outsideClickIgnoreSelector={ignoreSelector}
            onClose={() => model.close()}
        >
            <Panel name="downloads-popup-body" direction="column" width={320}>
                <Panel
                    name="downloads-popup-header"
                    direction="row"
                    align="center"
                    paddingX="lg"
                    paddingY="md"
                    borderBottom
                >
                    <Text size="md" bold>Downloads</Text>
                    <Spacer />
                    {hasCompleted && (
                        <Button name="downloads-clear" size="sm" variant="ghost" onClick={downloads.clearCompleted}>
                            Clear
                        </Button>
                    )}
                </Panel>
                <Panel name="downloads-list" direction="column" overflowY="auto" maxHeight={400}>
                    {downloadsList.length === 0 ? (
                        <Panel paddingY="xxl" paddingX="lg" align="center" justify="center">
                            <Text size="md" color="light">No downloads</Text>
                        </Panel>
                    ) : (
                        downloadsList.map((dl, i) => (
                            <DownloadItem
                                key={dl.id}
                                entry={dl}
                                showBorder={i < downloadsList.length - 1}
                            />
                        ))
                    )}
                </Panel>
            </Panel>
        </Popover>
    );
}

Views.registerView(downloadsPopupId, DownloadsPopupView as DefaultView);

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
// Module-private item view
// =============================================================================

function formatBytes(bytes: number): string {
    if (bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, i);
    return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

function DownloadItem({ entry, showBorder }: { entry: DownloadEntry; showBorder: boolean }) {
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

    return (
        <Panel
            direction="column"
            paddingY="md"
            paddingX="lg"
            gap="sm"
            borderBottom={showBorder || undefined}
        >
            <Panel direction="row" align="center" gap="md">
                <Tooltip content={entry.savePath || filename}>
                    <Panel flex overflow="hidden">
                        <Text truncate size="md">{filename}</Text>
                    </Panel>
                </Tooltip>
                <Text size="sm" color="light" nowrap>{statusText}</Text>
            </Panel>
            {isDownloading && (
                <div
                    style={{
                        height: 3,
                        borderRadius: 2,
                        backgroundColor: color.border.light,
                        overflow: "hidden",
                    }}
                >
                    <div
                        style={{
                            height: "100%",
                            width: `${progress * 100}%`,
                            backgroundColor: color.border.active,
                            borderRadius: 2,
                            transition: "width 0.3s ease",
                        }}
                    />
                </div>
            )}
            {error && status === "failed" && (
                <Text size="sm" color="error">{error}</Text>
            )}
            <Panel direction="row" gap="sm">
                {isDownloading && (
                    <Button size="sm" variant="ghost" onClick={() => downloads.cancelDownload(id)}>
                        Cancel
                    </Button>
                )}
                {status === "completed" && (
                    <>
                        <Button size="sm" variant="ghost" onClick={() => downloads.openDownload(id)}>
                            Open
                        </Button>
                        <IconButton
                            size="sm"
                            title="Show in Folder"
                            icon="folder-open"
                            onClick={() => downloads.showInFolder(id)}
                        />
                    </>
                )}
                {(status === "failed" || status === "cancelled") && (
                    <IconButton
                        size="sm"
                        title="Dismiss"
                        icon="close"
                        onClick={() => downloads.clearCompleted()}
                    />
                )}
            </Panel>
        </Panel>
    );
}

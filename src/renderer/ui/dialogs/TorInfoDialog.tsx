/**
 * Tor connection info dialog (US-897).
 *
 * Shows what the outside world sees for a Tor browser page — the exit IP,
 * whether traffic really is exiting through Tor, and an approximate location —
 * plus a Reconnect button that restarts the Tor daemon so fresh circuits (and
 * normally a new exit node) are used.
 *
 * The lookups run in the main process: the SOCKS proxy is bound to the page's
 * session partition, so a fetch from here would go out unproxied and hand the
 * checker site the user's real IP.
 */
import { showDialog } from "./Dialogs";
import { Dialog, DialogContent, Panel, Text, Button, Spinner } from "../../uikit";
import { TDialogModel } from "../../core/state/model";
import { DefaultView, ViewPropsRO, Views } from "../../core/state/view";
import { TComponentState } from "../../core/state/state";
import { TorIcon } from "../../theme/language-icons";
import { TorChannel, TorIpInfo } from "../../../ipc/tor-ipc";

const { ipcRenderer } = require("electron");

const torInfoDialogId = Symbol("torInfoDialog");

interface TorInfoDialogState {
    /** Session partition of the Tor page that opened the dialog. */
    partition: string;
    /** An IP lookup is in flight. */
    loading: boolean;
    /** A Tor restart is in flight. */
    reconnecting: boolean;
    info: TorIpInfo | null;
    /** Outcome of the last Reconnect, shown under the details. */
    note: string;
}

class TorInfoDialogModel extends TDialogModel<TorInfoDialogState, void> {
    postCreate = () => {
        void this.load();
    };

    handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Escape") {
            e.preventDefault();
            this.close(undefined);
        }
    };

    /** Run the exit-IP lookup and return the IP it found (for change detection). */
    private load = async (): Promise<string> => {
        this.state.update((s) => { s.loading = true; });
        const info: TorIpInfo = await ipcRenderer.invoke(
            TorChannel.checkIp,
            this.state.get().partition,
        );
        this.state.update((s) => {
            s.info = info;
            s.loading = false;
        });
        return info.ip;
    };

    reconnect = async () => {
        const s0 = this.state.get();
        if (s0.reconnecting || s0.loading) return;

        const previousIp = s0.info?.ip ?? "";
        this.state.update((s) => {
            s.reconnecting = true;
            s.note = "";
        });

        const result: { success: boolean; error?: string } = await ipcRenderer.invoke(
            TorChannel.restart,
            s0.partition,
        );

        if (!result.success) {
            this.state.update((s) => {
                s.reconnecting = false;
                s.note = result.error || "Reconnect failed.";
            });
            return;
        }

        const newIp = await this.load();
        this.state.update((s) => {
            s.reconnecting = false;
            if (!newIp) {
                s.note = "Reconnected, but the exit IP could not be looked up.";
            } else if (newIp === previousIp) {
                // Tor may legitimately pick the same exit again. Say so rather
                // than let an unchanged value look like a failed reconnect.
                s.note = "Tor selected the same exit node — click Reconnect again for a different one.";
            } else {
                s.note = "Reconnected with a new exit node.";
            }
        });
    };
}

// =============================================================================
// View
// =============================================================================

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <Panel direction="row" gap="md" align="baseline">
            <Panel width={130} shrink={false}>
                <Text size="sm" color="light">{label}</Text>
            </Panel>
            <Text size="sm">{value}</Text>
        </Panel>
    );
}

/** "Frankfurt, Hesse, DE" from whichever pieces the geo provider returned. */
function formatLocation(info: TorIpInfo): string {
    const parts = [info.city, info.region, info.country].filter(Boolean);
    return parts.length ? parts.join(", ") : "Unknown";
}

function TorInfoDialog({ model }: ViewPropsRO<TorInfoDialogModel>) {
    const { loading, reconnecting, info, note } = model.state.use();
    const busy = loading || reconnecting;

    return (
        <Dialog name="tor-info-dialog" onKeyDown={model.handleKeyDown}>
            <DialogContent
                title="Tor connection"
                icon={<TorIcon />}
                onClose={() => model.close(undefined)}
                minWidth={460}
                maxWidth={620}
            >
                <Panel direction="column" gap="md" paddingX="xxl" paddingY="xl">
                    {busy && (
                        <Panel direction="row" gap="md" align="center">
                            <Spinner size={16} />
                            <Text size="sm" color="light">
                                {reconnecting
                                    ? "Restarting Tor — this can take up to a minute..."
                                    : "Looking up the exit address through Tor..."}
                            </Text>
                        </Panel>
                    )}

                    {!busy && info && (
                        <Panel direction="column" gap="sm">
                            <InfoRow label="IP address" value={info.ip || "Unknown"} />
                            <InfoRow label="Location" value={formatLocation(info)} />
                            {info.org && <InfoRow label="Exit node" value={info.org} />}
                            <InfoRow
                                label="Exiting through Tor"
                                value={
                                    info.isTor === null ? "Could not verify"
                                        : info.isTor ? "Yes"
                                            : "No"
                                }
                            />
                        </Panel>
                    )}

                    {!busy && info?.error && (
                        <Text size="sm" color="error">{info.error}</Text>
                    )}

                    {!busy && info?.isTor === false && (
                        <Text size="sm" color="warning">
                            check.torproject.org says this request did not arrive over Tor.
                        </Text>
                    )}

                    {note && <Text size="sm" color="light">{note}</Text>}

                    {!busy && info?.geoSource && (
                        <Text size="xs" color="light">
                            Location reported by {info.geoSource}, queried through Tor.
                        </Text>
                    )}

                    <Text size="xs" color="light">
                        Reconnecting restarts Tor for every open Tor page. A new circuit does not
                        always mean a different exit node.
                    </Text>
                </Panel>
                <Panel direction="row" justify="end" gap="sm" padding="md">
                    <Button onClick={() => model.close(undefined)}>Close</Button>
                    <Button variant="primary" disabled={busy} onClick={model.reconnect}>
                        Reconnect
                    </Button>
                </Panel>
            </DialogContent>
        </Dialog>
    );
}

Views.registerView(torInfoDialogId, TorInfoDialog as DefaultView);

export function showTorInfoDialog(partition: string) {
    const model = new TorInfoDialogModel(
        new TComponentState<TorInfoDialogState>({
            partition,
            loading: true,
            reconnecting: false,
            info: null,
            note: "",
        }),
    );
    return showDialog({
        viewId: torInfoDialogId,
        model,
    }) as Promise<void>;
}

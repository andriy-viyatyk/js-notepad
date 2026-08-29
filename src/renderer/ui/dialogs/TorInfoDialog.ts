import { TDialogModel } from "../../core/state/model";
import { TComponentState } from "../../core/state/state";
import { TorChannel, type TorIpInfo } from "../../../ipc/tor-ipc";
import { showDialog } from "./Dialogs";
import { registerDialogView } from "./dialog-view-registry";
import { TorInfoDialogView } from "./TorInfoDialogView";

const { ipcRenderer } = require("electron");

export const torInfoDialogId = Symbol("torInfoDialog");

export interface TorInfoDialogState {
    partition: string;
    loading: boolean;
    reconnecting: boolean;
    info: TorIpInfo | null;
    note: string;
}

export class TorInfoDialogModel extends TDialogModel<TorInfoDialogState, void> {
    private viewDisposed = false;

    postCreate = () => {
        void this.load();
    };

    handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
            event.preventDefault();
            void this.close(undefined);
        }
    };

    private load = async (): Promise<string> => {
        if (this.viewDisposed) return "";
        this.state.update((state) => { state.loading = true; });
        const info: TorIpInfo = await ipcRenderer.invoke(
            TorChannel.checkIp,
            this.state.get().partition,
        );
        if (this.viewDisposed) return "";
        this.state.update((state) => {
            state.info = info;
            state.loading = false;
        });
        return info.ip;
    };

    reconnect = async () => {
        const state = this.state.get();
        if (this.viewDisposed || state.reconnecting || state.loading) return;

        const previousIp = state.info?.ip ?? "";
        this.state.update((draft) => {
            draft.reconnecting = true;
            draft.note = "";
        });

        const result: { success: boolean; error?: string } = await ipcRenderer.invoke(
            TorChannel.restart,
            state.partition,
        );
        if (this.viewDisposed) return;

        if (!result.success) {
            this.state.update((draft) => {
                draft.reconnecting = false;
                draft.note = result.error || "Reconnect failed.";
            });
            return;
        }

        const newIp = await this.load();
        if (this.viewDisposed) return;
        this.state.update((draft) => {
            draft.reconnecting = false;
            if (!newIp) {
                draft.note = "Reconnected, but the exit IP could not be looked up.";
            } else if (newIp === previousIp) {
                draft.note = "Tor selected the same exit node \u2014 click Reconnect again for a different one.";
            } else {
                draft.note = "Reconnected with a new exit node.";
            }
        });
    };

    disposeView = () => {
        this.viewDisposed = true;
    };
}

registerDialogView(torInfoDialogId, TorInfoDialogView);

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
    const result = showDialog({
        viewId: torInfoDialogId,
        model,
    });
    model.postCreate?.();
    return result as Promise<void>;
}

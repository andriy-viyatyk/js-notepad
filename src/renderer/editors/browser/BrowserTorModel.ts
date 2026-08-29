const { ipcRenderer } = require("electron");
import { settings } from "../../api/settings";
import { windowClosing } from "../../core/state/events";
import { getPartitionString } from "./BrowserEditorModel";
import { TorChannel, TorStatus } from "../../../ipc/tor-ipc";
import { errMessage } from "../../../shared/utils";
import type { BrowserEditorModel } from "./BrowserEditorModel";
import { DisposableStore } from "../../core/utils/DisposableStore";

/** Owns the Tor partition and daemon lifecycle for one browser editor page. */
export class BrowserTorModel {
    private readonly incognitoId = crypto.randomUUID();
    private readonly torId = crypto.randomUUID();
    private torArmed = false;
    private readonly disposables = new DisposableStore();

    constructor(readonly model: BrowserEditorModel) {
        this.disposables.add(windowClosing.subscribe(() => this.handleWindowClosing()));
        this.disposables.add(() => {
            ipcRenderer.removeListener(TorChannel.log, this.torLogListener);
            ipcRenderer.removeListener(TorChannel.status, this.torStatusListener);
        });
    }

    /** Electron session partition string, derived from profile state. */
    get partition(): string {
        const s = this.model.state.get();
        return getPartitionString(s.profileName, s.isIncognito, this.incognitoId, s.isTor, this.torId);
    }

    /** Open the Tor connection info dialog (exit IP, location, Reconnect). */
    showInfoDialog = async (): Promise<void> => {
        const { showTorInfoDialog } = await import("../../ui/dialogs/TorInfoDialog");
        await showTorInfoDialog(this.partition);
    };

    /** Put this page's partition behind the SOCKS proxy before anything can load. */
    armProxy = async (): Promise<void> => {
        if (this.torArmed) return;
        const socksPort = settings.get("tor.socks-port");
        await ipcRenderer.invoke(TorChannel.arm, socksPort, this.partition);
        this.torArmed = true;
    };

    /** Start Tor proxy for this page's partition. Shows overlay with progress. */
    init = async (): Promise<{ success: boolean; error?: string }> => {
        this.model.state.update((s) => {
            s.torStatus = "connecting";
            s.torOverlayVisible = true;
            s.torLog = "";
        });
        ipcRenderer.removeListener(TorChannel.log, this.torLogListener);
        ipcRenderer.removeListener(TorChannel.status, this.torStatusListener);
        ipcRenderer.on(TorChannel.log, this.torLogListener);
        ipcRenderer.on(TorChannel.status, this.torStatusListener);

        const torExePath = settings.get("tor.exe-path");
        const socksPort = settings.get("tor.socks-port");
        const result = await ipcRenderer.invoke(
            TorChannel.start, torExePath, socksPort, this.partition,
        );

        this.model.state.update((s) => {
            s.torStatus = result.success ? "connected" : "error";
            if (result.error) {
                s.torLog += (s.torLog ? "\n" : "") + result.error;
            }
            if (result.success) {
                setTimeout(() => {
                    this.model.state.update((s2) => { s2.torOverlayVisible = false; });
                }, 500);
            }
        });
        return result;
    };

    /** Reconnect Tor after a restored session or daemon restart. */
    reconnect = async (): Promise<void> => {
        try {
            await this.armProxy();
        } catch (err) {
            this.model.state.update((s) => {
                s.torStatus = "error";
                s.torOverlayVisible = true;
                s.torLog += (s.torLog ? "\n" : "")
                    + `Could not secure the session: ${errMessage(err)}`;
            });
            return;
        }
        await this.init();
    };

    toggleOverlay = () => {
        this.model.state.update((s) => { s.torOverlayVisible = !s.torOverlayVisible; });
    };

    dispose = () => {
        this.disposables.dispose();
        const s = this.model.state.get();
        if (s.isTor) {
            ipcRenderer.invoke(TorChannel.stop, this.partition);
        }
    };

    private torLogListener = (_event: unknown, line: string) => {
        this.model.state.update((s) => {
            s.torLog += (s.torLog ? "\n" : "") + line;
        });
    };

    private torStatusListener = (
        _event: unknown,
        payload: { status: TorStatus; error?: string },
    ) => {
        this.model.state.update((s) => {
            s.torStatus = payload.status;
            if (payload.error) {
                s.torLog += (s.torLog ? "\n" : "") + payload.error;
            }
            if (payload.status !== "connected") {
                s.torOverlayVisible = true;
            }
        });
        if (payload.status === "connected") {
            setTimeout(() => {
                this.model.state.update((s) => { s.torOverlayVisible = false; });
            }, 500);
        }
    };

    private handleWindowClosing = () => {
        if (this.model.state.get().isTor) {
            ipcRenderer.removeListener(TorChannel.log, this.torLogListener);
            ipcRenderer.removeListener(TorChannel.status, this.torStatusListener);
            ipcRenderer.invoke(TorChannel.stop, this.partition);
        }
    };
}

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
    private readonly overlayHideTimers = new Set<ReturnType<typeof setTimeout>>();
    private lifecycleGeneration = 0;
    private disposed = false;

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
        const generation = this.lifecycleGeneration;
        if (this.disposed) return { success: false, error: "Tor model disposed." };
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
        if (this.disposed || generation !== this.lifecycleGeneration) return result;

        this.model.state.update((s) => {
            s.torStatus = result.success ? "connected" : "error";
            if (result.error) {
                s.torLog += (s.torLog ? "\n" : "") + result.error;
            }
            if (result.success) {
                this.scheduleOverlayHide(generation);
            }
        });
        return result;
    };

    /** Reconnect Tor after a restored session or daemon restart. */
    reconnect = async (): Promise<void> => {
        const generation = this.lifecycleGeneration;
        if (this.disposed) return;
        try {
            await this.armProxy();
        } catch (err) {
            if (this.disposed || generation !== this.lifecycleGeneration) return;
            this.model.state.update((s) => {
                s.torStatus = "error";
                s.torOverlayVisible = true;
                s.torLog += (s.torLog ? "\n" : "")
                    + `Could not secure the session: ${errMessage(err)}`;
            });
            return;
        }
        if (this.disposed || generation !== this.lifecycleGeneration) return;
        await this.init();
    };

    toggleOverlay = () => {
        this.model.state.update((s) => { s.torOverlayVisible = !s.torOverlayVisible; });
    };

    dispose = () => {
        this.disposed = true;
        this.lifecycleGeneration++;
        for (const timer of this.overlayHideTimers) clearTimeout(timer);
        this.overlayHideTimers.clear();
        this.disposables.dispose();
        const s = this.model.state.get();
        if (s.isTor) {
            ipcRenderer.invoke(TorChannel.stop, this.partition);
        }
    };

    private torLogListener = (_event: unknown, line: string) => {
        if (this.disposed) return;
        this.model.state.update((s) => {
            s.torLog += (s.torLog ? "\n" : "") + line;
        });
    };

    private torStatusListener = (
        _event: unknown,
        payload: { status: TorStatus; error?: string },
    ) => {
        if (this.disposed) return;
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
            this.scheduleOverlayHide(this.lifecycleGeneration);
        }
    };

    private scheduleOverlayHide(generation: number): void {
        // Wait 500 ms so the successful connection overlay remains visible before hiding it.
        const timer = setTimeout(() => {
            this.overlayHideTimers.delete(timer);
            if (this.disposed || generation !== this.lifecycleGeneration) return;
            this.model.state.update((s) => { s.torOverlayVisible = false; });
        }, 500);
        this.overlayHideTimers.add(timer);
    }

    private handleWindowClosing = () => {
        if (this.model.state.get().isTor) {
            ipcRenderer.removeListener(TorChannel.log, this.torLogListener);
            ipcRenderer.removeListener(TorChannel.status, this.torStatusListener);
            ipcRenderer.invoke(TorChannel.stop, this.partition);
        }
    };
}

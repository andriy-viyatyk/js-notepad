import { TComponentModel } from "../../../core/state/model";
import { api } from "../../../../ipc/renderer/api";

const defaultDefaultBrowserSectionState = {
    registered: null as boolean | null,
    busy: false,
};

export type DefaultBrowserSectionState = typeof defaultDefaultBrowserSectionState;

/** Owns the asynchronous Windows default-browser registration actions. */
export class DefaultBrowserSectionModel extends TComponentModel<DefaultBrowserSectionState, Record<string, never>> {
    init(): void {
        this.effect(() => { void this.checkStatus(); });
    }

    checkStatus = async () => {
        const registered = await api.isRegisteredAsDefaultBrowser();
        if (this.isLive) this.state.update((state) => { state.registered = registered; });
    };

    handleRegister = async () => {
        this.state.update((state) => { state.busy = true; });
        try {
            await api.registerAsDefaultBrowser();
            await this.checkStatus();
        } finally {
            if (this.isLive) this.state.update((state) => { state.busy = false; });
        }
    };

    handleUnregister = async () => {
        this.state.update((state) => { state.busy = true; });
        try {
            await api.unregisterAsDefaultBrowser();
            await this.checkStatus();
        } finally {
            if (this.isLive) this.state.update((state) => { state.busy = false; });
        }
    };

    handleOpenSettings = () => {
        api.openDefaultAppsSettings();
    };
}

export { defaultDefaultBrowserSectionState };

import { TModel } from "../core/state/model";
import { TGlobalState } from "../core/state/state";
import { api } from "../../ipc/renderer/api";
import rendererEvents from "../../ipc/renderer/renderer-events";
import { DownloadEntry } from "../../ipc/api-param-types";
import type { IDownloads } from "./types/downloads";

const defaultDownloadsState = {
    downloads: [] as DownloadEntry[],
};

type DownloadsState = typeof defaultDownloadsState;

/**
 * Downloads — Global download tracking service.
 * Manages download state synchronized from main process.
 * Implements IDownloads interface.
 */
class Downloads extends TModel<DownloadsState> implements IDownloads {
    constructor() {
        super(new TGlobalState(defaultDownloadsState));
    }

    /** Load current downloads from main process and subscribe to events. */
    async init(): Promise<void> {
        const downloads = await api.getDownloads();
        this.state.update((s) => {
            s.downloads = downloads;
        });

        this.own(rendererEvents.eDownloadStarted.subscribe((entry) => {
                this.state.update((s) => {
                    s.downloads = [entry, ...s.downloads];
                });
            }));
        this.own(rendererEvents.eDownloadProgress.subscribe((data) => {
                this.state.update((s) => {
                    const dl = s.downloads.find((d) => d.id === data.id);
                    if (dl) {
                        dl.receivedBytes = data.receivedBytes;
                        dl.totalBytes = data.totalBytes;
                    }
                });
            }));
        this.own(rendererEvents.eDownloadCompleted.subscribe((data) => {
                this.state.update((s) => {
                    const dl = s.downloads.find((d) => d.id === data.id);
                    if (dl) {
                        dl.status = "completed";
                        if (data.savePath) {
                            dl.savePath = data.savePath;
                        }
                    }
                });
            }));
        this.own(rendererEvents.eDownloadFailed.subscribe((data) => {
                this.state.update((s) => {
                    const dl = s.downloads.find((d) => d.id === data.id);
                    if (dl) {
                        dl.status = "failed";
                        dl.error = data.error;
                    }
                });
            }));
        this.own(rendererEvents.eDownloadCleared.subscribe((downloads) => {
                this.state.update((s) => {
                    s.downloads = downloads;
                });
            }));
    }

    get downloads(): DownloadEntry[] {
        return this.state.get().downloads;
    }

    get hasActiveDownloads(): boolean {
        return this.state.get().downloads.some((d) => d.status === "downloading");
    }

    get aggregateProgress(): number {
        const active = this.state.get().downloads.filter((d) => d.status === "downloading");
        if (active.length === 0) return 0;
        const totalBytes = active.reduce((sum, d) => sum + d.totalBytes, 0);
        const receivedBytes = active.reduce((sum, d) => sum + d.receivedBytes, 0);
        if (totalBytes <= 0) return 0;
        return Math.min(1, receivedBytes / totalBytes);
    }

    cancelDownload = (id: string) => api.cancelDownload(id);
    openDownload = (id: string) => api.openDownload(id);
    showInFolder = (id: string) => api.showDownloadInFolder(id);
    clearCompleted = () => api.clearCompletedDownloads();
}

export const downloads = new Downloads();

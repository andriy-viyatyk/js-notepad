import path from "node:path";
import fs from "node:fs";
import { app, BrowserWindow, dialog, DownloadItem, Session, shell, WebContents } from "electron";
import { DownloadEntry } from "../ipc/api-param-types";
import { EventEndpoint } from "../ipc/api-types";
import { openWindows } from "./open-windows";
import { getDataFolder, preparePath } from "./utils";

const PERSIST_FILE = "recentDownloads.json";
const MAX_PERSISTED = 5;
const PROGRESS_THROTTLE_MS = 500;

class DownloadService {
    private downloads = new Map<string, { entry: DownloadEntry; item?: DownloadItem }>();
    private hookedSessions = new WeakSet<Session>();
    private idCounter = 0;

    init(): void {
        this.loadPersisted();
        app.on("session-created", (ses) => {
            this.hookSession(ses);
        });
    }

    hookSession(ses: Session): void {
        if (this.hookedSessions.has(ses)) return;
        this.hookedSessions.add(ses);

        ses.on("will-download", (_event, item, webContents) => {
            this.handleWillDownload(item, webContents);
        });
    }

    getDownloads(): DownloadEntry[] {
        return Array.from(this.downloads.values())
            .map(d => ({ ...d.entry }))
            .sort((a, b) => b.startTime - a.startTime);
    }

    cancelDownload(id: string): void {
        const dl = this.downloads.get(id);
        if (dl?.item && dl.entry.status === "downloading") {
            dl.item.cancel();
        }
    }

    openDownload(id: string): void {
        const dl = this.downloads.get(id);
        if (dl?.entry.savePath && dl.entry.status === "completed") {
            shell.openPath(dl.entry.savePath);
        }
    }

    showInFolder(id: string): void {
        const dl = this.downloads.get(id);
        if (dl?.entry.savePath) {
            shell.showItemInFolder(dl.entry.savePath);
        }
    }

    clearCompleted(): void {
        for (const [id, dl] of this.downloads) {
            if (dl.entry.status !== "downloading") {
                this.downloads.delete(id);
            }
        }
        this.persist();
        openWindows.send(EventEndpoint.eDownloadCleared, this.getDownloads());
    }

    private generateId(): string {
        return `dl-${Date.now()}-${++this.idCounter}`;
    }

    private getParentWindow(webContents: WebContents): BrowserWindow | undefined {
        // For webview downloads, get the host window
        const hostContents = (webContents as any).hostWebContents as WebContents | undefined;
        const contents = hostContents || webContents;
        return BrowserWindow.fromWebContents(contents) ?? undefined;
    }

    private handleWillDownload(item: DownloadItem, webContents: WebContents): void {
        const id = this.generateId();
        let lastProgressSent = 0;

        // Show our own save dialog to reliably capture the save path.
        // Electron's getSavePath() returns empty for webview session downloads.
        const parentWindow = this.getParentWindow(webContents);
        const defaultDir = app.getPath("downloads");
        const defaultPath = path.join(defaultDir, item.getFilename());

        const savePath = dialog.showSaveDialogSync(
            parentWindow,
            { defaultPath },
        );

        if (!savePath) {
            item.cancel();
            return;
        }

        item.setSavePath(savePath);

        const entry: DownloadEntry = {
            id,
            filename: path.basename(savePath),
            url: item.getURL(),
            savePath,
            totalBytes: item.getTotalBytes(),
            receivedBytes: 0,
            status: "downloading",
            startTime: Date.now(),
        };

        this.downloads.set(id, { entry, item });
        openWindows.send(EventEndpoint.eDownloadStarted, { ...entry });

        item.on("updated", (_event, state) => {
            if (state === "progressing") {
                entry.receivedBytes = item.getReceivedBytes();
                entry.totalBytes = item.getTotalBytes();

                const now = Date.now();
                if (now - lastProgressSent >= PROGRESS_THROTTLE_MS) {
                    lastProgressSent = now;
                    openWindows.send(EventEndpoint.eDownloadProgress, {
                        id,
                        receivedBytes: entry.receivedBytes,
                        totalBytes: entry.totalBytes,
                    });
                }
            }
        });

        item.on("done", (_event, state) => {
            entry.receivedBytes = item.getReceivedBytes();
            entry.totalBytes = item.getTotalBytes();

            if (state === "completed") {
                entry.status = "completed";
                openWindows.send(EventEndpoint.eDownloadCompleted, { id, savePath: entry.savePath });
            } else if (state === "cancelled") {
                entry.status = "cancelled";
                openWindows.send(EventEndpoint.eDownloadFailed, { id, error: "Cancelled" });
            } else {
                entry.status = "failed";
                entry.error = "Download interrupted";
                openWindows.send(EventEndpoint.eDownloadFailed, { id, error: entry.error });
            }

            // Release DownloadItem reference
            const dl = this.downloads.get(id);
            if (dl) {
                dl.item = undefined;
            }

            this.persist();
        });
    }

    private loadPersisted(): void {
        try {
            const filePath = path.join(getDataFolder(), PERSIST_FILE);
            if (!fs.existsSync(filePath)) return;

            const data = fs.readFileSync(filePath, { encoding: "utf-8" });
            const entries: DownloadEntry[] = JSON.parse(data);
            for (const entry of entries) {
                this.downloads.set(entry.id, { entry });
            }
        } catch {
            // Ignore corrupted data
        }
    }

    private persist(): void {
        try {
            const completed = this.getDownloads()
                .filter(d => d.status === "completed")
                .slice(0, MAX_PERSISTED);

            const dataFolder = getDataFolder();
            if (!preparePath(dataFolder)) return;

            const filePath = path.join(dataFolder, PERSIST_FILE);
            fs.writeFileSync(filePath, JSON.stringify(completed, null, 2), { encoding: "utf-8" });
        } catch {
            // Non-critical
        }
    }
}

export const downloadService = new DownloadService();

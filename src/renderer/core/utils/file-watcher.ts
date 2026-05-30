const nodefs = require("fs");

import { FileStats } from "../../../shared/types";
import { debounce } from "../../../shared/utils";
import { fs } from "../../api/fs";
import { isArchivePath, isAsarPath } from "./file-path";

function watchFile(filePath: string, callback: (event: string) => void): () => void {
    try {
        const watcher = nodefs.watch(filePath, (eventType: string) => {
            callback(eventType);
        });
        return () => {
            watcher.close();
        };
    } catch (err) {
        console.error("Error watching file:", err);
        return () => {
            /**/
        };
    }
}

function getFileStats(filePath: string): FileStats {
    try {
        const stats = nodefs.statSync(filePath);
        return {
            size: stats.size,
            mtime: stats.mtime.getTime(),
            exists: true,
        };
    } catch (err) {
        return {
            size: 0,
            mtime: 0,
            exists: false,
        };
    }
}

export class FileWatcher {
    private path: string;
    private unWatch: () => void;
    private onChange: () => void;

    stat: FileStats = {
        size: 0,
        mtime: 0,
        exists: false,
    }
    encoding = "utf-8";

    constructor(filePath: string, onChange: () => void) {
        this.path = filePath;
        this.onChange = onChange;
        if (isArchivePath(filePath) || isAsarPath(filePath)) {
            // Archive/asar inner files can't be watched — no-op
            this.unWatch = () => {};
            this.stat = { size: 0, mtime: 0, exists: true };
        } else {
            this.unWatch = watchFile(this.path, this.onFileChange);
            this.stat = getFileStats(this.path);
        }
    }

    dispose = () => {
        this.unWatch();
    }

    getTextContent = async (encoding?: string): Promise<string | undefined> => {
        if (isArchivePath(this.path) || isAsarPath(this.path)) {
            // Archive/asar paths use async exists check via fs.readFile
            try {
                const fileData = await fs.readFile(this.path, encoding);
                this.encoding = fileData.encoding || "utf-8";
                return fileData.content;
            } catch {
                return undefined;
            }
        }
        if (!fs.fileExistsSync(this.path)) {
            return undefined;
        }
        const fileData = await fs.readFile(this.path, encoding);
        this.encoding = fileData.encoding || "utf-8";
        return fileData.content;
    }

    get filePath(): string {
        return this.path;
    }

    private onFileChange = (_eventType: string) => {
        const newStat = getFileStats(this.path);
        this.stat = newStat;
        this.onChangeDebounced();
    }

    private onChangeDebounced = debounce(() => {
        this.onChange();
    }, 300);
}

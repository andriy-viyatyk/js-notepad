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

/**
 * Recursive directory watcher (US-624). A disposable wrapper over
 * `fs.watch(dir, { recursive: true })` with a debounced callback — mirrors
 * `FileTreeProvider.watch` but as a class consistent with `FileWatcher`. Used by
 * the Git Tree editor to auto-refresh when the repo changes on disk. Degrades
 * gracefully (no-op) when a watch can't be established (network drives, missing
 * dir, platforms without recursive support).
 *
 * `onChange` receives the changed path relative to `dirPath` (when the platform
 * reports it; `undefined` otherwise). Callers that don't care which file changed
 * can ignore the argument. Note: the callback is debounced, so when several files
 * change inside one window the path is the LAST event's — fine for "something
 * changed, re-scan" consumers; consumers that key off the path should tolerate a
 * coalesced report.
 */
export class DirectoryWatcher {
    private unWatch: () => void;

    constructor(dirPath: string, onChange: (filename?: string) => void, debounceMs = 500) {
        const debouncedOnChange = debounce((filename?: string) => onChange(filename), debounceMs);
        try {
            const watcher = nodefs.watch(
                dirPath,
                { recursive: true },
                (_eventType: string, filename: string | null) => debouncedOnChange(filename ?? undefined),
            );
            this.unWatch = () => watcher.close();
        } catch (err) {
            console.error("Error watching directory:", err);
            this.unWatch = () => {
                /**/
            };
        }
    }

    dispose = () => {
        this.unWatch();
    };
}

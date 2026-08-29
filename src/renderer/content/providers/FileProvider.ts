import type { IProvider, IProviderDescriptor, IProviderStat } from "../../api/types/io.provider";
import { debounce } from "../../../shared/utils";
import { fpBasename } from "../../core/utils/file-path";

const nodefs = require("fs");

/**
 * FileProvider — reads/writes binary content from local files.
 *
 * Does NOT handle archive paths (no `!` detection). Archive support
 * comes from FileProvider + ArchiveTransformer in the pipe chain.
 */
export class FileProvider implements IProvider {
    readonly type = "file";
    readonly restorable = true;
    readonly writable = true;
    readonly sourceUrl: string;
    readonly displayName: string;

    constructor(private readonly filePath: string) {
        this.sourceUrl = filePath;
        this.displayName = fpBasename(filePath);
    }

    async readBinary(): Promise<Buffer> {
        return nodefs.promises.readFile(this.filePath);
    }

    createReadStream(range?: { start: number; end: number }): NodeJS.ReadableStream {
        const options = range ? { start: range.start, end: range.end } : undefined;
        return nodefs.createReadStream(this.filePath, options);
    }

    async writeBinary(data: Buffer): Promise<void> {
        await nodefs.promises.writeFile(this.filePath, data);
    }

    async stat(): Promise<IProviderStat> {
        try {
            const stats = await nodefs.promises.stat(this.filePath);
            return {
                size: stats.size,
                mtime: new Date(stats.mtime).toISOString(),
                exists: true,
            };
        } catch {
            return { exists: false };
        }
    }

    watch(callback: (event: string) => void): () => void {
        const debouncedCallback = debounce((event: string) => {
            callback(event);
        }, 300);

        try {
            const watcher = nodefs.watch(this.filePath, (eventType: string) => {
                debouncedCallback(eventType);
            });
            return () => watcher.close();
        } catch {
            return () => { /* watch failed — no-op */ };
        }
    }

    toDescriptor(): IProviderDescriptor {
        return {
            type: "file",
            config: { path: this.filePath },
        };
    }

    dispose(): void {
        // No resources to release. Watch subscriptions are managed
        // by the caller via the returned disposer.
    }
}

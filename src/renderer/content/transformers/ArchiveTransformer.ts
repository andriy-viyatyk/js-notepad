import type { ITransformer, ITransformerDescriptor } from "../../api/types/io.transformer";
import { isZipBasedArchive } from "../../core/utils/file-path";
import { archiveService } from "../../api/archive-service";

/**
 * ArchiveTransformer — extracts/replaces a single entry in an archive.
 *
 * Read:  full archive bytes → extract entryPath → entry content bytes (via archiveService / libarchive-wasm)
 * Write: new content + original ZIP bytes → replace entry → full ZIP bytes (jszip, ZIP-only)
 *
 * Note: read() ignores the incoming `data` buffer and reads the archive from disk
 * via archiveService, which handles WASM module lifecycle and sequential queuing.
 * The `data` parameter (from FileProvider) is the raw archive bytes, but we let
 * archiveService handle the reading to reuse its cached WASM module.
 */
export class ArchiveTransformer implements ITransformer {
    readonly type = "archive";
    readonly persistent = true;
    readonly config: Record<string, unknown>;

    constructor(
        private readonly archivePath: string,
        private readonly entryPath: string,
    ) {
        this.config = { archivePath, entryPath };
    }

    get writable(): boolean {
        return isZipBasedArchive(this.archivePath);
    }

    async read(_data: Buffer): Promise<Buffer> {
        return archiveService.readFile(this.archivePath, this.entryPath);
    }

    async write(data: Buffer, readOriginal: () => Promise<Buffer>): Promise<Buffer> {
        if (!this.writable) {
            throw new Error(`Write not supported for this archive format: ${this.archivePath}`);
        }
        const original = await readOriginal();
        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(original);
        zip.file(this.entryPath, data);
        return zip.generateAsync({
            type: "nodebuffer",
            compression: "DEFLATE",
            compressionOptions: { level: 6 },
        });
    }

    clone(): ITransformer {
        return new ArchiveTransformer(this.archivePath, this.entryPath);
    }

    toDescriptor(): ITransformerDescriptor {
        return {
            type: "archive",
            config: { archivePath: this.archivePath, entryPath: this.entryPath },
        };
    }
}

/**
 * Archive Service — read/write files inside archives.
 *
 * Reading uses libarchive-wasm (supports ZIP, RAR, 7z, TAR, etc.).
 * Writing uses jszip (ZIP-based formats only).
 *
 * All operations go through a per-archive sequential queue to prevent
 * concurrent read/write on the same archive file.
 *
 * This module uses `require("fs")` directly (documented exception) because
 * it is the low-level provider that fs.ts routes archive paths to — using
 * fs.ts would create a circular dependency.
 */

const nodefs = require("fs") as typeof import("fs");

import type { IFileStat, IDirEntry } from "./types/fs";
import { isZipBasedArchive, fpResolve, fpDirname, fpNormalizeForCompare } from "../core/utils/file-path";
import type { LibarchiveWasm } from "libarchive-wasm";

// =============================================================================
// Types
// =============================================================================

export interface ArchiveEntry {
    /** Inner path (e.g., "word/document.xml") — always forward slashes */
    path: string;
    /** True if this is a directory entry */
    isDirectory: boolean;
    /** Uncompressed size in bytes (0 for directories) */
    size: number;
    /** Last modified time (ms since epoch) */
    mtime: number;
}

// =============================================================================
// ArchiveService
// =============================================================================

class ArchiveService {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private queues = new Map<string, Promise<any>>();
    private wasmModule: LibarchiveWasm | null = null;

    // ── WASM Module ──────────────────────────────────────────────────────

    private async getWasmModule(): Promise<LibarchiveWasm> {
        if (!this.wasmModule) {
            const { libarchiveWasm } = await import("libarchive-wasm");
            // Load WASM binary from assets folder via app-asset:// scheme.
            // Vite dev server can't serve .wasm with correct MIME type via import(),
            // so we fetch the binary and pass it directly.
            const response = await fetch("app-asset://libarchive/libarchive.wasm");
            const wasmBinary = await response.arrayBuffer();
            this.wasmModule = await libarchiveWasm({ wasmBinary });
        }
        return this.wasmModule;
    }

    // ── Reading (libarchive-wasm) ────────────────────────────────────────

    /** Read all entries from an archive (single-pass sequential scan). */
    private async readAllEntries(archivePath: string): Promise<ArchiveEntry[]> {
        const { ArchiveReader } = await import("libarchive-wasm");
        const mod = await this.getWasmModule();
        const data = nodefs.readFileSync(archivePath);
        const reader = new ArchiveReader(mod, new Int8Array(data.buffer, data.byteOffset, data.byteLength));
        try {
            const entries: ArchiveEntry[] = [];
            for (const entry of reader.entries()) {
                let entryPath = entry.getPathname();
                const isDir = entry.getFiletype() === "Directory";
                // Normalize: strip trailing slash from directory paths
                if (isDir && entryPath.endsWith("/")) {
                    entryPath = entryPath.slice(0, -1);
                }
                entries.push({
                    path: entryPath,
                    isDirectory: isDir,
                    size: entry.getSize() ?? 0,
                    mtime: entry.getModificationTime() ?? 0,
                });
            }
            return entries;
        } finally {
            reader.free();
        }
    }

    /** Read a single file's contents from an archive. */
    private async readEntryData(archivePath: string, innerPath: string): Promise<Buffer> {
        const { ArchiveReader } = await import("libarchive-wasm");
        const mod = await this.getWasmModule();
        const data = nodefs.readFileSync(archivePath);
        const reader = new ArchiveReader(mod, new Int8Array(data.buffer, data.byteOffset, data.byteLength));
        try {
            for (const entry of reader.entries()) {
                if (entry.getPathname() === innerPath || entry.getPathname() === innerPath + "/") {
                    const content = entry.readData();
                    if (!content) return Buffer.alloc(0);
                    return Buffer.from(content.buffer, content.byteOffset, content.byteLength);
                }
            }
            throw new Error(`File not found in archive: ${innerPath}`);
        } finally {
            reader.free();
        }
    }

    // ── Writing (jszip, ZIP-only) ────────────────────────────────────────

    /** Load a ZIP archive for write operations using jszip. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async loadZipArchive(archivePath: string): Promise<any> {
        this.assertZipFormat(archivePath);
        const JSZip = (await import("jszip")).default;
        const data = nodefs.readFileSync(archivePath);
        return JSZip.loadAsync(data);
    }

    /** Throw if the archive is not a ZIP-based format. */
    private assertZipFormat(archivePath: string): void {
        if (!isZipBasedArchive(archivePath)) {
            throw new Error(`Write operations are only supported for ZIP-based archives: ${archivePath}`);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async generateZip(zip: any): Promise<Buffer> {
        return zip.generateAsync({
            type: "nodebuffer",
            compression: "DEFLATE",
            compressionOptions: { level: 6 },
        });
    }

    // ── Public API ───────────────────────────────────────────────────────

    /** List all entries in an archive. */
    async listEntries(archivePath: string): Promise<ArchiveEntry[]> {
        return this.enqueue(archivePath, () => this.readAllEntries(archivePath));
    }

    /**
     * Extract every entry of an archive into `targetDir` in a single pass (open once,
     * write each entry). Guards against zip-slip — entries resolving outside `targetDir`
     * are rejected. Creates parent directories as needed.
     */
    async extractTo(archivePath: string, targetDir: string): Promise<void> {
        return this.enqueue(archivePath, async () => {
            const { ArchiveReader } = await import("libarchive-wasm");
            const mod = await this.getWasmModule();
            const data = nodefs.readFileSync(archivePath);
            const reader = new ArchiveReader(mod, new Int8Array(data.buffer, data.byteOffset, data.byteLength));
            const rootKey = fpNormalizeForCompare(targetDir);
            try {
                nodefs.mkdirSync(targetDir, { recursive: true });
                for (const entry of reader.entries()) {
                    let entryPath = entry.getPathname();
                    const isDir = entry.getFiletype() === "Directory";
                    if (isDir && entryPath.endsWith("/")) entryPath = entryPath.slice(0, -1);
                    if (!entryPath || entryPath === ".") continue;

                    const dest = fpResolve(targetDir, entryPath);
                    const destKey = fpNormalizeForCompare(dest);
                    // zip-slip: dest must be inside targetDir (equal or under it)
                    if (destKey !== rootKey && !destKey.startsWith(rootKey + "/")) {
                        throw new Error(`Unsafe archive entry (zip-slip): ${entryPath}`);
                    }
                    if (isDir) {
                        nodefs.mkdirSync(dest, { recursive: true });
                    } else {
                        nodefs.mkdirSync(fpDirname(dest), { recursive: true });
                        const content = entry.readData();
                        const buf = content
                            ? Buffer.from(content.buffer, content.byteOffset, content.byteLength)
                            : Buffer.alloc(0);
                        nodefs.writeFileSync(dest, buf);
                    }
                }
            } finally {
                reader.free();
            }
        });
    }

    /** List immediate children of a directory inside an archive. */
    async listDir(archivePath: string, innerDir: string): Promise<IDirEntry[]> {
        return this.enqueue(archivePath, async () => {
            const allEntries = await this.readAllEntries(archivePath);
            const prefix = innerDir ? innerDir.replace(/\/$/, "") + "/" : "";
            const seen = new Map<string, boolean>(); // name → isDirectory

            for (const entry of allEntries) {
                if (!entry.path.startsWith(prefix)) continue;
                const remainder = entry.path.slice(prefix.length);
                if (!remainder) continue; // the directory entry itself

                const slashIdx = remainder.indexOf("/");
                if (slashIdx === -1) {
                    // Direct child file or leaf directory
                    seen.set(remainder, entry.isDirectory);
                } else {
                    // Direct child folder (take first segment)
                    const folderName = remainder.slice(0, slashIdx);
                    if (!seen.has(folderName)) {
                        seen.set(folderName, true);
                    }
                }
            }

            const entries: IDirEntry[] = [];
            for (const [name, isDirectory] of seen) {
                entries.push({ name, isDirectory });
            }
            entries.sort((a, b) => {
                if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
            return entries;
        });
    }

    /** Read a file from inside an archive. Returns raw Buffer. */
    async readFile(archivePath: string, innerPath: string): Promise<Buffer> {
        return this.enqueue(archivePath, () => this.readEntryData(archivePath, innerPath));
    }

    /** Write a file into a ZIP archive (read → replace → write back). */
    async writeFile(archivePath: string, innerPath: string, content: Buffer): Promise<void> {
        return this.enqueue(archivePath, async () => {
            const zip = await this.loadZipArchive(archivePath);
            zip.file(innerPath, content);
            const output = await this.generateZip(zip);
            nodefs.writeFileSync(archivePath, output);
        });
    }

    /** Check if a file or directory exists inside an archive. */
    async exists(archivePath: string, innerPath: string): Promise<boolean> {
        return this.enqueue(archivePath, async () => {
            if (!nodefs.existsSync(archivePath)) return false;
            const allEntries = await this.readAllEntries(archivePath);
            return allEntries.some(e =>
                e.path === innerPath
                || e.path === innerPath + "/"
                || e.path.startsWith(innerPath + "/"),
            );
        });
    }

    /** Delete a file from inside a ZIP archive. */
    async deleteFile(archivePath: string, innerPath: string): Promise<void> {
        return this.enqueue(archivePath, async () => {
            const zip = await this.loadZipArchive(archivePath);
            zip.remove(innerPath);
            const output = await this.generateZip(zip);
            nodefs.writeFileSync(archivePath, output);
        });
    }

    /** Rename a file or folder inside a ZIP archive. */
    async renameFile(archivePath: string, oldInnerPath: string, newInnerPath: string): Promise<void> {
        return this.enqueue(archivePath, async () => {
            const zip = await this.loadZipArchive(archivePath);
            const file = zip.file(oldInnerPath);
            if (file) {
                const content = await file.async("nodebuffer");
                zip.file(newInnerPath, content, { date: file.date });
                zip.remove(oldInnerPath);
            } else {
                const oldPrefix = oldInnerPath.endsWith("/") ? oldInnerPath : oldInnerPath + "/";
                const newPrefix = newInnerPath.endsWith("/") ? newInnerPath : newInnerPath + "/";
                const entriesToMove: { path: string; file: any }[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
                zip.forEach((relativePath: string, zipFile: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                    if (relativePath === oldPrefix || relativePath.startsWith(oldPrefix)) {
                        entriesToMove.push({ path: relativePath, file: zipFile });
                    }
                });
                for (const entry of entriesToMove) {
                    const suffix = entry.path.slice(oldPrefix.length);
                    const renamedPath = newPrefix + suffix;
                    if (entry.file.dir) {
                        zip.file(renamedPath, "", { dir: true, date: entry.file.date });
                    } else {
                        const content = await entry.file.async("nodebuffer");
                        zip.file(renamedPath, content, { date: entry.file.date });
                    }
                    zip.remove(entry.path);
                }
            }
            const output = await this.generateZip(zip);
            nodefs.writeFileSync(archivePath, output);
        });
    }

    /** Create an empty directory entry inside a ZIP archive. */
    async mkdir(archivePath: string, innerPath: string): Promise<void> {
        return this.enqueue(archivePath, async () => {
            const zip = await this.loadZipArchive(archivePath);
            const dirPath = innerPath.endsWith("/") ? innerPath : innerPath + "/";
            zip.file(dirPath, "", { dir: true });
            const output = await this.generateZip(zip);
            nodefs.writeFileSync(archivePath, output);
        });
    }

    /** Remove a directory and all its contents from a ZIP archive. */
    async removeDir(archivePath: string, innerPath: string): Promise<void> {
        return this.enqueue(archivePath, async () => {
            const zip = await this.loadZipArchive(archivePath);
            const prefix = innerPath.endsWith("/") ? innerPath : innerPath + "/";
            const toRemove: string[] = [];
            zip.forEach((relativePath: string) => {
                if (relativePath === prefix || relativePath.startsWith(prefix)) {
                    toRemove.push(relativePath);
                }
            });
            if (zip.file(innerPath)) {
                toRemove.push(innerPath);
            }
            for (const p of toRemove) {
                zip.remove(p);
            }
            const output = await this.generateZip(zip);
            nodefs.writeFileSync(archivePath, output);
        });
    }

    /** Get metadata for a file inside an archive. */
    async stat(archivePath: string, innerPath: string): Promise<IFileStat> {
        return this.enqueue(archivePath, async () => {
            if (!nodefs.existsSync(archivePath)) {
                return { size: 0, mtime: 0, exists: false, isDirectory: false };
            }
            const allEntries = await this.readAllEntries(archivePath);

            // Exact match
            const exact = allEntries.find(e => e.path === innerPath);
            if (exact) {
                return {
                    size: exact.size,
                    mtime: exact.mtime,
                    exists: true,
                    isDirectory: exact.isDirectory,
                };
            }

            // Implicit directory (has children under this prefix)
            const dirPrefix = innerPath.endsWith("/") ? innerPath : innerPath + "/";
            const hasChildren = allEntries.some(e => e.path.startsWith(dirPrefix));
            if (hasChildren) {
                return { size: 0, mtime: 0, exists: true, isDirectory: true };
            }

            return { size: 0, mtime: 0, exists: false, isDirectory: false };
        });
    }

    // ── Private ──────────────────────────────────────────────────────────

    /**
     * Sequential promise queue per archive file.
     * Ensures no concurrent operations on the same archive.
     */
    private enqueue<T>(archivePath: string, fn: () => Promise<T>): Promise<T> {
        const prev = this.queues.get(archivePath) ?? Promise.resolve();
        const next = prev.then(fn, fn);
        this.queues.set(archivePath, next);
        next.then(
            () => { if (this.queues.get(archivePath) === next) this.queues.delete(archivePath); },
            () => { if (this.queues.get(archivePath) === next) this.queues.delete(archivePath); },
        );
        return next;
    }
}

export const archiveService = new ArchiveService();

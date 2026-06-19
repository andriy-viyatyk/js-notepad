const path = require("path");
const nodefs = require("fs");

import jschardet from "jschardet";
// eslint-disable-next-line import/no-named-as-default -- iconv-lite is CJS; `* as iconv` breaks decode/encode usage downstream
import iconv from "iconv-lite";
import { api } from "../../ipc/renderer/api";
import type { CommonFolder } from "../../ipc/api-param-types";
import type { IFileSystem, ITextFile, IFileStat, IDirEntry } from "./types/fs";
import { isArchivePath, parseArchivePath, isAsarFile, isAsarPath } from "../core/utils/file-path";
import { archiveService } from "./archive-service";

class FileSystem implements IFileSystem {
    // ── Init state ────────────────────────────────────────────────────

    private _windowIndex: number | null = null;
    private _dataPath: string | null = null;
    private _cachePath: string | null = null;
    private _cacheMiscPath: string | null = null;
    private _initPromise: Promise<void>;

    constructor() {
        this._initPromise = this._init();
    }

    wait = async (): Promise<void> => {
        await this._initPromise;
    };

    private _init = async (): Promise<void> => {
        const userData = await api.getCommonFolder("userData");
        this._windowIndex = await api.getWindowIndex();
        this._dataPath = path.join(userData, "data");
        this._cachePath = path.join(this._dataPath, "cache");
        this._cacheMiscPath = path.join(this._dataPath, "cache-misc");
        console.log("dataPath:", this._dataPath);
    };

    // ── Private sync file I/O (from nodeUtils) ───────────────────────

    private _loadStringFile(filePath: string, encoding?: string): ITextFile {
        const buffer = nodefs.readFileSync(filePath);
        return this._decodeBuffer(buffer, encoding);
    }

    /** Decode a binary buffer into text with encoding detection. */
    _decodeBuffer(buffer: Buffer, encoding?: string): ITextFile {
        // BOM detection — O(1), safe for any file size
        if (
            buffer.length >= 3 &&
            buffer[0] === 0xef &&
            buffer[1] === 0xbb &&
            buffer[2] === 0xbf
        ) {
            return {
                content: buffer.slice(3).toString("utf-8"),
                encoding: "utf-8-bom",
            };
        }

        if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
            return {
                content: iconv.decode(buffer.slice(2), "utf16le"),
                encoding: "utf-16le",
            };
        }

        if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
            return {
                content: iconv.decode(buffer.slice(2), "utf16be"),
                encoding: "utf-16be",
            };
        }

        // For large files (>20MB), skip encoding detection entirely — jschardet,
        // iconv.decode, and replacement-char scanning are too expensive and can
        // cause stack overflows or multi-second hangs. Just use utf-8.
        const LARGE_FILE_THRESHOLD = 20 * 1024 * 1024;
        if (buffer.length > LARGE_FILE_THRESHOLD) {
            return {
                content: buffer.toString("utf-8"),
                encoding: "utf-8",
            };
        }

        if (encoding) {
            try {
                return {
                    content: iconv.decode(buffer, encoding),
                    encoding: encoding,
                };
            } catch (error) {
                console.warn(
                    `Failed to decode with provided encoding ${encoding}:`,
                    error
                );
            }
        }

        const detected = jschardet.detect(buffer);

        if (detected && detected.encoding && detected.confidence > 0.7) {
            try {
                let detectedEncoding = detected.encoding.toLowerCase();

                if (detectedEncoding === "ascii") {
                    // ASCII is a subset of UTF-8
                    detectedEncoding = "utf-8";
                }

                return {
                    content: iconv.decode(buffer, detectedEncoding),
                    encoding: detectedEncoding,
                };
            } catch (error) {
                console.warn(
                    `Failed to decode with ${detected.encoding}:`,
                    error
                );
            }
        }

        try {
            const utf8Text = buffer.toString("utf-8");
            if (!utf8Text.includes("\ufffd")) {
                return {
                    content: utf8Text,
                    encoding: "utf-8",
                };
            }
        } catch (error) {
            // UTF-8 failed
        }

        return {
            content: iconv.decode(buffer, "windows-1251"),
            encoding: "windows-1251",
        };
    }

    private _saveStringFile(
        filePath: string,
        content: string,
        encoding?: string
    ): void {
        const buffer = this._encodeString(content, encoding);
        nodefs.writeFileSync(filePath, buffer);
    }

    /** Encode a string into a binary buffer with the specified encoding (including BOM). */
    _encodeString(content: string, encoding?: string): Buffer {
        const enc = encoding?.toLowerCase() || "utf-8";

        if (enc === "utf-8" || enc === "utf8") {
            return Buffer.from(content, "utf-8");
        } else if (enc === "utf-8-bom" || enc === "utf8bom") {
            const bom = Buffer.from([0xef, 0xbb, 0xbf]);
            const textBuffer = Buffer.from(content, "utf-8");
            return Buffer.concat([bom, textBuffer]);
        } else if (enc === "utf-16le" || enc === "utf16le") {
            const bom = Buffer.from([0xff, 0xfe]);
            const textBuffer = iconv.encode(content, "utf16le");
            return Buffer.concat([bom, textBuffer]);
        } else if (enc === "utf-16be" || enc === "utf16be") {
            const bom = Buffer.from([0xfe, 0xff]);
            const textBuffer = iconv.encode(content, "utf16be");
            return Buffer.concat([bom, textBuffer]);
        } else {
            try {
                return iconv.encode(content, enc);
            } catch (error) {
                console.error(
                    `Failed to encode with ${enc}, falling back to UTF-8:`,
                    error
                );
                return Buffer.from(content, "utf-8");
            }
        }
    }

    fileExistsSync(filePath: string): boolean {
        try {
            nodefs.accessSync(filePath, nodefs.constants.F_OK);
            return true;
        } catch (err) {
            return false;
        }
    }

    private _unlinkFile(filePath: string): boolean {
        if (!this.fileExistsSync(filePath)) {
            return true;
        }
        try {
            nodefs.unlinkSync(filePath);
            return true;
        } catch (err) {
            return false;
        }
    }

    private _ensureDir(dirPath: string): boolean {
        if (!this.fileExistsSync(dirPath)) {
            try {
                nodefs.mkdirSync(dirPath, { recursive: true });
            } catch (err) {
                return false;
            }
        }
        return true;
    }

    private _listDirFiles(dirPath: string, pattern?: string | RegExp): string[] {
        if (!this.fileExistsSync(dirPath)) {
            return [];
        }

        const files: string[] = nodefs.readdirSync(dirPath);

        if (!pattern) {
            return files;
        }

        if (typeof pattern === "string") {
            return files.filter(
                (file: string) =>
                    path.extname(file).toLowerCase() === pattern.toLowerCase()
            );
        }

        return files.filter((file: string) => pattern.test(file));
    }

    // ── Internal async helpers (from filesModel) ─────────────────────

    private async _getFile(filePath: string, encoding?: string): Promise<ITextFile | undefined> {
        if (this.fileExistsSync(filePath)) {
            return this._loadStringFile(filePath, encoding);
        }
        return undefined;
    }

    private async _writeFile(filePath: string, content: string, encoding?: string): Promise<void> {
        await this.wait();
        this._ensureDir(path.dirname(filePath));
        this._saveStringFile(filePath, content, encoding);
    }

    private async _prepareFile(filePath: string, defaultContent: string): Promise<void> {
        await this.wait();
        if (!this.fileExistsSync(filePath)) {
            await this._writeFile(filePath, defaultContent);
        }
    }

    private async _removeFile(filePath: string): Promise<void> {
        await this.wait();
        this._unlinkFile(filePath);
    }

    // ── IFileSystem — File I/O ────────────────────────────────────────

    async read(filePath: string, encoding?: string): Promise<string> {
        if (isArchivePath(filePath)) {
            const { archivePath, innerPath } = parseArchivePath(filePath);
            const buffer = await archiveService.readFile(archivePath, innerPath);
            return this._decodeBuffer(buffer, encoding).content;
        }
        return this._loadStringFile(filePath, encoding).content;
    }

    async readFile(filePath: string, encoding?: string): Promise<ITextFile> {
        if (isArchivePath(filePath)) {
            const { archivePath, innerPath } = parseArchivePath(filePath);
            const buffer = await archiveService.readFile(archivePath, innerPath);
            return this._decodeBuffer(buffer, encoding);
        }
        return this._loadStringFile(filePath, encoding);
    }

    async readBinary(filePath: string): Promise<Buffer> {
        if (isArchivePath(filePath)) {
            const { archivePath, innerPath } = parseArchivePath(filePath);
            return archiveService.readFile(archivePath, innerPath);
        }
        return nodefs.readFileSync(filePath);
    }

    async write(filePath: string, content: string, encoding?: string): Promise<void> {
        if (isArchivePath(filePath)) {
            const { archivePath, innerPath } = parseArchivePath(filePath);
            const buffer = this._encodeString(content, encoding);
            await archiveService.writeFile(archivePath, innerPath, buffer);
            return;
        }
        this._ensureDir(path.dirname(filePath));
        this._saveStringFile(filePath, content, encoding);
    }

    async append(filePath: string, text: string): Promise<void> {
        this._ensureDir(path.dirname(filePath));
        nodefs.appendFileSync(filePath, text, "utf-8");
    }

    async writeBinary(filePath: string, data: Buffer): Promise<void> {
        if (isArchivePath(filePath)) {
            const { archivePath, innerPath } = parseArchivePath(filePath);
            await archiveService.writeFile(archivePath, innerPath, data);
            return;
        }
        this._ensureDir(path.dirname(filePath));
        nodefs.writeFileSync(filePath, data);
    }

    async exists(filePath: string): Promise<boolean> {
        if (isArchivePath(filePath)) {
            const { archivePath, innerPath } = parseArchivePath(filePath);
            return archiveService.exists(archivePath, innerPath);
        }
        // For .asar paths, use statSync which Electron patches reliably
        if (isAsarFile(filePath) || isAsarPath(filePath)) {
            try {
                nodefs.statSync(filePath);
                return true;
            } catch {
                return false;
            }
        }
        return this.fileExistsSync(filePath);
    }

    async delete(filePath: string): Promise<void> {
        if (isArchivePath(filePath)) {
            const { archivePath, innerPath } = parseArchivePath(filePath);
            await archiveService.deleteFile(archivePath, innerPath);
            return;
        }
        this._unlinkFile(filePath);
    }

    // ── IFileSystem — File management ───────────────────────────────────

    async rename(oldPath: string, newPath: string): Promise<void> {
        if (isArchivePath(oldPath)) {
            const oldParsed = parseArchivePath(oldPath);
            const newParsed = parseArchivePath(newPath);
            await archiveService.renameFile(oldParsed.archivePath, oldParsed.innerPath, newParsed.innerPath);
            return;
        }
        nodefs.renameSync(oldPath, newPath);
    }

    async stat(filePath: string): Promise<IFileStat> {
        if (isArchivePath(filePath)) {
            const { archivePath, innerPath } = parseArchivePath(filePath);
            return archiveService.stat(archivePath, innerPath);
        }
        try {
            const stats = nodefs.statSync(filePath);
            return {
                size: stats.size,
                mtime: stats.mtime.getTime(),
                exists: true,
                // Electron patches fs to treat .asar files as directories — override back to file
                isDirectory: stats.isDirectory() && !filePath.endsWith(".asar"),
            };
        } catch {
            return { size: 0, mtime: 0, exists: false, isDirectory: false };
        }
    }

    async copyFile(srcPath: string, destPath: string): Promise<void> {
        this._ensureDir(path.dirname(destPath));
        nodefs.copyFileSync(srcPath, destPath);
    }

    // ── IFileSystem — Directory operations ──────────────────────────────

    async listDir(dirPath: string, pattern?: string | RegExp): Promise<string[]> {
        if (isArchivePath(dirPath)) {
            const { archivePath, innerPath } = parseArchivePath(dirPath);
            const entries = await archiveService.listDir(archivePath, innerPath);
            const names = entries.map((e) => e.name);
            if (!pattern) return names;
            if (typeof pattern === "string") {
                return names.filter((name) =>
                    path.extname(name).toLowerCase() === pattern.toLowerCase()
                );
            }
            return names.filter((name) => pattern.test(name));
        }
        return this._listDirFiles(dirPath, pattern);
    }

    async mkdir(dirPath: string): Promise<void> {
        if (isArchivePath(dirPath)) {
            const { archivePath, innerPath } = parseArchivePath(dirPath);
            await archiveService.mkdir(archivePath, innerPath);
            return;
        }
        this._ensureDir(dirPath);
    }

    async listDirWithTypes(dirPath: string): Promise<IDirEntry[]> {
        if (isArchivePath(dirPath)) {
            const { archivePath, innerPath } = parseArchivePath(dirPath);
            return archiveService.listDir(archivePath, innerPath);
        }
        // Skip fileExistsSync for .asar paths — Electron's fs patching handles
        // .asar transparently, but accessSync may not work correctly on virtual dirs
        if (!isAsarFile(dirPath) && !isAsarPath(dirPath) && !this.fileExistsSync(dirPath)) {
            return [];
        }
        // `nodefs` is untyped (loaded via require to bypass Electron's fs-asar patch);
        // annotate the result so dirent has a real type.
        type Dirent = import("fs").Dirent;
        const entries = nodefs.readdirSync(dirPath, { withFileTypes: true }) as Dirent[];
        return entries.map((dirent) => ({
            name: dirent.name,
            // Electron patches fs to treat .asar files as directories — override back to file
            isDirectory: dirent.isDirectory() && !dirent.name.endsWith(".asar"),
        }));
    }

    async removeDir(dirPath: string, recursive?: boolean): Promise<void> {
        if (isArchivePath(dirPath)) {
            const { archivePath, innerPath } = parseArchivePath(dirPath);
            await archiveService.removeDir(archivePath, innerPath);
            return;
        }
        nodefs.rmSync(dirPath, { recursive: !!recursive, force: true });
    }

    // ── IFileSystem — Path resolution ─────────────────────────────────

    resolveDataPath(relativePath: string): string {
        const resolved = relativePath.replace(
            "{windowIndex}",
            String(this._windowIndex)
        );
        return path.join(this._dataPath, resolved);
    }

    resolveCachePath(relativePath: string): string {
        return path.join(this._cachePath, relativePath);
    }

    async commonFolder(name: string): Promise<string> {
        return api.getCommonFolder(name as CommonFolder);
    }

    // ── IFileSystem — Dialogs ─────────────────────────────────────────

    async showOpenDialog(options?: {
        title?: string;
        defaultPath?: string;
        filters?: { name: string; extensions: string[] }[];
        multiSelect?: boolean;
    }): Promise<string[] | null> {
        const result = await api.showOpenFileDialog({
            title: options?.title,
            defaultPath: options?.defaultPath,
            filters: options?.filters,
            multiSelections: options?.multiSelect,
        });
        return result ?? null;
    }

    async showSaveDialog(options?: {
        title?: string;
        defaultPath?: string;
        filters?: { name: string; extensions: string[] }[];
    }): Promise<string | null> {
        const result = await api.showSaveFileDialog({
            title: options?.title,
            defaultPath: options?.defaultPath,
            filters: options?.filters,
        });
        return result ?? null;
    }

    async showFolderDialog(options?: {
        title?: string;
        defaultPath?: string;
    }): Promise<string[] | null> {
        const result = await api.showOpenFolderDialog({
            title: options?.title,
            defaultPath: options?.defaultPath,
        });
        return result ?? null;
    }

    // ── IFileSystem — OS integration ──────────────────────────────────

    showInExplorer(filePath: string): void {
        api.showItemInFolder(filePath);
    }

    showFolder(folderPath: string): void {
        api.showFolder(folderPath);
    }

    // ── Data file operations ──────────────────────────────────────────

    dataFileName = async (fileName: string): Promise<string> => {
        await this.wait();
        return path.join(
            this._dataPath,
            fileName.replace("{windowIndex}", String(this._windowIndex))
        );
    };

    getDataFile = async (fileName: string): Promise<string | undefined> =>
        (await this._getFile(await this.dataFileName(fileName)))?.content;

    saveDataFile = async (fileName: string, content: string): Promise<void> =>
        await this._writeFile(await this.dataFileName(fileName), content);

    deleteDataFile = async (fileName: string): Promise<void> =>
        await this._removeFile(await this.dataFileName(fileName));

    prepareDataFile = async (fileName: string, defaultContent: string): Promise<void> =>
        await this._prepareFile(
            await this.dataFileName(fileName),
            defaultContent
        );

    // ── Cache operations ──────────────────────────────────────────────

    private async _cacheFileName(id: string, name?: string): Promise<string> {
        await this.wait();
        return path.join(
            this._cachePath,
            id + (name ? "_" + name : "") + ".txt"
        );
    }

    getCacheFile = async (id: string, name?: string): Promise<string | undefined> =>
        (await this._getFile(await this._cacheFileName(id, name)))?.content;

    saveCacheFile = async (id: string, content: string, name?: string): Promise<void> =>
        await this._writeFile(await this._cacheFileName(id, name), content);

    deleteCacheFile = async (id: string, name?: string): Promise<void> =>
        await this._removeFile(await this._cacheFileName(id, name));

    deleteCacheFiles = async (id: string): Promise<void> => {
        await this.wait();
        const files = this._listDirFiles(
            this._cachePath,
            new RegExp(`^${id}`, "i")
        );
        for (const file of files) {
            await this._removeFile(path.join(this._cachePath, file));
        }
    };

    // ── Cache-misc operations ─────────────────────────────────────────

    private async _cacheMiscFileName(subPath: string): Promise<string> {
        await this.wait();
        return path.join(this._cacheMiscPath, subPath);
    }

    getCacheMiscFile = async (subPath: string): Promise<string | undefined> =>
        (await this._getFile(await this._cacheMiscFileName(subPath)))?.content;

    saveCacheMiscFile = async (subPath: string, content: string): Promise<void> =>
        await this._writeFile(await this._cacheMiscFileName(subPath), content);

    deleteCacheMiscFile = async (subPath: string): Promise<void> =>
        await this._removeFile(await this._cacheMiscFileName(subPath));

    cacheMiscFilePath = async (subPath: string): Promise<string> =>
        await this._cacheMiscFileName(subPath);

    // ── Binary file operations ────────────────────────────────────────

    saveBinaryFile = async (filePath: string, buffer: Buffer): Promise<void> => {
        await this.wait();
        this._ensureDir(path.dirname(filePath));
        nodefs.writeFileSync(filePath, buffer);
    };

    getBinaryFile = async (filePath: string): Promise<Buffer | undefined> => {
        if (this.fileExistsSync(filePath)) {
            return nodefs.readFileSync(filePath);
        }
        return undefined;
    };
}

export const fs = new FileSystem();

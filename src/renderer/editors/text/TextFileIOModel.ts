import { fpBasename, fpDirname, fpExtname, fpJoin } from "../../core/utils/file-path";

import { api } from "../../../ipc/renderer/api";
import { fs as appFs } from "../../api/fs";
import { recent } from "../../api/recent";
import { getLanguageByExtension } from "../../core/utils";
import { shell } from "../../api/shell";
import { debounce, errMessage } from "../../../shared/utils";
import type { TextFileModel } from "./TextEditorModel";
import type { ISubscriptionObject } from "../../api/types/events";
import type { IContentPipe } from "../../api/types/io.pipe";
import { ContentPipe } from "../../content/ContentPipe";
import { FileProvider } from "../../content/providers/FileProvider";
import { ArchiveTransformer } from "../../content/transformers/ArchiveTransformer";
import { PipePair } from "../../content/PipePair";

export class TextFileIOModel {
    /** Cache pipe — same transformers as primary pipe, CacheFileProvider as source. */
    private readonly pipes: PipePair;
    private watchSubscription: ISubscriptionObject | null = null;
    private modificationSaved = true;
    private isSavingModifications = false;

    constructor(private model: TextFileModel) {
        this.pipes = new PipePair(() => this.model.state.get().id);
    }

    get cachePipe(): IContentPipe | null {
        return this.pipes.cache;
    }

    // ── Pipe helpers ─────────────────────────────────────────────────

    /** Get primary pipe from page model, auto-creating from filePath if needed (legacy compat). */
    private ensurePipe(): IContentPipe | null {
        if (this.model.pipe) return this.model.pipe;

        const filePath = this.model.state.get().filePath;
        if (!filePath) return null;

        // Legacy compatibility: create pipe from filePath
        const bangIndex = filePath.indexOf("!");
        if (bangIndex >= 0) {
            const archivePath = filePath.slice(0, bangIndex);
            const entryPath = filePath.slice(bangIndex + 1);
            this.setPrimary(new ContentPipe(
                new FileProvider(archivePath),
                [new ArchiveTransformer(archivePath, entryPath)],
            ));
        } else {
            this.setPrimary(new ContentPipe(new FileProvider(filePath)));
        }
        return this.model.pipe;
    }

    /** Replace source and cache pipes together, then watch the new source. */
    setPrimary(pipe: IContentPipe | null): void {
        this.watchSubscription?.unsubscribe();
        this.watchSubscription = null;
        this.pipes.setPrimary(pipe);
        // Assigning `pipe` publishes on `pipeState` — it is an accessor over that channel.
        this.model.pipe = this.pipes.primary;
        this.setupWatch();
    }

    /** Set up file watch via pipe.watch(). */
    setupWatch(): void {
        this.watchSubscription?.unsubscribe();
        this.watchSubscription = null;
        const pipe = this.model.pipe;
        if (pipe?.watch) {
            this.watchSubscription = pipe.watch(this.onFileChanged);
        }
    }

    // ── Public API ───────────────────────────────────────────────────

    /** Called by encryption submodel when content changes need cache save. */
    markModificationUnsaved = () => {
        this.modificationSaved = false;
        this.saveModifications();
    };

    saveFile = async (saveAs?: boolean): Promise<boolean> => {
        const { filePath, title, id, deleted } = this.model.state.get();
        const pipeWritable = this.model.pipe?.writable ?? false;
        // Force "Save As" dialog if pipe is read-only, no file path, or file was deleted
        const forceSaveAs = saveAs || !pipeWritable || deleted;
        let savePath: string | undefined = forceSaveAs ? undefined : filePath;
        if (!savePath) {
            savePath = await api.showSaveFileDialog({
                title: forceSaveAs ? "Save File As" : "Save File",
                defaultPath: filePath || title,
            });
        }

        if (!savePath) return false;

        // Content from state — pipe.writeText handles encryption via DecryptTransformer if present
        const text = this.model.state.get().content;

        if (savePath === filePath && this.model.pipe?.writable) {
            // Save to same file — write through existing pipe (preserves transformers)
            try {
                await this.model.pipe.writeText(text);
            } catch (err) {
                const { ui } = await import("../../api/ui");
                ui.notify(errMessage(err, "Failed to save file."), "warning");
                return false;
            }
        } else {
            // Save As — create fresh pipe (no transformers, just the file + encoding)
            const newPipe = new ContentPipe(
                new FileProvider(savePath),
                [],
                this.model.pipe?.encoding,
            );
            try {
                await newPipe.writeText(text);
            } catch (err) {
                newPipe.dispose();
                const { ui } = await import("../../api/ui");
                ui.notify(errMessage(err, "Failed to save file."), "warning");
                return false;
            }

            this.setPrimary(newPipe);

            if (savePath !== filePath) {
                recent.add(savePath);
            }
        }

        await appFs.deleteCacheFile(id);
        this.model.state.update((s) => {
            s.modified = false;
            s.temp = false;
            s.filePath = savePath;
            s.title = fpBasename(savePath);
            s.deleted = false;
            s.encoding = this.model.pipe?.encoding;
            // Save As to a new path creates a fresh pipe without DecryptTransformer
            if (savePath !== filePath) {
                s.password = undefined;
                s.encrypted = false;
            }
        });

        // filePath may have changed (untitled→saved, or Save As across repos) —
        // re-run git detection (EPIC-030).
        void this.model.detectGitRepo();

        return true;
    };

    renameFile = async (newName: string): Promise<boolean> => {
        const { filePath } = this.model.state.get();
        if (!filePath) {
            this.model.state.update((s) => {
                s.title = newName;
                s.temp = false;
            });
            return true;
        }

        const newPath = fpJoin(fpDirname(filePath), newName);
        if (await appFs.exists(newPath)) {
            const { ui } = await import("../../api/ui");
            ui.notify("A file or folder with that name already exists.", "warning");
            return false;
        }
        try {
            await appFs.rename(filePath, newPath);
        } catch (err) {
            const { ui } = await import("../../api/ui");
            ui.notify(err.message || "Failed to rename file.", "warning");
            return false;
        }
        await this.applyRenamedPath(newPath);
        return true;
    };

    /** Update filePath, title, pipe and recent-files after a rename on disk. */
    applyRenamedPath = async (newPath: string) => {
        const oldPath = this.model.state.get().filePath;

        // Preserve transformers from existing pipe (e.g., ArchiveTransformer, DecryptTransformer)
        const newProvider = new FileProvider(newPath);
        const newPipe = this.model.pipe
            ? this.model.pipe.cloneWithProvider(newProvider)
            : new ContentPipe(newProvider);
        this.setPrimary(newPipe);

        this.model.state.update((s) => {
            s.filePath = newPath;
            s.title = fpBasename(newPath);
        });
        if (oldPath && newPath !== oldPath) {
            await recent.remove(oldPath);
            recent.add(newPath);
        }

        // Rename can move a file across repo boundaries — re-detect (EPIC-030).
        void this.model.detectGitRepo();
    };

    async restore() {
        const { modified, filePath } = this.model.state.get();
        const pipe = this.ensurePipe();

        if (pipe) {
            this.setupWatch();
        } else if (modified) {
            // Untitled modified page — no primary pipe, but cache file may exist
            this.pipes.ensureCache();
        }

        if (modified && this.cachePipe) {
            // Restore unsaved work from cache
            try {
                const stat = await this.cachePipe.provider.stat?.();
                if (stat?.exists) {
                    const cachedContent = await this.cachePipe.readText();
                    if (cachedContent !== undefined) {
                        this.model.state.update((s) => {
                            s.content = cachedContent;
                            s.encrypted = shell.encryption.isEncrypted(cachedContent);
                            s.encoding = this.cachePipe?.encoding;
                        });
                    }
                }
            } catch {
                // Cache read failed — fall through to normal restore
            }

            // Check if source file was deleted while we had unsaved changes
            if (pipe) {
                try {
                    const stat = await pipe.provider.stat?.();
                    if (stat && !stat.exists) {
                        this.model.state.update((s) => { s.deleted = true; });
                    }
                } catch {
                    // stat failed — assume file exists
                }
            }
        } else if (pipe) {
            // Normal restore — read from source through pipe
            const ext = fpExtname(filePath || "").toLowerCase();
            try {
                const fileContent = await pipe.readText();
                this.model.state.update((s) => {
                    s.content = fileContent || "";
                    s.encrypted = shell.encryption.isEncrypted(s.content);
                    s.encoding = pipe.encoding;
                    // Set title from file path if still default "untitled".
                    // Preserve titles set explicitly by the content pipeline (e.g. cURL links).
                    const basename = fpBasename(filePath || "");
                    if (basename && (!s.title || s.title === "untitled")) {
                        s.title = basename;
                    }
                    const titleExt = fpExtname(s.title || "").toLowerCase();
                    s.language =
                        s.language ||
                        getLanguageByExtension(ext)?.id ||
                        getLanguageByExtension(titleExt)?.id ||
                        "plaintext";
                    s.deleted = false;
                    s.temp = false;
                });
            } catch {
                // File read failed — check if deleted
                try {
                    const stat = await pipe.provider.stat?.();
                    if (stat && !stat.exists) {
                        this.model.state.update((s) => { s.deleted = true; });
                    }
                } catch {
                    // ignore
                }
            }
        }
    }

    async saveState(): Promise<void> {
        if (!this.modificationSaved) {
            await this.doSaveModifications();
        }
    }

    private onFileChanged = async () => {
        const pipe = this.model.pipe;
        if (!pipe) return;

        const modified = this.model.state.get().modified;

        // Check if file was deleted
        let deleted = false;
        try {
            const stat = await pipe.provider.stat?.();
            deleted = stat ? !stat.exists : false;
        } catch {
            // stat failed — assume not deleted
        }

        if (deleted !== this.model.state.get().deleted) {
            this.model.state.update((s) => {
                s.deleted = deleted;
                s.modified = deleted || s.modified;
            });
        }

        if (!modified && !deleted) {
            // Re-read content from source — pipe.readText() decrypts if DecryptTransformer present
            try {
                const content = await pipe.readText();
                this.model.state.update((s) => {
                    s.content = content;
                    s.encrypted = shell.encryption.isEncrypted(s.content);
                    s.encoding = pipe.encoding;
                });
            } catch {
                // read failed — ignore
            }
        }

        if (!modified && this.model.state.get().modified) {
            this.modificationSaved = false;
            this.saveModifications();
        }
    };

    private doSaveModifications = async () => {
        if (this.modificationSaved) return;
        this.modificationSaved = true;
        this.isSavingModifications = true;

        // Content from state — cachePipe.writeText handles encryption via DecryptTransformer if present
        const text = this.model.state.get().content;

        if (this.cachePipe) {
            try {
                await this.cachePipe.writeText(text);
            } catch {
                // Cache write failed — fall back to direct cache save ONLY if not encrypted.
                // If encrypted, the cachePipe has a DecryptTransformer that handles encryption.
                // Falling back to appFs.saveCacheFile would write plaintext, leaking the content.
                const isEncrypted = this.cachePipe.transformers.some(t => t.type === "decrypt");
                if (!isEncrypted) {
                    const { id } = this.model.state.get();
                    await appFs.saveCacheFile(id, text);
                }
            }
        } else {
            console.log("[doSaveModifications] no cachePipe — using appFs.saveCacheFile fallback");
            const { id } = this.model.state.get();
            await appFs.saveCacheFile(id, text);
        }

        this.isSavingModifications = false;
    };

    private saveModifications = debounce(
        this.doSaveModifications,
        1000,
        () => !this.isSavingModifications,
    );

    dispose() {
        this.watchSubscription?.unsubscribe();
        this.watchSubscription = null;
        this.pipes.dispose();
        this.model.pipe = null;
    }
}

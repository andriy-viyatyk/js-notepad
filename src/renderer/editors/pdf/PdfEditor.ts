import { createElement, ReactNode } from "react";
import { TComponentState } from "../../core/state/state";
import {
    EditorModel,
    type EditorStateBase,
    type RestoreData,
} from "../base/EditorModel";
import type { EditorDescriptor } from "../../../shared/persistence";
import { FileIcon } from "../../components/icons/FileIcon";
import { fpBasename } from "../../core/utils/file-path";
import { fs as appFs } from "../../api/fs";
import { ContentPipe } from "../../content/ContentPipe";
import { FileProvider } from "../../content/providers/FileProvider";
import { ArchiveTransformer } from "../../content/transformers/ArchiveTransformer";
import type { MenuItem } from "../../uikit";
import { filePathMenuItems } from "../shared/editor-menu-items";

export interface PdfEditorState extends EditorStateBase {
    /** Discriminator — preserved for legacy `newEditorModelFromState`
     *  routing and `EditorDescriptor.state.type` consumers. */
    type: "pdfFile";
    /** Source path / URL / archive-with-bang notation
     *  (`archive.zip!path/to.pdf`). */
    filePath?: string;
    /** Local file path to serve via `safe-file://`. Either the source
     *  path (plain FileProvider) or a temp cache file (non-local
     *  sources). Recomputed on every `restore()` — stripped from
     *  descriptors. */
    localPdfPath?: string;
}

export const defaultPdfEditorState: PdfEditorState = {
    id: "",
    title: "",
    modified: false,
    type: "pdfFile",
};

export function getDefaultPdfEditorState(): PdfEditorState {
    return {
        ...defaultPdfEditorState,
        id: crypto.randomUUID(),
    };
}

export class PdfEditor extends EditorModel<PdfEditorState> {
    /** Editor identity. Matches `EditorDescriptor.editorId`. */
    readonly editorId = "pdf-view";

    noLanguage = true;

    /** Tracks whether `restore()` created a temp cache file for the PDF
     *  (true only for non-local sources). Gates the `dispose()`
     *  cleanup. */
    private cacheFileCreated = false;

    constructor(state: TComponentState<PdfEditorState>) {
        super(state);
    }

    /** Reconstruct pipe from `filePath` if not already present. Legacy
     *  compat for restore paths that don't carry a live pipe. */
    private ensurePipe(): void {
        if (this.pipe) return;
        const filePath = this.state.get().filePath;
        if (!filePath) return;

        const bangIndex = filePath.indexOf("!");
        if (bangIndex >= 0) {
            const archivePath = filePath.slice(0, bangIndex);
            const entryPath = filePath.slice(bangIndex + 1);
            this.pipe = new ContentPipe(
                new FileProvider(archivePath),
                [new ArchiveTransformer(archivePath, entryPath)],
            );
        } else {
            this.pipe = new ContentPipe(new FileProvider(filePath));
        }
    }

    async restore(): Promise<void> {
        await super.restore();

        const filePath = this.state.get().filePath;
        if (filePath) {
            this.state.update((s) => {
                s.title = fpBasename(filePath);
            });
        }

        this.ensurePipe();
        if (this.pipe) {
            if (
                this.pipe.provider.type === "file"
                && this.pipe.transformers.length === 0
            ) {
                this.state.update((s) => {
                    s.localPdfPath = this.pipe.provider.sourceUrl;
                });
            } else {
                try {
                    const buffer = await this.pipe.readBinary();
                    const cachePath = appFs.resolveCachePath(this.id + ".pdf");
                    await appFs.writeBinary(cachePath, buffer);
                    this.cacheFileCreated = true;
                    this.state.update((s) => {
                        s.localPdfPath = cachePath;
                    });
                } catch {
                    // Pipe read failed — localPdfPath stays undefined; the
                    // view renders a blank panel rather than crashing.
                }
            }
        }
    }

    applyRestoreData(data: RestoreData<PdfEditorState>): void {
        super.applyRestoreData(data);
        // Apply filePath from descriptor; localPdfPath gets recomputed
        // inside restore() (either as the plain source path or via the
        // cache-file read path), so we don't carry it across saves
        //.
        if (data.filePath) {
            this.state.update((s) => { s.filePath = data.filePath; });
        }
    }

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        return {
            editorId: this.editorId,
            id: s.id,
            state: {
                ...s,
                // localPdfPath stripped from descriptor — recomputed on
                // restore. Persisting a temp cache-file path
                // would be wrong because the cache may have been GC'd.
                localPdfPath: undefined,
            } as unknown as Record<string, unknown>,
        };
    }

    async dispose(): Promise<void> {
        if (this.cacheFileCreated) {
            const cachePath = this.state.get().localPdfPath;
            if (cachePath) {
                try { await appFs.delete(cachePath); } catch { /* ignore */ }
            }
        }
        await super.dispose();
    }

    getIcon = (): ReactNode => {
        return createElement(FileIcon, {
            path: this.state.get().filePath,
            width: 12,
            height: 12,
        });
    };

    /** Show in File Explorer / Copy File Path for the PDF's source path. */
    onGetMenuItems(): MenuItem[] {
        return filePathMenuItems(this.state.get().filePath);
    }
}

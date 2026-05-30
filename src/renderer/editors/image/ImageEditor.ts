import { createElement, ReactNode } from "react";
import { TComponentState } from "../../core/state/state";
import {
    EditorModel,
    type EditorStateBase,
    type RestoreData,
} from "../base/EditorModel";
import type { EditorDescriptor } from "../../../shared/persistence";
import { FileIcon } from "../../components/icons/FileIcon";
import { fpBasename, fpExtname } from "../../core/utils/file-path";
import { fs as appFs } from "../../api/fs";
import { ui } from "../../api/ui";
import { pagesModel } from "../../api/pages";
import { ContentPipe } from "../../content/ContentPipe";
import { FileProvider } from "../../content/providers/FileProvider";
import { ArchiveTransformer } from "../../content/transformers/ArchiveTransformer";
import type { BaseImageViewRef } from "../shared/BaseImageView";
import {
    buildExcalidrawJsonWithImage,
    getImageDimensions,
    extToMime,
} from "../draw/drawExport";

export interface ImageEditorState extends EditorStateBase {
    /** Discriminator — preserved for legacy `newEditorModelFromState`
     *  routing and `EditorDescriptor.state.type` consumers. */
    type: "imageFile";
    /** Source path / URL / archive-with-bang notation
     *  (`archive.zip!path/to.png`). */
    filePath?: string;
    /** Runtime image URL — blob URL (created from pipe bytes or via
     *  `cacheBlobUrl`), HTTP(S) URL (external browser-webview source),
     *  or undefined. Blob URLs are stripped from descriptors;
     *  HTTP URLs are kept (pipe re-fetches on restore). */
    url?: string;
}

export const defaultImageEditorState: ImageEditorState = {
    id: "",
    title: "",
    modified: false,
    type: "imageFile",
};

export function getDefaultImageEditorState(): ImageEditorState {
    return {
        ...defaultImageEditorState,
        id: crypto.randomUUID(),
    };
}

export class ImageEditor extends EditorModel<ImageEditorState> {
    /** Editor identity. Matches `EditorDescriptor.editorId`. */
    readonly editorId = "image-view";

    noLanguage = true;

    /** Tracks whether `restore()` or `cacheBlobUrl()` wrote a temp cache
     *  file for the image (true for non-local sources AND blob-URL
     *  imports). Gates the dispose() cleanup. */
    private cacheFileCreated = false;

    /** View's imperative handle (set by ImageView via setImageRef). Used
     *  by copyImageToClipboard to delegate to the shared BaseImageView's
     *  clipboard API. Mirrors GR3 (Graph) / DR3 (Draw). */
    imageRef: BaseImageViewRef | null = null;

    setImageRef = (ref: BaseImageViewRef | null) => {
        this.imageRef = ref;
    };

    constructor(state: TComponentState<ImageEditorState>) {
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

    private async cacheImageBuffer(buffer: Buffer): Promise<void> {
        try {
            const cachePath = appFs.resolveCachePath(this.id + ".img");
            await appFs.writeBinary(cachePath, buffer);
            this.cacheFileCreated = true;
        } catch { /* ignore cache write failure */ }
    }

    private async tryRestoreFromCache(): Promise<void> {
        const cachePath = appFs.resolveCachePath(this.id + ".img");
        if (await appFs.exists(cachePath)) {
            try {
                const buffer = await appFs.readBinary(cachePath);
                const blob = new Blob([new Uint8Array(buffer)], {
                    type: "image/png",
                });
                const blobUrl = URL.createObjectURL(blob);
                this.state.update((s) => { s.url = blobUrl; });
            } catch { /* cache read failed */ }
        }
    }

    async restore(): Promise<void> {
        await super.restore();
        const { filePath, url } = this.state.get();
        if (filePath) {
            this.state.update((s) => {
                s.title = fpBasename(filePath);
            });
        }

        this.ensurePipe();
        if (this.pipe) {
            if (!url) {
                // No URL yet — read from pipe and create blob URL
                try {
                    const buffer = await this.pipe.readBinary();
                    const ext = fpExtname(
                        filePath || this.pipe.provider.sourceUrl || ".png",
                    ).toLowerCase();
                    const mimeType = extToMime(ext);
                    const blob = new Blob([new Uint8Array(buffer)], {
                        type: mimeType,
                    });
                    const blobUrl = URL.createObjectURL(blob);
                    this.state.update((s) => { s.url = blobUrl; });

                    // Cache to disk for restart recovery (non-local sources only)
                    if (
                        this.pipe.provider.type !== "file"
                        || this.pipe.transformers.length > 0
                    ) {
                        await this.cacheImageBuffer(buffer);
                    }
                } catch {
                    // Pipe read failed — try cache file fallback
                    await this.tryRestoreFromCache();
                }
            } else if (this.pipe.provider.type !== "file") {
                // URL already set (HTTP image) — cache in background for
                // offline restart
                this.pipe.readBinary()
                    .then((buffer) => this.cacheImageBuffer(buffer))
                    .catch(() => { /* ignore */ });
            }
        } else if (!url) {
            // No pipe, no url — try cache file fallback (restart after blob
            // URL scenario)
            await this.tryRestoreFromCache();
        }
    }

    applyRestoreData(data: RestoreData<ImageEditorState>): void {
        super.applyRestoreData(data);
        if (data.filePath) {
            this.state.update((s) => { s.filePath = data.filePath; });
        }
        if (data.url) {
            this.state.update((s) => { s.url = data.url; });
        }
    }

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        // Blob URLs don't survive across sessions — strip them.
        // HTTP(S) URLs are kept as display metadata (the pipe handles
        // re-fetch on restore). filePath is preserved verbatim.
        const url = s.url && s.url.startsWith("blob:") ? undefined : s.url;
        return {
            editorId: this.editorId,
            id: s.id,
            state: {
                ...s,
                url,
            } as unknown as Record<string, unknown>,
        };
    }

    async dispose(): Promise<void> {
        // Revoke active blob URL (in-memory resource).
        const url = this.state.get().url;
        if (url && url.startsWith("blob:")) {
            URL.revokeObjectURL(url);
        }
        // Delete cache file (on-disk resource) if we created one.
        if (this.cacheFileCreated) {
            const cachePath = appFs.resolveCachePath(this.id + ".img");
            try { await appFs.delete(cachePath); } catch { /* ignore */ }
        }
        await super.dispose();
    }

    /** Cache blob URL content to disk (called by openImageInNewTab for
     *  blob URLs — after addPage). Lets a freshly-imported blob image
     *  survive an app restart via tryRestoreFromCache(). */
    async cacheBlobUrl(blobUrl: string): Promise<void> {
        try {
            const response = await fetch(blobUrl);
            const buffer = Buffer.from(await response.arrayBuffer());
            await this.cacheImageBuffer(buffer);
        } catch { /* ignore cache failure */ }
    }

    saveImage = async (): Promise<void> => {
        const url = this.state.get().url;
        if (!url) return;

        // Guess a default filename from the URL
        let defaultName = "image.png";
        try {
            const urlPath = new URL(url).pathname;
            const basename = urlPath.split("/").pop();
            if (basename && /\.\w+$/.test(basename)) {
                defaultName = decodeURIComponent(basename)
                    .replace(/[<>:"/\\|?*]/g, "_");
            }
        } catch { /* ignore invalid URLs */ }

        const savePath = await appFs.showSaveDialog({
            title: "Save Image",
            defaultPath: defaultName,
            filters: [
                {
                    name: "Images",
                    extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp"],
                },
                { name: "All Files", extensions: ["*"] },
            ],
        });
        if (!savePath) return;

        try {
            const response = await fetch(url);
            const buffer = Buffer.from(await response.arrayBuffer());
            await appFs.saveBinaryFile(savePath, buffer);
        } catch (err) {
            ui.notify(`Failed to save image: ${(err as Error).message}`, "error");
            return;
        }

        // Switch from URL to local file
        this.state.update((s) => {
            s.url = undefined;
            s.filePath = savePath;
            s.title = fpBasename(savePath);
        });
    };

    copyImageToClipboard = (): void => {
        this.imageRef?.copyToClipboard();
    };

    openInDrawingEditor = async (): Promise<void> => {
        const { filePath, url } = this.state.get();
        let dataUrl: string;
        let mimeType: string;
        if (this.pipe) {
            const buffer = await this.pipe.readBinary();
            const ext = fpExtname(
                filePath || this.pipe.provider.sourceUrl || ".png",
            ).toLowerCase();
            mimeType = extToMime(ext);
            dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
        } else if (url) {
            const response = await fetch(url);
            const blob = await response.blob();
            mimeType = blob.type || "image/png";
            const buffer = Buffer.from(await blob.arrayBuffer());
            dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
        } else {
            return;
        }
        const dims = await getImageDimensions(dataUrl);
        const json = buildExcalidrawJsonWithImage(dataUrl, mimeType, dims.width, dims.height);
        const baseName = filePath
            ? fpBasename(filePath).replace(/\.\w+$/, "")
            : "image";
        pagesModel.addEditorPage("draw-view", "json", baseName + ".excalidraw", json);
    };

    getIcon = (): ReactNode => {
        return createElement(FileIcon, {
            path: this.state.get().filePath || "image.png",
            width: 12,
            height: 12,
        });
    };
}

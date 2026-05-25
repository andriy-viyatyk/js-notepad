# US-569 — Image editor migration

> **EPIC-028 Phase C** · walkthrough 30 closure (umbrella note — Image deferred for first-principles investigation) · **Status:** Investigation complete 2026-05-25, ready for implementation.
>
> **Risk profile:** Low. US-568 (PDF) established the no-host migration template AND landed the cross-cutting infrastructure (`V4_NO_HOST_EDITOR_IDS` set + `wrapLegacyForPage` `instanceof V4EditorModel` early-return). US-569 is a textbook follow-on: build the three image files (`ImageEditor.ts` + `ImageView.tsx` + `index.tsx`), update `register-editors.ts`, add **one line** (`"image-view"`) to `V4_NO_HOST_EDITOR_IDS`, and patch the one external caller (`PagesLifecycleModel.openImageInNewTab`) that imports from `editors/image/` directly. **Scope:** 5 files in `editors/image/` (3 new, 1 rename, 1 delete) + `register-editors.ts` + 2 single-line edits in `PagesPersistenceModel.ts` and `PagesLifecycleModel.ts`.

## Goal

Migrate the Image viewer from a legacy `EditorModel` constructed via the legacy `EditorModule` factories to a native v4 `EditorModel` subclass registered in the v4 `editorRegistry`. Preserve Image's two-resource lifecycle (in-memory blob URL + on-disk cache file), the external `url?` slot (used for browser-webview-sourced images), the `BaseImageView` zoom/pan host wrapped by `<PageToolbar rightContributions>`, and the three toolbar actions (`saveImage`, `copyImageToClipboard`, `openInDrawingEditor`) byte-for-byte. Drop the legacy `EditorModule` indirection — Image construction flows through `editorRegistry.createEditor("image-view")` for restore and the direct registry path (resolve → `module.newEditorModel`) for file-open.

After US-569, Image joins Browser and PDF as the third member of `V4_NO_HOST_EDITOR_IDS`. `mainEditorV4 instanceof ImageEditor === true` becomes reliable across direct construction, file-open, AND restore.

## Background

### Today's surface

`src/renderer/editors/image/` — 2-file folder:

| File | LOC | Role |
|------|-----|------|
| `ImageViewer.tsx` | 350 | Legacy `EditorModel` subclass + view component + EditorModule factory bundle |
| `index.ts` | 4 | Re-exports |

### Today's class shape (legacy base, `ImageViewer.tsx:27–248`)

```typescript
interface ImageEditorModelState extends IEditorState {
    /** External image URL (e.g. from a browser webview). Used instead of filePath. */
    url?: string;
}

const getDefaultImageViewerModelState = (): ImageEditorModelState => ({
    ...getDefaultEditorModelState(),
    type: "imageFile" as const,
});

class ImageEditorModel extends EditorModel<ImageEditorModelState, void> {
    noLanguage = true;
    private cacheFileCreated = false;
    imageRef: BaseImageViewRef | null = null;

    setImageRef = (ref: BaseImageViewRef | null) => { this.imageRef = ref; };

    getRestoreData() {
        const data = super.getRestoreData();
        // Blob URLs don't survive across sessions — strip them.
        // HTTP(S) URLs are kept as display metadata (the pipe handles re-fetch).
        if (data.url && data.url.startsWith("blob:")) {
            delete data.url;
        }
        return data;
    }

    applyRestoreData(data: Partial<ImageEditorModelState>): void {
        super.applyRestoreData(data);
        if (data.url) {
            this.state.update((s) => { s.url = data.url; });
        }
    }

    async dispose(): Promise<void> {
        const url = this.state.get().url;
        if (url && url.startsWith("blob:")) {
            URL.revokeObjectURL(url);
        }
        await super.dispose();
    }

    private ensurePipe(): void {
        if (this.pipe) return;
        const filePath = this.state.get().filePath;
        if (!filePath) return;
        // archive (path!entry) split → FileProvider + ArchiveTransformer
        // or plain FileProvider
    }

    private async cacheImageBuffer(buffer: Buffer): Promise<void> {
        const cachePath = fs.resolveCachePath(this.id + ".img");
        await fs.writeBinary(cachePath, buffer);
        this.cacheFileCreated = true;
    }

    private async tryRestoreFromCache(): Promise<void> {
        const cachePath = fs.resolveCachePath(this.id + ".img");
        if (await fs.exists(cachePath)) {
            const buffer = await fs.readBinary(cachePath);
            const blob = new Blob([new Uint8Array(buffer)], { type: "image/png" });
            const blobUrl = URL.createObjectURL(blob);
            this.state.update((s) => { s.url = blobUrl; });
        }
    }

    async restore() {
        await super.restore();
        const { filePath, url } = this.state.get();
        if (filePath) {
            this.state.update((s) => { s.title = fpBasename(filePath); });
        }
        this.ensurePipe();
        if (this.pipe) {
            if (!url) {
                // No URL yet — read from pipe and create blob URL
                try {
                    const buffer = await this.pipe.readBinary();
                    const ext = fpExtname(filePath || this.pipe.provider.sourceUrl || ".png");
                    const mimeType = extToMime(ext);
                    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
                    const blobUrl = URL.createObjectURL(blob);
                    this.state.update((s) => { s.url = blobUrl; });
                    if (this.pipe.provider.type !== "file" || this.pipe.transformers.length > 0) {
                        await this.cacheImageBuffer(buffer);
                    }
                } catch {
                    await this.tryRestoreFromCache();
                }
            } else if (this.pipe.provider.type !== "file") {
                // URL already set (HTTP image) — cache in background for offline restart
                this.pipe.readBinary()
                    .then((buffer) => this.cacheImageBuffer(buffer))
                    .catch(() => { /* ignore */ });
            }
        } else if (!url) {
            await this.tryRestoreFromCache();
        }
    }

    /** Cache blob URL content to disk (called by openImageInNewTab for blob URLs). */
    async cacheBlobUrl(blobUrl: string): Promise<void> {
        const response = await fetch(blobUrl);
        const buffer = Buffer.from(await response.arrayBuffer());
        await this.cacheImageBuffer(buffer);
    }

    saveImage = async () => { /* showSaveDialog + saveBinaryFile, then mutate state */ };
    toggleNavigator = () => { this.page?.toggleNavigator(this.pipe, this.state.get().filePath); };
    copyImageToClipboard = () => { this.imageRef?.copyToClipboard(); };
    openInDrawingEditor = async () => { /* read bytes, build excalidraw JSON, addEditorPage("draw-view") */ };
    getIcon = () => <FileIcon path={this.state.get().filePath || "image.png"} width={12} height={12} />;
}
```

State (3 fields):

- **`state.filePath: string | undefined`** — inherited from `IEditorState`; the source path / URL / archive-path-with-bang notation (`archive.zip!path/to.png`).
- **`state.url?: string`** — runtime image URL. Either a blob URL (created from pipe bytes or via `cacheBlobUrl`), an HTTP(S) URL (external browser-webview source), or undefined (initial / after `saveImage`).
- **`state.type: "imageFile"`** — discriminator (preserved for legacy `newEditorModelFromState` routing).

View-attached editor field:

- **`imageRef: BaseImageViewRef | null`** — view's imperative handle for `copyImageToClipboard` delegation. Set by view via `setImageRef`. Mirrors GR3 (Graph) / DR3 (Draw) — instance field stays on the v4 class.

### Today's view component (`ImageViewer.tsx:258–308`)

```tsx
function ImageViewer({ model }: ImageViewerProps) {
    const filePath = model.state.use((s) => s.filePath);
    const url = model.state.use((s) => s.url);
    const src = url || "";
    const alt = filePath ? fpBasename(filePath) : "Image";
    const v4Main = pagesModel.findPage(model.id)?.mainEditorV4 ?? null;

    const rightActions = (
        <>
            {!filePath && url && (
                <IconButton name="image-save" size="sm" title="Save Image to File"
                    onClick={model.saveImage} icon={<SaveIcon />} />
            )}
            <IconButton name="image-open-draw" size="sm" title="Open in Drawing Editor"
                onClick={model.openInDrawingEditor} icon={<DrawIcon />} />
            <IconButton name="image-copy" size="sm" title="Copy Image to Clipboard (Ctrl+C)"
                onClick={model.copyImageToClipboard} icon={<CopyIcon />} />
        </>
    );

    return (
        <>
            {v4Main ? (
                <PageToolbar name="image-toolbar" model={v4Main} borderBottom rightContributions={rightActions} />
            ) : (
                <EditorToolbar borderBottom>{rightActions}</EditorToolbar>
            )}
            <BaseImageView ref={model.setImageRef} src={src} alt={alt} />
        </>
    );
}
```

The `v4Main` lookup is the same strangler-fig accommodation PDF had (PD-IMPL9) — drops in this migration. The `rightContributions` slot is REAL (vs PDF's empty body) — three icon buttons attach to the right side of the page toolbar.

### Today's registration (`register-editors.ts:244–259`)

```typescript
editorRegistry.register({
    id: "image-view",
    name: "Image Viewer",
    editorType: "imageFile",
    category: "standalone",
    acceptFile: (fileName) => {
        const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico"];
        if (matchesExtension(fileName, imageExtensions)) return 100;
        return -1;
    },
    loadModule: async () => {
        const module = await import("./image/ImageViewer");
        return module.default;
    },
});
```

Legacy registry only. Image is NOT yet in the v4 `editorRegistry` — that registration gets added by US-569. The v4 bridge loop (`register-editors.ts:810`) mirrors the legacy entry into the v4 registry with a throwing `createEditor` stub (standalone category) — replaced by the real v4 module in US-569.

### Today's construction sites

Image is constructed via four paths:

1. **`PagesLifecycleModel.openFile(filePath)` → `createEditorFromFile` → `newEditorModel(filePath)`** — `editorRegistry.resolve(filePath)` resolves `.png` / `.jpg` / etc. → `image-view` def → `module.newEditorModel(filePath)` returns a legacy `ImageEditorModel`. After US-568 PD-IMPL16, `wrapLegacyForPage` early-returns v4 instances — so post-US-569 the legacy module factory returns a v4 `ImageEditor` cast as legacy, and `wrap()` skips the adapter.
2. **`PagesPersistenceModel.restorePage(desc)` legacy fallback** — `desc.editors.map(d => …)` falls past the `if (d.host)` branch, the Explorer branch, AND the `V4_NO_HOST_EDITOR_IDS` set check. **Today** Image is NOT in the set → falls through to the legacy fallback → wrapped in `LegacyEditorAdapter`. **After US-569**, `"image-view"` is added to the set → the generic v4-native no-host restore branch (US-568 PD-IMPL11) fires → no adapter wrap.
3. **`PagesLifecycleModel.openImageInNewTab(imageUrl)`** — direct caller (`PagesLifecycleModel.ts:1133–1155`). Constructs an empty `ImageEditorModel` via the legacy module's `newEmptyEditorModel("imageFile")`, mutates state to set title + url, optionally assigns an `HttpProvider` pipe, calls `restore()`, then `addPage(wrap(imgModel))`. After `addPage`, fires `cacheBlobUrl(imageUrl)` for blob URLs only. Seven external callers feed into this path: Draw → `index.tsx:166`, Draw → `DrawView.tsx:270`, LinkEditor → `PinnedLinksPanel.tsx:216`, `LinkItemTiles.tsx:100`, `LinkItemList.tsx:115`, Browser → `BrowserWebviewModel.ts:373`, RestClient → `ResponseViewer.tsx:144`. **After US-569**, the legacy module factory returns a v4 `ImageEditor` cast as legacy; the same path works unchanged except for two surface details (import path rename + `instanceof` check class name) — see IM-IMPL14.
4. **MCP `create_page` rejection** — `mcp-handler.ts:160` returns an error for `image-view` with the hint `'Use execute_script with: await app.pages.openFile("/path/to/image.png")'`. Not a real construction path; mirrors PDF (PD-IMPL15).

All four sites currently produce either a `LegacyEditorAdapter`-wrapped ImageEditor or a fresh legacy ImageEditor. After US-569:

- Site 1 (`openFile`) — legacy module's `newEditorModel(filePath)` returns a v4 `ImageEditor` cast as legacy; `wrap()` early-returns (PD-IMPL16). No adapter wrap.
- Site 2 (`restorePage`) — `V4_NO_HOST_EDITOR_IDS` now contains `"image-view"` → generic v4-native branch fires → constructs via `v4Registry.createEditor("image-view", d.id)` → seeds state → `applyRestoreData` → `restore()`. No adapter wrap.
- Site 3 (`openImageInNewTab`) — same as today's flow, but `imgModule.default.newEmptyEditorModel("imageFile")` now returns a v4 `ImageEditor` cast as legacy. State mutation, pipe assignment, restore call, and `addPage(wrap(...))` all work identically. The `instanceof imgModule.ImageEditorModel` check (line 1151) reads the alias re-exported from `index.tsx`.
- Site 4 (MCP) — unchanged.

### Walkthrough 30 closure umbrella note (2026-05-20)

The walkthrough 30 closure table (`30-no-host-group.md:1238`) defers Image for first-principles investigation:

> **Image** — Same shape [as Browser] — no-host EditorModel; opens image files.

Image resolves entirely against the standardized NH set + US-568's already-resolved PD-IMPL set with IM-IMPL retrospective additions for the Image specifics (external `url?` slot, blob URL lifecycle, three toolbar actions, view-attached `imageRef`).

### Implementation-time context (post-US-568)

- **US-548 (PageModel adapter layer) landed**: `page.attach(editor)`, slice-subscription lifecycle, `restorePage` skeleton with v4-with-host + Explorer + `V4_NO_HOST_EDITOR_IDS` branches all in place.
- **US-558 (Browser editor migration) landed**: First v4-native NO-HOST page-mainEditor pattern.
- **US-567 (Explorer editor migration) landed**: Established the precedent of adding a v4-native restore branch in `restorePage`.
- **US-568 (PDF editor migration) landed**: Established the no-host migration template. PDF's `PdfEditor.ts` / `PdfView.tsx` / `index.tsx` triple is the reference layout for Image. Also landed the cross-cutting infrastructure: `V4_NO_HOST_EDITOR_IDS` set in `PagesPersistenceModel.ts` (PD-IMPL11) + `wrapLegacyForPage` `instanceof V4EditorModel` early-return (PD-IMPL16). US-569 piggybacks on both without touching them.
- **`deriveEditorId({ type: "imageFile" })` returns `"image-view"`** — confirmed by the legacy registry's `editorType: "imageFile"` → id `"image-view"` mapping. Pre-US-569 saved descriptors already carry `editorId: "image-view"`. Descriptor-shape stable across the migration.

### What does NOT exist in Image today

Image lacks the same Tier-5 capabilities PDF lacked, with one addition (the URL/blob slot doesn't introduce embedded editors or sub-models):

- **No sub-models** — single class.
- **No embedded editors** — Image is a leaf.
- **No `secondaryEditor` contributions** — Image doesn't add panels.
- **No `beforeNavigateAway` / `onMainEditorChanged` overrides** — Image is just a viewer.
- **No scripting facade** (`page.asImage()` doesn't exist; Image stays third-party-data, not script-manipulable).
- **No `CONTENT_HOST_TRAIT`** — no-host editor (NH2 / B2 default).
- **No HS1 host slot** — no `IContentHost` to ride on. Per-screen UX state is bounded — only the resolved blob URL (which is recomputed on every load) and the cache-file-created flag (transient).
- **No queue events worth typing** — base `ComponentQueueEvent` default suffices (IM-IMPL1).
- **No automation hooks** — Browser's `instanceof BrowserEditor` automation checks don't have an Image analogue.
- **No tree provider** — Image isn't in the EX8 typed-`instanceof` chain.

The migration is **lifecycle-only**: rewire construction + restoration to flow through the v4 native class, preserving the toolbar actions + the dual-resource lifecycle (blob URL in memory; cache file on disk) byte-for-byte.

---

## Implementation plan

### Step 1 — Create `ImageEditor.ts` (v4 native class)

**File:** `src/renderer/editors/image/ImageEditor.ts` (NEW, ~240 LOC).

Contents:

```typescript
import { createElement, ReactNode } from "react";
import { TComponentState } from "../../core/state/state";
import {
    EditorModel as V4EditorModel,
    type EditorStateBase,
    type RestoreData,
} from "../base/v4/EditorModel";
import type { EditorDescriptor } from "../../../shared/persistence-v4";
import { FileIcon } from "../../components/icons/FileIcon";
import { fpBasename, fpExtname } from "../../core/utils/file-path";
import { fs as appFs } from "../../api/fs";
import { ui } from "../../api/ui";
import { pagesModel } from "../../api/pages";
import { ContentPipe } from "../../content/ContentPipe";
import { FileProvider } from "../../content/providers/FileProvider";
import { ArchiveTransformer } from "../../content/transformers/ArchiveTransformer";
import type { BaseImageViewRef } from "../shared/BaseImageView";
import { buildExcalidrawJsonWithImage, getImageDimensions, extToMime } from "../draw/drawExport";

/**
 * EPIC-028 / US-569 — native v4 Image editor. NO-HOST editor (no
 * `CONTENT_HOST_TRAIT`) — Image owns its state directly and reads binary
 * content through its own `pipe` field rather than wrapping a `TextFileModel`.
 *
 * Closest siblings: PdfEditor (US-568) and BrowserEditor (US-558) — same
 * no-host page-mainEditor shape. Differences from PDF:
 *   - Image carries an external `url?` slot (browser-webview-sourced images).
 *   - Image's runtime resource is a blob URL (revoked in dispose) — PDF's
 *     is a local file path served via `safe-file://`.
 *   - Image has three toolbar actions (saveImage / copyImageToClipboard /
 *     openInDrawingEditor) attached via `<PageToolbar rightContributions>`.
 *   - Image exposes an imperative `imageRef` (instance field; view sets it
 *     via `setImageRef`) so `copyImageToClipboard` can delegate to the
 *     shared `BaseImageView`'s clipboard API.
 *
 * Design rationale: doc/tasks/US-569-image-editor-migration/README.md.
 */

export interface ImageEditorState extends EditorStateBase {
    /** Discriminator — preserved for legacy `newEditorModelFromState`
     *  routing and `EditorDescriptor.state.type` consumers (IM-IMPL3). */
    type: "imageFile";
    /** Source path / URL / archive-with-bang notation
     *  (`archive.zip!path/to.png`). */
    filePath?: string;
    /** Runtime image URL — blob URL (created from pipe bytes or via
     *  `cacheBlobUrl`), HTTP(S) URL (external browser-webview source), or
     *  undefined. Blob URLs are stripped from descriptors (IM-IMPL6); HTTP
     *  URLs are kept (pipe re-fetches on restore). */
    url?: string;
}

export const defaultImageEditorState: ImageEditorState = {
    id: "",
    title: "",
    modified: false,
    type: "imageFile",
};

export function getDefaultImageEditorState(): ImageEditorState {
    return { ...defaultImageEditorState, id: crypto.randomUUID() };
}

export class ImageEditor extends V4EditorModel<ImageEditorState> {
    /** v4 editor identity. Matches the legacy registry id so v4
     *  EditorDescriptor.editorId and pre-US-569 saved descriptors
     *  (deriveEditorId({type:"imageFile"}) === "image-view") agree. */
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

    setImageRef = (ref: BaseImageViewRef | null) => { this.imageRef = ref; };

    constructor(state: TComponentState<ImageEditorState>) {
        super(state);
    }

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
                const blob = new Blob([new Uint8Array(buffer)], { type: "image/png" });
                const blobUrl = URL.createObjectURL(blob);
                this.state.update((s) => { s.url = blobUrl; });
            } catch { /* cache read failed */ }
        }
    }

    async restore(): Promise<void> {
        await super.restore();
        const { filePath, url } = this.state.get();
        if (filePath) {
            this.state.update((s) => { s.title = fpBasename(filePath); });
        }

        this.ensurePipe();
        if (this.pipe) {
            if (!url) {
                try {
                    const buffer = await this.pipe.readBinary();
                    const ext = fpExtname(filePath || this.pipe.provider.sourceUrl || ".png").toLowerCase();
                    const mimeType = extToMime(ext);
                    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
                    const blobUrl = URL.createObjectURL(blob);
                    this.state.update((s) => { s.url = blobUrl; });
                    if (this.pipe.provider.type !== "file" || this.pipe.transformers.length > 0) {
                        await this.cacheImageBuffer(buffer);
                    }
                } catch {
                    await this.tryRestoreFromCache();
                }
            } else if (this.pipe.provider.type !== "file") {
                this.pipe.readBinary()
                    .then((buffer) => this.cacheImageBuffer(buffer))
                    .catch(() => { /* ignore */ });
            }
        } else if (!url) {
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
        let defaultName = "image.png";
        try {
            const urlPath = new URL(url).pathname;
            const basename = urlPath.split("/").pop();
            if (basename && /\.\w+$/.test(basename)) {
                defaultName = decodeURIComponent(basename).replace(/[<>:"/\\|?*]/g, "_");
            }
        } catch { /* ignore invalid URLs */ }
        const savePath = await appFs.showSaveDialog({
            title: "Save Image",
            defaultPath: defaultName,
            filters: [
                { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp"] },
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
            const ext = fpExtname(filePath || this.pipe.provider.sourceUrl || ".png").toLowerCase();
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
        const baseName = filePath ? fpBasename(filePath).replace(/\.\w+$/, "") : "image";
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
```

### Step 2 — Rename `ImageViewer.tsx` → `ImageView.tsx` and reduce to view + preserved legacy module

**File:** `src/renderer/editors/image/ImageView.tsx` (RENAMED from `ImageViewer.tsx`, ~110 LOC).

Strip the legacy class + state interface + module factories from the renamed file. Keep ONLY the React view + the legacy `EditorModule` export (which now constructs v4 `ImageEditor` for the LegacyEditorAdapter safety-net path, mirroring `PdfView.tsx` and `BrowserView.tsx`).

```tsx
import { IEditorState, EditorType } from "../../../shared/types";
import type { EditorModel } from "../base";
import { EditorModule } from "../types";
import { PageToolbar } from "../base/v4";
import { TComponentState } from "../../core/state/state";
import { IconButton } from "../../uikit";
import { CopyIcon, SaveIcon } from "../../theme/icons";
import { DrawIcon } from "../../theme/language-icons";
import { BaseImageView } from "../shared/BaseImageView";
import { fpBasename } from "../../core/utils/file-path";
import {
    ImageEditor,
    getDefaultImageEditorState,
    type ImageEditorState,
} from "./ImageEditor";

interface ImageViewProps {
    model: ImageEditor;
}

export function ImageView({ model }: ImageViewProps) {
    const filePath = model.state.use((s) => s.filePath);
    const url = model.state.use((s) => s.url);
    const src = url || "";
    const alt = filePath ? fpBasename(filePath) : "Image";

    const rightActions = (
        <>
            {!filePath && url && (
                <IconButton name="image-save" size="sm" title="Save Image to File"
                    onClick={model.saveImage} icon={<SaveIcon />} />
            )}
            <IconButton name="image-open-draw" size="sm" title="Open in Drawing Editor"
                onClick={model.openInDrawingEditor} icon={<DrawIcon />} />
            <IconButton name="image-copy" size="sm" title="Copy Image to Clipboard (Ctrl+C)"
                onClick={model.copyImageToClipboard} icon={<CopyIcon />} />
        </>
    );

    return (
        <>
            <PageToolbar
                name="image-toolbar"
                model={model}
                borderBottom
                rightContributions={rightActions}
            />
            <BaseImageView ref={model.setImageRef} src={src} alt={alt} />
        </>
    );
}

// ============================================================================
// EditorModule
// ============================================================================
// EPIC-028 / US-569 — legacy EditorModule shape preserved for the
// LegacyEditorAdapter safety-net path used by `PagesLifecycleModel.openFile`
// (file-open flow) AND by `PagesLifecycleModel.openImageInNewTab` (direct
// caller). The `as unknown as EditorModel` casts bridge the v4 ImageEditor
// class to the legacy EditorModel typing the legacy module factories expect;
// the runtime instance is the v4 class either way. Mirrors the US-568 PDF
// pattern at `pdf/PdfView.tsx`. `wrapLegacyForPage`'s `instanceof V4EditorModel`
// early-return (US-568 PD-IMPL16) detects the v4 instance and skips the
// adapter wrap. US-559 retires this block entirely.

const imageEditorModule: EditorModule = {
    Editor: ImageView as unknown as EditorModule["Editor"],
    newEditorModel: async (filePath?: string) => {
        const state: ImageEditorState = {
            ...getDefaultImageEditorState(),
            ...(filePath ? { filePath } : {}),
        };
        return new ImageEditor(new TComponentState(state)) as unknown as EditorModel;
    },
    newEmptyEditorModel: async (
        editorType: EditorType,
    ): Promise<EditorModel | null> => {
        if (editorType !== "imageFile") return null;
        return new ImageEditor(
            new TComponentState(getDefaultImageEditorState()),
        ) as unknown as EditorModel;
    },
    newEditorModelFromState: async (
        state: Partial<IEditorState>,
    ): Promise<EditorModel> => {
        const initialState: ImageEditorState = {
            ...getDefaultImageEditorState(),
            ...(state as Partial<ImageEditorState>),
        };
        return new ImageEditor(
            new TComponentState(initialState),
        ) as unknown as EditorModel;
    },
};

export default imageEditorModule;
export { ImageEditor };
export type { ImageViewProps, ImageEditorState };
```

The `v4Main` lookup retires (IM-IMPL10): post-migration `model` is the v4 ImageEditor directly, so `<PageToolbar model={model} rightContributions={...} />` works without the conditional `v4Main ?? EditorToolbar` fallback. Also drops `pagesModel` and `EditorToolbar` imports.

### Step 3 — Create `index.tsx` (v4 EditorModule + re-exports)

**File:** `src/renderer/editors/image/index.tsx` (NEW, ~40 LOC). Deletes the old `index.ts` (folded into the new `index.tsx`).

```tsx
import { TComponentState } from "../../core/state/state";
import { ImageEditor, getDefaultImageEditorState } from "./ImageEditor";
import { ImageView } from "./ImageView";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel as V4EditorModel } from "../base/v4/EditorModel";

/**
 * EPIC-028 / US-569 — native Image editor module. Registered with the v4
 * `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor`
 * when the page's `mainEditorV4` is a v4-native ImageEditor instance.
 *
 * Image is NO-HOST (no `CONTENT_HOST_TRAIT`) — `Component` is the full
 * Image viewer (toolbar + BaseImageView zoom/pan host). No `<TextChrome>`
 * wrap (text-bearing chrome is irrelevant).
 */

function ImageEditorComponent({ model }: { model: V4EditorModel }) {
    return <ImageView model={model as ImageEditor} />;
}

export const imageModule: EditorModule = {
    createEditor: () =>
        new ImageEditor(new TComponentState(getDefaultImageEditorState())),
    Component: ImageEditorComponent,
};

export { ImageEditor, getDefaultImageEditorState };
export type { ImageEditorState } from "./ImageEditor";
// Compatibility aliases — retire under US-559 cleanup. Keep
// `ImageEditorModel` / `ImageEditorModelState` names usable from any stale
// imports outside this folder (mirrors US-568 Pdf migration's alias
// pattern). The `openImageInNewTab` caller in PagesLifecycleModel.ts
// consumes the `ImageEditorModel` alias via this index.
export { ImageEditor as ImageEditorModel } from "./ImageEditor";
export type { ImageEditorState as ImageEditorModelState } from "./ImageEditor";
// Legacy EditorModule default-export — consumed by the legacy
// `editorRegistry` `loadModule` callback (file-open + LegacyEditorAdapter
// safety-net path) AND by `openImageInNewTab` for the blob-URL flow.
export { default as imageEditorModule } from "./ImageView";
```

### Step 4 — Update `register-editors.ts` — replace legacy block + add v4 block

**File:** `src/renderer/editors/register-editors.ts`

**Edit 1 (legacy registration, line 244–259):** Change the `loadModule` callback to load from `./image/ImageView` (renamed file path) instead of `./image/ImageViewer`.

```typescript
// Image viewer (standalone page editor for binary images)
editorRegistry.register({
    id: "image-view",
    name: "Image Viewer",
    editorType: "imageFile",
    category: "standalone",
    acceptFile: (fileName) => {
        const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico"];
        if (matchesExtension(fileName, imageExtensions)) return 100;
        return -1;
    },
    loadModule: async () => {
        // EPIC-028 / US-569 — Image migrated to native v4 module
        // (`imageModule` in `./image/index.tsx`). Legacy `imageEditorModule`
        // is PRESERVED in `ImageView.tsx` for the LegacyEditorAdapter
        // safety-net path used by the file-open flow AND by
        // `PagesLifecycleModel.openImageInNewTab`; `wrapLegacyForPage`'s
        // `instanceof V4EditorModel` early-return (US-568 PD-IMPL16)
        // detects the returned v4 ImageEditor and skips the adapter wrap.
        // US-559 retires this loadModule entirely.
        const module = await import("./image/ImageView");
        return module.default;
    },
});
```

**Edit 2 (add v4 registration at the bottom of the v4 block):** After the PDF v4 registration (the `v4EditorRegistry.register({ id: "pdf-view", ... })` block), add:

```typescript
// US-569 — replace the legacy bare-adapter mirror for image-view with a
// native v4 module. Image is NO-HOST (no `CONTENT_HOST_TRAIT`); the
// `accepts` predicate returns the legacy priority (100 for image
// extensions) so `editorRegistry.resolveForFile` routes image opens
// through the v4 createEditor when callers migrate to v4 file-open.
// Today's `PagesLifecycleModel.openFile` still uses the LEGACY registry's
// `resolve` + `module.newEditorModel(filePath)` (which now returns a v4
// ImageEditor cast as legacy via `ImageView.tsx`'s preserved module);
// US-559 wires file-open to v4 directly.
v4EditorRegistry.register({
    id: "image-view",
    name: "Image Viewer",
    hasContentHost: false,
    accepts: (input) => {
        const legacy = editorRegistry.getById("image-view");
        if (!legacy) return -1;
        if (input.fileName) {
            const p = legacy.acceptFile?.(input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        return -1;
    },
    loadModule: async () => {
        const { imageModule } = await import("./image");
        return imageModule;
    },
});
```

The `accepts` delegates to the legacy registry's `acceptFile` (image extensions → 100). `hasContentHost: false` ensures Image is hidden from the switch widget (matches Browser / PDF).

### Step 5 — Add `"image-view"` to `V4_NO_HOST_EDITOR_IDS`

**File:** `src/renderer/api/pages/PagesPersistenceModel.ts:55–58`

Single-line opt-in to the generic v4-native no-host restore branch landed in US-568 (PD-IMPL11). Update the inline comment to document the third member.

Before:

```typescript
const V4_NO_HOST_EDITOR_IDS = new Set([
    "browser-view", // US-558 (retroactive — see PD-IMPL11)
    "pdf-view",     // US-568 (this PR)
]);
```

After:

```typescript
const V4_NO_HOST_EDITOR_IDS = new Set([
    "browser-view", // US-558 (retroactive — see US-568 PD-IMPL11)
    "pdf-view",     // US-568
    "image-view",   // US-569 (this PR)
]);
```

Also remove the `- US-569 Image → "image-view"` line from the JSDoc comment block above the set (lines 43–50), since the item is now in the set itself.

**No other changes to this file** — the generic restore branch (PD-IMPL11) is already in place. Image's `editorId === "image-view"` automatically routes through it. State seeding, `applyRestoreData`, and `restore()` invocation follow the established no-host pattern.

### Step 6 — Patch `openImageInNewTab` caller (single external consumer)

**File:** `src/renderer/api/pages/PagesLifecycleModel.ts:1133–1155`

Today's code:

```typescript
openImageInNewTab = async (imageUrl: string): Promise<void> => {
    const imgModule = await import("../../editors/image/ImageViewer");
    const imgModel =
        await imgModule.default.newEmptyEditorModel("imageFile");
    if (imgModel) {
        imgModel.state.update(
            (s: { title: string; url?: string }) => {
                s.title = imageUrl.split("/").pop()?.split("?")[0] || "Image";
                s.url = imageUrl;
            },
        );
        if (/^https?:\/\//i.test(imageUrl)) {
            imgModel.pipe = new ContentPipe(new HttpProvider(imageUrl));
        }
        await imgModel.restore();
        this.addPage(wrap(imgModel));

        if (imageUrl.startsWith("blob:") && imgModel instanceof imgModule.ImageEditorModel) {
            imgModel.cacheBlobUrl(imageUrl);
        }
    }
};
```

After US-569:

```typescript
openImageInNewTab = async (imageUrl: string): Promise<void> => {
    // EPIC-028 / US-569 — Image migrated to native v4 module. Import path
    // resolves to `editors/image/index.tsx` (post-migration; the legacy
    // file `ImageViewer.tsx` was renamed to `ImageView.tsx` and is no
    // longer imported directly). `imgModule.default` is the preserved
    // legacy `imageEditorModule` (constructs v4 ImageEditor cast as
    // legacy). `imgModule.ImageEditorModel` is the v4 ImageEditor class
    // re-exported under the compatibility alias for the `instanceof`
    // check below. `wrap(imgModel)` early-returns the v4 instance
    // (US-568 PD-IMPL16) — no adapter wrap.
    const imgModule = await import("../../editors/image");
    const imgModel =
        await imgModule.default.newEmptyEditorModel("imageFile");
    if (imgModel) {
        imgModel.state.update(
            (s: { title: string; url?: string }) => {
                s.title = imageUrl.split("/").pop()?.split("?")[0] || "Image";
                s.url = imageUrl;
            },
        );
        if (/^https?:\/\//i.test(imageUrl)) {
            imgModel.pipe = new ContentPipe(new HttpProvider(imageUrl));
        }
        await imgModel.restore();
        this.addPage(wrap(imgModel));

        if (imageUrl.startsWith("blob:") && imgModel instanceof imgModule.ImageEditorModel) {
            imgModel.cacheBlobUrl(imageUrl);
        }
    }
};
```

Two surface changes:

1. **Import path:** `../../editors/image/ImageViewer` → `../../editors/image` (folder-as-module resolves to `index.tsx`).
2. **`instanceof` check class name:** stays `imgModule.ImageEditorModel` thanks to the compatibility alias in `index.tsx`. No name change at the callsite.

Runtime semantics: the v4 ImageEditor instance has the SAME public surface for everything the caller does — `state.update(...)`, `pipe = new ContentPipe(...)`, `await restore()`, `cacheBlobUrl(url)`. The state mutation works because v4 `EditorModel` carries `state: TComponentState<T>` exactly like the legacy base. The pipe assignment works because v4 `EditorModel.pipe: IContentPipe | null` is still an instance field. `cacheBlobUrl` is preserved verbatim on the v4 class.

### Step 7 — Delete dead `toggleNavigator` method

**File:** `src/renderer/editors/image/ImageEditor.ts` (don't add it)

Legacy `ImageEditorModel.toggleNavigator` exists as a wrapper around `this.page?.toggleNavigator(this.pipe, filePath)` but **no external consumer calls it** (confirmed by grep). The v4 `PageToolbar`'s `NavPanelButton` auto-renders based on `editor.getNavigatorTarget()` — which legacy `EditorModel` doesn't override, so today's Image legacy code never surfaces a nav-panel button either way. Preserving current behavior (no nav-panel button on Image) means **omitting `toggleNavigator` AND `getNavigatorTarget()`** from the v4 class.

If a future requirement adds a file-explorer button to Image, override `getNavigatorTarget()` per the v4 contract (single declarative read; `PageToolbar` handles the rendering and click wiring).

### Step 8 — Delete `index.ts` (folded into `index.tsx`)

**File:** `src/renderer/editors/image/index.ts` (DELETE)

The new `index.tsx` (Step 3) absorbs all exports. TypeScript resolves `import "./image"` to `./image/index.tsx` automatically.

The old `index.ts`:

```typescript
// DELETED
export { default } from "./ImageViewer";
export { ImageViewer, ImageEditorModel } from "./ImageViewer";
export type { ImageViewerProps, ImageEditorModelState } from "./ImageViewer";
```

The new `index.tsx` re-exports the equivalents:

- `imageEditorModule` (legacy default) from `./ImageView`.
- `ImageEditor` (renamed from `ImageEditorModel`) + alias `ImageEditor as ImageEditorModel` from `./ImageEditor`.
- `ImageEditorState` (renamed from `ImageEditorModelState`) + alias from `./ImageEditor`.
- The `ImageViewer` named class-export retires (no external consumers grep'd). If a stale `ImageViewer` import surfaces during implementation, expose an `ImageView as ImageViewer` alias in `index.tsx`.

### Step 9 — Verify no external consumers of `ImageEditorModel` class name

Grep results at investigation time:

- `ImageEditorModel` class name — only consumed inside `editors/image/` (`ImageViewer.tsx` itself + `index.ts` re-export) AND at `PagesLifecycleModel.ts:1151` (the `instanceof` check). The lifecycle caller is patched in Step 6; the compatibility alias in `index.tsx` keeps the `ImageEditorModel` name usable.
- `ImageViewer` value export — no external consumers.
- `getDefaultImageViewerModelState` function — no external consumers (private to `ImageViewer.tsx`).
- `ImageViewerProps` type — no external consumers.

If a consumer surfaces during implementation, the compatibility aliases cover stale TypeScript imports.

### Step 10 — Dashboard update

**File:** `doc/active-work.md`

Promote the US-569 entry (today line 41) from the unlinked placeholder form:

```
- [ ] US-569: Image editor migration — walkthrough 30 closure (no-host; first-principles investigation)
```

…to the linked form mirroring US-568's entry pattern, with a comprehensive scope description (third no-host Tier-5 page-mainEditor v4-native migration after Browser + PDF; reuses US-568 cross-cutting infrastructure; one-line opt-in to `V4_NO_HOST_EDITOR_IDS`; preserves all three toolbar actions verbatim).

---

## Concerns (IM-IMPL retrospective — added 2026-05-25 during investigation)

### IM-IMPL1 — Class shape: `ImageEditor extends V4EditorModel<ImageEditorState>` (two generics, base defaults for R + E)

Image has no queue events (no view bridge — `BaseImageView` is a self-contained component with `useImperativeHandle` for clipboard delegation, and the `imageRef` field on the editor is set imperatively from the view). The third generic on v4 `EditorModel<S, R, E>` defaults to `ComponentQueueEvent`. Use the bare two-generic form.

```typescript
export class ImageEditor extends V4EditorModel<ImageEditorState> {
    // R = unknown (default); E = ComponentQueueEvent (default).
}
```

Matches PDF (PD-IMPL1) and Explorer (US-567 EX-IMPL3) "no third generic" pattern.

### IM-IMPL2 — `editorId = "image-view"` — deliberate alignment with legacy registry id

The legacy registry has `id: "image-view"` + `editorType: "imageFile"`. `deriveEditorId({ type: "imageFile" })` returns `"image-view"` via the registry lookup. **Pre-US-569 saves already have `editorId: "image-view"`** (the LegacyEditorAdapter wraps with that id), so the migration is descriptor-shape-stable. **No restore migration shim needed.**

```typescript
/** v4 editor identity. Matches the legacy registry id so v4
 *  EditorDescriptor.editorId and pre-US-569 saved descriptors
 *  (deriveEditorId({type:"imageFile"}) === "image-view") agree. */
readonly editorId = "image-view";
```

### IM-IMPL3 — State shape: 3 fields including discriminator

```typescript
export interface ImageEditorState extends EditorStateBase {
    type: "imageFile";    // discriminator (preserved per S10 carve-out)
    filePath?: string;    // source path / URL / archive-with-bang notation
    url?: string;         // runtime image URL — blob / HTTP(S) / undefined
}
```

The `type` discriminator stays on state (mirrors PDF / Explorer / Browser). It's consumed by:

- The legacy `editorRegistry.getAll().find((e) => e.editorType === state.type)` route in `newEditorModelFromState` (not hit post-migration — Step 5's restore branch catches Image first).
- Pre-US-569 saved descriptors that carry `state.type` instead of (or in addition to) `editorId`.

### IM-IMPL4 — Dual-resource lifecycle: blob URL (in-memory) + cache file (on-disk)

PDF (PD-IMPL4) had ONE resource: a temp cache file gated by `cacheFileCreated`. Image has TWO resources with separate gate semantics:

| Resource | Created by | Destroyed by | Gate field |
|----------|------------|--------------|------------|
| Blob URL | `restore()` (from pipe), `tryRestoreFromCache()` | `dispose()` via `URL.revokeObjectURL` | `state.url` `.startsWith("blob:")` |
| Cache file | `restore()` non-local branch, `cacheBlobUrl()` (post-addPage) | `dispose()` | `cacheFileCreated` flag |

The two resources are independent — the blob URL is the runtime resource the `<img>` tag reads; the cache file is the cross-restart persistence vehicle. Both are preserved verbatim from the legacy class.

```typescript
async dispose(): Promise<void> {
    const url = this.state.get().url;
    if (url && url.startsWith("blob:")) {
        URL.revokeObjectURL(url);
    }
    if (this.cacheFileCreated) {
        const cachePath = appFs.resolveCachePath(this.id + ".img");
        try { await appFs.delete(cachePath); } catch { /* ignore */ }
    }
    await super.dispose();
}
```

### IM-IMPL5 — `pipe` field on the v4 base — keep `ensurePipe()` pattern (mirror PD-IMPL5)

The v4 base `EditorModel.pipe: IContentPipe | null = null` is a legacy-compat field kept for the strangler period. Image's `ensurePipe()` reconstructs the pipe from `state.filePath` lazily — same shape as PDF.

`pipe` is also assigned directly by `openImageInNewTab` for HTTP URLs (the caller constructs the HttpProvider pipe before `restore()`). `ensurePipe()` is a no-op in that case. **No retirement plan for Image's `pipe` usage** — it's the load-path source of truth.

### IM-IMPL6 — `getRestoreData()` strips blob URLs; keeps HTTP URLs

Today's legacy `getRestoreData()` strips blob URLs via `if (data.url && data.url.startsWith("blob:")) delete data.url;`. The v4 override mirrors this semantically but returns `EditorDescriptor` per the v4 contract:

```typescript
getRestoreData(): EditorDescriptor {
    const s = this.state.get();
    const url = s.url && s.url.startsWith("blob:") ? undefined : s.url;
    return {
        editorId: this.editorId,
        id: s.id,
        state: { ...s, url } as unknown as Record<string, unknown>,
    };
}
```

**Why HTTP URLs are kept**: the pipe re-fetches on restore (via `restore()` → `ensurePipe()` → `pipe.readBinary()`). Keeping the HTTP URL also surfaces it in `state.url` BEFORE restore completes — the `<img>` renders the live HTTP URL while the pipe-driven cache update runs in the background. This matches the legacy behavior (`restore()`'s `else if (this.pipe.provider.type !== "file") { /* background cache write */ }` branch).

**Why blob URLs are stripped**: blob URLs are per-document-lifetime; they don't survive a page reload, let alone an app restart. The cache file (written via `cacheBlobUrl()` for `openImageInNewTab` flows, OR via `restore()` for non-local pipes) is the cross-restart vehicle. `tryRestoreFromCache()` creates a fresh blob URL on the next restore.

### IM-IMPL7 — `applyRestoreData()` reads `filePath` AND `url`

```typescript
applyRestoreData(data: RestoreData<ImageEditorState>): void {
    super.applyRestoreData(data);
    if (data.filePath) {
        this.state.update((s) => { s.filePath = data.filePath; });
    }
    if (data.url) {
        this.state.update((s) => { s.url = data.url; });
    }
}
```

`filePath` + `url` are the two meaningful incoming fields. `title` is recomputed in `restore()` from `fpBasename(filePath)`. `type`, `id`, `modified` come through `super.applyRestoreData(data)` and the default-state spread in Step 5's restore-branch state seeding.

### IM-IMPL8 — File split: three files (mirror US-568 PD-IMPL8)

| File | LOC | Role |
|------|-----|------|
| `ImageEditor.ts` | ~240 | v4 class + state interface + defaults. Self-contained model. |
| `ImageView.tsx` | ~110 | React view + preserved legacy `EditorModule` (constructs v4 ImageEditor cast as legacy, matching `PdfView.tsx`). |
| `index.tsx` | ~40 | v4 EditorModule (`imageModule`) + compatibility aliases. |
| `index.ts` | DELETED | Folded into `index.tsx`. |
| `ImageViewer.tsx` | DELETED | Renamed to `ImageView.tsx`. |

Why three files instead of one: matches PDF's pattern (PD-IMPL8). Mixing the v4 class + the legacy module + the view in one file would create circular-import risk and obscure the boundary between pure model (`ImageEditor.ts`) and bridging glue (`ImageView.tsx`).

### IM-IMPL9 — View body retires `mainEditorV4` lookup (mirror PD-IMPL9)

Today's `ImageViewer.tsx:263` reads:

```typescript
const v4Main = pagesModel.findPage(model.id)?.mainEditorV4 ?? null;
// ...
{v4Main ? <PageToolbar model={v4Main} rightContributions={...} /> : <EditorToolbar>{rightActions}</EditorToolbar>}
```

Post-migration `model` IS the v4 ImageEditor — no lookup needed:

```typescript
<PageToolbar model={model} rightContributions={rightActions} />
```

Also drops `EditorToolbar` import (no longer referenced) and `pagesModel` import (replaced by passing `model` directly).

### IM-IMPL10 — v4 registry `accepts({ fileName })` returns the legacy priority

Mirror PD-IMPL10 — delegate to `legacy.acceptFile`. Forward-compat for US-559's eventual file-open migration to v4 `resolveForFile`. `hasContentHost: false` keeps Image out of the switch widget.

```typescript
v4EditorRegistry.register({
    id: "image-view",
    name: "Image Viewer",
    hasContentHost: false,
    accepts: (input) => {
        const legacy = editorRegistry.getById("image-view");
        if (!legacy) return -1;
        if (input.fileName) {
            const p = legacy.acceptFile?.(input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        return -1;
    },
    loadModule: async () => {
        const { imageModule } = await import("./image");
        return imageModule;
    },
});
```

### IM-IMPL11 — One-line opt-in to `V4_NO_HOST_EDITOR_IDS`

US-568 (PD-IMPL11) built the generic v4-native no-host restore branch. US-569 piggybacks: add `"image-view"` to the set. No other changes to `PagesPersistenceModel.ts`.

```typescript
const V4_NO_HOST_EDITOR_IDS = new Set([
    "browser-view", // US-558 (retroactive — see US-568 PD-IMPL11)
    "pdf-view",     // US-568
    "image-view",   // US-569 (this PR)
]);
```

After the line lands, restoring an Image page goes through `v4Registry.createEditor("image-view", d.id)` → state seeding from `d.state` → `applyRestoreData(d.state)` → `await editor.restore()`. The flow handles HTTP URL persistence + cache-file rehydration via `tryRestoreFromCache()` correctly because:

1. **HTTP URL case** — `state.url` is preserved through `getRestoreData()` (IM-IMPL6) → `applyRestoreData` re-applies it → `restore()` sees `url` set and the pipe (if reconstructed via `ensurePipe()` from filePath, or assigned externally) reads in the background to update the cache.
2. **Blob URL case (post-restart)** — `state.url` was stripped by `getRestoreData()`. `restore()` runs `ensurePipe()` (no-op if no `filePath`) → no pipe + no url → falls through to `tryRestoreFromCache()` which reads the cache file and creates a fresh blob URL.
3. **Local file case** — `state.filePath` survives. `ensurePipe()` builds a `FileProvider` pipe. `restore()` reads bytes → creates blob URL → no cache (plain `FileProvider`).
4. **Archive case** — `state.filePath` survives (with bang notation). `ensurePipe()` builds the `FileProvider + ArchiveTransformer` chain. `restore()` reads bytes → creates blob URL → writes cache file (non-`file` provider OR transformers present).

### IM-IMPL12 — `instanceof V4EditorModel` early-return in `wrapLegacyForPage` (no change required)

US-568 (PD-IMPL16) added the early-return at the top of `wrapLegacyForPage`. Image is v4-native AFTER US-569 → the early-return catches v4 ImageEditor returned by the preserved legacy module. **No changes to `PagesLifecycleModel.ts:67–78` for US-569.**

The single edit to `PagesLifecycleModel.ts` is the `openImageInNewTab` caller path (IM-IMPL14).

### IM-IMPL13 — `imageRef` view-attached editor field — instance field, not state

`imageRef: BaseImageViewRef | null = null` stays on the v4 instance as a plain class field. The view sets it via `setImageRef` (passed as the `ref` prop on `<BaseImageView>`). `copyImageToClipboard` delegates to `this.imageRef?.copyToClipboard()`.

This is the **view-attached editor field** pattern from Graph (GR3) and Draw (DR3) — those editors have content-views with body components, but the principle is the same: the v4 editor instance owns the imperative ref, and the view sets it during render. **NOT state** because (a) the ref is a function reference that doesn't survive serialization, (b) state-based ref tracking would trigger re-renders on ref changes.

### IM-IMPL14 — `openImageInNewTab` caller — import path + `instanceof` check

The caller at `PagesLifecycleModel.ts:1133–1155` is the ONLY external consumer of the `editors/image/` folder's class shape (everyone else just calls `pagesModel.openImageInNewTab(url)`). Two surface changes (Step 6):

1. **Import path:** `../../editors/image/ImageViewer` → `../../editors/image` (folder-as-module).
2. **`instanceof` check:** stays `imgModule.ImageEditorModel` via the compatibility alias in `index.tsx`.

**Why `../../editors/image` (folder) instead of `../../editors/image/ImageView` (renamed file)?**

- `index.tsx` is the public surface — re-exports both `default` (legacy `imageEditorModule` from `ImageView`) AND `ImageEditorModel` (alias on `ImageEditor`).
- `ImageView.tsx` is the bridging glue — exports the default module + the `ImageEditor` class + types, but does NOT re-export the `ImageEditorModel` alias.
- Importing from the folder gets BOTH `default` and `ImageEditorModel` in one shot. Importing from `ImageView.tsx` would require updating the `instanceof` check to use `ImageEditor` (also fine, but more change-impact).

**Why not import from `../../editors/image` already today?** The legacy `index.ts` re-exported `{ default, ImageEditorModel }` from `./ImageViewer` — the caller could have imported from the folder all along. The current direct-file import is incidental. The new `index.tsx` keeps the same public surface, so the caller change is non-disruptive.

### IM-IMPL15 — `toggleNavigator` method DELETED — confirmed dead code

Legacy `ImageEditorModel.toggleNavigator` (line 216) is a single method that proxies `this.page?.toggleNavigator(this.pipe, filePath)`. Grep results show **no external callers**:

- No callers in `editors/image/`.
- No callers in any other folder.
- The legacy `EditorToolbar` rendering in the `v4Main === null` branch does NOT bind a button to this method (no `model.toggleNavigator` reference in the view).

The v4 `PageToolbar`'s `NavPanelButton` auto-renders based on `editor.getNavigatorTarget()` — Image does NOT override this method (today's `ImageEditorModel` doesn't implement it either; legacy `EditorModel` base returns `null`). Preserving current behavior (no nav-panel button on Image) means **omitting both `toggleNavigator` AND `getNavigatorTarget()` from the v4 ImageEditor class**.

### IM-IMPL16 — `cacheBlobUrl` preserved verbatim — public method on v4 class

`cacheBlobUrl(blobUrl: string): Promise<void>` is a public method on the v4 class (matches the legacy shape). The caller at `PagesLifecycleModel.ts:1151` reads:

```typescript
if (imageUrl.startsWith("blob:") && imgModel instanceof imgModule.ImageEditorModel) {
    imgModel.cacheBlobUrl(imageUrl);
}
```

The `instanceof` check narrows `imgModel` from `EditorModel` to `ImageEditorModel` (which is `ImageEditor` via the alias). TypeScript resolves the `.cacheBlobUrl(imageUrl)` call against the v4 class's public method signature.

**Why is `cacheBlobUrl` called AFTER `addPage` (not inside `restore()`)?** Three reasons:

1. **`restore()` runs BEFORE `addPage` in the caller's flow.** The caller calls `await imgModel.restore()` to initialize, then `addPage(wrap(imgModel))`. If `cacheBlobUrl` ran inside `restore()`, the caller would have to set the blob URL into state BEFORE calling restore.
2. **The blob URL isn't known until the caller decides.** `openImageInNewTab` is the only entry-point that hands a blob URL to the editor — `restore()` doesn't have visibility into this context.
3. **Async timing.** `cacheBlobUrl()` fires-and-forgets (no `await` at the callsite). Running it after `addPage` decouples cache write from page-attach.

**Preserve verbatim.** No refactor opportunity.

### IM-IMPL17 — `saveImage` post-save state mutation: leave pipe stale

After `saveImage` succeeds, the legacy code mutates state to switch from URL to filePath:

```typescript
this.state.update((s) => {
    s.url = undefined;
    s.filePath = savePath;
    s.title = fpBasename(savePath);
});
```

The pipe is NOT updated — it still points at the original HTTP provider (if there was one) OR remains `null` (if the source was a blob URL with no pipe). This is fine because:

- The image is already rendered (the `<img>` tag has the blob URL from before `saveImage`). The blob URL gets revoked on `dispose` regardless.
- After the state mutation, the user has a local file. On NEXT app restart, `restore()` runs `ensurePipe()` against the new `state.filePath` → builds a `FileProvider` pipe → reads the local file → creates a fresh blob URL. The original (now-revoked) blob URL is irrelevant.
- `openInDrawingEditor` is the only method that re-reads the pipe; if the user clicks "Open in Drawing Editor" AFTER saving, it would re-fetch from the stale HTTP URL. **Edge case, not introduced by this migration** (same behavior today). Preserve verbatim.

If post-migration testing reveals a regression in the post-save → openInDrawingEditor flow, a follow-up can rewire `saveImage` to recreate the pipe. **Not in scope.**

### IM-IMPL18 — `openInDrawingEditor` preserved verbatim

`openInDrawingEditor()` reads bytes from `pipe.readBinary()` (or fetches from `url`), builds an Excalidraw JSON via `buildExcalidrawJsonWithImage(dataUrl, mime, w, h)`, then opens a new draw page via `pagesModel.addEditorPage("draw-view", "json", baseName + ".excalidraw", json)`. Draw migrated to v4 in US-565; `addEditorPage` continues to work post-migration. **No source change.**

### IM-IMPL19 — Compatibility aliases for `ImageEditorModel` / `ImageEditorModelState` / `ImageViewer` name

Per PDF (PD-IMPL12) and Browser (US-558) precedent, ship compatibility aliases in `index.tsx`:

```typescript
export { ImageEditor as ImageEditorModel } from "./ImageEditor";
export type { ImageEditorState as ImageEditorModelState } from "./ImageEditor";
```

The `ImageViewer` value export retires. If a stale `ImageViewer` import surfaces during implementation, expose an `ImageView as ImageViewer` alias too.

### IM-IMPL20 — `editor.id` preservation across restore (cache-file continuity)

Mirror PD-IMPL14. The cache file path is `appFs.resolveCachePath(this.id + ".img")`. Step 5's restore branch (US-568 PD-IMPL11, unchanged) passes `d.id` to `v4Registry.createEditor("image-view", d.id)` — id continuity is preserved across restarts. The non-local Image's temp cache file persists from save → restore → next save, then `dispose()` cleans it up on close. **Verified by tracing US-568's identical flow for PDF.**

### IM-IMPL21 — MCP `create_page` rejection unchanged

`mcp-handler.ts:160` returns an error for `image-view` with the hint:

```typescript
"image-view": 'Use execute_script with: await app.pages.openFile("/path/to/image.png")',
```

The MCP create_page flow rejects all standalone editors. Post-migration, the legacy registry's `category: "standalone"` is still consulted by `mcp-handler.ts`. **No source change needed for MCP.**

---

## Acceptance criteria

### Phase 1 — Static verification (read code; check 18 points)

**Image editor (15 points):**

1. `ImageEditor` class extends `V4EditorModel<ImageEditorState>` from `editors/base/v4/EditorModel`.
2. `ImageEditor.editorId === "image-view"` is declared.
3. `ImageEditor` constructor signature is `(state: TComponentState<ImageEditorState>)`.
4. `ImageEditorState` extends `EditorStateBase` and has `type: "imageFile"` + optional `filePath` + optional `url`.
5. `ImageEditor.getRestoreData()` returns `EditorDescriptor` (NOT `Partial<S>`).
6. `ImageEditor.getRestoreData()` strips blob URLs (sets `url` to `undefined` when `s.url.startsWith("blob:")`); keeps HTTP URLs and undefined verbatim.
7. `ImageEditor.applyRestoreData()` reads `filePath` AND `url` from typed `data`.
8. `ImageEditor.restore()` calls `ensurePipe()` then branches on pipe + url state (no-url → pipe-read or cache-fallback; url-set → background cache; no-pipe + no-url → cache-fallback).
9. `ImageEditor.dispose()` revokes active blob URL AND deletes cache file if `cacheFileCreated`, then calls `super.dispose()`.
10. `ImageEditor.cacheBlobUrl(blobUrl)` is a public method preserved verbatim from the legacy class.
11. `ImageEditor.imageRef: BaseImageViewRef | null` is an instance field; `setImageRef` setter is bound.
12. `ImageView.tsx` renders `<PageToolbar model={model} rightContributions={rightActions}>` directly (NO `mainEditorV4` lookup; NO `EditorToolbar` fallback).
13. `ImageView.tsx` exports `imageEditorModule` (legacy EditorModule) as default; factories construct v4 `ImageEditor` cast as legacy.
14. `image/index.tsx` exports `imageModule` (v4 EditorModule) with `createEditor` returning `new ImageEditor(...)`, plus the `ImageEditorModel`/`ImageEditorModelState` compatibility aliases.
15. `image/index.ts` is deleted; `image/ImageViewer.tsx` is deleted (renamed to `ImageView.tsx`).

**Registration + caller patches (3 points):**

16. `register-editors.ts` legacy block loads from `"./image/ImageView"` (renamed file path).
17. `register-editors.ts` has a v4 registration for `image-view` with `hasContentHost: false` + `accepts` delegating to legacy + `loadModule` returning `imageModule`.
18. `PagesPersistenceModel.ts` `V4_NO_HOST_EDITOR_IDS` set has 3 entries including `"image-view"`. JSDoc comment block above the set is trimmed to remove the `- US-569 Image → "image-view"` line.

**`openImageInNewTab` caller (2 points):**

19. `PagesLifecycleModel.openImageInNewTab` imports from `"../../editors/image"` (folder), not `"../../editors/image/ImageViewer"` (deleted file).
20. The `imgModel instanceof imgModule.ImageEditorModel` check still uses the `ImageEditorModel` name (resolved via compatibility alias in `index.tsx`).

**Build / lint (2 points):**

21. `npm run typecheck` clean against the baseline established by US-568's commit `27a2361` (no new errors in touched files).
22. `npm run lint` clean against the baseline established by US-568's commit `27a2361` (no new findings in touched files).

### Phase 2 — Smoke tests (user runs in a dev build)

**Image golden paths (8 tests):**

1. **Open a local image (plain file):** menu → "Open File" → select `.png` → new page opens; image renders in `BaseImageView` (zoom/pan works). Title is the image's filename. **After open: `page.mainEditorV4 instanceof ImageEditor === true`** (verifies the `wrapLegacyForPage` early-return — US-568 PD-IMPL16 applies to Image now).
2. **Open an image from a ZIP archive:** open `archive.zip` → drill into a `.png` entry → image renders. Cache file gets written (`cacheFileCreated === true`).
3. **Open a remote image via HTTP:** open via `app.pages.openFile("https://example.com/image.png")` (script context) → image downloads, renders, caches as temp file.
4. **Right-click image in Browser → open in new tab (blob URL):** open a browser page → navigate to a page with an image → right-click → "Open Image in New Tab" → new image page opens with the image rendered. After addPage: cache file exists (written by `cacheBlobUrl`).
5. **Right-click image in Link tile → open in new tab:** similar flow but from Link editor's PinnedLinksPanel / LinkItemTiles / LinkItemList — image opens.
6. **Close Image tab — both resources cleanup:** open a non-local image (HTTP or blob). Verify cache file exists in cache dir; verify state.url is a blob URL. Close the tab. Verify (a) cache file is gone, (b) the blob URL is revoked (e.g., it returns 404 on fetch). For Local-file images: no cache file, no blob URL — just state cleared.
7. **Survive app restart (local image):** open a local PNG → close the app → relaunch. Image reopens with the same file; viewer renders correctly. **After restart: `page.mainEditorV4 instanceof ImageEditor === true`** (verifies the generic restore branch — US-568 PD-IMPL11 + IM-IMPL11 `"image-view"` opt-in).
8. **Survive app restart (HTTP image):** open `https://example.com/image.png` → close the app → relaunch. The HTTP URL persists in `state.url`; the cache file ALSO survives. On restore, the `<img>` renders from the HTTP URL (or the cache-restored blob URL if offline); the pipe re-fetches in the background.

**Blob URL persistence across restart (1 test):**

9. **Survive app restart (blob URL → cache → fresh blob URL):** right-click an image in a Browser page to open in a new image tab (creates blob URL + writes cache via `cacheBlobUrl`). Close the app. Relaunch. The Image page restores; `state.url` is a NEW blob URL (created by `tryRestoreFromCache`); the image renders. Original blob URL is dead (different document context); cache file is the bridge.

**Toolbar actions (3 tests):**

10. **`saveImage` for HTTP image:** open an HTTP image → click Save → file dialog opens → save → file lands at chosen path → state.filePath updates to that path; state.url is cleared. On NEXT restart, the image opens from the local file (via FileProvider pipe).
11. **`copyImageToClipboard`:** open any image → click Copy (or press Ctrl+C while focused) → clipboard contains PNG. Paste into another app (e.g., Paint) to verify.
12. **`openInDrawingEditor`:** open any image → click "Open in Drawing Editor" → new Excalidraw page opens with the image embedded; original image page remains open.

**Backwards-compat verification (2 tests):**

13. **Existing pre-US-569 session restores correctly.** Have a user `openFiles0.json` with Image descriptors saved via the LegacyEditorAdapter path (pre-US-569). Post-update, Image restores as v4 `ImageEditor` (the editorId is already `"image-view"` because `deriveEditorId({type:"imageFile"})` returns it; the new `V4_NO_HOST_EDITOR_IDS` set catches it).
14. **Concurrent v4 + truly-legacy editors restore correctly.** Have an `openFiles0.json` with: 1 Image page (now v4-native post-US-569), 1 Archive page (still truly-legacy, pre-US-570), 1 PDF page (v4-native post-US-568). All three restore: Image and PDF via the generic v4-native no-host branch; Archive via the legacy fallback with `LegacyEditorAdapter` wrap. No regression for Archive.

### Phase 3 — Dashboard update

Mark US-569 with the verified note pattern in `doc/active-work.md`. Task stays unchecked (`[ ]`) per epic-task deferred-review model — `/review`, `/document`, `/userdoc` runs at EPIC-028 close.

---

## Files Changed

| File | Action | Why |
|------|--------|-----|
| `src/renderer/editors/image/ImageEditor.ts` | Create | v4 native class + state interface + defaults |
| `src/renderer/editors/image/ImageView.tsx` | Create (rename from `ImageViewer.tsx`) | View component + preserved legacy `imageEditorModule` for the LegacyEditorAdapter safety-net path AND the `openImageInNewTab` flow |
| `src/renderer/editors/image/index.tsx` | Create | v4 `imageModule` EditorModule + compatibility aliases |
| `src/renderer/editors/image/ImageViewer.tsx` | Delete (renamed to `ImageView.tsx`) | Class extracted to `ImageEditor.ts`; module extracted to `index.tsx`; view stays under new filename |
| `src/renderer/editors/image/index.ts` | Delete | Folded into `index.tsx` |
| `src/renderer/editors/register-editors.ts` | Modify | Legacy block: `loadModule` loads `./image/ImageView` (renamed). New v4 block: registers `image-view` in v4 registry with `imageModule`. |
| `src/renderer/api/pages/PagesPersistenceModel.ts` | Modify | Add `"image-view"` line to `V4_NO_HOST_EDITOR_IDS` set; trim the JSDoc comment that listed it above |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | Modify | `openImageInNewTab` import path: `editors/image/ImageViewer` → `editors/image` (folder). No other changes — US-568 PD-IMPL16's `wrapLegacyForPage` early-return already covers Image. |
| `doc/active-work.md` | Modify | Promote US-569 entry to linked task form with comprehensive scope description |
| `doc/tasks/US-569-image-editor-migration/README.md` | Create | This task document |

**Total:** 4 created, 4 modified, 2 deleted. **Two new source files** (`ImageEditor.ts` + `index.tsx`); one rename (`ImageViewer.tsx` → `ImageView.tsx`); one delete (`index.ts`). Two single-line edits in cross-cutting infrastructure files (Persistence + Lifecycle).

## Files NOT changing

- `src/renderer/editors/shared/BaseImageView.tsx` — shared zoom/pan view; props (`src`, `alt`, `ref`) unchanged.
- `src/renderer/editors/draw/drawExport.ts` — `buildExcalidrawJsonWithImage`, `getImageDimensions`, `extToMime` consumed by `openInDrawingEditor` — unchanged.
- `src/renderer/editors/base/v4/EditorModel.ts` — base class unchanged.
- `src/renderer/editors/base/v4/PageToolbar.tsx` — `rightContributions` slot already exists from US-549 — no changes needed.
- `src/renderer/api/mcp-handler.ts:160` — MCP `create_page` rejection message unchanged (IM-IMPL21).
- `src/renderer/api/pages/PagesPersistenceModel.ts` (the rest) — generic v4-native no-host restore branch (PD-IMPL11) already in place from US-568; only the set membership grows.
- `src/renderer/api/pages/PagesLifecycleModel.ts` (the rest) — `wrapLegacyForPage` early-return (PD-IMPL16) already in place from US-568; the only edit is the `openImageInNewTab` import path.
- All 7 callers of `pagesModel.openImageInNewTab(url)` (Draw / DrawView / PinnedLinksPanel / LinkItemTiles / LinkItemList / BrowserWebviewModel / ResponseViewer) — they call through `pagesModel`, not the image folder directly.
- `src/shared/types.ts` — `EditorType` / `EditorView` unions still include `imageFile` / `image-view` (per S10 carve-out — type discriminators retained during the strangler period).
- `src/renderer/content/resolvers.ts` — image extension routing unchanged.
- `src/main/*` — Image is a renderer-only concern; main-process I/O handlers unchanged.
- `doc/architecture/*` — document update deferred to EPIC-028 `/document` pass at close.
- `doc/tasks/completed.md` — task moves here only when EPIC-028 closes (deferred-review model).

---

## Cross-task notes

- **No walkthrough amendment required.** Walkthrough 30 closure (`30-no-host-group.md:1238`) explicitly defers Image for first-principles investigation — this task's IM-IMPL concerns ARE the investigation. No mockup change.
- **US-569 is the second consumer of US-568's cross-cutting infrastructure.** PD-IMPL11 (the `V4_NO_HOST_EDITOR_IDS` set) and PD-IMPL16 (`wrapLegacyForPage` early-return) were designed to scale to every subsequent no-host migration. US-569 exercises them with a one-line opt-in (Step 5) and a single import-path patch (Step 6). Each remaining no-host migration (US-571 Video, US-572 Settings, US-573 About, US-574 MCP Inspector, US-575 Storybook, US-576 Category) follows the same pattern.
- **US-569 introduces no new cross-cutting infrastructure.** Pure per-editor migration. The infrastructure work landed in US-568.
- **US-559 path remains as US-568 described it.** Post-US-569, the only producers of `LegacyEditorAdapter` instances are:
  1. `restorePage` legacy fallback for truly-legacy editorIds (Archive pre-US-570, Video pre-US-571, Settings pre-US-572, About pre-US-573, MCP pre-US-574, Storybook pre-US-575, Category pre-US-576).
  2. `wrapLegacyForPage` final fallback for the same truly-legacy editors (file-open).
  3. `restoreSidebarLegacy` for v3 sidebar restore.
  4. `BrowserWebviewModel.ts` (5 sites — wrap legacy editors received via browser navigation events).
- **`/review` / `/document` / `/userdoc` deferred** to EPIC-028 close per epic-task workflow.
- **No follow-up task spawned by US-569** — all Image concerns resolve in-task.

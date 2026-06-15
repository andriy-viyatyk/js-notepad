import { TComponentState } from "../../core/state/state";
import {
    EditorModel,
    type EditorStateBase,
    type RestoreData,
} from "../base/EditorModel";
import { CONTENT_HOST_TRAIT, type IContentHostTrait } from "../base/editor-traits";
import type { IContentHost } from "../base/IContentHost";
import { ComponentQueue } from "../../core/state/ComponentQueue";
import type { EditorDescriptor, HostDescriptor } from "../../../shared/persistence";
import type { IContentPipe } from "../../api/types/io.pipe";
import type { IPageHost } from "../../api/pages/IPageHost";
import { TextFileModel, newTextFileModel } from "../text/TextEditorModel";
import { editorRegistry } from "../base/editorRegistry";
import { fpBasename } from "../../core/utils/file-path";
import { ui } from "../../api/ui";
import { pagesModel } from "../../api/pages";
import { api } from "../../../ipc/renderer/api";
import { blobToDataUrl } from "../shared/image-export";
import type { IImageExport } from "../base/IImageExport";

export type HtmlQueueEvent = { type: "focus" };

export type HtmlQueueRequest = never;

export interface HtmlEditorState extends EditorStateBase {
    /** Transient — a PNG capture is in flight (disables the image-export toolbar
     *  buttons). Not persisted. */
    capturing?: boolean;
}

export const defaultHtmlEditorState: HtmlEditorState = {
    id: "",
    title: "",
    modified: false,
    secondaryView: undefined,
};

function isLegacyTextFileHost(host: unknown): host is TextFileModel {
    return (host as { type?: string } | null)?.type === "textFile";
}

export class HtmlEditor extends EditorModel<HtmlEditorState, void, HtmlQueueEvent> implements IImageExport {
    readonly editorId = "html-view";

    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _pendingHost: HostDescriptor | undefined = undefined;
    /** The live preview iframe, reported by the view; used to capture its
     *  on-screen region. Transient — cleared on unmount (HC1). */
    private _captureEl: HTMLIFrameElement | null = null;

    readonly typedQueue: ComponentQueue<HtmlQueueEvent, HtmlQueueRequest>;

    constructor(state: TComponentState<HtmlEditorState>) {
        super(state);
        this.typedQueue = this.queue as unknown as ComponentQueue<
            HtmlQueueEvent,
            HtmlQueueRequest
        >;

        const trait: IContentHostTrait = {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) throw new Error("Host already extracted from HtmlEditor");
                this._hostStateUnsub?.();
                this._hostStateUnsub = null;
                this._host = null;
                return host as unknown as IContentHost;
            },
        };
        this.traits.add(CONTENT_HOST_TRAIT, trait);
    }

    // ── Host accessors ──────────────────────────────────────────────────

    get contentHost(): IContentHost | null {
        return (this._host as unknown as IContentHost) ?? null;
    }

    /** Typed host accessor for body + facade consumption (avoids the
     *  `IContentHost`→`TextFileModel` cast at every read site). MK4 pattern
     * . */
    get host(): TextFileModel | null {
        return this._host;
    }

    findCompatibleEditors(): string[] {
        if (!this._host) return [];
        return editorRegistry.findEditorsAccepting(this._host as unknown as IContentHost);
    }

    getNavigatorTarget(): { pipe?: IContentPipe | null; filePath?: string | null } | null {
        if (!this._host) return null;
        const { filePath } = this._host.state.get();
        const pipe = this._host.pipe;
        if (!pipe && !filePath) return {};
        return { pipe, filePath };
    }

    focus(): void {
        this.typedQueue.send({ type: "focus" });
    }

    // ── Image export (IImageExport) ─────────────────────────────────────

    /** Called by the view to (un)register the live preview iframe. */
    setCaptureElement(el: HTMLIFrameElement | null): void {
        this._captureEl = el;
    }

    /** Capture the rendered page exactly as shown on screen (WYSIWYG) as a PNG.
     *  Goes through `webContents.capturePage` in main — works through the
     *  sandboxed `srcDoc` iframe because it is a composited-pixel grab.
     *
     *  DEVIATION from the headless `IImageExport` contract: unlike Mermaid/SVG/Image
     *  (which rasterise from model data), this capture is the *live on-screen* iframe,
     *  so it requires a mounted, visible view and throws if `_captureEl` is null. This
     *  is intentional — the feature's whole point is to capture what the user sees. The
     *  toolbar actions are only reachable while the page is visible, so this holds in
     *  practice; a background-tab script call to `exportPng()` will reject.
     *  @throws if the preview iframe is not mounted / has no visible area. */
    async exportPng(): Promise<Blob> {
        const el = this._captureEl;
        if (!el) throw new Error("HTML preview is not mounted");
        const r = el.getBoundingClientRect();
        const rect = {
            x: Math.round(r.left),
            y: Math.round(r.top),
            width: Math.round(r.width),
            height: Math.round(r.height),
        };
        if (rect.width <= 0 || rect.height <= 0) {
            throw new Error("HTML preview has no visible area to capture");
        }
        const bytes = await api.capturePageRegion(rect);
        return new Blob([new Uint8Array(bytes)], { type: "image/png" });
    }

    suggestedImageName(): string {
        const s = this._host?.state.get();
        const base = s?.filePath ? fpBasename(s.filePath) : s?.title || "page";
        return base.replace(/\.html?$/i, "") || "page";
    }

    /** Run an export-derived action with a transient `capturing` guard + error toast. */
    private async withCapture(action: (blob: Blob) => Promise<void> | void, failMessage: string): Promise<void> {
        if (this.state.get().capturing) return;
        this.state.update((s) => {
            s.capturing = true;
        });
        try {
            await action(await this.exportPng());
        } catch (err) {
            ui.notify(`${failMessage}: ${(err as Error).message}`, "error");
        } finally {
            this.state.update((s) => {
                s.capturing = false;
            });
        }
    }

    /** Copy the rendered page to the clipboard as a PNG. */
    copyImageToClipboard(): Promise<void> {
        return this.withCapture(async (blob) => {
            await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
            ui.notify("Image copied to clipboard", "success");
        }, "Failed to copy image");
    }

    /** Open the captured PNG in the Image viewer (new page). */
    openInImageView(): Promise<void> {
        return this.withCapture((blob) => {
            pagesModel.openImageInNewTab(URL.createObjectURL(blob));
        }, "Failed to open image");
    }

    /** Open the captured PNG in the Draw editor (Excalidraw) for editing (new page). */
    editImage(): Promise<void> {
        return this.withCapture(async (blob) => {
            const dataUrl = await blobToDataUrl(blob);
            await pagesModel.addDrawPage(dataUrl, `${this.suggestedImageName()}.excalidraw`);
        }, "Failed to open image for editing");
    }

    // ── Persistence ─────────────────────────────────────────────────────

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        // Identity-only descriptor (PV7 — no editor-specific state to persist).
        return {
            editorId: this.editorId,
            id: s.id,
            state: {
                title: s.title,
                modified: s.modified,
                secondaryView: s.secondaryView,
            } as Record<string, unknown>,
            host: this._host?.getDescriptor(),
        };
    }

    applyRestoreData(data: RestoreData<HtmlEditorState>): void {
        this.state.update((cur) => {
            if (data.title !== undefined) cur.title = data.title;
            if (data.modified !== undefined) cur.modified = data.modified;
            if (data.secondaryView !== undefined) cur.secondaryView = data.secondaryView;
        });
        if (data.host) this._pendingHost = data.host;
    }

    // ── Three-phase lifecycle ──────────────────────────────────────────

    switchFrom(oldEditor: EditorModel): void {
        const trait = oldEditor.traits.get(CONTENT_HOST_TRAIT);
        if (!trait) {
            throw new Error(
                `HtmlEditor.switchFrom: ${oldEditor.editorId} has no CONTENT_HOST_TRAIT`,
            );
        }
        const host = trait.extractContentHost() as unknown as TextFileModel;
        if (!isLegacyTextFileHost(host)) {
            throw new Error("HtmlEditor.switchFrom: extracted host is not a TextFileModel");
        }
        // Preserve cache-file id across the swap (C9).
        this.state.update((s) => {
            s.id = oldEditor.id;
        });
        // Tag the host with the target editor id so submodels keep their assumptions.
        host.state.update((s) => {
            s.editor = this.editorId;
        });
        this.adoptHost(host);
    }

    async restore(): Promise<void> {
        try {
            if (!this._host) {
                this._host = this._pendingHost
                    ? await TextFileModel.fromDescriptor(this._pendingHost)
                    : newTextFileModel("");
            }
            if (!this._host.state.get().restored) {
                await this._host.restore();
            }
            this.adoptHost(this._host);
        } catch (err) {
            ui.notify((err as Error).message || "Failed to restore HTML editor.", "error");
            this._host = newTextFileModel("");
            this.adoptHost(this._host);
        }
        this._pendingHost = undefined;
    }

    /** Adopt a host without going through `switchFrom`. Used by
     *  `attachEditorToPage` when constructing a fresh HtmlEditor over a
     *  freshly-restored legacy TextFileModel. */
    adoptHost(host: TextFileModel): void {
        this._host = host;
        this._hostStateUnsub?.();

        // Forward host metadata changes to descriptorChanged (P3 debounce).
        this._hostStateUnsub = host.state.subscribe(() =>
            this.descriptorChanged.send(undefined),
        );

        // No host-content subscription needed — the body reads
        // `host.state.use((s) => s.content)` directly; the iframe
        // re-renders on every srcDoc prop change.

        const { filePath, title } = host.state.get();
        this.state.update((s) => {
            s.title = title || (filePath ? fpBasename(filePath) : s.title || "untitled");
            if (host.state.get().id) s.id = host.state.get().id;
        });
        host.state.update((s) => {
            if (s.editor !== this.editorId) s.editor = this.editorId;
        });
        if (this.page) host.setPage(this.page);
    }

    setPage(page: IPageHost | null): void {
        super.setPage(page);
        this._host?.setPage(page);
    }

    // ── Save / release / dispose ────────────────────────────────────────

    async confirmRelease(closing?: boolean): Promise<boolean> {
        return this._host ? this._host.confirmRelease(closing) : true;
    }

    async saveState(): Promise<void> {
        await this._host?.io.saveState();
    }

    async dispose(): Promise<void> {
        this._hostStateUnsub?.();
        this._hostStateUnsub = null;
        this._captureEl = null;
        if (this._host) {
            await this._host.dispose();
            this._host = null;
        }
        await super.dispose();
    }
}

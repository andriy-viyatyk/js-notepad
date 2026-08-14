import { TComponentState } from "../../core/state/state";
import type { EditorStateBase } from "../base/EditorModel";
import { TextHostEditorModel } from "../base/TextHostEditorModel";
import { ComponentQueue } from "../../core/state/ComponentQueue";
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

export class HtmlEditor extends TextHostEditorModel<HtmlEditorState, void, HtmlQueueEvent>
    implements IImageExport {
    readonly editorId = "html-view";
    protected readonly displayName = "HTML";

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
    }

    focus(): void {
        this.typedQueue.send({ type: "focus" });
    }

    // No host-content subscription needed — the body reads
    // `host.state.use((s) => s.content)` directly; the iframe
    // re-renders on every srcDoc prop change.

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

    // ── Dispose ─────────────────────────────────────────────────────────

    async dispose(): Promise<void> {
        this._captureEl = null;
        await super.dispose();
    }
}

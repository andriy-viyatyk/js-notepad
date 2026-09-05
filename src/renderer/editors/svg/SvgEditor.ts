import { TComponentState } from "../../core/state/state";
import type { EditorStateBase } from "../base/EditorModel";
import { TextHostEditorModel } from "../base/TextHostEditorModel";
import { ComponentQueue } from "../../core/state/ComponentQueue";
import type { IImageExport } from "../base/IImageExport";
import { rasterToPngBlob } from "../shared/image-export";
import { pagesModel } from "../../api/pages";
import { buildExcalidrawJsonWithImage, getImageDimensions } from "../draw/drawExport";
import { errMessage } from "../../../shared/utils";

export type SvgQueueEvent = { type: "focus" };

export type SvgQueueRequest = never;

export type SvgEditorState = EditorStateBase;

export const defaultSvgEditorState: SvgEditorState = {
    id: "",
    title: "",
    modified: false,
    secondaryView: undefined,
};

export class SvgEditor extends TextHostEditorModel<SvgEditorState, void, SvgQueueEvent>
    implements IImageExport {
    readonly editorId = "svg-view";
    protected readonly displayName = "SVG";

    readonly typedQueue: ComponentQueue<SvgQueueEvent, SvgQueueRequest>;

    constructor(state: TComponentState<SvgEditorState>) {
        super(state);
        this.typedQueue = this.queue as unknown as ComponentQueue<
            SvgQueueEvent,
            SvgQueueRequest
        >;
    }

    focus(): void {
        this.typedQueue.send({ type: "focus" });
    }

    // No host-content subscription needed — the body reads
    // `host.state.use((s) => s.content)` directly; BaseImageView
    // re-renders on every src prop change (data URL recomputed inline).

    // ── Image export (IImageExport) ─────────────────────────────────────

    /** Rasterise the SVG to a PNG blob. Builds the same `image/svg+xml` data
     *  URL the body renders, then draws it to a canvas. */
    async exportPng(): Promise<Blob> {
        const content = this.requireSource("export PNG");
        try {
            return await rasterToPngBlob(`data:image/svg+xml,${encodeURIComponent(content)}`);
        } catch (error) {
            throw new Error(`SVG preview cannot export PNG because rasterisation failed: ${errMessage(error)}`);
        }
    }

    suggestedImageName(): string {
        return (this.state.get().title || "image").replace(/\.\w+$/, "");
    }

    async openInDrawingEditor(): Promise<void> {
        const content = this.requireSource("open in Drawing Editor");
        try {
            const dataUrl = `data:image/svg+xml;base64,${Buffer.from(content, "utf-8").toString("base64")}`;
            const dims = await getImageDimensions(dataUrl);
            const json = buildExcalidrawJsonWithImage(dataUrl, "image/svg+xml", dims.width, dims.height);
            const title = (this.host?.state.get().title || "SVG").replace(/\.svg$/i, "") + ".excalidraw";
            pagesModel.addEditorPage("draw-view", "json", title, json);
        } catch (error) {
            throw new Error(`SVG preview cannot open in Drawing Editor: ${errMessage(error)}`);
        }
    }

    async copyImageToClipboard(): Promise<void> {
        try {
            const blob = await this.exportPng();
            await navigator.clipboard.write([
                new ClipboardItem({ "image/png": blob }),
            ]);
        } catch (error) {
            throw new Error(`SVG preview cannot copy an image: ${errMessage(error)}`);
        }
    }

    private requireSource(action: string): string {
        const content = this.host?.state.get().content;
        if (!content?.trim()) {
            throw new Error(`SVG preview cannot ${action} because the source is empty or unavailable.`);
        }
        return content;
    }
}

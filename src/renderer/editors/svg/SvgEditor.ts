import { TComponentState } from "../../core/state/state";
import type { EditorStateBase } from "../base/EditorModel";
import { TextHostEditorModel } from "../base/TextHostEditorModel";
import { ComponentQueue } from "../../core/state/ComponentQueue";
import type { IImageExport } from "../base/IImageExport";
import { rasterToPngBlob } from "../shared/image-export";

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
        const content = this._host?.state.get().content ?? "";
        return rasterToPngBlob(`data:image/svg+xml,${encodeURIComponent(content)}`);
    }

    suggestedImageName(): string {
        return (this.state.get().title || "image").replace(/\.\w+$/, "");
    }
}

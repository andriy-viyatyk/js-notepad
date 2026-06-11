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

function isLegacyTextFileHost(host: unknown): host is TextFileModel {
    return (host as { type?: string } | null)?.type === "textFile";
}

export class SvgEditor extends EditorModel<SvgEditorState, void, SvgQueueEvent>
    implements IImageExport {
    readonly editorId = "svg-view";

    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _pendingHost: HostDescriptor | undefined = undefined;

    readonly typedQueue: ComponentQueue<SvgQueueEvent, SvgQueueRequest>;

    constructor(state: TComponentState<SvgEditorState>) {
        super(state);
        this.typedQueue = this.queue as unknown as ComponentQueue<
            SvgQueueEvent,
            SvgQueueRequest
        >;

        const trait: IContentHostTrait = {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) throw new Error("Host already extracted from SvgEditor");
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

    /** Typed host accessor for body + facade + toolbar consumption (avoids
     *  the `IContentHost`→`TextFileModel` cast at every read site). MK4 pattern
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

    applyRestoreData(data: RestoreData<SvgEditorState>): void {
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
                `SvgEditor.switchFrom: ${oldEditor.editorId} has no CONTENT_HOST_TRAIT`,
            );
        }
        const host = trait.extractContentHost() as unknown as TextFileModel;
        if (!isLegacyTextFileHost(host)) {
            throw new Error("SvgEditor.switchFrom: extracted host is not a TextFileModel");
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
            ui.notify((err as Error).message || "Failed to restore SVG editor.", "error");
            this._host = newTextFileModel("");
            this.adoptHost(this._host);
        }
        this._pendingHost = undefined;
    }

    /** Adopt a host without going through `switchFrom`. Used by
     *  `attachEditorToPage` when constructing a fresh SvgEditor over a
     *  freshly-restored legacy TextFileModel. */
    adoptHost(host: TextFileModel): void {
        this._host = host;
        this._hostStateUnsub?.();

        // Forward host metadata changes to descriptorChanged (P3 debounce).
        this._hostStateUnsub = host.state.subscribe(() =>
            this.descriptorChanged.send(undefined),
        );

        // No host-content subscription needed — the body reads
        // `host.state.use((s) => s.content)` directly; BaseImageView
        // re-renders on every src prop change (data URL recomputed inline).

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
        if (this._host) {
            await this._host.dispose();
            this._host = null;
        }
        await super.dispose();
    }
}

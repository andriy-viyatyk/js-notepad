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
import { isCurrentThemeDark } from "../../theme/themes";
import { serializeAsJSON, FONT_FAMILY } from "@excalidraw/excalidraw";
import type {
    ExcalidrawImperativeAPI,
    AppState,
    BinaryFiles,
} from "@excalidraw/excalidraw/dist/types/excalidraw/types";
import type {
    OrderedExcalidrawElement,
    ExcalidrawElement,
} from "@excalidraw/excalidraw/dist/types/excalidraw/element/types";

export type DrawQueueEvent = { type: "focus" };
export type DrawQueueRequest = never;

interface DrawViewSettings {
    darkMode?: boolean;
}

export interface DrawEditorState extends EditorStateBase {
    // HS1 — rides host.editorSettings["draw-view"]. Bounded boolean.
    // Default seeded from isCurrentThemeDark() in the constructor.
    darkMode: boolean;
    // View-derived — present on state for in-session reactivity, stripped
    // from getRestoreData per PV7 / MO5. Recomputed on every parse.
    error: string | null;
    loading: boolean;
}

export const defaultDrawEditorState: DrawEditorState = {
    id: "",
    title: "",
    modified: false,
    secondaryView: undefined,
    darkMode: true,
    error: null,
    loading: true,
};

function isLegacyTextFileHost(host: unknown): host is TextFileModel {
    return (host as { type?: string } | null)?.type === "textFile";
}

export class DrawEditor extends EditorModel<DrawEditorState, void, DrawQueueEvent> {
    readonly editorId = "draw-view";

    // ── Payload fields (relocated from legacy DrawViewModel) ────────────
    private _elements: readonly OrderedExcalidrawElement[] = [];
    private _appState: Partial<AppState> = {};
    private _files: BinaryFiles = {};
    /** DR7 — prevents feedback loop when we push serialized content back to host. */
    private _skipNextContentUpdate = false;
    /** Fingerprint of elements + files for change detection (avoids dirty on scroll/select). */
    private _lastFingerprint = "";
    /** DR3 — live Excalidraw API ref; set by DrawBody on mount, cleared on unmount. */
    private _excalidrawApi: ExcalidrawImperativeAPI | null = null;

    // ── Host adoption state ─────────────────────────────────────────────
    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _hostContentUnsub: (() => void) | null = null;
    private _settingsUnsub: (() => void) | null = null;
    private _pendingHost: HostDescriptor | undefined = undefined;

    readonly typedQueue: ComponentQueue<DrawQueueEvent, DrawQueueRequest>;

    constructor(state: TComponentState<DrawEditorState>) {
        super(state);
        this.typedQueue = this.queue as unknown as ComponentQueue<
            DrawQueueEvent,
            DrawQueueRequest
        >;

        // DR4 — seed darkMode from theme on first construct. HS1 slot read
        // in adoptHost overrides this if the user previously toggled.
        this.state.update((s) => {
            s.darkMode = isCurrentThemeDark();
        });

        const trait: IContentHostTrait = {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) throw new Error("Host already extracted from DrawEditor");
                this._tearDownHostSubscriptions();
                this._host = null;
                return host as unknown as IContentHost;
            },
        };
        this.traits.add(CONTENT_HOST_TRAIT, trait);
    }

    private _tearDownHostSubscriptions(): void {
        this._hostStateUnsub?.();
        this._hostContentUnsub?.();
        this._settingsUnsub?.();
        this._hostStateUnsub = null;
        this._hostContentUnsub = null;
        this._settingsUnsub = null;
    }

    // ── Host accessors ──────────────────────────────────────────────────

    get contentHost(): IContentHost | null {
        return (this._host as unknown as IContentHost) ?? null;
    }

    /** Typed host accessor for body + toolbar consumption (MK4 pattern from
     *  mirrors Svg/Html/Markdown/Mermaid/Graph). */
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
        // Identity-only descriptor. darkMode rides host.editorSettings["draw-view"]
        //. loading/error stripped per PV7 / MO5.
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

    applyRestoreData(data: RestoreData<DrawEditorState>): void {
        this.state.update((cur) => {
            if (data.title !== undefined) cur.title = data.title;
            if (data.modified !== undefined) cur.modified = data.modified;
            if (data.secondaryView !== undefined) cur.secondaryView = data.secondaryView;
        });
        // darkMode is NOT carried via descriptor — read from host.editorSettings
        // in adoptHost. View-derived state re-derived by initial parse.
        if (data.host) this._pendingHost = data.host;
    }

    // ── Three-phase lifecycle ──────────────────────────────────────────

    switchFrom(oldEditor: EditorModel): void {
        const trait = oldEditor.traits.get(CONTENT_HOST_TRAIT);
        if (!trait) {
            throw new Error(
                `DrawEditor.switchFrom: ${oldEditor.editorId} has no CONTENT_HOST_TRAIT`,
            );
        }
        const host = trait.extractContentHost() as unknown as TextFileModel;
        if (!isLegacyTextFileHost(host)) {
            throw new Error("DrawEditor.switchFrom: extracted host is not a TextFileModel");
        }
        // Preserve cache-file id across the swap (C9).
        this.state.update((s) => {
            s.id = oldEditor.id;
        });
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
            ui.notify((err as Error).message || "Failed to restore Drawing editor.", "error");
            this._host = newTextFileModel("");
            this.adoptHost(this._host);
        }
        this._pendingHost = undefined;
    }

    /** Adopt a host without going through `switchFrom`. Used by
     *  `attachEditorToPage` when constructing a fresh DrawEditor over a
     *  freshly-restored legacy TextFileModel. */
    adoptHost(host: TextFileModel): void {
        this._host = host;
        this._tearDownHostSubscriptions();

        // Forward host metadata changes to descriptorChanged (P3 debounce).
        this._hostStateUnsub = host.state.subscribe(() =>
            this.descriptorChanged.send(undefined),
        );

        // HS1 — seed `darkMode` from host slot. If absent, retain the
        // theme-derived default set in constructor.
        const saved = host.getEditorState<DrawViewSettings>(this.editorId);
        if (saved?.darkMode !== undefined) {
            this.state.update((s) => {
                s.darkMode = saved.darkMode;
            });
        }

        // HS1 — mirror `darkMode` changes back to host slot. Slice-subscribe
        // keeps the mirror from firing on loading/error mutations.
        this._settingsUnsub = this.state.subscribe(
            (darkMode) => {
                if (!this._host) return;
                this._host.setEditorState<DrawViewSettings>(this.editorId, {
                    darkMode: darkMode as boolean,
                });
            },
            (s) => s.darkMode,
        );

        // Content changes retrigger parse. DR7 — skipNextContentUpdate guard
        // prevents the loop from our own updateFromExcalidraw writes.
        this._hostContentUnsub = host.state.subscribe(
            () => {
                if (this._skipNextContentUpdate) {
                    this._skipNextContentUpdate = false;
                    return;
                }
                this.parseContent(this._host?.state.get().content ?? "");
            },
            (s) => s.content,
        );

        const { filePath, title } = host.state.get();
        this.state.update((s) => {
            s.title = title || (filePath ? fpBasename(filePath) : s.title || "untitled");
            if (host.state.get().id) s.id = host.state.get().id;
        });
        host.state.update((s) => {
            if (s.editor !== this.editorId) s.editor = this.editorId;
        });
        if (this.page) host.setPage(this.page);

        // DR6 — initial parse against the freshly-adopted host (mirrors
        // today's DrawViewModel.onInit's final parseContent call).
        this.parseContent(host.state.get().content);
    }

    setPage(page: IPageHost | null): void {
        super.setPage(page);
        this._host?.setPage(page);
    }

    // ── Parse pipeline (relocated verbatim from DrawViewModel) ──────────

    private parseContent(content: string): void {
        try {
            if (!content || content.trim() === "") {
                this._elements = [];
                this._appState = { currentItemFontFamily: FONT_FAMILY.Helvetica };
                this._files = {};
            } else {
                const data = JSON.parse(content);
                this._elements = data.elements || [];
                this._appState = data.appState || {};
                this._files = data.files || {};
            }
            this._lastFingerprint = this.computeFingerprint(this._elements, this._files);
            this.state.update((s) => { s.loading = false; s.error = null; });
        } catch (e) {
            this.state.update((s) => { s.loading = false; s.error = (e as Error).message; });
        }
    }

    /**
     * DR7 — Called from DrawBody when Excalidraw content changes (already
     * debounced in the view). Only pushes content to host when elements or
     * files actually change, ignoring appState-only changes (scroll, zoom,
     * cursor, selection).
     */
    updateFromExcalidraw(
        elements: readonly OrderedExcalidrawElement[],
        appState: AppState,
        files: BinaryFiles,
    ): void {
        this._appState = appState;
        const fingerprint = this.computeFingerprint(elements, files);
        if (fingerprint === this._lastFingerprint) return;
        this._lastFingerprint = fingerprint;
        this._elements = [...elements];
        this._files = files;
        this._skipNextContentUpdate = true;
        const json = serializeAsJSON(elements, appState, files, "local");
        this._host?.changeContent(json, true);
    }

    /** Fast fingerprint of elements + files to detect real content changes. */
    private computeFingerprint(
        elements: readonly ExcalidrawElement[],
        files: BinaryFiles,
    ): string {
        const elPart = elements.map(
            (e) => `${e.id}:${e.version ?? 0}:${e.versionNonce ?? 0}`,
        ).join(";");
        const fileKeys = files ? Object.keys(files).sort().join(",") : "";
        return `${elPart}|${fileKeys}`;
    }

    // ── State mutators (relocated verbatim from DrawViewModel) ──────────

    toggleDarkMode = (): void => {
        this.state.update((s) => { s.darkMode = !s.darkMode; });
        // The slice-subscribe on `s.darkMode` (set up in adoptHost) fires
        // automatically and writes to the HS1 host slot.
    };

    // ── Public accessors (relocated verbatim) ───────────────────────────

    get elements(): readonly OrderedExcalidrawElement[] { return this._elements; }
    get appState(): Partial<AppState> { return this._appState; }
    get files(): BinaryFiles { return this._files; }
    get excalidrawApi(): ExcalidrawImperativeAPI | null { return this._excalidrawApi; }

    setExcalidrawApi(api: ExcalidrawImperativeAPI): void {
        this._excalidrawApi = api;
    }

    clearExcalidrawApi(): void {
        this._excalidrawApi = null;
    }

    // ── Save / release / dispose ────────────────────────────────────────

    async confirmRelease(closing?: boolean): Promise<boolean> {
        return this._host ? this._host.confirmRelease(closing) : true;
    }

    async saveState(): Promise<void> {
        await this._host?.io.saveState();
    }

    async dispose(): Promise<void> {
        this._tearDownHostSubscriptions();
        this._excalidrawApi = null;
        if (this._host) {
            await this._host.dispose();
            this._host = null;
        }
        await super.dispose();
    }
}

import { TComponentState } from "../../core/state/state";
import { type EditorStateBase } from "../base/EditorModel";
import { TextHostEditorModel } from "../base/TextHostEditorModel";
import { ComponentQueue } from "../../core/state/ComponentQueue";
import { TextFileModel } from "../text/TextEditorModel";
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
import { errMessage } from "../../../shared/utils";

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

export class DrawEditor extends TextHostEditorModel<DrawEditorState, void, DrawQueueEvent> {
    readonly editorId = "draw-view";
    protected readonly displayName = "Drawing";

    // ── Payload fields (relocated from legacy DrawViewModel) ────────────
    private _elements: readonly OrderedExcalidrawElement[] = [];
    private _appState: Partial<AppState> = {};
    private _files: BinaryFiles = {};
    /** Fingerprint of elements + files for change detection (avoids dirty on scroll/select). */
    private _lastFingerprint = "";
    /** DR3 — live Excalidraw API ref; set by DrawBody on mount, cleared on unmount. */
    private _excalidrawApi: ExcalidrawImperativeAPI | null = null;

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
    }

    focus(): void {
        this.typedQueue.send({ type: "focus" });
    }

    // ── Host adoption ───────────────────────────────────────────────────

    adoptHost(host: TextFileModel): void {
        super.adoptHost(host);

        // HS1 — seed `darkMode` from host slot. If absent, retain the
        // theme-derived default set in constructor. Mirror changes back to
        // the host slot. Slice-subscribe keeps the mirror from firing on
        // loading/error mutations.
        this.mirrorHostSettings<DrawViewSettings>(
            (saved) => {
                if (saved.darkMode !== undefined) {
                    this.state.update((s) => {
                        s.darkMode = saved.darkMode;
                    });
                }
            },
            (s) => ({ darkMode: s.darkMode }),
            (s) => s.darkMode,
        );

        // Content changes retrigger parse (own updateFromExcalidraw writes
        // are skipped by the base's echo guard).
        this.subscribeHostContent(() =>
            this.parseContent(this._host?.state.get().content ?? ""),
        );

        // DR6 — initial parse against the freshly-adopted host (mirrors
        // today's DrawViewModel.onInit's final parseContent call).
        this.parseContent(host.state.get().content);
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
            this.state.update((s) => { s.loading = false; s.error = errMessage(e); });
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
        const json = serializeAsJSON(elements, appState, files, "local");
        this.writeToHost(json, true);
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

    // ── Dispose ─────────────────────────────────────────────────────────

    async dispose(): Promise<void> {
        this._excalidrawApi = null;
        await super.dispose();
    }
}

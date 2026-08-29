import { TComponentState } from "../../core/state/state";
import type { EditorStateBase } from "../base/EditorModel";
import { TextHostEditorModel } from "../base/TextHostEditorModel";
import { ComponentQueue } from "../../core/state/ComponentQueue";
import { TextFileModel } from "../text/TextEditorModel";
import { themeState } from "../../theme/theme-state";
import { renderMermaid } from "./render-mermaid";
import type { IImageExport } from "../base/IImageExport";
import { rasterToPngBlob } from "../shared/image-export";

export type MermaidQueueEvent = { type: "focus" };

export type MermaidQueueRequest = never;

/**
 * HS1 host-slot shape — `lightMode` rides `host.editorSettings["mermaid-view"]`
 * so it survives Mermaid↔Monaco switches AND app restarts (PV6 HS1 amendment
 * 2026-05-21). Identical mechanism to Markdown's `compactMode`.
 */
interface MermaidViewSettings {
    lightMode?: boolean;
}

export interface MermaidEditorState extends EditorStateBase {
    // HS1 — rides host.editorSettings["mermaid-view"]. Bounded boolean.
    // Default seeded from the active theme in the constructor.
    lightMode: boolean;
    // View-derived — present on state for in-session reactivity, stripped
    // from getRestoreData per PV5 / MO5 pattern. Recomputed on every render.
    svgUrl: string;
    error: string;
    loading: boolean;
}

export const defaultMermaidEditorState: MermaidEditorState = {
    id: "",
    title: "",
    modified: false,
    secondaryView: undefined,
    lightMode: false,
    svgUrl: "",
    error: "",
    loading: true,
};

export class MermaidEditor
    extends TextHostEditorModel<MermaidEditorState, void, MermaidQueueEvent>
    implements IImageExport {
    readonly editorId = "mermaid-view";
    protected readonly displayName = "Mermaid";

    private _renderTimer: ReturnType<typeof setTimeout> | undefined;
    private _syncingTheme = false;

    readonly typedQueue: ComponentQueue<MermaidQueueEvent, MermaidQueueRequest>;

    constructor(state: TComponentState<MermaidEditorState>) {
        super(state);
        this.typedQueue = this.queue as unknown as ComponentQueue<
            MermaidQueueEvent,
            MermaidQueueRequest
        >;

        // MR5 — seed lightMode from theme on first construct. HS1 slot read
        // in adoptHost overrides this if the user previously toggled.
        this.state.update((s) => {
            s.lightMode = !themeState.get().isDark;
        });
    }

    focus(): void {
        this.typedQueue.send({ type: "focus" });
    }

    adoptHost(host: TextFileModel): void {
        super.adoptHost(host);

        // HS1 — seed `lightMode` from host slot (sync, no flicker; retains the
        // theme-derived constructor default when the slot is absent) and mirror
        // changes back. Slice-bound so svgUrl/error/loading mutations (the
        // dominant write source) never trigger a host-slot write.
        const saved = host.getEditorState<MermaidViewSettings>(this.editorId);
        if (saved?.lightMode === undefined) {
            this.state.update((s) => { s.lightMode = !themeState.get().isDark; });
        }
        this.mirrorHostSettings<MermaidViewSettings>(
            (saved) => {
                if (saved.lightMode !== undefined) {
                    this.state.update((s) => {
                        s.lightMode = saved.lightMode;
                    });
                }
            },
            (s) => ({ lightMode: s.lightMode }),
            (s) => s.lightMode,
            () => !this._syncingTheme,
        );

        // A fresh host follows later app-theme changes until the first
        // explicit editor toggle writes the HS1 slot.
        this.registerHostSubscription(
            themeState.subscribe((isDark: boolean) => {
                    if (this._host?.getEditorState<MermaidViewSettings>(this.editorId)?.lightMode !== undefined) {
                        return;
                    }
                    const lightMode = !isDark;
                    if (this.state.get().lightMode !== lightMode) {
                        this._syncingTheme = true;
                        try {
                            this.state.update((s) => { s.lightMode = lightMode; });
                        } finally {
                            this._syncingTheme = false;
                        }
                    }
                },
                (state) => state.isDark,
            ),
        );

        // Content changes retrigger the debounced render.
        this.subscribeHostContent(() => this.renderDebounced());

        // PV5 — lightMode changes retrigger render.
        this.registerHostSubscription(
            this.state.subscribe(
                () => this.renderDebounced(),
                (s) => s.lightMode,
            ),
        );

        // MR3 — initial render against the freshly-adopted host.
        // TOneState.subscribe doesn't fire on first attach, so an explicit
        // kickoff is required.
        this.renderDebounced();
    }

    // ── Render pipeline (PV5 — relocated from MermaidViewModel) ─────────

    private renderDebounced(): void {
        clearTimeout(this._renderTimer);
        this.state.update((s) => {
            s.loading = true;
        });

        this._renderTimer = setTimeout(() => {
            const content = this._host?.state.get().content ?? "";
            const { lightMode } = this.state.get();

            renderMermaid(content, lightMode)
                .then((url) => {
                    this.state.update((s) => {
                        s.svgUrl = url;
                        s.error = "";
                        s.loading = false;
                    });
                })
                .catch((e) => {
                    this.state.update((s) => {
                        s.error = e.message || "Failed to render diagram";
                        s.loading = false;
                    });
                });
        }, 400);
    }

    // ── State mutators ──────────────────────────────────────────────────

    toggleLightMode = (): void => {
        this.state.update((s) => {
            s.lightMode = !s.lightMode;
        });
        // The slice-subscribe on `s.lightMode` (set up in adoptHost) fires
        // automatically and triggers renderDebounced. No explicit call needed.
    };

    // ── Image export (IImageExport) ─────────────────────────────────────

    /** Rasterise the rendered diagram to a PNG blob. Renders on demand when
     *  `svgUrl` is empty (page never shown / not the active tab). */
    async exportPng(): Promise<Blob> {
        let url = this.state.get().svgUrl;
        if (!url) {
            const content = this._host?.state.get().content ?? "";
            url = await renderMermaid(content, this.state.get().lightMode);
        }
        return rasterToPngBlob(url);
    }

    suggestedImageName(): string {
        return (this.state.get().title || "diagram").replace(/\.\w+$/, "");
    }

    // ── Dispose ─────────────────────────────────────────────────────────

    async dispose(): Promise<void> {
        clearTimeout(this._renderTimer);
        await super.dispose();
    }
}

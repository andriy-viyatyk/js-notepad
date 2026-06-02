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
import { renderMermaid } from "./render-mermaid";

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
    // Default seeded from !isCurrentThemeDark() in the constructor.
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

function isLegacyTextFileHost(host: unknown): host is TextFileModel {
    return (host as { type?: string } | null)?.type === "textFile";
}

export class MermaidEditor extends EditorModel<MermaidEditorState, void, MermaidQueueEvent> {
    readonly editorId = "mermaid-view";

    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _hostContentUnsub: (() => void) | null = null;
    private _lightModeUnsub: (() => void) | null = null;
    private _settingsUnsub: (() => void) | null = null;
    private _pendingHost: HostDescriptor | undefined = undefined;
    private _renderTimer: ReturnType<typeof setTimeout> | undefined;

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
            s.lightMode = !isCurrentThemeDark();
        });

        const trait: IContentHostTrait = {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) throw new Error("Host already extracted from MermaidEditor");
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
        this._lightModeUnsub?.();
        this._settingsUnsub?.();
        this._hostStateUnsub = null;
        this._hostContentUnsub = null;
        this._lightModeUnsub = null;
        this._settingsUnsub = null;
    }

    // ── Host accessors ──────────────────────────────────────────────────

    get contentHost(): IContentHost | null {
        return (this._host as unknown as IContentHost) ?? null;
    }

    /** Typed host accessor for body + toolbar consumption (MK4 pattern from
     *  mirrors Svg/Html/Markdown). */
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
        // Identity-only descriptor. lightMode rides host.editorSettings["mermaid-view"]
        //; svgUrl / error / loading stripped per PV5 / MO5 (view-derived,
        // recomputable on restore via renderDebounced).
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

    applyRestoreData(data: RestoreData<MermaidEditorState>): void {
        this.state.update((cur) => {
            if (data.title !== undefined) cur.title = data.title;
            if (data.modified !== undefined) cur.modified = data.modified;
            if (data.secondaryView !== undefined) cur.secondaryView = data.secondaryView;
        });
        // lightMode is NOT carried via descriptor — read from host.editorSettings
        // in adoptHost. svgUrl/error/loading re-derived by initial render.
        if (data.host) this._pendingHost = data.host;
    }

    // ── Three-phase lifecycle ──────────────────────────────────────────

    switchFrom(oldEditor: EditorModel): void {
        const trait = oldEditor.traits.get(CONTENT_HOST_TRAIT);
        if (!trait) {
            throw new Error(
                `MermaidEditor.switchFrom: ${oldEditor.editorId} has no CONTENT_HOST_TRAIT`,
            );
        }
        const host = trait.extractContentHost() as unknown as TextFileModel;
        if (!isLegacyTextFileHost(host)) {
            throw new Error("MermaidEditor.switchFrom: extracted host is not a TextFileModel");
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
            ui.notify((err as Error).message || "Failed to restore Mermaid editor.", "error");
            this._host = newTextFileModel("");
            this.adoptHost(this._host);
        }
        this._pendingHost = undefined;
    }

    /** Adopt a host without going through `switchFrom`. Used by
     *  `attachEditorToPage` when constructing a fresh MermaidEditor over a
     *  freshly-restored legacy TextFileModel. */
    adoptHost(host: TextFileModel): void {
        this._host = host;
        this._tearDownHostSubscriptions();

        // Forward host metadata changes to descriptorChanged (P3 debounce).
        this._hostStateUnsub = host.state.subscribe(() =>
            this.descriptorChanged.send(undefined),
        );

        // HS1 — seed `lightMode` from host slot (sync, no flicker). If the
        // slot is absent, retain the theme-derived default set in constructor.
        const saved = host.getEditorState<MermaidViewSettings>(this.editorId);
        if (saved?.lightMode !== undefined) {
            this.state.update((s) => {
                s.lightMode = saved.lightMode;
            });
        }

        // HS1 — mirror `lightMode` changes back to host slot. Slice-subscribe
        // keeps the mirror from firing on svgUrl/error/loading mutations (the
        // dominant write source) — only the bounded boolean triggers a
        // host-slot write.
        this._settingsUnsub = this.state.subscribe(
            (lightMode) => {
                if (!this._host) return;
                this._host.setEditorState<MermaidViewSettings>(this.editorId, {
                    lightMode: lightMode as boolean,
                });
            },
            (s) => s.lightMode,
        );

        // Content changes retrigger the debounced render.
        this._hostContentUnsub = host.state.subscribe(
            () => this.renderDebounced(),
            (s) => s.content,
        );

        // PV5 — lightMode changes retrigger render (replaces today's
        // MermaidViewModel.onInit's own-state watcher).
        this._lightModeUnsub = this.state.subscribe(
            () => this.renderDebounced(),
            (s) => s.lightMode,
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

        // MR3 — initial render against the freshly-adopted host (mirrors
        // today's MermaidViewModel.onInit's final renderDebounced call).
        // TOneState.subscribe doesn't fire on first attach, so an explicit
        // kickoff is required.
        this.renderDebounced();
    }

    setPage(page: IPageHost | null): void {
        super.setPage(page);
        this._host?.setPage(page);
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

    // ── Save / release / dispose ────────────────────────────────────────

    async confirmRelease(closing?: boolean): Promise<boolean> {
        return this._host ? this._host.confirmRelease(closing) : true;
    }

    async saveState(): Promise<void> {
        await this._host?.io.saveState();
    }

    async dispose(): Promise<void> {
        clearTimeout(this._renderTimer);
        this._tearDownHostSubscriptions();
        if (this._host) {
            await this._host.dispose();
            this._host = null;
        }
        await super.dispose();
    }
}

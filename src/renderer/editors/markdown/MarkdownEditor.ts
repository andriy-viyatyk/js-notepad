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

export type MarkdownQueueEvent = { type: "focus" };

export type MarkdownQueueRequest = never;

/**
 * HS1 host-slot shape — `compactMode` rides `host.editorSettings["md-view"]`
 * so it survives Markdown↔Monaco switches AND app restarts (PV2/PV6 HS1
 * amendment 2026-05-21).
 */
interface MarkdownViewSettings {
    compactMode?: boolean;
}

export interface MarkdownEditorState extends EditorStateBase {
    // HS1 — rides host.editorSettings["md-view"]. Bounded boolean.
    compactMode: boolean;
    // View-derived — present on state for in-session reactivity, stripped
    // from getRestoreData per PV2 / MO5 / GR8 pattern. Search is a transient
    // gesture; persisting it surprises the user on next open.
    searchVisible: boolean;
    searchText: string;
    currentMatchIndex: number;
    totalMatches: number;
}

export const defaultMarkdownEditorState: MarkdownEditorState = {
    id: "",
    title: "",
    modified: false,
    secondaryView: undefined,
    compactMode: false,
    searchVisible: false,
    searchText: "",
    currentMatchIndex: 0,
    totalMatches: 0,
};

function isLegacyTextFileHost(host: unknown): host is TextFileModel {
    return (host as { type?: string } | null)?.type === "textFile";
}

export class MarkdownEditor extends EditorModel<MarkdownEditorState, void, MarkdownQueueEvent> {
    readonly editorId = "md-view";

    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _settingsUnsub: (() => void) | null = null;
    private _pendingHost: HostDescriptor | undefined = undefined;

    /** PV9 — non-state DOM ref set by the body via `setContainer(el)` callback.
     *  Facade reads through `containerInnerHtml` / `viewMounted` getters. NOT
     *  on `state` (no subscribers; ride-state-for-reactivity doesn't apply
     *  — see PV9 resolution). */
    private _containerRef: HTMLDivElement | null = null;

    readonly typedQueue: ComponentQueue<MarkdownQueueEvent, MarkdownQueueRequest>;

    constructor(state: TComponentState<MarkdownEditorState>) {
        super(state);
        this.typedQueue = this.queue as unknown as ComponentQueue<
            MarkdownQueueEvent,
            MarkdownQueueRequest
        >;

        const trait: IContentHostTrait = {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) throw new Error("Host already extracted from MarkdownEditor");
                this._hostStateUnsub?.();
                this._settingsUnsub?.();
                this._hostStateUnsub = null;
                this._settingsUnsub = null;
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

    /** Typed host accessor for body-only consumption (avoids the
     *  `IContentHost`→`TextFileModel` cast at every read site). */
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
        // HS1 — descriptor collapses to identity-only. `compactMode` rides
        // host.editorSettings["md-view"]; search fields stripped per PV2 / MO5.
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

    applyRestoreData(data: RestoreData<MarkdownEditorState>): void {
        this.state.update((cur) => {
            if (data.title !== undefined) cur.title = data.title;
            if (data.modified !== undefined) cur.modified = data.modified;
            if (data.secondaryView !== undefined) cur.secondaryView = data.secondaryView;
        });
        // No legacy promotion needed — today's MarkdownViewModel doesn't
        // persist compactMode (in-memory only). `adoptHost` seeds compactMode
        // from the host slot on first read.
        if (data.host) this._pendingHost = data.host;
    }

    // ── Three-phase lifecycle ──────────────────────────────────────────

    switchFrom(oldEditor: EditorModel): void {
        const trait = oldEditor.traits.get(CONTENT_HOST_TRAIT);
        if (!trait) {
            throw new Error(
                `MarkdownEditor.switchFrom: ${oldEditor.editorId} has no CONTENT_HOST_TRAIT`,
            );
        }
        const host = trait.extractContentHost() as unknown as TextFileModel;
        if (!isLegacyTextFileHost(host)) {
            throw new Error("MarkdownEditor.switchFrom: extracted host is not a TextFileModel");
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
            ui.notify((err as Error).message || "Failed to restore Markdown editor.", "error");
            this._host = newTextFileModel("");
            this.adoptHost(this._host);
        }
        this._pendingHost = undefined;
    }

    /** Adopt a host without going through `switchFrom`. Used by
     *  `attachEditorToPage` when constructing a fresh MarkdownEditor over a
     *  freshly-restored legacy TextFileModel. */
    adoptHost(host: TextFileModel): void {
        this._host = host;
        this._hostStateUnsub?.();
        this._settingsUnsub?.();

        // Forward host metadata changes to descriptorChanged (P3 debounce).
        this._hostStateUnsub = host.state.subscribe(() =>
            this.descriptorChanged.send(undefined),
        );

        // No host-content subscription needed — the body reads
        // `host.state.use((s) => s.content)` directly; MarkdownBlock re-renders
        // on every content change via React props.

        // HS1 — seed `compactMode` from host slot (sync, no flicker).
        const saved = host.getEditorState<MarkdownViewSettings>(this.editorId);
        if (saved?.compactMode !== undefined) {
            this.state.update((s) => {
                s.compactMode = saved.compactMode;
            });
        }

        // HS1 — mirror `compactMode` changes back to host slot via a selector
        // subscription. Slice-subscribe keeps the mirror from firing on
        // search-state mutations (the dominant write source) — only the
        // bounded boolean actually triggers a host-slot write.
        this._settingsUnsub = this.state.subscribe(
            (compactMode) => {
                if (!this._host) return;
                this._host.setEditorState<MarkdownViewSettings>(this.editorId, {
                    compactMode: compactMode as boolean,
                });
            },
            (s) => s.compactMode,
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
    }

    setPage(page: IPageHost | null): void {
        super.setPage(page);
        this._host?.setPage(page);
    }

    // ── View-driven setters / state mutators ────────────────────────────

    /** PV9 — view callback ref: scroll panel sets its DOM node here.
     *  Facade reads via `containerInnerHtml` / `viewMounted` getters. */
    setContainer = (el: HTMLDivElement | null): void => {
        this._containerRef = el;
    };

    toggleCompact = (): void => {
        this.state.update((s) => {
            s.compactMode = !s.compactMode;
        });
    };

    openSearch = (): void => {
        this.state.update((s) => {
            s.searchVisible = true;
        });
    };

    closeSearch = (): void => {
        this.state.update((s) => {
            s.searchVisible = false;
            s.searchText = "";
            s.currentMatchIndex = 0;
            s.totalMatches = 0;
        });
    };

    setSearchText = (text: string): void => {
        this.state.update((s) => {
            s.searchText = text;
            s.currentMatchIndex = 0;
        });
    };

    /** Called from the view's `onMatchCountChange` bridge — clamps the index
     *  when the count changes (e.g., user types extra chars and total drops). */
    setMatchCount = (count: number): void => {
        this.state.update((s) => {
            const newIndex = count > 0 && s.currentMatchIndex >= count ? 0 : s.currentMatchIndex;
            s.totalMatches = count;
            s.currentMatchIndex = newIndex;
        });
    };

    nextMatch = (): void => {
        const { totalMatches, currentMatchIndex } = this.state.get();
        if (totalMatches === 0) return;
        this.state.update((s) => {
            s.currentMatchIndex = (currentMatchIndex + 1) % totalMatches;
        });
    };

    prevMatch = (): void => {
        const { totalMatches, currentMatchIndex } = this.state.get();
        if (totalMatches === 0) return;
        this.state.update((s) => {
            s.currentMatchIndex = (currentMatchIndex - 1 + totalMatches) % totalMatches;
        });
    };

    // ── Facade-only accessors ─────────────────────────────────────

    get containerInnerHtml(): string {
        return this._containerRef?.innerHTML ?? "";
    }

    get viewMounted(): boolean {
        return this._containerRef !== null;
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
        this._settingsUnsub?.();
        this._hostStateUnsub = null;
        this._settingsUnsub = null;
        if (this._host) {
            await this._host.dispose();
            this._host = null;
        }
        await super.dispose();
    }
}

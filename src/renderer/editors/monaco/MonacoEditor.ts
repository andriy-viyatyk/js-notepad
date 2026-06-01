import { TComponentState } from "../../core/state/state";
import {
    EditorModel,
    type EditorStateBase,
    type RestoreData,
} from "../base/EditorModel";
import { CONTENT_HOST_TRAIT, type IContentHostTrait } from "../base/editor-traits";
import type { IContentHost } from "../base/IContentHost";
import { ComponentQueue, type ComponentQueueEvent } from "../../core/state/ComponentQueue";
import type { EditorDescriptor, HostDescriptor } from "../../../shared/persistence";
import type { IContentPipe } from "../../api/types/io.pipe";
import type { PageModel } from "../../api/pages/PageModel";
import { ui } from "../../api/ui";
import { fpBasename } from "../../core/utils/file-path";
import { TextFileModel, newTextFileModel } from "../text/TextEditorModel";
import { editorRegistry } from "../base/editorRegistry";

export type MonacoQueueEvent =
    | { type: "revealLine"; line: number }
    | { type: "highlightText"; text: string | undefined }
    | { type: "focus" };

export type MonacoQueueRequest =
    | { type: "getSelectedText" }
    | { type: "getCursorPosition" }
    | { type: "insertText"; text: string }
    | { type: "replaceSelection"; text: string };

export interface MonacoEditorState extends EditorStateBase {
    /** Selection-presence flag — written by `<MonacoBody>`'s selection
     *  listener, read by `<TextChrome>`'s Run-all visibility gate. Non-
     *  persisted (defaults to false on restore). */
    hasSelection: boolean;
}

export const defaultMonacoEditorState: MonacoEditorState = {
    id: "",
    title: "",
    modified: false,
    secondaryView: undefined,
    hasSelection: false,
};

function isLegacyTextFileHost(host: unknown): host is TextFileModel {
    return (host as { type?: string } | null)?.type === "textFile";
}

export class MonacoEditor extends EditorModel<
    MonacoEditorState,
    void,
    ComponentQueueEvent
> {
    readonly editorId = "monaco";

    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _pendingHost: HostDescriptor | undefined = undefined;

    /** Narrowed queue with both event and request channels typed. */
    readonly typedQueue: ComponentQueue<MonacoQueueEvent, MonacoQueueRequest>;

    constructor(state: TComponentState<MonacoEditorState>) {
        super(state);
        // Reuse the base queue instance under a typed alias — the base
        // exposes `queue` as ComponentQueue<E> where E = ComponentQueueEvent.
        // We narrow it via cast for our typed event union.
        this.typedQueue = this.queue as unknown as ComponentQueue<
            MonacoQueueEvent,
            MonacoQueueRequest
        >;

        const trait: IContentHostTrait = {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) {
                    throw new Error("Host already extracted from MonacoEditor");
                }
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

    findCompatibleEditors(): string[] {
        if (!this._host) return [];
        return editorRegistry.findEditorsAccepting(this._host as unknown as IContentHost);
    }

    isFreshEmpty(): boolean {
        const h = this._host;
        if (!h) return false;
        const hs = h.state.get();
        return (
            hs.content === "" &&
            hs.filePath === undefined &&
            !hs.modified &&
            (this.state.get().title === "" || this.state.get().title === "untitled")
        );
    }

    getNavigatorTarget(): { pipe?: IContentPipe | null; filePath?: string | null } | null {
        if (!this._host) return null;
        const { filePath } = this._host.state.get();
        const pipe = this._host.pipe;
        if (!pipe && !filePath) return {};
        return { pipe, filePath };
    }

    hasTextSelection(): boolean {
        return this.state.get().hasSelection;
    }

    focus(): void {
        this.typedQueue.send({ type: "focus" });
    }

    // ── Typed queue wrappers (script API and chrome consumers) ─────────

    revealLine(line: number): void {
        this.typedQueue.send({ type: "revealLine", line });
    }

    setHighlightText(text: string | undefined): void {
        this.typedQueue.send({ type: "highlightText", text });
    }

    focusEditor(): void {
        this.typedQueue.send({ type: "focus" });
    }

    async getSelectedText(): Promise<string> {
        return (await this.typedQueue.execute({ type: "getSelectedText" })) as string;
    }

    async getCursorPosition(): Promise<{ lineNumber: number; column: number }> {
        return (await this.typedQueue.execute({ type: "getCursorPosition" })) as {
            lineNumber: number;
            column: number;
        };
    }

    async insertText(text: string): Promise<void> {
        await this.typedQueue.execute({ type: "insertText", text });
    }

    async replaceSelection(text: string): Promise<void> {
        await this.typedQueue.execute({ type: "replaceSelection", text });
    }

    /**
     * Chrome F5 / Run-button entry point (walkthrough 20 / MO6). Materializes
     * selection via the queue (async) then calls `host.actions.runScriptWith`
     * with pre-fetched text + language. Host stays unaware of Monaco-specific
     * selection mechanics.
     */
    async runScript(all = false): Promise<void> {
        const host = this._host;
        if (!host) return;
        const { content, language } = host.state.get();
        let scriptText = content;
        if (!all) {
            try {
                const selected = await this.getSelectedText();
                if (selected) scriptText = selected;
            } catch {
                // Queue disposed mid-run — fall through to whole-content run.
            }
        }
        await host.actions.runScriptWith(scriptText, language ?? "");
    }

    // ── Persistence ─────────────────────────────────────────────────────

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
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

    applyRestoreData(data: RestoreData<MonacoEditorState>): void {
        this.state.update((cur) => {
            if (data.title !== undefined) cur.title = data.title;
            if (data.modified !== undefined) cur.modified = data.modified;
            if (data.secondaryView !== undefined) cur.secondaryView = data.secondaryView;
        });
        if (data.host) this._pendingHost = data.host;
        if (data.revealLine !== undefined) {
            this.typedQueue.send({ type: "revealLine", line: data.revealLine });
        }
        if (data.highlightText !== undefined) {
            this.typedQueue.send({ type: "highlightText", text: data.highlightText });
        }
    }

    // ── Three-phase lifecycle ──────────────────────────────────────────

    switchFrom(oldEditor: EditorModel): void {
        const trait = oldEditor.traits.get(CONTENT_HOST_TRAIT);
        if (!trait) {
            throw new Error(
                `MonacoEditor.switchFrom: ${oldEditor.editorId} has no CONTENT_HOST_TRAIT`,
            );
        }
        const host = trait.extractContentHost() as unknown as TextFileModel;
        if (!isLegacyTextFileHost(host)) {
            throw new Error("MonacoEditor.switchFrom: extracted host is not a TextFileModel");
        }
        // C9 — preserve cache-file id across the swap so <id>-host.txt /
        // <id>-script-panel.json survive.
        this.state.update((s) => {
            s.id = oldEditor.id;
        });
        // Mark the host as Monaco-rendered for legacy state.editor consumers
        // (encryption fallback in <ActiveEditor>, script panel reads, etc.).
        host.state.update((s) => {
            s.editor = "monaco";
        });
        this.adoptHost(host);
    }

    async restore(): Promise<void> {
        try {
            if (!this._host) {
                if (this._pendingHost) {
                    this._host = await TextFileModel.fromDescriptor(this._pendingHost);
                } else {
                    this._host = newTextFileModel("");
                }
            }
            if (!this._host.state.get().restored) {
                await this._host.restore();
            }
            this.adoptHost(this._host);
        } catch (err) {
            ui.notify(
                (err as Error).message || "Failed to restore Monaco editor.",
                "error",
            );
            this._host = newTextFileModel("");
            this.adoptHost(this._host);
        }
        this._pendingHost = undefined;
    }

    /**
     * Adopt a host without going through `switchFrom` (used by the open-file
     * flow — PagesLifecycleModel.wrapForPage — when constructing a fresh
     * MonacoEditor over a freshly-restored legacy TextFileModel). Public so
     * the lifecycle helper can call it without reflection.
     */
    adoptHost(host: TextFileModel): void {
        this._host = host;
        this._hostStateUnsub?.();
        this._hostStateUnsub = host.state.subscribe(() =>
            this.descriptorChanged.send(undefined),
        );
        const { filePath, title } = host.state.get();
        this.state.update((s) => {
            s.title = title || (filePath ? fpBasename(filePath) : s.title || "untitled");
            // Carry over the legacy id so cache files stay addressable.
            if (host.state.get().id) s.id = host.state.get().id;
        });
        host.state.update((s) => {
            if (s.editor !== "monaco") s.editor = "monaco";
        });
        // Propagate page reference (legacy editor needs `.page` for actions,
        // io, secondaryView setters). PageModel.attach calls setPage on us
        // next; we forward.
        if (this.page) host.setPage(this.page);
    }

    setPage(page: PageModel | null): void {
        super.setPage(page);
        this._host?.setPage(page);
    }

    // ── Reaction hooks — delegate to host ───────────────────────────────

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

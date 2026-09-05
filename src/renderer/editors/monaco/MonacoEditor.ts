import { TComponentState } from "../../core/state/state";
import type { EditorStateBase, RestoreData } from "../base/EditorModel";
import { TextHostEditorModel } from "../base/TextHostEditorModel";
import { ComponentQueue, type ComponentQueueEvent } from "../../core/state/ComponentQueue";

export type MonacoQueueEvent =
    | { type: "revealLine"; line: number }
    | { type: "highlightText"; text: string | undefined }
    | { type: "focus" }
    | { type: "openFind" }
    | { type: "openReplace" };

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

export class MonacoEditor extends TextHostEditorModel<
    MonacoEditorState,
    void,
    ComponentQueueEvent
> {
    readonly editorId = "monaco";
    protected readonly displayName = "Monaco";

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

    openFind(): void {
        this.typedQueue.send({ type: "openFind" });
    }

    openReplace(): void {
        this.typedQueue.send({ type: "openReplace" });
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

    applyRestoreData(data: RestoreData<MonacoEditorState>): void {
        super.applyRestoreData(data);
        if (data.revealLine !== undefined) {
            this.typedQueue.send({ type: "revealLine", line: data.revealLine });
        }
        if (data.highlightText !== undefined) {
            this.typedQueue.send({ type: "highlightText", text: data.highlightText });
        }
    }
}

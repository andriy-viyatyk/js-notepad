import type { EditorConfig } from "../../base/EditorConfig";
import { editorRegistry } from "../../base/editorRegistry";
import { CONTENT_HOST_TRAIT } from "../../base/editor-traits";
import type { EditorModel } from "../../base/EditorModel";
import { VanillaView, type IOwnedView } from "../../../uikit/shared/vanilla-view";
import { NoteItem } from "../notebookTypes";
import { NoteItemEditModel } from "./NoteItemEditModel";
import { MiniTextEditorView } from "./MiniTextEditorView";

export interface NoteItemActiveEditorViewProps {
    model: NoteItemEditModel;
    editorConfig?: EditorConfig;
    viewStates?: Map<string, import("monaco-editor").editor.ICodeEditorViewState>;
}

type AdoptingEditor = EditorModel & { adoptHost(host: unknown): void };

function noteKind(model: NoteItemEditModel): string {
    return model.state.get().editor || "monaco";
}

function detachAndDispose(editor: EditorModel): void {
    try {
        editor.traits.get(CONTENT_HOST_TRAIT)?.extractContentHost();
    } catch {
        // The host may already have been extracted by an asynchronous cleanup path.
    }
    void editor.dispose();
}

export class NoteItemActiveEditorView extends VanillaView<NoteItemActiveEditorViewProps> {
    private active: IOwnedView & { update?: (props: unknown) => void } | undefined;
    private embeddedEditor: EditorModel | undefined;
    private activeKind: string | undefined;
    private generation = 0;

    public constructor(props: NoteItemActiveEditorViewProps) {
        super(props, document.createElement("div"));
        this.root.dataset.type = "note-active-editor";
        // `display: contents` because the React component this replaces contributed no DOM: the
        // body's own root was a direct child of whatever laid it out. A plain block wrapper here
        // breaks the flex chain the expanded overlay depends on — the content panel is a definite
        // -height flex column and the bodies size themselves with `flex: 1`, which against an
        // auto-height block resolves to nothing. Monaco and the markdown preview collapsed to zero,
        // the grid fell back to its 200px default and the HTML iframe to its intrinsic 300x150. The
        // collapsed list hid this because there each body gets an explicit `maxEditorHeight`.
        this.root.style.display = "contents";
    }

    protected onMount(): void {
        this.startArm();
    }

    protected onUpdate(props: NoteItemActiveEditorViewProps): void {
        const kind = noteKind(props.model);
        if (kind !== this.activeKind) {
            this.startArm();
            return;
        }
        this.updateActive();
        this.clearError();
    }

    /** Re-point an unchanged editor arm before the owner writes its new row props. */
    public repoint(note: NoteItem): void {
        if (this.activeKind === "monaco" && this.active instanceof MiniTextEditorView) {
            this.active.repoint(note);
            return;
        }
        this.props.model.repoint(note);
        this.updateActive();
    }

    /**
     * Push current props to the live arm. The two arms take *different* models and must not be
     * collapsed: `MiniTextEditorView` drives `NoteItemEditModel`, while an embedded `BodyView` was
     * constructed with the `EditorModel` returned by `module.createEditor()` and reads members that
     * exist only there (`rowsForGrid`, `setContainer`, `setCaptureElement`, its own state). Handing
     * it the note edit model throws inside the paint, which aborts the whole grid render.
     */
    private updateActive(): void {
        if (!this.active?.update) return;
        if (this.activeKind === "monaco") {
            this.active.update({
                model: this.props.model,
                editorConfig: this.props.editorConfig,
                viewStates: this.props.viewStates,
            });
            return;
        }
        // The embedded arm is created asynchronously; before it lands there is nothing to update,
        // and `loadEmbedded` mounts it with the current props anyway.
        if (!this.embeddedEditor) return;
        this.active.update({
            model: this.embeddedEditor,
            editorConfig: this.props.editorConfig,
        });
    }

    protected onDispose(): void {
        this.generation++;
        this.releaseActive();
    }

    private startArm(): void {
        const kind = noteKind(this.props.model);
        this.activeKind = kind;
        this.generation++;
        const generation = this.generation;
        this.releaseActive();
        this.clearError();

        if (kind === "monaco") {
            const view = this.child(new MiniTextEditorView({
                model: this.props.model,
                editorConfig: this.props.editorConfig,
                viewStates: this.props.viewStates,
            }));
            this.active = view;
            this.root.append(view.root);
            view.mount();
            return;
        }

        void this.loadEmbedded(kind, generation);
    }

    private async loadEmbedded(kind: string, generation: number): Promise<void> {
        try {
            const module = await editorRegistry.getModule(kind);
            if (!module.BodyView) {
                throw new Error(`Editor "${kind}" is not embeddable (no BodyView slot)`);
            }
            const editor = module.createEditor();
            (editor as AdoptingEditor).adoptHost(this.props.model);
            await editor.restore();
            if (generation !== this.generation || this.activeKind !== kind) {
                detachAndDispose(editor);
                return;
            }

            const view = this.child(new module.BodyView({
                model: editor,
                editorConfig: this.props.editorConfig,
            }));
            this.embeddedEditor = editor;
            this.active = view;
            this.root.append(view.root);
            view.mount();
        } catch (error) {
            if (generation !== this.generation || this.activeKind !== kind) return;
            this.renderError(error instanceof Error ? error.message : String(error));
        }
    }

    private releaseActive(): void {
        const active = this.active;
        this.active = undefined;
        if (active) {
            if (active instanceof MiniTextEditorView) {
                active.captureViewState(this.props.model.id);
            }
            this.releaseChild(active);
        }
        if (this.embeddedEditor) {
            detachAndDispose(this.embeddedEditor);
            this.embeddedEditor = undefined;
        }
    }

    private renderError(message: string): void {
        this.root.replaceChildren();
        const text = document.createElement("div");
        text.dataset.type = "note-editor-error";
        text.textContent = message;
        this.root.append(text);
    }

    private clearError(): void {
        const error = this.root.querySelector('[data-type="note-editor-error"]');
        error?.remove();
    }
}

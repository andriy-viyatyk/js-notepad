import type * as monaco from "monaco-editor";
import { MonacoEditorHostView } from "../../shared/MonacoEditorHostView";
import type { EditorConfig } from "../../base/EditorConfig";
import { VanillaView } from "../../../uikit/shared/vanilla-view";
import { NoteItemEditModel } from "./NoteItemEditModel";
import { NoteItem } from "../notebookTypes";

export interface MiniTextEditorViewProps {
    model: NoteItemEditModel;
    editorConfig?: EditorConfig;
    viewStates?: Map<string, monaco.editor.ICodeEditorViewState>;
}

function editorOptions(config: EditorConfig): monaco.editor.IStandaloneEditorConstructionOptions {
    return {
        lineNumbers: "off",
        lineNumbersMinChars: 0,
        lineDecorationsWidth: 4,
        glyphMargin: false,
        minimap: { enabled: !config.hideMinimap },
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        overviewRulerBorder: false,
        scrollbar: {
            vertical: "auto",
            horizontal: "auto",
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
        },
        folding: false,
        renderLineHighlight: "none",
        matchBrackets: "near",
        renderWhitespace: "none",
        guides: { indentation: false, bracketPairs: false },
        automaticLayout: true,
        scrollBeyondLastLine: false,
        padding: { top: 4, bottom: 4 },
    };
}

export class MiniTextEditorView extends VanillaView<MiniTextEditorViewProps> {
    private readonly host: MonacoEditorHostView;

    public constructor(props: MiniTextEditorViewProps) {
        super(props, document.createElement("div"));
        this.root.dataset.type = "mini-text-editor";
        this.host = this.child(new MonacoEditorHostView({
            initialValue: props.model.state.get().content,
            language: props.model.state.get().language,
            options: editorOptions(props.editorConfig ?? {}),
            onMount: (mountedHost) => {
                props.model.editor.handleEditorDidMount(mountedHost.getEditor());
                this.restoreViewState(props.model.id);
            },
            onChange: props.model.editor.handleEditorChange,
        }));
    }

    protected onMount(): void {
        this.root.append(this.host.root);
        this.host.mount();
        this.bind(this.props.model.state, (state) => ({
            content: state.content,
            language: state.language,
        }), () => this.syncHost());
        this.bind(this.props.model.editor.state, (state) => state.contentHeight, () => {
            this.applySize();
        });
        this.syncHost();
        this.applySize();
        this.applyHighlight();
    }

    protected onUpdate(_props: MiniTextEditorViewProps): void {
        this.syncHost();
        this.applySize();
        this.applyHighlight();
    }

    public captureViewState(noteId: string): void {
        // A capture can be reached on a teardown path, after the Monaco host below has already been
        // disposed — `VanillaView.dispose` takes children before the owner's `onDispose`. There is
        // nothing left to read then, and throwing would abort the rest of the caller's disposal.
        if (!this.host.isReady) return;
        const state = this.host.getEditor().saveViewState();
        if (state) this.props.viewStates?.set(noteId, state);
    }

    public repoint(note: NoteItem): void {
        this.captureViewState(this.props.model.id);
        this.props.model.repoint(note);
        this.update({ ...this.props });
        this.restoreViewState(note.id);
    }

    protected onDispose(): void {
        this.props.model.editor.onDispose();
    }

    private syncHost(): void {
        const model = this.props.model;
        const config = this.props.editorConfig ?? {};
        this.host.update({
            language: model.state.get().language,
            options: editorOptions(config),
            onChange: model.editor.handleEditorChange,
        });
        this.host.setValue(model.state.get().content);
    }

    private restoreViewState(noteId: string): void {
        const state = this.props.viewStates?.get(noteId);
        if (state) this.host.getEditor().restoreViewState(state);
    }

    private applySize(): void {
        const config = this.props.editorConfig ?? {};
        if (config.fillContainer) {
            this.root.style.position = "relative";
            this.root.style.height = "";
            this.root.style.flex = "1 1 auto";
            this.root.style.overflow = "hidden";
            return;
        }
        const height = config.maxEditorHeight
            ? Math.min(this.props.model.editor.state.get().contentHeight, config.maxEditorHeight)
            : this.props.model.editor.state.get().contentHeight;
        this.root.style.position = "relative";
        this.root.style.height = `${height}px`;
        this.root.style.flex = "";
        this.root.style.overflow = "";
    }

    private applyHighlight(): void {
        this.props.model.editor.setHighlightText(this.props.editorConfig?.highlightText);
    }
}

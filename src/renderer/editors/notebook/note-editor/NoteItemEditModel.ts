import { ReactNode } from "react";
import { TComponentState } from "../../../core/state/state";
import { TModel } from "../../../core/state/model";
import { EditorView } from "../../../../shared/types";
import { NoteItem, NotebookSource } from "../notebookTypes";
import { scriptRunner } from "../../../scripting/ScriptRunner";
import { isScriptLanguage } from "../../../scripting/transpile";
import type { EditorStateStorage } from "../../base/EditorStateStorage";
import type { HostDescriptor } from "../../../../shared/persistence";
import type { IContentPipe } from "../../../api/types/io.pipe";
import * as monaco from "monaco-editor";

// =============================================================================
// Editor Model (for Monaco)
// =============================================================================

// Default height for new notes (before Monaco reports actual height)
const DEFAULT_CONTENT_HEIGHT = 100;

// Minimum height constraint for Monaco editor
const MIN_EDITOR_HEIGHT = 50;

// Tolerance for height changes to prevent Monaco oscillation (Monaco can fluctuate by ~8px)
const HEIGHT_TOLERANCE = 10;

export type NoteEditorState = {
    hasSelection: boolean;
    contentHeight: number;
};

/**
 * Simplified TextEditorModel for note items.
 * Handles Monaco editor instance and selection state.
 */
export class NoteEditorModel extends TModel<NoteEditorState> {
    private editModel: NoteItemEditModel;
    editorRef: monaco.editor.IStandaloneCodeEditor | null = null;
    private selectionListenerDisposable: monaco.IDisposable | null = null;
    private contentSizeDisposable: monaco.IDisposable | null = null;
    private highlightDecorations: monaco.editor.IEditorDecorationsCollection | null = null;

    constructor(editModel: NoteItemEditModel, initialHeight?: number) {
        super(new TComponentState<NoteEditorState>({
            hasSelection: false,
            contentHeight: initialHeight ?? DEFAULT_CONTENT_HEIGHT,
        }));
        this.editModel = editModel;
    }

    handleEditorDidMount = (editor: monaco.editor.IStandaloneCodeEditor) => {
        this.editorRef = editor;
        this.setupSelectionListener(editor);
        this.setupContentSizeListener(editor);
        // Get initial content height
        this.updateContentHeight(editor.getContentHeight());
    };

    handleEditorChange = (value: string | undefined) => {
        this.editModel.changeContent(value || "", true);
    };

    focusEditor = () => {
        this.editorRef?.focus();
    };

    private setupSelectionListener = (editor: monaco.editor.IStandaloneCodeEditor) => {
        this.selectionListenerDisposable = editor.onDidChangeCursorSelection(() => {
            const selection = editor.getSelection();
            const hasSelection = selection ? !selection.isEmpty() : false;

            if (this.state.get().hasSelection !== hasSelection) {
                this.state.update((s) => {
                    s.hasSelection = hasSelection;
                });
            }
        });
    };

    private setupContentSizeListener = (editor: monaco.editor.IStandaloneCodeEditor) => {
        this.contentSizeDisposable = editor.onDidContentSizeChange((e) => {
            this.updateContentHeight(e.contentHeight);
        });
    };

    private updateContentHeight = (height: number) => {
        // Ensure minimum height (max is applied by MiniTextEditor via context)
        // Round to avoid subpixel differences triggering unnecessary updates
        const clampedHeight = Math.round(Math.max(MIN_EDITOR_HEIGHT, height));
        const currentHeight = this.state.get().contentHeight;
        // Use tolerance to prevent oscillation (Monaco can fluctuate by a few pixels)
        const heightDiff = Math.abs(currentHeight - clampedHeight);
        if (heightDiff > HEIGHT_TOLERANCE) {
            this.state.update((s) => {
                s.contentHeight = clampedHeight;
            });
            // Persist to notebook model (prevents scroll jumping on remount)
            this.editModel.persistContentHeight(clampedHeight);
        }
    };

    /**
     * Apply find-match decorations for external search highlighting.
     * Splits search text into words and highlights each independently.
     */
    setHighlightText = (text: string | undefined) => {
        const editor = this.editorRef;
        const model = editor?.getModel();
        if (!editor || !model) {
            return;
        }

        if (!text?.trim()) {
            // Clear decorations
            this.highlightDecorations?.clear();
            return;
        }

        // Split into words (same logic as notebook search)
        const words = text.toLowerCase().trim().split(/\s+/);
        const decorations: monaco.editor.IModelDeltaDecoration[] = [];

        for (const word of words) {
            const matches = model.findMatches(word, false, false, false, null, false);
            for (const match of matches) {
                decorations.push({
                    range: match.range,
                    options: { className: "findMatch" },
                });
            }
        }

        if (this.highlightDecorations) {
            this.highlightDecorations.set(decorations);
        } else {
            this.highlightDecorations = editor.createDecorationsCollection(decorations);
        }
    };

    getSelectedText = (): string => {
        if (!this.editorRef) return "";
        const selection = this.editorRef.getSelection();
        if (!selection || selection.isEmpty()) return "";
        return this.editorRef.getModel()?.getValueInRange(selection) || "";
    };

    onDispose = () => {
        this.selectionListenerDisposable?.dispose();
        this.selectionListenerDisposable = null;
        this.contentSizeDisposable?.dispose();
        this.contentSizeDisposable = null;
        this.editorRef = null;
    };
}

// =============================================================================
// Edit Model State
// =============================================================================

export interface NoteItemEditState {
    content: string;
    language: string;
    editor: EditorView;
    id: string;
    title: string;
    filePath?: string;
    encrypted: boolean;
    restored: boolean;
    temp: boolean;
}

// =============================================================================
// Edit Model (TextFileModel-duck-typed content host)
// =============================================================================

export class NoteItemEditModel {
    readonly id: string;
    readonly type = "textFile" as const;

    private notebookModel: NotebookSource;
    private noteId: string;

    // Reactive content state
    state: TComponentState<NoteItemEditState>;

    // Sub-model for Monaco editor
    editor: NoteEditorModel;

    // State storage backed by notebook's per-note state
    readonly stateStorage: EditorStateStorage;

    // Portal refs for toolbar elements
    editorToolbarRefFirst: HTMLDivElement | null = null;
    editorToolbarRefLast: HTMLDivElement | null = null;
    editorFooterRefLast: HTMLDivElement | null = null;

    constructor(notebookModel: NotebookSource, note: NoteItem) {
        this.notebookModel = notebookModel;
        this.noteId = note.id;
        this.id = note.id;

        // Initialize state from note. `restored: true` makes the embedded
        // editor's `restore()` skip its `host.restore()` branch (NoteItemEditModel
        // has no restore()); `id`/`title`/`encrypted`/`temp` give the embedded
        // editors safe values to read.
        this.state = new TComponentState<NoteItemEditState>({
            content: note.content.content,
            language: note.content.language,
            editor: (note.content.editor as EditorView) || "monaco",
            id: note.id,
            title: note.title || "Note",
            filePath: undefined,
            encrypted: false,
            restored: true,
            temp: false,
        });

        // State storage backed by notebook's per-note state
        this.stateStorage = {
            getState: async (id: string, name: string) =>
                notebookModel.getNoteState(id, name),
            setState: async (id: string, name: string, state: string) => {
                notebookModel.setNoteState(id, name, state);
            },
        };

        // Get stored height from notebook model (prevents scroll jumping on remount)
        const storedHeight = notebookModel.getNoteHeight(note.id);
        this.editor = new NoteEditorModel(this, storedHeight);
    }

    // =========================================================================
    // Height persistence (prevents scroll jumping on virtualized remount)
    // =========================================================================

    persistContentHeight = (height: number) => {
        this.notebookModel.setNoteHeight(this.noteId, height);
    };

    // =========================================================================
    // Ref setters (for portal targets)
    // =========================================================================

    setEditorToolbarRefFirst = (ref: HTMLDivElement | null) => {
        this.editorToolbarRefFirst = ref;
    };

    setEditorToolbarRefLast = (ref: HTMLDivElement | null) => {
        this.editorToolbarRefLast = ref;
    };

    setFooterRefLast = (ref: HTMLDivElement | null) => {
        this.editorFooterRefLast = ref;
    };

    // =========================================================================
    // Content/Editor/Language changes
    // =========================================================================

    changeContent = (newContent: string, _byUser?: boolean) => {
        this.state.update((s) => {
            s.content = newContent;
        });

        // Propagate to notebook model
        this.notebookModel.updateNoteContent(this.noteId, newContent);
    };

    changeEditor = (editor: EditorView) => {
        this.state.update((s) => {
            s.editor = editor;
        });

        // Propagate to notebook model
        this.notebookModel.updateNoteEditor(this.noteId, editor);
    };

    changeLanguage = (language: string | undefined) => {
        const lang = language ?? "";
        this.state.update((s) => {
            s.language = lang;
        });

        // Propagate to notebook model
        this.notebookModel.updateNoteLanguage(this.noteId, lang);
    };

    // =========================================================================
    // Script execution
    // =========================================================================

    runScript = async (all?: boolean) => {
        const { language, content } = this.state.get();
        let script = content;
        if (!all) {
            script = this.editor.getSelectedText() || content;
        }
        if (isScriptLanguage(language)) {
            // Get the notebook page model for script context
            // page.content will be notebook's JSON, output grouped with notebook
            const notebookPageModel = this.notebookModel.pageModel;
            await scriptRunner.runWithResult(notebookPageModel.id, script, notebookPageModel, language);
        }
    };

    // =========================================================================
    // Sync from notebook (when note data changes externally)
    // =========================================================================

    syncFromNote = (note: NoteItem) => {
        const currentState = this.state.get();
        const noteContent = note.content;

        // Only update if actually different to avoid loops
        if (
            currentState.content !== noteContent.content ||
            currentState.language !== noteContent.language ||
            currentState.editor !== noteContent.editor
        ) {
            this.state.update((s) => {
                s.content = noteContent.content;
                s.language = noteContent.language;
                s.editor = (noteContent.editor as EditorView) || "monaco";
            });
        }
    };


    /** Per-note editor view-state slot. Backed by the notebook JSON
     *  (`data.state[noteId]["editorSettings:<editorId>"]`, NB8) so Grid columns
     *  etc. survive notebook reopen + cross-window transfer. Stored as a
     *  stringified value via the existing `getNoteState`/`setNoteState`. */
    getEditorState<T>(editorId: string): T | undefined {
        const raw = this.notebookModel.getNoteState(this.noteId, `editorSettings:${editorId}`);
        if (!raw) return undefined;
        try {
            return JSON.parse(raw) as T;
        } catch {
            return undefined;
        }
    }

    setEditorState<T>(editorId: string, value: T): void {
        this.notebookModel.setNoteState(
            this.noteId,
            `editorSettings:${editorId}`,
            JSON.stringify(value),
        );
    }

    /** No-op — the embedded editor is owned by the note view, not a PageModel. */
    setPage = (): void => {};

    /** No-op — the note's content cache lives in the notebook JSON, not a
     *  per-editor cache file. */
    setStorage = (): void => {};

    /** The note never blocks its own release; the notebook owns lifecycle. */
    confirmRelease = async (): Promise<boolean> => true;

    /** Notebook notes have no file pipe. */
    pipe: IContentPipe | null = null;

    /** Notebook notes have no I/O of their own — content propagates to the
     *  notebook synchronously via `updateNoteContent`. */
    io = { saveState: async (): Promise<void> => {} };

    /** Minimal descriptor for interface completeness — embedded note editors
     *  are never persisted independently of the notebook. */
    getDescriptor(): HostDescriptor {
        return { kind: "noteItem", state: { noteId: this.noteId } } as unknown as HostDescriptor;
    }

    // =========================================================================
    // Cleanup
    // =========================================================================

    dispose = () => {
        this.editor.onDispose();
    };

    // =========================================================================
    // Compatibility properties (for editors that check these)
    // =========================================================================

    get noLanguage(): boolean {
        return false;
    }

    getIcon: (() => ReactNode) | undefined = undefined;

    // Properties that editors might access but we don't need
    get filePath(): string | undefined {
        return undefined;
    }

    get title(): string {
        return "Note";
    }

    get encrypted(): boolean {
        return false;
    }

    get decrypted(): boolean {
        return false;
    }
}

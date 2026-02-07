import { debounce } from "../../../shared/utils";
import { TComponentModel } from "../../core/state/model";
import { uuid } from "../../core/utils/node-utils";
import { NoteItem, NotebookData, NotebookEditorProps } from "./notebookTypes";

// =============================================================================
// State
// =============================================================================

export const defaultNotebookEditorState = {
    data: { notes: [], state: {} } as NotebookData,
    error: undefined as string | undefined,
    leftPanelWidth: 200,
};

export type NotebookEditorState = typeof defaultNotebookEditorState;

// =============================================================================
// Model
// =============================================================================

export class NotebookEditorModel extends TComponentModel<
    NotebookEditorState,
    NotebookEditorProps
> {
    private lastSerializedData: NotebookData | null = null;
    private stateChangeSubscription: (() => void) | undefined;
    /** Flag to skip reloading content that we just serialized ourselves */
    private skipNextContentUpdate = false;

    private onDataChanged = () => {
        const data = this.state.get().data;
        if (data !== this.lastSerializedData) {
            this.lastSerializedData = data;
            this.skipNextContentUpdate = true;
            const content = JSON.stringify(data, null, 4);
            this.props.model.changeContent(content, true);
        }
    };

    private onDataChangedDebounced = debounce(this.onDataChanged, 300);

    init = () => {
        this.stateChangeSubscription = this.state.subscribe(() => {
            this.onDataChangedDebounced();
        });
    };

    dispose = () => {
        this.stateChangeSubscription?.();
    };

    updateContent = (content: string) => {
        // Skip if this is our own serialized content
        if (this.skipNextContentUpdate) {
            this.skipNextContentUpdate = false;
            return;
        }

        // Load data (initial load or external file change)
        this.loadData(content);
    };

    private loadData = (content: string) => {
        if (!content || content.trim() === "") {
            // Empty content - initialize with empty data but don't mark as changed
            this.state.update((s) => {
                s.data = { notes: [], state: {} };
                s.error = undefined;
            });
            // Mark as already serialized so we don't save empty object back
            this.lastSerializedData = this.state.get().data;
            return;
        }

        try {
            const parsed = JSON.parse(content);
            this.state.update((s) => {
                s.data = {
                    notes: Array.isArray(parsed.notes) ? parsed.notes : [],
                    state: parsed.state || {},
                };
                s.error = undefined;
            });
            // Mark loaded data as already serialized so we don't save it back
            this.lastSerializedData = this.state.get().data;
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            this.state.update((s) => {
                s.error = message;
            });
        }
    };

    get notesCount(): number {
        return this.state.get().data.notes.length;
    }

    addNote = () => {
        const now = new Date().toISOString();
        const newNote: NoteItem = {
            id: uuid(),
            title: "",
            category: "",
            tags: [],
            content: {
                language: "plaintext",
                content: "",
                editor: "monaco",
            },
            comment: "",
            createdDate: now,
            updatedDate: now,
        };

        // Add new note at the beginning (top of list)
        this.state.update((s) => {
            s.data.notes.unshift(newNote);
        });
    };

    setLeftPanelWidth = (width: number) => {
        this.state.update((s) => {
            s.leftPanelWidth = width;
        });
    };

    deleteNote = (id: string) => {
        this.state.update((s) => {
            s.data.notes = s.data.notes.filter((note) => note.id !== id);
            // Also clean up any state for this note
            delete s.data.state[id];
        });
    };

    expandNote = (id: string) => {
        // TODO: Implement expand functionality (portal to full editor)
        console.log("Expand note:", id);
    };

    addComment = (id: string) => {
        // TODO: Implement add comment dialog/input
        console.log("Add comment to note:", id);
    };

    // =========================================================================
    // Note content updates (called by NoteItemEditModel)
    // =========================================================================

    getNote = (id: string): NoteItem | undefined => {
        return this.state.get().data.notes.find((note) => note.id === id);
    };

    updateNoteContent = (id: string, content: string) => {
        this.state.update((s) => {
            const note = s.data.notes.find((n) => n.id === id);
            if (note) {
                note.content.content = content;
                note.updatedDate = new Date().toISOString();
            }
        });
    };

    updateNoteLanguage = (id: string, language: string) => {
        this.state.update((s) => {
            const note = s.data.notes.find((n) => n.id === id);
            if (note) {
                note.content.language = language;
                note.updatedDate = new Date().toISOString();
            }
        });
    };

    updateNoteEditor = (id: string, editor: string) => {
        this.state.update((s) => {
            const note = s.data.notes.find((n) => n.id === id);
            if (note) {
                note.content.editor = editor;
                note.updatedDate = new Date().toISOString();
            }
        });
    };

    updateNoteTitle = (id: string, title: string) => {
        this.state.update((s) => {
            const note = s.data.notes.find((n) => n.id === id);
            if (note) {
                note.title = title;
                note.updatedDate = new Date().toISOString();
            }
        });
    };
}

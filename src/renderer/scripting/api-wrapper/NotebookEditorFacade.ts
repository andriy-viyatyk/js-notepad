import type { NotebookEditor } from "../../editors/notebook";
import type { NoteItem } from "../../editors/notebook/notebookTypes";
import type { IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";

const NOTEBOOK_EDITOR_MEMBERS: readonly IAiMember[] = [
    { name: "notes", kind: "property", summary: "All notes (complete data, not filtered by UI)." },
    { name: "categories", kind: "property", summary: "All category names." },
    { name: "tags", kind: "property", summary: "All tag names." },
    { name: "notesCount", kind: "property", summary: "Total number of notes." },
    { name: "addNote", kind: "method", signature: "addNote(): INote", summary: "Add a new note. Returns the created note." },
    { name: "deleteNote", kind: "method", signature: "deleteNote(id: string): void", summary: "Delete a note by ID.", caution: "deletes notebook data" },
    { name: "updateNoteTitle", kind: "method", signature: "updateNoteTitle(id: string, title: string): void", summary: "Update a note's title." },
    { name: "updateNoteContent", kind: "method", signature: "updateNoteContent(id: string, content: string): void", summary: "Update a note's text content." },
    { name: "updateNoteCategory", kind: "method", signature: "updateNoteCategory(id: string, category: string): void", summary: "Update a note's category." },
    { name: "addNoteTag", kind: "method", signature: "addNoteTag(id: string, tag: string): void", summary: "Add a tag to a note." },
    { name: "removeNoteTag", kind: "method", signature: "removeNoteTag(id: string, tagIndex: number): void", summary: "Remove a tag from a note by index." },
];

const NOTEBOOK_EDITOR_HELP = `Obtain via pages[i].asNotebook() on a notebook page (\`notebook-view\`); pass true — \`asNotebook(true)\` — to switch a compatible page to this editor first.
Notebook notes, categories, and tags management.`;

export class NotebookEditorFacade implements IAiVisible {
    constructor(private readonly vm: NotebookEditor) {}

    get aiVision(): IAiVisionDescriptor {
        return {
            kind: "NotebookEditor",
            summary: "Notebook notes management facade.",
            members: NOTEBOOK_EDITOR_MEMBERS,
            help: NOTEBOOK_EDITOR_HELP,
            summarize: () => ({
                kind: "NotebookEditor",
                notesCount: this.notesCount,
                categories: this.categories,
                tags: this.tags,
            }),
        };
    }

    get notes(): Array<{ readonly id: string; readonly title: string; readonly content: string; readonly category: string; readonly tags: readonly string[] }> {
        return this.vm.getNotes().map(mapNote);
    }

    get categories(): string[] {
        return this.vm.state.get().categories;
    }

    get tags(): string[] {
        return this.vm.state.get().tags;
    }

    get notesCount(): number {
        return this.vm.notesCount;
    }

    addNote(): { readonly id: string; readonly title: string; readonly content: string; readonly category: string; readonly tags: readonly string[] } {
        const note = this.vm.addNote();
        return mapNote(note);
    }

    deleteNote(id: string): void {
        this.vm.deleteNote(id, true);
    }

    updateNoteTitle(id: string, title: string): void {
        this.vm.updateNoteTitle(id, title);
    }

    updateNoteContent(id: string, content: string): void {
        this.vm.updateNoteContent(id, content);
    }

    updateNoteCategory(id: string, category: string): void {
        this.vm.updateNoteCategory(id, category);
    }

    addNoteTag(id: string, tag: string): void {
        this.vm.addNoteTag(id, tag);
    }

    removeNoteTag(id: string, tagIndex: number): void {
        this.vm.removeNoteTag(id, tagIndex);
    }
}

/** Map internal NoteItem → INote (flatten nested content). */
function mapNote(note: NoteItem) {
    return {
        id: note.id,
        title: note.title,
        content: note.content.content,
        category: note.category,
        tags: [...note.tags],
    };
}

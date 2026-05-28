import type { NotebookEditor } from "../../editors/notebook";
import type { NoteItem } from "../../editors/notebook/notebookTypes";

export class NotebookEditorFacade {
    constructor(private readonly vm: NotebookEditor) {}

    get notes(): Array<{ readonly id: string; readonly title: string; readonly content: string; readonly category: string; readonly tags: readonly string[] }> {
        return this.vm.state.get().data.notes.map(mapNote);
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
        tags: note.tags,
    };
}

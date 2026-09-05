/**
 * INotebookEditor — scripting interface for the Notebook editor.
 *
 * Access via `page.editor` on `.note.json` pages.
 *
 * @example
 * const nb = page.editor;
 * const note = nb.addNote();
 * nb.updateNoteTitle(note.id, "My Note");
 * nb.updateNoteContent(note.id, "Hello world");
 */
export interface INotebookEditor {
    readonly id: "notebook-view";
    readonly name: string;
    /** All notes (complete data, not filtered by UI). */
    readonly notes: INote[];

    /** All category names. */
    readonly categories: string[];

    /** All tag names. */
    readonly tags: string[];

    /** Total number of notes. */
    readonly notesCount: number;

    /** Add a new note. Returns the created note. */
    addNote(): INote;

    /** Delete a note by ID. */
    deleteNote(id: string): void;

    /** Update a note's title. */
    updateNoteTitle(id: string, title: string): void;

    /** Update a note's text content. */
    updateNoteContent(id: string, content: string): void;

    /** Update a note's category. */
    updateNoteCategory(id: string, category: string): void;

    /** Add a tag to a note. */
    addNoteTag(id: string, tag: string): void;

    /** Remove a tag from a note by index. */
    removeNoteTag(id: string, tagIndex: number): void;
}

/** A single note in a notebook. */
export interface INote {
    readonly id: string;
    readonly title: string;
    /** Text content of the note. */
    readonly content: string;
    readonly category: string;
    readonly tags: readonly string[];
}

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
    /** All notes as copied snapshots, or undefined when no page host is attached. */
    readonly notes: INote[] | undefined;

    /** Notes matching the current notebook filters as copied snapshots. */
    readonly filteredNotes: INote[] | undefined;

    /** All category names as a copy, or undefined when no page host is attached. */
    readonly categories: string[] | undefined;

    /** All tag names as a copy, or undefined when no page host is attached. */
    readonly tags: string[] | undefined;

    /** Total number of notes, or undefined when no page host is attached. */
    readonly notesCount: number | undefined;

    /** Number of notes matching the current notebook filters. */
    readonly filteredCount: number | undefined;

    /** Current search text. */
    readonly searchText: string | undefined;

    /** Current category selection. */
    readonly selectedCategory: string | undefined;

    /** Current tag selection. */
    readonly selectedTag: string | undefined;

    /** The active notebook panel. */
    readonly expandedPanel: "categories" | "tags" | undefined;

    /** The expanded note ID, or undefined when no note is expanded. */
    readonly expandedNoteId: string | undefined;

    /** The notebook parse error, or undefined when parsing succeeded. */
    readonly error: string | undefined;

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

    /** Update a note's tag by index. */
    updateNoteTag(id: string, tagIndex: number, tag: string): void;

    /** Add an empty comment to a note. */
    addComment(id: string): void;

    /** Update a note's comment. */
    updateNoteComment(id: string, comment: string): void;

    /** Remove a note's comment. */
    removeComment(id: string): void;

    /** Update a note's language. */
    updateNoteLanguage(id: string, language: string): void;

    /** Update a note's embedded editor. */
    updateNoteEditor(id: string, editor: string): void;

    /** Set the notebook search filter. */
    setSearchText(text: string): void;

    /** Clear the notebook search filter. */
    clearSearch(): void;

    /** Select a notebook category filter. */
    setSelectedCategory(category: string): void;

    /** Select a notebook tag filter. */
    setSelectedTag(tag: string): void;

    /** Expand a note by ID. */
    expandNote(id: string): void;

    /** Collapse the expanded note. */
    collapseNote(): void;
}

/** A single note in a notebook. */
export interface INote {
    readonly id: string;
    readonly title: string;
    /** Text content of the note. */
    readonly content: string;
    readonly language: string;
    readonly editor?: string;
    readonly category: string;
    readonly tags: readonly string[];
    readonly comment?: string;
    readonly createdDate: string;
    readonly updatedDate: string;
}

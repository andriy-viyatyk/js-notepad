import type { NotebookEditor } from "../../editors/notebook";
import type { NoteItem } from "../../editors/notebook/notebookTypes";
import type { INote } from "../../api/types/notebook-editor";
import { ui } from "../../api/ui";
import { createElements } from "../ai-vision/elements";
import { activatePageAndWaitForLayout, pageScopeSelector } from "../ai-vision/page-elements";
import type { IAiElementDeclaration, IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";

const NOTEBOOK_ELEMENTS: readonly IAiElementDeclaration[] = [
    { name: "notebook-breadcrumb", purpose: "Select the current notebook category or tag filter." },
    { name: "notebook-search", purpose: "Enter search text for the notebook notes." },
    { name: "notebook-search-clear", purpose: "Clear the notebook search; this conditional control is mounted only while search text is non-empty." },
    { name: "notebook-add-note", purpose: "Add a note using the current notebook filter context." },
    { name: "notebook-expanded-collapse", purpose: "Collapse the expanded note overlay; this conditional control is visible only when a valid expanded note has a mounted host overlay." },
    { name: "note-delete", purpose: "Delete the owning note; this control occurs once per mounted note, and visible means at least one instance is mounted." },
    { name: "note-expand", purpose: "Expand the owning note; this control occurs once per mounted note, and visible means at least one instance is mounted." },
    { name: "note-language", purpose: "Open the language chooser for the owning note; this control occurs once per mounted note, and visible means at least one instance is mounted." },
    { name: "note-editor-switch", purpose: "Select an embedded editor for the owning note; this conditional control occurs once per eligible mounted note, and visible means at least one instance has switch options." },
    { name: "note-run-script", purpose: "Run the owning script note or its selection; this conditional control occurs once per eligible mounted note, and visible means at least one script instance is mounted." },
    { name: "note-run-all-script", purpose: "Run all content for the owning script note; this conditional control occurs once per mounted script note with a live selection, and visible means at least one instance is mounted." },
];

const NOTEBOOK_EDITOR_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The concrete current editor id." },
    { name: "name", kind: "property", summary: "The editor's registry display name." },
    { name: "notes", kind: "property", summary: "All notes as copied snapshots, or undefined without an attached page host." },
    { name: "filteredNotes", kind: "property", summary: "Notes in the current notebook filter as copied snapshots, or undefined without an attached page host." },
    { name: "categories", kind: "property", summary: "All category names as a copy, or undefined without an attached page host." },
    { name: "tags", kind: "property", summary: "All tag names as a copy, or undefined without an attached page host." },
    { name: "notesCount", kind: "property", summary: "Total number of notes, or undefined without an attached page host." },
    { name: "filteredCount", kind: "property", summary: "Number of notes matching the current filter, or undefined without an attached page host." },
    { name: "searchText", kind: "property", summary: "Current search text, or undefined without an attached page host." },
    { name: "selectedCategory", kind: "property", summary: "Current category selection, or undefined without an attached page host." },
    { name: "selectedTag", kind: "property", summary: "Current tag selection, or undefined without an attached page host." },
    { name: "expandedPanel", kind: "property", summary: "The active notebook panel, or undefined without an attached page host." },
    { name: "expandedNoteId", kind: "property", summary: "The expanded note ID, or undefined when no note is expanded or without an attached page host." },
    { name: "error", kind: "property", summary: "The notebook parse error, or undefined when parsing succeeded or without an attached page host." },
    { name: "addNote", kind: "method", signature: "addNote(): INote", summary: "Add a new note. Returns the created note.", caution: "adds notebook data" },
    { name: "deleteNote", kind: "method", signature: "deleteNote(id: string): void", summary: "Delete a note by ID.", caution: "deletes notebook data" },
    { name: "updateNoteTitle", kind: "method", signature: "updateNoteTitle(id: string, title: string): void", summary: "Update a note's title.", caution: "changes notebook data" },
    { name: "updateNoteContent", kind: "method", signature: "updateNoteContent(id: string, content: string): void", summary: "Update a note's text content.", caution: "changes notebook data" },
    { name: "updateNoteCategory", kind: "method", signature: "updateNoteCategory(id: string, category: string): void", summary: "Update a note's category.", caution: "changes notebook data" },
    { name: "addNoteTag", kind: "method", signature: "addNoteTag(id: string, tag: string): void", summary: "Add a tag to a note.", caution: "changes notebook data" },
    { name: "removeNoteTag", kind: "method", signature: "removeNoteTag(id: string, tagIndex: number): void", summary: "Remove a tag from a note by index.", caution: "changes notebook data" },
    { name: "updateNoteTag", kind: "method", signature: "updateNoteTag(id: string, tagIndex: number, tag: string): void", summary: "Update a note's tag by index.", caution: "changes notebook data" },
    { name: "addComment", kind: "method", signature: "addComment(id: string): void", summary: "Add an empty comment to a note.", caution: "changes notebook data" },
    { name: "updateNoteComment", kind: "method", signature: "updateNoteComment(id: string, comment: string): void", summary: "Update a note's comment.", caution: "changes notebook data" },
    { name: "removeComment", kind: "method", signature: "removeComment(id: string): void", summary: "Remove a note's comment.", caution: "changes notebook data" },
    { name: "updateNoteLanguage", kind: "method", signature: "updateNoteLanguage(id: string, language: string): void", summary: "Update a note's language.", caution: "changes notebook data" },
    { name: "updateNoteEditor", kind: "method", signature: "updateNoteEditor(id: string, editor: string): void", summary: "Update a note's embedded editor.", caution: "changes notebook data" },
    { name: "setSearchText", kind: "method", signature: "setSearchText(text: string): void", summary: "Set the notebook search filter." },
    { name: "clearSearch", kind: "method", signature: "clearSearch(): void", summary: "Clear the notebook search filter." },
    { name: "setSelectedCategory", kind: "method", signature: "setSelectedCategory(category: string): void", summary: "Select a notebook category filter." },
    { name: "setSelectedTag", kind: "method", signature: "setSelectedTag(tag: string): void", summary: "Select a notebook tag filter." },
    { name: "expandNote", kind: "method", signature: "expandNote(id: string): void", summary: "Expand a note by ID." },
    { name: "collapseNote", kind: "method", signature: "collapseNote(): void", summary: "Collapse the expanded note." },
];

const NOTEBOOK_EDITOR_HELP = `Access via pages[i].editor after narrowing editor.id to "notebook-view".
Notebook notes, categories, tags, filters, expansion, comments, and embedded note-editor metadata.
The curated elements are notebook-breadcrumb, notebook-search, notebook-search-clear,
notebook-add-note, notebook-expanded-collapse, note-delete, note-expand, note-language,
note-editor-switch, note-run-script, and note-run-all-script. Search-clear and expanded-collapse
are conditional controls. The six note controls repeat once per mounted note instance; their
visible value means at least one matching instance is mounted, highlight rings all matches, and
its result count reports the number of rings. The editor-switch and both script controls are also
conditional: they are visible only when a mounted note supplies the relevant options, script
language, or live selection. They do not identify a particular note.

Categories and Tags secondary views, including their tree/list controls, belong under page.panels
and are not duplicated in this facade; US-1323 owns that panel-node surface. Opening note-language
raises the application popup menu exposed as menus[0]. Inspect and act on that menu through the
root menus node, or use updateNoteLanguage(id, language) for a targeted change. Note actions that
mutate a note require an explicit note ID; no repeated element selector targets one note. There is
no notebook-level execution-status property, and script-note run actions, nested selection state,
and focus actions are intentionally not exposed because they belong to mounted view-owned models.

Attached empty notebooks report real empty arrays, empty strings, and zero counts. Detached getters
report undefined where documented. Notes, filteredNotes, categories, tags, and nested note tags are
fresh copies, so use the model-backed actions to change notebook data.`;

export class NotebookEditorFacade implements IAiVisible {
    constructor(private readonly vm: NotebookEditor, readonly id: string, readonly name: string) {}

    get aiVision(): IAiVisionDescriptor {
        const pageId = this.vm.page?.id;
        const elements = createElements(NOTEBOOK_ELEMENTS, ui.highlightElement.bind(ui), {
            scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
            beforeHighlight: pageId
                ? () => activatePageAndWaitForLayout(pageId)
                : undefined,
            // Six of these controls are rendered once per note, so the default
            // "ring the first match" would point at one arbitrary note while the
            // purpose text says the control belongs to every note. `all` rings each
            // mounted instance (capped at the overlay's own limit) and the result's
            // `count`/`highlighted` pair reports both what exists and what was drawn.
            // Singleton controls are unaffected: their count is one.
            highlightOptions: { all: true },
        });
        return {
            kind: "NotebookEditor",
            summary: "Notebook notes management facade.",
            members: [...NOTEBOOK_EDITOR_MEMBERS, ...elements.members],
            help: NOTEBOOK_EDITOR_HELP,
            summarize: () => ({
                kind: "NotebookEditor", id: this.id, name: this.name,
                notesCount: this.notesCount,
                categories: this.categories,
                tags: this.tags,
            }),
            elements: NOTEBOOK_ELEMENTS,
            provide: elements.provide,
        };
    }

    get notes(): INote[] | undefined {
        if (!this.isAttached()) return undefined;
        return this.vm.getNotes().map(mapNote);
    }

    get filteredNotes(): INote[] | undefined {
        if (!this.isAttached()) return undefined;
        const { filteredCount } = this.vm.state.get();
        const notes: INote[] = [];
        for (let index = 0; index < filteredCount; index++) {
            const note = this.vm.getFilteredNoteAt(index);
            if (note) notes.push(mapNote(note));
        }
        return notes;
    }

    get categories(): string[] | undefined {
        return this.isAttached() ? [...this.vm.state.get().categories] : undefined;
    }

    get tags(): string[] | undefined {
        return this.isAttached() ? [...this.vm.state.get().tags] : undefined;
    }

    get notesCount(): number | undefined {
        return this.isAttached() ? this.vm.state.get().notesCount : undefined;
    }

    get filteredCount(): number | undefined {
        return this.isAttached() ? this.vm.state.get().filteredCount : undefined;
    }

    get searchText(): string | undefined {
        return this.isAttached() ? this.vm.state.get().searchText : undefined;
    }

    get selectedCategory(): string | undefined {
        return this.isAttached() ? this.vm.state.get().selectedCategory : undefined;
    }

    get selectedTag(): string | undefined {
        return this.isAttached() ? this.vm.state.get().selectedTag : undefined;
    }

    get expandedPanel(): "categories" | "tags" | undefined {
        return this.isAttached() ? this.vm.state.get().expandedPanel : undefined;
    }

    get expandedNoteId(): string | undefined {
        if (!this.isAttached()) return undefined;
        return this.vm.state.get().expandedNoteId || undefined;
    }

    get error(): string | undefined {
        return this.isAttached() ? this.vm.state.get().error : undefined;
    }

    addNote(): INote {
        this.requireAttached();
        return mapNote(this.vm.addNote());
    }

    deleteNote(id: string): void {
        this.requireAttached();
        this.vm.deleteNote(id, true);
    }

    updateNoteTitle(id: string, title: string): void {
        this.requireAttached();
        this.vm.updateNoteTitle(id, title);
    }

    updateNoteContent(id: string, content: string): void {
        this.requireAttached();
        this.vm.updateNoteContent(id, content);
    }

    updateNoteCategory(id: string, category: string): void {
        this.requireAttached();
        this.vm.updateNoteCategory(id, category);
    }

    addNoteTag(id: string, tag: string): void {
        this.requireAttached();
        this.vm.addNoteTag(id, tag);
    }

    removeNoteTag(id: string, tagIndex: number): void {
        this.requireAttached();
        this.vm.removeNoteTag(id, tagIndex);
    }

    updateNoteTag(id: string, tagIndex: number, tag: string): void {
        this.requireAttached();
        this.vm.updateNoteTag(id, tagIndex, tag);
    }

    addComment(id: string): void {
        this.requireAttached();
        this.vm.addComment(id);
    }

    updateNoteComment(id: string, comment: string): void {
        this.requireAttached();
        this.vm.updateNoteComment(id, comment);
    }

    removeComment(id: string): void {
        this.requireAttached();
        this.vm.removeComment(id);
    }

    updateNoteLanguage(id: string, language: string): void {
        this.requireAttached();
        this.vm.updateNoteLanguage(id, language);
    }

    updateNoteEditor(id: string, editor: string): void {
        this.requireAttached();
        this.vm.updateNoteEditor(id, editor);
    }

    setSearchText(text: string): void {
        this.requireAttached();
        this.vm.setSearchText(text);
    }

    clearSearch(): void {
        this.requireAttached();
        this.vm.clearSearch();
    }

    setSelectedCategory(category: string): void {
        this.requireAttached();
        this.vm.setSelectedCategory(category);
    }

    setSelectedTag(tag: string): void {
        this.requireAttached();
        this.vm.setSelectedTag(tag);
    }

    expandNote(id: string): void {
        this.requireAttached();
        this.vm.expandNote(id);
    }

    collapseNote(): void {
        this.requireAttached();
        this.vm.collapseNote();
    }

    private isAttached(): boolean {
        return this.vm.page !== null && this.vm.host !== null;
    }

    private requireAttached(): void {
        if (!this.isAttached()) {
            throw new Error("Notebook editor action unavailable: no page host attached.");
        }
    }
}

/** Map internal NoteItem → INote (flatten nested content). */
function mapNote(note: NoteItem): INote {
    return {
        id: note.id,
        title: note.title,
        content: note.content.content,
        language: note.content.language,
        editor: note.content.editor,
        category: note.category,
        tags: [...note.tags],
        comment: note.comment,
        createdDate: note.createdDate,
        updatedDate: note.updatedDate,
    };
}

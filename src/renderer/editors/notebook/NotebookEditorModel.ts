import { debounce } from "../../../shared/utils";
import { TComponentModel } from "../../core/state/model";
import RenderGridModel from "../../components/virtualization/RenderGrid/RenderGridModel";
import { uuid } from "../../core/utils/node-utils";
import { splitWithSeparators } from "../../core/utils/utils";
import { showConfirmationDialog } from "../../features/dialogs/ConfirmationDialog";
import { CategoryTreeItem } from "../../components/TreeView";
import { NoteItem, NotebookData, NotebookEditorProps } from "./notebookTypes";

// =============================================================================
// State
// =============================================================================

export type ExpandedPanel = "tags" | "categories";

export const defaultNotebookEditorState = {
    data: { notes: [], state: {} } as NotebookData,
    error: undefined as string | undefined,
    leftPanelWidth: 200,
    expandedPanel: "categories" as ExpandedPanel,
    // Category tree
    categories: [] as string[],
    categoriesSize: {} as { [key: string]: number },
    // Filtering
    selectedCategory: "" as string, // empty means "All"
    // selectedTag: "" as string,   // future: tag filtering
    // searchText: "" as string,    // future: text search
    filteredNotes: [] as NoteItem[],
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
    /** Grid model ref for virtualized list updates */
    gridModel: RenderGridModel | null = null;

    setGridModel = (model: RenderGridModel | null) => {
        this.gridModel = model;
    };

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
            // Build category tree and apply filters
            this.loadCategories();
            this.applyFilters();
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
        const { selectedCategory } = this.state.get();
        const newNote: NoteItem = {
            id: uuid(),
            title: "",
            category: selectedCategory,
            tags: [],
            content: {
                language: "plaintext",
                content: "",
                editor: "monaco",
            },
            // comment is undefined by default, shows "Add comment" button
            createdDate: now,
            updatedDate: now,
        };

        // Add new note at the beginning (top of list)
        this.state.update((s) => {
            s.data.notes.unshift(newNote);
        });
        this.loadCategories();
        this.applyFilters();
    };

    setLeftPanelWidth = (width: number) => {
        this.state.update((s) => {
            s.leftPanelWidth = width;
        });
    };

    setExpandedPanel = (panel: string) => {
        this.state.update((s) => {
            s.expandedPanel = panel as ExpandedPanel;
        });
    };

    // =========================================================================
    // Category management
    // =========================================================================

    /**
     * Extract all categories from notes and calculate how many notes per category.
     * This includes parent categories (e.g., "project" gets count from "project/settings").
     */
    loadCategories = () => {
        const notes = this.state.get().data.notes;
        const categoriesSet = new Set<string>();
        const categoriesSize: { [key: string]: number } = {};

        notes.forEach((note) => {
            if (note.category) {
                categoriesSet.add(note.category);
                // Count for each level of the category path
                const categoryPath = splitWithSeparators(note.category, "/\\");
                while (categoryPath.length) {
                    const subCategory = categoryPath.join("/");
                    categoriesSize[subCategory] = (categoriesSize[subCategory] || 0) + 1;
                    categoryPath.pop();
                }
            }
            // Count for "All" (root)
            categoriesSize[""] = (categoriesSize[""] || 0) + 1;
        });

        this.state.update((s) => {
            s.categories = Array.from(categoriesSet);
            s.categoriesSize = categoriesSize;
        });
    };

    categoryItemClick = (item: CategoryTreeItem) => {
        this.setSelectedCategory(item.category);
    };

    setSelectedCategory = (category: string) => {
        this.state.update((s) => {
            s.selectedCategory = category;
        });
        this.applyFilters();
    };

    getCategoryItemSelected = (item: CategoryTreeItem): boolean => {
        return item.category === this.state.get().selectedCategory;
    };

    getCategorySize = (category: string): number | undefined => {
        return this.state.get().categoriesSize[category];
    };

    // =========================================================================
    // Filtering
    // =========================================================================

    /**
     * Apply all active filters and update filteredNotes state.
     * Currently filters by: selectedCategory
     * Future: selectedTag, searchText
     */
    applyFilters = () => {
        const { data, selectedCategory } = this.state.get();
        let filtered = data.notes;

        // Filter by category
        if (selectedCategory) {
            filtered = filtered.filter(
                (note) => note.category?.startsWith(selectedCategory)
            );
        }

        // Future: Filter by tag
        // if (selectedTag) {
        //     filtered = filtered.filter(note => note.tags?.includes(selectedTag));
        // }

        // Future: Filter by search text
        // if (searchText) {
        //     const search = searchText.toLowerCase();
        //     filtered = filtered.filter(note =>
        //         note.title?.toLowerCase().includes(search) ||
        //         note.content.content?.toLowerCase().includes(search)
        //     );
        // }

        this.state.update((s) => {
            s.filteredNotes = filtered;
        });
    };

    deleteNote = async (id: string) => {
        const note = this.getNote(id);
        const noteTitle = note?.title || "this note";

        const result = await showConfirmationDialog({
            title: "Delete Note",
            message: `Are you sure you want to delete "${noteTitle}"?`,
            buttons: ["Delete", "Cancel"],
        });

        if (result !== "Delete") {
            return;
        }

        this.state.update((s) => {
            s.data.notes = s.data.notes.filter((note) => note.id !== id);
            // Also clean up any state for this note
            delete s.data.state[id];
        });
        this.loadCategories();
        this.applyFilters();
    };

    expandNote = (id: string) => {
        // TODO: Implement expand functionality (portal to full editor)
        console.log("Expand note:", id);
    };

    addComment = (id: string) => {
        // Initialize comment field with empty string so it shows the TextAreaField
        this.state.update((s) => {
            const note = s.data.notes.find((n) => n.id === id);
            if (note && note.comment === undefined) {
                note.comment = "";
                note.updatedDate = new Date().toISOString();
            }
        });
    };

    updateNoteComment = (id: string, comment: string) => {
        this.state.update((s) => {
            const note = s.data.notes.find((n) => n.id === id);
            if (note) {
                note.comment = comment;
                note.updatedDate = new Date().toISOString();
            }
        });
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

    // =========================================================================
    // Note height persistence (prevents scroll jumping on virtualized remount)
    // =========================================================================

    getNoteHeight = (id: string): number | undefined => {
        return this.state.get().data.state[id]?.contentHeight;
    };

    setNoteHeight = (id: string, height: number) => {
        const currentHeight = this.getNoteHeight(id);
        // Only update if height actually changed
        if (currentHeight === height) {
            return;
        }
        this.state.update((s) => {
            if (!s.data.state[id]) {
                s.data.state[id] = {};
            }
            s.data.state[id].contentHeight = height;
        });
    };

    // =========================================================================
    // Generic state storage (for nested editors like GridEditor)
    // =========================================================================

    /**
     * Get stored state for a note item by name.
     * Used by EditorStateStorageContext to provide storage for nested editors.
     */
    getNoteState = (id: string, name: string): string | undefined => {
        const noteState = this.state.get().data.state[id];
        const value = noteState?.[name];
        return typeof value === "string" ? value : undefined;
    };

    /**
     * Set state for a note item by name.
     * Used by EditorStateStorageContext to provide storage for nested editors.
     */
    setNoteState = (id: string, name: string, value: string) => {
        const currentValue = this.getNoteState(id, name);
        // Only update if value actually changed
        if (currentValue === value) {
            return;
        }
        this.state.update((s) => {
            if (!s.data.state[id]) {
                s.data.state[id] = {};
            }
            s.data.state[id][name] = value;
        });
    };
}

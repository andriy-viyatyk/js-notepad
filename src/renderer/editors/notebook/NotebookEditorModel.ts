import { debounce } from "../../../shared/utils";
import { TComponentModel } from "../../core/state/model";
import RenderGridModel from "../../components/virtualization/RenderGrid/RenderGridModel";
import { uuid } from "../../core/utils/node-utils";
import { splitWithSeparators } from "../../core/utils/utils";
import { showConfirmationDialog } from "../../features/dialogs/ConfirmationDialog";
import { CategoryTreeItem, DragItem } from "../../components/TreeView";
import { NoteItem, NotebookData, NotebookEditorProps, NOTE_DRAG, CATEGORY_DRAG } from "./notebookTypes";

// =============================================================================
// Content Search Helper
// =============================================================================

/**
 * Extract searchable text from note content.
 * - grid-json: parse JSON array of flat objects, extract string/number values
 * - other editors: return raw content text
 */
function getContentSearchText(note: NoteItem): string {
    const { content } = note;
    if (!content.content) return "";

    // Grid JSON: parse and extract flat object values (string/number only)
    if (content.editor === "grid-json" && content.language === "json") {
        try {
            const parsed = JSON.parse(content.content);
            if (!Array.isArray(parsed)) return content.content;
            const parts: string[] = [];
            for (const row of parsed) {
                if (typeof row !== "object" || row === null) continue;
                for (const val of Object.values(row)) {
                    if (typeof val === "string" || typeof val === "number") {
                        parts.push(String(val));
                    }
                }
            }
            return parts.join(" ");
        } catch {
            return content.content;
        }
    }

    return content.content;
}

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
    // Tags list
    tags: [] as string[],
    tagsSize: {} as { [key: string]: number },
    // Filtering
    selectedCategory: "" as string, // empty means "All"
    selectedTag: "" as string,      // empty means no tag filter
    searchText: "" as string,       // search across category, tags, title
    filteredNotes: [] as NoteItem[],
    expandedNoteId: "" as string, // empty = no note expanded
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
    /** Previous filter state for incremental search optimization */
    private lastFilterState = { searchText: "", selectedCategory: "", selectedTag: "", expandedPanel: "" };

    setGridModel = (model: RenderGridModel | null) => {
        this.gridModel = model;
    };

    private onDataChanged = () => {
        const { data, error } = this.state.get();
        // Don't serialize when there's a parse error - preserves the user's raw content
        if (error) return;
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
            // Build category tree, tags list and apply filters
            this.loadCategories();
            this.loadTags();
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
        const { expandedPanel, selectedCategory, selectedTag, searchText } = this.state.get();

        // Initialize based on current filter context
        let category = "";
        let tags: string[] = [];
        let title = "";

        if (expandedPanel === "categories" && selectedCategory) {
            // Filter by category → assign category only
            category = selectedCategory;
        } else if (expandedPanel === "tags" && selectedTag) {
            // Filter by tag → assign tag only
            tags = [selectedTag];
        }

        // If search text present → use as title
        if (searchText.trim()) {
            title = searchText.trim();
        }

        const newNote: NoteItem = {
            id: uuid(),
            title,
            category,
            tags,
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
        this.loadTags();
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
        // Re-apply filters when switching panels (filtering is panel-specific)
        this.applyFilters();
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
    // Tag management
    // =========================================================================

    /**
     * Extract all unique tags from notes and calculate counts.
     * For categorized tags like "release:1.0.1":
     * - Parent "release:" gets sum of all "release:*" tags
     * - Child "release:1.0.1" gets its own count
     */
    loadTags = () => {
        const notes = this.state.get().data.notes;
        const tagsSet = new Set<string>();
        const tagsSize: { [key: string]: number } = {};
        const separator = ":";

        // Total count for "All" (empty string key)
        tagsSize[""] = notes.length;

        notes.forEach((note) => {
            note.tags?.forEach((tag) => {
                tagsSet.add(tag);

                // Count for the exact tag
                tagsSize[tag] = (tagsSize[tag] || 0) + 1;

                // If categorized tag, also count towards parent
                const sepIndex = tag.indexOf(separator);
                if (sepIndex > 0 && sepIndex < tag.length - 1) {
                    // Has separator with content on both sides (e.g., "release:1.0.1")
                    const parentTag = tag.slice(0, sepIndex) + separator;
                    tagsSize[parentTag] = (tagsSize[parentTag] || 0) + 1;
                }
            });
        });

        this.state.update((s) => {
            s.tags = Array.from(tagsSet);
            s.tagsSize = tagsSize;
        });
    };

    setSelectedTag = (tag: string) => {
        this.state.update((s) => {
            s.selectedTag = tag;
        });
        this.applyFilters();
    };

    getTagSize = (tag: string): number | undefined => {
        return this.state.get().tagsSize[tag];
    };

    // =========================================================================
    // Search
    // =========================================================================

    setSearchText = (text: string) => {
        this.state.update((s) => {
            s.searchText = text;
        });
        this.applyFilters();
    };

    clearSearch = () => {
        this.setSearchText("");
    };

    // =========================================================================
    // Filtering
    // =========================================================================

    /**
     * Apply all active filters and update filteredNotes state.
     * Filters by EITHER selectedCategory OR selectedTag based on which panel is expanded.
     * Search text filtering is applied additionally (AND condition).
     */
    applyFilters = () => {
        const { data, selectedCategory, selectedTag, expandedPanel, searchText, filteredNotes } = this.state.get();
        const last = this.lastFilterState;

        // Optimization: if only search text grew (user typing), filter from previous results
        const searchExtended = searchText.startsWith(last.searchText) && last.searchText !== "";
        const categoryTagUnchanged =
            selectedCategory === last.selectedCategory &&
            selectedTag === last.selectedTag &&
            expandedPanel === last.expandedPanel;

        let filtered: NoteItem[];

        if (searchExtended && categoryTagUnchanged) {
            // Previous filteredNotes already have category/tag + old search applied.
            // Since new search is a superset, we can filter from the smaller set.
            filtered = filteredNotes;
        } else {
            filtered = data.notes;

            // Filter by category (only when categories panel is expanded)
            if (expandedPanel === "categories" && selectedCategory) {
                filtered = filtered.filter(
                    (note) => note.category?.startsWith(selectedCategory)
                );
            }

            // Filter by tag (only when tags panel is expanded)
            if (expandedPanel === "tags" && selectedTag) {
                const separator = ":";
                if (selectedTag.endsWith(separator)) {
                    // Parent tag selected (e.g., "release:") - match all tags starting with it
                    filtered = filtered.filter((note) =>
                        note.tags?.some((tag) => tag.startsWith(selectedTag) || tag === selectedTag)
                    );
                } else {
                    // Exact tag match (simple tag or specific subcategory)
                    filtered = filtered.filter((note) =>
                        note.tags?.includes(selectedTag)
                    );
                }
            }
        }

        // Filter by search text (applied additionally to category/tag filter)
        // Multiple words use AND condition - all words must be found across searchable fields
        if (searchText.trim()) {
            const searchWords = searchText.toLowerCase().trim().split(/\s+/);
            filtered = filtered.filter((note) => {
                // Build searchable text from metadata: category, tags, title, comment
                const searchableText = [
                    note.category || "",
                    note.title || "",
                    note.comment || "",
                    ...(note.tags || []),
                    getContentSearchText(note),
                ].join(" ").toLowerCase();

                // All search words must be found (AND condition)
                return searchWords.every((word) => searchableText.includes(word));
            });
        }

        // Save filter state for next incremental optimization
        this.lastFilterState = { searchText, selectedCategory, selectedTag, expandedPanel };

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
        this.loadTags();
        this.applyFilters();
    };

    expandNote = (id: string) => {
        this.state.update((s) => {
            s.expandedNoteId = id;
        });
    };

    collapseNote = () => {
        this.state.update((s) => {
            s.expandedNoteId = "";
        });
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
        this.applyFilters();
    };

    updateNoteComment = (id: string, comment: string) => {
        this.state.update((s) => {
            const note = s.data.notes.find((n) => n.id === id);
            if (note) {
                note.comment = comment;
                note.updatedDate = new Date().toISOString();
            }
        });
        this.applyFilters();
    };

    removeComment = (id: string) => {
        this.state.update((s) => {
            const note = s.data.notes.find((n) => n.id === id);
            if (note) {
                note.comment = undefined;
            }
        });
        this.applyFilters();
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
        // Re-apply filters to sync filteredNotes with updated data.notes
        this.applyFilters();
    };

    updateNoteLanguage = (id: string, language: string) => {
        this.state.update((s) => {
            const note = s.data.notes.find((n) => n.id === id);
            if (note) {
                note.content.language = language;
                note.updatedDate = new Date().toISOString();
            }
        });
        this.applyFilters();
    };

    updateNoteEditor = (id: string, editor: string) => {
        this.state.update((s) => {
            const note = s.data.notes.find((n) => n.id === id);
            if (note) {
                note.content.editor = editor;
                note.updatedDate = new Date().toISOString();
            }
        });
        this.applyFilters();
    };

    updateNoteTitle = (id: string, title: string) => {
        this.state.update((s) => {
            const note = s.data.notes.find((n) => n.id === id);
            if (note) {
                note.title = title;
                note.updatedDate = new Date().toISOString();
            }
        });
        this.applyFilters();
    };

    updateNoteCategory = (id: string, category: string) => {
        this.state.update((s) => {
            const note = s.data.notes.find((n) => n.id === id);
            if (note) {
                note.category = category;
                note.updatedDate = new Date().toISOString();
            }
        });
        // Reload categories (new category might have been created)
        this.loadCategories();
        // Re-apply filters (note might need to be filtered out)
        this.applyFilters();
    };

    addNoteTag = (id: string, tag: string) => {
        this.state.update((s) => {
            const note = s.data.notes.find((n) => n.id === id);
            if (note) {
                note.tags = [...note.tags, tag];
                note.updatedDate = new Date().toISOString();
            }
        });
        this.loadTags();
        this.applyFilters();
    };

    removeNoteTag = (id: string, tagIndex: number) => {
        this.state.update((s) => {
            const note = s.data.notes.find((n) => n.id === id);
            if (note) {
                note.tags = note.tags.filter((_, i) => i !== tagIndex);
                note.updatedDate = new Date().toISOString();
            }
        });
        this.loadTags();
        this.applyFilters();
    };

    updateNoteTag = (id: string, tagIndex: number, newTag: string) => {
        this.state.update((s) => {
            const note = s.data.notes.find((n) => n.id === id);
            if (note && tagIndex >= 0 && tagIndex < note.tags.length) {
                note.tags[tagIndex] = newTag;
                note.updatedDate = new Date().toISOString();
            }
        });
        this.loadTags();
        this.applyFilters();
    };

    // =========================================================================
    // Drag-and-drop
    // =========================================================================

    /**
     * Handle drop onto a category tree node.
     * Dispatches based on drag item type (note or category).
     */
    categoryDrop = (dropItem: CategoryTreeItem, dragItem: DragItem) => {
        if (dragItem.type === NOTE_DRAG) {
            // Dropping a note onto a category → change note's category
            this.updateNoteCategory(dragItem.noteId, dropItem.category);
        } else if (dragItem.type === CATEGORY_DRAG) {
            // Dropping a category onto another → reparent
            this.moveCategory(dragItem.category, dropItem.category);
        }
    };

    /**
     * Get drag item for a category tree node.
     * Returns null for root category (not draggable).
     */
    getCategoryDragItem = (item: CategoryTreeItem): DragItem | null => {
        if (!item.category) return null; // Root "All" is not draggable
        return { type: CATEGORY_DRAG, category: item.category };
    };

    /**
     * Move all notes from one category to become a child of another category.
     * E.g., moving "work" into "personal" renames "work" → "personal/work",
     * and "work/tasks" → "personal/work/tasks".
     */
    moveCategory = async (fromCategory: string, toCategory: string) => {
        // Can't move root
        if (!fromCategory) return;
        // Can't move to self
        if (fromCategory === toCategory) return;
        // Can't move to own descendant (circular)
        if (toCategory.startsWith(fromCategory + "/")) return;

        // Compute new category path: target/leafName
        const leafName = fromCategory.split("/").pop() || "";
        const newCategory = toCategory ? `${toCategory}/${leafName}` : leafName;

        // No-op if already at this path
        if (newCategory === fromCategory) return;

        // Count affected notes
        const notes = this.state.get().data.notes;
        const count = notes.filter(
            (n) => n.category === fromCategory || n.category.startsWith(fromCategory + "/")
        ).length;

        const result = await showConfirmationDialog({
            title: "Move Category",
            message: `Move ${count} note${count !== 1 ? "s" : ""} from "${fromCategory}" to "${newCategory}"?`,
            buttons: ["Move", "Cancel"],
        });

        if (result !== "Move") return;

        this.state.update((s) => {
            for (const note of s.data.notes) {
                if (note.category === fromCategory) {
                    note.category = newCategory;
                } else if (note.category.startsWith(fromCategory + "/")) {
                    note.category = newCategory + note.category.slice(fromCategory.length);
                }
            }
            // Follow the moved category if it was selected
            const sel = s.selectedCategory;
            if (sel === fromCategory) {
                s.selectedCategory = newCategory;
            } else if (sel.startsWith(fromCategory + "/")) {
                s.selectedCategory = newCategory + sel.slice(fromCategory.length);
            }
        });
        this.loadCategories();
        this.applyFilters();
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

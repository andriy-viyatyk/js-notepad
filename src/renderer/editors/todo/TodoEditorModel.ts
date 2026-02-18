import { debounce } from "../../../shared/utils";
import { TComponentModel } from "../../core/state/model";
import RenderGridModel from "../../components/virtualization/RenderGrid/RenderGridModel";
import { uuid } from "../../core/utils/node-utils";
import { showConfirmationDialog } from "../../features/dialogs/ConfirmationDialog";
import { alertWarning } from "../../features/dialogs/alerts/AlertsBar";
import { TodoItem, TodoTag, TodoData, TodoEditorProps, ListCount } from "./todoTypes";

// =============================================================================
// State
// =============================================================================

export const defaultTodoEditorState = {
    data: { lists: [], tags: [], items: [], state: {} } as TodoData,
    error: undefined as string | undefined,
    leftPanelWidth: 200,
    // Lists
    listCounts: {} as { [listName: string]: ListCount },
    selectedList: "" as string, // empty means "All"
    // Tags
    selectedTag: "" as string, // empty means "All Tags"
    // Filtering
    searchText: "" as string,
    filteredItems: [] as TodoItem[],
};

export type TodoEditorState = typeof defaultTodoEditorState;

// =============================================================================
// Model
// =============================================================================

export class TodoEditorModel extends TComponentModel<
    TodoEditorState,
    TodoEditorProps
> {
    private lastSerializedData: TodoData | null = null;
    private stateChangeSubscription: (() => void) | undefined;
    /** Flag to skip reloading content that we just serialized ourselves */
    private skipNextContentUpdate = false;
    /** Grid model ref for virtualized list updates */
    gridModel: RenderGridModel | null = null;
    /** Previous filter state for incremental search optimization */
    private lastFilterState = { searchText: "", selectedList: "", selectedTag: "" };

    setGridModel = (model: RenderGridModel | null) => {
        this.gridModel = model;
    };

    // =========================================================================
    // Serialization
    // =========================================================================

    private onDataChanged = () => {
        const { data, error } = this.state.get();
        // Don't serialize when there's a parse error - preserves the user's raw content
        if (error) return;
        // Compare only content-relevant parts (items, lists, tags), not UI state (heights).
        // This prevents ResizeObserver height measurements from marking the file as modified.
        if (
            data.items !== this.lastSerializedData?.items ||
            data.lists !== this.lastSerializedData?.lists ||
            data.tags !== this.lastSerializedData?.tags
        ) {
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

    // =========================================================================
    // Data Loading
    // =========================================================================

    private loadData = (content: string) => {
        if (!content || content.trim() === "") {
            this.state.update((s) => {
                s.data = { lists: [], tags: [], items: [], state: {} };
                s.error = undefined;
            });
            this.lastSerializedData = this.state.get().data;
            return;
        }

        try {
            const parsed = JSON.parse(content);
            const rawLists: string[] = Array.isArray(parsed.lists) ? parsed.lists : [];
            const rawItems: TodoItem[] = Array.isArray(parsed.items) ? parsed.items : [];

            // Deduplicate lists (keep first occurrence)
            const seenLists = new Set<string>();
            const lists: string[] = [];
            for (const list of rawLists) {
                const name = String(list);
                if (!seenLists.has(name)) {
                    seenLists.add(name);
                    lists.push(name);
                }
            }

            // Parse tags (deduplicate by name)
            const rawTags: TodoTag[] = Array.isArray(parsed.tags) ? parsed.tags : [];
            const seenTags = new Set<string>();
            const tags: TodoTag[] = [];
            for (const raw of rawTags) {
                const tag = this.normalizeTag(raw);
                if (tag.name && !seenTags.has(tag.name)) {
                    seenTags.add(tag.name);
                    tags.push(tag);
                }
            }

            // Normalize items and handle orphaned list references
            const items = rawItems.map((item) => this.normalizeItem(item));

            // Auto-add orphaned lists (items referencing lists not in the lists array)
            for (const item of items) {
                if (item.list && !seenLists.has(item.list)) {
                    seenLists.add(item.list);
                    lists.push(item.list);
                }
            }

            // Auto-add orphaned tags (items referencing tags not in the tags array)
            for (const item of items) {
                if (item.tag && !seenTags.has(item.tag)) {
                    seenTags.add(item.tag);
                    tags.push({ name: item.tag, color: "" });
                }
            }

            // Preserve per-item UI state (e.g., content heights)
            const itemState = (parsed.state && typeof parsed.state === "object")
                ? parsed.state as TodoData["state"]
                : {};

            this.state.update((s) => {
                s.data = { lists, tags, items, state: itemState };
                s.error = undefined;
            });
            this.lastSerializedData = this.state.get().data;
            this.loadListCounts();
            this.applyFilters();
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            this.state.update((s) => {
                s.error = message;
            });
        }
    };

    /** Normalize a raw item from JSON, applying sensible defaults for missing fields */
    private normalizeItem = (raw: Partial<TodoItem>): TodoItem => {
        return {
            id: raw.id || uuid(),
            list: raw.list || "",
            title: raw.title || "",
            done: raw.done === true,
            createdDate: raw.createdDate || new Date().toISOString(),
            doneDate: raw.doneDate || null,
            comment: raw.comment !== undefined ? raw.comment : null,
            tag: raw.tag || null,
        };
    };

    /** Normalize a raw tag from JSON */
    private normalizeTag = (raw: Partial<TodoTag>): TodoTag => {
        return {
            name: typeof raw.name === "string" ? raw.name.trim() : "",
            color: typeof raw.color === "string" ? raw.color : "",
        };
    };

    // =========================================================================
    // List counts
    // =========================================================================

    loadListCounts = () => {
        const { lists, items } = this.state.get().data;
        const listCounts: { [listName: string]: ListCount } = {};

        // Initialize counts for all lists
        for (const list of lists) {
            listCounts[list] = { undone: 0, total: 0 };
        }

        // "All" count
        let totalUndone = 0;
        let totalAll = 0;

        for (const item of items) {
            totalAll++;
            if (!item.done) totalUndone++;

            if (listCounts[item.list]) {
                listCounts[item.list].total++;
                if (!item.done) listCounts[item.list].undone++;
            }
        }

        listCounts[""] = { undone: totalUndone, total: totalAll };

        this.state.update((s) => {
            s.listCounts = listCounts;
        });
    };

    getListCount = (listName: string): ListCount | undefined => {
        return this.state.get().listCounts[listName];
    };

    // =========================================================================
    // List selection
    // =========================================================================

    setSelectedList = (listName: string) => {
        this.state.update((s) => {
            s.selectedList = listName;
        });
        this.applyFilters();
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
     * Apply all active filters and update filteredItems state.
     * Filters by selected list, then by selected tag, then by search text (AND condition).
     * Items are sorted: undone first (array order), then done (by doneDate desc).
     */
    applyFilters = () => {
        const { data, selectedList, selectedTag, searchText, filteredItems } = this.state.get();
        const last = this.lastFilterState;

        // Optimization: if only search text grew (user typing), filter from previous results
        const searchExtended = searchText.startsWith(last.searchText) && last.searchText !== "";
        const listUnchanged = selectedList === last.selectedList;
        const tagUnchanged = selectedTag === last.selectedTag;

        let filtered: TodoItem[];

        if (searchExtended && listUnchanged && tagUnchanged) {
            filtered = filteredItems;
        } else {
            filtered = data.items;

            // Filter by selected list
            if (selectedList) {
                filtered = filtered.filter((item) => item.list === selectedList);
            }

            // Filter by selected tag
            if (selectedTag) {
                filtered = filtered.filter((item) => item.tag === selectedTag);
            }
        }

        // Filter by search text (multi-word AND condition)
        if (searchText.trim()) {
            const searchWords = searchText.toLowerCase().trim().split(/\s+/);
            filtered = filtered.filter((item) => {
                const searchableText = [
                    item.title || "",
                    item.comment || "",
                    item.list || "",
                    item.tag || "",
                ].join(" ").toLowerCase();

                return searchWords.every((word) => searchableText.includes(word));
            });
        }

        // Sort: undone first (preserve array order), then done (by doneDate desc)
        const undone = filtered.filter((item) => !item.done);
        const done = filtered.filter((item) => item.done);
        done.sort((a, b) => {
            const dateA = a.doneDate ? new Date(a.doneDate).getTime() : 0;
            const dateB = b.doneDate ? new Date(b.doneDate).getTime() : 0;
            return dateB - dateA; // Newest done first
        });

        const sorted = [...undone, ...done];

        // Save filter state for next incremental optimization
        this.lastFilterState = { searchText, selectedList, selectedTag };

        this.state.update((s) => {
            s.filteredItems = sorted;
        });
    };

    // =========================================================================
    // Item CRUD
    // =========================================================================

    addItem = (title: string) => {
        const { selectedList, selectedTag } = this.state.get();
        if (!selectedList) return; // Can't add to "All"

        const now = new Date().toISOString();
        const newItem: TodoItem = {
            id: uuid(),
            list: selectedList,
            title,
            done: false,
            createdDate: now,
            doneDate: null,
            comment: null,
            tag: selectedTag || null,
        };

        // Add at the beginning of items array (appears at top of undone)
        this.state.update((s) => {
            s.data.items.unshift(newItem);
        });
        this.loadListCounts();
        this.applyFilters();
    };

    toggleItem = (id: string) => {
        const now = new Date().toISOString();
        this.state.update((s) => {
            const item = s.data.items.find((i) => i.id === id);
            if (item) {
                item.done = !item.done;
                item.doneDate = item.done ? now : null;
            }
        });
        this.loadListCounts();
        this.applyFilters();
    };

    updateItemTitle = (id: string, title: string) => {
        this.state.update((s) => {
            const item = s.data.items.find((i) => i.id === id);
            if (item) {
                item.title = title;
            }
        });
        this.applyFilters();
    };

    addComment = (id: string) => {
        this.state.update((s) => {
            const item = s.data.items.find((i) => i.id === id);
            if (item && item.comment === null) {
                item.comment = "";
            }
        });
        this.applyFilters();
    };

    updateItemComment = (id: string, comment: string) => {
        this.state.update((s) => {
            const item = s.data.items.find((i) => i.id === id);
            if (item) {
                item.comment = comment;
            }
        });
        this.applyFilters();
    };

    removeComment = (id: string) => {
        this.state.update((s) => {
            const item = s.data.items.find((i) => i.id === id);
            if (item) {
                item.comment = null;
            }
        });
        this.applyFilters();
    };

    deleteItem = async (id: string) => {
        const item = this.state.get().data.items.find((i) => i.id === id);
        const itemTitle = item?.title || "this item";

        const result = await showConfirmationDialog({
            title: "Delete Todo Item",
            message: `Are you sure you want to delete "${itemTitle}"?`,
            buttons: ["Delete", "Cancel"],
        });

        if (result !== "Delete") return;

        this.state.update((s) => {
            s.data.items = s.data.items.filter((i) => i.id !== id);
        });
        this.loadListCounts();
        this.applyFilters();
    };

    // =========================================================================
    // Item reordering (undone items only)
    // =========================================================================

    /**
     * Move an undone item to a new position within the items array.
     * Only undone items can be reordered. The move is performed in the
     * full data.items array (not the filtered view).
     * Shows warnings when reordering is not possible due to active filters.
     */
    moveItem = (fromId: string, toId: string) => {
        const { selectedList, selectedTag } = this.state.get();

        if (!selectedList) {
            alertWarning("Select a specific list to reorder items");
            return;
        }
        if (selectedTag) {
            alertWarning("Deselect tag filter to reorder items");
            return;
        }

        this.state.update((s) => {
            const items = s.data.items;
            const fromIndex = items.findIndex((i) => i.id === fromId);
            const toIndex = items.findIndex((i) => i.id === toId);

            if (fromIndex === -1 || toIndex === -1) return;
            if (items[fromIndex].done) return; // Can't reorder done items

            // Remove from old position and insert at new position
            const [moved] = items.splice(fromIndex, 1);
            items.splice(toIndex, 0, moved);
        });
        this.applyFilters();
    };

    // =========================================================================
    // List management
    // =========================================================================

    addList = (name: string): boolean => {
        const trimmed = name.trim();
        if (!trimmed) return false;

        const { lists } = this.state.get().data;
        // Prevent duplicates (case-sensitive)
        if (lists.includes(trimmed)) return false;

        this.state.update((s) => {
            s.data.lists.push(trimmed);
        });
        this.loadListCounts();
        return true;
    };

    renameList = (oldName: string, newName: string): boolean => {
        const trimmed = newName.trim();
        if (!trimmed || trimmed === oldName) return false;

        const { lists } = this.state.get().data;
        // Prevent duplicate names
        if (lists.includes(trimmed)) return false;

        this.state.update((s) => {
            // Rename in lists array
            const index = s.data.lists.indexOf(oldName);
            if (index !== -1) {
                s.data.lists[index] = trimmed;
            }

            // Update all items referencing old name
            for (const item of s.data.items) {
                if (item.list === oldName) {
                    item.list = trimmed;
                }
            }

            // Follow renamed list if it was selected
            if (s.selectedList === oldName) {
                s.selectedList = trimmed;
            }
        });
        this.loadListCounts();
        this.applyFilters();
        return true;
    };

    deleteList = async (name: string) => {
        const itemCount = this.state.get().data.items.filter((i) => i.list === name).length;

        const result = await showConfirmationDialog({
            title: "Delete List",
            message: `Delete list "${name}" and all ${itemCount} item${itemCount !== 1 ? "s" : ""}?`,
            buttons: ["Delete", "Cancel"],
        });

        if (result !== "Delete") return;

        this.state.update((s) => {
            s.data.lists = s.data.lists.filter((l) => l !== name);
            s.data.items = s.data.items.filter((i) => i.list !== name);

            // Reset selection if deleted list was selected
            if (s.selectedList === name) {
                s.selectedList = "";
            }
        });
        this.loadListCounts();
        this.applyFilters();
    };

    // =========================================================================
    // Tag selection
    // =========================================================================

    setSelectedTag = (tagName: string) => {
        this.state.update((s) => {
            s.selectedTag = tagName;
        });
        this.applyFilters();
    };

    // =========================================================================
    // Tag management
    // =========================================================================

    addTag = (name: string): boolean => {
        const trimmed = name.trim();
        if (!trimmed) return false;

        const { tags } = this.state.get().data;
        if (tags.some((t) => t.name === trimmed)) return false;

        this.state.update((s) => {
            s.data.tags.push({ name: trimmed, color: "" });
        });
        return true;
    };

    renameTag = (oldName: string, newName: string): boolean => {
        const trimmed = newName.trim();
        if (!trimmed || trimmed === oldName) return false;

        const { tags } = this.state.get().data;
        if (tags.some((t) => t.name === trimmed)) return false;

        this.state.update((s) => {
            const tag = s.data.tags.find((t) => t.name === oldName);
            if (tag) tag.name = trimmed;

            // Update all items referencing old tag name
            for (const item of s.data.items) {
                if (item.tag === oldName) {
                    item.tag = trimmed;
                }
            }

            // Follow renamed tag if it was selected
            if (s.selectedTag === oldName) {
                s.selectedTag = trimmed;
            }
        });
        this.applyFilters();
        return true;
    };

    updateTagColor = (tagName: string, color: string) => {
        this.state.update((s) => {
            const tag = s.data.tags.find((t) => t.name === tagName);
            if (tag) tag.color = color;
        });
    };

    deleteTag = async (name: string) => {
        const itemCount = this.state.get().data.items.filter((i) => i.tag === name).length;

        const result = await showConfirmationDialog({
            title: "Delete Tag",
            message: `Delete tag "${name}"?${itemCount > 0 ? ` It will be removed from ${itemCount} item${itemCount !== 1 ? "s" : ""}.` : ""}`,
            buttons: ["Delete", "Cancel"],
        });

        if (result !== "Delete") return;

        this.state.update((s) => {
            s.data.tags = s.data.tags.filter((t) => t.name !== name);

            // Remove tag from all items (don't delete items)
            for (const item of s.data.items) {
                if (item.tag === name) {
                    item.tag = null;
                }
            }

            // Reset selection if deleted tag was selected
            if (s.selectedTag === name) {
                s.selectedTag = "";
            }
        });
        this.applyFilters();
    };

    // =========================================================================
    // Item tag assignment
    // =========================================================================

    setItemTag = (id: string, tagName: string | null) => {
        this.state.update((s) => {
            const item = s.data.items.find((i) => i.id === id);
            if (item) {
                item.tag = tagName;
            }
        });
        this.applyFilters();
    };

    /** Get tag definition by name */
    getTag = (name: string): TodoTag | undefined => {
        return this.state.get().data.tags.find((t) => t.name === name);
    };

    // =========================================================================
    // UI state
    // =========================================================================

    setLeftPanelWidth = (width: number) => {
        this.state.update((s) => {
            s.leftPanelWidth = width;
        });
    };

    // =========================================================================
    // Item height persistence (for RenderFlexGrid initial sizing)
    // =========================================================================

    getItemHeight = (id: string): number | undefined => {
        return this.state.get().data.state[id]?.contentHeight;
    };

    setItemHeight = (id: string, height: number) => {
        const currentHeight = this.getItemHeight(id);
        if (currentHeight === height) return;
        this.state.update((s) => {
            if (!s.data.state[id]) {
                s.data.state[id] = {};
            }
            s.data.state[id].contentHeight = height;
        });
    };
}

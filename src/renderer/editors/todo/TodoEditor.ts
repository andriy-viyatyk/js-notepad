import { TComponentState } from "../../core/state/state";
import {
    EditorModel,
    type EditorStateBase,
    type RestoreData,
} from "../base/EditorModel";
import { CONTENT_HOST_TRAIT, type IContentHostTrait } from "../base/editor-traits";
import type { IContentHost } from "../base/IContentHost";
import { ComponentQueue } from "../../core/state/ComponentQueue";
import type { EditorDescriptor, HostDescriptor } from "../../../shared/persistence";
import type { IContentPipe } from "../../api/types/io.pipe";
import type { IPageHost } from "../../api/pages/IPageHost";
import { TextFileModel, newTextFileModel } from "../text/TextEditorModel";
import { editorRegistry } from "../base/editorRegistry";
import { fpBasename } from "../../core/utils/file-path";
import { ui } from "../../api/ui";
import { debounce } from "../../../shared/utils";
import type { RenderGridModel } from "../../uikit/RenderGrid";
import type { ListCount, TodoData, TodoItem, TodoTag } from "./todoTypes";

export type TodoQueueEvent = { type: "focus" };
export type TodoQueueRequest = never;

/**
 * HS1 host-slot shape — the two per-window UI fields ride
 * `host.editorSettings["todo-view"]`. Survives Todo↔Monaco switches AND app
 * restarts. Replaces today's `<host.id>:todo-editor` cache file.
 */
interface TodoViewSettings {
    selectedList?: string;
    selectedTag?: string;
}

export interface TodoEditorState extends EditorStateBase {
    // HS1 — ride host.editorSettings["todo-view"]:
    selectedList: string;
    selectedTag: string;
    // View-derived — present on state for reactivity, stripped from
    // getRestoreData. Recomputed from host content via loadData.
    data: TodoData;
    error: string | undefined;
    listCounts: { [listName: string]: ListCount };
    filteredItems: TodoItem[];
    // Transient UI state — not persisted:
    searchText: string;
}

export const defaultTodoEditorState: TodoEditorState = {
    id: "",
    title: "",
    modified: false,
    secondaryView: undefined,
    selectedList: "",
    selectedTag: "",
    data: { lists: [], tags: [], items: [], state: {} },
    error: undefined,
    listCounts: {},
    filteredItems: [],
    searchText: "",
};

function isLegacyTextFileHost(host: unknown): host is TextFileModel {
    return (host as { type?: string } | null)?.type === "textFile";
}

// Single combined Lists+Tags panel (labeled "Todo"). Registered once in
// adoptHost, constant for the editor's life on the page. The base
// beforeNavigateAway clears it on navigate-away (Pattern-B; no survival
// override). The sidebar is mandatory-open per PageModel.sidebarMandatory.
const TODO_PANELS = ["todo-panel"];

export class TodoEditor extends EditorModel<TodoEditorState, void, TodoQueueEvent> {
    readonly editorId = "todo-view";

    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _hostContentUnsub: (() => void) | null = null;
    private _settingsUnsub: (() => void) | null = null;
    private _saveSubUnsub: (() => void) | null = null;
    private _pendingHost: HostDescriptor | undefined = undefined;

    // TD5 — self-write guard. TD4 — ref-equality marker for serialization skip.
    private skipNextContentUpdate = false;
    private lastSerializedData: TodoData | null = null;
    // Incremental-filter optimization (today's pattern preserved):
    private lastFilterState = { searchText: "", selectedList: "", selectedTag: "" };

    // View ref (set by view; not on state):
    gridModel: RenderGridModel | null = null;

    // Save debounce — today's 300ms cadence preserved:
    private onDataChangedDebounced = debounce(() => this.onDataChanged(), 300);

    readonly typedQueue: ComponentQueue<TodoQueueEvent, TodoQueueRequest>;

    constructor(state: TComponentState<TodoEditorState>) {
        super(state);
        this.typedQueue = this.queue as unknown as ComponentQueue<
            TodoQueueEvent,
            TodoQueueRequest
        >;

        const trait: IContentHostTrait = {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) throw new Error("Host already extracted from TodoEditor");
                this._tearDownHostSubscriptions();
                this._host = null;
                return host as unknown as IContentHost;
            },
        };
        this.traits.add(CONTENT_HOST_TRAIT, trait);
    }

    private _tearDownHostSubscriptions(): void {
        this._hostStateUnsub?.();
        this._hostContentUnsub?.();
        this._settingsUnsub?.();
        this._saveSubUnsub?.();
        this._hostStateUnsub = null;
        this._hostContentUnsub = null;
        this._settingsUnsub = null;
        this._saveSubUnsub = null;
    }

    // ── Host accessors ──────────────────────────────────────────────────

    get host(): TextFileModel | null {
        return this._host;
    }

    get contentHost(): IContentHost | null {
        return (this._host as unknown as IContentHost) ?? null;
    }

    findCompatibleEditors(): string[] {
        if (!this._host) return [];
        return editorRegistry.findEditorsAccepting(this._host as unknown as IContentHost);
    }

    getNavigatorTarget(): { pipe?: IContentPipe | null; filePath?: string | null } | null {
        if (!this._host) return null;
        const { filePath } = this._host.state.get();
        const pipe = this._host.pipe;
        if (!pipe && !filePath) return {};
        return { pipe, filePath };
    }

    focus(): void {
        this.typedQueue.send({ type: "focus" });
    }

    // ── Persistence ─────────────────────────────────────────

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        // Identity-only descriptor. The 3 HS1 fields ride the host slot.
        // View-derived (data / listCounts / filteredItems / error /
        // searchText) stripped per MO5 / GR8 / LK2.
        return {
            editorId: this.editorId,
            id: s.id,
            state: {
                title: s.title,
                modified: s.modified,
                secondaryView: s.secondaryView,
            } as Record<string, unknown>,
            host: this._host?.getDescriptor(),
        };
    }

    applyRestoreData(data: RestoreData<TodoEditorState>): void {
        this.state.update((cur) => {
            if (data.title !== undefined) cur.title = data.title;
            if (data.modified !== undefined) cur.modified = data.modified;
            if (data.secondaryView !== undefined) cur.secondaryView = data.secondaryView;
        });
        if (data.host) this._pendingHost = data.host;
    }

    // ── Three-phase lifecycle ──────────────────────────────────────────

    switchFrom(oldEditor: EditorModel): void {
        const trait = oldEditor.traits.get(CONTENT_HOST_TRAIT);
        if (!trait) {
            throw new Error(
                `TodoEditor.switchFrom: ${oldEditor.editorId} has no CONTENT_HOST_TRAIT`,
            );
        }
        const host = trait.extractContentHost() as unknown as TextFileModel;
        if (!isLegacyTextFileHost(host)) {
            throw new Error("TodoEditor.switchFrom: extracted host is not a TextFileModel");
        }
        this.state.update((s) => {
            s.id = oldEditor.id;
        });
        host.state.update((s) => {
            s.editor = this.editorId;
        });
        this.adoptHost(host);
        this.loadData(host.state.get().content ?? "");
    }

    async restore(): Promise<void> {
        try {
            if (!this._host) {
                this._host = this._pendingHost
                    ? await TextFileModel.fromDescriptor(this._pendingHost)
                    : newTextFileModel("");
            }
            if (!this._host.state.get().restored) {
                await this._host.restore();
            }
            this.adoptHost(this._host);
            this.loadData(this._host.state.get().content ?? "");
        } catch (err) {
            ui.notify((err as Error).message || "Failed to restore Todo editor.", "error");
            this._host = newTextFileModel("");
            this.adoptHost(this._host);
        }
        this._pendingHost = undefined;
    }

    /** Adopt a host without going through `switchFrom`. Used by
     *  `attachEditorToPage` when constructing a fresh TodoEditor over a
     *  freshly-restored legacy TextFileModel. */
    adoptHost(host: TextFileModel): void {
        this._host = host;
        this._tearDownHostSubscriptions();

        this.secondaryView = TODO_PANELS;

        // Forward host metadata changes to descriptorChanged (P3 debounce).
        this._hostStateUnsub = host.state.subscribe(() =>
            this.descriptorChanged.send(undefined),
        );

        // TD4 + TD5 — re-parse on external content changes; skipNext guard
        // prevents the loop from our own serialize-back writes.
        this._hostContentUnsub = host.state.subscribe(
            (content) => {
                if (this.skipNextContentUpdate) {
                    this.skipNextContentUpdate = false;
                    return;
                }
                this.loadData(content as string);
            },
            (s) => s.content,
        );

        // HS1 — seed the 3 selection fields from host slot (sync, no flicker).
        const saved = host.getEditorState<TodoViewSettings>(this.editorId);
        if (saved) {
            this.state.update((s) => {
                if (saved.selectedList !== undefined) s.selectedList = saved.selectedList;
                if (saved.selectedTag !== undefined) s.selectedTag = saved.selectedTag;
            });
        }

        // HS1 — mirror back. Slice-subscribe over a composite key so the
        // mirror fires on any of the 3 slot fields but NOT on data /
        // derived / transient mutations.
        this._settingsUnsub = this.state.subscribe(
            () => {
                if (!this._host) return;
                const s = this.state.get();
                this._host.setEditorState<TodoViewSettings>(this.editorId, {
                    selectedList: s.selectedList,
                    selectedTag: s.selectedTag,
                });
            },
            (s) => `${s.selectedList}|${s.selectedTag}`,
        );

        // TD4 — state subscription → debounced serialize-back. Replaces
        // today's TodoViewModel.onInit subscription.
        this._saveSubUnsub = this.state.subscribe(() => this.onDataChangedDebounced());

        const { filePath, title } = host.state.get();
        this.state.update((s) => {
            s.title = title || (filePath ? fpBasename(filePath) : s.title || "untitled.todo.json");
            if (host.state.get().id) s.id = host.state.get().id;
        });
        host.state.update((s) => {
            if (s.editor !== this.editorId) s.editor = this.editorId;
        });
        if (this.page) host.setPage(this.page);
        this._seedActivePanel();
    }

    setPage(page: IPageHost | null): void {
        super.setPage(page);
        this._host?.setPage(page);
        // Fresh-open path: adoptHost ran before the page was attached, so make
        // the single Todo panel the active (expanded) one once the page is
        // present and the panel is registered.
        if (page && this.contributesPanels()) this._seedActivePanel();
    }

    /** Make the single Todo panel the active/expanded one. CollapsiblePanelStack
     *  collapses any panel whose id !== activePanel, so a lone panel still needs
     *  this. No-op when no page is attached. */
    private _seedActivePanel(): void {
        if (!this.page) return;
        this.page.expandPanel("todo-panel");
    }

    // ────────────────────────────────────────────────────────────────────
    // BELOW: methods relocated from legacy TodoViewModel.
    // Substitutions: `this.host` → `this._host`; the cache-file selection-
    // state mechanics (`restoreSelectionState`, `saveSelectionState`,
    // `saveSelectionStateDebounced`, `selectionRestored`, `static cacheName`)
    // are dropped — replaced by the HS1 slice-subscribe mirror above.
    // ────────────────────────────────────────────────────────────────────

    // ── Serialization: state → file content ─────────────────

    private onDataChanged = (): void => {
        const { data, error } = this.state.get();
        // Don't serialize when there's a parse error — preserves the user's
        // raw content for inspection / hand-edit.
        if (error) return;
        if (!this._host) return;
        // Compare only content-relevant parts (items, lists, tags), not UI
        // state (heights). This prevents ResizeObserver height measurements
        // from marking the file as modified.
        if (
            data.items !== this.lastSerializedData?.items ||
            data.lists !== this.lastSerializedData?.lists ||
            data.tags !== this.lastSerializedData?.tags
        ) {
            this.lastSerializedData = data;
            this.skipNextContentUpdate = true;
            const content = JSON.stringify({ type: "todo-editor", ...data }, null, 4);
            this._host.changeContent(content, true);
        }
    };

    // ── Data loading ────────────────────────────────────────────────────

    loadData = (content: string): void => {
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
                // Auto-select when there is exactly one list
                if (lists.length === 1 && !s.selectedList) {
                    s.selectedList = lists[0];
                }
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
            id: raw.id || crypto.randomUUID(),
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

    // ── List counts ─────────────────────────────────────────────────────

    loadListCounts = (): void => {
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

    // ── List selection ──────────────────────────────────────────────────

    setSelectedList = (listName: string): void => {
        this.state.update((s) => {
            s.selectedList = listName;
        });
        this.applyFilters();
        // No cache write — HS1 slice-subscribe handles persistence.
    };

    // ── Search ──────────────────────────────────────────────────────────

    setSearchText = (text: string): void => {
        this.state.update((s) => {
            s.searchText = text;
        });
        this.applyFilters();
    };

    clearSearch = (): void => {
        this.setSearchText("");
    };

    // ── Filtering ───────────────────────────────────────────────────────

    /**
     * Apply all active filters and update filteredItems state.
     * Filters by selected list, then by selected tag, then by search text (AND condition).
     * Items are sorted: undone first (array order), then done (by doneDate desc).
     */
    applyFilters = (): void => {
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

    // ── Item CRUD ───────────────────────────────────────────────────────

    addItem = (title: string): void => {
        const { selectedList, selectedTag } = this.state.get();
        if (!selectedList) return; // Can't add to "All"

        const now = new Date().toISOString();
        const newItem: TodoItem = {
            id: crypto.randomUUID(),
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

    toggleItem = (id: string): void => {
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

    updateItemTitle = (id: string, title: string): void => {
        this.state.update((s) => {
            const item = s.data.items.find((i) => i.id === id);
            if (item) {
                item.title = title;
            }
        });
        this.applyFilters();
    };

    addComment = (id: string): void => {
        this.state.update((s) => {
            const item = s.data.items.find((i) => i.id === id);
            if (item && item.comment === null) {
                item.comment = "";
            }
        });
        this.applyFilters();
    };

    updateItemComment = (id: string, comment: string): void => {
        this.state.update((s) => {
            const item = s.data.items.find((i) => i.id === id);
            if (item) {
                item.comment = comment;
            }
        });
        this.applyFilters();
    };

    removeComment = (id: string): void => {
        this.state.update((s) => {
            const item = s.data.items.find((i) => i.id === id);
            if (item) {
                item.comment = null;
            }
        });
        this.applyFilters();
    };

    deleteItem = async (id: string, skipConfirm = false): Promise<void> => {
        if (!skipConfirm) {
            const item = this.state.get().data.items.find((i) => i.id === id);
            const itemTitle = item?.title || "this item";

            const result = await ui.confirm(
                `Are you sure you want to delete "${itemTitle}"?`,
                { title: "Delete Todo Item", buttons: ["Delete", "Cancel"] },
            );

            if (result !== "Delete") return;
        }

        this.state.update((s) => {
            s.data.items = s.data.items.filter((i) => i.id !== id);
        });
        this.loadListCounts();
        this.applyFilters();
    };

    // ── Item reordering (undone items only) ─────────────────────────────

    /**
     * Move an undone item to a new position within the items array.
     * Only undone items can be reordered. The move is performed in the
     * full data.items array (not the filtered view).
     * Shows warnings when reordering is not possible due to active filters.
     */
    moveItem = (fromId: string, toId: string): void => {
        const { selectedList, selectedTag } = this.state.get();

        if (!selectedList) {
            ui.notify("Select a specific list to reorder items", "warning");
            return;
        }
        if (selectedTag) {
            ui.notify("Deselect tag filter to reorder items", "warning");
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

    // ── List management ─────────────────────────────────────────────────

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

    deleteList = async (name: string, skipConfirm = false): Promise<void> => {
        if (!skipConfirm) {
            const itemCount = this.state.get().data.items.filter((i) => i.list === name).length;

            const result = await ui.confirm(
                `Delete list "${name}" and all ${itemCount} item${itemCount !== 1 ? "s" : ""}?`,
                { title: "Delete List", buttons: ["Delete", "Cancel"] },
            );

            if (result !== "Delete") return;
        }

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

    // ── Tag selection ───────────────────────────────────────────────────

    setSelectedTag = (tagName: string): void => {
        this.state.update((s) => {
            s.selectedTag = tagName;
        });
        this.applyFilters();
        // No cache write — HS1 slice-subscribe handles persistence.
    };

    // ── Tag management ──────────────────────────────────────────────────

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

    updateTagColor = (tagName: string, color: string): void => {
        this.state.update((s) => {
            const tag = s.data.tags.find((t) => t.name === tagName);
            if (tag) tag.color = color;
        });
    };

    deleteTag = async (name: string, skipConfirm = false): Promise<void> => {
        if (!skipConfirm) {
            const itemCount = this.state.get().data.items.filter((i) => i.tag === name).length;

            const result = await ui.confirm(
                `Delete tag "${name}"?${itemCount > 0 ? ` It will be removed from ${itemCount} item${itemCount !== 1 ? "s" : ""}.` : ""}`,
                { title: "Delete Tag", buttons: ["Delete", "Cancel"] },
            );

            if (result !== "Delete") return;
        }

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

    // ── Item tag assignment ─────────────────────────────────────────────

    setItemTag = (id: string, tagName: string | null): void => {
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

    // ── Item height persistence (for RenderFlexGrid initial sizing) ─────

    getItemHeight = (id: string): number | undefined => {
        return this.state.get().data.state[id]?.contentHeight;
    };

    setItemHeight = (id: string, height: number): void => {
        const currentHeight = this.getItemHeight(id);
        if (currentHeight === height) return;
        this.state.update((s) => {
            if (!s.data.state[id]) {
                s.data.state[id] = {};
            }
            s.data.state[id].contentHeight = height;
        });
    };

    // ── Grid model ref ──────────────────────────────────────────────────

    setGridModel = (model: RenderGridModel | null): void => {
        this.gridModel = model;
    };

    // ── Save / release / dispose ────────────────────────────────────────

    async confirmRelease(closing?: boolean): Promise<boolean> {
        return this._host ? this._host.confirmRelease(closing) : true;
    }

    async saveState(): Promise<void> {
        // Flush pending debounced save before host's saveState
        this.onDataChanged();
        await this._host?.io.saveState();
    }

    async dispose(): Promise<void> {
        // Flush pending debounced save (today's onDispose pattern)
        this.onDataChanged();

        this._tearDownHostSubscriptions();
        this.gridModel = null;
        if (this._host) {
            await this._host.dispose();
            this._host = null;
        }
        await super.dispose();
    }
}

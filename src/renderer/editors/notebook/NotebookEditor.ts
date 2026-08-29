import { TComponentState } from "../../core/state/state";
import type { EditorStateBase } from "../base/EditorModel";
import { TextHostEditorModel } from "../base/TextHostEditorModel";
import { ComponentQueue } from "../../core/state/ComponentQueue";
import { TextFileModel } from "../text/TextEditorModel";
import { ui } from "../../api/ui";
import { debounce, errMessage } from "../../../shared/utils";
import { splitWithSeparators } from "../../core/utils/utils";
import { tryParseJson } from "../../core/utils/parse-utils";
import { TraitTypeId, type TraitDragPayload, resolveTraits } from "../../core/traits";
import { LINK } from "../../core/traits";
import type { ILink } from "../../api/types/io.tree";
import type { CategoryItem } from "./category-tree";
import { NoteItem, NotebookData } from "./notebookTypes";

export type NotebookQueueEvent = { type: "focus" };
export type NotebookQueueRequest = never;
export type ExpandedPanel = "tags" | "categories";

/**
 * Host-slot shape — 3 per-window UI fields ride `host.editorSettings["notebook-view"]`.
 * Survives Notebook↔Monaco switches AND app restarts.
 */
interface NotebookViewSettings {
    expandedPanel?: ExpandedPanel;
    selectedCategory?: string;
    selectedTag?: string;
}

export interface NotebookEditorState extends EditorStateBase {
    // HS1 — ride host.editorSettings["notebook-view"]:
    expandedPanel: ExpandedPanel;
    selectedCategory: string;
    selectedTag: string;
    // View-derived — present on state for reactivity, stripped from
    // getRestoreData. Recomputed from host content via loadData /
    // loadCategories / loadTags / applyFilters.
    data: NotebookData;
    error: string | undefined;
    categories: string[];
    categoriesSize: { [key: string]: number };
    tags: string[];
    tagsSize: { [key: string]: number };
    filteredNotes: NoteItem[];
    expandedNoteId: string;
    // Transient UI state — not persisted:
    searchText: string;
}

export const defaultNotebookEditorState: NotebookEditorState = {
    id: "",
    title: "",
    modified: false,
    secondaryView: undefined,
    expandedPanel: "categories",
    selectedCategory: "",
    selectedTag: "",
    data: { notes: [], state: {} },
    error: undefined,
    categories: [],
    categoriesSize: {},
    tags: [],
    tagsSize: {},
    filteredNotes: [],
    expandedNoteId: "",
    searchText: "",
};

/** The two Notebook sidebar panels — registered for the whole time the
 *  Notebook is on a page. Categories first, then Tags (US-602 Concern E). An
 *  Explorer panel, when auto-initialized for a saved notebook, is hoisted above
 *  both by `PageModel.panelEditors`. The set is binary: both panels while the
 *  Notebook is on the page, or gone — the base `beforeNavigateAway` clears it on
 *  navigate-away (Pattern-B; no survival override). */
const NOTEBOOK_PANELS = ["notebook-categories", "notebook-tags"];

// =============================================================================
// Content Search Helper (relocated verbatim from NotebookViewModel)
// =============================================================================

/**
 * Extract searchable text from note content.
 * - grid-json: parse JSON array of flat objects, extract string/number values
 * - other editors: return raw content text
 */
function getContentSearchText(note: NoteItem): string {
    const { content } = note;
    if (!content.content) return "";

    if (content.editor === "grid-json" && content.language === "json") {
        const parsed = tryParseJson<unknown>(content.content, null);
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
    }

    return content.content;
}

// =============================================================================
// Editor class
// =============================================================================

export class NotebookEditor extends TextHostEditorModel<NotebookEditorState, void, NotebookQueueEvent> {
    readonly editorId = "notebook-view";
    protected readonly displayName = "Notebook";

    // NB4 — ref-equality marker for serialization skip.
    private lastSerializedData: NotebookData | null = null;
    // Incremental-filter optimization (today's pattern preserved):
    private lastFilterState = {
        searchText: "",
        selectedCategory: "",
        selectedTag: "",
        expandedPanel: "",
    };

    // Save debounce — today's 300ms cadence preserved:
    private onDataChangedDebounced = debounce(() => this.onDataChanged(), 300);

    readonly typedQueue: ComponentQueue<NotebookQueueEvent, NotebookQueueRequest>;

    constructor(state: TComponentState<NotebookEditorState>) {
        super(state);
        this.typedQueue = this.queue as unknown as ComponentQueue<
            NotebookQueueEvent,
            NotebookQueueRequest
        >;
    }

    protected untitledName(): string {
        return "untitled.note.json";
    }

    /**
     * NB-IMPL5 — expose the host as TextFileModel for script execution context.
     * Used by NoteItemEditModel.runScript to forward script execution against
     * the notebook's underlying page (so `page.content` resolves to the
     * notebook JSON, not the note's content).
     */
    get pageModel(): TextFileModel {
        if (!this._host) {
            throw new Error("NotebookEditor: pageModel accessed before adoptHost");
        }
        return this._host;
    }

    focus(): void {
        this.typedQueue.send({ type: "focus" });
    }

    // ── Host adoption ───────────────────────────────────────────────────

    adoptHost(host: TextFileModel): void {
        super.adoptHost(host);

        // Panels are a property of "the Notebook is on a page" — registered once
        // here, constant for the editor's life. The base beforeNavigateAway
        // clears them on navigate-away (Pattern-B; no survival override). The
        // sidebar is mandatory-open per PageModel.sidebarMandatory.
        // (Panels contribution now runs after the base host attach — accepted
        // micro-difference from the pre-base ordering.)
        this.secondaryView = NOTEBOOK_PANELS;

        // NB4 + NB5 — re-parse on external content changes; the base's echo
        // guard prevents the loop from our own serialize-back writes.
        this.subscribeHostContent((content) => this.loadData(content));

        // HS1 — seed the 3 selection fields from host slot (sync, no flicker)
        // and mirror back. Slice-subscribe over a composite key so the mirror
        // fires on any of the 3 slot fields but NOT on data / derived /
        // transient mutations.
        this.mirrorHostSettings<NotebookViewSettings>(
            (saved) => {
                this.state.update((s) => {
                    if (saved.expandedPanel !== undefined) {
                        s.expandedPanel = saved.expandedPanel;
                    }
                    if (saved.selectedCategory !== undefined) {
                        s.selectedCategory = saved.selectedCategory;
                    }
                    if (saved.selectedTag !== undefined) {
                        s.selectedTag = saved.selectedTag;
                    }
                });
            },
            (s) => ({
                expandedPanel: s.expandedPanel,
                selectedCategory: s.selectedCategory,
                selectedTag: s.selectedTag,
            }),
            (s) => `${s.expandedPanel}|${s.selectedCategory}|${s.selectedTag}`,
        );

        // NB4 — state subscription → debounced serialize-back. Replaces
        // today's NotebookViewModel.onInit subscription.
        this.registerHostSubscription(this.state.subscribe(
            () => this.onDataChangedDebounced(),
            (state) => ({ data: state.data, error: state.error }),
        ));
    }

    protected onHostAttached(host: TextFileModel): void {
        this.loadData(host.state.get().content ?? "");
    }

    // ────────────────────────────────────────────────────────────────────
    // BELOW: methods relocated from legacy NotebookViewModel.
    // Substitutions: `this.host` → `this._host`; lifecycle hooks (onInit,
    // onContentChanged, onDispose) replaced by adoptHost / restore /
    // dispose above.
    // ────────────────────────────────────────────────────────────────────

    // ── Serialization ───────────────────────────────────────

    private onDataChanged = (): void => {
        const { data, error } = this.state.get();
        // Don't serialize when there's a parse error - preserves the user's raw content
        if (error) return;
        if (!this._host) return;
        if (data !== this.lastSerializedData) {
            this.lastSerializedData = data;
            const content = JSON.stringify({ type: "note-editor", ...data }, null, 4);
            this.writeToHost(content, true);
        }
    };

    // ── Data loading ────────────────────────────────────────────────────

    loadData = (content: string): void => {
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
            const message = errMessage(e);
            this.state.update((s) => {
                s.error = message;
            });
        }
    };

    // ── Notes ───────────────────────────────────────────────────────────

    get notesCount(): number {
        return this.state.get().data.notes.length;
    }

    addNote = (): NoteItem => {
        const now = new Date().toISOString();
        const { expandedPanel, selectedCategory, selectedTag, searchText } = this.state.get();

        // Initialize based on current filter context
        let category = "";
        let tags: string[] = [];
        let title = "";

        if (expandedPanel === "categories" && selectedCategory) {
            category = selectedCategory;
        } else if (expandedPanel === "tags" && selectedTag) {
            tags = [selectedTag];
        }

        if (searchText.trim()) {
            title = searchText.trim();
        }

        const newNote: NoteItem = {
            id: crypto.randomUUID(),
            title,
            category,
            tags,
            content: {
                language: "plaintext",
                content: "",
                editor: "monaco",
            },
            createdDate: now,
            updatedDate: now,
        };

        this.state.update((s) => {
            s.data.notes.unshift(newNote);
        });
        this.loadCategories();
        this.loadTags();
        this.applyFilters();
        return newNote;
    };

    setExpandedPanel = (panel: string) => {
        this.state.update((s) => {
            s.expandedPanel = panel as ExpandedPanel;
        });
        // Re-apply filters when switching panels (filtering is panel-specific)
        this.applyFilters();
    };

    // ── Category management ─────────────────────────────────────────────

    loadCategories = () => {
        const notes = this.state.get().data.notes;
        const categoriesSet = new Set<string>();
        const categoriesSize: { [key: string]: number } = {};

        notes.forEach((note) => {
            if (note.category) {
                categoriesSet.add(note.category);
                const categoryPath = splitWithSeparators(note.category, "/\\");
                while (categoryPath.length) {
                    const subCategory = categoryPath.join("/");
                    categoriesSize[subCategory] = (categoriesSize[subCategory] || 0) + 1;
                    categoryPath.pop();
                }
            }
            categoriesSize[""] = (categoriesSize[""] || 0) + 1;
        });

        this.state.update((s) => {
            s.categories = Array.from(categoriesSet);
            s.categoriesSize = categoriesSize;
        });
    };

    categoryItemClick = (item: CategoryItem) => {
        this.setSelectedCategory(item.category);
    };

    setSelectedCategory = (category: string) => {
        this.state.update((s) => {
            s.selectedCategory = category;
        });
        this.applyFilters();
    };

    getCategoryItemSelected = (item: CategoryItem): boolean => {
        return item.category === this.state.get().selectedCategory;
    };

    getCategorySize = (category: string): number | undefined => {
        return this.state.get().categoriesSize[category];
    };

    // ── Tag management ──────────────────────────────────────────────────

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

                tagsSize[tag] = (tagsSize[tag] || 0) + 1;

                const sepIndex = tag.indexOf(separator);
                if (sepIndex > 0 && sepIndex < tag.length - 1) {
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

    // ── Search ──────────────────────────────────────────────────────────

    setSearchText = (text: string) => {
        this.state.update((s) => {
            s.searchText = text;
        });
        this.applyFilters();
    };

    clearSearch = () => {
        this.setSearchText("");
    };

    // ── Filtering ───────────────────────────────────────────────────────

    applyFilters = () => {
        const {
            data,
            selectedCategory,
            selectedTag,
            expandedPanel,
            searchText,
            filteredNotes,
        } = this.state.get();
        const last = this.lastFilterState;

        // Optimization: if only search text grew (user typing), filter from previous results
        const searchExtended =
            searchText.startsWith(last.searchText) && last.searchText !== "";
        const categoryTagUnchanged =
            selectedCategory === last.selectedCategory &&
            selectedTag === last.selectedTag &&
            expandedPanel === last.expandedPanel;

        let filtered: NoteItem[];

        if (searchExtended && categoryTagUnchanged) {
            filtered = filteredNotes;
        } else {
            filtered = data.notes;

            if (expandedPanel === "categories" && selectedCategory) {
                filtered = filtered.filter((note) =>
                    note.category?.startsWith(selectedCategory),
                );
            }

            if (expandedPanel === "tags" && selectedTag) {
                const separator = ":";
                if (selectedTag.endsWith(separator)) {
                    filtered = filtered.filter((note) =>
                        note.tags?.some(
                            (tag) => tag.startsWith(selectedTag) || tag === selectedTag,
                        ),
                    );
                } else {
                    filtered = filtered.filter((note) => note.tags?.includes(selectedTag));
                }
            }
        }

        if (searchText.trim()) {
            const searchWords = searchText.toLowerCase().trim().split(/\s+/);
            filtered = filtered.filter((note) => {
                const searchableText = [
                    note.category || "",
                    note.title || "",
                    note.comment || "",
                    ...(note.tags || []),
                    getContentSearchText(note),
                ]
                    .join(" ")
                    .toLowerCase();

                return searchWords.every((word) => searchableText.includes(word));
            });
        }

        this.lastFilterState = {
            searchText,
            selectedCategory,
            selectedTag,
            expandedPanel,
        };

        this.state.update((s) => {
            s.filteredNotes = filtered;
        });
    };

    deleteNote = async (id: string, skipConfirm = false) => {
        if (!skipConfirm) {
            const note = this.getNote(id);
            const noteTitle = note?.title || "this note";

            const result = await ui.confirm(
                `Are you sure you want to delete "${noteTitle}"?`,
                { title: "Delete Note", buttons: ["Delete", "Cancel"] },
            );

            if (result !== "Delete") {
                return;
            }
        }

        this.state.update((s) => {
            s.data.notes = s.data.notes.filter((note) => note.id !== id);
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

    // ── Note content updates (called by NoteItemEditModel) ──────────────

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
        this.loadCategories();
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

    // ── Drag-and-drop ───────────────────────────────────────────────────

    categoryTraitDrop = (dropItem: CategoryItem, payload: TraitDragPayload) => {
        if (payload.typeId === TraitTypeId.Note) {
            const data = payload.data as { noteId: string };
            this.updateNoteCategory(data.noteId, dropItem.category);
        } else if (payload.typeId === TraitTypeId.NotebookCategory) {
            const data = payload.data as { category: string };
            this.moveCategory(data.category, dropItem.category);
        } else {
            const traits = resolveTraits(payload.typeId);
            const linkTrait = traits?.get(LINK);
            if (!linkTrait) return;
            const items = linkTrait.getItems(payload.data);
            for (const item of items) {
                this.createNoteFromLink(item, dropItem.category);
            }
        }
    };

    private createNoteFromLink = (link: ILink, category: string) => {
        const now = new Date().toISOString();
        const note: NoteItem = {
            id: crypto.randomUUID(),
            title: link.title || link.href,
            category,
            tags: [],
            content: {
                language: "plaintext",
                content: link.href,
            },
            createdDate: now,
            updatedDate: now,
        };
        this.state.update((s) => {
            s.data.notes.unshift(note);
        });
        this.loadCategories();
        this.applyFilters();
    };

    getCategoryDragData = (item: CategoryItem): { category: string } | null => {
        if (!item.category) return null;
        return { category: item.category };
    };

    moveCategory = async (fromCategory: string, toCategory: string) => {
        if (!fromCategory) return;
        if (fromCategory === toCategory) return;
        if (toCategory.startsWith(fromCategory + "/")) return;

        const leafName = fromCategory.split("/").pop() || "";
        const newCategory = toCategory ? `${toCategory}/${leafName}` : leafName;

        if (newCategory === fromCategory) return;

        const notes = this.state.get().data.notes;
        const count = notes.filter(
            (n) => n.category === fromCategory || n.category.startsWith(fromCategory + "/"),
        ).length;

        const result = await ui.confirm(
            `Move ${count} note${count !== 1 ? "s" : ""} from "${fromCategory}" to "${newCategory}"?`,
            { title: "Move Category", buttons: ["Move", "Cancel"] },
        );

        if (result !== "Move") return;

        this.state.update((s) => {
            for (const note of s.data.notes) {
                if (note.category === fromCategory) {
                    note.category = newCategory;
                } else if (note.category.startsWith(fromCategory + "/")) {
                    note.category = newCategory + note.category.slice(fromCategory.length);
                }
            }
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

    // ── Note height persistence (prevents scroll jumping on virtualized remount) ─

    getNoteHeight = (id: string): number | undefined => {
        return this.state.get().data.state[id]?.contentHeight;
    };

    setNoteHeight = (id: string, height: number) => {
        const currentHeight = this.getNoteHeight(id);
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

    // ── Generic state storage (for nested editors like GridEditor) ──────

    /**
     * Get stored state for a note item by name.
     * Consumed by `NoteItemEditModel.stateStorage` so nested editors read/write
     * a per-note slot in `data.state`.
     */
    getNoteState = (id: string, name: string): string | undefined => {
        const noteState = this.state.get().data.state[id];
        const value = noteState?.[name];
        return typeof value === "string" ? value : undefined;
    };

    /**
     * Set state for a note item by name.
     * Consumed by `NoteItemEditModel.stateStorage` so nested editors read/write
     * a per-note slot in `data.state`.
     */
    setNoteState = (id: string, name: string, value: string) => {
        const currentValue = this.getNoteState(id, name);
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

    // ── Save / release / dispose ────────────────────────────────────────

    async saveState(): Promise<void> {
        // Flush pending debounced save before host's saveState
        this.onDataChanged();
        await super.saveState();
    }

    async dispose(): Promise<void> {
        // Flush pending debounced save
        this.onDataChanged();
        await super.dispose();
    }
}

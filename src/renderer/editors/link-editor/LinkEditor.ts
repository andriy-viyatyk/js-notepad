import { TComponentState, TOneState } from "../../core/state/state";
import {
    EditorModel as V4EditorModel,
    type EditorStateBase,
    type RestoreData,
} from "../base/v4/EditorModel";
import { CONTENT_HOST_TRAIT, type IContentHostTrait } from "../base/v4/editor-traits";
import type { IContentHost } from "../base/v4/IContentHost";
import { ComponentQueue } from "../../core/state/ComponentQueue";
import type { EditorDescriptor, HostDescriptor } from "../../../shared/persistence-v4";
import type { IContentPipe } from "../../api/types/io.pipe";
import type { PageModel, NavigationState } from "../../api/pages/PageModel";
import { TextFileModel, newTextFileModel } from "../text/TextEditorModel";
import { editorRegistry as v4Registry } from "../base/v4/editorRegistry";
import { fpBasename } from "../../core/utils/file-path";
import { ui } from "../../api/ui";
import { debounce } from "../../../shared/utils";
import { splitWithSeparators } from "../../core/utils/utils";
import { getHostname } from "../../components/tree-provider/favicon-cache";
import type { RenderGridModel } from "../../uikit/RenderGrid";
import type { ILink } from "../../api/types/io.tree";
import type { MenuItem } from "../../uikit/Menu/types";
import type { ILinkData } from "../../../shared/link-data";
import { createLinkData } from "../../../shared/link-data";
import { LinkTreeProvider } from "./LinkTreeProvider";
import type { ILinkSource, LinkItem, LinkEditorData, LinkViewMode } from "./linkTypes";
import { showEditLinkDialog } from "./EditLinkDialog";

/**
 * EPIC-028 / US-555 — native v4 Link editor. One class with TextFileModel
 * as its `IContentHost`. Replaces the legacy `LinkViewModel` +
 * `LegacyEditorAdapter` pair. Seventh Tier-5 editor in the uniform shape
 * (after Monaco / Grid / LogView / Markdown / Svg / Html / Mermaid / Graph /
 * Draw). First sidebar-owning editor in v4: exercises `beforeNavigateAway`
 * (LK7) + `onMainEditorChanged` (LK8) for the first time on a text-bearing
 * editor.
 *
 * Body of methods relocated byte-for-byte from legacy LinkViewModel with
 * substitutions: `this.host` → `this._host!`. The HS1 host-slot replaces
 * today's `<host.id>:link-editor` selection-state cache file (LK3).
 *
 * Design rationale: doc/tasks/US-555-link-editor-migration/README.md.
 */

export type ExpandedPanel = "tags" | "categories" | "hostnames";

export type LinkQueueEvent = { type: "focus" };
export type LinkQueueRequest = never;

/**
 * HS1 host-slot shape (LK3) — the five per-window UI selection fields ride
 * `host.editorSettings["link-view"]`. Survives Link↔Monaco switches AND
 * app restarts. Replaces today's `<host.id>:link-editor` cache file.
 */
interface LinkViewSettings {
    leftPanelWidth?: number;
    expandedPanel?: ExpandedPanel;
    selectedCategory?: string;
    selectedTag?: string;
    selectedHostname?: string;
}

export interface LinkEditorState extends EditorStateBase {
    // HS1 — ride host.editorSettings["link-view"] (LK3):
    leftPanelWidth: number;
    expandedPanel: ExpandedPanel;
    selectedCategory: string;
    selectedTag: string;
    selectedHostname: string;
    // View-derived — present on state for reactivity, stripped from
    // getRestoreData (LK2). Recomputed from host content via loadData.
    data: LinkEditorData;
    error: string | undefined;
    categories: string[];
    categoriesSize: Record<string, number>;
    tags: string[];
    tagsSize: Record<string, number>;
    hostnames: string[];
    hostnamesSize: Record<string, number>;
    filteredLinks: LinkItem[];
    // Transient UI state — not persisted (LK2).
    searchText: string;
    selectedLinkId: string;
}

export const defaultLinkEditorState: LinkEditorState = {
    id: "",
    title: "",
    modified: false,
    secondaryEditor: undefined,
    leftPanelWidth: 200,
    expandedPanel: "categories",
    selectedCategory: "",
    selectedTag: "",
    selectedHostname: "",
    data: { links: [], state: {} },
    error: undefined,
    categories: [],
    categoriesSize: {},
    tags: [],
    tagsSize: {},
    hostnames: [],
    hostnamesSize: {},
    filteredLinks: [],
    searchText: "",
    selectedLinkId: "",
};

/** All link-editor sidebar panels — registered when LinkEditor is main and
 *  the sidebar is open (LK6). */
const LINK_PANELS = ["link-category", "link-tags", "link-hostnames"];

function isLegacyTextFileHost(host: unknown): host is TextFileModel {
    return (host as { type?: string } | null)?.type === "textFile";
}

export class LinkEditor
    extends V4EditorModel<LinkEditorState, void, LinkQueueEvent>
    implements ILinkSource
{
    readonly editorId = "link-view";

    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _hostContentUnsub: (() => void) | null = null;
    private _settingsUnsub: (() => void) | null = null;
    private _tagsSliceUnsub: (() => void) | null = null;
    private _saveSubUnsub: (() => void) | null = null;
    private _pendingHost: HostDescriptor | undefined = undefined;

    // LK5 — self-write guard. LK4 — ref-equality marker.
    private skipNextContentUpdate = false;
    private lastSerializedData: LinkEditorData | null = null;
    // Incremental-filter optimization (today's pattern preserved):
    private lastFilterState = {
        searchText: "",
        selectedCategory: "",
        selectedTag: "",
        selectedHostname: "",
        expandedPanel: "",
    };

    // LK9 — tree provider lazy; selection state public for CategoryEditor reads.
    private _treeProvider: LinkTreeProvider | null = null;
    readonly selectionState = new TOneState<NavigationState>({ selectedHref: null });

    // View refs (set by view; not on state):
    gridModel: RenderGridModel | null = null;
    containerElement: HTMLElement | null = null;

    // Optional callback fields (LK9 — duck-typed today, preserved on the class):
    onLinkOpen?: (data: ILinkData) => void;
    onGetLinkMenuItems?: (link: LinkItem) => MenuItem[];

    // Save debounce — today's pattern:
    private onDataChangedDebounced = debounce(() => this.onDataChanged(), 300);

    readonly typedQueue: ComponentQueue<LinkQueueEvent, LinkQueueRequest>;

    constructor(state: TComponentState<LinkEditorState>) {
        super(state);
        this.typedQueue = this.queue as unknown as ComponentQueue<
            LinkQueueEvent,
            LinkQueueRequest
        >;

        const trait: IContentHostTrait = {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) throw new Error("Host already extracted from LinkEditor");
                this._tearDownHostSubscriptions();
                this._treeProvider = null;
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
        this._tagsSliceUnsub?.();
        this._saveSubUnsub?.();
        this._hostStateUnsub = null;
        this._hostContentUnsub = null;
        this._settingsUnsub = null;
        this._tagsSliceUnsub = null;
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
        return v4Registry.findEditorsAccepting(this._host as unknown as IContentHost);
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

    refocus(): void {
        this.containerElement?.focus();
    }

    // ── LK9 — Tree provider exposure ────────────────────────────────────

    get treeProvider(): LinkTreeProvider | null {
        if (!this._host) return null;
        if (!this._treeProvider) {
            this._treeProvider = new LinkTreeProvider(this, this._host.state.get().filePath || "");
        }
        return this._treeProvider;
    }

    selectByHref = (href: string): void => {
        const link = this.state.get().data.links.find((l) => l.href === href);
        if (link?.id) this.selectLink(link.id);
    };

    // ── Persistence (LK2 + LK3) ─────────────────────────────────────────

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        // Descriptor collapses to identity-only. The 5 HS1 fields ride the
        // host slot. View-derived (data / categories / tags / hostnames /
        // filteredLinks / error / searchText / selectedLinkId) stripped per
        // MO5 / GR8 / LK2.
        return {
            editorId: this.editorId,
            id: s.id,
            state: {
                title: s.title,
                modified: s.modified,
                secondaryEditor: s.secondaryEditor,
            } as Record<string, unknown>,
            host: this._host?.getDescriptor(),
        };
    }

    applyRestoreData(data: RestoreData<LinkEditorState>): void {
        this.state.update((cur) => {
            if (data.title !== undefined) cur.title = data.title;
            if (data.modified !== undefined) cur.modified = data.modified;
            if (data.secondaryEditor !== undefined) cur.secondaryEditor = data.secondaryEditor;
        });
        if (data.host) this._pendingHost = data.host;
    }

    // ── Three-phase lifecycle ──────────────────────────────────────────

    switchFrom(oldEditor: V4EditorModel): void {
        const trait = oldEditor.traits.get(CONTENT_HOST_TRAIT);
        if (!trait) {
            throw new Error(
                `LinkEditor.switchFrom: ${oldEditor.editorId} has no CONTENT_HOST_TRAIT`,
            );
        }
        const host = trait.extractContentHost() as unknown as TextFileModel;
        if (!isLegacyTextFileHost(host)) {
            throw new Error("LinkEditor.switchFrom: extracted host is not a TextFileModel");
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
            ui.notify((err as Error).message || "Failed to restore Link editor.", "error");
            this._host = newTextFileModel("");
            this.adoptHost(this._host);
        }
        this._pendingHost = undefined;
    }

    /** Adopt a host without going through `switchFrom`. Used by
     *  `wrapLegacyForPage` when constructing a fresh LinkEditor over a
     *  freshly-restored legacy TextFileModel. */
    adoptHost(host: TextFileModel): void {
        this._host = host;
        this._tearDownHostSubscriptions();

        // Forward host metadata changes to descriptorChanged (P3 debounce).
        this._hostStateUnsub = host.state.subscribe(() =>
            this.descriptorChanged.send(undefined),
        );

        // LK4 + LK5 — re-parse on external content changes; skipNext guard
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

        // HS1 — seed the 5 selection fields from host slot (sync, no flicker).
        const saved = host.getEditorState<LinkViewSettings>(this.editorId);
        if (saved) {
            this.state.update((s) => {
                if (saved.leftPanelWidth !== undefined) s.leftPanelWidth = saved.leftPanelWidth;
                if (saved.expandedPanel !== undefined) s.expandedPanel = saved.expandedPanel;
                if (saved.selectedCategory !== undefined) s.selectedCategory = saved.selectedCategory;
                if (saved.selectedTag !== undefined) s.selectedTag = saved.selectedTag;
                if (saved.selectedHostname !== undefined) s.selectedHostname = saved.selectedHostname;
            });
        }

        // HS1 — mirror back. Slice-subscribe over a composite key so the
        // mirror fires on any of the 5 slot fields but NOT on data /
        // derived / transient mutations.
        this._settingsUnsub = this.state.subscribe(
            () => {
                if (!this._host) return;
                const s = this.state.get();
                this._host.setEditorState<LinkViewSettings>(this.editorId, {
                    leftPanelWidth: s.leftPanelWidth,
                    expandedPanel: s.expandedPanel,
                    selectedCategory: s.selectedCategory,
                    selectedTag: s.selectedTag,
                    selectedHostname: s.selectedHostname,
                });
            },
            (s) =>
                `${s.leftPanelWidth}|${s.expandedPanel}|${s.selectedCategory}|${s.selectedTag}|${s.selectedHostname}`,
        );

        // LK8 — tag-count-crosses-zero subscription. When demoted to
        // standalone-secondary and tag count changes (e.g., last tag deleted),
        // reshape the panel list to keep `link-tags` registration accurate.
        this._tagsSliceUnsub = this.state.subscribe(
            () => {
                if (this.page?.mainEditorV4 === this) return; // main; LK6 handles
                if (!this.contributesPanels()) return; // already detached
                const hasTags = this.state.get().tags.length > 0;
                this.secondaryEditor = hasTags ? ["link-category", "link-tags"] : ["link-category"];
            },
            (s) => s.tags.length > 0,
        );

        // LK4 — state subscription → debounced serialize-back. Replaces
        // today's LinkViewModel.onInit subscription.
        this._saveSubUnsub = this.state.subscribe(() => this.onDataChangedDebounced());

        const { filePath, title } = host.state.get();
        this.state.update((s) => {
            s.title = title || (filePath ? fpBasename(filePath) : s.title || "untitled.link.json");
            if (host.state.get().id) s.id = host.state.get().id;
        });
        host.state.update((s) => {
            if (s.editor !== this.editorId) s.editor = this.editorId;
        });
        if (this.page) host.setPage(this.page);
    }

    setPage(page: PageModel | null): void {
        super.setPage(page);
        this._host?.setPage(page);
    }

    // ── LK6 — Sidebar lifecycle hooks ───────────────────────────────────

    /** Called by the view's useEffect when the page's NavPanel toggles.
     *  Pure state mutation per A8; gated on `mainEditor === this` so demote
     *  paths can call `setSidebarPanels(false)` without affecting the
     *  surviving secondaryEditor entry. */
    setSidebarPanels(open: boolean): void {
        if (this.page?.mainEditorV4 !== this) return; // demote-safe no-op
        if (open) {
            this.secondaryEditor = LINK_PANELS;
            const reverseMap: Record<string, string> = {
                categories: "link-category",
                tags: "link-tags",
                hostnames: "link-hostnames",
            };
            const panelToExpand =
                reverseMap[this.state.get().expandedPanel] ?? "link-category";
            this.page?.expandPanel(panelToExpand);
        } else {
            this.secondaryEditor = undefined;
        }
    }

    /** LK7 — Survive as a standalone-secondary editor only when the user is
     *  navigating WITHIN our own links (matched via `sourceLink.sourceId`).
     *  External navigation (Explorer click, Tab switch, etc.) → unload so
     *  stale Categories/Tags/Hostnames panels don't leak into the new file's
     *  PageNavigator. Mirrors `ArchiveEditorModel.beforeNavigateAway`. */
    beforeNavigateAway(newModel: V4EditorModel): void {
        if (this._isOpenedFromMe(newModel)) {
            return;
        }
        this.secondaryEditor = undefined;
    }

    /** LK8 — On demote, reshape the panel list to standalone-secondary form
     *  (drops `link-hostnames` to match today's
     *  LinkCategorySecondaryEditor.updatePanels behavior). Also evicts
     *  defensively if the new main wasn't opened from us. */
    onMainEditorChanged(newMainEditor: V4EditorModel | null): void {
        if (newMainEditor === this) return;
        if (newMainEditor === null) return;
        if (!this.contributesPanels()) return;
        if (!this._isOpenedFromMe(newMainEditor)) {
            this.secondaryEditor = undefined;
            return;
        }
        const hasTags = this.state.get().tags.length > 0;
        this.secondaryEditor = hasTags ? ["link-category", "link-tags"] : ["link-category"];
    }

    /** Check if a model was opened via this LinkEditor's own UI (own-id
     *  links, or standalone-secondary panel clicks emitting `link-category`
     *  / `link-tag`). Reads `sourceLink.sourceId` from the new model's
     *  content host (where `navigatePageTo` writes it). */
    private _isOpenedFromMe(model: V4EditorModel): boolean {
        const host = (model as { contentHost?: IContentHost | null }).contentHost;
        const sourceLink = (host?.state.get() as { sourceLink?: { sourceId?: string } } | undefined)?.sourceLink;
        const sourceId = sourceLink?.sourceId;
        if (!sourceId) return false;
        if (sourceId === this.id) return true;
        return sourceId === "link-category" || sourceId === "link-tag";
    }

    // ────────────────────────────────────────────────────────────────────
    // BELOW: methods relocated from legacy LinkViewModel.
    // Substitutions: `this.host` → `this._host!`; `LinkViewModel.cacheName`
    // mechanics dropped (HS1 host slot replaces the cache file).
    // ────────────────────────────────────────────────────────────────────

    // ── Serialization: state → file content (LK4 + LK5) ─────────────────

    private onDataChanged = () => {
        const { data, error } = this.state.get();
        if (error) return;
        if (!this._host) return;
        if (data !== this.lastSerializedData) {
            this.lastSerializedData = data;
            this.skipNextContentUpdate = true;
            const content = JSON.stringify({ type: "link-editor", ...data }, null, 4);
            this._host.changeContent(content, true);
        }
    };

    // ── Data loading ────────────────────────────────────────────────────

    loadData = (content: string): void => {
        try {
            const parsed = content.trim() ? JSON.parse(content) : {};
            this.state.update((s) => {
                const links: LinkItem[] = Array.isArray(parsed.links) ? parsed.links : [];
                // Normalize categories: trim leading/trailing separators
                for (const link of links) {
                    if (link.category) {
                        link.category = link.category.replace(/^[/\\]+|[/\\]+$/g, "");
                    }
                }
                s.data = {
                    links,
                    state: parsed.state || {},
                };
                s.error = undefined;
            });
            this.lastSerializedData = this.state.get().data;
            this.loadCategories();
            this.loadTags();
            this.loadHostnames();
            this.applyFilters();
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            this.state.update((s) => {
                s.error = message;
            });
        }
    };

    // ── Grid model ref ──────────────────────────────────────────────────

    setGridModel = (model: RenderGridModel | null): void => {
        this.gridModel = model;
    };

    // ── Selection ───────────────────────────────────────────────────────

    selectLink = (id: string): void => {
        this.state.update((s) => {
            s.selectedLinkId = id;
        });
    };

    // ── Left panel ──────────────────────────────────────────────────────

    setExpandedPanel = (panel: string): void => {
        this.state.update((s) => {
            s.expandedPanel = panel as ExpandedPanel;
        });
        this.applyFilters();
    };

    setLeftPanelWidth = (width: number): void => {
        this.state.update((s) => {
            s.leftPanelWidth = width;
        });
    };

    setSelectedCategory = (category: string): void => {
        this.state.update((s) => {
            s.selectedCategory = category;
        });
        this.applyFilters();
    };

    setSelectedTag = (tag: string): void => {
        this.state.update((s) => {
            s.selectedTag = tag;
        });
        this.applyFilters();
    };

    setSelectedHostname = (hostname: string): void => {
        this.state.update((s) => {
            s.selectedHostname = hostname;
        });
        this.applyFilters();
    };

    setSearchText = (text: string): void => {
        this.state.update((s) => {
            s.searchText = text;
        });
        this.applyFilters();
    };

    clearSearch = (): void => {
        this.setSearchText("");
    };

    // ── Categories ──────────────────────────────────────────────────────

    loadCategories = (): void => {
        const links = this.state.get().data.links;
        const categoriesSet = new Set<string>();
        const categoriesSize: { [key: string]: number } = {};

        links.forEach((link) => {
            if (link.category) {
                categoriesSet.add(link.category);
                const categoryPath = splitWithSeparators(link.category, "/\\");
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

    getCategoryCount = (category: string): number => {
        return this.state.get().categoriesSize[category] ?? 0;
    };

    // ── Tags ────────────────────────────────────────────────────────────

    loadTags = (): void => {
        const links = this.state.get().data.links;
        const tagsSet = new Set<string>();
        const tagsSize: { [key: string]: number } = {};
        const separator = ":";

        tagsSize[""] = links.length;

        links.forEach((link) => {
            link.tags?.forEach((tag) => {
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

    getTagCount = (tag: string): number => {
        return this.state.get().tagsSize[tag] ?? 0;
    };

    // ── Hostnames ───────────────────────────────────────────────────────

    loadHostnames = (): void => {
        const links = this.state.get().data.links;
        const hostnamesSize: { [key: string]: number } = {};

        hostnamesSize[""] = links.length;

        links.forEach((link) => {
            const hostname = getHostname(link.href);
            if (hostname) {
                hostnamesSize[hostname] = (hostnamesSize[hostname] || 0) + 1;
            }
        });

        const hostnames = Object.keys(hostnamesSize).filter((h) => h !== "").sort();

        this.state.update((s) => {
            s.hostnames = hostnames;
            s.hostnamesSize = hostnamesSize;
        });
    };

    getHostnameCount = (hostname: string): number => {
        return this.state.get().hostnamesSize[hostname] ?? 0;
    };

    // ── Filtering ───────────────────────────────────────────────────────

    applyFilters = (): void => {
        const {
            data,
            selectedCategory,
            selectedTag,
            selectedHostname,
            expandedPanel,
            searchText,
            filteredLinks,
        } = this.state.get();
        const last = this.lastFilterState;

        const searchExtended =
            searchText.startsWith(last.searchText) && last.searchText !== "";
        const panelFilterUnchanged =
            selectedCategory === last.selectedCategory &&
            selectedTag === last.selectedTag &&
            selectedHostname === last.selectedHostname &&
            expandedPanel === last.expandedPanel;

        let filtered: LinkItem[];

        if (searchExtended && panelFilterUnchanged) {
            filtered = filteredLinks;
        } else {
            filtered = data.links;

            if (expandedPanel === "categories" && selectedCategory) {
                filtered = filtered.filter((link) =>
                    link.category?.startsWith(selectedCategory),
                );
            }

            if (expandedPanel === "tags" && selectedTag) {
                const separator = ":";
                if (selectedTag.endsWith(separator)) {
                    filtered = filtered.filter((link) =>
                        link.tags?.some((tag) => tag.startsWith(selectedTag) || tag === selectedTag),
                    );
                } else {
                    filtered = filtered.filter((link) => link.tags?.includes(selectedTag));
                }
            }

            if (expandedPanel === "hostnames" && selectedHostname) {
                filtered = filtered.filter(
                    (link) => getHostname(link.href) === selectedHostname,
                );
            }
        }

        if (searchText.trim()) {
            const searchWords = searchText.toLowerCase().trim().split(/\s+/);
            filtered = filtered.filter((link) => {
                const searchableText = [
                    link.title || "",
                    link.href || "",
                    link.category || "",
                    ...(link.tags || []),
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
            selectedHostname,
            expandedPanel,
        };

        this.state.update((s) => {
            s.filteredLinks = filtered;
        });
    };

    // ── View Mode (per category / tag / hostname) ───────────────────────

    getViewMode = (): LinkViewMode => {
        const { expandedPanel, selectedCategory, selectedTag, selectedHostname, data } =
            this.state.get();
        if (expandedPanel === "tags") {
            return data.state.tagViewMode?.[selectedTag] ?? "list";
        }
        if (expandedPanel === "hostnames") {
            return data.state.hostnameViewMode?.[selectedHostname] ?? "list";
        }
        return data.state.categoryViewMode?.[selectedCategory] ?? "list";
    };

    setViewMode = (mode: LinkViewMode): void => {
        const { expandedPanel, selectedCategory, selectedTag, selectedHostname } =
            this.state.get();
        this.state.update((s) => {
            if (expandedPanel === "tags") {
                if (!s.data.state.tagViewMode) {
                    s.data.state.tagViewMode = {};
                }
                s.data.state.tagViewMode[selectedTag] = mode;
            } else if (expandedPanel === "hostnames") {
                if (!s.data.state.hostnameViewMode) {
                    s.data.state.hostnameViewMode = {};
                }
                s.data.state.hostnameViewMode[selectedHostname] = mode;
            } else {
                if (!s.data.state.categoryViewMode) {
                    s.data.state.categoryViewMode = {};
                }
                s.data.state.categoryViewMode[selectedCategory] = mode;
            }
        });
    };

    // ── CRUD ────────────────────────────────────────────────────────────

    addLink = (link?: Partial<LinkItem>): LinkItem => {
        const { expandedPanel, selectedCategory, selectedTag, searchText } = this.state.get();

        let category = link?.category ?? "";
        let tags = link?.tags ?? [];
        let title = link?.title ?? "";

        if (!link?.category) {
            if (expandedPanel === "categories" && selectedCategory) {
                category = selectedCategory;
            }
        }
        if (!link?.tags?.length) {
            if (expandedPanel === "tags" && selectedTag) {
                tags = [selectedTag];
            }
        }
        if (!link?.title && searchText.trim()) {
            title = searchText.trim();
        }

        const newLink: LinkItem = {
            id: crypto.randomUUID(),
            title,
            href: link?.href ?? "",
            category,
            tags,
            isDirectory: false,
            imgSrc: link?.imgSrc,
        };

        this.state.update((s) => {
            s.data.links.unshift(newLink);
        });
        this.loadCategories();
        this.loadTags();
        this.loadHostnames();
        this.applyFilters();
        return newLink;
    };

    /**
     * Import one or more ILink items into the collection.
     * Directories are scanned recursively; if the scan exceeds 100 files,
     * a confirmation dialog asks the user before proceeding.
     * Duplicate hrefs (already in collection) are skipped.
     */
    importLinks = async (items: ILink[]): Promise<void> => {
        const fp = await import("../../core/utils/file-path");
        const existingHrefs = new Set(
            this.state.get().data.links.map((l) => l.href.toLowerCase()),
        );

        const directLinks: Partial<LinkItem>[] = [];
        const foldersToScan: ILink[] = [];

        for (const item of items) {
            if (item.isDirectory) {
                foldersToScan.push(item);
            } else {
                if (existingHrefs.has(item.href.toLowerCase())) continue;
                existingHrefs.add(item.href.toLowerCase());
                directLinks.push({
                    title: item.title,
                    href: item.href,
                    category: item.category || "",
                    tags: item.tags?.length ? item.tags : undefined,
                    imgSrc: item.imgSrc,
                });
            }
        }

        const SCAN_LIMIT = 100;
        let folderLinks: Partial<LinkItem>[] = [];

        if (foldersToScan.length) {
            const scanned = await this.scanFolders(
                foldersToScan,
                existingHrefs,
                fp,
                SCAN_LIMIT,
            );

            if (scanned.limitReached) {
                const choice = await ui.confirm(
                    `The folder contains more than ${SCAN_LIMIT} files. Import all files?`,
                    { title: "Import Folder", buttons: ["Import All", "Cancel"] },
                );
                if (choice !== "Import All") return;

                const existingHrefs2 = new Set(
                    this.state.get().data.links.map((l) => l.href.toLowerCase()),
                );
                for (const dl of directLinks) {
                    if (dl.href) existingHrefs2.add(dl.href.toLowerCase());
                }
                const fullScan = await this.scanFolders(
                    foldersToScan,
                    existingHrefs2,
                    fp,
                    0,
                );
                folderLinks = fullScan.links;
            } else {
                folderLinks = scanned.links;
            }
        }

        const allLinks = [...directLinks, ...folderLinks];

        if (!allLinks.length) {
            const { app } = await import("../../api/app");
            app.ui.notify("All items already exist in this collection", "info");
            return;
        }

        for (const link of allLinks) {
            this.addLink(link);
        }

        if (allLinks.length > 1) {
            const { app } = await import("../../api/app");
            app.ui.notify(`Imported ${allLinks.length} links`, "info");
        }
    };

    private scanFolders = async (
        folders: ILink[],
        existingHrefs: Set<string>,
        fp: typeof import("../../core/utils/file-path"),
        limit: number,
    ): Promise<{ links: Partial<LinkItem>[]; limitReached: boolean }> => {
        const { app } = await import("../../api/app");
        const links: Partial<LinkItem>[] = [];
        const queue = [...folders];

        while (queue.length > 0) {
            const folder = queue.shift()!;
            let entries: { name: string; isDirectory: boolean }[];
            try {
                entries = await app.fs.listDirWithTypes(folder.href);
            } catch {
                continue;
            }

            for (const entry of entries) {
                const fullPath = fp.fpJoin(folder.href, entry.name);
                if (entry.isDirectory) {
                    queue.push({
                        title: entry.name,
                        href: fullPath,
                        category: folder.category || "",
                        tags: [],
                        isDirectory: true,
                    });
                    continue;
                }
                if (existingHrefs.has(fullPath.toLowerCase())) continue;
                existingHrefs.add(fullPath.toLowerCase());
                links.push({
                    title: entry.name,
                    href: fullPath,
                    category: folder.category || "",
                });
                if (limit > 0 && links.length >= limit) {
                    return { links, limitReached: true };
                }
            }
        }

        return { links, limitReached: false };
    };

    updateLink = (id: string, updates: Partial<Omit<LinkItem, "id">>): void => {
        this.state.update((s) => {
            const link = s.data.links.find((l) => l.id === id);
            if (link) {
                if (updates.title !== undefined) link.title = updates.title;
                if (updates.href !== undefined) link.href = updates.href;
                if (updates.category !== undefined) link.category = updates.category;
                if (updates.tags !== undefined) link.tags = updates.tags;
                if (updates.imgSrc !== undefined) link.imgSrc = updates.imgSrc;
                if ("target" in updates) link.target = updates.target;
            }
        });
        if (updates.category !== undefined) this.loadCategories();
        if (updates.tags !== undefined) this.loadTags();
        if (updates.href !== undefined) this.loadHostnames();
        this.applyFilters();
    };

    deleteLink = async (id: string, skipConfirm = false): Promise<void> => {
        if (!skipConfirm) {
            const link = this.getLinkById(id);
            const label = link?.title || link?.href || "this link";
            const bt = await ui.confirm(
                `Are you sure you want to delete "${label}"?`,
                { title: "Delete Link", buttons: ["Delete", "Cancel"] },
            );
            this.containerElement?.focus();
            if (bt !== "Delete") return;
        }
        this.state.update((s) => {
            s.data.links = s.data.links.filter((l) => l.id !== id);
            if (s.data.state.pinnedLinks) {
                s.data.state.pinnedLinks = s.data.state.pinnedLinks.filter((pid) => pid !== id);
            }
        });
        this.loadCategories();
        this.loadTags();
        this.loadHostnames();
        this.applyFilters();
    };

    getLinkById = (id: string): LinkItem | undefined => {
        return this.state.get().data.links.find((l) => l.id === id);
    };

    // ── Drag-and-drop ───────────────────────────────────────────────────

    moveLinkToCategory = (linkId: string, category: string): void => {
        const link = this.getLinkById(linkId);
        if (!link || link.category === category) return;
        this.updateLink(linkId, { category });
    };

    moveCategory = async (fromCategory: string, toCategory: string): Promise<void> => {
        if (!fromCategory) return;
        if (fromCategory === toCategory) return;
        if (toCategory.startsWith(fromCategory + "/")) return;

        const leafName = fromCategory.split("/").pop() || "";
        const newCategory = toCategory ? `${toCategory}/${leafName}` : leafName;

        if (newCategory === fromCategory) return;

        const links = this.state.get().data.links;
        const count = links.filter(
            (l) => l.category === fromCategory || l.category.startsWith(fromCategory + "/"),
        ).length;

        const result = await ui.confirm(
            `Move ${count} link${count !== 1 ? "s" : ""} from "${fromCategory}" to "${newCategory}"?`,
            { title: "Move Category", buttons: ["Move", "Cancel"] },
        );

        if (result !== "Move") return;

        this.state.update((s) => {
            for (const link of s.data.links) {
                if (link.category === fromCategory) {
                    link.category = newCategory;
                } else if (link.category.startsWith(fromCategory + "/")) {
                    link.category = newCategory + link.category.slice(fromCategory.length);
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

    // ── Pinned links ────────────────────────────────────────────────────

    isLinkPinned = (id: string): boolean => {
        return this.state.get().data.state.pinnedLinks?.includes(id) ?? false;
    };

    pinLink = (id: string): void => {
        this.state.update((s) => {
            if (!s.data.state.pinnedLinks) {
                s.data.state.pinnedLinks = [];
            }
            if (!s.data.state.pinnedLinks.includes(id)) {
                s.data.state.pinnedLinks.push(id);
            }
        });
    };

    unpinLink = (id: string): void => {
        this.state.update((s) => {
            if (s.data.state.pinnedLinks) {
                s.data.state.pinnedLinks = s.data.state.pinnedLinks.filter((pid) => pid !== id);
            }
        });
    };

    togglePinLink = (id: string): void => {
        if (this.isLinkPinned(id)) {
            this.unpinLink(id);
        } else {
            this.pinLink(id);
        }
    };

    reorderPinnedLink = (fromIndex: number, toIndex: number): void => {
        this.state.update((s) => {
            const pinned = s.data.state.pinnedLinks;
            if (!pinned) return;
            const [moved] = pinned.splice(fromIndex, 1);
            pinned.splice(toIndex, 0, moved);
        });
    };

    getPinnedLinks = (): LinkItem[] => {
        const { data } = this.state.get();
        const pinnedIds = data.state.pinnedLinks;
        if (!pinnedIds?.length) return [];
        const linkMap = new Map(data.links.map((l) => [l.id, l]));
        return pinnedIds.map((id) => linkMap.get(id)).filter(Boolean) as LinkItem[];
    };

    setPinnedPanelWidth = (width: number): void => {
        this.state.update((s) => {
            if (!s.data.state.pinnedPanelWidth || s.data.state.pinnedPanelWidth !== width) {
                s.data.state.pinnedPanelWidth = width;
            }
        });
    };

    // ── Edit Link dialog ────────────────────────────────────────────────

    showLinkDialog = async (linkId?: string): Promise<void> => {
        const state = this.state.get();
        const link = linkId ? state.data.links.find((l) => l.id === linkId) : undefined;

        const defaults: Partial<LinkItem> = link ? { ...link } : {};
        if (!linkId) {
            const { expandedPanel, selectedCategory, selectedTag, searchText } = state;
            if (expandedPanel === "categories" && selectedCategory) {
                defaults.category = selectedCategory;
            }
            if (expandedPanel === "tags" && selectedTag) {
                defaults.tags = [selectedTag];
            }
            if (searchText.trim()) {
                defaults.title = searchText.trim();
            }
        }

        const result = await showEditLinkDialog({
            title: link ? "Edit Link" : "Add Link",
            link: defaults,
            categories: state.categories,
            tags: state.tags,
        });

        this.containerElement?.focus();

        if (result) {
            if (linkId) {
                this.updateLink(linkId, result);
            } else {
                const newLink: LinkItem = {
                    id: crypto.randomUUID(),
                    title: result.title,
                    href: result.href,
                    category: result.category,
                    tags: result.tags,
                    isDirectory: false,
                    imgSrc: result.imgSrc,
                    target: result.target,
                };
                this.state.update((s) => {
                    s.data.links.unshift(newLink);
                });
                this.loadCategories();
                this.loadTags();
                this.loadHostnames();
                this.applyFilters();
            }
        }
    };

    // ── Link opening ────────────────────────────────────────────────────

    openLink = async (link: ILink | { href: string; target?: string }): Promise<void> => {
        const url = link.href;
        if (!url) return;

        const linkData = createLinkData(url, { target: link.target || undefined });

        // Let owner (e.g., Browser) modify linkData before pipeline dispatch
        this.onLinkOpen?.(linkData);

        const { app } = await import("../../api/app");
        await app.events.openRawLink.sendAsync(linkData);
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
        this._treeProvider = null;
        this.containerElement = null;
        this.gridModel = null;
        if (this._host) {
            await this._host.dispose();
            this._host = null;
        }
        await super.dispose();
    }
}

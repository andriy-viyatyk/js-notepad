import { TComponentState, TOneState } from "../../core/state/state";
import { EditorModel, type EditorStateBase } from "../base/EditorModel";
import { TextHostEditorModel } from "../base/TextHostEditorModel";
import { ComponentQueue } from "../../core/state/ComponentQueue";
import type { NavigationState } from "../base/navigation-state";
import { TextFileModel } from "../text/TextEditorModel";
import { ui } from "../../api/ui";
import { debounce, errMessage } from "../../../shared/utils";
import { splitWithSeparators } from "../../core/utils/utils";
import { getHostname } from "../../components/icons/favicon-cache";
import type { GridModelCapability } from "../../uikit/VirtualGrid";
import type { ILink } from "../../api/types/io.tree";
import type { MenuItem } from "../../uikit/Menu/types";
import type { ILinkData } from "../../../shared/link-data";
import { createLinkData } from "../../../shared/link-data";
import { LinkTreeProvider } from "./LinkTreeProvider";
import type { ILinkSource, LinkItem, LinkEditorData, LinkViewMode } from "./linkTypes";
import { showEditLinkDialog } from "./EditLinkDialog";
import type { TorProxyInfo } from "./tor-src";

export type ExpandedPanel = "tags" | "categories" | "hostnames";

export type LinkQueueEvent = { type: "focus" };
export type LinkQueueRequest = never;

/**
 * HS1 host-slot shape — the five per-window UI selection fields ride
 * `host.editorSettings["link-view"]`. Survives Link↔Monaco switches AND
 * app restarts. Replaces today's `<host.id>:link-editor` cache file.
 */
interface LinkViewSettings {
    expandedPanel?: ExpandedPanel;
    selectedCategory?: string;
    selectedTag?: string;
    selectedHostname?: string;
}

export interface LinkEditorState extends EditorStateBase {
    // HS1 — ride host.editorSettings["link-view"]:
    expandedPanel: ExpandedPanel;
    selectedCategory: string;
    selectedTag: string;
    selectedHostname: string;
    // View-derived — present on state for reactivity, stripped from
    // getRestoreData. Recomputed from host content via loadData.
    data: LinkEditorData;
    error: string | undefined;
    categories: string[];
    categoriesSize: Record<string, number>;
    tags: string[];
    tagsSize: Record<string, number>;
    hostnames: string[];
    hostnamesSize: Record<string, number>;
    filteredLinks: LinkItem[];
    // Transient UI state — not persisted.
    searchText: string;
    selectedLinkId: string;
}

export const defaultLinkEditorState: LinkEditorState = {
    id: "",
    title: "",
    modified: false,
    secondaryView: undefined,
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

/** All link-editor sidebar panels — registered for the whole time the
 *  LinkEditor is on a page (always-on; the sidebar is mandatory-open while a
 *  Link editor is present). The set is binary: all three, or gone (self-evict
 *  on external navigation). */
const LINK_PANELS = ["link-category", "link-tags", "link-hostnames"];

export class LinkEditor
    extends TextHostEditorModel<LinkEditorState, void, LinkQueueEvent>
    implements ILinkSource
{
    readonly editorId = "link-view";
    protected readonly displayName = "Link";

    // LK4 — ref-equality marker.
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
    gridModel: GridModelCapability | null = null;
    containerElement: HTMLElement | null = null;

    // Optional callback fields (LK9 — duck-typed today, preserved on the class):
    onLinkOpen?: (data: ILinkData) => void;
    onGetLinkMenuItems?: (link: LinkItem) => MenuItem[];

    /**
     * US-896 — set by an embedder whose page has a Tor session (the browser's
     * bookmarks editor) so remote link images are fetched through it instead of
     * leaking direct. A function, not a value: `torStatus` changes after this
     * editor is wired up, and this model outlives every blank tab in the page.
     * Left null for standalone `.links.json` editors and non-Tor pages.
     */
    imageProxySource?: () => TorProxyInfo | null;

    /** Current Tor routing for remote images, read fresh at render time. */
    get imageProxy(): TorProxyInfo | null {
        return this.imageProxySource?.() ?? null;
    }

    /**
     * True when this editor is embedded in a Tor browser page. Gates anything
     * that would touch the network un-proxied or leave a trace on disk — e.g.
     * arming a favicon download (US-896).
     */
    get isTorPage(): boolean {
        return !!this.imageProxy;
    }

    // Save debounce — today's pattern:
    private onDataChangedDebounced = debounce(() => this.onDataChanged(), 300);

    readonly typedQueue: ComponentQueue<LinkQueueEvent, LinkQueueRequest>;

    constructor(state: TComponentState<LinkEditorState>) {
        super(state);
        this.typedQueue = this.queue as unknown as ComponentQueue<
            LinkQueueEvent,
            LinkQueueRequest
        >;
    }

    /** The trait extracted the host (switch away) — drop the host-bound
     *  tree provider. */
    protected onHostExtracted(): void {
        this._treeProvider = null;
    }

    protected untitledName(): string {
        return "untitled.link.json";
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

    // ── Host adoption ───────────────────────────────────────────────────

    adoptHost(host: TextFileModel): void {
        super.adoptHost(host);

        // Panels are a property of "the Link editor is on a page" — registered
        // once here, independent of the sidebar open flag (the sidebar is
        // mandatory-open per PageModel.sidebarMandatory). Constant for the
        // editor's life on the page; only the survival hooks clear it.
        // (Panels contribution now runs after the base host attach — accepted
        // micro-difference from the pre-base ordering.)
        this.secondaryView = LINK_PANELS;

        // LK4 + LK5 — re-parse on external content changes; the base's echo
        // guard prevents the loop from our own serialize-back writes.
        this.subscribeHostContent((content) => this.loadData(content));

        // HS1 — seed the 5 selection fields from host slot (sync, no flicker)
        // and mirror back. Slice-subscribe over a composite key so the mirror
        // fires on any of the 5 slot fields but NOT on data / derived /
        // transient mutations.
        this.mirrorHostSettings<LinkViewSettings>(
            (saved) => {
                this.state.update((s) => {
                    if (saved.expandedPanel !== undefined) s.expandedPanel = saved.expandedPanel;
                    if (saved.selectedCategory !== undefined) s.selectedCategory = saved.selectedCategory;
                    if (saved.selectedTag !== undefined) s.selectedTag = saved.selectedTag;
                    if (saved.selectedHostname !== undefined) s.selectedHostname = saved.selectedHostname;
                });
            },
            (s) => ({
                expandedPanel: s.expandedPanel,
                selectedCategory: s.selectedCategory,
                selectedTag: s.selectedTag,
                selectedHostname: s.selectedHostname,
            }),
            (s) =>
                `${s.expandedPanel}|${s.selectedCategory}|${s.selectedTag}|${s.selectedHostname}`,
        );

        // LK4 — state subscription → debounced serialize-back. Replaces
        // today's LinkViewModel.onInit subscription.
        this.registerHostSubscription(this.state.subscribe(() => this.onDataChangedDebounced()));
    }

    protected onHostAttached(host: TextFileModel): void {
        this.loadData(host.state.get().content ?? "");
    }

    // ── LK6 — Sidebar lifecycle hooks ───────────────────────────────────

    /** LK7 — Survive as a standalone-secondary view only when the user is
     *  navigating WITHIN our own links (matched via `sourceLink.sourceId`).
     *  External navigation (Explorer click, Tab switch, etc.) → unload so
     *  stale Categories/Tags/Hostnames panels don't leak into the new file's
     *  SecondaryViews. Mirrors `ArchiveEditorModel.beforeNavigateAway`. */
    beforeNavigateAway(newModel: EditorModel): void {
        // A modified editor survives any navigation so unsaved work is never
        // lost (US-718); an unmodified one survives only own-link navigation.
        if (this.modified || this._isOpenedFromMe(newModel)) {
            return;
        }
        this.secondaryView = undefined;
    }

    /** On demote, keep the full panel set (Concern 4 — no reshape). Evicts
     *  only when the editor is unmodified AND the new main wasn't opened from
     *  us (external navigation). A modified editor always keeps its panels. */
    onMainEditorChanged(newMainEditor: EditorModel | null): void {
        if (newMainEditor === this) return;
        if (newMainEditor === null) return;
        if (!this.contributesPanels()) return;
        if (!this.modified && !this._isOpenedFromMe(newMainEditor)) {
            this.secondaryView = undefined;
            return;
        }
        this.secondaryView = LINK_PANELS;
    }

    /** A modified Link editor survives any navigation (its panels stay; unsaved
     *  work is preserved); an unmodified one survives own-link navigation. In
     *  both cases the editor is not released, so the navigation save-prompt is
     *  skipped (US-718). */
    survivesNavigation(sourceLink?: ILinkData): boolean {
        return this.modified || this.isOwnNavigationSourceId(sourceLink?.sourceId);
    }

    /** Sidebar active-panel changed to one we own → sync `expandedPanel` (drives the
     *  toolbar breadcrumb + the center-list filter). This lives on the model — not in
     *  the LinkBody view — because PageModel calls it on the owning editor regardless
     *  of whether the body is mounted. After navigating to a link the editor is demoted
     *  to a sidebar and LinkBody unmounts; handling the switch here keeps tag/category
     *  panel selection working in that state. Maps the sidebar panel id back to
     *  `expandedPanel`. */
    onPanelExpanded(panelId: string): void {
        const map: Record<string, ExpandedPanel> = {
            "link-category": "categories",
            "link-tags": "tags",
            "link-hostnames": "hostnames",
        };
        const expandedPanel = map[panelId];
        if (expandedPanel) this.setExpandedPanel(expandedPanel);
    }

    /** Check if a model was opened via this LinkEditor's own UI (own-id
     *  links, or panel clicks emitting `link-category` / `link-tag` /
     *  `link-hostname`). Reads `sourceLink.sourceId` via
     *  `EditorModel.getNavigationSourceId`, which checks both the editor's own
     *  state AND its content host — so links opening in a no-host / legacy
     *  non-text editor (e.g. the audio/video player, where `sourceLink` lives
     *  on the editor's own state and there is no content host) keep the Link
     *  panels instead of dropping them. */
    private _isOpenedFromMe(model: EditorModel): boolean {
        return this.isOwnNavigationSourceId(model.getNavigationSourceId());
    }

    /** True when a navigation `sourceId` originated from this LinkEditor's own
     *  UI — its own id, or a panel click (`link-category` / `link-tag` /
     *  `link-hostname`). Single source of truth for own-link detection,
     *  shared by `_isOpenedFromMe` (reads a model) and `survivesNavigation`
     *  (reads the incoming `sourceLink`). */
    private isOwnNavigationSourceId(sourceId?: string): boolean {
        if (!sourceId) return false;
        if (sourceId === this.id) return true;
        return (
            sourceId === "link-category" ||
            sourceId === "link-tag" ||
            sourceId === "link-hostname"
        );
    }

    // ────────────────────────────────────────────────────────────────────
    // BELOW: methods relocated from legacy LinkViewModel.
    // Substitutions: `this.host` → `this._host!`; `LinkViewModel.cacheName`
    // mechanics dropped (HS1 host slot replaces the cache file).
    // ────────────────────────────────────────────────────────────────────

    // ── Serialization: state → file content ─────────────────

    private onDataChanged = () => {
        const { data, error } = this.state.get();
        if (error) return;
        if (!this._host) return;
        if (data !== this.lastSerializedData) {
            this.lastSerializedData = data;
            const content = JSON.stringify({ type: "link-editor", ...data }, null, 4);
            this.writeToHost(content, true);
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
            const message = errMessage(e);
            this.state.update((s) => {
                s.error = message;
            });
        }
    };

    // ── Grid model ref ──────────────────────────────────────────────────

    setGridModel = (model: GridModelCapability | null): void => {
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

    setSelectedCategory = (category: string): void => {
        this.state.update((s) => {
            s.selectedCategory = category;
            // Selecting a category folder is a fresh selection in the Collections
            // tree — drop any selected-link highlight so the category shows as the
            // selected node (last click wins). The category panel highlights
            // `selectedLinkId`'s link when set, else `selectedCategory`.
            s.selectedLinkId = "";
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

    /**
     * View mode for the current category / tag / hostname.
     *
     * Pass `snapshot` when calling this from inside a `state.use(...)` selector.
     * The mode lives under `data.state.*ViewMode`, so a component whose selector
     * doesn't read those keys will not re-render when the mode changes — reading
     * it through the selector's own snapshot is what makes it reactive.
     */
    getViewMode = (snapshot?: LinkEditorState): LinkViewMode => {
        const { expandedPanel, selectedCategory, selectedTag, selectedHostname, data } =
            snapshot ?? this.state.get();
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
    importLinks = async (
        items: ILink[],
        opts?: { moveExistingToCategory?: string },
    ): Promise<void> => {
        const fp = await import("../../core/utils/file-path");
        const existingHrefs = new Set(
            this.state.get().data.links.map((l) => l.href.toLowerCase()),
        );

        const directLinks: Partial<LinkItem>[] = [];
        const foldersToScan: ILink[] = [];
        let movedCount = 0;

        for (const item of items) {
            if (item.isDirectory) {
                foldersToScan.push(item);
            } else {
                if (existingHrefs.has(item.href.toLowerCase())) {
                    // Move-on-duplicate: reassign the existing link to the drop
                    // target instead of creating a duplicate or silently skipping.
                    if (opts?.moveExistingToCategory !== undefined) {
                        const existing = this.state.get().data.links.find(
                            (l) => l.href.toLowerCase() === item.href.toLowerCase(),
                        );
                        if (existing && existing.category !== opts.moveExistingToCategory) {
                            this.moveLinkToCategory(existing.id, opts.moveExistingToCategory);
                            movedCount++;
                        }
                    }
                    continue;
                }
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
            app.ui.notify(
                movedCount
                    ? `Moved ${movedCount} link(s)`
                    : "All items already exist in this collection",
                "info",
            );
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
            const folder = queue.shift();
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
            imageProxy: this.imageProxy,
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

    /** Open a link clicked in a sidebar panel (Category tree / Tags-Hostnames
     *  bottom list). Single open path (US-601 Concern A):
     *   - **Embedded (browser):** when `onLinkOpen` is set (only the browser
     *     sets it), route through `openLink()` so the hook can force
     *     `target:"browser"` + `browserPageId` and navigate the empty tab (or a
     *     new tab when the current tab isn't blank / on Ctrl-click).
     *   - **Page:** dispatch `openRawLink` with the navigation metadata — opens
     *     the file in the page's main view and keeps the Link panels alive via
     *     `_isOpenedFromMe`. Byte-identical to the pre-US-601 per-panel path. */
    openLinkFromPanel = (item: ILink, sourceId: string): void => {
        if (item.id) this.selectLink(item.id);
        if (this.onLinkOpen) {
            void this.openLink(item);
            return;
        }
        const navUrl = this.treeProvider?.getNavigationUrl(item) ?? item.href;
        const data = createLinkData(navUrl, {
            target: item.target || undefined,
            sourceId,
            category: item.category,
            // Seed the active tag filter so the player's Next/Random walks the
            // filtered list (e.g. only "pop" tracks). Without it the player reads
            // sourceLink.selectedTag === undefined and falls back to the full,
            // unfiltered link list. Mirrors navigateToTrack's re-propagation.
            ...(sourceId === "link-tag" ? { selectedTag: this.state.get().selectedTag } : undefined),
            ...(this.page ? { pageId: this.page.id, fallbackTarget: "monaco", title: item.title } : undefined),
        });
        void import("../../api/app").then(({ app }) => app.events.openRawLink.sendAsync(data));
    };

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

    /** Delegate to host — same pattern as `confirmRelease` below. LinkEditor
     *  wraps a TextFileModel; edits flow through the host, so `host.modified`
     *  is the source of truth. Without this override, a demoted LinkEditor
     *  (sidebar-only, no main editor) would report `modified=false` and
     *  `page.close()` would skip the save prompt — the close loop reads
     *  `editor.modified` on each entry in `editors[]` and only the main-editor
     *  branch goes through `unwrapToHost`. (US-592.) */
    get modified(): boolean {
        return this._host ? this._host.modified : super.modified;
    }

    async saveState(): Promise<void> {
        // Flush pending debounced save before host's saveState
        this.onDataChanged();
        await super.saveState();
    }

    async dispose(): Promise<void> {
        // Flush pending debounced save (today's onDispose pattern)
        this.onDataChanged();

        this._treeProvider = null;
        this.containerElement = null;
        this.gridModel = null;
        await super.dispose();
    }
}

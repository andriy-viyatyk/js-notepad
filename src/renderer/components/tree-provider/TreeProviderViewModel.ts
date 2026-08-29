import type { SlotContent } from "../../uikit/shared/fill-slot";
import { TComponentModel } from "../../core/state/model";
import type { ITreeProvider, ITreeProviderItem, ILink } from "../../api/types/io.tree";
import type { MenuItem } from "../../uikit/Menu";
import type { RowAlign } from "../../uikit/VirtualGrid";
import { ContextMenuEvent } from "../../api/events/events";
import { app } from "../../api/app";
import { ui } from "../../api/ui";
import { fpBasename, fpDirname } from "../../core/utils/file-path";
import type { IFileLink } from "../../core/traits/fileLinkTraits";
import {
    copyPathsToOsClipboard,
    supportsOsClipboard,
} from "./os-clipboard";
import {
    buildMultiItemMenuItems,
    deleteItemsBatch,
    pruneNestedItems,
} from "./plural-actions";
import {
    dropOsFilesInto as dropOsFilesIntoTarget,
    importFilesInto,
    moveItemsInto,
    type DropTarget,
} from "./tree-drop-actions";
import {
    createNewFile,
    createNewFolder,
    deleteItemAction,
    pasteIntoDir,
    renameItem,
    type ItemCrudContext,
} from "./item-crud-actions";
import {
    getBackgroundMenuItems,
    getFileMenuItems,
    getFolderMenuItems,
    type ItemMenuActions,
} from "./item-menus";
import { sameHref, sameHrefs } from "./href-utils";
import type { SlotText } from "../../uikit/shared/slots";

// =============================================================================
// Types
// =============================================================================

/** Internal tree node wrapping ITreeProviderItem for UIKit Tree rendering. */
export interface TreeProviderNode {
    data: ITreeProviderItem;
    /** undefined = not loaded (lazy), [] = empty directory */
    items?: TreeProviderNode[];
}

export interface TreeProviderViewSavedState {
    expandedPaths: string[];
    /** Last-clicked row (the primary selection). Kept for single-select consumers
     *  and for state persisted before multi-select existed. */
    selectedHref?: string;
    /** Full selection in flat visible order. Preferred over `selectedHref` on restore. */
    selectedHrefs?: string[];
}

export interface TreeProviderViewProps {
    provider: ITreeProvider;
    /** Show leaf items in tree (true) or directories only (false). Default: true */
    showLinks?: boolean;
    onItemClick?: (item: ITreeProviderItem) => void;
    onItemDoubleClick?: (item: ITreeProviderItem) => void;
    onFolderDoubleClick?: (item: ITreeProviderItem) => void;
    /** Called after generic + event channel menu items are added. Parent can add/modify items.
     *  `selection` is the pruned set the menu acts on — `[event.target]` for a single row, N items
     *  for a multi-selection containing the right-clicked row. Handlers that add singular actions
     *  (rename-like, navigate-like) should bail out when `selection.length > 1`. */
    onContextMenu?: (
        event: import("../../api/events/events").ContextMenuEvent<ITreeProviderItem>,
        selection: ITreeProviderItem[],
    ) => void;
    selectedHref?: string;
    initialState?: TreeProviderViewSavedState;
    onStateChange?: (state: TreeProviderViewSavedState) => void;
    refreshKey?: string | number;
    /** Optional per-row trailing content (right-aligned action slot). Receives the row's
     *  ITreeProviderItem; return null for rows without an action. */
    renderTrailing?: (item: ITreeProviderItem) => SlotContent;
    /** Optional per-row tooltip content. Falls back to the item's href. */
    getTooltip?: (item: ITreeProviderItem) => SlotText;
    /** Override root node label. When omitted, uses provider.displayName. */
    rootLabel?: string;
    /** Allow Ctrl/Shift-click multi-selection and plural actions (EPIC-049).
     *  Explorer-only for now — every other tree stays single-select. */
    multiSelect?: boolean;
}

export interface TreeProviderViewModelProps extends TreeProviderViewProps {
    onModel: ((model: TreeProviderViewModel | null) => void) | undefined;
}

export interface TreeProviderViewState {
    tree: TreeProviderNode | null;
    displayTree: TreeProviderNode | null;
    searchText: string;
    searchVisible: boolean;
    /** Bumped only when crossing the deep ↔ shallow search boundary, to remount Tree. */
    searchKey: number;
    error: string | null;
    /**
     * The tree's own selection (hrefs of the selected rows — files OR folders), in flat
     * visible order; the LAST entry is the primary (last-clicked) row. Single-select trees
     * simply never hold more than one. Synced FROM `props.selectedHref` when it changes to
     * a non-null value (main-editor navigation), but never cleared by a null — selection is
     * sticky, VS Code style. (`props.selectedHref` goes null right after a folder click
     * because the folder view carries no `filePath`; adopting that null was why folders
     * lost highlight.)
     */
    selectedValues: string[];
}

export const defaultTreeProviderViewState: TreeProviderViewState = {
    tree: null,
    displayTree: null,
    searchText: "",
    searchVisible: false,
    searchKey: 0,
    error: null,
    selectedValues: [],
};

interface TreeController {
    getExpandedMap: () => Record<string | number, boolean>;
    collapseAll: () => void;
    expandItem: (value: string | number) => void;
    revealItem: (value: string | number, align?: RowAlign) => Promise<void>;
}

// =============================================================================
// Model
// =============================================================================

export class TreeProviderViewModel extends TComponentModel<
    TreeProviderViewState,
    TreeProviderViewModelProps
> {
    treeModel: TreeController | null = null;
    savedExpandMap: Record<string, boolean> | null = null;
    initialExpandMap: Record<string, boolean> | undefined = undefined;
    private watchSubscription?: () => void;
    private watchOwnerRegistered = false;
    private previousProvider: ITreeProvider | undefined;
    private previousShowLinks: boolean | undefined;
    private previousSelectedHref: string | undefined;

    init() {
        this.props.onModel?.(this);
    }

    setProps = () => {
        const props = this.props;
        const previousProvider = this.previousProvider;
        const previousShowLinks = this.previousShowLinks;
        const previousSelectedHref = this.previousSelectedHref;
        const first = previousProvider === undefined;
        const providerChanged = !first && previousProvider !== props.provider;
        const showLinksChanged = previousShowLinks !== props.showLinks;
        const selectedHrefChanged = props.selectedHref !== previousSelectedHref;

        this.previousProvider = props.provider;
        this.previousShowLinks = props.showLinks;
        this.previousSelectedHref = props.selectedHref;

        if (first) {
            if (props.initialState?.expandedPaths?.length) {
                const map: Record<string, boolean> = {};
                for (const p of props.initialState.expandedPaths) {
                    map[p] = true;
                }
                this.initialExpandMap = map;
            }
            // Restore the persisted plural selection when it is consistent with the incoming
            // `selectedHref` (the Explorer seeds that from its own navigation state, which on
            // restart is normally the primary row of the very same set). When navigation points
            // somewhere the restored set doesn't contain, navigation wins — it reflects what the
            // main editor is actually showing. Pre-epic state carries only `selectedHref` and so
            // restores as a one-item selection.
            const restored = props.initialState?.selectedHrefs;
            const seed = props.selectedHref ?? props.initialState?.selectedHref;
            if (restored?.length && (!seed || restored.some((h) => sameHref(h, seed)))) {
                this.adoptSelection(restored);
            } else if (seed) {
                this.adoptSelection([seed]);
            }
            this.initializeTree();
            this.subscribeWatch();
        } else if (providerChanged) {
            this.subscribeWatch();
            this.buildTree();
        } else if (showLinksChanged) {
            this.recomputeDisplayTree();
        }

        // Adopt an external selection change (main-editor navigation). A null
        // selectedHref never clears — see TreeProviderViewState.selectedValues.
        if (
            !first &&
            props.selectedHref &&
            selectedHrefChanged
        ) {
            this.adoptSelection([props.selectedHref]);
        }
    };

    /** Deferred selection write — setProps runs during render, so a synchronous
     *  state.update here would trip React's update-while-rendering warning.
     *  External navigation always collapses the selection to the navigated item. */
    private adoptSelection = (hrefs: string[]) => {
        queueMicrotask(() => {
            if (!this.isLive) return;
            if (sameHrefs(this.state.get().selectedValues, hrefs)) return;
            this.state.update((s) => { s.selectedValues = hrefs; });
        });
    };

    // ── Selection ────────────────────────────────────────────────────────

    /** Selected hrefs resolved to live nodes. Misses are dropped — a refresh can
     *  delete a file that is still in `selectedValues`. */
    get selectedNodes(): TreeProviderNode[] {
        const { tree, selectedValues } = this.state.get();
        if (!tree) return [];
        return selectedValues
            .map((href) => findNode(tree, href))
            .filter((n): n is TreeProviderNode => !!n);
    }

    /** The primary row — what paste targeting operates on when several rows are selected.
     *  The Tree emits selections in flat visible order (US-937), so with a multi-selection
     *  this is the bottom-most selected row rather than literally the last-clicked one.
     *  Exact for a single selection, which is the case that matters for Ctrl+V. */
    private primaryNode = (): TreeProviderNode | null => {
        const { tree, selectedValues } = this.state.get();
        if (!tree || !selectedValues.length) return null;
        return findNode(tree, selectedValues[selectedValues.length - 1]);
    };

    /** Nested-selection pruning — see `pruneNestedItems`, which both views share. */
    private operationItems = <T extends Pick<ILink, "href" | "isDirectory">>(items: T[]): T[] =>
        pruneNestedItems(items);

    /** Prune `nodes` through `operationItems` (which works on ILink shapes). */
    private operationNodes = (nodes: TreeProviderNode[]): TreeProviderNode[] => {
        const keep = new Set(this.operationItems(nodes.map((n) => n.data)).map((d) => d.href));
        return nodes.filter((n) => keep.has(n.data.href));
    };

    /** Sink for the UIKit Tree's `onSelectionChange` (multiSelect mode). */
    setSelection = (hrefs: string[]) => {
        if (sameHrefs(this.state.get().selectedValues, hrefs)) return;
        this.state.update((s) => { s.selectedValues = hrefs; });
        this.props.onStateChange?.(this.getState());
    };

    private subscribeWatch = () => {
        if (!this.watchOwnerRegistered) {
            this.watchOwnerRegistered = true;
            this.own(() => this.watchSubscription?.());
        }
        this.watchSubscription?.();
        this.watchSubscription = undefined;
        const provider = this.props.provider as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (typeof provider.watch === "function") {
            const unsubscribe = provider.watch(() => this.buildTree());
            this.watchSubscription = unsubscribe;
        }
    };

    dispose = () => {
        this.watchSubscription?.();
        this.watchSubscription = undefined;
        // Keep props.onModel?.(null) as the last statement: child views must dispose before the
        // host notification.
        this.props.onModel?.(null);
    };

    private initializeTree = async () => {
        // buildTree seeds `initialExpandMap` with `{ rootPath: true, descendants: false }`
        // before its state.update, so the first render with `state.displayTree` already
        // has the correct `defaultExpandedValues` and the (chevron-less) root opens.
        await this.buildTree();

        // Pre-load children for restored expanded paths
        if (this.props.initialState?.expandedPaths?.length) {
            await this.loadChildrenForPaths(this.props.initialState.expandedPaths);
        }
    };

    private buildAllCollapsedMap = (tree: TreeProviderNode): Record<string, boolean> => {
        const map: Record<string, boolean> = {};
        const walk = (node: TreeProviderNode, isRoot: boolean) => {
            if (node.data.isDirectory) {
                map[node.data.href] = isRoot;
            }
            if (node.items) {
                for (const child of node.items) {
                    walk(child, false);
                }
            }
        };
        walk(tree, true);
        return map;
    };

    setTreeModel = (model: TreeController | null) => {
        this.treeModel = model;
    };

    collapseAll = () => {
        const rootPath = this.props.provider.rootPath;
        this.treeModel?.collapseAll();
        setTimeout(() => {
            this.treeModel?.expandItem(rootPath);
            this.pruneSelectionToVisible();
        }, 0);
        this.props.onStateChange?.({ ...this.getState(), expandedPaths: [rootPath] });
    };

    // ── Tree building ────────────────────────────────────────────────────

    buildTree = async () => {
        const { provider } = this.props;

        // Capture currently-expanded paths before rebuild. We need the EFFECTIVE expansion
        // — both user-toggled state from Tree (state.expanded) AND restored hints
        // (initialExpandMap entries set to true). Without the hint contribution, a refresh
        // fired before any user interaction (e.g. FileTreeProvider's FS watcher firing
        // moments after mount) would lose the restored expansion: getExpandedMap returns
        // only state.expanded, which is empty for hint-only expansions, so the rebuild
        // wouldn't reload grandchildren — leaving expanded chevrons with no children.
        // User-toggled state wins where both are defined (so an explicitly collapsed
        // hint-expanded folder stays collapsed across refresh).
        const treeStateMap = this.treeModel?.getExpandedMap() ?? {};
        const isExpanded = this.expandedResolver(treeStateMap);
        const allKeys = new Set<string>([
            ...Object.keys(treeStateMap).map((k) => String(k)),
            ...Object.keys(this.initialExpandMap ?? {}),
        ]);
        const expandedPaths: string[] = [];
        for (const key of allKeys) {
            if (isExpanded(key)) expandedPaths.push(key);
        }

        try {
            const items = filterTreeItems(await provider.list(provider.rootPath));
            let workingTree: TreeProviderNode = {
                data: {
                    // The root node's href is the provider's rootPath verbatim. Some
                    // providers (e.g. Mneme) emit a scheme-qualified href for child
                    // nodes while keeping rootPath scheme-less — leave this as-is: the
                    // root is expand-only (never navigated or stored as a link) and all
                    // equality checks compare against rootPath, so the asymmetry is
                    // intentional, not a bug to "fix".
                    title: this.props.rootLabel ?? provider.displayName,
                    href: provider.rootPath,
                    category: "",
                    tags: [],
                    isDirectory: true,
                },
                items: items.map(toNode),
            };

            // Refresh children for every expanded directory INLINE, before publishing the
            // new tree. Doing this atomically avoids an intermediate render where the tree
            // is shrunk to root-only entries (all child folders' `items` momentarily
            // undefined). That shrink would force the native virtual-grid model through its
            // over-large-offset clamp (VirtualGridModel.ts:527-540), wiping the user's scroll
            // position on every FS watch tick — exactly what an AI agent
            // editing files in the project folder triggers repeatedly.
            //
            // Sorted by length so parent paths are populated before child paths — needed
            // for findNode/updateNodeChildren to locate the deeper expanded entries.
            // Sequential await is fine: FileTreeProvider.watch is debounced 500ms, and the
            // OLD tree remains visible the entire time (no intermediate state.update).
            const sorted = [...expandedPaths].sort((a, b) => a.length - b.length);
            for (const href of sorted) {
                if (href === provider.rootPath) continue;
                const node = findNode(workingTree, href);
                if (!node || !node.data.isDirectory) continue;
                const listPath = this.getListPath(node);
                try {
                    const childItems = filterTreeItems(await provider.list(listPath));
                    workingTree = updateNodeChildren(workingTree, href, childItems.map(toNode));
                } catch {
                    workingTree = updateNodeChildren(workingTree, href, []);
                }
            }

            // Seed `initialExpandMap` BEFORE the state update so the very first render with
            // `state.displayTree` reads `defaultExpandedValues={ rootPath: true, ... }` and
            // expands the root (whose chevron is hidden — only this default keeps it open).
            // Subsequent builds skip the seed: once the root is in the map, user state in
            // Tree's own `state.expanded` overrides the hint anyway.
            if (!this.initialExpandMap || !(provider.rootPath in this.initialExpandMap)) {
                const collapsedMap = this.buildAllCollapsedMap(workingTree);
                this.initialExpandMap = { ...collapsedMap, ...this.initialExpandMap };
            }

            const { searchText } = this.state.get();
            const displayTree = this.computeDisplayTree(workingTree, searchText);

            this.state.update((s) => {
                s.tree = workingTree;
                s.displayTree = displayTree;
                s.error = null;
            });
        } catch (err) {
            this.state.update((s) => {
                s.tree = null;
                s.displayTree = null;
                s.error = err.message || "Failed to list directory";
            });
        }
    };

    // ── Lazy loading ─────────────────────────────────────────────────────

    private loadChildrenIfNeeded = async (href: string) => {
        const { tree } = this.state.get();
        if (!tree) return;

        const node = findNode(tree, href);
        if (!node || !node.data.isDirectory || node.items !== undefined) return;

        // Determine the path to list: for root node use rootPath,
        // otherwise use the category path that the provider expects
        const listPath = this.getListPath(node);

        try {
            const items = filterTreeItems(await this.props.provider.list(listPath));
            const newTree = updateNodeChildren(tree, href, items.map(toNode));
            const { searchText } = this.state.get();
            const displayTree = this.computeDisplayTree(newTree, searchText);

            this.state.update((s) => {
                s.tree = newTree;
                s.displayTree = displayTree;
            });
        } catch {
            // Mark as loaded but empty on error
            const newTree = updateNodeChildren(tree, href, []);
            this.state.update((s) => {
                s.tree = newTree;
                s.displayTree = this.computeDisplayTree(newTree, s.searchText);
            });
        }
    };

    private loadChildrenForPaths = async (paths: string[]) => {
        let { tree } = this.state.get();
        if (!tree) return;

        const sorted = [...paths].sort((a, b) => a.length - b.length);
        let changed = false;

        for (const href of sorted) {
            const node = findNode(tree, href);
            if (node && node.data.isDirectory && node.items === undefined) {
                const listPath = this.getListPath(node);
                try {
                    const items = filterTreeItems(await this.props.provider.list(listPath));
                    tree = updateNodeChildren(tree, href, items.map(toNode));
                    changed = true;
                } catch {
                    tree = updateNodeChildren(tree, href, []);
                    changed = true;
                }
            }
        }

        if (changed) {
            const { searchText } = this.state.get();
            const displayTree = this.computeDisplayTree(tree, searchText);
            this.state.update((s) => {
                s.tree = tree;
                s.displayTree = displayTree;
            });
        }
    };

    /** Get the path to pass to provider.list() for a given node. */
    private getListPath = (node: TreeProviderNode): string => {
        return this.getItemListPath(node.data);
    };

    /** Path flavor expected by provider list/create/rename calls. Archive hrefs include the
     * archive prefix, so non-root items are rebuilt from category plus title. */
    private getItemListPath = (item: ITreeProviderItem): string => {
        const { provider } = this.props;
        // For FileTreeProvider: href is the absolute path, use it directly
        // For ArchiveTreeProvider: href is "archive.zip!inner/path", we need inner path
        // The category of children = the directory path the provider understands
        // For root node, category is "" and we use provider.rootPath
        if (item.href === provider.rootPath) {
            return provider.rootPath;
        }
        // For child directories, build the inner path from category + name
        const category = item.category;
        return category
            ? category + "/" + item.title
            : item.title;
    };

    private get itemCrudContext(): ItemCrudContext {
        return {
            provider: this.props.provider,
            getItemPath: this.getItemListPath,
            refresh: this.buildTree,
        };
    }

    private get itemMenuActions(): ItemMenuActions {
        return {
            createFile: (directory) => { void this.createNewFile(directory); },
            createFolder: (directory) => { void this.createNewFolder(directory); },
            paste: (directory) => { void this.pasteIntoDir(directory); },
            rename: (item) => {
                const tree = this.state.get().tree;
                const node = tree ? findNode(tree, item.href) : null;
                if (node) void this.renameItem(node);
            },
            deleteItem: (item) => { void this.deleteItemAction(item); },
        };
    }

    // ── State persistence ────────────────────────────────────────────────

    getState = (): TreeProviderViewSavedState => {
        const expandMap = this.treeModel?.getExpandedMap() ?? {};
        const expandedPaths = Object.entries(expandMap)
            .filter(([, expanded]) => expanded)
            .map(([id]) => id);
        const selectedValues = this.state.get().selectedValues;
        return {
            expandedPaths,
            selectedHref: selectedValues.length
                ? selectedValues[selectedValues.length - 1]
                : this.props.selectedHref,
            selectedHrefs: selectedValues,
        };
    };

    onExpandChange = (id: string, expanded: boolean) => {
        if (expanded) {
            this.loadChildrenIfNeeded(id);
        } else {
            // Only visible rows may stay selected (epic D10). The Tree fires this for the
            // toggled row only, even with `collapseDescendants` — fine, because
            // pruneSelectionToVisible recomputes the whole visible set.
            this.pruneSelectionToVisible();
        }
        this.props.onStateChange?.(this.getState());
    };

    // ── Visible-row selection pruning (epic D10) ─────────────────────────

    /** Resolve effective expansion the way `buildTree` does: user-toggled Tree state wins
     *  where defined, restored hints (`initialExpandMap`) fill in, default collapsed. */
    private expandedResolver = (
        map: Record<string, boolean> = this.treeModel?.getExpandedMap() ?? {},
    ) => (href: string): boolean => {
        const fromState = map[href];
        return fromState !== undefined ? !!fromState : !!this.initialExpandMap?.[href];
    };

    /** Every href currently rendered as a row: walk from the root, descending into a
     *  directory only when it is effectively expanded. The root is always expanded (it is
     *  chevron-less and `canCollapse` blocks collapsing it). */
    private visibleHrefs = (): Set<string> => {
        const { tree } = this.state.get();
        const out = new Set<string>();
        if (!tree) return out;
        const isExpanded = this.expandedResolver();
        const walk = (node: TreeProviderNode, isRoot: boolean) => {
            out.add(node.data.href);
            if (!node.data.isDirectory || !node.items) return;
            if (!isRoot && !isExpanded(node.data.href)) return;
            for (const child of node.items) walk(child, false);
        };
        walk(tree, true);
        return out;
    };

    /** Drop selected rows that are no longer visible (their folder was collapsed).
     *  No-op — no state write, no onStateChange — when nothing changed. */
    pruneSelectionToVisible = () => {
        const { selectedValues } = this.state.get();
        if (!selectedValues.length) return;
        const visible = this.visibleHrefs();
        const kept = selectedValues.filter((href) => visible.has(href));
        if (kept.length === selectedValues.length) return;
        this.state.update((s) => { s.selectedValues = kept; });
        this.props.onStateChange?.(this.getState());
    };

    // ── Search ───────────────────────────────────────────────────────────

    showSearch = () => {
        this.state.update((s) => { s.searchVisible = true; });
    };

    hideSearch = () => {
        const wasDeep = this.state.get().searchText.length >= 3;

        if (wasDeep) {
            this.initialExpandMap = this.savedExpandMap ?? undefined;
            this.savedExpandMap = null;
        }

        this.state.update((s) => {
            s.searchText = "";
            s.searchVisible = false;
            s.displayTree = this.computeDisplayTree(s.tree, "");
            if (wasDeep) {
                s.searchKey++;
            }
        });
    };

    setSearchText = (text: string) => {
        const { searchText: prevText, tree } = this.state.get();
        const wasDeep = prevText.length >= 3;
        const isDeep = text.length >= 3;

        let keyDelta = 0;
        if (wasDeep !== isDeep) {
            keyDelta = 1;
            if (isDeep) {
                // Capture the EFFECTIVE expansion, not just Tree's explicit toggles.
                // `getExpandedMap()` returns only `state.expanded`, which is empty for a tree
                // whose expansion came from the `initialExpandMap` hint — i.e. every restored
                // or freshly-built tree the user has not clicked in yet. Saving the raw map
                // there stores `{}`, so clearing the search restores nothing and the tree
                // collapses to its root (US-1039). `buildTree` already merges the two the same
                // way (`:310-327`); `expandedResolver` is that rule, so reuse it rather than
                // restate it. Order matters: it reads `initialExpandMap`, which is cleared below.
                const stateMap = Object.fromEntries(
                    Object.entries(this.treeModel?.getExpandedMap() ?? {})
                        .map(([k, v]) => [String(k), !!v]),
                );
                const isExpanded = this.expandedResolver(stateMap);
                const keys = new Set<string>([
                    ...Object.keys(stateMap),
                    ...Object.keys(this.initialExpandMap ?? {}),
                ]);
                const effective: Record<string, boolean> = {};
                for (const key of keys) effective[key] = isExpanded(key);
                this.savedExpandMap = effective;
                this.initialExpandMap = undefined;
            } else {
                this.initialExpandMap = this.savedExpandMap ?? undefined;
                this.savedExpandMap = null;
            }
        }

        const displayTree = this.computeDisplayTree(tree, text);
        this.state.update((s) => {
            s.searchText = text;
            s.displayTree = displayTree;
            s.searchKey += keyDelta;
        });
    };

    /** Recompute displayTree from the current raw tree (e.g., after showLinks changes). */
    private recomputeDisplayTree = () => {
        const { tree, searchText } = this.state.get();
        const displayTree = this.computeDisplayTree(tree, searchText);
        this.state.update((s) => { s.displayTree = displayTree; });
    };

    private computeDisplayTree = (
        tree: TreeProviderNode | null,
        searchText: string,
    ): TreeProviderNode | null => {
        if (!tree) return null;

        let result = tree;

        // Apply showLinks filter
        if (this.props.showLinks === false) {
            result = filterDirectoriesOnly(result);
        }

        // Apply search filter
        if (searchText) {
            const words = searchText.toLowerCase().split(" ").filter(Boolean);
            if (words.length > 0) {
                if (searchText.length >= 3) {
                    result = filterTreeDeep(result, words);
                } else {
                    const expandedPaths = this.getExpandedPaths();
                    result = filterTreeShallow(result, words, expandedPaths);
                }
            }
        }

        return result;
    };

    private getExpandedPaths = (): Set<string> => {
        const map = this.treeModel?.getExpandedMap() ?? {};
        return new Set(
            Object.entries(map)
                .filter(([, expanded]) => expanded)
                .map(([id]) => id),
        );
    };

    // ── Reveal item ───────────────────────────────────────────────────────

    /**
     * Expand ancestors, load children if needed, and scroll to make an item visible.
     * Uses provider.rootPath and path-based ancestor computation (works for FileTreeProvider).
     */
    revealItem = async (href: string) => {
        const { provider } = this.props;
        const { tree } = this.state.get();
        if (!tree) return;

        // Compute ancestor directory paths from href to rootPath.
        const rootLower = provider.rootPath.toLowerCase();
        const ancestors: string[] = [];
        let current = href;
        let parent = fpDirname(current);
        while (parent !== current && parent.toLowerCase() !== rootLower) {
            ancestors.unshift(parent);
            current = parent;
            parent = fpDirname(current);
        }

        // Load children for all ancestor paths (no-op for already loaded)
        const allPaths = [provider.rootPath, ...ancestors];
        await this.loadChildrenForPaths(allPaths);

        // Wait for React to re-render Tree with the new children data
        await new Promise((r) => setTimeout(r, 0));

        // UIKit Tree's revealItem expands ancestors found in the loaded tree, then scrolls.
        await this.treeModel?.revealItem(href);
    };

    // ── Click handlers ───────────────────────────────────────────────────

    onItemClick = (node: TreeProviderNode) => {
        // In multiSelect mode the Tree's gesture path already published the new selection
        // through `setSelection` — writing it again here would fight the plural emit.
        if (!this.props.multiSelect) {
            this.setSelection([node.data.href]);
        }
        // Expansion is chevron-only (TreeProviderView.renderItem onChevronClick, plus
        // ArrowRight/ArrowLeft) — clicking the label selects + navigates without toggling.
        // Fire onItemClick for all items (files and folders).
        // Parent decides whether to navigate based on selection state.
        this.props.onItemClick?.(node.data);
    };

    onItemDoubleClick = (node: TreeProviderNode) => {
        if (node.data.isDirectory) {
            this.props.onFolderDoubleClick?.(node.data);
        } else {
            this.props.onItemDoubleClick?.(node.data);
        }
    };

    // ── Keyboard actions ─────────────────────────────────────────────────

    /**
     * Ctrl+C / Ctrl+X / Ctrl+V (OS file clipboard, file provider only), Delete
     * (confirm dialog), and F2 (rename dialog) on the selected row. Returns true
     * when the key was consumed. Wired from TreeProviderView's wrapper onKeyDown,
     * which sees keys bubbled from the Tree.
     */
    onTreeKeyDown = (e: KeyboardEvent): boolean => {
        // The search input (or any editable element) keeps native key behavior.
        const t = e.target as HTMLElement;
        if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) {
            return false;
        }

        const { provider } = this.props;
        const nodes = this.selectedNodes;
        const node = this.primaryNode();
        const hasRoot = nodes.some((n) => n.data.href === provider.rootPath);
        const consume = () => {
            e.preventDefault();
            e.stopPropagation();
            return true;
        };

        // Delete → confirm dialog over the whole (pruned) selection; F2 → rename dialog, which
        // stays singular. Same gating as the context-menu items: writable provider capability,
        // never on the root.
        if (!e.ctrlKey && !e.altKey && !e.shiftKey && nodes.length && !hasRoot) {
            if (e.key === "Delete" && provider.writable && provider.deleteItem) {
                void this.deleteItemsAction(nodes);
                return consume();
            }
            if (
                e.key === "F2"
                && nodes.length === 1
                && node
                && provider.writable
                && provider.rename
            ) {
                void this.renameItem(node);
                return consume();
            }
        }

        // OS file clipboard (US-807 actions) — file provider only.
        if (!e.ctrlKey || e.altKey || e.shiftKey) return false;
        const key = e.key.toLowerCase();
        if (key !== "c" && key !== "x" && key !== "v") return false;
        if (!supportsOsClipboard(provider)) return false;

        if (key === "v") {
            // The primary row decides the target: folder → into it; file → its parent;
            // nothing selected → root.
            const targetDir = !node
                ? provider.rootPath
                : node.data.isDirectory
                    ? this.getListPath(node)
                    : (node.data.category || provider.rootPath);
            void this.pasteIntoDir(targetDir);
            return consume();
        }
        if (!nodes.length) return false;
        // Copy is allowed on the root (mirrors the context menu); Cut is not.
        if (hasRoot && key === "x") return false;
        const targets = this.operationItems(nodes.map((n) => n.data));
        void copyPathsToOsClipboard(targets.map((d) => d.href), key === "x");
        return consume();
    };

    // ── Context menus ────────────────────────────────────────────────────

    onItemContextMenu = (node: TreeProviderNode, e: MouseEvent) => {
        // Right-click selects the row (Windows Explorer / VS Code behavior). In multiSelect
        // mode TreeModel owns that rule (it keeps a right-click inside an existing selection
        // intact and emits through setSelection first), so only single-select writes here.
        if (!this.props.multiSelect) {
            this.setSelection([node.data.href]);
        }
        const ctxEvent = ContextMenuEvent.fromNativeEvent(e, "tree-provider-item");
        ctxEvent.target = node.data;

        // Layer 1: Generic items (Copy Path, Rename, Delete). A multi-selection containing
        // the right-clicked row gets the plural menu; anything else the single-row menu.
        const multi = this.multiTargets(node);
        const items = multi
            ? this.getMultiMenuItems(multi)
            : node.data.isDirectory
                ? this.getFolderMenuItems(node)
                : this.getFileMenuItems(node);
        ctxEvent.items.push(...items);

        // Layer 2: Event channel — type-specific items added by registered handlers
        // Layer 3: Parent callback — final additions/modifications
        // Set contextMenuPromise so GlobalEventService waits for async handlers
        // before showing the popup menu.
        const promise = (async () => {
            const result = await app.events.linkContextMenu.sendAsync(
                ctxEvent as ContextMenuEvent<ITreeProviderItem>,
            );
            this.props.onContextMenu?.(
                ctxEvent as ContextMenuEvent<ITreeProviderItem>,
                multi ? multi.map((n) => n.data) : [node.data],
            );
            return result;
        })();
        e.contextMenuPromise = promise;
    };

    onBackgroundContextMenu = (e: MouseEvent) => {
        const ctxEvent = e.contextMenuEvent;
        const isFolder = ctxEvent?.target && (ctxEvent.target as any).isDirectory; // eslint-disable-line @typescript-eslint/no-explicit-any
        const { provider } = this.props;
        if (isFolder) return;

        const items = getBackgroundMenuItems(provider, provider.rootPath, this.itemMenuActions);
        if (!items.length) return;

        const bgEvent = ContextMenuEvent.fromNativeEvent(e, "tree-provider-background");
        bgEvent.items.push(...items);
    };

    /**
     * The pruned selection to act on when `node` was right-clicked, or null when the
     * single-row menu should be built instead — i.e. multiSelect is off, the row is outside
     * the selection, or pruning (epic D9) collapsed the set to one node. A "Copy (1)" label
     * over a plural code path is a worse menu than the single-row one, which also offers
     * Rename, Paste and Open Terminal here.
     */
    private multiTargets = (node: TreeProviderNode): TreeProviderNode[] | null => {
        if (!this.props.multiSelect) return null;
        const { selectedValues } = this.state.get();
        if (selectedValues.length < 2) return null;
        if (!selectedValues.includes(node.data.href)) return null;
        const targets = this.operationNodes(this.selectedNodes);
        return targets.length > 1 ? targets : null;
    };

    /** Set-shaped actions over N selected rows. `nodes` is already pruned, so every count
     *  shown here is the pruned count (epic D9). */
    private getMultiMenuItems = (nodes: TreeProviderNode[]): MenuItem[] =>
        buildMultiItemMenuItems(
            this.props.provider,
            nodes.map((n) => n.data),
            () => this.deleteItemsAction(nodes),
        );

    private getFileMenuItems = (node: TreeProviderNode): MenuItem[] =>
        getFileMenuItems(this.props.provider, node.data, this.itemMenuActions);

    private getFolderMenuItems = (node: TreeProviderNode): MenuItem[] =>
        getFolderMenuItems({
            provider: this.props.provider,
            item: node.data,
            directory: this.getListPath(node),
            isRoot: node.data.href === this.props.provider.rootPath,
            actions: this.itemMenuActions,
        });

    // ── File operations ──────────────────────────────────────────────────

    /** Paste the OS clipboard's files into `targetDir` and refresh (US-807). */
    private pasteIntoDir = (targetDir: string) => pasteIntoDir(this.itemCrudContext, targetDir);

    private createNewFile = (dirPath: string) => createNewFile(this.itemCrudContext, dirPath);

    private createNewFolder = (dirPath: string) => createNewFolder(this.itemCrudContext, dirPath);

    /** Rename dialog + provider.rename. Public: invoked by both the context menu and F2. */
    renameItem = (node: TreeProviderNode) => renameItem(this.itemCrudContext, node.data);

    /** Confirm dialog + provider.deleteItem. Public: invoked by both the context menu and Delete. */
    deleteItemAction = (item: ITreeProviderItem) =>
        deleteItemAction(this.itemCrudContext, item);

    /**
     * Confirm once, then delete every node in `nodes`. Public: plural context menu + the
     * Delete key. Prunes nested selections first (epic D9), so a folder plus files inside it
     * deletes the folder only — and the count in the confirm is the pruned count (epic D8:
     * count only, no name list).
     */
    deleteItemsAction = async (nodes: TreeProviderNode[]) => {
        const outcome = await deleteItemsBatch(
            this.props.provider,
            nodes.map((n) => n.data),
            // One item → the existing singular wording, no progress overlay, and
            // deleteItemAction does its own refresh.
            this.deleteItemAction,
        );
        if (outcome !== "batch") return;
        // Nothing sensible stays selected after a batch delete.
        this.setSelection([]);
        await this.buildTree();
    };

    // ── Drag-drop ────────────────────────────────────────────────────────

    /**
     * The items a drag starting on `node` should carry: the whole selection when the row is
     * part of it, otherwise just that row (Explorer behavior — dragging an unselected row does
     * not silently carry the selection). Pruned through `operationItems` (epic D9), so a folder
     * dragged together with items inside it carries the folder only, and never includes the
     * tree root. Single-select trees always get the one row.
     */
    dragItemsFor = (node: TreeProviderNode): ITreeProviderItem[] => {
        const { provider, multiSelect } = this.props;
        const { selectedValues } = this.state.get();
        const dragsSelection = !!multiSelect
            && selectedValues.length > 1
            && selectedValues.includes(node.data.href);
        const items = dragsSelection
            ? this.selectedNodes.map((n) => n.data)
            : [node.data];
        return this.operationItems(items).filter((i) => i.href !== provider.rootPath);
    };

    // ── Drop targets ─────────────────────────────────────────────────────
    //
    // The tree's only tree-specific job in a drop is turning "where did this land" into a
    // target the shared actions understand. Two flavors, deliberately not unified — see
    // `DropTarget.path`:

    /** Move target: the provider's list path for the folder, plus its name for the confirm.
     *  Drop on a folder → into it; drop on a file → its parent folder. */
    private moveTargetFor = (node: TreeProviderNode): DropTarget | null => {
        const dir = node.data.isDirectory
            ? node
            : findParent(this.state.get().tree, node.data.href);
        if (!dir) return null;
        return { path: this.getListPath(dir), title: dir.data.title };
    };

    /** Import target: the category href written into. Drop on a folder → the folder itself;
     *  drop on a file → its parent category. */
    private importCategoryFor = (node: TreeProviderNode): string =>
        node.data.isDirectory
            ? node.data.href
            : (node.data.category || this.props.provider.rootPath);

    moveItems = async (sourceItems: ILink[], targetNode: TreeProviderNode) => {
        const target = this.moveTargetFor(targetNode);
        if (!target) return;
        if (await moveItemsInto(this.props.provider, sourceItems, target)) {
            await this.buildTree();
        }
    };

    /** Import dropped file-like items (IFileLink) into the drop target's folder. */
    importFiles = async (items: IFileLink[], dropNode: TreeProviderNode) => {
        const target = this.importCategoryFor(dropNode);
        if (await importFilesInto(this.props.provider, items, target)) {
            await this.buildTree();
        }
    };

    /** OS-file drop into a file-tree folder — Move / Copy choice, then a batch copy. File
     *  providers only; non-file providers route to `importFiles` (see TreeProviderView). */
    dropOsFilesInto = async (items: IFileLink[], dropNode: TreeProviderNode) => {
        const path = this.importCategoryFor(dropNode);
        const target: DropTarget = {
            path,
            title: dropNode.data.isDirectory ? dropNode.data.title : fpBasename(path),
        };
        if (await dropOsFilesIntoTarget(this.props.provider, items, target)) {
            await this.buildTree();
        }
    };

    /** Import links dragged from another collection into the drop target's category.
     *  Catalog providers only (those implementing `importLinks`). */
    importLinksTo = async (items: ILink[], dropNode: TreeProviderNode) => {
        const { provider } = this.props;
        if (!provider.importLinks || !items.length) return;

        const targetCategory = dropNode.data.isDirectory
            ? dropNode.data.href
            : (dropNode.data.category || provider.rootPath);

        try {
            await provider.importLinks(items, targetCategory);
        } catch (err) {
            ui.notify(err.message || "Failed to import links.", "warning");
            return;
        }
        await this.buildTree();
    };
}

// =============================================================================
// Pure utility functions
// =============================================================================

/** Filter out ".." parent navigation entries (used by FileTreeProvider for flat views, not trees). */
function filterTreeItems(items: ITreeProviderItem[]): ITreeProviderItem[] {
    return items.filter((item) => item.title !== "..");
}

function toNode(item: ITreeProviderItem): TreeProviderNode {
    return {
        data: item,
        items: item.isDirectory ? undefined : undefined,
        // directories: items = undefined (lazy), files: no items needed
    };
}

function findNode(tree: TreeProviderNode, href: string): TreeProviderNode | null {
    if (tree.data.href === href) return tree;
    if (tree.items) {
        for (const child of tree.items) {
            const found = findNode(child, href);
            if (found) return found;
        }
    }
    return null;
}

function findParent(tree: TreeProviderNode | null, href: string): TreeProviderNode | null {
    if (!tree || !tree.items) return null;
    for (const child of tree.items) {
        if (child.data.href === href) return tree;
        const found = findParent(child, href);
        if (found) return found;
    }
    return null;
}

function updateNodeChildren(
    node: TreeProviderNode,
    href: string,
    children: TreeProviderNode[],
): TreeProviderNode {
    if (node.data.href === href) {
        return { ...node, items: children };
    }
    if (node.items) {
        return {
            ...node,
            items: node.items.map(child => updateNodeChildren(child, href, children)),
        };
    }
    return node;
}

// ── Tree filters ─────────────────────────────────────────────────────────

function filterDirectoriesOnly(node: TreeProviderNode): TreeProviderNode {
    return {
        ...node,
        items: node.items
            ?.filter(child => child.data.isDirectory)
            .map(filterDirectoriesOnly),
    };
}

function filterTreeDeep(
    node: TreeProviderNode,
    words: string[],
): TreeProviderNode {
    return {
        ...node,
        items: filterChildrenDeep(node.items, words),
    };
}

function filterChildrenDeep(
    items: TreeProviderNode[] | undefined,
    words: string[],
): TreeProviderNode[] {
    if (!items) return [];
    const result: TreeProviderNode[] = [];
    for (const item of items) {
        if (item.data.isDirectory) {
            const filteredChildren = filterChildrenDeep(item.items, words);
            if (filteredChildren.length > 0) {
                result.push({ ...item, items: filteredChildren });
            }
        } else {
            const nameLower = item.data.title.toLowerCase();
            if (words.every(w => nameLower.includes(w))) {
                result.push(item);
            }
        }
    }
    return result;
}

function filterTreeShallow(
    node: TreeProviderNode,
    words: string[],
    expandedPaths: Set<string>,
): TreeProviderNode {
    return {
        ...node,
        items: filterChildrenShallow(node.items, words, expandedPaths),
    };
}

function filterChildrenShallow(
    items: TreeProviderNode[] | undefined,
    words: string[],
    expandedPaths: Set<string>,
): TreeProviderNode[] {
    if (!items) return [];
    const result: TreeProviderNode[] = [];
    for (const item of items) {
        if (item.data.isDirectory) {
            if (expandedPaths.has(item.data.href)) {
                result.push({
                    ...item,
                    items: filterChildrenShallow(item.items, words, expandedPaths),
                });
            } else {
                result.push(item);
            }
        } else {
            const nameLower = item.data.title.toLowerCase();
            if (words.every(w => nameLower.includes(w))) {
                result.push(item);
            }
        }
    }
    return result;
}

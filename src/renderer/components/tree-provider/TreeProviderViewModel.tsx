import type React from "react";
import { TComponentModel } from "../../core/state/model";
import type { ITreeProvider, ITreeProviderItem, ILink } from "../../api/types/io.tree";
import type { TreeRef } from "../../uikit/Tree";
import type { MenuItem } from "../../uikit/Menu";
import { ContextMenuEvent } from "../../api/events/events";
import { app } from "../../api/app";
import { ui } from "../../api/ui";
import { fpDirname } from "../../core/utils/file-path";
import { isUrlOrCurl } from "../../content/link-utils";
import type { IFileLink } from "../../core/traits/fileLinkTraits";
import {
    CopyIcon,
    DeleteIcon,
    NewFileIcon,
    NewFolderIcon,
    RenameIcon,
} from "../../theme/icons";

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
    selectedHref?: string;
}

export interface TreeProviderViewProps {
    provider: ITreeProvider;
    /** Show leaf items in tree (true) or directories only (false). Default: true */
    showLinks?: boolean;
    onItemClick?: (item: ITreeProviderItem) => void;
    onItemDoubleClick?: (item: ITreeProviderItem) => void;
    onFolderDoubleClick?: (item: ITreeProviderItem) => void;
    /** Called after generic + event channel menu items are added. Parent can add/modify items. */
    onContextMenu?: (event: import("../../api/events/events").ContextMenuEvent<ITreeProviderItem>) => void;
    selectedHref?: string;
    initialState?: TreeProviderViewSavedState;
    onStateChange?: (state: TreeProviderViewSavedState) => void;
    refreshKey?: string | number;
    /** Override label rendering. When omitted, default title + search highlight is used. */
    getLabel?: (item: ILink, searchText: string) => React.ReactNode;
    /** Optional per-row trailing content (right-aligned action slot). Receives the row's
     *  ITreeProviderItem; return null for rows without an action. */
    renderTrailing?: (item: ITreeProviderItem) => React.ReactNode;
    /** Override root node label. When omitted, uses provider.displayName. */
    rootLabel?: string;
}

export interface TreeProviderViewState {
    tree: TreeProviderNode | null;
    displayTree: TreeProviderNode | null;
    searchText: string;
    searchVisible: boolean;
    /** Bumped only when crossing the deep ↔ shallow search boundary, to remount Tree. */
    searchKey: number;
    error: string | null;
}

export const defaultTreeProviderViewState: TreeProviderViewState = {
    tree: null,
    displayTree: null,
    searchText: "",
    searchVisible: false,
    searchKey: 0,
    error: null,
};

// =============================================================================
// Model
// =============================================================================

export class TreeProviderViewModel extends TComponentModel<
    TreeProviderViewState,
    TreeProviderViewProps
> {
    treeRef: TreeRef | null = null;
    savedExpandMap: Record<string, boolean> | null = null;
    initialExpandMap: Record<string, boolean> | undefined = undefined;
    private watchSubscription?: { unsubscribe: () => void };

    setProps = () => {
        if (this.isFirstUse) {
            if (this.props.initialState?.expandedPaths?.length) {
                const map: Record<string, boolean> = {};
                for (const p of this.props.initialState.expandedPaths) {
                    map[p] = true;
                }
                this.initialExpandMap = map;
            }
            this.initializeTree();
            this.subscribeWatch();
        } else if (this.oldProps?.provider !== this.props.provider) {
            this.subscribeWatch();
            this.buildTree();
        } else if (this.oldProps?.showLinks !== this.props.showLinks) {
            this.recomputeDisplayTree();
        }
    };

    private subscribeWatch = () => {
        this.watchSubscription?.unsubscribe();
        this.watchSubscription = undefined;
        const provider = this.props.provider as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (typeof provider.watch === "function") {
            this.watchSubscription = provider.watch(() => this.buildTree());
        }
    };

    dispose = () => {
        this.watchSubscription?.unsubscribe();
        this.watchSubscription = undefined;
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

    setTreeRef = (ref: TreeRef | null) => {
        this.treeRef = ref;
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
        const treeStateMap = this.treeRef?.getExpandedMap() ?? {};
        const allKeys = new Set<string>([
            ...Object.keys(treeStateMap).map((k) => String(k)),
            ...Object.keys(this.initialExpandMap ?? {}),
        ]);
        const expandedPaths: string[] = [];
        for (const key of allKeys) {
            const fromState = treeStateMap[key];
            const effective = fromState !== undefined ? fromState : !!this.initialExpandMap?.[key];
            if (effective) expandedPaths.push(key);
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
            // undefined). That shrink causes RenderGridModel.updateRenderInfo to reset
            // scrollOffset.y to 0 (innerSize < size branch in RenderGridModel.ts), wiping
            // the user's scroll position on every FS watch tick — exactly what an AI agent
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
        const { provider } = this.props;
        // For FileTreeProvider: href is the absolute path, use it directly
        // For ArchiveTreeProvider: href is "archive.zip!inner/path", we need inner path
        // The category of children = the directory path the provider understands
        // For root node, category is "" and we use provider.rootPath
        if (node.data.href === provider.rootPath) {
            return provider.rootPath;
        }
        // For child directories, build the inner path from category + name
        const category = node.data.category;
        return category
            ? category + "/" + node.data.title
            : node.data.title;
    };

    // ── State persistence ────────────────────────────────────────────────

    getState = (): TreeProviderViewSavedState => {
        const expandMap = this.treeRef?.getExpandedMap() ?? {};
        const expandedPaths = Object.entries(expandMap)
            .filter(([, expanded]) => expanded)
            .map(([id]) => id);
        return {
            expandedPaths,
            selectedHref: this.props.selectedHref,
        };
    };

    onExpandChange = (id: string, expanded: boolean) => {
        if (expanded) {
            this.loadChildrenIfNeeded(id);
        }
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
                const map = this.treeRef?.getExpandedMap() ?? {};
                this.savedExpandMap = Object.fromEntries(
                    Object.entries(map).map(([k, v]) => [String(k), v as boolean]),
                );
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
        const map = this.treeRef?.getExpandedMap() ?? {};
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
        await this.treeRef?.revealItem(href);
    };

    // ── Click handlers ───────────────────────────────────────────────────

    onItemClick = (node: TreeProviderNode) => {
        // Root is non-collapsible — click toggles every other directory only.
        if (node.data.isDirectory && node.data.href !== this.props.provider.rootPath) {
            this.treeRef?.toggleItem(node.data.href);
        }
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

    // ── Context menus ────────────────────────────────────────────────────

    onItemContextMenu = (node: TreeProviderNode, e: React.MouseEvent) => {
        const ctxEvent = ContextMenuEvent.fromNativeEvent(e, "tree-provider-item");
        ctxEvent.target = node.data;

        // Layer 1: Generic items (Copy Path, Rename, Delete)
        const items = node.data.isDirectory
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
            this.props.onContextMenu?.(ctxEvent as ContextMenuEvent<ITreeProviderItem>);
            return result;
        })();
        e.nativeEvent.contextMenuPromise = promise;
    };

    onBackgroundContextMenu = (e: React.MouseEvent) => {
        const ctxEvent = e.nativeEvent.contextMenuEvent;
        const isFolder = ctxEvent?.target && (ctxEvent.target as any).isDirectory; // eslint-disable-line @typescript-eslint/no-explicit-any
        const { provider } = this.props;

        if (provider.writable && provider.mkdir && !isFolder) {
            const bgEvent = ContextMenuEvent.fromNativeEvent(e, "tree-provider-background");
            bgEvent.items.push(
                {
                    label: "New File...",
                    icon: <NewFileIcon />,
                    onClick: () => this.createNewFile(provider.rootPath),
                },
                {
                    label: "New Folder...",
                    icon: <NewFolderIcon />,
                    onClick: () => this.createNewFolder(provider.rootPath),
                },
            );
        }
    };

    private getFileMenuItems = (node: TreeProviderNode): MenuItem[] => {
        const { provider } = this.props;
        const items: MenuItem[] = [];

        items.push({
            label: isUrlOrCurl(node.data.href) ? "Copy Href" : "Copy Path",
            icon: <CopyIcon />,
            onClick: () => navigator.clipboard.writeText(node.data.href),
        });

        if (provider.writable) {
            if (provider.rename) {
                items.push({
                    startGroup: true,
                    label: "Rename...",
                    icon: <RenameIcon />,
                    onClick: () => this.renameItem(node),
                });
            }
            if (provider.deleteItem) {
                items.push({
                    label: "Delete",
                    icon: <DeleteIcon />,
                    onClick: () => this.deleteItemAction(node),
                });
            }
        }

        return items;
    };

    private getFolderMenuItems = (node: TreeProviderNode): MenuItem[] => {
        const { provider } = this.props;
        const isRoot = node.data.href === provider.rootPath;
        const items: MenuItem[] = [];

        if (provider.writable && provider.mkdir) {
            items.push(
                {
                    label: "New File...",
                    icon: <NewFileIcon />,
                    onClick: () => this.createNewFile(this.getListPath(node)),
                },
                {
                    label: "New Folder...",
                    icon: <NewFolderIcon />,
                    onClick: () => this.createNewFolder(this.getListPath(node)),
                },
            );
        }

        items.push({
            startGroup: items.length > 0,
            label: isUrlOrCurl(node.data.href) ? "Copy Href" : "Copy Path",
            icon: <CopyIcon />,
            onClick: () => navigator.clipboard.writeText(node.data.href),
        });

        if (provider.writable && !isRoot) {
            if (provider.rename) {
                items.push({
                    startGroup: true,
                    label: "Rename...",
                    icon: <RenameIcon />,
                    onClick: () => this.renameItem(node),
                });
            }
            if (provider.deleteItem) {
                items.push({
                    label: "Delete",
                    icon: <DeleteIcon />,
                    onClick: () => this.deleteItemAction(node),
                });
            }
        }

        return items;
    };

    // ── File operations ──────────────────────────────────────────────────

    private createNewFile = async (dirPath: string) => {
        const { provider } = this.props;
        if (!provider.addItem) return;

        const inputResult = await ui.input("Enter file name:", {
            title: "New File",
            buttons: ["Create", "Cancel"],
        });
        if (inputResult?.button !== "Create" || !inputResult.value.trim()) return;

        const name = inputResult.value.trim();
        const href = provider.resolveLink(
            dirPath ? dirPath + "/" + name : name,
        );

        try {
            await provider.addItem({ href, title: name, category: dirPath, tags: [], isDirectory: false });
        } catch (err) {
            ui.notify(err.message || "Failed to create file.", "warning");
            return;
        }
        await this.buildTree();
    };

    private createNewFolder = async (dirPath: string) => {
        const { provider } = this.props;
        if (!provider.mkdir) return;

        const inputResult = await ui.input("Enter folder name:", {
            title: "New Folder",
            buttons: ["Create", "Cancel"],
        });
        if (inputResult?.button !== "Create" || !inputResult.value.trim()) return;

        const name = inputResult.value.trim();
        const folderPath = dirPath ? dirPath + "/" + name : name;

        try {
            await provider.mkdir(folderPath);
        } catch (err) {
            ui.notify(err.message || "Failed to create folder.", "warning");
            return;
        }
        await this.buildTree();
    };

    private renameItem = async (node: TreeProviderNode) => {
        const { provider } = this.props;
        if (!provider.rename) return;

        const inputResult = await ui.input("Enter new name:", {
            title: `Rename ${node.data.isDirectory ? "Folder" : "File"}`,
            value: node.data.title,
            buttons: ["Rename", "Cancel"],
            selectAll: true,
        });
        if (inputResult?.button !== "Rename" || !inputResult.value.trim()) return;

        const newName = inputResult.value.trim();
        const category = node.data.category;
        const newPath = category ? category + "/" + newName : newName;

        try {
            await provider.rename(
                this.getListPath(node),
                newPath,
            );
        } catch (err) {
            ui.notify(err.message || "Failed to rename.", "warning");
            return;
        }
        await this.buildTree();
    };

    private deleteItemAction = async (node: TreeProviderNode) => {
        const { provider } = this.props;
        if (!provider.deleteItem) return;

        const bt = await ui.confirm(
            `Are you sure you want to delete "${node.data.title}"?`,
            { title: "Delete Confirmation", buttons: ["Delete", "Cancel"] },
        );
        if (bt !== "Delete") return;

        try {
            await provider.deleteItem(node.data.href);
        } catch (err) {
            ui.notify(err.message || "Failed to delete.", "warning");
            return;
        }
        await this.buildTree();
    };

    // ── Drag-drop ────────────────────────────────────────────────────────

    moveItems = async (sourceItems: ILink[], targetNode: TreeProviderNode) => {
        const { provider } = this.props;

        const targetDir = targetNode.data.isDirectory
            ? targetNode
            : findParent(this.state.get().tree, targetNode.data.href);
        if (!targetDir) return;

        const targetPath = this.getListPath(targetDir);

        // Separate directory (category) items from regular link items
        const dirItems = sourceItems.filter(i => i.isDirectory);
        const linkItems = sourceItems.filter(i => !i.isDirectory);
        const dirsHandled = !!(provider.renameCategoryPath && dirItems.length);

        // Move category sub-trees via renameCategoryPath (link providers)
        if (dirsHandled) {
            for (const dir of dirItems) {
                await provider.renameCategoryPath?.(dir.href, targetPath);
            }
        }

        // Items still needing handling: links always, dirs only if not handled above
        const remaining = dirsHandled ? linkItems : sourceItems;

        if (provider.moveToCategory && remaining.length) {
            // Link provider path: moveToCategory (no confirmation needed)
            await provider.moveToCategory(remaining.map(i => i.href), targetPath);
        } else if (provider.rename && remaining.length === 1) {
            // File provider path: rename (with confirmation)
            const source = sourceItems[0];
            const newPath = targetPath
                ? targetPath + "/" + source.title
                : source.title;

            const bt = await ui.confirm(
                `Move "${source.title}" to "${targetDir.data.title}/"?`,
                { title: "Move", buttons: ["Move", "Cancel"] },
            );
            if (bt !== "Move") return;

            try {
                await provider.rename(source.href, newPath);
            } catch (err) {
                ui.notify(err.message || "Failed to move.", "warning");
                return;
            }
        } else {
            return;
        }

        await this.buildTree();
    };

    /** Import dropped file-like items (IFileLink) into the drop target's folder.
     *  Drop on a folder → into it; drop on a file → its parent folder. Confirms before
     *  overwriting same-named files. */
    importFiles = async (items: IFileLink[], dropNode: TreeProviderNode) => {
        const { provider } = this.props;
        if (!provider.importFiles || !items.length) return;

        const targetCategory = dropNode.data.isDirectory
            ? dropNode.data.href
            : (dropNode.data.category || provider.rootPath);

        // Collision check via the provider's existing list(); confirm overwrite.
        // Only meaningful for file-backed providers (those with fs rename) where a
        // same-named file would be overwritten. Catalog providers (link collections)
        // dedupe by href inside importFiles, so skip the title-based overwrite prompt.
        if (provider.rename) {
            const existing = new Set((await provider.list(targetCategory)).map((l) => l.title));
            const clashing = items.filter((i) => existing.has(i.name)).map((i) => i.name);
            if (clashing.length) {
                const bt = await ui.confirm(
                    `${clashing.length} file(s) already exist here and will be overwritten:\n${clashing.join(", ")}`,
                    { title: "Overwrite files?", buttons: ["Overwrite", "Cancel"] },
                );
                if (bt !== "Overwrite") return;
            }
        }

        try {
            await provider.importFiles(items, targetCategory);
        } catch (err) {
            ui.notify(err.message || "Failed to import files.", "warning");
            return;
        }
        await this.buildTree();
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

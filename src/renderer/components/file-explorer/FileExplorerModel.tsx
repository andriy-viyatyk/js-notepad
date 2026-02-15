import { TComponentModel } from "../../core/state/model";
import { MenuItem } from "../overlay/PopupMenu";
import { TreeViewRef } from "../TreeView";
import { FileTreeItem, FileSortType, buildFileTree, loadFolderChildren, filterTreeShallow, filterTreeDeep } from "./file-tree-builder";
import { pagesModel } from "../../store";
import { api } from "../../../ipc/renderer/api";
import { showInputDialog } from "../../features/dialogs/InputDialog";
import { showConfirmationDialog } from "../../features/dialogs/ConfirmationDialog";
import { alertWarning } from "../../features/dialogs/alerts/AlertsBar";
import {
    CopyIcon,
    DeleteIcon,
    FolderOpenIcon,
    NewFileIcon,
    NewFolderIcon,
    NewWindowIcon,
    OpenFileIcon,
    RenameIcon,
} from "../../theme/icons";

const path = require("path");
const fs = require("fs");

export interface FileExplorerSavedState {
    expandedPaths: string[];
    selectedFilePath?: string;
}

export interface FileExplorerProps {
    rootPath: string;
    id: string;
    onFileClick?: (filePath: string) => void;
    onFileDoubleClick?: (filePath: string) => void;
    onFolderDoubleClick?: (filePath: string) => void;
    selectedFilePath?: string;
    enableFileOperations?: boolean;
    getExtraMenuItems?: (filePath: string, isFolder: boolean) => MenuItem[];
    defaultCollapsed?: boolean;
    sortType?: FileSortType;
    searchable?: boolean;
    refreshKey?: string | number;
    showOpenInNewTab?: boolean;
    initialState?: FileExplorerSavedState;
    onStateChange?: (state: FileExplorerSavedState) => void;
}

export const defaultFileExplorerState = {
    tree: null as FileTreeItem | null,
    displayTree: null as FileTreeItem | null,
    searchText: "",
    searchVisible: false,
    treeViewKey: 0,
    error: null as string | null,
};

export type FileExplorerState = typeof defaultFileExplorerState;

export class FileExplorerModel extends TComponentModel<FileExplorerState, FileExplorerProps> {
    treeViewRef: TreeViewRef | null = null;
    savedExpandMap: Record<string, boolean> | null = null;
    initialExpandMap: Record<string, boolean> | undefined = undefined;

    setProps = () => {
        if (this.isFirstUse) {
            if (this.props.initialState?.expandedPaths?.length) {
                const map: Record<string, boolean> = {};
                for (const p of this.props.initialState.expandedPaths) {
                    map[p] = true;
                }
                this.initialExpandMap = map;
            }
            this.buildTree();
            // Lazy-load children for all initially-expanded folders so the
            // restored tree actually shows their content (not just chevron-down).
            if (this.props.initialState?.expandedPaths?.length) {
                this.loadChildrenForExpandedPaths(this.props.initialState.expandedPaths);
            }
            // Build a complete expansion map so every folder has an explicit entry,
            // preventing TreeView's `level < 2` fallback from expanding folders.
            // When restoring saved state, merge collapsed defaults with saved expanded paths.
            const tree = this.state.get().tree;
            if (tree && (this.initialExpandMap || this.props.defaultCollapsed !== false)) {
                const collapsedMap = this.buildAllCollapsedMap(tree);
                this.initialExpandMap = { ...collapsedMap, ...(this.initialExpandMap ?? {}) };
            }
        } else if (this.oldProps?.rootPath !== this.props.rootPath) {
            this.buildTree();
        }
    };

    private buildAllCollapsedMap = (tree: FileTreeItem): Record<string, boolean> => {
        const map: Record<string, boolean> = {};
        const walk = (item: FileTreeItem, isRoot: boolean) => {
            if (item.isFolder) {
                map[item.filePath] = isRoot;
            }
            if (item.items) {
                for (const child of item.items) {
                    walk(child, false);
                }
            }
        };
        walk(tree, true);
        return map;
    };

    setTreeViewRef = (ref: TreeViewRef | null) => {
        this.treeViewRef = ref;
    };

    // --- State persistence ---

    getState = (): FileExplorerSavedState => {
        const expandMap = this.treeViewRef?.getExpandMap() ?? {};
        const expandedPaths = Object.entries(expandMap)
            .filter(([id, expanded]) => expanded && this.isFolderInTree(id))
            .map(([id]) => id);
        return {
            expandedPaths,
            selectedFilePath: this.props.selectedFilePath,
        };
    };

    onExpandChange = (id: string, expanded: boolean) => {
        if (expanded) {
            this.loadChildrenIfNeeded(id);
        }
        this.props.onStateChange?.(this.getState());
    };

    private loadChildrenForExpandedPaths = (expandedPaths: string[]) => {
        let { tree } = this.state.get();
        if (!tree) return;

        // Sort by path length so parents are loaded before their children
        const sorted = [...expandedPaths].sort((a, b) => a.length - b.length);

        let changed = false;
        for (const folderPath of sorted) {
            const node = this.findNode(tree, folderPath);
            if (node && node.isFolder && node.items === undefined) {
                const children = loadFolderChildren(folderPath, this.props.sortType);
                tree = this.updateNodeInTree(tree, folderPath, children);
                changed = true;
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

    private loadChildrenIfNeeded = (folderPath: string) => {
        const { tree } = this.state.get();
        if (!tree) return;

        const node = this.findNode(tree, folderPath);
        if (!node || !node.isFolder || node.items !== undefined) return;

        const children = loadFolderChildren(folderPath, this.props.sortType);
        const newTree = this.updateNodeInTree(tree, folderPath, children);
        const { searchText } = this.state.get();
        const displayTree = this.computeDisplayTree(newTree, searchText);

        this.state.update((s) => {
            s.tree = newTree;
            s.displayTree = displayTree;
        });
    };

    private isFolderInTree = (filePath: string): boolean => {
        const { tree } = this.state.get();
        if (!tree) return false;
        const node = this.findNode(tree, filePath);
        return node?.isFolder ?? false;
    };

    private findNode = (tree: FileTreeItem, filePath: string): FileTreeItem | null => {
        if (tree.filePath === filePath) return tree;
        if (tree.items) {
            for (const child of tree.items) {
                const found = this.findNode(child, filePath);
                if (found) return found;
            }
        }
        return null;
    };

    private updateNodeInTree = (node: FileTreeItem, folderPath: string, children: FileTreeItem[]): FileTreeItem => {
        if (node.filePath === folderPath) {
            return { ...node, items: children };
        }
        if (node.items) {
            return {
                ...node,
                items: node.items.map(child => this.updateNodeInTree(child, folderPath, children)),
            };
        }
        return node;
    };

    buildTree = () => {
        const { rootPath, sortType } = this.props;
        if (!rootPath) {
            this.state.update((s) => {
                s.tree = null;
                s.displayTree = null;
                s.error = null;
            });
            return;
        }

        // Capture currently-expanded paths before rebuilding (for refresh scenario)
        const expandMap = this.treeViewRef?.getExpandMap() ?? {};
        const expandedPaths = Object.entries(expandMap)
            .filter(([, expanded]) => expanded)
            .map(([id]) => id);

        try {
            const tree = buildFileTree(rootPath, sortType);
            const { searchText } = this.state.get();
            const displayTree = this.computeDisplayTree(tree, searchText);

            this.state.update((s) => {
                s.tree = tree;
                s.displayTree = displayTree;
                s.error = null;
            });

            // Reload children for folders that were expanded before the rebuild
            if (expandedPaths.length) {
                this.loadChildrenForExpandedPaths(expandedPaths);
            }
        } catch (err: any) {
            this.state.update((s) => {
                s.tree = null;
                s.displayTree = null;
                s.error = err.message || "Failed to read directory";
            });
        }
    };

    // --- Search ---

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
            s.displayTree = s.tree;
            if (wasDeep) {
                s.treeViewKey++;
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
                // Entering deep search — save expansion state
                this.savedExpandMap = this.treeViewRef?.getExpandMap() ?? {};
                this.initialExpandMap = undefined;
            } else {
                // Leaving deep search — restore expansion state
                this.initialExpandMap = this.savedExpandMap ?? undefined;
                this.savedExpandMap = null;
            }
        }

        const displayTree = this.computeDisplayTree(tree, text);

        this.state.update((s) => {
            s.searchText = text;
            s.displayTree = displayTree;
            s.treeViewKey += keyDelta;
        });
    };

    private computeDisplayTree = (
        tree: FileTreeItem | null,
        searchText: string,
    ): FileTreeItem | null => {
        if (!tree || !searchText) return tree;

        const words = searchText.toLowerCase().split(" ").filter((s) => s);
        if (words.length === 0) return tree;

        if (searchText.length >= 3) {
            return filterTreeDeep(tree, words);
        } else {
            const expandedPaths = this.getExpandedPaths();
            return filterTreeShallow(tree, words, expandedPaths);
        }
    };

    private getExpandedPaths = (): Set<string> => {
        const map = this.treeViewRef?.getExpandMap() ?? {};
        return new Set(
            Object.entries(map)
                .filter(([, expanded]) => expanded)
                .map(([id]) => id),
        );
    };

    // --- Click handlers ---

    onItemClick = (item: FileTreeItem) => {
        if (item.isFolder) {
            this.treeViewRef?.toggleItem(item.filePath);
        } else {
            this.props.onFileClick?.(item.filePath);
        }
    };

    onItemDoubleClick = (item: FileTreeItem) => {
        if (item.isFolder) {
            this.props.onFolderDoubleClick?.(item.filePath);
        } else {
            this.props.onFileDoubleClick?.(item.filePath);
        }
    };

    // --- Context menus ---

    onItemContextMenu = (item: FileTreeItem, e: React.MouseEvent) => {
        if (!e.nativeEvent.menuItems) {
            e.nativeEvent.menuItems = [];
        }

        const menuItems: MenuItem[] = item.isFolder
            ? this.getFolderMenuItems(item)
            : this.getFileMenuItems(item);

        const extraItems = this.props.getExtraMenuItems?.(item.filePath, item.isFolder);
        if (extraItems?.length) {
            menuItems.push(...extraItems);
        }

        e.nativeEvent.menuItems.push(...menuItems);
    };

    onBackgroundContextMenu = (e: React.MouseEvent) => {
        if (!this.props.enableFileOperations) return;
        if (!e.nativeEvent.menuItems) {
            e.nativeEvent.menuItems = [];
        }
        e.nativeEvent.menuItems.push(
            {
                label: "New File...",
                icon: <NewFileIcon />,
                onClick: () => this.createNewFile(this.props.rootPath),
            },
            {
                label: "New Folder...",
                icon: <NewFolderIcon />,
                onClick: () => this.createNewFolder(this.props.rootPath),
            },
        );
    };

    private getFileMenuItems = (item: FileTreeItem): MenuItem[] => {
        const openAction = this.props.onFileClick ?? this.props.onFileDoubleClick;
        const items: MenuItem[] = [
            {
                label: "Open",
                icon: <OpenFileIcon />,
                onClick: () => openAction?.(item.filePath),
            },
        ];

        if (this.props.showOpenInNewTab !== false) {
            items.push({
                label: "Open in New Tab",
                icon: <OpenFileIcon />,
                onClick: () => pagesModel.openFile(item.filePath),
            });
        }

        items.push(
            {
                label: "Open in New Window",
                icon: <NewWindowIcon />,
                onClick: () => pagesModel.openPathInNewWindow(item.filePath),
            },
            {
                startGroup: true,
                label: "Copy File Path",
                icon: <CopyIcon />,
                onClick: () => navigator.clipboard.writeText(item.filePath),
            },
            {
                label: "Show in File Explorer",
                icon: <FolderOpenIcon />,
                onClick: () => api.showItemInFolder(item.filePath),
            },
        );

        if (this.props.enableFileOperations) {
            items.push(
                {
                    startGroup: true,
                    label: "Rename...",
                    icon: <RenameIcon />,
                    onClick: () => this.renameItem(item),
                },
                {
                    label: "Delete",
                    icon: <DeleteIcon />,
                    onClick: () => this.deleteItem(item),
                },
            );
        }

        return items;
    };

    private getFolderMenuItems = (item: FileTreeItem): MenuItem[] => {
        const items: MenuItem[] = [];

        if (this.props.enableFileOperations) {
            items.push(
                {
                    label: "New File...",
                    icon: <NewFileIcon />,
                    onClick: () => this.createNewFile(item.filePath),
                },
                {
                    label: "New Folder...",
                    icon: <NewFolderIcon />,
                    onClick: () => this.createNewFolder(item.filePath),
                },
            );
        }

        items.push(
            {
                startGroup: items.length > 0,
                label: "Copy Folder Path",
                icon: <CopyIcon />,
                onClick: () => navigator.clipboard.writeText(item.filePath),
            },
            {
                label: "Show in File Explorer",
                icon: <FolderOpenIcon />,
                onClick: () => api.showFolder(item.filePath),
            },
        );

        if (this.props.enableFileOperations && item.filePath !== this.props.rootPath) {
            items.push(
                {
                    startGroup: true,
                    label: "Rename...",
                    icon: <RenameIcon />,
                    onClick: () => this.renameItem(item),
                },
                {
                    label: "Delete",
                    icon: <DeleteIcon />,
                    onClick: () => this.deleteItem(item),
                },
            );
        }

        return items;
    };

    // --- File operations ---

    private createNewFile = async (dirPath: string) => {
        const inputResult = await showInputDialog({
            title: "New File",
            message: "Enter file name:",
            buttons: ["Create", "Cancel"],
        });
        if (inputResult?.button === "Create" && inputResult.value.trim()) {
            const newPath = path.join(dirPath, inputResult.value.trim());
            if (fs.existsSync(newPath)) {
                alertWarning("A file or folder with that name already exists.");
                return;
            }
            try {
                fs.writeFileSync(newPath, "");
            } catch (err: any) {
                alertWarning(err.message || "Failed to create file.");
                return;
            }
            this.buildTree();
        }
    };

    private createNewFolder = async (dirPath: string) => {
        const inputResult = await showInputDialog({
            title: "New Folder",
            message: "Enter folder name:",
            buttons: ["Create", "Cancel"],
        });
        if (inputResult?.button === "Create" && inputResult.value.trim()) {
            const newPath = path.join(dirPath, inputResult.value.trim());
            if (fs.existsSync(newPath)) {
                alertWarning("A file or folder with that name already exists.");
                return;
            }
            try {
                fs.mkdirSync(newPath);
            } catch (err: any) {
                alertWarning(err.message || "Failed to create folder.");
                return;
            }
            this.buildTree();
        }
    };

    private renameItem = async (item: FileTreeItem) => {
        const inputResult = await showInputDialog({
            title: `Rename ${item.isFolder ? "Folder" : "File"}`,
            message: "Enter new name:",
            value: item.label,
            buttons: ["Rename", "Cancel"],
            selectAll: true,
        });
        if (inputResult?.button === "Rename" && inputResult.value.trim()) {
            const newPath = path.join(path.dirname(item.filePath), inputResult.value.trim());
            if (fs.existsSync(newPath)) {
                alertWarning("A file or folder with that name already exists.");
                return;
            }
            try {
                fs.renameSync(item.filePath, newPath);
            } catch (err: any) {
                alertWarning(err.message || `Failed to rename ${item.isFolder ? "folder" : "file"}.`);
                return;
            }
            this.buildTree();
        }
    };

    private deleteItem = async (item: FileTreeItem) => {
        const bt = await showConfirmationDialog({
            title: "Delete Confirmation",
            message: `Are you sure you want to delete "${item.label}" ${item.isFolder ? "folder" : "file"}?`,
            buttons: ["Delete", "Cancel"],
        });
        if (bt !== "Delete") return;

        try {
            if (item.isFolder) {
                fs.rmdirSync(item.filePath, { recursive: true });
            } else {
                fs.unlinkSync(item.filePath);
            }
        } catch (err: any) {
            alertWarning(err.message || "Failed to delete file or folder.");
            return;
        }
        this.buildTree();
    };
}

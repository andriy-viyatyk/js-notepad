import { TreeItem } from "../TreeView";

const path = require("path");
const fs = require("fs");

export interface FileTreeItem extends TreeItem<FileTreeItem> {
    label: string;
    filePath: string;
    isFolder: boolean;
    extension?: string;
    items?: FileTreeItem[];
}

export type FileSortType = "type" | "name";

/** Folders/files to always ignore */
const DEFAULT_IGNORE = new Set([
    ".git",
    "node_modules",
    ".DS_Store",
    "Thumbs.db",
    "desktop.ini",
]);

/**
 * Build a file tree from the filesystem.
 * Returns a root FileTreeItem with children, suitable for TreeView.
 */
export function buildFileTree(
    rootPath: string,
    sortType: FileSortType = "type",
    maxDepth = 1,
): FileTreeItem {
    const rootLabel = path.basename(rootPath);
    const root: FileTreeItem = {
        label: rootLabel,
        filePath: rootPath,
        isFolder: true,
        items: [],
    };

    root.items = readDirectoryItems(rootPath, sortType, maxDepth, 0);
    return root;
}

/**
 * Load direct children of a folder (1 level deep).
 * Used for lazy loading — folders in the result will have items: undefined (not yet loaded).
 */
export function loadFolderChildren(
    folderPath: string,
    sortType: FileSortType = "type",
): FileTreeItem[] {
    return readDirectoryItems(folderPath, sortType, 1, 0);
}

/**
 * Shallow filter: remove non-matching files from expanded folders only.
 * Collapsed folders are kept as-is. All folders are preserved (never removed)
 * to maintain tree structure stability.
 */
export function filterTreeShallow(
    root: FileTreeItem,
    searchWords: string[],
    expandedPaths: Set<string>,
): FileTreeItem {
    return {
        ...root,
        items: filterChildrenShallow(root.items, searchWords, expandedPaths),
    };
}

function filterChildrenShallow(
    items: FileTreeItem[] | undefined,
    searchWords: string[],
    expandedPaths: Set<string>,
): FileTreeItem[] {
    if (!items) return [];

    const result: FileTreeItem[] = [];
    for (const item of items) {
        if (item.isFolder) {
            if (expandedPaths.has(item.filePath)) {
                result.push({
                    ...item,
                    items: filterChildrenShallow(item.items, searchWords, expandedPaths),
                });
            } else {
                result.push(item);
            }
        } else {
            const labelLower = item.label.toLowerCase();
            if (searchWords.every(w => labelLower.includes(w))) {
                result.push(item);
            }
        }
    }
    return result;
}

/**
 * Deep filter: search all files across entire tree.
 * Returns only matching files and their ancestor folders.
 * Empty folders with no matching descendants are removed.
 */
export function filterTreeDeep(
    root: FileTreeItem,
    searchWords: string[],
): FileTreeItem {
    return {
        ...root,
        items: filterChildrenDeep(root.items, searchWords),
    };
}

function filterChildrenDeep(
    items: FileTreeItem[] | undefined,
    searchWords: string[],
): FileTreeItem[] {
    if (!items) return [];

    const result: FileTreeItem[] = [];
    for (const item of items) {
        if (item.isFolder) {
            const filteredChildren = filterChildrenDeep(item.items, searchWords);
            if (filteredChildren.length > 0) {
                result.push({ ...item, items: filteredChildren });
            }
        } else {
            const labelLower = item.label.toLowerCase();
            if (searchWords.every(w => labelLower.includes(w))) {
                result.push(item);
            }
        }
    }
    return result;
}

function readDirectoryItems(
    dirPath: string,
    sortType: FileSortType,
    maxDepth: number,
    currentDepth: number,
): FileTreeItem[] {
    if (currentDepth >= maxDepth) {
        return [];
    }

    let entries: string[];
    try {
        entries = fs.readdirSync(dirPath);
    } catch {
        return [];
    }

    const folders: FileTreeItem[] = [];
    const files: FileTreeItem[] = [];

    for (const entry of entries) {
        if (DEFAULT_IGNORE.has(entry)) continue;

        const fullPath = path.join(dirPath, entry);
        let isFolder: boolean;
        try {
            const stats = fs.statSync(fullPath);
            isFolder = stats.isDirectory();
        } catch {
            continue;
        }

        if (isFolder) {
            const atDepthLimit = currentDepth + 1 >= maxDepth;
            const children = atDepthLimit
                ? undefined
                : readDirectoryItems(fullPath, sortType, maxDepth, currentDepth + 1);
            folders.push({
                label: entry,
                filePath: fullPath,
                isFolder: true,
                items: children,
            });
        } else {
            const ext = path.extname(entry).toLowerCase();
            files.push({
                label: entry,
                filePath: fullPath,
                isFolder: false,
                extension: ext || undefined,
            });
        }
    }

    // Folders always first, sorted alphabetically by name
    folders.sort((a, b) => a.label.localeCompare(b.label));

    // Files sorted based on sortType
    if (sortType === "type") {
        files.sort((a, b) => {
            const extA = a.extension ?? "";
            const extB = b.extension ?? "";
            const extCmp = extA.localeCompare(extB);
            if (extCmp !== 0) return extCmp;
            return a.label.localeCompare(b.label);
        });
    } else {
        files.sort((a, b) => a.label.localeCompare(b.label));
    }

    return [...folders, ...files];
}

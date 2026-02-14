import { TreeItem } from "../../components/TreeView/TreeView.model";
import { isLocalLink, resolveRelativePath } from "./path-utils";

const path = require("path");
const fs = require("fs");

export interface NavTreeItem extends TreeItem<NavTreeItem> {
    label: string;
    filePath: string;
    exists: boolean;
    isFolder?: boolean;
    items?: NavTreeItem[];
}

interface MarkdownLink {
    text: string;
    href: string;
}

/**
 * Extracts markdown links from content.
 * Matches [text](href) patterns, excluding images (![...]).
 */
export function extractMarkdownLinks(content: string): MarkdownLink[] {
    const links: MarkdownLink[] = [];
    const regex = /(?<!!)\[([^\]]*)\]\(([^)]+)\)/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
        const text = match[1];
        const href = match[2];
        if (isLocalLink(href)) {
            links.push({ text, href });
        }
    }

    return links;
}

/**
 * Builds a navigation tree from a root markdown file.
 * Recursively collects all linked files, then organizes them
 * into a folder/file tree structure based on file paths.
 */
export function buildNavTree(rootFilePath: string): NavTreeItem {
    const rootAbsolute = path.resolve(rootFilePath);
    const rootDir = path.dirname(rootAbsolute);

    // Collect all linked files recursively
    const linkedFiles = collectLinkedFiles(rootAbsolute);

    // Build root node
    const root: NavTreeItem = {
        label: path.basename(rootFilePath),
        filePath: rootAbsolute,
        exists: isFile(rootAbsolute),
    };

    if (linkedFiles.length === 0) return root;

    // Build folder/file tree from collected paths
    root.items = buildFolderItems(rootDir, linkedFiles);

    return root;
}

interface LinkedFile {
    absolutePath: string;
    exists: boolean;
}

/**
 * Recursively follows markdown links starting from the root file
 * and collects all unique linked file paths.
 */
function collectLinkedFiles(rootFilePath: string): LinkedFile[] {
    const visited = new Set<string>();
    const files: LinkedFile[] = [];
    const seen = new Set<string>();

    // Mark root as visited so it's not included in children
    const rootNormalized = path.resolve(rootFilePath).toLowerCase();
    visited.add(rootNormalized);
    seen.add(rootNormalized);

    collectFromFile(rootFilePath, visited, files, seen);
    return files;
}

function collectFromFile(
    filePath: string,
    visited: Set<string>,
    files: LinkedFile[],
    seen: Set<string>,
) {
    const resolvedPath = path.resolve(filePath);
    if (!isFile(resolvedPath)) return;

    const ext = path.extname(filePath).toLowerCase();
    if (ext !== ".md") return;

    try {
        const content = fs.readFileSync(resolvedPath, "utf-8");
        const links = extractMarkdownLinks(content);

        for (const link of links) {
            const childPath = resolveRelativePath(filePath, link.href);
            const childAbsolute = path.resolve(childPath);
            const childNormalized = childAbsolute.toLowerCase();

            if (!seen.has(childNormalized)) {
                seen.add(childNormalized);
                files.push({
                    absolutePath: childAbsolute,
                    exists: isFile(childAbsolute),
                });
            }

            // Recurse into .md files
            if (!visited.has(childNormalized)) {
                visited.add(childNormalized);
                collectFromFile(childAbsolute, visited, files, seen);
            }
        }
    } catch {
        // If reading fails, skip this file
    }
}

/**
 * Groups linked files into a folder/file tree relative to baseDir.
 * Folders are sorted alphabetically first, then files alphabetically.
 */
function buildFolderItems(baseDir: string, files: LinkedFile[]): NavTreeItem[] {
    const directFiles: NavTreeItem[] = [];
    const folderMap = new Map<string, LinkedFile[]>();

    for (const file of files) {
        const relative = path.relative(baseDir, file.absolutePath);
        const parts: string[] = relative.split(path.sep);

        // Files outside baseDir (../ paths) go at root level
        if (parts.length === 1 || parts[0] === "..") {
            directFiles.push({
                label: path.basename(file.absolutePath),
                filePath: file.absolutePath,
                exists: file.exists,
            });
        } else {
            const folderName = parts[0];
            if (!folderMap.has(folderName)) {
                folderMap.set(folderName, []);
            }
            folderMap.get(folderName)!.push(file);
        }
    }

    // Build folder nodes
    const folderNodes: NavTreeItem[] = [];
    for (const [folderName, folderFiles] of folderMap) {
        const folderPath = path.join(baseDir, folderName);
        const folderNode: NavTreeItem = {
            label: folderName,
            filePath: folderPath,
            exists: true,
            isFolder: true,
            items: buildFolderItems(folderPath, folderFiles),
        };
        folderNodes.push(folderNode);
    }

    folderNodes.sort((a, b) => a.label.localeCompare(b.label));
    directFiles.sort((a, b) => a.label.localeCompare(b.label));

    return [...folderNodes, ...directFiles];
}

function isFile(filePath: string): boolean {
    try {
        return fs.statSync(filePath).isFile();
    } catch {
        return false;
    }
}

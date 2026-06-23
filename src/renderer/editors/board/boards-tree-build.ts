/**
 * Pure builder for the boards tree (EPIC-036 / US-759). Turns a finite set of board-root
 * paths into a nested tree of containing folders down to each board, with VSCode-style
 * single-child folder compaction. No React, no filesystem walk — the input is the known
 * trusted-board list, so the whole tree is built in memory and rendered fully expanded.
 *
 * Two modes share one builder:
 *  - **single-root** (`baseRoot` set): each board's path is relativized to `baseRoot`, which
 *    becomes the tree's top. Used by the Explorer-sibling panel + the in-board toolbar popover.
 *  - **multi-root** (no `baseRoot`): each board's absolute path is split into segments, so the
 *    tree is a forest grouped by containing folder. Used by the global Tools & Editors tab.
 *
 * The companion `BoardsTree` component renders these nodes via the UIKit `Tree`. A
 * `BoardTreeNode` is structurally an `ITreeItem` (value/label/items), so the Tree consumes it
 * directly without a trait; the extra `kind`/`root` fields drive the component's renderItem +
 * callbacks.
 */
import { fpBasename, fpRelative, fpSep } from "../../core/utils/file-path";

export interface BoardTreeNode {
    /** Globally-unique row id. Folder → "dir:<normalized path>"; board → "board:<absolute root>".
     *  The prefixes namespace the two kinds so a folder path can never collide with a board root
     *  (defensive — US-766 already forbids a board nested inside another trusted board). */
    value: string;
    /** Display label — a path segment, a compacted joined-path, or the board folder name. */
    label: string;
    /** Discriminant the renderer + callbacks branch on. */
    kind: "folder" | "board";
    /** Absolute board root — set only when `kind === "board"`. */
    root?: string;
    /** Children. Absent on a board leaf (→ no chevron). */
    items?: BoardTreeNode[];
}

/** Case-fold a single path segment for keying (Windows is case-insensitive). Segments never
 *  contain separators, so a full path normalization (which would resolve against the cwd) is
 *  both unnecessary and wrong here. */
function normSeg(seg: string): string {
    return process.platform === "win32" ? seg.toLowerCase() : seg;
}

/** Split a board root into its display segments for the chosen mode. */
function boardSegments(root: string, baseRoot?: string): string[] {
    if (baseRoot) {
        const rel = fpRelative(baseRoot, root);
        // Board IS the base, or escapes it (defensive — the panel pre-filters to roots under the
        // base): render it as a single top-level board leaf rather than crashing/over-nesting.
        if (!rel || rel === "." || rel.startsWith("..")) return [fpBasename(root)];
        return rel.split(/[\\/]/).filter(Boolean);
    }
    return root.split(/[\\/]/).filter(Boolean);
}

interface BuildNode {
    /** Original-case segment (display). */
    label: string;
    /** Accumulated normalized path from the top — the folder node's stable identity. */
    pathKey: string;
    /** Children keyed by normalized segment. */
    children: Map<string, BuildNode>;
    /** Board root when this node is a board leaf. */
    board?: string;
}

/** Folders first, then boards; each group alphabetical by label. */
function sortNodes(nodes: BoardTreeNode[]): void {
    nodes.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
        return a.label.localeCompare(b.label);
    });
}

/** Convert a build node to a render node, applying single-child folder compaction. */
function convert(node: BuildNode): BoardTreeNode {
    if (node.board) {
        return { value: "board:" + node.board, label: node.label, kind: "board", root: node.board };
    }
    // Compact a chain of single-child folders into one joined-path node (`personal\boards`).
    // Stop before a board leaf — a board never merges into its containing folder.
    let label = node.label;
    let cur = node;
    while (cur.children.size === 1) {
        const child = cur.children.values().next().value as BuildNode;
        if (child.board) break;
        label += fpSep + child.label;
        cur = child;
    }
    const items = [...cur.children.values()].map(convert);
    sortNodes(items);
    // Identity = the DEEPEST merged folder's key, so the node id stays stable across rebuilds.
    return { value: "dir:" + cur.pathKey, label, kind: "folder", items };
}

/**
 * Build the boards tree from a list of absolute board-root paths.
 * @param boards Absolute board-root paths (e.g. the trusted-boards registry).
 * @param baseRoot Single-root mode: relativize paths to this base. Omit for multi-root (forest).
 */
export function buildBoardsTree(boards: string[], baseRoot?: string): BoardTreeNode[] {
    const rootChildren = new Map<string, BuildNode>();

    for (const root of boards) {
        const segs = boardSegments(root, baseRoot);
        if (segs.length === 0) continue;
        let level = rootChildren;
        let accKey = "";
        for (let i = 0; i < segs.length; i++) {
            const seg = segs[i];
            const k = normSeg(seg);
            accKey = accKey ? accKey + "/" + k : k;
            let n = level.get(k);
            if (!n) {
                n = { label: seg, pathKey: accKey, children: new Map() };
                level.set(k, n);
            }
            if (i === segs.length - 1) n.board = root;
            level = n.children;
        }
    }

    const top = [...rootChildren.values()].map(convert);
    sortNodes(top);
    return top;
}

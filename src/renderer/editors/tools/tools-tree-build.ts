/**
 * Pure builder for the registered-tools tree (EPIC-038 / US-805). Turns a finite set of
 * toolset-root paths into a nested tree of containing folders down to each toolset, with
 * VSCode-style single-child folder compaction. No React, no filesystem walk — the input is the
 * known registered-toolset list, so the whole tree is built in memory and rendered fully expanded.
 *
 * A near-copy of `boards-tree-build.ts` (US-759), kept separate so the boards code stays
 * untouched. The one behavioral difference: a toolset leaf's label is the toolset's authoritative
 * `name` (from its manifest), NOT the folder basename — so a toolset is identified by `root` and
 * displayed by `name`. The builder therefore takes `{ root, name }[]`, not `string[]`.
 *
 * Two modes share one builder:
 *  - **single-root** (`baseRoot` set): each toolset's path is relativized to `baseRoot`, which
 *    becomes the tree's top. Used by the Explorer-sibling panel (Tools mode).
 *  - **multi-root** (no `baseRoot`): each absolute path is split into segments, so the tree is a
 *    forest grouped by containing folder. Used by the global "Tools & Editors" Tools segment.
 */
import { fpRelative, fpSep } from "../../core/utils/file-path";

/** A registered toolset for the tree: its folder path + authoritative display name. */
export interface ToolsetTreeInput {
    root: string;
    name: string;
}

export interface ToolTreeNode {
    /** Globally-unique row id. Folder → "dir:<normalized path>"; toolset → "toolset:<absolute root>". */
    value: string;
    /** Display label — a path segment, a compacted joined-path, or the toolset name. */
    label: string;
    /** Discriminant the renderer + callbacks branch on. */
    kind: "folder" | "toolset";
    /** Absolute toolset root — set only when `kind === "toolset"`. */
    root?: string;
    /** Children. Absent on a toolset leaf (→ no chevron). */
    items?: ToolTreeNode[];
}

/** Case-fold a single path segment for keying (Windows is case-insensitive). */
function normSeg(seg: string): string {
    return process.platform === "win32" ? seg.toLowerCase() : seg;
}

/** Split a toolset root into its folder segments for the chosen mode. The toolset's own
 *  display name replaces the final (folder-basename) segment, since the manifest name is
 *  authoritative. */
function toolsetSegments(root: string, name: string, baseRoot?: string): string[] {
    if (baseRoot) {
        const rel = fpRelative(baseRoot, root);
        // Toolset IS the base, or escapes it (defensive — the panel pre-filters to roots under
        // the base): render it as a single top-level toolset leaf.
        if (!rel || rel === "." || rel.startsWith("..")) return [name];
        const segs = rel.split(/[\\/]/).filter(Boolean);
        if (segs.length > 0) segs[segs.length - 1] = name; // display name, not folder basename
        return segs;
    }
    const segs = root.split(/[\\/]/).filter(Boolean);
    if (segs.length > 0) segs[segs.length - 1] = name;
    return segs;
}

interface BuildNode {
    label: string;
    pathKey: string;
    children: Map<string, BuildNode>;
    /** Toolset root when this node is a toolset leaf. */
    toolset?: string;
}

/** Folders first, then toolsets; each group alphabetical by label. */
function sortNodes(nodes: ToolTreeNode[]): void {
    nodes.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
        return a.label.localeCompare(b.label);
    });
}

/** Convert a build node to a render node, applying single-child folder compaction. */
function convert(node: BuildNode): ToolTreeNode {
    if (node.toolset) {
        return { value: "toolset:" + node.toolset, label: node.label, kind: "toolset", root: node.toolset };
    }
    let label = node.label;
    let cur = node;
    while (cur.children.size === 1) {
        const child = cur.children.values().next().value as BuildNode;
        if (child.toolset) break;
        label += fpSep + child.label;
        cur = child;
    }
    const items = [...cur.children.values()].map(convert);
    sortNodes(items);
    return { value: "dir:" + cur.pathKey, label, kind: "folder", items };
}

/**
 * Build the tools tree from a list of registered toolsets.
 * @param toolsets Registered toolsets (`{ root, name }`).
 * @param baseRoot Single-root mode: relativize paths to this base. Omit for multi-root (forest).
 */
export function buildToolsTree(toolsets: ToolsetTreeInput[], baseRoot?: string): ToolTreeNode[] {
    const rootChildren = new Map<string, BuildNode>();

    for (const { root, name } of toolsets) {
        // Key the tree by the folder path (segments), but display the final node with `name`.
        const segs = toolsetSegments(root, name, baseRoot);
        if (segs.length === 0) continue;
        // Normalized path segments for keying come from the folder path, not the display name.
        const keySegs = baseRoot
            ? (() => {
                  const rel = fpRelative(baseRoot, root);
                  if (!rel || rel === "." || rel.startsWith("..")) return [root];
                  return rel.split(/[\\/]/).filter(Boolean);
              })()
            : root.split(/[\\/]/).filter(Boolean);

        let level = rootChildren;
        let accKey = "";
        for (let i = 0; i < segs.length; i++) {
            const label = segs[i];
            const keySeg = keySegs[i] ?? label;
            const k = normSeg(keySeg);
            accKey = accKey ? accKey + "/" + k : k;
            let n = level.get(k);
            if (!n) {
                n = { label, pathKey: accKey, children: new Map() };
                level.set(k, n);
            }
            if (i === segs.length - 1) n.toolset = root;
            level = n.children;
        }
    }

    const top = [...rootChildren.values()].map(convert);
    sortNodes(top);
    return top;
}

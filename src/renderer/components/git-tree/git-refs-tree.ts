/**
 * Pure builder that turns a flat `GitRefs` DTO into the "Branches & Tags" panel
 * tree (EPIC-031 / US-634): three fixed roots — Branches, Remotes, Tags.
 *
 * - **Branches**: local branches with `/`-folder nesting (`feature/x` → folder
 *   `feature` containing leaf `x`).
 * - **Remotes**: one node per configured remote name; that remote's branches
 *   nest beneath it with the same `/`-folding (prefix stripped).
 * - **Tags**: a flat list (no `/`-folding).
 *
 * All three roots are always present (even when empty) and are ordinary
 * expandable nodes (not section headers) so the user can collapse/expand them.
 * Side-effect-free: the builder emits plain-string labels and no icons — the view
 * (`decorateNodes`) attaches icons and may replace a label with a styled node. The
 * only React-backed values are the explicit `SlotText`/`IconRef` arms on
 * `GitRefNode.label`/`icon`; the builder itself creates no React elements.
 */
import type { IconRef } from "../../uikit/shared/slots";
import type { GitRefs } from "../../../ipc/git-ipc";

/** Selectable ref-leaf kind (set on leaves only; folders/roots carry none). */
export type GitRefNodeKind = "branch" | "remote-branch" | "tag";

export interface GitRefNode {
    /** Unique value across the whole tree (prefixed by node role). */
    value: string;
    /** Display label — the path segment / leaf name / root title. The builder
     *  always emits a plain string; the view may replace it with a styled node
     *  (e.g. the head-green current-branch label). */
    label: string | Node;
    /** Leaf kind (branch / remote-branch / tag). Absent on roots + folders. */
    kind?: GitRefNodeKind;
    /** Full ref name for leaves (e.g. "feature/x", "origin/feature/x", "v1.0.0"). */
    refName?: string;
    /** Leading icon — attached by the view (kept undefined by the builder). */
    icon?: IconRef;
    /** Child nodes. Absent/empty → leaf (no chevron). */
    items?: GitRefNode[];
}

/** Stable value of the Branches root — also the default-expanded key. */
export const BRANCHES_ROOT_VALUE = "sec:branches";
export const REMOTES_ROOT_VALUE = "sec:remotes";
export const TAGS_ROOT_VALUE = "sec:tags";

interface Entry {
    /** Remaining path segments at the current depth. */
    segments: string[];
    /** Full ref name carried down to the leaf. */
    refName: string;
    /**
     * Original position in the (historically-ordered) input list — index 0 is
     * the most recent ref. Used to order nodes in historical mode: a folder
     * inherits the smallest index among its descendants (its most-recent branch).
     */
    index: number;
}

/** A built node paired with its sort keys (stripped before returning). */
interface Ranked {
    node: GitRefNode;
    /** Historical order key — smaller = more recent. */
    order: number;
    /** Alphabetical order key. */
    label: string;
}

/**
 * Recursively fold `/`-separated ref names into nested folder + leaf nodes.
 *
 * - **alphabetical**: folders first, then leaves; both sorted by label.
 * - **historical**: folders and leaves interleaved, most-recent first (a folder
 *   sorts by its most-recent member).
 */
function foldRefs(
    entries: Entry[],
    kind: GitRefNodeKind,
    leafPrefix: string,
    dirPrefix: string,
    pathSoFar: string[],
    alphabetical: boolean,
): GitRefNode[] {
    const leaves: Ranked[] = [];
    const groups = new Map<string, Entry[]>();

    for (const e of entries) {
        if (e.segments.length <= 1) {
            const label = e.segments[0] ?? e.refName;
            leaves.push({
                node: { value: leafPrefix + e.refName, label, kind, refName: e.refName },
                order: e.index,
                label,
            });
        } else {
            const [head, ...rest] = e.segments;
            const arr = groups.get(head) ?? [];
            arr.push({ segments: rest, refName: e.refName, index: e.index });
            groups.set(head, arr);
        }
    }

    const folders: Ranked[] = [];
    for (const [head, sub] of groups) {
        const folderPath = [...pathSoFar, head];
        const order = sub.reduce((min, e) => Math.min(min, e.index), Number.POSITIVE_INFINITY);
        folders.push({
            node: {
                value: dirPrefix + folderPath.join("/"),
                label: head,
                items: foldRefs(sub, kind, leafPrefix, dirPrefix, folderPath, alphabetical),
            },
            order,
            label: head,
        });
    }

    if (alphabetical) {
        folders.sort((a, b) => a.label.localeCompare(b.label));
        leaves.sort((a, b) => a.label.localeCompare(b.label));
        return [...folders, ...leaves].map((r) => r.node);
    }
    return [...folders, ...leaves].sort((a, b) => a.order - b.order).map((r) => r.node);
}

/**
 * @param alphabetical When true, refs sort by name. When false (default), the
 *   builder preserves the historical (most-recent-first) order of the input
 *   arrays as produced by the git service.
 */
export function buildRefsTree(refs: GitRefs, alphabetical = false): GitRefNode[] {
    // ── Branches ──────────────────────────────────────────────────────
    const branchEntries: Entry[] = refs.localBranches.map((b, index) => ({
        segments: b.split("/"),
        refName: b,
        index,
    }));
    const branchesRoot: GitRefNode = {
        value: BRANCHES_ROOT_VALUE,
        label: "Branches",
        items: foldRefs(branchEntries, "branch", "local:", "localdir:", [], alphabetical),
    };

    // ── Remotes (one node per remote name; branches nested per remote) ──
    // Remote names are containers without a meaningful date, so they always sort
    // alphabetically; only the branches inside follow the historical/alpha flag.
    const remoteNodes: GitRefNode[] = [...refs.remotes]
        .sort((a, b) => a.localeCompare(b))
        .map((name) => {
            const prefix = name + "/";
            const entries: Entry[] = refs.remoteBranches
                .filter((rb) => rb.startsWith(prefix))
                .map((rb, index) => ({
                    segments: rb.slice(prefix.length).split("/"),
                    refName: rb,
                    index,
                }));
            return {
                value: "remote:" + name,
                label: name,
                items: foldRefs(entries, "remote-branch", "remotebranch:", `remotedir:${name}/`, [], alphabetical),
            };
        });
    const remotesRoot: GitRefNode = {
        value: REMOTES_ROOT_VALUE,
        label: "Remotes",
        items: remoteNodes,
    };

    // ── Tags (flat) ───────────────────────────────────────────────────
    const tagSource = alphabetical ? [...refs.tags].sort((a, b) => a.localeCompare(b)) : refs.tags;
    const tagNodes: GitRefNode[] = tagSource.map((t) => ({
        value: "tag:" + t,
        label: t,
        kind: "tag" as const,
        refName: t,
    }));
    const tagsRoot: GitRefNode = {
        value: TAGS_ROOT_VALUE,
        label: "Tags",
        items: tagNodes,
    };

    return [branchesRoot, remotesRoot, tagsRoot];
}

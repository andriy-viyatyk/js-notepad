/**
 * Commit-graph swimlane layout (EPIC-030 / US-611).
 *
 * Ported from VS Code's `toISCMHistoryItemViewModelArray`
 * (src/vs/workbench/contrib/scm/browser/scmHistory.ts).
 * Copyright (c) Microsoft Corporation. Licensed under MIT.
 * https://github.com/microsoft/vscode/blob/main/LICENSE.txt
 *
 * Pure, render-agnostic: given commits newest→oldest (as `git.log` returns
 * them), it produces one `GitCommitRow` per commit carrying the swimlane model
 * `BranchTreeCell` paints — the node's column/color plus a flat list of edges
 * (top→bottom connectors) for the row. The hard part lives here; the SVG cell
 * is a dumb painter of one row's slice.
 */
import type { GitCommit } from "../../../ipc/git-ipc";

/** A swimlane reserving the next commit (`id`) expected in its column. */
export interface GitLane {
    /** The hash this lane is heading toward (a parent of some processed commit). */
    id: string;
    color: string;
}

/**
 * One connector within a row. Columns are lane indices; y is implied by the
 * endpoints. `-1` means "the node": `fromColumn === -1` originates at the node
 * (branch-out, node→bottom); `toColumn === -1` terminates at the node
 * (merge-in / main lane, top→node).
 */
export interface GitEdge {
    fromColumn: number;
    toColumn: number;
    color: string;
}

/**
 * Row kind (US-618). Real commits are "commit"; the Git Diff "File History" panel
 * also injects synthetic "unstaged"/"staged" rows at the top of its grid so the
 * working-tree / index endpoints are selectable inline (not as separate UI above
 * the table). Synthetic rows carry an empty date/hash and a label in `subject`.
 */
export type GitRowType = "commit" | "unstaged" | "staged";

/**
 * A grid row: the commit's fields flattened in (so column `key`s like
 * "subject"/"shortHash" map directly to row fields — AVGrid range-copy reads
 * `row[key]`), plus the per-row swimlane layout the SVG cell paints.
 */
export interface GitCommitRow extends GitCommit {
    /** "commit" for real history; "unstaged"/"staged" for the synthetic endpoint
     *  rows (US-618). Lets the panel recognize special rows. */
    recordType: GitRowType;
    node: { column: number; color: string };
    inputSwimlanes: GitLane[];
    outputSwimlanes: GitLane[];
    edges: GitEdge[];
}

/**
 * Build a synthetic endpoint row (US-618). Empty date/hash (`authorDate: 0` →
 * blank via `dateText`; `shortHash: ""`), no refs, a sentinel hash for the row
 * key, and the label in `subject`.
 */
export function syntheticCommitRow(
    recordType: Exclude<GitRowType, "commit">,
    subject: string,
): GitCommitRow {
    return {
        hash: `__${recordType}__`,
        shortHash: "",
        parents: [],
        subject,
        authorName: "",
        authorDate: 0,
        refs: [],
        recordType,
        node: { column: 0, color: "" },
        inputSwimlanes: [],
        outputSwimlanes: [],
        edges: [],
    };
}

/** Number of lane columns a row occupies (for sizing the graph cell). */
export function rowColumnCount(row: GitCommitRow): number {
    return Math.max(
        row.inputSwimlanes.length,
        row.outputSwimlanes.length,
        row.node.column + 1,
    );
}

/** Max lane columns across all rows — the constant graph width feeds off this. */
export function maxColumnCount(rows: GitCommitRow[]): number {
    return rows.reduce((m, r) => Math.max(m, rowColumnCount(r)), 1);
}

/**
 * @param commits   newest→oldest (topo-ordered, as `git.log` returns them)
 * @param laneColors cycling palette (e.g. TAG_COLORS hexes) — never empty
 */
export function toCommitRows(commits: GitCommit[], laneColors: string[]): GitCommitRow[] {
    const palette = laneColors.length > 0 ? laneColors : ["currentColor"];
    let colorIndex = -1;
    const nextColor = (): string => {
        colorIndex = (colorIndex + 1) % palette.length;
        return palette[colorIndex];
    };

    const rows: GitCommitRow[] = [];
    let prevOutput: GitLane[] = [];

    for (const commit of commits) {
        // Input lanes = the row above's output lanes (same columns, positional).
        const inputSwimlanes: GitLane[] = prevOutput.map((l) => ({ ...l }));
        const outputSwimlanes: GitLane[] = [];
        const edges: GitEdge[] = [];

        // Node column + color: the first input lane reserving this commit.
        const reservedAt = inputSwimlanes.findIndex((l) => l.id === commit.hash);
        let nodeColumn: number;
        let nodeColor: string;
        if (reservedAt === -1) {
            // New tip — no loaded child references it; gets a fresh column/color.
            nodeColumn = inputSwimlanes.length; // refined below once placed
            nodeColor = nextColor();
        } else {
            nodeColumn = reservedAt;
            nodeColor = inputSwimlanes[reservedAt].color;
        }

        let firstParentAdded = false;
        for (let i = 0; i < inputSwimlanes.length; i++) {
            const lane = inputSwimlanes[i];
            if (lane.id === commit.hash) {
                // This lane terminates at the node (the main lane + any merge-ins).
                edges.push({ fromColumn: i, toColumn: -1, color: lane.color });
                if (!firstParentAdded && commit.parents.length > 0) {
                    // First parent continues in this lane, keeping the node color.
                    const outCol = outputSwimlanes.length;
                    outputSwimlanes.push({ id: commit.parents[0], color: nodeColor });
                    edges.push({ fromColumn: -1, toColumn: outCol, color: nodeColor });
                    firstParentAdded = true;
                }
                // Other lanes reserving this commit collapse (merge) → dropped.
                // Root (no parents) → lane simply dropped.
                continue;
            }
            // Pass-through lane (may shift left if a lane before it dropped).
            const outCol = outputSwimlanes.length;
            outputSwimlanes.push({ ...lane });
            edges.push({ fromColumn: i, toColumn: outCol, color: lane.color });
        }

        // New tip with parents: its first-parent lane originates at the node.
        if (reservedAt === -1 && commit.parents.length > 0) {
            const outCol = outputSwimlanes.length;
            outputSwimlanes.push({ id: commit.parents[0], color: nodeColor });
            edges.push({ fromColumn: -1, toColumn: outCol, color: nodeColor });
            firstParentAdded = true;
            nodeColumn = outCol; // place the node above where its lane continues
        }

        // Extra parents (merge sources): reuse a lane already heading there, else
        // append a fresh-colored lane. Each draws a branch-out from the node.
        for (let i = firstParentAdded ? 1 : 0; i < commit.parents.length; i++) {
            const parent = commit.parents[i];
            const existing = outputSwimlanes.findIndex((l) => l.id === parent);
            if (existing !== -1) {
                edges.push({
                    fromColumn: -1,
                    toColumn: existing,
                    color: outputSwimlanes[existing].color,
                });
                continue;
            }
            const outCol = outputSwimlanes.length;
            const color = nextColor();
            outputSwimlanes.push({ id: parent, color });
            edges.push({ fromColumn: -1, toColumn: outCol, color });
        }

        rows.push({
            ...commit,
            recordType: "commit",
            node: { column: nodeColumn, color: nodeColor },
            inputSwimlanes,
            outputSwimlanes,
            edges,
        });
        prevOutput = outputSwimlanes;
    }

    return rows;
}

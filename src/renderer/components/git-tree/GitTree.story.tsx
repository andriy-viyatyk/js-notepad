import React, { useMemo, useState } from "react";

import { GitTree, type GitTreeSideSelect } from "./GitTree";
import { GitTreeModel } from "./GitTreeModel";
import type { GitCommitRow } from "./swimlane-layout";
import { Panel } from "../../uikit/Panel";
import type { GitCommit } from "../../../ipc/git-ipc";
import type { Story } from "../../editors/storybook/storyTypes";

// Synthetic DAG (newest→oldest, topo-ordered) exercising every layout case:
// 2-parent merge (A), octopus 3-parent merge (C), branch-out + parallel lanes
// (D/E/F off G), refs + tag decorations, and the root commit (I).
const h = (n: string) => `${n}${"0".repeat(40 - n.length)}`;
const t = (day: number) => Date.UTC(2026, 4, day, 12, 0, 0); // May 2026

const DEMO_COMMITS: GitCommit[] = [
    { hash: h("A"), shortHash: "Aaaaaaa", parents: [h("B"), h("E")], subject: "Merge feature into main", authorName: "Ada",  authorEmail: "ada@example.com", authorDate: t(20), refs: [{ name: "main", kind: "head" }, { name: "origin/main", kind: "remote" }] },
    { hash: h("B"), shortHash: "Bbbbbbb", parents: [h("C")],         subject: "Update README",            authorName: "Lin",  authorEmail: "lin@example.com", authorDate: t(19), refs: [] },
    { hash: h("C"), shortHash: "Ccccccc", parents: [h("D"), h("E"), h("F")], subject: "Octopus merge of work, feature, hotfix", authorName: "Ada", authorEmail: "ada@example.com", authorDate: t(18), refs: [] },
    { hash: h("D"), shortHash: "Ddddddd", parents: [h("G")],         subject: "Main line work",            authorName: "Lin",  authorEmail: "lin@example.com", authorDate: t(17), refs: [] },
    { hash: h("E"), shortHash: "Eeeeeee", parents: [h("G")],         subject: "Feature: add X",             authorName: "Sam",  authorEmail: "sam@example.com", authorDate: t(16), refs: [{ name: "feature", kind: "branch" }] },
    { hash: h("F"), shortHash: "Fffffff", parents: [h("G")],         subject: "Hotfix: patch crash",        authorName: "Ada",  authorEmail: "ada@example.com", authorDate: t(15), refs: [{ name: "v1.0", kind: "tag" }] },
    { hash: h("G"), shortHash: "Ggggggg", parents: [h("H")],         subject: "Shared base",                authorName: "Lin",  authorEmail: "lin@example.com", authorDate: t(14), refs: [] },
    { hash: h("H"), shortHash: "Hhhhhhh", parents: [h("I")],         subject: "Project scaffolding",        authorName: "Sam",  authorEmail: "sam@example.com", authorDate: t(13), refs: [] },
    { hash: h("I"), shortHash: "Iiiiiii", parents: [],               subject: "Initial commit",             authorName: "Ada",  authorEmail: "ada@example.com", authorDate: t(12), refs: [{ name: "v0.1", kind: "tag" }] },
];

function GitTreeDemo({
    compact = false,
    sideSelect: withSideSelect = false,
}: {
    compact?: boolean;
    sideSelect?: boolean;
}) {
    const [selected, setSelected] = useState<string | undefined>(undefined);
    // Seed a model with the synthetic DAG (no git fetch) — the component is a
    // pure renderer over `model.state`.
    const model = useMemo(() => {
        const m = new GitTreeModel();
        m.state.update((s) => { s.commits = DEMO_COMMITS; });
        return m;
    }, []);

    // The L/R side-select column (US-618) is otherwise reachable only through the Git Diff
    // "Revisions" panel, so the story wires a local from/to pair: it exercises the toggles, the
    // sticky status column, and the `grid.refresh()` repaint path (US-1021).
    const [from, setFrom] = useState<string | undefined>(h("E"));
    const [to, setTo] = useState<string | undefined>(h("A"));
    const sideSelect = useMemo<GitTreeSideSelect | undefined>(
        () =>
            withSideSelect
                ? {
                      selectionKey: `${from}|${to}`,
                      showLeft: () => true,
                      isLeftActive: (row: GitCommitRow) => row.hash === from,
                      isRightActive: (row: GitCommitRow) => row.hash === to,
                      onPickLeft: (row: GitCommitRow) => setFrom(row.hash),
                      onPickRight: (row: GitCommitRow) => setTo(row.hash),
                  }
                : undefined,
        [withSideSelect, from, to],
    );

    return (
        <Panel direction="column" width={compact ? 460 : 760} height={320}>
            <Panel direction="column" flex={1} height={0}>
                <GitTree
                    model={model}
                    selectedHash={selected}
                    onSelectCommit={setSelected}
                    compact={compact}
                    sideSelect={sideSelect}
                />
            </Panel>
        </Panel>
    );
}

export const gitTreeStory: Story = {
    id: "git-tree",
    name: "GitTree",
    section: "Git",
    component: GitTreeDemo as React.ComponentType<Record<string, unknown>>,
    props: [
        { name: "compact", type: "boolean", default: false },
        // The L/R column only exists in the compact layout — turn both on together.
        { name: "sideSelect", type: "boolean", default: false },
    ],
};

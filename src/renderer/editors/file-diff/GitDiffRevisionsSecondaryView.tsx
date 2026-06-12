import { useMemo } from "react";

import type { SecondaryViewProps } from "../../ui/secondary-views/secondary-view-registry";
import { SideBarPanelHeader } from "../../ui/secondary-views/SideBarPanelHeader";
import { FileDiffEditor } from "./FileDiffEditor";
import {
    GitTree,
    syntheticCommitRow,
    type GitCommitRow,
    type GitTreeSideSelect,
} from "../../components/git-tree";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { IconButton } from "../../uikit/IconButton/IconButton";
import { RefreshIcon } from "../../theme/icons";

// =============================================================================
// Git Diff "File History" secondary view (EPIC-031 / US-618).
//
// Duplicates the toolbar from/to popover selection as a persistent sidebar panel.
// The file's filtered commit list (shared `model.fileTree`, datetime-first, no
// graph) is rendered with synthetic **Unstaged** / **Staged**(-if-present) rows
// at the top (US-618) — recognized via `recordType`. Each row has L/R toggles
// bound to the editor's single `from`/`to` state — picking here, in a popover, or
// via the toggles all mutate the same state and stay in sync.
//
// Pattern B with the DEFAULT `beforeNavigateAway`: the panel disappears when the
// page navigates to another file AND when the Git Diff is switched back to the
// Text Editor. A picked commit's shorthash is the first 7 chars (matching
// `RevisionPicker`'s commit pick).
// =============================================================================

const shortHashOf = (hash: string) => hash.slice(0, 7);

export default function GitDiffRevisionsSecondaryView({ model, headerRef, icon }: SecondaryViewProps) {
    // Type-guard before any hooks (same pattern as GitChangesSecondaryView).
    if (!(model instanceof FileDiffEditor)) return null;
    return <RevisionsBody model={model} headerRef={headerRef} icon={icon} />;
}

function RevisionsBody({
    model,
    headerRef,
    icon,
}: {
    model: FileDiffEditor;
    headerRef: SecondaryViewProps["headerRef"];
    icon: SecondaryViewProps["icon"];
}) {
    const { from, to, hasStaged } = model.state.use((s) => ({
        from: s.from,
        to: s.to,
        hasStaged: s.hasStaged,
    }));
    const gitOk = model.fileTree.state.use((s) => s.gitOk);

    // Synthetic endpoint rows at the top of the grid (US-618). Unstaged is always
    // shown; Staged only when the file has staged changes.
    const leadingRows = useMemo<GitCommitRow[]>(() => {
        const rows = [syntheticCommitRow("unstaged", "Unstaged changes")];
        if (hasStaged) rows.push(syntheticCommitRow("staged", "Staged changes"));
        return rows;
    }, [hasStaged]);

    // Row-aware side-select: maps each row (commit / unstaged / staged) to the
    // matching RevSel. The Unstaged row never offers L (diff `from` is never the
    // working tree).
    const sideSelect = useMemo<GitTreeSideSelect>(
        () => ({
            selectionKey:
                `${from.kind}:${from.kind === "commit" ? from.hash : ""}` +
                `|${to.kind}:${to.kind === "commit" ? to.hash : ""}`,
            showLeft: (r) => r.recordType !== "unstaged",
            isLeftActive: (r) =>
                r.recordType === "staged"
                    ? from.kind === "staged"
                    : r.recordType === "commit"
                      ? from.kind === "commit" && from.hash === r.hash
                      : false,
            isRightActive: (r) =>
                r.recordType === "unstaged"
                    ? to.kind === "unstaged"
                    : r.recordType === "staged"
                      ? to.kind === "staged"
                      : to.kind === "commit" && to.hash === r.hash,
            onPickLeft: (r) => {
                if (r.recordType === "staged") model.setFrom({ kind: "staged" });
                else if (r.recordType === "commit")
                    model.setFrom({ kind: "commit", hash: r.hash, shortHash: shortHashOf(r.hash) });
            },
            onPickRight: (r) => {
                if (r.recordType === "unstaged") model.setTo({ kind: "unstaged" });
                else if (r.recordType === "staged") model.setTo({ kind: "staged" });
                else model.setTo({ kind: "commit", hash: r.hash, shortHash: shortHashOf(r.hash) });
            },
        }),
        [from, to, model],
    );

    return (
        <Panel
            name="git-diff-revisions"
            direction="column"
            flex={1}
            overflow="hidden"
            width="100%"
        >
            <SideBarPanelHeader
                headerRef={headerRef}
                icon={icon}
                title="File History"
                actions={
                    <IconButton
                        name="git-diff-revisions-refresh"
                        size="sm"
                        title="Refresh"
                        icon={<RefreshIcon />}
                        onClick={(e) => {
                            e.stopPropagation();
                            model.refreshPanel();
                        }}
                    />
                }
            />
            {!gitOk ? (
                <Panel padding="md">
                    <Text color="light">Git is unavailable.</Text>
                </Panel>
            ) : (
                <Panel direction="column" flex={1} height={0} overflow="hidden">
                    <GitTree
                        name="git-diff-revisions-tree"
                        compact
                        model={model.fileTree}
                        leadingRows={leadingRows}
                        sideSelect={sideSelect}
                    />
                </Panel>
            )}
        </Panel>
    );
}

import { useEffect, useState, type ReactNode } from "react";

import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { git } from "../../api/git";
import { RefBadge, dateText, type GitTreeModel } from "../../components/git-tree";

// =============================================================================
// Git Tree "Commit" tab (EPIC-031 / US-629).
//
// Shows the metadata of the commit currently selected in the commit tree:
// author + email, date, full hash, ref badges (branches/tags at the commit),
// and the full commit message (fetched lazily). Parent/child are intentionally
// omitted — those relationships are visible in the commit graph above.
// =============================================================================

function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <Panel direction="row" gap="sm" align="baseline">
            <Panel width={92} shrink={false}>
                <Text color="light" size="md">{label}</Text>
            </Panel>
            <Panel flex={1} overflow="hidden">{children}</Panel>
        </Panel>
    );
}

export function CommitInfoPanel({
    repoRoot,
    gitTree,
    selectedHash,
}: {
    repoRoot: string;
    gitTree: GitTreeModel;
    selectedHash?: string;
}) {
    const commits = gitTree.state.use((s) => s.commits);
    const commit = commits.find((c) => c.hash === selectedHash);

    const [message, setMessage] = useState("");
    useEffect(() => {
        let live = true;
        if (!commit) {
            setMessage("");
            return;
        }
        void git.commitMessage(repoRoot, commit.hash).then((m) => {
            if (live) setMessage(m);
        });
        return () => { live = false; };
        // Keyed on the commit's hash, not the `commit` object — the object's
        // identity changes on every `commits` array rebuild (refresh), which would
        // refetch the same message needlessly. The hash is the stable identity.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [repoRoot, commit?.hash]);

    if (!commit) {
        return (
            <Panel padding="md">
                <Text color="light">Select a commit to see its details.</Text>
            </Panel>
        );
    }

    const author = commit.authorEmail
        ? `${commit.authorName} <${commit.authorEmail}>`
        : commit.authorName;

    return (
        <Panel direction="column" flex={1} overflow="auto" padding="md" gap="sm">
            <Row label="Author"><Text size="md">{author}</Text></Row>
            <Row label="Date"><Text size="md">{dateText(commit.authorDate)}</Text></Row>
            <Row label="Commit hash"><Text size="md">{commit.hash}</Text></Row>
            {commit.refs.length > 0 && (
                <Row label="Refs">
                    <Panel direction="row" wrap>
                        {commit.refs.map((ref) => (
                            <RefBadge key={`${ref.kind}:${ref.name}`} refData={ref} />
                        ))}
                    </Panel>
                </Row>
            )}
            <Panel paddingTop="sm">
                <Text size="md" preWrap>{message || commit.subject}</Text>
            </Panel>
        </Panel>
    );
}

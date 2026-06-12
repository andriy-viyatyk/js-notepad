import { useCallback, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type { SecondaryViewProps } from "../../ui/secondary-views/secondary-view-registry";
import { GitTreeEditorModel } from "./GitTreeEditorModel";
import { buildRefsTree, BRANCHES_ROOT_VALUE, REF_COLOR, type GitRefNode } from "../../components/git-tree";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { Tag } from "../../uikit/Tag";
import { Spacer } from "../../uikit/Spacer";
import { Tree } from "../../uikit/Tree";
import { IconButton } from "../../uikit/IconButton/IconButton";
import type { MenuItem } from "../../uikit/Menu";
import { RefreshIcon, CloseIcon, GitIcon, GlobeIcon, FolderOpenIcon, TagIcon, SortAlphaIcon } from "../../theme/icons";

// =============================================================================
// Git Tree "Branches & Tags" secondary view (EPIC-031 / US-634).
//
// Display-only refs tree: Branches (with /-folder nesting) + Remotes (one node
// per remote, branches nested) + Tags. Sibling of the "Changes" panel on the
// same GitTreeEditorModel (Pattern B). Hosts the editor's manual "x" close
// (relocated from the Changes header). Ref interactions (reveal-in-graph,
// checkout, active-branch sync) are a deferred follow-up.
// =============================================================================

const ICON_SIZE = 14;

/** Decorate every node in place (mutates the freshly-built tree):
 *  - leading icon by kind: branch / remote-branch → GitIcon (tinted), tag →
 *    TagIcon (pink), remote-name → GlobeIcon, folder → FolderOpenIcon,
 *    roots (sec:*) → none.
 *  - the checked-out branch (value === currentValue) gets the head-green
 *    treatment — green icon + green label — to match the git-tree graph, where
 *    the current branch ref is colored head-green. */
function decorateNodes(nodes: GitRefNode[], currentValue?: string): GitRefNode[] {
    for (const node of nodes) {
        if (node.kind === "tag") {
            node.icon = <TagIcon width={ICON_SIZE} height={ICON_SIZE} color={REF_COLOR.tag} />;
        } else if (node.kind === "branch") {
            node.icon = <GitIcon width={ICON_SIZE} height={ICON_SIZE} color={REF_COLOR.branch} />;
        } else if (node.kind === "remote-branch") {
            node.icon = <GitIcon width={ICON_SIZE} height={ICON_SIZE} color={REF_COLOR.remote} />;
        } else if (node.value.startsWith("remote:")) {
            node.icon = <GlobeIcon width={ICON_SIZE} height={ICON_SIZE} />;
        } else if (node.value.startsWith("localdir:") || node.value.startsWith("remotedir:")) {
            node.icon = <FolderOpenIcon width={ICON_SIZE} height={ICON_SIZE} />;
        }
        if (currentValue && node.value === currentValue) {
            node.icon = <GitIcon width={ICON_SIZE} height={ICON_SIZE} color={REF_COLOR.head} />;
            node.label = <Text color={REF_COLOR.head}>{node.label}</Text>;
        }
        if (node.items?.length) decorateNodes(node.items, currentValue);
    }
    return nodes;
}

export default function GitBranchesSecondaryView({ model, headerRef }: SecondaryViewProps) {
    // Type-guard before any hooks (same pattern as GitChangesSecondaryView).
    if (!(model instanceof GitTreeEditorModel)) return null;
    return <GitBranchesBody model={model} headerRef={headerRef} />;
}

function GitBranchesBody({
    model,
    headerRef,
}: {
    model: GitTreeEditorModel;
    headerRef: SecondaryViewProps["headerRef"];
}) {
    const { refs, gitOk } = model.branches.state.use((s) => ({
        refs: s.refs,
        gitOk: s.gitOk,
    }));

    // Persisted expansion map (descriptor state). Default: only Branches open.
    const expanded = model.state.use((s) => s.branchesExpanded);

    // Sort mode (descriptor state). Default historical (most-recent-first).
    const alphabetical = model.state.use((s) => !!s.branchesAlphabetical);

    // Transient hover highlight — Tree routes onItemMouseEnter → onActiveChange,
    // and styles the [data-active] row with a background. Visual-only, so local
    // component state is fine.
    const [activeIndex, setActiveIndex] = useState<number | null>(null);

    // Current-branch leaf value — drives the head-green label/icon decoration.
    // No selection background: the green text alone marks the active branch.
    // Hoisted to a plain local so the context-menu callback can depend on it
    // without the exhaustive-deps rule mistaking `refs.current` (the branch name)
    // for a React ref's `.current`.
    const currentBranch = refs.current;
    const currentValue = currentBranch ? "local:" + currentBranch : undefined;

    const tree = useMemo(
        () => decorateNodes(buildRefsTree(refs, alphabetical), currentValue),
        [refs, alphabetical, currentValue],
    );

    const getTooltip = useCallback(
        (node: GitRefNode): ReactNode => node.refName ?? null,
        [],
    );

    // Click a ref leaf → reveal its commit in the main Git Tree grid (US-634).
    // Roots/folders carry no `kind` and are ignored (their row click just selects).
    const onSelect = useCallback(
        (node: GitRefNode) => {
            if (node.kind) model.revealRef(node.refName, node.kind);
        },
        [model],
    );

    // Right-click a ref leaf → "Switch to ..." (US-636). Roots/folders carry no
    // `kind` → no menu. The checked-out branch's item is shown disabled "(current)".
    const getContextMenu = useCallback(
        (node: GitRefNode): MenuItem[] | undefined => {
            // Destructure to a const local so the narrowing survives into the
            // onClick closures (TS resets object-property narrowing across function
            // boundaries; const locals keep it).
            const { kind, refName } = node;
            if (kind === "branch" && refName) {
                const isCurrent = refName === currentBranch;
                return [{
                    label: `Switch to Branch '${refName}'${isCurrent ? " (current)" : ""}`,
                    icon: <GitIcon width={ICON_SIZE} height={ICON_SIZE} />,
                    disabled: isCurrent,
                    onClick: () => void model.switchTo({ type: "branch", name: refName }),
                }];
            }
            if (kind === "remote-branch" && refName) {
                return [{
                    label: `Switch to Remote Branch '${refName}'`,
                    icon: <GlobeIcon width={ICON_SIZE} height={ICON_SIZE} />,
                    onClick: () => void model.switchTo({ type: "remote", ref: refName }),
                }];
            }
            if (kind === "tag" && refName) {
                // A tag is just a pointer to a commit — switching detaches HEAD at
                // the tagged commit. The label says "Commit" so the user knows it
                // lands on that commit (detached), not on a tag "branch".
                return [{
                    label: `Switch to Tag '${refName}' Commit`,
                    icon: <TagIcon width={ICON_SIZE} height={ICON_SIZE} />,
                    onClick: () => void model.switchTo({ type: "tag", name: refName }),
                }];
            }
            return undefined; // roots / folders → no menu
        },
        [model, currentBranch],
    );

    // Accumulate expansion changes into the persisted map.
    const onExpandChange = useCallback(
        (value: string | number, isExpanded: boolean) => {
            const next = { ...(model.state.get().branchesExpanded ?? { [BRANCHES_ROOT_VALUE]: true }) };
            next[String(value)] = isExpanded;
            model.setBranchesExpanded(next);
        },
        [model],
    );

    const header = (
        <>
            <Panel direction="row" align="center" gap="sm" overflow="hidden">
                {/* Repository name (folder basename) as a badge; full path on hover —
                    mirrors the Git Tree editor toolbar. */}
                <Tag
                    name="git-branches-repo-name"
                    variant="outlined"
                    size="sm"
                    label={model.repoName}
                    title={model.state.get().repoRoot}
                />
                <Text color="inherit" truncate>Branches &amp; Tags</Text>
            </Panel>
            <Spacer />
            {/* Promote the Git Tree back to the page's main view (US-620 /
                US-634). Useful after clicking a changed file or ref opened the
                diff as the main editor — brings the commit tree back without
                leaving the panel. */}
            <IconButton
                name="git-branches-show-tree"
                size="sm"
                title="Show Git Tree"
                icon={<GitIcon />}
                onClick={(e) => {
                    e.stopPropagation();
                    model.showGitTree();
                }}
            />
            <IconButton
                name="git-branches-sort-alpha"
                size="sm"
                active={alphabetical}
                title={alphabetical ? "Sort alphabetically (on)" : "Sort alphabetically (off — historical)"}
                icon={<SortAlphaIcon />}
                onClick={(e) => {
                    e.stopPropagation();
                    model.setBranchesAlphabetical(!alphabetical);
                }}
            />
            <IconButton
                name="git-branches-refresh"
                size="sm"
                title="Refresh"
                icon={<RefreshIcon />}
                onClick={(e) => {
                    e.stopPropagation();
                    model.refresh();
                }}
            />
            {/* The editor's sole manual-close affordance (relocated here from the
                Changes panel, US-634). Tears down the whole Git Tree editor — both
                panels — and empties the page when it is the main editor. */}
            <IconButton
                name="git-branches-close"
                size="sm"
                title="Close Git Tree"
                icon={<CloseIcon />}
                onClick={(e) => {
                    e.stopPropagation();
                    void model.requestClose();
                }}
            />
        </>
    );

    return (
        <Panel
            name="git-branches"
            direction="column"
            flex={1}
            overflow="hidden"
            width="100%"
        >
            {headerRef && createPortal(header, headerRef)}
            {!gitOk ? (
                <Panel padding="md">
                    <Text color="light">Git is unavailable.</Text>
                </Panel>
            ) : (
                <Panel direction="column" flex={1} height={0} overflow="hidden">
                    <Tree<GitRefNode>
                        name="git-branches-tree"
                        items={tree}
                        getChildren={(n) => n.items}
                        onChange={onSelect}
                        getContextMenu={getContextMenu}
                        getTooltip={getTooltip}
                        defaultExpandedValues={expanded ?? { [BRANCHES_ROOT_VALUE]: true }}
                        onExpandChange={onExpandChange}
                        activeIndex={activeIndex}
                        onActiveChange={setActiveIndex}
                        emptyMessage="No refs"
                    />
                </Panel>
            )}
        </Panel>
    );
}

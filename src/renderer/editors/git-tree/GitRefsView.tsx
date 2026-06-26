import { useCallback, useMemo, useState, type ReactNode } from "react";

import { GitTreeEditorModel } from "./GitTreeEditorModel";
import {
    buildRefsTree,
    BRANCHES_ROOT_VALUE,
    TAGS_ROOT_VALUE,
    REF_COLOR,
    type GitRefNode,
} from "../../components/git-tree";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { Tree } from "../../uikit/Tree";
import type { MenuItem } from "../../uikit/Menu";
import { GitIcon, GlobeIcon, FolderOpenIcon, TagIcon } from "../../theme/icons";

// =============================================================================
// Git "Branches" / "Tags" segment body (US-781).
//
// The refs surface of the merged "Git" panel. `show="branches"` renders the
// Branches + Remotes roots as a `/`-folded tree; `show="tags"` renders the tag
// list flat. Header-less — the merged panel (`GitPanelSecondaryView`) owns the
// shared SideBarPanelHeader and the segment toolbar (incl. the Sort-alpha "AZ"
// toggle). Extracted from the former standalone "Branches & Tags" secondary
// view; ref interactions (reveal-in-graph, switch, head-green active branch) are
// preserved unchanged.
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

export function GitRefsView({
    model,
    show,
}: {
    model: GitTreeEditorModel;
    show: "branches" | "tags";
}) {
    const { refs, gitOk } = model.branches.state.use((s) => ({
        refs: s.refs,
        gitOk: s.gitOk,
    }));

    // Persisted expansion map (descriptor state). Default: only Branches open.
    // Tags render flat (leaves only), so the map is unused there.
    const expanded = model.state.use((s) => s.branchesExpanded);

    // Sort mode (descriptor state). Default historical (most-recent-first). The
    // toggle button lives on the merged panel's segment toolbar (US-781).
    const alphabetical = model.state.use((s) => !!s.branchesAlphabetical);

    // Transient hover highlight — Tree routes onItemMouseEnter → onActiveChange,
    // and styles the [data-active] row with a background. Visual-only, so local
    // component state is fine.
    const [activeIndex, setActiveIndex] = useState<number | null>(null);

    // Current-branch leaf value — drives the head-green label/icon decoration.
    // Hoisted to a plain local so the context-menu callback can depend on it
    // without the exhaustive-deps rule mistaking `refs.current` (the branch name)
    // for a React ref's `.current`.
    const currentBranch = refs.current;
    const currentValue = currentBranch ? "local:" + currentBranch : undefined;

    // Build the full refs tree, then render the subset for this segment:
    //  - branches → the Branches + Remotes roots (everything branch-like).
    //  - tags     → the Tags root's children, flat (no root wrapper / chevron).
    const tree = useMemo(() => {
        const roots = buildRefsTree(refs, alphabetical);
        const subset = show === "branches"
            ? roots.filter((r) => r.value !== TAGS_ROOT_VALUE)
            : (roots.find((r) => r.value === TAGS_ROOT_VALUE)?.items ?? []);
        return decorateNodes(subset, currentValue);
    }, [refs, alphabetical, currentValue, show]);

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

    // Accumulate expansion changes into the persisted map (branches segment only).
    const onExpandChange = useCallback(
        (value: string | number, isExpanded: boolean) => {
            const next = { ...(model.state.get().branchesExpanded ?? { [BRANCHES_ROOT_VALUE]: true }) };
            next[String(value)] = isExpanded;
            model.setBranchesExpanded(next);
        },
        [model],
    );

    if (!gitOk) {
        return (
            <Panel padding="md">
                <Text color="light">Git is unavailable.</Text>
            </Panel>
        );
    }

    return (
        <Panel direction="column" flex={1} height={0} overflow="hidden">
            <Tree<GitRefNode>
                name={show === "branches" ? "git-branches-tree" : "git-tags-tree"}
                items={tree}
                getChildren={(n) => n.items}
                onChange={onSelect}
                getContextMenu={getContextMenu}
                getTooltip={getTooltip}
                defaultExpandedValues={expanded ?? { [BRANCHES_ROOT_VALUE]: true }}
                onExpandChange={onExpandChange}
                activeIndex={activeIndex}
                onActiveChange={setActiveIndex}
                emptyMessage={show === "branches" ? "No branches" : "No tags"}
            />
        </Panel>
    );
}

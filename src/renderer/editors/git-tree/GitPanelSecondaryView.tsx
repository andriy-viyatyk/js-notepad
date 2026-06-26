import { useMemo } from "react";

import type { SecondaryViewProps } from "../../ui/secondary-views/secondary-view-registry";
import { SideBarPanelHeader } from "../../ui/secondary-views/SideBarPanelHeader";
import { GitTreeEditorModel } from "./GitTreeEditorModel";
import { GitChangesView } from "./GitChangesView";
import { GitRefsView } from "./GitRefsView";
import { Panel } from "../../uikit/Panel";
import { Tag } from "../../uikit/Tag";
import { Text } from "../../uikit/Text";
import { Spacer } from "../../uikit/Spacer";
import { SegmentedControl } from "../../uikit/SegmentedControl";
import { IconButton } from "../../uikit/IconButton/IconButton";
import { RefreshIcon, CloseIcon, SortAlphaIcon } from "../../theme/icons";
import { useOptionalState } from "../../core/state/state";
import color from "../../theme/color";

// =============================================================================
// Merged "Git" secondary view (US-781).
//
// One panel replaces the former "Changes" + "Branches & Tags" pair. A
// SegmentedControl in the body toolbar switches between three segment bodies:
//   - "changes"  → GitChangesView   (unstaged / staged working-tree status)
//   - "branches" → GitRefsView      (Branches + Remotes refs tree)
//   - "tags"     → GitRefsView      (tags, flat)
// The shared header carries the repo badge, a static "Git" title, Refresh +
// Close, and the "Show Git Tree" promote-to-main zone (relocated from the old
// Branches header — the editor's sole manual-close + promote affordances). The
// Sort-alpha ("AZ") toggle sits in the body toolbar and shows only for the refs
// segments. Survives navigation (Pattern B; only-manual-close).
// =============================================================================

export default function GitPanelSecondaryView({ model, headerRef, icon }: SecondaryViewProps) {
    // Type-guard before any hooks (same pattern as the former Git panels).
    if (!(model instanceof GitTreeEditorModel)) return null;
    return <GitPanelBody model={model} headerRef={headerRef} icon={icon} />;
}

function GitPanelBody({
    model,
    headerRef,
    icon,
}: {
    model: GitTreeEditorModel;
    headerRef: SecondaryViewProps["headerRef"];
    icon: SecondaryViewProps["icon"];
}) {
    const tab = model.state.use((s) => s.gitPanelTab ?? "changes");
    const alphabetical = model.state.use((s) => !!s.branchesAlphabetical);

    // Changed-file count for the header title ("Git (N)"). Shown in every segment
    // and while collapsed, so the user can spot which repos have changes without
    // expanding each panel. A file can appear in BOTH lists (partially staged) —
    // union the repo-relative paths so it's counted once rather than double-counted.
    const { unstaged, staged } = model.changes.state.use((s) => ({
        unstaged: s.unstaged,
        staged: s.staged,
    }));
    const fileCount = useMemo(() => {
        const paths = new Set<string>();
        for (const c of unstaged) paths.add(c.path);
        for (const c of staged) paths.add(c.path);
        return paths.size;
    }, [unstaged, staged]);

    // Drives the show-main zone's "active" (blue) indicator: true when the Git
    // Tree grid is already the page's main view (false e.g. while a diff opened
    // as the main editor demoted it to the sidebar).
    const isMainEditor = useOptionalState(model.page?.state, () => model.isMain, false);

    const actions = (
        <>
            <IconButton
                name="git-panel-refresh"
                size="sm"
                title="Refresh"
                icon={<RefreshIcon />}
                onClick={(e) => {
                    e.stopPropagation();
                    model.refresh();
                }}
            />
            {/* The editor's sole manual-close affordance. Tears down the whole Git
                Tree editor and empties the page when it is the main editor. */}
            <IconButton
                name="git-panel-close"
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
            name="git-panel"
            direction="column"
            flex={1}
            overflow="hidden"
            width="100%"
        >
            <SideBarPanelHeader
                headerRef={headerRef}
                icon={icon}
                badge={
                    /* Repository name (folder basename) as a badge; full path on
                       hover — mirrors the Git Tree editor toolbar. */
                    <Tag
                        name="git-panel-repo-name"
                        variant="outlined"
                        size="sm"
                        truncate
                        label={model.repoName}
                        title={model.state.get().repoRoot}
                    />
                }
                title={
                    fileCount ? (
                        // Accent the changed-file count so it stands out at a glance,
                        // collapsed or expanded. Mirrors the header's default string-title
                        // wrapper (truncating <Text size="md">) with the "(N)" tinted blue.
                        <Text name="git-panel-title" color="inherit" truncate size="md">
                            Git <Text color={color.misc.blue}>({fileCount})</Text>
                        </Text>
                    ) : (
                        "Git"
                    )
                }
                actions={actions}
                showMainTitle="Show Git Tree"
                showMainActive={isMainEditor}
                onShowMain={() => {
                    // Bring the Git Tree grid back to the page's main view (e.g.
                    // after a diff opened as the main editor). No-op when already
                    // main. showGitTree() navigates with reuse.
                    if (!isMainEditor) model.showGitTree();
                }}
            />
            <Panel
                name="git-panel-toolbar"
                direction="row"
                align="center"
                paddingX="xs"
                paddingY="xs"
                gap="sm"
                shrink={false}
            >
                <SegmentedControl
                    name="git-panel-tabs"
                    size="sm"
                    value={tab}
                    onChange={(v) => model.setGitPanelTab(v as "changes" | "branches" | "tags")}
                    items={[
                        { value: "changes", label: "Changes" },
                        { value: "branches", label: "Branches" },
                        { value: "tags", label: "Tags" },
                    ]}
                />
                <Spacer />
                {tab !== "changes" && (
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
                )}
            </Panel>
            {tab === "changes" ? (
                <GitChangesView model={model} />
            ) : (
                <GitRefsView model={model} show={tab === "branches" ? "branches" : "tags"} />
            )}
        </Panel>
    );
}

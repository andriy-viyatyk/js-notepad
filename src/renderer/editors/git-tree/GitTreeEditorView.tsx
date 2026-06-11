import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { PageToolbar } from "../base";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { Splitter } from "../../uikit/Splitter";
import { SegmentedControl } from "../../uikit/SegmentedControl";
import { IconButton } from "../../uikit/IconButton/IconButton";
import type { MenuItem } from "../../uikit/Menu";
import { RefreshIcon, GitIcon, GlobeIcon } from "../../theme/icons";
import { TComponentState } from "../../core/state/state";
import { GitTree, type GitCommitRow } from "../../components/git-tree";
import { CommitInfoPanel } from "./CommitInfoPanel";
import { CommitDiffPanel } from "./CommitDiffPanel";
import { decodeGitTreeLink } from "../../content/git-tree-link";
import {
    GitTreeEditorModel,
    getDefaultGitTreeEditorState,
    type GitTreeEditorState,
} from "./GitTreeEditorModel";
import type { EditorModule } from "../types";
import type { EditorModel } from "../base";
import type { EditorType, IEditorState } from "../../../shared/types";

// =============================================================================
// Component — thin render over the editor-owned GitTreeModel (model-view).
// =============================================================================

/** Default bottom-panel height (px) until the user resizes it (US-629). */
const DEFAULT_PANEL_H = 240;

/** Default width (px) of the "Diff" tab's left file-list column (US-630). */
const DEFAULT_DIFF_LIST_W = 240;

export function GitTreeEditorView({ model }: { model: GitTreeEditorModel }) {
    const { loading, gitOk, hasCommits } = model.gitTree.state.use((s) => ({
        loading: s.loading,
        gitOk: s.gitOk,
        hasCommits: s.commits.length > 0,
    }));
    const [selectedHash, setSelectedHash] = useState<string | undefined>(undefined);

    // Bottom panel (US-629): resizable, persisted height + active tab. Capped at
    // 80% of the editor-root height so it can never crowd out the commit grid on
    // a short window — measure the root with a ResizeObserver and clamp both the
    // Splitter `max` and the panel's rendered height.
    const rootRef = useRef<HTMLDivElement>(null);
    const [containerH, setContainerH] = useState(0);
    useEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        const ro = new ResizeObserver(([e]) => setContainerH(e.contentRect.height));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const { bottomPanelHeight, bottomPanelTab, commitDiffListWidth } = model.state.use((s) => ({
        bottomPanelHeight: s.bottomPanelHeight,
        bottomPanelTab: s.bottomPanelTab,
        commitDiffListWidth: s.commitDiffListWidth,
    }));
    const maxH = containerH > 0 ? Math.round(containerH * 0.8) : Infinity;
    const panelH = Math.min(bottomPanelHeight ?? DEFAULT_PANEL_H, maxH);
    const tab = bottomPanelTab ?? "commit";

    // Right-click a commit → Switch options (US-636). AVGrid passes the current
    // grid selection; a single right-click targets one row, a right-click inside a
    // multi-row range keeps the range — switch is single-commit, so the items are
    // disabled when more than one row is selected. The current branch (a `head`
    // ref) is shown disabled "(current)".
    //
    // De-duplication: a branch/tag is just a pointer to this commit, so switching
    // to a local branch lands on the same commit (on a branch — the preferred
    // outcome). So when a local branch points here we offer ONLY the branch
    // switch(es); "Switch to Commit" (detached HEAD) is offered only when no local
    // branch is here (covers the tag-only and bare-commit cases). Tags are not
    // listed separately on the grid — "Switch to Commit" covers the tagged commit.
    const commitContextMenu = useCallback(
        (rows: GitCommitRow[]): MenuItem[] => {
            const row = rows[0];
            if (!row || row.recordType !== "commit") return [];
            const multi = rows.length > 1;
            const items: MenuItem[] = [];
            let hasLocalBranch = false;
            for (const ref of row.refs) {
                if (ref.kind === "head") {
                    hasLocalBranch = true;
                    items.push({ label: `Switch to Branch '${ref.name}' (current)`, icon: <GitIcon />, disabled: true });
                } else if (ref.kind === "branch") {
                    hasLocalBranch = true;
                    items.push({ label: `Switch to Branch '${ref.name}'`, icon: <GitIcon />, disabled: multi, onClick: () => void model.switchTo({ type: "branch", name: ref.name }) });
                }
            }
            for (const ref of row.refs) {
                if (ref.kind === "remote") {
                    items.push({ label: `Switch to Remote Branch '${ref.name}'`, icon: <GlobeIcon />, disabled: multi, onClick: () => void model.switchTo({ type: "remote", ref: ref.name }) });
                }
            }
            if (!hasLocalBranch) {
                items.push({
                    label: `Switch to Commit ${row.shortHash}`,
                    icon: <GitIcon />,
                    startGroup: items.length > 0,
                    disabled: multi,
                    onClick: () => void model.switchTo({ type: "commit", hash: row.hash }),
                });
            }
            return items;
        },
        [model],
    );

    let body: ReactNode;
    if (!gitOk) {
        body = (
            <Panel padding="xl">
                <Text color="light">
                    Git is unavailable — check that git is installed and on your PATH, and
                    that Git integration is enabled in Settings.
                </Text>
            </Panel>
        );
    } else if (loading && !hasCommits) {
        // Initial load only. On Refresh (commits already present) we keep the
        // <GitTree> mounted so its column state — user-dragged widths + reorder —
        // survives the reload; unmounting to this placeholder would rebuild the
        // grid from scratch and reset them (US-622).
        body = (
            <Panel padding="xl">
                <Text color="light">Loading history…</Text>
            </Panel>
        );
    } else {
        body = (
            // direction="column" so the grid (RenderGrid root is flex:1 1 auto
            // with a 100px height fallback) grows to fill instead of staying 100px.
            <Panel direction="column" flex={1} height={0}>
                <GitTree
                    model={model.gitTree}
                    selectedHash={selectedHash}
                    onSelectCommit={setSelectedHash}
                    initialColumnLayout={model.state.get().columnLayout}
                    onColumnLayoutChange={model.setColumnLayout}
                    getContextMenuItems={commitContextMenu}
                />
            </Panel>
        );
    }

    return (
        <Panel
            ref={rootRef}
            name="git-tree-editor-root"
            direction="column"
            flex={1}
            overflow="hidden"
            background="default"
        >
            <PageToolbar
                name="git-tree-toolbar"
                model={model}
                borderBottom
                rightContributions={
                    <IconButton
                        name="git-tree-refresh"
                        size="sm"
                        title="Refresh"
                        icon={<RefreshIcon />}
                        disabled={loading}
                        onClick={() => model.refresh()}
                    />
                }
            >
                {/* Repository name (folder basename) — identifies which repo this
                    Git Tree shows; full path on hover (US-620 follow-up). */}
                <Text color="light" nowrap title={model.state.get().repoRoot}>
                    {model.repoName}
                </Text>
            </PageToolbar>
            {body}
            {gitOk && hasCommits && (
                <>
                    <Splitter
                        name="git-tree-bottom-splitter"
                        orientation="horizontal"
                        value={panelH}
                        onChange={model.setBottomPanelHeight}
                        side="after"
                        border="before"
                        min={120}
                        max={maxH}
                    />
                    <Panel
                        name="git-tree-bottom-panel"
                        direction="column"
                        shrink={false}
                        height={panelH}
                        minHeight={120}
                        maxHeight={maxH}
                        overflow="hidden"
                    >
                        <Panel
                            name="git-tree-bottom-tabs"
                            direction="row"
                            align="center"
                            paddingX="sm"
                            paddingY="xs"
                            shrink={false}
                            background="dark"
                            borderBottom
                        >
                            <SegmentedControl
                                name="git-tree-bottom-tab-select"
                                size="sm"
                                value={tab}
                                onChange={(v) => model.setBottomPanelTab(v as "commit" | "diff")}
                                items={[
                                    { value: "commit", label: "Commit" },
                                    { value: "diff", label: "Diff" },
                                ]}
                            />
                        </Panel>
                        <Panel direction="column" flex={1} height={0} overflow="hidden">
                            {tab === "commit" && (
                                <CommitInfoPanel
                                    repoRoot={model.state.get().repoRoot}
                                    gitTree={model.gitTree}
                                    selectedHash={selectedHash}
                                />
                            )}
                            {tab === "diff" && (
                                <CommitDiffPanel
                                    repoRoot={model.state.get().repoRoot}
                                    gitTree={model.gitTree}
                                    selectedHash={selectedHash}
                                    listWidth={commitDiffListWidth ?? DEFAULT_DIFF_LIST_W}
                                    onListWidthChange={model.setCommitDiffListWidth}
                                />
                            )}
                        </Panel>
                    </Panel>
                </>
            )}
        </Panel>
    );
}

// =============================================================================
// Legacy EditorModule default-export — consumed by `buildEditorById`
// (navigatePageTo path) and the legacy `editorRegistry` `loadModule` safety-net.
// =============================================================================

const gitTreeEditorModule: EditorModule = {
    Editor: GitTreeEditorView as unknown as EditorModule["Editor"],

    newEditorModel: async (filePath?: string) => {
        const model = new GitTreeEditorModel(
            new TComponentState(getDefaultGitTreeEditorState()),
        );
        if (filePath) {
            const link = decodeGitTreeLink(filePath);
            if (link) model.initFromRepoRoot(link.repoRoot);
        }
        return model as unknown as EditorModel;
    },

    newEmptyEditorModel: async (editorType: EditorType) => {
        if (editorType !== "gitTreePage") return null;
        return new GitTreeEditorModel(
            new TComponentState(getDefaultGitTreeEditorState()),
        ) as unknown as EditorModel;
    },

    newEditorModelFromState: async (state: Partial<IEditorState>) => {
        const model = new GitTreeEditorModel(
            new TComponentState({
                ...getDefaultGitTreeEditorState(),
                ...(state as Partial<GitTreeEditorState>),
            }),
        );
        // Session restore: repoRoot rides the persisted state — load history now.
        model.syncGitTree();
        return model as unknown as EditorModel;
    },
};

export default gitTreeEditorModule;

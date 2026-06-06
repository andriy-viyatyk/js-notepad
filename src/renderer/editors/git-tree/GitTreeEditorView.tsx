import { type ReactNode, useCallback, useEffect, useState } from "react";

import { PageToolbar } from "../base";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { IconButton } from "../../uikit/IconButton/IconButton";
import { RefreshIcon } from "../../theme/icons";
import { TComponentState } from "../../core/state/state";
import { git } from "../../api/git";
import { settings } from "../../api/settings";
import { GitTree } from "../../components/git-tree";
import { decodeGitTreeLink } from "../../content/git-tree-link";
import type { GitCommit } from "../../../ipc/git-ipc";
import {
    GitTreeEditorModel,
    getDefaultGitTreeEditorState,
    type GitTreeEditorState,
} from "./GitTreeEditorModel";
import type { EditorModule } from "../types";
import type { EditorModel } from "../base";
import type { EditorType, IEditorState } from "../../../shared/types";

/** Commits loaded per page (Concern 5 — manual "load more"). */
const PAGE = 200;

// =============================================================================
// Component
// =============================================================================

export function GitTreeEditorView({ model }: { model: GitTreeEditorModel }) {
    const repoRoot = model.state.use((s) => s.repoRoot);
    const gitEnabled = settings.get("git.enabled");

    const [commits, setCommits] = useState<GitCommit[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [gitOk, setGitOk] = useState(true);
    const [selectedHash, setSelectedHash] = useState<string | undefined>(undefined);

    // Reload from page 1 (mount, repoRoot change, or Refresh).
    const reload = useCallback(async () => {
        if (!gitEnabled || !repoRoot) {
            setGitOk(gitEnabled);
            setCommits([]);
            setHasMore(false);
            setLoading(false);
            return;
        }
        setLoading(true);
        const probe = await git.probe();
        setGitOk(probe.installed);
        if (!probe.installed) {
            setCommits([]);
            setHasMore(false);
            setLoading(false);
            return;
        }
        const list = await git.log(repoRoot, { maxCount: PAGE });
        setCommits(list);
        setHasMore(list.length === PAGE);
        setLoading(false);
    }, [gitEnabled, repoRoot]);

    const loadMore = useCallback(async () => {
        if (loadingMore || !repoRoot) return;
        setLoadingMore(true);
        const list = await git.log(repoRoot, { maxCount: PAGE, skip: commits.length });
        setCommits((prev) => [...prev, ...list]);
        setHasMore(list.length === PAGE);
        setLoadingMore(false);
    }, [loadingMore, repoRoot, commits.length]);

    // Load the ENTIRE history (maxCount: 0 → git log with no --max-count). Fetches
    // from HEAD and replaces the list — robust regardless of how much is already
    // loaded (avoids any skip-past-the-end edge case).
    const loadAll = useCallback(async () => {
        if (loadingMore || !repoRoot) return;
        setLoadingMore(true);
        const list = await git.log(repoRoot, { maxCount: 0 });
        setCommits(list);
        setHasMore(false);
        setLoadingMore(false);
    }, [loadingMore, repoRoot]);

    useEffect(() => {
        void reload();
    }, [reload]);

    let body: ReactNode;
    if (!gitEnabled || !gitOk) {
        body = (
            <Panel padding="xl">
                <Text color="light">
                    Git is unavailable — check that git is installed and on your PATH, and
                    that Git integration is enabled in Settings.
                </Text>
            </Panel>
        );
    } else if (loading) {
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
                    commits={commits}
                    selectedHash={selectedHash}
                    onSelectCommit={setSelectedHash}
                    hasMore={hasMore}
                    loadingMore={loadingMore}
                    onLoadMore={() => void loadMore()}
                    onLoadAll={() => void loadAll()}
                />
            </Panel>
        );
    }

    return (
        <Panel
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
                        onClick={() => void reload()}
                    />
                }
            />
            {body}
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

    newEditorModelFromState: async (state: Partial<IEditorState>) =>
        new GitTreeEditorModel(
            new TComponentState({
                ...getDefaultGitTreeEditorState(),
                ...(state as Partial<GitTreeEditorState>),
            }),
        ) as unknown as EditorModel,
};

export default gitTreeEditorModule;

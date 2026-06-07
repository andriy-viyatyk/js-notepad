import { type ReactNode, useState } from "react";

import { PageToolbar } from "../base";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import { IconButton } from "../../uikit/IconButton/IconButton";
import { RefreshIcon } from "../../theme/icons";
import { TComponentState } from "../../core/state/state";
import { GitTree } from "../../components/git-tree";
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

export function GitTreeEditorView({ model }: { model: GitTreeEditorModel }) {
    const { loading, gitOk } = model.gitTree.state.use((s) => ({
        loading: s.loading,
        gitOk: s.gitOk,
    }));
    const [selectedHash, setSelectedHash] = useState<string | undefined>(undefined);

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
                    model={model.gitTree}
                    selectedHash={selectedHash}
                    onSelectCommit={setSelectedHash}
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
                        onClick={() => void model.gitTree.reload()}
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

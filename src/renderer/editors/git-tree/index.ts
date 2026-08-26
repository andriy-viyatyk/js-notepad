import { TComponentState } from "../../core/state/state";
import { GitTreeEditorModel, getDefaultGitTreeEditorState } from "./GitTreeEditorModel";
import { GitTreeEditorView } from "./GitTreeEditorView";
import { decodeGitTreeLink } from "../../content/git-tree-link";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

export const gitTreeModule: EditorModule = {
    createEditor: () =>
        new GitTreeEditorModel(new TComponentState(getDefaultGitTreeEditorState())),
    View: GitTreeEditorView,
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
};

export { GitTreeEditorModel, getDefaultGitTreeEditorState } from "./GitTreeEditorModel";
export type { GitTreeEditorState } from "./GitTreeEditorModel";

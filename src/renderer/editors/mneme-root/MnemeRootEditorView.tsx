import { TComponentState } from "../../core/state/state";
import { Panel } from "../../uikit/Panel";
import { Text } from "../../uikit/Text";
import {
    MnemeRootEditorModel,
    getDefaultMnemeRootEditorState,
    type MnemeRootEditorState,
} from "./MnemeRootEditorModel";
import { decodeMnemeFolderLink } from "../../content/mneme-folder-link";
import type { EditorModule } from "../types";
import type { EditorOrHost } from "../base";
import type { EditorType, IEditorState } from "../../../shared/types";

// =============================================================================
// Component — placeholder main view (the search view is a later task, US-663).
// The editor's real surface is its "Wiki" read-only tree secondary panel.
// =============================================================================

export function MnemeRootEditorView({ model }: { model: MnemeRootEditorModel }) {
    const rootName = model.state.use((s) => s.rootName);
    return (
        <Panel direction="column" flex={1} width="100%" align="center" justify="center" gap="xs">
            <Text size="lg" color="light">Mneme</Text>
            {rootName ? <Text size="sm" color="light">{rootName}</Text> : null}
        </Panel>
    );
}

// =============================================================================
// Legacy EditorModule default export — consumed by `buildEditorById`
// (navigatePageTo path) and session restore.
// =============================================================================

const mnemeRootEditorModule: EditorModule = {
    Editor: MnemeRootEditorView as unknown as EditorModule["Editor"],

    newEditorModel: async (filePath?: string) => {
        const model = new MnemeRootEditorModel(
            new TComponentState(getDefaultMnemeRootEditorState()),
        );
        if (filePath) {
            const link = decodeMnemeFolderLink(filePath);
            if (link) model.initFromRootFolder(link.rootFolder);
        }
        return model as unknown as EditorOrHost;
    },

    newEmptyEditorModel: async (editorType: EditorType) => {
        if (editorType !== "mnemeRootPage") return null;
        return new MnemeRootEditorModel(
            new TComponentState(getDefaultMnemeRootEditorState()),
        ) as unknown as EditorOrHost;
    },

    newEditorModelFromState: async (state: Partial<IEditorState>) => {
        const model = new MnemeRootEditorModel(
            new TComponentState({
                ...getDefaultMnemeRootEditorState(),
                ...(state as Partial<MnemeRootEditorState>),
            }),
        );
        // Session restore: rootFolder rides the persisted state — resolve now.
        model.restoreFromState();
        return model as unknown as EditorOrHost;
    },
};

export default mnemeRootEditorModule;

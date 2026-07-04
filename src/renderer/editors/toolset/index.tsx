import { TComponentState } from "../../core/state/state";
import { decodePersephoneToolsetLink } from "../../content/persephone-toolset-link";
import {
    ToolsetEditorModel,
    getDefaultToolsetEditorState,
    type ToolsetEditorState,
} from "./ToolsetEditorModel";
import { ToolsetEditorView } from "./ToolsetEditorView";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";
import type { EditorModule as LegacyEditorModule } from "../types";
import type { EditorOrHost } from "../base";
import type { EditorType, IEditorState } from "../../../shared/types";

function ToolsetEditorComponent({ model }: { model: EditorModel }) {
    return <ToolsetEditorView model={model as ToolsetEditorModel} />;
}

export const toolsetModule: EditorModule = {
    createEditor: () =>
        new ToolsetEditorModel(new TComponentState(getDefaultToolsetEditorState())),
    Component: ToolsetEditorComponent,
};

export { ToolsetEditorModel, getDefaultToolsetEditorState } from "./ToolsetEditorModel";
export type { ToolsetEditorState } from "./ToolsetEditorModel";

// =============================================================================
// Legacy EditorModule default export — consumed by `buildEditorById`
// (navigatePageTo path) and the registry `loadModule` safety-net / session
// restore. Mirrors `board/index.tsx`.
// =============================================================================

const toolsetEditorModule: LegacyEditorModule = {
    Editor: ToolsetEditorView as unknown as LegacyEditorModule["Editor"],

    newEditorModel: async (filePath?: string) => {
        const model = new ToolsetEditorModel(new TComponentState(getDefaultToolsetEditorState()));
        if (filePath) {
            // A toolset is opened by its own root path (persephone-toolset:// link, US-805).
            const link = decodePersephoneToolsetLink(filePath);
            if (link) model.initFromToolsetRoot(link.toolsetRoot);
        }
        return model as unknown as EditorOrHost;
    },

    newEmptyEditorModel: async (editorType: EditorType) => {
        // A toolset editor is never created empty (always from a root) — the "+ new page"
        // menu has no toolset entry. Return null for every type.
        if (editorType !== "toolsetPage") return null;
        return new ToolsetEditorModel(
            new TComponentState(getDefaultToolsetEditorState()),
        ) as unknown as EditorOrHost;
    },

    newEditorModelFromState: async (state: Partial<IEditorState>) => {
        const merged = {
            ...getDefaultToolsetEditorState(),
            ...(state as Partial<ToolsetEditorState>),
        };
        if (!merged.toolsetRoot) return null;
        const model = new ToolsetEditorModel(new TComponentState(merged));
        // Session restore: toolsetRoot rides the persisted state — re-read the manifest.
        await model.restore();
        return model as unknown as EditorOrHost;
    },
};

export default toolsetEditorModule;

import { TComponentState } from "../../core/state/state";
import { ToolsHubEditor, getDefaultToolsHubEditorState } from "./ToolsHubEditor";
import { ToolsHubEditorView } from "./ToolsHubView";
import type { EditorModule } from "../base/editorRegistry";

export const toolsHubModule: EditorModule = {
    createEditor: () =>
        new ToolsHubEditor(new TComponentState(getDefaultToolsHubEditorState())),
    View: ToolsHubEditorView,
};

export { ToolsHubEditor, getDefaultToolsHubEditorState, TOOLS_HUB_PAGE_ID } from "./ToolsHubEditor";
export type { ToolsHubEditorState, HubTab } from "./ToolsHubEditor";

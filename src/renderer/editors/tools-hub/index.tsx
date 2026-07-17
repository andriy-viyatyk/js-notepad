import { TComponentState } from "../../core/state/state";
import { ToolsHubEditor, getDefaultToolsHubEditorState } from "./ToolsHubEditor";
import { ToolsHubView } from "./ToolsHubView";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function ToolsHubEditorComponent({ model }: { model: EditorModel }) {
    return <ToolsHubView model={model as ToolsHubEditor} />;
}

export const toolsHubModule: EditorModule = {
    createEditor: () =>
        new ToolsHubEditor(new TComponentState(getDefaultToolsHubEditorState())),
    Component: ToolsHubEditorComponent,
};

export { ToolsHubEditor, getDefaultToolsHubEditorState, TOOLS_HUB_PAGE_ID } from "./ToolsHubEditor";
export type { ToolsHubEditorState, HubTab } from "./ToolsHubEditor";

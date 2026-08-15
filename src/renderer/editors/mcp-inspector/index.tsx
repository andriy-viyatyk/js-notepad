import { TComponentState } from "../../core/state/state";
import {
    McpInspectorEditorModel,
    getDefaultMcpInspectorEditorState,
} from "./McpInspectorEditorModel";
import { McpInspectorView } from "./McpInspectorView";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function McpInspectorEditorComponent({ model }: { model: EditorModel }) {
    return <McpInspectorView model={model as McpInspectorEditorModel} />;
}

export const mcpModule: EditorModule = {
    createEditor: () =>
        new McpInspectorEditorModel(new TComponentState(getDefaultMcpInspectorEditorState())),
    Component: McpInspectorEditorComponent,
};

export { McpInspectorEditorModel, getDefaultMcpInspectorEditorState } from "./McpInspectorEditorModel";
export type {
    McpInspectorEditorState, McpPanelId,
    McpToolInfo, McpToolResult, McpToolsPanelState,
    McpResourceInfo, McpResourceContent, McpResourcesPanelState,
    McpPromptInfo, McpPromptMessage, McpPromptsPanelState,
} from "./McpInspectorEditorModel";

import { TComponentState } from "../../core/state/state";
import {
    McpInspectorEditorModel,
    getDefaultMcpInspectorEditorState,
} from "./McpInspectorEditorModel";
import { McpInspectorEditorView } from "./McpInspectorView";
import type { EditorModule } from "../base/editorRegistry";

export const mcpModule: EditorModule = {
    createEditor: () =>
        new McpInspectorEditorModel(new TComponentState(getDefaultMcpInspectorEditorState())),
    View: McpInspectorEditorView,
};

export { McpInspectorEditorModel, getDefaultMcpInspectorEditorState } from "./McpInspectorEditorModel";
export type {
    McpInspectorEditorState, McpPanelId,
    McpToolInfo, McpToolResult, McpToolsPanelState,
    McpResourceInfo, McpResourceContent, McpResourcesPanelState,
    McpPromptInfo, McpPromptMessage, McpPromptsPanelState,
} from "./McpInspectorEditorModel";

import { TComponentState } from "../../core/state/state";
import {
    McpInspectorEditorModel,
    getDefaultMcpInspectorEditorState,
} from "./McpInspectorEditorModel";
import { McpInspectorView } from "./McpInspectorView";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

/**
 * EPIC-028 / US-574 — native MCP Inspector editor module. Registered with the
 * v4 `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor` when
 * the page's `mainEditorInstance` is a v4-native McpInspectorEditorModel instance.
 *
 * MCP Inspector is NO-HOST (no `CONTENT_HOST_TRAIT`) and standalone (no file
 * acceptance) — `Component` is the full inspector. No `<TextChrome>` wrap.
 */

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
// Legacy EditorModule default-export — consumed by `showMcpInspectorPage` and
// the legacy `editorRegistry` `loadModule` safety-net.
export { default as mcpInspectorEditorModule, default } from "./McpInspectorView";

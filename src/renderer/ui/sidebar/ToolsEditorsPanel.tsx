import React from "react";
import { mountVanilla } from "../../uikit/shared/mount";
import {
    ToolsEditorsPanelView,
    type ToolsEditorsPanelProps,
} from "./ToolsEditorsPanelView";

export type { ToolsEditorsPanelProps } from "./ToolsEditorsPanelView";

export function ToolsEditorsPanel(props: ToolsEditorsPanelProps): React.ReactElement {
    return mountVanilla(ToolsEditorsPanelView, props);
}

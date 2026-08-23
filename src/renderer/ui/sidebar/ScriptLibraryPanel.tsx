import React from "react";
import { mountVanilla } from "../../uikit/shared/mount";
import { ScriptLibraryPanelView, type ScriptLibraryPanelProps } from "./ScriptLibraryPanelView";

export type { ScriptLibraryPanelProps } from "./ScriptLibraryPanelView";

export function ScriptLibraryPanel(props: ScriptLibraryPanelProps): React.ReactElement {
    return mountVanilla(ScriptLibraryPanelView, props);
}

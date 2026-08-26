import React from "react";
import { mountVanilla } from "../../uikit/shared/mount";
import { EditorToolbarView } from "./EditorToolbarView";

export interface EditorToolbarProps {
    name?: string;
    borderTop?: boolean;
    borderBottom?: boolean;
    children?: React.ReactNode;
}

export function EditorToolbar(props: EditorToolbarProps): React.ReactElement {
    return mountVanilla(EditorToolbarView, props);
}

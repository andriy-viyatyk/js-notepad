import React from "react";
import { mountVanilla } from "../../uikit/shared/mount";
import type { SlotContent } from "../../uikit/shared/fill-slot";
import { EditorToolbarView } from "./EditorToolbarView";

export interface EditorToolbarProps {
    name?: string;
    borderTop?: boolean;
    borderBottom?: boolean;
    children?: SlotContent;
}

export function EditorToolbar(props: EditorToolbarProps): React.ReactElement {
    return mountVanilla(EditorToolbarView, props);
}

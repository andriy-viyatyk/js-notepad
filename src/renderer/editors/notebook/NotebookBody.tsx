import type React from "react";
import { mountVanilla } from "../../uikit/shared/mount";
import { NotebookBodyView } from "./NotebookBodyView";
import { NotebookEditor } from "./NotebookEditor";

export interface NotebookBodyProps {
    model: NotebookEditor;
}

export function NotebookBody(props: NotebookBodyProps): React.ReactElement {
    return mountVanilla(NotebookBodyView, props);
}

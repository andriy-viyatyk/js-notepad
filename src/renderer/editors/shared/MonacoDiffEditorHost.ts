import { mountVanilla } from "../../uikit/shared/mount";
import { MonacoDiffEditorHostView } from "./MonacoDiffEditorHostView";
import type { MonacoDiffEditorHostProps } from "./MonacoDiffEditorHostView";

export type { MonacoDiffEditorHostProps } from "./MonacoDiffEditorHostView";

export function MonacoDiffEditorHost(props: MonacoDiffEditorHostProps) {
    return mountVanilla(MonacoDiffEditorHostView, props);
}

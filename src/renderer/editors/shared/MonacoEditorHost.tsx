import { mountVanilla } from "../../uikit/shared/mount";
import { MonacoEditorHostView } from "./MonacoEditorHostView";
import type { MonacoEditorHostProps } from "./MonacoEditorHostView";

export type { MonacoEditorHostProps } from "./MonacoEditorHostView";

export function MonacoEditorHost(props: MonacoEditorHostProps) {
    return mountVanilla(MonacoEditorHostView, props);
}

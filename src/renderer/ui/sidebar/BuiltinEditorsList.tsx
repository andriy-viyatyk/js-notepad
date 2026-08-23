import React from "react";
import { mountVanilla } from "../../uikit/shared/mount";
import {
    BuiltinEditorsListView,
    type BuiltinEditorsListProps,
} from "./BuiltinEditorsListView";

export type { BuiltinEditorsListProps } from "./BuiltinEditorsListView";

export function BuiltinEditorsList(props: BuiltinEditorsListProps): React.ReactElement {
    return mountVanilla(BuiltinEditorsListView, props);
}

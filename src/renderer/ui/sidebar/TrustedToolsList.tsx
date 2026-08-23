import React from "react";
import { mountVanilla } from "../../uikit/shared/mount";
import {
    TrustedToolsListView,
    type TrustedToolsListProps,
} from "./TrustedToolsListView";

export type { TrustedToolsListProps } from "./TrustedToolsListView";

export function TrustedToolsList(props: TrustedToolsListProps): React.ReactElement {
    return mountVanilla(TrustedToolsListView, props);
}

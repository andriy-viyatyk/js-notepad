import React from "react";
import { mountVanilla } from "../../uikit/shared/mount";
import { OpenTabsListView, type OpenTabsListProps } from "./OpenTabsListView";

export type { OpenTabsListProps } from "./OpenTabsListView";

export function OpenTabsList(props: OpenTabsListProps): React.ReactElement {
    return mountVanilla(OpenTabsListView, props);
}

import React from "react";
import { mountVanilla } from "../../uikit/shared/mount";
import { RecentFileListView, type RecentFileListProps } from "./RecentFileListView";

export type { RecentFileListProps } from "./RecentFileListView";

export function RecentFileList(props: RecentFileListProps): React.ReactElement {
    return mountVanilla(RecentFileListView, props);
}

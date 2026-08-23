import React from "react";
import { mountVanilla } from "../../uikit/shared/mount";
import { FolderItemView, type FolderItemProps } from "./FolderItemView";

export type { FolderItemProps } from "./FolderItemView";

export function FolderItem(props: FolderItemProps): React.ReactElement {
    return mountVanilla(FolderItemView, props);
}

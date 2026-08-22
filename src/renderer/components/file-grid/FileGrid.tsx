import type React from "react";
import { mountVanilla } from "../../uikit/shared/mount";
import type { CellRenderer } from "../../uikit/DataGrid";
import type { MenuItem } from "../../uikit/Menu";
import { FileGridView } from "./FileGridView";

export interface FileGridItem {
    filePath: string;
    title: string;
    status?: string;
    isFolder?: boolean;
}

export interface FileGridProps {
    name?: string;
    items: FileGridItem[];
    label?: string;
    onClick?: (item: FileGridItem) => void;
    onDoubleClick?: (item: FileGridItem) => void;
    onSelectionChange?: (items: FileGridItem[]) => void;
    getTrailing?: CellRenderer<FileGridItem>;
    getContextMenuItems?: (items: FileGridItem[]) => MenuItem[];
    compact?: boolean;
}

export function FileGrid(props: FileGridProps): React.ReactElement {
    return mountVanilla(FileGridView, props);
}

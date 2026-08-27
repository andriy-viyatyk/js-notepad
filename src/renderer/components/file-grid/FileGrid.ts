import type { CellRenderer } from "../../uikit/DataGrid";
import type { MenuItem } from "../../uikit/Menu";

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

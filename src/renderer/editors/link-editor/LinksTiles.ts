import type { ILink } from "../../api/types/io.tree";
import type { IconName } from "../../theme/icon-registry";
import type { GridModelCapability } from "../../uikit/DataGrid";
import type { TorProxyInfo } from "./tor-src";
import type { LinkViewMode } from "./linkTypes";

export interface LinksTilesProps {
    links: ILink[];
    viewMode: Exclude<LinkViewMode, "list">;
    selectedId?: string;
    selectedIds?: ReadonlySet<string>;
    getId?: (link: ILink) => string;
    onSelect?: (link: ILink, event?: MouseEvent) => void;
    onEdit?: (link: ILink) => void;
    onDelete?: (link: ILink, skipConfirm: boolean) => void;
    onDoubleClick?: (link: ILink) => void;
    onContextMenu?: (event: MouseEvent, link: ILink) => void;
    getAdditionalIcon?: (link: ILink) => IconName | undefined;
    dragSourceId?: string;
    onDragStartOverride?: (link: ILink, event: DragEvent) => boolean;
    imageProxy?: TorProxyInfo | null;
    onGridModel?: (model: GridModelCapability | null) => void;
    onItemDragEnter?: (link: ILink, event: DragEvent) => void;
    onItemDragOver?: (link: ILink, event: DragEvent) => void;
    onItemDragLeave?: (link: ILink, event: DragEvent) => void;
    onItemDrop?: (link: ILink, event: DragEvent) => void;
    dropTargetId?: string | null;
}

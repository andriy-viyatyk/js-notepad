import type React from "react";
import type { ILink } from "../../api/types/io.tree";
import type { IconName } from "../../theme/icon-registry";
import type { GridModelCapability } from "../../uikit/VirtualGrid/types";
import { mountVanilla } from "../../uikit/shared/mount";
import { LinkViewMode } from "./linkTypes";
import { LinksTilesView } from "./LinksTilesView";
import type { TorProxyInfo } from "./tor-src";

export interface LinksTilesProps {
    links: ILink[];
    viewMode: Exclude<LinkViewMode, "list">;
    selectedId?: string;
    /** Multi-selection. When set it replaces `selectedId` as the source of the per-tile
     *  selected state, and `onSelect` receives the click event so the consumer can
     *  implement Ctrl/Shift gestures. The consumer owns the set. */
    selectedIds?: ReadonlySet<string>;
    /** Extract ID from a link for selection matching. Defaults to link.id ?? link.href. */
    getId?: (link: ILink) => string;
    onSelect?: (link: ILink, e?: React.MouseEvent) => void;
    onEdit?: (link: ILink) => void;
    onDelete?: (link: ILink, skipConfirm: boolean) => void;
    /** Override double-click behavior. When not set, double-click calls onEdit. */
    onDoubleClick?: (link: ILink) => void;
    onContextMenu?: (e: React.MouseEvent, link: ILink) => void;
    /** Callback to get an additional registry icon for a tile (e.g., pin indicator). */
    getAdditionalIcon?: (link: ILink) => IconName | undefined;
    /** Enable drag. When set, items are draggable with this sourceId in drag payload. */
    dragSourceId?: string;
    /** First chance to take over the gesture (native OS file drag). Return true to suppress the
     *  in-process trait drag entirely. */
    onDragStartOverride?: (link: ILink, e: React.DragEvent) => boolean;
    /** US-896 - Tor session to fetch remote images through, when on a Tor page. */
    imageProxy?: TorProxyInfo | null;
    /** Called with the grid capability on mount, null on unmount. */
    onGridModel?: (model: GridModelCapability | null) => void;
    /** Tile drop targets. Raw DragEvents are forwarded untouched - the consumer owns the whole
     *  policy. Leave unset and tiles are not drop targets at all. */
    onItemDragEnter?: (link: ILink, e: React.DragEvent) => void;
    onItemDragOver?: (link: ILink, e: React.DragEvent) => void;
    onItemDragLeave?: (link: ILink, e: React.DragEvent) => void;
    onItemDrop?: (link: ILink, e: React.DragEvent) => void;
    /** Id (per `getId`) of the tile currently under a drag. */
    dropTargetId?: string | null;
}

export function LinksTiles(props: LinksTilesProps): React.ReactElement {
    return mountVanilla(LinksTilesView, props);
}

import type React from "react";
import type { ILink } from "../../api/types/io.tree";
import type { IconName } from "../../theme/icon-registry";
import type { GridModelCapability } from "../../uikit/VirtualGrid";
import { mountVanilla } from "../../uikit/shared/mount";
import { LinksListView } from "./LinksListView";
import type { TorProxyInfo } from "./tor-src";

export interface LinksListProps {
    links: ILink[];
    selectedId?: string;
    /** Multi-selection. When set it replaces `selectedId` as the source of the per-row
     *  selected state, and `onSelect` receives the click event so the consumer can
     *  implement Ctrl/Shift gestures. The consumer owns the set; this component derives
     *  nothing and stores nothing. */
    selectedIds?: ReadonlySet<string>;
    /** Extract ID from a link for selection matching. Defaults to link.id ?? link.href. */
    getId?: (link: ILink) => string;
    searchText?: string;
    onSelect?: (link: ILink, e?: React.MouseEvent) => void;
    onEdit?: (link: ILink) => void;
    onDelete?: (link: ILink, skipConfirm: boolean) => void;
    /** Override double-click behavior. When not set, double-click calls onEdit. */
    onDoubleClick?: (link: ILink) => void;
    onContextMenu?: (e: React.MouseEvent, link: ILink) => void;
    /** Callback to get an additional registry icon for a link row (e.g., pin indicator). */
    getAdditionalIcon?: (link: ILink) => IconName | undefined;
    /** Enable drag. When set, items are draggable with this sourceId in drag payload. */
    dragSourceId?: string;
    /** First chance to take over the gesture (native OS file drag). Return true to suppress the
     *  in-process trait drag entirely. */
    onDragStartOverride?: (link: ILink, e: React.DragEvent) => boolean;
    /** All available tags for inline tag editing in tooltip. */
    allTags?: string[];
    /** Toggle a tag on a link (add if absent, remove if present). */
    onToggleTag?: (link: ILink, tag: string) => void;
    /** US-896 - Tor session for the tooltip's preview image, on a Tor page. */
    imageProxy?: TorProxyInfo | null;
    /** Called with the grid capability on mount, null on unmount. */
    onGridModel?: (model: GridModelCapability | null) => void;
    /** Row drop targets. Raw DragEvents are forwarded untouched - the consumer owns the whole
     *  policy (whether to accept, the dropEffect, preventDefault/stopPropagation), because
     *  acceptance depends on the drag payload and on the provider, neither of which this
     *  component knows about. Leave unset and rows are not drop targets at all. */
    onItemDragEnter?: (link: ILink, e: React.DragEvent) => void;
    onItemDragOver?: (link: ILink, e: React.DragEvent) => void;
    onItemDragLeave?: (link: ILink, e: React.DragEvent) => void;
    onItemDrop?: (link: ILink, e: React.DragEvent) => void;
    /** Id (per `getId`) of the row currently under a drag, painted as the drop target. */
    dropTargetId?: string | null;
}

export function LinksList(props: LinksListProps): React.ReactElement {
    return mountVanilla(LinksListView, props);
}

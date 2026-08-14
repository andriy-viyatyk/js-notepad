import React, { useCallback, useImperativeHandle, useRef, useState } from "react";
import { RenderGrid, RenderGridModel } from "../../uikit/RenderGrid";
import type { RenderCellParams, RenderSizeOptional } from "../../uikit/RenderGrid";
import { IconButton, ListItem, Panel } from "../../uikit";
import { highlight } from "../../uikit/shared/highlight";
import { DeleteIcon, RenameIcon } from "../../theme/icons";
import type { ILink } from "../../api/types/io.tree";
import { TreeProviderItemIcon } from "../../components/tree-provider/TreeProviderItemIcon";
import { LinkTooltipContent } from "./LinkTooltip";
import { useFavicons } from "../../components/tree-provider/favicon-cache";
import { TraitTypeId, setTraitDragData } from "../../core/traits";
import type { TorProxyInfo } from "./tor-src";

const ROW_HEIGHT = 24;

const defaultGetId = (link: ILink) => link.id ?? link.href;

// =============================================================================
// Link Row
// =============================================================================

interface LinksListRowProps {
    link: ILink;
    isSelected: boolean;
    isDropTarget: boolean;
    searchText: string;
    additionalIcon?: React.ReactNode;
    /** When set, row is draggable. Value is used as sourceId in drag payload. */
    dragSourceId?: string;
    /** First chance to take over the gesture — return true when the app started a drag of its
     *  own (e.g. a native OS file drag) and the trait payload must NOT be set. */
    onDragStartOverride?: (link: ILink, e: React.DragEvent) => boolean;
    allTags?: string[];
    /** US-896 — Tor session for the tooltip's preview image, on a Tor page. */
    imageProxy?: TorProxyInfo | null;
    /** The click event is forwarded so a consumer can read ctrlKey / shiftKey for
     *  multi-selection. Omitted by the row's own action buttons, which always mean
     *  "this row" — see LinksListProps.selectedIds. */
    onSelect?: (link: ILink, e?: React.MouseEvent) => void;
    onEdit?: (link: ILink) => void;
    onDelete?: (link: ILink, skipConfirm: boolean) => void;
    onDoubleClick?: (link: ILink) => void;
    onContextMenu?: (e: React.MouseEvent, link: ILink) => void;
    onToggleTag?: (link: ILink, tag: string) => void;
    onDragEnter?: (link: ILink, e: React.DragEvent) => void;
    onDragOver?: (link: ILink, e: React.DragEvent) => void;
    onDragLeave?: (link: ILink, e: React.DragEvent) => void;
    onDrop?: (link: ILink, e: React.DragEvent) => void;
}

function LinksListRow({
    link, isSelected, isDropTarget, searchText, additionalIcon,
    dragSourceId, onDragStartOverride,
    allTags, imageProxy, onSelect, onEdit, onDelete, onDoubleClick, onContextMenu, onToggleTag,
    onDragEnter, onDragOver, onDragLeave, onDrop,
}: LinksListRowProps) {
    const [isDragging, setIsDragging] = useState(false);

    const handleDragStart = useCallback((e: React.DragEvent) => {
        if (!dragSourceId) { e.preventDefault(); return; }
        e.stopPropagation(); // Prevent parent elements from interfering with this drag
        // First chance: the app may replace the gesture with a native OS drag. It gets no
        // `dragend`, so the row must not enter its dragging (dimmed) state either.
        if (onDragStartOverride?.(link, e)) return;
        setTraitDragData(e.dataTransfer, TraitTypeId.ILink, {
            items: [link],
            sourceId: dragSourceId,
        });
        setIsDragging(true);
    }, [link, dragSourceId, onDragStartOverride]);

    const handleDragEnd = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleDoubleClick = onDoubleClick
        ? () => onDoubleClick(link)
        : onEdit ? () => onEdit(link) : undefined;

    // Folder rows are search targets in LinkViewModel.applyFilters — preserve highlighting AND
    // the legacy bold weight via a pre-built ReactNode label. Pass searchText={undefined} to
    // ListItem for folders so it doesn't try to re-highlight the ReactNode.
    const labelText = link.title || "Untitled";
    const label: React.ReactNode = link.isDirectory ? (
        <span style={{ fontWeight: 500 }}>
            {searchText ? highlight(labelText, searchText) : labelText}
        </span>
    ) : labelText;

    const trailing = (onEdit || onDelete || additionalIcon) ? (
        <span style={{ display: "flex", gap: 2, alignItems: "center", flexShrink: 0 }}>
            {additionalIcon && (
                <span style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                    {additionalIcon}
                </span>
            )}
            {onEdit && (
                <IconButton
                    name="link-row-edit"
                    size="sm"
                    title="Edit"
                    icon={<RenameIcon />}
                    hideUntilParentHover
                    onClick={(e) => {
                        e.stopPropagation();
                        onSelect?.(link);
                        onEdit(link);
                    }}
                />
            )}
            {onDelete && (
                <IconButton
                    name="link-row-delete"
                    size="sm"
                    title="Delete"
                    icon={<DeleteIcon />}
                    hideUntilParentHover
                    onClick={(e) => {
                        e.stopPropagation();
                        onSelect?.(link);
                        onDelete(link, e.ctrlKey);
                    }}
                />
            )}
        </span>
    ) : undefined;

    return (
        <div style={{ flex: 1, minWidth: 0, display: "flex", opacity: isDragging ? 0.4 : undefined }}>
            <Panel
                name="link-row-wrapper"
                revealChildrenOnHover
                flex={1}
                minWidth={0}
                overflow="hidden"
                position="relative"
            >
                <ListItem
                    name="link-row"
                    variant="browse"
                    selectionStyle="focus"
                    showSelectionIcon={false}
                    selected={isSelected}
                    dropActive={isDropTarget}
                    searchText={link.isDirectory ? undefined : searchText}
                    icon={<TreeProviderItemIcon item={link} />}
                    label={label}
                    tooltip={<LinkTooltipContent link={link} allTags={allTags} onToggleTag={onToggleTag} imageProxy={imageProxy} />}
                    tooltipDelayShow={1200}
                    trailing={trailing}
                    draggable={!!dragSourceId}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragEnter={onDragEnter ? (e) => onDragEnter(link, e) : undefined}
                    onDragOver={onDragOver ? (e) => onDragOver(link, e) : undefined}
                    onDragLeave={onDragLeave ? (e) => onDragLeave(link, e) : undefined}
                    onDrop={onDrop ? (e) => onDrop(link, e) : undefined}
                    onClick={(e) => onSelect?.(link, e)}
                    onDoubleClick={handleDoubleClick}
                    onContextMenu={(e) => onContextMenu?.(e, link)}
                />
            </Panel>
        </div>
    );
}

// =============================================================================
// Component
// =============================================================================

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
    /** Callback to get additional icon for a link row (e.g., pin indicator). */
    getAdditionalIcon?: (link: ILink) => React.ReactNode;
    /** Enable drag. When set, items are draggable with this sourceId in drag payload. */
    dragSourceId?: string;
    /** First chance to take over the gesture (native OS file drag). Return true to suppress the
     *  in-process trait drag entirely. */
    onDragStartOverride?: (link: ILink, e: React.DragEvent) => boolean;
    /** All available tags for inline tag editing in tooltip. */
    allTags?: string[];
    /** Toggle a tag on a link (add if absent, remove if present). */
    onToggleTag?: (link: ILink, tag: string) => void;
    /** US-896 — Tor session for the tooltip's preview image, on a Tor page. */
    imageProxy?: TorProxyInfo | null;
    /** Called with the RenderGridModel on mount, null on unmount. */
    onGridModel?: (model: RenderGridModel | null) => void;
    /** Row drop targets. Raw DragEvents are forwarded untouched — the consumer owns the whole
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

export const LinksList = React.forwardRef<RenderGridModel, LinksListProps>(function LinksList({
    links, selectedId, selectedIds, getId = defaultGetId, searchText = "",
    onSelect, onEdit, onDelete, onDoubleClick, onContextMenu,
    getAdditionalIcon, dragSourceId, onDragStartOverride,
    allTags, imageProxy, onToggleTag, onGridModel,
    onItemDragEnter, onItemDragOver, onItemDragLeave, onItemDrop, dropTargetId,
}: LinksListProps, ref: React.ForwardedRef<RenderGridModel>) {
    const gridRef = useRef<RenderGridModel>(null);
    const [gridWidth, setGridWidth] = useState<number | undefined>(undefined);
    const faviconVersion = useFavicons(links);

    useImperativeHandle(ref, () => gridRef.current, []);

    // Expose grid model to parent
    const gridModelNotified = useRef(false);
    if (gridRef.current && !gridModelNotified.current) {
        gridModelNotified.current = true;
        onGridModel?.(gridRef.current);
    }

    const handleResize = useCallback((size: RenderSizeOptional) => {
        setGridWidth(size.width);
    }, []);

    const columnWidth = useCallback(() => gridWidth ?? 400, [gridWidth]);

    const renderCell = useCallback(
        (p: RenderCellParams) => {
            const link = links[p.row];
            if (!link) return null;
            return (
                <div
                    key={p.key}
                    style={{
                        ...p.style,
                        boxSizing: "border-box",
                        padding: "0 4px",
                        display: "flex",
                        alignItems: "stretch",
                    }}
                >
                    <LinksListRow
                        link={link}
                        isSelected={selectedIds
                            ? selectedIds.has(getId(link))
                            : getId(link) === selectedId}
                        isDropTarget={!!dropTargetId && getId(link) === dropTargetId}
                        searchText={searchText}
                        additionalIcon={getAdditionalIcon?.(link)}
                        dragSourceId={dragSourceId}
                        onDragStartOverride={onDragStartOverride}
                        allTags={allTags}
                        imageProxy={imageProxy}
                        onSelect={onSelect}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onDoubleClick={onDoubleClick}
                        onContextMenu={onContextMenu}
                        onToggleTag={onToggleTag}
                        onDragEnter={onItemDragEnter}
                        onDragOver={onItemDragOver}
                        onDragLeave={onItemDragLeave}
                        onDrop={onItemDrop}
                    />
                </div>
            );
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps -- faviconVersion bumps on favicon load to force re-render of cells (no direct read in body)
        [links, selectedId, selectedIds, dropTargetId, getId, searchText, getAdditionalIcon,
         dragSourceId, onDragStartOverride, allTags,
         imageProxy, onSelect, onEdit, onDelete, onDoubleClick, onContextMenu, onToggleTag,
         onItemDragEnter, onItemDragOver, onItemDragLeave, onItemDrop,
         faviconVersion],
    );

    return (
        <Panel
            name="links-list-focus-scope"
            direction="column"
            flex={1}
            minWidth={0}
            minHeight={0}
            overflow="hidden"
            tabIndex={0}
            data-focus-selection=""
        >
            <RenderGrid
                ref={gridRef}
                rowCount={links.length}
                columnCount={1}
                rowHeight={ROW_HEIGHT}
                columnWidth={columnWidth}
                renderCell={renderCell}
                fitToWidth
                onResize={handleResize}
            />
        </Panel>
    );
});

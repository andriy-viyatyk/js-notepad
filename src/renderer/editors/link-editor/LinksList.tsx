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

const ROW_HEIGHT = 24;

const defaultGetId = (link: ILink) => link.id ?? link.href;

// =============================================================================
// Link Row
// =============================================================================

interface LinksListRowProps {
    link: ILink;
    isSelected: boolean;
    searchText: string;
    additionalIcon?: React.ReactNode;
    /** When set, row is draggable. Value is used as sourceId in drag payload. */
    dragSourceId?: string;
    allTags?: string[];
    onSelect?: (link: ILink) => void;
    onEdit?: (link: ILink) => void;
    onDelete?: (link: ILink, skipConfirm: boolean) => void;
    onDoubleClick?: (link: ILink) => void;
    onContextMenu?: (e: React.MouseEvent, link: ILink) => void;
    onToggleTag?: (link: ILink, tag: string) => void;
}

function LinksListRow({
    link, isSelected, searchText, additionalIcon,
    dragSourceId, allTags, onSelect, onEdit, onDelete, onDoubleClick, onContextMenu, onToggleTag,
}: LinksListRowProps) {
    const [isDragging, setIsDragging] = useState(false);

    const handleDragStart = useCallback((e: React.DragEvent) => {
        if (!dragSourceId) { e.preventDefault(); return; }
        e.stopPropagation(); // Prevent parent elements from interfering with this drag
        setTraitDragData(e.dataTransfer, TraitTypeId.ILink, { items: [link], sourceId: dragSourceId });
        setIsDragging(true);
    }, [link, dragSourceId]);

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
                    searchText={link.isDirectory ? undefined : searchText}
                    icon={<TreeProviderItemIcon item={link} />}
                    label={label}
                    tooltip={<LinkTooltipContent link={link} allTags={allTags} onToggleTag={onToggleTag} />}
                    tooltipDelayShow={1200}
                    trailing={trailing}
                    draggable={!!dragSourceId}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onClick={() => onSelect?.(link)}
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
    /** Extract ID from a link for selection matching. Defaults to link.id ?? link.href. */
    getId?: (link: ILink) => string;
    searchText?: string;
    onSelect?: (link: ILink) => void;
    onEdit?: (link: ILink) => void;
    onDelete?: (link: ILink, skipConfirm: boolean) => void;
    /** Override double-click behavior. When not set, double-click calls onEdit. */
    onDoubleClick?: (link: ILink) => void;
    onContextMenu?: (e: React.MouseEvent, link: ILink) => void;
    /** Callback to get additional icon for a link row (e.g., pin indicator). */
    getAdditionalIcon?: (link: ILink) => React.ReactNode;
    /** Enable drag. When set, items are draggable with this sourceId in drag payload. */
    dragSourceId?: string;
    /** All available tags for inline tag editing in tooltip. */
    allTags?: string[];
    /** Toggle a tag on a link (add if absent, remove if present). */
    onToggleTag?: (link: ILink, tag: string) => void;
    /** Called with the RenderGridModel on mount, null on unmount. */
    onGridModel?: (model: RenderGridModel | null) => void;
}

export const LinksList = React.forwardRef<RenderGridModel, LinksListProps>(function LinksList({
    links, selectedId, getId = defaultGetId, searchText = "",
    onSelect, onEdit, onDelete, onDoubleClick, onContextMenu,
    getAdditionalIcon, dragSourceId, allTags, onToggleTag, onGridModel,
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
                        isSelected={getId(link) === selectedId}
                        searchText={searchText}
                        additionalIcon={getAdditionalIcon?.(link)}
                        dragSourceId={dragSourceId}
                        allTags={allTags}
                        onSelect={onSelect}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onDoubleClick={onDoubleClick}
                        onContextMenu={onContextMenu}
                        onToggleTag={onToggleTag}
                    />
                </div>
            );
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps -- faviconVersion bumps on favicon load to force re-render of cells (no direct read in body)
        [links, selectedId, getId, searchText, getAdditionalIcon, dragSourceId, allTags,
         onSelect, onEdit, onDelete, onDoubleClick, onContextMenu, onToggleTag, faviconVersion],
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RenderGrid, RenderGridModel } from "../../uikit/RenderGrid";
import type { RenderCellParams, RenderSizeOptional } from "../../uikit/RenderGrid";
import { IconButton, Panel } from "../../uikit";
import color from "../../theme/color";
import { DeleteIcon, GlobeIcon, RenameIcon } from "../../theme/icons";
import type { ILink } from "../../api/types/io.tree";
import { LinkViewMode } from "./linkTypes";
import { TraitTypeId, setTraitDragData } from "../../core/traits";
import { getHostname, getFaviconPathSync, useFavicons } from "../../components/tree-provider/favicon-cache";
import { resolveTorSrc, type TorProxyInfo } from "./tor-src";
import { usePipeImageSrc } from "./pipe-image-src";

// =============================================================================
// Tile dimensions per view mode
// =============================================================================

interface TileDimensions {
    cellWidth: number;
    cellHeight: number;
    imageHeight: number;
}

const TILE_DIMENSIONS: Record<Exclude<LinkViewMode, "list">, TileDimensions> = {
    "tiles-landscape":     { cellWidth: 252, cellHeight: 192, imageHeight: 144 },
    "tiles-landscape-big": { cellWidth: 372, cellHeight: 276, imageHeight: 216 },
    "tiles-portrait":      { cellWidth: 168, cellHeight: 276, imageHeight: 216 },
    "tiles-portrait-big":  { cellWidth: 252, cellHeight: 408, imageHeight: 336 },
};

const defaultGetId = (link: ILink) => link.id ?? link.href;

// =============================================================================
// Tile Cell
// =============================================================================

interface LinksTileCellProps {
    link: ILink;
    isSelected: boolean;
    imageHeight: number;
    additionalIcon?: React.ReactNode;
    /** When set, tile is draggable. Value is used as sourceId in drag payload. */
    dragSourceId?: string;
    /** US-896 — Tor session to fetch remote images through, when on a Tor page. */
    imageProxy?: TorProxyInfo | null;
    onSelect?: (link: ILink) => void;
    onEdit?: (link: ILink) => void;
    onDelete?: (link: ILink, skipConfirm: boolean) => void;
    onDoubleClick?: (link: ILink) => void;
    onContextMenu?: (e: React.MouseEvent, link: ILink) => void;
}

function LinksTileCell({
    link, isSelected, imageHeight, additionalIcon,
    dragSourceId, imageProxy, onSelect, onEdit, onDelete, onDoubleClick, onContextMenu,
}: LinksTileCellProps) {
    const [isDragging, setIsDragging] = useState(false);
    // Remembering the failed URL (rather than a bool) self-resets when the link's
    // image or its Tor routing changes — no effect needed.
    const [failedSrc, setFailedSrc] = useState<string | null>(null);

    // Archive entries (`archive.zip!inner/img.png`) are unloadable by the DOM and resolve
    // to a blob URL read through a content pipe — null until that read lands, so the tile
    // shows its fallback glyph meanwhile. Every other shape passes through untouched.
    // Runs BEFORE the Tor rewrite so the resulting `blob:` is seen as local and is never
    // routed through the proxy.
    const pipedSrc = usePipeImageSrc(link.imgSrc);
    // US-896 — null when the image must not be loaded (Tor page, Tor not up).
    const imageSrc = resolveTorSrc(pipedSrc ?? undefined, imageProxy);
    const showImage = !!imageSrc && imageSrc !== failedSrc;

    const handleDragStart = useCallback((e: React.DragEvent) => {
        if (!dragSourceId) { e.preventDefault(); return; }
        e.stopPropagation();
        setTraitDragData(e.dataTransfer, TraitTypeId.ILink, { items: [link], sourceId: dragSourceId });
        setIsDragging(true);
    }, [link, dragSourceId]);

    const handleDragEnd = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleDoubleClick = onDoubleClick
        ? () => onDoubleClick(link)
        : onEdit ? () => onEdit(link) : undefined;

    return (
        <div
            draggable={!!dragSourceId}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onClick={() => onSelect?.(link)}
            onDoubleClick={handleDoubleClick}
            onContextMenu={(e) => onContextMenu?.(e, link)}
            title={link.href || link.title}
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                opacity: isDragging ? 0.4 : undefined,
                cursor: "default",
            }}
        >
            <Panel
                name="link-tile"
                revealChildrenOnHover
                direction="column"
                flex={1}
                overflow="hidden"
                position="relative"
                rounded="lg"
                border
                borderColor={isSelected ? "active" : "subtle"}
            >
                <div
                    style={{
                        height: imageHeight,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                        ...(showImage ? {} : { color: color.text.light, fontSize: 12 }),
                    }}
                >
                    {showImage ? (
                        <img
                            src={imageSrc}
                            alt={link.title}
                            loading="lazy"
                            onError={() => setFailedSrc(imageSrc)}
                            style={{
                                maxWidth: "calc(100% - 8px)",
                                maxHeight: "calc(100% - 8px)",
                                objectFit: "contain",
                                margin: 4,
                            }}
                        />
                    ) : (() => {
                        const fp = getFaviconPathSync(getHostname(link.href));
                        return fp
                            ? <img src={`file://${fp}`} alt="" />
                            : <GlobeIcon style={{ width: 32, height: 32, opacity: 0.3 }} />;
                    })()}
                </div>
                <div
                    style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        padding: "4px 4px 4px 8px",
                        fontSize: 12,
                        color: color.text.default,
                        overflow: "hidden",
                    }}
                >
                    <span
                        style={{
                            flex: 1,
                            overflow: "hidden",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            textOverflow: "ellipsis",
                            minWidth: 0,
                            wordBreak: "break-word",
                        }}
                    >
                        {link.title || "Untitled"}
                    </span>
                </div>
                {additionalIcon && (
                    <span
                        style={{
                            position: "absolute",
                            top: 4,
                            left: 4,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 2,
                            backgroundColor: color.background.overlay,
                            border: `1px solid ${color.border.default}`,
                            borderRadius: 6,
                            opacity: 0.8,
                            pointerEvents: "none",
                        }}
                    >
                        {additionalIcon}
                    </span>
                )}
                {(onEdit || onDelete) && (
                    <Panel
                        name="link-tile-actions"
                        position="absolute"
                        top={4}
                        right={4}
                        gap="xs"
                    >
                        {onEdit && (
                            <IconButton
                                name="link-tile-edit"
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
                                name="link-tile-delete"
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
                    </Panel>
                )}
                {isSelected && (
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            backgroundColor: color.background.selection,
                            opacity: 0.3,
                            pointerEvents: "none",
                        }}
                    />
                )}
            </Panel>
        </div>
    );
}

// =============================================================================
// Component
// =============================================================================

export interface LinksTilesProps {
    links: ILink[];
    viewMode: Exclude<LinkViewMode, "list">;
    selectedId?: string;
    /** Extract ID from a link for selection matching. Defaults to link.id ?? link.href. */
    getId?: (link: ILink) => string;
    onSelect?: (link: ILink) => void;
    onEdit?: (link: ILink) => void;
    onDelete?: (link: ILink, skipConfirm: boolean) => void;
    /** Override double-click behavior. When not set, double-click calls onEdit. */
    onDoubleClick?: (link: ILink) => void;
    onContextMenu?: (e: React.MouseEvent, link: ILink) => void;
    /** Callback to get additional icon for a tile (e.g., pin indicator). */
    getAdditionalIcon?: (link: ILink) => React.ReactNode;
    /** Enable drag. When set, items are draggable with this sourceId in drag payload. */
    dragSourceId?: string;
    /** US-896 — Tor session to fetch remote images through, when on a Tor page. */
    imageProxy?: TorProxyInfo | null;
    /** Called with the RenderGridModel on mount, null on unmount. */
    onGridModel?: (model: RenderGridModel | null) => void;
}

export function LinksTiles({
    links, viewMode, selectedId, getId = defaultGetId,
    onSelect, onEdit, onDelete, onDoubleClick, onContextMenu,
    getAdditionalIcon, dragSourceId, imageProxy, onGridModel,
}: LinksTilesProps) {
    const gridRef = useRef<RenderGridModel>(null);
    const [gridSize, setGridSize] = useState<RenderSizeOptional>({
        width: undefined,
        height: undefined,
    });
    const faviconVersion = useFavicons(links);

    const dims = TILE_DIMENSIONS[viewMode];

    // Expose grid model to parent
    const gridModelNotified = useRef(false);
    if (gridRef.current && !gridModelNotified.current) {
        gridModelNotified.current = true;
        onGridModel?.(gridRef.current);
    }

    useEffect(() => {
        gridRef.current?.scrollToRow(0);
        gridRef.current?.update({ all: true });
    }, [links, viewMode]);

    useEffect(() => {
        gridRef.current?.update({ all: true });
    }, [selectedId]);

    const counts = useMemo(() => {
        const colCount = gridSize.width
            ? Math.max(1, Math.floor(gridSize.width / dims.cellWidth))
            : 1;
        const rowCount = links.length > 0
            ? Math.ceil(links.length / colCount)
            : 0;

        setTimeout(() => {
            gridRef.current?.update({ all: true });
        }, 0);

        return { colCount, rowCount };
    }, [gridSize.width, links.length, dims.cellWidth]);

    const renderCell = useCallback(
        (p: RenderCellParams) => {
            const index = p.row * counts.colCount + p.col;
            const link = links[index];
            if (!link) return <div key={p.key} style={p.style} />;

            return (
                <div
                    key={p.key}
                    style={{
                        ...p.style,
                        boxSizing: "border-box",
                        padding: 4,
                    }}
                >
                    <LinksTileCell
                        link={link}
                        isSelected={getId(link) === selectedId}
                        imageHeight={dims.imageHeight}
                        additionalIcon={getAdditionalIcon?.(link)}
                        dragSourceId={dragSourceId}
                        imageProxy={imageProxy}
                        onSelect={onSelect}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onDoubleClick={onDoubleClick}
                        onContextMenu={onContextMenu}
                    />
                </div>
            );
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps -- faviconVersion bumps on favicon load to force re-render of tiles (no direct read in body)
        [links, counts.colCount, dims, selectedId, getId, getAdditionalIcon,
         dragSourceId, imageProxy, onSelect, onEdit, onDelete, onDoubleClick, onContextMenu,
         faviconVersion],
    );

    return (
        <RenderGrid
            ref={gridRef}
            rowCount={counts.rowCount}
            columnCount={counts.colCount}
            rowHeight={dims.cellHeight}
            columnWidth={dims.cellWidth}
            renderCell={renderCell}
            onResize={setGridSize}
        />
    );
}

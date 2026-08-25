import { useCallback, useRef, useState } from "react";
import { ListItem, Panel, Text } from "../../uikit";
import color from "../../theme/color";
import { TraitTypeId, setTraitDragData, getTraitDragData, hasTraitDragData } from "../../core/traits";
import { PinFilledIcon } from "../../theme/icons";
import { appendLinkOpenMenuItems } from "../shared/link-open-menu";
import { ContextMenuEvent } from "../../api/events/events";
import { LinkItem, LinkSource } from "./linkTypes";
import { LinkTooltipContent } from "./LinkTooltip";
import { createTreeProviderItemIconElement } from "../../components/icons/icon-elements";
import { getHostname, requestFaviconSave, useFavicons } from "../../components/icons/favicon-cache";

const { clipboard } = require("electron");

// =============================================================================
// Pinned Item Row (native HTML5 drag-and-drop)
// =============================================================================

// Module-level: track which index is being dragged (only one drag at a time)
let draggingPinIndex = -1;

interface PinnedItemProps {
    link: LinkItem;
    index: number;
    isSelected: boolean;
    model: LinkSource;
    onOpenLink: (link: LinkItem) => void;
    onContextMenu: (e: React.MouseEvent, link: LinkItem) => void;
}

function PinnedItem({ link, index, isSelected, model, onOpenLink, onContextMenu }: PinnedItemProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [isOver, setIsOver] = useState(false);
    const dragEnterCount = useRef(0);

    const handleDragStart = useCallback((e: React.DragEvent) => {
        e.stopPropagation();
        draggingPinIndex = index;
        setTraitDragData(e.dataTransfer, TraitTypeId.PinnedLink, { index });
        setIsDragging(true);
    }, [index]);

    const handleDragEnd = useCallback(() => {
        draggingPinIndex = -1;
        setIsDragging(false);
    }, []);

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        dragEnterCount.current++;
        if (hasTraitDragData(e.dataTransfer) && draggingPinIndex >= 0 && draggingPinIndex !== index) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setIsOver(true);
        }
    }, [index]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        if (hasTraitDragData(e.dataTransfer) && draggingPinIndex >= 0 && draggingPinIndex !== index) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
        }
    }, [index]);

    const handleDragLeave = useCallback(() => {
        dragEnterCount.current--;
        if (dragEnterCount.current <= 0) {
            dragEnterCount.current = 0;
            setIsOver(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        dragEnterCount.current = 0;
        setIsOver(false);
        const payload = getTraitDragData(e.dataTransfer);
        if (!payload || payload.typeId !== TraitTypeId.PinnedLink) return;
        const data = payload.data as { index: number };
        if (data.index !== index) {
            const toIndex = data.index < index ? index : index;
            model.reorderPinnedLink(data.index, toIndex);
        }
    }, [index, model]);

    const dropPosition = isOver && draggingPinIndex >= 0 && draggingPinIndex !== index
        ? (draggingPinIndex < index ? "below" : "above")
        : "";

    return (
        <div
            style={{
                position: "relative",
                margin: "0 4px",
                display: "flex",
                alignItems: "stretch",
                height: 24,
                flexShrink: 0,
                opacity: isDragging ? 0.4 : undefined,
            }}
        >
            <ListItem
                name="pinned-item"
                variant="browse"
                selectionStyle="focus"
                showSelectionIcon={false}
                selected={isSelected}
                icon={createTreeProviderItemIconElement(link)}
                label={link.title || "Untitled"}
                tooltip={<LinkTooltipContent link={link} imageProxy={model.imageProxy} />}
                tooltipDelayShow={1200}
                draggable
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => model.selectLink(link.id)}
                onDoubleClick={() => { if (link.href) onOpenLink(link); }}
                onContextMenu={(e) => onContextMenu(e, link)}
            />
            {dropPosition === "above" && (
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 4,
                        right: 4,
                        height: 2,
                        backgroundColor: color.misc.blue,
                        borderRadius: 1,
                        pointerEvents: "none",
                    }}
                />
            )}
            {dropPosition === "below" && (
                <div
                    style={{
                        position: "absolute",
                        bottom: 0,
                        left: 4,
                        right: 4,
                        height: 2,
                        backgroundColor: color.misc.blue,
                        borderRadius: 1,
                        pointerEvents: "none",
                    }}
                />
            )}
        </div>
    );
}

// =============================================================================
// Component
// =============================================================================

interface PinnedLinksPanelProps {
    pinnedLinks: LinkItem[];
    model: LinkSource;
    selectedLinkId?: string;
    /** Fixed pixel width applied to the panel root. */
    width?: number;
}

export function PinnedLinksPanel({ pinnedLinks, model, selectedLinkId, width }: PinnedLinksPanelProps) {
    useFavicons(pinnedLinks);

    const handleOpenLink = useCallback((link: LinkItem) => {
        if (link.href) {
            // US-896 — never arm a favicon save from a Tor page (see LinkItemTiles).
            if (!model.isTorPage) requestFaviconSave(getHostname(link.href));
            model.openLink(link);
        }
    }, [model]);

    const handleContextMenu = useCallback((e: React.MouseEvent, link: LinkItem) => {
        model.selectLink(link.id);
        const ctxEvent = ContextMenuEvent.fromNativeEvent(e, "link-pinned");
        const customItems = model.onGetLinkMenuItems?.(link);
        if (customItems?.length) {
            ctxEvent.items.push(...customItems);
        }
        ctxEvent.items.push(
            {
                label: "Edit",
                icon: "rename",
                onClick: () => model.showLinkDialog(link.id),
                startGroup: customItems?.length ? true : undefined,
            },
        );
        if (link.href) {
            appendLinkOpenMenuItems(ctxEvent.items, link.href, { startGroup: true });
        }
        ctxEvent.items.push(
            {
                label: "Copy URL",
                icon: "copy",
                onClick: () => { if (link.href) clipboard.writeText(link.href); },
                disabled: !link.href,
            },
        );
        if (link.imgSrc) {
            const imgUrl = link.imgSrc;
            ctxEvent.items.push(
                {
                    label: "Copy Image URL",
                    icon: "copy",
                    onClick: () => clipboard.writeText(imgUrl),
                    startGroup: true,
                },
                {
                    label: "Open Image in New Tab",
                    icon: "open-file",
                    onClick: async () => {
                        const { pagesModel } = await import("../../api/pages");
                        pagesModel.openImageInNewTab(imgUrl);
                    },
                },
            );
        }
        ctxEvent.items.push(
            {
                label: "Unpin",
                icon: "pin-filled",
                onClick: () => model.togglePinLink(link.id),
                startGroup: true,
            },
            {
                label: "Delete",
                icon: "delete",
                onClick: () => model.deleteLink(link.id),
            },
        );
    }, [model]);

    return (
        <Panel
            name="pinned-links-panel"
            direction="column"
            overflow="hidden"
            minWidth={100}
            maxWidth="40%"
            width={width}
        >
            <Panel
                name="pinned-links-header"
                align="center"
                gap="xs"
                paddingX="md"
                paddingY="sm"
                borderBottom
                shrink={false}
            >
                <PinFilledIcon style={{ width: 14, height: 14, color: color.misc.blue }} />
                <Text size="xs" color="light">Pinned</Text>
            </Panel>
            <Panel
                name="pinned-links-list"
                direction="column"
                overflowY="auto"
                overflowX="hidden"
                paddingY="xs"
                flex={1}
                height={0}
                tabIndex={0}
                data-focus-selection=""
            >
                {pinnedLinks.map((link, i) => (
                    <PinnedItem
                        key={link.id}
                        link={link}
                        index={i}
                        isSelected={link.id === selectedLinkId}
                        model={model}
                        onOpenLink={handleOpenLink}
                        onContextMenu={handleContextMenu}
                    />
                ))}
            </Panel>
        </Panel>
    );
}

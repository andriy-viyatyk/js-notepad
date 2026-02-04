import styled from "@emotion/styled";
import clsx from "clsx";
import { useCallback, useMemo, useRef } from "react";
import { useDrag, useDrop } from "react-dnd";
import color from "../../theme/color";
import { OverflowTooltipText } from "../../controls/OverflowTooltipText";
import { Tooltip } from "../../controls/Tooltip";
import { uuid } from "../../common/node-utils";
import { MenuFolder, menuFolders } from "../../model/menuFolders";
import { MenuItem } from "../../controls/PopupMenu";

const FOLDER_DRAG_TYPE = "FOLDER_DRAG";

const FolderItemRoot = styled.div({
    paddingLeft: 4,
    cursor: "pointer",
    color: color.text.default,
    flexDirection: "row",
    columnGap: 6,
    display: "inline-flex",
    alignItems: "center",
    overflow: "hidden",
    "&.dragging": {
        opacity: 0.5,
    },
    "&.drag-over": {
        borderTop: `2px solid ${color.border.active}`,
    },
    "& .item-text": {
        flex: "1 1",
        whiteSpace: "nowrap",
    },
});

export interface FolderItemProps {
    folder: MenuFolder;
    index: number;
    style: React.CSSProperties;
    selected: boolean;
    onClick: (folder: MenuFolder, index?: number, e?: React.MouseEvent) => void;
    icon: React.ReactNode;
    label: React.ReactNode;
    selectedIcon?: React.ReactNode;
    itemMarginY?: number;
    getTooltip?: (folder: MenuFolder, index?: number) => string | undefined;
    getContextMenu?: (folder: MenuFolder, index?: number) => MenuItem[] | undefined;
    canDrag?: boolean;
    canDrop?: boolean;
}

export function FolderItem(props: FolderItemProps) {
    const {
        folder,
        index,
        style,
        selected,
        onClick,
        icon,
        label,
        selectedIcon,
        itemMarginY,
        getTooltip,
        getContextMenu,
        canDrag = true,
        canDrop = true,
    } = props;

    const id = useMemo(() => uuid(), []);
    const ref = useRef<HTMLDivElement>(null);

    const [{ isDragging }, drag] = useDrag({
        type: FOLDER_DRAG_TYPE,
        item: { id: folder.id },
        collect: (monitor) => ({
            isDragging: monitor.isDragging(),
        }),
        canDrag: () => canDrag,
    });

    const [{ isOver }, drop] = useDrop({
        accept: FOLDER_DRAG_TYPE,
        drop({ id: draggedId }: { id: string }) {
            if (draggedId !== folder.id && folder.id) {
                menuFolders.moveFolder(draggedId, folder.id);
            }
        },
        collect: (monitor) => ({
            isOver: monitor.isOver() && monitor.canDrop(),
        }),
        canDrop: () => canDrop,
    });

    drag(drop(ref));

    const handleClick = useCallback(
        (e: React.MouseEvent) => {
            onClick(folder, index, e);
        },
        [onClick, folder, index]
    );

    const handleContextMenu = useCallback(
        (e: React.MouseEvent) => {
            const menuItems = getContextMenu?.(folder, index);
            if (menuItems) {
                if (!e.nativeEvent.menuItems) {
                    e.nativeEvent.menuItems = [];
                }
                e.nativeEvent.menuItems.push(...menuItems);
            }
        },
        [getContextMenu, folder, index]
    );

    const handleDragOver = useCallback(
        (e: React.DragEvent) => {
            if (!canDrop) {
                e.dataTransfer.dropEffect = "none";
            }
        },
        [canDrop]
    );

    const tooltip = useMemo(
        () => getTooltip?.(folder, index),
        [getTooltip, folder, index]
    );

    const { top, height, ...restStyle } = style;
    const adjustedTop = itemMarginY
        ? (top as number) + itemMarginY
        : (top as number);
    const adjustedHeight = itemMarginY
        ? (height as number) - itemMarginY * 2
        : (height as number);

    return (
        <FolderItemRoot
            ref={ref}
            style={{ ...restStyle, top: adjustedTop, height: adjustedHeight }}
            className={clsx("list-item", {
                selected,
                dragging: isDragging,
                "drag-over": isOver,
            })}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            onDragOver={handleDragOver}
            data-tooltip-id={id}
        >
            {Boolean(icon) && icon}
            <OverflowTooltipText className="item-text">{label}</OverflowTooltipText>
            {selected && selectedIcon}
            {Boolean(tooltip) && (
                <Tooltip id={id} delayShow={1500}>
                    {tooltip}
                </Tooltip>
            )}
        </FolderItemRoot>
    );
}

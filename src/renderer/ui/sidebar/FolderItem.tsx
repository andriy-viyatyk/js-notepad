import styled from "@emotion/styled";
import { useCallback, useRef, useState } from "react";
import { TraitTypeId, setTraitDragData, getTraitDragData, hasTraitDragData } from "../../core/traits";
import color from "../../theme/color";
import { renderIcon, Tooltip } from "../../uikit";
import type { IconRef } from "../../uikit";
import { ArrowRightIcon } from "../../theme/icons";

import { menuFolders } from "../../api/menu-folders";
import type { MenuFolder } from "../../api/menu-folders";

const Root = styled.div(
    {
        display: "inline-flex",
        alignItems: "center",
        columnGap: 6,
        paddingLeft: 4,
        cursor: "pointer",
        color: color.text.default,
        overflow: "hidden",
        width: "100%",
        height: "100%",
        boxSizing: "border-box",

        // Relocated verbatim from uikit/shared/selection-style.ts (EPIC-056 C3-7) when its last
        // uikit consumer converted to CSS: the blurred-state row backgrounds, then the focused
        // (:focus-within) override. The opted-in ancestor is a ListBox — MenuBar renders these rows
        // through its `renderItem` — so this is the row-hosted, ancestor-agnostic form.
        //
        // When Epic D converts this component, its stylesheet must land in `@layer app`, NOT
        // `@layer uikit`: unlayered Emotion currently outranks every layered rule regardless of
        // specificity, and in `uikit` these rules would fight ListItem.css on source order.
        "&[data-active]:not([data-selected])": {
            backgroundColor: color.background.message,
        },
        "&[data-selected]": {
            backgroundColor: color.background.light,
        },
        "&:hover:not([data-selected])": {
            backgroundColor: color.background.message,
        },
        '[data-focus-selection]:focus-within &[data-type="folder-item"][data-selected]': {
            backgroundColor: color.background.treeSelection,
            color: color.text.selection,
            outline: `1px solid ${color.border.active}`,
            outlineOffset: -1,
        },
        '[data-focus-selection]:focus-within &[data-type="folder-item"][data-active]': {
            outline: `1px solid ${color.border.active}`,
            outlineOffset: -1,
        },
        "&[data-dragging]": {
            opacity: 0.5,
        },
        "&[data-drag-over]": {
            borderTop: `2px solid ${color.border.active}`,
        },

        "& > svg": {
            width: 16,
            height: 16,
            flexShrink: 0,
        },

        "& .item-text": {
            flex: "1 1 auto",
            minWidth: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
        },

        "& .selected-icon": {
            color: color.text.light,
            width: 16,
            height: 16,
            marginRight: 6,
            flexShrink: 0,
        },
        "&[data-selected] .selected-icon": {
            color: color.icon.selection,
        },

        "& .selected-icon-button": {
            display: "inline-flex",
            alignItems: "center",
            borderRadius: 3,
            cursor: "pointer",
            "&:hover": {
                backgroundColor: color.background.light,
            },
        },
    },
    { label: "FolderItem" },
);

export interface FolderItemProps {
    folder: MenuFolder;
    selected: boolean;
    icon: IconRef;
    label: string;
    tooltip?: string;
    onDoubleClick?: (folder: MenuFolder) => void;
    onSelectedIconClick?: (folder: MenuFolder, e: React.MouseEvent) => void;
    canDrag?: boolean;
    canDrop?: boolean;
}

export function FolderItem(props: FolderItemProps) {
    const {
        folder,
        selected,
        icon,
        label,
        tooltip,
        onDoubleClick,
        onSelectedIconClick,
        canDrag = true,
        canDrop = true,
    } = props;

    const [isDragging, setIsDragging] = useState(false);
    const [isOver, setIsOver] = useState(false);
    const dragEnterCount = useRef(0);

    const handleFolderDragStart = useCallback((e: React.DragEvent) => {
        if (!canDrag) { e.preventDefault(); return; }
        e.stopPropagation();
        setTraitDragData(e.dataTransfer, TraitTypeId.MenuFolder, { id: folder.id });
        setIsDragging(true);
    }, [canDrag, folder.id]);

    const handleFolderDragEnd = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleFolderDragEnter = useCallback((e: React.DragEvent) => {
        dragEnterCount.current++;
        if (canDrop && hasTraitDragData(e.dataTransfer)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setIsOver(true);
        }
    }, [canDrop]);

    const handleFolderDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        dragEnterCount.current = 0;
        setIsOver(false);
        if (!canDrop) return;
        const payload = getTraitDragData(e.dataTransfer);
        if (payload?.typeId === TraitTypeId.MenuFolder) {
            const data = payload.data as { id: string };
            if (data.id !== folder.id && folder.id) {
                menuFolders.move(data.id, folder.id);
            }
        }
    }, [canDrop, folder.id]);

    const handleDragOver = useCallback(
        (e: React.DragEvent) => {
            if (!canDrop) {
                e.dataTransfer.dropEffect = "none";
                return;
            }
            if (hasTraitDragData(e.dataTransfer)) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
            }
        },
        [canDrop]
    );

    const handleDragLeave = useCallback(() => {
        dragEnterCount.current--;
        if (dragEnterCount.current <= 0) {
            dragEnterCount.current = 0;
            setIsOver(false);
        }
    }, []);

    const handleDoubleClick = useCallback(
        () => {
            onDoubleClick?.(folder);
        },
        [onDoubleClick, folder]
    );

    const handleSelectedIconClick = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            onSelectedIconClick?.(folder, e);
        },
        [onSelectedIconClick, folder]
    );

    const row = (
        <Root
            data-type="folder-item"
            data-selected={selected || undefined}
            data-dragging={isDragging || undefined}
            data-drag-over={isOver || undefined}
            draggable={canDrag}
            onDragStart={handleFolderDragStart}
            onDragEnd={handleFolderDragEnd}
            onDragEnter={handleFolderDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleFolderDrop}
            onDoubleClick={handleDoubleClick}
        >
            {renderIcon(icon)}
            <span className="item-text">{label}</span>
            {selected && (
                onSelectedIconClick ? (
                    <span
                        className="selected-icon-button"
                        onClick={handleSelectedIconClick}
                        title="Open folder in new tab"
                    >
                        <ArrowRightIcon className="selected-icon" />
                    </span>
                ) : (
                    <ArrowRightIcon className="selected-icon" />
                )
            )}
        </Root>
    );

    return tooltip ? <Tooltip content={tooltip}>{row}</Tooltip> : row;
}

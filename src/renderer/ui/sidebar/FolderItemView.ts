import { menuFolders, type MenuFolder } from "../../api/menu-folders";
import {
    getTraitDragData,
    hasTraitDragData,
    setTraitDragData,
    TraitTypeId,
} from "../../core/traits";
import { createIconElement } from "../../uikit/shared/slots";
import { ListItemView } from "../../uikit/ListBox/ListItemView";
import type { IListBoxItem, ListItemDragProps } from "../../uikit/ListBox/types";
import { VanillaView } from "../../uikit/shared/vanilla-view";
import type { IconRef } from "../../uikit/shared/slots";
import "./FolderItem.css";

export interface FolderItemProps {
    folder: MenuFolder;
    selected: boolean;
    icon: IconRef;
    label: string;
    tooltip?: string;
    onDoubleClick?: (folder: MenuFolder) => void;
    onSelectedIconClick?: (folder: MenuFolder, event: MouseEvent) => void;
    canDrag?: boolean;
    canDrop?: boolean;
}

export interface FolderItemRecord extends IListBoxItem {
    folder: MenuFolder;
    tooltip?: string;
}

interface FolderDragState {
    dragEnterCount: number;
}

function selectedArrow(
    folder: MenuFolder,
    onSelectedIconClick: FolderItemProps["onSelectedIconClick"],
): Node {
    const arrow = createIconElement("arrow-right");
    arrow.classList.add("selected-icon");
    if (!onSelectedIconClick) return arrow;

    const button = document.createElement("span");
    button.className = "selected-icon-button";
    button.title = "Open folder in new tab";
    button.append(arrow);
    button.addEventListener("click", (event) => {
        event.stopPropagation();
        onSelectedIconClick(folder, event);
    });
    return button;
}

function folderDrag(
    props: FolderItemProps,
    dragState: FolderDragState,
): ListItemDragProps {
    const canDrag = props.canDrag ?? true;
    const canDrop = props.canDrop ?? true;
    const sourceId = props.folder.id;

    return {
        draggable: canDrag,
        onDragStart: (event) => {
            const row = event.currentTarget as HTMLElement;
            if (!canDrag) {
                event.preventDefault();
                return;
            }
            event.stopPropagation();
            setTraitDragData(event.dataTransfer, TraitTypeId.MenuFolder, { id: sourceId });
            row.setAttribute("data-dragging", "");
        },
        onDragEnd: (event) => {
            (event.currentTarget as HTMLElement).removeAttribute("data-dragging");
        },
        onDragEnter: (event) => {
            const row = event.currentTarget as HTMLElement;
            dragState.dragEnterCount++;
            if (canDrop && hasTraitDragData(event.dataTransfer)) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                row.setAttribute("data-drag-over", "");
            }
        },
        onDragOver: (event) => {
            const row = event.currentTarget as HTMLElement;
            if (!canDrop) {
                event.dataTransfer.dropEffect = "none";
                return;
            }
            if (hasTraitDragData(event.dataTransfer)) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                row.setAttribute("data-drag-over", "");
            }
        },
        onDragLeave: (event) => {
            const row = event.currentTarget as HTMLElement;
            dragState.dragEnterCount--;
            if (dragState.dragEnterCount <= 0) {
                dragState.dragEnterCount = 0;
                row.removeAttribute("data-drag-over");
            }
        },
        onDrop: (event) => {
            const row = event.currentTarget as HTMLElement;
            event.preventDefault();
            dragState.dragEnterCount = 0;
            row.removeAttribute("data-drag-over");
            if (!canDrop) return;

            const payload = getTraitDragData(event.dataTransfer);
            if (payload?.typeId !== TraitTypeId.MenuFolder) return;
            const data = payload.data as { id?: string };
            const targetId = props.folder.id;
            const movedId = data.id;
            if (movedId && targetId && movedId !== targetId) {
                menuFolders.move(movedId, targetId);
            }
        },
    };
}

export function createFolderItemRecord(
    props: FolderItemProps,
    dragState: FolderDragState = { dragEnterCount: 0 },
): FolderItemRecord {
    return {
        value: props.folder.id ?? "",
        label: props.label,
        icon: props.icon,
        rowClass: "folder-item",
        trailingElement: props.selected
            ? selectedArrow(props.folder, props.onSelectedIconClick)
            : undefined,
        drag: folderDrag(props, dragState),
        folder: props.folder,
        tooltip: props.tooltip,
    };
}

export class FolderItemView extends VanillaView<FolderItemProps> {
    private readonly dragState: FolderDragState = { dragEnterCount: 0 };
    private readonly row: ListItemView;

    public constructor(props: FolderItemProps) {
        const record = createFolderItemRecord(props);
        const row = new ListItemView({
            ...record,
            tooltip: record.tooltip,
            selected: props.selected,
            variant: "browse",
            selectionStyle: "focus",
        });
        super(props, row.root);
        this.row = row;
    }

    protected onMount(): void {
        this.child(this.row).mount();
        this.listen(this.root, "dblclick", () => this.props.onDoubleClick?.(this.props.folder));
    }

    protected onUpdate(props: FolderItemProps): void {
        const record = createFolderItemRecord(props, this.dragState);
        this.row.update({
            ...record,
            tooltip: record.tooltip,
            selected: props.selected,
            variant: "browse",
            selectionStyle: "focus",
        });
    }
}

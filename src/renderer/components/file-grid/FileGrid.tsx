import styled from "@emotion/styled";
import React, { useEffect, useRef } from "react";

import { DataGrid, type CellRenderer, type Column, type DataGridInstance } from "../../uikit/DataGrid";
import type { MenuItem } from "../../uikit/Menu";
import { fpExtname } from "../../core/utils/file-path";
import { fileIconMarkup } from "../icons/file-icon-markup";
import { prepareFileIcon, useSystemFileIcons } from "../icons/LanguageIcon";
import { useBoardIcon } from "../../editors/board/board-icon-cache";
import { customEditorRegistry } from "../../editors/board/custom-editor-registry";
import { showGridContextMenu } from "../../ui/dialogs/poppers/grid-context-menu";
import "./FileGrid.css";

export interface FileGridItem {
    filePath: string;
    title: string;
    status?: string;
    isFolder?: boolean;
}

export interface FileGridProps {
    name?: string;
    items: FileGridItem[];
    label?: string;
    onClick?: (item: FileGridItem) => void;
    onDoubleClick?: (item: FileGridItem) => void;
    onSelectionChange?: (items: FileGridItem[]) => void;
    getTrailing?: CellRenderer<FileGridItem>;
    getContextMenuItems?: (items: FileGridItem[]) => MenuItem[];
    compact?: boolean;
}

const Root = styled.div({
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    '&[data-compact="true"]': { "--p-font-base": "12px" },
}, { label: "FileGrid" });

const ROW_HEIGHT_COMPACT = 20;
const ROW_HEIGHT = 24;

function buildColumns(label: string | undefined, trailing: React.RefObject<FileGridProps["getTrailing"]>): Column<FileGridItem>[] {
    return [
        {
            key: "icon", name: "", width: 28,
            render: (cell) => cell.row.isFolder
                ? `<span class="file-grid-folder">📁</span>`
                : fileIconMarkup(cell.row.filePath, 16),
            rowCompare: (a, b) => fpExtname(a.filePath).localeCompare(fpExtname(b.filePath)),
            formatValue: () => "",
        },
        { key: "title", name: label ?? "", width: "10%", dataType: "string" },
        {
            key: "status", name: "", width: 24, dataType: "string",
            render: (cell) => trailing.current?.(cell) ?? "",
            formatValue: (_c, row) => row.status ?? "",
        },
    ];
}

export function FileGrid(props: FileGridProps) {
    const { name, items, label, onClick, onDoubleClick, onSelectionChange, getTrailing, getContextMenuItems, compact } = props;
    const trailingRef = useRef(getTrailing);
    trailingRef.current = getTrailing;
    const onSelectionChangeRef = useRef(onSelectionChange);
    onSelectionChangeRef.current = onSelectionChange;
    useBoardIcon(undefined);
    const systemIcons = useSystemFileIcons();
    customEditorRegistry.state.use((s) => s.entries);
    const gridRef = useRef<DataGridInstance<FileGridItem> | undefined>(undefined);
    const columnsRef = useRef<Column<FileGridItem>[] | undefined>(undefined);
    if (!columnsRef.current) columnsRef.current = buildColumns(label, trailingRef);

    useEffect(() => {
        for (const item of items) if (!item.isFolder) prepareFileIcon(item.filePath);
        gridRef.current?.refresh();
    }, [items, systemIcons]);

    useEffect(() => {
        const grid = gridRef.current;
        if (!grid) return;
        const column = grid.getColumns().find((c) => c.key === "title");
        if (column && column.name !== (label ?? "")) {
            column.name = label ?? "";
            grid.setColumns(grid.getColumns());
        }
    }, [label]);

    return (
        <Root data-type="file-grid" data-name={name} data-compact={compact ? "true" : undefined}>
            <DataGrid<FileGridItem>
                name={name}
                columns={columnsRef.current}
                rows={items}
                getRowKey={(row) => row.filePath}
                rowHeight={compact ? ROW_HEIGHT_COMPACT : ROW_HEIGHT}
                onGrid={(grid) => { gridRef.current = grid ?? undefined; }}
                onCellClick={(cell) => onClick?.(cell.row)}
                onCellDoubleClick={(cell) => onDoubleClick?.(cell.row)}
                onFocusChange={() => onSelectionChangeRef.current?.(gridRef.current?.getSelection()?.rows ?? [])}
                getContextMenuItems={getContextMenuItems ? (event) =>
                    event.target === "cell" ? getContextMenuItems(event.selection?.rows ?? []) : [] : undefined}
                onGridContextMenu={showGridContextMenu}
                disableFiltering
                fitToWidth
                cellBorders={false}
            />
        </Root>
    );
}

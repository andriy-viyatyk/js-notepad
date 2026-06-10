import styled from "@emotion/styled";
import React, { useEffect, useRef, useState, type ReactNode } from "react";

import { AVGrid, AVGridModel } from "../../uikit/AVGrid";
import type { CellFocus, Column, TCellFormater, TCellRendererProps } from "../../uikit/AVGrid";
import type { MenuItem } from "../../uikit/Menu";
import { TruncatedText } from "../../uikit/TruncatedText";
import { fontSize } from "../../uikit/tokens";
import { FileIcon, FolderIcon } from "../icons/FileIcon";
import { fpExtname } from "../../core/utils/file-path";

// =============================================================================
// FileGrid — an AVGrid-based flat file list (EPIC-031 / US-631).
//
// A FileList replacement that adds RANGE selection + range-copy (AVGrid's
// focus model) and column sorting, while keeping the lightweight look: three
// columns — file icon (fixed) / path (percent, fills via fitToWidth) / status
// badge (fixed). The header row doubles as a section label (the path column's
// `name`). Single + double click are forwarded; the focus range drives
// `onSelectionChange`. Lives in components/ (coupled to FileIcon), so Emotion
// is allowed here.
// =============================================================================

export interface FileGridItem {
    /** Unique row key + FileIcon source + tooltip. */
    filePath: string;
    /** Display text (e.g. the repo-relative path). */
    title: string;
    /** Optional status letter (M/A/D/R/?) — rendered via `getTrailing`. */
    status?: string;
    isFolder?: boolean;
}

export interface FileGridProps {
    name?: string;
    items: FileGridItem[];
    /** Text for the path column's header (the section label, e.g. "Unstaged").
     *  The icon + status column headers stay empty. */
    label?: string;
    /** Single click — e.g. open the file's diff. */
    onClick?: (item: FileGridItem) => void;
    /** Double click — e.g. stage / unstage one file. */
    onDoubleClick?: (item: FileGridItem) => void;
    /** Fires with the current range selection (derived from AVGrid's sorted
     *  rows, so it stays correct under sorting). */
    onSelectionChange?: (items: FileGridItem[]) => void;
    /** Right-aligned trailing content per row (e.g. a git status badge). */
    getTrailing?: (item: FileGridItem) => ReactNode;
    /** Context-menu items for a right-clicked row, given the current selection
     *  (e.g. git Stage/Unstage). Prepended above AVGrid's built-in Copy items. */
    getContextMenuItems?: (items: FileGridItem[]) => MenuItem[];
    /** Compact: 20px rows + small font, matching the legacy FileList look. */
    compact?: boolean;
}

// Only sets the list font size; AVGrid paints the rest.
const Root = styled.div({
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    '&[data-compact="true"]': { fontSize: fontSize.sm },
}, { label: "FileGrid" });

const ROW_HEIGHT_COMPACT = 20;
const ROW_HEIGHT = 24;

function rowOf(props: TCellRendererProps): FileGridItem | undefined {
    return props.model.data.rows[props.row] as FileGridItem | undefined;
}

const iconFormatter: TCellFormater = (props) => {
    const r = rowOf(props);
    if (!r) return null;
    return r.isFolder ? <FolderIcon /> : <FileIcon path={r.filePath} />;
};

const titleFormatter: TCellFormater = (props) => {
    const r = rowOf(props);
    return r ? <TruncatedText>{r.title}</TruncatedText> : null;
};

function buildColumns(
    label: string | undefined,
    getTrailingRef: React.RefObject<FileGridProps["getTrailing"]>,
): Column<FileGridItem>[] {
    return [
        {
            key: "icon",
            name: "",
            width: 28,
            cellFormater: iconFormatter,
            // Sort by file extension (the icon reflects the file type).
            rowCompare: (a, b) => fpExtname(a.filePath).localeCompare(fpExtname(b.filePath)),
            formatValue: () => "",
        },
        {
            key: "title",
            name: label ?? "",
            width: "10%", // percent → absorbs remaining width under fitToWidth
            dataType: "string",
            cellFormater: titleFormatter,
        },
        {
            key: "status",
            name: "",
            width: 24, // just fits the single-letter badge
            dataType: "string", // sorts by the status letter
            cellFormater: (props) => {
                const r = rowOf(props);
                return r && getTrailingRef.current ? getTrailingRef.current(r) : null;
            },
            formatValue: (_c, r) => r.status ?? "",
        },
    ];
}

export function FileGrid({
    name,
    items,
    label,
    onClick,
    onDoubleClick,
    onSelectionChange,
    getTrailing,
    getContextMenuItems,
    compact,
}: FileGridProps) {
    // Behind refs so the columns (and the selection effect) stay stable across
    // re-renders without rebuilding — the cell reads the current callback.
    const getTrailingRef = useRef(getTrailing);
    getTrailingRef.current = getTrailing;
    const onSelectionChangeRef = useRef(onSelectionChange);
    onSelectionChangeRef.current = onSelectionChange;

    const gridRef = useRef<AVGridModel<FileGridItem>>(undefined);
    const [columns, setColumns] = useState<Column<FileGridItem>[]>(
        () => buildColumns(label, getTrailingRef),
    );
    const [focus, setFocus] = useState<CellFocus<FileGridItem> | undefined>(undefined);

    // Derive the selection from the focus range. With sorting on, focus indices
    // refer to AVGrid's displayed (sorted) rows — read them via the focus model,
    // NOT the `items` prop, or the wrong files would be reported.
    useEffect(() => {
        const sel = gridRef.current?.models.focus.getGridSelection();
        onSelectionChangeRef.current?.(sel ? (sel.rows as FileGridItem[]) : []);
    }, [focus]);

    return (
        <Root data-type="file-grid" data-name={name} data-compact={compact ? "true" : undefined}>
            <AVGrid<FileGridItem>
                ref={gridRef}
                name={name}
                columns={columns}
                setColumns={setColumns}
                rows={items}
                getRowKey={(r) => r.filePath}
                rowHeight={compact ? ROW_HEIGHT_COMPACT : ROW_HEIGHT}
                focus={focus}
                setFocus={setFocus}
                onClick={(r) => onClick?.(r)}
                onDoubleClick={(r) => onDoubleClick?.(r)}
                getContextMenuItems={getContextMenuItems}
                disableFiltering
                fitToWidth
            />
        </Root>
    );
}

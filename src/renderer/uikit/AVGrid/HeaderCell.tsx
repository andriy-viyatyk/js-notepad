import React, { useCallback, useRef, useState } from "react";
import styled from "@emotion/styled";
import { clsx } from "clsx";
import { TraitTypeId, setTraitDragData, getTraitDragData, hasTraitDragData } from "../../core/traits";

import color from "../../theme/color";
import { TCellRendererProps, TSortDirection } from "./avGridTypes";
import {
    FilterArrowDownIcon,
    FilterArrowUpIcon,
    FilterTableIcon,
    QuestionIcon,
} from "../../theme/icons";
import { IconButton } from "../IconButton";
import { resolveFiltersModel } from "./filters/FiltersModel";

const HeaderCellRoot = styled.div(
    {
        position: "relative",
        alignItems: "center",
        backgroundColor: color.grid.headerCellBackground,
        boxSizing: "border-box",
        "&.header-resizible": {
            paddingRight: 10,
            "&::after": {
                content: '""',
                cursor: "col-resize",
                position: "absolute",
                insetBlockStart: 0,
                insetInlineEnd: 0,
                insetBlockEnd: 0,
                inlineSize: "10px",
            },
            "&:hover::after": {
                background: `linear-gradient(
                    to bottom,
                    transparent 0%,
                    transparent 20%,
                    ${color.border.default} 30%,
                    transparent 40%,
                    ${color.border.default} 50%,
                    transparent 60%,
                    ${color.border.default} 70%,
                    transparent 80%,
                    transparent 100%
                )`, // Creates 3 horizontal lines
                backgroundSize: "4px 100%", // Restrict dashes to 4px width
                backgroundPosition: "center", // Center the dashes horizontally
                backgroundRepeat: "no-repeat",
            },
        },
        "& .flex-space": {
            flex: "1 1 auto",
        },
        "& .column-filter-button": {
            display: "none",
            position: "absolute",
            right: 10,
            top: "50%",
            transform: "translateY(-50%)",
            backgroundColor: color.background.dark,
            "&.columnFiltered": {
                display: "flex",
                "& svg": {
                    color: color.misc.blue,
                }
            }
        },
        "&:hover": {
            "& .column-filter-button": {
                display: "flex",
            },
        },
        "& .header-cell-title": {
            marginRight: 4,
            overflow: "hidden",
            textOverflow: "ellipsis",
        },
        "& .sort-icon": {
            color: color.icon.light,
        }
    },
    { label: "HeaderCellRoot" }
);

function SortIcon({ direction, frozen }: { direction?: TSortDirection, frozen?: boolean }) {
    if (frozen) {
        return <QuestionIcon width={16} height={16} className="sort-icon" title="Rows are frozen while editing. Click to unfreeze." />;
    }
    if (direction === "asc") {
        return <FilterArrowDownIcon width={16} height={16} className="sort-icon" />;
    }
    if (direction === "desc") {
        return <FilterArrowUpIcon width={16} height={16} className="sort-icon" />;
    }
    return null;
}

export function HeaderCell({ key, col, style, model }: TCellRendererProps) {
    const column = model.data.columns[col];
    const headerRef = useRef<HTMLElement>(undefined);
    const resizingRef = useRef(false);
    const hasResized = useRef(false);
    const filtersModel = resolveFiltersModel(model.props.filtersModel);
    const { showFilterPoper } = filtersModel;
    const filter = filtersModel.props;
    const columnFiltered = filter.filters.find(
        (f) => f.columnKey === column.key
    );
    const sortColumn = model.state.use(s => s.sortColumn);

    const handleClick = () => {
        if (hasResized.current) {
            hasResized.current = false;
            return;
        }

        model.actions.sortColumn(column.key);
    };

    function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
        if (event.pointerType === "mouse" && event.buttons !== 1) {
            return;
        }

        const { currentTarget, pointerId } = event;
        const { right } = currentTarget.getBoundingClientRect();
        const offset = right - event.clientX;

        if (offset > 11) {
            return;
        }
        event.stopPropagation();
        event.preventDefault();

        hasResized.current = true;
        resizingRef.current = true;

        function onPointerMove(e: PointerEvent) {
            e.stopPropagation();
            e.preventDefault();
            const { left } = currentTarget.getBoundingClientRect();
            const width = e.clientX + offset - left;
            if (width > 0) {
                model.actions.columnResize(column?.key as string, width);
            }
        }

        function onLostPointerCapture() {
            currentTarget.removeEventListener("pointermove", onPointerMove);
            currentTarget.removeEventListener(
                "lostpointercapture",
                onLostPointerCapture
            );
            resizingRef.current = false;
        }

        currentTarget.setPointerCapture(pointerId);
        currentTarget.addEventListener("pointermove", onPointerMove);
        currentTarget.addEventListener(
            "lostpointercapture",
            onLostPointerCapture
        );
    }

    const [isDragging, setIsDragging] = useState(false);
    const [isOver, setIsOver] = useState(false);
    const dragEnterCount = useRef(0);

    const handleDragStart = useCallback((e: React.DragEvent) => {
        if (column.isStatusColumn || resizingRef.current) {
            e.preventDefault();
            return;
        }
        setTraitDragData(e.dataTransfer, TraitTypeId.GridColumn, { key: column.key });
        setIsDragging(true);
    }, [column.key, column.isStatusColumn]);

    const handleDragEnd = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        dragEnterCount.current++;
        if (!column.isStatusColumn && hasTraitDragData(e.dataTransfer)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setIsOver(true);
        }
    }, [column.isStatusColumn]);

    const handleGridDragOver = useCallback((e: React.DragEvent) => {
        if (!column.isStatusColumn && hasTraitDragData(e.dataTransfer)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
        }
    }, [column.isStatusColumn]);

    const handleDragLeave = useCallback(() => {
        dragEnterCount.current--;
        if (dragEnterCount.current <= 0) {
            dragEnterCount.current = 0;
            setIsOver(false);
        }
    }, []);

    const handleGridDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        dragEnterCount.current = 0;
        setIsOver(false);
        if (column.isStatusColumn) return;
        const payload = getTraitDragData(e.dataTransfer);
        if (payload?.typeId === TraitTypeId.GridColumn) {
            const data = payload.data as { key: string };
            model.actions.columnsReorder(data.key, column.key as string);
        }
    }, [column.key, column.isStatusColumn, model]);

    const filterClick = useCallback(
        (e: React.MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            if (column.filterType) {
                showFilterPoper(
                    {
                        columnKey: column.key as string,
                        columnName: column.name,
                        type: column.filterType,
                        displayFormat: column.displayFormat,
                    },
                    headerRef.current,
                    {
                        x: e.clientX,
                        y: e.clientY,
                    },
                    {
                        x: 4,
                        y: 0,
                    }
                );
            }
        },
        [
            column.filterType,
            column.displayFormat,
            column.key,
            column.name,
            showFilterPoper,
        ]
    );

    return (
        <HeaderCellRoot
            ref={(ref) => {
                headerRef.current = ref as HTMLElement;
            }}
            key={key}
            style={style}
            draggable={!column.isStatusColumn}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragEnter={handleDragEnter}
            onDragOver={handleGridDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleGridDrop}
            className={clsx("header-cell", {
                "header-resizible": column.resizible,
                "is-dragging": isDragging,
                "is-over": isOver,
            })}
            onPointerDown={column.resizible ? onPointerDown : undefined}
            onClick={handleClick}
            data-key={column.key}
        >
            {Boolean(
                sortColumn && column.key === sortColumn.key
            ) && <SortIcon direction={sortColumn?.direction} frozen={model.data.rowsFrozen}/>}
            <span className="header-cell-title">{column?.name}</span>
            <span className="flex-space" />
            {Boolean(column.filterType) && !model.props.disableFiltering && (
                <IconButton
                    name="avgrid-column-filter"
                    icon={<FilterTableIcon />}
                    size="sm"
                    className={clsx("column-filter-button", {columnFiltered})}
                    onClick={filterClick}
                />
            )}
        </HeaderCellRoot>
    );
}

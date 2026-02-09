import { CSSProperties, useCallback } from "react";
import styled from "@emotion/styled";
import clsx from "clsx";
import { useDrop } from "react-dnd";

import { useComponentModel } from "../../core/state/model";
import RenderGrid from "../virtualization/RenderGrid/RenderGrid";
import { Percent, RenderCellParams } from "../virtualization/RenderGrid/types";
import {
    defaultTreeViewState,
    DragItem,
    TreeItem,
    TreeViewItem,
    TreeViewModel,
    TreeViewProps,
    TreeViewState,
} from "./TreeView.model";
import color from "../../theme/color";
import { ChevronDownIcon, ChevronRightIcon } from "../../theme/icons";
import { Button } from "../basic/Button";

const TreeViewRoot = styled.div({
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",

    "& .tree-cell": {
        display: "flex",
        flexDirection: "row",
        flexWrap: "nowrap",
        alignItems: "center",
        overflow: "hidden",
        position: "relative",
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        "&:hover": {
            backgroundColor: color.background.message,
        },
        "&.selected": {
            backgroundColor: color.background.light,
        },
        "&.dragOver": {
            backgroundColor: color.background.selection,
        },
    },

    "& .expand-button": {
        marginLeft: -5,
        "& svg": {
            width: 14,
            height: 14,
        },
    },

    "& .level-shift": {
        width: 16,
        height: "100%",
        flexShrink: 0,
        borderLeft: `1px solid ${color.border.light}`,
    },

    "& .empty-button": {
        width: 22,
        height: 22,
    },

    "& .label-icon": {
        display: "contents",
        "& :last-child": {
            marginRight: 4,
        },
    },
});

const columnWidth: () => Percent = () => `100%`;

interface TreeCellProps<T extends TreeItem = TreeItem> {
    item: TreeViewItem<T>;
    model: TreeViewModel<T>;
    style: CSSProperties;
}

function TreeCell<T extends TreeItem = TreeItem>({
    item,
    model,
    style,
}: TreeCellProps<T>) {
    const levels = Array.from({ length: item.level }, (_, i) => i);

    const [{ isOver }, drop] = useDrop({
        accept: model.props.dropTypes ?? [],
        drop(dragItem: DragItem) {
            model.props.onDrop?.(item.item, dragItem);
        },
        collect: (monitor) => ({
            isOver: monitor.isOver(),
        }),
    });

    return (
        <div
            ref={(node) => {
                drop(node);
            }}
            style={style}
            onClick={() => {
                model.props.onItemClick?.(item.item);
                model.gridRef?.update({ all: true });
            }}
            className={clsx("tree-cell", {
                selected: model.props.getSelected?.(item.item),
                dragOver: isOver,
            })}
        >
            {levels.map((l) => (
                <div key={l} className="level-shift" />
            ))}
            {item.level === 0 && model.props.rootCollapsible === false ? (
                // Root item with collapsing disabled - keep spacing
                <div className="empty-button expand-button" />
            ) : item.items?.length ? (
                <Button
                    type="icon"
                    size="small"
                    className="expand-button"
                    onClick={(e) => {
                        e.stopPropagation();
                        model.toggleExpanded(item);
                    }}
                >
                    {item.expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                </Button>
            ) : (
                <div className="empty-button expand-button" />
            )}
            <div className="label-icon">{model.props.getIcon?.(item.item)}</div>
            {model.props.getLabel(item.item)}
        </div>
    );
}

export function TreeView<T extends TreeItem = TreeItem>(
    props: TreeViewProps<T>,
) {
    const model = useComponentModel(
        props,
        TreeViewModel as unknown as TreeViewModel<T>,
        defaultTreeViewState as TreeViewState<T>,
    );
    const state = model.state.use();

    const renderCell = useCallback(
        (p: RenderCellParams) => {
            const item = state.rows[p.row];
            return (
                <TreeCell
                    key={p.key}
                    item={item}
                    model={model}
                    style={p.style}
                />
            );
        },
        [model, state.rows],
    );

    return (
        <TreeViewRoot>
            <RenderGrid
                ref={model.setGridRef}
                rowCount={state.rows.length}
                columnCount={1}
                rowHeight={22}
                columnWidth={columnWidth}
                renderCell={renderCell}
                fitToWidth
            />
        </TreeViewRoot>
    );
}

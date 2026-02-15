import { CSSProperties, Ref, useCallback, useImperativeHandle } from "react";
import styled from "@emotion/styled";
import clsx from "clsx";
import { useDrag, useDrop } from "react-dnd";

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
    TreeViewRef,
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
            color: color.text.dark,
        },
        "&.dragging": {
            opacity: 0.5,
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
        flexShrink: 0,
    },

    "& .label-icon": {
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
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

    const [{ isDragging }, drag] = useDrag({
        type: model.props.dragType || "__NONE__",
        item: () => model.props.getDragItem?.(item.item),
        collect: (monitor) => ({
            isDragging: monitor.isDragging(),
        }),
        canDrag: () => {
            if (!model.props.dragType || !model.props.getDragItem) return false;
            return model.props.getDragItem(item.item) !== null;
        },
    });

    return (
        <div
            ref={(node) => {
                drag(drop(node));
            }}
            style={style}
            onClick={() => {
                model.props.onItemClick?.(item.item);
                model.gridRef?.update({ all: true });
            }}
            onDoubleClick={() => {
                model.props.onItemDoubleClick?.(item.item);
            }}
            onContextMenu={(e) => {
                model.props.onItemContextMenu?.(item.item, e);
            }}
            className={clsx("tree-cell", {
                selected: model.props.getSelected?.(item.item),
                dragOver: isOver,
                dragging: isDragging,
            })}
        >
            {levels.map((l) => (
                <div key={l} className="level-shift" />
            ))}
            {item.level === 0 && !model.props.rootCollapsible ? (
                // Root item with collapsing disabled - no spacing
                <></>
            ) : item.items?.length || model.props.getHasChildren?.(item.item) ? (
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
    props: TreeViewProps<T> & { ref?: Ref<TreeViewRef> },
) {
    const { ref, ...treeProps } = props;
    const model = useComponentModel(
        treeProps as TreeViewProps<T>,
        TreeViewModel as unknown as TreeViewModel<T>,
        defaultTreeViewState as TreeViewState<T>,
    );
    const state = model.state.use();

    useImperativeHandle(ref, () => ({
        getExpandMap: model.getExpandMap,
        expandAll: model.expandAll,
        collapseAll: model.collapseAll,
        toggleItem: model.toggleItemById,
        getScrollTop: () => model.gridRef?.containerRef.current?.scrollTop ?? 0,
        setScrollTop: (value: number) => {
            const container = model.gridRef?.containerRef.current;
            if (container) container.scrollTop = value;
        },
    }), [model]);

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

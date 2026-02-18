import styled from "@emotion/styled";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import clsx from "clsx";
import { useDrag, useDrop } from "react-dnd";
import color from "../../../theme/color";
import { CheckedIcon, UncheckedIcon, DeleteIcon, DragHandleIcon } from "../../../theme/icons";
import { Button } from "../../../components/basic/Button";
import { TextAreaField } from "../../../components/basic/TextAreaField";
import { formatDate } from "../../../core/utils/utils";
import { WithPopupMenu } from "../../../components/overlay/WithPopupMenu";
import { MenuItem } from "../../../components/overlay/PopupMenu";
import { TodoItem, TodoTag, TODO_ITEM_DRAG } from "../todoTypes";
import { TodoEditorModel } from "../TodoEditorModel";

// =============================================================================
// Styles
// =============================================================================

const TodoItemRoot = styled.div({
    position: "relative",
    width: "100%",
    height: "fit-content",
    padding: "4px 8px 4px 30px", // left padding reserves space for checkbox-col
    "&:hover .item-actions": {
        opacity: 1,
    },
    "&:hover .drag-handle": {
        opacity: 1,
    },
    "&:hover .add-comment-btn": {
        opacity: 0.5,
    },
    "&:hover .add-tag-btn": {
        opacity: 0.5,
    },
    "&:hover .item-dates": {
        opacity: 1,
    },

    "& .checkbox-col": {
        position: "absolute",
        left: 8,
        top: 4,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
    },
    "& .checkbox": {
        cursor: "pointer",
        marginTop: 2,
        color: color.text.light,
        opacity: 0.5,
        "&:hover": {
            opacity: 1,
        },
        "& svg": {
            width: 16,
            height: 16,
        },
    },
    "& .drag-handle": {
        opacity: 0,
        cursor: "grab",
        color: color.icon.light,
        "& svg": {
            width: 12,
            height: 12,
        },
    },
    // Two-column layout: left (title + comment), right (dates/delete + tag)
    "& .content-cols": {
        display: "flex",
        gap: 6,
        minHeight: 26,
    },
    "& .left-col": {
        flex: "1 1 auto",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        gap: 2,
    },
    "& .right-col": {
        flexShrink: 0,
        minWidth: 100,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
    },
    "& .right-top": {
        display: "flex",
        alignItems: "center",
        gap: 2,
        alignSelf: "stretch",
    },
    "& .title-input": {
        flex: 1,
        minWidth: 0,
        backgroundColor: "transparent",
        fontSize: 14,
        padding: "1px 4px",
        borderColor: "transparent",
        "&:focus": {
            borderColor: color.border.active,
        },
        "&.done": {
            opacity: 0.6,
        },
    },
    "& .item-actions": {
        display: "flex",
        alignItems: "center",
        height: 20,
        opacity: 0,
        flexShrink: 0,
    },
    "& .item-dates": {
        opacity: 0,
        fontSize: 11,
        color: color.text.light,
        flexShrink: 0,
        whiteSpace: "nowrap",
        height: 20,
        lineHeight: "20px",
        alignSelf: "flex-start",
    },
    "& .comment-section": {
        fontSize: 12,
    },
    "& .comment-field": {
        maxHeight: 120,
        overflowY: "auto",
        fontSize: 12,
        color: color.text.light,
        borderColor: "transparent",
        "&:hover": {
            borderColor: color.border.default,
        },
        "&:focus": {
            borderColor: color.misc.blue,
        },
    },
    "& .add-comment-btn": {
        opacity: 0,
        fontSize: 11,
        cursor: "pointer",
        color: color.text.light,
        "&:hover": {
            opacity: 1,
            color: color.misc.blue,
        },
    },
    "& .tag-section": {
        flex: "1 1 auto",
    },
    "& .add-tag-btn": {
        opacity: 0,
        fontSize: 11,
        cursor: "pointer",
        color: color.text.light,
        "&:hover": {
            opacity: 1,
            color: color.misc.blue,
        },
    },
    "& .tag-badge": {
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        cursor: "pointer",
        color: color.text.light,
        "&:hover": {
            color: color.misc.blue,
        },
    },
    "& .tag-dot": {
        width: 8,
        height: 8,
        borderRadius: "50%",
        flexShrink: 0,
    },

    // Drag-and-drop states
    "&.dragging": {
        opacity: 0.4,
    },
    "&.drop-over": {
        backgroundColor: color.background.light,
    },
});

// =============================================================================
// Component
// =============================================================================

interface TodoItemViewProps {
    item: TodoItem;
    tags: TodoTag[];
    pageModel: TodoEditorModel;
    cellRef?: React.RefObject<HTMLDivElement>;
}

export function TodoItemView({ item, tags, pageModel, cellRef }: TodoItemViewProps) {
    const isDraggable = !item.done;

    // Drag-and-drop for reordering undone items;
    // moveItem() shows warnings when reorder is blocked by filters
    const [{ isDragging }, drag] = useDrag({
        type: TODO_ITEM_DRAG,
        item: { id: item.id },
        collect: (monitor) => ({
            isDragging: monitor.isDragging(),
        }),
        canDrag: () => isDraggable,
    });

    const [{ isOver }, drop] = useDrop({
        accept: TODO_ITEM_DRAG,
        drop(dragItem: { id: string }) {
            if (dragItem.id !== item.id) {
                pageModel.moveItem(dragItem.id, item.id);
            }
        },
        collect: (monitor) => ({
            isOver: monitor.isOver() && monitor.canDrop(),
        }),
        canDrop: () => isDraggable,
    });

    // Combine cellRef (for RenderFlexGrid measurement) with drop ref
    const setNodeRef = useCallback(
        (node: HTMLDivElement | null) => {
            drop(node);
            nodeRef.current = node;
            if (cellRef) {
                (cellRef as { current: HTMLDivElement | null }).current = node;
            }
        },
        [drop, cellRef]
    );

    // Drag handle ref — only this element initiates drag
    const setDragRef = useCallback(
        (node: HTMLSpanElement | null) => {
            drag(node);
        },
        [drag]
    );

    // Persist measured height to model (for getInitialRowHeight on reload)
    const nodeRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const el = nodeRef.current;
        if (!el) return;
        const observer = new ResizeObserver(() => {
            const h = el.clientHeight;
            if (h > 0) pageModel.setItemHeight(item.id, h);
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, [item.id, pageModel]);

    const handleCheckbox = useCallback(() => {
        pageModel.toggleItem(item.id);
    }, [pageModel, item.id]);

    const handleTitleChange = useCallback((value: string) => {
        pageModel.updateItemTitle(item.id, value);
    }, [pageModel, item.id]);

    const handleTitleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLElement).blur();
        } else if (e.key === "Escape") {
            (e.target as HTMLElement).blur();
        }
    }, []);

    const handleCommentChange = useCallback((value: string) => {
        pageModel.updateItemComment(item.id, value);
    }, [pageModel, item.id]);

    const handleCommentBlur = useCallback(() => {
        // If comment is empty, remove it
        if (item.comment === "") {
            pageModel.removeComment(item.id);
        }
    }, [pageModel, item.id, item.comment]);

    const handleAddComment = useCallback(() => {
        pageModel.addComment(item.id);
    }, [pageModel, item.id]);

    const handleDelete = useCallback(() => {
        pageModel.deleteItem(item.id);
    }, [pageModel, item.id]);

    // Tag assignment
    const tagDef = useMemo(
        () => item.tag ? tags.find((t) => t.name === item.tag) : undefined,
        [item.tag, tags]
    );

    const tagMenuItems = useMemo((): MenuItem[] => {
        const menuItems: MenuItem[] = [{
            label: "No tag",
            onClick: () => pageModel.setItemTag(item.id, null),
            selected: !item.tag,
        }];
        for (const tag of tags) {
            menuItems.push({
                label: tag.name,
                icon: tag.color ? (
                    <span style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: tag.color,
                    }} />
                ) : undefined,
                onClick: () => pageModel.setItemTag(item.id, tag.name),
                selected: item.tag === tag.name,
            });
        }
        return menuItems;
    }, [tags, item.id, item.tag, pageModel]);

    const dateInfo = item.done && item.doneDate
        ? formatDate(item.doneDate)
        : formatDate(item.createdDate);

    return (
        <TodoItemRoot
            ref={setNodeRef}
            className={clsx(isDragging && "dragging", isOver && "drop-over")}
        >
            <div className="checkbox-col">
                <span
                    className="checkbox"
                    onClick={handleCheckbox}
                    title={item.done ? "Mark as undone" : "Mark as done"}
                >
                    {item.done ? <CheckedIcon /> : <UncheckedIcon />}
                </span>
                {isDraggable && (
                    <span
                        ref={setDragRef}
                        className="drag-handle"
                        title="Drag to reorder"
                    >
                        <DragHandleIcon />
                    </span>
                )}
            </div>
            <div className="content-cols">
                {/* Left column: title + comment */}
                <div className="left-col">
                    <TextAreaField
                        className={clsx("title-input", item.done && "done")}
                        singleLine
                        value={item.title}
                        onChange={handleTitleChange}
                        onKeyDown={handleTitleKeyDown}
                        placeholder="(untitled)"
                    />
                    <div className="comment-section">
                        {item.comment !== null ? (
                            <TextAreaField
                                className="comment-field"
                                value={item.comment}
                                onChange={handleCommentChange}
                                onBlur={handleCommentBlur}
                                placeholder="Add a comment..."
                            />
                        ) : (
                            <span
                                className="add-comment-btn"
                                onClick={handleAddComment}
                            >
                                + Add comment
                            </span>
                        )}
                    </div>
                </div>

                {/* Right column: tag/delete + date */}
                <div className="right-col">
                    <div className="right-top">
                        <div className="tag-section">
                            <WithPopupMenu items={tagMenuItems}>
                                {(openMenu) =>
                                    item.tag ? (
                                        <span
                                            className="tag-badge"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openMenu(e.currentTarget);
                                            }}
                                        >
                                            {tagDef?.color && (
                                                <span
                                                    className="tag-dot"
                                                    style={{ backgroundColor: tagDef.color }}
                                                />
                                            )}
                                            {item.tag}
                                        </span>
                                    ) : (
                                        <span
                                            className="add-tag-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openMenu(e.currentTarget);
                                            }}
                                        >
                                            + tag
                                        </span>
                                    )
                                }
                            </WithPopupMenu>
                        </div>
                        <span className="item-actions">
                            <Button
                                size="small"
                                type="icon"
                                title="Delete item"
                                onClick={handleDelete}
                            >
                                <DeleteIcon />
                            </Button>
                        </span>
                    </div>
                    <span className="item-dates" title={
                        `Created: ${formatDate(item.createdDate)}` +
                        (item.doneDate ? `\nDone: ${formatDate(item.doneDate)}` : "")
                    }>
                        {dateInfo}
                    </span>
                </div>
            </div>
        </TodoItemRoot>
    );
}

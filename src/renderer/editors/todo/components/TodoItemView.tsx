import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import color from "../../../theme/color";
import { TraitTypeId, setTraitDragData, getTraitDragData, hasTraitDragData } from "../../../core/traits";
import { CheckedIcon, UncheckedIcon, DeleteIcon, DragHandleIcon } from "../../../theme/icons";
import { Panel } from "../../../uikit/Panel/Panel";
import { Textarea } from "../../../uikit/Textarea/Textarea";
import { IconButton } from "../../../uikit/IconButton/IconButton";
import { WithMenu } from "../../../uikit/Menu/WithMenu";
import { Dot } from "../../../uikit/Dot/Dot";
import type { MenuItem } from "../../../uikit/Menu/types";
import { formatDate } from "../../../core/utils/utils";
import type { TodoItem, TodoSource, TodoTag } from "../todoTypes";

interface TodoItemViewProps {
    item: TodoItem;
    tags: TodoTag[];
    pageModel: TodoSource;
    cellRef?: React.RefObject<HTMLDivElement>;
}

export function TodoItemView({ item, tags, pageModel, cellRef }: TodoItemViewProps) {
    const isDraggable = !item.done;

    const [isDragging, setIsDragging] = useState(false);
    const [isOver, setIsOver] = useState(false);
    const dragEnterCount = useRef(0);

    const handleDragStart = useCallback((e: React.DragEvent) => {
        if (!isDraggable) { e.preventDefault(); return; }
        e.stopPropagation();
        setTraitDragData(e.dataTransfer, TraitTypeId.TodoItem, { id: item.id });
        setIsDragging(true);
    }, [item.id, isDraggable]);

    const handleDragEnd = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        dragEnterCount.current++;
        if (!isDraggable) return;
        if (hasTraitDragData(e.dataTransfer)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setIsOver(true);
        }
    }, [isDraggable]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        if (!isDraggable) return;
        if (hasTraitDragData(e.dataTransfer)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
        }
    }, [isDraggable]);

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
        if (!isDraggable) return;
        const payload = getTraitDragData(e.dataTransfer);
        if (!payload || payload.typeId !== TraitTypeId.TodoItem) return;
        const data = payload.data as { id: string };
        if (data.id !== item.id) {
            pageModel.moveItem(data.id, item.id);
        }
    }, [item.id, isDraggable, pageModel]);

    const nodeRef = useRef<HTMLDivElement | null>(null);
    const setNodeRef = useCallback(
        (node: HTMLDivElement | null) => {
            nodeRef.current = node;
            if (cellRef) {
                (cellRef as { current: HTMLDivElement | null }).current = node;
            }
        },
        [cellRef]
    );

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
                icon: tag.color ? <Dot size="sm" color={tag.color} /> : undefined,
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
        <div
            ref={setNodeRef}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
                width: "100%",
                height: "fit-content",
                opacity: isDragging ? 0.4 : 1,
                backgroundColor: isOver ? color.background.light : undefined,
            }}
        >
            <Panel
                revealChildrenOnHover
                position="relative"
                paddingTop="sm"
                paddingBottom="sm"
                paddingLeft="xxxl"
                paddingRight="md"
            >
                <div
                    style={{
                        position: "absolute",
                        left: 8,
                        top: 4,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 2,
                    }}
                >
                    <span
                        onClick={handleCheckbox}
                        title={item.done ? "Mark as undone" : "Mark as done"}
                        style={{
                            cursor: "pointer",
                            marginTop: 2,
                            color: color.text.light,
                            opacity: 0.5,
                            display: "inline-flex",
                        }}
                    >
                        {item.done
                            ? <CheckedIcon style={{ width: 16, height: 16 }} />
                            : <UncheckedIcon style={{ width: 16, height: 16 }} />}
                    </span>
                    {isDraggable && (
                        <span
                            data-visibility="parent-hover"
                            title="Drag to reorder"
                            draggable
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                            style={{
                                cursor: "grab",
                                color: color.icon.light,
                                display: "inline-flex",
                            }}
                        >
                            <DragHandleIcon style={{ width: 12, height: 12 }} />
                        </span>
                    )}
                </div>

                <Panel direction="row" gap="md" minHeight={26} flex={1} minWidth={0}>
                    <Panel direction="column" gap="xs" flex={1} minWidth={0}>
                        <div
                            onKeyDown={handleTitleKeyDown}
                            style={{ opacity: item.done ? 0.6 : 1 }}
                        >
                            <Textarea
                                variant="ghost"
                                singleLine
                                value={item.title}
                                onChange={handleTitleChange}
                                placeholder="(untitled)"
                            />
                        </div>
                        {item.comment !== null ? (
                            <Textarea
                                variant="ghost"
                                size="sm"
                                value={item.comment}
                                onChange={handleCommentChange}
                                onBlur={handleCommentBlur}
                                placeholder="Add a comment..."
                                maxHeight={120}
                            />
                        ) : (
                            <span
                                data-visibility="parent-hover"
                                onClick={handleAddComment}
                                style={{
                                    fontSize: 11,
                                    cursor: "pointer",
                                    color: color.text.light,
                                    alignSelf: "flex-start",
                                    padding: "0 4px",
                                }}
                            >
                                + Add comment
                            </span>
                        )}
                    </Panel>

                    <Panel direction="column" align="end" minWidth={100} shrink={false}>
                        <Panel direction="row" align="center" gap="xs" alignSelf="stretch">
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <WithMenu items={tagMenuItems}>
                                    {(setOpen) =>
                                        item.tag ? (
                                            <span
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpen(e.currentTarget);
                                                }}
                                                style={{
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    gap: 4,
                                                    fontSize: 11,
                                                    cursor: "pointer",
                                                    color: color.text.light,
                                                }}
                                            >
                                                {tagDef?.color && <Dot size="sm" color={tagDef.color} />}
                                                {item.tag}
                                            </span>
                                        ) : (
                                            <span
                                                data-visibility="parent-hover"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpen(e.currentTarget);
                                                }}
                                                style={{
                                                    fontSize: 11,
                                                    cursor: "pointer",
                                                    color: color.text.light,
                                                }}
                                            >
                                                + tag
                                            </span>
                                        )
                                    }
                                </WithMenu>
                            </div>
                            <IconButton
                                hideUntilParentHover
                                size="sm"
                                icon={<DeleteIcon />}
                                title="Delete item"
                                onClick={handleDelete}
                            />
                        </Panel>
                        <span
                            data-visibility="parent-hover"
                            title={
                                `Created: ${formatDate(item.createdDate)}` +
                                (item.doneDate ? `\nDone: ${formatDate(item.doneDate)}` : "")
                            }
                            style={{
                                fontSize: 11,
                                color: color.text.light,
                                whiteSpace: "nowrap",
                                height: 20,
                                lineHeight: "20px",
                                alignSelf: "flex-start",
                            }}
                        >
                            {dateInfo}
                        </span>
                    </Panel>
                </Panel>
            </Panel>
        </div>
    );
}

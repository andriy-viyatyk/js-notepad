import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel } from "../../uikit/Panel/Panel";
import { Textarea } from "../../uikit/Textarea/Textarea";
import { IconButton } from "../../uikit/IconButton/IconButton";
import { Splitter } from "../../uikit/Splitter/Splitter";
import { RenderFlexGrid, RenderGridModel } from "../../uikit/RenderGrid";
import type { RenderFlexCellParams, Percent } from "../../uikit/RenderGrid";
import color from "../../theme/color";
import { PlusIcon } from "../../theme/icons";
import { EditorError } from "../base/EditorError";
import { TodoListPanel } from "./components/TodoListPanel";
import { TodoItemView } from "./components/TodoItemView";
import type { TodoItem } from "./todoTypes";
import type { TodoEditor } from "./TodoEditor";

const getColumnWidth = () => "100%" as Percent;

export function TodoBody({ model: editor }: { model: TodoEditor }) {
    const pageState = editor.state.use((s) => ({
        data: s.data,
        error: s.error,
        leftPanelWidth: s.leftPanelWidth,
        listCounts: s.listCounts,
        selectedList: s.selectedList,
        selectedTag: s.selectedTag,
        filteredItems: s.filteredItems,
    }));

    const allItems = pageState.data.items;
    const tags = pageState.data.tags;
    const items = pageState.filteredItems;
    const [quickAddText, setQuickAddText] = useState("");

    const gridModelRef = useRef<RenderGridModel | null>(null);
    const setGridModel = useCallback((m: RenderGridModel | null) => {
        gridModelRef.current = m;
        editor.setGridModel(m);
    }, [editor]);

    useEffect(() => {
        gridModelRef.current?.update({ all: true });
    }, [items, tags]);

    const separatorIndex = useMemo(() => {
        const firstDoneIndex = items.findIndex((item: TodoItem) => item.done);
        if (firstDoneIndex > 0) return firstDoneIndex;
        return -1;
    }, [items]);

    const rowCount = items.length + (separatorIndex >= 0 ? 1 : 0);

    const getItemForRow = useCallback(
        (row: number): TodoItem | undefined => {
            if (separatorIndex >= 0 && row === separatorIndex) return undefined;
            const itemIndex =
                separatorIndex >= 0 && row > separatorIndex ? row - 1 : row;
            return items[itemIndex];
        },
        [items, separatorIndex],
    );

    const getInitialRowHeight = useCallback(
        (row: number) => {
            const item = getItemForRow(row);
            if (!item) return undefined;
            return editor.getItemHeight(item.id);
        },
        [getItemForRow, editor],
    );

    const handleQuickAdd = useCallback(() => {
        const trimmed = quickAddText.trim();
        if (trimmed) {
            editor.addItem(trimmed);
            setQuickAddText("");
        }
    }, [editor, quickAddText]);

    const handleQuickAddKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter") {
                e.preventDefault();
                handleQuickAdd();
            }
        },
        [handleQuickAdd],
    );

    const renderTodoCell = useCallback(
        (p: RenderFlexCellParams) => {
            if (separatorIndex >= 0 && p.row === separatorIndex) {
                return (
                    <div
                        ref={p.ref}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            width: "100%",
                            height: "fit-content",
                            gap: 8,
                            padding: "4px 20%",
                            color: color.text.light,
                            fontSize: 11,
                        }}
                    >
                        <div style={{ flex: 1, borderBottom: `1px solid ${color.border.default}` }} />
                        Done
                        <div style={{ flex: 1, borderBottom: `1px solid ${color.border.default}` }} />
                    </div>
                );
            }

            const item = getItemForRow(p.row);
            if (!item) return null;

            return (
                <TodoItemView
                    key={item.id}
                    item={item}
                    tags={tags}
                    pageModel={editor}
                    cellRef={p.ref}
                />
            );
        },
        [getItemForRow, separatorIndex, editor, tags],
    );

    // Queue focus event: kept for Tier-5 symmetry. Today's TodoEditor
    // has no explicit refocus behavior; harmless no-op.
    editor.queue.use((ev) => {
        if (ev.type === "focus") {
            // No-op for now. Symmetric with MO7 / GR10 / LV8 / LK10.
        }
    });

    if (pageState.error) {
        return <EditorError>{pageState.error}</EditorError>;
    }

    const isQuickAddDisabled = !pageState.selectedList;

    return (
        <Panel name="todo-root" direction="row" flex={1} overflow="hidden">
            <Panel
                name="todo-left-panel"
                direction="column"
                minWidth={100}
                maxWidth="80%"
                overflow="hidden"
                background="default"
                width={pageState.leftPanelWidth}
                shrink={false}
            >
                <TodoListPanel
                    pageModel={editor}
                    lists={pageState.data.lists}
                    selectedList={pageState.selectedList}
                    listCounts={pageState.listCounts}
                    tags={pageState.data.tags}
                    selectedTag={pageState.selectedTag}
                />
            </Panel>
            <Splitter
                name="todo-splitter"
                orientation="vertical"
                value={pageState.leftPanelWidth}
                onChange={editor.setLeftPanelWidth}
                border="after"
                min={100}
            />
            <Panel name="todo-content" direction="column" flex={1} minWidth={0} overflow="hidden">
                <Panel
                    name="todo-quick-add-row"
                    direction="row"
                    gap="xs"
                    paddingX="sm"
                    paddingY="xs"
                    align="center"
                    shrink={false}
                >
                    <div
                        onKeyDown={handleQuickAddKeyDown}
                        style={{ flex: 1, minWidth: 0 }}
                    >
                        <Textarea
                            name="todo-quick-add"
                            value={quickAddText}
                            onChange={setQuickAddText}
                            singleLine
                            placeholder={
                                isQuickAddDisabled
                                    ? "Select a list to add items..."
                                    : "Add new todo item..."
                            }
                            readOnly={isQuickAddDisabled}
                        />
                    </div>
                    <IconButton
                        name="todo-add-item"
                        size="sm"
                        icon={<PlusIcon />}
                        title="Add item"
                        onClick={handleQuickAdd}
                        disabled={isQuickAddDisabled}
                    />
                </Panel>

                {allItems.length === 0 ? (
                    <div
                        style={{
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 16,
                            padding: 16,
                            color: color.text.light,
                            fontSize: 14,
                        }}
                    >
                        <div style={{ fontSize: 24, color: color.text.default }}>ToDo</div>
                        <div>No items yet</div>
                        <div>Create a list, then add your first todo item</div>
                    </div>
                ) : items.length === 0 ? (
                    <div
                        style={{
                            flex: 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 16,
                            color: color.text.light,
                            fontSize: 14,
                        }}
                    >
                        No items match the current filter
                    </div>
                ) : (
                    <Panel direction="column" flex={1} minHeight={0}>
                        <RenderFlexGrid
                            ref={setGridModel}
                            columnCount={1}
                            rowCount={rowCount}
                            columnWidth={getColumnWidth}
                            renderCell={renderTodoCell}
                            fitToWidth
                            minRowHeight={34}
                            maxRowHeight={400}
                            getInitialRowHeight={getInitialRowHeight}
                        />
                    </Panel>
                )}
            </Panel>
        </Panel>
    );
}

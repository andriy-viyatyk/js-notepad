import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Panel } from "../../uikit/Panel/Panel";
import { Input } from "../../uikit/Input/Input";
import { Textarea } from "../../uikit/Textarea/Textarea";
import { IconButton } from "../../uikit/IconButton/IconButton";
import { Splitter } from "../../uikit/Splitter/Splitter";
import { RenderFlexGrid, RenderGridModel } from "../../uikit/RenderGrid";
import type { RenderFlexCellParams, Percent } from "../../uikit/RenderGrid";
import color from "../../theme/color";
import { CloseIcon, PlusIcon } from "../../theme/icons";
import { TodoViewModel, defaultTodoEditorState, TodoEditorState } from "./TodoViewModel";
import { TodoEditorProps, TodoItem } from "./todoTypes";
import { TodoListPanel } from "./components/TodoListPanel";
import { TodoItemView } from "./components/TodoItemView";
import { EditorError } from "../base/EditorError";
import { useContentViewModel } from "../base/useContentViewModel";

const noopUnsubscribe = () => () => {};
const getDefaultState = () => defaultTodoEditorState;
const getColumnWidth = () => "100%" as Percent;

export function TodoEditor({ model }: TodoEditorProps) {
    const vm = useContentViewModel<TodoViewModel>(model, "todo-view");

    const gridModelRef = useRef<RenderGridModel | null>(null);
    const setGridModel = useCallback((m: RenderGridModel | null) => {
        gridModelRef.current = m;
    }, []);

    const pageState: TodoEditorState = useSyncExternalStore(
        vm ? (cb) => vm.state.subscribe(cb) : noopUnsubscribe,
        vm ? () => vm.state.get() : getDefaultState,
    );

    const allItems = pageState.data.items;
    const tags = pageState.data.tags;
    const items = pageState.filteredItems;
    const [quickAddText, setQuickAddText] = useState("");

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
                separatorIndex >= 0 && row > separatorIndex
                    ? row - 1
                    : row;
            return items[itemIndex];
        },
        [items, separatorIndex]
    );

    const getInitialRowHeight = useCallback(
        (row: number) => {
            const item = getItemForRow(row);
            if (!item) return undefined;
            return vm.getItemHeight(item.id);
        },
        [getItemForRow, vm]
    );

    const handleQuickAdd = useCallback(() => {
        const trimmed = quickAddText.trim();
        if (trimmed) {
            vm.addItem(trimmed);
            setQuickAddText("");
        }
    }, [vm, quickAddText]);

    const handleQuickAddKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter") {
                e.preventDefault();
                handleQuickAdd();
            }
        },
        [handleQuickAdd]
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
                    pageModel={vm}
                    cellRef={p.ref}
                />
            );
        },
        [getItemForRow, separatorIndex, vm, tags]
    );

    if (!vm) return null;

    if (pageState.error) {
        return <EditorError>{pageState.error}</EditorError>;
    }

    const isQuickAddDisabled = !pageState.selectedList;

    return (
        <>
            {Boolean(model.editorToolbarRefLast) &&
                createPortal(
                    <Input
                        name="todo-search"
                        value={pageState.searchText}
                        onChange={vm.setSearchText}
                        placeholder="Search..."
                        endSlot={
                            pageState.searchText ? (
                                <IconButton
                                    name="todo-search-clear"
                                    size="sm"
                                    icon={<CloseIcon />}
                                    title="Clear search"
                                    onClick={vm.clearSearch}
                                />
                            ) : null
                        }
                    />,
                    model.editorToolbarRefLast
                )}
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
                        pageModel={vm}
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
                    onChange={vm.setLeftPanelWidth}
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
            {Boolean(model.editorFooterRefLast) &&
                createPortal(
                    <span>
                        {items.length === allItems.length
                            ? `${allItems.length} items`
                            : `${items.length} of ${allItems.length} items`}
                    </span>,
                    model.editorFooterRefLast
                )}
        </>
    );
}

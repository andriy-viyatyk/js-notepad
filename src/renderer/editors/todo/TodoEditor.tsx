import styled from "@emotion/styled";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../components/basic/Button";
import { TextField } from "../../components/basic/TextField";
import { HighlightedTextProvider } from "../../components/basic/useHighlightedText";
import { Splitter } from "../../components/layout/Splitter";
import {
    RenderFlexCellParams,
    RenderFlexGrid,
} from "../../components/virtualization/RenderGrid/RenderFlexGrid";
import { Percent } from "../../components/virtualization/RenderGrid/types";
import { useComponentModel } from "../../core/state/model";
import color from "../../theme/color";
import { CloseIcon, PlusIcon } from "../../theme/icons";
import { defaultTodoEditorState, TodoEditorModel } from "./TodoEditorModel";
import { TodoEditorProps, TodoItem } from "./todoTypes";
import { TodoListPanel } from "./components/TodoListPanel";
import { TodoItemView } from "./components/TodoItemView";
import { EditorError } from "../base/EditorError";

// =============================================================================
// Styles
// =============================================================================

const TodoEditorRoot = styled.div({
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "row",
    overflow: "hidden",
    "& .left-panel": {
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        backgroundColor: color.background.default,
        minWidth: 100,
        maxWidth: "80%",
    },
    "& .center-panel": {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
    },
    "& .quick-add-row": {
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 8px",
        marginBottom: 16,
        flexShrink: 0,
    },
    "& .quick-add-input": {
        flex: "1 1 auto",
        minWidth: 0,
        "& input": {
            backgroundColor: color.background.default,
            "&:focus": {
                backgroundColor: color.background.dark,
            },
        },
    },
    "& .items-grid": {
        flex: 1,
    },
    "& .done-separator": {
        display: "flex",
        alignItems: "center",
        width: "100%",
        height: "fit-content",
        gap: 8,
        padding: "4px 20%",
        color: color.text.light,
        fontSize: 11,
        "&::before, &::after": {
            content: "''",
            flex: 1,
            borderBottom: `1px solid ${color.border.default}`,
        },
    },
    "& .empty-state": {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 16,
        color: color.text.light,
        fontSize: 14,
    },
    "& .title": {
        fontSize: 24,
        color: color.text.default,
    },
    "& .subtitle": {
        color: color.text.light,
    },
});

const SearchField = styled(TextField)({
    "& input": {
        color: color.misc.blue,
    },
});

// =============================================================================
// Component
// =============================================================================

const getColumnWidth = () => "100%" as Percent;

export function TodoEditor(props: TodoEditorProps) {
    const { model } = props;
    const pageModel = useComponentModel(
        props,
        TodoEditorModel,
        defaultTodoEditorState
    );
    const state = model.state.use();
    const pageState = pageModel.state.use();
    const allItems = pageState.data.items;
    const tags = pageState.data.tags;
    const items = pageState.filteredItems;
    const [quickAddText, setQuickAddText] = useState("");

    useEffect(() => {
        pageModel.init();
        return () => pageModel.dispose();
    }, []);

    useEffect(() => {
        pageModel.updateContent(state.content || "");
    }, [state.content]);

    // Re-render all grid cells when items or tags change
    useEffect(() => {
        pageModel.gridModel?.update({ all: true });
    }, [items, tags]);

    // Compute separator position between undone and done items
    const separatorIndex = useMemo(() => {
        const firstDoneIndex = items.findIndex((item) => item.done);
        // Show separator only if there are both undone and done items
        if (firstDoneIndex > 0) return firstDoneIndex;
        return -1;
    }, [items]);

    const rowCount = items.length + (separatorIndex >= 0 ? 1 : 0);

    // Map grid row to item (accounts for separator row offset)
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

    // Provide stored heights to RenderFlexGrid for initial row sizing
    const getInitialRowHeight = useCallback(
        (row: number) => {
            const item = getItemForRow(row);
            if (!item) return undefined;
            return pageModel.getItemHeight(item.id);
        },
        [getItemForRow, pageModel]
    );

    // Quick add
    const handleQuickAdd = useCallback(() => {
        const trimmed = quickAddText.trim();
        if (trimmed) {
            pageModel.addItem(trimmed);
            setQuickAddText("");
        }
    }, [quickAddText, pageModel]);

    const handleQuickAddKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter") {
                handleQuickAdd();
            }
        },
        [handleQuickAdd]
    );

    // Render cell
    const renderTodoCell = useCallback(
        (p: RenderFlexCellParams) => {
            // Separator row
            if (separatorIndex >= 0 && p.row === separatorIndex) {
                return (
                    <div ref={p.ref} className="done-separator">
                        Done
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
                    pageModel={pageModel}
                    cellRef={p.ref}
                />
            );
        },
        [getItemForRow, separatorIndex, pageModel, tags]
    );

    if (pageState.error) {
        return (
            <TodoEditorRoot>
                <EditorError>{pageState.error}</EditorError>
            </TodoEditorRoot>
        );
    }

    const isQuickAddDisabled = !pageState.selectedList;

    return (
        <>
            {Boolean(model.editorToolbarRefLast) &&
                createPortal(
                    <SearchField
                        value={pageState.searchText}
                        onChange={pageModel.setSearchText}
                        placeholder="Search..."
                        endButtons={
                            pageState.searchText
                                ? [
                                      <Button
                                          key="clear"
                                          size="small"
                                          type="icon"
                                          title="Clear search"
                                          onClick={pageModel.clearSearch}
                                      >
                                          <CloseIcon />
                                      </Button>,
                                  ]
                                : undefined
                        }
                    />,
                    model.editorToolbarRefLast
                )}
            <TodoEditorRoot>
                <div
                    className="left-panel"
                    style={{ width: pageState.leftPanelWidth }}
                >
                    <TodoListPanel
                        pageModel={pageModel}
                        lists={pageState.data.lists}
                        selectedList={pageState.selectedList}
                        listCounts={pageState.listCounts}
                        tags={pageState.data.tags}
                        selectedTag={pageState.selectedTag}
                    />
                </div>
                <Splitter
                    type="vertical"
                    initialWidth={pageState.leftPanelWidth}
                    onChangeWidth={pageModel.setLeftPanelWidth}
                    borderSized="right"
                />
                <HighlightedTextProvider value={pageState.searchText}>
                    <div className="center-panel">
                        {/* Quick-add input */}
                        <div className="quick-add-row">
                            <TextField
                                className="quick-add-input"
                                value={quickAddText}
                                onChange={setQuickAddText}
                                onKeyDown={handleQuickAddKeyDown}
                                placeholder={
                                    isQuickAddDisabled
                                        ? "Select a list to add items..."
                                        : "Add new todo item..."
                                }
                                disabled={isQuickAddDisabled}
                            />
                            <Button
                                size="small"
                                type="icon"
                                title="Add item"
                                onClick={handleQuickAdd}
                                disabled={
                                    isQuickAddDisabled || !quickAddText.trim()
                                }
                            >
                                <PlusIcon />
                            </Button>
                        </div>

                        {/* Items */}
                        {allItems.length === 0 ? (
                            <div className="empty-state">
                                <div className="title">ToDo</div>
                                <div className="subtitle">No items yet</div>
                                <div className="subtitle">
                                    Create a list, then add your first todo item
                                </div>
                            </div>
                        ) : items.length === 0 ? (
                            <div className="empty-state">
                                <div className="subtitle">
                                    No items match the current filter
                                </div>
                            </div>
                        ) : (
                            <RenderFlexGrid
                                ref={pageModel.setGridModel}
                                className="items-grid"
                                columnCount={1}
                                rowCount={rowCount}
                                columnWidth={getColumnWidth}
                                renderCell={renderTodoCell}
                                fitToWidth
                                minRowHeight={34}
                                maxRowHeight={400}
                                getInitialRowHeight={getInitialRowHeight}
                            />
                        )}
                    </div>
                </HighlightedTextProvider>
            </TodoEditorRoot>
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

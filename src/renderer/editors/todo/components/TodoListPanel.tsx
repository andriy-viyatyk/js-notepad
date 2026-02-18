import styled from "@emotion/styled";
import React, { useCallback, useRef, useState } from "react";
import clsx from "clsx";
import color from "../../../theme/color";
import { PlusIcon, DeleteIcon, RenameIcon, CircleIcon } from "../../../theme/icons";
import { Button } from "../../../components/basic/Button";
import { TextField } from "../../../components/basic/TextField";
import { WithPopupMenu } from "../../../components/overlay/WithPopupMenu";
import { MenuItem } from "../../../components/overlay/PopupMenu";
import { TodoEditorModel } from "../TodoEditorModel";
import { ListCount, TodoTag } from "../todoTypes";
import { TAG_COLORS } from "../todoColors";

// =============================================================================
// Styles
// =============================================================================

const TodoListPanelRoot = styled.div({
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    flex: 1,

    "& .add-row": {
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 8px",
        flexShrink: 0,
        backgroundColor: color.background.default,
    },
    "& .add-input": {
        flex: "1 1 auto",
        minWidth: 0,
        "& input": {
            backgroundColor: color.background.default,
            "&:focus": {
                backgroundColor: color.background.dark,
            },
        },
    },
    "& .section-items": {
        flex: 1,
        overflowY: "auto",
        overflowX: "hidden",
    },
    "& .section-label": {
        fontSize: 13,
        color: color.text.light,
        opacity: 0.6,
        padding: "6px 8px 2px",
        textTransform: "uppercase",
        textAlign: "center",
    },
    "& .list-item": {
        display: "flex",
        alignItems: "center",
        padding: "0 8px",
        minHeight: 28,
        cursor: "pointer",
        fontSize: 13,
        color: color.text.light,
        gap: 4,
        "&:hover": {
            backgroundColor: color.background.light,
        },
        "&:hover .list-actions": {
            opacity: 1,
        },
        "&.selected": {
            color: color.misc.blue,
            backgroundColor: color.background.light,
        },
    },
    "& .list-name": {
        flex: "1 1 auto",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    "& .list-count": {
        flexShrink: 0,
        fontSize: 11,
        opacity: 0.7,
    },
    "& .list-actions": {
        display: "flex",
        opacity: 0,
        flexShrink: 0,
    },
    "& .rename-input": {
        flex: "1 1 auto",
        minWidth: 0,
    },
    "& .tag-dot": {
        width: 8,
        height: 8,
        borderRadius: "50%",
        flexShrink: 0,
    },
    "& .color-swatch": {
        width: 14,
        height: 14,
        borderRadius: 3,
        cursor: "pointer",
        flexShrink: 0,
        border: `1px solid ${color.border.default}`,
    },
});

// =============================================================================
// Component
// =============================================================================

interface TodoListPanelProps {
    pageModel: TodoEditorModel;
    lists: string[];
    selectedList: string;
    listCounts: { [listName: string]: ListCount };
    tags: TodoTag[];
    selectedTag: string;
}

export function TodoListPanel({ pageModel, lists, selectedList, listCounts, tags, selectedTag }: TodoListPanelProps) {
    // --- List state ---
    const [newListName, setNewListName] = useState("");
    const [renamingList, setRenamingList] = useState<string | null>(null);
    const [renameListValue, setRenameListValue] = useState("");
    const renameListInputRef = useRef<HTMLInputElement>(null);

    // --- Tag state ---
    const [newTagName, setNewTagName] = useState("");
    const [renamingTag, setRenamingTag] = useState<string | null>(null);
    const [renameTagValue, setRenameTagValue] = useState("");
    const renameTagInputRef = useRef<HTMLInputElement>(null);

    // =========================================================================
    // List handlers
    // =========================================================================

    const handleAddList = useCallback(() => {
        if (newListName.trim()) {
            const added = pageModel.addList(newListName.trim());
            if (added) {
                setNewListName("");
            }
        }
    }, [newListName, pageModel]);

    const handleAddListKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleAddList();
        }
    }, [handleAddList]);

    const handleStartListRename = useCallback((e: React.MouseEvent, listName: string) => {
        e.stopPropagation();
        setRenamingList(listName);
        setRenameListValue(listName);
        setTimeout(() => renameListInputRef.current?.focus(), 0);
    }, []);

    const handleListRenameSubmit = useCallback(() => {
        if (renamingList && renameListValue.trim()) {
            pageModel.renameList(renamingList, renameListValue.trim());
        }
        setRenamingList(null);
    }, [renamingList, renameListValue, pageModel]);

    const handleListRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleListRenameSubmit();
        } else if (e.key === "Escape") {
            setRenamingList(null);
        }
    }, [handleListRenameSubmit]);

    const handleDeleteList = useCallback((e: React.MouseEvent, listName: string) => {
        e.stopPropagation();
        pageModel.deleteList(listName);
    }, [pageModel]);

    // =========================================================================
    // Tag handlers
    // =========================================================================

    const handleAddTag = useCallback(() => {
        if (newTagName.trim()) {
            const added = pageModel.addTag(newTagName.trim());
            if (added) {
                setNewTagName("");
            }
        }
    }, [newTagName, pageModel]);

    const handleAddTagKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleAddTag();
        }
    }, [handleAddTag]);

    const handleStartTagRename = useCallback((e: React.MouseEvent, tagName: string) => {
        e.stopPropagation();
        setRenamingTag(tagName);
        setRenameTagValue(tagName);
        setTimeout(() => renameTagInputRef.current?.focus(), 0);
    }, []);

    const handleTagRenameSubmit = useCallback(() => {
        if (renamingTag && renameTagValue.trim()) {
            pageModel.renameTag(renamingTag, renameTagValue.trim());
        }
        setRenamingTag(null);
    }, [renamingTag, renameTagValue, pageModel]);

    const handleTagRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleTagRenameSubmit();
        } else if (e.key === "Escape") {
            setRenamingTag(null);
        }
    }, [handleTagRenameSubmit]);

    const handleDeleteTag = useCallback((e: React.MouseEvent, tagName: string) => {
        e.stopPropagation();
        pageModel.deleteTag(tagName);
    }, [pageModel]);

    const handleTagColorChange = useCallback((tagName: string, newColor: string) => {
        pageModel.updateTagColor(tagName, newColor);
    }, [pageModel]);

    // =========================================================================
    // Helpers
    // =========================================================================

    const renderCount = (count: ListCount | undefined) => {
        if (!count) return "0/0";
        return <><b>{count.undone}</b>/{count.total}</>;
    };

    const getColorMenuItems = (tagName: string, currentColor: string): MenuItem[] => {
        const items: MenuItem[] = TAG_COLORS.map((c) => ({
            label: c.name,
            icon: <span style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                backgroundColor: c.hex,
            }} />,
            onClick: () => handleTagColorChange(tagName, c.hex),
            selected: currentColor === c.hex,
        }));
        items.push({
            label: "No color",
            startGroup: true,
            onClick: () => handleTagColorChange(tagName, ""),
        });
        return items;
    };

    // =========================================================================
    // Render
    // =========================================================================

    return (
        <TodoListPanelRoot>
            {/* Add list row */}
            <div className="add-row">
                <TextField
                    className="add-input"
                    value={newListName}
                    onChange={setNewListName}
                    onKeyDown={handleAddListKeyDown}
                    placeholder="New list..."
                />
                <Button
                    size="small"
                    type="icon"
                    title="Add list"
                    onClick={handleAddList}
                    disabled={!newListName.trim()}
                >
                    <PlusIcon />
                </Button>
            </div>

            <div className="section-items">
                {/* ============== Lists Section ============== */}
                <div className="section-label">Lists</div>
                {/* "All" option */}
                <div
                    className={clsx("list-item", selectedList === "" && "selected")}
                    onClick={() => pageModel.setSelectedList("")}
                >
                    <span className="list-name">All</span>
                    <span className="list-count">{renderCount(listCounts[""])}</span>
                </div>
                {/* Named lists */}
                {lists.map((listName) => (
                    <div
                        key={listName}
                        className={clsx("list-item", selectedList === listName && "selected")}
                        onClick={() => pageModel.setSelectedList(listName)}
                    >
                        {renamingList === listName ? (
                            <TextField
                                ref={renameListInputRef}
                                className="rename-input"
                                value={renameListValue}
                                onChange={setRenameListValue}
                                onKeyDown={handleListRenameKeyDown}
                                onBlur={handleListRenameSubmit}
                                onClick={(e) => e.stopPropagation()}
                            />
                        ) : (
                            <>
                                <span className="list-name" title={listName}>{listName}</span>
                                <span className="list-actions">
                                    <Button
                                        size="small"
                                        type="icon"
                                        title="Rename list"
                                        onClick={(e) => handleStartListRename(e, listName)}
                                    >
                                        <RenameIcon />
                                    </Button>
                                    <Button
                                        size="small"
                                        type="icon"
                                        title="Delete list"
                                        onClick={(e) => handleDeleteList(e, listName)}
                                    >
                                        <DeleteIcon />
                                    </Button>
                                </span>
                                <span className="list-count">{renderCount(listCounts[listName])}</span>
                            </>
                        )}
                    </div>
                ))}

                {/* ============== Tags Section ============== */}
                <div className="section-label">Tags</div>

                {/* "All Tags" option */}
                <div
                    className={clsx("list-item", selectedTag === "" && "selected")}
                    onClick={() => pageModel.setSelectedTag("")}
                >
                    <span className="list-name">All Tags</span>
                </div>

                {/* Tag items */}
                {tags.map((tag) => (
                    <div
                        key={tag.name}
                        className={clsx("list-item", selectedTag === tag.name && "selected")}
                        onClick={() => pageModel.setSelectedTag(tag.name)}
                    >
                        {renamingTag === tag.name ? (
                            <TextField
                                ref={renameTagInputRef}
                                className="rename-input"
                                value={renameTagValue}
                                onChange={setRenameTagValue}
                                onKeyDown={handleTagRenameKeyDown}
                                onBlur={handleTagRenameSubmit}
                                onClick={(e) => e.stopPropagation()}
                            />
                        ) : (
                            <>
                                {tag.color ? (
                                    <span
                                        className="tag-dot"
                                        style={{ backgroundColor: tag.color }}
                                    />
                                ) : (
                                    <CircleIcon style={{ width: 8, height: 8, opacity: 0.3 }} />
                                )}
                                <span className="list-name" title={tag.name}>{tag.name}</span>
                                <span className="list-actions">
                                    <WithPopupMenu items={getColorMenuItems(tag.name, tag.color)}>
                                        {(openMenu) => (
                                            <Button
                                                size="small"
                                                type="icon"
                                                title="Change color"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openMenu(e.currentTarget);
                                                }}
                                            >
                                                <span
                                                    className="color-swatch"
                                                    style={{ backgroundColor: tag.color || color.text.light }}
                                                />
                                            </Button>
                                        )}
                                    </WithPopupMenu>
                                    <Button
                                        size="small"
                                        type="icon"
                                        title="Rename tag"
                                        onClick={(e) => handleStartTagRename(e, tag.name)}
                                    >
                                        <RenameIcon />
                                    </Button>
                                    <Button
                                        size="small"
                                        type="icon"
                                        title="Delete tag"
                                        onClick={(e) => handleDeleteTag(e, tag.name)}
                                    >
                                        <DeleteIcon />
                                    </Button>
                                </span>
                            </>
                        )}
                    </div>
                ))}
            </div>

            {/* Add tag row */}
            <div className="add-row">
                <TextField
                    className="add-input"
                    value={newTagName}
                    onChange={setNewTagName}
                    onKeyDown={handleAddTagKeyDown}
                    placeholder="New tag..."
                />
                <Button
                    size="small"
                    type="icon"
                    title="Add tag"
                    onClick={handleAddTag}
                    disabled={!newTagName.trim()}
                >
                    <PlusIcon />
                </Button>
            </div>
        </TodoListPanelRoot>
    );
}
